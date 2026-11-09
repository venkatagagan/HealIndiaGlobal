"""Document intelligence (PLAN 7.1): request -> AI reading (mocked Claude) -> review -> edit -> confirm."""

from __future__ import annotations

import io
import json
import uuid
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import pytest
from PIL import Image, ImageDraw
from sqlalchemy import select

from app.core.config import settings
from app.core.storage import get_storage, make_key
from app.models import AIRequestLog, Consent, Document, Notification
from app.models.docai import DocumentAnalysis
from app.modules.docai import ai as docai_ai
from app.modules.docai.pipeline import MAX_LONG_EDGE, PageError, prepare_page
from app.modules.docai.service import get_confirmed_analyses_for_documents
from app.modules.documents.validation import detect_type
from app.modules.screening.ai import claude as screening_claude
from tests.factories import (
    create_agent,
    create_case,
    create_hospital,
    create_patient,
    create_specialty,
    create_user,
)
from tests.modules.screening_helpers import claude_triage_payload, json_response

API = "/api/v1"

PDF_BYTES = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)
DICOM_BYTES = b"\x00" * 128 + b"DICM" + b"\x02\x00\x00\x00UL\x04\x00" + b"\x00" * 64


# ------------------------------------------------------------------------------------------- builders
def page_image(size: tuple[int, int] = (900, 1200), fmt: str = "PNG", exif: bytes | None = None) -> bytes:
    img = Image.new("RGB", size, (250, 250, 250))
    draw = ImageDraw.Draw(img)
    for y in range(40, size[1] - 40, 28):
        draw.line([(40, y), (size[0] - 40, y)], fill=(20, 20, 20), width=3)
    out = io.BytesIO()
    if exif is not None:
        img.save(out, format=fmt, exif=exif)
    else:
        img.save(out, format=fmt)
    return out.getvalue()


def gps_exif() -> bytes:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x0112] = 6  # Orientation: rotate 90 CW
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (12.0, 58.0, 0.0)
    return exif.tobytes()


async def add_document(
    db: Any, owner: Any, patient: Any, data: bytes, kind: str = "medical_report", **kw: Any
) -> Document:
    key = make_key("documents", "bin")
    await get_storage().save(key, data)
    doc = Document(
        owner_user_id=owner.id,
        patient_id=patient.id if patient is not None else None,
        kind=kind,
        file_name="report.bin",
        content_type=(detect_type(data) or ("application/octet-stream",))[0],
        size_bytes=len(data),
        storage_key=key,
        sha256=uuid.uuid4().hex + uuid.uuid4().hex,
        **kw,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


def ai_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "doc_type": "lab_report",
        "language": "en",
        "report_date": "2026-09-14",
        "facility_name": "City Diagnostics",
        "summary_patient": "Your blood sugar was higher than normal. A doctor will review this report.",
        "summary_clinical": "HbA1c 8.1% (high). Fasting glucose 162 mg/dL (high).",
        "key_findings": [{"finding": "HbA1c above reference range", "significance": "attention"}],
        "lab_values": [
            {"test": "HbA1c", "value": "8.1", "unit": "%", "reference_range": "4.0-5.6", "flag": "high"},
            {
                "test": "Potassium",
                "value": "6.9",
                "unit": "mmol/L",
                "reference_range": "3.5-5.1",
                "flag": "critical",
            },
        ],
        "diagnoses_mentioned": ["Type 2 diabetes mellitus"],
        "medications": [{"name": "Metformin", "dose": "500 mg", "frequency": "twice daily"}],
        "procedures_mentioned": [],
        "recommendations": ["Repeat HbA1c in 3 months"],
        "red_flags": ["Potassium 6.9 mmol/L (critical)"],
        "suggested_specialties": ["endocrinology-made-up", "cardiology"],
        "legible": True,
        "quality_issues": [],
        "confidence": 0.86,
    }
    payload.update(overrides)
    return payload


def fake_response(text: str | None = None, stop_reason: str = "end_turn") -> SimpleNamespace:
    content = [SimpleNamespace(type="thinking", thinking="")]
    if text is not None:
        content.append(SimpleNamespace(type="text", text=text))
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(category="bio") if stop_reason == "refusal" else None,
        content=content,
        usage=SimpleNamespace(input_tokens=2000, output_tokens=500, cache_read_input_tokens=0),
        model="claude-opus-5-5",
    )


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "DOCAI_ENABLED", True)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")


def install_fake(monkeypatch: pytest.MonkeyPatch, behaviour: Any) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def _fake(**kwargs: Any) -> Any:
        calls.append(kwargs)
        if isinstance(behaviour, BaseException):
            raise behaviour
        return behaviour

    monkeypatch.setattr(docai_ai, "create_message", _fake)
    return calls


@pytest.fixture
async def world(db: Any) -> SimpleNamespace:
    await create_specialty(db, slug="cardiology", name="Cardiology")
    patient_user = await create_user(db, role="patient")
    patient = await create_patient(db, patient_user, preferred_language="fr")
    other_user = await create_user(db, role="patient")
    other = await create_patient(db, other_user)
    hospital_user = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    stranger_hospital_user = await create_user(db, role="hospital")
    await create_hospital(db, owner=stranger_hospital_user)
    case = await create_case(db, patient, hospital)
    agent = await create_agent(db)
    agent_user = await db.get(type(patient_user), agent.user_id)
    managed_user = await create_user(db, role="patient")
    managed = await create_patient(db, managed_user, managed_by_agent_id=agent.id)
    return SimpleNamespace(**locals())


async def request_analysis(
    client: httpx.AsyncClient, headers: dict[str, str], ids: list[Any], **extra: Any
) -> httpx.Response:
    body = {"document_ids": [str(i) for i in ids], "consent_ai": True, **extra}
    return await client.post(f"{API}/documents/analyses", json=body, headers=headers)


async def analyse(client: Any, headers: dict[str, str], ids: list[Any], run_jobs: Any, **extra: Any) -> dict:
    r = await request_analysis(client, headers, ids, **extra)
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "queued"
    assert await run_jobs() >= 1
    r = await client.get(f"{API}/documents/analyses/{r.json()['id']}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------------------------------------- happy path
async def test_single_page_analysis_completes(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    calls = install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    doc = await add_document(db, world.patient_user, world.patient, page_image())
    headers = auth_headers(world.patient_user)

    out = await analyse(client, headers, [doc.id], run_jobs, case_id=str(world.case.id))
    assert out["status"] == "completed", out
    assert out["review_status"] == "pending_review"
    assert out["audience"] == "owner"
    assert out["doc_type"] == "lab_report"
    assert out["report_date"] == "2026-09-14"
    assert out["lab_values"][1]["flag"] == "critical"
    assert out["suggested_specialties"] == ["cardiology"]  # unknown slug dropped
    assert out["red_flags"] == ["Potassium 6.9 mmol/L (critical)"]
    assert out["quality"]["pages_analyzed"] == 1
    assert out["ai_output"]["doc_type"] == "lab_report"
    assert out["edited_by_patient"] is False
    assert out["summary_language"] == "en"  # English-only, even for a French-speaking patient
    assert out["case_id"] == str(world.case.id)

    # PLAN 7 call rules: structured output + effort, cached system prompt, no thinking/temperature.
    (req,) = calls
    assert req["model"] == settings.AI_MODEL
    assert req["max_tokens"] == 16000
    assert req["output_config"]["effort"] == settings.DOCAI_EFFORT
    assert req["output_config"]["format"]["type"] == "json_schema"
    assert req["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "untrusted" in req["system"][0]["text"]
    for forbidden in ("thinking", "temperature", "budget_tokens"):
        assert forbidden not in req
    content = req["messages"][0]["content"]
    assert [b["type"] for b in content] == ["text", "image", "text"]
    assert content[1]["source"]["media_type"] == "image/jpeg"
    assert "cardiology" in content[-1]["text"]
    assert "in English" in req["system"][0]["text"]

    consents = (
        (await db.execute(select(Consent).where(Consent.user_id == world.patient_user.id))).scalars().all()
    )
    assert [str(c.kind) for c in consents] == ["ai_processing"]
    log = (await db.execute(select(AIRequestLog).where(AIRequestLog.purpose == "docai"))).scalar_one()
    assert str(log.status) == "ok" and log.input_tokens == 2000
    notes = (
        (await db.execute(select(Notification).where(Notification.user_id == world.patient_user.id)))
        .scalars()
        .all()
    )
    assert any(n.kind == "document.analyzed" for n in notes)


async def test_multi_page_in_order(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    calls = install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    p1 = await add_document(db, world.patient_user, world.patient, PDF_BYTES)
    p2 = await add_document(db, world.patient_user, world.patient, page_image(fmt="JPEG"), kind="lab_result")
    headers = auth_headers(world.patient_user)
    out = await analyse(client, headers, [p1.id, p2.id], run_jobs)
    assert out["status"] == "completed"
    assert out["document_ids"] == [str(p1.id), str(p2.id)]
    assert out["primary_document_id"] == str(p1.id)
    content = calls[0]["messages"][0]["content"]
    assert [b["type"] for b in content] == ["text", "document", "text", "image", "text"]
    assert content[0]["text"].startswith("Page 1 of 2")
    assert content[1]["source"]["media_type"] == "application/pdf"

    r = await client.get(f"{API}/documents/{p2.id}/analysis", headers=headers)
    assert r.status_code == 200 and r.json()["id"] == out["id"]
    r = await client.get(f"{API}/documents/analyses", headers=headers)
    assert r.status_code == 200 and r.json()["total"] == 1


# ------------------------------------------------------------------------------------------- validation
async def test_consent_and_validation(client: Any, db: Any, auth_headers: Any, world: Any) -> None:
    headers = auth_headers(world.patient_user)
    doc = await add_document(db, world.patient_user, world.patient, page_image())
    r = await client.post(
        f"{API}/documents/analyses",
        json={"document_ids": [str(doc.id)], "consent_ai": False},
        headers=headers,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_required"
    r = await request_analysis(client, headers, [doc.id, doc.id])
    assert r.status_code == 400
    passport = await add_document(db, world.patient_user, world.patient, page_image(), kind="passport")
    r = await request_analysis(client, headers, [passport.id])
    assert r.status_code == 400 and r.json()["error"]["code"] == "not_medical_document"
    r = await request_analysis(client, headers, [uuid.uuid4() for _ in range(settings.DOCAI_MAX_PAGES + 1)])
    assert r.status_code == 400
    assert (await db.execute(select(DocumentAnalysis))).first() is None


async def test_access_control(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    doc = await add_document(db, world.patient_user, world.patient, page_image())
    other_doc = await add_document(db, world.other_user, world.other, page_image())

    # Another patient's document: 404 (no IDOR); mixing patients is impossible.
    r = await request_analysis(client, auth_headers(world.patient_user), [other_doc.id])
    assert r.status_code == 404
    out = await analyse(
        client, auth_headers(world.patient_user), [doc.id], run_jobs, case_id=str(world.case.id)
    )
    aid = out["id"]
    r = await client.get(f"{API}/documents/analyses/{aid}", headers=auth_headers(world.other_user))
    assert r.status_code == 404

    # Hospital members: nothing before confirmation, never for other hospitals; they cannot edit.
    hosp = auth_headers(world.hospital_user)
    r = await client.get(f"{API}/documents/analyses/{aid}", headers=hosp)
    assert r.status_code == 404
    r = await client.get(
        f"{API}/documents/analyses/{aid}", headers=auth_headers(world.stranger_hospital_user)
    )
    assert r.status_code == 404
    r = await request_analysis(client, hosp, [doc.id])
    assert r.status_code == 403

    # Agent for their own (managed) patient: OK; for someone else's patient: 404.
    managed_doc = await add_document(db, world.managed_user, world.managed, page_image())
    agent = auth_headers(world.agent_user)
    managed_out = await analyse(client, agent, [managed_doc.id], run_jobs)
    assert managed_out["status"] == "completed"
    assert managed_out["patient_id"] == str(world.managed.id)
    r = await client.get(f"{API}/documents/analyses/{aid}", headers=agent)
    assert r.status_code == 404
    r = await request_analysis(client, agent, [doc.id])
    assert r.status_code == 404


# ------------------------------------------------------------------------------------------- pipeline
def test_pipeline_strips_metadata_and_downscales() -> None:
    data = page_image((3000, 2000), fmt="JPEG", exif=gps_exif())
    with Image.open(io.BytesIO(data)) as src:
        assert src.getexif().get_ifd(0x8825)  # the source really carries GPS
    page = prepare_page(data, 1, uuid.uuid4())
    assert page.kind == "image" and page.media_type == "image/jpeg"
    with Image.open(io.BytesIO(page.data)) as out:
        assert max(out.size) == MAX_LONG_EDGE
        assert out.size == (1045, 1568)  # EXIF orientation (rotate 90) applied before stripping
        assert len(out.getexif()) == 0
        assert "exif" not in out.info and "icc_profile" not in out.info


def test_pipeline_quality_and_unsupported() -> None:
    dark = Image.new("RGB", (400, 300), (5, 5, 5))
    buf = io.BytesIO()
    dark.save(buf, format="PNG")
    page = prepare_page(buf.getvalue(), 2, uuid.uuid4())
    assert any("dark" in i for i in page.issues)
    assert all(i.startswith("Page 2:") for i in page.issues)
    with pytest.raises(PageError) as exc:
        prepare_page(DICOM_BYTES, 1, uuid.uuid4())
    assert exc.value.unsupported and "radiologist" in str(exc.value)
    assert prepare_page(PDF_BYTES, 1, uuid.uuid4()).kind == "pdf"


async def test_dicom_is_unsupported(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    calls = install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    doc = await add_document(db, world.patient_user, world.patient, DICOM_BYTES, kind="imaging")
    out = await analyse(client, auth_headers(world.patient_user), [doc.id], run_jobs)
    assert out["status"] == "unsupported"
    assert "radiologist" in out["error"]
    assert out["review_status"] is None
    assert calls == []


# ------------------------------------------------------------------------------------------- failures
async def test_refusal_invalid_json_and_errors_fail(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    headers = auth_headers(world.patient_user)
    doc = await add_document(db, world.patient_user, world.patient, page_image())

    install_fake(monkeypatch, fake_response(stop_reason="refusal"))
    out = await analyse(client, headers, [doc.id], run_jobs)
    assert out["status"] == "failed" and out["review_status"] is None
    assert out["error"] == docai_ai.REFUSAL_MESSAGE
    assert out["lab_values"] == [] and out["ai_output"] is None

    install_fake(monkeypatch, fake_response("this is not json"))
    r = await client.post(f"{API}/documents/analyses/{out['id']}/retry", headers=headers)
    assert r.status_code == 202 and r.json()["status"] == "queued"
    await run_jobs()
    r = await client.get(f"{API}/documents/analyses/{out['id']}", headers=headers)
    assert r.json()["status"] == "failed" and r.json()["error"] == docai_ai.INVALID_MESSAGE

    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    install_fake(monkeypatch, anthropic.APIConnectionError(request=request))
    await client.post(f"{API}/documents/analyses/{out['id']}/retry", headers=headers)
    await run_jobs()
    r = await client.get(f"{API}/documents/analyses/{out['id']}", headers=headers)
    assert r.json()["status"] == "failed" and r.json()["error"] == docai_ai.AI_FAILED_MESSAGE

    install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    await client.post(f"{API}/documents/analyses/{out['id']}/retry", headers=headers)
    await run_jobs()
    r = await client.get(f"{API}/documents/analyses/{out['id']}", headers=headers)
    assert r.json()["status"] == "completed"
    r = await client.post(f"{API}/documents/analyses/{out['id']}/retry", headers=headers)
    assert r.status_code == 409
    logs = (await db.execute(select(AIRequestLog).where(AIRequestLog.purpose == "docai"))).scalars().all()
    assert sorted(str(x.status) for x in logs) == ["error", "error", "ok", "refusal"]


async def test_not_configured_fails_without_fake_output(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, monkeypatch: Any
) -> None:
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    calls = install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    doc = await add_document(db, world.patient_user, world.patient, page_image())
    out = await analyse(client, auth_headers(world.patient_user), [doc.id], run_jobs)
    assert out["status"] == "failed"
    assert out["error"] == "AI document reading is not configured"
    assert out["summary_clinical"] is None and out["ai_output"] is None
    assert calls == []


# ------------------------------------------------------------------------------------------- review flow
async def test_review_edit_confirm_and_hospital_view(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    headers = auth_headers(world.patient_user)
    hosp = auth_headers(world.hospital_user)
    doc = await add_document(db, world.patient_user, world.patient, page_image())
    out = await analyse(client, headers, [doc.id], run_jobs, case_id=str(world.case.id))
    aid = out["id"]

    r = await client.patch(
        f"{API}/documents/analyses/{aid}",
        json={"facility_name": "City Diagnostics Lab", "medications": []},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["facility_name"] == "City Diagnostics Lab"
    assert set(r.json()["edited_fields"]) == {"facility_name", "medications"}
    assert r.json()["ai_output"]["facility_name"] == "City Diagnostics"  # immutable AI copy
    r = await client.patch(f"{API}/documents/analyses/{aid}", json={"doc_type": "nonsense"}, headers=headers)
    assert r.status_code == 422
    r = await client.patch(f"{API}/documents/analyses/{aid}", json={"facility_name": "X"}, headers=hosp)
    assert r.status_code == 403  # hospitals never edit

    r = await client.post(
        f"{API}/documents/analyses/{aid}/confirm",
        json={
            "lab_values": [
                {"test": "HbA1c", "value": "8.1", "unit": "%", "reference_range": "4.0-5.6", "flag": "high"}
            ],
            "diagnoses_mentioned": ["Type 2 diabetes mellitus"],
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    confirmed = r.json()
    assert confirmed["review_status"] == "confirmed"
    assert confirmed["confirmed_by_user_id"] == str(world.patient_user.id)
    assert confirmed["confirmed_data"]["facility_name"] == "City Diagnostics Lab"
    assert len(confirmed["confirmed_data"]["lab_values"]) == 1
    assert confirmed["edited_by_patient"] is True

    # Locked after confirmation.
    r = await client.patch(f"{API}/documents/analyses/{aid}", json={"facility_name": "Y"}, headers=headers)
    assert r.status_code == 409
    r = await client.post(f"{API}/documents/analyses/{aid}/reject", headers=headers)
    assert r.status_code == 409

    # The case's hospital now sees the confirmed (clinical) version, without the AI draft.
    r = await client.get(f"{API}/documents/analyses/{aid}", headers=hosp)
    assert r.status_code == 200, r.text
    clinical = r.json()
    assert clinical["audience"] == "clinical"
    assert clinical["ai_output"] is None
    assert clinical["facility_name"] == "City Diagnostics Lab"
    assert [v["test"] for v in clinical["lab_values"]] == ["HbA1c"]
    assert set(clinical["edited_fields"]) >= {"facility_name", "lab_values", "medications"}
    r = await client.get(f"{API}/documents/analyses", params={"case_id": str(world.case.id)}, headers=hosp)
    assert r.json()["total"] == 1
    r = await client.post(f"{API}/documents/analyses/{aid}/confirm", json={}, headers=hosp)
    assert r.status_code == 403
    hospital_notes = (
        (await db.execute(select(Notification).where(Notification.user_id == world.hospital_user.id)))
        .scalars()
        .all()
    )
    assert any(n.kind == "document.analyzed" for n in hospital_notes)


async def test_reject_hides_from_screening(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    headers = auth_headers(world.patient_user)
    doc = await add_document(db, world.patient_user, world.patient, page_image())
    out = await analyse(client, headers, [doc.id], run_jobs, case_id=str(world.case.id))
    r = await client.post(f"{API}/documents/analyses/{out['id']}/reject", headers=headers)
    assert r.status_code == 200 and r.json()["review_status"] == "rejected"
    assert await get_confirmed_analyses_for_documents(db, [doc.id]) == []
    r = await client.get(f"{API}/documents/analyses/{out['id']}", headers=auth_headers(world.hospital_user))
    assert r.status_code == 404


# ------------------------------------------------------------------------------------------- screening link
async def test_screening_intake_uses_confirmed_analysis(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    headers = auth_headers(world.patient_user)
    confirmed_doc = await add_document(db, world.patient_user, world.patient, page_image())
    draft_doc = await add_document(db, world.patient_user, world.patient, page_image())
    out = await analyse(client, headers, [confirmed_doc.id], run_jobs)
    r = await client.post(f"{API}/documents/analyses/{out['id']}/confirm", json={}, headers=headers)
    assert r.status_code == 200
    await analyse(client, headers, [draft_doc.id], run_jobs)  # stays pending_review

    reports = await get_confirmed_analyses_for_documents(
        db, [confirmed_doc.id, draft_doc.id], patient_id=world.patient.id
    )
    assert [r["analysis_id"] for r in reports] == [out["id"]]
    assert reports[0]["summary_clinical"].startswith("HbA1c")
    assert reports[0]["red_flags"] == ["Potassium 6.9 mmol/L (critical)"]

    # The triage request carries the confirmed data instead of re-sending that file.
    calls: list[dict[str, Any]] = []

    async def _fake_triage(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return json_response(claude_triage_payload(suggested_specialties=[], recommended_procedures=[]))

    monkeypatch.setattr(screening_claude, "create_message", _fake_triage)
    r = await client.post(f"{API}/screenings", json={}, headers=headers)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    r = await client.patch(
        f"{API}/screenings/{sid}",
        json={"notes": "High sugar", "report_document_ids": [str(confirmed_doc.id), str(draft_doc.id)]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    r = await client.post(f"{API}/screenings/{sid}/submit", json={"consent_ai": True}, headers=headers)
    assert r.status_code == 200, r.text
    await run_jobs()
    (req,) = calls
    content = req["messages"][0]["content"]
    text = content[-1]["text"]
    assert "confirmed_reports" in text and "HbA1c" in text and "Potassium 6.9" in text
    assert [b["type"] for b in content].count("image") == 1  # only the unconfirmed page is re-sent


async def test_patient_id_for_agents_only_in_scope(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, world: Any, ai_on: None, monkeypatch: Any
) -> None:
    install_fake(monkeypatch, fake_response(json.dumps(ai_payload())))
    agent = auth_headers(world.agent_user)
    # A report the agent uploaded on the patient's behalf without a patient link.
    doc = await add_document(db, world.agent_user, None, page_image(), agent_id=world.agent.id)
    r = await request_analysis(client, agent, [doc.id])
    assert r.status_code == 400 and r.json()["error"]["code"] == "different_patients"

    out = await analyse(client, agent, [doc.id], run_jobs, patient_id=str(world.managed.id))
    assert out["patient_id"] == str(world.managed.id) and out["status"] == "completed"
    r = await client.get(f"{API}/documents/analyses/{out['id']}", headers=auth_headers(world.managed_user))
    assert r.status_code == 200

    # Out of the agent's scope -> 404; pages of another patient -> 400.
    r = await request_analysis(client, agent, [doc.id], patient_id=str(world.patient.id))
    assert r.status_code == 404
    managed_doc = await add_document(db, world.managed_user, world.managed, page_image())
    second_user = await create_user(db, role="patient")
    second = await create_patient(db, second_user, managed_by_agent_id=world.agent.id)
    r = await request_analysis(client, agent, [managed_doc.id], patient_id=str(second.id))
    assert r.status_code == 400 and r.json()["error"]["code"] == "different_patients"

    # Patients cannot name another patient; hospitals cannot request analyses at all.
    own_doc = await add_document(db, world.patient_user, world.patient, page_image())
    r = await request_analysis(
        client, auth_headers(world.patient_user), [own_doc.id], patient_id=str(world.managed.id)
    )
    assert r.status_code == 404
    r = await request_analysis(
        client, auth_headers(world.patient_user), [own_doc.id], patient_id=str(world.patient.id)
    )
    assert r.status_code == 202
    r = await request_analysis(
        client, auth_headers(world.hospital_user), [own_doc.id], patient_id=str(world.patient.id)
    )
    assert r.status_code == 403
