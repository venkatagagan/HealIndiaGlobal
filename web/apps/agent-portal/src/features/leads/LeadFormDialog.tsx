import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import {
  LEAD_SOURCES,
  OPEN_LEAD_STATUSES,
  crmApi,
  errorMessage,
  fieldErrors,
  type LeadCreateIn,
  type LeadDetailOut,
  type LeadOut,
  type LeadSource,
  type LeadUpdateIn,
  type OpenLeadStatus,
} from '@hig/shared/api';
import { Button, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { countryOptions } from '../../lib/constants';
import { SUPPORTED_CURRENCIES, fromMinor, intlLocale, toMinor } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { fromLocalInput, invalidateLeads, toLocalInput } from './leadMeta';

const LANGUAGE_CODES = ['en', 'ar', 'fr', 'ru', 'bn', 'hi', 'ur', 'fa', 'sw', 'am', 'uz', 'es', 'pt'] as const;

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([intlLocale()], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(intlLocale()) + name.slice(1) : code;
  } catch {
    return code;
  }
}

interface Values {
  full_name: string;
  country: string;
  email: string;
  phone: string;
  whatsapp: string;
  preferred_language: string;
  source: LeadSource;
  source_detail: string;
  interest: string;
  budget: string;
  budget_currency: string;
  next_follow_up_at: string;
  tags: string;
  status: OpenLeadStatus;
  note: string;
}

type Errors = Partial<Record<keyof Values, string>>;

function initial(lead?: LeadOut | null): Values {
  return {
    full_name: lead?.full_name ?? '',
    country: lead?.country ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    whatsapp: lead?.whatsapp ?? '',
    preferred_language: lead?.preferred_language ?? '',
    source: lead?.source ?? 'walk_in',
    source_detail: lead?.source_detail ?? '',
    interest: lead?.interest ?? '',
    budget:
      lead?.budget_minor !== null && lead?.budget_minor !== undefined && lead.budget_currency
        ? String(fromMinor(lead.budget_minor, lead.budget_currency))
        : '',
    budget_currency: lead?.budget_currency ?? 'USD',
    next_follow_up_at: toLocalInput(lead?.next_follow_up_at),
    tags: (lead?.tags ?? []).join(', '),
    status: 'new',
    note: '',
  };
}

const PHONE_RE = /^\+?[0-9 ()-]{6,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Quick-add (no `lead`) or edit the contact/interest fields of a lead. */
export function LeadFormDialog({
  open,
  onClose,
  lead,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  lead?: LeadOut | null;
  onSaved?: (lead: LeadDetailOut) => void;
}) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const editing = Boolean(lead);
  const [values, setValues] = useState<Values>(() => initial(lead));
  const [errors, setErrors] = useState<Errors>({});
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);
  // reset the form each time the dialog opens (or opens for another lead)
  const key = open ? (lead?.id ?? null) : undefined;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (open) {
      setValues(initial(lead));
      setErrors({});
    }
  }

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((cur) => ({ ...cur, [k]: v }));
    if (errors[k]) setErrors((cur) => ({ ...cur, [k]: undefined }));
  };

  function validate(): Errors {
    const e: Errors = {};
    if (!values.full_name.trim()) e.full_name = t('crm.form.errors.required');
    if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) e.email = t('crm.form.errors.email');
    if (values.phone.trim() && !PHONE_RE.test(values.phone.trim())) e.phone = t('crm.form.errors.phone');
    if (values.whatsapp.trim() && !PHONE_RE.test(values.whatsapp.trim())) e.whatsapp = t('crm.form.errors.phone');
    if (values.budget.trim()) {
      const minor = toMinor(values.budget.trim(), values.budget_currency);
      if (minor === null || minor < 0) e.budget = t('crm.form.errors.budget');
    }
    const tags = splitTags(values.tags);
    if (tags.length > 10) e.tags = t('crm.form.errors.tooManyTags');
    else if (tags.some((tag) => tag.length > 40)) e.tags = t('crm.form.errors.tagTooLong');
    return e;
  }

  const mutation = useMutation({
    mutationFn: async (): Promise<LeadDetailOut> => {
      const budget = values.budget.trim() ? toMinor(values.budget.trim(), values.budget_currency) : null;
      const common = {
        country: values.country || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        whatsapp: values.whatsapp.trim() || null,
        preferred_language: values.preferred_language || null,
        source: values.source,
        source_detail: values.source_detail.trim() || null,
        interest: values.interest.trim() || null,
        budget_minor: budget,
        budget_currency: budget !== null ? values.budget_currency : null,
        next_follow_up_at: fromLocalInput(values.next_follow_up_at),
        tags: splitTags(values.tags),
      };
      if (lead) {
        const body: LeadUpdateIn = { full_name: values.full_name.trim(), ...common };
        return crmApi.update(lead.id, body);
      }
      const body: LeadCreateIn = {
        full_name: values.full_name.trim(),
        ...common,
        status: values.status,
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      };
      return crmApi.create(body);
    },
    onSuccess: (saved) => {
      invalidateLeads(qc);
      toast.success(editing ? t('crm.form.updated') : t('crm.form.added'));
      onClose();
      onSaved?.(saved);
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      const mapped: Errors = {};
      for (const [k, message] of Object.entries(fields)) {
        if (k === 'budget_minor' || k === 'budget_currency') mapped.budget = message;
        else if (k in values) mapped[k as keyof Values] = message;
      }
      setErrors(mapped);
      if (Object.keys(mapped).length === 0) toast.error(errorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? t('crm.form.editTitle') : t('crm.form.addTitle')}
      description={editing ? t('crm.form.editDescription') : t('crm.form.addDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            {t('crm.form.cancel')}
          </Button>
          <Button type="submit" form="lead-form" loading={mutation.isPending}>
            {editing ? t('crm.form.save') : t('crm.form.add')}
          </Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <p className="flex items-start gap-2 rounded-lg bg-info-soft p-3 text-sm text-info-ink sm:col-span-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('crm.form.medicalHint')}
        </p>
        <FormField label={t('crm.fields.fullName')} htmlFor="lf-name" error={errors.full_name} required className="sm:col-span-2">
          <Input id="lf-name" maxLength={200} aria-invalid={!!errors.full_name} value={values.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </FormField>
        <FormField label={t('crm.fields.phone')} htmlFor="lf-phone" error={errors.phone}>
          <Input id="lf-phone" type="tel" maxLength={32} value={values.phone} onChange={(e) => set('phone', e.target.value)} />
        </FormField>
        <FormField label={t('crm.fields.whatsapp')} htmlFor="lf-wa" error={errors.whatsapp}>
          <Input id="lf-wa" type="tel" maxLength={32} value={values.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
        </FormField>
        <FormField label={t('crm.fields.email')} htmlFor="lf-email" error={errors.email}>
          <Input id="lf-email" type="email" maxLength={254} value={values.email} onChange={(e) => set('email', e.target.value)} />
        </FormField>
        <FormField label={t('crm.fields.country')} htmlFor="lf-country" error={errors.country}>
          <Select id="lf-country" value={values.country} onChange={(e) => set('country', e.target.value)}>
            <option value="">{t('crm.form.select')}</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('crm.fields.language')} htmlFor="lf-lang" error={errors.preferred_language}>
          <Select id="lf-lang" value={values.preferred_language} onChange={(e) => set('preferred_language', e.target.value)}>
            <option value="">{t('crm.form.select')}</option>
            {LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('crm.fields.source')} htmlFor="lf-source" error={errors.source}>
          <Select id="lf-source" value={values.source} onChange={(e) => set('source', e.target.value as LeadSource)}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`crm.source.${s}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('crm.fields.sourceDetail')} htmlFor="lf-sdetail" error={errors.source_detail} hint={t('crm.form.sourceDetailHint')}>
          <Input id="lf-sdetail" maxLength={200} value={values.source_detail} onChange={(e) => set('source_detail', e.target.value)} />
        </FormField>
        <FormField label={t('crm.fields.interest')} htmlFor="lf-interest" error={errors.interest} hint={t('crm.form.interestHint')} className="sm:col-span-2">
          <Input id="lf-interest" maxLength={300} value={values.interest} onChange={(e) => set('interest', e.target.value)} />
        </FormField>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <FormField label={t('crm.fields.budget')} htmlFor="lf-budget" error={errors.budget}>
            <Input id="lf-budget" inputMode="decimal" value={values.budget} onChange={(e) => set('budget', e.target.value)} />
          </FormField>
          <FormField label={t('crm.fields.currency')} htmlFor="lf-ccy">
            <Select id="lf-ccy" value={values.budget_currency} onChange={(e) => set('budget_currency', e.target.value)}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label={t('crm.fields.nextFollowUp')} htmlFor="lf-follow" error={errors.next_follow_up_at}>
          <Input id="lf-follow" type="datetime-local" value={values.next_follow_up_at} onChange={(e) => set('next_follow_up_at', e.target.value)} />
        </FormField>
        <FormField label={t('crm.fields.tags')} htmlFor="lf-tags" error={errors.tags} hint={t('crm.form.tagsHint')} className="sm:col-span-2">
          <Input id="lf-tags" value={values.tags} onChange={(e) => set('tags', e.target.value)} />
        </FormField>
        {!editing && (
          <>
            <FormField label={t('crm.fields.status')} htmlFor="lf-status">
              <Select id="lf-status" value={values.status} onChange={(e) => set('status', e.target.value as OpenLeadStatus)}>
                {OPEN_LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`crm.status.${s}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('crm.fields.note')} htmlFor="lf-note" error={errors.note} hint={t('crm.form.noteHint')} className="sm:col-span-2">
              <Textarea id="lf-note" rows={3} maxLength={5000} value={values.note} onChange={(e) => set('note', e.target.value)} />
            </FormField>
          </>
        )}
      </form>
    </Modal>
  );
}

function splitTags(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[,;]/)) {
    const tag = raw.trim().replace(/\s+/g, ' ').toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}
