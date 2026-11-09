import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileCheck2, Plane } from 'lucide-react';
import {
  VISA_STATUS_LABELS,
  VISA_TYPE_LABELS,
  documentsApi,
  errorMessage,
  travelApi,
  type TravelBookingOut,
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
import { formatDateTime } from '../../lib/format';
import { qk } from '../../lib/queries';

/** Statuses a hospital typically sets; the API enforces what is actually allowed. */
const HOSPITAL_VISA_STATUSES: VisaStatus[] = ['documents_pending', 'invitation_issued'];

function VisaRequestRow({ request, caseId }: { request: VisaRequestOut; caseId: string }) {
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
      toast.success('Invitation letter uploaded and shared with the patient');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setStatus = useMutation({
    mutationFn: (status: VisaStatus) => travelApi.updateVisaRequest(request.id, { status }),
    onSuccess: () => {
      toast.success('Visa status updated');
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
            Requested {formatDateTime(request.created_at)}
            {request.application_reference ? ` · Ref ${request.application_reference}` : ''}
          </p>
        </div>
        <StatusBadge status={request.status} label={VISA_STATUS_LABELS[request.status]} />
      </div>
      {request.notes && <p className="text-sm text-slate-600 dark:text-slate-300">{request.notes}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {request.invitation_letter_document_id ? (
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void downloadLetter()}>
            Invitation letter
          </Button>
        ) : null}
        <FileButton
          variant={request.invitation_letter_document_id ? 'ghost' : 'primary'}
          loading={uploadLetter.isPending}
          onFile={(file) => uploadLetter.mutate(file)}
          onInvalid={(m) => toast.error(m)}
          accept=".pdf,application/pdf,image/*"
        >
          {request.invitation_letter_document_id ? 'Replace letter' : 'Upload invitation letter'}
        </FileButton>
        {!['approved', 'rejected', 'applied'].includes(request.status) && (
          <div className="w-52">
            <label htmlFor={`visa-status-${request.id}`} className="sr-only">
              Visa status
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
  const visas = useQuery({
    queryKey: qk.visa(caseId),
    queryFn: () => travelApi.listVisaRequests({ case_id: caseId, page_size: 20 }),
  });
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-accent-600" aria-hidden /> Visa invitation
          </span>
        }
        description="Indian e-Medical visas need an invitation letter from the treating hospital."
      />
      {visas.isPending ? (
        <div className="p-5">
          <Skeleton className="h-16" />
        </div>
      ) : visas.isError ? (
        <ErrorState error={visas.error} onRetry={() => void visas.refetch()} />
      ) : visas.data.items.length === 0 ? (
        <EmptyState title="No visa request yet" description="The patient has not requested visa assistance for this case." className="py-8" />
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

function travelLine(t: TravelBookingOut): string {
  const route = [t.from_location, t.to_location].filter(Boolean).join(' → ');
  const flight = [t.carrier, t.flight_number].filter(Boolean).join(' ');
  return [route, flight].filter(Boolean).join(' · ') || '—';
}

const kindLabel = (kind: string) => kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const TRAVEL_COLUMNS: DataTableColumn<TravelBookingOut>[] = [
  {
    key: 'kind',
    header: 'Travel',
    mobile: 'primary',
    className: 'max-w-72',
    sortable: true,
    sortValue: (t) => t.kind,
    cell: (t) => <TextCell primary={<span className="font-medium">{kindLabel(t.kind)}</span>} secondary={travelLine(t)} />,
  },
  {
    key: 'depart',
    header: 'Departs',
    sortable: true,
    sortValue: (t) => t.depart_at ?? '',
    cell: (t) => <DateCell value={t.depart_at} display="datetime" secondary={t.arrive_at ? `Arrives ${formatDateTime(t.arrive_at)}` : undefined} />,
  },
  {
    key: 'pax',
    header: 'Passengers',
    align: 'end',
    cell: (t) => (t.passengers ? <span className="tabular-nums">{t.passengers}</span> : <span className="text-muted">—</span>),
  },
  { key: 'status', header: 'Status', mobile: 'badge', sortable: true, cell: (t) => <StatusBadgeCell status={t.status} kind="serviceBooking" /> },
  {
    key: 'price',
    header: 'Price',
    align: 'end',
    sortable: true,
    sortValue: (t) => t.price_minor ?? -1,
    cell: (t) => <MoneyCell minor={t.price_minor} currency={t.currency} />,
  },
];

/** Read-only flights / pickups so the hospital can plan admission and airport transfer. */
export function TravelCard({ caseId }: { caseId: string }) {
  const travel = useQuery({
    queryKey: qk.travel(caseId),
    queryFn: () => travelApi.listTravelBookings({ case_id: caseId, page_size: 50 }),
  });
  return (
    <DataTable
      caption="Travel and transfers"
      columns={TRAVEL_COLUMNS}
      rows={travel.data?.items}
      loading={travel.isPending}
      error={travel.error}
      onRetry={() => void travel.refetch()}
      defaultSort={{ key: 'depart', direction: 'asc' }}
      responsive="cards"
      emptyTitle="No travel booked yet"
      header={
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <Plane className="size-4 text-info-ink" aria-hidden />
          <h2 className="text-base font-semibold text-fg">Travel &amp; transfers</h2>
        </div>
      }
    />
  );
}
