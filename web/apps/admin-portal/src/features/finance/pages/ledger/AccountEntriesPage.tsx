import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ENTRY_DIRECTIONS,
  ENTRY_DIRECTION_LABELS,
  financeApi,
  LEDGER_ACCOUNT_TYPE_LABELS,
  LEDGER_OWNER_TYPE_LABELS,
  LEDGER_TXN_TYPES,
  LEDGER_TXN_TYPE_LABELS,
  type AccountEntryListParams,
  type AccountEntryOut,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
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
import { Mono, Money } from '../../components/finance';
import { LedgerTabs, NORMAL_BALANCE, TransactionModal } from '../../components/ledger';
import { Badge, Card, DescriptionList } from '../../components/ui';
import { listOrUndefined } from '../../lib/tables';
import { financePath } from '../../paths';

const FILTERS = {
  direction: filterParam.oneOf(ENTRY_DIRECTIONS),
  txn_type: filterParam.list(LEDGER_TXN_TYPES),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['posted_at', 'amount_minor'] as const;

function toApiFilters(f: FilterValues<typeof FILTERS>): Omit<AccountEntryListParams, 'page' | 'page_size' | 'sort'> {
  return {
    direction: f.direction || undefined,
    txn_type: listOrUndefined(f.txn_type),
    posted_from: f.from || undefined,
    posted_to: f.to || undefined,
  };
}

const COLUMNS: DataTableColumn<AccountEntryOut>[] = [
  {
    key: 'posted',
    header: 'Posted',
    sortable: true,
    sortKey: 'posted_at',
    sortDescFirst: true,
    sticky: true,
    mobile: 'secondary',
    cell: (e) => <DateCell value={e.posted_at} display="datetime" />,
    exportValue: (e) => e.posted_at,
  },
  {
    key: 'txn',
    header: 'Transaction',
    mobile: 'primary',
    className: 'max-w-96',
    cell: (e) => <TextCell primary={LEDGER_TXN_TYPE_LABELS[e.txn_type] ?? e.txn_type} secondary={e.description ?? undefined} />,
    exportValue: (e) => LEDGER_TXN_TYPE_LABELS[e.txn_type] ?? e.txn_type,
  },
  {
    key: 'reference',
    header: 'Reference',
    cell: (e) =>
      e.reference_type ? (
        <TextCell primary={e.reference_type} secondary={e.reference_id ? <span className="font-mono">{e.reference_id.slice(0, 8)}…</span> : undefined} />
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (e) => (e.reference_type ? `${e.reference_type} ${e.reference_id ?? ''}` : ''),
  },
  {
    key: 'debit',
    header: 'Debit',
    align: 'end',
    sortable: true,
    sortKey: 'amount_minor',
    sortDescFirst: true,
    cell: (e) => (e.direction === 'debit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
    exportValue: (e) => (e.direction === 'debit' ? fromMinor(e.amount_minor, e.currency) : ''),
  },
  {
    key: 'credit',
    header: 'Credit',
    align: 'end',
    cell: (e) => (e.direction === 'credit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
    exportValue: (e) => (e.direction === 'credit' ? fromMinor(e.amount_minor, e.currency) : ''),
  },
  {
    key: 'effect',
    header: 'Balance effect',
    align: 'end',
    mobile: 'badge',
    cell: (e) => (
      <span className="block text-end">
        <Money minor={e.signed_amount_minor} currency={e.currency} signed />
      </span>
    ),
    exportValue: (e) => fromMinor(e.signed_amount_minor, e.currency),
  },
];

export default function AccountEntriesPage() {
  const { accountId = '' } = useParams();
  const account = useQuery({
    queryKey: [...financeKeys.all, 'account', accountId],
    queryFn: () => financeApi.getAccount(accountId),
    enabled: Boolean(accountId),
  });
  const a = account.data;
  useDocumentTitle(a ? `Ledger · ${a.code}` : 'Ledger account');

  const table = useTableState({ filters: FILTERS, defaultSort: '-posted_at', sortKeys: SORT_KEYS, defaultPageSize: 50 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: AccountEntryListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const entries = useQuery({
    queryKey: financeKeys.accountEntries(accountId, listParams),
    queryFn: () => financeApi.accountEntries(accountId, listParams),
    placeholderData: keepPreviousData,
    enabled: Boolean(accountId),
  });
  const [txnId, setTxnId] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        back={{ to: financePath('ledger'), label: 'Accounts' }}
        title={a ? <span className="font-mono">{a.code}</span> : 'Ledger account'}
        description={a?.name}
      />
      <LedgerTabs />

      {a && (
        <Card className="mb-4">
          <DescriptionList
            columns={3}
            items={[
              { label: 'Type', value: <Badge>{LEDGER_ACCOUNT_TYPE_LABELS[a.type]}</Badge> },
              { label: 'Owner', value: <>{LEDGER_OWNER_TYPE_LABELS[a.owner_type]}{a.owner_id && <> · <Mono>{a.owner_id}</Mono></>}</> },
              {
                label: `Balance (${NORMAL_BALANCE[a.type]}-positive)`,
                value: <Money minor={a.balance_minor} currency={a.currency} signed className="text-lg font-semibold" />,
              },
            ]}
          />
        </Card>
      )}

      <DataTable
        id="admin.finance.ledger.entries"
        caption="Account entries"
        table={table}
        columns={COLUMNS}
        rows={entries.data?.items}
        total={entries.data?.total}
        loading={entries.isLoading}
        fetching={entries.isFetching && !entries.isLoading}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        onRowClick={(e) => setTxnId(e.transaction_id)}
        rowLabel={(e) => `Open journal entry ${LEDGER_TXN_TYPE_LABELS[e.txn_type] ?? e.txn_type}`}
        emptyTitle="No entries posted to this account yet"
        toolbar={
          <FilterBar
            onReset={table.resetFilters}
            resultCount={entries.data?.total}
            actions={
              <ExportButton
                filename={`ledger-${a?.code ?? accountId}`.replace(/[^\w.-]+/g, '_')}
                columns={COLUMNS}
                rows={entries.data?.items}
                total={entries.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.accountEntries(accountId, { ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <SelectFilter
              label="Side"
              value={filters.direction}
              onChange={(v) => setFilter('direction', v)}
              options={ENTRY_DIRECTIONS.map((d) => ({ value: d, label: ENTRY_DIRECTION_LABELS[d] }))}
            />
            <MultiSelectFilter
              label="Transaction type"
              value={filters.txn_type}
              onChange={(v) => setFilter('txn_type', v)}
              options={LEDGER_TXN_TYPES.map((t) => ({ value: t, label: LEDGER_TXN_TYPE_LABELS[t] }))}
              searchable
            />
            <DateRangeFilter label="Posted" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <TransactionModal id={txnId} onClose={() => setTxnId(null)} />
    </div>
  );
}
