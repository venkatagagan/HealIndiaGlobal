/**
 * Guardian consent (patients under 18). Any 403 `guardian_consent_required` - from a React Query query or
 * mutation anywhere in the portal, or reported with `openGuardianConsent()` - opens the consent form
 * (POST /privacy/guardian-consent). The profile privacy tab shows the status.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import {
  errorMessage,
  fieldErrors,
  isGuardianConsentRequiredError,
  type GuardianConsentIn,
  type GuardianRelationship,
  type GuardianVerificationMethod,
} from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { useGuardianStatus, useRecordGuardianConsent } from '../api/phase1';
import { useMe } from '../lib/session';
import { cn } from '../lib/shared';
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Modal, Select } from '../ui/primitives';

// ---------------------------------------------------------------------------------------------------------
// Open / close from anywhere
// ---------------------------------------------------------------------------------------------------------
let dialogOpen = false;
const listeners = new Set<() => void>();
function setDialogOpen(open: boolean) {
  dialogOpen = open;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Open the guardian consent form (e.g. after catching a `guardian_consent_required` error yourself). */
export function openGuardianConsent(): void {
  setDialogOpen(true);
}

const METHODS: GuardianVerificationMethod[] = ['video_call', 'id_document', 'digilocker', 'in_person'];
const RELATIONSHIPS: GuardianRelationship[] = ['parent', 'lawful_guardian'];

interface FormState {
  guardian_name: string;
  relationship: GuardianRelationship;
  guardian_email: string;
  guardian_phone: string;
  guardian_date_of_birth: string;
  verification_method: GuardianVerificationMethod;
  declaration: boolean;
}

const EMPTY: FormState = {
  guardian_name: '',
  relationship: 'parent',
  guardian_email: '',
  guardian_phone: '',
  guardian_date_of_birth: '',
  verification_method: 'video_call',
  declaration: false,
};

/** Latest date of birth of an adult guardian (18 years ago). */
function adultMaxDob(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export function GuardianConsentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const record = useRecordGuardianConsent();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'contact', string>>>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const next: typeof errors = {};
    if (form.guardian_name.trim().length < 2) next.guardian_name = t('guardian.nameRequired');
    if (!form.guardian_email.trim() && !form.guardian_phone.trim()) next.contact = t('guardian.contactRequired');
    if (form.guardian_email.trim() && !/^\S+@\S+\.\S+$/.test(form.guardian_email.trim())) next.guardian_email = t('guardian.emailInvalid');
    if (!form.guardian_date_of_birth) next.guardian_date_of_birth = t('guardian.dobRequired');
    if (!form.declaration) next.declaration = t('guardian.declarationRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    const body: GuardianConsentIn = {
      guardian_name: form.guardian_name.trim(),
      relationship: form.relationship,
      guardian_email: form.guardian_email.trim() || null,
      guardian_phone: form.guardian_phone.trim() || null,
      guardian_date_of_birth: form.guardian_date_of_birth,
      verification_method: form.verification_method,
      declaration: form.declaration,
    };
    try {
      await record.mutateAsync(body);
      toast.success(t('guardian.sent'));
      setForm(EMPTY);
      onClose();
    } catch (err) {
      const fields = fieldErrors(err);
      const mapped: typeof errors = {};
      for (const key of ['guardian_name', 'guardian_email', 'guardian_phone', 'guardian_date_of_birth'] as const) {
        if (fields[key]) mapped[key] = fields[key];
      }
      if (Object.keys(mapped).length) setErrors(mapped);
      else toast.error(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('guardian.title')}
      description={t('guardian.intro')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('guardian.later')}
          </Button>
          <Button loading={record.isPending} onClick={() => void submit()}>
            {t('guardian.submit')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t('guardian.name')} htmlFor="gc-name" error={errors.guardian_name} required>
          <Input
            id="gc-name"
            autoComplete="off"
            value={form.guardian_name}
            aria-invalid={!!errors.guardian_name}
            onChange={(e) => set('guardian_name', e.target.value)}
          />
        </Field>
        <Field label={t('guardian.relationship')} htmlFor="gc-rel" required>
          <Select id="gc-rel" value={form.relationship} onChange={(e) => set('relationship', e.target.value as GuardianRelationship)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {t(`guardian.relationships.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('guardian.email')} htmlFor="gc-email" error={errors.guardian_email}>
            <Input
              id="gc-email"
              type="email"
              value={form.guardian_email}
              aria-invalid={!!errors.guardian_email}
              onChange={(e) => set('guardian_email', e.target.value)}
            />
          </Field>
          <Field label={t('guardian.phone')} htmlFor="gc-phone" error={errors.guardian_phone}>
            <Input
              id="gc-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={form.guardian_phone}
              aria-invalid={!!errors.guardian_phone}
              onChange={(e) => set('guardian_phone', e.target.value)}
            />
          </Field>
        </div>
        {errors.contact ? (
          <p className="text-xs text-danger-ink" role="alert">
            {errors.contact}
          </p>
        ) : null}
        <Field label={t('guardian.dob')} htmlFor="gc-dob" error={errors.guardian_date_of_birth} required>
          <Input
            id="gc-dob"
            type="date"
            max={adultMaxDob()}
            min="1900-01-01"
            value={form.guardian_date_of_birth}
            aria-invalid={!!errors.guardian_date_of_birth}
            onChange={(e) => set('guardian_date_of_birth', e.target.value)}
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">{t('guardian.verification')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {METHODS.map((m) => (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm',
                  form.verification_method === m ? 'border-primary bg-primary-soft' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name="gc-method"
                  value={m}
                  checked={form.verification_method === m}
                  onChange={() => set('verification_method', m)}
                  className="accent-primary"
                />
                {t(`guardian.methods.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Checkbox checked={form.declaration} onChange={(e) => set('declaration', e.target.checked)} label={t('guardian.declaration')} />
          {errors.declaration ? (
            <p className="mt-1 text-xs text-danger-ink" role="alert">
              {errors.declaration}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted">{t('guardian.afterSubmit')}</p>
      </form>
    </Modal>
  );
}

/**
 * Mount once (PortalShell): opens the dialog on any `guardian_consent_required` error seen by React Query and
 * for `openGuardianConsent()` calls.
 */
export function GuardianConsentGate() {
  const qc = useQueryClient();
  const open = useSyncExternalStore(subscribe, () => dialogOpen, () => false);

  useEffect(() => {
    const onError = (error: unknown) => {
      if (isGuardianConsentRequiredError(error)) setDialogOpen(true);
    };
    const unsubQueries = qc.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const unsubMutations = qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [qc]);

  return <GuardianConsentDialog open={open} onClose={() => setDialogOpen(false)} />;
}

/** Profile > Privacy: guardian consent status (shown for minors and whenever a consent exists). */
export function GuardianStatusCard() {
  const { t } = useAppTranslation();
  const me = useMe();
  const status = useGuardianStatus(!!me.data && !me.data.is_guest);
  const s = status.data;
  if (!s || (!s.is_minor && !s.consent && !s.pending && !me.data?.guardian_consent_required)) return null;
  const consent = s.consent && !s.consent.revoked_at ? s.consent : null;
  return (
    <Card>
      <CardHeader title={t('guardian.statusTitle')} />
      <CardBody className="space-y-3">
        {s.satisfied && consent ? (
          <Alert tone="green" icon={<ShieldCheck className="size-5" aria-hidden />}>
            {t('guardian.statusVerified', { name: consent.guardian_name })}
          </Alert>
        ) : s.pending ? (
          <Alert tone="amber" icon={<ShieldQuestion className="size-5" aria-hidden />}>
            {t('guardian.statusPending', { name: s.pending.guardian_name })}
          </Alert>
        ) : (
          <>
            <Alert tone="red" icon={<ShieldAlert className="size-5" aria-hidden />}>
              {t('guardian.statusNeeded')}
            </Alert>
            <Button onClick={openGuardianConsent}>{t('guardian.addConsent')}</Button>
          </>
        )}
        {!s.date_of_birth_known && s.is_minor ? <p className="text-xs text-muted">{t('guardian.dobUnknown')}</p> : null}
        <p className="text-xs text-muted">{t('guardian.statusHint')}</p>
      </CardBody>
    </Card>
  );
}
