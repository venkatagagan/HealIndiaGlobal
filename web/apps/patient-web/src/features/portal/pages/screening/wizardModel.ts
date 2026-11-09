import type {
  CurrencyCode,
  DoctorGenderPref,
  DurationUnit,
  PreviousTreatment,
  ScreeningOut,
  ScreeningSeverity,
  ScreeningSymptom,
  ScreeningUpdateIn,
} from '@hig/shared/api';
import { fromMinor, toMinor } from '../../lib/shared';

export const TOTAL_STEPS = 4;

/** Local, form-friendly copy of the screening answers (budget kept as major-unit strings for inputs). */
export interface WizardDraft {
  body_areas: string[];
  pain_intensity: number;
  symptoms: ScreeningSymptom[];
  notes: string;
  duration_value: string;
  duration_unit: DurationUnit;
  severity: ScreeningSeverity;
  previous_treatments: PreviousTreatment[];
  report_document_ids: string[];
  languages: string[];
  doctor_gender: DoctorGenderPref;
  budget_min: string;
  budget_max: string;
  budget_currency: CurrencyCode;
  travel_window_start: string;
  travel_window_end: string;
  use_ai: boolean;
  home_country: string;
  consent_ai: boolean;
}

export function draftFromScreening(s: ScreeningOut, defaults: { currency: string; country: string | null }): WizardDraft {
  const p = s.preferences ?? {};
  const currency = p.budget_currency || defaults.currency || 'USD';
  return {
    body_areas: s.body_areas ?? [],
    pain_intensity: s.pain_intensity ?? 0,
    symptoms: s.symptoms ?? [],
    notes: s.notes ?? '',
    duration_value: s.duration_value != null ? String(s.duration_value) : '',
    duration_unit: s.duration_unit ?? 'weeks',
    severity: s.severity ?? {},
    previous_treatments: s.previous_treatments ?? [],
    report_document_ids: s.report_document_ids ?? [],
    languages: p.languages ?? [],
    doctor_gender: p.doctor_gender ?? 'no_preference',
    budget_min: p.budget_min_minor != null ? String(fromMinor(p.budget_min_minor, currency)) : '',
    budget_max: p.budget_max_minor != null ? String(fromMinor(p.budget_max_minor, currency)) : '',
    budget_currency: currency,
    travel_window_start: p.travel_window_start ?? '',
    travel_window_end: p.travel_window_end ?? '',
    use_ai: p.use_ai ?? true,
    home_country: s.home_country ?? defaults.country ?? '',
    consent_ai: s.consent_ai ?? false,
  };
}

/** Fields PATCHed after each step. */
export function stepPayload(step: number, d: WizardDraft): ScreeningUpdateIn {
  switch (step) {
    case 1:
      return { body_areas: d.body_areas, pain_intensity: d.pain_intensity };
    case 2:
      return { symptoms: d.symptoms, notes: d.notes.trim() || null };
    case 3: {
      const value = Number.parseInt(d.duration_value, 10);
      return {
        duration_value: Number.isFinite(value) && value > 0 ? value : null,
        duration_unit: d.duration_unit,
        severity: d.severity,
        previous_treatments: d.previous_treatments,
        report_document_ids: d.report_document_ids,
      };
    }
    default:
      return {
        preferences: {
          languages: d.languages,
          doctor_gender: d.doctor_gender,
          budget_min_minor: d.budget_min ? toMinor(d.budget_min, d.budget_currency) : null,
          budget_max_minor: d.budget_max ? toMinor(d.budget_max, d.budget_currency) : null,
          budget_currency: d.budget_currency,
          travel_window_start: d.travel_window_start || null,
          travel_window_end: d.travel_window_end || null,
          use_ai: d.use_ai,
        },
        home_country: d.home_country || null,
      };
  }
}

/** Returns an error message when the step cannot be completed yet. */
export function validateStep(step: number, d: WizardDraft): string | null {
  switch (step) {
    case 1:
      return d.body_areas.length ? null : 'Select at least one area on the body map (or "Whole body / general").';
    case 2: {
      const positive = d.symptoms.some((s) => s.answer !== 'no');
      return positive || d.notes.trim().length >= 3
        ? null
        : 'Answer "Yes" or "Maybe" to at least one symptom, or describe your symptoms in your own words.';
    }
    case 3: {
      const value = Number.parseInt(d.duration_value, 10);
      if (!Number.isFinite(value) || value <= 0) return 'Tell us how long you have had this condition.';
      if (value > 1000) return 'Please enter a realistic duration.';
      return null;
    }
    default: {
      const min = d.budget_min ? toMinor(d.budget_min, d.budget_currency) : null;
      const max = d.budget_max ? toMinor(d.budget_max, d.budget_currency) : null;
      if ((d.budget_min && min === null) || (d.budget_max && max === null)) return 'Enter the budget as a number.';
      if (min !== null && max !== null && min > max) return 'The minimum budget is higher than the maximum.';
      if (d.travel_window_start && d.travel_window_end && d.travel_window_start > d.travel_window_end) {
        return 'The travel window ends before it starts.';
      }
      if (d.use_ai && !d.consent_ai) {
        return 'Please agree to AI processing, or turn off "Use AI recommendations".';
      }
      return null;
    }
  }
}

export const STEP_TITLES = [
  'Where are you experiencing issues?',
  'Which symptoms are you experiencing?',
  'How long have you had this condition?',
  'Personalize your matches',
];
