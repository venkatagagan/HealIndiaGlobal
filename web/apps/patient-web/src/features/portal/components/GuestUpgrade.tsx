import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { errorMessage, fieldErrors } from '@hig/shared/api';
import { AgeAttestation } from '@hig/shared/auth';
import { useAppTranslation } from '../../../i18n';
import { useUpgradeGuest } from '../lib/session';
import { Button, Field, Input, Modal } from '../ui/primitives';

// Validation messages are catalog keys (namespace `patient`), translated when shown.
const schema = z
  .object({
    full_name: z.string().trim().min(2, 'guestUpgrade.errors.name').max(120),
    email: z.string().trim().email('guestUpgrade.errors.email').max(254),
    password: z
      .string()
      .min(10, 'guestUpgrade.errors.passwordLength')
      .max(128)
      .regex(/[A-Za-z]/, 'guestUpgrade.errors.passwordLetter')
      .regex(/\d/, 'guestUpgrade.errors.passwordNumber'),
    confirm: z.string(),
    /** CG-24: 18 or older (true) / under 18 with a parent or guardian's consent (false) */
    is_adult: z
      .boolean()
      .nullable()
      .refine((v) => v !== null, 'guestUpgrade.errors.age'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'guestUpgrade.errors.mismatch' });

/** zod messages are catalog keys; server messages (422) are shown as they are */
function useFieldError() {
  const { t } = useAppTranslation();
  return (message: string | undefined) => (message ? (message.startsWith('guestUpgrade.') ? t(message) : message) : undefined);
}

/** form state: `is_adult` starts unanswered (null); the schema only lets a boolean through */
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function GuestUpgradeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const fieldError = useFieldError();
  const upgrade = useUpgradeGuest();
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', confirm: '', is_adult: null },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await upgrade.mutateAsync({
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        is_adult: values.is_adult,
      });
      toast.success(t('guestUpgrade.success'));
      form.reset();
      onClose();
    } catch (err) {
      const fields = fieldErrors(err);
      let mapped = false;
      for (const key of ['full_name', 'email', 'password', 'is_adult'] as const) {
        if (fields[key]) {
          form.setError(key, { message: fields[key] });
          mapped = true;
        }
      }
      if (!mapped) toast.error(errorMessage(err));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('guestUpgrade.title')}
      description={t('guestUpgrade.description')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('guestUpgrade.notNow')}
          </Button>
          <Button type="submit" form="guest-upgrade-form" loading={upgrade.isPending}>
            {t('guestUpgrade.submit')}
          </Button>
        </>
      }
    >
      <form id="guest-upgrade-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('guestUpgrade.fullName')} htmlFor="gu-name" error={fieldError(errors.full_name?.message)} required>
          <Input id="gu-name" autoComplete="name" aria-invalid={!!errors.full_name} {...form.register('full_name')} />
        </Field>
        <Field label={t('guestUpgrade.email')} htmlFor="gu-email" error={fieldError(errors.email?.message)} required>
          <Input id="gu-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field
          label={t('guestUpgrade.password')}
          htmlFor="gu-password"
          error={fieldError(errors.password?.message)}
          hint={t('guestUpgrade.passwordHint')}
          required
        >
          <Input
            id="gu-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
        <Field label={t('guestUpgrade.confirm')} htmlFor="gu-confirm" error={fieldError(errors.confirm?.message)} required>
          <Input
            id="gu-confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...form.register('confirm')}
          />
        </Field>
        <Controller
          control={form.control}
          name="is_adult"
          render={({ field }) => (
            <AgeAttestation
              role="patient"
              name="gu-is-adult"
              value={field.value}
              onChange={field.onChange}
              error={fieldError(errors.is_adult?.message)}
            />
          )}
        />
      </form>
    </Modal>
  );
}

export function GuestBanner() {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-hero-gradient p-5 text-white shadow-glow-accent sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{t('guestUpgrade.bannerTitle')}</p>
        <p className="text-sm text-white/85">{t('guestUpgrade.bannerBody')}</p>
      </div>
      <Button
        variant="secondary"
        className="shrink-0 bg-white text-slate-900 hover:bg-white/90"
        icon={<UserPlus className="h-4 w-4" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {t('guestUpgrade.submit')}
      </Button>
      <GuestUpgradeDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
