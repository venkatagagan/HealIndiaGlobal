import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Hourglass,
  MessageSquare,
  MoreHorizontal,
  Plane,
  Stethoscope,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  adminApi,
  BOOKING_STATUS_LABELS,
  casesApi,
  CASE_STATUS_LABELS,
  GENDER_LABELS,
  LIKELIHOOD_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_OPTION_LABELS,
  PAYMENT_PURPOSE_LABELS,
  PREVIOUS_TREATMENT_LABELS,
  paymentsApi,
  QUOTE_LINE_CATEGORY_LABELS,
  SERVICE_BOOKING_STATUS_LABELS,
  TRAVEL_KIND_LABELS,
  travelApi,
  URGENCY_LABELS,
  USER_ROLE_LABELS,
  VISA_STATUS_LABELS,
  VISA_TYPE_LABELS,
  type AuditLogOut,
  type CaseDetail,
  type CaseStatus,
  type PaymentOrderOut,
  type QuoteLineItem,
  type QuoteOut,
} from '@hig/shared/api';
import { formatNumber } from '@hig/shared/lib';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  DateCell,
  EmptyState,
  ErrorState,
  IdCell,
  LinkButton,
  LoadingState,
  MoneyCell,
  ProgressBar,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { Field, Modal, Select, Textarea } from '../ui';
import { Banner, DetailHero, DetailTabs, FactList, FieldGrid, Panel, StatusTrack, useDetailTab, type TrackStep } from '../ui/detail';
import { DocumentList } from '../components/DocumentList';
import { cn, formatDate, formatDateTime, formatMoney, formatRelative, useDocumentTitle } from '../lib/format';
import { inrFull } from '../lib/inr';
import { STAFF_CASE_TRANSITIONS, useCoordinatorOptions } from '../lib/lookups';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { financePath } from '../../finance/paths';
import { useAppTranslation } from '../../../i18n';

type T = ReturnType<typeof useAppTranslation>['t'];

const FLOW: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];
const TABS = ['overview', 'screening', 'quotes', 'booking', 'travel', 'documents', 'activity'] as const;
type CaseTab = (typeof TABS)[number];

function money(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  return currency === 'INR' || !currency ? inrFull(minor) : formatMoney(minor, currency);
}

/** When each flow status was first reached, from the timeline. */
function reachedAt(c: CaseDetail): Partial<Record<CaseStatus, string>> {
  const out: Partial<Record<CaseStatus, string>> = { enquiry: c.created_at };
  for (const e of c.timeline) if (!out[e.to_status]) out[e.to_status] = e.created_at;
  return out;
}

export default function CaseDetailPage() {
  const { t } = useAppTranslation();
  const { id = '' } = useParams();
  const perms = useOpsPermissions();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: [...opsKeys.cases, 'detail', id], queryFn: () => casesApi.get(id), enabled: !!id });
  useDocumentTitle(q.data ? t('caseDetail.documentTitle', { number: q.data.case_number }) : t('caseDetail.eyebrow'));
  const [tab, setTab] = useDetailTab<CaseTab>(TABS, 'overview');
  const [statusTo, setStatusTo] = useState<CaseStatus | 'pick' | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  if (q.isLoading) return <LoadingState label={t('caseDetail.loading')} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const transitions = STAFF_CASE_TRANSITIONS[c.status] ?? [];
  const urgency = c.urgency ?? c.screening?.urgency ?? c.screening?.ai_result?.urgency ?? null;
  const reached = reachedAt(c);
  const closed = c.status === 'cancelled' || c.status === 'declined';
  const lastFlow = closed
    ? Math.max(
        0,
        ...c.timeline.map((e) => (e.from_status ? FLOW.indexOf(e.from_status) : -1)),
        ...c.timeline.map((e) => FLOW.indexOf(e.to_status)),
      )
    : FLOW.indexOf(c.status);
  const steps: TrackStep[] = FLOW.map((s) => ({
    key: s,
    label: CASE_STATUS_LABELS[s],
    at: reached[s] ? formatDate(reached[s], 'd MMM') : null,
  }));
  const closedEntry = closed ? [...c.timeline].reverse().find((e) => e.to_status === c.status) : undefined;
  const sentQuotes = c.quotes.filter((x) => x.status !== 'draft');
  const latestQuote = [...c.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const messagesTo = `${opsPaths.messages}?case_id=${encodeURIComponent(c.id)}`;

  const next = nextAction(t, c, perms.manageCases, {
    assign: () => setAssignOpen(true),
    status: (s) => setStatusTo(s),
    go: (to) => navigate(to),
    messagesTo,
    openBooking: () => setTab('booking'),
  });

  return (
    <div>
      <DetailHero
        back={{ to: opsPaths.cases, label: t('caseDetail.back') }}
        eyebrow={t('caseDetail.eyebrow')}
        title={<span className="font-mono">{c.case_number}</span>}
        badges={
          <>
            <StatusBadge status={c.status} kind="case" />
            {(urgency === 'emergency' || urgency === 'urgent') && (
              <Badge tone={urgency === 'emergency' ? 'danger' : 'warning'}>
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="size-3" aria-hidden /> {URGENCY_LABELS[urgency]}
                </span>
              </Badge>
            )}
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-fg">{c.patient.full_name}</span>
            <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
            <Link to={opsPaths.hospital(c.hospital.id)} className="hover:text-fg hover:underline">
              {c.hospital.name}
            </Link>
            <span aria-hidden>·</span>
            <span>{t('caseDetail.hero.opened', { date: formatDate(c.created_at) })}</span>
            <span aria-hidden>·</span>
            <span title={formatDateTime(c.updated_at)}>{t('caseDetail.hero.updated', { when: formatRelative(c.updated_at) })}</span>
          </span>
        }
        actions={
          <>
            <LinkButton to={messagesTo} variant="outline" size="sm" leftIcon={<MessageSquare className="size-4" aria-hidden />}>
              {t('caseDetail.hero.messages')}
            </LinkButton>
            {perms.manageCases && transitions.length > 0 && (
              <Button variant="outline" size="sm" leftIcon={<MoreHorizontal className="size-4" aria-hidden />} onClick={() => setStatusTo('pick')}>
                {t('caseDetail.hero.changeStatus')}
              </Button>
            )}
            {next && (
              <Button size="sm" leftIcon={next.icon} onClick={next.onClick} variant={next.danger ? 'danger' : 'primary'}>
                {next.label}
              </Button>
            )}
          </>
        }
      >
        <StatusTrack
          steps={steps}
          current={lastFlow}
          terminal={closed ? { label: CASE_STATUS_LABELS[c.status], at: closedEntry ? formatDate(closedEntry.created_at, 'd MMM') : null } : null}
        />
        {next?.hint && <p className="mt-3 text-xs text-muted">{next.hint}</p>}
      </DetailHero>

      {urgency === 'emergency' && (
        <div className="mb-5">
          <Banner
            tone="danger"
            icon={<AlertTriangle className="size-5" aria-hidden />}
            title={t('caseDetail.emergency.title')}
            action={
              <LinkButton to={messagesTo} size="sm" variant="danger">
                {t('caseDetail.emergency.contact')}
              </LinkButton>
            }
          >
            {c.emergency_acknowledged_at
              ? t('caseDetail.emergency.acknowledged', { date: formatDateTime(c.emergency_acknowledged_at) })
              : t('caseDetail.emergency.notAcknowledged')}
            {c.screening?.red_flags.length ? ` ${t('caseDetail.emergency.redFlags', { flags: c.screening.red_flags.join(', ') })}` : ''}
          </Banner>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <DetailTabs
            label={t('caseDetail.tabs.label')}
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: t('caseDetail.tabs.overview') },
              { value: 'screening', label: t('caseDetail.tabs.screening'), disabled: !c.screening },
              { value: 'quotes', label: t('caseDetail.tabs.quotes'), count: c.quotes.length },
              { value: 'booking', label: t('caseDetail.tabs.booking') },
              { value: 'travel', label: t('caseDetail.tabs.travel') },
              { value: 'documents', label: t('caseDetail.tabs.documents'), count: c.documents.length },
              { value: 'activity', label: t('caseDetail.tabs.activity') },
            ]}
          />
          <div role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} className="space-y-4">
            {tab === 'overview' && <OverviewTab c={c} latestQuote={latestQuote} sentQuotes={sentQuotes.length} onTab={setTab} />}
            {tab === 'screening' && c.screening && <ScreeningTab c={c} />}
            {tab === 'quotes' && <QuotesTab quotes={c.quotes} />}
            {tab === 'booking' && <BookingTab c={c} canSeeFinance={perms.role === 'finance' || perms.role === 'super_admin'} />}
            {tab === 'travel' && <TravelTab caseId={c.id} />}
            {tab === 'documents' && (
              <Panel title={t('caseDetail.tabs.documents')} description={t('caseDetail.documentsDescription')}>
                <DocumentList documents={c.documents} canVerify={perms.isStaff} invalidate={[opsKeys.cases]} />
              </Panel>
            )}
            {tab === 'activity' && <ActivityTab c={c} />}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label={t('caseDetail.facts.title')}>
          <CoordinatorPanel detail={c} canAssign={perms.manageCases} open={assignOpen} onOpenChange={setAssignOpen} />
          <Panel title={t('caseDetail.facts.title')}>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={c.patient.full_name} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{c.patient.full_name}</p>
                <p className="truncate text-xs text-muted">
                  {[c.patient.nationality, c.patient.gender ? GENDER_LABELS[c.patient.gender] : null, c.patient.age != null ? t('caseDetail.facts.age', { count: c.patient.age }) : null]
                    .filter(Boolean)
                    .join(' · ') || t('caseDetail.facts.patient')}
                </p>
              </div>
            </div>
            <FactList
              items={[
                { label: t('caseDetail.facts.hospital'), icon: <Building2 className="size-3.5" aria-hidden />, value: <Link to={opsPaths.hospital(c.hospital.id)} className="text-primary-ink hover:underline">{c.hospital.name}</Link> },
                { label: t('caseDetail.facts.city'), value: c.hospital.city },
                { label: t('caseDetail.facts.doctor'), icon: <Stethoscope className="size-3.5" aria-hidden />, value: c.doctor?.full_name ?? '—' },
                { label: t('caseDetail.facts.treatment'), value: c.procedure?.name ?? c.specialty?.name ?? '—' },
                { label: t('caseDetail.facts.source'), icon: <Users className="size-3.5" aria-hidden />, value: c.agent ? t('caseDetail.facts.viaAgent', { agency: c.agent.agency_name }) : t('caseDetail.facts.direct') },
                { label: t('caseDetail.facts.latestQuote'), value: latestQuote ? money(latestQuote.total_minor, latestQuote.currency) : '—' },
              ]}
            />
          </Panel>
          {c.booking && (
            <Panel
              title={t('caseDetail.facts.payment')}
              actions={<StatusBadge status={c.booking.status} kind="booking" />}
              footer={
                <button type="button" onClick={() => setTab('booking')} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
                  {t('caseDetail.tabs.booking')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
                </button>
              }
            >
              <PaymentProgress booking={c.booking} />
            </Panel>
          )}
        </aside>
      </div>

      <StatusModal
        open={statusTo !== null}
        preset={statusTo === 'pick' ? null : statusTo}
        onClose={() => setStatusTo(null)}
        caseId={c.id}
        current={c.status}
        options={transitions}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Next action for the current status
// ---------------------------------------------------------------------------------------------------------
function nextAction(
  t: T,
  c: CaseDetail,
  canManage: boolean,
  h: { assign: () => void; status: (s: CaseStatus) => void; go: (to: string) => void; messagesTo: string; openBooking: () => void },
): { label: string; icon: ReactNode; onClick: () => void; hint?: string; danger?: boolean } | null {
  const go = (to: string) => () => h.go(to);
  if (!canManage) return null;
  if (!c.coordinator && ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment'].includes(c.status)) {
    return { label: t('caseDetail.next.assign'), icon: <UserPlus className="size-4" aria-hidden />, onClick: h.assign, hint: t('caseDetail.next.assignHint') };
  }
  switch (c.status) {
    case 'enquiry':
      return { label: t('caseDetail.next.chaseQuote'), icon: <Hourglass className="size-4" aria-hidden />, onClick: go(h.messagesTo), hint: t('caseDetail.next.chaseQuoteHint') };
    case 'quoted':
      return { label: t('caseDetail.next.followUp'), icon: <MessageSquare className="size-4" aria-hidden />, onClick: go(h.messagesTo), hint: t('caseDetail.next.followUpHint') };
    case 'accepted':
      return { label: t('caseDetail.next.checkPayment'), icon: <ClipboardList className="size-4" aria-hidden />, onClick: h.openBooking, hint: t('caseDetail.next.checkPaymentHint') };
    case 'booked':
      return { label: t('caseDetail.next.markAdmitted'), icon: <CheckCircle2 className="size-4" aria-hidden />, onClick: () => h.status('in_treatment'), hint: c.booking?.admission_date ? t('caseDetail.next.admissionPlanned', { date: formatDate(c.booking.admission_date) }) : undefined };
    case 'in_treatment':
      return { label: t('caseDetail.next.markCompleted'), icon: <CheckCircle2 className="size-4" aria-hidden />, onClick: () => h.status('completed'), hint: t('caseDetail.next.markCompletedHint') };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------------------
function OverviewTab({ c, latestQuote, sentQuotes, onTab }: { c: CaseDetail; latestQuote: QuoteOut | null; sentQuotes: number; onTab: (t: CaseTab) => void }) {
  const { t } = useAppTranslation();
  const ai = c.screening?.ai_result;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <MiniStat label={t('caseDetail.overview.quotesSent')} value={formatNumber(sentQuotes)} hint={latestQuote ? t('caseDetail.overview.latestWhen', { when: formatRelative(latestQuote.created_at) }) : t('caseDetail.overview.noneYet')} onClick={() => onTab('quotes')} />
        <MiniStat
          label={t('caseDetail.facts.latestQuote')}
          value={latestQuote ? money(latestQuote.total_minor, latestQuote.currency) : '—'}
          hint={latestQuote ? <StatusBadge status={latestQuote.status} kind="quote" /> : t('caseDetail.overview.waitingHospital')}
          onClick={() => onTab('quotes')}
        />
        <MiniStat
          label={t('caseDetail.overview.admission')}
          value={c.booking?.admission_date ? formatDate(c.booking.admission_date) : '—'}
          hint={c.booking ? BOOKING_STATUS_LABELS[c.booking.status] : t('caseDetail.overview.notBooked')}
          onClick={() => onTab('booking')}
        />
      </div>
      <Panel title={t('caseDetail.overview.summary')}>
        <FieldGrid
          items={[
            { label: t('caseDetail.overview.patient'), value: c.patient.full_name },
            { label: t('caseDetail.overview.nationality'), value: c.patient.nationality ?? '—' },
            { label: t('caseDetail.overview.specialty'), value: c.specialty?.name ?? c.doctor?.specialty_name ?? '—' },
            { label: t('caseDetail.overview.procedure'), value: c.procedure?.name ?? '—' },
            { label: t('caseDetail.facts.doctor'), value: c.doctor?.full_name ?? '—' },
            { label: t('caseDetail.overview.opened'), value: formatDateTime(c.created_at) },
          ]}
        />
        {(c.patient_notes || c.medical_summary) && (
          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2">
            {c.patient_notes && <Prose title={t('caseDetail.overview.patientNotes')}>{c.patient_notes}</Prose>}
            {c.medical_summary && <Prose title={t('caseDetail.overview.medicalSummary')}>{c.medical_summary}</Prose>}
          </div>
        )}
      </Panel>
      {ai && (
        <Panel
          title={t('caseDetail.overview.aiGlance')}
          actions={
            <button type="button" onClick={() => onTab('screening')} className="text-xs font-medium text-primary-ink hover:underline">
              {t('caseDetail.overview.fullScreening')}
            </button>
          }
        >
          <p className="text-sm text-fg">{ai.summary}</p>
        </Panel>
      )}
      <Panel title={t('caseDetail.statusHistory')}>
        <Timeline c={c} />
      </Panel>
    </>
  );
}

function MiniStat({ label, value, hint, onClick }: { label: string; value: ReactNode; hint?: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 rounded-xl border border-border bg-surface p-3 text-start shadow-card transition-colors sm:p-4 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-fg sm:text-lg">{value}</p>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </button>
  );
}

function Prose({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted">{title}</h4>
      <p className="mt-1 whitespace-pre-line text-sm text-fg">{children}</p>
    </div>
  );
}

function Timeline({ c }: { c: CaseDetail }) {
  const { t } = useAppTranslation();
  const items = [
    ...[...c.timeline].reverse().map((e) => ({
      key: `${e.created_at}-${e.to_status}`,
      title: e.from_status ? (
        <>
          {CASE_STATUS_LABELS[e.from_status]} <ArrowRight className="inline size-3 rtl:-scale-x-100" aria-hidden /> <strong>{CASE_STATUS_LABELS[e.to_status]}</strong>
        </>
      ) : (
        <strong>{CASE_STATUS_LABELS[e.to_status]}</strong>
      ),
      at: e.created_at,
      by: e.changed_by_name,
      note: e.note,
      tone: e.to_status === 'cancelled' || e.to_status === 'declined' ? 'bg-danger' : 'bg-primary',
    })),
    { key: 'created', title: <strong>{t('caseDetail.timeline.opened')}</strong>, at: c.created_at, by: null, note: null, tone: 'bg-info' },
  ];
  return (
    <ol className="relative ms-1.5 space-y-4 border-s border-border ps-5">
      {items.map((item) => (
        <li key={item.key} className="relative">
          <span className={cn('absolute -start-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-surface', item.tone)} aria-hidden />
          <p className="text-sm text-fg">{item.title}</p>
          <p className="text-xs text-muted">
            {formatDateTime(item.at)}
            {item.by ? ` · ${item.by}` : ''}
          </p>
          {item.note && <p className="mt-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-fg">{item.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function ScreeningTab({ c }: { c: CaseDetail }) {
  const { t } = useAppTranslation();
  const s = c.screening!;
  const ai = s.ai_result;
  return (
    <>
      <Panel
        title={t('caseDetail.screening.symptoms')}
        actions={<StatusBadge status={s.status} kind="screening" />}
      >
        <FieldGrid
          columns={3}
          items={[
            { label: t('caseDetail.screening.bodyAreas'), value: s.body_areas.length ? s.body_areas.map((a) => a.replace(/_/g, ' ')).join(', ') : '—' },
            { label: t('caseDetail.screening.painIntensity'), value: s.pain_intensity != null ? t('caseDetail.screening.painValue', { value: s.pain_intensity }) : '—' },
            { label: t('caseDetail.screening.duration'), value: s.duration_value ? (s.duration_unit ? t(`caseDetail.screening.durationUnits.${s.duration_unit}`, { count: s.duration_value }) : formatNumber(s.duration_value)) : '—' },
            { label: t('caseDetail.screening.previousTreatment'), value: s.previous_treatments.length ? s.previous_treatments.map((p) => PREVIOUS_TREATMENT_LABELS[p] ?? p.replace(/_/g, ' ')).join(', ') : t('caseDetail.screening.none') },
            { label: t('caseDetail.screening.homeCountry'), value: s.home_country ?? '—' },
            { label: t('caseDetail.screening.submitted'), value: formatDateTime(s.submitted_at ?? s.created_at) },
          ]}
        />
        {s.notes && (
          <div className="mt-4 border-t border-border pt-4">
            <Prose title={t('caseDetail.screening.notes')}>{s.notes}</Prose>
          </div>
        )}
      </Panel>
      {ai ? (
        <Panel
          title={t('caseDetail.screening.aiTriage')}
          description={ai.disclaimer}
          actions={
            <>
              <StatusBadge status={ai.urgency} kind="urgency" />
              <Badge tone={ai.engine === 'claude' ? 'accent' : 'neutral'}>{ai.engine === 'claude' ? t('caseDetail.screening.aiTriage') : t('caseDetail.screening.rulesEngine')}</Badge>
            </>
          }
        >
          <p className="text-sm text-fg">{ai.summary}</p>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h4 className="text-xs font-medium text-muted">{t('caseDetail.screening.suggestedSpecialties')}</h4>
              <ul className="mt-2 space-y-2">
                {ai.suggested_specialties.map((sp) => (
                  <li key={sp.slug}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-fg">{sp.name}</span>
                      <span className="tabular-nums text-muted">{formatNumber(sp.confidence, { style: 'percent', maximumFractionDigits: 0 })}</span>
                    </div>
                    <ProgressBar value={Math.round(sp.confidence * 100)} className="mt-1" />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted">{t('caseDetail.screening.possibleConditions')}</h4>
              <ul className="mt-2 divide-y divide-border">
                {ai.possible_conditions.map((pc) => (
                  <li key={pc.name} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span className="text-fg">{pc.name}</span>
                    <Badge tone={pc.likelihood === 'high' ? 'warning' : 'neutral'}>{LIKELIHOOD_LABELS[pc.likelihood] ?? pc.likelihood}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            {ai.recommended_tests.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted">{t('caseDetail.screening.recommendedTests')}</h4>
                <p className="mt-1 text-sm text-fg">{ai.recommended_tests.join(', ')}</p>
              </div>
            )}
            {ai.red_flags.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted">{t('caseDetail.screening.redFlags')}</h4>
                <p className="mt-1 text-sm text-danger-ink">{ai.red_flags.join(', ')}</p>
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title={t('caseDetail.screening.aiTriage')}>
          <EmptyState compact title={t('caseDetail.screening.noAiResult')} description={s.error ?? t('caseDetail.screening.notProcessed')} />
        </Panel>
      )}
    </>
  );
}

const lineColumns = (t: T): DataTableColumn<QuoteLineItem & { currency: string }>[] => [
  { key: 'category', header: t('caseDetail.quotes.columns.category'), sortable: true, accessor: (l) => QUOTE_LINE_CATEGORY_LABELS[l.category] ?? l.category, cell: (l) => <TextCell primary={QUOTE_LINE_CATEGORY_LABELS[l.category] ?? l.category} />, mobile: 'meta' },
  { key: 'description', header: t('caseDetail.quotes.columns.description'), mobile: 'primary', cell: (l) => <span className="text-fg">{l.description}</span> },
  { key: 'amount', header: t('caseDetail.quotes.columns.amount'), align: 'end', sortable: true, accessor: (l) => l.amount_minor, mobile: 'badge', cell: (l) => <span className="tabular-nums">{money(l.amount_minor, l.currency)}</span> },
];

function QuotesTab({ quotes }: { quotes: QuoteOut[] }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => lineColumns(t), [t]);
  const sorted = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (sorted.length === 0) {
    return (
      <Panel title={t('caseDetail.tabs.quotes')}>
        <EmptyState compact icon={<Hourglass className="size-6" aria-hidden />} title={t('caseDetail.quotes.emptyTitle')} description={t('caseDetail.quotes.emptyDescription')} />
      </Panel>
    );
  }
  const strong = <strong className="text-fg" />;
  return (
    <>
      {sorted.map((quote, i) => (
        <Panel
          key={quote.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {i === 0 ? t('caseDetail.facts.latestQuote') : t('caseDetail.quotes.quoteFrom', { date: formatDate(quote.created_at) })}
              <StatusBadge status={quote.status} kind="quote" />
            </span>
          }
          description={
            quote.prepared_by_name
              ? t('caseDetail.quotes.sentBy', { date: formatDateTime(quote.created_at), name: quote.prepared_by_name })
              : t('caseDetail.quotes.sent', { date: formatDateTime(quote.created_at) })
          }
          actions={<span className="text-lg font-semibold tabular-nums text-fg">{money(quote.total_minor, quote.currency)}</span>}
          bodyClassName="space-y-4"
        >
          {quote.treatment_plan && <Prose title={t('caseDetail.quotes.treatmentPlan')}>{quote.treatment_plan}</Prose>}
          <DataTable
            caption={t('caseDetail.quotes.lineItems')}
            columns={columns}
            rows={quote.line_items.map((l) => ({ ...l, currency: quote.currency }))}
            rowKey={(_, idx) => idx}
            density="compact"
            showViewOptions={false}
            responsive="cards"
            emptyTitle={t('caseDetail.quotes.noLineItems')}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>
              {quote.estimated_stay_days != null ? (
                <Trans t={t} i18nKey="caseDetail.quotes.estimatedStay" count={quote.estimated_stay_days} components={{ 0: strong }} />
              ) : (
                <Trans t={t} i18nKey="caseDetail.quotes.estimatedStayUnknown" components={{ 0: strong }} />
              )}
            </span>
            <span>
              <Trans t={t} i18nKey="caseDetail.quotes.validUntil" values={{ date: formatDate(quote.valid_until) }} components={{ 0: strong }} />
            </span>
            {quote.accepted_at && (
              <span>
                <Trans t={t} i18nKey="caseDetail.quotes.accepted" values={{ date: formatDateTime(quote.accepted_at) }} components={{ 0: strong }} />
              </span>
            )}
            {quote.rejected_reason && <span className="text-danger-ink">{t('caseDetail.quotes.rejected', { reason: quote.rejected_reason })}</span>}
          </div>
        </Panel>
      ))}
    </>
  );
}

function PaymentProgress({ booking }: { booking: NonNullable<CaseDetail['booking']> }) {
  const { t } = useAppTranslation();
  const pct = booking.total_minor > 0 ? Math.min(100, Math.round((booking.amount_paid_minor / booking.total_minor) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold text-fg">{money(booking.amount_paid_minor, booking.currency)}</span>
        <span className="text-xs text-muted">{t('caseDetail.payment.ofTotal', { total: money(booking.total_minor, booking.currency) })}</span>
      </div>
      <ProgressBar value={pct} className="mt-2" tone={pct >= 100 ? 'success' : 'primary'} />
      <p className="mt-2 text-xs text-muted">
        {booking.balance_due_minor > 0 ? (
          <Trans
            t={t}
            i18nKey="caseDetail.payment.balanceDue"
            values={{ amount: money(booking.balance_due_minor, booking.currency) }}
            components={{ 0: <strong className="text-fg" /> }}
          />
        ) : (
          t('caseDetail.payment.fullyPaid')
        )}
        {booking.amount_refunded_minor > 0 && ` · ${t('caseDetail.payment.refunded', { amount: money(booking.amount_refunded_minor, booking.currency) })}`}
      </p>
    </div>
  );
}

function orderColumns(t: T, canOpen: boolean): DataTableColumn<PaymentOrderOut>[] {
  return [
    { key: 'order', header: t('caseDetail.orders.columns.order'), mobile: 'primary', cell: (o) => <IdCell value={o.order_number} secondary={PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose} /> },
    { key: 'status', header: t('caseDetail.orders.columns.status'), sortable: true, accessor: (o) => o.status, mobile: 'badge', cell: (o) => <StatusBadgeCell status={o.status} kind="order" label={ORDER_STATUS_LABELS[o.status]} /> },
    { key: 'amount', header: t('caseDetail.orders.columns.amount'), align: 'end', sortable: true, accessor: (o) => o.base_amount_minor, cell: (o) => <MoneyCell minor={o.amount_minor} currency={o.currency} secondary={o.currency !== 'INR' ? inrFull(o.base_amount_minor) : undefined} /> },
    { key: 'created', header: t('caseDetail.orders.columns.created'), sortable: true, accessor: (o) => o.created_at, cell: (o) => <DateCell value={o.created_at} display="date" /> },
    { key: 'paid', header: t('caseDetail.orders.columns.paid'), sortable: true, accessor: (o) => o.paid_at ?? '', cell: (o) => <DateCell value={o.paid_at} display="datetime" /> },
    ...(canOpen
      ? [{ key: 'open', header: '', title: t('caseDetail.orders.columns.open'), hideable: false, mobile: 'hidden' as const, cell: () => <ExternalLink className="size-4 text-muted" aria-hidden />, exportable: false }]
      : []),
  ];
}

function BookingTab({ c, canSeeFinance }: { c: CaseDetail; canSeeFinance: boolean }) {
  const { t } = useAppTranslation();
  const b = c.booking;
  const orders = useQuery({
    queryKey: ['payments', 'orders', 'booking', b?.id],
    queryFn: () => paymentsApi.listOrders({ booking_id: b!.id, page_size: 50 }),
    enabled: !!b,
  });
  const cols = useMemo(() => orderColumns(t, canSeeFinance), [t, canSeeFinance]);
  if (!b) {
    return (
      <Panel title={t('caseDetail.booking.title')}>
        <EmptyState compact icon={<CalendarDays className="size-6" aria-hidden />} title={t('caseDetail.overview.notBooked')} description={t('caseDetail.booking.emptyDescription')} />
      </Panel>
    );
  }
  return (
    <>
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t('caseDetail.booking.title')} <span className="font-mono text-xs text-muted">{b.booking_number}</span>
            <StatusBadge status={b.status} kind="booking" />
          </span>
        }
        actions={
          <LinkButton to={`${opsPaths.bookings}?q=${encodeURIComponent(b.booking_number)}`} size="sm" variant="outline" rightIcon={<ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />}>
            {t('caseDetail.booking.manage')}
          </LinkButton>
        }
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <FieldGrid
            items={[
              { label: t('caseDetail.overview.admission'), value: formatDate(b.admission_date) },
              { label: t('caseDetail.booking.discharge'), value: formatDate(b.discharge_date) },
              { label: t('caseDetail.booking.paymentOption'), value: PAYMENT_OPTION_LABELS[b.payment_option] },
              { label: t('caseDetail.booking.package'), value: b.package?.name ?? '—' },
              { label: t('caseDetail.booking.subtotal'), value: money(b.subtotal_minor, b.currency) },
              { label: t('caseDetail.booking.serviceFeeTax'), value: money(b.service_fee_minor + b.tax_minor, b.currency) },
              { label: t('caseDetail.booking.discount'), value: b.discount_minor ? `− ${money(b.discount_minor, b.currency)}` : '—' },
              { label: t('caseDetail.booking.total'), value: <strong>{money(b.total_minor, b.currency)}</strong> },
            ]}
          />
          <div className="rounded-xl bg-surface-2/60 p-4">
            <PaymentProgress booking={b} />
          </div>
        </div>
        {b.cancel_reason && <p className="mt-4 text-sm text-danger-ink">{t('caseDetail.booking.cancelled', { reason: b.cancel_reason })}</p>}
      </Panel>
      <Panel title={t('caseDetail.orders.title')} description={t('caseDetail.orders.description')} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption={t('caseDetail.orders.title')}
          columns={cols}
          rows={orders.data?.items}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => void orders.refetch()}
          defaultSort={{ key: 'created', direction: 'desc' }}
          rowHref={canSeeFinance ? (o) => financePath(`orders/${o.id}`) : undefined}
          rowLabel={(o) => t('caseDetail.orders.rowLabel', { number: o.order_number })}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle={t('caseDetail.orders.emptyTitle')}
        />
      </Panel>
    </>
  );
}

function TravelTab({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  const visas = useQuery({ queryKey: [...opsKeys.travel, 'visa', caseId], queryFn: () => travelApi.listVisaRequests({ case_id: caseId, page_size: 50 }) });
  const trips = useQuery({ queryKey: [...opsKeys.travel, 'trips', caseId], queryFn: () => travelApi.listTravelBookings({ case_id: caseId, page_size: 50 }) });
  const stays = useQuery({ queryKey: [...opsKeys.travel, 'stays', caseId], queryFn: () => travelApi.listAccommodationBookings({ case_id: caseId, page_size: 50 }) });
  const desk = `${opsPaths.travel}`;
  return (
    <>
      <Panel title={t('caseDetail.travel.visa')} actions={<TravelDeskLink to={`${desk}?tab=visa`} />} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption={t('caseDetail.travel.visaRequests')}
          rows={visas.data?.items}
          loading={visas.isLoading}
          error={visas.error}
          columns={[
            { key: 'type', header: t('caseDetail.travel.columns.visaType'), mobile: 'primary', cell: (v) => <span className="text-fg">{VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type}</span> },
            { key: 'status', header: t('caseDetail.travel.columns.status'), mobile: 'badge', sortable: true, accessor: (v) => v.status, cell: (v) => <StatusBadgeCell status={v.status} kind="visa" label={VISA_STATUS_LABELS[v.status]} /> },
            { key: 'ref', header: t('caseDetail.travel.columns.reference'), cell: (v) => <TextCell primary={v.application_reference ?? '—'} /> },
            { key: 'requested', header: t('caseDetail.travel.columns.requested'), sortable: true, accessor: (v) => v.created_at, cell: (v) => <DateCell value={v.created_at} display="date" /> },
          ]}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle={t('caseDetail.travel.noVisa')}
        />
      </Panel>
      <Panel title={t('caseDetail.travel.flights')} actions={<TravelDeskLink to={`${desk}?tab=travel`} />} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption={t('caseDetail.travel.travelBookings')}
          rows={trips.data?.items}
          loading={trips.isLoading}
          error={trips.error}
          columns={[
            { key: 'kind', header: t('caseDetail.travel.columns.type'), mobile: 'meta', cell: (b) => <span className="inline-flex items-center gap-1.5 text-fg"><Plane className="size-3.5 text-muted" aria-hidden />{TRAVEL_KIND_LABELS[b.kind] ?? b.kind}</span> },
            { key: 'route', header: t('caseDetail.travel.columns.route'), mobile: 'primary', cell: (b) => <TextCell primary={[b.from_location, b.to_location].filter(Boolean).join(' → ') || '—'} secondary={[b.carrier, b.flight_number, b.pnr && t('caseDetail.travel.pnr', { pnr: b.pnr })].filter(Boolean).join(' · ') || undefined} /> },
            { key: 'depart', header: t('caseDetail.travel.columns.departs'), sortable: true, accessor: (b) => b.depart_at ?? '', cell: (b) => <DateCell value={b.depart_at} display="datetime" /> },
            { key: 'status', header: t('caseDetail.travel.columns.status'), mobile: 'badge', sortable: true, accessor: (b) => b.status, cell: (b) => <StatusBadgeCell status={b.status} kind="serviceBooking" label={SERVICE_BOOKING_STATUS_LABELS[b.status]} /> },
          ]}
          defaultSort={{ key: 'depart', direction: 'asc' }}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle={t('caseDetail.travel.noFlights')}
        />
      </Panel>
      <Panel title={t('caseDetail.travel.accommodation')} actions={<TravelDeskLink to={`${desk}?tab=accommodation`} />} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption={t('caseDetail.travel.accommodationBookings')}
          rows={stays.data?.items}
          loading={stays.isLoading}
          error={stays.error}
          columns={[
            { key: 'provider', header: t('caseDetail.travel.columns.stay'), mobile: 'primary', cell: (a) => <TextCell primary={a.provider?.name ?? '—'} secondary={a.room_type ?? undefined} /> },
            {
              key: 'dates',
              header: t('caseDetail.travel.columns.dates'),
              sortable: true,
              accessor: (a) => a.check_in,
              cell: (a) => (
                <TextCell
                  primary={`${formatDate(a.check_in, 'd MMM')} – ${formatDate(a.check_out, 'd MMM yyyy')}`}
                  secondary={`${t('caseDetail.travel.nights', { count: a.nights })} · ${t('caseDetail.travel.guests', { count: a.guests })}`}
                />
              ),
            },
            { key: 'total', header: t('caseDetail.travel.columns.total'), align: 'end', cell: (a) => <MoneyCell minor={a.total_minor} currency={a.currency} /> },
            { key: 'status', header: t('caseDetail.travel.columns.status'), mobile: 'badge', cell: (a) => <StatusBadgeCell status={a.status} kind="serviceBooking" label={SERVICE_BOOKING_STATUS_LABELS[a.status]} /> },
          ]}
          defaultSort={{ key: 'dates', direction: 'asc' }}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle={t('caseDetail.travel.noAccommodation')}
        />
      </Panel>
    </>
  );
}

function TravelDeskLink({ to }: { to: string }) {
  const { t } = useAppTranslation();
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
      {t('caseDetail.travel.deskLink')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

const auditColumns = (t: T): DataTableColumn<AuditLogOut>[] => [
  { key: 'when', header: t('caseDetail.audit.columns.when'), sortable: true, accessor: (l) => l.created_at, mobile: 'meta', cell: (l) => <DateCell value={l.created_at} display="relative" /> },
  { key: 'action', header: t('caseDetail.audit.columns.action'), mobile: 'primary', cell: (l) => <span className="font-medium text-fg">{l.action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')}</span> },
  { key: 'actor', header: t('caseDetail.audit.columns.by'), cell: (l) => <TextCell primary={l.actor_name ?? (l.actor_user_id ? t('caseDetail.audit.user') : t('caseDetail.audit.system'))} secondary={l.actor_role ? USER_ROLE_LABELS[l.actor_role] : undefined} /> },
  {
    key: 'change',
    header: t('caseDetail.audit.columns.change'),
    className: 'max-w-72',
    cell: (l) => {
      const after = l.after ?? {};
      const text = Object.entries(after)
        .filter(([, v]) => v !== null && typeof v !== 'object')
        .slice(0, 3)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
        .join(' · ');
      return <span className="block truncate text-xs text-muted" title={text}>{text || '—'}</span>;
    },
  },
];

function ActivityTab({ c }: { c: CaseDetail }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => auditColumns(t), [t]);
  const audit = useQuery({
    queryKey: [...opsKeys.audit, 'case', c.id],
    queryFn: () => adminApi.auditLogs({ entity_type: 'case', entity_id: c.id, page_size: 50 }),
  });
  return (
    <>
      <Panel title={t('caseDetail.statusHistory')}>
        <Timeline c={c} />
      </Panel>
      <Panel
        title={t('caseDetail.audit.title')}
        description={t('caseDetail.audit.description')}
        actions={
          <Link to={`${opsPaths.audit}?entity_type=case&entity_id=${encodeURIComponent(c.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
            {t('caseDetail.audit.openInLog')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
          </Link>
        }
        bodyClassName="p-0 sm:p-0"
      >
        <DataTable
          caption={t('caseDetail.audit.title')}
          columns={columns}
          rows={audit.data?.items}
          loading={audit.isLoading}
          error={audit.error}
          onRetry={() => void audit.refetch()}
          defaultSort={{ key: 'when', direction: 'desc' }}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle={t('caseDetail.audit.emptyTitle')}
          emptyIcon={<FileText className="size-6" aria-hidden />}
        />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------------------------------------
function CoordinatorPanel({
  detail,
  canAssign,
  open,
  onOpenChange,
}: {
  detail: CaseDetail;
  canAssign: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useAppTranslation();
  const staff = useCoordinatorOptions();
  const [userId, setUserId] = useState(detail.coordinator?.id ?? '');
  useEffect(() => setUserId(detail.coordinator?.id ?? ''), [detail.coordinator?.id, open]);
  const assign = useOpsMutation({
    mutationFn: (uid: string) => casesApi.assignCoordinator(detail.id, { user_id: uid }),
    success: t('caseDetail.coordinator.assigned'),
    invalidate: [opsKeys.cases, opsKeys.dashboard],
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Panel
      title={t('caseDetail.coordinator.title')}
      actions={
        canAssign && !open ? (
          <Button size="xs" variant="ghost" onClick={() => onOpenChange(true)}>
            {detail.coordinator ? t('caseDetail.coordinator.change') : t('caseDetail.coordinator.assign')}
          </Button>
        ) : undefined
      }
    >
      {detail.coordinator ? (
        <div className="flex items-center gap-3">
          <Avatar name={detail.coordinator.full_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{detail.coordinator.full_name}</p>
            <p className="flex items-center gap-1 text-xs text-success-ink">
              <UserCheck className="size-3" aria-hidden /> {t('caseDetail.coordinator.owns')}
            </p>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-warning-ink">
          <UserPlus className="size-4" aria-hidden /> {t('caseDetail.coordinator.none')}
        </p>
      )}
      {canAssign && open && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <Field label={t('caseDetail.coordinator.field')}>
            {(fid) => (
              <Select
                id={fid}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={staff.isLoading ? t('caseDetail.loadingShort') : t('caseDetail.coordinator.placeholder')}
                options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.full_name }))}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('caseDetail.cancel')}
            </Button>
            <Button size="sm" onClick={() => assign.mutate(userId)} disabled={!userId || userId === detail.coordinator?.id} loading={assign.isPending}>
              {t('caseDetail.coordinator.assign')}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Status change
// ---------------------------------------------------------------------------------------------------------
function StatusModal({
  open,
  preset,
  onClose,
  caseId,
  current,
  options,
}: {
  open: boolean;
  preset: CaseStatus | null;
  onClose: () => void;
  caseId: string;
  current: CaseStatus;
  options: CaseStatus[];
}) {
  const { t } = useAppTranslation();
  const [to, setTo] = useState<CaseStatus | ''>('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setTo(preset && options.includes(preset) ? preset : (options[0] ?? ''));
      setNote('');
    }
  }, [open, options, preset]);
  const change = useOpsMutation({
    mutationFn: () => casesApi.changeStatus(caseId, { to_status: to as CaseStatus, note: note.trim() || undefined }),
    success: (c) => t('caseDetail.status.moved', { status: CASE_STATUS_LABELS[c.status] }),
    invalidate: [opsKeys.cases, opsKeys.dashboard],
    onSuccess: onClose,
  });
  const destructive = to === 'cancelled' || to === 'declined';
  const needsNote = destructive && note.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={preset ? t('caseDetail.status.markTitle', { status: CASE_STATUS_LABELS[preset].toLowerCase() }) : t('caseDetail.status.changeTitle')}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('caseDetail.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} disabled={!to || needsNote} loading={change.isPending} onClick={() => change.mutate()}>
            {to ? t('caseDetail.status.moveTo', { status: CASE_STATUS_LABELS[to] }) : t('caseDetail.status.update')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {t('caseDetail.status.current')} <StatusBadge status={current} kind="case" />
        </p>
        {!preset && (
          <Field label={t('caseDetail.status.newStatus')} required>
            {(fid) => (
              <Select id={fid} value={to} onChange={(e) => setTo(e.target.value as CaseStatus)} options={options.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))} />
            )}
          </Field>
        )}
        <Field label={t('caseDetail.status.note')} required={destructive} hint={destructive ? t('caseDetail.status.noteRequiredHint') : t('caseDetail.status.noteOptionalHint')}>
          {(fid) => <Textarea id={fid} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {to === 'cancelled' && (
          <p className="text-xs text-warning-ink">{t('caseDetail.status.cancelWarning')}</p>
        )}
      </div>
    </Modal>
  );
}
