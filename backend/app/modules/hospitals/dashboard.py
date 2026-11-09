"""Hospital-portal dashboard (PLAN 8.5): KPI counts, collected revenue and a 12-month series.

Months are Indian calendar months (IST). Revenue = captured patient payments for the hospital's bookings, in
the platform base currency (INR, ``payments.base_amount_minor``), before refunds.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BookingStatus, CaseStatus, PaymentStatus, QuoteStatus
from app.core.money import BASE_CURRENCY
from app.models import Booking, Case, Payment, PaymentOrder, Quote
from app.modules.catalog.service import IST, today_ist
from app.modules.hospitals.policies import PortalContext
from app.modules.hospitals.schemas import DashboardOut, MonthlyPoint

MONTHS = 12
RECENT_CASES = 5
CAPTURED_STATUSES = (PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED)


def _month_key(column: Any) -> Any:
    """``'YYYY-MM'`` of a timestamptz column in IST, independent of the session time zone."""
    # Literal SQL (no bind parameters) so the identical expression can be used in SELECT and GROUP BY.
    return func.to_char(
        func.timezone(literal_column("'UTC'"), column) + literal_column("interval '5 hours 30 minutes'"),
        literal_column("'YYYY-MM'"),
    )


def _shift_month(d: date, months: int) -> date:
    index = d.year * 12 + (d.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def _ist_start(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=IST)


async def _count(db: AsyncSession, stmt: Any) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


async def dashboard(db: AsyncSession, ctx: PortalContext) -> DashboardOut:
    hid = ctx.hospital_id
    today = today_ist()
    this_month = today.replace(day=1)
    first_month = _shift_month(this_month, -(MONTHS - 1))

    enquiries_open = await _count(
        db, select(func.count(Case.id)).where(Case.hospital_id == hid, Case.status == CaseStatus.ENQUIRY)
    )
    quotes_pending = await _count(
        db, select(func.count(Quote.id)).where(Quote.hospital_id == hid, Quote.status == QuoteStatus.SENT)
    )
    bookings_upcoming = await _count(
        db,
        select(func.count(Booking.id)).where(
            Booking.hospital_id == hid,
            Booking.status.in_([BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED]),
            or_(Booking.admission_date.is_(None), Booking.admission_date >= today),
        ),
    )
    patients_in_treatment = await _count(
        db,
        select(func.count(Booking.id)).where(
            Booking.hospital_id == hid, Booking.status == BookingStatus.ADMITTED
        ),
    )

    payments = (
        select(Payment.base_amount_minor.label("amount"), Payment.captured_at.label("captured_at"))
        .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
        .join(Booking, Booking.id == PaymentOrder.booking_id)
        .where(
            Booking.hospital_id == hid,
            Payment.status.in_(CAPTURED_STATUSES),
            Payment.captured_at.is_not(None),
            Payment.captured_at >= _ist_start(first_month),
        )
        .subquery()
    )
    revenue_rows: dict[str, int] = dict(
        (
            await db.execute(
                select(
                    _month_key(payments.c.captured_at), func.coalesce(func.sum(payments.c.amount), 0)
                ).group_by(_month_key(payments.c.captured_at))
            )
        ).all()
    )
    booking_rows: dict[str, int] = dict(
        (
            await db.execute(
                select(_month_key(Booking.created_at), func.count(Booking.id))
                .where(
                    Booking.hospital_id == hid,
                    Booking.status != BookingStatus.CANCELLED,
                    Booking.created_at >= _ist_start(first_month),
                )
                .group_by(_month_key(Booking.created_at))
            )
        ).all()
    )
    monthly: list[MonthlyPoint] = []
    for i in range(MONTHS):
        key = _shift_month(first_month, i).strftime("%Y-%m")
        monthly.append(
            MonthlyPoint(
                month=key, bookings=int(booking_rows.get(key, 0)), revenue_minor=int(revenue_rows.get(key, 0))
            )
        )

    cases = list(
        (
            await db.execute(
                select(Case)
                .where(Case.hospital_id == hid)
                .order_by(Case.updated_at.desc(), Case.id)
                .limit(RECENT_CASES)
            )
        ).scalars()
    )
    recent_cases: list[Any] = []
    if cases:
        from app.modules.cases.serializers import case_outs  # be-cases owns the CaseOut shape

        recent_cases = [c.model_dump(mode="json") for c in await case_outs(db, cases)]

    return DashboardOut(
        enquiries_open=enquiries_open,
        quotes_pending=quotes_pending,
        bookings_upcoming=bookings_upcoming,
        patients_in_treatment=patients_in_treatment,
        revenue_month_minor=monthly[-1].revenue_minor,
        currency=BASE_CURRENCY,
        monthly=monthly,
        recent_cases=recent_cases,
    )
