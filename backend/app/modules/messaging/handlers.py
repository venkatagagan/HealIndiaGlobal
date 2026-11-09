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


async def _patient_name(db: AsyncSession, patient_id: uuid.UUID | None) -> str:
    if patient_id is None:
        return "the patient"
    p = await db.get(PatientProfile, patient_id)
    return (p.full_name if p is not None else "") or "the patient"


async def _hospital_name(db: AsyncSession, hospital_id: uuid.UUID | None) -> str:
    if hospital_id is None:
        return "the hospital"
    h = await db.get(Hospital, hospital_id)
    return h.name if h is not None else "the hospital"


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
        UserRole.PATIENT.value: (
            "Start with a free AI screening to get matched with accredited Indian hospitals and doctors, "
            "compare costs and request quotes."
        ),
        UserRole.AGENT.value: (
            "Complete your agency profile and upload your KYC documents. Once approved you can add patients, "
            "request quotes and track your commissions."
        ),
        UserRole.HOSPITAL.value: (
            "Complete your hospital profile, add doctors and procedures, upload KYC documents and submit for "
            "review to start receiving international enquiries."
        ),
    }
    body = bodies.get(role, "Your account is ready.")
    await notify(
        db,
        user.id,
        "user.registered",
        "Welcome to Heal India Global",
        body,
        {"link": "/"},
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
        f"{name} is now live",
        "Your hospital has been approved and is now visible to international patients.",
        {"hospital_id": str(hospital_id), "link": "/"},
        dedupe_key=f"hospital.approved:{hospital_id}",
    )


@subscribe("hospital.rejected")
async def on_hospital_rejected(db: AsyncSession, payload: dict[str, Any]) -> None:
    hospital_id = _uuid(payload, "hospital_id")
    if hospital_id is None:
        return
    name = await _hospital_name(db, hospital_id)
    reason = str(payload.get("reason") or "").strip()
    body = "Your hospital application was not approved."
    if reason:
        body += f" Reason: {reason}"
    body += " Please review your profile and documents and resubmit."
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, hospital_id, OWNER_ROLES),
        "hospital.rejected",
        f"{name}: application needs changes",
        body,
        {"hospital_id": str(hospital_id), "reason": reason or None, "link": "/onboarding"},
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
        "Your agency has been approved",
        f"{agent.agency_name} is approved. You can now add patients, request quotes and earn commissions.",
        {"agent_id": str(agent.id), "link": "/"},
        dedupe_key=f"agent.approved:{agent.id}",
    )


@subscribe("agent.rejected")
async def on_agent_rejected(db: AsyncSession, payload: dict[str, Any]) -> None:
    agent_id = _uuid(payload, "agent_id")
    agent = await db.get(Agent, agent_id) if agent_id else None
    if agent is None:
        return
    reason = str(payload.get("reason") or "").strip()
    body = f"The application for {agent.agency_name} was not approved."
    if reason:
        body += f" Reason: {reason}"
    await notify(
        db,
        agent.user_id,
        "agent.rejected",
        "Your agency application was not approved",
        body,
        {"agent_id": str(agent.id), "reason": reason or None, "link": "/profile"},
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
    if urgency == "emergency":
        title = "Important: please seek urgent medical care"
        body = (
            "Your answers suggest symptoms that may need immediate attention. Please contact your local "
            "emergency services or nearest hospital now rather than planning travel."
        )
    elif status == "failed":
        title = "We could not complete your screening"
        body = "Something went wrong while analysing your answers. Please try again or contact support."
    else:
        title = "Your screening results are ready"
        body = "We have matched you with hospitals and doctors for your condition. View your top matches."
    await notify_many(
        db,
        recipients,
        "screening.completed",
        title,
        body,
        {
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
        f"Urgent: possible emergency for {patient_name}",
        f"A screening for {patient_name} was flagged as a possible medical emergency. The patient has been "
        "told to seek local emergency care. Please contact them now.",
        {
            "screening_id": str(screening_id),
            "patient_id": str(patient_id) if patient_id else None,
            "link": f"/screenings/{screening_id}",
        },
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
        f"New enquiry {case.case_number}",
        f"{patient_name} has requested a treatment quote. Review the case and send a quote.",
        {"case_id": str(case.id), "case_number": case.case_number, "link": f"/cases/{case.id}"},
        dedupe_key=f"case.created:{case.id}",
    )
    await _push_case_updated(db, case)


_CASE_STATUS_TEXT: dict[str, tuple[str, str]] = {
    CaseStatus.CANCELLED.value: ("Case {num} cancelled", "Case {num} has been cancelled."),
    CaseStatus.DECLINED.value: (
        "Case {num} declined by the hospital",
        "{hospital} is unable to take case {num}. Your coordinator can help you find another hospital.",
    ),
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
    title = text[0].format(num=case.case_number, hospital=hospital)
    body = text[1].format(num=case.case_number, hospital=hospital)
    note = str(payload.get("note") or "").strip()
    if note:
        body += f" Note: {note}"
    recipients = await _patient_side(db, case) + await _coordinator(case)
    if to_status == CaseStatus.CANCELLED.value:
        recipients += await _hospital_side(db, case)
    await notify_many(
        db,
        recipients,
        f"case.{to_status}",
        title,
        body,
        {
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
    amount = f" for {_money(quote.total_minor, quote.currency)}" if quote is not None else ""
    valid = f" valid until {quote.valid_until.isoformat()}" if quote is not None and quote.valid_until else ""
    await notify_many(
        db,
        await _patient_side(db, case),
        "quote.sent",
        f"New quote from {hospital}",
        f"{hospital} sent a treatment quote{amount} for case {case.case_number}{valid}. "
        "Review and accept it.",
        {"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"},
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
    amount = f" ({_money(quote.total_minor, quote.currency)})" if quote is not None else ""
    await notify_many(
        db,
        await _hospital_side(db, case) + await _coordinator(case),
        "quote.accepted",
        f"Quote accepted for {case.case_number}",
        f"{patient_name} accepted your quote{amount}. The booking and payment will follow.",
        {"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"},
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
    admission = f" Admission: {booking.admission_date.isoformat()}." if booking.admission_date else ""
    data = {"booking_id": str(booking.id), "case_id": str(booking.case_id), "link": f"/bookings/{booking.id}"}
    patient_side = await _patient_side(db, case) if case else []
    await notify_many(
        db,
        patient_side,
        "booking.confirmed",
        f"Booking {booking.booking_number} confirmed",
        f"Your treatment at {hospital} is confirmed.{admission} Next: visa, flights and accommodation.",
        data,
        dedupe_key=f"booking.confirmed:{booking.id}",
    )
    patient_name = await _patient_name(db, booking.patient_id)
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, booking.hospital_id)
        + (await _coordinator(case) if case else []),
        "booking.confirmed",
        f"New confirmed booking {booking.booking_number}",
        f"{patient_name}'s booking is confirmed (deposit received).{admission}",
        data,
        dedupe_key=f"booking.confirmed:{booking.id}",
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
        f"Admitted at {hospital}",
        f"Admission for booking {booking.booking_number} is confirmed. "
        "Wishing you a smooth treatment and recovery.",
        {"booking_id": str(booking.id), "case_id": str(booking.case_id), "link": f"/bookings/{booking.id}"},
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
        "Treatment completed",
        f"Your treatment at {hospital} (booking {booking.booking_number}) is complete. "
        "We wish you a speedy recovery - please share a review of your experience.",
        data,
        dedupe_key=f"booking.completed:{booking.id}",
    )
    await notify_many(
        db,
        await policies.hospital_member_user_ids(db, booking.hospital_id, FINANCE_MEMBER_ROLES),
        "booking.completed",
        f"Booking {booking.booking_number} completed",
        "The patient has been discharged. The settlement for this booking will be scheduled "
        "after the hold period.",
        data,
        dedupe_key=f"booking.completed:{booking.id}",
        email=False,
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
    body = f"Booking {booking.booking_number} has been cancelled."
    if reason:
        body += f" Reason: {reason}."
    if isinstance(refundable, int | float) and int(refundable) > 0:
        refund_text = _money(int(refundable), booking.currency)
        body += f" A refund of {refund_text} will be processed to the original payment method."
    recipients = (await _patient_side(db, case) + await _coordinator(case)) if case else []
    recipients += await policies.hospital_member_user_ids(db, booking.hospital_id)
    await notify_many(
        db,
        recipients,
        "booking.cancelled",
        f"Booking {booking.booking_number} cancelled",
        body,
        {
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
    what = f" for booking {booking.booking_number}" if booking is not None else ""
    amount_text = _money(amount, currency) if amount is not None else "your payment"
    await notify_many(
        db,
        recipients,
        "payment.captured",
        "Payment received",
        f"We received {amount_text}{what}. Thank you - a receipt is available in your account.",
        {
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
        "Payment failed",
        f"Your payment of {_money(order.amount_minor, order.currency)} (order {order.order_number}) "
        "did not go "
        "through. No money was taken; please try again or choose another payment method.",
        {
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
    what = f" for booking {booking.booking_number}" if booking is not None else ""
    await notify_many(
        db,
        recipients,
        "refund.processed",
        "Refund processed",
        f"A refund of {_money(refund.amount_minor, refund.currency)}{what} has been processed. "
        "It may take 5-10 business days to appear on your statement.",
        {
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
    utr = f" (UTR {payout.utr})" if payout.utr else ""
    await notify_many(
        db,
        await _payee_user_ids(db, _status(payout.payee_type), payout.payee_id),
        "payout.processed",
        "Payout sent",
        f"A payout of {_money(payout.amount_minor, payout.currency)} has been sent to your bank "
        f"account{utr}.",
        {
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
    await notify_many(
        db,
        await _payee_user_ids(db, _status(payout.payee_type), payout.payee_id),
        "payout.failed",
        "Payout failed",
        f"Your payout of {amount} could not be completed{': ' + reason if reason else ''}. "
        "Please check your payout account details; our finance team will retry.",
        {**data, "link": "/finance"},
        dedupe_key=f"payout.failed:{payout.id}",
    )
    await notify_many(
        db,
        await policies.staff_user_ids(db, [UserRole.FINANCE]),
        "payout.failed",
        "Payout failed",
        f"Payout {payout.id} of {amount} to {_status(payout.payee_type)} "
        f"failed{': ' + reason if reason else ''}.",
        {**data, "link": f"/finance/settlements/batches/{payout.batch_id}"},
        dedupe_key=f"payout.failed:{payout.id}",
        email=False,
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
    location = (
        f" Location: {lat:.5f}, {lng:.5f}."
        if isinstance(lat, int | float) and isinstance(lng, int | float)
        else ""
    )
    await notify_many(
        db,
        recipients,
        "sos.created",
        f"SOS alert from {patient_name}",
        f"{patient_name} raised an emergency alert.{location}{' Message: ' + message if message else ''} "
        "Please respond immediately.",
        {
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
    if status == "acknowledged":
        who = (
            f"{responder.full_name} from our support team"
            if responder and responder.full_name
            else "Our support team"
        )
        title = "Help is on the way"
        body = f"{who} has seen your SOS and is handling it. Keep your phone with you."
    else:
        title = "Your SOS has been closed"
        body = (
            "Our support team marked your emergency alert as resolved. "
            "If you still need help, send a new SOS or call the 24/7 helpline."
        )
    await notify(
        db,
        patient_user,
        "sos.updated",
        title,
        body,
        {"sos_id": str(sos_id), "status": status, "link": "/support"},
        dedupe_key=f"sos.updated:{sos_id}:{status}",
    )


# ------------------------------------------------------------------------------- journey gaps (CG-30)
def _without(ids: list[uuid.UUID], exclude: uuid.UUID | None) -> list[uuid.UUID]:
    return [i for i in ids if i != exclude]


def _when(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.astimezone(UTC).strftime("%d %b %Y, %H:%M UTC")


_TRAVEL_ITEM_LABELS: dict[str, str] = {
    "visa": "Your medical visa",
    "accommodation": "Your accommodation booking",
}
_TRAVEL_KIND_LABELS: dict[str, str] = {
    "flight": "Your flight booking",
    "airport_pickup": "Your airport pickup",
    "airport_drop": "Your airport drop-off",
    "local_transport": "Your local transport booking",
    "translator": "Your translator booking",
    "local_guide": "Your local guide booking",
    "transport": "Your transport booking",
    "travel_agent": "Your travel agent booking",
    "insurance": "Your travel insurance",
}
_TRAVEL_STATUS_TEXT: dict[str, str] = {
    "documents_pending": "needs documents from you",
    "invitation_issued": "has an invitation letter from the hospital",
    "applied": "application has been submitted",
    "approved": "has been approved",
    "rejected": "was not approved. Your coordinator will help you with next steps",
    "quoted": "has a price quote ready for you to review",
    "confirmed": "is confirmed",
    "completed": "is complete",
    "cancelled": "has been cancelled",
}


@subscribe("travel.status_changed")
async def on_travel_status_changed(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Visa, flight, hotel, airport pickup and other travel items: tell the patient (and their agent)."""
    case_id = _uuid(payload, "case_id")
    item_id = _uuid(payload, "item_id")
    case = await db.get(Case, case_id) if case_id else None
    to_status = str(payload.get("to_status") or "")
    if case is None or item_id is None or to_status not in _TRAVEL_STATUS_TEXT:
        return
    item_type = str(payload.get("item_type") or "")
    kind = str(payload.get("kind") or "")
    label = _TRAVEL_ITEM_LABELS.get(item_type) or _TRAVEL_KIND_LABELS.get(kind) or "Your travel arrangement"
    status_text = _TRAVEL_STATUS_TEXT[to_status]
    if item_type == "visa" and to_status == "applied":
        body = f"{label} application has been submitted for case {case.case_number}."
    else:
        body = f"{label} {status_text} (case {case.case_number})."
    await notify_many(
        db,
        _without(await _patient_side(db, case), _uuid(payload, "actor_user_id")),
        "travel.status_changed",
        f"Travel update for case {case.case_number}",
        body,
        {
            "case_id": str(case.id),
            "item_type": item_type,
            "item_id": str(item_id),
            "status": to_status,
            "link": f"/cases/{case.id}",
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


async def _consultation_notify(
    db: AsyncSession, payload: dict[str, Any], kind: str, title: str, body: str, key_suffix: str
) -> None:
    consultation, case = await _consultation_context(db, payload)
    if consultation is None or case is None:
        return
    recipients = await _patient_side(db, case) + await _hospital_side(db, case) + await _coordinator(case)
    doctor = await db.get(Doctor, consultation.doctor_id)
    doctor_name = doctor.full_name if doctor is not None and doctor.full_name else "the doctor"
    when = _when(consultation.scheduled_at)
    await notify_many(
        db,
        _without(recipients, _uuid(payload, "actor_user_id")),
        kind,
        title.format(num=case.case_number),
        body.format(doctor=doctor_name, when=when, num=case.case_number),
        {
            "case_id": str(case.id),
            "consultation_id": str(consultation.id),
            "scheduled_at": consultation.scheduled_at.isoformat() if consultation.scheduled_at else None,
            "link": f"/cases/{case.id}",
        },
        dedupe_key=f"{kind}:{consultation.id}:{key_suffix}",
    )


@subscribe("consultation.scheduled")
async def on_consultation_scheduled(db: AsyncSession, payload: dict[str, Any]) -> None:
    await _consultation_notify(
        db,
        payload,
        "consultation.scheduled",
        "Consultation scheduled for case {num}",
        "Your tele-consultation with {doctor} is scheduled for {when}. The joining link is in the case.",
        str(payload.get("scheduled_at") or ""),
    )


@subscribe("consultation.rescheduled")
async def on_consultation_rescheduled(db: AsyncSession, payload: dict[str, Any]) -> None:
    await _consultation_notify(
        db,
        payload,
        "consultation.rescheduled",
        "Consultation changed for case {num}",
        "Your tele-consultation with {doctor} has changed. New time: {when}. Check the case for the "
        "current joining link.",
        str(payload.get("scheduled_at") or ""),
    )


@subscribe("consultation.cancelled")
async def on_consultation_cancelled(db: AsyncSession, payload: dict[str, Any]) -> None:
    await _consultation_notify(
        db,
        payload,
        "consultation.cancelled",
        "Consultation cancelled for case {num}",
        "The tele-consultation with {doctor} for case {num} has been cancelled. You can request a new one "
        "from the case.",
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
    name = coordinator.full_name or "A coordinator"
    await notify_many(
        db,
        await _patient_side(db, case),
        "case.coordinator_assigned",
        f"Your coordinator for case {case.case_number}",
        f"{name} from Heal India Global is now your care coordinator. Message them from the case any time.",
        data,
        dedupe_key=f"case.coordinator_assigned:{case.id}:{coordinator.id}",
    )
    patient_name = await _patient_name(db, case.patient_id)
    await notify(
        db,
        coordinator.id,
        "case.coordinator_assigned",
        f"You are coordinating case {case.case_number}",
        f"You have been assigned as the coordinator for {patient_name} (case {case.case_number}).",
        data,
        dedupe_key=f"case.coordinator_assigned:{case.id}:{coordinator.id}",
        email=False,
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
    body = f"{patient_name} declined your quote for case {case.case_number}."
    if reason:
        body += f" Reason: {reason}"
    body += " You can send a revised quote."
    await notify_many(
        db,
        await _hospital_side(db, case) + await _coordinator(case),
        "quote.rejected",
        f"Quote declined for {case.case_number}",
        body,
        {"case_id": str(case.id), "quote_id": str(quote_id), "link": f"/cases/{case.id}"},
        dedupe_key=f"quote.rejected:{quote_id}",
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
    await notify_many(
        db,
        await _hospital_side(db, case),
        "quote.expired",
        f"Quote expired for {case.case_number}",
        f"Your quote for case {case.case_number} passed its validity date without being accepted. "
        "Send a new quote if the patient still needs treatment.",
        data,
        dedupe_key=f"quote.expired:{quote_id}",
    )
    await notify_many(
        db,
        await _patient_side(db, case),
        "quote.expired",
        f"Your quote from {hospital} has expired",
        f"The quote for case {case.case_number} is no longer valid. Ask the hospital or your coordinator "
        "for a new quote.",
        data,
        dedupe_key=f"quote.expired:{quote_id}",
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
    when = "today" if days_left == 0 else f"on {installment.due_date.isoformat()}"
    await notify_many(
        db,
        await _installment_recipients(db, booking, case),
        "installment.due",
        "Payment reminder",
        f"Instalment {installment.seq} of {amount} for booking {booking.booking_number} is due {when}.",
        {
            "installment_id": str(installment.id),
            "booking_id": str(booking.id),
            "due_date": installment.due_date.isoformat(),
            "link": f"/pay/{booking.id}",
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
        "Payment overdue",
        f"Instalment {installment.seq} of {amount} for booking {booking.booking_number} was due on "
        f"{installment.due_date.isoformat()} and is still unpaid. Please pay it or talk to your coordinator.",
        {
            "installment_id": str(installment.id),
            "booking_id": str(booking.id),
            "due_date": installment.due_date.isoformat(),
            "link": f"/pay/{booking.id}",
        },
        dedupe_key=f"installment.overdue:{installment.id}:{payload.get('day') or ''}",
    )


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
        f"Settlement batch {batch.batch_number} needs approval",
        f"A {_status(batch.payee_type)} settlement batch of {batch.items_count} items "
        f"({_money(batch.total_net_minor, batch.currency)} net) is waiting for a second approver.",
        {"batch_id": str(batch.id), "link": f"/finance/settlements/batches/{batch.id}"},
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
    if not preview and message.attachment_document_ids:
        preview = "Sent an attachment"
    title = f"New message from {sender_name}"
    data = {
        "conversation_id": str(conversation.id),
        "case_id": str(conversation.case_id) if conversation.case_id else None,
        "message_id": str(message.id),
        "link": f"/messages/{conversation.id}",
    }
    for uid in others:
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
            existing.body = preview
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
            preview,
            data,
            dedupe_key=f"message.created:{message.id}",
            email=False,
        )
