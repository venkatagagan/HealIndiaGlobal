"""Patient referral programme (docs/REFERRALS.md).

Flow
1. Every patient has a personal code (``referral_codes``; created on first use of ``GET /patient/referral``).
2. A new patient signs up with ``referral_code`` (website ``/{lang}?ref=CODE``, patient web ``/register?ref=``,
   app deep link ``<scheme>://register?ref=``): :func:`record_signup_referral` stores a ``pending`` referral, or a
   ``void`` one when the anti-abuse checks match (same email, phone or device as the referrer).
3. ``booking.completed`` of the referred patient's FIRST booking: :func:`on_booking_completed` re-checks (payment
   fingerprints, expiry), marks it ``qualified`` and issues the credits the ``referral_programme`` setting allows
   (referrer, subject to the yearly cap, and/or the new patient) -> ``rewarded``.
4. Staff can void a referral (unused credit from it is voided too). Pending referrals that never qualify are
   voided by the daily job after ``qualify_within_days``; unused credit expires after ``credit_validity_days``.

Credits are INR minor units (the ledger base currency). Ledger: issue = Dr ``EXPENSE:REFERRAL_REWARDS`` / Cr
``PLATFORM:REFERRAL_CREDIT``; expiry and void reverse it. Spending credit is a booking payment through the
internal ``platform_credit`` gateway (``app.modules.referrals.credits``).
"""

from __future__ import annotations

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.crypto import keyed_fingerprint
from app.core.enums import BookingStatus, LedgerTxnType, PaymentStatus, UserStatus
from app.core.errors import Conflict, NotFound
from app.core.money import BASE_CURRENCY, CurrencyError, convert, format_minor, normalize_currency
from app.core.referral_settings import REFERRAL_DEFAULTS, REFERRAL_SETTING_KEY, validate_referral_programme
from app.core.settings_store import get_setting
from app.models import Booking, PatientProfile, Payment, PaymentOrder, User
from app.models.referrals import (
    CreditMovementKind,
    PatientCredit,
    PatientCreditKind,
    PatientCreditMovement,
    PatientCreditStatus,
    Referral,
    ReferralChannel,
    ReferralCode,
    ReferralStatus,
)
from app.modules.ledger.service import REFERRAL_CREDIT, REFERRAL_REWARDS_EXPENSE, post_transaction
from app.modules.messaging.notifications import notify

logger = structlog.get_logger(__name__)

CODE_PREFIX = "R"
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O/1/I: easy to read aloud
CODE_BODY_LENGTH = 9  # 32**9 ~ 3.5e13 codes: not guessable
CODE_RE = re.compile(rf"^{CODE_PREFIX}[{CODE_ALPHABET}]{{{CODE_BODY_LENGTH}}}$")
MAX_DEVICE_HASHES = 10
REWARD_WINDOW = timedelta(days=365)
_PAYMENT_FINGERPRINT_KEYS = frozenset({"fingerprint", "card_fingerprint", "card_id", "vpa", "token_id"})


def _now() -> datetime:
    return datetime.now(UTC)


def _v(value: Any) -> str:
    return str(getattr(value, "value", value))


# ------------------------------------------------------------------------------------------------ settings
@dataclass(frozen=True, slots=True)
class Programme:
    enabled: bool
    reward_referrer: bool
    reward_referee: bool
    referrer_reward: dict[str, int]
    referee_reward: dict[str, int]
    fallback_currency: str
    max_rewards_per_year: int
    credit_validity_days: int
    qualify_within_days: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "reward_referrer": self.reward_referrer,
            "reward_referee": self.reward_referee,
            "referrer_reward": dict(self.referrer_reward),
            "referee_reward": dict(self.referee_reward),
            "fallback_currency": self.fallback_currency,
            "max_rewards_per_year": self.max_rewards_per_year,
            "credit_validity_days": self.credit_validity_days,
            "qualify_within_days": self.qualify_within_days,
        }


async def programme(db: AsyncSession) -> Programme:
    """Effective programme settings; ``enabled`` also needs the ``REFERRAL_ENABLED`` env switch."""
    raw = await get_setting(db, REFERRAL_SETTING_KEY, REFERRAL_DEFAULTS)
    try:
        value = validate_referral_programme(raw)
    except Exception:  # a broken stored value must never break sign-up or bookings
        logger.error("referrals.invalid_setting")
        value = validate_referral_programme(REFERRAL_DEFAULTS)
    return Programme(
        enabled=bool(settings.REFERRAL_ENABLED and value["enabled"]),
        reward_referrer=value["reward_referrer"],
        reward_referee=value["reward_referee"],
        referrer_reward=value["referrer_reward"],
        referee_reward=value["referee_reward"],
        fallback_currency=value["fallback_currency"],
        max_rewards_per_year=value["max_rewards_per_year"],
        credit_validity_days=value["credit_validity_days"],
        qualify_within_days=value["qualify_within_days"],
    )


async def reward_amount(
    db: AsyncSession, amounts: dict[str, int], fallback: str, currency: str | None
) -> tuple[int, str, int]:
    """``(amount, currency, inr_amount)`` of a reward for a patient whose preferred currency is ``currency``."""
    ccy = (currency or "").upper()
    if ccy not in amounts:
        ccy = fallback
    amount = int(amounts.get(ccy, 0))
    if amount <= 0:
        return 0, ccy, 0
    try:
        inr, _ = await convert(db, amount, ccy, BASE_CURRENCY)
    except CurrencyError:
        logger.warning("referrals.no_fx_rate", currency=ccy)
        return 0, ccy, 0
    return amount, ccy, int(inr)


async def display_amount(db: AsyncSession, inr_minor: int, currency: str | None) -> tuple[int, str]:
    """INR minor units shown in the patient's currency (falls back to INR)."""
    try:
        ccy = normalize_currency(currency or BASE_CURRENCY)
        amount, _ = await convert(db, int(inr_minor), BASE_CURRENCY, ccy)
        return int(amount), ccy
    except CurrencyError:
        return int(inr_minor), BASE_CURRENCY


# ------------------------------------------------------------------------------------------------- codes
def normalize_code(code: str | None) -> str | None:
    value = "".join((code or "").split()).upper()
    return value if CODE_RE.match(value) else None


def is_patient_code(code: str | None) -> bool:
    return normalize_code(code) is not None


def _new_code() -> str:
    return CODE_PREFIX + "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_BODY_LENGTH))


def device_hash(device_id: str | None) -> str | None:
    value = (device_id or "").strip()
    if not value or len(value) > 200:
        return None
    return keyed_fingerprint(value, "referral-device")


async def get_or_create_code(db: AsyncSession, profile: PatientProfile) -> ReferralCode:
    """The patient's code (created on first use). Flushes, does not commit."""
    row = (
        await db.execute(select(ReferralCode).where(ReferralCode.patient_id == profile.id))
    ).scalar_one_or_none()
    if row is not None:
        return row
    for _ in range(10):
        candidate = _new_code()
        taken = (await db.execute(select(ReferralCode.id).where(ReferralCode.code == candidate))).first()
        if taken is not None:  # pragma: no cover - 1 in 3.5e13
            continue
        row = ReferralCode(patient_id=profile.id, code=candidate, device_hashes=[])
        try:
            async with db.begin_nested():
                db.add(row)
                await db.flush()
        except IntegrityError:  # a concurrent request created it (or the code collided)
            existing = (
                await db.execute(select(ReferralCode).where(ReferralCode.patient_id == profile.id))
            ).scalar_one_or_none()
            if existing is not None:
                return existing
            continue
        return row
    raise Conflict("Could not allocate a referral code, please retry")  # pragma: no cover


def remember_device(code: ReferralCode, device_id: str | None) -> bool:
    """Store a keyed hash of one of the referrer's own devices (for the self-referral check)."""
    digest = device_hash(device_id)
    if digest is None:
        return False
    hashes = [h for h in (code.device_hashes or []) if h != digest]
    hashes.append(digest)
    code.device_hashes = hashes[-MAX_DEVICE_HASHES:]
    return True


async def lookup_code(db: AsyncSession, code: str | None) -> ReferralCode | None:
    normalized = normalize_code(code)
    if normalized is None:
        return None
    return (
        await db.execute(
            select(ReferralCode).where(ReferralCode.code == normalized, ReferralCode.disabled_at.is_(None))
        )
    ).scalar_one_or_none()


def share_links(code: str) -> dict[str, str]:
    site = settings.PUBLIC_SITE_URL.rstrip("/")
    return {
        "share_url": f"{site}/?ref={code}",
        "patient_web_url": f"{settings.PATIENT_WEB_URL.rstrip('/')}/register?ref={code}",
        "app_url": f"{settings.MOBILE_APP_SCHEME}://register?ref={code}",
    }


# ------------------------------------------------------------------------------------------- anti-abuse
def normalize_email(email: str | None) -> str | None:
    """Lower-case, ``+tag`` removed; Gmail dots removed (``j.o.e+x@gmail.com`` == ``joe@gmail.com``)."""
    if not email or "@" not in email:
        return None
    local, _, domain = email.strip().lower().rpartition("@")
    local = local.split("+", 1)[0]
    if domain in ("gmail.com", "googlemail.com"):
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}" if local else None


def phone_key(phone: str | None) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 7 else None


def _phones(user: User | None, profile: PatientProfile | None) -> set[str]:
    values = [
        getattr(user, "phone", None),
        getattr(profile, "phone", None),
        getattr(profile, "whatsapp", None),
    ]
    return {k for k in (phone_key(v) for v in values) if k}


def self_referral_reason(
    *,
    referrer_user: User,
    referrer_profile: PatientProfile,
    referrer_code: ReferralCode,
    new_user: User,
    new_profile: PatientProfile,
    new_device_hash: str | None,
) -> str | None:
    if referrer_user.id == new_user.id or referrer_profile.id == new_profile.id:
        return "self_referral"
    a, b = normalize_email(referrer_user.email), normalize_email(new_user.email)
    if a and b and a == b:
        return "same_email"
    if _phones(referrer_user, referrer_profile) & _phones(new_user, new_profile):
        return "same_phone"
    if new_device_hash and new_device_hash in (referrer_code.device_hashes or []):
        return "same_device"
    return None


def _collect_fingerprints(value: Any, out: set[str], depth: int = 0) -> None:
    if depth > 6:
        return
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in _PAYMENT_FINGERPRINT_KEYS and isinstance(child, str | int) and str(child):
                out.add(f"{str(key).lower()}:{child}")
            else:
                _collect_fingerprints(child, out, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _collect_fingerprints(child, out, depth + 1)


async def payment_fingerprints(db: AsyncSession, patient_id: uuid.UUID) -> set[str]:
    """Card fingerprints / UPI handles seen in a patient's captured gateway payments (raw gateway data)."""
    rows = (
        await db.execute(
            select(Payment.raw)
            .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
            .where(
                PaymentOrder.patient_id == patient_id,
                Payment.status.in_(
                    [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED]
                ),
            )
        )
    ).scalars()
    found: set[str] = set()
    for raw in rows:
        _collect_fingerprints(raw or {}, found)
    return found


# ------------------------------------------------------------------------------------------------ sign-up
def channel_for(value: str | None) -> ReferralChannel:
    try:
        return ReferralChannel(str(value or "other"))
    except ValueError:
        return ReferralChannel.OTHER


def _first_name_initial(profile: PatientProfile | None, user: User | None) -> str:
    first = (getattr(profile, "first_name", "") or "").strip()
    last = (getattr(profile, "last_name", "") or "").strip()
    if not first and user is not None:
        parts = (user.full_name or "").split()
        first, last = (parts[0], parts[-1] if len(parts) > 1 else "") if parts else ("", "")
    if not first:
        return "-"
    return f"{first} {last[:1]}." if last else first


async def record_signup_referral(
    db: AsyncSession,
    new_user: User,
    referral_code: str | None,
    *,
    device_id: str | None = None,
    channel: str | None = None,
    request: Request | None = None,
) -> Referral | None:
    """Attach a new patient to the referrer whose code they used. Never raises for business reasons (sign-up
    must not fail because of a referral); returns the referral row (``void`` when a self-referral check
    matched) or ``None`` when nothing was recorded. Flushes, does not commit."""
    code_row = await lookup_code(db, referral_code)
    if code_row is None:
        return None
    prog = await programme(db)
    if not prog.enabled:
        logger.info("referrals.signup_programme_off")
        return None
    new_profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == new_user.id))
    ).scalar_one_or_none()
    referrer_profile = await db.get(PatientProfile, code_row.patient_id)
    if new_profile is None or referrer_profile is None:
        return None
    referrer_user = await db.get(User, referrer_profile.user_id)
    if referrer_user is None or referrer_user.deleted_at is not None:
        return None
    if referrer_user.status != UserStatus.ACTIVE:
        logger.info("referrals.signup_referrer_inactive", referrer_patient_id=str(referrer_profile.id))
        return None
    existing = (
        await db.execute(select(Referral.id).where(Referral.referred_patient_id == new_profile.id))
    ).first()
    if existing is not None:
        return None
    signup_device = device_hash(device_id)
    now = _now()
    reason = self_referral_reason(
        referrer_user=referrer_user,
        referrer_profile=referrer_profile,
        referrer_code=code_row,
        new_user=new_user,
        new_profile=new_profile,
        new_device_hash=signup_device,
    )
    if reason == "self_referral":
        return None
    referral = Referral(
        referrer_patient_id=referrer_profile.id,
        referred_patient_id=new_profile.id,
        code=code_row.code,
        status=ReferralStatus.VOID if reason else ReferralStatus.PENDING,
        channel=channel_for(channel),
        signup_device_hash=signup_device,
        expires_at=now + timedelta(days=prog.qualify_within_days),
        voided_at=now if reason else None,
        void_reason=reason,
        checks={"signup": reason or "ok"},
    )
    try:
        async with db.begin_nested():
            db.add(referral)
            await db.flush()
    except IntegrityError:
        return None
    await audit_log(
        db,
        actor=new_user,
        action="referral.signup",
        entity_type="referral",
        entity_id=referral.id,
        after={
            "referrer_patient_id": str(referrer_profile.id),
            "referred_patient_id": str(new_profile.id),
            "status": _v(referral.status),
            "void_reason": reason,
            "channel": _v(referral.channel),
        },
        request=request,
    )
    if reason is None:
        await notify(
            db,
            referrer_user.id,
            "referral.signed_up",
            title_key="referral.notifications.signed_up.title",
            body_key="referral.notifications.signed_up.body",
            params={"name": _first_name_initial(new_profile, new_user)},
            data={"referral_id": str(referral.id), "link": "/referrals"},
            dedupe_key=f"referral.signed_up:{referral.id}",
            email=False,
        )
    return referral


# ------------------------------------------------------------------------------------------------ credits
async def grant_credit(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    kind: PatientCreditKind,
    amount_minor: int,
    expires_at: datetime | None,
    referral_id: uuid.UUID | None = None,
    original_amount_minor: int | None = None,
    original_currency: str | None = None,
    source_refund_id: uuid.UUID | None = None,
    note: str | None = None,
    post_expense: bool = True,
) -> PatientCredit:
    """Issue credit (INR minor units). ``post_expense`` posts Dr referral expense / Cr credit liability (the
    reinstatement after a refund posts its own entries). Flushes, does not commit."""
    credit = PatientCredit(
        patient_id=patient_id,
        referral_id=referral_id,
        kind=kind,
        status=PatientCreditStatus.ACTIVE,
        amount_minor=amount_minor,
        remaining_minor=amount_minor,
        currency=BASE_CURRENCY,
        original_amount_minor=original_amount_minor,
        original_currency=original_currency,
        expires_at=expires_at,
        source_refund_id=source_refund_id,
    )
    db.add(credit)
    await db.flush()
    db.add(
        PatientCreditMovement(
            patient_id=patient_id,
            credit_id=credit.id,
            kind=CreditMovementKind.REINSTATE if kind == PatientCreditKind.REINSTATED else CreditMovementKind.GRANT,
            amount_minor=amount_minor,
            refund_id=source_refund_id,
            note=note,
        )
    )
    if post_expense:
        await post_transaction(
            db,
            txn_type=LedgerTxnType.REFERRAL_CREDIT,
            reference_type="patient_credit",
            reference_id=credit.id,
            idempotency_key=f"referral_credit_grant:{credit.id}",
            description=f"Referral credit issued ({_v(kind)})",
            entries=[(REFERRAL_REWARDS_EXPENSE, "debit", amount_minor), (REFERRAL_CREDIT, "credit", amount_minor)],
        )
    await db.flush()
    return credit


async def release_credit(
    db: AsyncSession, credit: PatientCredit, *, kind: CreditMovementKind, note: str | None = None
) -> int:
    """Expire or void the unused remainder of ``credit`` (reverses the expense). Returns the amount released."""
    remaining = int(credit.remaining_minor)
    credit.status = PatientCreditStatus.EXPIRED if kind == CreditMovementKind.EXPIRE else PatientCreditStatus.VOID
    if remaining <= 0:
        await db.flush()
        return 0
    credit.remaining_minor = 0
    db.add(
        PatientCreditMovement(
            patient_id=credit.patient_id, credit_id=credit.id, kind=kind, amount_minor=remaining, note=note
        )
    )
    await post_transaction(
        db,
        txn_type=LedgerTxnType.REFERRAL_CREDIT,
        reference_type="patient_credit",
        reference_id=credit.id,
        idempotency_key=f"referral_credit_{_v(kind)}:{credit.id}",
        description=f"Unused referral credit {'expired' if kind == CreditMovementKind.EXPIRE else 'voided'}",
        entries=[(REFERRAL_CREDIT, "debit", remaining), (REFERRAL_REWARDS_EXPENSE, "credit", remaining)],
    )
    await db.flush()
    return remaining


async def _referrer_rewards_in_window(db: AsyncSession, referrer_patient_id: uuid.UUID, now: datetime) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(PatientCredit)
                .where(
                    PatientCredit.patient_id == referrer_patient_id,
                    PatientCredit.kind == PatientCreditKind.REFERRER_REWARD,
                    PatientCredit.created_at >= now - REWARD_WINDOW,
                )
            )
        ).scalar_one()
    )


async def _void(referral: Referral, reason: str, now: datetime, by: uuid.UUID | None = None) -> None:
    referral.status = ReferralStatus.VOID
    referral.voided_at = now
    referral.void_reason = reason[:500]
    referral.voided_by = by


async def on_booking_completed(db: AsyncSession, booking_id: uuid.UUID) -> Referral | None:
    """Qualify (and reward) the pending referral of the booking's patient on their first completed booking.
    Idempotent: only a ``pending`` referral is processed. Flushes, does not commit."""
    booking = await db.get(Booking, booking_id)
    if booking is None or _v(booking.status) != BookingStatus.COMPLETED.value:
        return None
    referral = (
        await db.execute(
            select(Referral)
            .where(Referral.referred_patient_id == booking.patient_id, Referral.status == ReferralStatus.PENDING)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if referral is None:
        return None
    now = _now()
    checks = dict(referral.checks or {})
    if referral.expires_at is not None and referral.expires_at < now:
        await _void(referral, "expired", now)
        referral.checks = {**checks, "qualify": "expired"}
        await db.flush()
        return referral
    prog = await programme(db)
    if not prog.enabled:
        return None  # stays pending; qualifies on a later completed booking if the programme is back on
    shared = await payment_fingerprints(db, referral.referred_patient_id) & await payment_fingerprints(
        db, referral.referrer_patient_id
    )
    if shared:
        await _void(referral, "same_payment_method", now)
        referral.checks = {**checks, "qualify": "same_payment_method"}
        await audit_log(
            db,
            actor=None,
            action="referral.void",
            entity_type="referral",
            entity_id=referral.id,
            after={"reason": "same_payment_method"},
        )
        await db.flush()
        return referral

    referral.status = ReferralStatus.QUALIFIED
    referral.qualified_at = now
    referral.qualifying_booking_id = booking.id
    expires = now + timedelta(days=prog.credit_validity_days)
    referrer = await db.get(PatientProfile, referral.referrer_patient_id)
    referred = await db.get(PatientProfile, referral.referred_patient_id)
    issued: dict[str, PatientCredit] = {}

    if prog.reward_referee and referred is not None:
        amount, ccy, inr = await reward_amount(
            db, prog.referee_reward, prog.fallback_currency, referred.preferred_currency
        )
        if inr > 0:
            issued["referee"] = await grant_credit(
                db,
                patient_id=referred.id,
                kind=PatientCreditKind.REFEREE_REWARD,
                amount_minor=inr,
                expires_at=expires,
                referral_id=referral.id,
                original_amount_minor=amount,
                original_currency=ccy,
            )
    if prog.reward_referrer and referrer is not None:
        if await _referrer_rewards_in_window(db, referrer.id, now) >= prog.max_rewards_per_year:
            checks["referrer_reward_skipped"] = "annual_cap"
        else:
            amount, ccy, inr = await reward_amount(
                db, prog.referrer_reward, prog.fallback_currency, referrer.preferred_currency
            )
            if inr > 0:
                issued["referrer"] = await grant_credit(
                    db,
                    patient_id=referrer.id,
                    kind=PatientCreditKind.REFERRER_REWARD,
                    amount_minor=inr,
                    expires_at=expires,
                    referral_id=referral.id,
                    original_amount_minor=amount,
                    original_currency=ccy,
                )
    if issued:
        referral.status = ReferralStatus.REWARDED
        referral.rewarded_at = now
    referral.checks = {**checks, "qualify": "ok", "credits": {k: str(c.id) for k, c in issued.items()}}
    await audit_log(
        db,
        actor=None,
        action="referral.qualified",
        entity_type="referral",
        entity_id=referral.id,
        after={
            "status": _v(referral.status),
            "booking_id": str(booking.id),
            "credits": {k: {"id": str(c.id), "amount_minor": c.amount_minor} for k, c in issued.items()},
            "referrer_reward_skipped": checks.get("referrer_reward_skipped"),
        },
    )
    await db.flush()
    await _notify_rewards(db, referral, referrer, referred, issued)
    return referral


def _credit_text(credit: PatientCredit) -> str:
    if credit.original_amount_minor and credit.original_currency:
        return format_minor(int(credit.original_amount_minor), credit.original_currency)
    return format_minor(int(credit.amount_minor), credit.currency)


async def _notify_rewards(
    db: AsyncSession,
    referral: Referral,
    referrer: PatientProfile | None,
    referred: PatientProfile | None,
    issued: dict[str, PatientCredit],
) -> None:
    if referrer is not None:
        credit = issued.get("referrer")
        await notify(
            db,
            referrer.user_id,
            "referral.rewarded" if credit else "referral.qualified",
            title_key=(
                "referral.notifications.rewarded.title" if credit else "referral.notifications.qualified.title"
            ),
            body_key=(
                "referral.notifications.rewarded.body" if credit else "referral.notifications.qualified.body"
            ),
            params={
                "name": _first_name_initial(referred, None),
                "amount": _credit_text(credit) if credit else "",
            },
            data={"referral_id": str(referral.id), "link": "/referrals"},
            dedupe_key=f"referral.rewarded:{referral.id}",
            email=True,
        )
    if referred is not None and (credit := issued.get("referee")) is not None:
        await notify(
            db,
            referred.user_id,
            "referral.welcome_credit",
            title_key="referral.notifications.welcome_credit.title",
            body_key="referral.notifications.welcome_credit.body",
            params={"amount": _credit_text(credit)},
            data={"referral_id": str(referral.id), "link": "/referrals"},
            dedupe_key=f"referral.welcome_credit:{referral.id}",
            email=True,
        )


# ------------------------------------------------------------------------------------------------- staff
async def void_referral(
    db: AsyncSession, staff: User, referral_id: uuid.UUID, reason: str, request: Request | None = None
) -> Referral:
    """Void a referral; the unused part of any credit it produced is voided too (spent credit is not clawed
    back). Commits."""
    referral = (
        await db.execute(select(Referral).where(Referral.id == referral_id).with_for_update())
    ).scalar_one_or_none()
    if referral is None:
        raise NotFound("Referral not found")
    if referral.status == ReferralStatus.VOID:
        raise Conflict("This referral is already void", code="referral_already_void")
    before = _v(referral.status)
    now = _now()
    await _void(referral, reason.strip() or "voided by staff", now, staff.id)
    credits = (
        (
            await db.execute(
                select(PatientCredit)
                .where(PatientCredit.referral_id == referral.id, PatientCredit.status == PatientCreditStatus.ACTIVE)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    released = 0
    for credit in credits:
        released += await release_credit(db, credit, kind=CreditMovementKind.VOID, note="referral voided")
    await audit_log(
        db,
        actor=staff,
        action="referral.void",
        entity_type="referral",
        entity_id=referral.id,
        before={"status": before},
        after={"status": ReferralStatus.VOID.value, "reason": referral.void_reason, "credit_released_minor": released},
        request=request,
    )
    await db.commit()
    return referral


# -------------------------------------------------------------------------------------------------- jobs
async def expire_credits(db: AsyncSession, now: datetime | None = None, limit: int = 500) -> int:
    now = now or _now()
    credits = (
        (
            await db.execute(
                select(PatientCredit)
                .where(
                    PatientCredit.status == PatientCreditStatus.ACTIVE,
                    PatientCredit.expires_at.is_not(None),
                    PatientCredit.expires_at <= now,
                )
                .order_by(PatientCredit.expires_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    for credit in credits:
        await release_credit(db, credit, kind=CreditMovementKind.EXPIRE, note="expired")
    return len(credits)


async def expire_pending_referrals(db: AsyncSession, now: datetime | None = None, limit: int = 500) -> int:
    now = now or _now()
    rows = (
        (
            await db.execute(
                select(Referral)
                .where(
                    Referral.status == ReferralStatus.PENDING,
                    Referral.expires_at.is_not(None),
                    Referral.expires_at <= now,
                )
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    for referral in rows:
        await _void(referral, "expired", now)
    return len(rows)
