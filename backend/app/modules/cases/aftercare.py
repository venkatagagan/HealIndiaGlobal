"""Aftercare (phase 1): video follow-ups after discharge, recovery check-ins and red-flag escalation.

* Discharge (``booking.completed``) creates follow-up consultation requests with the treating doctor at
  ``AFTERCARE_FOLLOWUP_DAYS`` (status ``requested``; the hospital confirms the time, a Jitsi link is created
  when it schedules without one) and check-ins at ``AFTERCARE_CHECKIN_DAYS``.
* Patients may also request ``kind=followup`` consultations on a completed case for
  ``AFTERCARE_WINDOW_DAYS`` after discharge.
* A check-in answer with fever, breathlessness, wound concerns or pain >= 8 publishes
  ``aftercare.red_flag`` (the hospital and the coordinator are alerted at once).
* ``cases.consultation_reminders`` publishes ``consultation.reminder`` 24 h and 1 h before a scheduled call.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Any, Literal

import structlog
from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.enums import BookingStatus, CaseStatus, ConsultationKind, ConsultationMode, ConsultationStatus
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.events import publish
from app.models import AftercareCheckin, Booking, Case, Consultation, Doctor, IntroConsultation, User
from app.models.sequences import IST
from app.modules.cases import policies
from app.modules.cases.common import queue_case_push, utcnow
from app.modules.cases.schemas import ConsultationOut, DoctorRef, HospitalRef

logger = structlog.get_logger(__name__)

PAIN_RED_FLAG = 8
CHECKIN_HOUR_IST = 10  # check-ins and follow-ups are due at 10:00 India time on their day


# --------------------------------------------------------------------------------------------- schemas
class CheckinSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    pain: int = Field(ge=0, le=10, description="Pain now, 0 (none) to 10 (worst)")
    fever: bool
    wound_concerns: bool = Field(description="Redness, swelling, discharge, bleeding or opening of the wound")
    breathlessness: bool
    medication_adherence: Literal["all", "some", "none"] = Field(
        description="Taking all / some / none of the prescribed medicines"
    )
    free_text: str | None = Field(default=None, max_length=2000)


class CheckinOut(BaseModel):
    id: uuid.UUID
    case_id: uuid.UUID
    case_number: str | None = None
    day: int
    due_at: datetime
    is_due: bool
    submitted_at: datetime | None = None
    answers: dict[str, Any] = Field(default_factory=dict)
    free_text: str | None = None
    red_flags: list[str] = Field(default_factory=list)


class AftercareCaseOut(BaseModel):
    case_id: uuid.UUID
    case_number: str
    hospital: HospitalRef
    doctor: DoctorRef | None = None
    discharged_on: date | None = None
    aftercare_until: date | None = None
    """Last day a follow-up video consultation can be requested (discharge + AFTERCARE_WINDOW_DAYS)."""


class AftercareOut(BaseModel):
    """``GET /me/aftercare``."""

    cases: list[AftercareCaseOut] = Field(default_factory=list)
    followups: list[ConsultationOut] = Field(default_factory=list)
    """Open follow-up consultations (requested or scheduled), soonest first."""
    checkins_due: list[CheckinOut] = Field(default_factory=list)
    """Check-ins to answer now (due and not answered)."""
    upcoming_checkins: list[CheckinOut] = Field(default_factory=list)


# --------------------------------------------------------------------------------------------- helpers
def _at_ist(day: date) -> datetime:
    return datetime.combine(day, time(CHECKIN_HOUR_IST, 0), tzinfo=IST)


async def discharge_date(db: AsyncSession, case: Case) -> date | None:
    """Discharge day of the case's completed booking (else the day the case was closed, IST)."""
    found = (
        await db.execute(
            select(Booking.discharge_date)
            .where(Booking.case_id == case.id, Booking.status == BookingStatus.COMPLETED)
            .order_by(Booking.completed_at.desc().nulls_last())
            .limit(1)
        )
    ).scalar_one_or_none()
    if found is not None:
        return found
    if case.closed_at is not None:
        return case.closed_at.astimezone(IST).date()
    return None


async def treating_doctor_id(db: AsyncSession, case: Case) -> uuid.UUID | None:
    booking_doctor = (
        await db.execute(
            select(Booking.doctor_id)
            .where(Booking.case_id == case.id, Booking.status != BookingStatus.CANCELLED)
            .order_by(Booking.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return booking_doctor or case.doctor_id


async def ensure_followup_allowed(db: AsyncSession, case: Case) -> None:
    """Follow-ups: during treatment, or on a completed case within AFTERCARE_WINDOW_DAYS of discharge."""
    status = CaseStatus(case.status)
    if status == CaseStatus.IN_TREATMENT:
        return
    if status != CaseStatus.COMPLETED:
        raise BadRequest(
            "Follow-up consultations are available after treatment", code="followup_not_available"
        )
    discharged = await discharge_date(db, case)
    if discharged is None:
        return
    until = discharged + timedelta(days=settings.AFTERCARE_WINDOW_DAYS)
    if datetime.now(IST).date() > until:
        raise BadRequest(
            f"Follow-up consultations are available for {settings.AFTERCARE_WINDOW_DAYS} days after "
            "discharge",
            code="aftercare_window_closed",
            details={"aftercare_until": until.isoformat()},
        )


# --------------------------------------------------------------------------------------------- discharge
async def create_aftercare_plan(db: AsyncSession, booking_id: uuid.UUID) -> None:
    """Follow-up requests + check-ins after discharge (idempotent; runs in the discharge transaction)."""
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.status != BookingStatus.COMPLETED:
        return
    case = await db.get(Case, booking.case_id)
    if case is None:
        return
    discharged = booking.discharge_date or datetime.now(IST).date()
    doctor_id = booking.doctor_id or case.doctor_id
    doctor = await db.get(Doctor, doctor_id) if doctor_id else None
    existing_days = set(
        (
            await db.execute(
                select(Consultation.followup_day).where(
                    Consultation.case_id == case.id, Consultation.followup_day.is_not(None)
                )
            )
        ).scalars()
    )
    created = 0
    if doctor is not None:
        for day in settings.aftercare_followup_days:
            if day in existing_days:
                continue
            db.add(
                Consultation(
                    case_id=case.id,
                    doctor_id=doctor.id,
                    patient_id=case.patient_id,
                    mode=ConsultationMode.VIDEO,
                    status=ConsultationStatus.REQUESTED,
                    kind=ConsultationKind.FOLLOWUP,
                    due_at=_at_ist(discharged + timedelta(days=day)),
                    followup_day=day,
                    fee_minor=0,
                    currency=doctor.currency,
                    notes=f"Aftercare follow-up {day} days after discharge",
                )
            )
            created += 1
    else:
        logger.info("aftercare.no_treating_doctor", case_id=str(case.id))
    checkin_days = set(
        (await db.execute(select(AftercareCheckin.day).where(AftercareCheckin.case_id == case.id))).scalars()
    )
    for day in settings.aftercare_checkin_days:
        if day not in checkin_days:
            db.add(
                AftercareCheckin(
                    case_id=case.id,
                    patient_id=case.patient_id,
                    day=day,
                    due_at=_at_ist(discharged + timedelta(days=day)),
                )
            )
    await db.flush()
    if created:
        await queue_case_push(
            db, case, "consultation.updated", {"case_id": str(case.id), "status": "requested"}
        )


# --------------------------------------------------------------------------------------------- reads
def checkin_out(c: AftercareCheckin, case_number: str | None, now: datetime | None = None) -> CheckinOut:
    now = now or utcnow()
    return CheckinOut(
        id=c.id,
        case_id=c.case_id,
        case_number=case_number,
        day=c.day,
        due_at=c.due_at,
        is_due=c.submitted_at is None and c.due_at <= now,
        submitted_at=c.submitted_at,
        answers=dict(c.answers or {}),
        free_text=c.free_text,
        red_flags=list(c.red_flags or []),
    )


async def my_aftercare(db: AsyncSession, user: User) -> AftercareOut:
    from app.modules.cases.serializers import consultation_outs, load_refs

    cases = list(
        (
            await db.execute(
                policies.scope_cases(select(Case), user)
                .where(Case.status.in_([CaseStatus.COMPLETED, CaseStatus.IN_TREATMENT]))
                .order_by(Case.closed_at.desc().nulls_first(), Case.id)
                .limit(50)
            )
        ).scalars()
    )
    if not cases:
        return AftercareOut()
    case_ids = [c.id for c in cases]
    numbers = {c.id: c.case_number for c in cases}
    followups = list(
        (
            await db.execute(
                select(Consultation)
                .where(
                    Consultation.case_id.in_(case_ids),
                    Consultation.kind == ConsultationKind.FOLLOWUP,
                    Consultation.status.in_([ConsultationStatus.REQUESTED, ConsultationStatus.SCHEDULED]),
                )
                .order_by(
                    Consultation.scheduled_at.asc().nulls_last(),
                    Consultation.due_at.asc().nulls_last(),
                    Consultation.id,
                )
            )
        ).scalars()
    )
    checkins = list(
        (
            await db.execute(
                select(AftercareCheckin)
                .where(AftercareCheckin.case_id.in_(case_ids), AftercareCheckin.submitted_at.is_(None))
                .order_by(AftercareCheckin.due_at, AftercareCheckin.id)
            )
        ).scalars()
    )
    now = utcnow()
    treating = {c.id: await treating_doctor_id(db, c) for c in cases}
    refs = await load_refs(db, hospital_ids=[c.hospital_id for c in cases], doctor_ids=treating.values())
    case_rows: list[AftercareCaseOut] = []
    for c in cases:
        discharged = await discharge_date(db, c) if c.status == CaseStatus.COMPLETED else None
        case_rows.append(
            AftercareCaseOut(
                case_id=c.id,
                case_number=c.case_number,
                hospital=refs.hospital(c.hospital_id),
                doctor=refs.doctor(treating[c.id]),
                discharged_on=discharged,
                aftercare_until=(
                    discharged + timedelta(days=settings.AFTERCARE_WINDOW_DAYS) if discharged else None
                ),
            )
        )
    outs = [checkin_out(c, numbers.get(c.case_id), now) for c in checkins]
    return AftercareOut(
        cases=case_rows,
        followups=await consultation_outs(db, followups),
        checkins_due=[o for o in outs if o.is_due],
        upcoming_checkins=[o for o in outs if not o.is_due],
    )


async def list_checkins(db: AsyncSession, user: User, case_id: uuid.UUID) -> list[CheckinOut]:
    case = await policies.get_case_for_user(db, case_id, user)
    rows = (
        await db.execute(
            select(AftercareCheckin)
            .where(AftercareCheckin.case_id == case.id)
            .order_by(AftercareCheckin.due_at, AftercareCheckin.id)
        )
    ).scalars()
    now = utcnow()
    return [checkin_out(c, case.case_number, now) for c in rows]


# --------------------------------------------------------------------------------------------- submit
def red_flags_of(body: CheckinSubmit) -> list[str]:
    flags: list[str] = []
    if body.fever:
        flags.append("fever")
    if body.breathlessness:
        flags.append("breathlessness")
    if body.pain >= PAIN_RED_FLAG:
        flags.append("severe_pain")
    if body.wound_concerns:
        flags.append("wound_concerns")
    return flags


async def submit_checkin(
    db: AsyncSession, user: User, checkin_id: uuid.UUID, body: CheckinSubmit, request: Request | None = None
) -> CheckinOut:
    if not (policies.is_patient(user) or policies.is_agent(user)):
        raise Forbidden("Only the patient or their agent can answer a check-in")
    checkin = (
        await db.execute(
            select(AftercareCheckin)
            .where(
                AftercareCheckin.id == checkin_id,
                policies.case_in_scope(AftercareCheckin.case_id, user),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if checkin is None:
        raise NotFound("Check-in not found")
    if checkin.submitted_at is not None:
        raise Conflict("This check-in was already answered", code="checkin_already_submitted")
    case = (await db.execute(select(Case).where(Case.id == checkin.case_id))).scalar_one()
    flags = red_flags_of(body)
    checkin.answers = body.model_dump(exclude={"free_text"})
    checkin.free_text = body.free_text or None
    checkin.red_flags = flags
    checkin.submitted_at = utcnow()
    checkin.submitted_by_user_id = user.id
    await audit_log(
        db,
        actor=user,
        action="aftercare.checkin_submit",
        entity_type="aftercare_checkin",
        entity_id=checkin.id,
        after={"case_id": case.id, "day": checkin.day, "red_flags": flags},
        request=request,
    )
    if flags:
        await publish(
            db,
            "aftercare.red_flag",
            {
                "checkin_id": str(checkin.id),
                "case_id": str(case.id),
                "case_number": case.case_number,
                "hospital_id": str(case.hospital_id),
                "patient_id": str(case.patient_id),
                "coordinator_user_id": str(case.coordinator_user_id) if case.coordinator_user_id else None,
                "red_flags": flags,
                "pain": body.pain,
                "day": checkin.day,
            },
        )
    await queue_case_push(
        db,
        case,
        "aftercare.checkin",
        {"case_id": str(case.id), "checkin_id": str(checkin.id), "red_flags": flags},
    )
    await db.commit()
    await db.refresh(checkin)
    return checkin_out(checkin, case.case_number)


# --------------------------------------------------------------------------------------------- reminders
async def run_consultation_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Publish ``consultation.reminder`` 24 h and 1 h before scheduled consultations and intro calls
    (each window at most once per scheduled time)."""
    now = now or utcnow()
    hour, day = now + timedelta(hours=1), now + timedelta(hours=24)
    sent = 0
    rows = list(
        (
            await db.execute(
                select(Consultation)
                .where(
                    Consultation.status == ConsultationStatus.SCHEDULED,
                    Consultation.scheduled_at > now,
                    Consultation.scheduled_at <= day,
                    or_(
                        Consultation.reminder_24h_sent_at.is_(None),
                        Consultation.reminder_1h_sent_at.is_(None),
                    ),
                )
                .limit(500)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    for item in rows:
        window = _due_window(item.scheduled_at, item.reminder_24h_sent_at, item.reminder_1h_sent_at, hour)
        if window is None:
            continue
        item.reminder_24h_sent_at = item.reminder_24h_sent_at or now
        if window == "1h":
            item.reminder_1h_sent_at = now
        await publish(
            db,
            "consultation.reminder",
            {
                "consultation_id": str(item.id),
                "intro_consultation_id": None,
                "case_id": str(item.case_id),
                "kind": ConsultationKind(item.kind).value,
                "window": window,
                "scheduled_at": item.scheduled_at,
                "meeting_url": item.meeting_url,
            },
        )
        sent += 1
    intros = list(
        (
            await db.execute(
                select(IntroConsultation)
                .where(
                    IntroConsultation.status == ConsultationStatus.SCHEDULED,
                    IntroConsultation.scheduled_at > now,
                    IntroConsultation.scheduled_at <= day,
                    or_(
                        IntroConsultation.reminder_24h_sent_at.is_(None),
                        IntroConsultation.reminder_1h_sent_at.is_(None),
                    ),
                )
                .limit(500)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    for intro in intros:
        window = _due_window(intro.scheduled_at, intro.reminder_24h_sent_at, intro.reminder_1h_sent_at, hour)
        if window is None:
            continue
        intro.reminder_24h_sent_at = intro.reminder_24h_sent_at or now
        if window == "1h":
            intro.reminder_1h_sent_at = now
        await publish(
            db,
            "consultation.reminder",
            {
                "consultation_id": None,
                "intro_consultation_id": str(intro.id),
                "case_id": None,
                "kind": "free_intro",
                "window": window,
                "scheduled_at": intro.scheduled_at,
                "meeting_url": intro.meeting_url,
            },
        )
        sent += 1
    return sent


def _due_window(
    scheduled_at: datetime | None, sent_24h: datetime | None, sent_1h: datetime | None, hour: datetime
) -> str | None:
    if scheduled_at is None:
        return None
    if scheduled_at <= hour:
        return "1h" if sent_1h is None else None
    return "24h" if sent_24h is None else None
