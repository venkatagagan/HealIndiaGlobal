import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import {
  financeApi,
  LEDGER_ACCOUNT_TYPES,
  LEDGER_OWNER_TYPES,
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
import { enumLabel, enumOptions, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
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

const accountColumns = (t: FinanceT): DataTableColumn<LedgerAccountOut>[] => [
  {
    key: 'code',
    header: t('ledger.entries.account'),
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-80',
    cell: (a) => <IdCell value={a.code} secondary={a.name} />,
    exportValue: (a) => a.code,
  },
  {
    key: 'name',
    header: t('ledgerAccounts.columns.name'),
    sortable: true,
    defaultHidden: true,
    cell: (a) => <TextCell primary={a.name} />,
    exportValue: (a) => a.name,
  },
  {
    key: 'type',
    header: t('ledgerAccounts.columns.type'),
    sortable: true,
    mobile: 'badge',
    cell: (a) => (
      <Badge tone={TYPE_TONES[a.type]} dot>
        {enumLabel('ledgerAccountType', a.type)}
      </Badge>
    ),
    exportValue: (a) => enumLabel('ledgerAccountType', a.type),
  },
  {
    key: 'owner_type',
    header: t('ledgerAccounts.columns.owner'),
    sortable: true,
    cell: (a) => (
      <TextCell
        primary={enumLabel('ledgerOwnerType', a.owner_type)}
        secondary={a.owner_id ? <span className="font-mono">{a.owner_id.slice(0, 8)}…</span> : undefined}
      />
    ),
    exportValue: (a) => enumLabel('ledgerOwnerType', a.owner_type),
  },
  {
    key: 'normal',
    header: t('ledgerAccounts.columns.normalSide'),
    cell: (a) => <span className="text-muted">{enumLabel('entryDirection', NORMAL_BALANCE[a.type])}</span>,
    exportValue: (a) => NORMAL_BALANCE[a.type],
  },
  {
    key: 'balance',
    header: t('ledgerAccounts.columns.balance'),
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
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('ledgerAccounts.documentTitle'));
  const columns = useMemo(() => accountColumns(t), [t]);
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
    { value: '', label: t('common.all'), count: s?.total },
    ...LEDGER_ACCOUNT_TYPES.map((type) => ({ value: type, label: enumLabel('ledgerAccountType', type), count: s?.counts[type] })),
  ];
  const quickValue = filters.type.length === 0 ? '' : filters.type.length === 1 ? filters.type[0]! : null;

  return (
    <div>
      <PageHeader title={t('nav.items.ledger')} description={t('ledgerAccounts.description')} />
      <LedgerTabs />

      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {LEDGER_ACCOUNT_TYPES.map((type) => (
          <div
            key={type}
            className={cn(
              'rounded-xl border bg-surface p-3 shadow-sm',
              quickValue === type ? 'border-primary ring-1 ring-primary/40' : 'border-border',
            )}
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">{enumLabel('ledgerAccountType', type)}</dt>
            <dd className="mt-1 font-semibold tabular-nums text-fg">{s ? formatMoney(s.balances[type], 'INR') : '…'}</dd>
          </div>
        ))}
      </dl>

      <DataTable
        id="admin.finance.ledger.accounts"
        caption={t('ledgerAccounts.documentTitle')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(a) => financePath(`ledger/accounts/${a.id}`)}
        rowLabel={(a) => t('ledgerAccounts.openAccount', { code: a.code })}
        emptyTitle={t('ledgerAccounts.emptyTitle')}
        emptyDescription={t('ledgerAccounts.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('ledgerAccounts.accountType')} items={quickItems} value={quickValue} onChange={(v) => setFilter('type', v ? [v] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('ledgerAccounts.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="ledger-accounts"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listAccounts({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <MultiSelectFilter
              label={t('ledgerAccounts.columns.owner')}
              value={filters.owner_type}
              onChange={(v) => setFilter('owner_type', v)}
              options={enumOptions('ledgerOwnerType', LEDGER_OWNER_TYPES)}
            />
            <MultiSelectFilter
              label={t('ledgerAccounts.columns.type')}
              value={filters.type}
              onChange={(v) => setFilter('type', v)}
              options={LEDGER_ACCOUNT_TYPES.map((type) => ({ value: type, label: enumLabel('ledgerAccountType', type), count: s?.counts[type], tone: TYPE_TONES[type] }))}
            />
            <ToggleFilter
              label={t('ledgerAccounts.nonZero')}
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
