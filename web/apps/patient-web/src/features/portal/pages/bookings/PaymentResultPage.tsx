import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CircleCheckBig, Clock, Download, XCircle } from 'lucide-react';
import { errorMessage, PAYMENT_PURPOSE_LABELS, paymentsApi, type InvoiceOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useInvoices, useOrder } from '../../api/queries';
import { Money, StatusBadge } from '../../components/common';
import { paths } from '../../lib/paths';
import { formatDateTime, useDocumentTitle } from '../../lib/shared';
import { Button, ButtonLink, Card, CardBody, ErrorState, KeyValue, Skeleton } from '../../ui/primitives';

const POLL_LIMIT_MS = 60_000;

export function PaymentResultPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const { t } = useAppTranslation();
  useDocumentTitle(t('pay.result.documentTitle'));
  const [polling, setPolling] = useState(true);
  const order = useOrder(orderId, { pollMs: polling ? 2000 : false });
  const paid = order.data?.status === 'paid' || order.data?.status === 'partially_refunded' || order.data?.status === 'refunded';
  const invoices = useInvoices({ booking_id: id }, paid);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPolling(false), POLL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!orderId) return <ErrorState title={t('pay.result.missingReference')} />;
  if (order.isPending) return <Skeleton className="mx-auto h-80 max-w-xl" />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;

  const o = order.data;
  const failed = ['failed', 'expired', 'cancelled'].includes(o.status);
  const waitingBank = !paid && !failed && o.gateway === 'bank_transfer';
  const receipt: InvoiceOut | undefined = invoices.data?.items.find((inv) => inv.order_id === o.id);

  async function downloadReceipt(inv: InvoiceOut) {
    setDownloading(true);
    try {
      await paymentsApi.downloadInvoicePdf(inv);
    } catch (err) {
      toast.error(errorMessage(err, t('payments.receipt.downloadFailed')));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card className="overflow-hidden">
        <div className={paid ? 'bg-green-700 p-8 text-center text-white' : failed ? 'bg-red-700 p-8 text-center text-white' : 'bg-amber-700 p-8 text-center text-white'}>
          {paid ? (
            <CircleCheckBig className="mx-auto h-14 w-14" aria-hidden />
          ) : failed ? (
            <XCircle className="mx-auto h-14 w-14" aria-hidden />
          ) : (
            <Clock className="mx-auto h-14 w-14" aria-hidden />
          )}
          <h1 className="mt-3 text-2xl font-bold" aria-live="polite">
            {paid
              ? t('pay.result.successTitle')
              : failed
                ? t('pay.result.failedTitle')
                : waitingBank
                  ? t('pay.result.bankTitle')
                  : t('pay.result.confirmingTitle')}
          </h1>
          <p className="mt-1 text-sm text-white/90">
            {paid
              ? t('pay.result.successText')
              : failed
                ? t('pay.result.failedText')
                : waitingBank
                  ? t('pay.result.bankText')
                  : t('pay.result.confirmingText')}
          </p>
        </div>
        <CardBody>
          <dl className="grid grid-cols-2 gap-4">
            <KeyValue label={t('pay.result.order')}>{o.order_number}</KeyValue>
            <KeyValue label={t('pay.result.status')}>
              <StatusBadge status={o.status} />
            </KeyValue>
            <KeyValue label={t('pay.result.amount')}>
              <Money minor={o.amount_minor} currency={o.currency} />
            </KeyValue>
            <KeyValue label={t('pay.result.for')}>{PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose}</KeyValue>
            {o.currency !== o.base_currency ? (
              <KeyValue label={t('pay.result.inInr')}>
                <Money minor={o.base_amount_minor} currency={o.base_currency} />
              </KeyValue>
            ) : null}
            <KeyValue label={paid ? t('pay.result.paidOn') : t('pay.result.created')}>{formatDateTime(o.paid_at ?? o.created_at)}</KeyValue>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            {paid && receipt ? (
              <Button
                variant="outline"
                loading={downloading}
                onClick={() => void downloadReceipt(receipt)}
                icon={<Download className="h-4 w-4" aria-hidden />}
              >
                {t('pay.result.downloadReceipt')}
              </Button>
            ) : null}
            {failed ? <ButtonLink to={paths.pay(id)}>{t('pay.result.tryAgain')}</ButtonLink> : null}
            {!paid && !failed && !polling ? (
              <Button
                variant="outline"
                onClick={() => {
                  setPolling(true);
                  void order.refetch();
                }}
              >
                {t('pay.result.refreshStatus')}
              </Button>
            ) : null}
            <ButtonLink to={paths.booking(id)} variant={paid ? 'primary' : 'outline'}>
              {t('pay.result.viewBooking')}
            </ButtonLink>
            {paid ? (
              <ButtonLink to={paths.trip(id)} variant="accent">
                {t('pay.result.planTrip')}
              </ButtonLink>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
