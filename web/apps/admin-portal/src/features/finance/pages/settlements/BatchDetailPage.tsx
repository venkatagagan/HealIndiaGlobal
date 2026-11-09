import { useState } from 'react';
import { useParams } from 'react-router';
import { Bot, Check, Play, ShieldAlert, X } from 'lucide-react';
import {
  PAYEE_TYPE_LABELS,
  PAYOUT_METHOD_LABELS,
  PAYOUT_STATUS_LABELS,
  SETTLEMENT_ITEM_STATUS_LABELS,
  type PayoutAccountSnapshot,
  type PayoutOut,
  type SettlementItemOut,
} from '@hig/shared/api';
import { fromMinor } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  IdCell,
  MoneyCell,
  PageHeader,
  StatusBadge as UiStatusBadge,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { formatDate, formatDateTime, formatMoney, useDocumentTitle } from '../../lib/shared';
import { useApproveBatch, useBatch, useProcessBatch, useRejectBatch } from '../../api/queries';
import { Mono, notifyError, notifySuccess, ReasonDialog } from '../../components/finance';
import { PayoutActionDialogs, PayoutRowActions, SettlementTabs } from '../../components/settlements';
import { isBatchMaker, useFinancePermissions } from '../../lib/permissions';
import { Button, Callout, Card, DescriptionList, ErrorState, LoadingState, Modal, StatCard } from '../../components/ui';
import { financePath } from '../../paths';

const signedClass = (minor: number, extra = '') => `${minor < 0 ? 'text-danger-ink' : ''} ${extra}`;
const MUTED_MONEY = 'text-muted [&>span]:font-normal';
const payoutTone = (p: PayoutOut) => (p.status === 'needs_reconciliation' ? ('danger' as const) : undefined);

/** Items of the batch: small embedded table, sorted client-side (no filter bar). */
const ITEM_COLUMNS: DataTableColumn<SettlementItemOut>[] = [
  {
    key: 'payee',
    header: 'Payee',
    sortable: true,
    sortValue: (i) => i.payee_name ?? i.payee_id,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-60',
    cell: (i) => (
      <TextCell primary={<span className="font-medium">{i.payee_name ?? `${i.payee_id.slice(0, 8)}…`}</span>} secondary={PAYEE_TYPE_LABELS[i.payee_type]} />
    ),
    exportValue: (i) => i.payee_name ?? i.payee_id,
  },
  {
    key: 'booking',
    header: 'Booking',
    sortable: true,
    sortValue: (i) => i.booking_number ?? i.booking_id,
    mobile: 'secondary',
    cell: (i) => <IdCell value={i.booking_number ?? i.booking_id.slice(0, 8)} />,
  },
  {
    key: 'gross',
    header: 'Gross',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (i) => i.gross_minor,
    cell: (i) => <MoneyCell minor={i.gross_minor} currency={i.currency} className={signedClass(i.gross_minor)} />,
    exportValue: (i) => fromMinor(i.gross_minor, i.currency),
  },
  {
    key: 'commission',
    header: 'Commission',
    align: 'end',
    cell: (i) => <MoneyCell minor={i.commission_minor} currency={i.currency} className={signedClass(i.commission_minor, MUTED_MONEY)} />,
  },
  {
    key: 'tax',
    header: 'GST',
    align: 'end',
    defaultHidden: true,
    cell: (i) => <MoneyCell minor={i.tax_minor} currency={i.currency} className={signedClass(i.tax_minor, MUTED_MONEY)} />,
  },
  {
    key: 'tds',
    header: 'TDS',
    align: 'end',
    defaultHidden: true,
    cell: (i) => <MoneyCell minor={i.tds_minor} currency={i.currency} className={signedClass(i.tds_minor, MUTED_MONEY)} />,
  },
  {
    key: 'net',
    header: 'Net',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (i) => i.net_minor,
    mobile: 'secondary',
    cell: (i) => <MoneyCell minor={i.net_minor} currency={i.currency} className={signedClass(i.net_minor, 'font-semibold')} />,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    sortValue: (i) => i.status,
    mobile: 'badge',
    cell: (i) => <StatusBadgeCell status={i.status} kind="settlementItem" />,
    exportValue: (i) => SETTLEMENT_ITEM_STATUS_LABELS[i.status] ?? i.status,
  },
];


export default function BatchDetailPage() {
  const { batchId = '' } = useParams();
  const batch = useBatch(batchId);
  const perms = useFinancePermissions();
  const approve = useApproveBatch();
  const reject = useRejectBatch();
  const process = useProcessBatch();
  const [confirm, setConfirm] = useState<'approve' | 'process' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [payoutAction, setPayoutAction] = useState<{ payout: PayoutOut; action: 'paid' | 'failed' } | null>(null);
  useDocumentTitle(batch.data ? `Batch ${batch.data.batch_number}` : 'Settlement batch');

  const back = { to: financePath('settlements/batches'), label: 'Batches' };

  if (batch.isLoading) return <LoadingState />;
  if (batch.isError || !batch.data)
    return (
      <div>
        <PageHeader title="Settlement batch" back={back} />
        <Card>
          <ErrorState error={batch.error} onRetry={() => void batch.refetch()} />
        </Card>
      </div>
    );

  const b = batch.data;
  const isMaker = isBatchMaker(b, perms);
  // the daily settlement job leaves created_by empty (the API then names the maker "System")
  const isAuto = !b.created_by;
  const canDecide = perms.finance && b.status === 'pending_approval';
  const canProcess = perms.finance && b.status === 'approved';
  const items = b.items ?? [];
  const payouts = b.payouts ?? [];

  const payoutColumns: DataTableColumn<PayoutOut>[] = [
    {
      key: 'payee',
      header: 'Payee',
      sortable: true,
      sortValue: (p) => p.payee_name ?? p.payee_id,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (p) => (
        <TextCell primary={<span className="font-medium">{p.payee_name ?? `${p.payee_id.slice(0, 8)}…`}</span>} secondary={PAYEE_TYPE_LABELS[p.payee_type]} />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (p) => p.amount_minor,
      mobile: 'secondary',
      cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} className="font-semibold" />,
    },
    { key: 'method', header: 'Method', cell: (p) => <span className="whitespace-nowrap">{PAYOUT_METHOD_LABELS[p.method] ?? p.method}</span> },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (p) => p.status,
      mobile: 'badge',
      cell: (p) => (
        <span className="flex max-w-56 flex-col items-start gap-0.5">
          <StatusBadgeCell status={p.status} kind="payout" tone={payoutTone(p)} />
          {p.failure_reason && (
            <span className="block max-w-full truncate text-xs text-danger-ink" title={p.failure_reason}>
              {p.failure_reason}
            </span>
          )}
        </span>
      ),
      mobileCell: (p) => <StatusBadgeCell status={p.status} kind="payout" tone={payoutTone(p)} />,
      exportValue: (p) => PAYOUT_STATUS_LABELS[p.status] ?? p.status,
    },
    { key: 'ref', header: 'UTR / gateway ref', cell: (p) => <IdCell value={p.utr ?? p.gateway_payout_id} /> },
    {
      key: 'processed',
      header: 'Processed',
      sortable: true,
      sortDescFirst: true,
      sortValue: (p) => p.processed_at,
      cell: (p) => <DateCell value={p.processed_at} display="datetime" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      align: 'end',
      hideable: false,
      cell: (p) => <PayoutRowActions payout={p} onAction={(a) => setPayoutAction({ payout: p, action: a })} />,
    },
  ];

  // destination accounts frozen at generation (SEC-003): {payee_id: masked account | null}
  const snapshot = b.payout_accounts_snapshot ?? null;
  const payeeNames = new Map<string, string>();
  for (const i of items) if (i.payee_name) payeeNames.set(i.payee_id, i.payee_name);
  for (const p of payouts) if (p.payee_name) payeeNames.set(p.payee_id, p.payee_name);
  if (b.payee_id && b.payee_name) payeeNames.set(b.payee_id, b.payee_name);
  const snapshotRows = snapshot ? Object.entries(snapshot) : [];
  const missingAccounts = snapshotRows.filter(([, a]) => a === null).length;

  return (
    <div>
      <PageHeader
        back={back}
        title={b.batch_number}
        meta={
          <>
            <UiStatusBadge status={b.status} kind="settlementBatch" size="md" />
            {isAuto && (
              <Badge tone="info" size="md" icon={<Bot className="size-3.5" aria-hidden />}>
                Automatic
              </Badge>
            )}
          </>
        }
        description={`${PAYEE_TYPE_LABELS[b.payee_type]} settlement${b.payee_id ? ' for a single payee' : ' for all payees'}${b.period_end ? `, period ending ${formatDate(b.period_end)}` : ''}`}
        actions={
          <>
            {canDecide && (
              <>
                <Button
                  onClick={() => setConfirm('approve')}
                  disabled={isMaker}
                  title={isMaker ? 'You created this batch; a different finance user must approve it.' : undefined}
                  icon={<Check className="size-4" aria-hidden />}
                >
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(true)} icon={<X className="size-4" aria-hidden />}>
                  Reject
                </Button>
              </>
            )}
            {canProcess && (
              <Button variant="accent" onClick={() => setConfirm('process')} icon={<Play className="size-4" aria-hidden />}>
                Process payouts
              </Button>
            )}
          </>
        }
      />
      <SettlementTabs />

      {canDecide && isMaker && (
        <div className="mb-4">
          <Callout tone="warning" title="Maker-checker">
            <span className="inline-flex items-start gap-1.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              You generated this batch, so you cannot approve it. Ask another finance or super-admin user to review and
              approve it. You can still reject it.
            </span>
          </Callout>
        </div>
      )}
      {canDecide && isAuto && (
        <div className="mb-4">
          <Callout tone="info" title="Automatic batch: needs human approval">
            The daily settlement job generated this batch. Automatic batches are never auto-approved: a finance user must
            check the items and payees, then approve (or reject) it before payouts can be processed.
          </Callout>
        </div>
      )}
      {b.status === 'partially_failed' && (
        <div className="mb-4">
          <Callout tone="danger" title="Some payouts failed">
            Failed payouts return their items to eligible: fix the cause (for example the payee's payout account), then
            generate a new batch for them. A payout that failed with “payout account changed” was blocked because the
            payee's account differed from the one approved in this batch.
          </Callout>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Gross" value={formatMoney(b.total_gross_minor, b.currency)} />
        <StatCard label="Commission" value={formatMoney(b.total_commission_minor, b.currency)} />
        <StatCard label="GST" value={formatMoney(b.total_tax_minor, b.currency)} />
        <StatCard label="TDS" value={formatMoney(b.total_tds_minor, b.currency)} />
        <StatCard label="Net payable" value={formatMoney(b.total_net_minor, b.currency)} tone="success" hint={`${b.items_count} items`} />
      </div>

      <div className="space-y-4">
        <Card title="Batch">
          <DescriptionList
            columns={3}
            items={[
              { label: 'Created by (maker)', value: isAuto ? 'Automatic batch (system)' : (b.created_by_name ?? '—') },
              { label: 'Created', value: formatDateTime(b.created_at) },
              { label: 'Approved by (checker)', value: b.approved_by_name ?? '—' },
              { label: 'Approved', value: formatDateTime(b.approved_at) },
              { label: 'Processed', value: formatDateTime(b.processed_at) },
              { label: 'Notes', value: b.notes ?? '—' },
            ]}
          />
        </Card>
        <Card title="Payout destinations (frozen at generation)">
          <div className="space-y-3 p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              These are the verified primary payout accounts captured when the batch was generated; approving the batch
              approves paying them. If a payee's account is changed before payouts run, that payee's payout fails with
              “payout account changed” and its items return to eligible to be batched again with the new account.
            </p>
            {snapshot === null ? (
              <Callout tone="warning">
                This batch has no account snapshot (generated before destination snapshots were introduced). Check each
                payee's verified account on the Payout accounts page before approving.
              </Callout>
            ) : (
              <>
                {missingAccounts > 0 && (
                  <Callout tone="danger">
                    {missingAccounts === 1 ? 'One payee had' : `${missingAccounts} payees had`} no verified primary payout
                    account at generation; their payouts will fail.
                  </Callout>
                )}
                <ul className="grid gap-3 md:grid-cols-2">
                  {snapshotRows.map(([payeeId, account]) => (
                    <SnapshotAccount key={payeeId} name={payeeNames.get(payeeId)} payeeId={payeeId} account={account} />
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
        <section aria-labelledby="batch-payouts" className="space-y-2">
          <h2 id="batch-payouts" className="text-base font-semibold text-fg">
            Payouts <span className="font-normal text-muted">({payouts.length})</span>
          </h2>
          <DataTable
            id="admin.finance.batch-payouts"
            caption="Payouts"
            columns={payoutColumns}
            rows={payouts}
            defaultSort={{ key: 'amount', direction: 'desc' }}
            pageSize={25}
            emptyTitle="No payouts yet"
            emptyDescription="Payouts are created when an approved batch is processed."
          />
        </section>
        <section aria-labelledby="batch-items" className="space-y-2">
          <h2 id="batch-items" className="text-base font-semibold text-fg">
            Items <span className="font-normal text-muted">({items.length})</span>
          </h2>
          <DataTable
            id="admin.finance.batch-items"
            caption="Settlement items in batch"
            columns={ITEM_COLUMNS}
            rows={items}
            defaultSort={{ key: 'payee', direction: 'asc' }}
            pageSize={25}
            emptyTitle="No items in this batch"
          />
        </section>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === 'approve' ? 'Approve batch' : 'Process payouts'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={approve.isPending || process.isPending}>
              Cancel
            </Button>
            {confirm === 'approve' ? (
              <Button
                loading={approve.isPending}
                disabled={isMaker}
                onClick={() =>
                  approve.mutate(b.id, {
                    onSuccess: () => {
                      notifySuccess(`Batch ${b.batch_number} approved`);
                      setConfirm(null);
                    },
                    onError: (e) => notifyError(e, 'Could not approve the batch'),
                  })
                }
              >
                Approve
              </Button>
            ) : (
              <Button
                variant="accent"
                loading={process.isPending}
                onClick={() =>
                  process.mutate(b.id, {
                    onSuccess: () => {
                      notifySuccess(`Batch ${b.batch_number} sent for processing`);
                      setConfirm(null);
                    },
                    onError: (e) => notifyError(e, 'Could not process the batch'),
                  })
                }
              >
                Process
              </Button>
            )}
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {confirm === 'approve' ? (
            <>
              You are approving <strong>{b.items_count}</strong> items with a net payable of{' '}
              <strong>{formatMoney(b.total_net_minor, b.currency)}</strong> to the{' '}
              {snapshotRows.length === 0
                ? "payees' payout accounts"
                : snapshotRows.length === 1
                  ? 'payout account shown under “Payout destinations”'
                  : `${snapshotRows.length} payout accounts shown under “Payout destinations”`}
              . Check the items, totals and accounts before approving.
              {missingAccounts > 0 && (
                <span className="mt-2 block text-red-700 dark:text-red-400">
                  {missingAccounts} payee(s) have no verified account; their payouts will fail.
                </span>
              )}
            </>
          ) : (
            <>
              This creates payouts for <strong>{formatMoney(b.total_net_minor, b.currency)}</strong>: linked Razorpay accounts
              are paid automatically; manual bank transfers wait for you to enter the UTR.
            </>
          )}
        </p>
      </Modal>

      <ReasonDialog
        open={rejecting}
        title="Reject batch"
        description="Items return to the eligible pool and can be batched again."
        confirmLabel="Reject batch"
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: b.id, reason },
            {
              onSuccess: () => {
                notifySuccess(`Batch ${b.batch_number} rejected`);
                setRejecting(false);
              },
              onError: (e) => notifyError(e, 'Could not reject the batch'),
            },
          )
        }
      />
      <PayoutActionDialogs
        payout={payoutAction?.payout ?? null}
        action={payoutAction?.action ?? null}
        onClose={() => setPayoutAction(null)}
      />
    </div>
  );
}

function SnapshotAccount({ name, payeeId, account }: { name?: string; payeeId: string; account: PayoutAccountSnapshot | null }) {
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      <div className="mb-1 font-medium text-slate-900 dark:text-slate-100">{name ?? <Mono>{payeeId.slice(0, 8)}…</Mono>}</div>
      {account ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300">
          <dt className="text-slate-500">Holder</dt>
          <dd>{account.account_holder_name}</dd>
          <dt className="text-slate-500">Account</dt>
          <dd><Mono>{account.account_number_masked}</Mono></dd>
          {account.ifsc && (
            <>
              <dt className="text-slate-500">IFSC</dt>
              <dd><Mono>{account.ifsc}</Mono></dd>
            </>
          )}
          {account.swift && (
            <>
              <dt className="text-slate-500">SWIFT</dt>
              <dd><Mono>{account.swift}</Mono></dd>
            </>
          )}
          <dt className="text-slate-500">Bank</dt>
          <dd>{account.bank_name ?? '—'}</dd>
          <dt className="text-slate-500">Route</dt>
          <dd>{account.razorpay_linked_account_id ? <Mono>{account.razorpay_linked_account_id}</Mono> : 'Manual bank transfer'}</dd>
        </dl>
      ) : (
        <p className="text-red-700 dark:text-red-400">No verified primary payout account: this payee's payout will fail.</p>
      )}
    </li>
  );
}
