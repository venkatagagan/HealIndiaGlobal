import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CreditCard, Landmark, ShieldCheck } from 'lucide-react';
import {
  ORDER_STATUSES,
  PAYMENT_GATEWAYS,
  PAYMENT_METHODS,
  PAYMENT_PURPOSES,
  paymentsApi,
  type OrderListParams,
  type OrderStatus,
  type PaymentOrderOut,
} from '@hig/shared/api';
import {
  fetchAllPages,
  filterParam,
  formatDate,
  fromMinor,
  useDocumentTitle,
  useTableState,
  type FilterValues,
} from '@hig/shared/lib';
import {
  AmountRangeFilter,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { financeKeys } from '../api/queries';
import { reviewKindLabel, ReviewBadge } from '../components/reviews';
import { enumLabel, enumOptions, useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { CURRENCY_OPTIONS, listOrUndefined, minorOrUndefined, orUndefined } from '../lib/tables';
import { financePath } from '../paths';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const REVIEW_VALUES = ['amount', 'mark_paid', 'any'] as const;
const DATE_FIELDS = ['created', 'paid'] as const;

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(ORDER_STATUSES),
  review: filterParam.oneOf(REVIEW_VALUES),
  gateway: filterParam.list(PAYMENT_GATEWAYS),
  method: filterParam.list(PAYMENT_METHODS),
  purpose: filterParam.list(PAYMENT_PURPOSES),
  currency: filterParam.list(),
  date_field: filterParam.oneOf(DATE_FIELDS, 'created'),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'paid_at', 'base_amount_minor', 'order_number', 'status'] as const;

type OrderFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: OrderFilters): Omit<OrderListParams, 'page' | 'page_size' | 'sort'> {
  const dateKey = f.date_field === 'paid' ? 'paid' : 'created';
  return {
    q: f.q.trim() || undefined,
    status: listOrUndefined(f.status),
    review: orUndefined(f.review),
    gateway: listOrUndefined(f.gateway),
    method: listOrUndefined(f.method),
    purpose: listOrUndefined(f.purpose),
    currency: listOrUndefined(f.currency),
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
    min_amount: minorOrUndefined(f.min),
    max_amount: minorOrUndefined(f.max),
  };
}

/** Status tabs: one status, or the finance-review queue. */
type QuickValue = OrderStatus | 'review';
const QUICK_STATUSES: OrderStatus[] = ['pending', 'paid', 'failed', 'refunded'];
const REVIEW_TAB = 'review';

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const money = (minor: number, currency: string) => `${currency} ${fromMinor(minor, currency)}`;

const orderColumns = (t: FinanceT): DataTableColumn<PaymentOrderOut>[] => [
  {
    key: 'order',
    header: t('orders.columns.order'),
    sortable: true,
    sortKey: 'order_number',
    sticky: true,
    mobile: 'secondary',
    cell: (o) => <IdCell value={o.order_number} secondary={enumLabel('paymentPurpose', o.purpose)} />,
    mobileCell: (o) => (
      <span className="font-mono text-xs">
        {o.order_number} · {enumLabel('paymentPurpose', o.purpose)}
      </span>
    ),
    exportValue: (o) => o.order_number,
  },
  {
    key: 'patient',
    header: t('orders.columns.patient'),
    mobile: 'primary',
    className: 'max-w-56',
    cell: (o) => (
      <PersonCell
        name={o.patient_name ?? o.payer_name ?? t('orders.unknownPayer')}
        secondary={[o.booking_number, o.payer_name && o.payer_name !== o.patient_name ? t('orders.paidBy', { name: o.payer_name }) : null]
          .filter(Boolean)
          .join(' · ') || undefined}
      />
    ),
    exportValue: (o) => o.patient_name ?? o.payer_name ?? '',
  },
  {
    key: 'status',
    header: t('orders.columns.status'),
    sortable: true,
    mobile: 'badge',
    cell: (o) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={o.status} kind="order" />
        {o.review_required && <ReviewBadge kind={o.review_required} />}
      </span>
    ),
    mobileCell: (o) => <StatusBadgeCell status={o.status} kind="order" />,
    exportValue: (o) => enumLabel('status', o.status),
  },
  {
    key: 'gateway',
    header: t('orders.columns.gateway'),
    className: 'max-w-48',
    cell: (o) => (
      <TextCell
        primary={enumLabel('paymentGateway', o.gateway)}
        secondary={o.payment_method ? enumLabel('paymentMethod', o.payment_method) : undefined}
      />
    ),
    exportValue: (o) => enumLabel('paymentGateway', o.gateway),
  },
  {
    key: 'amount',
    header: t('orders.columns.amount'),
    align: 'end',
    sortable: true,
    sortKey: 'base_amount_minor',
    sortDescFirst: true,
    cell: (o) => (
      <MoneyCell
        minor={o.amount_minor}
        currency={o.currency}
        secondary={o.currency !== o.base_currency ? <MoneyCell minor={o.base_amount_minor} currency={o.base_currency} className="font-normal" /> : undefined}
      />
    ),
    exportValue: (o) => money(o.amount_minor, o.currency),
  },
  {
    key: 'base_amount',
    header: t('orders.columns.amountInr'),
    align: 'end',
    defaultHidden: true,
    cell: (o) => <MoneyCell minor={o.base_amount_minor} currency={o.base_currency} />,
    exportValue: (o) => fromMinor(o.base_amount_minor, o.base_currency),
  },
  {
    key: 'booking',
    header: t('orders.columns.booking'),
    defaultHidden: true,
    cell: (o) => <span className="font-mono text-xs">{o.booking_number ?? '—'}</span>,
    exportValue: (o) => o.booking_number ?? '',
  },
  {
    key: 'method',
    header: t('orders.columns.method'),
    defaultHidden: true,
    cell: (o) => (o.payment_method ? enumLabel('paymentMethod', o.payment_method) : <span className="text-muted">—</span>),
    exportValue: (o) => (o.payment_method ? enumLabel('paymentMethod', o.payment_method) : ''),
  },
  {
    key: 'created',
    header: t('orders.columns.created'),
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (o) => <DateCell value={o.created_at} display="relative" className="text-muted" />,
    exportValue: (o) => o.created_at,
  },
  {
    key: 'paid',
    header: t('orders.columns.paid'),
    sortable: true,
    sortKey: 'paid_at',
    sortDescFirst: true,
    cell: (o) => <DateCell value={o.paid_at} display="datetime" />,
    mobileCell: (o) => (o.paid_at ? formatDate(o.paid_at) : null),
    exportValue: (o) => o.paid_at ?? '',
  },
];

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function OrdersPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('orders.title'));
  const columns = useMemo(() => orderColumns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: OrderListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...financeKeys.all, 'orders', 'table', listParams],
    queryFn: () => paymentsApi.listOrders(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'orders', 'status-counts', apiFilters],
    queryFn: () => paymentsApi.orderStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });

  const c = counts.data;
  const statusOptions: FilterOption<OrderStatus>[] = ORDER_STATUSES.map((s) => ({
    value: s,
    label: enumLabel('status', s),
    tone: statusTone(s, 'order'),
    count: c?.counts[s],
  }));
  const quickItems: QuickFilterItem<QuickValue>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: enumLabel('status', s), count: c?.counts[s] })),
    { value: REVIEW_TAB, label: t('orders.reviewRequired'), count: c?.review.any, tone: 'warning' },
  ];
  const quickValue: QuickValue | '' | null =
    filters.review === 'any' && filters.status.length === 0
      ? REVIEW_TAB
      : filters.review
        ? null
        : filters.status.length === 0
          ? ''
          : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!)
            ? filters.status[0]!
            : null;

  return (
    <div>
      <PageHeader title={t('orders.title')} description={t('orders.description')} />
      <DataTable
        id="admin.finance.orders"
        caption={t('orders.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(o) => financePath(`orders/${o.id}`)}
        rowLabel={(o) => t('orders.openOrder', { number: o.order_number })}
        emptyTitle={t('orders.emptyTitle')}
        emptyDescription={t('orders.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('orders.filters.orderStatus')}
              items={quickItems}
              value={quickValue}
              onChange={(v) =>
                v === REVIEW_TAB ? setFilters({ status: [], review: 'any' }) : setFilters({ status: v ? [v] : [], review: '' })
              }
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('orders.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="payment-orders"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => paymentsApi.listOrders({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
            more={
              <>
                <MultiSelectFilter
                  label={t('orders.columns.method')}
                  icon={<CreditCard className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.method}
                  onChange={(v) => setFilter('method', v)}
                  options={enumOptions('paymentMethod', PAYMENT_METHODS)}
                />
                <MultiSelectFilter
                  label={t('orders.filters.purpose')}
                  value={filters.purpose}
                  onChange={(v) => setFilter('purpose', v)}
                  options={enumOptions('paymentPurpose', PAYMENT_PURPOSES)}
                />
                <MultiSelectFilter
                  label={t('orders.filters.currency')}
                  value={filters.currency}
                  onChange={(v) => setFilter('currency', v)}
                  options={CURRENCY_OPTIONS}
                  searchable
                />
                <SelectFilter
                  label={t('orders.filters.financeReview')}
                  icon={<ShieldCheck className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.review}
                  onChange={(v) => setFilter('review', v)}
                  options={[
                    { value: 'any', label: t('orders.filters.anyReview'), count: c?.review.any },
                    { value: 'amount', label: reviewKindLabel('amount'), count: c?.review.amount },
                    { value: 'mark_paid', label: reviewKindLabel('mark_paid'), count: c?.review.mark_paid },
                  ]}
                />
              </>
            }
          >
            <MultiSelectFilter label={t('orders.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label={t('orders.columns.gateway')}
              icon={<Landmark className="size-3.5 opacity-70" aria-hidden />}
              value={filters.gateway}
              onChange={(v) => setFilter('gateway', v)}
              options={enumOptions('paymentGateway', PAYMENT_GATEWAYS)}
            />
            <AmountRangeFilter
              label={t('orders.columns.amount')}
              currency="INR"
              value={{ min: filters.min, max: filters.max }}
              onChange={({ min, max }) => setFilters({ min, max })}
            />
            <DateRangeFilter
              label={t('orders.filters.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: t('orders.columns.created') },
                { value: 'paid', label: t('orders.columns.paid') },
              ]}
              field={filters.date_field || 'created'}
              onFieldChange={(date_field) => setFilter('date_field', date_field)}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
