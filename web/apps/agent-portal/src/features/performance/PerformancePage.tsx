import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Briefcase,
  CalendarCheck,
  ClipboardCheck,
  Download,
  FileText,
  HandCoins,
  Percent,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@hig/shared/api';
import { useAppTranslation } from '../../i18n';
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { qk } from '../../lib/queries';
import { formatDate, formatMoney, formatNumber, formatPercent, useDocumentTitle } from '../../lib/shared';
import {
  bucketLabel,
  ColumnChart,
  DateRangeControls,
  downloadCsv,
  SeriesTable,
  useDateRange,
  type AgentPerformanceOut,
  type ChartDatum,
} from './kit';

type SeriesKey = 'cases' | 'bookings' | 'commission';

function fetchPerformance(params: object) {
  return api.get<AgentPerformanceOut>('/agent-portal/performance', params);
}

/** Series value per point. `enquiries` on an agent's series point is the number of cases created in the bucket. */
function pointValue(p: AgentPerformanceOut['series'][number], key: SeriesKey): number | null {
  if (key === 'cases') return p.enquiries;
  if (key === 'bookings') return p.bookings;
  return p.commission_minor;
}

function isEmpty(d: AgentPerformanceOut): boolean {
  return (
    d.leads === 0 &&
    d.patients === 0 &&
    d.cases === 0 &&
    d.bookings === 0 &&
    d.completed === 0 &&
    d.commission.earned_minor === 0 &&
    d.commission.pending_minor === 0 &&
    d.commission.paid_minor === 0 &&
    d.series.every((p) => p.enquiries === 0 && p.bookings === 0 && !p.commission_minor)
  );
}

export function PerformancePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('analytics.title'));
  const range = useDateRange('90');
  const query = useQuery({
    queryKey: qk.performance(range.params ?? {}),
    queryFn: () => fetchPerformance(range.params ?? {}),
    enabled: range.params !== null,
    placeholderData: (previous) => previous,
  });
  const d = query.data;
  const currency = d?.commission.currency ?? 'INR';

  const seriesName: Record<SeriesKey, string> = {
    cases: t('analytics.series.cases'),
    bookings: t('analytics.series.bookings'),
    commission: t('analytics.series.commission'),
  };

  const charts = useMemo(() => {
    if (!d) return [];
    const g = d.meta.granularity;
    const hasCommission = d.series.some((p) => p.commission_minor !== null && p.commission_minor !== undefined);
    const keys: SeriesKey[] = hasCommission ? ['cases', 'bookings', 'commission'] : ['cases', 'bookings'];
    return keys.map((key) => ({
      key,
      data: d.series.map<ChartDatum>((p) => ({
        bucket: p.bucket,
        label: bucketLabel(p.bucket, g, t),
        longLabel: bucketLabel(p.bucket, g, t, true),
        value: pointValue(p, key) ?? 0,
      })),
    }));
  }, [d, t]);

  const formatSeries = (key: SeriesKey, v: number | null) =>
    key === 'commission' ? formatMoney(v, currency) : formatNumber(v);

  const onDownload = () => {
    if (!d) return;
    const c = d.commission;
    downloadCsv(`agent-performance_${d.meta.date_from}_${d.meta.date_to}.csv`, [
      [
        ['metric', 'value'],
        ['date_from', d.meta.date_from],
        ['date_to', d.meta.date_to],
        ['timezone', d.meta.timezone],
        ['leads', d.leads],
        ['patients', d.patients],
        ['cases', d.cases],
        ['quoted', d.quoted],
        ['bookings', d.bookings],
        ['completed', d.completed],
        ['conversion_rate', d.conversion_rate],
        ['commission_currency', c.currency],
        ['commission_earned_minor', c.earned_minor],
        ['commission_pending_minor', c.pending_minor],
        ['commission_paid_minor', c.paid_minor],
      ],
      [
        ['bucket', 'cases', 'bookings', 'commission_minor'],
        ...d.series.map((p) => [p.bucket, p.enquiries, p.bookings, p.commission_minor]),
      ],
    ]);
  };

  return (
    <div>
      <PageHeader
        title={t('analytics.title')}
        description={t('analytics.description')}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="size-4" aria-hidden />} onClick={onDownload} disabled={!d}>
            {t('analytics.downloadCsv')}
          </Button>
        }
      />

      <Card className="mb-6 p-5">
        <DateRangeControls range={range} />
        {d && (
          <p className="mt-2 text-sm font-medium text-fg" aria-live="polite">
            {t('analytics.range.period', { from: formatDate(d.meta.date_from), to: formatDate(d.meta.date_to) })}
          </p>
        )}
      </Card>

      {query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : !d ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4" aria-busy>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className={query.isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'} aria-busy={query.isFetching}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            <StatCard label={t('analytics.tiles.leads')} value={formatNumber(d.leads)} icon={<UserPlus aria-hidden />} tone="info" />
            <StatCard label={t('analytics.tiles.patients')} value={formatNumber(d.patients)} icon={<Users aria-hidden />} tone="info" />
            <StatCard label={t('analytics.tiles.cases')} value={formatNumber(d.cases)} icon={<Briefcase aria-hidden />} tone="accent" />
            <StatCard label={t('analytics.tiles.quoted')} value={formatNumber(d.quoted)} icon={<FileText aria-hidden />} tone="accent" />
            <StatCard label={t('analytics.tiles.bookings')} value={formatNumber(d.bookings)} icon={<CalendarCheck aria-hidden />} />
            <StatCard label={t('analytics.tiles.completed')} value={formatNumber(d.completed)} icon={<ClipboardCheck aria-hidden />} />
            <StatCard
              label={t('analytics.tiles.conversionRate')}
              value={formatPercent(d.conversion_rate)}
              icon={<Percent aria-hidden />}
              tone="warning"
              hint={t('analytics.tiles.conversionHint')}
            />
          </div>

          <Card as="section" className="mt-6">
            <CardHeader
              title={t('analytics.commission.title')}
              description={t('analytics.commission.description', { currency })}
              actions={
                <ButtonLink to="/commissions" variant="outline" size="sm">
                  {t('analytics.commission.viewDetails')}
                </ButtonLink>
              }
            />
            <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3 sm:gap-4">
              <StatCard
                label={t('analytics.commission.earned')}
                value={formatMoney(d.commission.earned_minor, currency)}
                icon={<Wallet aria-hidden />}
              />
              <StatCard
                label={t('analytics.commission.pending')}
                value={formatMoney(d.commission.pending_minor, currency)}
                icon={<HandCoins aria-hidden />}
                tone="warning"
              />
              <StatCard
                label={t('analytics.commission.paid')}
                value={formatMoney(d.commission.paid_minor, currency)}
                icon={<Percent aria-hidden />}
                tone="info"
              />
            </div>
          </Card>

          {isEmpty(d) ? (
            <Card className="mt-6">
              <EmptyState
                icon={<BarChart3 className="h-6 w-6" aria-hidden />}
                title={t('analytics.empty.title')}
                description={t('analytics.empty.description')}
              />
            </Card>
          ) : (
            <Card as="section" className="mt-6">
              <CardHeader title={t('analytics.series.title')} description={t('analytics.series.description')} />
              <div className="p-5">
                <div className={charts.length === 3 ? 'grid gap-6 lg:grid-cols-3' : 'grid gap-6 lg:grid-cols-2'}>
                  {charts.map(({ key, data }) => {
                    const total = data.reduce((sum, p) => sum + p.value, 0);
                    const money = key === 'commission';
                    return (
                      <figure key={key} className="min-w-0">
                        <figcaption className="mb-2 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-fg">{seriesName[key]}</span>
                          <span className="text-sm font-semibold text-fg tabular-nums">{formatSeries(key, total)}</span>
                        </figcaption>
                        <ColumnChart
                          data={data}
                          name={seriesName[key]}
                          integer={!money}
                          formatValue={(v) => formatSeries(key, v)}
                          formatTick={money ? (v) => formatMoney(v, currency, undefined, { compact: true }) : (v) => formatNumber(v)}
                          summary={t('analytics.series.chartSummary', {
                            name: seriesName[key],
                            from: formatDate(d.meta.date_from),
                            to: formatDate(d.meta.date_to),
                            total: formatSeries(key, total),
                          })}
                        />
                      </figure>
                    );
                  })}
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-primary-ink">{t('analytics.series.viewTable')}</summary>
                  <div className="mt-3">
                    <SeriesTable
                      caption={t('analytics.series.title')}
                      columns={charts.map((c) => seriesName[c.key])}
                      rows={d.series.map((p) => ({
                        key: p.bucket,
                        label: bucketLabel(p.bucket, d.meta.granularity, t, true),
                        cells: charts.map((c) => formatSeries(c.key, pointValue(p, c.key))),
                      }))}
                    />
                  </div>
                </details>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
