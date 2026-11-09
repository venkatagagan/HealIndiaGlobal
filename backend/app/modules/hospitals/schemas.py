"""Hospital-portal request/response shapes (PLAN 8.5)."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.enums import Gender, HospitalMemberRole, PackageTier, SlotKind
from app.modules.catalog.councils import is_valid_council, normalize_registration_number
from app.modules.catalog.schemas import DoctorDetail, HospitalCard

ACCREDITATIONS = ("jci", "nabh", "nabl", "iso")
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
CCY_RE = re.compile(r"^[A-Z]{3}$")

Tag = Annotated[str, Field(min_length=1, max_length=100)]
ShortText = Annotated[str, Field(max_length=200)]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _url(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not re.match(r"^https?://[^\s]+$", value, re.IGNORECASE):
        raise ValueError("must be an http(s) URL")
    return value


def _clean_list(values: list[str] | None, *, lower: bool = False) -> list[str] | None:
    if values is None:
        return None
    out: list[str] = []
    for v in values:
        item = v.strip().lower() if lower else v.strip()
        if item and item not in out:
            out.append(item)
    return out


# ----------------------------------------------------------------------------------------------- profile
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
    status: str
    kyc_status: str
    gstin: str | None = None
    pan_last4: str | None = None
    pan_masked: str | None = None
    commission_rate_bps: int | None = None
    settlement_cycle_days: int | None = None
    is_featured: bool = False
    approved_at: datetime | None = None
    rejection_reason: str | None = None
    specialty_ids: list[uuid.UUID] = []
    member_role: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class HospitalProfileIn(_In):
    name: Annotated[str, Field(min_length=2, max_length=200)] | None = None
    legal_name: Annotated[str, Field(max_length=255)] | None = None
    description: Annotated[str, Field(max_length=10_000)] | None = None
    city: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    state: Annotated[str, Field(max_length=100)] | None = None
    address: Annotated[str, Field(max_length=1000)] | None = None
    pincode: Annotated[str, Field(pattern=r"^\d{6}$")] | None = None
    lat: Annotated[float, Field(ge=-90, le=90)] | None = None
    lng: Annotated[float, Field(ge=-180, le=180)] | None = None
    phone: Annotated[str, Field(max_length=32, pattern=r"^\+?[0-9 ()\-]{6,32}$")] | None = None
    email: EmailStr | None = None
    website: Annotated[str, Field(max_length=512)] | None = None
    logo_url: Annotated[str, Field(max_length=1024)] | None = None
    cover_image_url: Annotated[str, Field(max_length=1024)] | None = None
    accreditations: Annotated[list[str], Field(max_length=10)] | None = None
    established_year: Annotated[int, Field(ge=1800, le=2100)] | None = None
    bed_count: Annotated[int, Field(ge=0, le=100_000)] | None = None
    languages: (
        Annotated[list[Annotated[str, Field(min_length=2, max_length=40)]], Field(max_length=30)] | None
    ) = None
    international_desk: bool | None = None
    airport_distance_km: Annotated[float, Field(ge=0, le=9999.9)] | None = None
    gstin: Annotated[str, Field(max_length=15)] | None = None
    pan: Annotated[str, Field(max_length=10)] | None = None

    @field_validator("website", "logo_url", "cover_image_url")
    @classmethod
    def _urls(cls, v: str | None) -> str | None:
        return _url(v)

    @field_validator("accreditations")
    @classmethod
    def _accreditations(cls, v: list[str] | None) -> list[str] | None:
        cleaned = _clean_list(v, lower=True)
        if cleaned is not None:
            bad = [a for a in cleaned if a not in ACCREDITATIONS]
            if bad:
                raise ValueError(
                    f"unknown accreditation(s): {', '.join(bad)}; allowed: {', '.join(ACCREDITATIONS)}"
                )
        return cleaned

    @field_validator("languages")
    @classmethod
    def _languages(cls, v: list[str] | None) -> list[str] | None:
        return _clean_list(v, lower=True)

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.upper()
        if not GSTIN_RE.match(v):
            raise ValueError("invalid GSTIN format")
        return v

    @field_validator("pan")
    @classmethod
    def _pan(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.upper()
        if not PAN_RE.match(v):
            raise ValueError("invalid PAN format")
        return v


class HospitalSpecialtiesIn(_In):
    specialty_ids: Annotated[list[uuid.UUID], Field(max_length=50)]


# ----------------------------------------------------------------------------------------------- members
class MemberOut(BaseModel):
    id: uuid.UUID
    hospital_id: uuid.UUID
    user_id: uuid.UUID
    email: str | None = None
    full_name: str
    member_role: str
    status: str
    created_at: datetime


class MemberInviteIn(_In):
    email: EmailStr
    full_name: Annotated[str, Field(min_length=1, max_length=200)]
    member_role: HospitalMemberRole


class MemberUpdateIn(_In):
    member_role: HospitalMemberRole


# ----------------------------------------------------------------------------------------------- doctors
class _DoctorFields(_In):
    gender: Gender | None = None
    photo_url: Annotated[str, Field(max_length=1024)] | None = None
    sub_specialties: Annotated[list[Tag], Field(max_length=30)] | None = None
    qualifications: Annotated[list[Tag], Field(max_length=30)] | None = None
    experience_years: Annotated[int, Field(ge=0, le=80)] | None = None
    languages: (
        Annotated[list[Annotated[str, Field(min_length=2, max_length=40)]], Field(max_length=30)] | None
    ) = None
    bio: Annotated[str, Field(max_length=10_000)] | None = None
    success_rate_pct: Annotated[float, Field(ge=0, le=100)] | None = None
    consultation_fee_minor: Annotated[int, Field(ge=0, le=10**12)] | None = None
    currency: Annotated[str, Field(min_length=3, max_length=3)] | None = None
    teleconsult_available: bool | None = None
    is_active: bool | None = None
    # Medical registration (INTEGRATION_BACKLOG #10): number + council code ("nmc" or a state council, see
    # GET /content/medical-councils). Both or neither; "" clears.
    registration_number: Annotated[str, Field(max_length=60)] | None = None
    registration_council: Annotated[str, Field(max_length=40)] | None = None

    @field_validator("photo_url")
    @classmethod
    def _photo(cls, v: str | None) -> str | None:
        return _url(v)

    @field_validator("registration_number")
    @classmethod
    def _reg_number(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return normalize_registration_number(v)

    @field_validator("registration_council")
    @classmethod
    def _reg_council(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.lower()
        if not is_valid_council(v):
            raise ValueError("unknown registration council")
        return v

    @field_validator("sub_specialties", "qualifications")
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        return _clean_list(v)

    @field_validator("languages")
    @classmethod
    def _langs(cls, v: list[str] | None) -> list[str] | None:
        return _clean_list(v, lower=True)

    @field_validator("currency")
    @classmethod
    def _ccy(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.upper()
        if not CCY_RE.match(v):
            raise ValueError("invalid currency code")
        return v


class DoctorIn(_DoctorFields):
    full_name: Annotated[str, Field(min_length=2, max_length=200)]
    specialty_id: uuid.UUID


class DoctorUpdateIn(_DoctorFields):
    full_name: Annotated[str, Field(min_length=2, max_length=200)] | None = None
    specialty_id: uuid.UUID | None = None


class DoctorAdminOut(DoctorDetail):
    is_active: bool
    registration_verified_at: datetime | None = None
    user_id: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AvailabilitySlotIn(_In):
    date: date
    slot_kind: SlotKind
    capacity: Annotated[int, Field(ge=0, le=1000)]


# ----------------------------------------------------------------------------------------------- procedures
class _ProcedureFields(_In):
    doctor_ids: Annotated[list[uuid.UUID], Field(max_length=50)] | None = None
    currency: Annotated[str, Field(min_length=3, max_length=3)] | None = None
    hospital_stay_days: Annotated[int, Field(ge=0, le=365)] | None = None
    success_rate_pct: Annotated[float, Field(ge=0, le=100)] | None = None
    inclusions: (
        Annotated[list[Annotated[str, Field(min_length=1, max_length=200)]], Field(max_length=50)] | None
    ) = None
    exclusions: (
        Annotated[list[Annotated[str, Field(min_length=1, max_length=200)]], Field(max_length=50)] | None
    ) = None
    is_active: bool | None = None

    @field_validator("inclusions", "exclusions")
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        return _clean_list(v)

    @field_validator("currency")
    @classmethod
    def _ccy(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class HospitalProcedureIn(_ProcedureFields):
    procedure_id: uuid.UUID
    price_min_minor: Annotated[int, Field(ge=0, le=10**13)]
    price_max_minor: Annotated[int, Field(ge=0, le=10**13)]

    @model_validator(mode="after")
    def _range(self) -> HospitalProcedureIn:
        if self.price_min_minor > self.price_max_minor:
            raise ValueError("price_min_minor must not exceed price_max_minor")
        return self


class HospitalProcedureUpdateIn(_ProcedureFields):
    procedure_id: uuid.UUID | None = None
    price_min_minor: Annotated[int, Field(ge=0, le=10**13)] | None = None
    price_max_minor: Annotated[int, Field(ge=0, le=10**13)] | None = None


class PackageIncludesIn(_In):
    accommodation_nights: Annotated[int, Field(ge=0, le=365)] | None = None
    airport_pickup: bool | None = None
    translator: bool | None = None
    meals: bool | None = None
    local_transport: bool | None = None
    followup_teleconsults: Annotated[int, Field(ge=0, le=100)] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.model_dump().items() if v is not None}


class _PackageFields(_In):
    original_price_minor: Annotated[int, Field(ge=0, le=10**13)] | None = None
    currency: Annotated[str, Field(min_length=3, max_length=3)] | None = None
    description: Annotated[str, Field(max_length=5000)] | None = None
    includes: PackageIncludesIn | None = None
    is_active: bool | None = None

    @field_validator("currency")
    @classmethod
    def _ccy(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class PackageIn(_PackageFields):
    name: Annotated[str, Field(min_length=2, max_length=200)]
    tier: PackageTier
    price_minor: Annotated[int, Field(ge=0, le=10**13)]


class PackageUpdateIn(_PackageFields):
    name: Annotated[str, Field(min_length=2, max_length=200)] | None = None
    tier: PackageTier | None = None
    price_minor: Annotated[int, Field(ge=0, le=10**13)] | None = None


# ----------------------------------------------------------------------------------------------- dashboard
class MonthlyPoint(BaseModel):
    month: str
    bookings: int
    revenue_minor: int


class DashboardOut(BaseModel):
    enquiries_open: int
    quotes_pending: int
    bookings_upcoming: int
    patients_in_treatment: int
    revenue_month_minor: int
    currency: str
    monthly: list[MonthlyPoint]
    recent_cases: list[Any]


__all__ = [
    "ACCREDITATIONS",
    "AvailabilitySlotIn",
    "DashboardOut",
    "DoctorAdminOut",
    "DoctorIn",
    "DoctorUpdateIn",
    "HospitalProcedureIn",
    "HospitalProcedureUpdateIn",
    "HospitalProfileIn",
    "HospitalProfileOut",
    "HospitalSpecialtiesIn",
    "MemberInviteIn",
    "MemberOut",
    "MemberUpdateIn",
    "MonthlyPoint",
    "PackageIn",
    "PackageIncludesIn",
    "PackageUpdateIn",
    "ShortText",
]
