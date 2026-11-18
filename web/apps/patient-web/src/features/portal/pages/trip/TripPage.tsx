import { useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BedDouble,
  CalendarClock,
  Car,
  Compass,
  Download,
  FileCheck2,
  Languages,
  MapPin,
  Phone,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
} from 'lucide-react';
import {
  documentsApi,
  errorMessage,
  ITINERARY_KIND_LABELS,
  SERVICE_KIND_LABELS,
  TRAVEL_KIND_LABELS,
  VISA_TYPE_LABELS,
  type BookingOut,
  type ChecklistItemOut,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import {
  qk,
  useAccommodationBookings,
  useBooking,
  useBookings,
  useChecklist,
  useCulturalTips,
  useDashboard,
  useHelplines,
  useHospital,
  useItinerary,
  useServiceBookings,
  useTravelBookings,
  useUpdateChecklistItem,
  useVisaRequests,
} from '../../api/queries';
import { BackLink, Money, StatusBadge } from '../../components/common';
import { HelplineList, SosButton, telHref } from '../../components/SupportDialogs';
import { paths } from '../../lib/paths';
import { cn, daysUntil, formatDate, formatDateTime, formatNumber, useDocumentTitle } from '../../lib/shared';
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Skeleton,
  SkeletonList,
} from '../../ui/primitives';
import { ChecklistIcon } from '../DashboardPage';
import { TravelRequestDialog, type RequestKind } from './TravelRequestDialog';

/** /app/trip -> the next upcoming booking's trip hub. */
export function TripIndexPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('trip.index.docTitle'));
  const dashboard = useDashboard();
  const bookings = useBookings({ page_size: 20 });
  if (dashboard.isPending || bookings.isPending) return <SkeletonList rows={2} />;
  const next =
    dashboard.data?.next_booking ??
    bookings.data?.items.find((b) => b.status === 'confirmed' || b.status === 'admitted' || b.status === 'pending_payment') ??
    null;
  if (next) return <Navigate to={paths.trip(next.id)} replace />;
  return (
    <div>
      <PageHeader title={t('trip.index.title')} />
      <EmptyState
        icon={<Plane className="h-8 w-8" aria-hidden />}
        title={t('trip.index.emptyTitle')}
        description={t('trip.index.emptyDescription')}
        action={<ButtonLink to={paths.cases}>{t('trip.index.goToCases')}</ButtonLink>}
      />
    </div>
  );
}

export function TripPage() {
  const { t } = useAppTranslation();
  const { bookingId = '' } = useParams();
  useDocumentTitle(t('trip.hub.title'));
  const booking = useBooking(bookingId);
  if (booking.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  return <TripHub booking={booking.data} />;
}

/** `label` is a catalog key (`trip.requests.<kind>`), translated at render time. */
const REQUEST_BUTTONS: { kind: RequestKind; label: string; icon: ReactNode }[] = [
  { kind: 'flight', label: 'trip.requests.flight', icon: <Plane className="h-5 w-5" aria-hidden /> },
  { kind: 'airport_pickup', label: 'trip.requests.airportPickup', icon: <PlaneLanding className="h-5 w-5" aria-hidden /> },
  { kind: 'airport_drop', label: 'trip.requests.airportDrop', icon: <PlaneTakeoff className="h-5 w-5" aria-hidden /> },
  { kind: 'accommodation', label: 'trip.requests.accommodation', icon: <BedDouble className="h-5 w-5" aria-hidden /> },
  { kind: 'translator', label: 'trip.requests.translator', icon: <Languages className="h-5 w-5" aria-hidden /> },
  { kind: 'local_guide', label: 'trip.requests.localGuide', icon: <Compass className="h-5 w-5" aria-hidden /> },
];

/** Checklist items the patient can tick themselves; the rest are updated by staff/hospital. */
const SELF_SERVICE_KEYS = new Set(['travel_insurance', 'documents_uploaded', 'flight_booked']);

function TripHub({ booking }: { booking: BookingOut }) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const caseFilter = { case_id: booking.case_id, page_size: 50 };
  const hospital = useHospital(booking.hospital.id);
  const checklist = useChecklist(booking.id);
  const updateItem = useUpdateChecklistItem(booking.id);
  const itinerary = useItinerary(booking.id);
  const visa = useVisaRequests(caseFilter);
  const travel = useTravelBookings(caseFilter);
  const stays = useAccommodationBookings(caseFilter);
  const services = useServiceBookings(caseFilter);
  const tips = useCulturalTips();
  const helplines = useHelplines();
  const dashboard = useDashboard();
  const [request, setRequest] = useState<RequestKind | null>(null);

  const days = daysUntil(booking.admission_date);
  const items = [...(checklist.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const done = items.filter((i) => i.status === 'done').length;
  const h = hospital.data;
  const mapHref =
    h?.lat != null && h?.lng != null
      ? `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=16/${h.lat}/${h.lng}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${booking.hospital.name}, ${booking.hospital.city}, India`)}`;
  const helpline = helplines.data?.['24x7'];
  const activeVisa = visa.data?.items.find((v) => v.status !== 'rejected');

  function toggleItem(item: ChecklistItemOut) {
    const next = item.status === 'done' ? 'pending' : 'done';
    updateItem.mutate(
      { itemId: item.id, status: next },
      { onError: (err) => toast.error(errorMessage(err, t('trip.hub.checklistUpdateFailed'))) },
    );
  }

  async function downloadInvitation(documentId: string) {
    try {
      await documentsApi.downloadAndSave({ id: documentId, file_name: 'invitation-letter.pdf' });
    } catch (err) {
      toast.error(errorMessage(err, t('trip.hub.downloadFailed')));
    }
  }

  return (
    <div className="pb-20">
      <PageHeader
        back={<BackLink to={paths.booking(booking.id)}>{t('trip.hub.backToBooking', { number: booking.booking_number })}</BackLink>}
        title={t('trip.hub.title')}
        description={`${booking.procedure?.name ?? t('trip.hub.treatment')} · ${booking.hospital.name}, ${booking.hospital.city}`}
        actions={<SosButton caseId={booking.case_id} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Countdown + map */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="grid sm:grid-cols-2">
            <div className="flex flex-col justify-center bg-gradient-to-br from-[#161B22] to-[#0B0F14] p-6 text-white">
              <p className="text-sm text-slate-300">{t('trip.hub.untilTreatment')}</p>
              {days !== null && days >= 0 ? (
                <p>
                  <span className="text-5xl font-extrabold text-violet-500">{formatNumber(days)}</span>
                  <span className="ms-2 text-lg text-slate-300">{t('trip.hub.daysUnit', { count: days })}</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-violet-400">
                  {booking.status === 'admitted' ? t('trip.hub.inTreatment') : t('trip.hub.underway')}
                </p>
              )}
              <p className="mt-2 text-sm text-slate-400">
                {t('trip.hub.admission', { date: formatDate(booking.admission_date, 'EEEE d MMMM yyyy') })}
              </p>
              <div className="mt-3">
                <StatusBadge status={booking.status} />
              </div>
            </div>
            <div className="space-y-2 p-6">
              <p className="flex items-center gap-2 font-semibold">
                <MapPin className="h-5 w-5 text-red-500" aria-hidden /> {booking.hospital.name}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{h?.address ?? booking.hospital.city}</p>
              {h?.airport_distance_km != null ? (
                <p className="text-sm text-slate-500">{t('trip.hub.airportDistance', { km: formatNumber(h.airport_distance_km) })}</p>
              ) : null}
              {h?.phone ? (
                <a href={telHref(h.phone)} className="flex items-center gap-2 text-sm text-green-700 hover:underline dark:text-green-400">
                  <Phone className="h-4 w-4" aria-hidden /> {h.phone}
                </a>
              ) : null}
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <MapPin className="h-4 w-4" aria-hidden /> {t('trip.hub.openMap')}
              </a>
            </div>
          </div>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader
            title={t('trip.hub.checklistTitle')}
            description={
              items.length ? t('trip.hub.checklistProgress', { done: formatNumber(done), total: formatNumber(items.length) }) : undefined
            }
          />
          <CardBody className="space-y-3">
            {checklist.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : checklist.isError ? (
              <ErrorState error={checklist.error} onRetry={() => void checklist.refetch()} />
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-500">{t('trip.hub.checklistEmpty')}</p>
            ) : (
              <>
                <ProgressBar value={(done / items.length) * 100} tone="violet" />
                <ul className="space-y-2">
                  {items.map((item) => {
                    const editable = SELF_SERVICE_KEYS.has(item.key);
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm">
                          <ChecklistIcon status={item.status} />
                          <span className={cn(item.status !== 'done' && 'text-slate-500 dark:text-slate-400')}>{item.label}</span>
                        </span>
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => toggleItem(item)}
                            disabled={updateItem.isPending}
                            className="text-xs font-semibold text-violet-600 hover:underline disabled:opacity-50 dark:text-violet-400"
                          >
                            {item.status === 'done' ? t('trip.hub.undo') : t('trip.hub.markDone')}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardBody>
        </Card>

        {/* Requests */}
        <Card className="lg:col-span-3">
          <CardHeader title={t('trip.hub.travelTitle')} description={t('trip.hub.travelDescription')} />
          <CardBody className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {REQUEST_BUTTONS.map((b) => (
                <button
                  key={b.kind}
                  type="button"
                  onClick={() => setRequest(b.kind)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-sm font-medium transition hover:border-violet-400 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-800"
                >
                  <span className="text-violet-600 dark:text-violet-400">{b.icon}</span>
                  {t(b.label)}
                </button>
              ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Visa */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <FileCheck2 className="h-5 w-5 text-green-600" aria-hidden /> {t('trip.hub.visa')}
                </h3>
                {visa.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : visa.isError ? (
                  <ErrorState error={visa.error} onRetry={() => void visa.refetch()} />
                ) : visa.data.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700">
                    <p>{t('trip.hub.visaIntro')}</p>
                    <Button size="sm" className="mt-3" onClick={() => setRequest('visa')}>
                      {t('trip.hub.requestVisa')}
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {visa.data.items.map((v) => (
                      <li key={v.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{VISA_TYPE_LABELS[v.visa_type]}</span>
                          <StatusBadge status={v.status} />
                        </div>
                        {v.application_reference ? (
                          <p className="text-xs text-slate-500">{t('trip.hub.reference', { ref: v.application_reference })}</p>
                        ) : null}
                        {v.invitation_letter_document_id ? (
                          <button
                            type="button"
                            onClick={() => void downloadInvitation(v.invitation_letter_document_id as string)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-400"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden /> {t('trip.hub.invitationLetter')}
                          </button>
                        ) : null}
                        {v.notes ? <p className="mt-1 text-xs text-slate-500">{v.notes}</p> : null}
                      </li>
                    ))}
                    {!activeVisa || visa.data.items.every((v) => v.visa_type !== 'e_medical_attendant') ? (
                      <li>
                        <button type="button" onClick={() => setRequest('visa')} className="text-sm font-semibold text-violet-600 hover:underline">
                          {t('trip.hub.addVisaRequest')}
                        </button>
                      </li>
                    ) : null}
                  </ul>
                )}
              </div>

              {/* Transport */}
              <ServiceList
                title={t('trip.hub.flightsTitle')}
                icon={<Car className="h-5 w-5 text-green-600" aria-hidden />}
                loading={travel.isPending}
                error={travel.error}
                empty={t('trip.hub.flightsEmpty')}
                items={(travel.data?.items ?? []).map((tb) => ({
                  id: tb.id,
                  title: TRAVEL_KIND_LABELS[tb.kind],
                  status: tb.status,
                  lines: [
                    [tb.from_location, tb.to_location].filter(Boolean).join(t('trip.hub.routeSeparator')),
                    tb.depart_at
                      ? t('trip.hub.departs', { date: formatDateTime(tb.depart_at) })
                      : tb.arrive_at
                        ? t('trip.hub.arrives', { date: formatDateTime(tb.arrive_at) })
                        : '',
                    [tb.carrier, tb.flight_number, tb.pnr ? t('trip.hub.pnr', { pnr: tb.pnr }) : null].filter(Boolean).join(' · '),
                  ],
                  price: tb.price_minor != null && tb.currency ? <Money minor={tb.price_minor} currency={tb.currency} trim /> : null,
                }))}
              />

              {/* Stay */}
              <ServiceList
                title={t('trip.hub.accommodationTitle')}
                icon={<BedDouble className="h-5 w-5 text-green-600" aria-hidden />}
                loading={stays.isPending}
                error={stays.error}
                empty={t('trip.hub.accommodationEmpty')}
                items={(stays.data?.items ?? []).map((s) => ({
                  id: s.id,
                  title: s.provider?.name ?? t('trip.hub.accommodationTitle'),
                  status: s.status,
                  lines: [
                    `${formatDate(s.check_in)} - ${formatDate(s.check_out)} · ${t('trip.hub.guests', { count: s.guests, n: formatNumber(s.guests) })}`,
                    s.provider?.address ?? '',
                    s.confirmation_code ? t('trip.hub.confirmation', { code: s.confirmation_code }) : '',
                  ],
                  price: s.total_minor != null && s.currency ? <Money minor={s.total_minor} currency={s.currency} trim /> : null,
                }))}
              />

              {/* Services */}
              <ServiceList
                title={t('trip.hub.servicesTitle')}
                icon={<Languages className="h-5 w-5 text-green-600" aria-hidden />}
                loading={services.isPending}
                error={services.error}
                empty={t('trip.hub.servicesEmpty')}
                items={(services.data?.items ?? []).map((s) => ({
                  id: s.id,
                  title: `${SERVICE_KIND_LABELS[s.kind]}${s.provider ? ` · ${s.provider.name}` : ''}`,
                  status: s.status,
                  lines: [
                    s.starts_at ? `${formatDateTime(s.starts_at)}${s.ends_at ? ` - ${formatDateTime(s.ends_at)}` : ''}` : '',
                    s.provider?.phone ?? '',
                    s.notes ?? '',
                  ],
                  price: s.price_minor != null && s.currency ? <Money minor={s.price_minor} currency={s.currency} trim /> : null,
                }))}
              />
            </div>
          </CardBody>
        </Card>

        {/* Itinerary */}
        <Card className="lg:col-span-2">
          <CardHeader title={t('trip.hub.itineraryTitle')} description={t('trip.hub.itineraryDescription')} />
          <CardBody>
            {itinerary.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : itinerary.isError ? (
              <ErrorState error={itinerary.error} onRetry={() => void itinerary.refetch()} />
            ) : itinerary.data.length === 0 ? (
              <p className="text-sm text-slate-500">{t('trip.hub.itineraryEmpty')}</p>
            ) : (
              <ol className="relative space-y-5 border-s border-slate-200 ps-6 dark:border-slate-800">
                {[...itinerary.data]
                  .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                  .map((item) => (
                    <li key={item.id} className="relative">
                      <span
                        className={cn(
                          'absolute -start-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-[#161B22]',
                          item.status === 'done' ? 'bg-green-500' : item.status === 'cancelled' ? 'bg-slate-400' : 'bg-violet-500',
                        )}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn('font-medium', item.status === 'cancelled' && 'line-through opacity-60')}>{item.title}</p>
                        <span className="text-xs text-slate-500">{ITINERARY_KIND_LABELS[item.kind]}</span>
                        {item.status !== 'scheduled' ? <StatusBadge status={item.status} /> : null}
                      </div>
                      <p className="flex items-center gap-1 text-sm text-slate-500">
                        <CalendarClock className="h-4 w-4" aria-hidden />
                        {formatDateTime(item.starts_at)}
                        {item.ends_at ? ` - ${formatDateTime(item.ends_at, 'HH:mm')}` : ''}
                      </p>
                      {item.location ? (
                        <a
                          href={
                            item.lat != null && item.lng != null
                              ? `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=17/${item.lat}/${item.lng}`
                              : `https://www.openstreetmap.org/search?query=${encodeURIComponent(item.location)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-green-700 hover:underline dark:text-green-400"
                        >
                          {item.location}
                        </a>
                      ) : null}
                      {item.description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.description}</p> : null}
                    </li>
                  ))}
              </ol>
            )}
          </CardBody>
        </Card>

        {/* Helplines */}
        <Card>
          <CardHeader title={t('trip.hub.helpTitle')} />
          <CardBody>
            <HelplineList coordinator={dashboard.data?.coordinator} />
          </CardBody>
        </Card>

        {/* Cultural tips */}
        <Card className="lg:col-span-3">
          <CardHeader title={t('trip.hub.tipsTitle')} description={t('trip.hub.tipsDescription')} />
          <CardBody>
            {tips.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : tips.isError ? (
              <ErrorState error={tips.error} onRetry={() => void tips.refetch()} />
            ) : tips.data.length === 0 ? (
              <p className="text-sm text-slate-500">{t('trip.hub.tipsEmpty')}</p>
            ) : (
              <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
                {[...tips.data]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((tip) => (
                    <article
                      key={tip.id}
                      className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
                    >
                      {tip.image_url ? (
                        <img src={tip.image_url} alt="" className="h-32 w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-2 bg-gradient-to-r from-[#7B2FF7] via-[#2563EB] to-[#06B6D4]" aria-hidden />
                      )}
                      <div className="p-4">
                        <p className="font-semibold">{tip.title}</p>
                        <p className="mt-1 line-clamp-4 text-sm text-slate-600 dark:text-slate-400">{tip.body}</p>
                      </div>
                    </article>
                  ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Floating actions (mobile) */}
      <div className="fixed bottom-20 end-4 z-20 flex flex-col items-end gap-2 lg:hidden">
        {helpline ? (
          <a href={telHref(helpline)} className="inline-flex items-center gap-2 rounded-full bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
            <Phone className="h-4 w-4" aria-hidden /> {t('trip.hub.callHelpline')}
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setRequest('translator')}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          <Languages className="h-4 w-4" aria-hidden /> {t('trip.hub.getTranslator')}
        </button>
        <button
          type="button"
          onClick={() => setRequest('local_guide')}
          className="inline-flex items-center gap-2 rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          <Compass className="h-4 w-4" aria-hidden /> {t('trip.requests.localGuide')}
        </button>
      </div>

      <TravelRequestDialog
        kind={request}
        onClose={() => {
          setRequest(null);
          void qc.invalidateQueries({ queryKey: qk.checklist(booking.id) });
        }}
        caseId={booking.case_id}
        hospitalId={booking.hospital.id}
        hospitalCity={booking.hospital.city}
        admissionDate={booking.admission_date}
      />
    </div>
  );
}

function ServiceList({
  title,
  icon,
  loading,
  error,
  empty,
  items,
}: {
  title: string;
  icon: ReactNode;
  loading: boolean;
  error: unknown;
  empty: string;
  items: { id: string; title: string; status: string; lines: string[]; price: ReactNode }[];
}) {
  const { t } = useAppTranslation();
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        {icon} {title}
      </h3>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-sm text-red-600">{t('trip.hub.loadFailed')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{i.title}</span>
                <span className="flex items-center gap-2">
                  {i.price}
                  <StatusBadge status={i.status} />
                </span>
              </div>
              {i.lines.filter(Boolean).map((line, idx) => (
                <p key={idx} className="text-xs text-slate-500">
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
