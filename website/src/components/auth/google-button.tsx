'use client';

import { useEffect, useRef } from 'react';
import { GOOGLE_CLIENT_ID } from '@/config/site';

interface GoogleId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    itp_support?: boolean;
  }): void;
  renderButton(
    el: HTMLElement,
    options: { theme?: string; size?: string; text?: string; shape?: string; width?: number; locale?: string; logo_alignment?: string },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loader = null;
        reject(new Error('Google Identity Services failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return loader;
}

/**
 * "Sign in with Google" (Google Identity Services). Rendered only when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set;
 * the ID token is posted to POST /auth/google by the parent.
 */
export function GoogleButton({
  text = 'continue_with',
  onCredential,
  onError,
}: {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onCredential: (idToken: string) => void;
  onError: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCredential, onError });
  useEffect(() => {
    callbacks.current = { onCredential, onError };
  }, [onCredential, onError]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        const gid = window.google?.accounts?.id;
        if (cancelled || !gid || !ref.current) return;
        gid.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          itp_support: true,
          callback: (response) => {
            if (response.credential) callbacks.current.onCredential(response.credential);
            else callbacks.current.onError();
          },
        });
        gid.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          text,
          shape: 'pill',
          width: Math.min(400, ref.current.offsetWidth || 320),
          logo_alignment: 'center',
          locale: 'en',
        });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onError();
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={ref} className="flex min-h-11 justify-center" />;
}

export const googleEnabled = Boolean(GOOGLE_CLIENT_ID);
