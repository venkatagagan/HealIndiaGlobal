"""Background tasks of the cases module (PLAN 6.2)."""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import realtime
from app.core.jobs import periodic, task
from app.modules.cases.bookings import expire_unpaid_bookings
from app.modules.cases.common import REALTIME_TASK
from app.modules.cases.service import expire_quotes

logger = structlog.get_logger(__name__)


@task(REALTIME_TASK, timeout_seconds=30)
async def realtime_push(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Deliver ``{type, data}`` to the listed users' websockets (queued so it only runs after commit)."""
    user_ids = [str(u) for u in payload.get("user_ids", [])]
    event_type = str(payload.get("type") or "")
    if not user_ids or not event_type:
        return
    await realtime.send_to_users(list(user_ids), event_type, payload.get("data") or {})


@periodic("cases.expire_quotes", every_seconds=3600)
async def expire_quotes_job(db: AsyncSession, payload: dict[str, Any]) -> None:
    count = await expire_quotes(db)
    if count:
        logger.info("cases.quotes_expired", count=count)


@periodic("cases.expire_unpaid_bookings", every_seconds=6 * 3600)
async def expire_unpaid_bookings_job(db: AsyncSession, payload: dict[str, Any]) -> None:
    count = await expire_unpaid_bookings(db)
    if count:
        logger.info("cases.unpaid_bookings_cancelled", count=count)
