import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Briefcase, ClipboardPlus, Pencil } from 'lucide-react';
import {
  GENDER_LABELS,
  PATIENT_DOCUMENT_KINDS,
  agentPortalApi,
  casesApi,
  documentsApi,
  screeningsApi,
  type CaseOut,
  type ScreeningOut,
} from '@hig/shared/api';
import {
  DataTable,
  DateCell,
  IdCell,
  MoneyCell,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Tabs,
} from '../../components/ui';
import { countryName } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { qk, useAgentProfile } from '../../lib/queries';
import { ageFromDob, formatDate, useDocumentTitle } from '../../lib/shared';
import { ReportAiPanel } from '@hig/shared/docai';
import { DocumentList, DocumentUploader } from '../documents/Documents';
import { PatientFormDialog } from './PatientForm';
import { PatientConsentCard } from './PatientConsentCard';

type Tab = 'profile' | 'screenings' | 'cases' | 'documents';

const SCREENING_COLUMNS: DataTableColumn<ScreeningOut>[] = [
  {
    key: 'screening',
    header: 'Screening',
    mobile: 'primary',
    className: 'max-w-96',
    sortable: true,
    sortValue: (s) => s.specialty?.name ?? s.ai_result?.suggested_specialties[0]?.name ?? '',
    cell: (s) => (
      <TextCell
        primary={s.specialty?.name ?? s.ai_result?.suggested_specialties[0]?.name ?? 'General screening'}
        secondary={s.ai_result?.summary ?? undefined}
      />
    ),
  },
  {
    key: 'urgency',
    header: 'Urgency',
    mobile: 'badge',
    cell: (s) => (s.urgency ? <StatusBadge status={s.urgency} kind="urgency" dot /> : <span className="text-muted">—</span>),
  },
  { key: 'status', header: 'Status', mobile: 'badge', cell: (s) => <StatusBadgeCell status={s.status} kind="screening" /> },
  {
    key: 'submitted',
    header: 'Submitted',
    sortable: true,
    sortDescFirst: true,
    sortValue: (s) => s.submitted_at ?? s.created_at,
    cell: (s) => <DateCell value={s.submitted_at ?? s.created_at} display="datetime" className="text-muted" />,
  },
];

const CASE_COLUMNS: DataTableColumn<CaseOut>[] = [
  {
    key: 'case',
    header: 'Case',
    mobile: 'secondary',
    sortable: true,
    sortValue: (c) => c.case_number,
    cell: (c) => <IdCell value={c.case_number} copy={false} secondary={c.procedure?.name ?? c.specialty?.name ?? 'General enquiry'} />,
  },
  {
    key: 'hospital',
    header: 'Hospital',
    mobile: 'primary',
    className: 'max-w-64',
    sortable: true,
    sortValue: (c) => c.hospital.name,
    cell: (c) => <TextCell primary={c.hospital.name} secondary={c.hospital.city} />,
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'badge',
    sortable: true,
    sortValue: (c) => c.status,
    cell: (c) => <StatusBadgeCell status={c.status} kind="case" />,
  },
  {
    key: 'quote',
    header: 'Latest quote',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (c) => c.latest_quote?.total_minor ?? null,
    cell: (c) =>
      c.latest_quote ? (
        <MoneyCell minor={c.latest_quote.total_minor} currency={c.latest_quote.currency} />
      ) : (
        <span className="text-xs text-muted">Awaiting quote</span>
      ),
  },
  {
    key: 'opened',
    header: 'Opened',
    sortable: true,
    sortDescFirst: true,
    sortValue: (c) => c.created_at,
    cell: (c) => <DateCell value={c.created_at} display="date" />,
  },
];


export function PatientDetailPage() {
  const { patientId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'profile';
  const [editOpen, setEditOpen] = useState(false);

  const patient = useQuery({ queryKey: qk.patient(patientId), queryFn: () => agentPortalApi.getPatient(patientId) });
  const screenings = useQuery({
    queryKey: qk.screenings({ patient_id: patientId }),
    queryFn: () => screeningsApi.list({ patient_id: patientId, page_size: 50 }),
  });
  const cases = useQuery({
    queryKey: qk.cases({ patient_id: patientId }),
    queryFn: () => casesApi.list({ patient_id: patientId, page_size: 50 }),
  });
  const documents = useQuery({
    queryKey: qk.documents({ patient_id: patientId }),
    queryFn: () => documentsApi.list({ patient_id: patientId }),
  });
  const { data: agent } = useAgentProfile();

  const name = patient.data ? patientName(patient.data) : 'Patient';
  useDocumentTitle(name);

  const back = (
    <Link to="/patients" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Patients
    </Link>
  );

  if (patient.isPending) return <LoadingBlock />;
  if (patient.isError) {
    return (
      <>
        {back}
        <Card className="mt-4">
          <ErrorState error={patient.error} onRetry={() => void patient.refetch()} />
        </Card>
      </>
    );
  }
  const p = patient.data;
  const age = ageFromDob(p.date_of_birth);

  return (
    <div>
      <PageHeader
        back={back}
        title={name}
        description={[countryName(p.nationality), p.gender ? GENDER_LABELS[p.gender] : null, age !== null ? `${age} years` : null]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <ButtonLink to={`/cases/new?patient=${p.id}`} variant="outline" icon={<Briefcase className="h-4 w-4" aria-hidden />}>
              New enquiry
            </ButtonLink>
            <ButtonLink to={`/patients/${p.id}/screenings/new`} icon={<ClipboardPlus className="h-4 w-4" aria-hidden />}>
              New screening
            </ButtonLink>
          </>
        }
      />

      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { value: 'profile', label: 'Profile' },
          { value: 'screenings', label: 'Screenings', count: screenings.data?.total },
          { value: 'cases', label: 'Cases', count: cases.data?.total },
          { value: 'documents', label: 'Documents', count: documents.data?.length },
        ]}
      />

      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <PatientConsentCard patient={p} />
          <Card>
            <CardHeader title="Personal details" />
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Detail label="Full name" value={name} />
              <Detail label="Date of birth" value={p.date_of_birth ? formatDate(p.date_of_birth) : '—'} />
              <Detail label="Nationality" value={countryName(p.nationality)} />
              <Detail label="Residence" value={countryName(p.country_of_residence ?? p.nationality)} />
              <Detail label="Email" value={p.email ?? '—'} />
              <Detail label="Phone" value={p.phone ?? '—'} />
              <Detail label="WhatsApp" value={p.whatsapp ?? '—'} />
              <Detail label="Preferred currency" value={p.preferred_currency} />
              <Detail label="Passport" value={p.passport_last4 ? `•••• ${p.passport_last4}` : 'Not on file'} />
              <Detail label="Passport expiry" value={p.passport_expiry ? formatDate(p.passport_expiry) : '—'} />
              <Detail
                label="Relationship"
                value={
                  agent && p.managed_by_agent_id === agent.id
                    ? 'Managed by your agency'
                    : agent && p.referred_by_agent_id === agent.id
                      ? 'Referred by your agency'
                      : '—'
                }
              />
            </dl>
          </Card>
          <Card>
            <CardHeader title="Medical information" />
            <dl className="grid gap-y-4 p-5 text-sm">
              <Detail label="Blood group" value={p.blood_group ?? '—'} />
              <Detail label="Allergies" value={p.allergies ?? 'None recorded'} />
              <Detail label="Medical history" value={<span className="whitespace-pre-line">{p.medical_history ?? 'None recorded'}</span>} />
              <Detail
                label="Emergency contact"
                value={
                  p.emergency_contact
                    ? `${p.emergency_contact.name} (${p.emergency_contact.relationship}) · ${p.emergency_contact.phone}`
                    : '—'
                }
              />
            </dl>
          </Card>
        </div>
      )}

      {tab === 'screenings' && (
        <Card>
          <CardHeader
            title="Screenings"
            description="AI symptom screenings submitted for this patient"
            actions={
              <ButtonLink size="sm" to={`/patients/${p.id}/screenings/new`}>
                New screening
              </ButtonLink>
            }
          />
          <DataTable
            caption="Screenings"
            columns={SCREENING_COLUMNS}
            rows={screenings.data?.items}
            loading={screenings.isPending}
            error={screenings.error}
            onRetry={() => void screenings.refetch()}
            defaultSort={{ key: 'submitted', direction: 'desc' }}
            rowHref={(s) => (s.status === 'draft' ? `/screenings/${s.id}/edit` : `/screenings/${s.id}`)}
            rowLabel={(s) => `Open screening from ${formatDate(s.submitted_at ?? s.created_at)}`}
            responsive="cards"
            className="rounded-none border-0 shadow-none"
            emptyTitle="No screenings yet"
            emptyDescription="Run a screening to get matched hospitals and doctors."
          />
        </Card>
      )}

      {tab === 'cases' && (
        <Card>
          <CardHeader
            title="Cases"
            description="Enquiries sent to hospitals for this patient"
            actions={
              <>
                {(cases.data?.items.filter((c) => c.latest_quote).length ?? 0) >= 2 && (
                  <ButtonLink size="sm" variant="outline" to={`/cases/compare?patient=${p.id}`}>
                    Compare quotes
                  </ButtonLink>
                )}
                <ButtonLink size="sm" to={`/cases/new?patient=${p.id}`}>
                  New enquiry
                </ButtonLink>
              </>
            }
          />
          <DataTable
            caption="Cases"
            columns={CASE_COLUMNS}
            rows={cases.data?.items}
            loading={cases.isPending}
            error={cases.error}
            onRetry={() => void cases.refetch()}
            defaultSort={{ key: 'opened', direction: 'desc' }}
            rowHref={(c) => `/cases/${c.id}`}
            rowLabel={(c) => `Open case ${c.case_number}`}
            responsive="cards"
            className="rounded-none border-0 shadow-none"
            emptyTitle="No cases yet"
            emptyDescription="Send an enquiry to up to three hospitals to receive quotes."
          />
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title="Documents" description="Passport, medical reports and other files uploaded on the patient’s behalf" />
          <div className="border-b border-border p-5">
            <DocumentUploader kinds={PATIENT_DOCUMENT_KINDS} target={{ patient_id: p.id }} />
          </div>
          <div className="border-b border-border p-5">
            <p className="mb-3 text-sm text-muted">
              Read a medical report with AI: upload the PDF or photograph the pages, then check and confirm the extracted
              results with the patient. Only confirmed data is shared with hospitals.
            </p>
            <ReportAiPanel patientId={p.id} defaultKind="medical_report" audience="clinical" existing="pending" />
          </div>
          {documents.isPending ? (
            <LoadingBlock />
          ) : documents.isError ? (
            <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
          ) : (
            <DocumentList aiStatus documents={documents.data} canDelete={(d) => d.status !== 'verified'} />
          )}
        </Card>
      )}

      <PatientFormDialog open={editOpen} onClose={() => setEditOpen(false)} patient={p} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-fg">{value}</dd>
    </div>
  );
}
