import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BedDouble, Ban, ClipboardCheck, LogOut } from 'lucide-react';
import {
  PACKAGE_TIER_LABELS,
  PAYMENT_OPTION_LABELS,
  bookingsApi,
  errorMessage,
  isApiError,
} from '@hig/shared/api';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  PageHeader,
  PageLoader,
  StatusBadge,
} from '../../components/ui';
import { formatDate, formatDateTime, formatMoney, toIsoDate } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useAppTranslation } from '../../i18n';
import { ItineraryCard } from './ItineraryCard';
import { paymentState } from './paymentState';
import { TravelCard, VisaCard } from './VisaCard';

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={strong ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}>{value}</span>
    </div>
  );
}

export function BookingDetailPage() {
  const { bookingId = '' } = useParams();
  const { t } = useAppTranslation();
  const ids = useId();
  const queryClient = useQueryClient();
  const booking = useQuery({ queryKey: qk.booking(bookingId), queryFn: () => bookingsApi.get(bookingId), enabled: !!bookingId });
  useDocumentTitle(booking.data?.booking_number ?? t('bookings.detail.docTitle'));
  const [action, setAction] = useState<'admit' | 'complete' | 'cancel' | null>(null);
  const [dischargeDate, setDischargeDate] = useState(() => toIsoDate(new Date()));

  const transition = useMutation({
    mutationFn: ({ kind, note }: { kind: 'admit' | 'complete'; note: string }) =>
      kind === 'admit'
        ? bookingsApi.admit(bookingId, note ? { note } : {})
        : bookingsApi.complete(bookingId, { ...(note ? { note } : {}), discharge_date: dischargeDate }),
    onSuccess: (updated, vars) => {
      queryClient.setQueryData(qk.booking(bookingId), updated);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(vars.kind === 'admit' ? t('bookings.detail.admitted') : t('bookings.detail.discharged'));
      setAction(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Hospital-initiated cancellation: the patient is refunded 100% of what they paid (server decides the amount).
  const cancel = useMutation({
    mutationFn: (reason: string) => bookingsApi.cancel(bookingId, { reason }),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.booking(bookingId), updated);
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(t('bookings.detail.cancelled'));
      setAction(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (booking.isPending) return <PageLoader />;
  if (booking.isError) {
    return (
      <Card>
        <ErrorState
          title={isApiError(booking.error) && booking.error.isNotFound ? t('bookings.detail.notFound') : t('bookings.detail.loadError')}
          error={booking.error}
          onRetry={() => void booking.refetch()}
        />
      </Card>
    );
  }

  const b = booking.data;
  const pay = paymentState(b);
  const editableItinerary = b.status !== 'cancelled' && b.status !== 'completed';
  const admittedOn = b.admitted_at ? toIsoDate(b.admitted_at) : (b.admission_date ?? '');

  return (
    <>
      <PageHeader
        back={
          <Link to="/bookings" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('bookings.detail.allBookings')}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.booking_number} <StatusBadge status={b.status} />
          </span>
        }
        description={`${b.patient.full_name} · ${b.procedure?.name ?? b.package?.name ?? t('bookings.detail.treatment')} · ${t('bookings.detail.admissionOn', { date: formatDate(b.admission_date) })}`}
        actions={
          <>
            <LinkButton to={`/cases/${b.case_id}`} variant="outline" icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}>
              {t('bookings.detail.viewCase')}
            </LinkButton>
            {b.status === 'confirmed' && (
              <Button icon={<BedDouble className="h-4 w-4" aria-hidden />} onClick={() => setAction('admit')}>
                {t('bookings.detail.admitPatient')}
              </Button>
            )}
            {b.status === 'admitted' && (
              <Button variant="accent" icon={<LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />} onClick={() => setAction('complete')}>
                {t('bookings.detail.dischargeComplete')}
              </Button>
            )}
            {(b.status === 'pending_payment' || b.status === 'confirmed') && (
              <Button variant="outline" icon={<Ban className="h-4 w-4" aria-hidden />} onClick={() => setAction('cancel')}>
                {t('bookings.detail.cancelBooking')}
              </Button>
            )}
          </>
        }
      />

      {b.status === 'pending_payment' && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          {t('bookings.detail.awaitingDeposit', { amount: formatMoney(b.deposit_minor, b.currency) })}
        </p>
      )}
      {b.status === 'cancelled' && (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
          {b.cancel_reason
            ? t('bookings.detail.cancelledOnReason', { date: formatDateTime(b.cancelled_at), reason: b.cancel_reason })
            : t('bookings.detail.cancelledOn', { date: formatDateTime(b.cancelled_at) })}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('bookings.detail.treatment')} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: t('common.patient'), value: b.patient.full_name },
                  { label: t('common.doctor'), value: b.doctor?.full_name ?? '—' },
                  { label: t('common.procedure'), value: b.procedure?.name ?? '—' },
                  {
                    label: t('bookings.detail.package'),
                    value: b.package
                      ? `${b.package.name} (${PACKAGE_TIER_LABELS[b.package.tier] ?? b.package.tier})`
                      : t('bookings.detail.customQuote'),
                  },
                  { label: t('bookings.detail.admissionDate'), value: formatDate(b.admission_date) },
                  { label: t('bookings.detail.dischargeDate'), value: formatDate(b.discharge_date) },
                  {
                    label: t('common.duration'),
                    value: b.duration_days != null ? t('bookings.detail.days', { count: b.duration_days }) : '—',
                  },
                  {
                    label: t('bookings.detail.insuranceClaim'),
                    value: b.insurance_claim_requested ? t('bookings.detail.requestedByPatient') : t('bookings.detail.no'),
                  },
                  { label: t('bookings.detail.confirmed'), value: formatDateTime(b.confirmed_at) },
                  { label: t('bookings.detail.admittedLabel'), value: formatDateTime(b.admitted_at) },
                  { label: t('bookings.detail.completed'), value: formatDateTime(b.completed_at) },
                ]}
              />
            </CardBody>
          </Card>
          <ItineraryCard bookingId={b.id} editable={editableItinerary} />
          <VisaCard caseId={b.case_id} />
          <TravelCard caseId={b.case_id} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('bookings.detail.payment')} actions={<StatusBadge status={pay.tone} label={pay.label} />} />
            <CardBody className="divide-y divide-slate-100 dark:divide-slate-800">
              <div className="pb-2">
                <MoneyRow label={t('bookings.detail.subtotal')} value={formatMoney(b.subtotal_minor, b.currency)} />
                {b.discount_minor > 0 && <MoneyRow label={t('bookings.detail.discount')} value={`− ${formatMoney(b.discount_minor, b.currency)}`} />}
                {b.service_fee_minor > 0 && <MoneyRow label={t('bookings.detail.serviceFee')} value={formatMoney(b.service_fee_minor, b.currency)} />}
                {b.tax_minor > 0 && <MoneyRow label={t('bookings.detail.tax')} value={formatMoney(b.tax_minor, b.currency)} />}
                <MoneyRow label={t('bookings.detail.total')} value={formatMoney(b.total_minor, b.currency)} strong />
              </div>
              <div className="pt-2">
                <MoneyRow label={t('bookings.detail.depositRequired')} value={formatMoney(b.deposit_minor, b.currency)} />
                <MoneyRow label={t('bookings.detail.paid')} value={formatMoney(b.amount_paid_minor, b.currency)} />
                {b.amount_refunded_minor > 0 && <MoneyRow label={t('bookings.detail.refunded')} value={formatMoney(b.amount_refunded_minor, b.currency)} />}
                <MoneyRow label={t('bookings.detail.balanceDue')} value={formatMoney(b.balance_due_minor, b.currency)} strong />
                <MoneyRow
                  label={t('bookings.detail.paymentPlan')}
                  value={`${PAYMENT_OPTION_LABELS[b.payment_option] ?? b.payment_option}${b.installment_months ? ` · ${t('bookings.detail.months', { count: b.installment_months })}` : ''}`}
                />
              </div>
              <p className="pt-3 text-xs text-slate-500 dark:text-slate-400">
                {t('bookings.detail.escrowNote')}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={action === 'admit'}
        onClose={() => setAction(null)}
        onConfirm={(note) => transition.mutate({ kind: 'admit', note })}
        loading={transition.isPending}
        title={t('bookings.detail.admitTitle')}
        description={t('bookings.detail.admitDescription', { name: b.patient.full_name })}
        noteLabel={t('bookings.detail.noteOptional')}
        confirmLabel={t('bookings.detail.confirmAdmission')}
      />
      <ConfirmDialog
        open={action === 'cancel'}
        onClose={() => setAction(null)}
        onConfirm={(note) => cancel.mutate(note.trim())}
        loading={cancel.isPending}
        tone="danger"
        title={t('bookings.detail.cancelTitle')}
        description={t('bookings.detail.cancelDescription', {
          name: b.patient.full_name,
          amount: formatMoney(Math.max(0, b.amount_paid_minor - b.amount_refunded_minor), b.currency),
        })}
        noteLabel={t('bookings.detail.cancelReason')}
        noteRequired
        confirmLabel={t('bookings.detail.cancelBooking')}
      />
      <ConfirmDialog
        open={action === 'complete'}
        onClose={() => setAction(null)}
        onConfirm={(note) => {
          if (!dischargeDate) {
            toast.error(t('bookings.detail.pickDischargeDate'));
            return;
          }
          transition.mutate({ kind: 'complete', note });
        }}
        loading={transition.isPending}
        title={t('bookings.detail.dischargeTitle')}
        description={t('bookings.detail.dischargeDescription')}
        noteLabel={t('bookings.detail.dischargeNote')}
        confirmLabel={t('bookings.detail.dischargePatient')}
      >
        <FormField label={t('bookings.detail.dischargeDate')} htmlFor={`${ids}-discharge`} required className="mt-4">
          <Input
            id={`${ids}-discharge`}
            type="date"
            value={dischargeDate}
            min={admittedOn || undefined}
            max={toIsoDate(new Date())}
            onChange={(e) => setDischargeDate(e.target.value)}
          />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
