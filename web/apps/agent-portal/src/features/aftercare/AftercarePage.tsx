import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, ClipboardCheck, HeartPulse, History, Video } from 'lucide-react';
import { casesApi, errorMessage, type CasePatientRef } from '@hig/shared/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../../components/ui';
import { phase1Api, type CheckinOut, type CheckinSubmitIn, type FollowupOut, type MedicationAdherence } from '../../lib/phase1Api';
import { cn, formatDate, formatDateTime, useDocumentTitle } from '../../lib/shared';
import { useAppTranslation, type AppT } from '../../i18n';

const aftercareKey = ['aftercare'] as const;
const RED_FLAGS = ['fever', 'breathlessness', 'severe_pain', 'wound_concerns'] as const;

function redFlagLabel(t: AppT, flag: string): string {
  return (RED_FLAGS as readonly string[]).includes(flag) ? t(`aftercare.redFlags.${flag}`) : flag;
}

/**
 * Aftercare of the agent's patients (`GET /me/aftercare`): check-ins to answer now, follow-up video consultations,
 * upcoming check-ins and the treated cases. An agent may answer a check-in for the patient (the hospital and the
 * coordinator are alerted on red flags).
 */
export function AftercarePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('aftercare.title'));
  const query = useQuery({ queryKey: aftercareKey, queryFn: phase1Api.aftercare, refetchInterval: 5 * 60_000 });
  // /me/aftercare has no patient names on cases and check-ins: map case -> patient from the case list
  const treated = useQuery({
    queryKey: ['cases', { aftercarePatients: true }],
    queryFn: () => casesApi.list({ status: ['in_treatment', 'completed'], page_size: 100, sort: '-updated_at' }),
    enabled: Boolean(query.data?.cases.length),
  });
  const patientOf = useMemo(() => {
    const map = new Map<string, CasePatientRef>();
    for (const c of treated.data?.items ?? []) map.set(c.id, c.patient);
    return (caseId: string) => map.get(caseId) ?? null;
  }, [treated.data]);
  const [answering, setAnswering] = useState<CheckinOut | null>(null);
  const [history, setHistory] = useState<{ caseId: string; caseNumber: string } | null>(null);

  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const empty = data.cases.length === 0;

  return (
    <div>
      <PageHeader title={t('aftercare.title')} description={t('aftercare.description')} />
      {empty ? (
        <Card>
          <EmptyState icon={<HeartPulse className="h-6 w-6" aria-hidden />} title={t('aftercare.emptyTitle')} description={t('aftercare.emptyDescription')} />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden /> {t('aftercare.dueTitle')}
                  </span>
                }
                description={t('aftercare.dueHint')}
              />
              {data.checkins_due.length === 0 ? (
                <p className="p-5 text-sm text-muted">{t('aftercare.noneDue')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.checkins_due.map((c) => (
                    <CheckinRow key={c.id} checkin={c} patient={patientOf(c.case_id)?.full_name} onAnswer={() => setAnswering(c)} />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-primary" aria-hidden /> {t('aftercare.followupsTitle')}
                  </span>
                }
                description={t('aftercare.followupsHint')}
              />
              {data.followups.length === 0 ? (
                <p className="p-5 text-sm text-muted">{t('aftercare.noFollowups')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.followups.map((f) => (
                    <FollowupRow key={f.id} followup={f} patient={f.patient?.full_name ?? patientOf(f.case_id)?.full_name} />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 text-muted" aria-hidden /> {t('aftercare.upcomingTitle')}
                  </span>
                }
              />
              {data.upcoming_checkins.length === 0 ? (
                <p className="p-5 text-sm text-muted">{t('aftercare.noUpcoming')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.upcoming_checkins.slice(0, 20).map((c) => (
                    <CheckinRow key={c.id} checkin={c} patient={patientOf(c.case_id)?.full_name} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader title={t('aftercare.casesTitle')} />
            <ul className="divide-y divide-border">
              {data.cases.map((c) => (
                <li key={c.case_id} className="space-y-1 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/cases/${c.case_id}`} className="font-mono text-xs text-primary-ink hover:underline">
                      {c.case_number}
                    </Link>
                    <Button size="sm" variant="ghost" icon={<History className="h-4 w-4" aria-hidden />} onClick={() => setHistory({ caseId: c.case_id, caseNumber: c.case_number })}>
                      {t('aftercare.history')}
                    </Button>
                  </div>
                  {patientOf(c.case_id) && <p className="font-medium">{patientOf(c.case_id)?.full_name}</p>}
                  <p className="text-muted">{[c.hospital.name, c.doctor?.full_name].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs text-muted">
                    {c.discharged_on
                      ? t('aftercare.dischargedUntil', { discharged: formatDate(c.discharged_on), until: formatDate(c.aftercare_until) })
                      : t('aftercare.inTreatment')}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <CheckinDialog checkin={answering} patient={answering ? patientOf(answering.case_id)?.full_name : undefined} onClose={() => setAnswering(null)} />
      <HistoryDialog target={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function CheckinRow({ checkin, patient, onAnswer }: { checkin: CheckinOut; patient?: string; onAnswer?: () => void }) {
  const { t } = useAppTranslation();
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {t('aftercare.checkinDay', { day: checkin.day })}
          {patient ? <span className="font-normal text-muted"> · {patient}</span> : null}
        </p>
        <p className="text-xs text-muted">
          <span className="font-mono">{checkin.case_number}</span> · {t('aftercare.dueOn', { date: formatDate(checkin.due_at) })}
        </p>
      </div>
      {onAnswer && (
        <Button size="sm" onClick={onAnswer}>
          {t('aftercare.answer')}
        </Button>
      )}
    </li>
  );
}

function FollowupRow({ followup, patient }: { followup: FollowupOut; patient?: string }) {
  const { t } = useAppTranslation();
  const scheduled = followup.status === 'scheduled' && followup.scheduled_at;
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {followup.followup_day ? t('aftercare.followupDay', { day: followup.followup_day }) : t('aftercare.followup')}
          {patient ? <span className="font-normal text-muted"> · {patient}</span> : null}
        </p>
        <p className="text-xs text-muted">
          {[followup.case_number, followup.hospital?.name, followup.doctor?.full_name].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs">
          {scheduled
            ? t('aftercare.scheduledFor', { date: formatDateTime(followup.scheduled_at) })
            : followup.due_at
              ? t('aftercare.dueAround', { date: formatDate(followup.due_at) })
              : t('aftercare.awaitingTime')}
        </p>
      </div>
      <Badge tone={scheduled ? 'success' : 'warning'}>{scheduled ? t('aftercare.status.scheduled') : t('aftercare.status.requested')}</Badge>
      {scheduled && followup.meeting_url && (
        <a
          href={followup.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2"
        >
          <Video className="h-4 w-4" aria-hidden /> {t('aftercare.join')}
        </a>
      )}
    </li>
  );
}

const ADHERENCE: MedicationAdherence[] = ['all', 'some', 'none'];

function CheckinDialog({ checkin, patient, onClose }: { checkin: CheckinOut | null; patient?: string; onClose: () => void }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const painId = useId();
  const adherenceId = useId();
  const notesId = useId();
  const [form, setForm] = useState<CheckinSubmitIn>({ pain: 0, fever: false, wound_concerns: false, breathlessness: false, medication_adherence: 'all' });
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (checkin) {
      setForm({ pain: 0, fever: false, wound_concerns: false, breathlessness: false, medication_adherence: 'all' });
      setNotes('');
    }
  }, [checkin]);
  const set = <K extends keyof CheckinSubmitIn>(key: K, value: CheckinSubmitIn[K]) => setForm((f) => ({ ...f, [key]: value }));
  const flagged = form.fever || form.breathlessness || form.wound_concerns || form.pain >= 8;

  const submit = useMutation({
    mutationFn: () => phase1Api.submitCheckin(checkin?.id ?? '', { ...form, ...(notes.trim() ? { free_text: notes.trim() } : {}) }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: aftercareKey });
      void queryClient.invalidateQueries({ queryKey: ['aftercare-checkins'] });
      if (saved.red_flags.length) toast.warning(t('aftercare.form.sentFlagged'));
      else toast.success(t('aftercare.form.sent'));
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={checkin !== null}
      onClose={onClose}
      title={checkin ? t('aftercare.form.title', { day: checkin.day }) : ''}
      description={[patient, checkin?.case_number].filter(Boolean).join(' · ')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submit.isPending}>
            {t('aftercare.form.cancel')}
          </Button>
          <Button loading={submit.isPending} onClick={() => submit.mutate()}>
            {t('aftercare.form.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-muted">{t('aftercare.form.intro')}</p>
        <FormField label={t('aftercare.form.pain')} htmlFor={painId} hint={t('aftercare.form.painHint')}>
          <div className="flex items-center gap-3">
            <input
              id={painId}
              type="range"
              min={0}
              max={10}
              step={1}
              value={form.pain}
              onChange={(e) => set('pain', Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
              aria-valuetext={t('aftercare.form.painValue', { value: form.pain })}
            />
            <output htmlFor={painId} className={cn('w-10 text-center text-lg font-bold tabular-nums', form.pain >= 8 && 'text-danger')}>
              {form.pain}
            </output>
          </div>
        </FormField>
        <div className="space-y-3">
          <Checkbox checked={form.fever} onChange={(e) => set('fever', e.target.checked)} label={t('aftercare.form.fever')} />
          <Checkbox
            checked={form.wound_concerns}
            onChange={(e) => set('wound_concerns', e.target.checked)}
            label={t('aftercare.form.wound')}
            description={t('aftercare.form.woundHint')}
          />
          <Checkbox checked={form.breathlessness} onChange={(e) => set('breathlessness', e.target.checked)} label={t('aftercare.form.breathless')} />
        </div>
        <FormField label={t('aftercare.form.medication')} htmlFor={adherenceId}>
          <Select id={adherenceId} value={form.medication_adherence} onChange={(e) => set('medication_adherence', e.target.value as MedicationAdherence)}>
            {ADHERENCE.map((a) => (
              <option key={a} value={a}>
                {t(`aftercare.form.adherence.${a}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('aftercare.form.notes')} htmlFor={notesId}>
          <Textarea id={notesId} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        {flagged && (
          <div role="alert" className="flex gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t('aftercare.form.redFlagWarning')}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function HistoryDialog({ target, onClose }: { target: { caseId: string; caseNumber: string } | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const query = useQuery({
    queryKey: ['aftercare-checkins', target?.caseId],
    queryFn: () => phase1Api.caseCheckins(target?.caseId ?? ''),
    enabled: Boolean(target),
  });
  // answered check-ins with red flags first, then the most recent
  const rows = [...(query.data ?? [])]
    .filter((c) => c.submitted_at)
    .sort((a, b) => Number(b.red_flags.length > 0) - Number(a.red_flags.length > 0) || (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));
  let body: ReactNode;
  if (query.isPending) body = <LoadingBlock />;
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  else if (rows.length === 0) body = <p className="text-sm text-muted">{t('aftercare.noAnswers')}</p>;
  else
    body = (
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className={cn('rounded-lg border p-3 text-sm', c.red_flags.length ? 'border-danger/40 bg-danger-soft/40' : 'border-border')}>
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {t('aftercare.checkinDay', { day: c.day })}
              <span className="text-xs font-normal text-muted">{formatDateTime(c.submitted_at)}</span>
            </p>
            {c.red_flags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {c.red_flags.map((flag) => (
                  <Badge key={flag} tone="danger">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> {redFlagLabel(t, flag)}
                  </Badge>
                ))}
              </div>
            )}
            {typeof c.answers.pain === 'number' && <p className="mt-1 text-muted">{t('aftercare.form.painValue', { value: c.answers.pain })}</p>}
            {c.free_text && <p className="mt-1 whitespace-pre-line">{c.free_text}</p>}
          </li>
        ))}
      </ul>
    );
  return (
    <Modal open={target !== null} onClose={onClose} title={t('aftercare.historyTitle')} description={target?.caseNumber}>
      {body}
    </Modal>
  );
}
