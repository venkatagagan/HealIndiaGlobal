import { useId, useMemo } from 'react';
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
import { useAppTranslation } from '../../i18n';
import { SUPPORTED_CURRENCIES, minorToInput, toMinor } from '../../lib/format';
import { qk } from '../../lib/queries';

type T = ReturnType<typeof useAppTranslation>['t'];

function makeSchema(t: T) {
  return z
    .object({
      name: z.string().trim().min(2, t('procedures.packageForm.errors.name')).max(150),
      tier: z.enum(PACKAGE_TIERS),
      currency: z.string().length(3),
      price: z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, t('procedures.packageForm.errors.price')),
      original_price: z.string().trim().regex(/^(\d{1,12}(\.\d{1,3})?)?$/, t('procedures.offeringForm.errors.amount')),
      description: z.string().trim().max(2000),
      accommodation_nights: z.string().trim().regex(/^(\d{1,3})?$/, t('procedures.packageForm.errors.wholeNights')),
      followup_teleconsults: z.string().trim().regex(/^(\d{1,2})?$/, t('procedures.packageForm.errors.numberOfCalls')),
      airport_pickup: z.boolean(),
      translator: z.boolean(),
      meals: z.boolean(),
      local_transport: z.boolean(),
      is_active: z.boolean(),
    })
    .refine((v) => !v.original_price || Number(v.original_price) > Number(v.price), {
      path: ['original_price'],
      message: t('procedures.packageForm.errors.originalPrice'),
    });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function tierHint(tier: string, t: T): string {
  switch (tier) {
    case 'medical_only':
      return t('procedures.packageForm.tierHints.medicalOnly');
    case 'medical_stay':
      return t('procedures.packageForm.tierHints.medicalStay');
    case 'all_inclusive':
      return t('procedures.packageForm.tierHints.allInclusive');
    default:
      return '';
  }
}

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
  const { t } = useAppTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
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
      toast.success(pkg ? t('procedures.packageForm.toastUpdated') : t('procedures.packageForm.toastAdded'));
      void queryClient.invalidateQueries({ queryKey: qk.offerings });
      void queryClient.invalidateQueries({ queryKey: qk.packages(offering.id) });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (v: FormValues) => {
    if (toMinor(v.price, v.currency) === null) return setError('price', { message: t('procedures.offeringForm.errors.tooManyDecimals') });
    if (v.original_price && toMinor(v.original_price, v.currency) === null) {
      return setError('original_price', { message: t('procedures.offeringForm.errors.tooManyDecimals') });
    }
    save.mutate(v);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={pkg ? t('procedures.packageForm.editTitle') : t('procedures.details.addPackage')}
      description={offering.procedure.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={save.isPending}>
            {t('procedures.packageForm.savePackage')}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
        <FormField label={t('procedures.packageForm.name')} htmlFor={`${ids}-name`} required error={errors.name?.message}>
          <Input id={`${ids}-name`} placeholder={t('procedures.packageForm.namePlaceholder')} {...register('name')} aria-invalid={!!errors.name} />
        </FormField>
        <FormField label={t('procedures.packageForm.tier')} htmlFor={`${ids}-tier`} required>
          <Select
            id={`${ids}-tier`}
            options={PACKAGE_TIERS.map((tier) => ({
              value: tier,
              label: t('procedures.packageForm.tierOption', { tier: PACKAGE_TIER_LABELS[tier], hint: tierHint(tier, t) }),
            }))}
            {...register('tier')}
          />
        </FormField>
        <FormField label={t('procedures.offeringForm.currency')} htmlFor={`${ids}-ccy`}>
          <Select id={`${ids}-ccy`} options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))} {...register('currency')} />
        </FormField>
        <div />
        <FormField label={t('procedures.page.price')} htmlFor={`${ids}-price`} required error={errors.price?.message}>
          <Input id={`${ids}-price`} inputMode="decimal" {...register('price')} aria-invalid={!!errors.price} />
        </FormField>
        <FormField
          label={t('procedures.packageForm.originalPrice')}
          htmlFor={`${ids}-orig`}
          error={errors.original_price?.message}
          hint={t('procedures.packageForm.originalPriceHint')}
        >
          <Input id={`${ids}-orig`} inputMode="decimal" {...register('original_price')} aria-invalid={!!errors.original_price} />
        </FormField>
        <FormField label={t('common.description')} htmlFor={`${ids}-desc`} className="sm:col-span-2">
          <Textarea id={`${ids}-desc`} rows={3} {...register('description')} />
        </FormField>
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{t('procedures.packageForm.whatsIncluded')}</legend>
          <FormField label={t('procedures.packageForm.accommodationNights')} htmlFor={`${ids}-nights`} error={errors.accommodation_nights?.message}>
            <Input id={`${ids}-nights`} inputMode="numeric" {...register('accommodation_nights')} />
          </FormField>
          <FormField label={t('procedures.packageForm.followupTeleconsults')} htmlFor={`${ids}-tc`} error={errors.followup_teleconsults?.message}>
            <Input id={`${ids}-tc`} inputMode="numeric" {...register('followup_teleconsults')} />
          </FormField>
          <Checkbox label={t('procedures.packageForm.airportPickupDrop')} {...register('airport_pickup')} />
          <Checkbox label={t('procedures.includes.translator')} {...register('translator')} />
          <Checkbox label={t('procedures.packageForm.mealsPatientCompanion')} {...register('meals')} />
          <Checkbox label={t('procedures.includes.localTransport')} {...register('local_transport')} />
        </fieldset>
        <Checkbox label={t('procedures.offeringForm.activeLabel')} {...register('is_active')} />
      </form>
    </Modal>
  );
}
