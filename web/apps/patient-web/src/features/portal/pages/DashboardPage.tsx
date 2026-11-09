import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Bell,
  BookOpen,
  BriefcaseMedical,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  FileUp,
  ListChecks,
  MessageSquare,
  PhoneCall,
  Sparkles,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import type { ChecklistItemOut } from '@hig/shared/api';
import { heroActionClass, PageHero } from '@hig/shared/layout';
import { useDashboard } from '../api/queries';
import { GuestBanner } from '../components/GuestUpgrade';
import { SpecialtyTile } from '../components/SpecialtyIcon';
import { EmergencyContactsDialog, PreArrivalGuideDialog } from '../components/SupportDialogs';
import { StatusBadge } from '../components/common';
import { paths } from '../lib/paths';
import { useMe } from '../lib/session';
import { cn, formatDate, formatRelative, formatTime, useDocumentTitle } from '../lib/shared';
import { ButtonLink, Card, CardBody, CardHeader, ErrorState, ProgressBar, Skeleton } from '../ui/primitives';

export function ChecklistIcon({ status }: { status: ChecklistItemOut['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-accent-ink" aria-hidden />;
  if (status === 'in_progress') return <CircleDot className="h-5 w-5 text-accent" aria-hidden />;
  return <Circle className="h-5 w-5 text-border-strong" aria-hidden />;
}

const ACTION_TONES = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-200/70 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20',
  violet:
    'bg-violet-50 text-violet-600 ring-violet-200/70 group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20',
  rose: 'bg-rose-50 text-rose-600 ring-rose-200/70 group-hover:bg-rose-600 group-hover:text-white dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20',
  amber:
    'bg-amber-50 text-amber-700 ring-amber-200/70 group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
} as const;

function QuickAction({
  icon,
  label,
  hint,
  tone,
  to,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  tone: keyof typeof ACTION_TONES;
  to?: string;
  onClick?: () => void;
}) {
  const cls =
    'group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-start shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const inner = (
    <>
      <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-colors', ACTION_TONES[tone])}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function HeroStat({ icon, label, value, to }: { icon: ReactNode; label: string; value: ReactNode; to: string }) {
  return (
    <Link
      to={to}
      className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white/12 p-3 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex-row sm:items-center sm:gap-3 sm:px-4"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-xs text-white/85">{label}</span>
      </span>
    </Link>
  );
}

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const me = useMe();
  const dashboard = useDashboard();
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const firstName = me.data && !me.data.is_guest ? me.data.full_name.split(' ')[0] : null;
  const data = dashboard.data;

  return (
    <div>
      {me.data?.is_guest ? <GuestBanner /> : null}

      <PageHero
        eyebrow={formatDate(new Date(), 'EEEE, d MMMM')}
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome'}
        description="Your treatment journey at a glance."
        actions={
          <>
            <Link to={paths.newScreening()} className={heroActionClass('solid')}>
              <Stethoscope className="size-4" aria-hidden />
              New AI screening
            </Link>
            <Link to={paths.messages} className={heroActionClass('glass')}>
              <MessageSquare className="size-4" aria-hidden />
              Message coordinator
            </Link>
          </>
        }
        aside={
          data ? (
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-3">
              <HeroStat icon={<BriefcaseMedical className="size-5" aria-hidden />} label="Active cases" value={data.active_cases} to={paths.cases} />
              <HeroStat icon={<Bell className="size-5" aria-hidden />} label="Unread alerts" value={data.unread_notifications} to={paths.notifications} />
              <HeroStat
                icon={<CalendarClock className="size-5" aria-hidden />}
                label="Days to treatment"
                value={data.days_until_treatment !== null && data.days_until_treatment >= 0 ? data.days_until_treatment : '—'}
                to={data.next_booking ? paths.booking(data.next_booking.id) : paths.bookings}
              />
            </div>
          ) : null
        }
      />

      {dashboard.isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl lg:col-span-3" />
        </div>
      ) : dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : (
        <DashboardContent
          data={dashboard.data}
          onEmergency={() => setEmergencyOpen(true)}
          onGuide={() => setGuideOpen(true)}
        />
      )}

      <EmergencyContactsDialog
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
        coordinator={dashboard.data?.coordinator}
      />
      <PreArrivalGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

function DashboardContent({
  data,
  onEmergency,
  onGuide,
}: {
  data: NonNullable<ReturnType<typeof useDashboard>['data']>;
  onEmergency: () => void;
  onGuide: () => void;
}) {
  const booking = data.next_booking;
  const checklist = [...data.checklist].sort((a, b) => a.sort_order - b.sort_order);
  const done = checklist.filter((c) => c.status === 'done').length;
  const pct = checklist.length ? (done / checklist.length) * 100 : 0;
  const days = data.days_until_treatment;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Countdown */}
      <Card className="overflow-hidden lg:col-span-2">
        {booking ? (
          <div className="grid h-full gap-0 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="relative flex flex-col items-center justify-center overflow-hidden bg-hero-gradient p-6 text-center text-white">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgb(255_255_255/0.18),transparent_70%)]"
                aria-hidden
              />
              <p className="relative text-xs font-semibold uppercase tracking-wider text-white/85">Until treatment</p>
              {days !== null && days >= 0 ? (
                <p className="relative mt-1">
                  <span className="text-6xl font-extrabold tabular-nums">{days}</span>
                  <span className="ml-2 text-xl text-white/85">{days === 1 ? 'day' : 'days'}</span>
                </p>
              ) : (
                <p className="relative mt-2 text-2xl font-bold">{booking.status === 'admitted' ? 'In treatment' : 'Date to be confirmed'}</p>
              )}
              <p className="relative mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
                <CalendarClock className="size-3.5" aria-hidden /> Admission {formatDate(booking.admission_date)}
              </p>
            </div>
            <div className="space-y-3 p-6">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Next booking</p>
                <StatusBadge status={booking.status} />
              </div>
              <p className="text-lg font-semibold text-fg">{booking.procedure?.name ?? 'Treatment'}</p>
              <p className="text-sm text-muted">
                {booking.hospital.name}, {booking.hospital.city}
                {booking.doctor ? ` · ${booking.doctor.full_name}` : ''}
              </p>
              <p className="font-mono text-xs text-muted">Booking {booking.booking_number}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <ButtonLink to={paths.trip(booking.id)} variant="accent" size="sm">
                  Open trip hub
                </ButtonLink>
                {booking.status === 'pending_payment' ? (
                  <ButtonLink to={paths.pay(booking.id)} size="sm">
                    Complete payment
                  </ButtonLink>
                ) : (
                  <ButtonLink to={paths.booking(booking.id)} variant="outline" size="sm">
                    Booking details
                  </ButtonLink>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink">
              <Sparkles className="size-7" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-fg">No upcoming treatment yet</p>
              <p className="mt-1 text-sm text-muted">
                Tell us about your condition - our AI screening matches you with accredited Indian hospitals and doctors in
                minutes.
              </p>
            </div>
            <ButtonLink to={paths.newScreening()}>Start AI screening</ButtonLink>
          </div>
        )}
      </Card>

      {/* Checklist */}
      <Card>
        <CardHeader
          title="Your checklist"
          description={checklist.length ? `${done} of ${checklist.length} completed` : 'Appears once a booking is confirmed'}
          action={
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              <ListChecks className="size-5" aria-hidden />
            </span>
          }
        />
        <CardBody className="space-y-3">
          {checklist.length ? (
            <>
              <ProgressBar value={pct} tone="violet" />
              <ul className="space-y-2.5">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 text-sm">
                    <ChecklistIcon status={item.status} />
                    <span className={cn(item.status === 'done' ? 'font-medium text-fg' : 'text-muted')}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Visa, flights, insurance, airport pickup and accommodation tasks will be tracked here.</p>
          )}
        </CardBody>
      </Card>

      {/* Quick actions */}
      <div className="lg:col-span-3">
        <h2 className="mb-3 text-lg font-semibold text-fg">Quick actions</h2>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          <QuickAction tone="blue" icon={<FileUp className="size-5" aria-hidden />} label="Upload documents" hint="Reports, scans, passport" to={paths.documents} />
          <QuickAction tone="violet" icon={<MessageSquare className="size-5" aria-hidden />} label="Chat with coordinator" hint="Usually replies within hours" to={paths.messages} />
          <QuickAction tone="rose" icon={<PhoneCall className="size-5" aria-hidden />} label="Emergency contacts" hint="24/7 help in India" onClick={onEmergency} />
          <QuickAction tone="amber" icon={<BookOpen className="size-5" aria-hidden />} label="Pre-arrival guide" hint="Visa, travel and stay tips" onClick={onGuide} />
        </div>
      </div>

      {/* Today */}
      <Card className="lg:col-span-2">
        <CardHeader title="Today's schedule" description={formatDate(new Date(), 'EEEE, d MMMM')} />
        <CardBody>
          {data.today_schedule.length ? (
            <ol className="space-y-3">
              {data.today_schedule.map((item) => (
                <li key={item.id} className="flex gap-3 rounded-xl border border-border bg-surface-2/60 p-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                    <Clock className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-fg">{item.title}</p>
                    <p className="text-sm text-muted">
                      {formatTime(item.starts_at)}
                      {item.ends_at ? ` - ${formatTime(item.ends_at)}` : ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-strong p-4 text-sm text-muted">
              <CalendarClock className="size-5 shrink-0" aria-hidden />
              Nothing scheduled for today.
            </div>
          )}
        </CardBody>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader title="Your journey" />
        <CardBody className="space-y-3">
          <Link
            to={paths.cases}
            className="group flex items-center justify-between rounded-xl border border-border p-3 transition hover:border-primary/40 hover:bg-primary-soft"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-fg">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
                <BriefcaseMedical className="size-5" aria-hidden />
              </span>
              Active cases
            </span>
            <span className="text-xl font-bold tabular-nums text-fg">{data.active_cases}</span>
          </Link>
          <Link
            to={paths.notifications}
            className="group flex items-center justify-between rounded-xl border border-border p-3 transition hover:border-info/40 hover:bg-info-soft"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-fg">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-info-soft text-info-ink">
                <Bell className="size-5" aria-hidden />
              </span>
              Unread notifications
            </span>
            <span className="text-xl font-bold tabular-nums text-fg">{data.unread_notifications}</span>
          </Link>
          {data.coordinator ? (
            <div className="flex items-center gap-3 rounded-xl bg-linear-to-r from-accent-soft to-transparent p-3 text-sm">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-fg">
                <UserRound className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Your coordinator</p>
                <p className="truncate font-semibold text-fg">{data.coordinator.full_name}</p>
                {data.coordinator.phone ? <p className="text-muted">{data.coordinator.phone}</p> : null}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Recent screenings */}
      <Card className="lg:col-span-3">
        <CardHeader
          title="Recent screenings"
          action={
            <Link to={paths.screenings} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:underline">
              View all <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        <CardBody className="pt-3">
          {data.recent_screenings.length ? (
            <ul className="divide-y divide-border">
              {data.recent_screenings.map((s) => (
                <li key={s.id}>
                  <Link
                    to={
                      s.status === 'draft'
                        ? paths.screeningStep(s.id, 1)
                        : s.status === 'processing'
                          ? paths.screeningProcessing(s.id)
                          : paths.screeningResults(s.id)
                    }
                    className="group -mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition hover:bg-surface-2/70"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SpecialtyTile slug={s.specialty?.slug ?? null} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-fg">{s.specialty?.name ?? 'General screening'}</p>
                        <p className="truncate text-sm text-muted">{s.summary ?? `Started ${formatRelative(s.created_at)}`}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.urgency ? <StatusBadge status={s.urgency} /> : null}
                      <StatusBadge status={s.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">You have not completed a screening yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
