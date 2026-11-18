"""Patient referral programme: codes, sign-up attribution, anti-abuse, rewards, credit at checkout, refunds,
staff void, expiry, privacy."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BookingStatus, PaymentGateway, RefundStatus
from app.core.events import publish
from app.core.referral_settings import REFERRAL_DEFAULTS, validate_referral_programme
from app.core.settings_store import set_setting
from app.models import Booking, Notification, PatientProfile, Payment, PaymentOrder, Refund, User
from app.models.referrals import (
    PatientCredit,
    PatientCreditKind,
    PatientCreditMovement,
    PatientCreditStatus,
    Referral,
    ReferralStatus,
)
from app.modules.ledger.service import REFERRAL_CREDIT, gateway_receivable, get_balance
from app.modules.payments import service as payments
from app.modules.referrals import service as referrals
from tests.factories import (
    create_booking,
    create_case,
    create_fx_rates,
    create_hospital,
    create_patient,
    create_user,
)
from tests.modules.auth_helpers import API, MOBILE, register_payload

pytestmark = pytest.mark.asyncio


async def _referrer(db: AsyncSession, **user_fields: Any) -> tuple[User, PatientProfile]:
    await create_fx_rates(db)
    user = await create_user(db, role="patient", **user_fields)
    profile = await create_patient(db, user=user, phone="+44 7700 900111", preferred_currency="USD")
    await db.commit()
    return user, profile


async def _code(
    client: httpx.AsyncClient, headers: dict[str, str], device: str | None = None
) -> dict[str, Any]:
    extra = {"X-Device-Id": device} if device else {}
    r = await client.get(f"{API}/patient/referral", headers={**headers, **extra})
    assert r.status_code == 200, r.text
    return r.json()


async def _register(client: httpx.AsyncClient, code: str, **overrides: Any) -> httpx.Response:
    payload = register_payload("patient", referral_code=code, phone="+91 98450 12345", **overrides)
    return await client.post(
        f"{API}/auth/register", json=payload, headers={**MOBILE, "X-Client-App": "mobile"}
    )


async def _referred_profile(db: AsyncSession, email: str) -> PatientProfile:
    return (
        await db.execute(
            select(PatientProfile).join(User, User.id == PatientProfile.user_id).where(User.email == email)
        )
    ).scalar_one()


async def _complete_booking(db: AsyncSession, patient: PatientProfile, **fields: Any) -> Booking:
    hospital_user = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    case = await create_case(db, patient, hospital, status="completed")
    booking = await create_booking(db, case, status=BookingStatus.COMPLETED, **fields)
    booking.completed_at = datetime.now(UTC)
    await publish(db, "booking.completed", {"booking_id": str(booking.id)})
    await db.commit()
    return booking


async def test_code_signup_reward_and_ledger(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user, profile = await _referrer(db)
    overview = await _code(client, auth_headers(user), device="device-of-referrer")
    code = overview["code"]
    assert overview["enabled"] is True
    assert referrals.normalize_code(code) == code
    assert overview["share_url"].endswith(f"?ref={code}")
    assert overview["app_url"] == f"healindia://register?ref={code}"
    assert overview["rewards"]["referrer"] == {"amount_minor": 5000, "currency": "USD"}
    # stable code
    assert (await _code(client, auth_headers(user)))["code"] == code

    r = await _register(client, code.lower(), device_id="device-of-friend", email="friend.one@example.test")
    assert r.status_code == 201, r.text
    friend = await _referred_profile(db, "friend.one@example.test")
    referral = (await db.execute(select(Referral))).scalar_one()
    assert referral.referred_patient_id == friend.id
    assert referral.status == ReferralStatus.PENDING
    assert referral.channel.value == "mobile"
    signed_up = (
        await db.execute(
            select(Notification).where(
                Notification.user_id == user.id, Notification.kind == "referral.signed_up"
            )
        )
    ).scalar_one()
    assert signed_up.title == "A friend joined with your code"

    # first completed booking qualifies the referral and issues both credits
    await _complete_booking(db, friend)
    await db.refresh(referral)
    assert referral.status == ReferralStatus.REWARDED
    credits = (await db.execute(select(PatientCredit).order_by(PatientCredit.kind))).scalars().all()
    kinds = {c.kind: c for c in credits}
    assert set(kinds) == {PatientCreditKind.REFERRER_REWARD, PatientCreditKind.REFEREE_REWARD}
    assert kinds[PatientCreditKind.REFERRER_REWARD].patient_id == profile.id
    assert kinds[PatientCreditKind.REFERRER_REWARD].original_amount_minor == 5000
    assert kinds[PatientCreditKind.REFEREE_REWARD].original_amount_minor == 2500
    assert await get_balance(db, REFERRAL_CREDIT) == sum(c.amount_minor for c in credits)

    # a second completed booking does nothing more
    await _complete_booking(db, friend)
    assert (await db.execute(select(func.count()).select_from(PatientCredit))).scalar_one() == 2

    overview = await _code(client, auth_headers(user))
    assert overview["counts"]["rewarded"] == 1
    item = overview["referrals"][0]
    assert item["status"] == "rewarded"
    assert item["reward"] == {"amount_minor": 5000, "currency": "USD"}
    assert overview["credit"]["base_amount_minor"] == kinds[PatientCreditKind.REFERRER_REWARD].amount_minor
    assert overview["credit"]["currency"] == "USD"


async def _register_and_get(
    client: httpx.AsyncClient, db: AsyncSession, code: str, **kw: Any
) -> PatientProfile:
    payload = register_payload("patient", referral_code=code, **kw)
    r = await client.post(f"{API}/auth/register", json=payload, headers=MOBILE)
    assert r.status_code == 201, r.text
    return await _referred_profile(db, payload["email"])


async def test_self_referral_checks(client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any) -> None:
    user, _ = await _referrer(db, email="jane.doe@gmail.com")
    code = (await _code(client, auth_headers(user), device="shared-device"))["code"]

    await _register_and_get(client, db, code, email="j.a.n.e.doe+2@gmail.com", phone="+1 202 555 0999")
    await _register_and_get(client, db, code, phone="+44 7700 900111")
    await _register_and_get(client, db, code, phone="+1 202 555 0888", device_id="shared-device")
    reasons = sorted(r.void_reason for r in (await db.execute(select(Referral))).scalars().all())
    assert reasons == ["same_device", "same_email", "same_phone"]
    assert all(r.status == ReferralStatus.VOID for r in (await db.execute(select(Referral))).scalars().all())


async def test_invalid_and_agent_codes(client: httpx.AsyncClient, db: AsyncSession) -> None:
    r = await client.post(
        f"{API}/auth/register", json=register_payload("patient", referral_code="R2222222222"), headers=MOBILE
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_referral_code"
    r = await client.get(f"{API}/referrals/check", params={"code": "R2222222222"})
    assert r.json() == {"valid": False, "kind": None, "referee_reward": None}


async def test_public_check_and_programme_off(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user, _ = await _referrer(db)
    code = (await _code(client, auth_headers(user)))["code"]
    r = await client.get(f"{API}/referrals/check", params={"code": code})
    assert r.json() == {
        "valid": True,
        "kind": "patient",
        "referee_reward": {"amount_minor": 2500, "currency": "USD"},
    }
    await set_setting(db, "referral_programme", {**REFERRAL_DEFAULTS, "enabled": False}, actor=None)
    await db.commit()
    from app.core.settings_store import clear_settings_cache

    clear_settings_cache()
    assert (await _code(client, auth_headers(user)))["enabled"] is False
    await _register_and_get(client, db, code, phone="+1 202 555 0777")
    assert (await db.execute(select(func.count()).select_from(Referral))).scalar_one() == 0


async def test_annual_cap_skips_referrer_reward(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user, profile = await _referrer(db)
    code = (await _code(client, auth_headers(user)))["code"]
    await set_setting(db, "referral_programme", {**REFERRAL_DEFAULTS, "max_rewards_per_year": 1}, actor=None)
    await db.commit()
    from app.core.settings_store import clear_settings_cache

    clear_settings_cache()
    a = await _register_and_get(client, db, code, phone="+1 202 555 0701")
    b = await _register_and_get(client, db, code, phone="+1 202 555 0702")
    await _complete_booking(db, a)
    await _complete_booking(db, b)
    rows = {r.referred_patient_id: r for r in (await db.execute(select(Referral))).scalars().all()}
    assert rows[a.id].status == ReferralStatus.REWARDED
    assert rows[b.id].status == ReferralStatus.REWARDED  # the new patient still gets their credit
    assert rows[b.id].checks.get("referrer_reward_skipped") == "annual_cap"
    referrer_rewards = (
        await db.execute(
            select(func.count())
            .select_from(PatientCredit)
            .where(
                PatientCredit.patient_id == profile.id,
                PatientCredit.kind == PatientCreditKind.REFERRER_REWARD,
            )
        )
    ).scalar_one()
    assert referrer_rewards == 1


async def test_same_payment_method_voids_at_qualification(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    from tests.modules.cases_helpers import capture_payment

    user, profile = await _referrer(db)
    code = (await _code(client, auth_headers(user)))["code"]
    friend = await _register_and_get(client, db, code, phone="+1 202 555 0703")
    hospital = await create_hospital(db, owner=await create_user(db, role="hospital"))
    for patient in (profile, friend):
        case = await create_case(db, patient, hospital, status="accepted")
        booking = await create_booking(db, case)
        payment = await capture_payment(db, booking, 1000_00)
        payment.raw = {"card": {"fingerprint": "fp-shared"}}
        await db.commit()
    await _complete_booking(db, friend)
    referral = (await db.execute(select(Referral))).scalar_one()
    assert referral.status == ReferralStatus.VOID
    assert referral.void_reason == "same_payment_method"
    assert (await db.execute(select(func.count()).select_from(PatientCredit))).scalar_one() == 0


async def _rewarded_friend(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> tuple[User, PatientProfile, User, PatientProfile]:
    user, profile = await _referrer(db)
    code = (await _code(client, auth_headers(user)))["code"]
    friend = await _register_and_get(client, db, code, phone="+1 202 555 0704")
    await _complete_booking(db, friend)
    friend_user = await db.get(User, friend.user_id)
    assert friend_user is not None
    return user, profile, friend_user, friend


async def test_apply_credit_to_booking_and_refund_reinstates(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    _, _, friend_user, friend = await _rewarded_friend(client, db, auth_headers)
    credit = (
        await db.execute(select(PatientCredit).where(PatientCredit.patient_id == friend.id))
    ).scalar_one()
    hospital = await create_hospital(db, owner=await create_user(db, role="hospital"))
    case = await create_case(db, friend, hospital, status="accepted")
    booking = await create_booking(db, case)
    await db.commit()
    headers = auth_headers(friend_user)

    r = await client.get(
        f"{API}/patient/credits/preview",
        params={"booking_id": str(booking.id), "purpose": "booking_deposit"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["applicable"] is True
    assert preview["apply_minor"] == credit.amount_minor  # INR booking: 1:1
    assert preview["remaining_due_minor"] == booking.deposit_minor - credit.amount_minor

    r = await client.post(
        f"{API}/patient/credits/apply",
        json={"booking_id": str(booking.id), "purpose": "booking_deposit"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["applied_minor"] == credit.amount_minor
    assert out["credit"]["base_amount_minor"] == 0
    await db.refresh(booking)
    assert booking.amount_paid_minor == credit.amount_minor
    assert booking.status == BookingStatus.PENDING_PAYMENT  # deposit not yet covered
    await db.refresh(credit)
    assert credit.status == PatientCreditStatus.USED and credit.remaining_minor == 0
    payment = (await db.execute(select(Payment).where(Payment.id == out["payment_id"]))).scalar_one()
    assert payment.gateway == PaymentGateway.PLATFORM_CREDIT
    # the credit settles the receivable: nothing for the T+2 sweep to move
    assert await get_balance(db, gateway_receivable("platform_credit")) == 0
    referrer_credit = await get_balance(db, REFERRAL_CREDIT)

    # nothing left to apply
    r = await client.post(
        f"{API}/patient/credits/apply",
        json={"booking_id": str(booking.id), "purpose": "booking_deposit"},
        headers=headers,
    )
    assert r.status_code == 400
    assert r.json()["error"]["details"]["reason"] == "no_credit"
    # the public checkout never offers the internal gateway
    r = await client.post(
        f"{API}/payments/orders",
        json={"booking_id": str(booking.id), "purpose": "booking_balance", "gateway": "platform_credit"},
        headers=headers,
    )
    assert r.status_code == 400

    # refund of the credit payment comes back as credit, never cash
    order = await db.get(PaymentOrder, payment.order_id)
    assert order is not None
    refund = Refund(
        payment_id=payment.id,
        order_id=order.id,
        booking_id=booking.id,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        base_amount_minor=payment.base_amount_minor,
        reason="test",
        status=RefundStatus.APPROVED,
    )
    db.add(refund)
    await db.commit()
    await payments.process_refund(db, refund.id)
    await db.commit()
    reinstated = (
        await db.execute(select(PatientCredit).where(PatientCredit.kind == PatientCreditKind.REINSTATED))
    ).scalar_one()
    assert reinstated.patient_id == friend.id
    assert reinstated.amount_minor == payment.base_amount_minor
    assert await get_balance(db, REFERRAL_CREDIT) == referrer_credit + payment.base_amount_minor
    assert await get_balance(db, gateway_receivable("platform_credit")) == 0

    r = await client.get(f"{API}/patient/credits", headers=headers)
    kinds = [m["kind"] for m in r.json()["movements"]]
    assert {"grant", "redeem", "reinstate"} <= set(kinds)


async def test_staff_void_list_summary_and_expiry(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    _, profile, _, friend = await _rewarded_friend(client, db, auth_headers)
    referral = (await db.execute(select(Referral))).scalar_one()
    admin = await create_user(db, role="admin")
    support = await create_user(db, role="support")
    await db.commit()

    r = await client.get(f"{API}/admin/referrals", headers=auth_headers(support))
    assert r.status_code == 200 and r.json()["total"] == 1
    assert len(r.json()["items"][0]["credits"]) == 2
    r = await client.get(f"{API}/admin/referrals/summary", headers=auth_headers(support))
    summary = r.json()
    assert summary["by_status"]["rewarded"] == 1
    assert (
        summary["outstanding_minor"] == summary["ledger_liability_minor"] == summary["credits_issued_minor"]
    )
    r = await client.get(f"{API}/admin/referrals/settings", headers=auth_headers(support))
    assert r.json()["value"]["fallback_currency"] == "USD"

    r = await client.post(
        f"{API}/admin/referrals/{referral.id}/void", json={"reason": "fraud"}, headers=auth_headers(support)
    )
    assert r.status_code == 403
    r = await client.post(
        f"{API}/admin/referrals/{referral.id}/void",
        json={"reason": "duplicate person"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "void"
    assert all(c["status"] == "void" and c["remaining_minor"] == 0 for c in r.json()["credits"])
    assert await get_balance(db, REFERRAL_CREDIT) == 0
    r = await client.post(
        f"{API}/admin/referrals/{referral.id}/void", json={"reason": "again"}, headers=auth_headers(admin)
    )
    assert r.status_code == 409

    # expiry job: a fresh credit past its date is released
    credit = await referrals.grant_credit(
        db,
        patient_id=profile.id,
        kind=PatientCreditKind.REFERRER_REWARD,
        amount_minor=1000_00,
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    await db.commit()
    assert await referrals.expire_credits(db) == 1
    await db.commit()
    await db.refresh(credit)
    assert credit.status == PatientCreditStatus.EXPIRED
    assert await get_balance(db, REFERRAL_CREDIT) == 0
    moves = (
        await db.execute(
            select(PatientCreditMovement.kind).where(PatientCreditMovement.credit_id == credit.id)
        )
    ).scalars()
    assert sorted(m.value for m in moves) == ["expire", "grant"]
    assert friend.id  # referenced


async def test_pending_referral_expires(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    user, _ = await _referrer(db)
    code = (await _code(client, auth_headers(user)))["code"]
    friend = await _register_and_get(client, db, code, phone="+1 202 555 0705")
    referral = (await db.execute(select(Referral))).scalar_one()
    referral.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    assert await referrals.expire_pending_referrals(db) == 1
    await db.commit()
    await _complete_booking(db, friend)
    await db.refresh(referral)
    assert referral.status == ReferralStatus.VOID and referral.void_reason == "expired"


async def test_privacy_export_and_erasure(
    client: httpx.AsyncClient, db: AsyncSession, auth_headers: Any
) -> None:
    from app.modules.privacy.erasure import erase_personal_data
    from app.modules.privacy.export import collect

    _, _, friend_user, friend = await _rewarded_friend(client, db, auth_headers)
    data, _ = await collect(db, friend_user)
    assert data["referral_programme"]["referrals"][0]["referred_patient_id"] == str(friend.id)
    assert len(data["referral_programme"]["credits"]) == 1
    await erase_personal_data(db, friend_user, friend)
    await db.commit()
    credit = (
        await db.execute(select(PatientCredit).where(PatientCredit.patient_id == friend.id))
    ).scalar_one()
    assert credit.status == PatientCreditStatus.VOID


def test_setting_validation() -> None:
    from app.core.errors import BadRequest

    assert validate_referral_programme(REFERRAL_DEFAULTS)["fallback_currency"] == "USD"
    for bad in (
        {**REFERRAL_DEFAULTS, "surprise": 1},
        {**REFERRAL_DEFAULTS, "referrer_reward": {"EUR": 100}},
        {**REFERRAL_DEFAULTS, "max_rewards_per_year": -1},
        {**REFERRAL_DEFAULTS, "referee_reward": {"USD": "10"}},
    ):
        with pytest.raises(BadRequest):
            validate_referral_programme(bad)
