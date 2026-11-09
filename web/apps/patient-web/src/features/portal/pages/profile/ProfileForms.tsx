import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { errorMessage, fieldErrors, GENDERS, GENDER_LABELS, type PatientProfileIn, type PatientProfileOut } from '@hig/shared/api';
import { useUpdatePatientProfile } from '../../api/queries';
import { COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from '../../lib/countries';
import { SUPPORTED_CURRENCIES, todayIsoDate } from '../../lib/shared';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '../../ui/primitives';

const phone = z
  .string()
  .trim()
  .max(32)
  .regex(/^$|^\+?[\d\s()-]{6,32}$/, 'Enter a valid phone number with country code');
const optionalText = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Use the date picker');

function blankToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

/** Applies server-side 422 field errors to the form, falling back to a toast. */
function handleSaveError<T extends string>(err: unknown, setError: (name: T, e: { message: string }) => void, fields: readonly T[]) {
  const errs = fieldErrors(err);
  let mapped = false;
  for (const f of fields) {
    if (errs[f]) {
      setError(f, { message: errs[f] });
      mapped = true;
    }
  }
  if (!mapped) toast.error(errorMessage(err, 'Could not save your changes.'));
}

// ---------------------------------------------------------------------------------------------------------
// Personal & medical
// ---------------------------------------------------------------------------------------------------------
const personalSchema = z.object({
  first_name: z.string().trim().min(1, 'Required').max(80),
  last_name: z.string().trim().min(1, 'Required').max(80),
  date_of_birth: isoDate.refine((v) => !v || v <= todayIsoDate(), 'Date of birth cannot be in the future'),
  gender: z.enum(['', ...GENDERS]),
  nationality: z.string(),
  country_of_residence: z.string(),
  phone,
  whatsapp: phone,
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postal_code: optionalText(20),
  blood_group: z.enum(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  allergies: optionalText(2000),
  medical_history: optionalText(4000),
  insurance_provider: optionalText(120),
  insurance_policy_number: optionalText(64),
});
type PersonalValues = z.infer<typeof personalSchema>;
const PERSONAL_FIELDS = Object.keys(personalSchema.shape) as (keyof PersonalValues)[];

export function PersonalForm({ profile }: { profile: PatientProfileOut }) {
  const save = useUpdatePatientProfile();
  const form = useForm<PersonalValues>({
    resolver: zodResolver(personalSchema),
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
      toast.success('Profile saved');
      form.reset({ ...v, insurance_policy_number: '' });
    } catch (err) {
      handleSaveError(err, form.setError, PERSONAL_FIELDS);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Personal information" description="As shown in your passport." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="pf-first" error={errors.first_name?.message} required>
            <Input id="pf-first" autoComplete="given-name" {...r('first_name')} />
          </Field>
          <Field label="Last name" htmlFor="pf-last" error={errors.last_name?.message} required>
            <Input id="pf-last" autoComplete="family-name" {...r('last_name')} />
          </Field>
          <Field label="Date of birth" htmlFor="pf-dob" error={errors.date_of_birth?.message}>
            <Input id="pf-dob" type="date" max={todayIsoDate()} {...r('date_of_birth')} />
          </Field>
          <Field label="Gender" htmlFor="pf-gender">
            <Select id="pf-gender" {...r('gender')}>
              <option value="">Select</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nationality" htmlFor="pf-nat">
            <Select id="pf-nat" {...r('nationality')}>
              <option value="">Select</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Country of residence" htmlFor="pf-res">
            <Select id="pf-res" {...r('country_of_residence')}>
              <option value="">Select</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone" htmlFor="pf-phone" error={errors.phone?.message}>
            <Input id="pf-phone" type="tel" autoComplete="tel" placeholder="+234 801 234 5678" {...r('phone')} />
          </Field>
          <Field label="WhatsApp" htmlFor="pf-wa" error={errors.whatsapp?.message}>
            <Input id="pf-wa" type="tel" {...r('whatsapp')} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Home address" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor="pf-l1" className="sm:col-span-2">
            <Input id="pf-l1" autoComplete="address-line1" {...r('line1')} />
          </Field>
          <Field label="Address line 2" htmlFor="pf-l2" className="sm:col-span-2">
            <Input id="pf-l2" autoComplete="address-line2" {...r('line2')} />
          </Field>
          <Field label="City" htmlFor="pf-city">
            <Input id="pf-city" autoComplete="address-level2" {...r('city')} />
          </Field>
          <Field label="State / region" htmlFor="pf-state">
            <Input id="pf-state" autoComplete="address-level1" {...r('state')} />
          </Field>
          <Field label="Postal code" htmlFor="pf-zip">
            <Input id="pf-zip" autoComplete="postal-code" {...r('postal_code')} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Medical & insurance" description="Shared only with hospitals handling your cases." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Blood group" htmlFor="pf-blood">
            <Select id="pf-blood" {...r('blood_group')}>
              <option value="">Unknown</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Allergies" htmlFor="pf-allergies">
            <Input id="pf-allergies" placeholder="e.g. penicillin" {...r('allergies')} />
          </Field>
          <Field label="Medical history" htmlFor="pf-history" className="sm:col-span-2">
            <Textarea id="pf-history" rows={4} {...r('medical_history')} />
          </Field>
          <Field label="Insurance provider" htmlFor="pf-ins">
            <Input id="pf-ins" {...r('insurance_provider')} />
          </Field>
          <Field
            label="Policy number"
            htmlFor="pf-policy"
            hint={profile.insurance_policy_last4 ? `Saved: •••• ${profile.insurance_policy_last4}. Enter a new number to replace it.` : 'Stored encrypted.'}
          >
            <Input id="pf-policy" autoComplete="off" {...r('insurance_policy_number')} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Passport
// ---------------------------------------------------------------------------------------------------------
const passportSchema = z.object({
  passport_number: z
    .string()
    .trim()
    .regex(/^$|^[A-Za-z0-9]{6,20}$/, 'Letters and numbers only (6-20 characters)'),
  passport_expiry: isoDate,
});
type PassportValues = z.infer<typeof passportSchema>;

export function PassportForm({ profile }: { profile: PatientProfileOut }) {
  const save = useUpdatePatientProfile();
  const form = useForm<PassportValues>({
    resolver: zodResolver(passportSchema),
    defaultValues: { passport_number: '', passport_expiry: profile.passport_expiry ?? '' },
  });
  const { errors, isDirty } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        ...(v.passport_number ? { passport_number: v.passport_number.toUpperCase() } : {}),
        passport_expiry: v.passport_expiry || null,
      });
      toast.success('Passport details saved');
      form.reset({ passport_number: '', passport_expiry: v.passport_expiry });
    } catch (err) {
      handleSaveError(err, form.setError, ['passport_number', 'passport_expiry'] as const);
    }
  });
  return (
    <Card>
      <CardHeader title="Passport" description="Needed for your visa invitation letter. Stored encrypted; only the last 4 characters are shown." />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Passport number"
            htmlFor="pp-number"
            error={errors.passport_number?.message}
            hint={profile.passport_last4 ? `On file: •••• ${profile.passport_last4}` : 'Not added yet'}
          >
            <Input id="pp-number" autoComplete="off" placeholder={profile.passport_last4 ? 'Enter to replace' : ''} {...form.register('passport_number')} />
          </Field>
          <Field label="Expiry date" htmlFor="pp-expiry" error={errors.passport_expiry?.message}>
            <Input id="pp-expiry" type="date" min={todayIsoDate()} {...form.register('passport_expiry')} />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save passport
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
const emergencySchema = z.object({
  name: z.string().trim().min(2, 'Required').max(120),
  relationship: z.string().trim().min(2, 'Required').max(60),
  phone: z.string().trim().regex(/^\+?[\d\s()-]{6,32}$/, 'Enter a valid phone number with country code'),
});
type EmergencyValues = z.infer<typeof emergencySchema>;

export function EmergencyForm({ profile }: { profile: PatientProfileOut }) {
  const save = useUpdatePatientProfile();
  const form = useForm<EmergencyValues>({
    resolver: zodResolver(emergencySchema),
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
      toast.success('Emergency contact saved');
      form.reset(v);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Card>
      <CardHeader title="Emergency contact" description="Someone we can call if we cannot reach you during your trip." />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name" htmlFor="ec-name" error={errors.name?.message} required>
            <Input id="ec-name" {...form.register('name')} />
          </Field>
          <Field label="Relationship" htmlFor="ec-rel" error={errors.relationship?.message} required>
            <Input id="ec-rel" placeholder="e.g. spouse" {...form.register('relationship')} />
          </Field>
          <Field label="Phone" htmlFor="ec-phone" error={errors.phone?.message} required>
            <Input id="ec-phone" type="tel" {...form.register('phone')} />
          </Field>
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save contact
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
  const save = useUpdatePatientProfile();
  const form = useForm<PrefsValues>({
    resolver: zodResolver(prefsSchema),
    defaultValues: { preferred_currency: profile.preferred_currency || 'USD' },
  });
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v);
      toast.success('Preferences saved');
      form.reset(v);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Card>
      <CardHeader title="Preferences" description="Prices and payments are shown in your preferred currency." />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred currency" htmlFor="pr-ccy">
            <Select id="pr-ccy" {...form.register('preferred_currency')}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Doctor language preferences ({LANGUAGE_OPTIONS.slice(0, 3).map((l) => l.label).join(', ')}, ...) are set per screening.
          </p>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
              Save preferences
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
