"""Login doors, staff MFA enrolment, consents scoping/agreements, invites, guests gate, account deletion and
client-IP handling (PLAN 3.1; INTEGRATION_BACKLOG #1, #5, #11, #12, #15, #20, #22, #23, #32)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import String, func, select
from starlette.requests import Request

from app.core.config import Settings, settings
from app.core.deps import FullAccountUser, get_client_ip
from app.core.enums import (
    AgentStatus,
    BookingStatus,
    CaseStatus,
    ConsentKind,
    UserStatus,
    VerificationPurpose,
)
from app.core.security import create_access_token, decode_access_token, new_opaque_token
from app.models import (
    Agent,
    AuditLog,
    Consent,
    DeviceToken,
    Document,
    PatientCompanion,
    PatientProfile,
    RefreshToken,
    SavedItem,
    User,
    VerificationToken,
)
from app.modules.auth import service as auth_service
from tests.factories import create_agent, create_booking, create_case, create_hospital, create_patient
from tests.modules.auth_helpers import API, MOBILE, PASSWORD, XHR, bearer, login, register, totp_now

STAFF = "/auth/staff"


async def staff_login(client, email: str, password: str = PASSWORD, **extra: Any):
    return await client.post(f"{API}{STAFF}/login", json={"email": email, "password": password, **extra})


# ------------------------------------------------------------------------------------------------ doors
@pytest.mark.parametrize("role", ["admin", "finance", "support", "super_admin"])
async def test_public_door_rejects_staff_generically(client, db, make_user, role) -> None:
    await make_user(role=role, email=f"{role}@example.test", password=PASSWORD)
    for mobile in (True, False):
        r = await login(client, f"{role}@example.test", mobile=mobile)
        assert r.status_code == 401
        error = r.json()["error"]
        assert error["code"] == "invalid_credentials"
        assert error["message"] == auth_service.GENERIC_LOGIN_ERROR
    unknown = await login(client, "nobody@example.test")
    assert unknown.json()["error"] == {**unknown.json()["error"], "message": auth_service.GENERIC_LOGIN_ERROR}
    actions = (await db.execute(select(AuditLog.action))).scalars().all()
    assert "auth.wrong_door" in actions


@pytest.mark.parametrize("role", ["patient", "agent", "hospital"])
async def test_mobile_public_door_all_roles_token_mode(client, role) -> None:
    _, token = await register(client, role)
    assert token["refresh_token"] and decode_access_token(token["access_token"])["portal"] == "public"
    r = await login(client, token["user"]["email"])
    assert r.status_code == 200 and r.json()["refresh_token"]
    r = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": r.json()["refresh_token"]}, headers=MOBILE
    )
    assert r.status_code == 200, r.text
    assert r.json()["refresh_token"] and "set-cookie" not in r.headers
    r = await client.get(f"{API}/auth/me", headers={**bearer(r.json()), **MOBILE})
    assert r.status_code == 200 and r.json()["role"] == role


async def test_staff_door_login_cookie_refresh_logout(client, db, make_user) -> None:
    await make_user(role="finance", email="fin@example.test", password=PASSWORD)
    r = await staff_login(client, "fin@example.test")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["refresh_token"] is None and body["user"]["role"] == "finance"
    assert decode_access_token(body["access_token"])["portal"] == "staff"
    cookie = r.headers["set-cookie"]
    assert "hig_staff_refresh=" in cookie and "Path=/api/v1/auth/staff" in cookie and "HttpOnly" in cookie
    row = (await db.execute(select(RefreshToken))).scalar_one()
    assert row.portal == "staff"

    # The staff cookie only works at the staff door, and needs X-Requested-With.
    assert (await client.post(f"{API}{STAFF}/refresh")).status_code == 403
    r = await client.post(f"{API}{STAFF}/refresh", headers=XHR)
    assert r.status_code == 200, r.text
    assert "hig_staff_refresh=" in r.headers["set-cookie"]
    raw = client.cookies.get("hig_staff_refresh")
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": raw}, headers=MOBILE)
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_refresh_token"

    # Staff access token works on staff APIs, but not from the mobile app.
    headers = bearer(body)
    assert (await client.get(f"{API}/auth/me", headers=headers)).status_code == 200
    r = await client.get(f"{API}/auth/me", headers={**headers, **MOBILE})
    assert r.status_code == 401 and r.json()["error"]["code"] == "wrong_portal"

    r = await client.post(f"{API}{STAFF}/logout", headers={**headers, **XHR})
    assert r.status_code == 204
    db.expire_all()
    assert all(t.revoked_at is not None for t in (await db.execute(select(RefreshToken))).scalars())
    actions = set((await db.execute(select(AuditLog.action))).scalars().all())
    assert {"auth.staff_login", "auth.logout"} <= actions


async def test_staff_door_rejects_non_staff_and_mobile(client, db, make_user) -> None:
    await make_user(role="patient", email="pat@example.test", password=PASSWORD)
    await make_user(role="admin", email="adm@example.test", password=PASSWORD)
    r = await staff_login(client, "pat@example.test")
    assert r.status_code == 401 and r.json()["error"]["message"] == auth_service.GENERIC_LOGIN_ERROR
    r = await staff_login(client, "ghost@example.test")
    assert r.status_code == 401
    r = await client.post(
        f"{API}{STAFF}/login", json={"email": "adm@example.test", "password": PASSWORD}, headers=MOBILE
    )
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    failed = (
        await db.execute(select(func.count()).where(AuditLog.action == "auth.staff_login_failed"))
    ).scalar_one()
    assert failed == 2


async def test_portal_claim_enforced(client, make_user) -> None:
    admin = await make_user(role="admin")
    patient = await make_user(role="patient")
    wrong_admin = create_access_token(admin.id, "admin", portal="public")
    wrong_patient = create_access_token(patient.id, "patient", portal="staff")
    for token in (wrong_admin, wrong_patient):
        r = await client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401 and r.json()["error"]["code"] == "wrong_portal"
    # Default claim follows the role.
    assert decode_access_token(create_access_token(admin.id, "admin"))["portal"] == "staff"
    assert decode_access_token(create_access_token(patient.id, "patient"))["portal"] == "public"


async def test_staff_allowed_ips(client, make_user, auth_headers, monkeypatch) -> None:
    admin = await make_user(role="admin", email="ipadmin@example.test", password=PASSWORD)
    patient = await make_user(role="patient")
    monkeypatch.setattr(settings, "STAFF_ALLOWED_IPS", ["203.0.113.0/24"])
    r = await client.get(f"{API}/auth/me", headers=auth_headers(admin))
    assert r.status_code == 403 and r.json()["error"]["code"] == "ip_not_allowed"
    assert (await staff_login(client, "ipadmin@example.test")).status_code == 403
    # Patients are not affected; staff from an allowed address (via our proxy) are.
    assert (await client.get(f"{API}/auth/me", headers=auth_headers(patient))).status_code == 200
    via_proxy = {**auth_headers(admin), "X-Forwarded-For": "203.0.113.7"}
    assert (await client.get(f"{API}/auth/me", headers=via_proxy)).status_code == 200
    spoofed = {**auth_headers(admin), "X-Forwarded-For": "203.0.113.7, 198.51.100.9"}
    assert (await client.get(f"{API}/auth/me", headers=spoofed)).status_code == 403


async def test_staff_console_origin(client, make_user, monkeypatch) -> None:
    """SEC-022: with a separate console origin the staff door refuses any other origin."""
    await make_user(role="admin", email="origin.admin@example.test", password=PASSWORD)
    monkeypatch.setattr(settings, "STAFF_CONSOLE_ORIGIN", "https://ops.example.test")
    body = {"email": "origin.admin@example.test", "password": PASSWORD}
    for origin in (None, "https://example.test", "https://app.example.test"):
        headers = {"Origin": origin} if origin else {}
        r = await client.post(f"{API}{STAFF}/login", json=body, headers=headers)
        assert r.status_code == 403 and r.json()["error"]["code"] == "staff_origin_mismatch", origin
    r = await client.post(f"{API}{STAFF}/login", json=body, headers={"Origin": "https://ops.example.test/"})
    assert r.status_code != 403


# ------------------------------------------------------------------------------------- staff MFA (#23)
async def test_staff_mfa_enrolment_requires_super_admin_token(client, db, make_user, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ADMIN_MFA_REQUIRED", True)
    staff = await make_user(role="admin", email="ops@example.test", password=PASSWORD)
    root = await make_user(role="super_admin", email="root@example.test", password=PASSWORD)
    staff_id = staff.id

    # Password alone never reveals or binds a secret.
    r = await staff_login(client, "ops@example.test")
    assert r.status_code == 401
    error = r.json()["error"]
    assert error["code"] == "mfa_enrolment_required" and "secret" not in (error["details"] or {})
    r = await staff_login(client, "ops@example.test", enrolment_token="not-a-real-token-123")
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_enrolment_token"

    # A super admin issues a one-time code (root itself enrols with a bootstrap code).
    raw_root, _ = await auth_service.issue_mfa_enrolment_token(db, None, root.id, None)
    r = await staff_login(client, "root@example.test", enrolment_token=raw_root)
    root_secret = r.json()["error"]["details"]["secret"]
    r = await staff_login(
        client, "root@example.test", enrolment_token=raw_root, otp_code=totp_now(root_secret)
    )
    assert r.status_code == 200, r.text
    root_headers = bearer(r.json())

    r = await client.post(
        f"{API}{STAFF}/mfa/enrolment-token", json={"user_id": str(root.id)}, headers=root_headers
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "self_enrolment_forbidden"
    r = await client.post(
        f"{API}{STAFF}/mfa/enrolment-token", json={"user_id": str(staff_id)}, headers=root_headers
    )
    assert r.status_code == 201, r.text
    code = r.json()["enrolment_token"]

    r = await staff_login(client, "ops@example.test", enrolment_token=code)
    assert r.status_code == 401
    details = r.json()["error"]["details"]
    assert details["setup_required"] is True
    secret = details["secret"]
    r = await staff_login(client, "ops@example.test", enrolment_token=code, otp_code=totp_now(secret))
    assert r.status_code == 200, r.text
    assert r.json()["user"]["mfa_enabled"] is True
    staff_headers = bearer(r.json())

    # The code is single use; later logins need only the TOTP.
    r = await staff_login(client, "ops@example.test")
    assert r.status_code == 401 and r.json()["error"]["code"] == "mfa_required"
    assert (await staff_login(client, "ops@example.test", otp_code=totp_now(secret))).status_code == 200
    db.expire_all()
    token_row = (
        await db.execute(
            select(VerificationToken).where(
                VerificationToken.user_id == staff_id,
                VerificationToken.purpose == VerificationPurpose.MFA_ENROLMENT,
            )
        )
    ).scalar_one()
    assert token_row.used_at is not None

    # Staff can neither disable MFA nor run self-service setup while it is mandatory.
    r = await client.post(f"{API}/auth/mfa/disable", json={"code": totp_now(secret)}, headers=staff_headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "mfa_required_for_staff"

    # Only a super admin may reset; reset signs the user out and returns a fresh code.
    r = await client.post(f"{API}{STAFF}/mfa/reset", json={"user_id": str(staff_id)}, headers=staff_headers)
    assert r.status_code == 403
    r = await client.post(f"{API}{STAFF}/mfa/reset", json={"user_id": str(staff_id)}, headers=root_headers)
    assert r.status_code == 200, r.text
    assert r.json()["enrolment_token"] != code
    db.expire_all()
    stored = await db.get(User, staff_id)
    assert stored is not None and not stored.mfa_enabled and stored.mfa_secret is None
    fresh = {"Authorization": f"Bearer {create_access_token(staff_id, 'admin')}"}
    r = await client.post(f"{API}/auth/mfa/setup", headers=fresh)
    assert r.status_code == 403 and r.json()["error"]["code"] == "mfa_enrolment_token_required"
    actions = set((await db.execute(select(AuditLog.action))).scalars().all())
    assert {"auth.mfa_enrolment_token_issued", "auth.mfa_reset", "auth.mfa_enabled"} <= actions


def test_settings_validation_production_and_jwt(monkeypatch) -> None:
    base = {
        "ENV": "production",
        "JWT_SECRET": "x" * 48,
        "FIELD_ENCRYPTION_KEY": "k" * 44,
        "COOKIE_SECURE": True,
        "PAYMENT_GATEWAYS_ENABLED": "razorpay",
        "STAFF_ALLOWED_IPS": "203.0.113.0/24",
    }
    # SEC-022: production must restrict the staff door (network allow-list and/or a separate console origin)
    with pytest.raises(ValueError, match="STAFF_ALLOWED_IPS"):
        Settings(_env_file=None, **{**base, "STAFF_ALLOWED_IPS": ""}, ADMIN_MFA_REQUIRED=True)
    assert Settings(
        _env_file=None,
        **{**base, "STAFF_ALLOWED_IPS": ""},
        ADMIN_MFA_REQUIRED=True,
        STAFF_CONSOLE_ORIGIN="https://ops.example.com",
    ).STAFF_CONSOLE_ORIGIN
    with pytest.raises(ValueError, match="ADMIN_MFA_REQUIRED"):
        Settings(_env_file=None, **base, ADMIN_MFA_REQUIRED=False)
    assert Settings(_env_file=None, **base, ADMIN_MFA_REQUIRED=True).ADMIN_MFA_REQUIRED
    with pytest.raises(ValueError, match="STT_PROVIDER"):
        Settings(_env_file=None, **base, ADMIN_MFA_REQUIRED=True, STT_PROVIDER="none")
    with pytest.raises(ValueError, match="VOICE_RETAIN_AUDIO"):
        Settings(_env_file=None, **base, ADMIN_MFA_REQUIRED=True, VOICE_RETAIN_AUDIO=True)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(_env_file=None, ENV="staging", JWT_SECRET="")
    monkeypatch.setenv("WEB_CONCURRENCY", "3")
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(_env_file=None, ENV="development", JWT_SECRET="")
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    assert Settings(_env_file=None, ENV="development", JWT_SECRET="").JWT_SECRET
    with pytest.raises(ValueError, match="CIDR"):
        Settings(_env_file=None, ENV="development", STAFF_ALLOWED_IPS="not-an-ip")


# --------------------------------------------------------------------------------------- client IP (#20)
def _request(peer: str, headers: dict[str, str] | None = None) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": (peer, 1234), "method": "GET", "path": "/"})


def test_client_ip_trusts_only_proxy_hop(monkeypatch) -> None:
    spoof = {
        "X-Forwarded-For": "1.2.3.4",
        "X-Real-IP": "1.2.3.4",
        "CloudFront-Viewer-Address": "1.2.3.4:443",
    }
    # Untrusted peer: every forwarding header is ignored (spoofing attempts).
    assert get_client_ip(_request("198.51.100.9", spoof)) == "198.51.100.9"
    own_ip_first = {"X-Forwarded-For": "198.51.100.9, 1.2.3.4"}
    assert get_client_ip(_request("198.51.100.9", own_ip_first)) == "198.51.100.9"
    # Behind the edge (trusted peer): the edge-written hop wins; client-supplied prefixes are ignored.
    assert get_client_ip(_request("172.29.10.10", {"X-Forwarded-For": "198.51.100.9"})) == "198.51.100.9"
    proxied = _request("10.0.0.5", {"X-Forwarded-For": "1.2.3.4, 198.51.100.9"})
    assert get_client_ip(proxied) == "198.51.100.9"
    two_proxies = _request("10.0.0.5", {"X-Forwarded-For": "1.2.3.4, 198.51.100.9, 10.0.0.7"})
    assert get_client_ip(two_proxies) == "198.51.100.9"
    assert get_client_ip(_request("10.0.0.5", {"X-Real-IP": "198.51.100.10"})) == "198.51.100.10"
    assert get_client_ip(_request("10.0.0.5", {"X-Forwarded-For": "garbage"})) == "10.0.0.5"
    # Only the configured proxies are trusted.
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", ["172.29.10.10/32"])
    assert get_client_ip(_request("10.0.0.5", {"X-Forwarded-For": "198.51.100.9"})) == "10.0.0.5"
    # CloudFront-Viewer-Address (port stripped, IPv4 and IPv6) only when explicitly trusted.
    cf = {"CloudFront-Viewer-Address": "203.0.113.50:46532", "X-Forwarded-For": "198.51.100.9"}
    assert get_client_ip(_request("172.29.10.10", cf)) == "198.51.100.9"
    monkeypatch.setattr(settings, "TRUST_CLOUDFRONT_VIEWER_ADDRESS", True)
    assert get_client_ip(_request("172.29.10.10", cf)) == "203.0.113.50"
    cf6 = {"CloudFront-Viewer-Address": "2001:db8::1:443"}
    assert get_client_ip(_request("172.29.10.10", cf6)) == "2001:db8::1"
    assert get_client_ip(_request("172.29.10.10", {"CloudFront-Viewer-Address": "junk"})) == "172.29.10.10"


# ------------------------------------------------------------------------------------- guests gate (#12)
async def test_full_account_dependency(client, db, make_user, auth_headers) -> None:
    from httpx import ASGITransport, AsyncClient

    from app.core.errors import register_exception_handlers

    probe = FastAPI()

    @probe.get("/probe")
    async def _probe(user: FullAccountUser) -> dict[str, str]:
        return {"id": str(user.id)}

    register_exception_handlers(probe)
    r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
    guest = r.json()
    full = await make_user(role="patient")
    async with AsyncClient(transport=ASGITransport(app=probe), base_url="http://t") as c:
        r = await c.get("/probe", headers=bearer(guest))
        assert r.status_code == 403 and r.json()["error"]["code"] == "guest_upgrade_required"
        assert (await c.get("/probe", headers=auth_headers(full))).status_code == 200


# ----------------------------------------------------------------------------------- consents (#5, #11)
async def test_consent_scoping_and_agreements(client, db, make_user, auth_headers) -> None:
    versions = (await client.get(f"{API}/auth/consents/versions")).json()
    assert versions["hospital_partner_agreement"] == versions["agent_agreement"] == "2026-10"

    patient = await create_patient(db)
    patient_user = await db.get(User, patient.user_id)
    hospital = await create_hospital(db)
    other_hospital = await create_hospital(db)
    case = await create_case(db, patient, hospital)
    stranger = await make_user(role="patient")
    headers = auth_headers(patient_user)

    body = {"kind": "share_with_hospitals", "version": "1.0", "granted": True, "case_id": str(case.id)}
    r = await client.post(f"{API}/auth/consents", json=body, headers=headers)
    assert r.status_code == 201, r.text
    assert r.json()["case_id"] == str(case.id) and r.json()["hospital_id"] == str(hospital.id)
    bad = {**body, "hospital_id": str(other_hospital.id)}
    assert (await client.post(f"{API}/auth/consents", json=bad, headers=headers)).status_code == 400
    r = await client.post(f"{API}/auth/consents", json=body, headers=auth_headers(stranger))
    assert r.status_code == 404
    hosp_only = {"kind": "share_with_hospitals", "version": "1.0", "granted": False}
    hosp_only["hospital_id"] = str(other_hospital.id)
    assert (await client.post(f"{API}/auth/consents", json=hosp_only, headers=headers)).status_code == 201
    scoped = {"kind": "marketing", "version": "1", "granted": True, "case_id": str(case.id)}
    r = await client.post(f"{API}/auth/consents", json=scoped, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_scope_not_allowed"

    current = (await client.get(f"{API}/auth/consents", headers=headers)).json()
    assert len([c for c in current if c["kind"] == "share_with_hospitals"]) == 2
    uid = patient_user.id
    assert await auth_service.has_consent(db, uid, ConsentKind.SHARE_WITH_HOSPITALS, case_id=case.id)
    assert not await auth_service.has_consent(
        db, uid, ConsentKind.SHARE_WITH_HOSPITALS, hospital_id=other_hospital.id
    )

    # Agent agreement: agents only, current version only.
    _, agent_token = await register(client, "agent")
    agent_headers = bearer(agent_token)
    agreement = {"kind": "agent_agreement", "version": "2025-01", "granted": True}
    r = await client.post(f"{API}/auth/consents", json=agreement, headers=agent_headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_version_outdated"
    agreement["version"] = versions["agent_agreement"]
    assert (
        await client.post(f"{API}/auth/consents", json=agreement, headers=agent_headers)
    ).status_code == 201
    r = await client.post(f"{API}/auth/consents", json=agreement, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_not_applicable"

    # Hospital partner agreement at sign-up is stored per hospital.
    _, hosp_token = await register(client, "hospital", accept_agreement=True)
    hosp_user_id = hosp_token["user"]["id"]
    hosp_id = hosp_token["user"]["hospitals"][0]["id"]
    row = (
        await db.execute(select(Consent).where(Consent.kind == ConsentKind.HOSPITAL_PARTNER_AGREEMENT))
    ).scalar_one()
    assert str(row.hospital_id) == hosp_id and str(row.user_id) == hosp_user_id
    assert await auth_service.has_current_agreement(
        db, row.user_id, ConsentKind.HOSPITAL_PARTNER_AGREEMENT, hospital_id=row.hospital_id
    )
    other = {"kind": "hospital_partner_agreement", "version": "2026-10", "granted": True}
    other["hospital_id"] = str(other_hospital.id)
    r = await client.post(f"{API}/auth/consents", json=other, headers=bearer(hosp_token))
    assert r.status_code == 404


async def test_pending_agent_consents_on_me(client, db, make_user, auth_headers) -> None:
    agent = await create_agent(db)
    patient_user = await make_user(role="patient")
    await create_patient(db, patient_user)
    db.add(
        AuditLog(
            actor_user_id=agent.user_id,
            actor_role="agent",
            action="agent.patient_consent_attested",
            entity_type="user",
            entity_id=str(patient_user.id),
            after={"agent_id": str(agent.id), "kinds": ["terms", "privacy"], "version": "2026-10"},
        )
    )
    await db.commit()
    headers = auth_headers(patient_user)
    me = (await client.get(f"{API}/auth/me", headers=headers)).json()
    assert sorted(me["pending_consents"]) == ["privacy", "terms"]
    for kind in ("terms", "privacy"):
        body = {"kind": kind, "version": "2026-10", "granted": True}
        assert (await client.post(f"{API}/auth/consents", json=body, headers=headers)).status_code == 201
    assert (await client.get(f"{API}/auth/me", headers=headers)).json()["pending_consents"] == []


# ------------------------------------------------------------------------------------------ invites (#22)
async def _invite(db, user: User) -> str:
    raw, token_hash = new_opaque_token()
    db.add(
        VerificationToken(
            user_id=user.id,
            purpose=VerificationPurpose.INVITE,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(hours=72),
        )
    )
    await db.commit()
    return raw


async def test_accept_invite(client, db, make_user) -> None:
    invited = await make_user(
        role="patient", email="invited@example.test", password=None, email_verified_at=None
    )
    await create_patient(db, invited)
    raw = await _invite(db, invited)
    body = {"token": raw, "password": "short", "accept_terms": True}
    assert (await client.post(f"{API}/auth/accept-invite", json=body)).status_code == 400
    body = {"token": raw, "password": PASSWORD, "full_name": "Invited Patient", "accept_terms": True}
    r = await client.post(f"{API}/auth/accept-invite", json=body, headers=MOBILE)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["refresh_token"] and out["user"]["email_verified"] is True
    assert out["user"]["full_name"] == "Invited Patient"
    # one-time
    r = await client.post(f"{API}/auth/accept-invite", json=body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_token"
    assert (await login(client, "invited@example.test")).status_code == 200
    kinds = (await db.execute(select(Consent.kind).where(Consent.user_id == invited.id))).scalars().all()
    assert set(kinds) == {"terms", "privacy"}
    # Staff accounts never activate through the public door; terms must be accepted.
    staff = await make_user(role="support", password=None)
    staff_raw = await _invite(db, staff)
    r = await client.post(
        f"{API}/auth/accept-invite", json={"token": staff_raw, "password": PASSWORD, "accept_terms": True}
    )
    assert r.status_code == 400
    r = await client.post(
        f"{API}/auth/accept-invite", json={"token": staff_raw, "password": PASSWORD, "accept_terms": False}
    )
    assert r.status_code == 422


async def test_email_links_use_fragment(client, run_jobs, email_outbox) -> None:
    await register(client, "patient")
    await run_jobs()
    html = next(m["html"] for m in email_outbox if m["subject"].startswith("Verify your email"))
    assert f"{settings.PUBLIC_SITE_URL}/verify-email#token=" in html and "?token=" not in html


# ------------------------------------------------------------------------------------ account deletion (#15)
async def test_delete_account_patient(client, db, make_user, auth_headers) -> None:
    payload, token = await register(client, "patient")
    headers = bearer(token)
    user_id = token["user"]["id"]
    profile = (await db.execute(select(PatientProfile).where(PatientProfile.user_id == user_id))).scalar_one()
    profile.passport_number = "Z1234567"
    profile.passport_last4 = "4567"
    db.add(PatientCompanion(patient_id=profile.id, full_name="Sam", passport_number="P999"))
    hospital = await create_hospital(db)
    db.add(SavedItem(user_id=profile.user_id, entity_type="hospital", entity_id=hospital.id))
    db.add(DeviceToken(user_id=profile.user_id, platform="android", token="fcm-delete-me-123"))
    case = await create_case(db, profile, hospital, status=CaseStatus.BOOKED)
    await db.commit()

    policy = (await client.get(f"{API}/auth/me/deletion-policy", headers=headers)).json()
    assert policy["retained"] == list(auth_service.RETENTION_RULES)
    r = await client.request("DELETE", f"{API}/auth/me", json={"password": "Wrong-pass-123"}, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_current_password"
    r = await client.request("DELETE", f"{API}/auth/me", json={"password": PASSWORD}, headers=headers)
    assert r.status_code == 409 and r.json()["error"]["details"] == {"cases_in_progress": 1}

    case.status = CaseStatus.COMPLETED
    booking = await create_booking(db, case, status=BookingStatus.COMPLETED)
    await db.commit()
    assert booking.id
    r = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": PASSWORD, "reason": "done"}, headers=headers
    )
    assert r.status_code == 204, r.text
    policy = (await client.get(f"{API}/auth/me/deletion-policy", headers=headers)).status_code
    assert policy == 403  # deleted account

    profile_id, profile_user_id = profile.id, profile.user_id
    db.expire_all()
    user = await db.get(User, profile_user_id)
    assert user is not None and user.status == UserStatus.DELETED and user.deleted_at is not None
    assert user.email is None and user.password_hash is None and user.full_name == "Deleted user"
    profile = await db.get(PatientProfile, profile_id)
    assert profile is not None and profile.passport_number is None and profile.phone is None
    assert profile.first_name == "Deleted" and profile.date_of_birth is None  # anonymous shell
    for model in (PatientCompanion, SavedItem, DeviceToken):
        assert (await db.execute(select(func.count()).select_from(model))).scalar_one() == 0
    assert all(t.revoked_at is not None for t in (await db.execute(select(RefreshToken))).scalars())
    # The token no longer works and the email can be reused.
    assert (await client.get(f"{API}/auth/me", headers=headers)).status_code == 403
    assert (await login(client, payload["email"])).status_code == 401
    await register(client, "patient", email=payload["email"])


async def test_delete_account_guest_documents_and_staff(client, db, make_user, auth_headers) -> None:
    from tests.modules.auth_helpers import upload

    r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
    guest_headers = bearer(r.json())
    up = await upload(client, guest_headers)
    assert up.status_code == 201, up.text
    r = await client.request("DELETE", f"{API}/auth/me", headers=guest_headers)
    assert r.status_code == 204, r.text
    db.expire_all()
    # complete erasure: the document row is gone (its file is removed by the privacy.delete_objects job)
    assert (await db.execute(select(Document))).scalar_one_or_none() is None

    admin = await make_user(role="admin")
    r = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": PASSWORD}, headers=auth_headers(admin)
    )
    assert r.status_code == 403

    agent = await create_agent(db)
    agent_id = agent.id
    agent_user = await db.get(User, agent.user_id)
    r = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": "Passw0rd!2026"}, headers=auth_headers(agent_user)
    )
    assert r.status_code == 204, r.text
    db.expire_all()
    agent_row = await db.get(Agent, agent_id)
    assert agent_row is not None and agent_row.status == AgentStatus.SUSPENDED


# ---------------------------------------------------------------------------------------- Sign in with Apple
def _apple_setup(monkeypatch) -> Any:
    from cryptography.hazmat.primitives.asymmetric import rsa

    from app.modules.auth import apple as apple_module

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(settings, "APPLE_CLIENT_IDS", ["com.healindia.app", "com.healindia.web"])
    monkeypatch.setattr(apple_module, "_signing_key", lambda token: key.public_key())
    return key


def _apple_token(key: Any, raw_nonce: str, **overrides: Any) -> str:
    import hashlib

    import jwt

    now = int(datetime.now(UTC).timestamp())
    claims = {
        "iss": "https://appleid.apple.com",
        "aud": "com.healindia.app",
        "sub": "001234.apple-sub.0001",
        "iat": now,
        "exp": now + 600,
        "nonce": hashlib.sha256(raw_nonce.encode()).hexdigest(),
        "email": "Relay123@privaterelay.appleid.com",
        "email_verified": "true",
        "is_private_email": "true",
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test"})


async def test_apple_unconfigured_returns_503(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "APPLE_CLIENT_IDS", [])
    body = {"identity_token": "x" * 40, "nonce": "raw-nonce-123", "role": "patient"}
    r = await client.post(f"{API}/auth/apple", json=body, headers=MOBILE)
    assert r.status_code == 503 and r.json()["error"]["code"] == "apple_signin_unavailable"


async def test_apple_sign_up_sign_in_and_rejections(client, db, make_user, monkeypatch) -> None:
    key = _apple_setup(monkeypatch)
    nonce = "raw-nonce-abcdef"
    body = {
        "identity_token": _apple_token(key, nonce),
        "nonce": nonce,
        "authorization_code": "c0de",
        "full_name": {"given_name": "Amara", "family_name": "Okafor"},
        "role": "agent",
        "agency_name": "Lagos Care Travel",
    }
    # CG-24: creating the account needs the age answer (the same identity token + nonce are then retried).
    r = await client.post(f"{API}/auth/apple", json=body, headers=MOBILE)
    assert r.status_code == 400 and r.json()["error"]["code"] == "age_attestation_required", r.text
    body["is_adult"] = True
    r = await client.post(f"{API}/auth/apple", json=body, headers=MOBILE)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["refresh_token"] and out["user"]["role"] == "agent" and out["user"]["agent_id"]
    assert out["user"]["full_name"] == "Amara Okafor"
    assert out["user"]["email"] == "relay123@privaterelay.appleid.com"
    agent = (await db.execute(select(Agent))).scalar_one()
    assert agent.agency_name == "Lagos Care Travel" and agent.status == AgentStatus.PENDING

    # Second sign-in: same sub -> same user, no name needed.
    body2 = {"identity_token": _apple_token(key, nonce), "nonce": nonce}
    r = await client.post(f"{API}/auth/apple", json=body2, headers=MOBILE)
    assert r.status_code == 200 and r.json()["user"]["id"] == out["user"]["id"]

    # Nonce mismatch, wrong audience, expired token, wrong issuer -> 401.
    bad_tokens = [
        {"identity_token": _apple_token(key, "another-nonce"), "nonce": nonce},
        {"identity_token": _apple_token(key, nonce, aud="com.other.app"), "nonce": nonce},
        {"identity_token": _apple_token(key, nonce, exp=1, iat=0), "nonce": nonce},
        {"identity_token": _apple_token(key, nonce, iss="https://evil.example"), "nonce": nonce},
    ]
    for bad in bad_tokens:
        r = await client.post(f"{API}/auth/apple", json=bad, headers=MOBILE)
        assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_apple_token", r.text

    # Links an existing account by verified email; staff are rejected at the public door.
    existing = await make_user(role="hospital", email="ops@hospital.test")
    linked = _apple_token(key, nonce, sub="apple-sub-2", email="ops@hospital.test")
    r = await client.post(
        f"{API}/auth/apple", json={"identity_token": linked, "nonce": nonce}, headers=MOBILE
    )
    assert r.status_code == 200 and r.json()["user"]["id"] == str(existing.id)
    await make_user(role="admin", email="root@hig.test")
    staff = _apple_token(key, nonce, sub="apple-sub-3", email="root@hig.test")
    r = await client.post(f"{API}/auth/apple", json={"identity_token": staff, "nonce": nonce}, headers=MOBILE)
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = await client.post(f"{API}/auth/apple", json={**body2, "role": "admin"}, headers=MOBILE)
    assert r.status_code == 422


async def test_mobile_register_agent_and_hospital_fields(client, db) -> None:
    _, agent = await register(client, "agent", agency_name="Gulf Health Links")
    assert agent["refresh_token"] and agent["user"]["agent_id"]
    _, hospital = await register(client, "hospital", hospital_name="Lotus Heart Institute", city="Pune")
    assert hospital["refresh_token"] and hospital["user"]["hospitals"][0]["name"] == "Lotus Heart Institute"


async def test_apple_refresh_token_stored_and_revoked_on_deletion(client, db, monkeypatch) -> None:
    from app.modules.auth import apple as apple_module

    key = _apple_setup(monkeypatch)
    for name, value in (("APPLE_TEAM_ID", "TEAM123"), ("APPLE_KEY_ID", "KEY123")):
        monkeypatch.setattr(settings, name, value)
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    p8 = ec.generate_private_key(ec.SECP256R1()).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    escaped = p8.decode().replace(chr(10), chr(92) + "n")  # escaped newlines, as in an .env file
    monkeypatch.setattr(settings, "APPLE_PRIVATE_KEY", escaped)
    calls: list[tuple[str, dict[str, str]]] = []

    class _Resp:
        def __init__(self, status: int, body: dict[str, Any]) -> None:
            self.status_code, self._body = status, body

        def json(self) -> dict[str, Any]:
            return self._body

    async def fake_post(url: str, data: dict[str, str]) -> Any:
        calls.append((url, data))
        return _Resp(200, {"refresh_token": "apple-refresh-1"} if url.endswith("/token") else {})

    monkeypatch.setattr(apple_module, "_post_apple", fake_post)
    nonce = "raw-nonce-revoke-1"
    body = {
        "identity_token": _apple_token(key, nonce),
        "nonce": nonce,
        "authorization_code": "code-1",
        "is_adult": True,
    }
    r = await client.post(f"{API}/auth/apple", json=body, headers=MOBILE)
    assert r.status_code == 201, r.text
    user_id = r.json()["user"]["id"]
    assert calls[0][0] == apple_module.APPLE_TOKEN_URL and calls[0][1]["code"] == "code-1"
    secret_claims = jwt_decode_unverified(calls[0][1]["client_secret"])
    assert secret_claims["iss"] == "TEAM123" and secret_claims["sub"] == "com.healindia.app"
    db.expire_all()
    stored = await db.get(User, user_id)
    assert stored is not None and stored.apple_refresh_token == "com.healindia.app apple-refresh-1"
    raw = (await db.execute(select(func.cast(User.__table__.c.apple_refresh_token, String)))).scalar_one()
    assert "apple-refresh-1" not in raw  # encrypted at rest

    r = await client.request("DELETE", f"{API}/auth/me", json={}, headers=bearer(r.json()))
    assert r.status_code == 204, r.text
    assert calls[-1][0] == apple_module.APPLE_REVOKE_URL
    assert calls[-1][1]["token"] == "apple-refresh-1" and calls[-1][1]["token_type_hint"] == "refresh_token"
    db.expire_all()
    stored = await db.get(User, user_id)
    assert stored is not None and stored.apple_refresh_token is None and stored.apple_sub is None


def jwt_decode_unverified(token: str) -> dict[str, Any]:
    import jwt

    return jwt.decode(token, options={"verify_signature": False})


async def test_deletion_request_when_blocked(client, db, make_user, auth_headers) -> None:
    support = await make_user(role="support")
    patient = await create_patient(db)
    patient_user = await db.get(User, patient.user_id)
    hospital = await create_hospital(db)
    await create_case(db, patient, hospital, status=CaseStatus.IN_TREATMENT)
    headers = auth_headers(patient_user)
    r = await client.request("DELETE", f"{API}/auth/me", json={"password": "Passw0rd!2026"}, headers=headers)
    assert r.status_code == 409 and r.json()["error"]["code"] == "account_deletion_blocked"
    assert r.json()["error"]["details"] == {"cases_in_progress": 1}
    r = await client.post(f"{API}/auth/me/deletion-request", json={"reason": "Moving on"}, headers=headers)
    assert r.status_code == 202, r.text
    out = r.json()
    assert out["status"] == "received" and out["id"]
    entry = await db.get(AuditLog, out["id"])
    assert entry is not None and entry.action == "auth.deletion_requested"
    assert entry.after["blockers"] == {"cases_in_progress": 1}
    from app.models import Notification

    notes = (await db.execute(select(Notification).where(Notification.user_id == support.id))).scalars().all()
    assert len(notes) == 1 and notes[0].kind == "account.deletion_requested"
    assert (await client.post(f"{API}/auth/me/deletion-request", headers=headers)).status_code == 202


async def test_agent_recorded_consent_is_not_patient_confirmation_sec060(
    client, db, make_user, auth_headers
) -> None:
    from app.modules.agents.consent import pending_agent_consents

    agent = await create_agent(db)
    patient_user = await make_user(role="patient")
    await create_patient(db, patient_user)
    db.add(
        AuditLog(
            actor_user_id=agent.user_id,
            actor_role="agent",
            action="agent.patient_consent_attested",
            entity_type="user",
            entity_id=str(patient_user.id),
            after={"agent_id": str(agent.id), "kinds": ["terms", "ai_processing"], "version": "2026-10"},
        )
    )
    # The agent's own submission records consent rows on the patient's behalf ...
    for kind in (ConsentKind.TERMS, ConsentKind.AI_PROCESSING):
        auth_service.record_consent(
            db, patient_user.id, kind, "2026-10", None, granted_by_user_id=agent.user_id
        )
    await db.commit()
    row = (await db.execute(select(Consent).where(Consent.kind == ConsentKind.TERMS))).scalar_one()
    assert row.granted_by_user_id == agent.user_id
    # ... which must not count as the patient's confirmation.
    assert sorted(await pending_agent_consents(db, patient_user.id)) == ["ai_processing", "terms"]
    body = {"kind": "terms", "version": "2026-10", "granted": True}
    assert (
        await client.post(f"{API}/auth/consents", json=body, headers=auth_headers(patient_user))
    ).status_code == 201
    own = (
        await db.execute(
            select(Consent).where(Consent.kind == ConsentKind.TERMS, Consent.granted_by_user_id.is_(None))
        )
    ).scalar_one()
    assert own.user_id == patient_user.id
    assert await pending_agent_consents(db, patient_user.id) == ["ai_processing"]


async def test_agent_and_hospital_invite_links_use_public_site_fragment(
    client, db, make_user, auth_headers, run_jobs, email_outbox
) -> None:
    """Invite emails link to the website door with the token in the fragment; the page POSTs it (#22)."""
    import re

    agent = await create_agent(db)
    agent_user = await db.get(User, agent.user_id)
    owner = await make_user(role="hospital")
    await create_hospital(db, owner=owner)
    patient = {
        "first_name": "Amina",
        "last_name": "Okafor",
        "email": "amina.invite@example.com",
        "nationality": "NG",
        "consent_attested": True,
    }
    r = await client.post(f"{API}/agent-portal/patients", json=patient, headers=auth_headers(agent_user))
    assert r.status_code == 201, r.text
    member = {"email": "coord.invite@example.com", "full_name": "Nia Coord", "member_role": "coordinator"}
    r = await client.post(f"{API}/hospital-portal/members", json=member, headers=auth_headers(owner))
    assert r.status_code == 201, r.text
    await run_jobs()
    prefix = f"{settings.PUBLIC_SITE_URL.rstrip('/')}/accept-invite#token="
    for address in ("amina.invite@example.com", "coord.invite@example.com"):
        [mail] = [m for m in email_outbox if address in str(m["to"])]
        assert "accept-invite?token=" not in mail["html"]
        match = re.search(re.escape(prefix) + r"([A-Za-z0-9_\-]+)", mail["html"])
        assert match, mail["html"][:500]
        body = {"token": match.group(1), "password": PASSWORD, "accept_terms": True}
        r = await client.post(f"{API}/auth/accept-invite", json=body, headers=MOBILE)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == address and r.json()["refresh_token"]
