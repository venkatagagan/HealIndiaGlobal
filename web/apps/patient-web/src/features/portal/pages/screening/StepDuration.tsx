import { Bed, Briefcase, Accessibility, FileText, X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DURATION_UNITS,
  DURATION_UNIT_LABELS,
  PREVIOUS_TREATMENTS,
  PREVIOUS_TREATMENT_LABELS,
  SEVERITY_LEVEL_LABELS,
  type DurationUnit,
  type PreviousTreatment,
  type ScreeningSeverity,
  type SeverityLevel,
} from '@hig/shared/api';
import { DocumentAiStatus, REPORT_DOCUMENT_KINDS, ReportAiPanel } from '@hig/shared/docai';
import { useAppTranslation } from '../../../../i18n';
import { useDocuments } from '../../api/queries';
import { cn, formatDate } from '../../lib/shared';
import { Checkbox, Chip, Field, Input, Skeleton } from '../../ui/primitives';

const SEVERITY_OPTIONS: { value: SeverityLevel; dot: string }[] = [
  { value: 'none', dot: 'bg-slate-400' },
  { value: 'mild', dot: 'bg-yellow-400' },
  { value: 'moderate', dot: 'bg-orange-500' },
  { value: 'severe', dot: 'bg-red-500' },
];

/** Daily-impact rows; title/question come from screening.duration.impact.<key>.{title,question}. */
const SEVERITY_ROWS: { key: keyof ScreeningSeverity; icon: ReactNode }[] = [
  { key: 'work', icon: <Briefcase className="h-5 w-5" aria-hidden /> },
  { key: 'sleep', icon: <Bed className="h-5 w-5" aria-hidden /> },
  { key: 'mobility', icon: <Accessibility className="h-5 w-5" aria-hidden /> },
];

export function StepDuration({
  durationValue,
  durationUnit,
  severity,
  treatments,
  reportIds,
  onDurationValue,
  onDurationUnit,
  onSeverity,
  onTreatments,
  onReportIds,
}: {
  durationValue: string;
  durationUnit: DurationUnit;
  severity: ScreeningSeverity;
  treatments: PreviousTreatment[];
  reportIds: string[];
  onDurationValue: (v: string) => void;
  onDurationUnit: (u: DurationUnit) => void;
  onSeverity: (s: ScreeningSeverity) => void;
  onTreatments: (t: PreviousTreatment[]) => void;
  onReportIds: (ids: string[]) => void;
}) {
  const { t } = useAppTranslation();
  const allDocuments = useDocuments();
  const reportKinds: readonly string[] = REPORT_DOCUMENT_KINDS;
  const reports = { ...allDocuments, data: allDocuments.data?.filter((d) => reportKinds.includes(d.kind)) };
  const attached = new Set(reportIds);

  function toggleTreatment(treatment: PreviousTreatment) {
    onTreatments(treatments.includes(treatment) ? treatments.filter((x) => x !== treatment) : [...treatments, treatment]);
  }

  function toggleReport(id: string) {
    onReportIds(attached.has(id) ? reportIds.filter((x) => x !== id) : [...reportIds, id]);
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('screening.duration.unitLabel')}>
          {DURATION_UNITS.map((u) => (
            <Chip key={u} selected={durationUnit === u} onClick={() => onDurationUnit(u)}>
              {DURATION_UNIT_LABELS[u]}
            </Chip>
          ))}
        </div>
        <Field label={t(`screening.duration.numberOf.${durationUnit}`)} htmlFor="duration-value" className="mt-4 max-w-xs">
          <Input
            id="duration-value"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={durationValue}
            onChange={(e) => onDurationValue(e.target.value)}
            placeholder={t('screening.duration.valuePlaceholder')}
          />
        </Field>
      </section>

      <section>
        <h3 className="text-lg font-semibold">{t('screening.duration.severity')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('screening.duration.dailyImpact')}</p>
        <div className="mt-3 space-y-3">
          {SEVERITY_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {row.icon}
                </span>
                <div>
                  <p className="font-medium">{t(`screening.duration.impact.${row.key}.title`)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t(`screening.duration.impact.${row.key}.question`)}</p>
                </div>
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label={t(`screening.duration.impact.${row.key}.groupLabel`)}
              >
                {SEVERITY_OPTIONS.map((opt) => {
                  const active = severity[row.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onSeverity({ ...severity, [row.key]: opt.value })}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500',
                        active
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300',
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', opt.dot)} aria-hidden />
                      {SEVERITY_LEVEL_LABELS[opt.value]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold">{t('screening.duration.previousTreatments')}</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PREVIOUS_TREATMENTS.map((treatment) => (
            <div key={treatment} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <Checkbox
                label={PREVIOUS_TREATMENT_LABELS[treatment]}
                checked={treatments.includes(treatment)}
                onChange={() => toggleTreatment(treatment)}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {t('screening.duration.previousReports')}{' '}
              <span className="font-normal text-slate-500">{t('screening.duration.optionalParen')}</span>
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('screening.duration.reportsHelp')}</p>
          </div>
        </div>
        <ReportAiPanel
          className="mt-4"
          defaultKind="medical_report"
          showExisting={false}
          onUploaded={(docs) => onReportIds([...new Set([...reportIds, ...docs.map((d) => d.id)])])}
        />
        <div className="mt-3">
          {reports.isPending ? (
            <Skeleton className="h-14 w-full" />
          ) : reports.data && reports.data.length ? (
            <ul className="space-y-2">
              {reports.data.map((doc) => (
                <li
                  key={doc.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5',
                    attached.has(doc.id)
                      ? 'border-green-500 bg-green-50 dark:bg-green-500/10'
                      : 'border-slate-200 dark:border-slate-800',
                  )}
                >
                  <Checkbox
                    label={
                      <span className="inline-flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" aria-hidden />
                        {doc.file_name}
                      </span>
                    }
                    description={t('screening.duration.uploadedOn', { date: formatDate(doc.created_at) })}
                    checked={attached.has(doc.id)}
                    onChange={() => toggleReport(doc.id)}
                  />
                  <DocumentAiStatus document={doc} audience="patient" />
                </li>
              ))}
            </ul>
          ) : reportIds.length ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              {t('screening.duration.reportsAttached', { count: reportIds.length })}
              <button type="button" onClick={() => onReportIds([])} aria-label={t('screening.duration.detachAll')}>
                <X className="h-4 w-4" />
              </button>
            </p>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
              {t('screening.duration.noReports')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
