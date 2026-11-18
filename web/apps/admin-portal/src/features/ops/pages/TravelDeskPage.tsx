import { useSearchParams } from 'react-router';
import { useDocumentTitle } from '@hig/shared/lib';
import { PageHeader } from '@hig/shared/ui';
import { Tabs } from '../ui';
import { SosPanel, useOpenSosCount } from '../components/travel/SosPanel';
import { VisaPanel } from '../components/travel/VisaPanel';
import { AccommodationPanel, ServiceBookingsPanel, TravelBookingsPanel } from '../components/travel/BookingsPanels';
import { useOpsPermissions } from '../lib/session';
import { useAppTranslation } from '../../../i18n';

const TABS = ['sos', 'visa', 'travel', 'accommodation', 'services'] as const;
type TabKey = (typeof TABS)[number];

export default function TravelDeskPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('travel.desk.title'));
  const perms = useOpsPermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'sos';
  const openSos = useOpenSosCount();
  const canManage = perms.manageTravel;

  return (
    <div>
      <PageHeader title={t('travel.desk.title')} description={t('travel.desk.description')} />
      <Tabs
        tabs={[
          { key: 'sos', label: t('travel.desk.tabs.sos'), count: openSos.data ?? null, highlight: true },
          { key: 'visa', label: t('travel.desk.tabs.visa') },
          { key: 'travel', label: t('travel.desk.tabs.travel') },
          { key: 'accommodation', label: t('travel.desk.tabs.accommodation') },
          { key: 'services', label: t('travel.desk.tabs.services') },
        ]}
        value={tab}
        // switching section starts with clean filters (each list keeps its own URL state)
        onChange={(k) => setParams(k === 'sos' ? {} : { tab: k }, { replace: true })}
      />
      {!canManage && <p className="mb-3 text-xs text-muted">{t('travel.desk.readOnly')}</p>}
      {tab === 'sos' && <SosPanel canManage={canManage} />}
      {tab === 'visa' && <VisaPanel canManage={canManage} />}
      {tab === 'travel' && <TravelBookingsPanel canManage={canManage} />}
      {tab === 'accommodation' && <AccommodationPanel canManage={canManage} />}
      {tab === 'services' && <ServiceBookingsPanel canManage={canManage} />}
    </div>
  );
}
