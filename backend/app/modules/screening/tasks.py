"""Background jobs for the screening module."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import PermanentJobError, task
from app.modules.screening import service

logger = structlog.get_logger(__name__)


@task(service.RUN_AI_TASK, timeout_seconds=300)
async def run_ai(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Triage (Claude or rules) + matching for one submitted screening.

    AI problems never fail the job (they fall back to the rules engine inside ``process_screening``). Any
    other error marks the screening ``failed`` with a user-safe message so the client stops polling; the
    patient can then re-run it."""
    try:
        screening_id = uuid.UUID(str(payload["screening_id"]))
    except (KeyError, ValueError) as exc:
        raise PermanentJobError(f"invalid payload: {exc}") from exc
    try:
        await service.process_screening(db, screening_id)
    except Exception as exc:
        logger.exception("screening_processing_failed", screening_id=str(screening_id))
        await service.mark_failed(
            db, screening_id, f"We could not complete the analysis ({type(exc).__name__}). Please try again."
        )
