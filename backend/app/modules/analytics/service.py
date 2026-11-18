"""Staff analytics (``GET /admin/analytics/*``). Every number is a SQL aggregate (COUNT / SUM /
percentile with
GROUP BY); there are no per-row loops over the database. See ``common`` for the window, time zone, filters and
small-cell suppression rules.

Definitions (event counts inside the window, not a cohort):

* funnel - visitors = guest sessions started (audit ``auth.guest_created``); guest scans = guest AI usage
rows;
  registrations = patient sign-ups + guest upgrades + agent-created patients (audit); screenings = non-draft
  screenings created; cases = cases created; quotes sent = cases that received a non-draft quote created
  in the
  window; quotes accepted = cases with a quote accepted in the window; bookings = bookings confirmed;
  completed =
  bookings completed; reviews = reviews written.
* time to first quote = ``first_quote_at`` (else the first non-draft quote) - case ``created_at``, for cases
  created in the window.
* finance - GMV = captured payments (INR at the capture-time rate, ``payments.base_amount_minor``); refunds =
  processed refunds; commission / service fee = net credits to the platform revenue ledger accounts; all INR,
  converted to the reporting currency with the current ``fx_rates`` row (its ``as_of`` is returned).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from pydantic import BaseModel
from sqlalchemy import case, distinct, func, literal, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import (
    BookingStatus,
    CaseStatus,
    EntryDirection,
    InstallmentStatus,
    PayeeType,
    QuoteStatus,
    RefundStatus,
    ScreeningStatus,
    SettlementItemStatus,
)
from app.core.errors import BadRequest
from app.core.money import BASE_CURRENCY, DEFAULT_FX_RATES, convert_minor, normalize_currency
from app.models import (
    AftercareCheckin,
    Agent,
    AIRequestLog,
    AuditLog,
    Booking,
    Case,
    FxRate,
    GuestAiUsage,
    Hospital,
    Installment,
    IntroConsultation,
    LedgerAccount,
    LedgerEntry,
    LedgerTransaction,
    Notification,
    PatientProfile,
    Payment,
    PaymentOrder,
    Procedure,
    Quote,
    Refund,
    Review,
    Screening,
    SettlementItem,
    Specialty,
    User,
)
from app.modules.admin import reports
from app.modules.analytics import schemas as s
from app.modules.analytics.common import (
    Filters,
    Window,
    bucket_date,
    bucket_expr,
    case_conditions,
    case_scope,
    case_specialty_expr,
    hours,
    meta,
    now_ist,
    patient_country_expr,
    ratio,
    suppress,
)

FUNNEL_STEPS = (
    "visitors",
    "guest_scans",
    "registrations",
    "screenings",
    "cases",
    "quotes_sent",
    "quotes_accepted",
    "bookings",
    "completed",
    "reviews",
)
PRE_CASE_STEPS = frozenset({"visitors", "guest_scans", "registrations", "screenings"})
REGISTRATION_ACTIONS = ("auth.register", "auth.guest_upgraded", "agent.patient_create")
TOP_LIMIT = 50


def _sla_hours() -> int:
    return int(settings.QUOTE_SLA_HOURS)


def _count(stmt: Any) -> Any:
    return stmt.scalar_subquery()


def _empty_points[P: BaseModel](window: Window, factory: type[P]) -> dict[date, P]:
    return {b: factory.model_validate({"bucket": b}) for b in window.buckets()}


async def _series(db: AsyncSession, stmt: Any) -> dict[date, int]:
    out: dict[date, int] = {}
    for bucket, n in (await db.execute(stmt)).all():
        d = bucket_date(bucket)
        if d is not None:
            out[d] = out.get(d, 0) + int(n or 0)
    return out


# ================================================================================================ overview
def _registrations_stmt(window: Window) -> Any:
    return select(func.count(AuditLog.id)).where(
        AuditLog.action.in_(REGISTRATION_ACTIONS),
        or_(AuditLog.action != "auth.register", AuditLog.actor_role == "patient"),
        *window.between(AuditLog.created_at),
    )


def _quoted_cases_stmt(window: Window, f: Filters) -> Any:
    return select(func.count(distinct(Quote.case_id))).where(
        Quote.status != QuoteStatus.DRAFT, *window.between(Quote.created_at), *case_scope(Quote.case_id, f)
    )


def _reviews_stmt(window: Window, f: Filters) -> Any:
    conds = [*window.between(Review.created_at)]
    if f.hospital_id is not None:
        conds.append(Review.hospital_id == f.hospital_id)
    other = Filters(country=f.country, specialty_id=f.specialty_id, agent_id=f.agent_id, channel=f.channel)
    conds += case_scope(Review.case_id, other)
    return select(func.count(Review.id)).where(*conds)


async def overview(db: AsyncSession, window: Window, f: Filters) -> s.OverviewOut:
    cases_where = [*window.between(Case.created_at), *case_conditions(f)]
    counts = {
        "visitors": select(func.count(AuditLog.id)).where(
            AuditLog.action == "auth.guest_created", *window.between(AuditLog.created_at)
        ),
        "guest_scans": select(func.count(GuestAiUsage.id)).where(*window.between(GuestAiUsage.created_at)),
        "registrations": _registrations_stmt(window),
        "screenings": select(func.count(Screening.id)).where(
            Screening.status != ScreeningStatus.DRAFT, *window.between(Screening.created_at)
        ),
        "cases": select(func.count(Case.id)).where(*cases_where),
        "quotes_sent": _quoted_cases_stmt(window, f),
        "quotes_accepted": select(func.count(distinct(Quote.case_id))).where(
            Quote.accepted_at.is_not(None), *window.between(Quote.accepted_at), *case_scope(Quote.case_id, f)
        ),
        "bookings": select(func.count(Booking.id)).where(
            *window.between(Booking.confirmed_at), *case_scope(Booking.case_id, f)
        ),
        "completed": select(func.count(Booking.id)).where(
            *window.between(Booking.completed_at), *case_scope(Booking.case_id, f)
        ),
        "reviews": _reviews_stmt(window, f),
    }
    row = (await db.execute(select(*[_count(counts[k]).label(k) for k in FUNNEL_STEPS]))).one()
    values: dict[str, int | None] = {k: int(getattr(row, k) or 0) for k in FUNNEL_STEPS}
    if f.any:
        for k in PRE_CASE_STEPS:
            values[k] = None

    funnel: list[s.FunnelStep] = []
    first: int | None = None
    prev: int | None = None
    for k in FUNNEL_STEPS:
        v = values[k]
        if first is None and v is not None:
            first = v
        funnel.append(
            s.FunnelStep(
                step=k,
                count=v,
                rate_from_previous=ratio(v, prev) if prev is not None else None,
                rate_from_first=ratio(v, first) if first is not None and v is not None else None,
            )
        )
        prev = v

    points = _empty_points(window, s.OverviewPoint)
    g = window.granularity
    for metric, stmt in (
        ("cases", select(bucket_expr(Case.created_at, g), func.count(Case.id)).where(*cases_where)),
        (
            "quotes_sent",
            select(bucket_expr(Quote.created_at, g), func.count(distinct(Quote.case_id))).where(
                Quote.status != QuoteStatus.DRAFT,
                *window.between(Quote.created_at),
                *case_scope(Quote.case_id, f),
            ),
        ),
        (
            "bookings",
            select(bucket_expr(Booking.confirmed_at, g), func.count(Booking.id)).where(
                *window.between(Booking.confirmed_at), *case_scope(Booking.case_id, f)
            ),
        ),
        (
            "registrations",
            select(bucket_expr(AuditLog.created_at, g), func.count(AuditLog.id)).where(
                AuditLog.action.in_(REGISTRATION_ACTIONS),
                or_(AuditLog.action != "auth.register", AuditLog.actor_role == "patient"),
                *window.between(AuditLog.created_at),
            ),
        ),
    ):
        if metric == "registrations" and f.any:
            for p in points.values():
                p.registrations = None
            continue
        for d, n in (await _series(db, stmt.group_by(literal_column("1")))).items():
            if d in points:
                setattr(points[d], metric, getattr(points[d], metric) + n)

    sla = await _sla_stats(db, window, f)
    kpis = s.OverviewKpis(
        cases=values["cases"] or 0,
        quotes_sent=values["quotes_sent"] or 0,
        bookings=values["bookings"] or 0,
        completed=values["completed"] or 0,
        reviews=values["reviews"] or 0,
        registrations=values["registrations"],
        conversion_rate=ratio(values["bookings"], values["cases"]),
        median_first_quote_hours=sla.median_hours,
    )
    return s.OverviewOut(meta=meta(window, f), kpis=kpis, funnel=funnel, series=list(points.values()))


# =============================================================================================== quote SLA
def _first_quote_cte(window: Window, f: Filters, *extra: Any) -> Any:
    first_sent = (
        select(func.min(Quote.created_at))
        .where(Quote.case_id == Case.id, Quote.status != QuoteStatus.DRAFT)
        .scalar_subquery()
    )
    first_at = func.coalesce(Case.first_quote_at, first_sent)
    hrs = func.extract("epoch", first_at - Case.created_at) / 3600.0
    return (
        select(Case.id.label("case_id"), Case.hospital_id.label("hospital_id"), hrs.label("hours"))
        .where(*window.between(Case.created_at), *case_conditions(f), *extra)
        .cte("first_quote")
    )


def _sla_columns(cte: Any) -> list[Any]:
    h = cte.c.hours
    sla = _sla_hours()
    return [
        func.count().label("cases"),
        func.count(h).label("quoted"),
        func.percentile_cont(0.5).within_group(h.asc()).label("median"),
        func.percentile_cont(0.9).within_group(h.asc()).label("p90"),
        func.count().filter(h <= 24).label("w24"),
        func.count().filter(h <= 48).label("w48"),
        func.count().filter(h <= sla).label("wsla"),
    ]


def _sla_from_row(row: Any) -> s.SlaStats:
    n = int(row.cases or 0)
    return s.SlaStats(
        cases=n,
        quoted=int(row.quoted or 0),
        median_hours=hours(row.median),
        p90_hours=hours(row.p90),
        within_24h_pct=ratio(int(row.w24 or 0), n),
        within_48h_pct=ratio(int(row.w48 or 0), n),
        within_sla_pct=ratio(int(row.wsla or 0), n),
    )


async def _sla_stats(db: AsyncSession, window: Window, f: Filters, *extra: Any) -> s.SlaStats:
    cte = _first_quote_cte(window, f, *extra)
    return _sla_from_row((await db.execute(select(*_sla_columns(cte)).select_from(cte))).one())


def _overdue_now_conditions(f: Filters) -> list[Any]:
    now = now_ist()
    no_quote = ~select(Quote.id).where(Quote.case_id == Case.id, Quote.status != QuoteStatus.DRAFT).exists()
    due = func.coalesce(Case.quote_due_at, Case.created_at + timedelta(hours=_sla_hours()))
    return [
        Case.status == CaseStatus.ENQUIRY,
        Case.first_quote_at.is_(None),
        no_quote,
        due < now,
        *case_conditions(f),
    ]


async def quote_sla(db: AsyncSession, window: Window, f: Filters) -> s.QuoteSlaOut:
    totals = await _sla_stats(db, window, f)
    cte = _first_quote_cte(window, f)
    by = {
        row.hospital_id: row
        for row in (
            await db.execute(
                select(cte.c.hospital_id, *_sla_columns(cte)).select_from(cte).group_by(cte.c.hospital_id)
            )
        ).all()
    }
    overdue = dict(
        (
            await db.execute(
                select(Case.hospital_id, func.count(Case.id))
                .where(*_overdue_now_conditions(f))
                .group_by(Case.hospital_id)
            )
        ).all()
    )
    ids = set(by) | set(overdue)
    names = (
        dict((await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(ids)))).all())
        if ids
        else {}
    )
    rows = []
    for hid in ids:
        base = (
            _sla_from_row(by[hid])
            if hid in by
            else s.SlaStats(
                cases=0,
                quoted=0,
                median_hours=None,
                p90_hours=None,
                within_24h_pct=None,
                within_48h_pct=None,
                within_sla_pct=None,
            )
        )
        rows.append(
            s.HospitalSla(
                **base.model_dump(),
                hospital_id=hid,
                hospital_name=names.get(hid, ""),
                overdue_now=int(overdue.get(hid, 0)),
            )
        )
    rows.sort(key=lambda r: (-r.overdue_now, -(r.median_hours or 0), r.hospital_name))
    return s.QuoteSlaOut(
        meta=meta(window, f),
        sla_hours=_sla_hours(),
        totals=totals,
        overdue_now=sum(int(v) for v in overdue.values()),
        by_hospital=rows[:TOP_LIMIT],
    )


# ================================================================================================ finance
async def _fx(db: AsyncSession, currency: str) -> tuple[Decimal, s.FxInfo | None]:
    if currency == BASE_CURRENCY:
        return Decimal(1), None
    row = (
        await db.execute(
            select(FxRate)
            .where(FxRate.base_currency == BASE_CURRENCY, FxRate.quote_currency == currency)
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is not None and Decimal(row.rate) > 0:
        return Decimal(row.rate), s.FxInfo(
            currency=currency, rate_inr_per_unit=str(row.rate), as_of=row.as_of, source=row.source
        )
    if currency in DEFAULT_FX_RATES:
        rate = DEFAULT_FX_RATES[currency]
        return rate, s.FxInfo(currency=currency, rate_inr_per_unit=str(rate), as_of=None, source="default")
    raise BadRequest("No exchange rate for this reporting currency", code="unknown_currency")


def _payment_case_id() -> Any:
    return func.coalesce(
        PaymentOrder.case_id,
        select(Booking.case_id).where(Booking.id == PaymentOrder.booking_id).scalar_subquery(),
    )


async def finance(db: AsyncSession, window: Window, f: Filters, currency: str) -> s.FinanceOut:
    currency = normalize_currency(currency or BASE_CURRENCY)
    rate, fx = await _fx(db, currency)

    def conv(inr_minor: int) -> int:
        return (
            convert_minor(int(inr_minor), BASE_CURRENCY, currency, rate)
            if currency != BASE_CURRENCY
            else int(inr_minor)
        )

    month_keys = reports.months_between(window.date_from, window.date_to)
    months: dict[str, dict[str, int]] = {k: defaultdict(int) for k in month_keys}

    pay_scope = case_scope(_payment_case_id(), f)
    m = reports.ist_month(Payment.captured_at)
    by_currency: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    payments_total = 0
    for bucket, ccy, n, amount, base in (
        await db.execute(
            select(
                m,
                Payment.currency,
                func.count(Payment.id),
                func.sum(Payment.amount_minor),
                func.sum(Payment.base_amount_minor),
            )
            .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
            .where(reports._captured(), *window.between(Payment.captured_at), *pay_scope)
            .group_by(m, Payment.currency)
        )
    ).all():
        key = reports.month_key(bucket)
        if key in months:
            months[key]["gmv"] += int(base or 0)
        acc = by_currency[str(ccy)]
        acc[0] += int(n)
        acc[1] += int(amount or 0)
        acc[2] += int(base or 0)
        payments_total += int(n)

    m = reports.ist_month(Refund.processed_at)
    for bucket, base in (
        await db.execute(
            select(m, func.sum(Refund.base_amount_minor))
            .join(PaymentOrder, PaymentOrder.id == Refund.order_id)
            .where(Refund.status == RefundStatus.PROCESSED, *window.between(Refund.processed_at), *pay_scope)
            .group_by(m)
        )
    ).all():
        key = reports.month_key(bucket)
        if key in months:
            months[key]["refunds"] += int(base or 0)

    signed = case(
        (LedgerEntry.direction == EntryDirection.CREDIT, LedgerEntry.amount_minor),
        else_=-LedgerEntry.amount_minor,
    )
    m = reports.ist_month(LedgerEntry.created_at)
    ledger = (
        select(m, LedgerAccount.code, func.sum(signed))
        .select_from(LedgerEntry)
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .join(LedgerTransaction, LedgerTransaction.id == LedgerEntry.transaction_id)
        .where(LedgerAccount.code.in_(reports.REVENUE_ACCOUNTS), *window.between(LedgerEntry.created_at))
        .group_by(m, LedgerAccount.code)
    )
    if case_conditions(f):
        ledger = ledger.where(
            LedgerTransaction.reference_type == "booking",
            LedgerTransaction.reference_id.in_(select(Booking.id).where(*case_scope(Booking.case_id, f))),
        )
    for bucket, code, total in (await db.execute(ledger)).all():
        key = reports.month_key(bucket)
        if key in months:
            months[key]["commission" if code == reports.COMMISSION_REVENUE else "service_fee"] += int(
                total or 0
            )

    by_month = [
        s.FinanceMonth(
            month=k,
            gmv_minor=conv(v["gmv"]),
            refunds_minor=conv(v["refunds"]),
            commission_minor=conv(v["commission"]),
            service_fee_minor=conv(v["service_fee"]),
        )
        for k, v in months.items()
    ]
    gmv = sum(v["gmv"] for v in months.values())
    refunds = sum(v["refunds"] for v in months.values())
    commission = sum(v["commission"] for v in months.values())
    fee = sum(v["service_fee"] for v in months.values())
    totals = s.FinanceTotals(
        gmv_minor=conv(gmv),
        refunds_minor=conv(refunds),
        net_gmv_minor=conv(gmv - refunds),
        commission_minor=conv(commission),
        service_fee_minor=conv(fee),
        revenue_minor=conv(commission + fee),
        payments=payments_total,
    )
    currency_rows = sorted(
        (
            s.CurrencyRow(
                currency=ccy,
                payments=v[0],
                amount_minor=v[1],
                base_amount_minor=v[2],
                reporting_amount_minor=conv(v[2]),
            )
            for ccy, v in by_currency.items()
        ),
        key=lambda r: -r.base_amount_minor,
    )
    return s.FinanceOut(
        meta=meta(window, f),
        reporting_currency=currency,
        fx=fx,
        totals=totals,
        by_month=by_month,
        by_currency=currency_rows,
        outstanding_installments=await _outstanding_installments(db, f, conv, currency, rate),
    )


async def _outstanding_installments(
    db: AsyncSession, f: Filters, conv: Any, currency: str, rate: Decimal
) -> s.OutstandingInstallments:
    open_statuses = (InstallmentStatus.DUE, InstallmentStatus.OVERDUE)
    overdue = Installment.status == InstallmentStatus.OVERDUE
    past = Installment.due_date >= Booking.admission_date
    rows = (
        await db.execute(
            select(
                Installment.currency,
                func.count(Installment.id),
                func.count().filter(overdue),
                func.coalesce(func.sum(Installment.amount_minor), 0),
                func.count().filter(past),
            )
            .join(Booking, Booking.id == Installment.booking_id)
            .where(
                Installment.status.in_(open_statuses),
                Booking.status != BookingStatus.CANCELLED,
                *case_scope(Booking.case_id, f),
            )
            .group_by(Installment.currency)
        )
    ).all()
    by_currency = []
    total_reporting = 0
    count = overdue_count = past_count = 0
    for ccy, n, n_over, amount, n_past in rows:
        by_currency.append(
            s.InstallmentCurrencyRow(
                currency=ccy, count=int(n), overdue_count=int(n_over), amount_minor=int(amount)
            )
        )
        count += int(n)
        overdue_count += int(n_over)
        past_count += int(n_past)
        # instalment currency -> INR (current/default rate) -> reporting currency
        inr = convert_minor(int(amount), ccy, BASE_CURRENCY) if ccy != BASE_CURRENCY else int(amount)
        total_reporting += conv(inr)
    return s.OutstandingInstallments(
        count=count,
        overdue_count=overdue_count,
        amount_minor=total_reporting,
        past_treatment_count=past_count,
        by_currency=by_currency,
    )


# =============================================================================================== patients
def _row(
    key: Any, label: str, patients: int | None, cases: int | None, bookings: int | None
) -> s.BreakdownRow:
    p, c, b = suppress(patients), suppress(cases), suppress(bookings)
    return s.BreakdownRow(
        key=str(key) if key is not None else "unknown",
        label=label,
        patients=p,
        cases=c,
        bookings=b,
        suppressed=(p is None and patients is not None)
        or (c is None and cases is not None)
        or (b is None and bookings is not None),
    )


async def _breakdown(
    db: AsyncSession, window: Window, f: Filters, dim_case: Any, dim_booking: Any, *, joins_patient: bool
) -> dict[Any, list[int]]:
    """``{dim: [patients, cases, bookings]}`` for cases created / bookings confirmed in the window."""
    out: dict[Any, list[int]] = defaultdict(lambda: [0, 0, 0])
    stmt = select(dim_case, func.count(distinct(Case.patient_id)), func.count(Case.id)).select_from(Case)
    if joins_patient:
        stmt = stmt.join(PatientProfile, PatientProfile.id == Case.patient_id).join(
            User, User.id == PatientProfile.user_id
        )
    for key, patients, cases in (
        await db.execute(
            stmt.where(*window.between(Case.created_at), *case_conditions(f)).group_by(literal_column("1"))
        )
    ).all():
        out[key][0] += int(patients)
        out[key][1] += int(cases)
    stmt = (
        select(dim_booking, func.count(Booking.id))
        .select_from(Booking)
        .join(Case, Case.id == Booking.case_id)
    )
    if joins_patient:
        stmt = stmt.join(PatientProfile, PatientProfile.id == Case.patient_id).join(
            User, User.id == PatientProfile.user_id
        )
    for key, n in (
        await db.execute(
            stmt.where(*window.between(Booking.confirmed_at), *case_conditions(f)).group_by(
                literal_column("1")
            )
        )
    ).all():
        out[key][2] += int(n)
    return out


def _sorted_rows(rows: list[s.BreakdownRow], raw: dict[str, list[int]]) -> list[s.BreakdownRow]:
    return sorted(
        rows, key=lambda r: (-(raw.get(r.key, [0, 0, 0])[1]), -(raw.get(r.key, [0, 0, 0])[2]), r.label)
    )


async def patients(db: AsyncSession, window: Window, f: Filters) -> s.PatientsOut:
    country = patient_country_expr()
    raw_country = await _breakdown(db, window, f, country, country, joins_patient=True)
    country_raw = {str(k) if k else "unknown": v for k, v in raw_country.items()}
    by_country = _sorted_rows(
        [_row(k, k if k != "unknown" else "", *v) for k, v in country_raw.items()], country_raw
    )

    spec = case_specialty_expr()
    raw_spec = await _breakdown(db, window, f, spec, spec, joins_patient=False)
    spec_ids = [k for k in raw_spec if k is not None]
    spec_names = (
        {
            sid: name
            for sid, name in (
                await db.execute(select(Specialty.id, Specialty.name).where(Specialty.id.in_(spec_ids)))
            ).all()
        }
        if spec_ids
        else {}
    )
    spec_raw = {str(k) if k else "unknown": v for k, v in raw_spec.items()}
    by_specialty = _sorted_rows(
        [_row(str(k) if k else "unknown", spec_names.get(k, ""), *v) for k, v in raw_spec.items()], spec_raw
    )

    proc_case = Case.procedure_id
    proc_booking = func.coalesce(Booking.procedure_id, Case.procedure_id)
    raw_proc = await _breakdown(db, window, f, proc_case, proc_booking, joins_patient=False)
    proc_ids = [k for k in raw_proc if k is not None]
    proc_names = (
        {
            pid: name
            for pid, name in (
                await db.execute(select(Procedure.id, Procedure.name).where(Procedure.id.in_(proc_ids)))
            ).all()
        }
        if proc_ids
        else {}
    )
    proc_raw = {str(k) if k else "unknown": v for k, v in raw_proc.items()}
    by_procedure = _sorted_rows(
        [_row(str(k) if k else "unknown", proc_names.get(k, ""), *v) for k, v in raw_proc.items()], proc_raw
    )
    return s.PatientsOut(
        meta=meta(window, f),
        by_country=by_country[:TOP_LIMIT],
        by_specialty=by_specialty[:TOP_LIMIT],
        by_procedure=by_procedure[:TOP_LIMIT],
    )


# ============================================================================================== hospitals
async def hospitals(db: AsyncSession, window: Window, f: Filters) -> s.HospitalsOut:
    cte = _first_quote_cte(window, f)
    sla = {
        row.hospital_id: row
        for row in (
            await db.execute(
                select(cte.c.hospital_id, *_sla_columns(cte)).select_from(cte).group_by(cte.c.hospital_id)
            )
        ).all()
    }
    booked: dict[uuid.UUID, list[int]] = defaultdict(lambda: [0, 0])
    for hid, n in (
        await db.execute(
            select(Booking.hospital_id, func.count(Booking.id))
            .where(*window.between(Booking.confirmed_at), *case_scope(Booking.case_id, f))
            .group_by(Booking.hospital_id)
        )
    ).all():
        booked[hid][0] = int(n)
    for hid, n in (
        await db.execute(
            select(Booking.hospital_id, func.count(Booking.id))
            .where(*window.between(Booking.completed_at), *case_scope(Booking.case_id, f))
            .group_by(Booking.hospital_id)
        )
    ).all():
        booked[hid][1] = int(n)
    review_conds = [*window.between(Review.created_at)]
    if f.hospital_id is not None:
        review_conds.append(Review.hospital_id == f.hospital_id)
    review_conds += case_scope(
        Review.case_id,
        Filters(country=f.country, specialty_id=f.specialty_id, agent_id=f.agent_id, channel=f.channel),
    )
    reviews = {
        hid: (int(n), avg)
        for hid, n, avg in (
            await db.execute(
                select(Review.hospital_id, func.count(Review.id), func.avg(Review.rating))
                .where(*review_conds)
                .group_by(Review.hospital_id)
            )
        ).all()
    }
    ids = set(sla) | set(booked) | set(reviews)
    if not ids:
        return s.HospitalsOut(meta=meta(window, f), sla_hours=_sla_hours(), rows=[])
    info = {
        hid: (name, city, rating, n)
        for hid, name, city, rating, n in (
            await db.execute(
                select(
                    Hospital.id, Hospital.name, Hospital.city, Hospital.rating_avg, Hospital.rating_count
                ).where(Hospital.id.in_(ids))
            )
        ).all()
    }
    rows = []
    for hid in ids:
        name, city, rating, rating_n = info.get(hid, ("", None, None, 0))
        st = sla.get(hid)
        enquiries = int(st.cases) if st else 0
        b, done = booked.get(hid, [0, 0])
        rv_n, rv_avg = reviews.get(hid, (0, None))
        rows.append(
            s.HospitalRow(
                hospital_id=hid,
                name=name,
                city=city,
                enquiries=enquiries,
                quoted=int(st.quoted) if st else 0,
                bookings=b,
                completed=done,
                conversion_rate=ratio(b, enquiries),
                median_first_quote_hours=hours(st.median) if st else None,
                within_sla_pct=ratio(int(st.wsla or 0), enquiries) if st else None,
                rating_avg=float(rating) if rating is not None and rating_n else None,
                rating_count=int(rating_n or 0),
                reviews_in_period=rv_n,
                avg_rating_in_period=round(float(rv_avg), 2) if rv_avg is not None else None,
            )
        )
    rows.sort(key=lambda r: (-r.bookings, -r.enquiries, r.name))
    return s.HospitalsOut(meta=meta(window, f), sla_hours=_sla_hours(), rows=rows[:TOP_LIMIT])


# ================================================================================================= agents
async def agents(db: AsyncSession, window: Window, f: Filters, *, commission_visible: bool) -> s.AgentsOut:
    if f.channel == "direct":
        return s.AgentsOut(meta=meta(window, f), commission_visible=commission_visible, rows=[])
    stats: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    lead_where = [
        PatientProfile.referred_by_agent_id.is_not(None),
        *window.between(PatientProfile.created_at),
    ]
    if f.agent_id is not None:
        lead_where.append(PatientProfile.referred_by_agent_id == f.agent_id)
    if f.country is not None:
        lead_where.append(
            PatientProfile.id.in_(
                select(PatientProfile.id)
                .join(User, User.id == PatientProfile.user_id)
                .where(patient_country_expr() == f.country)
            )
        )
    if f.hospital_id is None and f.specialty_id is None:
        for aid, n in (
            await db.execute(
                select(PatientProfile.referred_by_agent_id, func.count(PatientProfile.id))
                .where(*lead_where)
                .group_by(PatientProfile.referred_by_agent_id)
            )
        ).all():
            stats[aid]["leads"] = int(n)
    for aid, pts, n in (
        await db.execute(
            select(Case.agent_id, func.count(distinct(Case.patient_id)), func.count(Case.id))
            .where(Case.agent_id.is_not(None), *window.between(Case.created_at), *case_conditions(f))
            .group_by(Case.agent_id)
        )
    ).all():
        stats[aid]["patients"] = int(pts)
        stats[aid]["cases"] = int(n)
    for col, key in ((Booking.confirmed_at, "bookings"), (Booking.completed_at, "completed")):
        for aid, n in (
            await db.execute(
                select(Case.agent_id, func.count(Booking.id))
                .join(Case, Case.id == Booking.case_id)
                .where(Case.agent_id.is_not(None), *window.between(col), *case_conditions(f))
                .group_by(Case.agent_id)
            )
        ).all():
            stats[aid][key] = int(n)
    commission: dict[uuid.UUID, int] = {}
    if commission_visible:
        item_where = [
            SettlementItem.payee_type == PayeeType.AGENT,
            SettlementItem.status != SettlementItemStatus.REVERSED,
            *window.between(SettlementItem.created_at),
            *case_scope(
                select(Booking.case_id).where(Booking.id == SettlementItem.booking_id).scalar_subquery(), f
            ),
        ]
        if f.agent_id is not None:
            item_where.append(SettlementItem.payee_id == f.agent_id)
        commission = {
            aid: int(v or 0)
            for aid, v in (
                await db.execute(
                    select(SettlementItem.payee_id, func.sum(SettlementItem.net_minor))
                    .where(*item_where)
                    .group_by(SettlementItem.payee_id)
                )
            ).all()
        }
        for aid in commission:
            stats[aid]  # noqa: B018 - make sure agents with only commission get a row
    ids = [a for a in stats if a is not None]
    if not ids:
        return s.AgentsOut(meta=meta(window, f), commission_visible=commission_visible, rows=[])
    info = {
        aid: (name, code, country)
        for aid, name, code, country in (
            await db.execute(
                select(Agent.id, Agent.agency_name, Agent.agent_code, Agent.country).where(Agent.id.in_(ids))
            )
        ).all()
    }
    rows = []
    for aid in ids:
        if aid not in info:
            continue
        st = stats[aid]
        name, code, country = info[aid]
        rows.append(
            s.AgentRow(
                agent_id=aid,
                agency_name=name,
                agent_code=code,
                country=country,
                leads=st.get("leads", 0),
                patients=st.get("patients", 0),
                cases=st.get("cases", 0),
                bookings=st.get("bookings", 0),
                completed=st.get("completed", 0),
                conversion_rate=ratio(st.get("bookings", 0), st.get("cases", 0)),
                commission_minor=commission.get(aid, 0) if commission_visible else None,
            )
        )
    rows.sort(key=lambda r: (-r.bookings, -r.cases, -r.leads, r.agency_name))
    return s.AgentsOut(meta=meta(window, f), commission_visible=commission_visible, rows=rows[:TOP_LIMIT])


# ============================================================================================== aftercare
async def aftercare(db: AsyncSession, window: Window, f: Filters) -> s.AftercareOut:
    now = now_ist()
    has_flags = func.jsonb_array_length(AftercareCheckin.red_flags) > 0
    where = [
        AftercareCheckin.due_at <= now,
        *window.between(AftercareCheckin.due_at),
        *case_scope(AftercareCheckin.case_id, f),
    ]
    row = (
        await db.execute(
            select(
                func.count(AftercareCheckin.id),
                func.count(AftercareCheckin.submitted_at),
                func.count().filter(
                    AftercareCheckin.submitted_at.is_(None),
                    AftercareCheckin.due_at < now - timedelta(hours=24),
                ),
                func.count().filter(has_flags),
            ).where(*where)
        )
    ).one()
    due, submitted, overdue, flagged = (int(v or 0) for v in row)
    flag = func.jsonb_array_elements_text(AftercareCheckin.red_flags).table_valued("value").render_derived()
    flags = [
        s.FlagCount(flag=str(name), count=suppress(int(n)), suppressed=suppress(int(n)) is None)
        for name, n in (
            await db.execute(
                select(flag.c.value, func.count())
                .select_from(AftercareCheckin)
                .join(flag, literal(True))
                .where(*where)
                .group_by(flag.c.value)
                .order_by(func.count().desc(), flag.c.value)
            )
        ).all()
    ]
    points = _empty_points(window, s.AftercarePoint)
    b = bucket_expr(AftercareCheckin.due_at, window.granularity)
    for bucket, n_due, n_sub, n_flag in (
        await db.execute(
            select(
                b,
                func.count(AftercareCheckin.id),
                func.count(AftercareCheckin.submitted_at),
                func.count().filter(has_flags),
            )
            .where(*where)
            .group_by(b)
        )
    ).all():
        d = bucket_date(bucket)
        if d in points:
            points[d].due += int(n_due)
            points[d].submitted += int(n_sub)
            points[d].red_flags += int(n_flag)
    return s.AftercareOut(
        meta=meta(window, f),
        due=due,
        submitted=submitted,
        completion_rate=ratio(submitted, due),
        overdue=overdue,
        red_flag_checkins=flagged,
        red_flags_by_kind=flags,
        series=list(points.values()),
    )


# ============================================================================================ intro calls
async def intro_calls(db: AsyncSession, window: Window, f: Filters) -> s.IntroCallsOut:
    patient_id = func.coalesce(
        IntroConsultation.patient_id,
        select(PatientProfile.id)
        .where(PatientProfile.user_id == IntroConsultation.user_id)
        .scalar_subquery(),
    )
    converted = (
        select(Case.id)
        .where(Case.patient_id == patient_id, Case.created_at >= IntroConsultation.created_at)
        .exists()
    )
    status = IntroConsultation.status
    row = (
        await db.execute(
            select(
                func.count(IntroConsultation.id),
                func.count().filter(
                    or_(IntroConsultation.scheduled_at.is_not(None), status.in_(("scheduled", "completed")))
                ),
                func.count().filter(status == "completed"),
                func.count().filter(status == "cancelled"),
                func.count().filter(status == "completed", converted),
            ).where(*window.between(IntroConsultation.created_at))
        )
    ).one()
    requested, scheduled, completed, cancelled, conv = (int(v or 0) for v in row)
    points = _empty_points(window, s.IntroPoint)
    b = bucket_expr(IntroConsultation.created_at, window.granularity)
    for bucket, n, n_done in (
        await db.execute(
            select(b, func.count(IntroConsultation.id), func.count().filter(status == "completed"))
            .where(*window.between(IntroConsultation.created_at))
            .group_by(b)
        )
    ).all():
        d = bucket_date(bucket)
        if d in points:
            points[d].requested += int(n)
            points[d].completed += int(n_done)
    return s.IntroCallsOut(
        meta=meta(window, f),
        requested=requested,
        scheduled=scheduled,
        completed=completed,
        cancelled=cancelled,
        converted=conv,
        conversion_rate=ratio(conv, completed),
        series=list(points.values()),
    )


# =============================================================================================== AI usage
async def ai_usage(db: AsyncSession, window: Window, f: Filters) -> s.AiUsageOut:
    st = AIRequestLog.status
    rows = (
        await db.execute(
            select(
                AIRequestLog.purpose,
                func.count(AIRequestLog.id),
                func.count().filter(st == "error"),
                func.count().filter(st == "refusal"),
                func.count().filter(st == "fallback"),
                func.avg(AIRequestLog.latency_ms),
                func.coalesce(func.sum(AIRequestLog.input_tokens), 0),
                func.coalesce(func.sum(AIRequestLog.output_tokens), 0),
            )
            .where(*window.between(AIRequestLog.created_at))
            .group_by(AIRequestLog.purpose)
            .order_by(func.count(AIRequestLog.id).desc(), AIRequestLog.purpose)
        )
    ).all()
    by_purpose = [
        s.AiPurposeRow(
            purpose=p,
            requests=int(n),
            errors=int(e),
            refusals=int(r),
            fallbacks=int(fb),
            avg_latency_ms=round(float(lat), 1) if lat is not None else None,
            input_tokens=int(i),
            output_tokens=int(o),
        )
        for p, n, e, r, fb, lat, i, o in rows
    ]
    day = bucket_expr(AIRequestLog.created_at, "day")
    daily = await _series(
        db,
        select(day, func.count(AIRequestLog.id))
        .where(*window.between(AIRequestLog.created_at))
        .group_by(day),
    )
    points = _empty_points(window, s.AiPoint)
    for d, n in daily.items():
        key = _bucket_of(window, d)
        if key in points:
            points[key].requests += n
    limit = int(settings.AI_GLOBAL_DAILY_LIMIT)
    peak = None
    if daily:
        pd, pn = max(daily.items(), key=lambda kv: (kv[1], kv[0]))
        peak = s.AiPeak(day=pd, requests=pn, pct_of_limit=ratio(pn, limit) if limit > 0 else None)
    guest_scans = int(
        (
            await db.execute(
                select(func.count(GuestAiUsage.id)).where(*window.between(GuestAiUsage.created_at))
            )
        ).scalar_one()
    )
    return s.AiUsageOut(
        meta=meta(window, f),
        global_daily_limit=limit,
        user_daily_limits={
            "screening": int(settings.AI_USER_DAILY_LIMIT_SCREENING),
            "docai": int(settings.AI_USER_DAILY_LIMIT_DOCAI),
            "voice": int(settings.AI_USER_DAILY_LIMIT_VOICE),
        },
        requests=sum(r.requests for r in by_purpose),
        errors=sum(r.errors for r in by_purpose),
        guest_scans=guest_scans,
        by_purpose=by_purpose,
        series=list(points.values()),
        peak_day=peak,
    )


def _bucket_of(window: Window, d: date) -> date:
    if window.granularity == "week":
        return d - timedelta(days=d.weekday())
    if window.granularity == "month":
        return d.replace(day=1)
    return d


# ========================================================================================== notifications
async def notifications(db: AsyncSession, window: Window, f: Filters) -> s.NotificationsOut:
    emailed = Notification.data.has_key("emailed_at")
    pushed = Notification.data.has_key("pushed_devices")
    rows = (
        await db.execute(
            select(
                Notification.kind,
                func.count(Notification.id),
                func.count(Notification.read_at),
                func.count().filter(emailed),
                func.count().filter(pushed),
            )
            .where(*window.between(Notification.created_at))
            .group_by(Notification.kind)
            .order_by(func.count(Notification.id).desc(), Notification.kind)
        )
    ).all()
    by_kind = [
        s.NotificationKindRow(
            kind=k, sent=int(n), read=int(r), emailed=int(e), pushed=int(p), read_rate=ratio(int(r), int(n))
        )
        for k, n, r, e, p in rows
    ]
    sent = sum(r.sent for r in by_kind)
    read = sum(r.read for r in by_kind)
    return s.NotificationsOut(
        meta=meta(window, f),
        sent=sent,
        read=read,
        emailed=sum(r.emailed for r in by_kind),
        pushed=sum(r.pushed for r in by_kind),
        read_rate=ratio(read, sent),
        by_kind=by_kind,
    )
