import type { ReactNode } from 'react';
import { RequireAuth } from '@hig/shared/auth';
import { LoadingBlock } from '../components/ui';
import { useAppTranslation } from '../i18n';

const AGENT_ONLY = ['agent'] as const;

/**
 * Gate for the portal (PLAN 3.1): anonymous visitors go to the website door
 * (`VITE_PUBLIC_LOGIN_URL?next=<current url>`); signed-in users of another role are sent to their own portal.
 */
export function RequireAgent({ children }: { children: ReactNode }) {
  const { t } = useAppTranslation();
  return (
    <RequireAuth
      roles={AGENT_ONLY}
      redirectWrongRole
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingBlock label={t('auth.checkingSession')} />
        </div>
      }
    >
      {children}
    </RequireAuth>
  );
}
