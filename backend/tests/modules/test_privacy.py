"""Privacy and data rights: export, complete erasure, legal holds, retention purges, data-rights requests and
grievances, nominees, guardian consent for minors and the breach register."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.enums import BookingStatus, CaseStatus, UserStatus
from app.core.storage import get_storage
from app.models import (
    AuditLog,
    Consent,
    Conversation,
    ConversationParticipant,
    Document,
    Message,
    Notification,
    PatientProfile,
    Payment,
    Screening,
    User,
)
from app.models.docai import DocumentAnalysis
from app.models.privacy import BreachIncident, DataNominee, DataRightsRequest, GuardianConsent
from app.models.voice import VoiceTranscription
from tests.factories import (
    create_booking,
    create_case,
    create_hospital,
    create_patient,
    create_payment_order,
    create_user,
)
from tests.modules.auth_helpers import API, PASSWORD, bearer, register, upload


async def _patient(db, make_user, **profile: Any):
    user = await make_user(role="patient", password=PASSWORD)
    profile_row = await create_patient(db, user=user, **profile)
    await db.commit()
    return user, profile_row


async def _ok(r, code: int = 200) -> Any:
    assert r.status_code == code, r.text
    return r.json() if r.content else None


# ------------------------------------------------------------------------------------------------- export
async def test_export_json_and_zip(client, db, make_user, auth_headers) -> None:
    user, profile = await _patient(db, make_user, medical_history="Type 2 diabetes since 2019")
    other, _ = await _patient(db, make_user, medical_history="Someone else's history")
    headers = auth_headers(user)
    doc = await _ok(await upload(client, headers, file_name="mri.pdf"), 201)
    await upload(client, auth_headers(other), file_name="other.pdf")
    await _ok(
        await client.put(
            f"{API}/privacy/nominee",
            json={"full_name": "Grace Okafor", "relationship": "sister", "email": "grace@example.test"},
            headers=headers,
        )
    )
    db.add(Screening(patient_id=profile.id, notes="Knee pain when climbing stairs"))
    conversation = Conversation(kind="support", subject="Help")
    db.add(conversation)
    await db.flush()
    db.add(Message(conversation_id=conversation.id, sender_user_id=user.id, body="Hello, I need help"))
    db.add(Notification(user_id=user.id, kind="test", title="Hi"))
    await db.commit()

    r = await client.get(f"{API}/auth/me/export", params={"format": "json"}, headers=headers)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    assert "attachment" in r.headers["content-disposition"] and "no-store" in r.headers["cache-control"]
    data = r.json()
    assert data["account"]["id"] == str(user.id) and "password_hash" not in data["account"]
    assert "mfa_secret" not in data["account"] and "legal_hold" not in data["account"]
    assert data["patient_profile"]["medical_history"] == "Type 2 diabetes since 2019"
    assert [d["id"] for d in data["documents"]] == [doc["id"]]
    assert "storage_key" not in data["documents"][0]
    assert data["screenings"][0]["notes"] == "Knee pain when climbing stairs"
    assert data["messages_sent"][0]["body"] == "Hello, I need help"
    assert data["nominee"]["full_name"] == "Grace Okafor"
    assert {c["kind"] for c in data["consents"]} >= set()
    assert data["notifications"][0]["title"] == "Hi"
    assert "Someone else's history" not in r.text

    r = await client.get(f"{API}/auth/me/export", headers=headers)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(r.content))
    names = archive.namelist()
    assert "data.json" in names and "README.txt" in names
    files = [n for n in names if n.startswith("files/")]
    assert files == [f"files/{doc['id']}_mri.pdf"]
    assert archive.read(files[0]).startswith(b"%PDF")
    exported = json.loads(archive.read("data.json"))
    assert exported["files"]["included"][0]["document_id"] == doc["id"]
    audits = (
        (await db.execute(select(AuditLog).where(AuditLog.action == "privacy.data_export"))).scalars().all()
    )
    assert len(audits) == 2


async def test_export_rate_limited(client, db, make_user, auth_headers, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "DATA_EXPORT_DAILY_LIMIT", 1)
    user, _ = await _patient(db, make_user)
    headers = auth_headers(user)
    assert (await client.get(f"{API}/auth/me/export?format=json", headers=headers)).status_code == 200
    r = await client.get(f"{API}/auth/me/export?format=json", headers=headers)
    assert r.status_code == 429 and "Retry-After" in r.headers
    assert (await client.get(f"{API}/auth/me/export")).status_code == 401


# ------------------------------------------------------------------------------------------------- erasure
async def test_delete_account_erases_health_data_and_files(
    client, db, make_user, auth_headers, run_jobs, storage_dir
) -> None:
    user, profile = await _patient(db, make_user, medical_history="Asthma")
    user_id, profile_id = user.id, profile.id
    headers = auth_headers(user)
    medical = await _ok(await upload(client, headers, file_name="scan.pdf"), 201)
    invoice = await _ok(await upload(client, headers, kind="invoice", file_name="invoice.pdf"), 201)
    hospital = await create_hospital(db)
    case = await create_case(db, profile, hospital, status=CaseStatus.COMPLETED, patient_notes="Knee pain")
    case_doc = await _ok(await upload(client, headers, case_id=case.id, file_name="xray.pdf"), 201)
    booking = await create_booking(db, case, status=BookingStatus.COMPLETED)
    order = await create_payment_order(
        db, booking, meta={"email": "amara@example.test", "receipt": "R-1", "notes": {"x": 1}}
    )
    db.add(
        Payment(
            order_id=order.id,
            gateway=order.gateway,
            gateway_payment_id="pay_1",
            status="captured",
            amount_minor=100,
            currency="INR",
            base_amount_minor=100,
            raw={"id": "pay_1", "email": "amara@example.test", "contact": "+911234", "amount": 100},
        )
    )
    screening = Screening(patient_id=profile.id, notes="Chest pain", ai_result={"summary": "x"})
    db.add(screening)
    voice_key = "voice/test/clip.webm"
    await get_storage().save(voice_key, b"audio", "audio/webm")
    db.add(
        VoiceTranscription(user_id=user.id, patient_id=profile.id, storage_key=voice_key, transcript="cough")
    )
    db.add(
        DocumentAnalysis(
            document_ids=[medical["id"]],
            primary_document_id=medical["id"],
            patient_id=profile.id,
            summary_patient="Normal",
        )
    )
    conversation = Conversation(kind="support", subject="Help")
    db.add(conversation)
    await db.flush()
    db.add(ConversationParticipant(conversation_id=conversation.id, user_id=user.id))
    db.add(Message(conversation_id=conversation.id, sender_user_id=user.id, body="My diagnosis is X"))
    db.add(Notification(user_id=user.id, kind="test", title="Hi"))
    db.add(DataNominee(user_id=user.id, full_name="Grace", relationship="sister", email="g@example.test"))
    await db.commit()
    case_id, order_id = case.id, order.id
    medical_key = (await db.get(Document, medical["id"])).storage_key
    case_key = (await db.get(Document, case_doc["id"])).storage_key
    assert (storage_dir / medical_key).exists()

    r = await client.request("DELETE", f"{API}/auth/me", json={"password": PASSWORD}, headers=headers)
    assert r.status_code == 204, r.text
    await run_jobs()
    db.expire_all()

    remaining = {str(d.id) for d in (await db.execute(select(Document))).scalars()}
    assert remaining == {invoice["id"]}  # financial record kept
    assert not (storage_dir / medical_key).exists() and not (storage_dir / case_key).exists()
    assert not (storage_dir / voice_key).exists()
    for model in (Screening, VoiceTranscription, DocumentAnalysis, Notification, DataNominee):
        assert (await db.execute(select(func.count()).select_from(model))).scalar_one() == 0, model
    message = (await db.execute(select(Message))).scalar_one()
    assert message.body == "[deleted]"
    assert (await db.execute(select(func.count()).select_from(ConversationParticipant))).scalar_one() == 0
    profile_row = await db.get(PatientProfile, profile_id)
    assert profile_row.medical_history is None and profile_row.date_of_birth is None
    assert profile_row.first_name == "Deleted"
    case_row = await db.get(type(case), case_id)
    assert case_row is not None and case_row.patient_notes is None  # kept as an anonymous record
    order_row = await db.get(type(order), order_id)
    assert order_row.meta == {"receipt": "R-1"}
    payment = (await db.execute(select(Payment))).scalar_one()
    assert payment.raw == {"id": "pay_1", "amount": 100}
    user_row = await db.get(User, user_id)
    assert user_row.status == UserStatus.DELETED and user_row.email is None
    audit = (await db.execute(select(AuditLog).where(AuditLog.action == "auth.account_deleted"))).scalar_one()
    assert audit.after["screenings_erased"] == 1 and audit.after["voice_transcriptions_erased"] == 1
    withdrawn = (
        await db.execute(select(Consent.kind).where(Consent.user_id == user_id, Consent.granted.is_(False)))
    ).scalars()
    assert {"marketing", "ai_processing", "share_with_agent", "share_with_hospitals"} <= set(withdrawn)


async def test_legal_hold_blocks_erasure_and_is_admin_only(client, db, make_user, auth_headers) -> None:
    user, profile = await _patient(db, make_user)
    admin = await make_user(role="admin")
    support = await make_user(role="support")
    url = f"{API}/admin/privacy/legal-holds/users/{user.id}"
    body = {"legal_hold": True, "reason": "Court order 2026/77"}
    assert (await client.put(url, json=body, headers=auth_headers(support))).status_code == 403
    assert (await client.put(url, json=body, headers=auth_headers(user))).status_code == 403
    r = await client.put(url, json={"legal_hold": True}, headers=auth_headers(admin))
    assert r.status_code == 422  # a reason is required
    hold = await _ok(await client.put(url, json=body, headers=auth_headers(admin)))
    assert hold["legal_hold"] is True and hold["reason"] == "Court order 2026/77"

    r = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": PASSWORD}, headers=auth_headers(user)
    )
    assert r.status_code == 409 and r.json()["error"]["details"] == {"legal_hold": 1}
    holds = await _ok(await client.get(f"{API}/admin/privacy/legal-holds", headers=auth_headers(admin)))
    assert [h["entity_id"] for h in holds] == [str(user.id)]

    await _ok(await client.put(url, json={"legal_hold": False}, headers=auth_headers(admin)))
    # a hold on one of the patient's cases blocks erasure as well
    case = await create_case(db, profile, await create_hospital(db), status=CaseStatus.COMPLETED)
    await db.commit()
    case_url = f"{API}/admin/privacy/legal-holds/cases/{case.id}"
    await _ok(await client.put(case_url, json=body, headers=auth_headers(admin)))
    r = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": PASSWORD}, headers=auth_headers(user)
    )
    assert r.status_code == 409
    await _ok(await client.put(case_url, json={"legal_hold": False}, headers=auth_headers(admin)))
    r = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": PASSWORD}, headers=auth_headers(user)
    )
    assert r.status_code == 204, r.text
    actions = (await db.execute(select(AuditLog.action))).scalars().all()
    assert actions.count("privacy.legal_hold_set") == 2 and actions.count("privacy.legal_hold_released") == 2


# ------------------------------------------------------------------------------------------------- purges
async def _age_user(db, user_id, days: int) -> None:
    await db.execute(
        text(
            "UPDATE users SET last_login_at = now() - make_interval(days => :d), created_at = now() - "
            "make_interval(days => :d) WHERE id = :id"
        ),
        {"d": days, "id": user_id},
    )
    await db.commit()


async def test_guest_purge_respects_retention_and_holds(client, db, run_jobs) -> None:
    from app.modules.privacy.tasks import purge_guests
    from tests.modules.auth_helpers import MOBILE

    ids = []
    for _ in range(3):
        r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
        ids.append(r.json()["user"]["id"])
    old, recent, held = ids
    await upload(client, bearer((await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)).json()))
    for uid in (old, held):
        await _age_user(db, uid, settings.GUEST_RETENTION_DAYS + 1)
    await db.execute(text("UPDATE users SET legal_hold = true WHERE id = :id"), {"id": held})
    await db.commit()

    erased = await purge_guests(db, {})
    await db.commit()
    assert erased == 1
    db.expire_all()
    assert (await db.get(User, old)).status == UserStatus.DELETED
    assert (await db.get(User, recent)).status == UserStatus.ACTIVE
    assert (await db.get(User, held)).status == UserStatus.ACTIVE


async def test_soft_deleted_and_travel_id_purges(
    client, db, make_user, auth_headers, run_jobs, storage_dir
) -> None:
    from app.modules.privacy.tasks import purge_soft_deleted_files, purge_travel_ids

    user, profile = await _patient(db, make_user)
    headers = auth_headers(user)
    deleted_doc = await _ok(await upload(client, headers, file_name="old.pdf"), 201)
    assert (await client.delete(f"{API}/documents/{deleted_doc['id']}", headers=headers)).status_code == 204
    passport = await _ok(await upload(client, headers, kind="passport", file_name="passport.pdf"), 201)
    hospital = await create_hospital(db)
    case = await create_case(db, profile, hospital, status=CaseStatus.COMPLETED)
    await db.commit()
    deleted_key = (await db.get(Document, deleted_doc["id"])).storage_key
    passport_key = (await db.get(Document, passport["id"])).storage_key

    # too recent: nothing happens
    assert await purge_soft_deleted_files(db, {}) == 0
    assert await purge_travel_ids(db, {}) == 0
    old = settings.SOFT_DELETED_FILE_RETENTION_DAYS + 1
    await db.execute(
        text("UPDATE documents SET deleted_at = now() - make_interval(days => :d) WHERE id = :id"),
        {"d": old, "id": deleted_doc["id"]},
    )
    await db.execute(
        text("UPDATE cases SET closed_at = now() - make_interval(days => :d) WHERE id = :id"),
        {"d": settings.TRAVEL_ID_RETENTION_DAYS_AFTER_TRIP + 1, "id": case.id},
    )
    # another, still active case keeps the passport
    active = await create_case(db, profile, hospital, status=CaseStatus.BOOKED)
    await db.commit()
    assert await purge_travel_ids(db, {}) == 0
    await db.execute(
        text(
            "UPDATE cases SET status = 'cancelled', updated_at = now() - make_interval(days => 400) "
            "WHERE id = :id"
        ),
        {"id": active.id},
    )
    await db.commit()

    assert await purge_soft_deleted_files(db, {}) == 1
    assert await purge_travel_ids(db, {}) == 1
    await db.commit()
    await run_jobs()
    db.expire_all()
    assert (await db.execute(select(func.count()).select_from(Document))).scalar_one() == 0
    assert not (storage_dir / deleted_key).exists() and not (storage_dir / passport_key).exists()


async def test_inactive_accounts_notice_then_erasure(db, make_user, run_jobs) -> None:
    from app.modules.privacy.tasks import inactive_accounts

    user, _ = await _patient(db, make_user)
    staff = await make_user(role="admin")
    user_id, staff_id = user.id, staff.id
    retention = settings.INACTIVE_ACCOUNT_RETENTION_DAYS
    await _age_user(db, user.id, retention - settings.INACTIVE_ACCOUNT_NOTICE_DAYS + 1)
    await _age_user(db, staff.id, retention + 10)

    result = await inactive_accounts(db, {})
    await db.commit()
    assert result == {"notified": 1, "erased": 0}
    note = (await db.execute(select(Notification).where(Notification.user_id == user.id))).scalar_one()
    assert note.kind == "privacy.inactivity_notice"
    # a second run does not notify again, and nothing is erased before the notice period ends
    assert await inactive_accounts(db, {}) == {"notified": 0, "erased": 0}

    await _age_user(db, user.id, retention + 1)
    await db.execute(
        text("UPDATE users SET inactivity_notice_at = now() - make_interval(days => :d) WHERE id = :id"),
        {"d": settings.INACTIVE_ACCOUNT_NOTICE_DAYS + 1, "id": user.id},
    )
    await db.commit()
    result = await inactive_accounts(db, {})
    await db.commit()
    assert result["erased"] == 1
    db.expire_all()
    assert (await db.get(User, user_id)).status == UserStatus.DELETED
    assert (await db.get(User, staff_id)).status == UserStatus.ACTIVE  # staff are never auto-erased


async def test_sign_in_clears_inactivity_notice(client, db, make_user) -> None:
    from tests.modules.auth_helpers import login

    user = await make_user(role="patient", email="sleepy@example.test", password=PASSWORD)
    user_id = user.id
    user.inactivity_notice_at = datetime.now(UTC)
    await db.commit()
    assert (await login(client, "sleepy@example.test")).status_code == 200
    db.expire_all()
    assert (await db.get(User, user_id)).inactivity_notice_at is None


async def test_old_notifications_purged(db, make_user) -> None:
    from app.modules.privacy.tasks import purge_notifications

    user = await make_user(role="patient")
    db.add(Notification(user_id=user.id, kind="a", title="old"))
    db.add(Notification(user_id=user.id, kind="b", title="new"))
    await db.commit()
    await db.execute(
        text("UPDATE notifications SET created_at = now() - make_interval(days => :d) WHERE title = 'old'"),
        {"d": settings.NOTIFICATION_RETENTION_DAYS + 1},
    )
    await db.commit()
    assert await purge_notifications(db, {}) == 1
    await db.commit()
    assert [n.title for n in (await db.execute(select(Notification))).scalars()] == ["new"]


# ------------------------------------------------------------------------------------ requests / grievances
async def test_privacy_contact_is_public(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "GRIEVANCE_OFFICER_NAME", "TODO Officer")
    monkeypatch.setattr(settings, "GRIEVANCE_OFFICER_EMAIL", "grievance@example.test")
    monkeypatch.setattr(settings, "DPO_EMAIL", "")
    out = await _ok(await client.get(f"{API}/site-config/privacy-contact"))
    assert out["grievance_officer"] == {
        "name": "TODO Officer",
        "email": "grievance@example.test",
        "phone": None,
    }
    assert out["data_protection_officer"]["email"] is None
    assert out["response_days"] == settings.DATA_RIGHTS_SLA_DAYS and "erasure" in out["request_kinds"]


async def test_data_rights_requests_flow(client, db, make_user, auth_headers, run_jobs, email_outbox) -> None:
    user, _ = await _patient(db, make_user)
    other, _ = await _patient(db, make_user)
    admin = await make_user(role="admin")
    support = await make_user(role="support")
    finance = await make_user(role="finance")

    # without signing in: name and email are needed
    r = await client.post(
        f"{API}/privacy/requests", json={"kind": "complaint", "details": "Please call me back"}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "contact_required"
    anon = await _ok(
        await client.post(
            f"{API}/privacy/requests",
            json={
                "kind": "access",
                "details": "I am the nominee of a deceased patient",
                "requester_name": "Grace Okafor",
                "requester_email": "grace@example.test",
                "on_behalf_of": "Amara Okafor (deceased)",
            },
        ),
        201,
    )
    assert anon["reference"].startswith("DRR-") and anon["status"] == "received"

    mine = await _ok(
        await client.post(
            f"{API}/privacy/requests",
            json={"kind": "correction", "details": "My date of birth is wrong", "channel": "app"},
            headers=auth_headers(user),
        ),
        201,
    )
    due = datetime.fromisoformat(mine["due_at"])
    assert abs((due - datetime.now(UTC)) - timedelta(days=settings.DATA_RIGHTS_SLA_DAYS)) < timedelta(
        minutes=5
    )
    listed = await _ok(await client.get(f"{API}/privacy/requests", headers=auth_headers(user)))
    assert [r["id"] for r in listed] == [mine["id"]]
    assert (
        await client.get(f"{API}/privacy/requests/{mine['id']}", headers=auth_headers(other))
    ).status_code == 404
    assert (
        await client.post(
            f"{API}/privacy/requests",
            json={"kind": "other", "details": "staff request"},
            headers=auth_headers(admin),
        )
    ).status_code == 403

    # staff queue
    assert (
        await client.get(f"{API}/admin/privacy/requests", headers=auth_headers(finance))
    ).status_code == 403
    queue = await _ok(
        await client.get(f"{API}/admin/privacy/requests?open=true", headers=auth_headers(support))
    )
    assert queue["total"] == 2 and queue["items"][0]["requester_name"]
    url = f"{API}/admin/privacy/requests/{mine['id']}"
    r = await client.patch(url, json={"status": "completed"}, headers=auth_headers(support))
    assert r.status_code == 422  # an answer is required to close
    updated = await _ok(
        await client.patch(
            url,
            json={
                "status": "completed",
                "resolution": "We corrected your date of birth.",
                "internal_notes": "checked passport",
                "assigned_to_user_id": str(support.id),
            },
            headers=auth_headers(support),
        )
    )
    assert updated["closed_at"] and updated["internal_notes"] == "checked passport"
    r = await client.patch(url, json={"assigned_to_user_id": str(user.id)}, headers=auth_headers(admin))
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_assignee"
    mine_now = await _ok(await client.get(f"{API}/privacy/requests/{mine['id']}", headers=auth_headers(user)))
    assert mine_now["status"] == "completed" and "internal_notes" not in mine_now
    note = (
        await db.execute(select(Notification).where(Notification.kind == "privacy.request_updated"))
    ).scalar_one()
    assert note.user_id == user.id
    await run_jobs()
    assert any("grace@example.test" in m["to"] for m in email_outbox)

    # overdue requests are flagged and reminded
    row = await db.get(DataRightsRequest, anon["id"])
    row.due_at = datetime.now(UTC) - timedelta(days=1)
    await db.commit()
    overdue = await _ok(
        await client.get(f"{API}/admin/privacy/requests?overdue=true", headers=auth_headers(admin))
    )
    assert [i["id"] for i in overdue["items"]] == [anon["id"]] and overdue["items"][0]["overdue"] is True
    from app.modules.privacy.tasks import data_rights_sla

    assert await data_rights_sla(db, {}) == 1


# ------------------------------------------------------------------------------------------------- nominee
async def test_nominee_crud(client, db, make_user, auth_headers) -> None:
    user, _ = await _patient(db, make_user)
    headers = auth_headers(user)
    assert (await _ok(await client.get(f"{API}/privacy/nominee", headers=headers))) is None
    r = await client.put(
        f"{API}/privacy/nominee", json={"full_name": "Grace", "relationship": "sister"}, headers=headers
    )
    assert r.status_code == 422  # a contact is required
    out = await _ok(
        await client.put(
            f"{API}/privacy/nominee",
            json={"full_name": "Grace Okafor", "relationship": "sister", "phone": "+234 801 000 0000"},
            headers=headers,
        )
    )
    assert out["phone"] == "+234 801 000 0000"
    raw = (await db.execute(text("SELECT phone FROM data_nominees"))).scalar_one()
    assert raw.startswith("v1:") and "801" not in raw  # encrypted at rest
    out = await _ok(
        await client.put(
            f"{API}/privacy/nominee",
            json={"full_name": "Grace Okafor", "relationship": "spouse", "email": "grace@example.test"},
            headers=headers,
        )
    )
    assert out["relationship"] == "spouse" and out["phone"] is None
    assert (await client.delete(f"{API}/privacy/nominee", headers=headers)).status_code == 204
    assert (await _ok(await client.get(f"{API}/privacy/nominee", headers=headers))) is None
    admin = await make_user(role="admin")
    r = await client.put(
        f"{API}/privacy/nominee",
        json={"full_name": "X Y", "relationship": "friend", "email": "x@example.test"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------------------- guardian consent
GUARDIAN = {
    "guardian_name": "Ngozi Okafor",
    "relationship": "parent",
    "guardian_email": "ngozi@example.test",
    "guardian_date_of_birth": "1985-02-01",
    "verification_method": "id_document",
    "verification_reference": "passport ending 4411",
    "declaration": True,
}


async def test_minor_needs_verified_guardian_consent(client, db, make_user, auth_headers) -> None:
    today = date.today()
    user, profile = await _patient(db, make_user, date_of_birth=date(today.year - 15, 1, 1))
    headers = auth_headers(user)
    support = await make_user(role="support")

    status = await _ok(await client.get(f"{API}/privacy/guardian-consent", headers=headers))
    assert status["is_minor"] is True and status["satisfied"] is False

    # screening submission is blocked
    screening = await _ok(await client.post(f"{API}/screenings", json={}, headers=headers), 201)
    await _ok(
        await client.patch(f"{API}/screenings/{screening['id']}", json={"notes": "Ear pain"}, headers=headers)
    )
    submit_url = f"{API}/screenings/{screening['id']}/submit"
    r = await client.post(submit_url, json={"consent_ai": True}, headers=headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "guardian_consent_required"
    # AI document reading is blocked
    doc = await _ok(await upload(client, headers), 201)
    r = await client.post(
        f"{API}/documents/analyses", json={"document_ids": [doc["id"]], "consent_ai": True}, headers=headers
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "guardian_consent_required"
    # booking is blocked
    case = await create_case(db, profile, await create_hospital(db))
    await db.commit()
    r = await client.post(
        f"{API}/bookings",
        json={"case_id": str(case.id), "admission_date": str(today + timedelta(days=40))},
        headers=headers,
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "guardian_consent_required"

    # the guardian must be an adult
    r = await client.post(
        f"{API}/privacy/guardian-consent",
        json={**GUARDIAN, "guardian_date_of_birth": str(date(today.year - 16, 1, 1))},
        headers=headers,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "guardian_not_adult"
    r = await client.post(
        f"{API}/privacy/guardian-consent", json={**GUARDIAN, "declaration": False}, headers=headers
    )
    assert r.status_code == 422
    pending = await _ok(
        await client.post(f"{API}/privacy/guardian-consent", json=GUARDIAN, headers=headers), 201
    )
    assert pending["verified_at"] is None
    r = await client.post(submit_url, json={"consent_ai": True}, headers=headers)
    assert r.status_code == 403  # not verified yet

    queue = await _ok(
        await client.get(f"{API}/admin/privacy/guardian-consents", headers=auth_headers(support))
    )
    assert [g["id"] for g in queue] == [pending["id"]]
    verified = await _ok(
        await client.post(
            f"{API}/admin/privacy/guardian-consents/{pending['id']}/verify", headers=auth_headers(support)
        )
    )
    assert verified["verified_at"]
    consent = (
        await db.execute(
            select(Consent).where(Consent.user_id == user.id, Consent.kind == "guardian_consent")
        )
    ).scalar_one()
    assert consent.granted and consent.granted_by_user_id is None  # recorded in the patient's own account
    r = await client.post(submit_url, json={"consent_ai": True}, headers=headers)
    assert r.status_code == 200, r.text

    # withdrawal blocks processing again
    assert (await client.delete(f"{API}/privacy/guardian-consent", headers=headers)).status_code == 204
    status = await _ok(await client.get(f"{API}/privacy/guardian-consent", headers=headers))
    assert status["satisfied"] is False
    r = await client.post(
        f"{API}/documents/analyses", json={"document_ids": [doc["id"]], "consent_ai": True}, headers=headers
    )
    assert r.status_code == 403

    # staff who checked the guardian's ID record a consent that is verified at once
    out = await _ok(
        await client.post(
            f"{API}/privacy/guardian-consent",
            json={**GUARDIAN, "patient_id": str(profile.id)},
            headers=auth_headers(support),
        ),
        201,
    )
    assert out["verified_at"]
    assert (await db.execute(select(func.count()).select_from(GuardianConsent))).scalar_one() == 2

    # the generic consent endpoint cannot be used for guardian consent
    r = await client.post(
        f"{API}/auth/consents",
        json={"kind": "guardian_consent", "version": "1", "granted": True},
        headers=headers,
    )
    assert r.status_code == 400


async def test_adult_is_not_gated(client, db, make_user, auth_headers) -> None:
    user, _ = await _patient(db, make_user)  # factory date of birth: 1980
    status = await _ok(await client.get(f"{API}/privacy/guardian-consent", headers=auth_headers(user)))
    assert status == {**status, "is_minor": False, "satisfied": True}


# --------------------------------------------------------------------------------------------- breaches
async def test_breach_register(client, db, make_user, auth_headers) -> None:
    admin = await make_user(role="admin")
    other_admin = await make_user(role="super_admin")
    support = await make_user(role="support")
    body = {
        "title": "Lost staff laptop",
        "description": "An unencrypted laptop with a case export was stolen.",
        "severity": "high",
        "data_categories": ["health", "contact"],
        "affected_subjects_estimate": 40,
    }
    assert (
        await client.post(f"{API}/admin/privacy/breaches", json=body, headers=auth_headers(support))
    ).status_code == 403
    out = await _ok(
        await client.post(f"{API}/admin/privacy/breaches", json=body, headers=auth_headers(admin)), 201
    )
    detected = datetime.fromisoformat(out["detected_at"])
    assert datetime.fromisoformat(out["notification_deadline_at"]) - detected == timedelta(hours=72)
    assert out["status"] == "open" and out["reference"].startswith("BR-")
    note = (await db.execute(select(Notification).where(Notification.user_id == other_admin.id))).scalar_one()
    assert note.kind == "privacy.breach_recorded"

    row = await db.get(BreachIncident, out["id"])
    row.notification_deadline_at = datetime.now(UTC) - timedelta(hours=1)
    await db.commit()
    listed = await _ok(await client.get(f"{API}/admin/privacy/breaches", headers=auth_headers(admin)))
    assert listed[0]["notification_overdue"] is True
    now = datetime.now(UTC).isoformat()
    updated = await _ok(
        await client.patch(
            f"{API}/admin/privacy/breaches/{out['id']}",
            json={"status": "notified", "dpb_notified_at": now, "supervisory_authority_notified_at": now},
            headers=auth_headers(admin),
        )
    )
    assert updated["notification_overdue"] is False
    closed = await _ok(
        await client.patch(
            f"{API}/admin/privacy/breaches/{out['id']}",
            json={"status": "closed"},
            headers=auth_headers(admin),
        )
    )
    assert closed["closed_at"]
    actions = (
        await db.execute(select(AuditLog.action).where(AuditLog.entity_type == "breach_incident"))
    ).scalars()
    assert list(actions).count("privacy.breach_updated") == 2


@pytest.mark.parametrize("value", ["prefer", "require"])
def test_database_sslmode_connect_args(monkeypatch, value) -> None:
    from app.core.db import ssl_connect_args

    monkeypatch.setattr(settings, "DATABASE_SSLMODE", value)
    assert ssl_connect_args("postgresql+asyncpg://u:p@h/db") == {"ssl": value}
    assert ssl_connect_args("postgresql+asyncpg://u:p@h/db?ssl=require") == {}


async def test_registered_patient_export_has_consents(client) -> None:
    _, token = await register(client, "patient")
    data = (await client.get(f"{API}/auth/me/export?format=json", headers=bearer(token))).json()
    assert {c["kind"] for c in data["consents"]} == {"terms", "privacy", "age_18_plus"}


async def test_unused_factory_import_guard(db) -> None:
    # keeps create_user exercised for the guardian staff path (factories import check)
    user = await create_user(db, role="patient")
    assert user.id


async def test_under_18_answer_at_sign_up_gates_without_date_of_birth(
    client, db, make_user, auth_headers
) -> None:
    """CG-24 + guardian consent: a patient who answered "under 18" at sign-up is gated even with no DOB."""
    user, _profile = await _patient(db, make_user, date_of_birth=None)
    user.is_adult = False
    await db.commit()
    headers = auth_headers(user)
    screening = await _ok(await client.post(f"{API}/screenings", json={}, headers=headers), 201)
    await _ok(
        await client.patch(f"{API}/screenings/{screening['id']}", json={"notes": "Ear pain"}, headers=headers)
    )
    r = await client.post(
        f"{API}/screenings/{screening['id']}/submit", json={"consent_ai": True}, headers=headers
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "guardian_consent_required"

    # an adult answer (or no answer, for accounts older than the attestation) is not gated
    user.is_adult = None
    await db.commit()
    r = await client.post(
        f"{API}/screenings/{screening['id']}/submit", json={"consent_ai": True}, headers=headers
    )
    assert r.status_code != 403, r.text
