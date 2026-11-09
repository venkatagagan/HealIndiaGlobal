"""Privacy and data rights (DPDP Act 2023 + DPDP Rules 2025, EU/UK GDPR).

* ``DataRightsRequest`` - a data-principal request or grievance (access, correction, erasure, nomination,
  consent withdrawal, complaint) with a status and an SLA due date, worked by staff in the admin portal.
* ``DataNominee`` - who a patient nominates to exercise their rights on death or incapacity (DPDP s.14).
* ``GuardianConsent`` - verifiable consent of a parent/lawful guardian for a patient under 18 (DPDP s.9).
* ``BreachIncident`` - the personal-data breach register (GDPR Art. 33(5), DPDP Rule 7).

The enums are module-local and stored as VARCHAR through :func:`sa_enum` like every other enum.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

import sqlalchemy as sa
from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedString
from app.core.enums import sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk, text_array_col

__all__ = [
    "BreachIncident",
    "BreachSeverity",
    "BreachStatus",
    "DataNominee",
    "DataRightsRequest",
    "DataRightsRequestKind",
    "DataRightsRequestStatus",
    "GuardianConsent",
]


class DataRightsRequestKind(StrEnum):
    ACCESS = "access"
    CORRECTION = "correction"
    ERASURE = "erasure"
    NOMINATION = "nomination"
    WITHDRAW_CONSENT = "withdraw_consent"
    COMPLAINT = "complaint"
    OTHER = "other"


class DataRightsRequestStatus(StrEnum):
    RECEIVED = "received"
    IN_PROGRESS = "in_progress"
    AWAITING_REQUESTER = "awaiting_requester"
    COMPLETED = "completed"
    REJECTED = "rejected"


class BreachSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class BreachStatus(StrEnum):
    OPEN = "open"
    CONTAINED = "contained"
    NOTIFIED = "notified"
    CLOSED = "closed"


class DataRightsRequest(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "data_rights_requests"
    __table_args__ = (sa.Index("ix_data_rights_requests_status_due_at", "status", "due_at"),)

    reference: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    #: the requester's account (NULL for a request made without signing in, or after erasure)
    user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    kind: Mapped[DataRightsRequestKind] = mapped_column(sa_enum(DataRightsRequestKind), nullable=False)
    status: Mapped[DataRightsRequestStatus] = mapped_column(
        sa_enum(DataRightsRequestStatus),
        nullable=False,
        default=DataRightsRequestStatus.RECEIVED,
        server_default=DataRightsRequestStatus.RECEIVED.value,
        index=True,
    )
    #: web | app | email | phone | post (how it reached us)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="web", server_default="web")
    requester_name: Mapped[str] = mapped_column(String(200), nullable=False)
    requester_email: Mapped[str | None] = mapped_column(String(255))
    requester_phone: Mapped[str | None] = mapped_column(String(32))
    #: acting for someone else (nominee, guardian, lawyer): who and in what capacity
    on_behalf_of: Mapped[str | None] = mapped_column(String(300))
    details: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    assigned_to_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    #: answer shown to the requester
    resolution: Mapped[str | None] = mapped_column(Text)
    #: staff-only working notes
    internal_notes: Mapped[str | None] = mapped_column(Text)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DataNominee(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "data_nominees"

    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE", index=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    relationship: Mapped[str] = mapped_column(String(60), nullable=False)
    email: Mapped[str | None] = mapped_column(EncryptedString())
    phone: Mapped[str | None] = mapped_column(EncryptedString())


class GuardianConsent(UUIDPkMixin, TimestampMixin, Base):
    """One guardian consent for a minor patient. The effective record is the latest non-revoked one; the
    matching ``consents`` row (kind ``guardian_consent``) is the consent evidence."""

    __tablename__ = "guardian_consents"

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    guardian_name: Mapped[str] = mapped_column(String(200), nullable=False)
    #: parent | lawful_guardian
    relationship: Mapped[str] = mapped_column(String(40), nullable=False)
    guardian_email: Mapped[str | None] = mapped_column(EncryptedString())
    guardian_phone: Mapped[str | None] = mapped_column(EncryptedString())
    guardian_date_of_birth: Mapped[date | None] = mapped_column(Date)
    #: how the guardian's identity and age were checked: id_document | digilocker | in_person | video_call
    verification_method: Mapped[str] = mapped_column(String(40), nullable=False)
    #: e.g. last 4 of the ID, a DigiLocker reference or the uploaded document id (never a full ID number)
    verification_reference: Mapped[str | None] = mapped_column(String(120))
    consent_id: Mapped[uuid.UUID | None] = fk("consents.id", ondelete="SET NULL", nullable=True)
    recorded_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    #: set when staff confirmed the verification (optional second step)
    verified_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BreachIncident(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "breach_incidents"

    reference: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[BreachSeverity] = mapped_column(sa_enum(BreachSeverity), nullable=False)
    status: Mapped[BreachStatus] = mapped_column(
        sa_enum(BreachStatus),
        nullable=False,
        default=BreachStatus.OPEN,
        server_default=BreachStatus.OPEN.value,
        index=True,
    )
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: detected_at + 72 h: GDPR Art. 33 supervisory-authority deadline and the DPDP Rule 7(2) detailed report
    notification_deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    contained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: personal-data categories involved, e.g. health, identity, contact, financial, credentials
    data_categories: Mapped[list[str]] = text_array_col()
    affected_subjects_estimate: Mapped[int | None] = mapped_column(Integer)
    likely_consequences: Mapped[str | None] = mapped_column(Text)
    measures_taken: Mapped[str | None] = mapped_column(Text)
    dpb_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    supervisory_authority_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subjects_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reported_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
