import type { ReactNode } from 'react';
import { CheckCircle2, Clock, FileSearch, Info } from 'lucide-react';
import { cn } from '../lib/cn';
import { useDocaiText } from './i18n';
import { editMarkers, hasCriticalValues, normalizeEditable } from './model';
import { Banner, EditedMark, FLAG_CLASSES, Pill, ROW_TINT, SIGNIFICANCE_CLASSES, Section } from './parts';
import type { AnalysisAudience, AnalysisEditableData, DocumentAnalysisOut } from './types';

export interface DocumentAnalysisCardProps {
  analysis: DocumentAnalysisOut;
  /** `clinical` (hospital/agent/admin): English clinical summary; `patient`: plain-language summary */
  audience?: AnalysisAudience;
  className?: string;
  /** hide the outer card frame (when embedded in another card) */
  bare?: boolean;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(d);
  } catch {
    return d.toDateString();
  }
}

/**
 * Read-only view of a CONFIRMED analysis (for hospital, agent and admin views and for the patient after confirming).
 * Shows only `confirmed_data`; values the patient changed from the AI output carry an "edited by patient" marker.
 */
export function DocumentAnalysisCard({ analysis, audience = 'clinical', className, bare = false }: DocumentAnalysisCardProps) {
  const { t } = useDocaiText();
  const frame = bare ? '' : 'rounded-2xl border border-border bg-surface p-4 shadow-xs sm:p-5';

  if (analysis.review_status !== 'confirmed' || !analysis.confirmed_data) {
    const rejected = analysis.review_status === 'rejected';
    return (
      <div className={cn(frame, 'flex items-start gap-3 text-sm text-muted', className)}>
        {rejected ? <Info className="mt-0.5 size-5 shrink-0" aria-hidden /> : <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />}
        <div>
          <p className="font-medium text-fg">{t('analysisFor')}</p>
          <p>{rejected ? t('rejected') : t('awaitingConfirmation')}</p>
        </div>
      </div>
    );
  }

  const data: AnalysisEditableData = normalizeEditable(analysis.confirmed_data);
  const marks = editMarkers(analysis);
  const edited = (key: keyof AnalysisEditableData) => (marks.fields.has(key) ? <EditedMark label={t('editedByPatient')} /> : null);
  const rowEdited = (key: keyof AnalysisEditableData, i: number) =>
    marks.rows[key]?.has(i) ? <EditedMark label={t('editedByPatient')} /> : null;
  const confirmedSummaryClinical = (analysis.confirmed_data as unknown as { summary_clinical?: string | null }).summary_clinical;
  const summary = audience === 'clinical' ? confirmedSummaryClinical ?? analysis.summary_clinical ?? null : data.summary_patient;
  const summaryIsAi = audience === 'clinical' && !confirmedSummaryClinical && !!analysis.summary_clinical;
  const redFlags = analysis.red_flags ?? [];
  const critical = hasCriticalValues(data);

  return (
    <article className={cn(frame, 'space-y-4', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
            <FileSearch className="size-5 text-primary-ink" aria-hidden />
            {data.doc_type ? t(`doc_${data.doc_type}`) : t('analysisFor')}
            {edited('doc_type')}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {[formatDate(data.report_date), data.facility_name].filter(Boolean).join(' · ')}
            {(marks.fields.has('report_date') || marks.fields.has('facility_name')) && (
              <span className="ms-2 align-middle">
                <EditedMark label={t('editedByPatient')} />
              </span>
            )}
          </p>
        </div>
        <Pill className="bg-success-soft text-success-ink">
          <CheckCircle2 className="size-3.5" aria-hidden />
          {t('confirmed')}
          {analysis.confirmed_at ? ` · ${formatDate(analysis.confirmed_at)}` : ''}
        </Pill>
      </header>

      {redFlags.length > 0 && (
        <Banner tone="danger" title={t('redFlagsTitle')}>
          <ul className="list-disc space-y-0.5 ps-5">
            {redFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Banner>
      )}
      {critical && redFlags.length === 0 && (
        <Banner tone="danger" title={t('criticalTitle')}>
          <p>{audience === 'patient' ? t('criticalHint') : null}</p>
        </Banner>
      )}

      {summary && (
        <Section
          title={audience === 'clinical' ? t('summaryClinical') : t('summaryPatient')}
          marker={summaryIsAi ? <Pill className="bg-neutral-soft text-neutral-ink">{t('aiDraft')}</Pill> : audience === 'patient' ? edited('summary_patient') : null}
        >
          <p className="whitespace-pre-line text-sm text-fg">{summary}</p>
        </Section>
      )}

      {data.key_findings.length > 0 && (
        <Section title={t('findings')} marker={edited('key_findings')}>
          <ul className="space-y-1.5">
            {data.key_findings.map((f, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 text-sm text-fg">
                <Pill className={SIGNIFICANCE_CLASSES[f.significance]}>{t(`sig_${f.significance}`)}</Pill>
                <span className="min-w-0 flex-1">{f.finding}</span>
                {rowEdited('key_findings', i)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.lab_values.length > 0 && (
        <Section title={t('labValues')} marker={edited('lab_values')}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-surface-2 text-start text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('test')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('value')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('range')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('flag')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lab_values.map((l, i) => (
                  <tr key={i} className={cn('border-t', ROW_TINT[l.flag])}>
                    <td className="px-3 py-2 text-fg">
                      <span className="me-1">{l.test}</span>
                      {rowEdited('lab_values', i)}
                    </td>
                    <td className="px-3 py-2 font-medium text-fg">
                      {l.value} {l.unit ?? ''}
                    </td>
                    <td className="px-3 py-2 text-muted">{l.reference_range ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Pill className={FLAG_CLASSES[l.flag]}>{t(`flag_${l.flag}`)}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {data.medications.length > 0 && (
        <Section title={t('medications')} marker={edited('medications')}>
          <ul className="space-y-1 text-sm text-fg">
            {data.medications.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted">{[m.dose, m.frequency].filter(Boolean).join(' · ')}</span>
                {rowEdited('medications', i)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <TextList title={t('diagnoses')} items={data.diagnoses_mentioned} marker={edited('diagnoses_mentioned')} />
      <TextList title={t('procedures')} items={data.procedures_mentioned} marker={edited('procedures_mentioned')} />
      <TextList title={t('recommendations')} items={data.recommendations} marker={edited('recommendations')} />

      <p className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted">
        <Info className="size-3.5 shrink-0" aria-hidden />
        {t('disclaimer')}
      </p>
    </article>
  );
}

function TextList({ title, items, marker }: { title: string; items: string[]; marker: ReactNode }) {
  if (!items.length) return null;
  return (
    <Section title={title} marker={marker}>
      <ul className="list-disc space-y-0.5 ps-5 text-sm text-fg">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </Section>
  );
}
