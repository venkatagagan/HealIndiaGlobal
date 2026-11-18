import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import {
  financeApi,
  LEDGER_TXN_TYPES,
  type LedgerTransactionListParams,
  type LedgerTransactionOut,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Badge,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  SelectFilter,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { enumLabel, enumOptions, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
import { financeKeys } from '../../api/queries';
import { LedgerTabs, TransactionModal } from '../../components/ledger';
import { listOrUndefined, minorOrUndefined } from '../../lib/tables';

const FILTERS = {
  q: filterParam.text(),
  txn_type: filterParam.list(LEDGER_TXN_TYPES),
  account_id: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['posted_at'] as const;

function toApiFilters(f: FilterValues<typeof FILTERS>): Omit<LedgerTransactionListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    txn_type: listOrUndefined(f.txn_type),
    account_id: f.account_id || undefined,
    posted_from: f.from || undefined,
    posted_to: f.to || undefined,
    min_amount: minorOrUndefined(f.min),
    max_amount: minorOrUndefined(f.max),
  };
}

function totalOf(tx: LedgerTransactionOut): number | null {
  if (typeof tx.total_minor === 'number') return tx.total_minor;
  if (!tx.entries) return null;
  return tx.entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount_minor, 0);
}

/** "Dr ESCROW · Cr HOSPITAL:…" summary of the lines of a transaction */
function linesSummary(t: FinanceT, tx: LedgerTransactionOut): string | undefined {
  if (!tx.entries?.length) return undefined;
  const short = (code: string) => code.replace(/:[0-9a-f]{8}-[0-9a-f-]{27}:/i, ':…:');
  const dr = tx.entries.filter((e) => e.direction === 'debit').map((e) => short(e.account_code));
  const cr = tx.entries.filter((e) => e.direction === 'credit').map((e) => short(e.account_code));
  return t('journal.linesSummary', { debits: dr.join(', '), credits: cr.join(', ') });
}

const journalColumns = (t: FinanceT): DataTableColumn<LedgerTransactionOut>[] => [
  {
    key: 'posted',
    header: t('ledgerEntries.columns.posted'),
    sortable: true,
    sortKey: 'posted_at',
    sortDescFirst: true,
    sticky: true,
    mobile: 'secondary',
    cell: (tx) => <DateCell value={tx.posted_at} display="datetime" />,
    exportValue: (tx) => tx.posted_at,
  },
  {
    key: 'type',
    header: t('ledgerAccounts.columns.type'),
    mobile: 'badge',
    cell: (tx) => <Badge tone="neutral">{enumLabel('ledgerTxnType', tx.txn_type)}</Badge>,
    exportValue: (tx) => enumLabel('ledgerTxnType', tx.txn_type),
  },
  {
    key: 'description',
    header: t('ledger.txn.description'),
    mobile: 'primary',
    className: 'max-w-[28rem]',
    cell: (tx) => <TextCell primary={tx.description ?? <span className="text-muted">—</span>} secondary={linesSummary(t, tx)} />,
    mobileCell: (tx) => tx.description ?? enumLabel('ledgerTxnType', tx.txn_type),
    exportValue: (tx) => tx.description ?? '',
  },
  {
    key: 'reference',
    header: t('ledger.txn.reference'),
    cell: (tx) =>
      tx.reference_type ? (
        <TextCell primary={tx.reference_type} secondary={tx.reference_id ? <span className="font-mono">{tx.reference_id.slice(0, 8)}…</span> : undefined} />
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (tx) => (tx.reference_type ? `${tx.reference_type} ${tx.reference_id ?? ''}` : ''),
  },
  {
    key: 'lines',
    header: t('journal.lines'),
    align: 'end',
    defaultHidden: true,
    cell: (tx) => <span className="tabular-nums">{tx.entries?.length ?? '—'}</span>,
    exportValue: (tx) => tx.entries?.length ?? '',
  },
  {
    key: 'amount',
    header: t('orders.columns.amount'),
    align: 'end',
    cell: (tx) => <MoneyCell minor={totalOf(tx)} currency={tx.entries?.[0]?.currency ?? 'INR'} />,
    exportValue: (tx) => {
      const total = totalOf(tx);
      return total === null ? '' : fromMinor(total, tx.entries?.[0]?.currency ?? 'INR');
    },
  },
];

export default function JournalPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('journal.documentTitle'));
  const columns = useMemo(() => journalColumns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-posted_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: LedgerTransactionListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const txns = useQuery({
    queryKey: financeKeys.transactions(listParams),
    queryFn: () => financeApi.listTransactions(listParams),
    placeholderData: keepPreviousData,
  });
  const accounts = useQuery({
    queryKey: [...financeKeys.all, 'accounts', 'options'],
    queryFn: () => financeApi.listAccounts({ page_size: 100, sort: 'code' }),
    select: (p) => p.items.map((a) => ({ value: a.id, label: a.code, description: a.name })),
    staleTime: 5 * 60_000,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title={t('nav.items.ledger')} description={t('journal.description')} />
      <LedgerTabs />
      <DataTable
        id="admin.finance.ledger.journal"
        caption={t('journal.caption')}
        table={table}
        columns={columns}
        rows={txns.data?.items}
        total={txns.data?.total}
        loading={txns.isLoading}
        fetching={txns.isFetching && !txns.isLoading}
        error={txns.error}
        onRetry={() => void txns.refetch()}
        onRowClick={(tx) => setOpenId(tx.id)}
        rowLabel={(tx) => t('ledgerEntries.openEntry', { type: enumLabel('ledgerTxnType', tx.txn_type) })}
        emptyTitle={t('journal.emptyTitle')}
        emptyDescription={t('journal.emptyDescription')}
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('journal.searchPlaceholder') }}
            onReset={table.resetFilters}
            resultCount={txns.data?.total}
            actions={
              <ExportButton
                filename="ledger-journal"
                columns={columns}
                rows={txns.data?.items}
                total={txns.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listTransactions({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <MultiSelectFilter
              label={t('ledgerAccounts.columns.type')}
              value={filters.txn_type}
              onChange={(v) => setFilter('txn_type', v)}
              options={enumOptions('ledgerTxnType', LEDGER_TXN_TYPES)}
              searchable
            />
            <SelectFilter
              label={t('ledger.entries.account')}
              icon={<BookOpen className="size-3.5 opacity-70" aria-hidden />}
              value={filters.account_id}
              onChange={(v) => setFilter('account_id', v)}
              options={accounts.data ?? []}
              loading={accounts.isLoading}
              searchable
            />
            <AmountRangeFilter label={t('orders.columns.amount')} currency="INR" value={{ min: filters.min, max: filters.max }} onChange={({ min, max }) => setFilters({ min, max })} />
            <DateRangeFilter label={t('ledgerEntries.columns.posted')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <TransactionModal id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
