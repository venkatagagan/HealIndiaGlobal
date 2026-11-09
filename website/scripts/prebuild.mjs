#!/usr/bin/env node
/**
 * Pre-build/pre-dev sync for the public website. Never modifies anything outside website/.
 *
 * 1. Long-form Markdown: ../content/**.md  -> content-snapshot/content/  (images -> public/content-assets/)
 * 2. Legal drafts:       ../docs/legal/*.md -> content-snapshot/legal/
 * 3. Brand assets:       ../design/** (web images) -> public/brand/ + src/data/brand-manifest.json
 * 4. Marketing claims:   ../content/site/marketing.json -> src/data/marketing.json (editable claims, INTEGRATION_BACKLOG #14)
 *    Medical reviewers:  ../content/site/reviewers.json -> src/data/reviewers.json (health-page review bylines)
 * 5. Fallback catalogue: src/data/seed-data.json is (re)exported from ../backend/scripts/seed_data when a Python
 *    interpreter is configured (PYTHON env var or backend/.venv) and the seed is newer - or always with --seed.
 *
 * When a source folder is missing (e.g. a Docker build whose context is only website/), the previously synced
 * snapshot is kept, so builds are reproducible from the website folder alone.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const args = new Set(process.argv.slice(2));

const CONTENT_SRC = path.resolve(root, process.env.CONTENT_SOURCE_DIR || path.join(repo, 'content'));
const LEGAL_SRC = path.resolve(root, process.env.LEGAL_SOURCE_DIR || path.join(repo, 'docs', 'legal'));
const DESIGN_SRC = path.resolve(root, process.env.DESIGN_SOURCE_DIR || path.join(repo, 'design'));
const SEED_SRC = path.join(repo, 'backend', 'scripts', 'seed_data');

const SNAPSHOT = path.join(root, 'content-snapshot');
const CONTENT_OUT = path.join(SNAPSHOT, 'content');
const LEGAL_OUT = path.join(SNAPSHOT, 'legal');
const CONTENT_ASSETS_OUT = path.join(root, 'public', 'content-assets');
const BRAND_OUT = path.join(root, 'public', 'brand');
const BRAND_MANIFEST = path.join(root, 'src', 'data', 'brand-manifest.json');
const SEED_JSON = path.join(root, 'src', 'data', 'seed-data.json');
const MARKETING_SRC = path.join(CONTENT_SRC, 'site', 'marketing.json');
const MARKETING_JSON = path.join(root, 'src', 'data', 'marketing.json');
const REVIEWERS_SRC = path.join(CONTENT_SRC, 'site', 'reviewers.json');
const REVIEWERS_JSON = path.join(root, 'src', 'data', 'reviewers.json');

const MARKDOWN = new Set(['.md', '.markdown']);
const WEB_IMAGES = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico']);
const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '__pycache__', '.venv']);

const log = (msg) => console.log(`[sync] ${msg}`);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------------------------- content
function syncContent() {
  if (!isDir(CONTENT_SRC)) {
    log(`content: ${CONTENT_SRC} not found - keeping existing snapshot`);
    return;
  }
  const files = walk(CONTENT_SRC);
  resetDir(CONTENT_OUT);
  resetDir(CONTENT_ASSETS_OUT);
  let md = 0;
  let img = 0;
  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    const src = path.join(CONTENT_SRC, rel);
    if (MARKDOWN.has(ext)) {
      copyFile(src, path.join(CONTENT_OUT, rel));
      md += 1;
    } else if (WEB_IMAGES.has(ext) && fs.statSync(src).size <= MAX_ASSET_BYTES) {
      copyFile(src, path.join(CONTENT_ASSETS_OUT, rel));
      img += 1;
    }
  }
  log(`content: ${md} markdown file(s), ${img} image(s) from ${CONTENT_SRC}`);
}

// ------------------------------------------------------------------------------------------------ legal
function syncLegal() {
  if (!isDir(LEGAL_SRC)) {
    log(`legal: ${LEGAL_SRC} not found - keeping existing snapshot`);
    return;
  }
  resetDir(LEGAL_OUT);
  let n = 0;
  for (const rel of walk(LEGAL_SRC)) {
    if (!MARKDOWN.has(path.extname(rel).toLowerCase())) continue;
    copyFile(path.join(LEGAL_SRC, rel), path.join(LEGAL_OUT, rel));
    n += 1;
  }
  log(`legal: ${n} markdown file(s) from ${LEGAL_SRC}`);
}

// ----------------------------------------------------------------------------------------------- design
function syncDesign() {
  if (!isDir(DESIGN_SRC)) {
    log(`design: ${DESIGN_SRC} not found - keeping existing brand assets`);
    if (!fs.existsSync(BRAND_MANIFEST)) writeJson(BRAND_MANIFEST, { generated_at: null, files: [] });
    return;
  }
  resetDir(BRAND_OUT);
  const files = [];
  for (const rel of walk(DESIGN_SRC)) {
    const ext = path.extname(rel).toLowerCase();
    if (!WEB_IMAGES.has(ext)) continue;
    const src = path.join(DESIGN_SRC, rel);
    const size = fs.statSync(src).size;
    if (size > MAX_ASSET_BYTES) continue;
    copyFile(src, path.join(BRAND_OUT, rel));
    files.push({ path: `/brand/${toPosix(rel)}`, bytes: size });
  }
  writeJson(BRAND_MANIFEST, { generated_at: new Date().toISOString(), files });
  log(`design: ${files.length} web asset(s) from ${DESIGN_SRC}`);
}

// ------------------------------------------------------------------------------------------------- seed
function newestMtime(dir) {
  let newest = 0;
  for (const rel of walk(dir)) {
    if (!rel.endsWith('.py')) continue;
    newest = Math.max(newest, fs.statSync(path.join(dir, rel)).mtimeMs);
  }
  return newest;
}

function findPython() {
  const candidates = [
    process.env.PYTHON,
    path.join(repo, 'backend', '.venv', 'Scripts', 'python.exe'),
    path.join(repo, 'backend', '.venv', 'bin', 'python'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function syncSeed() {
  const force = args.has('--seed');
  if (!isDir(SEED_SRC)) {
    log('seed: backend seed data not found - using committed src/data/seed-data.json');
    ensureSeedFile();
    return;
  }
  const jsonMtime = fs.existsSync(SEED_JSON) ? fs.statSync(SEED_JSON).mtimeMs : 0;
  if (!force && jsonMtime >= newestMtime(SEED_SRC)) {
    log('seed: src/data/seed-data.json is up to date');
    return;
  }
  const python = findPython();
  if (!python) {
    log('seed: no Python interpreter configured (set PYTHON=...) - keeping committed seed-data.json');
    ensureSeedFile();
    return;
  }
  // -I isolated mode, -B: never write __pycache__ into backend/.
  const res = spawnSync(python, ['-I', '-B', path.join(root, 'scripts', 'export-seed.py')], {
    stdio: 'inherit',
    timeout: 60_000,
  });
  if (res.status !== 0) log('seed: export failed - keeping previous seed-data.json');
  ensureSeedFile();
}

function ensureSeedFile() {
  if (!fs.existsSync(SEED_JSON)) {
    // An empty object makes the website fall back to its small built-in fictional dataset.
    writeJson(SEED_JSON, {});
    log('seed: wrote empty seed-data.json (built-in sample data will be used)');
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`, 'utf8');
}

/** Marketing claims are content (editable without code changes); invalid JSON fails the build loudly. */
function syncMarketing() {
  if (!fs.existsSync(MARKETING_SRC)) {
    if (!fs.existsSync(MARKETING_JSON)) writeJson(MARKETING_JSON, {});
    log(`marketing: ${MARKETING_SRC} not found - keeping existing marketing.json`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(MARKETING_SRC, 'utf8'));
  writeJson(MARKETING_JSON, data);
  log(`marketing: claims synced (claims_verified=${data.claims_verified === true})`);
}

/** Medical reviewers credited on health pages; invalid JSON fails the build loudly. */
function syncReviewers() {
  if (!fs.existsSync(REVIEWERS_SRC)) {
    if (!fs.existsSync(REVIEWERS_JSON)) writeJson(REVIEWERS_JSON, { reviewers: [] });
    log(`reviewers: ${REVIEWERS_SRC} not found - keeping existing reviewers.json`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(REVIEWERS_SRC, 'utf8'));
  writeJson(REVIEWERS_JSON, data);
  const list = Array.isArray(data.reviewers) ? data.reviewers : [];
  log(`reviewers: ${list.filter((r) => r && r.placeholder !== true).length} real, ${list.filter((r) => r?.placeholder === true).length} placeholder`);
}

fs.mkdirSync(SNAPSHOT, { recursive: true });
syncContent();
syncMarketing();
syncReviewers();
syncLegal();
syncDesign();
syncSeed();
