"""Pydantic schemas for cases, quotes, bookings, checklist, itinerary and consultations (PLAN 8.7)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.currency import DisplayMoney
from app.core.enums import (
    BookingStatus,
    CaseStatus,
    ChecklistKey,
    ChecklistStatus,
    ConsultationKind,
    ConsultationMode,
    ConsultationStatus,
    DocumentKind,
    DocumentStatus,
    ItineraryKind,
    ItineraryStatus,
    PackageTier,
    PaymentOption,
    QuoteLineCategory,
    QuoteStatus,
    Urgency,
)
from app.modules.cases.common import CancellationInitiator


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------------------------- references
class PatientRef(_Out):
    id: uuid.UUID
    full_name: str
    nationality: str | None = None
    gender: str | None = None
    age: int | None = None


class AgentRef(_Out):
    id: uuid.UUID
    agency_name: str


class HospitalRef(_Out):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None = None


class DoctorRef(_Out):
    id: uuid.UUID
    full_name: str
    specialty_name: str | None = None


class NamedRef(_Out):
    id: uuid.UUID
    slug: str
    name: str


class UserRef(_Out):
    id: uuid.UUID
    full_name: str


class PackageOut(_Out):
    id: uuid.UUID
    name: str
    tier: PackageTier
    price_minor: int
    original_price_minor: int | None = None
    currency: str
    display_price: DisplayMoney | None = None
    display_original_price: DisplayMoney | None = None
    description: str | None = None
    includes: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------------------------------------------- quotes
class QuoteLineItem(_In):
    category: QuoteLineCategory
    description: str = Field(min_length=1, max_length=500)
    amount_minor: int = Field(ge=0, le=10**13)


class QuoteCreate(_In):
    treatment_plan: str = Field(min_length=1, max_length=20_000)
    line_items: list[QuoteLineItem] = Field(min_length=1, max_length=50)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    estimated_stay_days: int | None = Field(default=None, ge=0, le=365)
    valid_until: date

    @field_validator("currency")
    @classmethod
    def _upper(cls, v: str) -> str:
        if not v.isalpha():
            raise ValueError("currency must be an ISO-4217 code")
        return v.upper()


class QuoteReject(_In):
    reason: str | None = Field(default=None, max_length=2000)


class QuoteOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    status: QuoteStatus
    treatment_plan: str | None = None
    # With ?currency= (or a patient's preferred currency) each line item also gets ``display_amount``.
    line_items: list[dict[str, Any]] = Field(default_factory=list)
    total_minor: int
    currency: str
    # Approximate total in the viewer's currency; the hospital is paid in ``currency``.
    display_total: DisplayMoney | None = None
    estimated_stay_days: int | None = None
    valid_until: date | None = None
    prepared_by_name: str | None = None
    rejected_reason: str | None = None
    created_at: datetime
    accepted_at: datetime | None = None


# --------------------------------------------------------------------------------------------- bookings
class BookingCreate(_In):
    case_id: uuid.UUID
    quote_id: uuid.UUID | None = None
    package_id: uuid.UUID | None = None
    admission_date: date
    payment_option: PaymentOption = PaymentOption.DEPOSIT
    installment_months: int | None = Field(default=None, ge=1, le=24)
    insurance_claim_requested: bool = False

    @model_validator(mode="after")
    def _check(self) -> BookingCreate:
        if self.quote_id is not None and self.package_id is not None:
            raise ValueError("Pass either quote_id or package_id, not both")
        if self.payment_option == PaymentOption.INSTALLMENTS and self.installment_months is None:
            raise ValueError("installment_months is required for the installments payment option")
        return self


class BookingCancel(_In):
    reason: str = Field(min_length=1, max_length=2000)
    initiated_by: CancellationInitiator | None = None
    """Staff only (e.g. ``patient`` when support cancels at the patient's request). Default = the actor's
    side: patient/agent -> ``patient`` (refund tiers), hospital -> ``hospital``, admin/super_admin ->
    ``platform``, other staff -> ``patient`` (hospital and platform cancellations refund 100%; only
    admin/super_admin may choose them as staff, and the refund then needs a finance approval)."""


class RefundTier(_Out):
    days_before: int
    refund_pct: int


class BookingAdmit(_In):
    note: str | None = Field(default=None, max_length=2000)


class BookingComplete(_In):
    note: str | None = Field(default=None, max_length=2000)
    discharge_date: date | None = None


class BookingOut(_Out):
    id: uuid.UUID
    booking_number: str
    case_id: uuid.UUID
    status: BookingStatus
    patient: PatientRef
    hospital: HospitalRef
    doctor: DoctorRef | None = None
    procedure: NamedRef | None = None
    package: PackageOut | None = None
    quote_id: uuid.UUID | None = None
    admission_date: date | None = None
    discharge_date: date | None = None
    duration_days: int | None = None
    payment_option: PaymentOption
    installment_months: int | None = None
    insurance_claim_requested: bool
    currency: str
    subtotal_minor: int
    discount_minor: int
    service_fee_minor: int
    tax_minor: int
    total_minor: int
    deposit_minor: int
    amount_paid_minor: int
    amount_refunded_minor: int
    balance_due_minor: int
    display_total: DisplayMoney | None = None
    display_deposit: DisplayMoney | None = None
    display_amount_paid: DisplayMoney | None = None
    display_balance_due: DisplayMoney | None = None
    cancel_reason: str | None = None
    refund_policy: list[RefundTier] | None = None
    created_at: datetime
    confirmed_at: datetime | None = None
    admitted_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None


class BookingCancelOut(BookingOut):
    refundable_minor: int
    refund_pct: int


# --------------------------------------------------------------------------------------------- cases
class CaseCreate(_In):
    hospital_id: uuid.UUID
    doctor_id: uuid.UUID | None = None
    procedure_id: uuid.UUID | None = None
    specialty_id: uuid.UUID | None = None
    screening_id: uuid.UUID | None = None
    patient_notes: str | None = Field(default=None, max_length=10_000)
    patient_id: uuid.UUID | None = None
    consent_share: bool = False
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    """The patient's own medical documents to share with the hospital (the screening's reports are shared
    automatically)."""


class QuoteRequestCreate(_In):
    """``POST /cases/quote-request``: ask up to ``QUOTE_MAX_HOSPITALS`` hospitals for a quote at once."""

    hospital_ids: list[uuid.UUID] = Field(min_length=1, max_length=10)
    procedure_id: uuid.UUID | None = None
    specialty_id: uuid.UUID | None = None
    screening_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    patient_id: uuid.UUID | None = None
    consent_share: bool = False

    @field_validator("hospital_ids")
    @classmethod
    def _distinct(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(v)) != len(v):
            raise ValueError("Each hospital may only be listed once")
        return v


class CaseStatusChange(_In):
    to_status: CaseStatus
    note: str | None = Field(default=None, max_length=2000)
    initiated_by: CancellationInitiator | None = None
    """Only for cancelling a case with an active booking; same rules as ``BookingCancel.initiated_by``."""


class CaseStatusCounts(_Out):
    """``GET /cases/status-counts``: visible cases per status (every status key present) and their sum."""

    counts: dict[str, int]
    total: int


class EmergencyAck(_In):
    acknowledged: bool

    @field_validator("acknowledged")
    @classmethod
    def _must_ack(cls, v: bool) -> bool:
        if not v:
            raise ValueError("The emergency guidance must be acknowledged")
        return v


class AssignCoordinator(_In):
    user_id: uuid.UUID


class TimelineEntry(_Out):
    from_status: CaseStatus | None = None
    to_status: CaseStatus
    note: str | None = None
    changed_by_name: str | None = None
    created_at: datetime


class CaseOut(_Out):
    id: uuid.UUID
    case_number: str
    status: CaseStatus
    patient: PatientRef
    agent: AgentRef | None = None
    hospital: HospitalRef
    doctor: DoctorRef | None = None
    procedure: NamedRef | None = None
    specialty: NamedRef | None = None
    screening_id: uuid.UUID | None = None
    coordinator: UserRef | None = None
    patient_notes: str | None = None
    latest_quote: QuoteOut | None = None
    booking: BookingOut | None = None
    urgency: Urgency | None = None
    emergency_ack_required: bool = False
    emergency_acknowledged_at: datetime | None = None
    quote_due_at: datetime | None = None
    """When the hospital promised a quote by (case created + QUOTE_SLA_HOURS)."""
    first_quote_at: datetime | None = None
    quote_overdue: bool = False
    """True while no quote was sent and ``quote_due_at`` has passed (case still an enquiry)."""
    hours_left: float | None = None
    """Hours until ``quote_due_at`` (0 when overdue); null once a quote was sent or the case moved on."""
    quote_group_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class QuoteGroupCase(_Out):
    case_id: uuid.UUID
    case_number: str
    status: CaseStatus
    hospital: HospitalRef
    doctor: DoctorRef | None = None
    quote_due_at: datetime | None = None
    quote_overdue: bool = False
    hours_left: float | None = None
    quote: QuoteOut | None = None
    """The latest quote of the case (null while the hospital has not answered)."""
    total_in_currency_minor: int | None = None
    """``quote.total_minor`` converted to ``currency`` (the patient's preferred currency)."""


class QuoteGroupOut(_Out):
    """``POST /cases/quote-request`` / ``GET /cases/quote-groups/{id}``: hospitals' quotes side by side."""

    quote_group_id: uuid.UUID
    patient: PatientRef
    procedure: NamedRef | None = None
    specialty: NamedRef | None = None
    currency: str
    """Currency of ``total_in_currency_minor`` (the patient's preferred currency, INR as a fallback)."""
    created_at: datetime
    cases: list[QuoteGroupCase] = Field(default_factory=list)
    cheapest_case_id: uuid.UUID | None = None


class CaseDocumentOut(_Out):
    id: uuid.UUID
    kind: DocumentKind
    file_name: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    case_id: uuid.UUID | None = None
    patient_id: uuid.UUID | None = None
    created_at: datetime
    uploaded_by_name: str | None = None


class CaseDetail(CaseOut):
    medical_summary: str | None = None
    quotes: list[QuoteOut] = Field(default_factory=list)
    timeline: list[TimelineEntry] = Field(default_factory=list)
    screening: dict[str, Any] | None = None
    documents: list[CaseDocumentOut] = Field(default_factory=list)


# --------------------------------------------------------------------------------------------- checklist
class ChecklistItemOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    key: ChecklistKey
    label: str
    status: ChecklistStatus
    done_at: datetime | None = None
    sort_order: int


class ChecklistItemUpdate(_In):
    status: ChecklistStatus


# --------------------------------------------------------------------------------------------- itinerary
class ItineraryItemCreate(_In):
    kind: ItineraryKind
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = Field(default=None, max_length=255)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _times(self) -> ItineraryItemCreate:
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must not be before starts_at")
        return self


class ItineraryItemUpdate(_In):
    kind: ItineraryKind | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = Field(default=None, max_length=255)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    status: ItineraryStatus | None = None


class ItineraryItemOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    kind: ItineraryKind
    title: str
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: ItineraryStatus
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------------------------- consultations
class ConsultationCreate(_In):
    case_id: uuid.UUID
    kind: ConsultationKind = ConsultationKind.STANDARD
    """``followup``: an aftercare video follow-up (also allowed on a completed case within
    AFTERCARE_WINDOW_DAYS of discharge)."""
    doctor_id: uuid.UUID | None = None
    mode: ConsultationMode = ConsultationMode.VIDEO
    preferred_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=5000)


class ConsultationUpdate(_In):
    status: ConsultationStatus | None = None
    scheduled_at: datetime | None = None
    duration_min: int | None = Field(default=None, ge=5, le=240)
    meeting_url: AnyHttpUrl | None = None
    mode: ConsultationMode | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("meeting_url")
    @classmethod
    def _https_only(cls, v: AnyHttpUrl | None) -> AnyHttpUrl | None:
        # SEC-041: a consultation link carries a patient's medical conversation; never plain http.
        if v is not None and v.scheme != "https":
            raise ValueError("The meeting link must start with https://")
        return v


class ConsultationOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    doctor: DoctorRef | None = None
    patient: PatientRef | None = None
    hospital: HospitalRef | None = None
    scheduled_at: datetime | None = None
    duration_min: int
    mode: ConsultationMode
    meeting_url: str | None = None
    status: ConsultationStatus
    kind: ConsultationKind = ConsultationKind.STANDARD
    due_at: datetime | None = None
    """Follow-ups: roughly when the call should happen; the hospital confirms the exact time."""
    followup_day: int | None = None
    fee_minor: int
    currency: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
