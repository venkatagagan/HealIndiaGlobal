/**
 * Marketing presentation settings (INTEGRATION_BACKLOG #14).
 *
 * The CLAIMS (maximum savings %, the stats such as "5,000+ patients treated", the typical wait in India and whether
 * testimonials are shown) are site settings a super admin edits in the staff console (System -> Website & contact ->
 * Marketing claims); pages read them with getSiteConfig().marketing (src/lib/site-config.ts). The file
 * ../content/site/marketing.json (copied to src/data/marketing.json by scripts/prebuild.mjs) is their seed and the
 * fallback when the API is unreachable, and still holds the testimonials. A claim without a `source` is printed with
 * an "indicative figure" footnote.
 * Every other number on the site (prices, savings ranges, hospital counts, accreditation counts) is computed from the
 * catalogue data (API or fallback), not typed in by hand.
 */
import raw from '@/data/marketing.json';
import { requestLocale } from '@/i18n/request';

export interface Testimonial {
  quote: string;
  name: string;
  detail: string;
}

interface MarketingTranslation {
  india_wait?: string;
  testimonials?: Testimonial[];
}

interface MarketingFile {
  india_wait?: string | { en?: string };
  /** A list; the legacy `{ "en": [...] }` shape is still accepted. */
  testimonials?: Testimonial[] | { en?: Testimonial[] };
  /** content/site/marketing.<lng>.json, merged in by scripts/prebuild.mjs */
  translations?: Record<string, MarketingTranslation>;
}

const file = raw as MarketingFile;

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    quote: 'My coordinator arranged the visa letter, airport pickup and an interpreter. I only had to focus on recovery.',
    name: 'Illustrative patient',
    detail: 'Knee replacement',
  },
];

export const marketing = {
  /** Featured procedures for the home-page savings examples (slugs; skipped when missing from the catalogue). */
  savingsExampleProcedures: ['cabg', 'total-knee-replacement', 'ivf-cycle', 'dental-implants'],
  /** Home country used for the savings examples and the hero comparison card. */
  savingsExampleCountry: 'US',
  /** Procedure used in the hero "Treatment in USA vs India" card (design: Cost Comparison screen). */
  heroComparisonProcedure: 'cabg',
} as const;

/** Testimonials (always labelled "Illustrative") in the page language when translated; shown when the
 * `show_testimonials` claim setting is on. */
export function testimonials(locale: string = requestLocale()): Testimonial[] {
  const translated = locale !== 'en' ? file.translations?.[locale]?.testimonials : undefined;
  if (Array.isArray(translated) && translated.length) return translated;
  const t = file.testimonials;
  const list = Array.isArray(t) ? t : t?.en;
  return Array.isArray(list) && list.length ? list : DEFAULT_TESTIMONIALS;
}

/**
 * The "typical wait in India" claim in the page language. `value` is the live (English) site setting; it is
 * replaced by the translation only while it still equals the seed text in marketing.json, so an edited English
 * claim is never paired with an outdated translation (`fallback`, e.g. the dictionary text, is used when the
 * language has no translated claim).
 */
export function localizedIndiaWait(value: string, fallback: string, locale: string = requestLocale()): string {
  if (!value) return fallback;
  if (locale === 'en') return value;
  const english = typeof file.india_wait === 'string' ? file.india_wait : file.india_wait?.en;
  if (value !== english) return value;
  return file.translations?.[locale]?.india_wait || fallback;
}
