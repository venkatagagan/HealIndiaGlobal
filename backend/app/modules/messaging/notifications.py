"""In-app notifications (PLAN 8.9 / 6.1).

    from app.modules.messaging.notifications import notify, notify_many
    await notify(db, user_id, "booking.confirmed", "Booking confirmed", "Your booking ...",
                 {"booking_id": str(b.id)}, dedupe_key=f"booking.confirmed:{b.id}")

``notify`` adds a ``notifications`` row in the caller's transaction (no commit), queues the realtime event
``notification.created`` for after the commit, and - for important kinds, when the user has an email -
enqueues the ``messaging.send_email`` job. With ``dedupe_key`` it is idempotent per user.

Translated notifications (preferred): pass catalog keys instead of English text; they are rendered in each
RECIPIENT's language (``app.i18n.recipient_locale``: their ``preferred_language`` when it is enabled, else
English) and stored already translated::

    await notify_many(db, user_ids, "booking.confirmed",
                      title_key="notifications.booking_confirmed.title",
                      body_key=["notifications.booking_confirmed.body",
                                Msg("notifications.booking_confirmed.admission", {"date": "2026-12-01"})],
                      params={"booking_number": b.booking_number, "hospital": name}, data={...})

``body_key`` may be a key, a :class:`~app.i18n.Msg` or a list of them (joined with a space; ``None`` entries
are skipped). ``params`` are shared by every part; a ``Msg``'s own params win. Plain ``title``/``body``
strings still work and are used as-is (no translation).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import enqueue
from app.i18n import Msg, recipient_locale, t
from app.i18n import runtime as i18n_runtime
from app.models import Notification, User
from app.modules.messaging.outbox import queue_realtime
from app.modules.messaging.policies import is_active_user
from app.modules.messaging.schemas import NotificationOut

# Kinds that also send an email (when the recipient has an address).
EMAIL_KINDS: frozenset[str] = frozenset(
    {
        "user.registered",
        "hospital.approved",
        "hospital.rejected",
        "agent.approved",
        "agent.rejected",
        "agent.kyc_submitted",
        "screening.completed",
        "case.created",
        "case.cancelled",
        "case.declined",
        "quote.sent",
        "quote.accepted",
        "booking.confirmed",
        "booking.completed",
        "booking.cancelled",
        "payment.captured",
        "payment.failed",
        "refund.processed",
        "payout.processed",
        "payout.failed",
        "sos.created",
    }
)

DEDUPE_FIELD = "dedupe_key"


def notification_out(n: Notification) -> NotificationOut:
    data = dict(n.data or {})
    data.pop(DEDUPE_FIELD, None)
    data.pop("emailed_at", None)
    return NotificationOut(
        id=n.id,
        kind=n.kind,
        title=n.title,
        body=n.body,
        data=data,
        read_at=n.read_at,
        created_at=n.created_at,
    )


TextKey = str | Msg | None
TextKeys = TextKey | Sequence[TextKey]


def render_text(keys: TextKeys, locale: str, params: Mapping[str, Any] | None = None) -> str:
    """Render one key / :class:`Msg` / list of them in ``locale`` (list parts joined with a space)."""
    parts = [keys] if keys is None or isinstance(keys, str | Msg) else list(keys)
    shared = dict(params or {})
    out: list[str] = []
    for part in parts:
        if part is None:
            continue
        if isinstance(part, Msg):
            text = t(part.key, locale, **{**shared, **dict(part.params or {})})
        else:
            text = t(part, locale, **shared)
        if text.strip():
            out.append(text.strip())
    return " ".join(out)


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID | str,
    kind: str,
    title: str | None = None,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    *,
    dedupe_key: str | None = None,
    email: bool | None = None,
    title_key: TextKeys = None,
    body_key: TextKeys = None,
    params: Mapping[str, Any] | None = None,
) -> Notification | None:
    """Create a notification for ``user_id``. Returns ``None`` when the user is missing/inactive or a
    notification with the same ``dedupe_key`` already exists for that user. ``title_key``/``body_key`` (+
    ``params``) are rendered in the recipient's language and take precedence over ``title``/``body``."""
    uid = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    user = await db.get(User, uid)
    if user is None or not is_active_user(user):
        return None
    if title_key is not None or body_key is not None:
        await i18n_runtime.ensure_fresh()
        locale = recipient_locale(user)
        if title_key is not None:
            title = render_text(title_key, locale, params)
        if body_key is not None:
            body = render_text(body_key, locale, params) or None
    if not title:
        raise ValueError("notify() needs a title or a title_key")
    payload: dict[str, Any] = {k: v for k, v in (data or {}).items() if v is not None}
    if dedupe_key:
        exists = (
            await db.execute(
                select(Notification.id)
                .where(
                    Notification.user_id == uid,
                    Notification.kind == kind,
                    Notification.data[DEDUPE_FIELD].astext == dedupe_key,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if exists is not None:
            return None
        payload[DEDUPE_FIELD] = dedupe_key
    now = datetime.now(UTC)
    notification = Notification(
        user_id=uid,
        kind=kind[:80],
        title=title[:255],
        body=body,
        data=payload,
        created_at=now,
        updated_at=now,
    )
    db.add(notification)
    await db.flush()
    queue_realtime(db, [uid], "notification.created", notification_out(notification).model_dump(mode="json"))
    send_email = (kind in EMAIL_KINDS) if email is None else email
    if send_email and user.email and not user.is_guest:
        await enqueue(
            db,
            "messaging.send_email",
            {"notification_id": str(notification.id)},
            dedupe_key=f"notif-email:{notification.id}",
        )
    return notification


async def notify_many(
    db: AsyncSession,
    user_ids: Iterable[uuid.UUID | str | None],
    kind: str,
    title: str | None = None,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    *,
    dedupe_key: str | None = None,
    email: bool | None = None,
    title_key: TextKeys = None,
    body_key: TextKeys = None,
    params: Mapping[str, Any] | None = None,
) -> list[Notification]:
    """``notify`` for several users (deduplicated); each one gets the text in their own language."""
    created: list[Notification] = []
    for uid in dict.fromkeys(str(u) for u in user_ids if u):
        n = await notify(
            db,
            uid,
            kind,
            title,
            body,
            data,
            dedupe_key=dedupe_key,
            email=email,
            title_key=title_key,
            body_key=body_key,
            params=params,
        )
        if n is not None:
            created.append(n)
    return created


# -------------------------------------------------------------------------------------------------- queries
async def unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            )
        ).scalar_one()
    )


async def mark_read(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> Notification | None:
    n = await db.get(Notification, notification_id)
    if n is None or n.user_id != user_id:
        return None
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
    await db.commit()
    return n


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return int(getattr(result, "rowcount", 0) or 0)
