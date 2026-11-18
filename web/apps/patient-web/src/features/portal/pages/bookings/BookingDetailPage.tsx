import { useState } from 'react';
import { useParams } from 'react-router';
import { Trans } from 'react-i18next';
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
import { useAppTranslation } from '../../../../i18n';
import { useBooking, useCancelBooking, useInstallments } from '../../api/queries';
import { PaymentsTable } from '../../components/payments';
import { BackLink, Money, StatusBadge } from '../../components/common';
import { paths } from '../../lib/paths';
import { cn, daysUntil, formatDate, formatMoney, formatNumber, useDocumentTitle } from '../../lib/shared';
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

type TFn = ReturnType<typeof useAppTranslation>['t'];

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

function tierLabel(t: TFn, tiers: RefundTier[], index: number): string {
  const tier = tiers[index];
  if (!tier) return '';
  if (tier.days_before > 0) return t('bookings.refund.daysOrMore', { count: tier.days_before });
  const previous = tiers[index - 1];
  return previous ? t('bookings.refund.lessThanDays', { count: previous.days_before }) : t('bookings.refund.anyTime');
}

export function RefundPolicyList({ booking, highlightPct }: { booking: BookingOut; highlightPct?: number }) {
  const { t } = useAppTranslation();
  const { tiers, snapshot } = refundPolicyOf(booking);
  return (
    <>
      <ul className="mt-2 space-y-1 text-muted">
        {tiers.map((r, i) => (
          <li key={`${r.days_before}-${r.refund_pct}`} className={cn(highlightPct === r.refund_pct && 'font-semibold text-fg')}>
            {t('bookings.refund.tierLine', { tier: tierLabel(t, tiers, i), pct: formatNumber(r.refund_pct) })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {snapshot
          ? t('bookings.refund.snapshotNote')
          : t('bookings.refund.standardNote')}{' '}
        {t('bookings.refund.fullRefundNote')}
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
  const { t } = useAppTranslation();
  const booking = useBooking(id);
  useDocumentTitle(booking.data ? t('bookings.detail.documentTitle', { number: booking.data.booking_number }) : t('bookings.detail.documentTitleFallback'));
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
  const { t } = useAppTranslation();
  const isPlan = booking.payment_option === 'installments';
  const installments = useInstallments(booking.id, isPlan);
  const cancel = useCancelBooking(booking.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancellable = booking.status === 'pending_payment' || booking.status === 'confirmed';
  const preview = refundPreview(booking);
  const canPay = booking.status !== 'cancelled' && booking.status !== 'completed' && booking.balance_due_minor > 0;
  const installmentColumns: DataTableColumn<InstallmentOut>[] = [
    {
      key: 'seq',
      header: t('bookings.detail.installments.instalment'),
      sortable: true,
      mobile: 'primary',
      cell: (i) => <span className="font-medium">{t('bookings.detail.installments.instalmentNumber', { seq: i.seq })}</span>,
    },
    { key: 'due_date', header: t('bookings.detail.installments.due'), sortable: true, cell: (i) => <DateCell value={i.due_date} display="date" /> },
    { key: 'amount_minor', header: t('bookings.detail.installments.amount'), align: 'end', sortable: true, cell: (i) => <MoneyCell minor={i.amount_minor} currency={i.currency} /> },
    { key: 'status', header: t('bookings.detail.installments.status'), mobile: 'badge', cell: (i) => <StatusBadgeCell status={i.status} kind="installment" /> },
    { key: 'paid_at', header: t('bookings.detail.installments.paidOn'), cell: (i) => <DateCell value={i.paid_at} display="date" /> },
    {
      key: 'pay',
      header: <span className="sr-only">{t('bookings.detail.installments.pay')}</span>,
      title: t('bookings.detail.installments.pay'),
      align: 'end',
      mobile: 'meta',
      cell: (i) =>
        (i.status === 'due' || i.status === 'overdue') && booking.status !== 'cancelled' ? (
          <ButtonLink to={paths.pay(booking.id, i.id)} size="sm">
            {t('bookings.detail.installments.pay')}
          </ButtonLink>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        back={<BackLink to={paths.bookings}>{t('bookings.list.title')}</BackLink>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {booking.procedure?.name ?? booking.package?.name ?? t('bookings.treatment')}
            <StatusBadge status={booking.status} className="text-sm" />
          </span>
        }
        description={`${booking.booking_number} · ${booking.hospital.name}, ${booking.hospital.city}`}
        actions={
          <>
            <ButtonLink to={paths.case(booking.case_id)} variant="outline">
              {t('bookings.detail.viewCase')}
            </ButtonLink>
            {booking.status !== 'cancelled' ? (
              <ButtonLink to={paths.trip(booking.id)} variant="accent" icon={<Plane className="h-4 w-4" aria-hidden />}>
                {t('bookings.detail.tripHub')}
              </ButtonLink>
            ) : null}
            {canPay && !isPlan ? <ButtonLink to={paths.pay(booking.id)}>{t('bookings.detail.payNow')}</ButtonLink> : null}
            {canPay && isPlan && booking.status === 'pending_payment' ? <ButtonLink to={paths.pay(booking.id)}>{t('bookings.detail.payDeposit')}</ButtonLink> : null}
          </>
        }
      />

      {booking.status === 'pending_payment' ? (
        <Alert tone="amber" className="mb-6" title={t('bookings.detail.paymentNeededTitle')}>
          {t('bookings.detail.paymentNeededText')}
        </Alert>
      ) : booking.status === 'cancelled' ? (
        <Alert tone="neutral" className="mb-6" title={t('bookings.detail.cancelledOn', { date: formatDate(booking.cancelled_at) })}>
          {booking.cancel_reason ?? t('bookings.detail.cancelledText')}
          {booking.amount_refunded_minor > 0 ? (
            <>
              {' '}
              <Trans
                t={t}
                i18nKey="bookings.detail.refundedSoFar"
                components={{ 0: <Money minor={booking.amount_refunded_minor} currency={booking.currency} /> }}
              />
            </>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={t('bookings.detail.treatmentCard')} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <KeyValue label={t('bookings.detail.hospital')}>
                  {booking.hospital.name}, {booking.hospital.city}
                </KeyValue>
                <KeyValue label={t('bookings.detail.doctor')}>{booking.doctor?.full_name ?? '—'}</KeyValue>
                <KeyValue label={t('bookings.detail.package')}>{booking.package?.name ?? (booking.quote_id ? t('bookings.detail.acceptedQuote') : '—')}</KeyValue>
                <KeyValue label={t('bookings.detail.admission')}>{formatDate(booking.admission_date)}</KeyValue>
                <KeyValue label={t('bookings.detail.discharge')}>{formatDate(booking.discharge_date)}</KeyValue>
                <KeyValue label={t('bookings.detail.duration')}>{booking.duration_days ? t('bookings.detail.days', { count: booking.duration_days }) : '—'}</KeyValue>
                <KeyValue label={t('bookings.detail.paymentOption')}>
                  {PAYMENT_OPTION_LABELS[booking.payment_option]}
                  {booking.installment_months ? ` · ${t('bookings.detail.months', { count: booking.installment_months })}` : ''}
                </KeyValue>
                <KeyValue label={t('bookings.detail.insuranceClaim')}>
                  {booking.insurance_claim_requested ? t('bookings.detail.requested') : t('bookings.detail.no')}
                </KeyValue>
                <KeyValue label={t('bookings.detail.booked')}>{formatDate(booking.created_at)}</KeyValue>
              </dl>
            </CardBody>
          </Card>

          {isPlan ? (
            <Card>
              <CardHeader title={t('bookings.detail.installments.title')} />
              <CardBody>
                {installments.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : installments.isError ? (
                  <ErrorState error={installments.error} onRetry={() => void installments.refetch()} />
                ) : (
                  <DataTable
                    caption={t('bookings.detail.installments.title')}
                    columns={installmentColumns}
                    rows={installments.data}
                    defaultSort={{ key: 'seq', direction: 'asc' }}
                    density="compact"
                    responsive="cards"
                    showViewOptions={false}
                    className="shadow-none"
                    emptyIcon={<CalendarClock className="size-7" aria-hidden />}
                    emptyTitle={t('bookings.detail.installments.emptyTitle')}
                    emptyDescription={t('bookings.detail.installments.emptyDescription')}
                  />
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={t('payments.page.title')}
              description={t('bookings.detail.paymentsDescription')}
              action={
                <ButtonLink to={paths.payments} variant="outline" size="sm">
                  {t('bookings.detail.allPayments')}
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
            <CardHeader title={t('bookings.summary.title')} />
            <CardBody className="space-y-2 text-sm">
              <SummaryRow label={t('bookings.summary.subtotal')} minor={booking.subtotal_minor} currency={booking.currency} />
              {booking.discount_minor ? <SummaryRow label={t('bookings.summary.discount')} minor={-booking.discount_minor} currency={booking.currency} /> : null}
              {booking.service_fee_minor ? <SummaryRow label={t('bookings.summary.serviceFee')} minor={booking.service_fee_minor} currency={booking.currency} /> : null}
              <SummaryRow label={t('bookings.summary.taxes')} minor={booking.tax_minor} currency={booking.currency} />
              <SummaryRow label={t('bookings.summary.total')} minor={booking.total_minor} currency={booking.currency} strong />
              <div className="border-t border-border pt-2" />
              <SummaryRow label={t('bookings.summary.deposit')} minor={booking.deposit_minor} currency={booking.currency} />
              <SummaryRow label={t('bookings.summary.paid')} minor={booking.amount_paid_minor} currency={booking.currency} />
              {booking.amount_refunded_minor ? (
                <SummaryRow label={t('bookings.summary.refunded')} minor={booking.amount_refunded_minor} currency={booking.currency} />
              ) : null}
              <SummaryRow label={t('bookings.summary.balanceDue')} minor={booking.balance_due_minor} currency={booking.currency} strong />
            </CardBody>
          </Card>

          {booking.status !== 'cancelled' && booking.status !== 'completed' ? (
            <Card>
              <CardBody className="text-sm">
                <p className="font-semibold">{t('bookings.refund.policyTitle')}</p>
                <RefundPolicyList booking={booking} highlightPct={preview.pct} />
              </CardBody>
            </Card>
          ) : null}

          {cancellable ? (
            <Button variant="outline" className="w-full text-danger" onClick={() => setCancelOpen(true)}>
              {t('bookings.cancel.button')}
            </Button>
          ) : null}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('bookings.cancel.title')}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t('bookings.cancel.keep')}
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
                      toast.success(t('bookings.cancel.success'));
                      setCancelOpen(false);
                    },
                    onError: (err) => toast.error(errorMessage(err)),
                  },
                )
              }
            >
              {t('bookings.cancel.button')}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-surface-2 p-4">
            <p className="font-semibold">{t('bookings.refund.policyTitle')}</p>
            <RefundPolicyList booking={booking} highlightPct={preview.pct} />
            <p className="mt-3">
              <Trans
                t={t}
                i18nKey={preview.days !== null ? 'bookings.cancel.estimateWithDays' : 'bookings.cancel.estimate'}
                values={{
                  ...(preview.days !== null ? { count: Math.max(0, preview.days) } : {}),
                  amount: formatMoney(preview.amount, booking.currency),
                  pct: formatNumber(preview.pct),
                }}
                components={{ 0: <strong /> }}
              />
            </p>
            <p className="mt-1 text-xs text-muted">{t('bookings.cancel.finalAmountNote')}</p>
          </div>
          <Field label={t('bookings.cancel.reason')} htmlFor="cancel-reason" required>
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
