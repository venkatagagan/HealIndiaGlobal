"""Admin console API (PLAN 8.13): role gates, users/staff, approvals, catalog CRUD, settings, audit logs."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy import func, select

from app.core import cache
from app.core.enums import AgentStatus, HospitalStatus, KycStatus, UserRole, UserStatus
from app.core.money import get_fx_rate
from app.core.security import hash_token
from app.core.settings_store import get_setting
from app.models import Agent, AuditLog, Doctor, Document, Hospital, RefreshToken, User
from app.modules.admin import service as admin_service
from tests.factories import (
    create_agent,
    create_doctor,
    create_hospital,
    create_patient,
    create_procedure,
    create_specialty,
)

API = "/api/v1"


@pytest.fixture
def published(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, Any]]]:
    """Record domain events published by the admin service (the real publish still runs)."""
    calls: list[tuple[str, dict[str, Any]]] = []
    original = admin_service.publish

    async def spy(db: Any, name: str, payload: dict[str, Any] | None = None) -> int:
        calls.append((name, dict(payload or {})))
        return await original(db, name, payload)

    monkeypatch.setattr(admin_service, "publish", spy)
    return calls


async def _kyc_document(db: Any, owner: Any, *, hospital: Any = None, agent: Any = None) -> Document:
    """SEC-045: approvals need the KYC document on file."""
    doc = Document(
        owner_user_id=owner.id,
        hospital_id=hospital.id if hospital is not None else None,
        agent_id=agent.id if agent is not None else None,
        kind="kyc_registration" if hospital is not None else "kyc_id_proof",
        file_name="kyc.pdf",
        content_type="application/pdf",
        size_bytes=10,
        storage_key=f"documents/kyc-{uuid.uuid4().hex}.pdf",
        sha256="0" * 64,
    )
    db.add(doc)
    await db.commit()
    return doc


async def _audit_actions(db: Any, entity_id: Any) -> list[str]:
    rows = await db.execute(
        select(AuditLog.action).where(AuditLog.entity_id == str(entity_id)).order_by(AuditLog.created_at)
    )
    return list(rows.scalars().all())


# -------------------------------------------------------------------------------------------- role matrix
@pytest.mark.parametrize("role", ["patient", "agent", "hospital"])
async def test_non_staff_roles_are_forbidden(client, make_user, auth_headers, role):
    user = await make_user(role=role)
    h = auth_headers(user)
    for path in (
        "/admin/dashboard",
        "/admin/users",
        "/admin/hospitals",
        "/admin/settings",
        "/admin/audit-logs",
    ):
        r = await client.get(f"{API}{path}", headers=h)
        assert r.status_code == 403, (path, r.text)
    r = await client.post(f"{API}/admin/specialties", json={"slug": "x-y", "name": "XY"}, headers=h)
    assert r.status_code == 403


async def test_unauthenticated_is_401(client):
    r = await client.get(f"{API}/admin/dashboard")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_support_is_read_only(client, db, make_user, auth_headers):
    support = await make_user(role="support")
    h = auth_headers(support)
    hospital = await create_hospital(db, status="pending_review")
    target = await make_user(role="patient")
    reads = [
        "/admin/dashboard",
        "/admin/users",
        f"/admin/users/{target.id}",
        "/admin/hospitals",
        f"/admin/hospitals/{hospital.id}",
        "/admin/agents",
        "/admin/specialties",
        "/admin/procedures",
        "/admin/cost-benchmarks",
        "/admin/cultural-tips",
        "/admin/accommodation-providers",
        "/admin/service-providers",
        "/admin/fx-rates",
        "/admin/settings",
        "/admin/audit-logs",
        "/admin/reports/revenue",
        "/admin/reports/cases",
        "/admin/staff",
    ]
    for path in reads:
        r = await client.get(f"{API}{path}", headers=h)
        assert r.status_code == 200, (path, r.text)

    writes = [
        ("post", f"/admin/hospitals/{hospital.id}/approve", {}),
        ("post", f"/admin/hospitals/{hospital.id}/reject", {"reason": "Missing documents"}),
        ("patch", f"/admin/hospitals/{hospital.id}", {"is_featured": True}),
        ("patch", f"/admin/users/{target.id}", {"status": "suspended"}),
        (
            "post",
            "/admin/users",
            {"email": "s@x.test", "full_name": "S X", "role": "support", "password": "x"},
        ),
        ("post", "/admin/specialties", {"slug": "abc", "name": "ABC"}),
        ("put", "/admin/settings/helplines", {"value": {"24x7": "1"}}),
        ("put", "/admin/settings/deposit_pct", {"value": 30}),
    ]
    for method, path, body in writes:
        r = await client.request(method.upper(), f"{API}{path}", json=body, headers=h)
        assert r.status_code == 403, (method, path, r.text)
    await db.refresh(hospital)
    assert hospital.status == HospitalStatus.PENDING_REVIEW


# ----------------------------------------------------------------------------------------------- settings
async def test_settings_finance_keys_only_finance(client, db, make_user, auth_headers):
    finance = await make_user(role="finance")
    admin = await make_user(role="admin")
    super_admin = await make_user(role="super_admin")

    r = await client.put(
        f"{API}/admin/settings/deposit_pct", json={"value": 25}, headers=auth_headers(finance)
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["value"] == 25 and body["is_default"] is False and body["is_finance"] is True
    assert body["updated_by"] == str(finance.id)
    assert await get_setting(db, "deposit_pct") == 25

    r = await client.put(
        f"{API}/admin/settings/supported_currencies", json={"value": ["USD"]}, headers=auth_headers(finance)
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "admin_required"

    r = await client.put(f"{API}/admin/settings/deposit_pct", json={"value": 30}, headers=auth_headers(admin))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "finance_required"

    r = await client.put(
        f"{API}/admin/settings/supported_currencies",
        json={"value": ["USD", "INR"]},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    # website & contact settings (helplines included) are super_admin only (tests/modules/test_site_config.py)
    r = await client.put(
        f"{API}/admin/settings/helplines",
        json={"value": {"24x7": "+91 98765 43210", "emergency": "112"}},
        headers=auth_headers(admin),
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "super_admin_required"

    # super_admin may change both kinds
    for key, value in (("gst_rate_bps", 1200), ("supported_currencies", ["usd", "inr"])):
        r = await client.put(
            f"{API}/admin/settings/{key}", json={"value": value}, headers=auth_headers(super_admin)
        )
        assert r.status_code == 200, r.text
    assert r.json()["value"] == ["USD", "INR"]

    # validation
    h = auth_headers(super_admin)
    for key, value in (
        ("deposit_pct", 150),
        ("deposit_pct", "20"),
        ("refund_policy", [{"days_before": -1, "refund_pct": 50}]),
        ("helplines", ["not", "an", "object"]),
        ("settlement_cycle_days", 0),
    ):
        r = await client.put(f"{API}/admin/settings/{key}", json={"value": value}, headers=h)
        assert r.status_code == 400, (key, value, r.text)
        assert r.json()["error"]["code"] == "invalid_setting"
    r = await client.put(f"{API}/admin/settings/deposit_pct", json={"value": None}, headers=h)
    assert r.status_code == 400
    r = await client.put(f"{API}/admin/settings/no_such_key", json={"value": 1}, headers=h)
    assert r.status_code == 404
    r = await client.put(f"{API}/admin/settings/deposit_pct", json={}, headers=h)
    assert r.status_code == 422

    r = await client.get(f"{API}/admin/settings", headers=auth_headers(admin))
    settings_by_key = {s["key"]: s for s in r.json()}
    assert settings_by_key["deposit_pct"]["value"] == 25
    assert settings_by_key["deposit_pct"]["updated_by_name"] == finance.full_name
    assert settings_by_key["settlement_hold_days"]["is_default"] is True
    assert settings_by_key["refund_policy"]["is_finance"] is True

    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.action == "settings.update", AuditLog.entity_id == "deposit_pct")
        )
    ).scalar_one()
    assert logs.actor_user_id == finance.id
    assert logs.after == {"value": 25}
    assert logs.ip is not None


# ------------------------------------------------------------------------------- doctor registration
async def test_doctor_registration_verify_and_unverify(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    hospital = await create_hospital(db)
    spec = await create_specialty(db)
    doc = await create_doctor(
        db, hospital, spec, registration_number="MMC/2009/04512", registration_council="maharashtra"
    )
    bare = await create_doctor(db, hospital, spec)
    doc_id, bare_id, admin_id = doc.id, bare.id, admin.id
    h = auth_headers(admin)

    # only admin / super_admin may verify
    for role in ("support", "finance", "hospital", "patient"):
        other = await make_user(role=role)
        verify_url = f"{API}/admin/doctors/{doc_id}/verify-registration"
        r = await client.post(verify_url, headers=auth_headers(other))
        assert r.status_code == 403, role
    assert (await client.post(f"{API}/admin/doctors/{doc_id}/verify-registration")).status_code == 401

    # nothing to verify without number + council
    r = await client.post(f"{API}/admin/doctors/{bare_id}/verify-registration", headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "registration_missing"
    r = await client.post(f"{API}/admin/doctors/{uuid.uuid4()}/verify-registration", headers=h)
    assert r.status_code == 404

    r = await client.post(f"{API}/admin/doctors/{doc_id}/verify-registration", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["registration_verified"] is True and body["registration_verified_at"]
    assert body["registration_verified_by_user_id"] == str(admin_id)
    assert (await client.get(f"{API}/doctors/{doc_id}")).json()["registration_verified"] is True

    detail = (await client.get(f"{API}/admin/hospitals/{hospital.id}", headers=h)).json()
    assert {d["id"]: d["registration_verified"] for d in detail["doctors"]} == {
        str(doc_id): True,
        str(bare_id): False,
    }

    super_admin = await make_user(role="super_admin")
    r = await client.post(
        f"{API}/admin/doctors/{doc_id}/unverify-registration", headers=auth_headers(super_admin)
    )
    assert r.status_code == 200 and r.json()["registration_verified"] is False
    assert r.json()["registration_verified_by_user_id"] is None
    assert (await client.get(f"{API}/doctors/{doc_id}")).json()["registration_verified"] is False

    assert await _audit_actions(db, doc_id) == ["doctor.registration_verify", "doctor.registration_unverify"]
    db.expire_all()
    fresh = await db.get(Doctor, doc_id)
    assert fresh.registration_verified_at is None and fresh.registration_verified_by_user_id is None


# ------------------------------------------------------------------------------------------ hospital flow
async def test_hospital_approval_publishes_event_and_activates(
    client, db, make_user, auth_headers, published
):
    admin = await make_user(role="admin")
    owner = await make_user(role="hospital")
    hospital = await create_hospital(db, owner=owner, status="pending_review", kyc_status=KycStatus.PENDING)
    spec = await create_specialty(db)
    await create_doctor(
        db,
        hospital,
        spec,
        full_name="Dr. A Registered",
        registration_number="12345",
        registration_council="nmc",
    )
    await create_doctor(db, hospital, spec, full_name="Dr. B Unregistered")
    await create_doctor(db, hospital, spec, full_name="Dr. C Inactive", is_active=False)
    h = auth_headers(admin)

    r = await client.get(f"{API}/admin/hospitals", params={"status": "pending_review"}, headers=h)
    assert r.status_code == 200
    assert [x["id"] for x in r.json()["items"]] == [str(hospital.id)]

    # SEC-045: no approval without the KYC registration document
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/approve", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "kyc_documents_missing"
    kyc = await _kyc_document(db, owner, hospital=hospital)
    kyc_id = kyc.id

    # approval warns (does not block) about active doctors without a medical registration
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/approve", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["doctors_count"] == 3 and body["doctors_missing_registration"] == 1
    assert len(body["warnings"]) == 1 and "registration" in body["warnings"][0]
    regs = {d["full_name"]: d for d in body["doctors"]}
    assert regs["Dr. A Registered"]["registration_council_name"].startswith("National Medical Commission")
    assert regs["Dr. B Unregistered"]["registration_number"] is None
    assert body["status"] == "active" and body["kyc_status"] == "approved"
    assert body["approved_by"] == str(admin.id) and body["approved_at"]
    assert [m["user_id"] for m in body["members"]] == [str(owner.id)]
    assert ("hospital.approved", {"hospital_id": str(hospital.id)}) in published

    hospital_id = hospital.id
    db.expire_all()
    fresh = await db.get(Hospital, hospital_id)
    assert fresh is not None and fresh.status == HospitalStatus.ACTIVE
    assert "hospital.approve" in await _audit_actions(db, hospital_id)
    verified = await db.get(Document, kyc_id)
    assert verified is not None and verified.status == "verified"
    assert str(verified.verified_by) == body["approved_by"]
    approve_log = (
        await db.execute(select(AuditLog).where(AuditLog.action == "hospital.approve"))
    ).scalar_one()
    assert approve_log.after["kyc_documents_verified"][0]["id"] == str(kyc_id)
    hospital = fresh

    # approving again is a state error
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/approve", headers=h)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "invalid_status"

    # suspend -> reinstate (previously approved -> active again)
    r = await client.post(
        f"{API}/admin/hospitals/{hospital.id}/suspend", json={"reason": "Complaints"}, headers=h
    )
    assert r.status_code == 200 and r.json()["status"] == "suspended"
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/suspend", json={}, headers=h)
    assert r.status_code == 409
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/reinstate", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "active"


async def test_hospital_reject_requires_reason_and_publishes(client, db, make_user, auth_headers, published):
    admin = await make_user(role="super_admin")
    hospital = await create_hospital(db, status="pending_review")
    h = auth_headers(admin)
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/reject", json={}, headers=h)
    assert r.status_code == 422
    r = await client.post(
        f"{API}/admin/hospitals/{hospital.id}/reject", json={"reason": "PAN document unreadable"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"
    assert r.json()["rejection_reason"] == "PAN document unreadable"
    assert (
        "hospital.rejected",
        {"hospital_id": str(hospital.id), "reason": "PAN document unreadable"},
    ) in published
    # a draft hospital cannot be approved
    draft = await create_hospital(db, status="draft")
    r = await client.post(f"{API}/admin/hospitals/{draft.id}/approve", headers=h)
    assert r.status_code == 409
    r = await client.post(f"{API}/admin/hospitals/{hospital.id}/approve", headers=h)
    assert r.status_code == 409
    r = await client.post(f"{API}/admin/hospitals/00000000-0000-7000-8000-000000000000/approve", headers=h)
    assert r.status_code == 404


async def test_hospital_patch_commission_by_finance(client, db, make_user, auth_headers):
    finance = await make_user(role="finance")
    support = await make_user(role="support")
    hospital = await create_hospital(db)
    r = await client.patch(
        f"{API}/admin/hospitals/{hospital.id}",
        json={"commission_rate_bps": 1200, "settlement_cycle_days": 14, "is_featured": True},
        headers=auth_headers(finance),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["commission_rate_bps"], body["settlement_cycle_days"], body["is_featured"]) == (
        1200,
        14,
        True,
    )
    r = await client.patch(
        f"{API}/admin/hospitals/{hospital.id}",
        json={"commission_rate_bps": None},
        headers=auth_headers(finance),
    )
    assert r.status_code == 200 and r.json()["commission_rate_bps"] is None
    for bad in ({"commission_rate_bps": 10_001}, {"settlement_cycle_days": 0}, {}, {"is_featured": None}):
        r = await client.patch(
            f"{API}/admin/hospitals/{hospital.id}", json=bad, headers=auth_headers(finance)
        )
        assert r.status_code == 422, bad
    r = await client.patch(
        f"{API}/admin/hospitals/{hospital.id}", json={"is_featured": False}, headers=auth_headers(support)
    )
    assert r.status_code == 403
    assert (await _audit_actions(db, hospital.id)).count("hospital.update") == 2


# --------------------------------------------------------------------------------------------- agent flow
async def test_agent_approval_and_rejection(client, db, make_user, auth_headers, published):
    admin = await make_user(role="admin")
    h = auth_headers(admin)
    pending = await create_agent(db, status="pending")
    other = await create_agent(db, status="pending")
    await create_patient(db, managed_by_agent_id=pending.id)

    r = await client.get(
        f"{API}/admin/agents", params={"status": "pending", "q": pending.agency_name}, headers=h
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert [a["id"] for a in items] == [str(pending.id)]
    assert items[0]["patients_count"] == 1 and items[0]["email"]

    r = await client.post(f"{API}/admin/agents/{pending.id}/approve", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "kyc_documents_missing"  # SEC-045
    agent_user = await db.get(User, pending.user_id)
    await _kyc_document(db, agent_user, agent=pending)
    r = await client.post(f"{API}/admin/agents/{pending.id}/approve", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active" and r.json()["kyc_status"] == "approved"
    assert ("agent.approved", {"agent_id": str(pending.id)}) in published
    r = await client.post(f"{API}/admin/agents/{pending.id}/approve", headers=h)
    assert r.status_code == 409

    r = await client.post(
        f"{API}/admin/agents/{other.id}/reject", json={"reason": "Licence expired"}, headers=h
    )
    assert r.status_code == 200
    assert r.json()["status"] == "rejected" and r.json()["rejection_reason"] == "Licence expired"
    assert ("agent.rejected", {"agent_id": str(other.id), "reason": "Licence expired"}) in published

    r = await client.post(f"{API}/admin/agents/{pending.id}/suspend", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "suspended"
    r = await client.post(f"{API}/admin/agents/{pending.id}/reinstate", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "active"

    finance = await make_user(role="finance")
    r = await client.patch(
        f"{API}/admin/agents/{pending.id}",
        json={"commission_rate_bps": 700, "tier": "gold"},
        headers=auth_headers(finance),
    )
    assert r.status_code == 200, r.text
    assert (r.json()["commission_rate_bps"], r.json()["tier"]) == (700, "gold")
    r = await client.patch(f"{API}/admin/agents/{pending.id}", json={"tier": "platinum"}, headers=h)
    assert r.status_code == 422

    r = await client.get(f"{API}/admin/agents/{pending.id}", headers=h)
    assert r.status_code == 200
    assert [(d["kind"], d["status"]) for d in r.json()["kyc_documents"]] == [("kyc_id_proof", "verified")]
    actions = await _audit_actions(db, pending.id)
    assert actions == ["agent.approve", "agent.suspend", "agent.reinstate", "agent.update"]
    other_id = other.id
    db.expire_all()
    rows = await db.execute(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == "agent"))
    assert rows.scalar_one() == 5
    fresh = await db.get(Agent, other_id)
    assert fresh is not None and fresh.status == AgentStatus.REJECTED


# --------------------------------------------------------------------------------------------- user guards
async def test_last_super_admin_guard_and_self_change(client, make_user, auth_headers):
    root = await make_user(role="super_admin")
    h = auth_headers(root)
    r = await client.patch(f"{API}/admin/users/{root.id}", json={"role": "admin"}, headers=h)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "last_super_admin"
    r = await client.patch(f"{API}/admin/users/{root.id}", json={"status": "suspended"}, headers=h)
    assert r.status_code == 409

    second = await make_user(role="super_admin")
    r = await client.patch(f"{API}/admin/users/{root.id}", json={"role": "admin"}, headers=h)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "self_role_change"
    # another super_admin may demote root now that two exist
    r = await client.patch(
        f"{API}/admin/users/{root.id}", json={"role": "admin"}, headers=auth_headers(second)
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"
    # now `second` is the last one
    r = await client.patch(
        f"{API}/admin/users/{second.id}", json={"status": "suspended"}, headers=auth_headers(second)
    )
    assert r.status_code == 409


async def test_admin_cannot_touch_super_admins_or_public_roles(client, make_user, auth_headers):
    admin = await make_user(role="admin")
    root = await make_user(role="super_admin")
    patient = await make_user(role="patient")
    support = await make_user(role="support")
    h = auth_headers(admin)
    r = await client.patch(f"{API}/admin/users/{root.id}", json={"status": "suspended"}, headers=h)
    assert r.status_code == 403
    r = await client.patch(f"{API}/admin/users/{support.id}", json={"role": "super_admin"}, headers=h)
    assert r.status_code == 403
    r = await client.patch(f"{API}/admin/users/{patient.id}", json={"role": "admin"}, headers=h)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_role_change"
    # SEC-013: granting finance or admin is a super_admin decision; moving staff down to support is not.
    for role in ("finance", "admin"):
        r = await client.patch(f"{API}/admin/users/{support.id}", json={"role": role}, headers=h)
        assert r.status_code == 403 and r.json()["error"]["code"] == "super_admin_required", role
    r = await client.post(
        f"{API}/admin/users",
        json={
            "email": "fin@healindia.example.com",
            "full_name": "Fin Ance",
            "role": "finance",
            "password": "Str0ng!Passw0rd#1",
        },
        headers=h,
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "super_admin_required"
    r = await client.patch(
        f"{API}/admin/users/{support.id}", json={"role": "finance"}, headers=auth_headers(root)
    )
    assert r.status_code == 200 and r.json()["role"] == "finance"
    r = await client.patch(f"{API}/admin/users/{support.id}", json={"role": "support"}, headers=h)
    assert r.status_code == 200 and r.json()["role"] == "support"
    r = await client.patch(f"{API}/admin/users/{admin.id}", json={"status": "suspended"}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "self_status_change"
    r = await client.patch(f"{API}/admin/users/{patient.id}", json={}, headers=h)
    assert r.status_code == 422


async def test_suspend_user_revokes_sessions_and_blocks_access(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    patient = await make_user(role="patient")
    from datetime import UTC, datetime, timedelta

    from app.core.ids import uuid7

    db.add(
        RefreshToken(
            user_id=patient.id,
            token_hash=hash_token("raw-refresh"),
            family_id=uuid7(),
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
    )
    await db.commit()
    r = await client.get(f"{API}/admin/users/{patient.id}", headers=auth_headers(admin))
    assert r.json()["active_sessions"] == 1

    r = await client.patch(
        f"{API}/admin/users/{patient.id}", json={"status": "suspended"}, headers=auth_headers(admin)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "suspended" and r.json()["active_sessions"] == 0
    r = await client.get(f"{API}/auth/me", headers=auth_headers(patient))
    assert r.status_code == 403

    r = await client.patch(
        f"{API}/admin/users/{patient.id}", json={"status": "deleted"}, headers=auth_headers(admin)
    )
    assert r.json()["deleted_at"] is not None
    r = await client.patch(
        f"{API}/admin/users/{patient.id}", json={"status": "active"}, headers=auth_headers(admin)
    )
    assert r.json()["deleted_at"] is None and r.json()["status"] == "active"
    patient_id = patient.id
    db.expire_all()
    logs = (
        (
            await db.execute(
                select(AuditLog).where(AuditLog.entity_id == str(patient_id)).order_by(AuditLog.created_at)
            )
        )
        .scalars()
        .all()
    )
    assert [log.action for log in logs] == ["user.status_change"] * 3
    assert logs[0].before == {"role": "patient", "status": "active"}
    assert logs[0].after["status"] == "suspended" and logs[0].after["sessions_revoked"] == 1


async def test_staff_creation_and_staff_list(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    h = auth_headers(admin)
    base = {"email": "Coord.One@HealIndia.example.com", "full_name": "Coord One", "role": "support"}
    r = await client.post(f"{API}/admin/users", json={**base, "password": "short"}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "weak_password"
    r = await client.post(
        f"{API}/admin/users", json={**base, "role": "patient", "password": "Str0ngPassw0rd!"}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_role"
    r = await client.post(
        f"{API}/admin/users", json={**base, "role": "super_admin", "password": "Str0ngPassw0rd!"}, headers=h
    )
    assert r.status_code == 403
    r = await client.post(f"{API}/admin/users", json={**base, "password": "Str0ngPassw0rd!"}, headers=h)
    assert r.status_code == 201, r.text
    body = r.json()
    assert (
        body["email"] == "coord.one@healindia.example.com"
        and body["role"] == "support"
        and body["status"] == "active"
    )
    assert body["email_verified"] is True
    assert "password" not in r.text and "password_hash" not in r.text
    r = await client.post(f"{API}/admin/users", json={**base, "password": "Str0ngPassw0rd!"}, headers=h)
    assert r.status_code == 409

    created = await db.get(User, body["id"])
    assert created is not None and created.password_hash and created.password_hash.startswith("$argon2")
    assert "user.staff_create" in await _audit_actions(db, body["id"])

    await make_user(role="patient")
    r = await client.get(f"{API}/admin/staff", headers=h)
    roles = {s["role"] for s in r.json()}
    assert roles <= {"admin", "finance", "support", "super_admin"}
    assert body["id"] in [s["id"] for s in r.json()]
    r = await client.get(f"{API}/admin/staff", params={"role": "support"}, headers=h)
    assert [s["id"] for s in r.json()] == [body["id"]]
    r = await client.get(f"{API}/admin/staff", params={"role": "patient"}, headers=h)
    assert r.json() == []


async def test_user_list_filters_search_and_detail(client, db, make_user, auth_headers):
    admin = await make_user(role="support")
    p1 = await make_user(role="patient", email="zara.khan@example.test", full_name="Zara Khan")
    await make_user(role="patient", email="omar@example.test", full_name="Omar 100%_Real")
    await make_user(role="agent")
    profile = await create_patient(db, user=p1, passport_last4="4321")
    h = auth_headers(admin)

    r = await client.get(f"{API}/admin/users", params={"role": "patient"}, headers=h)
    assert r.json()["total"] == 2
    r = await client.get(f"{API}/admin/users", params={"q": "ZARA"}, headers=h)
    assert [u["id"] for u in r.json()["items"]] == [str(p1.id)]
    r = await client.get(f"{API}/admin/users", params={"q": "khan@example"}, headers=h)
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/admin/users", params={"q": "100%_"}, headers=h)
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/admin/users", params={"q": "%"}, headers=h)
    assert r.json()["total"] == 1  # wildcard is escaped: only the literal '%' in "100%_Real"
    r = await client.get(f"{API}/admin/users", params={"status": "suspended"}, headers=h)
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/admin/users", params={"page_size": 2}, headers=h)
    assert r.json()["pages"] == 2 and len(r.json()["items"]) == 2

    r = await client.get(f"{API}/admin/users/{p1.id}", headers=h)
    assert r.status_code == 200
    detail = r.json()
    assert detail["patient_profile_id"] == str(profile.id)
    assert detail["patient_profile"]["passport_last4"] == "4321"
    assert "passport_number" not in detail["patient_profile"]
    r = await client.get(f"{API}/admin/users/00000000-0000-7000-8000-000000000000", headers=h)
    assert r.status_code == 404


# --------------------------------------------------------------------------------------------- catalog CRUD
async def test_specialty_and_procedure_crud(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    h = auth_headers(admin)
    await cache.set("catalog:specialties:all", ["stale"])

    r = await client.post(
        f"{API}/admin/specialties",
        json={"slug": "neurology", "name": "Neurology", "savings_min_pct": 50, "savings_max_pct": 70},
        headers=h,
    )
    assert r.status_code == 201, r.text
    spec = r.json()
    assert spec["procedures_count"] == 0 and spec["is_active"] is True
    assert await cache.get("catalog:specialties:all") is None  # invalidated

    r = await client.post(
        f"{API}/admin/specialties", json={"slug": "neurology", "name": "Neuro 2"}, headers=h
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "slug_taken"
    for bad in (
        {"slug": "Bad Slug!", "name": "X X"},
        {"slug": "ok-slug", "name": "X X", "savings_min_pct": 80, "savings_max_pct": 10},
        {"slug": "ok-slug", "name": "X X", "unknown": 1},
    ):
        r = await client.post(f"{API}/admin/specialties", json=bad, headers=h)
        assert r.status_code == 422, bad

    r = await client.post(
        f"{API}/admin/procedures",
        json={
            "specialty_id": spec["id"],
            "slug": "spine-fusion",
            "name": "Spine Fusion",
            "keywords": ["back", " back ", "spine"],
            "india_price_min_minor": 400_000_00,
            "india_price_max_minor": 600_000_00,
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    proc = r.json()
    assert proc["specialty"]["slug"] == "neurology" and proc["keywords"] == ["back", "spine"]
    r = await client.post(
        f"{API}/admin/procedures",
        json={"specialty_id": "00000000-0000-7000-8000-000000000000", "slug": "x-1", "name": "X one"},
        headers=h,
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_reference"
    r = await client.patch(
        f"{API}/admin/procedures/{proc['id']}", json={"india_price_min_minor": 900_000_00}, headers=h
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_range"
    r = await client.patch(f"{API}/admin/procedures/{proc['id']}", json={"name": None}, headers=h)
    assert r.status_code == 400

    other = await create_specialty(db, slug="other-spec", name="Other")
    r = await client.patch(f"{API}/admin/specialties/{other.id}", json={"slug": "neurology"}, headers=h)
    assert r.status_code == 409
    r = await client.patch(
        f"{API}/admin/specialties/{spec['id']}", json={"name": "Neurosciences", "is_active": False}, headers=h
    )
    assert r.status_code == 200 and r.json()["name"] == "Neurosciences" and r.json()["is_active"] is False
    assert r.json()["procedures_count"] == 1

    # benchmark
    r = await client.post(
        f"{API}/admin/cost-benchmarks",
        json={
            "procedure_id": proc["id"],
            "country_code": "us",
            "currency": "usd",
            "cost_min_minor": 60_000_00,
            "cost_max_minor": 90_000_00,
            "wait_time_text": "3-6 months",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    bench = r.json()
    assert (bench["country_code"], bench["currency"]) == ("US", "USD")
    r = await client.post(
        f"{API}/admin/cost-benchmarks",
        json={
            "procedure_id": proc["id"],
            "country_code": "US",
            "currency": "USD",
            "cost_min_minor": 1,
            "cost_max_minor": 2,
        },
        headers=h,
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_benchmark"
    r = await client.get(f"{API}/admin/procedures/{proc['id']}", headers=h)
    assert [b["country_code"] for b in r.json()["benchmarks"]] == ["US"]
    r = await client.get(f"{API}/admin/cost-benchmarks", params={"procedure_id": proc["id"]}, headers=h)
    assert len(r.json()) == 1

    # in-use specialty cannot be deleted; deleting the procedure (and its benchmark) frees it
    r = await client.delete(f"{API}/admin/specialties/{spec['id']}", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "in_use"
    r = await client.delete(f"{API}/admin/procedures/{proc['id']}", headers=h)
    assert r.status_code == 204
    r = await client.get(f"{API}/admin/cost-benchmarks/{bench['id']}", headers=h)
    assert r.status_code == 404
    r = await client.delete(f"{API}/admin/specialties/{spec['id']}", headers=h)
    assert r.status_code == 204
    r = await client.get(f"{API}/admin/specialties/{spec['id']}", headers=h)
    assert r.status_code == 404
    actions = await _audit_actions(db, spec["id"])
    assert actions == ["specialty.create", "specialty.update", "specialty.delete"]


async def test_procedure_in_use_by_hospital_cannot_be_deleted(client, db, make_user, auth_headers):
    from tests.factories import create_hospital_procedure

    admin = await make_user(role="admin")
    spec = await create_specialty(db)
    proc = await create_procedure(db, spec)
    hospital = await create_hospital(db)
    await create_hospital_procedure(db, hospital, proc)
    await create_doctor(db, hospital, spec)
    r = await client.delete(f"{API}/admin/procedures/{proc.id}", headers=auth_headers(admin))
    assert r.status_code == 409 and r.json()["error"]["code"] == "in_use"
    r = await client.delete(f"{API}/admin/specialties/{spec.id}", headers=auth_headers(admin))
    assert r.status_code == 409
    assert (await db.execute(select(func.count(Doctor.id)))).scalar_one() == 1


async def test_content_and_provider_crud(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    h = auth_headers(admin)
    hospital = await create_hospital(db)

    r = await client.post(
        f"{API}/admin/cultural-tips",
        json={"title": "Greetings", "body": "Namaste is a common greeting.", "category": "etiquette"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    tip = r.json()
    r = await client.patch(f"{API}/admin/cultural-tips/{tip['id']}", json={"sort_order": 5}, headers=h)
    assert r.json()["sort_order"] == 5
    r = await client.get(f"{API}/admin/cultural-tips", params={"category": "etiquette"}, headers=h)
    assert len(r.json()) == 1
    assert (await client.delete(f"{API}/admin/cultural-tips/{tip['id']}", headers=h)).status_code == 204

    r = await client.post(
        f"{API}/admin/accommodation-providers",
        json={
            "name": "Stay Near Hospital",
            "type": "service_apartment",
            "city": "New Delhi",
            "nightly_rate_minor": 4_500_00,
            "amenities": ["wifi", "kitchen"],
            "email": "stay@example.com",
            "hospital_links": [{"hospital_id": str(hospital.id), "distance_km": "1.2"}],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    acc = r.json()
    assert acc["hospital_links"] == [
        {"hospital_id": str(hospital.id), "hospital_name": hospital.name, "distance_km": 1.2}
    ]
    r = await client.post(
        f"{API}/admin/accommodation-providers",
        json={
            "name": "Bad Link",
            "type": "hotel",
            "city": "Delhi",
            "hospital_links": [{"hospital_id": "00000000-0000-7000-8000-000000000000"}],
        },
        headers=h,
    )
    assert r.status_code == 400
    r = await client.get(
        f"{API}/admin/accommodation-providers", params={"hospital_id": str(hospital.id)}, headers=h
    )
    assert [a["id"] for a in r.json()] == [acc["id"]]
    r = await client.patch(
        f"{API}/admin/accommodation-providers/{acc['id']}",
        json={"hospital_links": [], "star_rating": 4},
        headers=h,
    )
    assert r.status_code == 200 and r.json()["hospital_links"] == [] and r.json()["star_rating"] == 4
    assert (
        await client.delete(f"{API}/admin/accommodation-providers/{acc['id']}", headers=h)
    ).status_code == 204

    r = await client.post(
        f"{API}/admin/service-providers",
        json={
            "kind": "translator",
            "name": "Arabic Interpreters",
            "languages": ["ar", "en"],
            "rate_minor": 1_500_00,
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    sp = r.json()
    assert sp["rate_unit"] == "fixed" and sp["is_active"] is True
    r = await client.patch(f"{API}/admin/service-providers/{sp['id']}", json={"rate_unit": "hour"}, headers=h)
    assert r.json()["rate_unit"] == "hour"
    r = await client.patch(f"{API}/admin/service-providers/{sp['id']}", json={"rate_unit": None}, headers=h)
    assert r.status_code == 400
    r = await client.get(f"{API}/admin/service-providers", params={"kind": "translator"}, headers=h)
    assert len(r.json()) == 1
    r = await client.post(f"{API}/admin/service-providers", json={"kind": "chef", "name": "X Y"}, headers=h)
    assert r.status_code == 422


async def test_fx_rate_crud_updates_conversion(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    # SEC-008: rates price real payments - an ops admin cannot write them
    r = await client.post(
        f"{API}/admin/fx-rates", json={"quote_currency": "usd", "rate": "88.25"}, headers=auth_headers(admin)
    )
    assert r.status_code == 403
    finance = await make_user(role="finance")
    h = auth_headers(finance)
    for absurd in ("0.00000001", "1000000"):
        r = await client.post(
            f"{API}/admin/fx-rates", json={"quote_currency": "usd", "rate": absurd}, headers=h
        )
        assert r.status_code == 422, absurd
    r = await client.post(f"{API}/admin/fx-rates", json={"quote_currency": "usd", "rate": "8.8"}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "fx_rate_out_of_range"
    r = await client.post(f"{API}/admin/fx-rates", json={"quote_currency": "usd", "rate": "88.25"}, headers=h)
    assert r.status_code == 201, r.text
    rate = r.json()
    assert rate["quote_currency"] == "USD" and rate["rate"] == "88.25" and rate["base_currency"] == "INR"
    assert await get_fx_rate(db, "USD") == pytest.approx(88.25)
    r = await client.post(f"{API}/admin/fx-rates", json={"quote_currency": "USD", "rate": "90"}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "duplicate_rate"
    for bad in (
        {"quote_currency": "INR", "rate": "1"},
        {"quote_currency": "EUR", "rate": "0"},
        {"quote_currency": "EU", "rate": "1"},
    ):
        r = await client.post(f"{API}/admin/fx-rates", json=bad, headers=h)
        assert r.status_code == 422, bad
    r = await client.patch(f"{API}/admin/fx-rates/{rate['id']}", json={"rate": "90.5"}, headers=h)
    assert r.status_code == 200 and r.json()["rate"] == "90.5" and r.json()["source"] == "manual"
    db.expire_all()
    assert await get_fx_rate(db, "USD") == pytest.approx(90.5)
    # SEC-008: a move of more than 10% waits for a second finance user
    r = await client.patch(f"{API}/admin/fx-rates/{rate['id']}", json={"rate": "45"}, headers=h)
    assert r.status_code == 200 and r.json()["rate"] == "90.5" and r.json()["pending_rate"] == "45"
    db.expire_all()
    assert await get_fx_rate(db, "USD") == pytest.approx(90.5)
    approve = f"{API}/admin/fx-rates/{rate['id']}/approve"
    r = await client.post(approve, json={"rate": "45"}, headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "second_approver_required"
    checker = auth_headers(await make_user(role="finance"))
    r = await client.post(approve, json={"rate": "46"}, headers=checker)
    assert r.status_code == 409 and r.json()["error"]["code"] == "request_changed"
    r = await client.post(approve, json={"rate": "45"}, headers=checker)
    assert r.status_code == 200 and r.json()["rate"] == "45" and r.json()["pending_rate"] is None
    actions = set(
        (await db.execute(select(AuditLog.action).where(AuditLog.entity_type == "fx_rate"))).scalars()
    )
    assert {
        "fx_rate.create",
        "fx_rate.update",
        "fx_rate.change_requested",
        "fx_rate.change_approved",
    } <= actions
    r = await client.get(f"{API}/admin/fx-rates", headers=h)
    assert [x["quote_currency"] for x in r.json()] == ["USD"]
    assert (await client.delete(f"{API}/admin/fx-rates/{rate['id']}", headers=h)).status_code == 204


# ---------------------------------------------------------------------------------------------- audit log
async def test_audit_log_filters(client, db, make_user, auth_headers):
    admin = await make_user(role="admin")
    support = await make_user(role="support")
    h = auth_headers(admin)
    await client.post(f"{API}/admin/specialties", json={"slug": "derma", "name": "Dermatology"}, headers=h)
    await client.post(f"{API}/admin/cultural-tips", json={"title": "Food", "body": "Spicy food"}, headers=h)
    hospital = await create_hospital(db, status="pending_review")
    await _kyc_document(db, admin, hospital=hospital)
    await client.post(f"{API}/admin/hospitals/{hospital.id}/approve", headers=h)

    hs = auth_headers(support)
    r = await client.get(f"{API}/admin/audit-logs", headers=hs)
    assert r.status_code == 200 and r.json()["total"] == 3
    first = r.json()["items"][0]
    assert first["action"] == "hospital.approve" and first["actor_name"] == admin.full_name
    assert first["actor_role"] == "admin" and first["before"]["status"] == "pending_review"
    r = await client.get(f"{API}/admin/audit-logs", params={"entity_type": "specialty"}, headers=hs)
    assert [x["action"] for x in r.json()["items"]] == ["specialty.create"]
    r = await client.get(f"{API}/admin/audit-logs", params={"action": "cultural_tip.*"}, headers=hs)
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/admin/audit-logs", params={"action": "cultural_tip"}, headers=hs)
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/admin/audit-logs", params={"entity_id": str(hospital.id)}, headers=hs)
    assert r.json()["total"] == 1
    r = await client.get(f"{API}/admin/audit-logs", params={"actor_user_id": str(support.id)}, headers=hs)
    assert r.json()["total"] == 0
    r = await client.get(
        f"{API}/admin/audit-logs", params={"from": "2001-01-01", "to": "2001-01-31"}, headers=hs
    )
    assert r.json()["total"] == 0
    r = await client.get(
        f"{API}/admin/audit-logs", params={"from": "2030-01-02", "to": "2030-01-01"}, headers=hs
    )
    assert r.status_code == 400


async def test_hospital_detail_includes_members_and_status_counts(client, db, make_user, auth_headers):
    support = await make_user(role="support")
    owner = await make_user(role="hospital")
    hospital = await create_hospital(db, owner=owner, status="pending_review", pan="ABCDE1234F")
    r = await client.get(f"{API}/admin/hospitals/{hospital.id}", headers=auth_headers(support))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pan_last4"] == "234F" and "pan" not in body
    assert body["members"][0]["member_role"] == "owner"
    assert body["kyc_documents"] == [] and body["payout_accounts"] == []
    r = await client.get(
        f"{API}/admin/hospitals", params={"q": hospital.name[:12].upper()}, headers=auth_headers(support)
    )
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["status"] == "pending_review"
    r = await client.get(
        f"{API}/admin/hospitals/00000000-0000-7000-8000-000000000000", headers=auth_headers(support)
    )
    assert r.status_code == 404
    assert UserRole.SUPPORT.value == "support" and UserStatus.ACTIVE.value == "active"
