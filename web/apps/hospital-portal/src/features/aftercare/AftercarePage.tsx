import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, Video } from 'lucide-react';
import { casesApi } from '@hig/shared/api';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '../../components/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { useAppTranslation } from '../../i18n';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  aftercareKeys,
  CheckinItem,
  ConsultationItem,
  fetchCheckins,
  sortCheckins,
  sortConsultations,
  useConsultations,
  type Checkin,
} from './aftercare';

type CallTab = 'toSchedule' | 'upcoming' | 'past';
type CheckinTab = 'flagged' | 'answered' | 'awaiting';

/** Cases whose check-ins are shown: recently treated / in treatment at the selected hospital. */
const AFTERCARE_CASES = 50;

export function AftercarePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('aftercare.title'));
  const { current } = useHospital();
  const [callTab, setCallTab] = useState<CallTab>('toSchedule');
  const [checkinTab, setCheckinTab] = useState<CheckinTab>('flagged');

  const consultations = useConsultations();
  const calls = useMemo(() => sortConsultations(consultations.data ?? []), [consultations.data]);
  const callGroups = {
    toSchedule: calls.filter((c) => c.status === 'requested'),
    upcoming: calls.filter((c) => c.status === 'scheduled'),
    past: calls.filter((c) => c.status === 'completed' || c.status === 'cancelled'),
  };

  const cases = useQuery({
    queryKey: ['cases', 'aftercare', current?.id],
    queryFn: () =>
      casesApi.list({ hospital_id: current?.id, status: ['completed', 'in_treatment'], sort: '-updated_at', page: 1, page_size: AFTERCARE_CASES }),
  });
  const patientOf = useMemo(() => new Map((cases.data?.items ?? []).map((c) => [c.id, c.patient.full_name])), [cases.data]);
  const checkinQueries = useQueries({
    queries: (cases.data?.items ?? []).map((c) => ({ queryKey: aftercareKeys.checkins(c.id), queryFn: () => fetchCheckins(c.id) })),
  });
  const checkinsLoading = cases.isPending || checkinQueries.some((q) => q.isPending);
  const checkinError = cases.error ?? checkinQueries.find((q) => q.error)?.error ?? null;
  const allCheckins = sortCheckins(checkinQueries.flatMap((q) => (q.data ?? []) as Checkin[]));
  const checkinGroups = {
    flagged: allCheckins.filter((c) => c.submitted_at && c.red_flags.length > 0),
    answered: allCheckins.filter((c) => c.submitted_at),
    awaiting: allCheckins.filter((c) => !c.submitted_at && c.is_due),
  };
  const shownCheckins = checkinGroups[checkinTab];
  const shownCalls = callGroups[callTab];

  return (
    <>
      <PageHeader title={t('aftercare.title')} description={t('aftercare.description')} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-danger-ink" aria-hidden /> {t('aftercare.checkins.title')}
              </span>
            }
            description={t('aftercare.checkins.description')}
          />
          <Tabs
            className="px-3"
            value={checkinTab}
            onChange={setCheckinTab}
            tabs={[
              { value: 'flagged' as const, label: t('aftercare.checkins.tabFlagged'), count: checkinsLoading ? undefined : checkinGroups.flagged.length },
              { value: 'answered' as const, label: t('aftercare.checkins.tabAnswered'), count: checkinsLoading ? undefined : checkinGroups.answered.length },
              { value: 'awaiting' as const, label: t('aftercare.checkins.tabAwaiting'), count: checkinsLoading ? undefined : checkinGroups.awaiting.length },
            ]}
          />
          {checkinsLoading ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : checkinError ? (
            <ErrorState error={checkinError} onRetry={() => void cases.refetch()} />
          ) : shownCheckins.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="size-6" aria-hidden />}
              title={checkinTab === 'flagged' ? t('aftercare.checkins.emptyFlagged') : t('aftercare.checkins.empty')}
              description={t('aftercare.checkins.emptyDescription')}
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-border">
              {shownCheckins.map((c) => (
                <CheckinItem key={c.id} checkin={c} patientName={patientOf.get(c.case_id)} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Video className="size-4 text-info-ink" aria-hidden /> {t('aftercare.consultations.title')}
              </span>
            }
            description={t('aftercare.consultations.description')}
          />
          <Tabs
            className="px-3"
            value={callTab}
            onChange={setCallTab}
            tabs={[
              { value: 'toSchedule' as const, label: t('aftercare.consultations.tabToSchedule'), count: consultations.isPending ? undefined : callGroups.toSchedule.length },
              { value: 'upcoming' as const, label: t('aftercare.consultations.tabUpcoming'), count: consultations.isPending ? undefined : callGroups.upcoming.length },
              { value: 'past' as const, label: t('aftercare.consultations.tabPast'), count: consultations.isPending ? undefined : callGroups.past.length },
            ]}
          />
          {consultations.isPending ? (
            <div className="p-5">
              <Skeleton className="h-24" />
            </div>
          ) : consultations.isError ? (
            <ErrorState error={consultations.error} onRetry={() => void consultations.refetch()} />
          ) : shownCalls.length === 0 ? (
            <EmptyState title={t('aftercare.consultations.empty')} description={t('aftercare.consultations.emptyDescription')} className="py-8" />
          ) : (
            <ul className="divide-y divide-border">
              {shownCalls.map((c) => (
                <ConsultationItem key={c.id} item={c} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
