"""Schemas for the insurance / pay-later partner catalog, lead capture and the instalment rule (CG-18)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.enums import PartnerKind, PartnerLeadStatus

InsuranceCategory = Literal["medical_travel", "complication", "health", "other"]
PreferredContact = Literal["email", "phone", "whatsapp"]

#: version of the hand-off consent text shown next to the "share my contact details" checkbox
PARTNER_CONSENT_VERSION = "2026-11-18"


def _countries(values: list[str] | None) -> list[str]:
    out: list[str] = []
    for raw in values or []:
        code = (raw or "").strip().upper()
        if len(code) != 2 or not code.isalpha():
            raise ValueError("countries must be ISO-3166 alpha-2 codes")
        if code not in out:
            out.append(code)
    return out


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ------------------------------------------------------------------------------------------------ catalog
class OfferingIn(_In):
    provider_name: str = Field(min_length=1, max_length=200)
    product_name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=40)
    summary: str = Field(default="", max_length=4000)
    countries: list[str] = Field(default_factory=list, max_length=250)
    price_min_minor: int | None = Field(default=None, ge=0)
    price_max_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    price_note: str | None = Field(default=None, max_length=200)
    website_url: str | None = Field(default=None, max_length=1024, pattern=r"^https://")
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=32)
    is_active: bool = True
    sort: int = Field(default=0, ge=-1000, le=1000)

    _norm_countries = field_validator("countries")(_countries)

    @field_validator("currency")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v

    @model_validator(mode="after")
    def _check(self) -> OfferingIn:
        lo, hi = self.price_min_minor, self.price_max_minor
        if lo is not None and hi is not None and lo > hi:
            raise ValueError("price_min_minor must not exceed price_max_minor")
        if (lo is not None or hi is not None) and not self.currency:
            raise ValueError("currency is required with a price range")
        return self


class OfferingPatch(_In):
    provider_name: str | None = Field(default=None, min_length=1, max_length=200)
    product_name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=40)
    summary: str | None = Field(default=None, max_length=4000)
    countries: list[str] | None = Field(default=None, max_length=250)
    price_min_minor: int | None = Field(default=None, ge=0)
    price_max_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    price_note: str | None = Field(default=None, max_length=200)
    website_url: str | None = Field(default=None, max_length=1024, pattern=r"^https://")
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None
    sort: int | None = Field(default=None, ge=-1000, le=1000)

    @field_validator("countries")
    @classmethod
    def _norm(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _countries(v)

    @field_validator("currency")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class OfferingOut(BaseModel):
    id: uuid.UUID
    kind: PartnerKind
    provider_name: str
    product_name: str
    category: str | None
    summary: str
    countries: list[str]
    price_min_minor: int | None
    price_max_minor: int | None
    currency: str | None
    price_note: str | None
    website_url: str | None
    contact_email: str | None
    contact_phone: str | None
    is_active: bool
    sort: int
    created_at: datetime
    updated_at: datetime


# -------------------------------------------------------------------------------------------------- leads
class LeadCreate(_In):
    """``POST /insurance/requests`` (``product_id``) and ``POST /financing/eligibility-checks``
    (``partner_id``). ``consent_share_contact`` must be ``true``: it records the patient's consent to pass
    the contact details below to that partner."""

    product_id: uuid.UUID | None = None
    partner_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    booking_id: uuid.UUID | None = None
    contact_name: str = Field(min_length=1, max_length=200)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, min_length=5, max_length=32)
    preferred_contact: PreferredContact | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    message: str | None = Field(default=None, max_length=1000)
    consent_share_contact: bool
    consent_version: str = Field(default=PARTNER_CONSENT_VERSION, max_length=32)

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v

    @model_validator(mode="after")
    def _check(self) -> LeadCreate:
        if not self.contact_email and not self.contact_phone:
            raise ValueError("Give an email address or a phone number")
        return self


class LeadOut(BaseModel):
    """What the patient sees of their own request."""

    id: uuid.UUID
    kind: PartnerKind
    offering_id: uuid.UUID | None
    provider_name: str
    product_name: str
    case_id: uuid.UUID | None
    booking_id: uuid.UUID | None
    status: PartnerLeadStatus
    partner_website_url: str | None
    """hand-off: the partner's own page, where they quote / decide eligibility"""
    created_at: datetime
    updated_at: datetime


class StaffRef(BaseModel):
    id: uuid.UUID
    full_name: str


class AdminLeadOut(LeadOut):
    contact_name: str
    contact_email: str | None
    contact_phone: str | None
    preferred_contact: str | None
    country: str | None
    message: str | None
    patient_id: uuid.UUID | None
    case_number: str | None
    consent_id: uuid.UUID | None
    consent_granted_at: datetime | None
    staff_note: str | None
    handled_by: StaffRef | None
    handled_at: datetime | None
    shared_at: datetime | None


class LeadUpdate(_In):
    status: PartnerLeadStatus | None = None
    staff_note: str | None = Field(default=None, max_length=4000)


class LeadStatusCounts(BaseModel):
    counts: dict[str, int]
    total: int


# --------------------------------------------------------------------------------------- instalment rule
class InstallmentRow(BaseModel):
    seq: int
    due_date: date
    amount_minor: int


class InstallmentPlanOut(BaseModel):
    """CG-18: a platform instalment plan is a pre-payment plan - the last instalment is due before the
    admission date, without interest or fees. Longer terms are only possible through a pay-later partner,
    who decides and provides the credit outside the platform."""

    admission_date: date
    today: date
    last_due_by: date
    """the latest allowed due date (the day before admission)"""
    max_months: int
    """0 = no instalments possible for this admission date (pay the deposit or in full)"""
    allowed_months: list[int]
    months: int | None
    valid: bool | None
    schedule: list[InstallmentRow]
    interest_free: bool = True
    partner_financing_available: bool
    """an active pay-later partner exists (for the patient's country when given)"""
