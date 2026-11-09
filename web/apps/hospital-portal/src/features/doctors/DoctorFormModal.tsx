import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GENDERS,
  GENDER_LABELS,
  errorMessage,
  hospitalPortalApi,
  type DoctorAdminOut,
  type DoctorIn,
  type Gender,
} from '@hig/shared/api';
import { Button, Checkbox, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { SUPPORTED_CURRENCIES, minorToInput, splitList, toMinor } from '../../lib/format';
import { qk, useMedicalCouncils, useSpecialties } from '../../lib/queries';

/** Keeps the doctor's saved value selectable even when it is no longer in the list (inactive specialty,
 *  retired council code), so editing never silently clears it. */
function withCurrent(options: { value: string; label: string }[], current: { value: string; label: string } | null) {
  return current && !options.some((o) => o.value === current.value) ? [...options, current] : options;
}

const schema = z.object({
  full_name: z.string().trim().min(3, 'Enter the doctor’s full name').max(150),
  gender: z.union([z.literal(''), z.enum(GENDERS)]),
  specialty_id: z.string().min(1, 'Choose a specialty'),
  sub_specialties: z.string().max(500),
  qualifications: z.string().max(500),
  experience_years: z.string().trim().regex(/^(\d{1,2})?$/, 'Years (0–99)'),
  languages: z.string().max(300),
  bio: z.string().trim().max(5000),
  success_rate_pct: z
    .string()
    .trim()
    .refine((v) => !v || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100), 'Percentage 0–100'),
  consultation_fee: z.string().trim().regex(/^(\d{1,9}(\.\d{1,3})?)?$/, 'Enter an amount'),
  currency: z.string().length(3),
  photo_url: z.union([z.literal(''), z.url({ message: 'Enter a full https:// URL' }).max(500)]),
  teleconsult_available: z.boolean(),
  is_active: z.boolean(),
  registration_number: z
    .string()
    .trim()
    .max(40)
    .refine((v) => !v || /^[A-Za-z0-9][A-Za-z0-9/. -]{2,39}$/.test(v), 'Letters, digits, / - . and spaces'),
  registration_council: z.string(),
}).refine((v) => !!v.registration_number === !!v.registration_council, {
  message: 'Enter both the registration number and the council',
  path: ['registration_council'],
});
type FormValues = z.infer<typeof schema>;

export function DoctorFormModal({ doctor, onClose }: { doctor: DoctorAdminOut | null; onClose: () => void }) {
  const ids = useId();
  const queryClient = useQueryClient();
  const specialties = useSpecialties();
  const councils = useMedicalCouncils();
  const currency = doctor?.currency ?? 'INR';
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: doctor?.full_name ?? '',
      gender: doctor?.gender ?? '',
      specialty_id: doctor?.specialty.id ?? '',
      sub_specialties: (doctor?.sub_specialties ?? []).join(', '),
      qualifications: (doctor?.qualifications ?? []).join(', '),
      experience_years: doctor?.experience_years != null ? String(doctor.experience_years) : '',
      languages: (doctor?.languages ?? ['English']).join(', '),
      bio: doctor?.bio ?? '',
      success_rate_pct: doctor?.success_rate_pct != null ? String(doctor.success_rate_pct) : '',
      consultation_fee: minorToInput(doctor?.consultation_fee_minor, currency),
      currency,
      photo_url: doctor?.photo_url ?? '',
      teleconsult_available: doctor?.teleconsult_available ?? false,
      is_active: doctor?.is_active ?? true,
      registration_number: doctor?.registration_number ?? '',
      registration_council: doctor?.registration_council ?? '',
    },
  });

  // The specialty / council <select>s get their options asynchronously: when RHF applied the saved value the
  // matching <option> did not exist yet, so the browser showed the placeholder ("Choose…"). Re-apply the
  // current form values once the options are rendered.
  const specialtyOptions = specialties.data;
  const councilOptions = councils.data;
  useEffect(() => {
    if (specialtyOptions) setValue('specialty_id', getValues('specialty_id'));
  }, [specialtyOptions, setValue, getValues]);
  useEffect(() => {
    if (councilOptions) setValue('registration_council', getValues('registration_council'));
  }, [councilOptions, setValue, getValues]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: DoctorIn = {
        full_name: v.full_name,
        gender: (v.gender || null) as Gender | null,
        specialty_id: v.specialty_id,
        sub_specialties: splitList(v.sub_specialties),
        qualifications: splitList(v.qualifications),
        experience_years: v.experience_years ? Number(v.experience_years) : null,
        languages: splitList(v.languages),
        bio: v.bio || null,
        success_rate_pct: v.success_rate_pct ? Number(v.success_rate_pct) : null,
        consultation_fee_minor: v.consultation_fee ? toMinor(v.consultation_fee, v.currency) : null,
        currency: v.currency,
        photo_url: v.photo_url || null,
        teleconsult_available: v.teleconsult_available,
        is_active: v.is_active,
        registration_number: v.registration_number || null,
        registration_council: v.registration_council || null,
      };
      return doctor ? hospitalPortalApi.updateDoctor(doctor.id, body) : hospitalPortalApi.createDoctor(body);
    },
    onSuccess: () => {
      toast.success(doctor ? 'Doctor updated' : 'Doctor added');
      void queryClient.invalidateQueries({ queryKey: qk.doctors });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (v: FormValues) => {
    if (v.consultation_fee && toMinor(v.consultation_fee, v.currency) === null) {
      setError('consultation_fee', { message: 'Too many decimals for this currency' });
      return;
    }
    save.mutate(v);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={doctor ? `Edit ${doctor.full_name}` : 'Add doctor'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={save.isPending}>
            {doctor ? 'Save changes' : 'Add doctor'}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <FormField label="Full name" htmlFor={`${ids}-name`} required error={errors.full_name?.message}>
          <Input id={`${ids}-name`} placeholder="Dr. …" {...register('full_name')} aria-invalid={!!errors.full_name} />
        </FormField>
        <FormField label="Gender" htmlFor={`${ids}-gender`}>
          <Select
            id={`${ids}-gender`}
            placeholder="Not specified"
            options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))}
            {...register('gender')}
          />
        </FormField>
        <FormField label="Specialty" htmlFor={`${ids}-spec`} required error={errors.specialty_id?.message}>
          <Select
            id={`${ids}-spec`}
            placeholder={specialties.isPending ? 'Loading…' : 'Choose specialty'}
            options={withCurrent(
              (specialties.data ?? []).map((s) => ({ value: s.id, label: s.name })),
              specialties.data && doctor?.specialty ? { value: doctor.specialty.id, label: doctor.specialty.name } : null,
            )}
            {...register('specialty_id')}
            aria-invalid={!!errors.specialty_id}
          />
        </FormField>
        <FormField label="Experience (years)" htmlFor={`${ids}-exp`} error={errors.experience_years?.message}>
          <Input id={`${ids}-exp`} inputMode="numeric" {...register('experience_years')} />
        </FormField>
        <FormField
          label="Medical registration no."
          htmlFor={`${ids}-regno`}
          hint={
            doctor?.registration_verified
              ? 'Verified by Heal India Global — changing it requires re-verification'
              : 'As on the NMC / State Medical Council register'
          }
          error={errors.registration_number?.message}
        >
          <Input
            id={`${ids}-regno`}
            placeholder="e.g. MMC/2009/04512"
            {...register('registration_number')}
            aria-invalid={!!errors.registration_number}
          />
        </FormField>
        <FormField label="Registering council" htmlFor={`${ids}-council`} error={errors.registration_council?.message}>
          <Select
            id={`${ids}-council`}
            placeholder={councils.isPending ? 'Loading…' : 'Choose council'}
            options={withCurrent(
              (councils.data ?? []).map((c) => ({ value: c.code, label: c.name })),
              councils.data && doctor?.registration_council
                ? { value: doctor.registration_council, label: doctor.registration_council_name ?? doctor.registration_council }
                : null,
            )}
            {...register('registration_council')}
            aria-invalid={!!errors.registration_council}
          />
        </FormField>
        <FormField label="Sub-specialties" htmlFor={`${ids}-sub`} hint="Comma separated" className="sm:col-span-2">
          <Input id={`${ids}-sub`} placeholder="Interventional cardiology, Electrophysiology" {...register('sub_specialties')} />
        </FormField>
        <FormField label="Qualifications" htmlFor={`${ids}-qual`} hint="Comma separated" className="sm:col-span-2">
          <Input id={`${ids}-qual`} placeholder="MBBS, MS (Ortho), FRCS" {...register('qualifications')} />
        </FormField>
        <FormField label="Languages" htmlFor={`${ids}-lang`} hint="Comma separated" className="sm:col-span-2">
          <Input id={`${ids}-lang`} {...register('languages')} />
        </FormField>
        <FormField label="Success rate (%)" htmlFor={`${ids}-sr`} error={errors.success_rate_pct?.message}>
          <Input id={`${ids}-sr`} inputMode="decimal" {...register('success_rate_pct')} />
        </FormField>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <FormField label="Consultation fee" htmlFor={`${ids}-fee`} error={errors.consultation_fee?.message}>
            <Input id={`${ids}-fee`} inputMode="decimal" {...register('consultation_fee')} />
          </FormField>
          <FormField label="Currency" htmlFor={`${ids}-ccy`}>
            <Select id={`${ids}-ccy`} options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))} {...register('currency')} />
          </FormField>
        </div>
        <FormField label="Photo URL" htmlFor={`${ids}-photo`} error={errors.photo_url?.message} className="sm:col-span-2">
          <Input id={`${ids}-photo`} type="url" placeholder="https://" {...register('photo_url')} />
        </FormField>
        <FormField label="Biography" htmlFor={`${ids}-bio`} className="sm:col-span-2">
          <Textarea id={`${ids}-bio`} rows={4} {...register('bio')} />
        </FormField>
        <Checkbox label="Offers teleconsultation" {...register('teleconsult_available')} />
        <Checkbox label="Active (visible to patients)" {...register('is_active')} />
      </form>
    </Modal>
  );
}
