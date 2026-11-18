import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ENTRY_DIRECTIONS,
  financeApi,
  LEDGER_TXN_TYPES,
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
import { enumLabel, enumOptions, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
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

const entryColumns = (t: FinanceT): DataTableColumn<AccountEntryOut>[] => [
  {
    key: 'posted',
    header: t('ledgerEntries.columns.posted'),
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
    header: t('ledgerEntries.columns.transaction'),
    mobile: 'primary',
    className: 'max-w-96',
    cell: (e) => <TextCell primary={enumLabel('ledgerTxnType', e.txn_type)} secondary={e.description ?? undefined} />,
    exportValue: (e) => enumLabel('ledgerTxnType', e.txn_type),
  },
  {
    key: 'reference',
    header: t('ledger.txn.reference'),
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
    header: t('ledger.entries.debit'),
    align: 'end',
    sortable: true,
    sortKey: 'amount_minor',
    sortDescFirst: true,
    cell: (e) => (e.direction === 'debit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
    exportValue: (e) => (e.direction === 'debit' ? fromMinor(e.amount_minor, e.currency) : ''),
  },
  {
    key: 'credit',
    header: t('ledger.entries.credit'),
    align: 'end',
    cell: (e) => (e.direction === 'credit' ? <MoneyCell minor={e.amount_minor} currency={e.currency} /> : null),
    exportValue: (e) => (e.direction === 'credit' ? fromMinor(e.amount_minor, e.currency) : ''),
  },
  {
    key: 'effect',
    header: t('ledgerEntries.columns.balanceEffect'),
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
  const { t } = useFinanceTranslation();
  const columns = useMemo(() => entryColumns(t), [t]);
  const { accountId = '' } = useParams();
  const account = useQuery({
    queryKey: [...financeKeys.all, 'account', accountId],
    queryFn: () => financeApi.getAccount(accountId),
    enabled: Boolean(accountId),
  });
  const a = account.data;
  useDocumentTitle(a ? t('ledgerEntries.documentTitle', { code: a.code }) : t('ledgerEntries.title'));

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
        back={{ to: financePath('ledger'), label: t('ledger.tabs.accounts') }}
        title={a ? <span className="font-mono">{a.code}</span> : t('ledgerEntries.title')}
        description={a?.name}
      />
      <LedgerTabs />

      {a && (
        <Card className="mb-4">
          <DescriptionList
            columns={3}
            items={[
              { label: t('ledgerAccounts.columns.type'), value: <Badge>{enumLabel('ledgerAccountType', a.type)}</Badge> },
              {
                label: t('ledgerAccounts.columns.owner'),
                value: <>{enumLabel('ledgerOwnerType', a.owner_type)}{a.owner_id && <> · <Mono>{a.owner_id}</Mono></>}</>,
              },
              {
                label: NORMAL_BALANCE[a.type] === 'debit' ? t('ledgerEntries.balanceDebitPositive') : t('ledgerEntries.balanceCreditPositive'),
                value: <Money minor={a.balance_minor} currency={a.currency} signed className="text-lg font-semibold" />,
              },
            ]}
          />
        </Card>
      )}

      <DataTable
        id="admin.finance.ledger.entries"
        caption={t('ledgerEntries.caption')}
        table={table}
        columns={columns}
        rows={entries.data?.items}
        total={entries.data?.total}
        loading={entries.isLoading}
        fetching={entries.isFetching && !entries.isLoading}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        onRowClick={(e) => setTxnId(e.transaction_id)}
        rowLabel={(e) => t('ledgerEntries.openEntry', { type: enumLabel('ledgerTxnType', e.txn_type) })}
        emptyTitle={t('ledgerEntries.emptyTitle')}
        toolbar={
          <FilterBar
            onReset={table.resetFilters}
            resultCount={entries.data?.total}
            actions={
              <ExportButton
                filename={`ledger-${a?.code ?? accountId}`.replace(/[^\w.-]+/g, '_')}
                columns={columns}
                rows={entries.data?.items}
                total={entries.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.accountEntries(accountId, { ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <SelectFilter
              label={t('ledgerEntries.side')}
              value={filters.direction}
              onChange={(v) => setFilter('direction', v)}
              options={enumOptions('entryDirection', ENTRY_DIRECTIONS)}
            />
            <MultiSelectFilter
              label={t('ledgerEntries.transactionType')}
              value={filters.txn_type}
              onChange={(v) => setFilter('txn_type', v)}
              options={enumOptions('ledgerTxnType', LEDGER_TXN_TYPES)}
              searchable
            />
            <DateRangeFilter label={t('ledgerEntries.columns.posted')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <TransactionModal id={txnId} onClose={() => setTxnId(null)} />
    </div>
  );
}
