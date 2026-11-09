"""Phase 1 guests: AI quota (per guest + per IP), contact verification codes, the one free intro consultation
and keeping everything on upgrade."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, update

from app.core.config import settings
from app.core.enums import ConsentKind
from app.models import Consent, GuestAiUsage, GuestContactVerification, IntroConsultation, Notification, User
from app.modules.cases.aftercare import run_consultation_reminders
from app.modules.guests import service as guest_service
from tests.factories import create_specialty, create_user
from tests.modules.auth_helpers import MOBILE, PASSWORD, bearer
from tests.modules.cases_helpers import EventLog, event_log_fixture, make_document  # noqa: F401

API = "/api/v1"


async def _guest(client: Any) -> tuple[dict[str, Any], dict[str, str]]:
    r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
    assert r.status_code == 201, r.text
    guest = r.json()
    return guest, {**MOBILE, **bearer(guest)}


async def _screening(client: Any, headers: dict[str, str]) -> str:
    r = await client.post(f"{API}/screenings", json={"specialty_slug": "orthopedics"}, headers=headers)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    r = await client.patch(f"{API}/screenings/{sid}", json={"notes": "Knee pain on stairs"}, headers=headers)
    assert r.status_code == 200, r.text
    return sid


def _code_from_email(email_outbox: list[dict[str, Any]], to: str) -> str:
    msg = [m for m in email_outbox if to in m["to"]][-1]
    match = re.search(r"Your code is (\d{6})", msg["text"])
    assert match, msg["text"]
    return match.group(1)


async def _verified(client, headers, run_jobs, email_outbox, email: str) -> str:
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "email", "contact": email}, headers=headers
    )
    assert r.status_code == 201, r.text
    vid = r.json()["verification_id"]
    await run_jobs()
    code = _code_from_email(email_outbox, email.lower())
    r = await client.post(
        f"{API}/guest/verify/confirm", json={"verification_id": vid, "code": code}, headers=headers
    )
    assert r.status_code == 200, r.text
    return vid


async def test_guest_ai_quota_per_guest_and_ip(db, client, monkeypatch) -> None:
    await create_specialty(db, slug="orthopedics", name="Orthopedics")
    monkeypatch.setattr(settings, "GUEST_AI_DAILY_LIMIT", 3)
    guest, h = await _guest(client)

    for _ in range(2):
        sid = await _screening(client, h)
        r = await client.post(f"{API}/screenings/{sid}/submit", json={"consent_ai": True}, headers=h)
        assert r.status_code == 200, r.text
    # a rejected request (no consent) does not use quota
    sid = await _screening(client, h)
    r = await client.post(f"{API}/screenings/{sid}/submit", json={"consent_ai": False}, headers=h)
    assert r.status_code == 400
    # report scan shares the same quota
    owner = await db.get(User, guest["user"]["id"])
    doc = await make_document(
        db, owner, kind="medical_report", patient_id=guest["user"]["patient_profile_id"]
    )
    r = await client.post(
        f"{API}/documents/analyses", json={"document_ids": [str(doc.id)], "consent_ai": True}, headers=h
    )
    assert r.status_code == 202, r.text
    r = await client.post(f"{API}/screenings/{sid}/submit", json={"consent_ai": True}, headers=h)
    assert r.status_code == 429
    body = r.json()["error"]
    assert body["code"] == "rate_limited" and body["details"]["scope"] == "guest_ai_daily"
    assert "Create a free account" in body["message"]
    assert len((await db.execute(select(GuestAiUsage))).scalars().all()) == 3

    # AI consent was recorded for the guest
    consents = (
        (
            await db.execute(
                select(Consent).where(
                    Consent.user_id == guest["user"]["id"], Consent.kind == ConsentKind.AI_PROCESSING
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(consents) >= 3

    # a second guest from the same IP is limited too
    _, h2 = await _guest(client)
    sid2 = await _screening(client, h2)
    r = await client.post(f"{API}/screenings/{sid2}/submit", json={"consent_ai": True}, headers=h2)
    assert r.status_code == 429
    # rules-only screenings (no AI) are not limited
    r = await client.patch(f"{API}/screenings/{sid2}", json={"preferences": {"use_ai": False}}, headers=h2)
    assert r.status_code == 200, r.text
    r = await client.post(f"{API}/screenings/{sid2}/submit", json={"consent_ai": False}, headers=h2)
    assert r.status_code == 200, r.text

    # the next day the quota is back
    await db.execute(update(GuestAiUsage).values(created_at=datetime.now(UTC) - timedelta(hours=25)))
    await db.commit()
    r = await client.post(f"{API}/screenings/{sid}/submit", json={"consent_ai": True}, headers=h)
    assert r.status_code == 200, r.text


async def test_verification_codes(db, client, run_jobs, email_outbox, monkeypatch) -> None:
    _, h = await _guest(client)
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "email", "contact": "nope"}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_contact"
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "email", "contact": "Amina@Example.test"}, headers=h
    )
    assert r.status_code == 201, r.text
    start = r.json()
    assert start["contact_masked"] == "a***@example.test"
    row = await db.get(GuestContactVerification, start["verification_id"])
    await run_jobs()
    code = _code_from_email(email_outbox, "amina@example.test")
    assert code not in row.code_hash and len(row.code_hash) == 64

    wrong = "000000" if code != "000000" else "111111"
    for attempt in range(1, 5):
        r = await client.post(
            f"{API}/guest/verify/confirm",
            json={"verification_id": start["verification_id"], "code": wrong},
            headers=h,
        )
        assert r.status_code == 400 and r.json()["error"]["details"]["attempts_left"] == 5 - attempt
    r = await client.post(
        f"{API}/guest/verify/confirm",
        json={"verification_id": start["verification_id"], "code": code},
        headers=h,
    )
    assert r.status_code == 200 and r.json()["verified"] is True  # 5th attempt is the right code

    # max 5 attempts, then a new code is needed
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "phone", "contact": "+234 803 123 4567"}, headers=h
    )
    assert r.status_code == 201, r.text
    vid = r.json()["verification_id"]
    sms = guest_service.sms_outbox[-1]
    assert sms["to"] == "+2348031234567"
    phone_code = re.search(r"\d{6}", sms["text"]).group(0)
    bad = "000000" if phone_code != "000000" else "111111"
    for _ in range(5):
        await client.post(
            f"{API}/guest/verify/confirm", json={"verification_id": vid, "code": bad}, headers=h
        )
    r = await client.post(
        f"{API}/guest/verify/confirm", json={"verification_id": vid, "code": phone_code}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "too_many_attempts"

    # expired code
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "email", "contact": "late@example.test"}, headers=h
    )
    vid = r.json()["verification_id"]
    await run_jobs()
    code = _code_from_email(email_outbox, "late@example.test")
    await db.execute(
        update(GuestContactVerification)
        .where(GuestContactVerification.id == vid)
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db.commit()
    r = await client.post(
        f"{API}/guest/verify/confirm", json={"verification_id": vid, "code": code}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "code_expired"

    # at most 3 codes per contact per 10 minutes
    for _ in range(2):
        r = await client.post(
            f"{API}/guest/verify/start", json={"channel": "email", "contact": "late@example.test"}, headers=h
        )
        assert r.status_code == 201
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "email", "contact": "late@example.test"}, headers=h
    )
    assert r.status_code == 429

    # another user's verification is not visible
    _, other = await _guest(client)
    r = await client.post(
        f"{API}/guest/verify/confirm", json={"verification_id": vid, "code": code}, headers=other
    )
    assert r.status_code == 404


async def test_free_intro_consultation_once(
    db, client, run_jobs, email_outbox, auth_headers, event_log: EventLog
) -> None:
    support = await create_user(db, role="support")
    guest, h = await _guest(client)
    device = {"X-Device-Id": "device-abc-123"}

    r = await client.post(
        f"{API}/guest/consultation",
        json={"verification_id": "00000000-0000-0000-0000-000000000000", "full_name": "Amina Bello"},
        headers=h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "contact_not_verified"

    vid = await _verified(client, h, run_jobs, email_outbox, "amina@example.test")
    preferred_from = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    preferred_to = (datetime.now(UTC) + timedelta(days=1, hours=4)).isoformat()
    r = await client.post(
        f"{API}/guest/consultation",
        json={
            "verification_id": vid,
            "full_name": "Amina Bello",
            "preferred_from": preferred_from,
            "preferred_to": preferred_to,
            "timezone": "Africa/Lagos",
            "question": "Is knee replacement right for me?",
        },
        headers={**h, **device},
    )
    assert r.status_code == 201, r.text
    intro = r.json()
    assert intro["status"] == "requested" and intro["kind"] == "free_intro" and intro["duration_min"] == 15
    assert intro["meeting_url"] is None and intro["contact_masked"] == "a***@example.test"
    assert event_log.of("intro_consultation.requested")[0]["intro_consultation_id"] == intro["id"]
    staff_note = (
        (await db.execute(select(Notification).where(Notification.user_id == support.id))).scalars().first()
    )
    assert staff_note is not None and staff_note.kind == "intro_consultation.requested"

    # the verification cannot be reused; the same contact / device cannot get another one
    r = await client.post(
        f"{API}/guest/consultation", json={"verification_id": vid, "full_name": "Amina"}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "verification_expired"
    _, h2 = await _guest(client)
    vid2 = await _verified(client, h2, run_jobs, email_outbox, "AMINA@example.test")
    r = await client.post(
        f"{API}/guest/consultation", json={"verification_id": vid2, "full_name": "Amina"}, headers=h2
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "free_consultation_used"
    _, h3 = await _guest(client)
    vid3 = await _verified(client, h3, run_jobs, email_outbox, "someone.else@example.test")
    r = await client.post(
        f"{API}/guest/consultation",
        json={"verification_id": vid3, "full_name": "Someone"},
        headers={**h3, **device},
    )
    assert r.status_code == 409

    r = await client.get(f"{API}/guest/consultation", headers=h)
    assert r.status_code == 200 and r.json()["id"] == intro["id"]
    assert (await client.get(f"{API}/guest/consultation", headers=h3)).status_code == 404

    # coordinators list and schedule (Jitsi link generated)
    s_h = auth_headers(support)
    r = await client.get(f"{API}/admin/intro-consultations", headers=s_h)
    assert r.status_code == 200, r.text
    listed = r.json()["items"]
    assert [i["id"] for i in listed] == [intro["id"]]
    assert listed[0]["contact"] == "amina@example.test" and listed[0]["is_guest"] is True
    assert listed[0]["question"] == "Is knee replacement right for me?"
    assert (await client.get(f"{API}/admin/intro-consultations", headers=h)).status_code == 403

    when = datetime.now(UTC) + timedelta(hours=20)
    r = await client.patch(
        f"{API}/admin/intro-consultations/{intro['id']}", json={"scheduled_at": when.isoformat()}, headers=s_h
    )
    assert r.status_code == 200, r.text
    scheduled = r.json()
    assert scheduled["status"] == "scheduled" and scheduled["meeting_url"].startswith(
        "https://meet.jit.si/hig-intro-"
    )
    assert scheduled["coordinator_user_id"] == str(support.id)
    await run_jobs()
    assert any(
        "Your free call is booked" in m["subject"] or "free call" in m["subject"] for m in email_outbox
    )
    guest_view = (await client.get(f"{API}/guest/consultation", headers=h)).json()
    assert guest_view["meeting_url"] == scheduled["meeting_url"] and guest_view["coordinator_name"]

    # 24 h reminder for the intro call
    assert await run_consultation_reminders(db) == 1
    await db.commit()
    reminder = event_log.of("consultation.reminder")[0]
    assert reminder["kind"] == "free_intro" and reminder["intro_consultation_id"] == intro["id"]

    # upgrading keeps the same user: the intro call, screenings etc. stay with the account
    r = await client.post(
        f"{API}/auth/guest/upgrade",
        json={
            "email": "amina.bello@example.test",
            "password": PASSWORD,
            "full_name": "Amina Bello",
            "is_adult": True,
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    upgraded = r.json()
    assert upgraded["user"]["id"] == guest["user"]["id"]
    r = await client.get(f"{API}/guest/consultation", headers={**MOBILE, **bearer(upgraded)})
    assert r.status_code == 200 and r.json()["id"] == intro["id"]
    row = await db.get(IntroConsultation, intro["id"])
    assert str(row.user_id) == guest["user"]["id"]
