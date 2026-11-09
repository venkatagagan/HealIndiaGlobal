import { api, getApiBaseUrl } from '../client';
import type { HealthOut } from '../types';

/**
 * The health probes are served at the API ORIGIN root (`/health/live`), not under the `/api/v1` base path, so the
 * URL is made absolute here (the client prefixes only relative paths). Note: the Vite dev proxy forwards `/api` only.
 */
function rootUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/api\/v\d+$/, '');
  const origin = /^https?:\/\//i.test(base) ? base : `${globalThis.location?.origin ?? ''}${base}`;
  return `${origin}${path}`;
}

/** PLAN 8.14 - health endpoints. */
export const systemApi = {
  live: () => api.get<HealthOut>(rootUrl('/health/live'), null, { skipAuth: true }),
  ready: () => api.get<HealthOut>(rootUrl('/health/ready'), null, { skipAuth: true }),
};
