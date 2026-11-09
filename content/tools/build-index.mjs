#!/usr/bin/env node
/**
 * Validate every content page and (re)write content/index.json (see content/README.md, section 4).
 *
 *   node content/tools/build-index.mjs          validate + rewrite index.json
 *   node content/tools/build-index.mjs --check  validate only; exit 1 if a page is invalid or index.json is stale
 *
 * Website-only collections (validated here, NOT listed in index.json because the apps do not render them):
 *   en/procedure-city/<procedure>-<city>.md   category "procedure_city"  (intro for /treatments/.../<city>)
 *   en/cost-guides/<procedure>-<country>.md   category "cost_guide"      (intro for /costs/<procedure>/<country>)
 *   en/stories/<slug>.md                      category "story"           (consented patient stories)
 * See content/README.md, section 10 ("Website-only pages").
 *
 * Node 22, no dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.json');
const CHECK = process.argv.includes('--check');

/** The product is English only: every page lives under en/ with locale "en" and dir "ltr". */
const LOCALE = 'en';
const CATEGORIES = ['faq', 'guide', 'policy', 'city', 'procedure'];
const REQUIRED = ['slug', 'title', 'category', 'locale', 'dir', 'summary', 'updated', 'review_status', 'review_required'];
const STATUSES = ['draft', 'in_review', 'approved'];
const REVIEWS = ['medical', 'legal', 'fact_check', 'editorial'];
/** Website-only categories and the folder each must live in. */
const WEBSITE_ONLY = { procedure_city: 'en/procedure-city/', cost_guide: 'en/cost-guides/', story: 'en/stories/' };
/** Story keys that hold JSON objects/booleans instead of strings. */
const STORY_JSON_KEYS = new Set(['consent', 'draft']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** First name ("Amina") or initials ("A. K.", "AK"); never a full name. */
const STORY_NAME_RE = /^(?:[A-Z][a-z'-]{1,24}|(?:[A-Z]\.?\s?){1,3})$/;

/** Same rule as the website (src/lib/slug.ts applied to the English country name): "US" -> "united-states". */
function countrySlug(code) {
  let name = code;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    /* invalid code - reported elsewhere */
  }
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateWebsiteOnly(meta, rel, err) {
  const folder = WEBSITE_ONLY[meta.category];
  if (!rel.startsWith(folder)) err(`category "${meta.category}" pages must live in ${folder}`);
  if (meta.category === 'procedure_city' || meta.category === 'cost_guide') {
    const place = meta.category === 'procedure_city' ? 'city' : 'country';
    for (const k of ['procedure', place]) if (typeof meta[k] !== 'string' || !meta[k].trim()) err(`missing "${k}"`);
    if (meta.procedure && !SLUG_RE.test(meta.procedure)) err('procedure must be a catalogue procedure slug');
    if (place === 'city' && meta.city && !SLUG_RE.test(meta.city)) err('city must be a destination slug (e.g. "delhi-ncr")');
    if (place === 'country' && meta.country && !/^[A-Z]{2}$/.test(meta.country)) err('country must be an ISO-3166 alpha-2 code ("US")');
    const placeSlug = place === 'city' ? meta.city : countrySlug(meta.country ?? '');
    if (meta.procedure && placeSlug && meta.slug !== `${meta.procedure}-${placeSlug}`) {
      err(`slug (and file name) must be "${meta.procedure}-${placeSlug}"`);
    }
    // Indexing gate (website): approved + a real reviewer id from site/reviewers.json + reviewedAt (validateMedicalReview).
    if (meta.review_status === 'approved' && (!meta.reviewedBy || !meta.reviewedAt)) err('approved intros need "reviewedBy" (site/reviewers.json id) and "reviewedAt"');
    if (meta.reviewed_on && !DATE_RE.test(meta.reviewed_on)) err('reviewed_on must be YYYY-MM-DD');
  } else if (meta.category === 'story') {
    for (const [k, v] of Object.entries(meta)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && v.__invalid !== undefined) err(`front matter "${k}" is not valid JSON`);
    }
    if (typeof meta.name !== 'string' || !STORY_NAME_RE.test(meta.name.trim())) err('name must be a first name or initials only');
    if (typeof meta.procedure !== 'string' || !SLUG_RE.test(meta.procedure)) err('procedure must be a catalogue procedure slug');
    if (meta.hospital !== undefined && (typeof meta.hospital !== 'string' || !SLUG_RE.test(meta.hospital))) err('hospital must be a hospital slug');
    if (typeof meta.reviewedBy !== 'string' || !meta.reviewedBy.trim()) err('missing "reviewedBy"');
    if (meta.draft !== undefined && typeof meta.draft !== 'boolean') err('draft must be true or false (no quotes)');
    const c = meta.consent;
    const consentOk = c && typeof c === 'object' && c.obtained === true && typeof c.date === 'string' && DATE_RE.test(c.date) && c.scope === 'website';
    // A story without website consent is invalid even as a draft: it must never enter the repository.
    if (!consentOk) err('consent must be {"obtained": true, "date": "YYYY-MM-DD", "scope": "website"}');
  }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'tools' && !e.name.startsWith('.')) walk(full, out);
    } else if (e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md') out.push(full);
  }
  return out;
}

function parse(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    try {
      meta[key] = JSON.parse(value);
    } catch {
      meta[key] = { __invalid: value };
    }
  }
  return { meta, body: raw.slice(m[0].length) };
}

/**
 * Medical reviewers (content/README.md, "Medical reviewers"): ids from site/reviewers.json, and the ids that are real
 * (not "placeholder": true, with name, credentials, registration number and council). Core pages may set
 * reviewedBy + reviewedAt + sources; published health pages without a real reviewer only produce a warning.
 */
function loadReviewers() {
  const file = path.join(ROOT, 'site', 'reviewers.json');
  const all = new Set();
  const real = new Set();
  if (!fs.existsSync(file)) return { all, real };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  for (const r of Array.isArray(data.reviewers) ? data.reviewers : []) {
    if (!r || !s(r.id)) continue;
    all.add(r.id);
    const complete = s(r.name) && s(r.credentials) && s(r.registration?.number) && s(r.registration?.council);
    if (r.placeholder !== true && complete && !/placeholder/i.test(`${r.name} ${r.credentials} ${r.registration?.council}`)) real.add(r.id);
  }
  return { all, real };
}
const reviewers = loadReviewers();

function validateMedicalReview(meta, rel, err, warn) {
  if (meta.sources !== undefined) {
    const ok =
      Array.isArray(meta.sources) &&
      meta.sources.every((x) => x && typeof x.title === 'string' && x.title.trim() && /^https:\/\/\S+$/.test(x.url ?? ''));
    if (!ok) err('sources must be a list of {"title": "...", "url": "https://..."}');
  }
  if (meta.reviewedBy !== undefined && !reviewers.all.has(meta.reviewedBy)) err(`reviewedBy "${meta.reviewedBy}" is not an id in site/reviewers.json`);
  if (meta.reviewedAt !== undefined && !DATE_RE.test(meta.reviewedAt)) err('reviewedAt must be YYYY-MM-DD');
  const medical = String(meta.review_required ?? '').split(',').map((x) => x.trim()).includes('medical');
  if (meta.review_status === 'approved' && medical && !(reviewers.real.has(meta.reviewedBy) && DATE_RE.test(meta.reviewedAt ?? ''))) {
    warn(`${rel}: published health page has no real medical reviewer (set reviewedBy + reviewedAt; placeholders are never shown)`);
  }
}

const errors = [];
const warnings = [];
const pages = [];
const files = walk(ROOT);
const known = new Set(files.map((f) => path.relative(ROOT, f).split(path.sep).join('/')));

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const err = (msg) => errors.push(`${rel}: ${msg}`);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = parse(raw);
  if (!parsed) {
    err('missing front matter');
    continue;
  }
  const { meta, body } = parsed;
  const websiteOnly = Object.hasOwn(WEBSITE_ONLY, meta.category);
  for (const [k, v] of Object.entries(meta)) {
    if (meta.category === 'story' && STORY_JSON_KEYS.has(k)) continue;
    if (k === 'sources' && Array.isArray(v)) continue; // the one list key (validateMedicalReview)
    if (v !== undefined && typeof v !== 'string') err(`front matter "${k}" must be a JSON string`);
  }
  const required = meta.category === 'story' ? REQUIRED.filter((k) => k !== 'review_status' && k !== 'review_required') : REQUIRED;
  for (const k of required) if (typeof meta[k] !== 'string' || !meta[k].trim()) err(`missing "${k}"`);
  const folderLocale = rel.split('/')[0];
  if (folderLocale !== LOCALE) err('page must live under en/ (content is English only)');
  if (meta.locale !== LOCALE) err(`locale must be "${LOCALE}"`);
  if (meta.dir !== 'ltr') err('dir must be ltr');
  if (meta.slug !== path.basename(file, '.md')) err(`slug "${meta.slug}" must equal the file name`);
  if (!CATEGORIES.includes(meta.category) && !websiteOnly) err(`unknown category "${meta.category}"`);
  if (websiteOnly) validateWebsiteOnly(meta, rel, err);
  if (meta.category !== 'story' && !STATUSES.includes(meta.review_status)) err(`unknown review_status "${meta.review_status}"`);
  if (meta.review_status === 'approved' && !meta.reviewed_on) err('approved pages need "reviewed_on"');
  for (const r of String(meta.review_required ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!REVIEWS.includes(r)) err(`unknown review "${r}"`);
  }
  if (meta.updated && !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) err('updated must be YYYY-MM-DD');
  if (meta.summary && (meta.summary.length > 260 || /[*_`[\]]/.test(meta.summary))) err('summary must be short plain text');
  if (meta.category === 'procedure' && (!meta.specialty || !meta.catalog_slug)) err('procedures need "specialty" and "catalog_slug"');
  if (meta.category === 'city' && !meta.catalog_cities) err('city guides need "catalog_cities"');

  const firstLine = body.replace(/^\s+/, '').split(/\r?\n/)[0] ?? '';
  if (firstLine !== `# ${meta.title}`) err('first body line must be "# <title>"');
  if (/<[a-z][\s\S]*?>/i.test(body.replace(/`[^`]*`/g, ''))) err('raw HTML is not allowed');
  if (/!\[/.test(body)) err('images are not allowed');
  if (/^#{4,}\s/m.test(body)) err('headings deeper than ### are not allowed');
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^https:\/\//.test(target)) continue;
    if (/^[a-z]+:/i.test(target) || target.startsWith('//')) {
      err(`only https:// external links are allowed (${target})`);
      continue;
    }
    const [p] = target.split('#');
    if (!p) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), p));
    if (!known.has(resolved)) err(`broken link ${target}`);
  }

  if (meta.category !== 'story') validateMedicalReview(meta, rel, err, (w) => warnings.push(w));
  if (websiteOnly) continue; // validated, but not part of the apps' index.json

  pages.push({
    slug: meta.slug,
    title: meta.title,
    category: meta.category,
    locale: meta.locale,
    path: rel,
    summary: meta.summary,
  });
}

const order = (a, b) =>
  CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
  a.slug.localeCompare(b.slug);
pages.sort(order);
const json = `${JSON.stringify(pages, null, 2)}\n`;

if (warnings.length) console.warn(`${warnings.length} warning(s):\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
if (errors.length) {
  console.error(`${errors.length} problem(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
if (CHECK) {
  const current = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
  if (current !== json) {
    console.error('index.json is stale - run: node content/tools/build-index.mjs');
    process.exit(1);
  }
  console.log(`OK: ${pages.length} pages valid, index.json up to date.`);
} else {
  fs.writeFileSync(INDEX, json);
  console.log(`Wrote ${pages.length} entries to index.json.`);
}
