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
import { fetchAllPages, filterParam, formatMoney as formatMoneyShared, fromMinor, toMinor, useTableState, type FilterValues } from '@hig/shared/lib';
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

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const PAYMENT_STATES = ['paid', 'partial', 'unpaid'] as const satisfies readonly BookingPaymentState[];
const PAYMENT_LABELS: Record<BookingPaymentState, string> = { paid: 'Paid in full', partial: 'Partially paid', unpaid: 'Unpaid' };
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
    className: 'max-w-56',
    cell: (b) => <PersonCell name={b.patient.full_name} secondary={b.procedure?.name ?? b.package?.name ?? undefined} />,
    exportValue: (b) => b.patient.full_name,
  },
  {
    key: 'hospital',
    header: 'Hospital',
    className: 'max-w-52',
    cell: (b) => <TextCell primary={b.hospital.name} secondary={b.hospital.city} />,
    exportValue: (b) => b.hospital.name,
  },
  {
    key: 'admission',
    header: 'Admission',
    sortable: true,
    sortKey: 'admission_date',
    sortDescFirst: true,
    cell: (b) => (
      <DateCell value={b.admission_date} display="date" secondary={b.duration_days != null ? `${b.duration_days} days` : undefined} />
    ),
    exportValue: (b) => b.admission_date ?? '',
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (b) => <StatusBadgeCell status={b.status} kind="booking" />,
    exportValue: (b) => BOOKING_STATUS_LABELS[b.status],
  },
  {
    key: 'total',
    header: 'Total',
    align: 'end',
    sortable: true,
    sortKey: 'total_minor',
    sortDescFirst: true,
    cell: (b) => <MoneyCell minor={b.total_minor} currency={b.currency} secondary={b.installment_months ? <span className="whitespace-nowrap">{b.installment_months} installments</span> : undefined} />,
    exportValue: (b) => `${b.currency} ${fromMinor(b.total_minor, b.currency)}`,
  },
  {
    key: 'paid',
    header: 'Paid',
    align: 'end',
    cell: (b) => {
      const state = paymentState(b);
      return (
        <MoneyCell
          minor={b.amount_paid_minor}
          currency={b.currency}
          className={state === 'paid' ? 'text-success-ink' : state === 'partial' ? 'text-warning-ink' : undefined}
          secondary={<span className="whitespace-nowrap">{state === 'paid' ? 'Paid in full' : `Due ${formatMoneyShared(b.balance_due_minor, b.currency)}`}</span>}
        />
      );
    },
    exportValue: (b) => `${b.currency} ${fromMinor(b.amount_paid_minor, b.currency)}`,
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
// Page
// ---------------------------------------------------------------------------------------------------------
export default function BookingsPage() {
  useDocumentTitle('Bookings');
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
    { value: '', label: 'All', count: counts.data?.total },
    ...BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;

  return (
    <div>
      <PageHeader title="Bookings" description="Confirmed treatments — payment progress, admissions and discharges across every hospital." />
      <DataTable
        id="admin.bookings"
        caption="Bookings"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(b) => setSelected(b.id)}
        rowLabel={(b) => `Open booking ${b.booking_number}`}
        selectable
        bulkActions={(rows, clear) => (
          <UiButton
            size="sm"
            variant="outline"
            leftIcon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              exportCsv(rows, COLUMNS, `bookings-selected-${new Date().toISOString().slice(0, 10)}`);
              clear();
            }}
          >
            Export selected
          </UiButton>
        )}
        emptyTitle="No bookings yet"
        emptyDescription="Bookings appear here once a patient accepts a quote and books an admission date."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Booking status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Booking number or patient…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="bookings"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => bookingsApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
            more={
              <AmountRangeFilter
                label="Total"
                currency="INR"
                value={{ min: filters.min_total, max: filters.max_total }}
                onChange={({ min, max }) => setFilters({ min_total: min, max_total: max })}
              />
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label="Hospital"
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital_id}
              onChange={(v) => setFilter('hospital_id', v)}
              options={hospitals.data ?? []}
              loading={hospitals.isLoading}
              searchable
            />
            <MultiSelectFilter
              label="Payment"
              icon={<Wallet className="size-3.5 opacity-70" aria-hidden />}
              value={filters.payment}
              onChange={(v) => setFilter('payment', v)}
              options={PAYMENT_STATES.map((p) => ({
                value: p,
                label: PAYMENT_LABELS[p],
                tone: p === 'paid' ? 'success' : p === 'partial' ? 'warning' : 'neutral',
              }))}
            />
            <DateRangeFilter
              label="Date"
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'admission', label: 'Admission' },
                { value: 'created', label: 'Booked' },
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

function bookingTrack(b: BookingOut): { steps: TrackStep[]; current: number; terminal: { label: string; at?: string | null } | null } {
  const steps: TrackStep[] = [
    { key: 'booked', label: 'Booked', at: formatDate(b.created_at, 'd MMM') },
    { key: 'confirmed', label: 'Deposit paid', at: b.confirmed_at ? formatDate(b.confirmed_at, 'd MMM') : null },
    { key: 'admitted', label: 'Admitted', at: b.admitted_at ? formatDate(b.admitted_at, 'd MMM') : null },
    { key: 'completed', label: 'Completed', at: b.completed_at ? formatDate(b.completed_at, 'd MMM') : null },
  ];
  const reached = b.completed_at ? 3 : b.admitted_at ? 2 : b.confirmed_at ? 1 : 0;
  const current = b.status === 'completed' ? 3 : b.status === 'admitted' ? 2 : b.status === 'confirmed' ? 1 : b.status === 'pending_payment' ? 0 : reached;
  const terminal = b.status === 'cancelled' ? { label: 'Cancelled', at: b.cancelled_at ? formatDate(b.cancelled_at, 'd MMM') : null } : null;
  return { steps, current, terminal };
}

function BookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
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
    success: 'Booking cancelled; refundable amount computed per refund policy',
    invalidate,
    onSuccess: () => setDialog(null),
  });

  const actions =
    b && perms.manageBookings ? (
      <>
        {b.status === 'confirmed' && (
          <Button size="sm" icon={<BedDouble className="size-4" />} onClick={() => setDialog('admit')}>
            Mark admitted
          </Button>
        )}
        {b.status === 'admitted' && (
          <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => setDialog('complete')}>
            Mark completed
          </Button>
        )}
        {(b.status === 'pending_payment' || b.status === 'confirmed') && (
          <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400" icon={<XCircle className="size-4" />} onClick={() => setDialog('cancel')}>
            Cancel booking
          </Button>
        )}
      </>
    ) : null;
  const track = b ? bookingTrack(b) : null;
  const paidPct = b && b.total_minor > 0 ? Math.min(100, Math.round((b.amount_paid_minor / b.total_minor) * 100)) : 0;

  return (
    <Drawer
      open={!!bookingId}
      onClose={onClose}
      width="xl"
      title={b ? `Booking ${b.booking_number}` : 'Booking'}
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
                {b.insurance_claim_requested && <UiBadge tone="info">Insurance claim</UiBadge>}
              </>
            }
            meta={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Admission <strong className="font-medium text-fg">{formatDate(b.admission_date)}</strong>
                  {b.duration_days != null ? ` · ${b.duration_days} days` : ''}
                </span>
                <Link to={opsPaths.case(b.case_id)} className="font-medium text-primary-ink hover:underline">
                  Open case →
                </Link>
              </span>
            }
            actions={actions}
          >
            {track && <StatusTrack steps={track.steps} current={track.current} terminal={track.terminal} />}
          </DrawerSummary>

          {b.status === 'cancelled' && (
            <Banner tone="danger" icon={<XCircle className="size-4" aria-hidden />} title={`Cancelled ${formatDateTime(b.cancelled_at)}`}>
              {b.cancel_reason ?? 'No reason recorded.'}
            </Banner>
          )}

          <Panel title="Payment" description={`${PAYMENT_OPTION_LABELS[b.payment_option]}${b.installment_months ? ` · ${b.installment_months} monthly installments` : ''}`}>
            <StatTiles
              items={[
                { label: 'Total', value: formatMoney(b.total_minor, b.currency) },
                { label: 'Paid', value: formatMoney(b.amount_paid_minor, b.currency), tone: paidPct >= 100 ? 'success' : undefined, hint: `${paidPct}% of total` },
                { label: 'Balance due', value: formatMoney(b.balance_due_minor, b.currency), tone: b.balance_due_minor > 0 ? 'warning' : 'success' },
                { label: 'Refunded', value: formatMoney(b.amount_refunded_minor, b.currency), tone: b.amount_refunded_minor > 0 ? 'danger' : undefined },
              ]}
            />
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Paid" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100}>
              <div className={paidPct >= 100 ? 'h-full bg-success' : 'h-full bg-primary'} style={{ width: `${paidPct}%` }} />
            </div>
            <div className="mt-4">
              <FieldGrid
                columns={3}
                items={[
                  { label: 'Subtotal', value: formatMoney(b.subtotal_minor, b.currency) },
                  { label: 'Discount', value: b.discount_minor ? `− ${formatMoney(b.discount_minor, b.currency)}` : '—' },
                  { label: 'Service fee', value: formatMoney(b.service_fee_minor, b.currency) },
                  { label: 'Tax', value: formatMoney(b.tax_minor, b.currency) },
                  { label: 'Deposit', value: formatMoney(b.deposit_minor, b.currency) },
                ]}
              />
            </div>
          </Panel>

          <Panel title="Treatment">
            <FieldGrid
              columns={3}
              items={[
                { label: 'Procedure', value: b.procedure?.name ?? '—' },
                { label: 'Package', value: b.package?.name ?? '—' },
                { label: 'Doctor', value: b.doctor?.full_name ?? '—' },
                { label: 'Admission', value: formatDate(b.admission_date) },
                { label: 'Discharge', value: formatDate(b.discharge_date) },
                { label: 'Duration', value: b.duration_days != null ? `${b.duration_days} days` : '—' },
                { label: 'Confirmed', value: formatDateTime(b.confirmed_at) },
                { label: 'Admitted', value: formatDateTime(b.admitted_at) },
                { label: 'Completed', value: formatDateTime(b.completed_at) },
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
        title="Cancel booking"
        description="Refunds are calculated by the server from the refund policy and processed by Finance."
        confirmLabel="Cancel booking"
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
  const state = paymentState(b);
  return (
    <UiBadge tone={state === 'paid' ? 'success' : state === 'partial' ? 'warning' : 'neutral'} dot>
      {PAYMENT_LABELS[state]}
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
    success: kind === 'admit' ? 'Patient marked as admitted' : 'Treatment marked completed; settlement items will be created',
    invalidate: [opsKeys.bookings, opsKeys.cases, opsKeys.dashboard],
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={kind === 'admit' ? 'Mark patient admitted' : 'Mark treatment completed'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={run.isPending} onClick={() => run.mutate()}>
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {kind === 'admit'
            ? 'Normally done by the hospital. Use this when the hospital confirms admission by phone.'
            : 'Completing recognises revenue and creates hospital/agent settlement items. This cannot be undone.'}
        </p>
        {kind === 'complete' && (
          <Field label="Discharge date">
            {(id) => <Input id={id} type="date" value={discharge} onChange={(e) => setDischarge(e.target.value)} />}
          </Field>
        )}
        <Field label="Note">
          {(id) => <Textarea id={id} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function Checklist({ bookingId, canEdit }: { bookingId: string; canEdit: boolean }) {
  const q = useQuery({
    queryKey: [...opsKeys.bookings, 'checklist', bookingId],
    queryFn: () => bookingsApi.checklist(bookingId),
  });
  const update = useOpsMutation({
    mutationFn: (v: { itemId: string; status: ChecklistStatus }) =>
      bookingsApi.updateChecklistItem(bookingId, v.itemId, { status: v.status }),
    success: 'Checklist updated',
    invalidate: [[...opsKeys.bookings, 'checklist', bookingId]],
  });
  const items = [...(q.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const done = items.filter((i) => i.status === 'done').length;
  return (
    <Panel
      title="Pre-arrival checklist"
      description={items.length ? `${done} of ${items.length} done` : undefined}
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
        <p className="text-sm text-muted">No checklist yet.</p>
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
                  aria-label={`Status of ${item.label}`}
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
    success: 'Itinerary item added',
    invalidate: [key],
    onSuccess: () => {
      setAdding(false);
      setForm({ kind: 'appointment', title: '', starts_at: '', location: '', description: '' });
    },
  });
  const remove = useOpsMutation({
    mutationFn: (itemId: string) => bookingsApi.deleteItineraryItem(bookingId, itemId),
    success: 'Itinerary item removed',
    invalidate: [key],
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim() && fromDateTimeLocal(form.starts_at)) add.mutate();
  };

  const columns: DataTableColumn<ItineraryItemOut>[] = [
    {
      key: 'starts_at',
      header: 'When',
      sortable: true,
      mobile: 'secondary',
      cell: (it) => <DateCell value={it.starts_at} display="datetime" />,
    },
    {
      key: 'title',
      header: 'Item',
      sortable: true,
      mobile: 'primary',
      className: 'max-w-64',
      cell: (it) => <TextCell primary={<span className="font-medium">{it.title}</span>} secondary={[ITINERARY_KIND_LABELS[it.kind], it.location].filter(Boolean).join(' · ')} />,
    },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (it) => <StatusBadgeCell status={it.status} kind="itinerary" /> },
    ...(canEdit
      ? [
          {
            key: '_remove',
            header: <span className="sr-only">Remove</span>,
            title: 'Remove',
            align: 'end' as const,
            hideable: false,
            cell: (it: ItineraryItemOut) => (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${it.title}`}
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
      title="Itinerary"
      bodyClassName="p-0"
      actions={
        canEdit && (
          <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-3.5" />} onClick={() => setAdding(true)}>
            Add item
          </Button>
        )
      }
    >
      <DataTable
        caption="Itinerary"
        columns={columns}
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        defaultSort={{ key: 'starts_at', direction: 'asc' }}
        density="compact"
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle="No itinerary items"
        emptyDescription="Appointments, transfers and check-ins planned for this stay appear here."
      />
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add itinerary item"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="itinerary-form"
              loading={add.isPending}
              disabled={!form.title.trim() || !form.starts_at}
            >
              Add
            </Button>
          </>
        }
      >
        <form id="itinerary-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Kind" required>
            {(id) => (
              <Select
                id={id}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as ItineraryKind })}
                options={enumOptions(ITINERARY_KINDS, ITINERARY_KIND_LABELS)}
              />
            )}
          </Field>
          <Field label="Starts at" required>
            {(id) => (
              <Input id={id} type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            )}
          </Field>
          <Field label="Title" required className="sm:col-span-2">
            {(id) => <Input id={id} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label="Location" className="sm:col-span-2">
            {(id) => <Input id={id} value={form.location} maxLength={300} onChange={(e) => setForm({ ...form, location: e.target.value })} />}
          </Field>
          <Field label="Description" className="sm:col-span-2">
            {(id) => (
              <Textarea id={id} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            )}
          </Field>
        </form>
      </Modal>
    </Panel>
  );
}
