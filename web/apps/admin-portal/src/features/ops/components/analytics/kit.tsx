/**
 * Building blocks of the Analytics page: URL filters, section shell (own loading / error / empty state), KPI
 * tiles, tables with "Download CSV" (exactly the rows and columns shown, UTF-8 with BOM, small cells as "<5"),
 * chart panels with a "Show as table" fallback, and the funnel.
 */
import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { BarChart3, Download, Table2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import type { TFunction } from 'i18next';
import { Button, DEFAULT_DATE_PRESETS, EmptyState, ErrorState, Skeleton, exportCsv, type DatePreset } from '@hig/shared/ui';
import { i18n } from '@hig/shared/lib';
import { useAppTranslation } from '../../../../i18n';
import { InfoTip, Panel, SectionHeading } from '../dashboard/widgets';
import { cn, currencyExponent, formatDate, formatMonth, formatNumber, fromMinor } from '../../lib/format';
import { useListParams } from '../../lib/useListParams';
import { analyticsKeys, type AnalyticsMeta, type AnalyticsParams, type Channel, type Granularity } from '../../lib/analyticsApi';

// ---------------------------------------------------------------------------------------------------------
// URL filters
// ---------------------------------------------------------------------------------------------------------
export const ANALYTICS_URL_KEYS = ['from', 'to', 'granularity', 'country', 'specialty', 'hospital', 'agent', 'channel', 'currency'] as const;
export const GRANULARITIES = ['day', 'week', 'month'] as const satisfies readonly Granularity[];
export const CHANNELS = ['direct', 'agent'] as const satisfies readonly Channel[];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** 7 / 30 / 90 days and 12 months (labels are getters: they follow the UI language). */
export const ANALYTICS_PRESETS: readonly DatePreset[] = [
  ...DEFAULT_DATE_PRESETS.filter((p) => p.id === '7d' || p.id === '30d' || p.id === '90d'),
  {
    id: '12m',
    get label() {
      return i18n.t('admin:analytics.filters.last12Months');
    },
    range: () => ({ from: iso(addDays(new Date(), -364)), to: iso(new Date()) }),
  },
];

export function useAnalyticsFilters() {
  const { values, set } = useListParams(ANALYTICS_URL_KEYS);
  const country = values.country.toUpperCase();
  const params: AnalyticsParams = {
    from: ISO_DAY.test(values.from) ? values.from : undefined,
    to: ISO_DAY.test(values.to) ? values.to : undefined,
    granularity: (GRANULARITIES as readonly string[]).includes(values.granularity) ? (values.granularity as Granularity) : undefined,
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
    specialty_id: UUID.test(values.specialty) ? values.specialty : undefined,
    hospital_id: UUID.test(values.hospital) ? values.hospital : undefined,
    agent_id: UUID.test(values.agent) ? values.agent : undefined,
    channel: (CHANNELS as readonly string[]).includes(values.channel) ? (values.channel as Channel) : undefined,
  };
  const hasDimensionFilter = Boolean(params.country || params.specialty_id || params.hospital_id || params.agent_id || params.channel);
  return { values, set, params, hasDimensionFilter };
}

/** One react-query per section; the key carries the section name and every filter. */
export function useAnalyticsQuery<P extends object, T>(section: string, params: P, fetcher: (p: P) => Promise<T>, enabled = true) {
  return useQuery({
    queryKey: [...analyticsKeys.all, section, params],
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------------------
/** 0.123 -> "12.3%" (fractions; event-count rates may exceed 100%) */
export function pct(value: number | null | undefined, na: string): string {
  if (value === null || value === undefined) return na;
  return formatNumber(value, { style: 'percent', maximumFractionDigits: 1 });
}

export function pctCsv(value: number | null | undefined, na: string): string {
  if (value === null || value === undefined) return na;
  return `${Number((value * 100).toFixed(1))}%`;
}

export function hoursText(value: number | null | undefined, t: TFunction, na: string): string {
  if (value === null || value === undefined) return na;
  return t('analytics.hours', { value: formatNumber(value, { maximumFractionDigits: 1 }) });
}

/** minor units -> exact major amount for CSV ("1234.50") */
export function moneyCsv(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '';
  return fromMinor(minor, currency).toFixed(currencyExponent(currency));
}

/** Bucket label for axes / tables by granularity. */
export function bucketLabel(bucket: string, granularity: Granularity, t: TFunction, long = false): string {
  if (granularity === 'month') return formatMonth(bucket.slice(0, 7), long ? 'MMMM yyyy' : 'MMM yyyy');
  if (granularity === 'week') return long ? t('analytics.weekOf', { date: formatDate(bucket, 'd MMM yyyy') }) : formatDate(bucket, 'd MMM');
  return long ? formatDate(bucket, 'EEE, d MMM yyyy') : formatDate(bucket, 'd MMM');
}

export function bucketHeader(granularity: Granularity, t: TFunction): string {
  return t(`analytics.bucket.${granularity}`);
}

export function csvFilename(section: string, meta: AnalyticsMeta): string {
  return `analytics-${section}-${meta.date_from}-${meta.date_to}`;
}

/** Count that may be null: "<5" (suppressed small cell) or "n/a" (not available with the filters). */
export function CountCell({ value, suppressed, meta }: { value: number | null; suppressed?: boolean; meta: AnalyticsMeta }) {
  const { t } = useAppTranslation();
  if (value !== null) return <span className="tabular-nums">{formatNumber(value)}</span>;
  if (suppressed) {
    return (
      <span className="text-muted" title={t('analytics.suppressedNote', { min: meta.min_cell })}>
        {`<${formatNumber(meta.min_cell)}`}
      </span>
    );
  }
  return (
    <span className="text-muted" title={t('analytics.naHint')}>
      {t('analytics.na')}
    </span>
  );
}

export function countCsv(value: number | null, suppressed: boolean | undefined, meta: AnalyticsMeta, t: TFunction): string | number {
  if (value !== null) return value;
  return suppressed ? `<${meta.min_cell}` : t('analytics.na');
}

// ---------------------------------------------------------------------------------------------------------
// Section shell
// ---------------------------------------------------------------------------------------------------------
export function AnalyticsSection<T>({
  id,
  title,
  description,
  query,
  isEmpty,
  emptyText,
  actions,
  note,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  emptyText?: ReactNode;
  actions?: ReactNode;
  /** small line under the heading (e.g. "only the dates apply here") */
  note?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { t } = useAppTranslation();
  const data = query.data;
  return (
    <section aria-labelledby={id} className={cn(query.isFetching && data && 'opacity-70 transition-opacity')} aria-busy={query.isFetching || undefined}>
      <SectionHeading id={id} title={title} description={description} actions={actions} />
      {data && note?.(data) ? <p className="-mt-1 mb-3 text-xs text-muted">{note(data)}</p> : null}
      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={t('analytics.loading')}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : query.error && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
      ) : !data ? null : isEmpty?.(data) ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState compact icon={<BarChart3 className="size-6" aria-hidden />} title={emptyText ?? t('analytics.noData')} description={t('analytics.noDataHint')} />
        </div>
      ) : (
        children(data)
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------------------------------------
export function Tile({
  label,
  value,
  sub,
  help,
  title,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  help?: string;
  title?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const { t } = useAppTranslation();
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-xl border bg-surface p-4 shadow-card',
        tone === 'default' && 'border-border',
        tone === 'warning' && 'border-warning/50 bg-warning-soft',
        tone === 'danger' && 'border-danger/50 bg-danger-soft',
        tone === 'success' && 'border-success/40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className={cn('truncate text-sm font-medium', tone === 'danger' ? 'text-danger-ink' : tone === 'warning' ? 'text-warning-ink' : 'text-muted')}>{label}</p>
        {help && <InfoTip text={help} label={t('analytics.about', { label })} />}
      </div>
      <p
        className={cn('mt-2 text-2xl font-semibold tracking-tight tabular-nums', tone === 'danger' ? 'text-danger-ink' : 'text-fg')}
        title={title}
      >
        {value}
      </p>
      {sub && <div className={cn('mt-1 text-xs', tone === 'danger' ? 'text-danger-ink' : 'text-muted')}>{sub}</div>}
    </div>
  );
}

export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------------------------------------
// Tables + CSV
// ---------------------------------------------------------------------------------------------------------
export interface ACol<R> {
  key: string;
  header: string;
  /** CSV header when it differs (e.g. adds the currency code) */
  csvHeader?: string;
  align?: 'start' | 'end';
  cell: (row: R) => ReactNode;
  csv: (row: R) => string | number | null | undefined;
}

export function CsvButton<R>({
  columns,
  rows,
  filename,
}: {
  columns: readonly ACol<R>[];
  rows: readonly R[];
  filename: string;
}) {
  const { t } = useAppTranslation();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={rows.length === 0}
      leftIcon={<Download className="size-3.5" aria-hidden />}
      onClick={() =>
        exportCsv(
          rows,
          columns.map((c) => ({ key: c.key, title: c.csvHeader ?? c.header, exportValue: c.csv })),
          filename,
        )
      }
    >
      {t('analytics.downloadCsv')}
    </Button>
  );
}

export function AnalyticsTable<R>({
  caption,
  columns,
  rows,
  rowKey,
  maxHeight,
  emptyText,
}: {
  caption: string;
  columns: readonly ACol<R>[];
  rows: readonly R[];
  rowKey: (row: R, index: number) => string;
  maxHeight?: number;
  emptyText?: string;
}) {
  const { t } = useAppTranslation();
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{emptyText ?? t('analytics.noRows')}</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b border-border text-xs text-muted">
            {columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-3 py-2 font-medium',
                  c.align === 'end' ? 'text-end' : 'text-start',
                  i === 0 && 'ps-4 sm:ps-5',
                  i === columns.length - 1 && 'pe-4 sm:pe-5',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, ri) => (
            <tr key={rowKey(r, ri)} className="hover:bg-surface-2/50">
              {columns.map((c, i) => {
                const Cell = i === 0 ? 'th' : 'td';
                return (
                  <Cell
                    key={c.key}
                    scope={i === 0 ? 'row' : undefined}
                    className={cn(
                      'px-3 py-2 align-top font-normal text-fg',
                      c.align === 'end' ? 'text-end tabular-nums' : 'text-start',
                      i === 0 && 'ps-4 sm:ps-5',
                      i === columns.length - 1 && 'pe-4 sm:pe-5',
                    )}
                  >
                    {c.cell(r)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Panel holding one table with its "Download CSV" button. */
export function TablePanel<R>({
  title,
  description,
  columns,
  rows,
  rowKey,
  filename,
  footnote,
  maxHeight = 420,
  className,
  emptyText,
}: {
  title: string;
  description?: ReactNode;
  columns: readonly ACol<R>[];
  rows: readonly R[];
  rowKey: (row: R, index: number) => string;
  filename: string;
  footnote?: ReactNode;
  maxHeight?: number;
  className?: string;
  emptyText?: string;
}) {
  return (
    <Panel
      title={title}
      description={description}
      className={className}
      actions={<CsvButton columns={columns} rows={rows} filename={filename} />}
      footer={footnote ? <span className="text-xs text-muted">{footnote}</span> : undefined}
    >
      <AnalyticsTable caption={title} columns={columns} rows={rows} rowKey={rowKey} maxHeight={maxHeight} emptyText={emptyText} />
    </Panel>
  );
}

/**
 * Panel with a chart (figure + aria-label + figcaption) and a "Show as table" toggle. The table view is the same
 * data as an AnalyticsTable, and "Download CSV" exports it in either view.
 */
export function ChartPanel<R>({
  title,
  description,
  summary,
  chart,
  columns,
  rows,
  rowKey,
  filename,
  controls,
  className,
  empty,
}: {
  title: string;
  description?: ReactNode;
  /** one-sentence text alternative of the chart (figcaption + aria-label) */
  summary: string;
  chart: ReactNode;
  columns: readonly ACol<R>[];
  rows: readonly R[];
  rowKey: (row: R, index: number) => string;
  filename: string;
  controls?: ReactNode;
  className?: string;
  /** shown instead of the chart when there is nothing to plot */
  empty?: boolean;
}) {
  const { t } = useAppTranslation();
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      title={title}
      description={description}
      className={className}
      actions={
        <>
          {controls}
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={asTable}
            leftIcon={asTable ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? t('analytics.showChart') : t('analytics.showTable')}
          </Button>
          <CsvButton columns={columns} rows={rows} filename={filename} />
        </>
      }
    >
      {empty ? (
        <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
          <BarChart3 className="size-8 text-muted" aria-hidden />
          <p className="text-sm font-medium text-fg">{t('analytics.noData')}</p>
        </div>
      ) : asTable ? (
        <AnalyticsTable caption={title} columns={columns} rows={rows} rowKey={rowKey} maxHeight={320} />
      ) : (
        <figure role="group" aria-label={summary} className="m-0">
          <div aria-hidden>{chart}</div>
          <figcaption className="mt-2 text-xs text-muted">{summary}</figcaption>
        </figure>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Funnel (null counts = "n/a"; rates come from the API and may exceed 100%)
// ---------------------------------------------------------------------------------------------------------
export interface FunnelStage {
  key: string;
  label: string;
  count: number | null;
  rateFromPrevious: number | null;
}

export function AnalyticsFunnel({ stages }: { stages: readonly FunnelStage[] }) {
  const { t } = useAppTranslation();
  const na = t('analytics.na');
  const max = Math.max(1, ...stages.map((s) => s.count ?? 0));
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => {
        const share = s.count === null ? 0 : Math.min(100, (s.count / max) * 100);
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-fg">{s.label}</span>
              <span className="flex items-baseline gap-2">
                {i > 0 && s.rateFromPrevious !== null && (
                  <span className="text-xs text-muted" title={t('analytics.funnel.stepRate', { value: pct(s.rateFromPrevious, na) })}>
                    {pct(s.rateFromPrevious, na)}
                  </span>
                )}
                <span className="min-w-8 text-end font-semibold tabular-nums text-fg">
                  {s.count === null ? (
                    <span className="font-normal text-muted" title={t('analytics.naHint')}>
                      {na}
                    </span>
                  ) : (
                    formatNumber(s.count)
                  )}
                </span>
              </span>
            </div>
            <div className={cn('h-2 rounded-full', s.count === null ? 'border border-dashed border-border' : 'bg-surface-2')}>
              {s.count !== null && <div className="h-2 rounded-full bg-[#16A34A]" style={{ width: `${Math.max(share, s.count > 0 ? 2 : 0)}%` }} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
