"""Request/response models for the screening API (PLAN 8.6, card shapes from 8.4)."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.core.enums import (
    DoctorGenderPref,
    DurationUnit,
    Gender,
    PackageTier,
    PreviousTreatment,
    ScreeningStatus,
    SeverityLevel,
    SymptomAnswer,
    Urgency,
)
from app.modules.screening.ai.schema import TriageResult

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,119}$")
_AREA_RE = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Language = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------------------------- requests
class ScreeningCreate(_Request):
    specialty_slug: str | None = Field(default=None, max_length=120)
    patient_id: uuid.UUID | None = None

    @field_validator("specialty_slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("invalid specialty slug")
        return v


class SymptomIn(_Request):
    name: ShortText
    answer: SymptomAnswer


class SeverityIn(_Request):
    work: SeverityLevel | None = None
    sleep: SeverityLevel | None = None
    mobility: SeverityLevel | None = None


class PreferencesIn(_Request):
    languages: list[Language] = Field(default_factory=list, max_length=10)
    doctor_gender: DoctorGenderPref | None = None
    budget_min_minor: int | None = Field(default=None, ge=0, le=10**13)
    budget_max_minor: int | None = Field(default=None, ge=0, le=10**13)
    budget_currency: str | None = Field(default=None, min_length=3, max_length=3)
    travel_window_start: date | None = None
    travel_window_end: date | None = None
    use_ai: bool = True

    @field_validator("budget_currency")
    @classmethod
    def _ccy(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.upper()
        if not v.isalpha():
            raise ValueError("currency must be an ISO-4217 code")
        return v

    @field_validator("languages")
    @classmethod
    def _dedupe_languages(cls, v: list[str]) -> list[str]:
        seen: list[str] = []
        for lang in v:
            if lang.lower() not in {s.lower() for s in seen}:
                seen.append(lang)
        return seen

    @model_validator(mode="after")
    def _ranges(self) -> PreferencesIn:
        if (
            self.budget_min_minor is not None
            and self.budget_max_minor is not None
            and self.budget_min_minor > self.budget_max_minor
        ):
            raise ValueError("budget_min_minor must not exceed budget_max_minor")
        if (
            self.budget_min_minor is not None or self.budget_max_minor is not None
        ) and not self.budget_currency:
            raise ValueError("budget_currency is required when a budget is given")
        if (
            self.travel_window_start is not None
            and self.travel_window_end is not None
            and self.travel_window_start > self.travel_window_end
        ):
            raise ValueError("travel_window_start must not be after travel_window_end")
        return self


class ScreeningUpdate(_Request):
    """Any subset of the questionnaire answers (only while the screening is a draft)."""

    specialty_slug: str | None = Field(default=None, max_length=120)
    body_areas: list[str] | None = Field(default=None, max_length=30)
    pain_intensity: int | None = Field(default=None, ge=0, le=10)
    symptoms: list[SymptomIn] | None = Field(default=None, max_length=60)
    duration_value: int | None = Field(default=None, ge=0, le=1000)
    duration_unit: DurationUnit | None = None
    severity: SeverityIn | None = None
    previous_treatments: list[PreviousTreatment] | None = Field(default=None, max_length=4)
    notes: str | None = Field(default=None, max_length=4000)
    preferences: PreferencesIn | None = None
    report_document_ids: list[uuid.UUID] | None = Field(default=None, max_length=10)
    home_country: str | None = Field(default=None, min_length=2, max_length=2)

    @field_validator("specialty_slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("invalid specialty slug")
        return v

    @field_validator("body_areas")
    @classmethod
    def _areas(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out: list[str] = []
        for raw in v:
            area = raw.strip().lower().replace(" ", "_")
            if not _AREA_RE.match(area):
                raise ValueError(f"invalid body area: {raw[:40]!r}")
            if area not in out:
                out.append(area)
        return out

    @field_validator("previous_treatments")
    @classmethod
    def _dedupe_treatments(cls, v: list[PreviousTreatment] | None) -> list[PreviousTreatment] | None:
        return list(dict.fromkeys(v)) if v is not None else None

    @field_validator("report_document_ids")
    @classmethod
    def _dedupe_docs(cls, v: list[uuid.UUID] | None) -> list[uuid.UUID] | None:
        return list(dict.fromkeys(v)) if v is not None else None

    @field_validator("home_country")
    @classmethod
    def _country(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.isalpha():
            raise ValueError("home_country must be an ISO-3166 alpha-2 code")
        return v.upper()

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class SubmitIn(_Request):
    consent_ai: bool = False


# --------------------------------------------------------------------------------------------- responses
class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SpecialtyRef(_Out):
    id: uuid.UUID
    slug: str
    name: str


class ProcedureRef(_Out):
    id: uuid.UUID
    slug: str
    name: str


class ScreeningOut(_Out):
    id: uuid.UUID
    status: ScreeningStatus
    patient_id: uuid.UUID
    specialty: SpecialtyRef | None = None
    body_areas: list[str] = Field(default_factory=list)
    pain_intensity: int | None = None
    symptoms: list[dict[str, Any]] = Field(default_factory=list)
    duration_value: int | None = None
    duration_unit: DurationUnit | None = None
    severity: dict[str, Any] = Field(default_factory=dict)
    previous_treatments: list[str] = Field(default_factory=list)
    notes: str | None = None
    preferences: dict[str, Any] = Field(default_factory=dict)
    report_document_ids: list[uuid.UUID] = Field(default_factory=list)
    consent_ai: bool = False
    home_country: str | None = None
    ai_result: TriageResult | None = None
    urgency: Urgency | None = None
    red_flags: list[str] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime
    submitted_at: datetime | None = None
    completed_at: datetime | None = None


class HospitalRef(_Out):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None = None
    accreditations: list[str] = Field(default_factory=list)


class DoctorCard(_Out):
    id: uuid.UUID
    slug: str
    full_name: str
    gender: Gender | None = None
    photo_url: str | None = None
    specialty: SpecialtyRef | None = None
    qualifications: list[str] = Field(default_factory=list)
    experience_years: int | None = None
    languages: list[str] = Field(default_factory=list)
    success_rate_pct: Decimal | None = None
    rating_avg: Decimal = Decimal("0")
    rating_count: int = 0
    consultation_fee_minor: int | None = None
    currency: str = "INR"
    teleconsult_available: bool = False
    hospital: HospitalRef


class HospitalCard(_Out):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None = None
    state: str | None = None
    accreditations: list[str] = Field(default_factory=list)
    rating_avg: Decimal = Decimal("0")
    rating_count: int = 0
    logo_url: str | None = None
    cover_image_url: str | None = None
    specialties: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    international_desk: bool = False
    starting_price_minor: int | None = None
    currency: str = "INR"


class PackageOut(_Out):
    id: uuid.UUID
    name: str
    tier: PackageTier
    price_minor: int
    original_price_minor: int | None = None
    currency: str
    description: str | None = None
    includes: dict[str, Any] = Field(default_factory=dict)


class SavingsOut(BaseModel):
    home_country: str
    home_min_minor: int
    home_max_minor: int
    home_currency: str
    pct_min: int
    pct_max: int


class MatchOut(BaseModel):
    id: uuid.UUID
    rank: int
    match_score: Decimal
    reasons: list[str] = Field(default_factory=list)
    doctor: DoctorCard | None = None
    hospital: HospitalCard
    procedure: ProcedureRef | None = None
    package: PackageOut | None = None
    estimated_cost_minor: int | None = None
    currency: str | None = None
    savings: SavingsOut | None = None
    # Earliest free day (IST): the matched doctor's own + hospital-wide slots, else any slot at the hospital.
    next_available_consultation: date | None = None
    next_available_admission: date | None = None
