"""Analytics routes. Staff: ``/admin/analytics/*`` (finance figures: admin/finance/super_admin only).
Partners: ``/hospital-portal/performance`` and ``/agent-portal/performance``. Responses are cached for 60
s."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.deps import ADMIN_ROLES, FINANCE_ROLES, STAFF_ROLES, DbSession, require_roles
from app.core.enums import UserRole
from app.models import User
from app.modules.agents.service import get_agent
from app.modules.analytics import portal, service
from app.modules.analytics import schemas as s
from app.modules.analytics.common import (
    Channel,
    Filters,
    Granularity,
    Window,
    cached,
    make_window,
    normalize_country,
)
from app.modules.hospitals.policies import Portal

router = APIRouter(tags=["analytics"])

StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
MoneyUser = Annotated[User, Depends(require_roles(*(ADMIN_ROLES | FINANCE_ROLES)))]
AgentUser = Annotated[User, Depends(require_roles(UserRole.AGENT))]
MONEY_ROLES = {r.value for r in ADMIN_ROLES | FINANCE_ROLES}
PARTNER_DEFAULT_DAYS = 90


def window_params(
    date_from: Annotated[date | None, Query(alias="from", description="inclusive IST day")] = None,
    date_to: Annotated[date | None, Query(alias="to", description="inclusive IST day")] = None,
    granularity: Granularity | None = None,
) -> Window:
    return make_window(date_from, date_to, granularity)


def partner_window_params(
    date_from: Annotated[date | None, Query(alias="from", description="inclusive IST day")] = None,
    date_to: Annotated[date | None, Query(alias="to", description="inclusive IST day")] = None,
    granularity: Granularity | None = None,
) -> Window:
    return make_window(date_from, date_to, granularity, default_days=PARTNER_DEFAULT_DAYS)


def filter_params(
    country: Annotated[
        str | None, Query(max_length=2, description="patient's home country, ISO-3166 alpha-2")
    ] = None,
    specialty_id: uuid.UUID | None = None,
    hospital_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
    channel: Channel | None = None,
) -> Filters:
    return Filters(
        country=normalize_country(country),
        specialty_id=specialty_id,
        hospital_id=hospital_id,
        agent_id=agent_id,
        channel=channel,
    )


WindowQ = Annotated[Window, Depends(window_params)]
PartnerWindowQ = Annotated[Window, Depends(partner_window_params)]
FiltersQ = Annotated[Filters, Depends(filter_params)]


def _params(window: Window, f: Filters, **extra: Any) -> dict[str, Any]:
    return {"w": [window.date_from, window.date_to, window.granularity], "f": f.as_dict(), **extra}


async def _staff[M: BaseModel](
    section: str,
    model: type[M],
    window: Window,
    f: Filters,
    build: Callable[[], Awaitable[M]],
    scope: str = "staff",
    **extra: Any,
) -> M:
    return await cached(section, scope, _params(window, f, **extra), model, build)


@router.get("/admin/analytics/overview", response_model=s.OverviewOut)
async def analytics_overview(db: DbSession, _: StaffUser, window: WindowQ, f: FiltersQ) -> s.OverviewOut:
    return await _staff("overview", s.OverviewOut, window, f, lambda: service.overview(db, window, f))


@router.get("/admin/analytics/quote-sla", response_model=s.QuoteSlaOut)
async def analytics_quote_sla(db: DbSession, _: StaffUser, window: WindowQ, f: FiltersQ) -> s.QuoteSlaOut:
    return await _staff("quote_sla", s.QuoteSlaOut, window, f, lambda: service.quote_sla(db, window, f))


@router.get("/admin/analytics/finance", response_model=s.FinanceOut)
async def analytics_finance(
    db: DbSession,
    _: MoneyUser,
    window: WindowQ,
    f: FiltersQ,
    currency: Annotated[str, Query(min_length=3, max_length=3, description="reporting currency")] = "INR",
) -> s.FinanceOut:
    ccy = currency.upper()
    return await _staff(
        "finance",
        s.FinanceOut,
        window,
        f,
        lambda: service.finance(db, window, f, ccy),
        scope="money",
        currency=ccy,
    )


@router.get("/admin/analytics/patients", response_model=s.PatientsOut)
async def analytics_patients(db: DbSession, _: StaffUser, window: WindowQ, f: FiltersQ) -> s.PatientsOut:
    return await _staff("patients", s.PatientsOut, window, f, lambda: service.patients(db, window, f))


@router.get("/admin/analytics/hospitals", response_model=s.HospitalsOut)
async def analytics_hospitals(db: DbSession, _: StaffUser, window: WindowQ, f: FiltersQ) -> s.HospitalsOut:
    return await _staff("hospitals", s.HospitalsOut, window, f, lambda: service.hospitals(db, window, f))


@router.get("/admin/analytics/agents", response_model=s.AgentsOut)
async def analytics_agents(db: DbSession, user: StaffUser, window: WindowQ, f: FiltersQ) -> s.AgentsOut:
    visible = str(getattr(user.role, "value", user.role)) in MONEY_ROLES
    return await _staff(
        "agents",
        s.AgentsOut,
        window,
        f,
        lambda: service.agents(db, window, f, commission_visible=visible),
        scope="money" if visible else "staff",
    )


@router.get("/admin/analytics/aftercare", response_model=s.AftercareOut)
async def analytics_aftercare(db: DbSession, _: StaffUser, window: WindowQ, f: FiltersQ) -> s.AftercareOut:
    return await _staff("aftercare", s.AftercareOut, window, f, lambda: service.aftercare(db, window, f))


@router.get("/admin/analytics/intro-calls", response_model=s.IntroCallsOut)
async def analytics_intro_calls(db: DbSession, _: StaffUser, window: WindowQ) -> s.IntroCallsOut:
    f = Filters()
    return await _staff("intro_calls", s.IntroCallsOut, window, f, lambda: service.intro_calls(db, window, f))


@router.get("/admin/analytics/ai-usage", response_model=s.AiUsageOut)
async def analytics_ai_usage(db: DbSession, _: StaffUser, window: WindowQ) -> s.AiUsageOut:
    f = Filters()
    return await _staff("ai_usage", s.AiUsageOut, window, f, lambda: service.ai_usage(db, window, f))


@router.get("/admin/analytics/notifications", response_model=s.NotificationsOut)
async def analytics_notifications(db: DbSession, _: StaffUser, window: WindowQ) -> s.NotificationsOut:
    f = Filters()
    return await _staff(
        "notifications", s.NotificationsOut, window, f, lambda: service.notifications(db, window, f)
    )


# ------------------------------------------------------------------------------------------------ partners
@router.get("/hospital-portal/performance", response_model=s.HospitalPerformanceOut)
async def hospital_performance(
    db: DbSession, ctx: Portal, window: PartnerWindowQ
) -> s.HospitalPerformanceOut:
    hid = ctx.hospital_id
    return await cached(
        "hospital_performance",
        str(hid),
        _params(window, Filters()),
        s.HospitalPerformanceOut,
        lambda: portal.hospital_performance(db, window, hid),
    )


@router.get("/agent-portal/performance", response_model=s.AgentPerformanceOut)
async def agent_performance(db: DbSession, user: AgentUser, window: PartnerWindowQ) -> s.AgentPerformanceOut:
    agent = await get_agent(db, user)
    aid = agent.id
    return await cached(
        "agent_performance",
        str(aid),
        _params(window, Filters()),
        s.AgentPerformanceOut,
        lambda: portal.agent_performance(db, window, aid),
    )
