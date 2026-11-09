"""Least privilege on documents, consent-withdrawal enforcement, PHI read audit ("who viewed my records"),
staff session limits and field encryption with key rotation."""

from __future__ import annotations

import base64
import os
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, text

from app.core import crypto
from app.core.config import settings
from app.core.deps import _last_touch
from app.models import AuditLog, Document, PatientProfile, RefreshToken
from app.models.docai import AnalysisReviewStatus, DocumentAnalysis
from tests.factories import create_agent, create_case, create_hospital, create_patient
from tests.modules.auth_helpers import API, PASSWORD, XHR, bearer, upload

STAFF = "/auth/staff"


async def _ok(r, code: int = 200) -> Any:
    assert r.status_code == code, r.text
    return r.json() if r.content else None


async def _ids(client, headers) -> set[str]:
    r = await client.get(f"{API}/documents", headers=headers)
    assert r.status_code == 200, r.text
    return {d["id"] for d in r.json()}


async def _consent(client, headers, kind: str, granted: bool, **scope: Any) -> None:
    body = {"kind": kind, "version": "1", "granted": granted, **{k: str(v) for k, v in scope.items()}}
    await _ok(await client.post(f"{API}/auth/consents", json=body, headers=headers), 201)


# ----------------------------------------------------------------------------------------- least privilege
async def test_staff_document_scopes_and_break_glass(client, db, make_user, auth_headers) -> None:
    patient_user = await make_user(role="patient")
    profile = await create_patient(db, user=patient_user)
    hospital_user = await make_user(role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    support = await make_user(role="support", full_name="Sam Support")
    other_support = await make_user(role="support")
    finance = await make_user(role="finance")
    admin = await make_user(role="admin")
    assigned = await create_case(db, profile, hospital, coordinator_user_id=support.id)
    other_case = await create_case(db, profile, hospital)
    await db.commit()
    p = auth_headers(patient_user)
    report = await _ok(await upload(client, p, case_id=assigned.id), 201)
    other_report = await _ok(await upload(client, p, case_id=other_case.id), 201)
    invoice = await _ok(await upload(client, p, kind="invoice"), 201)
    receipt = await _ok(await upload(client, p, kind="payment_proof"), 201)
    kyc = await _ok(await upload(client, auth_headers(hospital_user), kind="kyc_registration"), 201)

    assert await _ids(client, auth_headers(finance)) == {invoice["id"], receipt["id"]}
    assert await _ids(client, auth_headers(support)) == {report["id"], kyc["id"]}
    assert await _ids(client, auth_headers(other_support)) == {kyc["id"]}
    assert await _ids(client, auth_headers(admin)) == {
        report["id"],
        other_report["id"],
        invoice["id"],
        receipt["id"],
        kyc["id"],
    }
    r = await client.get(f"{API}/documents/{report['id']}/download", headers=auth_headers(finance))
    assert r.status_code == 404

    # break-glass: support may open a document outside their cases with a stated reason (audited)
    url = f"{API}/documents/{other_report['id']}"
    assert (await client.get(url, headers=auth_headers(support))).status_code == 404
    r = await client.get(url, headers={**auth_headers(support), "X-Break-Glass-Reason": "short"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "break_glass_reason_required"
    reason = "Patient called in distress, coordinator unavailable"
    r = await client.get(f"{url}/download", headers={**auth_headers(support), "X-Break-Glass-Reason": reason})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    entry = (await db.execute(select(AuditLog).where(AuditLog.action == "phi.break_glass"))).scalar_one()
    assert entry.after == {"patient_id": str(profile.id), "reason": reason}
    # finance has no break-glass
    r = await client.get(url, headers={**auth_headers(finance), "X-Break-Glass-Reason": reason})
    assert r.status_code == 404
    log = await _ok(await client.get(f"{API}/privacy/access-log", headers=p))
    assert any(e["action"] == "phi.break_glass" and e["viewer_name"] == "Sam Support" for e in log)


async def test_agent_needs_patient_consent(client, db, make_user, auth_headers) -> None:
    agent_user = await make_user(role="agent")
    agent = await create_agent(db, user=agent_user)
    patient_user = await make_user(role="patient")
    profile = await create_patient(db, user=patient_user, referred_by_agent_id=agent.id)
    await db.commit()
    p, a = auth_headers(patient_user), auth_headers(agent_user)
    own = await _ok(await upload(client, p), 201)
    by_agent = await _ok(await upload(client, a, patient_id=profile.id), 201)

    assert await _ids(client, a) == {by_agent["id"]}  # the agent's own upload only
    assert (await client.get(f"{API}/documents/{own['id']}", headers=a)).status_code == 404
    await _consent(client, p, "share_with_agent", True)
    assert await _ids(client, a) == {own["id"], by_agent["id"]}
    await _consent(client, p, "share_with_agent", False)
    assert await _ids(client, a) == {by_agent["id"]}

    # an agent cannot grant the consent for the patient
    r = await client.post(
        f"{API}/auth/consents", json={"kind": "share_with_agent", "version": "1", "granted": True}, headers=a
    )
    assert r.status_code == 400


async def test_hospital_loses_access_when_sharing_is_withdrawn(client, db, make_user, auth_headers) -> None:
    patient_user = await make_user(role="patient")
    profile = await create_patient(db, user=patient_user)
    hospital_user = await make_user(role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    other_hospital_user = await make_user(role="hospital")
    other_hospital = await create_hospital(db, owner=other_hospital_user)
    case = await create_case(db, profile, hospital)
    other_case = await create_case(db, profile, other_hospital)
    await db.commit()
    p, h, h2 = auth_headers(patient_user), auth_headers(hospital_user), auth_headers(other_hospital_user)
    doc = await _ok(await upload(client, p, case_id=case.id), 201)
    doc2 = await _ok(await upload(client, p, case_id=other_case.id), 201)
    letter = await _ok(await upload(client, h, kind="invitation_letter", case_id=case.id), 201)
    analysis = DocumentAnalysis(
        document_ids=[doc["id"]],
        primary_document_id=doc["id"],
        patient_id=profile.id,
        case_id=case.id,
        review_status=AnalysisReviewStatus.CONFIRMED,
        summary_clinical="Mild osteoarthritis",
    )
    db.add(analysis)
    await db.commit()
    assert await _ids(client, h) == {doc["id"], letter["id"]}
    assert (await client.get(f"{API}/documents/analyses/{analysis.id}", headers=h)).status_code == 200

    # withdrawing sharing with this hospital (hospital-scoped) cuts its access to the patient's documents
    await _consent(client, p, "share_with_hospitals", False, hospital_id=hospital.id)
    assert await _ids(client, h) == {
        letter["id"]
    }  # what the hospital uploaded itself stays with the uploader
    assert (await client.get(f"{API}/documents/{doc['id']}/download", headers=h)).status_code == 404
    assert (await client.get(f"{API}/documents/analyses/{analysis.id}", headers=h)).status_code == 404
    assert await _ids(client, h2) == {doc2["id"]}  # other hospitals unaffected

    # an account-wide withdrawal applies to every hospital; granting again restores access
    await _consent(client, p, "share_with_hospitals", False)
    assert await _ids(client, h2) == set()
    await _consent(client, p, "share_with_hospitals", True, hospital_id=hospital.id)
    assert await _ids(client, h) == {doc["id"], letter["id"]}


# ------------------------------------------------------------------------------------------- PHI audit
async def test_phi_reads_are_audited(client, db, make_user, auth_headers) -> None:
    patient_user = await make_user(role="patient")
    profile = await create_patient(db, user=patient_user)
    hospital_user = await make_user(role="hospital", full_name="Dr Hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    case = await create_case(db, profile, hospital)
    admin = await make_user(role="admin")
    support = await make_user(role="support")
    await db.commit()
    p, h = auth_headers(patient_user), auth_headers(hospital_user)
    doc = await _ok(await upload(client, p, case_id=case.id), 201)

    # the patient's own reads are not logged
    await _ok(await client.get(f"{API}/documents/{doc['id']}", headers=p))
    await _ok(await client.get(f"{API}/documents", headers=p))
    assert await _ok(await client.get(f"{API}/privacy/access-log", headers=p)) == []

    await _ok(await client.get(f"{API}/documents", headers=h))
    await _ok(await client.get(f"{API}/documents/{doc['id']}", headers=h))
    r = await client.get(f"{API}/documents/{doc['id']}/download", headers=h)
    assert r.status_code == 200
    screening = await _ok(await client.post(f"{API}/screenings", json={}, headers=p), 201)
    await _ok(await client.get(f"{API}/screenings/{screening['id']}", headers=auth_headers(admin)))

    log = await _ok(await client.get(f"{API}/privacy/access-log", headers=p))
    actions = sorted((e["action"], e["resource_type"]) for e in log)
    assert actions == [
        ("phi.download", "document"),
        ("phi.list", "document"),
        ("phi.view", "document"),
        ("phi.view", "screening"),
    ]
    assert {e["viewer_name"] for e in log if e["resource_type"] == "document"} == {"Dr Hospital"}

    url = f"{API}/admin/privacy/access-log?patient_id={profile.id}"
    assert (await client.get(url, headers=auth_headers(support))).status_code == 403
    admin_log = await _ok(await client.get(url, headers=auth_headers(admin)))
    assert len(admin_log) == 4
    assert (
        await client.get(f"{API}/admin/privacy/access-log?patient_id={case.id}", headers=auth_headers(admin))
    ).status_code == 404


# --------------------------------------------------------------------------------------- staff sessions
async def test_staff_session_ttl_and_idle_timeout(client, db, make_user) -> None:
    _last_touch.clear()
    await make_user(role="support", email="sup@example.test", password=PASSWORD)
    r = await client.post(f"{API}{STAFF}/login", json={"email": "sup@example.test", "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert f"Max-Age={settings.STAFF_REFRESH_TOKEN_TTL_HOURS * 3600}" in r.headers["set-cookie"]
    row = (await db.execute(select(RefreshToken))).scalar_one()
    lifetime = row.expires_at - row.created_at
    assert abs(lifetime - timedelta(hours=settings.STAFF_REFRESH_TOKEN_TTL_HOURS)) < timedelta(minutes=1)

    # API use moves the idle clock
    await db.execute(text("UPDATE refresh_tokens SET last_used_at = now() - interval '20 minutes'"))
    await db.commit()
    assert (await client.get(f"{API}/auth/me", headers=bearer(r.json()))).status_code == 200
    db.expire_all()
    touched = (await db.execute(select(RefreshToken))).scalar_one()
    assert datetime.now(UTC) - touched.last_used_at < timedelta(minutes=1)

    # a refresh is not activity, and an idle session cannot be refreshed
    assert (await client.post(f"{API}{STAFF}/refresh", headers=XHR)).status_code == 200
    idle = settings.STAFF_IDLE_TIMEOUT_MINUTES + 1
    await db.execute(
        text("UPDATE refresh_tokens SET last_used_at = now() - make_interval(mins => :m)"), {"m": idle}
    )
    await db.commit()
    r = await client.post(f"{API}{STAFF}/refresh", headers=XHR)
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_idle_timeout"
    db.expire_all()
    assert all(t.revoked_at is not None for t in (await db.execute(select(RefreshToken))).scalars())
    assert (
        await db.execute(select(AuditLog).where(AuditLog.action == "auth.session_idle_timeout"))
    ).scalar_one()


async def test_patient_sessions_keep_long_lifetime_without_idle_timeout(client, db) -> None:
    from tests.modules.auth_helpers import MOBILE, register

    _, token = await register(client, "patient")
    row = (await db.execute(select(RefreshToken))).scalar_one()
    assert row.expires_at - row.created_at > timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS - 1)
    await db.execute(text("UPDATE refresh_tokens SET last_used_at = now() - interval '5 days'"))
    await db.commit()
    r = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": token["refresh_token"]}, headers=MOBILE
    )
    assert r.status_code == 200, r.text


# --------------------------------------------------------------------------------------------- encryption
def _key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


def test_key_rotation_roundtrip(monkeypatch) -> None:
    old_key = settings.FIELD_ENCRYPTION_KEY
    token = crypto.encrypt_str("Asthma since childhood")
    assert token.startswith(f"v1:{settings.FIELD_ENCRYPTION_KEY_ID}:")
    legacy = "v1:" + token.split(":", 2)[2]  # format written before key ids existed
    assert crypto.decrypt_str(legacy) == "Asthma since childhood"

    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_KEY", _key())
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_KEY_ID", "k2")
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", [f"k1:{old_key}"])
    assert crypto.decrypt_str(token) == "Asthma since childhood"
    assert crypto.decrypt_str(legacy) == "Asthma since childhood"
    assert (
        crypto.needs_reencrypt(token) and crypto.needs_reencrypt(legacy) and crypto.needs_reencrypt("plain")
    )
    fresh = crypto.encrypt_str("x")
    assert fresh.startswith("v1:k2:") and not crypto.needs_reencrypt(fresh)
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", [])
    try:
        crypto.decrypt_str(token)
    except crypto.CryptoError as exc:
        assert "unknown encryption key id" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("old key must be required")


async def test_health_text_encrypted_and_reencrypt_job(db, make_user, monkeypatch) -> None:
    from app.modules.privacy.tasks import reencrypt_fields

    user = await make_user(role="patient")
    profile = await create_patient(db, user=user, medical_history="Hypertension", passport_number="Z1234567")
    await db.commit()
    pid = profile.id
    raw = (
        await db.execute(text("SELECT medical_history FROM patient_profiles WHERE id = :id"), {"id": pid})
    ).scalar_one()
    assert raw.startswith("v1:") and "Hypertension" not in raw

    # rows written before encryption (plaintext / plain JSON) stay readable until the job encrypts them
    await db.execute(text("UPDATE patient_profiles SET allergies = 'Penicillin' WHERE id = :id"), {"id": pid})
    analysis_doc = Document(
        owner_user_id=user.id,
        patient_id=pid,
        kind="medical_report",
        file_name="a.pdf",
        content_type="application/pdf",
        size_bytes=1,
        storage_key=f"documents/test/{pid}.pdf",
        sha256="0" * 64,
    )
    db.add(analysis_doc)
    await db.flush()
    db.add(
        DocumentAnalysis(document_ids=[analysis_doc.id], primary_document_id=analysis_doc.id, patient_id=pid)
    )
    await db.commit()
    await db.execute(text("""UPDATE document_analyses SET ai_output = '{"summary": "ok"}'"""))
    await db.commit()
    db.expire_all()
    assert (await db.get(PatientProfile, pid)).allergies == "Penicillin"
    analysis = (await db.execute(select(DocumentAnalysis))).scalar_one()
    assert analysis.ai_output == {"summary": "ok"}

    # rotate the key: the job moves everything to the new key and encrypts the plaintext
    old_key = settings.FIELD_ENCRYPTION_KEY
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_KEY", _key())
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_KEY_ID", "k2")
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", [f"k1:{old_key}"])
    summary = await reencrypt_fields(db, {})
    await db.commit()
    assert summary["patient_profiles.allergies"] == 1 and summary["patient_profiles.medical_history"] == 1
    assert summary["patient_profiles.passport_number"] == 1 and summary["document_analyses.ai_output"] == 1
    rows = (
        await db.execute(
            text("SELECT allergies, medical_history, passport_number FROM patient_profiles WHERE id = :id"),
            {"id": pid},
        )
    ).one()
    assert all(value.startswith("v1:k2:") for value in rows)
    assert (
        (await db.execute(text("SELECT ai_output FROM document_analyses"))).scalar_one().startswith("v1:k2:")
    )
    # nothing left to do; the old key can be removed
    assert await reencrypt_fields(db, {}) == {}
    monkeypatch.setattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", [])
    db.expire_all()
    fresh = await db.get(PatientProfile, pid)
    assert (fresh.allergies, fresh.medical_history, fresh.passport_number) == (
        "Penicillin",
        "Hypertension",
        "Z1234567",
    )
    analysis = (await db.execute(select(DocumentAnalysis))).scalar_one()
    assert analysis.ai_output == {"summary": "ok"}
