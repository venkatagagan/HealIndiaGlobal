"""Agent CRM: leads scoped to the agency, pipeline, activities, convert to patient, CSV import/export,
follow-up reminders, lost-lead purge, privacy."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, PatientProfile, User
from app.models.crm import AgentLead, AgentLeadActivity, LeadStatus
from app.modules.crm import service as crm
from tests.factories import create_agent, create_user
from tests.modules.auth_helpers import API

pytestmark = pytest.mark.asyncio


async def _agent_user(db: AsyncSession, status: str = "active") -> User:
    user = await create_user(db, role="agent")
    await create_agent(db, user=user, status=status)
    await db.commit()
    return user


async def _lead(client: httpx.AsyncClient, headers: dict[str, str], **body: Any) -> dict[str, Any]:
    payload = {
        "full_name": "Chidi Okeke",
        "country": "ng",
        "email": "Chidi@Example.test",
        "phone": "+234 803 555 0101",
    }
    payload.update(body)
    r = await client.post(f"{API}/agent-portal/leads", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_lead_crud_scope_and_encryption(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user = await _agent_user(db)
    other = await _agent_user(db)
    h = auth_headers(user)
    lead = await _lead(
        client,
        h,
        source="whatsapp",
        interest="knee replacement",
        budget_minor=500000,
        budget_currency="usd",
        tags=["VIP", "vip", "Lagos"],
        note="Met at clinic fair",
    )
    assert lead["country"] == "NG" and lead["email"] == "chidi@example.test"
    assert lead["tags"] == ["vip", "lagos"]
    assert lead["owner_user_id"] == str(user.id)
    assert [a["kind"] for a in lead["activities"]] == ["note"]
    # contact details are encrypted at rest
    raw = (await db.execute(text("SELECT email FROM agent_leads"))).scalar_one()
    assert raw is not None and "chidi" not in str(raw).lower()

    # other agency: 404
    r = await client.get(f"{API}/agent-portal/leads/{lead['id']}", headers=auth_headers(other))
    assert r.status_code == 404
    r = await client.get(f"{API}/agent-portal/leads", headers=auth_headers(other))
    assert r.json()["total"] == 0

    # search by exact phone / name
    r = await client.get(f"{API}/agent-portal/leads", params={"q": "+234 803 555 0101"}, headers=h)
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/agent-portal/leads", params={"q": "okek"}, headers=h)
    assert r.json()["total"] == 1

    # budget without currency is refused
    r = await client.post(f"{API}/agent-portal/leads", json={"full_name": "X", "budget_minor": 10}, headers=h)
    assert r.status_code == 400
    # owner must be in the agency
    r = await client.patch(
        f"{API}/agent-portal/leads/{lead['id']}", json={"owner_user_id": str(other.id)}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_owner"

    # status: lost needs a reason, won needs convert
    url = f"{API}/agent-portal/leads/{lead['id']}"
    r = await client.patch(url, json={"status": "lost"}, headers=h)
    assert r.json()["error"]["code"] == "lost_reason_required"
    r = await client.patch(url, json={"status": "won"}, headers=h)
    assert r.json()["error"]["code"] == "lead_convert_required"
    r = await client.patch(
        url, json={"status": "qualified", "next_follow_up_at": "2030-01-01T10:00:00+05:30"}, headers=h
    )
    assert r.status_code == 200 and r.json()["status"] == "qualified"
    assert r.json()["activities"][0]["kind"] == "status_change"

    r = await client.delete(url, headers=h)
    assert r.status_code == 204
    assert (await db.execute(select(func.count()).select_from(AgentLeadActivity))).scalar_one() == 0


async def test_activities_pipeline_and_follow_ups(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user = await _agent_user(db)
    h = auth_headers(user)
    a = await _lead(client, h, source="facebook")
    b = await _lead(client, h, full_name="Ama Mensah", email=None, phone=None, source="facebook")
    await _lead(client, h, full_name="Kofi Boateng", email=None, phone=None, source="event")

    r = await client.post(
        f"{API}/agent-portal/leads/{a['id']}/activities",
        json={
            "kind": "call",
            "body": "Discussed dates",
            "next_follow_up_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "contacted"  # first contact moves a new lead on
    assert r.json()["follow_up_due"] is True
    r = await client.post(
        f"{API}/agent-portal/leads/{a['id']}/activities", json={"kind": "status_change"}, headers=h
    )
    assert r.status_code == 422

    r = await client.patch(
        f"{API}/agent-portal/leads/{b['id']}",
        json={"status": "lost", "lost_reason": "chose another country"},
        headers=h,
    )
    assert r.status_code == 200

    r = await client.get(f"{API}/agent-portal/leads/pipeline", headers=h)
    p = r.json()
    stages = {s["status"]: s["count"] for s in p["stages"]}
    assert stages["contacted"] == 1 and stages["lost"] == 1 and stages["new"] == 1
    assert p["total"] == 3 and p["open"] == 2 and p["conversion_rate"] == 0.0
    assert p["follow_ups_due_today"] == 1
    fb = next(s for s in p["sources"] if s["source"] == "facebook")
    assert fb == {"source": "facebook", "total": 2, "won": 0, "lost": 1, "conversion_rate": 0.0}

    r = await client.get(f"{API}/agent-portal/leads", params={"follow_up": "due"}, headers=h)
    assert r.json()["total"] == 1

    # reminders: one notification per owner per day, not repeated
    assert await crm.send_follow_up_reminders(db) == 1
    await db.commit()
    assert await crm.send_follow_up_reminders(db) == 0
    await db.commit()
    note = (await db.execute(select(Notification).where(Notification.user_id == user.id))).scalars().all()
    assert [n.kind for n in note] == ["crm.follow_up_due"]
    assert note[0].title == "Lead follow-ups due"


async def test_convert_lead_to_patient(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user = await _agent_user(db)
    h = auth_headers(user)
    lead = await _lead(client, h)
    body = {
        "first_name": "Chidi",
        "last_name": "Okeke",
        "email": "chidi.okeke@gmail.com",
        "nationality": "NG",
        "consent_attested": True,
    }
    r = await client.post(
        f"{API}/agent-portal/leads/{lead['id']}/convert", json={**body, "consent_attested": False}, headers=h
    )
    assert r.status_code == 422
    r = await client.post(f"{API}/agent-portal/leads/{lead['id']}/convert", json=body, headers=h)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["lead"]["status"] == "won"
    assert out["lead"]["converted_patient_id"] == out["patient"]["id"]
    patient = await db.get(PatientProfile, out["patient"]["id"])
    assert patient is not None and patient.managed_by_agent_id is not None
    r = await client.post(f"{API}/agent-portal/leads/{lead['id']}/convert", json=body, headers=h)
    assert r.status_code == 409
    r = await client.patch(f"{API}/agent-portal/leads/{lead['id']}", json={"status": "new"}, headers=h)
    assert r.status_code == 409

    # privacy: the converted patient's export includes the lead; erasure removes it
    from app.modules.privacy.erasure import erase_personal_data
    from app.modules.privacy.export import collect

    patient_user = await db.get(User, patient.user_id)
    assert patient_user is not None
    data, _ = await collect(db, patient_user)
    assert data["agent_leads"][0]["full_name"] == "Chidi Okeke"
    assert "email_fingerprint" not in data["agent_leads"][0]
    await erase_personal_data(db, patient_user, patient)
    await db.commit()
    assert (await db.execute(select(func.count()).select_from(AgentLead))).scalar_one() == 0


async def test_convert_requires_active_agency(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user = await _agent_user(db, status="pending")
    lead = await _lead(client, auth_headers(user))
    r = await client.post(
        f"{API}/agent-portal/leads/{lead['id']}/convert",
        json={"first_name": "A", "last_name": "B", "nationality": "NG", "consent_attested": True},
        headers=auth_headers(user),
    )
    assert r.status_code == 403


CSV_OK = (
    "full_name,country,email,phone,source,interest,budget,budget_currency,next_follow_up,tags,note\n"
    "Ada Lovelace,GB,ada@example.test,+44 7700 900222,event,cardiac check,"
    "2500.00,USD,2030-02-01,vip;event,hello\n"
    "Ada Again,GB,ADA@example.test,,other,,,,,,\n"
    "=cmd,NG,,,walk-in,,,,,,\n"
)


async def test_csv_import_and_export(client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any) -> None:
    user = await _agent_user(db)
    h = auth_headers(user)
    url = f"{API}/agent-portal/leads/import"
    bad = "full_name,email,budget\n,not-an-email,abc\n"
    r = await client.post(url, files={"file": ("l.csv", bad.encode(), "text/csv")}, headers=h)
    assert r.status_code == 200 and r.json()["created"] == 0 and r.json()["errors"]
    r = await client.post(url, files={"file": ("l.csv", b"name\nx\n", "text/csv")}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "import_bad_header"

    r = await client.post(
        url, params={"dry_run": "true"}, files={"file": ("l.csv", CSV_OK.encode(), "text/csv")}, headers=h
    )
    assert r.json() == {"dry_run": True, "total_rows": 3, "created": 2, "skipped_duplicates": 1, "errors": []}
    assert (await db.execute(select(func.count()).select_from(AgentLead))).scalar_one() == 0
    r = await client.post(url, files={"file": ("l.csv", CSV_OK.encode(), "text/csv")}, headers=h)
    assert r.json()["created"] == 2
    ada = (await db.execute(select(AgentLead).where(AgentLead.full_name == "Ada Lovelace"))).scalar_one()
    assert ada.budget_minor == 250000 and ada.tags == ["vip", "event"] and ada.source.value == "event"
    # re-import: everything is a duplicate except the row without contact details
    r = await client.post(url, files={"file": ("l.csv", CSV_OK.encode(), "text/csv")}, headers=h)
    assert r.json()["skipped_duplicates"] == 2

    r = await client.get(f"{API}/agent-portal/leads/export", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    text = r.content.decode("utf-8-sig")
    assert "ada@example.test" in text
    assert "'=cmd" in text and ",=cmd" not in text  # formula injection guard


async def test_purge_lost_leads(client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any) -> None:
    user = await _agent_user(db)
    h = auth_headers(user)
    old = await _lead(client, h)
    recent = await _lead(client, h, full_name="Recent", email=None, phone=None)
    for lead in (old, recent):
        await client.patch(
            f"{API}/agent-portal/leads/{lead['id']}",
            json={"status": "lost", "lost_reason": "no answer"},
            headers=h,
        )
    row = await db.get(AgentLead, old["id"])
    assert row is not None
    row.status_changed_at = datetime.now(UTC) - timedelta(days=400)
    await db.commit()
    assert await crm.purge_lost_leads(db, 365) == 1
    await db.commit()
    remaining = (await db.execute(select(AgentLead.full_name))).scalars().all()
    assert remaining == ["Recent"]
    assert LeadStatus.LOST.value == "lost"
