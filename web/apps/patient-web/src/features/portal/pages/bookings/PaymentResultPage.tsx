import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { CircleCheckBig, Clock, Download, XCircle } from 'lucide-react';
import { errorMessage, PAYMENT_PURPOSE_LABELS, paymentsApi, type InvoiceOut } from '@hig/shared/api';
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
  useDocumentTitle('Payment status');
  const [polling, setPolling] = useState(true);
  const order = useOrder(orderId, { pollMs: polling ? 2000 : false });
  const paid = order.data?.status === 'paid' || order.data?.status === 'partially_refunded' || order.data?.status === 'refunded';
  const invoices = useInvoices({ booking_id: id }, paid);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPolling(false), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, []);

  if (!orderId) return <ErrorState title="Missing payment reference" />;
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
      toast.error(errorMessage(err, 'Download failed.'));
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
              ? 'Payment successful'
              : failed
                ? 'Payment not completed'
                : waitingBank
                  ? 'Awaiting your bank transfer'
                  : 'Confirming your payment...'}
          </h1>
          <p className="mt-1 text-sm text-white/90">
            {paid
              ? 'Thank you. Your booking has been updated and a receipt is on its way to your email.'
              : failed
                ? 'You have not been charged. You can try again with the same or another method.'
                : waitingBank
                  ? 'We will confirm as soon as the funds arrive - usually 1-3 business days.'
                  : 'This usually takes a few seconds.'}
          </p>
        </div>
        <CardBody>
          <dl className="grid grid-cols-2 gap-4">
            <KeyValue label="Order">{o.order_number}</KeyValue>
            <KeyValue label="Status">
              <StatusBadge status={o.status} />
            </KeyValue>
            <KeyValue label="Amount">
              <Money minor={o.amount_minor} currency={o.currency} />
            </KeyValue>
            <KeyValue label="For">{PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose}</KeyValue>
            {o.currency !== o.base_currency ? (
              <KeyValue label="In INR">
                <Money minor={o.base_amount_minor} currency={o.base_currency} />
              </KeyValue>
            ) : null}
            <KeyValue label={paid ? 'Paid on' : 'Created'}>{formatDateTime(o.paid_at ?? o.created_at)}</KeyValue>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            {paid && receipt ? (
              <Button
                variant="outline"
                loading={downloading}
                onClick={() => void downloadReceipt(receipt)}
                icon={<Download className="h-4 w-4" aria-hidden />}
              >
                Download receipt
              </Button>
            ) : null}
            {failed ? <ButtonLink to={paths.pay(id)}>Try again</ButtonLink> : null}
            {!paid && !failed && !polling ? (
              <Button
                variant="outline"
                onClick={() => {
                  setPolling(true);
                  void order.refetch();
                }}
              >
                Refresh status
              </Button>
            ) : null}
            <ButtonLink to={paths.booking(id)} variant={paid ? 'primary' : 'outline'}>
              View booking
            </ButtonLink>
            {paid ? (
              <ButtonLink to={paths.trip(id)} variant="accent">
                Plan your trip
              </ButtonLink>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
