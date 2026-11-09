import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import {
  financeApi,
  LEDGER_TXN_TYPES,
  LEDGER_TXN_TYPE_LABELS,
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

function totalOf(t: LedgerTransactionOut): number | null {
  if (typeof t.total_minor === 'number') return t.total_minor;
  if (!t.entries) return null;
  return t.entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount_minor, 0);
}

/** "Dr ESCROW · Cr HOSPITAL:…" summary of the lines of a transaction */
function linesSummary(t: LedgerTransactionOut): string | undefined {
  if (!t.entries?.length) return undefined;
  const short = (code: string) => code.replace(/:[0-9a-f]{8}-[0-9a-f-]{27}:/i, ':…:');
  const dr = t.entries.filter((e) => e.direction === 'debit').map((e) => short(e.account_code));
  const cr = t.entries.filter((e) => e.direction === 'credit').map((e) => short(e.account_code));
  return `Dr ${dr.join(', ')} · Cr ${cr.join(', ')}`;
}

const COLUMNS: DataTableColumn<LedgerTransactionOut>[] = [
  {
    key: 'posted',
    header: 'Posted',
    sortable: true,
    sortKey: 'posted_at',
    sortDescFirst: true,
    sticky: true,
    mobile: 'secondary',
    cell: (t) => <DateCell value={t.posted_at} display="datetime" />,
    exportValue: (t) => t.posted_at,
  },
  {
    key: 'type',
    header: 'Type',
    mobile: 'badge',
    cell: (t) => <Badge tone="neutral">{LEDGER_TXN_TYPE_LABELS[t.txn_type] ?? t.txn_type}</Badge>,
    exportValue: (t) => LEDGER_TXN_TYPE_LABELS[t.txn_type] ?? t.txn_type,
  },
  {
    key: 'description',
    header: 'Description',
    mobile: 'primary',
    className: 'max-w-[28rem]',
    cell: (t) => <TextCell primary={t.description ?? <span className="text-muted">—</span>} secondary={linesSummary(t)} />,
    mobileCell: (t) => t.description ?? LEDGER_TXN_TYPE_LABELS[t.txn_type],
    exportValue: (t) => t.description ?? '',
  },
  {
    key: 'reference',
    header: 'Reference',
    cell: (t) =>
      t.reference_type ? (
        <TextCell primary={t.reference_type} secondary={t.reference_id ? <span className="font-mono">{t.reference_id.slice(0, 8)}…</span> : undefined} />
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (t) => (t.reference_type ? `${t.reference_type} ${t.reference_id ?? ''}` : ''),
  },
  {
    key: 'lines',
    header: 'Lines',
    align: 'end',
    defaultHidden: true,
    cell: (t) => <span className="tabular-nums">{t.entries?.length ?? '—'}</span>,
    exportValue: (t) => t.entries?.length ?? '',
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (t) => <MoneyCell minor={totalOf(t)} currency={t.entries?.[0]?.currency ?? 'INR'} />,
    exportValue: (t) => {
      const total = totalOf(t);
      return total === null ? '' : fromMinor(total, t.entries?.[0]?.currency ?? 'INR');
    },
  },
];

export default function JournalPage() {
  useDocumentTitle('Ledger journal');
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
      <PageHeader title="Ledger" description="Journal of posted transactions. Each transaction's debits equal its credits (enforced by the database)." />
      <LedgerTabs />
      <DataTable
        id="admin.finance.ledger.journal"
        caption="Ledger transactions"
        table={table}
        columns={COLUMNS}
        rows={txns.data?.items}
        total={txns.data?.total}
        loading={txns.isLoading}
        fetching={txns.isFetching && !txns.isLoading}
        error={txns.error}
        onRetry={() => void txns.refetch()}
        onRowClick={(t) => setOpenId(t.id)}
        rowLabel={(t) => `Open journal entry ${LEDGER_TXN_TYPE_LABELS[t.txn_type] ?? t.txn_type}`}
        emptyTitle="No transactions posted yet"
        emptyDescription="Payments, revenue recognition, refunds and payouts post balanced journal entries here."
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Description or reference id…' }}
            onReset={table.resetFilters}
            resultCount={txns.data?.total}
            actions={
              <ExportButton
                filename="ledger-journal"
                columns={COLUMNS}
                rows={txns.data?.items}
                total={txns.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listTransactions({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <MultiSelectFilter
              label="Type"
              value={filters.txn_type}
              onChange={(v) => setFilter('txn_type', v)}
              options={LEDGER_TXN_TYPES.map((t) => ({ value: t, label: LEDGER_TXN_TYPE_LABELS[t] }))}
              searchable
            />
            <SelectFilter
              label="Account"
              icon={<BookOpen className="size-3.5 opacity-70" aria-hidden />}
              value={filters.account_id}
              onChange={(v) => setFilter('account_id', v)}
              options={accounts.data ?? []}
              loading={accounts.isLoading}
              searchable
            />
            <AmountRangeFilter label="Amount" currency="INR" value={{ min: filters.min, max: filters.max }} onChange={({ min, max }) => setFilters({ min, max })} />
            <DateRangeFilter label="Posted" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <TransactionModal id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
