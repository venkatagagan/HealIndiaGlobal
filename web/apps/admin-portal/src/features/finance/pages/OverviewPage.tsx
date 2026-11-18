import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Banknote,
  Building2,
  CircleDollarSign,
  Clock,
  Landmark,
  Lock,
  Percent,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { type PaymentOrderOut } from '@hig/shared/api';
import {
  DataTable as SharedDataTable,
  DateCell,
  IdCell,
  MoneyCell,
  PersonCell,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { formatMoney, useDocumentTitle } from '../lib/shared';
import { enumLabel, useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { useBatches, useFinanceSummary, useOrders, useRefunds, useTrialBalance } from '../api/queries';
import { Badge, Card, ErrorState, LoadingState, PageHeader, StatCard, Button } from '../components/ui';
import { financePath } from '../paths';
import { FinanceReviewTile } from '../components/reviews';

export default function OverviewPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('overview.title'));
  const summary = useFinanceSummary();
  const trial = useTrialBalance();
  const pendingTransfers = useOrders({ gateway: 'bank_transfer', status: 'pending', page_size: 1 });
  const refundQueue = useRefunds({ status: 'requested', page_size: 1 });
  const batchQueue = useBatches({ status: 'pending_approval', page_size: 1 });

  const s = summary.data;
  const ccy = s?.currency ?? 'INR';
  const m = (v: number | undefined) => formatMoney(v, ccy);

  return (
    <div>
      <PageHeader
        title={t('overview.title')}
        description={t('overview.description')}
        actions={
          <Button variant="secondary" onClick={() => void summary.refetch()} loading={summary.isFetching}>
            {t('overview.refresh')}
          </Button>
        }
      />

      {summary.isLoading ? (
        <LoadingState />
      ) : summary.isError ? (
        <Card>
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </Card>
      ) : s ? (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{t('overview.sections.cash')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('overview.stats.escrow')} value={m(s.escrow_minor)} icon={<Lock className="size-4" />} tone="accent"
              hint={t('overview.stats.escrowHint')} />
            <StatCard label={t('overview.stats.gatewayReceivable')} value={m(s.gateway_receivable_minor)} icon={<CircleDollarSign className="size-4" />} tone="info"
              hint={t('overview.stats.gatewayReceivableHint')} />
            <StatCard label={t('overview.stats.bank')} value={m(s.bank_minor)} icon={<Landmark className="size-4" />} tone="success"
              hint={t('overview.stats.bankHint')} />
            <StatCard label={t('overview.stats.gmv')} value={m(s.gmv_minor)} icon={<TrendingUp className="size-4" />} tone="success"
              hint={t('overview.stats.gmvHint')} />
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-300">{t('overview.sections.revenue')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label={t('overview.stats.commissionRevenue')} value={m(s.commission_revenue_minor)} icon={<Percent className="size-4" />} tone="success"
              hint={t('overview.stats.commissionRevenueHint')} />
            <StatCard label={t('overview.stats.gstPayable')} value={m(s.gst_payable_minor)} icon={<Receipt className="size-4" />} tone="warning"
              hint={t('overview.stats.gstPayableHint')} />
            <StatCard label={t('overview.stats.tdsPayable')} value={m(s.tds_payable_minor)} icon={<Receipt className="size-4" />} tone="warning"
              hint={t('overview.stats.tdsPayableHint')} />
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-300">{t('overview.sections.payables')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label={t('overview.stats.hospitalPayables')} value={m(s.hospital_payables_minor)} icon={<Building2 className="size-4" />} tone="info"
              hint={t('overview.stats.hospitalPayablesHint')} />
            <StatCard label={t('overview.stats.agentPayables')} value={m(s.agent_payables_minor)} icon={<Users className="size-4" />} tone="info"
              hint={t('overview.stats.agentPayablesHint')} />
            <StatCard label={t('overview.stats.pendingSettlements')} value={m(s.pending_settlement_minor)} icon={<Clock className="size-4" />} tone="warning"
              hint={t('overview.stats.pendingSettlementsHint')} />
          </div>
        </>
      ) : null}

      <FinanceReviewTile className="mt-6" />

      <LatestOrders />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={t('overview.queues.title')} className="lg:col-span-1">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <QueueRow
              to={financePath('reconciliation')}
              icon={<Banknote className="size-4" />}
              label={t('overview.queues.bankTransfers')}
              count={pendingTransfers.data?.total}
              loading={pendingTransfers.isLoading}
            />
            <QueueRow
              to={`${financePath('refunds')}?status=requested`}
              icon={<Wallet className="size-4" />}
              label={t('reviews.queue.refunds')}
              count={refundQueue.data?.total}
              loading={refundQueue.isLoading}
            />
            <QueueRow
              to={`${financePath('settlements/batches')}?status=pending_approval`}
              icon={<ShieldCheck className="size-4" />}
              label={t('overview.queues.batches')}
              count={batchQueue.data?.total}
              loading={batchQueue.isLoading}
            />
            <QueueRow
              to={`${financePath('settlements/payouts')}?queue=reconcile`}
              icon={<ShieldCheck className="size-4" />}
              label={t('reviews.queue.payoutReconciliations')}
              count={s?.payouts_needs_reconciliation}
              loading={summary.isLoading}
            />
            <li className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <Link to={financePath('ledger/trial-balance')} className="text-slate-700 hover:underline dark:text-slate-200">
                {t('ledger.tabs.trialBalance')}
              </Link>
              {trial.isLoading ? (
                <span className="text-xs text-slate-400">{t('overview.queues.checking')}</span>
              ) : trial.data ? (
                trial.data.net_minor === 0 ? (
                  <Badge tone="success">{t('ledger.txn.balanced')}</Badge>
                ) : (
                  <Badge tone="danger">{t('overview.queues.outBy', { amount: formatMoney(trial.data.net_minor, trial.data.currency) })}</Badge>
                )
              ) : (
                <Badge tone="neutral">{t('overview.queues.unavailable')}</Badge>
              )}
            </li>
          </ul>
        </Card>

        <Card title={t('overview.flow.title')} className="lg:col-span-2">
          <ol className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <FlowStep n={1} title={t('overview.flow.captureTitle')}>
              {t('overview.flow.capture')}
            </FlowStep>
            <FlowStep n={2} title={t('overview.flow.revenueTitle')}>
              {t('overview.flow.revenue')}
            </FlowStep>
            <FlowStep n={3} title={t('overview.flow.settlementTitle')}>
              {t('overview.flow.settlement')}
            </FlowStep>
            <FlowStep n={4} title={t('overview.flow.payoutTitle')}>
              {t('overview.flow.payout')}
            </FlowStep>
          </ol>
        </Card>
      </div>
    </div>
  );
}

const latestColumns = (t: FinanceT): DataTableColumn<PaymentOrderOut>[] => [
  {
    key: 'order',
    header: t('orders.columns.order'),
    mobile: 'secondary',
    cell: (o) => <IdCell value={o.order_number} secondary={enumLabel('paymentPurpose', o.purpose)} />,
  },
  {
    key: 'patient',
    header: t('orders.columns.patient'),
    mobile: 'primary',
    className: 'max-w-56',
    cell: (o) => <PersonCell name={o.patient_name ?? o.payer_name ?? t('orders.unknownPayer')} secondary={o.booking_number ?? undefined} />,
  },
  {
    key: 'gateway',
    header: t('orders.columns.gateway'),
    cell: (o) => (
      <TextCell
        primary={enumLabel('paymentGateway', o.gateway)}
        secondary={o.payment_method ? enumLabel('paymentMethod', o.payment_method) : undefined}
      />
    ),
  },
  { key: 'status', header: t('orders.columns.status'), mobile: 'badge', cell: (o) => <StatusBadgeCell status={o.status} kind="order" /> },
  {
    key: 'amount',
    header: t('orders.columns.amount'),
    align: 'end',
    cell: (o) => <MoneyCell minor={o.amount_minor} currency={o.currency} />,
  },
  { key: 'created', header: t('orders.columns.created'), cell: (o) => <DateCell value={o.created_at} display="relative" className="text-muted" /> },
];

/** The most recent checkout attempts (links to the full, filterable order list). */
function LatestOrders() {
  const { t } = useFinanceTranslation();
  const columns = useMemo(() => latestColumns(t), [t]);
  const latest = useOrders({ page_size: 8, page: 1 });
  return (
    <SharedDataTable
      className="mt-6"
      caption={t('overview.latest.title')}
      columns={columns}
      rows={latest.data?.items}
      loading={latest.isLoading}
      fetching={latest.isFetching && !latest.isLoading}
      error={latest.error}
      onRetry={() => void latest.refetch()}
      rowHref={(o) => financePath(`orders/${o.id}`)}
      rowLabel={(o) => t('orders.openOrder', { number: o.order_number })}
      responsive="cards"
      showViewOptions={false}
      skeletonRows={5}
      emptyTitle={t('orders.emptyTitle')}
      emptyDescription={t('overview.latest.emptyDescription')}
      header={
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{t('overview.latest.title')}</h2>
          <Link to={financePath('orders')} className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline">
            {t('overview.latest.viewAll')} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
      }
    />
  );
}

function QueueRow({ to, icon, label, count, loading }: {
  to: string;
  icon: ReactNode;
  label: string;
  count: number | undefined;
  loading: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800/60"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-400">{icon}</span>
          {label}
        </span>
        <span className="flex items-center gap-2">
          {loading ? (
            <span className="text-xs text-slate-400">…</span>
          ) : (
            <Badge tone={count ? 'warning' : 'neutral'}>{count ?? '—'}</Badge>
          )}
          <ArrowRight className="size-4 text-slate-400 rtl:-scale-x-100" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

function FlowStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
        aria-hidden
      >
        {n}
      </span>
      <div>
        <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-slate-600 dark:text-slate-400">{children}</p>
      </div>
    </li>
  );
}
