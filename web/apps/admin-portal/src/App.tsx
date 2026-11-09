import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from '@hig/shared/auth';
import { createQueryClient } from '@hig/shared/lib';
import { Toaster } from '@hig/shared/ui';
import { router } from './routes';

/**
 * Staff door (PLAN 3.1): sessions use POST /auth/staff/login | /auth/staff/refresh | /auth/staff/logout and the
 * separate `hig_staff_refresh` cookie. Never falls back to the public door.
 */
export function App() {
  const [queryClient] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider door="staff" loginUrl="/login" afterLogoutUrl={null}>
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
