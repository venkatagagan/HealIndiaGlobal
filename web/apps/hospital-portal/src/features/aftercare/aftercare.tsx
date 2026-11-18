import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, HeartPulse, Video, XCircle } from 'lucide-react';
import { api, consultationsApi, errorMessage, type ConsultationOut, type ConsultationUpdateIn } from '@hig/shared/api';
import { fetchAllPages } from '@hig/shared/lib';
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorState, FormField, Input, Modal, Skeleton, StatusBadge } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDate, formatDateTime, formatRelative } from '../../lib/format';

// ---------------------------------------------------------------------------------------------- types
/** Phase-1 consultation fields (the shared ConsultationOut predates them). */
export type Consultation = ConsultationOut & {
  kind?: 'standard' | 'followup';
  /** follow-ups: roughly when the call should happen; the hospital confirms the exact time */
  due_at?: string | null;
  followup_day?: number | null;
};

/** GET /aftercare/checkins?case_id= */
export interface Checkin {
  id: string;
  case_id: string;
  case_number: string | null;
  day: number;
  due_at: string;
  is_due: boolean;
  submitted_at: string | null;
  answers: {
    pain?: number;
    fever?: boolean;
    wound_concerns?: boolean;
    breathlessness?: boolean;
    medication_adherence?: 'all' | 'some' | 'none';
  };
  free_text: string | null;
  red_flags: string[];
}

export const aftercareKeys = {
  consultations: ['consultations', 'hospital'] as const,
  checkins: (caseId: string) => ['aftercare-checkins', caseId] as const,
};

export function useConsultations() {
  return useQuery({
    queryKey: aftercareKeys.consultations,
    queryFn: () => fetchAllPages((page, size) => consultationsApi.list({ page, page_size: size }), { maxRows: 1000 }) as Promise<Consultation[]>,
  });
}

export function fetchCheckins(caseId: string): Promise<Checkin[]> {
  return api.get<Checkin[]>('/aftercare/checkins', { case_id: caseId });
}

/** Submitted check-ins with red flags first (newest first), then other answers, then the ones still due. */
export function sortCheckins(list: Checkin[]): Checkin[] {
  const rank = (c: Checkin) => (c.submitted_at ? (c.red_flags.length > 0 ? 0 : 1) : c.is_due ? 2 : 3);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.submitted_at && b.submitted_at) return b.submitted_at.localeCompare(a.submitted_at);
    return a.due_at.localeCompare(b.due_at);
  });
}

/** Requested calls first (by due date), then scheduled (soonest first), then completed / cancelled. */
export function sortConsultations(list: Consultation[]): Consultation[] {
  const rank = (c: Consultation) => ({ requested: 0, scheduled: 1, completed: 2, cancelled: 3 })[c.status] ?? 4;
  const when = (c: Consultation) => c.scheduled_at ?? c.due_at ?? c.created_at;
  return [...list].sort((a, b) => rank(a) - rank(b) || (rank(a) >= 2 ? when(b).localeCompare(when(a)) : when(a).localeCompare(when(b))));
}

const RED_FLAGS = ['fever', 'breathlessness', 'severe_pain', 'wound_concerns'] as const;

// ---------------------------------------------------------------------------------------------- check-ins
export function CheckinItem({ checkin, patientName, showCase = true }: { checkin: Checkin; patientName?: string; showCase?: boolean }) {
  const { t } = useAppTranslation();
  const a = checkin.answers ?? {};
  const flagged = checkin.red_flags.length > 0;
  const yesNo = (v: boolean | undefined) => (v === undefined ? '—' : v ? t('aftercare.checkins.yes') : t('aftercare.checkins.no'));
  return (
    <li className={flagged ? 'border-s-4 border-danger-500 bg-danger-soft/40 px-4 py-3' : 'px-4 py-3'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {flagged && <AlertTriangle className="size-4 text-danger-ink" aria-hidden />}
            {t('aftercare.checkins.day', { day: checkin.day })}
            {showCase && checkin.case_number && (
              <Link to={`/cases/${checkin.case_id}`} className="font-mono text-xs font-normal text-primary-ink hover:underline">
                {checkin.case_number}
              </Link>
            )}
            {patientName && <span className="font-normal text-muted">· {patientName}</span>}
          </p>
          <p className="text-xs text-muted">
            {checkin.submitted_at
              ? t('aftercare.checkins.answered', { date: formatDateTime(checkin.submitted_at) })
              : checkin.is_due
                ? t('aftercare.checkins.notAnswered', { date: formatDate(checkin.due_at) })
                : t('aftercare.checkins.dueOn', { date: formatDate(checkin.due_at) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {flagged
            ? checkin.red_flags.map((f) => (
                <Badge key={f} tone="red">
                  {(RED_FLAGS as readonly string[]).includes(f) ? t(`aftercare.flags.${f}`) : f}
                </Badge>
              ))
            : checkin.submitted_at
              ? <Badge tone="green">{t('aftercare.checkins.noFlags')}</Badge>
              : <Badge tone={checkin.is_due ? 'amber' : 'neutral'}>{checkin.is_due ? t('aftercare.checkins.awaiting') : t('aftercare.checkins.upcoming')}</Badge>}
        </div>
      </div>
      {checkin.submitted_at && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
          <div>
            <dt className="text-muted">{t('aftercare.checkins.pain')}</dt>
            <dd className="font-medium text-fg">{a.pain != null ? t('aftercare.checkins.painValue', { value: a.pain }) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('aftercare.checkins.fever')}</dt>
            <dd className="font-medium text-fg">{yesNo(a.fever)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('aftercare.checkins.wound')}</dt>
            <dd className="font-medium text-fg">{yesNo(a.wound_concerns)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('aftercare.checkins.breathlessness')}</dt>
            <dd className="font-medium text-fg">{yesNo(a.breathlessness)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('aftercare.checkins.medication')}</dt>
            <dd className="font-medium text-fg">{a.medication_adherence ? t(`aftercare.adherence.${a.medication_adherence}`) : '—'}</dd>
          </div>
        </dl>
      )}
      {checkin.free_text && <p className="mt-2 text-sm whitespace-pre-line text-fg">{checkin.free_text}</p>}
    </li>
  );
}

/** Check-ins of one case (case detail). */
export function CaseCheckinsCard({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  const q = useQuery({ queryKey: aftercareKeys.checkins(caseId), queryFn: () => fetchCheckins(caseId) });
  const list = useMemo(() => sortCheckins(q.data ?? []), [q.data]);
  if (q.isPending) return <Skeleton className="h-24" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (list.length === 0) return <EmptyState title={t('aftercare.checkins.emptyCase')} className="py-6" />;
  return (
    <ul className="divide-y divide-border">
      {list.map((c) => (
        <CheckinItem key={c.id} checkin={c} showCase={false} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------- consultations
export function ConsultationItem({ item, showCase = true }: { item: Consultation; showCase?: boolean }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [scheduling, setScheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const followup = item.kind === 'followup';

  const update = useMutation({
    mutationFn: (body: ConsultationUpdateIn) => consultationsApi.update(item.id, body),
    onSuccess: (_, body) => {
      toast.success(
        body.status === 'completed'
          ? t('aftercare.consultations.completedToast')
          : body.status === 'cancelled'
            ? t('aftercare.consultations.cancelledToast')
            : t('aftercare.consultations.scheduledToast'),
      );
      setScheduling(false);
      setCancelling(false);
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {followup ? (
              <Badge tone="violet">
                {item.followup_day != null ? t('aftercare.consultations.followupDay', { day: item.followup_day }) : t('aftercare.consultations.followup')}
              </Badge>
            ) : (
              <Badge>{t('aftercare.consultations.standard')}</Badge>
            )}
            {item.patient?.full_name ?? t('common.patient')}
            {showCase && item.case_number && (
              <Link to={`/cases/${item.case_id}`} className="font-mono text-xs font-normal text-primary-ink hover:underline">
                {item.case_number}
              </Link>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {[
              item.doctor?.full_name,
              item.scheduled_at
                ? t('aftercare.consultations.scheduledFor', { date: formatDateTime(item.scheduled_at), minutes: item.duration_min })
                : item.due_at
                  ? t('aftercare.consultations.dueAround', { date: formatDate(item.due_at), relative: formatRelative(item.due_at) })
                  : t('aftercare.consultations.requestedOn', { date: formatDateTime(item.created_at) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {item.notes && <p className="mt-1 text-xs whitespace-pre-line text-muted">{item.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          {item.meeting_url && item.status === 'scheduled' && (
            <a
              href={item.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs font-medium text-fg hover:bg-surface-2"
            >
              <Video className="size-4" aria-hidden /> {t('aftercare.consultations.join')}
              <ExternalLink className="size-3 rtl:-scale-x-100" aria-hidden />
              <span className="sr-only">{t('aftercare.consultations.opensNewTab')}</span>
            </a>
          )}
          {(item.status === 'requested' || item.status === 'scheduled') && (
            <>
              <Button size="sm" variant={item.status === 'requested' ? 'primary' : 'outline'} icon={<CalendarClock className="size-4" aria-hidden />} onClick={() => setScheduling(true)}>
                {item.status === 'requested' ? t('aftercare.consultations.schedule') : t('aftercare.consultations.reschedule')}
              </Button>
              {item.status === 'scheduled' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<CheckCircle2 className="size-4" aria-hidden />}
                  loading={update.isPending && update.variables?.status === 'completed'}
                  onClick={() => update.mutate({ status: 'completed' })}
                >
                  {t('aftercare.consultations.markDone')}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<XCircle className="size-4" aria-hidden />} onClick={() => setCancelling(true)}>
                {t('aftercare.consultations.cancel')}
              </Button>
            </>
          )}
        </div>
      </div>
      {scheduling && (
        <ScheduleModal
          item={item}
          loading={update.isPending}
          onClose={() => setScheduling(false)}
          onSubmit={(body) => update.mutate(body)}
        />
      )}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={(note) => update.mutate({ status: 'cancelled', ...(note ? { notes: note } : {}) })}
        loading={update.isPending}
        tone="danger"
        title={t('aftercare.consultations.cancelTitle')}
        description={t('aftercare.consultations.cancelDescription')}
        noteLabel={t('aftercare.consultations.cancelNote')}
        confirmLabel={t('aftercare.consultations.cancelConfirm')}
      />
    </li>
  );
}

/** "2026-11-20T10:30" in the browser's time zone for an ISO value (datetime-local input). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleModal({
  item,
  loading,
  onClose,
  onSubmit,
}: {
  item: Consultation;
  loading: boolean;
  onClose: () => void;
  onSubmit: (body: ConsultationUpdateIn) => void;
}) {
  const { t } = useAppTranslation();
  const ids = useId();
  const [when, setWhen] = useState(() => toLocalInput(item.scheduled_at ?? item.due_at));
  const [duration, setDuration] = useState(String(item.duration_min || 20));
  const [url, setUrl] = useState(item.meeting_url ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const at = when ? new Date(when) : null;
    if (!at || Number.isNaN(at.getTime())) return setError(t('aftercare.schedule.whenRequired'));
    if (at.getTime() <= Date.now()) return setError(t('aftercare.schedule.future'));
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return setError(t('aftercare.schedule.durationError'));
    const link = url.trim();
    if (link && !/^https:\/\//i.test(link)) return setError(t('aftercare.schedule.httpsOnly'));
    setError(null);
    onSubmit({
      scheduled_at: at.toISOString(),
      duration_min: minutes,
      // empty: the server creates a private video room (Jitsi) when the call is scheduled
      ...(link ? { meeting_url: link } : {}),
      ...(item.status === 'requested' ? { status: 'scheduled' as const } : {}),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item.status === 'requested' ? t('aftercare.schedule.title') : t('aftercare.schedule.rescheduleTitle')}
      description={t('aftercare.schedule.description', { patient: item.patient?.full_name ?? t('common.patient') })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={loading} icon={<CalendarClock className="size-4" aria-hidden />} onClick={submit}>
            {t('aftercare.schedule.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {item.due_at && <p className="text-sm text-muted">{t('aftercare.schedule.dueHint', { date: formatDate(item.due_at) })}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('aftercare.schedule.when')} htmlFor={`${ids}-when`} hint={t('aftercare.schedule.timezone')} required>
            <Input id={`${ids}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </FormField>
          <FormField label={t('aftercare.schedule.duration')} htmlFor={`${ids}-dur`}>
            <Input id={`${ids}-dur`} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/[^\d]/g, ''))} />
          </FormField>
        </div>
        <FormField label={t('aftercare.schedule.link')} htmlFor={`${ids}-url`} hint={t('aftercare.schedule.linkHint')}>
          <Input id={`${ids}-url`} type="url" dir="ltr" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </FormField>
        {error && (
          <Alert tone="red" title={error} />
        )}
      </div>
    </Modal>
  );
}

/** Follow-ups and consultations of one case (case detail). */
export function CaseConsultationsList({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  const q = useQuery({
    queryKey: [...aftercareKeys.consultations, caseId],
    queryFn: () => consultationsApi.list({ case_id: caseId, page_size: 100 }).then((p) => p.items as Consultation[]),
  });
  const list = useMemo(() => sortConsultations(q.data ?? []), [q.data]);
  if (q.isPending) return <Skeleton className="h-20" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (list.length === 0) return <EmptyState title={t('aftercare.consultations.emptyCase')} className="py-6" />;
  return (
    <ul className="divide-y divide-border">
      {list.map((c) => (
        <ConsultationItem key={c.id} item={c} showCase={false} />
      ))}
    </ul>
  );
}

export const AftercareIcon = HeartPulse;
