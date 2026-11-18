import { useEffect } from 'react';
import { useHref, useLocation } from 'react-router';
import type { RegistrableRole } from '../api/enums';
import { captureReferralCode, type ClientApp } from '../api/endpoints/referrals';
import { useCommonTranslation } from '../lib/i18n';
import { LoadingState } from '../ui/feedback';
import { buildLoginRedirect, publicLoginUrl, publicRegisterUrl, safeNextPath } from './doors';

export interface DoorRedirectProps {
  /** which public-door page to open on the website */
  to: 'login' | 'register';
  /** registration role tab (`/register?role=…`) */
  role?: RegistrableRole;
  /**
   * register only: forward a sign-up referral code (`?ref=`, or one remembered from an earlier visit) and name this
   * app as the attribution channel (`&app=`, sent by the website as `X-Client-App`)
   */
  clientApp?: ClientApp;
}

/**
 * Route element for a portal's legacy `/login` / `/register` paths (PLAN 3.1: portals have no login form).
 * Full-page redirect to the website door; a same-app `?next=/path` is forwarded as an absolute URL of this portal.
 */
export function DoorRedirect({ to, role, clientApp }: DoorRedirectProps) {
  const { t } = useCommonTranslation();
  const { search } = useLocation();
  // in-app `next` paths are router paths; useHref adds the router basename ('/agent', or nothing for
  // patient-web whose routes already start with /app)
  const path = safeNextPath(new URLSearchParams(search).get('next'), '');
  const href = useHref(path || '/');

  useEffect(() => {
    const origin = window.location.origin;
    // without a `next`, come back to the portal root (Vite `base`, e.g. /agent/)
    const next = path ? `${origin}${href}` : new URL(import.meta.env.BASE_URL || '/', origin).toString();
    let target = to === 'login' ? publicLoginUrl() : publicRegisterUrl(role);
    const ref = to === 'register' && clientApp ? captureReferralCode(search) : null;
    if (ref) {
      const extra = new URLSearchParams({ ref, app: clientApp ?? '' });
      target = `${target}${target.includes('?') ? '&' : '?'}${extra.toString()}`;
    }
    window.location.replace(buildLoginRedirect(target, next));
  }, [clientApp, href, path, role, search, to]);

  return <LoadingState fullScreen label={t('auth.redirecting')} />;
}
