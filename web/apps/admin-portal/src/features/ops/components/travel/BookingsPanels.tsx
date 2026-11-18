import { useEffect, useMemo, useState } from 'react';
import {
  adminApi,
  enumOptions,
  SERVICE_BOOKING_STATUSES,
  SERVICE_BOOKING_STATUS_LABELS,
  SERVICE_KINDS,
  SERVICE_KIND_LABELS,
  TRAVEL_KINDS,
  TRAVEL_KIND_LABELS,
  travelApi,
  type AccommodationBookingOut,
  type ServiceBookingOut,
  type ServiceBookingStatus,
  type TravelBookingOut,
  type TravelKind,
} from '@hig/shared/api';
import { fromMinor } from '@hig/shared/lib';
import { Badge, DateCell, MoneyCell, StatusBadgeCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import { MoneyInput, moneyValueFrom, moneyValueToMinor, type MoneyValue } from '../MoneyInput';
import { formatDate, formatMoney, fromDateTimeLocal, toDateTimeLocal } from '../../lib/format';
import { opsKeys, useOpsMutation } from '../../lib/mutations';
import { useAppTranslation } from '../../../../i18n';
import { PatientCaseCell, TravelListPanel } from './TravelListPanel';

type T = ReturnType<typeof useAppTranslation>['t'];

const statusOptions = enumOptions(SERVICE_BOOKING_STATUSES, SERVICE_BOOKING_STATUS_LABELS);
const QUICK = ['requested', 'quoted', 'confirmed', 'completed', 'cancelled'] as const;
const requestedRow = (r: { status: string }) => (r.status === 'requested' ? 'bg-warning-soft/40' : undefined);
const money = (minor: number | null | undefined, currency: string | null | undefined) =>
  minor != null && currency ? `${currency} ${fromMinor(minor, currency)}` : '';

function SaveFooter({ onClose, onSave, loading }: { onClose: () => void; onSave: () => void; loading: boolean }) {
  const { t } = useAppTranslation();
  return (
    <>
      <Button variant="outline" onClick={onClose}>
        {t('travel.common.cancel')}
      </Button>
      <Button loading={loading} onClick={onSave}>
        {t('travel.common.save')}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Flights & transfers
// ---------------------------------------------------------------------------------------------------------
const travelColumns = (t: T): DataTableColumn<TravelBookingOut>[] => [
  {
    key: 'patient',
    header: t('travel.bookings.columns.patient'),
    sticky: true,
    mobile: 'primary',
    className: 'max-w-56',
    cell: (b) => <PatientCaseCell name={b.patient?.full_name} caseId={b.case_id} caseNumber={b.case_number} />,
    exportValue: (b) => b.patient?.full_name ?? '',
  },
  {
    key: 'kind',
    header: t('travel.bookings.columns.type'),
    mobile: 'secondary',
    cell: (b) => <Badge tone="info">{TRAVEL_KIND_LABELS[b.kind] ?? b.kind}</Badge>,
    mobileCell: (b) => TRAVEL_KIND_LABELS[b.kind] ?? b.kind,
    exportValue: (b) => TRAVEL_KIND_LABELS[b.kind] ?? b.kind,
  },
  {
    key: 'route',
    header: t('travel.bookings.columns.route'),
    className: 'max-w-64',
    cell: (b) => <TextCell primary={`${b.from_location ?? '?'} → ${b.to_location ?? '?'}`} secondary={[b.carrier, b.flight_number, b.pnr].filter(Boolean).join(' · ') || undefined} />,
    exportValue: (b) => `${b.from_location ?? ''} -> ${b.to_location ?? ''}`,
  },
  { key: 'depart', header: t('travel.bookings.columns.departs'), cell: (b) => <DateCell value={b.depart_at} display="datetime" />, exportValue: (b) => b.depart_at ?? '' },
  { key: 'pax', header: t('travel.bookings.columns.pax'), align: 'end', defaultHidden: true, cell: (b) => b.passengers ?? '—', exportValue: (b) => b.passengers ?? '' },
  {
    key: 'price',
    header: t('travel.bookings.columns.price'),
    align: 'end',
    cell: (b) => <MoneyCell minor={b.price_minor} currency={b.currency} />,
    exportValue: (b) => money(b.price_minor, b.currency),
  },
  {
    key: 'status',
    header: t('travel.bookings.columns.status'),
    mobile: 'badge',
    cell: (b) => <StatusBadgeCell status={b.status} kind="serviceBooking" />,
    exportValue: (b) => SERVICE_BOOKING_STATUS_LABELS[b.status],
  },
];

export function TravelBookingsPanel({ canManage }: { canManage: boolean }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => travelColumns(t), [t]);
  const [editing, setEditing] = useState<TravelBookingOut | null>(null);
  return (
    <>
      <TravelListPanel<TravelBookingOut>
        resource="travel"
        name="flights"
        caption={t('travel.bookings.flights.caption')}
        fetchPage={(p) => travelApi.listTravelBookings(p)}
        columns={columns}
        statuses={SERVICE_BOOKING_STATUSES}
        quickStatuses={QUICK}
        statusLabels={SERVICE_BOOKING_STATUS_LABELS}
        statusKind="serviceBooking"
        kinds={{ label: t('travel.bookings.columns.type'), options: TRAVEL_KINDS.map((k) => ({ value: k, label: TRAVEL_KIND_LABELS[k] })) }}
        dateLabel={t('travel.bookings.flights.dateLabel')}
        onRowClick={canManage ? setEditing : undefined}
        rowLabel={(b) => (b.patient?.full_name ? t('travel.bookings.flights.rowLabel', { kind: TRAVEL_KIND_LABELS[b.kind], name: b.patient.full_name }) : t('travel.bookings.flights.rowLabelNoName', { kind: TRAVEL_KIND_LABELS[b.kind] }))}
        rowClassName={requestedRow}
        emptyTitle={t('travel.bookings.flights.emptyTitle')}
        emptyDescription={t('travel.bookings.flights.emptyDescription')}
      />
      <TravelBookingModal booking={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function TravelBookingModal({ booking, onClose }: { booking: TravelBookingOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [f, setF] = useState({
    status: 'requested' as ServiceBookingStatus,
    kind: 'flight' as TravelKind,
    from_location: '',
    to_location: '',
    depart_at: '',
    arrive_at: '',
    carrier: '',
    flight_number: '',
    pnr: '',
    passengers: '',
    notes: '',
  });
  const [price, setPrice] = useState<MoneyValue>({ amount: '', currency: 'INR' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!booking) return;
    setF({
      status: booking.status,
      kind: booking.kind,
      from_location: booking.from_location ?? '',
      to_location: booking.to_location ?? '',
      depart_at: toDateTimeLocal(booking.depart_at),
      arrive_at: toDateTimeLocal(booking.arrive_at),
      carrier: booking.carrier ?? '',
      flight_number: booking.flight_number ?? '',
      pnr: booking.pnr ?? '',
      passengers: booking.passengers?.toString() ?? '',
      notes: booking.notes ?? '',
    });
    setPrice(moneyValueFrom(booking.price_minor, booking.currency));
    setError(null);
  }, [booking]);

  const save = useOpsMutation({
    mutationFn: (priceMinor: number | null) =>
      travelApi.updateTravelBooking(booking!.id, {
        status: f.status,
        // `kind` is fixed at creation (TravelBookingUpdate forbids it)
        from_location: f.from_location.trim() || null,
        to_location: f.to_location.trim() || null,
        depart_at: fromDateTimeLocal(f.depart_at),
        arrive_at: fromDateTimeLocal(f.arrive_at),
        carrier: f.carrier.trim() || null,
        flight_number: f.flight_number.trim() || null,
        pnr: f.pnr.trim() || null,
        passengers: f.passengers ? Number(f.passengers) : null,
        notes: f.notes.trim() || null,
        price_minor: priceMinor,
        currency: priceMinor == null ? null : price.currency,
      }),
    success: t('travel.bookings.flights.updated'),
    invalidate: [opsKeys.travel],
    onSuccess: onClose,
  });
  const submit = () => {
    const minor = moneyValueToMinor(price);
    if (minor === undefined) return setError(t('travel.bookings.errors.price'));
    if (f.passengers && (!Number.isInteger(Number(f.passengers)) || Number(f.passengers) < 1)) return setError(t('travel.bookings.errors.passengers'));
    setError(null);
    save.mutate(minor);
  };
  const text = (k: keyof typeof f, label: string, max = 120) => (
    <Field label={label}>
      {(id) => <Input id={id} value={f[k]} maxLength={max} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      size="lg"
      title={t('travel.bookings.modalTitle', { kind: booking ? TRAVEL_KIND_LABELS[booking.kind] : t('travel.bookings.flights.fallbackKind'), name: booking?.patient?.full_name ?? '' })}
      footer={<SaveFooter onClose={onClose} onSave={submit} loading={save.isPending} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('travel.bookings.columns.status')} required>
          {(id) => (
            <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ServiceBookingStatus })} options={statusOptions} />
          )}
        </Field>
        <Field label={t('travel.bookings.columns.type')} required>
          {(id) => (
            <Select
              id={id}
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value as TravelKind })}
              options={enumOptions(TRAVEL_KINDS, TRAVEL_KIND_LABELS)}
            />
          )}
        </Field>
        {text('from_location', t('travel.bookings.form.from'))}
        {text('to_location', t('travel.bookings.form.to'))}
        <Field label={t('travel.bookings.columns.departs')}>
          {(id) => <Input id={id} type="datetime-local" value={f.depart_at} onChange={(e) => setF({ ...f, depart_at: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.form.arrives')}>
          {(id) => <Input id={id} type="datetime-local" value={f.arrive_at} onChange={(e) => setF({ ...f, arrive_at: e.target.value })} />}
        </Field>
        {text('carrier', t('travel.bookings.form.carrier'))}
        {text('flight_number', t('travel.bookings.form.flightNumber'), 20)}
        {text('pnr', t('travel.bookings.form.pnr'), 40)}
        <Field label={t('travel.bookings.form.passengers')}>
          {(id) => <Input id={id} inputMode="numeric" value={f.passengers} onChange={(e) => setF({ ...f, passengers: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.columns.price')} className="sm:col-span-2" error={error}>
          {(id) => <MoneyInput id={id} value={price} onChange={setPrice} invalid={!!error} />}
        </Field>
        <Field label={t('travel.bookings.form.notes')} className="sm:col-span-2">
          {(id) => <Textarea id={id} value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------------------------------------
const stayColumns = (t: T): DataTableColumn<AccommodationBookingOut>[] => [
  {
    key: 'patient',
    header: t('travel.bookings.columns.patient'),
    sticky: true,
    mobile: 'primary',
    className: 'max-w-56',
    cell: (a) => <PatientCaseCell name={a.patient?.full_name} caseId={a.case_id} caseNumber={a.case_number} />,
    exportValue: (a) => a.patient?.full_name ?? '',
  },
  {
    key: 'provider',
    header: t('travel.bookings.columns.stay'),
    mobile: 'secondary',
    className: 'max-w-56',
    cell: (a) => <TextCell primary={a.provider?.name ?? '—'} secondary={a.provider?.city ?? undefined} />,
    mobileCell: (a) => a.provider?.name ?? '—',
    exportValue: (a) => a.provider?.name ?? '',
  },
  {
    key: 'dates',
    header: t('travel.bookings.columns.dates'),
    cell: (a) => <TextCell primary={`${formatDate(a.check_in, 'd MMM')} – ${formatDate(a.check_out)}`} secondary={a.room_type ?? undefined} />,
    exportValue: (a) => `${a.check_in} - ${a.check_out}`,
  },
  { key: 'guests', header: t('travel.bookings.columns.guests'), align: 'end', cell: (a) => a.guests, exportValue: (a) => a.guests },
  {
    key: 'total',
    header: t('travel.bookings.columns.total'),
    align: 'end',
    cell: (a) => <MoneyCell minor={a.total_minor} currency={a.currency} />,
    exportValue: (a) => money(a.total_minor, a.currency),
  },
  {
    key: 'status',
    header: t('travel.bookings.columns.status'),
    mobile: 'badge',
    cell: (a) => <StatusBadgeCell status={a.status} kind="serviceBooking" />,
    exportValue: (a) => SERVICE_BOOKING_STATUS_LABELS[a.status],
  },
];

export function AccommodationPanel({ canManage }: { canManage: boolean }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => stayColumns(t), [t]);
  const [editing, setEditing] = useState<AccommodationBookingOut | null>(null);
  return (
    <>
      <TravelListPanel<AccommodationBookingOut>
        resource="accommodation"
        name="accommodation"
        caption={t('travel.bookings.stays.caption')}
        fetchPage={(p) => travelApi.listAccommodationBookings(p)}
        columns={columns}
        statuses={SERVICE_BOOKING_STATUSES}
        quickStatuses={QUICK}
        statusLabels={SERVICE_BOOKING_STATUS_LABELS}
        statusKind="serviceBooking"
        dateLabel={t('travel.bookings.form.checkIn')}
        onRowClick={canManage ? setEditing : undefined}
        rowLabel={(a) => (a.patient?.full_name ? t('travel.bookings.stays.rowLabel', { name: a.patient.full_name }) : t('travel.bookings.stays.rowLabelNoName'))}
        rowClassName={requestedRow}
        emptyTitle={t('travel.bookings.stays.emptyTitle')}
        emptyDescription={t('travel.bookings.stays.emptyDescription')}
      />
      <AccommodationModal booking={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function AccommodationModal({ booking, onClose }: { booking: AccommodationBookingOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [f, setF] = useState({
    status: 'requested' as ServiceBookingStatus,
    check_in: '',
    check_out: '',
    guests: '1',
    room_type: '',
    confirmation_code: '',
    notes: '',
  });
  const [nightly, setNightly] = useState<MoneyValue>({ amount: '', currency: 'INR' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!booking) return;
    setF({
      status: booking.status,
      check_in: booking.check_in,
      check_out: booking.check_out,
      guests: String(booking.guests),
      room_type: booking.room_type ?? '',
      confirmation_code: booking.confirmation_code ?? '',
      notes: booking.notes ?? '',
    });
    const ccy = booking.currency ?? 'INR';
    setNightly(moneyValueFrom(booking.nightly_rate_minor, ccy));
    setError(null);
  }, [booking]);

  const save = useOpsMutation({
    mutationFn: (v: { nightly: number | null }) =>
      travelApi.updateAccommodationBooking(booking!.id, {
        status: f.status,
        check_in: f.check_in,
        check_out: f.check_out,
        guests: Number(f.guests),
        room_type: f.room_type.trim() || null,
        confirmation_code: f.confirmation_code.trim() || null,
        notes: f.notes.trim() || null,
        // total_minor is computed by the server (nightly rate x nights); AccommodationBookingUpdate forbids it
        nightly_rate_minor: v.nightly,
        currency: nightly.currency,
      }),
    success: t('travel.bookings.stays.updated'),
    invalidate: [opsKeys.travel],
    onSuccess: onClose,
  });
  const submit = () => {
    const n = moneyValueToMinor(nightly);
    if (n === undefined) return setError(t('travel.bookings.errors.nightlyRate'));
    if (!f.check_in || !f.check_out || f.check_out <= f.check_in) return setError(t('travel.bookings.errors.checkOut'));
    if (!Number.isInteger(Number(f.guests)) || Number(f.guests) < 1) return setError(t('travel.bookings.errors.guests'));
    setError(null);
    save.mutate({ nightly: n });
  };
  const nights =
    f.check_in && f.check_out ? Math.max(0, Math.round((Date.parse(f.check_out) - Date.parse(f.check_in)) / 86_400_000)) : 0;

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      size="lg"
      title={t('travel.bookings.stays.modalTitle', { provider: booking?.provider?.name ?? '', name: booking?.patient?.full_name ?? '' })}
      footer={<SaveFooter onClose={onClose} onSave={submit} loading={save.isPending} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('travel.bookings.columns.status')} required>
          {(id) => (
            <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ServiceBookingStatus })} options={statusOptions} />
          )}
        </Field>
        <Field label={t('travel.bookings.form.confirmationCode')}>
          {(id) => <Input id={id} value={f.confirmation_code} maxLength={60} onChange={(e) => setF({ ...f, confirmation_code: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.form.checkIn')} required>
          {(id) => <Input id={id} type="date" value={f.check_in} onChange={(e) => setF({ ...f, check_in: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.form.checkOut')} required hint={nights ? t('travel.bookings.form.nights', { count: nights }) : undefined}>
          {(id) => <Input id={id} type="date" value={f.check_out} onChange={(e) => setF({ ...f, check_out: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.columns.guests')} required>
          {(id) => <Input id={id} inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.form.roomType')}>
          {(id) => <Input id={id} value={f.room_type} maxLength={80} onChange={(e) => setF({ ...f, room_type: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.form.nightlyRate')} error={error}>
          {(id) => <MoneyInput id={id} value={nightly} onChange={setNightly} invalid={!!error} />}
        </Field>
        <Field label={t('travel.bookings.columns.total')} hint={t('travel.bookings.form.totalHint')}>
          {(id) => {
            const n = moneyValueToMinor(nightly);
            const estimate = n != null && nights > 0 ? formatMoney(n * nights, nightly.currency) : formatMoney(booking?.total_minor ?? null, booking?.currency ?? nightly.currency);
            return <Input id={id} value={estimate} readOnly disabled />;
          }}
        </Field>
        <Field label={t('travel.bookings.form.notes')} className="sm:col-span-2">
          {(id) => <Textarea id={id} value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Services (translator, guide, transport, ...)
// ---------------------------------------------------------------------------------------------------------
const serviceColumns = (t: T): DataTableColumn<ServiceBookingOut>[] => [
  {
    key: 'patient',
    header: t('travel.bookings.columns.patient'),
    sticky: true,
    mobile: 'primary',
    className: 'max-w-56',
    cell: (s) => <PatientCaseCell name={s.patient?.full_name} caseId={s.case_id} caseNumber={s.case_number} />,
    exportValue: (s) => s.patient?.full_name ?? '',
  },
  {
    key: 'kind',
    header: t('travel.bookings.columns.service'),
    mobile: 'secondary',
    cell: (s) => <Badge tone="accent">{SERVICE_KIND_LABELS[s.kind] ?? s.kind}</Badge>,
    mobileCell: (s) => SERVICE_KIND_LABELS[s.kind] ?? s.kind,
    exportValue: (s) => SERVICE_KIND_LABELS[s.kind] ?? s.kind,
  },
  {
    key: 'provider',
    header: t('travel.bookings.columns.provider'),
    cell: (s) => (s.provider?.name ? <TextCell primary={s.provider.name} /> : <Badge tone="warning">{t('travel.bookings.unassigned')}</Badge>),
    exportValue: (s) => s.provider?.name ?? t('travel.bookings.unassigned'),
  },
  { key: 'when', header: t('travel.bookings.columns.when'), cell: (s) => <DateCell value={s.starts_at} display="datetime" />, exportValue: (s) => s.starts_at ?? '' },
  {
    key: 'price',
    header: t('travel.bookings.columns.price'),
    align: 'end',
    cell: (s) => <MoneyCell minor={s.price_minor} currency={s.currency} />,
    exportValue: (s) => money(s.price_minor, s.currency),
  },
  {
    key: 'status',
    header: t('travel.bookings.columns.status'),
    mobile: 'badge',
    cell: (s) => <StatusBadgeCell status={s.status} kind="serviceBooking" />,
    exportValue: (s) => SERVICE_BOOKING_STATUS_LABELS[s.status],
  },
];

export function ServiceBookingsPanel({ canManage }: { canManage: boolean }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => serviceColumns(t), [t]);
  const [editing, setEditing] = useState<ServiceBookingOut | null>(null);
  return (
    <>
      <TravelListPanel<ServiceBookingOut>
        resource="services"
        name="services"
        caption={t('travel.bookings.services.caption')}
        fetchPage={(p) => travelApi.listServiceBookings(p)}
        columns={columns}
        statuses={SERVICE_BOOKING_STATUSES}
        quickStatuses={QUICK}
        statusLabels={SERVICE_BOOKING_STATUS_LABELS}
        statusKind="serviceBooking"
        kinds={{ label: t('travel.bookings.columns.service'), options: SERVICE_KINDS.map((k) => ({ value: k, label: SERVICE_KIND_LABELS[k] })) }}
        dateLabel={t('travel.bookings.services.dateLabel')}
        onRowClick={canManage ? setEditing : undefined}
        rowLabel={(s) => (s.patient?.full_name ? t('travel.bookings.services.rowLabel', { kind: SERVICE_KIND_LABELS[s.kind], name: s.patient.full_name }) : t('travel.bookings.services.rowLabelNoName', { kind: SERVICE_KIND_LABELS[s.kind] }))}
        rowClassName={requestedRow}
        emptyTitle={t('travel.bookings.services.emptyTitle')}
        emptyDescription={t('travel.bookings.services.emptyDescription')}
      />
      <ServiceBookingModal booking={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ServiceBookingModal({ booking, onClose }: { booking: ServiceBookingOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [f, setF] = useState({ status: 'requested' as ServiceBookingStatus, provider_id: '', starts_at: '', ends_at: '', notes: '' });
  const [price, setPrice] = useState<MoneyValue>({ amount: '', currency: 'INR' });
  const [error, setError] = useState<string | null>(null);
  const providers = useQuery({
    queryKey: ['admin', 'content', 'service-providers', booking?.kind],
    queryFn: () => adminApi.serviceProviders.list({ kind: booking!.kind }),
    enabled: !!booking,
  });
  useEffect(() => {
    if (!booking) return;
    setF({
      status: booking.status,
      provider_id: booking.provider?.id ?? '',
      starts_at: toDateTimeLocal(booking.starts_at),
      ends_at: toDateTimeLocal(booking.ends_at),
      notes: booking.notes ?? '',
    });
    setPrice(moneyValueFrom(booking.price_minor, booking.currency));
    setError(null);
  }, [booking]);

  const save = useOpsMutation({
    mutationFn: (priceMinor: number | null) =>
      travelApi.updateServiceBooking(booking!.id, {
        status: f.status,
        provider_id: f.provider_id || null,
        starts_at: fromDateTimeLocal(f.starts_at),
        ends_at: fromDateTimeLocal(f.ends_at),
        notes: f.notes.trim() || null,
        price_minor: priceMinor,
        currency: priceMinor == null ? null : price.currency,
      }),
    success: t('travel.bookings.services.updated'),
    invalidate: [opsKeys.travel],
    onSuccess: onClose,
  });
  const submit = () => {
    const minor = moneyValueToMinor(price);
    if (minor === undefined) return setError(t('travel.bookings.errors.price'));
    setError(null);
    save.mutate(minor);
  };

  return (
    <Modal
      open={!!booking}
      onClose={onClose}
      size="lg"
      title={t('travel.bookings.modalTitle', { kind: booking ? SERVICE_KIND_LABELS[booking.kind] : t('travel.bookings.columns.service'), name: booking?.patient?.full_name ?? '' })}
      footer={<SaveFooter onClose={onClose} onSave={submit} loading={save.isPending} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('travel.bookings.columns.status')} required>
          {(id) => (
            <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ServiceBookingStatus })} options={statusOptions} />
          )}
        </Field>
        <Field label={t('travel.bookings.columns.provider')}>
          {(id) => (
            <Select
              id={id}
              value={f.provider_id}
              onChange={(e) => {
                const p = providers.data?.find((x) => x.id === e.target.value);
                setF({ ...f, provider_id: e.target.value });
                if (p && price.amount === '' && p.rate_minor != null) setPrice(moneyValueFrom(p.rate_minor, p.currency));
              }}
              placeholder={providers.isLoading ? t('travel.common.loading') : t('travel.bookings.unassigned')}
              options={(providers.data ?? []).map((p) => ({
                value: p.id,
                label: `${p.name}${p.city ? ` · ${p.city}` : ''}${p.is_active === false ? ` ${t('travel.bookings.inactive')}` : ''}`,
              }))}
            />
          )}
        </Field>
        <Field label={t('travel.bookings.form.starts')}>
          {(id) => <Input id={id} type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.form.ends')}>
          {(id) => <Input id={id} type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} />}
        </Field>
        <Field label={t('travel.bookings.columns.price')} className="sm:col-span-2" error={error}>
          {(id) => <MoneyInput id={id} value={price} onChange={setPrice} invalid={!!error} />}
        </Field>
        <Field label={t('travel.bookings.form.notes')} className="sm:col-span-2">
          {(id) => <Textarea id={id} value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}
