"""Pydantic schemas for the patients module (PLAN 8.2) and the embedded cards it returns."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import (
    BookingStatus,
    ChecklistKey,
    ChecklistStatus,
    Gender,
    ItineraryKind,
    ItineraryStatus,
    PackageTier,
    PaymentOption,
    SavedEntityType,
    ScreeningStatus,
    Urgency,
)
from app.modules.auth.schemas import normalize_country, normalize_language, normalize_phone

_DOC_NUMBER_RE = re.compile(r"^[A-Z0-9]{5,20}$")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


def normalize_passport(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"[\s\-]", "", value).upper()
    if not cleaned:
        return None
    if not _DOC_NUMBER_RE.match(cleaned):
        raise ValueError("passport number must be 5-20 letters or digits")
    return cleaned


def normalize_policy_number(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > 64 or not re.match(r"^[A-Za-z0-9\-/ .]+$", cleaned):
        raise ValueError("invalid insurance policy number")
    return cleaned


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --- profile ---------------------------------------------------------------------------------------------
class PostalAddress(_In):
    line1: str | None = Field(default=None, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=2)

    _country = field_validator("country")(normalize_country)


class EmergencyContact(_In):
    name: str = Field(min_length=1, max_length=200)
    relationship: str = Field(min_length=1, max_length=60)
    phone: str = Field(min_length=4, max_length=32)

    _phone = field_validator("phone")(normalize_phone)


class PatientProfileIn(_In):
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    date_of_birth: date | None = None
    gender: Gender | None = None
    nationality: str | None = Field(default=None, max_length=2)
    country_of_residence: str | None = Field(default=None, max_length=2)
    passport_number: str | None = Field(default=None, max_length=32)
    passport_expiry: date | None = None
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    address: PostalAddress | None = None
    emergency_contact: EmergencyContact | None = None
    preferred_language: str | None = Field(default=None, max_length=10)
    blood_group: str | None = Field(default=None, max_length=5)
    allergies: str | None = Field(default=None, max_length=5000)
    medical_history: str | None = Field(default=None, max_length=20000)
    insurance_provider: str | None = Field(default=None, max_length=200)
    insurance_policy_number: str | None = Field(default=None, max_length=64)
    preferred_currency: str | None = Field(default=None, max_length=3)

    _countries = field_validator("nationality", "country_of_residence")(normalize_country)
    _phones = field_validator("phone", "whatsapp")(normalize_phone)
    _lang = field_validator("preferred_language")(normalize_language)
    _passport = field_validator("passport_number")(normalize_passport)
    _policy = field_validator("insurance_policy_number")(normalize_policy_number)

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, value: date | None) -> date | None:
        if value is not None and (value > date.today() or value.year < 1900):
            raise ValueError("date_of_birth is not plausible")
        return value

    @field_validator("blood_group")
    @classmethod
    def _blood(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().upper()
        if normalized not in _BLOOD_GROUPS:
            raise ValueError("blood_group must be one of " + ", ".join(sorted(_BLOOD_GROUPS)))
        return normalized

    @field_validator("preferred_currency")
    @classmethod
    def _ccy(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not _CURRENCY_RE.match(normalized):
            raise ValueError("must be an ISO 4217 currency code")
        return normalized


class PatientProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str | None
    full_name: str
    first_name: str | None
    last_name: str | None
    date_of_birth: date | None
    gender: Gender | None
    nationality: str | None
    country_of_residence: str | None
    passport_last4: str | None
    passport_expiry: date | None
    phone: str | None
    whatsapp: str | None
    address: dict[str, Any] | None
    emergency_contact: dict[str, Any] | None
    preferred_language: str | None
    blood_group: str | None
    allergies: str | None
    medical_history: str | None
    insurance_provider: str | None
    insurance_policy_last4: str | None
    referred_by_agent_id: uuid.UUID | None
    managed_by_agent_id: uuid.UUID | None
    preferred_currency: str
    # False while the currency still follows the country of residence (set true by choosing one).
    currency_set_by_user: bool = False
    created_at: datetime
    updated_at: datetime


# --- companions ------------------------------------------------------------------------------------------
class CompanionIn(_In):
    full_name: str = Field(min_length=1, max_length=200)
    relationship: str = Field(min_length=1, max_length=60)
    nationality: str | None = Field(default=None, max_length=2)
    date_of_birth: date | None = None
    passport_number: str | None = Field(default=None, max_length=32)

    _country = field_validator("nationality")(normalize_country)
    _passport = field_validator("passport_number")(normalize_passport)


class CompanionUpdate(_In):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    relationship: str | None = Field(default=None, min_length=1, max_length=60)
    nationality: str | None = Field(default=None, max_length=2)
    date_of_birth: date | None = None
    passport_number: str | None = Field(default=None, max_length=32)

    _country = field_validator("nationality")(normalize_country)
    _passport = field_validator("passport_number")(normalize_passport)


class CompanionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    full_name: str
    relationship: str | None
    nationality: str | None
    date_of_birth: date | None
    passport_last4: str | None
    created_at: datetime
    updated_at: datetime


# --- embedded catalog cards ------------------------------------------------------------------------------
class IdSlugName(BaseModel):
    id: uuid.UUID
    slug: str
    name: str


class IdName(BaseModel):
    id: uuid.UUID
    name: str


class IdFullName(BaseModel):
    id: uuid.UUID
    full_name: str


class HospitalRefMini(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None
    accreditations: list[str]


class HospitalCard(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None
    state: str | None
    accreditations: list[str]
    rating_avg: float | None
    rating_count: int
    logo_url: str | None
    cover_image_url: str | None
    specialties: list[str]
    languages: list[str]
    international_desk: bool
    starting_price_minor: int | None
    currency: str


class DoctorCard(BaseModel):
    id: uuid.UUID
    slug: str
    full_name: str
    gender: Gender | None
    photo_url: str | None
    specialty: IdSlugName
    qualifications: list[str]
    experience_years: int | None
    languages: list[str]
    success_rate_pct: float | None
    rating_avg: float | None
    rating_count: int
    consultation_fee_minor: int | None
    currency: str
    teleconsult_available: bool
    hospital: HospitalRefMini


class CostBenchmarkOut(BaseModel):
    country_code: str
    currency: str
    cost_min_minor: int
    cost_max_minor: int
    wait_time_text: str | None


class ProcedureOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    specialty: IdSlugName
    hospital_stay_days: int | None
    recovery_days: int | None
    total_stay_days: int | None
    india_price_min_minor: int | None
    india_price_max_minor: int | None
    currency: str
    benchmarks: list[CostBenchmarkOut]


class SavedItemIn(_In):
    entity_type: SavedEntityType
    entity_id: uuid.UUID


class SavedItemOut(BaseModel):
    id: uuid.UUID
    entity_type: SavedEntityType
    entity_id: uuid.UUID
    created_at: datetime
    hospital: HospitalCard | None = None
    doctor: DoctorCard | None = None
    procedure: ProcedureOut | None = None


# --- dashboard -------------------------------------------------------------------------------------------
class PackageOut(BaseModel):
    id: uuid.UUID
    name: str
    tier: PackageTier
    price_minor: int
    original_price_minor: int | None
    currency: str
    description: str | None
    includes: dict[str, Any]


class BookingHospitalRef(BaseModel):
    id: uuid.UUID
    name: str
    city: str | None


class BookingOut(BaseModel):
    id: uuid.UUID
    booking_number: str
    case_id: uuid.UUID
    status: BookingStatus
    patient: IdFullName
    hospital: BookingHospitalRef
    doctor: IdFullName | None
    procedure: IdName | None
    package: PackageOut | None
    quote_id: uuid.UUID | None
    admission_date: date | None
    discharge_date: date | None
    duration_days: int | None
    payment_option: PaymentOption
    installment_months: int | None
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
    created_at: datetime
    confirmed_at: datetime | None
    admitted_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    key: ChecklistKey
    label: str
    status: ChecklistStatus
    done_at: datetime | None
    sort_order: int


class ItineraryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    kind: ItineraryKind
    title: str
    description: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    location: str | None
    lat: float | None
    lng: float | None
    status: ItineraryStatus
    created_at: datetime


class CoordinatorRef(BaseModel):
    id: uuid.UUID
    full_name: str
    phone: str | None


class ScreeningLite(BaseModel):
    id: uuid.UUID
    status: ScreeningStatus
    specialty: IdSlugName | None
    urgency: Urgency | None
    summary: str | None
    created_at: datetime
    submitted_at: datetime | None
    completed_at: datetime | None


class PatientDashboardOut(BaseModel):
    next_booking: BookingOut | None
    days_until_treatment: int | None
    checklist: list[ChecklistItemOut]
    today_schedule: list[ItineraryItemOut]
    active_cases: int
    unread_notifications: int
    coordinator: CoordinatorRef | None
    recent_screenings: list[ScreeningLite]
