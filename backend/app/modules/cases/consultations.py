"""Tele-consultations: patients/agents request, hospital team or staff schedule/complete (PLAN 8.7)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import CaseStatus, ConsultationMode, ConsultationStatus
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.models import Case, Consultation, Doctor, User
from app.modules.cases import policies
from app.modules.cases.common import queue_case_push, utcnow
from app.modules.cases.schemas import ConsultationCreate, ConsultationUpdate
from app.modules.cases.state import CLOSED_CASE_STATUSES

CONSULTATION_TRANSITIONS: dict[ConsultationStatus, frozenset[ConsultationStatus]] = {
    ConsultationStatus.REQUESTED: frozenset({ConsultationStatus.SCHEDULED, ConsultationStatus.CANCELLED}),
    ConsultationStatus.SCHEDULED: frozenset(
        {ConsultationStatus.SCHEDULED, ConsultationStatus.COMPLETED, ConsultationStatus.CANCELLED}
    ),
    ConsultationStatus.COMPLETED: frozenset(),
    ConsultationStatus.CANCELLED: frozenset(),
}


def scoped_consultations(user: User) -> Select[Any]:
    return select(Consultation).where(policies.case_in_scope(Consultation.case_id, user))


async def get_consultation_for_user(
    db: AsyncSession, consultation_id: uuid.UUID, user: User, *, for_update: bool = False
) -> Consultation:
    stmt = scoped_consultations(user).where(Consultation.id == consultation_id)
    if for_update:
        stmt = stmt.with_for_update(of=Consultation)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None:
        raise NotFound("Consultation not found")
    return item


async def create_consultation(
    db: AsyncSession, user: User, body: ConsultationCreate, request: Request | None = None
) -> Consultation:
    policies.ensure_patient_side(user)
    if policies.is_agent(user):
        await policies.require_active_agent(db, user)
    case = await policies.get_case_for_user(db, body.case_id, user, for_update=True)
    if case.status in CLOSED_CASE_STATUSES:
        raise BadRequest(
            f"A case in status {CaseStatus(case.status).value} cannot request consultations",
            code="invalid_state",
        )
    doctor_id = body.doctor_id or case.doctor_id
    if doctor_id is None:
        raise BadRequest("Choose a doctor for the consultation", code="doctor_required")
    doctor = await db.get(Doctor, doctor_id)
    if doctor is None or doctor.hospital_id != case.hospital_id or not doctor.is_active:
        raise BadRequest("The doctor does not practise at the case's hospital", code="invalid_doctor")
    if not doctor.teleconsult_available:
        raise BadRequest("This doctor does not offer tele-consultations", code="teleconsult_unavailable")
    open_request = (
        await db.execute(
            select(Consultation.id).where(
                Consultation.case_id == case.id,
                Consultation.doctor_id == doctor.id,
                Consultation.status.in_([ConsultationStatus.REQUESTED, ConsultationStatus.SCHEDULED]),
            )
        )
    ).scalar_one_or_none()
    if open_request is not None:
        raise Conflict("A consultation with this doctor is already open", code="consultation_exists")
    notes = body.notes
    if body.preferred_at is not None:
        preferred = f"Preferred time: {body.preferred_at.isoformat()}"
        notes = f"{preferred}\n{notes}" if notes else preferred
    item = Consultation(
        case_id=case.id,
        doctor_id=doctor.id,
        patient_id=case.patient_id,
        mode=body.mode,
        status=ConsultationStatus.REQUESTED,
        fee_minor=int(doctor.consultation_fee_minor or 0),
        currency=doctor.currency,
        notes=notes,
    )
    db.add(item)
    await db.flush()
    await audit_log(
        db,
        actor=user,
        action="consultation.request",
        entity_type="consultation",
        entity_id=item.id,
        after={"case_id": case.id, "doctor_id": doctor.id, "fee_minor": item.fee_minor},
        request=request,
    )
    await queue_case_push(
        db, case, "consultation.updated", {"consultation_id": str(item.id), "status": "requested"}
    )
    await db.commit()
    await db.refresh(item)
    return item


async def update_consultation(
    db: AsyncSession,
    user: User,
    consultation_id: uuid.UUID,
    body: ConsultationUpdate,
    request: Request | None = None,
) -> Consultation:
    item = await get_consultation_for_user(db, consultation_id, user, for_update=True)
    case = (await db.execute(select(Case).where(Case.id == item.case_id))).scalar_one()
    changes = body.model_dump(exclude_unset=True)
    hospital_side = await policies.can_act_for_hospital(db, user, case.hospital_id)
    if not hospital_side:
        # Patients/agents may only cancel their own request.
        if not (policies.is_patient(user) or policies.is_agent(user)):
            raise Forbidden("Only the hospital team or platform staff can update consultations")
        if set(changes) - {"status", "notes"} or changes.get("status") not in (
            None,
            ConsultationStatus.CANCELLED,
        ):
            raise Forbidden("Patients can only cancel a consultation")
    current = ConsultationStatus(item.status)
    target = changes.get("status")
    if target is None and current == ConsultationStatus.REQUESTED and changes.get("scheduled_at"):
        target = ConsultationStatus.SCHEDULED
    if target is not None and target not in CONSULTATION_TRANSITIONS[current]:
        raise BadRequest(
            f"A {current.value} consultation cannot become {target.value}",
            code="invalid_transition",
            details={"from_status": current.value, "to_status": target.value},
        )
    if not CONSULTATION_TRANSITIONS[current] and set(changes) - {"notes"}:
        raise BadRequest(f"A {current.value} consultation cannot be changed", code="invalid_state")
    before = {
        "status": current.value,
        "scheduled_at": item.scheduled_at,
        "meeting_url": item.meeting_url,
    }
    if "scheduled_at" in changes:
        if changes["scheduled_at"] is not None and changes["scheduled_at"] <= utcnow():
            raise BadRequest("scheduled_at must be in the future", code="invalid_scheduled_at")
        item.scheduled_at = changes["scheduled_at"]
    if "meeting_url" in changes:
        item.meeting_url = str(changes["meeting_url"]) if changes["meeting_url"] is not None else None
    if changes.get("mode") is not None:
        item.mode = changes["mode"]
    if changes.get("duration_min") is not None:
        item.duration_min = changes["duration_min"]
    if "notes" in changes:
        item.notes = changes["notes"]
    if target is not None:
        if target == ConsultationStatus.SCHEDULED:
            if item.scheduled_at is None:
                raise BadRequest("scheduled_at is required to schedule", code="scheduled_at_required")
            if item.mode == ConsultationMode.VIDEO and not item.meeting_url:
                raise BadRequest(
                    "meeting_url is required for video consultations", code="meeting_url_required"
                )
        item.status = target
    after = {
        "status": ConsultationStatus(item.status).value,
        "scheduled_at": item.scheduled_at,
        "meeting_url": item.meeting_url,
    }
    await audit_log(
        db,
        actor=user,
        action="consultation.update",
        entity_type="consultation",
        entity_id=item.id,
        before=before,
        after=after,
        request=request,
    )
    await queue_case_push(
        db,
        case,
        "consultation.updated",
        {"consultation_id": str(item.id), "status": ConsultationStatus(item.status).value},
    )
    await db.commit()
    await db.refresh(item)
    return item
