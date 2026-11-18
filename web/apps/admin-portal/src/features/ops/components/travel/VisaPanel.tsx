import { useEffect, useMemo, useState } from 'react';
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
import { useAppTranslation } from '../../../../i18n';
import { PatientCaseCell, TravelListPanel } from './TravelListPanel';

type T = ReturnType<typeof useAppTranslation>['t'];

const visaColumns = (t: T): DataTableColumn<VisaRequestOut>[] => [
  {
    key: 'patient',
    header: t('travel.visa.columns.patient'),
    sticky: true,
    mobile: 'primary',
    className: 'max-w-56',
    cell: (v) => <PatientCaseCell name={v.patient?.full_name} caseId={v.case_id} caseNumber={v.case_number} />,
    exportValue: (v) => v.patient?.full_name ?? '',
  },
  {
    key: 'type',
    header: t('travel.visa.columns.type'),
    mobile: 'secondary',
    cell: (v) => <TextCell primary={VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type} secondary={v.application_reference ? t('travel.visa.ref', { reference: v.application_reference }) : undefined} />,
    mobileCell: (v) => VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type,
    exportValue: (v) => VISA_TYPE_LABELS[v.visa_type] ?? v.visa_type,
  },
  {
    key: 'status',
    header: t('travel.visa.columns.status'),
    mobile: 'badge',
    cell: (v) => <StatusBadgeCell status={v.status} kind="visa" />,
    exportValue: (v) => VISA_STATUS_LABELS[v.status],
  },
  {
    key: 'letter',
    header: t('travel.visa.columns.letter'),
    cell: (v) => (v.invitation_letter_document_id ? <Badge tone="success">{t('travel.visa.attached')}</Badge> : <span className="text-muted">{t('travel.visa.none')}</span>),
    exportValue: (v) => (v.invitation_letter_document_id ? t('travel.visa.attached') : ''),
  },
  {
    key: 'ref',
    header: t('travel.visa.columns.reference'),
    defaultHidden: true,
    cell: (v) => <span className="font-mono text-xs">{v.application_reference ?? '—'}</span>,
    exportValue: (v) => v.application_reference ?? '',
  },
  { key: 'applied', header: t('travel.visa.columns.applied'), cell: (v) => <DateCell value={v.applied_at} display="date" />, exportValue: (v) => v.applied_at ?? '' },
  { key: 'created', header: t('travel.visa.columns.requested'), cell: (v) => <DateCell value={v.created_at} display="relative" className="text-muted" />, exportValue: (v) => v.created_at },
];

export function VisaPanel({ canManage }: { canManage: boolean }) {
  const { t } = useAppTranslation();
  const columns = useMemo(() => visaColumns(t), [t]);
  const [editing, setEditing] = useState<VisaRequestOut | null>(null);
  return (
    <>
      <TravelListPanel<VisaRequestOut>
        resource="visa"
        name="visa"
        caption={t('travel.visa.caption')}
        fetchPage={(p) => travelApi.listVisaRequests(p)}
        columns={columns}
        statuses={VISA_STATUSES}
        statusLabels={VISA_STATUS_LABELS}
        statusKind="visa"
        dateLabel={t('travel.visa.columns.requested')}
        onRowClick={canManage ? setEditing : undefined}
        rowLabel={(v) => (v.patient?.full_name ? t('travel.visa.rowLabel', { name: v.patient.full_name }) : t('travel.visa.rowLabelNoName'))}
        emptyTitle={t('travel.visa.emptyTitle')}
        emptyDescription={t('travel.visa.emptyDescription')}
      />
      <VisaEditModal visa={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function VisaEditModal({ visa, onClose }: { visa: VisaRequestOut | null; onClose: () => void }) {
  const { t } = useAppTranslation();
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
    success: t('travel.visa.updated'),
    invalidate: [opsKeys.travel],
    onSuccess: onClose,
  });

  return (
    <Modal
      open={!!visa}
      onClose={onClose}
      title={t('travel.visa.modalTitle', { name: visa?.patient?.full_name ?? '' })}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('travel.common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t('travel.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('travel.visa.form.status')} required>
          {(id) => (
            <Select
              id={id}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as VisaStatus })}
              options={enumOptions(VISA_STATUSES, VISA_STATUS_LABELS)}
            />
          )}
        </Field>
        <Field label={t('travel.visa.form.reference')}>
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
        <Field label={t('travel.visa.form.appliedAt')} hint={t('travel.visa.form.autoHint')}>
          {(id) => <Input id={id} type="datetime-local" value={form.applied_at} readOnly disabled />}
        </Field>
        <Field label={t('travel.visa.form.decidedAt')} hint={t('travel.visa.form.autoHint')}>
          {(id) => <Input id={id} type="datetime-local" value={form.decided_at} readOnly disabled />}
        </Field>
        <Field
          label={t('travel.visa.form.letter')}
          className="sm:col-span-2"
          hint={t('travel.visa.form.letterHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={form.invitation_letter_document_id}
              onChange={(e) => setForm({ ...form, invitation_letter_document_id: e.target.value })}
              placeholder={letters.isLoading ? t('travel.common.loading') : t('travel.visa.none')}
              options={(letters.data ?? []).map((d) => ({ value: d.id, label: t('travel.visa.form.letterOption', { name: d.file_name, date: formatDateTime(d.created_at) }) }))}
            />
          )}
        </Field>
        <Field label={t('travel.visa.form.notes')} className="sm:col-span-2">
          {(id) => <Textarea id={id} value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  );
}
