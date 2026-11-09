"""Voice intake: speech-to-text transcriptions + AI-extracted screening suggestions (PLAN 7.2).

The voice-specific status enums live here (module-local, stored as VARCHAR via :func:`sa_enum`) because they
are only used by the ``voice`` module.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedJSON, EncryptedText
from app.core.enums import sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk, json_list_col

__all__ = ["VoiceReviewStatus", "VoiceStatus", "VoiceTranscription"]


class VoiceStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class VoiceReviewStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    CONFIRMED = "confirmed"
    DISCARDED = "discarded"


class VoiceTranscription(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "voice_transcriptions"
    __table_args__ = (
        sa.CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="duration_nonneg"),
        sa.Index("ix_voice_transcriptions_user_id_created_at", "user_id", "created_at"),
    )

    #: uploader (the patient, or the agent/staff member recording on the patient's behalf)
    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID | None] = fk("patient_profiles.id", ondelete="CASCADE", nullable=True)
    screening_id: Mapped[uuid.UUID | None] = fk("screenings.id", ondelete="SET NULL", nullable=True)
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    #: audio object key (``voice/<user_id>/<id>.<ext>``); NULL once deleted after transcription unless
    #: ``VOICE_RETAIN_AUDIO=true``
    storage_key: Mapped[str | None] = mapped_column(String(512))
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    #: ISO 639-1 code given by the client, or NULL for auto-detect
    language_hint: Mapped[str | None] = mapped_column(String(10))
    language_detected: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[VoiceStatus] = mapped_column(
        sa_enum(VoiceStatus),
        nullable=False,
        default=VoiceStatus.QUEUED,
        server_default=VoiceStatus.QUEUED.value,
        index=True,
    )
    provider: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(100))
    # transcripts and AI suggestions: encrypted at rest
    transcript: Mapped[str | None] = mapped_column(EncryptedText())
    transcript_en: Mapped[str | None] = mapped_column(EncryptedText())
    #: ``[{start, end, text}]`` (seconds)
    segments: Mapped[list[dict[str, Any]]] = json_list_col()
    #: IntakeSuggestion (PLAN 7.2) produced by Claude; NULL when AI extraction is unavailable
    intake_suggestion: Mapped[dict[str, Any] | None] = mapped_column(EncryptedJSON())
    #: failure reason (status ``failed``) or, with status ``completed`` and no suggestion, why the AI
    #: extraction is missing (e.g. "AI extraction not configured")
    error: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- review -> edit -> confirm (mandatory) ----------------------------------------------------------
    review_status: Mapped[VoiceReviewStatus] = mapped_column(
        sa_enum(VoiceReviewStatus),
        nullable=False,
        default=VoiceReviewStatus.PENDING_REVIEW,
        server_default=VoiceReviewStatus.PENDING_REVIEW.value,
        index=True,
    )
    #: the patient-confirmed IntakeSuggestion plus ``transcript`` (the confirmed, possibly edited,
    #: original-language text)
    confirmed_intake: Mapped[dict[str, Any] | None] = mapped_column(EncryptedJSON())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
