import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { errorMessage, fieldErrors } from '@hig/shared/api';
import { AgeAttestation } from '@hig/shared/auth';
import { useUpgradeGuest } from '../lib/session';
import { Button, Field, Input, Modal } from '../ui/primitives';

const schema = z
  .object({
    full_name: z.string().trim().min(2, 'Please enter your full name').max(120),
    email: z.string().trim().email('Enter a valid email address').max(254),
    password: z
      .string()
      .min(10, 'At least 10 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirm: z.string(),
    /** CG-24: 18 or older (true) / under 18 with a parent or guardian's consent (false) */
    is_adult: z
      .boolean()
      .nullable()
      .refine((v) => v !== null, 'Please confirm your age'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

/** form state: `is_adult` starts unanswered (null); the schema only lets a boolean through */
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function GuestUpgradeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      toast.success('Your account is ready. Everything you did as a guest has been kept.');
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
      title="Create your account"
      description="Keep your screenings, cases and documents, and sign in from any device."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Not now
          </Button>
          <Button type="submit" form="guest-upgrade-form" loading={upgrade.isPending}>
            Create account
          </Button>
        </>
      }
    >
      <form id="guest-upgrade-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="gu-name" error={errors.full_name?.message} required>
          <Input id="gu-name" autoComplete="name" aria-invalid={!!errors.full_name} {...form.register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="gu-email" error={errors.email?.message} required>
          <Input id="gu-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field
          label="Password"
          htmlFor="gu-password"
          error={errors.password?.message}
          hint="At least 10 characters with a letter and a number."
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
        <Field label="Confirm password" htmlFor="gu-confirm" error={errors.confirm?.message} required>
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
              error={errors.is_adult?.message}
            />
          )}
        />
      </form>
    </Modal>
  );
}

export function GuestBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-hero-gradient p-5 text-white shadow-glow-accent sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">You are browsing as a guest</p>
        <p className="text-sm text-white/85">
          Create a free account to save your progress, receive quotes from hospitals and book treatment.
        </p>
      </div>
      <Button
        variant="secondary"
        className="shrink-0 bg-white text-slate-900 hover:bg-white/90"
        icon={<UserPlus className="h-4 w-4" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        Create account
      </Button>
      <GuestUpgradeDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
