'use client';

import { useId, useState, type FormEvent } from 'react';
import type { PortalRole } from '@/config/site';
import { FormAlert, SubmitButton } from './fields';
import type { AuthLabels } from './shared';

/** 400 codes from POST /auth/google (and /auth/apple) about the 18+ attestation. */
export const AGE_ATTESTATION_REQUIRED = 'age_attestation_required';
export const ADULT_REQUIRED = 'adult_required';

/** 18+ attestation: `true` = 18 or older, `false` = under 18 with guardian consent (patients only), `null` = unanswered. */
export type AgeAnswer = boolean | null;

/** Patients may answer either option; agents and hospital users must confirm they are 18 or older. */
export function ageAnswerValid(role: PortalRole, value: AgeAnswer): value is boolean {
  return role === 'patient' ? value !== null : value === true;
}

/**
 * CG-24 age question at sign-up. Patients choose one of two options; agents and hospital users tick one required
 * checkbox ("I confirm I am 18 or older."). The answer is sent as `is_adult`.
 */
export function AgeQuestion({
  t,
  role,
  value,
  onChange,
  error,
}: {
  t: AuthLabels;
  role: PortalRole;
  value: AgeAnswer;
  onChange: (value: AgeAnswer) => void;
  error?: string | null;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const errorText = error ? (
    <p id={errorId} className="mt-1.5 text-sm font-medium text-red-700">
      {error}
    </p>
  ) : null;

  if (role !== 'patient') {
    return (
      <div>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            name="is_adult"
            required
            checked={value === true}
            onChange={(e) => onChange(e.target.checked ? true : null)}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-primary-700"
          />
          <span>{t.age.confirmAdult}</span>
        </label>
        {errorText}
      </div>
    );
  }

  const options = [
    { answer: true, label: t.age.adult, key: 'adult' },
    { answer: false, label: t.age.minor, key: 'minor' },
  ] as const;
  return (
    <fieldset aria-describedby={errorId} aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-sm font-medium text-slate-800">
        {t.age.legend}
        <span className="ms-0.5 text-red-700" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.key} className="flex items-start gap-3 text-sm text-slate-800">
            <input
              type="radio"
              name={`${id}-is-adult`}
              value={o.answer ? 'true' : 'false'}
              required
              checked={value === o.answer}
              onChange={() => onChange(o.answer)}
              className="mt-0.5 h-5 w-5 shrink-0 border-slate-400 accent-primary-700"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {value === false ? <p className="mt-1.5 text-sm text-slate-600">{t.age.minorHint}</p> : null}
      {errorText}
    </fieldset>
  );
}

/**
 * Shown when Google sign-in would create a new account and the API answered 400 `age_attestation_required`:
 * asks the age question, then the caller retries the same `/auth/google` call with `is_adult`.
 */
export function GoogleAgePrompt({
  t,
  role,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  t: AuthLabels;
  role: PortalRole;
  pending: boolean;
  error?: string | null;
  onSubmit: (isAdult: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<AgeAnswer>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!ageAnswerValid(role, value)) {
      setFieldError(t.errors.age);
      return;
    }
    setFieldError(null);
    onSubmit(value);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-primary-200 bg-primary-50/60 p-4">
      <p className="text-sm font-medium text-slate-900">{t.age.googlePrompt}</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <AgeQuestion
        t={t}
        role={role}
        value={value}
        onChange={(v) => {
          setValue(v);
          setFieldError(null);
        }}
        error={fieldError}
      />
      <SubmitButton pending={pending} pendingLabel={t.redirecting}>
        {t.age.continue}
      </SubmitButton>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="w-full text-center text-sm font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-900 disabled:opacity-60"
      >
        {t.age.cancel}
      </button>
    </form>
  );
}
