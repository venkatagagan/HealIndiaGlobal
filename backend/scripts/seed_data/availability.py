"""Availability calendar parameters: the next 90 days of consultation and admission capacity.

Hospital-level rows (``doctor_id`` NULL) express overall admission/OPD capacity; doctor-level rows drive the
"green = available" calendars. Each doctor has one weekly operating-theatre day without OPD consultations,
works half days on Saturday and is off on Sunday. Fixed public holidays reduce capacity.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from scripts.seed_data.offerings import stable_unit

__all__ = ["AVAILABILITY_DAYS", "doctor_slots", "hospital_slots"]

AVAILABILITY_DAYS = 90

# Capacity per weekday, Monday..Sunday.
_HOSPITAL_CAPACITY: dict[str, tuple[int, ...]] = {
    "consultation": (20, 20, 20, 20, 20, 12, 4),
    "admission": (8, 8, 8, 8, 8, 6, 2),
}
_DOCTOR_CAPACITY: dict[str, tuple[int, ...]] = {
    "consultation": (6, 6, 6, 6, 6, 3, 0),
    "admission": (2, 2, 2, 2, 2, 1, 0),
}

# Holidays inside typical seed windows (month, day) - fixed-date national holidays, plus Diwali 2026.
_FIXED_HOLIDAYS: dict[tuple[int, int], str] = {
    (1, 1): "New Year's Day",
    (1, 26): "Republic Day",
    (8, 15): "Independence Day",
    (10, 2): "Gandhi Jayanti",
    (12, 25): "Christmas",
}
_DATED_HOLIDAYS: dict[date, str] = {date(2026, 11, 8): "Diwali"}


def _holiday(day: date) -> str | None:
    return _DATED_HOLIDAYS.get(day) or _FIXED_HOLIDAYS.get((day.month, day.day))


def _days(start: date, days: int) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(days)]


def hospital_slots(start: date, days: int = AVAILABILITY_DAYS) -> list[dict[str, Any]]:
    """``[{date, slot_kind, capacity}]`` for hospital-level availability (``doctor_id`` NULL)."""
    rows: list[dict[str, Any]] = []
    for day in _days(start, days):
        for kind, per_weekday in _HOSPITAL_CAPACITY.items():
            capacity = per_weekday[day.weekday()]
            if _holiday(day):
                capacity = capacity // 4 if kind == "consultation" else capacity // 2
            if capacity > 0:
                rows.append({"date": day, "slot_kind": kind, "capacity": capacity})
    return rows


def doctor_slots(doctor_slug: str, start: date, days: int = AVAILABILITY_DAYS) -> list[dict[str, Any]]:
    """``[{date, slot_kind, capacity}]`` for one doctor (no rows on days with zero capacity)."""
    ot_day = int(stable_unit(f"{doctor_slug}:ot-day") * 5)  # Monday..Friday
    rows: list[dict[str, Any]] = []
    for day in _days(start, days):
        if _holiday(day):
            continue
        for kind, per_weekday in _DOCTOR_CAPACITY.items():
            capacity = per_weekday[day.weekday()]
            if kind == "consultation" and day.weekday() == ot_day:
                capacity = 0  # operating-theatre day: admissions only
            if capacity > 0:
                rows.append({"date": day, "slot_kind": kind, "capacity": capacity})
    return rows
