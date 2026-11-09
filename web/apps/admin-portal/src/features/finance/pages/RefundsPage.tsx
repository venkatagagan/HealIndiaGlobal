import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import {
  REFUND_STATUSES,
  REFUND_STATUS_LABELS,
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
const BASE_COLUMNS: DataTableColumn<RefundOut>[] = [
  {
    key: 'order',
    header: 'Order',
    sticky: true,
    mobile: 'secondary',
    cell: (r) => <IdCell value={r.order_number ?? r.order_id.slice(0, 8)} secondary={r.gateway_refund_id ?? undefined} />,
    exportValue: (r) => r.order_number ?? r.order_id,
  },
  {
    key: 'patient',
    header: 'Patient',
    mobile: 'primary',
    className: 'max-w-52',
    cell: (r) => <PersonCell name={r.patient_name ?? 'Unknown patient'} secondary={r.reason ?? undefined} />,
    exportValue: (r) => r.patient_name ?? '',
  },
  {
    key: 'amount',
    header: 'Amount',
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
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (r) => <StatusBadgeCell status={r.status} kind="refund" />,
    exportValue: (r) => REFUND_STATUS_LABELS[r.status] ?? r.status,
  },
  {
    key: 'reason',
    header: 'Reason',
    defaultHidden: true,
    className: 'max-w-64',
    cell: (r) => <span className="line-clamp-2">{r.reason ?? '—'}</span>,
    exportValue: (r) => r.reason ?? '',
  },
  {
    key: 'requested',
    header: 'Requested',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (r) => <DateCell value={r.created_at} display="relative" secondary={r.requested_by_name ?? undefined} />,
    exportValue: (r) => r.created_at,
  },
  {
    key: 'approved_by',
    header: 'Approved by',
    cell: (r) => <TextCell primary={r.approved_by_name ?? <span className="text-muted">—</span>} />,
    exportValue: (r) => r.approved_by_name ?? '',
  },
  {
    key: 'processed',
    header: 'Processed',
    sortable: true,
    sortKey: 'processed_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (r) => <DateCell value={r.processed_at} display="datetime" />,
    exportValue: (r) => r.processed_at ?? '',
  },
];

function actionsColumn(
  perms: FinancePermissions,
  thresholdMinor: number,
  onApprove: (r: RefundOut) => void,
  onReject: (r: RefundOut) => void,
): DataTableColumn<RefundOut> {
  return {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    title: 'Actions',
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
            title={
              blocked
                ? `You requested this refund and it is above ${formatMoney(thresholdMinor, 'INR')}: a different finance user must approve it`
                : undefined
            }
            icon={<Check className="size-3.5" aria-hidden />}
          >
            Approve
          </FinanceButton>
          <FinanceButton size="sm" variant="secondary" onClick={() => onReject(r)} icon={<X className="size-3.5" aria-hidden />}>
            Reject
          </FinanceButton>
          {blocked && <span className="basis-full text-end text-xs text-warning-ink">Needs a second finance user</span>}
        </span>
      );
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function RefundsPage() {
  useDocumentTitle('Refunds');
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

  const columns = useMemo(
    () => [...BASE_COLUMNS, actionsColumn(perms, threshold.minor, setApproving, setRejecting)],
    [perms, threshold.minor],
  );

  const c = counts.data;
  const statusOptions: FilterOption<RefundStatus>[] = REFUND_STATUSES.map((s) => ({
    value: s,
    label: REFUND_STATUS_LABELS[s],
    tone: statusTone(s, 'refund'),
    count: c?.counts[s],
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: 'All', count: c?.total },
    { value: 'requested', label: 'Awaiting approval', count: c?.counts.requested },
    { value: SECOND_TAB, label: 'Awaiting second approval', count: c?.awaiting_second_approval, tone: 'warning' },
    ...QUICK_STATUSES.filter((s) => s !== 'requested').map((s) => ({ value: s, label: REFUND_STATUS_LABELS[s], count: c?.counts[s] })),
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
        title="Refunds"
        description="Refund requests are approved before the gateway refund is issued: requested → approved → processing → processed."
        actions={
          perms.createRefunds && (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              New refund
            </Button>
          )
        }
      />
      <div className="mb-4">
        <RefundThresholdNote />
      </div>
      <DataTable
        id="admin.finance.refunds"
        caption="Refunds"
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(r) => financePath(`orders/${r.order_id}`)}
        rowLabel={(r) => `Open order ${r.order_number ?? r.order_id}`}
        emptyTitle="No refunds yet"
        emptyDescription="Refunds requested by finance or admins (or created by cancellations) appear here."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Refund status"
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
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Order, booking or patient…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="refunds"
                columns={BASE_COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => paymentsApi.listRefunds({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <AmountRangeFilter
              label="Amount"
              currency="INR"
              value={{ min: filters.min, max: filters.max }}
              onChange={({ min, max }) => setFilters({ min, max })}
            />
            <DateRangeFilter label="Requested" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />

      <RefundDialog open={creating} onClose={() => setCreating(false)} />

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title="Approve refund"
        size="sm"
        footer={
          <>
            <FinanceButton variant="secondary" onClick={() => setApproving(null)} disabled={approve.isPending}>
              Cancel
            </FinanceButton>
            <FinanceButton
              loading={approve.isPending}
              onClick={() =>
                approving &&
                approve.mutate(approving.id, {
                  onSuccess: () => {
                    notifySuccess('Refund approved; the gateway refund has been queued');
                    setApproving(null);
                  },
                  onError: (e) => notifyApprovalError(e, 'Could not approve the refund', 'this refund'),
                })
              }
            >
              Approve refund
            </FinanceButton>
          </>
        }
      >
        {approving && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Refund <strong>{formatMoney(approving.amount_minor, approving.currency)}</strong> on order{' '}
            <strong>{approving.order_number ?? approving.order_id}</strong> to the original payment method. This cannot be
            undone once the gateway processes it.
            {approving.reason && (
              <span className="mt-2 block rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">Reason: {approving.reason}</span>
            )}
          </p>
        )}
      </Modal>

      <ReasonDialog
        open={rejecting !== null}
        title="Reject refund"
        description={rejecting ? `${formatMoney(rejecting.amount_minor, rejecting.currency)} on ${rejecting.order_number ?? 'order'}` : undefined}
        confirmLabel="Reject refund"
        loading={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) =>
          rejecting &&
          reject.mutate(
            { id: rejecting.id, reason },
            {
              onSuccess: () => {
                notifySuccess('Refund rejected');
                setRejecting(null);
              },
              onError: (e) => notifyError(e, 'Could not reject the refund'),
            },
          )
        }
      />
    </div>
  );
}
