/**
 * Bank-transfer reconciliation, maker step: finance records that the money arrived
 * (POST /payments/orders/{id}/mark-paid {reference, amount_minor}). The order stays `pending` with a
 * `mark_paid_request` until a DIFFERENT finance user approves it (MarkPaidRequestPanel on the order page).
 * The amount must equal the order amount (400 `amount_mismatch`); short/over transfers are not applied here.
 */
import { useState } from 'react';
import type { PaymentOrderOut } from '@hig/shared/api';
import { currencyExponent, formatMoney, fromMinor, toMinor } from '../lib/shared';
import { useMarkOrderPaid } from '../api/queries';
import { notifyError, notifySuccess } from './finance';
import { Button, Callout, Field, Input, Modal } from './ui';

export function MarkPaidDialog({ open, onClose, order, defaultReference }: {
  open: boolean;
  onClose: () => void;
  order: PaymentOrderOut;
  defaultReference?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Mark ${order.order_number} as paid`}
      description="Record the bank transfer after you have confirmed the credit in the platform bank account. A second finance user then approves it.">
      {open && <MarkPaidForm key={order.id} order={order} onDone={onClose} defaultReference={defaultReference ?? ''} />}
    </Modal>
  );
}

function MarkPaidForm({ order, onDone, defaultReference }: {
  order: PaymentOrderOut;
  onDone: () => void;
  defaultReference: string;
}) {
  const mutation = useMarkOrderPaid();
  const exp = currencyExponent(order.currency);
  const [reference, setReference] = useState(defaultReference);
  const [amount, setAmount] = useState(fromMinor(order.amount_minor, order.currency).toFixed(exp));
  const [submitted, setSubmitted] = useState(false);
  const parsed = amount.trim() ? toMinor(amount, order.currency) : null;

  const referenceError = submitted && !reference.trim() ? 'Enter the bank reference / UTR' : null;
  const amountError =
    (submitted || amount) && (parsed === null || parsed <= 0) ? 'Enter the amount received' : null;
  const mismatch = parsed !== null && parsed > 0 && parsed !== order.amount_minor;

  const submit = () => {
    setSubmitted(true);
    if (!reference.trim() || parsed === null || parsed <= 0 || mismatch) return;
    mutation.mutate(
      { id: order.id, body: { reference: reference.trim(), amount_minor: parsed } },
      {
        onSuccess: () => {
          notifySuccess(`Request recorded; ${order.order_number} stays pending until a second finance user approves it`);
          onDone();
        },
        onError: (e) => notifyError(e, 'Could not record the payment'),
      },
    );
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Expected: <strong>{formatMoney(order.amount_minor, order.currency)}</strong>
        {order.currency !== order.base_currency && (
          <> ({formatMoney(order.base_amount_minor, order.base_currency)})</>
        )}
      </p>
      <Field label="Bank reference / UTR" required error={referenceError}>
        {(p) => (
          <Input {...p} value={reference} maxLength={100} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
        )}
      </Field>
      <Field label={`Amount received (${order.currency})`} required error={amountError}>
        {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      {mismatch && parsed !== null ? (
        <Callout tone="danger" title="Amount differs from the order">
          Received {formatMoney(parsed, order.currency)} vs expected {formatMoney(order.amount_minor, order.currency)}.
          Only an exact match can be marked paid. Ask the payer to send the difference (or return the transfer
          outside the platform) and record it once the full amount has arrived.
        </Callout>
      ) : (
        <Callout tone="info">
          This records a request only. The order is captured when a different finance user approves it.
        </Callout>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={mismatch}>
          Record payment
        </Button>
      </div>
    </form>
  );
}
