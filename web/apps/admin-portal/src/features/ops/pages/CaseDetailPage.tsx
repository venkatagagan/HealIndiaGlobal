import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
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
import { cn, formatDate, formatDateTime, formatRelative, useDocumentTitle } from '../lib/format';
import { inrFull } from '../lib/inr';
import { STAFF_CASE_TRANSITIONS, useCoordinatorOptions } from '../lib/lookups';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { financePath } from '../../finance/paths';

const FLOW: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];
const TABS = ['overview', 'screening', 'quotes', 'booking', 'travel', 'documents', 'activity'] as const;
type CaseTab = (typeof TABS)[number];

function money(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  return currency === 'INR' || !currency ? inrFull(minor) : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
}

/** When each flow status was first reached, from the timeline. */
function reachedAt(c: CaseDetail): Partial<Record<CaseStatus, string>> {
  const out: Partial<Record<CaseStatus, string>> = { enquiry: c.created_at };
  for (const t of c.timeline) if (!out[t.to_status]) out[t.to_status] = t.created_at;
  return out;
}

export default function CaseDetailPage() {
  const { id = '' } = useParams();
  const perms = useOpsPermissions();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: [...opsKeys.cases, 'detail', id], queryFn: () => casesApi.get(id), enabled: !!id });
  useDocumentTitle(q.data ? `Case ${q.data.case_number}` : 'Case');
  const [tab, setTab] = useDetailTab<CaseTab>(TABS, 'overview');
  const [statusTo, setStatusTo] = useState<CaseStatus | 'pick' | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  if (q.isLoading) return <LoadingState label="Loading case…" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const transitions = STAFF_CASE_TRANSITIONS[c.status] ?? [];
  const urgency = c.urgency ?? c.screening?.urgency ?? c.screening?.ai_result?.urgency ?? null;
  const reached = reachedAt(c);
  const closed = c.status === 'cancelled' || c.status === 'declined';
  const lastFlow = closed
    ? Math.max(
        0,
        ...c.timeline.map((t) => (t.from_status ? FLOW.indexOf(t.from_status) : -1)),
        ...c.timeline.map((t) => FLOW.indexOf(t.to_status)),
      )
    : FLOW.indexOf(c.status);
  const steps: TrackStep[] = FLOW.map((s) => ({
    key: s,
    label: CASE_STATUS_LABELS[s],
    at: reached[s] ? formatDate(reached[s], 'd MMM') : null,
  }));
  const closedEntry = closed ? [...c.timeline].reverse().find((t) => t.to_status === c.status) : undefined;
  const sentQuotes = c.quotes.filter((x) => x.status !== 'draft');
  const latestQuote = [...c.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const messagesTo = `${opsPaths.messages}?case_id=${encodeURIComponent(c.id)}`;

  const next = nextAction(c, perms.manageCases, {
    assign: () => setAssignOpen(true),
    status: (s) => setStatusTo(s),
    go: (to) => navigate(to),
    messagesTo,
    openBooking: () => setTab('booking'),
  });

  return (
    <div>
      <DetailHero
        back={{ to: opsPaths.cases, label: 'Cases' }}
        eyebrow="Case"
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
            <ArrowRight className="size-3.5" aria-hidden />
            <Link to={opsPaths.hospital(c.hospital.id)} className="hover:text-fg hover:underline">
              {c.hospital.name}
            </Link>
            <span aria-hidden>·</span>
            <span>Opened {formatDate(c.created_at)}</span>
            <span aria-hidden>·</span>
            <span title={formatDateTime(c.updated_at)}>updated {formatRelative(c.updated_at)}</span>
          </span>
        }
        actions={
          <>
            <LinkButton to={messagesTo} variant="outline" size="sm" leftIcon={<MessageSquare className="size-4" aria-hidden />}>
              Messages
            </LinkButton>
            {perms.manageCases && transitions.length > 0 && (
              <Button variant="outline" size="sm" leftIcon={<MoreHorizontal className="size-4" aria-hidden />} onClick={() => setStatusTo('pick')}>
                Change status
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
            title="Screened as a possible emergency"
            action={
              <LinkButton to={messagesTo} size="sm" variant="danger">
                Contact patient
              </LinkButton>
            }
          >
            {c.emergency_acknowledged_at
              ? `The patient acknowledged the emergency guidance on ${formatDateTime(c.emergency_acknowledged_at)}.`
              : 'The patient has not acknowledged the emergency guidance yet - quote acceptance and booking stay blocked until they do.'}
            {c.screening?.red_flags.length ? ` Red flags: ${c.screening.red_flags.join(', ')}.` : ''}
          </Banner>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <DetailTabs
            label="Case sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'screening', label: 'Screening', disabled: !c.screening },
              { value: 'quotes', label: 'Quotes', count: c.quotes.length },
              { value: 'booking', label: 'Booking & payments' },
              { value: 'travel', label: 'Travel' },
              { value: 'documents', label: 'Documents', count: c.documents.length },
              { value: 'activity', label: 'Activity' },
            ]}
          />
          <div role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} className="space-y-4">
            {tab === 'overview' && <OverviewTab c={c} latestQuote={latestQuote} sentQuotes={sentQuotes.length} onTab={setTab} />}
            {tab === 'screening' && c.screening && <ScreeningTab c={c} />}
            {tab === 'quotes' && <QuotesTab quotes={c.quotes} />}
            {tab === 'booking' && <BookingTab c={c} canSeeFinance={perms.role === 'finance' || perms.role === 'super_admin'} />}
            {tab === 'travel' && <TravelTab caseId={c.id} />}
            {tab === 'documents' && (
              <Panel title="Documents" description="Medical reports, IDs and invoices shared on this case">
                <DocumentList documents={c.documents} canVerify={perms.isStaff} invalidate={[opsKeys.cases]} />
              </Panel>
            )}
            {tab === 'activity' && <ActivityTab c={c} />}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="Key facts">
          <CoordinatorPanel detail={c} canAssign={perms.manageCases} open={assignOpen} onOpenChange={setAssignOpen} />
          <Panel title="Key facts">
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={c.patient.full_name} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{c.patient.full_name}</p>
                <p className="truncate text-xs text-muted">
                  {[c.patient.nationality, c.patient.gender ? GENDER_LABELS[c.patient.gender] : null, c.patient.age != null ? `${c.patient.age} years` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Patient'}
                </p>
              </div>
            </div>
            <FactList
              items={[
                { label: 'Hospital', icon: <Building2 className="size-3.5" aria-hidden />, value: <Link to={opsPaths.hospital(c.hospital.id)} className="text-primary-ink hover:underline">{c.hospital.name}</Link> },
                { label: 'City', value: c.hospital.city },
                { label: 'Doctor', icon: <Stethoscope className="size-3.5" aria-hidden />, value: c.doctor?.full_name ?? '—' },
                { label: 'Treatment', value: c.procedure?.name ?? c.specialty?.name ?? '—' },
                { label: 'Source', icon: <Users className="size-3.5" aria-hidden />, value: c.agent ? `Agent · ${c.agent.agency_name}` : 'Direct' },
                { label: 'Latest quote', value: latestQuote ? money(latestQuote.total_minor, latestQuote.currency) : '—' },
              ]}
            />
          </Panel>
          {c.booking && (
            <Panel
              title="Payment"
              actions={<StatusBadge status={c.booking.status} kind="booking" />}
              footer={
                <button type="button" onClick={() => setTab('booking')} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
                  Booking & payments <ArrowRight className="size-3.5" aria-hidden />
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
  c: CaseDetail,
  canManage: boolean,
  h: { assign: () => void; status: (s: CaseStatus) => void; go: (to: string) => void; messagesTo: string; openBooking: () => void },
): { label: string; icon: ReactNode; onClick: () => void; hint?: string; danger?: boolean } | null {
  const go = (to: string) => () => h.go(to);
  if (!canManage) return null;
  if (!c.coordinator && ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment'].includes(c.status)) {
    return { label: 'Assign coordinator', icon: <UserPlus className="size-4" aria-hidden />, onClick: h.assign, hint: 'No coordinator owns this case yet - assign one so the patient has a single point of contact.' };
  }
  switch (c.status) {
    case 'enquiry':
      return { label: 'Chase hospital quote', icon: <Hourglass className="size-4" aria-hidden />, onClick: go(h.messagesTo), hint: 'Waiting for the hospital to send a quote.' };
    case 'quoted':
      return { label: 'Follow up with patient', icon: <MessageSquare className="size-4" aria-hidden />, onClick: go(h.messagesTo), hint: 'A quote was sent - the patient needs to accept or decline it.' };
    case 'accepted':
      return { label: 'Check payment', icon: <ClipboardList className="size-4" aria-hidden />, onClick: h.openBooking, hint: 'Quote accepted - the booking is confirmed once the deposit is paid.' };
    case 'booked':
      return { label: 'Mark admitted', icon: <CheckCircle2 className="size-4" aria-hidden />, onClick: () => h.status('in_treatment'), hint: c.booking?.admission_date ? `Admission planned for ${formatDate(c.booking.admission_date)}.` : undefined };
    case 'in_treatment':
      return { label: 'Mark completed', icon: <CheckCircle2 className="size-4" aria-hidden />, onClick: () => h.status('completed'), hint: 'Complete the case once the patient is discharged.' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------------------
function OverviewTab({ c, latestQuote, sentQuotes, onTab }: { c: CaseDetail; latestQuote: QuoteOut | null; sentQuotes: number; onTab: (t: CaseTab) => void }) {
  const ai = c.screening?.ai_result;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <MiniStat label="Quotes sent" value={String(sentQuotes)} hint={latestQuote ? `Latest ${formatRelative(latestQuote.created_at)}` : 'None yet'} onClick={() => onTab('quotes')} />
        <MiniStat
          label="Latest quote"
          value={latestQuote ? money(latestQuote.total_minor, latestQuote.currency) : '—'}
          hint={latestQuote ? <StatusBadge status={latestQuote.status} kind="quote" /> : 'Waiting for the hospital'}
          onClick={() => onTab('quotes')}
        />
        <MiniStat
          label="Admission"
          value={c.booking?.admission_date ? formatDate(c.booking.admission_date) : '—'}
          hint={c.booking ? BOOKING_STATUS_LABELS[c.booking.status] : 'Not booked yet'}
          onClick={() => onTab('booking')}
        />
      </div>
      <Panel title="Case summary">
        <FieldGrid
          items={[
            { label: 'Patient', value: c.patient.full_name },
            { label: 'Nationality', value: c.patient.nationality ?? '—' },
            { label: 'Specialty', value: c.specialty?.name ?? c.doctor?.specialty_name ?? '—' },
            { label: 'Procedure', value: c.procedure?.name ?? '—' },
            { label: 'Doctor', value: c.doctor?.full_name ?? '—' },
            { label: 'Opened', value: formatDateTime(c.created_at) },
          ]}
        />
        {(c.patient_notes || c.medical_summary) && (
          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2">
            {c.patient_notes && <Prose title="Patient notes">{c.patient_notes}</Prose>}
            {c.medical_summary && <Prose title="Medical summary">{c.medical_summary}</Prose>}
          </div>
        )}
      </Panel>
      {ai && (
        <Panel
          title="AI screening at a glance"
          actions={
            <button type="button" onClick={() => onTab('screening')} className="text-xs font-medium text-primary-ink hover:underline">
              Full screening
            </button>
          }
        >
          <p className="text-sm text-fg">{ai.summary}</p>
        </Panel>
      )}
      <Panel title="Status history">
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
      className="min-w-0 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-colors sm:p-4 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  const items = [
    ...[...c.timeline].reverse().map((t) => ({
      key: `${t.created_at}-${t.to_status}`,
      title: t.from_status ? (
        <>
          {CASE_STATUS_LABELS[t.from_status]} <ArrowRight className="inline size-3" aria-hidden /> <strong>{CASE_STATUS_LABELS[t.to_status]}</strong>
        </>
      ) : (
        <strong>{CASE_STATUS_LABELS[t.to_status]}</strong>
      ),
      at: t.created_at,
      by: t.changed_by_name,
      note: t.note,
      tone: t.to_status === 'cancelled' || t.to_status === 'declined' ? 'bg-danger' : 'bg-primary',
    })),
    { key: 'created', title: <strong>Case opened</strong>, at: c.created_at, by: null, note: null, tone: 'bg-info' },
  ];
  return (
    <ol className="relative ml-1.5 space-y-4 border-l border-border pl-5">
      {items.map((t) => (
        <li key={t.key} className="relative">
          <span className={cn('absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-surface', t.tone)} aria-hidden />
          <p className="text-sm text-fg">{t.title}</p>
          <p className="text-xs text-muted">
            {formatDateTime(t.at)}
            {t.by ? ` · ${t.by}` : ''}
          </p>
          {t.note && <p className="mt-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-fg">{t.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function ScreeningTab({ c }: { c: CaseDetail }) {
  const s = c.screening!;
  const ai = s.ai_result;
  return (
    <>
      <Panel
        title="Patient-reported symptoms"
        actions={<StatusBadge status={s.status} kind="screening" />}
      >
        <FieldGrid
          columns={3}
          items={[
            { label: 'Body areas', value: s.body_areas.length ? s.body_areas.map((a) => a.replace(/_/g, ' ')).join(', ') : '—' },
            { label: 'Pain intensity', value: s.pain_intensity != null ? `${s.pain_intensity} / 10` : '—' },
            { label: 'Duration', value: s.duration_value ? `${s.duration_value} ${s.duration_unit ?? ''}` : '—' },
            { label: 'Previous treatment', value: s.previous_treatments.length ? s.previous_treatments.map((p) => p.replace(/_/g, ' ')).join(', ') : 'None' },
            { label: 'Home country', value: s.home_country ?? '—' },
            { label: 'Submitted', value: formatDateTime(s.submitted_at ?? s.created_at) },
          ]}
        />
        {s.notes && (
          <div className="mt-4 border-t border-border pt-4">
            <Prose title="Notes">{s.notes}</Prose>
          </div>
        )}
      </Panel>
      {ai ? (
        <Panel
          title="AI triage"
          description={ai.disclaimer}
          actions={
            <>
              <StatusBadge status={ai.urgency} kind="urgency" />
              <Badge tone={ai.engine === 'claude' ? 'accent' : 'neutral'}>{ai.engine === 'claude' ? 'AI triage' : 'Rules engine'}</Badge>
            </>
          }
        >
          <p className="text-sm text-fg">{ai.summary}</p>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h4 className="text-xs font-medium text-muted">Suggested specialties</h4>
              <ul className="mt-2 space-y-2">
                {ai.suggested_specialties.map((sp) => (
                  <li key={sp.slug}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-fg">{sp.name}</span>
                      <span className="tabular-nums text-muted">{Math.round(sp.confidence * 100)}%</span>
                    </div>
                    <ProgressBar value={Math.round(sp.confidence * 100)} className="mt-1" />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted">Possible conditions</h4>
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
                <h4 className="text-xs font-medium text-muted">Recommended tests</h4>
                <p className="mt-1 text-sm text-fg">{ai.recommended_tests.join(', ')}</p>
              </div>
            )}
            {ai.red_flags.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted">Red flags</h4>
                <p className="mt-1 text-sm text-danger-ink">{ai.red_flags.join(', ')}</p>
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title="AI triage">
          <EmptyState compact title="No AI result" description={s.error ?? 'The screening has not been processed.'} />
        </Panel>
      )}
    </>
  );
}

const LINE_COLUMNS: DataTableColumn<QuoteLineItem & { currency: string }>[] = [
  { key: 'category', header: 'Category', sortable: true, accessor: (l) => QUOTE_LINE_CATEGORY_LABELS[l.category] ?? l.category, cell: (l) => <TextCell primary={QUOTE_LINE_CATEGORY_LABELS[l.category] ?? l.category} />, mobile: 'meta' },
  { key: 'description', header: 'Description', mobile: 'primary', cell: (l) => <span className="text-fg">{l.description}</span> },
  { key: 'amount', header: 'Amount', align: 'end', sortable: true, accessor: (l) => l.amount_minor, mobile: 'badge', cell: (l) => <span className="tabular-nums">{money(l.amount_minor, l.currency)}</span> },
];

function QuotesTab({ quotes }: { quotes: QuoteOut[] }) {
  const sorted = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (sorted.length === 0) {
    return (
      <Panel title="Quotes">
        <EmptyState compact icon={<Hourglass className="size-6" aria-hidden />} title="No quote yet" description="The hospital has not sent a quote for this case." />
      </Panel>
    );
  }
  return (
    <>
      {sorted.map((quote, i) => (
        <Panel
          key={quote.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {i === 0 ? 'Latest quote' : `Quote from ${formatDate(quote.created_at)}`}
              <StatusBadge status={quote.status} kind="quote" />
            </span>
          }
          description={`Sent ${formatDateTime(quote.created_at)}${quote.prepared_by_name ? ` by ${quote.prepared_by_name}` : ''}`}
          actions={<span className="text-lg font-semibold tabular-nums text-fg">{money(quote.total_minor, quote.currency)}</span>}
          bodyClassName="space-y-4"
        >
          {quote.treatment_plan && <Prose title="Treatment plan">{quote.treatment_plan}</Prose>}
          <DataTable
            caption="Quote line items"
            columns={LINE_COLUMNS}
            rows={quote.line_items.map((l) => ({ ...l, currency: quote.currency }))}
            rowKey={(_, idx) => idx}
            density="compact"
            showViewOptions={false}
            responsive="cards"
            emptyTitle="No line items"
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>Estimated stay: <strong className="text-fg">{quote.estimated_stay_days ?? '—'} days</strong></span>
            <span>Valid until: <strong className="text-fg">{formatDate(quote.valid_until)}</strong></span>
            {quote.accepted_at && <span>Accepted: <strong className="text-fg">{formatDateTime(quote.accepted_at)}</strong></span>}
            {quote.rejected_reason && <span className="text-danger-ink">Rejected: {quote.rejected_reason}</span>}
          </div>
        </Panel>
      ))}
    </>
  );
}

function PaymentProgress({ booking }: { booking: NonNullable<CaseDetail['booking']> }) {
  const pct = booking.total_minor > 0 ? Math.min(100, Math.round((booking.amount_paid_minor / booking.total_minor) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold text-fg">{money(booking.amount_paid_minor, booking.currency)}</span>
        <span className="text-xs text-muted">of {money(booking.total_minor, booking.currency)}</span>
      </div>
      <ProgressBar value={pct} className="mt-2" tone={pct >= 100 ? 'success' : 'primary'} />
      <p className="mt-2 text-xs text-muted">
        {booking.balance_due_minor > 0 ? (
          <>
            Balance due <strong className="text-fg">{money(booking.balance_due_minor, booking.currency)}</strong>
          </>
        ) : (
          'Fully paid'
        )}
        {booking.amount_refunded_minor > 0 && ` · refunded ${money(booking.amount_refunded_minor, booking.currency)}`}
      </p>
    </div>
  );
}

function orderColumns(canOpen: boolean): DataTableColumn<PaymentOrderOut>[] {
  return [
    { key: 'order', header: 'Order', mobile: 'primary', cell: (o) => <IdCell value={o.order_number} secondary={PAYMENT_PURPOSE_LABELS[o.purpose] ?? o.purpose} /> },
    { key: 'status', header: 'Status', sortable: true, accessor: (o) => o.status, mobile: 'badge', cell: (o) => <StatusBadgeCell status={o.status} kind="order" label={ORDER_STATUS_LABELS[o.status]} /> },
    { key: 'amount', header: 'Amount', align: 'end', sortable: true, accessor: (o) => o.base_amount_minor, cell: (o) => <MoneyCell minor={o.amount_minor} currency={o.currency} secondary={o.currency !== 'INR' ? inrFull(o.base_amount_minor) : undefined} /> },
    { key: 'created', header: 'Created', sortable: true, accessor: (o) => o.created_at, cell: (o) => <DateCell value={o.created_at} display="date" /> },
    { key: 'paid', header: 'Paid', sortable: true, accessor: (o) => o.paid_at ?? '', cell: (o) => <DateCell value={o.paid_at} display="datetime" /> },
    ...(canOpen
      ? [{ key: 'open', header: '', title: 'Open', hideable: false, mobile: 'hidden' as const, cell: () => <ExternalLink className="size-4 text-muted" aria-hidden />, exportable: false }]
      : []),
  ];
}

function BookingTab({ c, canSeeFinance }: { c: CaseDetail; canSeeFinance: boolean }) {
  const b = c.booking;
  const orders = useQuery({
    queryKey: ['payments', 'orders', 'booking', b?.id],
    queryFn: () => paymentsApi.listOrders({ booking_id: b!.id, page_size: 50 }),
    enabled: !!b,
  });
  const cols = useMemo(() => orderColumns(canSeeFinance), [canSeeFinance]);
  if (!b) {
    return (
      <Panel title="Booking">
        <EmptyState compact icon={<CalendarDays className="size-6" aria-hidden />} title="Not booked yet" description="A booking is created when the patient accepts a quote and pays the deposit." />
      </Panel>
    );
  }
  return (
    <>
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            Booking <span className="font-mono text-xs text-muted">{b.booking_number}</span>
            <StatusBadge status={b.status} kind="booking" />
          </span>
        }
        actions={
          <LinkButton to={`${opsPaths.bookings}?q=${encodeURIComponent(b.booking_number)}`} size="sm" variant="outline" rightIcon={<ArrowRight className="size-3.5" aria-hidden />}>
            Manage booking
          </LinkButton>
        }
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <FieldGrid
            items={[
              { label: 'Admission', value: formatDate(b.admission_date) },
              { label: 'Discharge', value: formatDate(b.discharge_date) },
              { label: 'Payment option', value: PAYMENT_OPTION_LABELS[b.payment_option] },
              { label: 'Package', value: b.package?.name ?? '—' },
              { label: 'Subtotal', value: money(b.subtotal_minor, b.currency) },
              { label: 'Service fee + tax', value: money(b.service_fee_minor + b.tax_minor, b.currency) },
              { label: 'Discount', value: b.discount_minor ? `− ${money(b.discount_minor, b.currency)}` : '—' },
              { label: 'Total', value: <strong>{money(b.total_minor, b.currency)}</strong> },
            ]}
          />
          <div className="rounded-xl bg-surface-2/60 p-4">
            <PaymentProgress booking={b} />
          </div>
        </div>
        {b.cancel_reason && <p className="mt-4 text-sm text-danger-ink">Cancelled: {b.cancel_reason}</p>}
      </Panel>
      <Panel title="Payment orders" description="Deposits, balances and installments raised for this booking" bodyClassName="p-0 sm:p-0">
        <DataTable
          caption="Payment orders"
          columns={cols}
          rows={orders.data?.items}
          loading={orders.isLoading}
          error={orders.error}
          onRetry={() => void orders.refetch()}
          defaultSort={{ key: 'created', direction: 'desc' }}
          rowHref={canSeeFinance ? (o) => financePath(`orders/${o.id}`) : undefined}
          rowLabel={(o) => `Open order ${o.order_number}`}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle="No payment orders yet"
        />
      </Panel>
    </>
  );
}

function TravelTab({ caseId }: { caseId: string }) {
  const visas = useQuery({ queryKey: [...opsKeys.travel, 'visa', caseId], queryFn: () => travelApi.listVisaRequests({ case_id: caseId, page_size: 50 }) });
  const trips = useQuery({ queryKey: [...opsKeys.travel, 'trips', caseId], queryFn: () => travelApi.listTravelBookings({ case_id: caseId, page_size: 50 }) });
  const stays = useQuery({ queryKey: [...opsKeys.travel, 'stays', caseId], queryFn: () => travelApi.listAccommodationBookings({ case_id: caseId, page_size: 50 }) });
  const desk = `${opsPaths.travel}`;
  return (
    <>
      <Panel title="Visa" actions={<TravelDeskLink to={`${desk}?tab=visa`} />} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption="Visa requests"
          rows={visas.data?.items}
          loading={visas.isLoading}
          error={visas.error}
          columns={[
            { key: 'type', header: 'Visa type', mobile: 'primary', cell: (v) => <span className="text-fg">{VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type}</span> },
            { key: 'status', header: 'Status', mobile: 'badge', sortable: true, accessor: (v) => v.status, cell: (v) => <StatusBadgeCell status={v.status} kind="visa" label={VISA_STATUS_LABELS[v.status]} /> },
            { key: 'ref', header: 'Reference', cell: (v) => <TextCell primary={v.application_reference ?? '—'} /> },
            { key: 'requested', header: 'Requested', sortable: true, accessor: (v) => v.created_at, cell: (v) => <DateCell value={v.created_at} display="date" /> },
          ]}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle="No visa request"
        />
      </Panel>
      <Panel title="Flights & transfers" actions={<TravelDeskLink to={`${desk}?tab=travel`} />} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption="Travel bookings"
          rows={trips.data?.items}
          loading={trips.isLoading}
          error={trips.error}
          columns={[
            { key: 'kind', header: 'Type', mobile: 'meta', cell: (t) => <span className="inline-flex items-center gap-1.5 text-fg"><Plane className="size-3.5 text-muted" aria-hidden />{TRAVEL_KIND_LABELS[t.kind] ?? t.kind}</span> },
            { key: 'route', header: 'Route', mobile: 'primary', cell: (t) => <TextCell primary={[t.from_location, t.to_location].filter(Boolean).join(' → ') || '—'} secondary={[t.carrier, t.flight_number, t.pnr && `PNR ${t.pnr}`].filter(Boolean).join(' · ') || undefined} /> },
            { key: 'depart', header: 'Departs', sortable: true, accessor: (t) => t.depart_at ?? '', cell: (t) => <DateCell value={t.depart_at} display="datetime" /> },
            { key: 'status', header: 'Status', mobile: 'badge', sortable: true, accessor: (t) => t.status, cell: (t) => <StatusBadgeCell status={t.status} kind="serviceBooking" label={SERVICE_BOOKING_STATUS_LABELS[t.status]} /> },
          ]}
          defaultSort={{ key: 'depart', direction: 'asc' }}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle="No flights or transfers"
        />
      </Panel>
      <Panel title="Accommodation" actions={<TravelDeskLink to={`${desk}?tab=accommodation`} />} bodyClassName="p-0 sm:p-0">
        <DataTable
          caption="Accommodation bookings"
          rows={stays.data?.items}
          loading={stays.isLoading}
          error={stays.error}
          columns={[
            { key: 'provider', header: 'Stay', mobile: 'primary', cell: (a) => <TextCell primary={a.provider?.name ?? '—'} secondary={a.room_type ?? undefined} /> },
            { key: 'dates', header: 'Dates', sortable: true, accessor: (a) => a.check_in, cell: (a) => <TextCell primary={`${formatDate(a.check_in, 'd MMM')} – ${formatDate(a.check_out, 'd MMM yyyy')}`} secondary={`${a.nights} night${a.nights === 1 ? '' : 's'} · ${a.guests} guest${a.guests === 1 ? '' : 's'}`} /> },
            { key: 'total', header: 'Total', align: 'end', cell: (a) => <MoneyCell minor={a.total_minor} currency={a.currency} /> },
            { key: 'status', header: 'Status', mobile: 'badge', cell: (a) => <StatusBadgeCell status={a.status} kind="serviceBooking" label={SERVICE_BOOKING_STATUS_LABELS[a.status]} /> },
          ]}
          defaultSort={{ key: 'dates', direction: 'asc' }}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle="No accommodation booked"
        />
      </Panel>
    </>
  );
}

function TravelDeskLink({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
      Travel desk <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

const AUDIT_COLUMNS: DataTableColumn<AuditLogOut>[] = [
  { key: 'when', header: 'When', sortable: true, accessor: (l) => l.created_at, mobile: 'meta', cell: (l) => <DateCell value={l.created_at} display="relative" /> },
  { key: 'action', header: 'Action', mobile: 'primary', cell: (l) => <span className="font-medium text-fg">{l.action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')}</span> },
  { key: 'actor', header: 'By', cell: (l) => <TextCell primary={l.actor_name ?? (l.actor_user_id ? 'User' : 'System')} secondary={l.actor_role ? USER_ROLE_LABELS[l.actor_role] : undefined} /> },
  {
    key: 'change',
    header: 'Change',
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
  const audit = useQuery({
    queryKey: [...opsKeys.audit, 'case', c.id],
    queryFn: () => adminApi.auditLogs({ entity_type: 'case', entity_id: c.id, page_size: 50 }),
  });
  return (
    <>
      <Panel title="Status history">
        <Timeline c={c} />
      </Panel>
      <Panel
        title="Audit trail"
        description="Every change recorded on this case"
        actions={
          <Link to={`${opsPaths.audit}?entity_type=case&entity_id=${encodeURIComponent(c.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
            Open in audit log <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
        bodyClassName="p-0 sm:p-0"
      >
        <DataTable
          caption="Audit trail"
          columns={AUDIT_COLUMNS}
          rows={audit.data?.items}
          loading={audit.isLoading}
          error={audit.error}
          onRetry={() => void audit.refetch()}
          defaultSort={{ key: 'when', direction: 'desc' }}
          showViewOptions={false}
          responsive="cards"
          className="rounded-none border-0 shadow-none"
          emptyTitle="No audit entries"
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
  const staff = useCoordinatorOptions();
  const [userId, setUserId] = useState(detail.coordinator?.id ?? '');
  useEffect(() => setUserId(detail.coordinator?.id ?? ''), [detail.coordinator?.id, open]);
  const assign = useOpsMutation({
    mutationFn: (uid: string) => casesApi.assignCoordinator(detail.id, { user_id: uid }),
    success: 'Coordinator assigned',
    invalidate: [opsKeys.cases, opsKeys.dashboard],
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Panel
      title="Coordinator"
      actions={
        canAssign && !open ? (
          <Button size="xs" variant="ghost" onClick={() => onOpenChange(true)}>
            {detail.coordinator ? 'Change' : 'Assign'}
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
              <UserCheck className="size-3" aria-hidden /> Owns this case
            </p>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-warning-ink">
          <UserPlus className="size-4" aria-hidden /> No coordinator assigned
        </p>
      )}
      {canAssign && open && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <Field label="Support coordinator">
            {(fid) => (
              <Select
                id={fid}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={staff.isLoading ? 'Loading…' : 'Select a coordinator'}
                options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.full_name }))}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => assign.mutate(userId)} disabled={!userId || userId === detail.coordinator?.id} loading={assign.isPending}>
              Assign
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
    success: (c) => `Case moved to ${CASE_STATUS_LABELS[c.status]}`,
    invalidate: [opsKeys.cases, opsKeys.dashboard],
    onSuccess: onClose,
  });
  const destructive = to === 'cancelled' || to === 'declined';
  const needsNote = destructive && note.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={preset ? `Mark case ${CASE_STATUS_LABELS[preset].toLowerCase()}` : 'Change case status'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} disabled={!to || needsNote} loading={change.isPending} onClick={() => change.mutate()}>
            {to ? `Move to ${CASE_STATUS_LABELS[to]}` : 'Update status'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Current status: <StatusBadge status={current} kind="case" />
        </p>
        {!preset && (
          <Field label="New status" required>
            {(fid) => (
              <Select id={fid} value={to} onChange={(e) => setTo(e.target.value as CaseStatus)} options={options.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))} />
            )}
          </Field>
        )}
        <Field label="Note" required={destructive} hint={destructive ? 'Explain why; the patient and hospital are notified.' : 'Optional, shown in the status history.'}>
          {(fid) => <Textarea id={fid} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {to === 'cancelled' && (
          <p className="text-xs text-warning-ink">If the case has a paid booking, cancel the booking from Bookings so the refund policy is applied.</p>
        )}
      </div>
    </Modal>
  );
}
