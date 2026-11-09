/** Country options (ISO 3166-1 alpha-2) for patient-facing selects; names come from Intl.DisplayNames. */
const CODES = [
  'AE', 'AF', 'AU', 'BD', 'BH', 'BT', 'CA', 'CD', 'CM', 'DE', 'DZ', 'EG', 'ES', 'ET', 'FJ', 'FR', 'GB', 'GH', 'IE',
  'IN', 'IQ', 'IR', 'IT', 'JO', 'JP', 'KE', 'KW', 'KZ', 'LB', 'LK', 'LY', 'MA', 'MM', 'MU', 'MV', 'MW', 'MY', 'MZ',
  'NG', 'NL', 'NP', 'NZ', 'OM', 'PH', 'PK', 'QA', 'RU', 'RW', 'SA', 'SD', 'SG', 'SN', 'SO', 'SS', 'SY', 'TJ', 'TM',
  'TR', 'TZ', 'UA', 'UG', 'US', 'UZ', 'YE', 'ZA', 'ZM', 'ZW',
] as const;

let displayNames: Intl.DisplayNames | null = null;
function names(): Intl.DisplayNames | null {
  if (displayNames) return displayNames;
  try {
    displayNames = new Intl.DisplayNames(undefined, { type: 'region' });
  } catch {
    displayNames = null;
  }
  return displayNames;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  try {
    return names()?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRY_OPTIONS: { value: string; label: string }[] = CODES.map((code) => ({
  value: code,
  label: countryName(code),
})).sort((a, b) => a.label.localeCompare(b.label));

/** Languages offered in screening preferences (stored by name, matching doctors'/hospitals' `languages`). */
export const LANGUAGE_OPTIONS: { value: string; label: string; flag: string }[] = [
  { value: 'English', label: 'English', flag: '🇬🇧' },
  { value: 'Hindi', label: 'Hindi', flag: '🇮🇳' },
  { value: 'Arabic', label: 'Arabic', flag: '🇸🇦' },
  { value: 'French', label: 'French', flag: '🇫🇷' },
  { value: 'Russian', label: 'Russian', flag: '🇷🇺' },
  { value: 'Bengali', label: 'Bengali', flag: '🇧🇩' },
  { value: 'Swahili', label: 'Swahili', flag: '🇰🇪' },
  { value: 'Spanish', label: 'Spanish', flag: '🇪🇸' },
  { value: 'Pashto', label: 'Pashto', flag: '🇦🇫' },
  { value: 'Uzbek', label: 'Uzbek', flag: '🇺🇿' },
  { value: 'Dari', label: 'Dari', flag: '🇦🇫' },
  { value: 'Amharic', label: 'Amharic', flag: '🇪🇹' },
  { value: 'Portuguese', label: 'Portuguese', flag: '🇵🇹' },
];
