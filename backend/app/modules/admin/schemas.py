"""Request/response shapes for the admin console API (PLAN 8.13).

Field names follow ``web/packages/shared/src/api/types.ts`` (``AdminDashboard``, ``AdminUserOut``,
``HospitalProfileOut``, ``AdminAgentOut``, catalog ``*In``/``*Out``, ``PlatformSettingOut``, ``AuditLogOut``,
``RevenueReport``, ``CasesReport``, ``StaffMemberOut``).
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.enums import (
    AccommodationType,
    AgentStatus,
    AgentTier,
    HospitalMemberRole,
    HospitalStatus,
    KycStatus,
    RateUnit,
    ServiceKind,
    UserRole,
    UserStatus,
)
from app.core.money import MAX_COMMISSION_BPS
from app.modules.auth.schemas import UserOut
from app.modules.catalog.schemas import HospitalCard
from app.modules.documents.schemas import DocumentOut

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CCY_RE = re.compile(r"^[A-Z]{3}$")
COUNTRY_RE = re.compile(r"^[A-Z]{2}$")

MAX_MINOR = 10**15  # sanity cap for money inputs (fits BIGINT with lots of headroom)


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _slug(value: str) -> str:
    value = value.strip().lower()
    if not SLUG_RE.fullmatch(value):
        raise ValueError(
            "slug must be lowercase letters, digits and single hyphens (e.g. 'knee-replacement')"
        )
    return value


def _ccy(value: str) -> str:
    value = value.strip().upper()
    if not CCY_RE.fullmatch(value):
        raise ValueError("currency must be a 3-letter ISO-4217 code")
    return value


def _country(value: str) -> str:
    value = value.strip().upper()
    if not COUNTRY_RE.fullmatch(value):
        raise ValueError("country_code must be a 2-letter ISO-3166 code")
    return value


def _clean_list(values: list[str] | None, max_items: int = 50) -> list[str]:
    out: list[str] = []
    for v in values or []:
        item = " ".join(str(v).split())
        if item and item not in out:
            out.append(item)
    if len(out) > max_items:
        raise ValueError(f"at most {max_items} items allowed")
    return out


def _check_range(low: int | None, high: int | None, what: str) -> None:
    if low is not None and high is not None and low > high:
        raise ValueError(f"{what}: minimum must not exceed maximum")


# ------------------------------------------------------------------------------------------------ dashboard
class HospitalCounts(BaseModel):
    active: int = 0
    pending_review: int = 0


class AgentCounts(BaseModel):
    active: int = 0
    pending: int = 0


class DashboardMonth(BaseModel):
    month: str
    gmv_minor: int = 0
    revenue_minor: int = 0
    bookings: int = 0
    new_patients: int = 0


class TopHospital(BaseModel):
    id: uuid.UUID
    name: str
    bookings: int
    gmv_minor: int


class TopSpecialty(BaseModel):
    slug: str
    name: str
    cases: int


class AdminDashboard(BaseModel):
    users_by_role: dict[str, int]
    hospitals: HospitalCounts
    agents: AgentCounts
    cases_by_status: dict[str, int]
    bookings_by_status: dict[str, int]
    gmv_minor: int
    revenue_minor: int
    escrow_minor: int
    pending_settlements_minor: int
    currency: str
    monthly: list[DashboardMonth]
    top_hospitals: list[TopHospital]
    top_specialties: list[TopSpecialty]
    open_sos: int


# ---------------------------------------------------------------------------------------------------- users
class AdminUserOut(UserOut):
    last_login_at: datetime | None = None
    locked_until: datetime | None = None
    failed_login_count: int = 0
    deleted_at: datetime | None = None
    updated_at: datetime | None = None


class PatientProfileSummary(_Out):
    id: uuid.UUID
    first_name: str
    last_name: str
    date_of_birth: date | None = None
    gender: str | None = None
    nationality: str | None = None
    country_of_residence: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    passport_last4: str | None = None
    preferred_language: str | None = None
    preferred_currency: str
    referred_by_agent_id: uuid.UUID | None = None
    managed_by_agent_id: uuid.UUID | None = None
    cases_count: int = 0
    bookings_count: int = 0
    created_at: datetime


class AgentSummary(_Out):
    id: uuid.UUID
    agency_name: str
    agent_code: str
    status: AgentStatus
    kyc_status: KycStatus
    tier: AgentTier
    commission_rate_bps: int | None = None
    country: str | None = None
    city: str | None = None


class HospitalMembershipSummary(BaseModel):
    hospital_id: uuid.UUID
    name: str
    slug: str
    status: HospitalStatus
    member_role: HospitalMemberRole


class AdminUserDetail(AdminUserOut):
    patient_profile: PatientProfileSummary | None = None
    agent: AgentSummary | None = None
    hospital_memberships: list[HospitalMembershipSummary] = Field(default_factory=list)
    active_sessions: int = 0


class AdminUserUpdateIn(_In):
    status: UserStatus | None = None
    role: UserRole | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> AdminUserUpdateIn:
        if self.status is None and self.role is None:
            raise ValueError("provide status and/or role")
        return self


class StaffCreateIn(_In):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    role: UserRole
    password: str = Field(min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=32)


class StaffMemberOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str | None
    role: UserRole
    phone: str | None = None


# ------------------------------------------------------------------------------------------------ hospitals
class HospitalProfileOut(HospitalCard):
    legal_name: str | None = None
    description: str | None = None
    country: str = "IN"
    address: str | None = None
    pincode: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    established_year: int | None = None
    bed_count: int | None = None
    airport_distance_km: float | None = None
    status: HospitalStatus
    kyc_status: KycStatus
    gstin: str | None = None
    pan_last4: str | None = None
    commission_rate_bps: int | None = None
    settlement_cycle_days: int | None = None
    is_featured: bool = False
    approved_at: datetime | None = None
    approved_by: uuid.UUID | None = None
    rejection_reason: str | None = None
    specialty_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class HospitalMemberOut(BaseModel):
    id: uuid.UUID
    hospital_id: uuid.UUID
    user_id: uuid.UUID
    email: str | None
    full_name: str
    member_role: HospitalMemberRole
    status: UserStatus | None = None
    created_at: datetime


class PayoutAccountOut(BaseModel):
    id: uuid.UUID
    owner_type: str
    owner_id: uuid.UUID
    account_holder_name: str
    account_number_masked: str
    ifsc: str | None = None
    bank_name: str | None = None
    swift: str | None = None
    razorpay_linked_account_id: str | None = None
    is_verified: bool
    is_primary: bool
    status: str


class AdminDoctorOut(BaseModel):
    """Read-only doctor row for hospital review (incl. medical registration, INTEGRATION_BACKLOG #10)."""

    id: uuid.UUID
    slug: str
    full_name: str
    specialty_name: str | None = None
    qualifications: list[str] = Field(default_factory=list)
    experience_years: int | None = None
    is_active: bool
    registration_number: str | None = None
    registration_council: str | None = None
    registration_council_name: str | None = None
    registration_verified: bool = False
    registration_verified_at: datetime | None = None
    registration_verified_by_user_id: uuid.UUID | None = None


class AdminHospitalDetail(HospitalProfileOut):
    #: SEC-020: requested identity/accreditation changes awaiting review (PAN masked)
    pending_profile_values: dict[str, Any] = Field(default_factory=dict)
    kyc_documents: list[DocumentOut] = Field(default_factory=list)
    members: list[HospitalMemberOut] = Field(default_factory=list)
    payout_accounts: list[PayoutAccountOut] = Field(default_factory=list)
    doctors_count: int = 0
    cases_count: int = 0
    doctors: list[AdminDoctorOut] = Field(default_factory=list)
    # Active doctors without a medical registration number/council. Approval warns about these, never blocks.
    doctors_missing_registration: int = 0
    warnings: list[str] = Field(default_factory=list)


class ReasonIn(_In):
    reason: str = Field(min_length=3, max_length=2000)


class OptionalReasonIn(_In):
    reason: str | None = Field(default=None, max_length=2000)


class AdminHospitalUpdateIn(_In):
    commission_rate_bps: int | None = Field(default=None, ge=0, le=MAX_COMMISSION_BPS)
    settlement_cycle_days: int | None = Field(default=None, ge=1, le=365)
    is_featured: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> AdminHospitalUpdateIn:
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        if "is_featured" in self.model_fields_set and self.is_featured is None:
            raise ValueError("is_featured cannot be null")
        return self


# --------------------------------------------------------------------------------------------------- agents
class AdminAgentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    agency_name: str
    agent_code: str
    country: str | None = None
    city: str | None = None
    phone: str | None = None
    website: str | None = None
    status: AgentStatus
    kyc_status: KycStatus
    tier: AgentTier
    commission_rate_bps: int | None = None
    approved_at: datetime | None = None
    approved_by: uuid.UUID | None = None
    rejection_reason: str | None = None
    created_at: datetime
    full_name: str | None = None
    email: str | None = None
    user_status: UserStatus | None = None
    patients_count: int = 0
    kyc_documents: list[DocumentOut] | None = None


class AdminAgentUpdateIn(_In):
    commission_rate_bps: int | None = Field(default=None, ge=0, le=MAX_COMMISSION_BPS)
    tier: AgentTier | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> AdminAgentUpdateIn:
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        if "tier" in self.model_fields_set and self.tier is None:
            raise ValueError("tier cannot be null")
        return self


# -------------------------------------------------------------------------------------------------- catalog
class SpecialtyIn(_In):
    slug: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    icon: str | None = Field(default=None, max_length=64)
    savings_min_pct: int | None = Field(default=None, ge=0, le=100)
    savings_max_pct: int | None = Field(default=None, ge=0, le=100)
    sort_order: int = Field(default=0, ge=-10_000, le=10_000)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def _v_slug(cls, v: str) -> str:
        return _slug(v)

    @model_validator(mode="after")
    def _ranges(self) -> SpecialtyIn:
        _check_range(self.savings_min_pct, self.savings_max_pct, "savings_pct")
        return self


class SpecialtyPatch(_In):
    slug: str | None = Field(default=None, min_length=2, max_length=120)
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    icon: str | None = Field(default=None, max_length=64)
    savings_min_pct: int | None = Field(default=None, ge=0, le=100)
    savings_max_pct: int | None = Field(default=None, ge=0, le=100)
    sort_order: int | None = Field(default=None, ge=-10_000, le=10_000)
    is_active: bool | None = None

    @field_validator("slug")
    @classmethod
    def _v_slug(cls, v: str | None) -> str | None:
        return None if v is None else _slug(v)


class AdminSpecialtyOut(_Out):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None = None
    icon: str | None = None
    savings_min_pct: int | None = None
    savings_max_pct: int | None = None
    sort_order: int = 0
    is_active: bool = True
    procedures_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProcedureIn(_In):
    specialty_id: uuid.UUID
    slug: str = Field(min_length=2, max_length=160)
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    keywords: list[str] = Field(default_factory=list)
    body_areas: list[str] = Field(default_factory=list)
    hospital_stay_days: int | None = Field(default=None, ge=0, le=365)
    recovery_days: int | None = Field(default=None, ge=0, le=730)
    total_stay_days: int | None = Field(default=None, ge=0, le=730)
    india_price_min_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    india_price_max_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    currency: str = "INR"
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def _v_slug(cls, v: str) -> str:
        return _slug(v)

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str) -> str:
        return _ccy(v)

    @field_validator("keywords", "body_areas")
    @classmethod
    def _lists(cls, v: list[str]) -> list[str]:
        return _clean_list(v)

    @model_validator(mode="after")
    def _ranges(self) -> ProcedureIn:
        _check_range(self.india_price_min_minor, self.india_price_max_minor, "india_price")
        return self


class ProcedurePatch(_In):
    specialty_id: uuid.UUID | None = None
    slug: str | None = Field(default=None, min_length=2, max_length=160)
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    keywords: list[str] | None = None
    body_areas: list[str] | None = None
    hospital_stay_days: int | None = Field(default=None, ge=0, le=365)
    recovery_days: int | None = Field(default=None, ge=0, le=730)
    total_stay_days: int | None = Field(default=None, ge=0, le=730)
    india_price_min_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    india_price_max_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    currency: str | None = None
    is_active: bool | None = None

    @field_validator("slug")
    @classmethod
    def _v_slug(cls, v: str | None) -> str | None:
        return None if v is None else _slug(v)

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str | None) -> str | None:
        return None if v is None else _ccy(v)

    @field_validator("keywords", "body_areas")
    @classmethod
    def _lists(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_list(v)


class IdSlugName(_Out):
    id: uuid.UUID
    slug: str
    name: str


class CostBenchmarkOut(_Out):
    id: uuid.UUID
    procedure_id: uuid.UUID
    country_code: str
    currency: str
    cost_min_minor: int
    cost_max_minor: int
    wait_time_text: str | None = None
    source: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AdminProcedureOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None = None
    specialty: IdSlugName
    keywords: list[str] = Field(default_factory=list)
    body_areas: list[str] = Field(default_factory=list)
    hospital_stay_days: int | None = None
    recovery_days: int | None = None
    total_stay_days: int | None = None
    india_price_min_minor: int | None = None
    india_price_max_minor: int | None = None
    currency: str
    is_active: bool
    benchmarks: list[CostBenchmarkOut] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CostBenchmarkIn(_In):
    procedure_id: uuid.UUID
    country_code: str
    currency: str
    cost_min_minor: int = Field(ge=0, le=MAX_MINOR)
    cost_max_minor: int = Field(ge=0, le=MAX_MINOR)
    wait_time_text: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=255)

    @field_validator("country_code")
    @classmethod
    def _v_country(cls, v: str) -> str:
        return _country(v)

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str) -> str:
        return _ccy(v)

    @model_validator(mode="after")
    def _ranges(self) -> CostBenchmarkIn:
        _check_range(self.cost_min_minor, self.cost_max_minor, "cost")
        return self


class CostBenchmarkPatch(_In):
    country_code: str | None = None
    currency: str | None = None
    cost_min_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    cost_max_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    wait_time_text: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=255)

    @field_validator("country_code")
    @classmethod
    def _v_country(cls, v: str | None) -> str | None:
        return None if v is None else _country(v)

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str | None) -> str | None:
        return None if v is None else _ccy(v)


class CulturalTipIn(_In):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=10_000)
    image_url: str | None = Field(default=None, max_length=1024)
    category: str | None = Field(default=None, max_length=60)
    sort_order: int = Field(default=0, ge=-10_000, le=10_000)
    is_active: bool = True


class CulturalTipPatch(_In):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    body: str | None = Field(default=None, min_length=2, max_length=10_000)
    image_url: str | None = Field(default=None, max_length=1024)
    category: str | None = Field(default=None, max_length=60)
    sort_order: int | None = Field(default=None, ge=-10_000, le=10_000)
    is_active: bool | None = None


class CulturalTipOut(_Out):
    id: uuid.UUID
    title: str
    body: str
    image_url: str | None = None
    category: str | None = None
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class HospitalLinkIn(_In):
    hospital_id: uuid.UUID
    distance_km: Decimal | None = Field(default=None, ge=0, le=99_999)


class AccommodationProviderIn(_In):
    name: str = Field(min_length=2, max_length=200)
    type: AccommodationType
    city: str = Field(min_length=1, max_length=100)
    address: str | None = Field(default=None, max_length=2000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    star_rating: int | None = Field(default=None, ge=1, le=7)
    amenities: list[str] = Field(default_factory=list)
    nightly_rate_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    currency: str = "INR"
    photos: list[str] = Field(default_factory=list)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    is_active: bool = True
    hospital_links: list[HospitalLinkIn] = Field(default_factory=list, max_length=100)

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str) -> str:
        return _ccy(v)

    @field_validator("amenities", "photos")
    @classmethod
    def _lists(cls, v: list[str]) -> list[str]:
        return _clean_list(v)


class AccommodationProviderPatch(_In):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    type: AccommodationType | None = None
    city: str | None = Field(default=None, min_length=1, max_length=100)
    address: str | None = Field(default=None, max_length=2000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    star_rating: int | None = Field(default=None, ge=1, le=7)
    amenities: list[str] | None = None
    nightly_rate_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    currency: str | None = None
    photos: list[str] | None = None
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    is_active: bool | None = None
    hospital_links: list[HospitalLinkIn] | None = Field(default=None, max_length=100)

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str | None) -> str | None:
        return None if v is None else _ccy(v)

    @field_validator("amenities", "photos")
    @classmethod
    def _lists(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_list(v)


class HospitalLinkOut(BaseModel):
    hospital_id: uuid.UUID
    hospital_name: str | None = None
    distance_km: float | None = None


class AccommodationProviderOut(BaseModel):
    id: uuid.UUID
    name: str
    type: AccommodationType
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    star_rating: int | None = None
    amenities: list[str] = Field(default_factory=list)
    nightly_rate_minor: int | None = None
    currency: str
    photos: list[str] = Field(default_factory=list)
    phone: str | None = None
    email: str | None = None
    is_active: bool
    hospital_links: list[HospitalLinkOut] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ServiceProviderIn(_In):
    kind: ServiceKind
    name: str = Field(min_length=2, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    languages: list[str] = Field(default_factory=list)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    rate_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    rate_unit: RateUnit | None = None
    currency: str = "INR"
    is_active: bool = True

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str) -> str:
        return _ccy(v)

    @field_validator("languages")
    @classmethod
    def _lists(cls, v: list[str]) -> list[str]:
        return _clean_list(v)


class ServiceProviderPatch(_In):
    kind: ServiceKind | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    languages: list[str] | None = None
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    rate_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    rate_unit: RateUnit | None = None
    currency: str | None = None
    is_active: bool | None = None

    @field_validator("currency")
    @classmethod
    def _v_ccy(cls, v: str | None) -> str | None:
        return None if v is None else _ccy(v)

    @field_validator("languages")
    @classmethod
    def _lists(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_list(v)


class ServiceProviderOut(BaseModel):
    id: uuid.UUID
    kind: ServiceKind
    name: str
    city: str | None = None
    languages: list[str] = Field(default_factory=list)
    phone: str | None = None
    email: str | None = None
    rate_minor: int | None = None
    rate_unit: RateUnit | None = None
    currency: str
    rating_avg: float | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FxRateIn(_In):
    quote_currency: str
    # SEC-008: INR per unit; sane absolute bounds (VND ~0.003 ... KWD ~290)
    rate: Decimal = Field(ge=Decimal("0.0001"), le=Decimal("10000"), max_digits=18, decimal_places=8)
    source: str | None = Field(default=None, max_length=60)
    base_currency: Literal["INR"] = "INR"

    @field_validator("quote_currency")
    @classmethod
    def _v_ccy(cls, v: str) -> str:
        return _ccy(v)

    @model_validator(mode="after")
    def _not_base(self) -> FxRateIn:
        if self.quote_currency == self.base_currency:
            raise ValueError("quote_currency must differ from base_currency (INR is always 1)")
        return self


class FxRatePatch(_In):
    rate: Decimal | None = Field(
        default=None, ge=Decimal("0.0001"), le=Decimal("10000"), max_digits=18, decimal_places=8
    )
    source: str | None = Field(default=None, max_length=60)


class FxRateOut(BaseModel):
    id: uuid.UUID
    base_currency: str
    quote_currency: str
    rate: str
    source: str | None = None
    as_of: datetime
    updated_at: datetime | None = None
    #: SEC-008: a large change awaiting a second finance approver
    pending_rate: str | None = None
    pending_requested_by: uuid.UUID | None = None
    pending_requested_at: datetime | None = None


class FxRateDecisionIn(_In):
    #: the pending rate the checker reviewed (approve only); 409 ``request_changed`` if it differs
    rate: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=8)


# ------------------------------------------------------------------------------------------------- settings
class PlatformSettingOut(BaseModel):
    key: str
    value: Any
    updated_at: datetime | None = None
    updated_by: uuid.UUID | None = None
    updated_by_name: str | None = None
    is_default: bool = True
    is_finance: bool = False
    #: "finance" (finance|super_admin), "website" (super_admin only) or "general" (admin|super_admin)
    group: str = "general"
    super_admin_only: bool = False
    #: SEC-011: a change awaiting a second finance approver ({id, value, requested_by, requested_at})
    pending_change: dict[str, Any] | None = None


class SettingChangeApproveIn(_In):
    request_id: uuid.UUID


class SettingChangeRejectIn(_In):
    reason: str | None = Field(default=None, max_length=500)


class PlatformSettingIn(_In):
    value: Any = Field(...)


# ---------------------------------------------------------------------------------------------------- audit
class AuditLogOut(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None = None
    actor_name: str | None = None
    actor_role: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    before: Any = None
    after: Any = None
    created_at: datetime


# -------------------------------------------------------------------------------------------------- reports
ReportGroupBy = Literal["month", "hospital", "specialty"]
ExportType = Literal["bookings", "payments", "settlements"]


class RevenueReportRow(BaseModel):
    key: str
    label: str
    bookings: int = 0
    gmv_minor: int = 0
    revenue_minor: int = 0
    commission_minor: int = 0
    service_fee_minor: int = 0
    refunds_minor: int = 0


class RevenueTotals(BaseModel):
    bookings: int = 0
    gmv_minor: int = 0
    revenue_minor: int = 0
    commission_minor: int = 0
    service_fee_minor: int = 0
    refunds_minor: int = 0


class RevenueReport(BaseModel):
    group_by: ReportGroupBy
    currency: str
    date_from: date
    date_to: date
    rows: list[RevenueReportRow]
    totals: RevenueTotals


class FunnelStage(BaseModel):
    stage: str
    count: int
    pct_of_total: float


class CasesByHospital(BaseModel):
    id: uuid.UUID
    name: str
    cases: int


class CasesMonth(BaseModel):
    month: str
    cases: int
    booked: int


class CasesReport(BaseModel):
    date_from: date
    date_to: date
    total: int
    by_status: dict[str, int]
    funnel: list[FunnelStage]
    by_specialty: list[TopSpecialty]
    by_hospital: list[CasesByHospital]
    conversion_rate: float
    quote_rate: float
    monthly: list[CasesMonth]


# ------------------------------------------------------------------------------------------- list helpers
class StatusCounts(BaseModel):
    """Rows per status (or role) for the same filters as the list endpoint; every key present."""

    counts: dict[str, int]
    total: int


class AdminFacets(BaseModel):
    """Distinct values that populate the admin list filters."""

    hospital_cities: list[str]
    hospital_states: list[str]
    hospital_accreditations: list[str]
    agent_countries: list[str]
    user_countries: list[str]
    audit_entity_types: list[str]
    audit_actions: list[str]
