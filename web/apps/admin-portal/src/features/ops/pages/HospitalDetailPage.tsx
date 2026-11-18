import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
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
import { AccreditationsPanel } from '../components/AccreditationsPanel';
import { ProfileChangesPanel } from '../components/DualControl';
import { TranslationsButton } from '../components/ContentTranslations';
import type { AdminHospitalWithPending } from '../lib/phase1Api';
import { bpsToPctInput, cn, formatBps, formatDate, formatDateTime, pctInputToBps, useDocumentTitle } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useOpsPermissions } from '../lib/session';
import { useSettingValue } from '../lib/settings';
import { formatNumber } from '@hig/shared/lib';
import { useAppTranslation } from '../../../i18n';

const TABS = ['overview', 'kyc', 'accreditations', 'doctors', 'team', 'cases', 'activity'] as const;
type HospitalTab = (typeof TABS)[number];

export default function HospitalDetailPage() {
  const { t } = useAppTranslation();
  const { id = '' } = useParams();
  const perms = useOpsPermissions();
  const q = useQuery({
    queryKey: [...opsKeys.hospitals, 'detail', id],
    queryFn: () => adminApi.getHospital(id),
    enabled: !!id,
  });
  useDocumentTitle(q.data?.name ?? t('hospitalDetail.documentTitle'));
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'suspend' | null>(null);
  const [tab, setTab] = useDetailTab<HospitalTab>(TABS, 'overview');
  const memberColumns = useMemo(() => memberColumnsFor(t), [t]);

  const invalidate = [opsKeys.hospitals, opsKeys.dashboard] as const;
  const approve = useOpsMutation({
    mutationFn: () => adminApi.approveHospital(id),
    success: t('hospitalDetail.toast.approved'),
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const reject = useOpsMutation({
    mutationFn: (reason: string) => adminApi.rejectHospital(id, { reason }),
    success: t('hospitalDetail.toast.rejected'),
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const verifyRegistration = useOpsMutation({
    mutationFn: ({ doctorId, verify }: { doctorId: string; verify: boolean }) =>
      api.post<AdminDoctorOut>(
        `/admin/doctors/${encodeURIComponent(doctorId)}/${verify ? 'verify' : 'unverify'}-registration`,
        {},
      ),
    success: (d) =>
      d.registration_verified
        ? t('hospitalDetail.toast.registrationVerified', { name: d.full_name })
        : t('hospitalDetail.toast.verificationRemoved', { name: d.full_name }),
    invalidate: [opsKeys.hospitals],
  });
  const suspend = useOpsMutation({
    mutationFn: (reason: string) => adminApi.suspendHospital(id, { reason }),
    success: t('hospitalDetail.toast.suspended'),
    invalidate,
    onSuccess: () => setDialog(null),
  });

  if (q.isLoading) return <LoadingState label={t('hospitalDetail.loading')} />;
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
    {
      ok: h.kyc_documents.length > 0,
      label: t('hospitalDetail.checklist.kycUploaded', { count: h.kyc_documents.length }),
      detail: unverifiedDocs ? t('hospitalDetail.checklist.notVerifiedYet', { count: unverifiedDocs }) : undefined,
      tab: 'kyc' as const,
    },
    { ok: doctors.length > 0, label: t('hospitalDetail.checklist.doctorsListed', { count: doctors.length }), tab: 'doctors' as const },
    {
      ok: !h.doctors_missing_registration,
      label: h.doctors_missing_registration
        ? t('hospitalDetail.checklist.doctorsWithoutRegistration', { count: h.doctors_missing_registration })
        : t('hospitalDetail.checklist.registrationsOnFile'),
      tab: 'doctors' as const,
    },
    ...(h.payout_accounts
      ? [
          {
            ok: verifiedPayout,
            label: verifiedPayout ? t('hospitalDetail.checklist.verifiedPayout') : t('hospitalDetail.checklist.noVerifiedPayout'),
            tab: 'overview' as const,
          },
        ]
      : []),
  ];

  return (
    <div>
      <DetailHero
        back={{ to: opsPaths.hospitals, label: t('hospitalDetail.back') }}
        eyebrow={t('hospitalDetail.eyebrow')}
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
                <ShieldCheck className="size-3" aria-hidden />{' '}
                {t('hospitalDetail.kycBadge', { status: KYC_STATUS_LABELS[h.kyc_status].toLowerCase() })}
              </span>
            </Badge>
            {h.is_featured && (
              <Badge tone="accent">
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3" aria-hidden /> {t('hospitalDetail.featured')}
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
            <span>
              {h.rating_avg != null
                ? t('hospitalDetail.rating', { rating: formatNumber(Number(h.rating_avg)), count: h.rating_count })
                : t('hospitalDetail.noReviews')}
            </span>
          </span>
        }
        actions={
          <>
            <TranslationsButton entityType="hospital" entityId={h.id} label={h.name} size="md" withText />
            {canSuspend && (
              <Button variant="outline" size="sm" leftIcon={<Ban className="size-4" aria-hidden />} onClick={() => setDialog('suspend')}>
                {t('hospitalDetail.actions.suspend')}
              </Button>
            )}
            {canReject && (
              <Button variant="outline" size="sm" className="text-danger-ink" leftIcon={<XCircle className="size-4" aria-hidden />} onClick={() => setDialog('reject')}>
                {t('hospitalDetail.actions.reject')}
              </Button>
            )}
            {canApprove && (
              <Button size="sm" leftIcon={<CheckCircle2 className="size-4" aria-hidden />} onClick={() => setDialog('approve')}>
                {h.status === 'pending_review' ? t('hospitalDetail.actions.approveHospital') : t('hospitalDetail.actions.reactivate')}
              </Button>
            )}
          </>
        }
      >
        <StatusTrack
          steps={[
            { key: 'draft', label: t('hospitalDetail.track.drafted'), at: h.created_at ? formatDate(h.created_at, 'd MMM') : null },
            { key: 'submitted', label: t('hospitalDetail.track.submitted') },
            { key: 'kyc', label: t('hospitalDetail.track.kycVerified') },
            { key: 'live', label: t('hospitalDetail.track.live'), at: h.approved_at ? formatDate(h.approved_at, 'd MMM') : null },
          ]}
          current={closed ? (h.status === 'suspended' ? 2 : stage) : stage}
          terminal={closed ? { label: HOSPITAL_STATUS_LABELS[h.status] } : null}
        />
      </DetailHero>

      <div className="mb-5 space-y-3">
        <ProfileChangesPanel hospital={h as AdminHospitalWithPending} />
        {h.rejection_reason && closed && (
          <Banner
            tone="danger"
            icon={<AlertTriangle className="size-5" aria-hidden />}
            title={t('hospitalDetail.reasonShared', { status: HOSPITAL_STATUS_LABELS[h.status] })}
          >
            {h.rejection_reason}
          </Banner>
        )}
        {h.status === 'pending_review' && (
          <Banner tone="warning" icon={<ShieldCheck className="size-5" aria-hidden />} title={t('hospitalDetail.waitingReview')}>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.label}>
                  <button type="button" onClick={() => setTab(c.tab)} className="inline-flex items-center gap-1.5 text-start hover:underline">
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
            label={t('hospitalDetail.tabs.label')}
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: t('hospitalDetail.tabs.overview') },
              { value: 'kyc', label: t('hospitalDetail.tabs.kyc'), count: h.kyc_documents.length },
              { value: 'accreditations', label: t('accreditations.tab') },
              { value: 'doctors', label: t('hospitalDetail.tabs.doctors'), count: h.doctors ? doctors.length : (h.doctors_count ?? null) },
              { value: 'team', label: t('hospitalDetail.tabs.team'), count: h.members.length },
              { value: 'cases', label: t('hospitalDetail.tabs.cases'), count: h.cases_count ?? null },
              { value: 'activity', label: t('hospitalDetail.tabs.activity') },
            ]}
          />
          <div role="tabpanel" id={`detail-panel-${tab}`} aria-labelledby={`detail-tab-${tab}`} className="space-y-4">
            {tab === 'overview' && <OverviewTab h={h} />}
            {tab === 'kyc' && (
              <Panel title={t('hospitalDetail.kyc.title')} description={t('hospitalDetail.kyc.description')}>
                <DocumentList
                  documents={h.kyc_documents}
                  canVerify={perms.approvePartners}
                  invalidate={[opsKeys.hospitals]}
                  emptyText={t('hospitalDetail.kyc.empty')}
                />
              </Panel>
            )}
            {tab === 'accreditations' && <AccreditationsPanel hospitalId={h.id} canEdit={perms.approvePartners} />}
            {tab === 'doctors' && (
              <DoctorsTab
                doctors={doctors}
                canVerify={perms.approvePartners}
                pendingId={verifyRegistration.isPending ? verifyRegistration.variables?.doctorId : undefined}
                onVerify={(doctorId, verify) => verifyRegistration.mutate({ doctorId, verify })}
              />
            )}
            {tab === 'team' && (
              <Panel title={t('hospitalDetail.team.title')} description={t('hospitalDetail.team.description')} bodyClassName="p-0 sm:p-0">
                <DataTable
                  caption={t('hospitalDetail.team.title')}
                  columns={memberColumns}
                  rows={h.members}
                  defaultSort={{ key: 'name', direction: 'asc' }}
                  showViewOptions={false}
                  responsive="cards"
                  className="rounded-none border-0 shadow-none"
                  emptyTitle={t('hospitalDetail.team.empty')}
                />
              </Panel>
            )}
            {tab === 'cases' && <CasesTab hospitalId={h.id} />}
            {tab === 'activity' && <ActivityTab hospitalId={h.id} />}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label={t('hospitalDetail.facts.title')}>
          <Panel title={t('hospitalDetail.facts.title')}>
            <FactList
              items={[
                {
                  label: t('hospitalDetail.facts.cases'),
                  value: (
                    <Link to={`${opsPaths.cases}?hospital_id=${h.id}`} className="text-primary-ink hover:underline">
                      {formatNumber(h.cases_count ?? 0)}
                    </Link>
                  ),
                },
                { label: t('hospitalDetail.facts.doctors'), value: formatNumber(h.doctors_count ?? doctors.length) },
                {
                  label: t('hospitalDetail.facts.commission'),
                  value: h.commission_rate_bps != null ? formatBps(h.commission_rate_bps) : t('hospitalDetail.facts.platformDefault'),
                },
                {
                  label: t('hospitalDetail.facts.settlementCycle'),
                  value: h.settlement_cycle_days
                    ? t('hospitalDetail.days', { count: h.settlement_cycle_days })
                    : t('hospitalDetail.facts.platformDefault'),
                },
                { label: t('hospitalDetail.facts.approved'), value: h.approved_at ? formatDate(h.approved_at) : '—' },
              ]}
            />
          </Panel>
          <CommercialTerms hospital={h} canEdit={perms.editCommercials} canFeature={perms.approvePartners} />
          {h.payout_accounts && (
            <Panel title={t('hospitalDetail.payout.title')} actions={<Landmark className="size-4 text-muted" aria-hidden />}>
              {h.payout_accounts.length === 0 ? (
                <p className="text-sm text-muted">{t('hospitalDetail.payout.empty')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {h.payout_accounts.map((a) => (
                    <li key={a.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-fg">{a.account_holder_name}</p>
                        {a.is_verified ? (
                          <Badge tone="success">{t('hospitalDetail.payout.verified')}</Badge>
                        ) : (
                          <Badge tone="warning">{t('hospitalDetail.payout.unverified')}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {a.bank_name ?? '—'} · <span className="font-mono">{a.account_number_masked}</span> · {a.ifsc ?? '—'}
                      </p>
                      {a.is_primary && (
                        <Badge tone="accent" className="mt-1.5">
                          {t('hospitalDetail.payout.primary')}
                        </Badge>
                      )}
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
        title={h.status === 'pending_review' ? t('hospitalDetail.approveDialog.titleApprove') : t('hospitalDetail.approveDialog.titleReactivate')}
        message={
          <>
            <Trans t={t} i18nKey="hospitalDetail.approveDialog.message" values={{ name: h.name }} components={{ 0: <strong /> }} />
            {h.kyc_status !== 'approved' && h.kyc_documents.length === 0 && (
              <p className="mt-2 text-warning-ink">{t('hospitalDetail.approveDialog.noKycWarning')}</p>
            )}
            {!!h.doctors_missing_registration && (
              <p className="mt-2 text-warning-ink">
                {t('hospitalDetail.approveDialog.missingRegistrationWarning', { count: h.doctors_missing_registration })}
              </p>
            )}
          </>
        }
        confirmLabel={t('hospitalDetail.approveDialog.confirm')}
        loading={approve.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => approve.mutate()}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        title={t('hospitalDetail.rejectDialog.title')}
        description={t('hospitalDetail.rejectDialog.description')}
        confirmLabel={t('hospitalDetail.rejectDialog.confirm')}
        loading={reject.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => reject.mutate(reason)}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title={t('hospitalDetail.suspendDialog.title')}
        description={t('hospitalDetail.suspendDialog.description')}
        confirmLabel={t('hospitalDetail.suspendDialog.confirm')}
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
  const { t } = useAppTranslation();
  return (
    <Panel title={t('hospitalDetail.profile.title')}>
      <FieldGrid
        columns={3}
        items={[
          { label: t('hospitalDetail.profile.legalName'), value: h.legal_name ?? '—' },
          { label: t('hospitalDetail.profile.gstin'), value: h.gstin ? <span className="font-mono">{h.gstin}</span> : '—' },
          { label: t('hospitalDetail.profile.pan'), value: h.pan_last4 ? `•••• ${h.pan_last4}` : '—' },
          { label: t('hospitalDetail.profile.address'), value: [h.address, h.city, h.state, h.pincode].filter(Boolean).join(', ') || '—' },
          { label: t('hospitalDetail.profile.phone'), value: h.phone ? <span dir="ltr">{h.phone}</span> : '—' },
          { label: t('hospitalDetail.profile.email'), value: h.email ?? '—' },
          {
            label: t('hospitalDetail.profile.website'),
            value: h.website ? (
              <a href={h.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-ink hover:underline">
                {h.website.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              '—'
            ),
          },
          { label: t('hospitalDetail.profile.established'), value: h.established_year ? String(h.established_year) : '—' },
          { label: t('hospitalDetail.profile.beds'), value: h.bed_count != null ? formatNumber(h.bed_count) : '—' },
          {
            label: t('hospitalDetail.profile.airportDistance'),
            value: h.airport_distance_km != null ? t('hospitalDetail.profile.km', { distance: formatNumber(h.airport_distance_km) }) : '—',
          },
          { label: t('hospitalDetail.profile.internationalDesk'), value: h.international_desk ? t('hospitalDetail.profile.yes') : t('hospitalDetail.profile.no') },
          { label: t('hospitalDetail.profile.languages'), value: h.languages.join(', ') || '—' },
        ]}
      />
      <div className="mt-5 space-y-4 border-t border-border pt-4">
        <div>
          <h4 className="text-xs font-medium text-muted">{t('hospitalDetail.profile.specialties')}</h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {h.specialties.length ? h.specialties.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-sm text-muted">—</span>}
          </div>
        </div>
        {h.description && (
          <div>
            <h4 className="text-xs font-medium text-muted">{t('hospitalDetail.profile.about')}</h4>
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
  const { t } = useAppTranslation();
  const columns: DataTableColumn<AdminDoctorOut>[] = [
    {
      key: 'name',
      header: t('hospitalDetail.doctors.doctor'),
      sortable: true,
      accessor: (d) => d.full_name,
      mobile: 'primary',
      cell: (d) => (
        <PersonCell
          name={d.full_name}
          secondary={
            [d.specialty_name, d.experience_years != null ? t('hospitalDetail.doctors.years', { count: d.experience_years }) : null]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />
      ),
    },
    {
      key: 'quals',
      header: t('hospitalDetail.doctors.qualifications'),
      className: 'max-w-56',
      cell: (d) => <TextCell primary={d.qualifications.join(', ') || '—'} />,
    },
    {
      key: 'reg',
      header: t('hospitalDetail.doctors.registration'),
      cell: (d) =>
        d.registration_number ? (
          <TextCell primary={<span className="font-mono">{d.registration_number}</span>} secondary={d.registration_council_name ?? d.registration_council ?? undefined} />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('hospitalDetail.doctors.verification'),
      sortable: true,
      accessor: (d) => (d.registration_verified ? 2 : d.registration_number ? 1 : 0),
      mobile: 'badge',
      cell: (d) => (
        <span className="flex flex-wrap items-center gap-1">
          {!d.is_active && <Badge>{t('hospitalDetail.doctors.inactive')}</Badge>}
          {!d.registration_number ? (
            <Badge tone="warning">{t('hospitalDetail.doctors.noRegistration')}</Badge>
          ) : d.registration_verified ? (
            <Badge
              tone="success"
              title={d.registration_verified_at ? t('hospitalDetail.doctors.verifiedAt', { date: formatDateTime(d.registration_verified_at) }) : undefined}
            >
              {t('hospitalDetail.doctors.verified')}
            </Badge>
          ) : (
            <Badge tone="warning">{t('hospitalDetail.doctors.notVerified')}</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'translations',
      header: '',
      title: t('contentTranslations.button'),
      hideable: false,
      align: 'end' as const,
      exportable: false,
      cell: (d: AdminDoctorOut) => <TranslationsButton entityType="doctor" entityId={d.id} label={d.full_name} />,
    },
    ...(canVerify
      ? [
          {
            key: 'action',
            header: '',
            title: t('hospitalDetail.doctors.action'),
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
                  {d.registration_verified ? t('hospitalDetail.doctors.unverify') : t('hospitalDetail.doctors.verify')}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
  return (
    <Panel
      title={t('hospitalDetail.doctors.title')}
      description={
        canVerify ? (
          <Trans
            t={t}
            i18nKey="hospitalDetail.doctors.verifyHelp"
            components={{
              0: <a href="https://www.nmc.org.in/" target="_blank" rel="noopener noreferrer" className="text-primary-ink hover:underline" />,
            }}
          />
        ) : undefined
      }
      bodyClassName="p-0 sm:p-0"
    >
      <DataTable
        caption={t('hospitalDetail.doctors.title')}
        columns={columns}
        rows={doctors}
        defaultSort={{ key: 'status', direction: 'asc' }}
        showViewOptions={false}
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle={t('hospitalDetail.doctors.empty')}
      />
    </Panel>
  );
}

const memberColumnsFor = (t: TFunction): DataTableColumn<HospitalMemberOut>[] => [
  {
    key: 'name',
    header: t('hospitalDetail.team.name'),
    sortable: true,
    accessor: (m) => m.full_name,
    mobile: 'primary',
    cell: (m) => <PersonCell name={m.full_name} secondary={m.email ?? undefined} />,
  },
  {
    key: 'role',
    header: t('hospitalDetail.team.role'),
    sortable: true,
    accessor: (m) => m.member_role,
    mobile: 'badge',
    cell: (m) => <Badge tone="accent">{HOSPITAL_MEMBER_ROLE_LABELS[m.member_role] ?? m.member_role}</Badge>,
  },
  {
    key: 'status',
    header: t('hospitalDetail.team.status'),
    cell: (m) => (m.status ? <StatusBadgeCell status={m.status} kind="user" /> : <span className="text-muted">—</span>),
  },
  {
    key: 'added',
    header: t('hospitalDetail.team.added'),
    sortable: true,
    accessor: (m) => m.created_at,
    cell: (m) => <DateCell value={m.created_at} display="date" />,
  },
];

const caseColumnsFor = (t: TFunction): DataTableColumn<CaseOut>[] => [
  {
    key: 'case',
    header: t('hospitalDetail.cases.case'),
    mobile: 'secondary',
    cell: (c) => <IdCell value={c.case_number} copy={false} secondary={t('hospitalDetail.cases.opened', { date: formatDate(c.created_at) })} />,
  },
  {
    key: 'patient',
    header: t('hospitalDetail.cases.patient'),
    mobile: 'primary',
    cell: (c) => <PersonCell name={c.patient.full_name} secondary={c.procedure?.name ?? c.specialty?.name ?? undefined} />,
  },
  { key: 'status', header: t('hospitalDetail.cases.status'), mobile: 'badge', cell: (c) => <StatusBadgeCell status={c.status} kind="case" /> },
  { key: 'updated', header: t('hospitalDetail.cases.updated'), cell: (c) => <DateCell value={c.updated_at} display="relative" /> },
];

function CasesTab({ hospitalId }: { hospitalId: string }) {
  const { t } = useAppTranslation();
  const caseColumns = useMemo(() => caseColumnsFor(t), [t]);
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
      title={t('hospitalDetail.cases.title')}
      description={t('hospitalDetail.cases.description')}
      actions={
        <Link to={`${opsPaths.cases}?hospital_id=${hospitalId}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          {t('hospitalDetail.cases.openInCases')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
        </Link>
      }
      bodyClassName="p-0 sm:p-0"
      footer={
        total > 10 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {t('hospitalDetail.cases.range', {
                from: formatNumber((page - 1) * 10 + 1),
                to: formatNumber(Math.min(page * 10, total)),
                total: formatNumber(total),
              })}
            </span>
            <span className="flex gap-1">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('hospitalDetail.cases.previous')}
              </Button>
              <Button size="xs" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t('hospitalDetail.cases.next')}
              </Button>
            </span>
          </div>
        ) : undefined
      }
    >
      <DataTable
        caption={t('hospitalDetail.cases.caption')}
        columns={caseColumns}
        rows={q.data?.items}
        loading={q.isLoading}
        fetching={q.isFetching && !q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowHref={(c) => opsPaths.case(c.id)}
        rowLabel={(c) => t('hospitalDetail.cases.openRow', { number: c.case_number })}
        showViewOptions={false}
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle={t('hospitalDetail.cases.empty')}
      />
    </Panel>
  );
}

const auditColumnsFor = (t: TFunction): DataTableColumn<AuditLogOut>[] => [
  {
    key: 'when',
    header: t('hospitalDetail.activity.when'),
    sortable: true,
    accessor: (l) => l.created_at,
    mobile: 'meta',
    cell: (l) => <DateCell value={l.created_at} display="relative" />,
  },
  {
    key: 'action',
    header: t('hospitalDetail.activity.action'),
    mobile: 'primary',
    cell: (l) => <span className="font-medium text-fg">{l.action.replace(/^[a-z_]+\./, '').replace(/_/g, ' ')}</span>,
  },
  {
    key: 'actor',
    header: t('hospitalDetail.activity.by'),
    cell: (l) => (
      <TextCell
        primary={l.actor_name ?? (l.actor_user_id ? t('hospitalDetail.activity.user') : t('hospitalDetail.activity.system'))}
        secondary={l.actor_role ? USER_ROLE_LABELS[l.actor_role] : undefined}
      />
    ),
  },
  {
    key: 'change',
    header: t('hospitalDetail.activity.change'),
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
  const { t } = useAppTranslation();
  const auditColumns = useMemo(() => auditColumnsFor(t), [t]);
  const audit = useQuery({
    queryKey: [...opsKeys.audit, 'hospital', hospitalId],
    queryFn: () => adminApi.auditLogs({ entity_type: 'hospital', entity_id: hospitalId, page_size: 50 }),
  });
  return (
    <Panel
      title={t('hospitalDetail.activity.title')}
      description={t('hospitalDetail.activity.description')}
      actions={
        <Link to={`${opsPaths.audit}?entity_type=hospital&entity_id=${encodeURIComponent(hospitalId)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          {t('hospitalDetail.activity.openInAudit')} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
        </Link>
      }
      bodyClassName="p-0 sm:p-0"
    >
      <DataTable
        caption={t('hospitalDetail.activity.title')}
        columns={auditColumns}
        rows={audit.data?.items}
        loading={audit.isLoading}
        error={audit.error}
        onRetry={() => void audit.refetch()}
        defaultSort={{ key: 'when', direction: 'desc' }}
        showViewOptions={false}
        responsive="cards"
        className="rounded-none border-0 shadow-none"
        emptyTitle={t('hospitalDetail.activity.empty')}
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
  const { t } = useAppTranslation();
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
    success: t('hospitalDetail.terms.updated'),
    invalidate: [opsKeys.hospitals],
  });

  const save = () => {
    const bps = pctInputToBps(pct);
    if (bps === undefined) return setError(t('hospitalDetail.terms.commissionError'));
    const cycleNum = cycle.trim() === '' ? null : Number(cycle);
    if (cycleNum !== null && (!Number.isInteger(cycleNum) || cycleNum < 1 || cycleNum > 90)) {
      return setError(t('hospitalDetail.terms.cycleError'));
    }
    setError(null);
    update.mutate({ commission_rate_bps: bps, settlement_cycle_days: cycleNum });
  };

  const dirty =
    pct !== bpsToPctInput(hospital.commission_rate_bps) || cycle !== (hospital.settlement_cycle_days?.toString() ?? '');

  return (
    <Panel title={t('hospitalDetail.terms.title')} description={t('hospitalDetail.terms.description')}>
      <div className="space-y-3">
        <Field
          label={t('hospitalDetail.terms.commissionRate')}
          hint={t('hospitalDetail.terms.commissionHint', { value: defaultBps != null ? formatBps(defaultBps) : '—' })}
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
        <Field
          label={t('hospitalDetail.terms.settlementCycle')}
          hint={t('hospitalDetail.terms.cycleHint', { value: defaultCycle != null ? formatNumber(defaultCycle) : '—' })}
        >
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
            {t('hospitalDetail.terms.save')}
          </Button>
        )}
        <div className="border-t border-border pt-3">
          <Switch
            label={t('hospitalDetail.terms.featured')}
            checked={hospital.is_featured}
            disabled={!canFeature || update.isPending}
            onChange={(v) => update.mutate({ is_featured: v })}
          />
        </div>
      </div>
    </Panel>
  );
}
