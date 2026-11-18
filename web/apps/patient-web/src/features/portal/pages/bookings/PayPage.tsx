import { useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, Copy, CreditCard, FlaskConical, Lock, ShieldCheck, Upload } from 'lucide-react';
import {
  documentsApi,
  errorMessage,
  isFxRateUnavailable,
  newIdempotencyKey,
  paymentsApi,
  type BookingOut,
  type CheckoutOut,
  type InstallmentOut,
  type PaymentGateway,
  type PaymentPurpose,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { invalidateBookingRelated, useBooking, useInstallments, usePatientProfile } from '../../api/queries';
import { BackLink, formatBytes, MAX_UPLOAD_BYTES, Money } from '../../components/common';
import { openRazorpayCheckout } from '../../lib/razorpay';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { cn, formatDate, formatNumber, SUPPORTED_CURRENCIES, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

/** Mock gateway is only offered in development builds or when explicitly enabled for a test environment. */
const MOCK_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_PAYMENTS === 'true';

type UiGateway = Extract<PaymentGateway, 'razorpay' | 'bank_transfer' | 'mock'>;

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

  const methods: { value: UiGateway; title: string; text: string; icon: ReactNode }[] = [
    {
      value: 'razorpay',
      title: t('pay.methods.cardTitle'),
      text: t('pay.methods.cardText'),
      icon: <CreditCard className="h-5 w-5" aria-hidden />,
    },
    {
      value: 'bank_transfer',
      title: t('pay.methods.bankTitle'),
      text: t('pay.methods.bankText'),
      icon: <Building2 className="h-5 w-5" aria-hidden />,
    },
    ...(MOCK_ENABLED
      ? [
          {
            value: 'mock' as const,
            title: t('pay.methods.mockTitle'),
            text: t('pay.methods.mockText'),
            icon: <FlaskConical className="h-5 w-5" aria-hidden />,
          },
        ]
      : []),
  ];

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
                <Money minor={booking.total_minor} currency={booking.currency} />
              </Row>
              {booking.amount_paid_minor ? (
                <Row label={t('payments.page.paidSoFar')}>
                  <Money minor={booking.amount_paid_minor} currency={booking.currency} />
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

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'text-base font-semibold')}>
      <span className={strong ? '' : 'text-slate-600 dark:text-slate-400'}>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

function RadioCard({
  name,
  checked,
  onChange,
  title,
  description,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition',
        checked ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 hover:border-violet-300 dark:border-slate-800',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {description ? <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span> : null}
      </span>
      {children ? <span className="text-sm font-semibold">{children}</span> : null}
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-violet-600" />
    </label>
  );
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useAppTranslation();
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="break-all font-mono text-sm">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => toast.success(t('pay.copy.copied', { label })),
            () => toast.error(t('pay.copy.failed')),
          );
        }}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label={t('pay.copy.label', { label })}
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

function BankTransferPanel({ checkout, caseId, onDone }: { checkout: CheckoutOut; caseId: string | null | undefined; onDone: () => void }) {
  const { t } = useAppTranslation();
  const details = checkout.bank_transfer!;
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) {
      toast.error(t('pay.bank.errors.noFile'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t('pay.bank.errors.tooLarge', { size: formatBytes(MAX_UPLOAD_BYTES) }));
      return;
    }
    if (!reference.trim()) {
      toast.error(t('pay.bank.errors.noReference'));
      return;
    }
    setBusy(true);
    try {
      // link the receipt to the booking's case so finance sees it on reconciliation (the server also links
      // it to the order's case when the proof is submitted)
      const doc = await documentsApi.upload({ file, kind: 'payment_proof', case_id: checkout.order.case_id ?? caseId ?? undefined });
      await paymentsApi.submitBankTransferProof(checkout.order.id, { document_id: doc.id, reference: reference.trim() });
      toast.success(t('pay.bank.submitted'));
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, t('pay.bank.errors.submitFailed')));
    } finally {
      setBusy(false);
    }
  }

  const amount = checkout.order;
  return (
    <Card>
      <CardHeader
        title={t('pay.bank.title')}
        description={t('pay.bank.description')}
      />
      <CardBody className="space-y-4">
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-500">{t('pay.bank.amount')}</span>
            <strong>
              <Money minor={amount.amount_minor} currency={amount.currency} />
            </strong>
          </div>
          <CopyRow label={t('pay.bank.reference')} value={details.reference} />
          <CopyRow label={t('pay.bank.beneficiary')} value={details.beneficiary_name} />
          <CopyRow label={t('pay.bank.bank')} value={details.bank_name} />
          <CopyRow label={t('pay.bank.accountNumber')} value={details.account_number} />
          <CopyRow label={t('pay.bank.swift')} value={details.swift} />
          <CopyRow label={t('pay.bank.iban')} value={details.iban} />
          <CopyRow label={t('pay.bank.ifsc')} value={details.ifsc} />
        </div>
        <Alert tone="amber">
          {t('pay.bank.feesNote')}
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pay.bank.yourReference')} htmlFor="bt-ref" required>
            <Input id="bt-ref" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('pay.bank.referencePlaceholder')} />
          </Field>
          <Field
            label={t('pay.bank.receipt')}
            htmlFor="bt-file"
            required
            hint={file ? `${file.name} · ${formatBytes(file.size)}` : t('pay.bank.receiptHint')}
          >
            <Input
              id="bt-file"
              type="file"
              accept=".pdf,image/*"
              className="py-1.5"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <Button onClick={() => void submit()} loading={busy} icon={<Upload className="h-4 w-4" aria-hidden />}>
          {t('pay.bank.submit')}
        </Button>
      </CardBody>
    </Card>
  );
}

function MockPanel({ checkout, onDone }: { checkout: CheckoutOut; onDone: () => void }) {
  const { t } = useAppTranslation();
  const [busy, setBusy] = useState<'success' | 'failure' | null>(null);
  if (!checkout.mock) {
    return <Alert tone="red">{t('pay.mock.disabled')}</Alert>;
  }
  async function complete(outcome: 'success' | 'failure') {
    setBusy(outcome);
    try {
      // Same endpoint as checkout.mock.complete_url (POST /payments/mock/{order_id}/complete).
      await paymentsApi.completeMock(checkout.order.id, { outcome });
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card>
      <CardHeader title={t('pay.mock.title')} description={t('pay.orderNumber', { number: checkout.order.order_number })} />
      <CardBody className="flex flex-wrap gap-2">
        <Button onClick={() => void complete('success')} loading={busy === 'success'} disabled={!!busy}>
          {t('pay.mock.success')}
        </Button>
        <Button variant="danger" onClick={() => void complete('failure')} loading={busy === 'failure'} disabled={!!busy}>
          {t('pay.mock.failure')}
        </Button>
      </CardBody>
    </Card>
  );
}
