import type { ReactNode } from 'react';
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
import {
  PAYMENT_GATEWAY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PURPOSE_LABELS,
  type PaymentOrderOut,
} from '@hig/shared/api';
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
import { useBatches, useFinanceSummary, useOrders, useRefunds, useTrialBalance } from '../api/queries';
import { Badge, Card, ErrorState, LoadingState, PageHeader, StatCard, Button } from '../components/ui';
import { financePath } from '../paths';
import { FinanceReviewTile } from '../components/reviews';

export default function OverviewPage() {
  useDocumentTitle('Finance overview');
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
        title="Finance overview"
        description="Platform money position from the double-entry ledger (base currency INR). Balances update as payments, revenue recognition, refunds and payouts are posted."
        actions={
          <Button variant="secondary" onClick={() => void summary.refetch()} loading={summary.isFetching}>
            Refresh
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
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Cash &amp; custody</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Patient escrow" value={m(s.escrow_minor)} icon={<Lock className="size-4" />} tone="accent"
              hint="Captured patient money held until treatment completes" />
            <StatCard label="Gateway receivable" value={m(s.gateway_receivable_minor)} icon={<CircleDollarSign className="size-4" />} tone="info"
              hint="Captured but not yet swept to the bank by the gateway" />
            <StatCard label="Bank" value={m(s.bank_minor)} icon={<Landmark className="size-4" />} tone="success"
              hint="Platform bank balance per ledger" />
            <StatCard label="GMV" value={m(s.gmv_minor)} icon={<TrendingUp className="size-4" />} tone="success"
              hint="Gross captured patient payments" />
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-300">Revenue &amp; taxes</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Commission revenue" value={m(s.commission_revenue_minor)} icon={<Percent className="size-4" />} tone="success"
              hint="Recognised on booking completion" />
            <StatCard label="GST payable" value={m(s.gst_payable_minor)} icon={<Receipt className="size-4" />} tone="warning"
              hint="GST output on commission (TAX:GST_OUTPUT)" />
            <StatCard label="TDS payable (194-O)" value={m(s.tds_payable_minor)} icon={<Receipt className="size-4" />} tone="warning"
              hint="Withheld from hospital payouts (TAX:TDS_194O)" />
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-300">Payables &amp; settlements</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Hospital payables" value={m(s.hospital_payables_minor)} icon={<Building2 className="size-4" />} tone="info"
              hint="Owed to hospitals after commission, GST and TDS" />
            <StatCard label="Agent payables" value={m(s.agent_payables_minor)} icon={<Users className="size-4" />} tone="info"
              hint="Facilitator commissions owed" />
            <StatCard label="Pending settlements" value={m(s.pending_settlement_minor)} icon={<Clock className="size-4" />} tone="warning"
              hint="Net of settlement items not yet paid out" />
          </div>
        </>
      ) : null}

      <FinanceReviewTile className="mt-6" />

      <LatestOrders />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Work queues" className="lg:col-span-1">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <QueueRow
              to={financePath('reconciliation')}
              icon={<Banknote className="size-4" />}
              label="Bank transfers to reconcile"
              count={pendingTransfers.data?.total}
              loading={pendingTransfers.isLoading}
            />
            <QueueRow
              to={`${financePath('refunds')}?status=requested`}
              icon={<Wallet className="size-4" />}
              label="Refunds awaiting approval"
              count={refundQueue.data?.total}
              loading={refundQueue.isLoading}
            />
            <QueueRow
              to={`${financePath('settlements/batches')}?status=pending_approval`}
              icon={<ShieldCheck className="size-4" />}
              label="Settlement batches awaiting approval"
              count={batchQueue.data?.total}
              loading={batchQueue.isLoading}
            />
            <QueueRow
              to={`${financePath('settlements/payouts')}?queue=reconcile`}
              icon={<ShieldCheck className="size-4" />}
              label="Payouts needing reconciliation"
              count={s?.payouts_needs_reconciliation}
              loading={summary.isLoading}
            />
            <li className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <Link to={financePath('ledger/trial-balance')} className="text-slate-700 hover:underline dark:text-slate-200">
                Trial balance
              </Link>
              {trial.isLoading ? (
                <span className="text-xs text-slate-400">checking…</span>
              ) : trial.data ? (
                trial.data.net_minor === 0 ? (
                  <Badge tone="success">Balanced</Badge>
                ) : (
                  <Badge tone="danger">Out by {formatMoney(trial.data.net_minor, trial.data.currency)}</Badge>
                )
              ) : (
                <Badge tone="neutral">Unavailable</Badge>
              )}
            </li>
          </ul>
        </Card>

        <Card title="How money flows" className="lg:col-span-2">
          <ol className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <FlowStep n={1} title="Capture">
              A patient pays through the gateway (or bank transfer). Dr gateway receivable / Cr patient escrow; gateway
              fees are expensed against the receivable.
            </FlowStep>
            <FlowStep n={2} title="Revenue recognition">
              When the hospital marks the booking completed, escrow is released: hospital payable (net), commission
              revenue, GST output, TDS 194-O and service-fee revenue. Agent commission is expensed to the agent payable.
            </FlowStep>
            <FlowStep n={3} title="Settlement">
              Items become eligible after the hold period. Finance generates a batch, a different finance user approves
              it (maker-checker), then it is processed into payouts (Razorpay Route, manual transfer with UTR, or mock).
            </FlowStep>
            <FlowStep n={4} title="Payout and sweep">
              A processed payout debits the payee payable and credits bank. The daily sweep moves settled gateway funds
              from receivable to bank. Refunds before completion reverse escrow against the receivable.
            </FlowStep>
          </ol>
        </Card>
      </div>
    </div>
  );
}

const LATEST_COLUMNS: DataTableColumn<PaymentOrderOut>[] = [
  {
    key: 'order',
    header: 'Order',
    mobile: 'secondary',
    cell: (o) => <IdCell value={o.order_number} secondary={PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose} />,
  },
  {
    key: 'patient',
    header: 'Patient',
    mobile: 'primary',
    className: 'max-w-56',
    cell: (o) => <PersonCell name={o.patient_name ?? o.payer_name ?? 'Unknown payer'} secondary={o.booking_number ?? undefined} />,
  },
  {
    key: 'gateway',
    header: 'Gateway',
    cell: (o) => (
      <TextCell
        primary={PAYMENT_GATEWAY_LABELS[o.gateway] ?? o.gateway}
        secondary={o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : undefined}
      />
    ),
  },
  { key: 'status', header: 'Status', mobile: 'badge', cell: (o) => <StatusBadgeCell status={o.status} kind="order" /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (o) => <MoneyCell minor={o.amount_minor} currency={o.currency} />,
  },
  { key: 'created', header: 'Created', cell: (o) => <DateCell value={o.created_at} display="relative" className="text-muted" /> },
];

/** The most recent checkout attempts (links to the full, filterable order list). */
function LatestOrders() {
  const latest = useOrders({ page_size: 8, page: 1 });
  return (
    <SharedDataTable
      className="mt-6"
      caption="Latest payment orders"
      columns={LATEST_COLUMNS}
      rows={latest.data?.items}
      loading={latest.isLoading}
      fetching={latest.isFetching && !latest.isLoading}
      error={latest.error}
      onRetry={() => void latest.refetch()}
      rowHref={(o) => financePath(`orders/${o.id}`)}
      rowLabel={(o) => `Open order ${o.order_number}`}
      responsive="cards"
      showViewOptions={false}
      skeletonRows={5}
      emptyTitle="No payment orders yet"
      emptyDescription="Orders appear when patients start a checkout."
      header={
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Latest payment orders</h2>
          <Link to={financePath('orders')} className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline">
            View all <ArrowRight className="size-4" aria-hidden />
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
          <ArrowRight className="size-4 text-slate-400" aria-hidden />
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
