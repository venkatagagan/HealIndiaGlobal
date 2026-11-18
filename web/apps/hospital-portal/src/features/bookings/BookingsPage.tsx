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
import { useAppTranslation } from '../../i18n';
import { paymentState } from './paymentState';

type TFn = ReturnType<typeof useAppTranslation>['t'];

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
const quickLabels = (t: TFn): Partial<Record<BookingStatus, string>> => ({ completed: t('bookings.list.discharged') });
const CURRENCY = 'INR';

type BookingFilters = FilterValues<typeof FILTERS>;

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
/** Admissions look forward: today / this week / next 7-30 days, plus the recent past. */
const admissionPresets = (t: TFn): readonly DatePreset[] => [
  { id: 'today', label: t('bookings.list.presetToday'), range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { id: 'tomorrow', label: t('bookings.list.presetTomorrow'), range: () => ({ from: iso(addDays(new Date(), 1)), to: iso(addDays(new Date(), 1)) }) },
  { id: 'week', label: t('bookings.list.presetThisWeek'), range: () => ({ from: iso(startOfWeek(new Date())), to: iso(endOfWeek(new Date())) }) },
  { id: 'next7', label: t('bookings.list.presetNext7'), range: () => ({ from: iso(new Date()), to: iso(addDays(new Date(), 6)) }) },
  { id: 'next30', label: t('bookings.list.presetNext30'), range: () => ({ from: iso(new Date()), to: iso(addDays(new Date(), 29)) }) },
  { id: 'month', label: t('bookings.list.presetThisMonth'), range: () => ({ from: iso(startOfMonth(new Date())), to: iso(endOfMonth(new Date())) }) },
  { id: 'last30', label: t('bookings.list.presetLast30'), range: () => ({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) }) },
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
const bookingColumns = (t: TFn): DataTableColumn<BookingOut>[] => [
  {
    key: 'booking',
    header: t('bookings.list.colBooking'),
    sortable: true,
    sortKey: 'booking_number',
    sticky: true,
    mobile: 'secondary',
    cell: (b) => <IdCell value={b.booking_number} secondary={t('bookings.list.bookedOn', { date: formatDate(b.created_at) })} />,
    mobileCell: (b) => <span className="font-mono text-xs">{b.booking_number}</span>,
    exportValue: (b) => b.booking_number,
  },
  {
    key: 'patient',
    header: t('common.patient'),
    mobile: 'primary',
    className: 'max-w-52',
    cell: (b) => <PersonCell name={b.patient.full_name} />,
    exportValue: (b) => b.patient.full_name,
  },
  {
    key: 'treatment',
    header: t('bookings.list.colTreatment'),
    className: 'max-w-56',
    cell: (b) => <TextCell primary={b.procedure?.name ?? b.package?.name ?? '—'} secondary={b.doctor?.full_name} />,
    exportValue: (b) => b.procedure?.name ?? b.package?.name ?? '',
  },
  {
    key: 'admission',
    header: t('bookings.list.colAdmission'),
    sortable: true,
    sortKey: 'admission_date',
    cell: (b) => (
      <DateCell
        value={b.admission_date}
        display="date"
        secondary={
          b.discharge_date
            ? t('bookings.list.dischargeOn', { date: formatDate(b.discharge_date, 'd MMM') })
            : b.duration_days
              ? t('bookings.list.days', { count: b.duration_days })
              : undefined
        }
      />
    ),
    exportValue: (b) => b.admission_date ?? '',
  },
  {
    key: 'status',
    header: t('common.status'),
    sortable: true,
    mobile: 'badge',
    cell: (b) => (
      <StatusBadgeCell status={b.status} kind="booking" label={b.status === 'completed' ? t('bookings.list.discharged') : undefined} />
    ),
    exportValue: (b) => BOOKING_STATUS_LABELS[b.status],
  },
  {
    key: 'payment',
    header: t('bookings.list.colPayment'),
    cell: (b) => {
      const pay = paymentState(b);
      return <StatusBadge status={pay.tone} label={pay.label} />;
    },
    exportValue: (b) => paymentState(b).label,
  },
  {
    key: 'total',
    header: t('bookings.list.colTotal'),
    align: 'end',
    sortable: true,
    sortKey: 'total_minor',
    sortDescFirst: true,
    cell: (b) => (
      <MoneyCell
        minor={b.total_minor}
        currency={b.currency}
        secondary={
          b.balance_due_minor > 0
            ? t('bookings.list.due', { amount: formatMoney(b.balance_due_minor, b.currency, { trimZeros: true }) })
            : undefined
        }
      />
    ),
    exportValue: (b) => `${b.currency} ${fromMinor(b.total_minor, b.currency)}`,
  },
  {
    key: 'created',
    header: t('bookings.list.colBooked'),
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
  const { t } = useAppTranslation();
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
          <h2 className="text-base font-semibold text-fg">{formatDate(month, 'LLLL yyyy')}</h2>
          <p className="text-xs text-muted">
            {bookings.data
              ? t('bookings.calendar.inView', { count: bookings.data.total })
              : t('bookings.calendar.loading')}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t('bookings.calendar.previousMonth')} onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            {t('bookings.calendar.today')}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t('bookings.calendar.nextMonth')} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </div>
      {bookings.isError ? (
        <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[42rem] grid-cols-7 overflow-hidden rounded-lg border border-border">
            {days.slice(0, 7).map((d) => (
              <div key={iso(d)} className="border-b border-border bg-surface-2 py-2 text-center text-xs font-semibold text-muted">
                {formatDate(d, 'EEE')}
              </div>
            ))}
            {days.map((day) => {
              const key = iso(day);
              const items = byDate.get(key) ?? [];
              return (
                <div key={key} className={cn('min-h-24 border-e border-b border-border p-1.5', !isSameMonth(day, month) && 'bg-surface-2/50')}>
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
                    {items.length > 3 && <li className="px-1.5 text-[11px] text-muted">{t('bookings.calendar.more', { count: items.length - 3 })}</li>}
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
            {s === 'completed' ? t('bookings.list.discharged') : BOOKING_STATUS_LABELS[s]}
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
  const { t } = useAppTranslation();
  useDocumentTitle(t('bookings.list.title'));
  const columns = useMemo(() => bookingColumns(t), [t]);
  const presets = useMemo(() => admissionPresets(t), [t]);
  const QUICK_LABELS = quickLabels(t);
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
    { value: '', label: t('common.all'), count: counts.data?.total },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: QUICK_LABELS[s] ?? BOOKING_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;

  const viewSwitch = (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label={t('bookings.list.view')}>
      {VIEWS.map((v) => (
        <Button
          key={v}
          size="sm"
          variant={view === v ? 'secondary' : 'ghost'}
          aria-pressed={view === v}
          leftIcon={v === 'list' ? <List className="size-4" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
          onClick={() => setView(v)}
        >
          {v === 'list' ? t('bookings.list.viewList') : t('bookings.list.viewCalendar')}
        </Button>
      ))}
    </div>
  );

  const filterPills = (
    <>
      <MultiSelectFilter label={t('common.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
      {view === 'list' && (
        <DateRangeFilter
          label={t('bookings.list.colAdmission')}
          value={{ from: filters.from, to: filters.to }}
          onChange={({ from, to }) => setFilters({ from, to })}
          presets={presets}
        />
      )}
      <MultiSelectFilter
        label={t('bookings.list.colPayment')}
        value={filters.payment}
        onChange={(v) => setFilter('payment', v)}
        options={BOOKING_PAYMENT_STATES.map((p) => ({
          value: p,
          label: BOOKING_PAYMENT_LABELS[p],
          tone: p === 'paid' ? 'success' : p === 'partial' ? 'info' : 'warning',
        }))}
      />
    </>
  );
  const moreFilters = (
    <>
      <DateRangeFilter label={t('bookings.list.filterBookedOn')} value={{ from: filters.booked_from, to: filters.booked_to }} onChange={({ from, to }) => setFilters({ booked_from: from, booked_to: to })} />
      <AmountRangeFilter
        label={t('bookings.list.colTotal')}
        currency={CURRENCY}
        value={{ min: filters.min_total, max: filters.max_total }}
        onChange={({ min, max }) => setFilters({ min_total: min, max_total: max })}
      />
    </>
  );
  const search = { value: filters.q, onChange: (q: string) => setFilter('q', q), placeholder: t('bookings.list.searchPlaceholder') };
  const quickTabs = (
    <QuickFilters label={t('bookings.list.bookingStatus')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
  );

  return (
    <div>
      <PageHeader
        title={t('bookings.list.title')}
        description={t('bookings.list.description')}
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
              {t('bookings.list.todaysAdmissions')}
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
          caption={t('bookings.list.title')}
          table={table}
          columns={columns}
          rows={list.data?.items}
          total={list.data?.total}
          loading={list.isLoading}
          fetching={list.isFetching && !list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          rowHref={(b) => `/bookings/${b.id}`}
          rowLabel={(b) => t('bookings.list.openBooking', { number: b.booking_number })}
          emptyTitle={t('bookings.list.emptyTitle')}
          emptyDescription={t('bookings.list.emptyDescription')}
          header={<div className="border-b border-border px-2 sm:px-3">{quickTabs}</div>}
          toolbar={
            <FilterBar
              search={search}
              onReset={table.resetFilters}
              more={moreFilters}
              actions={
                <ExportButton
                  filename="bookings"
                  columns={columns}
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
