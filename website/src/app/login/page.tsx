import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.login, title: t.auth.metaLogin, description: t.auth.loginSubtitle, noindex: true });
}

export default async function LoginPage() {
  const t = getDictionary();
  return (
    <AuthShell title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle} tagline={t.common.tagline} points={t.home.heroPoints}>
      <LoginForm
        t={t.auth}
        registerHref={href(routes.register)}
        forgotHref={href(routes.forgotPassword)}
        orLabel={t.common.or}
      />
    </AuthShell>
  );
}
