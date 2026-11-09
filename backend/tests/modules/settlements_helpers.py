"""Shared helpers for the ledger and settlements tests (be-finance)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import events
from app.core import ids as ids_module
from app.core.enums import BookingStatus, PaymentGateway, PaymentStatus, RefundStatus
from app.models import Agent, Booking, Case, Hospital, PatientProfile, Payment, PaymentOrder, Refund, User
from app.models.ledger import LedgerAccount, LedgerEntry, LedgerTransaction
from app.models.settlements import SettlementItem
from app.modules.ledger.service import get_balance
from tests.factories import (
    create_agent,
    create_booking,
    create_case,
    create_hospital,
    create_patient,
    create_payment_order,
    create_user,
    rand_suffix,
)

FINANCE_MODULES = ("app.modules.ledger", "app.modules.settlements")


def finance_events_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep only the ledger/settlements subscribers so these tests exercise the finance flow in isolation
    (other modules' handlers are tested by their owners and by tests/e2e)."""
    filtered = {
        name: [h for h in handlers if h.__module__.startswith(FINANCE_MODULES)]
        for name, handlers in events._subscribers.items()
    }
    monkeypatch.setattr(events, "_subscribers", filtered)
    # time-machine travel moves uuid7's monotonic clock into the future; restore it after the test so later
    # tests (e.g. the uuid7 smoke test) see ids stamped with the real time again.
    monkeypatch.setattr(ids_module, "_last_ms", ids_module._last_ms)
    monkeypatch.setattr(ids_module, "_last_tail", ids_module._last_tail)


@dataclass
class World:
    patient: PatientProfile
    hospital_owner: User
    hospital: Hospital
    agent: Agent | None
    case: Case
    booking: Booking


async def make_world(
    db: AsyncSession,
    *,
    with_agent: bool = True,
    total_minor: int = 4_00_000_00,
    hospital_fields: dict[str, Any] | None = None,
    case_fields: dict[str, Any] | None = None,
    booking_fields: dict[str, Any] | None = None,
) -> World:
    patient = await create_patient(db)
    owner = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=owner, **(hospital_fields or {}))
    agent = await create_agent(db) if with_agent else None
    case = await create_case(
        db, patient, hospital, agent_id=agent.id if agent else None, **(case_fields or {})
    )
    booking = await create_booking(db, case, total_minor=total_minor, **(booking_fields or {}))
    return World(patient, owner, hospital, agent, case, booking)


async def capture_payment(
    db: AsyncSession,
    booking: Booking,
    amount_minor: int,
    *,
    fee_minor: int = 0,
    gateway: PaymentGateway = PaymentGateway.MOCK,
    publish: bool = True,
    captured_at: datetime | None = None,
) -> Payment:
    """A captured INR payment for the booking (+ its order) and the ``payment.captured`` event, committed."""
    order = await create_payment_order(
        db, booking, amount_minor=amount_minor, base_amount_minor=amount_minor, gateway=gateway
    )
    payment = Payment(
        order_id=order.id,
        gateway=gateway,
        gateway_payment_id=f"pay_{rand_suffix(12)}",
        status=PaymentStatus.CAPTURED,
        amount_minor=amount_minor,
        currency="INR",
        base_amount_minor=amount_minor,
        fee_minor=fee_minor,
        captured_at=captured_at or datetime.now(UTC),
    )
    db.add(payment)
    await db.flush()
    if publish:
        await publish_captured(db, payment, order)
    await db.commit()
    return payment


async def publish_captured(db: AsyncSession, payment: Payment, order: PaymentOrder | None = None) -> None:
    await db.refresh(payment)  # may be expired by balance()/expire_all()
    order = order or await db.get(PaymentOrder, payment.order_id)
    assert order is not None
    await events.publish(
        db,
        "payment.captured",
        {
            "payment_id": str(payment.id),
            "order_id": str(order.id),
            "booking_id": str(order.booking_id) if order.booking_id else None,
            "installment_id": None,
            "consultation_id": None,
            "amount_minor": payment.amount_minor,
            "currency": payment.currency,
            "base_amount_minor": payment.base_amount_minor,
        },
    )


async def complete_booking(db: AsyncSession, booking: Booking, *, publish: bool = True) -> None:
    fresh = await db.get(Booking, booking.id)
    assert fresh is not None
    fresh.status = BookingStatus.COMPLETED
    fresh.completed_at = datetime.now(UTC)
    await db.flush()
    if publish:
        await events.publish(db, "booking.completed", {"booking_id": str(booking.id)})
    await db.commit()


async def process_refund(
    db: AsyncSession, payment: Payment, amount_minor: int, *, publish: bool = True
) -> Refund:
    await db.refresh(payment)
    order = await db.get(PaymentOrder, payment.order_id)
    assert order is not None
    refund = Refund(
        payment_id=payment.id,
        order_id=order.id,
        booking_id=order.booking_id,
        amount_minor=amount_minor,
        currency="INR",
        base_amount_minor=amount_minor,
        reason="test refund",
        status=RefundStatus.PROCESSED,
        processed_at=datetime.now(UTC),
    )
    db.add(refund)
    await db.flush()
    if publish:
        await events.publish(
            db,
            "refund.processed",
            {
                "refund_id": str(refund.id),
                "payment_id": str(payment.id),
                "booking_id": str(order.booking_id) if order.booking_id else None,
                "base_amount_minor": amount_minor,
            },
        )
    await db.commit()
    return refund


async def balance(db: AsyncSession, code: str) -> int:
    return await get_balance(db, code)


async def balances(db: AsyncSession) -> dict[str, int]:
    rows = (await db.execute(select(LedgerAccount.code, LedgerAccount.balance_minor))).all()
    return {code: int(value) for code, value in rows}


async def assert_ledger_consistent(db: AsyncSession) -> None:
    """Σdebit = Σcredit overall and every cached balance equals the balance computed from its entries."""
    rows = (
        await db.execute(
            select(LedgerAccount, LedgerEntry)
            .join(LedgerEntry, LedgerEntry.account_id == LedgerAccount.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    computed: dict[uuid.UUID, int] = {}
    debit = credit = 0
    accounts: dict[uuid.UUID, LedgerAccount] = {}
    for account, entry in rows:
        accounts[account.id] = account
        is_debit = str(getattr(entry.direction, "value", entry.direction)) == "debit"
        normal_debit = str(getattr(account.type, "value", account.type)) in ("asset", "expense")
        amount = int(entry.amount_minor)
        debit += amount if is_debit else 0
        credit += 0 if is_debit else amount
        computed[account.id] = computed.get(account.id, 0) + (amount if is_debit == normal_debit else -amount)
    assert debit == credit, (debit, credit)
    for account_id, value in computed.items():
        assert int(accounts[account_id].balance_minor) == value, accounts[account_id].code


async def txn_count(db: AsyncSession, prefix: str) -> int:
    rows = (
        await db.execute(
            select(LedgerTransaction.id).where(LedgerTransaction.idempotency_key.like(f"{prefix}%"))
        )
    ).all()
    return len(rows)


async def items_for(db: AsyncSession, booking_id: uuid.UUID) -> list[SettlementItem]:
    return list(
        (
            await db.execute(
                select(SettlementItem)
                .where(SettlementItem.booking_id == booking_id)
                .order_by(SettlementItem.created_at, SettlementItem.id)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
