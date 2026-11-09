"""Public catalog response shapes (PLAN 8.4). Other modules import the card shapes from here::

    from app.modules.catalog.schemas import HospitalCard, DoctorCard, PackageOut, HospitalProcedureOut

Build them with the batch helpers in ``app.modules.catalog.service`` (``build_hospital_cards``,
``build_doctor_cards``, ``package_out``, ``build_hospital_procedures``) to avoid N+1 queries.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class IdSlugName(_Out):
    id: uuid.UUID
    slug: str
    name: str


class SpecialtyOut(_Out):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None = None
    icon: str | None = None
    savings_min_pct: int | None = None
    savings_max_pct: int | None = None
    procedures_count: int = 0
    sort_order: int = 0


class CostBenchmarkOut(_Out):
    country_code: str
    currency: str
    cost_min_minor: int
    cost_max_minor: int
    wait_time_text: str | None = None
    source: str | None = None


class ProcedureOut(_Out):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None = None
    specialty: IdSlugName
    hospital_stay_days: int | None = None
    recovery_days: int | None = None
    total_stay_days: int | None = None
    india_price_min_minor: int | None = None
    india_price_max_minor: int | None = None
    currency: str = "INR"
    benchmarks: list[CostBenchmarkOut] = []
    keywords: list[str] = []
    body_areas: list[str] = []


class HospitalRefMini(_Out):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None = None
    accreditations: list[str] = []


class HospitalCard(_Out):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None = None
    state: str | None = None
    accreditations: list[str] = []
    rating_avg: float | None = None
    rating_count: int = 0
    logo_url: str | None = None
    cover_image_url: str | None = None
    specialties: list[str] = []
    languages: list[str] = []
    international_desk: bool = False
    starting_price_minor: int | None = None
    currency: str = "INR"


class ReviewOut(_Out):
    id: uuid.UUID
    rating: int
    title: str | None = None
    body: str | None = None
    patient_name: str | None = None
    created_at: datetime
    hospital_id: uuid.UUID
    doctor_id: uuid.UUID | None = None
    case_id: uuid.UUID | None = None
    status: str


class PackageOut(_Out):
    id: uuid.UUID
    name: str
    tier: str
    price_minor: int
    original_price_minor: int | None = None
    currency: str
    description: str | None = None
    includes: dict[str, Any] = {}
    is_active: bool = True
    hospital_procedure_id: uuid.UUID


class HospitalProcedureOut(_Out):
    id: uuid.UUID
    hospital_id: uuid.UUID
    procedure: IdSlugName
    price_min_minor: int | None = None
    price_max_minor: int | None = None
    currency: str
    hospital_stay_days: int | None = None
    success_rate_pct: float | None = None
    inclusions: list[str] = []
    exclusions: list[str] = []
    packages: list[PackageOut] = []
    doctor_ids: list[uuid.UUID] = []
    is_active: bool = True


class DoctorCard(_Out):
    id: uuid.UUID
    slug: str
    full_name: str
    gender: str | None = None
    photo_url: str | None = None
    specialty: IdSlugName
    qualifications: list[str] = []
    experience_years: int | None = None
    languages: list[str] = []
    success_rate_pct: float | None = None
    rating_avg: float | None = None
    rating_count: int = 0
    consultation_fee_minor: int | None = None
    currency: str = "INR"
    teleconsult_available: bool = False
    hospital: HospitalRefMini


class DoctorDetail(DoctorCard):
    bio: str | None = None
    sub_specialties: list[str] = []
    # Medical registration (public in India's NMC register). ``registration_verified`` is true only once a
    # platform admin has checked the number against the NMC / State Medical Council register.
    registration_number: str | None = None
    registration_council: str | None = None
    registration_council_name: str | None = None
    registration_verified: bool = False
    procedures: list[HospitalProcedureOut] = []
    next_available_date: date | None = None


class HospitalDetail(HospitalCard):
    description: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    established_year: int | None = None
    bed_count: int | None = None
    airport_distance_km: float | None = None
    doctors: list[DoctorCard] = []
    procedures: list[HospitalProcedureOut] = []
    reviews: list[ReviewOut] = []


class AvailabilityDay(_Out):
    date: date
    slot_kind: str
    capacity: int
    booked: int
    available: int


class CostHome(BaseModel):
    country_code: str
    min_minor: int
    max_minor: int
    currency: str
    wait_time_text: str | None = None


class CostIndia(BaseModel):
    min_minor: int
    max_minor: int
    currency: str
    wait_time_text: str


class CostSavings(BaseModel):
    min_minor: int
    max_minor: int
    currency: str
    pct_min: int
    pct_max: int


class CostItem(BaseModel):
    category: str
    amount_minor: int
    currency: str


class CostComparisonOut(BaseModel):
    procedure: IdSlugName
    home: CostHome
    india: CostIndia
    savings: CostSavings
    itemized: list[CostItem]


class SearchResults(BaseModel):
    specialties: list[SpecialtyOut] = []
    procedures: list[ProcedureOut] = []
    hospitals: list[HospitalCard] = []
    doctors: list[DoctorCard] = []


class CulturalTipOut(_Out):
    id: uuid.UUID
    title: str
    body: str
    image_url: str | None = None
    category: str | None = None
    sort_order: int = 0


class FxRateOut(_Out):
    base_currency: str
    quote_currency: str
    rate: str
    source: str | None = None
    as_of: datetime


class SymptomOut(BaseModel):
    name: str
    specialty_slugs: list[str]
    body_areas: list[str]


class AccommodationProviderOut(_Out):
    id: uuid.UUID
    name: str
    type: str
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    star_rating: int | None = None
    amenities: list[str] = []
    nightly_rate_minor: int | None = None
    currency: str
    photos: list[str] = []
    phone: str | None = None
    email: str | None = None
    distance_km: float | None = None


class ServiceProviderOut(_Out):
    id: uuid.UUID
    kind: str
    name: str
    city: str | None = None
    languages: list[str] = []
    phone: str | None = None
    email: str | None = None
    rate_minor: int | None = None
    rate_unit: str | None = None
    currency: str
    rating_avg: float | None = None


class MedicalCouncilOut(_Out):
    code: str
    name: str


# ----------------------------------------------------------------------------- admin: benchmark gaps
class BenchmarkGapItem(BaseModel):
    procedure_id: uuid.UUID
    procedure_slug: str
    procedure_name: str
    specialty_slug: str
    specialty_name: str
    benchmark_countries: list[str] = []
    missing_countries: list[str] = []


class BenchmarkGapsOut(BaseModel):
    """Active procedures without a home-country cost benchmark for one of the checked countries. A country
    group such as ``AE/OM`` is satisfied by a benchmark for any of its members. Benchmark figures are entered
    by staff from a cited source; this report never proposes numbers."""

    countries: list[str]
    total_active_procedures: int
    procedures_with_gaps: int
    procedures_without_any_benchmark: int
    items: list[BenchmarkGapItem] = []
