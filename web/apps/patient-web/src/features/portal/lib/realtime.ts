/**
 * Realtime (WebSocket) client for the portal: one shared connection to `/api/v1/ws?token=<access>`,
 * automatic reconnect with backoff, and a tiny pub/sub for components.
 *
 * The plan places `useRealtime` in `@hig/shared/lib/ws.ts`; that module does not exist yet, so the portal
 * ships this self-contained equivalent (same event shapes: `{type, data}` - see `RealtimeEvent`).
 */
import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl, getFreshAccessToken, type RealtimeEvent, type RealtimeEventType } from '@hig/shared/api';

type Listener = (event: RealtimeEvent) => void;
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed';

const listeners = new Set<Listener>();
const statusListeners = new Set<(s: RealtimeStatus) => void>();
let socket: WebSocket | null = null;
let status: RealtimeStatus = 'idle';
let refCount = 0;
let retry = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

function setStatus(next: RealtimeStatus): void {
  status = next;
  for (const l of statusListeners) l(next);
}

function wsUrl(token: string): string {
  const base = getApiBaseUrl();
  const loc = window.location;
  let httpUrl: URL;
  try {
    httpUrl = new URL(base, loc.origin);
  } catch {
    httpUrl = new URL('/api/v1', loc.origin);
  }
  const protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = httpUrl.pathname.replace(/\/+$/, '');
  return `${protocol}//${httpUrl.host}${path}/ws?token=${encodeURIComponent(token)}`;
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)) + Math.floor(Math.random() * 500);
  retry += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

async function connect(): Promise<void> {
  if (stopped || socket) return;
  setStatus('connecting');
  const token = await getFreshAccessToken();
  if (stopped) return;
  if (!token) {
    setStatus('closed');
    scheduleReconnect();
    return;
  }
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl(token));
  } catch {
    setStatus('closed');
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    setStatus('open');
  };
  ws.onmessage = (msg) => {
    if (typeof msg.data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') return;
    const event = parsed as RealtimeEvent;
    for (const l of listeners) {
      try {
        l(event);
      } catch {
        /* a faulty listener must not break the others */
      }
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    setStatus('closed');
    scheduleReconnect();
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}

function start(): void {
  refCount += 1;
  if (refCount === 1) {
    stopped = false;
    void connect();
  }
}

function stop(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const ws = socket;
  socket = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  setStatus('idle');
}

/** Keep the shared connection open while mounted; returns the connection status. */
export function useRealtimeConnection(enabled = true): RealtimeStatus {
  const [current, setCurrent] = useState<RealtimeStatus>(status);
  useEffect(() => {
    if (!enabled) return;
    statusListeners.add(setCurrent);
    start();
    return () => {
      statusListeners.delete(setCurrent);
      stop();
    };
  }, [enabled]);
  return current;
}

/** Subscribe to realtime events (all, or only the given types). The handler may change between renders. */
export function useRealtimeEvent(
  types: RealtimeEventType | RealtimeEventType[] | null,
  handler: (event: RealtimeEvent) => void,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = types === null ? '*' : Array.isArray(types) ? types.join(',') : types;
  useEffect(() => {
    const wanted = key === '*' ? null : new Set(key.split(','));
    const listener: Listener = (event) => {
      if (!wanted || wanted.has(event.type)) handlerRef.current(event);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);
}
