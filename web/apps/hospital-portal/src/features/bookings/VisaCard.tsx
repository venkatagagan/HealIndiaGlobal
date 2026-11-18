import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileCheck2, Plane } from 'lucide-react';
import {
  TRAVEL_KIND_LABELS,
  VISA_STATUS_LABELS,
  VISA_TYPE_LABELS,
  documentsApi,
  errorMessage,
  travelApi,
  type TravelBookingOut,
  type TravelKind,
  type VisaRequestOut,
  type VisaStatus,
} from '@hig/shared/api';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  FileButton,
  Select,
  Skeleton,
  StatusBadge,
} from '../../components/ui';
import { DataTable, DateCell, MoneyCell, StatusBadgeCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { formatNumber } from '@hig/shared/lib';
import { formatDateTime } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useAppTranslation } from '../../i18n';
import { InvitationLetterSection, type VisaRequestWithLetter } from './InvitationLetter';

type TFn = ReturnType<typeof useAppTranslation>['t'];

/** Statuses a hospital typically sets; the API enforces what is actually allowed. */
const HOSPITAL_VISA_STATUSES: VisaStatus[] = ['documents_pending', 'invitation_issued'];

function VisaRequestRow({ request, caseId }: { request: VisaRequestOut; caseId: string }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.visa(caseId) });

  const uploadLetter = useMutation({
    mutationFn: async (file: File) => {
      const doc = await documentsApi.upload({ file, kind: 'invitation_letter', case_id: caseId, patient_id: request.patient?.id });
      return travelApi.updateVisaRequest(request.id, {
        invitation_letter_document_id: doc.id,
        status: 'invitation_issued',
      });
    },
    onSuccess: () => {
      toast.success(t('bookings.visa.letterUploaded'));
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setStatus = useMutation({
    mutationFn: (status: VisaStatus) => travelApi.updateVisaRequest(request.id, { status }),
    onSuccess: () => {
      toast.success(t('bookings.visa.statusUpdated'));
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const downloadLetter = async () => {
    if (!request.invitation_letter_document_id) return;
    try {
      const doc = await documentsApi.get(request.invitation_letter_document_id);
      await documentsApi.downloadAndSave(doc);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const options = [...new Set<VisaStatus>([request.status, ...HOSPITAL_VISA_STATUSES])].map((s) => ({
    value: s,
    label: VISA_STATUS_LABELS[s],
    disabled: !HOSPITAL_VISA_STATUSES.includes(s) && s !== request.status,
  }));

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {VISA_TYPE_LABELS[request.visa_type] ?? request.visa_type}
            {request.patient?.full_name ? ` · ${request.patient?.full_name}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            {t('bookings.visa.requested', { date: formatDateTime(request.created_at) })}
            {request.application_reference ? ` · ${t('bookings.visa.reference', { ref: request.application_reference })}` : ''}
          </p>
        </div>
        <StatusBadge status={request.status} label={VISA_STATUS_LABELS[request.status]} />
      </div>
      {request.notes && <p className="text-sm text-slate-600 dark:text-slate-300">{request.notes}</p>}
      <InvitationLetterSection request={request as VisaRequestWithLetter} caseId={caseId} />
      <div className="flex flex-wrap items-center gap-2">
        {request.invitation_letter_document_id ? (
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void downloadLetter()}>
            {t('bookings.visa.invitationLetter')}
          </Button>
        ) : null}
        <FileButton
          variant="ghost"
          loading={uploadLetter.isPending}
          onFile={(file) => uploadLetter.mutate(file)}
          onInvalid={(m) => toast.error(m)}
          accept=".pdf,application/pdf,image/*"
        >
          {request.invitation_letter_document_id ? t('bookings.visa.replaceLetter') : t('bookings.letter.uploadOwn')}
        </FileButton>
        {!['approved', 'rejected', 'applied'].includes(request.status) && (
          <div className="w-52">
            <label htmlFor={`visa-status-${request.id}`} className="sr-only">
              {t('bookings.visa.visaStatus')}
            </label>
            <Select
              id={`visa-status-${request.id}`}
              className="h-8 text-xs"
              value={request.status}
              disabled={setStatus.isPending}
              options={options}
              onChange={(e) => setStatus.mutate(e.target.value as VisaStatus)}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/** e-Medical visa requests for the case: upload the hospital invitation letter and track status. */
export function VisaCard({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  const visas = useQuery({
    queryKey: qk.visa(caseId),
    queryFn: () => travelApi.listVisaRequests({ case_id: caseId, page_size: 20 }),
  });
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-accent-600" aria-hidden /> {t('bookings.visa.title')}
          </span>
        }
        description={t('bookings.visa.description')}
      />
      {visas.isPending ? (
        <div className="p-5">
          <Skeleton className="h-16" />
        </div>
      ) : visas.isError ? (
        <ErrorState error={visas.error} onRetry={() => void visas.refetch()} />
      ) : visas.data.items.length === 0 ? (
        <EmptyState title={t('bookings.visa.emptyTitle')} description={t('bookings.visa.emptyDescription')} className="py-8" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {visas.data.items.map((v) => (
            <VisaRequestRow key={v.id} request={v} caseId={caseId} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function travelLine(tb: TravelBookingOut): string {
  const route = [tb.from_location, tb.to_location].filter(Boolean).join(' → ');
  const flight = [tb.carrier, tb.flight_number].filter(Boolean).join(' ');
  return [route, flight].filter(Boolean).join(' · ') || '—';
}

const kindLabel = (kind: string) =>
  TRAVEL_KIND_LABELS[kind as TravelKind] ?? kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const travelColumns = (t: TFn): DataTableColumn<TravelBookingOut>[] => [
  {
    key: 'kind',
    header: t('bookings.travel.colTravel'),
    mobile: 'primary',
    className: 'max-w-72',
    sortable: true,
    sortValue: (tb) => tb.kind,
    cell: (tb) => <TextCell primary={<span className="font-medium">{kindLabel(tb.kind)}</span>} secondary={travelLine(tb)} />,
  },
  {
    key: 'depart',
    header: t('bookings.travel.colDeparts'),
    sortable: true,
    sortValue: (tb) => tb.depart_at ?? '',
    cell: (tb) => (
      <DateCell
        value={tb.depart_at}
        display="datetime"
        secondary={tb.arrive_at ? t('bookings.travel.arrives', { date: formatDateTime(tb.arrive_at) }) : undefined}
      />
    ),
  },
  {
    key: 'pax',
    header: t('bookings.travel.colPassengers'),
    align: 'end',
    cell: (tb) => (tb.passengers ? <span className="tabular-nums">{formatNumber(tb.passengers)}</span> : <span className="text-muted">—</span>),
  },
  {
    key: 'status',
    header: t('common.status'),
    mobile: 'badge',
    sortable: true,
    cell: (tb) => <StatusBadgeCell status={tb.status} kind="serviceBooking" />,
  },
  {
    key: 'price',
    header: t('bookings.travel.colPrice'),
    align: 'end',
    sortable: true,
    sortValue: (tb) => tb.price_minor ?? -1,
    cell: (tb) => <MoneyCell minor={tb.price_minor} currency={tb.currency} />,
  },
];

/** Read-only flights / pickups so the hospital can plan admission and airport transfer. */
export function TravelCard({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => travelColumns(t), [t]);
  const travel = useQuery({
    queryKey: qk.travel(caseId),
    queryFn: () => travelApi.listTravelBookings({ case_id: caseId, page_size: 50 }),
  });
  return (
    <DataTable
      caption={t('bookings.travel.caption')}
      columns={columns}
      rows={travel.data?.items}
      loading={travel.isPending}
      error={travel.error}
      onRetry={() => void travel.refetch()}
      defaultSort={{ key: 'depart', direction: 'asc' }}
      responsive="cards"
      emptyTitle={t('bookings.travel.emptyTitle')}
      header={
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <Plane className="size-4 text-info-ink" aria-hidden />
          <h2 className="text-base font-semibold text-fg">{t('bookings.travel.title')}</h2>
        </div>
      }
    />
  );
}
