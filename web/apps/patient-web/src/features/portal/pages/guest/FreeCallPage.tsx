/**
 * Free 15-minute video call for visitors (before registering): name -> email or phone (phone falls back to email
 * with `sms_unavailable`) -> 6-digit code -> preferred time window / time zone / question / attachments -> booked
 * -> status page with the time and the Join link. Sends `X-Device-Id` (one free call per person and device).
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { CalendarClock, CheckCircle2, Mail, Phone, ShieldAlert, UserPlus, Video } from 'lucide-react';
import {
  attemptsLeft,
  errorMessage,
  guestCallApi,
  isApiError,
  type ContactChannel,
  type GuestVerifyStartOut,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useBookIntroCall, useIntroCall } from '../../api/phase1';
import { useDocuments, useScreenings } from '../../api/queries';
import { BackLink } from '../../components/common';
import { GuestUpgradeDialog } from '../../components/GuestUpgrade';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { cn, formatDate, formatDateTime, formatTime, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Textarea,
} from '../../ui/primitives';

type Step = 'name' | 'contact' | 'code' | 'details';
const STEPS: Step[] = ['name', 'contact', 'code', 'details'];

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function StepDots({ step }: { step: Step }) {
  const { t } = useAppTranslation();
  const index = STEPS.indexOf(step);
  return (
    <ol className="flex items-center gap-2" aria-label={t('freeCall.progress', { step: index + 1, total: STEPS.length })}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === index ? 'step' : undefined}
          className={cn('h-1.5 flex-1 rounded-full', i <= index ? 'bg-primary' : 'bg-border')}
        />
      ))}
    </ol>
  );
}

function AlreadyUsed() {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  return (
    <EmptyState
      icon={<ShieldAlert className="size-6" aria-hidden />}
      title={t('freeCall.alreadyUsedTitle')}
      description={t('freeCall.alreadyUsed')}
      action={
        <>
          <Button icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
            {t('careGates.guest.createAccount')}
          </Button>
          <GuestUpgradeDialog open={open} onClose={() => setOpen(false)} />
        </>
      }
    />
  );
}

export function FreeCallPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('freeCall.title'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useMe();
  const existing = useIntroCall();
  const book = useBookIntroCall();
  const screenings = useScreenings({ page_size: 5 });
  const documents = useDocuments();

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<ContactChannel>('email');
  const [contact, setContact] = useState('');
  const [verification, setVerification] = useState<GuestVerifyStartOut | null>(null);
  const [code, setCode] = useState('');
  const [day, setDay] = useState(tomorrowIso());
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('12:00');
  const [question, setQuestion] = useState('');
  const [shareScreening, setShareScreening] = useState(true);
  const [docIds, setDocIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(false);
  const timezone = useMemo(localTimeZone, []);

  useEffect(() => {
    if (me.data && !me.data.is_guest && !name) setName(me.data.full_name);
  }, [me.data, name]);

  const screeningId =
    params.get('screening') ?? screenings.data?.items.find((s) => s.status === 'completed')?.id ?? null;

  if (existing.data) return <Navigate to={paths.freeCallStatus} replace />;
  if (existing.isPending) return <Skeleton className="h-80 rounded-2xl" />;

  async function sendCode() {
    const value = contact.trim();
    if (channel === 'email' && !/^\S+@\S+\.\S+$/.test(value)) {
      setError(t('freeCall.emailInvalid'));
      return;
    }
    if (channel === 'phone' && !/^\+?[0-9 ()-]{7,20}$/.test(value)) {
      setError(t('freeCall.phoneInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await guestCallApi.startVerification({ channel, contact: value });
      setVerification(out);
      setCode('');
      setStep('code');
    } catch (err) {
      if (isApiError(err) && err.code === 'sms_unavailable') {
        setChannel('email');
        setContact('');
        setError(t('freeCall.smsUnavailable'));
      } else if (isApiError(err) && err.code === 'invalid_contact') {
        setError(channel === 'email' ? t('freeCall.emailInvalid') : t('freeCall.phoneInvalid'));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!verification || !/^\d{6}$/.test(code)) {
      setError(t('freeCall.codeInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await guestCallApi.confirmVerification({ verification_id: verification.verification_id, code });
      setStep('details');
    } catch (err) {
      const errCode = isApiError(err) ? err.code : '';
      if (errCode === 'invalid_code') {
        const left = attemptsLeft(err);
        setError(left == null ? t('freeCall.codeInvalid') : t('freeCall.codeInvalidLeft', { count: left }));
      } else if (errCode === 'code_expired') setError(t('freeCall.codeExpired'));
      else if (errCode === 'too_many_attempts') setError(t('freeCall.codeTooMany'));
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!verification) return;
    const start = new Date(`${day}T${from}`);
    const end = new Date(`${day}T${to}`);
    if (!(end > start)) {
      setError(t('freeCall.windowInvalid'));
      return;
    }
    setError(null);
    try {
      await book.mutateAsync({
        verification_id: verification.verification_id,
        full_name: name.trim(),
        preferred_from: start.toISOString(),
        preferred_to: end.toISOString(),
        timezone,
        question: question.trim() || null,
        screening_id: shareScreening && screeningId ? screeningId : null,
        document_ids: docIds,
      });
      navigate(paths.freeCallStatus, { replace: true });
    } catch (err) {
      const errCode = isApiError(err) ? err.code : '';
      if (errCode === 'free_consultation_used') setUsed(true);
      else if (errCode === 'contact_not_verified' || errCode === 'verification_expired') {
        setVerification(null);
        setStep('contact');
        setError(t('freeCall.verifyAgain'));
      } else setError(errorMessage(err));
    }
  }

  const medicalDocs = (documents.data ?? []).filter((d) => ['medical_report', 'lab_result', 'imaging', 'prescription', 'other'].includes(d.kind));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        back={<BackLink to={paths.dashboard}>{t('freeCall.back')}</BackLink>}
        title={t('freeCall.title')}
        description={t('freeCall.intro')}
      />
      {used ? (
        <AlreadyUsed />
      ) : (
        <Card>
          <CardBody className="space-y-5">
            <StepDots step={step} />
            {step === 'name' ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim().length < 1) setError(t('freeCall.nameRequired'));
                  else {
                    setError(null);
                    setStep('contact');
                  }
                }}
              >
                <Field label={t('freeCall.nameLabel')} htmlFor="fc-name" required>
                  <Input id="fc-name" autoComplete="name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                {error ? <Alert tone="red">{error}</Alert> : null}
                <Button type="submit" className="w-full">
                  {t('freeCall.continue')}
                </Button>
              </form>
            ) : null}

            {step === 'contact' ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <p className="text-sm text-muted">{t('freeCall.contactIntro')}</p>
                <SegmentedControl
                  ariaLabel={t('freeCall.contactIntro')}
                  value={channel}
                  onChange={(v) => {
                    setChannel(v);
                    setContact('');
                    setError(null);
                  }}
                  options={[
                    {
                      value: 'email',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-4" aria-hidden />
                          {t('freeCall.channelEmail')}
                        </span>
                      ),
                    },
                    {
                      value: 'phone',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="size-4" aria-hidden />
                          {t('freeCall.channelPhone')}
                        </span>
                      ),
                    },
                  ]}
                />
                <Field
                  label={channel === 'email' ? t('freeCall.emailLabel') : t('freeCall.phoneLabel')}
                  htmlFor="fc-contact"
                  required
                >
                  <Input
                    id="fc-contact"
                    type={channel === 'email' ? 'email' : 'tel'}
                    inputMode={channel === 'email' ? 'email' : 'tel'}
                    autoComplete={channel === 'email' ? 'email' : 'tel'}
                    dir="ltr"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </Field>
                {error ? <Alert tone="amber">{error}</Alert> : null}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('name')}>
                    {t('freeCall.backStep')}
                  </Button>
                  <Button type="submit" loading={busy} className="flex-1">
                    {t('freeCall.sendCode')}
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'code' && verification ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <p className="text-sm text-muted">{t('freeCall.codeIntro', { contact: verification.contact_masked })}</p>
                <Field label={t('freeCall.codeLabel')} htmlFor="fc-code" required>
                  <Input
                    id="fc-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    dir="ltr"
                    className="text-center text-lg tracking-[0.5em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </Field>
                {error ? <Alert tone="red">{error}</Alert> : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void sendCode()}>
                    {t('freeCall.resendCode')}
                  </Button>
                  <Button type="submit" loading={busy} className="flex-1">
                    {t('freeCall.verify')}
                  </Button>
                </div>
              </form>
            ) : null}

            {step === 'details' ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <p className="text-sm text-muted">{t('freeCall.detailsIntro')}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t('freeCall.day')} htmlFor="fc-day" required>
                    <Input id="fc-day" type="date" min={tomorrowIso()} value={day} onChange={(e) => setDay(e.target.value)} />
                  </Field>
                  <Field label={t('freeCall.from')} htmlFor="fc-from" required>
                    <Input id="fc-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label={t('freeCall.to')} htmlFor="fc-to" required>
                    <Input id="fc-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                </div>
                <p className="text-xs text-muted">{t('freeCall.timezone', { zone: timezone })}</p>
                <Field label={t('freeCall.questionLabel')} htmlFor="fc-question" hint={t('freeCall.questionHint')}>
                  <Textarea id="fc-question" rows={3} maxLength={2000} value={question} onChange={(e) => setQuestion(e.target.value)} />
                </Field>
                {screeningId ? (
                  <Checkbox checked={shareScreening} onChange={(e) => setShareScreening(e.target.checked)} label={t('freeCall.attachScreening')} />
                ) : null}
                {medicalDocs.length ? (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-fg">{t('freeCall.attachReports')}</legend>
                    {medicalDocs.slice(0, 10).map((d) => (
                      <Checkbox
                        key={d.id}
                        checked={docIds.includes(d.id)}
                        onChange={(e) => setDocIds((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))}
                        label={d.file_name}
                      />
                    ))}
                  </fieldset>
                ) : null}
                <Alert tone="amber">{t('freeCall.notEmergency')}</Alert>
                {error ? <Alert tone="red">{error}</Alert> : null}
                <Button type="submit" size="lg" className="w-full" loading={book.isPending} icon={<Video className="size-5" aria-hidden />}>
                  {t('freeCall.book')}
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function FreeCallStatusPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('freeCall.statusTitle'));
  const me = useMe();
  const call = useIntroCall();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (call.isPending) return <Skeleton className="h-80 rounded-2xl" />;
  if (call.isError) return <ErrorState error={call.error} onRetry={() => void call.refetch()} />;
  const c = call.data;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader back={<BackLink to={paths.dashboard}>{t('freeCall.back')}</BackLink>} title={t('freeCall.statusTitle')} />
      {!c ? (
        <EmptyState
          icon={<Video className="size-6" aria-hidden />}
          title={t('freeCall.noCallTitle')}
          action={<ButtonLink to={paths.freeCall()}>{t('freeCall.banner.cta')}</ButtonLink>}
        />
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success-ink">
                <CheckCircle2 className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-lg font-semibold text-fg">{t(`freeCall.status.${c.status}`, { defaultValue: t('freeCall.status.requested') })}</p>
                <p className="text-sm text-muted">{c.full_name}</p>
              </div>
            </div>
            {c.scheduled_at ? (
              <p className="flex items-center gap-2 text-base font-semibold text-fg">
                <CalendarClock className="size-5 text-primary-ink" aria-hidden />
                {t('freeCall.scheduledAt', { time: formatDateTime(c.scheduled_at, 'EEE d MMM yyyy, HH:mm'), minutes: c.duration_min })}
              </p>
            ) : c.preferred_from && c.preferred_to ? (
              <p className="text-sm text-muted">
                {t('freeCall.preferredWindow', {
                  from: formatDateTime(c.preferred_from, 'EEE d MMM, HH:mm'),
                  to: formatDate(c.preferred_from) === formatDate(c.preferred_to) ? formatTime(c.preferred_to) : formatDateTime(c.preferred_to, 'EEE d MMM, HH:mm'),
                })}
              </p>
            ) : null}
            {c.coordinator_name ? <p className="text-sm text-fg">{t('freeCall.coordinator', { name: c.coordinator_name })}</p> : null}
            {c.meeting_url && c.status === 'scheduled' ? (
              <a
                href={c.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-fg hover:bg-primary-hover"
              >
                <Video className="size-5" aria-hidden />
                {t('freeCall.join')}
                <span className="sr-only">{t('aftercare.newTab')}</span>
              </a>
            ) : c.status === 'requested' ? (
              <p className="text-sm text-muted">{t('freeCall.linkLater')}</p>
            ) : null}
            <p className="text-xs text-muted">{t('freeCall.weWillContact', { contact: c.contact_masked })}</p>
          </CardBody>
        </Card>
      )}
      {me.data?.is_guest ? (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-fg">{t('freeCall.accountTitle')}</p>
              <p className="text-sm text-muted">{t('freeCall.accountBody')}</p>
            </div>
            <Button className="shrink-0" icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setUpgradeOpen(true)}>
              {t('careGates.guest.createAccount')}
            </Button>
          </CardBody>
        </Card>
      ) : null}
      <GuestUpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
