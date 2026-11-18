/**
 * Country options (ISO 3166-1 alpha-2) for patient-facing selects; names come from Intl.DisplayNames in the UI
 * language. Preference languages are stored by English name and shown with a translated label.
 */
import { i18n, intlLocale } from '@hig/shared/lib';

const CODES = [
  'AE', 'AF', 'AU', 'BD', 'BH', 'BT', 'CA', 'CD', 'CM', 'DE', 'DZ', 'EG', 'ES', 'ET', 'FJ', 'FR', 'GB', 'GH', 'IE',
  'IN', 'IQ', 'IR', 'IT', 'JO', 'JP', 'KE', 'KW', 'KZ', 'LB', 'LK', 'LY', 'MA', 'MM', 'MU', 'MV', 'MW', 'MY', 'MZ',
  'NG', 'NL', 'NP', 'NZ', 'OM', 'PH', 'PK', 'QA', 'RU', 'RW', 'SA', 'SD', 'SG', 'SN', 'SO', 'SS', 'SY', 'TJ', 'TM',
  'TR', 'TZ', 'UA', 'UG', 'US', 'UZ', 'YE', 'ZA', 'ZM', 'ZW',
] as const;

const displayNames = new Map<string, Intl.DisplayNames | null>();
function names(): Intl.DisplayNames | null {
  const locale = intlLocale();
  if (displayNames.has(locale)) return displayNames.get(locale) ?? null;
  let dn: Intl.DisplayNames | null;
  try {
    dn = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    dn = null;
  }
  displayNames.set(locale, dn);
  return dn;
}

/** Country name in the UI language ("IN" -> "India" / "Inde" / "الهند"). */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  try {
    return names()?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const optionsCache = new Map<string, { value: string; label: string }[]>();

/** Country options sorted by name in the UI language (call at render time). */
export function countryOptions(): { value: string; label: string }[] {
  const locale = intlLocale();
  let list = optionsCache.get(locale);
  if (!list) {
    list = CODES.map((code) => ({ value: code, label: countryName(code) })).sort((a, b) =>
      a.label.localeCompare(b.label, locale),
    );
    optionsCache.set(locale, list);
  }
  return list;
}

const LANGUAGES: readonly { value: string; key: string; flag: string }[] = [
  { value: 'English', key: 'english', flag: '🇬🇧' },
  { value: 'Hindi', key: 'hindi', flag: '🇮🇳' },
  { value: 'Arabic', key: 'arabic', flag: '🇸🇦' },
  { value: 'French', key: 'french', flag: '🇫🇷' },
  { value: 'Russian', key: 'russian', flag: '🇷🇺' },
  { value: 'Bengali', key: 'bengali', flag: '🇧🇩' },
  { value: 'Swahili', key: 'swahili', flag: '🇰🇪' },
  { value: 'Spanish', key: 'spanish', flag: '🇪🇸' },
  { value: 'Pashto', key: 'pashto', flag: '🇦🇫' },
  { value: 'Uzbek', key: 'uzbek', flag: '🇺🇿' },
  { value: 'Dari', key: 'dari', flag: '🇦🇫' },
  { value: 'Amharic', key: 'amharic', flag: '🇪🇹' },
  { value: 'Portuguese', key: 'portuguese', flag: '🇵🇹' },
];

/**
 * Languages offered in screening preferences (stored by English name, matching doctors'/hospitals'
 * `languages`). `label` is read lazily (`patient:languages.<key>`), so it follows the UI language.
 */
export const LANGUAGE_OPTIONS: readonly { readonly value: string; readonly label: string; readonly flag: string }[] =
  LANGUAGES.map(({ value, key, flag }) => ({
    value,
    flag,
    get label() {
      return i18n.t(`patient:languages.${key}`, { defaultValue: value });
    },
  }));

/** Translated label of a stored language name (falls back to the stored name). */
export function languageLabel(value: string): string {
  return LANGUAGE_OPTIONS.find((l) => l.value === value)?.label ?? value;
}
