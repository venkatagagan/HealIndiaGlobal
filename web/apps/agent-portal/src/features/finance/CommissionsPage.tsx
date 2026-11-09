import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Building2, CalendarClock, CheckCircle2, Clock, PauseCircle, Wallet } from 'lucide-react';
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABELS,
  PAYOUT_STATUSES,
  PAYOUT_STATUS_LABELS,
  SETTLEMENT_ITEM_STATUSES,
  agentPortalApi,
  financeApi,
  humanize,
  type AgentCommissionListParams,
  type AgentCommissionOut,
  type PayoutOut,
  type PayoutStatus,
  type SettlementItemStatus,
} from '@hig/shared/api';
import {
  AmountRangeFilter,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { Card, ErrorState, Money, PageHeader, Skeleton, StatCard, Tabs } from '../../components/ui';
import { fetchStatement, type StatementLine } from '../../lib/financeAdapters';
import { inDateRange, optionsFromRows, useHospitalOptions } from '../../lib/lookups';
import { qk } from '../../lib/queries';
import {
  fetchAllPages,
  filterParam,
  formatDate,
  formatMoney,
  fromMinor,
  isoDateFromToday,
  matchesSearch,
  toMinor,
  useDocumentTitle,
  useTableState,
  type FilterValues,
} from '../../lib/shared';

type Tab = 'items' | 'payouts' | 'statements';
const TABS: Tab[] = ['items', 'payouts', 'statements'];

export function CommissionsPage() {
  useDocumentTitle('Commissions');
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'items';
  // switching tabs drops the other tabs' filters (each tab has its own URL state)
  const setTab = (t: Tab) => setParams(t === 'items' ? {} : { tab: t }, { replace: true });
  const summary = useQuery({ queryKey: qk.financeSummary, queryFn: financeApi.payeeSummary });
  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Commissions"
        description="Commission is earned when a treatment you facilitated is completed, then paid out after the holding period."
      />
      {summary.isError ? (
        <Card className="mb-6">
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {!s ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)
          ) : (
            <>
              <StatCard label="Pending" value={formatMoney(s.pending_minor, s.currency)} icon={<Clock className="h-4 w-4" />} tone="warning" hint="In holding period" />
              <StatCard label="Eligible" value={formatMoney(s.eligible_minor, s.currency)} icon={<Wallet className="h-4 w-4" />} tone="info" hint="Included in the next payout" />
              <StatCard label="On hold" value={formatMoney(s.on_hold_minor, s.currency)} icon={<PauseCircle className="h-4 w-4" />} tone="accent" />
              <StatCard label="Paid out" value={formatMoney(s.paid_minor, s.currency)} icon={<CheckCircle2 className="h-4 w-4" />} />
              <StatCard
                label="Next payout"
                value={s.next_payout_date ? formatDate(s.next_payout_date) : '—'}
                icon={<CalendarClock className="h-4 w-4" />}
                hint={
                  s.last_payout
                    ? `Last: ${formatMoney(s.last_payout.amount_minor, s.last_payout.currency)} on ${formatDate(s.last_payout.processed_at ?? s.last_payout.created_at)}`
                    : 'No payouts yet'
                }
              />
            </>
          )}
        </div>
      )}
      <p className="mb-4 text-sm text-muted">
        Payouts go to your{' '}
        <Link to="/payout-account" className="font-medium text-primary-ink hover:underline">
          verified payout account
        </Link>
        .
      </p>

      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'items', label: 'Commission items' },
          { value: 'payouts', label: 'Payouts' },
          { value: 'statements', label: 'Statement' },
        ]}
      />
      {tab === 'items' && <ItemsTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'statements' && <StatementsTab />}
    </div>
  );
}

// =========================================================================================================
// Commission items (server-side)
// =========================================================================================================
const ITEM_LABELS: Record<SettlementItemStatus, string> = {
  pending: 'Pending',
  eligible: 'Eligible',
  on_hold: 'On hold',
  batched: 'In payout batch',
  paid: 'Paid',
  reversed: 'Clawed back',
};
const QUICK_ITEM_STATUSES: SettlementItemStatus[] = ['pending', 'eligible', 'on_hold', 'paid', 'reversed'];
const CURRENCY = 'INR';

const ITEM_FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(SETTLEMENT_ITEM_STATUSES),
  hospital_id: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const ITEM_SORT_KEYS = ['created_at', 'eligible_at', 'net_minor', 'gross_minor', 'status', 'booking_number'] as const;
type ItemFilters = FilterValues<typeof ITEM_FILTERS>;

function toItemApiFilters(f: ItemFilters): Omit<AgentCommissionListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    hospital_id: f.hospital_id || undefined,
    created_from: f.from || undefined,
    created_to: f.to || undefined,
    min_net: f.min !== undefined ? (toMinor(f.min, CURRENCY) ?? undefined) : undefined,
    max_net: f.max !== undefined ? (toMinor(f.max, CURRENCY) ?? undefined) : undefined,
  };
}

const moneyText = (minor: number, currency: string) => `${currency} ${fromMinor(minor, currency)}`;

const ITEM_COLUMNS: DataTableColumn<AgentCommissionOut>[] = [
  {
    key: 'booking',
    header: 'Booking',
    sortable: true,
    sortKey: 'booking_number',
    sticky: true,
    mobile: 'secondary',
    cell: (r) => <IdCell value={r.booking_number ?? '—'} secondary={r.case_number ?? undefined} />,
    exportValue: (r) => r.booking_number ?? r.booking_id,
  },
  {
    key: 'patient',
    header: 'Patient',
    mobile: 'primary',
    className: 'max-w-52',
    cell: (r) => <PersonCell name={r.patient_name ?? 'Patient'} />,
    exportValue: (r) => r.patient_name ?? '',
  },
  {
    key: 'hospital',
    header: 'Hospital',
    className: 'max-w-56',
    cell: (r) => <TextCell primary={r.hospital_name ?? '—'} />,
    exportValue: (r) => r.hospital_name ?? '',
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (r) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={r.status} kind="settlementItem" label={ITEM_LABELS[r.status]} />
        {r.hold_reason && <span className="max-w-48 truncate text-xs text-muted">{r.hold_reason}</span>}
      </span>
    ),
    mobileCell: (r) => <StatusBadgeCell status={r.status} kind="settlementItem" label={ITEM_LABELS[r.status]} />,
    exportValue: (r) => ITEM_LABELS[r.status],
  },
  {
    key: 'eligible',
    header: 'Eligible from',
    sortable: true,
    sortKey: 'eligible_at',
    sortDescFirst: true,
    cell: (r) => <DateCell value={r.eligible_at} display="date" />,
    exportValue: (r) => r.eligible_at ?? '',
  },
  {
    key: 'gross',
    header: 'Gross',
    align: 'end',
    sortable: true,
    sortKey: 'gross_minor',
    sortDescFirst: true,
    cell: (r) => <MoneyCell minor={r.gross_minor} currency={r.currency} className="text-muted" />,
    exportValue: (r) => moneyText(r.gross_minor, r.currency),
  },
  {
    key: 'deductions',
    header: 'Tax & TDS',
    align: 'end',
    defaultHidden: true,
    cell: (r) => <MoneyCell minor={r.tax_minor + r.tds_minor} currency={r.currency} className="text-muted" />,
    exportValue: (r) => moneyText(r.tax_minor + r.tds_minor, r.currency),
  },
  {
    key: 'net',
    header: 'Net',
    align: 'end',
    sortable: true,
    sortKey: 'net_minor',
    sortDescFirst: true,
    cell: (r) => <MoneyCell minor={r.net_minor} currency={r.currency} className={r.net_minor < 0 ? 'font-semibold text-danger' : 'font-semibold'} />,
    exportValue: (r) => moneyText(r.net_minor, r.currency),
  },
  {
    key: 'created',
    header: 'Earned',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (r) => <DateCell value={r.created_at} display="date" />,
    exportValue: (r) => r.created_at,
  },
];

function ItemsTab() {
  const table = useTableState({ filters: ITEM_FILTERS, defaultSort: '-created_at', sortKeys: ITEM_SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toItemApiFilters(filters), [filters]);
  const listParams: AgentCommissionListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: qk.commissions(listParams),
    queryFn: () => agentPortalApi.commissions(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: qk.commissions({ statusCounts: apiFilters }),
    queryFn: () => agentPortalApi.commissionStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const hospitals = useHospitalOptions();

  const statusOptions: FilterOption<SettlementItemStatus>[] = SETTLEMENT_ITEM_STATUSES.map((s) => ({
    value: s,
    label: ITEM_LABELS[s],
    tone: statusTone(s, 'settlementItem'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<SettlementItemStatus>[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...QUICK_ITEM_STATUSES.map((s) => ({ value: s, label: ITEM_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue =
    filters.status.length === 0 ? '' : filters.status.length === 1 && QUICK_ITEM_STATUSES.includes(filters.status[0]!) ? filters.status[0]! : null;
  const selectedNet = counts.data
    ? (filters.status.length ? filters.status : [...SETTLEMENT_ITEM_STATUSES]).reduce<number>((sum, s) => sum + (counts.data?.net_minor[s] ?? 0), 0)
    : null;

  return (
    <DataTable
      id="agent.commissions"
      caption="Commission items"
      table={table}
      columns={ITEM_COLUMNS}
      rows={list.data?.items}
      total={list.data?.total}
      loading={list.isLoading}
      fetching={list.isFetching && !list.isLoading}
      error={list.error}
      onRetry={() => void list.refetch()}
      rowHref={(r) => (r.case_id ? `/cases/${r.case_id}` : null)}
      rowLabel={(r) => `Open case for booking ${r.booking_number ?? ''}`}
      emptyIcon={<Wallet className="size-6" aria-hidden />}
      emptyTitle="No commission yet"
      emptyDescription="Commission items appear after a booked treatment is completed."
      header={
        <div className="flex flex-wrap items-end justify-between gap-x-4 border-b border-border px-2 sm:px-3">
          <QuickFilters label="Commission status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          {selectedNet !== null && (
            <p className="py-2 text-sm text-muted">
              Net in view: <Money minor={selectedNet} currency={CURRENCY} className="font-semibold text-fg" />
            </p>
          )}
        </div>
      }
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Booking, case, patient or hospital…', label: 'Search commission' }}
          onReset={table.resetFilters}
          actions={
            <ExportButton
              filename="commissions"
              columns={ITEM_COLUMNS}
              rows={list.data?.items}
              total={list.data?.total}
              fetchAll={() => fetchAllPages((page, size) => agentPortalApi.commissions({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
            />
          }
        >
          <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
          <SelectFilter
            label="Hospital"
            icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
            value={filters.hospital_id}
            onChange={(v) => setFilter('hospital_id', v)}
            options={hospitals.data ?? []}
            loading={hospitals.isLoading}
            searchable
          />
          <DateRangeFilter label="Earned" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          <AmountRangeFilter
            label="Net amount"
            currency={CURRENCY}
            value={{ min: filters.min, max: filters.max }}
            onChange={({ min, max }) => setFilters({ min, max })}
          />
        </FilterBar>
      }
    />
  );
}

// =========================================================================================================
// Payouts (client-side: an agent has few payouts)
// =========================================================================================================
const PAYOUT_FILTERS = {
  status: filterParam.list(PAYOUT_STATUSES),
  method: filterParam.text(),
  q: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
};
const PAYOUT_COLUMNS: DataTableColumn<PayoutOut>[] = [
  {
    key: 'date',
    header: 'Date',
    sortable: true,
    sortDescFirst: true,
    sortValue: (p) => p.processed_at ?? p.created_at,
    sticky: true,
    mobile: 'secondary',
    cell: (p) => <DateCell value={p.processed_at ?? p.created_at} display="datetime" secondary={p.processed_at ? 'Processed' : 'Created'} />,
    exportValue: (p) => p.processed_at ?? p.created_at,
  },
  {
    key: 'reference',
    header: 'Reference (UTR)',
    mobile: 'primary',
    cell: (p) => (p.utr ? <IdCell value={p.utr} secondary={p.batch_number ?? undefined} /> : <TextCell primary={<span className="text-muted">Pending</span>} secondary={p.batch_number ?? undefined} />),
    mobileCell: (p) => p.utr ?? p.batch_number ?? 'Payout',
    exportValue: (p) => p.utr ?? '',
  },
  {
    key: 'method',
    header: 'Method',
    cell: (p) => PAYOUT_METHOD_LABELS[p.method] ?? humanize(p.method),
    exportValue: (p) => PAYOUT_METHOD_LABELS[p.method] ?? p.method,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    sortValue: (p) => p.status,
    mobile: 'badge',
    cell: (p) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={p.status} kind="payout" />
        {p.failure_reason && <span className="max-w-56 truncate text-xs text-danger">{p.failure_reason}</span>}
      </span>
    ),
    mobileCell: (p) => <StatusBadgeCell status={p.status} kind="payout" />,
    exportValue: (p) => PAYOUT_STATUS_LABELS[p.status],
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (p) => p.amount_minor,
    cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} className="font-semibold" />,
    exportValue: (p) => moneyText(p.amount_minor, p.currency),
  },
];

function PayoutsTab() {
  const table = useTableState({
    filters: PAYOUT_FILTERS,
    prefix: 'po_',
    defaultSort: '-date',
    sortKeys: ['date', 'status', 'amount'],
    defaultPageSize: 25,
  });
  const { filters, setFilter, setFilters } = table;
  const query = useQuery({
    queryKey: qk.payouts({ all: true }),
    queryFn: () => fetchAllPages((page, size) => financeApi.listPayouts({ page, page_size: size })),
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (p) => [p.utr, p.batch_number, p.failure_reason]))
        .filter((p) => !filters.status.length || filters.status.includes(p.status))
        .filter((p) => !filters.method || p.method === filters.method)
        .filter((p) => inDateRange(p.processed_at ?? p.created_at, filters.from, filters.to)),
    [all, filters],
  );
  const statusOptions: FilterOption<PayoutStatus>[] = PAYOUT_STATUSES.map((s) => ({
    value: s,
    label: PAYOUT_STATUS_LABELS[s],
    tone: statusTone(s, 'payout'),
    count: query.data ? all.filter((p) => p.status === s).length : undefined,
  }));
  const methodOptions = useMemo(
    () => optionsFromRows(all, (p) => ({ value: p.method, label: PAYOUT_METHOD_LABELS[p.method] ?? p.method })),
    [all],
  );

  return (
    <DataTable
      id="agent.payouts"
      caption="Payouts"
      table={table}
      columns={PAYOUT_COLUMNS}
      rows={rows}
      loading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      emptyTitle="No payouts yet"
      emptyDescription="Eligible commission is paid out on the settlement cycle."
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'UTR or batch…', label: 'Search payouts' }}
          onReset={table.resetFilters}
          resultCount={query.data ? rows.length : undefined}
          resultLabel={(n) => `${n} payout${n === 1 ? '' : 's'}`}
          actions={<ExportButton filename="payouts" columns={PAYOUT_COLUMNS} rows={rows} />}
        >
          <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
          <SelectFilter
            label="Method"
            value={filters.method}
            onChange={(v) => setFilter('method', v)}
            options={methodOptions.length ? methodOptions : PAYOUT_METHODS.map((m) => ({ value: m, label: PAYOUT_METHOD_LABELS[m] ?? m }))}
          />
          <DateRangeFilter label="Date" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
        </FilterBar>
      }
    />
  );
}

// =========================================================================================================
// Statement (one request for the period; client-side table)
// =========================================================================================================
const STATEMENT_FILTERS = {
  from: filterParam.date(isoDateFromToday(-89)),
  to: filterParam.date(isoDateFromToday(0)),
  type: filterParam.list(),
  q: filterParam.text(),
};
const STATEMENT_COLUMNS: DataTableColumn<StatementLine>[] = [
  {
    key: 'date',
    header: 'Date',
    sortable: true,
    sortDescFirst: true,
    sortValue: (r) => r.date,
    sticky: true,
    mobile: 'secondary',
    cell: (r) => <DateCell value={r.date} display="date" />,
    exportValue: (r) => r.date,
  },
  {
    key: 'type',
    header: 'Type',
    sortable: true,
    sortValue: (r) => r.type,
    mobile: 'primary',
    cell: (r) => <TextCell primary={humanize(r.type)} secondary={r.status ? humanize(r.status) : undefined} />,
    mobileCell: (r) => humanize(r.type),
    exportValue: (r) => humanize(r.type),
  },
  {
    key: 'reference',
    header: 'Reference',
    cell: (r) => (r.booking_number ?? r.reference ? <IdCell value={r.booking_number ?? r.reference} /> : <span className="text-muted">—</span>),
    exportValue: (r) => r.booking_number ?? r.reference ?? '',
  },
  {
    key: 'description',
    header: 'Description',
    className: 'max-w-80',
    cell: (r) => <TextCell primary={r.description ?? '—'} />,
    exportValue: (r) => r.description ?? '',
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (r) => r.amount_minor,
    mobile: 'badge',
    cell: (r) => (
      <MoneyCell minor={r.amount_minor} currency={r.currency} className={r.amount_minor < 0 ? 'font-semibold text-danger' : 'font-semibold text-primary-ink'} />
    ),
    exportValue: (r) => moneyText(r.amount_minor, r.currency),
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'end',
    cell: (r) => (r.balance_minor !== null ? <MoneyCell minor={r.balance_minor} currency={r.currency} /> : <span className="text-muted">—</span>),
    exportValue: (r) => (r.balance_minor !== null ? moneyText(r.balance_minor, r.currency) : ''),
  },
];

function StatementsTab() {
  const table = useTableState({ filters: STATEMENT_FILTERS, prefix: 'st_', defaultSort: 'date', sortKeys: ['date', 'type', 'amount'], defaultPageSize: 50 });
  const { filters, setFilter, setFilters } = table;
  const valid = !filters.from || !filters.to || filters.from <= filters.to;
  const query = useQuery({
    queryKey: qk.statements({ from: filters.from, to: filters.to }),
    queryFn: () => fetchStatement(filters.from || undefined, filters.to || undefined),
    enabled: valid,
  });
  const st = query.data;
  const all = useMemo(() => st?.rows ?? [], [st]);
  const rows = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (r) => [r.reference, r.booking_number, r.description]))
        .filter((r) => !filters.type.length || filters.type.includes(r.type)),
    [all, filters],
  );
  const typeOptions = useMemo(() => optionsFromRows(all, (r) => ({ value: r.type, label: humanize(r.type) })), [all]);

  return (
    <DataTable
      id="agent.statement"
      caption="Statement"
      table={table}
      columns={STATEMENT_COLUMNS}
      rows={valid ? rows : []}
      loading={valid && query.isLoading}
      error={valid ? query.error : new Error('Choose a valid date range: the start must be before the end.')}
      onRetry={() => void query.refetch()}
      emptyTitle="No activity in this period"
      emptyDescription="Earned commission, payouts and adjustments for the chosen dates appear here."
      header={
        st && st.opening_balance_minor !== null ? (
          <dl className="grid grid-cols-2 gap-4 border-b border-border p-4 text-sm sm:grid-cols-4">
            <SummaryItem label="Opening balance" minor={st.opening_balance_minor} currency={st.currency} />
            <SummaryItem label="Earned" minor={st.total_earned_minor} currency={st.currency} tone="text-primary-ink" />
            <SummaryItem label="Paid out" minor={st.total_paid_minor} currency={st.currency} />
            <SummaryItem label="Closing balance" minor={st.closing_balance_minor} currency={st.currency} />
          </dl>
        ) : undefined
      }
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Reference or description…', label: 'Search statement' }}
          onReset={table.resetFilters}
          resultCount={st ? rows.length : undefined}
          resultLabel={(n) => `${n} entr${n === 1 ? 'y' : 'ies'}`}
          showChips={table.isFiltered}
          actions={<ExportButton filename={`statement-${filters.from || 'start'}-to-${filters.to || 'today'}`} columns={STATEMENT_COLUMNS} rows={rows} />}
        >
          <DateRangeFilter label="Period" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          <MultiSelectFilter label="Type" value={filters.type} onChange={(v) => setFilter('type', v)} options={typeOptions} />
        </FilterBar>
      }
    />
  );
}

function SummaryItem({ label, minor, currency, tone }: { label: string; minor: number | null; currency: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2">
      <dt className="text-xs font-medium text-muted uppercase">{label}</dt>
      <dd className={`mt-1 text-base font-semibold tabular-nums ${tone ?? ''}`}>{minor !== null ? <Money minor={minor} currency={currency} /> : '—'}</dd>
    </div>
  );
}
