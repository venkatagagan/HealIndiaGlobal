import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Trans } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Landmark, Users } from 'lucide-react';
import {
  financeApi,
  PAYOUT_METHODS,
  PAYOUT_STATUSES,
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
import { enumLabel, enumOptions, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
import { financeKeys } from '../../api/queries';
import { Callout } from '../../components/ui';
import { isPayoutAwaitingConfirmation, isPayoutReversalPending } from '../../components/reviews';
import {
  payeeTypeOptions,
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
/** Catalog: payouts.queues.<queue>.{emptyTitle,emptyDescription} */
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

type QuickValue = PayoutStatus | Queue;
const QUICK_STATUSES: PayoutStatus[] = ['queued', 'processing', 'processed', 'failed', 'reversed'];
const payoutTone = (s: PayoutStatus) => (s === 'needs_reconciliation' ? ('danger' as const) : statusTone(s, 'payout'));

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function baseColumns(t: FinanceT): DataTableColumn<PayoutOut>[] {
  return [
    {
      key: 'payee',
      header: t('settlementUi.payee'),
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (p) => (
        <TextCell primary={<span className="font-medium">{p.payee_name ?? `${p.payee_id.slice(0, 8)}…`}</span>} secondary={enumLabel('payeeType', p.payee_type)} />
      ),
      exportValue: (p) => p.payee_name ?? p.payee_id,
    },
    {
      key: 'amount',
      header: t('orders.columns.amount'),
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
      header: t('orders.columns.status'),
      sortable: true,
      mobile: 'badge',
      cell: (p) => (
        <span className="flex max-w-56 flex-col items-start gap-1">
          <StatusBadgeCell status={p.status} kind="payout" tone={payoutTone(p.status)} />
          {isPayoutAwaitingConfirmation(p) && <Badge tone="warning">{t('payouts.awaitingConfirmation')}</Badge>}
          {isPayoutReversalPending(p) && (
            <Badge tone="danger">{p.status === 'processed' ? t('payouts.reversalPending') : t('payouts.failurePending')}</Badge>
          )}
          {p.failure_reason && (
            <span className="block max-w-full truncate text-xs text-danger-ink" title={p.failure_reason}>
              {p.failure_reason}
            </span>
          )}
        </span>
      ),
      mobileCell: (p) => <StatusBadgeCell status={p.status} kind="payout" tone={payoutTone(p.status)} />,
      exportValue: (p) => enumLabel('status', p.status),
    },
    {
      key: 'method',
      header: t('orders.columns.method'),
      cell: (p) => <span className="whitespace-nowrap">{enumLabel('payoutMethod', p.method)}</span>,
      exportValue: (p) => enumLabel('payoutMethod', p.method),
    },
    {
      key: 'ref',
      header: t('batchDetail.utrRef'),
      title: t('payouts.utrReference'),
      cell: (p) => <IdCell value={p.utr ?? p.gateway_payout_id} />,
      exportValue: (p) => p.utr ?? p.gateway_payout_id ?? '',
    },
    {
      key: 'batch',
      header: t('batches.columns.batch'),
      cell: (p) => (
        <Link to={financePath(`settlements/batches/${p.batch_id}`)} className="font-mono text-[13px] font-medium text-primary-ink hover:underline">
          {p.batch_number ?? t('payouts.viewBatch')}
        </Link>
      ),
      exportValue: (p) => p.batch_number ?? p.batch_id,
    },
    {
      key: 'created',
      header: t('orders.columns.created'),
      sortable: true,
      sortKey: 'created_at',
      sortDescFirst: true,
      cell: (p) => <DateCell value={p.created_at} display="relative" className="text-muted" />,
      mobileCell: (p) => formatDate(p.created_at),
      exportValue: (p) => p.created_at,
    },
    {
      key: 'processed',
      header: t('orderDetail.refunds.processed'),
      sortable: true,
      sortKey: 'processed_at',
      sortDescFirst: true,
      cell: (p) => <DateCell value={p.processed_at} display="datetime" />,
      exportValue: (p) => p.processed_at ?? '',
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function PayoutsPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('settlementUi.tabs.payouts'));
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

  const exportColumns = useMemo(() => baseColumns(t), [t]);
  const columns = useMemo<DataTableColumn<PayoutOut>[]>(
    () => [
      ...exportColumns,
      {
        key: 'actions',
        header: <span className="sr-only">{t('orderDetail.actions')}</span>,
        title: t('orderDetail.actions'),
        align: 'end',
        hideable: false,
        exportable: false,
        mobile: 'secondary',
        cell: (p) => <PayoutRowActions payout={p} onAction={(a) => setAction({ payout: p, action: a })} />,
      },
    ],
    [exportColumns, t],
  );

  const c = counts.data;
  const n = (s: PayoutStatus) => (c ? (c.counts[s] ?? 0) : undefined);
  const statusOptions: FilterOption<PayoutStatus>[] = PAYOUT_STATUSES.map((s) => ({
    value: s,
    label: enumLabel('status', s),
    tone: payoutTone(s),
    count: n(s),
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    { value: 'reconcile', label: enumLabel('status', 'needs_reconciliation'), count: n('needs_reconciliation'), tone: 'danger' },
    { value: 'confirm', label: t('payouts.awaitingConfirmation'), count: c?.awaiting_confirmation ?? undefined, tone: 'warning' },
    { value: 'reversal', label: t('payouts.reversalPending'), count: c?.reversal_pending ?? undefined, tone: 'warning' },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: enumLabel('status', s), count: n(s) })),
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

  return (
    <div>
      <PageHeader title={t('settlementUi.tabs.payouts')} description={t('payouts.description')} />
      <SettlementTabs />
      {queue === 'reconcile' && (
        <div className="mb-4">
          <Callout tone="warning" title={t('payouts.reconcileTitle')}>
            <Trans
              t={t}
              i18nKey="payouts.reconcileBody"
              components={{ 0: <strong />, 1: <span className="font-mono" />, 2: <strong /> }}
            />
          </Callout>
        </div>
      )}
      <DataTable
        id="admin.finance.payouts"
        caption={t('settlementUi.tabs.payouts')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle={queue ? t(`payouts.queues.${queue}.emptyTitle`) : t('batchDetail.noPayouts')}
        emptyDescription={queue ? t(`payouts.queues.${queue}.emptyDescription`) : t('payouts.emptyDescription')}
        filtersActive={queue && table.activeFilterCount === 1 ? false : undefined}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('payouts.statusLabel')}
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
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('payouts.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="payouts"
                columns={exportColumns}
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
                  label={t('settlementUi.payeeType')}
                  icon={<Users className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.payee_type}
                  onChange={(v) => setFilters({ payee_type: v, payee: '' })}
                  options={payeeTypeOptions()}
                />
                <AmountRangeFilter
                  label={t('orders.columns.amount')}
                  currency="INR"
                  value={{ min: filters.min, max: filters.max }}
                  onChange={({ min, max }) => setFilters({ min, max })}
                />
                <SelectFilter
                  label={t('payouts.queue')}
                  value={filters.queue}
                  onChange={(v) => setFilter('queue', v)}
                  options={[
                    { value: 'reconcile', label: enumLabel('status', 'needs_reconciliation'), count: n('needs_reconciliation') },
                    { value: 'confirm', label: t('payouts.awaitingUtrConfirmation'), count: c?.awaiting_confirmation ?? undefined },
                    { value: 'reversal', label: t('payouts.failureReversalPending'), count: c?.reversal_pending ?? undefined },
                  ]}
                />
              </>
            }
          >
            <MultiSelectFilter label={t('orders.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <PayeeFilter value={filters.payee} onChange={(v) => setFilter('payee', v)} payeeType={filters.payee_type} />
            <MultiSelectFilter
              label={t('orders.columns.method')}
              icon={<Landmark className="size-3.5 opacity-70" aria-hidden />}
              value={filters.method}
              onChange={(v) => setFilter('method', v)}
              options={enumOptions('payoutMethod', PAYOUT_METHODS)}
            />
            <DateRangeFilter
              label={t('orders.filters.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: t('orders.columns.created') },
                { value: 'processed', label: t('orderDetail.refunds.processed') },
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
