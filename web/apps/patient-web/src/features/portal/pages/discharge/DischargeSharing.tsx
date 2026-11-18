/**
 * Patient tools on a final discharge summary: "Share with my doctor" (time-limited link emailed to the home
 * doctor, shown once), the list of share links with revoke, and daily medication reminders.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Copy, Link2, Send, Trash2 } from 'lucide-react';
import {
  DISCHARGE_SHARE_LANGUAGES,
  browserTimeZone,
  errorMessage,
  isApiError,
  type DischargeShareCreatedOut,
  type DischargeShareLanguage,
  type DischargeShareOut,
  type DischargeSummaryOut,
  type Uuid,
} from '@hig/shared/api';
import { useLanguage } from '@hig/shared/lib';
import { useAppTranslation } from '../../../../i18n';
import { useDocuments } from '../../api/queries';
import {
  useCreateDischargeShare,
  useDischargeShares,
  useMedicationReminders,
  useRevokeDischargeShare,
  useSetMedicationReminders,
} from '../../api/discharge';
import { formatBytes } from '../../components/common';
import { formatDate, formatDateTime, formatTime } from '../../lib/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  type Tone,
} from '../../ui/primitives';

/** Autonyms of the share languages (shown as written, never translated). */
const LANGUAGE_NAMES: Record<DischargeShareLanguage, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  bn: 'বাংলা',
  ru: 'Русский',
};
const VALIDITY_DAYS = [1, 3, 7, 14, 30] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------------------------------------
// Share dialog
// ---------------------------------------------------------------------------------------------------------
export function ShareDialog({ summary, open, onClose }: { summary: DischargeSummaryOut; open: boolean; onClose: () => void }) {
  return open ? <ShareDialogBody summary={summary} onClose={onClose} /> : null;
}

function ShareDialogBody({ summary, onClose }: { summary: DischargeSummaryOut; onClose: () => void }) {
  const { t } = useAppTranslation();
  const { language } = useLanguage();
  const create = useCreateDischargeShare(summary.id);
  const myDocs = useDocuments();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [days, setDays] = useState(14);
  const [lang, setLang] = useState<DischargeShareLanguage>(
    (DISCHARGE_SHARE_LANGUAGES as readonly string[]).includes(language) ? (language as DischargeShareLanguage) : 'en',
  );
  const [selected, setSelected] = useState<Set<Uuid>>(() => new Set(summary.attachments.map((a) => a.id)));
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DischargeShareCreatedOut | null>(null);

  /** summary attachments first, then the patient's own documents (the summary PDF is always included) */
  const documents = useMemo(() => {
    const seen = new Set<string>(summary.pdf_document_id ? [summary.pdf_document_id] : []);
    const out: { id: Uuid; file_name: string; size_bytes: number }[] = [];
    for (const d of [...summary.attachments, ...(myDocs.data ?? [])]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push({ id: d.id, file_name: d.file_name, size_bytes: d.size_bytes });
    }
    return out;
  }, [summary.attachments, summary.pdf_document_id, myDocs.data]);

  const toggle = (id: Uuid) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit() {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t('discharge.share.emailInvalid'));
      return;
    }
    if (!consent) {
      setError(t('discharge.share.consentRequired'));
      return;
    }
    setError(null);
    try {
      const out = await create.mutateAsync({
        doctor_email: value,
        doctor_name: name.trim() || null,
        document_ids: documents.filter((d) => selected.has(d.id)).map((d) => d.id),
        expires_in_days: days,
        language: lang,
        consent: true,
      });
      setCreated(out);
    } catch (err) {
      const code = isApiError(err) ? err.code : '';
      if (code === 'share_too_long') setError(t('discharge.share.errors.tooLong'));
      else if (code === 'discharge_summary_superseded') setError(t('discharge.share.errors.superseded'));
      else if (code === 'invalid_documents') setError(t('discharge.share.errors.invalidDocuments'));
      else if (code === 'consent_required') setError(t('discharge.share.consentRequired'));
      else if (code === 'rate_limited') setError(t('discharge.share.errors.rateLimited'));
      else setError(errorMessage(err));
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      toast.success(t('discharge.share.copied'));
    } catch {
      toast.error(t('discharge.share.copyFailed'));
    }
  }

  if (created) {
    return (
      <Modal
        open
        onClose={onClose}
        title={t('discharge.share.createdTitle')}
        footer={<Button onClick={onClose}>{t('discharge.share.done')}</Button>}
      >
        <div className="space-y-4">
          <Alert tone="green">{t('discharge.share.createdBody', { email: created.doctor_email_masked })}</Alert>
          <Field label={t('discharge.share.linkLabel')} htmlFor="share-url" hint={t('discharge.share.onceHint')}>
            <div className="flex gap-2">
              <Input id="share-url" readOnly dir="ltr" value={created.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="outline" icon={<Copy className="size-4" aria-hidden />} onClick={() => void copy()}>
                {t('discharge.share.copy')}
              </Button>
            </div>
          </Field>
          <p className="text-xs text-muted">{t('discharge.share.expiresOn', { date: formatDateTime(created.expires_at) })}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('discharge.share.title')}
      description={t('discharge.share.description')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('discharge.share.cancel')}
          </Button>
          <Button icon={<Send className="size-4" aria-hidden />} loading={create.isPending} disabled={!consent} onClick={() => void submit()}>
            {t('discharge.share.send')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('discharge.share.doctorEmail')} htmlFor="share-email" required>
            <Input
              id="share-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t('discharge.share.doctorName')} htmlFor="share-name">
            <Input id="share-name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('discharge.share.validity')} htmlFor="share-days">
            <Select id="share-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {VALIDITY_DAYS.map((d) => (
                <option key={d} value={d}>
                  {t('discharge.share.days', { count: d })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('discharge.share.language')} htmlFor="share-lang" hint={t('discharge.share.languageHint')}>
            <Select id="share-lang" value={lang} onChange={(e) => setLang(e.target.value as DischargeShareLanguage)}>
              {DISCHARGE_SHARE_LANGUAGES.map((code) => (
                <option key={code} value={code} lang={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">{t('discharge.share.documents')}</legend>
          <p className="text-xs text-muted">{t('discharge.share.documentsHint')}</p>
          {myDocs.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted">{t('discharge.share.noDocuments')}</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {documents.map((d) => (
                <li key={d.id}>
                  <Checkbox
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    label={<span dir="auto">{d.file_name}</span>}
                    description={formatBytes(d.size_bytes)}
                  />
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="rounded-xl border border-warning/40 bg-warning-soft p-3">
          <Checkbox
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            label={t('discharge.share.consent')}
            description={t('discharge.share.consentDetail')}
          />
        </div>
        {error ? <Alert tone="red">{error}</Alert> : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------------------------------------
type ShareState = 'active' | 'expired' | 'revoked';
const SHARE_TONES: Record<ShareState, Tone> = { active: 'green', expired: 'neutral', revoked: 'red' };
const shareState = (s: DischargeShareOut): ShareState => (s.revoked_at ? 'revoked' : s.active ? 'active' : 'expired');

export function ShareLinksCard({ summary, canShare, onShare }: { summary: DischargeSummaryOut; canShare: boolean; onShare: () => void }) {
  const { t } = useAppTranslation();
  const shares = useDischargeShares(summary.id);
  const revoke = useRevokeDischargeShare(summary.id);
  const [revoking, setRevoking] = useState<DischargeShareOut | null>(null);
  const rows = [...(shares.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Link2 className="size-5 text-primary-ink" aria-hidden />
            {t('discharge.links.title')}
          </span>
        }
        description={t('discharge.links.description')}
        action={
          canShare ? (
            <Button size="sm" variant="outline" icon={<Send className="size-4" aria-hidden />} onClick={onShare}>
              {t('discharge.detail.share')}
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {shares.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : shares.isError ? (
          <ErrorState error={shares.error} onRetry={() => void shares.refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{t('discharge.links.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((s) => {
              const state = shareState(s);
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{s.doctor_name || s.doctor_email_masked}</span>
                      <Badge tone={SHARE_TONES[state]}>{t(`discharge.links.status.${state}`)}</Badge>
                    </p>
                    {s.doctor_name ? (
                      <p className="text-xs text-muted" dir="ltr">
                        {s.doctor_email_masked}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted">
                      {state === 'revoked'
                        ? t('discharge.links.revokedOn', { date: formatDateTime(s.revoked_at) })
                        : state === 'expired'
                          ? t('discharge.links.expiredOn', { date: formatDateTime(s.expires_at) })
                          : t('discharge.links.expiresOn', { date: formatDateTime(s.expires_at) })}
                    </p>
                    <p className="text-xs text-muted">
                      {s.view_count > 0
                        ? t('discharge.links.views', { count: s.view_count })
                        : t('discharge.links.notViewed')}
                      {s.last_viewed_at ? ` · ${t('discharge.links.lastViewed', { date: formatDateTime(s.last_viewed_at) })}` : ''}
                    </p>
                    <p className="text-xs text-muted">{t('discharge.links.documents', { count: s.document_ids.length })}</p>
                  </div>
                  {state === 'active' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-danger-ink"
                      icon={<Trash2 className="size-4" aria-hidden />}
                      onClick={() => setRevoking(s)}
                    >
                      {t('discharge.links.revoke')}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              setRevoking(null);
              toast.success(t('discharge.links.revoked'));
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
        title={t('discharge.links.revokeTitle')}
        confirmLabel={t('discharge.links.revoke')}
        tone="danger"
        loading={revoke.isPending}
      >
        {t('discharge.links.revokeBody')}
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Medication reminders
// ---------------------------------------------------------------------------------------------------------
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => formatTime(new Date(2000, 0, 1, h, 0));

export function MedicationRemindersCard({ summary }: { summary: DischargeSummaryOut }) {
  const { t } = useAppTranslation();
  const usable = summary.status === 'final' && summary.is_latest && summary.medications.length > 0;
  const reminders = useMedicationReminders(summary.id, usable);
  const save = useSetMedicationReminders(summary.id);
  const rows = reminders.data ?? [];
  const enabled = rows.some((r) => r.enabled);
  const savedHour = rows[0]?.remind_hour ?? 9;
  const [hour, setHour] = useState<number | null>(null);
  const currentHour = hour ?? savedHour;
  const timezone = useMemo(browserTimeZone, []);

  function update(next: { enabled: boolean; hour: number }) {
    save.mutate(
      { enabled: next.enabled, remind_hour: next.hour, timezone },
      {
        onSuccess: () => {
          setHour(null);
          toast.success(
            next.enabled === enabled ? t('discharge.reminders.saved') : next.enabled ? t('discharge.reminders.turnedOn') : t('discharge.reminders.turnedOff'),
          );
        },
        onError: (err) => {
          const code = isApiError(err) ? err.code : '';
          if (code === 'no_medications') toast.error(t('discharge.reminders.noMedications'));
          else if (code === 'discharge_summary_superseded') toast.error(t('discharge.reminders.superseded'));
          else toast.error(errorMessage(err));
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BellRing className="size-5 text-primary-ink" aria-hidden />
            {t('discharge.reminders.title')}
          </span>
        }
        description={t('discharge.reminders.description')}
      />
      <CardBody className="space-y-4">
        {!summary.medications.length ? (
          <p className="text-sm text-muted">{t('discharge.reminders.noMedications')}</p>
        ) : !summary.is_latest ? (
          <p className="text-sm text-muted">{t('discharge.reminders.superseded')}</p>
        ) : reminders.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : reminders.isError ? (
          <ErrorState error={reminders.error} onRetry={() => void reminders.refetch()} />
        ) : (
          <>
            <Switch
              checked={enabled}
              disabled={save.isPending}
              onChange={(value) => update({ enabled: value, hour: currentHour })}
              label={t('discharge.reminders.switch')}
              description={t('discharge.reminders.switchHint')}
            />
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('discharge.reminders.hour')} htmlFor="reminder-hour" className="w-40">
                <Select id="reminder-hour" value={currentHour} onChange={(e) => setHour(Number(e.target.value))} dir="ltr">
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </Select>
              </Field>
              {enabled && hour !== null && hour !== savedHour ? (
                <Button size="md" loading={save.isPending} onClick={() => update({ enabled: true, hour: currentHour })}>
                  {t('discharge.reminders.save')}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted">{t('discharge.reminders.timezone', { zone: timezone })}</p>
            {rows.length ? (
              <ul className="space-y-1.5 text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-fg">
                      {r.name}
                      {r.dose ? <span className="text-muted"> · {r.dose}</span> : null}
                    </span>
                    <span className="text-xs text-muted">
                      {r.end_on ? t('discharge.reminders.until', { date: formatDate(r.end_on) }) : t('discharge.medication.ongoing')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted">{t('discharge.reminders.disclaimer')}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

