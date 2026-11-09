import { useSearchParams } from 'react-router';
import { usePatientProfile } from '../../api/queries';
import { GuestBanner } from '../../components/GuestUpgrade';
import { useMe } from '../../lib/session';
import { useDocumentTitle } from '../../lib/shared';
import { EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '../../ui/primitives';
import { DeleteAccountSection } from './DeleteAccountSection';
import { AccessLogCard, DownloadMyDataCard, NomineeCard, PrivacyRequestsCard } from './PrivacyDataSection';
import { CompanionsSection, ConsentsSection, SecuritySection } from './ProfileExtras';
import { EmergencyForm, PassportForm, PersonalForm, PreferencesForm } from './ProfileForms';

type Tab = 'personal' | 'travel' | 'companions' | 'preferences' | 'privacy' | 'security';
const TABS: { value: Tab; label: string }[] = [
  { value: 'personal', label: 'Personal info' },
  { value: 'travel', label: 'Passport & emergency' },
  { value: 'companions', label: 'Companions' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'privacy', label: 'Privacy & account' },
  { value: 'security', label: 'Security' },
];

export function ProfilePage() {
  useDocumentTitle('Profile');
  const me = useMe();
  const profile = usePatientProfile();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'personal') as Tab;
  const isGuest = me.data?.is_guest ?? false;

  return (
    <div>
      {isGuest ? <GuestBanner /> : null}
      <PageHeader
        title="Profile"
        description={me.data?.email ? `Signed in as ${me.data.email}` : 'Manage your details, travel documents and privacy.'}
      />
      <Tabs
        value={tab}
        onChange={(v) => setParams(v === 'personal' ? {} : { tab: v }, { replace: true })}
        tabs={TABS}
        className="mb-6"
      />
      {profile.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : profile.isError ? (
        <div className="space-y-6">
          <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
          {tab === 'privacy' ? (
            <>
              <DownloadMyDataCard />
              <DeleteAccountSection />
            </>
          ) : null}
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
              <DownloadMyDataCard />
              {isGuest ? null : <NomineeCard />}
              <AccessLogCard />
              <PrivacyRequestsCard />
              <DeleteAccountSection />
            </div>
          ) : null}
          {tab === 'security' ? (
            isGuest ? (
              <EmptyState
                title="Create an account first"
                description="Guest sessions have no password. Create your account to set a password and two-step verification."
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
