import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, endOfYear, format, startOfYear, subYears } from 'date-fns';
import { EXPORT_TYPES, REPORT_GROUP_BY, humanize, type ExportType, type ReportGroupBy, type RevenueReportRow } from '@hig/shared/api';
import { filterParam, useTableState } from '@hig/shared/lib';
import {
  DataTable,
  DateRangeFilter,
  DEFAULT_DATE_PRESETS,
  ExportButton,
  FilterBar,
  MoneyCell,
  QuickFilters,
  type DataTableColumn,
  type DatePreset,
} from '@hig/shared/ui';
import { formatDate, formatMoney, formatMonth, fromMinor, isoDateFromToday, todayIsoDate, toMinor, useDocumentTitle, useTheme } from '../lib/shared';
import { useExportCsv, useRevenueReport } from '../api/queries';
import { notifyError, notifySuccess } from '../components/finance';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../components/ui';

const FILTERS = {
  group_by: filterParam.oneOf(REPORT_GROUP_BY, 'month'),
  from: filterParam.date(),
  to: filterParam.date(),
};

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const REPORT_PRESETS: readonly DatePreset[] = [
  ...DEFAULT_DATE_PRESETS.filter((p) => p.id !== 'today'),
  { id: '12m', label: 'Last 12 months', range: () => ({ from: iso(addDays(new Date(), -365)), to: iso(new Date()) }) },
  { id: 'year', label: 'This year', range: () => ({ from: iso(startOfYear(new Date())), to: iso(new Date()) }) },
  {
    id: 'last-year',
    label: 'Last year',
    range: () => {
      const d = subYears(new Date(), 1);
      return { from: iso(startOfYear(d)), to: iso(endOfYear(d)) };
    },
  },
];

/** Categorical slots validated for both surfaces (light / dark): GMV = violet, revenue = green. */
const SERIES_COLORS = {
  light: { gmv: '#7C3AED', revenue: '#16A34A', grid: '#E2E8F0', axis: '#64748B' },
  dark: { gmv: '#8B5CF6', revenue: '#16A34A', grid: '#2A3340', axis: '#94A3B8' },
} as const;

const GROUP_LABELS: Record<ReportGroupBy, string> = { month: 'By month', hospital: 'By hospital', specialty: 'By specialty' };

export default function ReportsPage() {
  useDocumentTitle('Finance reports');
  const table = useTableState({ filters: FILTERS, defaultSort: 'key', defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const groupBy: ReportGroupBy = filters.group_by || 'month';
  const from = filters.from || isoDateFromToday(-365);
  const to = filters.to || todayIsoDate();
  const report = useRevenueReport({ group_by: groupBy, from, to });
  const exporter = useExportCsv();
  const { isDark } = useTheme();
  const palette = isDark ? SERIES_COLORS.dark : SERIES_COLORS.light;

  const data = report.data;
  const currency = data?.currency ?? 'INR';
  const rows = data?.rows;
  const label = (r: RevenueReportRow) => (groupBy === 'month' ? formatMonth(r.key) : r.label || r.key);

  const chartRows = useMemo(() => {
    const list = (rows ?? []).map((r) => ({
      name: groupBy === 'month' ? formatMonth(r.key, 'MMM yy') : r.label || r.key,
      gmv: fromMinor(r.gmv_minor, currency),
      revenue: fromMinor(r.revenue_minor, currency),
      gmv_minor: r.gmv_minor,
      revenue_minor: r.revenue_minor,
    }));
    // hospitals / specialties: show the top 12 by GMV so labels stay legible; the table lists everything
    return groupBy === 'month' ? list : [...list].sort((a, b) => b.gmv_minor - a.gmv_minor).slice(0, 12);
  }, [rows, groupBy, currency]);

  const totals = useMemo(() => {
    if (data?.totals) return data.totals;
    return (rows ?? []).reduce(
      (acc, r) => ({ bookings: acc.bookings + r.bookings, gmv_minor: acc.gmv_minor + r.gmv_minor, revenue_minor: acc.revenue_minor + r.revenue_minor }),
      { bookings: 0, gmv_minor: 0, revenue_minor: 0 },
    );
  }, [data, rows]);
  const hasCommission = rows?.some((r) => r.commission_minor != null) ?? false;
  const hasRefunds = rows?.some((r) => r.refunds_minor != null) ?? false;

  const columns: DataTableColumn<RevenueReportRow>[] = [
    {
      key: 'key',
      header: humanize(groupBy),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      sortValue: (r) => (groupBy === 'month' ? r.key : label(r).toLowerCase()),
      cell: (r) => <span className="font-medium text-fg">{label(r)}</span>,
      exportValue: (r) => label(r),
    },
    { key: 'bookings', header: 'Bookings', align: 'end', sortable: true, sortDescFirst: true, cell: (r) => <span className="tabular-nums">{r.bookings.toLocaleString()}</span> },
    {
      key: 'gmv_minor',
      header: 'GMV',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      cell: (r) => <MoneyCell minor={r.gmv_minor} currency={currency} />,
      exportValue: (r) => fromMinor(r.gmv_minor, currency),
    },
    {
      key: 'revenue_minor',
      header: 'Revenue',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      mobile: 'badge',
      cell: (r) => <MoneyCell minor={r.revenue_minor} currency={currency} className="font-semibold" />,
      exportValue: (r) => fromMinor(r.revenue_minor, currency),
    },
    ...(hasCommission
      ? [
          {
            key: 'commission_minor',
            header: 'Commission',
            align: 'end' as const,
            sortable: true,
            sortDescFirst: true,
            sortValue: (r: RevenueReportRow) => r.commission_minor ?? 0,
            cell: (r: RevenueReportRow) => <MoneyCell minor={r.commission_minor ?? null} currency={currency} />,
            exportValue: (r: RevenueReportRow) => (r.commission_minor == null ? '' : fromMinor(r.commission_minor, currency)),
          },
        ]
      : []),
    ...(hasRefunds
      ? [
          {
            key: 'refunds_minor',
            header: 'Refunds',
            align: 'end' as const,
            sortable: true,
            sortDescFirst: true,
            sortValue: (r: RevenueReportRow) => r.refunds_minor ?? 0,
            cell: (r: RevenueReportRow) => <MoneyCell minor={r.refunds_minor ?? null} currency={currency} />,
            exportValue: (r: RevenueReportRow) => (r.refunds_minor == null ? '' : fromMinor(r.refunds_minor, currency)),
          },
        ]
      : []),
    {
      key: 'take',
      header: 'Take rate',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (r) => (r.gmv_minor > 0 ? r.revenue_minor / r.gmv_minor : 0),
      cell: (r) => <span className="tabular-nums">{r.gmv_minor > 0 ? `${((r.revenue_minor / r.gmv_minor) * 100).toFixed(1)}%` : '—'}</span>,
      exportValue: (r) => (r.gmv_minor > 0 ? `${((r.revenue_minor / r.gmv_minor) * 100).toFixed(1)}%` : ''),
    },
  ];

  const runExport = (type: ExportType) =>
    exporter.mutate(
      { type, from, to },
      {
        onSuccess: () => notifySuccess(`${humanize(type)} export downloaded`),
        onError: (e) => notifyError(e, 'Export failed'),
      },
    );

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Revenue recognised from completed bookings (commission + service fees) against gross merchandise value, plus CSV exports for accounting."
      />

      <Card className="mb-4">
        <div className="border-b border-border px-2 sm:px-3">
          <QuickFilters
            label="Group revenue"
            items={REPORT_GROUP_BY.map((g) => ({ value: g, label: GROUP_LABELS[g] }))}
            value={groupBy}
            onChange={(g) => setFilter('group_by', g || 'month')}
          />
        </div>
        <FilterBar
          className="border-b border-border p-3 sm:px-4"
          onReset={() => setFilters({ from: '', to: '' })}
          actions={<ExportButton filename={`revenue-${groupBy}`} columns={columns} rows={rows} />}
        >
          <DateRangeFilter
            label="Period"
            presets={REPORT_PRESETS}
            value={{ from: filters.from, to: filters.to }}
            onChange={({ from: f, to: t }) => setFilters({ from: f, to: t })}
          />
          <span className="text-xs text-muted">
            {formatDate(from)} – {formatDate(to)}
          </span>
        </FilterBar>

        {report.isLoading ? (
          <LoadingState />
        ) : report.isError && !data ? (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState title="No revenue in this period" description="Revenue is recognised when bookings are completed." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-3">
              <Headline label="GMV" value={formatMoney(totals.gmv_minor, currency)} />
              <Headline label="Revenue" value={formatMoney(totals.revenue_minor, currency)} />
              <Headline label="Bookings" value={totals.bookings.toLocaleString()} />
            </div>
            <figure className="p-4">
              <figcaption className="mb-2 text-sm font-medium text-fg">
                GMV and revenue {GROUP_LABELS[groupBy].toLowerCase()}
                {groupBy !== 'month' && rows.length > 12 && <span className="font-normal text-muted"> (top 12 by GMV)</span>}
              </figcaption>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barGap={2} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke={palette.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: palette.axis }} tickLine={false} axisLine={{ stroke: palette.grid }}
                      interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fontSize: 12, fill: palette.axis }}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(v: number) => formatMoney(toMinor(v, currency), currency, undefined, { compact: true })}
                    />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)' }}
                      contentStyle={{
                        borderRadius: 8,
                        border: `1px solid ${palette.grid}`,
                        background: isDark ? '#161B22' : '#FFFFFF',
                        color: isDark ? '#E2E8F0' : '#0F172A',
                        fontSize: 12,
                      }}
                      formatter={(_value, name, item) => {
                        const p = item.payload as { gmv_minor: number; revenue_minor: number };
                        return [formatMoney(name === 'GMV' ? p.gmv_minor : p.revenue_minor, currency), name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
                    <Bar dataKey="gmv" name="GMV" fill={palette.gmv} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="revenue" name="Revenue" fill={palette.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>
          </>
        )}
      </Card>

      {rows && rows.length > 0 && (
        <DataTable
          id="admin.finance.reports.revenue"
          className="mb-4"
          caption={`Revenue ${GROUP_LABELS[groupBy].toLowerCase()}`}
          table={table}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          fetching={report.isFetching && !report.isLoading}
          header={
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-fg">Revenue {GROUP_LABELS[groupBy].toLowerCase()}</h2>
              <span className="text-xs text-muted">{rows.length.toLocaleString()} rows</span>
            </div>
          }
        />
      )}

      <Card title="CSV exports" actions={<span className="text-xs text-slate-500">Uses the date range above</span>}>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {EXPORT_TYPES.map((type) => (
            <div key={type} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{humanize(type)}</p>
                <p className="text-xs text-slate-500">
                  {type === 'bookings' ? 'Bookings with amounts and status' : type === 'payments' ? 'Orders, payments and refunds' : 'Settlement items and payouts'}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={exporter.isPending && exporter.variables?.type === type}
                disabled={exporter.isPending}
                onClick={() => runExport(type)}
                icon={<Download className="size-3.5" aria-hidden />}
              >
                CSV
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
