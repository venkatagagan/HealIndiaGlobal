"""Bookings: package bookings, availability capacity, cancellation refund math, refunds, payments in other
currencies, checklist/itinerary and consultations."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.core.enums import RefundStatus
from app.core.events import publish
from app.models import AvailabilitySlot, Booking, Case, Payment, Refund
from app.modules.cases.bookings import refund_pct_for
from app.modules.cases.common import today_ist
from tests.factories import create_booking, create_case, create_doctor, create_quote, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    add_hospital_member,
    capture_payment,
    event_log_fixture,
    future,
    make_world,
    reload,
)

API = "/api/v1"


async def _accepted_case(db: Any, world: Any, **fields: Any) -> Case:
    case = await create_case(
        db, world.patient, world.hospital, status="accepted", doctor_id=world.doctor.id, **fields
    )
    await create_quote(db, case, status="accepted", accepted_at=datetime.now(UTC))
    return case


async def _confirmed_booking(db: Any, world: Any, admission: date, paid: int = 80_000_00) -> Booking:
    case = await create_case(db, world.patient, world.hospital, status="booked")
    return await create_booking(
        db,
        case,
        status="confirmed",
        admission_date=admission,
        amount_paid_minor=paid,
        confirmed_at=datetime.now(UTC),
    )


async def test_package_booking_from_enquiry(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital)
    r = await client.post(
        f"{API}/bookings",
        json={
            "case_id": str(case.id),
            "package_id": str(world.package.id),
            "admission_date": future(20),
            "payment_option": "installments",
            "installment_months": 6,
            "insurance_claim_requested": True,
        },
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["package"]["id"] == str(world.package.id)
    assert body["subtotal_minor"] == world.package.price_minor
    assert body["service_fee_minor"] == 0 and body["tax_minor"] == 0  # default fee is 0 bps
    assert body["total_minor"] == world.package.price_minor
    assert body["deposit_minor"] == world.package.price_minor * 20 // 100
    assert body["installment_months"] == 6 and body["insurance_claim_requested"] is True
    assert body["procedure"]["id"] == str(world.procedure.id)
    case_row = await reload(db, Case, case.id)
    assert case_row.status == "accepted" and case_row.procedure_id == world.procedure.id
    assert [(e["from_status"], e["to_status"]) for e in event_log.of("case.status_changed")] == [
        ("enquiry", "accepted")
    ]
    # second active booking on the same case is refused
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case.id), "package_id": str(world.package.id), "admission_date": future(25)},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "booking_exists"


async def test_booking_validation_and_permissions(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    enquiry = await create_case(db, world.patient, world.hospital)
    # quote path requires an accepted quote
    r = await client.post(
        f"{API}/bookings", json={"case_id": str(enquiry.id), "admission_date": future(10)}, headers=p_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "quote_required"
    case = await _accepted_case(db, world)
    r = await client.post(
        f"{API}/bookings", json={"case_id": str(case.id), "admission_date": future(0)}, headers=p_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_admission_date"
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case.id), "admission_date": future(10), "payment_option": "installments"},
        headers=p_h,
    )
    assert r.status_code == 422
    # hospital users cannot create bookings; other patients get 404
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case.id), "admission_date": future(10)},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 403
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case.id), "admission_date": future(10)},
        headers=auth_headers(world.agent_patient_user),
    )
    assert r.status_code == 404
    # a package of another hospital
    from tests.factories import create_hospital, create_hospital_procedure, create_package

    other = await create_hospital(db)
    other_hp = await create_hospital_procedure(db, other, world.procedure)
    other_pkg = await create_package(db, other_hp)
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(enquiry.id), "package_id": str(other_pkg.id), "admission_date": future(10)},
        headers=p_h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_package"


async def test_availability_capacity_and_release(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    day = today_ist() + timedelta(days=15)
    slot = AvailabilitySlot(
        hospital_id=world.hospital.id, doctor_id=world.doctor.id, date=day, slot_kind="admission", capacity=1
    )
    db.add(slot)
    await db.commit()
    slot_id = slot.id

    case1 = await _accepted_case(db, world)
    case2 = await _accepted_case(db, world)
    r = await client.post(
        f"{API}/bookings", json={"case_id": str(case1.id), "admission_date": day.isoformat()}, headers=p_h
    )
    assert r.status_code == 201, r.text
    booking1 = r.json()
    assert (await reload(db, AvailabilitySlot, slot_id)).booked == 1

    r = await client.post(
        f"{API}/bookings", json={"case_id": str(case2.id), "admission_date": day.isoformat()}, headers=p_h
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_capacity"
    # the hospital publishes admission availability, so a day without a row is unavailable
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case2.id), "admission_date": (day + timedelta(days=1)).isoformat()},
        headers=p_h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "date_unavailable"

    # cancelling releases the reserved admission
    r = await client.post(
        f"{API}/bookings/{booking1['id']}/cancel", json={"reason": "Changed plans"}, headers=p_h
    )
    assert r.status_code == 200, r.text
    assert (await reload(db, AvailabilitySlot, slot_id)).booked == 0
    # pending_payment cancellation keeps the case accepted so another date can be booked
    assert (await reload(db, Case, case1.id)).status == "accepted"
    r = await client.post(
        f"{API}/bookings", json={"case_id": str(case2.id), "admission_date": day.isoformat()}, headers=p_h
    )
    assert r.status_code == 201, r.text


async def test_hospital_without_availability_is_unrestricted(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _accepted_case(db, world)
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case.id), "admission_date": future(40)},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 201, r.text


def test_refund_policy_tiers() -> None:
    policy = [
        {"days_before": 14, "refund_pct": 100},
        {"days_before": 7, "refund_pct": 50},
        {"days_before": 0, "refund_pct": 0},
    ]
    assert refund_pct_for(policy, 30) == 100
    assert refund_pct_for(policy, 14) == 100
    assert refund_pct_for(policy, 13) == 50
    assert refund_pct_for(policy, 7) == 50
    assert refund_pct_for(policy, 6) == 0
    assert refund_pct_for(policy, -3) == 0
    assert refund_pct_for([{"days_before": 5, "refund_pct": 80}], 2) == 0


async def test_cancellation_refund_math(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    cases = [(20, 100), (10, 50), (3, 0)]
    for days, pct in cases:
        booking = await _confirmed_booking(db, world, today_ist() + timedelta(days=days), paid=80_000_00)
        r = await client.post(
            f"{API}/bookings/{booking.id}/cancel", json={"reason": f"{days} days"}, headers=p_h
        )
        assert r.status_code == 200, r.text
        body = r.json()
        expected = 80_000_00 * pct // 100
        assert body["status"] == "cancelled" and body["cancel_reason"] == f"{days} days"
        assert body["refund_pct"] == pct and body["refundable_minor"] == expected
        payload = event_log.of("booking.cancelled")[-1]
        assert payload["booking_id"] == str(booking.id)
        assert payload["refundable_minor"] == expected and payload["reason"] == f"{days} days"
        # a confirmed booking's cancellation cancels the case
        assert (await reload(db, Case, booking.case_id)).status == "cancelled"

    # already-refunded amounts are excluded; admitted bookings cannot be cancelled
    booking = await _confirmed_booking(db, world, today_ist() + timedelta(days=30), paid=50_000_00)
    await db.execute(
        Booking.__table__.update().where(Booking.id == booking.id).values(amount_refunded_minor=10_000_00)
    )
    await db.commit()
    r = await client.post(f"{API}/bookings/{booking.id}/cancel", json={"reason": "x"}, headers=p_h)
    assert r.json()["refundable_minor"] == 40_000_00
    admitted = await _confirmed_booking(db, world, today_ist() + timedelta(days=30))
    await db.execute(Booking.__table__.update().where(Booking.id == admitted.id).values(status="admitted"))
    await db.commit()
    r = await client.post(f"{API}/bookings/{admitted.id}/cancel", json={"reason": "x"}, headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"
    # outsiders get 404 (hospital-initiated cancellations: see test_bookings_cancellation.py)
    other = await _confirmed_booking(db, world, today_ist() + timedelta(days=30))
    r = await client.post(
        f"{API}/bookings/{other.id}/cancel",
        json={"reason": "x"},
        headers=auth_headers(world.agent_patient_user),
    )
    assert r.status_code == 404


async def test_payment_in_patient_currency_and_refund_handler(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _accepted_case(db, world)
    booking = await create_booking(db, case, total_minor=4_40_000_00)  # deposit 88,000 INR
    # 1,000 USD at 88 INR/USD = 88,000 INR, published in USD with the INR base amount
    payment = await capture_payment(db, booking, 1_000_00, currency="USD", base_amount_minor=88_000_00)
    booking = await reload(db, Booking, booking.id)
    assert booking.amount_paid_minor == 88_000_00
    assert booking.status == "confirmed"
    assert (await reload(db, Case, case.id)).status == "booked"

    payment_id = payment.id
    order_id = payment.order_id
    refund = Refund(
        payment_id=payment_id,
        order_id=order_id,
        booking_id=booking.id,
        amount_minor=500_00,
        currency="USD",
        base_amount_minor=44_000_00,
        reason="Partial refund",
        status=RefundStatus.PROCESSED,
        processed_at=datetime.now(UTC),
    )
    db.add(refund)
    await db.execute(
        Payment.__table__.update().where(Payment.id == payment_id).values(amount_refunded_minor=500_00)
    )
    await db.flush()
    payload = {
        "refund_id": str(refund.id),
        "payment_id": str(payment_id),
        "booking_id": str(booking.id),
        "base_amount_minor": 44_000_00,
    }
    await publish(db, "refund.processed", payload)
    await db.commit()
    await publish(db, "refund.processed", payload)  # idempotent
    await db.commit()
    booking = await reload(db, Booking, booking.id)
    assert booking.amount_refunded_minor == 44_000_00
    r = await client.get(f"{API}/bookings/{booking.id}", headers=auth_headers(world.patient_user))
    assert r.json()["balance_due_minor"] == 4_40_000_00 - 88_000_00 + 44_000_00


async def test_admit_complete_permissions(db, client, auth_headers) -> None:
    world = await make_world(db)
    booking = await _confirmed_booking(db, world, today_ist() + timedelta(days=5))
    url = f"{API}/bookings/{booking.id}"
    assert (await client.post(f"{url}/admit", headers=auth_headers(world.patient_user))).status_code == 403
    finance_member = await add_hospital_member(db, world.hospital, "finance")
    assert (await client.post(f"{url}/admit", headers=auth_headers(finance_member))).status_code == 403
    other_hospital_user = await create_user(db, role="hospital")
    assert (await client.post(f"{url}/admit", headers=auth_headers(other_hospital_user))).status_code == 404
    r = await client.post(f"{url}/complete", headers=auth_headers(world.hospital_user))
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"
    r = await client.post(f"{url}/admit", headers=auth_headers(world.staff_user))
    assert r.status_code == 200 and r.json()["status"] == "admitted"
    r = await client.post(
        f"{url}/complete",
        json={"discharge_date": (today_ist() - timedelta(days=30)).isoformat()},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_discharge_date"


async def test_bookings_list_scoping(db, client, auth_headers) -> None:
    world = await make_world(db)
    await _confirmed_booking(db, world, today_ist() + timedelta(days=5))
    r = await client.get(f"{API}/bookings", headers=auth_headers(world.patient_user))
    assert r.json()["total"] == 1
    r = await client.get(
        f"{API}/bookings", headers=auth_headers(world.hospital_user), params={"status": "confirmed"}
    )
    assert r.json()["total"] == 1
    for outsider in (world.agent_user, world.agent_patient_user):
        r = await client.get(f"{API}/bookings", headers=auth_headers(outsider))
        assert r.json()["total"] == 0


async def test_checklist_and_itinerary(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await _accepted_case(db, world)
    booking = await create_booking(db, case)
    await capture_payment(db, booking, booking.deposit_minor)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)

    items = (await client.get(f"{API}/bookings/{booking.id}/checklist", headers=p_h)).json()
    insurance = next(i for i in items if i["key"] == "travel_insurance")
    treatment = next(i for i in items if i["key"] == "treatment_booked")
    r = await client.patch(
        f"{API}/bookings/{booking.id}/checklist/{insurance['id']}", json={"status": "done"}, headers=p_h
    )
    assert r.status_code == 200 and r.json()["status"] == "done" and r.json()["done_at"]
    r = await client.patch(
        f"{API}/bookings/{booking.id}/checklist/{treatment['id']}", json={"status": "pending"}, headers=p_h
    )
    assert r.status_code == 400
    r = await client.patch(
        f"{API}/bookings/{booking.id}/checklist/{uuid.uuid4()}", json={"status": "done"}, headers=p_h
    )
    assert r.status_code == 404

    url = f"{API}/bookings/{booking.id}/itinerary"
    item = {
        "kind": "pickup",
        "title": "Airport pickup",
        "starts_at": "2026-12-01T10:00:00Z",
        "location": "DEL T3",
    }
    assert (await client.post(url, json=item, headers=p_h)).status_code == 403
    r = await client.post(url, json=item, headers=h_h)
    assert r.status_code == 201, r.text
    item_id = r.json()["id"]
    r = await client.patch(f"{url}/{item_id}", json={"status": "done", "title": "Pickup done"}, headers=h_h)
    assert r.status_code == 200 and r.json()["status"] == "done"
    assert (await client.patch(f"{url}/{item_id}", json={"title": "x"}, headers=p_h)).status_code == 403
    listing = (await client.get(url, headers=p_h)).json()
    assert {i["kind"] for i in listing} == {"admission", "pickup"}
    r = await client.delete(f"{url}/{item_id}", headers=h_h)
    assert r.status_code == 204
    assert len((await client.get(url, headers=p_h)).json()) == 1
    r = await client.get(url, headers=auth_headers(world.agent_patient_user))
    assert r.status_code == 404


async def test_consultations(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, doctor_id=world.doctor.id)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)
    r = await client.post(
        f"{API}/consultations",
        json={"case_id": str(case.id), "mode": "video", "preferred_at": "2026-12-01T10:00:00Z"},
        headers=p_h,
    )
    assert r.status_code == 201, r.text
    consult = r.json()
    assert consult["status"] == "requested"
    assert consult["fee_minor"] == world.doctor.consultation_fee_minor
    assert consult["doctor"]["id"] == str(world.doctor.id)
    r = await client.post(f"{API}/consultations", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 409

    no_tele = await create_doctor(db, world.hospital, world.specialty, teleconsult_available=False)
    r = await client.post(
        f"{API}/consultations", json={"case_id": str(case.id), "doctor_id": str(no_tele.id)}, headers=p_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "teleconsult_unavailable"

    url = f"{API}/consultations/{consult['id']}"
    when = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    r = await client.patch(url, json={"status": "scheduled", "scheduled_at": when}, headers=p_h)
    assert r.status_code == 403
    r = await client.patch(url, json={"status": "scheduled", "scheduled_at": when}, headers=h_h)
    # No link given: a private Jitsi room is generated (phase 1 video).
    assert r.status_code == 200, r.text
    assert r.json()["meeting_url"].startswith("https://meet.jit.si/hig-")
    r = await client.patch(  # SEC-041: plain http meeting links are refused
        url,
        json={"status": "scheduled", "scheduled_at": when, "meeting_url": "http://meet.example.test/abc"},
        headers=h_h,
    )
    assert r.status_code == 422
    r = await client.patch(
        url,
        json={"status": "scheduled", "scheduled_at": when, "meeting_url": "https://meet.example.test/abc"},
        headers=h_h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "scheduled" and r.json()["meeting_url"] == "https://meet.example.test/abc"
    r = await client.get(f"{API}/consultations", headers=p_h)
    assert r.json()["total"] == 1
    r = await client.get(url, headers=auth_headers(world.agent_patient_user))
    assert r.status_code == 404
    r = await client.patch(url, json={"status": "cancelled"}, headers=p_h)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    r = await client.patch(url, json={"status": "completed"}, headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"


async def test_expire_unpaid_bookings_job(db, client) -> None:
    from app.modules.cases.bookings import expire_unpaid_bookings

    world = await make_world(db)
    case = await _accepted_case(db, world)
    booking = await create_booking(db, case, admission_date=today_ist() - timedelta(days=1))
    assert await expire_unpaid_bookings(db) == 1
    await db.commit()
    row = await reload(db, Booking, booking.id)
    assert row.status == "cancelled"
    rows = (await db.execute(select(Booking).where(Booking.status == "pending_payment"))).scalars().all()
    assert rows == []


async def test_bookings_list_filters_sort_and_status_counts(db, client, auth_headers) -> None:
    world = await make_world(db)
    # Factory names come from a short list; the `q` check below needs a surname no other patient shares.
    world.agent_patient.last_name = "Quillfeather"
    await db.commit()
    staff = auth_headers(world.staff_user)
    other = await create_case(db, world.agent_patient, world.hospital, status="booked")
    soon = today_ist() + timedelta(days=3)
    later = today_ist() + timedelta(days=40)
    paid = await _confirmed_booking(db, world, soon, paid=4_00_000_00)  # nothing due
    partial = await _confirmed_booking(db, world, later, paid=80_000_00)
    unpaid = await create_booking(db, other, admission_date=later, total_minor=1_00_000_00)

    async def numbers(**params: Any) -> list[str]:
        r = await client.get(f"{API}/bookings", headers=staff, params=params)
        assert r.status_code == 200, r.text
        return [b["booking_number"] for b in r.json()["items"]]

    assert set(await numbers(payment="paid")) == {paid.booking_number}
    assert set(await numbers(payment=["partial", "unpaid"])) == {
        partial.booking_number,
        unpaid.booking_number,
    }
    assert set(await numbers(status=["pending_payment"])) == {unpaid.booking_number}
    assert set(await numbers(status=["confirmed", "pending_payment"])) == {
        paid.booking_number,
        partial.booking_number,
        unpaid.booking_number,
    }
    assert await numbers(q=paid.booking_number) == [paid.booking_number]
    assert set(await numbers(q=world.agent_patient.last_name)) == {unpaid.booking_number}
    assert await numbers(admission_to=soon.isoformat()) == [paid.booking_number]
    assert set(await numbers(admission_from=later.isoformat())) == {
        partial.booking_number,
        unpaid.booking_number,
    }
    assert await numbers(max_total=1_00_000_00) == [unpaid.booking_number]
    assert set(await numbers(min_total=2_00_000_00)) == {paid.booking_number, partial.booking_number}
    assert await numbers(created_to=(today_ist() - timedelta(days=1)).isoformat()) == []
    assert (await numbers(sort="admission_date"))[0] == paid.booking_number
    assert (await numbers(sort="-total_minor"))[-1] == unpaid.booking_number
    r = await client.get(f"{API}/bookings", headers=staff, params={"sort": "nope"})
    assert r.status_code == 422

    r = await client.get(f"{API}/bookings/status-counts", headers=staff, params={"status": "cancelled"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"]["confirmed"] == 2 and body["counts"]["pending_payment"] == 1
    assert body["total"] == 3 and body["counts"]["cancelled"] == 0
    r = await client.get(f"{API}/bookings/status-counts", headers=staff, params={"payment": "unpaid"})
    assert r.json()["total"] == 1
    # scoping still applies to the counts
    r = await client.get(f"{API}/bookings/status-counts", headers=auth_headers(world.patient_user))
    assert r.json()["total"] == 2


async def test_bookings_filters_and_counts_are_scoped_per_role(db, client, auth_headers) -> None:
    from tests.factories import create_hospital

    world = await make_world(db)
    own = await _confirmed_booking(db, world, today_ist() + timedelta(days=5))
    agent_case = await create_case(
        db, world.agent_patient, world.hospital, agent_id=world.agent.id, status="booked"
    )
    agent_booking = await create_booking(db, agent_case)
    elsewhere = await create_hospital(db)
    foreign_case = await create_case(db, world.patient, elsewhere, status="booked")
    foreign = await create_booking(db, foreign_case)

    async def visible(user: Any, **params: Any) -> set[str]:
        r = await client.get(f"{API}/bookings", headers=auth_headers(user), params=params)
        assert r.status_code == 200, r.text
        listed = {b["booking_number"] for b in r.json()["items"]}
        c = await client.get(f"{API}/bookings/status-counts", headers=auth_headers(user), params=params)
        assert c.status_code == 200, c.text
        if "status" not in params:  # the counts ignore `status` (they drive the status tabs)
            assert c.json()["total"] == len(listed)
        return listed

    everything = {own.booking_number, agent_booking.booking_number, foreign.booking_number}
    assert await visible(world.staff_user) == everything
    assert await visible(world.patient_user) == {own.booking_number, foreign.booking_number}
    assert await visible(world.agent_user) == {agent_booking.booking_number}
    assert await visible(world.hospital_user) == {own.booking_number, agent_booking.booking_number}
    # filters combine with the scope
    assert await visible(world.hospital_user, status=["pending_payment"]) == {agent_booking.booking_number}
    assert await visible(world.patient_user, q=foreign.booking_number) == {foreign.booking_number}
    assert await visible(world.agent_user, q=foreign.booking_number) == set()
    assert await visible(world.hospital_user, sort="-admission_date", payment="unpaid") == {
        agent_booking.booking_number
    }
