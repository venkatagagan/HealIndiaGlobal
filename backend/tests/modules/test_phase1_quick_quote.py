"""Phase 1 quick quote: quote_due_at / overdue clock, shared reports, SLA job + notifications, multi-hospital
quote requests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, update

from app.models import Case, CaseDocument, CaseStatusHistory, Notification, Screening
from app.modules.cases.quick_quote import run_quote_sla
from tests.factories import create_doctor, create_hospital, create_patient, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    event_log_fixture,
    make_document,
    make_world,
    quote_body,
)

API = "/api/v1"


async def _case(client: Any, headers: dict[str, str], world: Any, **extra: Any) -> dict[str, Any]:
    body = {
        "hospital_id": str(world.hospital.id),
        "doctor_id": str(world.doctor.id),
        "procedure_id": str(world.procedure.id),
        "consent_share": True,
        **extra,
    }
    r = await client.post(f"{API}/cases", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_quote_clock_and_shared_reports(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)
    report = await make_document(db, world.patient_user, kind="medical_report", patient_id=world.patient.id)
    scan = await make_document(db, world.patient_user, kind="imaging", patient_id=world.patient.id)
    passport = await make_document(db, world.patient_user, kind="passport", patient_id=world.patient.id)
    screening = Screening(
        patient_id=world.patient.id,
        status="completed",
        report_document_ids=[report.id, passport.id],
        ai_result={"summary": "Knee osteoarthritis"},
    )
    db.add(screening)
    await db.commit()

    # The hospital cannot read the report before it is shared.
    assert (await client.get(f"{API}/documents/{report.id}", headers=h_h)).status_code == 404

    case = await _case(client, p_h, world, screening_id=str(screening.id), document_ids=[str(scan.id)])
    created = datetime.fromisoformat(case["created_at"])
    due = datetime.fromisoformat(case["quote_due_at"])
    assert timedelta(hours=47, minutes=59) < due - created <= timedelta(hours=48, minutes=1)
    assert case["quote_overdue"] is False and 47 <= case["hours_left"] <= 48
    assert case["first_quote_at"] is None

    # Medical reports from the screening + listed scan are shared; the passport is not.
    shared = set(
        (
            await db.execute(select(CaseDocument.document_id).where(CaseDocument.case_id == case["id"]))
        ).scalars()
    )
    assert shared == {report.id, scan.id}
    for doc in (report, scan):
        r = await client.get(f"{API}/documents/{doc.id}", headers=h_h)
        assert r.status_code == 200, r.text
    assert (await client.get(f"{API}/documents/{passport.id}", headers=h_h)).status_code == 404
    detail = (await client.get(f"{API}/cases/{case['id']}", headers=h_h)).json()
    assert {d["id"] for d in detail["documents"]} >= {str(report.id), str(scan.id)}
    assert detail["timeline"][0]["note"] == "Case created; 2 reports shared with the hospital"

    # Another patient's document cannot be attached.
    other = await create_patient(db)
    foreign = await make_document(db, world.patient_user, kind="lab_result", patient_id=other.id)
    foreign.owner_user_id = other.user_id
    await db.commit()
    r = await client.post(
        f"{API}/cases",
        json={
            "hospital_id": str(world.hospital.id),
            "consent_share": True,
            "document_ids": [str(foreign.id)],
        },
        headers=p_h,
    )
    assert r.status_code == 404

    # Sending a quote stops the clock.
    r = await client.post(f"{API}/cases/{case['id']}/quotes", json=quote_body(), headers=h_h)
    assert r.status_code == 201, r.text
    after = (await client.get(f"{API}/cases/{case['id']}", headers=p_h)).json()
    assert after["first_quote_at"] is not None
    assert after["hours_left"] is None and after["quote_overdue"] is False


async def test_hospital_list_sorted_by_quote_due(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    h_h = auth_headers(world.hospital_user)
    first = await _case(client, p_h, world)
    second = await _case(client, p_h, world)
    quoted = await _case(client, p_h, world)
    await client.post(f"{API}/cases/{quoted['id']}/quotes", json=quote_body(), headers=h_h)
    # make ``second`` overdue
    await db.execute(
        update(Case)
        .where(Case.id == second["id"])
        .values(quote_due_at=datetime.now(UTC) - timedelta(hours=1))
    )
    await db.commit()
    r = await client.get(f"{API}/cases", params={"sort": "quote_due_at"}, headers=h_h)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [i["id"] for i in items] == [second["id"], first["id"], quoted["id"]]
    assert items[0]["quote_overdue"] is True and items[0]["hours_left"] == 0
    # agent and patient APIs expose the same fields
    r = await client.get(f"{API}/cases", headers=p_h)
    assert {"quote_due_at", "quote_overdue", "hours_left"} <= set(r.json()["items"][0])


async def test_quote_sla_job_reminds_then_escalates_once(
    db, client, auth_headers, event_log: EventLog
) -> None:
    world = await make_world(db)
    coordinator = await create_user(db, role="support")
    case = await _case(client, auth_headers(world.patient_user), world)
    now = datetime.now(UTC)

    assert await run_quote_sla(db, now) == {"reminders": 0, "overdue": 0}
    # 25 hours later: reminder to the hospital
    counts = await run_quote_sla(db, now + timedelta(hours=25))
    await db.commit()
    assert counts == {"reminders": 1, "overdue": 0}
    assert await run_quote_sla(db, now + timedelta(hours=26)) == {"reminders": 0, "overdue": 0}
    await db.commit()
    assert event_log.of("quote.reminder_due")[0]["case_id"] == case["id"]
    hospital_notes = (
        (await db.execute(select(Notification).where(Notification.user_id == world.hospital_user.id)))
        .scalars()
        .all()
    )
    assert any(n.kind == "quote.reminder_due" for n in hospital_notes)

    # 49 hours later: overdue to hospital, coordinators (support staff) and the patient
    counts = await run_quote_sla(db, now + timedelta(hours=49))
    await db.commit()
    assert counts == {"reminders": 0, "overdue": 1}
    assert await run_quote_sla(db, now + timedelta(hours=50)) == {"reminders": 0, "overdue": 0}
    await db.commit()
    assert len(event_log.of("quote.overdue")) == 1
    kinds = {
        (n.user_id, n.kind, n.title)
        for n in (
            await db.execute(select(Notification).where(Notification.kind == "quote.overdue"))
        ).scalars()
    }
    users = {u for u, _, _ in kinds}
    assert {world.hospital_user.id, world.patient_user.id, coordinator.id} <= users
    assert any("chasing the hospital" in t for u, _, t in kinds if u == world.patient_user.id)


async def test_overdue_without_prior_reminder_skips_reminder(
    db, client, auth_headers, event_log: EventLog
) -> None:
    world = await make_world(db)
    case = await _case(client, auth_headers(world.patient_user), world)
    counts = await run_quote_sla(db, datetime.now(UTC) + timedelta(hours=60))
    await db.commit()
    assert counts == {"reminders": 0, "overdue": 1}
    assert await run_quote_sla(db, datetime.now(UTC) + timedelta(hours=61)) == {"reminders": 0, "overdue": 0}
    assert event_log.of("quote.reminder_due") == []
    row = (await db.execute(select(Case).where(Case.id == case["id"]))).scalar_one()
    assert row.quote_reminder_sent_at is not None and row.quote_overdue_sent_at is not None


async def test_multi_hospital_quote_request(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    report = await make_document(db, world.patient_user, kind="medical_report", patient_id=world.patient.id)
    h2_owner = await create_user(db, role="hospital")
    h2 = await create_hospital(db, owner=h2_owner)
    await create_doctor(db, h2, world.specialty)
    h3 = await create_hospital(db)
    h4 = await create_hospital(db)

    body = {
        "hospital_ids": [str(world.hospital.id), str(h2.id), str(h3.id), str(h4.id)],
        "procedure_id": str(world.procedure.id),
        "notes": "Knee replacement, both knees",
        "document_ids": [str(report.id)],
        "consent_share": True,
    }
    r = await client.post(f"{API}/cases/quote-request", json=body, headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "too_many_hospitals"
    body["hospital_ids"] = body["hospital_ids"][:3]
    r = await client.post(f"{API}/cases/quote-request", json=body, headers=p_h)
    assert r.status_code == 201, r.text
    group = r.json()
    assert len(group["cases"]) == 3 and group["currency"] == "USD"
    assert all(c["quote"] is None and c["quote_due_at"] for c in group["cases"])
    group_id = group["quote_group_id"]
    cases = (await db.execute(select(Case).where(Case.quote_group_id == group_id))).scalars().all()
    assert len(cases) == 3
    # the report is shared with all three hospitals
    links = (
        (await db.execute(select(CaseDocument).where(CaseDocument.document_id == report.id))).scalars().all()
    )
    assert len(links) == 3
    h2_case = next(c for c in cases if c.hospital_id == h2.id)
    assert (
        await client.get(f"{API}/documents/{report.id}", headers=auth_headers(h2_owner))
    ).status_code == 200
    history = (
        await db.execute(select(CaseStatusHistory.note).where(CaseStatusHistory.case_id == h2_case.id))
    ).scalar_one()
    assert "1 report shared" in history

    # two hospitals answer; the comparison converts to the patient's currency
    h1_case = next(c for c in cases if c.hospital_id == world.hospital.id)
    r = await client.post(
        f"{API}/cases/{h1_case.id}/quotes", json=quote_body(), headers=auth_headers(world.hospital_user)
    )
    assert r.status_code == 201, r.text
    cheaper = quote_body(
        line_items=[{"category": "surgery", "description": "TKR", "amount_minor": 2_00_000_00}]
    )
    r = await client.post(f"{API}/cases/{h2_case.id}/quotes", json=cheaper, headers=auth_headers(h2_owner))
    assert r.status_code == 201, r.text
    r = await client.get(f"{API}/cases/quote-groups/{group_id}", headers=p_h)
    assert r.status_code == 200, r.text
    view = r.json()
    by_case = {c["case_id"]: c for c in view["cases"]}
    assert by_case[str(h1_case.id)]["quote"]["currency"] == "INR"
    assert (
        0
        < by_case[str(h2_case.id)]["total_in_currency_minor"]
        < by_case[str(h1_case.id)]["total_in_currency_minor"]
    )
    assert view["cheapest_case_id"] == str(h2_case.id)

    # a hospital sees only its own case of the group; others get 404
    r = await client.get(f"{API}/cases/quote-groups/{group_id}", headers=auth_headers(h2_owner))
    assert r.status_code == 200 and [c["case_id"] for c in r.json()["cases"]] == [str(h2_case.id)]
    stranger = await create_patient(db)
    stranger_user = await db.get(type(world.patient_user), stranger.user_id)
    r = await client.get(f"{API}/cases/quote-groups/{group_id}", headers=auth_headers(stranger_user))
    assert r.status_code == 404


async def test_quote_request_validation(db, client, auth_headers) -> None:
    world = await make_world(db)
    p_h = auth_headers(world.patient_user)
    r = await client.post(
        f"{API}/cases/quote-request",
        json={"hospital_ids": [str(world.hospital.id)], "consent_share": True},
        headers=p_h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "procedure_required"
    r = await client.post(
        f"{API}/cases/quote-request",
        json={
            "hospital_ids": [str(world.hospital.id), str(world.hospital.id)],
            "procedure_id": str(world.procedure.id),
            "consent_share": True,
        },
        headers=p_h,
    )
    assert r.status_code == 422
    # all or nothing: an inactive hospital fails the whole request
    inactive = await create_hospital(db, status="suspended")
    r = await client.post(
        f"{API}/cases/quote-request",
        json={
            "hospital_ids": [str(world.hospital.id), str(inactive.id)],
            "procedure_id": str(world.procedure.id),
            "consent_share": True,
        },
        headers=p_h,
    )
    assert r.status_code == 404
    assert (await db.execute(select(Case))).scalars().all() == []
    # guests must upgrade first
    guest = await create_user(db, role="patient", is_guest=True)
    await create_patient(db, user=guest)
    r = await client.post(
        f"{API}/cases/quote-request",
        json={"hospital_ids": [str(world.hospital.id)], "procedure_id": str(world.procedure.id)},
        headers=auth_headers(guest),
    )
    assert r.status_code == 403
