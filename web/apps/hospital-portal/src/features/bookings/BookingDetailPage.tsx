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
import { ItineraryCard } from './ItineraryCard';
import { paymentState } from './paymentState';
import { TravelCard, VisaCard } from './VisaCard';

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={strong ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}>{value}</span>
    </div>
  );
}

export function BookingDetailPage() {
  const { bookingId = '' } = useParams();
  const ids = useId();
  const queryClient = useQueryClient();
  const booking = useQuery({ queryKey: qk.booking(bookingId), queryFn: () => bookingsApi.get(bookingId), enabled: !!bookingId });
  useDocumentTitle(booking.data?.booking_number ?? 'Booking');
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
      toast.success(vars.kind === 'admit' ? 'Patient admitted' : 'Patient discharged - treatment completed');
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
      toast.success('Booking cancelled. The patient receives a full refund of everything paid.');
      setAction(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (booking.isPending) return <PageLoader />;
  if (booking.isError) {
    return (
      <Card>
        <ErrorState
          title={isApiError(booking.error) && booking.error.isNotFound ? 'Booking not found' : 'Could not load booking'}
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
            <ArrowLeft className="h-4 w-4" aria-hidden /> All bookings
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.booking_number} <StatusBadge status={b.status} />
          </span>
        }
        description={`${b.patient.full_name} · ${b.procedure?.name ?? b.package?.name ?? 'Treatment'} · admission ${formatDate(b.admission_date)}`}
        actions={
          <>
            <LinkButton to={`/cases/${b.case_id}`} variant="outline" icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}>
              View case
            </LinkButton>
            {b.status === 'confirmed' && (
              <Button icon={<BedDouble className="h-4 w-4" aria-hidden />} onClick={() => setAction('admit')}>
                Admit patient
              </Button>
            )}
            {b.status === 'admitted' && (
              <Button variant="accent" icon={<LogOut className="h-4 w-4" aria-hidden />} onClick={() => setAction('complete')}>
                Discharge &amp; complete
              </Button>
            )}
            {(b.status === 'pending_payment' || b.status === 'confirmed') && (
              <Button variant="outline" icon={<Ban className="h-4 w-4" aria-hidden />} onClick={() => setAction('cancel')}>
                Cancel booking
              </Button>
            )}
          </>
        }
      />

      {b.status === 'pending_payment' && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Waiting for the patient&apos;s deposit of {formatMoney(b.deposit_minor, b.currency)}. The booking is confirmed
          automatically once payment is captured.
        </p>
      )}
      {b.status === 'cancelled' && (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
          Cancelled {formatDateTime(b.cancelled_at)}
          {b.cancel_reason ? ` - ${b.cancel_reason}` : ''}.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Treatment" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: 'Patient', value: b.patient.full_name },
                  { label: 'Doctor', value: b.doctor?.full_name ?? '—' },
                  { label: 'Procedure', value: b.procedure?.name ?? '—' },
                  {
                    label: 'Package',
                    value: b.package ? `${b.package.name} (${PACKAGE_TIER_LABELS[b.package.tier] ?? b.package.tier})` : 'Custom quote',
                  },
                  { label: 'Admission date', value: formatDate(b.admission_date) },
                  { label: 'Discharge date', value: formatDate(b.discharge_date) },
                  { label: 'Duration', value: b.duration_days != null ? `${b.duration_days} days` : '—' },
                  { label: 'Insurance claim', value: b.insurance_claim_requested ? 'Requested by patient' : 'No' },
                  { label: 'Confirmed', value: formatDateTime(b.confirmed_at) },
                  { label: 'Admitted', value: formatDateTime(b.admitted_at) },
                  { label: 'Completed', value: formatDateTime(b.completed_at) },
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
            <CardHeader title="Payment" actions={<StatusBadge status={pay.tone} label={pay.label} />} />
            <CardBody className="divide-y divide-slate-100 dark:divide-slate-800">
              <div className="pb-2">
                <MoneyRow label="Subtotal" value={formatMoney(b.subtotal_minor, b.currency)} />
                {b.discount_minor > 0 && <MoneyRow label="Discount" value={`− ${formatMoney(b.discount_minor, b.currency)}`} />}
                {b.service_fee_minor > 0 && <MoneyRow label="Service fee" value={formatMoney(b.service_fee_minor, b.currency)} />}
                {b.tax_minor > 0 && <MoneyRow label="Tax" value={formatMoney(b.tax_minor, b.currency)} />}
                <MoneyRow label="Total" value={formatMoney(b.total_minor, b.currency)} strong />
              </div>
              <div className="pt-2">
                <MoneyRow label="Deposit required" value={formatMoney(b.deposit_minor, b.currency)} />
                <MoneyRow label="Paid" value={formatMoney(b.amount_paid_minor, b.currency)} />
                {b.amount_refunded_minor > 0 && <MoneyRow label="Refunded" value={formatMoney(b.amount_refunded_minor, b.currency)} />}
                <MoneyRow label="Balance due" value={formatMoney(b.balance_due_minor, b.currency)} strong />
                <MoneyRow
                  label="Payment plan"
                  value={`${PAYMENT_OPTION_LABELS[b.payment_option] ?? b.payment_option}${b.installment_months ? ` · ${b.installment_months} months` : ''}`}
                />
              </div>
              <p className="pt-3 text-xs text-slate-500 dark:text-slate-400">
                Patient payments are held in escrow and settled to your payout account after discharge, net of platform
                commission and taxes.
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
        title="Admit patient?"
        description={`Confirm that ${b.patient.full_name} has been admitted. The case moves to "In treatment" and the patient is notified.`}
        noteLabel="Note (optional)"
        confirmLabel="Confirm admission"
      />
      <ConfirmDialog
        open={action === 'cancel'}
        onClose={() => setAction(null)}
        onConfirm={(note) => cancel.mutate(note.trim())}
        loading={cancel.isPending}
        tone="danger"
        title="Cancel this booking?"
        description={`Cancelling on behalf of the hospital refunds ${b.patient.full_name} 100% of everything paid (${formatMoney(Math.max(0, b.amount_paid_minor - b.amount_refunded_minor), b.currency)}). The patient and their coordinator are notified. This cannot be undone.`}
        noteLabel="Reason (shared with the patient)"
        noteRequired
        confirmLabel="Cancel booking"
      />
      <ConfirmDialog
        open={action === 'complete'}
        onClose={() => setAction(null)}
        onConfirm={(note) => {
          if (!dischargeDate) {
            toast.error('Pick the discharge date');
            return;
          }
          transition.mutate({ kind: 'complete', note });
        }}
        loading={transition.isPending}
        title="Discharge & complete treatment?"
        description="This completes the booking and starts the settlement of your payout. It cannot be undone."
        noteLabel="Discharge note (optional)"
        confirmLabel="Discharge patient"
      >
        <FormField label="Discharge date" htmlFor={`${ids}-discharge`} required className="mt-4">
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
