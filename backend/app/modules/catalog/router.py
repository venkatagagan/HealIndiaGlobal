"""Public catalog routes (PLAN 8.4). No authentication; only active records are exposed.

Hot reads are cached for ~60 s under the ``catalog:`` prefix; hospital-portal and admin catalog writes call
``app.modules.catalog.service.invalidate_catalog_cache()`` after committing.

HTTP caching (``http_cache.PublicCacheRoute``): every public GET carries an ``ETag`` and a shared-cache
friendly ``Cache-Control`` (304 on ``If-None-Match``) and is rate-limited per client IP, with a separate
generous budget for the website's servers (``WEBSITE_SERVER_IPS``). Responses hold catalogue data only, never
personal data. The staff-only ``/admin/catalog/*`` reports (``admin.py``) are included at the bottom with
plain routes.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query

from app.core.deps import DbSession, PageParams
from app.core.enums import Gender, ServiceKind
from app.core.errors import NotFound
from app.core.pagination import Page
from app.modules.catalog import service
from app.modules.catalog.admin import admin_router
from app.modules.catalog.http_cache import PublicCacheRoute
from app.modules.catalog.schemas import (
    AccommodationProviderOut,
    AvailabilityDay,
    CostComparisonOut,
    CulturalTipOut,
    DoctorCard,
    DoctorDetail,
    FxRateOut,
    HospitalCard,
    HospitalDetail,
    MedicalCouncilOut,
    ProcedureOut,
    SearchResults,
    ServiceProviderOut,
    SpecialtyOut,
    SymptomOut,
)
from app.modules.catalog.symptoms import filter_symptoms
from app.modules.catalog.utils import cache_key

router = APIRouter(tags=["catalog"], route_class=PublicCacheRoute)

ShortStr = Annotated[str | None, Query(max_length=100)]
Slug = Annotated[str | None, Query(max_length=160)]


# ----------------------------------------------------------------------------- specialties
@router.get("/specialties", response_model=list[SpecialtyOut])
async def list_specialties(db: DbSession) -> Any:
    async def produce() -> Any:
        return [s.model_dump(mode="json") for s in await service.list_specialties(db)]

    return await service.cached("catalog:specialties:all", produce)


@router.get("/specialties/{slug}", response_model=SpecialtyOut)
async def get_specialty(slug: str, db: DbSession) -> Any:
    async def produce() -> Any:
        return (await service.get_specialty(db, slug)).model_dump(mode="json")

    return await service.cached(cache_key("specialty", slug=slug), produce)


# ----------------------------------------------------------------------------- procedures
@router.get("/procedures", response_model=list[ProcedureOut])
async def list_procedures(db: DbSession, specialty: Slug = None, q: ShortStr = None) -> Any:
    async def produce() -> Any:
        return [
            p.model_dump(mode="json") for p in await service.list_procedures(db, specialty=specialty, q=q)
        ]

    return await service.cached(cache_key("procedures", specialty=specialty, q=q), produce)


@router.get("/procedures/{slug}", response_model=ProcedureOut)
async def get_procedure(slug: str, db: DbSession) -> Any:
    async def produce() -> Any:
        return (await service.get_procedure(db, slug)).model_dump(mode="json")

    return await service.cached(cache_key("procedure", slug=slug), produce)


# ----------------------------------------------------------------------------- hospitals
@router.get("/hospitals", response_model=Page[HospitalCard])
async def list_hospitals(
    db: DbSession,
    params: PageParams,
    q: ShortStr = None,
    city: ShortStr = None,
    specialty: Slug = None,
    procedure: Slug = None,
    accreditation: Annotated[str | None, Query(max_length=20)] = None,
    language: Annotated[str | None, Query(max_length=40)] = None,
    sort: Literal["rating", "price", "name"] | None = None,
) -> Any:
    filters = {
        "q": q,
        "city": city,
        "specialty": specialty,
        "procedure": procedure,
        "accreditation": accreditation,
        "language": language,
        "sort": sort,
    }

    async def produce() -> Any:
        return (await service.list_hospitals(db, params, **filters)).model_dump(mode="json")

    key = cache_key("hospitals", page=params.page, page_size=params.page_size, **filters)
    return await service.cached(key, produce)


@router.get("/hospitals/{slug_or_id}", response_model=HospitalDetail)
async def get_hospital(slug_or_id: str, db: DbSession) -> Any:
    async def produce() -> Any:
        return (await service.get_hospital_detail(db, slug_or_id)).model_dump(mode="json")

    return await service.cached(cache_key("hospital", key=slug_or_id), produce)


@router.get("/hospitals/{hospital_id}/availability", response_model=list[AvailabilityDay])
async def hospital_availability(
    hospital_id: uuid.UUID,
    db: DbSession,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
    doctor_id: uuid.UUID | None = None,
) -> Any:
    hospital = await service.get_active_hospital(db, str(hospital_id))
    if doctor_id is not None:
        doctor = await service.get_active_doctor(db, str(doctor_id))
        if doctor.hospital_id != hospital.id:
            raise NotFound("Doctor not found")
    return await service.get_availability(
        db, hospital_id=hospital.id, doctor_id=doctor_id, date_from=from_, date_to=to
    )


# ----------------------------------------------------------------------------- doctors
@router.get("/doctors", response_model=Page[DoctorCard])
async def list_doctors(
    db: DbSession,
    params: PageParams,
    q: ShortStr = None,
    specialty: Slug = None,
    hospital_id: uuid.UUID | None = None,
    language: Annotated[str | None, Query(max_length=40)] = None,
    gender: Gender | None = None,
    procedure: Slug = None,
) -> Any:
    filters: dict[str, Any] = {
        "q": q,
        "specialty": specialty,
        "hospital_id": hospital_id,
        "language": language,
        "gender": gender,
        "procedure": procedure,
    }

    async def produce() -> Any:
        return (await service.list_doctors(db, params, **filters)).model_dump(mode="json")

    key = cache_key("doctors", page=params.page, page_size=params.page_size, **filters)
    return await service.cached(key, produce)


@router.get("/doctors/{doctor_id}", response_model=DoctorDetail)
async def get_doctor(doctor_id: str, db: DbSession) -> Any:
    async def produce() -> Any:
        return (await service.get_doctor_detail(db, doctor_id)).model_dump(mode="json")

    return await service.cached(cache_key("doctor", key=doctor_id), produce)


@router.get("/doctors/{doctor_id}/availability", response_model=list[AvailabilityDay])
async def doctor_availability(
    doctor_id: uuid.UUID,
    db: DbSession,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
) -> Any:
    doctor = await service.get_active_doctor(db, str(doctor_id))
    return await service.get_availability(
        db, hospital_id=doctor.hospital_id, doctor_id=doctor.id, date_from=from_, date_to=to
    )


# ----------------------------------------------------------------------------- cost & search
@router.get("/cost-comparison", response_model=CostComparisonOut)
async def cost_comparison(
    db: DbSession,
    procedure: Annotated[str, Query(min_length=1, max_length=160)],
    country: Annotated[str, Query(min_length=2, max_length=2)] = "US",
    currency: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
) -> Any:
    async def produce() -> Any:
        result = await service.cost_comparison(db, procedure=procedure, country=country, currency=currency)
        return result.model_dump(mode="json")

    return await service.cached(
        cache_key("cost", procedure=procedure, country=country, currency=currency), produce
    )


@router.get("/search", response_model=SearchResults)
async def search(db: DbSession, q: Annotated[str, Query(max_length=100)] = "") -> Any:
    if len(q.strip()) < 2:
        return SearchResults()

    async def produce() -> Any:
        return (await service.search(db, q)).model_dump(mode="json")

    return await service.cached(cache_key("search", q=" ".join(q.split())), produce)


# ----------------------------------------------------------------------------- content
@router.get("/content/cultural-tips", response_model=list[CulturalTipOut])
async def cultural_tips(db: DbSession, category: Annotated[str | None, Query(max_length=60)] = None) -> Any:
    async def produce() -> Any:
        return [t.model_dump(mode="json") for t in await service.cultural_tips(db, category)]

    return await service.cached(cache_key("tips", category=category), produce)


@router.get("/content/helplines", response_model=dict[str, str])
async def helplines(db: DbSession) -> Any:
    return await service.helplines(db)


@router.get("/content/medical-councils", response_model=list[MedicalCouncilOut])
async def medical_councils() -> Any:
    """Known registration councils (NMC + State Medical Councils) for doctor registration fields."""
    return service.medical_councils()


@router.get("/content/fx-rates", response_model=list[FxRateOut])
async def fx_rates(db: DbSession) -> Any:
    async def produce() -> Any:
        return [r.model_dump(mode="json") for r in await service.fx_rates(db)]

    return await service.cached("catalog:fx-rates", produce)


@router.get("/content/symptoms", response_model=list[SymptomOut])
async def symptoms(
    specialty: Annotated[str | None, Query(max_length=60)] = None,
    body_area: Annotated[str | None, Query(max_length=30)] = None,
) -> Any:
    return filter_symptoms(specialty, body_area)


# ----------------------------------------------------------------------------- providers
@router.get("/accommodations", response_model=list[AccommodationProviderOut])
async def accommodations(db: DbSession, city: ShortStr = None, hospital_id: uuid.UUID | None = None) -> Any:
    async def produce() -> Any:
        rows = await service.accommodations(db, city=city, hospital_id=hospital_id)
        return [r.model_dump(mode="json") for r in rows]

    return await service.cached(cache_key("accommodations", city=city, hospital_id=hospital_id), produce)


@router.get("/service-providers", response_model=list[ServiceProviderOut])
async def service_providers(
    db: DbSession,
    kind: ServiceKind | None = None,
    city: ShortStr = None,
    language: Annotated[str | None, Query(max_length=40)] = None,
) -> Any:
    async def produce() -> Any:
        rows = await service.service_providers(db, kind=kind, city=city, language=language)
        return [r.model_dump(mode="json") for r in rows]

    return await service.cached(cache_key("services", kind=kind, city=city, language=language), produce)


# ----------------------------------------------------------------------------- staff reports (not cached)
router.include_router(admin_router)
