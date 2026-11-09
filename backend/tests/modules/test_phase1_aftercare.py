"""Phase 1 aftercare: follow-ups after discharge, Jitsi links, reminders, check-ins and red flags."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import Text, select, type_coerce, update

from app.core.enums import BookingStatus, CaseStatus
from app.models import AftercareCheckin, Booking, Consultation, Notification
from app.modules.cases.aftercare import run_consultation_reminders
from app.modules.cases.common import today_ist
from tests.factories import create_booking, create_case, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    EventLog,
    event_log_fixture,
    make_world,
)

API = "/api/v1"


async def _discharged(db, client, auth_headers, world):
    case = await create_case(
        db,
        world.patient,
        world.hospital,
        doctor_id=world.doctor.id,
        procedure_id=world.procedure.id,
        status=CaseStatus.IN_TREATMENT,
    )
    booking = await create_booking(
        db, case, status=BookingStatus.ADMITTED, admission_date=today_ist() - timedelta(days=5)
    )
    r = await client.post(
        f"{API}/bookings/{booking.id}/complete",
        json={"discharge_date": today_ist().isoformat()},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 200, r.text
    return case, booking


async def test_discharge_creates_followups_and_checkins(db, client, auth_headers) -> None:
    world = await make_world(db)
    case, booking = await _discharged(db, client, auth_headers, world)
    await db.refresh(case)
    assert case.status == CaseStatus.COMPLETED
    followups = (
        (await db.execute(select(Consultation).where(Consultation.case_id == case.id))).scalars().all()
    )
    assert sorted(f.followup_day for f in followups) == [7, 30, 90]
    assert all(f.kind == "followup" and f.status == "requested" and f.fee_minor == 0 for f in followups)
    assert all(f.doctor_id == world.doctor.id for f in followups)
    day7 = next(f for f in followups if f.followup_day == 7)
    assert day7.due_at is not None and (day7.due_at.date() - today_ist()).days in (6, 7)
    checkins = (
        (await db.execute(select(AftercareCheckin).where(AftercareCheckin.case_id == case.id)))
        .scalars()
        .all()
    )
    assert sorted(c.day for c in checkins) == [1, 3, 7, 14, 30]

    r = await client.get(f"{API}/me/aftercare", headers=auth_headers(world.patient_user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert [c["case_id"] for c in body["cases"]] == [str(case.id)]
    assert body["cases"][0]["discharged_on"] == today_ist().isoformat()
    assert body["cases"][0]["doctor"]["id"] == str(world.doctor.id)
    assert [f["followup_day"] for f in body["followups"]] == [7, 30, 90]
    assert all(f["kind"] == "followup" for f in body["followups"])
    assert body["checkins_due"] == [] and len(body["upcoming_checkins"]) == 5

    # the hospital schedules the day-7 follow-up without a link -> private Jitsi room
    when = (datetime.now(UTC) + timedelta(days=6)).isoformat()
    r = await client.patch(
        f"{API}/consultations/{day7.id}",
        json={"status": "scheduled", "scheduled_at": when},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 200, r.text
    url = r.json()["meeting_url"]
    assert url.startswith("https://meet.jit.si/hig-") and len(url.rsplit("-", 1)[1]) >= 20
    # another follow-up gets a different room
    day30 = next(f for f in followups if f.followup_day == 30)
    r = await client.patch(
        f"{API}/consultations/{day30.id}",
        json={"status": "scheduled", "scheduled_at": when},
        headers=auth_headers(world.hospital_user),
    )
    assert r.json()["meeting_url"] != url

    # completing the booking twice does not duplicate the plan (idempotent handler)
    from app.modules.cases.aftercare import create_aftercare_plan

    await create_aftercare_plan(db, booking.id)
    await db.commit()
    assert len((await db.execute(select(Consultation).where(Consultation.case_id == case.id))).all()) == 3


async def test_followup_requests_on_completed_case(db, client, auth_headers) -> None:
    world = await make_world(db)
    case, booking = await _discharged(db, client, auth_headers, world)
    p_h = auth_headers(world.patient_user)
    r = await client.post(f"{API}/consultations", json={"case_id": str(case.id)}, headers=p_h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_state"
    r = await client.post(
        f"{API}/consultations",
        json={"case_id": str(case.id), "kind": "followup", "notes": "Swelling question"},
        headers=p_h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "followup" and r.json()["fee_minor"] == 0
    # one open patient-requested follow-up at a time (automatic ones do not block)
    r = await client.post(
        f"{API}/consultations", json={"case_id": str(case.id), "kind": "followup"}, headers=p_h
    )
    assert r.status_code == 409

    # outside the aftercare window
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(
            admission_date=today_ist() - timedelta(days=410), discharge_date=today_ist() - timedelta(days=400)
        )
    )
    await db.execute(update(Consultation).where(Consultation.case_id == case.id).values(status="cancelled"))
    await db.commit()
    r = await client.post(
        f"{API}/consultations", json={"case_id": str(case.id), "kind": "followup"}, headers=p_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "aftercare_window_closed"

    # cancelled cases never get follow-ups
    cancelled = await create_case(
        db, world.patient, world.hospital, doctor_id=world.doctor.id, status="cancelled"
    )
    r = await client.post(
        f"{API}/consultations", json={"case_id": str(cancelled.id), "kind": "followup"}, headers=p_h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "followup_not_available"


async def test_consultation_reminders_24h_and_1h(db, client, auth_headers, event_log: EventLog) -> None:
    world = await make_world(db)
    case = await create_case(db, world.patient, world.hospital, doctor_id=world.doctor.id)
    r = await client.post(
        f"{API}/consultations", json={"case_id": str(case.id)}, headers=auth_headers(world.patient_user)
    )
    consult_id = r.json()["id"]
    start = datetime.now(UTC) + timedelta(hours=23)
    r = await client.patch(
        f"{API}/consultations/{consult_id}",
        json={"status": "scheduled", "scheduled_at": start.isoformat()},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 200, r.text

    assert await run_consultation_reminders(db) == 1
    await db.commit()
    assert await run_consultation_reminders(db) == 0
    await db.commit()
    soon = start - timedelta(minutes=30)
    assert await run_consultation_reminders(db, now=soon) == 1
    await db.commit()
    assert await run_consultation_reminders(db, now=soon + timedelta(minutes=5)) == 0
    await db.commit()
    assert [e["window"] for e in event_log.of("consultation.reminder")] == ["24h", "1h"]
    notes = (
        (
            await db.execute(
                select(Notification).where(
                    Notification.user_id == world.patient_user.id,
                    Notification.kind == "consultation.reminder",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(notes) == 2

    # rescheduling resets the reminders
    later = datetime.now(UTC) + timedelta(hours=20)
    r = await client.patch(
        f"{API}/consultations/{consult_id}",
        json={"scheduled_at": later.isoformat()},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 200, r.text
    assert await run_consultation_reminders(db) == 1


async def test_checkin_red_flag_alerts_hospital_and_coordinator(
    db, client, auth_headers, event_log: EventLog
) -> None:
    world = await make_world(db)
    coordinator = await create_user(db, role="support")
    case, _ = await _discharged(db, client, auth_headers, world)
    case.coordinator_user_id = coordinator.id
    checkin = (
        await db.execute(
            select(AftercareCheckin).where(AftercareCheckin.case_id == case.id, AftercareCheckin.day == 1)
        )
    ).scalar_one()
    checkin.due_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()
    p_h = auth_headers(world.patient_user)

    due = (await client.get(f"{API}/me/aftercare", headers=p_h)).json()["checkins_due"]
    assert [c["id"] for c in due] == [str(checkin.id)]

    answers = {
        "pain": 8,
        "fever": True,
        "wound_concerns": False,
        "breathlessness": False,
        "medication_adherence": "all",
        "free_text": "Feeling hot since last night",
    }
    # the hospital cannot answer for the patient
    r = await client.post(
        f"{API}/aftercare/checkins/{checkin.id}", json=answers, headers=auth_headers(world.hospital_user)
    )
    assert r.status_code == 403
    r = await client.post(f"{API}/aftercare/checkins/{checkin.id}", json=answers, headers=p_h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["red_flags"] == ["fever", "severe_pain"] and out["free_text"] == "Feeling hot since last night"
    assert out["answers"]["pain"] == 8 and "free_text" not in out["answers"]
    r = await client.post(f"{API}/aftercare/checkins/{checkin.id}", json=answers, headers=p_h)
    assert r.status_code == 409

    # free text is encrypted at rest
    raw = (
        await db.execute(
            select(type_coerce(AftercareCheckin.free_text, Text)).where(AftercareCheckin.id == checkin.id)
        )
    ).scalar_one()
    assert raw.startswith("v1:") and "hot" not in raw

    flag = event_log.of("aftercare.red_flag")
    assert len(flag) == 1 and flag[0]["case_id"] == str(case.id)
    urgent = (
        (await db.execute(select(Notification).where(Notification.kind == "aftercare.red_flag")))
        .scalars()
        .all()
    )
    assert {n.user_id for n in urgent} >= {world.hospital_user.id, coordinator.id, world.patient_user.id}
    assert any(n.title.startswith("URGENT") for n in urgent)

    # the hospital reads the case's check-ins; another patient cannot
    r = await client.get(
        f"{API}/aftercare/checkins",
        params={"case_id": str(case.id)},
        headers=auth_headers(world.hospital_user),
    )
    assert r.status_code == 200 and len(r.json()) == 5
    r = await client.get(
        f"{API}/aftercare/checkins",
        params={"case_id": str(case.id)},
        headers=auth_headers(world.agent_patient_user),
    )
    assert r.status_code == 404

    # a calm check-in raises no flag
    day3 = (
        await db.execute(
            select(AftercareCheckin).where(AftercareCheckin.case_id == case.id, AftercareCheckin.day == 3)
        )
    ).scalar_one()
    calm = {**answers, "pain": 3, "fever": False, "free_text": None}
    r = await client.post(f"{API}/aftercare/checkins/{day3.id}", json=calm, headers=p_h)
    assert r.status_code == 200 and r.json()["red_flags"] == []
    assert len(event_log.of("aftercare.red_flag")) == 1
