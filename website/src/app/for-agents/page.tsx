import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PartnerPage } from '@/components/partner-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.forAgents, title: t.forAgents.metaTitle, description: t.forAgents.metaDescription });
}

export default async function ForAgentsPage() {
  const t = getDictionary();
  return (
    <PartnerPage
     
      t={t}
      copy={t.forAgents}
      role="agent"
      path={routes.forAgents}
      navLabel={t.nav.forAgents}
      art="onboarding-welcome"
    />
  );
}
