import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bot, Layers, Users } from 'lucide-react';
import {
  financeApi,
  PAYEE_TYPE_LABELS,
  SETTLEMENT_BATCH_STATUSES,
  SETTLEMENT_BATCH_STATUS_LABELS,
  type PayeeType,
  type SettlementBatchListParams,
  type SettlementBatchOut,
  type SettlementBatchStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, formatDate, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Badge,
  Button,
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
import { GenerateBatchDialog, PAYEE_TYPE_OPTIONS, SettlementTabs } from '../../components/settlements';
import { useFinancePermissions } from '../../lib/permissions';
import { listOrUndefined, minorOrUndefined } from '../../lib/tables';
import { financePath } from '../../paths';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const PAYEE_TYPES_FILTER = ['hospital', 'agent', 'vendor'] as const satisfies readonly PayeeType[];
const ORIGINS = ['auto', 'manual'] as const;

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(SETTLEMENT_BATCH_STATUSES),
  origin: filterParam.oneOf(ORIGINS),
  payee_type: filterParam.oneOf(PAYEE_TYPES_FILTER),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'batch_number', 'period_end', 'items_count', 'total_net_minor', 'status'] as const;

type BatchFilters = FilterValues<typeof FILTERS>;
type ApiFilters = Omit<SettlementBatchListParams, 'page' | 'page_size' | 'sort'>;

function toApiFilters(f: BatchFilters): ApiFilters {
  return {
    q: f.q.trim() || undefined,
    status: listOrUndefined(f.status),
    auto: f.origin === 'auto' ? true : f.origin === 'manual' ? false : undefined,
    payee_type: f.payee_type || undefined,
    created_from: f.from || undefined,
    created_to: f.to || undefined,
    min_net: minorOrUndefined(f.min),
    max_net: minorOrUndefined(f.max),
  };
}

/** A batch the daily settlement job generated (no human maker). */
const isAuto = (b: SettlementBatchOut) => !b.created_by;

type QuickValue = SettlementBatchStatus | 'auto_pending';
const AUTO_PENDING = 'auto_pending';
const QUICK_STATUSES: SettlementBatchStatus[] = ['pending_approval', 'approved', 'processing', 'completed', 'partially_failed', 'cancelled'];
const QUICK_LABEL: Partial<Record<SettlementBatchStatus, string>> = { pending_approval: 'Needs approval' };

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function scopeLabel(b: SettlementBatchOut): string {
  return `${PAYEE_TYPE_LABELS[b.payee_type]} · ${b.payee_id ? (b.payee_name ?? 'single payee') : 'all payees'}`;
}

const COLUMNS: DataTableColumn<SettlementBatchOut>[] = [
  {
    key: 'batch',
    header: 'Batch',
    sortable: true,
    sortKey: 'batch_number',
    sticky: true,
    mobile: 'primary',
    cell: (b) => <IdCell value={b.batch_number} secondary={scopeLabel(b)} />,
    exportValue: (b) => b.batch_number,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (b) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={b.status} kind="settlementBatch" />
        {isAuto(b) && (
          <Badge tone="info" icon={<Bot className="size-3" aria-hidden />}>
            {b.status === 'pending_approval' ? 'Auto · needs approval' : 'Automatic'}
          </Badge>
        )}
      </span>
    ),
    mobileCell: (b) => <StatusBadgeCell status={b.status} kind="settlementBatch" />,
    exportValue: (b) => SETTLEMENT_BATCH_STATUS_LABELS[b.status] ?? b.status,
  },
  {
    key: 'payees',
    header: 'Payees',
    title: 'Payees',
    defaultHidden: true,
    cell: (b) => <TextCell primary={b.payee_id ? (b.payee_name ?? 'Single payee') : 'All payees'} secondary={PAYEE_TYPE_LABELS[b.payee_type]} />,
    exportValue: (b) => (b.payee_id ? (b.payee_name ?? b.payee_id) : 'All payees'),
  },
  {
    key: 'period',
    header: 'Period end',
    sortable: true,
    sortKey: 'period_end',
    sortDescFirst: true,
    cell: (b) => <DateCell value={b.period_end} display="date" />,
    exportValue: (b) => b.period_end ?? '',
  },
  {
    key: 'items',
    header: 'Items',
    align: 'end',
    sortable: true,
    sortKey: 'items_count',
    sortDescFirst: true,
    cell: (b) => <span className="tabular-nums">{b.items_count}</span>,
    exportValue: (b) => b.items_count,
  },
  {
    key: 'gross',
    header: 'Gross',
    align: 'end',
    defaultHidden: true,
    cell: (b) => <MoneyCell minor={b.total_gross_minor} currency={b.currency} className="text-muted [&>span]:font-normal" />,
    exportValue: (b) => fromMinor(b.total_gross_minor, b.currency),
  },
  {
    key: 'commission',
    header: 'Commission',
    align: 'end',
    defaultHidden: true,
    cell: (b) => <MoneyCell minor={b.total_commission_minor} currency={b.currency} className="text-muted [&>span]:font-normal" />,
    exportValue: (b) => fromMinor(b.total_commission_minor, b.currency),
  },
  {
    key: 'net',
    header: 'Net payable',
    align: 'end',
    sortable: true,
    sortKey: 'total_net_minor',
    sortDescFirst: true,
    mobile: 'secondary',
    cell: (b) => <MoneyCell minor={b.total_net_minor} currency={b.currency} className="font-semibold" />,
    exportValue: (b) => fromMinor(b.total_net_minor, b.currency),
  },
  {
    key: 'maker',
    header: 'Maker · checker',
    title: 'Maker / checker',
    className: 'max-w-52',
    cell: (b) => (
      <TextCell
        primary={isAuto(b) ? 'Automatic (system)' : (b.created_by_name ?? '—')}
        secondary={b.approved_by_name ? `Approved by ${b.approved_by_name}` : 'Not approved yet'}
      />
    ),
    exportValue: (b) => `${isAuto(b) ? 'System' : (b.created_by_name ?? '')} / ${b.approved_by_name ?? ''}`,
  },
  {
    key: 'created',
    header: 'Created',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (b) => <DateCell value={b.created_at} display="relative" className="text-muted" />,
    mobileCell: (b) => formatDate(b.created_at),
    exportValue: (b) => b.created_at,
  },
];

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function BatchesPage() {
  useDocumentTitle('Settlement batches');
  const perms = useFinancePermissions();
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: SettlementBatchListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const { status: _status, ...countFilters } = apiFilters;
  const [generating, setGenerating] = useState(false);

  const list = useQuery({
    queryKey: financeKeys.batches(listParams),
    queryFn: () => financeApi.listBatches(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'batches', 'status-counts', countFilters],
    queryFn: () => financeApi.batchStatusCounts(countFilters),
    placeholderData: keepPreviousData,
  });

  const c = counts.data;
  const statusOptions: FilterOption<SettlementBatchStatus>[] = SETTLEMENT_BATCH_STATUSES.map((s) => ({
    value: s,
    label: SETTLEMENT_BATCH_STATUS_LABELS[s],
    tone: statusTone(s, 'settlementBatch'),
    count: c ? (c.counts[s] ?? 0) : undefined,
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: 'All', count: c?.total },
    ...QUICK_STATUSES.slice(0, 1).map((s) => ({ value: s, label: QUICK_LABEL[s] ?? s, count: c ? (c.counts[s] ?? 0) : undefined, tone: 'warning' as const })),
    { value: AUTO_PENDING, label: 'Auto · needs approval', count: c?.auto_pending_approval ?? undefined, tone: 'info' },
    ...QUICK_STATUSES.slice(1).map((s) => ({
      value: s,
      label: SETTLEMENT_BATCH_STATUS_LABELS[s],
      count: c ? (c.counts[s] ?? 0) : undefined,
      tone: s === 'partially_failed' ? ('danger' as const) : undefined,
    })),
  ];
  const single = filters.status.length === 1 ? filters.status[0]! : null;
  const quickValue: QuickValue | '' | null =
    filters.origin === 'auto' && single === 'pending_approval'
      ? AUTO_PENDING
      : filters.origin
        ? null
        : filters.status.length === 0
          ? ''
          : single && QUICK_STATUSES.includes(single)
            ? single
            : null;

  return (
    <div>
      <PageHeader
        title="Settlement batches"
        description="Batches move from pending approval to approved (by a different finance user), processing and completed. Automatic batches always need a human approver."
        actions={
          perms.finance && (
            <Button onClick={() => setGenerating(true)} leftIcon={<Layers className="size-4" aria-hidden />}>
              Generate batch
            </Button>
          )
        }
      />
      <SettlementTabs />
      <DataTable
        id="admin.finance.settlement-batches"
        caption="Settlement batches"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(b) => financePath(`settlements/batches/${b.id}`)}
        rowLabel={(b) => `Open batch ${b.batch_number}`}
        emptyTitle="No settlement batches yet"
        emptyDescription="Generate a batch from eligible settlement items, or wait for the daily automatic batch."
        emptyAction={
          perms.finance ? (
            <Button variant="outline" onClick={() => setGenerating(true)} leftIcon={<Layers className="size-4" aria-hidden />}>
              Generate batch
            </Button>
          ) : undefined
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Batch status"
              items={quickItems}
              value={quickValue}
              onChange={(v) =>
                v === AUTO_PENDING
                  ? setFilters({ status: ['pending_approval'], origin: 'auto' })
                  : setFilters({ status: v ? [v] : [], origin: '' })
              }
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Batch number or maker…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="settlement-batches"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listBatches({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
            more={
              <>
                <SelectFilter
                  label="Created by"
                  icon={<Bot className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.origin}
                  onChange={(v) => setFilter('origin', v)}
                  options={[
                    { value: 'auto', label: 'Automatic (daily job)' },
                    { value: 'manual', label: 'Finance user' },
                  ]}
                />
                <AmountRangeFilter
                  label="Net payable"
                  currency="INR"
                  value={{ min: filters.min, max: filters.max }}
                  onChange={({ min, max }) => setFilters({ min, max })}
                />
              </>
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label="Payee type"
              icon={<Users className="size-3.5 opacity-70" aria-hidden />}
              value={filters.payee_type}
              onChange={(v) => setFilter('payee_type', v)}
              options={PAYEE_TYPE_OPTIONS}
            />
            <DateRangeFilter label="Created" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <GenerateBatchDialog open={generating} onClose={() => setGenerating(false)} defaultPayeeType={filters.payee_type || undefined} />
    </div>
  );
}
