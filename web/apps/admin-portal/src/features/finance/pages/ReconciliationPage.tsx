import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Banknote, Download, Eye, FileText, ShieldCheck } from 'lucide-react';
import {
  documentsApi,
  paymentsApi,
  PAYMENT_PURPOSE_LABELS,
  type DocumentOut,
  type OrderListParams,
  type PaymentOrderOut,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  DataTable,
  DateCell,
  DateRangeFilter,
  Drawer,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  StatusBadgeCell,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatDateTime, formatRelative } from '../lib/shared';
import { financeKeys, useBooking, useProofDocuments } from '../api/queries';
import { Money, notifyError, StatusBadge } from '../components/finance';
import { MarkPaidDialog } from '../components/MarkPaidDialog';
import { ReviewBadge } from '../components/reviews';
import { useFinancePermissions } from '../lib/permissions';
import { Badge, Button, DescriptionList } from '../components/ui';
import { CURRENCY_OPTIONS, listOrUndefined, minorOrUndefined } from '../lib/tables';
import { financePath } from '../paths';

// ---------------------------------------------------------------------------------------------------------
// Queues (tabs) + URL state
// ---------------------------------------------------------------------------------------------------------
const QUEUES = ['pending', 'approval', 'created'] as const;
type Queue = (typeof QUEUES)[number];
const QUEUE_LABELS: Record<Queue, string> = {
  pending: 'Proof submitted',
  approval: 'Awaiting 2nd approval',
  created: 'Awaiting proof',
};
const QUEUE_EMPTY: Record<Queue, { title: string; description: string }> = {
  pending: { title: 'Nothing to reconcile', description: 'All submitted bank transfers have been processed.' },
  approval: {
    title: 'No requests awaiting approval',
    description: 'Mark-paid requests recorded by a finance user appear here for a second user to approve.',
  },
  created: { title: 'No transfers awaiting proof', description: 'Bank-transfer checkouts without an uploaded proof appear here.' },
};

const FILTERS = {
  // the URL key stays `status` so existing links (?status=approval) keep working
  status: filterParam.oneOf(QUEUES, 'pending'),
  q: filterParam.text(),
  currency: filterParam.list(),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'base_amount_minor', 'order_number'] as const;

type ReconFilters = FilterValues<typeof FILTERS>;

/** Filters shared by every queue (and the queue counts). */
function baseFilters(f: ReconFilters): Omit<OrderListParams, 'page' | 'page_size' | 'sort'> {
  return {
    gateway: 'bank_transfer',
    q: f.q.trim() || undefined,
    currency: listOrUndefined(f.currency),
    created_from: f.from || undefined,
    created_to: f.to || undefined,
    min_amount: minorOrUndefined(f.min),
    max_amount: minorOrUndefined(f.max),
  };
}

function queueFilters(queue: Queue): Pick<OrderListParams, 'status' | 'review'> {
  if (queue === 'approval') return { review: 'mark_paid' };
  return { status: queue };
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function ReconciliationPage() {
  useDocumentTitle('Bank transfer reconciliation');
  const perms = useFinancePermissions();
  const navigate = useNavigate();
  const table = useTableState({ filters: FILTERS, defaultSort: 'created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const queue: Queue = filters.status || 'pending';
  const base = useMemo(() => baseFilters(filters), [filters]);
  const listParams: OrderListParams = { ...base, ...queueFilters(queue), sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...financeKeys.all, 'orders', 'reconciliation', listParams],
    queryFn: () => paymentsApi.listOrders(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'orders', 'status-counts', base],
    queryFn: () => paymentsApi.orderStatusCounts(base),
    placeholderData: keepPreviousData,
  });
  const queueCount: Record<Queue, number | undefined> = {
    pending: counts.data?.counts.pending,
    approval: counts.data?.review.mark_paid,
    created: counts.data?.counts.created,
  };

  const [open, setOpen] = useState<PaymentOrderOut | null>(null);
  const [markPaid, setMarkPaid] = useState<PaymentOrderOut | null>(null);

  const columns = useMemo<DataTableColumn<PaymentOrderOut>[]>(
    () => [
      {
        key: 'order',
        header: 'Order',
        sortable: true,
        sortKey: 'order_number',
        sticky: true,
        mobile: 'secondary',
        cell: (o) => <IdCell value={o.order_number} secondary={PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose} />,
        exportValue: (o) => o.order_number,
      },
      {
        key: 'patient',
        header: 'Patient',
        mobile: 'primary',
        className: 'max-w-56',
        cell: (o) => <PersonCell name={o.patient_name ?? o.payer_name ?? 'Unknown payer'} secondary={o.booking_number ?? undefined} />,
        exportValue: (o) => o.patient_name ?? o.payer_name ?? '',
      },
      {
        key: 'amount',
        header: 'Amount',
        align: 'end',
        sortable: true,
        sortKey: 'base_amount_minor',
        sortDescFirst: true,
        cell: (o) => (
          <MoneyCell
            minor={o.amount_minor}
            currency={o.currency}
            secondary={o.currency !== o.base_currency ? <MoneyCell minor={o.base_amount_minor} currency={o.base_currency} className="font-normal" /> : undefined}
          />
        ),
        exportValue: (o) => `${o.currency} ${fromMinor(o.amount_minor, o.currency)}`,
      },
      {
        key: 'status',
        header: 'Status',
        mobile: 'badge',
        cell: (o) => (
          <span className="flex flex-col items-start gap-1">
            <StatusBadgeCell status={o.status} kind="order" />
            {o.review_required && <ReviewBadge kind={o.review_required} />}
          </span>
        ),
        exportValue: (o) => o.status,
      },
      {
        key: 'created',
        header: 'Created',
        sortable: true,
        sortKey: 'created_at',
        cell: (o) => <DateCell value={o.created_at} display="relative" secondary={o.expires_at ? `expires ${formatRelative(o.expires_at)}` : undefined} />,
        exportValue: (o) => o.created_at,
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        title: 'Actions',
        align: 'end',
        hideable: false,
        exportable: false,
        cell: (o) => (
          <span className="flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setOpen(o)} icon={<Eye className="size-3.5" aria-hidden />}>
              Proof
            </Button>
            {perms.finance &&
              (o.review_required === 'mark_paid' ? (
                <Button size="sm" variant="accent" onClick={() => navigate(financePath(`orders/${o.id}`))} icon={<ShieldCheck className="size-3.5" aria-hidden />}>
                  Review
                </Button>
              ) : (
                <Button size="sm" onClick={() => setMarkPaid(o)} icon={<Banknote className="size-3.5" aria-hidden />}>
                  Mark paid
                </Button>
              ))}
          </span>
        ),
      },
    ],
    [perms.finance, navigate],
  );

  const quickItems: QuickFilterItem<Queue>[] = QUEUES.map((q) => ({ value: q, label: QUEUE_LABELS[q], count: queueCount[q] }));

  return (
    <div>
      <PageHeader
        title="Bank transfer reconciliation"
        description="Match each uploaded proof against the bank statement and record it with the bank reference. A second finance user approves the request before the order is captured."
      />
      <DataTable
        id="admin.finance.reconciliation"
        caption={`Bank transfers: ${QUEUE_LABELS[queue]}`}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(o) => setOpen(o)}
        rowLabel={(o) => `Review bank transfer ${o.order_number}`}
        filtersActive={table.activeFilterCount > (filters.status && filters.status !== 'pending' ? 1 : 0)}
        emptyTitle={QUEUE_EMPTY[queue].title}
        emptyDescription={QUEUE_EMPTY[queue].description}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Reconciliation queue" items={quickItems} value={queue} onChange={(q) => setFilter('status', q || 'pending')} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Order, booking or patient…' }}
            onReset={() => setFilters({ q: '', currency: [], from: '', to: '', min: undefined, max: undefined })}
            actions={
              <ExportButton
                filename={`bank-transfers-${queue}`}
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) =>
                    paymentsApi.listOrders({ ...base, ...queueFilters(queue), sort: table.sortParam, page, page_size: size }),
                  )
                }
              />
            }
          >
            <AmountRangeFilter label="Amount" currency="INR" value={{ min: filters.min, max: filters.max }} onChange={({ min, max }) => setFilters({ min, max })} />
            <MultiSelectFilter label="Currency" value={filters.currency} onChange={(v) => setFilter('currency', v)} options={CURRENCY_OPTIONS} searchable />
            <DateRangeFilter label="Created" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `Bank transfer ${open.order_number}` : 'Bank transfer'}
        description="Check the proof against the bank statement before recording the payment."
        size="lg"
      >
        {open && (
          <ReconcileDetail
            order={open}
            canMarkPaid={perms.finance}
            onMarkPaid={() => {
              setMarkPaid(open);
              setOpen(null);
            }}
            onOpenOrder={() => navigate(financePath(`orders/${open.id}`))}
          />
        )}
      </Drawer>

      {markPaid && <MarkPaidDialog open onClose={() => setMarkPaid(null)} order={markPaid} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Drawer content: booking context + proof documents
// ---------------------------------------------------------------------------------------------------------
function ReconcileDetail({ order, canMarkPaid, onMarkPaid, onOpenOrder }: {
  order: PaymentOrderOut;
  canMarkPaid: boolean;
  onMarkPaid: () => void;
  onOpenOrder: () => void;
}) {
  const booking = useBooking(order.booking_id);
  const docs = useProofDocuments(order.id);
  const proofs = docs.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        {order.review_required && <ReviewBadge kind={order.review_required} />}
        <Badge tone="neutral">{PAYMENT_PURPOSE_LABELS[order.purpose] ?? order.purpose}</Badge>
      </div>
      <div className="rounded-xl border border-border bg-surface-2/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Amount due</p>
        <Money minor={order.amount_minor} currency={order.currency} className="text-2xl font-semibold" />
        {order.currency !== order.base_currency && (
          <p className="text-xs text-muted">
            <Money minor={order.base_amount_minor} currency={order.base_currency} /> at {String(order.fx_rate)}
          </p>
        )}
      </div>
      <DescriptionList
        items={[
          { label: 'Patient', value: order.patient_name ?? booking.data?.patient.full_name ?? '—' },
          { label: 'Paid by', value: order.payer_name ?? '—' },
          { label: 'Booking', value: order.booking_number ?? booking.data?.booking_number ?? '—' },
          { label: 'Hospital', value: booking.data?.hospital.name ?? '—' },
          { label: 'Created', value: `${formatDateTime(order.created_at)} (${formatRelative(order.created_at)})` },
          { label: 'Expires', value: formatDateTime(order.expires_at) },
        ]}
      />
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Proof of payment</h3>
        {docs.isLoading ? (
          <p className="text-sm text-muted">Loading documents…</p>
        ) : docs.isError ? (
          <p className="text-sm text-danger-ink">Could not load proof documents.</p>
        ) : proofs.length === 0 ? (
          <p className="text-sm text-muted">No proof uploaded yet.</p>
        ) : (
          <ul className="space-y-2">
            {proofs.map((d) => (
              <ProofChip key={d.id} doc={d} />
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onOpenOrder}>
          Open order
        </Button>
        {canMarkPaid &&
          (order.review_required === 'mark_paid' ? (
            <Button variant="accent" onClick={onOpenOrder} icon={<ShieldCheck className="size-4" aria-hidden />}>
              Review request
            </Button>
          ) : (
            <Button onClick={onMarkPaid} icon={<Banknote className="size-4" aria-hidden />}>
              Mark paid
            </Button>
          ))}
      </div>
    </div>
  );
}

function ProofChip({ doc }: { doc: DocumentOut }) {
  const [busy, setBusy] = useState<'view' | 'save' | null>(null);
  const view = async () => {
    setBusy('view');
    // open the tab synchronously (popup blockers), then point it at the authorised blob
    const tab = window.open('about:blank', '_blank');
    try {
      const { blob } = await documentsApi.download(doc.id);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      notifyError(e, 'Could not open the document');
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy('save');
    try {
      await documentsApi.downloadAndSave(doc);
    } catch (e) {
      notifyError(e, 'Could not download the document');
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border py-1.5 pl-3 pr-1 text-sm">
      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={doc.file_name}>
        {doc.file_name}
      </span>
      <span className="text-xs text-muted">{formatDateTime(doc.created_at, 'd MMM, HH:mm')}</span>
      <Button size="sm" variant="ghost" onClick={() => void view()} loading={busy === 'view'} aria-label={`View ${doc.file_name}`}
        icon={<Eye className="size-3.5" aria-hidden />} />
      <Button size="sm" variant="ghost" onClick={() => void save()} loading={busy === 'save'} aria-label={`Download ${doc.file_name}`}
        icon={<Download className="size-3.5" aria-hidden />} />
    </li>
  );
}
