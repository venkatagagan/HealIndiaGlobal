'use client';

import { useSyncExternalStore } from 'react';
import { CircleCheck } from 'lucide-react';

const noopSubscribe = () => () => {};
const readDeleted = () => new URLSearchParams(window.location.search).get('status') === 'deleted';

/**
 * Confirmation shown when a portal sends the user here right after deleting their account
 * (`/account/delete?status=deleted`). Read on the client (server snapshot: hidden) so the page itself stays static.
 */
export function AccountDeletedBanner() {
  const deleted = useSyncExternalStore(noopSubscribe, readDeleted, () => false);

  if (!deleted) return null;
  return (
    <div className="container-page pt-8">
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-health-200 bg-health-50 p-4 text-health-900"
      >
        <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Your account has been deleted</p>
          <p className="mt-1 text-sm">
            You have been signed out on all devices. The records we are required to keep are listed below.
          </p>
        </div>
      </div>
    </div>
  );
}
