"""Test helpers for the admin module tests (data builders for dashboards/reports)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    BookingStatus,
    CaseStatus,
    OrderStatus,
    PaymentGateway,
    PaymentMethod,
    PaymentStatus,
    SettlementItemStatus,
)
from app.core.ids import uuid7
from app.models import Booking, Case, Hospital, Payment, Procedure, SettlementItem, Specialty
from app.modules.ledger.service import post_transaction
from tests.factories import (
    create_booking,
    create_case,
    create_hospital,
    create_patient,
    create_payment_order,
    create_procedure,
    create_specialty,
)

STAFF_ROLES = ("admin", "finance", "support", "super_admin")


async def capture_payment(
    db: AsyncSession, booking: Booking, amount_minor: int, *, captured_at: datetime | None = None
) -> Payment:
    """A captured mock payment (INR, FX 1) for ``booking``; the order is marked paid. Commits."""
    order = await create_payment_order(db, booking, amount_minor=amount_minor, status=OrderStatus.PAID)
    payment = Payment(
        order_id=order.id,
        gateway=PaymentGateway.MOCK,
        gateway_payment_id=f"pay_{uuid7().hex[-16:]}",
        method=PaymentMethod.MOCK,
        status=PaymentStatus.CAPTURED,
        amount_minor=amount_minor,
        currency="INR",
        base_amount_minor=amount_minor,
        captured_at=captured_at or datetime.now(UTC),
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


async def recognize_revenue(
    db: AsyncSession, booking: Booking, *, commission: int, service_fee: int, hospital_net: int
) -> None:
    """Post a balanced revenue-recognition transaction for ``booking`` (reference_type='booking'). Commits."""
    total = commission + service_fee + hospital_net
    await post_transaction(
        db,
        txn_type="revenue_recognition",
        reference_type="booking",
        reference_id=booking.id,
        idempotency_key=f"test-recognize:{booking.id}",
        description="test recognition",
        entries=[
            ("PLATFORM:PATIENT_ESCROW", "debit", total),
            (f"HOSPITAL:{booking.hospital_id}:PAYABLE", "credit", hospital_net),
            ("PLATFORM:COMMISSION_REVENUE", "credit", commission),
            ("PLATFORM:SERVICE_FEE_REVENUE", "credit", service_fee),
        ],
    )
    await db.commit()


async def post_capture(db: AsyncSession, payment: Payment) -> None:
    await post_transaction(
        db,
        txn_type="payment_captured",
        reference_type="payment",
        reference_id=payment.id,
        idempotency_key=f"test-capture:{payment.id}",
        description="test capture",
        entries=[
            ("GATEWAY:mock:RECEIVABLE", "debit", payment.base_amount_minor),
            ("PLATFORM:PATIENT_ESCROW", "credit", payment.base_amount_minor),
        ],
    )
    await db.commit()


async def settlement_item(
    db: AsyncSession, booking: Booking, net_minor: int, status: SettlementItemStatus
) -> SettlementItem:
    item = SettlementItem(
        payee_type="hospital",
        payee_id=booking.hospital_id,
        booking_id=booking.id,
        gross_minor=net_minor,
        commission_minor=0,
        tax_minor=0,
        tds_minor=0,
        net_minor=net_minor,
        currency="INR",
        status=status,
    )
    db.add(item)
    await db.commit()
    return item


@dataclass
class World:
    ortho: Specialty
    cardio: Specialty
    knee: Procedure
    bypass: Procedure
    apollo: Hospital
    fortis: Hospital
    cases: list[Case]
    bookings: list[Booking]


async def build_world(db: AsyncSession, **patient_fields: Any) -> World:
    """Two hospitals, two specialties; four cases (2 ortho @ apollo, 1 cardio @ fortis, 1 ortho enquiry)."""
    ortho = await create_specialty(db, slug="orthopedics", name="Orthopedics")
    cardio = await create_specialty(db, slug="cardiology", name="Cardiology")
    knee = await create_procedure(db, ortho, slug="total-knee-replacement", name="Total Knee Replacement")
    bypass = await create_procedure(db, cardio, slug="cabg", name="CABG")
    apollo = await create_hospital(db, name="Apollo Test", slug="apollo-test")
    fortis = await create_hospital(db, name="Fortis Test", slug="fortis-test")
    patient = await create_patient(db, **patient_fields)

    c1 = await create_case(db, patient, apollo, procedure_id=knee.id, status=CaseStatus.BOOKED)
    c2 = await create_case(db, patient, apollo, specialty_id=ortho.id, status=CaseStatus.COMPLETED)
    c3 = await create_case(db, patient, fortis, procedure_id=bypass.id, status=CaseStatus.QUOTED)
    c4 = await create_case(db, patient, apollo, specialty_id=ortho.id)
    now = datetime.now(UTC)
    b1 = await create_booking(db, c1, total_minor=1_000_000, status=BookingStatus.CONFIRMED, confirmed_at=now)
    b2 = await create_booking(
        db, c2, total_minor=500_000, status=BookingStatus.COMPLETED, confirmed_at=now, completed_at=now
    )
    return World(ortho, cardio, knee, bypass, apollo, fortis, [c1, c2, c3, c4], [b1, b2])
