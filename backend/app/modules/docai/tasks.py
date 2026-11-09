"""Background jobs for document intelligence (PLAN 7.1)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import PermanentJobError, task
from app.modules.docai import service

logger = structlog.get_logger(__name__)


@task(service.ANALYZE_TASK, timeout_seconds=600)
async def analyze(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Read one report with Claude. AI problems never fail the job: they end as ``failed``/``unsupported``
    analyses with a user-safe message (rate limits are re-queued a few times first). Any unexpected error
    marks the analysis ``failed`` so clients stop polling; the patient can retry."""
    try:
        analysis_id = uuid.UUID(str(payload["analysis_id"]))
        attempt = int(payload.get("attempt") or 0)
    except (KeyError, ValueError, TypeError) as exc:
        raise PermanentJobError(f"invalid payload: {exc}") from exc
    try:
        await service.process_analysis(db, analysis_id, attempt=attempt)
    except Exception as exc:
        logger.exception("docai.processing_failed", analysis_id=str(analysis_id))
        await service.mark_failed(
            db, analysis_id, f"We could not read this report ({type(exc).__name__}). Please try again."
        )
