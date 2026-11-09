"""Background jobs for voice intake (PLAN 7.2)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jobs import PermanentJobError, task
from app.modules.voice import service

logger = structlog.get_logger(__name__)


@task(service.TRANSCRIBE_TASK, timeout_seconds=900)
async def transcribe(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Speech-to-text + AI extraction for one upload. Problems end as a ``failed`` transcription with a
    user-safe message (the audio is deleted either way unless ``VOICE_RETAIN_AUDIO``)."""
    try:
        transcription_id = uuid.UUID(str(payload["transcription_id"]))
    except (KeyError, ValueError) as exc:
        raise PermanentJobError(f"invalid payload: {exc}") from exc
    try:
        await service.process_transcription(db, transcription_id)
    except Exception as exc:
        logger.exception("voice.processing_failed", transcription_id=str(transcription_id))
        await service.mark_failed(
            db,
            transcription_id,
            f"We could not process the recording ({type(exc).__name__}). Please try again.",
        )
