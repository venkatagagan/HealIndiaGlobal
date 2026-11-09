import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { AuthShell } from '@/components/auth/auth-shell';
import { AcceptInviteForm } from '@/components/auth/accept-invite-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({
    path: routes.acceptInvite,
    title: t.auth.metaInvite,
    description: t.auth.inviteSubtitle,
    noindex: true,
    noReferrer: true,
  });
}

export default async function AcceptInvitePage() {
  const t = getDictionary();
  return (
    <AuthShell title={t.auth.inviteTitle} subtitle={t.auth.inviteSubtitle} tagline={t.common.tagline} points={t.home.heroPoints}>
      <AcceptInviteForm
        t={t.auth}
        loginHref={href(routes.login)}
        termsHref={href(routes.terms)}
        privacyHref={href(routes.privacy)}
      />
    </AuthShell>
  );
}
