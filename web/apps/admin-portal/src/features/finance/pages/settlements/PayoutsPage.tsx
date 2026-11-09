import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Landmark, Users } from 'lucide-react';
import {
  financeApi,
  PAYEE_TYPE_LABELS,
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABELS,
  PAYOUT_STATUSES,
  PAYOUT_STATUS_LABELS,
  type PayeeType,
  type PayoutListParams,
  type PayoutOut,
  type PayoutStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, formatDate, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Badge,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { financeKeys } from '../../api/queries';
import { Callout } from '../../components/ui';
import { isPayoutAwaitingConfirmation, isPayoutReversalPending } from '../../components/reviews';
import {
  PAYEE_TYPE_OPTIONS,
  PayeeFilter,
  payeeParams,
  PayoutActionDialogs,
  PayoutRowActions,
  SettlementTabs,
} from '../../components/settlements';
import { listOrUndefined, minorOrUndefined } from '../../lib/tables';
import { financePath } from '../../paths';

// ---------------------------------------------------------------------------------------------------------
// URL state (`queue=confirm|reconcile|reversal` keeps the links of the finance review tile working)
// ---------------------------------------------------------------------------------------------------------
const PAYEE_TYPES_FILTER = ['hospital', 'agent', 'vendor'] as const satisfies readonly PayeeType[];
const QUEUES = ['reconcile', 'confirm', 'reversal'] as const;
type Queue = (typeof QUEUES)[number];
const DATE_FIELDS = ['created', 'processed'] as const;

const FILTERS = {
  q: filterParam.text(),
  queue: filterParam.oneOf(QUEUES),
  status: filterParam.list(PAYOUT_STATUSES),
  method: filterParam.list(PAYOUT_METHODS),
  payee_type: filterParam.oneOf(PAYEE_TYPES_FILTER),
  payee: filterParam.text(),
  date_field: filterParam.oneOf(DATE_FIELDS, 'created'),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'processed_at', 'amount_minor', 'status'] as const;

type PayoutFilters = FilterValues<typeof FILTERS>;
type ApiFilters = Omit<PayoutListParams, 'page' | 'page_size' | 'sort'>;

function toApiFilters(f: PayoutFilters): ApiFilters {
  const dateKey = f.date_field === 'processed' ? 'processed' : 'created';
  return {
    q: f.q.trim() || undefined,
    status: f.queue === 'reconcile' ? ['needs_reconciliation'] : listOrUndefined(f.status),
    awaiting_confirmation: f.queue === 'confirm' || undefined,
    reversal_pending: f.queue === 'reversal' || undefined,
    method: listOrUndefined(f.method),
    ...payeeParams(f.payee, f.payee_type),
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
    min_amount: minorOrUndefined(f.min),
    max_amount: minorOrUndefined(f.max),
  };
}

const QUEUE_EMPTY: Record<Queue, { title: string; description: string }> = {
  reconcile: {
    title: 'Nothing to reconcile',
    description: 'Payouts whose gateway outcome is unknown (timeouts, unclear answers) appear here. They are never re-sent automatically.',
  },
  confirm: { title: 'No payouts awaiting confirmation', description: 'UTRs recorded by one finance user appear here for a second user to confirm.' },
  reversal: { title: 'No failure requests', description: 'Requests to fail a paid-out or unreconciled payout wait here for a second finance user.' },
};

type QuickValue = PayoutStatus | Queue;
const QUICK_STATUSES: PayoutStatus[] = ['queued', 'processing', 'processed', 'failed', 'reversed'];
const payoutTone = (s: PayoutStatus) => (s === 'needs_reconciliation' ? ('danger' as const) : statusTone(s, 'payout'));

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function baseColumns(): DataTableColumn<PayoutOut>[] {
  return [
    {
      key: 'payee',
      header: 'Payee',
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (p) => (
        <TextCell primary={<span className="font-medium">{p.payee_name ?? `${p.payee_id.slice(0, 8)}…`}</span>} secondary={PAYEE_TYPE_LABELS[p.payee_type]} />
      ),
      exportValue: (p) => p.payee_name ?? p.payee_id,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      sortable: true,
      sortKey: 'amount_minor',
      sortDescFirst: true,
      mobile: 'secondary',
      cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} className="font-semibold" />,
      exportValue: (p) => fromMinor(p.amount_minor, p.currency),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'badge',
      cell: (p) => (
        <span className="flex max-w-56 flex-col items-start gap-1">
          <StatusBadgeCell status={p.status} kind="payout" tone={payoutTone(p.status)} />
          {isPayoutAwaitingConfirmation(p) && <Badge tone="warning">Awaiting confirmation</Badge>}
          {isPayoutReversalPending(p) && <Badge tone="danger">{p.status === 'processed' ? 'Reversal pending' : 'Failure pending'}</Badge>}
          {p.failure_reason && (
            <span className="block max-w-full truncate text-xs text-danger-ink" title={p.failure_reason}>
              {p.failure_reason}
            </span>
          )}
        </span>
      ),
      mobileCell: (p) => <StatusBadgeCell status={p.status} kind="payout" tone={payoutTone(p.status)} />,
      exportValue: (p) => PAYOUT_STATUS_LABELS[p.status] ?? p.status,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (p) => <span className="whitespace-nowrap">{PAYOUT_METHOD_LABELS[p.method] ?? p.method}</span>,
      exportValue: (p) => PAYOUT_METHOD_LABELS[p.method] ?? p.method,
    },
    {
      key: 'ref',
      header: 'UTR / gateway ref',
      title: 'UTR / gateway reference',
      cell: (p) => <IdCell value={p.utr ?? p.gateway_payout_id} />,
      exportValue: (p) => p.utr ?? p.gateway_payout_id ?? '',
    },
    {
      key: 'batch',
      header: 'Batch',
      cell: (p) => (
        <Link to={financePath(`settlements/batches/${p.batch_id}`)} className="font-mono text-[13px] font-medium text-primary-ink hover:underline">
          {p.batch_number ?? 'View batch'}
        </Link>
      ),
      exportValue: (p) => p.batch_number ?? p.batch_id,
    },
    {
      key: 'created',
      header: 'Created',
      sortable: true,
      sortKey: 'created_at',
      sortDescFirst: true,
      cell: (p) => <DateCell value={p.created_at} display="relative" className="text-muted" />,
      mobileCell: (p) => formatDate(p.created_at),
      exportValue: (p) => p.created_at,
    },
    {
      key: 'processed',
      header: 'Processed',
      sortable: true,
      sortKey: 'processed_at',
      sortDescFirst: true,
      cell: (p) => <DateCell value={p.processed_at} display="datetime" />,
      exportValue: (p) => p.processed_at ?? '',
    },
  ];
}

const EXPORT_COLUMNS = baseColumns();

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function PayoutsPage() {
  useDocumentTitle('Payouts');
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: PayoutListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const { status: _s, awaiting_confirmation: _a, reversal_pending: _r, ...countFilters } = apiFilters;
  const [action, setAction] = useState<{ payout: PayoutOut; action: 'paid' | 'failed' } | null>(null);

  const list = useQuery({
    queryKey: financeKeys.payouts(listParams),
    queryFn: () => financeApi.listPayouts(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'payouts', 'status-counts', countFilters],
    queryFn: () => financeApi.payoutStatusCounts(countFilters),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<DataTableColumn<PayoutOut>[]>(
    () => [
      ...baseColumns(),
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        title: 'Actions',
        align: 'end',
        hideable: false,
        exportable: false,
        mobile: 'secondary',
        cell: (p) => <PayoutRowActions payout={p} onAction={(a) => setAction({ payout: p, action: a })} />,
      },
    ],
    [],
  );

  const c = counts.data;
  const n = (s: PayoutStatus) => (c ? (c.counts[s] ?? 0) : undefined);
  const statusOptions: FilterOption<PayoutStatus>[] = PAYOUT_STATUSES.map((s) => ({
    value: s,
    label: PAYOUT_STATUS_LABELS[s],
    tone: payoutTone(s),
    count: n(s),
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: 'All', count: c?.total },
    { value: 'reconcile', label: 'Needs reconciliation', count: n('needs_reconciliation'), tone: 'danger' },
    { value: 'confirm', label: 'Awaiting confirmation', count: c?.awaiting_confirmation ?? undefined, tone: 'warning' },
    { value: 'reversal', label: 'Reversal pending', count: c?.reversal_pending ?? undefined, tone: 'warning' },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: PAYOUT_STATUS_LABELS[s], count: n(s) })),
  ];
  const quickValue: QuickValue | '' | null = filters.queue
    ? filters.status.length === 0
      ? filters.queue
      : null
    : filters.status.length === 0
      ? ''
      : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!)
        ? filters.status[0]!
        : filters.status.length === 1 && filters.status[0] === 'needs_reconciliation'
          ? 'reconcile'
          : null;
  const queue = filters.queue || (quickValue === 'reconcile' ? 'reconcile' : '');
  const queueEmpty = queue ? QUEUE_EMPTY[queue] : null;

  return (
    <div>
      <PageHeader
        title="Payouts"
        description="Payouts created from processed batches. A manual bank transfer stays open until one finance user records the UTR and a different finance user confirms it."
      />
      <SettlementTabs />
      {queue === 'reconcile' && (
        <div className="mb-4">
          <Callout tone="warning" title="Resolve each payout by hand">
            The Razorpay Route call for these payouts timed out or returned an unclear answer, so the platform did not
            retry it (a retry could pay twice). Search the Razorpay dashboard for the payout id. If the transfer exists,
            use <strong>Record transfer</strong> with its <span className="font-mono">trf_…</span> id and have a second
            finance user confirm it. If it does not, use <strong>Request failure</strong> with the reference you checked;
            after a second finance user approves, the items return to eligible and are batched again.
          </Callout>
        </div>
      )}
      <DataTable
        id="admin.finance.payouts"
        caption="Payouts"
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle={queueEmpty?.title ?? 'No payouts yet'}
        emptyDescription={queueEmpty?.description ?? 'Payouts are created when an approved settlement batch is processed.'}
        filtersActive={queueEmpty && table.activeFilterCount === 1 ? false : undefined}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Payout status"
              items={quickItems}
              value={quickValue}
              onChange={(v) =>
                (QUEUES as readonly string[]).includes(v)
                  ? setFilters({ queue: v as Queue, status: [] })
                  : setFilters({ queue: '', status: v ? [v as PayoutStatus] : [] })
              }
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Payee, UTR or batch…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="payouts"
                columns={EXPORT_COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listPayouts({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
            more={
              <>
                <SelectFilter
                  label="Payee type"
                  icon={<Users className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.payee_type}
                  onChange={(v) => setFilters({ payee_type: v, payee: '' })}
                  options={PAYEE_TYPE_OPTIONS}
                />
                <AmountRangeFilter
                  label="Amount"
                  currency="INR"
                  value={{ min: filters.min, max: filters.max }}
                  onChange={({ min, max }) => setFilters({ min, max })}
                />
                <SelectFilter
                  label="Queue"
                  value={filters.queue}
                  onChange={(v) => setFilter('queue', v)}
                  options={[
                    { value: 'reconcile', label: 'Needs reconciliation', count: n('needs_reconciliation') },
                    { value: 'confirm', label: 'Awaiting UTR confirmation', count: c?.awaiting_confirmation ?? undefined },
                    { value: 'reversal', label: 'Failure / reversal pending', count: c?.reversal_pending ?? undefined },
                  ]}
                />
              </>
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <PayeeFilter value={filters.payee} onChange={(v) => setFilter('payee', v)} payeeType={filters.payee_type} />
            <MultiSelectFilter
              label="Method"
              icon={<Landmark className="size-3.5 opacity-70" aria-hidden />}
              value={filters.method}
              onChange={(v) => setFilter('method', v)}
              options={PAYOUT_METHODS.map((m) => ({ value: m, label: PAYOUT_METHOD_LABELS[m] }))}
            />
            <DateRangeFilter
              label="Date"
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: 'Created' },
                { value: 'processed', label: 'Processed' },
              ]}
              field={filters.date_field || 'created'}
              onFieldChange={(date_field) => setFilter('date_field', date_field)}
            />
          </FilterBar>
        }
      />
      <PayoutActionDialogs payout={action?.payout ?? null} action={action?.action ?? null} onClose={() => setAction(null)} />
    </div>
  );
}
