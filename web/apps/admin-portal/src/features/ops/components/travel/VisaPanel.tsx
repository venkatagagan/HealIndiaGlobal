import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  documentsApi,
  travelApi,
  VISA_STATUSES,
  VISA_STATUS_LABELS,
  VISA_TYPE_LABELS,
  enumOptions,
  type VisaRequestOut,
  type VisaStatus,
} from '@hig/shared/api';
import { Badge, DateCell, StatusBadgeCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../ui';
import { formatDateTime, toDateTimeLocal } from '../../lib/format';
import { opsKeys, useOpsMutation } from '../../lib/mutations';
import { PatientCaseCell, TravelListPanel } from './TravelListPanel';

const COLUMNS: DataTableColumn<VisaRequestOut>[] = [
  {
    key: 'patient',
    header: 'Patient',
    sticky: true,
    mobile: 'primary',
    className: 'max-w-56',
    cell: (v) => <PatientCaseCell name={v.patient?.full_name} caseId={v.case_id} caseNumber={v.case_number} />,
    exportValue: (v) => v.patient?.full_name ?? '',
  },
  {
    key: 'type',
    header: 'Visa type',
    mobile: 'secondary',
    cell: (v) => <TextCell primary={VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type} secondary={v.application_reference ? `Ref ${v.application_reference}` : undefined} />,
    mobileCell: (v) => VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type,
    exportValue: (v) => VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type,
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'badge',
    cell: (v) => <StatusBadgeCell status={v.status} kind="visa" />,
    exportValue: (v) => VISA_STATUS_LABELS[v.status],
  },
  {
    key: 'letter',
    header: 'Invitation letter',
    cell: (v) => (v.invitation_letter_document_id ? <Badge tone="success">Attached</Badge> : <span className="text-muted">None</span>),
    exportValue: (v) => (v.invitation_letter_document_id ? 'Attached' : ''),
  },
  {
    key: 'ref',
    header: 'Reference',
    defaultHidden: true,
    cell: (v) => <span className="font-mono text-xs">{v.application_reference ?? '—'}</span>,
    exportValue: (v) => v.application_reference ?? '',
  },
  { key: 'applied', header: 'Applied', cell: (v) => <DateCell value={v.applied_at} display="date" />, exportValue: (v) => v.applied_at ?? '' },
  { key: 'created', header: 'Requested', cell: (v) => <DateCell value={v.created_at} display="relative" className="text-muted" />, exportValue: (v) => v.created_at },
];

export function VisaPanel({ canManage }: { canManage: boolean }) {
  const [editing, setEditing] = useState<VisaRequestOut | null>(null);
  return (
    <>
      <TravelListPanel<VisaRequestOut>
        resource="visa"
        name="visa"
        caption="Visa requests"
        fetchPage={(p) => travelApi.listVisaRequests(p)}
        columns={COLUMNS}
        statuses={VISA_STATUSES}
        statusLabels={VISA_STATUS_LABELS}
        statusKind="visa"
        dateLabel="Requested"
        onRowClick={canManage ? setEditing : undefined}
        rowLabel={(v) => `Edit visa request of ${v.patient?.full_name ?? 'patient'}`}
        emptyTitle="No visa requests yet"
        emptyDescription="Patients request medical-visa help from their case; requests land here."
      />
      <VisaEditModal visa={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function VisaEditModal({ visa, onClose }: { visa: VisaRequestOut | null; onClose: () => void }) {
  const [form, setForm] = useState({
    status: 'not_started' as VisaStatus,
    application_reference: '',
    applied_at: '',
    decided_at: '',
    invitation_letter_document_id: '',
    notes: '',
  });
  useEffect(() => {
    if (visa)
      setForm({
        status: visa.status,
        application_reference: visa.application_reference ?? '',
        applied_at: toDateTimeLocal(visa.applied_at),
        decided_at: toDateTimeLocal(visa.decided_at),
        invitation_letter_document_id: visa.invitation_letter_document_id ?? '',
        notes: visa.notes ?? '',
      });
  }, [visa]);

  const letters = useQuery({
    queryKey: ['documents', 'case', visa?.case_id, 'invitation_letter'],
    queryFn: () => documentsApi.list({ case_id: visa!.case_id, kind: 'invitation_letter' }),
    enabled: !!visa,
  });

  const save = useOpsMutation({
    mutationFn: () =>
      travelApi.updateVisaRequest(visa!.id, {
        status: form.status,
        application_reference: form.application_reference.trim() || null,
        invitation_letter_document_id: form.invitation_letter_document_id || null,
        notes: form.notes.trim() || null,
      }),
    success: 'Visa request updated',
    invalidate: [opsKeys.travel],
    onSuccess: onClose,
  });

  return (
    <Modal
      open={!!visa}
      onClose={onClose}
      title={`Visa request · ${visa?.patient?.full_name ?? ''}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status" required>
          {(id) => (
            <Select
              id={id}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as VisaStatus })}
              options={enumOptions(VISA_STATUSES, VISA_STATUS_LABELS)}
            />
          )}
        </Field>
        <Field label="Application reference">
          {(id) => (
            <Input
              id={id}
              value={form.application_reference}
              maxLength={100}
              onChange={(e) => setForm({ ...form, application_reference: e.target.value })}
            />
          )}
        </Field>
        {/* applied_at / decided_at are stamped by the server on the status change (not part of VisaRequestUpdate) */}
        <Field label="Applied at" hint="Set automatically when the status changes.">
          {(id) => <Input id={id} type="datetime-local" value={form.applied_at} readOnly disabled />}
        </Field>
        <Field label="Decided at" hint="Set automatically when the status changes.">
          {(id) => <Input id={id} type="datetime-local" value={form.decided_at} readOnly disabled />}
        </Field>
        <Field
          label="Invitation letter"
          className="sm:col-span-2"
          hint="Letters are uploaded by the hospital to the case (document kind: invitation letter)."
        >
          {(id) => (
            <Select
              id={id}
              value={form.invitation_letter_document_id}
              onChange={(e) => setForm({ ...form, invitation_letter_document_id: e.target.value })}
              placeholder={letters.isLoading ? 'Loading…' : 'None'}
              options={(letters.data ?? []).map((d) => ({ value: d.id, label: `${d.file_name} (${formatDateTime(d.created_at)})` }))}
            />
          )}
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}
