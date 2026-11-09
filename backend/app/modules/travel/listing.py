"""Shared list filters and per-status counts of the travel-desk list endpoints (visa requests, travel,
accommodation and service bookings, SOS alerts). Additive: omitted parameters keep the old behaviour."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ServiceBookingStatus, SosStatus, VisaStatus
from app.models import (
    AccommodationBooking,
    PatientProfile,
    ServiceBooking,
    SosAlert,
    TravelBooking,
    User,
    VisaRequest,
)
from app.models.sequences import IST
from app.modules.travel import service as travel_service


class TravelResource(StrEnum):
    VISA = "visa"
    TRAVEL = "travel"
    ACCOMMODATION = "accommodation"
    SERVICES = "services"
    SOS = "sos"


@dataclass(frozen=True, slots=True)
class _Spec:
    model: Any
    statuses: tuple[str, ...]
    date_col: Any
    """column the ``from``/``to`` range applies to (the date that matters on the desk)"""


SPECS: dict[TravelResource, _Spec] = {
    TravelResource.VISA: _Spec(VisaRequest, tuple(s.value for s in VisaStatus), VisaRequest.created_at),
    TravelResource.TRAVEL: _Spec(
        TravelBooking, tuple(s.value for s in ServiceBookingStatus), TravelBooking.depart_at
    ),
    TravelResource.ACCOMMODATION: _Spec(
        AccommodationBooking, tuple(s.value for s in ServiceBookingStatus), AccommodationBooking.check_in
    ),
    TravelResource.SERVICES: _Spec(
        ServiceBooking, tuple(s.value for s in ServiceBookingStatus), ServiceBooking.starts_at
    ),
    TravelResource.SOS: _Spec(SosAlert, tuple(s.value for s in SosStatus), SosAlert.created_at),
}


def scoped(resource: TravelResource, user: User) -> Select[Any]:
    return {
        TravelResource.VISA: travel_service.scoped_visas,
        TravelResource.TRAVEL: travel_service.scoped_travel,
        TravelResource.ACCOMMODATION: travel_service.scoped_accommodation,
        TravelResource.SERVICES: travel_service.scoped_services,
        TravelResource.SOS: travel_service.scoped_sos,
    }[resource](user)


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def apply_filters(
    stmt: Select[Any],
    resource: TravelResource,
    *,
    status: Sequence[Any] | None = None,
    kind: Sequence[Any] | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Select[Any]:
    """``status``/``kind`` any-of; ``q`` matches the patient's name; ``date_from``/``date_to`` are inclusive
    IST days on the resource's key date (visa: requested, travel: departure, stay: check-in,
    service: start, SOS: raised)."""
    spec = SPECS[resource]
    model = spec.model
    if status:
        stmt = stmt.where(model.status.in_(list(status)))
    if kind and hasattr(model, "kind"):
        stmt = stmt.where(model.kind.in_(list(kind)))
    term = " ".join((q or "").split())[:100]
    if term:
        pattern = _like(term)
        full_name = func.concat(PatientProfile.first_name, " ", PatientProfile.last_name)
        stmt = stmt.where(
            model.patient_id.in_(
                select(PatientProfile.id).where(
                    or_(
                        PatientProfile.first_name.ilike(pattern, escape="\\"),
                        PatientProfile.last_name.ilike(pattern, escape="\\"),
                        full_name.ilike(pattern, escape="\\"),
                    )
                )
            )
        )
    col = spec.date_col
    is_date = resource is TravelResource.ACCOMMODATION
    if date_from is not None:
        stmt = stmt.where(
            col >= (date_from if is_date else datetime.combine(date_from, time.min, tzinfo=IST))
        )
    if date_to is not None:
        if is_date:
            stmt = stmt.where(col <= date_to)
        else:
            stmt = stmt.where(col < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=IST))
    return stmt


async def status_counts(
    db: AsyncSession, user: User, resource: TravelResource, **filters: Any
) -> dict[str, int]:
    """Visible rows per status for the given filters (``status`` ignored); every status key present."""
    filters.pop("status", None)
    spec = SPECS[resource]
    base = scoped(resource, user).with_only_columns(spec.model.id, spec.model.status.label("k"))
    inner = apply_filters(base, resource, **filters).subquery()
    rows = (await db.execute(select(inner.c.k, func.count()).group_by(inner.c.k))).all()
    counts = dict.fromkeys(spec.statuses, 0)
    for value, count in rows:
        counts[str(getattr(value, "value", value))] = int(count)
    return counts
