import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { errorMessage, fieldErrors, GENDERS, GENDER_LABELS, type PatientProfileIn, type PatientProfileOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useUpdatePatientProfile } from '../../api/queries';
import { countryOptions, LANGUAGE_OPTIONS } from '../../lib/countries';
import { SUPPORTED_CURRENCIES, todayIsoDate } from '../../lib/shared';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '../../ui/primitives';

const phone = (t: TFunction) =>
  z
    .string()
    .trim()
    .max(32)
    .regex(/^$|^\+?[\d\s()-]{6,32}$/, t('profile.validation.phone'));
const optionalText = (max: number) => z.string().trim().max(max);
const isoDate = (t: TFunction) => z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, t('profile.validation.datePicker'));

function blankToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

/** Applies server-side 422 field errors to the form, falling back to a toast. */
function handleSaveError<T extends string>(
  err: unknown,
  setError: (name: T, e: { message: string }) => void,
  fields: readonly T[],
  fallback: string,
) {
  const errs = fieldErrors(err);
  let mapped = false;
  for (const f of fields) {
    if (errs[f]) {
      setError(f, { message: errs[f] });
      mapped = true;
    }
  }
  if (!mapped) toast.error(errorMessage(err, fallback));
}

// ---------------------------------------------------------------------------------------------------------
// Personal & medical
// ---------------------------------------------------------------------------------------------------------
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const personalSchema = (t: TFunction) =>
  z.object({
    first_name: z.string().trim().min(1, t('profile.validation.required')).max(80),
    last_name: z.string().trim().min(1, t('profile.validation.required')).max(80),
    date_of_birth: isoDate(t).refine((v) => !v || v <= todayIsoDate(), t('profile.validation.dobFuture')),
    gender: z.enum(['', ...GENDERS]),
    nationality: z.string(),
    country_of_residence: z.string(),
    phone: phone(t),
    whatsapp: phone(t),
    line1: optionalText(200),
    line2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postal_code: optionalText(20),
    blood_group: z.enum(['', ...BLOOD_GROUPS]),
    allergies: optionalText(2000),
    medical_history: optionalText(4000),
    insurance_provider: optionalText(120),
    insurance_policy_number: optionalText(64),
  });
type PersonalValues = z.infer<ReturnType<typeof personalSchema>>;
const PERSONAL_FIELDS: (keyof PersonalValues)[] = [
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'nationality',
  'country_of_residence',
  'phone',
  'whatsapp',
  'line1',
  'line2',
  'city',
  'state',
  'postal_code',
  'blood_group',
  'allergies',
  'medical_history',
  'insurance_provider',
  'insurance_policy_number',
];

export function PersonalForm({ profile }: { profile: PatientProfileOut }) {
  const { t } = useAppTranslation();
  const save = useUpdatePatientProfile();
  const schema = useMemo(() => personalSchema(t), [t]);
  const form = useForm<PersonalValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      date_of_birth: profile.date_of_birth ?? '',
      gender: profile.gender ?? '',
      nationality: profile.nationality ?? '',
      country_of_residence: profile.country_of_residence ?? '',
      phone: profile.phone ?? '',
      whatsapp: profile.whatsapp ?? '',
      line1: profile.address?.line1 ?? '',
      line2: profile.address?.line2 ?? '',
      city: profile.address?.city ?? '',
      state: profile.address?.state ?? '',
      postal_code: profile.address?.postal_code ?? '',
      blood_group: (profile.blood_group as PersonalValues['blood_group']) ?? '',
      allergies: profile.allergies ?? '',
      medical_history: profile.medical_history ?? '',
      insurance_provider: profile.insurance_provider ?? '',
      insurance_policy_number: '',
    },
  });
  const { errors, isDirty } = form.formState;
  const r = form.register;

  const onSubmit = form.handleSubmit(async (v) => {
    const body: PatientProfileIn = {
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      date_of_birth: v.date_of_birth || null,
      gender: v.gender || null,
      nationality: v.nationality || null,
      country_of_residence: v.country_of_residence || null,
      phone: blankToNull(v.phone),
      whatsapp: blankToNull(v.whatsapp),
      address: {
        line1: blankToNull(v.line1),
        line2: blankToNull(v.line2),
        city: blankToNull(v.city),
        state: blankToNull(v.state),
        postal_code: blankToNull(v.postal_code),
        country: v.country_of_residence || null,
      },
      blood_group: v.blood_group || null,
      allergies: blankToNull(v.allergies),
      medical_history: blankToNull(v.medical_history),
      insurance_provider: blankToNull(v.insurance_provider),
      ...(v.insurance_policy_number.trim() ? { insurance_policy_number: v.insurance_policy_number.trim() } : {}),
    };
    try {
      await save.mutateAsync(body);
      toast.success(t('profile.personal.saved'));
      form.reset({ ...v, insurance_policy_number: '' });
    } catch (err) {
      handleSaveError(err, form.setError, PERSONAL_FIELDS, t('profile.saveFailed'));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader title={t('profile.personal.title')} description={t('profile.personal.description')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.personal.firstName')} htmlFor="pf-first" error={errors.first_name?.message} required>
            <Input id="pf-first" autoComplete="given-name" {...r('first_name')} />
          </Field>
          <Field label={t('profile.personal.lastName')} htmlFor="pf-last" error={errors.last_name?.message} required>
            <Input id="pf-last" autoComplete="family-name" {...r('last_name')} />
          </Field>
          <Field label={t('profile.personal.dob')} htmlFor="pf-dob" error={errors.date_of_birth?.message}>
            <Input id="pf-dob" type="date" max={todayIsoDate()} {...r('date_of_birth')} />
          </Field>
          <Field label={t('profile.personal.gender')} htmlFor="pf-gender">
            <Select id="pf-gender" {...r('gender')}>
              <option value="">{t('profile.select')}</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.personal.nationality')} htmlFor="pf-nat">
            <Select id="pf-nat" {...r('nationality')}>
              <option value="">{t('profile.select')}</option>
              {countryOptions().map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.personal.residence')} htmlFor="pf-res">
            <Select id="pf-res" {...r('country_of_residence')}>
              <option value="">{t('profile.select')}</option>
              {countryOptions().map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.personal.phone')} htmlFor="pf-phone" error={errors.phone?.message}>
            <Input id="pf-phone" type="tel" autoComplete="tel" placeholder="+234 801 234 5678" dir="ltr" {...r('phone')} />
          </Field>
          <Field label={t('profile.personal.whatsapp')} htmlFor="pf-wa" error={errors.whatsapp?.message}>
            <Input id="pf-wa" type="tel" dir="ltr" {...r('whatsapp')} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('profile.address.title')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.address.line1')} htmlFor="pf-l1" className="sm:col-span-2">
            <Input id="pf-l1" autoComplete="address-line1" {...r('line1')} />
          </Field>
          <Field label={t('profile.address.line2')} htmlFor="pf-l2" className="sm:col-span-2">
            <Input id="pf-l2" autoComplete="address-line2" {...r('line2')} />
          </Field>
          <Field label={t('profile.address.city')} htmlFor="pf-city">
            <Input id="pf-city" autoComplete="address-level2" {...r('city')} />
          </Field>
          <Field label={t('profile.address.state')} htmlFor="pf-state">
            <Input id="pf-state" autoComplete="address-level1" {...r('state')} />
          </Field>
          <Field label={t('profile.address.postalCode')} htmlFor="pf-zip">
            <Input id="pf-zip" autoComplete="postal-code" {...r('postal_code')} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('profile.medical.title')} description={t('profile.medical.description')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.medical.bloodGroup')} htmlFor="pf-blood">
            <Select id="pf-blood" {...r('blood_group')}>
              <option value="">{t('profile.medical.unknown')}</option>
              {BLOOD_GROUPS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.medical.allergies')} htmlFor="pf-allergies">
            <Input id="pf-allergies" placeholder={t('profile.medical.allergiesPlaceholder')} {...r('allergies')} />
          </Field>
          <Field label={t('profile.medical.history')} htmlFor="pf-history" className="sm:col-span-2">
            <Textarea id="pf-history" rows={4} {...r('medical_history')} />
          </Field>
          <Field label={t('profile.medical.insuranceProvider')} htmlFor="pf-ins">
            <Input id="pf-ins" {...r('insurance_provider')} />
          </Field>
          <Field
            label={t('profile.medical.policyNumber')}
            htmlFor="pf-policy"
            hint={
              profile.insurance_policy_last4
                ? t('profile.medical.policySaved', { last4: profile.insurance_policy_last4 })
                : t('profile.medical.policyEncrypted')
            }
          >
            <Input id="pf-policy" autoComplete="off" {...r('insurance_policy_number')} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>
          {t('profile.personal.save')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------------------------------------
const passportSchema = (t: TFunction) =>
  z.object({
    passport_number: z
      .string()
      .trim()
      .regex(/^$|^[A-Za-z0-9]{6,20}$/, t('profile.validation.passport')),
    passport_expiry: isoDate(t),
  });
type PassportValues = z.infer<ReturnType<typeof passportSchema>>;

export function PassportForm({ profile }: { profile: PatientProfileOut }) {
  const { t } = useAppTranslation();
  const save = useUpdatePatientProfile();
  const schema = useMemo(() => passportSchema(t), [t]);
  const form = useForm<PassportValues>({
    resolver: zodResolver(schema),
    defaultValues: { passport_number: '', passport_expiry: profile.passport_expiry ?? '' },
  });
  const { errors, isDirty } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        ...(v.passport_number ? { passport_number: v.passport_number.toUpperCase() } : {}),
        passport_expiry: v.passport_expiry || null,
      });
      toast.success(t('profile.passport.saved'));
      form.reset({ passport_number: '', passport_expiry: v.passport_expiry });
    } catch (err) {
      handleSaveError(err, form.setError, ['passport_number', 'passport_expiry'] as const, t('profile.saveFailed'));
    }
  });
  return (
    <Card>
      <CardHeader title={t('profile.passport.title')} description={t('profile.passport.description')} />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('profile.passport.number')}
            htmlFor="pp-number"
            error={errors.passport_number?.message}
            hint={profile.passport_last4 ? t('profile.passport.onFile', { last4: profile.passport_last4 }) : t('profile.passport.notAdded')}
          >
            <Input
              id="pp-number"
              autoComplete="off"
              placeholder={profile.passport_last4 ? t('profile.passport.replacePlaceholder') : ''}
              {...form.register('passport_number')}
            />
          </Field>
          <Field label={t('profile.passport.expiry')} htmlFor="pp-expiry" error={errors.passport_expiry?.message}>
            <Input id="pp-expiry" type="date" min={todayIsoDate()} {...form.register('passport_expiry')} />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              {t('profile.passport.save')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Emergency contact
// ---------------------------------------------------------------------------------------------------------
const emergencySchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(2, t('profile.validation.required')).max(120),
    relationship: z.string().trim().min(2, t('profile.validation.required')).max(60),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{6,32}$/, t('profile.validation.phone')),
  });
type EmergencyValues = z.infer<ReturnType<typeof emergencySchema>>;

export function EmergencyForm({ profile }: { profile: PatientProfileOut }) {
  const { t } = useAppTranslation();
  const save = useUpdatePatientProfile();
  const schema = useMemo(() => emergencySchema(t), [t]);
  const form = useForm<EmergencyValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: profile.emergency_contact?.name ?? '',
      relationship: profile.emergency_contact?.relationship ?? '',
      phone: profile.emergency_contact?.phone ?? '',
    },
  });
  const { errors, isDirty } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ emergency_contact: v });
      toast.success(t('profile.emergency.saved'));
      form.reset(v);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Card>
      <CardHeader title={t('profile.emergency.title')} description={t('profile.emergency.description')} />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3">
          <Field label={t('profile.emergency.name')} htmlFor="ec-name" error={errors.name?.message} required>
            <Input id="ec-name" {...form.register('name')} />
          </Field>
          <Field label={t('profile.emergency.relationship')} htmlFor="ec-rel" error={errors.relationship?.message} required>
            <Input id="ec-rel" placeholder={t('profile.emergency.relationshipPlaceholder')} {...form.register('relationship')} />
          </Field>
          <Field label={t('profile.emergency.phone')} htmlFor="ec-phone" error={errors.phone?.message} required>
            <Input id="ec-phone" type="tel" dir="ltr" {...form.register('phone')} />
          </Field>
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              {t('profile.emergency.save')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------------------
const prefsSchema = z.object({ preferred_currency: z.string().length(3) });
type PrefsValues = z.infer<typeof prefsSchema>;

export function PreferencesForm({ profile }: { profile: PatientProfileOut }) {
  const { t } = useAppTranslation();
  const save = useUpdatePatientProfile();
  const form = useForm<PrefsValues>({
    resolver: zodResolver(prefsSchema),
    defaultValues: { preferred_currency: profile.preferred_currency || 'USD' },
  });
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v);
      toast.success(t('profile.preferences.saved'));
      form.reset(v);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Card>
      <CardHeader title={t('profile.preferences.title')} description={t('profile.preferences.description')} />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.preferences.currency')} htmlFor="pr-ccy">
            <Select id="pr-ccy" {...form.register('preferred_currency')}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">
            {t('profile.preferences.languagesNote', {
              examples: LANGUAGE_OPTIONS.slice(0, 3)
                .map((l) => l.label)
                .join(', '),
            })}
          </p>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
              {t('profile.preferences.save')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
