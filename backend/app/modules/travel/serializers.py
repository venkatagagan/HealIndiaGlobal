"""Batched builders for travel API shapes."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AccommodationBooking,
    AccommodationProvider,
    Case,
    ServiceBooking,
    ServiceProvider,
    SosAlert,
    TravelBooking,
    User,
    VisaRequest,
)
from app.modules.cases.schemas import UserRef
from app.modules.travel.schemas import (
    AccommodationBookingOut,
    AccommodationProviderRef,
    ServiceBookingOut,
    ServiceProviderRef,
    SosOut,
    TravelBookingOut,
    TravelPatientRef,
    VisaRequestOut,
)
from app.modules.travel.service import case_numbers, patient_names


async def _context(
    db: AsyncSession, items: Sequence[VisaRequest | TravelBooking | AccommodationBooking | ServiceBooking]
) -> tuple[dict, dict]:
    patients = await patient_names(db, [i.patient_id for i in items])
    numbers = await case_numbers(db, [i.case_id for i in items])
    return patients, numbers


def _patient_ref(patients: dict, pid: object) -> TravelPatientRef | None:
    p = patients.get(pid)
    return TravelPatientRef(id=p.id, full_name=p.full_name) if p else None


async def visa_outs(db: AsyncSession, items: Sequence[VisaRequest]) -> list[VisaRequestOut]:
    patients, numbers = await _context(db, items)
    return [
        VisaRequestOut.model_validate(v).model_copy(
            update={"case_number": numbers.get(v.case_id), "patient": _patient_ref(patients, v.patient_id)}
        )
        for v in items
    ]


async def travel_outs(db: AsyncSession, items: Sequence[TravelBooking]) -> list[TravelBookingOut]:
    patients, numbers = await _context(db, items)
    return [
        TravelBookingOut.model_validate(t).model_copy(
            update={"case_number": numbers.get(t.case_id), "patient": _patient_ref(patients, t.patient_id)}
        )
        for t in items
    ]


async def accommodation_outs(
    db: AsyncSession, items: Sequence[AccommodationBooking]
) -> list[AccommodationBookingOut]:
    patients, numbers = await _context(db, items)
    provider_ids = {a.provider_id for a in items}
    providers = (
        {
            p.id: p
            for p in (
                await db.execute(
                    select(AccommodationProvider).where(AccommodationProvider.id.in_(provider_ids))
                )
            ).scalars()
        }
        if provider_ids
        else {}
    )
    out: list[AccommodationBookingOut] = []
    for a in items:
        prov = providers.get(a.provider_id)
        out.append(
            AccommodationBookingOut(
                id=a.id,
                case_id=a.case_id,
                case_number=numbers.get(a.case_id),
                patient=_patient_ref(patients, a.patient_id),
                provider=AccommodationProviderRef.model_validate(prov) if prov else None,
                check_in=a.check_in,
                check_out=a.check_out,
                nights=(a.check_out - a.check_in).days,
                guests=a.guests,
                room_type=a.room_type,
                nightly_rate_minor=a.nightly_rate_minor,
                total_minor=a.total_minor,
                currency=a.currency,
                status=a.status,
                confirmation_code=a.confirmation_code,
                notes=a.notes,
                created_at=a.created_at,
                updated_at=a.updated_at,
            )
        )
    return out


async def service_outs(db: AsyncSession, items: Sequence[ServiceBooking]) -> list[ServiceBookingOut]:
    patients, numbers = await _context(db, items)
    provider_ids = {s.provider_id for s in items if s.provider_id is not None}
    providers = (
        {
            p.id: p
            for p in (
                await db.execute(select(ServiceProvider).where(ServiceProvider.id.in_(provider_ids)))
            ).scalars()
        }
        if provider_ids
        else {}
    )
    out: list[ServiceBookingOut] = []
    for s in items:
        prov = providers.get(s.provider_id) if s.provider_id else None
        out.append(
            ServiceBookingOut(
                id=s.id,
                case_id=s.case_id,
                case_number=numbers.get(s.case_id),
                patient=_patient_ref(patients, s.patient_id),
                provider=ServiceProviderRef.model_validate(prov) if prov else None,
                kind=s.kind,
                starts_at=s.starts_at,
                ends_at=s.ends_at,
                status=s.status,
                price_minor=s.price_minor,
                currency=s.currency,
                notes=s.notes,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
        )
    return out


async def sos_outs(db: AsyncSession, items: Sequence[SosAlert]) -> list[SosOut]:
    if not items:
        return []
    patients = await patient_names(db, [s.patient_id for s in items])
    case_ids = {s.case_id for s in items if s.case_id is not None}
    case_rows = (
        {
            r.id: r
            for r in (
                await db.execute(
                    select(Case.id, Case.case_number, Case.coordinator_user_id).where(Case.id.in_(case_ids))
                )
            ).all()
        }
        if case_ids
        else {}
    )
    user_ids = {s.acknowledged_by for s in items if s.acknowledged_by} | {
        r.coordinator_user_id for r in case_rows.values() if r.coordinator_user_id
    }
    users = (
        {u.id: u for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars()}
        if user_ids
        else {}
    )

    def uref(uid: uuid.UUID | None) -> UserRef | None:
        u = users.get(uid) if uid else None
        return UserRef(id=u.id, full_name=u.full_name) if u else None

    out: list[SosOut] = []
    for s in items:
        p = patients.get(s.patient_id)
        crow = case_rows.get(s.case_id) if s.case_id else None
        out.append(
            SosOut(
                id=s.id,
                patient=TravelPatientRef(id=p.id, full_name=p.full_name) if p else None,
                patient_phone=(p.phone or p.whatsapp) if p else None,
                case_id=s.case_id,
                case_number=crow.case_number if crow else None,
                lat=s.lat,
                lng=s.lng,
                message=s.message,
                status=s.status,
                acknowledged_by=uref(s.acknowledged_by),
                coordinator=uref(crow.coordinator_user_id) if crow else None,
                resolved_at=s.resolved_at,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
        )
    return out
