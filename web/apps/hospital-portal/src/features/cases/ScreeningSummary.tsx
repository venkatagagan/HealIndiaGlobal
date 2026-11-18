import { AlertOctagon, Sparkles } from 'lucide-react';
import {
  DURATION_UNIT_LABELS,
  LIKELIHOOD_LABELS,
  PREVIOUS_TREATMENT_LABELS,
  SEVERITY_LEVEL_LABELS,
  URGENCY_LABELS,
  type ScreeningOut,
  bodyAreaLabels,
} from '@hig/shared/api';
import { Badge, Card, CardBody, CardHeader, DescriptionList, EmptyState, StatusBadge } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDateTime, formatMoneyRange, humanList } from './screeningFormat';

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-slate-700 dark:text-slate-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Patient-reported intake + AI triage result (not a diagnosis) shared with the hospital. */
export function ScreeningSummary({ screening }: { screening: ScreeningOut | null }) {
  const { t } = useAppTranslation();
  if (!screening) {
    return (
      <Card>
        <CardHeader title={t('cases.screening.emptyHeader')} />
        <EmptyState title={t('cases.screening.emptyTitle')} description={t('cases.screening.emptyDescription')} />
      </Card>
    );
  }
  const ai = screening.ai_result;
  const urgency = screening.urgency ?? ai?.urgency ?? null;
  const redFlags = screening.red_flags.length ? screening.red_flags : (ai?.red_flags ?? []);
  const positiveSymptoms = screening.symptoms.filter((s) => s.answer !== 'no');
  const severity = Object.entries(screening.severity ?? {})
    .filter(([, v]) => v && v !== 'none')
    .map(([k, v]) => `${k}: ${SEVERITY_LEVEL_LABELS[v as keyof typeof SEVERITY_LEVEL_LABELS] ?? v}`);
  const prefs = screening.preferences ?? {};
  const completed = formatDateTime(screening.completed_at ?? screening.submitted_at);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
            {t('cases.screening.title')}
          </span>
        }
        description={
          ai
            ? t('cases.screening.completedWithEngine', {
                date: completed,
                engine: ai.engine === 'claude' ? t('cases.screening.engineAi') : t('cases.screening.engineRules'),
              })
            : t('cases.screening.completed', { date: completed })
        }
        actions={
          urgency ? (
            <StatusBadge
              status={urgency}
              label={t('cases.screening.urgencyBadge', { urgency: URGENCY_LABELS[urgency as keyof typeof URGENCY_LABELS] ?? urgency })}
            />
          ) : undefined
        }
      />
      <CardBody className="space-y-5">
        {redFlags.length > 0 && (
          <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t('cases.screening.redFlags')}</p>
              <p>{redFlags.join(', ')}</p>
            </div>
          </div>
        )}
        {ai?.summary && <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{ai.summary}</p>}

        <DescriptionList
          items={[
            { label: t('common.specialty'), value: screening.specialty?.name ?? ai?.suggested_specialties[0]?.name ?? '—' },
            { label: t('cases.screening.bodyAreas'), value: bodyAreaLabels(screening.body_areas).join(', ') || '—' },
            {
              label: t('cases.screening.painIntensity'),
              value: screening.pain_intensity != null ? t('cases.screening.painValue', { value: screening.pain_intensity }) : '—',
            },
            {
              label: t('common.duration'),
              value:
                screening.duration_value != null && screening.duration_unit
                  ? `${screening.duration_value} ${DURATION_UNIT_LABELS[screening.duration_unit].toLowerCase()}`
                  : '—',
            },
            { label: t('cases.screening.impact'), value: severity.length ? severity.join(' · ') : '—' },
            {
              label: t('cases.screening.previousTreatment'),
              value: humanList(screening.previous_treatments.map((pt) => PREVIOUS_TREATMENT_LABELS[pt] ?? pt)),
            },
            {
              label: t('cases.screening.budget'),
              value:
                prefs.budget_min_minor != null || prefs.budget_max_minor != null
                  ? formatMoneyRange(prefs.budget_min_minor, prefs.budget_max_minor, prefs.budget_currency ?? 'USD')
                  : '—',
            },
            {
              label: t('cases.screening.travelWindow'),
              value:
                prefs.travel_window_start || prefs.travel_window_end
                  ? t('cases.screening.travelRange', { from: prefs.travel_window_start ?? '…', to: prefs.travel_window_end ?? '…' })
                  : '—',
            },
            { label: t('cases.screening.preferredLanguages'), value: humanList(prefs.languages ?? []) },
            {
              label: t('cases.screening.doctorPreference'),
              value:
                prefs.doctor_gender === 'female'
                  ? t('cases.screening.doctorFemale')
                  : prefs.doctor_gender === 'male'
                    ? t('cases.screening.doctorMale')
                    : t('cases.screening.noPreference'),
            },
          ]}
        />

        {positiveSymptoms.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {t('cases.screening.symptoms')}
            </h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {positiveSymptoms.map((s) => (
                <Badge key={s.name} tone={s.answer === 'yes' ? 'violet' : 'neutral'}>
                  {s.answer === 'maybe' ? t('cases.screening.symptomMaybe', { name: s.name }) : s.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {ai && (
          <div className="grid gap-4 sm:grid-cols-2">
            <ListBlock
              title={t('cases.screening.possibleConditions')}
              items={ai.possible_conditions.map((c) =>
                c.notes
                  ? t('cases.screening.conditionWithNotes', {
                      name: c.name,
                      likelihood: LIKELIHOOD_LABELS[c.likelihood] ?? c.likelihood,
                      notes: c.notes,
                    })
                  : t('cases.screening.condition', { name: c.name, likelihood: LIKELIHOOD_LABELS[c.likelihood] ?? c.likelihood }),
              )}
            />
            <ListBlock
              title={t('cases.screening.suggestedProcedures')}
              items={ai.recommended_procedures.map((p) => `${p.name} - ${p.rationale}`)}
            />
            <ListBlock title={t('cases.screening.recommendedTests')} items={ai.recommended_tests} />
            <ListBlock title={t('cases.screening.questionsForDoctor')} items={ai.questions_for_doctor} />
          </div>
        )}
        {screening.notes && (
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {t('cases.screening.patientNotes')}
            </h4>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{screening.notes}</p>
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{ai?.disclaimer || t('cases.screening.disclaimer')}</p>
      </CardBody>
    </Card>
  );
}
