import { useMemo } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import {
  LEDGER_ACCOUNT_TYPES,
  LEDGER_ACCOUNT_TYPE_LABELS,
  type LedgerAccountType,
  type TrialBalanceAccountRow,
} from '@hig/shared/api';
import { filterParam, fromMinor, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  Badge,
  Button,
  DataTable,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  PageHeader,
  QuickFilters,
  ToggleFilter,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatDateTime, formatMoney } from '../../lib/shared';
import { useTrialBalance } from '../../api/queries';
import { Money } from '../../components/finance';
import { LedgerTabs } from '../../components/ledger';
import { financePath } from '../../paths';

const FILTERS = {
  q: filterParam.text(),
  type: filterParam.oneOf(LEDGER_ACCOUNT_TYPES),
  active: filterParam.boolean(),
};

const COLUMNS: DataTableColumn<TrialBalanceAccountRow>[] = [
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
    key: 'type',
    header: 'Type',
    sortable: true,
    mobile: 'badge',
    cell: (a) => <Badge tone="neutral">{LEDGER_ACCOUNT_TYPE_LABELS[a.type]}</Badge>,
    exportValue: (a) => LEDGER_ACCOUNT_TYPE_LABELS[a.type],
  },
  {
    key: 'debit_minor',
    header: 'Debit',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => <MoneyCell minor={a.debit_minor || null} currency="INR" />,
    exportValue: (a) => fromMinor(a.debit_minor, 'INR'),
  },
  {
    key: 'credit_minor',
    header: 'Credit',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => <MoneyCell minor={a.credit_minor || null} currency="INR" />,
    exportValue: (a) => fromMinor(a.credit_minor, 'INR'),
  },
  {
    key: 'balance_minor',
    header: 'Balance',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => (
      <span className="block text-end">
        <Money minor={a.balance_minor} currency="INR" signed className="font-semibold" muted={a.balance_minor === 0} />
        {a.cached_balance_minor !== a.balance_minor && (
          <span className="block text-xs text-danger-ink">cached {formatMoney(a.cached_balance_minor, 'INR')}</span>
        )}
      </span>
    ),
    exportValue: (a) => fromMinor(a.balance_minor, 'INR'),
  },
];

export default function TrialBalancePage() {
  useDocumentTitle('Trial balance');
  const tb = useTrialBalance();
  const data = tb.data;
  const table = useTableState({ filters: FILTERS, defaultSort: 'code', defaultPageSize: 50 });
  const { filters, setFilter } = table;
  const balanced = data ? data.net_minor === 0 && data.total_debit_minor === data.total_credit_minor : false;

  const all = useMemo(() => data?.accounts ?? [], [data]);
  const searched = useMemo(
    () => all.filter(matchesSearch(filters.q, (a) => [a.code, a.name])).filter((a) => !filters.active || a.debit_minor + a.credit_minor > 0),
    [all, filters.q, filters.active],
  );
  const rows = useMemo(() => (filters.type ? searched.filter((a) => a.type === filters.type) : searched), [searched, filters.type]);
  const countOf = (t: LedgerAccountType) => searched.filter((a) => a.type === t).length;
  const quickItems: QuickFilterItem<LedgerAccountType>[] = [
    { value: '', label: 'All', count: searched.length },
    ...LEDGER_ACCOUNT_TYPES.map((t) => ({ value: t, label: LEDGER_ACCOUNT_TYPE_LABELS[t], count: countOf(t) })),
  ];

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Trial balance: total debits and credits per account and account type. A healthy ledger always nets to zero."
        actions={
          <Button variant="outline" leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void tb.refetch()} loading={tb.isFetching}>
            Recalculate
          </Button>
        }
      />
      <LedgerTabs />

      {data && (
        <div className="mb-4 space-y-4">
          <div
            role="status"
            className={
              balanced
                ? 'flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-success-ink'
                : 'flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-danger-ink'
            }
          >
            {balanced ? <CheckCircle2 className="size-6 shrink-0" aria-hidden /> : <XCircle className="size-6 shrink-0" aria-hidden />}
            <div>
              <p className="font-semibold">{balanced ? 'Balanced' : 'Out of balance'}</p>
              <p className="text-sm">
                Debits {formatMoney(data.total_debit_minor, data.currency)} · Credits {formatMoney(data.total_credit_minor, data.currency)}
                {!balanced && <> · Difference {formatMoney(data.net_minor, data.currency)}. Investigate recent postings immediately.</>}
                {data.cached_balances_consistent === false && <> · Cached account balances differ from the entries.</>}
                {data.as_of && <> · as of {formatDateTime(data.as_of)}</>}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {data.rows.map((r) => (
              <div key={r.type} className="rounded-xl border border-border bg-surface p-3 shadow-sm">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">{LEDGER_ACCOUNT_TYPE_LABELS[r.type] ?? r.type}</dt>
                <dd className="mt-1 font-semibold tabular-nums text-fg">
                  <Money minor={r.balance_minor} currency={data.currency} signed />
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-muted">
                  Dr {formatMoney(r.debit_minor, data.currency, undefined, { compact: true })} · Cr{' '}
                  {formatMoney(r.credit_minor, data.currency, undefined, { compact: true })}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <DataTable
        id="admin.finance.ledger.trial-balance"
        caption="Trial balance by account"
        table={table}
        columns={COLUMNS}
        rows={data ? rows : undefined}
        loading={tb.isLoading}
        fetching={tb.isFetching && !tb.isLoading}
        error={tb.error}
        onRetry={() => void tb.refetch()}
        rowHref={(a) => financePath(`ledger/accounts/${a.id}`)}
        rowLabel={(a) => `Open account ${a.code}`}
        emptyTitle="No postings yet"
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Account type" items={quickItems} value={filters.type} onChange={(t) => setFilter('type', t)} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Account code or name…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="trial-balance" columns={COLUMNS} rows={rows} />}
          >
            <ToggleFilter label="With postings" pressed={filters.active === true} onChange={(on) => setFilter('active', on || undefined)} />
          </FilterBar>
        }
      />
      {data && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-sm">
          <span className="font-semibold text-fg">Total</span>
          <span>
            Debits <strong className="tabular-nums">{formatMoney(data.total_debit_minor, data.currency)}</strong>
          </span>
          <span>
            Credits <strong className="tabular-nums">{formatMoney(data.total_credit_minor, data.currency)}</strong>
          </span>
          <span>
            Net <Money minor={data.net_minor} currency={data.currency} signed className="font-semibold" />
          </span>
        </div>
      )}
    </div>
  );
}
