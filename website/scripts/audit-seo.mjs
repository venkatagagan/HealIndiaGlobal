#!/usr/bin/env node
/**
 * SEO / quality audit for the public website (see SEO.md).
 *
 *   npm run audit:seo                       build into .next-audit, start it on :3101, crawl + Lighthouse, stop it
 *   npm run audit:seo -- --no-build         reuse the last .next-audit build
 *   npm run audit:seo -- --base http://localhost:3000   audit a running server (nothing is built or started)
 *   npm run audit:seo -- --mobile           Lighthouse mobile preset (default: desktop)
 *   npm run audit:seo -- --only home,faq    Lighthouse only these page types (the crawl still runs)
 *   npm run audit:seo -- --strict           exit 1 when an indexable page scores SEO < 100 or a crawl check fails
 *
 * 1. Production build (`next build`, NEXT_DIST_DIR=.next-audit so a running `next dev` is not disturbed) and
 *    `next start -p 3101` with SITE_REQUIRE_LIVE_DATA=false. Draft content is included so that every page type
 *    exists; draft pages are noindex by design, so their SEO score is also shown without the `is-crawlable` audit.
 * 2. Crawl: follows internal links from the home page (max --max-pages) and checks every HTML page for title and
 *    description length + uniqueness, one h1, heading order, canonical, OpenGraph/Twitter tags, JSON-LD validity
 *    (required properties per schema.org type), image alt/size attributes, generic link text, and internal links
 *    that redirect or fail.
 * 3. Lighthouse (performance, accessibility, best-practices, seo) on one page per page type, using the Playwright
 *    Chromium in ../.devtools/ms-playwright (or CHROME_PATH).
 *
 * Output: .lighthouse/summary.md (tables), .lighthouse/summary.json, .lighthouse/<type>.report.json.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const OUT = path.join(root, '.lighthouse');

// ------------------------------------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PORT = Number(option('port', '3101'));
const EXTERNAL_BASE = option('base', '');
const BASE = (EXTERNAL_BASE || `http://localhost:${PORT}`).replace(/\/+$/, '');
const MOBILE = flag('mobile');
const STRICT = flag('strict');
const NO_BUILD = flag('no-build');
const NO_LIGHTHOUSE = flag('no-lighthouse');
const MAX_PAGES = Number(option('max-pages', '400'));
const ONLY = option('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DIST = '.next-audit';

/** Page types: the first crawled URL matching `re` is audited with Lighthouse. */
const PAGE_TYPES = [
  { type: 'home', re: /^\/$/ },
  { type: 'treatments-hub', re: /^\/treatments$/ },
  { type: 'specialty', re: /^\/treatments\/[^/]+$/ },
  { type: 'procedure', re: /^\/treatments\/[^/]+\/[^/]+$/ },
  { type: 'procedure-city', re: /^\/treatments\/[^/]+\/[^/]+\/[^/]+$/ },
  { type: 'costs-hub', re: /^\/costs$/ },
  { type: 'cost-guide', re: /^\/costs\/[^/]+\/[^/]+$/ },
  { type: 'hospitals-list', re: /^\/hospitals$/ },
  { type: 'hospital', re: /^\/hospitals\/[^/]+$/ },
  { type: 'doctors-list', re: /^\/doctors$/ },
  { type: 'doctor', re: /^\/doctors\/[^/]+$/ },
  { type: 'destinations', re: /^\/destinations$/ },
  { type: 'destination', re: /^\/destinations\/[^/]+$/ },
  { type: 'guides', re: /^\/guides$/ },
  { type: 'guide', re: /^\/guides\/[^/]+$/ },
  { type: 'stories', re: /^\/stories$/ },
  { type: 'story', re: /^\/stories\/[^/]+$/ },
  { type: 'faq', re: /^\/faq$/ },
  { type: 'about', re: /^\/about$/ },
  { type: 'contact', re: /^\/contact$/ },
  { type: 'for-hospitals', re: /^\/for-hospitals$/ },
  { type: 'for-agents', re: /^\/for-agents$/ },
  { type: 'terms', re: /^\/terms$/ },
  { type: 'privacy', re: /^\/privacy$/ },
  { type: 'refund-policy', re: /^\/refund-policy$/ },
  { type: 'account-delete', re: /^\/account\/delete$/ },
];
/** Always fetched, even when nothing links to them. */
const SEEDS = ['/', '/treatments', '/costs', '/stories', '/guides', '/destinations', '/account/delete', '/refund-policy'];
const NOT_FOUND_PATH = '/this-page-does-not-exist-404-check';
/** Never crawled (auth door, staff door, API, Next internals, files). */
const SKIP = /^\/(api|_next|gahi|login|register|forgot-password|reset-password|verify-email|accept-invite|search)(\/|$)|\.(xml|txt|json|svg|png|jpe?g|webp|avif|ico|webmanifest|pdf)$/i;

// ------------------------------------------------------------------------------------------------- helpers
const log = (msg) => console.log(`[audit] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

function auditEnv() {
  return {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_DIST_DIR: DIST,
    NEXT_PUBLIC_SITE_URL: BASE,
    SITE_REQUIRE_LIVE_DATA: 'false',
    SITE_NOINDEX: 'false',
    // Every page type must exist for the audit; draft pages carry a banner and noindex (reported separately).
    CONTENT_INCLUDE_DRAFTS: process.env.CONTENT_INCLUDE_DRAFTS ?? 'true',
    LEGAL_SHOW_DRAFTS: process.env.LEGAL_SHOW_DRAFTS ?? 'true',
  };
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const pw = path.join(repo, '.devtools', 'ms-playwright');
  if (fs.existsSync(pw)) {
    const dirs = fs.readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(pw, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined; // chrome-launcher then looks for an installed Chrome
}

async function waitForServer(url, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`server at ${url} did not start`);
}

// ---------------------------------------------------------------------------------------------- HTML checks
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? '') : null;
};
const meta = (html, key, value) => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) if (attr(m[0], key) === value) return attr(m[0], 'content');
  return null;
};
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Required/recommended properties per schema.org type (Google rich-result requirements where they exist). */
const LD_REQUIRED = {
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  Question: ['name', 'acceptedAnswer'],
  Answer: ['text'],
  Hospital: ['name', 'address'],
  MedicalClinic: ['name', 'address'],
  Physician: ['name'],
  MedicalProcedure: ['name'],
  MedicalWebPage: ['name', 'url'],
  WebPage: ['name', 'url'],
  CollectionPage: ['name', 'url'],
  AboutPage: ['name', 'url'],
  ContactPage: ['name', 'url'],
  ItemList: ['itemListElement'],
  ListItem: ['position'],
  Article: ['headline'],
  MedicalScholarlyArticle: ['headline'],
  Person: ['name'],
  PostalAddress: ['addressCountry'],
  City: ['name'],
  TouristDestination: ['name'],
  Place: ['name'],
};

function checkLd(node, problems, types, where = '', warnings = problems) {
  if (Array.isArray(node)) return node.forEach((n, i) => checkLd(n, problems, types, `${where}[${i}]`, warnings));
  if (!node || typeof node !== 'object') return;
  const t = node['@type'];
  for (const type of Array.isArray(t) ? t : t ? [t] : []) {
    types.add(type);
    for (const prop of LD_REQUIRED[type] ?? []) {
      if (node[prop] === undefined || node[prop] === '' || (Array.isArray(node[prop]) && !node[prop].length)) {
        problems.push(`JSON-LD ${type}${where} missing "${prop}"`);
      }
    }
    if (type === 'BreadcrumbList') {
      (node.itemListElement ?? []).forEach((li, i) => {
        if (li.position !== i + 1 || !li.name || (!li.item && i < node.itemListElement.length - 1)) problems.push(`JSON-LD BreadcrumbList item ${i + 1} invalid`);
      });
    }
    if (type === 'AggregateRating' || type === 'Review') warnings.push(`JSON-LD contains ${type}: allowed only for real reviews shown on the page`);
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === '@context') continue;
    if (typeof v === 'string' && /^(https?:)?\/\//.test(v) === false && ['url', 'item', '@id', 'logo', 'image'].includes(k) && v && !v.startsWith('http')) {
      problems.push(`JSON-LD ${k} is not an absolute URL: ${v.slice(0, 60)}`);
    }
    if (v && typeof v === 'object') checkLd(v, problems, types, `${where}.${k}`, warnings);
  }
}

const GENERIC_LINK_TEXT = new Set(['click here', 'here', 'read more', 'learn more', 'more', 'link', 'this', 'go', 'start', 'right here', 'click this', 'continue']);

function analyse(url, html, headers) {
  const problems = [];
  const warnings = [];
  const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const description = meta(html, 'name', 'description') ?? '';
  const robots = (meta(html, 'name', 'robots') ?? '') + ' ' + (headers.get('x-robots-tag') ?? '');
  const noindex = /noindex/i.test(robots);
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => attr(t, 'rel') === 'canonical');
  const canonicalHref = canonical ? attr(canonical, 'href') : null;
  const lang = /<html\b[^>]*\slang="([^"]+)"/i.exec(html)?.[1];

  if (!title) problems.push('missing <title>');
  else if (title.length < 50 || title.length > 60) warnings.push(`title ${title.length} chars (target 50-60)`);
  if (!description) problems.push('missing meta description');
  else if (description.length < 120 || description.length > 160) warnings.push(`description ${description.length} chars (target 120-160)`);
  if (lang !== 'en') problems.push(`html lang="${lang}"`);
  if (!noindex) {
    if (!canonicalHref) problems.push('missing canonical');
    else if (!/^https?:\/\//.test(canonicalHref)) problems.push('canonical is not absolute');
    else if (new URL(canonicalHref).pathname !== new URL(url).pathname) warnings.push(`canonical points elsewhere: ${canonicalHref}`);
  }
  for (const [k, v] of [
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:url'],
    ['property', 'og:image'],
    ['property', 'og:locale'],
    ['name', 'twitter:card'],
  ]) {
    if (!meta(html, k, v)) problems.push(`missing ${v}`);
  }

  // Headings: exactly one h1, no skipped levels.
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: stripTags(m[2]) }));
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length !== 1) problems.push(`${h1s.length} h1 elements`);
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) {
      warnings.push(`heading order h${prev} -> h${h.level} ("${h.text.slice(0, 40)}")`);
      break;
    }
    prev = h.level;
  }
  for (const h of headings) if (!h.text) problems.push(`empty h${h.level}`);

  // Images: alt + explicit size.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, 'src') ?? '';
    if (attr(tag, 'alt') === null) problems.push(`img without alt: ${src.slice(0, 60)}`);
    const fill = /data-nimg="fill"/.test(tag);
    if (!fill && (!attr(tag, 'width') || !attr(tag, 'height'))) warnings.push(`img without width/height: ${src.slice(0, 60)}`);
  }

  // JSON-LD.
  const ldTypes = new Set();
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      if (!data['@context'] && !Array.isArray(data)) problems.push('JSON-LD without @context');
      checkLd(data, problems, ldTypes, '', warnings);
    } catch (e) {
      problems.push(`invalid JSON-LD: ${String(e.message).slice(0, 80)}`);
    }
  }

  // Links.
  const links = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = `<a${m[1]}>`;
    const href = attr(tag, 'href');
    if (!href) continue;
    const text = stripTags(m[2]).toLowerCase();
    const label = (attr(tag, 'aria-label') ?? '').trim();
    const imgAlt = [...m[2].matchAll(/<img\b[^>]*>/gi)].map((i) => attr(i[0], 'alt') ?? '').join(' ').trim();
    const svgTitle = /<title>([^<]+)<\/title>/.exec(m[2])?.[1] ?? '';
    if (!text && !label && !imgAlt && !svgTitle && !attr(tag, 'title')) problems.push(`link without accessible text: ${href.slice(0, 60)}`);
    else if (!label && GENERIC_LINK_TEXT.has(text)) warnings.push(`generic link text "${text}" -> ${href.slice(0, 60)}`);
    links.push(href);
  }

  return { url, title, description, noindex, canonical: canonicalHref, h1: h1s[0]?.text ?? '', ldTypes: [...ldTypes], problems, warnings, links };
}

// ------------------------------------------------------------------------------------------------- crawling
async function crawl() {
  const origin = new URL(BASE).origin;
  const queue = [...SEEDS];
  const seen = new Set(queue);
  const pages = [];
  const linkStatus = new Map(); // path -> status (or "-> location")
  const linkSources = new Map();

  async function status(p) {
    if (linkStatus.has(p)) return linkStatus.get(p);
    let s;
    try {
      const res = await fetch(origin + p, { redirect: 'manual' });
      s = res.status >= 300 && res.status < 400 ? `${res.status} -> ${res.headers.get('location')}` : res.status;
    } catch (e) {
      s = `error ${e.message}`;
    }
    linkStatus.set(p, s);
    return s;
  }

  while (queue.length && pages.length < MAX_PAGES) {
    const batch = queue.splice(0, 8);
    await Promise.all(
      batch.map(async (p) => {
        const res = await fetch(origin + p, { redirect: 'manual' }).catch(() => null);
        if (!res) return;
        linkStatus.set(p, res.status >= 300 && res.status < 400 ? `${res.status} -> ${res.headers.get('location')}` : res.status);
        if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return;
        const html = await res.text();
        const page = analyse(origin + p, html, res.headers);
        pages.push({ path: p, ...page });
        for (const raw of page.links) {
          let u;
          try {
            u = new URL(raw, origin + p);
          } catch {
            continue;
          }
          if (u.origin !== origin) continue;
          const lp = u.pathname;
          if (!linkSources.has(lp)) linkSources.set(lp, p);
          if (u.search || SKIP.test(lp) || seen.has(lp)) continue;
          seen.add(lp);
          queue.push(lp);
        }
      }),
    );
  }

  // Status of every internal link target that was not crawled (redirects, 404s).
  const linkProblems = [];
  for (const [lp, from] of linkSources) {
    if (/^\/(api|_next)\//.test(lp)) continue;
    const s = await status(lp);
    if (s !== 200) linkProblems.push(`${from} links to ${lp} (${s})`);
  }

  // Duplicates.
  const dupes = [];
  for (const key of ['title', 'description']) {
    const by = new Map();
    for (const pg of pages.filter((x) => !x.noindex)) {
      const v = pg[key];
      if (!v) continue;
      by.set(v, [...(by.get(v) ?? []), pg.path]);
    }
    for (const [v, list] of by) if (list.length > 1) dupes.push(`duplicate ${key} on ${list.length} pages (${list.slice(0, 3).join(', ')}): "${v.slice(0, 70)}"`);
  }
  return { pages, linkProblems, dupes };
}

async function checkFiles() {
  const out = [];
  const checks = [
    ['/robots.txt', (b) => /Sitemap:/i.test(b)],
    ['/sitemap.xml', (b) => /<(sitemapindex|urlset)/.test(b)],
    ['/sitemap/pages.xml', (b) => /<urlset/.test(b) && /<lastmod>/.test(b)],
    ['/sitemap/hospitals.xml', (b) => /<urlset/.test(b)],
    ['/manifest.webmanifest', (b) => JSON.parse(b).icons?.length > 0],
    ['/icons/icon-512.png', null],
    ['/icons/apple-touch-icon.png', null],
    ['/llms.txt', (b) => b.startsWith('#')],
    ['/guides/feed.xml', (b) => /<feed|<rss/.test(b)],
    [NOT_FOUND_PATH, (b) => /noindex/.test(b) && (b.match(/<h1\b/g) ?? []).length === 1, 404],
  ];
  for (const [p, test, expected = 200] of checks) {
    try {
      const res = await fetch(BASE + p, { redirect: 'manual' });
      const body = await res.text();
      const ok = res.status === expected && (!test || test(body));
      out.push({ path: p, status: res.status, ok });
    } catch (e) {
      out.push({ path: p, status: String(e.message), ok: false });
    }
  }
  const res = await fetch(BASE + '/', { redirect: 'manual' });
  const h = res.headers;
  for (const name of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security']) {
    out.push({ path: `header ${name}`, status: h.get(name) ? 'set' : 'missing', ok: Boolean(h.get(name)) });
  }
  out.push({ path: 'CSP without unsafe-eval', status: '', ok: !/unsafe-eval/.test(h.get('content-security-policy') ?? '') });
  for (const [from, to] of [
    ['/hospitals/', '/hospitals'],
    ['/Hospitals', '/hospitals'],
    ['/FAQ', '/faq'],
  ]) {
    const r = await fetch(BASE + from, { redirect: 'manual' });
    const loc = r.headers.get('location') ?? '';
    out.push({ path: `redirect ${from}`, status: `${r.status} ${loc}`, ok: r.status === 308 || r.status === 301 ? new URL(loc, BASE).pathname === to : false });
  }
  return out;
}

// ----------------------------------------------------------------------------------------------- lighthouse
async function runLighthouse(targets) {
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const config = MOBILE ? undefined : (await import('lighthouse/core/config/desktop-config.js')).default;
  const chromePath = findChrome();
  log(`Lighthouse ${MOBILE ? 'mobile' : 'desktop'} with ${chromePath ?? 'system Chrome'}`);
  const results = [];
  for (const target of targets) {
    const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-first-run', '--disable-gpu'] });
    try {
      let lhr;
      // NO_NAVSTART is a sporadic Chrome tracing failure on a busy machine: retry the page (up to 4 runs).
      for (let attempt = 1; attempt <= 4; attempt++) {
        const runner = await lighthouse(
          BASE + target.path,
          { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
          config,
        );
        lhr = runner.lhr;
        if (lhr.runtimeError?.code !== 'NO_NAVSTART') break;
        await sleep(1500);
      }
      fs.writeFileSync(path.join(OUT, `${target.type}.report.json`), JSON.stringify(lhr));
      if (lhr.runtimeError) {
        // ERRORED_DOCUMENT_REQUEST: Lighthouse does not score non-2xx documents (expected for the 404 page only).
        const expected = target.type === '404' && lhr.runtimeError.code === 'ERRORED_DOCUMENT_REQUEST';
        results.push({
          type: target.type,
          path: target.path,
          noindex: target.noindex,
          ...(expected ? { skipped: `HTTP 404 (Lighthouse does not score non-200 documents)` } : { error: lhr.runtimeError.code }),
        });
        log(`${target.type.padEnd(16)} not scored: ${lhr.runtimeError.code}`);
        continue;
      }
      const score = (c) => (lhr.categories[c]?.score == null ? null : Math.round(lhr.categories[c].score * 100));
      // SEO without `is-crawlable`: the score the page gets once it is indexable (drafts / noindex by design).
      const seoRefs = lhr.categories.seo.auditRefs.filter((r) => r.weight > 0 && r.id !== 'is-crawlable');
      const seoNoCrawl = Math.round(
        (seoRefs.reduce((s, r) => s + (lhr.audits[r.id].score ?? 1) * r.weight, 0) / seoRefs.reduce((s, r) => s + r.weight, 0)) * 100,
      );
      const failing = [];
      for (const cat of ['performance', 'accessibility', 'best-practices', 'seo']) {
        for (const ref of lhr.categories[cat].auditRefs) {
          const a = lhr.audits[ref.id];
          if (a && a.score !== null && a.score < 0.9 && (ref.weight > 0 || cat !== 'performance') && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual') {
            failing.push(`${cat}/${ref.id}${a.displayValue ? ` (${a.displayValue})` : ''}`);
          }
        }
      }
      const r = {
        type: target.type,
        path: target.path,
        noindex: target.noindex,
        performance: score('performance'),
        accessibility: score('accessibility'),
        bestPractices: score('best-practices'),
        seo: score('seo'),
        seoIfIndexable: seoNoCrawl,
        lcp: lhr.audits['largest-contentful-paint']?.displayValue,
        cls: lhr.audits['cumulative-layout-shift']?.displayValue,
        tbt: lhr.audits['total-blocking-time']?.displayValue,
        failing: [...new Set(failing)],
      };
      results.push(r);
      log(`${target.type.padEnd(16)} P${r.performance} A${r.accessibility} BP${r.bestPractices} SEO${r.seo}${r.noindex ? ` (noindex; ${r.seoIfIndexable} if indexable)` : ''}  ${target.path}`);
    } catch (e) {
      log(`${target.type}: lighthouse failed: ${e.message}`);
      results.push({ type: target.type, path: target.path, error: e.message });
    } finally {
      await chrome.kill();
    }
  }
  return results;
}

// --------------------------------------------------------------------------------------------------- report
function writeReport({ crawlResult, files, lh }) {
  const lines = [];
  lines.push(`# SEO audit (${new Date().toISOString()})`, '', `Base: ${BASE} - Lighthouse preset: ${MOBILE ? 'mobile' : 'desktop'}`, '');
  if (lh.length) {
    lines.push('| Page type | Path | Perf | A11y | BP | SEO | Notes |', '|---|---|---|---|---|---|---|');
    for (const r of lh) {
      if (r.error) {
        lines.push(`| ${r.type} | ${r.path} | - | - | - | - | error: ${r.error} |`);
        continue;
      }
      if (r.skipped) {
        lines.push(`| ${r.type} | ${r.path} | - | - | - | - | ${r.skipped} |`);
        continue;
      }
      const notes = [r.noindex ? `noindex by design (SEO ${r.seoIfIndexable} if indexable)` : '', r.failing.length ? r.failing.join(', ') : ''].filter(Boolean).join('; ');
      lines.push(`| ${r.type} | ${r.path} | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${notes} |`);
    }
    lines.push('');
  }
  lines.push('## Files, headers, redirects', '');
  for (const f of files) lines.push(`- [${f.ok ? 'x' : ' '}] ${f.path} ${f.status}`);
  lines.push('', `## Crawl (${crawlResult.pages.length} pages)`, '');
  const problemPages = crawlResult.pages.filter((p) => p.problems.length);
  lines.push(`Pages with problems: ${problemPages.length}`, '');
  for (const p of problemPages.slice(0, 80)) lines.push(`- ${p.path}: ${[...new Set(p.problems)].join('; ')}`);
  lines.push('', `Internal links that redirect or fail: ${crawlResult.linkProblems.length}`, '');
  for (const l of crawlResult.linkProblems.slice(0, 50)) lines.push(`- ${l}`);
  lines.push('', `Duplicates: ${crawlResult.dupes.length}`, '');
  for (const d of crawlResult.dupes.slice(0, 50)) lines.push(`- ${d}`);
  const warnPages = crawlResult.pages.filter((p) => p.warnings.length);
  lines.push('', `Pages with warnings: ${warnPages.length}`, '');
  for (const p of warnPages.slice(0, 120)) lines.push(`- ${p.path}${p.noindex ? ' (noindex)' : ''}: ${[...new Set(p.warnings)].join('; ')}`);
  fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n');
  fs.writeFileSync(
    path.join(OUT, 'summary.json'),
    JSON.stringify({ base: BASE, preset: MOBILE ? 'mobile' : 'desktop', lighthouse: lh, files, crawl: { ...crawlResult, pages: crawlResult.pages.map((p) => ({ ...p, links: undefined })) } }, null, 2),
  );
}

// ----------------------------------------------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  const cleanup = () => killTree(server);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    if (!EXTERNAL_BASE) {
      if (!NO_BUILD || !fs.existsSync(path.join(root, DIST, 'BUILD_ID'))) {
        log(`building into ${DIST} (NEXT_PUBLIC_SITE_URL=${BASE})`);
        const sync = spawnSync(process.execPath, [path.join(root, 'scripts', 'prebuild.mjs')], { cwd: root, stdio: 'inherit', env: auditEnv() });
        if (sync.status !== 0) throw new Error('prebuild sync failed');
        // `next build` rewrites tsconfig.json and next-env.d.ts for its dist dir; keep the project's versions.
        const keep = ['tsconfig.json', 'next-env.d.ts'].map((f) => [f, fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f)) : null]);
        const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: root, stdio: 'inherit', env: auditEnv() });
        for (const [f, content] of keep) if (content) fs.writeFileSync(path.join(root, f), content);
        if (build.status !== 0) throw new Error('next build failed');
      }
      log(`starting production server on :${PORT}`);
      server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: root, env: auditEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      server.stdout.on('data', () => {});
      server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
      await waitForServer(`${BASE}/robots.txt`);
    }

    log('crawling');
    const crawlResult = await crawl();
    log(`crawled ${crawlResult.pages.length} pages`);
    const files = await checkFiles();

    const targets = [];
    for (const pt of PAGE_TYPES) {
      if (ONLY.length && !ONLY.includes(pt.type)) continue;
      const page = crawlResult.pages.find((p) => pt.re.test(p.path));
      if (page) targets.push({ type: pt.type, path: page.path, noindex: page.noindex });
      else log(`no page found for type ${pt.type}`);
    }
    if (!ONLY.length || ONLY.includes('404')) targets.push({ type: '404', path: NOT_FOUND_PATH, noindex: true });
    const lh = NO_LIGHTHOUSE ? [] : await runLighthouse(targets);

    writeReport({ crawlResult, files, lh });
    log(`report: ${path.relative(root, path.join(OUT, 'summary.md'))}`);

    const failures =
      lh.filter((r) => r.type !== '404' && !r.skipped && (r.error || (r.noindex ? r.seoIfIndexable : r.seo) < 100)).length +
      crawlResult.pages.reduce((n, p) => n + p.problems.length, 0) +
      crawlResult.linkProblems.length +
      files.filter((f) => !f.ok).length;
    if (failures) log(`${failures} issue(s) need attention (see the report)`);
    if (STRICT && failures) process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(`[audit] ${e.stack || e.message}`);
  process.exit(1);
});
