/** /app/consultations/:id/pay - pay a consultation fee (`POST /payments/orders` purpose `consultation_fee`). */
import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import {
  errorMessage,
  isFxRateUnavailable,
  newIdempotencyKey,
  paymentsApi,
  type CheckoutOut,
  type ConsultationOut,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { canPayFee, ck, feeState, useConsultation, useConsultationOrders } from '../../api/consultations';
import { usePatientProfile } from '../../api/queries';
import { BackLink, Money } from '../../components/common';
import { BankTransferPanel, MockPanel, RadioCard, Row, usePaymentMethods, type UiGateway } from '../../components/payPanels';
import { openRazorpayCheckout } from '../../lib/razorpay';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { formatDateTime, SUPPORTED_CURRENCIES, useDocumentTitle } from '../../lib/shared';
import { Button, Card, CardBody, CardHeader, ErrorState, Field, PageHeader, Select, Skeleton } from '../../ui/primitives';

export function ConsultationPayPage() {
  const { id = '' } = useParams();
  const { t } = useAppTranslation();
  useDocumentTitle(t('consult.pay.title'));
  const consultation = useConsultation(id);
  const orders = useConsultationOrders(consultation.data);

  if (consultation.isPending || (consultation.data && consultation.data.fee_minor > 0 && orders.isPending)) {
    return <Skeleton className="mx-auto h-72 max-w-3xl" />;
  }
  if (consultation.isError) return <ErrorState error={consultation.error} onRetry={() => void consultation.refetch()} />;
  const c = consultation.data;
  if (!canPayFee(c, feeState(c, orders.data))) return <Navigate to={paths.consultation(c.id)} replace />;
  return <PayForm consultation={c} />;
}

function PayForm({ consultation: c }: { consultation: ConsultationOut }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const profile = usePatientProfile(!me.data?.is_guest);
  const methods = usePaymentMethods();
  const [gateway, setGateway] = useState<UiGateway>('razorpay');
  const [currencyChoice, setCurrency] = useState<string | null>(null);
  const currency = currencyChoice ?? profile.data?.preferred_currency ?? 'USD';
  const [busy, setBusy] = useState(false);
  const [checkoutState, setCheckoutState] = useState<{ key: string; checkout: CheckoutOut } | null>(null);
  const keys = useRef(new Map<string, string>());
  const attemptKey = `${gateway}|${currency}`;
  const checkout = checkoutState?.key === attemptKey ? checkoutState.checkout : null;

  function idempotencyKey(): string {
    let key = keys.current.get(attemptKey);
    if (!key) {
      key = newIdempotencyKey();
      keys.current.set(attemptKey, key);
    }
    return key;
  }

  function finished(orderId: string) {
    keys.current.delete(attemptKey);
    void qc.invalidateQueries({ queryKey: ck.all });
    navigate(`${paths.consultation(c.id)}?order=${encodeURIComponent(orderId)}`, { replace: true });
  }

  async function pay() {
    setBusy(true);
    try {
      const co =
        checkout ??
        (await paymentsApi.createOrder({ purpose: 'consultation_fee', consultation_id: c.id, gateway, currency }, idempotencyKey()));
      setCheckoutState({ key: attemptKey, checkout: co });
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
    } catch (err) {
      toast.error(isFxRateUnavailable(err) ? t('pay.errors.fxUnavailable') : errorMessage(err, t('pay.errors.startFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={<BackLink to={paths.consultation(c.id)}>{t('consult.pay.back')}</BackLink>}
        title={t('consult.pay.title')}
        description={t('consult.pay.description', { doctor: c.doctor?.full_name ?? '', hospital: c.hospital?.name ?? '' })}
      />
      <div className="mb-6 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
        <Lock className="h-4 w-4 text-success-ink" aria-hidden /> {t('pay.secureNote')}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
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
            <BankTransferPanel checkout={checkout} caseId={c.case_id} onDone={() => finished(checkout.order.id)} />
          ) : null}
          {checkout && gateway === 'mock' ? <MockPanel checkout={checkout} onDone={() => finished(checkout.order.id)} /> : null}
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={t('consult.pay.summary')} />
            <CardBody className="space-y-2 text-sm">
              <Row label={t('consult.pay.doctor')}>{c.doctor?.full_name ?? '—'}</Row>
              {c.scheduled_at || c.due_at ? (
                <Row label={t('consult.pay.time')}>{formatDateTime(c.scheduled_at ?? c.due_at)}</Row>
              ) : null}
              <Row label={t('pay.dueNow')} strong>
                <Money minor={c.fee_minor} currency={c.currency} />
              </Row>
              <Field label={t('pay.payIn')} htmlFor="cp-ccy" className="pt-2">
                <Select id="cp-ccy" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              {checkout ? (
                <p className="rounded-xl bg-success-soft p-3 text-sm">
                  {t('pay.willBeCharged')}{' '}
                  <strong>
                    <Money minor={checkout.order.amount_minor} currency={checkout.order.currency} />
                  </strong>
                  <span className="block text-xs text-muted">{t('pay.orderNumber', { number: checkout.order.order_number })}</span>
                </p>
              ) : (
                <p className="text-xs text-muted">{t('pay.exactAmountNote', { currency })}</p>
              )}
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
