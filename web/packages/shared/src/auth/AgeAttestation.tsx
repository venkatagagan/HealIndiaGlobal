import { useId } from 'react';
import { isApiError } from '../api/client';
import type { RegistrableRole } from '../api/enums';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { Checkbox } from '../ui/form';

/** 18+ attestation answer: `true` = 18 or older, `false` = under 18 (patients only), `null` = not answered yet. */
export type AgeAnswer = boolean | null;

/** 400 `age_attestation_required` from /auth/google|apple: ask the age question and retry with `is_adult`. */
export function isAgeAttestationRequired(error: unknown): boolean {
  return isApiError(error) && error.code === 'age_attestation_required';
}

/** 400 `adult_required` from /auth/google|apple: agent and hospital accounts must be 18 or older. */
export function isAdultRequired(error: unknown): boolean {
  return isApiError(error) && error.code === 'adult_required';
}

/** Only patients may answer "under 18"; other roles must confirm they are adults. */
export function isAgeAnswerValid(role: RegistrableRole, value: AgeAnswer): value is boolean {
  return role === 'patient' ? value !== null : value === true;
}

export interface AgeAttestationProps {
  role: RegistrableRole;
  value: AgeAnswer;
  onChange: (value: AgeAnswer) => void;
  /** e.g. "Please confirm your age" */
  error?: string;
  /** input name (default `is_adult`) */
  name?: string;
  className?: string;
}

/**
 * CG-24 age question for sign-up. Patients choose one of two options ("18 or older" / "under 18 with a parent or
 * guardian's consent"); agents and hospital users tick one required checkbox ("I confirm I am 18 or older.").
 */
export function AgeAttestation({ role, value, onChange, error, name = 'is_adult', className }: AgeAttestationProps) {
  const { t } = useCommonTranslation();
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  if (role !== 'patient') {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <Checkbox
          name={name}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked ? true : null)}
          invalid={Boolean(error)}
          aria-describedby={errorId}
          required
          label={t('register.age.confirmAdult')}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger-ink">
            {error}
          </p>
        )}
      </div>
    );
  }

  const options: { value: boolean; label: string }[] = [
    { value: true, label: t('register.age.adult') },
    { value: false, label: t('register.age.minor') },
  ];
  return (
    <fieldset
      className={cn('flex flex-col gap-2', className)}
      aria-describedby={errorId}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-1 text-sm font-medium text-fg">
        {t('register.age.legend')}
        <span className="ms-0.5 text-danger" aria-hidden>
          *
        </span>
      </legend>
      {options.map((option) => {
        const optionId = `${id}-${option.value ? 'adult' : 'minor'}`;
        return (
          <div key={optionId} className="flex items-start gap-2.5">
            <input
              type="radio"
              id={optionId}
              name={name}
              value={option.value ? 'true' : 'false'}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              required
              className={cn(
                'mt-0.5 size-4 shrink-0 cursor-pointer border-border accent-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              )}
            />
            <label htmlFor={optionId} className="cursor-pointer text-sm font-medium text-fg">
              {option.label}
            </label>
          </div>
        );
      })}
      {value === false && <p className="text-xs text-muted">{t('register.age.minorHint')}</p>}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}
