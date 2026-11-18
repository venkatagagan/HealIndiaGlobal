"""Domain-event subscribers of the trust module: tell staff a review is waiting for moderation and tell the
patient what happened to their review. Idempotent (``dedupe_key``), never commits; text is rendered in each
recipient's language (``notifications.review_submitted.*`` / ``notifications.review_moderated.*``)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ReviewStatus, UserRole
from app.core.events import subscribe
from app.i18n import Msg
from app.models import Hospital, Review
from app.modules.messaging import policies
from app.modules.messaging.notifications import notify, notify_many

#: staff who moderate reviews (PATCH /admin/reviews/{id} is admin | super_admin)
MODERATOR_ROLES = (UserRole.ADMIN, UserRole.SUPER_ADMIN)


def _uuid(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    value = payload.get(key)
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


async def _hospital_name(db: AsyncSession, hospital_id: uuid.UUID | None) -> str | Msg:
    hospital = await db.get(Hospital, hospital_id) if hospital_id else None
    return hospital.name if hospital is not None else Msg("common.the_hospital")


@subscribe("review.submitted")
async def on_review_submitted(db: AsyncSession, payload: dict[str, Any]) -> None:
    review_id = _uuid(payload, "review_id")
    review = await db.get(Review, review_id) if review_id else None
    if review is None:
        return
    version = review.updated_at.isoformat() if review.updated_at else ""
    await notify_many(
        db,
        await policies.staff_user_ids(db, MODERATOR_ROLES),
        "review.submitted",
        data={"review_id": str(review.id), "hospital_id": str(review.hospital_id), "link": "/reviews"},
        dedupe_key=f"review.submitted:{review.id}:{version}",
        email=False,
        title_key="notifications.review_submitted.title",
        body_key="notifications.review_submitted.body",
        params={"rating": review.rating, "hospital": await _hospital_name(db, review.hospital_id)},
    )


@subscribe("review.moderated")
async def on_review_moderated(db: AsyncSession, payload: dict[str, Any]) -> None:
    review_id = _uuid(payload, "review_id")
    review = await db.get(Review, review_id) if review_id else None
    status = str(payload.get("status") or "")
    if review is None or status not in (ReviewStatus.PUBLISHED.value, ReviewStatus.HIDDEN.value):
        return
    patient_user = await policies.patient_user_id(db, review.patient_id)
    if patient_user is None:
        return
    reason = (review.moderation_reason or "").strip() if status == ReviewStatus.HIDDEN.value else ""
    prefix = f"notifications.review_moderated.{status}"
    moderated = review.moderated_at.isoformat() if review.moderated_at else ""
    await notify(
        db,
        patient_user,
        "review.moderated",
        data={"review_id": str(review.id), "status": status, "link": "/reviews"},
        dedupe_key=f"review.moderated:{review.id}:{status}:{moderated}",
        email=False,
        title_key=f"{prefix}_title",
        body_key=[f"{prefix}_body", "common.reason" if reason else None],
        params={"hospital": await _hospital_name(db, review.hospital_id), "reason": reason},
    )
