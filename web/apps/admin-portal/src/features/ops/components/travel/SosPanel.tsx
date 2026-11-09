import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Hand, MapPin, Phone, Siren } from 'lucide-react';
import { SOS_STATUSES, SOS_STATUS_LABELS, travelApi, type SosAlertOut, type SosStatus } from '@hig/shared/api';
import { DateCell, StatusBadgeCell, type DataTableColumn } from '@hig/shared/ui';
import { Button } from '../../ui';
import { opsKeys, useOpsMutation } from '../../lib/mutations';
import { PatientCaseCell, TravelListPanel } from './TravelListPanel';

export function SosPanel({ canManage }: { canManage: boolean }) {
  const update = useOpsMutation({
    mutationFn: (v: { id: string; status: SosStatus }) => travelApi.updateSos(v.id, { status: v.status }),
    success: (r) => (r.status === 'resolved' ? 'SOS alert resolved' : 'SOS alert acknowledged'),
    invalidate: [opsKeys.sos, opsKeys.travel, opsKeys.dashboard],
  });

  const columns: DataTableColumn<SosAlertOut>[] = [
    {
      key: 'when',
      header: 'Raised',
      sticky: true,
      mobile: 'secondary',
      cell: (s) => (
        <span className="flex items-start gap-1.5">
          {s.status === 'open' && <Siren className="mt-0.5 size-4 shrink-0 animate-pulse text-danger" aria-label="Open" />}
          <DateCell value={s.created_at} display="relative" secondary={<DateCell value={s.created_at} display="datetime" />} className="font-medium" />
        </span>
      ),
      exportValue: (s) => s.created_at,
    },
    {
      key: 'patient',
      header: 'Patient',
      mobile: 'primary',
      className: 'max-w-56',
      cell: (s) => (
        <span className="block min-w-0">
          <PatientCaseCell name={s.patient?.full_name ?? 'Patient'} caseId={s.case_id} caseNumber={s.case_number} />
          {s.patient_phone && (
            <a href={`tel:${s.patient_phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary-ink hover:underline">
              <Phone className="size-3" aria-hidden /> {s.patient_phone}
            </a>
          )}
        </span>
      ),
      exportValue: (s) => s.patient?.full_name ?? '',
    },
    {
      key: 'message',
      header: 'Message',
      className: 'max-w-xs',
      cell: (s) => <p className="line-clamp-3 whitespace-pre-line text-sm">{s.message || <span className="text-muted">No message</span>}</p>,
      exportValue: (s) => s.message ?? '',
    },
    {
      key: 'location',
      header: 'Location',
      cell: (s) =>
        s.lat != null && s.lng != null ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary-ink hover:underline"
          >
            <MapPin className="size-3" aria-hidden /> {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (s) => (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : ''),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (s) => (
        <span className="flex flex-col items-start gap-0.5">
          <StatusBadgeCell status={s.status} kind="sos" />
          {s.acknowledged_by?.full_name && <span className="text-xs text-muted">by {s.acknowledged_by.full_name}</span>}
        </span>
      ),
      mobileCell: (s) => <StatusBadgeCell status={s.status} kind="sos" />,
      exportValue: (s) => SOS_STATUS_LABELS[s.status],
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      hideable: false,
      exportable: false,
      mobile: 'meta',
      cell: (s) =>
        canManage && s.status !== 'resolved' ? (
          <span className="flex justify-end gap-1">
            {s.status === 'open' && (
              <Button
                size="sm"
                variant="danger"
                icon={<Hand className="size-3.5" />}
                disabled={update.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  update.mutate({ id: s.id, status: 'acknowledged' });
                }}
              >
                Acknowledge
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              icon={<CheckCheck className="size-3.5" />}
              disabled={update.isPending}
              onClick={(e) => {
                e.stopPropagation();
                update.mutate({ id: s.id, status: 'resolved' });
              }}
            >
              Resolve
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <TravelListPanel<SosAlertOut>
      resource="sos"
      name="sos"
      caption="SOS alerts"
      fetchPage={(p) => travelApi.listSos({ ...p, status: p.status as SosStatus[] | undefined })}
      columns={columns}
      statuses={SOS_STATUSES}
      statusLabels={SOS_STATUS_LABELS}
      statusKind="sos"
      dateLabel="Raised"
      refetchInterval={15_000}
      rowClassName={(s) => (s.status === 'open' ? 'bg-danger-soft/60' : s.status === 'acknowledged' ? 'bg-warning-soft/40' : undefined)}
      emptyTitle="No SOS alerts"
      emptyDescription="Emergency alerts raised by patients from the app appear here in real time."
    />
  );
}

/** Count of open SOS alerts (for the tab badge), refreshed every 15 s. */
export function useOpenSosCount() {
  return useQuery({
    queryKey: [...opsKeys.sos, 'open-count'],
    queryFn: () => travelApi.listSos({ status: 'open', page: 1, page_size: 1 }),
    select: (p) => p.total,
    refetchInterval: 15_000,
  });
}
