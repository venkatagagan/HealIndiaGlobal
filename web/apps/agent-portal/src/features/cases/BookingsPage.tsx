import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CreditCard } from 'lucide-react';
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  PAYMENT_OPTION_LABELS,
  bookingsApi,
  type BookingOut,
  type BookingStatus,
} from '@hig/shared/api';
import {
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type BadgeTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { ButtonLink, PageHeader } from '../../components/ui';
import { UPCOMING_DATE_PRESETS, inDateRange, optionsFromRows } from '../../lib/lookups';
import { qk } from '../../lib/queries';
import { fetchAllPages, filterParam, fromMinor, matchesSearch, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';

// ---------------------------------------------------------------------------------------------------------
// Payment state (derived from the booking amounts)
// ---------------------------------------------------------------------------------------------------------
const PAYMENT_STATES = ['unpaid', 'partial', 'paid', 'refunded'] as const;
type PaymentState = (typeof PAYMENT_STATES)[number];
const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid in full',
  refunded: 'Refunded',
};
const PAYMENT_STATE_TONES: Record<PaymentState, BadgeTone> = { unpaid: 'danger', partial: 'warning', paid: 'success', refunded: 'neutral' };

function paymentState(b: BookingOut): PaymentState {
  if (b.amount_refunded_minor > 0) return 'refunded';
  if (b.balance_due_minor <= 0) return 'paid';
  return b.amount_paid_minor > 0 ? 'partial' : 'unpaid';
}

const PAYABLE: BookingStatus[] = ['pending_payment', 'confirmed', 'admitted'];
const canPay = (b: BookingOut) => b.balance_due_minor > 0 && PAYABLE.includes(b.status);

// ---------------------------------------------------------------------------------------------------------
// URL state (client-side list: an agency's bookings load in one go)
// ---------------------------------------------------------------------------------------------------------
const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(BOOKING_STATUSES),
  payment: filterParam.list(PAYMENT_STATES),
  hospital: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
};
type BookingFilters = FilterValues<typeof FILTERS>;

function applyFilters(rows: readonly BookingOut[], f: BookingFilters, { ignoreStatus = false } = {}): BookingOut[] {
  return rows
    .filter(matchesSearch(f.q, (b) => [b.booking_number, b.patient.full_name, b.hospital.name, b.procedure?.name, b.package?.name]))
    .filter((b) => ignoreStatus || !f.status.length || f.status.includes(b.status))
    .filter((b) => !f.payment.length || f.payment.includes(paymentState(b)))
    .filter((b) => !f.hospital || b.hospital.id === f.hospital)
    .filter((b) => inDateRange(b.admission_date, f.from, f.to));
}

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const money = (minor: number, currency: string) => `${currency} ${fromMinor(minor, currency)}`;

const COLUMNS: DataTableColumn<BookingOut>[] = [
  {
    key: 'booking',
    header: 'Booking',
    sortable: true,
    sortValue: (b) => b.booking_number,
    sticky: true,
    mobile: 'secondary',
    cell: (b) => <IdCell value={b.booking_number} secondary={b.procedure?.name ?? b.package?.name ?? undefined} />,
    exportValue: (b) => b.booking_number,
  },
  {
    key: 'patient',
    header: 'Patient',
    sortable: true,
    sortValue: (b) => b.patient.full_name,
    mobile: 'primary',
    className: 'max-w-52',
    cell: (b) => <PersonCell name={b.patient.full_name} secondary={b.doctor?.full_name ?? undefined} />,
    exportValue: (b) => b.patient.full_name,
  },
  {
    key: 'hospital',
    header: 'Hospital',
    className: 'max-w-56',
    cell: (b) => <TextCell primary={b.hospital.name} secondary={b.hospital.city} />,
    exportValue: (b) => b.hospital.name,
  },
  {
    key: 'admission',
    header: 'Admission',
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.admission_date,
    cell: (b) => (
      <DateCell value={b.admission_date} display="date" secondary={b.duration_days ? `${b.duration_days} days` : undefined} />
    ),
    exportValue: (b) => b.admission_date ?? '',
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    sortValue: (b) => BOOKING_STATUSES.indexOf(b.status),
    mobile: 'badge',
    cell: (b) => <StatusBadgeCell status={b.status} kind="booking" />,
    exportValue: (b) => BOOKING_STATUS_LABELS[b.status],
  },
  {
    key: 'payment',
    header: 'Payment',
    sortable: true,
    sortValue: (b) => (b.total_minor > 0 ? b.amount_paid_minor / b.total_minor : 1),
    cell: (b) => {
      const state = paymentState(b);
      const pct = b.total_minor > 0 ? Math.min(100, Math.round((b.amount_paid_minor / b.total_minor) * 100)) : 100;
      return (
        <span className="flex min-w-32 flex-col gap-1">
          <StatusBadgeCell status={state} label={PAYMENT_STATE_LABELS[state]} tone={PAYMENT_STATE_TONES[state]} />
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            {pct}% · {PAYMENT_OPTION_LABELS[b.payment_option] ?? b.payment_option}
          </span>
        </span>
      );
    },
    mobileCell: (b) => PAYMENT_STATE_LABELS[paymentState(b)],
    exportValue: (b) => PAYMENT_STATE_LABELS[paymentState(b)],
  },
  {
    key: 'total',
    header: 'Total',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.total_minor,
    cell: (b) => <MoneyCell minor={b.total_minor} currency={b.currency} />,
    exportValue: (b) => money(b.total_minor, b.currency),
  },
  {
    key: 'balance',
    header: 'Balance due',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.balance_due_minor,
    cell: (b) =>
      b.balance_due_minor > 0 ? (
        <MoneyCell minor={b.balance_due_minor} currency={b.currency} className="text-danger" />
      ) : (
        <span className="text-xs text-muted">Nothing due</span>
      ),
    exportValue: (b) => money(b.balance_due_minor, b.currency),
  },
  {
    key: 'created',
    header: 'Booked',
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.created_at,
    defaultHidden: true,
    cell: (b) => <DateCell value={b.created_at} display="date" />,
    exportValue: (b) => b.created_at,
  },
  {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    title: 'Actions',
    align: 'end',
    hideable: false,
    exportable: false,
    mobile: 'meta',
    cell: (b) =>
      canPay(b) ? (
        <ButtonLink size="sm" to={`/bookings/${b.id}/pay`} icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />}>
          Pay
        </ButtonLink>
      ) : null,
  },
];
const SORT_KEYS = COLUMNS.filter((c) => c.sortable).map((c) => c.key);

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export function BookingsPage() {
  useDocumentTitle('Bookings');
  const table = useTableState({ filters: FILTERS, defaultSort: '-admission', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;

  const query = useQuery({
    queryKey: qk.bookings({ all: true }),
    queryFn: () => fetchAllPages((page, size) => bookingsApi.list({ page, page_size: size })),
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(() => applyFilters(all, filters), [all, filters]);
  const statusBase = useMemo(() => applyFilters(all, filters, { ignoreStatus: true }), [all, filters]);
  const statusCount = (s: BookingStatus) => statusBase.filter((b) => b.status === s).length;

  const statusOptions: FilterOption<BookingStatus>[] = BOOKING_STATUSES.map((s) => ({
    value: s,
    label: BOOKING_STATUS_LABELS[s],
    tone: statusTone(s, 'booking'),
    count: query.data ? statusCount(s) : undefined,
  }));
  const quickItems: QuickFilterItem<BookingStatus>[] = [
    { value: '', label: 'All bookings', count: query.data ? statusBase.length : undefined },
    ...BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s], count: query.data ? statusCount(s) : undefined })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;
  const hospitalOptions = useMemo(() => optionsFromRows(all, (b) => ({ value: b.hospital.id, label: b.hospital.name })), [all]);
  const paymentOptions: FilterOption<PaymentState>[] = PAYMENT_STATES.map((s) => ({
    value: s,
    label: PAYMENT_STATE_LABELS[s],
    tone: PAYMENT_STATE_TONES[s],
    count: query.data ? all.filter((b) => paymentState(b) === s).length : undefined,
  }));

  return (
    <div>
      <PageHeader title="Bookings" description="Treatments booked for your patients — admission dates, payment progress and balances due." />
      <DataTable
        id="agent.bookings"
        caption="Bookings"
        table={table}
        columns={COLUMNS}
        rows={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowHref={(b) => `/cases/${b.case_id}`}
        rowLabel={(b) => `Open booking ${b.booking_number}`}
        emptyTitle="No bookings yet"
        emptyDescription="Bookings are created after a hospital’s quote is accepted."
        emptyAction={<ButtonLink to="/cases">Go to cases</ButtonLink>}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Booking status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Booking, patient or hospital…', label: 'Search bookings' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="bookings" columns={COLUMNS} rows={rows} />}
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label="Payment"
              icon={<CreditCard className="size-3.5 opacity-70" aria-hidden />}
              value={filters.payment}
              onChange={(v) => setFilter('payment', v)}
              options={paymentOptions}
            />
            <SelectFilter
              label="Hospital"
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital}
              onChange={(v) => setFilter('hospital', v)}
              options={hospitalOptions}
              searchable
            />
            <DateRangeFilter
              label="Admission"
              presets={UPCOMING_DATE_PRESETS}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
