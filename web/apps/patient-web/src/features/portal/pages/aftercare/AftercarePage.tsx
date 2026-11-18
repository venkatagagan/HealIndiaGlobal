/**
 * Aftercare (GET /me/aftercare): follow-up video calls with Join (new tab) and "request another follow-up",
 * recovery check-ins (pain 0-10, fever, breathlessness, wound, medicines, notes). A check-in with red flags shows
 * an urgent message with the emergency contacts and SOS.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, ClipboardCheck, FileHeart, HeartPulse, Siren, Video } from 'lucide-react';
import {
  errorMessage,
  type AftercareCaseOut,
  type CheckinOut,
  type CheckinSubmitIn,
  type FollowupConsultationOut,
  type MedicationAdherence,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useAftercare, useRequestFollowup, useSubmitCheckin } from '../../api/phase1';
import { StatusBadge } from '../../components/common';
import { HelplineList, SosButton } from '../../components/SupportDialogs';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { cn, formatDate, formatDateTime, formatNumber, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  SkeletonList,
  Textarea,
} from '../../ui/primitives';

type YesNo = 'yes' | 'no' | '';

function YesNoField({ label, hint, value, onChange, name }: { label: string; hint?: string; value: YesNo; onChange: (v: YesNo) => void; name: string }) {
  const { t } = useAppTranslation();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-fg">{label}</legend>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <div className="flex gap-2">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm',
              value === v ? 'border-primary bg-primary-soft font-semibold' : 'border-border',
            )}
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="accent-primary" />
            {v === 'yes' ? t('aftercare.yes') : t('aftercare.no')}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckinForm({ checkin, onFlags }: { checkin: CheckinOut; onFlags: (c: CheckinOut) => void }) {
  const { t } = useAppTranslation();
  const submit = useSubmitCheckin();
  const [pain, setPain] = useState(0);
  const [fever, setFever] = useState<YesNo>('');
  const [breath, setBreath] = useState<YesNo>('');
  const [wound, setWound] = useState<YesNo>('');
  const [meds, setMeds] = useState<MedicationAdherence>('all');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const complete = fever && breath && wound;

  async function send() {
    if (!complete) {
      setError(t('aftercare.answerAll'));
      return;
    }
    setError(null);
    const body: CheckinSubmitIn = {
      pain,
      fever: fever === 'yes',
      breathlessness: breath === 'yes',
      wound_concerns: wound === 'yes',
      medication_adherence: meds,
      free_text: notes.trim() || null,
    };
    try {
      const out = await submit.mutateAsync({ id: checkin.id, body });
      if (out.red_flags.length) onFlags(out);
      else toast.success(t('aftercare.checkinThanks'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <p className="text-sm text-muted">{t('aftercare.checkinIntro')}</p>
      <div className="space-y-1.5">
        <label htmlFor={`pain-${checkin.id}`} className="flex items-center justify-between text-sm font-medium text-fg">
          <span>{t('aftercare.qPain')}</span>
          <span className="tabular-nums">{t('aftercare.painValue', { pain: formatNumber(pain) })}</span>
        </label>
        <input
          id={`pain-${checkin.id}`}
          type="range"
          min={0}
          max={10}
          step={1}
          value={pain}
          onChange={(e) => setPain(Number(e.target.value))}
          aria-valuetext={t('aftercare.painValue', { pain: formatNumber(pain) })}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>{t('aftercare.painNone')}</span>
          <span>{t('aftercare.painWorst')}</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <YesNoField name={`fever-${checkin.id}`} label={t('aftercare.qFever')} value={fever} onChange={setFever} />
        <YesNoField name={`breath-${checkin.id}`} label={t('aftercare.qBreathless')} value={breath} onChange={setBreath} />
        <YesNoField
          name={`wound-${checkin.id}`}
          label={t('aftercare.qWound')}
          hint={t('aftercare.qWoundHint')}
          value={wound}
          onChange={setWound}
        />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-fg">{t('aftercare.qMeds')}</p>
          <SegmentedControl
            ariaLabel={t('aftercare.qMeds')}
            value={meds}
            onChange={setMeds}
            options={[
              { value: 'all', label: t('aftercare.meds.all') },
              { value: 'some', label: t('aftercare.meds.some') },
              { value: 'none', label: t('aftercare.meds.none') },
            ]}
          />
        </div>
      </div>
      <Field label={t('aftercare.qNotes')} htmlFor={`notes-${checkin.id}`}>
        <Textarea id={`notes-${checkin.id}`} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error ? <Alert tone="red">{error}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" loading={submit.isPending}>
          {t('aftercare.checkinSend')}
        </Button>
      </div>
    </form>
  );
}

function FollowupRow({ f }: { f: FollowupConsultationOut }) {
  const { t } = useAppTranslation();
  const canJoin = !!f.meeting_url && f.status === 'scheduled';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p className="font-medium text-fg">
          {f.followup_day ? t('aftercare.followupDay', { day: formatNumber(f.followup_day) }) : t('aftercare.followup')}
        </p>
        <p className="text-sm text-muted">
          {[f.hospital?.name, f.doctor?.full_name].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 flex items-center gap-1 text-sm">
          <CalendarClock className="size-4 text-muted" aria-hidden />
          {f.scheduled_at
            ? formatDateTime(f.scheduled_at)
            : f.due_at
              ? t('aftercare.around', { date: formatDate(f.due_at) })
              : t('aftercare.timeToConfirm')}
        </p>
        {!canJoin && f.status !== 'completed' && f.status !== 'cancelled' ? (
          <p className="text-xs text-muted">{t('aftercare.linkLater')}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={f.status} />
        {canJoin ? (
          <a
            href={f.meeting_url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Video className="size-4" aria-hidden />
            {t('aftercare.join')}
            <span className="sr-only">{t('aftercare.newTab')}</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

function RequestFollowupDialog({ target, onClose }: { target: AftercareCaseOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const request = useRequestFollowup();
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');

  async function send() {
    if (!target) return;
    try {
      await request.mutateAsync({
        case_id: target.case_id,
        doctor_id: target.doctor?.id ?? null,
        preferred_at: when ? new Date(when).toISOString() : null,
        notes: notes.trim() || undefined,
      });
      toast.success(t('aftercare.followupRequested'));
      setWhen('');
      setNotes('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={t('aftercare.requestFollowup')}
      description={target ? target.hospital.name : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('aftercare.cancel')}
          </Button>
          <Button loading={request.isPending} onClick={() => void send()}>
            {t('aftercare.sendRequest')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('aftercare.preferredTime')} htmlFor="fu-when">
          <Input id="fu-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label={t('aftercare.followupNotes')} htmlFor="fu-notes">
          <Textarea id="fu-notes" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function UrgentDialog({ checkin, onClose }: { checkin: CheckinOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  return (
    <Modal
      open={!!checkin}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2 text-danger-ink">
          <Siren className="size-5" aria-hidden />
          {t('aftercare.urgentTitle')}
        </span>
      }
      footer={
        <>
          <SosButton caseId={checkin?.case_id} />
          <Button onClick={onClose}>{t('aftercare.urgentOk')}</Button>
        </>
      }
    >
      <div role="alert" className="space-y-4">
        <p className="text-sm text-fg">{t('aftercare.urgentBody')}</p>
        {checkin?.red_flags.length ? (
          <ul className="list-disc space-y-1 ps-5 text-sm font-medium text-danger-ink">
            {checkin.red_flags.map((f) => (
              <li key={f}>{t(`aftercare.flags.${f}`, { defaultValue: f.replace(/_/g, ' ') })}</li>
            ))}
          </ul>
        ) : null}
        <div className="rounded-xl border border-border p-3">
          <HelplineList />
        </div>
      </div>
    </Modal>
  );
}

export function AftercarePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('aftercare.title'));
  const me = useMe();
  const aftercare = useAftercare(!!me.data && !me.data.is_guest);
  const [openCheckin, setOpenCheckin] = useState<string | null>(null);
  const [followupFor, setFollowupFor] = useState<AftercareCaseOut | null>(null);
  const [urgent, setUrgent] = useState<CheckinOut | null>(null);
  const data = aftercare.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('aftercare.title')}
        description={t('aftercare.subtitle')}
        actions={
          <ButtonLink to={paths.dischargeSummaries} variant="outline" icon={<FileHeart className="size-4" aria-hidden />}>
            {t('discharge.aftercareLink')}
          </ButtonLink>
        }
      />
      <Alert tone="amber" icon={<AlertTriangle className="size-5" aria-hidden />}>
        {t('aftercare.emergencyNote')}
      </Alert>

      {me.data?.is_guest ? (
        <EmptyState icon={<HeartPulse className="size-6" aria-hidden />} title={t('aftercare.emptyTitle')} description={t('aftercare.emptyMessage')} />
      ) : aftercare.isPending ? (
        <SkeletonList rows={3} />
      ) : aftercare.isError ? (
        <ErrorState error={aftercare.error} onRetry={() => void aftercare.refetch()} />
      ) : !data || (data.cases.length === 0 && data.followups.length === 0 && data.checkins_due.length === 0) ? (
        <EmptyState icon={<HeartPulse className="size-6" aria-hidden />} title={t('aftercare.emptyTitle')} description={t('aftercare.emptyMessage')} />
      ) : (
        <>
          {data.checkins_due.length ? (
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <ClipboardCheck className="size-5 text-primary-ink" aria-hidden />
                    {t('aftercare.dueTitle')}
                  </span>
                }
                description={t('aftercare.dueHint')}
              />
              <CardBody className="space-y-3">
                {data.checkins_due.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-border">
                    <button
                      type="button"
                      onClick={() => setOpenCheckin((v) => (v === c.id ? null : c.id))}
                      aria-expanded={openCheckin === c.id}
                      className="flex w-full items-center justify-between gap-3 p-4 text-start"
                    >
                      <span>
                        <span className="block font-semibold text-fg">{t('aftercare.checkinDay', { day: formatNumber(c.day) })}</span>
                        <span className="block text-xs text-muted">{c.case_number}</span>
                      </span>
                      <span className="text-sm font-semibold text-primary-ink">{t('aftercare.answerNow')}</span>
                    </button>
                    {openCheckin === c.id ? (
                      <div className="border-t border-border p-4">
                        <CheckinForm checkin={c} onFlags={setUrgent} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t('aftercare.followupsTitle')} />
            <CardBody className="space-y-3">
              {data.followups.length ? (
                <ul className="space-y-2">
                  {data.followups.map((f) => (
                    <FollowupRow key={f.id} f={f} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t('aftercare.noFollowups')}</p>
              )}
            </CardBody>
          </Card>

          {data.cases.length ? (
            <Card>
              <CardHeader title={t('aftercare.treatments')} />
              <CardBody>
                <ul className="divide-y divide-border">
                  {data.cases.map((c) => (
                    <li key={c.case_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-fg">{c.hospital.name}</p>
                        <p className="text-sm text-muted">
                          {[
                            c.doctor?.full_name,
                            c.discharged_on ? t('aftercare.discharged', { date: formatDate(c.discharged_on) }) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {c.aftercare_until ? (
                          <p className="text-xs text-muted">{t('aftercare.until', { date: formatDate(c.aftercare_until) })}</p>
                        ) : null}
                      </div>
                      <Button size="sm" variant="outline" icon={<Video className="size-4" aria-hidden />} onClick={() => setFollowupFor(c)}>
                        {t('aftercare.requestFollowup')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {data.upcoming_checkins.length ? (
            <Card>
              <CardHeader title={t('aftercare.upcomingTitle')} />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {data.upcoming_checkins.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span className="text-fg">{t('aftercare.checkinDay', { day: formatNumber(c.day) })}</span>
                      <span className="text-muted">{formatDate(c.due_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </>
      )}

      <RequestFollowupDialog target={followupFor} onClose={() => setFollowupFor(null)} />
      <UrgentDialog checkin={urgent} onClose={() => setUrgent(null)} />
    </div>
  );
}
