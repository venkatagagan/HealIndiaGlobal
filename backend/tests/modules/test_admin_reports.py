"""Admin dashboard, revenue/cases reports and CSV export (PLAN 8.13)."""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.core.enums import CaseStatus, SettlementItemStatus, SosStatus
from app.models import CaseStatusHistory, SosAlert
from app.modules.admin.reports import csv_cell, month_key, today_ist
from tests.factories import create_agent, create_hospital, create_patient
from tests.modules.admin_helpers import (
    build_world,
    capture_payment,
    post_capture,
    recognize_revenue,
    settlement_item,
)

API = "/api/v1"


async def test_dashboard_empty_platform(client, make_user, auth_headers):
    admin = await make_user(role="support")
    r = await client.get(f"{API}/admin/dashboard", headers=auth_headers(admin))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["gmv_minor"] == 0 and body["revenue_minor"] == 0 and body["escrow_minor"] == 0
    assert body["pending_settlements_minor"] == 0 and body["open_sos"] == 0
    assert body["currency"] == "INR"
    assert len(body["monthly"]) == 12
    assert body["monthly"][-1]["month"] == month_key(today_ist())
    assert body["users_by_role"] == {"support": 1}
    assert body["top_hospitals"] == [] and body["top_specialties"] == []


async def test_dashboard_numbers_on_factory_data(client, db, make_user, auth_headers):
    w = await build_world(db)
    b1, b2 = w.bookings
    p1 = await capture_payment(db, b1, 200_000)
    p2 = await capture_payment(db, b2, 500_000)
    await capture_payment(
        db, b2, 1_000, captured_at=datetime.now(UTC) - timedelta(days=500)
    )  # outside 12 months
    await post_capture(db, p1)
    await post_capture(db, p2)
    await recognize_revenue(db, b2, commission=75_000, service_fee=5_000, hospital_net=420_000)
    await settlement_item(db, b2, 420_000, SettlementItemStatus.PENDING)
    await settlement_item(db, b2, 1_000, SettlementItemStatus.ELIGIBLE)
    await settlement_item(db, b2, 99_999, SettlementItemStatus.PAID)
    await create_hospital(db, status="pending_review")
    await create_agent(db, status="pending")
    await create_agent(db, status="active")
    db.add(SosAlert(patient_id=w.cases[0].patient_id, status=SosStatus.OPEN, message="help"))
    db.add(SosAlert(patient_id=w.cases[0].patient_id, status=SosStatus.RESOLVED))
    await db.commit()

    staff = await make_user(role="finance")
    r = await client.get(f"{API}/admin/dashboard", headers=auth_headers(staff))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["gmv_minor"] == 701_000
    assert d["revenue_minor"] == 80_000
    # escrow: +200k +500k captured, -500k recognized
    assert d["escrow_minor"] == 200_000
    assert d["pending_settlements_minor"] == 421_000
    assert d["open_sos"] == 1
    assert d["hospitals"] == {"active": 2, "pending_review": 1}
    assert d["agents"] == {"active": 1, "pending": 1}
    assert d["cases_by_status"] == {"booked": 1, "completed": 1, "quoted": 1, "enquiry": 1}
    assert d["bookings_by_status"] == {"confirmed": 1, "completed": 1}
    assert d["users_by_role"]["finance"] == 1 and d["users_by_role"]["patient"] == 1
    assert d["users_by_role"]["agent"] == 2

    current = d["monthly"][-1]
    assert current["month"] == month_key(today_ist())
    assert current["gmv_minor"] == 700_000 and current["revenue_minor"] == 80_000
    assert current["bookings"] == 2 and current["new_patients"] == 1
    assert sum(m["gmv_minor"] for m in d["monthly"]) == 700_000

    assert d["top_hospitals"][0] == {
        "id": str(w.apollo.id),
        "name": "Apollo Test",
        "bookings": 2,
        "gmv_minor": 701_000,
    }
    assert d["top_specialties"][0] == {"slug": "orthopedics", "name": "Orthopedics", "cases": 3}
    assert d["top_specialties"][1]["slug"] == "cardiology"


async def test_revenue_report_groupings(client, db, make_user, auth_headers):
    w = await build_world(db)
    b1, b2 = w.bookings
    await capture_payment(db, b1, 200_000)
    await capture_payment(db, b2, 500_000)
    await recognize_revenue(db, b2, commission=75_000, service_fee=5_000, hospital_net=420_000)
    h = auth_headers(await make_user(role="admin"))

    r = await client.get(f"{API}/admin/reports/revenue", headers=h)
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["group_by"] == "month" and len(rep["rows"]) == 12
    assert rep["totals"] == {
        "bookings": 2,
        "gmv_minor": 700_000,
        "revenue_minor": 80_000,
        "commission_minor": 75_000,
        "service_fee_minor": 5_000,
        "refunds_minor": 0,
    }
    assert rep["rows"][-1]["key"] == month_key(today_ist())

    r = await client.get(f"{API}/admin/reports/revenue", params={"group_by": "hospital"}, headers=h)
    rows = r.json()["rows"]
    assert [x["key"] for x in rows] == [str(w.apollo.id)]
    assert (
        rows[0]["label"] == "Apollo Test"
        and rows[0]["gmv_minor"] == 700_000
        and rows[0]["revenue_minor"] == 80_000
    )

    r = await client.get(f"{API}/admin/reports/revenue", params={"group_by": "specialty"}, headers=h)
    rows = r.json()["rows"]
    assert rows == [
        {
            "key": "orthopedics",
            "label": "Orthopedics",
            "bookings": 2,
            "gmv_minor": 700_000,
            "revenue_minor": 80_000,
            "commission_minor": 75_000,
            "service_fee_minor": 5_000,
            "refunds_minor": 0,
        }
    ]

    yesterday = (today_ist() - timedelta(days=400)).isoformat()
    r = await client.get(
        f"{API}/admin/reports/revenue", params={"from": yesterday, "to": yesterday}, headers=h
    )
    assert r.json()["totals"]["gmv_minor"] == 0
    r = await client.get(f"{API}/admin/reports/revenue", params={"group_by": "doctor"}, headers=h)
    assert r.status_code == 422
    r = await client.get(
        f"{API}/admin/reports/revenue", params={"from": "2020-01-01", "to": "2026-12-31"}, headers=h
    )
    assert r.status_code == 400


async def test_cases_report_funnel_and_conversion(client, db, make_user, auth_headers):
    w = await build_world(db)
    c1, c2, c3, c4 = w.cases
    # c3 was quoted then declined: history keeps the "quoted" stage
    db.add(CaseStatusHistory(case_id=c3.id, from_status=CaseStatus.ENQUIRY, to_status=CaseStatus.QUOTED))
    c3.status = CaseStatus.DECLINED
    await db.commit()
    h = auth_headers(await make_user(role="support"))
    r = await client.get(f"{API}/admin/reports/cases", headers=h)
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["total"] == 4
    assert rep["by_status"] == {"booked": 1, "completed": 1, "declined": 1, "enquiry": 1}
    funnel = {f["stage"]: f["count"] for f in rep["funnel"]}
    assert funnel == {
        "enquiry": 4,
        "quoted": 3,
        "accepted": 2,
        "booked": 2,
        "in_treatment": 1,
        "completed": 1,
    }
    assert rep["conversion_rate"] == 0.5 and rep["quote_rate"] == 0.75
    assert rep["by_hospital"][0] == {"id": str(w.apollo.id), "name": "Apollo Test", "cases": 3}
    assert rep["by_specialty"][0]["slug"] == "orthopedics" and rep["by_specialty"][0]["cases"] == 3
    current = rep["monthly"][-1]
    assert current == {"month": month_key(today_ist()), "cases": 4, "booked": 2}


async def test_csv_export_escapes_formulas(client, db, make_user, auth_headers):
    w = await build_world(db, first_name='=HYPERLINK("http://evil")', last_name="@SUM(A1)")
    b1, b2 = w.bookings
    await capture_payment(db, b1, 200_000)
    await settlement_item(db, b2, -5_000, SettlementItemStatus.PENDING)
    staff = await make_user(role="finance")
    h = auth_headers(staff)

    r = await client.get(f"{API}/admin/reports/export", params={"type": "bookings"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    text = r.content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    header, data = rows[0], rows[1:]
    assert header[0] == "booking_number" and len(data) == 2
    name_idx = header.index("patient_name")
    assert all(row[name_idx].startswith("'=HYPERLINK") for row in data)
    total_idx = header.index("total_minor")
    assert sorted(int(row[total_idx]) for row in data) == [500_000, 1_000_000]

    r = await client.get(f"{API}/admin/reports/export", params={"type": "payments"}, headers=h)
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert len(rows) == 2 and rows[1][rows[0].index("status")] == "captured"
    assert rows[1][rows[0].index("base_amount_minor")] == "200000"

    r = await client.get(f"{API}/admin/reports/export", params={"type": "settlements"}, headers=h)
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert len(rows) == 2
    assert rows[1][rows[0].index("net_minor")] == "-5000"  # numbers are not escaped
    assert rows[1][rows[0].index("payee_name")] == "Apollo Test"

    past = (today_ist() - timedelta(days=30)).isoformat()
    r = await client.get(
        f"{API}/admin/reports/export", params={"type": "bookings", "from": past, "to": past}, headers=h
    )
    assert len(list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))) == 1
    r = await client.get(f"{API}/admin/reports/export", params={"type": "users"}, headers=h)
    assert r.status_code == 422
    r = await client.get(
        f"{API}/admin/reports/export",
        params={"type": "bookings"},
        headers=auth_headers(await make_user(role="hospital")),
    )
    assert r.status_code == 403


def test_csv_cell_rules():
    assert csv_cell("=1+1") == "'=1+1"
    assert csv_cell("+44 20") == "'+44 20"
    assert csv_cell("-cmd") == "'-cmd"
    assert csv_cell("@foo") == "'@foo"
    assert csv_cell("\tx") == "'\tx"
    assert csv_cell("safe text") == "safe text"
    assert csv_cell(-500) == "-500"
    assert csv_cell(Decimal("88.5")) == "88.5"
    assert csv_cell(None) == ""
    assert csv_cell(True) == "true"
    assert csv_cell(CaseStatus.BOOKED) == "booked"


async def test_new_patients_counts_only_registered_patients(client, db, make_user, auth_headers):
    await create_patient(db)
    await make_user(role="patient", is_guest=True, email=None)
    r = await client.get(f"{API}/admin/dashboard", headers=auth_headers(await make_user(role="admin")))
    assert r.json()["monthly"][-1]["new_patients"] == 1
