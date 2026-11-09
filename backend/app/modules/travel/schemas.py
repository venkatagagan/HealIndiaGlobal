"""Pydantic schemas for visas, travel/accommodation/service bookings and SOS alerts (PLAN 8.8)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import (
    AccommodationType,
    ServiceBookingStatus,
    ServiceKind,
    SosStatus,
    TravelKind,
    VisaStatus,
    VisaType,
)
from app.modules.cases.schemas import UserRef


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _ccy(v: str | None) -> str | None:
    if v is None:
        return None
    if len(v) != 3 or not v.isalpha():
        raise ValueError("currency must be an ISO-4217 code")
    return v.upper()


class _CcyIn(_In):
    @field_validator("currency", check_fields=False)
    @classmethod
    def _currency(cls, v: str | None) -> str | None:
        return _ccy(v)


class TravelPatientRef(_Out):
    id: uuid.UUID
    full_name: str


# --------------------------------------------------------------------------------------------- visas
class VisaRequestCreate(_In):
    case_id: uuid.UUID
    visa_type: VisaType = VisaType.E_MEDICAL
    notes: str | None = Field(default=None, max_length=5000)


class VisaRequestUpdate(_In):
    status: VisaStatus | None = None
    invitation_letter_document_id: uuid.UUID | None = None
    application_reference: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)


class VisaRequestOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    patient: TravelPatientRef | None = None
    visa_type: VisaType
    status: VisaStatus
    invitation_letter_document_id: uuid.UUID | None = None
    application_reference: str | None = None
    applied_at: datetime | None = None
    decided_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ------------------------------------------------------------------------------------------- travel bookings
class TravelBookingCreate(_In):
    case_id: uuid.UUID
    kind: TravelKind
    from_location: str | None = Field(default=None, max_length=255)
    to_location: str | None = Field(default=None, max_length=255)
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    carrier: str | None = Field(default=None, max_length=100)
    flight_number: str | None = Field(default=None, max_length=20)
    passengers: int = Field(default=1, ge=1, le=20)
    details: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def _times(self) -> TravelBookingCreate:
        if self.depart_at and self.arrive_at and self.arrive_at < self.depart_at:
            raise ValueError("arrive_at must not be before depart_at")
        return self


class TravelBookingUpdate(_CcyIn):
    status: ServiceBookingStatus | None = None
    from_location: str | None = Field(default=None, max_length=255)
    to_location: str | None = Field(default=None, max_length=255)
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    carrier: str | None = Field(default=None, max_length=100)
    flight_number: str | None = Field(default=None, max_length=20)
    pnr: str | None = Field(default=None, max_length=20)
    passengers: int | None = Field(default=None, ge=1, le=20)
    price_minor: int | None = Field(default=None, ge=0, le=10**12)
    currency: str | None = None
    details: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=5000)


class TravelBookingOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    patient: TravelPatientRef | None = None
    kind: TravelKind
    status: ServiceBookingStatus
    from_location: str | None = None
    to_location: str | None = None
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    carrier: str | None = None
    flight_number: str | None = None
    pnr: str | None = None
    passengers: int
    price_minor: int | None = None
    currency: str
    details: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------------------------- accommodation
class AccommodationBookingCreate(_In):
    case_id: uuid.UUID
    provider_id: uuid.UUID
    check_in: date
    check_out: date
    guests: int = Field(default=1, ge=1, le=20)
    room_type: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def _dates(self) -> AccommodationBookingCreate:
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        return self


class AccommodationBookingUpdate(_CcyIn):
    status: ServiceBookingStatus | None = None
    check_in: date | None = None
    check_out: date | None = None
    guests: int | None = Field(default=None, ge=1, le=20)
    room_type: str | None = Field(default=None, max_length=100)
    nightly_rate_minor: int | None = Field(default=None, ge=0, le=10**12)
    currency: str | None = None
    confirmation_code: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)


class AccommodationProviderRef(_Out):
    id: uuid.UUID
    name: str
    type: AccommodationType
    city: str | None = None
    address: str | None = None
    star_rating: int | None = None
    phone: str | None = None
    lat: float | None = None
    lng: float | None = None


class AccommodationBookingOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    patient: TravelPatientRef | None = None
    provider: AccommodationProviderRef | None = None
    check_in: date
    check_out: date
    nights: int
    guests: int
    room_type: str | None = None
    nightly_rate_minor: int | None = None
    total_minor: int | None = None
    currency: str
    status: ServiceBookingStatus
    confirmation_code: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------------------------- services
class ServiceBookingCreate(_In):
    case_id: uuid.UUID
    kind: ServiceKind
    provider_id: uuid.UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def _times(self) -> ServiceBookingCreate:
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must not be before starts_at")
        return self


class ServiceBookingUpdate(_CcyIn):
    status: ServiceBookingStatus | None = None
    provider_id: uuid.UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    price_minor: int | None = Field(default=None, ge=0, le=10**12)
    currency: str | None = None
    notes: str | None = Field(default=None, max_length=5000)


class ServiceProviderRef(_Out):
    id: uuid.UUID
    name: str
    kind: ServiceKind
    city: str | None = None
    phone: str | None = None
    languages: list[str] = Field(default_factory=list)


class ServiceBookingOut(_Out):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    patient: TravelPatientRef | None = None
    provider: ServiceProviderRef | None = None
    kind: ServiceKind
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: ServiceBookingStatus
    price_minor: int | None = None
    currency: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------------------------- SOS
class SosCreate(_In):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    message: str | None = Field(default=None, max_length=2000)
    case_id: uuid.UUID | None = None


class SosUpdate(_In):
    status: SosStatus
    note: str | None = Field(default=None, max_length=2000)


class SosOut(_Out):
    id: uuid.UUID
    patient: TravelPatientRef | None = None
    patient_phone: str | None = None
    case_id: uuid.UUID | None = None
    case_number: str | None = None
    lat: float | None = None
    lng: float | None = None
    message: str | None = None
    status: SosStatus
    acknowledged_by: UserRef | None = None
    coordinator: UserRef | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TravelStatusCounts(BaseModel):
    """``GET /travel/status-counts``: rows per status (every status key present) and their sum."""

    counts: dict[str, int]
    total: int
