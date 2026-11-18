/**
 * Languages + translation overrides (multi-language support).
 *
 * Public:  GET /i18n/languages, GET /i18n/overrides  (lib/i18n.ts calls these with plain fetch at start-up)
 * Admin:   /admin/i18n/*  (super admin / operations admin; every change is audited)
 */
import { api } from '../client';
import type { Page } from '../types';
import { seg } from './_util';

/** Catalog sets that can be overridden (`translation_overrides.app`). */
export type TranslationApp = 'website' | 'patient_web' | 'admin' | 'agent' | 'hospital' | 'mobile' | 'server';

export const TRANSLATION_APPS: readonly TranslationApp[] = [
  'patient_web',
  'agent',
  'hospital',
  'admin',
  'website',
  'mobile',
  'server',
];

/** GET /i18n/languages item (enabled languages only, ordered). */
export interface PublicLanguageOut {
  code: string;
  name: string;
  native_name: string;
  rtl: boolean;
  enabled: boolean;
}

/** GET /i18n/overrides (backend `OverridesOut`; `app` is echoed as a plain string) */
export interface TranslationOverridesOut {
  locale: string;
  app: string;
  /** epoch milliseconds of the newest override (0 = none) */
  version: number;
  /** web apps: "<namespace>:<dotted.key>"; website/server/mobile: "<dotted.key>" */
  strings: Record<string, string>;
}

/** GET /admin/i18n/languages item */
export interface AdminLanguageOut extends PublicLanguageOut {
  sort: number;
  /**
   * percent (0-100, one decimal) of the app's English keys that have a translation (shipped or override), per
   * app; the backend sends a `dict[str, float]` with every app of `TRANSLATION_APPS` (English: 100 each)
   */
  completeness: Partial<Record<TranslationApp, number>> & Record<string, number>;
  /** percent over every app (0-100, one decimal) */
  completeness_overall: number;
  updated_at: string | null;
}

export interface LanguageUpdateIn {
  enabled: boolean;
}

export type TranslationStatus = 'all' | 'missing' | 'overridden' | 'translated';

export interface TranslationStringsQuery {
  app: TranslationApp;
  locale: string;
  q?: string;
  status?: TranslationStatus;
  page?: number;
  page_size?: number;
}

/** GET /admin/i18n/strings item */
export interface TranslationStringOut {
  key: string;
  /** shipped English text */
  source: string;
  /** shipped text in `locale` (null when the catalog has no translation) */
  shipped: string | null;
  /** admin override in `locale` (null when none) */
  override: string | null;
  /** what users see: override ?? shipped ?? source */
  effective: string;
  /** when the override was last changed (null without an override) */
  updated_at: string | null;
  /** display name (or email) of the admin who last changed the override */
  updated_by: string | null;
}

/**
 * GET /admin/i18n/strings (backend `StringsPage`). `pages` is 0 when nothing matches. `counts` are taken over the
 * search result (`q`) before the status filter; `total` is after it.
 */
export interface TranslationStringsPage extends Page<TranslationStringOut> {
  counts: { total: number; missing: number; overridden: number };
}

export interface TranslationOverrideIn {
  app: TranslationApp;
  locale: string;
  key: string;
  /**
   * plain text: the server removes HTML tags and control characters, then 1..5000 characters must remain (the raw
   * body may be up to 20000). The key must exist in the app's English catalog (else 404 `unknown_translation_key`).
   */
  text: string;
}

/** PUT /admin/i18n/overrides response (backend `OverrideOut`) */
export interface TranslationOverrideOut {
  app: string;
  locale: string;
  key: string;
  text: string;
  updated_at: string;
  updated_by: string | null;
}

export const i18nApi = {
  languages: () => api.get<PublicLanguageOut[]>('/i18n/languages', null, { skipAuth: true }),
  overrides: (locale: string, app: TranslationApp) =>
    api.get<TranslationOverridesOut>('/i18n/overrides', { locale, app }, { skipAuth: true }),
};

export const adminI18nApi = {
  languages: () => api.get<AdminLanguageOut[]>('/admin/i18n/languages'),
  updateLanguage: (code: string, body: LanguageUpdateIn) =>
    api.patch<AdminLanguageOut>(`/admin/i18n/languages/${seg(code)}`, body),
  strings: (query: TranslationStringsQuery) => api.get<TranslationStringsPage>('/admin/i18n/strings', query),
  upsertOverride: (body: TranslationOverrideIn) => api.put<TranslationOverrideOut>('/admin/i18n/overrides', body),
  /** 204; idempotent (no override: nothing happens) */
  deleteOverride: (query: { app: TranslationApp; locale: string; key: string }) =>
    api.delete<void>('/admin/i18n/overrides', { query }),
};
