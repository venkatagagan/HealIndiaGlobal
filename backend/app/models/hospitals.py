"""Hospitals, members, doctors, procedures & packages, availability, reviews (PLAN 4.5)."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, Date, DateTime, Double, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.crypto import EncryptedString
from app.core.enums import (
    Gender,
    HospitalMemberRole,
    HospitalStatus,
    KycStatus,
    PackageTier,
    ReviewStatus,
    SlotKind,
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
    uuid_array_col,
)

__all__ = [
    "AvailabilitySlot",
    "Doctor",
    "Hospital",
    "HospitalMember",
    "HospitalProcedure",
    "HospitalSpecialty",
    "Review",
    "TreatmentPackage",
]

_RATING_CK = "rating_avg >= 0 AND rating_avg <= 5"


class Hospital(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "hospitals"
    __table_args__ = (
        sa.Index(
            "ix_hospitals_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}
        ),
        sa.Index("ix_hospitals_status_city", "status", "city"),
        sa.Index("ix_hospitals_accreditations", "accreditations", postgresql_using="gin"),
        sa.Index("ix_hospitals_languages", "languages", postgresql_using="gin"),
        sa.CheckConstraint(_RATING_CK, name="rating_avg_range"),
        sa.CheckConstraint("rating_count >= 0", name="rating_count_nonneg"),
        sa.CheckConstraint(
            "commission_rate_bps IS NULL OR (commission_rate_bps >= 0 AND commission_rate_bps <= 10000)",
            name="commission_rate_bps_range",
        ),
        sa.CheckConstraint(
            "settlement_cycle_days IS NULL OR settlement_cycle_days > 0",
            name="settlement_cycle_days_positive",
        ),
    )

    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100), index=True)
    state: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IN", server_default="IN")
    address: Mapped[str | None] = mapped_column(Text)
    pincode: Mapped[str | None] = mapped_column(String(12))
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(512))
    logo_url: Mapped[str | None] = mapped_column(String(1024))
    cover_image_url: Mapped[str | None] = mapped_column(String(1024))
    accreditations: Mapped[list[str]] = text_array_col()
    established_year: Mapped[int | None] = mapped_column(Integer)
    bed_count: Mapped[int | None] = mapped_column(Integer)
    languages: Mapped[list[str]] = text_array_col()
    international_desk: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    airport_distance_km: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    rating_avg: Mapped[Decimal] = mapped_column(
        Numeric(2, 1), nullable=False, default=Decimal("0"), server_default="0"
    )
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[HospitalStatus] = mapped_column(
        sa_enum(HospitalStatus),
        nullable=False,
        default=HospitalStatus.DRAFT,
        server_default="draft",
        index=True,
    )
    kyc_status: Mapped[KycStatus] = mapped_column(
        sa_enum(KycStatus),
        nullable=False,
        default=KycStatus.NOT_SUBMITTED,
        server_default="not_submitted",
        index=True,
    )
    gstin: Mapped[str | None] = mapped_column(String(15))
    pan: Mapped[str | None] = mapped_column(EncryptedString())
    commission_rate_bps: Mapped[int | None] = mapped_column(Integer)
    settlement_cycle_days: Mapped[int | None] = mapped_column(Integer)
    is_featured: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false(), index=True
    )
    approved_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)

    doctors: Mapped[list[Doctor]] = relationship("Doctor", back_populates="hospital", lazy="raise")
    members: Mapped[list[HospitalMember]] = relationship(
        "HospitalMember", back_populates="hospital", lazy="raise", passive_deletes=True
    )
    procedures: Mapped[list[HospitalProcedure]] = relationship(
        "HospitalProcedure", back_populates="hospital", lazy="raise", passive_deletes=True
    )


class HospitalMember(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "hospital_members"
    __table_args__ = (sa.UniqueConstraint("hospital_id", "user_id"),)

    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE")
    user_id: Mapped[uuid.UUID] = fk("users.id", ondelete="CASCADE")
    member_role: Mapped[HospitalMemberRole] = mapped_column(sa_enum(HospitalMemberRole), nullable=False)

    hospital: Mapped[Hospital] = relationship("Hospital", back_populates="members", lazy="raise")


class HospitalSpecialty(Base):
    __tablename__ = "hospital_specialties"

    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE", primary_key=True)
    specialty_id: Mapped[uuid.UUID] = fk("specialties.id", ondelete="CASCADE", primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Doctor(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "doctors"
    __table_args__ = (
        sa.Index(
            "ix_doctors_full_name_trgm",
            "full_name",
            postgresql_using="gin",
            postgresql_ops={"full_name": "gin_trgm_ops"},
        ),
        sa.Index("ix_doctors_languages", "languages", postgresql_using="gin"),
        sa.CheckConstraint(_RATING_CK, name="rating_avg_range"),
        sa.CheckConstraint("rating_count >= 0", name="rating_count_nonneg"),
        sa.CheckConstraint(
            "success_rate_pct IS NULL OR (success_rate_pct >= 0 AND success_rate_pct <= 100)",
            name="success_rate_pct_range",
        ),
        sa.CheckConstraint("experience_years IS NULL OR experience_years >= 0", name="experience_nonneg"),
        sa.CheckConstraint(
            "consultation_fee_minor IS NULL OR consultation_fee_minor >= 0", name="consultation_fee_nonneg"
        ),
    )

    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE")
    user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    gender: Mapped[Gender | None] = mapped_column(sa_enum(Gender), index=True)
    photo_url: Mapped[str | None] = mapped_column(String(1024))
    specialty_id: Mapped[uuid.UUID] = fk("specialties.id", ondelete="RESTRICT")
    sub_specialties: Mapped[list[str]] = text_array_col()
    qualifications: Mapped[list[str]] = text_array_col()
    experience_years: Mapped[int | None] = mapped_column(Integer)
    languages: Mapped[list[str]] = text_array_col()
    bio: Mapped[str | None] = mapped_column(Text)
    success_rate_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    rating_avg: Mapped[Decimal] = mapped_column(
        Numeric(2, 1), nullable=False, default=Decimal("0"), server_default="0"
    )
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    consultation_fee_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    teleconsult_available: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    # Medical registration (INTEGRATION_BACKLOG #10). Nullable for legacy rows; the council code is one of
    # app.modules.catalog.councils.MEDICAL_COUNCILS ("nmc" or a state council); public in the NMC register.
    registration_number: Mapped[str | None] = mapped_column(String(40))
    registration_council: Mapped[str | None] = mapped_column(String(40))
    # Set only by a platform admin who checked the NMC / state register; reset when number or council change.
    registration_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_verified_by_user_id: Mapped[uuid.UUID | None] = fk(
        "users.id", ondelete="SET NULL", nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )

    hospital: Mapped[Hospital] = relationship("Hospital", back_populates="doctors", lazy="raise")


class HospitalProcedure(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "hospital_procedures"
    __table_args__ = (
        sa.UniqueConstraint("hospital_id", "procedure_id"),
        sa.CheckConstraint(
            "(price_min_minor IS NULL OR price_min_minor >= 0) AND "
            "(price_max_minor IS NULL OR price_max_minor >= 0)",
            name="price_nonneg",
        ),
        sa.CheckConstraint(
            "success_rate_pct IS NULL OR (success_rate_pct >= 0 AND success_rate_pct <= 100)",
            name="success_rate_pct_range",
        ),
    )

    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE")
    procedure_id: Mapped[uuid.UUID] = fk("procedures.id", ondelete="RESTRICT")
    doctor_ids: Mapped[list[uuid.UUID]] = uuid_array_col()
    price_min_minor: Mapped[int | None] = money_col(nullable=True)
    price_max_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    hospital_stay_days: Mapped[int | None] = mapped_column(Integer)
    success_rate_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    inclusions: Mapped[list[str]] = text_array_col()
    exclusions: Mapped[list[str]] = text_array_col()
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )

    hospital: Mapped[Hospital] = relationship("Hospital", back_populates="procedures", lazy="raise")
    packages: Mapped[list[TreatmentPackage]] = relationship(
        "TreatmentPackage", back_populates="hospital_procedure", lazy="raise", passive_deletes=True
    )


class TreatmentPackage(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "treatment_packages"
    __table_args__ = (
        sa.CheckConstraint("price_minor >= 0", name="price_nonneg"),
        sa.CheckConstraint(
            "original_price_minor IS NULL OR original_price_minor >= 0", name="original_price_nonneg"
        ),
    )

    hospital_procedure_id: Mapped[uuid.UUID] = fk("hospital_procedures.id", ondelete="CASCADE")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    tier: Mapped[PackageTier] = mapped_column(sa_enum(PackageTier), nullable=False, index=True)
    price_minor: Mapped[int] = money_col()
    original_price_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str] = currency_col("INR")
    description: Mapped[str | None] = mapped_column(Text)
    includes: Mapped[dict[str, Any]] = json_obj_col()
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.true(), index=True
    )

    hospital_procedure: Mapped[HospitalProcedure] = relationship(
        "HospitalProcedure", back_populates="packages", lazy="raise"
    )


class AvailabilitySlot(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "availability_slots"
    __table_args__ = (
        sa.UniqueConstraint(
            "hospital_id", "doctor_id", "date", "slot_kind", postgresql_nulls_not_distinct=True
        ),
        sa.CheckConstraint("capacity >= 0 AND booked >= 0", name="capacity_nonneg"),
        sa.Index("ix_availability_slots_hospital_date", "hospital_id", "date"),
    )

    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id", ondelete="CASCADE", nullable=True)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    slot_kind: Mapped[SlotKind] = mapped_column(sa_enum(SlotKind), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    booked: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class Review(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (sa.CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),)

    hospital_id: Mapped[uuid.UUID] = fk("hospitals.id", ondelete="CASCADE")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id", ondelete="SET NULL", nullable=True)
    patient_id: Mapped[uuid.UUID] = fk("patient_profiles.id", ondelete="CASCADE")
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ReviewStatus] = mapped_column(
        sa_enum(ReviewStatus),
        nullable=False,
        default=ReviewStatus.PENDING,
        server_default="pending",
        index=True,
    )
