"""Document intelligence (PLAN 7.1): AI reading of uploaded medical reports and photos of paper reports.

One ``DocumentAnalysis`` covers 1..``DOCAI_MAX_PAGES`` uploaded documents that are the pages of ONE report, in
page order. The AI result is a DRAFT: ``ai_output`` keeps an immutable copy of what the model returned, the
top-level extraction columns hold the working (patient-editable) draft and ``confirmed_data`` the version the
patient (or their agent/staff) confirmed. Only confirmed data is used for screening or shown to hospitals.

The enums below are local to this domain (``app/core/enums.py`` belongs to the models owner); their values are
lowercase snake_case like every other enum and are stored as VARCHAR through :func:`sa_enum`.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Date, DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AIEngine, sa_enum
from app.models.base import (
    Base,
    TimestampMixin,
    UUIDPkMixin,
    fk,
    json_list_col,
    json_obj_col,
    text_array_col,
    uuid_array_col,
)

__all__ = [
    "AnalysisDocType",
    "AnalysisReviewStatus",
    "DocumentAnalysis",
    "DocumentAnalysisStatus",
    "FindingSignificance",
    "LabFlag",
]


class DocumentAnalysisStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    UNSUPPORTED = "unsupported"


class AnalysisReviewStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class AnalysisDocType(StrEnum):
    LAB_REPORT = "lab_report"
    IMAGING_REPORT = "imaging_report"
    DISCHARGE_SUMMARY = "discharge_summary"
    PRESCRIPTION = "prescription"
    CONSULTATION_NOTE = "consultation_note"
    PATHOLOGY_REPORT = "pathology_report"
    INSURANCE_DOCUMENT = "insurance_document"
    OTHER = "other"


class FindingSignificance(StrEnum):
    NORMAL = "normal"
    ATTENTION = "attention"
    URGENT = "urgent"


class LabFlag(StrEnum):
    LOW = "low"
    HIGH = "high"
    NORMAL = "normal"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class DocumentAnalysis(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "document_analyses"
    __table_args__ = (
        sa.CheckConstraint("cardinality(document_ids) >= 1", name="document_ids_not_empty"),
        sa.CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="confidence_range"
        ),
        sa.Index("ix_document_analyses_patient_id_created_at", "patient_id", "created_at"),
    )

    # --- request -------------------------------------------------------------------------------------------
    document_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    primary_document_id: Mapped[uuid.UUID] = fk("documents.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    requested_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    # Language ``summary_patient`` is written in (patient's preferred language unless the request named one).
    summary_language: Mapped[str] = mapped_column(
        String(16), nullable=False, default="en", server_default="en"
    )

    # --- processing ----------------------------------------------------------------------------------------
    status: Mapped[DocumentAnalysisStatus] = mapped_column(
        sa_enum(DocumentAnalysisStatus),
        nullable=False,
        default=DocumentAnalysisStatus.QUEUED,
        server_default="queued",
        index=True,
    )
    engine: Mapped[AIEngine] = mapped_column(
        sa_enum(AIEngine), nullable=False, default=AIEngine.CLAUDE, server_default="claude"
    )
    model: Mapped[str | None] = mapped_column(String(100))
    error: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # --- extraction (working draft; equals the confirmed version once confirmed) ----------------------------
    doc_type: Mapped[AnalysisDocType | None] = mapped_column(sa_enum(AnalysisDocType))
    language: Mapped[str | None] = mapped_column(String(16))  # ISO 639-1 of the document itself
    report_date: Mapped[date | None] = mapped_column(Date)
    facility_name: Mapped[str | None] = mapped_column(String(300))
    summary_patient: Mapped[str | None] = mapped_column(Text)
    summary_clinical: Mapped[str | None] = mapped_column(Text)
    key_findings: Mapped[list[dict[str, Any]]] = json_list_col()
    lab_values: Mapped[list[dict[str, Any]]] = json_list_col()
    diagnoses_mentioned: Mapped[list[str]] = text_array_col()
    medications: Mapped[list[dict[str, Any]]] = json_list_col()
    procedures_mentioned: Mapped[list[str]] = text_array_col()
    recommendations: Mapped[list[str]] = text_array_col()
    red_flags: Mapped[list[str]] = text_array_col()
    quality: Mapped[dict[str, Any]] = json_obj_col()
    suggested_specialties: Mapped[list[str]] = text_array_col()
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))

    # --- review -> edit -> confirm -------------------------------------------------------------------------
    ai_output: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    review_status: Mapped[AnalysisReviewStatus | None] = mapped_column(
        sa_enum(AnalysisReviewStatus), index=True
    )
    confirmed_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    confirmed_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
