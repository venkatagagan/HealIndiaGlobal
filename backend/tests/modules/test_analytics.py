"""Analytics: staff endpoints (funnel, SLA, finance, breakdowns with small-cell suppression, role gates,
cache) and the hospital / agent performance pages."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.core import cache
from app.core.enums import QuoteStatus
from app.models import AftercareCheckin, Quote, Review, SettlementItem
from app.modules.analytics.common import Window, make_window, suppress
from app.modules.hospitals.policies import Portal  # noqa: F401  (route dependency import check)
from tests.factories import create_agent, create_case, create_fx_rates, create_patient
from tests.modules.admin_helpers import build_world, capture_payment, recognize_revenue
from tests.modules.cases_helpers import add_hospital_member

API = "/api/v1/admin/analytics"


def test_window_buckets_and_validation():
    w = Window(date(2026, 11, 4), date(2026, 11, 18), "week")
    assert w.buckets() == [date(2026, 11, 2), date(2026, 11, 9), date(2026, 11, 16)]
    w = Window(date(2026, 1, 15), date(2026, 3, 2), "month")
    assert w.buckets() == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)]
    assert make_window(date(2026, 1, 1), date(2026, 1, 31), None).granularity == "day"
    assert make_window(date(2026, 1, 1), date(2026, 5, 1), None).granularity == "week"
    assert make_window(date(2025, 1, 1), date(2026, 1, 1), None).granularity == "month"
    assert suppress(0) == 0 and suppress(3) is None and suppress(5) == 5


async def test_role_gates(client, make_user, auth_headers):
    support = auth_headers(await make_user(role="support"))
    patient = auth_headers(await make_user(role="patient"))
    for path in (
        "overview",
        "quote-sla",
        "patients",
        "hospitals",
        "agents",
        "aftercare",
        "intro-calls",
        "ai-usage",
        "notifications",
    ):
        r = await client.get(f"{API}/{path}", headers=support)
        assert r.status_code == 200, (path, r.text)
        assert r.json()["meta"]["timezone"] == "Asia/Kolkata"
        assert (await client.get(f"{API}/{path}", headers=patient)).status_code == 403
    assert (await client.get(f"{API}/finance", headers=support)).status_code == 403
    r = await client.get(f"{API}/finance", headers=auth_headers(await make_user(role="finance")))
    assert r.status_code == 200, r.text
    r = await client.get(
        f"{API}/overview", params={"from": "2026-02-01", "to": "2026-01-01"}, headers=support
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_date_range"


async def test_overview_funnel_filters_and_cache(client, db, make_user, auth_headers):
    w = await build_world(db)
    c1, c2, c3, _c4 = w.cases
    db.add(
        Quote(
            case_id=c3.id, hospital_id=c3.hospital_id, status=QuoteStatus.SENT, total_minor=1, currency="INR"
        )
    )
    db.add(
        Quote(
            case_id=c3.id, hospital_id=c3.hospital_id, status=QuoteStatus.SENT, total_minor=2, currency="INR"
        )
    )
    db.add(
        Quote(
            case_id=c1.id, hospital_id=c1.hospital_id, status=QuoteStatus.DRAFT, total_minor=1, currency="INR"
        )
    )
    db.add(Review(hospital_id=c2.hospital_id, patient_id=c2.patient_id, case_id=c2.id, rating=5))
    await db.commit()
    headers = auth_headers(await make_user(role="admin"))

    r = await client.get(f"{API}/overview", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    steps = {s["step"]: s for s in body["funnel"]}
    assert [s["step"] for s in body["funnel"]][0] == "visitors"
    assert steps["cases"]["count"] == 4
    assert steps["quotes_sent"]["count"] == 1  # distinct case, drafts ignored
    assert steps["bookings"]["count"] == 2 and steps["completed"]["count"] == 1
    assert steps["reviews"]["count"] == 1
    assert steps["completed"]["rate_from_previous"] == 0.5 and steps["bookings"]["rate_from_previous"] is None
    assert body["kpis"]["conversion_rate"] == 0.5
    assert len(body["series"]) == 30 and sum(p["cases"] for p in body["series"]) == 4

    r = await client.get(f"{API}/overview", params={"hospital_id": str(w.apollo.id)}, headers=headers)
    steps = {s["step"]: s for s in r.json()["funnel"]}
    assert steps["cases"]["count"] == 3 and steps["visitors"]["count"] is None
    assert steps["quotes_sent"]["count"] == 0
    r = await client.get(f"{API}/overview", params={"specialty_id": str(w.cardio.id)}, headers=headers)
    assert {s["step"]: s["count"] for s in r.json()["funnel"]}["cases"] == 1
    r = await client.get(f"{API}/overview", params={"country": "us", "channel": "direct"}, headers=headers)
    assert {s["step"]: s["count"] for s in r.json()["funnel"]}["cases"] == 4
    r = await client.get(f"{API}/overview", params={"country": "NG"}, headers=headers)
    assert {s["step"]: s["count"] for s in r.json()["funnel"]}["cases"] == 0
    r = await client.get(f"{API}/overview", params={"country": "XYZ"}, headers=headers)
    assert r.status_code == 422 or r.json()["error"]["code"] == "invalid_country"

    # cached for a minute: a new case does not show up until the cache is cleared
    patient = await create_patient(db)
    await create_case(db, patient, w.fortis)
    r = await client.get(f"{API}/overview", headers=headers)
    assert {s["step"]: s["count"] for s in r.json()["funnel"]}["cases"] == 4
    await cache.clear_prefix("analytics:")
    r = await client.get(f"{API}/overview", headers=headers)
    assert {s["step"]: s["count"] for s in r.json()["funnel"]}["cases"] == 5


async def test_quote_sla(client, db, make_user, auth_headers):
    w = await build_world(db)
    c1, _c2, c3, c4 = w.cases
    now = datetime.now(UTC)
    c3.created_at = now - timedelta(hours=30)
    c3.first_quote_at = now - timedelta(hours=10)  # 20 h
    c1.created_at = now - timedelta(hours=40)
    c1.first_quote_at = now  # 40 h
    c4.created_at = now - timedelta(hours=72)  # open enquiry, no quote -> overdue now
    await db.commit()
    r = await client.get(f"{API}/quote-sla", headers=auth_headers(await make_user(role="support")))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sla_hours"] == 48
    assert d["totals"]["cases"] == 4 and d["totals"]["quoted"] == 2
    assert d["totals"]["median_hours"] == 30.0
    assert d["totals"]["within_24h_pct"] == 0.25 and d["totals"]["within_48h_pct"] == 0.5
    assert d["overdue_now"] == 1
    apollo = next(h for h in d["by_hospital"] if h["hospital_id"] == str(w.apollo.id))
    assert apollo["overdue_now"] == 1 and apollo["cases"] == 3


async def test_finance_conversion_and_installments(client, db, make_user, auth_headers):
    await create_fx_rates(db)
    w = await build_world(db)
    await capture_payment(db, w.bookings[0], 880_000)
    await recognize_revenue(db, w.bookings[0], commission=80_000, service_fee=8_800, hospital_net=791_200)
    headers = auth_headers(await make_user(role="finance"))
    r = await client.get(f"{API}/finance", headers=headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["reporting_currency"] == "INR" and d["fx"] is None
    assert d["totals"]["gmv_minor"] == 880_000 and d["totals"]["commission_minor"] == 80_000
    assert d["totals"]["revenue_minor"] == 88_800 and d["totals"]["payments"] == 1
    assert d["by_currency"][0]["currency"] == "INR"
    assert d["outstanding_installments"]["past_treatment_count"] == 0

    r = await client.get(f"{API}/finance", params={"currency": "usd"}, headers=headers)
    d = r.json()
    assert d["reporting_currency"] == "USD" and d["fx"]["currency"] == "USD" and d["fx"]["as_of"]
    assert 0 < d["totals"]["gmv_minor"] < 880_000
    r = await client.get(f"{API}/finance", params={"hospital_id": str(w.fortis.id)}, headers=headers)
    assert r.json()["totals"]["gmv_minor"] == 0 and r.json()["totals"]["commission_minor"] == 0
    r = await client.get(f"{API}/finance", params={"currency": "ZZZ"}, headers=headers)
    assert r.status_code == 400


async def test_patients_breakdown_suppresses_small_cells(client, db, make_user, auth_headers):
    w = await build_world(db)  # 4 cases of one US patient
    for _ in range(5):
        p = await create_patient(db, nationality="GB", country_of_residence="GB")
        await create_case(db, p, w.fortis, procedure_id=w.bypass.id)
    r = await client.get(f"{API}/patients", headers=auth_headers(await make_user(role="support")))
    assert r.status_code == 200, r.text
    rows = {row["key"]: row for row in r.json()["by_country"]}
    assert rows["GB"]["patients"] == 5 and rows["GB"]["cases"] == 5 and not rows["GB"]["suppressed"]
    assert rows["US"]["patients"] is None and rows["US"]["cases"] is None and rows["US"]["suppressed"]
    spec = {row["label"]: row for row in r.json()["by_specialty"]}
    assert spec["Cardiology"]["cases"] == 6 and spec["Orthopedics"]["suppressed"]


async def test_hospitals_agents_and_commission_visibility(client, db, make_user, auth_headers):
    w = await build_world(db)
    agent = await create_agent(db)
    patient = await create_patient(db, referred_by_agent_id=agent.id)
    await create_case(db, patient, w.fortis, agent_id=agent.id)
    db.add(
        SettlementItem(
            payee_type="agent",
            payee_id=agent.id,
            booking_id=w.bookings[0].id,
            gross_minor=1000,
            commission_minor=0,
            tax_minor=0,
            tds_minor=0,
            net_minor=900,
            currency="INR",
            status="pending",
        )
    )
    await db.commit()
    r = await client.get(f"{API}/hospitals", headers=auth_headers(await make_user(role="support")))
    rows = {row["name"]: row for row in r.json()["rows"]}
    assert rows["Apollo Test"]["bookings"] == 2 and rows["Apollo Test"]["enquiries"] == 3

    r = await client.get(f"{API}/agents", headers=auth_headers(await make_user(role="support")))
    d = r.json()
    assert d["commission_visible"] is False
    row = d["rows"][0]
    assert row["leads"] == 1 and row["cases"] == 1 and row["commission_minor"] is None
    r = await client.get(f"{API}/agents", headers=auth_headers(await make_user(role="admin")))
    assert r.json()["commission_visible"] is True and r.json()["rows"][0]["commission_minor"] == 900
    r = await client.get(
        f"{API}/agents", params={"channel": "direct"}, headers=auth_headers(await make_user(role="admin"))
    )
    assert r.json()["rows"] == []


async def test_aftercare_intro_ai_notifications(client, db, make_user, auth_headers):
    w = await build_world(db)
    c2 = w.cases[1]
    now = datetime.now(UTC)
    db.add(
        AftercareCheckin(
            case_id=c2.id,
            patient_id=c2.patient_id,
            day=1,
            due_at=now - timedelta(days=2),
            submitted_at=now - timedelta(days=2),
            red_flags=["fever"],
        )
    )
    db.add(
        AftercareCheckin(
            case_id=c2.id, patient_id=c2.patient_id, day=3, due_at=now - timedelta(days=1, hours=2)
        )
    )
    await db.commit()
    headers = auth_headers(await make_user(role="support"))
    d = (await client.get(f"{API}/aftercare", headers=headers)).json()
    assert d["due"] == 2 and d["submitted"] == 1 and d["completion_rate"] == 0.5
    assert d["overdue"] == 1 and d["red_flag_checkins"] == 1
    assert d["red_flags_by_kind"] == [{"flag": "fever", "count": None, "suppressed": True}]
    d = (await client.get(f"{API}/intro-calls", headers=headers)).json()
    assert d["requested"] == 0 and d["filters_applied"] is False
    d = (await client.get(f"{API}/ai-usage", headers=headers)).json()
    assert d["global_daily_limit"] > 0 and d["requests"] == 0 and d["peak_day"] is None
    d = (await client.get(f"{API}/notifications", headers=headers)).json()
    assert d["sent"] >= 0 and isinstance(d["by_kind"], list)


async def test_hospital_and_agent_performance(client, db, make_user, auth_headers):
    w = await build_world(db)
    member = await add_hospital_member(db, w.apollo)
    r = await client.get(
        "/api/v1/hospital-portal/performance",
        headers={**auth_headers(member), "X-Hospital-Id": str(w.apollo.id)},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["enquiries"] == 3 and d["bookings"] == 2 and d["completed"] == 1
    assert d["meta"]["date_to"] >= d["meta"]["date_from"]
    assert (date.fromisoformat(d["meta"]["date_to"]) - date.fromisoformat(d["meta"]["date_from"])).days == 89
    assert d["by_country"][0]["suppressed"] is True  # one patient
    assert (
        await client.get(
            "/api/v1/hospital-portal/performance", headers=auth_headers(await make_user(role="agent"))
        )
    ).status_code == 403

    agent = await create_agent(db)
    patient = await create_patient(db, referred_by_agent_id=agent.id)
    await create_case(db, patient, w.fortis, agent_id=agent.id)
    from app.models import User

    agent_user = await db.get(User, agent.user_id)
    r = await client.get("/api/v1/agent-portal/performance", headers=auth_headers(agent_user))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["leads"] == 1 and d["cases"] == 1 and d["commission"]["earned_minor"] == 0
    assert sum(p["enquiries"] for p in d["series"]) == 1
