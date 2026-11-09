"""Event handlers for voice intake (PLAN 7.2): tell the uploader the transcript is ready to review."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import subscribe
from app.models.voice import VoiceStatus, VoiceTranscription


@subscribe("voice.transcribed")
async def on_voice_transcribed(db: AsyncSession, payload: dict[str, Any]) -> None:
    t = await db.get(VoiceTranscription, uuid.UUID(str(payload["transcription_id"])))
    if t is None:
        return
    data = {
        "transcription_id": str(t.id),
        "user_id": str(t.user_id),
        "screening_id": str(t.screening_id) if t.screening_id else None,
        "status": str(t.status),
    }
    try:
        from app.modules.messaging.outbox import queue_realtime
        from app.modules.messaging.service import notify
    except ImportError:  # pragma: no cover - messaging is part of the platform; realtime-only fallback
        from app.core import realtime

        await realtime.send_to_user(t.user_id, "voice.transcribed", data)
        return
    if t.status == VoiceStatus.COMPLETED:
        title, body = (
            "Your recording is ready",
            "Review the transcript and the suggested answers, then confirm.",
        )
    else:
        title, body = (
            "We could not process your recording",
            t.error or "Please try again or type your answers.",
        )
    await notify(
        db,
        t.user_id,
        "voice.transcribed",
        title,
        body,
        data,
        dedupe_key=f"voice.transcribed:{t.id}",
        email=False,
    )
    queue_realtime(db, [t.user_id], "voice.transcribed", data)
