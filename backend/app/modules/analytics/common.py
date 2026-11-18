"""Shared building blocks for the analytics endpoints: date window + buckets, filters, small-cell suppression and
the short-lived cache.

* **Time zone.** Every date (``from``/``to``, buckets, months) is an India Standard Time calendar day
  (``Asia/Kolkata``, UTC+05:30, no DST) - the same convention as the admin reports and invoices. Responses say so
  in ``meta.timezone``.
* **Window.** ``from``/``to`` are inclusive IST days (default: the last 30 days incl. today), at most 2 years.
  Granularity ``day`` | ``week`` (ISO weeks, Monday start) | ``month``; when omitted it is chosen from the length
  of the window (<= 62 days: day, <= 200: week, else month).
* **Filters** apply to case-level data (cases, quotes, bookings, reviews, aftercare, payments, commission):
  patient's home country (``country_of_residence`` -> ``nationality`` -> account country), specialty (case
  specialty, else its procedure's), hospital, agent, channel (``agent`` = the case has an agent, ``direct`` = it
  has none). Steps before a case exists (guest sessions, scans, registrations, screenings) are not attributable
  to those dimensions and come back as ``null`` when any filter is set.
* **Privacy.** Only aggregates leave this module; breakdown cells between 1 and ``MIN_CELL - 1`` are suppressed
  (``null`` + ``suppressed: true``) so a small group cannot point at one patient.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

import orjson
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.sql.elements import ColumnElement

from app.core import cache
from app.core.errors import BadRequest
from app.models import Case, PatientProfile, Procedure, User
from app.modules.admin.reports import IST, IST_ZONE, add_months, ist_start, today_ist

Granularity = Literal["day", "week", "month"]
Channel = Literal["direct", "agent"]

TIMEZONE = IST_ZONE
MIN_CELL = 5
MAX_RANGE_DAYS = 731
DEFAULT_DAYS = 30
CACHE_TTL_SECONDS = 60
CACHE_PREFIX = "analytics:"


# ------------------------------------------------------------------------------------------------- schemas
class AnalyticsMeta(BaseModel):
    date_from: date
    date_to: date
    granularity: Granularity
    timezone: str = TIMEZONE
    filters: dict[str, str | None]
    generated_at: datetime
    min_cell: int = MIN_CELL


# -------------------------------------------------------------------------------------------------- window
@dataclass(frozen=True)
class Window:
    date_from: date
    date_to: date
    granularity: Granularity

    @property
    def lo(self) -> datetime:
        return ist_start(self.date_from)

    @property
    def hi(self) -> datetime:
        return ist_start(self.date_to + timedelta(days=1))

    def first_bucket(self) -> date:
        if self.granularity == "week":
            return self.date_from - timedelta(days=self.date_from.weekday())
        if self.granularity == "month":
            return self.date_from.replace(day=1)
        return self.date_from

    def buckets(self) -> list[date]:
        out: list[date] = []
        cur = self.first_bucket()
        while cur <= self.date_to:
            out.append(cur)
            if self.granularity == "day":
                cur += timedelta(days=1)
            elif self.granularity == "week":
                cur += timedelta(days=7)
            else:
                cur = add_months(cur, 1)
        return out

    def between(self, col: Any) -> list[ColumnElement[bool]]:
        return [col >= self.lo, col < self.hi]


def auto_granularity(start: date, end: date) -> Granularity:
    days = (end - start).days + 1
    if days <= 62:
        return "day"
    if days <= 200:
        return "week"
    return "month"


def make_window(
    date_from: date | None, date_to: date | None, granularity: Granularity | None, *, default_days: int = DEFAULT_DAYS
) -> Window:
    end = date_to or today_ist()
    start = date_from or end - timedelta(days=default_days - 1)
    if start > end:
        raise BadRequest("'from' must be on or before 'to'", code="invalid_date_range")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise BadRequest("The date range is limited to 2 years", code="invalid_date_range")
    return Window(start, end, granularity or auto_granularity(start, end))


def bucket_expr(col: Any, granularity: Granularity) -> Any:
    """``date_trunc(<granularity>, col AT TIME ZONE 'Asia/Kolkata')`` - a naive IST timestamp."""
    return func.date_trunc(granularity, func.timezone(IST_ZONE, col))


def bucket_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def now_ist() -> datetime:
    return datetime.now(IST)


# ------------------------------------------------------------------------------------------------- filters
@dataclass(frozen=True)
class Filters:
    country: str | None = None
    specialty_id: uuid.UUID | None = None
    hospital_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    channel: Channel | None = None

    @property
    def any(self) -> bool:
        return any(v is not None for v in (self.country, self.specialty_id, self.hospital_id, self.agent_id, self.channel))

    def as_dict(self) -> dict[str, str | None]:
        return {
            "country": self.country,
            "specialty_id": str(self.specialty_id) if self.specialty_id else None,
            "hospital_id": str(self.hospital_id) if self.hospital_id else None,
            "agent_id": str(self.agent_id) if self.agent_id else None,
            "channel": self.channel,
        }


def normalize_country(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    code = value.strip().upper()
    if len(code) != 2 or not code.isalpha():
        raise BadRequest("country must be an ISO-3166 alpha-2 code", code="invalid_country")
    return code


def patient_country_expr() -> Any:
    """Home country of a patient (needs ``PatientProfile`` joined with ``User``)."""
    return func.upper(
        func.coalesce(PatientProfile.country_of_residence, PatientProfile.nationality, User.country_code)
    )


def country_patient_ids(country: str) -> Select[Any]:
    return (
        select(PatientProfile.id)
        .join(User, User.id == PatientProfile.user_id)
        .where(patient_country_expr() == country)
    )


def case_specialty_expr() -> Any:
    """Case specialty, else the specialty of its procedure (correlated to ``Case``)."""
    return func.coalesce(
        Case.specialty_id,
        select(Procedure.specialty_id).where(Procedure.id == Case.procedure_id).scalar_subquery(),
    )


def case_conditions(f: Filters) -> list[ColumnElement[bool]]:
    """WHERE clauses on ``Case`` for the filters (empty when no filter is set)."""
    conds: list[ColumnElement[bool]] = []
    if f.hospital_id is not None:
        conds.append(Case.hospital_id == f.hospital_id)
    if f.agent_id is not None:
        conds.append(Case.agent_id == f.agent_id)
    if f.channel == "agent":
        conds.append(Case.agent_id.is_not(None))
    elif f.channel == "direct":
        conds.append(Case.agent_id.is_(None))
    if f.specialty_id is not None:
        conds.append(case_specialty_expr() == f.specialty_id)
    if f.country is not None:
        conds.append(Case.patient_id.in_(country_patient_ids(f.country)))
    return conds


def case_scope(case_id_col: Any, f: Filters) -> list[ColumnElement[bool]]:
    """``case_id_col IN (cases matching the filters)`` - nothing when no filter is set."""
    conds = case_conditions(f)
    if not conds:
        return []
    return [case_id_col.in_(select(Case.id).where(*conds))]


# ------------------------------------------------------------------------------------------------- numbers
def suppress(value: int | None) -> int | None:
    """Small-cell suppression: 1..MIN_CELL-1 -> ``None`` (0 stays 0: an empty cell identifies nobody)."""
    if value is None:
        return None
    return None if 0 < value < MIN_CELL else value


def ratio(numerator: int | float | None, denominator: int | float | None) -> float | None:
    if numerator is None or not denominator:
        return None
    return round(float(numerator) / float(denominator), 4)


def hours(value: Any) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


# --------------------------------------------------------------------------------------------------- cache
async def cached[M: BaseModel](
    section: str, scope: str, params: dict[str, Any], model: type[M], build: Callable[[], Awaitable[M]]
) -> M:
    """Serve ``section`` from the cache for ``CACHE_TTL_SECONDS`` (keyed by the caller's scope + params)."""
    digest = hashlib.sha256(orjson.dumps(params, default=str, option=orjson.OPT_SORT_KEYS)).hexdigest()[:24]
    key = f"{CACHE_PREFIX}{section}:{scope}:{digest}"
    hit = await cache.get(key)
    if hit is not None:
        return model.model_validate(hit)
    out = await build()
    await cache.set(key, out.model_dump(mode="json"), ttl=CACHE_TTL_SECONDS)
    return out


def meta(window: Window, filters: Filters | None = None) -> AnalyticsMeta:
    return AnalyticsMeta(
        date_from=window.date_from,
        date_to=window.date_to,
        granularity=window.granularity,
        filters=(filters or Filters()).as_dict(),
        generated_at=datetime.now(UTC),
    )
