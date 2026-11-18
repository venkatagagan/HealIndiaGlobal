import { useMemo, useState } from 'react';
import { Trans } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import {
  REFUND_STATUSES,
  paymentsApi,
  type RefundListParams,
  type RefundOut,
  type RefundStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
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
  PersonCell,
  QuickFilters,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatMoney } from '../lib/shared';
import { enumLabel, ft, useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { financeKeys, useApproveRefund, useRejectRefund } from '../api/queries';
import { notifyError, notifySuccess, ReasonDialog } from '../components/finance';
import { RefundDialog } from '../components/RefundDialog';
import { needsSecondRefundApprover, notifyApprovalError, RefundThresholdNote, useRefundDualApprovalThreshold } from '../components/reviews';
import { useFinancePermissions, type FinancePermissions } from '../lib/permissions';
import { Button as FinanceButton, Modal } from '../components/ui';
import { listOrUndefined, minorOrUndefined } from '../lib/tables';
import { financePath } from '../paths';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(REFUND_STATUSES),
  second: filterParam.boolean(),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'processed_at', 'base_amount_minor', 'status'] as const;

function toApiFilters(f: FilterValues<typeof FILTERS>): Omit<RefundListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    status: listOrUndefined(f.status),
    awaiting_second_approval: f.second || undefined,
    created_from: f.from || undefined,
    created_to: f.to || undefined,
    min_amount: minorOrUndefined(f.min),
    max_amount: minorOrUndefined(f.max),
  };
}

type QuickValue = RefundStatus | 'second';
const SECOND_TAB = 'second';
const QUICK_STATUSES: RefundStatus[] = ['requested', 'approved', 'processing', 'processed', 'failed', 'rejected'];

// ---------------------------------------------------------------------------------------------------------
// Columns (actions need the signed-in user, so they are built per render)
// ---------------------------------------------------------------------------------------------------------
const baseColumns = (t: FinanceT): DataTableColumn<RefundOut>[] => [
  {
    key: 'order',
    header: t('orders.columns.order'),
    sticky: true,
    mobile: 'secondary',
    cell: (r) => <IdCell value={r.order_number ?? r.order_id.slice(0, 8)} secondary={r.gateway_refund_id ?? undefined} />,
    exportValue: (r) => r.order_number ?? r.order_id,
  },
  {
    key: 'patient',
    header: t('orders.columns.patient'),
    mobile: 'primary',
    className: 'max-w-52',
    cell: (r) => <PersonCell name={r.patient_name ?? t('refunds.unknownPatient')} secondary={r.reason ?? undefined} />,
    exportValue: (r) => r.patient_name ?? '',
  },
  {
    key: 'amount',
    header: t('orders.columns.amount'),
    align: 'end',
    sortable: true,
    sortKey: 'base_amount_minor',
    sortDescFirst: true,
    cell: (r) => (
      <MoneyCell
        minor={r.amount_minor}
        currency={r.currency}
        secondary={r.currency !== 'INR' ? <MoneyCell minor={r.base_amount_minor} currency="INR" className="font-normal" /> : undefined}
      />
    ),
    exportValue: (r) => `${r.currency} ${fromMinor(r.amount_minor, r.currency)}`,
  },
  {
    key: 'status',
    header: t('orders.columns.status'),
    sortable: true,
    mobile: 'badge',
    cell: (r) => <StatusBadgeCell status={r.status} kind="refund" />,
    exportValue: (r) => enumLabel('status', r.status),
  },
  {
    key: 'reason',
    header: t('common.reason'),
    defaultHidden: true,
    className: 'max-w-64',
    cell: (r) => <span className="line-clamp-2">{r.reason ?? '—'}</span>,
    exportValue: (r) => r.reason ?? '',
  },
  {
    key: 'requested',
    header: t('orderDetail.refunds.requested'),
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (r) => <DateCell value={r.created_at} display="relative" secondary={r.requested_by_name ?? undefined} />,
    exportValue: (r) => r.created_at,
  },
  {
    key: 'approved_by',
    header: t('reviews.markPaid.approvedBy'),
    cell: (r) => <TextCell primary={r.approved_by_name ?? <span className="text-muted">—</span>} />,
    exportValue: (r) => r.approved_by_name ?? '',
  },
  {
    key: 'processed',
    header: t('orderDetail.refunds.processed'),
    sortable: true,
    sortKey: 'processed_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (r) => <DateCell value={r.processed_at} display="datetime" />,
    exportValue: (r) => r.processed_at ?? '',
  },
];

function actionsColumn(
  t: FinanceT,
  perms: FinancePermissions,
  thresholdMinor: number,
  onApprove: (r: RefundOut) => void,
  onReject: (r: RefundOut) => void,
): DataTableColumn<RefundOut> {
  return {
    key: 'actions',
    header: <span className="sr-only">{t('orderDetail.actions')}</span>,
    title: t('orderDetail.actions'),
    align: 'end',
    hideable: false,
    exportable: false,
    mobile: 'meta',
    cell: (r) => {
      if (!perms.finance || r.status !== 'requested') return null;
      const blocked = needsSecondRefundApprover(r, perms, thresholdMinor);
      return (
        <span className="flex flex-wrap justify-end gap-1.5">
          <FinanceButton
            size="sm"
            onClick={() => onApprove(r)}
            disabled={blocked}
            title={blocked ? t('refunds.blockedTitle', { amount: formatMoney(thresholdMinor, 'INR') }) : undefined}
            icon={<Check className="size-3.5" aria-hidden />}
          >
            {t('reviews.approve')}
          </FinanceButton>
          <FinanceButton size="sm" variant="secondary" onClick={() => onReject(r)} icon={<X className="size-3.5" aria-hidden />}>
            {t('reviews.reject')}
          </FinanceButton>
          {blocked && <span className="basis-full text-end text-xs text-warning-ink">{t('refunds.needsSecond')}</span>}
        </span>
      );
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function RefundsPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('refunds.title'));
  const perms = useFinancePermissions();
  const threshold = useRefundDualApprovalThreshold();
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: RefundListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...financeKeys.all, 'refunds', 'table', listParams],
    queryFn: () => paymentsApi.listRefunds(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'refunds', 'status-counts', apiFilters],
    queryFn: () => paymentsApi.refundStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });

  const approve = useApproveRefund();
  const reject = useRejectRefund();
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<RefundOut | null>(null);
  const [rejecting, setRejecting] = useState<RefundOut | null>(null);

  const exportColumns = useMemo(() => baseColumns(t), [t]);
  const columns = useMemo(
    () => [...exportColumns, actionsColumn(t, perms, threshold.minor, setApproving, setRejecting)],
    [exportColumns, t, perms, threshold.minor],
  );

  const c = counts.data;
  const statusOptions: FilterOption<RefundStatus>[] = REFUND_STATUSES.map((s) => ({
    value: s,
    label: enumLabel('status', s),
    tone: statusTone(s, 'refund'),
    count: c?.counts[s],
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    { value: 'requested', label: t('refunds.awaitingApproval'), count: c?.counts.requested },
    { value: SECOND_TAB, label: t('refunds.awaitingSecond'), count: c?.awaiting_second_approval, tone: 'warning' },
    ...QUICK_STATUSES.filter((s) => s !== 'requested').map((s) => ({ value: s, label: enumLabel('status', s), count: c?.counts[s] })),
  ];
  const quickValue: QuickValue | '' | null = filters.second
    ? filters.status.length === 0
      ? SECOND_TAB
      : null
    : filters.status.length === 0
      ? ''
      : filters.status.length === 1
        ? filters.status[0]!
        : null;

  return (
    <div>
      <PageHeader
        title={t('refunds.title')}
        description={t('refunds.description')}
        actions={
          perms.createRefunds && (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('refunds.newRefund')}
            </Button>
          )
        }
      />
      <div className="mb-4">
        <RefundThresholdNote />
      </div>
      <DataTable
        id="admin.finance.refunds"
        caption={t('refunds.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(r) => financePath(`orders/${r.order_id}`)}
        rowLabel={(r) => t('orders.openOrder', { number: r.order_number ?? r.order_id })}
        emptyTitle={t('refunds.emptyTitle')}
        emptyDescription={t('refunds.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('refunds.statusLabel')}
              items={quickItems}
              value={quickValue}
              onChange={(v) =>
                v === SECOND_TAB ? setFilters({ status: [], second: true }) : setFilters({ status: v ? [v] : [], second: undefined })
              }
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('orders.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="refunds"
                columns={exportColumns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => paymentsApi.listRefunds({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <MultiSelectFilter label={t('orders.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <AmountRangeFilter
              label={t('orders.columns.amount')}
              currency="INR"
              value={{ min: filters.min, max: filters.max }}
              onChange={({ min, max }) => setFilters({ min, max })}
            />
            <DateRangeFilter label={t('orderDetail.refunds.requested')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />

      <RefundDialog open={creating} onClose={() => setCreating(false)} />

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={t('refunds.approveTitle')}
        size="sm"
        footer={
          <>
            <FinanceButton variant="secondary" onClick={() => setApproving(null)} disabled={approve.isPending}>
              {t('common.cancel')}
            </FinanceButton>
            <FinanceButton
              loading={approve.isPending}
              onClick={() =>
                approving &&
                approve.mutate(approving.id, {
                  onSuccess: () => {
                    notifySuccess(ft('refunds.approved'));
                    setApproving(null);
                  },
                  onError: (e) => notifyApprovalError(e, ft('refunds.approveFailed'), 'refund'),
                })
              }
            >
              {t('refunds.approveTitle')}
            </FinanceButton>
          </>
        }
      >
        {approving && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <Trans
              t={t}
              i18nKey="refunds.approveBody"
              values={{ amount: formatMoney(approving.amount_minor, approving.currency), order: approving.order_number ?? approving.order_id }}
              components={{ 0: <strong />, 1: <strong /> }}
            />
            {approving.reason && (
              <span className="mt-2 block rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">
                {t('refunds.reasonValue', { reason: approving.reason })}
              </span>
            )}
          </p>
        )}
      </Modal>

      <ReasonDialog
        open={rejecting !== null}
        title={t('refunds.rejectTitle')}
        description={
          rejecting
            ? t('refunds.rejectDescription', {
                amount: formatMoney(rejecting.amount_minor, rejecting.currency),
                order: rejecting.order_number ?? t('refunds.orderFallback'),
              })
            : undefined
        }
        confirmLabel={t('refunds.rejectTitle')}
        loading={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) =>
          rejecting &&
          reject.mutate(
            { id: rejecting.id, reason },
            {
              onSuccess: () => {
                notifySuccess(ft('refunds.rejected'));
                setRejecting(null);
              },
              onError: (e) => notifyError(e, ft('refunds.rejectFailed')),
            },
          )
        }
      />
    </div>
  );
}
