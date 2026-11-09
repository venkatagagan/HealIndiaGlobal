"""Auth module tests (PLAN 8.1 / 9.2): registration per role, login + lockout + MFA, refresh rotation with
reuse detection, web cookie vs mobile body, guests, Google sign-in, email verification, password flows,
consents, devices and rate limits."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.core.enums import AgentStatus, HospitalStatus, UserStatus
from app.models import (
    Agent,
    AuditLog,
    Consent,
    DeviceToken,
    Hospital,
    HospitalMember,
    PatientCompanion,
    PatientProfile,
    RefreshToken,
    User,
)
from app.modules.auth import google as google_module
from app.modules.auth import service as auth_service
from tests.factories import create_agent
from tests.modules.auth_helpers import (
    API,
    MOBILE,
    PASSWORD,
    XHR,
    bearer,
    login,
    register,
    register_payload,
    totp_now,
)

NEW_PASSWORD = "Monsoon2027season"


def _token_from_outbox(outbox: list[dict[str, Any]], subject_part: str) -> str:
    for message in reversed(outbox):
        if subject_part.lower() in message["subject"].lower():
            match = re.search(r"token=([A-Za-z0-9_\-]+)", message["html"])
            assert match, message["html"]
            return match.group(1)
    raise AssertionError(
        f"no email with subject containing {subject_part!r}: {[m['subject'] for m in outbox]}"
    )


# --------------------------------------------------------------------------------------------- registration
async def test_register_patient_mobile(client, db, run_jobs, email_outbox, monkeypatch) -> None:
    published: list[tuple[str, dict[str, Any]]] = []
    original_publish = auth_service.publish

    async def recording_publish(session, name, payload=None):
        published.append((name, dict(payload or {})))
        return await original_publish(session, name, payload)

    monkeypatch.setattr(auth_service, "publish", recording_publish)

    payload, token = await register(client, "patient", email="Jane.Doe@Example.TEST")
    user = token["user"]
    assert token["token_type"] == "bearer"
    assert token["expires_in"] == settings.ACCESS_TOKEN_TTL_MINUTES * 60
    assert token["refresh_token"]
    assert user["email"] == "jane.doe@example.test"
    assert user["role"] == "patient" and user["status"] == "active"
    assert user["is_guest"] is False and user["email_verified"] is False and user["mfa_enabled"] is False
    assert user["patient_profile_id"] and user["agent_id"] is None and user["hospitals"] == []
    assert ("user.registered", {"user_id": user["id"], "role": "patient"}) in published

    profile = await db.get(PatientProfile, user["patient_profile_id"])
    assert profile is not None
    assert (profile.first_name, profile.last_name) == ("Amara", "Okafor")
    assert profile.nationality == "US" and profile.preferred_currency == "USD"
    kinds = (await db.execute(select(Consent.kind).where(Consent.user_id == profile.user_id))).scalars().all()
    assert sorted(str(k) for k in kinds) == ["age_18_plus", "privacy", "terms"]  # CG-24 attestation
    audit = (await db.execute(select(AuditLog).where(AuditLog.action == "auth.register"))).scalars().all()
    assert len(audit) == 1 and audit[0].entity_id == user["id"]

    await run_jobs()
    assert _token_from_outbox(email_outbox, "verify")

    me = await client.get(f"{API}/auth/me", headers=bearer(token))
    assert me.status_code == 200, me.text
    assert me.json()["patient_profile_id"] == user["patient_profile_id"]


async def test_register_web_sets_httponly_cookie(client) -> None:
    payload = register_payload("patient")
    r = await client.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 201, r.text
    assert r.json()["refresh_token"] is None
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("hig_refresh=")
    assert "HttpOnly" in cookie and "Path=/api/v1/auth" in cookie and "samesite=strict" in cookie.lower()
    assert "Secure" not in cookie  # COOKIE_SECURE is false outside production
    assert r.headers["cache-control"] == "no-store"


async def test_register_agent_and_hospital(client, db) -> None:
    _, agent_token = await register(client, "agent")
    agent_id = agent_token["user"]["agent_id"]
    assert agent_id and agent_token["user"]["role"] == "agent"
    agent = await db.get(Agent, agent_id)
    assert agent is not None and agent.status == AgentStatus.PENDING
    assert re.fullmatch(r"AGT[A-Z2-9]{5}", agent.agent_code)
    assert agent.country == "NG"

    payload, hospital_token = await register(client, "hospital")
    hospitals = hospital_token["user"]["hospitals"]
    assert len(hospitals) == 1 and hospitals[0]["member_role"] == "owner"
    assert hospitals[0]["name"] == payload["hospital_name"]
    hospital = await db.get(Hospital, hospitals[0]["id"])
    assert hospital is not None and hospital.status == HospitalStatus.DRAFT
    assert hospital.city == "Chennai" and hospital.slug.startswith("sunrise-speciality-hospital")
    members = (
        (await db.execute(select(HospitalMember).where(HospitalMember.hospital_id == hospital.id)))
        .scalars()
        .all()
    )
    assert [str(m.member_role) for m in members] == ["owner"]

    # A second hospital with the same name gets a unique slug.
    _, other = await register(client, "hospital", hospital_name=payload["hospital_name"])
    assert other["user"]["hospitals"][0]["slug"] != hospitals[0]["slug"]


async def test_register_with_referral_code(client, db) -> None:
    agent = await create_agent(db)
    _, token = await register(client, "patient", referral_code=agent.agent_code.lower())
    profile = await db.get(PatientProfile, token["user"]["patient_profile_id"])
    assert profile is not None and profile.referred_by_agent_id == agent.id

    r = await client.post(f"{API}/auth/register", json=register_payload(referral_code="AGTNOPE1"))
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_referral_code"

    pending = await create_agent(db, status="pending")
    _, token = await register(client, "patient", referral_code=pending.agent_code)
    profile = await db.get(PatientProfile, token["user"]["patient_profile_id"])
    assert profile is not None and profile.referred_by_agent_id is None


@pytest.mark.parametrize(
    ("overrides", "status", "code"),
    [
        ({"password": "short1"}, 400, "weak_password"),
        ({"password": "onlyletterslongenough"}, 400, "weak_password"),
        ({"accept_terms": False}, 422, "validation_error"),
        ({"role": "admin"}, 422, "validation_error"),
        ({"role": "agent", "agency_name": None}, 422, "validation_error"),
        ({"role": "hospital", "hospital_name": "  "}, 422, "validation_error"),
        ({"email": "not-an-email"}, 422, "validation_error"),
        ({"unexpected": "x"}, 422, "validation_error"),
    ],
)
async def test_register_validation(client, overrides, status, code) -> None:
    payload = register_payload(overrides.get("role", "patient"))
    payload.update(overrides)
    payload = {k: v for k, v in payload.items() if v is not None}
    r = await client.post(f"{API}/auth/register", json=payload)
    assert r.status_code == status, r.text
    assert r.json()["error"]["code"] == code


async def test_register_duplicate_email_case_insensitive(client) -> None:
    payload, _ = await register(client, "patient")
    again = register_payload("agent", email=payload["email"].upper())
    r = await client.post(f"{API}/auth/register", json=again)
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


# --------------------------------------------------------------------------------------------- login
async def test_login_success_and_failures(client, make_user) -> None:
    user = await make_user(role="patient", email="ok.user@example.test", password=PASSWORD)
    r = await login(client, "OK.User@example.test")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["id"] == str(user.id) and body["refresh_token"]

    r = await login(client, "ok.user@example.test", "WrongPassword1")
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = await login(client, "nobody@example.test")
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"


async def test_login_lockout_after_five_failures(client, db, make_user) -> None:
    user = await make_user(role="patient", email="lock.me@example.test", password=PASSWORD)
    user_id = user.id
    for _ in range(4):
        r = await login(client, "lock.me@example.test", "WrongPassword1")
        assert r.status_code == 401
    r = await login(client, "lock.me@example.test", "WrongPassword1")
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_locked"
    assert int(r.headers["retry-after"]) > 0

    # Even the right password is refused while locked.
    r = await login(client, "lock.me@example.test")
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_locked"

    db.expire_all()
    locked = await db.get(User, user_id)
    assert locked is not None and locked.locked_until is not None
    assert timedelta(minutes=14) < locked.locked_until - datetime.now(UTC) <= timedelta(minutes=15)
    actions = (
        (await db.execute(select(AuditLog.action).where(AuditLog.entity_id == str(user_id)))).scalars().all()
    )
    assert actions.count("auth.login_failed") == 5 and "auth.account_locked" in actions

    # After the lock expires the account works again and the counter is reset.
    locked.locked_until = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    r = await login(client, "lock.me@example.test")
    assert r.status_code == 200, r.text
    db.expire_all()
    refreshed = await db.get(User, user_id)
    assert refreshed is not None and refreshed.failed_login_count == 0 and refreshed.locked_until is None


async def test_login_suspended_account(client, make_user) -> None:
    await make_user(role="patient", email="sus@example.test", password=PASSWORD, status=UserStatus.SUSPENDED)
    r = await login(client, "sus@example.test")
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_suspended"


async def test_mfa_setup_enable_login_disable(client, db, make_user, auth_headers) -> None:
    user = await make_user(role="patient", email="mfa@example.test", password=PASSWORD)
    user_id = user.id
    headers = auth_headers(user)
    r = await client.post(f"{API}/auth/mfa/enable", json={"code": "123456"}, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "mfa_not_setup"

    setup = await client.post(f"{API}/auth/mfa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_url"].startswith("otpauth://totp/")

    r = await client.post(f"{API}/auth/mfa/enable", json={"code": "000000"}, headers=headers)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_otp"
    r = await client.post(f"{API}/auth/mfa/enable", json={"code": totp_now(secret)}, headers=headers)
    assert r.status_code == 204, r.text
    db.expire_all()
    stored = await db.get(User, user_id)
    assert stored is not None and stored.mfa_enabled and stored.mfa_secret == secret

    r = await login(client, "mfa@example.test")
    assert r.status_code == 401 and r.json()["error"]["code"] == "mfa_required"
    r = await login(client, "mfa@example.test", otp_code="000000")
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_otp"
    r = await login(client, "mfa@example.test", otp_code=totp_now(secret))
    assert r.status_code == 200, r.text
    assert r.json()["user"]["mfa_enabled"] is True

    r = await client.post(f"{API}/auth/mfa/disable", json={"code": totp_now(secret)}, headers=headers)
    assert r.status_code == 204, r.text
    r = await login(client, "mfa@example.test")
    assert r.status_code == 200
    actions = set((await db.execute(select(AuditLog.action))).scalars().all())
    assert {"auth.mfa_setup", "auth.mfa_enabled", "auth.mfa_disabled"} <= actions


# ----------------------------------------------------------------------------------------- refresh / logout
async def test_refresh_rotation_and_reuse_detection_mobile(client, db) -> None:
    _, token = await register(client, "patient")
    first = token["refresh_token"]

    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": first}, headers=MOBILE)
    assert r.status_code == 200, r.text
    second = r.json()["refresh_token"]
    assert second and second != first
    assert r.json()["user"]["id"] == token["user"]["id"]
    me = await client.get(f"{API}/auth/me", headers=bearer(r.json()))
    assert me.status_code == 200

    # Re-using the rotated token revokes the whole family, including the newest token.
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": first})
    assert r.status_code == 401 and r.json()["error"]["code"] == "refresh_token_reused"
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": second})
    assert r.status_code == 401
    rows = (
        (await db.execute(select(RefreshToken).where(RefreshToken.user_id == token["user"]["id"])))
        .scalars()
        .all()
    )
    assert len(rows) == 2 and all(t.revoked_at is not None for t in rows)
    assert len({t.family_id for t in rows}) == 1
    assert (
        await db.execute(
            select(func.count()).select_from(AuditLog).where(AuditLog.action == "auth.refresh_reuse_detected")
        )
    ).scalar_one() == 1

    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": "garbage-token-value"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_refresh_token"


async def test_refresh_expired_token(client, db) -> None:
    _, token = await register(client, "patient")
    row = (
        await db.execute(select(RefreshToken).where(RefreshToken.user_id == token["user"]["id"]))
    ).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": token["refresh_token"]})
    assert r.status_code == 401 and r.json()["error"]["code"] == "refresh_token_expired"


async def test_web_cookie_refresh_requires_xhr_and_rotates_cookie(client) -> None:
    r = await client.post(f"{API}/auth/register", json=register_payload("patient"))
    assert r.status_code == 201
    original_cookie = client.cookies.get("hig_refresh")
    assert original_cookie

    r = await client.post(f"{API}/auth/refresh", json={})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_check_failed"

    r = await client.post(f"{API}/auth/refresh", json={}, headers=XHR)
    assert r.status_code == 200, r.text
    assert r.json()["refresh_token"] is None and r.json()["access_token"]
    rotated = client.cookies.get("hig_refresh")
    assert rotated and rotated != original_cookie

    # Logout via cookie revokes the session and clears the cookie.
    r = await client.post(f"{API}/auth/logout", headers={**XHR, **bearer(r.json())})
    assert r.status_code == 204, r.text
    assert 'hig_refresh=""' in r.headers["set-cookie"] or "Max-Age=0" in r.headers["set-cookie"]
    client.cookies.set("hig_refresh", rotated, path="/api/v1/auth")
    r = await client.post(f"{API}/auth/refresh", json={}, headers=XHR)
    assert r.status_code == 401
    assert r.headers["set-cookie"].startswith("hig_refresh=")  # a dead cookie is cleared


async def test_refresh_without_any_token(client) -> None:
    r = await client.post(f"{API}/auth/refresh", headers=XHR)
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_refresh_token"


async def test_logout_mobile_revokes_family(client, db) -> None:
    _, token = await register(client, "patient")
    r = await client.post(
        f"{API}/auth/logout",
        json={"refresh_token": token["refresh_token"]},
        headers={**MOBILE, **bearer(token)},
    )
    assert r.status_code == 204, r.text
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": token["refresh_token"]})
    assert r.status_code == 401
    assert (await db.execute(select(AuditLog).where(AuditLog.action == "auth.logout"))).scalars().first()

    r = await client.post(f"{API}/auth/logout")
    assert r.status_code == 401


# --------------------------------------------------------------------------------------------- guests
async def test_guest_create_and_upgrade_keeps_data(client, db) -> None:
    r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
    assert r.status_code == 201, r.text
    guest = r.json()
    assert guest["user"]["is_guest"] is True and guest["user"]["email"] is None
    assert guest["user"]["role"] == "patient" and guest["user"]["patient_profile_id"]
    headers = bearer(guest)

    r = await client.post(
        f"{API}/patient/companions",
        json={"full_name": "Ali Haddad", "relationship": "brother"},
        headers=headers,
    )
    assert r.status_code == 201, r.text

    r = await client.post(
        f"{API}/auth/guest/upgrade",
        json={
            "email": "Upgraded@Example.test",
            "password": PASSWORD,
            "full_name": "Leila Haddad",
            "is_adult": True,
        },
        headers={**MOBILE, **headers},
    )
    assert r.status_code == 200, r.text
    upgraded = r.json()
    assert upgraded["user"]["id"] == guest["user"]["id"]
    assert upgraded["user"]["patient_profile_id"] == guest["user"]["patient_profile_id"]
    assert upgraded["user"]["is_guest"] is False and upgraded["user"]["email"] == "upgraded@example.test"
    assert upgraded["user"]["full_name"] == "Leila Haddad"

    companions = (
        (
            await db.execute(
                select(PatientCompanion).where(
                    PatientCompanion.patient_id == guest["user"]["patient_profile_id"]
                )
            )
        )
        .scalars()
        .all()
    )
    assert [c.full_name for c in companions] == ["Ali Haddad"]
    profile = await db.get(PatientProfile, guest["user"]["patient_profile_id"])
    assert profile is not None and (profile.first_name, profile.last_name) == ("Leila", "Haddad")

    # The guest session was revoked; the new credentials work.
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": guest["refresh_token"]})
    assert r.status_code == 401
    r = await login(client, "upgraded@example.test")
    assert r.status_code == 200

    r = await client.post(
        f"{API}/auth/guest/upgrade",
        json={"email": "again@example.test", "password": PASSWORD, "full_name": "X Y", "is_adult": True},
        headers=bearer(upgraded),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "not_guest"


async def test_guest_upgrade_email_taken(client, make_user) -> None:
    await make_user(role="patient", email="taken@example.test")
    r = await client.post(f"{API}/auth/guest", json={})
    guest = r.json()
    r = await client.post(
        f"{API}/auth/guest/upgrade",
        json={"email": "taken@example.test", "password": PASSWORD, "full_name": "X Y", "is_adult": True},
        headers=bearer(guest),
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


# --------------------------------------------------------------------------------------------- google
def _fake_google(monkeypatch, claims: dict[str, Any] | Exception) -> list[Any]:
    calls: list[Any] = []

    def fake_verify(token, request, audience=None, clock_skew_in_seconds=0):
        calls.append((token, audience))
        if isinstance(claims, Exception):
            raise claims
        return claims

    monkeypatch.setattr(
        settings, "GOOGLE_CLIENT_IDS", ["web-client.apps.googleusercontent.com", "ios-client"]
    )
    monkeypatch.setattr(google_module.google_id_token, "verify_oauth2_token", fake_verify)
    return calls


def _claims(**overrides: Any) -> dict[str, Any]:
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "web-client.apps.googleusercontent.com",
        "sub": "google-sub-123",
        "email": "g.user@gmail.test",
        "email_verified": True,
        "name": "Grace Mensah",
        "picture": "https://lh3.googleusercontent.test/a.png",
    }
    claims.update(overrides)
    return claims


async def test_google_not_configured(client, monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_IDS", [])
    r = await client.post(f"{API}/auth/google", json={"id_token": "x" * 40})
    assert r.status_code == 400 and r.json()["error"]["code"] == "google_not_configured"


async def test_google_sign_up_then_sign_in(client, db, monkeypatch) -> None:
    calls = _fake_google(monkeypatch, _claims())
    # CG-24: a new account needs the age answer; the client asks and retries with is_adult.
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"}, headers=MOBILE)
    assert r.status_code == 400 and r.json()["error"]["code"] == "age_attestation_required", r.text
    r = await client.post(
        f"{API}/auth/google", json={"id_token": "id-token-value-1234", "is_adult": True}, headers=MOBILE
    )
    assert r.status_code == 201, r.text
    created = r.json()["user"]
    assert created["role"] == "patient" and created["email_verified"] is True
    assert created["is_adult"] is True and created["guardian_consent_required"] is False
    assert created["full_name"] == "Grace Mensah" and created["patient_profile_id"]
    assert calls[0][1] == ["web-client.apps.googleusercontent.com", "ios-client"]

    # Signing in to the existing account needs no age answer.
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"}, headers=MOBILE)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == created["id"]
    user = await db.get(User, created["id"])
    assert user is not None and user.google_sub == "google-sub-123" and user.password_hash is None


async def test_google_links_existing_account_by_verified_email(client, db, make_user, monkeypatch) -> None:
    existing = await make_user(role="agent", email="g.user@gmail.test")
    existing_id = existing.id
    _fake_google(monkeypatch, _claims())
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == str(existing_id) and r.json()["user"]["role"] == "agent"
    db.expire_all()
    linked = await db.get(User, existing_id)
    assert linked is not None and linked.google_sub == "google-sub-123"


async def test_google_refuses_to_link_unverified_account_sec001(client, db, make_user, monkeypatch) -> None:
    """SEC-001: an attacker pre-registers the victim's email with a password; Google must not link to it."""
    squatter = await make_user(role="patient", email="g.user@gmail.test", email_verified_at=None)
    squatter_id = squatter.id
    _fake_google(monkeypatch, _claims())
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "account_exists_unverified", r.text
    db.expire_all()
    unchanged = await db.get(User, squatter_id)
    assert unchanged is not None and unchanged.google_sub is None and unchanged.email_verified_at is None
    assert (await db.execute(select(func.count()).select_from(RefreshToken))).scalar_one() == 0


async def test_google_agent_sign_up_and_rejections(client, db, make_user, monkeypatch) -> None:
    _fake_google(monkeypatch, _claims(sub="agent-sub", email="agency@gmail.test"))
    body = {"id_token": "id-token-value-1234", "role": "agent", "agency_name": "Nile Care"}
    r = await client.post(f"{API}/auth/google", json={**body, "is_adult": False})
    assert r.status_code == 400 and r.json()["error"]["code"] == "adult_required", r.text
    r = await client.post(f"{API}/auth/google", json={**body, "is_adult": True})
    assert r.status_code == 201, r.text
    agent = await db.get(Agent, r.json()["user"]["agent_id"])
    assert agent is not None and agent.agency_name == "Nile Care" and agent.status == AgentStatus.PENDING

    # Unverified email that matches an account is not linked, and cannot create a new account either.
    await make_user(role="patient", email="victim@example.test")
    _fake_google(monkeypatch, _claims(sub="attacker", email="victim@example.test", email_verified=False))
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "google_email_unverified"

    _fake_google(monkeypatch, ValueError("Token expired"))
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_google_token"

    _fake_google(monkeypatch, _claims(iss="https://evil.example"))
    r = await client.post(f"{API}/auth/google", json={"id_token": "id-token-value-1234"})
    assert r.status_code == 401


# --------------------------------------------------------------------------------------------- me / passwords
async def test_me_get_and_patch(client, db, make_user, auth_headers) -> None:
    user = await make_user(role="hospital", full_name="Meera Iyer")
    from tests.factories import create_hospital

    hospital = await create_hospital(db, owner=user)
    r = await client.get(f"{API}/auth/me", headers=auth_headers(user))
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["hospitals"] == [
        {"id": str(hospital.id), "name": hospital.name, "slug": hospital.slug, "member_role": "owner"}
    ]
    r = await client.patch(
        f"{API}/auth/me",
        json={
            "full_name": "Dr Meera Iyer",
            "phone": "+91 44 4000 1000",
            "preferred_language": "ta",
            "country_code": "in",
            "avatar_url": "https://cdn.example.test/a.png",
        },
        headers=auth_headers(user),
    )
    assert r.status_code == 200, r.text
    assert r.json()["full_name"] == "Dr Meera Iyer" and r.json()["country_code"] == "IN"
    r = await client.patch(
        f"{API}/auth/me", json={"avatar_url": "javascript:alert(1)"}, headers=auth_headers(user)
    )
    assert r.status_code == 422
    r = await client.patch(f"{API}/auth/me", json={"role": "admin"}, headers=auth_headers(user))
    assert r.status_code == 422
    assert (await client.get(f"{API}/auth/me")).status_code == 401


async def test_change_password_revokes_other_sessions(client, run_jobs, email_outbox) -> None:
    payload, first = await register(client, "patient")
    second = (await login(client, payload["email"])).json()

    r = await client.post(
        f"{API}/auth/change-password",
        json={"current_password": "WrongPassword9", "new_password": NEW_PASSWORD},
        headers=bearer(first),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_current_password"
    r = await client.post(
        f"{API}/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "weak"},
        headers=bearer(first),
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "weak_password"
    r = await client.post(
        f"{API}/auth/change-password",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        headers=bearer(first),
    )
    assert r.status_code == 204, r.text

    # The session that changed the password survives; the other one is revoked.
    assert (
        await client.post(f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]})
    ).status_code == 200
    assert (
        await client.post(f"{API}/auth/refresh", json={"refresh_token": second["refresh_token"]})
    ).status_code == 401
    assert (await login(client, payload["email"])).status_code == 401
    assert (await login(client, payload["email"], NEW_PASSWORD)).status_code == 200
    await run_jobs()
    assert any("password was changed" in m["subject"].lower() for m in email_outbox)


async def test_forgot_and_reset_password(client, db, make_user, run_jobs, email_outbox) -> None:
    user = await make_user(role="patient", email="forgot@example.test", password=PASSWORD)
    r = await client.post(f"{API}/auth/forgot-password", json={"email": "nobody@example.test"})
    assert r.status_code == 202
    await run_jobs()
    assert not [m for m in email_outbox if "reset" in m["subject"].lower()]

    r = await client.post(f"{API}/auth/forgot-password", json={"email": "Forgot@example.test"})
    assert r.status_code == 202
    await run_jobs()
    token = _token_from_outbox(email_outbox, "reset")
    session = (await login(client, "forgot@example.test")).json()

    # Lock the account; a successful reset unlocks it.
    user.locked_until = datetime.now(UTC) + timedelta(minutes=10)
    await db.commit()
    r = await client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "weak"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "weak_password"
    r = await client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 204, r.text
    r = await client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_token"
    assert (await login(client, "forgot@example.test", NEW_PASSWORD)).status_code == 200
    # Existing sessions were revoked by the reset.
    r = await client.post(f"{API}/auth/refresh", json={"refresh_token": session["refresh_token"]})
    assert r.status_code == 401


async def test_verify_email_flow(client, db, run_jobs, email_outbox) -> None:
    _, token = await register(client, "patient")
    await run_jobs()
    raw = _token_from_outbox(email_outbox, "verify")
    r = await client.post(f"{API}/auth/verify-email", json={"token": raw})
    assert r.status_code == 204, r.text
    me = (await client.get(f"{API}/auth/me", headers=bearer(token))).json()
    assert me["email_verified"] is True
    r = await client.post(f"{API}/auth/verify-email", json={"token": raw})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_token"
    # Already verified: resend is a no-op.
    email_outbox.clear()
    r = await client.post(f"{API}/auth/resend-verification", headers=bearer(token))
    assert r.status_code == 202
    await run_jobs()
    assert not [m for m in email_outbox if "verify" in m["subject"].lower()]


async def test_resend_verification_invalidates_old_token(client, run_jobs, email_outbox) -> None:
    _, token = await register(client, "patient")
    await run_jobs()
    first = _token_from_outbox(email_outbox, "verify")
    r = await client.post(f"{API}/auth/resend-verification", headers=bearer(token))
    assert r.status_code == 202
    await run_jobs()
    second = _token_from_outbox(email_outbox, "verify")
    assert first != second
    assert (await client.post(f"{API}/auth/verify-email", json={"token": first})).status_code == 400
    assert (await client.post(f"{API}/auth/verify-email", json={"token": second})).status_code == 204


async def test_email_verification_required_blocks_login(client, monkeypatch, run_jobs, email_outbox) -> None:
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", True)
    payload, token = await register(client, "patient")
    assert token["user"]["status"] == "pending_verification"
    r = await login(client, payload["email"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "email_not_verified"
    await run_jobs()
    raw = _token_from_outbox(email_outbox, "verify")
    assert (await client.post(f"{API}/auth/verify-email", json={"token": raw})).status_code == 204
    r = await login(client, payload["email"])
    assert r.status_code == 200 and r.json()["user"]["status"] == "active"


# --------------------------------------------------------------------------------------- consents / devices
async def test_consents_latest_per_kind(client, make_user, auth_headers) -> None:
    user = await make_user(role="patient")
    headers = auth_headers(user)
    for granted in (True, False):
        r = await client.post(
            f"{API}/auth/consents",
            json={"kind": "share_with_hospitals", "version": "2026-10", "granted": granted},
            headers=headers,
        )
        assert r.status_code == 201, r.text
    r = await client.post(
        f"{API}/auth/consents",
        json={"kind": "ai_processing", "version": "2026-10", "granted": True},
        headers=headers,
    )
    assert r.status_code == 201
    current = (await client.get(f"{API}/auth/consents", headers=headers)).json()
    by_kind = {c["kind"]: c["granted"] for c in current}
    assert by_kind == {"share_with_hospitals": False, "ai_processing": True}
    history = (await client.get(f"{API}/auth/consents", params={"history": True}, headers=headers)).json()
    assert len(history) == 3
    r = await client.post(
        f"{API}/auth/consents", json={"kind": "bogus", "version": "1", "granted": True}, headers=headers
    )
    assert r.status_code == 422


async def test_device_tokens_upsert(client, db, make_user, auth_headers) -> None:
    first = await make_user(role="patient")
    second = await make_user(role="patient")
    body = {"platform": "android", "token": "fcm-token-abcdefgh"}
    assert (
        await client.post(f"{API}/auth/devices", json=body, headers=auth_headers(first))
    ).status_code == 204
    assert (
        await client.post(f"{API}/auth/devices", json=body, headers=auth_headers(first))
    ).status_code == 204
    # The device changes hands: it now belongs to the second user.
    assert (
        await client.post(f"{API}/auth/devices", json=body, headers=auth_headers(second))
    ).status_code == 204
    rows = (await db.execute(select(DeviceToken))).scalars().all()
    assert len(rows) == 1 and rows[0].user_id == second.id
    second_headers = auth_headers(second)
    r = await client.delete(f"{API}/auth/devices", params={"token": body["token"]}, headers=second_headers)
    assert r.status_code == 204
    db.expire_all()
    assert (await db.execute(select(func.count()).select_from(DeviceToken))).scalar_one() == 0


# --------------------------------------------------------------------------------------------- rate limits
async def test_rate_limits(client, make_user, monkeypatch) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    for _ in range(3):
        r = await client.post(f"{API}/auth/forgot-password", json={"email": "x@example.test"})
        assert r.status_code == 202
    r = await client.post(f"{API}/auth/forgot-password", json={"email": "x@example.test"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) >= 1

    for _ in range(5):
        r = await client.post(f"{API}/auth/register", json=register_payload("patient"))
        assert r.status_code == 201, r.text
    r = await client.post(f"{API}/auth/register", json=register_payload("patient"))
    assert r.status_code == 429

    await make_user(role="patient", email="rl@example.test", password=PASSWORD)
    statuses = [(await login(client, "rl@example.test")).status_code for _ in range(11)]
    assert statuses[:10] == [200] * 10 and statuses[10] == 429
