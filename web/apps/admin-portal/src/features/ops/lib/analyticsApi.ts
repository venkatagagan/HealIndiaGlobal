/**
 * Staff analytics (GET /admin/analytics/*). Shapes mirror backend/app/modules/analytics/schemas.py and
 * AnalyticsMeta (analytics/common.py). Aggregates only: `null` counts mean "not available for the active filters"
 * (steps before a case exists) or, on rows with `suppressed: true`, a small cell (< meta.min_cell) hidden for
 * privacy. Rates (`*_rate`, `*_pct`, `rate_from_*`) are fractions (0..1; event counts, so they may exceed 1).
 * Dates are India Standard Time calendar days (meta.timezone = "Asia/Kolkata").
 */
import { api } from '@hig/shared/api';

export type Granularity = 'day' | 'week' | 'month';
export type Channel = 'direct' | 'agent';

export interface AnalyticsMeta {
  date_from: string;
  date_to: string;
  granularity: Granularity;
  timezone: string;
  filters: Record<string, string | null>;
  generated_at: string;
  min_cell: number;
}

export interface AnalyticsParams {
  from?: string;
  to?: string;
  granularity?: Granularity;
  country?: string;
  specialty_id?: string;
  hospital_id?: string;
  agent_id?: string;
  channel?: Channel;
}

// ------------------------------------------------------------------------------------------------ overview
export const FUNNEL_STEPS = [
  'visitors',
  'guest_scans',
  'registrations',
  'screenings',
  'cases',
  'quotes_sent',
  'quotes_accepted',
  'bookings',
  'completed',
  'reviews',
] as const;
export type FunnelStepId = (typeof FUNNEL_STEPS)[number];

export interface FunnelStep {
  step: FunnelStepId | string;
  count: number | null;
  rate_from_previous: number | null;
  rate_from_first: number | null;
}

export interface OverviewKpis {
  cases: number;
  quotes_sent: number;
  bookings: number;
  completed: number;
  reviews: number;
  registrations: number | null;
  conversion_rate: number | null;
  median_first_quote_hours: number | null;
}

export interface OverviewPoint {
  bucket: string;
  cases: number;
  quotes_sent: number;
  bookings: number;
  registrations: number | null;
}

export interface OverviewOut {
  meta: AnalyticsMeta;
  kpis: OverviewKpis;
  funnel: FunnelStep[];
  series: OverviewPoint[];
}

// ----------------------------------------------------------------------------------------------- quote SLA
export interface SlaStats {
  cases: number;
  quoted: number;
  median_hours: number | null;
  p90_hours: number | null;
  within_24h_pct: number | null;
  within_48h_pct: number | null;
  within_sla_pct: number | null;
}

export interface HospitalSla extends SlaStats {
  hospital_id: string;
  hospital_name: string;
  overdue_now: number;
}

export interface QuoteSlaOut {
  meta: AnalyticsMeta;
  sla_hours: number;
  totals: SlaStats;
  overdue_now: number;
  by_hospital: HospitalSla[];
}

// ------------------------------------------------------------------------------------------------- finance
export interface FxInfo {
  currency: string;
  /** decimal string: INR per 1 unit of `currency` */
  rate_inr_per_unit: string;
  as_of: string | null;
  source: string | null;
}

export interface FinanceTotals {
  gmv_minor: number;
  refunds_minor: number;
  net_gmv_minor: number;
  commission_minor: number;
  service_fee_minor: number;
  revenue_minor: number;
  payments: number;
}

export interface FinanceMonth {
  /** YYYY-MM */
  month: string;
  gmv_minor: number;
  refunds_minor: number;
  commission_minor: number;
  service_fee_minor: number;
}

export interface CurrencyRow {
  currency: string;
  payments: number;
  /** in the payment currency */
  amount_minor: number;
  /** INR at the capture-time rate */
  base_amount_minor: number;
  reporting_amount_minor: number;
}

export interface InstallmentCurrencyRow {
  currency: string;
  count: number;
  overdue_count: number;
  amount_minor: number;
}

export interface OutstandingInstallments {
  count: number;
  overdue_count: number;
  /** reporting currency */
  amount_minor: number;
  /** open instalments due on/after the admission date (must be 0 - CG-18) */
  past_treatment_count: number;
  by_currency: InstallmentCurrencyRow[];
}

export interface FinanceOut {
  meta: AnalyticsMeta;
  reporting_currency: string;
  base_currency: string;
  fx: FxInfo | null;
  totals: FinanceTotals;
  by_month: FinanceMonth[];
  by_currency: CurrencyRow[];
  outstanding_installments: OutstandingInstallments;
}

// ------------------------------------------------------------------------------------------------ patients
export interface BreakdownRow {
  key: string;
  label: string;
  patients: number | null;
  cases: number | null;
  bookings: number | null;
  suppressed: boolean;
}

export interface PatientsOut {
  meta: AnalyticsMeta;
  by_country: BreakdownRow[];
  by_specialty: BreakdownRow[];
  by_procedure: BreakdownRow[];
}

// ----------------------------------------------------------------------------------------------- hospitals
export interface HospitalRow {
  hospital_id: string;
  name: string;
  city: string | null;
  enquiries: number;
  quoted: number;
  bookings: number;
  completed: number;
  conversion_rate: number | null;
  median_first_quote_hours: number | null;
  within_sla_pct: number | null;
  rating_avg: number | null;
  rating_count: number;
  reviews_in_period: number;
  avg_rating_in_period: number | null;
}

export interface HospitalsOut {
  meta: AnalyticsMeta;
  sla_hours: number;
  rows: HospitalRow[];
}

// -------------------------------------------------------------------------------------------------- agents
export interface AgentRow {
  agent_id: string;
  agency_name: string;
  agent_code: string;
  country: string | null;
  leads: number;
  patients: number;
  cases: number;
  bookings: number;
  completed: number;
  conversion_rate: number | null;
  /** net agent commission (INR); null unless commission_visible */
  commission_minor: number | null;
}

export interface AgentsOut {
  meta: AnalyticsMeta;
  commission_visible: boolean;
  currency: string;
  rows: AgentRow[];
}

// ----------------------------------------------------------------------------------------------- aftercare
export interface FlagCount {
  flag: string;
  count: number | null;
  suppressed: boolean;
}

export interface AftercarePoint {
  bucket: string;
  due: number;
  submitted: number;
  red_flags: number;
}

export interface AftercareOut {
  meta: AnalyticsMeta;
  due: number;
  submitted: number;
  completion_rate: number | null;
  overdue: number;
  red_flag_checkins: number;
  red_flags_by_kind: FlagCount[];
  series: AftercarePoint[];
}

// --------------------------------------------------------------------------------------------- intro calls
export interface IntroPoint {
  bucket: string;
  requested: number;
  completed: number;
}

export interface IntroCallsOut {
  meta: AnalyticsMeta;
  filters_applied: boolean;
  requested: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  /** completed calls whose person later opened a case */
  converted: number;
  conversion_rate: number | null;
  series: IntroPoint[];
}

// ------------------------------------------------------------------------------------------------ AI usage
export interface AiPurposeRow {
  purpose: string;
  requests: number;
  errors: number;
  refusals: number;
  fallbacks: number;
  avg_latency_ms: number | null;
  input_tokens: number;
  output_tokens: number;
}

export interface AiPoint {
  bucket: string;
  requests: number;
}

export interface AiPeak {
  day: string;
  requests: number;
  pct_of_limit: number | null;
}

export interface AiUsageOut {
  meta: AnalyticsMeta;
  filters_applied: boolean;
  global_daily_limit: number;
  user_daily_limits: Record<string, number>;
  requests: number;
  errors: number;
  guest_scans: number;
  by_purpose: AiPurposeRow[];
  series: AiPoint[];
  peak_day: AiPeak | null;
}

// ------------------------------------------------------------------------------------------- notifications
export interface NotificationKindRow {
  kind: string;
  sent: number;
  read: number;
  emailed: number;
  pushed: number;
  read_rate: number | null;
}

export interface NotificationsOut {
  meta: AnalyticsMeta;
  filters_applied: boolean;
  sent: number;
  read: number;
  emailed: number;
  pushed: number;
  read_rate: number | null;
  by_kind: NotificationKindRow[];
}

// ----------------------------------------------------------------------------------------------- endpoints
export const analyticsApi = {
  overview: (p: AnalyticsParams) => api.get<OverviewOut>('/admin/analytics/overview', p),
  quoteSla: (p: AnalyticsParams) => api.get<QuoteSlaOut>('/admin/analytics/quote-sla', p),
  /** admin | finance | super_admin only (support gets 403) */
  finance: (p: AnalyticsParams & { currency?: string }) => api.get<FinanceOut>('/admin/analytics/finance', p),
  patients: (p: AnalyticsParams) => api.get<PatientsOut>('/admin/analytics/patients', p),
  hospitals: (p: AnalyticsParams) => api.get<HospitalsOut>('/admin/analytics/hospitals', p),
  agents: (p: AnalyticsParams) => api.get<AgentsOut>('/admin/analytics/agents', p),
  aftercare: (p: AnalyticsParams) => api.get<AftercareOut>('/admin/analytics/aftercare', p),
  introCalls: (p: AnalyticsParams) => api.get<IntroCallsOut>('/admin/analytics/intro-calls', p),
  aiUsage: (p: AnalyticsParams) => api.get<AiUsageOut>('/admin/analytics/ai-usage', p),
  notifications: (p: AnalyticsParams) => api.get<NotificationsOut>('/admin/analytics/notifications', p),
};

export const analyticsKeys = {
  all: ['admin', 'analytics'] as const,
};
