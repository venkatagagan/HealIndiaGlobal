import 'server-only';

/**
 * Website & contact settings, edited by a super admin in the staff console (System -> Website & contact) and read
 * from the public API: GET ${API_BASE_URL}/site-config (fetch tag `site`). The backend asks POST /api/revalidate to
 * expire that tag after every change, so edits show up within seconds without a redeploy; without on-demand
 * revalidation they still arrive after SITE_CONFIG_REVALIDATE_SECONDS (default 300).
 *
 * Fallbacks: when the API is unreachable, or a value is unset (empty) in the settings, the environment variables
 * documented in .env.example apply (NEXT_PUBLIC_WHATSAPP_NUMBER, NEXT_PUBLIC_CONTACT_EMAIL, NEXT_PUBLIC_ANALYTICS_*,
 * GOOGLE_SITE_VERIFICATION, ...), then the seed files src/data/marketing.json and src/data/reviewers.json (copied
 * from content/site/ by scripts/prebuild.mjs). A phone number that is unset everywhere hides its button.
 */
import { cache } from 'react';
import { CONTACT_EMAIL, DEVELOPER, PHONE_NUMBER, SOCIAL_PROFILES, WHATSAPP_NUMBER } from '@/config/site';
import { envAnalyticsConfig, resolveAnalytics, type AnalyticsConfig } from '@/config/analytics';
import marketingFile from '@/data/marketing.json';
import reviewersFile from '@/data/reviewers.json';

export const SITE_TAG = 'site';
const REVALIDATE_SECONDS = Number(process.env.SITE_CONFIG_REVALIDATE_SECONDS || 300);
const API_BASE = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1')
  .trim()
  .replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 4000);

/** Numbers that shipped as placeholder defaults; never shown even if they come back from an old configuration. */
const PLACEHOLDER_NUMBERS = new Set(['+91-11-4000-0000', '+91-90000-00000']);

export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'linkedin', 'x', 'youtube'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export interface MarketingStat {
  id: string;
  label: string;
  /** Displayed as-is, e.g. "5,000+". */
  value: string;
  /** Where the number comes from; empty = shown with the "indicative figure" footnote. */
  source: string;
  show: boolean;
}

export interface MarketingConfig {
  claimsVerified: boolean;
  maxSavingsPct: number;
  maxSavingsSource: string;
  showMaxSavings: boolean;
  stats: MarketingStat[];
  indiaWait: string;
  showTestimonials: boolean;
}

/** A medical reviewer as configured (public view: active reviewers only). */
export interface ReviewerEntry {
  id: string;
  name: string;
  credentials: string;
  registrationNumber: string;
  registrationCouncil: string;
  bio: string;
  photo: string;
}

export interface SiteConfig {
  contact: {
    /** Digits only, for wa.me links (empty = not configured: the WhatsApp button and footer link are hidden). */
    whatsapp: string;
    whatsappDisplay: string;
    /** tel: target, + and digits (empty = not configured: the Call button and footer link are hidden). */
    phone: string;
    phoneDisplay: string;
    emergency: string;
    email: string;
    supportHours: string;
    /** Prefilled WhatsApp message (empty = the dictionary default). */
    whatsappMessage: string;
    showWhatsappButton: boolean;
    showCallButton: boolean;
  };
  /** https profile URLs in display order (footer icons and Organization JSON-LD sameAs). */
  social: { network: string; url: string }[];
  analytics: AnalyticsConfig;
  verification: { google: string; bing: string };
  marketing: MarketingConfig;
  reviewers: ReviewerEntry[];
  footer: { developerName: string; developerUrl: string; disclaimer: string };
  source: 'api' | 'fallback';
}

// ------------------------------------------------------------------------------------------------ helpers
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isHttps = (v: string) => /^https:\/\/[^\s]+$/.test(v);

function numberParts(value: string): { display: string; digits: string } {
  const display = value.trim();
  if (!display || PLACEHOLDER_NUMBERS.has(display)) return { display: '', digits: '' };
  return { display, digits: display.replace(/\D/g, '') };
}

function whatsappOf(value: string): { whatsapp: string; whatsappDisplay: string } {
  const { display, digits } = numberParts(value);
  return digits.length >= 8 && digits.length <= 15 ? { whatsapp: digits, whatsappDisplay: display } : { whatsapp: '', whatsappDisplay: '' };
}

function phoneOf(value: string): { phone: string; phoneDisplay: string } {
  const { display, digits } = numberParts(value);
  if (digits.length < 6 || digits.length > 15) return { phone: '', phoneDisplay: '' };
  return { phone: `${display.startsWith('+') ? '+' : ''}${digits}`, phoneDisplay: display };
}

function socialFrom(map: Record<string, unknown> | null): { network: string; url: string }[] {
  const fromApi = map
    ? SOCIAL_NETWORKS.map((network) => ({ network, url: str(map[network]) })).filter((s) => isHttps(s.url))
    : [];
  if (fromApi.length) return fromApi;
  return SOCIAL_PROFILES.map((url) => ({ network: '', url }));
}

// ------------------------------------------------------------------------------------------- seed files
interface MarketingFile {
  claims_verified?: boolean;
  max_savings_pct?: { value?: number; source?: string; show?: boolean };
  stats?: { id?: string; label?: string; value?: string; source?: string; show?: boolean }[];
  india_wait?: string | { en?: string };
  show_testimonials?: boolean;
}

const STAT_LABELS: Record<string, string> = { patientsTreated: 'Patients treated' };

/** content/site/marketing.json and the API's `marketing` object share this (snake_case) shape. */
function marketingFrom(raw: unknown): MarketingConfig {
  const m = raw as MarketingFile;
  const savings = obj(m.max_savings_pct);
  const pct = Number(savings.value ?? 70);
  const wait = typeof m.india_wait === 'string' ? m.india_wait : (m.india_wait?.en ?? '');
  return {
    claimsVerified: m.claims_verified === true,
    maxSavingsPct: Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct))) : 70,
    maxSavingsSource: str(savings.source),
    showMaxSavings: savings.show !== false,
    stats: (Array.isArray(m.stats) ? m.stats : [])
      .map((s) => ({
        id: str(s?.id),
        label: str(s?.label) || STAT_LABELS[str(s?.id)] || '',
        value: str(s?.value),
        source: str(s?.source),
        show: s?.show !== false,
      }))
      .filter((s) => s.id && s.label && s.value),
    indiaWait: str(wait),
    showTestimonials: m.show_testimonials !== false,
  };
}

interface ReviewerFileEntry {
  id?: unknown;
  placeholder?: unknown;
  name?: unknown;
  credentials?: unknown;
  registration?: { number?: unknown; council?: unknown } | null;
  bio?: unknown;
  photo?: unknown;
}

function reviewersFromFile(raw: unknown): ReviewerEntry[] {
  const list = ((raw as { reviewers?: ReviewerFileEntry[] }).reviewers ?? []) as ReviewerFileEntry[];
  return list
    .filter((r) => r.placeholder !== true)
    .map((r) => ({
      id: str(r.id),
      name: str(r.name),
      credentials: str(r.credentials),
      registrationNumber: str(r.registration?.number),
      registrationCouncil: str(r.registration?.council),
      bio: str(r.bio),
      photo: str(r.photo),
    }));
}

/** Reviewers from the seed file src/data/reviewers.json (used when the API is unreachable). */
export function fallbackReviewers(): ReviewerEntry[] {
  return reviewersFromFile(reviewersFile);
}

function reviewersFromApi(raw: unknown): ReviewerEntry[] {
  return (Array.isArray(raw) ? raw : [])
    .map(obj)
    .filter((r) => r.active === true)
    .map((r) => ({
      id: str(r.id),
      name: str(r.name),
      credentials: str(r.credentials),
      registrationNumber: str(r.registration_number),
      registrationCouncil: str(r.registration_council),
      bio: str(r.bio),
      photo: str(r.photo_url),
    }));
}

// ------------------------------------------------------------------------------------------------- build
/** Combine the API payload (or null when unreachable) with the environment and seed-file fallbacks. */
export function buildSiteConfig(api: Record<string, unknown> | null): SiteConfig {
  const contact = obj(api?.contact);
  const analytics = obj(api?.analytics);
  const verification = obj(api?.verification);
  const footer = obj(api?.footer);
  const provider = str(analytics.provider).toLowerCase();
  return {
    contact: {
      ...whatsappOf(str(contact.whatsapp) || WHATSAPP_NUMBER),
      ...phoneOf(str(contact.phone) || PHONE_NUMBER),
      emergency: str(contact.emergency) || '112',
      email: str(contact.email) || CONTACT_EMAIL,
      supportHours: str(contact.support_hours),
      whatsappMessage: str(contact.whatsapp_message),
      showWhatsappButton: contact.show_whatsapp_button !== false,
      showCallButton: contact.show_call_button !== false,
    },
    social: socialFrom(api ? obj(api.social) : null),
    // "none" in the settings means "not configured here": the NEXT_PUBLIC_ANALYTICS_* environment still applies.
    analytics:
      provider === 'plausible' || provider === 'ga4'
        ? resolveAnalytics({
            provider,
            plausibleDomain: str(analytics.plausible_domain),
            plausibleScriptUrl: str(analytics.plausible_script_url),
            ga4MeasurementId: str(analytics.ga4_measurement_id),
          })
        : envAnalyticsConfig(),
    verification: {
      google: str(verification.google) || process.env.GOOGLE_SITE_VERIFICATION?.trim() || '',
      bing: str(verification.bing) || process.env.BING_SITE_VERIFICATION?.trim() || '',
    },
    marketing: api && api.marketing && typeof api.marketing === 'object' ? marketingFrom(api.marketing) : marketingFrom(marketingFile),
    reviewers: api && Array.isArray(api.reviewers) ? reviewersFromApi(api.reviewers) : reviewersFromFile(reviewersFile),
    footer: {
      developerName: str(footer.developer_name) || DEVELOPER.name,
      developerUrl: isHttps(str(footer.developer_url)) ? str(footer.developer_url) : DEVELOPER.url,
      disclaimer: str(footer.disclaimer),
    },
    source: api ? 'api' : 'fallback',
  };
}

let unreachableUntil = 0;

async function fetchSiteConfig(): Promise<Record<string, unknown> | null> {
  if (Date.now() < unreachableUntil) return null;
  try {
    const res = await fetch(`${API_BASE}/site-config`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS, tags: [SITE_TAG] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    return obj(body);
  } catch (err) {
    unreachableUntil = Date.now() + 15_000;
    console.warn(`[site-config] using environment fallbacks (${(err as Error).message})`);
    return null;
  }
}

/** Website configuration for this render (one API call per request, cached with the `site` tag). */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => buildSiteConfig(await fetchSiteConfig()));

/**
 * Server-only values (the IndexNow key) from GET /site-config/server, authenticated with REVALIDATE_SECRET.
 * Null when the secret is not configured or the API is unreachable.
 */
export const getServerSiteConfig = cache(async (): Promise<{ indexnowKey: string } | null> => {
  const secret = process.env.REVALIDATE_SECRET?.trim() ?? '';
  if (secret.length < 32) return null;
  try {
    const res = await fetch(`${API_BASE}/site-config/server`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${secret}` },
      next: { revalidate: REVALIDATE_SECONDS, tags: [SITE_TAG] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return { indexnowKey: str(obj(await res.json()).indexnow_key) };
  } catch {
    return null;
  }
});
