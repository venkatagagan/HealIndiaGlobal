import { useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { CalendarClock, Plane } from 'lucide-react';
import {
  errorMessage,
  PAYMENT_OPTION_LABELS,
  type BookingOut,
  type InstallmentOut,
  type RefundTier,
} from '@hig/shared/api';
import { DataTable, DateCell, MoneyCell, StatusBadgeCell, type DataTableColumn } from '@hig/shared/ui';
import { useBooking, useCancelBooking, useInstallments } from '../../api/queries';
import { PaymentsTable } from '../../components/payments';
import { BackLink, Money, StatusBadge } from '../../components/common';
import { paths } from '../../lib/paths';
import { cn, daysUntil, formatDate, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  KeyValue,
  Modal,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../ui/primitives';

/**
 * Default cancellation policy (platform setting `refund_policy`, PLAN 6.3). Used only for the preview; the server
 * computes the actual refundable amount when the booking is cancelled.
 */
const DEFAULT_REFUND_POLICY = [
  { days_before: 14, refund_pct: 100 },
  { days_before: 7, refund_pct: 50 },
  { days_before: 0, refund_pct: 0 },
];

/** The booking's own policy (snapshot taken at confirmation, INTEGRATION_BACKLOG #7) or the platform default. */
export function refundPolicyOf(booking: BookingOut): { tiers: RefundTier[]; snapshot: boolean } {
  const snap = booking.refund_policy;
  const tiers = snap && snap.length ? snap : DEFAULT_REFUND_POLICY;
  return { tiers: [...tiers].sort((a, b) => b.days_before - a.days_before), snapshot: !!(snap && snap.length) };
}

function tierLabel(tiers: RefundTier[], index: number): string {
  const tier = tiers[index];
  if (!tier) return '';
  if (tier.days_before > 0) return `${tier.days_before}+ days before admission`;
  const previous = tiers[index - 1];
  return previous ? `Less than ${previous.days_before} days before admission` : 'Any time before admission';
}

export function RefundPolicyList({ booking, highlightPct }: { booking: BookingOut; highlightPct?: number }) {
  const { tiers, snapshot } = refundPolicyOf(booking);
  return (
    <>
      <ul className="mt-2 space-y-1 text-muted">
        {tiers.map((r, i) => (
          <li key={`${r.days_before}-${r.refund_pct}`} className={cn(highlightPct === r.refund_pct && 'font-semibold text-fg')}>
            {tierLabel(tiers, i)}: {r.refund_pct}% refund
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {snapshot
          ? 'This policy was fixed when your booking was confirmed.'
          : 'Standard policy - it is fixed for your booking when the booking is confirmed.'}{' '}
        If the hospital or Heal India Global cancels, you get a 100% refund.
      </p>
    </>
  );
}

export function refundPreview(booking: BookingOut): { pct: number; amount: number; days: number | null } {
  const days = daysUntil(booking.admission_date);
  const rule = refundPolicyOf(booking).tiers
    .sort((a, b) => b.days_before - a.days_before)
    .find((r) => (days ?? 0) >= r.days_before);
  const pct = rule?.refund_pct ?? 0;
  const paid = Math.max(0, booking.amount_paid_minor - booking.amount_refunded_minor);
  return { pct, amount: Math.floor((paid * pct) / 100), days };
}

export function BookingDetailPage() {
  const { id = '' } = useParams();
  const booking = useBooking(id);
  useDocumentTitle(booking.data ? `Booking ${booking.data.booking_number}` : 'Booking');
  if (booking.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  return <BookingDetailView booking={booking.data} />;
}

function BookingDetailView({ booking }: { booking: BookingOut }) {
  const isPlan = booking.payment_option === 'installments';
  const installments = useInstallments(booking.id, isPlan);
  const cancel = useCancelBooking(booking.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancellable = booking.status === 'pending_payment' || booking.status === 'confirmed';
  const preview = refundPreview(booking);
  const canPay = booking.status !== 'cancelled' && booking.status !== 'completed' && booking.balance_due_minor > 0;
  const installmentColumns: DataTableColumn<InstallmentOut>[] = [
    { key: 'seq', header: 'Instalment', sortable: true, mobile: 'primary', cell: (i) => <span className="font-medium">Instalment {i.seq}</span> },
    { key: 'due_date', header: 'Due', sortable: true, cell: (i) => <DateCell value={i.due_date} display="date" /> },
    { key: 'amount_minor', header: 'Amount', align: 'end', sortable: true, cell: (i) => <MoneyCell minor={i.amount_minor} currency={i.currency} /> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (i) => <StatusBadgeCell status={i.status} kind="installment" /> },
    { key: 'paid_at', header: 'Paid on', cell: (i) => <DateCell value={i.paid_at} display="date" /> },
    {
      key: 'pay',
      header: <span className="sr-only">Pay</span>,
      title: 'Pay',
      align: 'end',
      mobile: 'meta',
      cell: (i) =>
        (i.status === 'due' || i.status === 'overdue') && booking.status !== 'cancelled' ? (
          <ButtonLink to={paths.pay(booking.id, i.id)} size="sm">
            Pay
          </ButtonLink>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        back={<BackLink to={paths.bookings}>Bookings</BackLink>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {booking.procedure?.name ?? booking.package?.name ?? 'Treatment'}
            <StatusBadge status={booking.status} className="text-sm" />
          </span>
        }
        description={`${booking.booking_number} · ${booking.hospital.name}, ${booking.hospital.city}`}
        actions={
          <>
            <ButtonLink to={paths.case(booking.case_id)} variant="outline">
              View case
            </ButtonLink>
            {booking.status !== 'cancelled' ? (
              <ButtonLink to={paths.trip(booking.id)} variant="accent" icon={<Plane className="h-4 w-4" aria-hidden />}>
                Trip hub
              </ButtonLink>
            ) : null}
            {canPay && !isPlan ? <ButtonLink to={paths.pay(booking.id)}>Pay now</ButtonLink> : null}
            {canPay && isPlan && booking.status === 'pending_payment' ? <ButtonLink to={paths.pay(booking.id)}>Pay deposit</ButtonLink> : null}
          </>
        }
      />

      {booking.status === 'pending_payment' ? (
        <Alert tone="amber" className="mb-6" title="Payment needed to confirm">
          Your admission date is held once the deposit is paid.
        </Alert>
      ) : booking.status === 'cancelled' ? (
        <Alert tone="neutral" className="mb-6" title={`Cancelled ${formatDate(booking.cancelled_at)}`}>
          {booking.cancel_reason ?? 'This booking was cancelled.'}
          {booking.amount_refunded_minor > 0 ? (
            <>
              {' '}
              Refunded so far: <Money minor={booking.amount_refunded_minor} currency={booking.currency} />.
            </>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Treatment" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KeyValue label="Hospital">
                  {booking.hospital.name}, {booking.hospital.city}
                </KeyValue>
                <KeyValue label="Doctor">{booking.doctor?.full_name ?? '—'}</KeyValue>
                <KeyValue label="Package">{booking.package?.name ?? (booking.quote_id ? 'Accepted quote' : '—')}</KeyValue>
                <KeyValue label="Admission">{formatDate(booking.admission_date)}</KeyValue>
                <KeyValue label="Discharge">{formatDate(booking.discharge_date)}</KeyValue>
                <KeyValue label="Duration">{booking.duration_days ? `${booking.duration_days} days` : '—'}</KeyValue>
                <KeyValue label="Payment option">
                  {PAYMENT_OPTION_LABELS[booking.payment_option]}
                  {booking.installment_months ? ` · ${booking.installment_months} months` : ''}
                </KeyValue>
                <KeyValue label="Insurance claim">{booking.insurance_claim_requested ? 'Requested' : 'No'}</KeyValue>
                <KeyValue label="Booked">{formatDate(booking.created_at)}</KeyValue>
              </dl>
            </CardBody>
          </Card>

          {isPlan ? (
            <Card>
              <CardHeader title="Instalment plan" />
              <CardBody>
                {installments.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : installments.isError ? (
                  <ErrorState error={installments.error} onRetry={() => void installments.refetch()} />
                ) : (
                  <DataTable
                    caption="Instalment plan"
                    columns={installmentColumns}
                    rows={installments.data}
                    defaultSort={{ key: 'seq', direction: 'asc' }}
                    density="compact"
                    responsive="cards"
                    showViewOptions={false}
                    className="shadow-none"
                    emptyIcon={<CalendarClock className="size-7" aria-hidden />}
                    emptyTitle="No schedule yet"
                    emptyDescription="The schedule is created once your booking is confirmed."
                  />
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Payments & receipts"
              description="Every payment for this booking. Download a receipt as a PDF."
              action={
                <ButtonLink to={paths.payments} variant="outline" size="sm">
                  All payments
                </ButtonLink>
              }
            />
            <CardBody>
              <PaymentsTable bookingId={booking.id} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Price summary" />
            <CardBody className="space-y-2 text-sm">
              <SummaryRow label="Subtotal" minor={booking.subtotal_minor} currency={booking.currency} />
              {booking.discount_minor ? <SummaryRow label="Discount" minor={-booking.discount_minor} currency={booking.currency} /> : null}
              {booking.service_fee_minor ? <SummaryRow label="Service fee" minor={booking.service_fee_minor} currency={booking.currency} /> : null}
              <SummaryRow label="Taxes" minor={booking.tax_minor} currency={booking.currency} />
              <SummaryRow label="Total" minor={booking.total_minor} currency={booking.currency} strong />
              <div className="border-t border-border pt-2" />
              <SummaryRow label="Deposit" minor={booking.deposit_minor} currency={booking.currency} />
              <SummaryRow label="Paid" minor={booking.amount_paid_minor} currency={booking.currency} />
              {booking.amount_refunded_minor ? (
                <SummaryRow label="Refunded" minor={booking.amount_refunded_minor} currency={booking.currency} />
              ) : null}
              <SummaryRow label="Balance due" minor={booking.balance_due_minor} currency={booking.currency} strong />
            </CardBody>
          </Card>

          {booking.status !== 'cancelled' && booking.status !== 'completed' ? (
            <Card>
              <CardBody className="text-sm">
                <p className="font-semibold">Cancellation policy</p>
                <RefundPolicyList booking={booking} highlightPct={preview.pct} />
              </CardBody>
            </Card>
          ) : null}

          {cancellable ? (
            <Button variant="outline" className="w-full text-danger" onClick={() => setCancelOpen(true)}>
              Cancel booking
            </Button>
          ) : null}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() =>
                cancel.mutate(
                  { reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Booking cancelled. Any refund is processed to your original payment method.');
                      setCancelOpen(false);
                    },
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                )
              }
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-surface-2 p-4">
            <p className="font-semibold">Cancellation policy</p>
            <RefundPolicyList booking={booking} highlightPct={preview.pct} />
            <p className="mt-3">
              {preview.days !== null ? `${Math.max(0, preview.days)} days before admission. ` : ''}
              Estimated refund:{' '}
              <strong>
                <Money minor={preview.amount} currency={booking.currency} />
              </strong>{' '}
              ({preview.pct}% of the amount paid)
            </p>
            <p className="mt-1 text-xs text-muted">The final amount is confirmed by our team according to the policy in force.</p>
          </div>
          <Field label="Reason for cancelling" htmlFor="cancel-reason" required>
            <Textarea id="cancel-reason" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function SummaryRow({ label, minor, currency, strong }: { label: string; minor: number; currency: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between', strong && 'font-semibold')}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <Money minor={minor} currency={currency} />
    </div>
  );
}
