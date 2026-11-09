import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PartnerPage } from '@/components/partner-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.forHospitals, title: t.forHospitals.metaTitle, description: t.forHospitals.metaDescription });
}

export default async function ForHospitalsPage() {
  const t = getDictionary();
  return (
    <PartnerPage
     
      t={t}
      copy={t.forHospitals}
      role="hospital"
      path={routes.forHospitals}
      navLabel={t.nav.forHospitals}
      art="onboarding-trust"
    />
  );
}
