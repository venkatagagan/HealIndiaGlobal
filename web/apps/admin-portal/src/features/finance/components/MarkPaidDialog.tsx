/**
 * Bank-transfer reconciliation, maker step: finance records that the money arrived
 * (POST /payments/orders/{id}/mark-paid {reference, amount_minor}). The order stays `pending` with a
 * `mark_paid_request` until a DIFFERENT finance user approves it (MarkPaidRequestPanel on the order page).
 * The amount must equal the order amount (400 `amount_mismatch`); short/over transfers are not applied here.
 */
import { useState } from 'react';
import { Trans } from 'react-i18next';
import type { PaymentOrderOut } from '@hig/shared/api';
import { currencyExponent, formatMoney, fromMinor, toMinor } from '../lib/shared';
import { ft, useFinanceTranslation } from '../lib/i18n';
import { useMarkOrderPaid } from '../api/queries';
import { notifyError, notifySuccess } from './finance';
import { Button, Callout, Field, Input, Modal } from './ui';

export function MarkPaidDialog({ open, onClose, order, defaultReference }: {
  open: boolean;
  onClose: () => void;
  order: PaymentOrderOut;
  defaultReference?: string | null;
}) {
  const { t } = useFinanceTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('markPaid.title', { number: order.order_number })}
      description={t('markPaid.description')}>
      {open && <MarkPaidForm key={order.id} order={order} onDone={onClose} defaultReference={defaultReference ?? ''} />}
    </Modal>
  );
}

function MarkPaidForm({ order, onDone, defaultReference }: {
  order: PaymentOrderOut;
  onDone: () => void;
  defaultReference: string;
}) {
  const { t } = useFinanceTranslation();
  const mutation = useMarkOrderPaid();
  const exp = currencyExponent(order.currency);
  const [reference, setReference] = useState(defaultReference);
  const [amount, setAmount] = useState(fromMinor(order.amount_minor, order.currency).toFixed(exp));
  const [submitted, setSubmitted] = useState(false);
  const parsed = amount.trim() ? toMinor(amount, order.currency) : null;

  const referenceError = submitted && !reference.trim() ? t('markPaid.referenceRequired') : null;
  const amountError =
    (submitted || amount) && (parsed === null || parsed <= 0) ? t('markPaid.amountRequired') : null;
  const mismatch = parsed !== null && parsed > 0 && parsed !== order.amount_minor;

  const submit = () => {
    setSubmitted(true);
    if (!reference.trim() || parsed === null || parsed <= 0 || mismatch) return;
    mutation.mutate(
      { id: order.id, body: { reference: reference.trim(), amount_minor: parsed } },
      {
        onSuccess: () => {
          notifySuccess(ft('markPaid.recorded', { number: order.order_number }));
          onDone();
        },
        onError: (e) => notifyError(e, ft('markPaid.failed')),
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
        <Trans
          t={t}
          i18nKey="markPaid.expected"
          values={{ amount: formatMoney(order.amount_minor, order.currency) }}
          components={{ 0: <strong /> }}
        />
        {order.currency !== order.base_currency && (
          <> ({formatMoney(order.base_amount_minor, order.base_currency)})</>
        )}
      </p>
      <Field label={t('markPaid.reference')} required error={referenceError}>
        {(p) => (
          <Input {...p} value={reference} maxLength={100} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
        )}
      </Field>
      <Field label={t('markPaid.amountReceived', { currency: order.currency })} required error={amountError}>
        {(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      {mismatch && parsed !== null ? (
        <Callout tone="danger" title={t('markPaid.mismatchTitle')}>
          {t('markPaid.mismatchBody', {
            received: formatMoney(parsed, order.currency),
            expected: formatMoney(order.amount_minor, order.currency),
          })}
        </Callout>
      ) : (
        <Callout tone="info">{t('markPaid.requestOnly')}</Callout>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={mismatch}>
          {t('markPaid.submit')}
        </Button>
      </div>
    </form>
  );
}
