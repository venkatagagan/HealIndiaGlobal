"""HTTP routes for the travel desk (PLAN 8.8).

Route paths are written in full in each decorator; the router itself has no prefix.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import STAFF_ROLES, CurrentUser, DbSession, PageParams, has_role, require_roles
from app.core.enums import ServiceBookingStatus, ServiceKind, SosStatus, TravelKind, UserRole, VisaStatus
from app.core.errors import Forbidden, NotFound
from app.core.pagination import Page, paginate
from app.core.rate_limit import rate_limit
from app.models import AccommodationBooking, ServiceBooking, SosAlert, TravelBooking, User, VisaRequest
from app.modules.cases import policies
from app.modules.travel import listing, serializers
from app.modules.travel import service as travel_service
from app.modules.travel.listing import TravelResource
from app.modules.travel.schemas import (
    AccommodationBookingCreate,
    AccommodationBookingOut,
    AccommodationBookingUpdate,
    ServiceBookingCreate,
    ServiceBookingOut,
    ServiceBookingUpdate,
    SosCreate,
    SosOut,
    SosUpdate,
    TravelBookingCreate,
    TravelBookingOut,
    TravelBookingUpdate,
    TravelStatusCounts,
    VisaRequestCreate,
    VisaRequestOut,
    VisaRequestUpdate,
)

router = APIRouter(tags=["travel"])

Staff = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
PatientSide = Annotated[User, Depends(require_roles(UserRole.PATIENT, UserRole.AGENT))]


def travel_list_filters(
    q: Annotated[str | None, Query(max_length=100, description="Patient name")] = None,
    date_from: Annotated[
        date | None, Query(alias="from", description="Inclusive IST day of the key date")
    ] = None,
    date_to: Annotated[
        date | None, Query(alias="to", description="Inclusive IST day of the key date")
    ] = None,
) -> dict[str, Any]:
    """Common filters of the travel-desk lists. The key date is: visa requested, travel departure,
    accommodation check-in, service start, SOS raised."""
    return {"q": q, "date_from": date_from, "date_to": date_to}


TravelFilters = Annotated[dict[str, Any], Depends(travel_list_filters)]


def _check_sos_reader(user: User) -> None:
    if not (policies.is_patient(user) or policies.is_agent(user) or has_role(user, *STAFF_ROLES)):
        raise Forbidden("You do not have permission to view SOS alerts")


@router.get("/travel/status-counts", response_model=TravelStatusCounts)
async def travel_status_counts(
    db: DbSession,
    user: CurrentUser,
    filters: TravelFilters,
    resource: TravelResource,
    kind: Annotated[list[str] | None, Query(description="travel / services only (repeatable)")] = None,
) -> TravelStatusCounts:
    """Rows per status of one travel-desk list for the same filters (``status`` is not a filter here)."""
    if resource is TravelResource.SOS:
        _check_sos_reader(user)
    counts = await listing.status_counts(db, user, resource, kind=kind or None, **filters)
    return TravelStatusCounts(counts=counts, total=sum(counts.values()))


# --------------------------------------------------------------------------------------------- visas
@router.get("/travel/visa-requests", response_model=Page[VisaRequestOut])
async def list_visa_requests(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: TravelFilters,
    case_id: uuid.UUID | None = None,
    status_: Annotated[list[VisaStatus] | None, Query(alias="status", description="Repeatable")] = None,
) -> Page[VisaRequestOut]:
    stmt = travel_service.scoped_visas(user)
    if case_id is not None:
        stmt = stmt.where(VisaRequest.case_id == case_id)
    stmt = listing.apply_filters(stmt, TravelResource.VISA, status=status_, **filters)
    stmt = stmt.order_by(VisaRequest.created_at.desc(), VisaRequest.id.desc())
    return await paginate(db, stmt, params, transform=lambda rows: serializers.visa_outs(db, rows))


@router.post("/travel/visa-requests", status_code=status.HTTP_201_CREATED, response_model=VisaRequestOut)
async def create_visa_request(
    body: VisaRequestCreate, request: Request, db: DbSession, user: CurrentUser
) -> VisaRequestOut:
    visa = await travel_service.create_visa_request(db, user, body, request)
    return (await serializers.visa_outs(db, [visa]))[0]


@router.get("/travel/visa-requests/{visa_id}", response_model=VisaRequestOut)
async def get_visa_request(visa_id: uuid.UUID, db: DbSession, user: CurrentUser) -> VisaRequestOut:
    visa = await _one(db, travel_service.scoped_visas(user).where(VisaRequest.id == visa_id), "Visa request")
    return (await serializers.visa_outs(db, [visa]))[0]


@router.patch("/travel/visa-requests/{visa_id}", response_model=VisaRequestOut)
async def update_visa_request(
    visa_id: uuid.UUID, body: VisaRequestUpdate, request: Request, db: DbSession, user: CurrentUser
) -> VisaRequestOut:
    visa = await travel_service.update_visa_request(db, user, visa_id, body, request)
    return (await serializers.visa_outs(db, [visa]))[0]


# ------------------------------------------------------------------------------------------- travel bookings
@router.get("/travel/travel-bookings", response_model=Page[TravelBookingOut])
async def list_travel_bookings(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: TravelFilters,
    case_id: uuid.UUID | None = None,
    kind: Annotated[list[TravelKind] | None, Query(description="Repeatable")] = None,
    status_: Annotated[
        list[ServiceBookingStatus] | None, Query(alias="status", description="Repeatable")
    ] = None,
) -> Page[TravelBookingOut]:
    stmt = travel_service.scoped_travel(user)
    if case_id is not None:
        stmt = stmt.where(TravelBooking.case_id == case_id)
    stmt = listing.apply_filters(stmt, TravelResource.TRAVEL, status=status_, kind=kind, **filters)
    stmt = stmt.order_by(
        TravelBooking.depart_at.asc().nulls_last(), TravelBooking.created_at.desc(), TravelBooking.id
    )
    return await paginate(db, stmt, params, transform=lambda rows: serializers.travel_outs(db, rows))


@router.post("/travel/travel-bookings", status_code=status.HTTP_201_CREATED, response_model=TravelBookingOut)
async def create_travel_booking(
    body: TravelBookingCreate, request: Request, db: DbSession, user: CurrentUser
) -> TravelBookingOut:
    item = await travel_service.create_travel_booking(db, user, body, request)
    return (await serializers.travel_outs(db, [item]))[0]


@router.get("/travel/travel-bookings/{item_id}", response_model=TravelBookingOut)
async def get_travel_booking(item_id: uuid.UUID, db: DbSession, user: CurrentUser) -> TravelBookingOut:
    item = await _one(
        db, travel_service.scoped_travel(user).where(TravelBooking.id == item_id), "Travel booking"
    )
    return (await serializers.travel_outs(db, [item]))[0]


@router.patch("/travel/travel-bookings/{item_id}", response_model=TravelBookingOut)
async def update_travel_booking(
    item_id: uuid.UUID, body: TravelBookingUpdate, request: Request, db: DbSession, user: CurrentUser
) -> TravelBookingOut:
    item = await travel_service.update_travel_booking(db, user, item_id, body, request)
    return (await serializers.travel_outs(db, [item]))[0]


# --------------------------------------------------------------------------------------------- accommodation
@router.get("/travel/accommodation-bookings", response_model=Page[AccommodationBookingOut])
async def list_accommodation_bookings(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: TravelFilters,
    case_id: uuid.UUID | None = None,
    status_: Annotated[
        list[ServiceBookingStatus] | None, Query(alias="status", description="Repeatable")
    ] = None,
) -> Page[AccommodationBookingOut]:
    stmt = travel_service.scoped_accommodation(user)
    if case_id is not None:
        stmt = stmt.where(AccommodationBooking.case_id == case_id)
    stmt = listing.apply_filters(stmt, TravelResource.ACCOMMODATION, status=status_, **filters)
    stmt = stmt.order_by(AccommodationBooking.check_in.desc(), AccommodationBooking.id)
    return await paginate(db, stmt, params, transform=lambda rows: serializers.accommodation_outs(db, rows))


@router.post(
    "/travel/accommodation-bookings",
    status_code=status.HTTP_201_CREATED,
    response_model=AccommodationBookingOut,
)
async def create_accommodation_booking(
    body: AccommodationBookingCreate, request: Request, db: DbSession, user: CurrentUser
) -> AccommodationBookingOut:
    item = await travel_service.create_accommodation_booking(db, user, body, request)
    return (await serializers.accommodation_outs(db, [item]))[0]


@router.get("/travel/accommodation-bookings/{item_id}", response_model=AccommodationBookingOut)
async def get_accommodation_booking(
    item_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> AccommodationBookingOut:
    item = await _one(
        db,
        travel_service.scoped_accommodation(user).where(AccommodationBooking.id == item_id),
        "Accommodation booking",
    )
    return (await serializers.accommodation_outs(db, [item]))[0]


@router.patch("/travel/accommodation-bookings/{item_id}", response_model=AccommodationBookingOut)
async def update_accommodation_booking(
    item_id: uuid.UUID, body: AccommodationBookingUpdate, request: Request, db: DbSession, user: CurrentUser
) -> AccommodationBookingOut:
    item = await travel_service.update_accommodation_booking(db, user, item_id, body, request)
    return (await serializers.accommodation_outs(db, [item]))[0]


# --------------------------------------------------------------------------------------------- services
@router.get("/travel/service-bookings", response_model=Page[ServiceBookingOut])
async def list_service_bookings(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: TravelFilters,
    case_id: uuid.UUID | None = None,
    kind: Annotated[list[ServiceKind] | None, Query(description="Repeatable")] = None,
    status_: Annotated[
        list[ServiceBookingStatus] | None, Query(alias="status", description="Repeatable")
    ] = None,
) -> Page[ServiceBookingOut]:
    stmt = travel_service.scoped_services(user)
    if case_id is not None:
        stmt = stmt.where(ServiceBooking.case_id == case_id)
    stmt = listing.apply_filters(stmt, TravelResource.SERVICES, status=status_, kind=kind, **filters)
    stmt = stmt.order_by(ServiceBooking.created_at.desc(), ServiceBooking.id.desc())
    return await paginate(db, stmt, params, transform=lambda rows: serializers.service_outs(db, rows))


@router.post(
    "/travel/service-bookings", status_code=status.HTTP_201_CREATED, response_model=ServiceBookingOut
)
async def create_service_booking(
    body: ServiceBookingCreate, request: Request, db: DbSession, user: CurrentUser
) -> ServiceBookingOut:
    item = await travel_service.create_service_booking(db, user, body, request)
    return (await serializers.service_outs(db, [item]))[0]


@router.get("/travel/service-bookings/{item_id}", response_model=ServiceBookingOut)
async def get_service_booking(item_id: uuid.UUID, db: DbSession, user: CurrentUser) -> ServiceBookingOut:
    item = await _one(
        db, travel_service.scoped_services(user).where(ServiceBooking.id == item_id), "Service booking"
    )
    return (await serializers.service_outs(db, [item]))[0]


@router.patch("/travel/service-bookings/{item_id}", response_model=ServiceBookingOut)
async def update_service_booking(
    item_id: uuid.UUID, body: ServiceBookingUpdate, request: Request, db: DbSession, user: CurrentUser
) -> ServiceBookingOut:
    item = await travel_service.update_service_booking(db, user, item_id, body, request)
    return (await serializers.service_outs(db, [item]))[0]


# --------------------------------------------------------------------------------------------- SOS
@router.post(
    "/travel/sos",
    status_code=status.HTTP_201_CREATED,
    response_model=SosOut,
    dependencies=[Depends(rate_limit("travel.sos", 10, 60, key="user"))],
)
async def create_sos(body: SosCreate, request: Request, db: DbSession, user: PatientSide) -> SosOut:
    alert = await travel_service.create_sos(db, user, body, request)
    return (await serializers.sos_outs(db, [alert]))[0]


@router.get("/travel/sos", response_model=Page[SosOut])
async def list_sos(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: TravelFilters,
    status_: Annotated[list[SosStatus] | None, Query(alias="status", description="Repeatable")] = None,
    case_id: uuid.UUID | None = None,
) -> Page[SosOut]:
    _check_sos_reader(user)
    stmt = listing.apply_filters(
        travel_service.scoped_sos(user), TravelResource.SOS, status=status_, **filters
    )
    if case_id is not None:
        stmt = stmt.where(SosAlert.case_id == case_id)
    stmt = stmt.order_by(SosAlert.created_at.desc(), SosAlert.id.desc())
    return await paginate(db, stmt, params, transform=lambda rows: serializers.sos_outs(db, rows))


@router.patch("/travel/sos/{sos_id}", response_model=SosOut)
async def update_sos(
    sos_id: uuid.UUID, body: SosUpdate, request: Request, db: DbSession, user: Staff
) -> SosOut:
    alert = await travel_service.update_sos(db, user, sos_id, body, request)
    return (await serializers.sos_outs(db, [alert]))[0]


# --------------------------------------------------------------------------------------------- helpers
async def _one(db: AsyncSession, stmt: Select[Any], label: str) -> Any:
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None:
        raise NotFound(f"{label} not found")
    return item
