import { BODY_AREAS as SHARED_BODY_AREAS, BODY_AREA_LABELS } from '@hig/shared/api';
import { intlLocale } from '@hig/shared/lib';

/**
 * Body areas = the ONE vocabulary shared with the patient body map, the Flutter app, the catalog and the
 * screening rules engine (PLAN catalog ids; INTEGRATION_BACKLOG #37).
 */
export const BODY_AREAS = SHARED_BODY_AREAS;
export { BODY_AREA_LABELS };

/** Symptom-library regions matched for each selected body area (the vocabularies are identical). */
export const SYMPTOM_REGION: Record<string, string[]> = Object.fromEntries(BODY_AREAS.map((a) => [a, [a]]));

/**
 * Spoken languages (stored and matched by their English name, e.g. hospital/doctor `languages`).
 * Show them with `languageLabel()` / `languageOptions()` so the label follows the UI language.
 */
export const LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Arabic',
  'French',
  'Spanish',
  'Russian',
  'Swahili',
  'Bengali',
  'Urdu',
  'Persian',
  'Portuguese',
  'Amharic',
  'Uzbek',
] as const;

/** ISO-639-1 code of each LANGUAGE_OPTIONS value (display names come from Intl.DisplayNames). */
const LANGUAGE_CODES: Record<string, string> = {
  English: 'en',
  Hindi: 'hi',
  Arabic: 'ar',
  French: 'fr',
  Spanish: 'es',
  Russian: 'ru',
  Swahili: 'sw',
  Bengali: 'bn',
  Urdu: 'ur',
  Persian: 'fa',
  Portuguese: 'pt',
  Amharic: 'am',
  Uzbek: 'uz',
};

/** Countries most commonly served (ISO-3166 alpha-2). Names come from Intl.DisplayNames. */
export const COUNTRY_CODES = [
  'AE', 'AF', 'AU', 'BD', 'BH', 'BT', 'CA', 'CD', 'CM', 'DE', 'DZ', 'EG', 'ET', 'FR', 'GB', 'GH', 'IN', 'IQ',
  'IR', 'IT', 'JO', 'KE', 'KW', 'KZ', 'LK', 'MA', 'MM', 'MU', 'MV', 'MZ', 'NG', 'NL', 'NP', 'OM', 'PK', 'QA',
  'RU', 'RW', 'SA', 'SD', 'SN', 'SO', 'SY', 'TJ', 'TM', 'TZ', 'UG', 'US', 'UZ', 'YE', 'ZA', 'ZM', 'ZW',
] as const;

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** Intl.DisplayNames for the current UI language (cached per locale and type). */
function names(type: 'region' | 'language'): Intl.DisplayNames | null {
  const locale = intlLocale();
  const key = `${type}|${locale}`;
  if (!displayNames.has(key)) {
    try {
      displayNames.set(key, new Intl.DisplayNames([locale, 'en'], { type }));
    } catch {
      displayNames.set(key, null);
    }
  }
  return displayNames.get(key) ?? null;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  try {
    return names('region')?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Country options in the UI language, sorted by name. */
export function countryOptions(): { value: string; label: string }[] {
  const locale = intlLocale();
  return [...COUNTRY_CODES]
    .map((code) => ({ value: code, label: countryName(code) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** Display name of a LANGUAGE_OPTIONS value (or any English language name) in the UI language. */
export function languageLabel(name: string): string {
  const code = LANGUAGE_CODES[name];
  if (!code) return name;
  try {
    const label = names('language')?.of(code);
    return label ? label.charAt(0).toLocaleUpperCase(intlLocale()) + label.slice(1) : name;
  } catch {
    return name;
  }
}

/** Language filter / picker options: value = English name (matches API data), label = UI language. */
export function languageOptions(): { value: string; label: string }[] {
  return LANGUAGE_OPTIONS.map((l) => ({ value: l, label: languageLabel(l) }));
}

export const MAX_ENQUIRY_HOSPITALS = 3;
export const MAX_COMPARE = 3;
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.dcm,application/pdf,image/*';
