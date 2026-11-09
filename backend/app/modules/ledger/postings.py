"""Money-flow postings (PLAN 6.4). Every function is idempotent (deterministic idempotency keys) and never
commits - callers (event handlers, tasks) own the transaction.

Idempotency keys
* ``capture:<payment_id>``                    Dr GATEWAY:<gw>:RECEIVABLE / Cr PLATFORM:PATIENT_ESCROW
* ``gateway_fee:<payment_id>``                Dr EXPENSE:GATEWAY_FEES / Cr GATEWAY:<gw>:RECEIVABLE
* ``recognize:<booking_id>:<n>``              revenue recognition #n (1 at completion, 2.. late payments)
* ``agent_commission:<booking_id>:<n>``       agent commission for recognition #n
* ``reverse:<refund_id>``                     proportional reversal of recognition (refund after completion)
* ``agent_commission_reversal:<refund_id>``   proportional reversal of agent commission
* ``refund:<refund_id>``                      Dr PLATFORM:PATIENT_ESCROW / Cr GATEWAY:<gw>:RECEIVABLE
* ``payout:<payout_id>`` / ``payout_reversal:<payout_id>``   Dr payee PAYABLE / Cr PLATFORM:BANK (and back)
* ``sweep:<payment_id>``                      Dr PLATFORM:BANK / Cr GATEWAY:<gw>:RECEIVABLE (T+2 settlement)
* ``retain:<booking_id>``                     cancellation retention: Dr PLATFORM:PATIENT_ESCROW / Cr
                                              hospital payable + commission + GST + TDS (hospital share, as H)
                                              and Cr PLATFORM:CANCELLATION_REVENUE (platform share)

Agent commission withholding: resident agents (``agents.country`` IN or unknown) have TDS (s.194H, setting
``agent_tds_rate_bps``, default 200) credited to ``TAX:TDS_194H``; non-resident agents have the withholding
set by finance (``agent_nonresident_withholding_bps``, default 0, CA/DTAA advice) credited to
``TAX:TDS_195``. The agent payable is the commission net of withholding. GST on foreign agents' commission
(reverse charge on an import of services, or none for an intermediary located abroad) needs a CA
determination and is not posted; the transaction description carries a note.

Booking-scoped transactions (recognition, reversal, agent commission) carry ``reference_type="booking"`` so
that the booking's recognised amounts can be recomputed from the ledger at any time. A booking's *escrow
balance* is the escrow movement of its payments' captures, its refunds and its recognitions; recognition
always releases exactly that balance, which makes repeated or late recognitions incremental and idempotent.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import structlog
from sqlalchemy import Select, String, and_, case, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    BookingStatus,
    EntryDirection,
    LedgerTxnType,
    PaymentGateway,
    PaymentStatus,
    RefundStatus,
)
from app.core.money import apply_bps, round_half_up
from app.core.settings_store import get_setting
from app.models.agents import Agent
from app.models.cases import Booking, Case
from app.models.ledger import LedgerAccount, LedgerEntry, LedgerTransaction
from app.models.payments import Payment, PaymentOrder, Refund
from app.models.settlements import Payout
from app.modules.ledger.service import (
    AGENT_COMMISSION_EXPENSE,
    BANK,
    CANCELLATION_REVENUE,
    COMMISSION_REVENUE,
    ESCROW,
    GATEWAY_FEES,
    GST_OUTPUT,
    SERVICE_FEE_REVENUE,
    TDS_194H,
    TDS_194O,
    TDS_195,
    balanced_lines,
    gateway_receivable,
    get_transaction_by_key,
    payee_payable,
    post_transaction,
)

logger = structlog.get_logger(__name__)

CAPTURED_STATUSES = (
    PaymentStatus.CAPTURED,
    PaymentStatus.REFUNDED,
    PaymentStatus.PARTIALLY_REFUNDED,
)
SWEEP_DELAY = timedelta(days=2)
SWEEP_LOOKBACK = timedelta(days=90)
IMMEDIATE_SWEEP_GATEWAYS = frozenset({PaymentGateway.BANK_TRANSFER.value})
OPEN_REFUND_STATUSES = (RefundStatus.REQUESTED, RefundStatus.APPROVED, RefundStatus.PROCESSING)

# Fallbacks only: the defaults live in app.core.settings_store.DEFAULTS (finance keys; not in PLAN 6.3).
DEFAULT_AGENT_TDS_BPS = 200  # s.194H (1961 Act numbering): 2 % from 1 Oct 2024
DEFAULT_AGENT_NONRESIDENT_WITHHOLDING_BPS = 0
DEFAULT_RETENTION_HOSPITAL_SHARE_BPS = 10_000  # hospital agreement Schedule A, Option A
FOREIGN_AGENT_GST_NOTE = (
    "GST on non-resident agent commission (reverse charge / intermediary) is not posted: CA review"
)


def _v(value: object) -> str:
    return str(getattr(value, "value", value))


def _uuid(value: object) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _now() -> datetime:
    return datetime.now(UTC)


# ================================================================================================ capture
async def post_gateway_fee(db: AsyncSession, payment: Payment) -> LedgerTransaction | None:
    """Gateway fee (INR, tax included) charged on a captured payment: Dr fees / Cr receivable."""
    fee = int(payment.fee_minor or 0)
    if fee <= 0:
        return None
    return await post_transaction(
        db,
        txn_type=LedgerTxnType.GATEWAY_FEE,
        reference_type="payment",
        reference_id=payment.id,
        idempotency_key=f"gateway_fee:{payment.id}",
        description=f"Gateway fee on payment {payment.gateway_payment_id}",
        entries=[(GATEWAY_FEES, "debit", fee), (gateway_receivable(_v(payment.gateway)), "credit", fee)],
    )


async def post_capture(
    db: AsyncSession, payment_id: uuid.UUID | str, *, base_amount_minor: int | None = None
) -> LedgerTransaction | None:
    """Capture posting (step 1) for a payment plus its gateway fee when known."""
    payment = await db.get(Payment, _uuid(payment_id))
    if payment is None:
        logger.warning("ledger.capture.payment_missing", payment_id=str(payment_id))
        return None
    amount = int(payment.base_amount_minor or 0) or int(base_amount_minor or 0)
    if amount <= 0:
        logger.warning("ledger.capture.zero_amount", payment_id=str(payment.id))
        return None
    txn = await post_transaction(
        db,
        txn_type=LedgerTxnType.PAYMENT_CAPTURED,
        reference_type="payment",
        reference_id=payment.id,
        idempotency_key=f"capture:{payment.id}",
        description=f"Payment {payment.gateway_payment_id} captured via {_v(payment.gateway)}",
        entries=[(gateway_receivable(_v(payment.gateway)), "debit", amount), (ESCROW, "credit", amount)],
    )
    await post_gateway_fee(db, payment)
    return txn


# ============================================================================================ booking escrow
def _booking_payment_ids(booking_id: uuid.UUID) -> Select[uuid.UUID]:
    return (
        select(Payment.id)
        .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
        .where(PaymentOrder.booking_id == booking_id)
    )


def _booking_refund_ids(booking_id: uuid.UUID) -> Select[uuid.UUID]:
    return (
        select(Refund.id)
        .outerjoin(PaymentOrder, PaymentOrder.id == Refund.order_id)
        .where(or_(Refund.booking_id == booking_id, PaymentOrder.booking_id == booking_id))
    )


async def booking_escrow_balance(db: AsyncSession, booking_id: uuid.UUID) -> int:
    """Escrow (credit-positive) still held for a booking: captures - refunds - recognised releases."""
    signed = case(
        (LedgerEntry.direction == EntryDirection.CREDIT, LedgerEntry.amount_minor),
        else_=-LedgerEntry.amount_minor,
    )
    stmt = (
        select(func.coalesce(func.sum(signed), 0))
        .select_from(LedgerEntry)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .where(
            LedgerAccount.code == ESCROW,
            or_(
                and_(
                    LedgerTransaction.reference_type == "payment",
                    LedgerTransaction.reference_id.in_(_booking_payment_ids(booking_id)),
                ),
                and_(
                    LedgerTransaction.reference_type == "refund",
                    LedgerTransaction.reference_id.in_(_booking_refund_ids(booking_id)),
                ),
                and_(
                    LedgerTransaction.reference_type == "booking",
                    LedgerTransaction.reference_id == booking_id,
                ),
            ),
        )
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


@dataclass(slots=True)
class RecognizedTotals:
    """Net amounts recognised so far for a booking (positive = in the recognition direction)."""

    released: int = 0  # escrow released (P)
    hospital: int = 0  # N
    commission: int = 0  # C
    gst: int = 0  # G
    tds: int = 0  # T
    service_fee: int = 0  # P - H
    agent: int = 0  # K net of withholding (agent payable)
    agent_expense: int = 0  # K
    agent_tds: dict[str, int] = field(default_factory=dict)  # withholding per tax account
    cancellation: int = 0  # platform share of retained cancellation amounts
    hospital_code: str | None = None
    agent_code: str | None = None
    recognitions: int = 0
    by_code: dict[str, int] = field(default_factory=dict)


async def recognized_totals(db: AsyncSession, booking_id: uuid.UUID) -> RecognizedTotals:
    rows = (
        await db.execute(
            select(
                LedgerAccount.code,
                LedgerEntry.direction,
                func.sum(LedgerEntry.amount_minor),
            )
            .select_from(LedgerEntry)
            .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
            .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
            .where(
                LedgerTransaction.reference_type == "booking", LedgerTransaction.reference_id == booking_id
            )
            .group_by(LedgerAccount.code, LedgerEntry.direction)
        )
    ).all()
    credit_net: dict[str, int] = defaultdict(int)
    for code, direction, amount in rows:
        credit_net[code] += int(amount) if _v(direction) == "credit" else -int(amount)
    totals = RecognizedTotals(by_code=dict(credit_net))
    totals.released = -credit_net.get(ESCROW, 0)
    totals.commission = credit_net.get(COMMISSION_REVENUE, 0)
    totals.gst = credit_net.get(GST_OUTPUT, 0)
    totals.tds = credit_net.get(TDS_194O, 0)
    totals.service_fee = credit_net.get(SERVICE_FEE_REVENUE, 0)
    totals.cancellation = credit_net.get(CANCELLATION_REVENUE, 0)
    totals.agent_expense = -credit_net.get(AGENT_COMMISSION_EXPENSE, 0)
    totals.agent_tds = {code: credit_net[code] for code in (TDS_194H, TDS_195) if credit_net.get(code)}
    for code, amount in credit_net.items():
        if code.startswith("HOSPITAL:"):
            totals.hospital += amount
            totals.hospital_code = code
        elif code.startswith("AGENT:"):
            totals.agent += amount
            totals.agent_code = code
    totals.recognitions = int(
        (
            await db.execute(
                select(func.count())
                .select_from(LedgerTransaction)
                .where(
                    LedgerTransaction.reference_type == "booking",
                    LedgerTransaction.reference_id == booking_id,
                    LedgerTransaction.txn_type == LedgerTxnType.REVENUE_RECOGNITION,
                )
            )
        ).scalar_one()
    )
    return totals


# ================================================================================================ recognition
@dataclass(slots=True)
class RecognitionBreakdown:
    paid: int  # P (released from escrow)
    service_fee: int  # P - H
    gross: int  # H
    commission_bps: int
    commission: int  # C
    gst: int  # G
    tds: int  # T
    net: int  # N
    agent_id: uuid.UUID | None
    agent_bps: int
    agent_commission: int  # K
    agent_tds_bps: int = 0
    agent_tds: int = 0  # withholding on K
    agent_net: int = 0  # K - withholding (agent payable)


def compute_recognition(
    *,
    paid: int,
    service_fee: int,
    commission_bps: int,
    gst_bps: int,
    tds_bps: int,
    agent_id: uuid.UUID | None,
    agent_bps: int,
    agent_tds_bps: int = 0,
) -> RecognitionBreakdown:
    """PLAN 6.4 step 2 arithmetic (all ROUND_HALF_UP): C = H*rate, G = C*gst, T = H*tds, N = H-C-G-T,
    K = H*agent_rate capped at C, agent withholding W = K*agent_tds (agent payable K-W)."""
    service_fee = max(0, min(service_fee, paid))
    gross = paid - service_fee
    commission = apply_bps(gross, commission_bps)
    gst = apply_bps(commission, gst_bps)
    tds = apply_bps(gross, tds_bps)
    net = gross - commission - gst - tds
    agent_commission = 0
    if agent_id is not None:
        agent_commission = min(apply_bps(gross, agent_bps), commission)
    agent_tds = apply_bps(agent_commission, agent_tds_bps) if agent_commission > 0 else 0
    return RecognitionBreakdown(
        paid=paid,
        service_fee=service_fee,
        gross=gross,
        commission_bps=commission_bps,
        commission=commission,
        gst=gst,
        tds=tds,
        net=net,
        agent_id=agent_id,
        agent_bps=agent_bps,
        agent_commission=agent_commission,
        agent_tds_bps=agent_tds_bps if agent_commission > 0 else 0,
        agent_tds=agent_tds,
        agent_net=agent_commission - agent_tds,
    )


async def agent_withholding(db: AsyncSession, agent_id: uuid.UUID | None) -> tuple[int, str, bool]:
    """(withholding bps, tax account, resident?) for an agent's commission. Agents with ``country`` IN or
    unknown are treated as resident (s.194H TDS); others get the finance-configured non-resident rate."""
    if agent_id is None:
        return 0, TDS_194H, True
    country = (await db.execute(select(Agent.country).where(Agent.id == agent_id))).scalar_one_or_none()
    resident = not country or str(country).upper() == "IN"
    if resident:
        return int(await get_setting(db, "agent_tds_rate_bps", DEFAULT_AGENT_TDS_BPS)), TDS_194H, True
    bps = await get_setting(
        db, "agent_nonresident_withholding_bps", DEFAULT_AGENT_NONRESIDENT_WITHHOLDING_BPS
    )
    return int(bps), TDS_195, False


async def _lock_booking(db: AsyncSession, booking_id: uuid.UUID) -> Booking | None:
    return (
        await db.execute(
            # No populate_existing: the publisher's in-session (possibly unflushed) booking state wins.
            select(Booking).where(Booking.id == booking_id).with_for_update()
        )
    ).scalar_one_or_none()


def _service_fee_share(booking: Booking, paid: int, already_recognized_fee: int) -> int:
    """Portion of ``paid`` that is the patient service fee (pro rata to the booking total)."""
    fee_total = int(booking.service_fee_minor or 0)
    total = int(booking.total_minor or 0)
    if fee_total <= 0 or total <= 0 or paid <= 0:
        return 0
    share = round_half_up(Decimal(paid) * Decimal(fee_total) / Decimal(total))
    if booking.currency == "INR":
        share = min(share, max(fee_total - already_recognized_fee, 0))
    return max(0, min(share, paid))


async def recognize_booking(
    db: AsyncSession, booking_id: uuid.UUID | str, *, on: date | None = None
) -> RecognitionBreakdown | None:
    """Recognise everything still held in escrow for a completed booking (step 2). Returns the breakdown of
    the new recognition, or ``None`` when nothing was left to recognise (idempotent)."""
    from app.modules.settlements.service import resolve_agent_commission_bps, resolve_commission_bps

    booking = await _lock_booking(db, _uuid(booking_id))
    if booking is None:
        logger.warning("ledger.recognize.booking_missing", booking_id=str(booking_id))
        return None
    if _v(booking.status) != BookingStatus.COMPLETED.value:
        return None
    paid = await booking_escrow_balance(db, booking.id)
    if paid <= 0:
        if paid < 0:
            logger.warning("ledger.recognize.negative_escrow", booking_id=str(booking.id), balance=paid)
        return None

    case_row = await db.get(Case, booking.case_id)
    totals = await recognized_totals(db, booking.id)
    procedure_id = booking.procedure_id or (case_row.procedure_id if case_row else None)
    specialty_id = case_row.specialty_id if case_row else None
    agent_id = case_row.agent_id if case_row else None
    effective = on or (booking.completed_at.date() if booking.completed_at else _now().date())

    commission_bps = await resolve_commission_bps(
        db,
        hospital_id=booking.hospital_id,
        procedure_id=procedure_id,
        specialty_id=specialty_id,
        on=effective,
    )
    agent_bps = await resolve_agent_commission_bps(db, agent_id, on=effective) if agent_id else 0
    agent_tds_bps, agent_tds_code, agent_resident = await agent_withholding(db, agent_id)
    gst_bps = int(await get_setting(db, "gst_rate_bps"))
    tds_bps = int(await get_setting(db, "tds_194o_rate_bps"))
    breakdown = compute_recognition(
        paid=paid,
        service_fee=_service_fee_share(booking, paid, totals.service_fee),
        commission_bps=commission_bps,
        gst_bps=gst_bps,
        tds_bps=tds_bps,
        agent_id=agent_id,
        agent_bps=agent_bps,
        agent_tds_bps=agent_tds_bps,
    )
    n = totals.recognitions + 1
    hospital_code = payee_payable("hospital", booking.hospital_id)
    entries = balanced_lines(
        [
            (ESCROW, "debit", breakdown.paid),
            (hospital_code, "credit", breakdown.net),
            (COMMISSION_REVENUE, "credit", breakdown.commission),
            (GST_OUTPUT, "credit", breakdown.gst),
            (TDS_194O, "credit", breakdown.tds),
            (SERVICE_FEE_REVENUE, "credit", breakdown.service_fee),
        ]
    )
    await post_transaction(
        db,
        txn_type=LedgerTxnType.REVENUE_RECOGNITION,
        reference_type="booking",
        reference_id=booking.id,
        idempotency_key=f"recognize:{booking.id}:{n}",
        description=(
            f"Revenue recognition #{n} for booking {booking.booking_number} "
            f"(commission {commission_bps} bps, GST {gst_bps} bps, TDS {tds_bps} bps)"
        ),
        entries=entries,
    )
    if breakdown.agent_id is not None and breakdown.agent_commission > 0:
        description = f"Agent commission #{n} for booking {booking.booking_number} ({breakdown.agent_bps} bps"
        if breakdown.agent_tds:
            description += f", withholding {breakdown.agent_tds_bps} bps to {agent_tds_code}"
        description += ")"
        if not agent_resident:
            description += f". {FOREIGN_AGENT_GST_NOTE}"
        await post_transaction(
            db,
            txn_type=LedgerTxnType.AGENT_COMMISSION,
            reference_type="booking",
            reference_id=booking.id,
            idempotency_key=f"agent_commission:{booking.id}:{n}",
            description=description,
            entries=balanced_lines(
                [
                    (AGENT_COMMISSION_EXPENSE, "debit", breakdown.agent_commission),
                    (payee_payable("agent", breakdown.agent_id), "credit", breakdown.agent_net),
                    (agent_tds_code, "credit", breakdown.agent_tds),
                ]
            ),
        )
    return breakdown


# ================================================================================================ refunds
def _scale(amount: int, numerator: int, denominator: int) -> int:
    if denominator <= 0:
        return 0
    return round_half_up(Decimal(amount) * Decimal(numerator) / Decimal(denominator))


async def _reverse_recognition(
    db: AsyncSession, booking: Booking, refund: Refund, amount: int, totals: RecognizedTotals
) -> None:
    """Proportional reversal of the booking's recognised split for ``amount`` (<= released)."""
    released = totals.released
    if amount >= released:
        commission, gst, tds, fee = totals.commission, totals.gst, totals.tds, totals.service_fee
        retained = totals.cancellation
        agent_expense = totals.agent_expense
        agent_tds = dict(totals.agent_tds)
    else:
        commission = _scale(totals.commission, amount, released)
        gst = _scale(totals.gst, amount, released)
        tds = _scale(totals.tds, amount, released)
        fee = _scale(totals.service_fee, amount, released)
        retained = _scale(totals.cancellation, amount, released)
        agent_expense = _scale(totals.agent_expense, amount, released)
        agent_tds = {code: _scale(value, amount, released) for code, value in totals.agent_tds.items()}
    agent = agent_expense - sum(agent_tds.values())
    hospital = amount - commission - gst - tds - fee - retained
    hospital_code = totals.hospital_code or payee_payable("hospital", booking.hospital_id)
    await post_transaction(
        db,
        txn_type=LedgerTxnType.REFUND,
        reference_type="booking",
        reference_id=booking.id,
        idempotency_key=f"reverse:{refund.id}",
        description=f"Reversal of recognition for refund {refund.id} on booking {booking.booking_number}",
        entries=balanced_lines(
            [
                (ESCROW, "credit", amount),
                (hospital_code, "debit", hospital),
                (COMMISSION_REVENUE, "debit", commission),
                (GST_OUTPUT, "debit", gst),
                (TDS_194O, "debit", tds),
                (SERVICE_FEE_REVENUE, "debit", fee),
                (CANCELLATION_REVENUE, "debit", retained),
            ]
        ),
    )
    if agent_expense > 0 and totals.agent_code:
        await post_transaction(
            db,
            txn_type=LedgerTxnType.AGENT_COMMISSION,
            reference_type="booking",
            reference_id=booking.id,
            idempotency_key=f"agent_commission_reversal:{refund.id}",
            description=(
                f"Agent commission reversal for refund {refund.id} on booking {booking.booking_number}"
            ),
            entries=balanced_lines(
                [
                    (totals.agent_code, "debit", agent),
                    *((code, "debit", value) for code, value in agent_tds.items()),
                    (AGENT_COMMISSION_EXPENSE, "credit", agent_expense),
                ]
            ),
        )


async def post_refund(
    db: AsyncSession, refund_id: uuid.UUID | str, *, base_amount_minor: int | None = None
) -> LedgerTransaction | None:
    """Refund posting (step 3). Before completion: Dr escrow / Cr receivable. After completion: first a
    proportional reversal of the recognition (and agent commission), then the same refund movement."""
    refund = await db.get(Refund, _uuid(refund_id))
    if refund is None:
        logger.warning("ledger.refund.missing", refund_id=str(refund_id))
        return None
    existing = await get_transaction_by_key(db, f"refund:{refund.id}")
    if existing is not None:
        return existing
    amount = int(refund.base_amount_minor or 0) or int(base_amount_minor or 0)
    if amount <= 0:
        logger.warning("ledger.refund.zero_amount", refund_id=str(refund.id))
        return None
    payment = await db.get(Payment, refund.payment_id)
    if payment is None:
        logger.warning("ledger.refund.payment_missing", refund_id=str(refund.id))
        return None

    booking_id = refund.booking_id
    if booking_id is None:
        order = await db.get(PaymentOrder, refund.order_id)
        booking_id = order.booking_id if order is not None else None
    if booking_id is not None:
        booking = await _lock_booking(db, booking_id)
        if booking is not None:
            totals = await recognized_totals(db, booking.id)
            if totals.released > 0:
                held = max(await booking_escrow_balance(db, booking.id), 0)
                to_reverse = min(max(amount - held, 0), totals.released)
                if to_reverse > 0:
                    await _reverse_recognition(db, booking, refund, to_reverse, totals)
                if amount - held - to_reverse > 0:
                    logger.warning(
                        "ledger.refund.exceeds_recognized",
                        refund_id=str(refund.id),
                        booking_id=str(booking.id),
                        amount=amount,
                    )
    return await post_transaction(
        db,
        txn_type=LedgerTxnType.REFUND,
        reference_type="refund",
        reference_id=refund.id,
        idempotency_key=f"refund:{refund.id}",
        description=f"Refund {refund.gateway_refund_id or refund.id} of payment {payment.gateway_payment_id}",
        entries=[(ESCROW, "debit", amount), (gateway_receivable(_v(payment.gateway)), "credit", amount)],
    )


# ========================================================================================== cancellations
RETENTION_LOOKBACK = timedelta(days=180)


def _ist_today() -> date:
    from app.models.sequences import IST

    return _now().astimezone(IST).date()


def retention_due_date(booking: Booking) -> date | None:
    """Retention is recognised once the original admission date is reached (hospital agreement Schedule A,
    Option A: settled after the admission date plus the hold period; the hold is applied by the settlement
    item). Without an admission date, the cancellation date is used."""
    if booking.admission_date is not None:
        return booking.admission_date
    if booking.cancelled_at is not None:
        from app.models.sequences import IST

        return booking.cancelled_at.astimezone(IST).date()
    return None


async def recognize_cancellation_retention(
    db: AsyncSession, booking_id: uuid.UUID | str, *, today: date | None = None
) -> LedgerTransaction | None:
    """Release what a cancelled booking still holds in escrow after its refunds (the amount retained under
    the 50 %/0 % refund tiers). Posted once per booking (``retain:<booking_id>``) when

    * the booking is ``cancelled`` and its retention due date (:func:`retention_due_date`) has been reached,
    * none of its refunds is still open (requested/approved/processing), and
    * no payment was captured after the cancellation (such money must be refunded, not retained).

    Split (setting ``cancellation_retention_hospital_share_bps``, default 10000 = Option A): the hospital
    share is treated as H (commission, GST and TDS u/s 194-O apply; no agent commission, no service-fee split)
    and the rest is platform revenue (``PLATFORM:CANCELLATION_REVENUE``; 0 = Option C). Returns the posted (or
    existing) transaction, or ``None`` when nothing is due."""
    from app.modules.settlements.service import resolve_commission_bps

    booking = await _lock_booking(db, _uuid(booking_id))
    if booking is None or _v(booking.status) != BookingStatus.CANCELLED.value:
        return None
    key = f"retain:{booking.id}"
    existing = await get_transaction_by_key(db, key)
    if existing is not None:
        return existing
    due = retention_due_date(booking)
    if due is None or (today or _ist_today()) < due:
        return None
    open_refunds = (
        await db.execute(
            select(func.count())
            .select_from(Refund)
            .where(Refund.id.in_(_booking_refund_ids(booking.id)), Refund.status.in_(OPEN_REFUND_STATUSES))
        )
    ).scalar_one()
    if open_refunds:
        return None
    if booking.cancelled_at is not None:
        late = (
            await db.execute(
                select(func.count())
                .select_from(Payment)
                .where(
                    Payment.id.in_(_booking_payment_ids(booking.id)),
                    Payment.status.in_(CAPTURED_STATUSES),
                    Payment.captured_at > booking.cancelled_at,
                )
            )
        ).scalar_one()
        if late:
            logger.warning("ledger.retention.capture_after_cancellation", booking_id=str(booking.id))
            return None
    held = await booking_escrow_balance(db, booking.id)
    if held <= 0:
        return None

    share_bps = await get_setting(
        db, "cancellation_retention_hospital_share_bps", DEFAULT_RETENTION_HOSPITAL_SHARE_BPS
    )
    share_bps = max(0, min(int(share_bps), 10_000))
    hospital_part = apply_bps(held, share_bps)
    platform_part = held - hospital_part
    case_row = await db.get(Case, booking.case_id)
    effective = booking.cancelled_at.date() if booking.cancelled_at else _now().date()
    commission_bps = await resolve_commission_bps(
        db,
        hospital_id=booking.hospital_id,
        procedure_id=booking.procedure_id or (case_row.procedure_id if case_row else None),
        specialty_id=case_row.specialty_id if case_row else None,
        on=effective,
    )
    gst_bps = int(await get_setting(db, "gst_rate_bps"))
    tds_bps = int(await get_setting(db, "tds_194o_rate_bps"))
    split = compute_recognition(
        paid=hospital_part,
        service_fee=0,
        commission_bps=commission_bps,
        gst_bps=gst_bps,
        tds_bps=tds_bps,
        agent_id=None,
        agent_bps=0,
    )
    return await post_transaction(
        db,
        txn_type=LedgerTxnType.CANCELLATION_RETENTION,
        reference_type="booking",
        reference_id=booking.id,
        idempotency_key=key,
        description=(
            f"Cancellation retention for booking {booking.booking_number}: hospital share {share_bps} bps "
            f"(commission {commission_bps} bps, GST {gst_bps} bps, TDS {tds_bps} bps)"
        ),
        entries=balanced_lines(
            [
                (ESCROW, "debit", held),
                (payee_payable("hospital", booking.hospital_id), "credit", split.net),
                (COMMISSION_REVENUE, "credit", split.commission),
                (GST_OUTPUT, "credit", split.gst),
                (TDS_194O, "credit", split.tds),
                (CANCELLATION_REVENUE, "credit", platform_part),
            ]
        ),
    )


async def retain_cancelled_bookings(
    db: AsyncSession, *, today: date | None = None, limit: int = 200
) -> list[uuid.UUID]:
    """Periodic scan: post the retention of every due cancelled booking. Returns the booking ids posted."""
    today = today or _ist_today()
    booking_key = cast(Booking.id, String)
    retained = exists().where(LedgerTransaction.idempotency_key == func.concat("retain:", booking_key))
    ids = (
        (
            await db.execute(
                select(Booking.id)
                .where(
                    Booking.status == BookingStatus.CANCELLED,
                    Booking.amount_paid_minor > 0,
                    Booking.cancelled_at.is_not(None),
                    Booking.cancelled_at >= _now() - RETENTION_LOOKBACK,
                    or_(Booking.admission_date.is_(None), Booking.admission_date <= today),
                    ~retained,
                )
                .order_by(Booking.cancelled_at, Booking.id)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    posted: list[uuid.UUID] = []
    for booking_id in ids:
        if await recognize_cancellation_retention(db, booking_id, today=today) is not None:
            posted.append(booking_id)
    return posted


# ================================================================================================ payouts
async def post_payout(db: AsyncSession, payout_id: uuid.UUID | str) -> LedgerTransaction | None:
    """Payout posting (step 4): Dr payee PAYABLE / Cr PLATFORM:BANK."""
    payout = await db.get(Payout, _uuid(payout_id))
    if payout is None:
        logger.warning("ledger.payout.missing", payout_id=str(payout_id))
        return None
    amount = int(payout.amount_minor or 0)
    if amount <= 0:
        return None
    return await post_transaction(
        db,
        txn_type=LedgerTxnType.PAYOUT,
        reference_type="payout",
        reference_id=payout.id,
        idempotency_key=f"payout:{payout.id}",
        description=f"Payout {payout.utr or payout.gateway_payout_id or payout.id} via {_v(payout.method)}",
        entries=[
            (payee_payable(_v(payout.payee_type), payout.payee_id), "debit", amount),
            (BANK, "credit", amount),
        ],
    )


async def reverse_payout(db: AsyncSession, payout_id: uuid.UUID | str) -> LedgerTransaction | None:
    """Undo a payout posting (payout failed/bounced after being posted). No-op if it was never posted."""
    payout = await db.get(Payout, _uuid(payout_id))
    if payout is None:
        return None
    original = await get_transaction_by_key(db, f"payout:{payout.id}")
    if original is None:
        return None
    amount = int(payout.amount_minor or 0)
    return await post_transaction(
        db,
        txn_type=LedgerTxnType.PAYOUT,
        reference_type="payout",
        reference_id=payout.id,
        idempotency_key=f"payout_reversal:{payout.id}",
        description=f"Reversal of failed payout {payout.id}",
        entries=[
            (BANK, "debit", amount),
            (payee_payable(_v(payout.payee_type), payout.payee_id), "credit", amount),
        ],
    )


# ================================================================================================ sweep
async def _payment_receivable_balance(db: AsyncSession, payment: Payment) -> int:
    """Debit-positive receivable attributable to one payment (capture - fee - refunds)."""
    code = gateway_receivable(_v(payment.gateway))
    refund_ids = select(Refund.id).where(Refund.payment_id == payment.id)
    signed = case(
        (LedgerEntry.direction == EntryDirection.DEBIT, LedgerEntry.amount_minor),
        else_=-LedgerEntry.amount_minor,
    )
    stmt = (
        select(func.coalesce(func.sum(signed), 0))
        .select_from(LedgerEntry)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .where(
            LedgerAccount.code == code,
            or_(
                and_(
                    LedgerTransaction.reference_type == "payment",
                    LedgerTransaction.reference_id == payment.id,
                ),
                and_(
                    LedgerTransaction.reference_type == "refund",
                    LedgerTransaction.reference_id.in_(refund_ids),
                ),
            ),
        )
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


async def sweep_gateway_settlements(
    db: AsyncSession, *, now: datetime | None = None, limit: int = 500
) -> int:
    """Step 5: move captured funds older than T+2 (bank transfers immediately) from the gateway receivable to
    the platform bank. Returns the number of sweep transactions posted."""
    now = now or _now()
    payment_key = cast(Payment.id, String)
    captured = exists().where(LedgerTransaction.idempotency_key == func.concat("capture:", payment_key))
    swept = exists().where(LedgerTransaction.idempotency_key == func.concat("sweep:", payment_key))
    stmt = (
        select(Payment)
        .where(
            Payment.status.in_(CAPTURED_STATUSES),
            Payment.captured_at.is_not(None),
            Payment.captured_at >= now - SWEEP_LOOKBACK,
            or_(
                Payment.captured_at <= now - SWEEP_DELAY,
                Payment.gateway.in_(list(IMMEDIATE_SWEEP_GATEWAYS)),
            ),
            captured,
            ~swept,
        )
        .order_by(Payment.captured_at, Payment.id)
        .limit(limit)
    )
    payments = list((await db.execute(stmt)).scalars().all())
    posted = 0
    for payment in payments:
        await post_gateway_fee(db, payment)
        amount = await _payment_receivable_balance(db, payment)
        if amount <= 0:
            continue
        await post_transaction(
            db,
            txn_type=LedgerTxnType.ADJUSTMENT,
            reference_type="payment",
            reference_id=payment.id,
            idempotency_key=f"sweep:{payment.id}",
            description=f"Gateway settlement of payment {payment.gateway_payment_id} ({_v(payment.gateway)})",
            entries=[(BANK, "debit", amount), (gateway_receivable(_v(payment.gateway)), "credit", amount)],
        )
        posted += 1
    return posted
