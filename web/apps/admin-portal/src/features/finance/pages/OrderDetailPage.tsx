import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Banknote, Undo2 } from 'lucide-react';
import {
  PAYMENT_GATEWAY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PURPOSE_LABELS,
  type PaymentOut,
  type RefundOut,
} from '@hig/shared/api';
import { formatDateTime, useDocumentTitle } from '../lib/shared';
import { useOrder } from '../api/queries';
import { Mono, Money, StatusBadge } from '../components/finance';
import { isRefundablePayment, RefundDialog, refundableMinor } from '../components/RefundDialog';
import { MarkPaidDialog } from '../components/MarkPaidDialog';
import { AmountReviewPanel, MarkPaidRequestPanel, ReviewBadge } from '../components/reviews';
import { useFinancePermissions } from '../lib/permissions';
import {
  DataTable as SharedDataTable,
  DateCell,
  IdCell,
  MoneyCell,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { Button, Card, DescriptionList, ErrorState, LoadingState, PageHeader } from '../components/ui';
import { financePath } from '../paths';

export default function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const order = useOrder(orderId);
  const perms = useFinancePermissions();
  const [refundFor, setRefundFor] = useState<string | null | undefined>(undefined);
  const [markPaid, setMarkPaid] = useState(false);
  useDocumentTitle(order.data ? `Order ${order.data.order_number}` : 'Payment order');

  const back = (
    <Link to={financePath('orders')} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
      <ArrowLeft className="size-4" aria-hidden /> Payment orders
    </Link>
  );

  if (order.isLoading) return <LoadingState />;
  if (order.isError || !order.data)
    return (
      <div>
        <PageHeader title="Payment order" back={back} />
        <Card>
          <ErrorState error={order.error} onRetry={() => void order.refetch()} />
        </Card>
      </div>
    );

  const o = order.data;
  const refunds = o.refunds ?? [];
  const payments = o.payments ?? [];
  const canRefund = perms.createRefunds && payments.some((p) => isRefundablePayment(p) && refundableMinor(p, refunds) > 0);
  const markPaidPending = o.mark_paid_request?.status === 'pending';
  // a new request replaces a pending one, so the maker can still correct a wrong reference
  const canMarkPaid = perms.finance && o.gateway === 'bank_transfer' && (o.status === 'pending' || o.status === 'created');

  const paymentColumns: DataTableColumn<PaymentOut>[] = [
    {
      key: 'id',
      header: 'Payment',
      mobile: 'secondary',
      cell: (p) => (
        <IdCell
          value={p.gateway_payment_id ?? p.id}
          secondary={`${PAYMENT_GATEWAY_LABELS[p.gateway] ?? p.gateway} · ${p.method ? PAYMENT_METHOD_LABELS[p.method] : '—'}`}
        />
      ),
      exportValue: (p) => p.gateway_payment_id ?? p.id,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'badge',
      accessor: (p) => p.status,
      cell: (p) => <StatusBadgeCell status={p.status} kind="payment" />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      mobile: 'primary',
      sortValue: (p) => p.base_amount_minor,
      cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} />,
    },
    {
      key: 'base',
      header: `Base (${o.base_currency})`,
      title: 'Base amount',
      align: 'end',
      sortable: true,
      sortValue: (p) => p.base_amount_minor,
      cell: (p) => <MoneyCell minor={p.base_amount_minor} currency={o.base_currency} />,
    },
    {
      key: 'fee',
      header: 'Fee + tax',
      align: 'end',
      sortable: true,
      sortValue: (p) => (p.fee_minor ?? 0) + (p.tax_on_fee_minor ?? 0),
      cell: (p) => <MoneyCell minor={p.fee_minor == null ? null : (p.fee_minor ?? 0) + (p.tax_on_fee_minor ?? 0)} currency={p.currency} />,
    },
    {
      key: 'refunded',
      header: 'Refunded',
      align: 'end',
      sortable: true,
      sortValue: (p) => p.amount_refunded_minor,
      cell: (p) => (
        <MoneyCell minor={p.amount_refunded_minor} currency={p.currency} className={p.amount_refunded_minor === 0 ? 'text-muted' : undefined} />
      ),
    },
    {
      key: 'captured',
      header: 'Captured',
      sortable: true,
      sortDescFirst: true,
      sortValue: (p) => p.captured_at ?? p.created_at,
      cell: (p) =>
        p.error_code ? (
          <span className="text-xs text-danger-ink" title={p.error_description ?? undefined}>
            {p.error_code}
          </span>
        ) : (
          <DateCell value={p.captured_at} display="datetime" />
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      align: 'end',
      hideable: false,
      exportable: false,
      cell: (p) =>
        perms.createRefunds && isRefundablePayment(p) && refundableMinor(p, refunds) > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => setRefundFor(p.id)} icon={<Undo2 className="size-3.5" aria-hidden />}>
            Refund
          </Button>
        ) : null,
    },
  ];

  const refundColumns: DataTableColumn<RefundOut>[] = [
    {
      key: 'created',
      header: 'Requested',
      sortable: true,
      sortDescFirst: true,
      mobile: 'secondary',
      sortValue: (r) => r.created_at,
      cell: (r) => <DateCell value={r.created_at} display="datetime" secondary={r.requested_by_name ?? undefined} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      mobile: 'primary',
      sortValue: (r) => r.base_amount_minor,
      cell: (r) => <MoneyCell minor={r.amount_minor} currency={r.currency} />,
    },
    { key: 'status', header: 'Status', sortable: true, mobile: 'badge', accessor: (r) => r.status, cell: (r) => <StatusBadgeCell status={r.status} kind="refund" /> },
    { key: 'reason', header: 'Reason', className: 'max-w-64', cell: (r) => <TextCell primary={r.reason ?? '—'} /> },
    { key: 'approved', header: 'Approved by', cell: (r) => <TextCell primary={r.approved_by_name ?? '—'} /> },
    { key: 'gw', header: 'Gateway ref', cell: (r) => (r.gateway_refund_id ? <IdCell value={r.gateway_refund_id} /> : <span className="text-muted">—</span>) },
    {
      key: 'processed',
      header: 'Processed',
      sortable: true,
      sortDescFirst: true,
      sortValue: (r) => r.processed_at ?? '',
      cell: (r) => <DateCell value={r.processed_at} display="datetime" />,
    },
  ];

  return (
    <div>
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.order_number} <StatusBadge status={o.status} />
            {o.review_required && <ReviewBadge kind={o.review_required} />}
          </span>
        }
        description={`${PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose} via ${PAYMENT_GATEWAY_LABELS[o.gateway] ?? o.gateway}`}
        actions={
          <>
            {canMarkPaid && (
              <Button
                variant={markPaidPending ? 'secondary' : 'primary'}
                onClick={() => setMarkPaid(true)}
                icon={<Banknote className="size-4" aria-hidden />}
              >
                {markPaidPending ? 'Replace mark-paid request' : 'Mark paid'}
              </Button>
            )}
            {canRefund && (
              <Button variant="secondary" onClick={() => setRefundFor(null)} icon={<Undo2 className="size-4" aria-hidden />}>
                Create refund
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        <AmountReviewPanel order={o} />
        <MarkPaidRequestPanel order={o} />
        <Card title="Order">
          <DescriptionList
            columns={3}
            items={[
              { label: 'Amount', value: <Money minor={o.amount_minor} currency={o.currency} /> },
              { label: `Base amount (${o.base_currency})`, value: <Money minor={o.base_amount_minor} currency={o.base_currency} /> },
              { label: 'FX rate', value: `${o.fx_rate} ${o.base_currency} per ${o.currency}` },
              { label: 'Patient', value: o.patient_name ?? '—' },
              { label: 'Paid by', value: o.payer_name ?? '—' },
              { label: 'Payment method', value: o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : '—' },
              { label: 'Booking', value: o.booking_number ?? (o.booking_id ? <Mono>{o.booking_id}</Mono> : '—') },
              { label: 'Gateway order id', value: <Mono>{o.gateway_order_id ?? '—'}</Mono> },
              { label: 'Created', value: formatDateTime(o.created_at) },
              { label: 'Paid', value: formatDateTime(o.paid_at) },
              { label: 'Expires', value: formatDateTime(o.expires_at) },
            ]}
          />
        </Card>

        <SharedDataTable
          id="admin.finance.order.payments"
          caption="Payments"
          columns={paymentColumns}
          rows={payments}
          defaultSort={{ key: 'captured', direction: 'desc' }}
          emptyTitle="No payment attempts yet"
          emptyDescription="Payment attempts appear when the payer completes (or abandons) a checkout."
          header={<SectionTitle title="Payments" count={payments.length} />}
        />

        <SharedDataTable
          id="admin.finance.order.refunds"
          caption="Refunds"
          columns={refundColumns}
          rows={refunds}
          defaultSort={{ key: 'created', direction: 'desc' }}
          emptyTitle="No refunds for this order"
          header={<SectionTitle title="Refunds" count={refunds.length} />}
        />
      </div>

      <RefundDialog
        open={refundFor !== undefined}
        onClose={() => setRefundFor(undefined)}
        orderId={o.id}
        paymentId={refundFor ?? null}
      />
      <MarkPaidDialog open={markPaid} onClose={() => setMarkPaid(false)} order={o} />
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <span className="rounded-full bg-surface-2 px-2 text-xs font-medium tabular-nums text-muted">{count}</span>
    </div>
  );
}
