"""Settlement jobs: eligibility (hourly), cancellation retention (hourly), auto-batching (daily) and payout
execution (provider calls)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import PermanentJobError, periodic, task
from app.modules.ledger import postings
from app.modules.settlements import service

logger = structlog.get_logger(__name__)


@periodic("settlements.mark_eligible", every_seconds=3_600, timeout_seconds=300)
async def mark_eligible(db: AsyncSession, payload: dict[str, Any]) -> None:
    count = await service.mark_eligible(db)
    if count:
        logger.info("settlements.mark_eligible.done", count=count)


@periodic("settlements.auto_batch", every_seconds=86_400, timeout_seconds=600)
async def auto_batch(db: AsyncSession, payload: dict[str, Any]) -> None:
    await service.mark_eligible(db)
    created = await service.auto_batch(db)
    if created:
        logger.info("settlements.auto_batch.done", batches=len(created))


@periodic("settlements.recognize_cancellation_retention", every_seconds=3_600, timeout_seconds=600)
async def recognize_cancellation_retention(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Hourly: post the retained amount of due cancelled bookings and create the hospital's items."""
    booking_ids = await postings.retain_cancelled_bookings(db)
    for booking_id in booking_ids:
        await service.sync_items_for_booking(db, booking_id)
    if booking_ids:
        logger.info("settlements.cancellation_retention.done", bookings=len(booking_ids))


@task("settlements.execute_payout", timeout_seconds=120)
async def execute_payout(db: AsyncSession, payload: dict[str, Any]) -> None:
    try:
        payout_id = uuid.UUID(str(payload["payout_id"]))
    except (KeyError, ValueError) as exc:
        raise PermanentJobError("invalid payout_id") from exc
    await service.execute_payout(db, payout_id)
