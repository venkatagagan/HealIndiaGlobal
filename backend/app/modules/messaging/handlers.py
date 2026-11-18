"""Domain-event subscribers of the messaging module (PLAN 6.1).

Every handler is idempotent (notifications carry a per-event ``dedupe_key``), never commits, never calls
external systems inline (emails go through the ``messaging.send_email`` job, websocket pushes are queued until
the publisher commits) and tolerates missing optional data.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import CaseStatus, HospitalMemberRole, PayeeType, UserRole
from app.core.events import subscribe
from app.core.money import format_minor
from app.i18n import Msg, recipient_locale, t
from app.i18n import runtime as i18n_runtime
from app.models import (
    Agent,
    Booking,
    Case,
    Consultation,
    Conversation,
    ConversationParticipant,
    Doctor,
    Hospital,
    Installment,
    Message,
    Notification,
    PatientProfile,
    Payment,
    PaymentOrder,
    Payout,
    Quote,
    Refund,
    Screening,
    SettlementBatch,
    SosAlert,
    User,
)
from app.modules.messaging import policies
from app.modules.messaging.notifications import notification_out, notify, notify_many
from app.modules.messaging.outbox import queue_realtime
from app.modules.messaging.service import ensure_case_conversation, message_out

logger = structlog.get_logger(__name__)

OWNER_ROLES = (HospitalMemberRole.OWNER.value, HospitalMemberRole.ADMIN.value)
FINANCE_MEMBER_ROLES = (*OWNER_ROLES, HospitalMemberRole.FINANCE.value)


# -------------------------------------------------------------------------------------------------- helpers
def _uuid(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    value = payload.get(key)
    if value in (None, ""):
        return None
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except (TypeError, ValueError):
        logger.warning("messaging.bad_event_id", key=key)
        return None


def _money(amount: Any, currency: Any) -> str:
    try:
        return format_minor(int(amount), str(currency or "INR"))
    except Exception:
        return f"{amount} {currency or ''}".strip()


def _status(value: Any) -> str:
    return str(getattr(value, "value", value) or "")


THE_PATIENT = Msg("common.the_patient")
THE_HOSPITAL = Msg("common.the_hospital")


async def _patient_name(db: AsyncSession, patient_id: uuid.UUID | None) -> str | Msg:
    """The patient's name, else "the patient" in the recipient's language (only as a ``params`` value)."""
    if patient_id is None:
        return THE_PATIENT
    p = await db.get(PatientProfile, patient_id)
    return (p.full_name if p is not None else "") or THE_PATIENT


async def _hospital_name(db: AsyncSession, hospital_id: uuid.UUID | None) -> str | Msg:
    """The hospital's name, else "the hospital" in the recipient's language (only as a ``params`` value)."""
    if hospital_id is None:
        return THE_HOSPITAL
    h = await db.get(Hospital, hospital_id)
    return h.name if h is not None else THE_HOSPITAL


async def _patient_side(db: AsyncSession, case: Case) -> list[uuid.UUID]:
    """Patient user + agent user of a case."""
    ids = [
        await policies.patient_user_id(db, case.patient_id),
        await policies.agent_user_id(db, case.agent_id),
    ]
    return [i for i in ids if i is not None]


async def _hospital_side(db: AsyncSession, case: Case) -> list[uuid.UUID]:
    return await policies.hospital_member_user_ids(db, case.hospital_id)


async def _coordinator(case: Case) -> list[uuid.UUID]:
    return [case.coordinator_user_id] if case.coordinator_user_id else []


async def _push_case_updated(db: AsyncSession, case: Case, extra: dict[str, Any] | None = None) -> None:
    parties = await policies.case_party_user_ids(db, case)
    data = {"case_id": str(case.id), "status": _status(case.status), **(extra or {})}
    queue_realtime(db, parties, "case.updated", data)


async def _push_booking_updated(db: AsyncSession, booking: Booking, case: Case | None) -> None:
    data = {"booking_id": str(booking.id), "status": _status(booking.status), "case_id": str(booking.case_id)}
    if case is not None:
        parties = await policies.case_party_user_ids(db, case)
    else:
        pu = await policies.patient_user_id(db, booking.patient_id)
        parties = [pu] if pu else []
        parties += await policies.hospital_member_user_ids(db, booking.hospital_id)
    queue_realtime(db, parties, "booking.updated", data)


async def _load_booking(db: AsyncSession, payload: dict[str, Any]) -> tuple[Booking | None, Case | None]:
    booking_id = _uuid(payload, "booking_id")
    if booking_id is None:
        return None, None
    booking = await db.get(Booking, booking_id)
    if booking is None:
        return None, None
    return booking, await db.get(Case, booking.case_id)


# ------------------------------------------------------------------------------------ identity / onboarding
@subscribe("user.registered")
async def on_user_registered(db: AsyncSession, payload: dict[str, Any]) -> None:
    user_id = _uuid(payload, "user_id")
    if user_id is None:
        return
    user = await db.get(User, user_id)
    if user is None:
        return
    role = policies.role_of(user)
    bodies = {
        UserRole.PATIENT.value: "notifications.user_registered.body_patient",
        UserRole.AGENT.value: "notifications.user_registered.body_agent",
        UserRole.HOSPITAL.value: "notifications.user_registered.body_hospital",
    }
    await notify(
        db,
        user.id,
        "user.registered",
        data={"link": "/"},
        title_key="notifications.user_registered.title",
        body_key=bodies.get(role, "notifications.user_registered.body_default"),
        dedupe_key=f"user.registered:{user.id}",
        email=not user.is_guest,
    )


@subscribe("hospital.approved")
async def on_hospital_approved(db: AsyncSession, payload: dict[str, Any]) -> None:
    hospital_id = _uuid(payload, "hospital_id")
    if hospital_id is None:
        return
    name = await _hospital_name(db, hospital_id)
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, hospital_id, OWNER_ROLES),
        "hospital.approved",
        data={"hospital_id": str(hospital_id), "link": "/"},
        title_key="notifications.hospital_approved.title",
        body_key="notifications.hospital_approved.body",
        params={"hospital": name},
        dedupe_key=f"hospital.approved:{hospital_id}",
    )


@subscribe("hospital.rejected")
async def on_hospital_rejected(db: AsyncSession, payload: dict[str, Any]) -> None:
    hospital_id = _uuid(payload, "hospital_id")
    if hospital_id is None:
        return
    name = await _hospital_name(db, hospital_id)
    reason = str(payload.get("reason") or "").strip()
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, hospital_id, OWNER_ROLES),
        "hospital.rejected",
        data={"hospital_id": str(hospital_id), "reason": reason or None, "link": "/onboarding"},
        title_key="notifications.hospital_rejected.title",
        body_key=[
            "notifications.hospital_rejected.body",
            "common.reason" if reason else None,
            "notifications.hospital_rejected.resubmit",
        ],
        params={"hospital": name, "reason": reason},
        dedupe_key=f"hospital.rejected:{hospital_id}:{reason[:60]}",
    )


@subscribe("agent.approved")
async def on_agent_approved(db: AsyncSession, payload: dict[str, Any]) -> None:
    agent_id = _uuid(payload, "agent_id")
    agent = await db.get(Agent, agent_id) if agent_id else None
    if agent is None:
        return
    await notify(
        db,
        agent.user_id,
        "agent.approved",
        data={"agent_id": str(agent.id), "link": "/"},
        title_key="notifications.agent_approved.title",
        body_key="notifications.agent_approved.body",
        params={"agency": agent.agency_name},
        dedupe_key=f"agent.approved:{agent.id}",
    )


@subscribe("agent.rejected")
async def on_agent_rejected(db: AsyncSession, payload: dict[str, Any]) -> None:
    agent_id = _uuid(payload, "agent_id")
    agent = await db.get(Agent, agent_id) if agent_id else None
    if agent is None:
        return
    reason = str(payload.get("reason") or "").strip()
    await notify(
        db,
        agent.user_id,
        "agent.rejected",
        data={"agent_id": str(agent.id), "reason": reason or None, "link": "/profile"},
        title_key="notifications.agent_rejected.title",
        body_key=["notifications.agent_rejected.body", "common.reason" if reason else None],
        params={"agency": agent.agency_name, "reason": reason},
        dedupe_key=f"agent.rejected:{agent.id}:{reason[:60]}",
    )


# ------------------------------------------------------------------------------------------------ screening
@subscribe("screening.completed")
async def on_screening_completed(db: AsyncSession, payload: dict[str, Any]) -> None:
    screening_id = _uuid(payload, "screening_id")
    screening = await db.get(Screening, screening_id) if screening_id else None
    patient_id = _uuid(payload, "patient_id") or (screening.patient_id if screening else None)
    if screening_id is None:
        return
    recipients: list[uuid.UUID] = []
    pu = await policies.patient_user_id(db, patient_id)
    if pu is not None:
        recipients.append(pu)
    if (
        screening is not None
        and screening.created_by_user_id
        and screening.created_by_user_id not in recipients
    ):
        recipients.append(screening.created_by_user_id)
    status = _status(screening.status) if screening is not None else "completed"
    urgency = _status(screening.urgency) if screening is not None and screening.urgency else None
    queue_realtime(
        db,
        recipients,
        "screening.completed",
        {
            "screening_id": str(screening_id),
            "patient_id": str(patient_id) if patient_id else None,
            "status": status,
        },
    )
    variant = "emergency" if urgency == "emergency" else "failed" if status == "failed" else "ready"
    await notify_many(
        db,
        recipients,
        "screening.completed",
        title_key=f"notifications.screening.{variant}_title",
        body_key=f"notifications.screening.{variant}_body",
        data={
            "screening_id": str(screening_id),
            "patient_id": str(patient_id) if patient_id else None,
            "urgency": urgency,
            "link": f"/screening/{screening_id}/matches",
        },
        dedupe_key=f"screening.completed:{screening_id}:{status}",
    )
    if urgency == "emergency" and status == "completed":
        await _alert_support_of_emergency(db, screening_id, patient_id)


async def _alert_support_of_emergency(
    db: AsyncSession, screening_id: uuid.UUID, patient_id: uuid.UUID | None
) -> None:
    """A screening flagged as a possible emergency: support (and the patient's coordinators) must reach out at
    once (CG-05/CG-30). The patient is told separately to seek local emergency care."""
    recipients = await policies.staff_user_ids(db, [UserRole.SUPPORT])
    if patient_id is not None:
        coordinators = (
            await db.execute(
                select(Case.coordinator_user_id).where(
                    Case.patient_id == patient_id,
                    Case.coordinator_user_id.is_not(None),
                    Case.status.notin_([CaseStatus.COMPLETED, CaseStatus.CANCELLED, CaseStatus.DECLINED]),
                )
            )
        ).scalars()
        recipients.extend(c for c in coordinators if c)
    patient_name = await _patient_name(db, patient_id)
    await notify_many(
        db,
        recipients,
        "screening.emergency",
        data={
            "screening_id": str(screening_id),
            "patient_id": str(patient_id) if patient_id else None,
            "link": f"/screenings/{screening_id}",
        },
        title_key="notifications.screening_emergency_staff.title",
        body_key="notifications.screening_emergency_staff.body",
        params={"patient": patient_name},
        dedupe_key=f"screening.emergency:{screening_id}",
        email=True,
    )


# ------------------------------------------------------------------------------------------- cases & quotes
@subscribe("case.created")
async def on_case_created(db: AsyncSession, payload: dict[str, Any]) -> None:
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None:
        return
    await ensure_case_conversation(db, case.id)
    patient_name = await _patient_name(db, case.patient_id)
    await notify_many(
        db,
        await _hospital_side(db, case),
        "case.created",
        data={"case_id": str(case.id), "case_number": case.case_number, "link": f"/cases/{case.id}"},
        title_key="notifications.case_created.title",
        body_key="notifications.case_created.body",
        params={"case_number": case.case_number, "patient": patient_name},
        dedupe_key=f"case.created:{case.id}",
    )
    await _push_case_updated(db, case)


#: catalog prefix (``<prefix>.title`` / ``<prefix>.body``) of the case transitions notified here
_CASE_STATUS_TEXT: dict[str, str] = {
    CaseStatus.CANCELLED.value: "notifications.case_cancelled",
    CaseStatus.DECLINED.value: "notifications.case_declined",
}


@subscribe("case.status_changed")
async def on_case_status_changed(db: AsyncSession, payload: dict[str, Any]) -> None:
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None:
        return
    to_status = str(payload.get("to_status") or _status(case.status))
    # Keep the conversation's participants in sync (coordinator assignment, new members...).
    await ensure_case_conversation(db, case.id)
    await _push_case_updated(db, case, {"from_status": payload.get("from_status"), "to_status": to_status})
    text = _CASE_STATUS_TEXT.get(to_status)
    if text is None:
        # Other transitions are covered by more specific events (quote.*, booking.*).
        return
    hospital = await _hospital_name(db, case.hospital_id)
    note = str(payload.get("note") or "").strip()
    recipients = await _patient_side(db, case) + await _coordinator(case)
    if to_status == CaseStatus.CANCELLED.value:
        recipients += await _hospital_side(db, case)
    await notify_many(
        db,
        recipients,
        f"case.{to_status}",
        title_key=f"{text}.title",
        body_key=[f"{text}.body", "common.note" if note else None],
        params={"case_number": case.case_number, "hospital": hospital, "note": note},
        data={
            "case_id": str(case.id),
            "case_number": case.case_number,
            "status": to_status,
            "link": f"/cases/{case.id}",
        },
        dedupe_key=f"case.status_changed:{case.id}:{to_status}",
    )


@subscribe("quote.sent")
async def on_quote_sent(db: AsyncSession, payload: dict[str, Any]) -> None:
    quote_id = _uuid(payload, "quote_id")
    quote = await db.get(Quote, quote_id) if quote_id else None
    case_id = _uuid(payload, "case_id") or (quote.case_id if quote else None)
    case = await db.get(Case, case_id) if case_id else None
    if case is None or quote_id is None:
        return
    hospital = await _hospital_name(db, quote.hospital_id if quote else case.hospital_id)
    amount = _money(quote.total_minor, quote.currency) if quote is not None else ""
    valid = quote.valid_until.isoformat() if quote is not None and quote.valid_until else ""
    await notify_many(
        db,
        await _patient_side(db, case),
        "quote.sent",
        data={"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"},
        title_key="notifications.quote_sent.title",
        body_key=[
            "notifications.quote_sent.body",
            "notifications.quote_sent.amount" if amount else None,
            "notifications.quote_sent.valid_until" if valid else None,
            "notifications.quote_sent.cta",
        ],
        params={"hospital": hospital, "case_number": case.case_number, "amount": amount, "date": valid},
        dedupe_key=f"quote.sent:{quote_id}",
    )
    await _push_case_updated(db, case, {"quote_id": str(quote_id)})


@subscribe("quote.accepted")
async def on_quote_accepted(db: AsyncSession, payload: dict[str, Any]) -> None:
    quote_id = _uuid(payload, "quote_id")
    quote = await db.get(Quote, quote_id) if quote_id else None
    case_id = _uuid(payload, "case_id") or (quote.case_id if quote else None)
    case = await db.get(Case, case_id) if case_id else None
    if case is None or quote_id is None:
        return
    patient_name = await _patient_name(db, case.patient_id)
    amount = _money(quote.total_minor, quote.currency) if quote is not None else ""
    await notify_many(
        db,
        await _hospital_side(db, case) + await _coordinator(case),
        "quote.accepted",
        data={"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"},
        title_key="notifications.quote_accepted.title",
        body_key=[
            "notifications.quote_accepted.body",
            "notifications.quote_accepted.amount" if amount else None,
            "notifications.quote_accepted.next",
        ],
        params={"case_number": case.case_number, "patient": patient_name, "amount": amount},
        dedupe_key=f"quote.accepted:{quote_id}",
    )
    await _push_case_updated(db, case, {"quote_id": str(quote_id)})


# ------------------------------------------------------------------------------------------------- bookings
@subscribe("booking.confirmed")
async def on_booking_confirmed(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking, case = await _load_booking(db, payload)
    if booking is None:
        return
    hospital = await _hospital_name(db, booking.hospital_id)
    admission = booking.admission_date.isoformat() if booking.admission_date else ""
    admission_key = "notifications.booking_confirmed.admission" if admission else None
    data = {"booking_id": str(booking.id), "case_id": str(booking.case_id), "link": f"/bookings/{booking.id}"}
    patient_side = await _patient_side(db, case) if case else []
    patient_name = await _patient_name(db, booking.patient_id)
    params = {
        "booking_number": booking.booking_number,
        "hospital": hospital,
        "patient": patient_name,
        "date": admission,
    }
    await notify_many(
        db,
        patient_side,
        "booking.confirmed",
        data=data,
        dedupe_key=f"booking.confirmed:{booking.id}",
        title_key="notifications.booking_confirmed.title",
        body_key=[
            "notifications.booking_confirmed.body",
            admission_key,
            "notifications.booking_confirmed.next",
        ],
        params=params,
    )
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, booking.hospital_id)
        + (await _coordinator(case) if case else []),
        "booking.confirmed",
        data=data,
        dedupe_key=f"booking.confirmed:{booking.id}",
        title_key="notifications.booking_confirmed.hospital_title",
        body_key=["notifications.booking_confirmed.hospital_body", admission_key],
        params=params,
    )
    await _push_booking_updated(db, booking, case)
    if case is not None:
        await _push_case_updated(db, case)


@subscribe("booking.admitted")
async def on_booking_admitted(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking, case = await _load_booking(db, payload)
    if booking is None:
        return
    hospital = await _hospital_name(db, booking.hospital_id)
    recipients = (await _patient_side(db, case) + await _coordinator(case)) if case else []
    await notify_many(
        db,
        recipients,
        "booking.admitted",
        data={
            "booking_id": str(booking.id),
            "case_id": str(booking.case_id),
            "link": f"/bookings/{booking.id}",
        },
        title_key="notifications.booking_admitted.title",
        body_key="notifications.booking_admitted.body",
        params={"hospital": hospital, "booking_number": booking.booking_number},
        dedupe_key=f"booking.admitted:{booking.id}",
    )
    await _push_booking_updated(db, booking, case)
    if case is not None:
        await _push_case_updated(db, case)


@subscribe("booking.completed")
async def on_booking_completed(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking, case = await _load_booking(db, payload)
    if booking is None:
        return
    hospital = await _hospital_name(db, booking.hospital_id)
    data = {"booking_id": str(booking.id), "case_id": str(booking.case_id), "link": f"/bookings/{booking.id}"}
    await notify_many(
        db,
        (await _patient_side(db, case) + await _coordinator(case)) if case else [],
        "booking.completed",
        data=data,
        dedupe_key=f"booking.completed:{booking.id}",
        title_key="notifications.booking_completed.title",
        body_key="notifications.booking_completed.body",
        params={"hospital": hospital, "booking_number": booking.booking_number},
    )
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, booking.hospital_id, FINANCE_MEMBER_ROLES),
        "booking.completed",
        data=data,
        dedupe_key=f"booking.completed:{booking.id}",
        email=False,
        title_key="notifications.booking_completed.hospital_title",
        body_key="notifications.booking_completed.hospital_body",
        params={"booking_number": booking.booking_number},
    )
    await _push_booking_updated(db, booking, case)
    if case is not None:
        await _push_case_updated(db, case)


@subscribe("booking.cancelled")
async def on_booking_cancelled(db: AsyncSession, payload: dict[str, Any]) -> None:
    booking, case = await _load_booking(db, payload)
    if booking is None:
        return
    reason = str(payload.get("reason") or "").strip()
    refundable = payload.get("refundable_minor")
    refund_text = (
        _money(int(refundable), booking.currency)
        if isinstance(refundable, int | float) and int(refundable) > 0
        else ""
    )
    recipients = (await _patient_side(db, case) + await _coordinator(case)) if case else []
    recipients += await policies.hospital_member_user_ids(db, booking.hospital_id)
    await notify_many(
        db,
        recipients,
        "booking.cancelled",
        title_key="notifications.booking_cancelled.title",
        body_key=[
            "notifications.booking_cancelled.body",
            "common.reason" if reason else None,
            "notifications.booking_cancelled.refund" if refund_text else None,
        ],
        params={"booking_number": booking.booking_number, "reason": reason, "amount": refund_text},
        data={
            "booking_id": str(booking.id),
            "case_id": str(booking.case_id),
            "refundable_minor": int(refundable) if isinstance(refundable, int | float) else None,
            "currency": booking.currency,
            "link": f"/bookings/{booking.id}",
        },
        dedupe_key=f"booking.cancelled:{booking.id}",
    )
    await _push_booking_updated(db, booking, case)
    if case is not None:
        await _push_case_updated(db, case)


# ------------------------------------------------------------------------------------------------- payments
@subscribe("payment.captured")
async def on_payment_captured(db: AsyncSession, payload: dict[str, Any]) -> None:
    payment_id = _uuid(payload, "payment_id")
    order_id = _uuid(payload, "order_id")
    payment = await db.get(Payment, payment_id) if payment_id else None
    if order_id is None and payment is not None:
        order_id = payment.order_id
    order = await db.get(PaymentOrder, order_id) if order_id else None
    amount = payload.get("amount_minor", payment.amount_minor if payment else None)
    currency = payload.get("currency", payment.currency if payment else None)
    key = payment_id or order_id
    if key is None:
        return
    booking_id = _uuid(payload, "booking_id") or (order.booking_id if order else None)
    booking = await db.get(Booking, booking_id) if booking_id else None
    case = await db.get(Case, booking.case_id) if booking else None
    recipients: list[uuid.UUID] = []
    if order is not None:
        recipients.append(order.payer_user_id)
        pu = await policies.patient_user_id(db, order.patient_id)
        if pu:
            recipients.append(pu)
    if case is not None:
        recipients += await _patient_side(db, case)
    if amount is None:
        received = "notifications.payment_captured.body_no_amount"
    elif booking is not None:
        received = "notifications.payment_captured.body_booking"
    else:
        received = "notifications.payment_captured.body"
    await notify_many(
        db,
        recipients,
        "payment.captured",
        title_key="notifications.payment_captured.title",
        body_key=[received, "notifications.payment_captured.thanks"],
        params={
            "amount": _money(amount, currency) if amount is not None else "",
            "booking_number": booking.booking_number if booking is not None else "",
        },
        data={
            "payment_id": str(payment_id) if payment_id else None,
            "order_id": str(order_id) if order_id else None,
            "booking_id": str(booking_id) if booking_id else None,
            "amount_minor": int(amount) if isinstance(amount, int | float) else None,
            "currency": currency,
            "link": f"/bookings/{booking_id}" if booking_id else "/payments",
        },
        dedupe_key=f"payment.captured:{key}",
    )
    if booking is not None:
        await _push_booking_updated(db, booking, case)


@subscribe("payment.failed")
async def on_payment_failed(db: AsyncSession, payload: dict[str, Any]) -> None:
    order_id = _uuid(payload, "order_id")
    order = await db.get(PaymentOrder, order_id) if order_id else None
    if order is None:
        return
    await notify(
        db,
        order.payer_user_id,
        "payment.failed",
        title_key="notifications.payment_failed.title",
        body_key="notifications.payment_failed.body",
        params={"amount": _money(order.amount_minor, order.currency), "order_number": order.order_number},
        data={
            "order_id": str(order.id),
            "booking_id": str(order.booking_id) if order.booking_id else None,
            "link": f"/pay/{order.booking_id}" if order.booking_id else "/payments",
        },
        dedupe_key=f"payment.failed:{order.id}",
    )


@subscribe("refund.processed")
async def on_refund_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    refund_id = _uuid(payload, "refund_id")
    refund = await db.get(Refund, refund_id) if refund_id else None
    if refund is None:
        return
    order = await db.get(PaymentOrder, refund.order_id)
    booking_id = _uuid(payload, "booking_id") or refund.booking_id
    booking = await db.get(Booking, booking_id) if booking_id else None
    case = await db.get(Case, booking.case_id) if booking else None
    recipients: list[uuid.UUID] = []
    if order is not None:
        recipients.append(order.payer_user_id)
        pu = await policies.patient_user_id(db, order.patient_id)
        if pu:
            recipients.append(pu)
    if case is not None:
        recipients += await _patient_side(db, case)
    await notify_many(
        db,
        recipients,
        "refund.processed",
        title_key="notifications.refund_processed.title",
        body_key=[
            "notifications.refund_processed.body_booking"
            if booking is not None
            else "notifications.refund_processed.body",
            "notifications.refund_processed.timing",
        ],
        params={
            "amount": _money(refund.amount_minor, refund.currency),
            "booking_number": booking.booking_number if booking is not None else "",
        },
        data={
            "refund_id": str(refund.id),
            "booking_id": str(booking_id) if booking_id else None,
            "amount_minor": refund.amount_minor,
            "currency": refund.currency,
            "link": f"/bookings/{booking_id}" if booking_id else "/payments",
        },
        dedupe_key=f"refund.processed:{refund.id}",
    )
    if booking is not None:
        await _push_booking_updated(db, booking, case)


async def _payee_user_ids(db: AsyncSession, payee_type: str, payee_id: uuid.UUID) -> list[uuid.UUID]:
    if payee_type == PayeeType.HOSPITAL.value:
        return await policies.hospital_member_user_ids(db, payee_id, FINANCE_MEMBER_ROLES)
    if payee_type == PayeeType.AGENT.value:
        au = await policies.agent_user_id(db, payee_id)
        return [au] if au else []
    return []


@subscribe("payout.processed")
async def on_payout_processed(db: AsyncSession, payload: dict[str, Any]) -> None:
    payout_id = _uuid(payload, "payout_id")
    payout = await db.get(Payout, payout_id) if payout_id else None
    if payout is None:
        return
    await notify_many(
        db,
        await _payee_user_ids(db, _status(payout.payee_type), payout.payee_id),
        "payout.processed",
        title_key="notifications.payout_processed.title",
        body_key=[
            "notifications.payout_processed.body",
            "notifications.payout_processed.utr" if payout.utr else None,
        ],
        params={"amount": _money(payout.amount_minor, payout.currency), "utr": payout.utr or ""},
        data={
            "payout_id": str(payout.id),
            "amount_minor": payout.amount_minor,
            "currency": payout.currency,
            "link": "/finance",
        },
        dedupe_key=f"payout.processed:{payout.id}",
    )


@subscribe("payout.failed")
async def on_payout_failed(db: AsyncSession, payload: dict[str, Any]) -> None:
    payout_id = _uuid(payload, "payout_id")
    payout = await db.get(Payout, payout_id) if payout_id else None
    if payout is None:
        return
    reason = (payout.failure_reason or "").strip()
    amount = _money(payout.amount_minor, payout.currency)
    data = {"payout_id": str(payout.id), "amount_minor": payout.amount_minor, "currency": payout.currency}
    params = {
        "amount": amount,
        "reason": reason,
        "payout_id": str(payout.id),
        "payee_type": _status(payout.payee_type),
    }
    reason_key = "common.reason" if reason else None
    await notify_many(
        db,
        await _payee_user_ids(db, _status(payout.payee_type), payout.payee_id),
        "payout.failed",
        data={**data, "link": "/finance"},
        dedupe_key=f"payout.failed:{payout.id}",
        title_key="notifications.payout_failed.title",
        body_key=["notifications.payout_failed.body", reason_key, "notifications.payout_failed.next"],
        params=params,
    )
    await notify_many(
        db,
        await policies.staff_user_ids(db, [UserRole.FINANCE]),
        "payout.failed",
        data={**data, "link": f"/finance/settlements/batches/{payout.batch_id}"},
        dedupe_key=f"payout.failed:{payout.id}",
        email=False,
        title_key="notifications.payout_failed.title",
        body_key=["notifications.payout_failed.staff_body", reason_key],
        params=params,
    )


# -------------------------------------------------------------------------------------------------- support
@subscribe("sos.created")
async def on_sos_created(db: AsyncSession, payload: dict[str, Any]) -> None:
    sos_id = _uuid(payload, "sos_id") or _uuid(payload, "id")
    alert = await db.get(SosAlert, sos_id) if sos_id else None
    patient_id = _uuid(payload, "patient_id") or (alert.patient_id if alert else None)
    case_id = _uuid(payload, "case_id") or (alert.case_id if alert else None)
    key = sos_id or patient_id
    if key is None:
        return
    lat = alert.lat if alert is not None else payload.get("lat")
    lng = alert.lng if alert is not None else payload.get("lng")
    message = (alert.message if alert is not None else payload.get("message")) or ""
    recipients: list[uuid.UUID] = []
    if case_id is not None:
        case = await db.get(Case, case_id)
        if case is not None and case.coordinator_user_id:
            recipients.append(case.coordinator_user_id)
    elif patient_id is not None:
        coordinators = (
            await db.execute(
                select(Case.coordinator_user_id).where(
                    Case.patient_id == patient_id,
                    Case.coordinator_user_id.is_not(None),
                    Case.status.notin_([CaseStatus.COMPLETED, CaseStatus.CANCELLED, CaseStatus.DECLINED]),
                )
            )
        ).scalars()
        recipients.extend(c for c in coordinators if c)
    explicit_coordinator = _uuid(payload, "coordinator_user_id")
    if explicit_coordinator is not None:
        recipients.append(explicit_coordinator)
    recipients += await policies.staff_user_ids(db, [UserRole.SUPPORT])
    patient_name = await _patient_name(db, patient_id)
    has_location = isinstance(lat, int | float) and isinstance(lng, int | float)
    await notify_many(
        db,
        recipients,
        "sos.created",
        title_key="notifications.sos_created.title",
        body_key=[
            "notifications.sos_created.body",
            "notifications.sos_created.location" if has_location else None,
            "common.message" if message else None,
            "notifications.sos_created.cta",
        ],
        params={
            "patient": patient_name,
            "lat": f"{lat:.5f}" if has_location else "",
            "lng": f"{lng:.5f}" if has_location else "",
            "message": message,
        },
        data={
            "sos_id": str(sos_id) if sos_id else None,
            "patient_id": str(patient_id) if patient_id else None,
            "case_id": str(case_id) if case_id else None,
            "lat": lat,
            "lng": lng,
            "link": "/travel/sos",
        },
        dedupe_key=f"sos.created:{key}",
    )


@subscribe("sos.updated")
async def on_sos_updated(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Tell the patient that support has picked up their SOS, and when it is closed (USER_JOURNEYS §7)."""
    sos_id = _uuid(payload, "sos_id")
    patient_id = _uuid(payload, "patient_id")
    status = payload.get("status")
    if sos_id is None or patient_id is None or status not in ("acknowledged", "resolved"):
        return
    patient_user = (
        await db.execute(select(PatientProfile.user_id).where(PatientProfile.id == patient_id))
    ).scalar_one_or_none()
    if patient_user is None:
        return
    responder_id = _uuid(payload, "responder_user_id")
    responder = await db.get(User, responder_id) if responder_id else None
    named = responder is not None and bool(responder.full_name)
    if status == "acknowledged":
        title_key = "notifications.sos_updated.acknowledged_title"
        body_key = f"notifications.sos_updated.acknowledged_body{'_named' if named else ''}"
    else:
        title_key = "notifications.sos_updated.resolved_title"
        body_key = "notifications.sos_updated.resolved_body"
    await notify(
        db,
        patient_user,
        "sos.updated",
        data={"sos_id": str(sos_id), "status": status, "link": "/support"},
        title_key=title_key,
        body_key=body_key,
        params={"name": responder.full_name if responder is not None and named else ""},
        dedupe_key=f"sos.updated:{sos_id}:{status}",
    )


# ------------------------------------------------------------------------------- journey gaps (CG-30)
def _without(ids: list[uuid.UUID], exclude: uuid.UUID | None) -> list[uuid.UUID]:
    return [i for i in ids if i != exclude]


def _when(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(UTC).strftime("%d %b %Y, %H:%M UTC")


#: travel item types / service kinds with their own label (``notifications.travel_status.items.<name>``)
_TRAVEL_ITEM_TYPES: frozenset[str] = frozenset({"visa", "accommodation"})
_TRAVEL_KINDS: frozenset[str] = frozenset(
    {
        "flight",
        "airport_pickup",
        "airport_drop",
        "local_transport",
        "translator",
        "local_guide",
        "transport",
        "travel_agent",
        "insurance",
    }
)
#: statuses notified (``notifications.travel_status.statuses.<status>``)
_TRAVEL_STATUSES: frozenset[str] = frozenset(
    {
        "documents_pending",
        "invitation_issued",
        "applied",
        "approved",
        "rejected",
        "quoted",
        "confirmed",
        "completed",
        "cancelled",
    }
)


@subscribe("travel.status_changed")
async def on_travel_status_changed(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Visa, flight, hotel, airport pickup and other travel items: tell the patient (and their agent)."""
    case_id = _uuid(payload, "case_id")
    item_id = _uuid(payload, "item_id")
    case = await db.get(Case, case_id) if case_id else None
    to_status = str(payload.get("to_status") or "")
    if case is None or item_id is None or to_status not in _TRAVEL_STATUSES:
        return
    item_type = str(payload.get("item_type") or "")
    kind = str(payload.get("kind") or "")
    if item_type in _TRAVEL_ITEM_TYPES:
        item = item_type
    elif kind in _TRAVEL_KINDS:
        item = kind
    else:
        item = "other"
    prefix = "notifications.travel_status"
    visa_applied = item_type == "visa" and to_status == "applied"
    await notify_many(
        db,
        _without(await _patient_side(db, case), _uuid(payload, "actor_user_id")),
        "travel.status_changed",
        data={
            "case_id": str(case.id),
            "item_type": item_type,
            "item_id": str(item_id),
            "status": to_status,
            "link": f"/cases/{case.id}",
        },
        title_key=f"{prefix}.title",
        body_key=f"{prefix}.visa_applied_body" if visa_applied else f"{prefix}.body",
        params={
            "case_number": case.case_number,
            "item": Msg(f"{prefix}.items.{item}"),
            "status": Msg(f"{prefix}.statuses.{to_status}"),
        },
        dedupe_key=f"travel.status_changed:{item_id}:{to_status}",
    )


async def _consultation_context(
    db: AsyncSession, payload: dict[str, Any]
) -> tuple[Consultation | None, Case | None]:
    consultation_id = _uuid(payload, "consultation_id")
    consultation = await db.get(Consultation, consultation_id) if consultation_id else None
    if consultation is None:
        return None, None
    return consultation, await db.get(Case, consultation.case_id)


async def _consultation_notify(db: AsyncSession, payload: dict[str, Any], kind: str, key_suffix: str) -> None:
    """``kind`` ``consultation.<x>``: text from ``notifications.consultation_<x>.title`` / ``.body``."""
    consultation, case = await _consultation_context(db, payload)
    if consultation is None or case is None:
        return
    recipients = await _patient_side(db, case) + await _hospital_side(db, case) + await _coordinator(case)
    doctor = await db.get(Doctor, consultation.doctor_id)
    doctor_name = doctor.full_name if doctor is not None and doctor.full_name else Msg("common.the_doctor")
    when = _when(consultation.scheduled_at)
    prefix = f"notifications.{kind.replace('.', '_')}"
    await notify_many(
        db,
        _without(recipients, _uuid(payload, "actor_user_id")),
        kind,
        data={
            "case_id": str(case.id),
            "consultation_id": str(consultation.id),
            "scheduled_at": consultation.scheduled_at.isoformat() if consultation.scheduled_at else None,
            "link": f"/cases/{case.id}",
        },
        title_key=f"{prefix}.title",
        body_key=f"{prefix}.body",
        params={"doctor": doctor_name, "when": when, "num": case.case_number},
        dedupe_key=f"{kind}:{consultation.id}:{key_suffix}",
    )


@subscribe("consultation.scheduled")
async def on_consultation_scheduled(db: AsyncSession, payload: dict[str, Any]) -> None:
    await _consultation_notify(
        db,
        payload,
        "consultation.scheduled",
        str(payload.get("scheduled_at") or ""),
    )


@subscribe("consultation.rescheduled")
async def on_consultation_rescheduled(db: AsyncSession, payload: dict[str, Any]) -> None:
    await _consultation_notify(
        db,
        payload,
        "consultation.rescheduled",
        str(payload.get("scheduled_at") or ""),
    )


@subscribe("consultation.cancelled")
async def on_consultation_cancelled(db: AsyncSession, payload: dict[str, Any]) -> None:
    await _consultation_notify(
        db,
        payload,
        "consultation.cancelled",
        "cancelled",
    )


@subscribe("case.coordinator_assigned")
async def on_case_coordinator_assigned(db: AsyncSession, payload: dict[str, Any]) -> None:
    case_id = _uuid(payload, "case_id")
    coordinator_id = _uuid(payload, "coordinator_user_id")
    case = await db.get(Case, case_id) if case_id else None
    coordinator = await db.get(User, coordinator_id) if coordinator_id else None
    if case is None or coordinator is None:
        return
    # Add the coordinator to the case conversation.
    await ensure_case_conversation(db, case.id)
    data = {"case_id": str(case.id), "coordinator_user_id": str(coordinator.id), "link": f"/cases/{case.id}"}
    name = coordinator.full_name or Msg("common.a_coordinator")
    prefix = "notifications.coordinator_assigned"
    await notify_many(
        db,
        await _patient_side(db, case),
        "case.coordinator_assigned",
        data=data,
        dedupe_key=f"case.coordinator_assigned:{case.id}:{coordinator.id}",
        title_key=f"{prefix}.title",
        body_key=f"{prefix}.body",
        params={"case_number": case.case_number, "name": name},
    )
    patient_name = await _patient_name(db, case.patient_id)
    await notify(
        db,
        coordinator.id,
        "case.coordinator_assigned",
        data=data,
        dedupe_key=f"case.coordinator_assigned:{case.id}:{coordinator.id}",
        email=False,
        title_key=f"{prefix}.coordinator_title",
        body_key=f"{prefix}.coordinator_body",
        params={"case_number": case.case_number, "patient": patient_name},
    )


@subscribe("quote.rejected")
async def on_quote_rejected(db: AsyncSession, payload: dict[str, Any]) -> None:
    quote_id = _uuid(payload, "quote_id")
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None or quote_id is None:
        return
    patient_name = await _patient_name(db, case.patient_id)
    reason = str(payload.get("reason") or "").strip()
    prefix = "notifications.quote_rejected"
    await notify_many(
        db,
        await _hospital_side(db, case) + await _coordinator(case),
        "quote.rejected",
        data={"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"},
        dedupe_key=f"quote.rejected:{quote_id}",
        title_key=f"{prefix}.title",
        body_key=[f"{prefix}.body", f"{prefix}.reason" if reason else None, f"{prefix}.next"],
        params={"case_number": case.case_number, "patient": patient_name, "reason": reason},
    )


@subscribe("quote.expired")
async def on_quote_expired(db: AsyncSession, payload: dict[str, Any]) -> None:
    quote_id = _uuid(payload, "quote_id")
    case_id = _uuid(payload, "case_id")
    case = await db.get(Case, case_id) if case_id else None
    if case is None or quote_id is None:
        return
    hospital = await _hospital_name(db, case.hospital_id)
    data = {"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"}
    prefix = "notifications.quote_expired"
    params = {"case_number": case.case_number, "hospital": hospital}
    await notify_many(
        db,
        await _hospital_side(db, case),
        "quote.expired",
        data=data,
        dedupe_key=f"quote.expired:{quote_id}",
        title_key=f"{prefix}.hospital_title",
        body_key=f"{prefix}.hospital_body",
        params=params,
    )
    await notify_many(
        db,
        await _patient_side(db, case),
        "quote.expired",
        data=data,
        dedupe_key=f"quote.expired:{quote_id}",
        title_key=f"{prefix}.title",
        body_key=f"{prefix}.body",
        params=params,
    )


async def _installment_context(
    db: AsyncSession, payload: dict[str, Any]
) -> tuple[Installment | None, Booking | None, Case | None]:
    installment_id = _uuid(payload, "installment_id")
    installment = await db.get(Installment, installment_id) if installment_id else None
    if installment is None:
        return None, None, None
    booking = await db.get(Booking, installment.booking_id)
    case = await db.get(Case, booking.case_id) if booking is not None else None
    return installment, booking, case


async def _installment_recipients(db: AsyncSession, booking: Booking, case: Case | None) -> list[uuid.UUID]:
    if case is not None:
        return await _patient_side(db, case)
    pu = await policies.patient_user_id(db, booking.patient_id)
    return [pu] if pu else []


@subscribe("installment.due")
async def on_installment_due(db: AsyncSession, payload: dict[str, Any]) -> None:
    installment, booking, case = await _installment_context(db, payload)
    if installment is None or booking is None or _status(installment.status) != "due":
        return
    amount = _money(installment.amount_minor, installment.currency)
    days_left = payload.get("days_left")
    prefix = "notifications.installment_due"
    await notify_many(
        db,
        await _installment_recipients(db, booking, case),
        "installment.due",
        data={
            "installment_id": str(installment.id),
            "booking_id": str(booking.id),
            "due_date": installment.due_date.isoformat(),
            "link": f"/pay/{booking.id}",
        },
        title_key=f"{prefix}.title",
        body_key=f"{prefix}.body_today" if days_left == 0 else f"{prefix}.body_date",
        params={
            "seq": installment.seq,
            "amount": amount,
            "booking_number": booking.booking_number,
            "date": installment.due_date.isoformat(),
        },
        dedupe_key=f"installment.due:{installment.id}:{payload.get('day') or ''}",
    )


@subscribe("installment.overdue")
async def on_installment_overdue(db: AsyncSession, payload: dict[str, Any]) -> None:
    installment, booking, case = await _installment_context(db, payload)
    if installment is None or booking is None or _status(installment.status) not in ("due", "overdue"):
        return
    amount = _money(installment.amount_minor, installment.currency)
    await notify_many(
        db,
        await _installment_recipients(db, booking, case),
        "installment.overdue",
        data={
            "installment_id": str(installment.id),
            "booking_id": str(booking.id),
            "due_date": installment.due_date.isoformat(),
            "link": f"/pay/{booking.id}",
        },
        title_key="notifications.installment_overdue.title",
        body_key="notifications.installment_overdue.body",
        params={
            "seq": installment.seq,
            "amount": amount,
            "booking_number": booking.booking_number,
            "date": installment.due_date.isoformat(),
        },
        dedupe_key=f"installment.overdue:{installment.id}:{payload.get('day') or ''}",
    )


def _payee_label(payee_type: str) -> str | Msg:
    return Msg(f"common.payee.{payee_type}") if payee_type in {p.value for p in PayeeType} else payee_type


@subscribe("settlement_batch.pending_approval")
async def on_settlement_batch_pending_approval(db: AsyncSession, payload: dict[str, Any]) -> None:
    batch_id = _uuid(payload, "batch_id")
    batch = await db.get(SettlementBatch, batch_id) if batch_id else None
    if batch is None:
        return
    # Maker-checker: the user who generated the batch cannot approve it, so they are not asked to.
    approvers = _without(await policies.staff_user_ids(db, [UserRole.FINANCE]), batch.created_by)
    await notify_many(
        db,
        approvers,
        "settlement_batch.pending_approval",
        data={"batch_id": str(batch.id), "link": f"/finance/settlements/batches/{batch.id}"},
        title_key="notifications.settlement_batch_pending.title",
        body_key="notifications.settlement_batch_pending.body",
        params={
            "batch_number": batch.batch_number,
            "payee_type": _payee_label(_status(batch.payee_type)),
            "count": batch.items_count,
            "amount": _money(batch.total_net_minor, batch.currency),
        },
        dedupe_key=f"settlement_batch.pending_approval:{batch.id}",
        email=True,
    )


# ------------------------------------------------------------------------------------------------- messages
@subscribe("message.created")
async def on_message_created(db: AsyncSession, payload: dict[str, Any]) -> None:
    message_id = _uuid(payload, "message_id")
    message = await db.get(Message, message_id) if message_id else None
    if message is None:
        return
    conversation = await db.get(Conversation, message.conversation_id)
    if conversation is None:
        return
    sender = await db.get(User, message.sender_user_id) if message.sender_user_id else None
    participant_ids = list(
        (
            await db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation.id
                )
            )
        )
        .scalars()
        .all()
    )
    others = [uid for uid in participant_ids if uid != message.sender_user_id]
    if not others:
        return
    queue_realtime(db, others, "message.created", message_out(message, sender).model_dump(mode="json"))
    sender_name = (sender.full_name if sender else "") or "Heal India Global"
    preview = message.body if len(message.body) <= 140 else message.body[:137] + "..."
    attachment_only = not preview and bool(message.attachment_document_ids)
    await i18n_runtime.ensure_fresh()
    data = {
        "conversation_id": str(conversation.id),
        "case_id": str(conversation.case_id) if conversation.case_id else None,
        "message_id": str(message.id),
        "link": f"/messages/{conversation.id}",
    }
    for uid in others:
        # Rendered in each recipient's language.
        locale = recipient_locale(await db.get(User, uid))
        title = t("notifications.message_created.title", locale, sender=sender_name)
        body = t("notifications.message_created.attachment", locale) if attachment_only else preview
        # Collapse: one unread message notification per conversation per user.
        existing = (
            await db.execute(
                select(Notification)
                .where(
                    Notification.user_id == uid,
                    Notification.kind == "message.created",
                    Notification.read_at.is_(None),
                    Notification.data["conversation_id"].astext == str(conversation.id),
                )
                .order_by(Notification.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is not None:
            if (existing.data or {}).get("message_id") == str(message.id):
                continue
            existing.title = title
            existing.body = body
            existing.data = {**(existing.data or {}), **{k: v for k, v in data.items() if v is not None}}
            await db.flush()
            queue_realtime(
                db, [uid], "notification.created", notification_out(existing).model_dump(mode="json")
            )
            continue
        await notify(
            db,
            uid,
            "message.created",
            title,
            body,
            data,
            dedupe_key=f"message.created:{message.id}",
            email=False,
        )
