import { DeleteAccountSection } from '@hig/shared/auth';
import { useAuth } from '../../auth/AuthProvider';
import { useAppTranslation } from '../../i18n';

/**
 * The signed-in user's personal account (not the hospital listing), shown at the bottom of /profile. The website's
 * /account/delete page links here for in-app account deletion.
 */
export function MyAccountSection({ className }: { className?: string }) {
  const { t } = useAppTranslation();
  const { user } = useAuth();
  return (
    <section id="account" aria-labelledby="my-account-title" className={className}>
      <h2 id="my-account-title" className="mb-3 text-lg font-semibold">
        {t('account.title')}
      </h2>
      {user ? (
        <dl className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('account.name')}</dt>
            <dd className="font-medium">{user.full_name}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('account.email')}</dt>
            <dd className="font-medium break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('account.mfa')}</dt>
            <dd className="font-medium">{user.mfa_enabled ? t('account.on') : t('account.off')}</dd>
          </div>
        </dl>
      ) : null}
      <DeleteAccountSection user={user} audience="hospital" />
    </section>
  );
}
