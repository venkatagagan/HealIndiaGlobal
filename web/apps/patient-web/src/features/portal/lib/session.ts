import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, isApiError, tokenStore, type GuestUpgradeIn, type UserOut } from '@hig/shared/api';

export const meKey = ['me'] as const;

/**
 * Current user (GET /auth/me). The API client restores the session from the httpOnly refresh cookie on the
 * first 401, so this also works right after a page reload.
 */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
}

/** Guest -> full account (POST /auth/guest/upgrade); stores the new access token. */
export function useUpgradeGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuestUpgradeIn) => authApi.upgradeGuest(body),
    onSuccess: (token) => {
      tokenStore.set(token.access_token, token.expires_in);
      qc.setQueryData<UserOut>(meKey, token.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await authApi.logout();
      } finally {
        tokenStore.clear();
      }
    },
    onSettled: () => {
      qc.clear();
    },
  });
}
