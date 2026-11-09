"""AI screening: questionnaires, matches, AI call logs (PLAN 4.6)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AIEngine, AIRequestStatus, DurationUnit, ScreeningStatus, Urgency, sa_enum
from app.models.base import (
    Base,
    TimestampMixin,
    UUIDPkMixin,
    currency_col,
    fk,
    json_list_col,
    json_obj_col,
    money_col,
    text_array_col,
    uuid_array_col,
)

__all__ = ["AIRequestLog", "Screening", "ScreeningMatch"]


class Screening(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "screenings"
    __table_args__ = (
        sa.CheckConstraint(
            "pain_intensity IS NULL OR (pain_intensity >= 0 AND pain_intensity <= 10)", name="pain_range"
        ),
        sa.CheckConstraint("duration_value IS NULL OR duration_value >= 0", name="duration_nonneg"),
        sa.Index("ix_screenings_patient_id_created_at", "patient_id", "created_at"),
    )

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    created_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    specialty_id: Mapped[uuid.UUID | None] = fk("specialties.id", ondelete="SET NULL", nullable=True)
    status: Mapped[ScreeningStatus] = mapped_column(
        sa_enum(ScreeningStatus),
        nullable=False,
        default=ScreeningStatus.DRAFT,
        server_default="draft",
        index=True,
    )
    body_areas: Mapped[list[str]] = text_array_col()
    pain_intensity: Mapped[int | None] = mapped_column(SmallInteger)
    symptoms: Mapped[list[dict[str, Any]]] = json_list_col()
    duration_value: Mapped[int | None] = mapped_column(Integer)
    duration_unit: Mapped[DurationUnit | None] = mapped_column(sa_enum(DurationUnit))
    severity: Mapped[dict[str, Any]] = json_obj_col()
    previous_treatments: Mapped[list[str]] = text_array_col()
    notes: Mapped[str | None] = mapped_column(Text)
    preferences: Mapped[dict[str, Any]] = json_obj_col()
    report_document_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    consent_ai: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    home_country: Mapped[str | None] = mapped_column(String(2))
    ai_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ai_engine: Mapped[AIEngine | None] = mapped_column(sa_enum(AIEngine))
    ai_model: Mapped[str | None] = mapped_column(String(100))
    urgency: Mapped[Urgency | None] = mapped_column(sa_enum(Urgency), index=True)
    red_flags: Mapped[list[str]] = text_array_col()
    error: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ScreeningMatch(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "screening_matches"
    __table_args__ = (
        sa.CheckConstraint("match_score >= 0 AND match_score <= 100", name="match_score_range"),
        sa.CheckConstraint(
            "estimated_cost_minor IS NULL OR estimated_cost_minor >= 0", name="estimated_cost_nonneg"
        ),
        sa.Index("ix_screening_matches_screening_id_rank", "screening_id", "rank"),
    )

    screening_id: Mapped[uuid.UUID] = fk("screenings.id", ondelete="CASCADE")
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    match_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    reasons: Mapped[list[str]] = text_array_col()
    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id", ondelete="CASCADE", nullable=True)
    procedure_id: Mapped[uuid.UUID | None] = fk("procedures.id", ondelete="SET NULL", nullable=True)
    package_id: Mapped[uuid.UUID | None] = fk("treatment_packages.id", ondelete="SET NULL", nullable=True)
    estimated_cost_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str | None] = currency_col(None, nullable=True)


class AIRequestLog(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "ai_request_logs"

    purpose: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    model: Mapped[str | None] = mapped_column(String(100))
    screening_id: Mapped[uuid.UUID | None] = fk("screenings.id", ondelete="SET NULL", nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[AIRequestStatus] = mapped_column(sa_enum(AIRequestStatus), nullable=False, index=True)
    error: Mapped[str | None] = mapped_column(Text)
