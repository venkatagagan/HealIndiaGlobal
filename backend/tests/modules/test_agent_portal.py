"""Agent portal API (PLAN 8.10): profile, KYC, dashboard, patients, referral, commissions and scoping."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.enums import ConsentKind, DocumentKind, KycStatus
from app.core.security import hash_token
from app.models import (
    AuditLog,
    Consent,
    Notification,
    PatientProfile,
    SettlementItem,
    User,
    VerificationToken,
)
from app.modules.agents.consent import pending_agent_consents
from app.modules.cases.common import today_ist
from tests.factories import (
    create_agent,
    create_booking,
    create_case,
    create_hospital,
    create_patient,
    create_user,
)
from tests.modules.messaging_helpers import API, make_document

BASE = f"{API}/agent-portal"


async def _agent(db, **fields):
    user = await create_user(db, role="agent")
    agent = await create_agent(db, user=user, **fields)
    return user, agent


# --------------------------------------------------------------------------------------------------- access
async def test_agent_portal_requires_agent_role(db, client, auth_headers):
    patient = await create_user(db, role="patient")
    assert (await client.get(f"{BASE}/profile")).status_code == 401
    assert (await client.get(f"{BASE}/profile", headers=auth_headers(patient))).status_code == 403
    hospital_user = await create_user(db, role="hospital")
    assert (await client.get(f"{BASE}/dashboard", headers=auth_headers(hospital_user))).status_code == 403
    # super_admin passes the role check but has no agent profile.
    root = await create_user(db, role="super_admin")
    r = await client.get(f"{BASE}/profile", headers=auth_headers(root))
    assert r.status_code == 404 and r.json()["error"]["code"] == "agent_not_found"


# -------------------------------------------------------------------------------------------- profile & KYC
async def test_profile_get_and_update(db, client, auth_headers):
    user, agent = await _agent(db)
    h = auth_headers(user)
    r = await client.get(f"{BASE}/profile", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == str(agent.id) and body["agent_code"] == agent.agent_code
    assert body["email"] == user.email and body["status"] == "active"

    r = await client.put(
        f"{BASE}/profile",
        json={
            "agency_name": "Global Care Partners",
            "country": "ke",
            "city": "Nairobi",
            "website": "https://gcp.example",
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["agency_name"] == "Global Care Partners"
    assert r.json()["country"] == "KE"
    audit = (await db.execute(select(AuditLog).where(AuditLog.action == "agent.profile_update"))).scalar_one()
    assert audit.entity_id == str(agent.id)

    for bad in (
        {"country": "Kenya"},
        {"website": "javascript:alert(1)"},
        {"agent_code": "HACKED01"},
        {"status": "active"},
    ):
        assert (await client.put(f"{BASE}/profile", json=bad, headers=h)).status_code == 422
    assert (await client.put(f"{BASE}/profile", json={"agency_name": None}, headers=h)).status_code == 400


async def test_submit_kyc_requires_documents(db, client, auth_headers):
    user, agent = await _agent(db, status="pending", kyc_status=KycStatus.NOT_SUBMITTED)
    admin = await create_user(db, role="admin")
    h = auth_headers(user)
    r = await client.post(f"{BASE}/submit-kyc", headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "kyc_documents_required"

    # A non-KYC document does not count.
    await make_document(db, user, kind=DocumentKind.MEDICAL_REPORT)
    assert (await client.post(f"{BASE}/submit-kyc", headers=h)).status_code == 400
    # Another agent's KYC doc does not count either.
    other_user, other_agent = await _agent(db)
    await make_document(db, other_user, kind=DocumentKind.KYC_ID_PROOF, agent_id=other_agent.id)
    assert (await client.post(f"{BASE}/submit-kyc", headers=h)).status_code == 400

    await make_document(db, user, kind=DocumentKind.KYC_ID_PROOF, agent_id=agent.id)
    r = await client.post(f"{BASE}/submit-kyc", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["kyc_status"] == "pending" and r.json()["kyc_documents_count"] == 1
    note = (await db.execute(select(Notification).where(Notification.user_id == admin.id))).scalar_one()
    assert note.kind == "agent.kyc_submitted"
    # Idempotent while pending.
    assert (await client.post(f"{BASE}/submit-kyc", headers=h)).status_code == 200

    approved_user, _ = await _agent(db)  # factory: active agents are KYC-approved
    r = await client.post(f"{BASE}/submit-kyc", headers=auth_headers(approved_user))
    assert r.status_code == 409


async def test_referral(db, client, auth_headers):
    user, agent = await _agent(db)
    r = await client.get(f"{BASE}/referral", headers=auth_headers(user))
    assert r.status_code == 200
    assert r.json() == {
        "agent_code": agent.agent_code,
        "referral_url": f"{settings.PATIENT_WEB_URL.rstrip('/')}/register?ref={agent.agent_code}",
    }


# ------------------------------------------------------------------------------------------------- patients
async def test_create_patient_with_invite(db, client, auth_headers, run_jobs, email_outbox):
    user, agent = await _agent(db)
    h = auth_headers(user)
    payload = {
        "first_name": "Amina",
        "last_name": "Okafor",
        "email": "Amina.Okafor@Example.com",
        "phone": "+234-801-000-0000",
        "nationality": "ng",
        "date_of_birth": "1975-03-02",
        "gender": "female",
        "medical_history": "Hypertension",
        "consent_attested": True,
    }
    r = await client.post(f"{BASE}/patients", json=payload, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["full_name"] == "Amina Okafor"
    assert body["email"] == "amina.okafor@example.com"
    assert body["nationality"] == "NG"
    assert body["managed_by_agent_id"] == str(agent.id) and body["is_managed"] is True
    assert body["account_activated"] is False and body["cases_count"] == 0

    patient_user = await db.get(User, body["user_id"])
    assert patient_user is not None
    assert str(patient_user.role) == "patient" and patient_user.password_hash is None
    token = (
        await db.execute(select(VerificationToken).where(VerificationToken.user_id == patient_user.id))
    ).scalar_one()
    assert str(token.purpose) == "invite" and token.expires_at > datetime.now(UTC)

    assert await run_jobs() >= 1
    invite = [m for m in email_outbox if m["to"] == ["amina.okafor@example.com"]]
    assert len(invite) == 1
    assert agent.agency_name in invite[0]["subject"]
    assert "/accept-invite#token=" in invite[0]["html"]
    raw = invite[0]["html"].split("/accept-invite#token=")[1].split('"')[0]
    assert hash_token(raw) == token.token_hash

    # Duplicate email (any case) -> 409.
    r = await client.post(
        f"{BASE}/patients", json={**payload, "email": "AMINA.okafor@example.com"}, headers=h
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"
    existing = await create_user(db, role="hospital", email="taken@example.com")
    assert existing is not None
    r = await client.post(f"{BASE}/patients", json={**payload, "email": "taken@example.com"}, headers=h)
    assert r.status_code == 409

    # Without email: no invite.
    r = await client.post(
        f"{BASE}/patients",
        json={"first_name": "Ravi", "last_name": "K", "nationality": "BD", "consent_attested": True},
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["email"] is None


async def test_create_patient_validation_and_pending_agent(db, client, auth_headers):
    user, _ = await _agent(db)
    h = auth_headers(user)
    for bad in (
        {"first_name": "A", "last_name": "B"},
        {"first_name": " ", "last_name": "B", "nationality": "NG"},
        {"first_name": "A", "last_name": "B", "nationality": "Nigeria"},
        {"first_name": "A", "last_name": "B", "nationality": "NG", "email": "not-an-email"},
        {"first_name": "A", "last_name": "B", "nationality": "NG", "date_of_birth": "2999-01-01"},
        {"first_name": "A", "last_name": "B", "nationality": "NG", "role": "admin", "consent_attested": True},
        # Backlog #30: consent attestation is mandatory and must cover terms + privacy.
        {"first_name": "A", "last_name": "B", "nationality": "NG"},
        {"first_name": "A", "last_name": "B", "nationality": "NG", "consent_attested": False},
        {
            "first_name": "A",
            "last_name": "B",
            "nationality": "NG",
            "consent_attested": True,
            "consent_kinds": ["terms", "share_with_hospitals"],
        },
        {
            "first_name": "A",
            "last_name": "B",
            "nationality": "NG",
            "consent_attested": True,
            "consent_method": "x",
        },
    ):
        assert (await client.post(f"{BASE}/patients", json=bad, headers=h)).status_code == 422, bad
    pending_user, _ = await _agent(db, status="pending")
    r = await client.post(
        f"{BASE}/patients",
        json={"first_name": "A", "last_name": "B", "nationality": "NG", "consent_attested": True},
        headers=auth_headers(pending_user),
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "agent_not_active"


async def test_agent_created_patient_consent_flow(db, client, auth_headers):
    """Backlog #30: the agent attests consent; the patient must confirm it via POST /auth/consents."""
    user, agent = await _agent(db)
    h = auth_headers(user)
    r = await client.post(
        f"{BASE}/patients",
        json={
            "first_name": "Lina",
            "last_name": "Haddad",
            "nationality": "JO",
            "consent_attested": True,
            "consent_kinds": ["terms", "privacy", "privacy", "ai_processing"],
            "consent_method": "phone",
            "consent_note": "  Called on 12 Oct  ",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    consent = body["consent"]
    assert consent["status"] == "pending_patient_confirmation"
    assert consent["kinds"] == ["terms", "privacy", "ai_processing"]
    assert consent["pending_kinds"] == ["terms", "privacy", "ai_processing"]
    assert consent["method"] == "phone" and consent["version"]
    assert consent["attested_by_user_id"] == str(user.id) and consent["attested_at"]
    patient_user_id = body["user_id"]

    # Attestation is audit-logged, NOT stored as the patient's own consent rows.
    entry = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.action == "agent.patient_consent_attested", AuditLog.entity_id == patient_user_id
            )
        )
    ).scalar_one()
    assert entry.actor_user_id == user.id
    assert entry.after["note"] == "Called on 12 Oct" and entry.after["agent_id"] == str(agent.id)
    assert (await db.execute(select(Consent).where(Consent.user_id == patient_user_id))).first() is None
    assert await pending_agent_consents(db, uuid.UUID(patient_user_id)) == [
        ConsentKind.TERMS,
        ConsentKind.PRIVACY,
        ConsentKind.AI_PROCESSING,
    ]
    note = (
        await db.execute(
            select(Notification).where(
                Notification.user_id == patient_user_id, Notification.kind == "consent.confirmation_required"
            )
        )
    ).scalar_one()
    assert note.data["kinds"] == ["terms", "privacy", "ai_processing"]

    # The patient confirms on first login; status moves to confirmed once every attested kind is granted.
    patient_user = await db.get(User, patient_user_id)
    ph = auth_headers(patient_user)
    for kind in ("terms", "privacy"):
        r = await client.post(
            f"{API}/auth/consents",
            json={"kind": kind, "version": consent["version"], "granted": True},
            headers=ph,
        )
        assert r.status_code == 201, r.text
    r = await client.get(f"{BASE}/patients/{body['id']}", headers=h)
    assert r.json()["consent"]["status"] == "pending_patient_confirmation"
    assert r.json()["consent"]["pending_kinds"] == ["ai_processing"]
    r = await client.post(
        f"{API}/auth/consents", json={"kind": "ai_processing", "version": "v1", "granted": True}, headers=ph
    )
    assert r.status_code == 201
    r = await client.get(f"{BASE}/patients", headers=h)
    [item] = r.json()["items"]
    assert item["consent"]["status"] == "confirmed" and item["consent"]["patient_confirmed_at"]
    assert item["consent"]["pending_kinds"] == []

    # Withdrawal by the patient is visible to the agent.
    r = await client.post(
        f"{API}/auth/consents", json={"kind": "ai_processing", "version": "v1", "granted": False}, headers=ph
    )
    assert r.status_code == 201
    r = await client.get(f"{BASE}/patients/{body['id']}", headers=h)
    assert r.json()["consent"]["status"] == "withdrawn"

    # Re-attestation endpoint: managed patients only; validation as on create.
    legacy = await create_patient(db, managed_by_agent_id=agent.id)
    r = await client.get(f"{BASE}/patients/{legacy.id}", headers=h)
    assert r.json()["consent"]["status"] == "not_recorded"
    r = await client.post(f"{BASE}/patients/{legacy.id}/consent", json={"consent_attested": False}, headers=h)
    assert r.status_code == 422
    r = await client.post(f"{BASE}/patients/{legacy.id}/consent", json={"consent_attested": True}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["consent"]["status"] == "pending_patient_confirmation"
    assert r.json()["consent"]["kinds"] == ["terms", "privacy", "share_with_hospitals"]
    assert r.json()["consent"]["method"] == "in_person"
    referred = await create_patient(db, referred_by_agent_id=agent.id)
    r = await client.post(
        f"{BASE}/patients/{referred.id}/consent", json={"consent_attested": True}, headers=h
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "patient_not_managed"
    foreign = await create_patient(db)
    r = await client.post(f"{BASE}/patients/{foreign.id}/consent", json={"consent_attested": True}, headers=h)
    assert r.status_code == 404


async def test_patients_list_get_patch_scoping(db, client, auth_headers):
    user, agent = await _agent(db)
    other_user, other_agent = await _agent(db)
    managed = await create_patient(
        db, managed_by_agent_id=agent.id, referred_by_agent_id=agent.id, first_name="Zed"
    )
    referred = await create_patient(db, referred_by_agent_id=agent.id, first_name="Yara")
    foreign = await create_patient(db, managed_by_agent_id=other_agent.id)
    unrelated = await create_patient(db)
    h = auth_headers(user)

    r = await client.get(f"{BASE}/patients", headers=h)
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()["items"]}
    assert ids == {str(managed.id), str(referred.id)} and r.json()["total"] == 2
    r = await client.get(f"{BASE}/patients", params={"q": "zed"}, headers=h)
    assert [p["id"] for p in r.json()["items"]] == [str(managed.id)]
    r = await client.get(f"{BASE}/patients", params={"q": "%"}, headers=h)
    assert r.json()["total"] == 0

    assert (await client.get(f"{BASE}/patients/{referred.id}", headers=h)).status_code == 200
    for pid in (foreign.id, unrelated.id):
        assert (await client.get(f"{BASE}/patients/{pid}", headers=h)).status_code == 404
        assert (
            await client.patch(f"{BASE}/patients/{pid}", json={"phone": "1"}, headers=h)
        ).status_code == 404

    # Referred-but-not-managed patients are read-only for the agent.
    r = await client.patch(f"{BASE}/patients/{referred.id}", json={"phone": "123"}, headers=h)
    assert r.status_code == 403

    r = await client.patch(
        f"{BASE}/patients/{managed.id}",
        json={
            "first_name": "Zack",
            "passport_number": "a1234 5678",
            "insurance_policy_number": "POL-99887766",
            "emergency_contact": {"name": "Sam", "relationship": "brother", "phone": "+1-555"},
            "preferred_currency": "eur",
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["first_name"] == "Zack" and body["full_name"].startswith("Zack")
    assert body["passport_last4"] == "5678" and "passport_number" not in body
    assert body["insurance_policy_last4"] == "7766"
    assert body["emergency_contact"] == {"name": "Sam", "relationship": "brother", "phone": "+1-555"}
    assert body["preferred_currency"] == "EUR"
    managed_id, foreign_id = managed.id, foreign.id
    other_h = auth_headers(other_user)
    db.expire_all()
    profile = await db.get(PatientProfile, managed_id)
    assert profile is not None and profile.passport_number == "A12345678"
    patient_user = await db.get(User, profile.user_id)
    assert patient_user is not None and patient_user.full_name.startswith("Zack")
    audit = (await db.execute(select(AuditLog).where(AuditLog.action == "agent.patient_update"))).scalar_one()
    assert "A12345678" not in str(audit.after)

    assert (
        await client.patch(f"{BASE}/patients/{managed_id}", json={"first_name": None}, headers=h)
    ).status_code == 400
    # The other agent cannot see these patients.
    r = await client.get(f"{BASE}/patients", headers=other_h)
    assert {p["id"] for p in r.json()["items"]} == {str(foreign_id)}


async def test_patch_email_rules(db, client, auth_headers, run_jobs, email_outbox):
    user, agent = await _agent(db)
    h = auth_headers(user)
    r = await client.post(
        f"{BASE}/patients",
        json={"first_name": "No", "last_name": "Mail", "nationality": "KE", "consent_attested": True},
        headers=h,
    )
    pid = r.json()["id"]
    r = await client.patch(f"{BASE}/patients/{pid}", json={"email": "late@example.com"}, headers=h)
    assert r.status_code == 200 and r.json()["email"] == "late@example.com"
    await run_jobs()
    assert [m["to"] for m in email_outbox] == [["late@example.com"]]

    await create_user(db, role="patient", email="dup@example.com")
    r = await client.patch(f"{BASE}/patients/{pid}", json={"email": "dup@example.com"}, headers=h)
    assert r.status_code == 409

    # Activated accounts (with a password) keep their email.
    activated = await create_patient(db, managed_by_agent_id=agent.id)
    r = await client.patch(f"{BASE}/patients/{activated.id}", json={"email": "new@example.com"}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "email_locked"


async def test_patch_email_locked_after_google_activation(db, client, auth_headers):
    """SEC-056: a managed patient who activated with Google (no password) must keep control of their email;
    otherwise the agent re-points it, accepts the new invite and takes over the account."""
    user, agent = await _agent(db)
    h = auth_headers(user)
    for marker in (
        {"google_sub": f"g-{uuid.uuid4().hex}"},
        {"email_verified_at": datetime.now(UTC)},
        {"last_login_at": datetime.now(UTC)},
    ):
        r = await client.post(
            f"{BASE}/patients",
            json={
                "first_name": "Goo",
                "last_name": "Gle",
                "email": f"p-{uuid.uuid4().hex[:8]}@example.com",
                "nationality": "KE",
                "consent_attested": True,
            },
            headers=h,
        )
        assert r.status_code == 201, r.text
        patient_user = await db.get(User, uuid.UUID(r.json()["user_id"]))
        for key, value in marker.items():
            setattr(patient_user, key, value)
        await db.commit()
        r2 = await client.patch(
            f"{BASE}/patients/{r.json()['id']}", json={"email": "agent-owned@example.com"}, headers=h
        )
        assert r2.status_code == 400 and r2.json()["error"]["code"] == "email_locked", (marker, r2.text)
        assert r.json()["account_activated"] is False
        r3 = await client.get(f"{BASE}/patients/{r.json()['id']}", headers=h)
        assert r3.json()["account_activated"] is True


# ---------------------------------------------------------------------------------- dashboard & commissions
async def test_dashboard_and_commissions(db, client, auth_headers):
    user, agent = await _agent(db)
    other_user, other_agent = await _agent(db)
    hospital = await create_hospital(db)
    p1 = await create_patient(db, managed_by_agent_id=agent.id)
    p2 = await create_patient(db, referred_by_agent_id=agent.id)
    await create_patient(db, managed_by_agent_id=other_agent.id)

    c1 = await create_case(db, p1, hospital, agent_id=agent.id, status="booked")
    c2 = await create_case(db, p2, hospital, status="enquiry")  # referred patient's case without agent_id
    c3 = await create_case(db, p1, hospital, agent_id=agent.id, status="cancelled")
    b1 = await create_booking(db, c1, status="confirmed", confirmed_at=datetime.now(UTC))
    other_patient = await create_patient(db)
    other_case = await create_case(db, other_patient, hospital, agent_id=other_agent.id)
    other_booking = await create_booking(db, other_case, status="confirmed")

    db.add_all(
        [
            SettlementItem(
                payee_type="agent",
                payee_id=agent.id,
                booking_id=b1.id,
                gross_minor=20_000_00,
                net_minor=20_000_00,
                status="pending",
            ),
            SettlementItem(
                payee_type="agent",
                payee_id=agent.id,
                booking_id=b1.id,
                gross_minor=5_000_00,
                net_minor=5_000_00,
                status="paid",
            ),
            SettlementItem(
                payee_type="agent",
                payee_id=agent.id,
                booking_id=b1.id,
                gross_minor=-1_000_00,
                net_minor=-1_000_00,
                status="eligible",
            ),
            SettlementItem(
                payee_type="agent",
                payee_id=other_agent.id,
                booking_id=other_booking.id,
                gross_minor=9_999_00,
                net_minor=9_999_00,
                status="pending",
            ),
            SettlementItem(
                payee_type="hospital",
                payee_id=agent.id,
                booking_id=b1.id,
                gross_minor=1,
                net_minor=1,
                status="pending",
            ),
        ]
    )
    await db.commit()

    r = await client.get(f"{BASE}/dashboard", headers=auth_headers(user))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["patients_total"] == 2
    assert d["active_cases"] == 2  # c1 booked + c2 enquiry; c3 cancelled
    assert d["bookings_confirmed"] == 1
    assert d["commission_pending_minor"] == 19_000_00
    assert d["commission_paid_minor"] == 5_000_00
    assert d["currency"] == "INR"
    assert d["conversion_rate"] == round(1 / 3, 4)
    assert len(d["monthly"]) == 6
    this_month = datetime.now(UTC).strftime("%Y-%m")
    assert d["monthly"][-1] == {"month": this_month, "cases": 3, "bookings": 1, "commission_minor": 24_000_00}
    recent_ids = [c["id"] for c in d["recent_cases"]]
    assert set(recent_ids) == {str(c1.id), str(c2.id), str(c3.id)}
    case1 = next(c for c in d["recent_cases"] if c["id"] == str(c1.id))
    assert case1["booking"]["booking_number"] == b1.booking_number
    assert case1["agent"]["agency_name"] == agent.agency_name
    assert case1["hospital"]["name"] == hospital.name
    assert case1["patient"]["full_name"] == p1.full_name

    r = await client.get(f"{BASE}/commissions", headers=auth_headers(user))
    assert r.status_code == 200
    page = r.json()
    assert page["total"] == 3
    assert {i["booking_number"] for i in page["items"]} == {b1.booking_number}
    assert all(i["payee_name"] == agent.agency_name for i in page["items"])
    r = await client.get(f"{BASE}/commissions", params={"status": "paid"}, headers=auth_headers(user))
    assert [i["net_minor"] for i in r.json()["items"]] == [5_000_00]
    assert (
        await client.get(f"{BASE}/commissions", params={"status": "bogus"}, headers=auth_headers(user))
    ).status_code == 422

    r = await client.get(f"{BASE}/commissions", headers=auth_headers(other_user))
    assert r.json()["total"] == 1

    # Counts per patient.
    r = await client.get(f"{BASE}/patients/{p1.id}", headers=auth_headers(user))
    assert r.json()["cases_count"] == 2


# ---------------------------------------------------------------------------------- list filters (tables)
async def test_patients_list_filters_sort_and_counts(db, client, auth_headers):
    user, agent = await _agent(db)
    hospital = await create_hospital(db)
    alice = await create_patient(db, managed_by_agent_id=agent.id, first_name="Alice", nationality="NG")
    bola = await create_patient(db, managed_by_agent_id=agent.id, first_name="Bola", nationality="NG")
    cyra = await create_patient(db, referred_by_agent_id=agent.id, first_name="Cyra", nationality="KE")
    await create_case(db, alice, hospital, agent_id=agent.id, status="quoted")
    await create_case(db, bola, hospital, agent_id=agent.id, status="cancelled")
    # Cyra consented herself (referred, no attestation) -> confirmed; the others -> not_recorded.
    for kind in (ConsentKind.TERMS, ConsentKind.PRIVACY):
        db.add(Consent(user_id=cyra.user_id, kind=kind, granted=True, version="v1"))
    await db.commit()
    h = auth_headers(user)

    async def ids(**params):
        r = await client.get(f"{BASE}/patients", params=params, headers=h)
        assert r.status_code == 200, r.text
        return [p["id"] for p in r.json()["items"]]

    assert set(await ids(nationality=["ng"])) == {str(alice.id), str(bola.id)}
    assert await ids(has_active_case="true") == [str(alice.id)]
    assert set(await ids(has_active_case="false")) == {str(bola.id), str(cyra.id)}
    assert await ids(consent="confirmed") == [str(cyra.id)]
    assert set(await ids(consent=["not_recorded", "withdrawn"])) == {str(alice.id), str(bola.id)}
    assert await ids(consent="confirmed", nationality="NG") == []
    assert await ids(sort="name") == [str(alice.id), str(bola.id), str(cyra.id)]
    assert await ids(sort="-name") == [str(cyra.id), str(bola.id), str(alice.id)]
    today = today_ist().isoformat()  # the filter uses India calendar days
    assert len(await ids(created_from="2000-01-01", created_to="2000-12-31")) == 0
    assert len(await ids(created_to=today, created_from="2000-01-01")) == 3
    assert (await client.get(f"{BASE}/patients", params={"sort": "email"}, headers=h)).status_code == 422
    assert (await client.get(f"{BASE}/patients", params={"consent": "bogus"}, headers=h)).status_code == 422

    r = await client.get(f"{BASE}/patients", params={"q": "alice"}, headers=h)
    body = r.json()["items"][0]
    assert body["cases_count"] == 1 and body["active_cases_count"] == 1

    r = await client.get(f"{BASE}/patients/counts", headers=h)
    assert r.status_code == 200, r.text
    counts = r.json()
    assert counts["total"] == 3
    assert counts["counts"]["confirmed"] == 1 and counts["counts"]["not_recorded"] == 2
    assert counts["counts"]["pending_patient_confirmation"] == 0
    assert counts["nationalities"] == {"NG": 2, "KE": 1}
    # each facet ignores its own filter but honours the others
    r = await client.get(
        f"{BASE}/patients/counts", params={"consent": "confirmed", "nationality": "NG"}, headers=h
    )
    counts = r.json()
    assert counts["counts"]["confirmed"] == 0 and counts["counts"]["not_recorded"] == 2
    assert counts["nationalities"] == {"KE": 1}
    # scoped to the agency
    other_user, _ = await _agent(db)
    r = await client.get(f"{BASE}/patients/counts", headers=auth_headers(other_user))
    assert r.json()["total"] == 0


async def test_commissions_filters_sort_and_status_counts(db, client, auth_headers):
    user, agent = await _agent(db)
    other_user, other_agent = await _agent(db)
    h1 = await create_hospital(db, name="Sunrise Heart Institute")
    h2 = await create_hospital(db)
    p1 = await create_patient(db, managed_by_agent_id=agent.id, first_name="Ngozi", last_name="Adeyemi")
    b1 = await create_booking(db, await create_case(db, p1, h1, agent_id=agent.id, status="booked"))
    b2 = await create_booking(db, await create_case(db, p1, h2, agent_id=agent.id, status="booked"))
    other_patient = await create_patient(db, managed_by_agent_id=other_agent.id)
    other_booking = await create_booking(
        db, await create_case(db, other_patient, h1, agent_id=other_agent.id)
    )

    def item(booking, net, status, payee=agent):
        return SettlementItem(
            payee_type="agent",
            payee_id=payee.id,
            booking_id=booking.id,
            gross_minor=net,
            net_minor=net,
            status=status,
        )

    db.add_all(
        [
            item(b1, 10_000_00, "pending"),
            item(b1, 2_000_00, "paid"),
            item(b2, 7_000_00, "eligible"),
            item(b2, -500_00, "reversed"),
            item(other_booking, 9_999_00, "pending", payee=other_agent),
        ]
    )
    await db.commit()
    h = auth_headers(user)

    async def nets(**params):
        r = await client.get(f"{BASE}/commissions", params=params, headers=h)
        assert r.status_code == 200, r.text
        return [i["net_minor"] for i in r.json()["items"]]

    assert sorted(await nets(status=["pending", "eligible"])) == [7_000_00, 10_000_00]
    assert sorted(await nets(hospital_id=str(h1.id))) == [2_000_00, 10_000_00]
    assert sorted(await nets(q="sunrise")) == [2_000_00, 10_000_00]
    assert len(await nets(q="ngozi adey")) == 4
    assert sorted(await nets(q=b2.booking_number)) == [-500_00, 7_000_00]
    assert await nets(min_net=5_000_00, max_net=9_000_00) == [7_000_00]
    assert await nets(sort="net_minor") == [-500_00, 2_000_00, 7_000_00, 10_000_00]
    assert await nets(sort="-net_minor") == [10_000_00, 7_000_00, 2_000_00, -500_00]
    assert await nets(created_from="2000-01-01", created_to="2000-01-31") == []
    assert (
        await client.get(f"{BASE}/commissions", params={"sort": "payee_id"}, headers=h)
    ).status_code == 422

    r = await client.get(
        f"{BASE}/commissions", params={"hospital_id": str(h1.id), "sort": "net_minor"}, headers=h
    )
    first = r.json()["items"][0]
    assert first["hospital_name"] == "Sunrise Heart Institute" and first["hospital_id"] == str(h1.id)
    assert first["patient_name"] == "Ngozi Adeyemi" and first["patient_id"] == str(p1.id)
    assert first["case_number"] and first["case_id"] and first["booking_number"] == b1.booking_number

    r = await client.get(f"{BASE}/commissions/status-counts", params={"status": "paid"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 4
    assert body["counts"] == {
        "pending": 1,
        "eligible": 1,
        "on_hold": 0,
        "batched": 0,
        "paid": 1,
        "reversed": 1,
    }
    assert body["net_minor"]["pending"] == 10_000_00 and body["net_minor"]["reversed"] == -500_00
    r = await client.get(f"{BASE}/commissions/status-counts", params={"hospital_id": str(h2.id)}, headers=h)
    assert r.json()["total"] == 2
    r = await client.get(f"{BASE}/commissions/status-counts", headers=auth_headers(other_user))
    assert r.json()["total"] == 1 and r.json()["counts"]["pending"] == 1
