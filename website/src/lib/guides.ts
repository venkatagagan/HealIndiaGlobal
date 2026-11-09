/** Website patient-guide slugs (/guides/<slug>), in display order. Titles live in the dictionaries (guides.items). */
export const GUIDE_SLUGS = [
  'pre-arrival',
  'visa',
  'in-country',
  'payments-and-refunds',
  'post-treatment-care',
  'privacy-in-plain-language',
] as const;

export type GuideSlug = (typeof GUIDE_SLUGS)[number];

export function isGuideSlug(value: string): value is GuideSlug {
  return (GUIDE_SLUGS as readonly string[]).includes(value);
}
