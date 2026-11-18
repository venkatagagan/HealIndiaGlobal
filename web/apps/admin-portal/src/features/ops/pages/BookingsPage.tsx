import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BedDouble, Building2, CalendarPlus, CheckCircle2, Download, Trash2, Wallet, XCircle } from 'lucide-react';
import {
  bookingsApi,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  CHECKLIST_STATUSES,
  CHECKLIST_STATUS_LABELS,
  enumOptions,
  ITINERARY_KINDS,
  ITINERARY_KIND_LABELS,
  PAYMENT_OPTION_LABELS,
  type BookingListParams,
  type BookingOut,
  type BookingPaymentState,
  type BookingStatus,
  type ChecklistStatus,
  type ItineraryItemOut,
  type ItineraryKind,
} from '@hig/shared/api';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import {
  fetchAllPages,
  filterParam,
  formatMoney as formatMoneyShared,
  formatNumber,
  fromMinor,
  toMinor,
  useTableState,
  type FilterValues,
} from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Badge as UiBadge,
  Button as UiButton,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  exportCsv,
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
import {
  Button,
  Drawer,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  ReasonDialog,
  Select,
  Textarea,
} from '../ui';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  fromDateTimeLocal,
  toIsoDate,
  useDocumentTitle,
} from '../lib/format';
import { useHospitalOptions } from '../lib/lookups';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { DrawerSummary, StatTiles } from '../components/DrawerSummary';
import { Banner, FieldGrid, Panel, StatusTrack, type TrackStep } from '../ui/detail';
import { useAppTranslation } from '../../../i18n';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const PAYMENT_STATES = ['paid', 'partial', 'unpaid'] as const satisfies readonly BookingPaymentState[];
/** "Paid in full" / "Partially paid" / "Unpaid" */
const paymentLabel = (t: TFunction, state: BookingPaymentState): string => t(`bookings.payment.${state}`);
const DATE_FIELDS = ['admission', 'created'] as const;

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(BOOKING_STATUSES),
  hospital_id: filterParam.text(),
  payment: filterParam.list(PAYMENT_STATES),
  date_field: filterParam.oneOf(DATE_FIELDS, 'admission'),
  from: filterParam.date(),
  to: filterParam.date(),
  min_total: filterParam.number(),
  max_total: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'admission_date', 'booking_number', 'total_minor', 'status'] as const;
type BookingFilters = FilterValues<typeof FILTERS>;

/** URL filters -> GET /bookings params (shared by the list, the status counts and the export). Amounts are INR. */
function toApiFilters(f: BookingFilters): Omit<BookingListParams, 'page' | 'page_size' | 'sort'> {
  const dateKey = f.date_field === 'created' ? 'created' : 'admission';
  const minor = (v: number | undefined) => (v === undefined ? undefined : (toMinor(v, 'INR') ?? undefined));
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    hospital_id: f.hospital_id || undefined,
    payment: f.payment.length ? f.payment : undefined,
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
    min_total: minor(f.min_total),
    max_total: minor(f.max_total),
  };
}

function paymentState(b: BookingOut): BookingPaymentState {
  if (b.amount_paid_minor <= 0) return 'unpaid';
  return b.balance_due_minor > 0 ? 'partial' : 'paid';
}

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const bookingColumns = (t: TFunction): DataTableColumn<BookingOut>[] => [
  {
    key: 'booking',
    header: t('bookings.columns.booking'),
    sortable: true,
    sortKey: 'booking_number',
    sticky: true,
    mobile: 'secondary',
    cell: (b) => <IdCell value={b.booking_number} secondary={t('bookings.bookedOn', { date: formatDate(b.created_at) })} />,
    mobileCell: (b) => <span className="font-mono text-xs">{b.booking_number}</span>,
    exportValue: (b) => b.booking_number,
  },
  {
    key: 'patient',
    header: t('bookings.columns.patient'),
    mobile: 'primary',
    className: 'max-w-56',
    cell: (b) => <PersonCell name={b.patient.full_name} secondary={b.procedure?.name ?? b.package?.name ?? undefined} />,
    exportValue: (b) => b.patient.full_name,
  },
  {
    key: 'hospital',
    header: t('bookings.columns.hospital'),
    className: 'max-w-52',
    cell: (b) => <TextCell primary={b.hospital.name} secondary={b.hospital.city} />,
    exportValue: (b) => b.hospital.name,
  },
  {
    key: 'admission',
    header: t('bookings.columns.admission'),
    sortable: true,
    sortKey: 'admission_date',
    sortDescFirst: true,
    cell: (b) => (
      <DateCell value={b.admission_date} display="date" secondary={b.duration_days != null ? t('bookings.days', { count: b.duration_days }) : undefined} />
    ),
    exportValue: (b) => b.admission_date ?? '',
  },
  {
    key: 'status',
    header: t('bookings.columns.status'),
    sortable: true,
    mobile: 'badge',
    cell: (b) => <StatusBadgeCell status={b.status} kind="booking" />,
    exportValue: (b) => BOOKING_STATUS_LABELS[b.status],
  },
  {
    key: 'total',
    header: t('bookings.columns.total'),
    align: 'end',
    sortable: true,
    sortKey: 'total_minor',
    sortDescFirst: true,
    cell: (b) => (
      <MoneyCell
        minor={b.total_minor}
        currency={b.currency}
        secondary={
          b.installment_months ? (
            <span className="whitespace-nowrap">{t('bookings.installments', { count: b.installment_months })}</span>
          ) : undefined
        }
      />
    ),
    exportValue: (b) => `${b.currency} ${fromMinor(b.total_minor, b.currency)}`,
  },
  {
    key: 'paid',
    header: t('bookings.columns.paid'),
    align: 'end',
    cell: (b) => {
      const state = paymentState(b);
      return (
        <MoneyCell
          minor={b.amount_paid_minor}
          currency={b.currency}
          className={state === 'paid' ? 'text-success-ink' : state === 'partial' ? 'text-warning-ink' : undefined}
          secondary={
            <span className="whitespace-nowrap">
              {state === 'paid' ? paymentLabel(t, 'paid') : t('bookings.due', { amount: formatMoneyShared(b.balance_due_minor, b.currency) })}
            </span>
          }
        />
      );
    },
    exportValue: (b) => `${b.currency} ${fromMinor(b.amount_paid_minor, b.currency)}`,
  },
  {
    key: 'created',
    header: t('bookings.columns.booked'),
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (b) => <DateCell value={b.created_at} display="relative" className="text-muted" />,
    exportValue: (b) => b.created_at,
  },
];

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function BookingsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('bookings.title'));
  const columns = useMemo(() => bookingColumns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: BookingListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const hospitals = useHospitalOptions();
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...opsKeys.bookings, 'list', listParams],
    queryFn: () => bookingsApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...opsKeys.bookings, 'status-counts', apiFilters],
    queryFn: () => bookingsApi.statusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });

  const statusOptions: FilterOption<BookingStatus>[] = BOOKING_STATUSES.map((s) => ({
    value: s,
    label: BOOKING_STATUS_LABELS[s],
    tone: statusTone(s, 'booking'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<BookingStatus>[] = [
    { value: '', label: t('bookings.quickAll'), count: counts.data?.total },
    ...BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;

  return (
    <div>
      <PageHeader title={t('bookings.title')} description={t('bookings.description')} />
      <DataTable
        id="admin.bookings"
        caption={t('bookings.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(b) => setSelected(b.id)}
        rowLabel={(b) => t('bookings.openRow', { number: b.booking_number })}
        selectable
        bulkActions={(rows, clear) => (
          <UiButton
            size="sm"
            variant="outline"
            leftIcon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              exportCsv(rows, columns, `bookings-selected-${new Date().toISOString().slice(0, 10)}`);
              clear();
            }}
          >
            {t('bookings.exportSelected')}
          </UiButton>
        )}
        emptyTitle={t('bookings.emptyTitle')}
        emptyDescription={t('bookings.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('bookings.quickLabel')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('bookings.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="bookings"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => bookingsApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
            more={
              <AmountRangeFilter
                label={t('bookings.filters.total')}
                currency="INR"
                value={{ min: filters.min_total, max: filters.max_total }}
                onChange={({ min, max }) => setFilters({ min_total: min, max_total: max })}
              />
            }
          >
            <MultiSelectFilter label={t('bookings.filters.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label={t('bookings.filters.hospital')}
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital_id}
              onChange={(v) => setFilter('hospital_id', v)}
              options={hospitals.data ?? []}
              loading={hospitals.isLoading}
              searchable
            />
            <MultiSelectFilter
              label={t('bookings.filters.payment')}
              icon={<Wallet className="size-3.5 opacity-70" aria-hidden />}
              value={filters.payment}
              onChange={(v) => setFilter('payment', v)}
              options={PAYMENT_STATES.map((p) => ({
                value: p,
                label: paymentLabel(t, p),
                tone: p === 'paid' ? 'success' : p === 'partial' ? 'warning' : 'neutral',
              }))}
            />
            <DateRangeFilter
              label={t('bookings.filters.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'admission', label: t('bookings.filters.dateAdmission') },
                { value: 'created', label: t('bookings.filters.dateBooked') },
              ]}
              field={filters.date_field || 'admission'}
              onFieldChange={(date_field) => setFilter('date_field', date_field)}
            />
          </FilterBar>
        }
      />
      <BookingDrawer bookingId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function bookingTrack(
  t: TFunction,
  b: BookingOut,
): { steps: TrackStep[]; current: number; terminal: { label: string; at?: string | null } | null } {
  const steps: TrackStep[] = [
    { key: 'booked', label: t('bookings.track.booked'), at: formatDate(b.created_at, 'd MMM') },
    { key: 'confirmed', label: t('bookings.track.depositPaid'), at: b.confirmed_at ? formatDate(b.confirmed_at, 'd MMM') : null },
    { key: 'admitted', label: t('bookings.track.admitted'), at: b.admitted_at ? formatDate(b.admitted_at, 'd MMM') : null },
    { key: 'completed', label: t('bookings.track.completed'), at: b.completed_at ? formatDate(b.completed_at, 'd MMM') : null },
  ];
  const reached = b.completed_at ? 3 : b.admitted_at ? 2 : b.confirmed_at ? 1 : 0;
  const current = b.status === 'completed' ? 3 : b.status === 'admitted' ? 2 : b.status === 'confirmed' ? 1 : b.status === 'pending_payment' ? 0 : reached;
  const terminal =
    b.status === 'cancelled' ? { label: t('bookings.track.cancelled'), at: b.cancelled_at ? formatDate(b.cancelled_at, 'd MMM') : null } : null;
  return { steps, current, terminal };
}

function BookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const q = useQuery({
    queryKey: [...opsKeys.bookings, 'detail', bookingId],
    queryFn: () => bookingsApi.get(bookingId!),
    enabled: !!bookingId,
  });
  const [dialog, setDialog] = useState<'cancel' | 'admit' | 'complete' | null>(null);
  const b = q.data;
  const invalidate = [opsKeys.bookings, opsKeys.cases, opsKeys.dashboard] as const;

  const cancel = useOpsMutation({
    mutationFn: (reason: string) => bookingsApi.cancel(bookingId!, { reason }),
    success: t('bookings.drawer.cancelSuccess'),
    invalidate,
    onSuccess: () => setDialog(null),
  });

  const actions =
    b && perms.manageBookings ? (
      <>
        {b.status === 'confirmed' && (
          <Button size="sm" icon={<BedDouble className="size-4" />} onClick={() => setDialog('admit')}>
            {t('bookings.drawer.markAdmitted')}
          </Button>
        )}
        {b.status === 'admitted' && (
          <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => setDialog('complete')}>
            {t('bookings.drawer.markCompleted')}
          </Button>
        )}
        {(b.status === 'pending_payment' || b.status === 'confirmed') && (
          <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400" icon={<XCircle className="size-4" />} onClick={() => setDialog('cancel')}>
            {t('bookings.drawer.cancelBooking')}
          </Button>
        )}
      </>
    ) : null;
  const track = b ? bookingTrack(t, b) : null;
  const paidPct = b && b.total_minor > 0 ? Math.min(100, Math.round((b.amount_paid_minor / b.total_minor) * 100)) : 0;

  return (
    <Drawer
      open={!!bookingId}
      onClose={onClose}
      width="xl"
      title={b ? t('bookings.drawer.titleWithNumber', { number: b.booking_number }) : t('bookings.drawer.title')}
      subtitle={b ? `${b.patient.full_name} · ${b.hospital.name}, ${b.hospital.city}` : undefined}
    >
      {q.isLoading ? (
        <LoadingState />
      ) : q.error || !b ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <DrawerSummary
            badges={
              <>
                <StatusBadgeCell status={b.status} kind="booking" />
                <PaymentBadge b={b} />
                {b.insurance_claim_requested && <UiBadge tone="info">{t('bookings.drawer.insuranceClaim')}</UiBadge>}
              </>
            }
            meta={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {b.duration_days != null ? (
                    <Trans
                      t={t}
                      i18nKey="bookings.drawer.admissionWithDuration"
                      count={b.duration_days}
                      values={{ date: formatDate(b.admission_date) }}
                      components={{ 0: <strong className="font-medium text-fg" /> }}
                    />
                  ) : (
                    <Trans
                      t={t}
                      i18nKey="bookings.drawer.admission"
                      values={{ date: formatDate(b.admission_date) }}
                      components={{ 0: <strong className="font-medium text-fg" /> }}
                    />
                  )}
                </span>
                <Link to={opsPaths.case(b.case_id)} className="font-medium text-primary-ink hover:underline">
                  {t('bookings.drawer.openCase')}
                </Link>
              </span>
            }
            actions={actions}
          >
            {track && <StatusTrack steps={track.steps} current={track.current} terminal={track.terminal} />}
          </DrawerSummary>

          {b.status === 'cancelled' && (
            <Banner
              tone="danger"
              icon={<XCircle className="size-4" aria-hidden />}
              title={t('bookings.drawer.cancelledAt', { date: formatDateTime(b.cancelled_at) })}
            >
              {b.cancel_reason ?? t('bookings.drawer.noReason')}
            </Banner>
          )}

          <Panel
            title={t('bookings.drawer.payment')}
            description={
              b.installment_months
                ? t('bookings.drawer.paymentOptionWithInstallments', { option: PAYMENT_OPTION_LABELS[b.payment_option], count: b.installment_months })
                : PAYMENT_OPTION_LABELS[b.payment_option]
            }
          >
            <StatTiles
              items={[
                { label: t('bookings.drawer.total'), value: formatMoney(b.total_minor, b.currency) },
                {
                  label: t('bookings.drawer.paid'),
                  value: formatMoney(b.amount_paid_minor, b.currency),
                  tone: paidPct >= 100 ? 'success' : undefined,
                  hint: t('bookings.drawer.paidPct', { pct: formatNumber(paidPct) }),
                },
                { label: t('bookings.drawer.balanceDue'), value: formatMoney(b.balance_due_minor, b.currency), tone: b.balance_due_minor > 0 ? 'warning' : 'success' },
                { label: t('bookings.drawer.refunded'), value: formatMoney(b.amount_refunded_minor, b.currency), tone: b.amount_refunded_minor > 0 ? 'danger' : undefined },
              ]}
            />
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={t('bookings.drawer.paid')}
              aria-valuenow={paidPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className={paidPct >= 100 ? 'h-full bg-success' : 'h-full bg-primary'} style={{ width: `${paidPct}%` }} />
            </div>
            <div className="mt-4">
              <FieldGrid
                columns={3}
                items={[
                  { label: t('bookings.drawer.subtotal'), value: formatMoney(b.subtotal_minor, b.currency) },
                  { label: t('bookings.drawer.discount'), value: b.discount_minor ? `− ${formatMoney(b.discount_minor, b.currency)}` : '—' },
                  { label: t('bookings.drawer.serviceFee'), value: formatMoney(b.service_fee_minor, b.currency) },
                  { label: t('bookings.drawer.tax'), value: formatMoney(b.tax_minor, b.currency) },
                  { label: t('bookings.drawer.deposit'), value: formatMoney(b.deposit_minor, b.currency) },
                ]}
              />
            </div>
          </Panel>

          <Panel title={t('bookings.drawer.treatment')}>
            <FieldGrid
              columns={3}
              items={[
                { label: t('bookings.drawer.procedure'), value: b.procedure?.name ?? '—' },
                { label: t('bookings.drawer.package'), value: b.package?.name ?? '—' },
                { label: t('bookings.drawer.doctor'), value: b.doctor?.full_name ?? '—' },
                { label: t('bookings.drawer.admissionDate'), value: formatDate(b.admission_date) },
                { label: t('bookings.drawer.discharge'), value: formatDate(b.discharge_date) },
                { label: t('bookings.drawer.duration'), value: b.duration_days != null ? t('bookings.days', { count: b.duration_days }) : '—' },
                { label: t('bookings.drawer.confirmed'), value: formatDateTime(b.confirmed_at) },
                { label: t('bookings.drawer.admitted'), value: formatDateTime(b.admitted_at) },
                { label: t('bookings.drawer.completed'), value: formatDateTime(b.completed_at) },
              ]}
            />
          </Panel>

          {b.status !== 'pending_payment' && b.status !== 'cancelled' && (
            <>
              <Checklist bookingId={b.id} canEdit={perms.manageBookings} />
              <Itinerary bookingId={b.id} canEdit={perms.manageBookings} />
            </>
          )}
        </div>
      )}
      <ReasonDialog
        open={dialog === 'cancel'}
        title={t('bookings.drawer.cancelBooking')}
        description={t('bookings.drawer.cancelDescription')}
        confirmLabel={t('bookings.drawer.cancelBooking')}
        loading={cancel.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
      {b && (
        <TransitionModal
          open={dialog === 'admit' || dialog === 'complete'}
          kind={dialog === 'complete' ? 'complete' : 'admit'}
          bookingId={b.id}
          onClose={() => setDialog(null)}
        />
      )}
    </Drawer>
  );
}

function PaymentBadge({ b }: { b: BookingOut }) {
  const { t } = useAppTranslation();
  const state = paymentState(b);
  return (
    <UiBadge tone={state === 'paid' ? 'success' : state === 'partial' ? 'warning' : 'neutral'} dot>
      {paymentLabel(t, state)}
    </UiBadge>
  );
}

function TransitionModal({
  open,
  kind,
  bookingId,
  onClose,
}: {
  open: boolean;
  kind: 'admit' | 'complete';
  bookingId: string;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const [note, setNote] = useState('');
  const [discharge, setDischarge] = useState('');
  useEffect(() => {
    if (open) {
      setNote('');
      setDischarge(toIsoDate(new Date()) ?? '');
    }
  }, [open]);
  const run = useOpsMutation({
    mutationFn: () =>
      kind === 'admit'
        ? bookingsApi.admit(bookingId, { note: note.trim() || undefined })
        : bookingsApi.complete(bookingId, { note: note.trim() || undefined, discharge_date: discharge || undefined }),
    success: kind === 'admit' ? t('bookings.transition.admitSuccess') : t('bookings.transition.completeSuccess'),
    invalidate: [opsKeys.bookings, opsKeys.cases, opsKeys.dashboard],
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={kind === 'admit' ? t('bookings.transition.admitTitle') : t('bookings.transition.completeTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('bookings.transition.cancel')}
          </Button>
          <Button loading={run.isPending} onClick={() => run.mutate()}>
            {t('bookings.transition.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {kind === 'admit' ? t('bookings.transition.admitHelp') : t('bookings.transition.completeHelp')}
        </p>
        {kind === 'complete' && (
          <Field label={t('bookings.transition.dischargeDate')}>
            {(id) => <Input id={id} type="date" value={discharge} onChange={(e) => setDischarge(e.target.value)} />}
          </Field>
        )}
        <Field label={t('bookings.transition.note')}>
          {(id) => <Textarea id={id} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function Checklist({ bookingId, canEdit }: { bookingId: string; canEdit: boolean }) {
  const { t } = useAppTranslation();
  const q = useQuery({
    queryKey: [...opsKeys.bookings, 'checklist', bookingId],
    queryFn: () => bookingsApi.checklist(bookingId),
  });
  const update = useOpsMutation({
    mutationFn: (v: { itemId: string; status: ChecklistStatus }) =>
      bookingsApi.updateChecklistItem(bookingId, v.itemId, { status: v.status }),
    success: t('bookings.checklist.updated'),
    invalidate: [[...opsKeys.bookings, 'checklist', bookingId]],
  });
  const items = [...(q.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const done = items.filter((i) => i.status === 'done').length;
  return (
    <Panel
      title={t('bookings.checklist.title')}
      description={items.length ? t('bookings.checklist.progress', { done, total: items.length }) : undefined}
      actions={
        items.length > 0 ? (
          <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="block h-full bg-primary" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
          </span>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{t('bookings.checklist.empty')}</p>
      ) : (
        <ul className="-my-2 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className={item.status === 'done' ? 'size-4 shrink-0 text-success' : 'size-4 shrink-0 text-border-strong'} aria-hidden />
                <span className={item.status === 'done' ? 'truncate text-muted line-through' : 'truncate text-fg'}>{item.label}</span>
              </span>
              {canEdit ? (
                <Select
                  aria-label={t('bookings.checklist.statusOf', { label: item.label })}
                  className="h-8 w-36 text-xs"
                  value={item.status}
                  disabled={update.isPending}
                  onChange={(e) => update.mutate({ itemId: item.id, status: e.target.value as ChecklistStatus })}
                  options={enumOptions(CHECKLIST_STATUSES, CHECKLIST_STATUS_LABELS)}
                />
              ) : (
                <StatusBadgeCell status={item.status} kind="checklist" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Itinerary({ bookingId, canEdit }: { bookingId: string; canEdit: boolean }) {
  const { t } = useAppTranslation();
  const key = [...opsKeys.bookings, 'itinerary', bookingId];
  const q = useQuery({ queryKey: key, queryFn: () => bookingsApi.itinerary(bookingId) });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'appointment' as ItineraryKind, title: '', starts_at: '', location: '', description: '' });
  const add = useOpsMutation({
    mutationFn: () =>
      bookingsApi.addItineraryItem(bookingId, {
        kind: form.kind,
        title: form.title.trim(),
        starts_at: fromDateTimeLocal(form.starts_at)!,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
      }),
    success: t('bookings.itinerary.added'),
    invalidate: [key],
    onSuccess: () => {
      setAdding(false);
      setForm({ kind: 'appointment', title: '', starts_at: '', location: '', description: '' });
    },
  });
  const remove = useOpsMutation({
    mutationFn: (itemId: string) => bookingsApi.deleteItineraryItem(bookingId, itemId),
    success: t('bookings.itinerary.removed'),
    invalidate: [key],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim() && fromDateTimeLocal(form.starts_at)) add.mutate();
  };

  const columns: DataTableColumn<ItineraryItemOut>[] = [
    {
      key: 'starts_at',
      header: t('bookings.itinerary.when'),
      sortable: true,
      mobile: 'secondary',
      cell: (it) => <DateCell value={it.starts_at} display="datetime" />,
    },
    {
      key: 'title',
      header: t('bookings.itinerary.item'),
      sortable: true,
      mobile: 'primary',
      className: 'max-w-64',
      cell: (it) => <TextCell primary={<span className="font-medium">{it.title}</span>} secondary={[ITINERARY_KIND_LABELS[it.kind], it.location].filter(Boolean).join(' · ')} />,
    },
    { key: 'status', header: t('bookings.itinerary.status'), mobile: 'badge', cell: (it) => <StatusBadgeCell status={it.status} kind="itinerary" /> },
    ...(canEdit
      ? [
          {
            key: '_remove',
            header: <span className="sr-only">{t('bookings.itinerary.remove')}</span>,
            title: t('bookings.itinerary.remove'),
            align: 'end' as const,
            hideable: false,
            cell: (it: ItineraryItemOut) => (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('bookings.itinerary.removeItem', { title: it.title })}
                icon={<Trash2 className="size-3.5" />}
                disabled={remove.isPending}
                onClick={() => remove.mutate(it.id)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <Panel
      title={t('bookings.itinerary.title')}
      bodyClassName="p-0"
      actions={
        canEdit && (
          <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-3.5" />} onClick={() => setAdding(true)}>
            {t('bookings.itinerary.addItem')}
          </Button>
        )
      }
    >
      <DataTable
        caption={t('bookings.itinerary.title')}
        columns={columns}
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        defaultSort={{ key: 'starts_at', direction: 'asc' }}
        density="compact"
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle={t('bookings.itinerary.emptyTitle')}
        emptyDescription={t('bookings.itinerary.emptyDescription')}
      />
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('bookings.itinerary.addTitle')}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>
              {t('bookings.itinerary.cancel')}
            </Button>
            <Button
              type="submit"
              form="itinerary-form"
              loading={add.isPending}
              disabled={!form.title.trim() || !form.starts_at}
            >
              {t('bookings.itinerary.add')}
            </Button>
          </>
        }
      >
        <form id="itinerary-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bookings.itinerary.kind')} required>
            {(id) => (
              <Select
                id={id}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as ItineraryKind })}
                options={enumOptions(ITINERARY_KINDS, ITINERARY_KIND_LABELS)}
              />
            )}
          </Field>
          <Field label={t('bookings.itinerary.startsAt')} required>
            {(id) => (
              <Input id={id} type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            )}
          </Field>
          <Field label={t('bookings.itinerary.titleField')} required className="sm:col-span-2">
            {(id) => <Input id={id} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label={t('bookings.itinerary.location')} className="sm:col-span-2">
            {(id) => <Input id={id} value={form.location} maxLength={300} onChange={(e) => setForm({ ...form, location: e.target.value })} />}
          </Field>
          <Field label={t('bookings.itinerary.description')} className="sm:col-span-2">
            {(id) => (
              <Textarea id={id} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            )}
          </Field>
        </form>
      </Modal>
    </Panel>
  );
}
