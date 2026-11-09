/**
 * Deployment-dependent settings. NEXT_PUBLIC_* values are inlined at build time (client and server bundles),
 * so changing them requires a rebuild. Server-only values (API_BASE_URL, DATA_FALLBACK) are read at runtime.
 */

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function env(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

export const SITE_NAME = 'Heal India Global';
export const SITE_TAGLINE = 'Your Gateway to Indian Medical Excellence';

/** Canonical origin used for canonical URLs, sitemap and OpenGraph (no trailing slash). */
export const SITE_URL = env(process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Portal base URLs (PLAN §3.1). In production these are same-origin paths on one domain
 * (e.g. https://healindiaglobal.com/app/); in dev each SPA runs on its own port.
 */
export const PORTALS = {
  patient: withTrailingSlash(env(process.env.NEXT_PUBLIC_PATIENT_APP_URL, 'http://localhost:5173/app/')),
  agent: withTrailingSlash(env(process.env.NEXT_PUBLIC_AGENT_PORTAL_URL, 'http://localhost:5174/agent/')),
  hospital: withTrailingSlash(env(process.env.NEXT_PUBLIC_HOSPITAL_PORTAL_URL, 'http://localhost:5175/hospital/')),
} as const;

export type PortalRole = keyof typeof PORTALS;

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';

/*
 * FALLBACKS for the website & contact settings. The live values are edited by a super admin in the staff console
 * (System -> Website & contact) and read through src/lib/site-config.ts; the values below apply only when the API is
 * unreachable or the setting is unset (empty).
 */
/** Public contact email. The default is a placeholder on the reserved .example domain. */
export const CONTACT_EMAIL = env(process.env.NEXT_PUBLIC_CONTACT_EMAIL, 'care@healindiaglobal.example');
/** Helpline numbers for the floating WhatsApp / Call buttons and the footer (international format, e.g. +91 90000 00000). */
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() || '';
export const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER?.trim() || '';
/** Credit link in the footer's bottom bar. */
export const DEVELOPER = { name: 'DV Soft', url: 'https://dvsoft.in' } as const;
/** Public API base for browser calls, e.g. "/api/v1" (same origin behind the edge nginx) or an absolute URL. */
const PUBLIC_API_BASE = (process.env.NEXT_PUBLIC_API_BASE?.trim() || '').replace(/\/+$/, '');
/**
 * Where the contact form POSTs its JSON: NEXT_PUBLIC_CONTACT_ENDPOINT when set, else the API's public
 * `POST {NEXT_PUBLIC_API_BASE}/site/enquiries`. Empty only when neither is set (the form then opens a mailto: link).
 */
export const CONTACT_ENDPOINT =
  process.env.NEXT_PUBLIC_CONTACT_ENDPOINT?.trim() || (PUBLIC_API_BASE ? `${PUBLIC_API_BASE}/site/enquiries` : '');

/** Public social profiles (footer icons, Organization JSON-LD `sameAs`; comma separated). Fallback, see above. */
export const SOCIAL_PROFILES = (process.env.NEXT_PUBLIC_SOCIAL_PROFILES || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => /^https:\/\//.test(s));

/** Set SITE_NOINDEX=true on staging deployments: robots.txt disallows everything and pages get noindex. */
export const SITE_NOINDEX = process.env.SITE_NOINDEX === 'true';

/** Free AI assessment entry point in the patient portal (PLAN §10: /app/screening/new?specialty=). */
export function assessmentUrl(specialty?: string | null): string {
  const url = new URL('screening/new', PORTALS.patient);
  if (specialty) url.searchParams.set('specialty', specialty);
  return url.toString();
}

/** Official Government of India e-Visa portal (the only place to apply). */
export const OFFICIAL_EVISA_URL = 'https://indianvisaonline.gov.in/evisa/';
export const JCI_URL = 'https://www.jointcommissioninternational.org/';
export const NABH_URL = 'https://nabh.co/';
