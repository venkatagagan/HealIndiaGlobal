import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, CalendarDays, RefreshCw, Table2 } from 'lucide-react';
import {
  adminApi,
  CASE_STATUS_LABELS,
  type DashboardOverview,
  type DashboardPeriod,
  type UserRole,
} from '@hig/shared/api';
import { Button, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs } from '@hig/shared/ui';
import { ColumnChart, FunnelBars, RankedBars } from '../components/charts';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { AttentionQueue, audiencesFor } from '../components/dashboard/AttentionQueue';
import { Delta, InfoTip, Panel, SectionHeading } from '../components/dashboard/widgets';
import { cn, formatDate, formatDateTime, useDocumentTitle } from '../lib/format';
import { inrCompact, inrCompactMajor, inrFull } from '../lib/inr';
import { opsKeys } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { useFinanceReviewCounts } from '../../finance/api/queries';

const PERIODS: { value: DashboardPeriod; label: string; long: string }[] = [
  { value: '7d', label: '7 days', long: 'last 7 days' },
  { value: '30d', label: '30 days', long: 'last 30 days' },
  { value: '90d', label: '90 days', long: 'last 90 days' },
  { value: 'mtd', label: 'This month', long: 'this month' },
];

type KpiKey = keyof DashboardOverview['kpis'];

const KPI_DEFS: Record<KpiKey, { label: string; help: string; money?: boolean; rate?: boolean; to?: string }> = {
  new_cases: {
    label: 'Enquiries',
    help: 'New enquiries: cases opened by patients, agents or staff in the selected period.',
    to: opsPaths.cases,
  },
  quotes_sent: {
    label: 'Quotes sent',
    help: 'Quotes hospitals sent to patients (drafts excluded) in the selected period.',
    to: `${opsPaths.cases}?status=quoted`,
  },
  bookings: {
    label: 'Bookings',
    help: 'Bookings confirmed: bookings whose deposit or full payment was received in the selected period.',
    to: opsPaths.bookings,
  },
  conversion_rate: {
    label: 'Conversion',
    help: 'Enquiry to booking: share of the cases opened in this period that have reached "Booked" (or beyond) so far. Recent cases may still convert.',
    rate: true,
  },
  gmv_minor: {
    label: 'GMV',
    help: 'Gross merchandise value: patient payments captured in the period, converted to INR at the payment-day rate.',
    money: true,
  },
  revenue_minor: {
    label: 'Revenue',
    help: 'Platform revenue: commission and service-fee revenue recognised in the ledger in the period, net of reversals.',
    money: true,
  },
};

function kpiOrder(role: UserRole | null | undefined): KpiKey[] {
  if (role === 'finance') return ['gmv_minor', 'revenue_minor', 'bookings', 'conversion_rate', 'new_cases', 'quotes_sent'];
  return ['new_cases', 'quotes_sent', 'bookings', 'conversion_rate', 'gmv_minor', 'revenue_minor'];
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const perms = useOpsPermissions();
  const role = perms.role;
  const [params, setParams] = useSearchParams();
  const raw = params.get('period');
  const period: DashboardPeriod = PERIODS.some((p) => p.value === raw) ? (raw as DashboardPeriod) : '30d';
  const periodDef = PERIODS.find((p) => p.value === period)!;

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
        title={firstName ? `${greeting()}, ${firstName}` : 'Dashboard'}
        description="Start with the queues that need action, then check how the platform is trending."
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
            title={q.dataUpdatedAt ? `Updated ${formatDateTime(new Date(q.dataUpdatedAt))}` : undefined}
          >
            Refresh
          </Button>
        }
      />

      {/* 1 - work queue ------------------------------------------------------------------------------- */}
      <section aria-labelledby="dash-attention">
        <SectionHeading
          id="dash-attention"
          title="Needs your attention"
          description="Each card opens the matching list, already filtered and sorted oldest first."
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
          title="Performance"
          description={
            d ? (
              <>
                {formatDate(d.date_from)} – {formatDate(d.date_to)} compared with {formatDate(d.previous_from)} –{' '}
                {formatDate(d.previous_to)}
              </>
            ) : (
              'Loading…'
            )
          }
          actions={
            <Tabs
              variant="pills"
              aria-label="Period"
              idPrefix="dash-period"
              value={period}
              onChange={setPeriod}
              tabs={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            />
          }
        />
        <KpiRow overview={d} role={role} periodLabel={periodDef.long} />

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <TrendPanel overview={d} loading={q.isLoading} className="xl:col-span-2" />
          <Panel
            title="Case funnel"
            description={`Cases opened in the ${periodDef.long}, by the furthest stage reached`}
            footer={
              d && d.funnel[0]?.count ? (
                <span className="text-muted">
                  Enquiry → booked:{' '}
                  <strong className="text-fg">{Math.round(d.kpis.conversion_rate.current * 100)}%</strong>
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
          <Panel title="Cases by specialty" description={`Cases opened in the ${periodDef.long}`}>
            {d ? (
              <RankedBars
                rows={d.by_specialty.map((s) => ({ key: s.slug, label: s.name, value: s.cases }))}
                formatValue={(v) => v.toLocaleString('en-IN')}
              />
            ) : (
              <Skeleton lines={5} />
            )}
          </Panel>
          <Panel title="Top hospitals" description={`By GMV captured in the ${periodDef.long}`}>
            {d ? (
              <RankedBars
                rows={d.top_hospitals.map((h) => ({
                  key: h.id,
                  label: h.name,
                  sub: `${h.bookings} booking${h.bookings === 1 ? '' : 's'}`,
                  value: h.gmv_minor,
                  title: `${h.name}: ${inrFull(h.gmv_minor)} from ${h.bookings} bookings`,
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
      <section aria-label="Activity and platform snapshot" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Recent activity"
          description="Latest actions across cases, quotes, bookings and partners"
          className="xl:col-span-2"
          actions={
            perms.viewAudit ? (
              <Link to={opsPaths.audit} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
                Audit log <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : undefined
          }
        >
          <ActivityFeed limit={8} />
        </Panel>
        <Panel title="Platform snapshot" description="Right now, all time">
          {snapshot.data ? (
            <dl className="divide-y divide-border text-sm">
              {[
                ...(showFinance
                  ? [
                      { label: 'Patient money in escrow', value: inrCompact(snapshot.data.escrow_minor), title: inrFull(snapshot.data.escrow_minor), to: '/finance/ledger' },
                      {
                        label: 'Pending settlements',
                        value: inrCompact(snapshot.data.pending_settlements_minor),
                        title: inrFull(snapshot.data.pending_settlements_minor),
                        to: '/finance/settlements',
                      },
                    ]
                  : []),
                { label: 'Active hospitals', value: snapshot.data.hospitals.active.toLocaleString('en-IN'), to: `${opsPaths.hospitals}?status=active` },
                { label: 'Active agents', value: snapshot.data.agents.active.toLocaleString('en-IN'), to: `${opsPaths.agents}?status=active` },
                {
                  label: 'Open cases',
                  value: (['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment'] as const)
                    .reduce((n, s) => n + (snapshot.data.cases_by_status[s] ?? 0), 0)
                    .toLocaleString('en-IN'),
                  to: `${opsPaths.cases}?status=enquiry,quoted,accepted,booked,in_treatment`,
                },
                {
                  label: 'Registered patients',
                  value: (snapshot.data.users_by_role.patient ?? 0).toLocaleString('en-IN'),
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
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {kpiOrder(role).map((key) => {
        const def = KPI_DEFS[key];
        const pair = overview?.kpis[key];
        const value = !pair
          ? null
          : def.rate
            ? `${(pair.current * 100).toFixed(pair.current > 0 && pair.current < 0.1 ? 1 : 0)}%`
            : def.money
              ? inrCompact(pair.current)
              : pair.current.toLocaleString('en-IN');
        const title = pair && def.money ? inrFull(pair.current) : undefined;
        const prevText = !pair
          ? ''
          : def.rate
            ? `${(pair.previous * 100).toFixed(0)}%`
            : def.money
              ? inrCompact(pair.previous)
              : pair.previous.toLocaleString('en-IN');
        return (
          <div key={key} className="relative flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-muted">{def.label}</p>
              <InfoTip text={def.help} label={`About ${def.label}`} />
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
                <div className="mt-2" title={`Previous period: ${prevText}`}>
                  <Delta current={pair.current} previous={pair.previous} kind={def.rate ? 'points' : 'ratio'} suffix="vs prev." />
                </div>
              </>
            ) : (
              <>
                <Skeleton className="mt-2 h-7 w-24" />
                <Skeleton className="mt-2 h-5 w-20" />
              </>
            )}
            <span className="sr-only">for the {periodLabel}</span>
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
const TREND: Record<TrendMetric, { label: string; key: 'gmv_minor' | 'bookings' | 'new_cases'; money: boolean }> = {
  gmv: { label: 'GMV', key: 'gmv_minor', money: true },
  bookings: { label: 'Bookings', key: 'bookings', money: false },
  new_cases: { label: 'Enquiries', key: 'new_cases', money: false },
};

function TrendPanel({ overview, loading, className }: { overview: DashboardOverview | undefined; loading: boolean; className?: string }) {
  const [metric, setMetric] = useState<TrendMetric>('gmv');
  const [asTable, setAsTable] = useState(false);
  const def = TREND[metric];
  const weekly = overview?.bucket === 'week';
  const rows = (overview?.series ?? []).map((p) => ({
    date: p.date,
    value: def.money ? p[def.key] / 100 : p[def.key],
  }));
  const total = (overview?.series ?? []).reduce((n, p) => n + p[def.key], 0);
  const fmtValue = (v: number) => (def.money ? inrCompactMajor(v) : v.toLocaleString('en-IN'));
  const fmtFull = (v: number) => (def.money ? inrFull(Math.round(v * 100)) : v.toLocaleString('en-IN'));
  const fmtLabel = (iso: string) => (weekly ? `Week of ${formatDate(iso, 'd MMM yyyy')}` : formatDate(iso, 'EEE, d MMM yyyy'));

  return (
    <Panel
      className={className}
      title={
        <span className="flex items-baseline gap-2">
          {def.label} {weekly ? 'per week' : 'per day'}
          {overview && (
            <span className="text-xs font-normal text-muted">
              Total {def.money ? inrCompact(total) : total.toLocaleString('en-IN')}
            </span>
          )}
        </span>
      }
      actions={
        <>
          <Tabs
            variant="pills"
            aria-label="Metric"
            idPrefix="dash-trend"
            value={metric}
            onChange={setMetric}
            tabs={(Object.keys(TREND) as TrendMetric[]).map((k) => ({ value: k, label: TREND[k].label }))}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={asTable}
            aria-label={asTable ? 'Show chart' : 'Show as table'}
            title={asTable ? 'Show chart' : 'Show as table'}
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
          <p className="text-sm font-medium text-fg">No {def.label.toLowerCase()} in this period</p>
          <p className="text-xs text-muted">Pick a longer period above to see the trend.</p>
        </div>
      ) : asTable ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{def.label} by {weekly ? 'week' : 'day'}</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  {weekly ? 'Week of' : 'Day'}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {def.label}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="py-1.5 pr-4 text-fg">{formatDate(r.date, weekly ? 'd MMM yyyy' : 'EEE, d MMM')}</td>
                  <td className="py-1.5 text-right tabular-nums text-fg">{fmtFull(r.value)}</td>
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
          name={def.label}
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
  const rows = overview?.upcoming_admissions ?? [];
  const today = overview?.date_to;
  return (
    <Panel
      className={className}
      title="Admissions this week"
      description="Patients due at a hospital in the next 7 days"
      bodyClassName="px-0 py-0 sm:px-0"
      footer={
        <Link to={`${opsPaths.bookings}?status=confirmed`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          All bookings <ArrowRight className="size-3.5" aria-hidden />
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
          <p className="text-sm font-medium text-fg">No admissions in the next 7 days</p>
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
                    <span className="block truncate text-sm font-medium text-fg">{a.patient_name || 'Patient'}</span>
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
