/**
 * Safety / account gates for the booking flow:
 * - INTEGRATION_BACKLOG #13: a case screened as an emergency blocks quote acceptance and booking until the patient
 *   acknowledges the emergency guidance (POST /cases/{id}/emergency-ack; API errors 409 `emergency_ack_required`).
 * - INTEGRATION_BACKLOG #12: guests must create a full account before creating a case or booking/paying
 *   (API errors 403 `guest_upgrade_required`).
 */
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import type { CaseOut, Uuid } from '@hig/shared/api';
import { EmergencyAckPanel as SharedEmergencyAckPanel, isGuestUpgradeError } from '@hig/shared/ui';
import { qk } from '../api/queries';
import { useMe } from '../lib/session';
import { Button } from '../ui/primitives';
import { GuestUpgradeDialog } from './GuestUpgrade';

export { isEmergencyAckError, isGuestUpgradeError, needsEmergencyAck } from '@hig/shared/ui';

/** Patient copy of the shared emergency gate (@hig/shared/ui); also refreshes the dashboard after acknowledging. */
export function EmergencyAckPanel({
  caseId,
  onAcknowledged,
  className,
}: {
  caseId: Uuid;
  onAcknowledged?: (updated: CaseOut) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  return (
    <SharedEmergencyAckPanel
      caseId={caseId}
      audience="patient"
      className={className}
      onAcknowledged={(updated) => {
        void qc.invalidateQueries({ queryKey: qk.dashboard });
        onAcknowledged?.(updated);
      }}
    />
  );
}

/**
 * Guest gate: `requireAccount()` returns true (and opens the upgrade dialog) when the user is a guest; render
 * `dialog` once. `handleError(err)` opens the dialog for a 403 `guest_upgrade_required` and returns true.
 */
export function useGuestGate() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const isGuest = me.data?.is_guest ?? false;
  return {
    isGuest,
    requireAccount(): boolean {
      if (!isGuest) return false;
      setOpen(true);
      return true;
    },
    handleError(err: unknown): boolean {
      if (!isGuestUpgradeError(err)) return false;
      setOpen(true);
      return true;
    },
    dialog: <GuestUpgradeDialog open={open} onClose={() => setOpen(false)} />,
  };
}

/** Inline notice used instead of a booking/case form for guests. */
export function GuestAccountRequired({ action, children }: { action: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-500/30 dark:bg-violet-500/10">
      <p className="font-semibold">Create your free account to {action}</p>
      <p className="mt-1 text-sm text-muted">
        Guest sessions can explore and run a screening. To request quotes, book and pay, hospitals need a verified
        account. Everything you did as a guest is kept.
      </p>
      {children}
      <Button className="mt-3" icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>
        Create account
      </Button>
      <GuestUpgradeDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
