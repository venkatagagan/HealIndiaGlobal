'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Building2, BriefcaseMedical, Info, LockKeyhole, UserRound } from 'lucide-react';
import { apiPost, destinationFor, isPortalRole, rememberSession, type TokenOut } from '@/lib/auth-client';
import { assessmentUrl, type PortalRole } from '@/config/site';
import { ADULT_REQUIRED, AGE_ATTESTATION_REQUIRED, AgeQuestion, GoogleAgePrompt, ageAnswerValid, type AgeAnswer } from './age-question';
import { countryOptions } from './countries';
import { EMAIL_RE, FormAlert, PasswordField, SelectField, SubmitButton, TextField, passwordOk } from './fields';
import { GoogleButton, googleEnabled } from './google-button';
import { Divider } from './login-form';
import { authErrorMessage, invalidFields, type AuthLabels } from './shared';

type Errors = Partial<
  Record<'full_name' | 'email' | 'password' | 'country_code' | 'agency_name' | 'hospital_name' | 'city' | 'accept_terms' | 'is_adult', string>
>;

const ROLE_ICONS = { patient: UserRound, agent: BriefcaseMedical, hospital: Building2 } as const;

export function RegisterForm({
  t,
  intlLocale,
  loginHref,
  termsHref,
  privacyHref,
  orLabel,
}: {
  t: AuthLabels;
  intlLocale: string;
  loginHref: string;
  termsHref: string;
  privacyHref: string;
  orLabel: string;
}) {
  const params = useSearchParams();
  const next = params.get('next');
  const initialRole = params.get('role');
  const [role, setRole] = useState<PortalRole>(isPortalRole(initialRole) ? initialRole : 'patient');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    country_code: '',
    agency_name: '',
    hospital_name: '',
    city: '',
    referral_code: (params.get('ref') ?? params.get('referral_code') ?? '').slice(0, 32),
    accept_terms: false,
  });
  /** CG-24 18+ attestation, sent as `is_adult` */
  const [isAdult, setIsAdult] = useState<AgeAnswer>(null);
  /** Google ID token waiting for the age answer (400 `age_attestation_required`) */
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const countries = useMemo(() => countryOptions(intlLocale), [intlLocale]);

  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): Errors {
    const e: Errors = {};
    if (!form.full_name.trim()) e.full_name = t.errors.required;
    if (!EMAIL_RE.test(form.email.trim())) e.email = t.errors.email;
    if (!passwordOk(form.password)) e.password = t.errors.password;
    if (role === 'agent') {
      if (!form.agency_name.trim()) e.agency_name = t.errors.required;
      if (!form.country_code) e.country_code = t.errors.required;
    }
    if (role === 'hospital') {
      if (!form.hospital_name.trim()) e.hospital_name = t.errors.required;
      if (!form.city.trim()) e.city = t.errors.required;
    }
    if (!ageAnswerValid(role, isAdult)) e.is_adult = t.errors.age;
    if (!form.accept_terms) e.accept_terms = t.errors.terms;
    return e;
  }

  function go(res: TokenOut, fallback?: string) {
    const r = res.user?.role;
    if (!isPortalRole(r)) {
      setError(t.genericError);
      setPending(false);
      return;
    }
    rememberSession(r);
    setRedirecting(true);
    window.location.assign(fallback && !next ? fallback : (destinationFor(r, next) as string));
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (pending) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !ageAnswerValid(role, isAdult)) {
      setError(t.errors.checkFields);
      return;
    }
    setPending(true);
    setError(null);
    const body: Record<string, unknown> = {
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      role,
      accept_terms: true,
      is_adult: isAdult,
    };
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.country_code) body.country_code = form.country_code;
    if (role === 'patient' && form.referral_code.trim()) body.referral_code = form.referral_code.trim();
    if (role === 'agent') body.agency_name = form.agency_name.trim();
    if (role === 'hospital') {
      body.hospital_name = form.hospital_name.trim();
      body.city = form.city.trim();
    }
    const res = await apiPost<TokenOut>('/auth/register', body);
    if (res.ok) return go(res.data);
    setPending(false);
    if (res.status === 422) {
      const fe: Errors = {};
      for (const f of invalidFields(res.details)) {
        if (f === 'password') fe.password = t.errors.password;
        else if (f === 'email') fe.email = t.errors.email;
        else if (f === 'is_adult') fe.is_adult = role === 'patient' ? t.errors.age : t.errors.adultRequired;
        else if (f in form) fe[f as keyof Errors] = t.errors.required;
      }
      setErrors(fe);
    }
    if (res.status === 409) setErrors({ email: t.errors.emailTaken });
    setError(authErrorMessage(res, t));
  }

  /** Google sign-up (patients). Sends the age answer when given; otherwise asks for it if the API needs it. */
  async function onGoogle(idToken: string, answer: AgeAnswer = isAdult) {
    setPending(true);
    setError(null);
    const res = await apiPost<TokenOut>('/auth/google', {
      id_token: idToken,
      role: 'patient',
      ...(answer !== null ? { is_adult: answer } : {}),
    });
    if (res.ok) return go(res.data);
    setPending(false);
    if (res.status === 400 && res.code === AGE_ATTESTATION_REQUIRED) {
      setGoogleToken(idToken);
      return;
    }
    if (res.status === 400 && res.code === ADULT_REQUIRED) {
      setGoogleToken(null);
      setError(t.errors.adultRequired);
      return;
    }
    setGoogleToken(null);
    setError(res.status === 401 ? t.googleError : authErrorMessage(res, t));
  }

  async function onGuest() {
    setPending(true);
    setError(null);
    const res = await apiPost<TokenOut>('/auth/guest', {});
    if (res.ok) return go(res.data, assessmentUrl());
    setPending(false);
    setError(authErrorMessage(res, t));
  }

  if (redirecting) {
    return (
      <FormAlert tone="info">
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-700" aria-hidden="true" />
          {t.redirecting}
        </span>
      </FormAlert>
    );
  }

  const termsLabel = t.acceptTerms.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
    part === '{terms}' ? (
      <Link key={i} href={termsHref} target="_blank" className="font-medium text-primary-700 underline underline-offset-2">
        {t.termsLink}
      </Link>
    ) : part === '{privacy}' ? (
      <Link key={i} href={privacyHref} target="_blank" className="font-medium text-primary-700 underline underline-offset-2">
        {t.privacyLink}
      </Link>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">{t.accountType}</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.accountType}>
          {(['patient', 'agent', 'hospital'] as const).map((r) => {
            const Icon = ROLE_ICONS[r];
            const active = role === r;
            return (
              <label
                key={r}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-sm font-semibold transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-primary-600 ${
                  active ? 'border-primary-600 bg-primary-50 text-primary-900 ring-1 ring-primary-600' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={active}
                  onChange={() => {
                    setRole(r);
                    setErrors({});
                    setError(null);
                    setGoogleToken(null);
                    // "under 18" is a patient-only answer
                    if (r !== 'patient' && isAdult === false) setIsAdult(null);
                  }}
                  className="sr-only"
                />
                <Icon className="h-5 w-5" aria-hidden="true" />
                {t.roles[r]}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-slate-600">{t.roleHelp[role]}</p>
      </fieldset>

      {role === 'patient' && googleEnabled ? (
        <div className="space-y-4">
          {googleToken ? (
            <GoogleAgePrompt
              t={t}
              role="patient"
              pending={pending}
              onSubmit={(answer) => {
                setIsAdult(answer);
                void onGoogle(googleToken, answer);
              }}
              onCancel={() => setGoogleToken(null)}
            />
          ) : (
            <GoogleButton text="signup_with" onCredential={(idToken) => void onGoogle(idToken)} onError={() => setError(t.googleError)} />
          )}
          <Divider label={orLabel} />
        </div>
      ) : null}

      <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        {role === 'agent' ? (
          <TextField label={t.agencyName} name="agency_name" autoComplete="organization" required value={form.agency_name} onChange={(e) => set('agency_name')(e.target.value)} error={errors.agency_name} maxLength={200} />
        ) : null}
        {role === 'hospital' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t.hospitalName} name="hospital_name" autoComplete="organization" required value={form.hospital_name} onChange={(e) => set('hospital_name')(e.target.value)} error={errors.hospital_name} maxLength={200} />
            <TextField label={t.city} name="city" autoComplete="address-level2" required value={form.city} onChange={(e) => set('city')(e.target.value)} error={errors.city} maxLength={120} />
          </div>
        ) : null}
        <TextField
          label={role === 'patient' ? t.fullName : t.contactName}
          name="full_name"
          autoComplete="name"
          required
          value={form.full_name}
          onChange={(e) => set('full_name')(e.target.value)}
          error={errors.full_name}
          maxLength={200}
        />
        <TextField label={t.email} type="email" name="email" autoComplete="email" inputMode="email" required value={form.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} maxLength={254} />
        <PasswordField
          label={t.password}
          name="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          hint={t.passwordHelp}
          error={errors.password}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
          minLength={10}
          maxLength={128}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={role === 'agent' ? t.country : t.countryOptional}
            name="country_code"
            autoComplete="country"
            required={role === 'agent'}
            value={form.country_code}
            onChange={(e) => set('country_code')(e.target.value)}
            options={countries}
            placeholder={t.selectCountry}
            error={errors.country_code}
          />
          <TextField label={t.phone} type="tel" name="phone" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} maxLength={32} />
        </div>
        {role === 'patient' ? (
          <TextField label={t.referralCode} name="referral_code" autoComplete="off" value={form.referral_code} onChange={(e) => set('referral_code')(e.target.value.toUpperCase())} maxLength={32} />
        ) : null}
        {role !== 'patient' ? (
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
            {role === 'agent' ? t.reviewNoteAgent : t.reviewNoteHospital}
          </p>
        ) : null}
        <AgeQuestion
          t={t}
          role={role}
          value={isAdult}
          onChange={(v) => {
            setIsAdult(v);
            if (errors.is_adult) setErrors((cur) => ({ ...cur, is_adult: undefined }));
          }}
          error={errors.is_adult}
        />
        <div>
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              name="accept_terms"
              checked={form.accept_terms}
              onChange={(e) => set('accept_terms')(e.target.checked)}
              aria-invalid={errors.accept_terms ? true : undefined}
              aria-describedby={errors.accept_terms ? 'terms-error' : undefined}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-primary-700"
            />
            <span>{termsLabel}</span>
          </label>
          {errors.accept_terms ? (
            <p id="terms-error" className="mt-1.5 text-sm font-medium text-red-700">
              {errors.accept_terms}
            </p>
          ) : null}
        </div>
        <SubmitButton pending={pending} pendingLabel={t.creating}>
          {t.create}
        </SubmitButton>
      </form>

      {role === 'patient' ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-slate-700">{t.guestHelp}</p>
          <button
            type="button"
            onClick={onGuest}
            disabled={pending}
            className="mt-2 font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-900 disabled:opacity-60"
          >
            {t.continueAsGuest}
          </button>
        </div>
      ) : null}

      <p className="text-center text-sm text-slate-700">
        {t.haveAccount}{' '}
        <Link href={loginHref} className="font-semibold text-primary-700 hover:text-primary-900 hover:underline">
          {t.login}
        </Link>
      </p>
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        {t.secureNote}
      </p>
    </div>
  );
}
