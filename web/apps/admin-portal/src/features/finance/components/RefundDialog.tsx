/**
 * Create a refund against a captured payment (POST /payments/refunds). The amount is entered in the payment's
 * currency and capped at the refundable balance = captured - already refunded - refunds still in flight.
 * Without an `orderId` the dialog first lets finance search for the order.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, type PaymentOut, type RefundOut, type Uuid } from '@hig/shared/api';
import { currencyExponent, formatDateTime, formatMoney, fromMinor, toMinor, useDebouncedValue } from '../lib/shared';
import { useCreateRefund, useOrder, useOrders } from '../api/queries';
import { Money, notifyError, notifySuccess, StatusBadge } from './finance';
import { RefundThresholdNote } from './reviews';
import { Button, Callout, EmptyState, ErrorState, Field, Input, LoadingState, Modal, Textarea } from './ui';

const IN_FLIGHT = new Set(['requested', 'approved', 'processing']);

export function refundableMinor(payment: PaymentOut, refunds: RefundOut[] | undefined): number {
  const pending = (refunds ?? [])
    .filter((r) => r.payment_id === payment.id && IN_FLIGHT.has(r.status))
    .reduce((sum, r) => sum + r.amount_minor, 0);
  return Math.max(0, payment.amount_minor - payment.amount_refunded_minor - pending);
}

export function isRefundablePayment(p: PaymentOut): boolean {
  return p.status === 'captured' || p.status === 'partially_refunded';
}

export function RefundDialog({ open, onClose, orderId, paymentId }: {
  open: boolean;
  onClose: () => void;
  orderId?: Uuid | null;
  paymentId?: Uuid | null;
}) {
  const [pickedOrder, setPickedOrder] = useState<Uuid | null>(null);
  const activeOrderId = orderId ?? pickedOrder;
  const close = () => {
    setPickedOrder(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Create refund"
      description="Refunds go to the approval queue; the gateway refund runs after approval."
      size="lg"
    >
      {activeOrderId ? (
        <RefundForm
          key={activeOrderId}
          orderId={activeOrderId}
          initialPaymentId={paymentId ?? null}
          onDone={close}
          onBack={orderId ? undefined : () => setPickedOrder(null)}
        />
      ) : (
        <OrderPicker onPick={setPickedOrder} />
      )}
    </Modal>
  );
}

function OrderPicker({ onPick }: { onPick: (id: Uuid) => void }) {
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 300);
  const orders = useOrders({ q: debounced || undefined, status: 'paid', page_size: 10 });
  const partial = useOrders({ q: debounced || undefined, status: 'partially_refunded', page_size: 10 });
  const rows = [...(orders.data?.items ?? []), ...(partial.data?.items ?? [])];
  return (
    <div className="space-y-3">
      <Field label="Find a paid order" hint="Search by order number, payer or booking number">
        {(p) => (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input {...p} className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="HIG-P-…" autoFocus />
          </div>
        )}
      </Field>
      {orders.isLoading || partial.isLoading ? (
        <LoadingState />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No refundable orders found" description="Only paid or partially refunded orders can be refunded." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {rows.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onPick(o.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/60"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900 dark:text-slate-100">{o.order_number}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {o.payer_name ?? 'Payer'} · {o.booking_number ?? 'no booking'} · {formatDateTime(o.paid_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Money minor={o.amount_minor} currency={o.currency} />
                  <StatusBadge status={o.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RefundForm({ orderId, initialPaymentId, onDone, onBack }: {
  orderId: Uuid;
  initialPaymentId: Uuid | null;
  onDone: () => void;
  onBack?: () => void;
}) {
  const order = useOrder(orderId);
  const create = useCreateRefund();
  const payments = useMemo(() => (order.data?.payments ?? []).filter(isRefundablePayment), [order.data]);
  const [paymentId, setPaymentId] = useState<Uuid | null>(initialPaymentId);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (order.isLoading) return <LoadingState />;
  if (order.isError || !order.data) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;

  const selected = payments.find((p) => p.id === paymentId) ?? (payments.length === 1 ? payments[0] : undefined);
  const refundable = selected ? refundableMinor(selected, order.data.refunds) : 0;
  const currency = selected?.currency ?? order.data.currency;
  const parsed = amount.trim() ? toMinor(amount, currency) : null;

  let amountError: string | null = null;
  if (submitted || amount) {
    if (!amount.trim()) amountError = 'Enter the refund amount';
    else if (parsed === null || parsed <= 0) amountError = 'Enter a positive amount';
    else if (parsed > refundable) amountError = `Cannot exceed the refundable ${formatMoney(refundable, currency)}`;
  }
  const reasonError = submitted && !reason.trim() ? 'A reason is required' : null;

  const submit = () => {
    setSubmitted(true);
    if (!selected || parsed === null || parsed <= 0 || parsed > refundable || !reason.trim()) return;
    create.mutate(
      { payment_id: selected.id, amount_minor: parsed, reason: reason.trim() },
      {
        onSuccess: (r) => {
          notifySuccess(`Refund of ${formatMoney(r.amount_minor, r.currency)} requested`);
          onDone();
        },
        onError: (e) => notifyError(e, 'Could not create the refund'),
      },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          Order <strong>{order.data.order_number}</strong> · <Money minor={order.data.amount_minor} currency={order.data.currency} />{' '}
          <StatusBadge status={order.data.status} />
        </span>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            Choose another order
          </Button>
        )}
      </div>

      {payments.length === 0 ? (
        <Callout tone="warning">This order has no captured payment that can be refunded.</Callout>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Payment</legend>
          {payments.map((p) => {
            const left = refundableMinor(p, order.data.refunds);
            return (
              <label
                key={p.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-green-500 has-[:checked]:bg-green-50 dark:border-slate-700 dark:has-[:checked]:bg-green-500/10"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payment"
                    className="accent-green-600"
                    checked={selected?.id === p.id}
                    onChange={() => setPaymentId(p.id)}
                  />
                  <span>
                    <span className="block font-medium">
                      {p.method ? PAYMENT_METHOD_LABELS[p.method] : p.gateway} · {p.gateway_payment_id ?? p.id.slice(0, 8)}
                    </span>
                    <span className="block text-xs text-slate-500">Captured {formatDateTime(p.captured_at)}</span>
                  </span>
                </span>
                <span className="text-right">
                  <Money minor={p.amount_minor} currency={p.currency} />
                  <span className="block text-xs text-slate-500">refundable {formatMoney(left, p.currency)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {selected && (
        <>
          <Field
            label={`Amount (${currency})`}
            required
            error={amountError}
            hint={`Refundable: ${formatMoney(refundable, currency)}`}
          >
            {(p) => (
              <div className="flex gap-2">
                <Input
                  {...p}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Button
                  variant="secondary"
                  onClick={() => setAmount(fromMinor(refundable, currency).toFixed(currencyExponent(currency)))}
                  disabled={refundable <= 0}
                >
                  Full
                </Button>
              </div>
            )}
          </Field>
          <Field label="Reason" required error={reasonError}>
            {(p) => (
              <Textarea {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          <RefundThresholdNote />
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={create.isPending} disabled={!selected || refundable <= 0}>
          Request refund
        </Button>
      </div>
    </form>
  );
}
