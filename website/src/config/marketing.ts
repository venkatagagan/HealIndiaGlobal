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

export interface Testimonial {
  quote: string;
  name: string;
  detail: string;
}

interface MarketingFile {
  /** A list; the legacy `{ "en": [...] }` shape is still accepted. */
  testimonials?: Testimonial[] | { en?: Testimonial[] };
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

/** Testimonials (always labelled "Illustrative"); shown when the `show_testimonials` claim setting is on. */
export function testimonials(): Testimonial[] {
  const t = file.testimonials;
  const list = Array.isArray(t) ? t : t?.en;
  return Array.isArray(list) && list.length ? list : DEFAULT_TESTIMONIALS;
}
