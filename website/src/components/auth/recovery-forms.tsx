'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiPost } from '@/lib/auth-client';
import { fmt } from '@/i18n/format';
import { EMAIL_RE, FormAlert, PasswordField, SubmitButton, TextField, passwordOk } from './fields';
import { authErrorMessage, type AuthLabels } from './shared';
import { useUrlToken } from './url-token';

function TokenLoading() {
  return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-hidden="true" />;
}

// ----------------------------------------------------------------------------------- forgot password
export function ForgotPasswordForm({ t, loginHref }: { t: AuthLabels; loginHref: string }) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setFieldError(t.errors.email);
      return;
    }
    setFieldError(null);
    setPending(true);
    setError(null);
    const res = await apiPost('/auth/forgot-password', { email: value });
    setPending(false);
    // The API always answers 202 for unknown emails (no account enumeration); only transport/rate errors show.
    if (res.ok || (res.status >= 400 && res.status < 429 && res.status !== 422)) setDone(value);
    else setError(authErrorMessage(res, t));
  }

  if (done) {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">{fmt(t.forgotDone, { email: done })}</FormAlert>
        <Link href={loginHref} className="font-semibold text-primary-700 hover:text-primary-900 hover:underline">
          {t.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <TextField
        label={t.email}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError}
      />
      <SubmitButton pending={pending} pendingLabel={t.sending}>
        {t.sendLink}
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href={loginHref} className="font-semibold text-primary-700 hover:text-primary-900 hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </form>
  );
}

// ------------------------------------------------------------------------------------ reset password
export function ResetPasswordForm({ t, loginHref, forgotHref }: { t: AuthLabels; loginHref: string; forgotHref: string }) {
  const token = useUrlToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (token === undefined) return <TokenLoading />;
  if (!token) {
    return (
      <div className="space-y-4">
        <FormAlert>{t.resetMissing}</FormAlert>
        <Link href={forgotHref} className="font-semibold text-primary-700 hover:underline">
          {t.requestNewLink}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">{t.resetDone}</FormAlert>
        <Link
          href={loginHref}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-5 py-3 font-semibold text-brand-deep hover:bg-brand-hover"
        >
          {t.login}
        </Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const errs: typeof errors = {};
    if (!passwordOk(password)) errs.password = t.errors.password;
    if (confirm !== password) errs.confirm = t.errors.mismatch;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    const res = await apiPost('/auth/reset-password', { token, new_password: password });
    setPending(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    if (res.status === 422 && (res.details as unknown[] | null)?.toString().includes('password')) {
      setErrors({ password: t.errors.password });
      return;
    }
    if ([400, 401, 404, 410, 422].includes(res.status)) setInvalid(true);
    else setError(authErrorMessage(res, t));
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {invalid ? (
        <FormAlert>
          {t.resetInvalid}{' '}
          <Link href={forgotHref} className="font-semibold underline underline-offset-2">
            {t.requestNewLink}
          </Link>
        </FormAlert>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <PasswordField
        label={t.newPassword}
        name="new_password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={t.passwordHelp}
        error={errors.password}
        showLabel={t.showPassword}
        hideLabel={t.hidePassword}
        minLength={10}
        maxLength={128}
      />
      <PasswordField
        label={t.confirmPassword}
        name="confirm_password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        showLabel={t.showPassword}
        hideLabel={t.hidePassword}
        maxLength={128}
      />
      <SubmitButton pending={pending} pendingLabel={t.updating}>
        {t.resetButton}
      </SubmitButton>
    </form>
  );
}

// -------------------------------------------------------------------------------------- verify email
/**
 * Verification needs an explicit click: some mail scanners open links automatically, and a token should only
 * be consumed by the person who owns the inbox.
 */
export function VerifyEmailPanel({ t, loginHref }: { t: AuthLabels; loginHref: string }) {
  const token = useUrlToken();
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'invalid' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (token === undefined) return <TokenLoading />;
  if (!token) return <FormAlert>{t.verifyMissing}</FormAlert>;

  async function verify() {
    setState('pending');
    const res = await apiPost('/auth/verify-email', { token });
    if (res.ok) return setState('done');
    if ([400, 401, 404, 410, 422].includes(res.status)) return setState('invalid');
    setError(authErrorMessage(res, t));
    setState('error');
  }

  if (state === 'done') {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">{t.verifyDone}</FormAlert>
        <Link href={loginHref} className="font-semibold text-primary-700 hover:underline">
          {t.login}
        </Link>
      </div>
    );
  }
  if (state === 'invalid') return <FormAlert>{t.verifyInvalid}</FormAlert>;

  return (
    <div className="space-y-4">
      {state === 'error' && error ? <FormAlert>{error}</FormAlert> : null}
      <button
        type="button"
        onClick={verify}
        disabled={state === 'pending'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-brand-deep hover:bg-brand-hover disabled:opacity-70"
      >
        {state === 'pending' ? t.verifying : t.verifyButton}
      </button>
    </div>
  );
}
