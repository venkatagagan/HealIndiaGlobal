"""Ledger event subscriptions (PLAN 6.1 / 6.4). All postings are idempotent; nothing here commits.

The settlements handlers call the same posting functions before deriving settlement items, so the
outcome does not depend on the order in which the two modules' handlers run.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import subscribe
from app.modules.ledger import postings


@subscribe("payment.captured")
async def on_payment_captured(db: AsyncSession, payload: dict[str, Any]) -> None:
    payment_id = payload.get("payment_id")
    if not payment_id:
        return
    await postings.post_capture(db, payment_id, base_amount_minor=payload.get("base_amount_minor"))
    if payload.get("booking_id"):
        # Late payment on an already completed booking: incremental recognition (no-op otherwise).
        await postings.recognize_booking(db, payload["booking_id"])


@subscribe("booking.completed")
async def on_booking_completed(db: AsyncSession, payload: dict[str, Any]) -> None:
    if payload.get("booking_id"):
        await postings.recognize_booking(db, payload["booking_id"])


@subscribe("refund.processed")
async def on_refund_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    if payload.get("refund_id"):
        await postings.post_refund(
            db, payload["refund_id"], base_amount_minor=payload.get("base_amount_minor")
        )


@subscribe("payout.processed")
async def on_payout_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    if payload.get("payout_id"):
        await postings.post_payout(db, payload["payout_id"])


@subscribe("payout.failed")
async def on_payout_failed(db: AsyncSession, payload: dict[str, Any]) -> None:
    if payload.get("payout_id"):
        await postings.reverse_payout(db, payload["payout_id"])
