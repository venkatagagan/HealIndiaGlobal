import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyEmailPanel } from '@/components/auth/recovery-forms';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.verifyEmail, title: t.auth.metaVerify, description: t.auth.verifyIntro, noindex: true, noReferrer: true });
}

export default async function VerifyEmailPage() {
  const t = getDictionary();
  return (
    <AuthShell title={t.auth.verifyTitle} subtitle={t.auth.verifyIntro} tagline={t.common.tagline} points={t.home.heroPoints}>
      <VerifyEmailPanel t={t.auth} loginHref={href(routes.login)} />
    </AuthShell>
  );
}
