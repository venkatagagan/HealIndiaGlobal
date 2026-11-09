import { useState, type ReactNode } from 'react';
import { CheckCircle2, FileWarning, Info, Plus, RotateCcw, Save, Sparkles, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import type { Uuid } from '../api/types';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/overlay';
import { DocumentAnalysisCard } from './DocumentAnalysisCard';
import {
  isAnalysisPending,
  useConfirmAnalysis,
  useDocumentAnalysis,
  useRejectAnalysis,
  useRetryAnalysis,
  useUpdateAnalysis,
} from './hooks';
import { useDocaiText, type DocaiTextKey, type Vars } from './i18n';
import { cleanEditable, draftFromAnalysis, hasCriticalValues } from './model';
import { Banner, FLAG_CLASSES, Pill, ROW_TINT, SIGNIFICANCE_CLASSES, Section, fieldClass } from './parts';
import {
  ANALYSIS_DOC_TYPES,
  FINDING_SIGNIFICANCES,
  LAB_FLAGS,
  type AnalysisAudience,
  type AnalysisDocType,
  type AnalysisEditableData,
  type DocumentAnalysisOut,
  type FindingSignificance,
  type LabFlag,
} from './types';

export interface DocumentAnalysisReviewProps {
  analysisId: Uuid;
  /** `patient` (plain-language summary) or `clinical` (agents/staff editing on the patient's behalf) */
  audience?: AnalysisAudience;
  /** after POST /confirm succeeded */
  onConfirmed?: (analysis: DocumentAnalysisOut) => void;
  /** after POST /reject succeeded */
  onRejected?: (analysis: DocumentAnalysisOut) => void;
  className?: string;
}

type T = (key: DocaiTextKey, vars?: Vars) => string;

/**
 * Status + mandatory review -> edit -> confirm of an AI report reading (PLAN 7.1). While queued/processing it polls;
 * when completed it shows the extraction as an editable form with Confirm / Discard; once confirmed it shows the
 * read-only card with "edited by patient" markers.
 */
export function DocumentAnalysisReview({ analysisId, audience = 'patient', onConfirmed, onRejected, className }: DocumentAnalysisReviewProps) {
  const { t } = useDocaiText();
  const query = useDocumentAnalysis(analysisId);
  const retry = useRetryAnalysis();
  const frame = cn('rounded-2xl border border-border bg-surface p-4 shadow-xs sm:p-5', className);

  if (query.isLoading) {
    return (
      <div className={frame}>
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div role="alert" className={cn(frame, 'text-sm text-danger-ink')}>
        {t('loadError')} {query.error ? errorMessage(query.error) : null}
        <Button variant="link" className="ms-2" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const analysis = query.data;

  if (isAnalysisPending(analysis.status)) {
    return (
      <div className={cn(frame, 'flex items-center gap-4')} aria-live="polite" aria-busy>
        <div className="relative flex size-14 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <span className="relative flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <Sparkles className="size-6 animate-pulse" aria-hidden />
          </span>
        </div>
        <div>
          <p className="font-semibold text-fg">{analysis.status === 'queued' ? t('queuedTitle') : t('processingTitle')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('processingHint')}</p>
        </div>
      </div>
    );
  }

  if (analysis.status === 'failed') {
    return (
      <div className={cn(frame, 'space-y-3')}>
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-fg">{t('failedTitle')}</p>
            {analysis.error && <p className="mt-0.5 text-sm text-muted">{analysis.error}</p>}
            <p className="mt-0.5 text-sm text-muted">{t('failedHint')}</p>
          </div>
        </div>
        <Button
          variant="outline"
          leftIcon={<RotateCcw className="size-4" aria-hidden />}
          loading={retry.isPending}
          onClick={() =>
            retry.mutate(analysis.id, { onError: (e) => toast.error(errorMessage(e)) })
          }
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (analysis.status === 'unsupported') {
    return (
      <div className={cn(frame, 'flex items-start gap-3')}>
        <FileWarning className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold text-fg">{t('unsupportedTitle')}</p>
          <p className="mt-0.5 text-sm text-muted">{analysis.error || t('unsupportedHint')}</p>
          {analysis.error && <p className="mt-0.5 text-sm text-muted">{t('unsupportedHint')}</p>}
        </div>
      </div>
    );
  }

  if (analysis.review_status === 'confirmed') {
    return <DocumentAnalysisCard analysis={analysis} audience={audience} className={className} />;
  }
  if (analysis.review_status === 'rejected') {
    return (
      <div className={cn(frame, 'flex items-start gap-3 text-sm text-muted')}>
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>{t('discardedToast')}</p>
      </div>
    );
  }

  return (
    <ReviewForm
      key={analysis.id}
      analysis={analysis}
      audience={audience}
      t={t}
      className={frame}
      onConfirmed={onConfirmed}
      onRejected={onRejected}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
// Editable form
// ---------------------------------------------------------------------------------------------------------
function ReviewForm({
  analysis,
  audience,
  t,
  className,
  onConfirmed,
  onRejected,
}: {
  analysis: DocumentAnalysisOut;
  audience: AnalysisAudience;
  t: T;
  className: string;
  onConfirmed?: (analysis: DocumentAnalysisOut) => void;
  onRejected?: (analysis: DocumentAnalysisOut) => void;
}) {
  const [data, setData] = useState<AnalysisEditableData>(() => draftFromAnalysis(analysis));
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const update = useUpdateAnalysis();
  const confirm = useConfirmAnalysis();
  const reject = useRejectAnalysis();
  const busy = update.isPending || confirm.isPending || reject.isPending;

  function set<K extends keyof AnalysisEditableData>(key: K, value: AnalysisEditableData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const redFlags = analysis.red_flags ?? [];
  const critical = hasCriticalValues(data);
  const issues = analysis.quality?.issues ?? [];

  async function onSaveDraft() {
    try {
      await update.mutateAsync({ id: analysis.id, data: cleanEditable(data) });
      setDirty(false);
      toast.success(t('draftSaved'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onConfirm() {
    try {
      const result = await confirm.mutateAsync({ id: analysis.id, data: cleanEditable(data) });
      toast.success(t('confirmedToast'));
      onConfirmed?.(result);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onDiscard() {
    try {
      const result = await reject.mutateAsync(analysis.id);
      toast.success(t('discardedToast'));
      onRejected?.(result);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const confidence = analysis.confidence != null ? Number(analysis.confidence) : null;

  return (
    // a div (not a <form>): hosts may render this inside their own form, and nested forms are invalid HTML
    <div role="form" className={cn(className, 'space-y-5')} aria-label={t('reviewTitle')}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-fg">{t('reviewTitle')}</h3>
          <Pill className="bg-warning-soft text-warning-ink">{t('pendingReview')}</Pill>
          {confidence != null && !Number.isNaN(confidence) && (
            <Pill className="bg-neutral-soft text-neutral-ink">
              {t('confidence')}: {Math.round(confidence * 100)}%
            </Pill>
          )}
          {analysis.quality?.pages_analyzed ? (
            <Pill className="bg-neutral-soft text-neutral-ink">{t('pagesAnalyzed', { n: analysis.quality.pages_analyzed })}</Pill>
          ) : null}
        </div>
        <p className="text-sm text-muted">{t('reviewHint')}</p>
      </header>

      {redFlags.length > 0 && (
        <Banner tone="danger" title={t('redFlagsTitle')}>
          <ul className="list-disc space-y-0.5 ps-5">
            {redFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="font-medium">{t('emergencyHint')}</p>
        </Banner>
      )}
      {critical && (
        <Banner tone="danger" title={t('criticalTitle')}>
          <p>{t('criticalHint')}</p>
        </Banner>
      )}
      {issues.length > 0 && (
        <Banner tone="warning" title={t('qualityIssues')}>
          <ul className="list-disc ps-5">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Labeled label={t('docType')}>
          <select
            className={cn(fieldClass, 'h-10')}
            value={data.doc_type ?? ''}
            onChange={(e) => set('doc_type', (e.target.value || null) as AnalysisDocType | null)}
            disabled={busy}
          >
            <option value="">{t('select')}</option>
            {ANALYSIS_DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`doc_${d}`)}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label={t('reportDate')}>
          <input
            type="date"
            className={cn(fieldClass, 'h-10')}
            value={data.report_date ?? ''}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set('report_date', e.target.value || null)}
            disabled={busy}
          />
        </Labeled>
        <Labeled label={t('facility')}>
          <input
            className={cn(fieldClass, 'h-10')}
            value={data.facility_name ?? ''}
            maxLength={300}
            onChange={(e) => set('facility_name', e.target.value)}
            disabled={busy}
          />
        </Labeled>
      </div>

      {audience === 'clinical' && analysis.summary_clinical && (
        <Section title={t('summaryClinical')} marker={<Pill className="bg-neutral-soft text-neutral-ink">{t('aiDraft')}</Pill>}>
          <p className="whitespace-pre-line rounded-lg bg-surface-2 p-3 text-sm text-fg">{analysis.summary_clinical}</p>
        </Section>
      )}

      <Labeled label={t('summaryPatient')}>
        <textarea
          className={cn(fieldClass, 'min-h-24')}
          rows={4}
          value={data.summary_patient ?? ''}
          maxLength={5000}
          onChange={(e) => set('summary_patient', e.target.value)}
          disabled={busy}
        />
      </Labeled>

      {/* key findings */}
      <Section
        title={t('findings')}
        actions={<AddButton label={t('add')} disabled={busy} onClick={() => set('key_findings', [...data.key_findings, { finding: '', significance: 'normal' }])} />}
      >
        {data.key_findings.length === 0 && <Empty t={t} />}
        <ul className="space-y-2">
          {data.key_findings.map((f, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center">
              <input
                aria-label={`${t('finding')} ${i + 1}`}
                className={cn(fieldClass, 'flex-1')}
                value={f.finding}
                onChange={(e) => set('key_findings', replaceAt(data.key_findings, i, { ...f, finding: e.target.value }))}
                disabled={busy}
              />
              <div className="flex items-center gap-2">
                <select
                  aria-label={t('significance')}
                  className={cn(fieldClass, 'h-9 w-auto', SIGNIFICANCE_CLASSES[f.significance])}
                  value={f.significance}
                  onChange={(e) =>
                    set('key_findings', replaceAt(data.key_findings, i, { ...f, significance: e.target.value as FindingSignificance }))
                  }
                  disabled={busy}
                >
                  {FINDING_SIGNIFICANCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`sig_${s}`)}
                    </option>
                  ))}
                </select>
                <RemoveButton label={t('remove')} disabled={busy} onClick={() => set('key_findings', removeAt(data.key_findings, i))} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* lab values */}
      <Section
        title={t('labValues')}
        actions={
          <AddButton
            label={t('add')}
            disabled={busy}
            onClick={() => set('lab_values', [...data.lab_values, { test: '', value: '', unit: null, reference_range: null, flag: 'unknown' }])}
          />
        }
      >
        {data.lab_values.length === 0 && <Empty t={t} />}
        <ul className="space-y-2">
          {data.lab_values.map((l, i) => (
            <li key={i} className={cn('grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto_auto] sm:items-center', ROW_TINT[l.flag])}>
              <input
                aria-label={`${t('test')} ${i + 1}`}
                placeholder={t('test')}
                className={cn(fieldClass, 'col-span-2 sm:col-span-1')}
                value={l.test}
                onChange={(e) => set('lab_values', replaceAt(data.lab_values, i, { ...l, test: e.target.value }))}
                disabled={busy}
              />
              <input
                aria-label={t('value')}
                placeholder={t('value')}
                className={fieldClass}
                value={l.value}
                onChange={(e) => set('lab_values', replaceAt(data.lab_values, i, { ...l, value: e.target.value }))}
                disabled={busy}
              />
              <input
                aria-label={t('unit')}
                placeholder={t('unit')}
                className={fieldClass}
                value={l.unit ?? ''}
                onChange={(e) => set('lab_values', replaceAt(data.lab_values, i, { ...l, unit: e.target.value }))}
                disabled={busy}
              />
              <input
                aria-label={t('range')}
                placeholder={t('range')}
                className={fieldClass}
                value={l.reference_range ?? ''}
                onChange={(e) => set('lab_values', replaceAt(data.lab_values, i, { ...l, reference_range: e.target.value }))}
                disabled={busy}
              />
              <select
                aria-label={t('flag')}
                className={cn(fieldClass, 'h-9 w-auto font-medium', FLAG_CLASSES[l.flag])}
                value={l.flag}
                onChange={(e) => set('lab_values', replaceAt(data.lab_values, i, { ...l, flag: e.target.value as LabFlag }))}
                disabled={busy}
              >
                {LAB_FLAGS.map((f) => (
                  <option key={f} value={f}>
                    {t(`flag_${f}`)}
                  </option>
                ))}
              </select>
              <RemoveButton label={t('remove')} disabled={busy} onClick={() => set('lab_values', removeAt(data.lab_values, i))} />
            </li>
          ))}
        </ul>
      </Section>

      {/* medications */}
      <Section
        title={t('medications')}
        actions={
          <AddButton label={t('add')} disabled={busy} onClick={() => set('medications', [...data.medications, { name: '', dose: null, frequency: null }])} />
        }
      >
        {data.medications.length === 0 && <Empty t={t} />}
        <ul className="space-y-2">
          {data.medications.map((m, i) => (
            <li key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center">
              <input
                aria-label={`${t('medName')} ${i + 1}`}
                placeholder={t('medName')}
                className={cn(fieldClass, 'col-span-2 sm:col-span-1')}
                value={m.name}
                onChange={(e) => set('medications', replaceAt(data.medications, i, { ...m, name: e.target.value }))}
                disabled={busy}
              />
              <input
                aria-label={t('dose')}
                placeholder={t('dose')}
                className={fieldClass}
                value={m.dose ?? ''}
                onChange={(e) => set('medications', replaceAt(data.medications, i, { ...m, dose: e.target.value }))}
                disabled={busy}
              />
              <input
                aria-label={t('frequency')}
                placeholder={t('frequency')}
                className={fieldClass}
                value={m.frequency ?? ''}
                onChange={(e) => set('medications', replaceAt(data.medications, i, { ...m, frequency: e.target.value }))}
                disabled={busy}
              />
              <RemoveButton label={t('remove')} disabled={busy} onClick={() => set('medications', removeAt(data.medications, i))} />
            </li>
          ))}
        </ul>
      </Section>

      <StringListEditor title={t('diagnoses')} t={t} items={data.diagnoses_mentioned} disabled={busy} onChange={(v) => set('diagnoses_mentioned', v)} />
      <StringListEditor title={t('procedures')} t={t} items={data.procedures_mentioned} disabled={busy} onChange={(v) => set('procedures_mentioned', v)} />
      <StringListEditor title={t('recommendations')} t={t} items={data.recommendations} disabled={busy} onChange={(v) => set('recommendations', v)} />

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {t('disclaimer')}
      </p>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" leftIcon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDiscardOpen(true)} disabled={busy}>
          {t('discard')}
        </Button>
        <Button variant="outline" leftIcon={<Save className="size-4" aria-hidden />} onClick={() => void onSaveDraft()} loading={update.isPending} disabled={busy || !dirty}>
          {t('saveDraft')}
        </Button>
        <Button leftIcon={<CheckCircle2 className="size-4" aria-hidden />} onClick={() => void onConfirm()} loading={confirm.isPending} disabled={busy}>
          {t('confirm')}
        </Button>
      </div>

      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={onDiscard}
        title={t('discard')}
        description={t('discardQuestion')}
        confirmLabel={t('discard')}
        cancelLabel={t('cancel')}
        tone="danger"
        loading={reject.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}
function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-fg">{label}</span>
      {children}
    </label>
  );
}

function Empty({ t }: { t: T }) {
  return <p className="text-sm text-muted">{t('nothingFound')}</p>;
}

function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="xs" leftIcon={<Plus className="size-3.5" aria-hidden />} onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-9 shrink-0 items-center justify-center justify-self-end rounded-md text-muted hover:bg-danger-soft hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

function StringListEditor({
  title,
  items,
  onChange,
  disabled,
  t,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  disabled?: boolean;
  t: T;
}) {
  return (
    <Section title={title} actions={<AddButton label={t('add')} disabled={disabled} onClick={() => onChange([...items, ''])} />}>
      {items.length === 0 && <Empty t={t} />}
      <ul className="space-y-2">
        {items.map((value, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              aria-label={`${title} ${i + 1}`}
              className={fieldClass}
              value={value}
              onChange={(e) => onChange(replaceAt(items, i, e.target.value))}
              disabled={disabled}
            />
            <RemoveButton label={t('remove')} disabled={disabled} onClick={() => onChange(removeAt(items, i))} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
