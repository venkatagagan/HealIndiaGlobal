"""Request/response shapes for voice intake (PLAN 7.2)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.voice import VoiceReviewStatus, VoiceStatus
from app.modules.voice.ai import IntakeSuggestion


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VoiceTranscriptionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    patient_id: uuid.UUID | None
    screening_id: uuid.UUID | None
    case_id: uuid.UUID | None
    status: VoiceStatus
    review_status: VoiceReviewStatus
    provider: str | None
    model: str | None
    duration_seconds: float | None
    language_hint: str | None
    language_detected: str | None
    transcript: str | None
    transcript_en: str | None
    segments: list[dict[str, Any]]
    #: IntakeSuggestion (``engine`` = ``claude``, or ``rules`` for the keyword fallback without AI)
    intake_suggestion: dict[str, Any] | None
    #: ``completed`` with a message = why the AI extraction is missing/basic; ``failed`` = why it failed
    error: str | None
    confirmed_intake: dict[str, Any] | None
    confirmed_at: datetime | None
    audio_retained: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class IntakeExtractIn(BaseModel):
    """English text (typed, or an on-device English transcript). Unknown fields such as the former
    ``language`` are ignored (the product is English-only)."""

    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1, max_length=8000)
    screening_id: uuid.UUID | None = None


class ConfirmIn(_Request):
    #: the patient-edited transcript (optional)
    transcript: str | None = Field(default=None, max_length=20000)
    intake: IntakeSuggestion


class Conflict(BaseModel):
    field: str
    current: Any
    suggested: Any


class ConfirmOut(BaseModel):
    transcription: VoiceTranscriptionOut
    #: screening fields filled from the confirmed intake (only fields that were empty)
    applied_fields: list[str]
    #: fields where the screening already had a different answer - never overwritten; resolve in the client
    conflicts: list[Conflict]
    #: why nothing was applied (no screening, or it is no longer a draft), else null
    screening_note: str | None = None
