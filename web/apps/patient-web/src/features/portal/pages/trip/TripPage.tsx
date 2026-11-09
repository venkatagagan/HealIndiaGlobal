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
import { cn, daysUntil, formatDate, formatDateTime, useDocumentTitle } from '../../lib/shared';
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
  useDocumentTitle('Trip');
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
      <PageHeader title="Your trip" />
      <EmptyState
        icon={<Plane className="h-8 w-8" aria-hidden />}
        title="No upcoming trip"
        description="When you book treatment, your visa, flights, pickup, stay and itinerary are organised here."
        action={<ButtonLink to={paths.cases}>Go to my cases</ButtonLink>}
      />
    </div>
  );
}

export function TripPage() {
  const { bookingId = '' } = useParams();
  useDocumentTitle('Trip hub');
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

const REQUEST_BUTTONS: { kind: RequestKind; label: string; icon: ReactNode }[] = [
  { kind: 'flight', label: 'Flight', icon: <Plane className="h-5 w-5" aria-hidden /> },
  { kind: 'airport_pickup', label: 'Airport pickup', icon: <PlaneLanding className="h-5 w-5" aria-hidden /> },
  { kind: 'airport_drop', label: 'Airport drop', icon: <PlaneTakeoff className="h-5 w-5" aria-hidden /> },
  { kind: 'accommodation', label: 'Accommodation', icon: <BedDouble className="h-5 w-5" aria-hidden /> },
  { kind: 'translator', label: 'Translator', icon: <Languages className="h-5 w-5" aria-hidden /> },
  { kind: 'local_guide', label: 'Local guide', icon: <Compass className="h-5 w-5" aria-hidden /> },
];

/** Checklist items the patient can tick themselves; the rest are updated by staff/hospital. */
const SELF_SERVICE_KEYS = new Set(['travel_insurance', 'documents_uploaded', 'flight_booked']);

function TripHub({ booking }: { booking: BookingOut }) {
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
      { onError: (err) => toast.error(errorMessage(err, 'Could not update the checklist.')) },
    );
  }

  async function downloadInvitation(documentId: string) {
    try {
      await documentsApi.downloadAndSave({ id: documentId, file_name: 'invitation-letter.pdf' });
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed.'));
    }
  }

  return (
    <div className="pb-20">
      <PageHeader
        back={<BackLink to={paths.booking(booking.id)}>Booking {booking.booking_number}</BackLink>}
        title="Trip hub"
        description={`${booking.procedure?.name ?? 'Treatment'} · ${booking.hospital.name}, ${booking.hospital.city}`}
        actions={<SosButton caseId={booking.case_id} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Countdown + map */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="grid sm:grid-cols-2">
            <div className="flex flex-col justify-center bg-gradient-to-br from-[#161B22] to-[#0B0F14] p-6 text-white">
              <p className="text-sm text-slate-300">Until treatment</p>
              {days !== null && days >= 0 ? (
                <p>
                  <span className="text-5xl font-extrabold text-violet-500">{days}</span>
                  <span className="ml-2 text-lg text-slate-300">days</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-violet-400">{booking.status === 'admitted' ? 'In treatment' : 'Underway'}</p>
              )}
              <p className="mt-2 text-sm text-slate-400">Admission {formatDate(booking.admission_date, 'EEEE d MMMM yyyy')}</p>
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
                <p className="text-sm text-slate-500">{h.airport_distance_km} km from the airport</p>
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
                <MapPin className="h-4 w-4" aria-hidden /> Open map
              </a>
            </div>
          </div>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader title="Pre-arrival checklist" description={items.length ? `${done} of ${items.length} done` : undefined} />
          <CardBody className="space-y-3">
            {checklist.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : checklist.isError ? (
              <ErrorState error={checklist.error} onRetry={() => void checklist.refetch()} />
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-500">Your checklist is created when the booking is confirmed.</p>
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
                            {item.status === 'done' ? 'Undo' : 'Mark done'}
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
          <CardHeader title="Travel & stay" description="Request services - your coordinator confirms details and prices." />
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
                  {b.label}
                </button>
              ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Visa */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <FileCheck2 className="h-5 w-5 text-green-600" aria-hidden /> Visa
                </h3>
                {visa.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : visa.isError ? (
                  <ErrorState error={visa.error} onRetry={() => void visa.refetch()} />
                ) : visa.data.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700">
                    <p>Most international patients need an India e-Medical visa. We provide the hospital invitation letter.</p>
                    <Button size="sm" className="mt-3" onClick={() => setRequest('visa')}>
                      Request visa support
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
                        {v.application_reference ? <p className="text-xs text-slate-500">Ref. {v.application_reference}</p> : null}
                        {v.invitation_letter_document_id ? (
                          <button
                            type="button"
                            onClick={() => void downloadInvitation(v.invitation_letter_document_id as string)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline dark:text-green-400"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden /> Invitation letter
                          </button>
                        ) : null}
                        {v.notes ? <p className="mt-1 text-xs text-slate-500">{v.notes}</p> : null}
                      </li>
                    ))}
                    {!activeVisa || visa.data.items.every((v) => v.visa_type !== 'e_medical_attendant') ? (
                      <li>
                        <button type="button" onClick={() => setRequest('visa')} className="text-sm font-semibold text-violet-600 hover:underline">
                          + Add a visa request (e.g. for a companion)
                        </button>
                      </li>
                    ) : null}
                  </ul>
                )}
              </div>

              {/* Transport */}
              <ServiceList
                title="Flights & transfers"
                icon={<Car className="h-5 w-5 text-green-600" aria-hidden />}
                loading={travel.isPending}
                error={travel.error}
                empty="No flight or transfer requests yet."
                items={(travel.data?.items ?? []).map((t) => ({
                  id: t.id,
                  title: TRAVEL_KIND_LABELS[t.kind],
                  status: t.status,
                  lines: [
                    [t.from_location, t.to_location].filter(Boolean).join(' → '),
                    t.depart_at ? `Departs ${formatDateTime(t.depart_at)}` : t.arrive_at ? `Arrives ${formatDateTime(t.arrive_at)}` : '',
                    [t.carrier, t.flight_number, t.pnr ? `PNR ${t.pnr}` : null].filter(Boolean).join(' · '),
                  ],
                  price: t.price_minor != null && t.currency ? <Money minor={t.price_minor} currency={t.currency} trim /> : null,
                }))}
              />

              {/* Stay */}
              <ServiceList
                title="Accommodation"
                icon={<BedDouble className="h-5 w-5 text-green-600" aria-hidden />}
                loading={stays.isPending}
                error={stays.error}
                empty="No accommodation requested yet."
                items={(stays.data?.items ?? []).map((s) => ({
                  id: s.id,
                  title: s.provider?.name ?? 'Accommodation',
                  status: s.status,
                  lines: [
                    `${formatDate(s.check_in)} - ${formatDate(s.check_out)} · ${s.guests} guest${s.guests === 1 ? '' : 's'}`,
                    s.provider?.address ?? '',
                    s.confirmation_code ? `Confirmation ${s.confirmation_code}` : '',
                  ],
                  price: s.total_minor != null && s.currency ? <Money minor={s.total_minor} currency={s.currency} trim /> : null,
                }))}
              />

              {/* Services */}
              <ServiceList
                title="Translator & local guide"
                icon={<Languages className="h-5 w-5 text-green-600" aria-hidden />}
                loading={services.isPending}
                error={services.error}
                empty="No translator or guide requested yet."
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
          <CardHeader title="Itinerary" description="Appointments, admission and transfers, in order." />
          <CardBody>
            {itinerary.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : itinerary.isError ? (
              <ErrorState error={itinerary.error} onRetry={() => void itinerary.refetch()} />
            ) : itinerary.data.length === 0 ? (
              <p className="text-sm text-slate-500">Your coordinator and the hospital will add your schedule here.</p>
            ) : (
              <ol className="relative space-y-5 border-l border-slate-200 pl-6 dark:border-slate-800">
                {[...itinerary.data]
                  .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                  .map((item) => (
                    <li key={item.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-[#161B22]',
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
          <CardHeader title="Help, 24/7" />
          <CardBody>
            <HelplineList coordinator={dashboard.data?.coordinator} />
          </CardBody>
        </Card>

        {/* Cultural tips */}
        <Card className="lg:col-span-3">
          <CardHeader title="Cultural tips" description="A few things that make your stay in India easier." />
          <CardBody>
            {tips.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : tips.isError ? (
              <ErrorState error={tips.error} onRetry={() => void tips.refetch()} />
            ) : tips.data.length === 0 ? (
              <p className="text-sm text-slate-500">No tips yet.</p>
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
      <div className="fixed bottom-20 right-4 z-20 flex flex-col items-end gap-2 lg:hidden">
        {helpline ? (
          <a href={telHref(helpline)} className="inline-flex items-center gap-2 rounded-full bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
            <Phone className="h-4 w-4" aria-hidden /> Call 24/7 helpline
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setRequest('translator')}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          <Languages className="h-4 w-4" aria-hidden /> Get translator
        </button>
        <button
          type="button"
          onClick={() => setRequest('local_guide')}
          className="inline-flex items-center gap-2 rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          <Compass className="h-4 w-4" aria-hidden /> Local guide
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
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        {icon} {title}
      </h3>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-sm text-red-600">Could not load. Please refresh.</p>
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
