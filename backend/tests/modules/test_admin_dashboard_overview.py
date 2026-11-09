"""Staff dashboard overview: work queue, period KPIs vs the previous period, series, funnel, admissions."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.core.enums import CaseStatus, QuoteStatus, ScreeningStatus, SosStatus, Urgency
from app.models import PatientProfile, Quote, Screening, SosAlert
from app.modules.admin.dashboard import period_range
from app.modules.admin.reports import today_ist
from tests.factories import create_agent, create_case, create_hospital
from tests.modules.admin_helpers import build_world, capture_payment

API = "/api/v1"


def test_period_range():
    d = date(2026, 10, 21)
    assert period_range("7d", d) == (date(2026, 10, 15), d, date(2026, 10, 8), date(2026, 10, 14))
    assert period_range("30d", d)[0] == date(2026, 9, 22)
    start, end, prev_start, prev_end = period_range("mtd", d)
    assert (start, end) == (date(2026, 10, 1), d)
    assert (prev_start, prev_end) == (date(2026, 9, 10), date(2026, 9, 30))


async def test_overview_empty(client, make_user, auth_headers):
    r = await client.get(
        f"{API}/admin/dashboard/overview", headers=auth_headers(await make_user(role="support"))
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["period"] == "30d" and body["bucket"] == "day" and len(body["series"]) == 30
    assert body["kpis"]["new_cases"] == {"current": 0, "previous": 0}
    assert {a["key"]: a["count"] for a in body["attention"]} == {
        "unassigned_enquiries": 0,
        "quotes_overdue": 0,
        "quotes_awaiting_patient": 0,
        "emergency_cases": 0,
        "open_sos": 0,
        "hospitals_pending": 0,
        "agents_pending": 0,
        "agent_kyc_pending": 0,
        "payout_accounts_unverified": 0,
    }
    assert body["upcoming_admissions"] == [] and body["top_hospitals"] == []

    r = await client.get(
        f"{API}/admin/dashboard/overview",
        params={"period": "90d"},
        headers=auth_headers(await make_user(role="admin")),
    )
    assert r.status_code == 200 and r.json()["bucket"] == "week" and len(r.json()["series"]) == 13
    r = await client.get(
        f"{API}/admin/dashboard/overview",
        params={"period": "1y"},
        headers=auth_headers(await make_user(role="admin")),
    )
    assert r.status_code == 422


async def test_overview_requires_staff(client, make_user, auth_headers):
    r = await client.get(
        f"{API}/admin/dashboard/overview", headers=auth_headers(await make_user(role="patient"))
    )
    assert r.status_code == 403


async def test_overview_numbers(client, db, make_user, auth_headers):
    w = await build_world(db)
    c1, c2, c3, c4 = w.cases
    old = datetime.now(UTC) - timedelta(days=3)
    # c4 is an unassigned enquiry created 3 days ago with no quote -> also past the 48h quote SLA
    c4.created_at = old
    # an emergency-screened open case with a coordinator
    screening = Screening(
        patient_id=c4.patient_id, status=ScreeningStatus.COMPLETED, urgency=Urgency.EMERGENCY
    )
    db.add(screening)
    await db.flush()
    coordinator = await make_user(role="support")
    patient = await db.get(PatientProfile, c4.patient_id)
    assert patient is not None
    await create_case(
        db,
        patient,
        w.apollo,
        screening_id=screening.id,
        coordinator_user_id=coordinator.id,
        status=CaseStatus.QUOTED,
    )
    db.add(
        Quote(
            case_id=c3.id,
            hospital_id=c3.hospital_id,
            status=QuoteStatus.SENT,
            total_minor=100,
            currency="INR",
        )
    )
    db.add(SosAlert(patient_id=c1.patient_id, status=SosStatus.OPEN, message="help"))
    await create_hospital(db, status="pending_review")
    await create_agent(db, status="pending", kyc_status="pending")
    # upcoming admission in 2 days
    w.bookings[0].admission_date = today_ist() + timedelta(days=2)
    await db.commit()
    await capture_payment(db, w.bookings[0], 300_000)
    await capture_payment(db, w.bookings[1], 50_000, captured_at=datetime.now(UTC) - timedelta(days=10))

    r = await client.get(
        f"{API}/admin/dashboard/overview",
        params={"period": "7d"},
        headers=auth_headers(await make_user(role="admin")),
    )
    assert r.status_code == 200, r.text
    d = r.json()
    att = {a["key"]: a for a in d["attention"]}
    assert att["unassigned_enquiries"]["count"] == 1 and att["unassigned_enquiries"]["oldest_at"] is not None
    assert att["quotes_overdue"]["count"] == 1
    assert att["quotes_awaiting_patient"]["count"] == 2  # c3 + the emergency case
    assert att["emergency_cases"]["count"] == 1
    assert att["open_sos"]["count"] == 1
    assert att["hospitals_pending"]["count"] == 1
    assert att["agents_pending"]["count"] == 1 and att["agent_kyc_pending"]["count"] == 1

    k = d["kpis"]
    assert k["gmv_minor"] == {"current": 300_000, "previous": 50_000}
    assert (
        k["new_cases"]["current"] == 5
    )  # c1-c4 (c4 is 3 days old: still inside 7 days) + the emergency case
    assert k["quotes_sent"]["current"] == 1
    assert k["bookings"]["current"] == 2
    assert sum(p["gmv_minor"] for p in d["series"]) == 300_000
    assert d["series"][-1]["date"] == today_ist().isoformat()
    funnel = {f["stage"]: f["count"] for f in d["funnel"]}
    assert funnel["enquiry"] == 5 and funnel["booked"] == 2
    assert d["top_hospitals"][0]["id"] == str(w.apollo.id) and d["top_hospitals"][0]["gmv_minor"] == 300_000
    assert [u["booking_number"] for u in d["upcoming_admissions"]] == [w.bookings[0].booking_number]
    assert d["upcoming_admissions"][0]["case_number"] == c1.case_number
