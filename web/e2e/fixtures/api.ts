import { randomUUID } from 'node:crypto';
import { test, type APIRequestContext, type APIResponse, type BrowserContext } from '@playwright/test';
import type { Account } from './accounts';
import { API_URL, portalApiUrl, REFRESH_COOKIE, STAFF_REFRESH_COOKIE, type PortalName } from './env';
import type { TokenOut } from './types';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface CallOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  /** Expected non-2xx statuses that should be returned instead of thrown (e.g. [403, 404]). */
  allow?: number[];
}

/** Thrown for any unexpected non-2xx response; the message carries method, path, status and API error code. */
export class ApiCallError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly code: string | null,
    readonly body: unknown,
  ) {
    super(`${method} ${url} -> ${status}${code ? ` ${code}` : ''}: ${describeBody(body)}`);
    this.name = 'ApiCallError';
  }
}

function describeBody(body: unknown): string {
  if (body && typeof body === 'object') {
    const err = (body as { error?: { message?: string; details?: unknown } }).error;
    if (err?.message) return err.details ? `${err.message} ${JSON.stringify(err.details).slice(0, 400)}` : err.message;
    const detail = (body as { detail?: unknown }).detail;
    if (detail) return JSON.stringify(detail).slice(0, 600);
    return JSON.stringify(body).slice(0, 600);
  }
  return String(body ?? '').slice(0, 600);
}

async function readBody(response: APIResponse): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorCode(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const err = (body as { error?: { code?: string } }).error;
    if (err?.code) return err.code;
  }
  return null;
}

/** Longest single back-off we accept for a 429 (fixed 60 s windows server side). */
const MAX_RATE_LIMIT_WAIT_MS = 65_000;
const MAX_RATE_LIMIT_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Give the running test (if any) extra time while we wait out a rate-limit window. */
function extendCurrentTestTimeout(ms: number): void {
  try {
    const info = test.info();
    if (info.timeout > 0) info.setTimeout(info.timeout + ms);
  } catch {
    // not inside a test (global setup / worker fixture) - nothing to extend
  }
}

/**
 * Sends a request and transparently waits out HTTP 429 (Retry-After) a few times. Logins are limited to
 * 10/min/IP by the API; run the stack with RATE_LIMIT_ENABLED=false to avoid waiting at all (README).
 */
async function sendWithRateLimitRetry(send: () => Promise<APIResponse>, what: string): Promise<APIResponse> {
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    if (response.status() !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) return response;
    const retryAfter = Number(response.headers()['retry-after'] ?? '5');
    const waitMs = Math.min(MAX_RATE_LIMIT_WAIT_MS, (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000 + 250);
    console.warn(
      `[e2e] ${what} was rate limited (429); waiting ${Math.round(waitMs / 1000)}s. ` +
        'Tip: set RATE_LIMIT_ENABLED=false in backend/.env for e2e runs.',
    );
    extendCurrentTestTimeout(waitMs + 5_000);
    await delay(waitMs);
  }
}

/**
 * Thin JSON client for /api/v1 used for test-data setup and API-level assertions.
 * Paths are relative to the API root, e.g. `client.get('/cases')`.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    readonly token: string | null = null,
    private readonly baseUrl: string = API_URL,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {}

  /** Same session with extra default headers (e.g. X-Hospital-Id). */
  withHeaders(headers: Record<string, string>): ApiClient {
    return new ApiClient(this.request, this.token, this.baseUrl, { ...this.defaultHeaders, ...headers });
  }

  /** Same transport, authenticated with another access token. */
  withToken(token: string | null): ApiClient {
    return new ApiClient(this.request, token, this.baseUrl, this.defaultHeaders);
  }

  /** multipart/form-data POST (documents upload). Files are `{name, mimeType, buffer}`. */
  async upload<T>(
    path: string,
    fields: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>,
    options: CallOptions = {},
  ): Promise<T> {
    const url = this.url(path, options.query);
    const response = await sendWithRateLimitRetry(
      () =>
        this.request.fetch(url, {
          method: 'POST',
          headers: this.headers(options.headers),
          multipart: fields,
          failOnStatusCode: false,
        }),
      `POST ${path} (multipart)`,
    );
    const body = await readBody(response);
    if (!response.ok() && !(options.allow ?? []).includes(response.status())) {
      throw new ApiCallError('POST', url, response.status(), errorCode(body), body);
    }
    return body as T;
  }

  url(path: string, query?: CallOptions['query']): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === null || value === undefined || value === '') continue;
      search.append(key, String(value));
    }
    const qs = search.toString();
    return `${this.baseUrl}${clean}${qs ? `?${qs}` : ''}`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...this.defaultHeaders,
      ...extra,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  /** Low-level call returning status + parsed body (never throws for HTTP errors). */
  async raw(method: string, path: string, body?: Json, options: CallOptions = {}): Promise<{ status: number; body: unknown }> {
    const url = this.url(path, options.query);
    const response = await sendWithRateLimitRetry(
      () =>
        this.request.fetch(url, {
          method,
          headers: this.headers(options.headers),
          ...(body !== undefined ? { data: body } : method === 'GET' || method === 'DELETE' ? {} : { data: {} }),
          failOnStatusCode: false,
        }),
      `${method} ${path}`,
    );
    return { status: response.status(), body: await readBody(response) };
  }

  async call<T>(method: string, path: string, body?: Json, options: CallOptions = {}): Promise<T> {
    const { status, body: parsed } = await this.raw(method, path, body, options);
    if (status >= 400 && !(options.allow ?? []).includes(status)) {
      throw new ApiCallError(method, this.url(path, options.query), status, errorCode(parsed), parsed);
    }
    return parsed as T;
  }

  get<T>(path: string, query?: CallOptions['query'], options: Omit<CallOptions, 'query'> = {}): Promise<T> {
    return this.call<T>('GET', path, undefined, { ...options, query });
  }
  post<T>(path: string, body?: Json, options: CallOptions = {}): Promise<T> {
    return this.call<T>('POST', path, body ?? {}, options);
  }
  put<T>(path: string, body?: Json, options: CallOptions = {}): Promise<T> {
    return this.call<T>('PUT', path, body ?? {}, options);
  }
  patch<T>(path: string, body?: Json, options: CallOptions = {}): Promise<T> {
    return this.call<T>('PATCH', path, body ?? {}, options);
  }
  delete<T = unknown>(path: string, options: CallOptions = {}): Promise<T> {
    return this.call<T>('DELETE', path, undefined, options);
  }

  /** POST with a fresh Idempotency-Key header (payments). */
  postIdempotent<T>(path: string, body?: Json, options: CallOptions = {}): Promise<T> {
    return this.post<T>(path, body, { ...options, headers: { 'Idempotency-Key': randomUUID(), ...options.headers } });
  }
}

const STAFF_ROLES = new Set(['admin', 'finance', 'support', 'super_admin']);

export function isStaffAccount(account: Pick<Account, 'role'>): boolean {
  return STAFF_ROLES.has(account.role);
}

/** null = not probed yet; true = POST /auth/staff/login exists (PLAN 3.1 staff door). */
let staffDoorAvailable: boolean | null = null;

async function postLogin(request: APIRequestContext, url: string, account: Account): Promise<APIResponse> {
  return sendWithRateLimitRetry(
    () =>
      request.post(url, {
        data: { email: account.email, password: account.password },
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        failOnStatusCode: false,
      }),
    `login as ${account.email}`,
  );
}

/**
 * Logs `account` in and returns the TokenOut (throws a readable error on failure). Staff accounts use the staff
 * door `POST /auth/staff/login` (PLAN 3.1; cookie `hig_staff_refresh`), everyone else `POST /auth/login`. Until the
 * API implements the staff door (404), staff fall back to the public endpoint.
 */
export async function apiLogin(request: APIRequestContext, account: Account, baseUrl: string = API_URL): Promise<TokenOut> {
  let response: APIResponse | null = null;
  if (isStaffAccount(account) && staffDoorAvailable !== false) {
    response = await postLogin(request, `${baseUrl}/auth/staff/login`, account);
    if (response.status() === 404 || response.status() === 405) {
      staffDoorAvailable = false;
      response = null;
    } else {
      staffDoorAvailable = true;
    }
  }
  response ??= await postLogin(request, `${baseUrl}/auth/login`, account);
  const body = await readBody(response);
  if (!response.ok()) {
    const hint =
      response.status() === 401
        ? ' (is the database seeded? python -m scripts.seed - demo password "HealIndia@2026")'
        : response.status() === 429
          ? ' (rate limited - set RATE_LIMIT_ENABLED=false in backend/.env for e2e runs)'
          : '';
    throw new Error(`Login as ${account.email} failed: HTTP ${response.status()} ${describeBody(body)}${hint}`);
  }
  return body as TokenOut;
}

/** True when the API exposes the PLAN 3.1 staff door (POST /auth/staff/login). */
export async function hasStaffDoor(request: APIRequestContext): Promise<boolean> {
  if (staffDoorAvailable !== null) return staffDoorAvailable;
  const res = await request.post(`${API_URL}/auth/staff/login`, { data: {}, failOnStatusCode: false });
  staffDoorAvailable = res.status() !== 404 && res.status() !== 405;
  return staffDoorAvailable;
}

/**
 * Signs a browser context in as `account` the way the SPAs expect: the login request goes through the portal's own
 * origin (Vite proxy) so the httpOnly refresh cookie (`hig_refresh`, or `hig_staff_refresh` at the staff door) lands
 * in the context's cookie jar. The SPA restores the session from that cookie on its next load.
 *
 * Cookies are host-scoped (not port-scoped): one context holds ONE public-door session for all portals on
 * localhost. Use a separate browser context for a second user.
 */
export async function loginBrowserContext(context: BrowserContext, portal: PortalName, account: Account): Promise<TokenOut> {
  const token = await apiLogin(context.request, account, portalApiUrl(portal));
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name === REFRESH_COOKIE || c.name === STAFF_REFRESH_COOKIE)) {
    throw new Error(
      `Logged in as ${account.email} via ${portalApiUrl(portal)} but no refresh cookie was stored. ` +
        'Check that the portal dev server proxies /api to the API and that COOKIE_SECURE=false for http://localhost.',
    );
  }
  return token;
}
