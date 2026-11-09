/**
 * Browser-side helpers for the public login door (PLAN §3.1). All calls go to the same origin
 * (`/api/v1/...`, rewritten to the API in dev, routed by nginx in production) with credentials so the
 * backend can set the httpOnly refresh cookie `hig_refresh`.
 */
import { PORTALS, type PortalRole } from '@/config/site';

export interface UserOut {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_guest?: boolean;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserOut;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string | null; message: string | null; details: unknown };

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, status: 0, code: 'network_error', message: null, details: null };
  }
  let payload: unknown = null;
  try {
    payload = res.status === 204 ? null : await res.json();
  } catch {
    payload = null;
  }
  if (res.ok) return { ok: true, status: res.status, data: payload as T };
  const err = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
  return { ok: false, status: res.status, code: err?.code ?? null, message: err?.message ?? null, details: err?.details ?? null };
}

export function isPortalRole(role: string | null | undefined): role is PortalRole {
  return role === 'patient' || role === 'agent' || role === 'hospital';
}

export function portalUrl(role: PortalRole): string {
  return PORTALS[role];
}

/**
 * Honour `next` only when it points inside the role's own portal base URL (same origin and path prefix);
 * anything else (other portals, other hosts, javascript:, protocol-relative) is ignored.
 */
export function safeNext(next: string | null | undefined, role: PortalRole): string | null {
  if (!next) return null;
  const base = PORTALS[role];
  // the portal root without its trailing slash ("…/app") means the portal home
  if (next === base.replace(/\/$/, '')) return base;
  if (!next.startsWith(base)) return null;
  try {
    const target = new URL(next);
    const baseUrl = new URL(base);
    if (target.origin !== baseUrl.origin || !target.pathname.startsWith(baseUrl.pathname)) return null;
    if (target.username || target.password) return null;
    return target.toString();
  } catch {
    return null;
  }
}

export function destinationFor(role: string, next: string | null | undefined): string | null {
  if (!isPortalRole(role)) return null;
  return safeNext(next, role) ?? portalUrl(role);
}

// ------------------------------------------------------------------------------------ session hint
const KEY = 'hig.session';
const TTL_MS = 10 * 60 * 1000;
/**
 * Persistent "this browser signed in through the door" flag (localStorage, no token or personal data). Without it,
 * the header does not probe POST /auth/refresh: anonymous visitors would otherwise get a 401 (a console error) on
 * every page view. Set on sign-in, cleared when the refresh answers 401/403.
 */
const SIGNED_IN_KEY = 'hig.signedIn';

function maybeSignedIn(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return true; // storage unavailable: fall back to asking the API
  }
}

interface SessionHint {
  role: PortalRole | null;
  at: number;
}

function readHint(): SessionHint | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const hint = JSON.parse(raw) as SessionHint;
    return Date.now() - hint.at < TTL_MS ? hint : null;
  } catch {
    return null;
  }
}

export function rememberSession(role: PortalRole | null) {
  try {
    if (role) window.localStorage.setItem(SIGNED_IN_KEY, '1');
    else window.localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* storage unavailable - fine */
  }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ role, at: Date.now() } satisfies SessionHint));
  } catch {
    /* storage unavailable - fine */
  }
}

let inflight: Promise<PortalRole | null> | null = null;

/**
 * Is there a public-door session? Calls POST /auth/refresh at most once per tab every 10 minutes
 * (refresh tokens rotate, so we avoid hammering it). Returns the portal role or null.
 */
export function checkSession(force = false): Promise<PortalRole | null> {
  if (!force) {
    const hint = readHint();
    if (hint) return Promise.resolve(hint.role);
    if (!maybeSignedIn()) return Promise.resolve(null);
  }
  if (!inflight) {
    inflight = apiPost<TokenOut>('/auth/refresh').then((res) => {
      const role = res.ok && isPortalRole(res.data?.user?.role) ? res.data.user.role : null;
      // Do not cache network failures (API down) as "signed out" for long.
      if (res.ok || res.status === 401 || res.status === 403) rememberSession(role as PortalRole | null);
      inflight = null;
      return role as PortalRole | null;
    });
  }
  return inflight;
}
