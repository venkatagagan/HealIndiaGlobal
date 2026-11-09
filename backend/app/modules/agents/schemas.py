"""Pydantic schemas for the agent portal (PLAN 8.10)."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.enums import (
    AgentStatus,
    AgentTier,
    ConsentKind,
    Gender,
    KycStatus,
    PayeeType,
    SettlementItemStatus,
)

_COUNTRY_RE = re.compile(r"^[A-Z]{2}$")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def _country(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().upper()
    if not value:
        return None
    if not _COUNTRY_RE.match(value):
        raise ValueError("must be an ISO-3166 alpha-2 country code")
    return value


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


# -------------------------------------------------------------------------------------------------- profile
class AgentProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    agency_name: str
    agent_code: str
    country: str | None
    city: str | None
    phone: str | None
    website: str | None
    status: AgentStatus
    kyc_status: KycStatus
    tier: AgentTier
    commission_rate_bps: int | None
    approved_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    full_name: str | None = None
    email: str | None = None
    kyc_documents_count: int = 0


class AgentProfileIn(_In):
    agency_name: str | None = Field(default=None, min_length=2, max_length=200)
    country: str | None = Field(default=None, max_length=2)
    city: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=512)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("country")
    @classmethod
    def _v_country(cls, value: str | None) -> str | None:
        return _country(value)

    @field_validator("city", "phone", "full_name")
    @classmethod
    def _v_clean(cls, value: str | None) -> str | None:
        return _clean(value)

    @field_validator("agency_name")
    @classmethod
    def _agency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("agency name is too short")
        return value

    @field_validator("website")
    @classmethod
    def _website(cls, value: str | None) -> str | None:
        value = _clean(value)
        if value is None:
            return None
        if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", value, re.IGNORECASE):
            raise ValueError("must be an http(s) URL")
        return value


# ------------------------------------------------------------------------------------------------ dashboard
class AgentMonthPoint(BaseModel):
    month: str
    cases: int
    bookings: int
    commission_minor: int


class AgentDashboardOut(BaseModel):
    patients_total: int
    active_cases: int
    bookings_confirmed: int
    commission_pending_minor: int
    commission_paid_minor: int
    currency: str
    conversion_rate: float
    monthly: list[AgentMonthPoint]
    recent_cases: list[dict[str, Any]]


# ------------------------------------------------------------------------------------------------- patients
# -------------------------------------------------------------------------------------------------- consent
# Backlog #30: an agent creating a patient attests that the patient consented (off-platform: in person, by
# phone, ...). The attestation is audit-logged; it is NOT written as the patient's own ``consents`` row, so
# the patient still has to confirm on first login (POST /auth/consents) before the consent counts as theirs.
AgentConsentMethod = Literal["in_person", "phone", "video_call", "written", "email"]
AgentConsentStatus = Literal["not_recorded", "pending_patient_confirmation", "confirmed", "withdrawn"]
REQUIRED_PATIENT_CONSENTS: tuple[ConsentKind, ...] = (ConsentKind.TERMS, ConsentKind.PRIVACY)
DEFAULT_AGENT_CONSENTS: tuple[ConsentKind, ...] = (
    ConsentKind.TERMS,
    ConsentKind.PRIVACY,
    ConsentKind.SHARE_WITH_HOSPITALS,
)


class AgentConsentAttestationIn(_In):
    """The agent confirms that the patient consented to ``consent_kinds`` (terms + privacy are mandatory)."""

    consent_attested: bool
    consent_kinds: list[ConsentKind] = Field(
        default_factory=lambda: list(DEFAULT_AGENT_CONSENTS), max_length=5
    )
    consent_method: AgentConsentMethod = "in_person"
    consent_note: str | None = Field(default=None, max_length=500)

    @field_validator("consent_attested")
    @classmethod
    def _attested(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("confirm that the patient has consented")
        return value

    @field_validator("consent_kinds")
    @classmethod
    def _kinds(cls, value: list[ConsentKind]) -> list[ConsentKind]:
        kinds = list(dict.fromkeys(value))
        missing = [k.value for k in REQUIRED_PATIENT_CONSENTS if k not in kinds]
        if missing:
            raise ValueError(f"must include {', '.join(missing)}")
        return kinds

    @field_validator("consent_note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return _clean(value)


class AgentPatientConsentOut(BaseModel):
    status: AgentConsentStatus
    kinds: list[ConsentKind] = Field(default_factory=list)
    method: str | None = None
    version: str | None = None
    attested_at: datetime | None = None
    attested_by_user_id: uuid.UUID | None = None
    patient_confirmed_at: datetime | None = None
    pending_kinds: list[ConsentKind] = Field(default_factory=list)


class AgentPatientOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    first_name: str | None
    last_name: str | None
    full_name: str
    email: str | None
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
    is_managed: bool
    account_activated: bool
    cases_count: int = 0
    #: cases in an open status (enquiry .. in_treatment)
    active_cases_count: int = 0
    screenings_count: int = 0
    consent: AgentPatientConsentOut = Field(
        default_factory=lambda: AgentPatientConsentOut(status="not_recorded")
    )
    created_at: datetime
    updated_at: datetime


class AgentPatientCreate(AgentConsentAttestationIn):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    nationality: str = Field(min_length=2, max_length=2)
    date_of_birth: date | None = None
    gender: Gender | None = None
    medical_history: str | None = Field(default=None, max_length=10_000)

    @field_validator("nationality")
    @classmethod
    def _v_country(cls, value: str) -> str:
        result = _country(value)
        if result is None:
            raise ValueError("nationality is required")
        return result

    @field_validator("first_name", "last_name")
    @classmethod
    def _names(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("phone", "medical_history")
    @classmethod
    def _opt(cls, value: str | None) -> str | None:
        return _clean(value)

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, value: date | None) -> date | None:
        if value is not None and (value > date.today() or value.year < 1900):
            raise ValueError("invalid date of birth")
        return value


class AddressIn(_In):
    line1: str | None = Field(default=None, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=2)


class EmergencyContactIn(_In):
    name: str | None = Field(default=None, max_length=200)
    relationship: str | None = Field(default=None, max_length=60)
    phone: str | None = Field(default=None, max_length=32)


class AgentPatientUpdate(_In):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    date_of_birth: date | None = None
    gender: Gender | None = None
    nationality: str | None = Field(default=None, max_length=2)
    country_of_residence: str | None = Field(default=None, max_length=2)
    passport_number: str | None = Field(default=None, min_length=4, max_length=20)
    passport_expiry: date | None = None
    phone: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    address: AddressIn | None = None
    emergency_contact: EmergencyContactIn | None = None
    preferred_language: str | None = Field(default=None, max_length=10)
    blood_group: str | None = Field(default=None, max_length=5)
    allergies: str | None = Field(default=None, max_length=5000)
    medical_history: str | None = Field(default=None, max_length=10_000)
    insurance_provider: str | None = Field(default=None, max_length=200)
    insurance_policy_number: str | None = Field(default=None, max_length=64)
    preferred_currency: str | None = Field(default=None, max_length=3)

    @field_validator("nationality", "country_of_residence")
    @classmethod
    def _v_country(cls, value: str | None) -> str | None:
        return _country(value)

    @field_validator("passport_number")
    @classmethod
    def _passport(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = re.sub(r"\s+", "", value).upper()
        if not re.match(r"^[A-Z0-9]{4,20}$", value):
            raise ValueError("passport number must be 4-20 letters/digits")
        return value

    @field_validator("preferred_currency")
    @classmethod
    def _ccy(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().upper()
        if not _CURRENCY_RE.match(value):
            raise ValueError("must be an ISO-4217 currency code")
        return value

    @field_validator("first_name", "last_name")
    @classmethod
    def _names(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


# ----------------------------------------------------------------------------------- referral & commissions
class ReferralOut(BaseModel):
    agent_code: str
    referral_url: str


class SettlementItemOut(BaseModel):
    id: uuid.UUID
    payee_type: PayeeType
    payee_id: uuid.UUID
    payee_name: str | None
    booking_id: uuid.UUID
    booking_number: str | None
    gross_minor: int
    commission_minor: int
    tax_minor: int
    tds_minor: int
    net_minor: int
    currency: str
    status: SettlementItemStatus
    eligible_at: datetime | None
    hold_reason: str | None
    batch_id: uuid.UUID | None
    created_at: datetime


class AgentPatientCounts(BaseModel):
    """``GET /agent-portal/patients/counts``: patients per consent status for the list filters (the consent
    filter itself ignored) and per nationality (the nationality filter ignored) - drives tabs and options."""

    counts: dict[str, int]
    total: int
    nationalities: dict[str, int] = Field(default_factory=dict)


class AgentCommissionOut(SettlementItemOut):
    """A commission item enriched with its booking's case, hospital and patient (agent portal list)."""

    case_id: uuid.UUID | None = None
    case_number: str | None = None
    hospital_id: uuid.UUID | None = None
    hospital_name: str | None = None
    patient_id: uuid.UUID | None = None
    patient_name: str | None = None


class AgentCommissionStatusCounts(BaseModel):
    """``GET /agent-portal/commissions/status-counts``: items and net amount per status for the list filters
    (the status filter itself ignored)."""

    counts: dict[str, int]
    net_minor: dict[str, int] = Field(default_factory=dict)
    total: int
