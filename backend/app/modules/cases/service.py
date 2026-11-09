"""Cases and quotes: creation, listing, manual status changes, coordinator assignment, quoting (PLAN 8.7)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import Select, and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import (
    BookingStatus,
    CaseStatus,
    ConsentKind,
    HospitalStatus,
    QuoteStatus,
    Urgency,
    UserRole,
    UserStatus,
)
from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.events import publish
from app.core.settings_store import get_setting
from app.models import (
    Booking,
    Case,
    CaseStatusHistory,
    Consent,
    Doctor,
    Hospital,
    PatientProfile,
    Procedure,
    Quote,
    Screening,
    Specialty,
    User,
)
from app.models.sequences import IST, next_number
from app.modules.auth.service import record_consent
from app.modules.cases import policies
from app.modules.cases.common import like_pattern, queue_case_push, today_ist, utcnow
from app.modules.cases.emergency import ensure_emergency_acknowledged
from app.modules.cases.schemas import AssignCoordinator, CaseCreate, CaseStatusChange, QuoteCreate
from app.modules.cases.state import CANCELLABLE_CASE_STATUSES, transition_case

CONSENT_VERSION = "1.0"
COORDINATOR_ROLES = (UserRole.SUPPORT, UserRole.ADMIN, UserRole.SUPER_ADMIN)


# --------------------------------------------------------------------------------------------- create
async def _has_share_consent(db: AsyncSession, user_id: uuid.UUID, hospital_id: uuid.UUID) -> bool:
    """Latest ``share_with_hospitals`` decision that applies to ``hospital_id``: rows scoped to that
    hospital (any of its cases) or account-wide rows (no case, no hospital)."""
    latest = (
        await db.execute(
            select(Consent.granted)
            .where(
                Consent.user_id == user_id,
                Consent.kind == ConsentKind.SHARE_WITH_HOSPITALS,
                or_(
                    Consent.hospital_id == hospital_id,
                    and_(Consent.hospital_id.is_(None), Consent.case_id.is_(None)),
                ),
            )
            .order_by(Consent.created_at.desc(), Consent.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return bool(latest)


async def create_case(db: AsyncSession, user: User, body: CaseCreate, request: Request | None = None) -> Case:
    policies.ensure_full_account(user)
    agent_id: uuid.UUID | None
    if policies.is_patient(user):
        patient = await policies.get_patient_profile(db, user)
        if patient is None:
            raise BadRequest("Complete your patient profile first", code="patient_profile_missing")
        if body.patient_id is not None and body.patient_id != patient.id:
            raise NotFound("Patient not found")
        agent_id = patient.managed_by_agent_id or patient.referred_by_agent_id
    elif policies.is_agent(user):
        agent = await policies.require_active_agent(db, user)
        if body.patient_id is None:
            raise BadRequest("patient_id is required when an agent creates a case", code="patient_required")
        found = await db.get(PatientProfile, body.patient_id)
        if found is None or not await policies.agent_can_manage_patient(db, agent, found.id):
            raise NotFound("Patient not found")
        patient = found
        agent_id = agent.id
    else:
        raise Forbidden("Only patients and agents can create cases")

    hospital = await db.get(Hospital, body.hospital_id)
    if hospital is None or hospital.status != HospitalStatus.ACTIVE:
        raise NotFound("Hospital not found")

    specialty_id = body.specialty_id
    procedure_id = body.procedure_id
    if body.doctor_id is not None:
        doctor = await db.get(Doctor, body.doctor_id)
        if doctor is None or doctor.hospital_id != hospital.id or not doctor.is_active:
            raise BadRequest("The doctor does not practise at this hospital", code="invalid_doctor")
        specialty_id = specialty_id or doctor.specialty_id
    if procedure_id is not None:
        procedure = await db.get(Procedure, procedure_id)
        if procedure is None or not procedure.is_active:
            raise BadRequest("Unknown procedure", code="invalid_procedure")
        specialty_id = specialty_id or procedure.specialty_id
    if specialty_id is not None and await db.get(Specialty, specialty_id) is None:
        raise BadRequest("Unknown specialty", code="invalid_specialty")

    medical_summary: str | None = None
    if body.screening_id is not None:
        screening = await db.get(Screening, body.screening_id)
        if screening is None or screening.patient_id != patient.id:
            raise NotFound("Screening not found")
        if isinstance(screening.ai_result, dict):
            summary = screening.ai_result.get("summary")
            medical_summary = str(summary)[:10_000] if summary else None
        specialty_id = specialty_id or screening.specialty_id

    # Consent to share the patient's data with the hospital (PLAN 9.9); recorded below, scoped to the case.
    if not body.consent_share and not await _has_share_consent(db, patient.user_id, hospital.id):
        raise BadRequest(
            "Consent to share medical information with the hospital is required",
            code="consent_required",
            details={"field": "consent_share"},
        )

    case = Case(
        case_number=await next_number(db, "case"),
        patient_id=patient.id,
        agent_id=agent_id,
        screening_id=body.screening_id,
        hospital_id=hospital.id,
        doctor_id=body.doctor_id,
        procedure_id=procedure_id,
        specialty_id=specialty_id,
        status=CaseStatus.ENQUIRY,
        patient_notes=body.patient_notes,
        medical_summary=medical_summary,
        created_by_user_id=user.id,
    )
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=None,
            to_status=CaseStatus.ENQUIRY,
            changed_by_user_id=user.id,
            note="Case created",
        )
    )
    await db.flush()
    if body.consent_share:
        # Scoped to this case and hospital. SEC-060: when an agent (or staff) acts for the patient it is
        # recorded as the granter, so the row never counts as the patient's own confirmation.
        record_consent(
            db,
            patient.user_id,
            ConsentKind.SHARE_WITH_HOSPITALS,
            CONSENT_VERSION,
            request,
            case_id=case.id,
            hospital_id=hospital.id,
            granted_by_user_id=user.id,
        )
    await audit_log(
        db,
        actor=user,
        action="case.create",
        entity_type="case",
        entity_id=case.id,
        after={"case_number": case.case_number, "hospital_id": hospital.id, "patient_id": patient.id},
        request=request,
    )
    await publish(
        db,
        "case.created",
        {
            "case_id": str(case.id),
            "hospital_id": str(hospital.id),
            "patient_id": str(patient.id),
            "agent_id": str(agent_id) if agent_id else None,
        },
    )
    await db.commit()
    return case


# --------------------------------------------------------------------------------------------- list
CASE_SORT_FIELDS: dict[str, Any] = {
    "created_at": Case.created_at,
    "updated_at": Case.updated_at,
    "case_number": Case.case_number,
    "status": Case.status,
}
"""Sortable columns of ``GET /cases`` (``sort=field`` ascending, ``sort=-field`` descending)."""

CASE_SORT_PATTERN = r"^-?(" + "|".join(CASE_SORT_FIELDS) + r")$"


def _ist_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def apply_case_filters(
    stmt: Select[Any],
    *,
    status: CaseStatus | Sequence[CaseStatus] | None = None,
    hospital_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
    coordinator_id: uuid.UUID | None = None,
    unassigned: bool = False,
    urgency: Sequence[Urgency] | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    updated_from: date | None = None,
    updated_to: date | None = None,
    q: str | None = None,
    specialty_id: Sequence[uuid.UUID] | None = None,
    procedure_id: Sequence[uuid.UUID] | None = None,
    doctor_id: Sequence[uuid.UUID] | None = None,
) -> Select[Any]:
    """WHERE clauses shared by the case list and the status counts. Date bounds are inclusive Indian
    calendar dates (``created_to=2026-10-21`` includes the whole of 21 Oct IST)."""
    if isinstance(status, CaseStatus):
        stmt = stmt.where(Case.status == status)
    elif status:
        stmt = stmt.where(Case.status.in_(list(status)))
    if hospital_id is not None:
        stmt = stmt.where(Case.hospital_id == hospital_id)
    if patient_id is not None:
        stmt = stmt.where(Case.patient_id == patient_id)
    if agent_id is not None:
        stmt = stmt.where(Case.agent_id == agent_id)
    if unassigned:
        stmt = stmt.where(Case.coordinator_user_id.is_(None))
    elif coordinator_id is not None:
        stmt = stmt.where(Case.coordinator_user_id == coordinator_id)
    if specialty_id:
        stmt = stmt.where(Case.specialty_id.in_(list(specialty_id)))
    if procedure_id:
        stmt = stmt.where(Case.procedure_id.in_(list(procedure_id)))
    if doctor_id:
        stmt = stmt.where(Case.doctor_id.in_(list(doctor_id)))
    if urgency:
        stmt = stmt.where(
            Case.screening_id.in_(select(Screening.id).where(Screening.urgency.in_(list(urgency))))
        )
    if created_from is not None:
        stmt = stmt.where(Case.created_at >= _ist_day_start(created_from))
    if created_to is not None:
        stmt = stmt.where(Case.created_at < _ist_day_start(created_to + timedelta(days=1)))
    if updated_from is not None:
        stmt = stmt.where(Case.updated_at >= _ist_day_start(updated_from))
    if updated_to is not None:
        stmt = stmt.where(Case.updated_at < _ist_day_start(updated_to + timedelta(days=1)))
    if q:
        pattern = like_pattern(q.strip()[:100])
        patient_match = select(PatientProfile.id).where(
            or_(
                PatientProfile.first_name.ilike(pattern),
                PatientProfile.last_name.ilike(pattern),
            )
        )
        stmt = stmt.where(
            or_(
                Case.case_number.ilike(pattern),
                Case.patient_id.in_(patient_match),
                Case.hospital_id.in_(select(Hospital.id).where(Hospital.name.ilike(pattern))),
                Case.procedure_id.in_(select(Procedure.id).where(Procedure.name.ilike(pattern))),
                Case.specialty_id.in_(select(Specialty.id).where(Specialty.name.ilike(pattern))),
            )
        )
    return stmt


def list_cases_stmt(user: User, *, sort: str | None = None, **filters: Any) -> Select[Any]:
    """Cases visible to ``user`` filtered by :func:`apply_case_filters` keywords and ordered by ``sort``
    (``field`` / ``-field`` from :data:`CASE_SORT_FIELDS`; default ``-created_at``; ties broken by id)."""
    stmt = apply_case_filters(policies.scope_cases(select(Case), user), **filters)
    sort = sort or "-created_at"
    descending = sort.startswith("-")
    column = CASE_SORT_FIELDS.get(sort.lstrip("-"), Case.created_at)
    if descending:
        return stmt.order_by(column.desc(), Case.id.desc())
    return stmt.order_by(column.asc(), Case.id.asc())


async def case_status_counts(db: AsyncSession, user: User, **filters: Any) -> dict[str, int]:
    """Visible cases per status (every status present, 0 when none) for the given filters. A ``status``
    filter is ignored so the counts can drive status tabs."""
    filters.pop("status", None)
    inner = apply_case_filters(policies.scope_cases(select(Case.id, Case.status), user), **filters).subquery()
    rows = (await db.execute(select(inner.c.status, func.count()).group_by(inner.c.status))).all()
    counts = {s.value: 0 for s in CaseStatus}
    for value, count in rows:
        counts[CaseStatus(value).value] = int(count)
    return counts


# --------------------------------------------------------------------------------------------- status
async def withdraw_open_quotes(db: AsyncSession, case_id: uuid.UUID) -> None:
    await db.execute(
        update(Quote)
        .where(Quote.case_id == case_id, Quote.status.in_([QuoteStatus.SENT, QuoteStatus.DRAFT]))
        .values(status=QuoteStatus.WITHDRAWN)
        .execution_options(synchronize_session=False)
    )


async def change_case_status(
    db: AsyncSession, user: User, case_id: uuid.UUID, body: CaseStatusChange, request: Request | None = None
) -> Case:
    """Manual transitions (``cancelled`` by patient/agent/ops staff, ``declined`` by the hospital or ops
    staff). Other transitions happen through quotes/bookings endpoints."""
    case = await policies.get_case_for_user(db, case_id, user, for_update=True)
    target = body.to_status
    if target == CaseStatus.CANCELLED:
        if not (policies.is_patient(user) or policies.is_agent(user) or policies.is_ops_staff(user)):
            raise Forbidden("Only the patient, their agent or operations staff can cancel a case")
        if case.status not in CANCELLABLE_CASE_STATUSES:
            raise BadRequest(
                f"A case in status {CaseStatus(case.status).value} cannot be cancelled",
                code="invalid_transition",
            )
        active = (
            await db.execute(
                select(Booking)
                .where(Booking.case_id == case.id, Booking.status != BookingStatus.CANCELLED)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if active is not None:
            from app.modules.cases.bookings import cancel_booking_locked, resolve_initiator

            await cancel_booking_locked(
                db,
                active,
                case,
                actor=user,
                reason=body.note or "Case cancelled",
                request=request,
                cancel_case=True,
                initiated_by=await resolve_initiator(db, user, active, body.initiated_by),
            )
        else:
            await withdraw_open_quotes(db, case.id)
            await transition_case(db, case, CaseStatus.CANCELLED, actor=user, note=body.note, request=request)
    elif target == CaseStatus.DECLINED:
        await policies.ensure_hospital_actor(db, user, case.hospital_id)
        await withdraw_open_quotes(db, case.id)
        await transition_case(db, case, CaseStatus.DECLINED, actor=user, note=body.note, request=request)
    else:
        raise BadRequest(
            f"Status {target.value} is set through the quote/booking endpoints",
            code="invalid_transition",
            details={"from_status": CaseStatus(case.status).value, "to_status": target.value},
        )
    await db.commit()
    return case


async def assign_coordinator(
    db: AsyncSession, user: User, case_id: uuid.UUID, body: AssignCoordinator, request: Request | None = None
) -> Case:
    case = await policies.get_case_for_user(db, case_id, user, for_update=True)
    coordinator = await db.get(User, body.user_id)
    if (
        coordinator is None
        or coordinator.status != UserStatus.ACTIVE
        or str(getattr(coordinator.role, "value", coordinator.role))
        not in {r.value for r in COORDINATOR_ROLES}
    ):
        raise BadRequest("Coordinator must be an active support/admin user", code="invalid_coordinator")
    previous = case.coordinator_user_id
    case.coordinator_user_id = coordinator.id
    await audit_log(
        db,
        actor=user,
        action="case.assign_coordinator",
        entity_type="case",
        entity_id=case.id,
        before={"coordinator_user_id": previous},
        after={"coordinator_user_id": coordinator.id},
        request=request,
    )
    await publish(
        db,
        "case.coordinator_assigned",
        {
            "case_id": str(case.id),
            "coordinator_user_id": str(coordinator.id),
            "previous_coordinator_user_id": str(previous) if previous else None,
        },
    )
    await queue_case_push(
        db, case, "case.updated", {"case_id": str(case.id), "coordinator_user_id": str(coordinator.id)}
    )
    await db.commit()
    return case


# --------------------------------------------------------------------------------------------- quotes
async def send_quote(
    db: AsyncSession, user: User, case_id: uuid.UUID, body: QuoteCreate, request: Request | None = None
) -> Quote:
    case = await policies.get_case_for_user(db, case_id, user, for_update=True)
    await policies.ensure_hospital_actor(db, user, case.hospital_id)
    if case.status not in (CaseStatus.ENQUIRY, CaseStatus.QUOTED):
        raise BadRequest(
            f"Quotes cannot be sent for a case in status {CaseStatus(case.status).value}",
            code="invalid_state",
        )
    if body.valid_until < today_ist():
        raise BadRequest("valid_until must not be in the past", code="invalid_valid_until")
    supported = await get_setting(db, "supported_currencies") or []
    if body.currency not in {str(c).upper() for c in supported} | {"INR"}:
        raise BadRequest(f"Currency {body.currency} is not supported", code="unsupported_currency")
    line_items = [li.model_dump(mode="json") for li in body.line_items]
    total = sum(int(li["amount_minor"]) for li in line_items)
    if total <= 0:
        raise BadRequest("The quote total must be greater than zero", code="invalid_quote_total")

    await withdraw_open_quotes(db, case.id)
    quote = Quote(
        case_id=case.id,
        hospital_id=case.hospital_id,
        prepared_by_user_id=user.id,
        status=QuoteStatus.SENT,
        treatment_plan=body.treatment_plan,
        line_items=line_items,
        total_minor=total,
        currency=body.currency,
        estimated_stay_days=body.estimated_stay_days,
        valid_until=body.valid_until,
    )
    db.add(quote)
    await db.flush()
    if case.status == CaseStatus.ENQUIRY:
        await transition_case(db, case, CaseStatus.QUOTED, actor=user, note="Quote sent", request=request)
    else:
        await queue_case_push(db, case, "case.updated", {"case_id": str(case.id), "quote_id": str(quote.id)})
    await audit_log(
        db,
        actor=user,
        action="quote.send",
        entity_type="quote",
        entity_id=quote.id,
        after={"case_id": case.id, "total_minor": total, "currency": body.currency},
        request=request,
    )
    await publish(db, "quote.sent", {"quote_id": str(quote.id), "case_id": str(case.id)})
    await db.commit()
    return quote


async def _load_case_quote(db: AsyncSession, case: Case, quote_id: uuid.UUID) -> Quote:
    quote = (
        await db.execute(
            select(Quote).where(Quote.id == quote_id, Quote.case_id == case.id).with_for_update()
        )
    ).scalar_one_or_none()
    if quote is None:
        raise NotFound("Quote not found")
    return quote


async def accept_quote(
    db: AsyncSession, user: User, case_id: uuid.UUID, quote_id: uuid.UUID, request: Request | None = None
) -> Quote:
    policies.ensure_patient_side(user)
    policies.ensure_full_account(user)
    case = await policies.get_case_for_user(db, case_id, user, for_update=True)
    quote = await _load_case_quote(db, case, quote_id)
    if quote.status != QuoteStatus.SENT:
        raise BadRequest(
            f"This quote is {QuoteStatus(quote.status).value} and cannot be accepted", code="quote_not_open"
        )
    await ensure_emergency_acknowledged(db, case)
    latest_sent = (
        await db.execute(
            select(Quote.id)
            .where(Quote.case_id == case.id, Quote.status == QuoteStatus.SENT)
            .order_by(Quote.created_at.desc(), Quote.id.desc())
            .limit(1)
        )
    ).scalar_one()
    if latest_sent != quote.id:
        raise BadRequest("A newer quote replaces this one", code="quote_superseded")
    if quote.valid_until is not None and quote.valid_until < today_ist():
        quote.status = QuoteStatus.EXPIRED
        await audit_log(
            db,
            actor=None,
            action="quote.expire",
            entity_type="quote",
            entity_id=quote.id,
            before={"status": QuoteStatus.SENT.value},
            after={"status": QuoteStatus.EXPIRED.value},
        )
        quote_valid_until = quote.valid_until
        await db.commit()
        raise BadRequest(
            "This quote has expired; ask the hospital for a new one",
            code="quote_expired",
            details={"valid_until": quote_valid_until.isoformat()},
        )
    if case.status != CaseStatus.QUOTED:
        raise BadRequest(
            f"A case in status {CaseStatus(case.status).value} cannot accept a quote",
            code="invalid_transition",
        )
    quote.status = QuoteStatus.ACCEPTED
    quote.accepted_at = utcnow()
    await transition_case(db, case, CaseStatus.ACCEPTED, actor=user, note="Quote accepted", request=request)
    await audit_log(
        db,
        actor=user,
        action="quote.accept",
        entity_type="quote",
        entity_id=quote.id,
        before={"status": QuoteStatus.SENT.value},
        after={"status": QuoteStatus.ACCEPTED.value},
        request=request,
    )
    await publish(db, "quote.accepted", {"quote_id": str(quote.id), "case_id": str(case.id)})
    await db.commit()
    return quote


async def reject_quote(
    db: AsyncSession,
    user: User,
    case_id: uuid.UUID,
    quote_id: uuid.UUID,
    reason: str | None,
    request: Request | None = None,
) -> Quote:
    policies.ensure_patient_side(user)
    case = await policies.get_case_for_user(db, case_id, user, for_update=True)
    quote = await _load_case_quote(db, case, quote_id)
    if quote.status != QuoteStatus.SENT:
        raise BadRequest(
            f"This quote is {QuoteStatus(quote.status).value} and cannot be rejected", code="quote_not_open"
        )
    quote.status = QuoteStatus.REJECTED
    quote.rejected_reason = reason
    await audit_log(
        db,
        actor=user,
        action="quote.reject",
        entity_type="quote",
        entity_id=quote.id,
        before={"status": QuoteStatus.SENT.value},
        after={"status": QuoteStatus.REJECTED.value, "reason": reason},
        request=request,
    )
    await queue_case_push(db, case, "case.updated", {"case_id": str(case.id), "quote_id": str(quote.id)})
    await db.commit()
    return quote


async def expire_quotes(db: AsyncSession) -> int:
    """Mark sent quotes past ``valid_until`` as expired (periodic job)."""
    result = await db.execute(
        update(Quote)
        .where(Quote.status == QuoteStatus.SENT, Quote.valid_until < today_ist())
        .values(status=QuoteStatus.EXPIRED)
        .returning(Quote.id)
        .execution_options(synchronize_session=False)
    )
    return len(list(result.scalars()))
