"""Cases & quotes: lifecycle, scoping (IDOR), permissions and state-machine checks."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select

from app.core.enums import ConsentKind
from app.core.settings_store import set_setting
from app.models import (
    AuditLog,
    Booking,
    Case,
    CaseStatusHistory,
    ChecklistItem,
    Consent,
    ItineraryItem,
    Quote,
)
from app.modules.cases.common import today_ist
from tests.factories import (
    create_agent,
    create_case,
    create_hospital,
    create_patient,
    create_quote,
    create_user,
)
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    QUOTE_TOTAL,
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


async def _create_case(client: Any, headers: dict[str, str], world: Any, **extra: Any) -> dict[str, Any]:
    body = {
        "hospital_id": str(world.hospital.id),
        "doctor_id": str(world.doctor.id),
        "procedure_id": str(world.procedure.id),
        "patient_notes": "Knee pain for two years",
        "consent_share": True,
        **extra,
    }
    r = await client.post(f"{API}/cases", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_full_lifecycle(db, client, auth_headers, run_jobs, event_log: EventLog) -> None:
    world = await make_world(db)
    await set_setting(db, "patient_service_fee_bps", 500, actor=None)  # 5 % service fee
    await db.commit()
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)

    # 1. enquiry
    case = await _create_case(client, p_h, world)
    assert case["status"] == "enquiry"
    assert re.fullmatch(r"HIG-C-\d{4}-\d{6}", case["case_number"])
    assert case["hospital"]["id"] == str(world.hospital.id)
    assert case["doctor"]["full_name"] == world.doctor.full_name
    assert case["specialty"]["id"] == str(world.specialty.id)  # derived from the doctor
    assert case["patient"]["age"] is not None
    consent = (await db.execute(select(Consent).where(Consent.user_id == world.patient_user.id))).scalar_one()
    assert consent.kind == ConsentKind.SHARE_WITH_HOSPITALS and consent.granted
    created = event_log.of("case.created")[0]
    assert created == {
        "case_id": case["id"],
        "hospital_id": str(world.hospital.id),
        "patient_id": str(world.patient.id),
        "agent_id": None,
    }

    # 2. quote
    r = await client.post(f"{API}/cases/{case['id']}/quotes", json=quote_body(), headers=h_h)
    assert r.status_code == 201, r.text
    quote = r.json()
    assert quote["status"] == "sent" and quote["total_minor"] == QUOTE_TOTAL
    assert quote["prepared_by_name"] == world.hospital_user.full_name
    assert event_log.of("quote.sent") == [{"quote_id": quote["id"], "case_id": case["id"]}]

    # 3. accept
    r = await client.post(f"{API}/cases/{case['id']}/quotes/{quote['id']}/accept", headers=p_h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted"
    assert event_log.of("quote.accepted") == [{"quote_id": quote["id"], "case_id": case["id"]}]

    # 4. booking from the accepted quote
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": case["id"], "admission_date": future(30), "payment_option": "deposit"},
        headers=p_h,
    )
    assert r.status_code == 201, r.text
    booking = r.json()
    fee = QUOTE_TOTAL * 5 // 100
    tax = fee * 18 // 100
    total = QUOTE_TOTAL + fee + tax
    assert booking["status"] == "pending_payment"
    assert booking["subtotal_minor"] == QUOTE_TOTAL
    assert booking["service_fee_minor"] == fee
    assert booking["tax_minor"] == tax
    assert booking["total_minor"] == total
    assert booking["deposit_minor"] == total * 20 // 100
    assert booking["balance_due_minor"] == total
    assert booking["duration_days"] == 14
    assert booking["quote_id"] == quote["id"]
    assert event_log.of("booking.created") == [{"booking_id": booking["id"]}]
    booking_row = await reload(db, Booking, booking["id"])

    # 5. a partial payment below the deposit does not confirm
    first = await capture_payment(db, booking_row, 10_000_00)
    booking_row = await reload(db, Booking, booking["id"])
    assert booking_row.status == "pending_payment" and booking_row.amount_paid_minor == 10_000_00

    # 6. the deposit confirms the booking, books the case and creates the checklist
    rest = booking["deposit_minor"] - 10_000_00
    await capture_payment(db, booking_row, rest)
    booking_row = await reload(db, Booking, booking["id"])
    assert booking_row.status == "confirmed" and booking_row.confirmed_at is not None
    assert booking_row.amount_paid_minor == booking["deposit_minor"]
    assert event_log.of("booking.confirmed") == [{"booking_id": booking["id"]}]
    case_row = await reload(db, Case, case["id"])
    assert case_row.status == "booked"
    items = (
        (await db.execute(select(ChecklistItem).where(ChecklistItem.case_id == case_row.id))).scalars().all()
    )
    assert {str(i.key.value) for i in items} == {
        "treatment_booked",
        "visa_approved",
        "flight_booked",
        "travel_insurance",
        "airport_pickup",
        "accommodation_booked",
        "documents_uploaded",
    }
    assert next(i for i in items if i.key == "treatment_booked").status == "done"
    admission = (
        await db.execute(select(ItineraryItem).where(ItineraryItem.case_id == case_row.id))
    ).scalar_one()
    assert admission.kind == "admission"

    # 7. replaying the same payment is a no-op (idempotent per payment id)
    await capture_payment(db, booking_row, 10_000_00, payment=first)
    booking_row = await reload(db, Booking, booking["id"])
    assert booking_row.amount_paid_minor == booking["deposit_minor"]

    r = await client.get(f"{API}/bookings/{booking['id']}/checklist", headers=p_h)
    assert r.status_code == 200 and len(r.json()) == 7
    assert r.json()[0]["key"] == "treatment_booked"

    # 8. admit and complete; SEC-019: not more than a day before the admission date
    r = await client.post(f"{API}/bookings/{booking['id']}/admit", json={"note": "Admitted"}, headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "admission_too_early"
    await db.execute(
        Booking.__table__.update()
        .where(Booking.id == booking["id"])
        .values(admission_date=today_ist() + timedelta(days=1))
    )
    await db.commit()
    r = await client.post(f"{API}/bookings/{booking['id']}/admit", json={"note": "Admitted"}, headers=h_h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "admitted"
    assert (await reload(db, Case, case["id"])).status == "in_treatment"
    r = await client.post(f"{API}/bookings/{booking['id']}/complete", json={}, headers=h_h)
    assert (
        r.status_code == 400 and r.json()["error"]["code"] == "invalid_discharge_date"
    )  # admission in future
    await db.execute(
        Booking.__table__.update()
        .where(Booking.id == booking["id"])
        .values(admission_date=today_ist() - timedelta(days=5))
    )
    await db.commit()
    r = await client.post(
        f"{API}/bookings/{booking['id']}/complete", json={"note": "Discharged"}, headers=h_h
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed" and body["discharge_date"] == today_ist().isoformat()
    assert body["completed_at"] is not None
    case_row = await reload(db, Case, case["id"])
    assert case_row.status == "completed" and case_row.closed_at is not None
    assert event_log.of("booking.admitted") == [{"booking_id": booking["id"]}]
    assert event_log.of("booking.completed") == [{"booking_id": booking["id"]}]

    transitions = [(p["from_status"], p["to_status"]) for p in event_log.of("case.status_changed")]
    assert transitions == [
        ("enquiry", "quoted"),
        ("quoted", "accepted"),
        ("accepted", "booked"),
        ("booked", "in_treatment"),
        ("in_treatment", "completed"),
    ]
    history = (
        await db.execute(
            select(func.count())
            .select_from(CaseStatusHistory)
            .where(CaseStatusHistory.case_id == case_row.id)
        )
    ).scalar_one()
    assert history == 6  # creation + 5 transitions

    r = await client.get(f"{API}/cases/{case['id']}", headers=p_h)
    assert r.status_code == 200
    detail = r.json()
    assert detail["status"] == "completed"
    assert [t["to_status"] for t in detail["timeline"]] == [
        "enquiry",
        "quoted",
        "accepted",
        "booked",
        "in_treatment",
        "completed",
    ]
    assert detail["booking"]["id"] == booking["id"] and detail["latest_quote"]["id"] == quote["id"]

    actions = set((await db.execute(select(AuditLog.action))).scalars())
    assert {
        "case.create",
        "quote.send",
        "quote.accept",
        "booking.create",
        "booking.confirm",
        "booking.admit",
        "booking.complete",
        "case.status_change",
        "booking.payment_applied",
    } <= actions
    assert await run_jobs() >= 1  # realtime pushes (and other modules' jobs) drain cleanly


async def test_case_requires_consent(db, client, auth_headers) -> None:
    world = await make_world(db)
    headers = auth_headers(world.patient_user)
    body = {"hospital_id": str(world.hospital.id)}
    r = await client.post(f"{API}/cases", json=body, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_required"
    db.add(
        Consent(
            user_id=world.patient_user.id, kind=ConsentKind.SHARE_WITH_HOSPITALS, version="1.0", granted=True
        )
    )
    await db.commit()
    r = await client.post(f"{API}/cases", json=body, headers=headers)
    assert r.status_code == 201, r.text


async def test_case_validation(db, client, auth_headers) -> None:
    world = await make_world(db)
    headers = auth_headers(world.patient_user)
    other_hospital = await create_hospital(db)
    r = await client.post(
        f"{API}/cases",
        json={
            "hospital_id": str(other_hospital.id),
            "doctor_id": str(world.doctor.id),
            "consent_share": True,
        },
        headers=headers,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_doctor"
    pending = await create_hospital(db, status="pending_review")
    r = await client.post(
        f"{API}/cases", json={"hospital_id": str(pending.id), "consent_share": True}, headers=headers
    )
    assert r.status_code == 404
    r = await client.post(
        f"{API}/cases",
        json={"hospital_id": str(world.hospital.id), "consent_share": True, "x": 1},
        headers=headers,
    )
    assert r.status_code == 422
    hospital_headers = auth_headers(world.hospital_user)
    r = await client.post(
        f"{API}/cases",
        json={"hospital_id": str(world.hospital.id), "consent_share": True},
        headers=hospital_headers,
    )
    assert r.status_code == 403


async def test_agent_cases_and_scoping(db, client, auth_headers) -> None:
    world = await make_world(db)
    a_h = auth_headers(world.agent_user)
    # agent creates a case for a managed patient
    case = await _create_case(client, a_h, world, patient_id=str(world.agent_patient.id))
    assert case["agent"]["id"] == str(world.agent.id)
    assert case["patient"]["id"] == str(world.agent_patient.id)
    # SEC-060: the share consent is recorded for the patient but as granted by the agent
    consents = (
        (await db.execute(select(Consent).where(Consent.user_id == world.agent_patient.user_id)))
        .scalars()
        .all()
    )
    assert len(consents) == 1 and consents[0].granted_by_user_id == world.agent.user_id
    # ... scoped to the case and its hospital
    assert str(consents[0].case_id) == case["id"] and consents[0].hospital_id == world.hospital.id
    # ... but not for a patient they do not manage
    r = await client.post(
        f"{API}/cases",
        json={
            "hospital_id": str(world.hospital.id),
            "patient_id": str(world.patient.id),
            "consent_share": True,
        },
        headers=a_h,
    )
    assert r.status_code == 404
    # agent case without patient_id
    r = await client.post(
        f"{API}/cases", json={"hospital_id": str(world.hospital.id), "consent_share": True}, headers=a_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "patient_required"
    # a patient managed by the agent creates their own case: the agent is attached automatically
    own = await _create_case(client, auth_headers(world.agent_patient_user), world)
    assert own["agent"]["id"] == str(world.agent.id)

    # a pending agent cannot create cases
    pending_user = await create_user(db, role="agent")
    await create_agent(db, user=pending_user, status="pending")
    r = await client.post(
        f"{API}/cases",
        json={
            "hospital_id": str(world.hospital.id),
            "patient_id": str(world.agent_patient.id),
            "consent_share": True,
        },
        headers=auth_headers(pending_user),
    )
    assert r.status_code == 403

    # visibility
    r = await client.get(f"{API}/cases", headers=a_h)
    assert r.json()["total"] == 2
    r = await client.get(f"{API}/cases", headers=auth_headers(world.patient_user))
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/cases", headers=auth_headers(world.hospital_user))
    assert r.json()["total"] == 2
    r = await client.get(
        f"{API}/cases", headers=auth_headers(world.staff_user), params={"agent_id": str(world.agent.id)}
    )
    assert r.json()["total"] == 2


async def test_idor_other_parties_get_404(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _create_case(client, auth_headers(world.patient_user), world)
    other_patient_user = await create_user(db, role="patient")
    await create_patient(db, user=other_patient_user)
    other_agent_user = await create_user(db, role="agent")
    await create_agent(db, user=other_agent_user)
    other_hospital_user = await create_user(db, role="hospital")
    await create_hospital(db, owner=other_hospital_user)
    finance = await create_user(db, role="finance")

    for outsider in (other_patient_user, other_agent_user, other_hospital_user):
        h = auth_headers(outsider)
        r = await client.get(f"{API}/cases/{case['id']}", headers=h)
        assert r.status_code == 404, outsider.role
        r = await client.get(f"{API}/cases", headers=h)
        assert r.json()["total"] == 0
    r = await client.post(
        f"{API}/cases/{case['id']}/quotes", json=quote_body(), headers=auth_headers(other_hospital_user)
    )
    assert r.status_code == 404
    r = await client.post(
        f"{API}/cases/{case['id']}/status",
        json={"to_status": "cancelled"},
        headers=auth_headers(other_patient_user),
    )
    assert r.status_code == 404
    for insider in (world.patient_user, world.hospital_user, world.staff_user, finance):
        r = await client.get(f"{API}/cases/{case['id']}", headers=auth_headers(insider))
        assert r.status_code == 200, insider.role
    r = await client.get(f"{API}/cases/{case['id']}")
    assert r.status_code == 401


async def test_quote_permissions_and_rules(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)
    case = await _create_case(client, p_h, world)
    url = f"{API}/cases/{case['id']}/quotes"

    # patients cannot quote; finance-only hospital members cannot quote
    assert (await client.post(url, json=quote_body(), headers=p_h)).status_code == 403
    finance_member = await add_hospital_member(db, world.hospital, "finance")
    assert (
        await client.post(url, json=quote_body(), headers=auth_headers(finance_member))
    ).status_code == 403
    r = await client.post(url, json=quote_body(valid_until=future(-1)), headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_valid_until"
    r = await client.post(url, json=quote_body(currency="XYZ"), headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_currency"
    r = await client.post(url, json=quote_body(line_items=[]), headers=h_h)
    assert r.status_code == 422

    first = (await client.post(url, json=quote_body(), headers=h_h)).json()
    second = (await client.post(url, json=quote_body(estimated_stay_days=10), headers=h_h)).json()
    q1 = await reload(db, Quote, first["id"])
    assert q1.status == "withdrawn"  # superseded by the revised quote

    # the hospital cannot accept; the old quote cannot be accepted
    r = await client.post(f"{url}/{second['id']}/accept", headers=h_h)
    assert r.status_code == 403
    r = await client.post(f"{url}/{first['id']}/accept", headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "quote_not_open"

    # reject keeps the case quoted; hospital may send a new quote
    r = await client.post(f"{url}/{second['id']}/reject", json={"reason": "Too expensive"}, headers=p_h)
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert (await reload(db, Case, case["id"])).status == "quoted"
    third = (await client.post(url, json=quote_body(), headers=h_h)).json()

    # expired quote
    await db.execute(
        Quote.__table__.update()
        .where(Quote.id == third["id"])
        .values(valid_until=today_ist() - timedelta(days=1))
    )
    await db.commit()
    r = await client.post(f"{url}/{third['id']}/accept", headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "quote_expired"
    assert (await reload(db, Quote, third["id"])).status == "expired"


async def test_manual_status_transitions(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)
    case = await _create_case(client, p_h, world)
    status_url = f"{API}/cases/{case['id']}/status"

    r = await client.post(status_url, json={"to_status": "booked"}, headers=auth_headers(world.staff_user))
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"
    r = await client.post(status_url, json={"to_status": "declined"}, headers=p_h)
    assert r.status_code == 403
    r = await client.post(status_url, json={"to_status": "cancelled"}, headers=h_h)
    assert r.status_code == 403
    r = await client.post(status_url, json={"to_status": "declined", "note": "Not a candidate"}, headers=h_h)
    assert r.status_code == 200 and r.json()["status"] == "declined"
    assert event_log.of("case.status_changed")[-1]["to_status"] == "declined"
    r = await client.post(status_url, json={"to_status": "cancelled"}, headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"

    # cancelling an accepted case with a pending booking cancels the booking too
    case2 = await create_case(db, world.patient, world.hospital, status="accepted")
    await create_quote(db, case2, status="accepted")
    from tests.factories import create_booking

    booking = await create_booking(db, case2)
    r = await client.post(f"{API}/cases/{case2.id}/status", json={"to_status": "cancelled"}, headers=p_h)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert (await reload(db, Booking, booking.id)).status == "cancelled"
    assert event_log.of("booking.cancelled")[-1]["booking_id"] == str(booking.id)


async def test_assign_coordinator(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await _create_case(client, auth_headers(world.patient_user), world)
    url = f"{API}/cases/{case['id']}/assign-coordinator"
    body = {"user_id": str(world.staff_user.id)}
    assert (await client.post(url, json=body, headers=auth_headers(world.patient_user))).status_code == 403
    assert (await client.post(url, json=body, headers=auth_headers(world.hospital_user))).status_code == 403
    r = await client.post(
        url, json={"user_id": str(world.patient_user.id)}, headers=auth_headers(world.staff_user)
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_coordinator"
    r = await client.post(url, json=body, headers=auth_headers(world.staff_user))
    assert r.status_code == 200
    assert r.json()["coordinator"] == {
        "id": str(world.staff_user.id),
        "full_name": world.staff_user.full_name,
    }
    assert event_log.of("case.coordinator_assigned")[0]["coordinator_user_id"] == str(world.staff_user.id)


async def test_case_list_filters_and_search(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    case = await _create_case(client, p_h, world)
    await _create_case(client, p_h, world)
    staff = auth_headers(world.staff_user)
    r = await client.get(f"{API}/cases", headers=staff, params={"q": case["case_number"]})
    assert r.json()["total"] == 1 and r.json()["items"][0]["id"] == case["id"]
    r = await client.get(f"{API}/cases", headers=staff, params={"q": world.patient.last_name[:4]})
    assert r.json()["total"] == 2
    r = await client.get(f"{API}/cases", headers=staff, params={"q": "%"})
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/cases", headers=staff, params={"status": "quoted"})
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/cases", headers=p_h, params={"page_size": 1})
    body = r.json()
    assert body["total"] == 2 and body["pages"] == 2 and len(body["items"]) == 1


async def test_case_list_rich_filters_sort_and_status_counts(db, client, auth_headers) -> None:
    from datetime import UTC, datetime

    from app.core.enums import CaseStatus, ScreeningStatus, Urgency
    from app.models import Screening

    world = await make_world(db)
    screening = Screening(
        patient_id=world.patient.id, status=ScreeningStatus.COMPLETED, urgency=Urgency.EMERGENCY
    )
    db.add(screening)
    await db.commit()
    old = await create_case(
        db,
        world.patient,
        world.hospital,
        status=CaseStatus.QUOTED,
        coordinator_user_id=world.staff_user.id,
        screening_id=screening.id,
    )
    mid = await create_case(db, world.patient, world.hospital, status=CaseStatus.BOOKED)
    new = await create_case(db, world.patient, world.hospital, agent_id=world.agent.id)
    old.created_at = old.updated_at = datetime(2026, 1, 10, 6, 0, tzinfo=UTC)
    mid.created_at = mid.updated_at = datetime(2026, 2, 10, 6, 0, tzinfo=UTC)
    new.created_at = new.updated_at = datetime(2026, 3, 10, 6, 0, tzinfo=UTC)
    await db.commit()
    staff = auth_headers(world.staff_user)

    async def ids(**params: Any) -> list[str]:
        r = await client.get(f"{API}/cases", headers=staff, params=params)
        assert r.status_code == 200, r.text
        return [item["id"] for item in r.json()["items"]]

    o, m, n = str(old.id), str(mid.id), str(new.id)
    assert await ids() == [n, m, o]  # default: newest first
    assert await ids(sort="created_at") == [o, m, n]
    assert await ids(sort="-updated_at") == [n, m, o]
    assert await ids(sort="case_number") == [o, m, n]
    assert sorted(await ids(status=["quoted", "booked"])) == sorted([o, m])
    assert await ids(status="booked") == [m]
    assert await ids(unassigned="true") == [n, m]
    assert await ids(coordinator_id=str(world.staff_user.id)) == [o]
    assert await ids(urgency=["emergency", "urgent"]) == [o]
    assert await ids(agent_id=str(world.agent.id)) == [n]
    assert await ids(created_from="2026-02-01") == [n, m]
    assert await ids(created_to="2026-02-10") == [m, o]  # inclusive (IST day)
    assert await ids(updated_from="2026-02-10", updated_to="2026-02-10") == [m]
    r = await client.get(f"{API}/cases", headers=staff, params={"sort": "patient_notes"})
    assert r.status_code == 422

    r = await client.get(f"{API}/cases/status-counts", headers=staff, params={"status": "booked"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert body["counts"]["quoted"] == 1 and body["counts"]["booked"] == 1 and body["counts"]["enquiry"] == 1
    assert body["counts"]["completed"] == 0
    r = await client.get(f"{API}/cases/status-counts", headers=staff, params={"created_from": "2026-02-01"})
    assert r.json()["total"] == 2
    # scoping still applies: the hospital-less agent sees only its own case
    r = await client.get(f"{API}/cases/status-counts", headers=auth_headers(world.agent_user))
    assert r.status_code == 200 and r.json()["total"] <= 1


async def test_case_search_matches_hospital_procedure_and_specialty(db, client, auth_headers) -> None:
    from app.core.enums import CaseStatus
    from tests.factories import create_hospital

    world = await make_world(db)
    other_hospital = await create_hospital(db, name="Zenith Ortho Centre")
    by_procedure = await create_case(db, world.patient, world.hospital, procedure_id=world.procedure.id)
    by_specialty = await create_case(db, world.patient, world.hospital, specialty_id=world.specialty.id)
    by_hospital = await create_case(db, world.patient, other_hospital, status=CaseStatus.QUOTED)
    staff = auth_headers(world.staff_user)

    async def ids(q: str, headers: Any = staff) -> set[str]:
        r = await client.get(f"{API}/cases", headers=headers, params={"q": q})
        assert r.status_code == 200, r.text
        return {item["id"] for item in r.json()["items"]}

    assert str(by_procedure.id) in await ids(world.procedure.name[:6].lower())
    assert str(by_specialty.id) in await ids(world.specialty.name.upper())
    assert await ids("zenith ortho") == {str(by_hospital.id)}
    r = await client.get(f"{API}/cases/status-counts", headers=staff, params={"q": "Zenith"})
    assert r.json()["total"] == 1 and r.json()["counts"]["quoted"] == 1
    # scoping: the owning hospital of the other case does not see it, the patient does
    assert await ids("zenith", auth_headers(world.hospital_user)) == set()
    assert await ids("zenith", auth_headers(world.patient_user)) == {str(by_hospital.id)}


async def test_case_filters_by_specialty_procedure_and_doctor(db, client, auth_headers) -> None:
    from tests.factories import create_doctor, create_procedure, create_specialty

    world = await make_world(db)
    other_specialty = await create_specialty(db)
    other_procedure = await create_procedure(db, specialty=other_specialty)
    other_doctor = await create_doctor(db, world.hospital, other_specialty)
    a = await create_case(
        db,
        world.patient,
        world.hospital,
        specialty_id=world.specialty.id,
        procedure_id=world.procedure.id,
        doctor_id=world.doctor.id,
    )
    b = await create_case(
        db,
        world.patient,
        world.hospital,
        specialty_id=other_specialty.id,
        procedure_id=other_procedure.id,
        doctor_id=other_doctor.id,
    )
    await create_case(db, world.patient, world.hospital)
    staff = auth_headers(world.staff_user)

    async def ids(headers: Any = staff, **params: Any) -> set[str]:
        r = await client.get(f"{API}/cases", headers=headers, params=params)
        assert r.status_code == 200, r.text
        return {item["id"] for item in r.json()["items"]}

    assert await ids(specialty_id=str(world.specialty.id)) == {str(a.id)}
    assert await ids(procedure_id=[str(world.procedure.id), str(other_procedure.id)]) == {
        str(a.id),
        str(b.id),
    }
    assert await ids(doctor_id=str(other_doctor.id)) == {str(b.id)}
    assert await ids(doctor_id=str(other_doctor.id), procedure_id=str(world.procedure.id)) == set()
    assert await ids(auth_headers(world.hospital_user), doctor_id=str(world.doctor.id)) == {str(a.id)}
    assert await ids(auth_headers(world.agent_user), doctor_id=str(world.doctor.id)) == set()
    r = await client.get(
        f"{API}/cases/status-counts", headers=staff, params={"specialty_id": str(other_specialty.id)}
    )
    assert r.json()["total"] == 1
    assert (await client.get(f"{API}/cases", headers=staff, params={"doctor_id": "nope"})).status_code == 422
