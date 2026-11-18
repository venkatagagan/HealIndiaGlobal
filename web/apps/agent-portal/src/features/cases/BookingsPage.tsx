import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CreditCard } from 'lucide-react';
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  PAYMENT_OPTION_LABELS,
  bookingsApi,
  type BookingListParams,
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
import { fetchAllPages, filterParam, formatNumber, fromMinor, matchesSearch, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';
import { useAppTranslation, type AppT } from '../../i18n';
import { ApproxMoney, useDisplayCurrency } from '../../lib/displayCurrency';

// ---------------------------------------------------------------------------------------------------------
// Payment state (derived from the booking amounts)
// ---------------------------------------------------------------------------------------------------------
const PAYMENT_STATES = ['unpaid', 'partial', 'paid', 'refunded'] as const;
type PaymentState = (typeof PAYMENT_STATES)[number];
const paymentStateLabel = (t: AppT, s: PaymentState): string =>
  ({
    unpaid: t('bookings.paymentState.unpaid'),
    partial: t('bookings.paymentState.partial'),
    paid: t('bookings.paymentState.paid'),
    refunded: t('bookings.paymentState.refunded'),
  })[s];
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

const columns = (t: AppT): DataTableColumn<BookingOut>[] => [
  {
    key: 'booking',
    header: t('bookings.columns.booking'),
    sortable: true,
    sortValue: (b) => b.booking_number,
    sticky: true,
    mobile: 'secondary',
    cell: (b) => <IdCell value={b.booking_number} secondary={b.procedure?.name ?? b.package?.name ?? undefined} />,
    exportValue: (b) => b.booking_number,
  },
  {
    key: 'patient',
    header: t('bookings.columns.patient'),
    sortable: true,
    sortValue: (b) => b.patient.full_name,
    mobile: 'primary',
    className: 'max-w-52',
    cell: (b) => <PersonCell name={b.patient.full_name} secondary={b.doctor?.full_name ?? undefined} />,
    exportValue: (b) => b.patient.full_name,
  },
  {
    key: 'hospital',
    header: t('bookings.columns.hospital'),
    className: 'max-w-56',
    cell: (b) => <TextCell primary={b.hospital.name} secondary={b.hospital.city} />,
    exportValue: (b) => b.hospital.name,
  },
  {
    key: 'admission',
    header: t('bookings.columns.admission'),
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.admission_date,
    cell: (b) => (
      <DateCell value={b.admission_date} display="date" secondary={b.duration_days ? t('bookings.days', { count: b.duration_days }) : undefined} />
    ),
    exportValue: (b) => b.admission_date ?? '',
  },
  {
    key: 'status',
    header: t('bookings.columns.status'),
    sortable: true,
    sortValue: (b) => BOOKING_STATUSES.indexOf(b.status),
    mobile: 'badge',
    cell: (b) => <StatusBadgeCell status={b.status} kind="booking" />,
    exportValue: (b) => BOOKING_STATUS_LABELS[b.status],
  },
  {
    key: 'payment',
    header: t('bookings.columns.payment'),
    sortable: true,
    sortValue: (b) => (b.total_minor > 0 ? b.amount_paid_minor / b.total_minor : 1),
    cell: (b) => {
      const state = paymentState(b);
      const pct = b.total_minor > 0 ? Math.min(100, Math.round((b.amount_paid_minor / b.total_minor) * 100)) : 100;
      return (
        <span className="flex min-w-32 flex-col gap-1">
          <StatusBadgeCell status={state} label={paymentStateLabel(t, state)} tone={PAYMENT_STATE_TONES[state]} />
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            {formatNumber(pct / 100, { style: 'percent' })} · {PAYMENT_OPTION_LABELS[b.payment_option] ?? b.payment_option}
          </span>
        </span>
      );
    },
    mobileCell: (b) => paymentStateLabel(t, paymentState(b)),
    exportValue: (b) => paymentStateLabel(t, paymentState(b)),
  },
  {
    key: 'total',
    header: t('bookings.columns.total'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.total_minor,
    cell: (b) => (
      <span className="inline-flex flex-col items-end">
        <MoneyCell minor={b.total_minor} currency={b.currency} />
        <ApproxMoney display={b.display_total} original={b.currency} />
      </span>
    ),
    exportValue: (b) => money(b.total_minor, b.currency),
  },
  {
    key: 'balance',
    header: t('bookings.columns.balanceDue'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.balance_due_minor,
    cell: (b) =>
      b.balance_due_minor > 0 ? (
        <span className="inline-flex flex-col items-end">
          <MoneyCell minor={b.balance_due_minor} currency={b.currency} className="text-danger" />
          <ApproxMoney display={b.display_balance_due} original={b.currency} />
        </span>
      ) : (
        <span className="text-xs text-muted">{t('bookings.nothingDue')}</span>
      ),
    exportValue: (b) => money(b.balance_due_minor, b.currency),
  },
  {
    key: 'created',
    header: t('bookings.columns.booked'),
    sortable: true,
    sortDescFirst: true,
    sortValue: (b) => b.created_at,
    defaultHidden: true,
    cell: (b) => <DateCell value={b.created_at} display="date" />,
    exportValue: (b) => b.created_at,
  },
  {
    key: 'actions',
    header: <span className="sr-only">{t('bookings.columns.actions')}</span>,
    title: t('bookings.columns.actions'),
    align: 'end',
    hideable: false,
    exportable: false,
    mobile: 'meta',
    cell: (b) =>
      canPay(b) ? (
        <ButtonLink size="sm" to={`/bookings/${b.id}/pay`} icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />}>
          {t('bookings.pay')}
        </ButtonLink>
      ) : null,
  },
];
const SORT_KEYS = ['booking', 'patient', 'admission', 'status', 'payment', 'total', 'balance', 'created'];

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export function BookingsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('bookings.title'));
  const COLUMNS = useMemo(() => columns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-admission', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;

  const currency = useDisplayCurrency();
  const query = useQuery({
    queryKey: qk.bookings({ all: true, currency }),
    queryFn: () => fetchAllPages((page, size) => bookingsApi.list({ page, page_size: size, currency } as BookingListParams)),
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
    { value: '', label: t('bookings.quick.all'), count: query.data ? statusBase.length : undefined },
    ...BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s], count: query.data ? statusCount(s) : undefined })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;
  const hospitalOptions = useMemo(() => optionsFromRows(all, (b) => ({ value: b.hospital.id, label: b.hospital.name })), [all]);
  const paymentOptions: FilterOption<PaymentState>[] = PAYMENT_STATES.map((s) => ({
    value: s,
    label: paymentStateLabel(t, s),
    tone: PAYMENT_STATE_TONES[s],
    count: query.data ? all.filter((b) => paymentState(b) === s).length : undefined,
  }));

  return (
    <div>
      <PageHeader title={t('bookings.title')} description={t('bookings.description')} />
      <DataTable
        id="agent.bookings"
        caption={t('bookings.title')}
        table={table}
        columns={COLUMNS}
        rows={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowHref={(b) => `/cases/${b.case_id}`}
        rowLabel={(b) => t('bookings.openRow', { number: b.booking_number })}
        emptyTitle={t('bookings.emptyTitle')}
        emptyDescription={t('bookings.emptyDescription')}
        emptyAction={<ButtonLink to="/cases">{t('bookings.goToCases')}</ButtonLink>}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('bookings.filters.bookingStatus')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('bookings.filters.searchPlaceholder'), label: t('bookings.filters.searchLabel') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="bookings" columns={COLUMNS} rows={rows} />}
          >
            <MultiSelectFilter label={t('bookings.filters.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label={t('bookings.filters.payment')}
              icon={<CreditCard className="size-3.5 opacity-70" aria-hidden />}
              value={filters.payment}
              onChange={(v) => setFilter('payment', v)}
              options={paymentOptions}
            />
            <SelectFilter
              label={t('bookings.filters.hospital')}
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital}
              onChange={(v) => setFilter('hospital', v)}
              options={hospitalOptions}
              searchable
            />
            <DateRangeFilter
              label={t('bookings.filters.admission')}
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
