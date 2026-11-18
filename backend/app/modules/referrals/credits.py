"""Platform credit: balance, history and spending it on a booking (docs/REFERRALS.md, "Paying with credit").

Spending credit is a real booking payment through the internal ``platform_credit`` gateway, so the booking,
escrow, revenue recognition, settlements, receipts and refunds all work unchanged:

* :func:`apply_credit` derives what is due exactly like ``POST /payments/orders`` (same locks and open-order
  rules), takes ``min(available credit, due)``, creates a ``platform_credit`` order (purpose
  ``booking_balance``, booking currency) and captures it at once through the single capture path
  (``payment.captured`` -> booking paid amount, ledger capture ``Dr GATEWAY:platform_credit:RECEIVABLE /
  Cr PLATFORM:PATIENT_ESCROW``). The receivable is then settled from the liability
  (``Dr PLATFORM:REFERRAL_CREDIT / Cr GATEWAY:platform_credit:RECEIVABLE``), so the T+2 sweep never moves it.
  Credits are consumed first-expiring-first.
* A refund of such a payment (cancellation, staff refund) goes back to the patient as NEW credit
  (``reinstated``; ``Dr receivable / Cr PLATFORM:REFERRAL_CREDIT``) - credit is never paid out in cash.

Not supported (documented): instalment-plan bookings (the instalment schedule is fixed at booking time) and
consultation fees.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.enums import (
    LedgerTxnType,
    OrderStatus,
    PaymentGateway,
    PaymentOption,
    PaymentPurpose,
    PaymentStatus,
)
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.money import BASE_CURRENCY, FX_QUANT, CurrencyError, convert, get_fx_rate
from app.models import Booking, PatientProfile, Payment, PaymentOrder, Refund, User
from app.models.referrals import (
    CreditMovementKind,
    PatientCredit,
    PatientCreditKind,
    PatientCreditMovement,
    PatientCreditStatus,
)
from app.models.sequences import next_number
from app.modules.ledger.service import REFERRAL_CREDIT, gateway_receivable, post_transaction
from app.modules.payments import service as payments
from app.modules.payments.gateways.base import GatewayPaymentInfo, GatewayPaymentStatus
from app.modules.payments.schemas import OrderCreate
from app.modules.referrals.service import grant_credit, programme

logger = structlog.get_logger(__name__)

CREDIT_PURPOSES = (PaymentPurpose.BOOKING_DEPOSIT, PaymentPurpose.BOOKING_BALANCE, PaymentPurpose.BOOKING_FULL)
GATEWAY = PaymentGateway.PLATFORM_CREDIT
EXPIRING_SOON = timedelta(days=30)


def _now() -> datetime:
    return datetime.now(UTC)


def _usable() -> Any:
    now = _now()
    return (
        PatientCredit.status == PatientCreditStatus.ACTIVE,
        PatientCredit.remaining_minor > 0,
        or_(PatientCredit.expires_at.is_(None), PatientCredit.expires_at > now),
    )


async def available_minor(db: AsyncSession, patient_id: uuid.UUID) -> int:
    """Usable credit (INR minor units)."""
    total = (
        await db.execute(
            select(func.coalesce(func.sum(PatientCredit.remaining_minor), 0)).where(
                PatientCredit.patient_id == patient_id, *_usable()
            )
        )
    ).scalar_one()
    return int(total or 0)


async def expiring_soon(db: AsyncSession, patient_id: uuid.UUID) -> tuple[int, datetime | None]:
    """Credit expiring within 30 days and the earliest expiry among usable credits."""
    now = _now()
    rows = (
        await db.execute(
            select(PatientCredit.remaining_minor, PatientCredit.expires_at).where(
                PatientCredit.patient_id == patient_id, *_usable()
            )
        )
    ).all()
    soon = sum(int(r) for r, exp in rows if exp is not None and exp <= now + EXPIRING_SOON)
    expiries = [exp for _, exp in rows if exp is not None]
    return soon, (min(expiries) if expiries else None)


async def own_profile(db: AsyncSession, user: User) -> PatientProfile:
    profile = (
        await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is None:
        raise NotFound("Patient profile not found", code="patient_not_found")
    return profile


# ------------------------------------------------------------------------------------------------ preview
@dataclass(slots=True)
class CreditQuote:
    booking: Booking
    patient: PatientProfile
    purpose: PaymentPurpose
    due_minor: int  # booking currency
    currency: str
    available_base_minor: int  # INR
    available_minor: int  # booking currency (rounded)
    apply_minor: int  # booking currency
    apply_base_minor: int  # INR
    applicable: bool
    reason: str | None = None


async def _quote(db: AsyncSession, user: User, booking_id: uuid.UUID, purpose: PaymentPurpose) -> CreditQuote:
    if purpose not in CREDIT_PURPOSES:
        raise BadRequest("Credit can only be used for booking payments", code="credit_not_applicable")
    profile = await own_profile(db, user)
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.patient_id != profile.id:
        raise NotFound("Booking not found")
    body = OrderCreate(purpose=purpose, gateway=GATEWAY, booking_id=booking.id)
    derived = await payments.derive_amount(db, user, body)  # locks the booking, validates the purpose
    booking = derived.booking or booking
    currency = booking.currency
    due = max(int(derived.amount_minor), 0)
    available_base = await available_minor(db, profile.id)
    reason: str | None = None
    if not (await programme(db)).enabled and available_base <= 0:
        reason = "programme_off"
    if booking.payment_option == PaymentOption.INSTALLMENTS:
        reason = "installments"
    if due <= 0:
        reason = reason or "nothing_due"
    if available_base <= 0:
        reason = reason or "no_credit"
    try:
        available_ccy = (
            available_base
            if currency == BASE_CURRENCY
            else (await convert(db, available_base, BASE_CURRENCY, currency))[0]
        )
        due_base = due if currency == BASE_CURRENCY else (await convert(db, due, currency, BASE_CURRENCY))[0]
    except CurrencyError as exc:
        raise BadRequest(str(exc), code="unsupported_currency") from exc
    apply_base = min(available_base, int(due_base))
    if apply_base >= int(due_base):
        apply_ccy = due
    else:
        apply_ccy = min(int(available_ccy), due)
    if apply_ccy <= 0 or apply_base <= 0:
        reason = reason or "amount_too_small"
    applicable = reason is None
    return CreditQuote(
        booking=booking,
        patient=profile,
        purpose=purpose,
        due_minor=due,
        currency=currency,
        available_base_minor=available_base,
        available_minor=int(available_ccy),
        apply_minor=apply_ccy if applicable else 0,
        apply_base_minor=apply_base if applicable else 0,
        applicable=applicable,
        reason=reason,
    )


async def preview(
    db: AsyncSession, user: User, booking_id: uuid.UUID, purpose: PaymentPurpose
) -> dict[str, Any]:
    """What :func:`apply_credit` would apply now (nothing is changed)."""
    quote = await _quote(db, user, booking_id, purpose)
    out = {
        "booking_id": quote.booking.id,
        "purpose": quote.purpose,
        "currency": quote.currency,
        "due_minor": quote.due_minor,
        "available_minor": quote.available_minor,
        "available_base_minor": quote.available_base_minor,
        "base_currency": BASE_CURRENCY,
        "apply_minor": quote.apply_minor,
        "remaining_due_minor": max(quote.due_minor - quote.apply_minor, 0),
        "applicable": quote.applicable,
        "reason": quote.reason,
    }
    await db.rollback()  # release the booking row lock taken by derive_amount
    return out


# -------------------------------------------------------------------------------------------------- apply
async def _consume(
    db: AsyncSession, patient_id: uuid.UUID, amount: int, *, payment_id: uuid.UUID, booking_id: uuid.UUID
) -> int:
    """Take ``amount`` INR from the patient's usable credits, first-expiring-first. Returns what was taken."""
    credits = (
        (
            await db.execute(
                select(PatientCredit)
                .where(PatientCredit.patient_id == patient_id, *_usable())
                .order_by(PatientCredit.expires_at.asc().nulls_last(), PatientCredit.created_at, PatientCredit.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    left = amount
    for credit in credits:
        if left <= 0:
            break
        take = min(int(credit.remaining_minor), left)
        if take <= 0:
            continue
        credit.remaining_minor = int(credit.remaining_minor) - take
        if credit.remaining_minor == 0:
            credit.status = PatientCreditStatus.USED
        db.add(
            PatientCreditMovement(
                patient_id=patient_id,
                credit_id=credit.id,
                kind=CreditMovementKind.REDEEM,
                amount_minor=take,
                payment_id=payment_id,
                booking_id=booking_id,
            )
        )
        left -= take
    await db.flush()
    return amount - left


@dataclass(slots=True)
class AppliedCredit:
    order: PaymentOrder
    payment: Payment
    applied_minor: int
    currency: str
    applied_base_minor: int
    remaining_due_minor: int
    available_base_minor: int


async def apply_credit(
    db: AsyncSession,
    user: User,
    booking_id: uuid.UUID,
    purpose: PaymentPurpose,
    request: Request | None = None,
) -> AppliedCredit:
    """Pay as much of ``purpose`` as the patient's credit covers. Only the patient may spend their credit.
    Commits."""
    quote = await _quote(db, user, booking_id, purpose)
    if not quote.applicable:
        await db.rollback()
        raise BadRequest(
            "Your credit cannot be used for this payment",
            code="credit_not_applicable",
            details={"reason": quote.reason},
        )
    if quote.patient.user_id != user.id:  # pragma: no cover - _quote already scopes to the own profile
        raise Forbidden("Only the patient can use their credit")
    booking = quote.booking
    body = OrderCreate(purpose=purpose, gateway=GATEWAY, booking_id=booking.id)
    derived = payments.DerivedAmount(
        amount_minor=quote.due_minor,
        currency=quote.currency,
        patient_id=booking.patient_id,
        case_id=booking.case_id,
        booking=booking,
    )
    # SEC-007: one open order per booking - supersede other open orders (409 when one may already be paid)
    await payments._settle_open_orders(db, user, body, derived, GATEWAY, quote.currency, request=request)

    fx_rate = (await get_fx_rate(db, quote.currency)).quantize(FX_QUANT, rounding=ROUND_HALF_UP)
    order = PaymentOrder(
        order_number=await next_number(db, "order"),
        purpose=PaymentPurpose.BOOKING_BALANCE,  # never the deposit: a partial credit must not settle instalment 1
        status=OrderStatus.CREATED,
        gateway=GATEWAY,
        payer_user_id=user.id,
        patient_id=booking.patient_id,
        case_id=booking.case_id,
        booking_id=booking.id,
        amount_minor=quote.apply_minor,
        currency=quote.currency,
        base_amount_minor=quote.apply_base_minor,
        base_currency=BASE_CURRENCY,
        fx_rate=fx_rate,
        expires_at=_now() + timedelta(minutes=5),
        meta={
            "booking_amount_minor": quote.apply_minor,
            "booking_currency": quote.currency,
            "platform_credit": True,
            "requested_purpose": purpose.value,
        },
    )
    db.add(order)
    await db.flush()
    payment = await payments.capture_order(
        db,
        order.id,
        GatewayPaymentInfo(
            gateway_payment_id=f"credit_{order.id.hex}",
            status=GatewayPaymentStatus.CAPTURED,
            amount_minor=quote.apply_minor,
            currency=quote.currency,
            method=PaymentGateway.PLATFORM_CREDIT.value,
            raw={"platform_credit": True},
        ),
        source="platform_credit",
        actor=user,
        request=request,
    )
    if payment.status != PaymentStatus.CAPTURED:  # pragma: no cover - amounts are derived above
        await db.rollback()
        raise Conflict("Your credit could not be applied, please try again", code="credit_not_applied")
    taken = await _consume(
        db, booking.patient_id, quote.apply_base_minor, payment_id=payment.id, booking_id=booking.id
    )
    if taken != quote.apply_base_minor:  # a concurrent request spent the credit
        await db.rollback()
        raise Conflict("Your credit balance changed, please try again", code="credit_changed")
    await post_transaction(
        db,
        txn_type=LedgerTxnType.REFERRAL_CREDIT,
        reference_type="payment",
        reference_id=payment.id,
        idempotency_key=f"referral_credit_redeem:{payment.id}",
        description=f"Referral credit applied to booking {booking.booking_number}",
        entries=[
            (REFERRAL_CREDIT, "debit", quote.apply_base_minor),
            (gateway_receivable(GATEWAY.value), "credit", quote.apply_base_minor),
        ],
    )
    await audit_log(
        db,
        actor=user,
        action="credit.apply",
        entity_type="booking",
        entity_id=booking.id,
        after={
            "order_id": str(order.id),
            "payment_id": str(payment.id),
            "amount_minor": quote.apply_minor,
            "currency": quote.currency,
            "base_amount_minor": quote.apply_base_minor,
            "requested_purpose": purpose.value,
        },
        request=request,
    )
    await db.commit()
    remaining_due = max(quote.due_minor - quote.apply_minor, 0)
    return AppliedCredit(
        order=order,
        payment=payment,
        applied_minor=quote.apply_minor,
        currency=quote.currency,
        applied_base_minor=quote.apply_base_minor,
        remaining_due_minor=remaining_due,
        available_base_minor=await available_minor(db, booking.patient_id),
    )


# ------------------------------------------------------------------------------------------- reinstatement
async def reinstate_refunded_credit(db: AsyncSession, refund_id: uuid.UUID) -> PatientCredit | None:
    """``refund.processed`` of a ``platform_credit`` payment: the refunded amount becomes new credit for the
    patient (valid ``credit_validity_days``). Idempotent per refund. Flushes, does not commit."""
    refund = await db.get(Refund, refund_id)
    if refund is None:
        return None
    payment = await db.get(Payment, refund.payment_id)
    if payment is None or str(getattr(payment.gateway, "value", payment.gateway)) != GATEWAY.value:
        return None
    existing = (
        await db.execute(select(PatientCredit).where(PatientCredit.source_refund_id == refund.id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    order = await db.get(PaymentOrder, payment.order_id)
    amount = int(refund.base_amount_minor or 0)
    if order is None or amount <= 0:
        logger.warning("referrals.reinstate_zero", refund_id=str(refund.id))
        return None
    prog = await programme(db)
    credit = await grant_credit(
        db,
        patient_id=order.patient_id,
        kind=PatientCreditKind.REINSTATED,
        amount_minor=amount,
        expires_at=_now() + timedelta(days=prog.credit_validity_days),
        source_refund_id=refund.id,
        note="refund of a credit payment",
        post_expense=False,
    )
    await post_transaction(
        db,
        txn_type=LedgerTxnType.REFERRAL_CREDIT,
        reference_type="refund",
        reference_id=refund.id,
        idempotency_key=f"referral_credit_reinstate:{refund.id}",
        description="Refund of a credit payment returned as credit",
        entries=[(gateway_receivable(GATEWAY.value), "debit", amount), (REFERRAL_CREDIT, "credit", amount)],
    )
    await audit_log(
        db,
        actor=None,
        action="credit.reinstate",
        entity_type="patient_credit",
        entity_id=credit.id,
        after={"refund_id": str(refund.id), "amount_minor": amount},
    )
    return credit
