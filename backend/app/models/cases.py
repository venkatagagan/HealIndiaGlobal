"""Cases, status history, quotes, bookings, consultations, checklist, itinerary (PLAN 4.7)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Double, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString, EncryptedText
from app.core.enums import (
    BookingStatus,
    CaseStatus,
    ChecklistKey,
    ChecklistStatus,
    ConsultationKind,
    ConsultationMode,
    ConsultationStatus,
    ItineraryKind,
    ItineraryStatus,
    PaymentOption,
    QuoteStatus,
    sa_enum,
)
from app.models.base import (
    Base,
    CreatedAtMixin,
    TimestampMixin,
    UUIDPkMixin,
    currency_col,
    fk,
    json_list_col,
    json_obj_col,
    money_col,
)

__all__ = [
    "AftercareCheckin",
    "Booking",
    "Case",
    "CaseDocument",
    "CaseStatusHistory",
    "ChecklistItem",
    "Consultation",
    "ItineraryItem",
    "Quote",
]


class Case(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "cases"
    __table_args__ = (
        sa.Index("ix_cases_hospital_id_status", "hospital_id", "status"),
        sa.Index("ix_cases_created_at", "created_at"),
    )

    case_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="RESTRICT")
    agent_id: Mapped[uuid.UUID | None] = fk("agents.id", ondelete="SET NULL", nullable=True)
    screening_id: Mapped[uuid.UUID | None] = fk("screenings.id", ondelete="SET NULL", nullable=True)
    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="RESTRICT")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id", ondelete="SET NULL", nullable=True)
    procedure_id: Mapped[uuid.UUID | None] = fk("procedures.id", ondelete="SET NULL", nullable=True)
    specialty_id: Mapped[uuid.UUID | None] = fk("specialties.id", ondelete="SET NULL", nullable=True)
    coordinator_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    status: Mapped[CaseStatus] = mapped_column(
        sa_enum(CaseStatus), nullable=False, default=CaseStatus.ENQUIRY, server_default="enquiry", index=True
    )
    # health free text: encrypted at rest (app/core/crypto.py)
    patient_notes: Mapped[str | None] = mapped_column(EncryptedText())
    medical_summary: Mapped[str | None] = mapped_column(EncryptedText())
    created_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Legal hold on the case: blocks erasure of the patient's account and retention purges of its files.
    legal_hold: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    legal_hold_reason: Mapped[str | None] = mapped_column(String(500))
    legal_hold_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    legal_hold_set_by: Mapped[uuid.UUID | None] = fk(
        "users.id", ondelete="SET NULL", nullable=True, index=False
    )
    emergency_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """When the patient (or their agent) acknowledged the emergency guidance of an ``emergency`` screening;
    the booking flow is blocked until then (INTEGRATION_BACKLOG #13)."""
    emergency_acknowledged_by_user_id: Mapped[uuid.UUID | None] = fk(
        "users.id", ondelete="SET NULL", nullable=True
    )
    # Quick-quote promise (phase 1): the hospital should send a quote by ``quote_due_at`` (created +
    # QUOTE_SLA_HOURS). ``first_quote_at`` is when the first quote was sent. The two ``*_sent_at`` columns
    # dedupe the reminder (QUOTE_REMINDER_HOURS after creation) and the overdue escalation.
    quote_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    first_quote_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quote_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quote_overdue_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quote_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    """Cases created together by one multi-hospital quote request (``POST /cases/quote-request``)."""

    quotes: Mapped[list[Quote]] = relationship(
        "Quote", back_populates="case", lazy="raise", order_by="Quote.created_at", passive_deletes=True
    )
    bookings: Mapped[list[Booking]] = relationship(
        "Booking", back_populates="case", lazy="raise", order_by="Booking.created_at"
    )
    booking: Mapped[Booking | None] = relationship(
        "Booking",
        primaryjoin="and_(Case.id == foreign(Booking.case_id), Booking.status != 'cancelled')",
        uselist=False,
        viewonly=True,
        lazy="raise",
    )
    """The single non-cancelled booking of the case (read-only; at most one by a partial unique index)."""
    status_history: Mapped[list[CaseStatusHistory]] = relationship(
        "CaseStatusHistory",
        back_populates="case",
        lazy="raise",
        order_by="CaseStatusHistory.created_at",
        passive_deletes=True,
    )


class CaseDocument(UUIDPkMixin, CreatedAtMixin, Base):
    """A patient document shared with a case's hospital (screening/AI-scan reports attached at case creation
    or by a multi-hospital quote request). One document can be shared with several cases; the documents
    policy lets members of the case's hospital read it."""

    __tablename__ = "case_documents"
    __table_args__ = (sa.UniqueConstraint("case_id", "document_id", name="uq_case_documents_case_document"),)

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    document_id: Mapped[uuid.UUID] = fk("documents.id", ondelete="CASCADE")
    shared_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)


class CaseStatusHistory(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "case_status_history"

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    from_status: Mapped[CaseStatus | None] = mapped_column(sa_enum(CaseStatus))
    to_status: Mapped[CaseStatus] = mapped_column(sa_enum(CaseStatus), nullable=False)
    changed_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    note: Mapped[str | None] = mapped_column(Text)

    case: Mapped[Case] = relationship("Case", back_populates="status_history", lazy="raise")


class Quote(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "quotes"
    __table_args__ = (
        sa.CheckConstraint("total_minor >= 0", name="total_nonneg"),
        sa.CheckConstraint(
            "estimated_stay_days IS NULL OR estimated_stay_days >= 0", name="estimated_stay_nonneg"
        ),
    )

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="RESTRICT")
    prepared_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    status: Mapped[QuoteStatus] = mapped_column(
        sa_enum(QuoteStatus), nullable=False, default=QuoteStatus.DRAFT, server_default="draft", index=True
    )
    treatment_plan: Mapped[str | None] = mapped_column(Text)
    line_items: Mapped[list[dict[str, Any]]] = json_list_col()
    total_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    estimated_stay_days: Mapped[int | None] = mapped_column(Integer)
    valid_until: Mapped[date | None] = mapped_column(Date)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_reason: Mapped[str | None] = mapped_column(Text)

    case: Mapped[Case] = relationship("Case", back_populates="quotes", lazy="raise")


_BOOKING_MONEY = (
    "subtotal_minor",
    "discount_minor",
    "service_fee_minor",
    "tax_minor",
    "total_minor",
    "deposit_minor",
    "amount_paid_minor",
    "amount_refunded_minor",
)


class Booking(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        sa.CheckConstraint(" AND ".join(f"{c} >= 0" for c in _BOOKING_MONEY), name="amounts_nonneg"),
        sa.CheckConstraint(
            "installment_months IS NULL OR (installment_months >= 1 AND installment_months <= 24)",
            name="installment_months_range",
        ),
        sa.CheckConstraint(
            "discharge_date IS NULL OR admission_date IS NULL OR discharge_date >= admission_date",
            name="discharge_after_admission",
        ),
        # One active (non-cancelled) booking per case.
        sa.Index(
            "uq_bookings_case_id_active",
            "case_id",
            unique=True,
            postgresql_where=sa.text("status <> 'cancelled'"),
        ),
        sa.Index("ix_bookings_hospital_id_status", "hospital_id", "status"),
        sa.Index("ix_bookings_admission_date", "admission_date"),
    )

    booking_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="RESTRICT")
    quote_id: Mapped[uuid.UUID | None] = fk("quotes.id", ondelete="SET NULL", nullable=True)
    package_id: Mapped[uuid.UUID | None] = fk("treatment_packages.id", ondelete="SET NULL", nullable=True)
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="RESTRICT")
    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="RESTRICT")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id", ondelete="SET NULL", nullable=True)
    procedure_id: Mapped[uuid.UUID | None] = fk("procedures.id", ondelete="SET NULL", nullable=True)
    status: Mapped[BookingStatus] = mapped_column(
        sa_enum(BookingStatus),
        nullable=False,
        default=BookingStatus.PENDING_PAYMENT,
        server_default="pending_payment",
        index=True,
    )
    admission_date: Mapped[date | None] = mapped_column(Date)
    discharge_date: Mapped[date | None] = mapped_column(Date)
    duration_days: Mapped[int | None] = mapped_column(Integer)
    payment_option: Mapped[PaymentOption] = mapped_column(
        sa_enum(PaymentOption), nullable=False, default=PaymentOption.FULL, server_default="full"
    )
    installment_months: Mapped[int | None] = mapped_column(SmallInteger)
    insurance_claim_requested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    currency: Mapped[str] = currency_col("INR")
    subtotal_minor: Mapped[int] = money_col()
    discount_minor: Mapped[int] = money_col()
    service_fee_minor: Mapped[int] = money_col()
    tax_minor: Mapped[int] = money_col()
    total_minor: Mapped[int] = money_col()
    deposit_minor: Mapped[int] = money_col()
    amount_paid_minor: Mapped[int] = money_col()
    amount_refunded_minor: Mapped[int] = money_col()
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    admitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    refund_policy: Mapped[list[dict[str, Any]] | None] = json_list_col(nullable=True)
    """Snapshot of the ``refund_policy`` setting (``[{days_before, refund_pct}]``) taken at confirmation;
    cancellations apply this snapshot (INTEGRATION_BACKLOG #7). NULL until confirmed."""
    meta: Mapped[dict[str, Any]] = json_obj_col()
    """Free-form bookkeeping (e.g. ids of payments/refunds already applied, for idempotent handlers)."""

    case: Mapped[Case] = relationship("Case", back_populates="bookings", lazy="raise")
    checklist_items: Mapped[list[ChecklistItem]] = relationship(
        "ChecklistItem",
        primaryjoin="Booking.case_id == foreign(ChecklistItem.case_id)",
        viewonly=True,
        lazy="raise",
        order_by="ChecklistItem.sort_order",
    )
    itinerary_items: Mapped[list[ItineraryItem]] = relationship(
        "ItineraryItem",
        primaryjoin="Booking.case_id == foreign(ItineraryItem.case_id)",
        viewonly=True,
        lazy="raise",
        order_by="ItineraryItem.starts_at",
    )

    @property
    def balance_due_minor(self) -> int:
        return max(self.total_minor - self.amount_paid_minor + self.amount_refunded_minor, 0)


class Consultation(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "consultations"
    __table_args__ = (
        sa.CheckConstraint("fee_minor >= 0", name="fee_nonneg"),
        sa.CheckConstraint("duration_min > 0", name="duration_positive"),
    )

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    doctor_id: Mapped[uuid.UUID] = fk("doctors.id", ondelete="RESTRICT")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="RESTRICT")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    mode: Mapped[ConsultationMode] = mapped_column(
        sa_enum(ConsultationMode), nullable=False, default=ConsultationMode.VIDEO, server_default="video"
    )
    meeting_url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[ConsultationStatus] = mapped_column(
        sa_enum(ConsultationStatus),
        nullable=False,
        default=ConsultationStatus.REQUESTED,
        server_default="requested",
        index=True,
    )
    fee_minor: Mapped[int] = money_col()
    currency: Mapped[str] = currency_col("INR")
    notes: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[ConsultationKind] = mapped_column(
        sa_enum(ConsultationKind),
        nullable=False,
        default=ConsultationKind.STANDARD,
        server_default="standard",
        index=True,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Follow-ups: roughly when the call should happen (discharge + N days); the hospital picks the time."""
    followup_day: Mapped[int | None] = mapped_column(SmallInteger)
    """Automatic aftercare follow-ups: the day after discharge it was planned for (7, 30, 90 ...)."""
    reminder_24h_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminder_1h_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AftercareCheckin(UUIDPkMixin, TimestampMixin, Base):
    """A short recovery questionnaire the patient answers after discharge (phase 1 aftercare).

    ``answers``: ``{pain: 0-10, fever, wound_concerns, breathlessness: bool, medication_adherence:
    "all"|"some"|"none"}``. Free text is encrypted at rest. ``red_flags`` lists the alarming answers."""

    __tablename__ = "aftercare_checkins"
    __table_args__ = (
        sa.UniqueConstraint("case_id", "day", name="uq_aftercare_checkins_case_day"),
        sa.Index("ix_aftercare_checkins_due_at", "due_at"),
    )

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    answers: Mapped[dict[str, Any]] = json_obj_col()
    free_text: Mapped[str | None] = mapped_column(EncryptedString())
    red_flags: Mapped[list[str]] = json_list_col()


class ChecklistItem(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "checklist_items"
    __table_args__ = (sa.UniqueConstraint("case_id", "key"),)

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    key: Mapped[ChecklistKey] = mapped_column(sa_enum(ChecklistKey), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[ChecklistStatus] = mapped_column(
        sa_enum(ChecklistStatus),
        nullable=False,
        default=ChecklistStatus.PENDING,
        server_default="pending",
        index=True,
    )
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class ItineraryItem(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "itinerary_items"
    __table_args__ = (sa.Index("ix_itinerary_items_case_id_starts_at", "case_id", "starts_at"),)

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    kind: Mapped[ItineraryKind] = mapped_column(sa_enum(ItineraryKind), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[str | None] = mapped_column(String(255))
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)
    status: Mapped[ItineraryStatus] = mapped_column(
        sa_enum(ItineraryStatus),
        nullable=False,
        default=ItineraryStatus.SCHEDULED,
        server_default="scheduled",
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
