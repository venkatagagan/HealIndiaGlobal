'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiPost, destinationFor, isPortalRole, rememberSession, type TokenOut } from '@/lib/auth-client';
import { FormAlert, PasswordField, SubmitButton, TextField, passwordOk } from './fields';
import { authErrorMessage, invalidFields, type AuthLabels } from './shared';
import { useUrlToken } from './url-token';

type Errors = Partial<Record<'full_name' | 'password' | 'confirm' | 'accept_terms', string>>;

/**
 * Team invitations (agent-managed patients, hospital members): the email links to `/accept-invite#token=...`.
 * The invitee chooses a password (and optionally corrects their name) and accepts the terms and privacy policy;
 * `POST /api/v1/auth/accept-invite` activates the account, sets the refresh cookie and returns the session, and we
 * send the user to their portal by role. Partner agreements are accepted by the organisation's owner at sign-up,
 * so the API does not ask invitees for them.
 */
export function AcceptInviteForm({
  t,
  loginHref,
  termsHref,
  privacyHref,
}: {
  t: AuthLabels;
  loginHref: string;
  termsHref: string;
  privacyHref: string;
}) {
  const token = useUrlToken();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'form' | 'invalid' | 'accepted' | 'noPortal' | 'redirecting'>('form');
  const [pending, setPending] = useState(false);

  if (token === undefined) return <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-hidden="true" />;
  if (!token) return <FormAlert>{t.inviteMissing}</FormAlert>;
  if (state === 'invalid') return <FormAlert>{t.inviteInvalid}</FormAlert>;
  if (state === 'redirecting') return <FormAlert tone="success">{t.redirecting}</FormAlert>;
  if (state === 'accepted' || state === 'noPortal') {
    return (
      <div className="space-y-6">
        <FormAlert tone="info">{state === 'accepted' ? t.inviteAccepted : t.inviteNoPortal}</FormAlert>
        <Link href={loginHref} className="font-semibold text-primary-700 hover:underline">
          {t.login}
        </Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const errs: Errors = {};
    if (!passwordOk(password)) errs.password = t.errors.password;
    if (confirm !== password) errs.confirm = t.errors.mismatch;
    if (!accept) errs.accept_terms = t.errors.terms;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    const name = fullName.trim();
    const res = await apiPost<TokenOut>('/auth/accept-invite', {
      token,
      password,
      ...(name ? { full_name: name } : {}),
      accept_terms: true,
    });
    setPending(false);
    if (res.ok) {
      const role = res.data?.user?.role;
      const dest = isPortalRole(role) ? destinationFor(role, null) : null;
      if (!dest || !isPortalRole(role)) {
        setState('noPortal');
        return;
      }
      rememberSession(role);
      setState('redirecting');
      window.location.assign(dest);
      return;
    }
    if (res.status === 409) {
      setState('accepted');
      return;
    }
    if (res.status === 422) {
      const fields = invalidFields(res.details);
      if (fields.includes('password') || res.code === 'weak_password') {
        setErrors({ password: t.errors.password });
        return;
      }
      if (fields.includes('full_name')) {
        setErrors({ full_name: t.errors.required });
        return;
      }
    }
    if ([400, 401, 404, 410, 422].includes(res.status)) {
      setState('invalid');
      return;
    }
    setError(authErrorMessage(res, t));
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
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <TextField
        label={t.fullName}
        name="full_name"
        autoComplete="name"
        maxLength={200}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        hint={t.inviteNameHint}
        error={errors.full_name}
      />
      <PasswordField
        label={t.choosePassword}
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
      <div>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            name="accept_terms"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            aria-invalid={errors.accept_terms ? true : undefined}
            aria-describedby={errors.accept_terms ? 'invite-terms-error' : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-primary-700"
          />
          <span>{termsLabel}</span>
        </label>
        {errors.accept_terms ? (
          <p id="invite-terms-error" className="mt-1.5 text-sm font-medium text-red-700">
            {errors.accept_terms}
          </p>
        ) : null}
      </div>
      <SubmitButton pending={pending} pendingLabel={t.inviteActivating}>
        {t.inviteButton}
      </SubmitButton>
    </form>
  );
}
