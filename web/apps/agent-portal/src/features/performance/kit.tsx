/**
 * Building blocks of the Performance page: the IST date window (presets + custom), bucket labels, a
 * single-series column chart with a table fallback, and a client-side CSV export.
 *
 * Chart palette (validated with the dataviz checker against #FFFFFF and #161B22, same as the admin portal's ops
 * charts): series 1 green #16A34A in both themes. Every chart here is single-series (small multiples), so only
 * series 1 is used. Grid/axis are recessive hairlines; the y-axis starts at zero; bars are capped at 24px.
 */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { saveBlob } from '@hig/shared/api';
import { formatDate } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { Chip, FormField, Input, Select } from '../../components/ui';

// ------------------------------------------------------------------------------------------------ API shapes
/** Mirrors backend/app/modules/analytics (AnalyticsMeta, PerformancePoint, AgentCommissionSummary, AgentPerformanceOut). */
export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsMeta {
  date_from: string;
  date_to: string;
  granularity: Granularity;
  timezone: string;
  filters: Record<string, string | null>;
  generated_at: string;
  min_cell: number;
}

export interface PerformancePoint {
  bucket: string;
  enquiries: number;
  quotes_sent: number;
  bookings: number;
  commission_minor: number | null;
}

export interface AgentCommissionSummary {
  currency: string;
  earned_minor: number;
  pending_minor: number;
  paid_minor: number;
}

export interface AgentPerformanceOut {
  meta: AnalyticsMeta;
  leads: number;
  patients: number;
  cases: number;
  quoted: number;
  bookings: number;
  completed: number;
  conversion_rate: number | null;
  commission: AgentCommissionSummary;
  series: PerformancePoint[];
}

// ------------------------------------------------------------------------------------------------ IST window
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;
/** Backend limit (analytics/common.py MAX_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 731;

/** Today's calendar date in India Standard Time (UTC+05:30, no DST), "YYYY-MM-DD". */
export function todayIst(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function shiftIsoDate(iso: string, days: number): string {
  return new Date(isoToUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive number of days from `from` to `to`. */
export function spanDays(from: string, to: string): number {
  return Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS) + 1;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PRESETS = ['30', '90', '180', '365'] as const;
export type Preset = (typeof PRESETS)[number] | 'custom';
export type GranularityChoice = 'auto' | Granularity;

export interface RangeState {
  preset: Preset;
  from: string;
  to: string;
  granularity: GranularityChoice;
}

export type RangeError = 'order' | 'tooLong' | null;

export function useDateRange(defaultPreset: Exclude<Preset, 'custom'> = '90') {
  const [state, setState] = useState<RangeState>(() => {
    const to = todayIst();
    return { preset: defaultPreset, from: shiftIsoDate(to, -(Number(defaultPreset) - 1)), to, granularity: 'auto' };
  });

  const error: RangeError = useMemo(() => {
    if (state.preset !== 'custom') return null;
    if (!ISO_DATE.test(state.from) || !ISO_DATE.test(state.to)) return null;
    if (state.from > state.to) return 'order';
    if (spanDays(state.from, state.to) > MAX_RANGE_DAYS) return 'tooLong';
    return null;
  }, [state]);

  const complete = ISO_DATE.test(state.from) && ISO_DATE.test(state.to);
  /** Query parameters for the API, or null while the custom range is incomplete / invalid. */
  const params = useMemo(
    () =>
      complete && !error
        ? { from: state.from, to: state.to, granularity: state.granularity === 'auto' ? undefined : state.granularity }
        : null,
    [complete, error, state],
  );

  const setPreset = (preset: Preset) =>
    setState((s) => {
      if (preset === 'custom') return { ...s, preset };
      const to = todayIst();
      return { ...s, preset, from: shiftIsoDate(to, -(Number(preset) - 1)), to };
    });

  return {
    state,
    error,
    params,
    setPreset,
    setFrom: (from: string) => setState((s) => ({ ...s, preset: 'custom', from })),
    setTo: (to: string) => setState((s) => ({ ...s, preset: 'custom', to })),
    setGranularity: (granularity: GranularityChoice) => setState((s) => ({ ...s, granularity })),
  };
}

export function DateRangeControls({ range }: { range: ReturnType<typeof useDateRange> }) {
  const { t } = useAppTranslation();
  const { state, error } = range;
  const presetLabel: Record<Preset, string> = {
    '30': t('analytics.range.last30'),
    '90': t('analytics.range.last90'),
    '180': t('analytics.range.last180'),
    '365': t('analytics.range.last365'),
    custom: t('analytics.range.custom'),
  };
  const errorText =
    error === 'order' ? t('analytics.range.invalidOrder') : error === 'tooLong' ? t('analytics.range.tooLong') : undefined;
  return (
    <div className="space-y-3">
      <div role="group" aria-label={t('analytics.range.label')} className="flex flex-wrap items-center gap-2">
        {([...PRESETS, 'custom'] as const).map((p) => (
          <Chip key={p} selected={state.preset === p} onClick={() => range.setPreset(p)}>
            {presetLabel[p]}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {state.preset === 'custom' && (
          <>
            <FormField label={t('analytics.range.from')} htmlFor="perf-from" className="w-40">
              <Input
                id="perf-from"
                type="date"
                value={state.from}
                max={state.to || undefined}
                onChange={(e) => range.setFrom(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </FormField>
            <FormField label={t('analytics.range.to')} htmlFor="perf-to" className="w-40">
              <Input
                id="perf-to"
                type="date"
                value={state.to}
                min={state.from || undefined}
                onChange={(e) => range.setTo(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </FormField>
          </>
        )}
        <FormField label={t('analytics.range.groupBy')} htmlFor="perf-granularity" className="w-40">
          <Select
            id="perf-granularity"
            value={state.granularity}
            onChange={(e) => range.setGranularity(e.target.value as GranularityChoice)}
          >
            <option value="auto">{t('analytics.range.auto')}</option>
            <option value="day">{t('analytics.range.day')}</option>
            <option value="week">{t('analytics.range.week')}</option>
            <option value="month">{t('analytics.range.month')}</option>
          </Select>
        </FormField>
      </div>
      {errorText && (
        <p role="alert" className="text-xs text-danger">
          {errorText}
        </p>
      )}
      <p className="text-xs text-muted">{t('analytics.timezoneNote')}</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ labels
type TFn = ReturnType<typeof useAppTranslation>['t'];

/** Short x-axis label (`long` = tooltip / table label) for a bucket start date. */
export function bucketLabel(bucket: string, granularity: Granularity, t: TFn, long = false): string {
  if (granularity === 'month') return formatDate(bucket, long ? 'MMMM yyyy' : 'MMM yy');
  if (!long) return formatDate(bucket, 'd MMM');
  if (granularity === 'week') return t('analytics.series.weekOf', { date: formatDate(bucket, 'd MMM yyyy') });
  return formatDate(bucket, 'd MMM yyyy');
}


// ------------------------------------------------------------------------------------------------ chart
export const chartVars =
  '[--series-1:#16A34A] [--chart-grid:#E2E8F0] dark:[--chart-grid:#2A313C] [--chart-axis:#64748B] dark:[--chart-axis:#94A3B8] ' +
  '[--chart-cursor:#F1F5F9] dark:[--chart-cursor:#1F2630]';

export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const axisTick = { fill: 'var(--chart-axis)', fontSize: 11 } as const;

export interface ChartDatum {
  bucket: string;
  label: string;
  longLabel: string;
  value: number;
}

/**
 * Single-series column chart over time, exposed to assistive tech as one image with a summary label (the
 * numbers themselves are in the table view next to it).
 */
export function ColumnChart({
  data,
  name,
  summary,
  formatValue,
  formatTick = formatValue,
  integer = true,
  height = 200,
}: {
  data: readonly ChartDatum[];
  name: string;
  summary: string;
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  integer?: boolean;
  height?: number;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  let ticks = niceTicks(max || (integer ? 4 : 1));
  if (integer) {
    const step = Math.max(1, Math.ceil(ticks[1] ?? 1));
    ticks = Array.from({ length: Math.max(2, Math.ceil(Math.max(max, 1) / step) + 1) }, (_, i) => i * step);
  }
  const top = ticks[ticks.length - 1] ?? 1;
  const width = Math.max(32, ...ticks.map((v) => formatTick(v).length * 6.5 + 10));
  return (
    <div role="img" aria-label={summary} className={chartVars} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data as ChartDatum[]}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          barCategoryGap="22%"
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--chart-grid)" tick={axisTick} tickLine={false} minTickGap={12} />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            width={width}
            domain={[0, top]}
            ticks={ticks}
            allowDecimals={!integer}
            tickFormatter={(v) => formatTick(Number(v))}
          />
          <Tooltip
            cursor={{ fill: 'var(--chart-cursor)' }}
            content={(props) => {
              const entry = props.payload?.[0] as { value?: unknown; payload?: ChartDatum } | undefined;
              if (!props.active || !entry) return null;
              return (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1 font-medium text-fg">{entry.payload?.longLabel ?? String(props.label ?? '')}</p>
                  <p className="flex items-center gap-2 text-muted">
                    <span className="inline-block size-2 rounded-full bg-[var(--series-1)]" aria-hidden />
                    <span>{name}</span>
                    <span className="ms-auto ps-3 font-semibold tabular-nums text-fg">
                      {formatValue(Number(entry.value ?? 0))}
                    </span>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" name={name} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Table view of the time series (the accessible fallback for the charts). */
export function SeriesTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly { key: string; label: string; cells: readonly string[] }[];
}) {
  const { t } = useAppTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="px-3 py-2 text-start font-medium">
              {t('analytics.series.period')}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 text-end font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <th scope="row" className="px-3 py-2 text-start font-normal text-fg">
                {r.label}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-2 text-end tabular-nums text-fg">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ CSV
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Downloads a UTF-8 CSV (with BOM so spreadsheet apps detect the encoding). */
export function downloadCsv(filename: string, sections: readonly (readonly (string | number | null | undefined)[])[][]): void {
  const lines = sections.map((rows) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
  saveBlob(new Blob(['﻿', lines.join('\r\n\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' }), filename);
}
