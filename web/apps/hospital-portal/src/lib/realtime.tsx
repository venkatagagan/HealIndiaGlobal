import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getApiBaseUrl, getFreshAccessToken, type RealtimeEvent, type RealtimeEventType } from '@hig/shared/api';

/**
 * WebSocket connection to `/api/v1/ws?token=<access>` (PLAN 8.9) with exponential-backoff reconnects.
 * Components subscribe with `useRealtimeEvent(type, handler)`.
 */
type Handler = (event: RealtimeEvent) => void;

interface RealtimeHub {
  subscribe: (handler: Handler) => () => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeHub | null>(null);

function wsUrl(token: string): string {
  const base = getApiBaseUrl();
  const absolute = /^https?:\/\//i.test(base) ? new URL(base) : new URL(base, window.location.origin);
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:';
  absolute.pathname = `${absolute.pathname.replace(/\/+$/, '')}/ws`;
  absolute.search = `?token=${encodeURIComponent(token)}`;
  return absolute.toString();
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const handlers = useRef(new Set<Handler>());
  const [connected, setConnected] = useState(false);
  const [hub] = useState<Omit<RealtimeHub, 'connected'>>(() => ({
    subscribe: (handler: Handler) => {
      handlers.current.add(handler);
      return () => {
        handlers.current.delete(handler);
      };
    },
  }));

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt += 1;
      timer = setTimeout(connect, delay);
    };

    async function connect() {
      if (stopped) return;
      const token = await getFreshAccessToken();
      if (stopped) return;
      if (!token) {
        schedule();
        return;
      }
      try {
        socket = new WebSocket(wsUrl(token));
      } catch {
        schedule();
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      socket.onmessage = (msg) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(msg.data));
        } catch {
          return;
        }
        if (!isRealtimeEvent(parsed)) return;
        for (const handler of handlers.current) {
          try {
            handler(parsed);
          } catch {
            /* a faulty listener must not break the others */
          }
        }
      };
      socket.onclose = () => {
        setConnected(false);
        socket = null;
        schedule();
      };
      socket.onerror = () => socket?.close();
    }

    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      setConnected(false);
    };
  }, [enabled]);

  const value = useMemo(() => ({ ...hub, connected }), [hub, connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeConnected(): boolean {
  return useContext(RealtimeContext)?.connected ?? false;
}

/** Subscribe to realtime events of the given type(s). The handler may change between renders. */
export function useRealtimeEvent(types: RealtimeEventType | RealtimeEventType[], handler: (event: RealtimeEvent) => void): void {
  const subscribe = useContext(RealtimeContext)?.subscribe;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = Array.isArray(types) ? types.join('|') : types;
  useEffect(() => {
    if (!subscribe) return;
    const wanted = new Set(key.split('|'));
    return subscribe((event) => {
      if (wanted.has(event.type)) handlerRef.current(event);
    });
  }, [subscribe, key]);
}
