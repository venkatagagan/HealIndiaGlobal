import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from '@hig/shared/auth';
import { createQueryClient } from '@hig/shared/lib';
import { Toaster } from '@hig/shared/ui';
import { router } from './routes';

/** Public door (PLAN 3.1): session from the website sign-in (cookie `hig_refresh`), no login form here. */
export function App() {
  const [queryClient] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider door="public">
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
