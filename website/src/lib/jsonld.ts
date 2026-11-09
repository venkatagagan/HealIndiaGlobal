/**
 * schema.org JSON-LD builders. The platform is described as an Organization (a facilitator), never as a
 * medical provider; Hospital/Physician entities describe partner hospitals and their doctors.
 */
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/config/site';
import { absoluteUrl } from './seo';
import { toNumber } from './money';
import type { DoctorDetail, HospitalDetail, Procedure } from './data/types';

type Json = Record<string, unknown>;

export const ORG_ID = `${SITE_URL}/#organization`;

/** `site`: contact email and social profiles from the site settings (src/lib/site-config.ts). */
export function organizationLd(site: { contact: { email: string }; social: { url: string }[] }): Json {
  const sameAs = site.social.map((s) => s.url);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    slogan: SITE_TAGLINE,
    url: SITE_URL,
    // Raster logo (Google requires a crawlable image of at least 112x112 px): src/app/icons/[name]/route.tsx.
    logo: { '@type': 'ImageObject', url: absoluteUrl('/icons/icon-512.png'), width: 512, height: 512 },
    description:
      'Medical-travel facilitation platform connecting international patients with partner hospitals in India.',
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: site.contact.email, availableLanguage: ['English'] }],
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    inLanguage: 'en',
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl(`/search`)}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface Crumb {
  name: string;
  /** Site path, e.g. "/treatments". */
  path: string;
}

export function breadcrumbLd(items: Crumb[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqLd(items: { question: string; answer: string }[]): Json | null {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

const BODY_AREA_LABELS: Record<string, string> = {
  head: 'Head',
  neck: 'Neck',
  chest: 'Chest',
  abdomen: 'Abdomen',
  pelvis: 'Pelvis',
  back: 'Back',
  left_arm: 'Arm',
  right_arm: 'Arm',
  left_leg: 'Leg',
  right_leg: 'Leg',
  skin: 'Skin',
};

export function medicalProcedureLd(p: Procedure & { body_areas?: string[] }, path: string): Json {
  const areas = [...new Set((p.body_areas ?? []).map((a) => BODY_AREA_LABELS[a]).filter(Boolean))];
  return {
    '@context': 'https://schema.org',
    '@type': 'MedicalProcedure',
    '@id': `${absoluteUrl(path)}#procedure`,
    name: p.name,
    description: p.description,
    url: absoluteUrl(path),
    ...(areas.length ? { bodyLocation: areas.join(', ') } : {}),
    howPerformed: p.description,
  };
}

export function hospitalLd(h: HospitalDetail, path: string, includeRating: boolean): Json {
  const rating = toNumber(h.rating_avg);
  return {
    '@context': 'https://schema.org',
    '@type': 'Hospital',
    '@id': `${absoluteUrl(path)}#hospital`,
    name: h.name,
    url: absoluteUrl(path),
    ...(h.description ? { description: h.description } : {}),
    ...(imageUrl(h.cover_image_url) ?? imageUrl(h.logo_url) ? { image: imageUrl(h.cover_image_url) ?? imageUrl(h.logo_url) } : {}),
    ...(imageUrl(h.logo_url) ? { logo: imageUrl(h.logo_url) } : {}),
    ...(h.established_year ? { foundingDate: String(h.established_year) } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(h.address ? { streetAddress: h.address } : {}),
      addressLocality: h.city,
      ...(h.state ? { addressRegion: h.state } : {}),
      addressCountry: 'IN',
    },
    ...(h.lat !== null && h.lng !== null ? { geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng } } : {}),
    medicalSpecialty: h.specialties,
    availableService: h.procedures.slice(0, 30).map((p) => ({ '@type': 'MedicalProcedure', name: p.procedure.name })),
    ...(h.accreditations.length ? { hasCredential: h.accreditations.map((a) => ({ '@type': 'EducationalOccupationalCredential', credentialCategory: 'accreditation', name: a.toUpperCase() })) } : {}),
    ...(h.languages.length ? { knowsLanguage: h.languages } : {}),
    ...(includeRating && rating && h.rating_count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount: h.rating_count, bestRating: 5 } }
      : {}),
  };
}

/** Absolute http(s) image URL, or a site-relative one made absolute; anything else is dropped. */
function imageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith('/') ? absoluteUrl(value) : null;
}

export function physicianLd(d: DoctorDetail, path: string, hospitalPath: string | null): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    '@id': `${absoluteUrl(path)}#physician`,
    name: d.full_name,
    url: absoluteUrl(path),
    ...(d.bio ? { description: d.bio } : {}),
    ...(imageUrl(d.photo_url) ? { image: imageUrl(d.photo_url) } : {}),
    // Physician is a LocalBusiness type in schema.org: the practice address is the affiliated hospital's city.
    ...(d.hospital ? { address: { '@type': 'PostalAddress', addressLocality: d.hospital.city, addressCountry: 'IN' } } : {}),
    ...(d.specialty ? { medicalSpecialty: d.specialty.name } : {}),
    ...(d.languages.length ? { knowsLanguage: d.languages } : {}),
    ...(d.qualifications.length ? { hasCredential: d.qualifications.map((q) => ({ '@type': 'EducationalOccupationalCredential', name: q })) } : {}),
    ...(d.hospital
      ? {
          hospitalAffiliation: {
            '@type': 'Hospital',
            name: d.hospital.name,
            address: { '@type': 'PostalAddress', addressLocality: d.hospital.city, addressCountry: 'IN' },
            ...(hospitalPath ? { url: absoluteUrl(hospitalPath) } : {}),
          },
        }
      : {}),
  };
}
