import type { Metadata } from 'next';
import { SITE_NAME, SITE_NOINDEX, SITE_URL } from '@/config/site';
import { DEFAULT_LOCALE, OG_LOCALES, isEnglishOnlyPath, localizePath, type Locale } from '@/i18n/config';
import { getEnabledLocales } from '@/i18n/languages';
import { getDictionary, getLocale } from '@/i18n';

/**
 * hreflang alternates for a site path: every enabled language (English-only pages: English only) plus x-default =
 * English, as paths resolved against metadataBase.
 */
export function languageAlternates(path: string, enabled: readonly Locale[]): Record<string, string> {
  const url = path || '/';
  const locales = isEnglishOnlyPath(url) ? [DEFAULT_LOCALE] : enabled;
  const out: Record<string, string> = {};
  for (const l of locales) out[l] = localizePath(url, l);
  out['x-default'] = url;
  return out;
}

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


interface PageMetaInput {
  /** Site path, e.g. "/treatments" or "" for home. */
  path: string;
  /** One title, or variants from most to least descriptive (see fitTitle). The site-name suffix is added here. */
  title: string | readonly string[];
  description: string;
  /** Page-specific sentences appended (in order) while the description is shorter than 120 characters. */
  descriptionExtras?: readonly (string | null | undefined)[];
  /**
   * English pages only: title variants / description extras written directly in English (SEO-tuned phrasings). When
   * given they replace `title` / `descriptionExtras` on English pages; translated pages use `title` and
   * `descriptionExtras`, which must come from the dictionary.
   */
  titleEn?: readonly string[];
  descriptionExtrasEn?: readonly (string | null | undefined)[];
  /** noindex,follow (auth pages, search, pages rendered from fallback data). */
  noindex?: boolean;
  /** `<meta name="referrer" content="no-referrer">` (pages that handle one-time tokens). */
  noReferrer?: boolean;
  /** Absolute title (no "| Heal India Global" template), used by the home page. */
  absoluteTitle?: boolean;
  type?: 'website' | 'article' | 'profile';
}

/**
 * Default share image (src/app/[lang]/opengraph-image.tsx). A page's `openGraph` replaces its parent's (dropping the root
 * image), so it is listed explicitly - except on routes with their own `opengraph-image.tsx`, where an explicit
 * image would replace the generated one. Keep this list in sync with those files.
 */
const DEFAULT_SHARE_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME };
const OWN_SHARE_IMAGE = [/^\/hospitals\/[^/]+$/, /^\/doctors\/[^/]+$/, /^\/treatments\/[^/]+(\/[^/]+)?$/, /^\/guides\/[^/]+$/];

export async function pageMetadata({
  path,
  title: titleInput,
  description: rawDescription,
  descriptionExtras: extrasInput = [],
  titleEn,
  descriptionExtrasEn,
  noindex,
  noReferrer,
  absoluteTitle,
  type = 'website',
}: PageMetaInput): Promise<Metadata> {
  const [locale, t, enabled] = await Promise.all([getLocale(), getDictionary(), getEnabledLocales()]);
  const english = locale === DEFAULT_LOCALE;
  if (english && titleEn?.length) titleInput = titleEn;
  const descriptionExtras = english && descriptionExtrasEn ? descriptionExtrasEn : extrasInput;
  // Canonical: the clean site path in this page's language (no query string, no trailing slash), resolved against
  // metadataBase. hreflang: every enabled language plus x-default (English).
  const sitePath = path || '/';
  const url = localizePath(sitePath, locale);
  const variants = typeof titleInput === 'string' ? [titleInput] : titleInput;
  // `absoluteTitle`: the title already names the site, so no " | Heal India Global" suffix is added.
  const title = fitTitle(variants, absoluteTitle ? '' : TITLE_SUFFIX);
  const ogTitle = title;
  // Generic, true closing sentences (t.seo.descriptionTail) extend descriptions too short for a search snippet.
  const description = fitDescription(rawDescription, [...descriptionExtras, ...t.seo.descriptionTail]);
  const images = OWN_SHARE_IMAGE.some((re) => re.test(sitePath)) ? undefined : [DEFAULT_SHARE_IMAGE];
  const languages = languageAlternates(sitePath, enabled);
  return {
    title: { absolute: title },
    description,
    // Every page advertises the Atom feed of guides and stories (English).
    alternates: {
      canonical: url,
      languages,
      types: { 'application/atom+xml': [{ url: '/guides/feed.xml', title: `${SITE_NAME} guides` }] },
    },
    openGraph: {
      type,
      url,
      title: ogTitle,
      description,
      siteName: SITE_NAME,
      locale: OG_LOCALES[locale],
      alternateLocale: Object.keys(languages)
        .filter((l): l is Locale => l !== locale && l !== 'x-default')
        .map((l) => OG_LOCALES[l]),
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
