"""Store-compliance features: journey events published by the services (CG-30), push notifications through
FCM (CG-15), content reports + moderation (CG-16), adult attestation at sign-up (CG-24) and the website's
contact enquiries."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
import respx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import func, select

from app.core.config import settings
from app.core.enums import ConsentKind
from app.models import (
    BackgroundJob,
    Consent,
    ContentReport,
    Conversation,
    ConversationParticipant,
    DeviceToken,
    Installment,
    Message,
    Notification,
    Quote,
    Screening,
    SettlementItem,
    SiteEnquiry,
    User,
)
from app.modules.cases.common import today_ist
from app.modules.cases.service import expire_quotes
from app.modules.messaging import push
from app.modules.messaging.notifications import notify
from app.modules.payments.service import publish_installment_reminders
from app.modules.settlements import service as settlements_service
from tests.factories import create_booking, create_case, create_quote, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    event_log_fixture,
    make_world,
)
from tests.modules.messaging_helpers import build_case_world

API = "/api/v1"
PASSWORD = "Str0ng!Passw0rd-2026"


# ============================================================================== journey events (CG-30)
async def test_reject_quote_publishes_quote_rejected(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, status="quoted")
    quote = await create_quote(db, case)
    r = await client.post(
        f"{API}/cases/{case.id}/quotes/{quote.id}/reject",
        json={"reason": "Too far from home"},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 200, r.text
    [payload] = event_log.of("quote.rejected")
    assert payload["quote_id"] == str(quote.id) and payload["reason"] == "Too far from home"


async def test_expire_quotes_publishes_quote_expired(db, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, status="quoted")
    stale = await create_quote(db, case, valid_until=today_ist() - timedelta(days=1))
    await create_quote(db, case, valid_until=today_ist() + timedelta(days=5))
    assert await expire_quotes(db) == 1
    await db.commit()
    assert [p["quote_id"] for p in event_log.of("quote.expired")] == [str(stale.id)]
    hospital_notes = (
        (await db.execute(select(Notification).where(Notification.kind == "quote.expired"))).scalars().all()
    )
    assert {n.user_id for n in hospital_notes} >= {world.hospital_user.id, world.patient_user.id}


async def test_consultation_updates_publish_events(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, doctor_id=world.doctor.id)
    p_h, h_h = auth_headers(world.patient_user), auth_headers(world.hospital_user)
    r = await client.post(
        f"{API}/consultations", json={"case_id": str(case.id), "mode": "video"}, headers=p_h
    )
    assert r.status_code == 201, r.text
    url = f"{API}/consultations/{r.json()['id']}"
    when = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    later = (datetime.now(UTC) + timedelta(days=4)).isoformat()
    body = {"status": "scheduled", "scheduled_at": when, "meeting_url": "https://meet.example.test/abc"}
    assert (await client.patch(url, json=body, headers=h_h)).status_code == 200
    assert (await client.patch(url, json={"notes": "Bring reports"}, headers=h_h)).status_code == 200
    assert (await client.patch(url, json={"scheduled_at": later}, headers=h_h)).status_code == 200
    assert (await client.patch(url, json={"status": "cancelled"}, headers=p_h)).status_code == 200
    assert len(event_log.of("consultation.scheduled")) == 1
    assert len(event_log.of("consultation.rescheduled")) == 1  # the notes-only change is not an event
    [cancelled] = event_log.of("consultation.cancelled")
    assert cancelled["actor_user_id"] == str(world.patient_user.id)
    patient_notes = (
        (await db.execute(select(Notification.kind).where(Notification.user_id == world.patient_user.id)))
        .scalars()
        .all()
    )
    assert {"consultation.scheduled", "consultation.rescheduled"} <= set(patient_notes)


async def test_travel_updates_publish_status_changed(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, status="booked")
    staff = auth_headers(world.staff_user)
    r = await client.post(
        f"{API}/travel/visa-requests",
        json={"case_id": str(case.id)},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 201, r.text
    url = f"{API}/travel/visa-requests/{r.json()['id']}"
    assert (await client.patch(url, json={"status": "applied"}, headers=staff)).status_code == 200
    assert (await client.patch(url, json={"notes": "Waiting"}, headers=staff)).status_code == 200
    assert (await client.patch(url, json={"status": "approved"}, headers=staff)).status_code == 200
    events = event_log.of("travel.status_changed")
    assert [(e["from_status"], e["to_status"]) for e in events] == [
        ("documents_pending", "applied"),
        ("applied", "approved"),
    ]
    assert events[0]["item_type"] == "visa" and events[0]["case_id"] == str(case.id)
    note = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.kind == "travel.status_changed",
                    Notification.user_id == world.patient_user.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert any("approved" in (n.body or "") for n in note)


async def test_generate_batch_publishes_pending_approval(db, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, status="completed")
    booking = await create_booking(db, case, status="completed")
    db.add(
        SettlementItem(
            payee_type="hospital",
            payee_id=world.hospital.id,
            booking_id=booking.id,
            gross_minor=1_00_000_00,
            commission_minor=15_000_00,
            tax_minor=2_700_00,
            tds_minor=100_00,
            net_minor=1_00_000_00 - 15_000_00 - 2_700_00 - 100_00,
            status="eligible",
            eligible_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await db.commit()
    maker = await create_user(db, role="finance")
    checker = await create_user(db, role="finance")
    batch = await settlements_service.generate_batch(db, actor=maker, payee_type="hospital")
    await db.commit()
    [payload] = event_log.of("settlement_batch.pending_approval")
    assert payload["batch_id"] == str(batch.id) and payload["created_by"] == str(maker.id)
    notified = (
        (
            await db.execute(
                select(Notification.user_id).where(Notification.kind == "settlement_batch.pending_approval")
            )
        )
        .scalars()
        .all()
    )
    assert set(notified) == {checker.id}


async def test_installment_reminder_job_publishes_due_and_overdue(db, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, status="booked")
    booking = await create_booking(db, case, status="confirmed")
    today = date(2026, 12, 10)
    plan = {
        2: (today + timedelta(days=3), "due"),  # reminder lead (default 3 days)
        3: (today, "due"),  # due today
        4: (today + timedelta(days=1), "due"),  # no reminder
        5: (today - timedelta(days=1), "overdue"),  # 1 day overdue
        6: (today - timedelta(days=8), "overdue"),  # 8 days overdue (weekly repeat)
        7: (today - timedelta(days=3), "overdue"),  # 3 days overdue: quiet day
        8: (today - timedelta(days=1), "paid"),
    }
    rows = {}
    for seq, (due, status) in plan.items():
        rows[seq] = Installment(
            booking_id=booking.id,
            seq=seq,
            due_date=due,
            amount_minor=10_000_00,
            currency="INR",
            status=status,
        )
        db.add(rows[seq])
    await db.commit()
    assert await publish_installment_reminders(db, today) == 4
    await db.commit()
    due_ids = {p["installment_id"] for p in event_log.of("installment.due")}
    overdue_ids = {p["installment_id"] for p in event_log.of("installment.overdue")}
    assert due_ids == {str(rows[2].id), str(rows[3].id)}
    assert overdue_ids == {str(rows[5].id), str(rows[6].id)}
    # Running again the same day publishes again but notifies nobody twice.
    await publish_installment_reminders(db, today)
    await db.commit()
    count = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.kind.in_(["installment.due", "installment.overdue"]))
        )
    ).scalar_one()
    assert count == 4  # four instalments x the patient (no agent on this case)


# ======================================================================================= push (CG-15)
def _service_account_json() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    return json.dumps(
        {
            "type": "service_account",
            "client_email": "push@hig-test.iam.gserviceaccount.com",
            "private_key": pem,
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    )


@pytest.fixture
def fcm_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FCM_PROJECT_ID", "hig-test")
    monkeypatch.setattr(settings, "FCM_SERVICE_ACCOUNT_JSON", _service_account_json())
    push.reset_token_cache()


async def test_device_endpoints_register_move_and_remove(db, client, auth_headers) -> None:
    alice = await create_user(db, role="patient")
    bob = await create_user(db, role="agent")
    alice_id, bob_id = alice.id, bob.id
    alice_h, bob_h = auth_headers(alice), auth_headers(bob)
    body = {"platform": "android", "token": "fcm-token-abcdef-1", "app_version": "1.0.0+1"}
    r = await client.post(f"{API}/notifications/devices", json=body, headers=alice_h)
    assert r.status_code == 204, r.text
    device = (await db.execute(select(DeviceToken))).scalar_one()
    assert device.user_id == alice_id and device.app_version == "1.0.0+1" and device.revoked_at is None
    # The same physical device signs in as someone else: the token moves.
    r = await client.post(f"{API}/notifications/devices", json={**body, "platform": "ios"}, headers=bob_h)
    assert r.status_code == 204
    device = (await db.execute(select(DeviceToken).execution_options(populate_existing=True))).scalar_one()
    assert device.user_id == bob_id and str(device.platform.value) == "ios"
    r = await client.post(f"{API}/notifications/devices", json={"platform": "fax", "token": "x" * 10})
    assert r.status_code == 401
    r = await client.delete(f"{API}/notifications/devices", params={"token": body["token"]}, headers=alice_h)
    assert r.status_code == 204 and (await db.execute(select(func.count(DeviceToken.id)))).scalar_one() == 1
    r = await client.delete(f"{API}/notifications/devices", params={"token": body["token"]}, headers=bob_h)
    assert r.status_code == 204 and (await db.execute(select(func.count(DeviceToken.id)))).scalar_one() == 0


async def _push_jobs(db) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(BackgroundJob).where(BackgroundJob.task_name == push.PUSH_TASK)
        )
    ).scalar_one()


async def test_push_disabled_when_not_configured(db) -> None:
    user = await create_user(db, role="patient")
    db.add(DeviceToken(user_id=user.id, platform="android", token="fcm-token-unconfigured"))
    await db.commit()
    assert not push.push_configured()
    await notify(db, user.id, "quote.sent", "New quote", "Details")
    await db.commit()
    assert await _push_jobs(db) == 0


async def test_push_sends_generic_text_and_drops_dead_tokens(db, run_jobs, fcm_configured) -> None:
    user = await create_user(db, role="patient")
    no_device = await create_user(db, role="patient")
    user_id, no_device_id = user.id, no_device.id
    good, dead, bad = "fcm-token-good-0001", "fcm-token-dead-0002", "fcm-token-bad-0003"
    db.add_all(
        [
            DeviceToken(user_id=user_id, platform="android", token=good),
            DeviceToken(user_id=user_id, platform="ios", token=dead),
            DeviceToken(user_id=user_id, platform="ios", token=bad),
        ]
    )
    await db.commit()
    await notify(
        db,
        user_id,
        "screening.completed",
        "Your screening results are ready",
        "Possible knee osteoarthritis",
        {"link": "/screening/abc/matches"},
    )
    await notify(db, no_device_id, "quote.sent", "New quote", "Details")
    await db.commit()
    assert await _push_jobs(db) == 1  # only the user with a device

    sent: list[dict[str, Any]] = []

    def fcm_send(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        sent.append(payload)
        token = payload["message"]["token"]
        assert request.headers["Authorization"] == "Bearer oauth-access-1"
        if token == dead:
            return httpx.Response(
                404, json={"error": {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}}
            )
        if token == bad:
            return httpx.Response(400, json={"error": {"status": "INVALID_ARGUMENT"}})
        return httpx.Response(200, json={"name": "projects/hig-test/messages/1"})

    with respx.mock(assert_all_called=True) as mock:
        oauth = mock.post("https://oauth2.googleapis.com/token").mock(
            return_value=httpx.Response(200, json={"access_token": "oauth-access-1", "expires_in": 3600})
        )
        mock.post("https://fcm.googleapis.com/v1/projects/hig-test/messages:send").mock(side_effect=fcm_send)
        await run_jobs()
    assert oauth.call_count == 1  # cached across devices
    assert len(sent) == 3
    for message in sent:
        text = json.dumps(message)
        assert "knee" not in text and "osteoarthritis" not in text and "results are ready" not in text
        assert message["message"]["notification"] == {
            "title": "Heal India Global",
            "body": "You have an update on your case.",
        }
        assert message["message"]["data"]["kind"] == "screening.completed"
        assert message["message"]["data"]["link"] == "/screening/abc/matches"
    db.expire_all()
    tokens = {d.token: d for d in (await db.execute(select(DeviceToken))).scalars().all()}
    assert dead not in tokens  # unregistered -> deleted
    assert tokens[bad].revoked_at is not None  # invalid -> revoked
    assert tokens[good].revoked_at is None
    note = (await db.execute(select(Notification).where(Notification.user_id == user_id))).scalar_one()
    assert "pushed_devices" in note.data
    r_out = push.push_data(note)
    assert set(r_out) == {"kind", "notification_id", "link"}


def test_push_body_never_contains_details() -> None:
    assert push.push_body_for("message.created") == "You have a new message."
    assert push.push_body_for("installment.overdue") == "You have an update about a payment."
    assert push.push_body_for("sos.created").startswith("You have an urgent update")
    assert push.push_body_for("case.declined") == "You have an update on your case."


# ================================================================================ reports (CG-16)
async def _chat(db, world) -> tuple[Conversation, Message]:
    conversation = Conversation(kind="case", case_id=world.case.id)
    db.add(conversation)
    await db.flush()
    for uid in (world.patient_user.id, world.owner.id, world.agent_user.id):
        db.add(ConversationParticipant(conversation_id=conversation.id, user_id=uid))
    message = Message(conversation_id=conversation.id, sender_user_id=world.owner.id, body="Rude words here")
    db.add(message)
    await db.commit()
    return conversation, message


async def test_report_message_and_hide_it(db, client, auth_headers) -> None:
    world = await build_case_world(db)
    support = await create_user(db, role="support")
    outsider = await create_user(db, role="patient")
    conversation, message = await _chat(db, world)
    body = {"target_type": "message", "target_id": str(message.id), "reason": "abusive", "note": "  Rude  "}

    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(outsider))
    assert r.status_code == 404
    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(world.owner))
    assert r.status_code == 400 and r.json()["error"]["code"] == "cannot_report_own"
    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(world.patient_user))
    assert r.status_code == 201, r.text
    report = r.json()
    assert report["status"] == "open" and report["note"] == "Rude"
    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(world.patient_user))
    assert r.status_code == 201 and r.json()["id"] == report["id"]  # same open report
    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(world.agent_user))
    assert r.status_code == 201 and r.json()["id"] != report["id"]
    queue_notes = (
        (await db.execute(select(Notification).where(Notification.kind == "moderation.report_created")))
        .scalars()
        .all()
    )
    assert {n.user_id for n in queue_notes} == {support.id}  # one per reported item

    # Moderation queue (staff only).
    r = await client.get(f"{API}/admin/reports", headers=auth_headers(world.patient_user))
    assert r.status_code == 403
    staff = auth_headers(support)
    r = await client.get(f"{API}/admin/reports", headers=staff)
    assert r.status_code == 200 and r.json()["total"] == 2
    item = r.json()["items"][0]
    assert item["excerpt"] == "Rude words here" and item["report_count"] == 2
    assert item["target_user"]["id"] == str(world.owner.id)
    assert item["conversation_id"] == str(conversation.id)
    # The fixed admin report routes still win over /admin/reports/{id}.
    admin = await create_user(db, role="admin")
    r = await client.get(f"{API}/admin/reports/cases", headers=auth_headers(admin))
    assert r.status_code == 200, r.text

    r = await client.post(
        f"{API}/admin/reports/{report['id']}/resolve", json={"action": "hide_message"}, headers=staff
    )
    assert r.status_code == 200, r.text
    resolved = r.json()
    assert resolved["status"] == "actioned" and resolved["message_hidden"] is True
    assert resolved["resolved_by"]["id"] == str(support.id)
    r = await client.get(f"{API}/admin/reports", params={"status": "open"}, headers=staff)
    assert r.json()["total"] == 0  # the second report on the same message was closed too
    r = await client.post(
        f"{API}/admin/reports/{report['id']}/resolve", json={"action": "dismiss"}, headers=staff
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_resolved"

    # Hidden for others, visible (flagged) to the sender and to staff.
    url = f"{API}/conversations/{conversation.id}/messages"
    r = await client.get(url, headers=auth_headers(world.patient_user))
    assert r.status_code == 200 and r.json() == []
    r = await client.get(url, headers=auth_headers(world.owner))
    assert [m["hidden"] for m in r.json()] == [True]
    r = await client.get(f"{API}/conversations", headers=auth_headers(world.patient_user))
    assert r.json()[0]["last_message"] is None


async def test_warn_and_suspend_message_author(db, client, auth_headers) -> None:
    world = await build_case_world(db)
    support = await create_user(db, role="support")
    _conversation, message = await _chat(db, world)
    body = {"target_type": "message", "target_id": str(message.id), "reason": "abusive"}
    first = (await client.post(f"{API}/reports", json=body, headers=auth_headers(world.patient_user))).json()
    r = await client.post(
        f"{API}/admin/reports/{first['id']}/resolve",
        json={"action": "warn", "note": "First warning"},
        headers=auth_headers(support),
    )
    assert r.status_code == 200 and r.json()["action"] == "warn"
    warning = (
        await db.execute(select(Notification).where(Notification.kind == "moderation.warning"))
    ).scalar_one()
    assert warning.user_id == world.owner.id

    second = (await client.post(f"{API}/reports", json=body, headers=auth_headers(world.agent_user))).json()
    r = await client.post(
        f"{API}/admin/reports/{second['id']}/resolve",
        json={"action": "suspend"},
        headers=auth_headers(support),
    )
    assert r.status_code == 200, r.text
    owner_id = world.owner.id
    db.expire_all()
    owner = await db.get(User, owner_id)
    assert owner is not None and str(owner.status.value) == "suspended"


async def test_report_ai_results_and_invalid_actions(db, client, auth_headers) -> None:
    world = await build_case_world(db)
    support = await create_user(db, role="support")
    screening = Screening(
        patient_id=world.patient.id,
        status="completed",
        ai_result={"summary": "Possible knee osteoarthritis."},
    )
    db.add(screening)
    await db.commit()
    body = {"target_type": "screening_result", "target_id": str(screening.id), "reason": "inaccurate"}
    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(await create_user(db)))
    assert r.status_code == 404
    r = await client.post(f"{API}/reports", json=body, headers=auth_headers(world.patient_user))
    assert r.status_code == 201, r.text
    report_id = r.json()["id"]
    detail = (await client.get(f"{API}/admin/reports/{report_id}", headers=auth_headers(support))).json()
    assert detail["excerpt"] == "Possible knee osteoarthritis." and detail["target_user"] is None
    for action in ("hide_message", "warn", "suspend"):
        r = await client.post(
            f"{API}/admin/reports/{report_id}/resolve", json={"action": action}, headers=auth_headers(support)
        )
        assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_action", action
    r = await client.post(
        f"{API}/admin/reports/{report_id}/resolve", json={"action": "dismiss"}, headers=auth_headers(support)
    )
    assert r.status_code == 200 and r.json()["status"] == "dismissed"
    assert (await db.execute(select(func.count(ContentReport.id)))).scalar_one() == 1


# ======================================================================== adult attestation (CG-24)
def _register_body(role: str = "patient", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "email": f"{role}.age@example.test",
        "password": PASSWORD,
        "full_name": "Sam Doe",
        "role": role,
        "accept_terms": True,
    }
    if role == "agent":
        body["agency_name"] = "Teen Travel"
    body.update(overrides)
    return body


async def test_register_requires_age_answer(db, client) -> None:
    r = await client.post(f"{API}/auth/register", json=_register_body())
    assert r.status_code == 422
    r = await client.post(f"{API}/auth/register", json=_register_body("agent", is_adult=False))
    assert r.status_code == 422
    r = await client.post(f"{API}/auth/register", json=_register_body("agent", is_adult=True))
    assert r.status_code in (200, 201), r.text
    assert r.json()["user"]["is_adult"] is True and r.json()["user"]["guardian_consent_required"] is False
    consent = (await db.execute(select(Consent).where(Consent.kind == ConsentKind.AGE_18_PLUS))).scalar_one()
    assert consent.granted is True


async def test_minor_patient_is_flagged_for_guardian_consent(db, client) -> None:
    r = await client.post(f"{API}/auth/register", json=_register_body(is_adult=False))
    assert r.status_code in (200, 201), r.text
    out = r.json()["user"]
    assert out["is_adult"] is False and out["guardian_consent_required"] is True
    user = await db.get(User, out["id"])
    assert user is not None and user.is_adult is False
    consent = (await db.execute(select(Consent).where(Consent.kind == ConsentKind.AGE_18_PLUS))).scalar_one()
    assert consent.granted is False


# =============================================================================== website enquiries
async def test_site_enquiry_stored_notified_and_honeypot(db, client, auth_headers, run_jobs) -> None:
    support = await create_user(db, role="support")
    body = {
        "name": " Amara Okafor ",
        "email": "Amara@Example.com",
        "phone": "+234 800 000 0000",
        "country": "Nigeria",
        "topic": "patient",
        "message": "I need a knee replacement quote.",
        "website": "",
    }
    r = await client.post(f"{API}/site/enquiries", json=body)
    assert r.status_code == 202 and r.json() == {"status": "received"}
    r = await client.post(f"{API}/site/enquiries", json={**body, "website": "http://spam.example"})
    assert r.status_code == 202
    r = await client.post(f"{API}/site/enquiries", json={**body, "message": "   "})
    assert r.status_code == 422
    rows = (await db.execute(select(SiteEnquiry))).scalars().all()
    assert len(rows) == 1 and rows[0].name == "Amara Okafor" and rows[0].email == "amara@example.com"
    note = (
        await db.execute(select(Notification).where(Notification.kind == "site_enquiry.created"))
    ).scalar_one()
    assert note.user_id == support.id and "knee" not in (note.body or "")

    staff = auth_headers(support)
    r = await client.get(f"{API}/admin/enquiries", headers=staff)
    assert r.status_code == 200 and r.json()["total"] == 1
    enquiry_id = r.json()["items"][0]["id"]
    r = await client.patch(f"{API}/admin/enquiries/{enquiry_id}", json={"status": "closed"}, headers=staff)
    assert r.status_code == 200 and r.json()["status"] == "closed"
    assert r.json()["handled_by"]["id"] == str(support.id)
    r = await client.get(f"{API}/admin/enquiries", params={"status": "new"}, headers=staff)
    assert r.json()["total"] == 0
    patient = await create_user(db, role="patient")
    r = await client.get(f"{API}/admin/enquiries", headers=auth_headers(patient))
    assert r.status_code == 403


# ===================================================================== store review accounts (CG-06)
async def test_review_accounts_seed_is_idempotent_and_hidden(db, client) -> None:
    from scripts.seed_review_accounts import credentials_from_env, seed_review_accounts
    from tests.modules.auth_helpers import login

    with pytest.raises(SystemExit):
        credentials_from_env({"REVIEW_PATIENT_PASSWORD": "x"})
    env = {
        "REVIEW_PATIENT_PASSWORD": "Review!Patient-2026x",
        "REVIEW_AGENT_PASSWORD": "Review!Agent-2026xy",
        "REVIEW_HOSPITAL_PASSWORD": "Review!Hospital-2026",
        "REVIEW_PATIENT_EMAIL": "review.patient@example.test",
        "REVIEW_AGENT_EMAIL": "review.agent@example.test",
        "REVIEW_HOSPITAL_EMAIL": "review.hospital@example.test",
    }
    creds = credentials_from_env(env)
    first = await seed_review_accounts(db, creds)
    second = await seed_review_accounts(db, creds)
    assert first["cases"] == second["cases"] and len(first["cases"]) == 3
    for role in ("patient", "agent", "hospital"):
        r = await login(client, env[f"REVIEW_{role.upper()}_EMAIL"], env[f"REVIEW_{role.upper()}_PASSWORD"])
        assert r.status_code == 200, (role, r.text)
        user = r.json()["user"]
        assert user["mfa_enabled"] is False and user["is_adult"] is True
    # Hidden from the public catalog: the review hospital is not listed.
    r = await client.get(f"{API}/hospitals", params={"q": "App Review"})
    assert r.status_code == 200
    assert all("App Review" not in h.get("name", "") for h in r.json().get("items", []))
    quotes = (
        await db.execute(select(func.count()).select_from(Quote).where(Quote.status == "sent"))
    ).scalar_one()
    assert quotes == 2
