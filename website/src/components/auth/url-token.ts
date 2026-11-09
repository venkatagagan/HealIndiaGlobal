'use client';

import { useSyncExternalStore } from 'react';

/**
 * One-time tokens from emails (verify email, reset password, team invite) arrive in the URL fragment
 * (`/reset-password#token=...`, INTEGRATION_BACKLOG #22): browsers never send the fragment to servers or in
 * `Referer`. Older links used `?token=`, which is still accepted. Either way the token is removed from the address
 * bar (history.replaceState) as soon as it has been read, so it does not linger in history, bookmarks or screenshots.
 *
 * The token is captured once per page path and kept in memory for the life of the page.
 */
let captured: { path: string; token: string | null } | null = null;

function capture(): string | null {
  const { pathname } = window.location;
  if (captured?.path === pathname) return captured.token;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const token = (fragment.get('token') || url.searchParams.get('token') || '').trim() || null;
  if (fragment.has('token') || url.searchParams.has('token')) {
    fragment.delete('token');
    url.searchParams.delete('token');
    const hash = fragment.toString();
    window.history.replaceState(null, '', `${url.pathname}${url.search}${hash ? `#${hash}` : ''}`);
  }
  captured = { path: pathname, token };
  return token;
}

const subscribe = () => () => {};

/** `undefined` while server-rendering / before hydration, then the token or `null` when the link has none. */
export function useUrlToken(): string | null | undefined {
  return useSyncExternalStore(subscribe, capture, () => undefined);
}
