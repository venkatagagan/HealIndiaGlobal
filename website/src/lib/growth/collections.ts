import 'server-only';

/**
 * Website-only content collections (content/README.md section 10, "Website-only pages"), read from the synced content snapshot:
 *
 *   en/procedure-city/<procedure>-<city>.md   hand-written intro for /treatments/<specialty>/<procedure>/<city>
 *   en/cost-guides/<procedure>-<country>.md   reviewed intro for /costs/<procedure>/<country>
 *   en/stories/<slug>.md                      consented patient stories (/stories)
 *
 * Front matter uses the content-pack format (one `key: <JSON>` per line). Unlike the main pack, story files may
 * hold JSON objects/booleans (`consent`, `draft`), so values are kept as parsed JSON here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { includeDrafts, stripLeadingH1 } from '@/lib/content';
import { getReviewer, parseSources, type MedicalReview, type ReviewerMap } from '@/lib/medical-review';

const CONTENT_DIR = path.join(process.cwd(), 'content-snapshot', 'content');
const isDev = process.env.NODE_ENV !== 'production';

/** An intro must be at least this long (words) before its page may be indexed (thin-page protection). */
export const MIN_INTRO_WORDS = 80;

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** First name ("Amina") or initials ("A. K.", "AK"); full names are rejected. */
const STORY_NAME_RE = /^(?:[A-Z][a-z'-]{1,24}|(?:[A-Z]\.?\s?){1,3})$/;

interface RawEntry {
  path: string;
  meta: Record<string, unknown>;
  body: string;
}

function parse(raw: string): { meta: Record<string, unknown>; body: string } | null {
  const m = FRONT_MATTER.exec(raw);
  if (!m?.[1]) return null;
  const meta: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    try {
      meta[line.slice(0, i).trim()] = JSON.parse(line.slice(i + 1).trim());
    } catch {
      /* invalid value: the key is treated as missing (content/tools/build-index.mjs reports it) */
    }
  }
  return { meta, body: stripLeadingH1(raw.slice(m[0].length)) };
}

const memo = new Map<string, RawEntry[]>();

function readFolder(folder: string): RawEntry[] {
  const cached = memo.get(folder);
  if (cached && !isDev) return cached;
  const dir = path.join(CONTENT_DIR, 'en', folder);
  const out: RawEntry[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md') && n.toLowerCase() !== 'readme.md');
  } catch {
    /* folder missing: empty collection */
  }
  for (const name of names.sort()) {
    try {
      const parsed = parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (parsed) out.push({ path: `en/${folder}/${name}`, ...parsed });
    } catch {
      /* unreadable file - skip */
    }
  }
  memo.set(folder, out);
  return out;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const words = (text: string) => text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

// ------------------------------------------------------------------------------------------------ intros
export interface Intro {
  /** Path relative to content/ (for resolving relative Markdown links). */
  path: string;
  slug: string;
  title: string;
  summary: string | null;
  updated: string | null;
  procedure: string;
  /** Destination slug (procedure-city) or ISO-3166 alpha-2 code (cost guides). */
  place: string;
  reviewStatus: string;
  /** Reviewer credit (real, active reviewer from the site settings only) and `sources`, for the shared byline. */
  review: MedicalReview;
  body: string;
  isDraft: boolean;
  /** Approved, credited to a real reviewer with a review date, and long enough: may be indexed (data gates aside). */
  reviewed: boolean;
}

function toIntro(e: RawEntry, placeKey: 'city' | 'country', reviewers?: ReviewerMap): Intro | null {
  const slug = str(e.meta.slug);
  const title = str(e.meta.title);
  const procedure = str(e.meta.procedure);
  const place = str(e.meta[placeKey]);
  if (!slug || !title || !procedure || !place) return null;
  const reviewStatus = str(e.meta.review_status) ?? 'draft';
  const approved = reviewStatus === 'approved';
  const reviewer = getReviewer(str(e.meta.reviewedBy), reviewers);
  const date = str(e.meta.reviewedAt) ?? str(e.meta.reviewed_on);
  const reviewedAt = reviewer && date && DATE_RE.test(date) ? date : null;
  const review: MedicalReview = {
    reviewer: reviewedAt ? reviewer : null,
    reviewedAt,
    sources: Array.isArray(e.meta.sources) ? parseSources(JSON.stringify(e.meta.sources)) : [],
    isHealthPage: (str(e.meta.review_required) ?? '').split(',').map((x) => x.trim()).includes('medical'),
  };
  return {
    path: e.path,
    slug,
    title,
    summary: str(e.meta.summary),
    updated: str(e.meta.updated),
    procedure,
    place: placeKey === 'country' ? place.toUpperCase() : place,
    reviewStatus,
    review,
    body: e.body,
    isDraft: !approved,
    reviewed: approved && !!review.reviewer && words(e.body) >= MIN_INTRO_WORDS,
  };
}

/** Intros shown on the site: approved ones, plus drafts (with a banner) while CONTENT_INCLUDE_DRAFTS is not false. */
function visibleIntros(folder: string, category: string, placeKey: 'city' | 'country', reviewers?: ReviewerMap): Intro[] {
  return readFolder(folder)
    .filter((e) => e.meta.category === category)
    .map((e) => toIntro(e, placeKey, reviewers))
    .filter((i): i is Intro => !!i && (!i.isDraft || includeDrafts()));
}

/** `reviewers`: the live list from getReviewers() (src/lib/medical-review.ts); without it the seed file applies. */
export function procedureCityIntros(reviewers?: ReviewerMap): Intro[] {
  return visibleIntros('procedure-city', 'procedure_city', 'city', reviewers);
}

export function procedureCityIntro(procedure: string, city: string, reviewers?: ReviewerMap): Intro | null {
  return procedureCityIntros(reviewers).find((i) => i.procedure === procedure && i.place === city) ?? null;
}

export function costGuideIntros(reviewers?: ReviewerMap): Intro[] {
  return visibleIntros('cost-guides', 'cost_guide', 'country', reviewers);
}

export function costGuideIntro(procedure: string, countryCode: string, reviewers?: ReviewerMap): Intro | null {
  const code = countryCode.toUpperCase();
  return costGuideIntros(reviewers).find((i) => i.procedure === procedure && i.place === code) ?? null;
}

// ----------------------------------------------------------------------------------------------- stories
export interface Story {
  path: string;
  slug: string;
  title: string;
  summary: string | null;
  updated: string | null;
  /** First name or initials only. */
  name: string;
  homeCountry: string | null;
  procedure: string;
  hospital: string | null;
  consentDate: string;
  reviewedBy: string;
  isDraft: boolean;
  body: string;
}

const rejected = new Set<string>();

/**
 * Hard gates, checked for every file (drafts included): written website consent, a reviewer, and a first name or
 * initials only. A story failing any gate is never built.
 */
function toStory(e: RawEntry): Story | null {
  const reject = (why: string) => {
    if (!rejected.has(e.path)) console.warn(`[stories] ${e.path} is not built: ${why}`);
    rejected.add(e.path);
    return null;
  };
  if (e.meta.category !== 'story') return reject('category must be "story"');
  const consent = e.meta.consent as { obtained?: unknown; date?: unknown; scope?: unknown } | undefined;
  if (!consent || typeof consent !== 'object' || consent.obtained !== true || consent.scope !== 'website') {
    return reject('no written consent for publication on the website');
  }
  if (typeof consent.date !== 'string' || !DATE_RE.test(consent.date)) return reject('consent date missing');
  const reviewedBy = str(e.meta.reviewedBy);
  if (!reviewedBy) return reject('reviewedBy missing');
  const name = str(e.meta.name);
  if (!name || !STORY_NAME_RE.test(name)) return reject('name must be a first name or initials only');
  const slug = str(e.meta.slug);
  const title = str(e.meta.title);
  const procedure = str(e.meta.procedure);
  if (!slug || !SLUG_RE.test(slug) || !title || !procedure) return reject('slug, title or procedure missing');
  const hospital = str(e.meta.hospital);
  const country = str(e.meta.home_country);
  return {
    path: e.path,
    slug,
    title,
    summary: str(e.meta.summary),
    updated: str(e.meta.updated),
    name,
    homeCountry: country && /^[A-Z]{2}$/.test(country) ? country : null,
    procedure,
    hospital,
    consentDate: consent.date,
    reviewedBy,
    // Anything other than an explicit `draft: false` (or no draft key) counts as a draft.
    isDraft: e.meta.draft !== undefined && e.meta.draft !== false,
    body: e.body,
  };
}

/**
 * Stories that may be built. Drafts appear ONLY on a local development server (`next dev`), never in a production
 * build, whatever CONTENT_INCLUDE_DRAFTS says.
 */
export function stories(): Story[] {
  const showDrafts = process.env.NODE_ENV === 'development';
  return readFolder('stories')
    .map(toStory)
    .filter((s): s is Story => !!s && (!s.isDraft || showDrafts))
    .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '') || a.slug.localeCompare(b.slug));
}

export function story(slug: string): Story | null {
  return stories().find((s) => s.slug === slug) ?? null;
}
