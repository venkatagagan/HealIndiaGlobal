"""Admin dashboard, revenue/cases reports and CSV exports (PLAN 8.13).

All numbers come from a handful of GROUP BY queries (no per-row loops over the database):

* GMV = sum of ``payments.base_amount_minor`` (INR) for captured payments (``captured_at`` set and status
  captured / partially_refunded / refunded), bucketed by ``captured_at``.
* Revenue = net credits (credits - reversal debits) to ``PLATFORM:COMMISSION_REVENUE`` and
  ``PLATFORM:SERVICE_FEE_REVENUE``; 0 when the ledger is empty.
* Escrow = the cached balance of ``PLATFORM:PATIENT_ESCROW``.
* Pending settlements = sum of ``net_minor`` over settlement items in ``pending`` or ``eligible``.

Months and date filters use India Standard Time (UTC+05:30, no DST), matching the invoice financial year.
"""

from __future__ import annotations

import csv
import io
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Callable, Sequence
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import Select, String, and_, case, cast, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.core.enums import (
    AgentStatus,
    CaseStatus,
    EntryDirection,
    HospitalStatus,
    PaymentStatus,
    RefundStatus,
    SettlementItemStatus,
    SosStatus,
    UserRole,
)
from app.core.errors import BadRequest
from app.models import (
    Agent,
    Booking,
    Case,
    CaseStatusHistory,
    Hospital,
    LedgerAccount,
    LedgerEntry,
    LedgerTransaction,
    PatientProfile,
    Payment,
    PaymentOrder,
    Procedure,
    Refund,
    SettlementBatch,
    SettlementItem,
    SosAlert,
    Specialty,
    User,
)
from app.modules.admin.schemas import (
    AdminDashboard,
    AgentCounts,
    CasesByHospital,
    CasesMonth,
    CasesReport,
    DashboardMonth,
    ExportType,
    FunnelStage,
    HospitalCounts,
    ReportGroupBy,
    RevenueReport,
    RevenueReportRow,
    RevenueTotals,
    TopHospital,
    TopSpecialty,
)

BASE_CURRENCY = "INR"
IST = timezone(timedelta(hours=5, minutes=30), "IST")
IST_ZONE = "Asia/Kolkata"
ESCROW = "PLATFORM:PATIENT_ESCROW"
COMMISSION_REVENUE = "PLATFORM:COMMISSION_REVENUE"
SERVICE_FEE_REVENUE = "PLATFORM:SERVICE_FEE_REVENUE"
REVENUE_ACCOUNTS = (COMMISSION_REVENUE, SERVICE_FEE_REVENUE)
CAPTURED_STATUSES = (PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED)
PENDING_SETTLEMENT_STATUSES = (SettlementItemStatus.PENDING, SettlementItemStatus.ELIGIBLE)
FUNNEL_STAGES = (
    CaseStatus.ENQUIRY,
    CaseStatus.QUOTED,
    CaseStatus.ACCEPTED,
    CaseStatus.BOOKED,
    CaseStatus.IN_TREATMENT,
    CaseStatus.COMPLETED,
)
BOOKED_ORD = FUNNEL_STAGES.index(CaseStatus.BOOKED)
QUOTED_ORD = FUNNEL_STAGES.index(CaseStatus.QUOTED)
UNASSIGNED = "unassigned"
MAX_REPORT_DAYS = 366 * 5


# --------------------------------------------------------------------------------------------- date helpers
def today_ist() -> date:
    return datetime.now(IST).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, months: int) -> date:
    idx = d.year * 12 + (d.month - 1) + months
    return date(idx // 12, idx % 12 + 1, 1)


def month_key(d: date | datetime) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def ist_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=IST)


def report_range(date_from: date | None, date_to: date | None) -> tuple[date, date, datetime, datetime]:
    """Inclusive IST date range (default: the last 12 months incl. the current one) -> ``[start, end)``."""
    end_day = date_to or today_ist()
    start_day = date_from or add_months(month_start(end_day), -11)
    if start_day > end_day:
        raise BadRequest("'from' must be on or before 'to'", code="invalid_date_range")
    if (end_day - start_day).days > MAX_REPORT_DAYS:
        raise BadRequest("Date range is limited to 5 years", code="invalid_date_range")
    return start_day, end_day, ist_start(start_day), ist_start(end_day + timedelta(days=1))


def months_between(start_day: date, end_day: date) -> list[str]:
    out, cur = [], month_start(start_day)
    while cur <= end_day:
        out.append(month_key(cur))
        cur = add_months(cur, 1)
    return out


def ist_month(col: Any) -> Any:
    """``date_trunc('month', col AT TIME ZONE 'Asia/Kolkata')`` (a naive timestamp at the IST month start)."""
    return func.date_trunc("month", func.timezone(IST_ZONE, col))


def _key_str(value: Any) -> str:
    if value is None:
        return UNASSIGNED
    if isinstance(value, datetime | date):
        return month_key(value)
    return str(value)


def _signed_amount() -> Any:
    return case(
        (LedgerEntry.direction == EntryDirection.CREDIT, LedgerEntry.amount_minor),
        else_=-LedgerEntry.amount_minor,
    )


def _captured() -> Any:
    return and_(Payment.captured_at.is_not(None), Payment.status.in_(CAPTURED_STATUSES))


def _case_dim() -> Any:
    """case_id -> hospital_id, specialty_id (case specialty, else its procedure's specialty)."""
    return (
        select(
            Case.id.label("case_id"),
            Case.hospital_id.label("hospital_id"),
            func.coalesce(Case.specialty_id, Procedure.specialty_id).label("specialty_id"),
        )
        .outerjoin(Procedure, Procedure.id == Case.procedure_id)
        .subquery("case_dim")
    )


async def _count_by(db: AsyncSession, col: Any, *where: Any) -> dict[str, int]:
    stmt = select(col, func.count()).group_by(col)
    if where:
        stmt = stmt.where(*where)
    return {str(getattr(k, "value", k)): int(n) for k, n in (await db.execute(stmt)).all()}


async def _scalar_int(db: AsyncSession, stmt: Select[Any]) -> int:
    value = (await db.execute(stmt)).scalar_one_or_none()
    return int(value or 0)


# ------------------------------------------------------------------------------------------------ dashboard
async def dashboard(db: AsyncSession) -> AdminDashboard:
    users_by_role = await _count_by(db, User.role, User.deleted_at.is_(None))
    hospitals = await _count_by(db, Hospital.status)
    agents = await _count_by(db, Agent.status)
    cases_by_status = await _count_by(db, Case.status)
    bookings_by_status = await _count_by(db, Booking.status)

    gmv = await _scalar_int(
        db, select(func.coalesce(func.sum(Payment.base_amount_minor), 0)).where(_captured())
    )
    revenue = await _scalar_int(
        db,
        select(func.coalesce(func.sum(_signed_amount()), 0))
        .select_from(LedgerEntry)
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .where(LedgerAccount.code.in_(REVENUE_ACCOUNTS)),
    )
    escrow = await _scalar_int(db, select(LedgerAccount.balance_minor).where(LedgerAccount.code == ESCROW))
    pending_settlements = await _scalar_int(
        db,
        select(func.coalesce(func.sum(SettlementItem.net_minor), 0)).where(
            SettlementItem.status.in_(PENDING_SETTLEMENT_STATUSES)
        ),
    )
    open_sos = await _scalar_int(
        db,
        select(func.count(SosAlert.id)).where(SosAlert.status.in_((SosStatus.OPEN, SosStatus.ACKNOWLEDGED))),
    )

    first_month = add_months(month_start(today_ist()), -11)
    since = ist_start(first_month)
    keys = months_between(first_month, today_ist())
    monthly = {k: DashboardMonth(month=k) for k in keys}

    m = ist_month(Payment.captured_at)
    for bucket, total in await db.execute(
        select(m, func.sum(Payment.base_amount_minor))
        .where(_captured(), Payment.captured_at >= since)
        .group_by(m)
    ):
        if (k := month_key(bucket)) in monthly:
            monthly[k].gmv_minor = int(total or 0)
    m = ist_month(LedgerEntry.created_at)
    for bucket, total in await db.execute(
        select(m, func.sum(_signed_amount()))
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .where(LedgerAccount.code.in_(REVENUE_ACCOUNTS), LedgerEntry.created_at >= since)
        .group_by(m)
    ):
        if (k := month_key(bucket)) in monthly:
            monthly[k].revenue_minor = int(total or 0)
    m = ist_month(Booking.confirmed_at)
    for bucket, n in await db.execute(
        select(m, func.count(Booking.id)).where(Booking.confirmed_at >= since).group_by(m)
    ):
        if (k := month_key(bucket)) in monthly:
            monthly[k].bookings = int(n)
    m = ist_month(User.created_at)
    for bucket, n in await db.execute(
        select(m, func.count(User.id))
        .where(
            User.role == UserRole.PATIENT,
            User.is_guest.is_(False),
            User.deleted_at.is_(None),
            User.created_at >= since,
        )
        .group_by(m)
    ):
        if (k := month_key(bucket)) in monthly:
            monthly[k].new_patients = int(n)

    return AdminDashboard(
        users_by_role=users_by_role,
        hospitals=HospitalCounts(
            active=hospitals.get(HospitalStatus.ACTIVE.value, 0),
            pending_review=hospitals.get(HospitalStatus.PENDING_REVIEW.value, 0),
        ),
        agents=AgentCounts(
            active=agents.get(AgentStatus.ACTIVE.value, 0), pending=agents.get(AgentStatus.PENDING.value, 0)
        ),
        cases_by_status=cases_by_status,
        bookings_by_status=bookings_by_status,
        gmv_minor=gmv,
        revenue_minor=revenue,
        escrow_minor=escrow,
        pending_settlements_minor=pending_settlements,
        currency=BASE_CURRENCY,
        monthly=[monthly[k] for k in keys],
        top_hospitals=await _top_hospitals(db),
        top_specialties=await _top_specialties(db),
        open_sos=open_sos,
    )


async def _top_hospitals(db: AsyncSession, limit: int = 5) -> list[TopHospital]:
    dim = _case_dim()
    hospital_col = dim.c.hospital_id
    gmv_rows = await db.execute(
        select(hospital_col, func.sum(Payment.base_amount_minor))
        .select_from(Payment)
        .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
        .outerjoin(Booking, Booking.id == PaymentOrder.booking_id)
        .join(dim, dim.c.case_id == func.coalesce(PaymentOrder.case_id, Booking.case_id))
        .where(_captured())
        .group_by(hospital_col)
    )
    gmv = {hid: int(v or 0) for hid, v in gmv_rows.all()}
    booking_rows = await db.execute(
        select(Booking.hospital_id, func.count(Booking.id))
        .where(Booking.confirmed_at.is_not(None))
        .group_by(Booking.hospital_id)
    )
    bookings = {hid: int(n) for hid, n in booking_rows.all()}
    ids = set(gmv) | set(bookings)
    ranked = sorted(ids, key=lambda h: (-gmv.get(h, 0), -bookings.get(h, 0), str(h)))[:limit]
    if not ranked:
        return []
    names = dict((await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(ranked)))).all())
    return [
        TopHospital(id=h, name=names.get(h, ""), bookings=bookings.get(h, 0), gmv_minor=gmv.get(h, 0))
        for h in ranked
    ]


async def _specialty_counts(db: AsyncSession, *where: Any, limit: int | None = 5) -> list[TopSpecialty]:
    dim = _case_dim()
    stmt = (
        select(Specialty.slug, Specialty.name, func.count(Case.id).label("n"))
        .select_from(Case)
        .join(dim, dim.c.case_id == Case.id)
        .join(Specialty, Specialty.id == dim.c.specialty_id)
        .group_by(Specialty.id, Specialty.slug, Specialty.name)
        .order_by(func.count(Case.id).desc(), Specialty.name)
    )
    if where:
        stmt = stmt.where(*where)
    if limit:
        stmt = stmt.limit(limit)
    return [TopSpecialty(slug=s, name=n, cases=int(c)) for s, n, c in (await db.execute(stmt)).all()]


async def _top_specialties(db: AsyncSession) -> list[TopSpecialty]:
    return await _specialty_counts(db)


# ------------------------------------------------------------------------------------------- revenue report
def _group_key(group_by: ReportGroupBy, ts_col: Any, dim: Any) -> Any:
    if group_by == "month":
        return ist_month(ts_col)
    if group_by == "hospital":
        return dim.c.hospital_id
    return dim.c.specialty_id


async def revenue_report(
    db: AsyncSession, group_by: ReportGroupBy, date_from: date | None, date_to: date | None
) -> RevenueReport:
    start_day, end_day, start, end = report_range(date_from, date_to)
    rows: dict[str, RevenueReportRow] = {}

    def row(key: Any) -> RevenueReportRow:
        k = _key_str(key)
        if k not in rows:
            rows[k] = RevenueReportRow(key=k, label=k)
        return rows[k]

    if group_by == "month":
        for k in months_between(start_day, end_day):
            rows[k] = RevenueReportRow(key=k, label=k)

    # GMV: captured payments -> order -> booking/case -> dimension.
    dim = _case_dim()
    key = _group_key(group_by, Payment.captured_at, dim)
    stmt = (
        select(key, func.sum(Payment.base_amount_minor))
        .select_from(Payment)
        .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
        .outerjoin(Booking, Booking.id == PaymentOrder.booking_id)
        .outerjoin(dim, dim.c.case_id == func.coalesce(PaymentOrder.case_id, Booking.case_id))
        .where(_captured(), Payment.captured_at >= start, Payment.captured_at < end)
        .group_by(key)
    )
    for k, total in await db.execute(stmt):
        row(k).gmv_minor += int(total or 0)

    # Bookings confirmed in the period.
    dim = _case_dim()
    key = _group_key(group_by, Booking.confirmed_at, dim)
    stmt = (
        select(key, func.count(Booking.id))
        .select_from(Booking)
        .outerjoin(dim, dim.c.case_id == Booking.case_id)
        .where(Booking.confirmed_at >= start, Booking.confirmed_at < end)
        .group_by(key)
    )
    for k, n in await db.execute(stmt):
        row(k).bookings += int(n)

    # Revenue: net credits to the revenue accounts; booking-scoped transactions carry reference_type=booking.
    dim = _case_dim()
    key = _group_key(group_by, LedgerEntry.created_at, dim)
    stmt = (
        select(key, LedgerAccount.code, func.sum(_signed_amount()))
        .select_from(LedgerEntry)
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .outerjoin(
            Booking,
            and_(LedgerTransaction.reference_type == "booking", LedgerTransaction.reference_id == Booking.id),
        )
        .outerjoin(dim, dim.c.case_id == Booking.case_id)
        .where(
            LedgerAccount.code.in_(REVENUE_ACCOUNTS),
            LedgerEntry.created_at >= start,
            LedgerEntry.created_at < end,
        )
        .group_by(key, LedgerAccount.code)
    )
    for k, code, total in await db.execute(stmt):
        r = row(k)
        amount = int(total or 0)
        r.revenue_minor += amount
        if code == COMMISSION_REVENUE:
            r.commission_minor += amount
        else:
            r.service_fee_minor += amount

    # Processed refunds (INR base amounts).
    dim = _case_dim()
    key = _group_key(group_by, Refund.processed_at, dim)
    stmt = (
        select(key, func.sum(Refund.base_amount_minor))
        .select_from(Refund)
        .join(PaymentOrder, PaymentOrder.id == Refund.order_id)
        .outerjoin(Booking, Booking.id == func.coalesce(Refund.booking_id, PaymentOrder.booking_id))
        .outerjoin(dim, dim.c.case_id == func.coalesce(PaymentOrder.case_id, Booking.case_id))
        .where(
            Refund.status == RefundStatus.PROCESSED,
            Refund.processed_at >= start,
            Refund.processed_at < end,
        )
        .group_by(key)
    )
    for k, total in await db.execute(stmt):
        row(k).refunds_minor += int(total or 0)

    await _label_rows(db, group_by, rows)
    ordered = list(rows.values())
    if group_by == "month":
        ordered.sort(key=lambda r: r.key)
    else:
        ordered.sort(key=lambda r: (r.key == UNASSIGNED, -r.gmv_minor, -r.revenue_minor, r.label))
    totals = RevenueTotals(
        bookings=sum(r.bookings for r in ordered),
        gmv_minor=sum(r.gmv_minor for r in ordered),
        revenue_minor=sum(r.revenue_minor for r in ordered),
        commission_minor=sum(r.commission_minor for r in ordered),
        service_fee_minor=sum(r.service_fee_minor for r in ordered),
        refunds_minor=sum(r.refunds_minor for r in ordered),
    )
    return RevenueReport(
        group_by=group_by,
        currency=BASE_CURRENCY,
        date_from=start_day,
        date_to=end_day,
        rows=ordered,
        totals=totals,
    )


def _uuid_or_none(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


async def _label_rows(db: AsyncSession, group_by: ReportGroupBy, rows: dict[str, RevenueReportRow]) -> None:
    if UNASSIGNED in rows:
        rows[UNASSIGNED].label = "Unassigned"
    if group_by == "month":
        return
    ids = [u for k in rows if (u := _uuid_or_none(k)) is not None]
    if not ids:
        return
    if group_by == "hospital":
        for hid, name in await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(ids))):
            rows[str(hid)].label = name
        return
    # specialty: key by slug (as the web contract documents), label by name
    specs = (
        await db.execute(select(Specialty.id, Specialty.slug, Specialty.name).where(Specialty.id.in_(ids)))
    ).all()
    for sid, slug, name in specs:
        item = rows.pop(str(sid))
        item.key, item.label = slug, name
        rows[slug] = item


# --------------------------------------------------------------------------------------------- cases report
def _per_case_max_stage(start: datetime, end: datetime) -> Any:
    """Highest funnel stage each case (created in the range) ever reached: current status, status history
    and confirmed bookings all count."""
    in_range = and_(Case.created_at >= start, Case.created_at < end)
    current = select(Case.id.label("case_id"), cast(Case.status, String).label("status")).where(in_range)
    history = (
        select(
            CaseStatusHistory.case_id.label("case_id"),
            cast(CaseStatusHistory.to_status, String).label("status"),
        )
        .join(Case, Case.id == CaseStatusHistory.case_id)
        .where(in_range)
    )
    booked = (
        select(Booking.case_id.label("case_id"), literal(CaseStatus.BOOKED.value, String).label("status"))
        .join(Case, Case.id == Booking.case_id)
        .where(in_range, Booking.confirmed_at.is_not(None))
    )
    events = union_all(current, history, booked).subquery("events")
    ordinal = case(*[(events.c.status == s.value, i) for i, s in enumerate(FUNNEL_STAGES)], else_=-1)
    return (
        select(events.c.case_id.label("case_id"), func.max(ordinal).label("max_ord"))
        .group_by(events.c.case_id)
        .subquery("per_case")
    )


async def cases_report(db: AsyncSession, date_from: date | None, date_to: date | None) -> CasesReport:
    start_day, end_day, start, end = report_range(date_from, date_to)
    in_range = (Case.created_at >= start, Case.created_at < end)
    by_status = await _count_by(db, Case.status, *in_range)
    total = sum(by_status.values())

    per_case = _per_case_max_stage(start, end)
    reached_rows = await db.execute(select(per_case.c.max_ord, func.count()).group_by(per_case.c.max_ord))
    at_max: dict[int, int] = defaultdict(int)
    for ordinal, n in reached_rows:
        at_max[int(ordinal)] += int(n)
    funnel: list[FunnelStage] = []
    for i, stage in enumerate(FUNNEL_STAGES):
        reached = sum(n for o, n in at_max.items() if o >= i)
        funnel.append(FunnelStage(stage=stage.value, count=reached, pct_of_total=_ratio(reached, total)))

    m = ist_month(Case.created_at)
    monthly_rows = await db.execute(
        select(m, func.count(Case.id), func.count(Case.id).filter(per_case.c.max_ord >= BOOKED_ORD))
        .select_from(Case)
        .join(per_case, per_case.c.case_id == Case.id)
        .where(*in_range)
        .group_by(m)
    )
    monthly = {k: CasesMonth(month=k, cases=0, booked=0) for k in months_between(start_day, end_day)}
    for bucket, n, booked in monthly_rows:
        k = month_key(bucket)
        if k in monthly:
            monthly[k] = CasesMonth(month=k, cases=int(n), booked=int(booked))

    hospital_rows = await db.execute(
        select(Hospital.id, Hospital.name, func.count(Case.id))
        .join(Hospital, Hospital.id == Case.hospital_id)
        .where(*in_range)
        .group_by(Hospital.id, Hospital.name)
        .order_by(func.count(Case.id).desc(), Hospital.name)
        .limit(10)
    )
    return CasesReport(
        date_from=start_day,
        date_to=end_day,
        total=total,
        by_status=by_status,
        funnel=funnel,
        by_specialty=await _specialty_counts(db, *in_range, limit=10),
        by_hospital=[CasesByHospital(id=h, name=n, cases=int(c)) for h, n, c in hospital_rows.all()],
        conversion_rate=funnel[BOOKED_ORD].pct_of_total,
        quote_rate=funnel[QUOTED_ORD].pct_of_total,
        monthly=list(monthly.values()),
    )


def _ratio(part: int, whole: int) -> float:
    return round(part / whole, 4) if whole else 0.0


# ------------------------------------------------------------------------------------------------ CSV export
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_cell(value: Any) -> str:
    """Render one CSV cell; text that a spreadsheet would treat as a formula is prefixed with ``'``.

    Numbers (int/Decimal/float) are emitted as-is, so negative amounts stay numeric."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float | Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Enum):
        value = value.value
    text = str(value)
    if text.startswith(FORMULA_PREFIXES):
        return "'" + text
    return text


def _patient_name() -> Any:
    return func.trim(func.concat(PatientProfile.first_name, " ", PatientProfile.last_name))


def _export_spec(kind: ExportType, start: datetime | None, end: datetime | None) -> tuple[list[str], Any]:
    def window(col: Any) -> list[Any]:
        conds = []
        if start is not None:
            conds.append(col >= start)
        if end is not None:
            conds.append(col < end)
        return conds

    if kind == "bookings":
        header = (
            "booking_number case_number status patient_name patient_nationality hospital "
            "procedure admission_date discharge_date payment_option currency subtotal_minor "
            "discount_minor service_fee_minor tax_minor total_minor deposit_minor "
            "amount_paid_minor amount_refunded_minor created_at confirmed_at completed_at "
            "cancelled_at cancel_reason"
        ).split()
        stmt = (
            select(
                Booking.booking_number,
                Case.case_number,
                Booking.status,
                _patient_name(),
                PatientProfile.nationality,
                Hospital.name,
                Procedure.name,
                Booking.admission_date,
                Booking.discharge_date,
                Booking.payment_option,
                Booking.currency,
                Booking.subtotal_minor,
                Booking.discount_minor,
                Booking.service_fee_minor,
                Booking.tax_minor,
                Booking.total_minor,
                Booking.deposit_minor,
                Booking.amount_paid_minor,
                Booking.amount_refunded_minor,
                Booking.created_at,
                Booking.confirmed_at,
                Booking.completed_at,
                Booking.cancelled_at,
                Booking.cancel_reason,
            )
            .join(Case, Case.id == Booking.case_id)
            .join(PatientProfile, PatientProfile.id == Booking.patient_id)
            .join(Hospital, Hospital.id == Booking.hospital_id)
            .outerjoin(Procedure, Procedure.id == Booking.procedure_id)
            .where(*window(Booking.created_at))
            .order_by(Booking.created_at, Booking.id)
        )
        return header, stmt
    if kind == "payments":
        header = (
            "order_number payment_id purpose gateway gateway_payment_id method status "
            "amount_minor currency base_amount_minor base_currency fx_rate fee_minor "
            "tax_on_fee_minor amount_refunded_minor booking_number patient_name error_code "
            "created_at captured_at"
        ).split()
        stmt = (
            select(
                PaymentOrder.order_number,
                Payment.id,
                PaymentOrder.purpose,
                Payment.gateway,
                Payment.gateway_payment_id,
                Payment.method,
                Payment.status,
                Payment.amount_minor,
                Payment.currency,
                Payment.base_amount_minor,
                PaymentOrder.base_currency,
                PaymentOrder.fx_rate,
                Payment.fee_minor,
                Payment.tax_on_fee_minor,
                Payment.amount_refunded_minor,
                Booking.booking_number,
                _patient_name(),
                Payment.error_code,
                Payment.created_at,
                Payment.captured_at,
            )
            .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
            .join(PatientProfile, PatientProfile.id == PaymentOrder.patient_id)
            .outerjoin(Booking, Booking.id == PaymentOrder.booking_id)
            .where(*window(Payment.created_at))
            .order_by(Payment.created_at, Payment.id)
        )
        return header, stmt
    header = (
        "item_id payee_type payee_id payee_name booking_number status currency "
        "gross_minor commission_minor tax_minor tds_minor net_minor eligible_at "
        "hold_reason batch_number created_at"
    ).split()
    payee_name = func.coalesce(Hospital.name, Agent.agency_name)
    stmt = (
        select(
            SettlementItem.id,
            SettlementItem.payee_type,
            SettlementItem.payee_id,
            payee_name,
            Booking.booking_number,
            SettlementItem.status,
            SettlementItem.currency,
            SettlementItem.gross_minor,
            SettlementItem.commission_minor,
            SettlementItem.tax_minor,
            SettlementItem.tds_minor,
            SettlementItem.net_minor,
            SettlementItem.eligible_at,
            SettlementItem.hold_reason,
            SettlementBatch.batch_number,
            SettlementItem.created_at,
        )
        .join(Booking, Booking.id == SettlementItem.booking_id)
        .outerjoin(SettlementBatch, SettlementBatch.id == SettlementItem.batch_id)
        .outerjoin(
            Hospital, and_(SettlementItem.payee_type == "hospital", Hospital.id == SettlementItem.payee_id)
        )
        .outerjoin(Agent, and_(SettlementItem.payee_type == "agent", Agent.id == SettlementItem.payee_id))
        .where(*window(SettlementItem.created_at))
        .order_by(SettlementItem.created_at, SettlementItem.id)
    )
    return header, stmt


def export_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    if date_from and date_to and date_from > date_to:
        raise BadRequest("'from' must be on or before 'to'", code="invalid_date_range")
    return (
        ist_start(date_from) if date_from else None,
        ist_start(date_to + timedelta(days=1)) if date_to else None,
    )


def _render(rows: Sequence[Sequence[Any]], writer: Any) -> None:
    for r in rows:
        writer.writerow([csv_cell(v) for v in r])


async def stream_export(
    kind: ExportType,
    start: datetime | None,
    end: datetime | None,
    session_factory: Callable[[], AsyncSession] | None = None,
    chunk_rows: int = 500,
) -> AsyncIterator[bytes]:
    """Yield the CSV (UTF-8 with BOM for Excel) in chunks, reading with a server-side cursor in its own
    session (the request session is already closed while the response streams)."""
    header, stmt = _export_spec(kind, start, end)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    yield ("﻿" + buffer.getvalue()).encode("utf-8")
    buffer.seek(0)
    buffer.truncate(0)
    factory = session_factory or SessionLocal
    async with factory() as session:
        result = await session.stream(stmt.execution_options(yield_per=chunk_rows))
        async for partition in result.partitions(chunk_rows):
            _render(partition, writer)
            yield buffer.getvalue().encode("utf-8")
            buffer.seek(0)
            buffer.truncate(0)


__all__ = [
    "cases_report",
    "csv_cell",
    "dashboard",
    "export_bounds",
    "revenue_report",
    "stream_export",
]
