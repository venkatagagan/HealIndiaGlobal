#!/usr/bin/env node
/**
 * Print the website's UI dictionaries as flat JSON for the admin Translations page:
 *   {"en": {"nav.home": "Home", "home.steps.0.title": "...", ...}, "ar": {...}, "fr": {...}, "bn": {...}, "ru": {...}}
 *
 * Keys are the dotted path into the dictionary (array items by index), the same keys the website accepts as admin
 * overrides (GET /api/v1/i18n/overrides?app=website, applied in src/i18n/index.ts).
 *
 * Run by ../../scripts/i18n/export-catalogs.mjs as
 *   node --experimental-strip-types --no-warnings website/scripts/export-i18n.mjs   (cwd = website)
 * The dictionaries are erasable-TypeScript data modules (type-only imports, no runtime imports), so Node loads them
 * directly with type stripping.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DICTIONARIES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'dictionaries');
const LOCALES = ['en', 'ar', 'fr', 'bn', 'ru'];

function flatten(value, prefix, out) {
  if (typeof value === 'string') {
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    value.forEach((child, i) => flatten(child, prefix ? `${prefix}.${i}` : String(i), out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const result = {};
for (const locale of LOCALES) {
  const mod = await import(pathToFileURL(path.join(DICTIONARIES, `${locale}.ts`)).href);
  result[locale] = flatten(mod.default, '', {});
}
process.stdout.write(`${JSON.stringify(result)}\n`);
