import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Layers, Lock, Unlock, Users } from 'lucide-react';
import {
  financeApi,
  SETTLEMENT_ITEM_STATUSES,
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
import { enumLabel, ft, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
import { financeKeys, useHoldItem, useReleaseItem } from '../../api/queries';
import { notifyError, notifySuccess, ReasonDialog } from '../../components/finance';
import {
  GenerateBatchDialog,
  payeeTypeOptions,
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
const statusLabel = (s: SettlementItemStatus) => (s === 'reversed' ? ft('settlementItems.reversedLabel') : enumLabel('status', s));
const QUICK_STATUSES: SettlementItemStatus[] = ['eligible', 'on_hold', 'pending', 'batched', 'paid', 'reversed'];

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const money = (minor: number, currency: string) => fromMinor(minor, currency);
const signed = (minor: number) => (minor < 0 ? 'text-danger-ink' : undefined);

function baseColumns(t: FinanceT): DataTableColumn<SettlementItemOut>[] {
  return [
    {
      key: 'payee',
      header: t('settlementUi.payee'),
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (i) => (
        <TextCell
          primary={<span className="font-medium">{i.payee_name ?? `${i.payee_id.slice(0, 8)}…`}</span>}
          secondary={enumLabel('payeeType', i.payee_type)}
        />
      ),
      exportValue: (i) => i.payee_name ?? i.payee_id,
    },
    {
      key: 'booking',
      header: t('orders.columns.booking'),
      mobile: 'secondary',
      cell: (i) => <IdCell value={i.booking_number ?? i.booking_id.slice(0, 8)} />,
      exportValue: (i) => i.booking_number ?? i.booking_id,
    },
    {
      key: 'gross',
      header: t('batches.columns.gross'),
      align: 'end',
      sortable: true,
      sortKey: 'gross_minor',
      sortDescFirst: true,
      cell: (i) => <MoneyCell minor={i.gross_minor} currency={i.currency} className={signed(i.gross_minor)} />,
      exportValue: (i) => money(i.gross_minor, i.currency),
    },
    {
      key: 'commission',
      header: t('reports.commission'),
      align: 'end',
      cell: (i) => <MoneyCell minor={i.commission_minor} currency={i.currency} className={cnMuted(signed(i.commission_minor))} />,
      exportValue: (i) => money(i.commission_minor, i.currency),
    },
    {
      key: 'tax',
      header: t('batchDetail.gst'),
      align: 'end',
      defaultHidden: true,
      cell: (i) => <MoneyCell minor={i.tax_minor} currency={i.currency} className={cnMuted(signed(i.tax_minor))} />,
      exportValue: (i) => money(i.tax_minor, i.currency),
    },
    {
      key: 'tds',
      header: t('batchDetail.tds'),
      align: 'end',
      defaultHidden: true,
      cell: (i) => <MoneyCell minor={i.tds_minor} currency={i.currency} className={cnMuted(signed(i.tds_minor))} />,
      exportValue: (i) => money(i.tds_minor, i.currency),
    },
    {
      key: 'net',
      header: t('batches.columns.netPayable'),
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
      header: t('orders.columns.status'),
      sortable: true,
      mobile: 'badge',
      cell: (i) => (
        <span className="flex max-w-52 flex-col items-start gap-0.5">
          <StatusBadgeCell status={i.status} kind="settlementItem" label={statusLabel(i.status)} />
          {i.hold_reason && i.status === 'on_hold' && (
            <span className="block max-w-full truncate text-xs text-muted" title={i.hold_reason}>
              {i.hold_reason}
            </span>
          )}
          {i.batch_id && (
            <Link to={financePath(`settlements/batches/${i.batch_id}`)} className="text-xs font-medium text-primary-ink hover:underline">
              {t('payouts.viewBatch')}
            </Link>
          )}
        </span>
      ),
      mobileCell: (i) => <StatusBadgeCell status={i.status} kind="settlementItem" label={statusLabel(i.status)} />,
      exportValue: (i) => statusLabel(i.status),
    },
    {
      key: 'eligible',
      header: t('settlementItems.eligibleFrom'),
      title: t('settlementItems.eligibleFrom'),
      sortable: true,
      sortKey: 'eligible_at',
      sortDescFirst: true,
      cell: (i) => <DateCell value={i.eligible_at} display="date" />,
      exportValue: (i) => i.eligible_at ?? '',
    },
    {
      key: 'batch',
      header: t('batches.columns.batch'),
      defaultHidden: true,
      cell: (i) =>
        i.batch_id ? (
          <Link
            to={financePath(`settlements/batches/${i.batch_id}`)}
            className="text-sm font-medium text-primary-ink hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {t('payouts.viewBatch')}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (i) => i.batch_id ?? '',
    },
    {
      key: 'created',
      header: t('orders.columns.created'),
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

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function SettlementItemsPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('nav.items.settlementItems'));
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

  const exportColumns = useMemo(() => baseColumns(t), [t]);
  const columns = useMemo<DataTableColumn<SettlementItemOut>[]>(
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
        cell: (i) => {
          if (!perms.finance) return null;
          if (i.status === 'pending' || i.status === 'eligible')
            return (
              <Button size="xs" variant="outline" onClick={() => setHolding(i)} leftIcon={<Lock className="size-3.5" aria-hidden />}>
                {t('settlementItems.hold')}
              </Button>
            );
          if (i.status === 'on_hold')
            return (
              <Button size="xs" variant="outline" onClick={() => setReleasing(i)} leftIcon={<Unlock className="size-3.5" aria-hidden />}>
                {t('settlementItems.release')}
              </Button>
            );
          return null;
        },
      },
    ],
    [exportColumns, perms.finance, t],
  );

  const c = counts.data;
  const statusOptions: FilterOption<SettlementItemStatus>[] = SETTLEMENT_ITEM_STATUSES.map((s) => ({
    value: s,
    label: statusLabel(s),
    tone: statusTone(s, 'settlementItem'),
    count: c?.counts[s] ?? (c ? 0 : undefined),
  }));
  const quickItems: QuickFilterItem<SettlementItemStatus>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    ...QUICK_STATUSES.map((s) => ({
      value: s,
      label: statusLabel(s),
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
        title={t('nav.items.settlementItems')}
        description={t('settlementItems.description')}
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
        id="admin.finance.settlement-items"
        caption={t('nav.items.settlementItems')}
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
              exportCsv(selected, exportColumns, `settlement-items-selected-${today()}`);
              clear();
            }}
          >
            {t('settlementItems.exportSelected')}
          </Button>
        )}
        emptyTitle={t('settlementItems.emptyTitle')}
        emptyDescription={t('settlementItems.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('settlementItems.statusLabel')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('settlementItems.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="settlement-items"
                columns={exportColumns}
                rows={rows}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listItems({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
            more={
              <SelectFilter
                label={t('settlementUi.payeeType')}
                icon={<Users className="size-3.5 opacity-70" aria-hidden />}
                value={filters.payee_type}
                onChange={(v) => setFilters({ payee_type: v, payee: '' })}
                options={payeeTypeOptions()}
              />
            }
          >
            <MultiSelectFilter label={t('orders.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <PayeeFilter value={filters.payee} onChange={(v) => setFilter('payee', v)} payeeType={filters.payee_type} />
            <AmountRangeFilter
              label={t('settlementItems.netAmount')}
              currency="INR"
              value={{ min: filters.min, max: filters.max }}
              onChange={({ min, max }) => setFilters({ min, max })}
            />
            <DateRangeFilter
              label={t('orders.filters.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'eligible', label: t('settlementItems.eligibleHoldEnds') },
                { value: 'created', label: t('orders.columns.created') },
              ]}
              field={filters.date_field || 'eligible'}
              onFieldChange={(date_field) => setFilter('date_field', date_field)}
            />
          </FilterBar>
        }
      />
      {pageTotals && (
        <p className="mt-2 flex flex-wrap justify-end gap-x-4 gap-y-1 px-1 text-xs text-muted tabular-nums">
          <span>{t('settlementItems.thisPage')}</span>
          <span>{t('settlementItems.pageGross', { amount: formatMoney(pageTotals.gross, currency) })}</span>
          <span>{t('settlementItems.pageCommission', { amount: formatMoney(pageTotals.commission, currency) })}</span>
          <span className="font-semibold text-fg">{t('settlementItems.pageNet', { amount: formatMoney(pageTotals.net, currency) })}</span>
        </p>
      )}

      <ReasonDialog
        open={holding !== null}
        title={t('settlementItems.holdTitle')}
        description={
          holding
            ? t('settlementItems.holdDescription', {
                payee: holding.payee_name ?? t('reviews.payeeFallback'),
                amount: formatMoney(holding.net_minor, holding.currency),
              })
            : undefined
        }
        confirmLabel={t('settlementItems.holdConfirm')}
        loading={hold.isPending}
        onClose={() => setHolding(null)}
        onConfirm={(reason) =>
          holding &&
          hold.mutate(
            { id: holding.id, reason },
            {
              onSuccess: () => {
                notifySuccess(ft('settlementItems.held'));
                setHolding(null);
              },
              onError: (e) => notifyError(e, ft('settlementItems.holdFailed')),
            },
          )
        }
      />
      <ReasonDialog
        open={releasing !== null}
        title={t('settlementItems.releaseTitle')}
        description={releasing?.hold_reason ? t('settlementItems.heldBecause', { reason: releasing.hold_reason }) : undefined}
        label={t('settlementItems.note')}
        required={false}
        confirmLabel={t('settlementItems.release')}
        confirmVariant="primary"
        loading={release.isPending}
        onClose={() => setReleasing(null)}
        onConfirm={(reason) =>
          releasing &&
          release.mutate(
            { id: releasing.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess(ft('settlementItems.released'));
                setReleasing(null);
              },
              onError: (e) => notifyError(e, ft('settlementItems.releaseFailed')),
            },
          )
        }
      />
      <GenerateBatchDialog open={generating} onClose={() => setGenerating(false)} defaultPayeeType={filters.payee_type || undefined} />
    </div>
  );
}
