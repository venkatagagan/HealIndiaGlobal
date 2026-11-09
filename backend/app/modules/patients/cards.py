"""Batch builders for the catalog cards embedded in saved items (HospitalCard, DoctorCard, ProcedureOut).

Shapes follow PLAN 8.4. Only active records are returned; ids that are missing/inactive are simply absent
from the result maps.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import HospitalStatus
from app.models import (
    CostBenchmark,
    Doctor,
    Hospital,
    HospitalProcedure,
    HospitalSpecialty,
    Procedure,
    Specialty,
)
from app.modules.patients.schemas import (
    CostBenchmarkOut,
    DoctorCard,
    HospitalCard,
    HospitalRefMini,
    IdSlugName,
    ProcedureOut,
)


def _float(value: Decimal | float | None) -> float | None:
    return float(value) if value is not None else None


async def hospital_cards(db: AsyncSession, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, HospitalCard]:
    wanted = list(set(ids))
    if not wanted:
        return {}
    hospitals = (
        (
            await db.execute(
                select(Hospital).where(Hospital.id.in_(wanted), Hospital.status == HospitalStatus.ACTIVE)
            )
        )
        .scalars()
        .all()
    )
    if not hospitals:
        return {}
    hids = [h.id for h in hospitals]
    specialty_rows = await db.execute(
        select(HospitalSpecialty.hospital_id, Specialty.name)
        .join(Specialty, Specialty.id == HospitalSpecialty.specialty_id)
        .where(HospitalSpecialty.hospital_id.in_(hids), Specialty.is_active.is_(True))
        .order_by(Specialty.sort_order, Specialty.name)
    )
    specialties: dict[uuid.UUID, list[str]] = defaultdict(list)
    for hid, name in specialty_rows.all():
        specialties[hid].append(name)
    price_rows = await db.execute(
        select(HospitalProcedure.hospital_id, HospitalProcedure.price_min_minor, HospitalProcedure.currency)
        .where(
            HospitalProcedure.hospital_id.in_(hids),
            HospitalProcedure.is_active.is_(True),
            HospitalProcedure.price_min_minor.is_not(None),
        )
        .order_by(HospitalProcedure.hospital_id, HospitalProcedure.price_min_minor)
    )
    starting: dict[uuid.UUID, tuple[int, str]] = {}
    for hid, min_price, currency in price_rows.all():
        if min_price is not None:
            starting.setdefault(hid, (int(min_price), currency))
    cards: dict[uuid.UUID, HospitalCard] = {}
    for h in hospitals:
        start = starting.get(h.id)
        cards[h.id] = HospitalCard(
            id=h.id,
            slug=h.slug,
            name=h.name,
            city=h.city,
            state=h.state,
            accreditations=list(h.accreditations or []),
            rating_avg=_float(h.rating_avg),
            rating_count=h.rating_count,
            logo_url=h.logo_url,
            cover_image_url=h.cover_image_url,
            specialties=specialties.get(h.id, []),
            languages=list(h.languages or []),
            international_desk=h.international_desk,
            starting_price_minor=start[0] if start else None,
            currency=start[1] if start else "INR",
        )
    return cards


async def doctor_cards(db: AsyncSession, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, DoctorCard]:
    wanted = list(set(ids))
    if not wanted:
        return {}
    rows = await db.execute(
        select(Doctor, Specialty, Hospital)
        .join(Specialty, Specialty.id == Doctor.specialty_id)
        .join(Hospital, Hospital.id == Doctor.hospital_id)
        .where(Doctor.id.in_(wanted), Doctor.is_active.is_(True), Hospital.status == HospitalStatus.ACTIVE)
    )
    cards: dict[uuid.UUID, DoctorCard] = {}
    for doctor, specialty, hospital in rows.all():
        cards[doctor.id] = DoctorCard(
            id=doctor.id,
            slug=doctor.slug,
            full_name=doctor.full_name,
            gender=doctor.gender,
            photo_url=doctor.photo_url,
            specialty=IdSlugName(id=specialty.id, slug=specialty.slug, name=specialty.name),
            qualifications=list(doctor.qualifications or []),
            experience_years=doctor.experience_years,
            languages=list(doctor.languages or []),
            success_rate_pct=_float(doctor.success_rate_pct),
            rating_avg=_float(doctor.rating_avg),
            rating_count=doctor.rating_count,
            consultation_fee_minor=doctor.consultation_fee_minor,
            currency=doctor.currency,
            teleconsult_available=doctor.teleconsult_available,
            hospital=HospitalRefMini(
                id=hospital.id,
                slug=hospital.slug,
                name=hospital.name,
                city=hospital.city,
                accreditations=list(hospital.accreditations or []),
            ),
        )
    return cards


async def procedure_cards(db: AsyncSession, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, ProcedureOut]:
    wanted = list(set(ids))
    if not wanted:
        return {}
    rows = (
        await db.execute(
            select(Procedure, Specialty)
            .join(Specialty, Specialty.id == Procedure.specialty_id)
            .where(Procedure.id.in_(wanted), Procedure.is_active.is_(True))
        )
    ).all()
    if not rows:
        return {}
    pids = [p.id for p, _ in rows]
    bench_rows = (
        (
            await db.execute(
                select(CostBenchmark)
                .where(CostBenchmark.procedure_id.in_(pids))
                .order_by(CostBenchmark.procedure_id, CostBenchmark.country_code)
            )
        )
        .scalars()
        .all()
    )
    benchmarks: dict[uuid.UUID, list[CostBenchmarkOut]] = defaultdict(list)
    for b in bench_rows:
        benchmarks[b.procedure_id].append(
            CostBenchmarkOut(
                country_code=b.country_code,
                currency=b.currency,
                cost_min_minor=b.cost_min_minor,
                cost_max_minor=b.cost_max_minor,
                wait_time_text=b.wait_time_text,
            )
        )
    return {
        p.id: ProcedureOut(
            id=p.id,
            slug=p.slug,
            name=p.name,
            description=p.description,
            specialty=IdSlugName(id=s.id, slug=s.slug, name=s.name),
            hospital_stay_days=p.hospital_stay_days,
            recovery_days=p.recovery_days,
            total_stay_days=p.total_stay_days,
            india_price_min_minor=p.india_price_min_minor,
            india_price_max_minor=p.india_price_max_minor,
            currency=p.currency,
            benchmarks=benchmarks.get(p.id, []),
        )
        for p, s in rows
    }
