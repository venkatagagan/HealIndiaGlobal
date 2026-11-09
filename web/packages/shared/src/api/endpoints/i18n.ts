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

/** GET /i18n/overrides */
export interface TranslationOverridesOut {
  locale: string;
  app: TranslationApp;
  /** epoch milliseconds of the newest override (0 = none) */
  version: number;
  /** web apps: "<namespace>:<dotted.key>"; website/server/mobile: "<dotted.key>" */
  strings: Record<string, string>;
}

/** GET /admin/i18n/languages item */
export interface AdminLanguageOut extends PublicLanguageOut {
  sort: number;
  /** percent (0-100) of English keys that have a translation (shipped or override), per app */
  completeness: Partial<Record<TranslationApp, number>>;
  /** percent over every app */
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
  updated_at: string | null;
  updated_by: string | null;
}

export interface TranslationStringsPage extends Page<TranslationStringOut> {
  counts: { total: number; missing: number; overridden: number };
}

export interface TranslationOverrideIn {
  app: TranslationApp;
  locale: string;
  key: string;
  /** plain text (HTML is stripped), max 5000 characters */
  text: string;
}

export interface TranslationOverrideOut {
  app: TranslationApp;
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
  deleteOverride: (query: { app: TranslationApp; locale: string; key: string }) =>
    api.delete('/admin/i18n/overrides', { query }),
};
