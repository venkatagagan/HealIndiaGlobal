import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { BedDouble, CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS, type BookingOut, type BookingStatus } from '@hig/shared/api';
import { fetchAllPages, filterParam, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Button,
  Card,
  DataTable,
  DateCell,
  DateRangeFilter,
  ErrorState,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  Skeleton,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type DatePreset,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useHospital } from '../../auth/HospitalProvider';
import {
  BOOKING_PAYMENT_LABELS,
  BOOKING_PAYMENT_STATES,
  bookingList,
  type BookingListFilters,
  type BookingListQuery,
} from '../../lib/bookingList';
import { cn, formatDate, formatMoney, fromMinor, toMinor } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { paymentState } from './paymentState';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const VIEWS = ['list', 'calendar'] as const;
const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(BOOKING_STATUSES),
  payment: filterParam.list(BOOKING_PAYMENT_STATES),
  from: filterParam.date(),
  to: filterParam.date(),
  booked_from: filterParam.date(),
  booked_to: filterParam.date(),
  min_total: filterParam.number(),
  max_total: filterParam.number(),
};
const SORT_KEYS = ['admission_date', 'created_at', 'booking_number', 'total_minor', 'status'] as const;
const QUICK_STATUSES: BookingStatus[] = ['pending_payment', 'confirmed', 'admitted', 'completed', 'cancelled'];
const QUICK_LABELS: Partial<Record<BookingStatus, string>> = { completed: 'Discharged' };
const CURRENCY = 'INR';

type BookingFilters = FilterValues<typeof FILTERS>;

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
/** Admissions look forward: today / this week / next 7-30 days, plus the recent past. */
const ADMISSION_PRESETS: readonly DatePreset[] = [
  { id: 'today', label: 'Today', range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { id: 'tomorrow', label: 'Tomorrow', range: () => ({ from: iso(addDays(new Date(), 1)), to: iso(addDays(new Date(), 1)) }) },
  { id: 'week', label: 'This week', range: () => ({ from: iso(startOfWeek(new Date())), to: iso(endOfWeek(new Date())) }) },
  { id: 'next7', label: 'Next 7 days', range: () => ({ from: iso(new Date()), to: iso(addDays(new Date(), 6)) }) },
  { id: 'next30', label: 'Next 30 days', range: () => ({ from: iso(new Date()), to: iso(addDays(new Date(), 29)) }) },
  { id: 'month', label: 'This month', range: () => ({ from: iso(startOfMonth(new Date())), to: iso(endOfMonth(new Date())) }) },
  { id: 'last30', label: 'Last 30 days', range: () => ({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) }) },
];

function toApiFilters(f: BookingFilters, hospitalId: string | undefined): BookingListFilters {
  return {
    hospital_id: hospitalId,
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    payment: f.payment.length ? f.payment : undefined,
    admission_from: f.from || undefined,
    admission_to: f.to || undefined,
    created_from: f.booked_from || undefined,
    created_to: f.booked_to || undefined,
    min_total: f.min_total !== undefined ? (toMinor(f.min_total, CURRENCY) ?? undefined) : undefined,
    max_total: f.max_total !== undefined ? (toMinor(f.max_total, CURRENCY) ?? undefined) : undefined,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const COLUMNS: DataTableColumn<BookingOut>[] = [
  {
    key: 'booking',
    header: 'Booking',
    sortable: true,
    sortKey: 'booking_number',
    sticky: true,
    mobile: 'secondary',
    cell: (b) => <IdCell value={b.booking_number} secondary={`Booked ${formatDate(b.created_at)}`} />,
    mobileCell: (b) => <span className="font-mono text-xs">{b.booking_number}</span>,
    exportValue: (b) => b.booking_number,
  },
  {
    key: 'patient',
    header: 'Patient',
    mobile: 'primary',
    className: 'max-w-52',
    cell: (b) => <PersonCell name={b.patient.full_name} />,
    exportValue: (b) => b.patient.full_name,
  },
  {
    key: 'treatment',
    header: 'Treatment',
    className: 'max-w-56',
    cell: (b) => <TextCell primary={b.procedure?.name ?? b.package?.name ?? '—'} secondary={b.doctor?.full_name} />,
    exportValue: (b) => b.procedure?.name ?? b.package?.name ?? '',
  },
  {
    key: 'admission',
    header: 'Admission',
    sortable: true,
    sortKey: 'admission_date',
    cell: (b) => (
      <DateCell
        value={b.admission_date}
        display="date"
        secondary={
          b.discharge_date
            ? `Discharge ${formatDate(b.discharge_date, 'd MMM')}`
            : b.duration_days
              ? `${b.duration_days} days`
              : undefined
        }
      />
    ),
    exportValue: (b) => b.admission_date ?? '',
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (b) => <StatusBadgeCell status={b.status} kind="booking" label={b.status === 'completed' ? 'Discharged' : undefined} />,
    exportValue: (b) => BOOKING_STATUS_LABELS[b.status],
  },
  {
    key: 'payment',
    header: 'Payment',
    cell: (b) => {
      const pay = paymentState(b);
      return <StatusBadge status={pay.tone} label={pay.label} />;
    },
    exportValue: (b) => paymentState(b).label,
  },
  {
    key: 'total',
    header: 'Total',
    align: 'end',
    sortable: true,
    sortKey: 'total_minor',
    sortDescFirst: true,
    cell: (b) => (
      <MoneyCell
        minor={b.total_minor}
        currency={b.currency}
        secondary={b.balance_due_minor > 0 ? `Due ${formatMoney(b.balance_due_minor, b.currency, { trimZeros: true })}` : undefined}
      />
    ),
    exportValue: (b) => `${b.currency} ${fromMinor(b.total_minor, b.currency)}`,
  },
  {
    key: 'created',
    header: 'Booked',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (b) => <DateCell value={b.created_at} display="relative" className="text-muted" />,
    exportValue: (b) => b.created_at,
  },
];

// ---------------------------------------------------------------------------------------------------------
// Calendar view: one month of admissions (same status / search / payment filters)
// ---------------------------------------------------------------------------------------------------------
const CHIP: Record<BookingStatus, string> = {
  pending_payment: 'bg-warning-soft text-warning-ink',
  confirmed: 'bg-success-soft text-success-ink',
  admitted: 'bg-accent-soft text-accent-ink',
  completed: 'bg-neutral-soft text-neutral-ink',
  cancelled: 'bg-danger-soft text-danger-ink line-through',
};

function AdmissionsCalendar({ filters }: { filters: BookingListFilters }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) }), [month]);
  const params: BookingListQuery = {
    ...filters,
    admission_from: iso(days[0]!),
    admission_to: iso(days[days.length - 1]!),
    sort: 'admission_date',
    page: 1,
    page_size: 100,
  };
  const bookings = useQuery({ queryKey: ['bookings', 'calendar', params], queryFn: () => bookingList.list(params), placeholderData: keepPreviousData });

  const byDate = useMemo(() => {
    const map = new Map<string, BookingOut[]>();
    for (const b of bookings.data?.items ?? []) {
      if (!b.admission_date) continue;
      const key = b.admission_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return map;
  }, [bookings.data]);

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">{format(month, 'MMMM yyyy')}</h2>
          <p className="text-xs text-muted">
            {bookings.data ? `${bookings.data.total} admission${bookings.data.total === 1 ? '' : 's'} in view` : 'Loading admissions…'}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      {bookings.isError ? (
        <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-lg border border-border">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="border-b border-border bg-surface-2 py-2 text-center text-xs font-semibold text-muted">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const key = iso(day);
              const items = byDate.get(key) ?? [];
              return (
                <div key={key} className={cn('min-h-24 border-r border-b border-border p-1.5', !isSameMonth(day, month) && 'bg-surface-2/50')}>
                  <span
                    className={cn(
                      'inline-flex size-6 items-center justify-center rounded-full text-xs',
                      isToday(day) ? 'bg-primary font-bold text-primary-fg' : isSameMonth(day, month) ? 'text-fg' : 'text-muted',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <ul className="mt-1 space-y-1">
                    {bookings.isPending ? (
                      <li>
                        <Skeleton className="h-4" />
                      </li>
                    ) : (
                      items.slice(0, 3).map((b) => (
                        <li key={b.id}>
                          <Link
                            to={`/bookings/${b.id}`}
                            title={`${b.patient.full_name} · ${BOOKING_STATUS_LABELS[b.status]}`}
                            className={cn('block truncate rounded px-1.5 py-0.5 text-[11px] font-medium', CHIP[b.status])}
                          >
                            {b.patient.full_name}
                          </Link>
                        </li>
                      ))
                    )}
                    {items.length > 3 && <li className="px-1.5 text-[11px] text-muted">+{items.length - 3} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {BOOKING_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('size-3 rounded', CHIP[s])} aria-hidden />
            {s === 'completed' ? 'Discharged' : BOOKING_STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export function BookingsPage() {
  useDocumentTitle('Bookings');
  const { current } = useHospital();
  const table = useTableState({ filters: FILTERS, defaultSort: '-admission_date', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const [searchParams, setSearchParams] = useSearchParams();
  const view: (typeof VIEWS)[number] = searchParams.get('view') === 'calendar' ? 'calendar' : 'list';
  const setView = (v: (typeof VIEWS)[number]) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === 'list') next.delete('view');
        else next.set('view', v);
        return next;
      },
      { replace: true },
    );
  const apiFilters = useMemo(() => toApiFilters(filters, current?.id), [filters, current?.id]);
  const listParams: BookingListQuery = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: ['bookings', 'list', listParams],
    queryFn: () => bookingList.list(listParams),
    enabled: view === 'list',
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: ['bookings', 'status-counts', apiFilters],
    queryFn: () => bookingList.statusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });

  const statusOptions: FilterOption<BookingStatus>[] = BOOKING_STATUSES.map((s) => ({
    value: s,
    label: QUICK_LABELS[s] ?? BOOKING_STATUS_LABELS[s],
    tone: statusTone(s, 'booking'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<BookingStatus>[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: QUICK_LABELS[s] ?? BOOKING_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;

  const viewSwitch = (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="View">
      {VIEWS.map((v) => (
        <Button
          key={v}
          size="sm"
          variant={view === v ? 'secondary' : 'ghost'}
          aria-pressed={view === v}
          leftIcon={v === 'list' ? <List className="size-4" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
          onClick={() => setView(v)}
        >
          {v === 'list' ? 'List' : 'Calendar'}
        </Button>
      ))}
    </div>
  );

  const filterPills = (
    <>
      <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
      {view === 'list' && (
        <DateRangeFilter
          label="Admission"
          value={{ from: filters.from, to: filters.to }}
          onChange={({ from, to }) => setFilters({ from, to })}
          presets={ADMISSION_PRESETS}
        />
      )}
      <MultiSelectFilter
        label="Payment"
        value={filters.payment}
        onChange={(v) => setFilter('payment', v)}
        options={BOOKING_PAYMENT_STATES.map((p) => ({ value: p, label: BOOKING_PAYMENT_LABELS[p], tone: p === 'paid' ? 'success' : p === 'partial' ? 'info' : 'warning' }))}
      />
    </>
  );
  const moreFilters = (
    <>
      <DateRangeFilter label="Booked on" value={{ from: filters.booked_from, to: filters.booked_to }} onChange={({ from, to }) => setFilters({ booked_from: from, booked_to: to })} />
      <AmountRangeFilter
        label="Total"
        currency={CURRENCY}
        value={{ min: filters.min_total, max: filters.max_total }}
        onChange={({ min, max }) => setFilters({ min_total: min, max_total: max })}
      />
    </>
  );
  const search = { value: filters.q, onChange: (q: string) => setFilter('q', q), placeholder: 'Booking number or patient…' };
  const quickTabs = (
    <QuickFilters label="Booking status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
  );

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Confirmed treatments, admissions and discharges - plan beds and track payments."
        actions={
          <>
            <Button
              variant="outline"
              leftIcon={<BedDouble className="size-4" aria-hidden />}
              onClick={() => {
                // one URL update (two separate setters would overwrite each other)
                const today = iso(new Date());
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    for (const key of ['view', 'status', 'page']) next.delete(key);
                    next.set('from', today);
                    next.set('to', today);
                    return next;
                  },
                  { replace: true },
                );
              }}
            >
              Today&apos;s admissions
            </Button>
            {viewSwitch}
          </>
        }
      />
      {view === 'calendar' ? (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-2 sm:px-3">{quickTabs}</div>
            <div className="p-3">
              <FilterBar search={search} onReset={table.resetFilters}>
                {filterPills}
              </FilterBar>
            </div>
          </Card>
          <AdmissionsCalendar filters={apiFilters} />
        </div>
      ) : (
        <DataTable
          id="hospital.bookings"
          caption="Bookings"
          table={table}
          columns={COLUMNS}
          rows={list.data?.items}
          total={list.data?.total}
          loading={list.isLoading}
          fetching={list.isFetching && !list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          rowHref={(b) => `/bookings/${b.id}`}
          rowLabel={(b) => `Open booking ${b.booking_number}`}
          emptyTitle="No bookings yet"
          emptyDescription="Bookings appear here once a patient accepts your quote and books."
          header={<div className="border-b border-border px-2 sm:px-3">{quickTabs}</div>}
          toolbar={
            <FilterBar
              search={search}
              onReset={table.resetFilters}
              more={moreFilters}
              actions={
                <ExportButton
                  filename="bookings"
                  columns={COLUMNS}
                  rows={list.data?.items}
                  total={list.data?.total}
                  fetchAll={() => fetchAllPages((page, size) => bookingList.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
                />
              }
            >
              {filterPills}
            </FilterBar>
          }
        />
      )}
    </div>
  );
}
