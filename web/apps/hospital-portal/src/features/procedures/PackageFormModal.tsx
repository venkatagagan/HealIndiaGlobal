import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  PACKAGE_TIERS,
  PACKAGE_TIER_LABELS,
  errorMessage,
  hospitalPortalApi,
  type HospitalProcedureOut,
  type PackageIn,
  type PackageOut,
} from '@hig/shared/api';
import { Button, Checkbox, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { SUPPORTED_CURRENCIES, minorToInput, toMinor } from '../../lib/format';
import { qk } from '../../lib/queries';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter a package name').max(150),
    tier: z.enum(PACKAGE_TIERS),
    currency: z.string().length(3),
    price: z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, 'Enter a price'),
    original_price: z.string().trim().regex(/^(\d{1,12}(\.\d{1,3})?)?$/, 'Enter an amount'),
    description: z.string().trim().max(2000),
    accommodation_nights: z.string().trim().regex(/^(\d{1,3})?$/, 'Whole nights'),
    followup_teleconsults: z.string().trim().regex(/^(\d{1,2})?$/, 'Number of calls'),
    airport_pickup: z.boolean(),
    translator: z.boolean(),
    meals: z.boolean(),
    local_transport: z.boolean(),
    is_active: z.boolean(),
  })
  .refine((v) => !v.original_price || Number(v.original_price) > Number(v.price), {
    path: ['original_price'],
    message: 'Original price must be higher than the package price',
  });
type FormValues = z.infer<typeof schema>;

const TIER_HINTS: Record<string, string> = {
  medical_only: 'Treatment only',
  medical_stay: 'Treatment + accommodation',
  all_inclusive: 'Treatment, stay, transfers, translator and meals',
};

/** Create / edit a treatment package for one offering (CRUD /hospital-portal/procedures/{id}/packages). */
export function PackageFormModal({
  offering,
  pkg,
  onClose,
}: {
  offering: HospitalProcedureOut;
  pkg: PackageOut | null;
  onClose: () => void;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const ccy = pkg?.currency ?? offering.currency;
  const inc = pkg?.includes ?? {};
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: pkg?.name ?? '',
      tier: pkg?.tier ?? 'medical_only',
      currency: ccy,
      price: minorToInput(pkg?.price_minor, ccy),
      original_price: minorToInput(pkg?.original_price_minor, ccy),
      description: pkg?.description ?? '',
      accommodation_nights: inc.accommodation_nights != null ? String(inc.accommodation_nights) : '',
      followup_teleconsults: inc.followup_teleconsults != null ? String(inc.followup_teleconsults) : '',
      airport_pickup: inc.airport_pickup ?? false,
      translator: inc.translator ?? false,
      meals: inc.meals ?? false,
      local_transport: inc.local_transport ?? false,
      is_active: pkg?.is_active ?? true,
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: PackageIn = {
        name: v.name,
        tier: v.tier,
        currency: v.currency,
        price_minor: toMinor(v.price, v.currency) ?? 0,
        original_price_minor: v.original_price ? toMinor(v.original_price, v.currency) : null,
        description: v.description || null,
        includes: {
          accommodation_nights: v.accommodation_nights ? Number(v.accommodation_nights) : 0,
          followup_teleconsults: v.followup_teleconsults ? Number(v.followup_teleconsults) : 0,
          airport_pickup: v.airport_pickup,
          translator: v.translator,
          meals: v.meals,
          local_transport: v.local_transport,
        },
        is_active: v.is_active,
      };
      return pkg
        ? hospitalPortalApi.updatePackage(offering.id, pkg.id, body)
        : hospitalPortalApi.createPackage(offering.id, body);
    },
    onSuccess: () => {
      toast.success(pkg ? 'Package updated' : 'Package added');
      void queryClient.invalidateQueries({ queryKey: qk.offerings });
      void queryClient.invalidateQueries({ queryKey: qk.packages(offering.id) });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (v: FormValues) => {
    if (toMinor(v.price, v.currency) === null) return setError('price', { message: 'Too many decimals' });
    if (v.original_price && toMinor(v.original_price, v.currency) === null) {
      return setError('original_price', { message: 'Too many decimals' });
    }
    save.mutate(v);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={pkg ? `Edit package` : 'Add package'}
      description={offering.procedure.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={save.isPending}>
            Save package
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <FormField label="Package name" htmlFor={`${ids}-name`} required error={errors.name?.message}>
          <Input id={`${ids}-name`} placeholder="e.g. Knee replacement - Comfort" {...register('name')} aria-invalid={!!errors.name} />
        </FormField>
        <FormField label="Tier" htmlFor={`${ids}-tier`} required>
          <Select
            id={`${ids}-tier`}
            options={PACKAGE_TIERS.map((t) => ({ value: t, label: `${PACKAGE_TIER_LABELS[t]} - ${TIER_HINTS[t] ?? ''}` }))}
            {...register('tier')}
          />
        </FormField>
        <FormField label="Currency" htmlFor={`${ids}-ccy`}>
          <Select id={`${ids}-ccy`} options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))} {...register('currency')} />
        </FormField>
        <div />
        <FormField label="Price" htmlFor={`${ids}-price`} required error={errors.price?.message}>
          <Input id={`${ids}-price`} inputMode="decimal" {...register('price')} aria-invalid={!!errors.price} />
        </FormField>
        <FormField
          label="Original price (optional)"
          htmlFor={`${ids}-orig`}
          error={errors.original_price?.message}
          hint="Shown struck-through to highlight savings."
        >
          <Input id={`${ids}-orig`} inputMode="decimal" {...register('original_price')} aria-invalid={!!errors.original_price} />
        </FormField>
        <FormField label="Description" htmlFor={`${ids}-desc`} className="sm:col-span-2">
          <Textarea id={`${ids}-desc`} rows={3} {...register('description')} />
        </FormField>
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">What&apos;s included</legend>
          <FormField label="Accommodation nights" htmlFor={`${ids}-nights`} error={errors.accommodation_nights?.message}>
            <Input id={`${ids}-nights`} inputMode="numeric" {...register('accommodation_nights')} />
          </FormField>
          <FormField label="Follow-up teleconsults" htmlFor={`${ids}-tc`} error={errors.followup_teleconsults?.message}>
            <Input id={`${ids}-tc`} inputMode="numeric" {...register('followup_teleconsults')} />
          </FormField>
          <Checkbox label="Airport pickup & drop" {...register('airport_pickup')} />
          <Checkbox label="Translator" {...register('translator')} />
          <Checkbox label="Meals for patient & companion" {...register('meals')} />
          <Checkbox label="Local transport" {...register('local_transport')} />
        </fieldset>
        <Checkbox label="Active (offered to patients)" {...register('is_active')} />
      </form>
    </Modal>
  );
}
