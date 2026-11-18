/**
 * Helpers shared by Settings -> Languages and Settings -> Translations.
 */
import type { TFunction } from 'i18next';
import type { TranslationApp } from '@hig/shared/api';
import { formatNumber } from '@hig/shared/lib';

/** Query keys of the admin i18n endpoints. */
export const i18nKeys = {
  languages: ['admin', 'i18n', 'languages'] as const,
  strings: ['admin', 'i18n', 'strings'] as const,
};

/** Display name of a catalog set (`translation_overrides.app`). */
export function translationAppLabel(app: TranslationApp | string, t: TFunction): string {
  return t(`languages.apps.${app}`, { defaultValue: app });
}

/** "92.5%" in the UI language (input 0-100). */
export function formatCompleteness(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return formatNumber(value / 100, { style: 'percent', maximumFractionDigits: 1 });
}

export function completenessTone(value: number): 'success' | 'warning' | 'danger' {
  if (value >= 95) return 'success';
  if (value >= 60) return 'warning';
  return 'danger';
}

const TOKEN_RE = /\{\{\s*[\w.]+\s*\}\}|\{\w+\}/g;
const TAG_RE = /<\/?\d+\s*\/?>/;

/** Placeholders (`{{name}}`, `{count}`) of `source` that `text` does not contain (each listed once). */
export function missingPlaceholders(source: string, text: string): string[] {
  const normalize = (token: string) => token.replace(/\s+/g, '');
  const present = new Set((text.match(TOKEN_RE) ?? []).map(normalize));
  const missing = new Set<string>();
  for (const token of source.match(TOKEN_RE) ?? []) {
    if (!present.has(normalize(token))) missing.add(normalize(token));
  }
  return [...missing];
}

/** True when the English text uses numbered tags (`<0>terms</0>`) for links / bold parts. */
export function hasNumberedTags(source: string): boolean {
  return TAG_RE.test(source);
}
