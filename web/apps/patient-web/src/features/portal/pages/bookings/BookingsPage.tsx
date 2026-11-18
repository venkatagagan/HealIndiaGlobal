import { useMemo } from 'react';
import { Trans } from 'react-i18next';
import { CalendarCheck, Wallet } from 'lucide-react';
import { BOOKING_STATUSES, type BookingOut, type BookingStatus } from '@hig/shared/api';
import { daysUntil, filterParam, formatDate, fromMinor, i18n, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
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
import { useAppTranslation } from '../../../../i18n';
import { ApproxMoney } from '../../components/phase1';
import { useBookings } from '../../api/queries';
import { Money } from '../../components/common';
import { PatientStatus, TableTabs, countBy, inDateRange, patientStatusLabel, quickValue } from '../../components/listing';
import { paths } from '../../lib/paths';
import { cn } from '../../lib/shared';
import { ButtonLink, PageHeader } from '../../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(BOOKING_STATUSES),
  due: filterParam.boolean(),
  from: filterParam.date(),
  to: filterParam.date(),
};
const TABS: BookingStatus[] = ['pending_payment', 'confirmed', 'admitted', 'completed', 'cancelled'];
const label = (s: BookingStatus) => patientStatusLabel(s, 'booking') ?? s;
const treatmentOf = (b: BookingOut) => b.procedure?.name ?? b.package?.name ?? i18n.t('patient:bookings.treatment');
const hasBalance = (b: BookingOut) => b.balance_due_minor > 0 && b.status !== 'cancelled';

function PaymentProgress({ b }: { b: BookingOut }) {
  const { t } = useAppTranslation();
  const pct = b.total_minor > 0 ? Math.min(100, Math.round((b.amount_paid_minor / b.total_minor) * 100)) : 0;
  return (
    <span className="block min-w-36 text-end">
      <span className="block font-medium tabular-nums">
        <ApproxMoney minor={b.total_minor} currency={b.currency} display={b.display_total} className="items-end" />
      </span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className={cn('block h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn('mt-0.5 block text-xs', hasBalance(b) ? 'text-warning-ink' : 'text-success-ink')}>
        {b.status === 'cancelled' ? (
          <span className="text-muted">{t('bookings.list.cancelled')}</span>
        ) : hasBalance(b) ? (
          <Trans
            t={t}
            i18nKey="bookings.list.amountLeftToPay"
            components={{ 0: <Money minor={b.balance_due_minor} currency={b.currency} /> }}
          />
        ) : (
          t('bookings.list.paidInFull')
        )}
      </span>
    </span>
  );
}

function bookingColumns(t: TFn): DataTableColumn<BookingOut>[] {
  return [
    {
      key: 'treatment',
      header: t('bookings.list.columns.treatment'),
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
      header: t('bookings.list.columns.hospital'),
      className: 'max-w-60',
      cell: (b) => <TextCell primary={b.hospital.name} secondary={[b.hospital.city, b.doctor?.full_name].filter(Boolean).join(' · ')} />,
      exportValue: (b) => `${b.hospital.name}, ${b.hospital.city}`,
    },
    {
      key: 'admission_date',
      header: t('bookings.list.columns.admission'),
      sortable: true,
      sortDescFirst: true,
      cell: (b) => {
        const days = daysUntil(b.admission_date);
        const upcoming = days !== null && days >= 0 && (b.status === 'confirmed' || b.status === 'pending_payment');
        return (
          <DateCell
            value={b.admission_date}
            display="date"
            secondary={
              upcoming
                ? days === 0
                  ? t('bookings.list.today')
                  : t('bookings.list.inDays', { count: days })
                : b.discharge_date
                  ? t('bookings.list.discharge', { date: formatDate(b.discharge_date) })
                  : undefined
            }
          />
        );
      },
      exportValue: (b) => b.admission_date,
    },
    {
      key: 'status',
      header: t('bookings.list.columns.status'),
      sortable: true,
      mobile: 'badge',
      cell: (b) => <PatientStatus status={b.status} kind="booking" />,
      exportValue: (b) => label(b.status),
    },
    {
      key: 'total',
      header: t('bookings.list.columns.payment'),
      align: 'end',
      sortable: true,
      sortValue: (b) => b.total_minor,
      cell: (b) => <PaymentProgress b={b} />,
      exportValue: (b) => `${b.currency} ${fromMinor(b.total_minor, b.currency)}`,
    },
    {
      key: 'balance',
      header: t('bookings.list.columns.leftToPay'),
      align: 'end',
      defaultHidden: true,
      sortable: true,
      sortValue: (b) => (hasBalance(b) ? b.balance_due_minor : 0),
      cell: (b) => <MoneyCell minor={hasBalance(b) ? b.balance_due_minor : 0} currency={b.currency} />,
      exportValue: (b) => `${b.currency} ${fromMinor(hasBalance(b) ? b.balance_due_minor : 0, b.currency)}`,
    },
    {
      key: 'created_at',
      header: t('bookings.list.columns.bookedOn'),
      sortable: true,
      sortDescFirst: true,
      defaultHidden: true,
      cell: (b) => <DateCell value={b.created_at} display="date" />,
      exportValue: (b) => b.created_at,
    },
  ];
}

export function BookingsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('bookings.list.title'));
  const columns = useMemo(() => bookingColumns(t), [t]);
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
        title={t('bookings.list.title')}
        description={t('bookings.list.description')}
        actions={
          <ButtonLink to={paths.payments} variant="outline" icon={<Wallet className="h-4 w-4" aria-hidden />}>
            {t('bookings.list.paymentsLink')}
          </ButtonLink>
        }
      />
      <DataTable
        id="patient.bookings"
        caption={t('bookings.list.title')}
        table={table}
        columns={columns}
        rows={bookings.data ? rows : undefined}
        loading={bookings.isLoading}
        fetching={bookings.isFetching && !bookings.isLoading}
        error={bookings.error}
        onRetry={() => void bookings.refetch()}
        rowHref={(b) => paths.booking(b.id)}
        rowLabel={(b) => t('bookings.list.openBooking', { number: b.booking_number })}
        emptyIcon={<CalendarCheck className="size-8" aria-hidden />}
        emptyTitle={t('bookings.list.emptyTitle')}
        emptyDescription={t('bookings.list.emptyDescription')}
        emptyAction={<ButtonLink to={paths.cases}>{t('bookings.list.goToCases')}</ButtonLink>}
        header={
          <TableTabs
            label={t('bookings.list.statusTabs')}
            items={[{ value: '', label: t('bookings.list.all'), count: base.length }, ...TABS.map((s) => ({ value: s, label: label(s), count: counts[s] ?? 0 }))]}
            value={quickValue(filters.status, TABS)}
            onChange={(s) => setFilter('status', s ? [s] : [])}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('bookings.list.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-bookings" columns={columns} rows={rows} />}
          >
            <MultiSelectFilter
              label={t('bookings.list.columns.status')}
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={BOOKING_STATUSES.map((s) => ({ value: s, label: label(s), tone: statusTone(s, 'booking'), count: counts[s] ?? 0 }))}
            />
            <DateRangeFilter
              label={t('bookings.list.columns.admission')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
            />
            <ToggleFilter
              label={dueCount ? t('bookings.list.leftToPayCount', { n: dueCount }) : t('bookings.list.columns.leftToPay')}
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
