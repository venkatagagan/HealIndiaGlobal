"""Cancellation initiators (hospital/platform refund 100%), refund-policy snapshot at confirmation,
emergency gating and guest gating of the booking flow (INTEGRATION_BACKLOG #6, #7, #12, #13)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.settings_store import get_setting, set_setting
from app.models import Booking, Case, Screening
from app.modules.cases.common import today_ist
from tests.factories import (
    create_booking,
    create_case,
    create_hospital,
    create_patient,
    create_quote,
    create_user,
)
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    add_hospital_member,
    capture_payment,
    event_log_fixture,
    future,
    make_world,
    quote_body,
    reload,
)

API = "/api/v1"
PAID = 80_000_00


async def _confirmed_booking(db: Any, world: Any, admission: date, paid: int = PAID) -> Booking:
    case = await create_case(db, world.patient, world.hospital, status="booked")
    return await create_booking(
        db,
        case,
        status="confirmed",
        admission_date=admission,
        amount_paid_minor=paid,
        confirmed_at=datetime.now(UTC),
    )


async def _cancel(client: Any, booking: Booking, headers: dict[str, str], **extra: Any) -> Any:
    return await client.post(
        f"{API}/bookings/{booking.id}/cancel", json={"reason": "cancel", **extra}, headers=headers
    )


async def test_hospital_and_platform_cancellations_refund_in_full(
    db, client, auth_headers, event_log: EventLog
) -> None:
    world = await make_world(db)
    close = today_ist() + timedelta(days=3)  # patient tier would be 0%

    # hospital owner cancels -> 100%, initiated_by=hospital, case cancelled
    booking = await _confirmed_booking(db, world, close)
    r = await _cancel(client, booking, auth_headers(world.hospital_user))
    assert r.status_code == 200, r.text
    assert r.json()["refund_pct"] == 100 and r.json()["refundable_minor"] == PAID
    payload = event_log.of("booking.cancelled")[-1]
    assert payload["initiated_by"] == "hospital" and payload["refundable_minor"] == PAID
    assert (await reload(db, Case, booking.case_id)).status == "cancelled"
    assert (await reload(db, Booking, booking.id)).meta["cancel_initiated_by"] == "hospital"

    # read-only hospital member (finance) cannot cancel; another hospital cannot even see it
    booking = await _confirmed_booking(db, world, close)
    finance = await add_hospital_member(db, world.hospital, "finance")
    assert (await _cancel(client, booking, auth_headers(finance))).status_code == 403
    other_owner = await create_user(db, role="hospital")
    await create_hospital(db, owner=other_owner)
    assert (await _cancel(client, booking, auth_headers(other_owner))).status_code == 404

    # a hospital user cannot claim to be the platform; a patient cannot claim hospital/platform
    r = await _cancel(client, booking, auth_headers(world.hospital_user), initiated_by="platform")
    assert r.status_code == 403
    r = await _cancel(client, booking, auth_headers(world.patient_user), initiated_by="platform")
    assert r.status_code == 403

    # SEC-059: support/finance cannot cancel as the platform or the hospital (100% refund)
    for initiator in ("platform", "hospital"):
        r = await _cancel(client, booking, auth_headers(world.staff_user), initiated_by=initiator)
        assert r.status_code == 403 and r.json()["error"]["code"] == "platform_cancel_admin_only"
    finance_staff = await create_user(db, role="finance")
    r = await _cancel(client, booking, auth_headers(finance_staff), initiated_by="platform")
    assert r.status_code == 403

    # an admin cancels -> platform, 100%; the refund is requested by the admin (finance approves)
    admin = await create_user(db, role="admin")
    admin_id = admin.id
    r = await _cancel(client, booking, auth_headers(admin))
    assert r.status_code == 200, r.text
    assert r.json()["refund_pct"] == 100 and r.json()["refundable_minor"] == PAID
    payload = event_log.of("booking.cancelled")[-1]
    assert payload["initiated_by"] == "platform" and payload["refund_requested_by"] == str(admin_id)

    # support cancelling without initiated_by acts for the patient: tiers apply, refund stays automatic
    booking = await _confirmed_booking(db, world, close)
    r = await _cancel(client, booking, auth_headers(world.staff_user))
    assert r.status_code == 200, r.text
    assert r.json()["refund_pct"] == 0 and r.json()["refundable_minor"] == 0
    payload = event_log.of("booking.cancelled")[-1]
    assert payload["initiated_by"] == "patient" and payload["refund_requested_by"] is None

    # staff cancelling at the patient's request applies the patient tiers
    booking = await _confirmed_booking(db, world, close)
    r = await _cancel(client, booking, auth_headers(world.staff_user), initiated_by="patient")
    assert r.status_code == 200, r.text
    assert r.json()["refund_pct"] == 0 and r.json()["refundable_minor"] == 0
    assert event_log.of("booking.cancelled")[-1]["initiated_by"] == "patient"

    # the patient's own cancellation applies the tiers
    booking = await _confirmed_booking(db, world, close)
    r = await _cancel(client, booking, auth_headers(world.patient_user))
    assert r.json()["refund_pct"] == 0 and r.json()["refundable_minor"] == 0
    assert event_log.of("booking.cancelled")[-1]["refund_requested_by"] is None

    # cancelling the case (admin) with a confirmed booking is a platform cancellation
    booking = await _confirmed_booking(db, world, close)
    r = await client.post(
        f"{API}/cases/{booking.case_id}/status",
        json={"to_status": "cancelled", "note": "Hospital unavailable", "initiated_by": "platform"},
        headers=auth_headers(world.staff_user),
    )
    assert r.status_code == 403  # SEC-059: not for support
    r = await client.post(
        f"{API}/cases/{booking.case_id}/status",
        json={"to_status": "cancelled", "note": "Hospital unavailable"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    payload = event_log.of("booking.cancelled")[-1]
    assert payload["booking_id"] == str(booking.id)
    assert payload["initiated_by"] == "platform" and payload["refundable_minor"] == PAID
    assert payload["refund_requested_by"] == str(admin_id)


async def test_refund_policy_snapshot_applies_on_cancellation(db, client, auth_headers) -> None:
    world = await make_world(db)
    original = await get_setting(db, "refund_policy")
    try:
        await set_setting(
            db,
            "refund_policy",
            [{"days_before": 10, "refund_pct": 100}, {"days_before": 0, "refund_pct": 25}],
            None,
        )
        await db.commit()
        case = await create_case(db, world.patient, world.hospital, status="accepted")
        await create_quote(db, case, status="accepted", accepted_at=datetime.now(UTC))
        booking = await create_booking(
            db, case, total_minor=4_40_000_00, admission_date=today_ist() + timedelta(days=5)
        )
        assert booking.refund_policy is None
        await capture_payment(db, booking, 88_000_00)
        booking = await reload(db, Booking, booking.id)
        assert booking.status == "confirmed"
        assert booking.refund_policy == [
            {"days_before": 10, "refund_pct": 100},
            {"days_before": 0, "refund_pct": 25},
        ]
        r = await client.get(f"{API}/bookings/{booking.id}", headers=auth_headers(world.patient_user))
        assert r.json()["refund_policy"][1] == {"days_before": 0, "refund_pct": 25}

        # the platform tightens the policy afterwards: the booking keeps its snapshot (25% at 5 days)
        await set_setting(db, "refund_policy", [{"days_before": 0, "refund_pct": 0}], None)
        await db.commit()
        r = await _cancel(client, booking, auth_headers(world.patient_user))
        assert r.status_code == 200, r.text
        assert r.json()["refund_pct"] == 25 and r.json()["refundable_minor"] == 22_000_00
    finally:
        await set_setting(db, "refund_policy", original, None)
        await db.commit()


async def test_emergency_screening_blocks_booking_until_acknowledged(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    screening = Screening(
        patient_id=world.patient.id,
        created_by_user_id=world.patient_user.id,
        status="completed",
        urgency="emergency",
        red_flags=["chest_pain"],
    )
    db.add(screening)
    await db.commit()

    r = await client.post(
        f"{API}/cases",
        json={
            "hospital_id": str(world.hospital.id),
            "doctor_id": str(world.doctor.id),
            "procedure_id": str(world.procedure.id),
            "screening_id": str(screening.id),
            "consent_share": True,
        },
        headers=p_h,
    )
    assert r.status_code == 201, r.text
    case = r.json()
    assert case["urgency"] == "emergency" and case["emergency_ack_required"] is True
    case_id = case["id"]

    # quote acceptance and booking are blocked
    quote = (
        await client.post(
            f"{API}/cases/{case_id}/quotes",
            json=quote_body(),
            headers=auth_headers(world.hospital_user),
        )
    ).json()
    r = await client.post(f"{API}/cases/{case_id}/quotes/{quote['id']}/accept", headers=p_h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "emergency_ack_required"
    booking_body = {
        "case_id": case_id,
        "package_id": str(world.package.id),
        "admission_date": future(20),
        "payment_option": "full",
    }
    r = await client.post(f"{API}/bookings", json=booking_body, headers=p_h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "emergency_ack_required"

    # only the patient side can acknowledge, and only with acknowledged=true
    ack = f"{API}/cases/{case_id}/emergency-ack"
    h_h = auth_headers(world.hospital_user)
    assert (await client.post(ack, json={"acknowledged": True}, headers=h_h)).status_code == 403
    assert (await client.post(ack, json={"acknowledged": False}, headers=p_h)).status_code == 422
    r = await client.post(ack, json={"acknowledged": True}, headers=p_h)
    assert r.status_code == 200, r.text
    assert r.json()["emergency_ack_required"] is False and r.json()["emergency_acknowledged_at"]
    assert (await client.post(ack, json={"acknowledged": True}, headers=p_h)).status_code == 200  # idempotent

    r = await client.post(f"{API}/cases/{case_id}/quotes/{quote['id']}/accept", headers=p_h)
    assert r.status_code == 200, r.text
    r = await client.post(f"{API}/bookings", json={**booking_body, "package_id": None}, headers=p_h)
    assert r.status_code == 201, r.text

    # a non-emergency case needs no acknowledgement
    plain = await create_case(db, world.patient, world.hospital)
    r = await client.post(f"{API}/cases/{plain.id}/emergency-ack", json={"acknowledged": True}, headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "not_emergency"


async def test_guests_must_upgrade_before_case_or_booking(db, client, auth_headers) -> None:
    world = await make_world(db)
    guest = await create_user(db, role="patient", email=None, password=None, is_guest=True)
    guest_patient = await create_patient(db, user=guest)
    h = auth_headers(guest)
    r = await client.post(
        f"{API}/cases",
        json={"hospital_id": str(world.hospital.id), "consent_share": True},
        headers=h,
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "guest_upgrade_required"

    case = await create_case(db, guest_patient, world.hospital)
    r = await client.post(
        f"{API}/bookings",
        json={
            "case_id": str(case.id),
            "package_id": str(world.package.id),
            "admission_date": future(20),
            "payment_option": "full",
        },
        headers=h,
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "guest_upgrade_required"
