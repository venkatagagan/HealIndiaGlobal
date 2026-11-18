/**
 * Personal-data breach register. Recording a breach starts the 72-hour clock for notifying the Data Protection
 * Board / supervisory authority (deadline = detected_at + 72 h); the API flags `notification_overdue` when the
 * deadline passed before both were notified. API: GET|POST /admin/privacy/breaches,
 * PATCH /admin/privacy/breaches/{id}.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Pencil, Plus, ShieldAlert } from 'lucide-react';
import { useAppTranslation } from '../../../../i18n';
import { formatDateTime, formatNumber, fromDateTimeLocal, splitList, toDateTimeLocal } from '../../lib/format';
import { useOpsMutation } from '../../lib/mutations';
import {
  BREACH_LIMITS,
  BREACH_SEVERITIES,
  BREACH_STATUSES,
  privacyToolsApi,
  privacyToolsKeys,
  type BreachIn,
  type BreachOut,
  type BreachSeverity,
  type BreachStatus,
  type BreachUpdate,
} from '../../lib/privacyToolsApi';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, Select, Textarea, type Column, type Tone } from '../../ui';

const SEVERITY_TONES: Record<BreachSeverity, Tone> = { low: 'neutral', medium: 'amber', high: 'red', critical: 'red' };
const STATUS_TONES: Record<BreachStatus, Tone> = { open: 'red', contained: 'amber', notified: 'blue', closed: 'green' };

const severityLabel = (t: TFunction, s: BreachSeverity) => t(`privacyTools.breaches.severity.${s}`);
const statusLabel = (t: TFunction, s: BreachStatus) => t(`privacyTools.breaches.status.${s}`);

/** Deadline badge: overdue (red), authorities notified (green) or hours left (amber). */
function DeadlineBadge({ breach }: { breach: BreachOut }) {
  const { t } = useAppTranslation();
  const [now] = useState(() => Date.now());
  if (breach.notification_overdue) return <Badge tone="red">{t('privacyTools.breaches.overdue')}</Badge>;
  if (breach.dpb_notified_at && breach.supervisory_authority_notified_at)
    return <Badge tone="green">{t('privacyTools.breaches.authoritiesNotified')}</Badge>;
  if (breach.status === 'closed') return null;
  const hoursLeft = Math.max(0, Math.ceil((new Date(breach.notification_deadline_at).getTime() - now) / 3_600_000));
  return <Badge tone="amber">{t('privacyTools.breaches.hoursLeft', { hours: formatNumber(hoursLeft) })}</Badge>;
}

export function BreachRegisterPanel() {
  const { t } = useAppTranslation();
  const [status, setStatus] = useState<BreachStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BreachOut | null>(null);
  const list = useQuery({
    queryKey: [...privacyToolsKeys.breaches, status],
    queryFn: () => privacyToolsApi.breaches(status || undefined),
  });
  const overdue = list.data?.filter((b) => b.notification_overdue).length ?? 0;

  const columns: Column<BreachOut>[] = [
    {
      key: 'reference',
      header: t('privacyTools.breaches.columns.reference'),
      cell: (b) => (
        <div className="min-w-0">
          <p className="font-medium">{b.reference}</p>
          <p className="max-w-xs truncate text-xs text-muted">{b.title}</p>
        </div>
      ),
    },
    { key: 'severity', header: t('privacyTools.breaches.columns.severity'), cell: (b) => <Badge tone={SEVERITY_TONES[b.severity]}>{severityLabel(t, b.severity)}</Badge> },
    { key: 'status', header: t('privacyTools.breaches.columns.status'), cell: (b) => <Badge tone={STATUS_TONES[b.status]}>{statusLabel(t, b.status)}</Badge> },
    { key: 'detected', header: t('privacyTools.breaches.columns.detected'), cell: (b) => formatDateTime(b.detected_at), hideOnMobile: true },
    {
      key: 'deadline',
      header: t('privacyTools.breaches.columns.deadline'),
      cell: (b) => (
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs">{formatDateTime(b.notification_deadline_at)}</span>
          <DeadlineBadge breach={b} />
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('privacyTools.breaches.columns.actions')}</span>,
      align: 'right',
      cell: (b) => (
        <Button size="sm" variant="outline" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(b)}>
          {t('privacyTools.breaches.update')}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={t('privacyTools.breaches.title')}
      actions={
        <>
          <Select
            aria-label={t('privacyTools.breaches.filterStatus')}
            value={status}
            onChange={(e) => setStatus(e.target.value as BreachStatus | '')}
            placeholder={t('privacyTools.breaches.allStatuses')}
            options={BREACH_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }))}
            className="w-auto"
          />
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
            {t('privacyTools.breaches.record')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{t('privacyTools.breaches.description')}</p>
      {overdue > 0 && (
        <p role="alert" className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {t('privacyTools.breaches.overdueBanner', { n: formatNumber(overdue) })}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={list.data}
        rowKey={(b) => b.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(b) => setEditing(b)}
        empty={<EmptyState icon={<ShieldAlert className="size-6" />} title={t('privacyTools.breaches.empty')} />}
      />
      <RecordBreachDialog open={creating} onClose={() => setCreating(false)} />
      <UpdateBreachDialog breach={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

const EMPTY_BREACH = {
  title: '',
  description: '',
  severity: 'medium' as BreachSeverity,
  detected_at: '',
  occurred_at: '',
  categories: '',
  estimate: '',
  consequences: '',
  measures: '',
  notes: '',
};

function RecordBreachDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState(EMPTY_BREACH);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_BREACH, detected_at: toDateTimeLocal(new Date().toISOString()) });
      setTouched(false);
    }
  }, [open]);
  const set = <K extends keyof typeof EMPTY_BREACH>(key: K, value: (typeof EMPTY_BREACH)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const titleInvalid = form.title.trim().length < BREACH_LIMITS.titleMin;
  const descriptionInvalid = form.description.trim().length < BREACH_LIMITS.descriptionMin;
  const save = useOpsMutation({
    mutationFn: () => {
      const body: BreachIn = {
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        detected_at: fromDateTimeLocal(form.detected_at),
        occurred_at: fromDateTimeLocal(form.occurred_at),
        data_categories: splitList(form.categories).slice(0, BREACH_LIMITS.categories),
        affected_subjects_estimate: form.estimate.trim() ? Number(form.estimate) : null,
        likely_consequences: form.consequences.trim() || null,
        measures_taken: form.measures.trim() || null,
        notes: form.notes.trim() || null,
      };
      return privacyToolsApi.recordBreach(body);
    },
    success: (b) => t('privacyTools.breaches.recorded', { reference: b.reference }),
    invalidate: [privacyToolsKeys.breaches],
    onSuccess: onClose,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('privacyTools.breaches.recordTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t('ui.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              setTouched(true);
              if (!titleInvalid && !descriptionInvalid) save.mutate();
            }}
          >
            {t('privacyTools.breaches.record')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-muted">{t('privacyTools.breaches.clockHint')}</p>
        <Field
          label={t('privacyTools.breaches.fields.title')}
          required
          error={touched && titleInvalid ? t('privacyTools.breaches.tooShort', { min: BREACH_LIMITS.titleMin }) : null}
        >
          {(id) => <Input id={id} value={form.title} maxLength={BREACH_LIMITS.titleMax} onChange={(e) => set('title', e.target.value)} invalid={touched && titleInvalid} data-autofocus />}
        </Field>
        <Field
          label={t('privacyTools.breaches.fields.description')}
          required
          error={touched && descriptionInvalid ? t('privacyTools.breaches.tooShort', { min: BREACH_LIMITS.descriptionMin }) : null}
        >
          {(id) => (
            <Textarea id={id} rows={4} value={form.description} maxLength={BREACH_LIMITS.descriptionMax} onChange={(e) => set('description', e.target.value)} invalid={touched && descriptionInvalid} />
          )}
        </Field>
        <Grid>
          <Field label={t('privacyTools.breaches.fields.severity')} required>
            {(id) => (
              <Select id={id} value={form.severity} onChange={(e) => set('severity', e.target.value as BreachSeverity)} options={BREACH_SEVERITIES.map((s) => ({ value: s, label: severityLabel(t, s) }))} />
            )}
          </Field>
          <Field label={t('privacyTools.breaches.fields.estimate')}>
            {(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={form.estimate} onChange={(e) => set('estimate', e.target.value)} />}
          </Field>
          <Field label={t('privacyTools.breaches.fields.detectedAt')} hint={t('privacyTools.breaches.fields.detectedAtHint')}>
            {(id) => <Input id={id} type="datetime-local" value={form.detected_at} onChange={(e) => set('detected_at', e.target.value)} />}
          </Field>
          <Field label={t('privacyTools.breaches.fields.occurredAt')}>
            {(id) => <Input id={id} type="datetime-local" value={form.occurred_at} onChange={(e) => set('occurred_at', e.target.value)} />}
          </Field>
        </Grid>
        <Field label={t('privacyTools.breaches.fields.categories')} hint={t('privacyTools.breaches.fields.categoriesHint')}>
          {(id) => <Input id={id} value={form.categories} onChange={(e) => set('categories', e.target.value)} />}
        </Field>
        <Field label={t('privacyTools.breaches.fields.consequences')}>
          {(id) => <Textarea id={id} rows={2} maxLength={BREACH_LIMITS.text} value={form.consequences} onChange={(e) => set('consequences', e.target.value)} />}
        </Field>
        <Field label={t('privacyTools.breaches.fields.measures')}>
          {(id) => <Textarea id={id} rows={2} maxLength={BREACH_LIMITS.text} value={form.measures} onChange={(e) => set('measures', e.target.value)} />}
        </Field>
        <Field label={t('privacyTools.breaches.fields.notes')}>
          {(id) => <Textarea id={id} rows={2} maxLength={BREACH_LIMITS.text} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

interface UpdateForm {
  status: BreachStatus;
  severity: BreachSeverity;
  contained_at: string;
  dpb_notified_at: string;
  supervisory_authority_notified_at: string;
  subjects_notified_at: string;
  categories: string;
  estimate: string;
  consequences: string;
  measures: string;
  notes: string;
}

function toForm(b: BreachOut): UpdateForm {
  return {
    status: b.status,
    severity: b.severity,
    contained_at: toDateTimeLocal(b.contained_at),
    dpb_notified_at: toDateTimeLocal(b.dpb_notified_at),
    supervisory_authority_notified_at: toDateTimeLocal(b.supervisory_authority_notified_at),
    subjects_notified_at: toDateTimeLocal(b.subjects_notified_at),
    categories: b.data_categories.join(', '),
    estimate: b.affected_subjects_estimate == null ? '' : String(b.affected_subjects_estimate),
    consequences: b.likely_consequences ?? '',
    measures: b.measures_taken ?? '',
    notes: b.notes ?? '',
  };
}

/** Only the fields that changed (the API applies exactly what is sent). */
function diff(before: UpdateForm, after: UpdateForm): BreachUpdate {
  const out: BreachUpdate = {};
  if (after.status !== before.status) out.status = after.status;
  if (after.severity !== before.severity) out.severity = after.severity;
  for (const key of ['contained_at', 'dpb_notified_at', 'supervisory_authority_notified_at', 'subjects_notified_at'] as const) {
    if (after[key] !== before[key]) out[key] = fromDateTimeLocal(after[key]);
  }
  if (after.categories !== before.categories) out.data_categories = splitList(after.categories).slice(0, BREACH_LIMITS.categories);
  if (after.estimate !== before.estimate) out.affected_subjects_estimate = after.estimate.trim() ? Number(after.estimate) : null;
  if (after.consequences !== before.consequences) out.likely_consequences = after.consequences.trim() || null;
  if (after.measures !== before.measures) out.measures_taken = after.measures.trim() || null;
  if (after.notes !== before.notes) out.notes = after.notes.trim() || null;
  return out;
}

function UpdateBreachDialog({ breach, onClose }: { breach: BreachOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<UpdateForm | null>(null);
  useEffect(() => {
    setForm(breach ? toForm(breach) : null);
  }, [breach]);
  const set = <K extends keyof UpdateForm>(key: K, value: UpdateForm[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const changes = breach && form ? diff(toForm(breach), form) : {};
  const save = useOpsMutation({
    mutationFn: () => privacyToolsApi.updateBreach(breach!.id, changes),
    success: (b) => t('privacyTools.breaches.updated', { reference: b.reference }),
    invalidate: [privacyToolsKeys.breaches],
    onSuccess: onClose,
  });

  const dateField = (key: 'contained_at' | 'dpb_notified_at' | 'supervisory_authority_notified_at' | 'subjects_notified_at') => (
    <Field label={t(`privacyTools.breaches.fields.${key}`)}>
      {(id) => <Input id={id} type="datetime-local" value={form?.[key] ?? ''} onChange={(e) => set(key, e.target.value)} />}
    </Field>
  );

  return (
    <Modal
      open={!!breach && !!form}
      onClose={onClose}
      size="lg"
      title={breach ? t('privacyTools.breaches.updateTitle', { reference: breach.reference }) : ''}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t('ui.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={Object.keys(changes).length === 0} onClick={() => save.mutate()}>
            {t('privacyTools.breaches.save')}
          </Button>
        </>
      }
    >
      {breach && form && (
        <div className="grid gap-3">
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <p className="font-medium">{breach.title}</p>
            <p className="mt-1 whitespace-pre-line text-muted">{breach.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{t('privacyTools.breaches.detectedOn', { date: formatDateTime(breach.detected_at) })}</span>
              <span>{t('privacyTools.breaches.deadlineOn', { date: formatDateTime(breach.notification_deadline_at) })}</span>
              <DeadlineBadge breach={breach} />
            </div>
          </div>
          <Grid>
            <Field label={t('privacyTools.breaches.fields.status')}>
              {(id) => (
                <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value as BreachStatus)} options={BREACH_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }))} />
              )}
            </Field>
            <Field label={t('privacyTools.breaches.fields.severity')}>
              {(id) => (
                <Select id={id} value={form.severity} onChange={(e) => set('severity', e.target.value as BreachSeverity)} options={BREACH_SEVERITIES.map((s) => ({ value: s, label: severityLabel(t, s) }))} />
              )}
            </Field>
            {dateField('contained_at')}
            {dateField('dpb_notified_at')}
            {dateField('supervisory_authority_notified_at')}
            {dateField('subjects_notified_at')}
            <Field label={t('privacyTools.breaches.fields.estimate')}>
              {(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={form.estimate} onChange={(e) => set('estimate', e.target.value)} />}
            </Field>
          </Grid>
          <Field label={t('privacyTools.breaches.fields.categories')} hint={t('privacyTools.breaches.fields.categoriesHint')}>
            {(id) => <Input id={id} value={form.categories} onChange={(e) => set('categories', e.target.value)} />}
          </Field>
          <Field label={t('privacyTools.breaches.fields.consequences')}>
            {(id) => <Textarea id={id} rows={2} maxLength={BREACH_LIMITS.text} value={form.consequences} onChange={(e) => set('consequences', e.target.value)} />}
          </Field>
          <Field label={t('privacyTools.breaches.fields.measures')}>
            {(id) => <Textarea id={id} rows={2} maxLength={BREACH_LIMITS.text} value={form.measures} onChange={(e) => set('measures', e.target.value)} />}
          </Field>
          <Field label={t('privacyTools.breaches.fields.notes')}>
            {(id) => <Textarea id={id} rows={2} maxLength={BREACH_LIMITS.text} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </div>
      )}
    </Modal>
  );
}
