import { useMemo } from 'react';
import { CalendarCheck, Wallet } from 'lucide-react';
import { BOOKING_STATUSES, type BookingOut, type BookingStatus } from '@hig/shared/api';
import { daysUntil, filterParam, formatDate, fromMinor, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MoneyCell,
  MultiSelectFilter,
  TextCell,
  ToggleFilter,
  statusTone,
  type DataTableColumn,
} from '@hig/shared/ui';
import { useBookings } from '../../api/queries';
import { Money } from '../../components/common';
import { PatientStatus, TableTabs, countBy, inDateRange, patientStatusLabel, quickValue } from '../../components/listing';
import { paths } from '../../lib/paths';
import { cn } from '../../lib/shared';
import { ButtonLink, PageHeader } from '../../ui/primitives';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(BOOKING_STATUSES),
  due: filterParam.boolean(),
  from: filterParam.date(),
  to: filterParam.date(),
};
const TABS: BookingStatus[] = ['pending_payment', 'confirmed', 'admitted', 'completed', 'cancelled'];
const label = (s: BookingStatus) => patientStatusLabel(s, 'booking') ?? s;
const treatmentOf = (b: BookingOut) => b.procedure?.name ?? b.package?.name ?? 'Treatment';
const hasBalance = (b: BookingOut) => b.balance_due_minor > 0 && b.status !== 'cancelled';

function PaymentProgress({ b }: { b: BookingOut }) {
  const pct = b.total_minor > 0 ? Math.min(100, Math.round((b.amount_paid_minor / b.total_minor) * 100)) : 0;
  return (
    <span className="block min-w-36 text-end">
      <span className="block font-medium tabular-nums">
        <Money minor={b.total_minor} currency={b.currency} />
      </span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn('mt-0.5 block text-xs', hasBalance(b) ? 'text-warning-ink' : 'text-success-ink')}>
        {b.status === 'cancelled' ? (
          <span className="text-muted">Cancelled</span>
        ) : hasBalance(b) ? (
          <>
            <Money minor={b.balance_due_minor} currency={b.currency} /> left to pay
          </>
        ) : (
          'Paid in full'
        )}
      </span>
    </span>
  );
}

const COLUMNS: DataTableColumn<BookingOut>[] = [
  {
    key: 'treatment',
    header: 'Treatment',
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    sortValue: treatmentOf,
    sortable: true,
    cell: (b) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{treatmentOf(b)}</span>
        <span className="block truncate font-mono text-xs text-muted">{b.booking_number}</span>
      </span>
    ),
    mobileCell: (b) => (
      <span className="block">
        <span className="block font-semibold">{treatmentOf(b)}</span>
        <span className="block font-mono text-xs font-normal text-muted">{b.booking_number}</span>
      </span>
    ),
    exportValue: treatmentOf,
  },
  {
    key: 'hospital',
    header: 'Hospital',
    className: 'max-w-60',
    cell: (b) => <TextCell primary={b.hospital.name} secondary={[b.hospital.city, b.doctor?.full_name].filter(Boolean).join(' · ')} />,
    exportValue: (b) => `${b.hospital.name}, ${b.hospital.city}`,
  },
  {
    key: 'admission_date',
    header: 'Admission',
    sortable: true,
    sortDescFirst: true,
    cell: (b) => {
      const days = daysUntil(b.admission_date);
      const upcoming = days !== null && days >= 0 && (b.status === 'confirmed' || b.status === 'pending_payment');
      return (
        <DateCell
          value={b.admission_date}
          display="date"
          secondary={upcoming ? (days === 0 ? 'Today' : `In ${days} day${days === 1 ? '' : 's'}`) : b.discharge_date ? `Discharge ${formatDate(b.discharge_date)}` : undefined}
        />
      );
    },
    exportValue: (b) => b.admission_date,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (b) => <PatientStatus status={b.status} kind="booking" />,
    exportValue: (b) => label(b.status),
  },
  {
    key: 'total',
    header: 'Payment',
    align: 'end',
    sortable: true,
    sortValue: (b) => b.total_minor,
    cell: (b) => <PaymentProgress b={b} />,
    exportValue: (b) => `${b.currency} ${fromMinor(b.total_minor, b.currency)}`,
  },
  {
    key: 'balance',
    header: 'Left to pay',
    align: 'end',
    defaultHidden: true,
    sortable: true,
    sortValue: (b) => (hasBalance(b) ? b.balance_due_minor : 0),
    cell: (b) => <MoneyCell minor={hasBalance(b) ? b.balance_due_minor : 0} currency={b.currency} />,
    exportValue: (b) => `${b.currency} ${fromMinor(hasBalance(b) ? b.balance_due_minor : 0, b.currency)}`,
  },
  {
    key: 'created_at',
    header: 'Booked on',
    sortable: true,
    sortDescFirst: true,
    defaultHidden: true,
    cell: (b) => <DateCell value={b.created_at} display="date" />,
    exportValue: (b) => b.created_at,
  },
];

export function BookingsPage() {
  useDocumentTitle('Bookings');
  const table = useTableState({ filters: FILTERS, defaultSort: '-admission_date', defaultPageSize: 10 });
  const { filters, setFilter, setFilters } = table;
  // a patient has a handful of bookings: one request, filtered/sorted/paginated in the browser
  const bookings = useBookings({ page: 1, page_size: 100 });
  const all = useMemo(() => bookings.data?.items ?? [], [bookings.data]);

  // everything except the status filter (drives the tab counts)
  const base = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (b: BookingOut) => [b.booking_number, treatmentOf(b), b.hospital.name, b.hospital.city, b.doctor?.full_name]))
        .filter((b) => !filters.due || hasBalance(b))
        .filter((b) => inDateRange(b.admission_date, filters.from, filters.to)),
    [all, filters.q, filters.due, filters.from, filters.to],
  );
  const rows = useMemo(() => base.filter((b) => !filters.status.length || filters.status.includes(b.status)), [base, filters.status]);
  const counts = useMemo(() => countBy(base, (b) => b.status), [base]);
  const dueCount = all.filter(hasBalance).length;

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Your confirmed treatments, admission dates and what is left to pay."
        actions={
          <ButtonLink to={paths.payments} variant="outline" icon={<Wallet className="h-4 w-4" aria-hidden />}>
            Payments & receipts
          </ButtonLink>
        }
      />
      <DataTable
        id="patient.bookings"
        caption="Bookings"
        table={table}
        columns={COLUMNS}
        rows={bookings.data ? rows : undefined}
        loading={bookings.isLoading}
        fetching={bookings.isFetching && !bookings.isLoading}
        error={bookings.error}
        onRetry={() => void bookings.refetch()}
        rowHref={(b) => paths.booking(b.id)}
        rowLabel={(b) => `Open booking ${b.booking_number}`}
        emptyIcon={<CalendarCheck className="size-8" aria-hidden />}
        emptyTitle="No bookings yet"
        emptyDescription="Once you accept a quote and choose your dates, your booking appears here."
        emptyAction={<ButtonLink to={paths.cases}>Go to my cases</ButtonLink>}
        header={
          <TableTabs
            label="Booking status"
            items={[{ value: '', label: 'All', count: base.length }, ...TABS.map((s) => ({ value: s, label: label(s), count: counts[s] ?? 0 }))]}
            value={quickValue(filters.status, TABS)}
            onChange={(s) => setFilter('status', s ? [s] : [])}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Treatment or booking no…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-bookings" columns={COLUMNS} rows={rows} />}
          >
            <MultiSelectFilter
              label="Status"
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={BOOKING_STATUSES.map((s) => ({ value: s, label: label(s), tone: statusTone(s, 'booking'), count: counts[s] ?? 0 }))}
            />
            <DateRangeFilter label="Admission" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
            <ToggleFilter
              label={dueCount ? `Left to pay (${dueCount})` : 'Left to pay'}
              pressed={!!filters.due}
              onChange={(on) => setFilter('due', on || undefined)}
              icon={<Wallet className="size-3.5 opacity-70" aria-hidden />}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
