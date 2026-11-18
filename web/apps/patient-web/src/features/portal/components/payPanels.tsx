/** Pieces of the checkout shared by the booking and consultation pay pages (gateway choice, bank transfer, test). */
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Building2, Copy, CreditCard, FlaskConical, Upload } from 'lucide-react';
import { documentsApi, errorMessage, paymentsApi, type CheckoutOut, type PaymentGateway } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { formatBytes, MAX_UPLOAD_BYTES, Money } from './common';
import { cn } from '../lib/shared';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '../ui/primitives';

/** Mock gateway is only offered in development builds or when explicitly enabled for a test environment. */
export const MOCK_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK_PAYMENTS === 'true';

export type UiGateway = Extract<PaymentGateway, 'razorpay' | 'bank_transfer' | 'mock'>;

export function usePaymentMethods(): { value: UiGateway; title: string; text: string; icon: ReactNode }[] {
  const { t } = useAppTranslation();
  return [
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
}

export function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'text-base font-semibold')}>
      <span className={strong ? '' : 'text-slate-600 dark:text-slate-400'}>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export function RadioCard({
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

export function CopyRow({ label, value }: { label: string; value: string | null }) {
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

export function BankTransferPanel({ checkout, caseId, onDone }: { checkout: CheckoutOut; caseId: string | null | undefined; onDone: () => void }) {
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

export function MockPanel({ checkout, onDone }: { checkout: CheckoutOut; onDone: () => void }) {
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
