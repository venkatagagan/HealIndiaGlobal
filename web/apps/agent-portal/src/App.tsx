import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { createQueryClient, useTheme } from './lib/shared';
import { RealtimeProvider } from './lib/realtime';
import { router } from './routes';

const queryClient = createQueryClient();

function RealtimeBridge() {
  const { status, user } = useAuth();
  return (
    <RealtimeProvider enabled={status === 'authenticated' && user?.role === 'agent'}>
      <RouterProvider router={router} />
    </RealtimeProvider>
  );
}

function ThemedToaster() {
  const { isDark } = useTheme();
  return <Toaster richColors closeButton position="top-right" theme={isDark ? 'dark' : 'light'} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeBridge />
        <ThemedToaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
