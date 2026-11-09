"""Search, date / amount windows, sorting and per-status counts for the finance settlement lists.

All filters are optional and additive to the original list endpoints. Dates are inclusive IST calendar days
(``created_to=2026-10-21`` includes the whole of 21 Oct IST). ``sort`` is ``field`` (ascending) or ``-field``
(descending); ties are broken by id so pagination is stable.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Select, and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PayeeType
from app.models.agents import Agent
from app.models.cases import Booking
from app.models.catalog import Procedure, Specialty
from app.models.hospitals import Hospital
from app.models.identity import User
from app.models.payments import Invoice
from app.models.sequences import IST
from app.models.settlements import Payout, PayoutAccount, SettlementBatch, SettlementItem
from app.models.travel import AccommodationProvider, ServiceProvider
from app.modules.settlements.schemas import CommissionRuleOut

# ------------------------------------------------------------------------------------------------ sorting
ITEM_SORT_FIELDS: Mapping[str, Any] = {
    "created_at": SettlementItem.created_at,
    "eligible_at": SettlementItem.eligible_at,
    "net_minor": SettlementItem.net_minor,
    "gross_minor": SettlementItem.gross_minor,
    "status": SettlementItem.status,
}
BATCH_SORT_FIELDS: Mapping[str, Any] = {
    "created_at": SettlementBatch.created_at,
    "batch_number": SettlementBatch.batch_number,
    "period_end": SettlementBatch.period_end,
    "items_count": SettlementBatch.items_count,
    "total_net_minor": SettlementBatch.total_net_minor,
    "status": SettlementBatch.status,
}
PAYOUT_SORT_FIELDS: Mapping[str, Any] = {
    "created_at": Payout.created_at,
    "processed_at": Payout.processed_at,
    "amount_minor": Payout.amount_minor,
    "status": Payout.status,
}
DOCUMENT_SORT_FIELDS: Mapping[str, Any] = {
    "issued_at": Invoice.issued_at,
    "invoice_number": Invoice.invoice_number,
    "total_minor": Invoice.total_minor,
}
ACCOUNT_SORT_FIELDS: Mapping[str, Any] = {
    "created_at": PayoutAccount.created_at,
    "account_holder_name": PayoutAccount.account_holder_name,
}


def sort_pattern(fields: Mapping[str, Any]) -> str:
    return "^-?(" + "|".join(sorted(fields)) + ")$"


ITEM_SORT_PATTERN = sort_pattern(ITEM_SORT_FIELDS)
BATCH_SORT_PATTERN = sort_pattern(BATCH_SORT_FIELDS)
PAYOUT_SORT_PATTERN = sort_pattern(PAYOUT_SORT_FIELDS)
DOCUMENT_SORT_PATTERN = sort_pattern(DOCUMENT_SORT_FIELDS)
ACCOUNT_SORT_PATTERN = sort_pattern(ACCOUNT_SORT_FIELDS)


def apply_sort(stmt: Select[Any], sort: str | None, fields: Mapping[str, Any], id_column: Any) -> Select[Any]:
    """Replace the statement's ordering with ``sort`` (unknown / empty: keep the endpoint's default order).
    Nullable columns sort their NULLs last in both directions."""
    if not sort:
        return stmt
    descending = sort.startswith("-")
    column = fields.get(sort.lstrip("-"))
    if column is None:
        return stmt
    if descending:
        return stmt.order_by(None).order_by(column.desc().nulls_last(), id_column.desc())
    return stmt.order_by(None).order_by(column.asc().nulls_last(), id_column.asc())


# ------------------------------------------------------------------------------------------------ helpers
def like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def ist_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def date_window(column: Any, start: date | None, end: date | None) -> list[Any]:
    """Inclusive IST calendar-day window on a timestamp column."""
    clauses: list[Any] = []
    if start is not None:
        clauses.append(column >= ist_day_start(start))
    if end is not None:
        clauses.append(column < ist_day_start(end + timedelta(days=1)))
    return clauses


def amount_window(column: Any, low: int | None, high: int | None) -> list[Any]:
    clauses: list[Any] = []
    if low is not None:
        clauses.append(column >= low)
    if high is not None:
        clauses.append(column <= high)
    return clauses


def payee_name_matches(type_column: Any, id_column: Any, pattern: str) -> Any:
    """Payee (hospital / agent / vendor) whose display name matches the ILIKE ``pattern``."""
    return or_(
        and_(
            type_column == PayeeType.HOSPITAL,
            id_column.in_(select(Hospital.id).where(Hospital.name.ilike(pattern))),
        ),
        and_(
            type_column == PayeeType.AGENT,
            id_column.in_(
                select(Agent.id).where(or_(Agent.agency_name.ilike(pattern), Agent.agent_code.ilike(pattern)))
            ),
        ),
        and_(
            type_column == PayeeType.VENDOR,
            or_(
                id_column.in_(select(ServiceProvider.id).where(ServiceProvider.name.ilike(pattern))),
                id_column.in_(
                    select(AccommodationProvider.id).where(AccommodationProvider.name.ilike(pattern))
                ),
            ),
        ),
    )


def _q(q: str | None) -> str | None:
    q = (q or "").strip()
    return like_pattern(q) if q else None


def _in(column: Any, values: list[Any] | None) -> list[Any]:
    return [column.in_(values)] if values else []


# ------------------------------------------------------------------------------------------------ filters
@dataclass(slots=True)
class ItemListFilters:
    q: str | None = None
    eligible_from: date | None = None
    eligible_to: date | None = None
    created_from: date | None = None
    created_to: date | None = None
    min_net: int | None = None
    max_net: int | None = None

    def clauses(self) -> list[Any]:
        out: list[Any] = [
            *date_window(SettlementItem.eligible_at, self.eligible_from, self.eligible_to),
            *date_window(SettlementItem.created_at, self.created_from, self.created_to),
            *amount_window(SettlementItem.net_minor, self.min_net, self.max_net),
        ]
        pattern = _q(self.q)
        if pattern:
            out.append(
                or_(
                    SettlementItem.booking_id.in_(
                        select(Booking.id).where(Booking.booking_number.ilike(pattern))
                    ),
                    payee_name_matches(SettlementItem.payee_type, SettlementItem.payee_id, pattern),
                )
            )
        return out


@dataclass(slots=True)
class BatchListFilters:
    status: list[Any] | None = None
    payee_type: PayeeType | None = None
    payee_id: uuid.UUID | None = None
    auto: bool | None = None
    q: str | None = None
    created_from: date | None = None
    created_to: date | None = None
    min_net: int | None = None
    max_net: int | None = None

    def clauses(self, *, with_status: bool = True) -> list[Any]:
        out: list[Any] = [
            *(_in(SettlementBatch.status, self.status) if with_status else []),
            *date_window(SettlementBatch.created_at, self.created_from, self.created_to),
            *amount_window(SettlementBatch.total_net_minor, self.min_net, self.max_net),
        ]
        if self.payee_type is not None:
            out.append(SettlementBatch.payee_type == self.payee_type)
        if self.payee_id is not None:
            out.append(SettlementBatch.payee_id == self.payee_id)
        if self.auto is not None:
            out.append(
                SettlementBatch.created_by.is_(None) if self.auto else SettlementBatch.created_by.is_not(None)
            )
        pattern = _q(self.q)
        if pattern:
            out.append(
                or_(
                    SettlementBatch.batch_number.ilike(pattern),
                    payee_name_matches(SettlementBatch.payee_type, SettlementBatch.payee_id, pattern),
                    SettlementBatch.created_by.in_(select(User.id).where(User.full_name.ilike(pattern))),
                )
            )
        return out


@dataclass(slots=True)
class PayoutListFilters:
    method: list[Any] | None = None
    q: str | None = None
    created_from: date | None = None
    created_to: date | None = None
    processed_from: date | None = None
    processed_to: date | None = None
    min_amount: int | None = None
    max_amount: int | None = None

    def clauses(self) -> list[Any]:
        out: list[Any] = [
            *_in(Payout.method, self.method),
            *date_window(Payout.created_at, self.created_from, self.created_to),
            *date_window(Payout.processed_at, self.processed_from, self.processed_to),
            *amount_window(Payout.amount_minor, self.min_amount, self.max_amount),
        ]
        pattern = _q(self.q)
        if pattern:
            out.append(
                or_(
                    Payout.utr.ilike(pattern),
                    Payout.gateway_payout_id.ilike(pattern),
                    Payout.batch_id.in_(
                        select(SettlementBatch.id).where(SettlementBatch.batch_number.ilike(pattern))
                    ),
                    payee_name_matches(Payout.payee_type, Payout.payee_id, pattern),
                )
            )
        return out


@dataclass(slots=True)
class DocumentListFilters:
    q: str | None = None
    issued_from: date | None = None
    issued_to: date | None = None
    min_total: int | None = None
    max_total: int | None = None

    def clauses(self) -> list[Any]:
        out: list[Any] = [
            *date_window(Invoice.issued_at, self.issued_from, self.issued_to),
            *amount_window(Invoice.total_minor, self.min_total, self.max_total),
        ]
        pattern = _q(self.q)
        if pattern:
            out.append(
                or_(
                    Invoice.invoice_number.ilike(pattern),
                    Invoice.recipient_gstin.ilike(pattern),
                    Invoice.hospital_id.in_(select(Hospital.id).where(Hospital.name.ilike(pattern))),
                    Invoice.agent_id.in_(select(Agent.id).where(Agent.agency_name.ilike(pattern))),
                )
            )
        return out


@dataclass(slots=True)
class AccountListFilters:
    status: list[Any] | None = None
    q: str | None = None
    route: str | None = None  # "razorpay_route" | "manual"

    def clauses(self, *, with_status: bool = True) -> list[Any]:
        out: list[Any] = [*(_in(PayoutAccount.status, self.status) if with_status else [])]
        if self.route == "razorpay_route":
            out.append(PayoutAccount.razorpay_linked_account_id.is_not(None))
        elif self.route == "manual":
            out.append(PayoutAccount.razorpay_linked_account_id.is_(None))
        q = (self.q or "").strip()
        if q:
            pattern = like_pattern(q)
            out.append(
                or_(
                    PayoutAccount.account_holder_name.ilike(pattern),
                    PayoutAccount.bank_name.ilike(pattern),
                    PayoutAccount.ifsc.ilike(pattern),
                    PayoutAccount.account_number_last4 == q[-4:] if q.isdigit() and len(q) >= 4 else false(),
                    payee_name_matches(PayoutAccount.owner_type, PayoutAccount.owner_id, pattern),
                )
            )
        return out


# ------------------------------------------------------------------------------------------------ counts
async def count_by(db: AsyncSession, stmt: Select[Any], column: Any) -> dict[str, int]:
    """``{value: count}`` of ``column`` over the rows of ``stmt`` (its ordering is dropped)."""
    sub = stmt.order_by(None).subquery()
    rows = (await db.execute(select(sub.c[column.key], func.count()).group_by(sub.c[column.key]))).all()
    return {str(getattr(value, "value", value)): int(n) for value, n in rows}


async def count_rows(db: AsyncSession, stmt: Select[Any]) -> int:
    return int(
        (await db.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))).scalar_one()
    )


# ------------------------------------------------------------------------------------------------ rules
async def commission_rule_outs(db: AsyncSession, rules: list[Any]) -> list[CommissionRuleOut]:
    """``CommissionRuleOut`` with the hospital / specialty / procedure / agent display names."""

    async def names(model: Any, column: Any, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        rows = (await db.execute(select(model.id, column).where(model.id.in_(ids)))).all()
        return {row_id: str(name) for row_id, name in rows}

    hospitals = await names(Hospital, Hospital.name, {r.hospital_id for r in rules if r.hospital_id})
    specialties = await names(Specialty, Specialty.name, {r.specialty_id for r in rules if r.specialty_id})
    procedures = await names(Procedure, Procedure.name, {r.procedure_id for r in rules if r.procedure_id})
    agents = await names(Agent, Agent.agency_name, {r.agent_id for r in rules if r.agent_id})
    out = []
    for rule in rules:
        model = CommissionRuleOut.model_validate(rule)
        model.hospital_name = hospitals.get(rule.hospital_id) if rule.hospital_id else None
        model.specialty_name = specialties.get(rule.specialty_id) if rule.specialty_id else None
        model.procedure_name = procedures.get(rule.procedure_id) if rule.procedure_id else None
        model.agent_name = agents.get(rule.agent_id) if rule.agent_id else None
        out.append(model)
    return out
