/**
 * Payment history for the patient: orders joined with their receipts (and the booking they paid for).
 * Used by the Payments & receipts page and embedded in the booking and case detail pages.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import {
  errorMessage,
  PAYMENT_GATEWAY_LABELS,
  PAYMENT_PURPOSE_LABELS,
  paymentsApi,
  type BookingOut,
  type InvoiceOut,
  type PaymentOrderOut,
  type Uuid,
} from '@hig/shared/api';
import { formatMoney, fromMinor, i18n } from '@hig/shared/lib';
import { Button, DataTable, DateCell, MoneyCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { qk } from '../api/queries';
import { PatientStatus, patientStatusLabel } from './listing';

type TFn = ReturnType<typeof useAppTranslation>['t'];

export interface PaymentRow {
  id: Uuid;
  order: PaymentOrderOut;
  receipt: InvoiceOut | null;
  booking: BookingOut | null;
}

/** Date the patient cares about: when it was paid, else when it was started. */
export const paymentDate = (r: PaymentRow) => r.order.paid_at ?? r.order.created_at;

export function paymentDescription(r: PaymentRow): string {
  const purpose = PAYMENT_PURPOSE_LABELS[r.order.purpose] ?? r.order.purpose;
  const what = r.booking ? (r.booking.procedure?.name ?? r.booking.package?.name ?? i18n.t('patient:bookings.treatment')) : null;
  return what ? `${purpose} · ${what}` : purpose;
}

/** Orders + receipts (+ bookings for the description). A patient has few payments: up to 100 of each. */
export function usePaymentHistory(options: { bookingId?: Uuid; bookings?: readonly BookingOut[]; enabled?: boolean } = {}) {
  const { bookingId, bookings, enabled = true } = options;
  const orderParams = { booking_id: bookingId, page: 1, page_size: 100 };
  const invoiceParams = { booking_id: bookingId, kind: 'patient_receipt' as const, page: 1, page_size: 100 };
  const orders = useQuery({ queryKey: qk.orders(orderParams), queryFn: () => paymentsApi.listOrders(orderParams), enabled });
  const invoices = useQuery({ queryKey: qk.invoices(invoiceParams), queryFn: () => paymentsApi.listInvoices(invoiceParams), enabled });
  const rows = useMemo<PaymentRow[] | undefined>(() => {
    if (!orders.data) return undefined;
    const byOrder = new Map((invoices.data?.items ?? []).filter((i) => i.order_id).map((i) => [i.order_id as string, i]));
    const byBooking = new Map((bookings ?? []).map((b) => [b.id, b]));
    return orders.data.items.map((order) => ({
      id: order.id,
      order,
      receipt: byOrder.get(order.id) ?? null,
      booking: order.booking_id ? (byBooking.get(order.booking_id) ?? null) : null,
    }));
  }, [orders.data, invoices.data, bookings]);
  return {
    rows,
    loading: orders.isLoading,
    fetching: (orders.isFetching || invoices.isFetching) && !orders.isLoading,
    error: orders.error ?? invoices.error,
    refetch: () => {
      void orders.refetch();
      void invoices.refetch();
    },
  };
}

export function ReceiptButton({ receipt, compact = false }: { receipt: InvoiceOut | null; compact?: boolean }) {
  const { t } = useAppTranslation();
  const [busy, setBusy] = useState(false);
  if (!receipt) return <span className="text-xs text-muted">—</span>;
  return (
    <Button
      variant="outline"
      size="xs"
      loading={busy}
      leftIcon={<Download className="size-3.5" aria-hidden />}
      aria-label={t('payments.receipt.downloadLabel', { number: receipt.invoice_number })}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        setBusy(true);
        try {
          await paymentsApi.downloadInvoicePdf(receipt);
        } catch (err) {
          toast.error(errorMessage(err, t('payments.receipt.downloadFailed')));
        } finally {
          setBusy(false);
        }
      }}
    >
      {compact ? t('payments.receipt.pdf') : t('payments.receipt.button')}
    </Button>
  );
}

export function paymentColumns({ withBooking, t }: { withBooking: boolean; t: TFn }): DataTableColumn<PaymentRow>[] {
  return [
    {
      key: 'date',
      header: t('payments.columns.date'),
      sticky: true,
      sortable: true,
      sortDescFirst: true,
      sortValue: paymentDate,
      mobile: 'meta',
      cell: (r) => <DateCell value={paymentDate(r)} display="date" secondary={r.order.paid_at ? undefined : t('payments.columns.started')} />,
      exportValue: paymentDate,
    },
    {
      key: 'description',
      header: t('payments.columns.description'),
      mobile: 'primary',
      className: 'max-w-72',
      sortable: true,
      sortValue: paymentDescription,
      cell: (r) => (
        <TextCell
          primary={withBooking ? paymentDescription(r) : (PAYMENT_PURPOSE_LABELS[r.order.purpose] ?? r.order.purpose)}
          secondary={
            withBooking && r.booking
              ? `${r.booking.booking_number} · ${r.booking.hospital.name}`
              : `${r.order.order_number} · ${PAYMENT_GATEWAY_LABELS[r.order.gateway] ?? r.order.gateway}`
          }
        />
      ),
      mobileCell: (r) => <span className="font-semibold">{withBooking ? paymentDescription(r) : PAYMENT_PURPOSE_LABELS[r.order.purpose]}</span>,
      exportValue: paymentDescription,
    },
    {
      key: 'method',
      header: t('payments.columns.method'),
      defaultHidden: true,
      cell: (r) => <span className="whitespace-nowrap text-sm">{PAYMENT_GATEWAY_LABELS[r.order.gateway] ?? r.order.gateway}</span>,
      exportValue: (r) => PAYMENT_GATEWAY_LABELS[r.order.gateway] ?? r.order.gateway,
    },
    {
      key: 'reference',
      header: t('payments.columns.reference'),
      defaultHidden: true,
      cell: (r) => <span className="font-mono text-xs">{r.order.order_number}</span>,
      exportValue: (r) => r.order.order_number,
    },
    {
      key: 'amount',
      header: t('payments.columns.amount'),
      align: 'end',
      sortable: true,
      sortValue: (r) => r.order.amount_minor,
      cell: (r) => (
        <MoneyCell
          minor={r.order.amount_minor}
          currency={r.order.currency}
          className={r.order.status === 'paid' ? undefined : 'opacity-80'}
          secondary={
            r.order.base_currency !== r.order.currency
              ? t('payments.columns.approx', { amount: formatMoney(r.order.base_amount_minor, r.order.base_currency) })
              : undefined
          }
        />
      ),
      exportValue: (r) => `${r.order.currency} ${fromMinor(r.order.amount_minor, r.order.currency)}`,
    },
    {
      key: 'status',
      header: t('payments.columns.status'),
      sortable: true,
      sortValue: (r) => r.order.status,
      mobile: 'badge',
      cell: (r) => <PatientStatus status={r.order.status} kind="order" />,
      exportValue: (r) => patientStatusLabel(r.order.status, 'order') ?? r.order.status,
    },
    {
      key: 'receipt',
      header: t('payments.columns.receipt'),
      align: 'end',
      hideable: false,
      exportable: true,
      cell: (r) => <ReceiptButton receipt={r.receipt} />,
      exportValue: (r) => r.receipt?.invoice_number ?? '',
    },
  ];
}

/** Compact payments table for detail pages (no filter bar). */
export function PaymentsTable({ bookingId, emptyText }: { bookingId: Uuid; emptyText?: string }) {
  const { t } = useAppTranslation();
  const history = usePaymentHistory({ bookingId });
  const columns = useMemo(() => paymentColumns({ withBooking: false, t }), [t]);
  return (
    <DataTable
      caption={t('payments.table.caption')}
      columns={columns}
      rows={history.rows}
      loading={history.loading}
      fetching={history.fetching}
      error={history.error}
      onRetry={history.refetch}
      defaultSort={{ key: 'date', direction: 'desc' }}
      density="compact"
      responsive="cards"
      showViewOptions={false}
      className="shadow-none"
      emptyIcon={<Receipt className="size-7" aria-hidden />}
      emptyTitle={emptyText ?? t('payments.table.emptyTitle')}
      emptyDescription={t('payments.table.emptyDescription')}
    />
  );
}
