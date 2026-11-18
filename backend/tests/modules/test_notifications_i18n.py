"""Notifications rendered from catalog keys: English text unchanged, other languages per recipient, review
moderation notifications (``review.submitted`` -> admins, ``review.moderated`` -> the patient)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.enums import BookingStatus
from app.core.events import publish
from app.i18n import Msg, MsgList, has_key, t
from app.models import Notification
from app.modules.cases import sla_handlers
from app.modules.messaging import handlers
from tests.factories import create_booking, create_case, create_quote, create_user
from tests.modules.cases_helpers import make_world
from tests.modules.messaging_helpers import build_case_world
from tests.modules.test_i18n import enable

API = "/api/v1"


async def _notes(db: Any, kind: str) -> list[Notification]:
    stmt = select(Notification).where(Notification.kind == kind).order_by(Notification.created_at)
    return list((await db.execute(stmt)).scalars().all())


def _by_user(notes: list[Notification]) -> dict[Any, Notification]:
    return {n.user_id: n for n in notes}


# ------------------------------------------------------------------------------------------- catalog / t()
def test_msg_list_uses_the_locale_separator() -> None:
    flags = MsgList(
        (
            Msg("notifications.aftercare_red_flag.flags.fever"),
            Msg("notifications.aftercare_red_flag.flags.severe_pain"),
        )
    )
    assert t("notifications.aftercare_red_flag.body", "en", flags=flags, day=3) == (
        "The patient reported fever, severe pain in their day-3 check-in. Please contact the patient now."
    )
    ar = t("notifications.aftercare_red_flag.body", "ar", flags=flags, day=3)
    assert "حمّى، ألم شديد" in ar and "3" in ar


def test_every_travel_item_and_status_has_a_label() -> None:
    items = {*handlers._TRAVEL_ITEM_TYPES, *handlers._TRAVEL_KINDS, "other"}
    for lng in ("en", "ar", "fr", "bn", "ru"):
        for item in items:
            assert has_key(f"notifications.travel_status.items.{item}", lng), (lng, item)
        for status in handlers._TRAVEL_STATUSES:
            assert has_key(f"notifications.travel_status.statuses.{status}", lng), (lng, status)
        for flag in sla_handlers.RED_FLAGS:
            assert has_key(f"notifications.aftercare_red_flag.flags.{flag}", lng), (lng, flag)


# --------------------------------------------------------------------------------- converted handlers
async def test_quote_rejected_english_unchanged_and_french_for_french_recipient(db: Any) -> None:
    await enable(db, "fr")
    world = await build_case_world(db)
    world.coordinator_member.preferred_language = "fr"
    await db.flush()
    quote = await create_quote(db, world.case, status="rejected")
    payload = {"quote_id": str(quote.id), "case_id": str(world.case.id), "reason": "Too expensive"}
    await publish(db, "quote.rejected", payload)
    await db.commit()
    notes = _by_user(await _notes(db, "quote.rejected"))
    english = notes[world.owner.id]
    number = world.case.case_number
    assert english.title == f"Quote declined for {number}"
    assert english.body == (
        f"{world.patient.full_name} declined your quote for case {number}. Reason: Too expensive "
        "You can send a revised quote."
    )
    french = notes[world.coordinator_member.id]
    assert french.title == f"Devis refusé pour {number}"
    assert "Motif : Too expensive" in (french.body or "") and world.patient.full_name in (french.body or "")


async def test_travel_update_english_unchanged_and_russian(db: Any) -> None:
    await enable(db, "ru")
    world = await build_case_world(db)
    world.agent_user.preferred_language = "ru"
    await db.flush()
    payload = {
        "case_id": str(world.case.id),
        "item_type": "visa",
        "item_id": str(uuid4()),
        "to_status": "rejected",
    }
    await publish(db, "travel.status_changed", payload)
    await publish(db, "travel.status_changed", {**payload, "item_id": str(uuid4()), "to_status": "applied"})
    await db.commit()
    number = world.case.case_number
    notes = await _notes(db, "travel.status_changed")
    patient = [n for n in notes if n.user_id == world.patient_user.id]
    assert {n.body for n in patient} == {
        "Your medical visa was not approved. Your coordinator will help you with next steps "
        f"(case {number}).",
        f"Your medical visa application has been submitted for case {number}.",
    }
    assert all(n.title == f"Travel update for case {number}" for n in patient)
    agent = [n for n in notes if n.user_id == world.agent_user.id]
    assert {n.title for n in agent} == {f"Обновление по поездке: обращение {number}"}
    assert any("Ваша медицинская виза: не одобрено" in (n.body or "") for n in agent)


async def test_coordinator_assigned_falls_back_to_a_translated_name(db: Any) -> None:
    world = await build_case_world(db)
    coordinator = await create_user(db, role="support")
    coordinator.full_name = ""
    await db.flush()
    await publish(
        db,
        "case.coordinator_assigned",
        {"case_id": str(world.case.id), "coordinator_user_id": str(coordinator.id)},
    )
    await db.commit()
    notes = _by_user(await _notes(db, "case.coordinator_assigned"))
    assert notes[world.patient_user.id].body == (
        "A coordinator from Heal India Global is now your care coordinator. Message them from the case "
        "any time."
    )
    assert notes[coordinator.id].title == f"You are coordinating case {world.case.case_number}"


async def test_aftercare_red_flag_lists_flags_in_each_language(db: Any) -> None:
    await enable(db, "ar")
    world = await build_case_world(db)
    world.coordinator_member.preferred_language = "ar"
    await db.flush()
    payload = {
        "case_id": str(world.case.id),
        "checkin_id": str(uuid4()),
        "day": 7,
        "red_flags": ["fever", "wound_concerns"],
    }
    await publish(db, "aftercare.red_flag", payload)
    await db.commit()
    notes = _by_user(await _notes(db, "aftercare.red_flag"))
    owner = notes[world.owner.id]
    assert owner.title == f"URGENT: recovery warning signs, case {world.case.case_number}"
    assert owner.body == (
        "The patient reported fever, wound concerns in their day-7 check-in. Please contact the patient now."
    )
    arabic = notes[world.coordinator_member.id]
    assert "حمّى، مشكلة في الجرح" in (arabic.body or "")
    assert notes[world.patient_user.id].title == "Your care team has been alerted"


# ------------------------------------------------------------------------------------------- reviews
async def _completed_booking(db: Any, w: Any) -> Any:
    case = await create_case(db, w.patient, w.hospital, procedure_id=w.procedure.id, doctor_id=w.doctor.id)
    return await create_booking(
        db,
        case,
        status=BookingStatus.COMPLETED,
        admission_date=date.today() - timedelta(days=10),
        completed_at=datetime.now(UTC),
    )


async def test_review_submitted_and_moderated_notifications(
    client: Any, db: Any, auth_headers: Any, make_user: Any
) -> None:
    await enable(db, "fr")
    w = await make_world(db)
    admin = await make_user(role="admin")
    french_admin = await make_user(role="super_admin", preferred_language="fr")
    support = await make_user(role="support")
    booking = await _completed_booking(db, w)
    body = {
        "hospital_id": str(w.hospital.id),
        "booking_id": str(booking.id),
        "rating": 4,
        "body": "Kind staff.",
    }
    r = await client.post(f"{API}/reviews", headers=auth_headers(w.patient_user), json=body)
    assert r.status_code == 201, r.text
    review_id = r.json()["id"]

    submitted = _by_user(await _notes(db, "review.submitted"))
    assert set(submitted) == {admin.id, french_admin.id}  # support reads the queue but cannot moderate
    assert support.id not in submitted
    assert submitted[admin.id].title == "New review to moderate"
    assert submitted[admin.id].body == (
        f"A patient left a 4-star review of {w.hospital.name}. Please check it in the review moderation "
        "queue."
    )
    assert submitted[french_admin.id].title == "Nouvel avis à modérer"
    assert submitted[admin.id].data["review_id"] == review_id

    ah = auth_headers(admin)
    r = await client.patch(
        f"{API}/admin/reviews/{review_id}",
        headers=ah,
        json={"status": "hidden", "reason": "Contains a phone number"},
    )
    assert r.status_code == 200, r.text
    (hidden,) = await _notes(db, "review.moderated")
    assert hidden.user_id == w.patient_user.id
    assert hidden.title == "Your review was not published"
    assert hidden.body == (
        f"Your review of {w.hospital.name} was not published because it does not meet our review guidelines. "
        "Reason: Contains a phone number."
    )

    r = await client.patch(f"{API}/admin/reviews/{review_id}", headers=ah, json={"status": "published"})
    assert r.status_code == 200, r.text
    published = [n for n in await _notes(db, "review.moderated") if n.data["status"] == "published"]
    assert len(published) == 1
    assert published[0].title == "Your review is live"
    assert published[0].body == f"Thank you. Your review of {w.hospital.name} is now published."
