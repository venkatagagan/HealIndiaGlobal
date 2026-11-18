#!/usr/bin/env node
/**
 * Consistency check for the web translation catalogs (src/locales/<lng>/<ns>.json):
 * - every language has the same keys as English (plural keys compare by base name: "items_one"/"items_other"
 *   in English may be "items_zero".."items_many" in Arabic or Russian);
 * - placeholders ({{name}}, {name}) and <0>Trans</0> tags of the English text are kept;
 * - no HTML in any string (overrides and catalogs are rendered as text).
 *
 *   node scripts/i18n/check-catalogs.mjs            # all web catalogs
 *   node scripts/i18n/check-catalogs.mjs web/apps/patient-web/src/locales   # one directory
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIRS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'web/packages/shared/src/locales',
      'web/apps/patient-web/src/locales',
      'web/apps/agent-portal/src/locales',
      'web/apps/hospital-portal/src/locales',
      'web/apps/admin-portal/src/locales',
    ];
const LANGS = ['ar', 'fr', 'bn', 'ru'];
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(value, prefix, out) {
  if (typeof value === 'string') out[prefix] = value;
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

const tokens = (text) =>
  [...text.matchAll(/\{\{\s*[\w.]+\s*\}\}|\{\w+\}|<\/?\d+\/?>/g)].map((m) => m[0].replace(/\s+/g, '')).sort();
const base = (key) => key.replace(PLURAL, '');

let problems = 0;
const report = (msg) => {
  problems += 1;
  if (problems <= 200) console.error(msg);
};

for (const rel of DIRS) {
  const dir = path.join(ROOT, rel);
  const enDir = path.join(dir, 'en');
  if (!fs.existsSync(enDir)) continue;
  for (const file of fs.readdirSync(enDir).filter((f) => f.endsWith('.json'))) {
    const en = flatten(JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8')), '', {});
    const enBases = new Map();
    for (const [k, v] of Object.entries(en)) {
      if (/<[a-z][^>]*>/i.test(v)) report(`${rel}/en/${file}: HTML in "${k}"`);
      const list = enBases.get(base(k)) ?? [];
      list.push(v);
      enBases.set(base(k), list);
    }
    for (const lng of LANGS) {
      const target = path.join(dir, lng, file);
      if (!fs.existsSync(target)) {
        report(`${rel}/${lng}/${file}: missing file`);
        continue;
      }
      let data;
      try {
        data = flatten(JSON.parse(fs.readFileSync(target, 'utf8')), '', {});
      } catch (error) {
        report(`${rel}/${lng}/${file}: invalid JSON (${error.message})`);
        continue;
      }
      const bases = new Set(Object.keys(data).map(base));
      for (const b of enBases.keys()) if (!bases.has(b)) report(`${rel}/${lng}/${file}: missing "${b}"`);
      for (const [k, v] of Object.entries(data)) {
        const sources = enBases.get(base(k));
        if (!sources) {
          report(`${rel}/${lng}/${file}: extra key "${k}"`);
          continue;
        }
        if (typeof v !== 'string' || !v.trim()) report(`${rel}/${lng}/${file}: empty "${k}"`);
        if (/<[a-z][^>]*>/i.test(v)) report(`${rel}/${lng}/${file}: HTML in "${k}"`);
        const want = new Set(sources.flatMap(tokens));
        const got = tokens(v);
        for (const t of got) if (!want.has(t)) report(`${rel}/${lng}/${file}: unknown placeholder ${t} in "${k}"`);
        // the English plural forms may drop {{count}} in "_one"; only require tokens common to all forms
        const required = sources.map(tokens).reduce((a, b) => a.filter((t) => b.includes(t)));
        for (const t of required) if (!got.includes(t)) report(`${rel}/${lng}/${file}: lost placeholder ${t} in "${k}"`);
      }
    }
  }
}

if (problems) {
  console.error(`\n${problems} catalog problem(s)`);
  process.exit(1);
}
console.log('catalogs OK');
