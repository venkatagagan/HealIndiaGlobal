import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.forgotPassword, title: t.auth.metaForgot, description: t.auth.forgotSubtitle, noindex: true });
}

export default async function ForgotPasswordPage() {
  const t = getDictionary();
  return (
    <AuthShell title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle} tagline={t.common.tagline} points={t.home.heroPoints}>
      <ForgotPasswordForm t={t.auth} loginHref={href(routes.login)} />
    </AuthShell>
  );
}
