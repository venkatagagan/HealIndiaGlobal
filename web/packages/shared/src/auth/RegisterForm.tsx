import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { errorMessage, fieldErrors } from '../api/client';
import { REGISTRABLE_ROLES, type RegistrableRole } from '../api/enums';
import type { RegisterIn, UserOut } from '../api/types';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { Button } from '../ui/Button';
import { Checkbox, FormField, Input } from '../ui/form';
import { Tabs } from '../ui/Tabs';
import { useAuth } from './AuthProvider';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** PLAN 9: min 10 chars incl. a letter and a digit */
export const PASSWORD_POLICY_RE = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export function isStrongPassword(value: string): boolean {
  return PASSWORD_POLICY_RE.test(value);
}

type FieldName =
  | 'full_name'
  | 'email'
  | 'password'
  | 'phone'
  | 'country_code'
  | 'referral_code'
  | 'agency_name'
  | 'hospital_name'
  | 'city'
  | 'accept_terms';

type Values = Record<Exclude<FieldName, 'accept_terms'>, string> & { accept_terms: boolean };

const EMPTY: Values = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  country_code: '',
  referral_code: '',
  agency_name: '',
  hospital_name: '',
  city: '',
  accept_terms: false,
};

export interface RegisterFormProps {
  /** roles offered as tabs (default patient / agent / hospital) */
  roles?: readonly RegistrableRole[];
  /** fixed role (no tabs) */
  role?: RegistrableRole;
  /** initial tab (default: `?role=` from the URL, else the first role) */
  defaultRole?: RegistrableRole;
  /** prefill the referral code (default: `?ref=` / `?referral_code=` from the URL) */
  referralCode?: string;
  /** after POST /auth/register succeeded (default: open the new user's portal) */
  onSuccess?: (user: UserOut) => void;
  termsUrl?: string;
  privacyUrl?: string;
  submitLabel?: ReactNode;
  className?: string;
}

function queryParam(...names: string[]): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

/**
 * Role-aware sign-up form for POST /auth/register (PLAN 8.1): common fields + agency name (agent) or
 * hospital name & city (hospital), referral code, terms acceptance. Uses the AuthProvider session.
 */
export function RegisterForm({
  roles = REGISTRABLE_ROLES,
  role: fixedRole,
  defaultRole,
  referralCode,
  onSuccess,
  termsUrl,
  privacyUrl,
  submitLabel,
  className,
}: RegisterFormProps) {
  const auth = useAuth();
  const { t } = useCommonTranslation();
  const [role, setRole] = useState<RegistrableRole>(() => {
    if (fixedRole) return fixedRole;
    const fromUrl = queryParam('role');
    if (fromUrl && (roles as readonly string[]).includes(fromUrl)) return fromUrl as RegistrableRole;
    return defaultRole ?? roles[0] ?? 'patient';
  });
  const [values, setValues] = useState<Values>(() => ({
    ...EMPTY,
    referral_code: referralCode ?? queryParam('ref', 'referral_code') ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = (): Partial<Record<FieldName, string>> => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!values.full_name.trim()) next.full_name = t('register.errors.fullNameRequired');
    const email = values.email.trim();
    if (!email) next.email = t('auth.errors.emailRequired');
    else if (!EMAIL_RE.test(email)) next.email = t('auth.errors.emailInvalid');
    if (!isStrongPassword(values.password)) next.password = t('register.errors.passwordWeak');
    if (values.country_code.trim() && !/^[A-Za-z]{2}$/.test(values.country_code.trim())) {
      next.country_code = t('register.errors.countryInvalid');
    }
    if (role === 'agent' && !values.agency_name.trim()) next.agency_name = t('register.errors.agencyRequired');
    if (role === 'hospital') {
      if (!values.hospital_name.trim()) next.hospital_name = t('register.errors.hospitalRequired');
      if (!values.city.trim()) next.city = t('register.errors.cityRequired');
    }
    if (!values.accept_terms) next.accept_terms = t('register.errors.termsRequired');
    return next;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body: RegisterIn = {
      email: values.email.trim(),
      password: values.password,
      full_name: values.full_name.trim(),
      role,
      accept_terms: true,
    };
    if (values.phone.trim()) body.phone = values.phone.trim();
    if (values.country_code.trim()) body.country_code = values.country_code.trim().toUpperCase();
    if (values.referral_code.trim() && role !== 'hospital') body.referral_code = values.referral_code.trim();
    if (role === 'agent') body.agency_name = values.agency_name.trim();
    if (role === 'hospital') {
      body.hospital_name = values.hospital_name.trim();
      body.city = values.city.trim();
    }
    setSubmitting(true);
    try {
      const user = await auth.register(body);
      if (onSuccess) onSuccess(user);
      else if (typeof window !== 'undefined') window.location.assign(auth.portalUrls[user.role]);
    } catch (error) {
      const fromServer = fieldErrors(error);
      const mapped: Partial<Record<FieldName, string>> = {};
      for (const [key, message] of Object.entries(fromServer)) {
        if (key in EMPTY) mapped[key as FieldName] = message;
      }
      setErrors(mapped);
      if (Object.keys(mapped).length === 0) setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const showTabs = !fixedRole && roles.length > 1;

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className={cn('flex flex-col gap-5', className)}>
      {showTabs && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg" id="register-role-label">
            {t('register.accountType')}
          </span>
          <Tabs
            variant="pills"
            aria-label={t('register.accountType')}
            idPrefix="register-role"
            tabs={roles.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
            value={role}
            onChange={(next) => {
              setRole(next);
              setErrors({});
            }}
          />
          <p className="text-xs text-muted">{t(`register.roleHints.${role}`)}</p>
        </div>
      )}

      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{formError}</span>
        </div>
      )}

      <FormField label={t('register.fullName')} error={errors.full_name} required>
        <Input name="full_name" autoComplete="name" value={values.full_name} onChange={(e) => set('full_name', e.target.value)} />
      </FormField>

      {role === 'agent' && (
        <FormField label={t('register.agencyName')} error={errors.agency_name} required>
          <Input name="agency_name" autoComplete="organization" value={values.agency_name} onChange={(e) => set('agency_name', e.target.value)} />
        </FormField>
      )}

      {role === 'hospital' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t('register.hospitalName')} error={errors.hospital_name} required>
            <Input name="hospital_name" autoComplete="organization" value={values.hospital_name} onChange={(e) => set('hospital_name', e.target.value)} />
          </FormField>
          <FormField label={t('register.city')} error={errors.city} required>
            <Input name="city" autoComplete="address-level2" value={values.city} onChange={(e) => set('city', e.target.value)} />
          </FormField>
        </div>
      )}

      <FormField label={t('auth.email')} error={errors.email} required>
        <Input type="email" name="email" autoComplete="email" inputMode="email" value={values.email} onChange={(e) => set('email', e.target.value)} />
      </FormField>

      <FormField label={t('auth.password')} hint={t('register.passwordHint')} error={errors.password} required>
        <Input type="password" name="password" autoComplete="new-password" value={values.password} onChange={(e) => set('password', e.target.value)} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label={t('register.phone')} error={errors.phone} optional>
          <Input type="tel" name="phone" autoComplete="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
        </FormField>
        <FormField label={t('register.country')} error={errors.country_code} optional>
          <Input
            name="country_code"
            autoComplete="country"
            maxLength={2}
            value={values.country_code}
            onChange={(e) => set('country_code', e.target.value.toUpperCase())}
            className="uppercase"
          />
        </FormField>
      </div>

      {role !== 'hospital' && (
        <FormField label={t('register.referralCode')} error={errors.referral_code} optional>
          <Input name="referral_code" value={values.referral_code} onChange={(e) => set('referral_code', e.target.value)} />
        </FormField>
      )}

      <div className="flex flex-col gap-1">
        <Checkbox
          name="accept_terms"
          checked={values.accept_terms}
          onChange={(e) => set('accept_terms', e.target.checked)}
          invalid={Boolean(errors.accept_terms)}
          label={t('register.acceptTerms')}
          description={
            termsUrl || privacyUrl ? (
              <span className="inline-flex flex-wrap gap-x-3">
                {termsUrl && (
                  <a href={termsUrl} target="_blank" rel="noreferrer" className="text-primary-ink underline-offset-4 hover:underline">
                    {t('register.terms')}
                  </a>
                )}
                {privacyUrl && (
                  <a href={privacyUrl} target="_blank" rel="noreferrer" className="text-primary-ink underline-offset-4 hover:underline">
                    {t('register.privacy')}
                  </a>
                )}
              </span>
            ) : undefined
          }
        />
        {errors.accept_terms && (
          <p role="alert" className="text-xs font-medium text-danger-ink">
            {errors.accept_terms}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" fullWidth loading={submitting}>
        {submitting ? t('register.submitting') : (submitLabel ?? t('register.submit'))}
      </Button>
    </form>
  );
}
