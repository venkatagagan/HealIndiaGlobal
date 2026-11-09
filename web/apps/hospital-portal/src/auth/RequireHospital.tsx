import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { RequireAuth } from '@hig/shared/auth';
import type { UserOut } from '@hig/shared/api';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { useAuth } from './AuthProvider';

const HOSPITAL_ONLY = ['hospital'] as const;

// `hospitals` is optional in UserOut: block only when the API explicitly reports no membership
const hasMembership = (user: UserOut) => !(Array.isArray(user.hospitals) && user.hospitals.length === 0);

function NoMembership() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <EmptyState
        icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
        title="No hospital linked to your account"
        description="Ask your hospital administrator to invite you, or register a new hospital."
        action={
          <Button variant="outline" onClick={() => void logout()}>
            Sign out
          </Button>
        }
      />
    </div>
  );
}

/**
 * Gate for the portal (PLAN 3.1): anonymous visitors go to the website door
 * (`VITE_PUBLIC_LOGIN_URL?next=<current url>`); other roles are sent to their own portal; hospital users
 * need at least one hospital membership.
 */
export function RequireHospital({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      roles={HOSPITAL_ONLY}
      redirectWrongRole
      allow={hasMembership}
      forbidden={<NoMembership />}
      fallback={<PageLoader label="Restoring your session…" />}
    >
      {children}
    </RequireAuth>
  );
}
