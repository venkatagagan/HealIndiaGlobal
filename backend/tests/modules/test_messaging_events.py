"""Notifications and realtime pushes produced by domain events (PLAN 6.1, messaging subscriber side)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select

from app.core import realtime
from app.core.enums import CaseStatus, UserRole
from app.core.events import publish
from app.models import (
    Notification,
    Payment,
    Payout,
    Refund,
    Screening,
    SettlementBatch,
    SosAlert,
)
from app.models.sequences import next_number
from app.modules.messaging import handlers
from app.modules.messaging.outbox import drain_background
from tests.factories import create_booking, create_payment_order, create_quote, create_user
from tests.modules.messaging_helpers import build_case_world


@pytest.fixture
def pushed(monkeypatch: pytest.MonkeyPatch) -> list[tuple[list[str], str, Any]]:
    """Capture realtime deliveries (sent after commit)."""
    calls: list[tuple[list[str], str, Any]] = []

    async def fake_send_to_users(user_ids: list[Any], event_type: str, data: Any = None) -> None:
        calls.append(([str(u) for u in user_ids], event_type, data))

    monkeypatch.setattr(realtime, "send_to_users", fake_send_to_users)
    return calls


async def _notes(db, kind: str | None = None) -> list[Notification]:
    stmt = select(Notification).order_by(Notification.created_at)
    if kind is not None:
        stmt = stmt.where(Notification.kind == kind)
    return list((await db.execute(stmt)).scalars().all())


def _recipients(notes: list[Notification]) -> set:
    return {n.user_id for n in notes}


# ----------------------------------------------------------------------------------------------- onboarding
async def test_user_registered_welcome_and_email(db, run_jobs, email_outbox):
    user = await create_user(db, role="patient")
    await publish(db, "user.registered", {"user_id": str(user.id), "role": "patient"})
    await db.commit()
    await publish(db, "user.registered", {"user_id": str(user.id), "role": "patient"})
    await db.commit()
    notes = await _notes(db, "user.registered")
    assert len(notes) == 1 and notes[0].user_id == user.id
    assert notes[0].title == "Welcome to Heal India Global"

    assert await run_jobs() >= 1
    welcome = [m for m in email_outbox if m["subject"] == "Welcome to Heal India Global"]
    assert len(welcome) == 1 and welcome[0]["to"] == [user.email]
    assert "AI screening" in welcome[0]["text"]
    # The email job is idempotent.
    await run_jobs()
    assert len([m for m in email_outbox if m["subject"] == "Welcome to Heal India Global"]) == 1


async def test_guest_registration_gets_no_email(db, run_jobs, email_outbox):
    guest = await create_user(db, role="patient", email=None, is_guest=True)
    guest.email = None
    await db.commit()
    await publish(db, "user.registered", {"user_id": str(guest.id), "role": "patient"})
    await db.commit()
    assert len(await _notes(db, "user.registered")) == 1
    await run_jobs()
    assert email_outbox == []


async def test_agent_and_hospital_review_events(db):
    world = await build_case_world(db)
    await publish(db, "agent.approved", {"agent_id": str(world.agent.id)})
    await publish(db, "hospital.rejected", {"hospital_id": str(world.hospital.id), "reason": "Missing PAN"})
    await publish(db, "agent.rejected", {"agent_id": None})  # tolerated
    await publish(db, "hospital.approved", {"hospital_id": "not-a-uuid"})  # tolerated
    await db.commit()
    approved = await _notes(db, "agent.approved")
    assert _recipients(approved) == {world.agent_user.id}
    rejected = await _notes(db, "hospital.rejected")
    # Owner/admin members only (not the coordinator).
    assert _recipients(rejected) == {world.owner.id}
    assert "Missing PAN" in (rejected[0].body or "")


# ---------------------------------------------------------------------------------------- screening / cases
async def test_screening_completed_notifies_patient_and_agent(db, pushed):
    world = await build_case_world(db)
    screening = Screening(
        patient_id=world.patient.id,
        created_by_user_id=world.agent_user.id,
        status="completed",
        urgency="emergency",
        completed_at=datetime.now(UTC),
    )
    db.add(screening)
    await db.commit()
    await publish(
        db, "screening.completed", {"screening_id": str(screening.id), "patient_id": str(world.patient.id)}
    )
    await db.commit()
    await drain_background()
    notes = await _notes(db, "screening.completed")
    assert _recipients(notes) == {world.patient_user.id, world.agent_user.id}
    assert all("urgent" in n.title.lower() for n in notes)
    events = [p for p in pushed if p[1] == "screening.completed"]
    assert len(events) == 1
    assert set(events[0][0]) == {str(world.patient_user.id), str(world.agent_user.id)}
    assert events[0][2]["screening_id"] == str(screening.id)
    assert any(p[1] == "notification.created" for p in pushed)


async def test_realtime_is_discarded_on_rollback(db, pushed):
    world = await build_case_world(db)
    await publish(db, "agent.approved", {"agent_id": str(world.agent.id)})
    await db.rollback()
    await drain_background()
    assert pushed == []


async def test_quote_sent_and_accepted(db, pushed):
    world = await build_case_world(db)
    quote = await create_quote(db, world.case)
    await publish(db, "quote.sent", {"quote_id": str(quote.id), "case_id": str(world.case.id)})
    await db.commit()
    sent = await _notes(db, "quote.sent")
    assert _recipients(sent) == {world.patient_user.id, world.agent_user.id}
    assert world.hospital.name in sent[0].title
    assert "4,00,000.00" in (sent[0].body or "")

    await publish(db, "quote.accepted", {"quote_id": str(quote.id), "case_id": str(world.case.id)})
    await db.commit()
    await drain_background()
    accepted = await _notes(db, "quote.accepted")
    assert _recipients(accepted) == {world.owner.id, world.coordinator_member.id}
    case_updates = [p for p in pushed if p[1] == "case.updated"]
    assert len(case_updates) == 2
    assert str(world.patient_user.id) in case_updates[0][0] and str(world.owner.id) in case_updates[0][0]


async def test_case_status_changed_declined_and_cancelled(db, pushed):
    world = await build_case_world(db)
    world.case.status = CaseStatus.DECLINED
    await db.commit()
    payload = {"case_id": str(world.case.id), "from_status": "enquiry", "to_status": "declined"}
    await publish(db, "case.status_changed", payload)
    await publish(db, "case.status_changed", payload)
    await db.commit()
    await drain_background()
    declined = await _notes(db, "case.declined")
    assert _recipients(declined) == {world.patient_user.id, world.agent_user.id}
    assert len(declined) == 2
    assert [p[2]["to_status"] for p in pushed if p[1] == "case.updated"] == ["declined", "declined"]

    # Transitions covered by more specific events produce no generic notification.
    await publish(db, "case.status_changed", {**payload, "to_status": "quoted"})
    await db.commit()
    assert await _notes(db, "case.quoted") == []

    await publish(db, "case.status_changed", {**payload, "to_status": "cancelled", "note": "Changed plans"})
    await db.commit()
    cancelled = await _notes(db, "case.cancelled")
    assert world.owner.id in _recipients(cancelled)
    assert "Changed plans" in (cancelled[0].body or "")


# ------------------------------------------------------------------------------------------------- bookings
async def test_booking_lifecycle_notifications(db, pushed):
    world = await build_case_world(db, coordinator_user_id=None)
    support = await create_user(db, role="support")
    world.case.coordinator_user_id = support.id
    await db.commit()
    booking = await create_booking(db, world.case, status="confirmed")

    await publish(db, "booking.confirmed", {"booking_id": str(booking.id)})
    await db.commit()
    confirmed = await _notes(db, "booking.confirmed")
    assert _recipients(confirmed) == {
        world.patient_user.id,
        world.agent_user.id,
        world.owner.id,
        world.coordinator_member.id,
        support.id,
    }

    await publish(db, "booking.admitted", {"booking_id": str(booking.id)})
    await db.commit()
    assert _recipients(await _notes(db, "booking.admitted")) == {
        world.patient_user.id,
        world.agent_user.id,
        support.id,
    }

    # Direct handler calls for events with financial subscribers elsewhere.
    await handlers.on_booking_completed(db, {"booking_id": str(booking.id)})
    await db.commit()
    completed = await _notes(db, "booking.completed")
    assert world.patient_user.id in _recipients(completed)
    assert world.owner.id in _recipients(completed)  # owner is a finance-capable member
    assert world.coordinator_member.id not in _recipients(completed)

    await handlers.on_booking_cancelled(
        db, {"booking_id": str(booking.id), "refundable_minor": 40_000_00, "reason": "Patient request"}
    )
    await db.commit()
    await drain_background()
    cancelled = await _notes(db, "booking.cancelled")
    assert world.owner.id in _recipients(cancelled) and world.patient_user.id in _recipients(cancelled)
    assert "40,000.00" in (cancelled[0].body or "")
    assert any(p[1] == "booking.updated" and p[2]["booking_id"] == str(booking.id) for p in pushed)
    # Unknown booking ids are ignored.
    await handlers.on_booking_cancelled(db, {"booking_id": "0190a1b2-0000-7000-8000-000000000000"})


# --------------------------------------------------------------------------------------- payments & payouts
async def test_payment_captured_failed_and_refund(db):
    world = await build_case_world(db)
    booking = await create_booking(db, world.case)
    order = await create_payment_order(db, booking, payer_user_id=world.agent_user.id)
    payment = Payment(
        order_id=order.id,
        gateway="mock",
        gateway_payment_id="pay_test_1",
        method="mock",
        status="captured",
        amount_minor=order.amount_minor,
        currency=order.currency,
        base_amount_minor=order.amount_minor,
        captured_at=datetime.now(UTC),
    )
    db.add(payment)
    await db.commit()
    payload = {
        "payment_id": str(payment.id),
        "order_id": str(order.id),
        "booking_id": str(booking.id),
        "amount_minor": order.amount_minor,
        "currency": order.currency,
        "base_amount_minor": order.amount_minor,
    }
    await handlers.on_payment_captured(db, payload)
    await handlers.on_payment_captured(db, payload)
    await db.commit()
    captured = await _notes(db, "payment.captured")
    assert _recipients(captured) == {world.agent_user.id, world.patient_user.id}
    assert len(captured) == 2
    assert booking.booking_number in (captured[0].body or "")

    failed_order = await create_payment_order(db, booking, status="failed")
    await publish(db, "payment.failed", {"order_id": str(failed_order.id)})
    await db.commit()
    failed = await _notes(db, "payment.failed")
    assert _recipients(failed) == {world.patient_user.id}

    refund = Refund(
        payment_id=payment.id,
        order_id=order.id,
        booking_id=booking.id,
        amount_minor=10_000_00,
        currency="INR",
        base_amount_minor=10_000_00,
        reason="Cancellation",
        status="processed",
        requested_by=world.agent_user.id,
    )
    db.add(refund)
    await db.commit()
    await handlers.on_refund_processed(db, {"refund_id": str(refund.id), "payment_id": str(payment.id)})
    await db.commit()
    refunds = await _notes(db, "refund.processed")
    assert _recipients(refunds) == {world.agent_user.id, world.patient_user.id}
    assert "10,000.00" in (refunds[0].body or "")


async def test_payout_events_notify_payee_and_finance(db):
    world = await build_case_world(db)
    finance = await create_user(db, role="finance")
    maker = await create_user(db, role="finance")
    batch = SettlementBatch(
        batch_number=await next_number(db, "batch"),
        payee_type="agent",
        payee_id=world.agent.id,
        status="processing",
        created_by=maker.id,
    )
    db.add(batch)
    await db.flush()
    payout = Payout(
        batch_id=batch.id,
        payee_type="agent",
        payee_id=world.agent.id,
        amount_minor=25_000_00,
        currency="INR",
        method="mock",
        status="failed",
        failure_reason="Invalid IFSC",
    )
    hospital_payout = Payout(
        batch_id=batch.id,
        payee_type="hospital",
        payee_id=world.hospital.id,
        amount_minor=3_00_000_00,
        currency="INR",
        method="mock",
        status="processed",
        utr="UTR123",
    )
    db.add_all([payout, hospital_payout])
    await db.commit()

    await handlers.on_payout_failed(db, {"payout_id": str(payout.id)})
    await handlers.on_payout_processed(db, {"payout_id": str(hospital_payout.id)})
    await db.commit()
    failed = await _notes(db, "payout.failed")
    assert _recipients(failed) == {world.agent_user.id, finance.id, maker.id}
    assert all("Invalid IFSC" in (n.body or "") for n in failed)
    processed = await _notes(db, "payout.processed")
    assert _recipients(processed) == {world.owner.id}
    assert "UTR123" in (processed[0].body or "")


# ------------------------------------------------------------------------------------------------------ SOS
async def test_sos_created_notifies_coordinator_and_support(db, run_jobs, email_outbox):
    world = await build_case_world(db)
    coordinator = await create_user(db, role="support")
    other_support = await create_user(db, role="support")
    await create_user(db, role=UserRole.ADMIN)
    world.case.coordinator_user_id = coordinator.id
    await db.commit()
    alert = SosAlert(
        patient_id=world.patient.id, case_id=world.case.id, lat=28.6, lng=77.2, message="Severe pain"
    )
    db.add(alert)
    await db.commit()
    await publish(db, "sos.created", {"sos_id": str(alert.id), "patient_id": str(world.patient.id)})
    await db.commit()
    notes = await _notes(db, "sos.created")
    assert _recipients(notes) == {coordinator.id, other_support.id}
    assert len(notes) == 2
    assert world.patient.full_name in notes[0].title
    assert "Severe pain" in (notes[0].body or "")
    assert notes[0].data["sos_id"] == str(alert.id)
    await run_jobs()
    assert len([m for m in email_outbox if m["subject"].startswith("SOS alert")]) == 2

    # Without an alert row or case: coordinators of the patient's open cases + support.
    await publish(db, "sos.created", {"patient_id": str(world.patient.id), "lat": 1.0, "lng": 2.0})
    await db.commit()
    assert len(await _notes(db, "sos.created")) == 4


async def test_sos_updated_tells_the_patient(db):
    world = await build_case_world(db)
    responder = await create_user(db, role="support", full_name="Priya Raman")
    alert = SosAlert(patient_id=world.patient.id, case_id=world.case.id)
    db.add(alert)
    await db.commit()
    base = {
        "sos_id": str(alert.id),
        "patient_id": str(world.patient.id),
        "responder_user_id": str(responder.id),
    }

    for status in ("acknowledged", "acknowledged", "resolved"):  # repeated event: one notification only
        await publish(db, "sos.updated", {**base, "status": status})
        await db.commit()

    notes = await _notes(db, "sos.updated")
    assert _recipients(notes) == {world.patient.user_id}
    assert [n.data["status"] for n in notes] == ["acknowledged", "resolved"]
    assert notes[0].title == "Help is on the way" and "Priya Raman" in (notes[0].body or "")
    assert notes[1].title == "Your SOS has been closed"
    assert all(n.data["link"] == "/support" for n in notes)

    # Status changes the patient does not need to hear about are ignored.
    await publish(db, "sos.updated", {**base, "status": "open"})
    await db.commit()
    assert len(await _notes(db, "sos.updated")) == 2
