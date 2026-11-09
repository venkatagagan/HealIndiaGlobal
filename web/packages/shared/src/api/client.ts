/**
 * Fetch wrapper for the Heal India Global API.
 *
 * - Base path "/api/v1" (Vite dev server proxies /api to http://127.0.0.1:8000).
 * - Access token lives ONLY in memory (never localStorage). The refresh token is the httpOnly cookie
 *   `hig_refresh` set by the API; `credentials: "include"` sends it to /auth/refresh.
 * - On 401 the client performs ONE single-flight refresh (POST /auth/refresh) and retries the request once.
 * - Errors are thrown as `ApiError` (status, code, message, details, requestId).
 */
import type { ApiErrorBody, TokenOut } from './types';

// ---------------------------------------------------------------------------------------------------------
// Token store (in memory)
// ---------------------------------------------------------------------------------------------------------
type TokenListener = (token: string | null) => void;

let accessToken: string | null = null;
let accessTokenExpiresAt = 0; // epoch ms
const tokenListeners = new Set<TokenListener>();

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  /** @param expiresInSeconds lifetime from TokenOut.expires_in */
  set(token: string | null, expiresInSeconds?: number): void {
    accessToken = token;
    accessTokenExpiresAt = token && expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : 0;
    for (const listener of tokenListeners) listener(token);
  },
  clear(): void {
    tokenStore.set(null);
  },
  /** True when there is no token or it expires within `withinMs`. Unknown expiry counts as fresh. */
  isExpiringSoon(withinMs = 30_000): boolean {
    if (!accessToken) return true;
    if (!accessTokenExpiresAt) return false;
    return accessTokenExpiresAt - Date.now() < withinMs;
  },
  subscribe(listener: TokenListener): () => void {
    tokenListeners.add(listener);
    return () => tokenListeners.delete(listener);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(init: { status: number; code: string; message: string; details?: unknown; requestId?: string | null }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
  }

  get isValidation(): boolean {
    return this.status === 422 || this.code === 'validation_error';
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Human readable message for any thrown value (for toasts / ErrorState). */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Field errors from a 422 response, keyed by field name. Supports the FastAPI/Pydantic shape
 * `[{loc: ["body", "email"], msg}]` and a plain `{field: message}` object.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(error instanceof ApiError) || !error.details) return out;
  const details = error.details as unknown;
  const list = Array.isArray(details)
    ? details
    : typeof details === 'object' && details !== null && Array.isArray((details as { errors?: unknown }).errors)
      ? ((details as { errors: unknown[] }).errors)
      : null;
  if (list) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const { loc, msg, field, message } = item as { loc?: unknown; msg?: unknown; field?: unknown; message?: unknown };
      let key: string | null = null;
      if (Array.isArray(loc)) {
        const parts = loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'path');
        key = parts.map(String).join('.');
      } else if (typeof field === 'string') {
        key = field;
      }
      const text = typeof msg === 'string' ? msg : typeof message === 'string' ? message : null;
      if (key && text && !(key in out)) out[key] = text.replace(/^Value error, /, '');
    }
    return out;
  }
  if (typeof details === 'object' && details !== null) {
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------
export type HeadersProvider = () => Record<string, string | null | undefined> | undefined;

interface ClientConfig {
  baseUrl: string;
  extraHeaders: HeadersProvider | null;
  /** refresh endpoint used by the single-flight refresh: "/auth/refresh" (public door) or "/auth/staff/refresh" */
  refreshPath: string;
}

const config: ClientConfig = {
  baseUrl: '/api/v1',
  extraHeaders: null,
  refreshPath: '/auth/refresh',
};

const sessionExpiredListeners = new Set<() => void>();
const tokenRefreshedListeners = new Set<(token: TokenOut) => void>();

/**
 * Configure the client once at app start (optional).
 * Example (hospital portal): `configureApiClient({ extraHeaders: () => ({ 'X-Hospital-Id': currentHospitalId }) })`
 * The staff door (admin console) uses `refreshPath: '/auth/staff/refresh'` (`<AuthProvider door="staff">` sets it).
 */
export function configureApiClient(options: {
  baseUrl?: string;
  extraHeaders?: HeadersProvider | null;
  refreshPath?: string;
}): void {
  if (options.baseUrl !== undefined) config.baseUrl = options.baseUrl.replace(/\/+$/, '');
  if (options.extraHeaders !== undefined) config.extraHeaders = options.extraHeaders;
  if (options.refreshPath !== undefined) config.refreshPath = options.refreshPath;
}

export function getApiBaseUrl(): string {
  return config.baseUrl;
}

/** The refresh endpoint currently used by `refreshSession()` ("/auth/refresh" or "/auth/staff/refresh"). */
export function getRefreshPath(): string {
  return config.refreshPath;
}

/** Called when a refresh fails while the app believed it was signed in (session over). */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/** Called after every successful refresh with the new TokenOut (AuthProvider keeps `user` in sync). */
export function onTokenRefreshed(listener: (token: TokenOut) => void): () => void {
  tokenRefreshedListeners.add(listener);
  return () => tokenRefreshedListeners.delete(listener);
}

// ---------------------------------------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------------------------------------
export type QueryValue = string | number | boolean | null | undefined | Date;
export type QueryParams = Record<string, QueryValue | readonly QueryValue[]>;

function encodeValue(value: Exclude<QueryValue, null | undefined>): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** `{a: 1, b: undefined, c: ["x","y"], d: ""}` -> "?a=1&c=x&c=y" (skips null/undefined/empty strings). */
export function buildQuery(params?: object | null): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params as Record<string, unknown>)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values as unknown[]) {
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
        search.append(key, encodeValue(value));
      }
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function buildUrl(path: string, query?: object | null): string {
  if (/^https?:\/\//i.test(path)) return path + buildQuery(query);
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${config.baseUrl}${clean}${buildQuery(query)}`;
}

// ---------------------------------------------------------------------------------------------------------
// Refresh (single flight)
// ---------------------------------------------------------------------------------------------------------
let refreshPromise: Promise<TokenOut | null> | null = null;

/**
 * POST /auth/refresh (or /auth/staff/refresh, see `configureApiClient({ refreshPath })`) using the httpOnly
 * cookie. Concurrent callers share one in-flight request.
 * Resolves to the new TokenOut, or null when there is no valid session (token store cleared).
 */
export function refreshSession(): Promise<TokenOut | null> {
  if (refreshPromise) return refreshPromise;
  const hadToken = tokenStore.get() !== null;
  refreshPromise = (async () => {
    try {
      const response = await fetch(buildUrl(config.refreshPath), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: '{}',
      });
      if (!response.ok) {
        tokenStore.clear();
        if (hadToken) for (const listener of sessionExpiredListeners) listener();
        return null;
      }
      const token = (await response.json()) as TokenOut;
      tokenStore.set(token.access_token, token.expires_in);
      for (const listener of tokenRefreshedListeners) listener(token);
      return token;
    } catch {
      // Network failure: keep the current token (it may still be valid); report "no refresh".
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Returns an access token that is not about to expire (refreshing if needed), or null. */
export async function getFreshAccessToken(): Promise<string | null> {
  if (!tokenStore.isExpiringSoon()) return tokenStore.get();
  const token = await refreshSession();
  return token?.access_token ?? tokenStore.get();
}

// ---------------------------------------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------------------------------------
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: object | null;
  /** JSON-serialisable body, FormData, Blob or string */
  body?: unknown;
  headers?: Record<string, string | null | undefined>;
  signal?: AbortSignal;
  /** do not attach Authorization */
  skipAuth?: boolean;
  /** do not try refresh-and-retry on 401 */
  skipRefresh?: boolean;
  /** how to read the response body (default json; 204 -> undefined) */
  responseType?: 'json' | 'blob' | 'text' | 'response';
}

const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/register',
  '/auth/google',
  '/auth/guest',
  '/auth/logout',
  '/auth/staff/login',
  '/auth/staff/refresh',
  '/auth/staff/logout',
];

function mergeHeaders(target: Headers, source?: Record<string, string | null | undefined>): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') continue;
    target.set(key, value);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  const contentType = response.headers.get('content-type') ?? '';
  try {
    body = contentType.includes('json') ? await response.json() : await response.text();
  } catch {
    body = null;
  }
  const headerRequestId = response.headers.get('x-request-id');
  if (body && typeof body === 'object' && 'error' in body && (body as ApiErrorBody).error) {
    const err = (body as ApiErrorBody).error;
    return new ApiError({
      status: response.status,
      code: err.code || statusToCode(response.status),
      message: err.message || response.statusText,
      details: err.details,
      requestId: err.request_id ?? headerRequestId,
    });
  }
  // FastAPI default {"detail": ...} fallback
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    return new ApiError({
      status: response.status,
      code: statusToCode(response.status),
      message: typeof detail === 'string' ? detail : defaultMessage(response.status),
      details: typeof detail === 'string' ? null : detail,
      requestId: headerRequestId,
    });
  }
  return new ApiError({
    status: response.status,
    code: statusToCode(response.status),
    message: defaultMessage(response.status),
    details: typeof body === 'string' && body.length < 500 ? body : null,
    requestId: headerRequestId,
  });
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 402:
      return 'payment_error';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'validation_error';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : 'bad_request';
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Please sign in to continue.';
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return 'Not found.';
    case 409:
      return 'This item was changed by someone else. Refresh and try again.';
    case 422:
      return 'Please check the highlighted fields.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    default:
      return status >= 500 ? 'The server had a problem. Please try again shortly.' : 'Request failed.';
  }
}

async function send(method: HttpMethod, path: string, options: RequestOptions, isRetry: boolean): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
  let body: BodyInit | undefined;
  const raw = options.body;
  if (raw !== undefined && raw !== null) {
    if (raw instanceof FormData || raw instanceof Blob || raw instanceof URLSearchParams || typeof raw === 'string') {
      body = raw;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(raw);
    }
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    // FastAPI endpoints with optional JSON bodies accept "{}"
    headers.set('Content-Type', 'application/json');
    body = '{}';
  }
  mergeHeaders(headers, config.extraHeaders?.());
  mergeHeaders(headers, options.headers);
  const token = tokenStore.get();
  if (token && !options.skipAuth) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: 'Cannot reach the server. Check your connection and try again.',
    });
  }

  const canRefresh =
    response.status === 401 &&
    !isRetry &&
    !options.skipRefresh &&
    !options.skipAuth &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p));
  if (canRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) return send(method, path, options, true);
  }
  return response;
}

/** Low-level request. Prefer the `api.*` helpers or the typed endpoint modules. */
export async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(method, path, options, false);
  if (!response.ok) throw await toApiError(response);
  const type = options.responseType ?? 'json';
  if (type === 'response') return response as unknown as T;
  if (type === 'blob') return (await response.blob()) as unknown as T;
  if (type === 'text') return (await response.text()) as unknown as T;
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export interface DownloadResult {
  blob: Blob;
  filename: string | null;
  contentType: string | null;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/** Trigger a browser "save as" for a blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const api = {
  request,
  get<T>(path: string, query?: object | null, options: Omit<RequestOptions, 'query' | 'body'> = {}): Promise<T> {
    return request<T>('GET', path, { ...options, query });
  },
  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return request<T>('POST', path, { ...options, body });
  },
  put<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return request<T>('PUT', path, { ...options, body });
  },
  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return request<T>('PATCH', path, { ...options, body });
  },
  delete<T = void>(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return request<T>('DELETE', path, options);
  },
  /** multipart/form-data POST (browser sets the boundary) */
  upload<T>(path: string, formData: FormData, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return request<T>('POST', path, { ...options, body: formData });
  },
  /** GET a binary resource with auth; returns blob + filename from Content-Disposition */
  async download(path: string, query?: object | null, options: Omit<RequestOptions, 'query' | 'body'> = {}): Promise<DownloadResult> {
    const response = await request<Response>('GET', path, {
      ...options,
      query,
      responseType: 'response',
      headers: { Accept: '*/*', ...options.headers },
    });
    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('content-disposition')),
      contentType: response.headers.get('content-type'),
    };
  },
  /** download() + saveBlob() in one call */
  async downloadAndSave(path: string, fallbackName: string, query?: object | null): Promise<void> {
    const result = await api.download(path, query);
    saveBlob(result.blob, result.filename ?? fallbackName);
  },
};
