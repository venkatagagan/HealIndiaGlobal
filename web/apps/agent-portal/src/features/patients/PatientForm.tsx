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
import { countryOptions } from '../../lib/constants';
import { SUPPORTED_CURRENCIES, i18n } from '../../lib/shared';

import { useAppTranslation } from '../../i18n';

const optionalText = (max: number) => z.string().trim().max(max);
/** Validation message resolved when shown (follows the UI language). */
const msg = (key: string) => ({ error: () => i18n.t(`agent:patientForm.errors.${key}`) });

const schema = z.object({
  first_name: z.string().trim().min(1, msg('required')).max(80),
  last_name: z.string().trim().min(1, msg('required')).max(80),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, msg('email')),
  phone: optionalText(32).refine((v) => v === '' || /^\+?[0-9 ()-]{6,}$/.test(v), msg('phone')),
  whatsapp: optionalText(32).refine((v) => v === '' || /^\+?[0-9 ()-]{6,}$/.test(v), msg('phone')),
  nationality: z.string().length(2, msg('nationality')),
  country_of_residence: z.string(),
  date_of_birth: z
    .string()
    .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) <= new Date()), msg('pastDate')),
  gender: z.string(),
  preferred_currency: z.string(),
  blood_group: optionalText(5),
  allergies: optionalText(2000),
  medical_history: optionalText(5000),
  passport_number: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[A-Za-z0-9]{4,20}$/.test(v.replace(/\s+/g, '')), msg('passport')),
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
  const { t } = useAppTranslation();
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
          toast.warning(t('patientForm.partialSave'));
        }
      }
      return created;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['agent-patients'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success(editing ? t('patientForm.updated') : t('patientForm.added'));
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
      setError('consent_attested', { message: t('patientForm.consentRequired') });
      return;
    }
    mutation.mutate(values);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? t('patientForm.editTitle') : t('patientForm.addTitle')}
      description={
        editing
          ? t('patientForm.editDescription')
          : t('patientForm.addDescription')
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            {t('patientForm.cancel')}
          </Button>
          <Button type="submit" form="patient-form" loading={mutation.isPending}>
            {editing ? t('patientForm.saveChanges') : t('patientForm.submitAdd')}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('patientForm.firstName')} htmlFor="pf-first" error={errors.first_name?.message} required>
          <Input id="pf-first" aria-invalid={!!errors.first_name} {...register('first_name')} />
        </FormField>
        <FormField label={t('patientForm.lastName')} htmlFor="pf-last" error={errors.last_name?.message} required>
          <Input id="pf-last" aria-invalid={!!errors.last_name} {...register('last_name')} />
        </FormField>
        <FormField label={t('patientForm.nationality')} htmlFor="pf-nat" error={errors.nationality?.message} required>
          <Select id="pf-nat" aria-invalid={!!errors.nationality} {...register('nationality')}>
            <option value="">{t('patientForm.select')}</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('patientForm.residence')} htmlFor="pf-res">
          <Select id="pf-res" {...register('country_of_residence')}>
            <option value="">{t('patientForm.sameAsNationality')}</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('patientForm.dob')} htmlFor="pf-dob" error={errors.date_of_birth?.message}>
          <Input id="pf-dob" type="date" max={new Date().toISOString().slice(0, 10)} {...register('date_of_birth')} />
        </FormField>
        <FormField label={t('patientForm.gender')} htmlFor="pf-gender">
          <Select id="pf-gender" {...register('gender')}>
            <option value="">{t('patientForm.notSpecified')}</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('patientForm.email')} htmlFor="pf-email" error={errors.email?.message} hint={t('patientForm.emailHint')}>
          <Input id="pf-email" type="email" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField label={t('patientForm.phone')} htmlFor="pf-phone" error={errors.phone?.message}>
          <Input id="pf-phone" type="tel" placeholder="+971 …" {...register('phone')} />
        </FormField>
        <FormField label={t('patientForm.whatsapp')} htmlFor="pf-wa" error={errors.whatsapp?.message}>
          <Input id="pf-wa" type="tel" {...register('whatsapp')} />
        </FormField>
        <FormField label={t('patientForm.currency')} htmlFor="pf-ccy" hint={t('patientForm.currencyHint')}>
          <Select id="pf-ccy" {...register('preferred_currency')}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('patientForm.bloodGroup')} htmlFor="pf-blood" error={errors.blood_group?.message}>
          <Select id="pf-blood" {...register('blood_group')}>
            <option value="">{t('patientForm.unknown')}</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('patientForm.allergies')} htmlFor="pf-allergies" error={errors.allergies?.message}>
          <Input id="pf-allergies" placeholder={t('patientForm.allergiesPlaceholder')} {...register('allergies')} />
        </FormField>
        {editing && (
          <>
            <FormField
              label={t('patientForm.passportNumber')}
              htmlFor="pf-passport"
              error={errors.passport_number?.message}
              hint={patient?.passport_last4 ? t('patientForm.passportOnFile', { last4: patient.passport_last4 }) : t('patientForm.storedEncrypted')}
            >
              <Input id="pf-passport" autoComplete="off" {...register('passport_number')} />
            </FormField>
            <FormField label={t('patientForm.passportExpiry')} htmlFor="pf-pexp">
              <Input id="pf-pexp" type="date" {...register('passport_expiry')} />
            </FormField>
            <FormField label={t('patientForm.ecName')} htmlFor="pf-ecn">
              <Input id="pf-ecn" {...register('ec_name')} />
            </FormField>
            <FormField label={t('patientForm.ecRelationship')} htmlFor="pf-ecr">
              <Input id="pf-ecr" {...register('ec_relationship')} />
            </FormField>
            <FormField label={t('patientForm.ecPhone')} htmlFor="pf-ecp">
              <Input id="pf-ecp" type="tel" {...register('ec_phone')} />
            </FormField>
          </>
        )}
        <FormField label={t('patientForm.medicalHistory')} htmlFor="pf-history" className="sm:col-span-2" error={errors.medical_history?.message}>
          <Textarea id="pf-history" rows={4} placeholder={t('patientForm.medicalHistoryPlaceholder')} {...register('medical_history')} />
        </FormField>
        {!editing && (
          <fieldset className="space-y-3 rounded-lg border border-border p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold">{t('patientForm.consentLegend')}</legend>
            <Checkbox
              {...register('consent_attested')}
              aria-invalid={!!errors.consent_attested}
              label={t('patientForm.consentAttest')}
              description={t('patientForm.consentAttestHint')}
            />
            <Checkbox {...register('consent_share')} label={t('patientForm.consentShare')} />
            {errors.consent_attested?.message && (
              <p role="alert" className="text-sm text-danger-ink">
                {errors.consent_attested.message}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('patientForm.consentMethod')} htmlFor="pf-cmethod" required>
                <Select id="pf-cmethod" {...register('consent_method')}>
                  {AGENT_CONSENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {AGENT_CONSENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('patientForm.consentNote')} htmlFor="pf-cnote" error={errors.consent_note?.message}>
                <Input id="pf-cnote" maxLength={500} placeholder={t('patientForm.consentNotePlaceholder')} {...register('consent_note')} />
              </FormField>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
