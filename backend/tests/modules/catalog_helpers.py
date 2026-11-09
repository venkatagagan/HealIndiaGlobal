"""Shared test data builders for the catalog and hospital-portal tests."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CostBenchmark,
    Doctor,
    Hospital,
    HospitalProcedure,
    HospitalSpecialty,
    Procedure,
    Specialty,
    TreatmentPackage,
)
from tests.factories import (
    create_doctor,
    create_hospital,
    create_hospital_procedure,
    create_package,
    create_procedure,
    create_specialty,
)


@dataclass
class CatalogWorld:
    ortho: Specialty
    cardio: Specialty
    knee: Procedure
    bypass: Procedure
    apollo: Hospital
    fortis: Hospital
    draft: Hospital
    dr_anil: Doctor
    dr_meera: Doctor
    dr_inactive: Doctor
    dr_draft: Doctor
    hp_apollo_knee: HospitalProcedure
    hp_fortis_knee: HospitalProcedure
    hp_fortis_bypass: HospitalProcedure
    packages: list[TreatmentPackage] = field(default_factory=list)


async def add_benchmark(
    db: AsyncSession, procedure: Procedure, country: str, ccy: str, lo: int, hi: int, **kw: Any
) -> CostBenchmark:
    bm = CostBenchmark(
        procedure_id=procedure.id,
        country_code=country,
        currency=ccy,
        cost_min_minor=lo,
        cost_max_minor=hi,
        wait_time_text=kw.get("wait_time_text", "3–6 months"),
        source="test",
    )
    db.add(bm)
    await db.commit()
    return bm


async def build_world(db: AsyncSession) -> CatalogWorld:
    """Two active hospitals (Delhi/Mumbai), one draft hospital, ortho + cardio specialties, two procedures."""
    ortho = await create_specialty(db, slug="orthopedics", name="Orthopedics", sort_order=1)
    cardio = await create_specialty(db, slug="cardiology", name="Cardiology", sort_order=2)
    knee = await create_procedure(
        db,
        ortho,
        slug="total-knee-replacement",
        name="Total Knee Replacement",
        keywords=["knee", "arthroplasty"],
        india_price_min_minor=3_00_000_00,
        india_price_max_minor=6_00_000_00,
    )
    bypass = await create_procedure(
        db,
        cardio,
        slug="cabg",
        name="Coronary Artery Bypass Graft",
        keywords=["heart", "bypass"],
        body_areas=["chest"],
        india_price_min_minor=4_00_000_00,
        india_price_max_minor=7_00_000_00,
    )
    apollo = await create_hospital(
        db,
        slug="apollo-delhi",
        name="Apollo Indraprastha",
        city="Delhi",
        rating_avg=4.7,
        accreditations=["jci", "nabh"],
        languages=["en", "hi", "ar"],
    )
    fortis = await create_hospital(
        db,
        slug="fortis-mumbai",
        name="Fortis Mumbai",
        city="Mumbai",
        rating_avg=4.2,
        accreditations=["nabh"],
        languages=["en", "hi", "ru"],
    )
    draft = await create_hospital(
        db, status="draft", slug="draft-hosp", name="Hidden Draft Hospital", city="Delhi"
    )
    db.add_all(
        [
            HospitalSpecialty(hospital_id=apollo.id, specialty_id=ortho.id),
            HospitalSpecialty(hospital_id=fortis.id, specialty_id=cardio.id),
        ]
    )
    await db.commit()
    dr_anil = await create_doctor(
        db,
        apollo,
        ortho,
        slug="dr-anil",
        full_name="Dr. Anil Kapoor",
        gender="male",
        languages=["en", "hi"],
        rating_avg=4.9,
    )
    dr_meera = await create_doctor(
        db,
        fortis,
        cardio,
        slug="dr-meera",
        full_name="Dr. Meera Iyer",
        gender="female",
        languages=["en", "ar"],
        rating_avg=4.5,
    )
    dr_inactive = await create_doctor(
        db, apollo, ortho, slug="dr-gone", full_name="Dr. Retired Person", is_active=False
    )
    dr_draft = await create_doctor(db, draft, ortho, slug="dr-draft", full_name="Dr. Draft Hospital")
    hp_apollo_knee = await create_hospital_procedure(
        db, apollo, knee, price_min_minor=3_50_000_00, price_max_minor=4_50_000_00, doctor_ids=[dr_anil.id]
    )
    hp_fortis_knee = await create_hospital_procedure(
        db, fortis, knee, price_min_minor=3_20_000_00, price_max_minor=5_00_000_00
    )
    hp_fortis_bypass = await create_hospital_procedure(
        db, fortis, bypass, price_min_minor=4_50_000_00, price_max_minor=6_50_000_00, doctor_ids=[dr_meera.id]
    )
    p1 = await create_package(db, hp_apollo_knee, "medical_only")
    p2 = await create_package(db, hp_apollo_knee, "all_inclusive")
    p3 = await create_package(db, hp_apollo_knee, "medical_stay", is_active=False)
    return CatalogWorld(
        ortho=ortho,
        cardio=cardio,
        knee=knee,
        bypass=bypass,
        apollo=apollo,
        fortis=fortis,
        draft=draft,
        dr_anil=dr_anil,
        dr_meera=dr_meera,
        dr_inactive=dr_inactive,
        dr_draft=dr_draft,
        hp_apollo_knee=hp_apollo_knee,
        hp_fortis_knee=hp_fortis_knee,
        hp_fortis_bypass=hp_fortis_bypass,
        packages=[p1, p2, p3],
    )
