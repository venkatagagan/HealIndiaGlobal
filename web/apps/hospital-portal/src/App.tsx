import { useState } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ApiError } from '@hig/shared/api';
import { AuthProvider } from './auth/AuthProvider';
import { useTheme } from './lib/prefs';
import { router } from './routes';

function createQueryClient(): QueryClient {
  const retry = (failureCount: number, error: unknown) =>
    !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2;
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  const { isDark } = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster richColors closeButton position="top-right" theme={isDark ? 'dark' : 'light'} />
    </QueryClientProvider>
  );
}
