#!/usr/bin/env node
/**
 * Export the shipped translation catalogs of every client app into backend/app/i18n/catalogs/<app>.json so the
 * admin portal's Translations page (served by the API) can list every key with its English text, the shipped
 * translation and the admin override, and so the API can compute completeness per language.
 *
 *   node scripts/i18n/export-catalogs.mjs           # write the files
 *   node scripts/i18n/export-catalogs.mjs --check   # exit 1 when a committed export is stale (CI)
 *
 * Output shape (keys are flat):
 *   { "app": "patient_web", "locales": { "en": { "patient:nav.home": "Home", ... }, "ar": { ... } } }
 * Web apps: key = "<namespace>:<dotted.path>" (the shared common/docai/voice namespaces are included in every
 * web app, because overrides are stored per app). Website: key = "<dotted.path>" (written by
 * website/scripts/export-i18n.mjs, run from here). Server strings are read directly from backend/app/i18n/*.json.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'backend', 'app', 'i18n', 'catalogs');
const CHECK = process.argv.includes('--check');

const WEB_APPS = {
  patient_web: 'web/apps/patient-web/src/locales',
  agent: 'web/apps/agent-portal/src/locales',
  hospital: 'web/apps/hospital-portal/src/locales',
  admin: 'web/apps/admin-portal/src/locales',
};
const SHARED = 'web/packages/shared/src/locales';

function flatten(value, prefix, out) {
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function readLocaleDir(rel, locales) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  for (const lng of fs.readdirSync(dir).sort()) {
    const lngDir = path.join(dir, lng);
    if (!fs.statSync(lngDir).isDirectory()) continue;
    for (const file of fs.readdirSync(lngDir).sort()) {
      if (!file.endsWith('.json')) continue;
      const ns = file.slice(0, -'.json'.length);
      const data = JSON.parse(fs.readFileSync(path.join(lngDir, file), 'utf8'));
      const flat = flatten(data, '', {});
      const target = (locales[lng] ??= {});
      for (const [key, text] of Object.entries(flat)) target[`${ns}:${key}`] = text;
    }
  }
}

function sortObject(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

function serialise(app, locales) {
  const sorted = {};
  for (const lng of Object.keys(locales).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)))) {
    sorted[lng] = sortObject(locales[lng]);
  }
  return `${JSON.stringify({ app, locales: sorted }, null, 1)}\n`;
}

const outputs = {};
for (const [app, rel] of Object.entries(WEB_APPS)) {
  const locales = {};
  readLocaleDir(SHARED, locales);
  readLocaleDir(rel, locales);
  outputs[app] = serialise(app, locales);
}

// Website dictionaries (TypeScript modules) are exported by the website's own script, which prints JSON.
const websiteScript = path.join(ROOT, 'website', 'scripts', 'export-i18n.mjs');
if (fs.existsSync(websiteScript)) {
  const json = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', websiteScript], {
    cwd: path.join(ROOT, 'website'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const locales = JSON.parse(json);
  outputs.website = serialise('website', locales);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let stale = 0;
for (const [app, text] of Object.entries(outputs)) {
  const file = path.join(OUT_DIR, `${app}.json`);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  if (CHECK) {
    console.error(`stale: ${path.relative(ROOT, file)} (run: node scripts/i18n/export-catalogs.mjs)`);
    stale += 1;
  } else {
    fs.writeFileSync(file, text);
    const counts = Object.entries(JSON.parse(text).locales).map(([lng, keys]) => `${lng}=${Object.keys(keys).length}`);
    console.log(`wrote ${path.relative(ROOT, file)} (${counts.join(', ')})`);
  }
}
if (stale) process.exit(1);
if (CHECK) console.log('translation catalog exports are up to date');
