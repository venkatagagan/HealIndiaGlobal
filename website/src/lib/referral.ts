/**
 * Sign-up referral code (`?ref=CODE` on any page, e.g. `/{lang}?ref=R7KQ2MZP4X`): remembered in localStorage and a
 * first-party cookie for 30 days so the registration form can send it as `referral_code` even when the visitor
 * signs up later. Browser-only helpers; every storage access is guarded (private mode, blocked storage).
 */
const REF_KEY = 'hig.ref';
const REF_COOKIE = 'hig_ref';
const DEVICE_KEY = 'hig.device_id';
const MAX_AGE_S = 30 * 24 * 60 * 60;
/** patient codes "R" + 9 characters, agent codes "AGT" + 5; any short alphanumeric code is accepted here */
const REF_RE = /^[A-Za-z0-9-]{3,16}$/;

export type ClientApp = 'website' | 'patient_web';

export function normalizeRef(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return REF_RE.test(code) ? code : null;
}

function readCookie(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)hig_ref=([^;]*)/);
    return match ? normalizeRef(decodeURIComponent(match[1]!)) : null;
  } catch {
    return null;
  }
}

/** Remember `?ref=` / `?referral_code=` of the current URL. Returns the code that is now remembered (or null). */
export function captureRef(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(search);
  const code = normalizeRef(params.get('ref') ?? params.get('referral_code'));
  if (!code) return storedRef();
  try {
    window.localStorage.setItem(REF_KEY, code);
  } catch {
    /* storage unavailable */
  }
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${REF_COOKIE}=${encodeURIComponent(code)}; Max-Age=${MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked */
  }
  return code;
}

/** The remembered sign-up code, if any. */
export function storedRef(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = normalizeRef(window.localStorage.getItem(REF_KEY));
    if (value) return value;
  } catch {
    /* storage unavailable */
  }
  return readCookie();
}

/** Forget the code after a successful sign-up. */
export function clearRef(): void {
  try {
    window.localStorage.removeItem(REF_KEY);
  } catch {
    /* storage unavailable */
  }
  try {
    document.cookie = `${REF_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* cookies blocked */
  }
}

let memoryDeviceId: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable random id of this browser (same key as the web portals), sent as `device_id` on sign-up. */
export function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    memoryDeviceId ??= randomId();
    return memoryDeviceId;
  }
}

/** `X-Client-App` attribution: the patient portal forwards `/register?ref=…&app=patient_web` to this site. */
export function clientApp(params: URLSearchParams): ClientApp {
  return params.get('app') === 'patient_web' ? 'patient_web' : 'website';
}
