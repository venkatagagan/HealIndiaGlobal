"""Discharge summaries: hospital drafts/finalize/versions, access rules, PDF (Unicode), HL7 FHIR R4 bundle,
home-doctor share links (public, audited, revocable), medication reminders and check-in due notifications."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.core.enums import (
    BookingStatus,
    CaseStatus,
    ConsentKind,
    DischargeSummaryStatus,
    DocumentKind,
)
from app.models import (
    AftercareCheckin,
    AuditLog,
    Consent,
    DischargeShare,
    DischargeSummary,
    Document,
    MedicationReminder,
    Notification,
)
from app.modules.discharge import fhir
from app.modules.discharge.pdf import DischargePdfContext, PdfMedication, render_discharge_summary
from app.modules.discharge.service import resolve_tz, share_url
from app.modules.discharge.tasks import send_checkin_due_notifications, send_medication_reminders
from tests.factories import create_booking, create_case, create_hospital, create_patient, create_user
from tests.modules.cases_helpers import World, add_hospital_member, make_document, make_world

P = "/api/v1/discharge-summaries"

FULL = {
    "diagnosis": "Severe osteoarthritis of the right knee",
    "diagnosis_code": "M17.11",
    "procedure_name": "Total knee replacement (right)",
    "procedure_code": "179344006",
    "hospital_course": "Uneventful surgery and recovery. Mobilised on day 1.",
    "medications": [
        {"name": "Paracetamol", "dose": "650 mg", "frequency": "three times a day", "duration_days": 5},
        {
            "name": "Enoxaparin",
            "dose": "40 mg",
            "frequency": "once daily",
            "duration_days": 14,
            "route": "subcutaneous",
        },
        {"name": "Vitamin D3", "dose": "1000 IU", "frequency": "once daily"},
    ],
    "follow_up_instructions": "Physiotherapy twice a week. Review with your doctor in 2 weeks.",
    "red_flag_symptoms": "Fever above 38.5 C, calf pain or swelling, wound discharge, chest pain.",
    "allergies": "Penicillin (rash)",
    "investigations_summary": "Hb 11.8 g/dL on discharge. X-ray: implant in good position.",
}


async def _setup(db: Any) -> tuple[World, Any, Any]:
    world = await make_world(db)
    case = await create_case(
        db,
        world.patient,
        world.hospital,
        status=CaseStatus.IN_TREATMENT,
        doctor_id=world.doctor.id,
        procedure_id=world.procedure.id,
    )
    booking = await create_booking(
        db, case, status=BookingStatus.ADMITTED, admission_date=date.today() - timedelta(days=6)
    )
    await db.commit()
    return world, case, booking


async def _final_summary(client: Any, auth_headers: Any, world: World, case: Any) -> dict[str, Any]:
    h = auth_headers(world.hospital_user)
    resp = await client.post(P, json={"case_id": str(case.id), **FULL}, headers=h)
    assert resp.status_code == 201, resp.text
    sid = resp.json()["id"]
    resp = await client.post(f"{P}/{sid}/finalize", headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ------------------------------------------------------------------------------------------------ hospital
async def test_prefill_create_finalize_and_versions(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any
) -> None:
    world, case, booking = await _setup(db)
    h = auth_headers(world.hospital_user)

    resp = await client.get(f"{P}/prefill", params={"case_id": str(case.id)}, headers=h)
    assert resp.status_code == 200, resp.text
    pre = resp.json()
    assert pre["booking_id"] == str(booking.id)
    assert pre["doctor_id"] == str(world.doctor.id)
    assert pre["doctor_name"] == world.doctor.full_name
    assert pre["procedure_name"] == world.procedure.name

    # patients and other hospitals cannot write
    resp = await client.post(P, json={"case_id": str(case.id)}, headers=auth_headers(world.patient_user))
    assert resp.status_code in (403, 404)

    resp = await client.post(
        P,
        json={"case_id": str(case.id), "doctor_id": str(world.doctor.id), "diagnosis": "OA knee"},
        headers=h,
    )
    assert resp.status_code == 201, resp.text
    draft = resp.json()
    assert draft["status"] == "draft" and draft["version"] == 1
    assert draft["doctor_name"] == world.doctor.full_name
    assert draft["booking_id"] == str(booking.id)
    sid = draft["id"]

    again = await client.post(P, json={"case_id": str(case.id)}, headers=h)
    assert again.status_code == 409
    assert again.json()["error"]["details"]["discharge_summary_id"] == sid

    # health text is encrypted at rest
    raw = (await db.execute(select(DischargeSummary.__table__.c.diagnosis))).scalar_one()
    assert raw.startswith("v1:") and "OA" not in raw

    # the patient does not see drafts
    resp = await client.get(f"{P}/{sid}", headers=auth_headers(world.patient_user))
    assert resp.status_code == 404
    resp = await client.get(P, headers=auth_headers(world.patient_user))
    assert resp.json() == []

    resp = await client.post(f"{P}/{sid}/finalize", headers=h)
    assert resp.status_code == 400
    assert (
        set(resp.json()["error"]["details"]) == {"discharge_date", "follow_up_instructions"}
        or "follow_up_instructions" in resp.json()["error"]["details"]
    )

    resp = await client.patch(
        f"{P}/{sid}", json={**FULL, "discharge_date": date.today().isoformat()}, headers=h
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["medications"]) == 3

    resp = await client.patch(f"{P}/{sid}", json={"discharge_date": "2000-01-01"}, headers=h)
    assert resp.status_code == 400  # before admission

    resp = await client.post(f"{P}/{sid}/finalize", headers=h)
    assert resp.status_code == 200, resp.text
    final = resp.json()
    assert final["status"] == "final" and final["finalized_at"]
    doc = await db.get(Document, __import__("uuid").UUID(final["pdf_document_id"]))
    assert doc is not None and doc.kind == DocumentKind.DISCHARGE_SUMMARY
    assert doc.patient_id == world.patient.id and doc.hospital_id == world.hospital.id

    # locked
    resp = await client.patch(f"{P}/{sid}", json={"diagnosis": "changed"}, headers=h)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "discharge_summary_final"

    # patient notified (no diagnosis in the text) and can now read it
    notes = (
        (await db.execute(select(Notification).where(Notification.user_id == world.patient_user.id)))
        .scalars()
        .all()
    )
    finalized = [n for n in notes if n.kind == "discharge_summary.finalized"]
    assert len(finalized) == 1
    assert "osteoarthritis" not in (finalized[0].title + (finalized[0].body or "")).lower()
    assert finalized[0].data["link"] == f"/discharge-summaries/{sid}"
    resp = await client.get(f"{P}/{sid}", headers=auth_headers(world.patient_user))
    assert resp.status_code == 200
    assert resp.json()["red_flag_symptoms"].startswith("Fever")

    # new version
    resp = await client.post(f"{P}/{sid}/new-version", headers=h)
    assert resp.status_code == 201, resp.text
    v2 = resp.json()
    assert v2["version"] == 2 and v2["status"] == "draft" and v2["supersedes_id"] == sid
    assert v2["diagnosis"] == FULL["diagnosis"]
    resp = await client.patch(
        f"{P}/{v2['id']}", json={"follow_up_instructions": "Review in 10 days."}, headers=h
    )
    assert resp.status_code == 200
    resp = await client.post(f"{P}/{v2['id']}/finalize", headers=h)
    assert resp.status_code == 200
    resp = await client.get(f"{P}/{sid}", headers=auth_headers(world.patient_user))
    assert resp.json()["is_latest"] is False and resp.json()["superseded_at"]
    resp = await client.get(P, params={"case_id": str(case.id)}, headers=auth_headers(world.patient_user))
    assert [i["version"] for i in resp.json()] == [2, 1]


async def test_access_rules(client: Any, db: Any, auth_headers: Any) -> None:
    world, case, _ = await _setup(db)
    final = await _final_summary(client, auth_headers, world, case)
    sid = final["id"]
    other_patient_user = await create_user(db, role="patient")
    await create_patient(db, user=other_patient_user)
    other_hospital_user = await create_user(db, role="hospital")
    await create_hospital(db, owner=other_hospital_user)
    finance = await create_user(db, role="finance")
    await db.commit()
    for user in (other_patient_user, other_hospital_user, finance, world.agent_user):
        resp = await client.get(f"{P}/{sid}", headers=auth_headers(user))
        assert resp.status_code == 404, user.role
    member = await add_hospital_member(db, world.hospital, "finance")
    resp = await client.get(f"{P}/{sid}", headers=auth_headers(member))
    assert resp.status_code == 200
    resp = await client.post(f"{P}/{sid}/new-version", headers=auth_headers(member))
    assert resp.status_code == 403  # finance members are read-only
    # hospital reads are PHI access
    rows = (
        await db.execute(
            select(AuditLog).where(AuditLog.action == "phi.view", AuditLog.actor_user_id == member.id)
        )
    ).scalars()
    assert list(rows)


# ------------------------------------------------------------------------------------------------ exports
async def test_pdf_and_fhir_export(client: Any, db: Any, auth_headers: Any) -> None:
    world, case, _ = await _setup(db)
    final = await _final_summary(client, auth_headers, world, case)
    h = auth_headers(world.patient_user)
    resp = await client.get(f"{P}/{final['id']}/pdf", headers=h)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")

    resp = await client.get(f"{P}/{final['id']}/fhir", headers=h)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/fhir+json")
    bundle = resp.json()
    assert fhir.validate_bundle(bundle) == []
    assert bundle["resourceType"] == "Bundle" and bundle["type"] == "document"
    resources = [e["resource"] for e in bundle["entry"]]
    types = [r["resourceType"] for r in resources]
    assert types[0] == "Composition"
    for needed in (
        "Patient",
        "Practitioner",
        "Organization",
        "Encounter",
        "Condition",
        "Procedure",
        "AllergyIntolerance",
    ):
        assert needed in types, needed
    assert types.count("MedicationStatement") == 3
    comp = resources[0]
    assert comp["type"]["coding"][0] == {
        "system": "http://loinc.org",
        "code": "18842-5",
        "display": "Discharge summary",
    }
    assert comp["status"] == "final"
    assert comp["attester"][0]["mode"] == "legal"
    urls = {e["fullUrl"] for e in bundle["entry"]}
    for e in bundle["entry"]:
        assert e["fullUrl"] == f"urn:uuid:{e['resource']['id']}"
        for ref in fhir.collect_references(e["resource"]):
            assert ref in urls
    condition = next(r for r in resources if r["resourceType"] == "Condition")
    assert condition["code"]["coding"][0] == {"system": "http://hl7.org/fhir/sid/icd-10", "code": "M17.11"}
    meds = [r for r in resources if r["resourceType"] == "MedicationStatement"]
    assert {m["medicationCodeableConcept"]["text"] for m in meds} == {
        "Paracetamol",
        "Enoxaparin",
        "Vitamin D3",
    }
    enox = next(m for m in meds if m["medicationCodeableConcept"]["text"] == "Enoxaparin")
    assert enox["dosage"][0]["route"] == {"text": "subcutaneous"}
    assert "end" in enox["effectivePeriod"]
    patient = next(r for r in resources if r["resourceType"] == "Patient")
    assert patient["gender"] == "female" and patient["birthDate"] == "1980-05-17"
    # stable ids for the same version
    again = (await client.get(f"{P}/{final['id']}/fhir", headers=h)).json()
    assert [e["fullUrl"] for e in again["entry"]] == [e["fullUrl"] for e in bundle["entry"]]


def test_validate_bundle_detects_broken_references() -> None:
    broken = {
        "resourceType": "Bundle",
        "type": "document",
        "identifier": {"value": "x"},
        "timestamp": "2026-01-01T00:00:00Z",
        "entry": [
            {
                "fullUrl": "urn:uuid:1",
                "resource": {
                    "resourceType": "Composition",
                    "status": "final",
                    "type": {},
                    "date": "2026",
                    "author": [{"reference": "urn:uuid:missing"}],
                    "title": "t",
                },
            }
        ],
    }
    problems = fhir.validate_bundle(broken)
    assert any("does not resolve" in p for p in problems)
    assert any("type is required" in p for p in problems)


def test_pdf_renders_unicode_names() -> None:
    ctx = DischargePdfContext(
        reference="HIG-C-1/DS",
        version=1,
        issued_on=date(2026, 11, 18),
        finalized_at=datetime(2026, 11, 18, 10, 0, tzinfo=UTC),
        hospital_name="Apex Hospital",
        hospital_legal_name=None,
        hospital_address_lines=["1 Hospital Road", "New Delhi"],
        hospital_phone=None,
        hospital_email=None,
        hospital_website=None,
        patient_name="محمد علي / রহিম উদ্দিন / Иван Петров / Zoë Łukasz",
        patient_dob=None,
        patient_sex=None,
        nationality=None,
        case_number="HIG-C-1",
        booking_number=None,
        doctor_name="Dr. A. Sharma",
        doctor_registration="DMC-1234",
        admission_date=None,
        discharge_date=date(2026, 11, 18),
        diagnosis="Diagnosis text " * 40,
        diagnosis_code="I25.10",
        procedure_name=None,
        procedure_code=None,
        procedure_date=None,
        hospital_course=None,
        follow_up_instructions="Review",
        red_flag_symptoms=None,
        allergies=None,
        investigations_summary=None,
        medications=[PdfMedication(name=f"Medicine {i}", dose="10 mg", frequency="daily") for i in range(30)],
    )
    data = render_discharge_summary(ctx)
    assert data.startswith(b"%PDF")
    assert b"NotoSansArabic" in data or b"NotoArabic" in data


# ------------------------------------------------------------------------------------------------ shares
async def test_share_with_home_doctor(
    client: Any,
    db: Any,
    auth_headers: Any,
    run_jobs: Any,
    email_outbox: list[dict[str, Any]],
    storage_dir: Any,
) -> None:
    world, case, _ = await _setup(db)
    final = await _final_summary(client, auth_headers, world, case)
    sid = final["id"]
    h = auth_headers(world.patient_user)
    own_doc = await make_document(db, world.patient_user, kind="lab_result", patient_id=world.patient.id)
    stranger = await create_user(db, role="patient")
    foreign_doc = await make_document(db, stranger, kind="lab_result")

    body = {"doctor_email": "dr.home@clinic.example.test", "doctor_name": "Dr. Home", "consent": False}
    resp = await client.post(f"{P}/{sid}/shares", json=body, headers=h)
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "consent_required"
    resp = await client.post(
        f"{P}/{sid}/shares", json={**body, "consent": True, "document_ids": [str(foreign_doc.id)]}, headers=h
    )
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "invalid_documents"
    # hospitals cannot share on the patient's behalf
    resp = await client.post(
        f"{P}/{sid}/shares", json={**body, "consent": True}, headers=auth_headers(world.hospital_user)
    )
    assert resp.status_code == 403

    resp = await client.post(
        f"{P}/{sid}/shares", json={**body, "consent": True, "document_ids": [str(own_doc.id)]}, headers=h
    )
    assert resp.status_code == 201, resp.text
    share = resp.json()
    assert share["active"] is True and share["doctor_email_masked"] == "dr***@clinic.example.test"
    assert share["url"].startswith(share_url("x").rsplit("/", 1)[0])
    token = share["url"].rsplit("/", 1)[1]
    expires = datetime.fromisoformat(share["expires_at"])
    assert timedelta(days=13, hours=23) < expires - datetime.now(UTC) <= timedelta(days=14)
    assert str(own_doc.id) in share["document_ids"] and final["pdf_document_id"] in share["document_ids"]
    stored = (await db.execute(select(DischargeShare))).scalar_one()
    assert stored.token_hash != token and len(stored.token_hash) == 64
    consent = (
        await db.execute(select(Consent).where(Consent.kind == ConsentKind.SHARE_WITH_HOME_DOCTOR))
    ).scalar_one()
    assert consent.granted and consent.case_id == case.id

    await run_jobs()
    mail = [m for m in email_outbox if m["to"] == ["dr.home@clinic.example.test"]]
    assert len(mail) == 1 and token in mail[0]["html"]

    pub = f"/api/v1/public/discharge-shares/{token}"
    resp = await client.get(pub)
    assert resp.status_code == 200, resp.text
    assert "noindex" in resp.headers["x-robots-tag"]
    assert resp.headers["cache-control"] == "private, no-store"
    view = resp.json()
    assert view["summary"]["diagnosis"] == FULL["diagnosis"]
    assert {d["id"] for d in view["documents"]} == set(share["document_ids"])
    audit = (await db.execute(select(AuditLog).where(AuditLog.actor_role == "home_doctor"))).scalars().all()
    assert [a.action for a in audit] == ["phi.view"]
    assert audit[0].after["patient_id"] == str(world.patient.id)

    resp = await client.get(f"{pub}/fhir")
    assert resp.status_code == 200 and fhir.validate_bundle(resp.json()) == []
    resp = await client.get(f"{pub}/pdf")
    assert resp.status_code == 200 and resp.content.startswith(b"%PDF")
    resp = await client.get(f"{pub}/documents/{foreign_doc.id}")
    assert resp.status_code == 404
    resp = await client.get("/api/v1/public/discharge-shares/not-a-real-token")
    assert resp.status_code == 404

    resp = await client.get(f"{P}/{sid}/shares", headers=h)
    assert resp.json()[0]["view_count"] == 1
    resp = await client.delete(f"{P}/{sid}/shares/{share['id']}", headers=h)
    assert resp.status_code == 200 and resp.json()["active"] is False
    assert (await client.get(pub)).status_code == 404

    # expired links stop working
    resp = await client.post(
        f"{P}/{sid}/shares", json={**body, "consent": True, "expires_in_days": 1}, headers=h
    )
    token2 = resp.json()["url"].rsplit("/", 1)[1]
    row = await db.get(DischargeShare, __import__("uuid").UUID(resp.json()["id"]))
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)  # type: ignore[union-attr]
    await db.commit()
    assert (await client.get(f"/api/v1/public/discharge-shares/{token2}")).status_code == 404
    resp = await client.post(
        f"{P}/{sid}/shares", json={**body, "consent": True, "expires_in_days": 90}, headers=h
    )
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "share_too_long"


# ------------------------------------------------------------------------------------------------ reminders
async def test_medication_reminders(client: Any, db: Any, auth_headers: Any) -> None:
    world, case, _ = await _setup(db)
    final = await _final_summary(client, auth_headers, world, case)
    sid = final["id"]
    h = auth_headers(world.patient_user)
    resp = await client.get(f"{P}/{sid}/medication-reminders", headers=h)
    reminders = resp.json()
    assert [r["name"] for r in reminders] == ["Paracetamol", "Enoxaparin", "Vitamin D3"]
    assert all(r["enabled"] is False for r in reminders)
    assert reminders[2]["end_on"] is None  # ongoing

    now = datetime.now(UTC)
    assert await send_medication_reminders(db, now) == 0  # not opted in

    resp = await client.put(
        f"{P}/{sid}/medication-reminders",
        json={"enabled": True, "remind_hour": 0, "timezone": "Mars/Base"},
        headers=h,
    )
    assert resp.status_code == 200  # unknown zones fall back to UTC
    resp = await client.put(
        f"{P}/{sid}/medication-reminders",
        json={"enabled": True, "remind_hour": 0, "timezone": "+00:00"},
        headers=h,
    )
    assert resp.status_code == 200 and all(r["enabled"] for r in resp.json())
    resp = await client.put(
        f"{P}/{sid}/medication-reminders", json={"enabled": True, "timezone": "bad zone!"}, headers=h
    )
    assert resp.status_code == 422
    consent = (
        (await db.execute(select(Consent.granted).where(Consent.kind == ConsentKind.MEDICATION_REMINDERS)))
        .scalars()
        .all()
    )
    assert consent and all(consent)

    assert await send_medication_reminders(db, now) == 1
    assert await send_medication_reminders(db, now) == 0  # once a day
    note = (
        await db.execute(select(Notification).where(Notification.kind == "aftercare.medication_reminder"))
    ).scalar_one()
    assert "Paracetamol" in (note.body or "")
    # tomorrow it is sent again; after the course ends a medicine drops out
    later = now + timedelta(days=8)
    assert await send_medication_reminders(db, later) == 1
    rows = (
        (await db.execute(select(MedicationReminder).order_by(MedicationReminder.position))).scalars().all()
    )
    assert [r.last_sent_on is not None for r in rows] == [True, True, True]
    assert rows[0].last_sent_on < rows[1].last_sent_on  # type: ignore[operator]

    # a new version keeps the opt-in and the old reminders stop
    hh = auth_headers(world.hospital_user)
    v2 = (await client.post(f"{P}/{sid}/new-version", headers=hh)).json()
    await client.post(f"{P}/{v2['id']}/finalize", headers=hh)
    new = (await client.get(f"{P}/{v2['id']}/medication-reminders", headers=h)).json()
    assert all(r["enabled"] for r in new)
    old = (await client.get(f"{P}/{sid}/medication-reminders", headers=h)).json()
    assert not any(r["enabled"] for r in old)


def test_resolve_tz() -> None:
    assert resolve_tz("UTC") == UTC
    assert resolve_tz("+05:30").utcoffset(None) == timedelta(hours=5, minutes=30)  # type: ignore[arg-type]
    assert resolve_tz("-01:00").utcoffset(None) == timedelta(hours=-1)  # type: ignore[arg-type]


async def test_checkin_due_notifications(db: Any) -> None:
    world, case, _ = await _setup(db)
    now = datetime.now(UTC)
    db.add(
        AftercareCheckin(case_id=case.id, patient_id=world.patient.id, day=3, due_at=now - timedelta(hours=1))
    )
    db.add(
        AftercareCheckin(case_id=case.id, patient_id=world.patient.id, day=7, due_at=now + timedelta(days=3))
    )
    db.add(
        AftercareCheckin(case_id=case.id, patient_id=world.patient.id, day=1, due_at=now - timedelta(days=3))
    )
    await db.commit()
    assert await send_checkin_due_notifications(db, now) == 1
    assert await send_checkin_due_notifications(db, now) == 0
    note = (
        await db.execute(select(Notification).where(Notification.kind == "aftercare.checkin_due"))
    ).scalar_one()
    assert note.user_id == world.patient_user.id and note.data["link"] == "/aftercare"


async def test_discard_draft(client: Any, db: Any, auth_headers: Any) -> None:
    world, case, _ = await _setup(db)
    h = auth_headers(world.hospital_user)
    sid = (await client.post(P, json={"case_id": str(case.id)}, headers=h)).json()["id"]
    assert (await client.delete(f"{P}/{sid}", headers=h)).status_code == 204
    assert (await db.execute(select(DischargeSummary))).first() is None
    final = await _final_summary(client, auth_headers, world, case)
    assert (await client.delete(f"{P}/{final['id']}", headers=h)).status_code == 409
    assert final["status"] == DischargeSummaryStatus.FINAL.value
