import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import {
  financeApi,
  LEDGER_ACCOUNT_TYPES,
  LEDGER_ACCOUNT_TYPE_LABELS,
  LEDGER_OWNER_TYPES,
  LEDGER_OWNER_TYPE_LABELS,
  type LedgerAccountListParams,
  type LedgerAccountOut,
  type LedgerAccountType,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  ExportButton,
  FilterBar,
  IdCell,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  TextCell,
  ToggleFilter,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { cn, formatMoney } from '../../lib/shared';
import { financeKeys } from '../../api/queries';
import { Money } from '../../components/finance';
import { LedgerTabs, NORMAL_BALANCE } from '../../components/ledger';
import { listOrUndefined } from '../../lib/tables';
import { financePath } from '../../paths';

const FILTERS = {
  q: filterParam.text(),
  type: filterParam.list(LEDGER_ACCOUNT_TYPES),
  owner_type: filterParam.list(LEDGER_OWNER_TYPES),
  nonzero: filterParam.boolean(),
};
const SORT_KEYS = ['code', 'name', 'type', 'owner_type', 'balance_minor'] as const;

function toApiFilters(f: FilterValues<typeof FILTERS>): Omit<LedgerAccountListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    type: listOrUndefined(f.type),
    owner_type: listOrUndefined(f.owner_type),
    nonzero: f.nonzero || undefined,
  };
}

const TYPE_TONES: Record<LedgerAccountType, 'info' | 'warning' | 'success' | 'danger' | 'accent'> = {
  asset: 'info',
  liability: 'warning',
  revenue: 'success',
  expense: 'danger',
  equity: 'accent',
};

const COLUMNS: DataTableColumn<LedgerAccountOut>[] = [
  {
    key: 'code',
    header: 'Account',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-80',
    cell: (a) => <IdCell value={a.code} secondary={a.name} />,
    exportValue: (a) => a.code,
  },
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    defaultHidden: true,
    cell: (a) => <TextCell primary={a.name} />,
    exportValue: (a) => a.name,
  },
  {
    key: 'type',
    header: 'Type',
    sortable: true,
    mobile: 'badge',
    cell: (a) => (
      <Badge tone={TYPE_TONES[a.type]} dot>
        {LEDGER_ACCOUNT_TYPE_LABELS[a.type]}
      </Badge>
    ),
    exportValue: (a) => LEDGER_ACCOUNT_TYPE_LABELS[a.type],
  },
  {
    key: 'owner_type',
    header: 'Owner',
    sortable: true,
    cell: (a) => (
      <TextCell
        primary={LEDGER_OWNER_TYPE_LABELS[a.owner_type] ?? a.owner_type}
        secondary={a.owner_id ? <span className="font-mono">{a.owner_id.slice(0, 8)}…</span> : undefined}
      />
    ),
    exportValue: (a) => LEDGER_OWNER_TYPE_LABELS[a.owner_type] ?? a.owner_type,
  },
  {
    key: 'normal',
    header: 'Normal side',
    cell: (a) => <span className="text-muted">{NORMAL_BALANCE[a.type] === 'debit' ? 'Debit' : 'Credit'}</span>,
    exportValue: (a) => NORMAL_BALANCE[a.type],
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'end',
    sortable: true,
    sortKey: 'balance_minor',
    sortDescFirst: true,
    cell: (a) => (
      <span className="block text-end">
        <Money minor={a.balance_minor} currency={a.currency} signed className="font-semibold" muted={a.balance_minor === 0} />
      </span>
    ),
    exportValue: (a) => fromMinor(a.balance_minor, a.currency),
  },
];

export default function AccountsPage() {
  useDocumentTitle('Ledger accounts');
  const table = useTableState({ filters: FILTERS, defaultSort: 'code', sortKeys: SORT_KEYS, defaultPageSize: 50 });
  const { filters, setFilter } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: LedgerAccountListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const summaryFilters = { q: apiFilters.q, owner_type: apiFilters.owner_type, nonzero: apiFilters.nonzero };

  const list = useQuery({
    queryKey: [...financeKeys.all, 'accounts', 'table', listParams],
    queryFn: () => financeApi.listAccounts(listParams),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: [...financeKeys.all, 'accounts', 'summary', summaryFilters],
    queryFn: () => financeApi.accountsSummary(summaryFilters),
    placeholderData: keepPreviousData,
  });
  const s = summary.data;

  const quickItems: QuickFilterItem<LedgerAccountType>[] = [
    { value: '', label: 'All', count: s?.total },
    ...LEDGER_ACCOUNT_TYPES.map((t) => ({ value: t, label: LEDGER_ACCOUNT_TYPE_LABELS[t], count: s?.counts[t] })),
  ];
  const quickValue = filters.type.length === 0 ? '' : filters.type.length === 1 ? filters.type[0]! : null;

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Double-entry, immutable ledger in INR. Assets and expenses are debit-positive; liabilities, revenue and equity are credit-positive."
      />
      <LedgerTabs />

      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {LEDGER_ACCOUNT_TYPES.map((t) => (
          <div
            key={t}
            className={cn(
              'rounded-xl border bg-surface p-3 shadow-sm',
              quickValue === t ? 'border-primary ring-1 ring-primary/40' : 'border-border',
            )}
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{LEDGER_ACCOUNT_TYPE_LABELS[t]}</dt>
            <dd className="mt-1 font-semibold tabular-nums text-fg">{s ? formatMoney(s.balances[t], 'INR') : '…'}</dd>
          </div>
        ))}
      </dl>

      <DataTable
        id="admin.finance.ledger.accounts"
        caption="Ledger accounts"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(a) => financePath(`ledger/accounts/${a.id}`)}
        rowLabel={(a) => `Open account ${a.code}`}
        emptyTitle="No accounts yet"
        emptyDescription="Accounts are created automatically on the first posting."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Account type" items={quickItems} value={quickValue} onChange={(t) => setFilter('type', t ? [t] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Account code or name…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="ledger-accounts"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listAccounts({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <MultiSelectFilter
              label="Owner"
              value={filters.owner_type}
              onChange={(v) => setFilter('owner_type', v)}
              options={LEDGER_OWNER_TYPES.map((o) => ({ value: o, label: LEDGER_OWNER_TYPE_LABELS[o] }))}
            />
            <MultiSelectFilter
              label="Type"
              value={filters.type}
              onChange={(v) => setFilter('type', v)}
              options={LEDGER_ACCOUNT_TYPES.map((t) => ({ value: t, label: LEDGER_ACCOUNT_TYPE_LABELS[t], count: s?.counts[t], tone: TYPE_TONES[t] }))}
            />
            <ToggleFilter
              label="Non-zero balance"
              icon={<Scale className="size-3.5 opacity-70" aria-hidden />}
              pressed={filters.nonzero === true}
              onChange={(on) => setFilter('nonzero', on || undefined)}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
