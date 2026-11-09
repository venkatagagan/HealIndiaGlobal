import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { authApi, CONSENT_KIND_LABELS, errorMessage, fieldErrors, type CompanionOut, type ConsentKind, type MfaSetupOut } from '@hig/shared/api';
import { useChangePassword, useCompanions, useConsents, useDeleteCompanion, useGiveConsent, useSaveCompanion } from '../../api/queries';
import { countryName, COUNTRY_OPTIONS } from '../../lib/countries';
import { meKey, useMe } from '../../lib/session';
import { formatDate, formatDateTime, todayIsoDate } from '../../lib/shared';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
} from '../../ui/primitives';

// ---------------------------------------------------------------------------------------------------------
// Companions
// ---------------------------------------------------------------------------------------------------------
const companionSchema = z.object({
  full_name: z.string().trim().min(2, 'Required').max(120),
  relationship: z.string().trim().min(2, 'Required').max(60),
  nationality: z.string(),
  date_of_birth: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => !v || v <= todayIsoDate(), 'Cannot be in the future'),
  passport_number: z
    .string()
    .trim()
    .regex(/^$|^[A-Za-z0-9]{6,20}$/, 'Letters and numbers only (6-20 characters)'),
});
type CompanionValues = z.infer<typeof companionSchema>;

function CompanionDialog({ open, companion, onClose }: { open: boolean; companion: CompanionOut | null; onClose: () => void }) {
  const save = useSaveCompanion();
  const form = useForm<CompanionValues>({
    resolver: zodResolver(companionSchema),
    values: {
      full_name: companion?.full_name ?? '',
      relationship: companion?.relationship ?? '',
      nationality: companion?.nationality ?? '',
      date_of_birth: companion?.date_of_birth ?? '',
      passport_number: '',
    },
  });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: companion?.id,
        body: {
          full_name: v.full_name,
          relationship: v.relationship,
          nationality: v.nationality || null,
          date_of_birth: v.date_of_birth || null,
          ...(v.passport_number ? { passport_number: v.passport_number.toUpperCase() } : {}),
        },
      });
      toast.success(companion ? 'Companion updated' : 'Companion added');
      onClose();
    } catch (err) {
      const f = fieldErrors(err);
      if (Object.keys(f).length) {
        for (const [k, msg] of Object.entries(f)) {
          if (k in companionSchema.shape) form.setError(k as keyof CompanionValues, { message: msg });
        }
      } else toast.error(errorMessage(err));
    }
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={companion ? 'Edit companion' : 'Add a travelling companion'}
      description="Companions can apply for an e-Medical Attendant visa with your invitation letter."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="companion-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="companion-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name (as in passport)" htmlFor="cp-name" error={errors.full_name?.message} required className="sm:col-span-2">
          <Input id="cp-name" {...form.register('full_name')} />
        </Field>
        <Field label="Relationship" htmlFor="cp-rel" error={errors.relationship?.message} required>
          <Input id="cp-rel" placeholder="e.g. spouse, son" {...form.register('relationship')} />
        </Field>
        <Field label="Nationality" htmlFor="cp-nat">
          <Select id="cp-nat" {...form.register('nationality')}>
            <option value="">Select</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of birth" htmlFor="cp-dob" error={errors.date_of_birth?.message}>
          <Input id="cp-dob" type="date" max={todayIsoDate()} {...form.register('date_of_birth')} />
        </Field>
        <Field
          label="Passport number"
          htmlFor="cp-pp"
          error={errors.passport_number?.message}
          hint={companion?.passport_last4 ? `On file: •••• ${companion.passport_last4}` : 'Stored encrypted'}
        >
          <Input id="cp-pp" autoComplete="off" {...form.register('passport_number')} />
        </Field>
      </form>
    </Modal>
  );
}

export function CompanionsSection() {
  const companions = useCompanions();
  const remove = useDeleteCompanion();
  const [editing, setEditing] = useState<CompanionOut | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<CompanionOut | null>(null);

  return (
    <Card>
      <CardHeader
        title="Travelling companions"
        description="Family or friends travelling with you."
        action={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add
          </Button>
        }
      />
      <CardBody>
        {companions.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : companions.isError ? (
          <ErrorState error={companions.error} onRetry={() => void companions.refetch()} />
        ) : companions.data.length === 0 ? (
          <EmptyState icon={<UserRound className="h-8 w-8" aria-hidden />} title="No companions added" />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {companions.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {c.full_name} <span className="text-sm font-normal text-slate-500">· {c.relationship}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.nationality ? countryName(c.nationality) : 'Nationality not set'}
                    {c.date_of_birth ? ` · born ${formatDate(c.date_of_birth)}` : ''}
                    {c.passport_last4 ? ` · passport •••• ${c.passport_last4}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${c.full_name}`}
                    icon={<Pencil className="h-4 w-4" aria-hidden />}
                    onClick={() => {
                      setEditing(c);
                      setOpen(true);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${c.full_name}`}
                    icon={<Trash2 className="h-4 w-4 text-red-500" aria-hidden />}
                    onClick={() => setDeleting(c)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CompanionDialog open={open} companion={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Remove companion?"
        tone="danger"
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Companion removed');
              setDeleting(null);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {deleting ? `${deleting.full_name} will be removed from your profile.` : null}
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------------------------------------
export const CONSENT_VERSION = '2026-10';
const CONSENT_COPY: Record<ConsentKind, string> = {
  terms: 'Terms of service of Heal India Global.',
  privacy: 'How we collect, store and protect your personal and health data.',
  ai_processing: 'Allow AI to analyse your screening answers and reports to suggest specialists. Not a diagnosis.',
  share_with_hospitals: 'Allow us to share your case with hospitals you request quotes from.',
  marketing: 'Occasional news and offers by email. You can unsubscribe at any time.',
};
const REQUIRED: ConsentKind[] = ['terms', 'privacy'];

export function ConsentsSection() {
  const consents = useConsents();
  const give = useGiveConsent();
  const latest = useMemo(() => {
    const map = new Map<ConsentKind, { granted: boolean; at: string }>();
    for (const c of [...(consents.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      map.set(c.kind, { granted: c.granted, at: c.created_at });
    }
    return map;
  }, [consents.data]);

  return (
    <Card>
      <CardHeader title="Privacy & consents" description="Every change is recorded with the date, for your protection." />
      <CardBody className="space-y-5">
        {consents.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : consents.isError ? (
          <ErrorState error={consents.error} onRetry={() => void consents.refetch()} />
        ) : (
          (Object.keys(CONSENT_COPY) as ConsentKind[]).map((kind) => {
            const state = latest.get(kind);
            const required = REQUIRED.includes(kind);
            return (
              <div key={kind}>
                <Switch
                  checked={state?.granted ?? false}
                  disabled={give.isPending || (required && !!state?.granted)}
                  onChange={(granted) =>
                    give.mutate(
                      { kind, version: CONSENT_VERSION, granted },
                      {
                        onSuccess: () => toast.success(`${CONSENT_KIND_LABELS[kind]} ${granted ? 'granted' : 'withdrawn'}`),
                        onError: (err) => toast.error(errorMessage(err)),
                      },
                    )
                  }
                  label={CONSENT_KIND_LABELS[kind]}
                  description={
                    <>
                      {CONSENT_COPY[kind]}
                      {state ? <span className="block text-xs">Last updated {formatDateTime(state.at)}</span> : null}
                      {required ? <span className="block text-xs">Required to use the service. Contact support to close your account.</span> : null}
                    </>
                  }
                />
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Security: password + MFA
// ---------------------------------------------------------------------------------------------------------
const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Required'),
    new_password: z
      .string()
      .min(10, 'At least 10 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => v.new_password !== v.current_password, { path: ['new_password'], message: 'Choose a different password' });
type PasswordValues = z.infer<typeof passwordSchema>;

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
type CodeValues = z.infer<typeof codeSchema>;

export function SecuritySection() {
  const me = useMe();
  const qc = useQueryClient();
  const change = useChangePassword();
  const pwForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  });
  const codeForm = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const [setup, setSetup] = useState<MfaSetupOut | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const mfaEnabled = me.data?.mfa_enabled ?? false;

  const onPassword = pwForm.handleSubmit(async (v) => {
    try {
      await change.mutateAsync({ current_password: v.current_password, new_password: v.new_password });
      toast.success('Password changed. Other devices have been signed out.');
      pwForm.reset();
    } catch (err) {
      const f = fieldErrors(err);
      if (f.current_password) pwForm.setError('current_password', { message: f.current_password });
      else if (f.new_password) pwForm.setError('new_password', { message: f.new_password });
      else toast.error(errorMessage(err));
    }
  });

  async function startSetup() {
    setMfaBusy(true);
    try {
      setSetup(await authApi.mfaSetup());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setMfaBusy(false);
    }
  }

  const onCode = codeForm.handleSubmit(async ({ code }) => {
    setMfaBusy(true);
    try {
      if (mfaEnabled) await authApi.mfaDisable({ code });
      else await authApi.mfaEnable({ code });
      toast.success(mfaEnabled ? 'Two-step verification turned off' : 'Two-step verification is on');
      setSetup(null);
      setDisabling(false);
      codeForm.reset();
      await qc.invalidateQueries({ queryKey: meKey });
    } catch (err) {
      codeForm.setError('code', { message: errorMessage(err, 'Invalid code') });
    } finally {
      setMfaBusy(false);
    }
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Change password" />
        <CardBody>
          <form onSubmit={onPassword} noValidate className="grid max-w-xl gap-4">
            <Field label="Current password" htmlFor="sec-current" error={pwForm.formState.errors.current_password?.message}>
              <Input id="sec-current" type="password" autoComplete="current-password" {...pwForm.register('current_password')} />
            </Field>
            <Field label="New password" htmlFor="sec-new" error={pwForm.formState.errors.new_password?.message} hint="At least 10 characters with a letter and a number.">
              <Input id="sec-new" type="password" autoComplete="new-password" {...pwForm.register('new_password')} />
            </Field>
            <Field label="Confirm new password" htmlFor="sec-confirm" error={pwForm.formState.errors.confirm?.message}>
              <Input id="sec-confirm" type="password" autoComplete="new-password" {...pwForm.register('confirm')} />
            </Field>
            <div>
              <Button type="submit" loading={change.isPending} icon={<KeyRound className="h-4 w-4" aria-hidden />}>
                Update password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Two-step verification"
          description="Protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password...)."
          action={
            <span className={mfaEnabled ? 'text-sm font-semibold text-green-600' : 'text-sm text-slate-500'}>
              {mfaEnabled ? 'On' : 'Off'}
            </span>
          }
        />
        <CardBody className="space-y-4">
          {!mfaEnabled && !setup ? (
            <Button onClick={() => void startSetup()} loading={mfaBusy} icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
              Set up two-step verification
            </Button>
          ) : null}
          {setup ? (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
              <p>
                1. In your authenticator app, add an account using this key{' '}
                <a href={setup.otpauth_url} className="text-green-700 underline dark:text-green-400">
                  (or open it on this device)
                </a>
                :
              </p>
              <p className="break-all rounded-lg bg-white p-2 font-mono text-base tracking-widest dark:bg-slate-800">{setup.secret}</p>
              <p>2. Enter the 6-digit code it shows to finish.</p>
            </div>
          ) : null}
          {mfaEnabled && !disabling ? (
            <Button variant="outline" onClick={() => setDisabling(true)}>
              Turn off
            </Button>
          ) : null}
          {setup || disabling ? (
            <form onSubmit={onCode} noValidate className="flex max-w-sm items-end gap-2">
              <Field label="6-digit code" htmlFor="mfa-code" error={codeForm.formState.errors.code?.message} className="flex-1">
                <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...codeForm.register('code')} />
              </Field>
              <Button type="submit" loading={mfaBusy} variant={mfaEnabled ? 'danger' : 'primary'}>
                {mfaEnabled ? 'Turn off' : 'Verify'}
              </Button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
