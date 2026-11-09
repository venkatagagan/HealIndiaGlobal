import { AlertOctagon, Sparkles } from 'lucide-react';
import {
  DURATION_UNIT_LABELS,
  LIKELIHOOD_LABELS,
  PREVIOUS_TREATMENT_LABELS,
  SEVERITY_LEVEL_LABELS,
  type ScreeningOut,
  bodyAreaLabels,
} from '@hig/shared/api';
import { Badge, Card, CardBody, CardHeader, DescriptionList, EmptyState, StatusBadge } from '../../components/ui';
import { formatDateTime, formatMoneyRange, humanList } from './screeningFormat';

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Patient-reported intake + AI triage result (not a diagnosis) shared with the hospital. */
export function ScreeningSummary({ screening }: { screening: ScreeningOut | null }) {
  if (!screening) {
    return (
      <Card>
        <CardHeader title="AI screening" />
        <EmptyState title="No screening attached" description="The patient enquired directly without an AI screening." />
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

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
            AI screening summary
          </span>
        }
        description={`Completed ${formatDateTime(screening.completed_at ?? screening.submitted_at)}${ai ? ` · ${ai.engine === 'claude' ? 'AI triage' : 'Rules-based triage'}` : ''}`}
        actions={urgency ? <StatusBadge status={urgency} label={`Urgency: ${urgency}`} /> : undefined}
      />
      <CardBody className="space-y-5">
        {redFlags.length > 0 && (
          <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Red flags reported</p>
              <p>{redFlags.join(', ')}</p>
            </div>
          </div>
        )}
        {ai?.summary && <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{ai.summary}</p>}

        <DescriptionList
          items={[
            { label: 'Specialty', value: screening.specialty?.name ?? ai?.suggested_specialties[0]?.name ?? '—' },
            { label: 'Body areas', value: bodyAreaLabels(screening.body_areas).join(', ') || '—' },
            { label: 'Pain intensity', value: screening.pain_intensity != null ? `${screening.pain_intensity} / 10` : '—' },
            {
              label: 'Duration',
              value:
                screening.duration_value != null && screening.duration_unit
                  ? `${screening.duration_value} ${DURATION_UNIT_LABELS[screening.duration_unit].toLowerCase()}`
                  : '—',
            },
            { label: 'Impact', value: severity.length ? severity.join(' · ') : '—' },
            {
              label: 'Previous treatment',
              value: humanList(screening.previous_treatments.map((t) => PREVIOUS_TREATMENT_LABELS[t] ?? t)),
            },
            {
              label: 'Budget',
              value:
                prefs.budget_min_minor != null || prefs.budget_max_minor != null
                  ? formatMoneyRange(prefs.budget_min_minor, prefs.budget_max_minor, prefs.budget_currency ?? 'USD')
                  : '—',
            },
            {
              label: 'Travel window',
              value:
                prefs.travel_window_start || prefs.travel_window_end
                  ? `${prefs.travel_window_start ?? '…'} → ${prefs.travel_window_end ?? '…'}`
                  : '—',
            },
            { label: 'Preferred languages', value: humanList(prefs.languages ?? []) },
            {
              label: 'Doctor preference',
              value: prefs.doctor_gender && prefs.doctor_gender !== 'no_preference' ? `${prefs.doctor_gender} doctor` : 'No preference',
            },
          ]}
        />

        {positiveSymptoms.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Symptoms</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {positiveSymptoms.map((s) => (
                <Badge key={s.name} tone={s.answer === 'yes' ? 'violet' : 'neutral'}>
                  {s.name}
                  {s.answer === 'maybe' ? ' (maybe)' : ''}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {ai && (
          <div className="grid gap-4 sm:grid-cols-2">
            <ListBlock
              title="Possible conditions"
              items={ai.possible_conditions.map(
                (c) => `${c.name} - ${LIKELIHOOD_LABELS[c.likelihood] ?? c.likelihood} likelihood${c.notes ? ` (${c.notes})` : ''}`,
              )}
            />
            <ListBlock title="Suggested procedures" items={ai.recommended_procedures.map((p) => `${p.name} - ${p.rationale}`)} />
            <ListBlock title="Recommended tests" items={ai.recommended_tests} />
            <ListBlock title="Patient's questions for the doctor" items={ai.questions_for_doctor} />
          </div>
        )}
        {screening.notes && (
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Patient notes</h4>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{screening.notes}</p>
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {ai?.disclaimer || 'AI triage is decision support only and is not a diagnosis. Clinical assessment is required.'}
        </p>
      </CardBody>
    </Card>
  );
}
