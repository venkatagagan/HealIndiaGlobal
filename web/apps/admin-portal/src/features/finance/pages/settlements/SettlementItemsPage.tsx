import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Layers, Lock, Unlock, Users } from 'lucide-react';
import {
  financeApi,
  PAYEE_TYPE_LABELS,
  SETTLEMENT_ITEM_STATUSES,
  SETTLEMENT_ITEM_STATUS_LABELS,
  type PayeeType,
  type SettlementItemListParams,
  type SettlementItemOut,
  type SettlementItemStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Button,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  exportCsv,
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
import { formatMoney } from '../../lib/shared';
import { financeKeys, useHoldItem, useReleaseItem } from '../../api/queries';
import { notifyError, notifySuccess, ReasonDialog } from '../../components/finance';
import {
  GenerateBatchDialog,
  PAYEE_TYPE_OPTIONS,
  PayeeFilter,
  payeeParams,
  SettlementTabs,
} from '../../components/settlements';
import { useFinancePermissions } from '../../lib/permissions';
import { listOrUndefined, minorOrUndefined, today } from '../../lib/tables';
import { financePath } from '../../paths';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const PAYEE_TYPES_FILTER = ['hospital', 'agent', 'vendor'] as const satisfies readonly PayeeType[];
const DATE_FIELDS = ['eligible', 'created'] as const;

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(SETTLEMENT_ITEM_STATUSES),
  payee_type: filterParam.oneOf(PAYEE_TYPES_FILTER),
  payee: filterParam.text(),
  date_field: filterParam.oneOf(DATE_FIELDS, 'eligible'),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'eligible_at', 'net_minor', 'gross_minor', 'status'] as const;

type ItemFilters = FilterValues<typeof FILTERS>;
type ApiFilters = Omit<SettlementItemListParams, 'page' | 'page_size' | 'sort'>;

function toApiFilters(f: ItemFilters): ApiFilters {
  const dateKey = f.date_field === 'created' ? 'created' : 'eligible';
  return {
    q: f.q.trim() || undefined,
    status: listOrUndefined(f.status),
    ...payeeParams(f.payee, f.payee_type),
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
    min_net: minorOrUndefined(f.min),
    max_net: minorOrUndefined(f.max),
  };
}

/** Tab labels: "reversed" items are clawbacks (refund after completion). */
const STATUS_LABEL: Record<SettlementItemStatus, string> = { ...SETTLEMENT_ITEM_STATUS_LABELS, reversed: 'Clawback / reversed' };
const QUICK_STATUSES: SettlementItemStatus[] = ['eligible', 'on_hold', 'pending', 'batched', 'paid', 'reversed'];

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const money = (minor: number, currency: string) => fromMinor(minor, currency);
const signed = (minor: number) => (minor < 0 ? 'text-danger-ink' : undefined);

function baseColumns(): DataTableColumn<SettlementItemOut>[] {
  return [
    {
      key: 'payee',
      header: 'Payee',
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (i) => (
        <TextCell
          primary={<span className="font-medium">{i.payee_name ?? `${i.payee_id.slice(0, 8)}…`}</span>}
          secondary={PAYEE_TYPE_LABELS[i.payee_type]}
        />
      ),
      exportValue: (i) => i.payee_name ?? i.payee_id,
    },
    {
      key: 'booking',
      header: 'Booking',
      mobile: 'secondary',
      cell: (i) => <IdCell value={i.booking_number ?? i.booking_id.slice(0, 8)} />,
      exportValue: (i) => i.booking_number ?? i.booking_id,
    },
    {
      key: 'gross',
      header: 'Gross',
      align: 'end',
      sortable: true,
      sortKey: 'gross_minor',
      sortDescFirst: true,
      cell: (i) => <MoneyCell minor={i.gross_minor} currency={i.currency} className={signed(i.gross_minor)} />,
      exportValue: (i) => money(i.gross_minor, i.currency),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'end',
      cell: (i) => <MoneyCell minor={i.commission_minor} currency={i.currency} className={cnMuted(signed(i.commission_minor))} />,
      exportValue: (i) => money(i.commission_minor, i.currency),
    },
    {
      key: 'tax',
      header: 'GST',
      align: 'end',
      defaultHidden: true,
      cell: (i) => <MoneyCell minor={i.tax_minor} currency={i.currency} className={cnMuted(signed(i.tax_minor))} />,
      exportValue: (i) => money(i.tax_minor, i.currency),
    },
    {
      key: 'tds',
      header: 'TDS',
      align: 'end',
      defaultHidden: true,
      cell: (i) => <MoneyCell minor={i.tds_minor} currency={i.currency} className={cnMuted(signed(i.tds_minor))} />,
      exportValue: (i) => money(i.tds_minor, i.currency),
    },
    {
      key: 'net',
      header: 'Net payable',
      align: 'end',
      sortable: true,
      sortKey: 'net_minor',
      sortDescFirst: true,
      mobile: 'secondary',
      cell: (i) => <MoneyCell minor={i.net_minor} currency={i.currency} className={`font-semibold ${signed(i.net_minor) ?? ''}`} />,
      exportValue: (i) => money(i.net_minor, i.currency),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'badge',
      cell: (i) => (
        <span className="flex max-w-52 flex-col items-start gap-0.5">
          <StatusBadgeCell status={i.status} kind="settlementItem" label={STATUS_LABEL[i.status]} />
          {i.hold_reason && i.status === 'on_hold' && (
            <span className="block max-w-full truncate text-xs text-muted" title={i.hold_reason}>
              {i.hold_reason}
            </span>
          )}
          {i.batch_id && (
            <Link to={financePath(`settlements/batches/${i.batch_id}`)} className="text-xs font-medium text-primary-ink hover:underline">
              View batch
            </Link>
          )}
        </span>
      ),
      mobileCell: (i) => <StatusBadgeCell status={i.status} kind="settlementItem" label={STATUS_LABEL[i.status]} />,
      exportValue: (i) => STATUS_LABEL[i.status] ?? i.status,
    },
    {
      key: 'eligible',
      header: 'Eligible from',
      title: 'Eligible from',
      sortable: true,
      sortKey: 'eligible_at',
      sortDescFirst: true,
      cell: (i) => <DateCell value={i.eligible_at} display="date" />,
      exportValue: (i) => i.eligible_at ?? '',
    },
    {
      key: 'batch',
      header: 'Batch',
      defaultHidden: true,
      cell: (i) =>
        i.batch_id ? (
          <Link
            to={financePath(`settlements/batches/${i.batch_id}`)}
            className="text-sm font-medium text-primary-ink hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View batch
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (i) => i.batch_id ?? '',
    },
    {
      key: 'created',
      header: 'Created',
      sortable: true,
      sortKey: 'created_at',
      sortDescFirst: true,
      defaultHidden: true,
      cell: (i) => <DateCell value={i.created_at} display="relative" className="text-muted" />,
      exportValue: (i) => i.created_at,
    },
  ];
}

function cnMuted(extra?: string) {
  return extra ? extra : 'text-muted [&>span]:font-normal';
}

const EXPORT_COLUMNS = baseColumns();

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function SettlementItemsPage() {
  useDocumentTitle('Settlement items');
  const perms = useFinancePermissions();
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: SettlementItemListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const { status: _ignored, ...countFilters } = apiFilters;

  const list = useQuery({
    queryKey: financeKeys.items(listParams),
    queryFn: () => financeApi.listItems(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'settlement-items', 'status-counts', countFilters],
    queryFn: () => financeApi.itemStatusCounts(countFilters),
    placeholderData: keepPreviousData,
  });

  const hold = useHoldItem();
  const release = useReleaseItem();
  const [holding, setHolding] = useState<SettlementItemOut | null>(null);
  const [releasing, setReleasing] = useState<SettlementItemOut | null>(null);
  const [generating, setGenerating] = useState(false);

  const columns = useMemo<DataTableColumn<SettlementItemOut>[]>(
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
        cell: (i) => {
          if (!perms.finance) return null;
          if (i.status === 'pending' || i.status === 'eligible')
            return (
              <Button size="xs" variant="outline" onClick={() => setHolding(i)} leftIcon={<Lock className="size-3.5" aria-hidden />}>
                Hold
              </Button>
            );
          if (i.status === 'on_hold')
            return (
              <Button size="xs" variant="outline" onClick={() => setReleasing(i)} leftIcon={<Unlock className="size-3.5" aria-hidden />}>
                Release
              </Button>
            );
          return null;
        },
      },
    ],
    [perms.finance],
  );

  const c = counts.data;
  const statusOptions: FilterOption<SettlementItemStatus>[] = SETTLEMENT_ITEM_STATUSES.map((s) => ({
    value: s,
    label: STATUS_LABEL[s],
    tone: statusTone(s, 'settlementItem'),
    count: c?.counts[s] ?? (c ? 0 : undefined),
  }));
  const quickItems: QuickFilterItem<SettlementItemStatus>[] = [
    { value: '', label: 'All', count: c?.total },
    ...QUICK_STATUSES.map((s) => ({
      value: s,
      label: STATUS_LABEL[s],
      count: c ? (c.counts[s] ?? 0) : undefined,
      tone: s === 'on_hold' ? ('warning' as const) : s === 'reversed' ? ('danger' as const) : undefined,
    })),
  ];
  const quickValue =
    filters.status.length === 0 ? '' : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!) ? filters.status[0]! : null;

  const rows = list.data?.items;
  const pageTotals = rows?.length
    ? rows.reduce(
        (acc, i) => ({ gross: acc.gross + i.gross_minor, commission: acc.commission + i.commission_minor, net: acc.net + i.net_minor }),
        { gross: 0, commission: 0, net: 0 },
      )
    : null;
  const currency = rows?.[0]?.currency ?? 'INR';

  return (
    <div>
      <PageHeader
        title="Settlement items"
        description="Hospital net and agent commission per completed booking. Items become eligible after the hold period and are paid out in approved batches."
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
        id="admin.finance.settlement-items"
        caption="Settlement items"
        table={table}
        columns={columns}
        rows={rows}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        selectable
        bulkActions={(selected, clear) => (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              exportCsv(selected, EXPORT_COLUMNS, `settlement-items-selected-${today()}`);
              clear();
            }}
          >
            Export selected
          </Button>
        )}
        emptyTitle="No settlement items yet"
        emptyDescription="Items are created when bookings complete: the hospital's net amount and the agent's commission."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Item status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Payee or booking number…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="settlement-items"
                columns={EXPORT_COLUMNS}
                rows={rows}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listItems({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
            more={
              <SelectFilter
                label="Payee type"
                icon={<Users className="size-3.5 opacity-70" aria-hidden />}
                value={filters.payee_type}
                onChange={(v) => setFilters({ payee_type: v, payee: '' })}
                options={PAYEE_TYPE_OPTIONS}
              />
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <PayeeFilter value={filters.payee} onChange={(v) => setFilter('payee', v)} payeeType={filters.payee_type} />
            <AmountRangeFilter
              label="Net amount"
              currency="INR"
              value={{ min: filters.min, max: filters.max }}
              onChange={({ min, max }) => setFilters({ min, max })}
            />
            <DateRangeFilter
              label="Date"
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'eligible', label: 'Eligible (hold ends)' },
                { value: 'created', label: 'Created' },
              ]}
              field={filters.date_field || 'eligible'}
              onFieldChange={(date_field) => setFilter('date_field', date_field)}
            />
          </FilterBar>
        }
      />
      {pageTotals && (
        <p className="mt-2 flex flex-wrap justify-end gap-x-4 gap-y-1 px-1 text-xs text-muted tabular-nums">
          <span>This page:</span>
          <span>Gross {formatMoney(pageTotals.gross, currency)}</span>
          <span>Commission {formatMoney(pageTotals.commission, currency)}</span>
          <span className="font-semibold text-fg">Net {formatMoney(pageTotals.net, currency)}</span>
        </p>
      )}

      <ReasonDialog
        open={holding !== null}
        title="Put item on hold"
        description={holding ? `${holding.payee_name ?? 'Payee'} · net ${formatMoney(holding.net_minor, holding.currency)}` : undefined}
        confirmLabel="Hold item"
        loading={hold.isPending}
        onClose={() => setHolding(null)}
        onConfirm={(reason) =>
          holding &&
          hold.mutate(
            { id: holding.id, reason },
            {
              onSuccess: () => {
                notifySuccess('Item placed on hold; it will be skipped by batches until released');
                setHolding(null);
              },
              onError: (e) => notifyError(e, 'Could not hold the item'),
            },
          )
        }
      />
      <ReasonDialog
        open={releasing !== null}
        title="Release hold"
        description={releasing?.hold_reason ? `Held because: ${releasing.hold_reason}` : undefined}
        label="Note"
        required={false}
        confirmLabel="Release"
        confirmVariant="primary"
        loading={release.isPending}
        onClose={() => setReleasing(null)}
        onConfirm={(reason) =>
          releasing &&
          release.mutate(
            { id: releasing.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess('Hold released');
                setReleasing(null);
              },
              onError: (e) => notifyError(e, 'Could not release the item'),
            },
          )
        }
      />
      <GenerateBatchDialog open={generating} onClose={() => setGenerating(false)} defaultPayeeType={filters.payee_type || undefined} />
    </div>
  );
}
