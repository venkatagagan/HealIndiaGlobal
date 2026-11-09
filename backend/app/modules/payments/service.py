"""Payments business logic (PLAN 8.11, 6.1, 6.4 step 1).

Flow: ``create_order`` derives the amount from the purpose (never from the client), converts it to the payer's
currency with an FX snapshot and creates the gateway order. Every successful payment - Razorpay verify, any
webhook, mock completion, bank-transfer reconciliation - goes through :func:`capture_order`, which locks
the order, records the ``Payment`` idempotently (unique ``(gateway, gateway_payment_id)``), marks the order
and any installment paid, issues a receipt invoice and publishes ``payment.captured``. Failures go through
:func:`fail_order` (``payment.failed``). Refunds are requested by finance/admin, approved by finance,
processed by the ``payments.process_refund`` job and finalised by :func:`finalize_refund`
(``refund.processed``).

Controls (INTEGRATION_BACKLOG #24-#26):

* A captured amount that differs from the order amount is never applied silently: the payment is recorded
  as ``authorized`` and held (``order.meta.amount_review_pending``) until finance accepts it (pro-rata
  capture) or returns it (full gateway refund, books untouched) - :func:`review_amount_difference`.
* Orders in a foreign currency need a DB FX rate (no older than ``fx_rate_max_age_hours``); in production a
  missing/stale rate fails closed (503 ``fx_rate_unavailable``), elsewhere it is logged as an alert.
* Maker-checker: a refund above ``refund_dual_approval_threshold_minor`` (INR) must be approved by a user
  other than its requester; bank-transfer ``mark-paid`` only records a request that a second finance user
  approves (:func:`approve_bank_transfer_paid`).

Ledger postings are NOT made here: be-finance subscribes to ``payment.captured`` / ``refund.processed``.

Unless stated otherwise functions do not commit; the router (or job) commits.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_log
from app.core.config import settings
from app.core.enums import (
    BookingStatus,
    ConsultationStatus,
    DocumentKind,
    InstallmentStatus,
    OrderStatus,
    PaymentGateway,
    PaymentMethod,
    PaymentOption,
    PaymentPurpose,
    PaymentStatus,
    RefundStatus,
)
from app.core.errors import AppError, BadRequest, Conflict, Forbidden, NotFound, PaymentError
from app.core.events import publish
from app.core.ids import uuid7
from app.core.jobs import enqueue
from app.core.money import (
    BASE_CURRENCY,
    FX_QUANT,
    CurrencyError,
    convert,
    convert_minor,
    exponent,
    get_fx_rate,
    normalize_currency,
)
from app.core.rate_limit import count as count_hits
from app.core.settings_store import get_setting
from app.models import (
    Booking,
    Consultation,
    Doctor,
    Document,
    FxRate,
    Installment,
    PatientProfile,
    Payment,
    PaymentOrder,
    Refund,
    User,
    WebhookEvent,
)
from app.models.sequences import next_number
from app.modules.payments import invoices, policies
from app.modules.payments.gateways import get_gateway, is_gateway_enabled
from app.modules.payments.gateways.base import (
    CheckoutContext,
    EventKind,
    GatewayError,
    GatewayPaymentInfo,
    GatewayPaymentStatus,
    GatewayRefundStatus,
    NormalizedEvent,
)
from app.modules.payments.schemas import (
    AmountReviewIn,
    BankTransferProofIn,
    CheckoutOut,
    MarkPaidApproveIn,
    MarkPaidIn,
    OrderCreate,
    PaymentOrderOut,
    PaymentOut,
    RefundCreate,
    RefundOut,
    VerifyIn,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from fastapi import Request

logger = structlog.get_logger(__name__)

ORDER_TTL = timedelta(minutes=30)
BANK_TRANSFER_TTL = timedelta(days=7)
OPEN_ORDER_STATUSES = (OrderStatus.CREATED, OrderStatus.PENDING)
PAID_ORDER_STATUSES = (OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED)
SETTLED_PAYMENT_STATUSES = (PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED)
REFUNDABLE_PAYMENT_STATUSES = (PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED)
COMMITTED_REFUND_STATUSES = (
    RefundStatus.REQUESTED,
    RefundStatus.APPROVED,
    RefundStatus.PROCESSING,
    RefundStatus.PROCESSED,
)
CANCELLATION_REFUND_PREFIX = "Booking cancelled"
# Platform settings (``platform_settings``; unknown keys are accepted by the settings store)
FX_MAX_AGE_SETTING = "fx_rate_max_age_hours"
DEFAULT_FX_MAX_AGE_HOURS = 72  # SEC-008: the check cannot be switched off (0 or less = this default)
REFUND_DUAL_APPROVAL_SETTING = "refund_dual_approval_threshold_minor"
DEFAULT_REFUND_DUAL_APPROVAL_MINOR = 5_000_000  # INR 50,000 (base currency minor units); 0 = every refund
REVIEW_PENDING_KEY = "amount_review_pending"
REVIEW_RETURN_PREFIX = "rev-"
_METHOD_VALUES = frozenset(m.value for m in PaymentMethod)
MAX_WEBHOOK_BYTES = 1_000_000
_SCRUB_KEYS = frozenset(
    {
        "email",
        "contact",
        "card",
        "vpa",
        "bank_account",
        "billing_details",
        "shipping",
        "receipt_email",
        "customer_details",
        "payment_method_details",
        "client_secret",
    }
)


class UnmatchedEventError(Exception):
    """A verified webhook refers to an order/refund we do not know (recorded, not retried)."""


def _now() -> datetime:
    return datetime.now(UTC)


def _value(v: Any) -> str:
    return str(getattr(v, "value", v))


def _ratio(amount: int, numerator: int, denominator: int) -> int:
    if denominator <= 0:
        return 0
    return int((Decimal(amount) * Decimal(numerator) / Decimal(denominator)).quantize(0, ROUND_HALF_UP))


async def _int_setting(db: AsyncSession, key: str, default: int) -> int:
    value = await get_setting(db, key, default)
    if isinstance(value, bool):
        return default
    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        logger.warning("payments.invalid_setting", key=key)
        return default


async def ensure_fx_rates(db: AsyncSession, *currencies: str) -> None:
    """Require a current ``fx_rates`` row for every non-INR currency (backlog #25).

    ``app.core.money.get_fx_rate`` silently falls back to illustrative defaults when a rate is missing. Money
    must never be priced on those in production, so there a missing (or older than
    ``fx_rate_max_age_hours``) rate refuses the order with 503 ``fx_rate_unavailable``; in other environments
    the problem is logged at error level (alert) and the fallback is used."""
    codes = {c for c in currencies if c and c != BASE_CURRENCY}
    if not codes:
        return
    rows = (
        await db.execute(
            select(FxRate.quote_currency, FxRate.as_of).where(
                FxRate.base_currency == BASE_CURRENCY, FxRate.quote_currency.in_(codes), FxRate.rate > 0
            )
        )
    ).all()
    as_of = {str(code): ts for code, ts in rows}
    max_age_hours = (
        await _int_setting(db, FX_MAX_AGE_SETTING, DEFAULT_FX_MAX_AGE_HOURS) or DEFAULT_FX_MAX_AGE_HOURS
    )
    now = _now()
    problems: dict[str, str] = {}
    for code in sorted(codes):
        ts = as_of.get(code)
        if ts is None:
            problems[code] = "missing"
        elif now - ts > timedelta(hours=max_age_hours):
            problems[code] = "stale"
    if not problems:
        return
    if settings.is_production:
        logger.error("payments.fx_rate_unavailable", currencies=problems)
        raise AppError(
            "Exchange rates are temporarily unavailable, please try again later",
            code="fx_rate_unavailable",
            status_code=503,
            details={"currencies": problems},
        )
    logger.error("payments.fx_rate_fallback", currencies=problems, env=settings.ENV)


# ================================================================================================ lookups
async def _lock_order(db: AsyncSession, order_id: uuid.UUID) -> PaymentOrder:
    order = (
        await db.execute(
            select(PaymentOrder)
            .where(PaymentOrder.id == order_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if order is None:
        raise NotFound("Payment order not found")
    return order


async def _lock(db: AsyncSession, model: Any, obj_id: uuid.UUID) -> Any:
    return (
        await db.execute(
            select(model)
            .where(model.id == obj_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def _lock_order_with_target(db: AsyncSession, order_id: uuid.UUID) -> PaymentOrder:
    """Lock the order's booking (when it has one) and then the order: the same booking -> order lock order
    as order creation and booking cancellation, so a capture and a cancel are serialised (SEC-007)."""
    booking_id = (
        await db.execute(select(PaymentOrder.booking_id).where(PaymentOrder.id == order_id))
    ).scalar_one_or_none()
    if booking_id is not None:
        await _lock(db, Booking, booking_id)
    return await _lock_order(db, order_id)


_BOOKING_PURPOSES = (
    PaymentPurpose.BOOKING_DEPOSIT,
    PaymentPurpose.BOOKING_BALANCE,
    PaymentPurpose.BOOKING_FULL,
    PaymentPurpose.INSTALLMENT,
)


async def _capture_block_reason(db: AsyncSession, order: PaymentOrder, booking_amount: int) -> str | None:
    """SEC-007: why money captured for ``order`` must NOT be applied to its target (it is held for finance
    instead): the booking is cancelled or would be over-paid, the installment is already settled or
    cancelled, or the consultation is cancelled or already paid by another order. ``booking_amount`` is the
    amount that would be applied, in the booking (source) currency."""
    if order.booking_id is not None:
        booking = await _lock(db, Booking, order.booking_id)
        if booking is not None:
            if booking.status == BookingStatus.CANCELLED:
                return "booking_cancelled"
            _, booking_ccy = order_booking_amount(order, booking.currency)
            if order.purpose in _BOOKING_PURPOSES and booking_ccy == booking.currency:
                net_paid = int(booking.amount_paid_minor) - int(booking.amount_refunded_minor)
                if net_paid + booking_amount > int(booking.total_minor):
                    return "overpayment"
    if order.installment_id is not None:
        installment = await _lock(db, Installment, order.installment_id)
        if installment is not None:
            if installment.status == InstallmentStatus.CANCELLED:
                return "installment_cancelled"
            if installment.status == InstallmentStatus.PAID and installment.order_id != order.id:
                return "installment_already_paid"
    if order.consultation_id is not None:
        consultation = await _lock(db, Consultation, order.consultation_id)
        if consultation is not None and consultation.status == ConsultationStatus.CANCELLED:
            return "consultation_cancelled"
        other_paid = (
            await db.execute(
                select(func.count())
                .select_from(PaymentOrder)
                .where(
                    PaymentOrder.consultation_id == order.consultation_id,
                    PaymentOrder.id != order.id,
                    PaymentOrder.status.in_([OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED]),
                )
            )
        ).scalar_one()
        if other_paid:
            return "consultation_already_paid"
    return None


async def get_order_for_user(db: AsyncSession, user: User, order_id: uuid.UUID) -> PaymentOrder:
    order = await db.get(PaymentOrder, order_id)
    if order is None or not await policies.can_view_order(db, user, order):
        raise NotFound("Payment order not found")
    return order


async def _get_actionable_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> PaymentOrder:
    order = await db.get(PaymentOrder, order_id)
    if order is None or not await policies.can_act_on_order(db, user, order):
        raise NotFound("Payment order not found")
    return order


def order_booking_amount(order: PaymentOrder, booking_currency: str | None = None) -> tuple[int, str]:
    """The order amount expressed in the booking (source) currency, from the FX snapshot in ``meta``."""
    meta = order.meta or {}
    if "booking_amount_minor" in meta and meta.get("booking_currency"):
        return int(meta["booking_amount_minor"]), str(meta["booking_currency"])
    ccy = booking_currency or order.currency
    if ccy == order.currency:
        return int(order.amount_minor), ccy
    if ccy == order.base_currency:
        return int(order.base_amount_minor), ccy
    return convert_minor(int(order.base_amount_minor), order.base_currency, ccy), ccy


# ================================================================================================ orders
@dataclass(slots=True)
class DerivedAmount:
    amount_minor: int
    currency: str
    patient_id: uuid.UUID
    case_id: uuid.UUID | None
    booking: Booking | None = None
    installment: Installment | None = None
    consultation: Consultation | None = None


async def _authorize_payer(
    db: AsyncSession, user: User, *, patient_id: uuid.UUID, case_id: uuid.UUID | None, what: str
) -> None:
    if not await policies.can_pay_for(db, user, patient_id=patient_id, case_id=case_id):
        raise NotFound(f"{what} not found")


async def derive_amount(db: AsyncSession, user: User, body: OrderCreate) -> DerivedAmount:
    """Server-side amount for ``body.purpose`` in the source (booking/consultation) currency."""
    purpose = body.purpose
    if body.installment_id is not None and purpose != PaymentPurpose.INSTALLMENT:
        raise BadRequest("installment_id is only valid for purpose 'installment'", code="invalid_purpose")
    if body.consultation_id is not None and purpose != PaymentPurpose.CONSULTATION_FEE:
        raise BadRequest(
            "consultation_id is only valid for purpose 'consultation_fee'", code="invalid_purpose"
        )

    if purpose == PaymentPurpose.INSTALLMENT:
        if body.installment_id is None:
            raise BadRequest("installment_id is required", code="installment_required")
        installment = await db.get(Installment, body.installment_id)
        booking = await db.get(Booking, installment.booking_id) if installment is not None else None
        if installment is None or booking is None:
            raise NotFound("Installment not found")
        await _authorize_payer(
            db, user, patient_id=booking.patient_id, case_id=booking.case_id, what="Installment"
        )
        # SEC-007: serialise order creation per booking (the booking row is the lock for all its orders)
        booking = await _lock(db, Booking, booking.id)
        installment = await _lock(db, Installment, installment.id)
        if installment is None or booking is None:  # pragma: no cover - deleted concurrently
            raise NotFound("Installment not found")
        if body.booking_id is not None and body.booking_id != booking.id:
            raise BadRequest("Installment does not belong to this booking", code="installment_mismatch")
        if booking.status == BookingStatus.CANCELLED:
            raise BadRequest("This booking is cancelled", code="booking_not_payable")
        if installment.status not in (InstallmentStatus.DUE, InstallmentStatus.OVERDUE):
            raise BadRequest("This installment is not payable", code="installment_not_due")
        return DerivedAmount(
            amount_minor=int(installment.amount_minor),
            currency=installment.currency,
            patient_id=booking.patient_id,
            case_id=booking.case_id,
            booking=booking,
            installment=installment,
        )

    if purpose == PaymentPurpose.CONSULTATION_FEE:
        if body.consultation_id is None:
            raise BadRequest("consultation_id is required", code="consultation_required")
        consultation = await db.get(Consultation, body.consultation_id)
        if consultation is None:
            raise NotFound("Consultation not found")
        await _authorize_payer(
            db, user, patient_id=consultation.patient_id, case_id=consultation.case_id, what="Consultation"
        )
        consultation = await _lock(db, Consultation, consultation.id)  # SEC-007: one order at a time
        if consultation is None:  # pragma: no cover - deleted concurrently
            raise NotFound("Consultation not found")
        if consultation.status in (ConsultationStatus.CANCELLED, ConsultationStatus.COMPLETED):
            raise BadRequest("This consultation can no longer be paid", code="consultation_not_payable")
        already_paid = (
            await db.execute(
                select(func.count())
                .select_from(PaymentOrder)
                .where(
                    PaymentOrder.consultation_id == consultation.id,
                    PaymentOrder.status.in_([OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED]),
                )
            )
        ).scalar_one()
        if already_paid:
            raise Conflict("This consultation is already paid", code="already_paid")
        amount, ccy = int(consultation.fee_minor or 0), consultation.currency
        if amount <= 0:
            doctor = await db.get(Doctor, consultation.doctor_id)
            if doctor is not None:
                amount, ccy = int(doctor.consultation_fee_minor or 0), doctor.currency
        return DerivedAmount(
            amount_minor=amount,
            currency=ccy,
            patient_id=consultation.patient_id,
            case_id=consultation.case_id,
            consultation=consultation,
        )

    if purpose == PaymentPurpose.SERVICE:
        raise BadRequest("Service payments are not supported yet", code="unsupported_purpose")

    # booking_deposit / booking_balance / booking_full
    if body.booking_id is None:
        raise BadRequest("booking_id is required", code="booking_required")
    booking = await db.get(Booking, body.booking_id)
    if booking is None:
        raise NotFound("Booking not found")
    await _authorize_payer(db, user, patient_id=booking.patient_id, case_id=booking.case_id, what="Booking")
    booking = await _lock(db, Booking, booking.id)  # SEC-007: one order at a time per booking
    if booking is None:  # pragma: no cover - deleted concurrently
        raise NotFound("Booking not found")
    if booking.status == BookingStatus.CANCELLED:
        raise BadRequest("This booking is cancelled", code="booking_not_payable")
    net_paid = int(booking.amount_paid_minor) - int(booking.amount_refunded_minor)
    if purpose == PaymentPurpose.BOOKING_DEPOSIT:
        if booking.status != BookingStatus.PENDING_PAYMENT:
            raise BadRequest("The deposit is only payable before confirmation", code="deposit_not_applicable")
        amount = int(booking.deposit_minor) - net_paid
    else:  # balance / full
        amount = int(booking.total_minor) - net_paid
    return DerivedAmount(
        amount_minor=amount,
        currency=booking.currency,
        patient_id=booking.patient_id,
        case_id=booking.case_id,
        booking=booking,
    )


def _round_for_gateway(amount_minor: int, currency: str, gateway: PaymentGateway) -> int:
    """Razorpay/Stripe require 3-decimal currency amounts (KWD/BHD/OMR...) to end in 0."""
    if gateway in (PaymentGateway.RAZORPAY, PaymentGateway.STRIPE) and exponent(currency) == 3:
        return max(10, int((Decimal(amount_minor) / 10).quantize(0, ROUND_HALF_UP)) * 10)
    return amount_minor


async def _checkout_context(
    db: AsyncSession, order: PaymentOrder, extra: dict[str, Any] | None = None
) -> CheckoutContext:
    payer = await db.get(User, order.payer_user_id)
    description = invoices.purpose_label(order.purpose)
    if order.booking_id is not None:
        number = (
            await db.execute(select(Booking.booking_number).where(Booking.id == order.booking_id))
        ).scalar_one_or_none()
        if number:
            description = f"{description} - {number}"
    ctx_extra = dict(extra or {})
    if order.gateway == PaymentGateway.BANK_TRANSFER:
        ctx_extra["bank_details"] = await get_setting(db, "bank_transfer_details") or {}
    return CheckoutContext(
        description=description,
        payer_name=payer.full_name if payer else None,
        payer_email=payer.email if payer else None,
        payer_phone=payer.phone if payer else None,
        extra=ctx_extra,
    )


async def build_checkout(
    db: AsyncSession, order: PaymentOrder, extra: dict[str, Any] | None = None
) -> CheckoutOut:
    gateway = get_gateway(order.gateway)
    ctx = await _checkout_context(db, order, extra)
    try:
        payload = await gateway.checkout_payload(order, ctx)
    except GatewayError as exc:
        raise PaymentError(str(exc), code=exc.code) from exc
    return CheckoutOut.model_validate(
        {
            "order": PaymentOrderOut.model_validate(order),
            "gateway": order.gateway,
            _value(order.gateway): payload,
        }
    )


def _same_request(order: PaymentOrder, body: OrderCreate) -> bool:
    return (
        order.purpose == body.purpose
        and order.gateway == body.gateway
        and (body.booking_id is None or order.booking_id == body.booking_id)
        and order.installment_id == body.installment_id
        and order.consultation_id == body.consultation_id
        and (body.currency is None or order.currency == body.currency)
    )


async def _find_idempotent(db: AsyncSession, user: User, key: str) -> PaymentOrder | None:
    return (
        await db.execute(
            select(PaymentOrder).where(
                PaymentOrder.payer_user_id == user.id, PaymentOrder.idempotency_key == key
            )
        )
    ).scalar_one_or_none()


def _payment_in_progress(order: PaymentOrder, now: datetime) -> bool:
    """An open order the payer may already have paid: a bank transfer with a proof or a pending mark-paid
    request, a payment held for review, or a gateway order still being authorised (``pending``)."""
    meta = order.meta or {}
    if meta.get(REVIEW_PENDING_KEY):
        return True
    request = meta.get("mark_paid_request")
    if isinstance(request, dict) and request.get("status") == "pending":
        return True
    if order.gateway == PaymentGateway.BANK_TRANSFER and meta.get("bank_transfer_proof"):
        return True
    return order.status == OrderStatus.PENDING and (order.expires_at is None or order.expires_at > now)


async def _settle_open_orders(
    db: AsyncSession,
    user: User,
    body: OrderCreate,
    derived: DerivedAmount,
    gateway: PaymentGateway,
    currency: str,
    *,
    request: Request | None = None,
) -> PaymentOrder | None:
    """SEC-007: at most one open order per booking (or consultation). The caller holds the row lock on the
    target (see :func:`derive_amount`).

    * An identical, unexpired open order of the same payer is returned for reuse (no second gateway order).
    * An open order that may already be paid blocks a new one (409 ``payment_in_progress``).
    * Any other open order is cancelled (``superseded``); a late capture on it is checked against the
      target by :func:`capture_order` and held for finance if it would over-pay."""
    if derived.consultation is not None:
        target = PaymentOrder.consultation_id == derived.consultation.id
    elif derived.booking is not None:
        target = PaymentOrder.booking_id == derived.booking.id
    else:  # pragma: no cover - every purpose has a target
        return None
    open_orders = (
        (
            await db.execute(
                select(PaymentOrder)
                .where(target, PaymentOrder.status.in_(OPEN_ORDER_STATUSES))
                .order_by(PaymentOrder.created_at.desc())
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    now = _now()
    installment_id = derived.installment.id if derived.installment is not None else None
    consultation_id = derived.consultation.id if derived.consultation is not None else None
    reusable: PaymentOrder | None = None
    for existing in open_orders:
        same = (
            reusable is None
            and existing.payer_user_id == user.id
            and existing.purpose == body.purpose
            and existing.gateway == gateway
            and existing.currency == currency
            and existing.installment_id == installment_id
            and existing.consultation_id == consultation_id
            and int((existing.meta or {}).get("booking_amount_minor", -1)) == derived.amount_minor
            and (existing.expires_at is None or existing.expires_at > now)
            and not (existing.meta or {}).get(REVIEW_PENDING_KEY)
        )
        if same:
            reusable = existing
            continue
        if _payment_in_progress(existing, now):
            raise Conflict(
                "A payment for this is already being processed. Please wait for it to finish.",
                code="payment_in_progress",
                details={"order_id": str(existing.id), "order_number": existing.order_number},
            )
        existing.status = OrderStatus.CANCELLED
        existing.meta = {**(existing.meta or {}), "cancelled_reason": "superseded"}
        await audit_log(
            db,
            actor=user,
            action="payment_order.superseded",
            entity_type="payment_order",
            entity_id=existing.id,
            before={"status": "open"},
            after={"status": OrderStatus.CANCELLED.value},
            request=request,
        )
    await db.flush()
    return reusable


async def create_order(
    db: AsyncSession,
    user: User,
    body: OrderCreate,
    *,
    idempotency_key: str | None = None,
    request: Request | None = None,
) -> CheckoutOut:
    """Create (or, for a repeated ``Idempotency-Key``, return) a payment order and its checkout payload.
    Commits."""
    gateway_name = PaymentGateway(body.gateway)
    if not is_gateway_enabled(gateway_name):
        raise BadRequest("This payment method is not available", code="gateway_unavailable")
    gateway = get_gateway(gateway_name)
    if not gateway.configured:
        raise BadRequest("This payment method is not available", code="gateway_unavailable")

    key = idempotency_key.strip() if idempotency_key else None
    if key:
        existing = await _find_idempotent(db, user, key)
        if existing is not None:
            if not _same_request(existing, body):
                raise Conflict(
                    "Idempotency-Key was already used for a different request", code="idempotency_key_reused"
                )
            return await build_checkout(db, existing)

    derived = await derive_amount(db, user, body)
    if derived.amount_minor <= 0:
        raise BadRequest("Nothing is due for this payment", code="nothing_due")

    patient = await db.get(PatientProfile, derived.patient_id)
    try:
        source_ccy = normalize_currency(derived.currency)
        order_ccy = normalize_currency(
            body.currency
            or (patient.preferred_currency if patient is not None else None)
            or settings.DEFAULT_PATIENT_CURRENCY
        )
    except CurrencyError as exc:
        raise BadRequest(str(exc), code="unsupported_currency") from exc
    supported = {str(c).upper() for c in (await get_setting(db, "supported_currencies") or [])}
    if order_ccy != source_ccy and order_ccy not in supported:
        raise BadRequest(f"Currency {order_ccy} is not supported", code="unsupported_currency")
    await ensure_fx_rates(db, source_ccy, order_ccy)
    reusable = await _settle_open_orders(db, user, body, derived, gateway_name, order_ccy, request=request)
    if reusable is not None:
        await db.commit()
        return await build_checkout(db, reusable)

    try:
        amount_order, _ = await convert(db, derived.amount_minor, source_ccy, order_ccy)
        if source_ccy == BASE_CURRENCY:
            base_amount = derived.amount_minor
        else:
            base_amount, _ = await convert(db, derived.amount_minor, source_ccy, BASE_CURRENCY)
        fx_rate = (await get_fx_rate(db, order_ccy)).quantize(FX_QUANT, rounding=ROUND_HALF_UP)
    except CurrencyError as exc:
        raise BadRequest(str(exc), code="unsupported_currency") from exc
    amount_order = _round_for_gateway(amount_order, order_ccy, gateway_name)
    if amount_order <= 0 or base_amount <= 0:
        raise BadRequest("The amount is too small to be paid", code="amount_too_small")

    now = _now()
    order = PaymentOrder(
        order_number=await next_number(db, "order"),
        purpose=body.purpose,
        status=OrderStatus.CREATED,
        gateway=gateway_name,
        payer_user_id=user.id,
        patient_id=derived.patient_id,
        case_id=derived.case_id,
        booking_id=derived.booking.id if derived.booking else None,
        consultation_id=derived.consultation.id if derived.consultation else None,
        installment_id=derived.installment.id if derived.installment else None,
        amount_minor=amount_order,
        currency=order_ccy,
        base_amount_minor=base_amount,
        base_currency=BASE_CURRENCY,
        fx_rate=fx_rate,
        idempotency_key=key,
        expires_at=now + (BANK_TRANSFER_TTL if gateway_name == PaymentGateway.BANK_TRANSFER else ORDER_TTL),
        meta={"booking_amount_minor": derived.amount_minor, "booking_currency": source_ccy},
    )
    try:
        async with db.begin_nested():
            db.add(order)
            await db.flush()
    except IntegrityError as exc:  # unique (payer, idempotency_key) race
        if not key:
            raise
        existing = await _find_idempotent(db, user, key)
        if existing is None:
            raise
        if not _same_request(existing, body):
            raise Conflict(
                "Idempotency-Key was already used for a different request", code="idempotency_key_reused"
            ) from exc
        return await build_checkout(db, existing)

    if derived.installment is not None:
        derived.installment.order_id = order.id

    ctx = await _checkout_context(db, order)
    try:
        result = await gateway.create_order(order, ctx)
    except GatewayError as exc:
        logger.warning("payments.gateway_create_failed", gateway=gateway_name.value, error=str(exc))
        raise PaymentError("The payment provider is unavailable, please try again", code=exc.code) from exc
    order.gateway_order_id = result.gateway_order_id
    await audit_log(
        db,
        actor=user,
        action="payment_order.create",
        entity_type="payment_order",
        entity_id=order.id,
        after={
            "order_number": order.order_number,
            "purpose": _value(order.purpose),
            "gateway": gateway_name.value,
            "amount_minor": order.amount_minor,
            "currency": order.currency,
            "base_amount_minor": order.base_amount_minor,
        },
        request=request,
    )
    await db.commit()
    return await build_checkout(db, order, extra=result.data)


# ================================================================================================ capture
def _review_status(payment: Payment) -> str | None:
    review = (payment.raw or {}).get("amount_review")
    return str(review.get("status")) if isinstance(review, dict) and review.get("status") else None


def _payment_method(order: PaymentOrder, info: GatewayPaymentInfo) -> str | None:
    if order.gateway == PaymentGateway.MOCK:
        return PaymentMethod.MOCK.value
    if order.gateway == PaymentGateway.BANK_TRANSFER:
        return PaymentMethod.BANK_TRANSFER.value
    return info.method


def _set_review_pending(order: PaymentOrder, payment_id: uuid.UUID, pending: bool) -> None:
    meta = dict(order.meta or {})
    ids = {str(x) for x in (meta.get(REVIEW_PENDING_KEY) or [])}
    if pending:
        ids.add(str(payment_id))
    else:
        ids.discard(str(payment_id))
    if ids:
        meta[REVIEW_PENDING_KEY] = sorted(ids)
    else:
        meta.pop(REVIEW_PENDING_KEY, None)
    order.meta = meta


async def _hold_for_review(
    db: AsyncSession,
    order: PaymentOrder,
    existing: Payment | None,
    info: GatewayPaymentInfo,
    amount: int,
    currency: str,
    *,
    source: str,
    actor: User | None,
    request: Request | None,
    reason: str = "amount_mismatch",
) -> Payment:
    """Record a payment whose captured amount differs from the order amount WITHOUT applying it (backlog #24):
    status ``authorized`` (money is at the gateway but not in the books), no invoice, no events. Finance
    decides with :func:`review_amount_difference`. ``reason`` is ``amount_mismatch`` or a SEC-007 block
    reason (see :func:`_capture_block_reason`)."""
    now = _now()
    review = {
        "status": "pending",
        "reason": reason,
        "expected_minor": int(order.amount_minor),
        "received_minor": amount,
        "currency": currency,
        "held_at": now.isoformat(),
        "source": source,
    }
    raw = {**(info.raw or {}), "source": source, "amount_review": review}
    method = _payment_method(order, info)
    base_amount = _ratio(order.base_amount_minor, amount, order.amount_minor)
    payment = existing
    if payment is None:
        payment = Payment(
            order_id=order.id,
            gateway=order.gateway,
            gateway_payment_id=info.gateway_payment_id,
            method=PaymentMethod(method) if method in _METHOD_VALUES else None,
            status=PaymentStatus.AUTHORIZED,
            amount_minor=amount,
            currency=currency,
            base_amount_minor=base_amount,
            fee_minor=max(int(info.fee_minor), 0),
            tax_on_fee_minor=max(int(info.tax_minor), 0),
            raw=raw,
        )
        db.add(payment)
    else:
        payment.status = PaymentStatus.AUTHORIZED
        payment.amount_minor = amount
        payment.base_amount_minor = base_amount
        payment.fee_minor = max(int(info.fee_minor), 0)
        payment.tax_on_fee_minor = max(int(info.tax_minor), 0)
        payment.captured_at = None
        payment.raw = raw
    await db.flush()
    if order.status == OrderStatus.CREATED:
        order.status = OrderStatus.PENDING
    _set_review_pending(order, payment.id, True)
    logger.error(
        "payments.amount_review_required",
        order_id=str(order.id),
        payment_id=str(payment.id),
        expected=order.amount_minor,
        received=amount,
        currency=currency,
    )
    await audit_log(
        db,
        actor=actor,
        action="payment.held_for_review",
        entity_type="payment_order",
        entity_id=order.id,
        after={"payment_id": str(payment.id), **review},
        request=request,
    )
    await db.flush()
    return payment


async def capture_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    info: GatewayPaymentInfo,
    *,
    source: str,
    actor: User | None = None,
    request: Request | None = None,
    accept_amount_difference: bool = False,
    bank_reference: str | None = None,
) -> Payment:
    """THE single internal capture path. Idempotent on ``(gateway, gateway_payment_id)``. Does not commit.

    A captured amount different from the order amount is held for finance review (payment ``authorized``,
    nothing published) unless ``accept_amount_difference`` (finance accepted it), in which case the booking is
    credited pro rata.

    SEC-007: a capture that the target can no longer take (cancelled booking, over-payment, installment
    already settled, consultation cancelled or already paid) is held for finance review too, whatever the
    order status; finance can only return it (``accept`` is refused with 409 ``target_not_payable``)."""
    order = await _lock_order_with_target(db, order_id)
    if not info.gateway_payment_id:
        raise PaymentError("Missing gateway payment id", code="invalid_payment")
    existing = (
        await db.execute(
            select(Payment)
            .where(Payment.gateway == order.gateway, Payment.gateway_payment_id == info.gateway_payment_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if existing is not None and existing.status in SETTLED_PAYMENT_STATUSES:
        return existing
    if existing is not None and existing.order_id != order.id:
        raise PaymentError("Payment belongs to another order", code="order_mismatch")
    if existing is not None and _review_status(existing) is not None and not accept_amount_difference:
        return existing  # held for (or already decided by) finance review: repeated deliveries are no-ops
    currency = (info.currency or order.currency).upper()
    if currency != order.currency:
        raise PaymentError("Payment currency does not match the order", code="currency_mismatch")

    if info.amount_minor <= 0 and not accept_amount_difference:
        # SEC-006: an unknown captured amount is never assumed to be the full order amount.
        return await _hold_for_review(
            db,
            order,
            existing,
            info,
            0,
            currency,
            source=source,
            actor=actor,
            request=request,
            reason="amount_unknown",
        )
    amount = int(info.amount_minor) if info.amount_minor > 0 else int(order.amount_minor)
    booking_amount, booking_ccy = order_booking_amount(order)
    block = await _capture_block_reason(db, order, _ratio(booking_amount, amount, order.amount_minor))
    if block is not None:
        if accept_amount_difference:
            raise Conflict(
                "This payment cannot be applied any more; return it to the payer instead",
                code="target_not_payable",
                details={"reason": block},
            )
        return await _hold_for_review(
            db,
            order,
            existing,
            info,
            amount,
            currency,
            source=source,
            actor=actor,
            request=request,
            reason=block,
        )
    if amount != order.amount_minor and not accept_amount_difference:
        return await _hold_for_review(
            db, order, existing, info, amount, currency, source=source, actor=actor, request=request
        )
    if amount == order.amount_minor:
        base_amount = int(order.base_amount_minor)
        applied_booking_amount = booking_amount
    else:
        logger.warning(
            "payments.amount_difference_accepted",
            order_id=str(order.id),
            expected=order.amount_minor,
            received=amount,
        )
        base_amount = _ratio(order.base_amount_minor, amount, order.amount_minor)
        applied_booking_amount = _ratio(booking_amount, amount, order.amount_minor)

    now = _now()
    method = _payment_method(order, info)
    raw = dict(info.raw or {})
    raw["source"] = source
    if existing is None:
        payment = Payment(
            order_id=order.id,
            gateway=order.gateway,
            gateway_payment_id=info.gateway_payment_id,
            method=PaymentMethod(method) if method in _METHOD_VALUES else None,
            status=PaymentStatus.CAPTURED,
            amount_minor=amount,
            currency=currency,
            base_amount_minor=base_amount,
            fee_minor=max(int(info.fee_minor), 0),
            tax_on_fee_minor=max(int(info.tax_minor), 0),
            captured_at=now,
            raw=raw,
            bank_reference=bank_reference,
        )
        db.add(payment)
    else:
        payment = existing
        payment.status = PaymentStatus.CAPTURED
        payment.amount_minor = amount
        payment.base_amount_minor = base_amount
        payment.fee_minor = max(int(info.fee_minor), 0)
        payment.tax_on_fee_minor = max(int(info.tax_minor), 0)
        payment.error_code = None
        payment.error_description = None
        payment.captured_at = now
        payment.raw = raw
        if bank_reference is not None:
            payment.bank_reference = bank_reference
    await db.flush()

    if order.status not in PAID_ORDER_STATUSES:
        order.status = OrderStatus.PAID
    if order.paid_at is None:
        order.paid_at = now

    installment_id = order.installment_id
    if installment_id is None and order.purpose == PaymentPurpose.BOOKING_DEPOSIT and order.booking_id:
        installment_id = (
            await db.execute(
                select(Installment.id).where(
                    Installment.booking_id == order.booking_id,
                    Installment.seq == 1,
                    Installment.status.in_([InstallmentStatus.DUE, InstallmentStatus.OVERDUE]),
                )
            )
        ).scalar_one_or_none()
    if installment_id is not None:
        installment = await _lock(db, Installment, installment_id)
        if installment is not None and installment.status != InstallmentStatus.PAID:
            installment.status = InstallmentStatus.PAID
            installment.paid_at = now
            installment.order_id = order.id

    booking = await db.get(Booking, order.booking_id) if order.booking_id else None
    invoice = await invoices.create_receipt(db, order=order, payment=payment, booking=booking)
    await enqueue(
        db, "payments.render_invoice", {"invoice_id": str(invoice.id)}, dedupe_key=f"inv:{invoice.id}"
    )

    await audit_log(
        db,
        actor=actor,
        action="payment.captured",
        entity_type="payment_order",
        entity_id=order.id,
        after={
            "payment_id": str(payment.id),
            "gateway": _value(order.gateway),
            "gateway_payment_id": payment.gateway_payment_id,
            "amount_minor": amount,
            "currency": currency,
            "base_amount_minor": base_amount,
            "source": source,
        },
        request=request,
    )
    await publish(
        db,
        "payment.captured",
        {
            "payment_id": str(payment.id),
            "order_id": str(order.id),
            "booking_id": str(order.booking_id) if order.booking_id else None,
            "installment_id": str(installment_id) if installment_id else None,
            "consultation_id": str(order.consultation_id) if order.consultation_id else None,
            "amount_minor": amount,
            "currency": currency,
            "base_amount_minor": base_amount,
            "base_currency": order.base_currency,
            "booking_amount_minor": applied_booking_amount,
            "booking_currency": booking_ccy,
            "gateway": _value(order.gateway),
            "fee_minor": int(payment.fee_minor) + int(payment.tax_on_fee_minor),
            "purpose": _value(order.purpose),
            "patient_id": str(order.patient_id),
            "case_id": str(order.case_id) if order.case_id else None,
            "invoice_id": str(invoice.id),
        },
    )
    return payment


async def fail_order(
    db: AsyncSession,
    order_id: uuid.UUID,
    *,
    info: GatewayPaymentInfo | None = None,
    error_code: str | None = None,
    error_description: str | None = None,
    source: str,
    actor: User | None = None,
) -> PaymentOrder:
    """Record a failed payment attempt; open orders become ``failed`` and ``payment.failed`` is published
    (once per transition). Paid orders are never downgraded. Does not commit."""
    order = await _lock_order(db, order_id)
    code = (error_code or (info.error_code if info else None) or "payment_failed")[:100]
    description = error_description or (info.error_description if info else None)
    if info is not None and info.gateway_payment_id:
        existing = (
            await db.execute(
                select(Payment).where(
                    Payment.gateway == order.gateway, Payment.gateway_payment_id == info.gateway_payment_id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            db.add(
                Payment(
                    order_id=order.id,
                    gateway=order.gateway,
                    gateway_payment_id=info.gateway_payment_id,
                    method=PaymentMethod(info.method) if info.method in _METHOD_VALUES else None,
                    status=PaymentStatus.FAILED,
                    amount_minor=max(int(info.amount_minor), 0),
                    currency=(info.currency or order.currency).upper()[:3],
                    base_amount_minor=0,
                    error_code=code,
                    error_description=description,
                    raw={**(info.raw or {}), "source": source},
                )
            )
    if order.status in PAID_ORDER_STATUSES or order.status == OrderStatus.FAILED:
        await db.flush()
        return order
    order.status = OrderStatus.FAILED
    order.meta = {**(order.meta or {}), "last_error": {"code": code, "description": description}}
    await audit_log(
        db,
        actor=actor,
        action="payment.failed",
        entity_type="payment_order",
        entity_id=order.id,
        after={"error_code": code, "source": source},
    )
    await db.flush()
    await publish(
        db,
        "payment.failed",
        {
            "order_id": str(order.id),
            "booking_id": str(order.booking_id) if order.booking_id else None,
            "payer_user_id": str(order.payer_user_id),
            "error_code": code,
        },
    )
    return order


async def _apply_payment_info(
    db: AsyncSession,
    order: PaymentOrder,
    info: GatewayPaymentInfo,
    *,
    source: str,
    actor: User | None,
    request: Request | None = None,
) -> None:
    if info.status == GatewayPaymentStatus.CAPTURED:
        await capture_order(db, order.id, info, source=source, actor=actor, request=request)
    elif info.status == GatewayPaymentStatus.FAILED:
        await fail_order(db, order.id, info=info, source=source, actor=actor)
    else:
        locked = await _lock_order(db, order.id)
        if locked.status == OrderStatus.CREATED:
            locked.status = OrderStatus.PENDING


async def verify_order(
    db: AsyncSession, user: User, order_id: uuid.UUID, body: VerifyIn, request: Request | None = None
) -> PaymentOrder:
    """Client-side completion (Razorpay signature / Stripe PaymentIntent). The gateway is always asked for the
    authoritative payment state. Commits."""
    order = await _get_actionable_order(db, user, order_id)
    gateway = get_gateway(order.gateway)
    try:
        if order.gateway == PaymentGateway.RAZORPAY:
            if not (body.razorpay_payment_id and body.razorpay_order_id and body.razorpay_signature):
                raise BadRequest("razorpay_payment_id, razorpay_order_id and razorpay_signature are required")
            if body.razorpay_order_id != order.gateway_order_id:
                raise BadRequest("Payment does not belong to this order", code="order_mismatch")
            if not gateway.verify_client_signature(
                body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
            ):
                await audit_log(
                    db,
                    actor=user,
                    action="payment.verify_failed",
                    entity_type="payment_order",
                    entity_id=order.id,
                    after={"reason": "invalid_signature"},
                    request=request,
                )
                await db.commit()
                raise BadRequest("Payment signature verification failed", code="invalid_signature")
            info = await gateway.fetch_payment(body.razorpay_payment_id)
            if info.gateway_order_id != order.gateway_order_id:
                raise BadRequest("Payment does not belong to this order", code="order_mismatch")
            if info.status == GatewayPaymentStatus.AUTHORIZED:
                await gateway.capture_payment(info.gateway_payment_id, info.amount_minor, info.currency)
                info.status = GatewayPaymentStatus.CAPTURED
        elif order.gateway == PaymentGateway.STRIPE:
            if not body.payment_intent_id or body.payment_intent_id != order.gateway_order_id:
                raise BadRequest("Payment does not belong to this order", code="order_mismatch")
            info = await gateway.fetch_payment(body.payment_intent_id)
        else:
            raise BadRequest("This payment method does not use verification", code="verify_not_supported")
    except GatewayError as exc:
        raise PaymentError("Could not confirm the payment with the provider", code=exc.code) from exc
    await _apply_payment_info(db, order, info, source="verify", actor=user, request=request)
    await db.commit()
    return await db.get(PaymentOrder, order.id, populate_existing=True) or order


# ========================================================================================= bank transfer
async def submit_bank_transfer_proof(
    db: AsyncSession,
    user: User,
    order_id: uuid.UUID,
    body: BankTransferProofIn,
    request: Request | None = None,
) -> PaymentOrder:
    order = await _get_actionable_order(db, user, order_id)
    if order.gateway != PaymentGateway.BANK_TRANSFER:
        raise BadRequest("This order is not a bank transfer", code="not_bank_transfer")
    order = await _lock_order(db, order.id)
    if order.status not in OPEN_ORDER_STATUSES:
        raise BadRequest("This order is no longer open", code="order_not_open")
    document = await db.get(Document, body.document_id)
    if (
        document is None
        or document.deleted_at is not None
        or not (document.owner_user_id == user.id or document.patient_id == order.patient_id)
    ):
        raise NotFound("Document not found")
    # Link the receipt to the order's case/patient so finance (and the case timeline) find it even when the
    # client uploaded it without ``case_id`` (an existing link to a different case is left untouched).
    if document.case_id is None and order.case_id is not None:
        document.case_id = order.case_id
    if document.patient_id is None:
        document.patient_id = order.patient_id
    proof = {
        "document_id": str(document.id),
        "reference": body.reference,
        "submitted_at": _now().isoformat(),
        "submitted_by": str(user.id),
    }
    order.meta = {**(order.meta or {}), "bank_transfer_proof": proof}
    order.status = OrderStatus.PENDING
    await audit_log(
        db,
        actor=user,
        action="payment_order.bank_transfer_proof",
        entity_type="payment_order",
        entity_id=order.id,
        after={"document_id": proof["document_id"], "reference": body.reference},
        request=request,
    )
    await db.commit()
    return order


async def mark_bank_transfer_paid(
    db: AsyncSession, user: User, order_id: uuid.UUID, body: MarkPaidIn, request: Request | None = None
) -> PaymentOrder:
    """Finance reconciliation of a received bank transfer, step 1 of 2 (maker): records a pending mark-paid
    request in ``order.meta.mark_paid_request``; a different finance user must approve it
    (:func:`approve_bank_transfer_paid`) before the capture is applied. A new request replaces a pending one.
    SEC-009: the bank reference (UTR) must not have settled, or be pending for, any other order, and the
    order's booking/consultation must still be payable. Commits."""
    order = await _lock_order_with_target(db, order_id)
    _check_mark_paid_allowed(order)
    if body.amount_minor != order.amount_minor:
        raise BadRequest(
            "The received amount does not match the order amount",
            code="amount_mismatch",
            details={"expected_minor": order.amount_minor, "currency": order.currency},
        )
    reference = normalize_bank_reference(body.reference)
    await _check_bank_reference_unused(db, order, reference)
    await _check_target_payable(db, order)
    previous = (order.meta or {}).get("mark_paid_request")
    request_data = {
        "id": str(uuid.uuid4()),  # SEC-063: the checker binds the approval to this request
        "status": "pending",
        "reference": body.reference,
        "reference_normalized": reference,
        "amount_minor": body.amount_minor,
        "requested_by": str(user.id),
        "requested_at": _now().isoformat(),
    }
    order.meta = {**(order.meta or {}), "mark_paid_request": request_data}
    await audit_log(
        db,
        actor=user,
        action="payment_order.mark_paid_request",
        entity_type="payment_order",
        entity_id=order.id,
        before=previous if isinstance(previous, dict) and previous.get("status") == "pending" else None,
        after={"reference": body.reference, "amount_minor": body.amount_minor, "currency": order.currency},
        request=request,
    )
    await db.commit()
    return order


MARK_PAID_ORDER_STATUSES = (*OPEN_ORDER_STATUSES, OrderStatus.EXPIRED)


def normalize_bank_reference(reference: str) -> str:
    """UTR / SWIFT references are compared without case or whitespace (``utr 123`` == ``UTR123``)."""
    return "".join(str(reference).split()).upper()[:100]


def _check_mark_paid_allowed(order: PaymentOrder) -> None:
    """SEC-009: open orders, and late wires for expired orders; never cancelled or failed orders."""
    if order.gateway != PaymentGateway.BANK_TRANSFER:
        raise BadRequest("Only bank-transfer orders can be marked as paid", code="not_bank_transfer")
    if order.status in PAID_ORDER_STATUSES:
        raise Conflict("This order is already paid", code="already_paid")
    if order.status not in MARK_PAID_ORDER_STATUSES:
        raise BadRequest("This order cannot be marked as paid", code="order_not_open")


async def _check_bank_reference_unused(db: AsyncSession, order: PaymentOrder, reference: str) -> None:
    """SEC-009: one bank reference settles one order (backed by a unique constraint on ``payments``)."""
    if not reference:
        raise BadRequest("A bank reference is required", code="reference_required")
    used = (
        await db.execute(
            select(Payment.order_id).where(
                Payment.gateway == PaymentGateway.BANK_TRANSFER, Payment.bank_reference == reference
            )
        )
    ).first()
    pending_elsewhere = (
        await db.execute(
            select(PaymentOrder.id).where(
                PaymentOrder.id != order.id,
                PaymentOrder.gateway == PaymentGateway.BANK_TRANSFER,
                PaymentOrder.meta["mark_paid_request"]["status"].astext == "pending",
                PaymentOrder.meta["mark_paid_request"]["reference_normalized"].astext == reference,
            )
        )
    ).first()
    if used is not None or pending_elsewhere is not None:
        raise Conflict(
            "This bank reference has already been used for another payment", code="reference_already_used"
        )


async def _check_target_payable(db: AsyncSession, order: PaymentOrder) -> None:
    """SEC-009: refuse to reconcile a wire against a cancelled or already settled booking/consultation."""
    booking_amount, _ = order_booking_amount(order)
    reason = await _capture_block_reason(db, order, booking_amount)
    if reason is not None:
        raise Conflict(
            "The booking or consultation for this order can no longer take this payment",
            code="target_not_payable",
            details={"reason": reason},
        )


def _pending_mark_paid(order: PaymentOrder) -> dict[str, Any]:
    pending = (order.meta or {}).get("mark_paid_request")
    if not isinstance(pending, dict) or pending.get("status") != "pending":
        raise BadRequest("There is no pending mark-paid request for this order", code="no_pending_request")
    return pending


async def approve_bank_transfer_paid(
    db: AsyncSession,
    user: User,
    order_id: uuid.UUID,
    body: MarkPaidApproveIn,
    request: Request | None = None,
) -> PaymentOrder:
    """Step 2 (checker): a finance user other than the requester applies the pending mark-paid through the
    §3.3 capture path. ``body`` names the request the checker reviewed (SEC-063): if the maker replaced it
    since (another reference/amount, or another request id), 409 ``mark_paid_request_changed``. Commits."""
    order = await _lock_order_with_target(db, order_id)
    if order.gateway != PaymentGateway.BANK_TRANSFER:
        raise BadRequest("Only bank-transfer orders can be marked as paid", code="not_bank_transfer")
    pending = _pending_mark_paid(order)
    if str(pending.get("requested_by")) == str(user.id):
        raise Forbidden(
            "A bank transfer must be confirmed by a second finance user", code="second_approver_required"
        )
    if (
        str(pending.get("reference")) != body.reference
        or int(pending.get("amount_minor") or 0) != body.amount_minor
        or (body.request_id is not None and str(pending.get("id")) != str(body.request_id))
    ):
        raise Conflict(
            "The pending mark-paid request changed since it was reviewed; review it again",
            code="mark_paid_request_changed",
        )
    _check_mark_paid_allowed(order)
    amount = int(pending.get("amount_minor") or 0)
    if amount != order.amount_minor:  # defensive: the order amount never changes after creation
        raise BadRequest("The requested amount no longer matches the order", code="amount_mismatch")
    reference = normalize_bank_reference(str(pending.get("reference") or ""))
    await _check_bank_reference_unused(db, order, reference)
    await _check_target_payable(db, order)
    info = GatewayPaymentInfo(
        gateway_payment_id=f"bank:{order.order_number}",
        status=GatewayPaymentStatus.CAPTURED,
        amount_minor=amount,
        currency=order.currency,
        method=PaymentMethod.BANK_TRANSFER.value,
        raw={
            "reference": pending.get("reference"),
            "marked_by": pending.get("requested_by"),
            "approved_by": str(user.id),
        },
    )
    await capture_order(
        db,
        order.id,
        info,
        source="bank_reconciliation",
        actor=user,
        request=request,
        bank_reference=reference,
    )
    order.meta = {
        **(order.meta or {}),
        "mark_paid_request": {
            **pending,
            "status": "approved",
            "decided_by": str(user.id),
            "decided_at": _now().isoformat(),
        },
    }
    await db.commit()
    return order


async def reject_bank_transfer_paid(
    db: AsyncSession, user: User, order_id: uuid.UUID, reason: str | None, request: Request | None = None
) -> PaymentOrder:
    """Reject (or, for the requester, withdraw) a pending mark-paid request. Commits."""
    order = await _lock_order(db, order_id)
    pending = _pending_mark_paid(order)
    order.meta = {
        **(order.meta or {}),
        "mark_paid_request": {
            **pending,
            "status": "rejected",
            "decided_by": str(user.id),
            "decided_at": _now().isoformat(),
            "reason": reason,
        },
    }
    await audit_log(
        db,
        actor=user,
        action="payment_order.mark_paid_reject",
        entity_type="payment_order",
        entity_id=order.id,
        before={"status": "pending"},
        after={"status": "rejected", "reason": reason},
        request=request,
    )
    await db.commit()
    return order


# =========================================================================== amount review (backlog #24)
async def review_amount_difference(
    db: AsyncSession, user: User, order_id: uuid.UUID, body: AmountReviewIn, request: Request | None = None
) -> PaymentOrder:
    """Finance decision on a held payment (see :func:`_hold_for_review`). Commits.

    * ``accept``: run the capture path with the received amount (booking credited pro rata, receipt,
      ``payment.captured``). Over-payments can then be partially refunded through the normal refund flow.
    * ``return``: refund the full received amount at the gateway (idempotent on ``rev-<payment_id>``); the
      payment becomes ``failed`` (``amount_mismatch_returned``) and nothing is posted to the ledger. An open
      order becomes ``failed`` so the payer can start a new one.

    SEC-007: a payment held because its booking/consultation can no longer take it can only be returned."""
    order = await _lock_order_with_target(db, order_id)
    payment = await _lock(db, Payment, body.payment_id)
    if payment is None or payment.order_id != order.id:
        raise NotFound("Payment not found")
    status = _review_status(payment)
    allowed = ("pending", "returning") if body.decision == "return" else ("pending",)
    if status not in allowed:
        raise BadRequest("This payment is not awaiting an amount review", code="no_pending_review")
    review = dict((payment.raw or {}).get("amount_review") or {})
    decided = {"decided_by": str(user.id), "decided_at": _now().isoformat(), "note": body.note}

    if body.decision == "accept":
        info = GatewayPaymentInfo(
            gateway_payment_id=payment.gateway_payment_id,
            status=GatewayPaymentStatus.CAPTURED,
            amount_minor=int(payment.amount_minor),
            currency=payment.currency,
            method=_value(payment.method) if payment.method is not None else None,
            fee_minor=int(payment.fee_minor),
            tax_minor=int(payment.tax_on_fee_minor),
            raw={**(payment.raw or {}), "amount_review": {**review, "status": "accepted", **decided}},
        )
        await capture_order(
            db,
            order.id,
            info,
            source="amount_review",
            actor=user,
            request=request,
            accept_amount_difference=True,
        )
        _set_review_pending(order, payment.id, False)
        await audit_log(
            db,
            actor=user,
            action="payment.amount_review_accept",
            entity_type="payment_order",
            entity_id=order.id,
            after={"payment_id": str(payment.id), "amount_minor": payment.amount_minor, "note": body.note},
            request=request,
        )
        await db.commit()
        return order

    # return: durable "returning" marker before the external call (retry-safe: the gateway refund is
    # idempotent on our refund id)
    payment.raw = {**(payment.raw or {}), "amount_review": {**review, "status": "returning", **decided}}
    await db.commit()
    payment_id, order_pk = payment.id, order.id
    adapter = get_gateway(payment.gateway)
    try:
        result = await adapter.refund(
            gateway_payment_id=payment.gateway_payment_id,
            amount_minor=int(payment.amount_minor),
            currency=payment.currency,
            refund_id=f"{REVIEW_RETURN_PREFIX}{payment_id}",
            reason="Amount differs from the order; returned in full",
        )
    except GatewayError as exc:
        logger.error("payments.amount_review_return_failed", payment_id=str(payment_id), error=str(exc))
        raise PaymentError("The provider could not return this payment, please retry", code=exc.code) from exc
    if result.status == GatewayRefundStatus.FAILED:
        raise PaymentError("The provider could not return this payment, please retry", code="refund_failed")

    order = await _lock_order(db, order_pk)
    payment = await _lock(db, Payment, payment_id)
    if payment is None:  # pragma: no cover - payments are never deleted
        raise NotFound("Payment not found")
    review = dict((payment.raw or {}).get("amount_review") or {})
    payment.status = PaymentStatus.FAILED
    payment.error_code = "amount_mismatch_returned"
    payment.error_description = "Captured amount differed from the order amount; returned in full"
    payment.raw = {
        **(payment.raw or {}),
        "amount_review": {**review, "status": "returned", "gateway_refund_id": result.gateway_refund_id},
    }
    _set_review_pending(order, payment.id, False)
    await audit_log(
        db,
        actor=user,
        action="payment.amount_review_return",
        entity_type="payment_order",
        entity_id=order.id,
        after={
            "payment_id": str(payment.id),
            "amount_minor": payment.amount_minor,
            "gateway_refund_id": result.gateway_refund_id,
            "note": body.note,
        },
        request=request,
    )
    if order.status in OPEN_ORDER_STATUSES:
        await fail_order(
            db,
            order.id,
            error_code="amount_mismatch",
            error_description="The amount received did not match the order and was returned",
            source="amount_review",
            actor=user,
        )
    await db.commit()
    return order


# ================================================================================================ webhooks
def _scrub(value: Any, depth: int = 0) -> Any:
    if depth > 12:
        return None
    if isinstance(value, dict):
        return {k: _scrub(v, depth + 1) for k, v in value.items() if k not in _SCRUB_KEYS}
    if isinstance(value, list):
        return [_scrub(v, depth + 1) for v in value]
    return value


async def _find_order_for_event(
    db: AsyncSession, gateway: PaymentGateway, ev: NormalizedEvent
) -> PaymentOrder | None:
    if ev.gateway_order_id:
        order = (
            await db.execute(
                select(PaymentOrder).where(
                    PaymentOrder.gateway == gateway, PaymentOrder.gateway_order_id == ev.gateway_order_id
                )
            )
        ).scalar_one_or_none()
        if order is not None:
            return order
    if ev.our_order_id:
        # SEC-006: ``our_order_id`` comes from payment notes, which the payer controls. It may only find an
        # order that was never created at the gateway; an order with a gateway order id must match by it.
        try:
            oid = uuid.UUID(ev.our_order_id)
        except ValueError:
            return None
        order = await db.get(PaymentOrder, oid)
        if order is not None and order.gateway == gateway and order.gateway_order_id is None:
            return order
    return None


async def _find_refund_for_event(db: AsyncSession, ev: NormalizedEvent) -> Refund | None:
    if ev.refund is None:
        return None
    if ev.refund.gateway_refund_id:
        refund = (
            await db.execute(select(Refund).where(Refund.gateway_refund_id == ev.refund.gateway_refund_id))
        ).scalar_one_or_none()
        if refund is not None:
            return refund
    notes = ev.refund.raw.get("notes") if isinstance(ev.refund.raw, dict) else None
    ours = notes.get("refund_id") if isinstance(notes, dict) else None
    if ours:
        try:
            refund = await db.get(Refund, uuid.UUID(str(ours)))
        except ValueError:
            refund = None
        if refund is not None:
            if not refund.gateway_refund_id and ev.refund.gateway_refund_id:
                refund.gateway_refund_id = ev.refund.gateway_refund_id
            return refund
    return None


def _is_review_return(ev: NormalizedEvent) -> bool:
    raw = ev.refund.raw if ev.refund is not None and isinstance(ev.refund.raw, dict) else {}
    for key in ("notes", "metadata"):
        bag = raw.get(key)
        if isinstance(bag, dict) and str(bag.get("refund_id") or "").startswith(REVIEW_RETURN_PREFIX):
            return True
    return False


async def apply_event(db: AsyncSession, gateway: PaymentGateway, ev: NormalizedEvent, *, source: str) -> None:
    """Apply one normalised gateway event. Raises ``UnmatchedEventError`` for unknown references."""
    if ev.kind == EventKind.IGNORED:
        return
    if ev.kind in (EventKind.PAYMENT_CAPTURED, EventKind.PAYMENT_FAILED, EventKind.PAYMENT_AUTHORIZED):
        order = await _find_order_for_event(db, gateway, ev)
        if order is None or ev.payment is None:
            raise UnmatchedEventError("No matching payment order")
        if ev.kind == EventKind.PAYMENT_CAPTURED:
            await capture_order(db, order.id, ev.payment, source=source)
        elif ev.kind == EventKind.PAYMENT_FAILED:
            await fail_order(
                db,
                order.id,
                info=ev.payment,
                error_code=ev.error_code,
                error_description=ev.error_description,
                source=source,
            )
        else:
            await _apply_payment_info(db, order, ev.payment, source=source, actor=None)
        return
    if ev.kind in (EventKind.REFUND_PROCESSED, EventKind.REFUND_FAILED):
        refund = await _find_refund_for_event(db, ev)
        if refund is None and _is_review_return(ev):
            return  # full return of a payment held for amount review (never booked; nothing to finalise)
        if refund is None:
            raise UnmatchedEventError("No matching refund")
        if ev.kind == EventKind.REFUND_PROCESSED:
            await finalize_refund(db, refund.id)
        else:
            locked = await _lock(db, Refund, refund.id)
            if locked is not None and locked.status not in (RefundStatus.PROCESSED, RefundStatus.REJECTED):
                locked.status = RefundStatus.FAILED
                await audit_log(
                    db,
                    actor=None,
                    action="refund.failed",
                    entity_type="refund",
                    entity_id=locked.id,
                    after={"source": source},
                )


async def process_webhook_event(db: AsyncSession, webhook_event_id: uuid.UUID) -> None:
    """(Re)process a stored, signature-verified webhook event. Does not commit."""
    event = await _lock(db, WebhookEvent, webhook_event_id)
    if event is None or event.processed_at is not None or not event.signature_valid:
        return
    gateway = PaymentGateway(event.gateway)
    adapter = get_gateway(gateway)
    raw = json.dumps(event.payload).encode()
    parsed = adapter.parse_webhook(raw, {"x-razorpay-event-id": event.event_id})
    try:
        for ev in parsed.events:
            await apply_event(db, gateway, ev, source=f"webhook:{event.event_type}")
    except UnmatchedEventError as exc:
        logger.warning("payments.webhook_unmatched", event_id=event.event_id, error=str(exc))
        event.processing_error = str(exc)[:1000]
    else:
        event.processing_error = None
    event.processed_at = _now()


async def handle_webhook(
    db: AsyncSession, gateway_name: PaymentGateway, raw_body: bytes, headers: Mapping[str, str]
) -> dict[str, Any]:
    """Verify (raw body) -> store durably -> process. Commits. Raises ``BadRequest`` on a bad signature."""
    if not is_gateway_enabled(gateway_name) or gateway_name not in (
        PaymentGateway.RAZORPAY,
        PaymentGateway.STRIPE,
    ):
        raise NotFound("Unknown webhook endpoint")
    adapter = get_gateway(gateway_name)
    if not getattr(adapter, "webhook_secret", ""):
        raise BadRequest("Webhook is not configured", code="webhook_not_configured")
    if len(raw_body) > MAX_WEBHOOK_BYTES:
        raise BadRequest("Webhook body too large", code="payload_too_large")

    if not adapter.verify_webhook(raw_body, headers):
        # SEC-046: unverified requests are never written to the database (anyone can send them, so storing
        # them grows the table without bound); they are counted and logged, with an alert on bursts.
        failures, _ = await count_hits("payments.webhook_invalid", gateway_name.value, 3600)
        log = logger.error if failures in (50, 500, 5000) else logger.warning
        log(
            "payments.webhook_invalid_signature",
            gateway=gateway_name.value,
            sha256=hashlib.sha256(raw_body).hexdigest(),
            size=len(raw_body),
            failures_this_hour=failures,
        )
        raise BadRequest("Invalid webhook signature", code="invalid_signature")

    try:
        parsed = adapter.parse_webhook(raw_body, headers)
    except GatewayError as exc:
        raise BadRequest("Malformed webhook payload", code="malformed_webhook") from exc

    stmt = (
        pg_insert(WebhookEvent)
        .values(
            id=uuid7(),
            gateway=gateway_name,
            event_id=parsed.event_id,
            event_type=parsed.event_type,
            signature_valid=True,
            payload=_scrub(parsed.payload),
            received_at=_now(),
        )
        .on_conflict_do_nothing(index_elements=["gateway", "event_id"])
        .returning(WebhookEvent.id)
    )
    event_id = (await db.execute(stmt)).scalar_one_or_none()
    await db.commit()  # durable before any processing / 2xx
    if event_id is None:
        return {"status": "duplicate", "event_id": parsed.event_id}

    try:
        await process_webhook_event(db, event_id)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.exception("payments.webhook_processing_failed", event_id=parsed.event_id)
        await db.execute(
            update(WebhookEvent)
            .where(WebhookEvent.id == event_id)
            .values(processing_error=f"{type(exc).__name__}: {str(exc)[:900]}")
        )
        await enqueue(
            db, "payments.process_webhook", {"webhook_event_id": str(event_id)}, dedupe_key=f"wh:{event_id}"
        )
        await db.commit()
        return {"status": "error", "event_id": parsed.event_id}
    return {"status": "processed", "event_id": parsed.event_id}


async def complete_mock_order(
    db: AsyncSession, user: User, order_id: uuid.UUID, outcome: str, request: Request | None = None
) -> PaymentOrder:
    """Simulate the gateway webhook for a mock order through the same event path. Commits."""
    if settings.is_production or not is_gateway_enabled(PaymentGateway.MOCK):
        raise NotFound("Not found")
    order = await _get_actionable_order(db, user, order_id)
    if order.gateway != PaymentGateway.MOCK:
        raise BadRequest("Only mock orders can be completed here", code="not_mock_order")
    success = outcome == "success"
    payment_id = f"mock_pay_{order.id.hex}" if success else f"mock_fail_{uuid7().hex}"
    info = GatewayPaymentInfo(
        gateway_payment_id=payment_id,
        status=GatewayPaymentStatus.CAPTURED if success else GatewayPaymentStatus.FAILED,
        amount_minor=order.amount_minor,
        currency=order.currency,
        gateway_order_id=order.gateway_order_id,
        method=PaymentMethod.MOCK.value,
        error_code=None if success else "mock_declined",
        error_description=None if success else "Simulated failure",
        raw={"mock": True},
    )
    event_type = "payment.captured" if success else "payment.failed"
    ev = NormalizedEvent(
        event_id=f"mock:{payment_id}",
        event_type=event_type,
        kind=EventKind.PAYMENT_CAPTURED if success else EventKind.PAYMENT_FAILED,
        gateway_order_id=order.gateway_order_id,
        our_order_id=str(order.id),
        payment=info,
        error_code=info.error_code,
        error_description=info.error_description,
    )
    inserted = (
        await db.execute(
            pg_insert(WebhookEvent)
            .values(
                id=uuid7(),
                gateway=PaymentGateway.MOCK,
                event_id=ev.event_id,
                event_type=event_type,
                signature_valid=True,
                payload={"order_id": str(order.id), "outcome": outcome, "by": str(user.id)},
                received_at=_now(),
            )
            .on_conflict_do_nothing(index_elements=["gateway", "event_id"])
            .returning(WebhookEvent.id)
        )
    ).scalar_one_or_none()
    if inserted is not None:
        await apply_event(db, PaymentGateway.MOCK, ev, source="mock")
        await db.execute(update(WebhookEvent).where(WebhookEvent.id == inserted).values(processed_at=_now()))
    await db.commit()
    return await db.get(PaymentOrder, order.id, populate_existing=True) or order


# ================================================================================================ refunds
@dataclass(slots=True)
class _RefundTotals:
    amount_minor: int
    base_amount_minor: int


async def _refund_totals(db: AsyncSession, payment_id: uuid.UUID) -> _RefundTotals:
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Refund.amount_minor), 0),
                func.coalesce(func.sum(Refund.base_amount_minor), 0),
            ).where(Refund.payment_id == payment_id, Refund.status.in_(COMMITTED_REFUND_STATUSES))
        )
    ).one()
    return _RefundTotals(int(row[0]), int(row[1]))


async def refundable_minor(db: AsyncSession, payment: Payment) -> int:
    """Captured minus refunded minus refunds already in flight (payment currency)."""
    if payment.status not in REFUNDABLE_PAYMENT_STATUSES:
        return 0
    totals = await _refund_totals(db, payment.id)
    return max(int(payment.amount_minor) - totals.amount_minor, 0)


async def _new_refund(
    db: AsyncSession,
    payment: Payment,
    order: PaymentOrder,
    amount_minor: int,
    *,
    reason: str,
    status: RefundStatus,
    requested_by: uuid.UUID | None,
    approved_by: uuid.UUID | None = None,
    base_amount_minor: int | None = None,
) -> Refund:
    """Validate against the refundable amount and add a refund. ``base_amount_minor`` overrides the
    proportional INR amount (used when the refund was computed in INR, e.g. cancellation refunds)."""
    totals = await _refund_totals(db, payment.id)
    remaining_amount = int(payment.amount_minor) - totals.amount_minor
    remaining_base = int(payment.base_amount_minor) - totals.base_amount_minor
    if amount_minor <= 0 or amount_minor > remaining_amount:
        raise BadRequest(
            "Refund amount exceeds the refundable amount",
            code="refund_exceeds_refundable",
            details={"refundable_minor": max(remaining_amount, 0), "currency": payment.currency},
        )
    if amount_minor == remaining_amount:
        base = max(remaining_base, 0)
    elif base_amount_minor is not None:
        base = min(max(int(base_amount_minor), 0), max(remaining_base, 0))
    else:
        base = min(
            _ratio(payment.base_amount_minor, amount_minor, payment.amount_minor), max(remaining_base, 0)
        )
    refund = Refund(
        payment_id=payment.id,
        order_id=order.id,
        booking_id=order.booking_id,
        amount_minor=amount_minor,
        currency=payment.currency,
        base_amount_minor=base,
        reason=reason,
        status=status,
        requested_by=requested_by,
        approved_by=approved_by,
    )
    db.add(refund)
    await db.flush()
    return refund


async def create_refund(
    db: AsyncSession, user: User, body: RefundCreate, request: Request | None = None
) -> Refund:
    """Finance/admin refund request (status ``requested``; finance approves). Commits."""
    payment: Payment | None = None
    if body.payment_id is not None:
        payment = await _lock(db, Payment, body.payment_id)
        if payment is None or (body.order_id is not None and payment.order_id != body.order_id):
            raise NotFound("Payment not found")
    else:
        candidates = (
            (
                await db.execute(
                    select(Payment)
                    .where(Payment.order_id == body.order_id, Payment.status.in_(REFUNDABLE_PAYMENT_STATUSES))
                    .order_by(Payment.captured_at.desc().nulls_last(), Payment.id.desc())
                )
            )
            .scalars()
            .all()
        )
        if not candidates:
            if await db.get(PaymentOrder, body.order_id) is None:
                raise NotFound("Payment order not found")
            raise BadRequest("This order has no refundable payment", code="payment_not_refundable")
        for candidate in candidates:
            if await refundable_minor(db, candidate) >= body.amount_minor:
                payment = candidate
                break
        payment = await _lock(db, Payment, (payment or candidates[0]).id)
    if payment is None:
        raise NotFound("Payment not found")
    if payment.status not in REFUNDABLE_PAYMENT_STATUSES:
        raise BadRequest("This payment cannot be refunded", code="payment_not_refundable")
    order = await db.get(PaymentOrder, payment.order_id)
    if order is None:
        raise NotFound("Payment order not found")
    refund = await _new_refund(
        db,
        payment,
        order,
        body.amount_minor,
        reason=body.reason,
        status=RefundStatus.REQUESTED,
        requested_by=user.id,
    )
    await audit_log(
        db,
        actor=user,
        action="refund.create",
        entity_type="refund",
        entity_id=refund.id,
        after={
            "payment_id": str(payment.id),
            "amount_minor": refund.amount_minor,
            "currency": refund.currency,
            "reason": body.reason,
        },
        request=request,
    )
    await db.commit()
    return refund


async def approve_refund(
    db: AsyncSession, user: User, refund_id: uuid.UUID, request: Request | None = None
) -> Refund:
    refund = await _lock(db, Refund, refund_id)
    if refund is None:
        raise NotFound("Refund not found")
    if refund.status != RefundStatus.REQUESTED:
        raise BadRequest("Only requested refunds can be approved", code="invalid_refund_state")
    # SEC-057: the setting may only TIGHTEN the control (one finance user could otherwise raise it with a
    # single settings call), and self-approved refunds of the last 24 h count together so a large refund
    # cannot be split into pieces below the threshold.
    threshold = min(
        await _int_setting(db, REFUND_DUAL_APPROVAL_SETTING, DEFAULT_REFUND_DUAL_APPROVAL_MINOR),
        DEFAULT_REFUND_DUAL_APPROVAL_MINOR,
    )
    self_approved = 0
    if refund.requested_by == user.id:
        self_approved = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(Refund.base_amount_minor), 0)).where(
                        Refund.id != refund.id,
                        Refund.requested_by == user.id,
                        Refund.approved_by == user.id,
                        Refund.status.in_(COMMITTED_REFUND_STATUSES),
                        Refund.created_at >= _now() - timedelta(hours=24),
                    )
                )
            ).scalar_one()
        )
    if refund.requested_by == user.id and self_approved + int(refund.base_amount_minor) > threshold:
        raise Forbidden(
            "A refund of this size must be approved by a different finance user",
            code="second_approver_required",
            details={"threshold_minor": threshold, "currency": BASE_CURRENCY},
        )
    refund.status = RefundStatus.APPROVED
    refund.approved_by = user.id
    await enqueue(
        db, "payments.process_refund", {"refund_id": str(refund.id)}, dedupe_key=f"refund:{refund.id}"
    )
    await audit_log(
        db,
        actor=user,
        action="refund.approve",
        entity_type="refund",
        entity_id=refund.id,
        before={"status": RefundStatus.REQUESTED.value},
        after={"status": RefundStatus.APPROVED.value},
        request=request,
    )
    await db.commit()
    return refund


async def reject_refund(
    db: AsyncSession, user: User, refund_id: uuid.UUID, reason: str, request: Request | None = None
) -> Refund:
    refund = await _lock(db, Refund, refund_id)
    if refund is None:
        raise NotFound("Refund not found")
    if refund.status != RefundStatus.REQUESTED:
        raise BadRequest("Only requested refunds can be rejected", code="invalid_refund_state")
    refund.status = RefundStatus.REJECTED
    refund.approved_by = user.id
    await audit_log(
        db,
        actor=user,
        action="refund.reject",
        entity_type="refund",
        entity_id=refund.id,
        before={"status": RefundStatus.REQUESTED.value},
        after={"status": RefundStatus.REJECTED.value, "reason": reason},
        request=request,
    )
    await db.commit()
    return refund


async def process_refund(db: AsyncSession, refund_id: uuid.UUID) -> None:
    """Job body: send an approved refund to the gateway. Safe to retry (gateway idempotency / lookup)."""
    refund = await _lock(db, Refund, refund_id)
    if refund is None or refund.status not in (RefundStatus.APPROVED, RefundStatus.PROCESSING):
        return
    if refund.gateway_refund_id:
        return  # waiting for the gateway webhook
    payment = await db.get(Payment, refund.payment_id)
    if payment is None:
        return
    refund.status = RefundStatus.PROCESSING
    await db.commit()  # durable "in flight" marker before the external call

    adapter = get_gateway(payment.gateway)
    try:
        result = await adapter.refund(
            gateway_payment_id=payment.gateway_payment_id,
            amount_minor=refund.amount_minor,
            currency=refund.currency,
            refund_id=str(refund.id),
            reason=refund.reason,
        )
    except GatewayError as exc:
        if exc.retryable:
            raise
        refund = await _lock(db, Refund, refund_id)
        if refund is not None:
            refund.status = RefundStatus.FAILED
            await audit_log(
                db,
                actor=None,
                action="refund.failed",
                entity_type="refund",
                entity_id=refund.id,
                after={"error": str(exc)[:300]},
            )
        return
    refund = await _lock(db, Refund, refund_id)
    if refund is None:
        return
    if not refund.gateway_refund_id:
        refund.gateway_refund_id = result.gateway_refund_id or None
    if result.status == GatewayRefundStatus.PROCESSED:
        await finalize_refund(db, refund.id)
    elif result.status == GatewayRefundStatus.FAILED and refund.status != RefundStatus.PROCESSED:
        refund.status = RefundStatus.FAILED
        await audit_log(
            db, actor=None, action="refund.failed", entity_type="refund", entity_id=refund.id, after=None
        )


async def finalize_refund(db: AsyncSession, refund_id: uuid.UUID) -> Refund | None:
    """Mark a refund processed, update payment/order refund state and publish ``refund.processed``.
    Idempotent. Does not commit."""
    refund = await db.get(Refund, refund_id)
    if refund is None:
        return None
    order = await _lock_order(db, refund.order_id)
    refund = await _lock(db, Refund, refund_id)
    if refund is None or refund.status == RefundStatus.PROCESSED:
        return refund
    if refund.status == RefundStatus.REJECTED:
        return refund
    payment = await _lock(db, Payment, refund.payment_id)
    if payment is None:
        return refund
    now = _now()
    refund.status = RefundStatus.PROCESSED
    refund.processed_at = now
    payment.amount_refunded_minor = min(
        int(payment.amount_refunded_minor) + int(refund.amount_minor), int(payment.amount_minor)
    )
    payment.status = (
        PaymentStatus.REFUNDED
        if payment.amount_refunded_minor >= payment.amount_minor
        else PaymentStatus.PARTIALLY_REFUNDED
    )
    await db.flush()
    totals = (
        await db.execute(
            select(
                func.coalesce(func.sum(Payment.amount_minor), 0),
                func.coalesce(func.sum(Payment.amount_refunded_minor), 0),
            ).where(Payment.order_id == order.id, Payment.status.in_(SETTLED_PAYMENT_STATUSES))
        )
    ).one()
    captured, refunded = int(totals[0]), int(totals[1])
    if order.status in PAID_ORDER_STATUSES and refunded > 0:
        order.status = OrderStatus.REFUNDED if refunded >= captured else OrderStatus.PARTIALLY_REFUNDED

    booking_amount, booking_ccy = order_booking_amount(order)
    if booking_ccy == order.base_currency:
        refund_booking_amount = int(refund.base_amount_minor)
    else:
        refund_booking_amount = (
            _ratio(booking_amount, refund.amount_minor, order.amount_minor) if order.amount_minor else 0
        )
    await audit_log(
        db,
        actor=None,
        action="refund.processed",
        entity_type="refund",
        entity_id=refund.id,
        after={
            "amount_minor": refund.amount_minor,
            "currency": refund.currency,
            "base_amount_minor": refund.base_amount_minor,
            "gateway_refund_id": refund.gateway_refund_id,
        },
    )
    await publish(
        db,
        "refund.processed",
        {
            "refund_id": str(refund.id),
            "payment_id": str(payment.id),
            "order_id": str(order.id),
            "booking_id": str(refund.booking_id) if refund.booking_id else None,
            "amount_minor": int(refund.amount_minor),
            "currency": refund.currency,
            "base_amount_minor": int(refund.base_amount_minor),
            "base_currency": order.base_currency,
            "booking_amount_minor": refund_booking_amount,
            "booking_currency": booking_ccy,
            "gateway": _value(payment.gateway),
        },
    )
    return refund


# ================================================================================================ handlers
async def create_cancellation_refunds(
    db: AsyncSession,
    booking_id: uuid.UUID,
    refundable_booking_minor: int,
    reason: str | None,
    *,
    requested_by: uuid.UUID | None = None,
) -> list[Refund]:
    """``booking.cancelled``: cancel open orders/installments and create auto-approved system refunds for
    ``refundable_booking_minor`` (booking currency), newest captured payments first. Idempotent.
    Runs inside the publisher's transaction: no external calls (processing is enqueued).

    SEC-059: when staff cancelled as the platform/hospital (``requested_by`` = that user), the refunds
    are created ``requested`` instead and go through ``approve_refund`` (second-approver rule)."""
    booking = await db.get(Booking, booking_id)
    if booking is None:
        return []
    open_orders = (
        (
            await db.execute(
                select(PaymentOrder)
                .where(PaymentOrder.booking_id == booking_id, PaymentOrder.status.in_(OPEN_ORDER_STATUSES))
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    for order in open_orders:
        order.status = OrderStatus.CANCELLED
    await db.execute(
        update(Installment)
        .where(
            Installment.booking_id == booking_id,
            Installment.status.in_([InstallmentStatus.DUE, InstallmentStatus.OVERDUE]),
        )
        .values(status=InstallmentStatus.CANCELLED)
        .execution_options(synchronize_session=False)
    )

    remaining = int(refundable_booking_minor or 0)
    if remaining <= 0:
        return []
    already = (
        await db.execute(
            select(func.count())
            .select_from(Refund)
            .where(
                Refund.booking_id == booking_id,
                Refund.requested_by.is_(None)
                if requested_by is None
                else Refund.requested_by == requested_by,
                Refund.reason.like(f"{CANCELLATION_REFUND_PREFIX}%"),
            )
        )
    ).scalar_one()
    if already:
        return []

    rows = (
        await db.execute(
            select(Payment, PaymentOrder)
            .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
            .where(PaymentOrder.booking_id == booking_id, Payment.status.in_(REFUNDABLE_PAYMENT_STATUSES))
            .order_by(Payment.captured_at.desc().nulls_last(), Payment.id.desc())
        )
    ).all()
    label = f"{CANCELLATION_REFUND_PREFIX}: {reason}" if reason else CANCELLATION_REFUND_PREFIX
    created: list[Refund] = []
    for payment, order in rows:
        if remaining <= 0:
            break
        available = await refundable_minor(db, payment)
        if available <= 0:
            continue
        order_booking_total, _ = order_booking_amount(order, booking.currency)
        available_booking = _ratio(order_booking_total, available, order.amount_minor)
        if available_booking <= 0:
            continue
        if remaining >= available_booking:
            amount, used = available, available_booking
        else:
            amount = min(available, _ratio(order.amount_minor, remaining, order_booking_total))
            used = remaining
        if amount <= 0:
            break
        exact_base = used if booking.currency == order.base_currency else None
        refund = await _new_refund(
            db,
            payment,
            order,
            amount,
            reason=label[:1000],
            status=RefundStatus.APPROVED if requested_by is None else RefundStatus.REQUESTED,
            requested_by=requested_by,
            base_amount_minor=exact_base,
        )
        if requested_by is None:
            await enqueue(
                db, "payments.process_refund", {"refund_id": str(refund.id)}, dedupe_key=f"refund:{refund.id}"
            )
        await audit_log(
            db,
            actor=None,
            action="refund.auto_create" if requested_by is None else "refund.cancellation_request",
            entity_type="refund",
            entity_id=refund.id,
            after={
                "booking_id": str(booking_id),
                "amount_minor": amount,
                "currency": refund.currency,
                "status": RefundStatus(refund.status).value,
                "requested_by": str(requested_by) if requested_by else None,
            },
        )
        created.append(refund)
        remaining -= used
    return created


def add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    days_in_month = [31, 29 if _leap(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(start.day, days_in_month))


def _leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def installment_plan(
    total_minor: int, deposit_minor: int, months: int, start: date
) -> list[tuple[date, int]]:
    """First row = deposit due ``start``; the rest split equally monthly; the last absorbs rounding."""
    plan: list[tuple[date, int]] = []
    deposit = max(min(int(deposit_minor), int(total_minor)), 0)
    if deposit > 0:
        plan.append((start, deposit))
    remaining = int(total_minor) - deposit
    months = max(int(months), 1)
    if remaining > 0:
        part = remaining // months
        for k in range(1, months + 1):
            amount = part if k < months else remaining - part * (months - 1)
            if amount > 0:
                plan.append((add_months(start, k), amount))
    return plan


async def create_installment_schedule(db: AsyncSession, booking_id: uuid.UUID) -> int:
    """``booking.created``: installment rows for ``payment_option=installments``. Idempotent."""
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.payment_option != PaymentOption.INSTALLMENTS:
        return 0
    exists = (
        await db.execute(
            select(func.count()).select_from(Installment).where(Installment.booking_id == booking_id)
        )
    ).scalar_one()
    if exists:
        return 0
    plan = installment_plan(
        booking.total_minor, booking.deposit_minor, booking.installment_months or 1, datetime.now(UTC).date()
    )
    if not plan:
        return 0
    stmt = (
        pg_insert(Installment)
        .values(
            [
                {
                    "id": uuid7(),
                    "booking_id": booking_id,
                    "seq": seq,
                    "due_date": due,
                    "amount_minor": amount,
                    "currency": booking.currency,
                    "status": InstallmentStatus.DUE,
                }
                for seq, (due, amount) in enumerate(plan, start=1)
            ]
        )
        .on_conflict_do_nothing(index_elements=["booking_id", "seq"])
    )
    await db.execute(stmt)
    return len(plan)


# ================================================================================================ periodic
async def expire_stale_orders(db: AsyncSession, now: datetime | None = None) -> int:
    """``created`` orders past ``expires_at`` become ``expired`` (a later capture is still accepted)."""
    result = await db.execute(
        update(PaymentOrder)
        .where(
            PaymentOrder.status == OrderStatus.CREATED,
            PaymentOrder.expires_at.is_not(None),
            PaymentOrder.expires_at < (now or _now()),
        )
        .values(status=OrderStatus.EXPIRED)
        .execution_options(synchronize_session=False)
    )
    return int(getattr(result, "rowcount", 0) or 0)


async def mark_overdue_installments(db: AsyncSession, today: date | None = None) -> int:
    result = await db.execute(
        update(Installment)
        .where(Installment.status == InstallmentStatus.DUE, Installment.due_date < (today or _now().date()))
        .values(status=InstallmentStatus.OVERDUE)
        .execution_options(synchronize_session=False)
    )
    return int(getattr(result, "rowcount", 0) or 0)


OVERDUE_REMINDER_EVERY_DAYS = 7


async def publish_installment_reminders(db: AsyncSession, today: date | None = None) -> int:
    """Periodic (CG-30): ``installment.due`` when an open instalment is due in exactly
    ``installment_reminder_days`` days or today, and ``installment.overdue`` the day after its due date and
    then every 7 days while unpaid. Payloads carry ``day`` so subscribers dedupe per instalment per day."""
    day = today or _now().date()
    lead = int(await get_setting(db, "installment_reminder_days", 3) or 0)
    rows = (
        await db.execute(
            select(Installment.id, Installment.booking_id, Installment.due_date, Installment.status).where(
                Installment.status.in_([InstallmentStatus.DUE, InstallmentStatus.OVERDUE])
            )
        )
    ).all()
    published = 0
    for installment_id, booking_id, due_date, status in rows:
        payload = {
            "installment_id": str(installment_id),
            "booking_id": str(booking_id),
            "due_date": due_date.isoformat(),
            "day": day.isoformat(),
        }
        days_left = (due_date - day).days
        if days_left >= 0:
            if InstallmentStatus(status) == InstallmentStatus.DUE and (
                days_left == 0 or (lead > 0 and days_left == lead)
            ):
                await publish(db, "installment.due", {**payload, "days_left": days_left})
                published += 1
        elif (-days_left - 1) % OVERDUE_REMINDER_EVERY_DAYS == 0:
            await publish(db, "installment.overdue", {**payload, "days_overdue": -days_left})
            published += 1
    return published


# ================================================================================================ queries
def _proof_document_id(order: PaymentOrder) -> uuid.UUID | None:
    proof = (order.meta or {}).get("bank_transfer_proof")
    if not isinstance(proof, dict) or not proof.get("document_id"):
        return None
    try:
        return uuid.UUID(str(proof["document_id"]))
    except ValueError:
        return None


async def bank_transfer_proof_documents(db: AsyncSession, order: PaymentOrder) -> list[Document]:
    """Proof-of-payment documents finance should check for ``order`` (newest first): the document submitted
    with ``POST .../bank-transfer-proof`` plus ``payment_proof`` uploads for the order's case, or for its
    patient without a case, made since the order was created - so a receipt uploaded without ``case_id`` (or
    never submitted against the order) still shows. Proofs already submitted against another order are
    excluded."""
    linked_id = _proof_document_id(order)
    others = (
        await db.execute(
            select(PaymentOrder).where(
                PaymentOrder.patient_id == order.patient_id,
                PaymentOrder.id != order.id,
                PaymentOrder.gateway == PaymentGateway.BANK_TRANSFER,
            )
        )
    ).scalars()
    claimed = {doc_id for o in others if (doc_id := _proof_document_id(o)) is not None} - {linked_id}
    scope = and_(Document.patient_id == order.patient_id, Document.case_id.is_(None))
    if order.case_id is not None:
        scope = or_(Document.case_id == order.case_id, scope)
    match = and_(Document.kind == DocumentKind.PAYMENT_PROOF, Document.created_at >= order.created_at, scope)
    if claimed:
        match = and_(match, Document.id.not_in(claimed))
    if linked_id is not None:
        match = or_(Document.id == linked_id, match)
    stmt = (
        select(Document)
        .where(Document.deleted_at.is_(None), match)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .limit(20)
    )
    return list((await db.execute(stmt)).scalars().all())


async def order_detail(db: AsyncSession, order: PaymentOrder, *, staff: bool = False) -> dict[str, Any]:
    payments = (
        (await db.execute(select(Payment).where(Payment.order_id == order.id).order_by(Payment.created_at)))
        .scalars()
        .all()
    )
    refunds = (
        (await db.execute(select(Refund).where(Refund.order_id == order.id).order_by(Refund.created_at)))
        .scalars()
        .all()
    )
    proof = (order.meta or {}).get("bank_transfer_proof")
    data = PaymentOrderOut.model_validate(order).model_dump()
    data["payments"] = [PaymentOut.model_validate(p) for p in payments]
    data["refunds"] = [RefundOut.model_validate(r) for r in refunds]
    data["bank_transfer_proof"] = (
        {k: proof.get(k) for k in ("document_id", "reference", "submitted_at")} if proof else None
    )
    if staff:
        request = (order.meta or {}).get("mark_paid_request")
        data["mark_paid_request"] = request if isinstance(request, dict) else None
        data["amount_reviews"] = [
            {**(p.raw or {})["amount_review"], "payment_id": p.id} for p in payments if _review_status(p)
        ]
    return data


def order_filters(
    *,
    status: OrderStatus | None,
    booking_id: uuid.UUID | None,
    gateway: PaymentGateway | None,
    purpose: PaymentPurpose | None,
    q: str | None,
    review: str | None = None,
) -> list[Any]:
    clauses: list[Any] = []
    if review == "amount":
        clauses.append(func.jsonb_array_length(PaymentOrder.meta[REVIEW_PENDING_KEY]) > 0)
    elif review == "mark_paid":
        clauses.append(PaymentOrder.meta["mark_paid_request"]["status"].astext == "pending")
    if status is not None:
        clauses.append(PaymentOrder.status == status)
    if booking_id is not None:
        clauses.append(PaymentOrder.booking_id == booking_id)
    if gateway is not None:
        clauses.append(PaymentOrder.gateway == gateway)
    if purpose is not None:
        clauses.append(PaymentOrder.purpose == purpose)
    if q:
        term = q.strip()[:64]
        clauses.append(
            or_(PaymentOrder.order_number.ilike(f"%{term}%"), PaymentOrder.gateway_order_id == term)
        )
    return clauses


async def refund_dual_approval_threshold(db: AsyncSession) -> int:
    """Effective dual-approval threshold (INR minor): the setting may only tighten the default (SEC-057)."""
    return min(
        await _int_setting(db, REFUND_DUAL_APPROVAL_SETTING, DEFAULT_REFUND_DUAL_APPROVAL_MINOR),
        DEFAULT_REFUND_DUAL_APPROVAL_MINOR,
    )
