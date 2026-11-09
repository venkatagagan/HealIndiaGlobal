"""Screening module tests (PLAN 7 and 8.6)."""

from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import anthropic
import httpx2
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.enums import AIEngine, AIRequestStatus, ConsentKind, SlotKind, Urgency
from app.models import AIRequestLog, AvailabilitySlot, BackgroundJob, Consent, Screening, ScreeningMatch
from app.modules.screening.ai import claude
from app.modules.screening.ai.claude import Attachment, build_attachment_blocks
from app.modules.screening.ai.rules import detect_red_flags, rules_triage
from app.modules.screening.ai.schema import TRIAGE_JSON_SCHEMA
from app.modules.screening.service import load_catalog
from tests.factories import create_agent, create_hospital, create_patient, create_user
from tests.modules.screening_helpers import (
    World,
    build_world,
    claude_triage_payload,
    fake_response,
    json_response,
)

API = "/api/v1"


@pytest.fixture
async def world(db: Any) -> World:
    return await build_world(db)


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")


def install_fake_claude(monkeypatch: pytest.MonkeyPatch, behaviour: Any) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def _fake(**kwargs: Any) -> Any:
        calls.append(kwargs)
        if isinstance(behaviour, BaseException):
            raise behaviour
        return behaviour

    monkeypatch.setattr(claude, "create_message", _fake)
    return calls


async def start_screening(
    client: Any,
    headers: dict[str, str],
    *,
    patch: dict[str, Any] | None = None,
    create: dict[str, Any] | None = None,
) -> dict[str, Any]:
    r = await client.post(
        f"{API}/screenings", json=create or {"specialty_slug": "orthopedics"}, headers=headers
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    body = patch or {
        "body_areas": ["knee"],
        "pain_intensity": 6,
        "symptoms": [{"name": "Joint pain", "answer": "yes"}, {"name": "Swelling", "answer": "maybe"}],
        "duration_value": 8,
        "duration_unit": "months",
        "severity": {"work": "moderate", "sleep": "mild", "mobility": "moderate"},
        "previous_treatments": ["medication", "physical_therapy"],
        "notes": "Arthritis in my right knee, stairs are hard.",
    }
    r = await client.patch(f"{API}/screenings/{sid}", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def submit_and_run(
    client: Any, headers: dict[str, str], sid: str, run_jobs: Any, *, consent: bool = True
) -> dict[str, Any]:
    r = await client.post(f"{API}/screenings/{sid}/submit", json={"consent_ai": consent}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "processing"
    assert await run_jobs() >= 1
    r = await client.get(f"{API}/screenings/{sid}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------------------------- full flow
async def test_full_flow_with_mocked_claude(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World, ai_on: None, monkeypatch: Any
) -> None:
    calls = install_fake_claude(monkeypatch, json_response(claude_triage_payload()))
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    assert s["status"] == "draft"
    assert s["specialty"]["slug"] == "orthopedics"
    assert s["home_country"] == "US"

    r = await client.patch(
        f"{API}/screenings/{s['id']}",
        json={
            "preferences": {
                "languages": ["Arabic"],
                "doctor_gender": "female",
                "budget_max_minor": 10_000_00,
                "budget_currency": "USD",
                "use_ai": True,
            }
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["preferences"]["budget_currency"] == "USD"

    done = await submit_and_run(client, headers, s["id"], run_jobs)
    assert done["status"] == "completed", done
    assert done["urgency"] == "routine"
    result = done["ai_result"]
    assert result["engine"] == "claude"
    assert [x["slug"] for x in result["suggested_specialties"]] == ["orthopedics"]
    assert result["suggested_specialties"][0]["name"] == "Orthopedics"  # canonical catalog name
    assert [x["slug"] for x in result["recommended_procedures"]] == ["total-knee-replacement"]
    assert done["completed_at"] is not None

    # the request sent to Claude
    assert len(calls) == 1
    req = calls[0]
    assert req["model"] == settings.AI_MODEL
    assert req["max_tokens"] == 16000
    assert req["output_config"]["format"] == {"type": "json_schema", "schema": TRIAGE_JSON_SCHEMA}
    assert req["output_config"]["effort"] == settings.AI_EFFORT
    assert req["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "orthopedics | Orthopedics" in req["system"][0]["text"]
    assert "total-knee-replacement" in req["system"][0]["text"]
    for forbidden in ("thinking", "temperature", "budget_tokens"):
        assert forbidden not in req
    assert len(req["messages"]) == 1 and req["messages"][0]["role"] == "user"
    user_text = req["messages"][0]["content"][-1]["text"]
    assert "<patient_intake>" in user_text and "Arthritis in my right knee" in user_text
    assert world.patient.full_name not in user_text  # de-identified

    # matches: female Arabic-speaking JCI doctor first, with savings vs the US benchmark
    r = await client.get(f"{API}/screenings/{s['id']}/matches", headers=headers)
    assert r.status_code == 200, r.text
    matches = r.json()
    assert len(matches) == 3  # cardiology doctor is not a candidate
    top = matches[0]
    assert top["rank"] == 1
    assert top["doctor"]["id"] == str(world.doc_a.id)
    assert top["hospital"]["id"] == str(world.hosp_a.id)
    assert top["procedure"]["slug"] == "total-knee-replacement"
    assert top["package"]["id"] == str(world.package_a.id)
    assert top["currency"] == "USD"
    assert top["estimated_cost_minor"] == 4545_45  # INR 4,00,000 at 88 INR/USD
    for reason in ("JCI accredited", "Speaks Arabic", "Within your budget", "Female doctor, as you prefer"):
        assert reason in top["reasons"], top["reasons"]
    assert top["savings"]["home_country"] == "US"
    assert top["savings"]["home_currency"] == "USD"
    assert top["savings"]["pct_min"] == 85 and top["savings"]["pct_max"] == 91
    assert top["doctor"]["specialty"]["slug"] == "orthopedics"
    assert top["doctor"]["hospital"]["accreditations"] == ["jci", "nabh"]
    assert top["hospital"]["starting_price_minor"] == 3_90_000_00
    scores = [Decimal(str(m["match_score"])) for m in matches]
    assert scores == sorted(scores, reverse=True)
    assert all(Decimal(0) <= sc <= Decimal(100) for sc in scores)

    logs = (await db.execute(select(AIRequestLog))).scalars().all()
    assert len(logs) == 1
    assert logs[0].status == AIRequestStatus.OK
    assert logs[0].input_tokens == 1200 and logs[0].output_tokens == 300
    assert logs[0].screening_id is not None and logs[0].latency_ms is not None
    consents = (
        (await db.execute(select(Consent).where(Consent.user_id == world.patient_user.id))).scalars().all()
    )
    assert [c.kind for c in consents] == [ConsentKind.AI_PROCESSING]
    row = await db.get(Screening, s["id"])
    assert row.ai_engine == AIEngine.CLAUDE and row.ai_model == "claude-opus-5-5"

    # list
    r = await client.get(f"{API}/screenings", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 1 and r.json()["items"][0]["id"] == s["id"]


async def test_refusal_falls_back_to_rules(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World, ai_on: None, monkeypatch: Any
) -> None:
    install_fake_claude(monkeypatch, fake_response(stop_reason="refusal"))
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    done = await submit_and_run(client, headers, s["id"], run_jobs)
    assert done["status"] == "completed"
    assert done["ai_result"]["engine"] == "rules"
    assert "orthopedics" in [x["slug"] for x in done["ai_result"]["suggested_specialties"]]
    log = (await db.execute(select(AIRequestLog))).scalar_one()
    assert log.status == AIRequestStatus.REFUSAL
    assert "bio" in (log.error or "")
    r = await client.get(f"{API}/screenings/{s['id']}/matches", headers=headers)
    assert len(r.json()) == 3


@pytest.mark.parametrize("text", ["not json at all", json.dumps(["a", "list"]), '{"urgency": "whenever"}'])
async def test_invalid_json_falls_back_to_rules(
    client: Any,
    db: Any,
    auth_headers: Any,
    run_jobs: Any,
    world: World,
    ai_on: None,
    monkeypatch: Any,
    text: str,
) -> None:
    install_fake_claude(monkeypatch, fake_response(text=text))
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    done = await submit_and_run(client, headers, s["id"], run_jobs)
    assert done["status"] == "completed"
    assert done["ai_result"]["engine"] == "rules"
    log = (await db.execute(select(AIRequestLog))).scalar_one()
    assert log.status == AIRequestStatus.ERROR
    assert "Invalid triage JSON" in (log.error or "")


async def test_sdk_errors_fall_back_to_rules(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World, ai_on: None, monkeypatch: Any
) -> None:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    install_fake_claude(monkeypatch, anthropic.APIConnectionError(request=request))
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    done = await submit_and_run(client, headers, s["id"], run_jobs)
    assert done["status"] == "completed"
    assert done["ai_result"]["engine"] == "rules"
    log = (await db.execute(select(AIRequestLog))).scalar_one()
    assert log.status == AIRequestStatus.ERROR and "APIConnectionError" in (log.error or "")


async def test_ai_not_configured_uses_rules_and_logs_fallback(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World
) -> None:
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    done = await submit_and_run(client, headers, s["id"], run_jobs)
    assert done["ai_result"]["engine"] == "rules"
    log = (await db.execute(select(AIRequestLog))).scalar_one()
    assert log.status == AIRequestStatus.FALLBACK


async def test_use_ai_false_skips_claude_and_needs_no_consent(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World, ai_on: None, monkeypatch: Any
) -> None:
    calls = install_fake_claude(monkeypatch, json_response(claude_triage_payload()))
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    r = await client.patch(
        f"{API}/screenings/{s['id']}", json={"preferences": {"use_ai": False}}, headers=headers
    )
    assert r.status_code == 200
    done = await submit_and_run(client, headers, s["id"], run_jobs, consent=False)
    assert done["status"] == "completed" and done["ai_result"]["engine"] == "rules"
    assert done["consent_ai"] is False
    assert calls == []
    assert (await db.execute(select(AIRequestLog))).scalars().all() == []
    assert (await db.execute(select(Consent))).scalars().all() == []


# --------------------------------------------------------------------------------------------- rules engine
async def test_emergency_detection(client: Any, auth_headers: Any, run_jobs: Any, world: World) -> None:
    headers = auth_headers(world.patient_user)
    s = await start_screening(
        client,
        headers,
        create={"specialty_slug": "cardiology"},
        patch={
            "body_areas": ["chest"],
            "notes": "I get chest pain at rest and since this morning I have slurred speech.",
            "preferences": {"use_ai": False},
        },
    )
    done = await submit_and_run(client, headers, s["id"], run_jobs, consent=False)
    assert done["status"] == "completed"
    assert done["urgency"] == "emergency"
    assert "Chest pain at rest" in done["red_flags"]
    assert "Slurred speech (stroke sign)" in done["red_flags"]
    assert "emergency" in done["ai_result"]["travel_advice"].lower()


async def test_rules_engine_mapping(db: Any, world: World) -> None:
    catalog = await load_catalog(db)
    result = rules_triage(
        {
            "specialty_slug": None,
            "body_areas": ["knee"],
            "pain_intensity": 9,
            "symptoms": [{"name": "Joint pain", "answer": "yes"}],
            "severity": {"mobility": "severe"},
            "notes": "Doctor said I may need a knee replacement",
        },
        catalog,
    )
    assert result.engine == AIEngine.RULES
    assert result.suggested_specialties[0].slug == "orthopedics"
    assert result.recommended_procedures[0].slug == "total-knee-replacement"
    assert result.urgency == Urgency.URGENT
    assert result.red_flags == []
    assert detect_red_flags(["I have been thinking about suicide"]) == ["Suicidal thoughts"]
    assert detect_red_flags(["mild knee pain"]) == []


def test_attachment_blocks_limits() -> None:
    big = Attachment("application/pdf", b"x" * (claude.MAX_ATTACHMENT_BYTES + 1))
    blocks = build_attachment_blocks(
        [
            big,
            Attachment("application/dicom", b"dcm"),
            Attachment("application/pdf", b"%PDF-1.7"),
            Attachment("image/png", b"png"),
            Attachment("image/jpg", b"jpg"),
            Attachment("image/webp", b"webp"),
        ]
    )
    assert [b["type"] for b in blocks] == ["document", "image", "image"]
    assert blocks[2]["source"]["media_type"] == "image/jpeg"


# --------------------------------------------------------------------------------------------- matching
async def test_matching_ranking_budget_gender_accreditation(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World
) -> None:
    """Male doctor + tight budget: the cheaper NABH hospital beats the JCI one; accreditation separates B
    from the otherwise identical unaccredited C."""
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    r = await client.patch(
        f"{API}/screenings/{s['id']}",
        json={
            "preferences": {
                "languages": ["hi"],
                "doctor_gender": "male",
                "budget_max_minor": 4_000_00,
                "budget_currency": "USD",
                "use_ai": False,
            }
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    await submit_and_run(client, headers, s["id"], run_jobs, consent=False)
    matches = (await client.get(f"{API}/screenings/{s['id']}/matches", headers=headers)).json()
    order = [m["doctor"]["id"] for m in matches]
    assert order == [str(world.doc_b.id), str(world.doc_c.id), str(world.doc_a.id)]
    by_doc = {m["doctor"]["id"]: m for m in matches}
    b, c, a = by_doc[str(world.doc_b.id)], by_doc[str(world.doc_c.id)], by_doc[str(world.doc_a.id)]
    assert Decimal(str(b["match_score"])) - Decimal(str(c["match_score"])) == Decimal(7)  # NABH
    assert "Within your budget" in b["reasons"] and "Within your budget" not in a["reasons"]
    assert "Male doctor, as you prefer" in b["reasons"]
    assert "Speaks Hindi" in b["reasons"] and "Speaks Hindi" not in a["reasons"]
    assert b["package"] is None and b["estimated_cost_minor"] == 3409_09
    rows = (await db.execute(select(ScreeningMatch).order_by(ScreeningMatch.rank))).scalars().all()
    assert [m.rank for m in rows] == [1, 2, 3]


async def test_matching_language_and_availability(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World
) -> None:
    start = date.today() + timedelta(days=30)
    db.add(
        AvailabilitySlot(
            hospital_id=world.hosp_c.id,
            doctor_id=world.doc_c.id,
            date=start + timedelta(days=3),
            slot_kind=SlotKind.ADMISSION,
            capacity=2,
            booked=0,
        )
    )
    db.add(  # full slot does not count
        AvailabilitySlot(
            hospital_id=world.hosp_b.id,
            doctor_id=world.doc_b.id,
            date=start + timedelta(days=3),
            slot_kind=SlotKind.ADMISSION,
            capacity=1,
            booked=1,
        )
    )
    await db.commit()
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    r = await client.patch(
        f"{API}/screenings/{s['id']}",
        json={
            "preferences": {
                "languages": ["Arabic"],
                "travel_window_start": start.isoformat(),
                "travel_window_end": (start + timedelta(days=14)).isoformat(),
                "use_ai": False,
            }
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    await submit_and_run(client, headers, s["id"], run_jobs, consent=False)
    matches = (await client.get(f"{API}/screenings/{s['id']}/matches", headers=headers)).json()
    by_doc = {m["doctor"]["id"]: m for m in matches}
    assert "Speaks Arabic" in by_doc[str(world.doc_a.id)]["reasons"]
    assert "Speaks Arabic" not in by_doc[str(world.doc_b.id)]["reasons"]
    assert "Available in your travel window" in by_doc[str(world.doc_c.id)]["reasons"]
    assert "Available in your travel window" not in by_doc[str(world.doc_b.id)]["reasons"]
    assert matches[0]["doctor"]["id"] == str(world.doc_a.id)


# ---------------------------------------------------------------------------------- API rules
async def test_consent_required_when_ai_enabled(client: Any, auth_headers: Any, world: World) -> None:
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    r = await client.post(f"{API}/screenings/{s['id']}/submit", json={"consent_ai": False}, headers=headers)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "consent_required"


async def test_patch_after_submit_rejected_and_rerun(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World
) -> None:
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    r = await client.post(f"{API}/screenings/{s['id']}/submit", json={"consent_ai": True}, headers=headers)
    assert r.status_code == 200
    r = await client.patch(f"{API}/screenings/{s['id']}", json={"pain_intensity": 2}, headers=headers)
    assert r.status_code == 409 and r.json()["error"]["code"] == "screening_not_draft"
    r = await client.post(f"{API}/screenings/{s['id']}/submit", json={"consent_ai": True}, headers=headers)
    assert r.status_code == 409
    r = await client.post(f"{API}/screenings/{s['id']}/rerun", headers=headers)
    assert r.status_code == 409  # still processing
    # only one job even though submit was attempted twice
    jobs = (
        await db.execute(select(BackgroundJob).where(BackgroundJob.task_name == "screening.run_ai"))
    ).scalars()
    assert len(list(jobs)) == 1
    assert await run_jobs() >= 1
    r = await client.post(f"{API}/screenings/{s['id']}/rerun", headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "processing"
    assert await run_jobs() >= 1
    r = await client.get(f"{API}/screenings/{s['id']}", headers=headers)
    assert r.json()["status"] == "completed"
    count = len((await db.execute(select(ScreeningMatch))).scalars().all())
    assert count == 3  # previous matches replaced, not duplicated


async def test_validation_errors(client: Any, auth_headers: Any, world: World) -> None:
    headers = auth_headers(world.patient_user)
    r = await client.post(f"{API}/screenings", json={"specialty_slug": "no-such"}, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_specialty"
    r = await client.post(f"{API}/screenings", json={"surprise": 1}, headers=headers)
    assert r.status_code == 422
    s = await start_screening(client, headers)
    url = f"{API}/screenings/{s['id']}"
    bad_bodies = [
        {"pain_intensity": 11},
        {"symptoms": [{"name": "x", "answer": "often"}]},
        {"severity": {"work": "extreme"}},
        {"duration_unit": "decades"},
        {"previous_treatments": ["magic"]},
        {"preferences": {"budget_min_minor": 500, "budget_max_minor": 100, "budget_currency": "USD"}},
        {"preferences": {"budget_max_minor": 100}},
        {"preferences": {"travel_window_start": "2027-02-01", "travel_window_end": "2027-01-01"}},
        {"body_areas": ["../etc"]},
    ]
    for body in bad_bodies:
        r = await client.patch(url, json=body, headers=headers)
        assert r.status_code == 422, (body, r.text)
    r = await client.patch(
        url, json={"preferences": {"budget_max_minor": 100, "budget_currency": "XYZ"}}, headers=headers
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_currency"
    r = await client.patch(
        url, json={"report_document_ids": ["00000000-0000-7000-8000-000000000000"]}, headers=headers
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_document"
    # partial preference updates merge
    r = await client.patch(url, json={"preferences": {"languages": ["Hindi"]}}, headers=headers)
    r = await client.patch(url, json={"preferences": {"doctor_gender": "female"}}, headers=headers)
    assert r.json()["preferences"]["languages"] == ["Hindi"]
    assert r.json()["preferences"]["doctor_gender"] == "female"
    empty = (await client.post(f"{API}/screenings", json={}, headers=headers)).json()
    r = await client.post(
        f"{API}/screenings/{empty['id']}/submit", json={"consent_ai": True}, headers=headers
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "screening_incomplete"


async def test_submit_rate_limited(
    client: Any, auth_headers: Any, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    statuses = [
        (
            await client.post(
                f"{API}/screenings/{s['id']}/submit", json={"consent_ai": True}, headers=headers
            )
        ).status_code
        for _ in range(6)
    ]
    assert statuses[0] == 200 and statuses[1:5] == [409] * 4 and statuses[5] == 429


# --------------------------------------------------------------------------------------------- scoping
async def test_scoping_other_patient_hospital_and_staff(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World
) -> None:
    headers = auth_headers(world.patient_user)
    s = await start_screening(client, headers)
    other = await create_user(db, role="patient")
    await create_patient(db, other)
    oh = auth_headers(other)
    for method, path, body in (
        ("get", f"/screenings/{s['id']}", None),
        ("get", f"/screenings/{s['id']}/matches", None),
        ("patch", f"/screenings/{s['id']}", {"pain_intensity": 1}),
        ("post", f"/screenings/{s['id']}/submit", {"consent_ai": True}),
        ("post", f"/screenings/{s['id']}/rerun", None),
    ):
        r = await client.request(method.upper(), f"{API}{path}", json=body, headers=oh)
        assert r.status_code == 404, (method, path, r.text)
    assert (await client.get(f"{API}/screenings", headers=oh)).json()["total"] == 0
    # a patient cannot create for someone else
    r = await client.post(f"{API}/screenings", json={"patient_id": str(world.patient.id)}, headers=oh)
    assert r.status_code == 404

    hospital_user = await create_user(db, role="hospital")
    await create_hospital(db, owner=hospital_user)
    hh = auth_headers(hospital_user)
    assert (await client.get(f"{API}/screenings/{s['id']}", headers=hh)).status_code == 404
    assert (await client.post(f"{API}/screenings", json={}, headers=hh)).status_code == 403

    admin = await create_user(db, role="admin")
    ah = auth_headers(admin)
    r = await client.get(f"{API}/screenings/{s['id']}", headers=ah)
    assert r.status_code == 200
    r = await client.get(f"{API}/screenings", params={"patient_id": str(world.patient.id)}, headers=ah)
    assert r.json()["total"] == 1
    finance = await create_user(db, role="finance")
    r = await client.patch(
        f"{API}/screenings/{s['id']}", json={"pain_intensity": 1}, headers=auth_headers(finance)
    )
    assert r.status_code == 403
    assert (await client.get(f"{API}/screenings")).status_code == 401


async def test_hospital_member_sees_screening_linked_to_their_case(
    client: Any, db: Any, auth_headers: Any, world: World
) -> None:
    from tests.factories import create_case

    s = await start_screening(client, auth_headers(world.patient_user))
    hospital_user = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    await create_case(db, world.patient, hospital, screening_id=uuid.UUID(s["id"]))
    hh = auth_headers(hospital_user)
    assert (await client.get(f"{API}/screenings/{s['id']}", headers=hh)).status_code == 200
    r = await client.patch(f"{API}/screenings/{s['id']}", json={"pain_intensity": 1}, headers=hh)
    assert r.status_code == 403


async def test_agent_on_behalf_of_managed_patient(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: World
) -> None:
    agent = await create_agent(db)
    agent_user = await db.get(type(world.patient_user), agent.user_id)
    managed = await create_patient(
        db, managed_by_agent_id=agent.id, country_of_residence="AE", nationality="IN"
    )
    referred = await create_patient(db, referred_by_agent_id=agent.id)
    ah = auth_headers(agent_user)

    r = await client.post(f"{API}/screenings", json={"specialty_slug": "orthopedics"}, headers=ah)
    assert r.status_code == 400 and r.json()["error"]["code"] == "patient_required"
    r = await client.post(f"{API}/screenings", json={"patient_id": str(world.patient.id)}, headers=ah)
    assert r.status_code == 404  # not this agent's patient

    s = await start_screening(
        client, ah, create={"specialty_slug": "orthopedics", "patient_id": str(managed.id)}
    )
    assert s["patient_id"] == str(managed.id) and s["home_country"] == "AE"
    r = await client.post(f"{API}/screenings", json={"patient_id": str(referred.id)}, headers=ah)
    assert r.status_code == 201

    done = await submit_and_run(client, ah, s["id"], run_jobs)
    assert done["status"] == "completed"
    consent = (await db.execute(select(Consent))).scalar_one()
    assert consent.user_id == managed.user_id  # recorded for the patient
    # SEC-060: ... but as granted by the agent, so it is not the patient's own confirmation
    assert consent.granted_by_user_id == agent.user_id

    listing = (await client.get(f"{API}/screenings", headers=ah)).json()
    assert listing["total"] == 2
    # the patient's own screening is invisible to the agent
    own = await start_screening(client, auth_headers(world.patient_user))
    assert (await client.get(f"{API}/screenings/{own['id']}", headers=ah)).status_code == 404
    # matches visible to the agent; no US benchmark for AE so savings are absent
    matches = (await client.get(f"{API}/screenings/{s['id']}/matches", headers=ah)).json()
    assert matches and all(m["savings"] is None for m in matches)


async def test_guest_like_patient_without_profile_gets_one(client: Any, db: Any, auth_headers: Any) -> None:
    user = await create_user(db, role="patient", full_name="Amina Yusuf", country_code="NG")
    r = await client.post(f"{API}/screenings", json={}, headers=auth_headers(user))
    assert r.status_code == 201, r.text
    assert r.json()["home_country"] == "NG"
    assert r.json()["specialty"] is None
