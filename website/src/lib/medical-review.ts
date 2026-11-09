/**
 * Medical review trust signals for health pages (guides, procedure guides).
 *
 * Front matter (content/README.md section 2):
 *   reviewedBy: "<reviewer id>"            id of a reviewer configured in the staff console (System -> Website &
 *                                          contact -> Medical reviewers; seed/fallback: content/site/reviewers.json)
 *   reviewedAt: "YYYY-MM-DD"               date of the medical review (falls back to `reviewed_on`)
 *   sources: [{"title": "...", "url": "https://..."}]
 *
 * A reviewer is shown only when the entry is real: active (or not `"placeholder": true` in the seed file) and with a
 * name, credentials, registration number and council. Otherwise nothing is rendered and no `reviewedBy` JSON-LD is
 * emitted. Pages pass the live list from getReviewers(); without it the seed file applies.
 */
import { SITE_URL } from '@/config/site';
import { fallbackReviewers, getSiteConfig, type ReviewerEntry } from './site-config';
import { ORG_ID } from './jsonld';
import { absoluteUrl } from './seo';
import type { ContentPage } from './content';

export interface Reviewer {
  id: string;
  name: string;
  credentials: string;
  registration: { number: string; council: string };
  bio: string | null;
  photo: string | null;
}

export interface Source {
  title: string;
  url: string;
}

export interface MedicalReview {
  /** Real reviewer, or null (placeholder, unknown id or incomplete entry). */
  reviewer: Reviewer | null;
  /** YYYY-MM-DD, only when a real reviewer is credited. */
  reviewedAt: string | null;
  sources: Source[];
  /** The page needs a medical review (`review_required` contains `medical`). */
  isHealthPage: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ReviewerMap = ReadonlyMap<string, Reviewer>;

function toReviewer(r: ReviewerEntry): Reviewer | null {
  const { id, name, credentials, registrationNumber: number, registrationCouncil: council } = r;
  if (!id || !name || !credentials || !number || !council) return null;
  if (/placeholder/i.test(`${name} ${credentials} ${council}`)) return null;
  const photo = r.photo;
  return {
    id,
    name,
    credentials,
    registration: { number, council },
    bio: r.bio || null,
    // Same-origin paths or https URLs only (remote hosts must also be listed in IMAGE_REMOTE_ORIGINS for the CSP).
    photo: /^\/[^/]/.test(photo) || /^https:\/\//.test(photo) ? photo : null,
  };
}

export function reviewerMap(entries: ReviewerEntry[]): ReviewerMap {
  return new Map(
    entries
      .map(toReviewer)
      .filter((r): r is Reviewer => !!r)
      .map((r) => [r.id, r]),
  );
}

let seedMap: ReviewerMap | null = null;
/** Reviewers from the seed file (content/site/reviewers.json) for code paths without the live list. */
function seedReviewers(): ReviewerMap {
  seedMap ??= reviewerMap(fallbackReviewers());
  return seedMap;
}

/** The live reviewer list (site settings via GET /site-config; the seed file when the API is unreachable). */
export async function getReviewers(): Promise<ReviewerMap> {
  return reviewerMap((await getSiteConfig()).reviewers);
}

export function getReviewer(id: string | undefined | null, reviewers: ReviewerMap = seedReviewers()): Reviewer | null {
  return id ? (reviewers.get(id.trim()) ?? null) : null;
}

export function parseSources(value: string | undefined): Source[] {
  if (!value) return [];
  try {
    const list: unknown = JSON.parse(value);
    if (!Array.isArray(list)) return [];
    return list
      .map((s) => ({ title: str((s as Source)?.title), url: str((s as Source)?.url) }))
      .filter((s) => s.title && /^https:\/\/[^\s]+$/.test(s.url))
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function isHealthPage(page: ContentPage): boolean {
  return (page.meta.review_required ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes('medical');
}

export function medicalReview(page: ContentPage, reviewers?: ReviewerMap): MedicalReview {
  const reviewer = getReviewer(page.meta.reviewedBy, reviewers);
  const date = str(page.meta.reviewedAt) || str(page.meta.reviewed_on);
  return {
    reviewer: reviewer && DATE.test(date) ? reviewer : null,
    reviewedAt: reviewer && DATE.test(date) ? date : null,
    sources: parseSources(page.meta.sources),
    isHealthPage: isHealthPage(page),
  };
}

/**
 * schema.org MedicalWebPage for a health page. `reviewedBy` / `lastReviewed` are included only with a real reviewer.
 * `path` is the page's site path (e.g. "/guides/pre-arrival").
 */
export function medicalWebPageLd(
  page: ContentPage,
  path: string,
  title?: string,
  reviewers?: ReviewerMap,
): Record<string, unknown> {
  const review = medicalReview(page, reviewers);
  const url = absoluteUrl(path);
  const r = review.reviewer;
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    '@id': `${url}#webpage`,
    url,
    name: title ?? page.meta.title,
    ...(page.meta.summary ? { description: page.meta.summary } : {}),
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': ORG_ID },
    ...(page.meta.updated && DATE.test(page.meta.updated) ? { dateModified: page.meta.updated } : {}),
    ...(r && review.reviewedAt
      ? {
          lastReviewed: review.reviewedAt,
          reviewedBy: {
            '@type': 'Person',
            name: r.name,
            honorificSuffix: r.credentials,
            ...(r.bio ? { description: r.bio } : {}),
            ...(r.photo ? { image: r.photo.startsWith('/') ? absoluteUrl(r.photo) : r.photo } : {}),
            hasCredential: {
              '@type': 'EducationalOccupationalCredential',
              credentialCategory: 'Medical registration',
              identifier: r.registration.number,
              recognizedBy: { '@type': 'Organization', name: r.registration.council },
            },
          },
        }
      : {}),
    ...(review.sources.length
      ? { citation: review.sources.map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url })) }
      : {}),
  };
}
