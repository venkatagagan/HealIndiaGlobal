"""Builders and fixtures shared by the cases/bookings/travel tests."""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import events as events_module
from app.core.enums import OrderStatus, PaymentGateway, PaymentStatus
from app.core.events import publish
from app.core.storage import make_key
from app.models import (
    Agent,
    Booking,
    Doctor,
    Document,
    Hospital,
    HospitalMember,
    HospitalProcedure,
    PatientProfile,
    Payment,
    PaymentOrder,
    Procedure,
    Specialty,
    TreatmentPackage,
    User,
)
from app.modules.cases.common import today_ist
from tests.factories import (
    create_agent,
    create_doctor,
    create_fx_rates,
    create_hospital,
    create_hospital_procedure,
    create_package,
    create_patient,
    create_payment_order,
    create_procedure,
    create_specialty,
    create_user,
    rand_suffix,
)


@dataclass
class World:
    patient_user: User
    patient: PatientProfile
    hospital_user: User
    hospital: Hospital
    specialty: Specialty
    procedure: Procedure
    doctor: Doctor
    hospital_procedure: HospitalProcedure
    package: TreatmentPackage
    agent_user: User
    agent: Agent
    agent_patient_user: User
    agent_patient: PatientProfile
    staff_user: User


async def make_world(db: AsyncSession) -> World:
    await create_fx_rates(db)
    patient_user = await create_user(db, role="patient")
    patient = await create_patient(db, user=patient_user)
    hospital_user = await create_user(db, role="hospital")
    hospital = await create_hospital(db, owner=hospital_user)
    specialty = await create_specialty(db)
    procedure = await create_procedure(db, specialty=specialty)
    doctor = await create_doctor(db, hospital, specialty)
    hp = await create_hospital_procedure(db, hospital, procedure, doctor_ids=[doctor.id])
    package = await create_package(db, hp, tier="medical_stay")
    agent_user = await create_user(db, role="agent")
    agent = await create_agent(db, user=agent_user)
    agent_patient_user = await create_user(db, role="patient")
    agent_patient = await create_patient(db, user=agent_patient_user, managed_by_agent_id=agent.id)
    staff_user = await create_user(db, role="support")
    return World(
        patient_user=patient_user,
        patient=patient,
        hospital_user=hospital_user,
        hospital=hospital,
        specialty=specialty,
        procedure=procedure,
        doctor=doctor,
        hospital_procedure=hp,
        package=package,
        agent_user=agent_user,
        agent=agent,
        agent_patient_user=agent_patient_user,
        agent_patient=agent_patient,
        staff_user=staff_user,
    )


async def add_hospital_member(db: AsyncSession, hospital: Hospital, member_role: str = "coordinator") -> User:
    user = await create_user(db, role="hospital")
    db.add(HospitalMember(hospital_id=hospital.id, user_id=user.id, member_role=member_role))
    await db.commit()
    return user


def future(days: int) -> str:
    return (today_ist() + timedelta(days=days)).isoformat()


QUOTE_LINES = [
    {"category": "surgery", "description": "Total knee replacement", "amount_minor": 2_50_000_00},
    {"category": "hospital_stay", "description": "5 nights ward", "amount_minor": 75_000_00},
    {"category": "implants", "description": "Implant", "amount_minor": 75_000_00},
]
QUOTE_TOTAL = sum(li["amount_minor"] for li in QUOTE_LINES)


def quote_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "treatment_plan": "Pre-op tests, surgery and physiotherapy.",
        "line_items": QUOTE_LINES,
        "currency": "INR",
        "estimated_stay_days": 14,
        "valid_until": future(30),
    }
    body.update(overrides)
    return body


async def capture_payment(
    db: AsyncSession,
    booking: Booking,
    amount_minor: int,
    *,
    currency: str | None = None,
    base_amount_minor: int | None = None,
    payment: Payment | None = None,
) -> Payment:
    """Create a captured order + payment for ``booking`` and publish ``payment.captured`` (then commit)."""
    await db.refresh(booking)
    if payment is not None:
        await db.refresh(payment)
    else:
        ccy = currency or booking.currency
        base = base_amount_minor if base_amount_minor is not None else amount_minor
        order = await create_payment_order(
            db,
            booking,
            amount_minor=amount_minor,
            currency=ccy,
            base_amount_minor=base,
            fx_rate=Decimal(base) / Decimal(amount_minor) if amount_minor else Decimal(1),
            status=OrderStatus.PAID,
            paid_at=datetime.now(UTC),
        )
        payment = Payment(
            order_id=order.id,
            gateway=PaymentGateway.MOCK,
            gateway_payment_id=f"pay_{rand_suffix(12)}",
            method="mock",
            status=PaymentStatus.CAPTURED,
            amount_minor=amount_minor,
            currency=ccy,
            base_amount_minor=base,
            captured_at=datetime.now(UTC),
        )
        db.add(payment)
        await db.flush()
    order = await db.get(PaymentOrder, payment.order_id)
    assert order is not None
    await publish(
        db,
        "payment.captured",
        {
            "payment_id": str(payment.id),
            "order_id": str(order.id),
            "booking_id": str(booking.id),
            "installment_id": None,
            "consultation_id": None,
            "amount_minor": payment.amount_minor,
            "currency": payment.currency,
            "base_amount_minor": payment.base_amount_minor,
        },
    )
    await db.commit()
    return payment


async def make_document(
    db: AsyncSession,
    owner: User,
    *,
    kind: str,
    case_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
) -> Document:
    doc = Document(
        owner_user_id=owner.id,
        patient_id=patient_id,
        case_id=case_id,
        hospital_id=hospital_id,
        kind=kind,
        file_name=f"{kind}.pdf",
        content_type="application/pdf",
        size_bytes=2048,
        storage_key=make_key("documents", "pdf"),
        sha256=hashlib.sha256(rand_suffix(16).encode()).hexdigest(),
    )
    db.add(doc)
    await db.commit()
    return doc


async def reload[M](db: AsyncSession, model: type[M], obj_id: Any) -> M:
    """Re-read one row from the database (other loaded objects stay usable)."""
    stmt = select(model).where(model.id == obj_id).execution_options(populate_existing=True)  # type: ignore[attr-defined]
    return (await db.execute(stmt)).scalar_one()


class EventLog:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    def names(self) -> list[str]:
        return [name for name, _ in self.events]

    def of(self, name: str) -> list[dict[str, Any]]:
        return [payload for n, payload in self.events if n == name]


RECORDED_EVENTS = (
    "case.created",
    "case.status_changed",
    "case.coordinator_assigned",
    "quote.sent",
    "quote.accepted",
    "quote.rejected",
    "quote.expired",
    "consultation.scheduled",
    "consultation.rescheduled",
    "consultation.cancelled",
    "travel.status_changed",
    "installment.due",
    "installment.overdue",
    "settlement_batch.pending_approval",
    "booking.created",
    "booking.confirmed",
    "booking.admitted",
    "booking.completed",
    "booking.cancelled",
    "sos.created",
    "sos.updated",
)


@pytest.fixture(name="event_log")
def event_log_fixture() -> Iterator[EventLog]:
    """Records the payloads of the events this module publishes (subscribers removed afterwards)."""
    log = EventLog()
    added: list[tuple[str, Any]] = []
    for name in RECORDED_EVENTS:

        async def _record(db: AsyncSession, payload: dict[str, Any], _name: str = name) -> None:
            log.events.append((_name, payload))

        events_module._subscribers.setdefault(name, []).append(_record)
        added.append((name, _record))
    try:
        yield log
    finally:
        for name, fn in added:
            handlers = events_module._subscribers.get(name, [])
            if fn in handlers:
                handlers.remove(fn)
