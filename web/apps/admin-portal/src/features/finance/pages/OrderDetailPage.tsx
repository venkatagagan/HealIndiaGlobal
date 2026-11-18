import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Banknote, Undo2 } from 'lucide-react';
import { type PaymentOut, type RefundOut } from '@hig/shared/api';
import { formatDateTime, useDocumentTitle } from '../lib/shared';
import { enumLabel, useFinanceTranslation } from '../lib/i18n';
import { useOrder } from '../api/queries';
import { Mono, Money, StatusBadge } from '../components/finance';
import { isRefundablePayment, RefundDialog, refundableMinor } from '../components/RefundDialog';
import { MarkPaidDialog } from '../components/MarkPaidDialog';
import { RefundPayoutActions } from '../components/RefundPayout';
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
  const { t } = useFinanceTranslation();
  const { orderId = '' } = useParams();
  const order = useOrder(orderId);
  const perms = useFinancePermissions();
  const [refundFor, setRefundFor] = useState<string | null | undefined>(undefined);
  const [markPaid, setMarkPaid] = useState(false);
  useDocumentTitle(order.data ? t('orderDetail.documentTitle', { number: order.data.order_number }) : t('orderDetail.title'));

  const back = (
    <Link to={financePath('orders')} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
      <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> {t('orders.title')}
    </Link>
  );

  if (order.isLoading) return <LoadingState />;
  if (order.isError || !order.data)
    return (
      <div>
        <PageHeader title={t('orderDetail.title')} back={back} />
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
      header: t('orderDetail.payments.payment'),
      mobile: 'secondary',
      cell: (p) => (
        <IdCell
          value={p.gateway_payment_id ?? p.id}
          secondary={`${enumLabel('paymentGateway', p.gateway)} · ${p.method ? enumLabel('paymentMethod', p.method) : '—'}`}
        />
      ),
      exportValue: (p) => p.gateway_payment_id ?? p.id,
    },
    {
      key: 'status',
      header: t('orders.columns.status'),
      sortable: true,
      mobile: 'badge',
      accessor: (p) => p.status,
      cell: (p) => <StatusBadgeCell status={p.status} kind="payment" />,
    },
    {
      key: 'amount',
      header: t('orders.columns.amount'),
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      mobile: 'primary',
      sortValue: (p) => p.base_amount_minor,
      cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} />,
    },
    {
      key: 'base',
      header: t('orderDetail.payments.base', { currency: o.base_currency }),
      title: t('orderDetail.payments.baseAmount'),
      align: 'end',
      sortable: true,
      sortValue: (p) => p.base_amount_minor,
      cell: (p) => <MoneyCell minor={p.base_amount_minor} currency={o.base_currency} />,
    },
    {
      key: 'fee',
      header: t('orderDetail.payments.feeTax'),
      align: 'end',
      sortable: true,
      sortValue: (p) => (p.fee_minor ?? 0) + (p.tax_on_fee_minor ?? 0),
      cell: (p) => <MoneyCell minor={p.fee_minor == null ? null : (p.fee_minor ?? 0) + (p.tax_on_fee_minor ?? 0)} currency={p.currency} />,
    },
    {
      key: 'refunded',
      header: t('orderDetail.payments.refunded'),
      align: 'end',
      sortable: true,
      sortValue: (p) => p.amount_refunded_minor,
      cell: (p) => (
        <MoneyCell minor={p.amount_refunded_minor} currency={p.currency} className={p.amount_refunded_minor === 0 ? 'text-muted' : undefined} />
      ),
    },
    {
      key: 'captured',
      header: t('orderDetail.payments.captured'),
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
      header: <span className="sr-only">{t('orderDetail.actions')}</span>,
      title: t('orderDetail.actions'),
      align: 'end',
      hideable: false,
      exportable: false,
      cell: (p) =>
        perms.createRefunds && isRefundablePayment(p) && refundableMinor(p, refunds) > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => setRefundFor(p.id)} icon={<Undo2 className="size-3.5" aria-hidden />}>
            {t('orderDetail.payments.refund')}
          </Button>
        ) : null,
    },
  ];

  const refundColumns: DataTableColumn<RefundOut>[] = [
    {
      key: 'created',
      header: t('orderDetail.refunds.requested'),
      sortable: true,
      sortDescFirst: true,
      mobile: 'secondary',
      sortValue: (r) => r.created_at,
      cell: (r) => <DateCell value={r.created_at} display="datetime" secondary={r.requested_by_name ?? undefined} />,
    },
    {
      key: 'amount',
      header: t('orders.columns.amount'),
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      mobile: 'primary',
      sortValue: (r) => r.base_amount_minor,
      cell: (r) => <MoneyCell minor={r.amount_minor} currency={r.currency} />,
    },
    { key: 'status', header: t('orders.columns.status'), sortable: true, mobile: 'badge', accessor: (r) => r.status, cell: (r) => <StatusBadgeCell status={r.status} kind="refund" /> },
    { key: 'reason', header: t('common.reason'), className: 'max-w-64', cell: (r) => <TextCell primary={r.reason ?? '—'} /> },
    { key: 'approved', header: t('reviews.markPaid.approvedBy'), cell: (r) => <TextCell primary={r.approved_by_name ?? '—'} /> },
    {
      key: 'gw',
      header: t('orderDetail.refunds.gatewayRef'),
      cell: (r) =>
        r.gateway_refund_id || r.payout_reference ? <IdCell value={(r.gateway_refund_id ?? r.payout_reference)!} /> : <span className="text-muted">—</span>,
    },
    {
      key: 'processed',
      header: t('orderDetail.refunds.processed'),
      sortable: true,
      sortDescFirst: true,
      sortValue: (r) => r.processed_at ?? '',
      cell: (r) => <DateCell value={r.processed_at} display="datetime" />,
    },
    {
      key: 'payout',
      header: <span className="sr-only">{t('orderDetail.actions')}</span>,
      title: t('orderDetail.actions'),
      align: 'end',
      hideable: false,
      exportable: false,
      mobile: 'meta',
      cell: (r) => <RefundPayoutActions refund={r} />,
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
        description={t('orderDetail.purposeVia', { purpose: enumLabel('paymentPurpose', o.purpose), gateway: enumLabel('paymentGateway', o.gateway) })}
        actions={
          <>
            {canMarkPaid && (
              <Button
                variant={markPaidPending ? 'secondary' : 'primary'}
                onClick={() => setMarkPaid(true)}
                icon={<Banknote className="size-4" aria-hidden />}
              >
                {markPaidPending ? t('orderDetail.replaceMarkPaid') : t('settlementUi.rowActions.markPaid')}
              </Button>
            )}
            {canRefund && (
              <Button variant="secondary" onClick={() => setRefundFor(null)} icon={<Undo2 className="size-4" aria-hidden />}>
                {t('refundDialog.title')}
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        <AmountReviewPanel order={o} />
        <MarkPaidRequestPanel order={o} />
        <Card title={t('orders.columns.order')}>
          <DescriptionList
            columns={3}
            items={[
              { label: t('orders.columns.amount'), value: <Money minor={o.amount_minor} currency={o.currency} /> },
              { label: t('orderDetail.fields.baseAmount', { currency: o.base_currency }), value: <Money minor={o.base_amount_minor} currency={o.base_currency} /> },
              { label: t('orderDetail.fields.fxRate'), value: t('orderDetail.fields.fxRateValue', { rate: o.fx_rate, base: o.base_currency, currency: o.currency }) },
              { label: t('orders.columns.patient'), value: o.patient_name ?? '—' },
              { label: t('orderDetail.fields.paidBy'), value: o.payer_name ?? '—' },
              { label: t('orderDetail.fields.paymentMethod'), value: o.payment_method ? enumLabel('paymentMethod', o.payment_method) : '—' },
              { label: t('orders.columns.booking'), value: o.booking_number ?? (o.booking_id ? <Mono>{o.booking_id}</Mono> : '—') },
              { label: t('orderDetail.fields.gatewayOrderId'), value: <Mono>{o.gateway_order_id ?? '—'}</Mono> },
              { label: t('orders.columns.created'), value: formatDateTime(o.created_at) },
              { label: t('orders.columns.paid'), value: formatDateTime(o.paid_at) },
              { label: t('orderDetail.fields.expires'), value: formatDateTime(o.expires_at) },
            ]}
          />
        </Card>

        <SharedDataTable
          id="admin.finance.order.payments"
          caption={t('orderDetail.payments.title')}
          columns={paymentColumns}
          rows={payments}
          defaultSort={{ key: 'captured', direction: 'desc' }}
          emptyTitle={t('orderDetail.payments.emptyTitle')}
          emptyDescription={t('orderDetail.payments.emptyDescription')}
          header={<SectionTitle title={t('orderDetail.payments.title')} count={payments.length} />}
        />

        <SharedDataTable
          id="admin.finance.order.refunds"
          caption={t('nav.items.refunds')}
          columns={refundColumns}
          rows={refunds}
          defaultSort={{ key: 'created', direction: 'desc' }}
          emptyTitle={t('orderDetail.refunds.emptyTitle')}
          header={<SectionTitle title={t('nav.items.refunds')} count={refunds.length} />}
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
