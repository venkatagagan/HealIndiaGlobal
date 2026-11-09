/** schema.org builders for the content-growth pages (procedure x city, cost guides). No ratings or reviews. */
import { SITE_URL } from '@/config/site';
import { absoluteUrl } from '@/lib/seo';
import { ORG_ID } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import type { HospitalDetail } from '@/lib/data/types';
import type { Intro } from './collections';

type Json = Record<string, unknown>;

/** ItemList of the partner hospitals offering a procedure in a destination. */
export function hospitalItemListLd(name: string, hospitals: HospitalDetail[]): Json | null {
  if (!hospitals.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: hospitals.length,
    itemListElement: hospitals.map((h, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Hospital',
        name: h.name,
        url: absoluteUrl(href(routes.hospital(h.slug))),
        address: {
          '@type': 'PostalAddress',
          addressLocality: h.city,
          ...(h.state ? { addressRegion: h.state } : {}),
          addressCountry: 'IN',
        },
      },
    })),
  };
}

/**
 * MedicalWebPage for a growth page. `reviewedBy`/`lastReviewed` are only emitted for an approved intro credited to a
 * real, active reviewer from the site settings (never a placeholder, never hard-coded).
 */
export function growthWebPageLd(opts: { path: string; name: string; description: string; about: Json; intro: Intro | null }): Json {
  const url = absoluteUrl(opts.path);
  const review = opts.intro?.reviewed ? opts.intro.review : null;
  const r = review?.reviewer ?? null;
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    '@id': `${url}#webpage`,
    name: opts.name,
    description: opts.description,
    url,
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': ORG_ID },
    about: opts.about,
    ...(r && review?.reviewedAt
      ? {
          lastReviewed: review.reviewedAt,
          reviewedBy: {
            '@type': 'Person',
            name: r.name,
            honorificSuffix: r.credentials,
            hasCredential: {
              '@type': 'EducationalOccupationalCredential',
              credentialCategory: 'Medical registration',
              identifier: r.registration.number,
              recognizedBy: { '@type': 'Organization', name: r.registration.council },
            },
          },
        }
      : {}),
    ...(review?.sources.length ? { citation: review.sources.map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url })) } : {}),
  };
}
