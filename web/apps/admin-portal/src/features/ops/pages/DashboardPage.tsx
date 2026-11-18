import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, CalendarDays, RefreshCw, Table2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import {
  adminApi,
  CASE_STATUS_LABELS,
  type DashboardOverview,
  type DashboardPeriod,
  type UserRole,
} from '@hig/shared/api';
import { Button, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { ColumnChart, FunnelBars, RankedBars } from '../components/charts';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { AttentionQueue, audiencesFor } from '../components/dashboard/AttentionQueue';
import { Delta, InfoTip, Panel, SectionHeading } from '../components/dashboard/widgets';
import { cn, formatDate, formatDateTime, formatNumber, useDocumentTitle } from '../lib/format';
import { inrCompact, inrCompactMajor, inrFull } from '../lib/inr';
import { opsKeys } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { useFinanceReviewCounts } from '../../finance/api/queries';

/** Labels: `dashboard.periods.<value>.label|long`. */
const PERIODS: readonly DashboardPeriod[] = ['7d', '30d', '90d', 'mtd'];

type KpiKey = keyof DashboardOverview['kpis'];

/** Label and help text: `dashboard.kpi.<key>.label|help`. */
const KPI_DEFS: Record<KpiKey, { money?: boolean; rate?: boolean; to?: string }> = {
  new_cases: { to: opsPaths.cases },
  quotes_sent: { to: `${opsPaths.cases}?status=quoted` },
  bookings: { to: opsPaths.bookings },
  conversion_rate: { rate: true },
  gmv_minor: { money: true },
  revenue_minor: { money: true },
};

/** 0.123 -> "12%" / "12.3%" in the UI language */
function percent(value: number, digits = 0): string {
  return formatNumber(value, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function kpiOrder(role: UserRole | null | undefined): KpiKey[] {
  if (role === 'finance') return ['gmv_minor', 'revenue_minor', 'bookings', 'conversion_rate', 'new_cases', 'quotes_sent'];
  return ['new_cases', 'quotes_sent', 'bookings', 'conversion_rate', 'gmv_minor', 'revenue_minor'];
}

function greeting(name: string, t: TFunction): string {
  const h = new Date().getHours();
  return h < 12
    ? t('dashboard.greeting.morning', { name })
    : h < 17
      ? t('dashboard.greeting.afternoon', { name })
      : t('dashboard.greeting.evening', { name });
}

export default function DashboardPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('dashboard.title'));
  const perms = useOpsPermissions();
  const role = perms.role;
  const [params, setParams] = useSearchParams();
  const raw = params.get('period');
  const period: DashboardPeriod = PERIODS.some((p) => p === raw) ? (raw as DashboardPeriod) : '30d';
  const periodLong = t(`dashboard.periods.${period}.long`);

  const q = useQuery({
    queryKey: [...opsKeys.dashboard, 'overview', period],
    queryFn: () => adminApi.dashboardOverview({ period }),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const showFinance = audiencesFor(role).includes('finance');
  const finance = useFinanceReviewCounts(showFinance);
  const snapshot = useQuery({
    queryKey: opsKeys.dashboard,
    queryFn: () => adminApi.dashboard(),
    refetchInterval: 120_000,
    enabled: !!role,
  });

  const d = q.data;
  const firstName = perms.user?.full_name?.split(' ')[0];
  const setPeriod = (p: DashboardPeriod) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (p === '30d') next.delete('period');
        else next.set('period', p);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        className="mb-0"
        title={firstName ? greeting(firstName, t) : t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void q.refetch();
              void finance.refetch();
              void snapshot.refetch();
            }}
            loading={q.isFetching}
            leftIcon={<RefreshCw className="size-3.5" aria-hidden />}
            title={q.dataUpdatedAt ? t('dashboard.updatedAt', { date: formatDateTime(new Date(q.dataUpdatedAt)) }) : undefined}
          >
            {t('dashboard.refresh')}
          </Button>
        }
      />

      {/* 1 - work queue ------------------------------------------------------------------------------- */}
      <section aria-labelledby="dash-attention">
        <SectionHeading
          id="dash-attention"
          title={t('dashboard.attentionTitle')}
          description={t('dashboard.attentionDescription')}
        />
        {q.error && !d ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <AttentionQueue overview={d} loading={q.isLoading} role={role} finance={finance.data} />
        )}
      </section>

      {/* 2 - performance ------------------------------------------------------------------------------ */}
      <section aria-labelledby="dash-performance" className={cn(q.isFetching && !q.isLoading && 'opacity-70 transition-opacity')}>
        <SectionHeading
          id="dash-performance"
          title={t('dashboard.performance')}
          description={
            d
              ? t('dashboard.range', {
                  from: formatDate(d.date_from),
                  to: formatDate(d.date_to),
                  prevFrom: formatDate(d.previous_from),
                  prevTo: formatDate(d.previous_to),
                })
              : t('dashboard.loading')
          }
          actions={
            <Tabs
              variant="pills"
              aria-label={t('dashboard.periodLabel')}
              idPrefix="dash-period"
              value={period}
              onChange={setPeriod}
              tabs={PERIODS.map((p) => ({ value: p, label: t(`dashboard.periods.${p}.label`) }))}
            />
          }
        />
        <KpiRow overview={d} role={role} periodLabel={periodLong} />

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <TrendPanel overview={d} loading={q.isLoading} className="xl:col-span-2" />
          <Panel
            title={t('dashboard.funnel.title')}
            description={t('dashboard.funnel.description', { period: periodLong })}
            footer={
              d && d.funnel[0]?.count ? (
                <span className="text-muted">
                  <Trans
                    t={t}
                    i18nKey="dashboard.funnel.conversion"
                    values={{ value: percent(d.kpis.conversion_rate.current) }}
                    components={{ 0: <strong className="text-fg" /> }}
                  />
                </span>
              ) : undefined
            }
          >
            {d ? (
              <FunnelBars
                stages={d.funnel.map((f) => ({
                  key: f.stage,
                  label: CASE_STATUS_LABELS[f.stage] ?? f.stage,
                  count: f.count,
                  to: `${opsPaths.cases}?status=${f.stage}&date_field=created&from=${d.date_from}&to=${d.date_to}`,
                }))}
              />
            ) : (
              <Skeleton lines={6} />
            )}
          </Panel>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Panel title={t('dashboard.bySpecialty.title')} description={t('dashboard.bySpecialty.description', { period: periodLong })}>
            {d ? (
              <RankedBars
                rows={d.by_specialty.map((s) => ({ key: s.slug, label: s.name, value: s.cases }))}
                formatValue={(v) => formatNumber(v)}
              />
            ) : (
              <Skeleton lines={5} />
            )}
          </Panel>
          <Panel title={t('dashboard.topHospitals.title')} description={t('dashboard.topHospitals.description', { period: periodLong })}>
            {d ? (
              <RankedBars
                rows={d.top_hospitals.map((h) => ({
                  key: h.id,
                  label: h.name,
                  sub: t('dashboard.topHospitals.bookings', { count: h.bookings, value: formatNumber(h.bookings) }),
                  value: h.gmv_minor,
                  title: t('dashboard.topHospitals.tooltip', {
                    count: h.bookings,
                    name: h.name,
                    amount: inrFull(h.gmv_minor),
                    value: formatNumber(h.bookings),
                  }),
                  to: opsPaths.hospital(h.id),
                }))}
                formatValue={inrCompact}
              />
            ) : (
              <Skeleton lines={5} />
            )}
          </Panel>
          <UpcomingAdmissions overview={d} className="lg:col-span-2 xl:col-span-1" />
        </div>
      </section>

      {/* 3 - activity + snapshot ----------------------------------------------------------------------- */}
      <section aria-label={t('dashboard.activityAria')} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title={t('dashboard.recentActivity.title')}
          description={t('dashboard.recentActivity.description')}
          className="xl:col-span-2"
          actions={
            perms.viewAudit ? (
              <Link to={opsPaths.audit} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
                {t('dashboard.recentActivity.auditLink')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
              </Link>
            ) : undefined
          }
        >
          <ActivityFeed limit={8} />
        </Panel>
        <Panel title={t('dashboard.snapshot.title')} description={t('dashboard.snapshot.description')}>
          {snapshot.data ? (
            <dl className="divide-y divide-border text-sm">
              {[
                ...(showFinance
                  ? [
                      { label: t('dashboard.snapshot.escrow'), value: inrCompact(snapshot.data.escrow_minor), title: inrFull(snapshot.data.escrow_minor), to: '/finance/ledger' },
                      {
                        label: t('dashboard.snapshot.pendingSettlements'),
                        value: inrCompact(snapshot.data.pending_settlements_minor),
                        title: inrFull(snapshot.data.pending_settlements_minor),
                        to: '/finance/settlements',
                      },
                    ]
                  : []),
                { label: t('dashboard.snapshot.activeHospitals'), value: formatNumber(snapshot.data.hospitals.active), to: `${opsPaths.hospitals}?status=active` },
                { label: t('dashboard.snapshot.activeAgents'), value: formatNumber(snapshot.data.agents.active), to: `${opsPaths.agents}?status=active` },
                {
                  label: t('dashboard.snapshot.openCases'),
                  value: formatNumber(
                    (['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment'] as const).reduce(
                      (n, s) => n + (snapshot.data.cases_by_status[s] ?? 0),
                      0,
                    ),
                  ),
                  to: `${opsPaths.cases}?status=enquiry,quoted,accepted,booked,in_treatment`,
                },
                {
                  label: t('dashboard.snapshot.patients'),
                  value: formatNumber(snapshot.data.users_by_role.patient ?? 0),
                  to: `${opsPaths.users}?role=patient`,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-muted">{row.label}</dt>
                  <dd title={'title' in row ? row.title : undefined}>
                    <Link to={row.to} className="font-semibold tabular-nums text-fg hover:underline">
                      {row.value}
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Skeleton lines={5} />
          )}
        </Panel>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------------------------------------
function KpiRow({
  overview,
  role,
  periodLabel,
}: {
  overview: DashboardOverview | undefined;
  role: UserRole | null | undefined;
  periodLabel: string;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {kpiOrder(role).map((key) => {
        const def = KPI_DEFS[key];
        const label = t(`dashboard.kpi.${key}.label`);
        const pair = overview?.kpis[key];
        const value = !pair
          ? null
          : def.rate
            ? percent(pair.current, pair.current > 0 && pair.current < 0.1 ? 1 : 0)
            : def.money
              ? inrCompact(pair.current)
              : formatNumber(pair.current);
        const title = pair && def.money ? inrFull(pair.current) : undefined;
        const prevText = !pair
          ? ''
          : def.rate
            ? percent(pair.previous)
            : def.money
              ? inrCompact(pair.previous)
              : formatNumber(pair.previous);
        return (
          <div key={key} className="relative flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-muted">{label}</p>
              <InfoTip text={t(`dashboard.kpi.${key}.help`)} label={t('dashboard.kpi.about', { label })} />
            </div>
            {pair ? (
              <>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-fg" title={title}>
                  {def.to ? (
                    <Link to={def.to} className="hover:underline">
                      {value}
                    </Link>
                  ) : (
                    value
                  )}
                </p>
                <div className="mt-2" title={t('dashboard.kpi.previous', { value: prevText })}>
                  <Delta
                    current={pair.current}
                    previous={pair.previous}
                    kind={def.rate ? 'points' : 'ratio'}
                    suffix={t('dashboard.kpi.vsPrev')}
                  />
                </div>
              </>
            ) : (
              <>
                <Skeleton className="mt-2 h-7 w-24" />
                <Skeleton className="mt-2 h-5 w-20" />
              </>
            )}
            <span className="sr-only">{t('dashboard.kpi.forPeriod', { period: periodLabel })}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Trend chart (one metric at a time: never two scales on one axis)
// ---------------------------------------------------------------------------------------------------------
type TrendMetric = 'gmv' | 'bookings' | 'new_cases';
/** Labels: `dashboard.trend.metrics.<metric>`. */
const TREND: Record<TrendMetric, { key: 'gmv_minor' | 'bookings' | 'new_cases'; money: boolean }> = {
  gmv: { key: 'gmv_minor', money: true },
  bookings: { key: 'bookings', money: false },
  new_cases: { key: 'new_cases', money: false },
};

function TrendPanel({ overview, loading, className }: { overview: DashboardOverview | undefined; loading: boolean; className?: string }) {
  const { t } = useAppTranslation();
  const [metric, setMetric] = useState<TrendMetric>('gmv');
  const [asTable, setAsTable] = useState(false);
  const def = TREND[metric];
  const metricLabel = t(`dashboard.trend.metrics.${metric}`);
  const weekly = overview?.bucket === 'week';
  const rows = (overview?.series ?? []).map((p) => ({
    date: p.date,
    value: def.money ? p[def.key] / 100 : p[def.key],
  }));
  const total = (overview?.series ?? []).reduce((n, p) => n + p[def.key], 0);
  const fmtValue = (v: number) => (def.money ? inrCompactMajor(v) : formatNumber(v));
  const fmtFull = (v: number) => (def.money ? inrFull(Math.round(v * 100)) : formatNumber(v));
  const fmtLabel = (iso: string) =>
    weekly ? t('dashboard.trend.weekOfDate', { date: formatDate(iso, 'd MMM yyyy') }) : formatDate(iso, 'EEE, d MMM yyyy');

  return (
    <Panel
      className={className}
      title={
        <span className="flex items-baseline gap-2">
          {weekly ? t('dashboard.trend.perWeek', { metric: metricLabel }) : t('dashboard.trend.perDay', { metric: metricLabel })}
          {overview && (
            <span className="text-xs font-normal text-muted">
              {t('dashboard.trend.total', { value: def.money ? inrCompact(total) : formatNumber(total) })}
            </span>
          )}
        </span>
      }
      actions={
        <>
          <Tabs
            variant="pills"
            aria-label={t('dashboard.trend.metricLabel')}
            idPrefix="dash-trend"
            value={metric}
            onChange={setMetric}
            tabs={(Object.keys(TREND) as TrendMetric[]).map((k) => ({ value: k, label: t(`dashboard.trend.metrics.${k}`) }))}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={asTable}
            aria-label={asTable ? t('dashboard.trend.showChart') : t('dashboard.trend.showTable')}
            title={asTable ? t('dashboard.trend.showChart') : t('dashboard.trend.showTable')}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
          </Button>
        </>
      }
    >
      {loading || !overview ? (
        <Skeleton className="h-[260px]" />
      ) : total === 0 ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
          <BarChart3 className="size-8 text-muted" aria-hidden />
          <p className="text-sm font-medium text-fg">{t(`dashboard.trend.empty.${metric}`)}</p>
          <p className="text-xs text-muted">{t('dashboard.trend.emptyHint')}</p>
        </div>
      ) : asTable ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {weekly ? t('dashboard.trend.byWeek', { metric: metricLabel }) : t('dashboard.trend.byDay', { metric: metricLabel })}
            </caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="text-start text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-1.5 pe-4 text-start font-medium">
                  {weekly ? t('dashboard.trend.weekOf') : t('dashboard.trend.day')}
                </th>
                <th scope="col" className="py-1.5 text-end font-medium">
                  {metricLabel}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="py-1.5 pe-4 text-fg">{formatDate(r.date, weekly ? 'd MMM yyyy' : 'EEE, d MMM')}</td>
                  <td className="py-1.5 text-end tabular-nums text-fg">{fmtFull(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ColumnChart
          data={rows}
          xKey="date"
          yKey="value"
          name={metricLabel}
          integer={!def.money}
          formatTick={fmtValue}
          formatValue={fmtFull}
          formatX={(iso) => formatDate(iso, 'd MMM')}
          formatLabel={fmtLabel}
        />
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Upcoming admissions
// ---------------------------------------------------------------------------------------------------------
function UpcomingAdmissions({ overview, className }: { overview: DashboardOverview | undefined; className?: string }) {
  const { t } = useAppTranslation();
  const rows = overview?.upcoming_admissions ?? [];
  const today = overview?.date_to;
  return (
    <Panel
      className={className}
      title={t('dashboard.admissions.title')}
      description={t('dashboard.admissions.description')}
      bodyClassName="px-0 py-0 sm:px-0"
      footer={
        <Link to={`${opsPaths.bookings}?status=confirmed`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          {t('dashboard.admissions.allBookings')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
        </Link>
      }
    >
      {!overview ? (
        <div className="p-4">
          <Skeleton lines={4} />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
          <CalendarDays className="size-7 text-muted" aria-hidden />
          <p className="text-sm font-medium text-fg">{t('dashboard.admissions.empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((a) => {
            const isToday = a.admission_date === today;
            return (
              <li key={a.booking_id}>
                <Link
                  to={opsPaths.case(a.case_id)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none sm:px-5"
                >
                  <span
                    className={cn(
                      'flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 leading-none',
                      isToday ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border text-fg',
                    )}
                  >
                    <span className="text-[10px] font-medium uppercase">{formatDate(a.admission_date, 'EEE')}</span>
                    <span className="mt-0.5 text-base font-semibold">{formatDate(a.admission_date, 'd')}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{a.patient_name || t('dashboard.admissions.patient')}</span>
                    <span className="block truncate text-xs text-muted">
                      {a.hospital_name} · <span className="font-mono">{a.booking_number}</span>
                    </span>
                  </span>
                  <StatusBadge status={a.status} kind="booking" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
