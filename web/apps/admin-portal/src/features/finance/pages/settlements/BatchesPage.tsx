import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bot, Layers, Users } from 'lucide-react';
import {
  financeApi,
  SETTLEMENT_BATCH_STATUSES,
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
import { enumLabel, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
import { financeKeys } from '../../api/queries';
import { GenerateBatchDialog, payeeTypeOptions, SettlementTabs } from '../../components/settlements';
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

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function scopeLabel(t: FinanceT, b: SettlementBatchOut): string {
  return `${enumLabel('payeeType', b.payee_type)} · ${b.payee_id ? (b.payee_name ?? t('batches.singlePayeeLower')) : t('batches.allPayeesLower')}`;
}

const batchColumns = (t: FinanceT): DataTableColumn<SettlementBatchOut>[] => [
  {
    key: 'batch',
    header: t('batches.columns.batch'),
    sortable: true,
    sortKey: 'batch_number',
    sticky: true,
    mobile: 'primary',
    cell: (b) => <IdCell value={b.batch_number} secondary={scopeLabel(t, b)} />,
    exportValue: (b) => b.batch_number,
  },
  {
    key: 'status',
    header: t('orders.columns.status'),
    sortable: true,
    mobile: 'badge',
    cell: (b) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={b.status} kind="settlementBatch" />
        {isAuto(b) && (
          <Badge tone="info" icon={<Bot className="size-3" aria-hidden />}>
            {b.status === 'pending_approval' ? t('batches.autoNeedsApproval') : t('batches.automatic')}
          </Badge>
        )}
      </span>
    ),
    mobileCell: (b) => <StatusBadgeCell status={b.status} kind="settlementBatch" />,
    exportValue: (b) => enumLabel('status', b.status),
  },
  {
    key: 'payees',
    header: t('batches.columns.payees'),
    title: t('batches.columns.payees'),
    defaultHidden: true,
    cell: (b) => (
      <TextCell
        primary={b.payee_id ? (b.payee_name ?? t('batches.singlePayee')) : t('settlementUi.picker.allPayees')}
        secondary={enumLabel('payeeType', b.payee_type)}
      />
    ),
    exportValue: (b) => (b.payee_id ? (b.payee_name ?? b.payee_id) : t('settlementUi.picker.allPayees')),
  },
  {
    key: 'period',
    header: t('settlementUi.generate.periodEnd'),
    sortable: true,
    sortKey: 'period_end',
    sortDescFirst: true,
    cell: (b) => <DateCell value={b.period_end} display="date" />,
    exportValue: (b) => b.period_end ?? '',
  },
  {
    key: 'items',
    header: t('settlementUi.tabs.items'),
    align: 'end',
    sortable: true,
    sortKey: 'items_count',
    sortDescFirst: true,
    cell: (b) => <span className="tabular-nums">{b.items_count}</span>,
    exportValue: (b) => b.items_count,
  },
  {
    key: 'gross',
    header: t('batches.columns.gross'),
    align: 'end',
    defaultHidden: true,
    cell: (b) => <MoneyCell minor={b.total_gross_minor} currency={b.currency} className="text-muted [&>span]:font-normal" />,
    exportValue: (b) => fromMinor(b.total_gross_minor, b.currency),
  },
  {
    key: 'commission',
    header: t('reports.commission'),
    align: 'end',
    defaultHidden: true,
    cell: (b) => <MoneyCell minor={b.total_commission_minor} currency={b.currency} className="text-muted [&>span]:font-normal" />,
    exportValue: (b) => fromMinor(b.total_commission_minor, b.currency),
  },
  {
    key: 'net',
    header: t('batches.columns.netPayable'),
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
    header: t('batches.columns.makerChecker'),
    title: t('batches.columns.makerCheckerTitle'),
    className: 'max-w-52',
    cell: (b) => (
      <TextCell
        primary={isAuto(b) ? t('batches.automaticSystem') : (b.created_by_name ?? '—')}
        secondary={b.approved_by_name ? t('batches.approvedBy', { name: b.approved_by_name }) : t('batches.notApproved')}
      />
    ),
    exportValue: (b) => `${isAuto(b) ? t('batches.system') : (b.created_by_name ?? '')} / ${b.approved_by_name ?? ''}`,
  },
  {
    key: 'created',
    header: t('orders.columns.created'),
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
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('batches.title'));
  const columns = useMemo(() => batchColumns(t), [t]);
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
    label: enumLabel('status', s),
    tone: statusTone(s, 'settlementBatch'),
    count: c ? (c.counts[s] ?? 0) : undefined,
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    ...QUICK_STATUSES.slice(0, 1).map((s) => ({ value: s, label: t('batches.needsApproval'), count: c ? (c.counts[s] ?? 0) : undefined, tone: 'warning' as const })),
    { value: AUTO_PENDING, label: t('batches.autoNeedsApproval'), count: c?.auto_pending_approval ?? undefined, tone: 'info' },
    ...QUICK_STATUSES.slice(1).map((s) => ({
      value: s,
      label: enumLabel('status', s),
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
        title={t('batches.title')}
        description={t('batches.description')}
        actions={
          perms.finance && (
            <Button onClick={() => setGenerating(true)} leftIcon={<Layers className="size-4" aria-hidden />}>
              {t('settlementUi.generate.submit')}
            </Button>
          )
        }
      />
      <SettlementTabs />
      <DataTable
        id="admin.finance.settlement-batches"
        caption={t('batches.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(b) => financePath(`settlements/batches/${b.id}`)}
        rowLabel={(b) => t('batches.openBatch', { number: b.batch_number })}
        emptyTitle={t('batches.emptyTitle')}
        emptyDescription={t('batches.emptyDescription')}
        emptyAction={
          perms.finance ? (
            <Button variant="outline" onClick={() => setGenerating(true)} leftIcon={<Layers className="size-4" aria-hidden />}>
              {t('settlementUi.generate.submit')}
            </Button>
          ) : undefined
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('batches.statusLabel')}
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
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('batches.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="settlement-batches"
                columns={columns}
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
                  label={t('batches.createdBy')}
                  icon={<Bot className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.origin}
                  onChange={(v) => setFilter('origin', v)}
                  options={[
                    { value: 'auto', label: t('batches.originAuto') },
                    { value: 'manual', label: t('batches.originManual') },
                  ]}
                />
                <AmountRangeFilter
                  label={t('batches.columns.netPayable')}
                  currency="INR"
                  value={{ min: filters.min, max: filters.max }}
                  onChange={({ min, max }) => setFilters({ min, max })}
                />
              </>
            }
          >
            <MultiSelectFilter label={t('orders.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label={t('settlementUi.payeeType')}
              icon={<Users className="size-3.5 opacity-70" aria-hidden />}
              value={filters.payee_type}
              onChange={(v) => setFilter('payee_type', v)}
              options={payeeTypeOptions()}
            />
            <DateRangeFilter label={t('orders.columns.created')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <GenerateBatchDialog open={generating} onClose={() => setGenerating(false)} defaultPayeeType={filters.payee_type || undefined} />
    </div>
  );
}
