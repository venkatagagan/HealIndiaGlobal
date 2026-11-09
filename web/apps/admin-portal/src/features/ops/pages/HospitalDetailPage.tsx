import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  Circle,
  ExternalLink,
  Landmark,
  ShieldCheck,
  Star,
  XCircle,
} from 'lucide-react';
import {
  adminApi,
  api,
  casesApi,
  HOSPITAL_MEMBER_ROLE_LABELS,
  HOSPITAL_STATUS_LABELS,
  KYC_STATUS_LABELS,
  USER_ROLE_LABELS,
  type AdminDoctorOut,
  type AdminHospitalDetail,
  type AuditLogOut,
  type CaseOut,
  type HospitalMemberOut,
} from '@hig/shared/api';
import {
  Badge,
  Button,
  DataTable,
  DateCell,
  ErrorState,
  IdCell,
  LoadingState,
  PersonCell,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  type DataTableColumn,
} from '@hig/shared/ui';
import { ConfirmDialog, Field, Input, ReasonDialog, Switch } from '../ui';
import { Banner, DetailHero, DetailTabs, FactList, FieldGrid, Panel, StatusTrack, useDetailTab } from '../ui/detail';
import { DocumentList } from '../components/DocumentList';
import { bpsToPctInput, cn, formatBps, formatDate, formatDateTime, pctInputToBps, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { useSettingValue } from '../lib/settings';

const TABS = ['overview', 'kyc', 'doctors', 'team', 'cases', 'activity'] as const;
type HospitalTab = (typeof TABS)[number];

export default function HospitalDetailPage() {
  const { id = '' } = useParams();
  const perms = useOpsPermissions();
  const q = useQuery({
    queryKey: [...opsKeys.hospitals, 'detail', id],
    queryFn: () => adminApi.getHospital(id),
    enabled: !!id,
  });
  useDocumentTitle(q.data?.name ?? 'Hospital');
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'suspend' | null>(null);
  const [tab, setTab] = useDetailTab<HospitalTab>(TABS, 'overview');

  const invalidate = [opsKeys.hospitals, opsKeys.dashboard] as const;
  const approve = useOpsMutation({
    mutationFn: () => adminApi.approveHospital(id),
    success: 'Hospital approved and now live',
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const reject = useOpsMutation({
    mutationFn: (reason: string) => adminApi.rejectHospital(id, { reason }),
    success: 'Hospital rejected',
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const verifyRegistration = useOpsMutation({
    mutationFn: ({ doctorId, verify }: { doctorId: string; verify: boolean }) =>
      api.post<AdminDoctorOut>(
        `/admin/doctors/${encodeURIComponent(doctorId)}/${verify ? 'verify' : 'unverify'}-registration`,
        {},
      ),
    success: (d) => (d.registration_verified ? `Registration verified for ${d.full_name}` : `Verification removed for ${d.full_name}`),
    invalidate: [opsKeys.hospitals],
  });
  const suspend = useOpsMutation({
    mutationFn: (reason: string) => adminApi.suspendHospital(id, { reason }),
    success: 'Hospital suspended',
    invalidate,
    onSuccess: () => setDialog(null),
  });

  if (q.isLoading) return <LoadingState label="Loading hospital…" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const h = q.data;
  const canApprove = perms.approvePartners && (h.status === 'pending_review' || h.status === 'suspended' || h.status === 'rejected');
  const canReject = perms.approvePartners && h.status === 'pending_review';
  const canSuspend = perms.approvePartners && h.status === 'active';
  const doctors = h.doctors ?? [];
  const unverifiedDocs = h.kyc_documents.filter((d) => d.status !== 'verified').length;
  const verifiedPayout = (h.payout_accounts ?? []).some((a) => a.is_verified && a.status === 'active');

  const stage = h.status === 'draft' ? 0 : h.status === 'pending_review' ? (h.kyc_status === 'approved' ? 2 : 1) : h.status === 'active' ? 3 : 1;
  const closed = h.status === 'rejected' || h.status === 'suspended';

  const checklist = [
    { ok: h.kyc_documents.length > 0, label: `KYC documents uploaded (${h.kyc_documents.length})`, detail: unverifiedDocs ? `${unverifiedDocs} not verified yet` : undefined, tab: 'kyc' as const },
    { ok: doctors.length > 0, label: `Doctors listed (${doctors.length})`, tab: 'doctors' as const },
    {
      ok: !h.doctors_missing_registration,
      label: h.doctors_missing_registration ? `${h.doctors_missing_registration} doctor(s) without a registration number` : 'Doctor registrations on file',
      tab: 'doctors' as const,
    },
    ...(h.payout_accounts ? [{ ok: verifiedPayout, label: verifiedPayout ? 'Verified payout account' : 'No verified payout account', tab: 'overview' as const }] : []),
  ];

  return (
    <div>
      <DetailHero
        back={{ to: opsPaths.hospitals, label: 'Hospitals' }}
        eyebrow="Hospital"
        avatar={
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink sm:inline-flex">
            <Building2 className="size-6" aria-hidden />
          </span>
        }
        title={h.name}
        badges={
          <>
            <StatusBadge status={h.status} kind="hospital" label={HOSPITAL_STATUS_LABELS[h.status]} />
            <Badge tone={h.kyc_status === 'approved' ? 'success' : h.kyc_status === 'rejected' ? 'danger' : 'warning'}>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3" aria-hidden /> KYC {KYC_STATUS_LABELS[h.kyc_status].toLowerCase()}
              </span>
            </Badge>
            {h.is_featured && (
              <Badge tone="accent">
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3" aria-hidden /> Featured
                </span>
              </Badge>
            )}
          </>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{[h.city, h.state].filter(Boolean).join(', ')}</span>
            {h.accreditations.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{h.accreditations.map((a) => a.toUpperCase()).join(', ')}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{h.rating_avg != null ? `★ ${h.rating_avg} (${h.rating_count} reviews)` : 'No reviews yet'}</span>
          </span>
        }
        actions={
          <>
            {canSuspend && (
              <Button variant="outline" size="sm" leftIcon={<Ban className="size-4" aria-hidden />} onClick={() => setDialog('suspend')}>
                Suspend
              </Button>
            )}
            {canReject && (
              <Button variant="outline" size="sm" className="text-danger-ink" leftIcon={<XCircle className="size-4" aria-hidden />} onClick={() => setDialog('reject')}>
                Reject
              </Button>
            )}
            {canApprove && (
              <Button size="sm" leftIcon={<CheckCircle2 className="size-4" aria-hidden />} onClick={() => setDialog('approve')}>
                {h.status === 'pending_review' ? 'Approve hospital' : 'Re-activate'}
              </Button>
            )}
          </>
        }
      >
        <StatusTrack
          steps={[
            { key: 'draft', label: 'Profile drafted', at: h.created_at ? formatDate(h.created_at, 'd MMM') : null },
            { key: 'submitted', label: 'Submitted for review' },
            { key: 'kyc', label: 'KYC verified' },
            { key: 'live', label: 'Live', at: h.approved_at ? formatDate(h.approved_at, 'd MMM') : null },
          ]}
          current={closed ? (h.status === 'suspended' ? 2 : stage) : stage}
          terminal={closed ? { label: HOSPITAL_STATUS_LABELS[h.status] } : null}
        />
      </DetailHero>

      <div className="mb-5 space-y-3">
        {h.rejection_reason && closed && (
          <Banner tone="danger" icon={<AlertTriangle className="size-5" aria-hidden />} title={`${HOSPITAL_STATUS_LABELS[h.status]}: reason shared with the hospital`}>
            {h.rejection_reason}
          </Banner>
        )}
        {h.status === 'pending_review' && (
          <Banner tone="warning" icon={<ShieldCheck className="size-5" aria-hidden />} title="Waiting for your review">
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.label}>
                  <button type="button" onClick={() => setTab(c.tab)} className="inline-flex items-center gap-1.5 text-left hover:underline">
                    {c.ok ? <CheckCircle2 className="size-3.5 shrink-0 text-success-ink" aria-hidden /> : <Circle className="size-3.5 shrink-0" aria-hidden />}
                    <span>
                      {c.label}
                      {c.detail ? ` · ${c.detail}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {(h.warnings ?? []).map((w) => (
                <li key={w} className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          </Banner>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <DetailTabs
            label="Hospital sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'kyc', label: 'KYC & documents', count: h.kyc_documents.length },
              { value: 'doctors', label: 'Doctors', count: h.doctors ? doctors.length : (h.doctors_count ?? null) },
              { value: 'team', label: 'Team', count: h.members.length },
              { value: 'cases', label: 'Cases', count: h.cases_count ?? null },
              { value: 'activity', label: 'Activity' },
            ]}
          />
          <div role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} className="space-y-4">
            {tab === 'overview' && <OverviewTab h={h} />}
            {tab === 'kyc' && (
              <Panel title="KYC documents" description="Registration, licences and tax documents uploaded by the hospital">
                <DocumentList
                  documents={h.kyc_documents}
                  canVerify={perms.approvePartners}
                  invalidate={[opsKeys.hospitals]}
                  emptyText="The hospital has not uploaded KYC documents yet."
                />
              </Panel>
            )}
            {tab === 'doctors' && (
              <DoctorsTab
                doctors={doctors}
                canVerify={perms.approvePartners}
                pendingId={verifyRegistration.isPending ? verifyRegistration.variables?.doctorId : undefined}
                onVerify={(doctorId, verify) => verifyRegistration.mutate({ doctorId, verify })}
              />
            )}
            {tab === 'team' && (
              <Panel title="Team members" description="Hospital staff with portal access" bodyClassName="p-0 sm:p-0">
                <DataTable
                  caption="Team members"
                  columns={MEMBER_COLUMNS}
                  rows={h.members}
                  defaultSort={{ key: 'name', direction: 'asc' }}
                  showViewOptions={false}
                  responsive="cards"
                  className="rounded-none border-0 shadow-none"
                  emptyTitle="No team members"
                />
              </Panel>
            )}
            {tab === 'cases' && <CasesTab hospitalId={h.id} />}
            {tab === 'activity' && <ActivityTab hospitalId={h.id} />}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="Key facts">
          <Panel title="Key facts">
            <FactList
              items={[
                { label: 'Cases', value: <Link to={`${opsPaths.cases}?hospital_id=${h.id}`} className="text-primary-ink hover:underline">{(h.cases_count ?? 0).toLocaleString('en-IN')}</Link> },
                { label: 'Doctors', value: (h.doctors_count ?? doctors.length).toLocaleString('en-IN') },
                { label: 'Commission', value: h.commission_rate_bps != null ? formatBps(h.commission_rate_bps) : 'Platform default' },
                { label: 'Settlement cycle', value: h.settlement_cycle_days ? `${h.settlement_cycle_days} days` : 'Platform default' },
                { label: 'Approved', value: h.approved_at ? formatDate(h.approved_at) : '—' },
              ]}
            />
          </Panel>
          <CommercialTerms hospital={h} canEdit={perms.editCommercials} canFeature={perms.approvePartners} />
          {h.payout_accounts && (
            <Panel title="Payout accounts" actions={<Landmark className="size-4 text-muted" aria-hidden />}>
              {h.payout_accounts.length === 0 ? (
                <p className="text-sm text-muted">No payout account added.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {h.payout_accounts.map((a) => (
                    <li key={a.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-fg">{a.account_holder_name}</p>
                        {a.is_verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {a.bank_name ?? '—'} · <span className="font-mono">{a.account_number_masked}</span> · {a.ifsc ?? '—'}
                      </p>
                      {a.is_primary && <Badge tone="accent" className="mt-1.5">Primary</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        title={h.status === 'pending_review' ? 'Approve hospital?' : 'Re-activate hospital?'}
        message={
          <>
            <strong>{h.name}</strong> will be listed publicly and can receive patient enquiries.
            {h.kyc_status !== 'approved' && h.kyc_documents.length === 0 && (
              <p className="mt-2 text-warning-ink">Warning: no KYC documents have been uploaded.</p>
            )}
            {!!h.doctors_missing_registration && (
              <p className="mt-2 text-warning-ink">
                Warning: {h.doctors_missing_registration} active doctor(s) have no medical registration number on file.
              </p>
            )}
          </>
        }
        confirmLabel="Approve"
        loading={approve.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => approve.mutate()}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        title="Reject hospital"
        description="The reason is shared with the hospital so they can fix and resubmit."
        confirmLabel="Reject"
        loading={reject.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => reject.mutate(reason)}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title="Suspend hospital"
        description="Suspended hospitals are hidden from patients and cannot receive new enquiries."
        confirmLabel="Suspend"
        loading={suspend.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => suspend.mutate(reason)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------------------
function OverviewTab({ h }: { h: AdminHospitalDetail }) {
  return (
    <Panel title="Profile">
      <FieldGrid
        columns={3}
        items={[
          { label: 'Legal name', value: h.legal_name ?? '—' },
          { label: 'GSTIN', value: h.gstin ? <span className="font-mono">{h.gstin}</span> : '—' },
          { label: 'PAN', value: h.pan_last4 ? `•••• ${h.pan_last4}` : '—' },
          { label: 'Address', value: [h.address, h.city, h.state, h.pincode].filter(Boolean).join(', ') || '—' },
          { label: 'Phone', value: h.phone ?? '—' },
          { label: 'Email', value: h.email ?? '—' },
          {
            label: 'Website',
            value: h.website ? (
              <a href={h.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-ink hover:underline">
                {h.website.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              '—'
            ),
          },
          { label: 'Established', value: h.established_year ? String(h.established_year) : '—' },
          { label: 'Beds', value: h.bed_count != null ? h.bed_count.toLocaleString('en-IN') : '—' },
          { label: 'Airport distance', value: h.airport_distance_km != null ? `${h.airport_distance_km} km` : '—' },
          { label: 'International desk', value: h.international_desk ? 'Yes' : 'No' },
          { label: 'Languages', value: h.languages.join(', ') || '—' },
        ]}
      />
      <div className="mt-5 space-y-4 border-t border-border pt-4">
        <div>
          <h4 className="text-xs font-medium text-muted">Specialties</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {h.specialties.length ? h.specialties.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-sm text-muted">—</span>}
          </div>
        </div>
        {h.description && (
          <div>
            <h4 className="text-xs font-medium text-muted">About</h4>
            <p className="mt-1 whitespace-pre-line text-sm text-fg">{h.description}</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function DoctorsTab({
  doctors,
  canVerify,
  pendingId,
  onVerify,
}: {
  doctors: AdminDoctorOut[];
  canVerify: boolean;
  pendingId: string | undefined;
  onVerify: (doctorId: string, verify: boolean) => void;
}) {
  const columns: DataTableColumn<AdminDoctorOut>[] = [
    {
      key: 'name',
      header: 'Doctor',
      sortable: true,
      accessor: (d) => d.full_name,
      mobile: 'primary',
      cell: (d) => (
        <PersonCell
          name={d.full_name}
          secondary={[d.specialty_name, d.experience_years != null ? `${d.experience_years} yrs` : null].filter(Boolean).join(' · ') || undefined}
        />
      ),
    },
    { key: 'quals', header: 'Qualifications', className: 'max-w-56', cell: (d) => <TextCell primary={d.qualifications.join(', ') || '—'} /> },
    {
      key: 'reg',
      header: 'Registration',
      cell: (d) =>
        d.registration_number ? (
          <TextCell primary={<span className="font-mono">{d.registration_number}</span>} secondary={d.registration_council_name ?? d.registration_council ?? undefined} />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Verification',
      sortable: true,
      accessor: (d) => (d.registration_verified ? 2 : d.registration_number ? 1 : 0),
      mobile: 'badge',
      cell: (d) => (
        <span className="flex flex-wrap items-center gap-1">
          {!d.is_active && <Badge>Inactive</Badge>}
          {!d.registration_number ? (
            <Badge tone="warning">No registration</Badge>
          ) : d.registration_verified ? (
            <Badge tone="success" title={d.registration_verified_at ? `Verified ${formatDateTime(d.registration_verified_at)}` : undefined}>
              Verified
            </Badge>
          ) : (
            <Badge tone="warning">Not verified</Badge>
          )}
        </span>
      ),
    },
    ...(canVerify
      ? [
          {
            key: 'action',
            header: '',
            title: 'Action',
            hideable: false,
            align: 'end' as const,
            exportable: false,
            cell: (d: AdminDoctorOut) =>
              d.registration_number ? (
                <Button
                  size="xs"
                  variant={d.registration_verified ? 'outline' : 'primary'}
                  loading={pendingId === d.id}
                  disabled={!!pendingId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onVerify(d.id, !d.registration_verified);
                  }}
                >
                  {d.registration_verified ? 'Unverify' : 'Verify'}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
  return (
    <Panel
      title="Doctors"
      description={
        canVerify ? (
          <>
            Check each registration on the{' '}
            <a href="https://www.nmc.org.in/" target="_blank" rel="noopener noreferrer" className="text-primary-ink hover:underline">
              NMC Indian Medical Register
            </a>{' '}
            (or the State Medical Council) before verifying. Patients only see the badge after this check.
          </>
        ) : undefined
      }
      bodyClassName="p-0 sm:p-0"
    >
      <DataTable
        caption="Doctors"
        columns={columns}
        rows={doctors}
        defaultSort={{ key: 'status', direction: 'asc' }}
        showViewOptions={false}
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle="No doctors added yet"
      />
    </Panel>
  );
}

const MEMBER_COLUMNS: DataTableColumn<HospitalMemberOut>[] = [
  { key: 'name', header: 'Name', sortable: true, accessor: (m) => m.full_name, mobile: 'primary', cell: (m) => <PersonCell name={m.full_name} secondary={m.email ?? undefined} /> },
  { key: 'role', header: 'Role', sortable: true, accessor: (m) => m.member_role, mobile: 'badge', cell: (m) => <Badge tone="accent">{HOSPITAL_MEMBER_ROLE_LABELS[m.member_role] ?? m.member_role}</Badge> },
  { key: 'status', header: 'Status', cell: (m) => (m.status ? <StatusBadgeCell status={m.status} kind="user" /> : <span className="text-muted">—</span>) },
  { key: 'added', header: 'Added', sortable: true, accessor: (m) => m.created_at, cell: (m) => <DateCell value={m.created_at} display="date" /> },
];

const CASE_COLUMNS: DataTableColumn<CaseOut>[] = [
  { key: 'case', header: 'Case', mobile: 'secondary', cell: (c) => <IdCell value={c.case_number} copy={false} secondary={`Opened ${formatDate(c.created_at)}`} /> },
  { key: 'patient', header: 'Patient', mobile: 'primary', cell: (c) => <PersonCell name={c.patient.full_name} secondary={c.procedure?.name ?? c.specialty?.name ?? undefined} /> },
  { key: 'status', header: 'Status', mobile: 'badge', cell: (c) => <StatusBadgeCell status={c.status} kind="case" /> },
  { key: 'updated', header: 'Updated', cell: (c) => <DateCell value={c.updated_at} display="relative" /> },
];

function CasesTab({ hospitalId }: { hospitalId: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [...opsKeys.cases, 'hospital', hospitalId, page],
    queryFn: () => casesApi.list({ hospital_id: hospitalId, page, page_size: 10, sort: '-updated_at' }),
    placeholderData: keepPreviousData,
  });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <Panel
      title="Cases"
      description="Most recently updated first"
      actions={
        <Link to={`${opsPaths.cases}?hospital_id=${hospitalId}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          Open in Cases <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
      bodyClassName="p-0 sm:p-0"
      footer={
        total > 10 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {(page - 1) * 10 + 1}–{Math.min(page * 10, total)} of {total}
            </span>
            <span className="flex gap-1">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="xs" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </span>
          </div>
        ) : undefined
      }
    >
      <DataTable
        caption="Cases at this hospital"
        columns={CASE_COLUMNS}
        rows={q.data?.items}
        loading={q.isLoading}
        fetching={q.isFetching && !q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowHref={(c) => opsPaths.case(c.id)}
        rowLabel={(c) => `Open case ${c.case_number}`}
        showViewOptions={false}
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle="No cases yet"
      />
    </Panel>
  );
}

const AUDIT_COLUMNS: DataTableColumn<AuditLogOut>[] = [
  { key: 'when', header: 'When', sortable: true, accessor: (l) => l.created_at, mobile: 'meta', cell: (l) => <DateCell value={l.created_at} display="relative" /> },
  { key: 'action', header: 'Action', mobile: 'primary', cell: (l) => <span className="font-medium text-fg">{l.action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')}</span> },
  { key: 'actor', header: 'By', cell: (l) => <TextCell primary={l.actor_name ?? (l.actor_user_id ? 'User' : 'System')} secondary={l.actor_role ? USER_ROLE_LABELS[l.actor_role] : undefined} /> },
  {
    key: 'change',
    header: 'Change',
    className: 'max-w-72',
    cell: (l) => {
      const before = l.before ?? {};
      const after = l.after ?? {};
      const text = Object.keys(after)
        .filter((k) => typeof after[k] !== 'object' && after[k] !== before[k])
        .slice(0, 3)
        .map((k) => `${k.replace(/_/g, ' ')}: ${String(after[k])}`)
        .join(' · ');
      return (
        <span className={cn('block truncate text-xs text-muted')} title={text}>
          {text || '—'}
        </span>
      );
    },
  },
];

function ActivityTab({ hospitalId }: { hospitalId: string }) {
  const audit = useQuery({
    queryKey: [...opsKeys.audit, 'hospital', hospitalId],
    queryFn: () => adminApi.auditLogs({ entity_type: 'hospital', entity_id: hospitalId, page_size: 50 }),
  });
  return (
    <Panel
      title="Audit trail"
      description="Approvals, profile and commercial changes"
      actions={
        <Link to={`${opsPaths.audit}?entity_type=hospital&entity_id=${encodeURIComponent(hospitalId)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          Open in audit log <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <DataTable
        caption="Audit trail"
        columns={AUDIT_COLUMNS}
        rows={audit.data?.items}
        loading={audit.isLoading}
        error={audit.error}
        onRetry={() => void audit.refetch()}
        defaultSort={{ key: 'when', direction: 'desc' }}
        showViewOptions={false}
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle="No audit entries"
      />
    </Panel>
  );
}

function CommercialTerms({
  hospital,
  canEdit,
  canFeature,
}: {
  hospital: AdminHospitalDetail;
  canEdit: boolean;
  canFeature: boolean;
}) {
  const defaultBps = useSettingValue<number>('default_commission_bps');
  const defaultCycle = useSettingValue<number>('settlement_cycle_days');
  const [pct, setPct] = useState(bpsToPctInput(hospital.commission_rate_bps));
  const [cycle, setCycle] = useState(hospital.settlement_cycle_days?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPct(bpsToPctInput(hospital.commission_rate_bps));
    setCycle(hospital.settlement_cycle_days?.toString() ?? '');
  }, [hospital.commission_rate_bps, hospital.settlement_cycle_days]);

  const update = useOpsMutation({
    mutationFn: (body: { commission_rate_bps?: number | null; settlement_cycle_days?: number | null; is_featured?: boolean }) =>
      adminApi.updateHospital(hospital.id, body),
    success: 'Hospital updated',
    invalidate: [opsKeys.hospitals],
  });

  const save = () => {
    const bps = pctInputToBps(pct);
    if (bps === undefined) return setError('Commission must be a percentage between 0 and 100.');
    const cycleNum = cycle.trim() === '' ? null : Number(cycle);
    if (cycleNum !== null && (!Number.isInteger(cycleNum) || cycleNum < 1 || cycleNum > 90)) {
      return setError('Settlement cycle must be a whole number of days between 1 and 90.');
    }
    setError(null);
    update.mutate({ commission_rate_bps: bps, settlement_cycle_days: cycleNum });
  };

  const dirty =
    pct !== bpsToPctInput(hospital.commission_rate_bps) || cycle !== (hospital.settlement_cycle_days?.toString() ?? '');

  return (
    <Panel title="Commercial terms" description="Commission and payout cycle for this hospital">
      <div className="space-y-3">
        <Field
          label="Commission rate (%)"
          hint={`Blank = platform default (${defaultBps != null ? formatBps(defaultBps) : '—'}). Specific commission rules (Finance) take precedence.`}
        >
          {(fid) => (
            <Input
              id={fid}
              inputMode="decimal"
              value={pct}
              disabled={!canEdit}
              placeholder={defaultBps != null ? bpsToPctInput(defaultBps) : ''}
              onChange={(e) => setPct(e.target.value)}
            />
          )}
        </Field>
        <Field label="Settlement cycle (days)" hint={`Blank = platform default (${defaultCycle ?? '—'} days).`}>
          {(fid) => (
            <Input
              id={fid}
              inputMode="numeric"
              value={cycle}
              disabled={!canEdit}
              placeholder={defaultCycle?.toString() ?? ''}
              onChange={(e) => setCycle(e.target.value)}
            />
          )}
        </Field>
        {error && (
          <p className="text-xs text-danger-ink" role="alert">
            {error}
          </p>
        )}
        {canEdit && (
          <Button onClick={save} disabled={!dirty} loading={update.isPending && !(update.variables && 'is_featured' in update.variables)}>
            Save terms
          </Button>
        )}
        <div className="border-t border-border pt-3">
          <Switch
            label="Featured on the patient site"
            checked={hospital.is_featured}
            disabled={!canFeature || update.isPending}
            onChange={(v) => update.mutate({ is_featured: v })}
          />
        </div>
      </div>
    </Panel>
  );
}
