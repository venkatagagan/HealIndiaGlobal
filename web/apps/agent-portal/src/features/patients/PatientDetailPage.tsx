import { useMemo, useState, type ReactNode } from 'react';
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
import { useAppTranslation, type AppT } from '../../i18n';

type Tab = 'profile' | 'screenings' | 'cases' | 'documents';

const screeningColumns = (t: AppT): DataTableColumn<ScreeningOut>[] => [
  {
    key: 'screening',
    header: t('patientDetail.screeningColumns.screening'),
    mobile: 'primary',
    className: 'max-w-96',
    sortable: true,
    sortValue: (s) => s.specialty?.name ?? s.ai_result?.suggested_specialties[0]?.name ?? '',
    cell: (s) => (
      <TextCell
        primary={s.specialty?.name ?? s.ai_result?.suggested_specialties[0]?.name ?? t('patientDetail.generalScreening')}
        secondary={s.ai_result?.summary ?? undefined}
      />
    ),
  },
  {
    key: 'urgency',
    header: t('patientDetail.screeningColumns.urgency'),
    mobile: 'badge',
    cell: (s) => (s.urgency ? <StatusBadge status={s.urgency} kind="urgency" dot /> : <span className="text-muted">—</span>),
  },
  { key: 'status', header: t('patientDetail.screeningColumns.status'), mobile: 'badge', cell: (s) => <StatusBadgeCell status={s.status} kind="screening" /> },
  {
    key: 'submitted',
    header: t('patientDetail.screeningColumns.submitted'),
    sortable: true,
    sortDescFirst: true,
    sortValue: (s) => s.submitted_at ?? s.created_at,
    cell: (s) => <DateCell value={s.submitted_at ?? s.created_at} display="datetime" className="text-muted" />,
  },
];

const caseColumns = (t: AppT): DataTableColumn<CaseOut>[] => [
  {
    key: 'case',
    header: t('patientDetail.caseColumns.case'),
    mobile: 'secondary',
    sortable: true,
    sortValue: (c) => c.case_number,
    cell: (c) => <IdCell value={c.case_number} copy={false} secondary={c.procedure?.name ?? c.specialty?.name ?? t('patientDetail.generalEnquiry')} />,
  },
  {
    key: 'hospital',
    header: t('patientDetail.caseColumns.hospital'),
    mobile: 'primary',
    className: 'max-w-64',
    sortable: true,
    sortValue: (c) => c.hospital.name,
    cell: (c) => <TextCell primary={c.hospital.name} secondary={c.hospital.city} />,
  },
  {
    key: 'status',
    header: t('patientDetail.caseColumns.status'),
    mobile: 'badge',
    sortable: true,
    sortValue: (c) => c.status,
    cell: (c) => <StatusBadgeCell status={c.status} kind="case" />,
  },
  {
    key: 'quote',
    header: t('patientDetail.caseColumns.latestQuote'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (c) => c.latest_quote?.total_minor ?? null,
    cell: (c) =>
      c.latest_quote ? (
        <MoneyCell minor={c.latest_quote.total_minor} currency={c.latest_quote.currency} />
      ) : (
        <span className="text-xs text-muted">{t('patientDetail.awaitingQuote')}</span>
      ),
  },
  {
    key: 'opened',
    header: t('patientDetail.caseColumns.opened'),
    sortable: true,
    sortDescFirst: true,
    sortValue: (c) => c.created_at,
    cell: (c) => <DateCell value={c.created_at} display="date" />,
  },
];


export function PatientDetailPage() {
  const { t } = useAppTranslation();
  const SCREENING_COLUMNS = useMemo(() => screeningColumns(t), [t]);
  const CASE_COLUMNS = useMemo(() => caseColumns(t), [t]);
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

  const name = patient.data ? patientName(patient.data) : t('patientDetail.fallbackName');
  useDocumentTitle(name);

  const back = (
    <Link to="/patients" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('patientDetail.back')}
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
        description={[countryName(p.nationality), p.gender ? GENDER_LABELS[p.gender] : null, age !== null ? t('patientDetail.ageYears', { count: age }) : null]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditOpen(true)}>
              {t('patientDetail.edit')}
            </Button>
            <ButtonLink to={`/cases/new?patient=${p.id}`} variant="outline" icon={<Briefcase className="h-4 w-4" aria-hidden />}>
              {t('patientDetail.newEnquiry')}
            </ButtonLink>
            <ButtonLink to={`/patients/${p.id}/screenings/new`} icon={<ClipboardPlus className="h-4 w-4" aria-hidden />}>
              {t('patientDetail.newScreening')}
            </ButtonLink>
          </>
        }
      />

      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={(next) => setParams({ tab: next }, { replace: true })}
        tabs={[
          { value: 'profile', label: t('patientDetail.tabs.profile') },
          { value: 'screenings', label: t('patientDetail.tabs.screenings'), count: screenings.data?.total },
          { value: 'cases', label: t('patientDetail.tabs.cases'), count: cases.data?.total },
          { value: 'documents', label: t('patientDetail.tabs.documents'), count: documents.data?.length },
        ]}
      />

      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <PatientConsentCard patient={p} />
          <Card>
            <CardHeader title={t('patientDetail.personal.title')} />
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Detail label={t('patientDetail.personal.fullName')} value={name} />
              <Detail label={t('patientDetail.personal.dob')} value={p.date_of_birth ? formatDate(p.date_of_birth) : '—'} />
              <Detail label={t('patientDetail.personal.nationality')} value={countryName(p.nationality)} />
              <Detail label={t('patientDetail.personal.residence')} value={countryName(p.country_of_residence ?? p.nationality)} />
              <Detail label={t('patientDetail.personal.email')} value={p.email ?? '—'} />
              <Detail label={t('patientDetail.personal.phone')} value={p.phone ?? '—'} />
              <Detail label={t('patientDetail.personal.whatsapp')} value={p.whatsapp ?? '—'} />
              <Detail label={t('patientDetail.personal.currency')} value={p.preferred_currency} />
              <Detail label={t('patientDetail.personal.passport')} value={p.passport_last4 ? `•••• ${p.passport_last4}` : t('patientDetail.personal.notOnFile')} />
              <Detail label={t('patientDetail.personal.passportExpiry')} value={p.passport_expiry ? formatDate(p.passport_expiry) : '—'} />
              <Detail
                label={t('patientDetail.personal.relationship')}
                value={
                  agent && p.managed_by_agent_id === agent.id
                    ? t('patientDetail.personal.managed')
                    : agent && p.referred_by_agent_id === agent.id
                      ? t('patientDetail.personal.referred')
                      : '—'
                }
              />
            </dl>
          </Card>
          <Card>
            <CardHeader title={t('patientDetail.medical.title')} />
            <dl className="grid gap-y-4 p-5 text-sm">
              <Detail label={t('patientDetail.medical.bloodGroup')} value={p.blood_group ?? '—'} />
              <Detail label={t('patientDetail.medical.allergies')} value={p.allergies ?? t('patientDetail.medical.noneRecorded')} />
              <Detail label={t('patientDetail.medical.history')} value={<span className="whitespace-pre-line">{p.medical_history ?? t('patientDetail.medical.noneRecorded')}</span>} />
              <Detail
                label={t('patientDetail.medical.emergencyContact')}
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
            title={t('patientDetail.screenings.title')}
            description={t('patientDetail.screenings.description')}
            actions={
              <ButtonLink size="sm" to={`/patients/${p.id}/screenings/new`}>
                {t('patientDetail.newScreening')}
              </ButtonLink>
            }
          />
          <DataTable
            caption={t('patientDetail.screenings.title')}
            columns={SCREENING_COLUMNS}
            rows={screenings.data?.items}
            loading={screenings.isPending}
            error={screenings.error}
            onRetry={() => void screenings.refetch()}
            defaultSort={{ key: 'submitted', direction: 'desc' }}
            rowHref={(s) => (s.status === 'draft' ? `/screenings/${s.id}/edit` : `/screenings/${s.id}`)}
            rowLabel={(s) => t('patientDetail.screenings.openRow', { date: formatDate(s.submitted_at ?? s.created_at) })}
            responsive="cards"
            className="rounded-none border-0 shadow-none"
            emptyTitle={t('patientDetail.screenings.emptyTitle')}
            emptyDescription={t('patientDetail.screenings.emptyDescription')}
          />
        </Card>
      )}

      {tab === 'cases' && (
        <Card>
          <CardHeader
            title={t('patientDetail.cases.title')}
            description={t('patientDetail.cases.description')}
            actions={
              <>
                {(cases.data?.items.filter((c) => c.latest_quote).length ?? 0) >= 2 && (
                  <ButtonLink size="sm" variant="outline" to={`/cases/compare?patient=${p.id}`}>
                    {t('patientDetail.cases.compare')}
                  </ButtonLink>
                )}
                <ButtonLink size="sm" to={`/cases/new?patient=${p.id}`}>
                  {t('patientDetail.newEnquiry')}
                </ButtonLink>
              </>
            }
          />
          <DataTable
            caption={t('patientDetail.cases.title')}
            columns={CASE_COLUMNS}
            rows={cases.data?.items}
            loading={cases.isPending}
            error={cases.error}
            onRetry={() => void cases.refetch()}
            defaultSort={{ key: 'opened', direction: 'desc' }}
            rowHref={(c) => `/cases/${c.id}`}
            rowLabel={(c) => t('patientDetail.cases.openRow', { number: c.case_number })}
            responsive="cards"
            className="rounded-none border-0 shadow-none"
            emptyTitle={t('patientDetail.cases.emptyTitle')}
            emptyDescription={t('patientDetail.cases.emptyDescription')}
          />
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title={t('patientDetail.documents.title')} description={t('patientDetail.documents.description')} />
          <div className="border-b border-border p-5">
            <DocumentUploader kinds={PATIENT_DOCUMENT_KINDS} target={{ patient_id: p.id }} />
          </div>
          <div className="border-b border-border p-5">
            <p className="mb-3 text-sm text-muted">
              {t('patientDetail.documents.aiIntro')}
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
