/**
 * In-app account deletion (App Store 5.1.1(v) / Google Play), shared by patient-web, the agent portal and the
 * hospital portal.
 *
 * - `DELETE /auth/me` `{password?, otp_code?, reason?}` -> 204; errors 400 `invalid_current_password` / `invalid_otp`,
 *   409 `account_deletion_blocked` (details = blocker counts, e.g. `owned_listed_hospitals` for the only owner of a
 *   listed hospital); the non-zero ones are listed.
 * - While blocked, "Request deletion" calls `POST /auth/me/deletion-request` so support closes the account once the
 *   blockers are resolved.
 * - `GET /auth/me/deletion-policy` lists what is kept (statutory retention), shown before confirming.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, isApiError } from '../api/client';
import { authApi } from '../api/endpoints/auth';
import type { AccountDeleteIn, UserOut } from '../api/types';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { FormField, Input, Textarea } from '../ui/form';
import { Modal } from '../ui/overlay';
import { websiteUrl } from './doors';

export type DeleteAccountAudience = 'patient' | 'agent' | 'hospital';

const BLOCKER_LABELS: Record<string, string> = {
  cases_in_progress: 'treatment cases in progress',
  active_bookings: 'active bookings',
  payments_in_progress: 'payments in progress',
  owned_listed_hospitals: 'listed hospitals you are the only owner of (add another owner or ask us to delist first)',
  // older key names
  active_cases: 'treatment cases in progress',
  pending_payments: 'payments in progress',
  listed_hospitals_owned: 'listed hospitals you are the only owner of (add another owner or ask us to delist first)',
};

const COPY: Record<DeleteAccountAudience, { erased: string; lose: string }> = {
  patient: {
    erased:
      'Your contact details, passport and insurance numbers, health notes, companions, saved items and documents ' +
      'that are not part of a case are erased and you are signed out everywhere.',
    lose: 'You will lose access to your screenings, cases, messages and documents.',
  },
  agent: {
    erased:
      'Your contact details and agency profile are erased, your agency is closed and you are signed out everywhere. ' +
      'Your patients keep their own accounts and cases.',
    lose: 'You will lose access to your patients, cases, messages and commission history.',
  },
  hospital: {
    erased:
      'Your contact details are erased, you are removed from every hospital team and you are signed out everywhere. ' +
      'The hospital listing itself stays with its other owners.',
    lose: 'You will lose access to the hospital portal, its cases and messages.',
  },
};

const CONFIRM_WORD = 'DELETE';

function blockerList(details: unknown): string[] {
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => (typeof v === 'number' ? v > 0 : !!v))
    .map(([k, v]) => `${typeof v === 'number' ? `${v} ` : ''}${BLOCKER_LABELS[k] ?? k.replace(/_/g, ' ')}`);
}

export interface DeleteAccountSectionProps {
  user: Pick<UserOut, 'is_guest' | 'mfa_enabled'> | null | undefined;
  audience?: DeleteAccountAudience;
  /** where "Continue" goes after deletion (default: the public website) */
  homeUrl?: string;
  className?: string;
}

export function DeleteAccountSection({ user, audience = 'patient', homeUrl, className }: DeleteAccountSectionProps) {
  const qc = useQueryClient();
  const isGuest = user?.is_guest ?? false;
  const mfa = user?.mfa_enabled ?? false;
  const copy = COPY[audience];
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [requested, setRequested] = useState(false);
  const [done, setDone] = useState(false);

  const policy = useQuery({
    queryKey: ['auth', 'deletion-policy'],
    queryFn: () => authApi.deletionPolicy(),
    enabled: !!user,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const retained = policy.data?.retained ?? [];
  const deleted = policy.data?.deleted ?? [];

  function close() {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setMfaCode('');
    setTyped('');
    setError(null);
    setBlockers([]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setBlockers([]);
    try {
      const body: AccountDeleteIn = {};
      if (password) body.password = password;
      if (mfaCode.trim()) body.otp_code = mfaCode.trim();
      if (reason.trim()) body.reason = reason.trim().slice(0, 500);
      await authApi.deleteMe(body);
      setOpen(false);
      setDone(true);
      // Leave the portal with a full page load; the public page confirms the deletion and lists what is retained.
      // Don't clear the token store or the query cache first: that wakes the auth guard, whose own redirect to the
      // login door would win. The server has revoked every session and the access token only lives in memory, so the
      // page unload signs the user out.
      void qc.cancelQueries();
      window.location.replace(new URL('/account/delete?status=deleted', websiteUrl()).toString());
    } catch (err) {
      if (isApiError(err) && err.code === 'account_deletion_blocked') {
        setBlockers(blockerList(err.details));
        setError(err.message);
      } else if (isApiError(err) && err.code === 'invalid_current_password') {
        setError('The password is incorrect.');
      } else if (isApiError(err) && err.code === 'invalid_otp') {
        setError('The authenticator code is not valid.');
      } else {
        setError(errorMessage(err, 'Your account could not be deleted. Please try again or contact support.'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    setBusy(true);
    try {
      await authApi.requestDeletion(reason.trim() ? { reason: reason.trim().slice(0, 500) } : {});
      setRequested(true);
      toast.success('Deletion requested. Our team will contact you and close the account once nothing is pending.');
    } catch (err) {
      toast.error(errorMessage(err, 'The request could not be sent. Please contact support.'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className={className}>
        <CardBody className="space-y-3">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-success-ink" aria-hidden /> Your account has been deleted
          </p>
          <p className="text-sm text-muted">You have been signed out on all devices.</p>
          {retained.length ? (
            <>
              <p className="text-sm text-muted">What we are required to keep:</p>
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
                {retained.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          <Button onClick={() => window.location.assign(homeUrl ?? websiteUrl())}>Continue</Button>
        </CardBody>
      </Card>
    );
  }

  const canSubmit = typed.trim().toUpperCase() === CONFIRM_WORD && (!mfa || !!mfaCode.trim());

  return (
    <Card className={className}>
      <CardHeader title="Delete account" description="Permanently close your Heal India Global account and erase your personal data." />
      <CardBody className="space-y-3">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium text-fg">What is deleted</p>
            {deleted.length ? (
              <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted">
                {deleted.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">{copy.erased}</p>
            )}
          </div>
          <div>
            <p className="font-medium text-fg">What we keep (required by law)</p>
            {retained.length ? (
              <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted">
                {retained.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">
                Payment records and medical records that belong to a treatment case, for the period the law requires,
                with access limited to the treating hospital and our compliance team.
              </p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted">
          Accounts with treatment, bookings or payments in progress can be deleted once they are finished or cancelled,
          or you can ask us to close the account for you.
        </p>
        <Button variant="danger" leftIcon={<Trash2 className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </CardBody>

      <Modal
        open={open}
        onClose={close}
        title="Delete your account?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            {blockers.length ? (
              <Button
                variant="outline"
                loading={busy}
                disabled={requested}
                leftIcon={<Send className="size-4" aria-hidden />}
                onClick={() => void requestDeletion()}
              >
                {requested ? 'Deletion requested' : 'Request deletion'}
              </Button>
            ) : null}
            <Button variant="danger" loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div role="note" className="flex gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            <span>
              {copy.lose}
              {isGuest ? ' Guest data cannot be recovered after deletion.' : ''}
            </span>
          </div>
          {!isGuest ? (
            <FormField label="Your password" hint="Leave empty only if you always sign in with Google or Apple.">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
          ) : null}
          {mfa ? (
            <FormField label="Authenticator code" hint="The 6-digit code from your authenticator app." required>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
              />
            </FormField>
          ) : null}
          <FormField label="Why are you leaving?" optional>
            <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <FormField label={`Type ${CONFIRM_WORD} to confirm`} required>
            <Input autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </FormField>
          {error ? (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">
              {error}
              {blockers.length ? (
                <>
                  <ul className="mt-2 list-disc ps-5">
                    {blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    {requested
                      ? 'Your deletion request was sent. We will contact you by email.'
                      : 'You can ask us to close the account for you with "Request deletion".'}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </Card>
  );
}
