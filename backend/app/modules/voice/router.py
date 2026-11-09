"""Voice intake API (PLAN 7.2). Paths are written in full (the router has no prefix)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.core.ai_quota import ai_daily_quota
from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.core.rate_limit import rate_limit
from app.modules.voice import service
from app.modules.voice.ai import IntakeSuggestion
from app.modules.voice.schemas import ConfirmIn, ConfirmOut, IntakeExtractIn, VoiceTranscriptionOut

router = APIRouter(tags=["voice"])

_limit = Depends(rate_limit("voice.intake", 10, 60, key="user"))
_ai_quota = Depends(ai_daily_quota("voice"))  # SEC-021: per-user daily quota + platform budget
_CHUNK = 256 * 1024


async def _read_audio(file: UploadFile) -> bytes:
    """Read at most 10 MB without trusting declared sizes."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_CHUNK):
        total += len(chunk)
        if total > service.MAX_AUDIO_BYTES:
            raise AppError("Recordings can be at most 10 MB", code="file_too_large", status_code=413)
        chunks.append(chunk)
    return b"".join(chunks)


@router.post(
    "/voice/transcriptions",
    status_code=202,
    response_model=VoiceTranscriptionOut,
    dependencies=[_limit, _ai_quota],
)
async def create_transcription(
    db: DbSession,
    user: CurrentUser,
    request: Request,
    audio: Annotated[UploadFile, File(description="webm/ogg/opus/m4a/mp4/aac/mp3/wav, at most 10 MB")],
    patient_id: Annotated[
        uuid.UUID | None, Form(description="Agents/staff: the patient being recorded for")
    ] = None,
    screening_id: Annotated[uuid.UUID | None, Form()] = None,
    case_id: Annotated[uuid.UUID | None, Form()] = None,
    consent_ai: Annotated[bool, Form()] = False,
) -> VoiceTranscriptionOut:
    """Upload a recording (max ``VOICE_MAX_SECONDS``); transcription + extraction run in the background."""
    data = await _read_audio(audio)
    return await service.create_transcription(
        db,
        user,
        data,
        screening_id=screening_id,
        case_id=case_id,
        consent_ai=consent_ai,
        patient_id=patient_id,
        request=request,
    )


@router.get("/voice/transcriptions/{transcription_id}", response_model=VoiceTranscriptionOut)
async def get_transcription(
    transcription_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> VoiceTranscriptionOut:
    return await service.get_transcription(db, user, transcription_id)


@router.post("/voice/transcriptions/{transcription_id}/confirm", response_model=ConfirmOut)
async def confirm_transcription(
    transcription_id: uuid.UUID, body: ConfirmIn, db: DbSession, user: CurrentUser, request: Request
) -> ConfirmOut:
    """Store the reviewed intake; when linked to a draft screening, fill only its empty fields."""
    return await service.confirm_transcription(db, user, transcription_id, body, request)


@router.post("/voice/transcriptions/{transcription_id}/discard", response_model=VoiceTranscriptionOut)
async def discard_transcription(
    transcription_id: uuid.UUID, db: DbSession, user: CurrentUser, request: Request
) -> VoiceTranscriptionOut:
    return await service.discard_transcription(db, user, transcription_id, request)


@router.post("/voice/intake-extract", response_model=IntakeSuggestion, dependencies=[_limit, _ai_quota])
async def intake_extract(body: IntakeExtractIn, db: DbSession, user: CurrentUser) -> IntakeSuggestion:
    """Typed or on-device text -> IntakeSuggestion. Read-only: save via ``PATCH /screenings/{id}``."""
    return await service.extract_text(db, user, body)
