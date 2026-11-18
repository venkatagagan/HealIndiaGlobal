"""Response models of the analytics endpoints (aggregates only - never a patient-level row)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.modules.analytics.common import AnalyticsMeta


# --------------------------------------------------------------------------------------------- overview
class FunnelStep(BaseModel):
    step: str
    """visitors | guest_scans | registrations | screenings | cases | quotes_sent | quotes_accepted | bookings |
    completed | reviews"""
    count: int | None
    """``null`` = not attributable to the active filters (steps before a case exists)."""
    rate_from_previous: float | None = None
    rate_from_first: float | None = None


class OverviewKpis(BaseModel):
    cases: int
    quotes_sent: int
    bookings: int
    completed: int
    reviews: int
    registrations: int | None
    conversion_rate: float | None
    """bookings confirmed / cases created in the window (both event counts)."""
    median_first_quote_hours: float | None


class OverviewPoint(BaseModel):
    bucket: date
    cases: int = 0
    quotes_sent: int = 0
    bookings: int = 0
    registrations: int | None = 0


class OverviewOut(BaseModel):
    meta: AnalyticsMeta
    kpis: OverviewKpis
    funnel: list[FunnelStep]
    series: list[OverviewPoint]


# -------------------------------------------------------------------------------------------- quote SLA
class SlaStats(BaseModel):
    cases: int
    quoted: int
    median_hours: float | None
    p90_hours: float | None
    within_24h_pct: float | None
    within_48h_pct: float | None
    within_sla_pct: float | None


class HospitalSla(SlaStats):
    hospital_id: uuid.UUID
    hospital_name: str
    overdue_now: int


class QuoteSlaOut(BaseModel):
    meta: AnalyticsMeta
    sla_hours: int
    totals: SlaStats
    overdue_now: int
    """Open enquiries (any age) past their quote due time without a sent quote, right now."""
    by_hospital: list[HospitalSla]


# ---------------------------------------------------------------------------------------------- finance
class FxInfo(BaseModel):
    currency: str
    rate_inr_per_unit: str
    as_of: datetime | None
    source: str | None


class FinanceTotals(BaseModel):
    gmv_minor: int
    refunds_minor: int
    net_gmv_minor: int
    commission_minor: int
    service_fee_minor: int
    revenue_minor: int
    payments: int


class FinanceMonth(BaseModel):
    month: str
    gmv_minor: int = 0
    refunds_minor: int = 0
    commission_minor: int = 0
    service_fee_minor: int = 0


class CurrencyRow(BaseModel):
    currency: str
    payments: int
    amount_minor: int
    """in the payment currency"""
    base_amount_minor: int
    """INR at the capture-time rate"""
    reporting_amount_minor: int


class InstallmentCurrencyRow(BaseModel):
    currency: str
    count: int
    overdue_count: int
    amount_minor: int


class OutstandingInstallments(BaseModel):
    count: int
    overdue_count: int
    amount_minor: int
    """reporting currency"""
    past_treatment_count: int
    """open instalments due on/after the booking's admission date (must be 0 - CG-18)"""
    by_currency: list[InstallmentCurrencyRow]


class FinanceOut(BaseModel):
    meta: AnalyticsMeta
    reporting_currency: str
    base_currency: str = "INR"
    fx: FxInfo | None
    totals: FinanceTotals
    by_month: list[FinanceMonth]
    by_currency: list[CurrencyRow]
    outstanding_installments: OutstandingInstallments


# --------------------------------------------------------------------------------------------- patients
class BreakdownRow(BaseModel):
    key: str
    label: str
    patients: int | None
    cases: int | None
    bookings: int | None
    suppressed: bool = False


class PatientsOut(BaseModel):
    meta: AnalyticsMeta
    by_country: list[BreakdownRow]
    by_specialty: list[BreakdownRow]
    by_procedure: list[BreakdownRow]


# -------------------------------------------------------------------------------------------- hospitals
class HospitalRow(BaseModel):
    hospital_id: uuid.UUID
    name: str
    city: str | None
    enquiries: int
    quoted: int
    bookings: int
    completed: int
    conversion_rate: float | None
    median_first_quote_hours: float | None
    within_sla_pct: float | None
    rating_avg: float | None
    rating_count: int
    reviews_in_period: int
    avg_rating_in_period: float | None


class HospitalsOut(BaseModel):
    meta: AnalyticsMeta
    sla_hours: int
    rows: list[HospitalRow]


# ----------------------------------------------------------------------------------------------- agents
class AgentRow(BaseModel):
    agent_id: uuid.UUID
    agency_name: str
    agent_code: str
    country: str | None
    leads: int
    patients: int
    cases: int
    bookings: int
    completed: int
    conversion_rate: float | None
    commission_minor: int | None
    """net agent commission (INR) of settlement items created in the window; finance/admin only"""


class AgentsOut(BaseModel):
    meta: AnalyticsMeta
    commission_visible: bool
    currency: str = "INR"
    rows: list[AgentRow]


# --------------------------------------------------------------------------------------------- aftercare
class FlagCount(BaseModel):
    flag: str
    count: int | None
    suppressed: bool = False


class AftercarePoint(BaseModel):
    bucket: date
    due: int = 0
    submitted: int = 0
    red_flags: int = 0


class AftercareOut(BaseModel):
    meta: AnalyticsMeta
    due: int
    submitted: int
    completion_rate: float | None
    overdue: int
    red_flag_checkins: int
    red_flags_by_kind: list[FlagCount]
    series: list[AftercarePoint]


# ------------------------------------------------------------------------------------------- intro calls
class IntroPoint(BaseModel):
    bucket: date
    requested: int = 0
    completed: int = 0


class IntroCallsOut(BaseModel):
    meta: AnalyticsMeta
    filters_applied: bool = False
    requested: int
    scheduled: int
    completed: int
    cancelled: int
    converted: int
    """completed calls whose person later opened a case"""
    conversion_rate: float | None
    series: list[IntroPoint]


# ---------------------------------------------------------------------------------------------- AI usage
class AiPurposeRow(BaseModel):
    purpose: str
    requests: int
    errors: int
    refusals: int
    fallbacks: int
    avg_latency_ms: float | None
    input_tokens: int
    output_tokens: int


class AiPoint(BaseModel):
    bucket: date
    requests: int = 0


class AiPeak(BaseModel):
    day: date
    requests: int
    pct_of_limit: float | None


class AiUsageOut(BaseModel):
    meta: AnalyticsMeta
    filters_applied: bool = False
    global_daily_limit: int
    user_daily_limits: dict[str, int]
    requests: int
    errors: int
    guest_scans: int
    by_purpose: list[AiPurposeRow]
    series: list[AiPoint]
    peak_day: AiPeak | None


# ----------------------------------------------------------------------------------------- notifications
class NotificationKindRow(BaseModel):
    kind: str
    sent: int
    read: int
    emailed: int
    pushed: int
    read_rate: float | None


class NotificationsOut(BaseModel):
    meta: AnalyticsMeta
    filters_applied: bool = False
    sent: int
    read: int
    emailed: int
    pushed: int
    read_rate: float | None
    by_kind: list[NotificationKindRow]


# ----------------------------------------------------------------------------------------- partner portals
class PerformancePoint(BaseModel):
    bucket: date
    enquiries: int = 0
    quotes_sent: int = 0
    bookings: int = 0
    commission_minor: int | None = None


class HospitalPerformanceOut(BaseModel):
    meta: AnalyticsMeta
    sla_hours: int
    enquiries: int
    quoted: int
    quotes_sent: int
    accepted: int
    bookings: int
    completed: int
    conversion_rate: float | None
    median_first_quote_hours: float | None
    p90_first_quote_hours: float | None
    within_sla_pct: float | None
    overdue_now: int
    platform_median_first_quote_hours: float | None
    rating_avg: float | None
    rating_count: int
    reviews_in_period: int
    avg_rating_in_period: float | None
    by_country: list[BreakdownRow]
    series: list[PerformancePoint]


class AgentCommissionSummary(BaseModel):
    currency: str = "INR"
    earned_minor: int
    pending_minor: int
    paid_minor: int


class AgentPerformanceOut(BaseModel):
    meta: AnalyticsMeta
    leads: int
    patients: int
    cases: int
    quoted: int
    bookings: int
    completed: int
    conversion_rate: float | None
    commission: AgentCommissionSummary
    series: list[PerformancePoint]
