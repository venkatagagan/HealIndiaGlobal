import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useAppTranslation } from '../../../../i18n';
import { usePatientProfile } from '../../api/queries';
import { GuestBanner } from '../../components/GuestUpgrade';
import { useMe } from '../../lib/session';
import { useDocumentTitle } from '../../lib/shared';
import { EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '../../ui/primitives';
import { DeleteAccountSection } from './DeleteAccountSection';
import { CompanionsSection, ConsentsSection, SecuritySection } from './ProfileExtras';
import { EmergencyForm, PassportForm, PersonalForm, PreferencesForm } from './ProfileForms';

type Tab = 'personal' | 'travel' | 'companions' | 'preferences' | 'privacy' | 'security';
const TAB_VALUES: Tab[] = ['personal', 'travel', 'companions', 'preferences', 'privacy', 'security'];

export function ProfilePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('profile.title'));
  const me = useMe();
  const profile = usePatientProfile();
  const [params, setParams] = useSearchParams();
  const tabs = useMemo(() => TAB_VALUES.map((value) => ({ value, label: t(`profile.tabs.${value}`) })), [t]);
  const tab = (TAB_VALUES.find((v) => v === params.get('tab')) ?? 'personal') as Tab;
  const isGuest = me.data?.is_guest ?? false;

  return (
    <div>
      {isGuest ? <GuestBanner /> : null}
      <PageHeader
        title={t('profile.title')}
        description={me.data?.email ? t('profile.signedInAs', { email: me.data.email }) : t('profile.description')}
      />
      <Tabs
        value={tab}
        onChange={(v) => setParams(v === 'personal' ? {} : { tab: v }, { replace: true })}
        tabs={tabs}
        className="mb-6"
      />
      {profile.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : profile.isError ? (
        <div className="space-y-6">
          <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
          {tab === 'privacy' ? <DeleteAccountSection /> : null}
        </div>
      ) : (
        <div key={profile.data.updated_at ?? profile.data.id}>
          {tab === 'personal' ? <PersonalForm profile={profile.data} /> : null}
          {tab === 'travel' ? (
            <div className="space-y-6">
              <PassportForm profile={profile.data} />
              <EmergencyForm profile={profile.data} />
            </div>
          ) : null}
          {tab === 'companions' ? <CompanionsSection /> : null}
          {tab === 'preferences' ? <PreferencesForm profile={profile.data} /> : null}
          {tab === 'privacy' ? (
            <div className="space-y-6">
              <ConsentsSection />
              <DeleteAccountSection />
            </div>
          ) : null}
          {tab === 'security' ? (
            isGuest ? (
              <EmptyState
                title={t('profile.guestSecurity.title')}
                description={t('profile.guestSecurity.description')}
              />
            ) : (
              <SecuritySection />
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
