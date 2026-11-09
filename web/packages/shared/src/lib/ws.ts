/**
 * Realtime client for `WS /api/v1/ws?token=<access>` (PLAN 8.9).
 *
 * One shared WebSocket per browser tab, opened while at least one component uses `useRealtime()` (or
 * `connectRealtime()` was called), reconnecting with capped exponential backoff + jitter. Server events are
 * `{"type": "...", "data": {...}}` (`RealtimeEvent`): message.created, notification.created,
 * screening.completed, booking.updated, case.updated.
 *
 *   const { status, subscribe } = useRealtime();          // token from the in-memory token store
 *   useEffect(() => subscribe('message.created', (msg) => ...), [subscribe]);
 *   useRealtimeEvent('notification.created', (n) => toast(n.title));
 *
 * While mounted, `useRealtime()` also invalidates the matching TanStack Query keys (see
 * `REALTIME_INVALIDATIONS`) so lists and dashboards refresh by themselves.
 */
import { QueryClientContext, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { getApiBaseUrl, getFreshAccessToken, tokenStore } from '../api/client';
import type { RealtimeEvent, RealtimeEventType } from '../api/types';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed';
export type RealtimeEventOf<T extends RealtimeEventType> = Extract<RealtimeEvent, { type: T }>;
export type RealtimeDataOf<T extends RealtimeEventType> = RealtimeEventOf<T>['data'];
/** Receives the event `data` and the whole event. */
export type RealtimeHandler<T extends RealtimeEventType = RealtimeEventType> = (
  data: RealtimeDataOf<T>,
  event: RealtimeEventOf<T>,
) => void;
export type RealtimeAnyHandler = (event: RealtimeEvent) => void;

export const REALTIME_EVENT_TYPES = [
  'message.created',
  'notification.created',
  'screening.completed',
  'booking.updated',
  'case.updated',
] as const satisfies readonly RealtimeEventType[];

/**
 * Query-key prefixes invalidated per event (prefix match). Covers the key conventions used by the apps:
 * ["conversations", id, "messages"], ["messages", id], ["notifications", ...], ["screenings", ...],
 * ["bookings", ...], ["cases", ...] and the per-portal dashboards.
 */
export const REALTIME_INVALIDATIONS: Readonly<Record<RealtimeEventType, readonly QueryKey[]>> = {
  'message.created': [['conversations'], ['messages']],
  'notification.created': [['notifications']],
  'screening.completed': [['screenings'], ['dashboard'], ['patient', 'dashboard']],
  'booking.updated': [
    ['bookings'],
    ['cases'],
    ['dashboard'],
    ['patient', 'dashboard'],
    ['agent-dashboard'],
    ['hospital-dashboard'],
  ],
  'case.updated': [['cases'], ['dashboard'], ['patient', 'dashboard'], ['agent-dashboard'], ['hospital-dashboard']],
};

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

// -----------------------------------------------------------------------------------------------------------
// URL
// -----------------------------------------------------------------------------------------------------------
function envWsUrl(): string | undefined {
  try {
    const value = (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_WS_URL;
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `${ws|wss}://${location.host}/api/v1/ws?token=...` (protocol follows the page). Honours `VITE_WS_URL`
 * (absolute ws(s) URL) and an absolute API base URL configured with `configureApiClient({ baseUrl })`.
 */
export function realtimeUrl(token: string): string {
  const query = `token=${encodeURIComponent(token)}`;
  const override = envWsUrl();
  if (override) return `${override.replace(/\/+$/, '')}${override.includes('?') ? '&' : '?'}${query}`;
  const base = getApiBaseUrl();
  if (/^https?:\/\//i.test(base)) {
    const url = new URL(base);
    const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${url.host}${url.pathname.replace(/\/+$/, '')}/ws?${query}`;
  }
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const path = (base || '/api/v1').replace(/\/+$/, '');
  return `${protocol}://${location.host}${path.startsWith('/') ? path : `/${path}`}/ws?${query}`;
}

// -----------------------------------------------------------------------------------------------------------
// Connection manager (module singleton)
// -----------------------------------------------------------------------------------------------------------
const typedListeners = new Map<string, Set<RealtimeAnyHandler>>();
const statusListeners = new Set<() => void>();

let socket: WebSocket | null = null;
let status: RealtimeStatus = 'idle';
let users = 0;
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let explicitToken: string | null = null;
let connectSeq = 0;
let windowListenersAttached = false;

function setStatus(next: RealtimeStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener();
}

function dispatch(event: RealtimeEvent): void {
  for (const key of [event.type, '*']) {
    const set = typedListeners.get(key);
    if (!set) continue;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (error) {
        // a faulty listener must not break the others
        console.error('[realtime] listener failed', error);
      }
    }
  }
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    'data' in value
  );
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleReconnect(): void {
  if (users === 0 || retryTimer) return;
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attempts, 5)) + Math.floor(Math.random() * 500);
  attempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void openSocket();
  }, delay);
}

function closeSocket(): void {
  const ws = socket;
  socket = null;
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  try {
    ws.close(1000);
  } catch {
    /* already closed */
  }
}

async function openSocket(): Promise<void> {
  if (users === 0 || socket) return;
  const seq = ++connectSeq;
  setStatus('connecting');
  const token = explicitToken ?? (await getFreshAccessToken());
  if (seq !== connectSeq || users === 0 || socket) return;
  if (!token) {
    // signed out: wait for the token store to provide a token (see tokenStore subscription below)
    setStatus('closed');
    return;
  }
  let ws: WebSocket;
  try {
    ws = new WebSocket(realtimeUrl(token));
  } catch {
    setStatus('closed');
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    attempts = 0;
    setStatus('open');
  };
  ws.onmessage = (message: MessageEvent) => {
    if (typeof message.data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.data);
    } catch {
      return;
    }
    if (isRealtimeEvent(parsed)) dispatch(parsed);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    setStatus('closed');
    scheduleReconnect();
  };
}

function attachWindowListeners(): void {
  if (windowListenersAttached || typeof window === 'undefined') return;
  windowListenersAttached = true;
  // reconnect immediately when the network comes back
  window.addEventListener('online', () => {
    if (users > 0 && !socket) {
      clearRetry();
      attempts = 0;
      void openSocket();
    }
  });
  // sign-out closes the socket; sign-in (or a token after an anonymous start) opens it
  tokenStore.subscribe((token) => {
    if (users === 0 || explicitToken) return;
    if (!token) {
      clearRetry();
      connectSeq += 1;
      closeSocket();
      setStatus('closed');
    } else if (!socket) {
      clearRetry();
      void openSocket();
    }
  });
}

/**
 * Keep the shared socket open until the returned release function is called (ref-counted).
 * `token`: use this access token instead of the in-memory token store.
 */
export function connectRealtime(token?: string | null): () => void {
  attachWindowListeners();
  if (token !== undefined && token !== explicitToken) {
    explicitToken = token;
    // token changed: reconnect with it
    if (socket) {
      connectSeq += 1;
      closeSocket();
    }
  }
  users += 1;
  if (!socket) {
    clearRetry();
    void openSocket();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users = Math.max(0, users - 1);
    if (users === 0) {
      clearRetry();
      connectSeq += 1;
      closeSocket();
      explicitToken = null;
      attempts = 0;
      setStatus('idle');
    }
  };
}

/** Close and re-open the socket (e.g. after switching user). */
export function reconnectRealtime(): void {
  if (users === 0) return;
  clearRetry();
  connectSeq += 1;
  closeSocket();
  attempts = 0;
  void openSocket();
}

export function getRealtimeStatus(): RealtimeStatus {
  return status;
}

export function subscribeRealtimeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** Listen to one event type (handler gets `data, event`) or to every event with `'*'` (handler gets `event`). */
export function subscribeRealtime<T extends RealtimeEventType>(type: T, handler: RealtimeHandler<T>): () => void;
export function subscribeRealtime(type: '*', handler: RealtimeAnyHandler): () => void;
export function subscribeRealtime(type: string, handler: RealtimeHandler | RealtimeAnyHandler): () => void {
  const wrapped: RealtimeAnyHandler =
    type === '*'
      ? (handler as RealtimeAnyHandler)
      : (event) => (handler as (data: unknown, event: RealtimeEvent) => void)(event.data, event);
  let set = typedListeners.get(type);
  if (!set) {
    set = new Set();
    typedListeners.set(type, set);
  }
  set.add(wrapped);
  return () => {
    typedListeners.get(type)?.delete(wrapped);
  };
}

// -----------------------------------------------------------------------------------------------------------
// React Query invalidation (one listener per QueryClient, however many components call useRealtime)
// -----------------------------------------------------------------------------------------------------------
const invalidationUsers = new WeakMap<QueryClient, { count: number; off: () => void }>();

function retainInvalidation(
  client: QueryClient,
  map: Readonly<Partial<Record<RealtimeEventType, readonly QueryKey[]>>>,
): () => void {
  const existing = invalidationUsers.get(client);
  if (existing) {
    existing.count += 1;
  } else {
    const off = subscribeRealtime('*', (event) => {
      for (const queryKey of map[event.type] ?? []) void client.invalidateQueries({ queryKey });
    });
    invalidationUsers.set(client, { count: 1, off });
  }
  return () => {
    const entry = invalidationUsers.get(client);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      entry.off();
      invalidationUsers.delete(client);
    }
  };
}

// -----------------------------------------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------------------------------------
export interface UseRealtimeOptions {
  /** default true; pass false to stay disconnected (e.g. until signed in) */
  enabled?: boolean;
  /**
   * Invalidate TanStack Query keys on events: true (default, `REALTIME_INVALIDATIONS`), false, or a custom
   * map. Needs a QueryClientProvider above; silently skipped without one.
   */
  invalidate?: boolean | Partial<Record<RealtimeEventType, readonly QueryKey[]>>;
}

export interface UseRealtimeResult {
  status: RealtimeStatus;
  connected: boolean;
  /** stable; returns the unsubscribe function */
  subscribe: typeof subscribeRealtime;
  reconnect: () => void;
}

/**
 * Connect while mounted. `token` overrides the in-memory access token (normally omit it).
 * Returns `{ status, connected, subscribe(eventType, cb), reconnect }`.
 */
export function useRealtime(token?: string | null, options: UseRealtimeOptions = {}): UseRealtimeResult {
  const enabled = options.enabled ?? true;
  const queryClient = useContext(QueryClientContext);
  const invalidate = options.invalidate ?? true;
  // serialised so an inline object literal does not re-subscribe on every render
  const invalidateKey = JSON.stringify(invalidate);

  useEffect(() => {
    if (!enabled) return;
    return connectRealtime(token);
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled || !queryClient) return;
    const config = JSON.parse(invalidateKey) as boolean | Partial<Record<RealtimeEventType, QueryKey[]>>;
    if (config === false) return;
    return retainInvalidation(queryClient, config === true ? REALTIME_INVALIDATIONS : config);
  }, [enabled, queryClient, invalidateKey]);

  const current = useSyncExternalStore(subscribeRealtimeStatus, getRealtimeStatus, () => 'idle' as RealtimeStatus);
  const reconnect = useCallback(() => reconnectRealtime(), []);
  return { status: current, connected: current === 'open', subscribe: subscribeRealtime, reconnect };
}

/** Current socket status without opening a connection. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeRealtimeStatus, getRealtimeStatus, () => 'idle' as RealtimeStatus);
}

/**
 * Run `handler(data, event)` for the given event type(s) while mounted (does not open the socket by itself;
 * pair with `useRealtime()` somewhere above, e.g. in the portal layout). The handler may change every render.
 */
export function useRealtimeEvent<T extends RealtimeEventType>(
  types: T | readonly T[],
  handler: RealtimeHandler<T>,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = Array.isArray(types) ? (types as readonly T[]).join('|') : (types as T);
  useEffect(() => {
    if (!enabled) return;
    const offs = key
      .split('|')
      .map((type) =>
        subscribeRealtime(type as T, (data, event) => handlerRef.current(data, event)),
      );
    return () => {
      for (const off of offs) off();
    };
  }, [key, enabled]);
}
