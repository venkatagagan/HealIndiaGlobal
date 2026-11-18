import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Inbox,
  Percent,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { api } from '@hig/shared/api';
import { formatDate, formatNumber, formatPercent } from '@hig/shared/lib';
import { useAppTranslation } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatCard,
  Stars,
} from '../../components/ui';
import { countryName } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  bucketLabel,
  ColumnChart,
  DateRangeControls,
  downloadCsv,
  formatHours,
  SeriesTable,
  useDateRange,
  type BreakdownRow,
  type ChartDatum,
  type HospitalPerformanceOut,
  type PerformancePoint,
} from './kit';

type SeriesKey = 'enquiries' | 'quotes_sent' | 'bookings';
const SERIES: readonly SeriesKey[] = ['enquiries', 'quotes_sent', 'bookings'];

function fetchPerformance(params: object) {
  return api.get<HospitalPerformanceOut>('/hospital-portal/performance', params);
}

function isEmpty(d: HospitalPerformanceOut): boolean {
  return (
    d.enquiries === 0 &&
    d.quotes_sent === 0 &&
    d.bookings === 0 &&
    d.completed === 0 &&
    d.by_country.length === 0 &&
    d.series.every((p) => p.enquiries === 0 && p.quotes_sent === 0 && p.bookings === 0)
  );
}

/** ISO-2 key -> localized country name, else the label the API sent ("Unknown", "Other"...). */
function countryLabel(row: BreakdownRow): string {
  return /^[A-Za-z]{2}$/.test(row.key) ? countryName(row.key) : row.label;
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

  const seriesName: Record<SeriesKey, string> = {
    enquiries: t('analytics.series.enquiries'),
    quotes_sent: t('analytics.series.quotesSent'),
    bookings: t('analytics.series.bookings'),
  };

  const charts = useMemo(() => {
    if (!d) return null;
    const g = d.meta.granularity;
    const make = (key: SeriesKey): ChartDatum[] =>
      d.series.map((p: PerformancePoint) => ({
        bucket: p.bucket,
        label: bucketLabel(p.bucket, g, t),
        longLabel: bucketLabel(p.bucket, g, t, true),
        value: p[key],
      }));
    return SERIES.map((key) => ({ key, data: make(key) }));
  }, [d, t]);

  const fmtCount = (n: number | null | undefined, row?: BreakdownRow) => {
    if (n !== null && n !== undefined) return formatNumber(n);
    return row?.suppressed
      ? t('analytics.countries.suppressed', { min: formatNumber(d?.meta.min_cell ?? 5) })
      : t('analytics.countries.notAvailable');
  };

  const onDownload = () => {
    if (!d) return;
    const cell = (n: number | null, row: BreakdownRow) => (n !== null ? n : row.suppressed ? `<${d.meta.min_cell}` : '');
    downloadCsv(`hospital-performance_${d.meta.date_from}_${d.meta.date_to}.csv`, [
      [
        ['metric', 'value'],
        ['date_from', d.meta.date_from],
        ['date_to', d.meta.date_to],
        ['timezone', d.meta.timezone],
        ['enquiries', d.enquiries],
        ['quoted', d.quoted],
        ['quotes_sent', d.quotes_sent],
        ['accepted', d.accepted],
        ['bookings', d.bookings],
        ['completed', d.completed],
        ['conversion_rate', d.conversion_rate],
        ['sla_hours', d.sla_hours],
        ['median_first_quote_hours', d.median_first_quote_hours],
        ['p90_first_quote_hours', d.p90_first_quote_hours],
        ['within_sla_pct', d.within_sla_pct],
        ['overdue_now', d.overdue_now],
        ['platform_median_first_quote_hours', d.platform_median_first_quote_hours],
        ['rating_avg', d.rating_avg],
        ['rating_count', d.rating_count],
        ['reviews_in_period', d.reviews_in_period],
        ['avg_rating_in_period', d.avg_rating_in_period],
      ],
      [['bucket', 'enquiries', 'quotes_sent', 'bookings'], ...d.series.map((p) => [p.bucket, p.enquiries, p.quotes_sent, p.bookings])],
      [
        ['country', 'patients', 'cases', 'bookings'],
        ...d.by_country.map((r) => [r.key, cell(r.patients, r), cell(r.cases, r), cell(r.bookings, r)]),
      ],
    ]);
  };

  const median = d?.median_first_quote_hours ?? null;
  const slaStatus = !d || median === null ? null : median <= d.sla_hours ? 'within' : 'over';

  return (
    <>
      <PageHeader
        title={t('analytics.title')}
        description={t('analytics.description')}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="size-4" aria-hidden />} onClick={onDownload} disabled={!d}>
            {t('analytics.downloadCsv')}
          </Button>
        }
      />

      <Card className="mb-6">
        <CardBody>
          <DateRangeControls range={range} />
          {d && (
            <p className="mt-2 text-sm font-medium text-fg" aria-live="polite">
              {t('analytics.range.period', { from: formatDate(d.meta.date_from), to: formatDate(d.meta.date_to) })}
            </p>
          )}
        </CardBody>
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
            <StatCard label={t('analytics.tiles.enquiries')} value={formatNumber(d.enquiries)} icon={<Inbox aria-hidden />} tone="blue" />
            <StatCard
              label={t('analytics.tiles.quoted')}
              value={formatNumber(d.quoted)}
              icon={<FileText aria-hidden />}
              tone="violet"
              hint={t('analytics.tiles.quotedHint')}
            />
            <StatCard label={t('analytics.tiles.quotesSent')} value={formatNumber(d.quotes_sent)} icon={<Send aria-hidden />} tone="violet" />
            <StatCard label={t('analytics.tiles.accepted')} value={formatNumber(d.accepted)} icon={<ThumbsUp aria-hidden />} tone="amber" />
            <StatCard label={t('analytics.tiles.bookings')} value={formatNumber(d.bookings)} icon={<CalendarCheck aria-hidden />} tone="green" />
            <StatCard label={t('analytics.tiles.completed')} value={formatNumber(d.completed)} icon={<ClipboardCheck aria-hidden />} tone="green" />
            <StatCard
              label={t('analytics.tiles.conversionRate')}
              value={formatPercent(d.conversion_rate)}
              icon={<Percent aria-hidden />}
              tone="neutral"
              hint={t('analytics.tiles.conversionHint')}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title={t('analytics.sla.title')}
                description={t('analytics.sla.description', { hours: formatNumber(d.sla_hours) })}
                actions={
                  slaStatus === 'within' ? (
                    <Badge tone="green">
                      <CheckCircle2 className="me-1 inline size-3.5" aria-hidden />
                      {t('analytics.sla.within')}
                    </Badge>
                  ) : slaStatus === 'over' ? (
                    <Badge tone="red">
                      <AlertTriangle className="me-1 inline size-3.5" aria-hidden />
                      {t('analytics.sla.over')}
                    </Badge>
                  ) : null
                }
              />
              <CardBody>
                {median === null ? (
                  <p className="text-sm text-muted">{t('analytics.sla.noData')}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted">{t('analytics.sla.median')}</p>
                    <p className="text-3xl font-bold tracking-tight text-fg tabular-nums">{formatHours(median, t)}</p>
                    {d.within_sla_pct !== null && (
                      <p className="mt-1 text-sm text-muted">
                        {t('analytics.sla.withinPct', { value: formatPercent(d.within_sla_pct, 0) })}
                      </p>
                    )}
                  </>
                )}
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-muted">{t('analytics.sla.p90')}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-fg tabular-nums">{formatHours(d.p90_first_quote_hours, t)}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-muted">{t('analytics.sla.overdueNow')}</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold text-fg tabular-nums">
                      {d.overdue_now > 0 && <AlertTriangle className="size-4 text-danger-500" aria-hidden />}
                      {formatNumber(d.overdue_now)}
                    </dd>
                    <dd className="text-xs text-muted">{t('analytics.sla.overdueHint')}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-muted">{t('analytics.sla.platformMedian')}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-fg tabular-nums">
                      {formatHours(d.platform_median_first_quote_hours, t)}
                    </dd>
                    <dd className="text-xs text-muted">{t('analytics.sla.platformHint')}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('analytics.rating.title')} />
              <CardBody>
                {d.rating_avg === null ? (
                  <p className="text-sm text-muted">{t('analytics.rating.none')}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-3xl font-bold tracking-tight text-fg tabular-nums">
                      {formatNumber(d.rating_avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                    <Stars value={d.rating_avg} size="md" />
                    <span className="text-sm text-muted">
                      {t('analytics.rating.count', { count: d.rating_count, formatted: formatNumber(d.rating_count) })}
                    </span>
                  </div>
                )}
                <p className="mt-1 text-xs text-muted">{t('analytics.rating.allTime')}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-muted">{t('analytics.rating.inPeriod')}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-fg tabular-nums">{formatNumber(d.reviews_in_period)}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-muted">{t('analytics.rating.avgInPeriod')}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-fg tabular-nums">
                      {formatNumber(d.avg_rating_in_period, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          </div>

          {isEmpty(d) ? (
            <Card className="mt-6">
              <EmptyState
                icon={<BarChart3 className="h-6 w-6" aria-hidden />}
                title={t('analytics.empty.title')}
                description={t('analytics.empty.description')}
              />
            </Card>
          ) : (
            <>
              <Card className="mt-6">
                <CardHeader title={t('analytics.series.title')} description={t('analytics.series.description')} />
                <CardBody>
                  <div className="grid gap-6 lg:grid-cols-3">
                    {charts?.map(({ key, data }) => {
                      const total = data.reduce((sum, p) => sum + p.value, 0);
                      return (
                        <figure key={key} className="min-w-0">
                          <figcaption className="mb-2 flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-fg">{seriesName[key]}</span>
                            <span className="text-sm font-semibold text-fg tabular-nums">{formatNumber(total)}</span>
                          </figcaption>
                          <ColumnChart
                            data={data}
                            name={seriesName[key]}
                            formatValue={(v) => formatNumber(v)}
                            summary={t('analytics.series.chartSummary', {
                              name: seriesName[key],
                              from: formatDate(d.meta.date_from),
                              to: formatDate(d.meta.date_to),
                              total: formatNumber(total),
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
                        columns={SERIES.map((k) => seriesName[k])}
                        rows={d.series.map((p) => ({
                          key: p.bucket,
                          label: bucketLabel(p.bucket, d.meta.granularity, t, true),
                          cells: SERIES.map((k) => formatNumber(p[k])),
                        }))}
                      />
                    </div>
                  </details>
                </CardBody>
              </Card>

              <Card className="mt-6">
                <CardHeader title={t('analytics.countries.title')} description={t('analytics.countries.description')} />
                {d.by_country.length === 0 ? (
                  <EmptyState title={t('analytics.countries.empty')} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t('analytics.countries.title')}</caption>
                      <thead>
                        <tr className="border-b border-border text-xs text-muted">
                          <th scope="col" className="px-5 py-2 text-start font-medium">
                            {t('analytics.countries.country')}
                          </th>
                          <th scope="col" className="px-5 py-2 text-end font-medium">
                            {t('analytics.countries.patients')}
                          </th>
                          <th scope="col" className="px-5 py-2 text-end font-medium">
                            {t('analytics.countries.cases')}
                          </th>
                          <th scope="col" className="px-5 py-2 text-end font-medium">
                            {t('analytics.countries.bookings')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.by_country.map((row) => (
                          <tr key={row.key} className="border-b border-border last:border-0">
                            <th scope="row" className="px-5 py-2.5 text-start font-normal text-fg">
                              {countryLabel(row)}
                            </th>
                            <td className="px-5 py-2.5 text-end tabular-nums text-fg">{fmtCount(row.patients, row)}</td>
                            <td className="px-5 py-2.5 text-end tabular-nums text-fg">{fmtCount(row.cases, row)}</td>
                            <td className="px-5 py-2.5 text-end tabular-nums text-fg">{fmtCount(row.bookings, row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="border-t border-border px-5 py-3 text-xs text-muted">
                  {t('analytics.countries.privacyNote', { min: formatNumber(d.meta.min_cell) })}
                </p>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
