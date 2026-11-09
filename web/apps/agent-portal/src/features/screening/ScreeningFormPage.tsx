import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Sparkles, X } from 'lucide-react';
import {
  DOCTOR_GENDER_PREFS,
  DOCTOR_GENDER_PREF_LABELS,
  DOCUMENT_KIND_LABELS,
  DURATION_UNITS,
  DURATION_UNIT_LABELS,
  PREVIOUS_TREATMENTS,
  PREVIOUS_TREATMENT_LABELS,
  SEVERITY_LEVELS,
  SEVERITY_LEVEL_LABELS,
  agentPortalApi,
  catalogApi,
  documentsApi,
  errorMessage,
  screeningsApi,
  type DoctorGenderPref,
  type DocumentKind,
  type DurationUnit,
  type PreviousTreatment,
  type ScreeningOut,
  type ScreeningSeverity,
  type ScreeningUpdateIn,
  type SeverityLevel,
  type SymptomAnswer,
  normalizeBodyAreas,
} from '@hig/shared/api';
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  Chip,
  ErrorState,
  FormField,
  Input,
  LoadingBlock,
  PageHeader,
  Segmented,
  Select,
  Textarea,
} from '../../components/ui';
import { BODY_AREA_LABELS, BODY_AREAS, LANGUAGE_OPTIONS, SYMPTOM_REGION } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { qk, useSpecialties } from '../../lib/queries';
import { SUPPORTED_CURRENCIES, currencyExponent, formatDate, toMinor, useDocumentTitle } from '../../lib/shared';
import { DocumentAiStatus, DocumentCapture } from '@hig/shared/docai';
import { VoiceIntakeButton, type ConfirmedIntake } from '@hig/shared/voice';

const REPORT_KINDS = ['medical_report', 'lab_result', 'imaging', 'prescription'] as const satisfies readonly DocumentKind[];
const SEVERITY_KEYS = ['work', 'sleep', 'mobility'] as const;
const PAIN_FACES = ['😀', '🙂', '🙂', '😐', '😐', '😕', '😟', '😣', '😖', '😫', '😭'];

interface FormState {
  specialty_slug: string;
  body_areas: string[];
  pain_intensity: number;
  symptoms: Record<string, SymptomAnswer>;
  duration_value: string;
  duration_unit: DurationUnit;
  severity: ScreeningSeverity;
  previous_treatments: PreviousTreatment[];
  notes: string;
  languages: string[];
  doctor_gender: DoctorGenderPref;
  budget_min: string;
  budget_max: string;
  budget_currency: string;
  travel_window_start: string;
  travel_window_end: string;
  use_ai: boolean;
  report_document_ids: string[];
}

const EMPTY: FormState = {
  specialty_slug: '',
  body_areas: [],
  pain_intensity: 0,
  symptoms: {},
  duration_value: '',
  duration_unit: 'weeks',
  severity: {},
  previous_treatments: [],
  notes: '',
  languages: ['English'],
  doctor_gender: 'no_preference',
  budget_min: '',
  budget_max: '',
  budget_currency: 'USD',
  travel_window_start: '',
  travel_window_end: '',
  use_ai: true,
  report_document_ids: [],
};

function majorFromMinor(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '';
  return String(minor / 10 ** currencyExponent(currency));
}

function fromScreening(s: ScreeningOut): FormState {
  const ccy = s.preferences.budget_currency ?? 'USD';
  return {
    specialty_slug: s.specialty?.slug ?? '',
    body_areas: normalizeBodyAreas(s.body_areas),
    pain_intensity: s.pain_intensity ?? 0,
    symptoms: Object.fromEntries(s.symptoms.map((x) => [x.name, x.answer])),
    duration_value: s.duration_value !== null ? String(s.duration_value) : '',
    duration_unit: s.duration_unit ?? 'weeks',
    severity: s.severity ?? {},
    previous_treatments: s.previous_treatments,
    notes: s.notes ?? '',
    languages: s.preferences.languages ?? ['English'],
    doctor_gender: s.preferences.doctor_gender ?? 'no_preference',
    budget_min: majorFromMinor(s.preferences.budget_min_minor, ccy),
    budget_max: majorFromMinor(s.preferences.budget_max_minor, ccy),
    budget_currency: ccy,
    travel_window_start: s.preferences.travel_window_start ?? '',
    travel_window_end: s.preferences.travel_window_end ?? '',
    use_ai: s.preferences.use_ai ?? true,
    report_document_ids: s.report_document_ids,
  };
}

/** Merge confirmed voice/typed answers: fill empty fields; overwrite only fields the user chose to replace. */
function mergeVoiceIntake(form: FormState, result: ConfirmedIntake): FormState {
  const { intake } = result;
  const chosen = new Set([...result.appliedFields, ...result.resolvedWithVoice]);
  const next = { ...form };
  if (intake.specialty_slug && (chosen.has('specialty_slug') || !form.specialty_slug)) next.specialty_slug = intake.specialty_slug;
  if (intake.body_areas.length && (chosen.has('body_areas') || !form.body_areas.length)) next.body_areas = normalizeBodyAreas(intake.body_areas);
  if (intake.pain_intensity != null && (chosen.has('pain_intensity') || form.pain_intensity === 0)) {
    next.pain_intensity = Math.min(10, Math.max(0, Math.round(intake.pain_intensity)));
  }
  const symptoms = intake.symptoms.filter((x) => x.name.trim());
  if (symptoms.length && (chosen.has('symptoms') || !Object.keys(form.symptoms).length)) {
    next.symptoms = Object.fromEntries(symptoms.map((x) => [x.name.trim(), x.answer]));
  }
  if (intake.duration_value != null && (chosen.has('duration_value') || !form.duration_value)) {
    next.duration_value = String(Math.round(intake.duration_value));
    if (intake.duration_unit) next.duration_unit = intake.duration_unit;
  }
  const severity = Object.fromEntries(Object.entries(intake.severity ?? {}).filter(([, v]) => v != null)) as ScreeningSeverity;
  if (Object.keys(severity).length && (chosen.has('severity') || !Object.keys(form.severity).length)) next.severity = severity;
  const treatments = intake.previous_treatments.filter((x): x is PreviousTreatment => (PREVIOUS_TREATMENTS as readonly string[]).includes(x));
  if (treatments.length && (chosen.has('previous_treatments') || !form.previous_treatments.length)) next.previous_treatments = treatments;
  if (intake.notes?.trim() && (chosen.has('notes') || !form.notes.trim())) next.notes = intake.notes.trim();
  return next;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ScreeningFormPage() {
  const params = useParams();
  const screeningId = params.screeningId;
  const existing = useQuery({
    queryKey: qk.screening(screeningId ?? ''),
    queryFn: () => screeningsApi.get(screeningId ?? ''),
    enabled: Boolean(screeningId),
  });
  const patientId = params.patientId ?? existing.data?.patient_id ?? '';
  const patient = useQuery({
    queryKey: qk.patient(patientId),
    queryFn: () => agentPortalApi.getPatient(patientId),
    enabled: Boolean(patientId),
  });

  useDocumentTitle('New screening');

  if (screeningId && existing.isPending) return <LoadingBlock />;
  if (existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  if (existing.data && existing.data.status !== 'draft') {
    return (
      <ErrorState
        title="This screening has already been submitted"
        error={new Error('Submitted screenings cannot be edited. Open it to see the results or start a new one.')}
      />
    );
  }
  if (!patientId) return <ErrorState error={new Error('No patient selected for this screening.')} />;
  if (patient.isPending) return <LoadingBlock />;
  if (patient.isError) return <ErrorState error={patient.error} onRetry={() => void patient.refetch()} />;

  return (
    <ScreeningForm
      key={existing.data?.id ?? 'new'}
      patientId={patientId}
      patientLabel={patientName(patient.data)}
      homeCountry={patient.data.country_of_residence ?? patient.data.nationality}
      defaultCurrency={patient.data.preferred_currency || 'USD'}
      existing={existing.data ?? null}
    />
  );
}

function ScreeningForm({
  patientId,
  patientLabel,
  homeCountry,
  defaultCurrency,
  existing,
}: {
  patientId: string;
  patientLabel: string;
  homeCountry: string | null;
  defaultCurrency: string;
  existing: ScreeningOut | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() =>
    existing ? fromScreening(existing) : { ...EMPTY, budget_currency: defaultCurrency },
  );
  const [attested, setAttested] = useState(false);
  const [customSymptom, setCustomSymptom] = useState('');
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const specialties = useSpecialties();
  const symptomLibrary = useQuery({
    queryKey: qk.symptoms(form.specialty_slug),
    queryFn: () => catalogApi.symptoms(form.specialty_slug ? { specialty: form.specialty_slug } : undefined),
    staleTime: 10 * 60_000,
  });
  const reports = useQuery({
    queryKey: qk.documents({ patient_id: patientId }),
    queryFn: () => documentsApi.list({ patient_id: patientId }),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (Object.keys(e).length ? {} : e));
  };

  // Symptom list: library suggestions (filtered by selected body areas when they match) + answered/custom ones
  const symptomNames = useMemo(() => {
    const lib = symptomLibrary.data ?? [];
    const regions = new Set(form.body_areas.flatMap((a) => [a, ...(SYMPTOM_REGION[a] ?? [])]));
    const relevant = regions.size
      ? lib.filter((s) => s.body_areas.length === 0 || s.body_areas.some((a) => a === 'general' || regions.has(a)))
      : lib;
    const names = new Set((relevant.length ? relevant : lib).slice(0, 18).map((s) => s.name));
    for (const name of Object.keys(form.symptoms)) names.add(name);
    return [...names];
  }, [symptomLibrary.data, form.body_areas, form.symptoms]);

  const validate = (): Record<string, string> | null => {
    const e: Record<string, string> = {};
    const answered = Object.values(form.symptoms).some((a) => a !== 'no');
    if (!form.specialty_slug && form.body_areas.length === 0 && !answered && form.notes.trim().length < 10) {
      e.general = 'Choose a specialty, a body area or a symptom, or describe the condition in the notes.';
    }
    if (form.duration_value && (!/^\d+$/.test(form.duration_value) || Number(form.duration_value) > 1000)) {
      e.duration_value = 'Enter a whole number';
    }
    const min = form.budget_min ? toMinor(form.budget_min, form.budget_currency) : null;
    const max = form.budget_max ? toMinor(form.budget_max, form.budget_currency) : null;
    if (form.budget_min && min === null) e.budget = 'Enter a valid minimum budget';
    if (form.budget_max && max === null) e.budget = 'Enter a valid maximum budget';
    if (min !== null && max !== null && min > max) e.budget = 'Minimum budget is higher than the maximum';
    if (form.travel_window_start && form.travel_window_end && form.travel_window_start > form.travel_window_end) {
      e.travel = 'Travel window end must be after the start';
    }
    if (form.notes.length > 4000) e.notes = 'Keep notes under 4000 characters';
    return Object.keys(e).length ? e : null;
  };

  const payload = (): ScreeningUpdateIn => ({
    specialty_slug: form.specialty_slug || null,
    body_areas: form.body_areas,
    pain_intensity: form.pain_intensity,
    symptoms: Object.entries(form.symptoms).map(([name, answer]) => ({ name, answer })),
    duration_value: form.duration_value ? Number(form.duration_value) : null,
    duration_unit: form.duration_value ? form.duration_unit : null,
    severity: form.severity,
    previous_treatments: form.previous_treatments,
    notes: form.notes.trim() || null,
    report_document_ids: form.report_document_ids,
    home_country: homeCountry,
    preferences: {
      languages: form.languages,
      doctor_gender: form.doctor_gender,
      budget_min_minor: form.budget_min ? toMinor(form.budget_min, form.budget_currency) : null,
      budget_max_minor: form.budget_max ? toMinor(form.budget_max, form.budget_currency) : null,
      budget_currency: form.budget_currency,
      travel_window_start: form.travel_window_start || null,
      travel_window_end: form.travel_window_end || null,
      use_ai: form.use_ai,
    },
  });

  const save = async (mode: 'draft' | 'submit') => {
    const problems = validate();
    if (problems) {
      setErrors(problems);
      toast.error(Object.values(problems)[0] ?? 'Please check the form');
      return;
    }
    if (mode === 'submit' && !attested) {
      setErrors({ consent: 'Confirm the patient’s consent before submitting' });
      return;
    }
    setSaving(mode);
    try {
      const draft =
        existing ??
        (await screeningsApi.create({ patient_id: patientId, ...(form.specialty_slug ? { specialty_slug: form.specialty_slug } : {}) }));
      await screeningsApi.update(draft.id, payload());
      void queryClient.invalidateQueries({ queryKey: ['screenings'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-patients'] });
      if (mode === 'draft') {
        toast.success('Screening saved as draft');
        navigate(`/patients/${patientId}?tab=screenings`);
        return;
      }
      await screeningsApi.submit(draft.id, { consent_ai: attested && form.use_ai });
      navigate(`/screenings/${draft.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const reportDocs = (reports.data ?? []).filter((d) => (REPORT_KINDS as readonly string[]).includes(d.kind));

  return (
    <div>
      <PageHeader
        back={
          <Link to={`/patients/${patientId}?tab=screenings`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {patientLabel}
          </Link>
        }
        title={existing ? 'Continue screening' : 'New screening'}
        description={`Symptom screening for ${patientLabel}. Our AI triage suggests specialties and matches accredited hospitals and doctors — it is not a diagnosis.`}
      />

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg">
          <span className="font-semibold">Let the patient describe it by voice</span> in their own language (or type it) -
          the answers are pre-filled below for you to check before saving.
        </p>
        <VoiceIntakeButton
          patientId={patientId}
          screeningId={existing?.id}
          currentAnswers={payload()}
          className="shrink-0"
          onConfirmed={(result) => setForm((f) => mergeVoiceIntake(f, result))}
        />
      </div>

      <form
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save('submit');
        }}
      >
        {errors.general && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {errors.general}
          </div>
        )}

        <Section title="1. Condition" description="What brings the patient to India?">
          <FormField label="Specialty" htmlFor="sc-specialty" hint="Leave empty if unsure — the AI will suggest one.">
            <Select id="sc-specialty" value={form.specialty_slug} onChange={(e) => set('specialty_slug', e.target.value)}>
              <option value="">Not sure / let AI suggest</option>
              {(specialties.data ?? []).map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Where is the problem?</legend>
            <div className="flex flex-wrap gap-2">
              {BODY_AREAS.map((area) => (
                <Chip key={area} selected={form.body_areas.includes(area)} onClick={() => set('body_areas', toggle(form.body_areas, area))}>
                  {BODY_AREA_LABELS[area]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="sc-pain" className="mb-2 flex items-center justify-between text-sm font-medium">
              <span>Pain intensity</span>
              <span className="text-lg" aria-hidden>
                {PAIN_FACES[form.pain_intensity]} <span className="text-sm font-semibold tabular-nums">{form.pain_intensity}/10</span>
              </span>
            </label>
            <input
              id="sc-pain"
              type="range"
              min={0}
              max={10}
              step={1}
              value={form.pain_intensity}
              onChange={(e) => set('pain_intensity', Number(e.target.value))}
              className="w-full"
              aria-valuetext={`${form.pain_intensity} out of 10`}
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span>No pain</span>
              <span>Worst imaginable</span>
            </div>
          </div>
        </Section>

        <Section title="2. Symptoms" description="Does the patient experience these? Answer yes, maybe or no.">
          {symptomLibrary.isPending ? (
            <LoadingBlock label="Loading symptoms…" className="py-4" />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {symptomNames.length === 0 && <li className="px-4 py-3 text-sm text-muted">Add the patient’s symptoms below.</li>}
              {symptomNames.map((name) => (
                <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm">{name}</span>
                  <div className="flex items-center gap-1">
                    <Segmented<SymptomAnswer>
                      size="sm"
                      ariaLabel={name}
                      value={form.symptoms[name] ?? null}
                      onChange={(answer) => set('symptoms', { ...form.symptoms, [name]: answer })}
                      options={[
                        { value: 'yes', label: 'Yes' },
                        { value: 'maybe', label: 'Maybe' },
                        { value: 'no', label: 'No' },
                      ]}
                    />
                    {form.symptoms[name] && (
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-fg"
                        aria-label={`Clear answer for ${name}`}
                        onClick={() => {
                          const next = { ...form.symptoms };
                          delete next[name];
                          set('symptoms', next);
                        }}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              aria-label="Add another symptom"
              placeholder="Add another symptom (e.g. swelling after walking)"
              value={customSymptom}
              maxLength={120}
              onChange={(e) => setCustomSymptom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = customSymptom.trim();
                  if (v) {
                    set('symptoms', { ...form.symptoms, [v]: 'yes' });
                    setCustomSymptom('');
                  }
                }
              }}
            />
            <Button
              variant="outline"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              disabled={!customSymptom.trim()}
              onClick={() => {
                const v = customSymptom.trim();
                set('symptoms', { ...form.symptoms, [v]: 'yes' });
                setCustomSymptom('');
              }}
            >
              Add
            </Button>
          </div>
        </Section>

        <Section title="3. History & severity">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="How long has this been going on?" htmlFor="sc-duration" error={errors.duration_value}>
              <div className="flex gap-2">
                <Input
                  id="sc-duration"
                  type="number"
                  min={0}
                  max={1000}
                  inputMode="numeric"
                  value={form.duration_value}
                  onChange={(e) => set('duration_value', e.target.value)}
                  className="w-28"
                />
                <Select aria-label="Duration unit" value={form.duration_unit} onChange={(e) => set('duration_unit', e.target.value as DurationUnit)}>
                  {DURATION_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {DURATION_UNIT_LABELS[u]}
                    </option>
                  ))}
                </Select>
              </div>
            </FormField>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Impact on daily life</legend>
            {SEVERITY_KEYS.map((key) => (
              <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm capitalize">{key}</span>
                <Segmented<SeverityLevel>
                  size="sm"
                  ariaLabel={`Impact on ${key}`}
                  value={form.severity[key] ?? null}
                  onChange={(level) => set('severity', { ...form.severity, [key]: level })}
                  options={SEVERITY_LEVELS.map((l) => ({ value: l, label: SEVERITY_LEVEL_LABELS[l] }))}
                />
              </div>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Previous treatments</legend>
            <div className="flex flex-wrap gap-2">
              {PREVIOUS_TREATMENTS.map((t) => (
                <Chip
                  key={t}
                  selected={form.previous_treatments.includes(t)}
                  onClick={() => set('previous_treatments', toggle(form.previous_treatments, t))}
                >
                  {PREVIOUS_TREATMENT_LABELS[t]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div className="space-y-3">
            <p className="text-sm font-medium">Medical reports</p>
            <DocumentCapture
              patientId={patientId}
              defaultKind="medical_report"
              onUploaded={(docs) => set('report_document_ids', [...new Set([...form.report_document_ids, ...docs.map((d) => d.id)])])}
              onAnalysisCreated={() => toast.success('The AI is reading the report - review and confirm it from the report list below.')}
            />
            {reportDocs.length > 0 && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Attach reports to this screening (up to 3 are analysed by AI when consent is given):</p>
                {reportDocs.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Checkbox
                      checked={form.report_document_ids.includes(d.id)}
                      onChange={() => set('report_document_ids', toggle(form.report_document_ids, d.id))}
                      label={d.file_name}
                      description={`${DOCUMENT_KIND_LABELS[d.kind]} · ${formatDate(d.created_at)}`}
                    />
                    <DocumentAiStatus document={d} audience="clinical" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <FormField label="Notes for the medical team" htmlFor="sc-notes" error={errors.notes}>
            <Textarea
              id="sc-notes"
              rows={4}
              maxLength={4000}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Diagnosis already received, current medication, what the patient is hoping for…"
            />
          </FormField>
        </Section>

        <Section title="4. Preferences">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Languages the patient speaks</legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => (
                <Chip key={lang} selected={form.languages.includes(lang)} onClick={() => set('languages', toggle(form.languages, lang))}>
                  {lang}
                </Chip>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="mb-2 text-sm font-medium">Doctor gender</p>
            <Segmented<DoctorGenderPref>
              ariaLabel="Doctor gender preference"
              value={form.doctor_gender}
              onChange={(v) => set('doctor_gender', v)}
              options={DOCTOR_GENDER_PREFS.map((g) => ({ value: g, label: DOCTOR_GENDER_PREF_LABELS[g] }))}
            />
          </div>
          <FormField label="Budget range" error={errors.budget} hint="Total treatment budget, optional">
            <div className="flex flex-wrap gap-2">
              <Select aria-label="Budget currency" className="w-24" value={form.budget_currency} onChange={(e) => set('budget_currency', e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input aria-label="Minimum budget" placeholder="Min" inputMode="decimal" className="w-36" value={form.budget_min} onChange={(e) => set('budget_min', e.target.value)} />
              <Input aria-label="Maximum budget" placeholder="Max" inputMode="decimal" className="w-36" value={form.budget_max} onChange={(e) => set('budget_max', e.target.value)} />
            </div>
          </FormField>
          <FormField label="Travel window" error={errors.travel}>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                aria-label="Earliest travel date"
                className="w-44"
                min={new Date().toISOString().slice(0, 10)}
                value={form.travel_window_start}
                onChange={(e) => set('travel_window_start', e.target.value)}
              />
              <span className="text-muted">to</span>
              <Input
                type="date"
                aria-label="Latest travel date"
                className="w-44"
                min={form.travel_window_start || new Date().toISOString().slice(0, 10)}
                value={form.travel_window_end}
                onChange={(e) => set('travel_window_end', e.target.value)}
              />
            </div>
          </FormField>
          <Checkbox
            checked={form.use_ai}
            onChange={(e) => set('use_ai', e.target.checked)}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Use AI analysis
              </span>
            }
            description="When off, a rules-based matcher is used and no information is sent to the AI provider."
          />
        </Section>

        <Card className="p-5">
          <Checkbox
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            label="I confirm the patient has consented"
            description="The patient has agreed to this information being processed for AI screening and shared with the matched hospitals for quotes. The screening is decision support, not a medical diagnosis."
          />
          {errors.consent && (
            <p className="mt-2 text-xs text-danger" role="alert">
              {errors.consent}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" loading={saving === 'draft'} disabled={saving !== null} onClick={() => void save('draft')}>
              Save draft
            </Button>
            <Button type="submit" loading={saving === 'submit'} disabled={saving !== null} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
              Find matching hospitals
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section">
      <CardHeader title={title} description={description} />
      <div className="space-y-5 p-5">{children}</div>
    </Card>
  );
}
