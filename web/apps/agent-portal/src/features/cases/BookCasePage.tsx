import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, CalendarDays, Check } from 'lucide-react';
import {
  PACKAGE_TIER_LABELS,
  PAYMENT_OPTIONS,
  PAYMENT_OPTION_LABELS,
  bookingsApi,
  catalogApi,
  casesApi,
  errorMessage,
  type PackageOut,
  type PaymentOption,
} from '@hig/shared/api';
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingBlock,
  Money,
  PageHeader,
  Segmented,
  Spinner,
} from '../../components/ui';
import { qk } from '../../lib/queries';
import { cn, formatDate, isoDateFromToday, useDocumentTitle } from '../../lib/shared';
import { EmergencyAckPanel, PatientUpgradeRequiredNotice, needsEmergencyAck } from '@hig/shared/ui';
import { CARE_GATE_MESSAGES, QuoteDetails, careGateOf, type CareGate } from './quotes';

export function BookCasePage() {
  const { caseId = '' } = useParams();
  useDocumentTitle('Book treatment');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const caseQuery = useQuery({ queryKey: qk.case(caseId), queryFn: () => casesApi.get(caseId) });
  const c = caseQuery.data;

  const hospital = useQuery({
    queryKey: qk.hospital(c?.hospital.slug ?? ''),
    queryFn: () => catalogApi.getHospital(c?.hospital.slug ?? ''),
    enabled: Boolean(c),
  });
  const from = isoDateFromToday(3);
  const to = isoDateFromToday(120);
  const availability = useQuery({
    queryKey: ['availability', c?.hospital.id, c?.doctor?.id ?? null, from, to],
    queryFn: () =>
      catalogApi.hospitalAvailability(c?.hospital.id ?? '', { from, to, ...(c?.doctor ? { doctor_id: c.doctor.id } : {}) }),
    enabled: Boolean(c),
  });

  const acceptedQuote = c?.quotes.find((q) => q.status === 'accepted') ?? null;
  const packages: PackageOut[] = useMemo(() => {
    if (!hospital.data || !c?.procedure) return [];
    const hp = hospital.data.procedures.find((p) => p.procedure.id === c.procedure?.id);
    return hp?.packages.filter((p) => p.is_active !== false) ?? [];
  }, [hospital.data, c?.procedure]);

  const [packageId, setPackageId] = useState<string | null>(null);
  const [admissionDate, setAdmissionDate] = useState('');
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('deposit');
  const [installmentMonths, setInstallmentMonths] = useState(6);
  const [insurance, setInsurance] = useState(false);
  const [gate, setGate] = useState<CareGate | null>(null);

  const create = useMutation({
    mutationFn: () =>
      bookingsApi.create({
        case_id: caseId,
        ...(acceptedQuote ? { quote_id: acceptedQuote.id } : packageId ? { package_id: packageId } : {}),
        admission_date: admissionDate,
        payment_option: paymentOption,
        ...(paymentOption === 'installments' ? { installment_months: installmentMonths } : {}),
        insurance_claim_requested: insurance,
      }),
    onSuccess: (booking) => {
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(`Booking ${booking.booking_number} created`);
      navigate(`/bookings/${booking.id}/pay`);
    },
    onError: (error) => {
      const blocked = careGateOf(error);
      setGate(blocked);
      toast.error(blocked ? CARE_GATE_MESSAGES[blocked] : errorMessage(error));
    },
  });

  if (caseQuery.isPending) return <LoadingBlock />;
  if (caseQuery.isError || !c) return <ErrorState error={caseQuery.error} onRetry={() => void caseQuery.refetch()} />;
  if (c.booking) return <Navigate to={`/bookings/${c.booking.id}/pay`} replace />;

  const back = (
    <Link to={`/cases/${c.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {c.case_number}
    </Link>
  );

  if (c.status !== 'accepted') {
    return (
      <div>
        <PageHeader back={back} title="Book treatment" />
        <Card>
          <EmptyState
            title="Accept a quote first"
            description={`This case is “${c.status.replace('_', ' ')}”. A booking can be created once a quote from the hospital has been accepted.`}
          />
        </Card>
      </div>
    );
  }

  if (needsEmergencyAck(c) || gate === 'emergency') {
    return (
      <div>
        <PageHeader back={back} title="Book treatment" description={`${c.patient.full_name} · ${c.hospital.name}`} />
        <EmergencyAckPanel caseId={c.id} audience="agent" onAcknowledged={() => setGate(null)} />
      </div>
    );
  }
  if (gate === 'guest') {
    return (
      <div>
        <PageHeader back={back} title="Book treatment" description={`${c.patient.full_name} · ${c.hospital.name}`} />
        <PatientUpgradeRequiredNotice patientName={c.patient.full_name} />
        <Button variant="outline" className="mt-4" onClick={() => setGate(null)}>
          Try again
        </Button>
      </div>
    );
  }

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const price = acceptedQuote
    ? { minor: acceptedQuote.total_minor, currency: acceptedQuote.currency }
    : selectedPackage
      ? { minor: selectedPackage.price_minor, currency: selectedPackage.currency }
      : null;
  const availableDates = (availability.data ?? []).filter((d) => d.slot_kind === 'admission' && d.available > 0);
  const canSubmit = Boolean(admissionDate) && admissionDate >= from && Boolean(acceptedQuote || packageId);

  return (
    <div>
      <PageHeader back={back} title="Book treatment" description={`${c.patient.full_name} · ${c.hospital.name}${c.doctor ? ` · ${c.doctor.full_name}` : ''}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {acceptedQuote ? (
            <Card>
              <CardHeader title="Accepted quote" />
              <div className="p-5">
                <QuoteDetails quote={acceptedQuote} />
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Choose a package" description="Package prices from the hospital’s published rates" />
              {hospital.isPending ? (
                <LoadingBlock />
              ) : packages.length === 0 ? (
                <EmptyState title="No packages available" description="Ask the hospital to send a quote for this case instead." />
              ) : (
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  {packages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={packageId === p.id}
                      onClick={() => setPackageId(p.id)}
                      className={cn(
                        'rounded-xl border p-4 text-left transition-colors',
                        packageId === p.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2',
                      )}
                    >
                      <p className="text-xs font-semibold text-muted uppercase">{PACKAGE_TIER_LABELS[p.tier]}</p>
                      <p className="mt-1 font-semibold">{p.name}</p>
                      <p className="mt-2 text-lg font-bold">
                        <Money minor={p.price_minor} currency={p.currency} />
                      </p>
                      {p.original_price_minor && p.original_price_minor > p.price_minor && (
                        <p className="text-xs text-primary-ink">
                          Save <Money minor={p.original_price_minor - p.price_minor} currency={p.currency} />
                        </p>
                      )}
                      {p.description && <p className="mt-2 text-xs text-muted">{p.description}</p>}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Admission date" description={c.doctor ? `Availability for ${c.doctor.full_name}` : 'Hospital admission availability'} />
            <div className="space-y-4 p-5">
              {availability.isPending ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : availableDates.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Available admission dates">
                  {availableDates.slice(0, 30).map((d) => (
                    <button
                      key={`${d.date}-${d.slot_kind}`}
                      type="button"
                      role="radio"
                      aria-checked={admissionDate === d.date}
                      onClick={() => setAdmissionDate(d.date)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm',
                        admissionDate === d.date ? 'border-primary bg-primary-700 text-white' : 'border-primary/40 bg-primary-soft text-primary-ink hover:border-primary',
                      )}
                    >
                      {formatDate(d.date, 'EEE d MMM')}
                      <span className="block text-xs opacity-80">{d.available} slot{d.available === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No published availability — choose a preferred date and the hospital will confirm.</p>
              )}
              <FormField label="Or pick a date" htmlFor="admission-date" hint="At least 3 days from today">
                <div className="relative max-w-xs">
                  <CalendarDays className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                  <Input id="admission-date" type="date" className="pl-9" min={from} max={to} value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
                </div>
              </FormField>
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment option" />
            <div className="space-y-4 p-5">
              <Segmented<PaymentOption>
                ariaLabel="Payment option"
                value={paymentOption}
                onChange={setPaymentOption}
                options={PAYMENT_OPTIONS.map((o) => ({ value: o, label: PAYMENT_OPTION_LABELS[o] }))}
              />
              <p className="text-sm text-muted">
                {paymentOption === 'full' && 'Pay the full amount now to confirm the booking.'}
                {paymentOption === 'deposit' && 'Pay a deposit now to confirm the booking; the balance is due before admission.'}
                {paymentOption === 'installments' && 'Pay a deposit now and the balance in monthly instalments.'}
              </p>
              {paymentOption === 'installments' && (
                <Segmented<string>
                  ariaLabel="Instalment months"
                  value={String(installmentMonths)}
                  onChange={(v) => setInstallmentMonths(Number(v))}
                  options={[3, 6, 12].map((m) => ({ value: String(m), label: `${m} months` }))}
                />
              )}
              <Checkbox
                checked={insurance}
                onChange={(e) => setInsurance(e.target.checked)}
                label="Patient will claim through insurance"
                description="The hospital prepares the documents required for the claim."
              />
            </div>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader title="Summary" />
          <dl className="space-y-3 p-5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Treatment</dt>
              <dd className="text-right">{c.procedure?.name ?? c.specialty?.name ?? 'As quoted'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Admission</dt>
              <dd>{admissionDate ? formatDate(admissionDate) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Payment</dt>
              <dd>
                {PAYMENT_OPTION_LABELS[paymentOption]}
                {paymentOption === 'installments' ? ` · ${installmentMonths} mo` : ''}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-3 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="font-bold">{price ? <Money minor={price.minor} currency={price.currency} /> : '—'}</dd>
            </div>
            <p className="text-xs text-muted">Final amounts, taxes and the deposit are calculated by the platform when the booking is created.</p>
          </dl>
          <div className="border-t border-border p-5">
            <Button className="w-full" size="lg" disabled={!canSubmit} loading={create.isPending} icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => create.mutate()}>
              Create booking & continue to payment
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
