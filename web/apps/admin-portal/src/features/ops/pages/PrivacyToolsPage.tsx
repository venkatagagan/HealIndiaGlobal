/**
 * Privacy compliance tools (admin | super_admin; the API enforces it): legal holds on accounts and cases,
 * the personal-data breach register (72-hour notification clock) and the per-patient PHI access log.
 * Tabs are URL-synced (`?tab=holds|breaches|access`). Data-rights requests stay on PrivacyRequestsPage.
 */
import { ShieldAlert } from 'lucide-react';
import { useAppTranslation } from '../../../i18n';
import { AccessLogPanel } from '../components/privacy/AccessLogPanel';
import { BreachRegisterPanel } from '../components/privacy/BreachRegisterPanel';
import { LegalHoldsPanel } from '../components/privacy/LegalHoldsPanel';
import { useDocumentTitle } from '../lib/format';
import { useOpsPermissions } from '../lib/session';
import { Card, EmptyState, LoadingState, PageHeader } from '../ui';
import { DetailTabs, useDetailTab } from '../ui/detail';

const TABS = ['holds', 'breaches', 'access'] as const;
type TabKey = (typeof TABS)[number];

/** Roles the privacy admin endpoints accept (`PrivacyAdmin` in privacy/router.py). */
const PRIVACY_TOOLS_ROLES = ['admin', 'super_admin'] as const;

export default function PrivacyToolsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('privacyTools.title'));
  const { role, user } = useOpsPermissions();
  const [tab, setTab] = useDetailTab<TabKey>(TABS, 'holds');

  if (!user) return <LoadingState />;
  if (!role || !(PRIVACY_TOOLS_ROLES as readonly string[]).includes(role))
    return (
      <Card>
        <EmptyState
          icon={<ShieldAlert className="size-6" />}
          title={t('privacyTools.noAccessTitle')}
          description={t('privacyTools.noAccessDescription')}
        />
      </Card>
    );

  return (
    <div>
      <PageHeader title={t('privacyTools.title')} description={t('privacyTools.description')} />
      <DetailTabs
        label={t('privacyTools.tabsLabel')}
        value={tab}
        onChange={setTab}
        tabs={TABS.map((key) => ({ value: key, label: t(`privacyTools.tabs.${key}`) }))}
      />
      {tab === 'holds' && <LegalHoldsPanel />}
      {tab === 'breaches' && <BreachRegisterPanel />}
      {tab === 'access' && <AccessLogPanel />}
    </div>
  );
}
