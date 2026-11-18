/**
 * UI copy for the website, per language. English (dictionaries/en.ts) is the source of truth; the other
 * dictionaries are typed against it, so a missing key fails the type check.
 *
 * Text is chosen in this order: admin override (GET {API}/i18n/overrides?app=website, ISR-cached) -> the shipped
 * dictionary. Overrides are plain text and are only ever rendered as text.
 */
import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { lang } from 'next/root-params';
import en, { type Dictionary as Messages } from './dictionaries/en';
import ar from './dictionaries/ar';
import fr from './dictionaries/fr';
import bn from './dictionaries/bn';
import ru from './dictionaries/ru';
import { DEFAULT_LOCALE, dirOf, isLocale, type Locale } from './config';
import { I18N_REVALIDATE_SECONDS, I18N_TAG } from './languages';
import { setRequestLocale } from './request';

export type Dictionary = Messages;
export type { Locale };

const SHIPPED: Record<Locale, Messages> = { en, ar, fr, bn, ru };

const API_BASE = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1')
  .trim()
  .replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 4000);
let unreachableUntil = 0;
let warned = false;

/** Admin overrides for one language: { "nav.home": "Accueil", ... }. Empty on any failure. */
async function fetchOverrides(locale: Locale): Promise<Record<string, string>> {
  if (Date.now() < unreachableUntil) return {};
  try {
    const res = await fetch(`${API_BASE}/i18n/overrides?locale=${encodeURIComponent(locale)}&app=website`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: I18N_REVALIDATE_SECONDS, tags: [I18N_TAG, `${I18N_TAG}:${locale}`] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { strings?: unknown };
    const strings = body?.strings;
    if (!strings || typeof strings !== 'object' || Array.isArray(strings)) return {};
    return Object.fromEntries(
      Object.entries(strings as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch (err) {
    unreachableUntil = Date.now() + 15_000;
    if (!warned) console.warn(`[i18n] text overrides unavailable, using shipped text (${(err as Error).message})`);
    warned = true;
    return {};
  }
}

/**
 * Copy of `base` with each override written at its dotted path ("home.steps.0.title" indexes arrays). Only keys
 * that exist in the shipped dictionary and hold text are replaced, so an override can never change the shape.
 */
export function applyOverrides<T>(base: T, overrides: Record<string, string>): T {
  const keys = Object.keys(overrides);
  if (!keys.length) return base;
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  for (const key of keys) {
    const parts = key.split('.');
    let node: unknown = out;
    for (const part of parts.slice(0, -1)) {
      node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    }
    const leaf = parts[parts.length - 1]!;
    if (node && typeof node === 'object' && typeof (node as Record<string, unknown>)[leaf] === 'string') {
      (node as Record<string, unknown>)[leaf] = overrides[key];
    }
  }
  return out as unknown as T;
}

const loadDictionary = cache(async (locale: Locale): Promise<Messages> => applyOverrides(SHIPPED[locale], await fetchOverrides(locale)));

/** Language of the page being rendered (the `[lang]` root segment). Unknown codes 404. */
export async function getLocale(): Promise<Locale> {
  const value = (await lang()) as unknown;
  if (!isLocale(value)) notFound();
  return value;
}

/**
 * Dictionary for the page being rendered (or for `locale` in route handlers, which have no root params). Also sets
 * the request locale used by the Intl helpers in ./format.ts and by `href()`.
 */
export async function getDictionary(locale?: Locale): Promise<Messages> {
  const l = locale ?? (await getLocale());
  setRequestLocale(l);
  return loadDictionary(l);
}

/** Shipped (override-free) dictionary, synchronously; for build-time code such as generated images. */
export function shippedDictionary(locale: Locale = DEFAULT_LOCALE): Messages {
  return SHIPPED[locale];
}

export { dirOf };
