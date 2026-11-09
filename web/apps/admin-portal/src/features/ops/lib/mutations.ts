import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@hig/shared/api';

export interface OpsMutationOptions<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** toast text on success (string or builder) */
  success?: string | ((result: TResult, vars: TVars) => string);
  /** query keys (prefixes) to invalidate on success */
  invalidate?: readonly QueryKey[];
  onSuccess?: (result: TResult, vars: TVars) => void;
}

/** useMutation + success/error toasts + invalidation of the given query key prefixes. */
export function useOpsMutation<TVars = void, TResult = unknown>(options: OpsMutationOptions<TVars, TResult>) {
  const qc = useQueryClient();
  return useMutation<TResult, unknown, TVars>({
    mutationFn: options.mutationFn,
    onSuccess: async (result, vars) => {
      if (options.success) {
        toast.success(typeof options.success === 'function' ? options.success(result, vars) : options.success);
      }
      options.onSuccess?.(result, vars);
      await Promise.all((options.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}

/** Query keys used by the ops console (prefix-invalidated after mutations). */
export const opsKeys = {
  dashboard: ['admin', 'dashboard'] as const,
  users: ['admin', 'users'] as const,
  staff: ['admin', 'staff'] as const,
  hospitals: ['admin', 'hospitals'] as const,
  agents: ['admin', 'agents'] as const,
  cases: ['cases'] as const,
  bookings: ['bookings'] as const,
  travel: ['travel'] as const,
  sos: ['travel', 'sos'] as const,
  catalog: ['admin', 'catalog'] as const,
  content: ['admin', 'content'] as const,
  settings: ['admin', 'settings'] as const,
  audit: ['admin', 'audit-logs'] as const,
  conversations: ['conversations'] as const,
};
