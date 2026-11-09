"""Hospital portal API (PLAN 8.5): scoping, member roles, profile, members, doctors, availability,
procedures, packages, specialties, reviews/ratings and dashboard."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.core.enums import HospitalMemberRole
from app.models import (
    AuditLog,
    AvailabilitySlot,
    Doctor,
    Document,
    Hospital,
    HospitalMember,
    HospitalProcedure,
    HospitalSpecialty,
    Payment,
    Review,
    TreatmentPackage,
    User,
    VerificationToken,
)
from app.modules.catalog.service import today_ist
from app.modules.hospitals.service import recompute_ratings
from tests.factories import (
    create_booking,
    create_case,
    create_doctor,
    create_hospital,
    create_hospital_procedure,
    create_package,
    create_patient,
    create_payment_order,
    create_procedure,
    create_quote,
    create_specialty,
)

API = "/api/v1/hospital-portal"


async def _member(db, hospital, user, role: str) -> HospitalMember:
    m = HospitalMember(hospital_id=hospital.id, user_id=user.id, member_role=HospitalMemberRole(role))
    db.add(m)
    await db.commit()
    return m


@pytest.fixture
async def setup(db, make_user):
    owner = await make_user(role="hospital", full_name="Olivia Owner")
    hospital = await create_hospital(db, owner=owner, slug="sunrise", name="Sunrise Hospital", city="Chennai")
    other_owner = await make_user(role="hospital", email="other.owner@example.com")
    other = await create_hospital(db, owner=other_owner, slug="other", name="Other Hospital")
    spec = await create_specialty(db, slug="orthopedics", name="Orthopedics")
    proc = await create_procedure(db, spec, slug="knee", name="Knee Replacement")
    return {
        "owner": owner,
        "hospital": hospital,
        "other_owner": other_owner,
        "other": other,
        "spec": spec,
        "proc": proc,
    }


# ----------------------------------------------------------------------------- access
async def test_portal_requires_hospital_role_and_membership(client, make_user, auth_headers, setup):
    assert (await client.get(f"{API}/profile")).status_code == 401
    patient = await make_user(role="patient")
    assert (await client.get(f"{API}/profile", headers=auth_headers(patient))).status_code == 403
    lonely = await make_user(role="hospital")
    r = await client.get(f"{API}/profile", headers=auth_headers(lonely))
    assert r.status_code == 404 and r.json()["error"]["code"] == "no_hospital"


async def test_hospital_selection_header(client, db, auth_headers, setup):
    owner, hospital, other = setup["owner"], setup["hospital"], setup["other"]
    second = await create_hospital(db, slug="second", name="Second Hospital")
    await _member(db, second, owner, "coordinator")
    h = auth_headers(owner)
    r = await client.get(f"{API}/profile", headers=h)
    assert r.json()["id"] == str(hospital.id) and r.json()["member_role"] == "owner"
    r = await client.get(f"{API}/profile", headers={**h, "X-Hospital-Id": str(second.id)})
    assert r.json()["id"] == str(second.id) and r.json()["member_role"] == "coordinator"
    # not a member -> 404; garbage header -> 404
    assert (
        await client.get(f"{API}/profile", headers={**h, "X-Hospital-Id": str(other.id)})
    ).status_code == 404
    assert (await client.get(f"{API}/profile", headers={**h, "X-Hospital-Id": "nope"})).status_code == 404


async def test_super_admin_can_act_with_header(client, make_user, auth_headers, setup):
    sa = await make_user(role="super_admin")
    r = await client.get(
        f"{API}/profile", headers={**auth_headers(sa), "X-Hospital-Id": str(setup["other"].id)}
    )
    assert r.status_code == 200 and r.json()["id"] == str(setup["other"].id)


async def test_ids_of_other_hospital_are_404(client, db, auth_headers, setup):
    other = setup["other"]
    doc = await create_doctor(db, other, setup["spec"])
    hp = await create_hospital_procedure(db, other, setup["proc"])
    pkg = await create_package(db, hp)
    member = (
        await db.execute(select(HospitalMember).where(HospitalMember.hospital_id == other.id))
    ).scalar_one()
    h = auth_headers(setup["owner"])
    for method, path, body in [
        ("GET", f"/doctors/{doc.id}", None),
        ("PUT", f"/doctors/{doc.id}", {"bio": "x"}),
        ("DELETE", f"/doctors/{doc.id}", None),
        ("GET", f"/doctors/{doc.id}/availability", None),
        ("PUT", f"/doctors/{doc.id}/availability", []),
        ("GET", f"/procedures/{hp.id}", None),
        ("PUT", f"/procedures/{hp.id}", {"price_min_minor": 1}),
        ("DELETE", f"/procedures/{hp.id}", None),
        ("GET", f"/procedures/{hp.id}/packages", None),
        ("PUT", f"/procedures/{hp.id}/packages/{pkg.id}", {"name": "Hack"}),
        ("DELETE", f"/procedures/{hp.id}/packages/{pkg.id}", None),
        ("GET", f"/members/{member.id}", None),
        ("PUT", f"/members/{member.id}", {"member_role": "admin"}),
        ("DELETE", f"/members/{member.id}", None),
    ]:
        r = await client.request(method, f"{API}{path}", headers=h, json=body)
        assert r.status_code == 404, (method, path, r.status_code, r.text)
    await db.refresh(doc)
    assert doc.is_active is True


# ----------------------------------------------------------------------------- profile
async def test_profile_update_with_encrypted_pan(client, db, auth_headers, make_user, setup):
    h = auth_headers(setup["owner"])
    hospital_id = setup["hospital"].id
    r = await client.put(
        f"{API}/profile",
        headers=h,
        json={
            "description": "Quaternary care",
            "gstin": "33aabcs1234a1z5",
            "pan": "aabcs1234a",
            "accreditations": ["JCI", "nabh", "jci"],
            "languages": ["EN", "ar"],
            "airport_distance_km": 12.34,
            "website": "https://sunrise.example",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["airport_distance_km"] == 12.3
    # SEC-020: an approved hospital's identity and accreditation claims wait for staff review
    # (the factory hospital already claims jci + nabh, so the accreditations do not change)
    assert body["pending_changes"] == ["gstin", "pan", "website"]
    assert body["gstin"] != "33AABCS1234A1Z5" and body["website"] != "https://sunrise.example"
    pending_pan = (
        await db.execute(
            text("SELECT pending_profile->'fields'->>'pan' FROM hospitals WHERE id = :id"),
            {"id": hospital_id},
        )
    ).scalar_one()
    assert pending_pan.startswith("v1:") and "AABCS1234A" not in pending_pan  # PAN encrypted while pending
    admin = await make_user(role="admin")
    r = await client.post(
        f"/api/v1/admin/hospitals/{hospital_id}/profile-changes/approve", headers=auth_headers(admin)
    )
    assert r.status_code == 200, r.text
    assert r.json()["pending_profile_values"] == {}
    body = (await client.get(f"{API}/profile", headers=h)).json()
    assert body["pending_changes"] == []
    assert body["gstin"] == "33AABCS1234A1Z5"
    assert body["pan_last4"] == "234A" and body["pan_masked"] == "******234A"
    assert "pan" not in body
    assert body["accreditations"] == ["jci", "nabh"]
    db.expire_all()
    hospital = await db.get(Hospital, hospital_id)
    assert hospital.pan == "AABCS1234A"
    raw = (
        await db.execute(text("SELECT pan FROM hospitals WHERE id = :id"), {"id": hospital_id})
    ).scalar_one()
    assert raw.startswith("v1:") and "AABCS1234A" not in raw
    log = (
        await db.execute(select(AuditLog).where(AuditLog.action == "hospital.profile_update"))
    ).scalar_one()
    assert "pan" not in log.after["values"]
    requested = (
        await db.execute(select(AuditLog).where(AuditLog.action == "hospital.profile_change_requested"))
    ).scalar_one()
    assert "pan" in requested.after["fields"] and "pan" not in requested.after["values"]

    for bad in (
        {"gstin": "123"},
        {"pan": "12345"},
        {"accreditations": ["xyz"]},
        {"website": "ftp://x"},
        {"unknown_field": 1},
        {"name": None},
    ):
        r = await client.put(f"{API}/profile", headers=h, json=bad)
        assert r.status_code in (400, 422), (bad, r.text)


async def test_profile_update_requires_owner_or_admin(client, db, make_user, auth_headers, setup):
    coord = await make_user(role="hospital")
    await _member(db, setup["hospital"], coord, "coordinator")
    r = await client.put(f"{API}/profile", headers=auth_headers(coord), json={"description": "x"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "insufficient_member_role"
    assert (await client.get(f"{API}/profile", headers=auth_headers(coord))).status_code == 200


async def test_submit_for_review_validation(client, db, make_user, auth_headers):
    owner = await make_user(role="hospital")
    hospital = await create_hospital(
        db, owner=owner, status="draft", legal_name=None, address=None, slug="drafty", name="Drafty"
    )
    h = auth_headers(owner)
    r = await client.post(f"{API}/submit-for-review", headers=h)
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "profile_incomplete"
    assert set(err["details"]["missing"]) == {"legal_name", "address", "kyc_registration_document"}

    await client.put(f"{API}/profile", headers=h, json={"legal_name": "Drafty Pvt Ltd", "address": "1 Road"})
    # a rejected KYC document or another kind does not count
    for kind, status in (("kyc_registration", "rejected"), ("kyc_pan", "uploaded")):
        db.add(
            Document(
                owner_user_id=owner.id,
                hospital_id=hospital.id,
                kind=kind,
                file_name="a.pdf",
                content_type="application/pdf",
                size_bytes=10,
                storage_key=f"documents/{kind}.pdf",
                sha256="0" * 64,
                status=status,
            )
        )
    await db.commit()
    r = await client.post(f"{API}/submit-for-review", headers=h)
    assert r.json()["error"]["details"]["missing"] == ["kyc_registration_document"]
    db.add(
        Document(
            owner_user_id=owner.id,
            hospital_id=hospital.id,
            kind="kyc_registration",
            file_name="reg.pdf",
            content_type="application/pdf",
            size_bytes=10,
            storage_key="documents/reg.pdf",
            sha256="1" * 64,
        )
    )
    await db.commit()
    r = await client.post(f"{API}/submit-for-review", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending_review" and r.json()["kyc_status"] == "pending"
    r = await client.post(f"{API}/submit-for-review", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_submitted"


async def test_active_hospital_cannot_resubmit_and_suspended_is_read_only(client, db, auth_headers, setup):
    h = auth_headers(setup["owner"])
    r = await client.post(f"{API}/submit-for-review", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_status"
    setup["hospital"].status = "suspended"
    await db.commit()
    # SEC-014: members of a suspended hospital lose access to every module (reads included)
    r = await client.put(f"{API}/profile", headers=h, json={"description": "x"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "organisation_suspended"
    r = await client.get(f"{API}/doctors", headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "organisation_suspended"


async def test_set_specialties(client, db, auth_headers, setup):
    cardio = await create_specialty(db, slug="cardiology", name="Cardiology")
    inactive = await create_specialty(db, is_active=False)
    h = auth_headers(setup["owner"])
    r = await client.put(
        f"{API}/specialties", headers=h, json={"specialty_ids": [str(setup["spec"].id), str(cardio.id)]}
    )
    assert r.status_code == 200, r.text
    assert set(r.json()["specialty_ids"]) == {str(setup["spec"].id), str(cardio.id)}
    assert set(r.json()["specialties"]) == {"Orthopedics", "Cardiology"}
    r = await client.put(f"{API}/specialties", headers=h, json={"specialty_ids": [str(cardio.id)]})
    assert r.json()["specialty_ids"] == [str(cardio.id)]
    r = await client.put(f"{API}/specialties", headers=h, json={"specialty_ids": [str(inactive.id)]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_specialty"
    r = await client.put(f"{API}/specialties", headers=h, json={"specialty_ids": []})
    assert r.json()["specialty_ids"] == []


# ----------------------------------------------------------------------------- members
async def test_invite_new_member_creates_user_token_and_email(
    client, db, auth_headers, run_jobs, email_outbox, setup
):
    h = auth_headers(setup["owner"])
    r = await client.post(
        f"{API}/members",
        headers=h,
        json={"email": "New.Coord@Example.com", "full_name": "Nia Coord", "member_role": "coordinator"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "new.coord@example.com" and body["member_role"] == "coordinator"
    user = (await db.execute(select(User).where(User.email == "new.coord@example.com"))).scalar_one()
    assert str(user.role) == "hospital" and user.password_hash is None
    token = (
        await db.execute(select(VerificationToken).where(VerificationToken.user_id == user.id))
    ).scalar_one()
    assert str(token.purpose) == "invite" and token.expires_at > datetime.now(UTC) + timedelta(hours=71)
    assert await run_jobs() >= 1
    assert len(email_outbox) == 1
    msg = email_outbox[0]
    assert "new.coord@example.com" in str(msg.get("to"))
    assert "accept-invite#token=" in str(msg)

    r = await client.post(
        f"{API}/members",
        headers=h,
        json={"email": "new.coord@example.com", "full_name": "x", "member_role": "admin"},
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_member"


async def test_invite_existing_users(client, db, make_user, auth_headers, run_jobs, email_outbox, setup):
    h = auth_headers(setup["owner"])
    patient = await make_user(role="patient", email="pat@example.com")
    r = await client.post(
        f"{API}/members", headers=h, json={"email": patient.email, "full_name": "P", "member_role": "admin"}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_in_use"
    # a hospital user from another hospital is attached directly (no new user, no token)
    other_owner = setup["other_owner"]
    r = await client.post(
        f"{API}/members",
        headers=h,
        json={"email": other_owner.email, "full_name": "ignored", "member_role": "finance"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] == str(other_owner.id)
    assert (await db.execute(select(VerificationToken))).scalars().all() == []
    await run_jobs()
    assert len(email_outbox) == 1
    r = await client.get(f"{API}/members", headers=h)
    assert [m["member_role"] for m in r.json()] == ["owner", "finance"]


async def test_member_role_rules(client, db, make_user, auth_headers, setup):
    owner, hospital = setup["owner"], setup["hospital"]
    admin = await make_user(role="hospital")
    admin_m = await _member(db, hospital, admin, "admin")
    coord = await make_user(role="hospital")
    coord_m = await _member(db, hospital, coord, "coordinator")
    owner_m = (
        await db.execute(
            select(HospitalMember).where(
                HospitalMember.user_id == owner.id, HospitalMember.hospital_id == hospital.id
            )
        )
    ).scalar_one()
    ha, hc, ho = auth_headers(admin), auth_headers(coord), auth_headers(owner)
    owner_id, admin_id, hospital_id = owner.id, admin.id, hospital.id

    # coordinator cannot manage members
    r = await client.post(
        f"{API}/members", headers=hc, json={"email": "z@x.com", "full_name": "Z", "member_role": "doctor"}
    )
    assert r.status_code == 403
    # admin cannot create/modify/remove owners
    r = await client.post(
        f"{API}/members", headers=ha, json={"email": "z@x.com", "full_name": "Z", "member_role": "owner"}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "owner_required"
    assert (
        await client.put(f"{API}/members/{owner_m.id}", headers=ha, json={"member_role": "admin"})
    ).status_code == 403
    assert (await client.delete(f"{API}/members/{owner_m.id}", headers=ha)).status_code == 403
    # admin manages non-owners
    r = await client.put(f"{API}/members/{coord_m.id}", headers=ha, json={"member_role": "finance"})
    assert r.status_code == 200 and r.json()["member_role"] == "finance"
    # last owner cannot be demoted or removed
    r = await client.put(f"{API}/members/{owner_m.id}", headers=ho, json={"member_role": "admin"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_owner"
    assert (await client.delete(f"{API}/members/{owner_m.id}", headers=ho)).status_code == 409
    # promote admin to owner, then the original owner may step down
    assert (
        await client.put(f"{API}/members/{admin_m.id}", headers=ho, json={"member_role": "owner"})
    ).status_code == 200
    assert (
        await client.put(f"{API}/members/{owner_m.id}", headers=ho, json={"member_role": "admin"})
    ).status_code == 200
    assert (await client.delete(f"{API}/members/{coord_m.id}", headers=ha)).status_code == 204
    db.expire_all()
    roles = {
        m.user_id: str(m.member_role)
        for m in (
            await db.execute(select(HospitalMember).where(HospitalMember.hospital_id == hospital_id))
        ).scalars()
    }
    assert roles == {owner_id: "admin", admin_id: "owner"}


# ----------------------------------------------------------------------------- doctors & availability
async def test_doctor_medical_registration(client, db, make_user, auth_headers, setup):
    coord = await make_user(role="hospital")
    await _member(db, setup["hospital"], coord, "coordinator")
    h = auth_headers(coord)
    base = {"full_name": "Dr. Reg Test", "specialty_id": str(setup["spec"].id)}

    r = await client.post(
        f"{API}/doctors",
        headers=h,
        json={**base, "registration_number": " mmc/2009/ 04512 ", "registration_council": "Maharashtra"},
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["registration_number"] == "MMC/2009/ 04512"
    assert d["registration_council"] == "maharashtra"
    assert d["registration_council_name"] == "Maharashtra Medical Council"
    # only a platform admin can mark a registration verified
    assert d["registration_verified"] is False and d["registration_verified_at"] is None

    # unknown council / malformed number -> 422; half a registration -> 400
    bad = await client.post(
        f"{API}/doctors", headers=h, json={**base, "registration_number": "1", "registration_council": "xx"}
    )
    assert bad.status_code == 422
    r = await client.post(f"{API}/doctors", headers=h, json={**base, "registration_number": "12345"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_registration"

    # legacy rows: no registration at all is allowed
    r = await client.post(f"{API}/doctors", headers=h, json=base)
    assert r.status_code == 201 and r.json()["registration_number"] is None
    legacy = r.json()["id"]
    r = await client.put(f"{API}/doctors/{legacy}", headers=h, json={"registration_council": "nmc"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_registration"
    r = await client.put(
        f"{API}/doctors/{legacy}",
        headers=h,
        json={"registration_number": "98765", "registration_council": "nmc"},
    )
    assert r.status_code == 200 and r.json()["registration_council_name"].startswith("National Medical")
    # clearing only the number is rejected, clearing both works
    r = await client.put(f"{API}/doctors/{legacy}", headers=h, json={"registration_number": ""})
    assert r.status_code == 400
    r = await client.put(
        f"{API}/doctors/{legacy}", headers=h, json={"registration_number": "", "registration_council": None}
    )
    assert r.status_code == 200 and r.json()["registration_number"] is None
    assert r.json()["registration_council"] is None


async def test_registration_change_resets_verification(client, db, make_user, auth_headers, setup):
    coord = await make_user(role="hospital")
    await _member(db, setup["hospital"], coord, "coordinator")
    h = auth_headers(coord)
    doc = await create_doctor(
        db,
        setup["hospital"],
        setup["spec"],
        registration_number="12345",
        registration_council="nmc",
        registration_verified_at=datetime.now(UTC),
        registration_verified_by_user_id=coord.id,
    )
    doc_id = doc.id
    # unrelated edits and a no-op resend of the same values keep the verification
    r = await client.put(
        f"{API}/doctors/{doc_id}",
        headers=h,
        json={"bio": "Updated", "registration_number": "12345", "registration_council": "nmc"},
    )
    assert r.status_code == 200 and r.json()["registration_verified"] is True
    assert r.json()["registration_verified_at"] is not None
    # a changed number must be re-checked by an admin
    r = await client.put(f"{API}/doctors/{doc_id}", headers=h, json={"registration_number": "54321"})
    assert r.status_code == 200 and r.json()["registration_verified"] is False
    db.expire_all()
    fresh = await db.get(Doctor, doc_id)
    assert fresh.registration_verified_at is None and fresh.registration_verified_by_user_id is None

    # same for a changed council
    fresh.registration_verified_at = datetime.now(UTC)
    await db.commit()
    r = await client.put(f"{API}/doctors/{doc_id}", headers=h, json={"registration_council": "delhi"})
    assert r.status_code == 200 and r.json()["registration_verified"] is False


async def test_doctor_crud_and_slug(client, db, make_user, auth_headers, setup):
    coord = await make_user(role="hospital")
    await _member(db, setup["hospital"], coord, "coordinator")
    h = auth_headers(coord)
    payload = {
        "full_name": "Dr. Ánil Kumar",
        "specialty_id": str(setup["spec"].id),
        "languages": ["EN", "hi"],
        "qualifications": ["MBBS", "MS"],
        "success_rate_pct": 97.5,
        "consultation_fee_minor": 150000,
        "teleconsult_available": True,
    }
    r = await client.post(f"{API}/doctors", headers=h, json=payload)
    assert r.status_code == 201, r.text
    d1 = r.json()
    assert d1["slug"] == "dr-anil-kumar" and d1["is_active"] is True and d1["languages"] == ["en", "hi"]
    assert d1["hospital"]["id"] == str(setup["hospital"].id) and d1["currency"] == "INR"
    r = await client.post(f"{API}/doctors", headers=h, json=payload)
    d2 = r.json()
    assert d2["slug"].startswith("dr-anil-kumar-") and d2["slug"] != d1["slug"]
    # hospital specialty was added automatically
    hs = (
        (
            await db.execute(
                select(HospitalSpecialty).where(HospitalSpecialty.hospital_id == setup["hospital"].id)
            )
        )
        .scalars()
        .all()
    )
    assert [x.specialty_id for x in hs] == [setup["spec"].id]

    r = await client.put(
        f"{API}/doctors/{d1['id']}", headers=h, json={"bio": "Senior surgeon", "is_active": False}
    )
    assert r.status_code == 200 and r.json()["bio"] == "Senior surgeon" and r.json()["is_active"] is False
    assert (
        await client.put(f"{API}/doctors/{d1['id']}", headers=h, json={"full_name": None})
    ).status_code == 400
    r = await client.post(
        f"{API}/doctors", headers=h, json={**payload, "specialty_id": str(setup["proc"].id)}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_specialty"

    r = await client.get(f"{API}/doctors", headers=h)
    assert [d["is_active"] for d in r.json()] == [True, False]
    assert (await client.get(f"{API}/doctors/{d1['id']}", headers=h)).json()["id"] == d1["id"]

    # finance members are read-only
    fin = await make_user(role="hospital")
    await _member(db, setup["hospital"], fin, "finance")
    assert (await client.post(f"{API}/doctors", headers=auth_headers(fin), json=payload)).status_code == 403
    assert (await client.get(f"{API}/doctors", headers=auth_headers(fin))).status_code == 200


async def test_doctor_delete_hard_vs_soft(client, db, auth_headers, setup):
    h = auth_headers(setup["owner"])
    hospital = setup["hospital"]
    free = await create_doctor(db, hospital, setup["spec"])
    used = await create_doctor(db, hospital, setup["spec"])
    hp = await create_hospital_procedure(db, hospital, setup["proc"], doctor_ids=[free.id, used.id])
    patient = await create_patient(db)
    await create_case(db, patient, hospital, doctor_id=used.id)
    free_id, used_id, hp_id = free.id, used.id, hp.id
    assert (await client.delete(f"{API}/doctors/{free_id}", headers=h)).status_code == 204
    assert (await client.delete(f"{API}/doctors/{used_id}", headers=h)).status_code == 204
    db.expire_all()
    assert await db.get(Doctor, free_id) is None
    assert (await db.get(Doctor, used_id)).is_active is False
    assert (await db.get(HospitalProcedure, hp_id)).doctor_ids == []


async def test_doctor_availability_upsert(client, db, auth_headers, setup):
    h = auth_headers(setup["owner"])
    hospital = setup["hospital"]
    doc = await create_doctor(db, hospital, setup["spec"])
    today = today_ist()
    d1, d2 = today + timedelta(days=2), today + timedelta(days=3)
    slots = [
        {"date": d1.isoformat(), "slot_kind": "consultation", "capacity": 5},
        {"date": d2.isoformat(), "slot_kind": "admission", "capacity": 2},
    ]
    r = await client.put(f"{API}/doctors/{doc.id}/availability", headers=h, json=slots)
    assert r.status_code == 200, r.text
    assert r.json() == [
        {"date": d1.isoformat(), "slot_kind": "consultation", "capacity": 5, "booked": 0, "available": 5},
        {"date": d2.isoformat(), "slot_kind": "admission", "capacity": 2, "booked": 0, "available": 2},
    ]
    # simulate bookings, then try to shrink below booked
    slot = (
        await db.execute(
            select(AvailabilitySlot).where(AvailabilitySlot.doctor_id == doc.id, AvailabilitySlot.date == d1)
        )
    ).scalar_one()
    slot.booked = 3
    await db.commit()
    r = await client.put(
        f"{API}/doctors/{doc.id}/availability",
        headers=h,
        json=[{"date": d1.isoformat(), "slot_kind": "consultation", "capacity": 2}],
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "capacity_below_booked"
    r = await client.put(
        f"{API}/doctors/{doc.id}/availability",
        headers=h,
        json=[{"date": d1.isoformat(), "slot_kind": "consultation", "capacity": 3}],
    )
    assert r.status_code == 200 and r.json()[0]["available"] == 0
    rows = (
        (await db.execute(select(AvailabilitySlot).where(AvailabilitySlot.doctor_id == doc.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 2

    past = today - timedelta(days=1)
    r = await client.put(
        f"{API}/doctors/{doc.id}/availability",
        headers=h,
        json=[{"date": past.isoformat(), "slot_kind": "consultation", "capacity": 1}],
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_date"
    r = await client.put(f"{API}/doctors/{doc.id}/availability", headers=h, json=[slots[0], slots[0]])
    assert r.status_code == 400 and r.json()["error"]["code"] == "duplicate_slot"
    r = await client.put(
        f"{API}/doctors/{doc.id}/availability",
        headers=h,
        json=[{"date": d1.isoformat(), "slot_kind": "consultation", "capacity": -1}],
    )
    assert r.status_code == 422

    r = await client.get(
        f"{API}/doctors/{doc.id}/availability",
        headers=h,
        params={"from": d2.isoformat(), "to": d2.isoformat()},
    )
    assert [x["slot_kind"] for x in r.json()] == ["admission"]
    # public endpoint reflects the change (cache invalidated)
    r = await client.get(f"/api/v1/doctors/{doc.id}/availability")
    assert len(r.json()) == 2


async def test_hospital_wide_availability(client, auth_headers, setup):
    h = auth_headers(setup["owner"])
    day = (today_ist() + timedelta(days=4)).isoformat()
    r = await client.put(
        f"{API}/availability", headers=h, json=[{"date": day, "slot_kind": "admission", "capacity": 3}]
    )
    assert r.status_code == 200, r.text
    r = await client.get(f"{API}/availability", headers=h)
    assert r.json() == [{"date": day, "slot_kind": "admission", "capacity": 3, "booked": 0, "available": 3}]
    r = await client.get(f"/api/v1/hospitals/{setup['hospital'].id}/availability")
    assert r.json()[0]["capacity"] == 3


# ----------------------------------------------------------------------------- procedures & packages
async def test_procedure_and_package_crud(client, db, auth_headers, setup):
    h = auth_headers(setup["owner"])
    hospital, proc = setup["hospital"], setup["proc"]
    doc = await create_doctor(db, hospital, setup["spec"])
    foreign_doc = await create_doctor(db, setup["other"], setup["spec"])
    body = {
        "procedure_id": str(proc.id),
        "price_min_minor": 3_00_000_00,
        "price_max_minor": 4_00_000_00,
        "doctor_ids": [str(doc.id)],
        "inclusions": ["Surgery", "Implant", "Surgery"],
    }
    r = await client.post(f"{API}/procedures", headers=h, json={**body, "doctor_ids": [str(foreign_doc.id)]})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_doctor"
    r = await client.post(f"{API}/procedures", headers=h, json={**body, "currency": "USD"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_currency"
    r = await client.post(f"{API}/procedures", headers=h, json={**body, "price_min_minor": 5_00_000_00})
    assert r.status_code == 422
    r = await client.post(f"{API}/procedures", headers=h, json=body)
    assert r.status_code == 201, r.text
    hp = r.json()
    assert hp["procedure"]["slug"] == "knee" and hp["doctor_ids"] == [str(doc.id)]
    assert hp["inclusions"] == ["Surgery", "Implant"] and hp["hospital_stay_days"] == 5
    r = await client.post(f"{API}/procedures", headers=h, json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "procedure_exists"

    r = await client.put(f"{API}/procedures/{hp['id']}", headers=h, json={"price_max_minor": 2_00_000_00})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_price_range"
    r = await client.put(f"{API}/procedures/{hp['id']}", headers=h, json={"price_min_minor": 2_50_000_00})
    assert r.status_code == 200 and r.json()["price_min_minor"] == 2_50_000_00

    pkg_body = {
        "name": "All inclusive",
        "tier": "all_inclusive",
        "price_minor": 4_50_000_00,
        "original_price_minor": 5_00_000_00,
        "includes": {"accommodation_nights": 10, "airport_pickup": True},
    }
    r = await client.post(f"{API}/procedures/{hp['id']}/packages", headers=h, json=pkg_body)
    assert r.status_code == 201, r.text
    pkg = r.json()
    assert pkg["includes"] == {"accommodation_nights": 10, "airport_pickup": True}
    r = await client.post(
        f"{API}/procedures/{hp['id']}/packages", headers=h, json={**pkg_body, "original_price_minor": 1}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_price"
    r = await client.post(
        f"{API}/procedures/{hp['id']}/packages", headers=h, json={**pkg_body, "includes": {"spa": True}}
    )
    assert r.status_code == 422
    r = await client.put(
        f"{API}/procedures/{hp['id']}/packages/{pkg['id']}",
        headers=h,
        json={"price_minor": 4_00_000_00, "is_active": False},
    )
    assert r.status_code == 200 and r.json()["price_minor"] == 4_00_000_00 and r.json()["is_active"] is False
    r = await client.get(f"{API}/procedures/{hp['id']}/packages", headers=h)
    assert [p["id"] for p in r.json()] == [pkg["id"]]

    # public catalog reflects portal writes immediately (cache invalidation); inactive package hidden there
    public = (await client.get("/api/v1/hospitals/sunrise")).json()
    assert public["procedures"][0]["price_min_minor"] == 2_50_000_00
    assert public["procedures"][0]["packages"] == []
    r = await client.put(
        f"{API}/procedures/{hp['id']}/packages/{pkg['id']}", headers=h, json={"is_active": True}
    )
    public = (await client.get("/api/v1/hospitals/sunrise")).json()
    assert [p["id"] for p in public["procedures"][0]["packages"]] == [pkg["id"]]

    assert (
        await client.delete(f"{API}/procedures/{hp['id']}/packages/{pkg['id']}", headers=h)
    ).status_code == 204
    assert (await client.delete(f"{API}/procedures/{hp['id']}", headers=h)).status_code == 204
    assert (await client.get(f"{API}/procedures", headers=h)).json() == []


async def test_referenced_package_and_procedure_are_deactivated(client, db, auth_headers, setup):
    h = auth_headers(setup["owner"])
    hospital = setup["hospital"]
    hp = await create_hospital_procedure(db, hospital, setup["proc"])
    pkg = await create_package(db, hp)
    patient = await create_patient(db)
    case = await create_case(db, patient, hospital)
    await create_booking(db, case, package_id=pkg.id)
    hp_id, pkg_id = hp.id, pkg.id
    assert (await client.delete(f"{API}/procedures/{hp_id}/packages/{pkg_id}", headers=h)).status_code == 204
    db.expire_all()
    assert (await db.get(TreatmentPackage, pkg_id)).is_active is False
    assert (await client.delete(f"{API}/procedures/{hp_id}", headers=h)).status_code == 204
    db.expire_all()
    assert (await db.get(HospitalProcedure, hp_id)).is_active is False


# ----------------------------------------------------------------------------- reviews & ratings
async def test_reviews_and_rating_recompute(client, db, auth_headers, setup, run_jobs):
    hospital = setup["hospital"]
    doc = await create_doctor(db, hospital, setup["spec"], rating_avg=Decimal("0"), rating_count=0)
    patient = await create_patient(db, first_name="Leila", last_name="Haddad")
    db.add_all(
        [
            Review(
                hospital_id=hospital.id, doctor_id=doc.id, patient_id=patient.id, rating=5, status="published"
            ),
            Review(
                hospital_id=hospital.id, doctor_id=doc.id, patient_id=patient.id, rating=4, status="published"
            ),
            Review(hospital_id=hospital.id, patient_id=patient.id, rating=4, status="published"),
            Review(hospital_id=hospital.id, patient_id=patient.id, rating=1, status="hidden"),
        ]
    )
    await db.commit()
    h = auth_headers(setup["owner"])
    r = await client.get(f"{API}/reviews", headers=h)
    assert len(r.json()) == 4 and r.json()[0]["patient_name"] == "Leila H."
    r = await client.get(f"{API}/reviews", headers=h, params={"status": "hidden"})
    assert [x["rating"] for x in r.json()] == [1]

    hospital_id, doc_id, other_id = hospital.id, doc.id, setup["other"].id
    assert await recompute_ratings(db, [hospital_id]) == 1
    await db.commit()
    db.expire_all()
    h_row = await db.get(Hospital, hospital_id)
    assert (h_row.rating_avg, h_row.rating_count) == (Decimal("4.3"), 3)
    d_row = await db.get(Doctor, doc_id)
    assert (d_row.rating_avg, d_row.rating_count) == (Decimal("4.5"), 2)
    # hospitals without reviews keep curated ratings; the periodic job is registered and idempotent
    other = await db.get(Hospital, other_id)
    before = (other.rating_avg, other.rating_count)
    from app.modules.hospitals.tasks import refresh_ratings

    await refresh_ratings(db, {})
    db.expire_all()
    other = await db.get(Hospital, other_id)
    assert (other.rating_avg, other.rating_count) == before


# ----------------------------------------------------------------------------- dashboard
async def test_dashboard(client, db, auth_headers, setup):
    hospital = setup["hospital"]
    patient = await create_patient(db)
    await create_case(db, patient, hospital)  # enquiry
    quoted = await create_case(db, patient, hospital, status="quoted")
    await create_quote(db, quoted)  # sent
    booked = await create_case(db, patient, hospital, status="booked")
    booking = await create_booking(db, booked, status="confirmed")
    order = await create_payment_order(db, booking, status="paid")
    db.add(
        Payment(
            order_id=order.id,
            gateway="mock",
            gateway_payment_id="pay_1",
            status="captured",
            amount_minor=order.amount_minor,
            currency=order.currency,
            base_amount_minor=80_000_00,
            captured_at=datetime.now(UTC),
        )
    )
    treat = await create_case(db, patient, hospital, status="in_treatment")
    await create_booking(db, treat, status="admitted")
    other_patient_case = await create_case(db, patient, setup["other"])  # other hospital: ignored
    await db.commit()

    r = await client.get(f"{API}/dashboard", headers=auth_headers(setup["owner"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["enquiries_open"] == 1
    assert d["quotes_pending"] == 1
    assert d["bookings_upcoming"] == 1
    assert d["patients_in_treatment"] == 1
    assert d["revenue_month_minor"] == 80_000_00 and d["currency"] == "INR"
    assert len(d["monthly"]) == 12
    assert d["monthly"][-1]["month"] == today_ist().strftime("%Y-%m")
    assert d["monthly"][-1]["bookings"] == 2 and d["monthly"][-1]["revenue_minor"] == 80_000_00
    assert len(d["recent_cases"]) == 4
    assert str(other_patient_case.id) not in {c["id"] for c in d["recent_cases"]}
    assert {"case_number", "status", "patient", "hospital"} <= set(d["recent_cases"][0])
