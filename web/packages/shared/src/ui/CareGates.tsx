/**
 * Safety / account gates for case + booking flows, shared by patient-web and the agent portal.
 * - Emergency gate: a case screened as an emergency blocks quote acceptance and booking until the patient (or their
 *   agent) acknowledges the emergency guidance (POST /cases/{id}/emergency-ack; API errors 409 `emergency_ack_required`).
 * - Guest gate: guests must create a full account before creating a case or booking/paying
 *   (API errors 403 `guest_upgrade_required`).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, ShieldAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, isApiError } from '../api/client';
import { casesApi } from '../api/endpoints/cases';
import type { CaseOut, Uuid } from '../api/types';
import { cn } from '../lib/cn';
import { Button } from './Button';

/** Who is looking at the gate: the patient themself, or an agent acting for their patient. */
export type CareGateAudience = 'patient' | 'agent';

export function needsEmergencyAck(c: Pick<CaseOut, 'emergency_ack_required'> | null | undefined): boolean {
  return c?.emergency_ack_required === true;
}

export function isEmergencyAckError(error: unknown): boolean {
  return isApiError(error) && error.code === 'emergency_ack_required';
}

export function isGuestUpgradeError(error: unknown): boolean {
  return isApiError(error) && error.code === 'guest_upgrade_required';
}

/** POST /cases/{id}/emergency-ack; invalidates every `['cases', ...]` query on success. */
export function useAcknowledgeEmergency(caseId: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => casesApi.emergencyAck(caseId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

const COPY: Record<CareGateAudience, { title: string; lead: string; ack: string; done: string }> = {
  patient: {
    title: 'Emergency — seek local care now',
    lead:
      'Your answers suggest you may need urgent medical care. Please seek local emergency care now: call your local emergency number or go to the nearest emergency ' +
      'department. Do not wait to travel for treatment.',
    ack:
      'I have read this guidance. I have sought (or will seek) local medical advice, and I understand Heal India ' +
      'Global does not provide emergency care.',
    done: 'Thank you. You can continue with your case.',
  },
  agent: {
    title: 'Emergency — seek local care now',
    lead:
      "This patient's screening suggests they may need urgent medical care. Before planning medical travel, make sure " +
      'the patient seeks local emergency care now: their local emergency ' +
      'number or the nearest emergency department. They should not wait to travel for treatment.',
    ack:
      'I have shared this guidance with the patient. They have sought (or will seek) local medical advice, and we ' +
      'understand Heal India Global does not provide emergency care.',
    done: 'Acknowledged. You can continue with this case.',
  },
};

export interface EmergencyAckPanelProps {
  caseId: Uuid;
  audience?: CareGateAudience;
  onAcknowledged?: (updated: CaseOut) => void;
  className?: string;
}

/**
 * Blocking emergency guidance with an explicit acknowledgement. Show it on the case page and instead of the booking
 * form while `emergency_ack_required` is true, and whenever the API answers 409 `emergency_ack_required`.
 */
export function EmergencyAckPanel({ caseId, audience = 'patient', onAcknowledged, className }: EmergencyAckPanelProps) {
  const ack = useAcknowledgeEmergency(caseId);
  const [read, setRead] = useState(false);
  const copy = COPY[audience];
  return (
    <section
      role="alert"
      aria-labelledby={`emergency-${caseId}`}
      className={cn(
        'rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-100',
        className,
      )}
    >
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-7 w-7 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
        <div className="min-w-0 space-y-2 text-sm">
          <h2 id={`emergency-${caseId}`} className="text-lg font-bold">
            {copy.title}
          </h2>
          <p className="font-medium">{copy.lead}</p>
          <p>
            Medical travel is not a substitute for emergency care. Treatment planning in India can continue only after
            a local doctor has confirmed it is safe to travel.
          </p>
          <p className="flex items-center gap-2 font-semibold">
            <Phone className="h-4 w-4" aria-hidden /> In India, dial 112 for emergencies.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white/70 p-3 dark:bg-black/20">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
              checked={read}
              onChange={(e) => setRead(e.target.checked)}
            />
            <span>{copy.ack}</span>
          </label>
          <div className="pt-1">
            <Button
              variant="danger"
              disabled={!read}
              loading={ack.isPending}
              onClick={() =>
                ack.mutate(undefined, {
                  onSuccess: (updated) => {
                    toast.success(copy.done);
                    onAcknowledged?.(updated);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              I understand - continue
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Agent-side notice for 403 `guest_upgrade_required`: the patient is on a guest account and must upgrade it
 * themselves (agents cannot create the account for them).
 */
export function PatientUpgradeRequiredNotice({ patientName, className }: { patientName?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm dark:border-violet-500/30 dark:bg-violet-500/10',
        className,
      )}
    >
      <div className="flex gap-3">
        <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold">{patientName ? `${patientName} needs a full account` : 'The patient needs a full account'}</p>
          <p className="text-slate-600 dark:text-slate-300">
            This patient is still using a guest session. Hospitals need a verified account before quotes can be
            accepted, bookings made or payments taken. Ask the patient to open Heal India Global and choose
            &ldquo;Create account&rdquo; - everything from their guest session is kept - then try again.
          </p>
        </div>
      </div>
    </div>
  );
}
