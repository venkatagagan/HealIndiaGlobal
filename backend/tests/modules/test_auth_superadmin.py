"""``python -m scripts.create_superadmin`` core function (first super_admin + MFA enrolment code)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.enums import UserRole
from app.models import AuditLog, User
from scripts.create_superadmin import BootstrapError, _read_password, create_superadmin
from tests.modules.auth_helpers import API, PASSWORD, totp_now


async def test_create_superadmin_and_enrol_mfa(client, db, make_user, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ADMIN_MFA_REQUIRED", True)
    with pytest.raises(BootstrapError, match="at least"):
        await create_superadmin(db, email="root@hig.test", full_name="Root", password="short1")

    result = await create_superadmin(db, email="Root@HIG.test", full_name="Ops  Lead", password=PASSWORD)
    assert result.created and result.email == "root@hig.test" and result.enrolment_token
    user = (await db.execute(select(User).where(User.email == "root@hig.test"))).scalar_one()
    assert user.role == UserRole.SUPER_ADMIN and user.full_name == "Ops Lead" and not user.mfa_enabled
    actions = set((await db.execute(select(AuditLog.action))).scalars().all())
    assert {"auth.superadmin_bootstrap", "auth.mfa_enrolment_token_issued"} <= actions

    # A second super_admin needs --force-additional; non-staff accounts are never promoted.
    with pytest.raises(BootstrapError, match="already exists"):
        await create_superadmin(db, email="two@hig.test", full_name="Two", password=PASSWORD)
    await make_user(role="patient", email="pat@hig.test")
    with pytest.raises(BootstrapError, match="non-staff"):
        await create_superadmin(
            db, email="pat@hig.test", full_name="Pat", password=PASSWORD, force_additional=True
        )
    promoted = await make_user(role="support", email="sup@hig.test")
    again = await create_superadmin(
        db, email="sup@hig.test", full_name="Sup", password=PASSWORD, force_additional=True
    )
    assert not again.created and again.user_id == str(promoted.id)

    # The printed enrolment code is what the staff door needs.
    login = {"email": "root@hig.test", "password": PASSWORD, "enrolment_token": result.enrolment_token}
    r = await client.post(f"{API}/auth/staff/login", json=login)
    assert r.status_code == 401 and r.json()["error"]["code"] == "mfa_required"
    secret = r.json()["error"]["details"]["secret"]
    r = await client.post(f"{API}/auth/staff/login", json={**login, "otp_code": totp_now(secret)})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "super_admin" and r.json()["user"]["mfa_enabled"] is True


def test_password_prompt_requires_match() -> None:
    answers = iter(["Sunrise2026travel", "Sunrise2026travel"])
    assert _read_password(lambda _prompt: next(answers)) == "Sunrise2026travel"
    answers = iter(["Sunrise2026travel", "different-1"])
    with pytest.raises(BootstrapError, match="do not match"):
        _read_password(lambda _prompt: next(answers))
