"""Read-only ``CaseOut`` builder for the agent dashboard's ``recent_cases`` (PLAN 8.7 shape).

The cases module owns the canonical serializers; this module only renders the same JSON shape for a handful of
rows with batched lookups, so the agent portal does not depend on another module's internals.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BookingStatus
from app.models import (
    Agent,
    Booking,
    Case,
    Doctor,
    Hospital,
    PatientProfile,
    Procedure,
    Quote,
    Specialty,
    TreatmentPackage,
    User,
)


def _v(value: Any) -> Any:
    return getattr(value, "value", value)


def _iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _age(dob: date | None) -> int | None:
    if dob is None:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


async def _by_id[M](db: AsyncSession, model: type[M], ids: set[uuid.UUID]) -> dict[uuid.UUID, M]:
    if not ids:
        return {}
    rows = (await db.execute(select(model).where(model.id.in_(ids)))).scalars().all()  # type: ignore[attr-defined]
    return {r.id: r for r in rows}  # type: ignore[attr-defined]


def _package_out(pkg: TreatmentPackage | None) -> dict[str, Any] | None:
    if pkg is None:
        return None
    return {
        "id": str(pkg.id),
        "name": pkg.name,
        "tier": _v(pkg.tier),
        "price_minor": pkg.price_minor,
        "original_price_minor": pkg.original_price_minor,
        "currency": pkg.currency,
        "description": pkg.description,
        "includes": dict(pkg.includes or {}),
    }


async def build_case_outs(db: AsyncSession, cases: Sequence[Case]) -> list[dict[str, Any]]:
    if not cases:
        return []
    case_ids = [c.id for c in cases]
    patients = await _by_id(db, PatientProfile, {c.patient_id for c in cases})
    agents = await _by_id(db, Agent, {c.agent_id for c in cases if c.agent_id})
    hospitals = await _by_id(db, Hospital, {c.hospital_id for c in cases})
    doctors = await _by_id(db, Doctor, {c.doctor_id for c in cases if c.doctor_id})
    procedures = await _by_id(db, Procedure, {c.procedure_id for c in cases if c.procedure_id})
    specialty_ids = {c.specialty_id for c in cases if c.specialty_id} | {
        d.specialty_id for d in doctors.values()
    }
    specialties = await _by_id(db, Specialty, specialty_ids)

    quotes = (
        (
            await db.execute(
                select(Quote)
                .where(Quote.case_id.in_(case_ids))
                .order_by(Quote.case_id, Quote.created_at.desc(), Quote.id.desc())
            )
        )
        .scalars()
        .all()
    )
    latest_quote: dict[uuid.UUID, Quote] = {}
    for q in quotes:
        latest_quote.setdefault(q.case_id, q)
    bookings = (
        (
            await db.execute(
                select(Booking)
                .where(Booking.case_id.in_(case_ids), Booking.status != BookingStatus.CANCELLED)
                .order_by(Booking.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    booking_by_case: dict[uuid.UUID, Booking] = {}
    for b in bookings:
        booking_by_case.setdefault(b.case_id, b)
    packages = await _by_id(db, TreatmentPackage, {b.package_id for b in bookings if b.package_id})
    booking_doctors = await _by_id(db, Doctor, {b.doctor_id for b in bookings if b.doctor_id} - set(doctors))
    doctors.update(booking_doctors)
    booking_procs = await _by_id(
        db, Procedure, {b.procedure_id for b in bookings if b.procedure_id} - set(procedures)
    )
    procedures.update(booking_procs)
    user_ids = {c.coordinator_user_id for c in cases if c.coordinator_user_id} | {
        q.prepared_by_user_id for q in latest_quote.values() if q.prepared_by_user_id
    }
    users = await _by_id(db, User, user_ids)

    def quote_out(q: Quote | None) -> dict[str, Any] | None:
        if q is None:
            return None
        preparer = users.get(q.prepared_by_user_id) if q.prepared_by_user_id else None
        return {
            "id": str(q.id),
            "case_id": str(q.case_id),
            "hospital_id": str(q.hospital_id),
            "status": _v(q.status),
            "treatment_plan": q.treatment_plan or "",
            "line_items": list(q.line_items or []),
            "total_minor": q.total_minor,
            "currency": q.currency,
            "estimated_stay_days": q.estimated_stay_days,
            "valid_until": _iso(q.valid_until),
            "prepared_by_name": preparer.full_name if preparer else None,
            "created_at": _iso(q.created_at),
            "accepted_at": _iso(q.accepted_at),
            "rejected_reason": q.rejected_reason,
        }

    def booking_out(b: Booking | None) -> dict[str, Any] | None:
        if b is None:
            return None
        patient = patients.get(b.patient_id)
        hospital = hospitals.get(b.hospital_id)
        doctor = doctors.get(b.doctor_id) if b.doctor_id else None
        proc = procedures.get(b.procedure_id) if b.procedure_id else None
        return {
            "id": str(b.id),
            "booking_number": b.booking_number,
            "case_id": str(b.case_id),
            "status": _v(b.status),
            "patient": {"id": str(b.patient_id), "full_name": patient.full_name if patient else ""},
            "hospital": {
                "id": str(b.hospital_id),
                "name": hospital.name if hospital else "",
                "city": (hospital.city or "") if hospital else "",
            },
            "doctor": {"id": str(doctor.id), "full_name": doctor.full_name} if doctor else None,
            "procedure": {"id": str(proc.id), "name": proc.name} if proc else None,
            "package": _package_out(packages.get(b.package_id) if b.package_id else None),
            "quote_id": str(b.quote_id) if b.quote_id else None,
            "admission_date": _iso(b.admission_date),
            "discharge_date": _iso(b.discharge_date),
            "duration_days": b.duration_days,
            "payment_option": _v(b.payment_option),
            "installment_months": b.installment_months,
            "insurance_claim_requested": bool(b.insurance_claim_requested),
            "currency": b.currency,
            "subtotal_minor": b.subtotal_minor,
            "discount_minor": b.discount_minor,
            "service_fee_minor": b.service_fee_minor,
            "tax_minor": b.tax_minor,
            "total_minor": b.total_minor,
            "deposit_minor": b.deposit_minor,
            "amount_paid_minor": b.amount_paid_minor,
            "amount_refunded_minor": b.amount_refunded_minor,
            "balance_due_minor": max(b.total_minor - b.amount_paid_minor + b.amount_refunded_minor, 0),
            "created_at": _iso(b.created_at),
            "confirmed_at": _iso(b.confirmed_at),
            "admitted_at": _iso(b.admitted_at),
            "completed_at": _iso(b.completed_at),
            "cancelled_at": _iso(b.cancelled_at),
            "cancel_reason": b.cancel_reason,
        }

    out: list[dict[str, Any]] = []
    for c in cases:
        patient = patients.get(c.patient_id)
        agent = agents.get(c.agent_id) if c.agent_id else None
        hospital = hospitals.get(c.hospital_id)
        doctor = doctors.get(c.doctor_id) if c.doctor_id else None
        proc = procedures.get(c.procedure_id) if c.procedure_id else None
        spec = specialties.get(c.specialty_id) if c.specialty_id else None
        coordinator = users.get(c.coordinator_user_id) if c.coordinator_user_id else None
        doctor_spec = specialties.get(doctor.specialty_id) if doctor else None
        out.append(
            {
                "id": str(c.id),
                "case_number": c.case_number,
                "status": _v(c.status),
                "patient": {
                    "id": str(c.patient_id),
                    "full_name": patient.full_name if patient else "",
                    "nationality": patient.nationality if patient else None,
                    "gender": _v(patient.gender) if patient and patient.gender else None,
                    "age": _age(patient.date_of_birth) if patient else None,
                },
                "agent": {"id": str(agent.id), "agency_name": agent.agency_name} if agent else None,
                "hospital": {
                    "id": str(c.hospital_id),
                    "slug": hospital.slug if hospital else "",
                    "name": hospital.name if hospital else "",
                    "city": (hospital.city or "") if hospital else "",
                },
                "doctor": (
                    {
                        "id": str(doctor.id),
                        "full_name": doctor.full_name,
                        "specialty_name": doctor_spec.name if doctor_spec else None,
                    }
                    if doctor
                    else None
                ),
                "procedure": {"id": str(proc.id), "slug": proc.slug, "name": proc.name} if proc else None,
                "specialty": {"id": str(spec.id), "slug": spec.slug, "name": spec.name} if spec else None,
                "screening_id": str(c.screening_id) if c.screening_id else None,
                "coordinator": (
                    {"id": str(coordinator.id), "full_name": coordinator.full_name} if coordinator else None
                ),
                "patient_notes": c.patient_notes,
                "latest_quote": quote_out(latest_quote.get(c.id)),
                "booking": booking_out(booking_by_case.get(c.id)),
                "created_at": _iso(c.created_at),
                "updated_at": _iso(c.updated_at),
            }
        )
    return out
