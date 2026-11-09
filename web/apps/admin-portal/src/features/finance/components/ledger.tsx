/** Shared ledger pieces: sub-navigation and the transaction (journal entry) viewer. */
import { NavLink } from 'react-router';
import {
  ENTRY_DIRECTION_LABELS,
  LEDGER_TXN_TYPE_LABELS,
  type LedgerAccountType,
  type LedgerEntryOut,
  type Uuid,
} from '@hig/shared/api';
import { cn, formatDateTime } from '../lib/shared';
import { useTransaction } from '../api/queries';
import { DataTable as SharedDataTable, IdCell, MoneyCell, type DataTableColumn } from '@hig/shared/ui';
import { Mono, Money } from './finance';
import { Badge, DescriptionList, ErrorState, LoadingState, Modal } from './ui';
import { financePath } from '../paths';

const TABS = [
  { to: financePath('ledger'), label: 'Accounts', end: true },
  { to: financePath('ledger/journal'), label: 'Journal', end: false },
  { to: financePath('ledger/trial-balance'), label: 'Trial balance', end: false },
  { to: financePath('ledger/adjustments'), label: 'Adjustments', end: false },
];

export function LedgerTabs() {
  return (
    <nav aria-label="Ledger sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              isActive
                ? 'border-green-500 text-green-700 dark:text-green-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function TransactionModal({ id, onClose }: { id: Uuid | null; onClose: () => void }) {
  const txn = useTransaction(id);
  const t = txn.data;
  const entries = t?.entries ?? [];
  const currency = entries[0]?.currency ?? 'INR';
  const debits = entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount_minor, 0);
  const credits = entries.filter((e) => e.direction === 'credit').reduce((s, e) => s + e.amount_minor, 0);
  return (
    <Modal open={id !== null} onClose={onClose} title="Journal entry" size="lg"
      description={t ? `${LEDGER_TXN_TYPE_LABELS[t.txn_type] ?? t.txn_type} · posted ${formatDateTime(t.posted_at)}` : undefined}>
      {txn.isLoading ? (
        <LoadingState />
      ) : txn.isError || !t ? (
        <ErrorState error={txn.error} onRetry={() => void txn.refetch()} />
      ) : (
        <div className="space-y-4">
          <DescriptionList
            items={[
              { label: 'Description', value: t.description ?? '—' },
              { label: 'Reference', value: t.reference_type ? <>{t.reference_type} <Mono>{t.reference_id ?? ''}</Mono></> : '—' },
              { label: 'Idempotency key', value: <Mono className="break-all">{t.idempotency_key}</Mono> },
              { label: 'Transaction id', value: <Mono className="break-all">{t.id}</Mono> },
            ]}
          />
          <EntriesTable entries={entries} />
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
            <span>
              Debits <Money minor={debits} currency={currency} className="font-semibold" />
            </span>
            <span>
              Credits <Money minor={credits} currency={currency} className="font-semibold" />
            </span>
            {debits === credits ? <Badge tone="success">Balanced</Badge> : <Badge tone="danger">Unbalanced</Badge>}
          </div>
        </div>
      )}
    </Modal>
  );
}

const ENTRY_COLUMNS: DataTableColumn<LedgerEntryOut>[] = [
  {
    key: 'account',
    header: 'Account',
    mobile: 'primary',
    sortable: true,
    sortValue: (e) => e.account_code,
    cell: (e) => (
      <span className={cn('block', e.direction === 'credit' && 'ps-6')}>
        <IdCell value={e.account_code} secondary={e.account_name} />
        <span className="sr-only">{ENTRY_DIRECTION_LABELS[e.direction]}</span>
      </span>
    ),
    exportValue: (e) => e.account_code,
  },
  {
    key: 'debit',
    header: 'Debit',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (e) => (e.direction === 'debit' ? e.amount_minor : 0),
    cell: (e) => (e.direction === 'debit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
  },
  {
    key: 'credit',
    header: 'Credit',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (e) => (e.direction === 'credit' ? e.amount_minor : 0),
    cell: (e) => (e.direction === 'credit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
  },
];

/** Lines of one journal entry (debits first, credits indented). */
export function EntriesTable({ entries }: { entries: LedgerEntryOut[] }) {
  const ordered = [...entries].sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'debit' ? -1 : 1));
  return <SharedDataTable caption="Ledger entries" columns={ENTRY_COLUMNS} rows={ordered} responsive="cards" showViewOptions={false} />;
}

/** Normal-balance side per account type (PLAN 4.12). */
export const NORMAL_BALANCE: Record<LedgerAccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  revenue: 'credit',
  equity: 'credit',
};
