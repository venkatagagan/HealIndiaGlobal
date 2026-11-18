"""Partner-facing performance pages: ``GET /hospital-portal/performance`` (the selected hospital) and
``GET /agent-portal/performance`` (the signed-in agent). Same aggregates and IST conventions as the staff
analytics, scoped to the caller; no other hospital's or agent's numbers leak (the platform median quote
time is
a single platform-wide aggregate)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import distinct, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PayeeType, QuoteStatus, SettlementItemStatus
from app.models import Booking, Case, Hospital, PatientProfile, Quote, Review, SettlementItem, User
from app.modules.analytics import schemas as s
from app.modules.analytics.common import (
    Filters,
    Window,
    bucket_date,
    bucket_expr,
    hours,
    meta,
    patient_country_expr,
    ratio,
    suppress,
)
from app.modules.analytics.service import (
    _empty_points,
    _first_quote_cte,
    _overdue_now_conditions,
    _sla_columns,
    _sla_from_row,
    _sla_hours,
)

PENDING_COMMISSION = (
    SettlementItemStatus.PENDING,
    SettlementItemStatus.ELIGIBLE,
    SettlementItemStatus.ON_HOLD,
    SettlementItemStatus.BATCHED,
)


async def _bucketed(db: AsyncSession, stmt: object) -> dict[date, int]:
    out: dict[date, int] = {}
    for bucket, n in (await db.execute(stmt)).all():  # type: ignore[call-overload]
        d = bucket_date(bucket)
        if d is not None:
            out[d] = out.get(d, 0) + int(n or 0)
    return out


async def hospital_performance(
    db: AsyncSession, window: Window, hospital_id: uuid.UUID
) -> s.HospitalPerformanceOut:
    f = Filters(hospital_id=hospital_id)
    cte = _first_quote_cte(window, f)
    sla = _sla_from_row((await db.execute(select(*_sla_columns(cte)).select_from(cte))).one())
    platform = _first_quote_cte(window, Filters())
    platform_median = (
        await db.execute(
            select(func.percentile_cont(0.5).within_group(platform.c.hours.asc())).select_from(platform)
        )
    ).scalar_one_or_none()
    in_case = Quote.case_id.in_(select(Case.id).where(Case.hospital_id == hospital_id))
    row = (
        await db.execute(
            select(
                select(func.count(Quote.id))
                .where(
                    Quote.hospital_id == hospital_id,
                    Quote.status != QuoteStatus.DRAFT,
                    *window.between(Quote.created_at),
                )
                .scalar_subquery(),
                select(func.count(distinct(Quote.case_id)))
                .where(in_case, Quote.accepted_at.is_not(None), *window.between(Quote.accepted_at))
                .scalar_subquery(),
                select(func.count(Booking.id))
                .where(Booking.hospital_id == hospital_id, *window.between(Booking.confirmed_at))
                .scalar_subquery(),
                select(func.count(Booking.id))
                .where(Booking.hospital_id == hospital_id, *window.between(Booking.completed_at))
                .scalar_subquery(),
                select(func.count(Case.id)).where(*_overdue_now_conditions(f)).scalar_subquery(),
            )
        )
    ).one()
    quotes_sent, accepted, bookings, completed, overdue = (int(v or 0) for v in row)

    hospital = await db.get(Hospital, hospital_id)
    rv_n, rv_avg = (
        await db.execute(
            select(func.count(Review.id), func.avg(Review.rating)).where(
                Review.hospital_id == hospital_id, *window.between(Review.created_at)
            )
        )
    ).one()

    country = patient_country_expr()
    raw: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for key, pts, n in (
        await db.execute(
            select(country, func.count(distinct(Case.patient_id)), func.count(Case.id))
            .select_from(Case)
            .join(PatientProfile, PatientProfile.id == Case.patient_id)
            .join(User, User.id == PatientProfile.user_id)
            .where(Case.hospital_id == hospital_id, *window.between(Case.created_at))
            .group_by(country)
        )
    ).all():
        raw[key or "unknown"][0] += int(pts)
        raw[key or "unknown"][1] += int(n)
    for key, n in (
        await db.execute(
            select(country, func.count(Booking.id))
            .select_from(Booking)
            .join(PatientProfile, PatientProfile.id == Booking.patient_id)
            .join(User, User.id == PatientProfile.user_id)
            .where(Booking.hospital_id == hospital_id, *window.between(Booking.confirmed_at))
            .group_by(country)
        )
    ).all():
        raw[key or "unknown"][2] += int(n)
    by_country = []
    for key, (pts, n, b) in sorted(raw.items(), key=lambda kv: (-kv[1][1], -kv[1][2], kv[0])):
        p, c, bk = suppress(pts), suppress(n), suppress(b)
        by_country.append(
            s.BreakdownRow(
                key=key,
                label=key if key != "unknown" else "",
                patients=p,
                cases=c,
                bookings=bk,
                suppressed=(p is None) or (c is None) or (bk is None),
            )
        )

    points = _empty_points(window, s.PerformancePoint)
    g = window.granularity
    for metric, stmt in (
        (
            "enquiries",
            select(bucket_expr(Case.created_at, g), func.count(Case.id))
            .where(Case.hospital_id == hospital_id, *window.between(Case.created_at))
            .group_by(literal_column("1")),
        ),
        (
            "quotes_sent",
            select(bucket_expr(Quote.created_at, g), func.count(Quote.id))
            .where(
                Quote.hospital_id == hospital_id,
                Quote.status != QuoteStatus.DRAFT,
                *window.between(Quote.created_at),
            )
            .group_by(literal_column("1")),
        ),
        (
            "bookings",
            select(bucket_expr(Booking.confirmed_at, g), func.count(Booking.id))
            .where(Booking.hospital_id == hospital_id, *window.between(Booking.confirmed_at))
            .group_by(literal_column("1")),
        ),
    ):
        for d, n in (await _bucketed(db, stmt)).items():
            if d in points:
                setattr(points[d], metric, getattr(points[d], metric) + n)

    rating_count = int(hospital.rating_count or 0) if hospital else 0
    return s.HospitalPerformanceOut(
        meta=meta(window, f),
        sla_hours=_sla_hours(),
        enquiries=sla.cases,
        quoted=sla.quoted,
        quotes_sent=quotes_sent,
        accepted=accepted,
        bookings=bookings,
        completed=completed,
        conversion_rate=ratio(bookings, sla.cases),
        median_first_quote_hours=sla.median_hours,
        p90_first_quote_hours=sla.p90_hours,
        within_sla_pct=sla.within_sla_pct,
        overdue_now=overdue,
        platform_median_first_quote_hours=hours(platform_median),
        rating_avg=float(hospital.rating_avg) if hospital and rating_count else None,
        rating_count=rating_count,
        reviews_in_period=int(rv_n or 0),
        avg_rating_in_period=round(float(rv_avg), 2) if rv_avg is not None else None,
        by_country=by_country,
        series=list(points.values()),
    )


async def agent_performance(db: AsyncSession, window: Window, agent_id: uuid.UUID) -> s.AgentPerformanceOut:
    f = Filters(agent_id=agent_id)
    agent_cases = select(Case.id).where(Case.agent_id == agent_id)
    item_where = [
        SettlementItem.payee_type == PayeeType.AGENT,
        SettlementItem.payee_id == agent_id,
        *window.between(SettlementItem.created_at),
    ]
    row = (
        await db.execute(
            select(
                select(func.count(PatientProfile.id))
                .where(
                    PatientProfile.referred_by_agent_id == agent_id,
                    *window.between(PatientProfile.created_at),
                )
                .scalar_subquery(),
                select(func.count(distinct(Case.patient_id)))
                .where(Case.agent_id == agent_id, *window.between(Case.created_at))
                .scalar_subquery(),
                select(func.count(Case.id))
                .where(Case.agent_id == agent_id, *window.between(Case.created_at))
                .scalar_subquery(),
                select(func.count(distinct(Quote.case_id)))
                .where(
                    Quote.case_id.in_(agent_cases),
                    Quote.status != QuoteStatus.DRAFT,
                    *window.between(Quote.created_at),
                )
                .scalar_subquery(),
                select(func.count(Booking.id))
                .where(Booking.case_id.in_(agent_cases), *window.between(Booking.confirmed_at))
                .scalar_subquery(),
                select(func.count(Booking.id))
                .where(Booking.case_id.in_(agent_cases), *window.between(Booking.completed_at))
                .scalar_subquery(),
                select(func.coalesce(func.sum(SettlementItem.net_minor), 0))
                .where(*item_where, SettlementItem.status != SettlementItemStatus.REVERSED)
                .scalar_subquery(),
                select(func.coalesce(func.sum(SettlementItem.net_minor), 0))
                .where(*item_where, SettlementItem.status.in_(PENDING_COMMISSION))
                .scalar_subquery(),
                select(func.coalesce(func.sum(SettlementItem.net_minor), 0))
                .where(*item_where, SettlementItem.status == SettlementItemStatus.PAID)
                .scalar_subquery(),
            )
        )
    ).one()
    leads, patients, cases, quoted, bookings, completed, earned, pending, paid = (int(v or 0) for v in row)

    points = _empty_points(window, s.PerformancePoint)
    g = window.granularity
    for metric, stmt in (
        (
            "enquiries",
            select(bucket_expr(Case.created_at, g), func.count(Case.id))
            .where(Case.agent_id == agent_id, *window.between(Case.created_at))
            .group_by(literal_column("1")),
        ),
        (
            "quotes_sent",
            select(bucket_expr(Quote.created_at, g), func.count(distinct(Quote.case_id)))
            .where(
                Quote.case_id.in_(agent_cases),
                Quote.status != QuoteStatus.DRAFT,
                *window.between(Quote.created_at),
            )
            .group_by(literal_column("1")),
        ),
        (
            "bookings",
            select(bucket_expr(Booking.confirmed_at, g), func.count(Booking.id))
            .where(Booking.case_id.in_(agent_cases), *window.between(Booking.confirmed_at))
            .group_by(literal_column("1")),
        ),
        (
            "commission_minor",
            select(bucket_expr(SettlementItem.created_at, g), func.sum(SettlementItem.net_minor))
            .where(*item_where, SettlementItem.status != SettlementItemStatus.REVERSED)
            .group_by(literal_column("1")),
        ),
    ):
        if metric == "commission_minor":
            for p in points.values():
                p.commission_minor = 0
        for d, n in (await _bucketed(db, stmt)).items():
            if d in points:
                setattr(points[d], metric, (getattr(points[d], metric) or 0) + n)

    return s.AgentPerformanceOut(
        meta=meta(window, f),
        leads=leads,
        patients=patients,
        cases=cases,
        quoted=quoted,
        bookings=bookings,
        completed=completed,
        conversion_rate=ratio(bookings, cases),
        commission=s.AgentCommissionSummary(earned_minor=earned, pending_minor=pending, paid_minor=paid),
        series=list(points.values()),
    )
