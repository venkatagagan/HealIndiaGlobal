/**
 * Provider-neutral analytics, OFF by default (no third-party script is loaded unless configured).
 *
 * Configured by a super admin in the staff console (System -> Website & contact -> Analytics; read through
 * src/lib/site-config.ts). When the setting is "none" or the API is unreachable, these environment variables apply:
 *
 *   NEXT_PUBLIC_ANALYTICS_PROVIDER = plausible | ga4 | (empty = off)
 *   plausible: cookieless, no consent banner. NEXT_PUBLIC_PLAUSIBLE_DOMAIN (default: host of NEXT_PUBLIC_SITE_URL),
 *              NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL (default https://plausible.io/js/script.js; self-hosted works too).
 *   ga4:       NEXT_PUBLIC_GA4_MEASUREMENT_ID (G-XXXXXXX). Loaded only after the visitor accepts the consent banner;
 *              Google consent mode v2 defaults are all "denied" and only analytics_storage is granted on accept.
 *
 * The Content-Security-Policy is built per request in src/proxy.ts from the same configuration, so it only allows the
 * configured provider's origins.
 */
import { SITE_URL } from './site';

export type AnalyticsConfig =
  | { provider: 'plausible'; domain: string; scriptUrl: string }
  | { provider: 'ga4'; measurementId: string }
  | { provider: 'off' };

export interface AnalyticsInput {
  provider: string;
  plausibleDomain?: string;
  plausibleScriptUrl?: string;
  ga4MeasurementId?: string;
}

export const DEFAULT_PLAUSIBLE_SCRIPT = 'https://plausible.io/js/script.js';
export const GA4_ID = /^G-[A-Z0-9]{4,20}$/;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Validate a provider configuration (invalid or incomplete = off). */
export function resolveAnalytics(input: AnalyticsInput): AnalyticsConfig {
  const provider = input.provider.trim().toLowerCase();
  if (provider === 'plausible') {
    const domain = input.plausibleDomain?.trim() || hostOf(SITE_URL);
    const scriptUrl = input.plausibleScriptUrl?.trim() || DEFAULT_PLAUSIBLE_SCRIPT;
    if (domain && /^https:\/\/[^\s]+$/.test(scriptUrl)) return { provider: 'plausible', domain, scriptUrl };
  }
  if (provider === 'ga4') {
    const measurementId = input.ga4MeasurementId?.trim().toUpperCase() ?? '';
    if (GA4_ID.test(measurementId)) return { provider: 'ga4', measurementId };
  }
  return { provider: 'off' };
}

/** Analytics from the environment only (fallback when the site settings do not configure a provider). */
export function envAnalyticsConfig(): AnalyticsConfig {
  return resolveAnalytics({
    provider: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? '',
    plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    plausibleScriptUrl: process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,
    ga4MeasurementId: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
  });
}

/** CSP source lists the provider needs (script-src, connect-src, img-src). */
export function analyticsCspSources(config: AnalyticsConfig): { script: string[]; connect: string[]; img: string[] } {
  if (config.provider === 'plausible') {
    let origin = '';
    try {
      origin = new URL(config.scriptUrl).origin;
    } catch {
      origin = '';
    }
    return origin ? { script: [origin], connect: [origin], img: [] } : { script: [], connect: [], img: [] };
  }
  if (config.provider === 'ga4') {
    return {
      script: ['https://www.googletagmanager.com'],
      connect: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
      img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
    };
  }
  return { script: [], connect: [], img: [] };
}
