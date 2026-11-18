"""Referral programme event subscriptions. Idempotent; nothing here commits."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PaymentGateway
from app.core.events import subscribe
from app.modules.referrals import credits, service


def _uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


@subscribe("booking.completed")
async def on_booking_completed(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking_id = _uuid(payload.get("booking_id"))
    if booking_id is not None:
        await service.on_booking_completed(db, booking_id)


@subscribe("refund.processed")
async def on_refund_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    gateway = payload.get("gateway")
    refund_id = _uuid(payload.get("refund_id"))
    if refund_id is None or (gateway and gateway != PaymentGateway.PLATFORM_CREDIT.value):
        return
    await credits.reinstate_refunded_credit(db, refund_id)
