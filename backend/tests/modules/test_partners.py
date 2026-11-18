"""Insurance & pay-later partners: catalog (public + admin), lead capture with recorded consent, staff queue,
notifications, and the CG-18 instalment rule (plan endpoint, booking refusal, schedule safety net)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.core.enums import ConsentKind
from app.models import Consent, Installment, Notification
from app.modules.cases.common import today_ist
from app.modules.partners.service import max_installment_months
from tests.factories import create_booking, create_case, create_patient, create_user

API = "/api/v1"
PRODUCT = {
    "provider_name": "Sample Assurance",
    "product_name": "Medical Travel Cover",
    "category": "medical_travel",
    "summary": "Covers complications after planned treatment abroad.",
    "countries": ["us", "GB"],
    "price_min_minor": 5000,
    "price_max_minor": 20000,
    "currency": "usd",
    "website_url": "https://example.com/cover",
}


async def _product(client, headers, path="/admin/insurance/products", **over):
    r = await client.post(f"{API}{path}", json={**PRODUCT, **over}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_catalog_admin_crud_and_public_filter(client, make_user, auth_headers):
    admin = auth_headers(await make_user(role="admin"))
    support = auth_headers(await make_user(role="support"))
    p = await _product(client, admin)
    assert p["countries"] == ["US", "GB"] and p["currency"] == "USD" and p["kind"] == "insurance"
    assert (
        await client.post(f"{API}/admin/insurance/products", json=PRODUCT, headers=support)
    ).status_code == 403
    bad = {**PRODUCT, "price_min_minor": 9, "price_max_minor": 1}
    assert (await client.post(f"{API}/admin/insurance/products", json=bad, headers=admin)).status_code == 422
    assert (
        await client.post(
            f"{API}/admin/insurance/products", json={**PRODUCT, "website_url": "http://x"}, headers=admin
        )
    ).status_code == 422
    await _product(client, admin, "/admin/financing/partners", provider_name="PayLater Co", countries=[])

    r = await client.get(f"{API}/insurance/products", params={"country": "gb"})
    assert [x["id"] for x in r.json()] == [p["id"]]
    assert (await client.get(f"{API}/insurance/products", params={"country": "NG"})).json() == []
    assert len((await client.get(f"{API}/financing/partners", params={"country": "NG"})).json()) == 1

    r = await client.patch(
        f"{API}/admin/insurance/products/{p['id']}", json={"is_active": False}, headers=admin
    )
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert (await client.get(f"{API}/insurance/products")).json() == []  # cache cleared on write
    assert len((await client.get(f"{API}/admin/insurance/products", headers=support)).json()) == 1
    # an insurance id is not a pay-later partner
    assert (
        await client.patch(f"{API}/admin/financing/partners/{p['id']}", json={"sort": 1}, headers=admin)
    ).status_code == 404
    assert (
        await client.delete(f"{API}/admin/insurance/products/{p['id']}", headers=admin)
    ).status_code == 204


async def test_lead_capture_consent_queue_and_notifications(client, db, make_user, auth_headers):
    admin_user = await make_user(role="admin")
    admin = auth_headers(admin_user)
    support_user = await make_user(role="support")
    product = await _product(client, admin)
    patient = await create_patient(db)
    user_headers = auth_headers(await db.get(type(admin_user), patient.user_id))
    case = await create_case(db, patient, await _hospital(db))
    body = {
        "product_id": product["id"],
        "case_id": str(case.id),
        "contact_name": "Jane Roe",
        "contact_email": "Jane@Example.com",
        "consent_share_contact": False,
    }
    r = await client.post(f"{API}/insurance/requests", json=body, headers=user_headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_required"
    r = await client.post(
        f"{API}/insurance/requests", json={**body, "consent_share_contact": True}, headers=user_headers
    )
    assert r.status_code == 201, r.text
    lead = r.json()
    assert lead["status"] == "new" and lead["partner_website_url"] == "https://example.com/cover"
    r = await client.post(
        f"{API}/insurance/requests", json={**body, "consent_share_contact": True}, headers=user_headers
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_request"
    consent = (
        await db.execute(
            select(Consent).where(
                Consent.user_id == patient.user_id, Consent.kind == ConsentKind.SHARE_WITH_INSURER
            )
        )
    ).scalar_one()
    assert consent.granted is True and consent.case_id == case.id

    kinds = {n.kind for n in (await db.execute(select(Notification))).scalars()}
    assert {"insurance.request_received", "insurance.request_new"} <= kinds
    staff_note = (
        await db.execute(select(Notification).where(Notification.user_id == support_user.id))
    ).scalar_one()
    assert "Jane Roe" in staff_note.body and f"request={lead['id']}" in staff_note.data["link"]

    # another patient cannot see or cancel it; a stranger's case cannot be linked
    other = await create_user(db, role="patient")
    await create_patient(db, user=other)
    assert (await client.get(f"{API}/insurance/requests", headers=auth_headers(other))).json() == []
    assert (
        await client.post(f"{API}/insurance/requests/{lead['id']}/cancel", headers=auth_headers(other))
    ).status_code == 404
    r = await client.post(
        f"{API}/insurance/requests", json={**body, "consent_share_contact": True}, headers=auth_headers(other)
    )
    assert r.status_code == 404

    # staff queue
    r = await client.get(f"{API}/admin/insurance/requests", headers=auth_headers(support_user))
    item = r.json()["items"][0]
    assert item["contact_email"] == "jane@example.com" and item["case_number"] == case.case_number
    assert item["consent_id"] == str(consent.id) and item["consent_granted_at"]
    r = await client.patch(
        f"{API}/admin/insurance/requests/{lead['id']}",
        json={"status": "shared_with_partner", "staff_note": "sent by email"},
        headers=auth_headers(support_user),
    )
    assert (
        r.status_code == 200
        and r.json()["shared_at"]
        and r.json()["handled_by"]["id"] == str(support_user.id)
    )
    updated = (
        await db.execute(select(Notification).where(Notification.kind == "insurance.request_updated"))
    ).scalar_one()
    assert "Sample Assurance" in updated.body
    r = await client.patch(
        f"{API}/admin/insurance/requests/{lead['id']}", json={"status": "cancelled"}, headers=admin
    )
    assert r.status_code == 400
    counts = (await client.get(f"{API}/admin/insurance/requests/status-counts", headers=admin)).json()
    assert counts["counts"]["shared_with_partner"] == 1 and counts["total"] == 1
    assert (await client.get(f"{API}/admin/insurance/requests", headers=user_headers)).status_code == 403

    # the patient withdraws: status cancelled + a withdrawn consent row
    r = await client.post(f"{API}/insurance/requests/{lead['id']}/cancel", headers=user_headers)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    rows = (
        (
            await db.execute(
                select(Consent.granted).where(
                    Consent.user_id == patient.user_id, Consent.kind == ConsentKind.SHARE_WITH_INSURER
                )
            )
        )
        .scalars()
        .all()
    )
    assert sorted(rows) == [False, True]
    r = await client.post(f"{API}/insurance/requests/{lead['id']}/cancel", headers=user_headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "lead_not_open"


async def test_pay_later_country_rule_and_guest(client, db, make_user, auth_headers):
    admin = auth_headers(await make_user(role="admin"))
    partner = await _product(
        client, admin, "/admin/financing/partners", countries=["AE"], provider_name="Gulf PayLater"
    )
    guest = await create_user(db, role="patient", is_guest=True, email=None)
    await create_patient(db, user=guest, nationality=None, country_of_residence=None)
    body = {
        "partner_id": partner["id"],
        "contact_name": "G",
        "contact_phone": "+971500000000",
        "consent_share_contact": True,
    }
    r = await client.post(f"{API}/financing/eligibility-checks", json=body, headers=auth_headers(guest))
    assert r.status_code == 400 and r.json()["error"]["code"] == "partner_country_not_eligible"
    r = await client.post(
        f"{API}/financing/eligibility-checks", json={**body, "country": "ae"}, headers=auth_headers(guest)
    )
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "pay_later"
    assert (
        len((await client.get(f"{API}/financing/eligibility-checks", headers=auth_headers(guest))).json())
        == 1
    )
    # a pay-later partner id is not an insurance product
    r = await client.post(
        f"{API}/insurance/requests", json={**body, "product_id": partner["id"]}, headers=auth_headers(guest)
    )
    assert r.status_code == 404 and r.json()["error"]["code"] == "offering_not_found"
    r = await client.post(
        f"{API}/financing/eligibility-checks",
        json={**body, "contact_phone": None},
        headers=auth_headers(guest),
    )
    assert r.status_code == 422
    assert (
        await client.post(f"{API}/financing/eligibility-checks", json=body, headers=admin)
    ).status_code == 403


def test_max_installment_months():
    start = date(2026, 1, 31)
    assert max_installment_months(start, date(2026, 2, 27)) == 0
    assert max_installment_months(start, date(2026, 3, 1)) == 1  # Feb 28 < Mar 1
    assert max_installment_months(start, date(2026, 4, 30)) == 2  # Mar 31 ok, Apr 30 is not before Apr 30
    assert max_installment_months(start, date(2030, 1, 1)) == 24


async def test_installment_plan_endpoint(client, db, make_user, auth_headers):
    headers = auth_headers(await make_user(role="patient"))
    admission = today_ist() + timedelta(days=75)
    r = await client.get(
        f"{API}/financing/installment-plan",
        params={"admission_date": admission.isoformat(), "months": 2, "total_minor": 100_000},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["max_months"] == 2 and d["allowed_months"] == [1, 2] and d["valid"] is True
    assert d["interest_free"] is True and d["last_due_by"] == (admission - timedelta(days=1)).isoformat()
    assert len(d["schedule"]) == 3 and sum(x["amount_minor"] for x in d["schedule"]) == 100_000
    assert all(x["due_date"] < admission.isoformat() for x in d["schedule"])
    assert d["partner_financing_available"] is False
    r = await client.get(
        f"{API}/financing/installment-plan",
        params={"admission_date": (today_ist() + timedelta(days=10)).isoformat(), "months": 3},
        headers=headers,
    )
    assert r.json()["max_months"] == 0 and r.json()["valid"] is False and r.json()["schedule"] == []
    assert (
        await client.get(
            f"{API}/financing/installment-plan", params={"admission_date": admission.isoformat()}
        )
    ).status_code == 401


async def test_booking_refuses_installments_past_treatment(client, db, auth_headers):
    from tests.modules.cases_helpers import make_world

    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital)
    body = {
        "case_id": str(case.id),
        "package_id": str(world.package.id),
        "admission_date": (today_ist() + timedelta(days=20)).isoformat(),
        "payment_option": "installments",
        "installment_months": 6,
    }
    r = await client.post(f"{API}/bookings", json=body, headers=auth_headers(world.patient_user))
    assert r.status_code == 400 and r.json()["error"]["code"] == "installments_past_treatment"
    assert r.json()["error"]["details"]["max_months"] == 0
    admission = today_ist() + timedelta(days=200)
    body.update(admission_date=admission.isoformat())
    r = await client.post(f"{API}/bookings", json=body, headers=auth_headers(world.patient_user))
    assert r.status_code == 201, r.text


async def test_schedule_never_reaches_admission(db):
    from app.core.events import publish
    from tests.modules.payments_helpers import make_world as pay_world

    w = await pay_world(db, payment_option="installments", installment_months=6)
    w.booking.admission_date = today_ist() + timedelta(days=40)
    w.booking.discharge_date = today_ist() + timedelta(days=45)
    await db.commit()
    await publish(db, "booking.created", {"booking_id": str(w.booking.id)})
    await db.commit()
    rows = (
        (await db.execute(select(Installment).where(Installment.booking_id == w.booking.id))).scalars().all()
    )
    assert len(rows) == 7 and all(r.due_date < w.booking.admission_date for r in rows)


async def _hospital(db):
    from tests.factories import create_hospital

    return await create_hospital(db, slug=f"h-{uuid.uuid4().hex[:6]}")


async def test_booking_factory_unaffected(db):
    # sanity: the factory still builds bookings with a future admission date
    patient = await create_patient(db)
    case = await create_case(db, patient, await _hospital(db))
    booking = await create_booking(db, case)
    assert booking.admission_date > date.today()
