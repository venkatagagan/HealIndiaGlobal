import { BODY_AREAS as SHARED_BODY_AREAS, BODY_AREA_LABELS } from '@hig/shared/api';

/**
 * Body areas = the ONE vocabulary shared with the patient body map, the Flutter app, the catalog and the
 * screening rules engine (PLAN catalog ids; INTEGRATION_BACKLOG #37).
 */
export const BODY_AREAS = SHARED_BODY_AREAS;
export { BODY_AREA_LABELS };

/** Symptom-library regions matched for each selected body area (the vocabularies are identical). */
export const SYMPTOM_REGION: Record<string, string[]> = Object.fromEntries(BODY_AREAS.map((a) => [a, [a]]));

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

/** Countries most commonly served (ISO-3166 alpha-2). Names come from Intl.DisplayNames. */
export const COUNTRY_CODES = [
  'AE', 'AF', 'AU', 'BD', 'BH', 'BT', 'CA', 'CD', 'CM', 'DE', 'DZ', 'EG', 'ET', 'FR', 'GB', 'GH', 'IN', 'IQ',
  'IR', 'IT', 'JO', 'KE', 'KW', 'KZ', 'LK', 'MA', 'MM', 'MU', 'MV', 'MZ', 'NG', 'NL', 'NP', 'OM', 'PK', 'QA',
  'RU', 'RW', 'SA', 'SD', 'SN', 'SO', 'SY', 'TJ', 'TM', 'TZ', 'UG', 'US', 'UZ', 'YE', 'ZA', 'ZM', 'ZW',
] as const;

let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRY_OPTIONS = [...COUNTRY_CODES]
  .map((code) => ({ value: code, label: countryName(code) }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const MAX_ENQUIRY_HOSPITALS = 3;
export const MAX_COMPARE = 3;
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.dcm,application/pdf,image/*';
