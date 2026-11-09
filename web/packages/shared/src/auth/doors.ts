/**
 * Access doors & URL layout (PLAN 3.1 - authoritative).
 *
 * - PUBLIC door: the website login (`/login`) for patients, agents and hospital users. The patient, agent and
 *   hospital portals have no login form: unauthenticated visitors go to `${VITE_PUBLIC_LOGIN_URL}?next=<url>`.
 *   Endpoints: POST /auth/login | /auth/refresh | /auth/logout (cookie `hig_refresh`).
 * - STAFF door: the admin console at `/gahi` with its own login (email + password + TOTP).
 *   Endpoints: POST /auth/staff/login | /auth/staff/refresh | /auth/staff/logout (cookie `hig_staff_refresh`).
 *
 * URLs come from Vite env vars when set, else the PLAN dev defaults (dev server) or same-origin paths
 * (production build behind nginx).
 */
import { ApiError } from '../api/client';
import { STAFF_ROLES, type RegistrableRole, type StaffRole, type UserRole } from '../api/enums';

export type AuthDoor = 'public' | 'staff';

export const AUTH_DOOR_ENDPOINTS = {
  public: { login: '/auth/login', refresh: '/auth/refresh', logout: '/auth/logout' },
  staff: { login: '/auth/staff/login', refresh: '/auth/staff/refresh', logout: '/auth/staff/logout' },
} as const satisfies Record<AuthDoor, { login: string; refresh: string; logout: string }>;

/** PLAN 3.1 development URLs (separate ports; cookies are host-scoped so they are shared). */
export const DEV_URLS = {
  website: 'http://localhost:3000/',
  login: 'http://localhost:3000/login',
  register: 'http://localhost:3000/register',
  forgotPassword: 'http://localhost:3000/forgot-password',
  patient: 'http://localhost:5173/app/',
  agent: 'http://localhost:5174/agent/',
  hospital: 'http://localhost:5175/hospital/',
  admin: 'http://localhost:5176/gahi/',
} as const;

/** Production paths (one domain, nginx path routing). */
export const PROD_PATHS = {
  website: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  patient: '/app/',
  agent: '/agent/',
  hospital: '/hospital/',
  admin: '/gahi/',
} as const;

type UrlKey = keyof typeof DEV_URLS;

function viteEnv(): Record<string, unknown> {
  try {
    return (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  } catch {
    return {};
  }
}

function envValue(...names: string[]): string | undefined {
  const env = viteEnv();
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function isDevBuild(): boolean {
  return viteEnv().DEV === true;
}

function sameOrigin(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

function defaultUrl(key: UrlKey): string {
  return isDevBuild() ? DEV_URLS[key] : sameOrigin(PROD_PATHS[key]);
}

export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Website login (public door): `VITE_PUBLIC_LOGIN_URL`, default `http://localhost:3000/login` in dev. */
export function publicLoginUrl(): string {
  return envValue('VITE_PUBLIC_LOGIN_URL') ?? defaultUrl('login');
}

/** Website registration: `VITE_PUBLIC_REGISTER_URL`, else `<website>/register`. Add `?role=agent|hospital|patient`. */
export function publicRegisterUrl(role?: RegistrableRole): string {
  const base = envValue('VITE_PUBLIC_REGISTER_URL') ?? defaultUrl('register');
  return role ? `${base}${base.includes('?') ? '&' : '?'}role=${role}` : base;
}

export function forgotPasswordUrl(): string {
  return envValue('VITE_PUBLIC_FORGOT_PASSWORD_URL') ?? defaultUrl('forgotPassword');
}

/** Website home (where a public-door logout lands). */
export function websiteUrl(): string {
  return envValue('VITE_WEBSITE_URL', 'VITE_PUBLIC_SITE_URL') ?? defaultUrl('website');
}

/** Portal base URL per role (staff roles -> admin console). */
export function defaultPortalUrls(): Record<UserRole, string> {
  const admin = envValue('VITE_ADMIN_PORTAL_URL') ?? defaultUrl('admin');
  return {
    patient: envValue('VITE_PATIENT_WEB_URL', 'VITE_PATIENT_APP_URL') ?? defaultUrl('patient'),
    agent: envValue('VITE_AGENT_PORTAL_URL') ?? defaultUrl('agent'),
    hospital: envValue('VITE_HOSPITAL_PORTAL_URL') ?? defaultUrl('hospital'),
    admin,
    finance: admin,
    support: admin,
    super_admin: admin,
  };
}

export function portalUrlForRole(role: UserRole, overrides?: Partial<Record<UserRole, string>>): string {
  return overrides?.[role] ?? defaultPortalUrls()[role];
}

export function isStaffRole(role: UserRole | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * `loginUrl?next=<encoded>` (keeps existing query params). No `next` for the app root ("/" is the default after
 * sign-in anyway); "/" and ":" stay readable (both are legal in a query string), everything else is encoded.
 */
export function buildLoginRedirect(loginUrl: string, next: string): string {
  if (!next || next === '/') return loginUrl;
  const value = encodeURIComponent(next).replace(/%2F/gi, '/').replace(/%3A/gi, ':');
  return `${loginUrl}${loginUrl.includes('?') ? '&' : '?'}next=${value}`;
}

/**
 * Open-redirect protection for in-app `next` values: only same-app absolute paths ("/cases/1?tab=x").
 * Rejects protocol-relative ("//evil"), backslash tricks and absolute URLs.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n\t]/.test(next)) return fallback;
  return next;
}

/**
 * `next` that is a full URL inside one of `allowedBases` (e.g. the user's own portal), else null.
 * Used by public-door screens that send users across apps.
 */
export function safeNextUrl(next: string | null | undefined, allowedBases: readonly string[]): string | null {
  if (!next || typeof window === 'undefined') return null;
  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return null;
  }
  for (const base of allowedBases) {
    let allowed: URL;
    try {
      allowed = new URL(base, window.location.origin);
    } catch {
      continue;
    }
    if (url.origin === allowed.origin && url.pathname.startsWith(allowed.pathname)) return url.toString();
  }
  return null;
}

/** POST /auth/login|/auth/staff/login answered 401 `{error.code: "mfa_required"}`: ask for the TOTP code. */
export function isMfaRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'mfa_required';
}

/**
 * React Router `basename` for the running app, derived from Vite's `base` (PLAN 3.1):
 * '/agent/' -> '/agent', '/hospital/' -> '/hospital', '/gahi/' -> '/gahi', '/' -> '/'.
 */
export function routerBasename(): string {
  const base = viteEnv().BASE_URL;
  if (typeof base !== 'string' || !base.startsWith('/') || base === '/') return '/';
  return base.replace(/\/+$/, '');
}
