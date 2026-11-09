import type { Metadata } from 'next';
import { SITE_NAME, SITE_NOINDEX, SITE_URL } from '@/config/site';

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Search-result friendly lengths (Google truncates titles at ~600px ≈ 60 chars and snippets at ~160 chars). */
export const TITLE_MIN = 50;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;
const TITLE_SUFFIX = ` | ${SITE_NAME}`;

/**
 * Pick the final `<title>` from variants ordered most to least descriptive. The first variant that is 50-60
 * characters with the " | Heal India Global" suffix wins, then the first that is 50-60 characters on its own; then
 * the longest that fits within 60 (suffix preferred); as a last resort the first variant is cut on a word boundary.
 */
export function fitTitle(variants: string | readonly string[], suffix = TITLE_SUFFIX): string {
  const list = (typeof variants === 'string' ? [variants] : [...variants]).map((v) => v.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!list.length) return SITE_NAME;
  const ok = (s: string) => s.length >= TITLE_MIN && s.length <= TITLE_MAX;
  for (const v of list) {
    if (suffix && ok(v + suffix)) return v + suffix;
    if (ok(v)) return v;
  }
  const fits = list.flatMap((v) => (suffix ? [v + suffix, v] : [v])).filter((s) => s.length <= TITLE_MAX);
  if (fits.length) return fits.reduce((a, b) => (b.length > a.length ? b : a));
  return truncate(list[0]!, TITLE_MAX);
}

/**
 * Meta description of 120-160 characters: short texts are extended with the given extra sentences (in order) and
 * long ones are cut on a word boundary.
 */
export function fitDescription(text: string, extras: readonly (string | null | undefined)[] = []): string {
  let out = text.replace(/\s+/g, ' ').trim();
  for (const extra of extras) {
    if (out.length >= DESCRIPTION_MIN) break;
    const e = extra?.replace(/\s+/g, ' ').trim();
    if (!e || out.includes(e)) continue;
    const joined = `${out}${/[.!?…]$/.test(out) || !out ? '' : '.'} ${e}`.trim();
    // Do not add a sentence that would have to be cut off again, unless the text is still far too short.
    if (joined.length > DESCRIPTION_MAX && out.length >= 100) continue;
    out = joined;
  }
  return truncate(out, DESCRIPTION_MAX);
}

/** Entity name without a parenthetical, for shorter title variants: "IVF (in-vitro fertilisation)" -> "IVF". */
export function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() || name;
}

/** Generic, true closing sentences used when a page's own description is too short for a search snippet. */
const DESCRIPTION_TAIL = [
  'Plan your treatment in India with Heal India Global.',
  'Free AI assessment, indicative prices and support from enquiry to recovery.',
];

interface PageMetaInput {
  /** Site path, e.g. "/treatments" or "" for home. */
  path: string;
  /** One title, or variants from most to least descriptive (see fitTitle). The site-name suffix is added here. */
  title: string | readonly string[];
  description: string;
  /** Page-specific sentences appended (in order) while the description is shorter than 120 characters. */
  descriptionExtras?: readonly (string | null | undefined)[];
  /** noindex,follow (auth pages, search, pages rendered from fallback data). */
  noindex?: boolean;
  /** `<meta name="referrer" content="no-referrer">` (pages that handle one-time tokens). */
  noReferrer?: boolean;
  /** Absolute title (no "| Heal India Global" template), used by the home page. */
  absoluteTitle?: boolean;
  type?: 'website' | 'article' | 'profile';
}

/**
 * Default share image (src/app/opengraph-image.tsx). A page's `openGraph` replaces its parent's (dropping the root
 * image), so it is listed explicitly - except on routes with their own `opengraph-image.tsx`, where an explicit
 * image would replace the generated one. Keep this list in sync with those files.
 */
const DEFAULT_SHARE_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME };
const OWN_SHARE_IMAGE = [/^\/hospitals\/[^/]+$/, /^\/doctors\/[^/]+$/, /^\/treatments\/[^/]+(\/[^/]+)?$/, /^\/guides\/[^/]+$/];

export function pageMetadata({
  path,
  title: titleInput,
  description: rawDescription,
  descriptionExtras = [],
  noindex,
  noReferrer,
  absoluteTitle,
  type = 'website',
}: PageMetaInput): Metadata {
  // Canonical: the clean site path (no query string, no trailing slash), resolved against metadataBase.
  const url = path || '/';
  const variants = typeof titleInput === 'string' ? [titleInput] : titleInput;
  // `absoluteTitle`: the title already names the site, so no " | Heal India Global" suffix is added.
  const title = fitTitle(variants, absoluteTitle ? '' : TITLE_SUFFIX);
  const ogTitle = title;
  const description = fitDescription(rawDescription, [...descriptionExtras, ...DESCRIPTION_TAIL]);
  const images = OWN_SHARE_IMAGE.some((re) => re.test(url)) ? undefined : [DEFAULT_SHARE_IMAGE];
  return {
    title: { absolute: title },
    description,
    // English only (no hreflang). Every page advertises the Atom feed of guides and stories.
    alternates: { canonical: url, types: { 'application/atom+xml': [{ url: '/guides/feed.xml', title: `${SITE_NAME} guides` }] } },
    openGraph: {
      type,
      url,
      title: ogTitle,
      description,
      siteName: SITE_NAME,
      locale: 'en_US',
      ...(images ? { images } : {}),
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description, ...(images ? { images } : {}) },
    robots: noindex || SITE_NOINDEX ? { index: false, follow: true } : undefined,
    ...(noReferrer ? { referrer: 'no-referrer' as const } : {}),
  };
}

/** Trim to a meta-description friendly length on a word boundary. */
export function truncate(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,;:.\s]+$/, '')}…`;
}
