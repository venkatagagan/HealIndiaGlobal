"""Patients module tests (PLAN 8.2): profile encryption/masking, companions, saved items, dashboard."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select, text

from app.core.enums import (
    BookingStatus,
    CaseStatus,
    ChecklistKey,
    ChecklistStatus,
    HospitalStatus,
    ItineraryKind,
    ItineraryStatus,
    ScreeningStatus,
    Urgency,
)
from app.models import ChecklistItem, ItineraryItem, Notification, PatientProfile, Screening
from app.modules.patients.service import IST, ist_today
from tests.factories import (
    create_booking,
    create_case,
    create_doctor,
    create_hospital,
    create_hospital_procedure,
    create_package,
    create_patient,
    create_procedure,
    create_specialty,
)
from tests.modules.auth_helpers import API


async def _patient(make_user, db, **profile_fields):
    user = await make_user(role="patient", full_name="Jane Doe")
    profile = await create_patient(db, user=user, **profile_fields)
    return user, profile


# --------------------------------------------------------------------------------------------- profile
async def test_profile_get_creates_missing_profile(client, db, make_user, auth_headers) -> None:
    user = await make_user(role="patient", full_name="Omar Haddad", country_code="AE")
    r = await client.get(f"{API}/patient/profile", headers=auth_headers(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == str(user.id) and body["first_name"] == "Omar" and body["last_name"] == "Haddad"
    assert body["nationality"] == "AE" and body["preferred_currency"] == "AED"  # currency follows the country
    assert body["passport_last4"] is None and "passport_number" not in body
    again = await client.get(f"{API}/patient/profile", headers=auth_headers(user))
    assert again.json()["id"] == body["id"]


async def test_profile_update_encrypts_and_masks(client, db, make_user, auth_headers) -> None:
    user, profile = await _patient(make_user, db)
    profile_id = profile.id
    headers = auth_headers(user)
    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "date_of_birth": "1975-04-12",
        "gender": "female",
        "nationality": "us",
        "country_of_residence": "US",
        "passport_number": "x1234 5678",
        "passport_expiry": "2031-01-31",
        "phone": "+1-202-555-0143",
        "address": {"line1": "1 Main St", "city": "Austin", "country": "US"},
        "emergency_contact": {"name": "John Doe", "relationship": "spouse", "phone": "+1-202-555-0199"},
        "preferred_language": "en",
        "blood_group": "o+",
        "insurance_provider": "Aetna",
        "insurance_policy_number": "POL-99887766",
        "preferred_currency": "eur",
    }
    r = await client.put(f"{API}/patient/profile", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "X12345678" not in r.text and "99887766" not in r.text
    assert body["passport_last4"] == "5678" and body["insurance_policy_last4"] == "7766"
    assert body["nationality"] == "US" and body["blood_group"] == "O+" and body["preferred_currency"] == "EUR"
    assert body["emergency_contact"]["relationship"] == "spouse"
    assert body["address"] == {"line1": "1 Main St", "city": "Austin", "country": "US"}
    assert body["full_name"] == "Jane Doe"

    raw = (
        await db.execute(
            text("SELECT passport_number, insurance_policy_number FROM patient_profiles WHERE id = :id"),
            {"id": profile_id},
        )
    ).one()
    assert raw[0].startswith("v1:") and "1234" not in raw[0]
    assert raw[1].startswith("v1:")
    db.expire_all()
    stored = await db.get(PatientProfile, profile_id)
    assert stored is not None and stored.passport_number == "X12345678"
    assert stored.insurance_policy_number == "POL-99887766"

    # Explicit null clears the passport; omitted fields are untouched.
    r = await client.put(f"{API}/patient/profile", json={"passport_number": None}, headers=headers)
    assert r.status_code == 200
    assert r.json()["passport_last4"] is None and r.json()["insurance_policy_last4"] == "7766"
    assert r.json()["first_name"] == "Jane"


async def test_profile_validation_and_role(client, db, make_user, auth_headers) -> None:
    user, _ = await _patient(make_user, db)
    headers = auth_headers(user)
    cases = [
        ({"preferred_currency": "XYZ"}, 400, "unsupported_currency"),
        ({"nationality": "USA"}, 422, "validation_error"),
        ({"passport_number": "../../etc"}, 422, "validation_error"),
        ({"blood_group": "Z+"}, 422, "validation_error"),
        ({"date_of_birth": "2999-01-01"}, 422, "validation_error"),
        ({"managed_by_agent_id": "0190f000-0000-7000-8000-000000000000"}, 422, "validation_error"),
        ({"emergency_contact": {"name": "x"}}, 422, "validation_error"),
    ]
    for payload, status, code in cases:
        r = await client.put(f"{API}/patient/profile", json=payload, headers=headers)
        assert r.status_code == status, (payload, r.text)
        assert r.json()["error"]["code"] == code

    hospital_user = await make_user(role="hospital")
    assert (
        await client.get(f"{API}/patient/profile", headers=auth_headers(hospital_user))
    ).status_code == 403
    assert (await client.get(f"{API}/patient/profile")).status_code == 401


# --------------------------------------------------------------------------------------------- companions
async def test_companions_crud_and_scoping(client, db, make_user, auth_headers) -> None:
    owner, _ = await _patient(make_user, db)
    other, _ = await _patient(make_user, db)
    headers = auth_headers(owner)

    r = await client.post(
        f"{API}/patient/companions",
        json={
            "full_name": "John Doe",
            "relationship": "spouse",
            "nationality": "us",
            "passport_number": "P9876543",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    companion = r.json()
    assert companion["passport_last4"] == "6543" and "P9876543" not in r.text
    assert companion["nationality"] == "US"
    cid = companion["id"]

    r = await client.patch(
        f"{API}/patient/companions/{cid}", json={"relationship": "husband"}, headers=headers
    )
    assert r.status_code == 200 and r.json()["relationship"] == "husband"
    r = await client.put(
        f"{API}/patient/companions/{cid}", json={"passport_number": "Q11112222"}, headers=headers
    )
    assert r.status_code == 200 and r.json()["passport_last4"] == "2222"
    listing = await client.get(f"{API}/patient/companions", headers=headers)
    assert [c["id"] for c in listing.json()] == [cid]

    other_headers = auth_headers(other)
    assert (await client.get(f"{API}/patient/companions", headers=other_headers)).json() == []
    for method in ("GET", "PATCH", "DELETE"):
        kwargs = {"json": {"relationship": "x"}} if method == "PATCH" else {}
        r = await client.request(method, f"{API}/patient/companions/{cid}", headers=other_headers, **kwargs)
        assert r.status_code == 404, (method, r.text)

    assert (await client.delete(f"{API}/patient/companions/{cid}", headers=headers)).status_code == 204
    assert (await client.get(f"{API}/patient/companions/{cid}", headers=headers)).status_code == 404


# --------------------------------------------------------------------------------------------- saved items
async def _catalog(db):
    specialty = await create_specialty(db, name="Orthopedics")
    procedure = await create_procedure(db, specialty=specialty, name="Total Knee Replacement")
    hospital = await create_hospital(db)
    doctor = await create_doctor(db, hospital, specialty)
    hp = await create_hospital_procedure(db, hospital, procedure, price_min_minor=4_50_000_00)
    await create_package(db, hp)
    return specialty, procedure, hospital, doctor


async def test_saved_items_with_cards(client, db, make_user, auth_headers) -> None:
    user, _ = await _patient(make_user, db)
    other, _ = await _patient(make_user, db)
    _, procedure, hospital, doctor = await _catalog(db)
    headers = auth_headers(user)

    saved_ids = {}
    for entity_type, entity_id in (
        ("hospital", hospital.id),
        ("doctor", doctor.id),
        ("procedure", procedure.id),
    ):
        r = await client.post(
            f"{API}/patient/saved",
            json={"entity_type": entity_type, "entity_id": str(entity_id)},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body[entity_type]["id"] == str(entity_id)
        saved_ids[entity_type] = body["id"]
    # Saving twice is idempotent.
    r = await client.post(
        f"{API}/patient/saved",
        json={"entity_type": "hospital", "entity_id": str(hospital.id)},
        headers=headers,
    )
    assert r.status_code == 201 and r.json()["id"] == saved_ids["hospital"]

    items = (await client.get(f"{API}/patient/saved", headers=headers)).json()
    assert len(items) == 3
    by_type = {i["entity_type"]: i for i in items}
    hospital_card = by_type["hospital"]["hospital"]
    assert hospital_card["name"] == hospital.name and hospital_card["starting_price_minor"] == 4_50_000_00
    assert by_type["doctor"]["doctor"]["hospital"]["id"] == str(hospital.id)
    assert by_type["doctor"]["doctor"]["specialty"]["name"] == "Orthopedics"
    assert by_type["procedure"]["procedure"]["name"] == "Total Knee Replacement"
    assert by_type["hospital"]["doctor"] is None

    only_doctors = (
        await client.get(f"{API}/patient/saved", params={"entity_type": "doctor"}, headers=headers)
    ).json()
    assert [i["entity_type"] for i in only_doctors] == ["doctor"]
    assert (await client.get(f"{API}/patient/saved", headers=auth_headers(other))).json() == []

    # Unknown or inactive entities cannot be saved.
    r = await client.post(
        f"{API}/patient/saved",
        json={"entity_type": "hospital", "entity_id": "0190f000-0000-7000-8000-000000000000"},
        headers=headers,
    )
    assert r.status_code == 404
    draft = await create_hospital(db, status=HospitalStatus.DRAFT)
    r = await client.post(
        f"{API}/patient/saved", json={"entity_type": "hospital", "entity_id": str(draft.id)}, headers=headers
    )
    assert r.status_code == 404

    # Delete by query parameters, and by id (scoped to the owner).
    r = await client.delete(
        f"{API}/patient/saved",
        params={"entity_type": "procedure", "entity_id": str(procedure.id)},
        headers=headers,
    )
    assert r.status_code == 204
    r = await client.delete(f"{API}/patient/saved/{saved_ids['doctor']}", headers=auth_headers(other))
    assert r.status_code == 404
    r = await client.delete(f"{API}/patient/saved/{saved_ids['doctor']}", headers=headers)
    assert r.status_code == 204
    remaining = (await client.get(f"{API}/patient/saved", headers=headers)).json()
    assert [i["entity_type"] for i in remaining] == ["hospital"]
    r = await client.delete(f"{API}/patient/saved", headers=headers)
    assert r.status_code == 400


# --------------------------------------------------------------------------------------------- dashboard
async def test_dashboard_empty(client, db, make_user, auth_headers) -> None:
    user, _ = await _patient(make_user, db)
    r = await client.get(f"{API}/patient/dashboard", headers=auth_headers(user))
    assert r.status_code == 200, r.text
    assert r.json() == {
        "next_booking": None,
        "days_until_treatment": None,
        "checklist": [],
        "today_schedule": [],
        "active_cases": 0,
        "unread_notifications": 0,
        "coordinator": None,
        "recent_screenings": [],
    }


async def test_dashboard_full(client, db, make_user, auth_headers) -> None:
    user, profile = await _patient(make_user, db)
    coordinator = await make_user(role="support", full_name="Priya Coordinator", phone="+91-11-4000-0001")
    specialty, procedure, hospital, doctor = await _catalog(db)
    today = ist_today()

    case = await create_case(
        db,
        profile,
        hospital,
        status=CaseStatus.BOOKED,
        coordinator_user_id=coordinator.id,
        doctor_id=doctor.id,
        procedure_id=procedure.id,
    )
    booking = await create_booking(
        db,
        case,
        status=BookingStatus.CONFIRMED,
        admission_date=today + timedelta(days=12),
        doctor_id=doctor.id,
        procedure_id=procedure.id,
        amount_paid_minor=80_000_00,
    )
    # Not chosen: a later confirmed booking, a pending one and one in the past.
    later_case = await create_case(db, profile, hospital, status=CaseStatus.BOOKED)
    await create_booking(
        db, later_case, status=BookingStatus.CONFIRMED, admission_date=today + timedelta(days=40)
    )
    pending_case = await create_case(db, profile, hospital, status=CaseStatus.ACCEPTED)
    await create_booking(
        db, pending_case, status=BookingStatus.PENDING_PAYMENT, admission_date=today + timedelta(days=2)
    )
    past_case = await create_case(db, profile, hospital, status=CaseStatus.IN_TREATMENT)
    await create_booking(
        db, past_case, status=BookingStatus.ADMITTED, admission_date=today - timedelta(days=3)
    )
    await create_case(db, profile, hospital, status=CaseStatus.CANCELLED)

    db.add_all(
        [
            ChecklistItem(
                case_id=case.id,
                key=ChecklistKey.VISA_APPROVED,
                label="Visa approved",
                status=ChecklistStatus.PENDING,
                sort_order=2,
            ),
            ChecklistItem(
                case_id=case.id,
                key=ChecklistKey.TREATMENT_BOOKED,
                label="Treatment booked",
                status=ChecklistStatus.DONE,
                done_at=datetime.now(UTC),
                sort_order=1,
            ),
        ]
    )
    noon_today = datetime.combine(today, time(12, 0), tzinfo=IST)
    db.add_all(
        [
            ItineraryItem(
                case_id=past_case.id,
                kind=ItineraryKind.APPOINTMENT,
                title="Physio session",
                starts_at=noon_today,
                status=ItineraryStatus.SCHEDULED,
            ),
            ItineraryItem(
                case_id=past_case.id,
                kind=ItineraryKind.FOLLOWUP,
                title="Morning review",
                starts_at=noon_today - timedelta(hours=3),
                status=ItineraryStatus.SCHEDULED,
            ),
            ItineraryItem(
                case_id=past_case.id,
                kind=ItineraryKind.OTHER,
                title="Cancelled tour",
                starts_at=noon_today,
                status=ItineraryStatus.CANCELLED,
            ),
            ItineraryItem(
                case_id=past_case.id,
                kind=ItineraryKind.CHECKOUT,
                title="Tomorrow",
                starts_at=noon_today + timedelta(days=1),
                status=ItineraryStatus.SCHEDULED,
            ),
            Notification(user_id=user.id, kind="booking.confirmed", title="Booking confirmed"),
            Notification(user_id=user.id, kind="x", title="Read one", read_at=datetime.now(UTC)),
            Screening(
                patient_id=profile.id,
                specialty_id=specialty.id,
                status=ScreeningStatus.COMPLETED,
                urgency=Urgency.ROUTINE,
                ai_result={"summary": "Likely osteoarthritis of the knee."},
            ),
        ]
    )
    await db.commit()

    r = await client.get(f"{API}/patient/dashboard", headers=auth_headers(user))
    assert r.status_code == 200, r.text
    body = r.json()
    nb = body["next_booking"]
    assert nb["id"] == str(booking.id) and nb["booking_number"] == booking.booking_number
    assert nb["hospital"]["id"] == str(hospital.id) and nb["doctor"]["full_name"] == doctor.full_name
    assert nb["procedure"]["name"] == "Total Knee Replacement" and nb["patient"]["full_name"] == "Jane Doe"
    assert nb["balance_due_minor"] == nb["total_minor"] - 80_000_00
    assert body["days_until_treatment"] == 12
    assert [c["key"] for c in body["checklist"]] == ["treatment_booked", "visa_approved"]
    assert [i["title"] for i in body["today_schedule"]] == ["Morning review", "Physio session"]
    assert body["active_cases"] == 4
    assert body["unread_notifications"] == 1
    assert body["coordinator"] == {
        "id": str(coordinator.id),
        "full_name": "Priya Coordinator",
        "phone": "+91-11-4000-0001",
    }
    [screening] = body["recent_screenings"]
    assert screening["summary"] == "Likely osteoarthritis of the knee."
    assert screening["specialty"]["slug"] == specialty.slug and screening["urgency"] == "routine"

    # Another patient sees none of it.
    other, _ = await _patient(make_user, db)
    other_body = (await client.get(f"{API}/patient/dashboard", headers=auth_headers(other))).json()
    assert other_body["next_booking"] is None and other_body["active_cases"] == 0
    rows = (await db.execute(select(Notification).where(Notification.user_id == other.id))).scalars().all()
    assert rows == []
