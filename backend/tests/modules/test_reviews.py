"""Verified reviews (submit, moderate, publish, ratings) and structured, admin-verified accreditations."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import BookingStatus, ReviewStatus
from app.models import AuditLog, Doctor, Hospital, HospitalAccreditation, Review
from app.modules.catalog.service import invalidate_catalog_cache
from tests.factories import create_booking, create_case, create_doctor, create_user
from tests.modules.cases_helpers import (  # noqa: F401  (fixture import)
    event_log_fixture,
    make_document,
    make_world,
    reload,
)

API = "/api/v1"


async def _completed_booking(db, w, **fields):
    case = await create_case(db, w.patient, w.hospital, procedure_id=w.procedure.id, doctor_id=w.doctor.id)
    return await create_booking(
        db,
        case,
        status=BookingStatus.COMPLETED,
        admission_date=date.today() - timedelta(days=10),
        completed_at=datetime.now(UTC),
        **fields,
    )


def _body(w, booking, **over):
    body = {
        "hospital_id": str(w.hospital.id),
        "booking_id": str(booking.id),
        "doctor_id": str(w.doctor.id),
        "rating": 5,
        "title": "  Walking again  ",
        "body": "Excellent care from admission to discharge.",
    }
    body.update(over)
    return body


# ----------------------------------------------------------------------------- submit
async def test_patient_reviews_completed_booking(client, db, auth_headers, event_log):
    w = await make_world(db)
    booking = await _completed_booking(db, w)
    h = auth_headers(w.patient_user)

    r = await client.get(f"{API}/me/reviews/eligible", headers=h)
    assert r.status_code == 200, r.text
    eligible = r.json()
    assert [e["booking_id"] for e in eligible] == [str(booking.id)]
    assert eligible[0]["hospital"]["id"] == str(w.hospital.id)
    assert eligible[0]["procedure"]["slug"] == w.procedure.slug
    assert eligible[0]["doctor"]["name"] == w.doctor.full_name

    r = await client.post(f"{API}/reviews", headers=h, json=_body(w, booking))
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["status"] == "pending" and out["editable"] is True
    assert out["title"] == "Walking again"
    assert out["verified_patient"] is True
    assert out["treatment_name"] == w.procedure.name
    assert out["doctor_name"] == w.doctor.full_name
    assert out["booking_id"] == str(booking.id)

    review = (await db.execute(select(Review))).scalar_one()
    assert review.case_id == booking.case_id and review.procedure_id == w.procedure.id
    assert event_log.of("review.submitted") == [
        {
            "review_id": str(review.id),
            "hospital_id": str(w.hospital.id),
            "doctor_id": str(w.doctor.id),
            "patient_id": str(w.patient.id),
            "patient_user_id": str(w.patient_user.id),
            "booking_id": str(booking.id),
            "rating": 5,
        }
    ]
    actions = (await db.execute(select(AuditLog.action))).scalars().all()
    assert "review.submit" in actions

    # one review per booking; nothing left to review
    r = await client.post(f"{API}/reviews", headers=h, json=_body(w, booking, rating=4))
    assert r.status_code == 409 and r.json()["error"]["code"] == "review_exists"
    assert (await client.get(f"{API}/me/reviews/eligible", headers=h)).json() == []

    # pending reviews are not public
    r = await client.get(f"{API}/hospitals/{w.hospital.id}/reviews")
    assert r.status_code == 200 and r.json()["items"] == []


async def test_review_rules(client, db, auth_headers):
    w = await make_world(db)
    h = auth_headers(w.patient_user)
    case = await create_case(db, w.patient, w.hospital, procedure_id=w.procedure.id)
    confirmed = await create_booking(db, case, status=BookingStatus.CONFIRMED)
    r = await client.post(f"{API}/reviews", headers=h, json=_body(w, confirmed))
    assert r.status_code == 409 and r.json()["error"]["code"] == "booking_not_completed"

    done = await _completed_booking(db, w)
    other_hospital_user = await create_user(db, role="hospital")
    from tests.factories import create_hospital

    other = await create_hospital(db, owner=other_hospital_user)
    other_doctor = await create_doctor(db, other, w.specialty)
    r = await client.post(f"{API}/reviews", headers=h, json=_body(w, done, hospital_id=str(other.id)))
    assert r.status_code == 400 and r.json()["error"]["code"] == "hospital_mismatch"
    r = await client.post(f"{API}/reviews", headers=h, json=_body(w, done, doctor_id=str(other_doctor.id)))
    assert r.status_code == 400 and r.json()["error"]["code"] == "doctor_mismatch"
    for rating in (0, 6):
        r = await client.post(f"{API}/reviews", headers=h, json=_body(w, done, rating=rating))
        assert r.status_code == 422

    # someone else's booking looks like it does not exist
    r = await client.post(f"{API}/reviews", headers=auth_headers(w.agent_patient_user), json=_body(w, done))
    assert r.status_code == 404
    # only patients
    r = await client.post(f"{API}/reviews", headers=auth_headers(w.hospital_user), json=_body(w, done))
    assert r.status_code == 403
    # guests must upgrade first
    guest = await create_user(db, role="patient", is_guest=True, email=None)
    r = await client.post(f"{API}/reviews", headers=auth_headers(guest), json=_body(w, done))
    assert r.status_code == 403 and r.json()["error"]["code"] == "guest_upgrade_required"
    # hospital-only review (no doctor) is fine
    r = await client.post(f"{API}/reviews", headers=h, json=_body(w, done, doctor_id=None))
    assert r.status_code == 201 and r.json()["doctor_id"] is None


async def test_edit_and_delete_own_pending_review(client, db, auth_headers, make_user):
    w = await make_world(db)
    h = auth_headers(w.patient_user)
    booking = await _completed_booking(db, w)
    rid = (await client.post(f"{API}/reviews", headers=h, json=_body(w, booking))).json()["id"]

    r = await client.patch(f"{API}/me/reviews/{rid}", headers=h, json={"rating": 3, "title": "Good"})
    assert r.status_code == 200, r.text
    assert (r.json()["rating"], r.json()["title"]) == (3, "Good")
    r = await client.patch(f"{API}/me/reviews/{rid}", headers=h, json={"rating": None})
    assert r.status_code == 422
    # another patient cannot touch it
    r = await client.patch(f"{API}/me/reviews/{rid}", headers=auth_headers(w.agent_patient_user), json={})
    assert r.status_code == 404
    mine = (await client.get(f"{API}/me/reviews", headers=h)).json()
    assert [m["id"] for m in mine] == [rid]

    # once moderated it can no longer be changed
    admin = await make_user(role="admin")
    r = await client.patch(
        f"{API}/admin/reviews/{rid}", headers=auth_headers(admin), json={"status": "published"}
    )
    assert r.status_code == 200, r.text
    r = await client.patch(f"{API}/me/reviews/{rid}", headers=h, json={"rating": 1})
    assert r.status_code == 409 and r.json()["error"]["code"] == "review_not_editable"
    assert (await client.delete(f"{API}/me/reviews/{rid}", headers=h)).status_code == 409

    booking2 = await _completed_booking(db, w)
    rid2 = (await client.post(f"{API}/reviews", headers=h, json=_body(w, booking2))).json()["id"]
    assert (await client.delete(f"{API}/me/reviews/{rid2}", headers=h)).status_code == 204
    assert (await db.execute(select(Review).where(Review.id == rid2))).first() is None


# ----------------------------------------------------------------------------- moderation & public
async def test_moderation_publishes_and_recomputes_ratings(client, db, auth_headers, make_user, event_log):
    w = await make_world(db)
    h = auth_headers(w.patient_user)
    b1 = await _completed_booking(db, w)
    b2 = await _completed_booking(db, w)
    r1 = (await client.post(f"{API}/reviews", headers=h, json=_body(w, b1, rating=5))).json()["id"]
    r2 = (await client.post(f"{API}/reviews", headers=h, json=_body(w, b2, rating=2))).json()["id"]
    admin = await make_user(role="admin")
    ah = auth_headers(admin)
    support = await make_user(role="support")

    r = await client.get(f"{API}/admin/reviews", headers=auth_headers(support), params={"status": "pending"})
    assert r.status_code == 200
    queue = r.json()
    assert queue["total"] == 2 and [i["id"] for i in queue["items"]] == [r1, r2]  # oldest first
    assert queue["items"][0]["booking_number"] == b1.booking_number
    # support can read the queue but not moderate
    r = await client.patch(
        f"{API}/admin/reviews/{r1}", headers=auth_headers(support), json={"status": "published"}
    )
    assert r.status_code == 403
    assert (await client.get(f"{API}/admin/reviews", headers=h)).status_code == 403

    r = await client.patch(f"{API}/admin/reviews/{r1}", headers=ah, json={"status": "published"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published" and r.json()["moderated_by_user_id"] == str(admin.id)
    r = await client.patch(f"{API}/admin/reviews/{r2}", headers=ah, json={"status": "hidden"})
    assert r.status_code == 422  # a reason is required to hide
    r = await client.patch(
        f"{API}/admin/reviews/{r2}", headers=ah, json={"status": "hidden", "reason": "Contains personal data"}
    )
    assert r.status_code == 200 and r.json()["moderation_reason"] == "Contains personal data"
    assert [e["status"] for e in event_log.of("review.moderated")] == ["published", "hidden"]

    hospital = await reload(db, Hospital, w.hospital.id)
    doctor = await reload(db, Doctor, w.doctor.id)
    assert (hospital.rating_avg, hospital.rating_count) == (Decimal("5.0"), 1)
    assert (doctor.rating_avg, doctor.rating_count) == (Decimal("5.0"), 1)

    # publish the second one too -> average of 5 and 2
    await client.patch(f"{API}/admin/reviews/{r2}", headers=ah, json={"status": "published"})
    doctor = await reload(db, Doctor, w.doctor.id)
    assert (doctor.rating_avg, doctor.rating_count) == (Decimal("3.5"), 2)
    audit = (await db.execute(select(AuditLog).where(AuditLog.action == "review.moderate"))).scalars().all()
    assert len(audit) == 3

    # the patient sees why a review was hidden
    await client.patch(
        f"{API}/admin/reviews/{r2}", headers=ah, json={"status": "hidden", "reason": "Off topic"}
    )
    mine = {m["id"]: m for m in (await client.get(f"{API}/me/reviews", headers=h)).json()}
    assert mine[r2]["moderation_reason"] == "Off topic" and mine[r1]["moderation_reason"] is None

    # public lists: published only, verified, with treatment name, no case link
    r = await client.get(f"{API}/hospitals/{w.hospital.slug}/reviews")
    page = r.json()
    assert page["total"] == 1
    item = page["items"][0]
    assert item["id"] == r1 and item["verified_patient"] is True
    assert item["treatment_name"] == w.procedure.name and item["case_id"] is None
    assert item["patient_name"].endswith(".")
    r = await client.get(f"{API}/doctors/{w.doctor.id}/reviews")
    assert [i["id"] for i in r.json()["items"]] == [r1]
    detail = (await client.get(f"{API}/hospitals/{w.hospital.slug}")).json()
    assert [rv["id"] for rv in detail["reviews"]] == [r1] and detail["reviews"][0]["verified_patient"] is True
    doc = (await client.get(f"{API}/doctors/{w.doctor.id}")).json()
    assert [rv["id"] for rv in doc["reviews"]] == [r1]
    assert (await client.get(f"{API}/hospitals/does-not-exist/reviews")).status_code == 404


async def test_ratings_job_includes_doctor_ratings(db, run_jobs):
    from app.modules.hospitals.service import recompute_ratings

    w = await make_world(db)
    for rating, status in (
        (4, ReviewStatus.PUBLISHED),
        (2, ReviewStatus.PUBLISHED),
        (1, ReviewStatus.HIDDEN),
    ):
        db.add(
            Review(
                hospital_id=w.hospital.id,
                doctor_id=w.doctor.id,
                patient_id=w.patient.id,
                rating=rating,
                status=status,
            )
        )
    await db.commit()
    assert await recompute_ratings(db) == 1
    await db.commit()
    doctor = await reload(db, Doctor, w.doctor.id)
    assert (doctor.rating_avg, doctor.rating_count) == (Decimal("3.0"), 2)


# ----------------------------------------------------------------------------- accreditations
async def test_accreditations_verified_by_admin_shown_publicly(client, db, auth_headers, make_user):
    w = await make_world(db)
    hh = auth_headers(w.hospital_user)
    cert = await make_document(db, w.hospital_user, kind="kyc_accreditation", hospital_id=w.hospital.id)
    r = await client.post(
        f"{API}/hospital-portal/accreditations",
        headers=hh,
        json={
            "body": "JCI",
            "certificate_number": "JCI-123",
            "valid_until": (date.today() + timedelta(days=365)).isoformat(),
            "document_id": str(cert.id),
        },
    )
    assert r.status_code == 201, r.text
    acc = r.json()
    assert (acc["body"], acc["verified"], acc["is_public"]) == ("jci", False, False)
    r = await client.post(f"{API}/hospital-portal/accreditations", headers=hh, json={"body": "jci"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_accreditation"
    r = await client.post(f"{API}/hospital-portal/accreditations", headers=hh, json={"body": "!!"})
    assert r.status_code == 422

    card = (await client.get(f"{API}/hospitals/{w.hospital.slug}")).json()
    assert card["accreditations_verified"] == []

    admin = await make_user(role="admin")
    ah = auth_headers(admin)
    r = await client.post(f"{API}/admin/accreditations/{acc['id']}/verify", headers=ah)
    assert r.status_code == 200, r.text
    assert r.json()["verified"] is True and r.json()["verified_by_admin_id"] == str(admin.id)
    await invalidate_catalog_cache()
    detail = (await client.get(f"{API}/hospitals/{w.hospital.slug}")).json()
    assert detail["accreditations_verified"] == [{"body": "jci", "valid_until": acc["valid_until"]}]
    listing = (await client.get(f"{API}/hospitals", params={"accreditation": "JCI"})).json()
    assert [h["id"] for h in listing["items"]] == [str(w.hospital.id)]
    doctors = (await client.get(f"{API}/doctors", params={"hospital_id": str(w.hospital.id)})).json()
    assert doctors["items"][0]["hospital"]["accreditations_verified"][0]["body"] == "jci"

    # the hospital edits the certificate -> verification is removed until checked again
    r = await client.patch(
        f"{API}/hospital-portal/accreditations/{acc['id']}",
        headers=hh,
        json={"certificate_number": "JCI-999"},
    )
    assert r.status_code == 200 and r.json()["verified"] is False
    row = await reload(db, HospitalAccreditation, acc["id"])
    assert row.verified_at is None
    await client.post(f"{API}/admin/accreditations/{acc['id']}/verify", headers=ah)

    # expired certificates are not public and cannot be verified
    r = await client.post(
        f"{API}/admin/hospitals/{w.hospital.id}/accreditations",
        headers=ah,
        json={"body": "nabh", "valid_until": (date.today() - timedelta(days=1)).isoformat()},
    )
    assert r.status_code == 201
    nabh = r.json()["id"]
    r = await client.post(f"{API}/admin/accreditations/{nabh}/verify", headers=ah)
    assert r.status_code == 400 and r.json()["error"]["code"] == "accreditation_expired"
    listed = (await client.get(f"{API}/admin/hospitals/{w.hospital.id}/accreditations", headers=ah)).json()
    assert [a["body"] for a in listed] == ["jci", "nabh"]
    assert (await client.post(f"{API}/admin/accreditations/{acc['id']}/unverify", headers=ah)).json()[
        "verified"
    ] is False
    assert (await client.delete(f"{API}/admin/accreditations/{nabh}", headers=ah)).status_code == 204

    # members of another hospital cannot see or change it; patients cannot verify
    stranger = await create_user(db, role="hospital")
    from tests.factories import create_hospital

    await create_hospital(db, owner=stranger)
    r = await client.patch(
        f"{API}/hospital-portal/accreditations/{acc['id']}",
        headers=auth_headers(stranger),
        json={"body": "nabl"},
    )
    assert r.status_code == 404
    r = await client.post(
        f"{API}/admin/accreditations/{acc['id']}/verify", headers=auth_headers(w.patient_user)
    )
    assert r.status_code == 403
    actions = set((await db.execute(select(AuditLog.action))).scalars().all())
    assert {
        "accreditation.create",
        "accreditation.verify",
        "accreditation.update",
        "accreditation.delete",
    } <= actions


async def test_public_doctor_card_shows_registration_flag(client, db):
    w = await make_world(db)
    w.doctor.registration_number = "NMC-1"
    w.doctor.registration_verified_at = datetime.now(UTC)
    await db.commit()
    card = (await client.get(f"{API}/doctors", params={"hospital_id": str(w.hospital.id)})).json()["items"][0]
    assert card["registration_verified"] is True
    assert "registration_number" not in card
    assert "experience_years" in card and "qualifications" in card
