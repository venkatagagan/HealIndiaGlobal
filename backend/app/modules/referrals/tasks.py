"""Referral programme jobs: daily expiry of unused credit and of referrals that never qualified."""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import periodic
from app.modules.referrals import service

logger = structlog.get_logger(__name__)

DAY = 86_400


@periodic("referrals.expire_credits", every_seconds=DAY)
async def expire_credits(db: AsyncSession, payload: dict[str, Any]) -> int:
    count = await service.expire_credits(db)
    if count:
        logger.info("referrals.credits_expired", count=count)
    return count


@periodic("referrals.expire_pending", every_seconds=DAY)
async def expire_pending(db: AsyncSession, payload: dict[str, Any]) -> int:
    count = await service.expire_pending_referrals(db)
    if count:
        logger.info("referrals.pending_expired", count=count)
    return count
