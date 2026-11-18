import { useId, useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  QUOTE_LINE_CATEGORIES,
  QUOTE_LINE_CATEGORY_LABELS,
  casesApi,
  errorMessage,
  type CaseDetail,
  type QuoteLineCategory,
} from '@hig/shared/api';
import { Button, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { SUPPORTED_CURRENCIES, currencyExponent, formatMoney, isoDateFromToday, minorToInput, toMinor } from '../../lib/format';
import { useAppTranslation } from '../../i18n';
import { qk } from '../../lib/queries';

type TFn = ReturnType<typeof useAppTranslation>['t'];

function makeSchema(t: TFn) {
  const lineSchema = z.object({
    category: z.enum(QUOTE_LINE_CATEGORIES),
    description: z.string().trim().min(2, t('cases.quoteForm.errors.describeItem')).max(300),
    amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, t('cases.quoteForm.errors.enterAmount')),
  });
  return z.object({
    treatment_plan: z.string().trim().min(10, t('cases.quoteForm.errors.describePlan')).max(5000),
    currency: z.string().length(3),
    estimated_stay_days: z.string().trim().regex(/^(\d{1,3})?$/, t('cases.quoteForm.errors.wholeDays')),
    valid_until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, t('cases.quoteForm.errors.pickDate'))
      .refine((v) => v >= isoDateFromToday(1), t('cases.quoteForm.errors.futureDate')),
    line_items: z.array(lineSchema).min(1, t('cases.quoteForm.errors.atLeastOneLine')).max(30),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const defaultLines = (t: TFn): { category: QuoteLineCategory; description: string }[] => [
  { category: 'surgery', description: t('cases.quoteForm.defaultLines.surgery') },
  { category: 'hospital_stay', description: t('cases.quoteForm.defaultLines.hospitalStay') },
  { category: 'medications', description: t('cases.quoteForm.defaultLines.medications') },
  { category: 'tests_scans', description: t('cases.quoteForm.defaultLines.testsScans') },
];

/** Itemized quote (POST /cases/{id}/quotes): case moves to `quoted`; a new quote supersedes the previous one. */
export function QuoteFormModal({ open, onClose, detail }: { open: boolean; onClose: () => void; detail: CaseDetail }) {
  const { t } = useAppTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
  const ids = useId();
  const queryClient = useQueryClient();
  const previous = detail.latest_quote;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: previous
      ? {
          treatment_plan: previous.treatment_plan,
          currency: previous.currency,
          estimated_stay_days: previous.estimated_stay_days != null ? String(previous.estimated_stay_days) : '',
          valid_until: isoDateFromToday(30),
          line_items: previous.line_items.map((l) => ({
            category: l.category,
            description: l.description,
            amount: minorToInput(l.amount_minor, previous.currency),
          })),
        }
      : {
          treatment_plan: '',
          currency: 'INR',
          estimated_stay_days: '',
          valid_until: isoDateFromToday(30),
          line_items: defaultLines(t).map((l) => ({ ...l, amount: '' })),
        },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' });
  const currency = useWatch({ control, name: 'currency' });
  const lines = useWatch({ control, name: 'line_items' });
  const total = (lines ?? []).reduce((sum, l) => sum + (toMinor(l?.amount ?? '', currency) ?? 0), 0);

  const send = useMutation({
    mutationFn: (v: FormValues) => {
      const items = v.line_items.map((l) => ({
        category: l.category,
        description: l.description,
        amount_minor: toMinor(l.amount, v.currency) ?? 0,
      }));
      return casesApi.sendQuote(detail.id, {
        treatment_plan: v.treatment_plan,
        currency: v.currency,
        estimated_stay_days: v.estimated_stay_days ? Number(v.estimated_stay_days) : null,
        valid_until: v.valid_until,
        line_items: items,
      });
    },
    onSuccess: () => {
      toast.success(t('cases.quoteForm.sent'));
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = (v: FormValues) => {
    const exp = currencyExponent(v.currency);
    let bad = false;
    v.line_items.forEach((l, i) => {
      const minor = toMinor(l.amount, v.currency);
      if (minor === null || minor <= 0) {
        setError(`line_items.${i}.amount`, {
          message: exp === 0 ? t('cases.quoteForm.errors.wholeAmount') : t('cases.quoteForm.errors.decimals', { count: exp }),
        });
        bad = true;
      }
    });
    if (!bad) send.mutate(v);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={previous ? t('cases.quoteForm.titleRevised') : t('cases.quoteForm.title')}
      description={`${detail.case_number} · ${detail.patient.full_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={send.isPending}>
            {t('cases.quoteForm.submit', { total: formatMoney(total, currency) })}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <FormField label={t('cases.quoteForm.treatmentPlan')} htmlFor={`${ids}-plan`} required error={errors.treatment_plan?.message}>
          <Textarea
            id={`${ids}-plan`}
            rows={4}
            placeholder={t('cases.quoteForm.treatmentPlanPlaceholder')}
            {...register('treatment_plan')}
            aria-invalid={!!errors.treatment_plan}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('cases.quoteForm.currency')} htmlFor={`${ids}-ccy`} required>
            <Select id={`${ids}-ccy`} options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))} {...register('currency')} />
          </FormField>
          <FormField label={t('cases.quoteForm.estimatedStay')} htmlFor={`${ids}-stay`} error={errors.estimated_stay_days?.message}>
            <Input id={`${ids}-stay`} inputMode="numeric" {...register('estimated_stay_days')} />
          </FormField>
          <FormField label={t('cases.quoteForm.validUntil')} htmlFor={`${ids}-valid`} required error={errors.valid_until?.message}>
            <Input id={`${ids}-valid`} type="date" min={isoDateFromToday(1)} {...register('valid_until')} />
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('cases.quoteForm.lineItems')}</h3>
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              onClick={() => append({ category: 'other', description: '', amount: '' })}
              disabled={fields.length >= 30}
            >
              {t('cases.quoteForm.addItem')}
            </Button>
          </div>
          {errors.line_items?.root?.message && <p className="mb-2 text-xs text-danger-500">{errors.line_items.root.message}</p>}
          <div className="space-y-3">
            {fields.map((field, index) => {
              const err = errors.line_items?.[index];
              return (
                <div
                  key={field.id}
                  className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[11rem_1fr_9rem_auto] sm:items-start dark:border-slate-700"
                >
                  <div>
                    <label className="sr-only" htmlFor={`${ids}-cat-${index}`}>
                      {t('cases.quoteForm.category')}
                    </label>
                    <Select
                      id={`${ids}-cat-${index}`}
                      options={QUOTE_LINE_CATEGORIES.map((c) => ({ value: c, label: QUOTE_LINE_CATEGORY_LABELS[c] }))}
                      {...register(`line_items.${index}.category`)}
                    />
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`${ids}-desc-${index}`}>
                      {t('common.description')}
                    </label>
                    <Input
                      id={`${ids}-desc-${index}`}
                      placeholder={t('common.description')}
                      {...register(`line_items.${index}.description`)}
                      aria-invalid={!!err?.description}
                    />
                    {err?.description && <p className="mt-1 text-xs text-danger-500">{err.description.message}</p>}
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`${ids}-amt-${index}`}>
                      {t('cases.quoteForm.amountIn', { currency })}
                    </label>
                    <Input
                      id={`${ids}-amt-${index}`}
                      inputMode="decimal"
                      placeholder={t('cases.quoteForm.amountIn', { currency })}
                      {...register(`line_items.${index}.amount`)}
                      aria-invalid={!!err?.amount}
                    />
                    {err?.amount && <p className="mt-1 text-xs text-danger-500">{err.amount.message}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('cases.quoteForm.removeLine')}
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-danger-500" aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end text-sm">
            <span className="text-slate-500 dark:text-slate-400">{t('cases.quoteForm.total')}&nbsp;</span>
            <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(total, currency)}</span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
