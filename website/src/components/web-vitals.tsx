'use client';

import { useReportWebVitals } from 'next/web-vitals';

/**
 * Real-user Core Web Vitals (LCP, INP, CLS, FCP, TTFB). OFF unless NEXT_PUBLIC_WEB_VITALS_URL is set (build time);
 * rendered by the root layout only then. Privacy-safe: sends the metric, its rating, the page path (no query string,
 * no fragment) and a random per-page-view id - no cookies (credentials: 'omit'), no user or device identifiers.
 * NEXT_PUBLIC_WEB_VITALS_SAMPLE (0-1, default 1) samples page views.
 */
const ENDPOINT = process.env.NEXT_PUBLIC_WEB_VITALS_URL?.trim() || '';
const SAMPLE = Math.min(1, Math.max(0, Number(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE ?? '1') || 0));
let sampled: boolean | null = null;

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (!ENDPOINT) return;
    sampled ??= Math.random() < SAMPLE;
    if (!sampled) return;
    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value) / (metric.name === 'CLS' ? 1000 : 1),
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
      path: window.location.pathname,
    });
    try {
      void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json' } });
    } catch {
      /* reporting must never break the page */
    }
  });
  return null;
}
