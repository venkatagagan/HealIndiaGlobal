import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.resetPassword, title: t.auth.metaReset, description: t.auth.resetTitle, noindex: true, noReferrer: true });
}

export default async function ResetPasswordPage() {
  const t = getDictionary();
  return (
    <AuthShell title={t.auth.resetTitle} tagline={t.common.tagline} points={t.home.heroPoints}>
      <ResetPasswordForm t={t.auth} loginHref={href(routes.login)} forgotHref={href(routes.forgotPassword)} />
    </AuthShell>
  );
}
