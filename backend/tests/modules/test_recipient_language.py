"""E6: emails, SMS and push text in the recipient's language (account-lock email, guest verification code,
privacy-request acknowledgement, generic push text)."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.i18n import t
from app.models import DataRightsRequest, User
from app.modules.auth import service as auth_service
from app.modules.guests import service as guest_service
from app.modules.messaging import push
from tests.factories import DEFAULT_PASSWORD, create_user
from tests.modules.test_i18n import enable

API = "/api/v1"
MOBILE = {"X-Client-Type": "mobile"}


async def test_account_lock_email_in_owner_language(client, db, run_jobs, email_outbox, monkeypatch) -> None:
    await enable(db, "fr")
    monkeypatch.setattr(settings, "TRUST_CLOUDFRONT_VIEWER_ADDRESS", True)
    user = await create_user(db, role="patient", preferred_language="fr", full_name="Claire")
    email = user.email
    per_ip = auth_service.LOGIN_PAIR_THRESHOLD
    for n in range(auth_service.LOCKOUT_THRESHOLD // per_ip):
        for _ in range(per_ip):
            r = await client.post(
                f"{API}/auth/login",
                json={"email": email, "password": "WrongPassword1"},
                headers={**MOBILE, "CloudFront-Viewer-Address": f"192.0.2.{n + 1}:443"},
            )
            assert r.status_code == 401
    await run_jobs()
    mail = next(m for m in email_outbox if email in m["to"])
    assert mail["subject"] == t("email.account_locked.subject", "fr", app_name=settings.APP_NAME)
    assert 'lang="fr"' in mail["html"]
    assert "paused" not in mail["text"]  # no English left in the body


async def test_guest_code_in_request_language(client, db, run_jobs, email_outbox) -> None:
    await enable(db, "ar")
    r = await client.post(f"{API}/auth/guest", json={}, headers=MOBILE)
    assert r.status_code == 201, r.text
    guest = r.json()
    headers = {**MOBILE, "Authorization": f"Bearer {guest['access_token']}", "Accept-Language": "ar"}
    r = await client.post(
        f"{API}/guest/verify/start",
        json={"channel": "email", "contact": "rana@example.test"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    await run_jobs()
    mail = [m for m in email_outbox if "rana@example.test" in m["to"]][-1]
    assert mail["subject"] == t("email.guest_code.subject", "ar", app_name=settings.APP_NAME)
    assert 'dir="rtl"' in mail["html"]
    assert re.search(r"\d{6}", mail["text"])
    # the language is remembered on the guest account for later messages (free-call confirmation)
    row = (await db.execute(select(User).where(User.id == guest["user"]["id"]))).scalar_one()
    assert row.preferred_language == "ar"
    # SMS text from the catalog too
    r = await client.post(
        f"{API}/guest/verify/start", json={"channel": "phone", "contact": "+971 50 123 4567"}, headers=headers
    )
    assert r.status_code == 201, r.text
    sms = guest_service.sms_outbox[-1]
    code = re.search(r"\d{6}", sms["text"]).group(0)  # type: ignore[union-attr]
    assert sms["text"] == t("email.guest_code.sms", "ar", app_name=settings.APP_NAME, code=code, minutes=10)


async def test_privacy_request_acknowledged_in_request_language(client, db, run_jobs, email_outbox) -> None:
    await enable(db, "ru")
    r = await client.post(
        f"{API}/privacy/requests",
        json={
            "kind": "access",
            "details": "Please send me a copy of my data.",
            "requester_name": "Ivan",
            "requester_email": "ivan@example.test",
        },
        headers={"Accept-Language": "ru"},
    )
    assert r.status_code in (200, 201), r.text
    row = (await db.execute(select(DataRightsRequest))).scalars().all()[-1]
    assert row.requester_language == "ru"
    await run_jobs()
    mail = next(m for m in email_outbox if "ivan@example.test" in m["to"])
    assert mail["subject"] == t("email.privacy_request.received_subject", "ru", reference=row.reference)


def test_push_text_is_generic_and_localised() -> None:
    assert push.push_body_for("message.created") == "You have a new message."
    assert push.push_body_for("message.created", "fr") == t("push.message", "fr")
    assert push.push_key_for("installment.overdue") == "push.payment"
    assert push.push_title("en") == settings.APP_NAME


async def test_hospital_invite_uses_chosen_language(
    client: Any, db: Any, auth_headers: Any, run_jobs: Any, email_outbox: Any
) -> None:
    await enable(db, "bn")
    from tests.factories import create_hospital

    owner = await create_user(db, role="hospital", password=DEFAULT_PASSWORD)
    await create_hospital(db, owner=owner)
    r = await client.post(
        f"{API}/hospital-portal/members",
        json={
            "email": "new.nurse@example.com",
            "full_name": "Nurse Rahima",
            "member_role": "coordinator",
            "language": "bn",
        },
        headers=auth_headers(owner),
    )
    assert r.status_code in (200, 201), r.text
    await run_jobs()
    mail = next(m for m in email_outbox if "new.nurse@example.com" in m["to"])
    assert 'lang="bn"' in mail["html"]
    invited = (await db.execute(select(User).where(User.email == "new.nurse@example.com"))).scalar_one()
    assert invited.preferred_language == "bn"


async def test_organisation_suspended_error_is_translated(client, db, make_user, auth_headers) -> None:
    """The 403 ``organisation_suspended`` carries a translated ``message`` (+ ``message_en``) and
    ``details.organisation`` so clients can explain it."""
    from tests.factories import create_agent

    await enable(db, "fr")
    admin = await make_user(role="admin")
    agent = await create_agent(db)
    agent_user = await db.get(User, agent.user_id)
    assert agent_user is not None
    agent_user.preferred_language = "fr"
    await db.commit()
    r = await client.post(f"{API}/admin/agents/{agent.id}/suspend", json={}, headers=auth_headers(admin))
    assert r.status_code == 200
    r = await client.get(f"{API}/cases", headers=auth_headers(agent_user))
    err = r.json()["error"]
    assert r.status_code == 403 and err["code"] == "organisation_suspended"
    assert err["message"] == t("errors.organisation_suspended", "fr")
    assert err["message_en"].startswith("Your agency account is suspended")
    assert err["details"] == {"organisation": "agency"}
