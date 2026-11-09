"""Catalog & content CRUD for the admin console (PLAN 8.13).

Resources: specialties, procedures, cost benchmarks, cultural tips, accommodation providers (with
hospital links), service providers and FX rates. Every write is validated (unique slugs / natural keys,
referenced rows exist, min <= max), audit-logged and committed; then the public catalog cache (``catalog:``
prefix) is invalidated.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect as sa_inspect

from app.core import cache
from app.core.audit import audit_log
from app.core.enums import ServiceKind
from app.core.errors import BadRequest, Conflict, NotFound
from app.models import (
    AccommodationHospitalLink,
    AccommodationProvider,
    CostBenchmark,
    CulturalTip,
    FxRate,
    Hospital,
    Procedure,
    ServiceProvider,
    Specialty,
    User,
)
from app.modules.admin.schemas import (
    AccommodationProviderIn,
    AccommodationProviderOut,
    AccommodationProviderPatch,
    AdminProcedureOut,
    AdminSpecialtyOut,
    CostBenchmarkIn,
    CostBenchmarkOut,
    CostBenchmarkPatch,
    CulturalTipIn,
    CulturalTipOut,
    CulturalTipPatch,
    FxRateIn,
    FxRateOut,
    FxRatePatch,
    HospitalLinkIn,
    HospitalLinkOut,
    IdSlugName,
    ProcedureIn,
    ProcedurePatch,
    ServiceProviderIn,
    ServiceProviderOut,
    ServiceProviderPatch,
    SpecialtyIn,
    SpecialtyPatch,
)
from app.modules.admin.service import clean_term, like_pattern

CATALOG_CACHE_PREFIX = "catalog:"
LIST_LIMIT = 1000


# ------------------------------------------------------------------------------------------------ helpers
def _snapshot(obj: Any) -> dict[str, Any]:
    mapper = sa_inspect(type(obj))
    return {attr.key: getattr(obj, attr.key) for attr in mapper.column_attrs}


def _patch_data(body: BaseModel, non_nullable: set[str]) -> dict[str, Any]:
    data = body.model_dump(exclude_unset=True)
    nulls = sorted(k for k, v in data.items() if v is None and k in non_nullable)
    if nulls:
        raise BadRequest(f"Fields cannot be null: {', '.join(nulls)}", code="invalid_field", details=nulls)
    return data


def _non_nullable(model: type[Any]) -> set[str]:
    return {c.key for c in sa_inspect(model).column_attrs if not all(col.nullable for col in c.columns)}


async def _get(db: AsyncSession, model: type[Any], obj_id: uuid.UUID, label: str) -> Any:
    obj = await db.get(model, obj_id)
    if obj is None:
        raise NotFound(f"{label} not found")
    return obj


async def _commit(
    db: AsyncSession,
    actor: User,
    request: Request | None,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    conflict_message: str = "This change conflicts with existing data",
    conflict_code: str = "conflict",
) -> None:
    await audit_log(
        db,
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=before,
        after=after,
        request=request,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict(conflict_message, code=conflict_code) from exc
    await cache.clear_prefix(CATALOG_CACHE_PREFIX)


async def _delete(
    db: AsyncSession, actor: User, request: Request | None, obj: Any, entity_type: str, in_use_message: str
) -> None:
    obj_id = obj.id
    before = _snapshot(obj)
    await db.delete(obj)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise Conflict(in_use_message, code="in_use") from exc
    await _commit(
        db,
        actor,
        request,
        action=f"{entity_type}.delete",
        entity_type=entity_type,
        entity_id=obj_id,
        before=before,
        after=None,
    )


def _range_ok(low: int | None, high: int | None, what: str) -> None:
    if low is not None and high is not None and low > high:
        raise BadRequest(f"{what}: minimum must not exceed maximum", code="invalid_range")


# ---------------------------------------------------------------------------------------------- specialties
async def _specialty_outs(db: AsyncSession, specs: Sequence[Specialty]) -> list[AdminSpecialtyOut]:
    if not specs:
        return []
    counts = dict(
        (
            await db.execute(
                select(Procedure.specialty_id, func.count(Procedure.id))
                .where(Procedure.specialty_id.in_([s.id for s in specs]))
                .group_by(Procedure.specialty_id)
            )
        ).all()
    )
    out = []
    for s in specs:
        item = AdminSpecialtyOut.model_validate(s)
        item.procedures_count = int(counts.get(s.id, 0))
        out.append(item)
    return out


async def _ensure_specialty_slug_free(db: AsyncSession, slug: str, exclude: uuid.UUID | None = None) -> None:
    stmt = select(Specialty.id).where(Specialty.slug == slug)
    if exclude is not None:
        stmt = stmt.where(Specialty.id != exclude)
    if (await db.execute(stmt)).first() is not None:
        raise Conflict(f"Slug '{slug}' is already used by another specialty", code="slug_taken")


async def list_specialties(
    db: AsyncSession, q: str | None, is_active: bool | None
) -> list[AdminSpecialtyOut]:
    stmt = select(Specialty)
    term = clean_term(q)
    if term:
        pattern = like_pattern(term)
        stmt = stmt.where(
            or_(Specialty.name.ilike(pattern, escape="\\"), Specialty.slug.ilike(pattern, escape="\\"))
        )
    if is_active is not None:
        stmt = stmt.where(Specialty.is_active.is_(is_active))
    stmt = stmt.order_by(Specialty.sort_order, Specialty.name, Specialty.id).limit(LIST_LIMIT)
    return await _specialty_outs(db, (await db.execute(stmt)).scalars().all())


async def get_specialty(db: AsyncSession, spec_id: uuid.UUID) -> AdminSpecialtyOut:
    return (await _specialty_outs(db, [await _get(db, Specialty, spec_id, "Specialty")]))[0]


async def create_specialty(
    db: AsyncSession, actor: User, body: SpecialtyIn, request: Request | None
) -> AdminSpecialtyOut:
    await _ensure_specialty_slug_free(db, body.slug)
    spec = Specialty(**body.model_dump())
    db.add(spec)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="specialty.create",
        entity_type="specialty",
        entity_id=spec.id,
        before=None,
        after=_snapshot(spec),
        conflict_code="slug_taken",
        conflict_message="Slug already in use",
    )
    return await get_specialty(db, spec.id)


async def update_specialty(
    db: AsyncSession, actor: User, spec_id: uuid.UUID, body: SpecialtyPatch, request: Request | None
) -> AdminSpecialtyOut:
    spec: Specialty = await _get(db, Specialty, spec_id, "Specialty")
    data = _patch_data(body, _non_nullable(Specialty))
    if "slug" in data:
        await _ensure_specialty_slug_free(db, data["slug"], exclude=spec.id)
    _range_ok(
        data.get("savings_min_pct", spec.savings_min_pct),
        data.get("savings_max_pct", spec.savings_max_pct),
        "savings_pct",
    )
    before = _snapshot(spec)
    for key, value in data.items():
        setattr(spec, key, value)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="specialty.update",
        entity_type="specialty",
        entity_id=spec.id,
        before=before,
        after=_snapshot(spec),
        conflict_code="slug_taken",
        conflict_message="Slug already in use",
    )
    return await get_specialty(db, spec_id)


async def delete_specialty(
    db: AsyncSession, actor: User, spec_id: uuid.UUID, request: Request | None
) -> None:
    spec = await _get(db, Specialty, spec_id, "Specialty")
    await _delete(
        db,
        actor,
        request,
        spec,
        "specialty",
        "Specialty is used by procedures or doctors; deactivate it instead",
    )


# ----------------------------------------------------------------------------------------------- procedures
def _benchmark_out(b: CostBenchmark) -> CostBenchmarkOut:
    return CostBenchmarkOut.model_validate(b, from_attributes=True)


async def _procedure_outs(db: AsyncSession, procs: Sequence[Procedure]) -> list[AdminProcedureOut]:
    if not procs:
        return []
    specs = {
        s.id: s
        for s in (
            await db.execute(select(Specialty).where(Specialty.id.in_({p.specialty_id for p in procs})))
        ).scalars()
    }
    benches: dict[uuid.UUID, list[CostBenchmarkOut]] = defaultdict(list)
    rows = await db.execute(
        select(CostBenchmark)
        .where(CostBenchmark.procedure_id.in_([p.id for p in procs]))
        .order_by(CostBenchmark.country_code, CostBenchmark.id)
    )
    for b in rows.scalars():
        benches[b.procedure_id].append(_benchmark_out(b))
    out = []
    for p in procs:
        spec = specs[p.specialty_id]
        out.append(
            AdminProcedureOut(
                id=p.id,
                slug=p.slug,
                name=p.name,
                description=p.description,
                specialty=IdSlugName(id=spec.id, slug=spec.slug, name=spec.name),
                keywords=list(p.keywords or []),
                body_areas=list(p.body_areas or []),
                hospital_stay_days=p.hospital_stay_days,
                recovery_days=p.recovery_days,
                total_stay_days=p.total_stay_days,
                india_price_min_minor=p.india_price_min_minor,
                india_price_max_minor=p.india_price_max_minor,
                currency=p.currency,
                is_active=p.is_active,
                benchmarks=benches.get(p.id, []),
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return out


async def _ensure_procedure_slug_free(db: AsyncSession, slug: str, exclude: uuid.UUID | None = None) -> None:
    stmt = select(Procedure.id).where(Procedure.slug == slug)
    if exclude is not None:
        stmt = stmt.where(Procedure.id != exclude)
    if (await db.execute(stmt)).first() is not None:
        raise Conflict(f"Slug '{slug}' is already used by another procedure", code="slug_taken")


async def _ensure_exists(db: AsyncSession, model: type[Any], obj_id: uuid.UUID, label: str) -> None:
    if (await db.execute(select(model.id).where(model.id == obj_id))).first() is None:
        raise BadRequest(f"{label} does not exist", code="invalid_reference", details={"id": str(obj_id)})


async def list_procedures(
    db: AsyncSession, specialty_id: uuid.UUID | None, q: str | None, is_active: bool | None
) -> list[AdminProcedureOut]:
    stmt = select(Procedure)
    if specialty_id is not None:
        stmt = stmt.where(Procedure.specialty_id == specialty_id)
    term = clean_term(q)
    if term:
        pattern = like_pattern(term)
        stmt = stmt.where(
            or_(Procedure.name.ilike(pattern, escape="\\"), Procedure.slug.ilike(pattern, escape="\\"))
        )
    if is_active is not None:
        stmt = stmt.where(Procedure.is_active.is_(is_active))
    stmt = stmt.order_by(Procedure.name, Procedure.id).limit(LIST_LIMIT)
    return await _procedure_outs(db, (await db.execute(stmt)).scalars().all())


async def get_procedure(db: AsyncSession, proc_id: uuid.UUID) -> AdminProcedureOut:
    return (await _procedure_outs(db, [await _get(db, Procedure, proc_id, "Procedure")]))[0]


async def create_procedure(
    db: AsyncSession, actor: User, body: ProcedureIn, request: Request | None
) -> AdminProcedureOut:
    await _ensure_exists(db, Specialty, body.specialty_id, "Specialty")
    await _ensure_procedure_slug_free(db, body.slug)
    proc = Procedure(**body.model_dump())
    db.add(proc)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="procedure.create",
        entity_type="procedure",
        entity_id=proc.id,
        before=None,
        after=_snapshot(proc),
        conflict_code="slug_taken",
        conflict_message="Slug already in use",
    )
    return await get_procedure(db, proc.id)


async def update_procedure(
    db: AsyncSession, actor: User, proc_id: uuid.UUID, body: ProcedurePatch, request: Request | None
) -> AdminProcedureOut:
    proc: Procedure = await _get(db, Procedure, proc_id, "Procedure")
    data = _patch_data(body, _non_nullable(Procedure))
    if "specialty_id" in data:
        await _ensure_exists(db, Specialty, data["specialty_id"], "Specialty")
    if "slug" in data:
        await _ensure_procedure_slug_free(db, data["slug"], exclude=proc.id)
    _range_ok(
        data.get("india_price_min_minor", proc.india_price_min_minor),
        data.get("india_price_max_minor", proc.india_price_max_minor),
        "india_price",
    )
    before = _snapshot(proc)
    for key, value in data.items():
        setattr(proc, key, value)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="procedure.update",
        entity_type="procedure",
        entity_id=proc.id,
        before=before,
        after=_snapshot(proc),
        conflict_code="slug_taken",
        conflict_message="Slug already in use",
    )
    return await get_procedure(db, proc_id)


async def delete_procedure(
    db: AsyncSession, actor: User, proc_id: uuid.UUID, request: Request | None
) -> None:
    proc = await _get(db, Procedure, proc_id, "Procedure")
    await _delete(
        db, actor, request, proc, "procedure", "Procedure is offered by hospitals; deactivate it instead"
    )


# ------------------------------------------------------------------------------------------ cost benchmarks
async def _ensure_benchmark_free(
    db: AsyncSession, procedure_id: uuid.UUID, country_code: str, exclude: uuid.UUID | None = None
) -> None:
    stmt = select(CostBenchmark.id).where(
        CostBenchmark.procedure_id == procedure_id, CostBenchmark.country_code == country_code
    )
    if exclude is not None:
        stmt = stmt.where(CostBenchmark.id != exclude)
    if (await db.execute(stmt)).first() is not None:
        raise Conflict(
            f"A benchmark for {country_code} already exists for this procedure", code="duplicate_benchmark"
        )


async def list_cost_benchmarks(
    db: AsyncSession, procedure_id: uuid.UUID | None, country_code: str | None
) -> list[CostBenchmarkOut]:
    stmt = select(CostBenchmark)
    if procedure_id is not None:
        stmt = stmt.where(CostBenchmark.procedure_id == procedure_id)
    if country_code:
        stmt = stmt.where(CostBenchmark.country_code == country_code.strip().upper())
    stmt = stmt.order_by(CostBenchmark.procedure_id, CostBenchmark.country_code, CostBenchmark.id).limit(
        LIST_LIMIT
    )
    return [_benchmark_out(b) for b in (await db.execute(stmt)).scalars()]


async def get_cost_benchmark(db: AsyncSession, bench_id: uuid.UUID) -> CostBenchmarkOut:
    return _benchmark_out(await _get(db, CostBenchmark, bench_id, "Cost benchmark"))


async def create_cost_benchmark(
    db: AsyncSession, actor: User, body: CostBenchmarkIn, request: Request | None
) -> CostBenchmarkOut:
    await _ensure_exists(db, Procedure, body.procedure_id, "Procedure")
    await _ensure_benchmark_free(db, body.procedure_id, body.country_code)
    bench = CostBenchmark(**body.model_dump())
    db.add(bench)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="cost_benchmark.create",
        entity_type="cost_benchmark",
        entity_id=bench.id,
        before=None,
        after=_snapshot(bench),
        conflict_code="duplicate_benchmark",
    )
    return await get_cost_benchmark(db, bench.id)


async def update_cost_benchmark(
    db: AsyncSession, actor: User, bench_id: uuid.UUID, body: CostBenchmarkPatch, request: Request | None
) -> CostBenchmarkOut:
    bench: CostBenchmark = await _get(db, CostBenchmark, bench_id, "Cost benchmark")
    data = _patch_data(body, _non_nullable(CostBenchmark))
    if "country_code" in data:
        await _ensure_benchmark_free(db, bench.procedure_id, data["country_code"], exclude=bench.id)
    _range_ok(
        data.get("cost_min_minor", bench.cost_min_minor),
        data.get("cost_max_minor", bench.cost_max_minor),
        "cost",
    )
    before = _snapshot(bench)
    for key, value in data.items():
        setattr(bench, key, value)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="cost_benchmark.update",
        entity_type="cost_benchmark",
        entity_id=bench.id,
        before=before,
        after=_snapshot(bench),
        conflict_code="duplicate_benchmark",
    )
    return await get_cost_benchmark(db, bench_id)


async def delete_cost_benchmark(
    db: AsyncSession, actor: User, bench_id: uuid.UUID, request: Request | None
) -> None:
    bench = await _get(db, CostBenchmark, bench_id, "Cost benchmark")
    await _delete(db, actor, request, bench, "cost_benchmark", "Cost benchmark is in use")


# ------------------------------------------------------------------------------------------- cultural tips
async def list_cultural_tips(db: AsyncSession, category: str | None) -> list[CulturalTipOut]:
    stmt = select(CulturalTip)
    if category:
        stmt = stmt.where(CulturalTip.category == category.strip())
    stmt = stmt.order_by(CulturalTip.sort_order, CulturalTip.title, CulturalTip.id).limit(LIST_LIMIT)
    return [CulturalTipOut.model_validate(t) for t in (await db.execute(stmt)).scalars()]


async def get_cultural_tip(db: AsyncSession, tip_id: uuid.UUID) -> CulturalTipOut:
    return CulturalTipOut.model_validate(await _get(db, CulturalTip, tip_id, "Cultural tip"))


async def create_cultural_tip(
    db: AsyncSession, actor: User, body: CulturalTipIn, request: Request | None
) -> CulturalTipOut:
    tip = CulturalTip(**body.model_dump())
    db.add(tip)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="cultural_tip.create",
        entity_type="cultural_tip",
        entity_id=tip.id,
        before=None,
        after=_snapshot(tip),
    )
    return await get_cultural_tip(db, tip.id)


async def update_cultural_tip(
    db: AsyncSession, actor: User, tip_id: uuid.UUID, body: CulturalTipPatch, request: Request | None
) -> CulturalTipOut:
    tip: CulturalTip = await _get(db, CulturalTip, tip_id, "Cultural tip")
    data = _patch_data(body, _non_nullable(CulturalTip))
    before = _snapshot(tip)
    for key, value in data.items():
        setattr(tip, key, value)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="cultural_tip.update",
        entity_type="cultural_tip",
        entity_id=tip.id,
        before=before,
        after=_snapshot(tip),
    )
    return await get_cultural_tip(db, tip_id)


async def delete_cultural_tip(
    db: AsyncSession, actor: User, tip_id: uuid.UUID, request: Request | None
) -> None:
    tip = await _get(db, CulturalTip, tip_id, "Cultural tip")
    await _delete(db, actor, request, tip, "cultural_tip", "Cultural tip is in use")


# -------------------------------------------------------------------------------- accommodation providers
async def _accommodation_outs(
    db: AsyncSession, providers: Sequence[AccommodationProvider]
) -> list[AccommodationProviderOut]:
    if not providers:
        return []
    links: dict[uuid.UUID, list[HospitalLinkOut]] = defaultdict(list)
    rows = await db.execute(
        select(AccommodationHospitalLink, Hospital.name)
        .join(Hospital, Hospital.id == AccommodationHospitalLink.hospital_id)
        .where(AccommodationHospitalLink.provider_id.in_([p.id for p in providers]))
        .order_by(AccommodationHospitalLink.distance_km.asc().nulls_last(), Hospital.name)
    )
    for link, hospital_name in rows.all():
        links[link.provider_id].append(
            HospitalLinkOut(
                hospital_id=link.hospital_id,
                hospital_name=hospital_name,
                distance_km=float(link.distance_km) if link.distance_km is not None else None,
            )
        )
    return [
        AccommodationProviderOut(
            id=p.id,
            name=p.name,
            type=p.type,
            city=p.city,
            address=p.address,
            lat=p.lat,
            lng=p.lng,
            star_rating=p.star_rating,
            amenities=list(p.amenities or []),
            nightly_rate_minor=p.nightly_rate_minor,
            currency=p.currency,
            photos=list(p.photos or []),
            phone=p.phone,
            email=p.email,
            is_active=p.is_active,
            hospital_links=links.get(p.id, []),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in providers
    ]


async def _replace_links(
    db: AsyncSession, provider_id: uuid.UUID, links: list[HospitalLinkIn]
) -> list[dict[str, Any]]:
    by_hospital: dict[uuid.UUID, Decimal | None] = {}
    for link in links:
        by_hospital[link.hospital_id] = link.distance_km
    if by_hospital:
        found = set(
            (await db.execute(select(Hospital.id).where(Hospital.id.in_(list(by_hospital))))).scalars().all()
        )
        missing = [str(h) for h in by_hospital if h not in found]
        if missing:
            raise BadRequest("Unknown hospital in hospital_links", code="invalid_reference", details=missing)
    await db.execute(
        delete(AccommodationHospitalLink).where(AccommodationHospitalLink.provider_id == provider_id)
    )
    for hospital_id, distance in by_hospital.items():
        db.add(
            AccommodationHospitalLink(provider_id=provider_id, hospital_id=hospital_id, distance_km=distance)
        )
    return [{"hospital_id": str(h), "distance_km": d} for h, d in by_hospital.items()]


async def list_accommodation_providers(
    db: AsyncSession, city: str | None, hospital_id: uuid.UUID | None, q: str | None
) -> list[AccommodationProviderOut]:
    stmt = select(AccommodationProvider)
    if city:
        stmt = stmt.where(func.lower(AccommodationProvider.city) == city.strip().lower())
    if hospital_id is not None:
        stmt = stmt.where(
            AccommodationProvider.id.in_(
                select(AccommodationHospitalLink.provider_id).where(
                    AccommodationHospitalLink.hospital_id == hospital_id
                )
            )
        )
    term = clean_term(q)
    if term:
        stmt = stmt.where(AccommodationProvider.name.ilike(like_pattern(term), escape="\\"))
    stmt = stmt.order_by(AccommodationProvider.name, AccommodationProvider.id).limit(LIST_LIMIT)
    return await _accommodation_outs(db, (await db.execute(stmt)).scalars().all())


async def get_accommodation_provider(db: AsyncSession, provider_id: uuid.UUID) -> AccommodationProviderOut:
    provider = await _get(db, AccommodationProvider, provider_id, "Accommodation provider")
    return (await _accommodation_outs(db, [provider]))[0]


async def create_accommodation_provider(
    db: AsyncSession, actor: User, body: AccommodationProviderIn, request: Request | None
) -> AccommodationProviderOut:
    data = body.model_dump(exclude={"hospital_links"})
    if data.get("email") is not None:
        data["email"] = str(data["email"])
    provider = AccommodationProvider(**data)
    db.add(provider)
    await db.flush()
    links = await _replace_links(db, provider.id, body.hospital_links)
    await _commit(
        db,
        actor,
        request,
        action="accommodation_provider.create",
        entity_type="accommodation_provider",
        entity_id=provider.id,
        before=None,
        after={**_snapshot(provider), "hospital_links": links},
    )
    return await get_accommodation_provider(db, provider.id)


async def update_accommodation_provider(
    db: AsyncSession,
    actor: User,
    provider_id: uuid.UUID,
    body: AccommodationProviderPatch,
    request: Request | None,
) -> AccommodationProviderOut:
    provider: AccommodationProvider = await _get(
        db, AccommodationProvider, provider_id, "Accommodation provider"
    )
    data = _patch_data(body, _non_nullable(AccommodationProvider) | {"hospital_links", "city"})
    links_in = data.pop("hospital_links", None)
    if data.get("email") is not None:
        data["email"] = str(data["email"])
    before = _snapshot(provider)
    for key, value in data.items():
        setattr(provider, key, value)
    after = _snapshot(provider)
    if links_in is not None and body.hospital_links is not None:
        after["hospital_links"] = await _replace_links(db, provider.id, body.hospital_links)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="accommodation_provider.update",
        entity_type="accommodation_provider",
        entity_id=provider.id,
        before=before,
        after=after,
    )
    return await get_accommodation_provider(db, provider_id)


async def delete_accommodation_provider(
    db: AsyncSession, actor: User, provider_id: uuid.UUID, request: Request | None
) -> None:
    provider = await _get(db, AccommodationProvider, provider_id, "Accommodation provider")
    await _delete(
        db,
        actor,
        request,
        provider,
        "accommodation_provider",
        "Accommodation provider has bookings; deactivate it instead",
    )


# -------------------------------------------------------------------------------------- service providers
def _service_out(p: ServiceProvider) -> ServiceProviderOut:
    return ServiceProviderOut(
        id=p.id,
        kind=p.kind,
        name=p.name,
        city=p.city,
        languages=list(p.languages or []),
        phone=p.phone,
        email=p.email,
        rate_minor=p.rate_minor,
        rate_unit=p.rate_unit,
        currency=p.currency,
        rating_avg=float(p.rating_avg) if p.rating_avg is not None else None,
        is_active=p.is_active,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def list_service_providers(
    db: AsyncSession, kind: ServiceKind | None, city: str | None, q: str | None
) -> list[ServiceProviderOut]:
    stmt = select(ServiceProvider)
    if kind is not None:
        stmt = stmt.where(ServiceProvider.kind == kind)
    if city:
        stmt = stmt.where(func.lower(ServiceProvider.city) == city.strip().lower())
    term = clean_term(q)
    if term:
        stmt = stmt.where(ServiceProvider.name.ilike(like_pattern(term), escape="\\"))
    stmt = stmt.order_by(ServiceProvider.kind, ServiceProvider.name, ServiceProvider.id).limit(LIST_LIMIT)
    return [_service_out(p) for p in (await db.execute(stmt)).scalars()]


async def get_service_provider(db: AsyncSession, provider_id: uuid.UUID) -> ServiceProviderOut:
    return _service_out(await _get(db, ServiceProvider, provider_id, "Service provider"))


async def create_service_provider(
    db: AsyncSession, actor: User, body: ServiceProviderIn, request: Request | None
) -> ServiceProviderOut:
    data = body.model_dump()
    if data.get("rate_unit") is None:
        data.pop("rate_unit", None)
    if data.get("email") is not None:
        data["email"] = str(data["email"])
    provider = ServiceProvider(**data)
    db.add(provider)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="service_provider.create",
        entity_type="service_provider",
        entity_id=provider.id,
        before=None,
        after=_snapshot(provider),
    )
    return await get_service_provider(db, provider.id)


async def update_service_provider(
    db: AsyncSession, actor: User, provider_id: uuid.UUID, body: ServiceProviderPatch, request: Request | None
) -> ServiceProviderOut:
    provider: ServiceProvider = await _get(db, ServiceProvider, provider_id, "Service provider")
    data = _patch_data(body, _non_nullable(ServiceProvider))
    if data.get("email") is not None:
        data["email"] = str(data["email"])
    before = _snapshot(provider)
    for key, value in data.items():
        setattr(provider, key, value)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="service_provider.update",
        entity_type="service_provider",
        entity_id=provider.id,
        before=before,
        after=_snapshot(provider),
    )
    return await get_service_provider(db, provider_id)


async def delete_service_provider(
    db: AsyncSession, actor: User, provider_id: uuid.UUID, request: Request | None
) -> None:
    provider = await _get(db, ServiceProvider, provider_id, "Service provider")
    await _delete(
        db,
        actor,
        request,
        provider,
        "service_provider",
        "Service provider has bookings; deactivate it instead",
    )


# ------------------------------------------------------------------------------------------------ FX rates
def _fx_out(r: FxRate) -> FxRateOut:
    return FxRateOut(
        id=r.id,
        base_currency=r.base_currency,
        quote_currency=r.quote_currency,
        rate=format(Decimal(r.rate).normalize(), "f"),
        source=r.source,
        as_of=r.as_of,
        updated_at=r.updated_at,
    )


async def list_fx_rates(db: AsyncSession) -> list[FxRateOut]:
    stmt = select(FxRate).order_by(FxRate.quote_currency, FxRate.id).limit(LIST_LIMIT)
    return [_fx_out(r) for r in (await db.execute(stmt)).scalars()]


async def get_fx_rate(db: AsyncSession, rate_id: uuid.UUID) -> FxRateOut:
    return _fx_out(await _get(db, FxRate, rate_id, "FX rate"))


async def create_fx_rate(db: AsyncSession, actor: User, body: FxRateIn, request: Request | None) -> FxRateOut:
    exists = await db.execute(
        select(FxRate.id).where(
            FxRate.base_currency == body.base_currency, FxRate.quote_currency == body.quote_currency
        )
    )
    if exists.first() is not None:
        raise Conflict(
            f"A rate for {body.quote_currency} already exists; update it instead", code="duplicate_rate"
        )
    rate = FxRate(
        base_currency=body.base_currency,
        quote_currency=body.quote_currency,
        rate=body.rate,
        source=body.source or "manual",
        as_of=datetime.now(UTC),
    )
    db.add(rate)
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="fx_rate.create",
        entity_type="fx_rate",
        entity_id=rate.id,
        before=None,
        after=_snapshot(rate),
        conflict_code="duplicate_rate",
    )
    return await get_fx_rate(db, rate.id)


async def update_fx_rate(
    db: AsyncSession, actor: User, rate_id: uuid.UUID, body: FxRatePatch, request: Request | None
) -> FxRateOut:
    rate: FxRate = await _get(db, FxRate, rate_id, "FX rate")
    data = _patch_data(body, {"rate"})
    before = _snapshot(rate)
    for key, value in data.items():
        setattr(rate, key, value)
    if "rate" in data:
        rate.as_of = datetime.now(UTC)
        if "source" not in data:
            rate.source = "manual"
    await db.flush()
    await _commit(
        db,
        actor,
        request,
        action="fx_rate.update",
        entity_type="fx_rate",
        entity_id=rate.id,
        before=before,
        after=_snapshot(rate),
    )
    return await get_fx_rate(db, rate_id)


async def delete_fx_rate(db: AsyncSession, actor: User, rate_id: uuid.UUID, request: Request | None) -> None:
    rate = await _get(db, FxRate, rate_id, "FX rate")
    await _delete(db, actor, request, rate, "fx_rate", "FX rate is in use")
