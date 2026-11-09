"""Conversations, messages and notifications API (PLAN 8.9)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.events import publish
from app.models import Conversation, ConversationParticipant, Message, Notification
from app.modules.messaging.notifications import notify
from tests.factories import create_patient, create_user
from tests.modules.messaging_helpers import API, build_case_world, make_document


async def _case_conversation(client, auth_headers, world) -> dict:
    r = await client.post(
        f"{API}/conversations", json={"case_id": str(world.case.id)}, headers=auth_headers(world.patient_user)
    )
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------------------------------- case conversations
async def test_case_created_event_creates_conversation_once(db, client, auth_headers):
    world = await build_case_world(db)
    payload = {
        "case_id": str(world.case.id),
        "hospital_id": str(world.hospital.id),
        "patient_id": str(world.patient.id),
        "agent_id": str(world.agent.id),
    }
    await publish(db, "case.created", payload)
    await db.commit()
    await publish(db, "case.created", payload)  # idempotent
    await db.commit()

    convs = (
        (await db.execute(select(Conversation).where(Conversation.case_id == world.case.id))).scalars().all()
    )
    assert len(convs) == 1
    assert convs[0].subject == f"Case {world.case.case_number}"
    members = set(
        (
            await db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == convs[0].id
                )
            )
        ).scalars()
    )
    assert members == {
        world.patient_user.id,
        world.agent_user.id,
        world.owner.id,
        world.coordinator_member.id,
    }

    notes = (
        (await db.execute(select(Notification).where(Notification.kind == "case.created"))).scalars().all()
    )
    assert {n.user_id for n in notes} == {world.owner.id, world.coordinator_member.id}
    assert all(world.case.case_number in n.title for n in notes)

    # Every party sees the conversation in their list.
    for user in (world.patient_user, world.agent_user, world.owner):
        r = await client.get(f"{API}/conversations", headers=auth_headers(user))
        assert r.status_code == 200, r.text
        assert [c["id"] for c in r.json()] == [str(convs[0].id)]
        assert r.json()[0]["kind"] == "case"
        assert r.json()[0]["case_number"] == world.case.case_number


async def test_case_conversation_access_is_scoped(db, client, auth_headers):
    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    outsider = await create_user(db, role="patient")
    await create_patient(db, user=outsider)
    other_hospital_user = await create_user(db, role="hospital")

    for user in (outsider, other_hospital_user):
        h = auth_headers(user)
        assert (await client.get(f"{API}/conversations/{conv['id']}/messages", headers=h)).status_code == 404
        r = await client.post(f"{API}/conversations/{conv['id']}/messages", json={"body": "hi"}, headers=h)
        assert r.status_code == 404
        assert (await client.post(f"{API}/conversations/{conv['id']}/read", headers=h)).status_code == 404
        r = await client.post(f"{API}/conversations", json={"case_id": str(world.case.id)}, headers=h)
        assert r.status_code == 404
        assert (await client.get(f"{API}/conversations", headers=h)).json() == []

    # Unauthenticated.
    assert (await client.get(f"{API}/conversations")).status_code == 401

    # Staff may read any conversation.
    support = await create_user(db, role="support")
    r = await client.get(f"{API}/conversations/{conv['id']}/messages", headers=auth_headers(support))
    assert r.status_code == 200


async def test_case_conversation_participant_validation(db, client, auth_headers):
    world = await build_case_world(db)
    stranger = await create_user(db, role="patient")
    r = await client.post(
        f"{API}/conversations",
        json={"case_id": str(world.case.id), "participant_user_ids": [str(stranger.id)]},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_participants"

    support = await create_user(db, role="support")
    r = await client.post(
        f"{API}/conversations",
        json={"case_id": str(world.case.id), "participant_user_ids": [str(support.id)]},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 201, r.text
    ids = {p["user_id"] for p in r.json()["participants"]}
    assert str(support.id) in ids and str(world.owner.id) in ids
    # Re-posting returns the same conversation.
    again = await _case_conversation(client, auth_headers, world)
    assert again["id"] == r.json()["id"]


async def test_new_hospital_member_joins_case_conversation_on_access(db, client, auth_headers):
    from app.core.enums import HospitalMemberRole
    from app.models import HospitalMember

    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    newcomer = await create_user(db, role="hospital")
    db.add(
        HospitalMember(
            hospital_id=world.hospital.id, user_id=newcomer.id, member_role=HospitalMemberRole.ADMIN
        )
    )
    await db.commit()
    r = await client.post(
        f"{API}/conversations/{conv['id']}/messages",
        json={"body": "Hello from admin"},
        headers=auth_headers(newcomer),
    )
    assert r.status_code == 201, r.text
    r = await client.get(f"{API}/conversations", headers=auth_headers(newcomer))
    assert [c["id"] for c in r.json()] == [conv["id"]]


# ------------------------------------------------------------------------------------------------- messages
async def test_send_messages_unread_counts_and_read(db, client, auth_headers):
    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    hp = auth_headers(world.patient_user)
    ho = auth_headers(world.owner)

    r = await client.post(
        f"{API}/conversations/{conv['id']}/messages", json={"body": "  Hello doctor  "}, headers=hp
    )
    assert r.status_code == 201, r.text
    msg = r.json()
    assert msg["body"] == "Hello doctor"
    assert msg["sender"]["id"] == str(world.patient_user.id)
    assert msg["sender"]["role"] == "patient"
    await client.post(f"{API}/conversations/{conv['id']}/messages", json={"body": "Second"}, headers=hp)

    owner_view = (await client.get(f"{API}/conversations", headers=ho)).json()[0]
    assert owner_view["unread_count"] == 2
    assert owner_view["last_message"]["body"] == "Second"
    assert owner_view["last_message_at"] is not None
    patient_view = (await client.get(f"{API}/conversations", headers=hp)).json()[0]
    assert patient_view["unread_count"] == 0

    # One collapsed message notification per conversation for the hospital owner.
    notes = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.user_id == world.owner.id, Notification.kind == "message.created"
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(notes) == 1
    assert notes[0].body == "Second"
    assert notes[0].data["conversation_id"] == conv["id"]
    # The sender gets no message notification.
    count = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == world.patient_user.id, Notification.kind == "message.created")
        )
    ).scalar_one()
    assert count == 0

    note_id = notes[0].id
    r = await client.post(f"{API}/conversations/{conv['id']}/read", headers=ho)
    assert r.status_code == 204
    assert (await client.get(f"{API}/conversations", headers=ho)).json()[0]["unread_count"] == 0
    db.expire_all()
    note = await db.get(Notification, note_id)
    assert note is not None and note.read_at is not None

    # A reply makes it unread for the patient.
    await client.post(f"{API}/conversations/{conv['id']}/messages", json={"body": "We can help"}, headers=ho)
    assert (await client.get(f"{API}/conversations", headers=hp)).json()[0]["unread_count"] == 1


async def test_message_validation(db, client, auth_headers):
    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    h = auth_headers(world.patient_user)
    url = f"{API}/conversations/{conv['id']}/messages"
    r = await client.post(url, json={"body": "   "}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "empty_message"
    r = await client.post(url, json={"body": "x" * 5001}, headers=h)
    assert r.status_code == 422
    r = await client.post(url, json={"body": "hi", "extra": 1}, headers=h)
    assert r.status_code == 422


async def test_message_keyset_pagination(db, client, auth_headers):
    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    base = datetime.now(UTC) - timedelta(hours=1)
    for i in range(5):
        db.add(
            Message(
                conversation_id=conv["id"],
                sender_user_id=world.patient_user.id,
                body=f"m{i}",
                created_at=base + timedelta(minutes=i),
                updated_at=base + timedelta(minutes=i),
            )
        )
    await db.commit()
    h = auth_headers(world.owner)
    url = f"{API}/conversations/{conv['id']}/messages"
    page1 = (await client.get(url, params={"limit": 2}, headers=h)).json()
    assert [m["body"] for m in page1] == ["m3", "m4"]
    page2 = (await client.get(url, params={"limit": 2, "before": page1[0]["id"]}, headers=h)).json()
    assert [m["body"] for m in page2] == ["m1", "m2"]
    page3 = (await client.get(url, params={"limit": 2, "before": page2[0]["id"]}, headers=h)).json()
    assert [m["body"] for m in page3] == ["m0"]
    by_time = (
        await client.get(url, params={"before": (base + timedelta(minutes=2)).isoformat()}, headers=h)
    ).json()
    assert [m["body"] for m in by_time] == ["m0", "m1"]
    r = await client.get(url, params={"before": "not-a-cursor"}, headers=h)
    assert r.status_code == 400
    r = await client.get(url, params={"limit": 101}, headers=h)
    assert r.status_code == 422


async def test_attachments_must_be_accessible(db, client, auth_headers):
    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    url = f"{API}/conversations/{conv['id']}/messages"
    own = await make_document(db, world.patient_user, patient_id=world.patient.id)
    case_doc = await make_document(db, world.owner, case_id=world.case.id, hospital_id=world.hospital.id)
    stranger = await create_user(db, role="patient")
    foreign = await make_document(db, stranger)

    r = await client.post(
        url,
        json={"body": "my reports", "attachment_document_ids": [str(own.id), str(case_doc.id)]},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 201, r.text
    assert set(r.json()["attachment_document_ids"]) == {str(own.id), str(case_doc.id)}

    r = await client.post(
        url,
        json={"body": "", "attachment_document_ids": [str(foreign.id)]},
        headers=auth_headers(world.patient_user),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_attachment"

    # The agent may attach documents of a patient it manages;
    # the hospital may not attach the patient's own document.
    r = await client.post(
        url,
        json={"body": "", "attachment_document_ids": [str(own.id)]},
        headers=auth_headers(world.agent_user),
    )
    assert r.status_code == 201, r.text
    r = await client.post(
        url, json={"body": "x", "attachment_document_ids": [str(own.id)]}, headers=auth_headers(world.owner)
    )
    assert r.status_code == 400


# ------------------------------------------------------------------------------------ support conversations
async def test_support_conversation_flow(db, client, auth_headers):
    patient_user = await create_user(db, role="patient")
    await create_patient(db, user=patient_user)
    support = await create_user(db, role="support")
    other_patient = await create_user(db, role="patient")

    r = await client.post(
        f"{API}/conversations", json={"subject": "Visa question"}, headers=auth_headers(patient_user)
    )
    assert r.status_code == 201, r.text
    conv = r.json()
    assert conv["kind"] == "support" and conv["subject"] == "Visa question" and conv["case_id"] is None
    assert [p["user_id"] for p in conv["participants"]] == [str(patient_user.id)]

    # Support staff are notified and see it without being a participant.
    note = (await db.execute(select(Notification).where(Notification.user_id == support.id))).scalar_one()
    assert note.kind == "support.conversation_created"
    listed = (await client.get(f"{API}/conversations", headers=auth_headers(support))).json()
    assert [c["id"] for c in listed] == [conv["id"]]

    r = await client.post(
        f"{API}/conversations/{conv['id']}/messages",
        json={"body": "How can I help?"},
        headers=auth_headers(support),
    )
    assert r.status_code == 201
    mine = (await client.get(f"{API}/conversations", headers=auth_headers(patient_user))).json()[0]
    assert mine["unread_count"] == 1
    assert {p["user_id"] for p in mine["participants"]} == {str(patient_user.id), str(support.id)}

    r = await client.get(f"{API}/conversations/{conv['id']}/messages", headers=auth_headers(other_patient))
    assert r.status_code == 404

    # Non-staff cannot pull other non-staff users into a support conversation.
    r = await client.post(
        f"{API}/conversations",
        json={"participant_user_ids": [str(other_patient.id)]},
        headers=auth_headers(patient_user),
    )
    assert r.status_code == 400


async def test_staff_direct_conversation(db, client, auth_headers):
    admin = await create_user(db, role="admin")
    hospital_user = await create_user(db, role="hospital")
    r = await client.post(
        f"{API}/conversations",
        json={"subject": "Onboarding", "participant_user_ids": [str(hospital_user.id)]},
        headers=auth_headers(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "direct"
    listed = (await client.get(f"{API}/conversations", headers=auth_headers(hospital_user))).json()
    assert [c["id"] for c in listed] == [r.json()["id"]]


# -------------------------------------------------------------------------------------------- notifications
async def test_notifications_endpoints(db, client, auth_headers):
    user = await create_user(db, role="patient")
    other = await create_user(db, role="patient")
    for i in range(3):
        await notify(db, user.id, "test.kind", f"Title {i}", "Body", {"i": i})
    foreign = await notify(db, other.id, "test.kind", "Other", None, None)
    await db.commit()
    h = auth_headers(user)

    r = await client.get(f"{API}/notifications", headers=h)
    assert r.status_code == 200
    page = r.json()
    assert page["total"] == 3 and page["page"] == 1
    assert [n["title"] for n in page["items"]] == ["Title 2", "Title 1", "Title 0"]
    assert page["items"][0]["data"] == {"i": 2}
    assert (await client.get(f"{API}/notifications/unread-count", headers=h)).json() == {"count": 3}

    first = page["items"][0]["id"]
    r = await client.post(f"{API}/notifications/{first}/read", headers=h)
    assert r.status_code == 200 and r.json()["read_at"] is not None
    assert (await client.get(f"{API}/notifications/unread-count", headers=h)).json() == {"count": 2}
    unread = (await client.get(f"{API}/notifications", params={"unread": "true"}, headers=h)).json()
    assert unread["total"] == 2
    read = (await client.get(f"{API}/notifications", params={"unread": "false"}, headers=h)).json()
    assert [n["id"] for n in read["items"]] == [first]

    # Someone else's notification is not found.
    assert foreign is not None
    assert (await client.post(f"{API}/notifications/{foreign.id}/read", headers=h)).status_code == 404

    r = await client.post(f"{API}/notifications/read-all", headers=h)
    assert r.json() == {"updated": 2}
    assert (await client.get(f"{API}/notifications/unread-count", headers=h)).json() == {"count": 0}
    other_count = (await client.get(f"{API}/notifications/unread-count", headers=auth_headers(other))).json()
    assert other_count == {"count": 1}


async def test_notify_dedupe_and_inactive_users(db):
    user = await create_user(db, role="patient")
    suspended = await create_user(db, role="patient", status="suspended")
    first = await notify(db, user.id, "x.kind", "T", "B", {}, dedupe_key="k1")
    second = await notify(db, user.id, "x.kind", "T", "B", {}, dedupe_key="k1")
    other_key = await notify(db, user.id, "x.kind", "T", "B", {}, dedupe_key="k2")
    none = await notify(db, suspended.id, "x.kind", "T", "B", {})
    await db.commit()
    assert first is not None and second is None and other_key is not None and none is None
    assert "dedupe_key" not in (await _api_data(db, first.id))


async def _api_data(db, notification_id):
    from app.modules.messaging.notifications import notification_out

    n = await db.get(Notification, notification_id)
    return notification_out(n).data


async def test_send_message_is_rate_limited_per_user(db, client, auth_headers, monkeypatch):
    import time
    from types import SimpleNamespace

    from app.core import rate_limit
    from app.core.config import settings

    world = await build_case_world(db)
    conv = await _case_conversation(client, auth_headers, world)
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    # Fixed windows are keyed on wall-clock minutes; pin the clock so 61 requests can't straddle a boundary.
    frozen = time.time()
    monkeypatch.setattr(rate_limit, "time", SimpleNamespace(time=lambda: frozen, monotonic=time.monotonic))
    url = f"{API}/conversations/{conv['id']}/messages"
    h = auth_headers(world.patient_user)
    for i in range(60):
        r = await client.post(url, json={"body": f"m{i}"}, headers=h)
        assert r.status_code == 201, r.text
    r = await client.post(url, json={"body": "one too many"}, headers=h)
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    # Other users are unaffected.
    r = await client.post(url, json={"body": "hello"}, headers=auth_headers(world.owner))
    assert r.status_code == 201
