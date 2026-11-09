"""Conversations and messages (PLAN 8.9).

Other modules may call:
* ``ensure_case_conversation(db, case_id)`` - get-or-create the case conversation and add every case party
  as participant (idempotent; no commit).
* ``notify(...)`` / ``notify_many(...)`` re-exported from ``app.modules.messaging.notifications``.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, and_, func, or_, select, text, true, update
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import ConversationKind, UserRole
from app.core.errors import BadRequest, NotFound
from app.core.events import publish
from app.core.ids import uuid7
from app.models import Case, Conversation, ConversationParticipant, Document, Message, Notification, User
from app.modules.messaging import policies
from app.modules.messaging.notifications import notify, notify_many
from app.modules.messaging.schemas import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
    ParticipantOut,
    UserRef,
)

__all__ = [
    "create_conversation",
    "ensure_case_conversation",
    "get_conversation_for_user",
    "list_conversations",
    "list_messages",
    "mark_conversation_read",
    "message_out",
    "notify",
    "notify_many",
    "send_message",
]

DEFAULT_MESSAGE_LIMIT = 50
MAX_MESSAGE_LIMIT = 100


# -------------------------------------------------------------------------------------------------- helpers
async def _add_participants(
    db: AsyncSession, conversation_id: uuid.UUID, user_ids: Sequence[uuid.UUID]
) -> None:
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return
    stmt = (
        pg_insert(ConversationParticipant)
        .values([{"conversation_id": conversation_id, "user_id": uid} for uid in ids])
        .on_conflict_do_nothing(index_elements=["conversation_id", "user_id"])
    )
    await db.execute(stmt)


async def _participant_ids(db: AsyncSession, conversation_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (
            await db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation_id
                )
            )
        )
        .scalars()
        .all()
    )


def _user_ref(user: User | None) -> UserRef | None:
    if user is None:
        return None
    return UserRef(id=user.id, full_name=user.full_name or "", role=user.role)


def _sender(users: dict[uuid.UUID, User], message: Message) -> User | None:
    return users.get(message.sender_user_id) if message.sender_user_id else None


def message_out(message: Message, sender: User | None) -> MessageOut:
    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender=_user_ref(sender),
        body=message.body,
        attachment_document_ids=list(message.attachment_document_ids or []),
        created_at=message.created_at,
        edited_at=message.edited_at,
        hidden=message.hidden_at is not None,
    )


def visible_messages(user: User) -> ColumnElement[bool]:
    """Moderation (CG-16): hidden messages are visible only to their sender and to staff."""
    if is_staff(user):
        return true()
    return or_(Message.hidden_at.is_(None), Message.sender_user_id == user.id)


async def _users_by_id(db: AsyncSession, ids: Sequence[uuid.UUID | None]) -> dict[uuid.UUID, User]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    rows = (await db.execute(select(User).where(User.id.in_(wanted)))).scalars().all()
    return {u.id: u for u in rows}


async def _build_outs(
    db: AsyncSession, user: User, conversations: Sequence[Conversation]
) -> list[ConversationOut]:
    if not conversations:
        return []
    conv_ids = [c.id for c in conversations]
    # participants
    part_rows = (
        await db.execute(
            select(ConversationParticipant, User)
            .join(User, User.id == ConversationParticipant.user_id)
            .where(ConversationParticipant.conversation_id.in_(conv_ids))
            .order_by(ConversationParticipant.created_at, ConversationParticipant.user_id)
        )
    ).all()
    participants: dict[uuid.UUID, list[ParticipantOut]] = {cid: [] for cid in conv_ids}
    my_last_read: dict[uuid.UUID, datetime | None] = {}
    for part, u in part_rows:
        participants[part.conversation_id].append(
            ParticipantOut(
                user_id=u.id, full_name=u.full_name or "", role=u.role, last_read_at=part.last_read_at
            )
        )
        if u.id == user.id:
            my_last_read[part.conversation_id] = part.last_read_at
    # last message per conversation
    last_ids = (
        select(Message.id)
        .ext(distinct_on(Message.conversation_id))
        .where(Message.conversation_id.in_(conv_ids), visible_messages(user))
        .order_by(Message.conversation_id, Message.created_at.desc(), Message.id.desc())
    )
    last_msgs = (await db.execute(select(Message).where(Message.id.in_(last_ids)))).scalars().all()
    senders = await _users_by_id(db, [m.sender_user_id for m in last_msgs])
    last_by_conv = {m.conversation_id: message_out(m, _sender(senders, m)) for m in last_msgs}
    # unread counts (messages from others after my last_read_at)
    lr = (
        select(ConversationParticipant.conversation_id, ConversationParticipant.last_read_at)
        .where(
            ConversationParticipant.user_id == user.id,
            ConversationParticipant.conversation_id.in_(conv_ids),
        )
        .subquery()
    )
    unread_rows = (
        await db.execute(
            select(Message.conversation_id, func.count())
            .join(lr, lr.c.conversation_id == Message.conversation_id)
            .where(
                or_(Message.sender_user_id.is_(None), Message.sender_user_id != user.id),
                or_(lr.c.last_read_at.is_(None), Message.created_at > lr.c.last_read_at),
                visible_messages(user),
            )
            .group_by(Message.conversation_id)
        )
    ).all()
    unread = {cid: int(n) for cid, n in unread_rows}
    # case numbers
    case_ids = [c.case_id for c in conversations if c.case_id is not None]
    case_numbers: dict[uuid.UUID, str] = {}
    if case_ids:
        case_numbers = {
            cid: num
            for cid, num in (
                await db.execute(select(Case.id, Case.case_number).where(Case.id.in_(case_ids)))
            ).all()
        }
    return [
        ConversationOut(
            id=c.id,
            kind=c.kind,
            case_id=c.case_id,
            case_number=case_numbers.get(c.case_id) if c.case_id else None,
            subject=c.subject,
            participants=participants.get(c.id, []),
            last_message=last_by_conv.get(c.id),
            unread_count=unread.get(c.id, 0) if c.id in my_last_read else 0,
            last_message_at=c.last_message_at,
            created_at=c.created_at,
        )
        for c in conversations
    ]


async def conversation_out(db: AsyncSession, user: User, conversation: Conversation) -> ConversationOut:
    return (await _build_outs(db, user, [conversation]))[0]


# ---------------------------------------------------------------------------------------- case conversation
async def ensure_case_conversation(db: AsyncSession, case_id: uuid.UUID) -> Conversation | None:
    """Get or create the conversation of ``case_id`` and sync its participants with the case parties.
    Returns ``None`` when the case does not exist. Does not commit."""
    case = await db.get(Case, case_id)
    if case is None:
        return None
    stmt = (
        pg_insert(Conversation)
        .values(
            id=uuid7(),
            kind=ConversationKind.CASE.value,
            case_id=case.id,
            subject=f"Case {case.case_number}",
        )
        .on_conflict_do_nothing(index_elements=["case_id"], index_where=text("kind = 'case'"))
    )
    await db.execute(stmt)
    conversation = (
        await db.execute(
            select(Conversation).where(
                Conversation.case_id == case.id, Conversation.kind == ConversationKind.CASE
            )
        )
    ).scalar_one()
    await _add_participants(db, conversation.id, await policies.case_party_user_ids(db, case))
    return conversation


# --------------------------------------------------------------------------------------------------- access
async def get_conversation_for_user(db: AsyncSession, user: User, conversation_id: uuid.UUID) -> Conversation:
    """Return the conversation if ``user`` may access it (404 otherwise). Case parties and staff who are not
    yet participants are not added here - only when they post or mark read."""
    conversation = await db.get(Conversation, conversation_id)
    if conversation is None:
        raise NotFound("Conversation not found")
    if await policies.is_participant(db, conversation.id, user.id) or is_staff(user):
        return conversation
    if conversation.case_id is not None:
        case = await db.get(Case, conversation.case_id)
        if case is not None and await policies.is_case_party(db, user, case):
            return conversation
    raise NotFound("Conversation not found")


async def _join_if_needed(db: AsyncSession, conversation: Conversation, user: User) -> None:
    if not await policies.is_participant(db, conversation.id, user.id):
        await _add_participants(db, conversation.id, [user.id])


# -------------------------------------------------------------------------------------------- list / create
async def list_conversations(
    db: AsyncSession,
    user: User,
    *,
    kind: ConversationKind | None = None,
    case_id: uuid.UUID | None = None,
    limit: int = 50,
) -> list[ConversationOut]:
    mine = select(ConversationParticipant.conversation_id).where(ConversationParticipant.user_id == user.id)
    visible: ColumnElement[bool] = Conversation.id.in_(mine)
    if policies.role_of(user) in (UserRole.SUPPORT.value, UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value):
        # The support desk sees every support conversation, joined or not.
        visible = or_(visible, Conversation.kind == ConversationKind.SUPPORT)
    stmt = select(Conversation).where(visible)
    if kind is not None:
        stmt = stmt.where(Conversation.kind == kind)
    if case_id is not None:
        stmt = stmt.where(Conversation.case_id == case_id)
    stmt = stmt.order_by(
        func.coalesce(Conversation.last_message_at, Conversation.created_at).desc(), Conversation.id.desc()
    ).limit(limit)
    conversations = (await db.execute(stmt)).scalars().all()
    return await _build_outs(db, user, conversations)


async def create_conversation(db: AsyncSession, user: User, body: ConversationCreate) -> ConversationOut:
    extra_ids = [uid for uid in dict.fromkeys(body.participant_user_ids) if uid != user.id]
    staff = is_staff(user)

    if body.case_id is not None:
        case = await db.get(Case, body.case_id)
        if case is None or not await policies.can_access_case(db, user, case):
            raise NotFound("Case not found")
        allowed = set(await policies.case_party_user_ids(db, case))
        if extra_ids:
            staff_ids = set(await policies.staff_user_ids(db, _STAFF))
            invalid = [uid for uid in extra_ids if uid not in allowed and uid not in staff_ids]
            if invalid:
                raise BadRequest(
                    "Some participants are not allowed in this case conversation",
                    code="invalid_participants",
                    details={"user_ids": [str(i) for i in invalid]},
                )
        conversation = await ensure_case_conversation(db, case.id)
        if conversation is None:  # pragma: no cover - the case was loaded above
            raise NotFound("Case not found")
        await _add_participants(db, conversation.id, [user.id, *extra_ids])
        if body.subject and staff:
            conversation.subject = body.subject
        await db.commit()
        return await conversation_out(db, user, conversation)

    # Support / direct conversation.
    if staff:
        targets = await policies.filter_active_user_ids(db, extra_ids)
        if len(targets) != len(extra_ids):
            raise BadRequest("Unknown or inactive participants", code="invalid_participants")
        kind = ConversationKind.DIRECT if targets else ConversationKind.SUPPORT
    else:
        staff_ids = set(await policies.staff_user_ids(db, _STAFF))
        invalid = [uid for uid in extra_ids if uid not in staff_ids]
        if invalid:
            raise BadRequest(
                "Support conversations may only include staff members",
                code="invalid_participants",
                details={"user_ids": [str(i) for i in invalid]},
            )
        targets = extra_ids
        kind = ConversationKind.SUPPORT
    now = datetime.now(UTC)
    conversation = Conversation(
        kind=kind,
        case_id=None,
        subject=body.subject or ("Support request" if kind == ConversationKind.SUPPORT else None),
        created_at=now,
        updated_at=now,
    )
    db.add(conversation)
    await db.flush()
    await _add_participants(db, conversation.id, [user.id, *targets])
    if kind == ConversationKind.SUPPORT and not staff and not targets:
        support_ids = await policies.staff_user_ids(db, [UserRole.SUPPORT])
        await notify_many(
            db,
            support_ids,
            "support.conversation_created",
            "New support conversation",
            f"{user.full_name or 'A user'} started a support conversation: {conversation.subject}",
            {"conversation_id": str(conversation.id), "link": f"/messages/{conversation.id}"},
            dedupe_key=f"support.conversation_created:{conversation.id}",
            email=False,
        )
    elif targets:
        await notify_many(
            db,
            targets,
            "conversation.created",
            "New conversation",
            f"{user.full_name or 'Someone'} started a conversation with you",
            {"conversation_id": str(conversation.id), "link": f"/messages/{conversation.id}"},
            dedupe_key=f"conversation.created:{conversation.id}",
            email=False,
        )
    await db.commit()
    return await conversation_out(db, user, conversation)


_STAFF = (UserRole.ADMIN.value, UserRole.FINANCE.value, UserRole.SUPPORT.value, UserRole.SUPER_ADMIN.value)


# ------------------------------------------------------------------------------------------------- messages
def _parse_before(before: str | None) -> uuid.UUID | datetime | None:
    if before is None or not before.strip():
        return None
    value = before.strip()
    try:
        return uuid.UUID(value)
    except ValueError:
        pass
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BadRequest(
            "'before' must be a message id or an ISO-8601 timestamp", code="invalid_cursor"
        ) from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


async def list_messages(
    db: AsyncSession, user: User, conversation_id: uuid.UUID, *, before: str | None, limit: int
) -> list[MessageOut]:
    """Up to ``limit`` messages older than ``before`` (message id or timestamp), oldest first."""
    conversation = await get_conversation_for_user(db, user, conversation_id)
    stmt = select(Message).where(Message.conversation_id == conversation.id, visible_messages(user))
    cursor = _parse_before(before)
    if isinstance(cursor, uuid.UUID):
        ref = await db.get(Message, cursor)
        if ref is None or ref.conversation_id != conversation.id:
            raise BadRequest("Unknown message cursor", code="invalid_cursor")
        stmt = stmt.where(
            or_(
                Message.created_at < ref.created_at,
                and_(Message.created_at == ref.created_at, Message.id < ref.id),
            )
        )
    elif isinstance(cursor, datetime):
        stmt = stmt.where(Message.created_at < cursor)
    rows = list(
        (await db.execute(stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit)))
        .scalars()
        .all()
    )
    rows.reverse()
    senders = await _users_by_id(db, [m.sender_user_id for m in rows])
    return [message_out(m, _sender(senders, m)) for m in rows]


async def send_message(
    db: AsyncSession, user: User, conversation_id: uuid.UUID, body: MessageCreate
) -> MessageOut:
    conversation = await get_conversation_for_user(db, user, conversation_id)
    if not body.body and not body.attachment_document_ids:
        raise BadRequest("Message body cannot be empty", code="empty_message")
    attachment_ids = list(dict.fromkeys(body.attachment_document_ids))
    if attachment_ids:
        docs = (await db.execute(select(Document).where(Document.id.in_(attachment_ids)))).scalars().all()
        by_id = {d.id: d for d in docs}
        for doc_id in attachment_ids:
            doc = by_id.get(doc_id)
            if doc is None or not await policies.can_access_document(db, user, doc):
                raise BadRequest(
                    "Attachment not found", code="invalid_attachment", details={"document_id": str(doc_id)}
                )
    await _join_if_needed(db, conversation, user)
    now = datetime.now(UTC)
    message = Message(
        conversation_id=conversation.id,
        sender_user_id=user.id,
        body=body.body,
        attachment_document_ids=attachment_ids,
        created_at=now,
        updated_at=now,
    )
    db.add(message)
    conversation.last_message_at = now
    await db.flush()
    await db.execute(
        update(ConversationParticipant)
        .where(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == user.id,
        )
        .values(last_read_at=now)
        .execution_options(synchronize_session=False)
    )
    await publish(
        db, "message.created", {"message_id": str(message.id), "conversation_id": str(conversation.id)}
    )
    await db.commit()
    return message_out(message, user)


async def mark_conversation_read(db: AsyncSession, user: User, conversation_id: uuid.UUID) -> None:
    conversation = await get_conversation_for_user(db, user, conversation_id)
    await _join_if_needed(db, conversation, user)
    now = datetime.now(UTC)
    await db.execute(
        update(ConversationParticipant)
        .where(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == user.id,
        )
        .values(last_read_at=now)
        .execution_options(synchronize_session=False)
    )
    # Message notifications for this conversation are read too.
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.kind == "message.created",
            Notification.read_at.is_(None),
            Notification.data["conversation_id"].astext == str(conversation.id),
        )
        .values(read_at=now)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
