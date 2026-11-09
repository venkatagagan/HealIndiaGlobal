import 'server-only';

/**
 * Long-form Markdown from the content pack (../content, synced to content-snapshot/ by scripts/prebuild.mjs)
 * and the legal drafts (../docs/legal). See content/README.md for the format:
 * front matter = one `key: "json string"` per line; first body line is an H1 equal to `title`;
 * internal links are relative `.md` paths; call-outs are block quotes starting with a bold label.
 *
 * Review status: content pages are drafts until approved. Drafts are shown with a banner in development and hidden
 * in production unless CONTENT_INCLUDE_DRAFTS overrides it (see includeDrafts). Legal drafts are shown with a "draft" banner unless LEGAL_SHOW_DRAFTS=false.
 */
import fs from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import { routes } from '@/lib/routes';

const SNAPSHOT = path.join(process.cwd(), 'content-snapshot');
const CONTENT_DIR = path.join(SNAPSHOT, 'content');
const LEGAL_DIR = path.join(SNAPSHOT, 'legal');
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Drafts are shown with a visible "draft" banner in development (`next dev`) so every guide route has content.
 * Production builds (NODE_ENV=production) show only `review_status: approved` pages by default; unapproved pages
 * then render a short "being reviewed" notice (noindex) instead of a 404. CONTENT_INCLUDE_DRAFTS=true|false
 * overrides the default either way (e.g. `true` on a staging server that also sets SITE_NOINDEX=true).
 */
export function includeDrafts(): boolean {
  const value = process.env.CONTENT_INCLUDE_DRAFTS?.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export interface ContentMeta {
  slug: string;
  title: string;
  category: 'faq' | 'guide' | 'policy' | 'city' | 'procedure' | string;
  /** Always "en" (the content pack is English only). */
  locale: string;
  dir?: string;
  summary?: string;
  updated?: string;
  review_status?: string;
  review_required?: string;
  specialty?: string;
  catalog_slug?: string;
  catalog_cities?: string;
  [key: string]: string | undefined;
}

export interface ContentEntry {
  /** Path relative to content/, forward slashes, e.g. "en/procedures/cabg.md". */
  path: string;
  meta: ContentMeta;
  body: string;
}

export interface ContentPage extends ContentEntry {
  isDraft: boolean;
}

// ------------------------------------------------------------------------------------------- parsing
const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = FRONT_MATTER.exec(raw);
  const meta: Record<string, string> = {};
  if (m?.[1]) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i <= 0) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      try {
        const parsed: unknown = JSON.parse(value);
        // Lists (e.g. `sources: [{"title": "...", "url": "https://..."}]`) stay JSON text; see lib/medical-review.ts.
        meta[key] = typeof parsed === 'string' ? parsed : parsed !== null && typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
      } catch {
        meta[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { meta, body: m ? raw.slice(m[0].length) : raw.replace(/^﻿/, '') };
}

/** The first `# Title` line duplicates the page title; pages render their own H1. */
export function stripLeadingH1(body: string): string {
  return body.replace(/^\s*#\s+[^\n]*\n+/, '');
}

function walk(dir: string, base = dir, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

let memo: ContentEntry[] | null = null;

/** Every content page with a valid front matter (README files excluded). */
export function allContent(): ContentEntry[] {
  if (memo && !isDev) return memo;
  const out: ContentEntry[] = [];
  for (const rel of walk(CONTENT_DIR)) {
    if (/(^|\/)readme\.md$/i.test(rel)) continue;
    try {
      const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(CONTENT_DIR, rel), 'utf8'));
      if (!meta.slug || !meta.title) continue;
      out.push({ path: rel, meta: { ...meta, locale: meta.locale ?? rel.split('/')[0] ?? 'en' } as ContentMeta, body: stripLeadingH1(body) });
    } catch {
      /* unreadable file - skip */
    }
  }
  memo = out;
  return out;
}

function visible(entry: ContentEntry): boolean {
  return entry.meta.review_status === 'approved' || includeDrafts();
}

function toPage(entry: ContentEntry): ContentPage {
  return {
    ...entry,
    isDraft: entry.meta.review_status !== 'approved',
  };
}

/** Find an English page by predicate. Respects review status. */
export function findContent(predicate: (e: ContentEntry) => boolean): ContentPage | null {
  const pages = allContent().filter(predicate);
  const en = pages.find((p) => p.meta.locale === 'en' && visible(p));
  return en ? toPage(en) : null;
}

export function contentBySlug(slug: string, category?: string): ContentPage | null {
  return findContent((e) => e.meta.slug === slug && (!category || e.meta.category === category));
}

export function procedureGuide(catalogSlug: string): ContentPage | null {
  return findContent((e) => e.meta.category === 'procedure' && (e.meta.catalog_slug || e.meta.slug) === catalogSlug);
}

export function faqContent(): ContentPage | null {
  return findContent((e) => e.meta.category === 'faq');
}

// ------------------------------------------------------------------------------------- city guides
export interface CityGuideMeta {
  slug: string;
  title: string;
  name: string;
  summary: string | null;
  cities: string[];
}

/** City guide metadata (English source), used for stable destination URLs even when bodies are hidden. */
export function cityGuideIndex(): CityGuideMeta[] {
  return allContent()
    .filter((e) => e.meta.category === 'city' && e.meta.locale === 'en')
    .map((e) => ({
      slug: e.meta.slug,
      title: e.meta.title,
      name: e.meta.title.replace(/\s*city guide\s*$/i, '').trim() || e.meta.title,
      summary: e.meta.summary ?? null,
      cities: (e.meta.catalog_cities ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    }));
}

export function cityGuide(slug: string): ContentPage | null {
  return findContent((e) => e.meta.category === 'city' && e.meta.slug === slug);
}

// ------------------------------------------------------------------------------------------ guides
/** Website guide slug <-> content slug. */
const GUIDE_TO_CONTENT: Record<string, string> = {
  'pre-arrival': 'pre-arrival-guide',
  'in-country': 'in-country-guide',
  visa: 'visa-overview',
};
const CONTENT_TO_GUIDE: Record<string, string> = Object.fromEntries(Object.entries(GUIDE_TO_CONTENT).map(([a, b]) => [b, a]));

export function guideContentSlug(guideSlug: string): string {
  return GUIDE_TO_CONTENT[guideSlug] ?? guideSlug;
}

export function guideSlugFor(contentSlug: string): string {
  return CONTENT_TO_GUIDE[contentSlug] ?? contentSlug;
}

export function guideContent(guideSlug: string): ContentPage | null {
  const slug = guideContentSlug(guideSlug);
  return findContent((e) => (e.meta.category === 'guide' || e.meta.category === 'policy') && e.meta.slug === slug);
}

/** All guide/policy pages that exist in English (for the guides index and sitemap). */
export function guideIndex(): { slug: string; title: string; summary: string | null; visible: boolean }[] {
  return allContent()
    .filter((e) => (e.meta.category === 'guide' || e.meta.category === 'policy') && e.meta.locale === 'en')
    .map((e) => ({ slug: guideSlugFor(e.meta.slug), title: e.meta.title, summary: e.meta.summary ?? null, visible: visible(e) }));
}

// --------------------------------------------------------------------------------------- link mapping
function posixResolve(fromFile: string, target: string): string {
  const parts = fromFile.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Map a Markdown link found in `fromPath` to a website URL. Relative `.md` links become site routes;
 * https/mailto links are kept; anything else (unknown files, javascript:, data:) is dropped (null).
 */
export function resolveContentHref(fromPath: string, hrefValue: string): string | null {
  const value = hrefValue.trim();
  if (/^https:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value)) return value;
  if (value.startsWith('#')) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return null;
  const [file = '', hash = ''] = value.split('#');
  if (!file.toLowerCase().endsWith('.md')) return null;
  const resolved = posixResolve(fromPath, file);
  const rel = resolved.split('/').slice(1).join('/'); // drop the en/ folder
  const anchor = hash ? `#${hash}` : '';
  const entry = allContent().find((e) => e.path === resolved) ?? allContent().find((e) => e.path === `en/${rel}`);
  const slug = (rel.split('/').pop() ?? '').replace(/\.md$/i, '');
  let route: string | null = null;
  if (rel === 'faq.md') route = routes.faq;
  else if (rel.startsWith('cities/')) route = routes.city(slug);
  else if (rel.startsWith('procedures/')) {
    const spec = entry?.meta.specialty;
    const cat = entry?.meta.catalog_slug || slug;
    route = spec ? routes.procedure(spec, cat) : null;
  } else if (!rel.includes('/')) route = routes.guide(guideSlugFor(slug));
  return route ? `${route}${anchor}` : null;
}

// ------------------------------------------------------------------------------------------- legal
const LEGAL_FILES = {
  terms: 'TERMS_OF_SERVICE.md',
  privacy: 'PRIVACY_POLICY.md',
  refunds: 'REFUND_CANCELLATION_POLICY.md',
} as const;
export type LegalDoc = keyof typeof LEGAL_FILES;

const LEGAL_LINKS: Record<string, string> = {
  'TERMS_OF_SERVICE.md': routes.terms,
  'PRIVACY_POLICY.md': routes.privacy,
  'REFUND_CANCELLATION_POLICY.md': routes.refunds,
};

export function legalShowDrafts(): boolean {
  return process.env.LEGAL_SHOW_DRAFTS?.trim() !== 'false';
}

/** Remove counsel-only material: the DRAFT line, the placeholder legend and "Drafting note" blocks. */
function cleanLegal(raw: string): string {
  const blocks = raw.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .filter((b) => {
      const text = b.trim();
      if (/^\*\*DRAFT\b/i.test(text)) return false;
      if (/drafting note/i.test(text) && (text.startsWith('>') || /^\*\*drafting note/i.test(text) || /^_?\*?drafting note/i.test(text))) return false;
      return true;
    })
    .join('\n\n');
}

export function legalDocument(doc: LegalDoc): { title: string; body: string; isDraft: boolean; path: string } | null {
  if (!legalShowDrafts()) return null;
  const file = LEGAL_FILES[doc];
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(LEGAL_DIR, file), 'utf8');
  } catch {
    return null;
  }
  const isDraft = /\bDRAFT\b/.test(raw.slice(0, 400));
  const cleaned = cleanLegal(raw);
  const h1 = /^#\s+(.+)$/m.exec(cleaned);
  const title = h1?.[1]?.replace(/^Heal India Global\s+[—-]\s+/, '').trim() ?? doc;
  const body = h1 ? cleaned.replace(h1[0], '').trim() : cleaned;
  return { title, body, isDraft, path: file };
}

export function resolveLegalHref(hrefValue: string): string | null {
  const value = hrefValue.trim();
  if (/^https:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  if (value.startsWith('#')) return value;
  const [file = '', hash = ''] = value.split('#');
  const name = file.split('/').pop() ?? '';
  const route = LEGAL_LINKS[name];
  return route ? `${route}${hash ? `#${hash}` : ''}` : null;
}

// ------------------------------------------------------------------------------------ text helpers
/** Strip Markdown syntax for meta descriptions and JSON-LD answers. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/^\s*>\s?/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/^\|?\s*:?-{3,}.*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** Table of contents with the same ids rehype-slug generates (github-slugger, document order). */
export function tableOfContents(body: string, minDepth: 2 | 3 = 2): TocItem[] {
  const slugger = new GithubSlugger();
  const out: TocItem[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m?.[1] || !m[2]) continue;
    const text = markdownToPlain(m[2]);
    const id = slugger.slug(text);
    const depth = m[1].length;
    if (depth === 2 || (depth === 3 && minDepth === 3)) out.push({ id, text, depth: depth as 2 | 3 });
  }
  return out;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqSection {
  title: string;
  items: FaqItem[];
}

/** Split an FAQ page into `## section` / `### question` + Markdown answer. */
export function parseFaq(body: string): FaqSection[] {
  const sections: FaqSection[] = [];
  let section: FaqSection | null = null;
  let item: FaqItem | null = null;
  for (const line of body.split(/\r?\n/)) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h2?.[1]) {
      section = { title: h2[1].trim(), items: [] };
      sections.push(section);
      item = null;
    } else if (h3?.[1]) {
      if (!section) {
        section = { title: '', items: [] };
        sections.push(section);
      }
      item = { question: h3[1].trim(), answer: '' };
      section.items.push(item);
    } else if (item) {
      item.answer += `${line}\n`;
    }
  }
  for (const s of sections) for (const i of s.items) i.answer = i.answer.trim();
  return sections.filter((s) => s.items.length);
}
