/** Shared ledger pieces: sub-navigation and the transaction (journal entry) viewer. */
import { useMemo } from 'react';
import { NavLink } from 'react-router';
import { type LedgerAccountType, type LedgerEntryOut, type Uuid } from '@hig/shared/api';
import { cn, formatDateTime } from '../lib/shared';
import { enumLabel, useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { useTransaction } from '../api/queries';
import { DataTable as SharedDataTable, IdCell, MoneyCell, type DataTableColumn } from '@hig/shared/ui';
import { Mono, Money } from './finance';
import { Badge, DescriptionList, ErrorState, LoadingState, Modal } from './ui';
import { financePath } from '../paths';

const TABS = [
  { to: financePath('ledger'), labelKey: 'ledger.tabs.accounts', end: true },
  { to: financePath('ledger/journal'), labelKey: 'ledger.tabs.journal', end: false },
  { to: financePath('ledger/trial-balance'), labelKey: 'ledger.tabs.trialBalance', end: false },
  { to: financePath('ledger/adjustments'), labelKey: 'ledger.tabs.adjustments', end: false },
] as const;

export function LedgerTabs() {
  const { t } = useFinanceTranslation();
  return (
    <nav aria-label={t('ledger.tabs.label')} className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              isActive
                ? 'border-green-500 text-green-700 dark:text-green-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}

export function TransactionModal({ id, onClose }: { id: Uuid | null; onClose: () => void }) {
  const { t } = useFinanceTranslation();
  const txn = useTransaction(id);
  const tx = txn.data;
  const entries = tx?.entries ?? [];
  const currency = entries[0]?.currency ?? 'INR';
  const debits = entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount_minor, 0);
  const credits = entries.filter((e) => e.direction === 'credit').reduce((s, e) => s + e.amount_minor, 0);
  return (
    <Modal open={id !== null} onClose={onClose} title={t('ledger.txn.title')} size="lg"
      description={tx ? t('ledger.txn.subtitle', { type: enumLabel('ledgerTxnType', tx.txn_type), posted: formatDateTime(tx.posted_at) }) : undefined}>
      {txn.isLoading ? (
        <LoadingState />
      ) : txn.isError || !tx ? (
        <ErrorState error={txn.error} onRetry={() => void txn.refetch()} />
      ) : (
        <div className="space-y-4">
          <DescriptionList
            items={[
              { label: t('ledger.txn.description'), value: tx.description ?? '—' },
              { label: t('ledger.txn.reference'), value: tx.reference_type ? <>{tx.reference_type} <Mono>{tx.reference_id ?? ''}</Mono></> : '—' },
              { label: t('ledger.txn.idempotencyKey'), value: <Mono className="break-all">{tx.idempotency_key}</Mono> },
              { label: t('ledger.txn.transactionId'), value: <Mono className="break-all">{tx.id}</Mono> },
            ]}
          />
          <EntriesTable entries={entries} />
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
            <span>
              {t('ledger.txn.debits')} <Money minor={debits} currency={currency} className="font-semibold" />
            </span>
            <span>
              {t('ledger.txn.credits')} <Money minor={credits} currency={currency} className="font-semibold" />
            </span>
            {debits === credits ? <Badge tone="success">{t('ledger.txn.balanced')}</Badge> : <Badge tone="danger">{t('ledger.txn.unbalanced')}</Badge>}
          </div>
        </div>
      )}
    </Modal>
  );
}

const entryColumns = (t: FinanceT): DataTableColumn<LedgerEntryOut>[] => [
  {
    key: 'account',
    header: t('ledger.entries.account'),
    mobile: 'primary',
    sortable: true,
    sortValue: (e) => e.account_code,
    cell: (e) => (
      <span className={cn('block', e.direction === 'credit' && 'ps-6')}>
        <IdCell value={e.account_code} secondary={e.account_name} />
        <span className="sr-only">{enumLabel('entryDirection', e.direction)}</span>
      </span>
    ),
    exportValue: (e) => e.account_code,
  },
  {
    key: 'debit',
    header: t('ledger.entries.debit'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (e) => (e.direction === 'debit' ? e.amount_minor : 0),
    cell: (e) => (e.direction === 'debit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
  },
  {
    key: 'credit',
    header: t('ledger.entries.credit'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (e) => (e.direction === 'credit' ? e.amount_minor : 0),
    cell: (e) => (e.direction === 'credit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
  },
];

/** Lines of one journal entry (debits first, credits indented). */
export function EntriesTable({ entries }: { entries: LedgerEntryOut[] }) {
  const { t } = useFinanceTranslation();
  const columns = useMemo(() => entryColumns(t), [t]);
  const ordered = [...entries].sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'debit' ? -1 : 1));
  return <SharedDataTable caption={t('ledger.entries.caption')} columns={columns} rows={ordered} responsive="cards" showViewOptions={false} />;
}

/** Normal-balance side per account type (PLAN 4.12). */
export const NORMAL_BALANCE: Record<LedgerAccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  revenue: 'credit',
  equity: 'credit',
};
