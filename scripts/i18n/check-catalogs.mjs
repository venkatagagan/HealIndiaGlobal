#!/usr/bin/env node
/**
 * Consistency check for the web translation catalogs (src/locales/<lng>/<ns>.json):
 * - every language has the same keys as English (plural keys compare by base name: "items_one"/"items_other"
 *   in English may be "items_zero".."items_many" in Arabic or Russian);
 * - placeholders ({{name}}, {name}) and <0>Trans</0> tags of the English text are kept;
 * - no HTML in any string (overrides and catalogs are rendered as text).
 * Mobile (Flutter gen-l10n, mobile/lib/l10n/app_<lng>.arb):
 * - every language has exactly the English message keys, "@@locale" matches the file name, no empty values;
 * - every placeholder declared in English ("@key".placeholders: {name}, {count, plural, ...}) is used by the
 *   translation, no other ICU argument is introduced, and braces are balanced.
 *
 *   node scripts/i18n/check-catalogs.mjs            # all web catalogs + the mobile ARB files
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

// ---- mobile ARB files -------------------------------------------------------------------------------
const ARB_DIR = 'mobile/lib/l10n';
// ICU argument names used by a message: {name}, {count, plural, one{...} other{...}}, {g, select, ...},
// {n, number}. A small parser, so plural/select branch texts such as "other{days}" are not mistaken for
// arguments. ICU quoting ('{') is honoured. Returns null when the message cannot be parsed.
const icuArguments = (text) => {
  const names = new Set();
  let i = 0;
  const skipSpace = () => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  };
  const readUntil = (stops) => {
    const start = i;
    while (i < text.length && !stops.includes(text[i])) i += 1;
    return text.slice(start, i).trim();
  };
  function message(nested) {
    while (i < text.length) {
      const ch = text[i];
      if (ch === "'" && (text[i + 1] === '{' || text[i + 1] === '}' || text[i + 1] === "'")) {
        const end = text.indexOf("'", i + 1);
        i = end === -1 ? text.length : end + 1;
      } else if (ch === '{') {
        i += 1;
        argument();
      } else if (ch === '}') {
        if (!nested) throw new Error('unbalanced }');
        return;
      } else {
        i += 1;
      }
    }
    if (nested) throw new Error('unbalanced {');
  }
  function argument() {
    const name = readUntil([',', '}']);
    if (i >= text.length) throw new Error('unterminated argument');
    if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`bad argument "${name}"`);
    names.add(name);
    if (text[i] === '}') {
      i += 1;
      return;
    }
    i += 1; // ','
    const type = readUntil([',', '}']);
    if (text[i] === '}') {
      i += 1;
      return;
    }
    i += 1; // ','
    if (!['plural', 'select', 'selectordinal'].includes(type)) {
      readUntil(['}']); // number/date style
      i += 1;
      return;
    }
    for (;;) {
      skipSpace();
      if (text[i] === '}') {
        i += 1;
        return;
      }
      const selector = readUntil(['{', '}']);
      if (text[i] !== '{' || !selector) throw new Error(`bad ${type} branch`);
      i += 1;
      message(true);
      i += 1; // branch '}'
    }
  }
  try {
    message(false);
  } catch {
    return null;
  }
  return names;
};

function checkArb() {
  const dir = path.join(ROOT, ARB_DIR);
  const enPath = path.join(dir, 'app_en.arb');
  if (!fs.existsSync(enPath)) return;
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const messages = Object.keys(en).filter((k) => !k.startsWith('@'));
  const declared = (key) => Object.keys(en[`@${key}`]?.placeholders ?? {});
  for (const key of messages) {
    if (!icuArguments(String(en[key]))) report(`${ARB_DIR}/app_en.arb: invalid ICU message "${key}"`);
  }
  for (const lng of LANGS) {
    const file = `app_${lng}.arb`;
    const target = path.join(dir, file);
    if (!fs.existsSync(target)) {
      report(`${ARB_DIR}/${file}: missing file`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (error) {
      report(`${ARB_DIR}/${file}: invalid JSON (${error.message})`);
      continue;
    }
    if (data['@@locale'] !== undefined && data['@@locale'] !== lng) {
      report(`${ARB_DIR}/${file}: "@@locale" is "${data['@@locale']}", expected "${lng}"`);
    }
    const keys = new Set(Object.keys(data).filter((k) => !k.startsWith('@')));
    for (const key of messages) if (!keys.has(key)) report(`${ARB_DIR}/${file}: missing "${key}"`);
    for (const key of keys) {
      if (!(key in en)) {
        report(`${ARB_DIR}/${file}: extra key "${key}"`);
        continue;
      }
      const text = data[key];
      if (typeof text !== 'string' || !text.trim()) {
        report(`${ARB_DIR}/${file}: empty "${key}"`);
        continue;
      }
      const got = icuArguments(text);
      if (!got) {
        report(`${ARB_DIR}/${file}: invalid ICU message "${key}" (braces / plural / select syntax)`);
        continue;
      }
      const allowed = new Set([...declared(key), ...(icuArguments(String(en[key])) ?? [])]);
      for (const name of declared(key)) {
        if (!got.has(name)) report(`${ARB_DIR}/${file}: lost placeholder {${name}} in "${key}"`);
      }
      for (const name of got) {
        if (!allowed.has(name)) report(`${ARB_DIR}/${file}: unknown placeholder {${name}} in "${key}"`);
      }
    }
  }
}

// The mobile check runs with the default (no-argument) invocation used by CI.
if (process.argv.slice(2).length === 0) checkArb();

if (problems) {
  console.error(`\n${problems} catalog problem(s)`);
  process.exit(1);
}
console.log('catalogs OK');
