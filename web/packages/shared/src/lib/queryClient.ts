import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    // never retry client errors (4xx incl. 401 - the client already refreshed once)
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < 2;
}

export interface CreateQueryClientOptions {
  /** called for every failed query/mutation (e.g. log); toasts are left to the caller */
  onError?: (error: unknown) => void;
}

/**
 * Shared QueryClient defaults: staleTime 30s, no retries on 4xx, mutations never retried.
 * Query key convention: [domain, ...params] e.g. ["cases", {status: "quoted", page: 1}], ["cases", id].
 */
export function createQueryClient(options: CreateQueryClientOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error) => options.onError?.(error) }),
    mutationCache: new MutationCache({ onError: (error) => options.onError?.(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
