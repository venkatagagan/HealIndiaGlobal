"""Documents module tests (PLAN 8.3 / 9.5): validated uploads, authorized downloads, access policy incl. IDOR
negatives, soft delete and verification."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from sqlalchemy import select

from app.core.config import settings
from app.models import AuditLog, Document
from app.modules.documents import service as documents_service
from tests.factories import create_agent, create_case, create_hospital, create_patient
from tests.modules.auth_helpers import API, dicom_bytes, pdf_bytes, png_bytes, upload

RANDOM_ID = "0190f000-0000-7000-8000-000000000000"


@dataclass
class World:
    patient_a: dict[str, str]
    patient_b: dict[str, str]
    agent_a: dict[str, str]
    agent_b: dict[str, str]
    hospital_1: dict[str, str]
    hospital_2: dict[str, str]
    support: dict[str, str]
    admin: dict[str, str]
    profile_a_id: str
    case_a_id: str
    hospital_1_id: str
    hospital_2_id: str
    agent_a_id: str
    agent_b_id: str


async def _world(db, make_user, auth_headers) -> World:
    agent_a_user = await make_user(role="agent")
    agent_a = await create_agent(db, user=agent_a_user)
    agent_b_user = await make_user(role="agent")
    agent_b = await create_agent(db, user=agent_b_user)
    patient_a_user = await make_user(role="patient", full_name="Amara Okafor")
    profile_a = await create_patient(db, user=patient_a_user, managed_by_agent_id=agent_a.id)
    patient_b_user = await make_user(role="patient")
    await create_patient(db, user=patient_b_user)
    hospital_1_user = await make_user(role="hospital")
    hospital_1 = await create_hospital(db, owner=hospital_1_user)
    hospital_2_user = await make_user(role="hospital")
    hospital_2 = await create_hospital(db, owner=hospital_2_user)
    case_a = await create_case(db, profile_a, hospital_1)
    support = await make_user(role="support")
    admin = await make_user(role="admin")
    return World(
        patient_a=auth_headers(patient_a_user),
        patient_b=auth_headers(patient_b_user),
        agent_a=auth_headers(agent_a_user),
        agent_b=auth_headers(agent_b_user),
        hospital_1=auth_headers(hospital_1_user),
        hospital_2=auth_headers(hospital_2_user),
        support=auth_headers(support),
        admin=auth_headers(admin),
        profile_a_id=str(profile_a.id),
        case_a_id=str(case_a.id),
        hospital_1_id=str(hospital_1.id),
        hospital_2_id=str(hospital_2.id),
        agent_a_id=str(agent_a.id),
        agent_b_id=str(agent_b.id),
    )


async def _ok(r: Any, status: int = 201) -> dict[str, Any]:
    assert r.status_code == status, r.text
    return r.json()


# --------------------------------------------------------------------------------------------- uploads
async def test_upload_and_download_pdf(client, db, make_user, auth_headers, storage_dir, monkeypatch) -> None:
    published: list[tuple[str, dict[str, Any]]] = []
    original = documents_service.publish

    async def recording(session, name, payload=None):
        published.append((name, dict(payload or {})))
        return await original(session, name, payload)

    monkeypatch.setattr(documents_service, "publish", recording)
    user = await make_user(role="patient", full_name="Jane Doe")
    profile = await create_patient(db, user=user)
    headers = auth_headers(user)
    content = pdf_bytes("MRI right knee")

    doc = await _ok(await upload(client, headers, content=content, file_name="mri-report.pdf"))
    assert doc["kind"] == "medical_report" and doc["status"] == "uploaded"
    assert doc["content_type"] == "application/pdf" and doc["size_bytes"] == len(content)
    assert doc["file_name"] == "mri-report.pdf" and doc["uploaded_by_name"] == "Jane Doe"
    assert doc["patient_id"] == str(profile.id) and doc["case_id"] is None
    assert (
        published == [("document.uploaded", published[0][1])] and published[0][1]["document_id"] == doc["id"]
    )

    row = await db.get(Document, doc["id"])
    assert row is not None and row.sha256 == hashlib.sha256(content).hexdigest()
    assert row.storage_key.startswith("documents/") and row.storage_key.endswith(".pdf")
    assert "mri" not in row.storage_key
    assert (storage_dir / row.storage_key).read_bytes() == content

    r = await client.get(f"{API}/documents/{doc['id']}/download", headers=headers)
    assert r.status_code == 200, r.text
    assert r.content == content
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.headers["content-disposition"].startswith('attachment; filename="mri-report.pdf"')
    assert r.headers["cache-control"] == "private, no-store"
    assert r.headers["x-content-type-options"] == "nosniff"

    assert (await client.get(f"{API}/documents/{doc['id']}", headers=headers)).json()["id"] == doc["id"]
    assert (await client.get(f"{API}/documents/{doc['id']}/download")).status_code == 401


async def test_upload_type_detection_and_names(client, db, make_user, auth_headers) -> None:
    user = await make_user(role="patient")
    await create_patient(db, user=user)
    headers = auth_headers(user)

    # The real type wins over the declared name/content type.
    doc = await _ok(await upload(client, headers, kind="imaging", content=png_bytes(), file_name="scan.pdf"))
    assert doc["content_type"] == "image/png" and doc["file_name"] == "scan.pdf.png"
    doc = await _ok(await upload(client, headers, kind="imaging", content=dicom_bytes(), file_name="ct.dcm"))
    assert doc["content_type"] == "application/dicom" and doc["file_name"] == "ct.dcm"
    doc = await _ok(await upload(client, headers, file_name="../../etc/passwd.pdf"))
    assert doc["file_name"] == "passwd.pdf"
    doc = await _ok(await upload(client, headers, file_name="Résumé médical<>|*.pdf"))
    assert doc["file_name"] == "Résumé médical.pdf"
    r = await client.get(f"{API}/documents/{doc['id']}/download", headers=headers)
    disposition = r.headers["content-disposition"]
    assert 'filename="Resume medical.pdf"' in disposition
    assert f"filename*=UTF-8''{quote('Résumé médical.pdf', safe='')}" in disposition

    bad_inputs = [
        (b"MZ\x90\x00\x03" + b"\x00" * 200, "evil.pdf", 400, "unsupported_file_type"),
        (b"<html><script>alert(1)</script></html>", "x.pdf", 400, "unsupported_file_type"),
        (b"PK\x03\x04" + b"\x00" * 100, "doc.docx", 400, "unsupported_file_type"),
        (b"", "empty.pdf", 400, "empty_file"),
    ]
    for content, name, status, code in bad_inputs:
        r = await upload(client, headers, content=content, file_name=name)
        assert r.status_code == status, (name, r.text)
        assert r.json()["error"]["code"] == code
    r = await upload(client, headers, kind="selfie")
    assert r.status_code == 422
    assert (await db.execute(select(Document))).scalars().all().__len__() == 4


async def test_upload_size_limit(client, db, make_user, auth_headers, monkeypatch) -> None:
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)
    user = await make_user(role="patient")
    await create_patient(db, user=user)
    headers = auth_headers(user)
    limit = settings.max_upload_bytes
    big = pdf_bytes() + b"0" * (limit + 10)
    r = await upload(client, headers, content=big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"
    just_fits = pdf_bytes()
    just_fits += b"0" * (limit - len(just_fits))
    await _ok(await upload(client, headers, content=just_fits))


# --------------------------------------------------------------------------------------------- access policy
async def test_access_policy_and_idor(client, db, make_user, auth_headers) -> None:
    w = await _world(db, make_user, auth_headers)

    case_doc = await _ok(await upload(client, w.patient_a, case_id=w.case_a_id, file_name="mri.pdf"))
    assert case_doc["case_id"] == w.case_a_id and case_doc["patient_id"] == w.profile_a_id
    passport = await _ok(await upload(client, w.patient_a, kind="passport", file_name="passport.pdf"))
    kyc_h2 = await _ok(
        await upload(client, w.hospital_2, kind="kyc_registration", hospital_id=w.hospital_2_id)
    )
    assert kyc_h2["hospital_id"] == w.hospital_2_id
    kyc_h2_default = await _ok(await upload(client, w.hospital_2, kind="kyc_pan"))
    assert kyc_h2_default["hospital_id"] == w.hospital_2_id
    kyc_agent_b = await _ok(await upload(client, w.agent_b, kind="kyc_id_proof"))
    assert kyc_agent_b["agent_id"] == w.agent_b_id and kyc_agent_b["patient_id"] is None
    by_agent = await _ok(await upload(client, w.agent_a, kind="lab_result", patient_id=w.profile_a_id))
    assert by_agent["patient_id"] == w.profile_a_id and by_agent["agent_id"] is None

    # CG-14: the managing agent sees the patient's own documents only with the patient's consent.
    agent_before = {d["id"] for d in (await client.get(f"{API}/documents", headers=w.agent_a)).json()}
    assert agent_before == {by_agent["id"]}
    r = await client.post(
        f"{API}/auth/consents",
        json={"kind": "share_with_agent", "version": "1", "granted": True},
        headers=w.patient_a,
    )
    assert r.status_code == 201, r.text

    visibility = {
        "patient_a": (w.patient_a, {case_doc["id"], passport["id"], by_agent["id"]}),
        "agent_a": (w.agent_a, {case_doc["id"], passport["id"], by_agent["id"]}),
        # SEC-002: the case hospital sees the case's documents only, not the patient's other documents.
        "hospital_1": (w.hospital_1, {case_doc["id"]}),
        "hospital_2": (w.hospital_2, {kyc_h2["id"], kyc_h2_default["id"]}),
        "agent_b": (w.agent_b, {kyc_agent_b["id"]}),
        "patient_b": (w.patient_b, set()),
    }
    all_ids = {d["id"] for d in (case_doc, passport, kyc_h2, kyc_h2_default, kyc_agent_b, by_agent)}
    for label, (headers, expected) in visibility.items():
        listed = {d["id"] for d in (await client.get(f"{API}/documents", headers=headers)).json()}
        assert listed == expected, label
        for doc_id in all_ids:
            for suffix in ("", "/download"):
                r = await client.get(f"{API}/documents/{doc_id}{suffix}", headers=headers)
                assert r.status_code == (200 if doc_id in expected else 404), (label, doc_id, suffix, r.text)
    staff_listed = {d["id"] for d in (await client.get(f"{API}/documents", headers=w.admin)).json()}
    assert staff_listed == all_ids
    assert (await client.get(f"{API}/documents/{RANDOM_ID}", headers=w.admin)).status_code == 404
    # least privilege: support sees partner KYC documents but not patients' documents outside their cases
    support_listed = {d["id"] for d in (await client.get(f"{API}/documents", headers=w.support)).json()}
    assert support_listed == {kyc_h2["id"], kyc_h2_default["id"], kyc_agent_b["id"]}

    # List filters.
    r = await client.get(f"{API}/documents", params={"case_id": w.case_a_id}, headers=w.patient_a)
    assert [d["id"] for d in r.json()] == [case_doc["id"]]
    r = await client.get(f"{API}/documents", params={"kind": "passport"}, headers=w.patient_a)
    assert [d["id"] for d in r.json()] == [passport["id"]]
    r = await client.get(f"{API}/documents", params={"kind": "passport"}, headers=w.hospital_1)
    assert r.json() == []

    # Uploading against resources outside one's scope is a 404 (no existence oracle).
    for headers, form in (
        (w.patient_b, {"case_id": w.case_a_id}),
        (w.hospital_2, {"case_id": w.case_a_id}),
        (w.agent_b, {"case_id": w.case_a_id}),
        (w.patient_b, {"patient_id": w.profile_a_id}),
        (w.agent_b, {"patient_id": w.profile_a_id}),
        (w.hospital_2, {"patient_id": w.profile_a_id}),
        (w.hospital_2, {"hospital_id": w.hospital_1_id}),
        (w.patient_a, {"hospital_id": w.hospital_1_id}),
        (w.patient_a, {"case_id": RANDOM_ID}),
    ):
        r = await upload(client, headers, **form)
        assert r.status_code == 404, (form, r.text)
    r = await upload(client, w.patient_a, case_id=w.case_a_id, hospital_id=w.hospital_2_id)
    assert r.status_code == 400 and r.json()["error"]["code"] == "hospital_mismatch"
    # The case hospital may attach documents to its case (e.g. an invitation letter).
    letter = await _ok(
        await upload(
            client, w.hospital_1, kind="invitation_letter", case_id=w.case_a_id, file_name="letter.pdf"
        )
    )
    assert letter["patient_id"] == w.profile_a_id
    r = await client.get(f"{API}/documents/{letter['id']}", headers=w.patient_a)
    assert r.status_code == 200


async def test_delete_is_owner_only_and_soft(client, db, make_user, auth_headers, storage_dir) -> None:
    w = await _world(db, make_user, auth_headers)
    doc = await _ok(await upload(client, w.patient_a, case_id=w.case_a_id))

    assert (await client.delete(f"{API}/documents/{doc['id']}", headers=w.patient_b)).status_code == 404
    assert (await client.delete(f"{API}/documents/{doc['id']}", headers=w.hospital_2)).status_code == 404
    r = await client.delete(f"{API}/documents/{doc['id']}", headers=w.hospital_1)
    assert r.status_code == 403
    assert (await client.delete(f"{API}/documents/{doc['id']}", headers=w.patient_a)).status_code == 204

    for headers in (w.patient_a, w.hospital_1, w.admin):
        assert (await client.get(f"{API}/documents/{doc['id']}", headers=headers)).status_code == 404
        assert doc["id"] not in str((await client.get(f"{API}/documents", headers=headers)).json())
    row = await db.get(Document, doc["id"])
    assert row is not None and row.deleted_at is not None
    assert (storage_dir / row.storage_key).exists()  # soft delete keeps the object for audit
    assert (await db.execute(select(AuditLog).where(AuditLog.action == "document.delete"))).scalars().first()


async def test_verify_permissions(client, db, make_user, auth_headers) -> None:
    w = await _world(db, make_user, auth_headers)
    case_doc = await _ok(await upload(client, w.patient_a, case_id=w.case_a_id))
    kyc = await _ok(await upload(client, w.hospital_2, kind="kyc_registration"))
    url = f"{API}/documents/{case_doc['id']}/verify"
    # the agent can see the document (patient consent, CG-14) but still cannot verify it
    r = await client.post(
        f"{API}/auth/consents",
        json={"kind": "share_with_agent", "version": "1", "granted": True},
        headers=w.patient_a,
    )
    assert r.status_code == 201, r.text

    assert (await client.post(url, json={"status": "verified"}, headers=w.hospital_2)).status_code == 404
    assert (await client.post(url, json={"status": "verified"}, headers=w.patient_b)).status_code == 404
    assert (await client.post(url, json={"status": "verified"}, headers=w.patient_a)).status_code == 403
    assert (await client.post(url, json={"status": "verified"}, headers=w.agent_a)).status_code == 403
    assert (await client.post(url, json={"status": "approved"}, headers=w.hospital_1)).status_code == 422

    r = await client.post(url, json={"status": "verified", "note": "Readable"}, headers=w.hospital_1)
    verified = await _ok(r, 200)
    assert verified["status"] == "verified" and verified["verified_at"]

    # A hospital cannot verify its own KYC; staff can.
    kyc_url = f"{API}/documents/{kyc['id']}/verify"
    assert (await client.post(kyc_url, json={"status": "verified"}, headers=w.hospital_2)).status_code == 403
    rejected = await _ok(
        await client.post(kyc_url, json={"status": "rejected", "note": "Blurry"}, headers=w.support), 200
    )
    assert rejected["status"] == "rejected"

    audits = (
        (
            await db.execute(
                select(AuditLog).where(AuditLog.action == "document.verify").order_by(AuditLog.created_at)
            )
        )
        .scalars()
        .all()
    )
    assert len(audits) == 2 and audits[1].after == {"status": "rejected", "note": "Blurry"}


async def test_hospital_sees_only_its_case_documents_sec002(client, db, make_user, auth_headers) -> None:
    """One patient with cases at two hospitals: each hospital sees only documents of its own case."""
    patient_user = await make_user(role="patient")
    profile = await create_patient(db, user=patient_user)
    h1_user = await make_user(role="hospital")
    h1 = await create_hospital(db, owner=h1_user)
    h2_user = await make_user(role="hospital")
    h2 = await create_hospital(db, owner=h2_user)
    case_1 = await create_case(db, profile, h1)
    case_2 = await create_case(db, profile, h2)
    patient_h = auth_headers(patient_user)
    doc_1 = await _ok(await upload(client, patient_h, case_id=str(case_1.id), file_name="c1.pdf"))
    doc_2 = await _ok(await upload(client, patient_h, case_id=str(case_2.id), file_name="c2.pdf"))
    own = await _ok(await upload(client, patient_h, kind="passport", file_name="passport.pdf"))
    for hospital_headers, mine in ((auth_headers(h1_user), doc_1), (auth_headers(h2_user), doc_2)):
        listed = await client.get(
            f"{API}/documents", params={"patient_id": str(profile.id)}, headers=hospital_headers
        )
        assert {d["id"] for d in listed.json()} == {mine["id"]}
        for other in (doc_1, doc_2, own):
            if other["id"] == mine["id"]:
                continue
            for suffix in ("", "/download"):
                r = await client.get(f"{API}/documents/{other['id']}{suffix}", headers=hospital_headers)
                assert r.status_code == 404
    # A hospital cannot attach patient-level documents outside a case.
    r = await upload(client, auth_headers(h1_user), kind="lab_result", patient_id=str(profile.id))
    assert r.status_code == 404
