import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { addDays, addMonths, format, startOfMonth } from 'date-fns';
import { ChevronRight, CreditCard, Info } from 'lucide-react';
import {
  errorMessage,
  PACKAGE_TIER_LABELS,
  type CaseDetail,
  type PackageOut,
  type PaymentOption,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { ApproxMoney } from '../../components/phase1';
import { useCase, useCreateBooking, useHospital, useHospitalAvailability } from '../../api/queries';
import { AvailabilityCalendar } from '../../components/AvailabilityCalendar';
import {
  EmergencyAckPanel,
  GuestAccountRequired,
  isEmergencyAckError,
  needsEmergencyAck,
  useGuestGate,
} from '../../components/CareGates';
import { Avatar, BackLink, Money } from '../../components/common';
import { paths } from '../../lib/paths';
import { cn, formatDate, intlLocale, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '../../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

type PriceSource = { kind: 'quote'; id: string } | { kind: 'package'; id: string };

const INSTALLMENT_MONTHS = [3, 6, 12] as const;
const MIN_LEAD_DAYS = 3;
const HORIZON_MONTHS = 6;

export function BookPage() {
  const { t } = useAppTranslation();
  const { id = '' } = useParams();
  useDocumentTitle(t('book.title'));
  const query = useCase(id);
  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const c = query.data;
  if (c.booking && c.booking.status !== 'cancelled') {
    return <Navigate to={c.booking.status === 'pending_payment' ? paths.pay(c.booking.id) : paths.booking(c.booking.id)} replace />;
  }
  return <BookGate data={c} />;
}

/** Guests must upgrade (#12) and emergency-screened cases need the acknowledgement (#13) before booking. */
function BookGate({ data }: { data: CaseDetail }) {
  const { t } = useAppTranslation();
  const guest = useGuestGate();
  const [emergency, setEmergency] = useState(false);
  if (guest.isGuest) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={<BackLink to={paths.case(data.id)}>{t('book.backToCase')}</BackLink>} title={t('book.title')} />
        <GuestAccountRequired action={t('book.guestAction')} />
      </div>
    );
  }
  if (needsEmergencyAck(data) || emergency) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={<BackLink to={paths.case(data.id)}>{t('book.backToCase')}</BackLink>} title={t('book.title')} />
        <EmergencyAckPanel caseId={data.id} onAcknowledged={() => setEmergency(false)} />
      </div>
    );
  }
  return (
    <>
      {guest.dialog}
      <BookForm
        data={data}
        onBlocked={(err) => {
          if (isEmergencyAckError(err)) {
            setEmergency(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return true;
          }
          return guest.handleError(err);
        }}
      />
    </>
  );
}

function BookForm({ data, onBlocked }: { data: CaseDetail; onBlocked?: (err: unknown) => boolean }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const create = useCreateBooking();
  const hospital = useHospital(data.hospital.slug);
  const acceptedQuote = data.quotes.find((q) => q.status === 'accepted') ?? null;
  const pendingQuote = data.quotes.find((q) => q.status === 'sent') ?? null;

  const hospitalProcedure = useMemo(
    () => hospital.data?.procedures.find((p) => p.procedure.id === data.procedure?.id) ?? null,
    [hospital.data, data.procedure],
  );
  const packages: PackageOut[] = useMemo(
    () => (hospitalProcedure?.packages ?? []).filter((p) => p.is_active !== false).sort((a, b) => a.price_minor - b.price_minor),
    [hospitalProcedure],
  );

  const [chosenSource, setSource] = useState<PriceSource | null>(null);
  const source: PriceSource | null =
    chosenSource ??
    (acceptedQuote ? { kind: 'quote', id: acceptedQuote.id } : packages[0] ? { kind: 'package', id: packages[0].id } : null);

  const today = new Date();
  const minDate = addDays(today, MIN_LEAD_DAYS);
  const maxDate = addMonths(today, HORIZON_MONTHS);
  const [month, setMonth] = useState(startOfMonth(minDate));
  const [date, setDate] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState('');
  const range = {
    from: format(startOfMonth(month) < minDate ? minDate : startOfMonth(month), 'yyyy-MM-dd'),
    to: format(addDays(addMonths(startOfMonth(month), 1), -1), 'yyyy-MM-dd'),
    ...(data.doctor ? { doctor_id: data.doctor.id } : {}),
  };
  const availability = useHospitalAvailability(data.hospital.id, range);
  const available = useMemo(() => {
    const map = new Map<string, number>();
    for (const slot of availability.data ?? []) {
      if (slot.slot_kind !== 'admission' || slot.date < range.from) continue;
      map.set(slot.date, (map.get(slot.date) ?? 0) + Math.max(0, slot.available));
    }
    return map;
  }, [availability.data, range.from]);
  const noAvailabilityPublished = availability.isSuccess && (availability.data ?? []).length === 0;

  const [option, setOption] = useState<PaymentOption>('deposit');
  const [months, setMonths] = useState<(typeof INSTALLMENT_MONTHS)[number]>(6);
  const [insurance, setInsurance] = useState(false);

  const chosenPackage = source?.kind === 'package' ? packages.find((p) => p.id === source.id) ?? null : null;
  const total = source?.kind === 'quote' ? acceptedQuote?.total_minor ?? null : chosenPackage?.price_minor ?? null;
  const currency = source?.kind === 'quote' ? acceptedQuote?.currency ?? 'INR' : chosenPackage?.currency ?? 'INR';
  const stayDays = acceptedQuote?.estimated_stay_days ?? hospitalProcedure?.hospital_stay_days ?? null;
  const admission = date ?? (manualDate || null);

  async function submit() {
    if (!source) {
      toast.error(t('book.errors.chooseSource'));
      return;
    }
    if (!admission) {
      toast.error(t('book.errors.chooseDate'));
      return;
    }
    try {
      const booking = await create.mutateAsync({
        case_id: data.id,
        ...(source.kind === 'quote' ? { quote_id: source.id } : { package_id: source.id }),
        admission_date: admission,
        payment_option: option,
        ...(option === 'installments' ? { installment_months: months } : {}),
        insurance_claim_requested: insurance,
      });
      toast.success(t('book.created', { number: booking.booking_number }));
      navigate(paths.pay(booking.id));
    } catch (err) {
      if (onBlocked?.(err)) return;
      toast.error(errorMessage(err, t('book.errors.createFailed')));
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={<BackLink to={paths.case(data.id)}>{t('book.backToCase')}</BackLink>} title={t('book.formTitle')} />

      <Card className="mb-6 flex items-center gap-4 p-5">
        <Avatar name={data.doctor?.full_name ?? data.hospital.name} size={56} />
        <div className="min-w-0">
          {data.doctor ? <p className="text-sm text-slate-500">{data.doctor.full_name}</p> : null}
          <p className="text-lg font-semibold">{data.doctor?.specialty_name ?? data.procedure?.name ?? t('bookings.treatment')}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {data.hospital.name}, {data.hospital.city}
          </p>
        </div>
      </Card>

      {!acceptedQuote && pendingQuote ? (
        <Alert tone="amber" className="mb-6" title={t('book.quoteWaitingTitle')}>
          {t('book.quoteWaitingText')}{' '}
          <ButtonLink to={paths.case(data.id)} variant="ghost" size="sm">
            {t('book.reviewQuote')} <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          </ButtonLink>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title={t('book.admissionDate')} description={t('book.admissionDateHint')} />
            <CardBody>
              {availability.isError ? (
                <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
              ) : (
                <AvailabilityCalendar
                  month={month}
                  onMonth={setMonth}
                  available={available}
                  value={date}
                  onChange={(d) => {
                    setDate(d);
                    setManualDate('');
                  }}
                  minMonth={minDate}
                  maxMonth={maxDate}
                  loading={availability.isFetching}
                />
              )}
              {noAvailabilityPublished ? (
                <Field
                  className="mt-4"
                  label={t('book.preferredDate')}
                  htmlFor="manual-date"
                  hint={t('book.preferredDateHint')}
                >
                  <Input
                    id="manual-date"
                    type="date"
                    min={format(minDate, 'yyyy-MM-dd')}
                    max={format(maxDate, 'yyyy-MM-dd')}
                    value={manualDate}
                    onChange={(e) => {
                      setManualDate(e.target.value);
                      setDate(null);
                    }}
                  />
                </Field>
              ) : null}
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                {admission ? (
                  <Trans
                    t={t}
                    i18nKey="book.admissionOn"
                    values={{ date: formatDate(admission, 'EEEE d MMMM yyyy') }}
                    components={{ 0: <strong /> }}
                  />
                ) : (
                  t('book.noDate')
                )}
                {stayDays ? ` · ${t('book.stayDuration', { count: stayDays })}` : ''}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('book.selectPackage')} />
            <CardBody className="space-y-3">
              {acceptedQuote ? (
                <SourceOption
                  selected={source?.kind === 'quote'}
                  onSelect={() => setSource({ kind: 'quote', id: acceptedQuote.id })}
                  title={t('book.acceptedQuote')}
                  description={acceptedQuote.treatment_plan || t('book.itemizedQuote')}
                  price={<ApproxMoney minor={acceptedQuote.total_minor} currency={acceptedQuote.currency} display={acceptedQuote.display_total} className="items-end" />}
                />
              ) : null}
              {hospital.isPending ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                packages.map((p) => (
                  <SourceOption
                    key={p.id}
                    selected={source?.kind === 'package' && source.id === p.id}
                    onSelect={() => setSource({ kind: 'package', id: p.id })}
                    title={p.name || PACKAGE_TIER_LABELS[p.tier]}
                    description={p.description ?? PACKAGE_TIER_LABELS[p.tier]}
                    includes={includesText(t, p)}
                    price={<ApproxMoney minor={p.price_minor} currency={p.currency} display={p.display_price} className="items-end" />}
                    saving={
                      p.original_price_minor && p.original_price_minor > p.price_minor ? (
                        <>
                          <Trans
                            t={t}
                            i18nKey="book.save"
                            components={{ 0: <Money minor={p.original_price_minor - p.price_minor} currency={p.currency} trim /> }}
                          />
                        </>
                      ) : null
                    }
                  />
                ))
              )}
              {!acceptedQuote && !hospital.isPending && packages.length === 0 ? (
                <Alert tone="amber">
                  {t('book.noPackages')}
                </Alert>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={t('book.paymentOption')} />
            <CardBody className="space-y-3">
              {(
                [
                  { value: 'deposit', title: t('book.options.depositTitle'), text: t('book.options.depositText') },
                  { value: 'full', title: t('book.options.fullTitle'), text: t('book.options.fullText') },
                  { value: 'installments', title: t('book.options.planTitle'), text: t('book.options.planText') },
                ] as const
              ).map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border p-3',
                    option === o.value ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-800',
                  )}
                >
                  <input
                    type="radio"
                    name="payment-option"
                    value={o.value}
                    checked={option === o.value}
                    onChange={() => setOption(o.value)}
                    className="mt-1 accent-violet-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{o.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{o.text}</span>
                  </span>
                </label>
              ))}
              {option === 'installments' ? (
                <div className="flex gap-2 ps-1" role="radiogroup" aria-label={t('book.monthsLabel')}>
                  {INSTALLMENT_MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={months === m}
                      onClick={() => setMonths(m)}
                      className={cn(
                        'flex-1 rounded-xl border px-3 py-2 text-sm font-semibold',
                        months === m ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 dark:border-slate-700',
                      )}
                    >
                      {t('bookings.detail.months', { count: m })}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <Checkbox
                  label={t('book.insuranceLabel')}
                  description={t('book.insuranceHint')}
                  checked={insurance}
                  onChange={(e) => setInsurance(e.target.checked)}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('bookings.summary.title')} />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>{t('bookings.list.columns.treatment')}</span>
                <span className="font-medium">{total != null ? <Money minor={total} currency={currency} /> : '—'}</span>
              </div>
              {option === 'installments' && total != null ? (
                <div className="flex justify-between text-slate-500">
                  <span>{t('book.plan')}</span>
                  <span>{t('book.planValue', { count: months })}</span>
                </div>
              ) : null}
              <p className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <Info className="h-4 w-4 shrink-0" aria-hidden />
                {t('book.taxesNote')}
              </p>
              <Button
                size="lg"
                variant="accent"
                className="mt-2 w-full"
                loading={create.isPending}
                disabled={!source || !admission}
                onClick={() => void submit()}
                icon={<CreditCard className="h-4 w-4" aria-hidden />}
              >
                {t('book.proceed')}
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function includesText(t: TFn, p: PackageOut): string | null {
  const parts: string[] = [];
  const inc = p.includes ?? {};
  if (inc.accommodation_nights) parts.push(t('book.includes.nights', { count: inc.accommodation_nights }));
  if (inc.airport_pickup) parts.push(t('book.includes.airportPickup'));
  if (inc.translator) parts.push(t('book.includes.translator'));
  if (inc.meals) parts.push(t('book.includes.meals'));
  if (inc.local_transport) parts.push(t('book.includes.localTransport'));
  if (inc.followup_teleconsults) parts.push(t('book.includes.teleconsults', { count: inc.followup_teleconsults }));
  if (!parts.length) return null;
  // "a, b, c" (no "and"), in the language's own list style
  const list = new Intl.ListFormat(intlLocale(), { type: 'unit', style: 'short' }).format(parts);
  return t('book.includes.text', { list });
}

function SourceOption({
  selected,
  onSelect,
  title,
  description,
  includes,
  price,
  saving,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string | null;
  includes?: string | null;
  price: ReactNode;
  saving?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition',
        selected ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 hover:border-violet-300 dark:border-slate-800',
      )}
    >
      <input type="radio" name="price-source" checked={selected} onChange={onSelect} className="mt-1 accent-violet-600" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {description ? <span className="line-clamp-2 block text-sm text-slate-500 dark:text-slate-400">{description}</span> : null}
        {includes ? <span className="mt-1 block text-xs text-slate-500">{includes}</span> : null}
      </span>
      <span className="text-end">
        <span className="block font-bold">{price}</span>
        {saving ? <span className="block text-xs font-medium text-green-600 dark:text-green-400">{saving}</span> : null}
      </span>
    </label>
  );
}
