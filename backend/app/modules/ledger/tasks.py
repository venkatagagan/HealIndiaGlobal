"""Ledger periodic jobs."""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import periodic
from app.modules.ledger.postings import sweep_gateway_settlements

logger = structlog.get_logger(__name__)


@periodic("ledger.sweep_gateway_settlements", every_seconds=86_400, timeout_seconds=600)
async def sweep(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Daily T+2 gateway settlement sweep (PLAN 6.4 step 5)."""
    posted = await sweep_gateway_settlements(db)
    if posted:
        logger.info("ledger.sweep.done", posted=posted)
