import { useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  catalogApi,
  errorMessage,
  hospitalPortalApi,
  type HospitalProcedureIn,
  type HospitalProcedureOut,
} from '@hig/shared/api';
import { Button, Checkbox, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { SUPPORTED_CURRENCIES, formatMoneyRange, minorToInput, splitLines, toMinor } from '../../lib/format';
import { qk, useHospitalDoctors, useHospitalProfile } from '../../lib/queries';

const amount = z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, 'Enter an amount');
const schema = z
  .object({
    procedure_id: z.string().min(1, 'Choose a procedure'),
    currency: z.string().length(3),
    price_min: amount,
    price_max: amount,
    hospital_stay_days: z.string().trim().regex(/^(\d{1,3})?$/, 'Whole days'),
    success_rate_pct: z
      .string()
      .trim()
      .refine((v) => !v || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100), 'Percentage 0–100'),
    inclusions: z.string().max(3000),
    exclusions: z.string().max(3000),
    is_active: z.boolean(),
  })
  .refine((v) => Number(v.price_max) >= Number(v.price_min), { path: ['price_max'], message: 'Must be ≥ minimum price' });
type FormValues = z.infer<typeof schema>;

/** Create / edit a hospital procedure offering (CRUD /hospital-portal/procedures). */
export function OfferingFormModal({
  offering,
  existingProcedureIds,
  onClose,
}: {
  offering: HospitalProcedureOut | null;
  existingProcedureIds: string[];
  onClose: () => void;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const profile = useHospitalProfile();
  const doctors = useHospitalDoctors();
  const catalog = useQuery({ queryKey: qk.procedures(), queryFn: () => catalogApi.listProcedures(), staleTime: 10 * 60_000 });
  const [filter, setFilter] = useState('');
  const [doctorIds, setDoctorIds] = useState<string[]>(offering?.doctor_ids ?? []);
  const currency0 = offering?.currency ?? 'INR';

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      procedure_id: offering?.procedure.id ?? '',
      currency: currency0,
      price_min: minorToInput(offering?.price_min_minor, currency0),
      price_max: minorToInput(offering?.price_max_minor, currency0),
      hospital_stay_days: offering?.hospital_stay_days != null ? String(offering.hospital_stay_days) : '',
      success_rate_pct: offering?.success_rate_pct != null ? String(offering.success_rate_pct) : '',
      inclusions: (offering?.inclusions ?? []).join('\n'),
      exclusions: (offering?.exclusions ?? []).join('\n'),
      is_active: offering?.is_active ?? true,
    },
  });
  const selectedProcedureId = useWatch({ control, name: 'procedure_id' });

  const procedureOptions = useMemo(() => {
    const specialtyNames = new Set(profile.data?.specialties ?? []);
    const q = filter.trim().toLowerCase();
    return (catalog.data ?? [])
      .filter((p) => p.id === offering?.procedure.id || !existingProcedureIds.includes(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.specialty.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = specialtyNames.has(a.specialty.name) ? 0 : 1;
        const sb = specialtyNames.has(b.specialty.name) ? 0 : 1;
        return sa - sb || a.specialty.name.localeCompare(b.specialty.name) || a.name.localeCompare(b.name);
      })
      .map((p) => ({ value: p.id, label: `${p.name} - ${p.specialty.name}` }));
  }, [catalog.data, filter, existingProcedureIds, offering, profile.data]);
  const selectedProcedure = catalog.data?.find((p) => p.id === selectedProcedureId);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: HospitalProcedureIn = {
        procedure_id: v.procedure_id,
        doctor_ids: doctorIds,
        price_min_minor: toMinor(v.price_min, v.currency) ?? 0,
        price_max_minor: toMinor(v.price_max, v.currency) ?? 0,
        currency: v.currency,
        hospital_stay_days: v.hospital_stay_days ? Number(v.hospital_stay_days) : null,
        success_rate_pct: v.success_rate_pct ? Number(v.success_rate_pct) : null,
        inclusions: splitLines(v.inclusions),
        exclusions: splitLines(v.exclusions),
        is_active: v.is_active,
      };
      return offering ? hospitalPortalApi.updateProcedure(offering.id, body) : hospitalPortalApi.createProcedure(body);
    },
    onSuccess: () => {
      toast.success(offering ? 'Procedure updated' : 'Procedure added');
      void queryClient.invalidateQueries({ queryKey: qk.offerings });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (v: FormValues) => {
    if (toMinor(v.price_min, v.currency) === null) return setError('price_min', { message: 'Too many decimals' });
    if (toMinor(v.price_max, v.currency) === null) return setError('price_max', { message: 'Too many decimals' });
    save.mutate(v);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={offering ? `Edit ${offering.procedure.name}` : 'Add procedure'}
      description="Price ranges are indicative; patients receive an exact itemized quote."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        {!offering && (
          <FormField label="Find procedure" htmlFor={`${ids}-filter`} className="sm:col-span-2">
            <Input
              id={`${ids}-filter`}
              type="search"
              placeholder="Type to filter, e.g. knee"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </FormField>
        )}
        <FormField
          label="Procedure"
          htmlFor={`${ids}-proc`}
          required
          error={errors.procedure_id?.message}
          className="sm:col-span-2"
          hint={
            selectedProcedure
              ? `Typical India price ${formatMoneyRange(selectedProcedure.india_price_min_minor, selectedProcedure.india_price_max_minor, selectedProcedure.currency)}${selectedProcedure.hospital_stay_days ? ` · ${selectedProcedure.hospital_stay_days} days stay` : ''}`
              : undefined
          }
        >
          <Select
            id={`${ids}-proc`}
            disabled={!!offering}
            placeholder={catalog.isPending ? 'Loading catalog…' : `Choose from ${procedureOptions.length} procedures`}
            options={procedureOptions}
            {...register('procedure_id')}
            aria-invalid={!!errors.procedure_id}
          />
        </FormField>
        <FormField label="Currency" htmlFor={`${ids}-ccy`}>
          <Select id={`${ids}-ccy`} options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))} {...register('currency')} />
        </FormField>
        <div />
        <FormField label="Price from" htmlFor={`${ids}-min`} required error={errors.price_min?.message}>
          <Input id={`${ids}-min`} inputMode="decimal" {...register('price_min')} aria-invalid={!!errors.price_min} />
        </FormField>
        <FormField label="Price up to" htmlFor={`${ids}-max`} required error={errors.price_max?.message}>
          <Input id={`${ids}-max`} inputMode="decimal" {...register('price_max')} aria-invalid={!!errors.price_max} />
        </FormField>
        <FormField label="Hospital stay (days)" htmlFor={`${ids}-stay`} error={errors.hospital_stay_days?.message}>
          <Input id={`${ids}-stay`} inputMode="numeric" {...register('hospital_stay_days')} />
        </FormField>
        <FormField label="Success rate (%)" htmlFor={`${ids}-sr`} error={errors.success_rate_pct?.message}>
          <Input id={`${ids}-sr`} inputMode="decimal" {...register('success_rate_pct')} />
        </FormField>
        <FormField label="Inclusions" htmlFor={`${ids}-inc`} hint="One per line">
          <Textarea id={`${ids}-inc`} rows={4} placeholder={'Surgeon fees\nImplant\n5 nights private room'} {...register('inclusions')} />
        </FormField>
        <FormField label="Exclusions" htmlFor={`${ids}-exc`} hint="One per line">
          <Textarea id={`${ids}-exc`} rows={4} placeholder={'Blood products\nExtended ICU stay'} {...register('exclusions')} />
        </FormField>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Lead doctors</legend>
          {doctors.data?.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {doctors.data.map((d) => (
                <Checkbox
                  key={d.id}
                  label={d.full_name}
                  description={d.specialty.name}
                  checked={doctorIds.includes(d.id)}
                  onChange={() =>
                    setDoctorIds((prev) => (prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]))
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Add doctors first to link them to this procedure.</p>
          )}
        </fieldset>
        <Checkbox label="Active (offered to patients)" {...register('is_active')} />
      </form>
    </Modal>
  );
}
