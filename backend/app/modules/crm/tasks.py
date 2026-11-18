"""Agent CRM jobs: follow-up reminders (hourly) and the lost-lead retention purge (daily)."""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.jobs import periodic
from app.modules.crm import service

logger = structlog.get_logger(__name__)


@periodic("crm.follow_up_reminders", every_seconds=3600)
async def follow_up_reminders(db: AsyncSession, payload: dict[str, Any]) -> int:
    return await service.send_follow_up_reminders(db)


@periodic("crm.purge_lost_leads", every_seconds=86_400)
async def purge_lost_leads(db: AsyncSession, payload: dict[str, Any]) -> int:
    count = await service.purge_lost_leads(db, settings.CRM_LOST_LEAD_RETENTION_DAYS)
    if count:
        logger.info("crm.lost_leads_purged", count=count)
    return count
