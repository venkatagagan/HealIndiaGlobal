import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AGENT_CONSENT_METHODS,
  AGENT_CONSENT_METHOD_LABELS,
  AGENT_CONSENT_STATUS_LABELS,
  CONSENT_KIND_LABELS,
  agentPortalApi,
  errorMessage,
  type AgentConsentMethod,
  type AgentConsentStatus,
  type AgentPatientOut,
  type ConsentKind,
} from '@hig/shared/api';
import { Badge, Button, Card, CardHeader, Checkbox, FormField, Input, Modal, Select, type BadgeTone } from '../../components/ui';
import { qk } from '../../lib/queries';
import { formatDateTime } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';

const STATUS_TONE: Record<AgentConsentStatus, BadgeTone> = {
  not_recorded: 'danger',
  pending_patient_confirmation: 'warning',
  confirmed: 'success',
  withdrawn: 'danger',
};

const methodLabel = (method: string | null | undefined) =>
  method ? (AGENT_CONSENT_METHOD_LABELS[method as AgentConsentMethod] ?? method) : '—';
const kindsLabel = (kinds: readonly ConsentKind[]) =>
  kinds.length ? kinds.map((k) => CONSENT_KIND_LABELS[k] ?? k).join(', ') : '—';

/** Consent attestation state (backlog #30) with a "record consent" action (POST /agent-portal/patients/{id}/consent). */
export function PatientConsentCard({ patient }: { patient: AgentPatientOut }) {
  const { t } = useAppTranslation();
  const consent = patient.consent ?? null;
  const status: AgentConsentStatus = consent?.status ?? 'not_recorded';
  const [open, setOpen] = useState(false);
  const needsAction = status === 'not_recorded' || status === 'withdrawn';

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={t('consent.title')}
        description={t('consent.description')}
        actions={
          <>
            <Badge tone={STATUS_TONE[status]}>{AGENT_CONSENT_STATUS_LABELS[status]}</Badge>
            <Button size="sm" variant={needsAction ? 'primary' : 'outline'} onClick={() => setOpen(true)}>
              {needsAction ? t('consent.record') : t('consent.reattest')}
            </Button>
          </>
        }
      />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">{t('consent.consentedTo')}</dt>
          <dd className="mt-0.5 font-medium">{kindsLabel(consent?.kinds ?? [])}</dd>
        </div>
        <div>
          <dt className="text-muted">{t('consent.obtained')}</dt>
          <dd className="mt-0.5 font-medium">
            {methodLabel(consent?.method)}
            {consent?.attested_at ? ` · ${formatDateTime(consent.attested_at)}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t('consent.patientConfirmation')}</dt>
          <dd className="mt-0.5 font-medium">
            {consent?.patient_confirmed_at
              ? formatDateTime(consent.patient_confirmed_at)
              : consent?.pending_kinds.length
                ? t('consent.pendingKinds', { kinds: kindsLabel(consent.pending_kinds) })
                : t('consent.notYet')}
          </dd>
        </div>
      </dl>
      {open && <AttestConsentDialog patient={patient} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function AttestConsentDialog({ patient, onClose }: { patient: AgentPatientOut; onClose: () => void }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [attested, setAttested] = useState(false);
  const [share, setShare] = useState(true);
  const [method, setMethod] = useState<AgentConsentMethod>('in_person');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      agentPortalApi.attestPatientConsent(patient.id, {
        consent_attested: true,
        consent_kinds: ['terms', 'privacy', ...(share ? (['share_with_hospitals'] as const) : [])],
        consent_method: method,
        ...(note.trim() ? { consent_note: note.trim() } : {}),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.patient(patient.id), saved);
      void queryClient.invalidateQueries({ queryKey: ['agent-patients'] });
      toast.success(t('consent.recorded'));
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('consent.dialogTitle')}
      description={t('consent.dialogDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            {t('consent.cancel')}
          </Button>
          <Button
            loading={mutation.isPending}
            onClick={() => {
              if (!attested) {
                setError(t('consent.confirmRequired'));
                return;
              }
              setError(null);
              mutation.mutate();
            }}
          >
            {t('consent.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Checkbox
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          aria-invalid={!!error}
          label={t('consent.attest')}
        />
        <Checkbox
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
          label={t('consent.share')}
        />
        {error && (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        )}
        <FormField label={t('consent.method')} htmlFor="ac-method" required>
          <Select id="ac-method" value={method} onChange={(e) => setMethod(e.target.value as AgentConsentMethod)}>
            {AGENT_CONSENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {AGENT_CONSENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('consent.note')} htmlFor="ac-note">
          <Input id="ac-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
