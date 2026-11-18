/**
 * "Request a quote from the insurer" / "Check eligibility" (CG-18). Collects contact details only, with the
 * patient's explicit consent to pass them to the named partner; the partner quotes or decides on its own site.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { errorMessage, fieldErrors } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import {
  leadErrorCode,
  PARTNER_CONSENT_VERSION,
  useCreateLead,
  type LeadCreateIn,
  type LeadOut,
  type OfferingOut,
  type PreferredContact,
} from '../../api/partners';
import { PartnerDisclaimer, PartnerLink, safePartnerUrl } from '../../components/partners';
import { countryOptions } from '../../lib/countries';
import { useMe } from '../../lib/session';
import { buttonClass, Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '../../ui/primitives';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ().-]{3,30}$/;
const MESSAGE_MAX = 1000;

// Validation messages are catalog keys (namespace `patient`), translated when shown.
const schema = z
  .object({
    contact_name: z.string().trim().min(1, 'insurance.form.errors.name').max(200, 'insurance.form.errors.name'),
    contact_email: z
      .string()
      .trim()
      .max(254, 'insurance.form.errors.email')
      .refine((v) => !v || EMAIL.test(v), 'insurance.form.errors.email'),
    contact_phone: z
      .string()
      .trim()
      .max(32, 'insurance.form.errors.phone')
      .refine((v) => !v || PHONE.test(v), 'insurance.form.errors.phone'),
    preferred_contact: z.enum(['', 'email', 'phone', 'whatsapp']),
    country: z.string(),
    message: z.string().max(MESSAGE_MAX, 'insurance.form.errors.messageLength'),
    consent: z.boolean().refine((v) => v, 'insurance.form.errors.consent'),
  })
  .refine((v) => !!(v.contact_email || v.contact_phone), {
    path: ['contact_email'],
    message: 'insurance.form.errors.contact',
  })
  .refine((v) => v.preferred_contact !== 'email' || !!v.contact_email, {
    path: ['preferred_contact'],
    message: 'insurance.form.errors.preferredEmail',
  })
  .refine((v) => !(v.preferred_contact === 'phone' || v.preferred_contact === 'whatsapp') || !!v.contact_phone, {
    path: ['preferred_contact'],
    message: 'insurance.form.errors.preferredPhone',
  });

type FormValues = z.infer<typeof schema>;
type FieldName = keyof FormValues;

export interface LeadTarget {
  offering: OfferingOut;
  caseId?: string | null;
  bookingId?: string | null;
}

export function LeadRequestDialog({
  target,
  defaultCountry,
  onClose,
}: {
  target: LeadTarget | null;
  defaultCountry: string | null;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const offering = target?.offering;
  const isInsurance = offering?.kind !== 'pay_later';
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="lg"
      title={isInsurance ? t('insurance.form.title') : t('financing.form.title')}
      description={offering ? t('insurance.form.subtitle', { provider: offering.provider_name, product: offering.product_name }) : undefined}
    >
      {target ? <LeadForm key={target.offering.id} target={target} defaultCountry={defaultCountry} onClose={onClose} /> : null}
    </Modal>
  );
}

function LeadForm({ target, defaultCountry, onClose }: { target: LeadTarget; defaultCountry: string | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const me = useMe();
  const { offering } = target;
  const kind = offering.kind;
  const isInsurance = kind === 'insurance';
  const provider = offering.provider_name;
  const create = useCreateLead(kind);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<LeadOut | null>(null);
  const user = me.data;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      contact_name: user && !user.is_guest ? user.full_name : '',
      contact_email: user?.email ?? '',
      contact_phone: user?.phone ?? '',
      preferred_contact: '',
      country: defaultCountry ?? '',
      message: '',
      consent: false,
    },
  });
  const { errors } = form.formState;
  const messageLength = form.watch('message').length;
  const fieldError = (message: string | undefined) =>
    message ? (message.startsWith('insurance.') || message.startsWith('financing.') ? t(message, { provider }) : message) : undefined;

  const onSubmit = form.handleSubmit(async (v) => {
    setFormError(null);
    const body: LeadCreateIn = {
      ...(isInsurance ? { product_id: offering.id } : { partner_id: offering.id }),
      ...(target.caseId ? { case_id: target.caseId } : {}),
      ...(target.bookingId ? { booking_id: target.bookingId } : {}),
      contact_name: v.contact_name,
      ...(v.contact_email ? { contact_email: v.contact_email } : {}),
      ...(v.contact_phone ? { contact_phone: v.contact_phone } : {}),
      ...(v.preferred_contact ? { preferred_contact: v.preferred_contact as PreferredContact } : {}),
      ...(v.country ? { country: v.country } : {}),
      ...(v.message.trim() ? { message: v.message.trim() } : {}),
      consent_share_contact: v.consent,
      consent_version: PARTNER_CONSENT_VERSION,
    };
    try {
      setDone(await create.mutateAsync(body));
    } catch (err) {
      switch (leadErrorCode(err)) {
        case 'consent_required':
          form.setError('consent', { message: 'insurance.form.serverErrors.consentRequired' }, { shouldFocus: true });
          return;
        case 'partner_country_not_eligible':
          form.setError('country', { message: 'insurance.form.serverErrors.countryNotEligible' }, { shouldFocus: true });
          return;
        case 'duplicate_request':
          setFormError(t('insurance.form.serverErrors.duplicate', { provider }));
          return;
        case 'offering_not_found':
          setFormError(t('insurance.form.serverErrors.notFound'));
          void qc.invalidateQueries({ queryKey: ['partners', 'offerings'] });
          return;
        default:
          break;
      }
      const fields = fieldErrors(err);
      let mapped = false;
      for (const key of ['contact_name', 'contact_email', 'contact_phone', 'preferred_contact', 'country', 'message'] as const) {
        if (fields[key]) {
          form.setError(key, { message: fields[key] });
          mapped = true;
        }
      }
      if (!mapped) toast.error(errorMessage(err, t('insurance.form.serverErrors.generic')));
    }
  });

  if (done) {
    const href = safePartnerUrl(done.partner_website_url) ?? safePartnerUrl(offering.website_url);
    return (
      <div className="space-y-4" role="status">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-semibold text-fg">{t('insurance.form.success.title')}</p>
            <p className="mt-1 text-sm text-muted">
              {isInsurance ? t('insurance.form.success.text', { provider }) : t('financing.form.successText', { provider })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {href ? (
            <PartnerLink href={href} className={buttonClass('primary', 'md')}>
              {t('insurance.form.success.continue', { provider })}
            </PartnerLink>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t('insurance.form.success.done')}
          </Button>
        </div>
      </div>
    );
  }

  const r = (name: FieldName) => ({ ...form.register(name), 'aria-invalid': !!errors[name] || undefined });
  const describedBy = (name: FieldName, id: string) => (errors[name] ? undefined : id);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <PartnerDisclaimer kind={kind} />
      {!isInsurance ? <p className="text-sm text-muted">{t('financing.howItWorks')}</p> : null}
      {target.caseId || target.bookingId ? (
        <p className="text-sm text-muted">{target.bookingId ? t('insurance.linked.booking') : t('insurance.linked.case')}</p>
      ) : null}

      <Field label={t('insurance.form.name')} htmlFor="lead-name" error={fieldError(errors.contact_name?.message)} required>
        <Input id="lead-name" autoComplete="name" {...r('contact_name')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('insurance.form.email')}
          htmlFor="lead-email"
          error={fieldError(errors.contact_email?.message)}
          hint={<span id="lead-contact-hint">{t('insurance.form.contactHint')}</span>}
        >
          <Input
            id="lead-email"
            type="email"
            autoComplete="email"
            aria-describedby={describedBy('contact_email', 'lead-contact-hint')}
            {...r('contact_email')}
          />
        </Field>
        <Field label={t('insurance.form.phone')} htmlFor="lead-phone" error={fieldError(errors.contact_phone?.message)}>
          <Input id="lead-phone" type="tel" autoComplete="tel" dir="ltr" className="text-start" {...r('contact_phone')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('insurance.form.preferred')} htmlFor="lead-preferred" error={fieldError(errors.preferred_contact?.message)}>
          <Select id="lead-preferred" {...r('preferred_contact')}>
            <option value="">{t('insurance.form.preferredAny')}</option>
            <option value="email">{t('insurance.form.preferredOptions.email')}</option>
            <option value="phone">{t('insurance.form.preferredOptions.phone')}</option>
            <option value="whatsapp">{t('insurance.form.preferredOptions.whatsapp')}</option>
          </Select>
        </Field>
        <Field label={t('insurance.form.country')} htmlFor="lead-country" error={fieldError(errors.country?.message)}>
          <Select id="lead-country" autoComplete="country" {...r('country')}>
            <option value="">{t('insurance.form.countryNone')}</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label={t('insurance.form.message')}
        htmlFor="lead-message"
        error={fieldError(errors.message?.message)}
        hint={
          <span id="lead-message-hint" className="flex justify-between gap-2">
            <span>{t('insurance.form.messageHint')}</span>
            <span className="tabular-nums" aria-hidden>
              {messageLength}/{MESSAGE_MAX}
            </span>
          </span>
        }
      >
        <Textarea
          id="lead-message"
          rows={3}
          maxLength={MESSAGE_MAX}
          aria-describedby={describedBy('message', 'lead-message-hint')}
          {...r('message')}
        />
      </Field>
      <div>
        <Checkbox
          label={t('insurance.form.consent', { provider })}
          aria-invalid={!!errors.consent || undefined}
          aria-describedby={errors.consent ? 'lead-consent-error' : undefined}
          aria-required
          {...form.register('consent')}
        />
        {errors.consent ? (
          <p id="lead-consent-error" className="mt-1 ps-7 text-xs text-danger-ink" role="alert">
            {fieldError(errors.consent.message)}
          </p>
        ) : null}
      </div>
      {formError ? (
        <Alert tone="red" className="text-sm">
          <span role="alert">{formError}</span>
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          {t('insurance.form.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {isInsurance ? t('insurance.form.submit') : t('financing.form.submit')}
        </Button>
      </div>
    </form>
  );
}
