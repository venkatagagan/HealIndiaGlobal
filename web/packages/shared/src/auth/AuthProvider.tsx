/**
 * Session state for every web app (PLAN 3.1 doors).
 *
 *   <QueryClientProvider client={queryClient}>
 *     <AuthProvider door="public">           // patient / agent / hospital portals
 *     <AuthProvider door="staff">            // admin console (/gahi)
 *
 * Bootstrap: POST /auth/refresh (or /auth/staff/refresh) with the httpOnly cookie + X-Requested-With (the API
 * client's single-flight `refreshSession()`), then GET /auth/me. The access token lives only in memory
 * (`tokenStore`). Logins / registrations / logout go through the matching door endpoints.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClientContext, type QueryKey } from '@tanstack/react-query';
import {
  configureApiClient,
  onSessionExpired,
  onTokenRefreshed,
  refreshSession,
  tokenStore,
} from '../api/client';
import { authApi } from '../api/endpoints/auth';
import type { RegistrableRole, UserRole } from '../api/enums';
import type { GuestUpgradeIn, LoginIn, RegisterIn, TokenOut, UserOut } from '../api/types';
import {
  AUTH_DOOR_ENDPOINTS,
  defaultPortalUrls,
  isStaffRole,
  publicLoginUrl,
  websiteUrl,
  type AuthDoor,
} from './doors';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/** Default query key seeded with the signed-in user (matches the apps' `['auth', 'me']` convention). */
export const ME_QUERY_KEY = ['auth', 'me'] as const;

export interface LogoutOptions {
  /** where to send the browser afterwards; null = stay (default: provider `afterLogoutUrl`) */
  redirectTo?: string | null;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: UserOut | null;
  door: AuthDoor;
  /** login URL for this app (public door: website login; staff door: in-app "/login") */
  loginUrl: string;
  /** portal base URL per role */
  portalUrls: Record<UserRole, string>;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  isStaff: boolean;
  /** hasRole('agent'), hasRole('admin', 'super_admin'), hasRole(STAFF_ROLES) */
  hasRole: (...roles: (UserRole | readonly UserRole[])[]) => boolean;
  /** login(email, password, otp?) or login({ email, password, otp_code }); rejects with ApiError ("mfa_required") */
  login: (emailOrBody: string | LoginIn, password?: string, otp?: string) => Promise<UserOut>;
  /**
   * public door only: POST /auth/google. Pass `isAdult` (18+ attestation) when retrying after a 400
   * `age_attestation_required` (see `isAgeAttestationRequired`).
   */
  loginWithGoogle: (idToken: string, role?: RegistrableRole, isAdult?: boolean) => Promise<UserOut>;
  /** public door only: POST /auth/guest (patient guest session) */
  guest: () => Promise<UserOut>;
  /** POST /auth/guest/upgrade */
  upgradeGuest: (body: GuestUpgradeIn) => Promise<UserOut>;
  /** public door only: POST /auth/register */
  register: (body: RegisterIn) => Promise<UserOut>;
  logout: (options?: LogoutOptions) => Promise<void>;
  /** re-read GET /auth/me (after profile / membership changes); null when it fails */
  refreshUser: () => Promise<UserOut | null>;
  /** alias of refreshUser */
  reloadUser: () => Promise<UserOut | null>;
  /** replace the cached user (e.g. after PATCH /auth/me) */
  setUser: (user: UserOut) => void;
  /** adopt a TokenOut obtained elsewhere (e.g. a custom sign-in flow) */
  acceptToken: (token: TokenOut) => UserOut;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /** 'public' (default) for patient / agent / hospital apps, 'staff' for the admin console */
  door?: AuthDoor;
  /** default: public door -> website login (VITE_PUBLIC_LOGIN_URL); staff door -> "/login" (in-app route) */
  loginUrl?: string;
  /** override portal URLs per role (default from VITE_*_URL env vars / PLAN defaults) */
  portalUrls?: Partial<Record<UserRole, string>>;
  /** where logout() sends the browser; default: public door -> website home, staff door -> stay */
  afterLogoutUrl?: string | null;
  /** query key seeded with the user (default ['auth', 'me']) */
  meQueryKey?: QueryKey;
  /** called whenever the signed-in user changes (null = signed out) */
  onSessionChange?: (user: UserOut | null) => void;
}

function publicOnly(door: AuthDoor, action: string): void {
  if (door !== 'public') throw new Error(`${action} is only available at the public door`);
}

export function AuthProvider({
  children,
  door = 'public',
  loginUrl,
  portalUrls,
  afterLogoutUrl,
  meQueryKey = ME_QUERY_KEY,
  onSessionChange,
}: AuthProviderProps) {
  // Configure the refresh endpoint during the first render, before any child effect can trigger a refresh.
  useState(() => {
    configureApiClient({ refreshPath: AUTH_DOOR_ENDPOINTS[door].refresh });
    return null;
  });
  useEffect(() => {
    configureApiClient({ refreshPath: AUTH_DOOR_ENDPOINTS[door].refresh });
  }, [door]);

  const queryClient = useContext(QueryClientContext);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<UserOut | null>(null);
  const statusRef = useRef<AuthStatus>('loading');
  const applyingToken = useRef(false);
  const onSessionChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
  });
  const meKeyRef = useRef<QueryKey>(meQueryKey);
  useEffect(() => {
    meKeyRef.current = meQueryKey;
  });

  const seedCache = useCallback(
    (me: UserOut | null) => {
      if (!queryClient) return;
      if (me) queryClient.setQueryData(meKeyRef.current, me);
      else queryClient.removeQueries({ queryKey: meKeyRef.current });
    },
    [queryClient],
  );

  const setSignedIn = useCallback(
    (me: UserOut) => {
      statusRef.current = 'authenticated';
      setUserState(me);
      setStatus('authenticated');
      seedCache(me);
      onSessionChangeRef.current?.(me);
    },
    [seedCache],
  );

  const setSignedOut = useCallback(() => {
    const wasSignedIn = statusRef.current === 'authenticated';
    statusRef.current = 'anonymous';
    setUserState(null);
    setStatus('anonymous');
    if (wasSignedIn) {
      queryClient?.clear();
      onSessionChangeRef.current?.(null);
    }
  }, [queryClient]);

  const storeToken = useCallback((token: TokenOut) => {
    applyingToken.current = true;
    try {
      tokenStore.set(token.access_token, token.expires_in);
    } finally {
      applyingToken.current = false;
    }
  }, []);

  const acceptToken = useCallback(
    (token: TokenOut, resetCache = true): UserOut => {
      if (resetCache) queryClient?.clear();
      storeToken(token);
      setSignedIn(token.user);
      return token.user;
    },
    [queryClient, setSignedIn, storeToken],
  );

  // Bootstrap: refresh cookie -> /auth/me
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const refreshed = tokenStore.get() ? null : await refreshSession();
      if (cancelled) return;
      if (!tokenStore.get()) {
        setSignedOut();
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setSignedIn(me);
      } catch {
        if (cancelled) return;
        if (refreshed?.user && tokenStore.get()) setSignedIn(refreshed.user);
        else setSignedOut();
      }
    })();
    return () => {
      cancelled = true;
    };
    // run once per door
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [door]);

  // Keep in sync with the API client (refresh rotation, expiry) and with code that sets the token directly.
  useEffect(() => {
    const offRefreshed = onTokenRefreshed((token) => {
      if (statusRef.current === 'authenticated') {
        setUserState(token.user);
        seedCache(token.user);
      }
    });
    const offExpired = onSessionExpired(() => setSignedOut());
    const offToken = tokenStore.subscribe((token) => {
      if (applyingToken.current) return;
      if (!token) {
        if (statusRef.current === 'authenticated') setSignedOut();
        return;
      }
      if (statusRef.current === 'anonymous') {
        void authApi
          .me()
          .then((me) => setSignedIn(me))
          .catch(() => undefined);
      }
    });
    return () => {
      offRefreshed();
      offExpired();
      offToken();
    };
  }, [seedCache, setSignedIn, setSignedOut]);

  const login = useCallback(
    async (emailOrBody: string | LoginIn, password?: string, otp?: string) => {
      const body: LoginIn =
        typeof emailOrBody === 'string'
          ? { email: emailOrBody.trim(), password: password ?? '', ...(otp ? { otp_code: otp } : {}) }
          : emailOrBody;
      const token = door === 'staff' ? await authApi.staffLogin(body) : await authApi.login(body);
      return acceptToken(token);
    },
    [acceptToken, door],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string, role?: RegistrableRole, isAdult?: boolean) => {
      publicOnly(door, 'Google sign-in');
      const token = await authApi.google({
        id_token: idToken,
        ...(role ? { role } : {}),
        ...(isAdult !== undefined ? { is_adult: isAdult } : {}),
      });
      return acceptToken(token);
    },
    [acceptToken, door],
  );

  const guest = useCallback(async () => {
    publicOnly(door, 'Guest access');
    return acceptToken(await authApi.guest());
  }, [acceptToken, door]);

  const upgradeGuest = useCallback(
    async (body: GuestUpgradeIn) => acceptToken(await authApi.upgradeGuest(body), false),
    [acceptToken],
  );

  const register = useCallback(
    async (body: RegisterIn) => {
      publicOnly(door, 'Registration');
      return acceptToken(await authApi.register(body));
    },
    [acceptToken, door],
  );

  const resolvedAfterLogout = afterLogoutUrl !== undefined ? afterLogoutUrl : door === 'public' ? websiteUrl() : null;

  const logout = useCallback(
    async (options: LogoutOptions = {}) => {
      try {
        if (door === 'staff') await authApi.staffLogout();
        else await authApi.logout();
      } catch {
        // the local session is cleared regardless (the cookie expires / is revoked server-side)
      }
      applyingToken.current = true;
      try {
        tokenStore.clear();
      } finally {
        applyingToken.current = false;
      }
      setSignedOut();
      queryClient?.clear();
      const target = options.redirectTo !== undefined ? options.redirectTo : resolvedAfterLogout;
      if (target && typeof window !== 'undefined') window.location.assign(target);
    },
    [door, queryClient, resolvedAfterLogout, setSignedOut],
  );

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.me();
      if (statusRef.current === 'authenticated') {
        setUserState(me);
        seedCache(me);
      }
      return me;
    } catch {
      return null;
    }
  }, [seedCache]);

  const setUser = useCallback(
    (me: UserOut) => {
      setUserState(me);
      seedCache(me);
    },
    [seedCache],
  );

  const hasRole = useCallback(
    (...roles: (UserRole | readonly UserRole[])[]) => {
      if (!user) return false;
      return roles.some((r) => (typeof r === 'string' ? r === user.role : r.includes(user.role)));
    },
    [user],
  );

  const resolvedLoginUrl = loginUrl ?? (door === 'staff' ? '/login' : publicLoginUrl());
  const portalKey = JSON.stringify(portalUrls ?? {});
  const resolvedPortalUrls = useMemo(
    () => ({ ...defaultPortalUrls(), ...(JSON.parse(portalKey) as Partial<Record<UserRole, string>>) }),
    [portalKey],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      door,
      loginUrl: resolvedLoginUrl,
      portalUrls: resolvedPortalUrls,
      isLoading: status === 'loading',
      isAuthenticated: status === 'authenticated' && user !== null,
      isGuest: Boolean(user?.is_guest),
      isStaff: isStaffRole(user?.role),
      hasRole,
      login,
      loginWithGoogle,
      guest,
      upgradeGuest,
      register,
      logout,
      refreshUser,
      reloadUser: refreshUser,
      setUser,
      acceptToken: (token: TokenOut) => acceptToken(token),
    }),
    [
      status,
      user,
      door,
      resolvedLoginUrl,
      resolvedPortalUrls,
      hasRole,
      login,
      loginWithGoogle,
      guest,
      upgradeGuest,
      register,
      logout,
      refreshUser,
      setUser,
      acceptToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Session state & actions. Must be used under <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider> (from @hig/shared/auth)');
  return ctx;
}

/** Like useAuth() but returns null outside an <AuthProvider> (for components usable in both cases). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
