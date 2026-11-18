import { useMemo } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import {
  LEDGER_ACCOUNT_TYPES,
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
import { enumLabel, useFinanceTranslation, type FinanceT } from '../../lib/i18n';
import { useTrialBalance } from '../../api/queries';
import { Money } from '../../components/finance';
import { LedgerTabs } from '../../components/ledger';
import { financePath } from '../../paths';

const FILTERS = {
  q: filterParam.text(),
  type: filterParam.oneOf(LEDGER_ACCOUNT_TYPES),
  active: filterParam.boolean(),
};

const trialColumns = (t: FinanceT): DataTableColumn<TrialBalanceAccountRow>[] => [
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
    key: 'type',
    header: t('ledgerAccounts.columns.type'),
    sortable: true,
    mobile: 'badge',
    cell: (a) => <Badge tone="neutral">{enumLabel('ledgerAccountType', a.type)}</Badge>,
    exportValue: (a) => enumLabel('ledgerAccountType', a.type),
  },
  {
    key: 'debit_minor',
    header: t('ledger.entries.debit'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => <MoneyCell minor={a.debit_minor || null} currency="INR" />,
    exportValue: (a) => fromMinor(a.debit_minor, 'INR'),
  },
  {
    key: 'credit_minor',
    header: t('ledger.entries.credit'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => <MoneyCell minor={a.credit_minor || null} currency="INR" />,
    exportValue: (a) => fromMinor(a.credit_minor, 'INR'),
  },
  {
    key: 'balance_minor',
    header: t('ledgerAccounts.columns.balance'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => (
      <span className="block text-end">
        <Money minor={a.balance_minor} currency="INR" signed className="font-semibold" muted={a.balance_minor === 0} />
        {a.cached_balance_minor !== a.balance_minor && (
          <span className="block text-xs text-danger-ink">{t('trialBalance.cached', { amount: formatMoney(a.cached_balance_minor, 'INR') })}</span>
        )}
      </span>
    ),
    exportValue: (a) => fromMinor(a.balance_minor, 'INR'),
  },
];

export default function TrialBalancePage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('ledger.tabs.trialBalance'));
  const columns = useMemo(() => trialColumns(t), [t]);
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
  const countOf = (type: LedgerAccountType) => searched.filter((a) => a.type === type).length;
  const quickItems: QuickFilterItem<LedgerAccountType>[] = [
    { value: '', label: t('common.all'), count: searched.length },
    ...LEDGER_ACCOUNT_TYPES.map((type) => ({ value: type, label: enumLabel('ledgerAccountType', type), count: countOf(type) })),
  ];

  const statusParts = data
    ? [
        t('trialBalance.totals', {
          debits: formatMoney(data.total_debit_minor, data.currency),
          credits: formatMoney(data.total_credit_minor, data.currency),
        }),
        ...(!balanced ? [t('trialBalance.difference', { amount: formatMoney(data.net_minor, data.currency) })] : []),
        ...(data.cached_balances_consistent === false ? [t('trialBalance.cacheMismatch')] : []),
        ...(data.as_of ? [t('trialBalance.asOf', { at: formatDateTime(data.as_of) })] : []),
      ]
    : [];

  return (
    <div>
      <PageHeader
        title={t('nav.items.ledger')}
        description={t('trialBalance.description')}
        actions={
          <Button variant="outline" leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void tb.refetch()} loading={tb.isFetching}>
            {t('trialBalance.recalculate')}
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
              <p className="font-semibold">{balanced ? t('ledger.txn.balanced') : t('trialBalance.outOfBalance')}</p>
              <p className="text-sm">{statusParts.join(' · ')}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {data.rows.map((r) => (
              <div key={r.type} className="rounded-xl border border-border bg-surface p-3 shadow-sm">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">{enumLabel('ledgerAccountType', r.type)}</dt>
                <dd className="mt-1 font-semibold tabular-nums text-fg">
                  <Money minor={r.balance_minor} currency={data.currency} signed />
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-muted">
                  {t('journal.linesSummary', {
                    debits: formatMoney(r.debit_minor, data.currency, undefined, { compact: true }),
                    credits: formatMoney(r.credit_minor, data.currency, undefined, { compact: true }),
                  })}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <DataTable
        id="admin.finance.ledger.trial-balance"
        caption={t('trialBalance.caption')}
        table={table}
        columns={columns}
        rows={data ? rows : undefined}
        loading={tb.isLoading}
        fetching={tb.isFetching && !tb.isLoading}
        error={tb.error}
        onRetry={() => void tb.refetch()}
        rowHref={(a) => financePath(`ledger/accounts/${a.id}`)}
        rowLabel={(a) => t('ledgerAccounts.openAccount', { code: a.code })}
        emptyTitle={t('trialBalance.emptyTitle')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('ledgerAccounts.accountType')} items={quickItems} value={filters.type} onChange={(v) => setFilter('type', v)} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('ledgerAccounts.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="trial-balance" columns={columns} rows={rows} />}
          >
            <ToggleFilter label={t('trialBalance.withPostings')} pressed={filters.active === true} onChange={(on) => setFilter('active', on || undefined)} />
          </FilterBar>
        }
      />
      {data && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-sm">
          <span className="font-semibold text-fg">{t('trialBalance.total')}</span>
          <span>
            {t('ledger.txn.debits')} <strong className="tabular-nums">{formatMoney(data.total_debit_minor, data.currency)}</strong>
          </span>
          <span>
            {t('ledger.txn.credits')} <strong className="tabular-nums">{formatMoney(data.total_credit_minor, data.currency)}</strong>
          </span>
          <span>
            {t('trialBalance.net')} <Money minor={data.net_minor} currency={data.currency} signed className="font-semibold" />
          </span>
        </div>
      )}
    </div>
  );
}
