/**
 * "Organisation suspended": when any API call of an agent or hospital user answers 403 `organisation_suspended`
 * (backend core/deps.py - the agency or hospital account was suspended), the portal switches to one clear
 * full-screen message with a contact-support link instead of failing screen by screen.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { Ban, LifeBuoy, LogOut } from 'lucide-react';
import { isApiError, onApiError } from '../api/client';
import { websiteUrl } from '../auth/doors';
import { useCommonTranslation } from '../lib/i18n';
import { Button, buttonClasses } from './Button';

export const ORGANISATION_SUSPENDED_CODE = 'organisation_suspended';

export function isOrganisationSuspendedError(error: unknown): boolean {
  return isApiError(error) && error.status === 403 && error.code === ORGANISATION_SUSPENDED_CODE;
}

let suspended = false;
const listeners = new Set<() => void>();

function setSuspended(value: boolean) {
  if (suspended === value) return;
  suspended = value;
  for (const listener of listeners) listener();
}

onApiError((error) => {
  if (isOrganisationSuspendedError(error)) setSuspended(true);
});

/** Clears the flag (tests, or after signing in as someone else). */
export function resetOrganisationSuspended(): void {
  setSuspended(false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once the API reported `organisation_suspended` in this page session. */
export function useOrganisationSuspended(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => suspended,
    () => false,
  );
}

/** Contact page of the public website (the support form works signed out too). */
export function supportContactUrl(): string {
  return new URL('/contact', websiteUrl()).toString();
}

export interface OrganisationSuspendedScreenProps {
  /** `agency` (agent portal) or `hospital` (hospital portal) - picks the wording */
  audience: 'agency' | 'hospital';
  onSignOut?: () => void;
}

export function OrganisationSuspendedScreen({ audience, onSignOut }: OrganisationSuspendedScreenProps) {
  const { t } = useCommonTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div role="alert" className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
          <Ban className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-fg">{t(`orgSuspended.${audience}.title`)}</h1>
        <p className="mt-2 text-sm text-muted">{t(`orgSuspended.${audience}.body`)}</p>
        <p className="mt-2 text-sm text-muted">{t('orgSuspended.dataSafe')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={supportContactUrl()} className={buttonClasses('primary', 'md')} target="_blank" rel="noopener noreferrer">
            <LifeBuoy className="size-4" aria-hidden />
            {t('orgSuspended.contactSupport')}
          </a>
          {onSignOut ? (
            <Button variant="outline" onClick={onSignOut} icon={<LogOut className="size-4 rtl:-scale-x-100" aria-hidden />}>
              {t('orgSuspended.signOut')}
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Renders the suspended screen instead of `children` once the API reported the suspension. */
export function OrganisationSuspendedGate({ children, ...screen }: OrganisationSuspendedScreenProps & { children: ReactNode }) {
  const isSuspended = useOrganisationSuspended();
  return isSuspended ? <OrganisationSuspendedScreen {...screen} /> : <>{children}</>;
}
