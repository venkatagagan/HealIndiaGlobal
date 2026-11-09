"""HTTP routes: cases, quotes, bookings, checklist, itinerary, consultations (PLAN 8.7).

Route paths are written in full in each decorator; the router itself has no prefix.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.deps import STAFF_ROLES, CurrentUser, DbSession, PageParams, require_full_account, require_roles
from app.core.enums import BookingStatus, CaseStatus, ConsultationStatus, Urgency, UserRole
from app.core.pagination import Page, paginate
from app.core.rate_limit import rate_limit
from app.models import Consultation, User
from app.modules.cases import bookings as booking_service
from app.modules.cases import consultations as consultation_service
from app.modules.cases import emergency as emergency_service
from app.modules.cases import policies, serializers
from app.modules.cases import service as case_service
from app.modules.cases.display import DisplayCurrency, with_display
from app.modules.cases.schemas import (
    AssignCoordinator,
    BookingAdmit,
    BookingCancel,
    BookingCancelOut,
    BookingComplete,
    BookingCreate,
    BookingOut,
    CaseCreate,
    CaseDetail,
    CaseOut,
    CaseStatusChange,
    CaseStatusCounts,
    ChecklistItemOut,
    ChecklistItemUpdate,
    ConsultationCreate,
    ConsultationOut,
    ConsultationUpdate,
    EmergencyAck,
    ItineraryItemCreate,
    ItineraryItemOut,
    ItineraryItemUpdate,
    QuoteCreate,
    QuoteOut,
    QuoteReject,
)

router = APIRouter(tags=["cases"])

PatientSide = Annotated[User, Depends(require_roles(UserRole.PATIENT, UserRole.AGENT))]
PatientSideHospitalOrStaff = Annotated[
    User, Depends(require_roles(UserRole.PATIENT, UserRole.AGENT, UserRole.HOSPITAL, *STAFF_ROLES))
]
HospitalOrOps = Annotated[
    User, Depends(require_roles(UserRole.HOSPITAL, UserRole.ADMIN, UserRole.SUPPORT, UserRole.SUPER_ADMIN))
]
Staff = Annotated[User, Depends(require_roles(*STAFF_ROLES))]


# --------------------------------------------------------------------------------------------- cases
@router.post(
    "/cases",
    status_code=status.HTTP_201_CREATED,
    response_model=CaseOut,
    # SEC-018: each new case notifies the hospital's members
    dependencies=[Depends(require_full_account), Depends(rate_limit("cases.create", 10, 3600, key="user"))],
)
async def create_case(body: CaseCreate, request: Request, db: DbSession, user: PatientSide) -> CaseOut:
    case = await case_service.create_case(db, user, body, request)
    return await serializers.case_out_one(db, case)


@dataclass(frozen=True, slots=True)
class CaseListFilters:
    """Query filters of ``GET /cases`` and ``GET /cases/status-counts``. ``status`` and ``urgency`` may be
    repeated (``?status=quoted&status=booked``); date bounds are inclusive IST calendar dates."""

    status: list[CaseStatus] | None
    hospital_id: uuid.UUID | None
    patient_id: uuid.UUID | None
    agent_id: uuid.UUID | None
    coordinator_id: uuid.UUID | None
    unassigned: bool
    urgency: list[Urgency] | None
    created_from: date | None
    created_to: date | None
    updated_from: date | None
    updated_to: date | None
    q: str | None
    specialty_id: list[uuid.UUID] | None
    procedure_id: list[uuid.UUID] | None
    doctor_id: list[uuid.UUID] | None

    def as_kwargs(self) -> dict[str, Any]:
        return {f: getattr(self, f) for f in self.__slots__}


def case_list_filters(
    status_: Annotated[list[CaseStatus] | None, Query(alias="status")] = None,
    hospital_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
    coordinator_id: uuid.UUID | None = None,
    unassigned: Annotated[bool, Query(description="Only cases without a coordinator")] = False,
    urgency: Annotated[list[Urgency] | None, Query(description="Screening urgency (repeatable)")] = None,
    created_from: date | None = None,
    created_to: date | None = None,
    updated_from: date | None = None,
    updated_to: date | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    specialty_id: Annotated[list[uuid.UUID] | None, Query(description="Repeatable")] = None,
    procedure_id: Annotated[list[uuid.UUID] | None, Query(description="Repeatable")] = None,
    doctor_id: Annotated[list[uuid.UUID] | None, Query(description="Repeatable")] = None,
) -> CaseListFilters:
    return CaseListFilters(
        status=status_ or None,
        hospital_id=hospital_id,
        patient_id=patient_id,
        agent_id=agent_id,
        coordinator_id=coordinator_id,
        unassigned=unassigned,
        urgency=urgency or None,
        created_from=created_from,
        created_to=created_to,
        updated_from=updated_from,
        updated_to=updated_to,
        q=q,
        specialty_id=specialty_id or None,
        procedure_id=procedure_id or None,
        doctor_id=doctor_id or None,
    )


CaseFilters = Annotated[CaseListFilters, Depends(case_list_filters)]


@router.get("/cases", response_model=Page[CaseOut])
async def list_cases(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: CaseFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=case_service.CASE_SORT_PATTERN,
            description="created_at | updated_at | case_number | status; prefix '-' for descending",
        ),
    ] = None,
    currency: DisplayCurrency = None,
) -> Any:
    stmt = case_service.list_cases_stmt(user, sort=sort, **filters.as_kwargs())
    page = await paginate(db, stmt, params, transform=lambda rows: serializers.case_outs(db, rows))
    return await with_display(db, page, user, currency)


@router.get("/cases/status-counts", response_model=CaseStatusCounts)
async def case_status_counts(db: DbSession, user: CurrentUser, filters: CaseFilters) -> CaseStatusCounts:
    """Visible cases per status for the same filters as ``GET /cases`` (``status`` itself is ignored)."""
    counts = await case_service.case_status_counts(db, user, **filters.as_kwargs())
    return CaseStatusCounts(counts=counts, total=sum(counts.values()))


@router.get("/cases/{case_id}", response_model=CaseDetail)
async def get_case(
    case_id: uuid.UUID, db: DbSession, user: CurrentUser, currency: DisplayCurrency = None
) -> Any:
    case = await policies.get_case_for_user(db, case_id, user)
    return await with_display(db, await serializers.case_detail(db, case), user, currency)


@router.post("/cases/{case_id}/status", response_model=CaseOut)
async def change_case_status(
    case_id: uuid.UUID, body: CaseStatusChange, request: Request, db: DbSession, user: CurrentUser
) -> CaseOut:
    case = await case_service.change_case_status(db, user, case_id, body, request)
    return await serializers.case_out_one(db, case)


@router.post("/cases/{case_id}/emergency-ack", response_model=CaseOut)
async def acknowledge_emergency(
    case_id: uuid.UUID, body: EmergencyAck, request: Request, db: DbSession, user: PatientSide
) -> CaseOut:
    """The patient (or their agent) confirms they read the emergency guidance; unblocks booking."""
    case = await emergency_service.acknowledge_emergency(db, user, case_id, request)
    return await serializers.case_out_one(db, case)


@router.post("/cases/{case_id}/assign-coordinator", response_model=CaseOut)
async def assign_coordinator(
    case_id: uuid.UUID, body: AssignCoordinator, request: Request, db: DbSession, user: Staff
) -> CaseOut:
    case = await case_service.assign_coordinator(db, user, case_id, body, request)
    return await serializers.case_out_one(db, case)


# --------------------------------------------------------------------------------------------- quotes
@router.post("/cases/{case_id}/quotes", status_code=status.HTTP_201_CREATED, response_model=QuoteOut)
async def send_quote(
    case_id: uuid.UUID, body: QuoteCreate, request: Request, db: DbSession, user: HospitalOrOps
) -> QuoteOut:
    quote = await case_service.send_quote(db, user, case_id, body, request)
    return (await serializers.quote_outs(db, [quote]))[0]


@router.post(
    "/cases/{case_id}/quotes/{quote_id}/accept",
    response_model=QuoteOut,
    dependencies=[Depends(require_full_account)],
)
async def accept_quote(
    case_id: uuid.UUID, quote_id: uuid.UUID, request: Request, db: DbSession, user: PatientSide
) -> QuoteOut:
    quote = await case_service.accept_quote(db, user, case_id, quote_id, request)
    return (await serializers.quote_outs(db, [quote]))[0]


@router.post("/cases/{case_id}/quotes/{quote_id}/reject", response_model=QuoteOut)
async def reject_quote(
    case_id: uuid.UUID,
    quote_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: PatientSide,
    body: QuoteReject | None = None,
) -> QuoteOut:
    reason = body.reason if body is not None else None
    quote = await case_service.reject_quote(db, user, case_id, quote_id, reason, request)
    return (await serializers.quote_outs(db, [quote]))[0]


# --------------------------------------------------------------------------------------------- bookings
@router.post(
    "/bookings",
    status_code=status.HTTP_201_CREATED,
    response_model=BookingOut,
    # SEC-018: per-user limit (and at most MAX_UNPAID_BOOKINGS_PER_PATIENT unpaid bookings)
    dependencies=[
        Depends(require_full_account),
        Depends(rate_limit("bookings.create", 10, 3600, key="user")),
    ],
)
async def create_booking(
    body: BookingCreate, request: Request, db: DbSession, user: PatientSide
) -> BookingOut:
    booking = await booking_service.create_booking(db, user, body, request)
    return await serializers.booking_out_one(db, booking)


BookingPaymentState = Literal["paid", "partial", "unpaid"]


def booking_list_filters(
    status_: Annotated[
        list[BookingStatus] | None, Query(alias="status", description="Booking status (repeatable)")
    ] = None,
    case_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100, description="Booking number or patient name")] = None,
    payment: Annotated[
        list[BookingPaymentState] | None,
        Query(description="paid (nothing due) | partial | unpaid (repeatable)"),
    ] = None,
    admission_from: date | None = None,
    admission_to: date | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    min_total: Annotated[int | None, Query(ge=0, description="Total in minor units")] = None,
    max_total: Annotated[int | None, Query(ge=0, description="Total in minor units")] = None,
) -> dict[str, Any]:
    """Query filters of ``GET /bookings`` and ``GET /bookings/status-counts``."""
    return {
        "status": status_ or None,
        "case_id": case_id,
        "hospital_id": hospital_id,
        "patient_id": patient_id,
        "q": q,
        "payment": payment or None,
        "admission_from": admission_from,
        "admission_to": admission_to,
        "created_from": created_from,
        "created_to": created_to,
        "min_total": min_total,
        "max_total": max_total,
    }


BookingFilters = Annotated[dict[str, Any], Depends(booking_list_filters)]


@router.get("/bookings", response_model=Page[BookingOut])
async def list_bookings(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    filters: BookingFilters,
    sort: Annotated[
        str | None,
        Query(
            pattern=booking_service.BOOKING_SORT_PATTERN,
            description="created_at | admission_date | booking_number | total_minor | status; '-' = desc",
        ),
    ] = None,
    currency: DisplayCurrency = None,
) -> Any:
    stmt = booking_service.list_bookings_stmt(user, sort=sort, **filters)
    page = await paginate(db, stmt, params, transform=lambda rows: serializers.booking_outs(db, rows))
    return await with_display(db, page, user, currency)


@router.get("/bookings/status-counts", response_model=CaseStatusCounts)
async def booking_status_counts(
    db: DbSession, user: CurrentUser, filters: BookingFilters
) -> CaseStatusCounts:
    """Visible bookings per status for the same filters as ``GET /bookings`` (``status`` is ignored)."""
    counts = await booking_service.booking_status_counts(db, user, **filters)
    return CaseStatusCounts(counts=counts, total=sum(counts.values()))


@router.get("/bookings/{booking_id}", response_model=BookingOut)
async def get_booking(
    booking_id: uuid.UUID, db: DbSession, user: CurrentUser, currency: DisplayCurrency = None
) -> Any:
    booking = await booking_service.get_booking_for_user(db, booking_id, user)
    return await with_display(db, await serializers.booking_out_one(db, booking), user, currency)


@router.post("/bookings/{booking_id}/cancel", response_model=BookingCancelOut)
async def cancel_booking(
    booking_id: uuid.UUID,
    body: BookingCancel,
    request: Request,
    db: DbSession,
    user: PatientSideHospitalOrStaff,
) -> BookingCancelOut:
    booking, refundable, pct = await booking_service.cancel_booking(
        db, user, booking_id, body.reason, request, initiated_by=body.initiated_by
    )
    out = await serializers.booking_out_one(db, booking)
    return BookingCancelOut(**out.model_dump(), refundable_minor=refundable, refund_pct=pct)


@router.post("/bookings/{booking_id}/admit", response_model=BookingOut)
async def admit_booking(
    booking_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: HospitalOrOps,
    body: BookingAdmit | None = None,
) -> BookingOut:
    booking = await booking_service.admit_booking(db, user, booking_id, body or BookingAdmit(), request)
    return await serializers.booking_out_one(db, booking)


@router.post("/bookings/{booking_id}/complete", response_model=BookingOut)
async def complete_booking(
    booking_id: uuid.UUID,
    request: Request,
    db: DbSession,
    user: HospitalOrOps,
    body: BookingComplete | None = None,
) -> BookingOut:
    booking = await booking_service.complete_booking(db, user, booking_id, body or BookingComplete(), request)
    return await serializers.booking_out_one(db, booking)


# --------------------------------------------------------------------------------------------- checklist
@router.get("/bookings/{booking_id}/checklist", response_model=list[ChecklistItemOut])
async def get_checklist(booking_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[ChecklistItemOut]:
    items = await booking_service.list_checklist(db, user, booking_id)
    return [ChecklistItemOut.model_validate(i) for i in items]


@router.patch("/bookings/{booking_id}/checklist/{item_id}", response_model=ChecklistItemOut)
async def update_checklist_item(
    booking_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ChecklistItemUpdate,
    request: Request,
    db: DbSession,
    user: CurrentUser,
) -> ChecklistItemOut:
    item = await booking_service.update_checklist_item(db, user, booking_id, item_id, body, request)
    return ChecklistItemOut.model_validate(item)


# --------------------------------------------------------------------------------------------- itinerary
@router.get("/bookings/{booking_id}/itinerary", response_model=list[ItineraryItemOut])
async def get_itinerary(booking_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[ItineraryItemOut]:
    items = await booking_service.list_itinerary(db, user, booking_id)
    return [ItineraryItemOut.model_validate(i) for i in items]


@router.post(
    "/bookings/{booking_id}/itinerary", status_code=status.HTTP_201_CREATED, response_model=ItineraryItemOut
)
async def create_itinerary_item(
    booking_id: uuid.UUID, body: ItineraryItemCreate, request: Request, db: DbSession, user: HospitalOrOps
) -> ItineraryItemOut:
    item = await booking_service.create_itinerary_item(db, user, booking_id, body, request)
    return ItineraryItemOut.model_validate(item)


@router.patch("/bookings/{booking_id}/itinerary/{item_id}", response_model=ItineraryItemOut)
async def update_itinerary_item(
    booking_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ItineraryItemUpdate,
    request: Request,
    db: DbSession,
    user: HospitalOrOps,
) -> ItineraryItemOut:
    item = await booking_service.update_itinerary_item(db, user, booking_id, item_id, body, request)
    return ItineraryItemOut.model_validate(item)


@router.delete("/bookings/{booking_id}/itinerary/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_itinerary_item(
    booking_id: uuid.UUID, item_id: uuid.UUID, request: Request, db: DbSession, user: HospitalOrOps
) -> Response:
    await booking_service.delete_itinerary_item(db, user, booking_id, item_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------------------------- consultations
@router.post(
    "/consultations",
    status_code=status.HTTP_201_CREATED,
    response_model=ConsultationOut,
    dependencies=[Depends(rate_limit("consultations.create", 10, 3600, key="user"))],  # SEC-018
)
async def create_consultation(
    body: ConsultationCreate, request: Request, db: DbSession, user: PatientSide
) -> ConsultationOut:
    item = await consultation_service.create_consultation(db, user, body, request)
    return (await serializers.consultation_outs(db, [item]))[0]


@router.get("/consultations", response_model=Page[ConsultationOut])
async def list_consultations(
    db: DbSession,
    user: CurrentUser,
    params: PageParams,
    status_: Annotated[ConsultationStatus | None, Query(alias="status")] = None,
    case_id: uuid.UUID | None = None,
    doctor_id: uuid.UUID | None = None,
) -> Page[ConsultationOut]:
    stmt = consultation_service.scoped_consultations(user)
    if status_ is not None:
        stmt = stmt.where(Consultation.status == status_)
    if case_id is not None:
        stmt = stmt.where(Consultation.case_id == case_id)
    if doctor_id is not None:
        stmt = stmt.where(Consultation.doctor_id == doctor_id)
    stmt = stmt.order_by(
        Consultation.scheduled_at.desc().nulls_first(), Consultation.created_at.desc(), Consultation.id
    )
    return await paginate(db, stmt, params, transform=lambda rows: serializers.consultation_outs(db, rows))


@router.get("/consultations/{consultation_id}", response_model=ConsultationOut)
async def get_consultation(consultation_id: uuid.UUID, db: DbSession, user: CurrentUser) -> ConsultationOut:
    item = await consultation_service.get_consultation_for_user(db, consultation_id, user)
    return (await serializers.consultation_outs(db, [item]))[0]


@router.patch("/consultations/{consultation_id}", response_model=ConsultationOut)
async def update_consultation(
    consultation_id: uuid.UUID, body: ConsultationUpdate, request: Request, db: DbSession, user: CurrentUser
) -> ConsultationOut:
    item = await consultation_service.update_consultation(db, user, consultation_id, body, request)
    return (await serializers.consultation_outs(db, [item]))[0]
