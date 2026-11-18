"""Discharge summaries for the home doctor, their share links and the medication reminders made from them.

Health text is encrypted at rest (``EncryptedText`` / ``EncryptedJSON``). A final summary is locked; editing
it creates a new draft version (``version`` + 1, ``supersedes_id``) and the old one is marked
``superseded_at`` when the new version is finalized.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedJSON, EncryptedString, EncryptedText
from app.core.enums import DischargeSummaryStatus, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk, uuid_array_col

__all__ = ["DischargeShare", "DischargeSummary", "MedicationReminder"]


class DischargeSummary(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "discharge_summaries"
    __table_args__ = (
        sa.UniqueConstraint("case_id", "version", name="uq_discharge_summaries_case_id_version"),
        # at most one open draft per case
        sa.Index(
            "uq_discharge_summaries_case_id_draft",
            "case_id",
            unique=True,
            postgresql_where=sa.text("status = 'draft'"),
        ),
        sa.CheckConstraint("version >= 1", name="version_positive"),
    )

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="RESTRICT")
    booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="SET NULL", nullable=True)
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="RESTRICT")
    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="RESTRICT")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id", ondelete="SET NULL", nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    supersedes_id: Mapped[uuid.UUID | None] = fk("discharge_summaries.id", ondelete="SET NULL", nullable=True)
    status: Mapped[DischargeSummaryStatus] = mapped_column(
        sa_enum(DischargeSummaryStatus),
        nullable=False,
        default=DischargeSummaryStatus.DRAFT,
        server_default="draft",
        index=True,
    )
    # treating doctor snapshot (the doctor row may change later)
    doctor_name: Mapped[str | None] = mapped_column(String(200))
    doctor_registration: Mapped[str | None] = mapped_column(String(80))
    admission_date: Mapped[date | None] = mapped_column(Date)
    discharge_date: Mapped[date | None] = mapped_column(Date)
    diagnosis: Mapped[str | None] = mapped_column(EncryptedText())
    diagnosis_code: Mapped[str | None] = mapped_column(String(20))  # ICD-10, optional
    procedure_name: Mapped[str | None] = mapped_column(EncryptedText())
    procedure_code: Mapped[str | None] = mapped_column(String(20))  # optional (SNOMED CT / ICD-10-PCS)
    procedure_date: Mapped[date | None] = mapped_column(Date)
    hospital_course: Mapped[str | None] = mapped_column(EncryptedText())
    # [{"name", "dose", "frequency", "duration_days", "route", "instructions"}]
    medications: Mapped[list[dict[str, Any]] | None] = mapped_column(EncryptedJSON())
    follow_up_instructions: Mapped[str | None] = mapped_column(EncryptedText())
    red_flag_symptoms: Mapped[str | None] = mapped_column(EncryptedText())
    allergies: Mapped[str | None] = mapped_column(EncryptedText())
    investigations_summary: Mapped[str | None] = mapped_column(EncryptedText())
    attachment_document_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    pdf_document_id: Mapped[uuid.UUID | None] = fk("documents.id", ondelete="SET NULL", nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    finalized_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DischargeShare(UUIDPkMixin, TimestampMixin, Base):
    """A time-limited, revocable link that shows ONE final discharge summary (+ selected documents) to the
    patient's home doctor without an account. Only the SHA-256 of the random token is stored."""

    __tablename__ = "discharge_shares"
    __table_args__ = (sa.CheckConstraint("view_count >= 0", name="view_count_nonneg"),)

    discharge_summary_id: Mapped[uuid.UUID] = fk("discharge_summaries.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    created_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    doctor_email: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    doctor_email_masked: Mapped[str] = mapped_column(String(320), nullable=False)
    doctor_name: Mapped[str | None] = mapped_column(EncryptedString())
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en", server_default="en")
    document_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MedicationReminder(UUIDPkMixin, TimestampMixin, Base):
    """One medicine from a final discharge summary. Reminders are created disabled when the summary is
    finalized and switched on by the patient (consent ``medication_reminders``); the server sends one
    in-app/push reminder per day at ``remind_hour`` in ``timezone`` while ``start_on <= today <= end_on``."""

    __tablename__ = "medication_reminders"
    __table_args__ = (
        sa.CheckConstraint("remind_hour >= 0 AND remind_hour <= 23", name="remind_hour_range"),
        sa.Index("ix_medication_reminders_enabled", "enabled", "user_id"),
    )

    discharge_summary_id: Mapped[uuid.UUID] = fk("discharge_summaries.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    name: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    dose: Mapped[str | None] = mapped_column(EncryptedString())
    frequency: Mapped[str | None] = mapped_column(EncryptedString())
    start_on: Mapped[date] = mapped_column(Date, nullable=False)
    end_on: Mapped[date | None] = mapped_column(Date)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa.false())
    remind_hour: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=9, server_default="9")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC", server_default="UTC")
    last_sent_on: Mapped[date | None] = mapped_column(Date)
