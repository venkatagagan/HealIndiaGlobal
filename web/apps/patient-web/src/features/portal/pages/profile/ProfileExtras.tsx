import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import { authApi, CONSENT_KIND_LABELS, errorMessage, fieldErrors, type CompanionOut, type ConsentKind, type MfaSetupOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useChangePassword, useCompanions, useConsents, useDeleteCompanion, useGiveConsent, useSaveCompanion } from '../../api/queries';
import { countryName, countryOptions } from '../../lib/countries';
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
const companionSchema = (t: TFunction) =>
  z.object({
    full_name: z.string().trim().min(2, t('profile.validation.required')).max(120),
    relationship: z.string().trim().min(2, t('profile.validation.required')).max(60),
    nationality: z.string(),
    date_of_birth: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !v || v <= todayIsoDate(), t('profile.validation.notFuture')),
    passport_number: z
      .string()
      .trim()
      .regex(/^$|^[A-Za-z0-9]{6,20}$/, t('profile.validation.passport')),
  });
type CompanionValues = z.infer<ReturnType<typeof companionSchema>>;
const COMPANION_FIELDS: readonly string[] = ['full_name', 'relationship', 'nationality', 'date_of_birth', 'passport_number'];

function CompanionDialog({ open, companion, onClose }: { open: boolean; companion: CompanionOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const save = useSaveCompanion();
  const schema = useMemo(() => companionSchema(t), [t]);
  const form = useForm<CompanionValues>({
    resolver: zodResolver(schema),
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
      toast.success(companion ? t('profile.companions.updated') : t('profile.companions.added'));
      onClose();
    } catch (err) {
      const f = fieldErrors(err);
      if (Object.keys(f).length) {
        for (const [k, msg] of Object.entries(f)) {
          if (COMPANION_FIELDS.includes(k)) form.setError(k as keyof CompanionValues, { message: msg });
        }
      } else toast.error(errorMessage(err));
    }
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={companion ? t('profile.companions.editTitle') : t('profile.companions.addTitle')}
      description={t('profile.companions.dialogDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('profile.cancel')}
          </Button>
          <Button type="submit" form="companion-form" loading={save.isPending}>
            {t('profile.save')}
          </Button>
        </>
      }
    >
      <form id="companion-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t('profile.companions.fullName')} htmlFor="cp-name" error={errors.full_name?.message} required className="sm:col-span-2">
          <Input id="cp-name" {...form.register('full_name')} />
        </Field>
        <Field label={t('profile.companions.relationship')} htmlFor="cp-rel" error={errors.relationship?.message} required>
          <Input id="cp-rel" placeholder={t('profile.companions.relationshipPlaceholder')} {...form.register('relationship')} />
        </Field>
        <Field label={t('profile.companions.nationality')} htmlFor="cp-nat">
          <Select id="cp-nat" {...form.register('nationality')}>
            <option value="">{t('profile.select')}</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('profile.companions.dob')} htmlFor="cp-dob" error={errors.date_of_birth?.message}>
          <Input id="cp-dob" type="date" max={todayIsoDate()} {...form.register('date_of_birth')} />
        </Field>
        <Field
          label={t('profile.companions.passport')}
          htmlFor="cp-pp"
          error={errors.passport_number?.message}
          hint={
            companion?.passport_last4
              ? t('profile.passport.onFile', { last4: companion.passport_last4 })
              : t('profile.companions.storedEncrypted')
          }
        >
          <Input id="cp-pp" autoComplete="off" {...form.register('passport_number')} />
        </Field>
      </form>
    </Modal>
  );
}

export function CompanionsSection() {
  const { t } = useAppTranslation();
  const companions = useCompanions();
  const remove = useDeleteCompanion();
  const [editing, setEditing] = useState<CompanionOut | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<CompanionOut | null>(null);

  return (
    <Card>
      <CardHeader
        title={t('profile.companions.title')}
        description={t('profile.companions.description')}
        action={
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t('profile.companions.add')}
          </Button>
        }
      />
      <CardBody>
        {companions.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : companions.isError ? (
          <ErrorState error={companions.error} onRetry={() => void companions.refetch()} />
        ) : companions.data.length === 0 ? (
          <EmptyState icon={<UserRound className="h-8 w-8" aria-hidden />} title={t('profile.companions.empty')} />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {companions.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {c.full_name} <span className="text-sm font-normal text-slate-500">· {c.relationship}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.nationality ? countryName(c.nationality) : t('profile.companions.noNationality')}
                    {c.date_of_birth ? ` · ${t('profile.companions.born', { date: formatDate(c.date_of_birth) })}` : ''}
                    {c.passport_last4 ? ` · ${t('profile.companions.passportLast4', { last4: c.passport_last4 })}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('profile.companions.editName', { name: c.full_name })}
                    icon={<Pencil className="h-4 w-4" aria-hidden />}
                    onClick={() => {
                      setEditing(c);
                      setOpen(true);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('profile.companions.removeName', { name: c.full_name })}
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
        title={t('profile.companions.removeTitle')}
        tone="danger"
        confirmLabel={t('profile.companions.remove')}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('profile.companions.removed'));
              setDeleting(null);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      >
        {deleting ? t('profile.companions.removeBody', { name: deleting.full_name }) : null}
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------------------------------------
export const CONSENT_VERSION = '2026-10';
/** Consent kinds in display order; the explanation is `profile.consents.copy.<kind>`. */
const CONSENT_KINDS: ConsentKind[] = ['terms', 'privacy', 'ai_processing', 'share_with_hospitals', 'marketing'];
const REQUIRED: ConsentKind[] = ['terms', 'privacy'];

export function ConsentsSection() {
  const { t } = useAppTranslation();
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
      <CardHeader title={t('profile.consents.title')} description={t('profile.consents.description')} />
      <CardBody className="space-y-5">
        {consents.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : consents.isError ? (
          <ErrorState error={consents.error} onRetry={() => void consents.refetch()} />
        ) : (
          CONSENT_KINDS.map((kind) => {
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
                        onSuccess: () =>
                          toast.success(
                            granted
                              ? t('profile.consents.granted', { label: CONSENT_KIND_LABELS[kind] })
                              : t('profile.consents.withdrawn', { label: CONSENT_KIND_LABELS[kind] }),
                          ),
                        onError: (err) => toast.error(errorMessage(err)),
                      },
                    )
                  }
                  label={CONSENT_KIND_LABELS[kind]}
                  description={
                    <>
                      {t(`profile.consents.copy.${kind}`)}
                      {state ? (
                        <span className="block text-xs">{t('profile.consents.lastUpdated', { date: formatDateTime(state.at) })}</span>
                      ) : null}
                      {required ? <span className="block text-xs">{t('profile.consents.required')}</span> : null}
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
const passwordSchema = (t: TFunction) =>
  z
    .object({
      current_password: z.string().min(1, t('profile.validation.required')),
      new_password: z
        .string()
        .min(10, t('profile.validation.passwordLength'))
        .max(128)
        .regex(/[A-Za-z]/, t('profile.validation.passwordLetter'))
        .regex(/\d/, t('profile.validation.passwordNumber')),
      confirm: z.string(),
    })
    .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: t('profile.validation.passwordMismatch') })
    .refine((v) => v.new_password !== v.current_password, { path: ['new_password'], message: t('profile.validation.passwordSame') });
type PasswordValues = z.infer<ReturnType<typeof passwordSchema>>;

const codeSchema = (t: TFunction) => z.object({ code: z.string().trim().regex(/^\d{6}$/, t('profile.validation.code')) });
type CodeValues = z.infer<ReturnType<typeof codeSchema>>;

export function SecuritySection() {
  const { t } = useAppTranslation();
  const me = useMe();
  const qc = useQueryClient();
  const change = useChangePassword();
  const pwSchema = useMemo(() => passwordSchema(t), [t]);
  const otpSchema = useMemo(() => codeSchema(t), [t]);
  const pwForm = useForm<PasswordValues>({
    resolver: zodResolver(pwSchema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  });
  const codeForm = useForm<CodeValues>({ resolver: zodResolver(otpSchema), defaultValues: { code: '' } });
  const [setup, setSetup] = useState<MfaSetupOut | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const mfaEnabled = me.data?.mfa_enabled ?? false;

  const onPassword = pwForm.handleSubmit(async (v) => {
    try {
      await change.mutateAsync({ current_password: v.current_password, new_password: v.new_password });
      toast.success(t('profile.security.passwordChanged'));
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
      toast.success(mfaEnabled ? t('profile.security.mfaTurnedOff') : t('profile.security.mfaTurnedOn'));
      setSetup(null);
      setDisabling(false);
      codeForm.reset();
      await qc.invalidateQueries({ queryKey: meKey });
    } catch (err) {
      codeForm.setError('code', { message: errorMessage(err, t('profile.security.invalidCode')) });
    } finally {
      setMfaBusy(false);
    }
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t('profile.security.changePassword')} />
        <CardBody>
          <form onSubmit={onPassword} noValidate className="grid max-w-xl gap-4">
            <Field label={t('profile.security.currentPassword')} htmlFor="sec-current" error={pwForm.formState.errors.current_password?.message}>
              <Input id="sec-current" type="password" autoComplete="current-password" {...pwForm.register('current_password')} />
            </Field>
            <Field
              label={t('profile.security.newPassword')}
              htmlFor="sec-new"
              error={pwForm.formState.errors.new_password?.message}
              hint={t('profile.security.passwordHint')}
            >
              <Input id="sec-new" type="password" autoComplete="new-password" {...pwForm.register('new_password')} />
            </Field>
            <Field label={t('profile.security.confirmPassword')} htmlFor="sec-confirm" error={pwForm.formState.errors.confirm?.message}>
              <Input id="sec-confirm" type="password" autoComplete="new-password" {...pwForm.register('confirm')} />
            </Field>
            <div>
              <Button type="submit" loading={change.isPending} icon={<KeyRound className="h-4 w-4" aria-hidden />}>
                {t('profile.security.updatePassword')}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('profile.security.mfaTitle')}
          description={t('profile.security.mfaDescription')}
          action={
            <span className={mfaEnabled ? 'text-sm font-semibold text-green-600' : 'text-sm text-slate-500'}>
              {mfaEnabled ? t('profile.security.on') : t('profile.security.off')}
            </span>
          }
        />
        <CardBody className="space-y-4">
          {!mfaEnabled && !setup ? (
            <Button onClick={() => void startSetup()} loading={mfaBusy} icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
              {t('profile.security.setUp')}
            </Button>
          ) : null}
          {setup ? (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">
              <p>
                <Trans
                  t={t}
                  i18nKey="profile.security.step1"
                  components={{ 0: <a href={setup.otpauth_url} className="text-green-700 underline dark:text-green-400" /> }}
                />
              </p>
              <p className="break-all rounded-lg bg-white p-2 font-mono text-base tracking-widest dark:bg-slate-800" dir="ltr">
                {setup.secret}
              </p>
              <p>{t('profile.security.step2')}</p>
            </div>
          ) : null}
          {mfaEnabled && !disabling ? (
            <Button variant="outline" onClick={() => setDisabling(true)}>
              {t('profile.security.turnOff')}
            </Button>
          ) : null}
          {setup || disabling ? (
            <form onSubmit={onCode} noValidate className="flex max-w-sm items-end gap-2">
              <Field label={t('profile.security.code')} htmlFor="mfa-code" error={codeForm.formState.errors.code?.message} className="flex-1">
                <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...codeForm.register('code')} />
              </Field>
              <Button type="submit" loading={mfaBusy} variant={mfaEnabled ? 'danger' : 'primary'}>
                {mfaEnabled ? t('profile.security.turnOff') : t('profile.security.verify')}
              </Button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
