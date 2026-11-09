"""Settlement event subscriptions: derive settlement items from the ledger postings (PLAN 6.4).

Each handler first runs the (idempotent) ledger posting for the event so that items can be derived even if
this module's handler runs before the ledger module's handler. Nothing here commits.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import subscribe
from app.models.payments import PaymentOrder, Refund
from app.modules.ledger import postings
from app.modules.settlements.service import sync_items_for_booking


@subscribe("booking.completed")
async def on_booking_completed(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking_id = payload.get("booking_id")
    if not booking_id:
        return
    await postings.recognize_booking(db, booking_id)
    await sync_items_for_booking(db, booking_id)


@subscribe("payment.captured")
async def on_payment_captured(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Late payment after completion: incremental recognition produces incremental items."""
    booking_id = payload.get("booking_id")
    payment_id = payload.get("payment_id")
    if not booking_id or not payment_id:
        return
    await postings.post_capture(db, payment_id, base_amount_minor=payload.get("base_amount_minor"))
    await postings.recognize_booking(db, booking_id)
    # Any booking-scoped posting still without items was produced by this payment's recognition (whichever
    # module's handler ran it first), so the new items are attributed to this payment.
    await sync_items_for_booking(db, booking_id, payment_id=payment_id)


@subscribe("refund.processed")
async def on_refund_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Refund after completion: the proportional ledger reversal becomes negative (clawback) items."""
    refund_id = payload.get("refund_id")
    if not refund_id:
        return
    await postings.post_refund(db, refund_id, base_amount_minor=payload.get("base_amount_minor"))
    booking_id = payload.get("booking_id")
    if not booking_id:
        row = (
            await db.execute(
                select(Refund.booking_id, PaymentOrder.booking_id)
                .outerjoin(PaymentOrder, PaymentOrder.id == Refund.order_id)
                .where(Refund.id == uuid.UUID(str(refund_id)))
            )
        ).first()
        booking_id = (row[0] or row[1]) if row else None
    if booking_id:
        await sync_items_for_booking(db, booking_id)
