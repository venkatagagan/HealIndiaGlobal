import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AGENT_CONSENT_METHODS,
  AGENT_CONSENT_METHOD_LABELS,
  GENDERS,
  GENDER_LABELS,
  agentPortalApi,
  errorMessage,
  fieldErrors,
  type AgentConsentMethod,
  type AgentPatientOut,
  type ConsentKind,
  type Gender,
} from '@hig/shared/api';
import { Button, Checkbox, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { COUNTRY_OPTIONS } from '../../lib/constants';
import { SUPPORTED_CURRENCIES } from '../../lib/shared';

const optionalText = (max: number) => z.string().trim().max(max);

const schema = z.object({
  first_name: z.string().trim().min(1, 'Required').max(80),
  last_name: z.string().trim().min(1, 'Required').max(80),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email'),
  phone: optionalText(32).refine((v) => v === '' || /^\+?[0-9 ()-]{6,}$/.test(v), 'Enter a valid phone number'),
  whatsapp: optionalText(32).refine((v) => v === '' || /^\+?[0-9 ()-]{6,}$/.test(v), 'Enter a valid phone number'),
  nationality: z.string().length(2, 'Select nationality'),
  country_of_residence: z.string(),
  date_of_birth: z
    .string()
    .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) <= new Date()), 'Enter a valid past date'),
  gender: z.string(),
  preferred_currency: z.string(),
  blood_group: optionalText(5),
  allergies: optionalText(2000),
  medical_history: optionalText(5000),
  passport_number: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[A-Za-z0-9]{4,20}$/.test(v.replace(/\s+/g, '')), 'Passport number must be 4–20 letters or digits'),
  passport_expiry: z.string(),
  ec_name: optionalText(200),
  ec_relationship: optionalText(60),
  ec_phone: optionalText(32),
  // consent attestation (create only; POST /agent-portal/patients requires consent_attested: true)
  consent_attested: z.boolean(),
  consent_share: z.boolean(),
  consent_method: z.enum(AGENT_CONSENT_METHODS),
  consent_note: optionalText(500),
});
type FormValues = z.infer<typeof schema>;

function toDefaults(p?: AgentPatientOut | null): FormValues {
  return {
    first_name: p?.first_name ?? '',
    last_name: p?.last_name ?? '',
    email: p?.email ?? '',
    phone: p?.phone ?? '',
    whatsapp: p?.whatsapp ?? '',
    nationality: p?.nationality ?? '',
    country_of_residence: p?.country_of_residence ?? '',
    date_of_birth: p?.date_of_birth ?? '',
    gender: p?.gender ?? '',
    preferred_currency: p?.preferred_currency ?? 'USD',
    blood_group: p?.blood_group ?? '',
    allergies: p?.allergies ?? '',
    medical_history: p?.medical_history ?? '',
    passport_number: '',
    passport_expiry: p?.passport_expiry ?? '',
    ec_name: p?.emergency_contact?.name ?? '',
    ec_relationship: p?.emergency_contact?.relationship ?? '',
    ec_phone: p?.emergency_contact?.phone ?? '',
    consent_attested: false,
    consent_share: true,
    consent_method: 'in_person',
    consent_note: '',
  };
}

/** Create (no `patient`) or edit a patient managed by this agent. */
export function PatientFormDialog({
  open,
  onClose,
  patient,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patient?: AgentPatientOut | null;
  onSaved?: (patient: AgentPatientOut) => void;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(patient);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: toDefaults(patient) });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const gender = values.gender ? (values.gender as Gender) : undefined;
      if (patient) {
        return agentPortalApi.updatePatient(patient.id, {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email || null,
          phone: values.phone || null,
          whatsapp: values.whatsapp || null,
          nationality: values.nationality,
          country_of_residence: values.country_of_residence || null,
          date_of_birth: values.date_of_birth || null,
          gender: gender ?? null,
          preferred_currency: values.preferred_currency || 'USD',
          blood_group: values.blood_group || null,
          allergies: values.allergies || null,
          medical_history: values.medical_history || null,
          passport_expiry: values.passport_expiry || null,
          ...(values.passport_number ? { passport_number: values.passport_number.replace(/\s+/g, '').toUpperCase() } : {}),
          ...(values.ec_name && values.ec_phone
            ? { emergency_contact: { name: values.ec_name, relationship: values.ec_relationship, phone: values.ec_phone } }
            : {}),
        });
      }
      const consentKinds: ConsentKind[] = ['terms', 'privacy', ...(values.consent_share ? (['share_with_hospitals'] as const) : [])];
      const created = await agentPortalApi.createPatient({
        consent_attested: true,
        consent_kinds: consentKinds,
        consent_method: values.consent_method as AgentConsentMethod,
        ...(values.consent_note ? { consent_note: values.consent_note } : {}),
        first_name: values.first_name,
        last_name: values.last_name,
        nationality: values.nationality,
        ...(values.email ? { email: values.email } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.date_of_birth ? { date_of_birth: values.date_of_birth } : {}),
        ...(gender ? { gender } : {}),
        ...(values.medical_history ? { medical_history: values.medical_history } : {}),
      });
      // fields not accepted by the create endpoint are saved with a follow-up PATCH
      const extra = {
        ...(values.whatsapp ? { whatsapp: values.whatsapp } : {}),
        ...(values.country_of_residence ? { country_of_residence: values.country_of_residence } : {}),
        ...(values.preferred_currency && values.preferred_currency !== created.preferred_currency
          ? { preferred_currency: values.preferred_currency }
          : {}),
        ...(values.blood_group ? { blood_group: values.blood_group } : {}),
        ...(values.allergies ? { allergies: values.allergies } : {}),
      };
      if (Object.keys(extra).length > 0) {
        try {
          return await agentPortalApi.updatePatient(created.id, extra);
        } catch {
          toast.warning('Patient created, but some optional details could not be saved. Edit the profile to retry.');
        }
      }
      return created;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['agent-patients'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success(editing ? 'Patient updated' : 'Patient added');
      reset(toDefaults(saved));
      onClose();
      onSaved?.(saved);
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      let mapped = false;
      for (const [key, message] of Object.entries(fields)) {
        if (key in schema.shape) {
          setError(key as keyof FormValues, { message });
          mapped = true;
        }
      }
      if (!mapped) toast.error(errorMessage(error));
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (!editing && !values.consent_attested) {
      setError('consent_attested', { message: 'Confirm that the patient has given consent before adding them.' });
      return;
    }
    mutation.mutate(values);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit patient' : 'Add a patient'}
      description={
        editing
          ? 'Changes are visible to hospitals on this patient’s cases.'
          : 'Creates a patient account managed by your agency. If you add an email, the patient receives an invite to access their own portal.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="patient-form" loading={mutation.isPending}>
            {editing ? 'Save changes' : 'Add patient'}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="First name" htmlFor="pf-first" error={errors.first_name?.message} required>
          <Input id="pf-first" aria-invalid={!!errors.first_name} {...register('first_name')} />
        </FormField>
        <FormField label="Last name" htmlFor="pf-last" error={errors.last_name?.message} required>
          <Input id="pf-last" aria-invalid={!!errors.last_name} {...register('last_name')} />
        </FormField>
        <FormField label="Nationality" htmlFor="pf-nat" error={errors.nationality?.message} required>
          <Select id="pf-nat" aria-invalid={!!errors.nationality} {...register('nationality')}>
            <option value="">Select…</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Country of residence" htmlFor="pf-res">
          <Select id="pf-res" {...register('country_of_residence')}>
            <option value="">Same as nationality</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Date of birth" htmlFor="pf-dob" error={errors.date_of_birth?.message}>
          <Input id="pf-dob" type="date" max={new Date().toISOString().slice(0, 10)} {...register('date_of_birth')} />
        </FormField>
        <FormField label="Gender" htmlFor="pf-gender">
          <Select id="pf-gender" {...register('gender')}>
            <option value="">Not specified</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Email" htmlFor="pf-email" error={errors.email?.message} hint="Optional – sends the patient an invite">
          <Input id="pf-email" type="email" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField label="Phone" htmlFor="pf-phone" error={errors.phone?.message}>
          <Input id="pf-phone" type="tel" placeholder="+971 …" {...register('phone')} />
        </FormField>
        <FormField label="WhatsApp" htmlFor="pf-wa" error={errors.whatsapp?.message}>
          <Input id="pf-wa" type="tel" {...register('whatsapp')} />
        </FormField>
        <FormField label="Preferred currency" htmlFor="pf-ccy" hint="Used for quotes and payments">
          <Select id="pf-ccy" {...register('preferred_currency')}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Blood group" htmlFor="pf-blood" error={errors.blood_group?.message}>
          <Select id="pf-blood" {...register('blood_group')}>
            <option value="">Unknown</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Allergies" htmlFor="pf-allergies" error={errors.allergies?.message}>
          <Input id="pf-allergies" placeholder="e.g. Penicillin" {...register('allergies')} />
        </FormField>
        {editing && (
          <>
            <FormField
              label="Passport number"
              htmlFor="pf-passport"
              error={errors.passport_number?.message}
              hint={patient?.passport_last4 ? `On file: •••• ${patient.passport_last4}. Leave blank to keep.` : 'Stored encrypted'}
            >
              <Input id="pf-passport" autoComplete="off" {...register('passport_number')} />
            </FormField>
            <FormField label="Passport expiry" htmlFor="pf-pexp">
              <Input id="pf-pexp" type="date" {...register('passport_expiry')} />
            </FormField>
            <FormField label="Emergency contact name" htmlFor="pf-ecn">
              <Input id="pf-ecn" {...register('ec_name')} />
            </FormField>
            <FormField label="Relationship" htmlFor="pf-ecr">
              <Input id="pf-ecr" {...register('ec_relationship')} />
            </FormField>
            <FormField label="Emergency contact phone" htmlFor="pf-ecp">
              <Input id="pf-ecp" type="tel" {...register('ec_phone')} />
            </FormField>
          </>
        )}
        <FormField label="Medical history" htmlFor="pf-history" className="sm:col-span-2" error={errors.medical_history?.message}>
          <Textarea id="pf-history" rows={4} placeholder="Known conditions, past surgeries, current medication…" {...register('medical_history')} />
        </FormField>
        {!editing && (
          <fieldset className="space-y-3 rounded-lg border border-border p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold">Patient consent</legend>
            <Checkbox
              {...register('consent_attested')}
              aria-invalid={!!errors.consent_attested}
              label="I confirm the patient has agreed to the Terms of Service and Privacy Policy"
              description="Your attestation is recorded with your name and time. The patient confirms it on first sign-in."
            />
            <Checkbox {...register('consent_share')} label="The patient also agreed to share their records with the hospitals I contact for them" />
            {errors.consent_attested?.message && (
              <p role="alert" className="text-sm text-danger-ink">
                {errors.consent_attested.message}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="How was consent obtained?" htmlFor="pf-cmethod" required>
                <Select id="pf-cmethod" {...register('consent_method')}>
                  {AGENT_CONSENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {AGENT_CONSENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Note (optional)" htmlFor="pf-cnote" error={errors.consent_note?.message}>
                <Input id="pf-cnote" maxLength={500} placeholder="e.g. Signed form on file" {...register('consent_note')} />
              </FormField>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
