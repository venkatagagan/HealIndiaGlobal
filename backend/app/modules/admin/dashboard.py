"""Staff dashboard overview (``GET /admin/dashboard/overview``): the "needs attention" work queue, period KPIs
with the previous period for comparison, a daily/weekly series, the case funnel, cases by specialty, top
hospitals and the admissions coming up this week.

Definitions (all dates in IST, see ``reports``):

* period ``7d`` / ``30d`` / ``90d`` = the last N days including today; ``mtd`` = 1st of this month to today.
  The previous period is the same number of days immediately before it.
* New enquiries = cases created; quotes sent = non-draft quotes created; bookings = bookings confirmed;
  GMV / revenue as in ``reports`` (captured payments / net revenue-ledger credits) - bucketed by day
  (weekly buckets for 90 days).
* Conversion = cases created in the period that reached ``booked`` (status, history or a confirmed booking)
  / cases created in the period.
* Attention items carry a count and the timestamp of the oldest item so the UI can show its age.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AgentStatus,
    BookingStatus,
    CaseStatus,
    HospitalStatus,
    KycStatus,
    PayoutAccountStatus,
    QuoteStatus,
    SosStatus,
    Urgency,
)
from app.models import (
    Agent,
    Booking,
    Case,
    Hospital,
    LedgerAccount,
    LedgerEntry,
    PatientProfile,
    Payment,
    PaymentOrder,
    PayoutAccount,
    Quote,
    Screening,
    SosAlert,
)
from app.modules.admin import reports
from app.modules.admin.schemas import FunnelStage, TopHospital, TopSpecialty

DashboardPeriod = Literal["7d", "30d", "90d", "mtd"]
PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}
#: hours a new enquiry may wait for the hospital's first quote before it counts as overdue
QUOTE_SLA_HOURS = 48
OPEN_CASE_STATUSES = (CaseStatus.ENQUIRY, CaseStatus.QUOTED, CaseStatus.ACCEPTED)
UPCOMING_BOOKING_STATUSES = (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED)
UPCOMING_DAYS = 7
UPCOMING_LIMIT = 10


# ---------------------------------------------------------------------------------------------------- schemas
class AttentionItem(BaseModel):
    key: str
    count: int
    oldest_at: datetime | None = None


class KpiPair(BaseModel):
    current: float
    previous: float


class DashboardKpis(BaseModel):
    new_cases: KpiPair
    quotes_sent: KpiPair
    bookings: KpiPair
    gmv_minor: KpiPair
    revenue_minor: KpiPair
    conversion_rate: KpiPair


class SeriesPoint(BaseModel):
    date: date
    gmv_minor: int = 0
    bookings: int = 0
    new_cases: int = 0


class UpcomingAdmission(BaseModel):
    booking_id: uuid.UUID
    booking_number: str
    case_id: uuid.UUID
    case_number: str
    patient_name: str
    hospital_id: uuid.UUID
    hospital_name: str
    admission_date: date
    status: BookingStatus


class DashboardOverview(BaseModel):
    period: DashboardPeriod
    date_from: date
    date_to: date
    previous_from: date
    previous_to: date
    bucket: Literal["day", "week"]
    currency: str
    quote_sla_hours: int
    kpis: DashboardKpis
    attention: list[AttentionItem]
    series: list[SeriesPoint]
    funnel: list[FunnelStage]
    by_specialty: list[TopSpecialty]
    top_hospitals: list[TopHospital]
    upcoming_admissions: list[UpcomingAdmission]


# ---------------------------------------------------------------------------------------------------- helpers
def period_range(period: DashboardPeriod, today: date | None = None) -> tuple[date, date, date, date]:
    """``(from, to, previous_from, previous_to)`` - inclusive IST days."""
    end = today or reports.today_ist()
    start = end.replace(day=1) if period == "mtd" else end - timedelta(days=PERIOD_DAYS[period] - 1)
    days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return start, end, prev_end - timedelta(days=days - 1), prev_end


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return reports.ist_start(start), reports.ist_start(end + timedelta(days=1))


def _ist_day(col: object) -> object:
    return func.date_trunc("day", func.timezone(reports.IST_ZONE, col))


async def _attention_row(
    db: AsyncSession, key: str, count_col: object, oldest_col: object, *where: object
) -> AttentionItem:
    row = (await db.execute(select(func.count(count_col), func.min(oldest_col)).where(*where))).one()
    return AttentionItem(key=key, count=int(row[0] or 0), oldest_at=row[1])


async def attention(db: AsyncSession, now: datetime) -> list[AttentionItem]:
    emergency_screenings = select(Screening.id).where(Screening.urgency == Urgency.EMERGENCY)
    sla_cutoff = now - timedelta(hours=QUOTE_SLA_HOURS)
    sent_quote = select(Quote.id).where(Quote.case_id == Case.id, Quote.status != QuoteStatus.DRAFT).exists()
    awaiting_quote_oldest = (
        select(func.min(Quote.updated_at))
        .join(Case, Case.id == Quote.case_id)
        .where(Case.status == CaseStatus.QUOTED, Quote.status == QuoteStatus.SENT)
    )
    quoted = await _attention_row(
        db, "quotes_awaiting_patient", Case.id, Case.updated_at, Case.status == CaseStatus.QUOTED
    )
    sent_oldest = (await db.execute(awaiting_quote_oldest)).scalar_one_or_none()
    if sent_oldest is not None:
        quoted.oldest_at = sent_oldest
    return [
        await _attention_row(
            db,
            "unassigned_enquiries",
            Case.id,
            Case.created_at,
            Case.status == CaseStatus.ENQUIRY,
            Case.coordinator_user_id.is_(None),
        ),
        await _attention_row(
            db,
            "quotes_overdue",
            Case.id,
            Case.created_at,
            Case.status == CaseStatus.ENQUIRY,
            Case.created_at < sla_cutoff,
            ~sent_quote,
        ),
        quoted,
        await _attention_row(
            db,
            "emergency_cases",
            Case.id,
            Case.created_at,
            Case.status.in_(OPEN_CASE_STATUSES),
            Case.screening_id.in_(emergency_screenings),
        ),
        await _attention_row(
            db,
            "open_sos",
            SosAlert.id,
            SosAlert.created_at,
            SosAlert.status.in_((SosStatus.OPEN, SosStatus.ACKNOWLEDGED)),
        ),
        await _attention_row(
            db,
            "hospitals_pending",
            Hospital.id,
            Hospital.updated_at,
            Hospital.status == HospitalStatus.PENDING_REVIEW,
        ),
        await _attention_row(
            db, "agents_pending", Agent.id, Agent.created_at, Agent.status == AgentStatus.PENDING
        ),
        await _attention_row(
            db, "agent_kyc_pending", Agent.id, Agent.updated_at, Agent.kyc_status == KycStatus.PENDING
        ),
        await _attention_row(
            db,
            "payout_accounts_unverified",
            PayoutAccount.id,
            PayoutAccount.updated_at,
            PayoutAccount.is_verified.is_(False),
            PayoutAccount.status == PayoutAccountStatus.ACTIVE,
        ),
    ]


async def _period_totals(db: AsyncSession, start: date, end: date) -> dict[str, float]:
    lo, hi = _bounds(start, end)
    new_cases = await reports._scalar_int(
        db, select(func.count(Case.id)).where(Case.created_at >= lo, Case.created_at < hi)
    )
    quotes = await reports._scalar_int(
        db,
        select(func.count(Quote.id)).where(
            Quote.status != QuoteStatus.DRAFT, Quote.created_at >= lo, Quote.created_at < hi
        ),
    )
    bookings = await reports._scalar_int(
        db, select(func.count(Booking.id)).where(Booking.confirmed_at >= lo, Booking.confirmed_at < hi)
    )
    gmv = await reports._scalar_int(
        db,
        select(func.coalesce(func.sum(Payment.base_amount_minor), 0)).where(
            reports._captured(), Payment.captured_at >= lo, Payment.captured_at < hi
        ),
    )
    revenue = await reports._scalar_int(
        db,
        select(func.coalesce(func.sum(reports._signed_amount()), 0))
        .select_from(LedgerEntry)
        .join(LedgerAccount, LedgerAccount.id == LedgerEntry.account_id)
        .where(
            LedgerAccount.code.in_(reports.REVENUE_ACCOUNTS),
            LedgerEntry.created_at >= lo,
            LedgerEntry.created_at < hi,
        ),
    )
    per_case = reports._per_case_max_stage(lo, hi)
    booked = await reports._scalar_int(
        db, select(func.count()).select_from(per_case).where(per_case.c.max_ord >= reports.BOOKED_ORD)
    )
    return {
        "new_cases": new_cases,
        "quotes_sent": quotes,
        "bookings": bookings,
        "gmv_minor": gmv,
        "revenue_minor": revenue,
        "conversion_rate": reports._ratio(booked, new_cases),
    }


async def _funnel(db: AsyncSession, start: date, end: date) -> list[FunnelStage]:
    lo, hi = _bounds(start, end)
    total = await reports._scalar_int(
        db, select(func.count(Case.id)).where(Case.created_at >= lo, Case.created_at < hi)
    )
    per_case = reports._per_case_max_stage(lo, hi)
    at_max: dict[int, int] = {}
    for ordinal, n in await db.execute(select(per_case.c.max_ord, func.count()).group_by(per_case.c.max_ord)):
        at_max[int(ordinal)] = at_max.get(int(ordinal), 0) + int(n)
    out = []
    for i, stage in enumerate(reports.FUNNEL_STAGES):
        reached = sum(n for o, n in at_max.items() if o >= i)
        if i == 0:
            reached = total  # every case created in the period entered as an enquiry
        out.append(FunnelStage(stage=stage.value, count=reached, pct_of_total=reports._ratio(reached, total)))
    return out


async def _series(
    db: AsyncSession, start: date, end: date, bucket: Literal["day", "week"]
) -> list[SeriesPoint]:
    lo, hi = _bounds(start, end)
    step = 7 if bucket == "week" else 1
    keys: list[date] = []
    cur = start
    while cur <= end:
        keys.append(cur)
        cur += timedelta(days=step)
    points = {k: SeriesPoint(date=k) for k in keys}

    def key_for(value: datetime | date) -> date | None:
        d = value.date() if isinstance(value, datetime) else value
        if d < start or d > end:
            return None
        return start + timedelta(days=((d - start).days // step) * step)

    day = _ist_day(Payment.captured_at)
    for bucket_day, total in await db.execute(
        select(day, func.sum(Payment.base_amount_minor))
        .where(reports._captured(), Payment.captured_at >= lo, Payment.captured_at < hi)
        .group_by(day)
    ):
        if (k := key_for(bucket_day)) is not None:
            points[k].gmv_minor += int(total or 0)
    day = _ist_day(Booking.confirmed_at)
    for bucket_day, n in await db.execute(
        select(day, func.count(Booking.id))
        .where(Booking.confirmed_at >= lo, Booking.confirmed_at < hi)
        .group_by(day)
    ):
        if (k := key_for(bucket_day)) is not None:
            points[k].bookings += int(n)
    day = _ist_day(Case.created_at)
    for bucket_day, n in await db.execute(
        select(day, func.count(Case.id)).where(Case.created_at >= lo, Case.created_at < hi).group_by(day)
    ):
        if (k := key_for(bucket_day)) is not None:
            points[k].new_cases += int(n)
    return [points[k] for k in keys]


async def _top_hospitals(db: AsyncSession, start: date, end: date, limit: int = 5) -> list[TopHospital]:
    lo, hi = _bounds(start, end)
    case_id = func.coalesce(PaymentOrder.case_id, Booking.case_id)
    gmv_rows = await db.execute(
        select(Case.hospital_id, func.sum(Payment.base_amount_minor))
        .select_from(Payment)
        .join(PaymentOrder, PaymentOrder.id == Payment.order_id)
        .outerjoin(Booking, Booking.id == PaymentOrder.booking_id)
        .join(Case, Case.id == case_id)
        .where(reports._captured(), Payment.captured_at >= lo, Payment.captured_at < hi)
        .group_by(Case.hospital_id)
    )
    gmv = {hid: int(v or 0) for hid, v in gmv_rows.all()}
    booking_rows = await db.execute(
        select(Booking.hospital_id, func.count(Booking.id))
        .where(Booking.confirmed_at >= lo, Booking.confirmed_at < hi)
        .group_by(Booking.hospital_id)
    )
    bookings = {hid: int(n) for hid, n in booking_rows.all()}
    ranked = sorted(set(gmv) | set(bookings), key=lambda h: (-gmv.get(h, 0), -bookings.get(h, 0), str(h)))[
        :limit
    ]
    if not ranked:
        return []
    names = dict((await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(ranked)))).all())
    return [
        TopHospital(id=h, name=names.get(h, ""), bookings=bookings.get(h, 0), gmv_minor=gmv.get(h, 0))
        for h in ranked
    ]


async def _upcoming(db: AsyncSession, today: date) -> list[UpcomingAdmission]:
    rows = await db.execute(
        select(
            Booking.id,
            Booking.booking_number,
            Booking.case_id,
            Case.case_number,
            func.trim(func.concat(PatientProfile.first_name, " ", PatientProfile.last_name)),
            Booking.hospital_id,
            Hospital.name,
            Booking.admission_date,
            Booking.status,
        )
        .join(Case, Case.id == Booking.case_id)
        .join(PatientProfile, PatientProfile.id == Booking.patient_id)
        .join(Hospital, Hospital.id == Booking.hospital_id)
        .where(
            Booking.status.in_(UPCOMING_BOOKING_STATUSES),
            Booking.admission_date >= today,
            Booking.admission_date < today + timedelta(days=UPCOMING_DAYS),
        )
        .order_by(Booking.admission_date, Booking.booking_number)
        .limit(UPCOMING_LIMIT)
    )
    return [
        UpcomingAdmission(
            booking_id=bid,
            booking_number=num,
            case_id=cid,
            case_number=cnum,
            patient_name=pname or "",
            hospital_id=hid,
            hospital_name=hname,
            admission_date=adm,
            status=status,
        )
        for bid, num, cid, cnum, pname, hid, hname, adm, status in rows.all()
    ]


# ---------------------------------------------------------------------------------------------------- service
async def overview(
    db: AsyncSession, period: DashboardPeriod, now: datetime | None = None
) -> DashboardOverview:
    now = now or datetime.now(reports.IST)
    today = now.astimezone(reports.IST).date()
    start, end, prev_start, prev_end = period_range(period, today)
    bucket: Literal["day", "week"] = "week" if (end - start).days + 1 > 45 else "day"
    cur = await _period_totals(db, start, end)
    prev = await _period_totals(db, prev_start, prev_end)
    lo, hi = _bounds(start, end)
    return DashboardOverview(
        period=period,
        date_from=start,
        date_to=end,
        previous_from=prev_start,
        previous_to=prev_end,
        bucket=bucket,
        currency=reports.BASE_CURRENCY,
        quote_sla_hours=QUOTE_SLA_HOURS,
        kpis=DashboardKpis(**{k: KpiPair(current=cur[k], previous=prev[k]) for k in cur}),
        attention=await attention(db, now),
        series=await _series(db, start, end, bucket),
        funnel=await _funnel(db, start, end),
        by_specialty=await reports._specialty_counts(
            db, Case.created_at >= lo, Case.created_at < hi, limit=8
        ),
        top_hospitals=await _top_hospitals(db, start, end),
        upcoming_admissions=await _upcoming(db, today),
    )
