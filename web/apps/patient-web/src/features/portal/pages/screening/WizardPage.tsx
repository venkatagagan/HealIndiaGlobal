import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Save, Search } from 'lucide-react';
import { authApi, errorMessage, PREVIOUS_TREATMENTS, type PreviousTreatment, type ScreeningSeverity } from '@hig/shared/api';
import { VoiceIntakeButton, type ConfirmedIntake } from '@hig/shared/voice';
import { usePatientProfile, useScreening, useSubmitScreening, useUpdateScreening } from '../../api/queries';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { useDocumentTitle } from '../../lib/shared';
import { Alert, Button, Card, ErrorState, ProgressBar, Skeleton } from '../../ui/primitives';
import { BodyMap, PainSlider } from './BodyMap';
import { StepDuration } from './StepDuration';
import { StepPreferences } from './StepPreferences';
import { StepSymptoms } from './StepSymptoms';
import { draftFromScreening, STEP_TITLES, stepPayload, TOTAL_STEPS, validateStep, type WizardDraft } from './wizardModel';

/** Consent document version recorded with POST /auth/consents. */
export const AI_CONSENT_VERSION = '2026-10';

const STEP_SUBTITLES = [
  'Tap on the body to select the area. You can select more than one.',
  'Answer each card, or add your own symptoms.',
  'Duration, daily impact and what you have tried so far.',
  'Optional - helps us rank hospitals and doctors for you.',
];

/** Merge confirmed voice/typed answers into the local draft: fill empty answers, overwrite only what the patient chose. */
function mergeVoiceIntake(draft: WizardDraft, result: ConfirmedIntake): Partial<WizardDraft> {
  const { intake } = result;
  const chosen = new Set([...result.appliedFields, ...result.resolvedWithVoice]);
  const out: Partial<WizardDraft> = {};
  if (intake.body_areas.length && (chosen.has('body_areas') || draft.body_areas.length === 0)) out.body_areas = intake.body_areas;
  if (intake.pain_intensity != null && (chosen.has('pain_intensity') || draft.pain_intensity === 0)) {
    out.pain_intensity = Math.min(10, Math.max(0, Math.round(intake.pain_intensity)));
  }
  const symptoms = intake.symptoms.filter((x) => x.name.trim());
  if (symptoms.length && (chosen.has('symptoms') || draft.symptoms.length === 0)) out.symptoms = symptoms;
  if (intake.notes?.trim() && (chosen.has('notes') || !draft.notes.trim())) out.notes = intake.notes.trim();
  if (intake.duration_value != null && (chosen.has('duration_value') || !draft.duration_value)) {
    out.duration_value = String(intake.duration_value);
    if (intake.duration_unit) out.duration_unit = intake.duration_unit;
  }
  const severity = Object.fromEntries(
    Object.entries(intake.severity ?? {}).filter(([, v]) => v != null),
  ) as ScreeningSeverity;
  if (Object.keys(severity).length && (chosen.has('severity') || Object.keys(draft.severity).length === 0)) out.severity = severity;
  const treatments = intake.previous_treatments.filter((x): x is PreviousTreatment =>
    (PREVIOUS_TREATMENTS as readonly string[]).includes(x),
  );
  if (treatments.length && (chosen.has('previous_treatments') || draft.previous_treatments.length === 0)) {
    out.previous_treatments = treatments;
  }
  return out;
}

export function WizardPage() {
  const { id = '', step: stepParam = '1' } = useParams();
  const step = Math.min(TOTAL_STEPS, Math.max(1, Number.parseInt(stepParam, 10) || 1));
  useDocumentTitle(`Screening · step ${step}`);
  const navigate = useNavigate();
  const screening = useScreening(id);
  const me = useMe();
  const profile = usePatientProfile(!me.data?.is_guest);
  const update = useUpdateScreening(id);
  const submit = useSubmitScreening(id);
  // Local edits; until the first edit the form shows the server copy (with profile-based defaults).
  const [edited, setDraft] = useState<WizardDraft | null>(null);
  const [errorState, setErrorState] = useState<{ step: number; message: string } | null>(null);
  const error = errorState?.step === step ? errorState.message : null;
  const setError = (message: string) => setErrorState({ step, message });

  const ready = !!screening.data && (!!me.data?.is_guest || !profile.isPending);
  const initial = useMemo(
    () =>
      ready && screening.data
        ? draftFromScreening(screening.data, {
            currency: profile.data?.preferred_currency ?? 'USD',
            country: profile.data?.country_of_residence ?? me.data?.country_code ?? null,
          })
        : null,
    [ready, screening.data, profile.data, me.data],
  );
  const draft = edited ?? initial;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  if (screening.isError) {
    return <ErrorState error={screening.error} onRetry={() => void screening.refetch()} />;
  }
  if (screening.data && screening.data.status !== 'draft') {
    return (
      <Navigate
        to={screening.data.status === 'completed' ? paths.screeningResults(id) : paths.screeningProcessing(id)}
        replace
      />
    );
  }
  if (!draft || !screening.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const patch = (p: Partial<WizardDraft>) => setDraft((d) => ({ ...(d ?? draft), ...p }));
  const busy = update.isPending || submit.isPending;

  async function save(): Promise<boolean> {
    if (!draft) return false;
    try {
      await update.mutateAsync(stepPayload(step, draft));
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'Your answers could not be saved.'));
      return false;
    }
  }

  async function goNext() {
    if (!draft) return;
    const problem = validateStep(step, draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (!(await save())) return;
    navigate(paths.screeningStep(id, step + 1));
  }

  async function goBack() {
    if (step === 1) {
      navigate(paths.newScreening());
      return;
    }
    await save();
    navigate(paths.screeningStep(id, step - 1));
  }

  async function saveAndExit() {
    if (await save()) {
      toast.success('Progress saved. You can continue from your dashboard.');
      navigate(paths.dashboard);
    }
  }

  async function finish(useDefaults: boolean) {
    if (!draft) return;
    if (!useDefaults) {
      const problem = validateStep(4, draft);
      if (problem) {
        setError(problem);
        return;
      }
      if (!(await save())) return;
    }
    const consent = draft.use_ai && draft.consent_ai;
    try {
      if (consent) {
        try {
          await authApi.giveConsent({ kind: 'ai_processing', version: AI_CONSENT_VERSION, granted: true });
        } catch {
          /* consent is also carried by consent_ai on submit; the record is retried next time */
        }
      }
      await submit.mutateAsync(consent);
      navigate(paths.screeningProcessing(id), { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, 'We could not start the analysis. Please try again.'));
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Step {step} of {TOTAL_STEPS}
            {step === TOTAL_STEPS ? ' · Optional' : ''}
            {screening.data.specialty ? ` · ${screening.data.specialty.name}` : ''}
          </p>
          <Button variant="ghost" size="sm" icon={<Save className="h-4 w-4" aria-hidden />} onClick={() => void saveAndExit()} disabled={busy}>
            Save &amp; exit
          </Button>
        </div>
        <ProgressBar value={(step / TOTAL_STEPS) * 100} className="mt-2" tone={step === 1 ? 'red' : 'green'} />
        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{STEP_TITLES[step - 1]}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{STEP_SUBTITLES[step - 1]}</p>
      </div>

      {step <= 2 ? (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-violet-500/30 dark:bg-violet-500/10">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <span className="font-semibold">Prefer to talk?</span> Describe your problem by voice in your own language -
            we fill in the answers and you check them before anything is saved.
          </p>
          <VoiceIntakeButton
            screeningId={id}
            className="shrink-0"
            onConfirmed={(result) => {
              patch(mergeVoiceIntake(draft, result));
              if (result.appliedFields.includes('specialty_slug')) void screening.refetch();
            }}
          />
        </div>
      ) : null}

      <Card className="p-5 sm:p-6">
        {step === 1 ? (
          <div className="space-y-6">
            <BodyMap value={draft.body_areas} onChange={(areas) => patch({ body_areas: areas })} />
            <PainSlider value={draft.pain_intensity} onChange={(v) => patch({ pain_intensity: v })} />
          </div>
        ) : step === 2 ? (
          <StepSymptoms
            specialtySlug={screening.data.specialty?.slug ?? null}
            bodyAreas={draft.body_areas}
            symptoms={draft.symptoms}
            notes={draft.notes}
            onSymptoms={(symptoms) => patch({ symptoms })}
            onNotes={(notes) => patch({ notes })}
          />
        ) : step === 3 ? (
          <StepDuration
            durationValue={draft.duration_value}
            durationUnit={draft.duration_unit}
            severity={draft.severity}
            treatments={draft.previous_treatments}
            reportIds={draft.report_document_ids}
            onDurationValue={(v) => patch({ duration_value: v })}
            onDurationUnit={(u) => patch({ duration_unit: u })}
            onSeverity={(s) => patch({ severity: s })}
            onTreatments={(t) => patch({ previous_treatments: t })}
            onReportIds={(ids) => patch({ report_document_ids: ids })}
          />
        ) : (
          <StepPreferences draft={draft} onChange={patch} />
        )}

        {error ? (
          <Alert tone="red" className="mt-6">
            {error}
          </Alert>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <Button variant="secondary" onClick={() => void goBack()} disabled={busy} icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
            Previous
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={() => void goNext()} loading={update.isPending} className="sm:min-w-40">
              Next <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <Button variant="ghost" onClick={() => void finish(true)} disabled={busy}>
                Skip &amp; use defaults
              </Button>
              <Button
                size="lg"
                onClick={() => void finish(false)}
                loading={busy}
                icon={<Search className="h-4 w-4" aria-hidden />}
              >
                Find my doctors
              </Button>
            </div>
          )}
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        This questionnaire does not provide a diagnosis. If you have severe chest pain, difficulty breathing or signs of a
        stroke, call your local emergency number now.
      </p>
    </div>
  );
}
