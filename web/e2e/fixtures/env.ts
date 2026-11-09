/**
 * Where the stack under test lives. Every value can be overridden with an environment variable so the same suite
 * runs against the Vite dev servers (default), `vite preview` builds, or a deployed same-origin stack.
 *
 * PLAN 3.1 serves the SPAs under base paths (`/app/`, `/agent/`, `/hospital/`, `/gahi/`). global-setup.ts detects
 * whether a dev server uses its base path (Vite answers `GET /` with a 302 to the base) and exports the detected
 * roots as E2E_*_URL for the workers, so the suite works before and after the base paths are introduced.
 */

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export type PortalName = 'patient' | 'agent' | 'hospital' | 'admin';

/** Dev-server origins (one Vite server per portal). */
export const ORIGINS: Record<PortalName, string> = {
  patient: new URL(process.env.E2E_PATIENT_URL ?? 'http://localhost:5173').origin,
  agent: new URL(process.env.E2E_AGENT_URL ?? 'http://localhost:5174').origin,
  hospital: new URL(process.env.E2E_HOSPITAL_URL ?? 'http://localhost:5175').origin,
  admin: new URL(process.env.E2E_ADMIN_URL ?? 'http://localhost:5176').origin,
};

/** Base path each SPA uses per PLAN 3.1 (the patient portal's routes already carry `/app` themselves). */
export const PLAN_BASE_PATHS: Record<PortalName, string> = { patient: '', agent: '/agent', hospital: '/hospital', admin: '/gahi' };

export const ENV_KEYS: Record<PortalName, string> = {
  patient: 'E2E_PATIENT_URL',
  agent: 'E2E_AGENT_URL',
  hospital: 'E2E_HOSPITAL_URL',
  admin: 'E2E_ADMIN_URL',
};

/**
 * Root URL of each SPA (origin + router basename). Paths passed to `url()` are relative to it, e.g.
 * url('agent', '/patients') -> http://localhost:5174/agent/patients. Patient-portal paths keep their `/app` prefix
 * (url('patient', '/app/cases')) and public pages are addressed with `publicUrl()`.
 */
export const PORTALS: Record<PortalName, string> = {
  patient: trimSlash(process.env.E2E_PATIENT_URL ?? ORIGINS.patient),
  agent: trimSlash(process.env.E2E_AGENT_URL ?? `${ORIGINS.agent}${PLAN_BASE_PATHS.agent}`),
  hospital: trimSlash(process.env.E2E_HOSPITAL_URL ?? `${ORIGINS.hospital}${PLAN_BASE_PATHS.hospital}`),
  admin: trimSlash(process.env.E2E_ADMIN_URL ?? `${ORIGINS.admin}${PLAN_BASE_PATHS.admin}`),
};

/** Absolute URL of a page inside a portal. */
export function url(portal: PortalName, path = '/'): string {
  return `${PORTALS[portal]}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The public website tested by tests/patient-web/public (set E2E_PUBLIC_SITE_URL to the website service). */
export const PUBLIC_SITE = trimSlash(process.env.E2E_PUBLIC_SITE_URL ?? ORIGINS.patient);

export function publicUrl(path = '/'): string {
  return `${PUBLIC_SITE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * PLAN 3.1 public door (website login used by patients, agents and hospital users once the portals drop their own
 * login forms). Unauthenticated portal visits are redirected here with `?next=`.
 */
export const PUBLIC_LOGIN_URL = trimSlash(process.env.E2E_PUBLIC_LOGIN_URL ?? 'http://localhost:3000/login');

/** The API used for test-data setup (direct, not through a Vite proxy). Includes the /api/v1 prefix. */
export const API_URL = trimSlash(process.env.E2E_API_URL ?? 'http://127.0.0.1:8000/api/v1');

/** Server root of the API (health endpoints live at /health/live, outside /api/v1). */
export const API_ROOT = API_URL.replace(/\/api\/v1$/, '');

/** Same API, as seen by a portal (through its own origin / Vite proxy). Login through this sets the cookie. */
export function portalApiUrl(portal: PortalName): string {
  return `${ORIGINS[portal]}/api/v1`;
}

/** Password shared by every seeded demo account (backend/scripts/seed.py). */
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'HealIndia@2026';

/** Domain of seeded demo accounts; e2e-created users use the same domain so they are easy to spot/clean. */
export const DEMO_EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? 'healindia.example';

export const IS_CI = !!process.env.CI;

/** httpOnly refresh cookies (PLAN 3 / 3.1): public door and staff door. */
export const REFRESH_COOKIE = 'hig_refresh';
export const STAFF_REFRESH_COOKIE = 'hig_staff_refresh';
