"""Phase-1 subscribers and periodic jobs: quote SLA, aftercare, consultation reminders, visa letters and the
guest intro call.

Imported by ``app.modules.cases.tasks`` (which ``load_module_hooks`` loads), so these ``@subscribe`` /
``@periodic`` decorators register in the API, the worker and the tests. Handlers only create in-app
notifications (``notify``; idempotent via ``dedupe_key``) - except ``booking.completed``, which creates the
aftercare plan in the discharge transaction.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.events import subscribe
from app.core.jobs import periodic
from app.i18n import Msg, MsgList
from app.models import AftercareCheckin, Case, Consultation, IntroConsultation, VisaRequest
from app.models.sequences import IST
from app.modules.cases.aftercare import (
    create_aftercare_plan,
    run_checkin_reminders,
    run_consultation_reminders,
)
from app.modules.cases.quick_quote import run_quote_sla
from app.modules.messaging import policies as mpolicies
from app.modules.messaging.notifications import notify_many

logger = structlog.get_logger(__name__)

OPS_ROLES = (UserRole.SUPPORT, UserRole.ADMIN)


def _uuid(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    value = payload.get(key)
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _when(value: Any) -> str:
    """``"12 Nov 2026, 10:30 IST"`` for an ISO timestamp / datetime (India time, as the hospitals use)."""
    try:
        dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return str(value or "")
    return dt.astimezone(IST).strftime("%d %b %Y, %H:%M IST")


def _stamp(value: datetime | None) -> str:
    return value.isoformat() if value else ""


async def _patient_side(db: AsyncSession, case: Case) -> list[uuid.UUID]:
    ids = [
        await mpolicies.patient_user_id(db, case.patient_id),
        await mpolicies.agent_user_id(db, case.agent_id),
    ]
    return [i for i in ids if i is not None]


async def _coordinators(db: AsyncSession, case: Case) -> list[uuid.UUID]:
    """The case coordinator, else the platform's support and admin users."""
    if case.coordinator_user_id:
        return [case.coordinator_user_id]
    return await mpolicies.staff_user_ids(db, OPS_ROLES)


# ------------------------------------------------------------------------------------------------ quote SLA
@periodic("cases.quote_sla", every_seconds=900)
async def quote_sla_job(db: AsyncSession, payload: dict[str, Any]) -> None:
    counts = await run_quote_sla(db)
    if any(counts.values()):
        logger.info("cases.quote_sla", **counts)


@subscribe("quote.reminder_due")
async def on_quote_reminder_due(db: AsyncSession, payload: dict[str, Any]) -> None:
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None:
        return
    hours = payload.get("hours_left")
    await notify_many(
        db,
        await mpolicies.hospital_member_user_ids(db, case.hospital_id),
        "quote.reminder_due",
        data={"case_id": str(case.id), "link": f"/cases/{case.id}"},
        title_key="notifications.quote_reminder_due.title",
        body_key="notifications.quote_reminder_due.body",
        params={"case_number": case.case_number, "hours": hours, "when": _when(payload.get("quote_due_at"))},
        dedupe_key=f"quote.reminder_due:{case.id}",
    )


@subscribe("quote.overdue")
async def on_quote_overdue(db: AsyncSession, payload: dict[str, Any]) -> None:
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None:
        return
    data = {"case_id": str(case.id), "link": f"/cases/{case.id}"}
    key = f"quote.overdue:{case.id}"
    prefix = "notifications.quote_overdue"
    params = {"case_number": case.case_number}
    await notify_many(
        db,
        await mpolicies.hospital_member_user_ids(db, case.hospital_id),
        "quote.overdue",
        data=data,
        dedupe_key=key,
        email=True,
        title_key=f"{prefix}.hospital_title",
        body_key=f"{prefix}.hospital_body",
        params=params,
    )
    await notify_many(
        db,
        await _coordinators(db, case),
        "quote.overdue",
        data=data,
        dedupe_key=key,
        title_key=f"{prefix}.coordinator_title",
        body_key=f"{prefix}.coordinator_body",
        params=params,
    )
    await notify_many(
        db,
        await _patient_side(db, case),
        "quote.overdue",
        data=data,
        dedupe_key=key,
        title_key=f"{prefix}.patient_title",
        body_key=f"{prefix}.patient_body",
        params=params,
    )


# ------------------------------------------------------------------------------------------------ aftercare
@subscribe("booking.completed")
async def on_discharge_plan_aftercare(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking_id = _uuid(payload, "booking_id")
    if booking_id is not None:
        await create_aftercare_plan(db, booking_id)


#: red flags of a check-in with a translated label (``notifications.aftercare_red_flag.flags.<flag>``)
RED_FLAGS: frozenset[str] = frozenset({"fever", "breathlessness", "severe_pain", "wound_concerns"})


def _red_flag_label(flag: str) -> Msg | str:
    if flag in RED_FLAGS:
        return Msg(f"notifications.aftercare_red_flag.flags.{flag}")
    return flag.replace("_", " ")


@subscribe("aftercare.red_flag")
async def on_aftercare_red_flag(db: AsyncSession, payload: dict[str, Any]) -> None:
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None:
        return
    flags = MsgList(tuple(_red_flag_label(str(f)) for f in payload.get("red_flags") or []))
    data = {"case_id": str(case.id), "checkin_id": payload.get("checkin_id"), "link": f"/cases/{case.id}"}
    key = f"aftercare.red_flag:{payload.get('checkin_id')}"
    prefix = "notifications.aftercare_red_flag"
    recipients = await mpolicies.hospital_member_user_ids(db, case.hospital_id)
    recipients += await _coordinators(db, case)
    await notify_many(
        db,
        recipients,
        "aftercare.red_flag",
        data=data,
        dedupe_key=key,
        email=True,
        title_key=f"{prefix}.title",
        body_key=f"{prefix}.body",
        params={"case_number": case.case_number, "flags": flags, "day": payload.get("day")},
    )
    await notify_many(
        db,
        await _patient_side(db, case),
        "aftercare.red_flag",
        data=data,
        dedupe_key=key,
        title_key=f"{prefix}.patient_title",
        body_key=f"{prefix}.patient_body",
    )


# ------------------------------------------------------------------------------------------------ reminders
@periodic("cases.consultation_reminders", every_seconds=300)
async def consultation_reminders_job(db: AsyncSession, payload: dict[str, Any]) -> None:
    sent = await run_consultation_reminders(db)
    if sent:
        logger.info("cases.consultation_reminders", sent=sent)


@subscribe("consultation.reminder")
async def on_consultation_reminder(db: AsyncSession, payload: dict[str, Any]) -> None:
    window = str(payload.get("window") or "")
    when = _when(payload.get("scheduled_at"))
    # "... starts in 1 hour" / "... starts tomorrow": one catalog key per window
    starts = "soon" if window == "1h" else "tomorrow"
    prefix = "notifications.consultation_reminder"
    consultation_id = _uuid(payload, "consultation_id")
    if consultation_id is not None:
        item = await db.get(Consultation, consultation_id)
        case = await db.get(Case, item.case_id) if item is not None else None
        if item is None or case is None:
            return
        key = f"consultation.reminder:{item.id}:{window}:{_stamp(item.scheduled_at)}"
        data = {"consultation_id": str(item.id), "case_id": str(case.id), "meeting_url": item.meeting_url}
        await notify_many(
            db,
            await _patient_side(db, case),
            "consultation.reminder",
            data=data,
            dedupe_key=key,
            title_key=f"{prefix}.patient_title_{starts}",
            body_key=f"{prefix}.patient_body",
            params={"when": when},
        )
        await notify_many(
            db,
            await mpolicies.hospital_member_user_ids(db, case.hospital_id),
            "consultation.reminder",
            data=data,
            dedupe_key=key,
            title_key=f"{prefix}.hospital_title_{starts}",
            body_key=f"{prefix}.hospital_body",
            params={"when": when, "case_number": case.case_number},
        )
        return
    intro_id = _uuid(payload, "intro_consultation_id")
    intro = await db.get(IntroConsultation, intro_id) if intro_id else None
    if intro is None:
        return
    key = f"consultation.reminder:intro:{intro.id}:{window}:{_stamp(intro.scheduled_at)}"
    data = {"intro_consultation_id": str(intro.id), "meeting_url": intro.meeting_url}
    await notify_many(
        db,
        [intro.user_id],
        "consultation.reminder",
        data=data,
        dedupe_key=key,
        title_key=f"{prefix}.intro_title_{starts}",
        body_key=f"{prefix}.intro_body",
        params={"when": when},
    )
    await notify_many(
        db,
        [intro.coordinator_user_id],
        "consultation.reminder",
        data=data,
        dedupe_key=key,
        title_key=f"{prefix}.coordinator_title_{starts}",
        body_key=f"{prefix}.coordinator_body",
        params={"when": when, "name": intro.full_name},
    )


# ------------------------------------------------------------------------------------ aftercare check-ins
@periodic("cases.aftercare_checkin_reminders", every_seconds=900)
async def aftercare_checkin_reminders_job(db: AsyncSession, payload: dict[str, Any]) -> None:
    sent = await run_checkin_reminders(db)
    if sent:
        logger.info("cases.aftercare_checkin_reminders", sent=sent)


@subscribe("aftercare.checkin_due")
async def on_aftercare_checkin_due(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Patient (+ agent): a recovery check-in is ready to answer. No health details in the text."""
    checkin_id = _uuid(payload, "checkin_id")
    checkin = await db.get(AftercareCheckin, checkin_id) if checkin_id else None
    case = await db.get(Case, checkin.case_id) if checkin is not None else None
    if checkin is None or case is None or checkin.submitted_at is not None:
        return
    await notify_many(
        db,
        await _patient_side(db, case),
        "aftercare.checkin_due",
        data={
            "case_id": str(case.id),
            "checkin_id": str(checkin.id),
            "day": checkin.day,
            "link": "/aftercare",
        },
        dedupe_key=f"aftercare.checkin_due:{checkin.id}",
        title_key="notifications.aftercare_checkin_due.title",
        body_key="notifications.aftercare_checkin_due.body",
        params={"day": checkin.day, "case_number": case.case_number},
    )


# ---------------------------------------------------------------------------------------------- visa letter
@subscribe("visa.invitation_issued")
async def on_visa_invitation_issued(db: AsyncSession, payload: dict[str, Any]) -> None:
    visa_id = _uuid(payload, "visa_request_id")
    visa = await db.get(VisaRequest, visa_id) if visa_id else None
    case = await db.get(Case, visa.case_id) if visa is not None else None
    if visa is None or case is None:
        return
    await notify_many(
        db,
        await _patient_side(db, case),
        "visa.invitation_issued",
        data={
            "case_id": str(case.id),
            "visa_request_id": str(visa.id),
            "document_id": payload.get("document_id"),
            "link": "/travel/visa",
        },
        title_key="notifications.visa_invitation_issued.title",
        body_key="notifications.visa_invitation_issued.body",
        dedupe_key=f"visa.invitation_issued:{visa.id}:{payload.get('document_id')}",
        email=True,
    )


# ----------------------------------------------------------------------------------------- guest intro call
@subscribe("intro_consultation.requested")
async def on_intro_requested(db: AsyncSession, payload: dict[str, Any]) -> None:
    intro_id = _uuid(payload, "intro_consultation_id")
    if intro_id is None:
        return
    await notify_many(
        db,
        await mpolicies.staff_user_ids(db, OPS_ROLES),
        "intro_consultation.requested",
        data={"intro_consultation_id": str(intro_id), "link": "/intro-consultations"},
        title_key="notifications.intro_requested.title",
        body_key="notifications.intro_requested.body",
        dedupe_key=f"intro_consultation.requested:{intro_id}",
    )


@subscribe("intro_consultation.scheduled")
async def on_intro_scheduled(db: AsyncSession, payload: dict[str, Any]) -> None:
    intro_id = _uuid(payload, "intro_consultation_id")
    intro = await db.get(IntroConsultation, intro_id) if intro_id else None
    if intro is None or intro.user_id is None:
        return
    await notify_many(
        db,
        [intro.user_id],
        "intro_consultation.scheduled",
        data={"intro_consultation_id": str(intro.id), "meeting_url": intro.meeting_url},
        title_key="notifications.intro_scheduled.title",
        body_key="notifications.intro_scheduled.body",
        params={"when": _when(intro.scheduled_at)},
        dedupe_key=f"intro_consultation.scheduled:{intro.id}:{_stamp(intro.scheduled_at)}",
    )
