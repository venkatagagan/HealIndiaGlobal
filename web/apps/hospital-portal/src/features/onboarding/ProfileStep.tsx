import { useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  errorMessage,
  fieldErrors,
  hospitalPortalApi,
  type HospitalProfileIn,
  type HospitalProfileOut,
} from '@hig/shared/api';
import { Button, FormField, Input, Textarea } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { qk } from '../../lib/queries';

type T = ReturnType<typeof useAppTranslation>['t'];
const thisYear = new Date().getFullYear();

function makeSchema(t: T) {
  const optionalUrl = z.union([z.literal(''), z.url({ message: t('onboarding.profile.errors.url') }).max(500)]);
  return z.object({
    name: z.string().trim().min(2, t('onboarding.profile.errors.name')).max(200),
    legal_name: z.string().trim().max(200),
    description: z.string().trim().max(5000),
    address: z.string().trim().min(5, t('onboarding.profile.errors.address')).max(500),
    city: z.string().trim().min(2, t('onboarding.profile.errors.city')).max(100),
    state: z.string().trim().min(2, t('onboarding.profile.errors.state')).max(100),
    pincode: z.string().trim().regex(/^(\d{6})?$/, t('onboarding.profile.errors.pincode')),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, t('onboarding.profile.errors.phone')),
    email: z.union([z.literal(''), z.email({ message: t('onboarding.profile.errors.email') })]),
    website: optionalUrl,
    logo_url: optionalUrl,
    cover_image_url: optionalUrl,
    established_year: z
      .string()
      .trim()
      .refine((v) => !v || (/^\d{4}$/.test(v) && Number(v) >= 1800 && Number(v) <= thisYear), t('onboarding.profile.errors.year')),
    bed_count: z.string().trim().regex(/^(\d{1,5})?$/, t('onboarding.profile.errors.wholeNumber')),
    gstin: z
      .string()
      .trim()
      .regex(/^([0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z])?$/, t('onboarding.profile.errors.gstin')),
    pan: z
      .string()
      .trim()
      .regex(/^([A-Za-z]{5}[0-9]{4}[A-Za-z])?$/, t('onboarding.profile.errors.pan')),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const blankToNull = (v: string): string | null => (v.trim() ? v.trim() : null);

/** Step 1 - profile & contact details (PUT /hospital-portal/profile). PAN is write-only. */
export function ProfileStep({ profile, onSaved, readOnly }: { profile: HospitalProfileOut; onSaved?: () => void; readOnly?: boolean }) {
  const { t } = useAppTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
  const ids = useId();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: profile.name,
      legal_name: profile.legal_name ?? '',
      description: profile.description ?? '',
      address: profile.address ?? '',
      city: profile.city ?? '',
      state: profile.state ?? '',
      pincode: profile.pincode ?? '',
      phone: profile.phone ?? '',
      email: profile.email ?? '',
      website: profile.website ?? '',
      logo_url: profile.logo_url ?? '',
      cover_image_url: profile.cover_image_url ?? '',
      established_year: profile.established_year ? String(profile.established_year) : '',
      bed_count: profile.bed_count != null ? String(profile.bed_count) : '',
      gstin: profile.gstin ?? '',
      pan: '',
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: HospitalProfileIn = {
        name: v.name,
        legal_name: blankToNull(v.legal_name),
        description: blankToNull(v.description),
        address: blankToNull(v.address),
        city: v.city,
        state: blankToNull(v.state),
        pincode: blankToNull(v.pincode),
        phone: blankToNull(v.phone),
        email: blankToNull(v.email),
        website: blankToNull(v.website),
        logo_url: blankToNull(v.logo_url),
        cover_image_url: blankToNull(v.cover_image_url),
        established_year: v.established_year ? Number(v.established_year) : null,
        bed_count: v.bed_count ? Number(v.bed_count) : null,
        gstin: v.gstin ? v.gstin.toUpperCase() : null,
      };
      if (v.pan) body.pan = v.pan.toUpperCase();
      return hospitalPortalApi.updateProfile(body);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.profile, updated);
      toast.success(t('onboarding.profile.saved'));
      onSaved?.();
    },
    onError: (error) => {
      for (const [key, message] of Object.entries(fieldErrors(error))) {
        if (key in schema.shape) setError(key as keyof FormValues, { message });
      }
      toast.error(errorMessage(error));
    },
  });

  const field = (name: keyof FormValues) => ({
    id: `${ids}-${name}`,
    disabled: readOnly,
    'aria-invalid': !!errors[name],
    ...register(name),
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={handleSubmit((v) => {
        if (!isDirty && onSaved) {
          onSaved();
          return;
        }
        save.mutate(v);
      })}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('onboarding.profile.hospitalSection')}</legend>
        <FormField label={t('onboarding.profile.name')} htmlFor={`${ids}-name`} required error={errors.name?.message}>
          <Input {...field('name')} />
        </FormField>
        <FormField label={t('onboarding.profile.legalName')} htmlFor={`${ids}-legal_name`} error={errors.legal_name?.message}>
          <Input {...field('legal_name')} />
        </FormField>
        <FormField
          label={t('onboarding.profile.about')}
          htmlFor={`${ids}-description`}
          error={errors.description?.message}
          className="sm:col-span-2"
          hint={t('onboarding.profile.aboutHint')}
        >
          <Textarea rows={4} {...field('description')} />
        </FormField>
        <FormField label={t('onboarding.profile.established')} htmlFor={`${ids}-established_year`} error={errors.established_year?.message}>
          <Input inputMode="numeric" {...field('established_year')} />
        </FormField>
        <FormField label={t('onboarding.profile.beds')} htmlFor={`${ids}-bed_count`} error={errors.bed_count?.message}>
          <Input inputMode="numeric" {...field('bed_count')} />
        </FormField>
        <FormField label={t('onboarding.profile.logoUrl')} htmlFor={`${ids}-logo_url`} error={errors.logo_url?.message}>
          <Input type="url" placeholder="https://" {...field('logo_url')} />
        </FormField>
        <FormField label={t('onboarding.profile.coverUrl')} htmlFor={`${ids}-cover_image_url`} error={errors.cover_image_url?.message}>
          <Input type="url" placeholder="https://" {...field('cover_image_url')} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('onboarding.profile.addressSection')}</legend>
        <FormField
          label={t('onboarding.profile.address')}
          htmlFor={`${ids}-address`}
          required
          error={errors.address?.message}
          className="sm:col-span-2"
        >
          <Input autoComplete="street-address" {...field('address')} />
        </FormField>
        <FormField label={t('onboarding.profile.city')} htmlFor={`${ids}-city`} required error={errors.city?.message}>
          <Input autoComplete="address-level2" {...field('city')} />
        </FormField>
        <FormField label={t('onboarding.profile.state')} htmlFor={`${ids}-state`} required error={errors.state?.message}>
          <Input autoComplete="address-level1" {...field('state')} />
        </FormField>
        <FormField label={t('onboarding.profile.pincode')} htmlFor={`${ids}-pincode`} error={errors.pincode?.message}>
          <Input inputMode="numeric" autoComplete="postal-code" {...field('pincode')} />
        </FormField>
        <FormField label={t('onboarding.profile.phone')} htmlFor={`${ids}-phone`} required error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" placeholder="+91 …" {...field('phone')} />
        </FormField>
        <FormField label={t('onboarding.profile.email')} htmlFor={`${ids}-email`} error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...field('email')} />
        </FormField>
        <FormField label={t('onboarding.profile.website')} htmlFor={`${ids}-website`} error={errors.website?.message}>
          <Input type="url" placeholder="https://" {...field('website')} />
        </FormField>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('onboarding.profile.taxSection')}</legend>
        <FormField label={t('onboarding.profile.gstin')} htmlFor={`${ids}-gstin`} error={errors.gstin?.message}>
          <Input className="uppercase" {...field('gstin')} />
        </FormField>
        <FormField
          label={t('onboarding.profile.pan')}
          htmlFor={`${ids}-pan`}
          error={errors.pan?.message}
          hint={profile.pan_last4 ? t('onboarding.profile.panOnFile', { last4: profile.pan_last4 }) : t('onboarding.profile.panEncrypted')}
        >
          <Input className="uppercase" autoComplete="off" {...field('pan')} />
        </FormField>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            {onSaved ? t('onboarding.saveAndContinue') : t('onboarding.profile.saveProfile')}
          </Button>
        </div>
      )}
    </form>
  );
}
