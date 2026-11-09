'use client';

/**
 * GA4 behind consent (see src/config/analytics.ts). Nothing from Google loads until the visitor clicks "Accept".
 * The choice is kept in localStorage (no cookie). Visitors can reopen the banner with any link to `#cookie-settings`
 * or any element with `data-cookie-settings`.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'hig-analytics-consent';
type Choice = 'granted' | 'denied';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

function readChoice(): Choice | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

function saveChoice(choice: Choice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* private mode - the banner simply shows again next visit */
  }
}

function ensureGtag(): Gtag {
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // gtag.js expects the Arguments object itself.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    // Consent mode v2 defaults: everything denied until the visitor decides.
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500,
    });
  }
  return window.gtag;
}

let loaded = false;

function loadGa4(measurementId: string) {
  const gtag = ensureGtag();
  gtag('consent', 'update', { analytics_storage: 'granted' });
  if (loaded) return;
  loaded = true;
  gtag('js', new Date());
  gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
}

function revokeGa4() {
  if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
  // Remove first-party GA cookies set while consent was granted.
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (name && /^_ga(_|$)/.test(name)) {
      const host = window.location.hostname;
      for (const domain of ['', host, `.${host.split('.').slice(-2).join('.')}`]) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
      }
    }
  }
}

export interface ConsentLabels {
  region: string;
  title: string;
  body: string;
  accept: string;
  decline: string;
  privacyLink: string;
}

export function Ga4WithConsent({
  measurementId,
  labels,
  privacyHref,
}: {
  measurementId: string;
  labels: ConsentLabels;
  privacyHref: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const choice = readChoice();
    // Reading localStorage must wait until after hydration (the server never knows the choice).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (choice === null) setOpen(true);
    else if (choice === 'granted') loadGa4(measurementId);

    const reopen = () => setOpen(true);
    const onHash = () => {
      if (window.location.hash === '#cookie-settings') reopen();
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-cookie-settings], a[href$="#cookie-settings"]');
      if (el) {
        e.preventDefault();
        reopen();
      }
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick);
    };
  }, [measurementId]);

  const decide = useCallback(
    (choice: Choice) => {
      saveChoice(choice);
      if (choice === 'granted') loadGa4(measurementId);
      else revokeGa4();
      setOpen(false);
    },
    [measurementId],
  );

  if (!open) return null;
  return (
    <section
      aria-label={labels.region}
      aria-describedby="consent-body"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl sm:inset-x-6"
    >
      <h2 className="text-base font-semibold">{labels.title}</h2>
      <p id="consent-body" className="mt-1 text-sm text-slate-700">
        {labels.body}{' '}
        <a href={privacyHref} className="font-medium text-primary-800 underline underline-offset-4">
          {labels.privacyLink}
        </a>
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => decide('granted')}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
        >
          {labels.accept}
        </button>
        <button
          type="button"
          onClick={() => decide('denied')}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
        >
          {labels.decline}
        </button>
      </div>
    </section>
  );
}
