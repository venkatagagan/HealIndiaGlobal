import { useQuery } from '@tanstack/react-query';
import { authApi, type UserOut } from '@hig/shared/api';
import { permissionsFor, type OpsPermissions } from './permissions';

/**
 * Current signed-in staff user (GET /auth/me), cached under ["auth", "me"]. The shell's auth layer owns the
 * session; this read-only query lets the ops pages adapt to the role without depending on its internals.
 */
export function useCurrentUser() {
  return useQuery<UserOut>({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me(),
    staleTime: 5 * 60_000,
  });
}

/** Capability flags for the current role (all false until /auth/me resolves). */
export function useOpsPermissions(): OpsPermissions & { user: UserOut | undefined } {
  const { data } = useCurrentUser();
  return { ...permissionsFor(data?.role), user: data };
}
