import { useMemo } from 'react';
import { CircleDollarSign, Receipt, Wallet } from 'lucide-react';
import { ORDER_STATUSES, PAYMENT_GATEWAY_LABELS, PAYMENT_GATEWAYS, type OrderStatus } from '@hig/shared/api';
import { filterParam, formatMoney, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  DataTable,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  SelectFilter,
  StatCard,
  ToggleFilter,
  statusTone,
} from '@hig/shared/ui';
import { useBookings } from '../../api/queries';
import { TableTabs, countBy, inDateRange, patientStatusLabel } from '../../components/listing';
import { paymentColumns, paymentDate, paymentDescription, usePaymentHistory, type PaymentRow } from '../../components/payments';
import { paths } from '../../lib/paths';
import { ButtonLink, PageHeader } from '../../ui/primitives';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(ORDER_STATUSES),
  method: filterParam.oneOf(PAYMENT_GATEWAYS),
  receipt: filterParam.boolean(),
  from: filterParam.date(),
  to: filterParam.date(),
};

/** Tabs group the order statuses into what a patient cares about. */
const GROUPS = [
  { value: 'paid', label: 'Paid', statuses: ['paid'] },
  { value: 'processing', label: 'In progress', statuses: ['created', 'pending'] },
  { value: 'refunded', label: 'Refunded', statuses: ['refunded', 'partially_refunded'] },
  { value: 'unsuccessful', label: 'Unsuccessful', statuses: ['failed', 'expired', 'cancelled'] },
] as const satisfies readonly { value: string; label: string; statuses: readonly OrderStatus[] }[];
type Group = (typeof GROUPS)[number]['value'];

function groupOf(selected: readonly OrderStatus[]): Group | '' | null {
  if (!selected.length) return '';
  const g = GROUPS.find((x) => x.statuses.length === selected.length && x.statuses.every((s) => selected.includes(s)));
  return g ? g.value : null;
}

const COLUMNS = paymentColumns({ withBooking: true });

/** Sum per currency, formatted ("$1,200 + ₹5,000"). */
function sumLabel(items: { minor: number; currency: string }[]): string {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.minor);
  if (!totals.size) return '0';
  return [...totals].map(([c, m]) => formatMoney(m, c, undefined, { trimZeros: true })).join(' + ');
}

export function PaymentsPage() {
  useDocumentTitle('Payments & receipts');
  const table = useTableState({ filters: FILTERS, defaultSort: '-date', defaultPageSize: 10 });
  const { filters, setFilter, setFilters } = table;
  const bookings = useBookings({ page: 1, page_size: 100 });
  const history = usePaymentHistory({ bookings: bookings.data?.items });
  const all = useMemo(() => history.rows ?? [], [history.rows]);

  const base = useMemo(
    () =>
      all
        .filter(
          matchesSearch(filters.q, (r: PaymentRow) => [
            paymentDescription(r),
            r.order.order_number,
            r.receipt?.invoice_number,
            r.booking?.booking_number,
            r.booking?.hospital.name,
          ]),
        )
        .filter((r) => !filters.method || r.order.gateway === filters.method)
        .filter((r) => filters.receipt === undefined || !!r.receipt === filters.receipt)
        .filter((r) => inDateRange(paymentDate(r), filters.from, filters.to)),
    [all, filters.q, filters.method, filters.receipt, filters.from, filters.to],
  );
  const rows = useMemo(() => base.filter((r) => !filters.status.length || filters.status.includes(r.order.status)), [base, filters.status]);
  const counts = useMemo(() => countBy(base, (r) => r.order.status), [base]);

  const paid = all.filter((r) => r.order.status === 'paid' || r.order.status === 'partially_refunded');
  const due = (bookings.data?.items ?? []).filter((b) => b.balance_due_minor > 0 && b.status !== 'cancelled');
  const receipts = all.filter((r) => r.receipt).length;
  const statsLoading = history.loading || bookings.isLoading;

  return (
    <div>
      <PageHeader
        title="Payments & receipts"
        description="Every payment you made for your treatment, with downloadable receipts."
        actions={
          due.length ? (
            <ButtonLink to={due.length === 1 ? paths.pay(due[0]!.id) : paths.bookings + '?due=true'} icon={<Wallet className="h-4 w-4" aria-hidden />}>
              {due.length === 1 ? 'Pay balance' : 'See what is left to pay'}
            </ButtonLink>
          ) : null
        }
      />
      {/* phones: one compact summary instead of three tall tiles */}
      <div className="mb-4 grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-surface shadow-card sm:hidden">
        <div className="p-3">
          <p className="text-xs text-muted">Paid so far</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {statsLoading ? '…' : sumLabel(paid.map((r) => ({ minor: r.order.amount_minor, currency: r.order.currency })))}
          </p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted">Left to pay</p>
          <p className="mt-0.5 font-semibold text-warning-ink tabular-nums">
            {statsLoading ? '…' : due.length ? sumLabel(due.map((b) => ({ minor: b.balance_due_minor, currency: b.currency }))) : 'Nothing due'}
          </p>
        </div>
      </div>
      <div className="mb-6 hidden gap-4 sm:grid sm:grid-cols-3">
        <StatCard
          label="Paid so far"
          value={sumLabel(paid.map((r) => ({ minor: r.order.amount_minor, currency: r.order.currency })))}
          hint={`${paid.length} successful payment${paid.length === 1 ? '' : 's'}`}
          icon={<CircleDollarSign className="size-5" aria-hidden />}
          tone="success"
          loading={statsLoading}
        />
        <StatCard
          label="Left to pay"
          value={due.length ? sumLabel(due.map((b) => ({ minor: b.balance_due_minor, currency: b.currency }))) : 'Nothing due'}
          hint={due.length ? `Across ${due.length} booking${due.length === 1 ? '' : 's'}` : 'All bookings are paid'}
          icon={<Wallet className="size-5" aria-hidden />}
          tone={due.length ? 'warning' : 'neutral'}
          loading={statsLoading}
        />
        <StatCard
          label="Receipts"
          value={receipts}
          hint="Download any receipt as a PDF"
          icon={<Receipt className="size-5" aria-hidden />}
          tone="info"
          loading={statsLoading}
        />
      </div>
      <DataTable
        id="patient.payments"
        caption="Payments"
        table={table}
        columns={COLUMNS}
        rows={history.rows ? rows : undefined}
        loading={history.loading}
        fetching={history.fetching}
        error={history.error}
        onRetry={history.refetch}
        rowHref={(r) => (r.order.booking_id ? paths.booking(r.order.booking_id) : null)}
        rowLabel={(r) => `Open booking for ${paymentDescription(r)}`}
        emptyIcon={<Receipt className="size-8" aria-hidden />}
        emptyTitle="No payments yet"
        emptyDescription="When you pay a deposit or balance for a booking, it appears here with its receipt."
        emptyAction={<ButtonLink to={paths.bookings}>Go to bookings</ButtonLink>}
        header={
          <TableTabs
            label="Payment status"
            items={[
              { value: '', label: 'All', count: base.length },
              ...GROUPS.map((g) => ({ value: g.value, label: g.label, count: g.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0) })),
            ]}
            value={groupOf(filters.status)}
            onChange={(g) => setFilter('status', g ? [...(GROUPS.find((x) => x.value === g)?.statuses ?? [])] : [])}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Search payments…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-payments" columns={COLUMNS} rows={rows} />}
          >
            <MultiSelectFilter
              label="Status"
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={ORDER_STATUSES.map((s) => ({
                value: s,
                label: patientStatusLabel(s, 'order') ?? s,
                tone: statusTone(s, 'order'),
                count: counts[s] ?? 0,
              }))}
            />
            <DateRangeFilter label="Date" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
            <SelectFilter
              label="Method"
              value={filters.method}
              onChange={(v) => setFilter('method', v)}
              options={PAYMENT_GATEWAYS.map((g) => ({ value: g, label: PAYMENT_GATEWAY_LABELS[g] }))}
            />
            <ToggleFilter label="With receipt" pressed={filters.receipt === true} onChange={(on) => setFilter('receipt', on || undefined)} />
          </FilterBar>
        }
      />
    </div>
  );
}
