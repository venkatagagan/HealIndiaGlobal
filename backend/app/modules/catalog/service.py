"""Public catalog queries (PLAN 8.4) and reusable card builders.

Cross-module helpers (safe to import from other modules)::

    from app.modules.catalog.service import (
        build_hospital_cards, build_doctor_cards, build_hospital_procedures, package_out,
        invalidate_catalog_cache, get_availability,
    )

All builders batch their lookups (one query per related table), never lazy-load and only expose public
fields. Public reads only ever show ``status=active`` hospitals, active doctors/procedures/packages.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import Select, any_, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.enums import Gender, HospitalStatus, QuoteStatus, ReviewStatus, ServiceKind
from app.core.errors import BadRequest, NotFound
from app.core.money import (
    BASE_CURRENCY,
    DEFAULT_FX_RATES,
    CurrencyError,
    convert,
    convert_minor,
    get_fx_rate,
    normalize_currency,
)
from app.core.pagination import Page, paginate
from app.core.settings_store import get_setting
from app.models import (
    AccommodationHospitalLink,
    AccommodationProvider,
    AvailabilitySlot,
    Case,
    CostBenchmark,
    CulturalTip,
    Doctor,
    FxRate,
    Hospital,
    HospitalProcedure,
    HospitalSpecialty,
    PatientProfile,
    Procedure,
    Quote,
    Review,
    ServiceProvider,
    Specialty,
    TreatmentPackage,
)
from app.modules.catalog.content import DEFAULT_CULTURAL_TIPS, INDIA_WAIT_TIME_TEXT, ITEMIZED_SPLIT_BPS
from app.modules.catalog.councils import MEDICAL_COUNCILS, council_name
from app.modules.catalog.schemas import (
    AccommodationProviderOut,
    AvailabilityDay,
    CostBenchmarkOut,
    CostComparisonOut,
    CostHome,
    CostIndia,
    CostItem,
    CostSavings,
    CulturalTipOut,
    DoctorCard,
    DoctorDetail,
    FxRateOut,
    HospitalCard,
    HospitalDetail,
    HospitalProcedureOut,
    HospitalRefMini,
    IdSlugName,
    MedicalCouncilOut,
    PackageOut,
    ProcedureOut,
    ReviewOut,
    SearchResults,
    ServiceProviderOut,
    SpecialtyOut,
)
from app.modules.catalog.utils import language_variants, like_pattern, parse_uuid

CACHE_PREFIX = "catalog:"
CACHE_TTL_SECONDS = 60.0
IST = timezone(timedelta(hours=5, minutes=30))
TRGM_MIN_LEN = 3
MAX_AVAILABILITY_DAYS = 366
DEFAULT_AVAILABILITY_DAYS = 60
DEFAULT_HOME_COUNTRY = "US"


# ----------------------------------------------------------------------------- utilities
def today_ist() -> date:
    """Calendar date in India (availability and admission dates are Indian local dates)."""
    return datetime.now(UTC).astimezone(IST).date()


def _float(value: Decimal | float | int | None) -> float | None:
    return None if value is None else float(value)


async def invalidate_catalog_cache() -> None:
    """Drop every cached public catalog response (call after committing catalog/hospital writes)."""
    await cache.clear_prefix(CACHE_PREFIX)


async def cached(key: str, producer: Callable[[], Awaitable[Any]], ttl: float = CACHE_TTL_SECONDS) -> Any:
    """Return the cached JSON value for ``key`` or compute, store and return ``producer()``.

    ``producer`` must return a JSON-serialisable value (use ``model_dump(mode="json")``)."""
    hit = await cache.get(key)
    if hit is not None:
        return hit
    value = await producer()
    await cache.set(key, value, ttl=ttl)
    return value


def _dump(value: Any) -> Any:
    if isinstance(value, list):
        return [_dump(v) for v in value]
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _text_match(column: Any, term: str) -> Any:
    """ILIKE substring OR pg_trgm similarity (``%`` operator, uses the trigram GIN index)."""
    cond = column.ilike(like_pattern(term), escape="\\")
    if len(term) >= TRGM_MIN_LEN:
        cond = or_(cond, column.op("%")(term))
    return cond


def _clean_term(q: str | None) -> str | None:
    term = " ".join((q or "").split())[:100]
    return term or None


# ----------------------------------------------------------------------------- specialties
def _procedures_count_subq() -> Any:
    return (
        select(func.count(Procedure.id))
        .where(Procedure.specialty_id == Specialty.id, Procedure.is_active.is_(True))
        .correlate(Specialty)
        .scalar_subquery()
    )


def _specialty_out(spec: Specialty, count: int) -> SpecialtyOut:
    return SpecialtyOut(
        id=spec.id,
        slug=spec.slug,
        name=spec.name,
        description=spec.description,
        icon=spec.icon,
        savings_min_pct=spec.savings_min_pct,
        savings_max_pct=spec.savings_max_pct,
        procedures_count=int(count or 0),
        sort_order=spec.sort_order,
    )


async def list_specialties(
    db: AsyncSession, q: str | None = None, limit: int | None = None
) -> list[SpecialtyOut]:
    stmt = (
        select(Specialty, _procedures_count_subq().label("cnt"))
        .where(Specialty.is_active.is_(True))
        .order_by(Specialty.sort_order, Specialty.name, Specialty.id)
    )
    term = _clean_term(q)
    if term:
        stmt = stmt.where(
            or_(_text_match(Specialty.name, term), Specialty.slug.ilike(like_pattern(term), escape="\\"))
        )
    if limit:
        stmt = stmt.limit(limit)
    rows = (await db.execute(stmt)).all()
    return [_specialty_out(spec, cnt) for spec, cnt in rows]


async def get_specialty(db: AsyncSession, slug: str) -> SpecialtyOut:
    stmt = select(Specialty, _procedures_count_subq().label("cnt")).where(
        Specialty.slug == slug.lower(), Specialty.is_active.is_(True)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise NotFound("Specialty not found")
    return _specialty_out(row[0], row[1])


# ----------------------------------------------------------------------------- procedures
async def _benchmarks_for(
    db: AsyncSession, procedure_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[CostBenchmarkOut]]:
    out: dict[uuid.UUID, list[CostBenchmarkOut]] = defaultdict(list)
    if not procedure_ids:
        return out
    rows = (
        await db.execute(
            select(CostBenchmark)
            .where(CostBenchmark.procedure_id.in_(list(procedure_ids)))
            .order_by(CostBenchmark.country_code)
        )
    ).scalars()
    for bm in rows:
        out[bm.procedure_id].append(CostBenchmarkOut.model_validate(bm))
    return out


async def _procedure_outs(
    db: AsyncSession, rows: Sequence[tuple[Procedure, Specialty]]
) -> list[ProcedureOut]:
    benchmarks = await _benchmarks_for(db, [p.id for p, _ in rows])
    return [
        ProcedureOut(
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
            keywords=list(p.keywords or []),
            body_areas=list(p.body_areas or []),
        )
        for p, s in rows
    ]


def _active_procedures_stmt() -> Any:
    return (
        select(Procedure, Specialty)
        .join(Specialty, Specialty.id == Procedure.specialty_id)
        .where(Procedure.is_active.is_(True), Specialty.is_active.is_(True))
    )


async def list_procedures(
    db: AsyncSession, specialty: str | None = None, q: str | None = None, limit: int = 500
) -> list[ProcedureOut]:
    stmt = _active_procedures_stmt()
    if specialty:
        stmt = stmt.where(Specialty.slug == specialty.strip().lower())
    term = _clean_term(q)
    if term:
        stmt = stmt.where(
            or_(
                _text_match(Procedure.name, term),
                func.array_to_string(Procedure.keywords, " ").ilike(like_pattern(term), escape="\\"),
            )
        ).order_by(func.similarity(Procedure.name, term).desc(), Procedure.name, Procedure.id)
    else:
        stmt = stmt.order_by(Specialty.sort_order, Procedure.name, Procedure.id)
    rows = [(p, s) for p, s in (await db.execute(stmt.limit(limit))).all()]
    return await _procedure_outs(db, rows)


async def get_procedure(db: AsyncSession, slug: str) -> ProcedureOut:
    row = (await db.execute(_active_procedures_stmt().where(Procedure.slug == slug.lower()))).first()
    if row is None:
        raise NotFound("Procedure not found")
    return (await _procedure_outs(db, [(row[0], row[1])]))[0]


async def _get_active_procedure(db: AsyncSession, slug_or_id: str) -> Procedure:
    pid = parse_uuid(slug_or_id)
    cond = Procedure.id == pid if pid else Procedure.slug == slug_or_id.strip().lower()
    proc = (
        await db.execute(
            select(Procedure)
            .join(Specialty, Specialty.id == Procedure.specialty_id)
            .where(cond, Procedure.is_active.is_(True), Specialty.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if proc is None:
        raise NotFound("Procedure not found")
    return proc


# ----------------------------------------------------------------------------- packages & HPs
def package_out(pkg: TreatmentPackage) -> PackageOut:
    return PackageOut(
        id=pkg.id,
        name=pkg.name,
        tier=str(pkg.tier),
        price_minor=pkg.price_minor,
        original_price_minor=pkg.original_price_minor,
        currency=pkg.currency,
        description=pkg.description,
        includes=dict(pkg.includes or {}),
        is_active=pkg.is_active,
        hospital_procedure_id=pkg.hospital_procedure_id,
    )


async def build_hospital_procedures(
    db: AsyncSession, hps: Sequence[HospitalProcedure], *, active_packages_only: bool = True
) -> list[HospitalProcedureOut]:
    """``HospitalProcedureOut`` for each row (procedure ref + packages), in the given order."""
    if not hps:
        return []
    proc_ids = {hp.procedure_id for hp in hps}
    procs = {
        p.id: p for p in (await db.execute(select(Procedure).where(Procedure.id.in_(proc_ids)))).scalars()
    }
    pkg_stmt = select(TreatmentPackage).where(
        TreatmentPackage.hospital_procedure_id.in_([hp.id for hp in hps])
    )
    if active_packages_only:
        pkg_stmt = pkg_stmt.where(TreatmentPackage.is_active.is_(True))
    pkg_stmt = pkg_stmt.order_by(TreatmentPackage.price_minor, TreatmentPackage.name, TreatmentPackage.id)
    packages: dict[uuid.UUID, list[PackageOut]] = defaultdict(list)
    for pkg in (await db.execute(pkg_stmt)).scalars():
        packages[pkg.hospital_procedure_id].append(package_out(pkg))
    out: list[HospitalProcedureOut] = []
    for hp in hps:
        proc = procs.get(hp.procedure_id)
        if proc is None:
            continue
        out.append(
            HospitalProcedureOut(
                id=hp.id,
                hospital_id=hp.hospital_id,
                procedure=IdSlugName(id=proc.id, slug=proc.slug, name=proc.name),
                price_min_minor=hp.price_min_minor,
                price_max_minor=hp.price_max_minor,
                currency=hp.currency,
                hospital_stay_days=hp.hospital_stay_days,
                success_rate_pct=_float(hp.success_rate_pct),
                inclusions=list(hp.inclusions or []),
                exclusions=list(hp.exclusions or []),
                packages=packages.get(hp.id, []),
                doctor_ids=list(hp.doctor_ids or []),
                is_active=hp.is_active,
            )
        )
    return out


def _public_hp_stmt() -> Select[Any]:
    return (
        select(HospitalProcedure)
        .join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
        .where(HospitalProcedure.is_active.is_(True), Procedure.is_active.is_(True))
    )


# ----------------------------------------------------------------------------- hospitals
def _starting_price_subq() -> Any:
    return (
        select(func.min(HospitalProcedure.price_min_minor))
        .join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
        .where(
            HospitalProcedure.hospital_id == Hospital.id,
            HospitalProcedure.is_active.is_(True),
            Procedure.is_active.is_(True),
            HospitalProcedure.currency == BASE_CURRENCY,
        )
        .correlate(Hospital)
        .scalar_subquery()
    )


async def build_hospital_cards(db: AsyncSession, hospitals: Sequence[Hospital]) -> list[HospitalCard]:
    """Public ``HospitalCard`` for each hospital (specialty names + starting price), in the given order."""
    if not hospitals:
        return []
    ids = [h.id for h in hospitals]
    names: dict[uuid.UUID, dict[str, tuple[int, str]]] = defaultdict(dict)
    declared = await db.execute(
        select(HospitalSpecialty.hospital_id, Specialty.name, Specialty.sort_order)
        .join(Specialty, Specialty.id == HospitalSpecialty.specialty_id)
        .where(HospitalSpecialty.hospital_id.in_(ids), Specialty.is_active.is_(True))
    )
    for hid, name, order in declared.all():
        names[hid][name] = (order, name)
    via_doctors = await db.execute(
        select(Doctor.hospital_id, Specialty.name, Specialty.sort_order)
        .join(Specialty, Specialty.id == Doctor.specialty_id)
        .where(Doctor.hospital_id.in_(ids), Doctor.is_active.is_(True), Specialty.is_active.is_(True))
        .distinct()
    )
    for hid, name, order in via_doctors.all():
        names[hid].setdefault(name, (order, name))
    prices = dict(
        (
            await db.execute(
                select(HospitalProcedure.hospital_id, func.min(HospitalProcedure.price_min_minor))
                .join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
                .where(
                    HospitalProcedure.hospital_id.in_(ids),
                    HospitalProcedure.is_active.is_(True),
                    Procedure.is_active.is_(True),
                    HospitalProcedure.currency == BASE_CURRENCY,
                )
                .group_by(HospitalProcedure.hospital_id)
            )
        ).all()
    )
    return [_hospital_card(h, names.get(h.id, {}), prices.get(h.id)) for h in hospitals]


def _hospital_card(h: Hospital, names: dict[str, tuple[int, str]], price: int | None) -> HospitalCard:
    return HospitalCard(
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
        specialties=[n for _, n in sorted(names.values())],
        languages=list(h.languages or []),
        international_desk=h.international_desk,
        starting_price_minor=int(price) if price is not None else None,
        currency=BASE_CURRENCY,
    )


def _specialty_ids_subq(slug: str) -> Any:
    return select(Specialty.id).where(Specialty.slug == slug.strip().lower(), Specialty.is_active.is_(True))


def _procedure_ids_subq(slug: str) -> Any:
    return select(Procedure.id).where(Procedure.slug == slug.strip().lower(), Procedure.is_active.is_(True))


def _public_hospitals_stmt(
    *,
    q: str | None = None,
    city: str | None = None,
    specialty: str | None = None,
    procedure: str | None = None,
    accreditation: str | None = None,
    language: str | None = None,
    sort: str | None = None,
) -> Select[Any]:
    stmt = select(Hospital).where(Hospital.status == HospitalStatus.ACTIVE)
    term = _clean_term(q)
    if term:
        stmt = stmt.where(
            or_(_text_match(Hospital.name, term), Hospital.city.ilike(like_pattern(term), escape="\\"))
        )
    if city and city.strip():
        stmt = stmt.where(func.lower(Hospital.city) == city.strip().lower())
    if specialty and specialty.strip():
        spec_ids = _specialty_ids_subq(specialty)
        stmt = stmt.where(
            or_(
                select(HospitalSpecialty.hospital_id)
                .where(
                    HospitalSpecialty.hospital_id == Hospital.id, HospitalSpecialty.specialty_id.in_(spec_ids)
                )
                .exists(),
                select(Doctor.id)
                .where(
                    Doctor.hospital_id == Hospital.id,
                    Doctor.is_active.is_(True),
                    Doctor.specialty_id.in_(spec_ids),
                )
                .exists(),
            )
        )
    if procedure and procedure.strip():
        stmt = stmt.where(
            select(HospitalProcedure.id)
            .where(
                HospitalProcedure.hospital_id == Hospital.id,
                HospitalProcedure.is_active.is_(True),
                HospitalProcedure.procedure_id.in_(_procedure_ids_subq(procedure)),
            )
            .exists()
        )
    if accreditation and accreditation.strip():
        stmt = stmt.where(Hospital.accreditations.contains([accreditation.strip().lower()]))
    if language and language.strip():
        stmt = stmt.where(Hospital.languages.overlap(language_variants(language)))

    if sort == "rating":
        stmt = stmt.order_by(
            Hospital.rating_avg.desc(), Hospital.rating_count.desc(), Hospital.name, Hospital.id
        )
    elif sort == "price":
        stmt = stmt.order_by(_starting_price_subq().asc().nulls_last(), Hospital.name, Hospital.id)
    elif sort == "name":
        stmt = stmt.order_by(Hospital.name, Hospital.id)
    elif term:
        stmt = stmt.order_by(func.similarity(Hospital.name, term).desc(), Hospital.name, Hospital.id)
    else:
        stmt = stmt.order_by(
            Hospital.is_featured.desc(),
            Hospital.rating_avg.desc(),
            Hospital.rating_count.desc(),
            Hospital.name,
            Hospital.id,
        )
    return stmt


async def list_hospitals(db: AsyncSession, params: Any, **filters: Any) -> Page[HospitalCard]:
    stmt = _public_hospitals_stmt(**filters)

    async def _transform(rows: list[Hospital]) -> list[HospitalCard]:
        return await build_hospital_cards(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


async def get_active_hospital(db: AsyncSession, slug_or_id: str) -> Hospital:
    hid = parse_uuid(slug_or_id)
    cond = Hospital.id == hid if hid else Hospital.slug == slug_or_id.strip().lower()
    hospital = (
        await db.execute(select(Hospital).where(cond, Hospital.status == HospitalStatus.ACTIVE))
    ).scalar_one_or_none()
    if hospital is None:
        raise NotFound("Hospital not found")
    return hospital


async def review_outs(db: AsyncSession, reviews: Sequence[Review]) -> list[ReviewOut]:
    """``ReviewOut`` with a privacy-preserving patient name ("Amara O.")."""
    patient_ids = {r.patient_id for r in reviews}
    names: dict[uuid.UUID, str] = {}
    if patient_ids:
        rows = await db.execute(
            select(PatientProfile.id, PatientProfile.first_name, PatientProfile.last_name).where(
                PatientProfile.id.in_(patient_ids)
            )
        )
        for pid, first, last in rows.all():
            first = (first or "").strip()
            last = (last or "").strip()
            label = f"{first} {last[:1]}." if first and last else (first or None)
            if label:
                names[pid] = label
    return [
        ReviewOut(
            id=r.id,
            rating=r.rating,
            title=r.title,
            body=r.body,
            patient_name=names.get(r.patient_id),
            created_at=r.created_at,
            hospital_id=r.hospital_id,
            doctor_id=r.doctor_id,
            case_id=r.case_id,
            status=str(r.status),
        )
        for r in reviews
    ]


async def get_hospital_detail(db: AsyncSession, slug_or_id: str) -> HospitalDetail:
    hospital = await get_active_hospital(db, slug_or_id)
    card = (await build_hospital_cards(db, [hospital]))[0]
    doctors = list(
        (
            await db.execute(
                select(Doctor)
                .where(Doctor.hospital_id == hospital.id, Doctor.is_active.is_(True))
                .order_by(
                    Doctor.rating_avg.desc(), Doctor.experience_years.desc().nulls_last(), Doctor.full_name
                )
                .limit(100)
            )
        ).scalars()
    )
    hps = list(
        (
            await db.execute(
                _public_hp_stmt()
                .where(HospitalProcedure.hospital_id == hospital.id)
                .order_by(Procedure.name, HospitalProcedure.id)
            )
        ).scalars()
    )
    reviews = list(
        (
            await db.execute(
                select(Review)
                .where(Review.hospital_id == hospital.id, Review.status == ReviewStatus.PUBLISHED)
                .order_by(Review.created_at.desc(), Review.id)
                .limit(20)
            )
        ).scalars()
    )
    return HospitalDetail(
        **card.model_dump(),
        description=hospital.description,
        address=hospital.address,
        lat=hospital.lat,
        lng=hospital.lng,
        phone=hospital.phone,
        email=hospital.email,
        website=hospital.website,
        established_year=hospital.established_year,
        bed_count=hospital.bed_count,
        airport_distance_km=_float(hospital.airport_distance_km),
        doctors=await build_doctor_cards(db, doctors, hospitals={hospital.id: hospital}),
        procedures=await build_hospital_procedures(db, hps),
        # Public page: no link from a review to the patient's case (the hospital portal still gets case_id).
        reviews=[r.model_copy(update={"case_id": None}) for r in await review_outs(db, reviews)],
    )


# ----------------------------------------------------------------------------- doctors
async def build_doctor_cards(
    db: AsyncSession, doctors: Sequence[Doctor], *, hospitals: dict[uuid.UUID, Hospital] | None = None
) -> list[DoctorCard]:
    """Public ``DoctorCard`` for each doctor, in the given order (hospitals/specialties batch-loaded)."""
    if not doctors:
        return []
    known = dict(hospitals or {})
    missing = {d.hospital_id for d in doctors} - set(known)
    if missing:
        for h in (await db.execute(select(Hospital).where(Hospital.id.in_(missing)))).scalars():
            known[h.id] = h
    specs = {
        s.id: s
        for s in (
            await db.execute(select(Specialty).where(Specialty.id.in_({d.specialty_id for d in doctors})))
        ).scalars()
    }
    out: list[DoctorCard] = []
    for d in doctors:
        hosp = known.get(d.hospital_id)
        spec = specs.get(d.specialty_id)
        if hosp is None or spec is None:
            continue
        out.append(_doctor_card(d, hosp, spec))
    return out


def _doctor_card(d: Doctor, h: Hospital, s: Specialty) -> DoctorCard:
    return DoctorCard(
        id=d.id,
        slug=d.slug,
        full_name=d.full_name,
        gender=str(d.gender) if d.gender is not None else None,
        photo_url=d.photo_url,
        specialty=IdSlugName(id=s.id, slug=s.slug, name=s.name),
        qualifications=list(d.qualifications or []),
        experience_years=d.experience_years,
        languages=list(d.languages or []),
        success_rate_pct=_float(d.success_rate_pct),
        rating_avg=_float(d.rating_avg),
        rating_count=d.rating_count,
        consultation_fee_minor=d.consultation_fee_minor,
        currency=d.currency,
        teleconsult_available=d.teleconsult_available,
        hospital=HospitalRefMini(
            id=h.id, slug=h.slug, name=h.name, city=h.city, accreditations=list(h.accreditations or [])
        ),
    )


def _public_doctors_stmt() -> Select[Any]:
    return (
        select(Doctor)
        .join(Hospital, Hospital.id == Doctor.hospital_id)
        .where(Doctor.is_active.is_(True), Hospital.status == HospitalStatus.ACTIVE)
    )


def _doctor_procedure_condition(procedure_slug: str) -> Any:
    """Doctor is a lead doctor for the procedure, or shares its specialty at a hospital offering it."""
    proc_ids = _procedure_ids_subq(procedure_slug)
    lead = (
        select(HospitalProcedure.id)
        .where(
            HospitalProcedure.is_active.is_(True),
            HospitalProcedure.procedure_id.in_(proc_ids),
            Doctor.id == any_(HospitalProcedure.doctor_ids),
        )
        .exists()
    )
    same_specialty = (
        select(HospitalProcedure.id)
        .join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
        .where(
            HospitalProcedure.is_active.is_(True),
            HospitalProcedure.hospital_id == Doctor.hospital_id,
            HospitalProcedure.procedure_id.in_(proc_ids),
            Procedure.specialty_id == Doctor.specialty_id,
        )
        .exists()
    )
    return or_(lead, same_specialty)


async def list_doctors(
    db: AsyncSession,
    params: Any,
    *,
    q: str | None = None,
    specialty: str | None = None,
    hospital_id: uuid.UUID | None = None,
    language: str | None = None,
    gender: Gender | None = None,
    procedure: str | None = None,
) -> Page[DoctorCard]:
    stmt = _public_doctors_stmt()
    term = _clean_term(q)
    if term:
        stmt = stmt.where(_text_match(Doctor.full_name, term))
    if specialty and specialty.strip():
        stmt = stmt.where(Doctor.specialty_id.in_(_specialty_ids_subq(specialty)))
    if hospital_id is not None:
        stmt = stmt.where(Doctor.hospital_id == hospital_id)
    if language and language.strip():
        stmt = stmt.where(Doctor.languages.overlap(language_variants(language)))
    if gender is not None:
        stmt = stmt.where(Doctor.gender == gender)
    if procedure and procedure.strip():
        stmt = stmt.where(_doctor_procedure_condition(procedure))
    if term:
        stmt = stmt.order_by(func.similarity(Doctor.full_name, term).desc(), Doctor.full_name, Doctor.id)
    else:
        stmt = stmt.order_by(
            Doctor.rating_avg.desc(), Doctor.experience_years.desc().nulls_last(), Doctor.full_name, Doctor.id
        )

    async def _transform(rows: list[Doctor]) -> list[DoctorCard]:
        return await build_doctor_cards(db, rows)

    return await paginate(db, stmt, params, transform=_transform)


async def get_active_doctor(db: AsyncSession, id_or_slug: str) -> Doctor:
    did = parse_uuid(id_or_slug)
    cond = Doctor.id == did if did else Doctor.slug == id_or_slug.strip().lower()
    doctor = (await db.execute(_public_doctors_stmt().where(cond))).scalar_one_or_none()
    if doctor is None:
        raise NotFound("Doctor not found")
    return doctor


async def doctor_procedures(
    db: AsyncSession, doctor: Doctor, *, public: bool = True
) -> list[HospitalProcedure]:
    """Hospital procedures the doctor leads, else those of the doctor's specialty at their hospital."""
    base = (
        _public_hp_stmt()
        if public
        else select(HospitalProcedure).join(Procedure, Procedure.id == HospitalProcedure.procedure_id)
    )
    base = base.where(HospitalProcedure.hospital_id == doctor.hospital_id).order_by(
        Procedure.name, HospitalProcedure.id
    )
    lead = list((await db.execute(base.where(HospitalProcedure.doctor_ids.contains([doctor.id])))).scalars())
    if lead:
        return lead
    return list((await db.execute(base.where(Procedure.specialty_id == doctor.specialty_id))).scalars())


async def next_available_date(db: AsyncSession, doctor_id: uuid.UUID) -> date | None:
    value = (
        await db.execute(
            select(func.min(AvailabilitySlot.date)).where(
                AvailabilitySlot.doctor_id == doctor_id,
                AvailabilitySlot.date >= today_ist(),
                AvailabilitySlot.capacity > AvailabilitySlot.booked,
            )
        )
    ).scalar_one_or_none()
    return value


def registration_fields(doctor: Doctor) -> dict[str, Any]:
    """Doctor medical-registration fields for detail views (INTEGRATION_BACKLOG #10).

    ``registration_verified`` is true only after a platform admin checked the register
    (``registration_verified_at`` is set by POST /admin/doctors/{id}/verify-registration).
    """
    council = doctor.registration_council
    return {
        "registration_number": doctor.registration_number,
        "registration_council": council,
        "registration_council_name": council_name(council),
        "registration_verified": doctor.registration_verified_at is not None,
    }


def medical_councils() -> list[MedicalCouncilOut]:
    return [MedicalCouncilOut(code=code, name=name) for code, name in MEDICAL_COUNCILS.items()]


async def build_doctor_detail(db: AsyncSession, doctor: Doctor, *, public: bool = True) -> DoctorDetail:
    card = (await build_doctor_cards(db, [doctor]))[0]
    hps = await doctor_procedures(db, doctor, public=public)
    return DoctorDetail(
        **card.model_dump(),
        bio=doctor.bio,
        sub_specialties=list(doctor.sub_specialties or []),
        **registration_fields(doctor),
        procedures=await build_hospital_procedures(db, hps, active_packages_only=public),
        next_available_date=await next_available_date(db, doctor.id),
    )


async def get_doctor_detail(db: AsyncSession, id_or_slug: str) -> DoctorDetail:
    return await build_doctor_detail(db, await get_active_doctor(db, id_or_slug))


# ----------------------------------------------------------------------------- availability
def availability_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    start = date_from or today_ist()
    end = date_to or (start + timedelta(days=DEFAULT_AVAILABILITY_DAYS))
    if end < start:
        raise BadRequest("'to' must not be before 'from'", code="invalid_date_range")
    if (end - start).days > MAX_AVAILABILITY_DAYS:
        raise BadRequest(
            f"Date range may span at most {MAX_AVAILABILITY_DAYS} days", code="invalid_date_range"
        )
    return start, end


async def get_availability(
    db: AsyncSession,
    *,
    hospital_id: uuid.UUID,
    doctor_id: uuid.UUID | None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[AvailabilityDay]:
    """Slots per (date, slot_kind). With ``doctor_id`` the doctor's own slots; without, the hospital total
    (hospital-level slots plus those of active doctors)."""
    start, end = availability_range(date_from, date_to)
    if doctor_id is not None:
        rows = (
            await db.execute(
                select(
                    AvailabilitySlot.date,
                    AvailabilitySlot.slot_kind,
                    AvailabilitySlot.capacity,
                    AvailabilitySlot.booked,
                )
                .where(
                    AvailabilitySlot.hospital_id == hospital_id,
                    AvailabilitySlot.doctor_id == doctor_id,
                    AvailabilitySlot.date >= start,
                    AvailabilitySlot.date <= end,
                )
                .order_by(AvailabilitySlot.date, AvailabilitySlot.slot_kind)
            )
        ).all()
    else:
        active_doctor = (
            select(Doctor.id)
            .where(Doctor.id == AvailabilitySlot.doctor_id, Doctor.is_active.is_(True))
            .exists()
        )
        rows = (
            await db.execute(
                select(
                    AvailabilitySlot.date,
                    AvailabilitySlot.slot_kind,
                    func.sum(AvailabilitySlot.capacity),
                    func.sum(AvailabilitySlot.booked),
                )
                .where(
                    AvailabilitySlot.hospital_id == hospital_id,
                    AvailabilitySlot.date >= start,
                    AvailabilitySlot.date <= end,
                    or_(AvailabilitySlot.doctor_id.is_(None), active_doctor),
                )
                .group_by(AvailabilitySlot.date, AvailabilitySlot.slot_kind)
                .order_by(AvailabilitySlot.date, AvailabilitySlot.slot_kind)
            )
        ).all()
    return [
        AvailabilityDay(
            date=d,
            slot_kind=str(kind),
            capacity=int(cap or 0),
            booked=int(booked or 0),
            available=max(int(cap or 0) - int(booked or 0), 0),
        )
        for d, kind, cap, booked in rows
    ]


# ----------------------------------------------------------------------------- cost comparison
async def _supported_currency(db: AsyncSession, value: str) -> str:
    try:
        code = normalize_currency(value)
    except CurrencyError as exc:
        raise BadRequest(f"Invalid currency: {value!r}", code="unsupported_currency") from exc
    supported = {c.upper() for c in (await get_setting(db, "supported_currencies") or [])}
    if code not in supported and code not in DEFAULT_FX_RATES:
        has_db_rate = (
            await db.execute(select(FxRate.id).where(FxRate.quote_currency == code).limit(1))
        ).scalar_one_or_none()
        if has_db_rate is None:
            raise BadRequest(f"Currency {code} is not supported", code="unsupported_currency")
    return code


async def _to_inr(db: AsyncSession, amount_minor: int, ccy: str, rates: dict[str, Decimal]) -> int:
    code = normalize_currency(ccy)
    if code == BASE_CURRENCY:
        return int(amount_minor)
    if code not in rates:
        rates[code] = await get_fx_rate(db, code)
    return convert_minor(amount_minor, code, BASE_CURRENCY, rates[code], Decimal(1))


def _pct(saved: int, home: int) -> int:
    if home <= 0 or saved <= 0:
        return 0
    value = (Decimal(saved) * 100 / Decimal(home)).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(min(value, Decimal(100)))


def _split(total: int, weights: Sequence[tuple[str, int]]) -> list[tuple[str, int]]:
    """Split ``total`` by integer weights (half-up), assigning any rounding remainder to the largest part."""
    weight_sum = sum(w for _, w in weights)
    if weight_sum <= 0 or not weights:
        return []
    parts = [
        (cat, int((Decimal(total) * w / weight_sum).quantize(Decimal(1), rounding=ROUND_HALF_UP)))
        for cat, w in weights
    ]
    diff = total - sum(a for _, a in parts)
    if diff:
        idx = max(range(len(parts)), key=lambda i: weights[i][1])
        parts[idx] = (parts[idx][0], parts[idx][1] + diff)
    return parts


async def _quote_itemization(db: AsyncSession, procedure_id: uuid.UUID) -> list[tuple[str, int]]:
    """Average category split (absolute INR-free weights) of recent sent/accepted quotes for the procedure."""
    quotes = (
        await db.execute(
            select(Quote.line_items)
            .join(Case, Case.id == Quote.case_id)
            .where(
                Case.procedure_id == procedure_id,
                Quote.status.in_([QuoteStatus.SENT, QuoteStatus.ACCEPTED]),
                Quote.total_minor > 0,
            )
            .order_by(Quote.created_at.desc())
            .limit(200)
        )
    ).scalars()
    shares: dict[str, Decimal] = defaultdict(Decimal)
    counted = 0
    for items in quotes:
        if not isinstance(items, list):
            continue
        per_cat: dict[str, int] = defaultdict(int)
        for item in items:
            if not isinstance(item, dict):
                continue
            cat = str(item.get("category") or "other")
            amount = item.get("amount_minor")
            if isinstance(amount, int) and not isinstance(amount, bool) and amount > 0:
                per_cat[cat] += amount
        total = sum(per_cat.values())
        if total <= 0:
            continue
        counted += 1
        for cat, amount in per_cat.items():
            shares[cat] += Decimal(amount) / Decimal(total)
    if not counted:
        return []
    # Weights in parts-per-million keep the integer split precise.
    weights = [
        (cat, int((share / counted * 1_000_000).quantize(Decimal(1), rounding=ROUND_HALF_UP)))
        for cat, share in sorted(shares.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return [(c, w) for c, w in weights if w > 0]


async def cost_comparison(
    db: AsyncSession, *, procedure: str, country: str | None, currency: str | None
) -> CostComparisonOut:
    proc = await _get_active_procedure(db, procedure)
    country_code = (country or DEFAULT_HOME_COUNTRY).strip().upper()
    if len(country_code) != 2 or not country_code.isalpha():
        raise BadRequest("country must be an ISO-3166 alpha-2 code", code="invalid_country")

    bench_rows = list(
        (
            await db.execute(
                select(CostBenchmark).where(
                    CostBenchmark.procedure_id == proc.id,
                    CostBenchmark.country_code.in_({country_code, DEFAULT_HOME_COUNTRY}),
                )
            )
        ).scalars()
    )
    by_country = {b.country_code.upper(): b for b in bench_rows}
    bench = by_country.get(country_code) or by_country.get(DEFAULT_HOME_COUNTRY)
    if bench is None:
        raise NotFound("No cost benchmark is available for this procedure", code="benchmark_not_found")
    target = await _supported_currency(db, currency or bench.currency)

    # India range from active hospital procedures at active hospitals (any currency, normalised to INR).
    rates: dict[str, Decimal] = {}
    hp_rows = (
        await db.execute(
            select(
                HospitalProcedure.price_min_minor,
                HospitalProcedure.price_max_minor,
                HospitalProcedure.currency,
            )
            .join(Hospital, Hospital.id == HospitalProcedure.hospital_id)
            .where(
                HospitalProcedure.procedure_id == proc.id,
                HospitalProcedure.is_active.is_(True),
                Hospital.status == HospitalStatus.ACTIVE,
            )
        )
    ).all()
    mins: list[int] = []
    maxs: list[int] = []
    for pmin, pmax, ccy in hp_rows:
        lo = pmin if pmin is not None else pmax
        hi = pmax if pmax is not None else pmin
        if lo is None or hi is None:
            continue
        mins.append(await _to_inr(db, lo, ccy, rates))
        maxs.append(await _to_inr(db, hi, ccy, rates))
    if mins:
        india_min_inr, india_max_inr = min(mins), max(maxs)
    else:
        lo = (
            proc.india_price_min_minor
            if proc.india_price_min_minor is not None
            else proc.india_price_max_minor
        )
        hi = (
            proc.india_price_max_minor
            if proc.india_price_max_minor is not None
            else proc.india_price_min_minor
        )
        if lo is None or hi is None:
            raise NotFound("No India pricing is available for this procedure", code="price_not_found")
        india_min_inr = await _to_inr(db, lo, proc.currency, rates)
        india_max_inr = await _to_inr(db, hi, proc.currency, rates)
    india_min_inr, india_max_inr = min(india_min_inr, india_max_inr), max(india_min_inr, india_max_inr)

    india_min, _ = await convert(db, india_min_inr, BASE_CURRENCY, target)
    india_max, _ = await convert(db, india_max_inr, BASE_CURRENCY, target)
    home_min, _ = await convert(db, bench.cost_min_minor, bench.currency, target)
    home_max, _ = await convert(db, bench.cost_max_minor, bench.currency, target)
    home_min, home_max = min(home_min, home_max), max(home_min, home_max)

    save_low = max(home_min - india_min, 0)
    save_high = max(home_max - india_max, 0)
    pct_low, pct_high = _pct(save_low, home_min), _pct(save_high, home_max)

    india_mid = (india_min + india_max + 1) // 2
    weights = await _quote_itemization(db, proc.id) or list(ITEMIZED_SPLIT_BPS)
    itemized = [CostItem(category=c, amount_minor=a, currency=target) for c, a in _split(india_mid, weights)]

    return CostComparisonOut(
        procedure=IdSlugName(id=proc.id, slug=proc.slug, name=proc.name),
        home=CostHome(
            country_code=bench.country_code.upper(),
            min_minor=home_min,
            max_minor=home_max,
            currency=target,
            wait_time_text=bench.wait_time_text,
        ),
        india=CostIndia(
            min_minor=india_min, max_minor=india_max, currency=target, wait_time_text=INDIA_WAIT_TIME_TEXT
        ),
        savings=CostSavings(
            min_minor=min(save_low, save_high),
            max_minor=max(save_low, save_high),
            currency=target,
            pct_min=min(pct_low, pct_high),
            pct_max=max(pct_low, pct_high),
        ),
        itemized=itemized,
    )


# ----------------------------------------------------------------------------- search
SEARCH_LIMIT = 5


async def search(db: AsyncSession, q: str) -> SearchResults:
    term = _clean_term(q)
    if not term:
        return SearchResults()
    specialties = await list_specialties(db, q=term, limit=SEARCH_LIMIT)
    procedures = await list_procedures(db, q=term, limit=SEARCH_LIMIT)
    hospitals = list((await db.execute(_public_hospitals_stmt(q=term).limit(SEARCH_LIMIT))).scalars())
    doctors = list(
        (
            await db.execute(
                _public_doctors_stmt()
                .where(_text_match(Doctor.full_name, term))
                .order_by(func.similarity(Doctor.full_name, term).desc(), Doctor.full_name, Doctor.id)
                .limit(SEARCH_LIMIT)
            )
        ).scalars()
    )
    return SearchResults(
        specialties=specialties,
        procedures=procedures,
        hospitals=await build_hospital_cards(db, hospitals),
        doctors=await build_doctor_cards(db, doctors),
    )


# ----------------------------------------------------------------------------- content
async def cultural_tips(db: AsyncSession, category: str | None = None) -> list[CulturalTipOut]:
    any_rows = (await db.execute(select(CulturalTip.id).limit(1))).scalar_one_or_none()
    if any_rows is None:
        tips = [CulturalTipOut.model_validate(t) for t in DEFAULT_CULTURAL_TIPS]
        if category:
            tips = [t for t in tips if (t.category or "").lower() == category.strip().lower()]
        return tips
    stmt = select(CulturalTip).where(CulturalTip.is_active.is_(True))
    if category and category.strip():
        stmt = stmt.where(func.lower(CulturalTip.category) == category.strip().lower())
    stmt = stmt.order_by(CulturalTip.sort_order, CulturalTip.title, CulturalTip.id)
    return [CulturalTipOut.model_validate(t) for t in (await db.execute(stmt)).scalars()]


async def helplines(db: AsyncSession) -> dict[str, str]:
    from app.core.site_settings import public_helplines

    # Phone numbers only (no email / hours / message fields), never unset or placeholder numbers.
    return public_helplines(await get_setting(db, "helplines") or {})


async def fx_rates(db: AsyncSession) -> list[FxRateOut]:
    """Rates (INR per unit) for every supported currency: DB rows first, code defaults for the rest."""
    rows = list(
        (
            await db.execute(
                select(FxRate).where(FxRate.base_currency == BASE_CURRENCY).order_by(FxRate.quote_currency)
            )
        ).scalars()
    )
    out: dict[str, FxRateOut] = {
        r.quote_currency.upper(): FxRateOut(
            base_currency=r.base_currency,
            quote_currency=r.quote_currency.upper(),
            rate=format(Decimal(r.rate).normalize(), "f"),
            source=r.source,
            as_of=r.as_of,
        )
        for r in rows
    }
    supported = [str(c).upper() for c in (await get_setting(db, "supported_currencies") or [])]
    now = datetime.now(UTC)
    for code in supported:
        if code == BASE_CURRENCY or code in out or code not in DEFAULT_FX_RATES:
            continue
        out[code] = FxRateOut(
            base_currency=BASE_CURRENCY,
            quote_currency=code,
            rate=format(DEFAULT_FX_RATES[code].normalize(), "f"),
            source="default",
            as_of=now,
        )
    return [out[k] for k in sorted(out)]


async def accommodations(
    db: AsyncSession, *, city: str | None = None, hospital_id: uuid.UUID | None = None, limit: int = 100
) -> list[AccommodationProviderOut]:
    if hospital_id is not None:
        stmt: Any = (
            select(AccommodationProvider, AccommodationHospitalLink.distance_km)
            .join(
                AccommodationHospitalLink, AccommodationHospitalLink.provider_id == AccommodationProvider.id
            )
            .where(AccommodationHospitalLink.hospital_id == hospital_id)
            .order_by(
                AccommodationHospitalLink.distance_km.asc().nulls_last(),
                AccommodationProvider.name,
                AccommodationProvider.id,
            )
        )
    else:
        stmt = select(AccommodationProvider, literal(None).label("distance_km")).order_by(
            AccommodationProvider.star_rating.desc().nulls_last(),
            AccommodationProvider.name,
            AccommodationProvider.id,
        )
    stmt = stmt.where(AccommodationProvider.is_active.is_(True))
    if city and city.strip():
        stmt = stmt.where(func.lower(AccommodationProvider.city) == city.strip().lower())
    out: list[AccommodationProviderOut] = []
    for provider, distance in (await db.execute(stmt.limit(limit))).all():
        item = AccommodationProviderOut.model_validate(provider)
        item.type = str(provider.type)
        item.distance_km = _float(distance)
        out.append(item)
    return out


async def service_providers(
    db: AsyncSession,
    *,
    kind: ServiceKind | None = None,
    city: str | None = None,
    language: str | None = None,
    limit: int = 100,
) -> list[ServiceProviderOut]:
    stmt = select(ServiceProvider).where(ServiceProvider.is_active.is_(True))
    if kind is not None:
        stmt = stmt.where(ServiceProvider.kind == kind)
    if city and city.strip():
        stmt = stmt.where(func.lower(ServiceProvider.city) == city.strip().lower())
    if language and language.strip():
        stmt = stmt.where(ServiceProvider.languages.overlap(language_variants(language)))
    stmt = stmt.order_by(ServiceProvider.rating_avg.desc(), ServiceProvider.name, ServiceProvider.id).limit(
        limit
    )
    out: list[ServiceProviderOut] = []
    for p in (await db.execute(stmt)).scalars():
        item = ServiceProviderOut.model_validate(p)
        item.kind = str(p.kind)
        item.rate_unit = str(p.rate_unit) if p.rate_unit is not None else None
        item.rating_avg = _float(p.rating_avg)
        out.append(item)
    return out


__all__ = [
    "CACHE_PREFIX",
    "IST",
    "accommodations",
    "availability_range",
    "build_doctor_cards",
    "build_doctor_detail",
    "medical_councils",
    "registration_fields",
    "build_hospital_cards",
    "build_hospital_procedures",
    "cached",
    "cost_comparison",
    "cultural_tips",
    "doctor_procedures",
    "fx_rates",
    "get_active_doctor",
    "get_active_hospital",
    "get_availability",
    "get_doctor_detail",
    "get_hospital_detail",
    "get_procedure",
    "get_specialty",
    "helplines",
    "invalidate_catalog_cache",
    "list_doctors",
    "list_hospitals",
    "list_procedures",
    "list_specialties",
    "next_available_date",
    "package_out",
    "review_outs",
    "search",
    "service_providers",
    "today_ist",
]
