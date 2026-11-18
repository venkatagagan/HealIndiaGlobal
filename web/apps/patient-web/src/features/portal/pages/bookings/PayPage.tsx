import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { Gift, Lock, ShieldCheck } from 'lucide-react';
import {
  errorMessage,
  isApiError,
  isFxRateUnavailable,
  newIdempotencyKey,
  patientReferralsApi,
  paymentsApi,
  type BookingOut,
  type CheckoutOut,
  type CreditPurpose,
  type InstallmentOut,
  type PaymentPurpose,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { ApproxMoney } from '../../components/phase1';
import { referralKeys, referralTermsUrl } from '../../api/referrals';
import { invalidateBookingRelated, useBooking, useInstallments, usePatientProfile } from '../../api/queries';
import { BackLink, Money } from '../../components/common';
import { BankTransferPanel, MockPanel, RadioCard, Row, usePaymentMethods, type UiGateway } from '../../components/payPanels';
import { openRazorpayCheckout } from '../../lib/razorpay';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { formatDate, formatMoney, formatNumber, SUPPORTED_CURRENCIES, useDocumentTitle } from '../../lib/shared';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Skeleton,
} from '../../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

interface DueOption {
  purpose: PaymentPurpose;
  label: string;
  /** indicative amount in the booking currency (the server computes the exact amount) */
  amount: number;
  installment?: InstallmentOut;
}

function dueOptions(t: TFn, booking: BookingOut, installments: InstallmentOut[], installmentId: string | null): DueOption[] {
  if (installmentId) {
    const inst = installments.find((i) => i.id === installmentId);
    return inst && inst.status !== 'paid' && inst.status !== 'cancelled'
      ? [
          {
            purpose: 'installment',
            label: t('pay.due.instalment', { seq: inst.seq, date: formatDate(inst.due_date) }),
            amount: inst.amount_minor,
            installment: inst,
          },
        ]
      : [];
  }
  if (booking.status === 'pending_payment') {
    if (booking.payment_option === 'full') return [{ purpose: 'booking_full', label: t('pay.due.full'), amount: booking.total_minor }];
    return [
      { purpose: 'booking_deposit', label: t('pay.due.deposit'), amount: booking.deposit_minor },
      { purpose: 'booking_full', label: t('pay.due.fullNow'), amount: booking.total_minor },
    ];
  }
  if (booking.status === 'cancelled' || booking.balance_due_minor <= 0) return [];
  if (booking.payment_option === 'installments') {
    const next = installments
      .filter((i) => i.status === 'due' || i.status === 'overdue')
      .sort((a, b) => a.seq - b.seq)[0];
    return next
      ? [
          {
            purpose: 'installment',
            label: t('pay.due.instalment', { seq: next.seq, date: formatDate(next.due_date) }),
            amount: next.amount_minor,
            installment: next,
          },
        ]
      : [];
  }
  return [{ purpose: 'booking_balance', label: t('pay.due.balance'), amount: booking.balance_due_minor }];
}

export function PayPage() {
  const { id = '' } = useParams();
  const { t } = useAppTranslation();
  const [params] = useSearchParams();
  useDocumentTitle(t('pay.title'));
  const booking = useBooking(id);
  const installments = useInstallments(id, booking.data?.payment_option === 'installments');

  if (booking.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  if (booking.data.payment_option === 'installments' && installments.isPending) return <Skeleton className="h-72 w-full" />;

  const options = dueOptions(t, booking.data, installments.data ?? [], params.get('installment'));
  if (options.length === 0) return <Navigate to={paths.booking(id)} replace />;
  return <PayForm booking={booking.data} options={options} />;
}

function PayForm({ booking, options }: { booking: BookingOut; options: DueOption[] }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const profile = usePatientProfile(!me.data?.is_guest);
  const [purposeIdx, setPurposeIdx] = useState(0);
  const [gateway, setGateway] = useState<UiGateway>('razorpay');
  const [currencyChoice, setCurrency] = useState<string | null>(null);
  const currency = currencyChoice ?? profile.data?.preferred_currency ?? 'USD';
  const [busy, setBusy] = useState(false);
  const [checkoutState, setCheckoutState] = useState<{ key: string; checkout: CheckoutOut } | null>(null);
  const keys = useRef(new Map<string, string>());

  const due = options[Math.min(purposeIdx, options.length - 1)] as DueOption;
  const attemptKey = `${due.purpose}|${due.installment?.id ?? ''}|${gateway}|${currency}`;
  // a checkout belongs to one set of attempt parameters; changing any of them needs a new order
  const checkout = checkoutState?.key === attemptKey ? checkoutState.checkout : null;
  const setCheckout = (co: CheckoutOut) => setCheckoutState({ key: attemptKey, checkout: co });

  function idempotencyKey(): string {
    let key = keys.current.get(attemptKey);
    if (!key) {
      key = newIdempotencyKey();
      keys.current.set(attemptKey, key);
    }
    return key;
  }

  async function createOrder(): Promise<CheckoutOut> {
    return paymentsApi.createOrder(
      {
        booking_id: booking.id,
        purpose: due.purpose,
        gateway,
        currency,
        ...(due.installment ? { installment_id: due.installment.id } : {}),
      },
      idempotencyKey(),
    );
  }

  function finished(orderId: string) {
    keys.current.delete(attemptKey);
    invalidateBookingRelated(qc);
    navigate(paths.payResult(booking.id, orderId), { replace: true });
  }

  async function pay() {
    setBusy(true);
    try {
      const co = checkout ?? (await createOrder());
      setCheckout(co);
      if (co.order.status === 'paid') {
        finished(co.order.id);
        return;
      }
      if (gateway === 'razorpay') {
        if (!co.razorpay) throw new Error(t('pay.errors.cardUnavailable'));
        const outcome = await openRazorpayCheckout(co.razorpay);
        if (outcome.kind === 'success') {
          await paymentsApi.verifyRazorpay(co.order.id, outcome.response);
          toast.success(t('pay.toast.received'));
          finished(co.order.id);
        } else if (outcome.kind === 'failed') {
          toast.error(t('pay.toast.failed', { message: outcome.message }));
        } else {
          toast.info(t('pay.toast.cancelled'));
        }
      }
      // bank transfer and mock continue in the panels below
    } catch (err) {
      toast.error(isFxRateUnavailable(err) ? t('pay.errors.fxUnavailable') : errorMessage(err, t('pay.errors.startFailed')));
    } finally {
      setBusy(false);
    }
  }

  const methods = usePaymentMethods();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={<BackLink to={paths.booking(booking.id)}>{t('pay.backToBooking', { number: booking.booking_number })}</BackLink>}
        title={t('pay.title')}
        description={t('pay.description', {
          treatment: booking.procedure?.name ?? t('bookings.treatment'),
          hospital: booking.hospital.name,
          date: formatDate(booking.admission_date),
        })}
      />
      <div className="mb-6 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-slate-900">
        <Lock className="h-4 w-4 text-green-600" aria-hidden /> {t('pay.secureNote')}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {options.length > 1 ? (
            <Card>
              <CardHeader title={t('pay.whatToPay')} />
              <CardBody className="space-y-2">
                {options.map((o, i) => (
                  <RadioCard key={o.purpose} name="due" checked={i === purposeIdx} onChange={() => setPurposeIdx(i)} title={o.label}>
                    <Money minor={o.amount} currency={booking.currency} />
                  </RadioCard>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {!me.data?.is_guest && isCreditPurpose(due.purpose) ? (
            <CreditPanel
              bookingId={booking.id}
              purpose={due.purpose}
              onApplied={() => {
                // the amount due changed: an order started before is for the old amount
                keys.current.clear();
                setCheckoutState(null);
              }}
              onPaidInFull={(orderId) => finished(orderId)}
            />
          ) : null}

          <Card>
            <CardHeader title={t('pay.method')} />
            <CardBody className="space-y-2">
              {methods.map((m) => (
                <RadioCard
                  key={m.value}
                  name="gateway"
                  checked={gateway === m.value}
                  onChange={() => setGateway(m.value)}
                  title={
                    <span className="inline-flex items-center gap-2">
                      {m.icon}
                      {m.title}
                    </span>
                  }
                  description={m.text}
                />
              ))}
            </CardBody>
          </Card>

          {checkout && gateway === 'bank_transfer' && checkout.bank_transfer ? (
            <BankTransferPanel checkout={checkout} caseId={booking.case_id} onDone={() => finished(checkout.order.id)} />
          ) : null}
          {checkout && gateway === 'mock' ? <MockPanel checkout={checkout} onDone={() => finished(checkout.order.id)} /> : null}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={t('bookings.summary.title')} />
            <CardBody className="space-y-2 text-sm">
              <Row label={t('bookings.summary.subtotal')}>
                <Money minor={booking.subtotal_minor} currency={booking.currency} />
              </Row>
              {booking.discount_minor ? (
                <Row label={t('bookings.summary.discount')}>
                  -<Money minor={booking.discount_minor} currency={booking.currency} />
                </Row>
              ) : null}
              {booking.service_fee_minor ? (
                <Row label={t('bookings.summary.serviceFee')}>
                  <Money minor={booking.service_fee_minor} currency={booking.currency} />
                </Row>
              ) : null}
              <Row label={t('bookings.summary.taxes')}>
                <Money minor={booking.tax_minor} currency={booking.currency} />
              </Row>
              <Row label={t('bookings.summary.total')} strong>
                <ApproxMoney minor={booking.total_minor} currency={booking.currency} display={booking.display_total} className="items-end text-end" />
              </Row>
              {booking.amount_paid_minor ? (
                <Row label={t('payments.page.paidSoFar')}>
                  <ApproxMoney minor={booking.amount_paid_minor} currency={booking.currency} display={booking.display_amount_paid} className="items-end text-end" />
                </Row>
              ) : null}
              <div className="my-3 border-t border-slate-200 dark:border-slate-800" />
              <Row label={t('pay.dueNow')} strong>
                <Money minor={due.amount} currency={booking.currency} />
              </Row>
              <Field label={t('pay.payIn')} htmlFor="pay-ccy" className="pt-2">
                <Select id="pay-ccy" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              {checkout ? (
                <p className="rounded-xl bg-green-50 p-3 text-sm dark:bg-green-500/10">
                  {t('pay.willBeCharged')}{' '}
                  <strong>
                    <Money minor={checkout.order.amount_minor} currency={checkout.order.currency} />
                  </strong>
                  {checkout.order.currency !== checkout.order.base_currency ? (
                    <span className="block text-xs text-slate-500">
                      <Trans
                        t={t}
                        i18nKey="pay.fxLine"
                        values={{
                          currency: checkout.order.currency,
                          rate: formatNumber(Number(checkout.order.fx_rate), { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
                          baseCurrency: checkout.order.base_currency,
                        }}
                        components={{ 0: <Money minor={checkout.order.base_amount_minor} currency={checkout.order.base_currency} /> }}
                      />
                    </span>
                  ) : null}
                  <span className="block text-xs text-slate-500">{t('pay.orderNumber', { number: checkout.order.order_number })}</span>
                </p>
              ) : (
                <p className="text-xs text-slate-500">{t('pay.exactAmountNote', { currency })}</p>
              )}
              {booking.insurance_claim_requested ? (
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {t('pay.insuranceNote')}
                </p>
              ) : null}
              {!(checkout && gateway !== 'razorpay') ? (
                <Button size="lg" variant="accent" className="mt-3 w-full" loading={busy} onClick={() => void pay()}>
                  {gateway === 'razorpay' ? t('pay.paySecurely') : gateway === 'bank_transfer' ? t('pay.getBankDetails') : t('pay.createTestOrder')}
                </Button>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

const CREDIT_PURPOSES: readonly PaymentPurpose[] = ['booking_deposit', 'booking_balance', 'booking_full'];
function isCreditPurpose(purpose: PaymentPurpose): purpose is CreditPurpose {
  return CREDIT_PURPOSES.includes(purpose);
}

/** Referral credit on the pay screen: preview, "Use my credit", then the rest is paid with a normal order. */
function CreditPanel({
  bookingId,
  purpose,
  onApplied,
  onPaidInFull,
}: {
  bookingId: string;
  purpose: CreditPurpose;
  onApplied: () => void;
  onPaidInFull: (orderId: string) => void;
}) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: referralKeys.preview(bookingId, purpose),
    queryFn: () => patientReferralsApi.preview(bookingId, purpose),
    retry: false,
  });
  const p = preview.data;
  // nothing to show without credit (or when the programme is off and there is none)
  if (!p || p.available_minor <= 0) return null;

  async function apply() {
    setBusy(true);
    try {
      const res = await patientReferralsApi.apply({ booking_id: bookingId, purpose });
      void qc.invalidateQueries({ queryKey: referralKeys.all });
      invalidateBookingRelated(qc);
      onApplied();
      if (res.remaining_due_minor <= 0) {
        toast.success(t('referral.pay.paidInFull'));
        onPaidInFull(res.order_id);
      } else {
        toast.success(t('referral.pay.applied', { amount: formatMoney(res.applied_minor, res.currency) }));
      }
    } catch (err) {
      const code = isApiError(err) ? err.code : null;
      if (code === 'credit_changed') toast.error(t('referral.pay.errors.changed'));
      else if (code === 'payment_in_progress') toast.error(t('referral.pay.errors.inProgress'));
      else if (code === 'credit_not_applicable') toast.error(t('referral.pay.errors.notApplicable'));
      else toast.error(errorMessage(err, t('referral.pay.errors.failed')));
      void qc.invalidateQueries({ queryKey: referralKeys.all });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t('referral.pay.title')} action={<Gift className="h-5 w-5 text-accent-ink" aria-hidden />} />
      <CardBody className="space-y-3 text-sm">
        <p className="text-fg">
          <Trans t={t} i18nKey="referral.pay.available" components={{ 0: <Money minor={p.available_minor} currency={p.currency} className="font-semibold" /> }} />
        </p>
        {p.applicable ? (
          <>
            <div className="space-y-1 rounded-xl bg-surface-2 p-3">
              <Row label={t('referral.pay.willApply')}>
                <Money minor={p.apply_minor} currency={p.currency} />
              </Row>
              <Row label={t('referral.pay.remaining')} strong>
                <Money minor={p.remaining_due_minor} currency={p.currency} />
              </Row>
            </div>
            <p className="text-xs text-muted">{p.remaining_due_minor > 0 ? t('referral.pay.restNote') : t('referral.pay.fullNote')}</p>
            <Button variant="primary" loading={busy} onClick={() => void apply()}>
              {t('referral.pay.use')}
            </Button>
          </>
        ) : p.reason ? (
          <p className="text-muted">{t(`referral.pay.reasons.${p.reason}`, { defaultValue: t('referral.pay.errors.notApplicable') })}</p>
        ) : null}
        <p className="text-xs text-muted">
          <a href={referralTermsUrl()} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {t('referral.pay.termsLink')}
          </a>
        </p>
      </CardBody>
    </Card>
  );
}
