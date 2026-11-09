"""Travel desk: visa flow, travel/accommodation/service bookings, checklist sync, SOS and scoping."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select

from app.core import realtime
from app.models import AccommodationProvider, Case, ChecklistItem, ServiceProvider
from app.modules.cases.common import today_ist
from tests.factories import create_booking, create_case, create_quote, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    capture_payment,
    event_log_fixture,
    make_document,
    make_world,
)

API = "/api/v1"


async def _booked_case(db: Any, world: Any) -> Case:
    """Accepted case + booking confirmed through a captured deposit (so the checklist exists)."""
    case = await create_case(db, world.patient, world.hospital, status="accepted")
    await create_quote(db, case, status="accepted")
    booking = await create_booking(db, case)
    await capture_payment(db, booking, booking.deposit_minor)
    return case


async def _checklist(db: Any, case_id: Any) -> dict[str, str]:
    rows = (
        await db.execute(
            select(ChecklistItem.key, ChecklistItem.status)
            .where(ChecklistItem.case_id == case_id)
            .execution_options(populate_existing=True)
        )
    ).all()
    return {str(k.value): str(s.value) for k, s in rows}


@pytest.fixture
def realtime_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, dict[str, Any]]]:
    calls: list[tuple[str, str, dict[str, Any]]] = []

    async def fake_send(user_id: Any, event_type: str, data: Any = None) -> None:
        calls.append((str(user_id), event_type, data or {}))

    monkeypatch.setattr(realtime.hub, "send_to_user", fake_send)
    return calls


async def test_visa_flow_and_checklist_sync(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)

    r = await client.post(f"{API}/travel/visa-requests", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 201, r.text
    visa = r.json()
    assert visa["status"] == "documents_pending" and visa["visa_type"] == "e_medical"
    assert visa["case_number"] == case.case_number
    assert (await _checklist(db, case.id))["visa_approved"] == "in_progress"
    r = await client.post(f"{API}/travel/visa-requests", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 409

    url = f"{API}/travel/visa-requests/{visa['id']}"
    # patients cannot issue invitations or approve
    r = await client.patch(url, json={"status": "approved"}, headers=p_h)
    assert r.status_code == 403
    # the invitation letter must be an invitation_letter document linked to the case/hospital
    wrong = await make_document(db, world.hospital_user, kind="medical_report", case_id=case.id)
    r = await client.patch(url, json={"invitation_letter_document_id": str(wrong.id)}, headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_document_kind"
    stranger_doc = await make_document(db, world.agent_user, kind="invitation_letter")
    r = await client.patch(url, json={"invitation_letter_document_id": str(stranger_doc.id)}, headers=h_h)
    assert r.status_code == 404
    letter = await make_document(
        db, world.hospital_user, kind="invitation_letter", case_id=case.id, hospital_id=world.hospital.id
    )
    r = await client.patch(url, json={"invitation_letter_document_id": str(letter.id)}, headers=h_h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "invitation_issued"
    assert r.json()["invitation_letter_document_id"] == str(letter.id)

    # the patient records their e-visa application
    r = await client.patch(url, json={"status": "applied", "application_reference": "EMED123"}, headers=p_h)
    assert r.status_code == 200 and r.json()["status"] == "applied" and r.json()["applied_at"]
    r = await client.patch(url, json={"status": "invitation_issued"}, headers=h_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"
    r = await client.patch(url, json={"status": "approved"}, headers=auth_headers(world.staff_user))
    assert r.status_code == 200 and r.json()["status"] == "approved" and r.json()["decided_at"]
    assert (await _checklist(db, case.id))["visa_approved"] == "done"

    # scoping
    r = await client.get(f"{API}/travel/visa-requests", headers=p_h)
    assert r.json()["total"] == 1
    r = await client.get(url, headers=auth_headers(world.agent_patient_user))
    assert r.status_code == 404
    r = await client.patch(url, json={"notes": "x"}, headers=auth_headers(world.agent_patient_user))
    assert r.status_code == 404


async def test_visa_rejection_downgrades_checklist(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    staff = auth_headers(world.staff_user)
    visa = (
        await client.post(
            f"{API}/travel/visa-requests",
            json={"case_id": str(case.id)},
            headers=auth_headers(world.patient_user),
        )
    ).json()
    url = f"{API}/travel/visa-requests/{visa['id']}"
    assert (await client.patch(url, json={"status": "applied"}, headers=staff)).status_code == 200
    r = await client.patch(url, json={"status": "rejected"}, headers=staff)
    assert r.status_code == 200
    assert (await _checklist(db, case.id))["visa_approved"] == "pending"
    r = await client.patch(url, json={"status": "documents_pending"}, headers=staff)
    assert r.status_code == 200


async def test_flight_and_pickup_bookings(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    p_h = auth_headers(world.patient_user)
    staff = auth_headers(world.staff_user)
    r = await client.post(
        f"{API}/travel/travel-bookings",
        json={
            "case_id": str(case.id),
            "kind": "flight",
            "from_location": "Lagos (LOS)",
            "to_location": "Delhi (DEL)",
            "passengers": 2,
        },
        headers=p_h,
    )
    assert r.status_code == 201, r.text
    flight = r.json()
    assert flight["status"] == "requested" and flight["passengers"] == 2
    assert (await _checklist(db, case.id))["flight_booked"] == "in_progress"
    url = f"{API}/travel/travel-bookings/{flight['id']}"

    # the patient may edit the request while still requested but not confirm it
    r = await client.patch(url, json={"passengers": 1}, headers=p_h)
    assert r.status_code == 200 and r.json()["passengers"] == 1
    assert (await client.patch(url, json={"status": "confirmed"}, headers=p_h)).status_code == 403
    assert (await client.patch(url, json={"pnr": "ABC123"}, headers=p_h)).status_code == 403

    r = await client.patch(url, json={"status": "quoted"}, headers=staff)
    assert r.status_code == 400 and r.json()["error"]["code"] == "price_required"
    r = await client.patch(
        url, json={"status": "quoted", "price_minor": 95_000_00, "currency": "inr"}, headers=staff
    )
    assert r.status_code == 200 and r.json()["status"] == "quoted" and r.json()["currency"] == "INR"
    assert (await client.patch(url, json={"passengers": 3}, headers=p_h)).status_code == 400
    r = await client.patch(
        url,
        json={"status": "confirmed", "carrier": "Air India", "flight_number": "AI 924", "pnr": "XY7Q2"},
        headers=staff,
    )
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert (await _checklist(db, case.id))["flight_booked"] == "done"

    # cancelling the only confirmed flight puts the checklist item back
    r = await client.patch(url, json={"status": "cancelled"}, headers=staff)
    assert r.status_code == 200
    assert (await _checklist(db, case.id))["flight_booked"] == "pending"
    r = await client.patch(url, json={"status": "confirmed"}, headers=staff)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"

    # the hospital team can confirm an airport pickup directly
    pickup = (
        await client.post(
            f"{API}/travel/travel-bookings",
            json={"case_id": str(case.id), "kind": "airport_pickup"},
            headers=p_h,
        )
    ).json()
    r = await client.patch(
        f"{API}/travel/travel-bookings/{pickup['id']}",
        json={"status": "confirmed"},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 200, r.text
    assert (await _checklist(db, case.id))["airport_pickup"] == "done"

    r = await client.get(f"{API}/travel/travel-bookings", headers=p_h, params={"kind": "flight"})
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/travel/travel-bookings", headers=auth_headers(world.agent_patient_user))
    assert r.json()["total"] == 0
    r = await client.get(url, headers=auth_headers(world.agent_patient_user))
    assert r.status_code == 404


async def test_accommodation_booking(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    provider = AccommodationProvider(
        name="Green Stay",
        type="service_apartment",
        city="New Delhi",
        nightly_rate_minor=4_500_00,
        currency="INR",
    )
    inactive = AccommodationProvider(name="Closed", type="hotel", is_active=False)
    db.add_all([provider, inactive])
    await db.commit()
    p_h = auth_headers(world.patient_user)
    check_in = today_ist() + timedelta(days=28)
    body = {
        "case_id": str(case.id),
        "provider_id": str(provider.id),
        "check_in": check_in.isoformat(),
        "check_out": (check_in + timedelta(days=10)).isoformat(),
        "guests": 2,
    }
    r = await client.post(f"{API}/travel/accommodation-bookings", json=body, headers=p_h)
    assert r.status_code == 201, r.text
    acc = r.json()
    assert acc["nights"] == 10 and acc["total_minor"] == 45_000_00 and acc["provider"]["name"] == "Green Stay"
    assert (await _checklist(db, case.id))["accommodation_booked"] == "in_progress"
    r = await client.post(
        f"{API}/travel/accommodation-bookings", json={**body, "provider_id": str(inactive.id)}, headers=p_h
    )
    assert r.status_code == 404
    r = await client.post(
        f"{API}/travel/accommodation-bookings", json={**body, "check_out": body["check_in"]}, headers=p_h
    )
    assert r.status_code == 422

    url = f"{API}/travel/accommodation-bookings/{acc['id']}"
    assert (await client.patch(url, json={"status": "confirmed"}, headers=p_h)).status_code == 403
    r = await client.patch(
        url,
        json={"status": "confirmed", "nightly_rate_minor": 4_000_00, "confirmation_code": "GS-77"},
        headers=auth_headers(world.staff_user),
    )
    assert r.status_code == 200, r.text
    assert r.json()["total_minor"] == 40_000_00 and r.json()["status"] == "confirmed"
    assert (await _checklist(db, case.id))["accommodation_booked"] == "done"
    r = await client.patch(url, json={"status": "cancelled"}, headers=p_h)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert (await _checklist(db, case.id))["accommodation_booked"] == "pending"


async def test_service_bookings_and_insurance_sync(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    translator = ServiceProvider(
        kind="translator", name="Arabic Interpreters", languages=["ar", "en"], currency="INR"
    )
    insurer = ServiceProvider(kind="insurance", name="TravelSafe", currency="USD")
    db.add_all([translator, insurer])
    await db.commit()
    p_h = auth_headers(world.patient_user)
    r = await client.post(
        f"{API}/travel/service-bookings",
        json={"case_id": str(case.id), "kind": "local_guide", "provider_id": str(translator.id)},
        headers=p_h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_provider"
    r = await client.post(
        f"{API}/travel/service-bookings",
        json={"case_id": str(case.id), "kind": "translator", "provider_id": str(translator.id)},
        headers=p_h,
    )
    assert r.status_code == 201 and r.json()["provider"]["languages"] == ["ar", "en"]
    r = await client.post(
        f"{API}/travel/service-bookings",
        json={"case_id": str(case.id), "kind": "insurance", "provider_id": str(insurer.id)},
        headers=p_h,
    )
    assert r.status_code == 201 and r.json()["currency"] == "USD"
    ins_id = r.json()["id"]
    r = await client.patch(
        f"{API}/travel/service-bookings/{ins_id}",
        json={"status": "confirmed", "price_minor": 120_00},
        headers=auth_headers(world.staff_user),
    )
    assert r.status_code == 200
    assert (await _checklist(db, case.id))["travel_insurance"] == "done"
    r = await client.get(f"{API}/travel/service-bookings", headers=p_h, params={"kind": "translator"})
    assert r.json()["total"] == 1


async def test_travel_requests_blocked_on_cancelled_case(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, status="cancelled")
    r = await client.post(
        f"{API}/travel/travel-bookings",
        json={"case_id": str(case.id), "kind": "flight"},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_state"
    r = await client.post(
        f"{API}/travel/travel-bookings",
        json={"case_id": str(case.id), "kind": "flight"},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 403


async def test_sos_flow(db, client, auth_headers, event_log: EventLog, realtime_calls) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    coordinator = await create_user(db, role="support")
    await db.execute(
        Case.__table__.update().where(Case.id == case.id).values(coordinator_user_id=coordinator.id)
    )
    await db.commit()
    p_h = auth_headers(world.patient_user)

    r = await client.post(
        f"{API}/travel/sos", json={"lat": 28.61, "lng": 77.2, "message": "Chest pain at hotel"}, headers=p_h
    )
    assert r.status_code == 201, r.text
    sos = r.json()
    assert sos["status"] == "open" and sos["case_id"] == str(case.id)  # attached to the active case
    assert sos["coordinator"]["id"] == str(coordinator.id)
    published = event_log.of("sos.created")
    assert published and published[0]["sos_id"] == sos["id"]
    assert published[0]["coordinator_user_id"] == str(coordinator.id)
    notified = {uid for uid, kind, _ in realtime_calls if kind == "sos.created"}
    assert str(coordinator.id) in notified and str(world.staff_user.id) in notified

    # visibility
    r = await client.get(
        f"{API}/travel/sos", headers=auth_headers(world.staff_user), params={"status": "open"}
    )
    assert r.json()["total"] == 1
    assert (await client.get(f"{API}/travel/sos", headers=p_h)).json()["total"] == 1
    assert (await client.get(f"{API}/travel/sos", headers=auth_headers(world.agent_patient_user))).json()[
        "total"
    ] == 0
    assert (
        await client.get(f"{API}/travel/sos", headers=auth_headers(world.hospital_user))
    ).status_code == 403
    assert (
        await client.post(f"{API}/travel/sos", json={}, headers=auth_headers(world.hospital_user))
    ).status_code == 403

    url = f"{API}/travel/sos/{sos['id']}"
    assert (await client.patch(url, json={"status": "resolved"}, headers=p_h)).status_code == 403
    r = await client.patch(url, json={"status": "acknowledged"}, headers=auth_headers(coordinator))
    assert r.status_code == 200 and r.json()["acknowledged_by"]["id"] == str(coordinator.id)
    assert any(uid == str(world.patient_user.id) and kind == "sos.updated" for uid, kind, _ in realtime_calls)
    updated = event_log.of("sos.updated")
    assert updated[-1]["status"] == "acknowledged" and updated[-1]["responder_user_id"] == str(coordinator.id)
    r = await client.patch(
        url, json={"status": "resolved", "note": "Ambulance sent"}, headers=auth_headers(coordinator)
    )
    assert r.status_code == 200 and r.json()["resolved_at"]
    r = await client.patch(url, json={"status": "acknowledged"}, headers=auth_headers(coordinator))
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_transition"

    # agents raise SOS for a case in scope only
    r = await client.post(f"{API}/travel/sos", json={}, headers=auth_headers(world.agent_user))
    assert r.status_code == 400
    r = await client.post(
        f"{API}/travel/sos", json={"case_id": str(case.id)}, headers=auth_headers(world.agent_user)
    )
    assert r.status_code == 404


async def test_travel_list_filters_and_status_counts(db, client, auth_headers) -> None:
    world = await make_world(db)
    case = await _booked_case(db, world)
    p_h = auth_headers(world.patient_user)
    staff = auth_headers(world.staff_user)
    depart = (today_ist() + timedelta(days=10)).isoformat()
    for kind, depart_at in (("flight", f"{depart}T09:00:00+05:30"), ("airport_pickup", None)):
        body: dict[str, Any] = {"case_id": str(case.id), "kind": kind}
        if depart_at:
            body["depart_at"] = depart_at
        assert (await client.post(f"{API}/travel/travel-bookings", json=body, headers=p_h)).status_code == 201

    async def kinds(**params: Any) -> list[str]:
        r = await client.get(f"{API}/travel/travel-bookings", headers=staff, params=params)
        assert r.status_code == 200, r.text
        return sorted(x["kind"] for x in r.json()["items"])

    assert await kinds(kind=["flight", "airport_pickup"]) == ["airport_pickup", "flight"]
    assert await kinds(status=["requested", "quoted"]) == ["airport_pickup", "flight"]
    assert await kinds(status="confirmed") == []
    assert await kinds(**{"from": depart, "to": depart}) == ["flight"]
    assert await kinds(q=world.patient.first_name) == ["airport_pickup", "flight"]
    assert await kinds(q="nobody-by-this-name") == []

    r = await client.get(
        f"{API}/travel/status-counts", headers=staff, params={"resource": "travel", "kind": "flight"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["counts"]["requested"] == 1 and r.json()["total"] == 1
    r = await client.get(f"{API}/travel/status-counts", headers=staff, params={"resource": "sos"})
    assert r.status_code == 200 and set(r.json()["counts"]) == {"open", "acknowledged", "resolved"}
    r = await client.get(f"{API}/travel/status-counts", headers=staff, params={"resource": "visa"})
    assert r.status_code == 200 and r.json()["total"] == 0
    assert (await client.get(f"{API}/travel/status-counts", headers=staff)).status_code == 422
    # scoping: an unrelated agent sees nothing
    r = await client.get(
        f"{API}/travel/status-counts", headers=auth_headers(world.agent_user), params={"resource": "travel"}
    )
    assert r.json()["total"] == 0
