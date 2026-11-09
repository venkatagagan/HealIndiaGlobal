import { useSearchParams } from 'react-router';
import { useDocumentTitle } from '@hig/shared/lib';
import { PageHeader } from '@hig/shared/ui';
import { Tabs } from '../ui';
import { SosPanel, useOpenSosCount } from '../components/travel/SosPanel';
import { VisaPanel } from '../components/travel/VisaPanel';
import { AccommodationPanel, ServiceBookingsPanel, TravelBookingsPanel } from '../components/travel/BookingsPanels';
import { useOpsPermissions } from '../lib/session';

const TABS = ['sos', 'visa', 'travel', 'accommodation', 'services'] as const;
type TabKey = (typeof TABS)[number];

export default function TravelDeskPage() {
  useDocumentTitle('Travel desk');
  const perms = useOpsPermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'sos';
  const openSos = useOpenSosCount();
  const canManage = perms.manageTravel;

  return (
    <div>
      <PageHeader
        title="Travel desk"
        description="SOS alerts, medical visas, flights, airport transfers, stays and in-country services. Patient requests start as Requested."
      />
      <Tabs
        tabs={[
          { key: 'sos', label: 'SOS alerts', count: openSos.data ?? null, highlight: true },
          { key: 'visa', label: 'Visa' },
          { key: 'travel', label: 'Flights & transfers' },
          { key: 'accommodation', label: 'Accommodation' },
          { key: 'services', label: 'Translators & services' },
        ]}
        value={tab}
        // switching section starts with clean filters (each list keeps its own URL state)
        onChange={(k) => setParams(k === 'sos' ? {} : { tab: k }, { replace: true })}
      />
      {!canManage && <p className="mb-3 text-xs text-muted">Read-only: travel updates are handled by operations and support staff.</p>}
      {tab === 'sos' && <SosPanel canManage={canManage} />}
      {tab === 'visa' && <VisaPanel canManage={canManage} />}
      {tab === 'travel' && <TravelBookingsPanel canManage={canManage} />}
      {tab === 'accommodation' && <AccommodationPanel canManage={canManage} />}
      {tab === 'services' && <ServiceBookingsPanel canManage={canManage} />}
    </div>
  );
}
