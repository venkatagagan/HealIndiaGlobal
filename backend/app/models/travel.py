"""Travel & stay: visas, providers, travel/accommodation/service bookings, SOS (PLAN 4.8)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Double, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    AccommodationType,
    RateUnit,
    ServiceBookingStatus,
    ServiceKind,
    SosStatus,
    TravelKind,
    VisaStatus,
    VisaType,
    sa_enum,
)
from app.models.base import (
    Base,
    TimestampMixin,
    UUIDPkMixin,
    currency_col,
    fk,
    json_obj_col,
    money_col,
    text_array_col,
)

__all__ = [
    "AccommodationBooking",
    "AccommodationHospitalLink",
    "AccommodationProvider",
    "ServiceBooking",
    "ServiceProvider",
    "SosAlert",
    "TravelBooking",
    "VisaRequest",
]


def _service_status() -> Any:
    return mapped_column(
        sa_enum(ServiceBookingStatus),
        nullable=False,
        default=ServiceBookingStatus.REQUESTED,
        server_default="requested",
        index=True,
    )


class VisaRequest(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "visa_requests"

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    visa_type: Mapped[VisaType] = mapped_column(
        sa_enum(VisaType), nullable=False, default=VisaType.E_MEDICAL, server_default="e_medical"
    )
    status: Mapped[VisaStatus] = mapped_column(
        sa_enum(VisaStatus),
        nullable=False,
        default=VisaStatus.NOT_STARTED,
        server_default="not_started",
        index=True,
    )
    invitation_letter_document_id: Mapped[uuid.UUID | None] = fk(
        "documents.id", ondelete="SET NULL", nullable=True
    )
    application_reference: Mapped[str | None] = mapped_column(String(100))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


class AccommodationProvider(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "accommodation_providers"
    __table_args__ = (
        sa.CheckConstraint(
            "star_rating IS NULL OR (star_rating >= 0 AND star_rating <= 7)", name="star_range"
        ),
        sa.CheckConstraint("nightly_rate_minor IS NULL OR nightly_rate_minor >= 0", name="rate_nonneg"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[AccommodationType] = mapped_column(sa_enum(AccommodationType), nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(String(100), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)
    star_rating: Mapped[int | None] = mapped_column(SmallInteger)
    amenities: Mapped[list[str]] = text_array_col()
    nightly_rate_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    photos: Mapped[list[str]] = text_array_col()
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )


class AccommodationHospitalLink(Base):
    __tablename__ = "accommodation_hospital_links"

    provider_id: Mapped[uuid.UUID] = fk("accommodation_providers.id", ondelete="CASCADE", primary_key=True)
    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE", primary_key=True)
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ServiceProvider(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "service_providers"
    __table_args__ = (
        sa.Index("ix_service_providers_languages", "languages", postgresql_using="gin"),
        sa.CheckConstraint("rate_minor IS NULL OR rate_minor >= 0", name="rate_nonneg"),
        sa.CheckConstraint("rating_avg >= 0 AND rating_avg <= 5", name="rating_avg_range"),
    )

    kind: Mapped[ServiceKind] = mapped_column(sa_enum(ServiceKind), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str | None] = mapped_column(String(100), index=True)
    languages: Mapped[list[str]] = text_array_col()
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    rate_minor: Mapped[int | None] = money_col(nullable=True)
    rate_unit: Mapped[RateUnit] = mapped_column(
        sa_enum(RateUnit), nullable=False, default=RateUnit.FIXED, server_default="fixed"
    )
    currency: Mapped[str] = currency_col("INR")
    rating_avg: Mapped[Decimal] = mapped_column(
        Numeric(2, 1), nullable=False, default=Decimal("0"), server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )


class TravelBooking(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "travel_bookings"
    __table_args__ = (
        sa.CheckConstraint("price_minor IS NULL OR price_minor >= 0", name="price_nonneg"),
        sa.CheckConstraint("passengers >= 1", name="passengers_positive"),
    )

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    kind: Mapped[TravelKind] = mapped_column(sa_enum(TravelKind), nullable=False, index=True)
    status: Mapped[ServiceBookingStatus] = _service_status()
    from_location: Mapped[str | None] = mapped_column(String(255))
    to_location: Mapped[str | None] = mapped_column(String(255))
    depart_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrive_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    carrier: Mapped[str | None] = mapped_column(String(100))
    flight_number: Mapped[str | None] = mapped_column(String(20))
    pnr: Mapped[str | None] = mapped_column(String(20))
    passengers: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    price_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    details: Mapped[dict[str, Any]] = json_obj_col()
    notes: Mapped[str | None] = mapped_column(Text)


class AccommodationBooking(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "accommodation_bookings"
    __table_args__ = (
        sa.CheckConstraint("check_out > check_in", name="check_out_after_check_in"),
        sa.CheckConstraint("guests >= 1", name="guests_positive"),
        sa.CheckConstraint(
            "(nightly_rate_minor IS NULL OR nightly_rate_minor >= 0) AND "
            "(total_minor IS NULL OR total_minor >= 0)",
            name="amounts_nonneg",
        ),
    )

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    provider_id: Mapped[uuid.UUID] = fk("accommodation_providers.id", ondelete="RESTRICT")
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    room_type: Mapped[str | None] = mapped_column(String(100))
    nightly_rate_minor: Mapped[int | None] = money_col(nullable=True)
    total_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    status: Mapped[ServiceBookingStatus] = _service_status()
    confirmation_code: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)


class ServiceBooking(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "service_bookings"
    __table_args__ = (sa.CheckConstraint("price_minor IS NULL OR price_minor >= 0", name="price_nonneg"),)

    case_id: Mapped[uuid.UUID] = fk("cases.id", ondelete="CASCADE")
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    provider_id: Mapped[uuid.UUID | None] = fk("service_providers.id", ondelete="SET NULL", nullable=True)
    kind: Mapped[ServiceKind] = mapped_column(sa_enum(ServiceKind), nullable=False, index=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[ServiceBookingStatus] = _service_status()
    price_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    notes: Mapped[str | None] = mapped_column(Text)


class SosAlert(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "sos_alerts"

    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[SosStatus] = mapped_column(
        sa_enum(SosStatus), nullable=False, default=SosStatus.OPEN, server_default="open", index=True
    )
    acknowledged_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
