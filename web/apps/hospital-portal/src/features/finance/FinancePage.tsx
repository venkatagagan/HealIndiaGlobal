import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Clock, PauseCircle, Wallet } from 'lucide-react';
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABELS,
  PAYOUT_STATUSES,
  PAYOUT_STATUS_LABELS,
  SETTLEMENT_ITEM_STATUSES,
  SETTLEMENT_ITEM_STATUS_LABELS,
  api,
  financeApi,
  type PayoutListParams,
  type PayoutOut,
  type PayoutStatus,
  type SettlementItemListParams,
  type SettlementItemOut,
  type SettlementItemStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, matchesSearch, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  DateCell,
  DateRangeFilter,
  EmptyState,
  ErrorState,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  SelectFilter,
  Skeleton,
  StatCard,
  StatusBadge,
  StatusBadgeCell,
  Tabs,
  TextCell,
  statusTone,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { formatDate, formatMoney, fromMinor, toMinor } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { PayoutAccountSection } from './PayoutAccountForm';

const TABS = ['items', 'payouts', 'statements', 'account'] as const;
type Tab = (typeof TABS)[number];
const CURRENCY = 'INR';
const minor = (major: number | undefined) => (major !== undefined ? (toMinor(major, CURRENCY) ?? undefined) : undefined);
const major = (m: number | undefined, ccy: string) => (m === undefined ? '' : fromMinor(m, ccy));

// ---------------------------------------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------------------------------------
function Summary() {
  const summary = useQuery({ queryKey: qk.financeSummary, queryFn: financeApi.payeeSummary });
  if (summary.isError) {
    return (
      <Card className="mb-6">
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </Card>
    );
  }
  const s = summary.data;
  if (!s) {
    return (
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending (in hold period)"
          value={formatMoney(s.pending_minor, s.currency)}
          icon={<Clock className="size-5" aria-hidden />}
          tone="warning"
          hint="Completed treatments within the post-discharge hold"
        />
        <StatCard
          label="Eligible for payout"
          value={formatMoney(s.eligible_minor, s.currency)}
          icon={<Wallet className="size-5" aria-hidden />}
          tone="info"
          hint="Included in the next settlement batch"
        />
        <StatCard
          label="On hold"
          value={formatMoney(s.on_hold_minor, s.currency)}
          icon={<PauseCircle className="size-5" aria-hidden />}
          tone="danger"
          hint="Held by finance - see reasons below"
        />
        <StatCard label="Paid out" value={formatMoney(s.paid_minor, s.currency)} icon={<CheckCircle2 className="size-5" aria-hidden />} tone="success" />
      </div>
      <div className="mt-4 mb-6 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <CalendarClock className="size-4" aria-hidden />
          Next payout: <strong className="text-fg">{formatDate(s.next_payout_date)}</strong>
        </span>
        <span>
          Last payout:{' '}
          {s.last_payout ? (
            <strong className="text-fg">
              {formatMoney(s.last_payout.amount_minor, s.last_payout.currency)} on {formatDate(s.last_payout.processed_at ?? s.last_payout.created_at)}
              {s.last_payout.utr ? ` · UTR ${s.last_payout.utr}` : ''}
            </strong>
          ) : (
            'none yet'
          )}
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Settlement items (server-side)
// ---------------------------------------------------------------------------------------------------------
const ITEM_FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(SETTLEMENT_ITEM_STATUSES),
  date_field: filterParam.oneOf(['eligible', 'created'] as const, 'eligible'),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const ITEM_SORT_KEYS = ['created_at', 'eligible_at', 'net_minor', 'gross_minor', 'status'] as const;

function itemApiFilters(f: FilterValues<typeof ITEM_FILTERS>): Omit<SettlementItemListParams, 'page' | 'page_size' | 'sort'> {
  const key = f.date_field === 'created' ? 'created' : 'eligible';
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    [`${key}_from`]: f.from || undefined,
    [`${key}_to`]: f.to || undefined,
    min_net: minor(f.min),
    max_net: minor(f.max),
  };
}

const deduction = (m: number, ccy: string) => <MoneyCell minor={-m} currency={ccy} className="text-muted" />;

const ITEM_COLUMNS: DataTableColumn<SettlementItemOut>[] = [
  {
    key: 'booking',
    header: 'Booking',
    sticky: true,
    mobile: 'primary',
    cell: (it) => <IdCell value={it.booking_number ?? 'Booking'} secondary={it.hold_reason ? <span className="text-danger-ink">Hold: {it.hold_reason}</span> : undefined} />,
    exportValue: (it) => it.booking_number ?? '',
  },
  {
    key: 'gross',
    header: 'Gross',
    align: 'end',
    sortable: true,
    sortKey: 'gross_minor',
    sortDescFirst: true,
    cell: (it) => <MoneyCell minor={it.gross_minor} currency={it.currency} />,
    exportValue: (it) => major(it.gross_minor, it.currency),
  },
  { key: 'commission', header: 'Commission', align: 'end', cell: (it) => deduction(it.commission_minor, it.currency), exportValue: (it) => major(it.commission_minor, it.currency) },
  { key: 'gst', header: 'GST', align: 'end', cell: (it) => deduction(it.tax_minor, it.currency), exportValue: (it) => major(it.tax_minor, it.currency) },
  { key: 'tds', header: 'TDS', align: 'end', defaultHidden: true, cell: (it) => deduction(it.tds_minor, it.currency), exportValue: (it) => major(it.tds_minor, it.currency) },
  {
    key: 'net',
    header: 'Net',
    align: 'end',
    sortable: true,
    sortKey: 'net_minor',
    sortDescFirst: true,
    mobile: 'secondary',
    cell: (it) => <MoneyCell minor={it.net_minor} currency={it.currency} className={it.net_minor < 0 ? 'text-danger-ink' : 'font-semibold'} />,
    exportValue: (it) => major(it.net_minor, it.currency),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (it) => <StatusBadgeCell status={it.status} kind="settlementItem" />,
    exportValue: (it) => SETTLEMENT_ITEM_STATUS_LABELS[it.status],
  },
  {
    key: 'eligible',
    header: 'Eligible',
    sortable: true,
    sortKey: 'eligible_at',
    cell: (it) => <DateCell value={it.eligible_at} display="date" />,
    exportValue: (it) => it.eligible_at ?? '',
  },
  {
    key: 'created',
    header: 'Created',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (it) => <DateCell value={it.created_at} display="date" className="text-muted" />,
    exportValue: (it) => it.created_at,
  },
];

function ItemsTab() {
  const table = useTableState({ filters: ITEM_FILTERS, prefix: 'si_', defaultSort: '-created_at', sortKeys: ITEM_SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => itemApiFilters(filters), [filters]);
  const params: SettlementItemListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const items = useQuery({ queryKey: qk.settlementItems(params), queryFn: () => financeApi.listItems(params), placeholderData: keepPreviousData });
  const counts = useQuery({
    queryKey: qk.settlementItems({ counts: apiFilters }),
    queryFn: () => financeApi.itemStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const quick: SettlementItemStatus[] = ['pending', 'eligible', 'on_hold', 'batched', 'paid'];
  const quickItems: QuickFilterItem<SettlementItemStatus>[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...quick.map((s) => ({ value: s, label: SETTLEMENT_ITEM_STATUS_LABELS[s], count: counts.data ? (counts.data.counts[s] ?? 0) : undefined })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 && quick.includes(filters.status[0]!) ? filters.status[0]! : null;

  return (
    <DataTable
      id="hospital.finance.items"
      caption="Settlement items"
      table={table}
      columns={ITEM_COLUMNS}
      rows={items.data?.items}
      total={items.data?.total}
      loading={items.isLoading}
      fetching={items.isFetching && !items.isLoading}
      error={items.error}
      onRetry={() => void items.refetch()}
      rowHref={(it) => `/bookings/${it.booking_id}`}
      rowLabel={(it) => `Open booking ${it.booking_number ?? ''}`}
      emptyTitle="No settlement items yet"
      emptyDescription="Items are created when a booking is completed (patient discharged)."
      header={
        <div className="border-b border-border px-2 sm:px-3">
          <QuickFilters label="Settlement status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
        </div>
      }
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Booking number…' }}
          onReset={table.resetFilters}
          actions={
            <ExportButton
              filename="settlement-items"
              columns={ITEM_COLUMNS}
              rows={items.data?.items}
              total={items.data?.total}
              fetchAll={() => fetchAllPages((page, size) => financeApi.listItems({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
            />
          }
        >
          <MultiSelectFilter
            label="Status"
            value={filters.status}
            onChange={(v) => setFilter('status', v)}
            options={SETTLEMENT_ITEM_STATUSES.map((s) => ({ value: s, label: SETTLEMENT_ITEM_STATUS_LABELS[s], tone: statusTone(s, 'settlementItem'), count: counts.data ? (counts.data.counts[s] ?? 0) : undefined }))}
          />
          <DateRangeFilter
            label="Date"
            value={{ from: filters.from, to: filters.to }}
            onChange={({ from, to }) => setFilters({ from, to })}
            fieldOptions={[
              { value: 'eligible', label: 'Eligible' },
              { value: 'created', label: 'Created' },
            ]}
            field={filters.date_field || 'eligible'}
            onFieldChange={(date_field) => setFilter('date_field', date_field)}
          />
          <AmountRangeFilter label="Net amount" currency={CURRENCY} value={{ min: filters.min, max: filters.max }} onChange={({ min, max }) => setFilters({ min, max })} />
        </FilterBar>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
// Payouts (server-side)
// ---------------------------------------------------------------------------------------------------------
const PAYOUT_FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(PAYOUT_STATUSES),
  method: filterParam.list(PAYOUT_METHODS),
  date_field: filterParam.oneOf(['processed', 'created'] as const, 'processed'),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const PAYOUT_SORT_KEYS = ['created_at', 'processed_at', 'amount_minor', 'status'] as const;

function payoutApiFilters(f: FilterValues<typeof PAYOUT_FILTERS>): Omit<PayoutListParams, 'page' | 'page_size' | 'sort'> {
  const key = f.date_field === 'created' ? 'created' : 'processed';
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    method: f.method.length ? f.method : undefined,
    [`${key}_from`]: f.from || undefined,
    [`${key}_to`]: f.to || undefined,
    min_amount: minor(f.min),
    max_amount: minor(f.max),
  };
}

const PAYOUT_COLUMNS: DataTableColumn<PayoutOut>[] = [
  {
    key: 'date',
    header: 'Date',
    sortable: true,
    sortKey: 'processed_at',
    sortDescFirst: true,
    sticky: true,
    mobile: 'secondary',
    cell: (p) => <DateCell value={p.processed_at ?? p.created_at} display="datetime" secondary={p.processed_at ? undefined : 'Not processed yet'} />,
    exportValue: (p) => p.processed_at ?? p.created_at,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortKey: 'amount_minor',
    sortDescFirst: true,
    mobile: 'primary',
    cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} className="font-semibold" />,
    exportValue: (p) => major(p.amount_minor, p.currency),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (p) => (
      <span className="block">
        <StatusBadgeCell status={p.status} kind="payout" />
        {p.failure_reason && <span className="mt-0.5 block max-w-56 truncate text-xs text-danger-ink">{p.failure_reason}</span>}
      </span>
    ),
    exportValue: (p) => PAYOUT_STATUS_LABELS[p.status],
  },
  {
    key: 'method',
    header: 'Method',
    cell: (p) => PAYOUT_METHOD_LABELS[p.method] ?? p.method,
    exportValue: (p) => PAYOUT_METHOD_LABELS[p.method] ?? p.method,
  },
  {
    key: 'utr',
    header: 'UTR / reference',
    cell: (p) => <IdCell value={p.utr ?? p.gateway_payout_id} />,
    exportValue: (p) => p.utr ?? p.gateway_payout_id ?? '',
  },
  {
    key: 'batch',
    header: 'Batch',
    defaultHidden: true,
    cell: (p) => <TextCell primary={p.batch_number ?? '—'} />,
    exportValue: (p) => p.batch_number ?? '',
  },
  {
    key: 'created',
    header: 'Created',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (p) => <DateCell value={p.created_at} display="date" className="text-muted" />,
    exportValue: (p) => p.created_at,
  },
];

function PayoutsTab() {
  const table = useTableState({ filters: PAYOUT_FILTERS, prefix: 'po_', defaultSort: '-created_at', sortKeys: PAYOUT_SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => payoutApiFilters(filters), [filters]);
  const params: PayoutListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const payouts = useQuery({ queryKey: qk.payouts(params), queryFn: () => financeApi.listPayouts(params), placeholderData: keepPreviousData });
  const counts = useQuery({
    queryKey: qk.payouts({ counts: apiFilters }),
    queryFn: () => financeApi.payoutStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const quick: PayoutStatus[] = ['queued', 'processing', 'processed', 'failed'];
  const quickItems: QuickFilterItem<PayoutStatus>[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...quick.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s], count: counts.data ? (counts.data.counts[s] ?? 0) : undefined })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 && quick.includes(filters.status[0]!) ? filters.status[0]! : null;

  return (
    <DataTable
      id="hospital.finance.payouts"
      caption="Payouts"
      table={table}
      columns={PAYOUT_COLUMNS}
      rows={payouts.data?.items}
      total={payouts.data?.total}
      loading={payouts.isLoading}
      fetching={payouts.isFetching && !payouts.isLoading}
      error={payouts.error}
      onRetry={() => void payouts.refetch()}
      emptyTitle="No payouts yet"
      emptyDescription="Payouts are made in settlement cycles once items become eligible."
      header={
        <div className="border-b border-border px-2 sm:px-3">
          <QuickFilters label="Payout status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
        </div>
      }
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'UTR or batch number…' }}
          onReset={table.resetFilters}
          actions={
            <ExportButton
              filename="payouts"
              columns={PAYOUT_COLUMNS}
              rows={payouts.data?.items}
              total={payouts.data?.total}
              fetchAll={() => fetchAllPages((page, size) => financeApi.listPayouts({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
            />
          }
          more={
            <MultiSelectFilter
              label="Method"
              value={filters.method}
              onChange={(v) => setFilter('method', v)}
              options={PAYOUT_METHODS.map((m) => ({ value: m, label: PAYOUT_METHOD_LABELS[m] ?? m }))}
            />
          }
        >
          <MultiSelectFilter
            label="Status"
            value={filters.status}
            onChange={(v) => setFilter('status', v)}
            options={PAYOUT_STATUSES.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s], tone: statusTone(s, 'payout'), count: counts.data ? (counts.data.counts[s] ?? 0) : undefined }))}
          />
          <DateRangeFilter
            label="Date"
            value={{ from: filters.from, to: filters.to }}
            onChange={({ from, to }) => setFilters({ from, to })}
            fieldOptions={[
              { value: 'processed', label: 'Paid on' },
              { value: 'created', label: 'Created' },
            ]}
            field={filters.date_field || 'processed'}
            onFieldChange={(date_field) => setFilter('date_field', date_field)}
          />
          <AmountRangeFilter label="Amount" currency={CURRENCY} value={{ min: filters.min, max: filters.max }} onChange={({ min, max }) => setFilters({ min, max })} />
        </FilterBar>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
// Statements (one request per period; filtered + sorted client-side)
// ---------------------------------------------------------------------------------------------------------
const STATEMENT_FILTERS = {
  q: filterParam.text(),
  // empty = the API default (last 30 days)
  from: filterParam.date(),
  to: filterParam.date(),
  type: filterParam.text(),
};

/**
 * What GET /finance/statements really returns (an object with balances + rows). `financeApi.statements` in
 * @hig/shared/api is typed as `StatementRow[]`, which does not match the API; read it through `api` and normalise
 * here (also accepts a bare array in case the shared typing/endpoint is aligned later).
 */
interface StatementApiRow {
  date: string;
  kind?: string;
  type?: string;
  reference: string | null;
  booking_id?: string | null;
  booking_number?: string | null;
  description: string | null;
  gross_minor?: number;
  commission_minor?: number;
  tax_minor?: number;
  tds_minor?: number;
  amount_minor?: number;
  net_minor?: number;
  currency?: string;
  status?: string;
}
interface StatementApiOut {
  currency?: string;
  from_date?: string;
  to_date?: string;
  opening_balance_minor?: number;
  total_earned_minor?: number;
  total_paid_minor?: number;
  closing_balance_minor?: number;
  rows: StatementApiRow[];
}
interface Txn {
  date: string;
  type: string;
  reference: string | null;
  booking_id: string | null;
  booking_number: string | null;
  description: string | null;
  gross_minor?: number;
  commission_minor?: number;
  tax_minor?: number;
  tds_minor?: number;
  net_minor: number;
  currency: string;
  status?: string;
}

async function fetchStatement(params: { from?: string; to?: string }): Promise<{ summary: Omit<StatementApiOut, 'rows'>; rows: Txn[] }> {
  const res = await api.get<StatementApiOut | StatementApiRow[]>('/finance/statements', params);
  const out: StatementApiOut = Array.isArray(res) ? { rows: res } : res;
  const ccy = out.currency ?? CURRENCY;
  const rows = (out.rows ?? []).map<Txn>((r) => ({
    date: r.date,
    type: r.kind ?? r.type ?? 'entry',
    reference: r.reference ?? null,
    booking_id: r.booking_id ?? null,
    booking_number: r.booking_number ?? null,
    description: r.description ?? null,
    gross_minor: r.gross_minor,
    commission_minor: r.commission_minor,
    tax_minor: r.tax_minor,
    tds_minor: r.tds_minor,
    net_minor: r.amount_minor ?? r.net_minor ?? 0,
    currency: r.currency ?? ccy,
    status: r.status,
  }));
  const { rows: _ignored, ...summary } = out;
  void _ignored;
  return { summary: { ...summary, currency: ccy }, rows };
}

const typeLabel = (t: string) => t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const TYPE_TONES: Record<string, 'success' | 'danger' | 'info' | 'neutral'> = { earning: 'success', clawback: 'danger', payout: 'info' };
const optionalMoney = (m: number | undefined, ccy: string) => (m === undefined ? <span className="text-muted">—</span> : <MoneyCell minor={m} currency={ccy} />);

const STATEMENT_COLUMNS: DataTableColumn<Txn>[] = [
  { key: 'date', header: 'Date', sortable: true, sticky: true, mobile: 'secondary', sortValue: (r) => r.date, cell: (r) => <DateCell value={r.date} display="date" />, exportValue: (r) => r.date },
  {
    key: 'type',
    header: 'Type',
    sortable: true,
    mobile: 'badge',
    sortValue: (r) => r.type,
    cell: (r) => <StatusBadge status={r.type} label={typeLabel(r.type)} tone={TYPE_TONES[r.type] ?? 'neutral'} dot={false} />,
    exportValue: (r) => typeLabel(r.type),
  },
  {
    key: 'reference',
    header: 'Reference',
    mobile: 'primary',
    cell: (r) => <IdCell value={r.booking_number ?? r.reference} copy={false} secondary={r.booking_number && r.reference ? r.reference : undefined} />,
    exportValue: (r) => r.booking_number ?? r.reference ?? '',
  },
  { key: 'description', header: 'Description', className: 'max-w-72', cell: (r) => <TextCell primary={r.description ?? '—'} />, exportValue: (r) => r.description ?? '' },
  { key: 'gross', header: 'Gross', align: 'end', defaultHidden: true, cell: (r) => optionalMoney(r.gross_minor, r.currency), exportValue: (r) => major(r.gross_minor, r.currency) },
  { key: 'commission', header: 'Commission', align: 'end', defaultHidden: true, cell: (r) => optionalMoney(r.commission_minor, r.currency), exportValue: (r) => major(r.commission_minor, r.currency) },
  { key: 'gst', header: 'GST', align: 'end', defaultHidden: true, cell: (r) => optionalMoney(r.tax_minor, r.currency), exportValue: (r) => major(r.tax_minor, r.currency) },
  { key: 'tds', header: 'TDS', align: 'end', defaultHidden: true, cell: (r) => optionalMoney(r.tds_minor, r.currency), exportValue: (r) => major(r.tds_minor, r.currency) },
  {
    key: 'net',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (r) => r.net_minor,
    cell: (r) => <MoneyCell minor={r.net_minor} currency={r.currency} className={r.net_minor < 0 ? 'text-danger-ink' : 'text-success-ink'} />,
    exportValue: (r) => major(r.net_minor, r.currency),
  },
  { key: 'currency', header: 'Currency', defaultHidden: true, cell: (r) => r.currency, exportValue: (r) => r.currency },
  { key: 'status', header: 'Status', defaultHidden: true, cell: (r) => (r.status ? <StatusBadge status={r.status} /> : '—'), exportValue: (r) => r.status ?? '' },
];

function StatementsTab() {
  const table = useTableState({ filters: STATEMENT_FILTERS, prefix: 'st_', defaultSort: '-date', defaultPageSize: 50 });
  const { filters, setFilter, setFilters } = table;
  const period = { from: filters.from, to: filters.to };
  const apiPeriod = { from: filters.from || undefined, to: filters.to || undefined };
  const statement = useQuery({ queryKey: qk.statements(apiPeriod), queryFn: () => fetchStatement(apiPeriod), placeholderData: keepPreviousData });
  const all = statement.data?.rows ?? [];
  const summary = statement.data?.summary;
  const rows = all.filter(matchesSearch(filters.q, (r) => [r.reference, r.booking_number, r.description])).filter((r) => !filters.type || r.type === filters.type);
  const types = [...new Set(all.map((r) => r.type))].sort().map((t) => ({ value: t, label: typeLabel(t), count: all.filter((r) => r.type === t).length }));
  const ccy = summary?.currency ?? CURRENCY;
  const periodLabel = summary?.from_date && summary.to_date ? `${formatDate(summary.from_date)} – ${formatDate(summary.to_date)}` : 'Last 30 days';
  const figures: [string, number | undefined][] = [
    ['Opening balance', summary?.opening_balance_minor],
    ['Earned', summary?.total_earned_minor],
    ['Paid out', summary?.total_paid_minor],
    ['Closing balance', summary?.closing_balance_minor],
  ];

  return (
    <DataTable
      id="hospital.finance.statements"
      caption="Statement"
      table={table}
      columns={STATEMENT_COLUMNS}
      rows={statement.data ? rows : undefined}
      rowKey={(r, i) => `${r.date}-${r.reference ?? ''}-${i}`}
      rowHref={(r) => (r.booking_id ? `/bookings/${r.booking_id}` : null)}
      rowLabel={(r) => `Open booking ${r.booking_number ?? ''}`}
      loading={statement.isPending}
      fetching={statement.isFetching && !statement.isPending}
      error={statement.error}
      onRetry={() => void statement.refetch()}
      emptyTitle="No transactions in this period"
      emptyDescription="Pick a longer period to see older settlements and payouts."
      header={
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {periodLabel} · {all.length} transaction{all.length === 1 ? '' : 's'}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {figures.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-semibold text-fg tabular-nums">{value === undefined ? '—' : formatMoney(value, ccy)}</dd>
              </div>
            ))}
          </dl>
        </div>
      }
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Reference or description…' }}
          onReset={table.resetFilters}
          actions={<ExportButton filename="statement" columns={STATEMENT_COLUMNS} rows={rows} />}
        >
          <DateRangeFilter label="Period" value={period} onChange={({ from, to }) => setFilters({ from, to })} />
          <SelectFilter label="Type" value={filters.type} onChange={(v) => setFilter('type', v)} options={types} />
        </FilterBar>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export function FinancePage() {
  useDocumentTitle('Finance');
  const { canFinance } = useHospital();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'items';
  // switching sections drops the other sections' filters from the URL
  const setTab = (next: Tab) => setSearchParams(next === 'items' ? {} : { tab: next }, { replace: true });

  if (!canFinance) {
    return (
      <div>
        <PageHeader title="Finance" />
        <Card>
          <EmptyState title="Finance access required" description="Ask a hospital owner or admin to give you the Finance role." />
        </Card>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title="Finance"
        description="Settlements are paid after discharge and the hold period, net of platform commission, GST on commission and TDS (194-O)."
      />
      <Summary />
      <Tabs
        className="mb-4"
        aria-label="Finance sections"
        tabs={[
          { value: 'items', label: 'Settlement items' },
          { value: 'payouts', label: 'Payouts' },
          { value: 'statements', label: 'Statements' },
          { value: 'account', label: 'Payout account' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'items' && <ItemsTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'statements' && <StatementsTab />}
      {tab === 'account' && (
        <Card>
          <CardHeader title="Payout bank account" description="Settlements are transferred to this account." />
          <CardBody>
            <PayoutAccountSection />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
