"""In-app notifications (PLAN 8.9 / 6.1).

    from app.modules.messaging.notifications import notify, notify_many
    await notify(db, user_id, "booking.confirmed", "Booking confirmed", "Your booking ...",
                 {"booking_id": str(b.id)}, dedupe_key=f"booking.confirmed:{b.id}")

``notify`` adds a ``notifications`` row in the caller's transaction (no commit), queues the realtime event
``notification.created`` for after the commit, and - for important kinds, when the user has an email -
enqueues the ``messaging.send_email`` job. With ``dedupe_key`` it is idempotent per user.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import enqueue
from app.models import Notification, User
from app.modules.messaging import push
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
        # journey gaps (CG-30)
        "quote.rejected",
        "quote.expired",
        "case.coordinator_assigned",
        "consultation.scheduled",
        "consultation.rescheduled",
        "consultation.cancelled",
        "travel.status_changed",
        "installment.due",
        "installment.overdue",
        "settlement_batch.pending_approval",
        "screening.emergency",
        # moderation / website
        "moderation.warning",
        "site_enquiry.created",
    }
)

DEDUPE_FIELD = "dedupe_key"


def notification_out(n: Notification) -> NotificationOut:
    data = dict(n.data or {})
    data.pop(DEDUPE_FIELD, None)
    data.pop("emailed_at", None)
    data.pop("pushed_devices", None)
    return NotificationOut(
        id=n.id,
        kind=n.kind,
        title=n.title,
        body=n.body,
        data=data,
        read_at=n.read_at,
        created_at=n.created_at,
    )


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID | str,
    kind: str,
    title: str,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    *,
    dedupe_key: str | None = None,
    email: bool | None = None,
) -> Notification | None:
    """Create a notification for ``user_id``. Returns ``None`` when the user is missing/inactive or a
    notification with the same ``dedupe_key`` already exists for that user."""
    uid = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    user = await db.get(User, uid)
    if user is None or not is_active_user(user):
        return None
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
    if push.push_configured() and kind not in push.PUSH_SKIP_KINDS and await push.has_active_device(db, uid):
        await enqueue(
            db,
            push.PUSH_TASK,
            {"notification_id": str(notification.id)},
            dedupe_key=f"notif-push:{notification.id}",
        )
    return notification


async def notify_many(
    db: AsyncSession,
    user_ids: Iterable[uuid.UUID | str | None],
    kind: str,
    title: str,
    body: str | None = None,
    data: dict[str, Any] | None = None,
    *,
    dedupe_key: str | None = None,
    email: bool | None = None,
) -> list[Notification]:
    created: list[Notification] = []
    for uid in dict.fromkeys(str(u) for u in user_ids if u):
        n = await notify(db, uid, kind, title, body, data, dedupe_key=dedupe_key, email=email)
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
