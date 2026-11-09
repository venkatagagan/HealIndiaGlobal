"""Earliest free appointment dates ("appointment within days") for catalogue cards and lists.

One aggregate query per list: the earliest free day (``capacity > booked``, today or later in IST) per
``(hospital, doctor or NULL, slot kind)``. Hospital-wide slots have ``doctor_id`` NULL; slots of inactive
doctors are ignored::

    minima = await slot_minima(db, hospital_ids)
    minima.hospital(hid, SlotKind.ADMISSION)              # any slot at the hospital
    minima.doctor(did, hid, SlotKind.CONSULTATION)        # the doctor's own + hospital-wide slots
    minima.offering(hid, lead_doctor_ids, SlotKind.ADMISSION)
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import SlotKind
from app.models import AvailabilitySlot, Doctor, Hospital

IST = timezone(timedelta(hours=5, minutes=30))

__all__ = ["SlotMinima", "doctor_soonest_subq", "hospital_soonest_subq", "slot_minima"]


def _today_ist() -> date:
    return datetime.now(UTC).astimezone(IST).date()


def _kind(value: Any) -> str:
    return str(getattr(value, "value", value))


def _earliest(values: Iterable[date | None]) -> date | None:
    found = [v for v in values if v is not None]
    return min(found) if found else None


@dataclass
class SlotMinima:
    """Earliest free day per ``(hospital_id, doctor_id | None, slot_kind)``."""

    rows: dict[tuple[uuid.UUID, uuid.UUID | None, str], date] = field(default_factory=dict)
    _by_hospital: dict[tuple[uuid.UUID, str], date] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        for (hid, _did, kind), day in self.rows.items():
            current = self._by_hospital.get((hid, kind))
            if current is None or day < current:
                self._by_hospital[(hid, kind)] = day

    def hospital(self, hospital_id: uuid.UUID, kind: SlotKind | str) -> date | None:
        return self._by_hospital.get((hospital_id, _kind(kind)))

    def doctor(self, doctor_id: uuid.UUID, hospital_id: uuid.UUID, kind: SlotKind | str) -> date | None:
        k = _kind(kind)
        return _earliest([self.rows.get((hospital_id, doctor_id, k)), self.rows.get((hospital_id, None, k))])

    def offering(
        self, hospital_id: uuid.UUID, doctor_ids: Sequence[uuid.UUID] | None, kind: SlotKind | str
    ) -> date | None:
        """Lead doctors' slots plus hospital-wide slots; without lead doctors, any slot at the hospital."""
        k = _kind(kind)
        if not doctor_ids:
            return self.hospital(hospital_id, k)
        return _earliest(
            [self.rows.get((hospital_id, None, k))] + [self.rows.get((hospital_id, d, k)) for d in doctor_ids]
        )

    def pair(self, day_for: Any) -> dict[str, date | None]:
        """``next_available_consultation`` / ``next_available_admission`` kwargs from ``day_for(kind)``."""
        return {
            "next_available_consultation": day_for(SlotKind.CONSULTATION),
            "next_available_admission": day_for(SlotKind.ADMISSION),
        }


def _free_slot_conditions() -> list[Any]:
    active_doctor = (
        select(Doctor.id).where(Doctor.id == AvailabilitySlot.doctor_id, Doctor.is_active.is_(True)).exists()
    )
    return [
        AvailabilitySlot.date >= _today_ist(),
        AvailabilitySlot.capacity > AvailabilitySlot.booked,
        or_(AvailabilitySlot.doctor_id.is_(None), active_doctor),
    ]


async def slot_minima(db: AsyncSession, hospital_ids: Iterable[uuid.UUID]) -> SlotMinima:
    ids = list({h for h in hospital_ids if h is not None})
    if not ids:
        return SlotMinima()
    rows = await db.execute(
        select(
            AvailabilitySlot.hospital_id,
            AvailabilitySlot.doctor_id,
            AvailabilitySlot.slot_kind,
            func.min(AvailabilitySlot.date),
        )
        .where(AvailabilitySlot.hospital_id.in_(ids), *_free_slot_conditions())
        .group_by(AvailabilitySlot.hospital_id, AvailabilitySlot.doctor_id, AvailabilitySlot.slot_kind)
    )
    return SlotMinima({(hid, did, _kind(kind)): day for hid, did, kind, day in rows.all() if day is not None})


def hospital_soonest_subq(kind: SlotKind | None = None) -> Any:
    """Correlated scalar subquery: the hospital's earliest free day (``kind`` or any kind)."""
    stmt = select(func.min(AvailabilitySlot.date)).where(
        AvailabilitySlot.hospital_id == Hospital.id, *_free_slot_conditions()
    )
    if kind is not None:
        stmt = stmt.where(AvailabilitySlot.slot_kind == kind)
    return stmt.correlate(Hospital).scalar_subquery()


def doctor_soonest_subq(kind: SlotKind | None = None) -> Any:
    """Correlated scalar subquery: the doctor's earliest free day (own or hospital-wide slots)."""
    stmt = select(func.min(AvailabilitySlot.date)).where(
        AvailabilitySlot.date >= _today_ist(),
        AvailabilitySlot.capacity > AvailabilitySlot.booked,
        or_(
            AvailabilitySlot.doctor_id == Doctor.id,
            and_(AvailabilitySlot.doctor_id.is_(None), AvailabilitySlot.hospital_id == Doctor.hospital_id),
        ),
    )
    if kind is not None:
        stmt = stmt.where(AvailabilitySlot.slot_kind == kind)
    return stmt.correlate(Doctor).scalar_subquery()
