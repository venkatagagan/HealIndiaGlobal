'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LayoutDashboard, LockKeyhole } from 'lucide-react';
import {
  apiPost,
  checkSession,
  destinationFor,
  isPortalRole,
  rememberSession,
  type TokenOut,
} from '@/lib/auth-client';
import { assessmentUrl, PORTALS, type PortalRole } from '@/config/site';
import { ADULT_REQUIRED, AGE_ATTESTATION_REQUIRED, GoogleAgePrompt } from './age-question';
import { EMAIL_RE, FormAlert, PasswordField, SubmitButton, TextField } from './fields';
import { GoogleButton, googleEnabled } from './google-button';
import { authErrorMessage, type AuthLabels } from './shared';

export function LoginForm({
  t,
  registerHref,
  forgotHref,
  orLabel,
}: {
  t: AuthLabels;
  registerHref: string;
  forgotHref: string;
  orLabel: string;
}) {
  const params = useSearchParams();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; otp?: string }>({});
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [existing, setExisting] = useState<PortalRole | null>(null);
  /** Google ID token waiting for the 18+ answer (first Google sign-in creates a patient account) */
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Keep anything typed (slow connection) or autofilled (password managers) before the page hydrated: the inputs
  // already hold it, the state does not.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const typedEmail = String(data.get('email') ?? '');
    const typedPassword = String(data.get('password') ?? '');
    if (typedEmail) setEmail((value) => value || typedEmail);
    if (typedPassword) setPassword((value) => value || typedPassword);
  }, []);

  useEffect(() => {
    let alive = true;
    checkSession(true).then((role) => {
      if (alive) setExisting(role);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (mfa) otpRef.current?.focus();
  }, [mfa]);

  function go(res: TokenOut, fallbackDest?: string) {
    const role = res.user?.role;
    const dest = isPortalRole(role) ? (fallbackDest && !next ? fallbackDest : destinationFor(role, next)) : null;
    if (!dest || !isPortalRole(role)) {
      setError(t.invalidCredentials);
      setPending(false);
      return;
    }
    rememberSession(role);
    setRedirecting(true);
    window.location.assign(dest);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    // the inputs are the source of truth (autofill does not always fire change events)
    const data = new FormData(e.currentTarget);
    const emailValue = (email || String(data.get('email') ?? '')).trim();
    const passwordValue = password || String(data.get('password') ?? '');
    if (emailValue !== email) setEmail(emailValue);
    if (passwordValue !== password) setPassword(passwordValue);
    const errs: typeof fieldErrors = {};
    if (!EMAIL_RE.test(emailValue)) errs.email = t.errors.email;
    if (!passwordValue) errs.password = t.errors.required;
    if (mfa && !/^\d{6}$/.test(otp.trim())) errs.otp = t.otpInvalid;
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setPending(true);
    setError(null);
    const res = await apiPost<TokenOut>('/auth/login', {
      email: emailValue,
      password: passwordValue,
      ...(mfa ? { otp_code: otp.trim() } : {}),
    });
    if (res.ok) return go(res.data);
    setPending(false);
    if (res.status === 401 && res.code === 'mfa_required') {
      setMfa(true);
      setError(null);
      return;
    }
    setError(authErrorMessage(res, t));
  }

  /**
   * Google sign-in. When it would create a new account the API asks for the 18+ attestation first
   * (400 `age_attestation_required`): show the age question and retry the same call with `is_adult`.
   */
  async function onGoogle(idToken: string, isAdult?: boolean) {
    setPending(true);
    setError(null);
    setGoogleError(null);
    const res = await apiPost<TokenOut>('/auth/google', {
      id_token: idToken,
      ...(isAdult !== undefined ? { is_adult: isAdult } : {}),
    });
    if (res.ok) return go(res.data);
    setPending(false);
    if (res.status === 400 && res.code === AGE_ATTESTATION_REQUIRED) {
      setGoogleToken(idToken);
      return;
    }
    const message =
      res.status === 400 && res.code === ADULT_REQUIRED
        ? t.errors.adultRequired
        : res.status === 401
          ? t.googleError
          : authErrorMessage(res, t);
    if (isAdult !== undefined) setGoogleError(message);
    else setError(message);
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

  return (
    <div className="space-y-6">
      {existing ? (
        <FormAlert tone="info">
          <p>{t.alreadySignedIn}</p>
          <a
            href={destinationFor(existing, next) ?? PORTALS[existing]}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary-800 underline underline-offset-4"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            {t.goToPortal}
          </a>
        </FormAlert>
      ) : null}

      <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <TextField
          label={t.email}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={mfa}
        />
        <PasswordField
          label={t.password}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          showLabel={t.showPassword}
          hideLabel={t.hidePassword}
          disabled={mfa}
        />
        {mfa ? (
          <TextField
            ref={otpRef}
            label={t.otp}
            name="otp_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            hint={t.otpHelp}
            error={fieldErrors.otp}
          />
        ) : null}
        <div className="flex justify-end">
          <Link href={forgotHref} className="text-sm font-medium text-primary-700 hover:text-primary-900 hover:underline">
            {t.forgot}
          </Link>
        </div>
        <SubmitButton pending={pending} pendingLabel={t.loggingIn}>
          {t.login}
        </SubmitButton>
      </form>

      {googleEnabled ? (
        <div className="space-y-4">
          <Divider label={orLabel} />
          {googleToken ? (
            <GoogleAgePrompt
              t={t}
              role="patient"
              pending={pending}
              error={googleError}
              onSubmit={(isAdult) => void onGoogle(googleToken, isAdult)}
              onCancel={() => {
                setGoogleToken(null);
                setGoogleError(null);
              }}
            />
          ) : (
            <GoogleButton text="signin_with" onCredential={(idToken) => void onGoogle(idToken)} onError={() => setError(t.googleError)} />
          )}
        </div>
      ) : null}

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

      <p className="text-center text-sm text-slate-700">
        {t.noAccount}{' '}
        <Link href={registerHref} className="font-semibold text-primary-700 hover:text-primary-900 hover:underline">
          {t.createAccount}
        </Link>
      </p>
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        {t.secureNote}
      </p>
    </div>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
      <span className="h-px flex-1 bg-slate-200" />
      {label}
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
