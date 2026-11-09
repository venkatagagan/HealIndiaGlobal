import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../lib/format';
import { niceTicks } from '../lib/inr';

/**
 * Chart palette (validated with the dataviz checker against #FFFFFF and #161B22): series 1 green #16A34A in
 * both themes (it stays inside the lightness band on the dark surface), series 2 violet #7C3AED / #8B5CF6.
 * Colors are CSS variables so light/dark switch with the `.dark` class. Grid/axis are recessive hairlines.
 */
export const chartVars =
  '[--series-1:#16A34A] [--series-2:#7C3AED] dark:[--series-2:#8B5CF6] ' +
  '[--chart-grid:#E2E8F0] dark:[--chart-grid:#2A313C] [--chart-axis:#64748B] dark:[--chart-axis:#94A3B8] ' +
  '[--chart-surface:#FFFFFF] dark:[--chart-surface:#161B22] [--chart-cursor:#F1F5F9] dark:[--chart-cursor:#1F2630]';

interface TooltipEntry {
  value?: unknown;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
  name,
  formatValue,
  formatLabel,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
  name: string;
  formatValue: (value: number) => string;
  formatLabel?: (label: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const title = String(label ?? '');
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-fg">{formatLabel ? formatLabel(title) : title}</p>
      <p className="flex items-center gap-2 text-muted">
        <span className="inline-block size-2 rounded-full bg-[var(--series-1)]" aria-hidden />
        <span>{name}</span>
        <span className="ml-auto pl-3 font-semibold tabular-nums text-fg">{formatValue(Number(payload[0]?.value ?? 0))}</span>
      </p>
    </div>
  );
}

const axisTick = { fill: 'var(--chart-axis)', fontSize: 11 } as const;

/**
 * Single-series column chart over time. The y-axis always starts at zero with "nice" ticks (no smoothing,
 * no negative overshoot); bars are capped at 24px with 4px rounded data-ends.
 */
export function ColumnChart({
  data,
  xKey,
  yKey,
  name,
  formatValue,
  formatTick,
  formatX,
  formatLabel,
  integer = false,
  height = 260,
}: {
  data: readonly object[];
  xKey: string;
  yKey: string;
  name: string;
  /** tooltip value */
  formatValue: (value: number) => string;
  /** y-axis tick */
  formatTick: (value: number) => string;
  /** x-axis tick */
  formatX?: (value: string) => string;
  /** tooltip title */
  formatLabel?: (value: string) => string;
  integer?: boolean;
  height?: number;
}) {
  const max = Math.max(0, ...data.map((d) => Number((d as Record<string, unknown>)[yKey] ?? 0)));
  let ticks = niceTicks(max || (integer ? 4 : 1));
  if (integer) {
    const step = Math.max(1, Math.ceil(ticks[1] ?? 1));
    ticks = Array.from({ length: Math.max(2, Math.ceil(Math.max(max, 1) / step) + 1) }, (_, i) => i * step);
  }
  const top = ticks[ticks.length - 1] ?? 1;
  const width = Math.max(36, ...ticks.map((t) => formatTick(t).length * 6.5 + 10));
  return (
    <div className={chartVars} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke="var(--chart-grid)"
            tick={axisTick}
            tickLine={false}
            minTickGap={12}
            tickFormatter={formatX ? (v) => formatX(String(v)) : undefined}
          />
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
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as readonly TooltipEntry[] | undefined}
                label={props.label}
                name={name}
                formatValue={formatValue}
                formatLabel={formatLabel ?? formatX}
              />
            )}
          />
          <Bar dataKey={yKey} name={name} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ranked horizontal bars in plain HTML (labels stay readable at any width; the value is printed at the bar
 * end in text ink, never in the series color). Single series -> one hue for every bar.
 */
export function RankedBars({
  rows,
  formatValue,
  empty,
}: {
  rows: readonly { key: string; label: ReactNode; sub?: ReactNode; value: number; title?: string; to?: string }[];
  formatValue: (value: number) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <>{empty ?? <p className="py-6 text-center text-sm text-muted">No data for this period</p>}</>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3">
      {rows.map((r) => {
        const body = (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-fg">{r.label}</span>
                {r.sub && <span className="shrink-0 text-xs text-muted">{r.sub}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-fg">{formatValue(r.value)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2">
              <div
                className="h-1.5 rounded-full bg-[#16A34A]"
                style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={r.key} title={r.title}>
            {r.to ? (
              <Link
                to={r.to}
                className="-mx-2 block rounded-lg px-2 py-1 hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Funnel as horizontal bars (ordered stages, one hue): bar length = share of the first stage, with the
 * step conversion from the previous stage beside each label.
 */
export function FunnelBars({
  stages,
  className,
}: {
  stages: readonly { key: string; label: string; count: number; to?: string }[];
  className?: string;
}) {
  const first = stages[0]?.count ?? 0;
  if (!first) return <p className="py-6 text-center text-sm text-muted">No enquiries in this period</p>;
  return (
    <ol className={cn('space-y-2.5', className)}>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.count : null;
        const step = prev ? Math.round((s.count / prev) * 100) : null;
        const share = (s.count / first) * 100;
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-fg">{s.label}</span>
              <span className="flex items-baseline gap-2">
                {step !== null && (
                  <span className="text-xs text-muted" title={`${step}% of the previous stage`}>
                    {step}%
                  </span>
                )}
                <span className="min-w-8 text-right font-semibold tabular-nums text-fg">{s.count.toLocaleString('en-IN')}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full bg-[#16A34A]" style={{ width: `${Math.max(share, s.count > 0 ? 2 : 0)}%` }} />
            </div>
          </>
        );
        return (
          <li key={s.key}>
            {s.to ? (
              <Link
                to={s.to}
                className="-mx-2 block rounded-lg px-2 py-0.5 hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}
