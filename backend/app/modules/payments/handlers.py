"""Domain-event subscribers of the payments module (PLAN 6.1).

* ``booking.created``   -> installment schedule for ``payment_option=installments``
* ``booking.cancelled`` -> cancel open orders/installments, create auto-approved system refunds for
                           ``refundable_minor`` (booking currency) and enqueue their processing

Handlers run in the publisher's transaction: they are idempotent, never commit and never call gateways.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import subscribe
from app.modules.payments import service


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


@subscribe("booking.created")
async def on_booking_created(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking_id = _uuid(payload.get("booking_id"))
    if booking_id is not None:
        await service.create_installment_schedule(db, booking_id)


@subscribe("booking.cancelled")
async def on_booking_cancelled(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking_id = _uuid(payload.get("booking_id"))
    if booking_id is None:
        return
    try:
        refundable = int(payload.get("refundable_minor") or 0)
    except (TypeError, ValueError):
        refundable = 0
    reason = payload.get("reason")
    await service.create_cancellation_refunds(
        db,
        booking_id,
        max(refundable, 0),
        str(reason)[:500] if reason else None,
        requested_by=_uuid(payload.get("refund_requested_by")),
    )
