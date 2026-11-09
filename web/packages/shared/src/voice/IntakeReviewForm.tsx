import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DURATION_UNITS, PREVIOUS_TREATMENTS, SEVERITY_LEVELS, SYMPTOM_ANSWERS } from '../api/enums';
import type { DurationUnit, SeverityLevel, SymptomAnswer } from '../api/types';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { useVoiceText } from './i18n';
import { BODY_AREAS, type IntakeSeverity, type IntakeSuggestion } from './types';

const field =
  'w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export interface IntakeReviewFormProps {
  value: IntakeSuggestion;
  onChange: (value: IntakeSuggestion) => void;
  /** catalog specialties for the select (slug + name) */
  specialties?: { slug: string; name: string }[];
  disabled?: boolean;
  className?: string;
}

export function emptyIntake(): IntakeSuggestion {
  return {
    transcript_en: null,
    language_detected: null,
    specialty_slug: null,
    body_areas: [],
    pain_intensity: null,
    symptoms: [],
    duration_value: null,
    duration_unit: null,
    severity: null,
    previous_treatments: [],
    notes: null,
    red_flags: [],
    urgency_hint: null,
  };
}

/** Fill missing keys / wrong types so the form can edit any payload safely. */
export function normalizeIntake(raw: Partial<IntakeSuggestion> | null | undefined): IntakeSuggestion {
  const base = emptyIntake();
  if (!raw) return base;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...base,
    ...raw,
    body_areas: arr<string>(raw.body_areas),
    symptoms: arr<IntakeSuggestion['symptoms'][number]>(raw.symptoms).filter((s) => s && typeof s.name === 'string'),
    previous_treatments: arr<string>(raw.previous_treatments),
    red_flags: arr<string>(raw.red_flags),
    pain_intensity: typeof raw.pain_intensity === 'number' ? raw.pain_intensity : null,
    duration_value: typeof raw.duration_value === 'number' ? raw.duration_value : null,
    severity: raw.severity && typeof raw.severity === 'object' ? raw.severity : null,
  };
}

/** Editable review form of an IntakeSuggestion (specialty, body areas, pain, symptoms, duration, severity, treatments, notes). */
export function IntakeReviewForm({ value, onChange, specialties = [], disabled, className }: IntakeReviewFormProps) {
  const { t } = useVoiceText();
  const set = <K extends keyof IntakeSuggestion>(key: K, v: IntakeSuggestion[K]) => onChange({ ...value, [key]: v });
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const setSeverity = (key: keyof IntakeSeverity, level: SeverityLevel | '') =>
    set('severity', { ...(value.severity ?? {}), [key]: level || null });
  const knownSpecialty = !value.specialty_slug || specialties.some((s) => s.slug === value.specialty_slug);

  return (
    <div className={cn('space-y-5', className)}>
      <Block label={t('specialty')}>
        <select
          aria-label={t('specialty')}
          className={cn(field, 'h-10 sm:w-80')}
          value={value.specialty_slug ?? ''}
          onChange={(e) => set('specialty_slug', e.target.value || null)}
          disabled={disabled}
        >
          <option value="">{t('select')}</option>
          {!knownSpecialty && value.specialty_slug && <option value={value.specialty_slug}>{value.specialty_slug}</option>}
          {specialties.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </Block>

      <Block label={t('bodyAreas')} as="fieldset">
        <div className="flex flex-wrap gap-2">
          {BODY_AREAS.map((area) => {
            const on = value.body_areas.includes(area);
            return (
              <button
                key={area}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => set('body_areas', toggle(value.body_areas, area))}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border bg-surface text-fg hover:bg-surface-2',
                )}
              >
                {t(`area_${area}`)}
              </button>
            );
          })}
        </div>
      </Block>

      <Block label={`${t('pain')}: ${value.pain_intensity == null ? t('painUnknown') : t('painValue', { n: value.pain_intensity })}`}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={value.pain_intensity ?? 0}
            onChange={(e) => set('pain_intensity', Number(e.target.value))}
            disabled={disabled}
            aria-label={t('pain')}
            className="w-full accent-[var(--color-primary)] sm:w-80"
          />
          {value.pain_intensity != null && (
            <Button variant="link" size="xs" onClick={() => set('pain_intensity', null)} disabled={disabled}>
              {t('painUnknown')}
            </Button>
          )}
        </div>
      </Block>

      <Block label={t('symptoms')} as="fieldset">
        <ul className="space-y-2">
          {value.symptoms.map((s, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center">
              <input
                className={cn(field, 'flex-1')}
                aria-label={`${t('symptomName')} ${i + 1}`}
                value={s.name}
                onChange={(e) => set('symptoms', value.symptoms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                disabled={disabled}
              />
              <div className="flex items-center gap-1" role="radiogroup" aria-label={s.name || t('symptomName')}>
                {SYMPTOM_ANSWERS.map((a: SymptomAnswer) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={s.answer === a}
                    disabled={disabled}
                    onClick={() => set('symptoms', value.symptoms.map((x, j) => (j === i ? { ...x, answer: a } : x)))}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      s.answer === a
                        ? a === 'yes'
                          ? 'border-primary bg-primary-soft text-primary-ink'
                          : a === 'maybe'
                            ? 'border-warning bg-warning-soft text-warning-ink'
                            : 'border-border-strong bg-surface-2 text-fg'
                        : 'border-border bg-surface text-muted',
                    )}
                  >
                    {t(`ans_${a}`)}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={t('remove')}
                  title={t('remove')}
                  disabled={disabled}
                  onClick={() => set('symptoms', value.symptoms.filter((_, j) => j !== i))}
                  className="ms-1 inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger-ink"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="xs"
          className="mt-2"
          leftIcon={<Plus className="size-3.5" aria-hidden />}
          onClick={() => set('symptoms', [...value.symptoms, { name: '', answer: 'yes' }])}
          disabled={disabled}
        >
          {t('addSymptom')}
        </Button>
      </Block>

      <Block label={t('duration')}>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            aria-label={t('durationValue')}
            className={cn(field, 'h-10 w-24')}
            value={value.duration_value ?? ''}
            onChange={(e) => set('duration_value', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            disabled={disabled}
          />
          <select
            aria-label={t('duration')}
            className={cn(field, 'h-10 w-40')}
            value={value.duration_unit ?? ''}
            onChange={(e) => set('duration_unit', (e.target.value || null) as DurationUnit | null)}
            disabled={disabled}
          >
            <option value="">{t('select')}</option>
            {DURATION_UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`unit_${u}`)}
              </option>
            ))}
          </select>
        </div>
      </Block>

      <Block label={t('severity')} as="fieldset">
        <div className="grid gap-3 sm:grid-cols-3">
          {(['work', 'sleep', 'mobility'] as const).map((key) => (
            <label key={key} className="block text-sm">
              <span className="mb-1 block text-muted">{t(`sev_${key}`)}</span>
              <select
                className={cn(field, 'h-10')}
                value={value.severity?.[key] ?? ''}
                onChange={(e) => setSeverity(key, e.target.value as SeverityLevel | '')}
                disabled={disabled}
              >
                <option value="">{t('select')}</option>
                {SEVERITY_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`lvl_${l}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Block>

      <Block label={t('previous')} as="fieldset">
        <div className="flex flex-wrap gap-2">
          {PREVIOUS_TREATMENTS.map((pt) => {
            const on = value.previous_treatments.includes(pt);
            return (
              <button
                key={pt}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => set('previous_treatments', toggle(value.previous_treatments as string[], pt))}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border bg-surface text-fg hover:bg-surface-2',
                )}
              >
                {t(`pt_${pt}`)}
              </button>
            );
          })}
        </div>
      </Block>

      <Block label={t('notes')}>
        <textarea
          aria-label={t('notes')}
          className={cn(field, 'min-h-20')}
          rows={3}
          maxLength={4000}
          value={value.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || null)}
          disabled={disabled}
        />
      </Block>
    </div>
  );
}

function Block({ label, children, as = 'div' }: { label: ReactNode; children: ReactNode; as?: 'div' | 'fieldset' }) {
  if (as === 'fieldset') {
    return (
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-1 text-sm font-medium text-fg">{label}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-fg">{label}</p>
      {children}
    </div>
  );
}
