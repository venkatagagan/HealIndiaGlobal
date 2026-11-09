"""Filters, sorting, status counts and display enrichment of the staff payment lists.

``GET /payments/orders`` / ``GET /payments/orders/status-counts`` and ``GET /payments/refunds`` /
``GET /payments/refunds/status-counts`` share these helpers so a list and its tab counts always apply the same
filters. Enum filters are repeatable (``?status=pending&status=failed``); date bounds are inclusive Indian
calendar dates; amount bounds are base-currency (INR) minor units so mixed-currency rows compare fairly.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import OrderStatus, PaymentGateway, PaymentMethod, PaymentPurpose, RefundStatus
from app.models import Booking, PatientProfile, Payment, PaymentOrder, Refund, User
from app.models.sequences import IST
from app.modules.payments.schemas import PaymentOrderOut, RefundOut
from app.modules.payments.service import REVIEW_PENDING_KEY

ORDER_SORT_FIELDS: dict[str, Any] = {
    "created_at": PaymentOrder.created_at,
    "paid_at": PaymentOrder.paid_at,
    "base_amount_minor": PaymentOrder.base_amount_minor,
    "amount_minor": PaymentOrder.amount_minor,
    "order_number": PaymentOrder.order_number,
    "status": PaymentOrder.status,
}
ORDER_SORT_PATTERN = r"^-?(" + "|".join(ORDER_SORT_FIELDS) + r")$"

REFUND_SORT_FIELDS: dict[str, Any] = {
    "created_at": Refund.created_at,
    "processed_at": Refund.processed_at,
    "base_amount_minor": Refund.base_amount_minor,
    "amount_minor": Refund.amount_minor,
    "status": Refund.status,
}
REFUND_SORT_PATTERN = r"^-?(" + "|".join(REFUND_SORT_FIELDS) + r")$"


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=IST)


def _date_window(column: Any, start: date | None, end: date | None) -> list[Any]:
    clauses: list[Any] = []
    if start is not None:
        clauses.append(column >= _day_start(start))
    if end is not None:
        clauses.append(column < _day_start(end + timedelta(days=1)))
    return clauses


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _patient_ids_matching(pattern: str) -> Select[Any]:
    full = func.concat(PatientProfile.first_name, " ", PatientProfile.last_name)
    return select(PatientProfile.id).where(full.ilike(pattern, escape="\\"))


def apply_sort(stmt: Select[Any], fields: dict[str, Any], sort: str | None, tiebreak: Any) -> Select[Any]:
    """``field`` ascending / ``-field`` descending (default ``-created_at``); NULLs last; id tiebreak."""
    sort = sort or "-created_at"
    descending = sort.startswith("-")
    column = fields.get(sort.lstrip("-"), fields["created_at"])
    if descending:
        return stmt.order_by(column.desc().nulls_last(), tiebreak.desc())
    return stmt.order_by(column.asc().nulls_last(), tiebreak.asc())


# ----------------------------------------------------------------------------------------------- orders
@dataclass(frozen=True, slots=True)
class OrderListFilters:
    status: Sequence[OrderStatus] | None = None
    booking_id: uuid.UUID | None = None
    gateway: Sequence[PaymentGateway] | None = None
    purpose: Sequence[PaymentPurpose] | None = None
    method: Sequence[PaymentMethod] | None = None
    currency: Sequence[str] | None = None
    q: str | None = None
    review: str | None = None
    created_from: date | None = None
    created_to: date | None = None
    paid_from: date | None = None
    paid_to: date | None = None
    min_amount: int | None = None
    max_amount: int | None = None


def review_clause(review: str | None) -> Any | None:
    amount = func.jsonb_array_length(PaymentOrder.meta[REVIEW_PENDING_KEY]) > 0
    mark_paid = PaymentOrder.meta["mark_paid_request"]["status"].astext == "pending"
    if review == "amount":
        return amount
    if review == "mark_paid":
        return mark_paid
    if review == "any":
        return or_(amount, mark_paid)
    return None


def order_clauses(f: OrderListFilters, *, with_status: bool = True, with_review: bool = True) -> list[Any]:
    clauses: list[Any] = []
    if with_review and (clause := review_clause(f.review)) is not None:
        clauses.append(clause)
    if with_status and f.status:
        clauses.append(PaymentOrder.status.in_(list(f.status)))
    if f.booking_id is not None:
        clauses.append(PaymentOrder.booking_id == f.booking_id)
    if f.gateway:
        clauses.append(PaymentOrder.gateway.in_(list(f.gateway)))
    if f.purpose:
        clauses.append(PaymentOrder.purpose.in_(list(f.purpose)))
    if f.method:
        clauses.append(
            PaymentOrder.id.in_(select(Payment.order_id).where(Payment.method.in_(list(f.method))))
        )
    if f.currency:
        clauses.append(PaymentOrder.currency.in_([c.upper() for c in f.currency]))
    clauses += _date_window(PaymentOrder.created_at, f.created_from, f.created_to)
    clauses += _date_window(PaymentOrder.paid_at, f.paid_from, f.paid_to)
    if f.min_amount is not None:
        clauses.append(PaymentOrder.base_amount_minor >= f.min_amount)
    if f.max_amount is not None:
        clauses.append(PaymentOrder.base_amount_minor <= f.max_amount)
    if f.q and f.q.strip():
        term = f.q.strip()[:64]
        pattern = _like(term)
        clauses.append(
            or_(
                PaymentOrder.order_number.ilike(pattern, escape="\\"),
                PaymentOrder.gateway_order_id == term,
                PaymentOrder.booking_id.in_(
                    select(Booking.id).where(Booking.booking_number.ilike(pattern, escape="\\"))
                ),
                PaymentOrder.patient_id.in_(_patient_ids_matching(pattern)),
            )
        )
    return clauses


async def order_status_counts(
    db: AsyncSession, scope: Any | None, f: OrderListFilters
) -> tuple[dict[str, int], dict[str, int]]:
    """Orders per status and per finance-review queue for the filters (``status`` and ``review`` ignored)."""
    clauses = order_clauses(f, with_status=False, with_review=False)
    if scope is not None:
        clauses.append(scope)
    rows = (
        await db.execute(
            select(PaymentOrder.status, func.count()).where(*clauses).group_by(PaymentOrder.status)
        )
    ).all()
    counts = {s.value: 0 for s in OrderStatus}
    for value, count in rows:
        counts[OrderStatus(value).value] = int(count)
    review: dict[str, int] = {}
    for kind in ("amount", "mark_paid", "any"):
        review[kind] = int(
            (
                await db.execute(
                    select(func.count()).select_from(PaymentOrder).where(*clauses, review_clause(kind))
                )
            ).scalar_one()
        )
    return counts, review


async def _names(db: AsyncSession, model: Any, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    if model is PatientProfile:
        rows = await db.execute(
            select(PatientProfile.id, PatientProfile.first_name, PatientProfile.last_name).where(
                PatientProfile.id.in_(ids)
            )
        )
        return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows.all()}
    rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
    return {r[0]: r[1] for r in rows.all() if r[1]}


async def enrich_orders(db: AsyncSession, orders: Sequence[PaymentOrder]) -> list[PaymentOrderOut]:
    """``PaymentOrderOut`` plus the staff display fields (payer, patient, booking number, payment method)."""
    outs = [PaymentOrderOut.model_validate(o) for o in orders]
    if not orders:
        return outs
    payers = await _names(db, User, {o.payer_user_id for o in orders})
    patients = await _names(db, PatientProfile, {o.patient_id for o in orders})
    booking_ids = {o.booking_id for o in orders if o.booking_id}
    bookings: dict[uuid.UUID, str] = {}
    if booking_ids:
        rows = await db.execute(select(Booking.id, Booking.booking_number).where(Booking.id.in_(booking_ids)))
        bookings = {r[0]: r[1] for r in rows.all()}
    methods: dict[uuid.UUID, PaymentMethod] = {}
    rows = await db.execute(
        select(Payment.order_id, Payment.method)
        .where(Payment.order_id.in_([o.id for o in orders]), Payment.method.is_not(None))
        .order_by(Payment.created_at)
    )
    for order_id, method in rows.all():
        methods[order_id] = method  # latest attempt wins
    for order, out in zip(orders, outs, strict=True):
        out.payer_name = payers.get(order.payer_user_id) or patients.get(order.patient_id)
        out.patient_name = patients.get(order.patient_id)
        out.booking_number = bookings.get(order.booking_id) if order.booking_id else None
        out.payment_method = methods.get(order.id)
    return outs


# ----------------------------------------------------------------------------------------------- refunds
@dataclass(frozen=True, slots=True)
class RefundListFilters:
    status: Sequence[RefundStatus] | None = None
    booking_id: uuid.UUID | None = None
    payment_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    q: str | None = None
    created_from: date | None = None
    created_to: date | None = None
    min_amount: int | None = None
    max_amount: int | None = None
    awaiting_second_approval: bool = False


def second_approval_clause(threshold_minor: int) -> Any:
    """Requested refunds above the dual-approval threshold: a finance user other than the requester must
    approve them (the requester's own 24 h self-approvals can only lower the limit further)."""
    return (Refund.status == RefundStatus.REQUESTED) & (Refund.base_amount_minor > threshold_minor)


def refund_clauses(
    f: RefundListFilters, *, threshold_minor: int, with_status: bool = True, with_queue: bool = True
) -> list[Any]:
    clauses: list[Any] = []
    if with_status and f.status:
        clauses.append(Refund.status.in_(list(f.status)))
    if with_queue and f.awaiting_second_approval:
        clauses.append(second_approval_clause(threshold_minor))
    if f.booking_id is not None:
        clauses.append(Refund.booking_id == f.booking_id)
    if f.payment_id is not None:
        clauses.append(Refund.payment_id == f.payment_id)
    if f.order_id is not None:
        clauses.append(Refund.order_id == f.order_id)
    clauses += _date_window(Refund.created_at, f.created_from, f.created_to)
    if f.min_amount is not None:
        clauses.append(Refund.base_amount_minor >= f.min_amount)
    if f.max_amount is not None:
        clauses.append(Refund.base_amount_minor <= f.max_amount)
    if f.q and f.q.strip():
        term = f.q.strip()[:64]
        pattern = _like(term)
        clauses.append(
            or_(
                Refund.gateway_refund_id == term,
                Refund.order_id.in_(
                    select(PaymentOrder.id).where(
                        or_(
                            PaymentOrder.order_number.ilike(pattern, escape="\\"),
                            PaymentOrder.patient_id.in_(_patient_ids_matching(pattern)),
                        )
                    )
                ),
                Refund.booking_id.in_(
                    select(Booking.id).where(Booking.booking_number.ilike(pattern, escape="\\"))
                ),
            )
        )
    return clauses


async def refund_status_counts(
    db: AsyncSession, f: RefundListFilters, *, threshold_minor: int
) -> tuple[dict[str, int], int]:
    """Refunds per status plus the "awaiting a second approver" queue (``status`` / queue filters ignored)."""
    clauses = refund_clauses(f, threshold_minor=threshold_minor, with_status=False, with_queue=False)
    rows = (
        await db.execute(select(Refund.status, func.count()).where(*clauses).group_by(Refund.status))
    ).all()
    counts = {s.value: 0 for s in RefundStatus}
    for value, count in rows:
        counts[RefundStatus(value).value] = int(count)
    second = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Refund)
                .where(*clauses, second_approval_clause(threshold_minor))
            )
        ).scalar_one()
    )
    return counts, second


async def enrich_refunds(db: AsyncSession, refunds: Sequence[Refund]) -> list[RefundOut]:
    """``RefundOut`` plus order number, patient and requester / approver names."""
    outs = [RefundOut.model_validate(r) for r in refunds]
    if not refunds:
        return outs
    order_rows = await db.execute(
        select(PaymentOrder.id, PaymentOrder.order_number, PaymentOrder.patient_id).where(
            PaymentOrder.id.in_({r.order_id for r in refunds})
        )
    )
    orders = {r[0]: (r[1], r[2]) for r in order_rows.all()}
    patients = await _names(db, PatientProfile, {p for _, p in orders.values() if p})
    users = await _names(
        db, User, {u for r in refunds for u in (r.requested_by, r.approved_by) if u is not None}
    )
    for refund, out in zip(refunds, outs, strict=True):
        number, patient_id = orders.get(refund.order_id, (None, None))
        out.order_number = number
        out.patient_name = patients.get(patient_id) if patient_id else None
        out.requested_by_name = users.get(refund.requested_by) if refund.requested_by else None
        out.approved_by_name = users.get(refund.approved_by) if refund.approved_by else None
    return outs
