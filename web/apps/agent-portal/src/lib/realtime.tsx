import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getFreshAccessToken, tokenStore, type RealtimeEvent, type RealtimeEventType } from '@hig/shared/api';

type Handler = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  subscribe: (handler: Handler) => () => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function socketUrl(token: string): string {
  const override = import.meta.env.VITE_WS_URL;
  const base = override
    ? override.replace(/\/+$/, '')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/ws`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    'data' in value
  );
}

/**
 * One WebSocket per signed-in session (`/api/v1/ws?token=<access>`), reconnecting with capped exponential
 * backoff. Reconnects with a fresh token whenever the access token rotates.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const handlers = useRef(new Set<Handler>());
  const [connected, setConnected] = useState(false);
  const [tokenVersion, setTokenVersion] = useState(0);

  useEffect(() => tokenStore.subscribe(() => setTokenVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const connect = async () => {
      const token = await getFreshAccessToken();
      if (disposed || !token) return;
      socket = new WebSocket(socketUrl(token));
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
      };
      socket.onmessage = (message) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (!isRealtimeEvent(parsed)) return;
        for (const handler of handlers.current) handler(parsed);
      };
      socket.onclose = () => {
        setConnected(false);
        if (disposed) return;
        attempts += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
        retryTimer = setTimeout(() => void connect(), delay);
      };
      socket.onerror = () => socket?.close();
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      setConnected(false);
    };
    // tokenVersion: reconnect after a token rotation so the socket is authenticated with the current user
  }, [enabled, tokenVersion]);

  const subscribe = useCallback((handler: Handler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);
  const value = useMemo<RealtimeContextValue>(() => ({ connected, subscribe }), [connected, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Subscribe to one or more realtime event types while mounted. */
export function useRealtimeEvent<T extends RealtimeEventType>(
  types: T | T[],
  handler: (event: Extract<RealtimeEvent, { type: T }>) => void,
): void {
  const ctx = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = Array.isArray(types) ? types.join('|') : types;
  const subscribe = ctx?.subscribe;
  useEffect(() => {
    if (!subscribe) return;
    const wanted = new Set(key.split('|'));
    return subscribe((event) => {
      if (wanted.has(event.type)) handlerRef.current(event as Extract<RealtimeEvent, { type: T }>);
    });
  }, [subscribe, key]);
}

export function useRealtimeConnected(): boolean {
  return useContext(RealtimeContext)?.connected ?? false;
}
