import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, CheckCircle2, Copy, CreditCard, FlaskConical, Lock, Upload } from 'lucide-react';
import {
  PAYMENT_GATEWAY_LABELS,
  PAYMENT_OPTION_LABELS,
  PAYMENT_PURPOSE_LABELS,
  bookingsApi,
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
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingBlock,
  Money,
  PageHeader,
  Select,
  StatusBadge,
  useCopy,
} from '../../components/ui';
import { PatientUpgradeRequiredNotice, isGuestUpgradeError } from '@hig/shared/ui';
import { UPLOAD_ACCEPT } from '../../lib/constants';
import { openRazorpayCheckout } from '../../lib/razorpay';
import { qk } from '../../lib/queries';
import { SUPPORTED_CURRENCIES, cn, formatDate, formatDateTime, formatMoney, useDocumentTitle } from '../../lib/shared';

const FX_UNAVAILABLE_MESSAGE =
  'Payments in your currency are temporarily unavailable — please try again shortly or pay in INR/USD.';
const MOCK_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_PAYMENTS === 'true';

interface PurposeChoice {
  purpose: PaymentPurpose;
  label: string;
  hint: string;
  installment?: InstallmentOut;
}

function purposeChoices(booking: BookingOut, installments: InstallmentOut[]): PurposeChoice[] {
  const paid = booking.amount_paid_minor - booking.amount_refunded_minor;
  if (booking.balance_due_minor <= 0) return [];
  if (booking.payment_option === 'installments' && paid > 0) {
    const next = installments
      .filter((i) => i.status === 'due' || i.status === 'overdue')
      .sort((a, b) => a.seq - b.seq)[0];
    return next
      ? [
          {
            purpose: 'installment',
            label: `Instalment ${next.seq}`,
            hint: `${formatMoney(next.amount_minor, next.currency)} · ${next.status === 'overdue' ? 'overdue since' : 'due'} ${formatDate(next.due_date)}`,
            installment: next,
          },
        ]
      : [{ purpose: 'booking_balance', label: 'Remaining balance', hint: 'Settle the outstanding amount' }];
  }
  if (paid > 0) return [{ purpose: 'booking_balance', label: 'Remaining balance', hint: 'Settle the outstanding amount' }];
  if (booking.payment_option === 'full') return [{ purpose: 'booking_full', label: 'Full amount', hint: 'Confirms the booking' }];
  return [
    { purpose: 'booking_deposit', label: 'Deposit', hint: 'Confirms the booking; balance due before admission' },
    { purpose: 'booking_full', label: 'Full amount', hint: 'Pay everything now' },
  ];
}

export function PayBookingPage() {
  const { bookingId = '' } = useParams();
  useDocumentTitle('Payment');
  const queryClient = useQueryClient();

  const booking = useQuery({ queryKey: qk.booking(bookingId), queryFn: () => bookingsApi.get(bookingId) });
  const installments = useQuery({
    queryKey: qk.installments(bookingId),
    queryFn: () => paymentsApi.installments(bookingId),
    enabled: booking.data?.payment_option === 'installments',
  });
  const orders = useQuery({
    queryKey: qk.orders({ booking_id: bookingId }),
    queryFn: () => paymentsApi.listOrders({ booking_id: bookingId, page_size: 50 }),
  });

  const b = booking.data;
  const choices = useMemo(() => (b ? purposeChoices(b, installments.data ?? []) : []), [b, installments.data]);
  const [purposeIdx, setPurposeIdx] = useState(0);
  const choice = choices[Math.min(purposeIdx, Math.max(choices.length - 1, 0))];
  const [gateway, setGateway] = useState<PaymentGateway>('razorpay');
  const [currency, setCurrency] = useState('');
  const [checkout, setCheckout] = useState<CheckoutOut | null>(null);
  const [paidOrder, setPaidOrder] = useState<string | null>(null);
  const [guestBlocked, setGuestBlocked] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: qk.booking(bookingId) });
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['payment-orders'] });
    void queryClient.invalidateQueries({ queryKey: qk.installments(bookingId) });
    void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
  };

  const resetAttempt = () => {
    idempotencyKey.current = newIdempotencyKey();
    setCheckout(null);
  };

  const pay = useMutation({
    mutationFn: async () => {
      if (!choice) throw new Error('Nothing to pay');
      const created = await paymentsApi.createOrder(
        {
          booking_id: bookingId,
          purpose: choice.purpose,
          gateway,
          ...(choice.installment ? { installment_id: choice.installment.id } : {}),
          ...(currency ? { currency } : {}),
        },
        idempotencyKey.current,
      );
      if (created.gateway === 'razorpay') {
        const response = await openRazorpayCheckout(created);
        const order = await paymentsApi.verifyRazorpay(created.order.id, response);
        return { checkout: created, paid: order.status === 'paid' ? order.order_number : null };
      }
      return { checkout: created, paid: null };
    },
    onSuccess: ({ checkout: created, paid }) => {
      if (paid) {
        setPaidOrder(paid);
        resetAttempt();
        refreshAll();
        toast.success('Payment received');
      } else {
        setCheckout(created);
      }
    },
    onError: (error) => {
      if (isGuestUpgradeError(error)) setGuestBlocked(true);
      toast.error(isFxRateUnavailable(error) ? FX_UNAVAILABLE_MESSAGE : errorMessage(error));
      resetAttempt();
      refreshAll();
    },
  });

  if (booking.isPending) return <LoadingBlock />;
  if (booking.isError || !b) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />;

  const back = (
    <Link to={`/cases/${b.case_id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to case
    </Link>
  );
  const gateways: { value: PaymentGateway; icon: ReactNode; hint: string }[] = [
    { value: 'razorpay', icon: <CreditCard className="h-5 w-5" />, hint: 'Cards, UPI, net banking via Razorpay secure checkout' },
    { value: 'bank_transfer', icon: <Banknote className="h-5 w-5" />, hint: 'International SWIFT / local bank transfer, then upload proof' },
    ...(MOCK_ENABLED ? [{ value: 'mock' as const, icon: <FlaskConical className="h-5 w-5" />, hint: 'Simulated payment for testing (non-production only)' }] : []),
  ];

  const cancelled = b.status === 'cancelled';

  return (
    <div>
      <PageHeader
        back={back}
        title="Pay on behalf of patient"
        description={`${b.booking_number} · ${b.patient.full_name} · ${b.hospital.name}`}
        actions={<StatusBadge kind="booking" status={b.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {guestBlocked && <PatientUpgradeRequiredNotice patientName={b.patient.full_name} />}
          {paidOrder && (
            <div role="status" className="flex gap-3 rounded-xl border border-primary/40 bg-primary-soft p-4 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
              <div>
                <p className="font-semibold">Payment successful — order {paidOrder}</p>
                <p className="text-muted">The booking updates automatically once the payment is captured. A receipt is emailed to the patient.</p>
              </div>
            </div>
          )}

          {cancelled ? (
            <Card>
              <EmptyState title="This booking was cancelled" description="Payments are no longer accepted for it." />
            </Card>
          ) : choices.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
                title="Fully paid"
                description="There is no outstanding balance on this booking."
              />
            </Card>
          ) : checkout ? (
            <CheckoutPanel
              checkout={checkout}
              booking={b}
              onDone={(orderNumber) => {
                setPaidOrder(orderNumber);
                resetAttempt();
                refreshAll();
              }}
              onSubmittedProof={() => {
                resetAttempt();
                refreshAll();
              }}
              onCancel={resetAttempt}
            />
          ) : (
            <>
              <Card>
                <CardHeader title="What to pay" />
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  {choices.map((ch, i) => (
                    <button
                      key={`${ch.purpose}-${ch.installment?.id ?? ''}`}
                      type="button"
                      aria-pressed={choice === ch}
                      onClick={() => setPurposeIdx(i)}
                      className={cn(
                        'rounded-xl border p-4 text-left',
                        choice === ch ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2',
                      )}
                    >
                      <p className="font-semibold">{ch.label}</p>
                      <p className="text-xs text-muted">{ch.hint}</p>
                    </button>
                  ))}
                </div>
                <p className="px-5 pb-5 text-xs text-muted">
                  The exact amount is calculated securely by the platform and shown in the checkout before you confirm.
                </p>
              </Card>
              <Card>
                <CardHeader title="Payment method" />
                <div className="space-y-3 p-5" role="radiogroup" aria-label="Payment method">
                  {gateways.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      role="radio"
                      aria-checked={gateway === g.value}
                      onClick={() => setGateway(g.value)}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-xl border p-4 text-left',
                        gateway === g.value ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2',
                      )}
                    >
                      <span className="text-muted">{g.icon}</span>
                      <span className="flex-1">
                        <span className="block font-medium">{PAYMENT_GATEWAY_LABELS[g.value]}</span>
                        <span className="block text-xs text-muted">{g.hint}</span>
                      </span>
                      <span className={cn('h-4 w-4 rounded-full border-2', gateway === g.value ? 'border-primary bg-primary' : 'border-border')} aria-hidden />
                    </button>
                  ))}
                  <FormField label="Charge currency" htmlFor="pay-ccy" hint="Defaults to the patient’s preferred currency; converted at today’s rate">
                    <Select id="pay-ccy" className="max-w-xs" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option value="">Patient’s preferred currency</option>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
              </Card>
              <Button size="lg" className="w-full" icon={<Lock className="h-4 w-4" aria-hidden />} loading={pay.isPending} onClick={() => pay.mutate()}>
                {gateway === 'bank_transfer' ? 'Get bank transfer details' : `Pay ${choice?.label.toLowerCase() ?? ''}`}
              </Button>
            </>
          )}

          <Card>
            <CardHeader title="Payment history" />
            {orders.isPending ? (
              <LoadingBlock />
            ) : orders.isError ? (
              <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
            ) : orders.data.items.length === 0 ? (
              <p className="p-5 text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {orders.data.items.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {o.order_number} · {PAYMENT_PURPOSE_LABELS[o.purpose]}
                      </p>
                      <p className="text-xs text-muted">
                        {PAYMENT_GATEWAY_LABELS[o.gateway]} · {formatDateTime(o.paid_at ?? o.created_at)}
                      </p>
                    </div>
                    <Money minor={o.amount_minor} currency={o.currency} className="font-medium" />
                    <StatusBadge kind="order" status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader title="Booking summary" />
          <dl className="space-y-2.5 p-5 text-sm">
            <SummaryRow label="Admission">{formatDate(b.admission_date)}</SummaryRow>
            <SummaryRow label="Payment option">
              {PAYMENT_OPTION_LABELS[b.payment_option]}
              {b.installment_months ? ` · ${b.installment_months} mo` : ''}
            </SummaryRow>
            <SummaryRow label="Subtotal">
              <Money minor={b.subtotal_minor} currency={b.currency} />
            </SummaryRow>
            {b.discount_minor > 0 && (
              <SummaryRow label="Discount">
                −<Money minor={b.discount_minor} currency={b.currency} />
              </SummaryRow>
            )}
            {b.service_fee_minor > 0 && (
              <SummaryRow label="Service fee">
                <Money minor={b.service_fee_minor} currency={b.currency} />
              </SummaryRow>
            )}
            {b.tax_minor > 0 && (
              <SummaryRow label="Taxes">
                <Money minor={b.tax_minor} currency={b.currency} />
              </SummaryRow>
            )}
            <SummaryRow label={<strong>Total</strong>}>
              <Money minor={b.total_minor} currency={b.currency} className="font-bold" />
            </SummaryRow>
            <SummaryRow label="Deposit">
              <Money minor={b.deposit_minor} currency={b.currency} />
            </SummaryRow>
            <SummaryRow label="Paid">
              <Money minor={b.amount_paid_minor - b.amount_refunded_minor} currency={b.currency} />
            </SummaryRow>
            <div className="flex justify-between border-t border-border pt-2.5 text-base">
              <dt className="font-semibold">Balance due</dt>
              <dd>
                <Money minor={b.balance_due_minor} currency={b.currency} className="font-bold text-danger" />
              </dd>
            </div>
          </dl>
          <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Card details are entered on the gateway’s secure page and never reach our servers.
          </p>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function CheckoutPanel({
  checkout,
  booking,
  onDone,
  onSubmittedProof,
  onCancel,
}: {
  checkout: CheckoutOut;
  booking: BookingOut;
  onDone: (orderNumber: string) => void;
  onSubmittedProof: () => void;
  onCancel: () => void;
}) {
  const order = checkout.order;
  if (checkout.gateway === 'bank_transfer' && checkout.bank_transfer) {
    return <BankTransferPanel checkout={checkout} booking={booking} onSubmitted={onSubmittedProof} onCancel={onCancel} />;
  }
  if (checkout.gateway === 'mock') {
    return <MockPanel orderId={order.id} orderNumber={order.order_number} amount={<Money minor={order.amount_minor} currency={order.currency} />} onDone={onDone} onCancel={onCancel} />;
  }
  return (
    <Card>
      <EmptyState
        title="Checkout not available"
        description="This payment method could not be started. Choose another method."
        action={<Button onClick={onCancel}>Back</Button>}
      />
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  const [copied, copy] = useCopy();
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-mono text-sm">
        {value}
        <button type="button" onClick={() => void copy(value)} className="rounded p-1 text-muted hover:text-fg" aria-label={`Copy ${label}`}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </dd>
    </div>
  );
}

function BankTransferPanel({
  checkout,
  booking,
  onSubmitted,
  onCancel,
}: {
  checkout: CheckoutOut;
  booking: BookingOut;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const details = checkout.bank_transfer;
  const order = checkout.order;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Attach the transfer receipt');
      const doc = await documentsApi.upload({
        file,
        kind: 'payment_proof',
        case_id: booking.case_id,
        patient_id: booking.patient.id,
      });
      return paymentsApi.submitBankTransferProof(order.id, { document_id: doc.id, reference: reference.trim() });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success('Transfer proof submitted. Our finance team will confirm receipt.');
      onSubmitted();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!details) return null;
  if (submitted) {
    return (
      <Card>
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
          title="Proof submitted"
          description="The booking is confirmed once finance reconciles the transfer (usually 1–2 business days)."
        />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title="Bank transfer details"
        description={
          <>
            Transfer exactly <Money minor={order.amount_minor} currency={order.currency} className="font-semibold text-fg" /> and quote the
            reference so we can match the payment.
          </>
        }
      />
      <dl className="divide-y divide-border px-5">
        <CopyRow label="Beneficiary" value={details.beneficiary_name} />
        <CopyRow label="Bank" value={details.bank_name} />
        <CopyRow label="Account number" value={details.account_number} />
        <CopyRow label="IFSC" value={details.ifsc} />
        <CopyRow label="SWIFT" value={details.swift} />
        <CopyRow label="IBAN" value={details.iban} />
        <CopyRow label="Payment reference" value={details.reference} />
      </dl>
      <div className="space-y-4 border-t border-border p-5">
        <FormField label="Your transfer reference / UTR" htmlFor="bt-ref" required>
          <Input id="bt-ref" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
        </FormField>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" icon={<Upload className="h-4 w-4" aria-hidden />} onClick={() => fileRef.current?.click()}>
            {file ? file.name : 'Attach transfer receipt'}
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Choose another method
          </Button>
          <Button loading={submit.isPending} disabled={!file || reference.trim().length < 4} onClick={() => submit.mutate()}>
            Submit proof of payment
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MockPanel({
  orderId,
  orderNumber,
  amount,
  onDone,
  onCancel,
}: {
  orderId: string;
  orderNumber: string;
  amount: ReactNode;
  onDone: (orderNumber: string) => void;
  onCancel: () => void;
}) {
  const complete = useMutation({
    mutationFn: (outcome: 'success' | 'failure') => paymentsApi.completeMock(orderId, { outcome }),
    onSuccess: (order) => {
      if (order.status === 'paid') onDone(order.order_number);
      else {
        toast.error('Simulated payment failed');
        onCancel();
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader title="Test payment" description={<>Order {orderNumber} · {amount}</>} />
      <div className="flex flex-wrap justify-end gap-2 p-5">
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button variant="outline" loading={complete.isPending && complete.variables === 'failure'} onClick={() => complete.mutate('failure')}>
          Simulate failure
        </Button>
        <Button loading={complete.isPending && complete.variables === 'success'} onClick={() => complete.mutate('success')}>
          Simulate success
        </Button>
      </div>
    </Card>
  );
}
