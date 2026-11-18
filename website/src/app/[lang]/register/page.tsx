import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';
import { intlLocale } from '@/i18n/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return pageMetadata({ path: routes.register, title: t.auth.metaRegister, description: t.auth.registerSubtitle, noindex: true });
}

export default async function RegisterPage() {
  const t = await getDictionary();
  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle} tagline={t.common.tagline} points={t.home.heroPoints}>
      <RegisterForm
        t={t.auth}
        referralT={t.referral}
        intlLocale={intlLocale()}
        loginHref={href(routes.login)}
        termsHref={href(routes.terms)}
        privacyHref={href(routes.privacy)}
        orLabel={t.common.or}
      />
    </AuthShell>
  );
}
