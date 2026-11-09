/**
 * Multi-language support for every web app (i18next + react-i18next).
 *
 * Catalogs
 * - JSON files `src/locales/<lng>/<namespace>.json`. The shared package owns the `common`, `docai` and `voice`
 *   namespaces; each app owns its own namespace(s) (`patient`, `admin`, `agent`, `hospital`).
 * - English is bundled (eager) so the first render never waits; other languages are lazy chunks loaded on
 *   switch. Missing keys fall back to English.
 * - Apps register their catalogs with `setupI18n({ app, eager, lazy })` (see each app's `src/i18n.ts`).
 *
 * Runtime overrides
 * - Admins can edit any string in the admin portal. `GET /i18n/overrides?locale=&app=` returns
 *   `{ strings: { "<ns>:<dotted.key>": text } }`, merged over the shipped catalog of that language.
 *   Overrides are plain text: they are rendered by React as text, never as HTML.
 *
 * Language choice
 * - Saved choice (localStorage) -> the signed-in user's `preferred_language` -> browser languages -> English,
 *   always restricted to the languages an admin enabled (`GET /i18n/languages`).
 * - `<html lang dir>` follows the language (Arabic is right-to-left) and API calls send `Accept-Language`.
 */
import i18next, { type i18n as I18nInstance } from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import { getApiBaseUrl, setRequestLanguage } from '../api/client';

export const COMMON_NS = 'common';
export const DEFAULT_LANGUAGE = 'en';

/** Languages the product ships translations for (an admin decides which are switched on). */
export const SUPPORTED_LANGUAGES = ['en', 'ar', 'fr', 'bn', 'ru'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

/** Which catalog set overrides are read for (matches the server's `translation_overrides.app`). */
export type I18nApp = 'patient_web' | 'admin' | 'agent' | 'hospital';

/** One language as returned by `GET /i18n/languages`. */
export interface LanguageInfo {
  code: string;
  name: string;
  native_name: string;
  rtl: boolean;
  enabled: boolean;
}

/** Built-in metadata, used before (or without) the server list. */
export const BUILTIN_LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', name: 'English', native_name: 'English', rtl: false, enabled: true },
  { code: 'ar', name: 'Arabic', native_name: 'العربية', rtl: true, enabled: false },
  { code: 'fr', name: 'French', native_name: 'Français', rtl: false, enabled: false },
  { code: 'bn', name: 'Bengali', native_name: 'বাংলা', rtl: false, enabled: false },
  { code: 'ru', name: 'Russian', native_name: 'Русский', rtl: false, enabled: false },
];

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

export function isRtlLanguage(code: string | null | undefined): boolean {
  return !!code && RTL_LANGUAGES.has(baseLanguage(code));
}

/** "fr-CA" -> "fr" */
export function baseLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0] ?? code;
}

const STORAGE_KEY = 'hig.language';

// -----------------------------------------------------------------------------------------------------------
// Catalog registry
// -----------------------------------------------------------------------------------------------------------
type JsonCatalog = Record<string, unknown>;
/** `import.meta.glob(..., { import: 'default' })` loader */
export type CatalogLoader = () => Promise<unknown>;

const CATALOG_PATH = /\/locales\/([a-z]{2,3}(?:-[A-Za-z]+)?)\/([\w.-]+)\.json$/;
const lazyCatalogs = new Map<string, { ns: string; load: CatalogLoader }[]>();
const loadedCatalogs = new Set<string>(); // "<lng>/<ns>"
const knownNamespaces = new Set<string>([COMMON_NS]);

function unwrap(mod: unknown): JsonCatalog {
  if (mod && typeof mod === 'object' && 'default' in mod && typeof (mod as { default: unknown }).default === 'object') {
    return (mod as { default: JsonCatalog }).default;
  }
  return (mod ?? {}) as JsonCatalog;
}

function addNamespace(ns: string): void {
  if (knownNamespaces.has(ns)) return;
  knownNamespaces.add(ns);
  const current = i18next.options.ns;
  const list = Array.isArray(current) ? current : current ? [current] : [];
  if (!list.includes(ns)) i18next.options.ns = [...list, ns];
}

/**
 * Register catalogs from `import.meta.glob`:
 * `registerCatalogs(import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' }),
 *                   import.meta.glob(['./locales/*\/*.json', '!./locales/en/*.json'], { import: 'default' }))`
 */
export function registerCatalogs(eager: Record<string, unknown>, lazy: Record<string, CatalogLoader> = {}): void {
  initI18n();
  for (const [path, mod] of Object.entries(eager)) {
    const match = CATALOG_PATH.exec(path);
    if (!match) continue;
    const [, lng, ns] = match as unknown as [string, string, string];
    addNamespace(ns);
    i18next.addResourceBundle(lng, ns, unwrap(mod), true, true);
    loadedCatalogs.add(`${lng}/${ns}`);
  }
  for (const [path, load] of Object.entries(lazy)) {
    const match = CATALOG_PATH.exec(path);
    if (!match) continue;
    const [, lng, ns] = match as unknown as [string, string, string];
    addNamespace(ns);
    const list = lazyCatalogs.get(lng) ?? [];
    list.push({ ns, load });
    lazyCatalogs.set(lng, list);
  }
}

async function loadCatalogs(lng: string): Promise<void> {
  const pending = (lazyCatalogs.get(lng) ?? []).filter(({ ns }) => !loadedCatalogs.has(`${lng}/${ns}`));
  await Promise.all(
    pending.map(async ({ ns, load }) => {
      try {
        const data = unwrap(await load());
        i18next.addResourceBundle(lng, ns, data, true, true);
        loadedCatalogs.add(`${lng}/${ns}`);
      } catch {
        // a missing chunk falls back to English for that namespace
      }
    }),
  );
}

// -----------------------------------------------------------------------------------------------------------
// Runtime overrides (admin-edited text)
// -----------------------------------------------------------------------------------------------------------
let currentApp: I18nApp | null = null;
const appliedOverrides = new Map<string, Promise<void>>(); // "<app>/<lng>"

/** Override response of `GET /i18n/overrides`. */
export interface OverridesOut {
  locale: string;
  app: string;
  version: number;
  strings: Record<string, string>;
}

/** `{"patient:a.b": "x", "common:c": "y"}` -> `{patient: {a: {b: "x"}}, common: {c: "y"}}` */
export function groupOverrides(strings: Record<string, string>): Record<string, JsonCatalog> {
  const out: Record<string, JsonCatalog> = {};
  for (const [fullKey, text] of Object.entries(strings)) {
    if (typeof text !== 'string') continue;
    const sep = fullKey.indexOf(':');
    if (sep <= 0) continue;
    const ns = fullKey.slice(0, sep);
    const path = fullKey.slice(sep + 1).split('.');
    let node: JsonCatalog = (out[ns] ??= {});
    path.forEach((part, index) => {
      if (index === path.length - 1) {
        node[part] = text;
      } else {
        const next = node[part];
        node = (typeof next === 'object' && next !== null ? next : (node[part] = {})) as JsonCatalog;
      }
    });
  }
  return out;
}

async function applyOverrides(app: I18nApp, lng: string): Promise<void> {
  const cacheKey = `${app}/${lng}`;
  const existing = appliedOverrides.get(cacheKey);
  if (existing) return existing;
  const task = (async () => {
    try {
      const url = `${getApiBaseUrl()}/i18n/overrides?locale=${encodeURIComponent(lng)}&app=${encodeURIComponent(app)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (!response.ok) return;
      const body = (await response.json()) as Partial<OverridesOut>;
      const grouped = groupOverrides(body.strings ?? {});
      for (const [ns, values] of Object.entries(grouped)) {
        i18next.addResourceBundle(lng, ns, values, true, true);
      }
    } catch {
      // offline / API down: shipped text only
    }
  })();
  appliedOverrides.set(cacheKey, task);
  return task;
}

/** Drop cached overrides so the next load refetches them (admin portal calls this after an edit). */
export async function reloadOverrides(lng: string = currentLanguage()): Promise<void> {
  if (!currentApp) return;
  appliedOverrides.delete(`${currentApp}/${lng}`);
  await applyOverrides(currentApp, lng);
}

// -----------------------------------------------------------------------------------------------------------
// Language state
// -----------------------------------------------------------------------------------------------------------
interface LanguageState {
  language: string;
  languages: readonly LanguageInfo[]; // enabled only
  loading: boolean;
}

let state: LanguageState = {
  language: DEFAULT_LANGUAGE,
  languages: BUILTIN_LANGUAGES.filter((l) => l.enabled),
  loading: false,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<LanguageState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active language code ("en", "ar", ...). */
export function currentLanguage(): string {
  return state.language;
}

/** Enabled languages (server list, English only until it loads). */
export function enabledLanguages(): readonly LanguageInfo[] {
  return state.languages;
}

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSaved(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(STORAGE_KEY, code);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/** True when the visitor picked a language explicitly on this device. */
export function hasSavedLanguage(): boolean {
  return readSaved() !== null;
}

function pickEnabled(candidates: readonly (string | null | undefined)[]): string | null {
  const enabled = new Set(state.languages.map((l) => l.code));
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (enabled.has(candidate)) return candidate;
    const base = baseLanguage(candidate);
    if (enabled.has(base)) return base;
  }
  return null;
}

function applyDocumentLanguage(lng: string): void {
  setRequestLanguage(lng);
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lng;
  root.dir = isRtlLanguage(lng) ? 'rtl' : 'ltr';
}

/**
 * Switch the UI language (loads the catalog chunk + overrides first, so the switch is instant).
 * `persist` (default true) remembers the choice on this device.
 */
export async function changeLanguage(lng: string, { persist = true }: { persist?: boolean } = {}): Promise<void> {
  const code = pickEnabled([lng]) ?? DEFAULT_LANGUAGE;
  if (persist) writeSaved(code);
  setState({ loading: true });
  try {
    await loadCatalogs(code);
    if (currentApp) await applyOverrides(currentApp, code);
    await i18next.changeLanguage(code);
  } finally {
    applyDocumentLanguage(code);
    setState({ language: code, loading: false });
  }
}

async function fetchLanguages(): Promise<readonly LanguageInfo[]> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/i18n/languages`, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(String(response.status));
    const list = (await response.json()) as LanguageInfo[];
    const enabled = list.filter((l) => l && l.enabled && typeof l.code === 'string');
    if (!enabled.some((l) => l.code === DEFAULT_LANGUAGE)) enabled.unshift(BUILTIN_LANGUAGES[0]!);
    return enabled;
  } catch {
    return BUILTIN_LANGUAGES.filter((l) => l.enabled);
  }
}

/**
 * Apply the signed-in user's `preferred_language` when the visitor has not picked a language on this device.
 * (Called by the portal layout once the profile is known.)
 */
export function applyUserLanguage(preferred: string | null | undefined): void {
  if (!preferred || hasSavedLanguage()) return;
  const code = pickEnabled([preferred]);
  if (code && code !== state.language) void changeLanguage(code, { persist: false });
}

// -----------------------------------------------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------------------------------------------
/** The i18next instance bound to react-i18next (the default instance). */
export const i18n: I18nInstance = i18next;

/** Initialise (once) i18next with the shared English catalogs. Safe to call many times. */
export function initI18n(): I18nInstance {
  if (!i18next.isInitialized && !i18next.isInitializing) {
    void i18next.use(initReactI18next).init({
      resources: {},
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: false,
      defaultNS: COMMON_NS,
      fallbackNS: COMMON_NS,
      ns: [COMMON_NS],
      interpolation: { escapeValue: false },
      returnNull: false,
      initAsync: false,
      // re-render when overrides / lazy catalogs are added, not only on language change
      react: { bindI18n: 'languageChanged', bindI18nStore: 'added' },
    });
    registerCatalogs(
      import.meta.glob('../locales/en/*.json', { eager: true, import: 'default' }),
      import.meta.glob(['../locales/*/*.json', '!../locales/en/*.json'], { import: 'default' }),
    );
  }
  return i18next;
}

let readyPromise: Promise<void> | null = null;

export interface SetupI18nOptions {
  /** which overrides to read (`translation_overrides.app`) */
  app: I18nApp;
  /** `import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' })` */
  eager?: Record<string, unknown>;
  /** `import.meta.glob(['./locales/*\/*.json', '!./locales/en/*.json'], { import: 'default' })` */
  lazy?: Record<string, CatalogLoader>;
}

/**
 * App entry point: registers the app catalogs, then (in the background) loads the enabled languages, picks the
 * visitor's language and applies admin overrides. Resolves when the first language is ready (callers should
 * not block rendering on it for long - see `whenI18nReady`).
 */
export function setupI18n({ app, eager = {}, lazy = {} }: SetupI18nOptions): Promise<void> {
  initI18n();
  currentApp = app;
  registerCatalogs(eager, lazy);
  if (readyPromise) return readyPromise;
  const saved = readSaved();
  // start fetching the saved language's chunk while the language list loads
  if (saved && saved !== DEFAULT_LANGUAGE) void loadCatalogs(saved);
  readyPromise = (async () => {
    const languages = await fetchLanguages();
    setState({ languages });
    const browser = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
    const code = pickEnabled([saved, ...browser]) ?? DEFAULT_LANGUAGE;
    if (saved && code !== saved) writeSaved(null); // the saved language was switched off
    await changeLanguage(code, { persist: false });
  })();
  return readyPromise;
}

/** Resolves when the language is ready or after `timeoutMs`, whichever is first (use before the first render). */
export function whenI18nReady(timeoutMs = 2000): Promise<void> {
  const ready = readyPromise ?? Promise.resolve();
  return Promise.race([ready.catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Add or extend one English namespace (deep merge, overwriting existing keys). */
export function addTranslations(ns: string, resources: Record<string, unknown>, lng: string = DEFAULT_LANGUAGE): void {
  initI18n();
  addNamespace(ns);
  i18next.addResourceBundle(lng, ns, resources, true, true);
}

// -----------------------------------------------------------------------------------------------------------
// React hooks
// -----------------------------------------------------------------------------------------------------------
/** `useTranslation('common')` - the namespace used by the shared components. */
export function useCommonTranslation() {
  return useTranslation(COMMON_NS);
}

/** Current language, the enabled languages and a setter (re-renders on change). */
export function useLanguage() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  return {
    language: snapshot.language,
    languages: snapshot.languages,
    loading: snapshot.loading,
    dir: (isRtlLanguage(snapshot.language) ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    isRtl: isRtlLanguage(snapshot.language),
    changeLanguage,
  };
}

// -----------------------------------------------------------------------------------------------------------
// Intl helpers (numbers / dates / money follow the UI language)
// -----------------------------------------------------------------------------------------------------------
const INTL_LOCALES: Record<string, string> = {
  en: 'en-US',
  ar: 'ar-u-nu-latn', // Western digits: phone numbers, IDs and amounts stay unambiguous
  fr: 'fr-FR',
  bn: 'bn-BD-u-nu-latn',
  ru: 'ru-RU',
};

/** BCP-47 locale for `Intl.*` for the current (or given) UI language. */
export function intlLocale(lng: string = currentLanguage()): string {
  return INTL_LOCALES[lng] ?? lng;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();

/** Locale-aware number: `formatNumber(12345.6)` -> "12,345.6" (en) / "12 345,6" (fr). */
export function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  const locale = intlLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = numberFormatCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, fmt);
  }
  return fmt.format(value);
}

// Side effect (declared in package.json "sideEffects"): initialise on first import.
initI18n();
