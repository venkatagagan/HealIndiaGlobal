import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Trans } from 'react-i18next';
import { Bot, Check, Play, ShieldAlert, X } from 'lucide-react';
import {
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
import { enumLabel, ft, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
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
const itemColumns = (t: FinanceT): DataTableColumn<SettlementItemOut>[] => [
  {
    key: 'payee',
    header: t('settlementUi.payee'),
    sortable: true,
    sortValue: (i) => i.payee_name ?? i.payee_id,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-60',
    cell: (i) => (
      <TextCell primary={<span className="font-medium">{i.payee_name ?? `${i.payee_id.slice(0, 8)}…`}</span>} secondary={enumLabel('payeeType', i.payee_type)} />
    ),
    exportValue: (i) => i.payee_name ?? i.payee_id,
  },
  {
    key: 'booking',
    header: t('orders.columns.booking'),
    sortable: true,
    sortValue: (i) => i.booking_number ?? i.booking_id,
    mobile: 'secondary',
    cell: (i) => <IdCell value={i.booking_number ?? i.booking_id.slice(0, 8)} />,
  },
  {
    key: 'gross',
    header: t('batches.columns.gross'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (i) => i.gross_minor,
    cell: (i) => <MoneyCell minor={i.gross_minor} currency={i.currency} className={signedClass(i.gross_minor)} />,
    exportValue: (i) => fromMinor(i.gross_minor, i.currency),
  },
  {
    key: 'commission',
    header: t('reports.commission'),
    align: 'end',
    cell: (i) => <MoneyCell minor={i.commission_minor} currency={i.currency} className={signedClass(i.commission_minor, MUTED_MONEY)} />,
  },
  {
    key: 'tax',
    header: t('batchDetail.gst'),
    align: 'end',
    defaultHidden: true,
    cell: (i) => <MoneyCell minor={i.tax_minor} currency={i.currency} className={signedClass(i.tax_minor, MUTED_MONEY)} />,
  },
  {
    key: 'tds',
    header: t('batchDetail.tds'),
    align: 'end',
    defaultHidden: true,
    cell: (i) => <MoneyCell minor={i.tds_minor} currency={i.currency} className={signedClass(i.tds_minor, MUTED_MONEY)} />,
  },
  {
    key: 'net',
    header: t('trialBalance.net'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (i) => i.net_minor,
    mobile: 'secondary',
    cell: (i) => <MoneyCell minor={i.net_minor} currency={i.currency} className={signedClass(i.net_minor, 'font-semibold')} />,
  },
  {
    key: 'status',
    header: t('orders.columns.status'),
    sortable: true,
    sortValue: (i) => i.status,
    mobile: 'badge',
    cell: (i) => <StatusBadgeCell status={i.status} kind="settlementItem" />,
    exportValue: (i) => enumLabel('status', i.status),
  },
];


export default function BatchDetailPage() {
  const { t } = useFinanceTranslation();
  const itemCols = useMemo(() => itemColumns(t), [t]);
  const { batchId = '' } = useParams();
  const batch = useBatch(batchId);
  const perms = useFinancePermissions();
  const approve = useApproveBatch();
  const reject = useRejectBatch();
  const process = useProcessBatch();
  const [confirm, setConfirm] = useState<'approve' | 'process' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [payoutAction, setPayoutAction] = useState<{ payout: PayoutOut; action: 'paid' | 'failed' } | null>(null);
  useDocumentTitle(batch.data ? t('batchDetail.documentTitle', { number: batch.data.batch_number }) : t('batchDetail.title'));

  const back = { to: financePath('settlements/batches'), label: t('settlementUi.tabs.batches') };

  if (batch.isLoading) return <LoadingState />;
  if (batch.isError || !batch.data)
    return (
      <div>
        <PageHeader title={t('batchDetail.title')} back={back} />
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
      header: t('settlementUi.payee'),
      sortable: true,
      sortValue: (p) => p.payee_name ?? p.payee_id,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (p) => (
        <TextCell primary={<span className="font-medium">{p.payee_name ?? `${p.payee_id.slice(0, 8)}…`}</span>} secondary={enumLabel('payeeType', p.payee_type)} />
      ),
    },
    {
      key: 'amount',
      header: t('orders.columns.amount'),
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (p) => p.amount_minor,
      mobile: 'secondary',
      cell: (p) => <MoneyCell minor={p.amount_minor} currency={p.currency} className="font-semibold" />,
    },
    { key: 'method', header: t('orders.columns.method'), cell: (p) => <span className="whitespace-nowrap">{enumLabel('payoutMethod', p.method)}</span> },
    {
      key: 'status',
      header: t('orders.columns.status'),
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
      exportValue: (p) => enumLabel('status', p.status),
    },
    { key: 'ref', header: t('batchDetail.utrRef'), cell: (p) => <IdCell value={p.utr ?? p.gateway_payout_id} /> },
    {
      key: 'processed',
      header: t('orderDetail.refunds.processed'),
      sortable: true,
      sortDescFirst: true,
      sortValue: (p) => p.processed_at,
      cell: (p) => <DateCell value={p.processed_at} display="datetime" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('orderDetail.actions')}</span>,
      title: t('orderDetail.actions'),
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

  const descriptionKey = b.payee_id
    ? b.period_end
      ? 'batchDetail.descriptionSinglePeriod'
      : 'batchDetail.descriptionSingle'
    : b.period_end
      ? 'batchDetail.descriptionAllPeriod'
      : 'batchDetail.descriptionAll';
  const approveKey =
    snapshotRows.length === 0
      ? 'batchDetail.approveBodyNoAccounts'
      : snapshotRows.length === 1
        ? 'batchDetail.approveBodyOneAccount'
        : 'batchDetail.approveBodyAccounts';

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
                {t('batches.automatic')}
              </Badge>
            )}
          </>
        }
        description={t(descriptionKey, { type: enumLabel('payeeType', b.payee_type), date: b.period_end ? formatDate(b.period_end) : '' })}
        actions={
          <>
            {canDecide && (
              <>
                <Button
                  onClick={() => setConfirm('approve')}
                  disabled={isMaker}
                  title={isMaker ? t('batchDetail.makerTitle') : undefined}
                  icon={<Check className="size-4" aria-hidden />}
                >
                  {t('reviews.approve')}
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(true)} icon={<X className="size-4" aria-hidden />}>
                  {t('reviews.reject')}
                </Button>
              </>
            )}
            {canProcess && (
              <Button variant="accent" onClick={() => setConfirm('process')} icon={<Play className="size-4" aria-hidden />}>
                {t('batchDetail.processPayouts')}
              </Button>
            )}
          </>
        }
      />
      <SettlementTabs />

      {canDecide && isMaker && (
        <div className="mb-4">
          <Callout tone="warning" title={t('batchDetail.makerCheckerTitle')}>
            <span className="inline-flex items-start gap-1.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('batchDetail.makerCheckerBody')}
            </span>
          </Callout>
        </div>
      )}
      {canDecide && isAuto && (
        <div className="mb-4">
          <Callout tone="info" title={t('batchDetail.autoTitle')}>
            {t('batchDetail.autoBody')}
          </Callout>
        </div>
      )}
      {b.status === 'partially_failed' && (
        <div className="mb-4">
          <Callout tone="danger" title={t('batchDetail.partialTitle')}>
            {t('batchDetail.partialBody')}
          </Callout>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t('batches.columns.gross')} value={formatMoney(b.total_gross_minor, b.currency)} />
        <StatCard label={t('reports.commission')} value={formatMoney(b.total_commission_minor, b.currency)} />
        <StatCard label={t('batchDetail.gst')} value={formatMoney(b.total_tax_minor, b.currency)} />
        <StatCard label={t('batchDetail.tds')} value={formatMoney(b.total_tds_minor, b.currency)} />
        <StatCard
          label={t('batches.columns.netPayable')}
          value={formatMoney(b.total_net_minor, b.currency)}
          tone="success"
          hint={t('batchDetail.itemsCount', { count: b.items_count })}
        />
      </div>

      <div className="space-y-4">
        <Card title={t('batches.columns.batch')}>
          <DescriptionList
            columns={3}
            items={[
              { label: t('batchDetail.fields.maker'), value: isAuto ? t('batchDetail.fields.autoMaker') : (b.created_by_name ?? '—') },
              { label: t('orders.columns.created'), value: formatDateTime(b.created_at) },
              { label: t('batchDetail.fields.checker'), value: b.approved_by_name ?? '—' },
              { label: t('batchDetail.fields.approved'), value: formatDateTime(b.approved_at) },
              { label: t('orderDetail.refunds.processed'), value: formatDateTime(b.processed_at) },
              { label: t('batchDetail.fields.notes'), value: b.notes ?? '—' },
            ]}
          />
        </Card>
        <Card title={t('batchDetail.destinations.title')}>
          <div className="space-y-3 p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('batchDetail.destinations.body')}</p>
            {snapshot === null ? (
              <Callout tone="warning">{t('batchDetail.destinations.noSnapshot')}</Callout>
            ) : (
              <>
                {missingAccounts > 0 && (
                  <Callout tone="danger">{t('batchDetail.destinations.missing', { count: missingAccounts })}</Callout>
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
            {t('settlementUi.tabs.payouts')} <span className="font-normal text-muted">({payouts.length})</span>
          </h2>
          <DataTable
            id="admin.finance.batch-payouts"
            caption={t('settlementUi.tabs.payouts')}
            columns={payoutColumns}
            rows={payouts}
            defaultSort={{ key: 'amount', direction: 'desc' }}
            pageSize={25}
            emptyTitle={t('batchDetail.noPayouts')}
            emptyDescription={t('batchDetail.noPayoutsDescription')}
          />
        </section>
        <section aria-labelledby="batch-items" className="space-y-2">
          <h2 id="batch-items" className="text-base font-semibold text-fg">
            {t('settlementUi.tabs.items')} <span className="font-normal text-muted">({items.length})</span>
          </h2>
          <DataTable
            id="admin.finance.batch-items"
            caption={t('batchDetail.itemsCaption')}
            columns={itemCols}
            rows={items}
            defaultSort={{ key: 'payee', direction: 'asc' }}
            pageSize={25}
            emptyTitle={t('batchDetail.noItems')}
          />
        </section>
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm === 'approve' ? t('batchDetail.approveTitle') : t('batchDetail.processPayouts')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={approve.isPending || process.isPending}>
              {t('common.cancel')}
            </Button>
            {confirm === 'approve' ? (
              <Button
                loading={approve.isPending}
                disabled={isMaker}
                onClick={() =>
                  approve.mutate(b.id, {
                    onSuccess: () => {
                      notifySuccess(ft('batchDetail.approved', { number: b.batch_number }));
                      setConfirm(null);
                    },
                    onError: (e) => notifyError(e, ft('batchDetail.approveFailed')),
                  })
                }
              >
                {t('reviews.approve')}
              </Button>
            ) : (
              <Button
                variant="accent"
                loading={process.isPending}
                onClick={() =>
                  process.mutate(b.id, {
                    onSuccess: () => {
                      notifySuccess(ft('batchDetail.processing', { number: b.batch_number }));
                      setConfirm(null);
                    },
                    onError: (e) => notifyError(e, ft('batchDetail.processFailed')),
                  })
                }
              >
                {t('batchDetail.process')}
              </Button>
            )}
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {confirm === 'approve' ? (
            <>
              <Trans
                t={t}
                i18nKey={approveKey}
                values={{ items: b.items_count, net: formatMoney(b.total_net_minor, b.currency), accounts: snapshotRows.length }}
                components={{ 0: <strong />, 1: <strong /> }}
              />
              {missingAccounts > 0 && (
                <span className="mt-2 block text-red-700 dark:text-red-400">
                  {t('batchDetail.missingWarning', { count: missingAccounts })}
                </span>
              )}
            </>
          ) : (
            <Trans
              t={t}
              i18nKey="batchDetail.processBody"
              values={{ net: formatMoney(b.total_net_minor, b.currency) }}
              components={{ 0: <strong /> }}
            />
          )}
        </p>
      </Modal>

      <ReasonDialog
        open={rejecting}
        title={t('batchDetail.rejectTitle')}
        description={t('batchDetail.rejectDescription')}
        confirmLabel={t('batchDetail.rejectTitle')}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: b.id, reason },
            {
              onSuccess: () => {
                notifySuccess(ft('batchDetail.rejected', { number: b.batch_number }));
                setRejecting(false);
              },
              onError: (e) => notifyError(e, ft('batchDetail.rejectFailed')),
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
  const { t } = useFinanceTranslation();
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      <div className="mb-1 font-medium text-slate-900 dark:text-slate-100">{name ?? <Mono>{payeeId.slice(0, 8)}…</Mono>}</div>
      {account ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300">
          <dt className="text-slate-500">{t('batchDetail.snapshot.holder')}</dt>
          <dd>{account.account_holder_name}</dd>
          <dt className="text-slate-500">{t('ledger.entries.account')}</dt>
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
          <dt className="text-slate-500">{t('overview.stats.bank')}</dt>
          <dd>{account.bank_name ?? '—'}</dd>
          <dt className="text-slate-500">{t('batchDetail.snapshot.route')}</dt>
          <dd>{account.razorpay_linked_account_id ? <Mono>{account.razorpay_linked_account_id}</Mono> : enumLabel('payoutMethod', 'manual_bank_transfer')}</dd>
        </dl>
      ) : (
        <p className="text-red-700 dark:text-red-400">{t('batchDetail.snapshot.missing')}</p>
      )}
    </li>
  );
}
