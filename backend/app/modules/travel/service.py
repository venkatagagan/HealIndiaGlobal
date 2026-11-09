"""Travel desk: visa requests, travel/accommodation/service bookings and SOS alerts (PLAN 8.8).

Patients (or their agents) create requests (``requested``); the hospital team or operations staff quote,
confirm and complete them. Status changes keep the pre-arrival checklist in sync (see
``app.modules.cases.checklist``). Every state change is audited.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import realtime
from app.core.audit import audit_log
from app.core.enums import (
    CaseStatus,
    ChecklistKey,
    DocumentKind,
    ServiceBookingStatus,
    ServiceKind,
    SosStatus,
    TravelKind,
    UserRole,
    UserStatus,
    VisaStatus,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.models import (
    AccommodationBooking,
    AccommodationProvider,
    Case,
    Document,
    PatientProfile,
    ServiceBooking,
    ServiceProvider,
    SosAlert,
    TravelBooking,
    User,
    VisaRequest,
)
from app.modules.cases import policies
from app.modules.cases.checklist import sync_checklist_key
from app.modules.cases.common import queue_case_push, utcnow
from app.modules.travel.schemas import (
    AccommodationBookingCreate,
    AccommodationBookingUpdate,
    ServiceBookingCreate,
    ServiceBookingUpdate,
    SosCreate,
    SosUpdate,
    TravelBookingCreate,
    TravelBookingUpdate,
    VisaRequestCreate,
    VisaRequestUpdate,
)

logger = structlog.get_logger(__name__)

# Cases that can no longer get travel arrangements.
_TRAVEL_BLOCKED_CASE_STATUSES = frozenset({CaseStatus.CANCELLED, CaseStatus.DECLINED})

VISA_TRANSITIONS: dict[VisaStatus, frozenset[VisaStatus]] = {
    VisaStatus.NOT_STARTED: frozenset(
        {VisaStatus.DOCUMENTS_PENDING, VisaStatus.INVITATION_ISSUED, VisaStatus.APPLIED}
    ),
    VisaStatus.DOCUMENTS_PENDING: frozenset({VisaStatus.INVITATION_ISSUED, VisaStatus.APPLIED}),
    VisaStatus.INVITATION_ISSUED: frozenset({VisaStatus.APPLIED, VisaStatus.DOCUMENTS_PENDING}),
    VisaStatus.APPLIED: frozenset({VisaStatus.APPROVED, VisaStatus.REJECTED}),
    VisaStatus.REJECTED: frozenset({VisaStatus.DOCUMENTS_PENDING}),
    VisaStatus.APPROVED: frozenset(),
}

SERVICE_TRANSITIONS: dict[ServiceBookingStatus, frozenset[ServiceBookingStatus]] = {
    ServiceBookingStatus.REQUESTED: frozenset(
        {ServiceBookingStatus.QUOTED, ServiceBookingStatus.CONFIRMED, ServiceBookingStatus.CANCELLED}
    ),
    ServiceBookingStatus.QUOTED: frozenset(
        {ServiceBookingStatus.QUOTED, ServiceBookingStatus.CONFIRMED, ServiceBookingStatus.CANCELLED}
    ),
    ServiceBookingStatus.CONFIRMED: frozenset(
        {ServiceBookingStatus.COMPLETED, ServiceBookingStatus.CANCELLED}
    ),
    ServiceBookingStatus.COMPLETED: frozenset(),
    ServiceBookingStatus.CANCELLED: frozenset(),
}

SOS_TRANSITIONS: dict[SosStatus, frozenset[SosStatus]] = {
    SosStatus.OPEN: frozenset({SosStatus.ACKNOWLEDGED, SosStatus.RESOLVED}),
    SosStatus.ACKNOWLEDGED: frozenset({SosStatus.RESOLVED}),
    SosStatus.RESOLVED: frozenset(),
}

_TRAVEL_CHECKLIST: dict[TravelKind, ChecklistKey] = {
    TravelKind.FLIGHT: ChecklistKey.FLIGHT_BOOKED,
    TravelKind.AIRPORT_PICKUP: ChecklistKey.AIRPORT_PICKUP,
}

# Fields patients/agents may edit on their own requests while still ``requested``.
_PATIENT_TRAVEL_FIELDS = frozenset(
    {"from_location", "to_location", "depart_at", "arrive_at", "passengers", "details", "notes"}
)
_PATIENT_ACCOMMODATION_FIELDS = frozenset({"check_in", "check_out", "guests", "room_type", "notes"})
_PATIENT_SERVICE_FIELDS = frozenset({"starts_at", "ends_at", "notes", "provider_id"})


# --------------------------------------------------------------------------------------------- helpers
def _value(v: Any) -> str:
    return str(getattr(v, "value", v))


async def _publish_status_change(
    db: AsyncSession,
    case: Case,
    item_type: str,
    item: Any,
    from_status: str,
    actor: User,
    kind: Any = None,
) -> None:
    """``travel.status_changed`` (CG-30) for a visa/travel/accommodation/service item whose status moved."""
    to_status = _value(item.status)
    if to_status == from_status:
        return
    await publish(
        db,
        "travel.status_changed",
        {
            "case_id": str(case.id),
            "patient_id": str(case.patient_id),
            "item_type": item_type,
            "item_id": str(item.id),
            "kind": _value(kind) if kind is not None else None,
            "from_status": from_status,
            "to_status": to_status,
            "actor_user_id": str(actor.id),
        },
    )


async def _case_for_request(db: AsyncSession, user: User, case_id: uuid.UUID) -> Case:
    """Scoped case that may receive new travel requests from the patient side or staff."""
    if not (policies.is_patient(user) or policies.is_agent(user) or policies.is_ops_staff(user)):
        raise Forbidden("Only the patient, their agent or operations staff can create travel requests")
    case = await policies.get_case_for_user(db, case_id, user)
    if case.status in _TRAVEL_BLOCKED_CASE_STATUSES:
        raise BadRequest(
            f"A {CaseStatus(case.status).value} case cannot get travel arrangements", code="invalid_state"
        )
    return case


async def _is_desk(db: AsyncSession, user: User, case: Case) -> bool:
    """Hospital team (write roles) of the case's hospital, or operations staff."""
    return await policies.can_act_for_hospital(db, user, case.hospital_id)


def _check_service_transition(current: Any, target: ServiceBookingStatus) -> None:
    cur = ServiceBookingStatus(current)
    if target == cur and cur != ServiceBookingStatus.QUOTED:
        return
    if target not in SERVICE_TRANSITIONS[cur]:
        raise BadRequest(
            f"A {cur.value} booking cannot become {target.value}",
            code="invalid_transition",
            details={"from_status": cur.value, "to_status": target.value},
        )


def _patient_side_update(changes: dict[str, Any], current: Any, allowed_fields: frozenset[str]) -> None:
    """Patients/agents may cancel open requests and edit a few fields while ``requested``."""
    status = changes.get("status")
    if status is not None and status != ServiceBookingStatus.CANCELLED:
        raise Forbidden("Only the hospital team or the travel desk can change this status")
    fields = set(changes) - {"status"}
    if fields - allowed_fields:
        raise Forbidden("These fields are managed by the travel desk")
    if fields - {"notes"} and ServiceBookingStatus(current) != ServiceBookingStatus.REQUESTED:
        raise BadRequest("Only requests that have not been quoted yet can be edited", code="invalid_state")


async def _load_scoped(db: AsyncSession, model: Any, item_id: uuid.UUID, user: User, label: str) -> Any:
    stmt = (
        select(model)
        .where(model.id == item_id, policies.case_in_scope(model.case_id, user))
        .with_for_update(of=model)
    )
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None:
        raise NotFound(f"{label} not found")
    return item


async def _get_case(db: AsyncSession, case_id: uuid.UUID) -> Case:
    return (await db.execute(select(Case).where(Case.id == case_id))).scalar_one()


async def patient_names(
    db: AsyncSession, patient_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, PatientProfile]:
    ids = set(patient_ids)
    if not ids:
        return {}
    rows = (await db.execute(select(PatientProfile).where(PatientProfile.id.in_(ids)))).scalars()
    return {p.id: p for p in rows}


async def case_numbers(db: AsyncSession, case_ids: Sequence[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    ids = {c for c in case_ids if c is not None}
    if not ids:
        return {}
    rows = (await db.execute(select(Case.id, Case.case_number).where(Case.id.in_(ids)))).all()
    return {r.id: r.case_number for r in rows}


# --------------------------------------------------------------------------------------------- visas
def scoped_visas(user: User) -> Select[Any]:
    return select(VisaRequest).where(policies.case_in_scope(VisaRequest.case_id, user))


async def create_visa_request(
    db: AsyncSession, user: User, body: VisaRequestCreate, request: Request | None = None
) -> VisaRequest:
    case = await _case_for_request(db, user, body.case_id)
    duplicate = (
        await db.execute(
            select(VisaRequest.id).where(
                VisaRequest.case_id == case.id,
                VisaRequest.visa_type == body.visa_type,
                VisaRequest.status != VisaStatus.REJECTED,
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise Conflict("A visa request of this type is already open for the case", code="visa_request_exists")
    visa = VisaRequest(
        case_id=case.id,
        patient_id=case.patient_id,
        visa_type=body.visa_type,
        status=VisaStatus.DOCUMENTS_PENDING,
        notes=body.notes,
    )
    db.add(visa)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="visa.request",
        entity_type="visa_request",
        entity_id=visa.id,
        after={"case_id": case.id, "visa_type": body.visa_type.value, "status": visa.status.value},
        request=request,
    )
    await sync_checklist_key(db, case.id, ChecklistKey.VISA_APPROVED)
    await queue_case_push(
        db, case, "travel.updated", {"case_id": str(case.id), "visa_request_id": str(visa.id)}
    )
    await db.commit()
    await db.refresh(visa)
    return visa


async def _validate_invitation_letter(db: AsyncSession, case: Case, document_id: uuid.UUID) -> None:
    doc = await db.get(Document, document_id)
    if (
        doc is None
        or doc.deleted_at is not None
        or not (
            doc.case_id == case.id or doc.hospital_id == case.hospital_id or doc.patient_id == case.patient_id
        )
    ):
        raise NotFound("Document not found")
    if doc.kind != DocumentKind.INVITATION_LETTER:
        raise BadRequest("The document must be an invitation letter", code="invalid_document_kind")


async def update_visa_request(
    db: AsyncSession, user: User, visa_id: uuid.UUID, body: VisaRequestUpdate, request: Request | None = None
) -> VisaRequest:
    visa: VisaRequest = await _load_scoped(db, VisaRequest, visa_id, user, "Visa request")
    case = await _get_case(db, visa.case_id)
    changes = body.model_dump(exclude_unset=True)
    desk = await _is_desk(db, user, case)
    if not desk:
        # The patient applies on the e-visa portal themselves: they may record the application.
        if not (policies.is_patient(user) or policies.is_agent(user)):
            raise Forbidden("Only the hospital team or the travel desk can update visa requests")
        if set(changes) - {"status", "application_reference", "notes"} or changes.get("status") not in (
            None,
            VisaStatus.APPLIED,
        ):
            raise Forbidden("Patients can only record their visa application")

    current = VisaStatus(visa.status)
    target: VisaStatus | None = changes.get("status")
    letter_id = changes.get("invitation_letter_document_id")
    if letter_id is not None:
        await _validate_invitation_letter(db, case, letter_id)
        visa.invitation_letter_document_id = letter_id
        if target is None and current in (VisaStatus.NOT_STARTED, VisaStatus.DOCUMENTS_PENDING):
            target = VisaStatus.INVITATION_ISSUED
    elif "invitation_letter_document_id" in changes:
        visa.invitation_letter_document_id = None
    if target is not None and target != current:
        if target not in VISA_TRANSITIONS[current]:
            raise BadRequest(
                f"A visa request in status {current.value} cannot become {target.value}",
                code="invalid_transition",
                details={"from_status": current.value, "to_status": target.value},
            )
        if target == VisaStatus.INVITATION_ISSUED and visa.invitation_letter_document_id is None:
            raise BadRequest("Upload the invitation letter first", code="invitation_letter_required")
        visa.status = target
        if target == VisaStatus.APPLIED:
            visa.applied_at = utcnow()
        if target in (VisaStatus.APPROVED, VisaStatus.REJECTED):
            visa.decided_at = utcnow()
    if "application_reference" in changes:
        visa.application_reference = changes["application_reference"]
    if "notes" in changes:
        visa.notes = changes["notes"]

    await audit_log(
        db,
        actor=user,
        action="visa.update",
        entity_type="visa_request",
        entity_id=visa.id,
        before={"status": current.value},
        after={"status": _value(visa.status), **{k: v for k, v in changes.items() if k != "status"}},
        request=request,
    )
    await sync_checklist_key(
        db,
        case.id,
        ChecklistKey.VISA_APPROVED,
        allow_downgrade=_value(visa.status) == VisaStatus.REJECTED.value,
    )
    await queue_case_push(
        db,
        case,
        "travel.updated",
        {"case_id": str(case.id), "visa_request_id": str(visa.id), "status": _value(visa.status)},
    )
    await _publish_status_change(db, case, "visa", visa, current.value, user, kind=visa.visa_type)
    await db.commit()
    await db.refresh(visa)
    return visa


# ------------------------------------------------------------------------------------------- travel bookings
def scoped_travel(user: User) -> Select[Any]:
    return select(TravelBooking).where(policies.case_in_scope(TravelBooking.case_id, user))


async def _sync_travel(db: AsyncSession, case_id: uuid.UUID, kind: Any, downgrade: bool) -> None:
    key = _TRAVEL_CHECKLIST.get(TravelKind(kind))
    if key is not None:
        await sync_checklist_key(db, case_id, key, allow_downgrade=downgrade)


async def create_travel_booking(
    db: AsyncSession, user: User, body: TravelBookingCreate, request: Request | None = None
) -> TravelBooking:
    case = await _case_for_request(db, user, body.case_id)
    item = TravelBooking(
        case_id=case.id,
        patient_id=case.patient_id,
        kind=body.kind,
        status=ServiceBookingStatus.REQUESTED,
        from_location=body.from_location,
        to_location=body.to_location,
        depart_at=body.depart_at,
        arrive_at=body.arrive_at,
        carrier=body.carrier,
        flight_number=body.flight_number,
        passengers=body.passengers,
        details=body.details,
        notes=body.notes,
    )
    db.add(item)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="travel_booking.request",
        entity_type="travel_booking",
        entity_id=item.id,
        after={"case_id": case.id, "kind": body.kind.value},
        request=request,
    )
    await _sync_travel(db, case.id, body.kind, downgrade=False)
    await queue_case_push(
        db, case, "travel.updated", {"case_id": str(case.id), "travel_booking_id": str(item.id)}
    )
    await db.commit()
    await db.refresh(item)
    return item


async def update_travel_booking(
    db: AsyncSession,
    user: User,
    item_id: uuid.UUID,
    body: TravelBookingUpdate,
    request: Request | None = None,
) -> TravelBooking:
    item: TravelBooking = await _load_scoped(db, TravelBooking, item_id, user, "Travel booking")
    case = await _get_case(db, item.case_id)
    changes = body.model_dump(exclude_unset=True)
    if not await _is_desk(db, user, case):
        if not (policies.is_patient(user) or policies.is_agent(user)):
            raise Forbidden("Only the hospital team or the travel desk can update travel bookings")
        _patient_side_update(changes, item.status, _PATIENT_TRAVEL_FIELDS)
    current = ServiceBookingStatus(item.status)
    target: ServiceBookingStatus | None = changes.pop("status", None)
    if not SERVICE_TRANSITIONS[current] and changes:
        raise BadRequest(f"A {current.value} booking cannot be changed", code="invalid_state")
    for key in ("passengers",):
        if key in changes and changes[key] is None:
            raise BadRequest(f"{key} cannot be null", code="invalid_field")
    if "details" in changes and changes["details"] is None:
        changes["details"] = {}
    for key, value in changes.items():
        setattr(item, key, value)
    if item.depart_at and item.arrive_at and item.arrive_at < item.depart_at:
        raise BadRequest("arrive_at must not be before depart_at", code="invalid_times")
    if target is not None:
        _check_service_transition(current, target)
        if target == ServiceBookingStatus.QUOTED and item.price_minor is None:
            raise BadRequest("Set price_minor to quote this booking", code="price_required")
        item.status = target
    await audit_log(
        db,
        actor=user,
        action="travel_booking.update",
        entity_type="travel_booking",
        entity_id=item.id,
        before={"status": current.value},
        after={"status": _value(item.status), **changes},
        request=request,
    )
    await _sync_travel(db, case.id, item.kind, downgrade=target == ServiceBookingStatus.CANCELLED)
    await queue_case_push(
        db,
        case,
        "travel.updated",
        {"case_id": str(case.id), "travel_booking_id": str(item.id), "status": _value(item.status)},
    )
    await _publish_status_change(db, case, "travel", item, current.value, user, kind=item.kind)
    await db.commit()
    await db.refresh(item)
    return item


# --------------------------------------------------------------------------------------------- accommodation
def scoped_accommodation(user: User) -> Select[Any]:
    return select(AccommodationBooking).where(policies.case_in_scope(AccommodationBooking.case_id, user))


def _recompute_total(item: AccommodationBooking) -> None:
    nights = (item.check_out - item.check_in).days
    item.total_minor = item.nightly_rate_minor * nights if item.nightly_rate_minor is not None else None


async def create_accommodation_booking(
    db: AsyncSession, user: User, body: AccommodationBookingCreate, request: Request | None = None
) -> AccommodationBooking:
    case = await _case_for_request(db, user, body.case_id)
    provider = await db.get(AccommodationProvider, body.provider_id)
    if provider is None or not provider.is_active:
        raise NotFound("Accommodation provider not found")
    item = AccommodationBooking(
        case_id=case.id,
        patient_id=case.patient_id,
        provider_id=provider.id,
        check_in=body.check_in,
        check_out=body.check_out,
        guests=body.guests,
        room_type=body.room_type,
        nightly_rate_minor=provider.nightly_rate_minor,
        currency=provider.currency,
        status=ServiceBookingStatus.REQUESTED,
        notes=body.notes,
    )
    _recompute_total(item)
    db.add(item)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="accommodation_booking.request",
        entity_type="accommodation_booking",
        entity_id=item.id,
        after={
            "case_id": case.id,
            "provider_id": provider.id,
            "check_in": body.check_in,
            "check_out": body.check_out,
            "total_minor": item.total_minor,
        },
        request=request,
    )
    await sync_checklist_key(db, case.id, ChecklistKey.ACCOMMODATION_BOOKED)
    await queue_case_push(
        db, case, "travel.updated", {"case_id": str(case.id), "accommodation_booking_id": str(item.id)}
    )
    await db.commit()
    await db.refresh(item)
    return item


async def update_accommodation_booking(
    db: AsyncSession,
    user: User,
    item_id: uuid.UUID,
    body: AccommodationBookingUpdate,
    request: Request | None = None,
) -> AccommodationBooking:
    item: AccommodationBooking = await _load_scoped(
        db, AccommodationBooking, item_id, user, "Accommodation booking"
    )
    case = await _get_case(db, item.case_id)
    changes = body.model_dump(exclude_unset=True)
    if not await _is_desk(db, user, case):
        if not (policies.is_patient(user) or policies.is_agent(user)):
            raise Forbidden("Only the hospital team or the travel desk can update accommodation bookings")
        _patient_side_update(changes, item.status, _PATIENT_ACCOMMODATION_FIELDS)
    current = ServiceBookingStatus(item.status)
    target: ServiceBookingStatus | None = changes.pop("status", None)
    if not SERVICE_TRANSITIONS[current] and changes:
        raise BadRequest(f"A {current.value} booking cannot be changed", code="invalid_state")
    for key in ("check_in", "check_out", "guests", "currency"):
        if key in changes and changes[key] is None:
            raise BadRequest(f"{key} cannot be null", code="invalid_field")
    for key, value in changes.items():
        setattr(item, key, value)
    if item.check_out <= item.check_in:
        raise BadRequest("check_out must be after check_in", code="invalid_dates")
    _recompute_total(item)
    if target is not None:
        _check_service_transition(current, target)
        if target == ServiceBookingStatus.QUOTED and item.nightly_rate_minor is None:
            raise BadRequest("Set nightly_rate_minor to quote this booking", code="price_required")
        item.status = target
    await audit_log(
        db,
        actor=user,
        action="accommodation_booking.update",
        entity_type="accommodation_booking",
        entity_id=item.id,
        before={"status": current.value},
        after={"status": _value(item.status), "total_minor": item.total_minor, **changes},
        request=request,
    )
    await sync_checklist_key(
        db,
        case.id,
        ChecklistKey.ACCOMMODATION_BOOKED,
        allow_downgrade=target == ServiceBookingStatus.CANCELLED,
    )
    await queue_case_push(
        db,
        case,
        "travel.updated",
        {"case_id": str(case.id), "accommodation_booking_id": str(item.id), "status": _value(item.status)},
    )
    await _publish_status_change(db, case, "accommodation", item, current.value, user)
    await db.commit()
    await db.refresh(item)
    return item


# --------------------------------------------------------------------------------------------- services
def scoped_services(user: User) -> Select[Any]:
    return select(ServiceBooking).where(policies.case_in_scope(ServiceBooking.case_id, user))


async def _validate_service_provider(db: AsyncSession, provider_id: uuid.UUID, kind: Any) -> ServiceProvider:
    provider = await db.get(ServiceProvider, provider_id)
    if provider is None or not provider.is_active:
        raise NotFound("Service provider not found")
    if _value(provider.kind) != _value(kind):
        raise BadRequest("The provider does not offer this service", code="invalid_provider")
    return provider


async def _sync_service(db: AsyncSession, case_id: uuid.UUID, kind: Any, downgrade: bool) -> None:
    if _value(kind) == ServiceKind.INSURANCE.value:
        await sync_checklist_key(db, case_id, ChecklistKey.TRAVEL_INSURANCE, allow_downgrade=downgrade)


async def create_service_booking(
    db: AsyncSession, user: User, body: ServiceBookingCreate, request: Request | None = None
) -> ServiceBooking:
    case = await _case_for_request(db, user, body.case_id)
    currency = "INR"
    if body.provider_id is not None:
        provider = await _validate_service_provider(db, body.provider_id, body.kind)
        currency = provider.currency
    item = ServiceBooking(
        case_id=case.id,
        patient_id=case.patient_id,
        provider_id=body.provider_id,
        kind=body.kind,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        status=ServiceBookingStatus.REQUESTED,
        currency=currency,
        notes=body.notes,
    )
    db.add(item)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="service_booking.request",
        entity_type="service_booking",
        entity_id=item.id,
        after={"case_id": case.id, "kind": body.kind.value, "provider_id": body.provider_id},
        request=request,
    )
    await _sync_service(db, case.id, body.kind, downgrade=False)
    await queue_case_push(
        db, case, "travel.updated", {"case_id": str(case.id), "service_booking_id": str(item.id)}
    )
    await db.commit()
    await db.refresh(item)
    return item


async def update_service_booking(
    db: AsyncSession,
    user: User,
    item_id: uuid.UUID,
    body: ServiceBookingUpdate,
    request: Request | None = None,
) -> ServiceBooking:
    item: ServiceBooking = await _load_scoped(db, ServiceBooking, item_id, user, "Service booking")
    case = await _get_case(db, item.case_id)
    changes = body.model_dump(exclude_unset=True)
    if not await _is_desk(db, user, case):
        if not (policies.is_patient(user) or policies.is_agent(user)):
            raise Forbidden("Only the hospital team or the travel desk can update service bookings")
        _patient_side_update(changes, item.status, _PATIENT_SERVICE_FIELDS)
    current = ServiceBookingStatus(item.status)
    target: ServiceBookingStatus | None = changes.pop("status", None)
    if not SERVICE_TRANSITIONS[current] and changes:
        raise BadRequest(f"A {current.value} booking cannot be changed", code="invalid_state")
    if changes.get("provider_id") is not None:
        provider = await _validate_service_provider(db, changes["provider_id"], item.kind)
        if "currency" not in changes and item.price_minor is None:
            item.currency = provider.currency
    if "currency" in changes and changes["currency"] is None:
        raise BadRequest("currency cannot be null", code="invalid_field")
    for key, value in changes.items():
        setattr(item, key, value)
    if item.starts_at and item.ends_at and item.ends_at < item.starts_at:
        raise BadRequest("ends_at must not be before starts_at", code="invalid_times")
    if target is not None:
        _check_service_transition(current, target)
        if target == ServiceBookingStatus.QUOTED and item.price_minor is None:
            raise BadRequest("Set price_minor to quote this booking", code="price_required")
        item.status = target
    await audit_log(
        db,
        actor=user,
        action="service_booking.update",
        entity_type="service_booking",
        entity_id=item.id,
        before={"status": current.value},
        after={"status": _value(item.status), **changes},
        request=request,
    )
    await _sync_service(db, case.id, item.kind, downgrade=target == ServiceBookingStatus.CANCELLED)
    await queue_case_push(
        db,
        case,
        "travel.updated",
        {"case_id": str(case.id), "service_booking_id": str(item.id), "status": _value(item.status)},
    )
    await _publish_status_change(db, case, "service", item, current.value, user, kind=item.kind)
    await db.commit()
    await db.refresh(item)
    return item


# --------------------------------------------------------------------------------------------- SOS
def scoped_sos(user: User) -> Select[Any]:
    return select(SosAlert).where(policies.patient_condition(SosAlert.patient_id, user))


async def _responder_ids(db: AsyncSession, coordinator_id: uuid.UUID | None) -> list[uuid.UUID]:
    rows = (
        await db.execute(
            select(User.id)
            .where(
                User.role.in_([UserRole.SUPPORT, UserRole.SUPER_ADMIN]),
                User.status == UserStatus.ACTIVE,
                User.deleted_at.is_(None),
            )
            .order_by(User.created_at)
            .limit(200)
        )
    ).scalars()
    ids = ([coordinator_id] if coordinator_id else []) + list(rows)
    return list(dict.fromkeys(ids))


async def create_sos(
    db: AsyncSession, user: User, body: SosCreate, request: Request | None = None
) -> SosAlert:
    case: Case | None = None
    if policies.is_patient(user):
        patient = await policies.get_patient_profile(db, user)
        if patient is None:
            raise BadRequest("Complete your patient profile first", code="patient_profile_missing")
        if body.case_id is not None:
            case = await policies.get_case_for_user(db, body.case_id, user)
        else:
            case = (
                await db.execute(
                    select(Case)
                    .where(
                        Case.patient_id == patient.id,
                        Case.status.in_([CaseStatus.IN_TREATMENT, CaseStatus.BOOKED, CaseStatus.ACCEPTED]),
                    )
                    .order_by(Case.updated_at.desc(), Case.id.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        patient_id = patient.id
    elif policies.is_agent(user):
        if body.case_id is None:
            raise BadRequest("case_id is required when an agent raises an SOS", code="case_required")
        case = await policies.get_case_for_user(db, body.case_id, user)
        patient_id = case.patient_id
    else:
        raise Forbidden("Only patients (or their agents) can raise an SOS")

    alert = SosAlert(
        patient_id=patient_id,
        case_id=case.id if case is not None else None,
        lat=body.lat,
        lng=body.lng,
        message=body.message,
        status=SosStatus.OPEN,
    )
    db.add(alert)
    await db.flush()
    coordinator_id = case.coordinator_user_id if case is not None else None
    await audit_log(
        db,
        actor=user,
        action="sos.create",
        entity_type="sos_alert",
        entity_id=alert.id,
        after={"case_id": alert.case_id, "has_location": body.lat is not None and body.lng is not None},
        request=request,
    )
    await publish(
        db,
        "sos.created",
        {
            "sos_id": str(alert.id),
            "patient_id": str(patient_id),
            "case_id": str(alert.case_id) if alert.case_id else None,
            "coordinator_user_id": str(coordinator_id) if coordinator_id else None,
        },
    )
    responders = await _responder_ids(db, coordinator_id)
    await db.commit()
    await db.refresh(alert)
    data = {
        "sos_id": str(alert.id),
        "patient_id": str(patient_id),
        "case_id": str(alert.case_id) if alert.case_id else None,
        "lat": alert.lat,
        "lng": alert.lng,
        "message": alert.message,
        "created_at": alert.created_at.isoformat(),
    }
    await realtime.send_to_users(list(responders), "sos.created", data)
    return alert


async def update_sos(
    db: AsyncSession, user: User, sos_id: uuid.UUID, body: SosUpdate, request: Request | None = None
) -> SosAlert:
    alert = (
        await db.execute(select(SosAlert).where(SosAlert.id == sos_id).with_for_update())
    ).scalar_one_or_none()
    if alert is None:
        raise NotFound("SOS alert not found")
    current = SosStatus(alert.status)
    if body.status not in SOS_TRANSITIONS[current]:
        raise BadRequest(
            f"An {current.value} SOS alert cannot become {body.status.value}",
            code="invalid_transition",
            details={"from_status": current.value, "to_status": body.status.value},
        )
    alert.status = body.status
    if alert.acknowledged_by is None:
        alert.acknowledged_by = user.id
    if body.status == SosStatus.RESOLVED:
        alert.resolved_at = utcnow()
    await audit_log(
        db,
        actor=user,
        action="sos.update",
        entity_type="sos_alert",
        entity_id=alert.id,
        before={"status": current.value},
        after={"status": body.status.value, "note": body.note},
        request=request,
    )
    patient_user = (
        await db.execute(select(PatientProfile.user_id).where(PatientProfile.id == alert.patient_id))
    ).scalar_one_or_none()
    await publish(
        db,
        "sos.updated",
        {
            "sos_id": str(alert.id),
            "patient_id": str(alert.patient_id),
            "status": body.status.value,
            "responder_user_id": str(user.id),
        },
    )
    await db.commit()
    await db.refresh(alert)
    if patient_user is not None:
        await realtime.send_to_user(
            patient_user,
            "sos.updated",
            {"sos_id": str(alert.id), "status": body.status.value, "responder_name": user.full_name},
        )
    return alert
