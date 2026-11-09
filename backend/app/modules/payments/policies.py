"""Resource scoping for payments (PLAN 9.1). Out-of-scope ids must surface as 404, never 403.

* patient   -> orders/invoices/installments of their own patient profile (or orders they paid)
* agent     -> patients they manage or referred, and cases assigned to them
* hospital  -> read-only view of orders/invoices/installments for bookings at their hospital(s)
* staff     -> everything (finance-only actions are enforced with ``require_roles`` on the route)
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ColumnElement, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_staff
from app.core.enums import UserRole
from app.models import (
    Agent,
    Booking,
    Case,
    HospitalMember,
    Invoice,
    PatientProfile,
    PaymentOrder,
    User,
)


def _role(user: User) -> str:
    return str(getattr(user.role, "value", user.role))


async def patient_profile_id(db: AsyncSession, user: User) -> uuid.UUID | None:
    return (
        await db.execute(select(PatientProfile.id).where(PatientProfile.user_id == user.id))
    ).scalar_one_or_none()


async def agent_id_for(db: AsyncSession, user: User) -> uuid.UUID | None:
    return (await db.execute(select(Agent.id).where(Agent.user_id == user.id))).scalar_one_or_none()


async def hospital_ids_for(db: AsyncSession, user: User) -> list[uuid.UUID]:
    rows = await db.execute(select(HospitalMember.hospital_id).where(HospitalMember.user_id == user.id))
    return list(rows.scalars().all())


def _agent_patient_ids(agent_id: uuid.UUID) -> Any:
    return select(PatientProfile.id).where(
        or_(PatientProfile.managed_by_agent_id == agent_id, PatientProfile.referred_by_agent_id == agent_id)
    )


def _agent_case_ids(agent_id: uuid.UUID) -> Any:
    return select(Case.id).where(Case.agent_id == agent_id)


async def agent_can_act_for(
    db: AsyncSession, agent_id: uuid.UUID, patient_id: uuid.UUID, case_id: uuid.UUID | None
) -> bool:
    patient = await db.get(PatientProfile, patient_id)
    if patient is not None and agent_id in (patient.managed_by_agent_id, patient.referred_by_agent_id):
        return True
    if case_id is not None:
        case_agent = (await db.execute(select(Case.agent_id).where(Case.id == case_id))).scalar_one_or_none()
        if case_agent == agent_id:
            return True
    return False


async def can_pay_for(
    db: AsyncSession, user: User, *, patient_id: uuid.UUID, case_id: uuid.UUID | None
) -> bool:
    """Who may create/complete payments for a patient: the patient, their agent, staff."""
    if is_staff(user):
        return True
    role = _role(user)
    if role == UserRole.PATIENT.value:
        return await patient_profile_id(db, user) == patient_id
    if role == UserRole.AGENT.value:
        agent_id = await agent_id_for(db, user)
        return agent_id is not None and await agent_can_act_for(db, agent_id, patient_id, case_id)
    return False


async def can_view_booking(db: AsyncSession, user: User, booking: Booking) -> bool:
    if await can_pay_for(db, user, patient_id=booking.patient_id, case_id=booking.case_id):
        return True
    if _role(user) == UserRole.HOSPITAL.value:
        return booking.hospital_id in await hospital_ids_for(db, user)
    return False


async def can_act_on_order(db: AsyncSession, user: User, order: PaymentOrder) -> bool:
    """Payer-side actions (verify, proof upload, mock completion)."""
    if order.payer_user_id == user.id:
        return True
    return await can_pay_for(db, user, patient_id=order.patient_id, case_id=order.case_id)


async def can_view_order(db: AsyncSession, user: User, order: PaymentOrder) -> bool:
    if await can_act_on_order(db, user, order):
        return True
    if _role(user) == UserRole.HOSPITAL.value and order.booking_id is not None:
        hospital_id = (
            await db.execute(select(Booking.hospital_id).where(Booking.id == order.booking_id))
        ).scalar_one_or_none()
        return hospital_id is not None and hospital_id in await hospital_ids_for(db, user)
    return False


async def order_scope(db: AsyncSession, user: User) -> ColumnElement[bool] | None:
    """WHERE clause limiting ``PaymentOrder`` rows to the user's scope (``None`` = unrestricted)."""
    if is_staff(user):
        return None
    role = _role(user)
    if role == UserRole.PATIENT.value:
        pid = await patient_profile_id(db, user)
        clauses: list[ColumnElement[bool]] = [PaymentOrder.payer_user_id == user.id]
        if pid is not None:
            clauses.append(PaymentOrder.patient_id == pid)
        return or_(*clauses)
    if role == UserRole.AGENT.value:
        agent_id = await agent_id_for(db, user)
        if agent_id is None:
            return PaymentOrder.payer_user_id == user.id
        return or_(
            PaymentOrder.payer_user_id == user.id,
            PaymentOrder.patient_id.in_(_agent_patient_ids(agent_id)),
            PaymentOrder.case_id.in_(_agent_case_ids(agent_id)),
        )
    if role == UserRole.HOSPITAL.value:
        hospital_ids = await hospital_ids_for(db, user)
        if not hospital_ids:
            return false()
        return PaymentOrder.booking_id.in_(select(Booking.id).where(Booking.hospital_id.in_(hospital_ids)))
    return false()


async def invoice_scope(db: AsyncSession, user: User) -> ColumnElement[bool] | None:
    """WHERE clause limiting ``Invoice`` rows (``None`` = unrestricted)."""
    if is_staff(user):
        return None
    role = _role(user)
    if role == UserRole.PATIENT.value:
        pid = await patient_profile_id(db, user)
        clauses: list[ColumnElement[bool]] = [Invoice.issued_to_user_id == user.id]
        if pid is not None:
            clauses.append(Invoice.booking_id.in_(select(Booking.id).where(Booking.patient_id == pid)))
        return or_(*clauses)
    if role == UserRole.AGENT.value:
        agent_id = await agent_id_for(db, user)
        if agent_id is None:
            return Invoice.issued_to_user_id == user.id
        return or_(
            Invoice.issued_to_user_id == user.id,
            Invoice.agent_id == agent_id,
            Invoice.booking_id.in_(
                select(Booking.id).where(
                    or_(
                        Booking.patient_id.in_(_agent_patient_ids(agent_id)),
                        Booking.case_id.in_(_agent_case_ids(agent_id)),
                    )
                )
            ),
        )
    if role == UserRole.HOSPITAL.value:
        hospital_ids = await hospital_ids_for(db, user)
        if not hospital_ids:
            return false()
        return Invoice.hospital_id.in_(hospital_ids)
    return false()
