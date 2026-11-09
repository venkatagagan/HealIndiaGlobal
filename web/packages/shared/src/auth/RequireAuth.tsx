import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { LogOut, ShieldAlert } from 'lucide-react';
import type { UserRole } from '../api/enums';
import type { UserOut } from '../api/types';
import { useCommonTranslation } from '../lib/i18n';
import { Button, buttonClasses } from '../ui/Button';
import { LoadingState } from '../ui/feedback';
import { useAuth } from './AuthProvider';
import { buildLoginRedirect, isAbsoluteUrl } from './doors';

export interface RequireAuthProps {
  /** protected content (default: <Outlet /> for layout routes) */
  children?: ReactNode;
  /** allowed roles; omit to accept any signed-in user */
  roles?: readonly UserRole[];
  /**
   * Where anonymous visitors go (default: the provider's loginUrl). Absolute URL (public door on the website):
   * full-page redirect to `${loginUrl}?next=<current href>`; relative path: in-app navigation with `?next=<path>`.
   */
  loginUrl?: string;
  /** portal URL per role for the "wrong portal" screen (default: the provider's portalUrls) */
  portalUrls?: Partial<Record<UserRole, string>>;
  /** send users of another role straight to their own portal instead of showing the screen */
  redirectWrongRole?: boolean;
  /** extra check after the role check (e.g. hospital membership); false -> `forbidden` */
  allow?: (user: UserOut) => boolean;
  /** rendered when `allow` returns false (default: the wrong-portal screen) */
  forbidden?: ReactNode;
  /** rendered while the session is being restored */
  fallback?: ReactNode;
}

/** Route guard implementing the PLAN 3.1 door rules. */
export function RequireAuth({
  children,
  roles,
  loginUrl,
  portalUrls,
  redirectWrongRole = false,
  allow,
  forbidden,
  fallback,
}: RequireAuthProps) {
  const auth = useAuth();
  const { t } = useCommonTranslation();
  const location = useLocation();
  const target = loginUrl ?? auth.loginUrl;
  const urls = { ...auth.portalUrls, ...portalUrls };
  const user = auth.user;
  const roleMismatch = Boolean(user && roles && roles.length > 0 && !roles.includes(user.role));
  const ownPortal = user ? urls[user.role] : undefined;
  const shouldRedirectToOwnPortal =
    roleMismatch && redirectWrongRole && Boolean(ownPortal) && typeof window !== 'undefined' && !window.location.href.startsWith(ownPortal ?? '');
  const anonymous = auth.status === 'anonymous' || (auth.status === 'authenticated' && !user);
  const externalLogin = anonymous && isAbsoluteUrl(target);

  useEffect(() => {
    if (externalLogin) window.location.assign(buildLoginRedirect(target, window.location.href));
  }, [externalLogin, target]);

  useEffect(() => {
    if (shouldRedirectToOwnPortal && ownPortal) window.location.assign(ownPortal);
  }, [shouldRedirectToOwnPortal, ownPortal]);

  if (auth.status === 'loading') return <>{fallback ?? <LoadingState fullScreen label={t('auth.checkingSession')} />}</>;

  if (anonymous) {
    if (externalLogin) return <LoadingState fullScreen label={t('auth.redirecting')} />;
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={buildLoginRedirect(target, next)} replace />;
  }

  if (!user) return null;

  if (roleMismatch) {
    if (shouldRedirectToOwnPortal) return <LoadingState fullScreen label={t('auth.redirecting')} />;
    return <WrongPortal user={user} roles={roles ?? []} portalUrl={ownPortal} onSignOut={() => void auth.logout()} />;
  }

  if (allow && !allow(user)) {
    return <>{forbidden ?? <WrongPortal user={user} roles={roles ?? []} portalUrl={ownPortal} onSignOut={() => void auth.logout()} />}</>;
  }

  return <>{children ?? <Outlet />}</>;
}

export interface WrongPortalProps {
  user: UserOut;
  /** roles this portal is for */
  roles: readonly UserRole[];
  /** the signed-in user's own portal */
  portalUrl?: string;
  onSignOut?: () => void;
  title?: ReactNode;
  description?: ReactNode;
}

/** "This portal is not for your account" screen with a link to the user's own portal and a sign-out button. */
export function WrongPortal({ user, roles, portalUrl, onSignOut, title, description }: WrongPortalProps) {
  const { t } = useCommonTranslation();
  const roleName = (role: UserRole) => t(`roles.${role}`, { defaultValue: role });
  const showPortalLink = Boolean(portalUrl) && typeof window !== 'undefined' && !window.location.href.startsWith(portalUrl ?? '');
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
          <ShieldAlert className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-fg">{title ?? t('auth.wrongPortalTitle')}</h1>
        <p className="mt-2 text-sm text-muted">
          {description ??
            t('auth.wrongPortalBody', {
              name: user.email ?? user.full_name,
              role: roleName(user.role),
              roles: roles.map(roleName).join(', '),
            })}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {showPortalLink && portalUrl && (
            <a href={portalUrl} className={buttonClasses('primary', 'md')}>
              {t('auth.goToMyPortal')}
            </a>
          )}
          {onSignOut && (
            <Button variant="outline" leftIcon={<LogOut className="size-4" aria-hidden />} onClick={onSignOut}>
              {t('actions.signOut')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
