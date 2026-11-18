import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, Globe2, ShieldCheck, UserCog } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import {
  adminApi,
  USER_ROLES,
  USER_ROLE_LABELS,
  USER_STATUSES,
  USER_STATUS_LABELS,
  type AdminUserListParams,
  type AdminUserOut,
  type UserRole,
  type UserStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Avatar,
  Badge as UiBadge,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Button, ConfirmDialog, Drawer, ErrorState, Field, LoadingState, Select } from '../ui';
import { DrawerSummary } from '../components/DrawerSummary';
import { Banner, FieldGrid, Panel } from '../ui/detail';
import { formatDateTime, useDocumentTitle } from '../lib/format';
import { countryName, useAdminFacets } from '../lib/lookups';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { assignableRoles } from '../lib/permissions';
import { useOpsPermissions } from '../lib/session';

const SECURITY = ['verified', 'unverified', 'mfa', 'no_mfa', 'guest'] as const;
type SecurityFilter = (typeof SECURITY)[number];
const SECURITY_LABEL_KEYS: Record<SecurityFilter, string> = {
  verified: 'users.security.verified',
  unverified: 'users.security.unverified',
  mfa: 'users.security.mfa',
  no_mfa: 'users.security.noMfa',
  guest: 'users.security.guest',
};

const FILTERS = {
  q: filterParam.text(),
  role: filterParam.list(USER_ROLES),
  status: filterParam.list(USER_STATUSES),
  country: filterParam.list(),
  security: filterParam.oneOf(SECURITY),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['created_at', 'last_login_at', 'full_name', 'email'] as const;
type UserFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: UserFilters): Omit<AdminUserListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    role: f.role.length ? f.role : undefined,
    status: f.status.length ? f.status : undefined,
    country_code: f.country.length ? f.country : undefined,
    created_from: f.from || undefined,
    created_to: f.to || undefined,
    email_verified: f.security === 'verified' ? true : f.security === 'unverified' ? false : undefined,
    mfa_enabled: f.security === 'mfa' ? true : f.security === 'no_mfa' ? false : undefined,
    is_guest: f.security === 'guest' ? true : undefined,
  };
}

const QUICK_ROLES: UserRole[] = ['patient', 'agent', 'hospital', 'support', 'finance', 'admin', 'super_admin'];

function userColumns(t: TFunction): DataTableColumn<AdminUserOut>[] {
  return [
    {
      key: 'full_name',
      header: t('users.columns.user'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-72',
      cell: (u) => (
        <PersonCell
          name={u.full_name || u.email || t('users.unnamedUser')}
          src={u.avatar_url}
          secondary={u.email ?? (u.is_guest ? t('users.guestAccount') : u.phone ?? undefined)}
        />
      ),
      exportValue: (u) => u.full_name,
    },
    {
      key: 'email',
      header: t('users.columns.email'),
      sortable: true,
      defaultHidden: true,
      cell: (u) => u.email ?? <span className="text-muted">—</span>,
      exportValue: (u) => u.email ?? '',
    },
    {
      key: 'role',
      header: t('users.columns.role'),
      mobile: 'secondary',
      cell: (u) => <UiBadge tone="accent">{USER_ROLE_LABELS[u.role] ?? u.role}</UiBadge>,
      mobileCell: (u) => USER_ROLE_LABELS[u.role] ?? u.role,
      exportValue: (u) => USER_ROLE_LABELS[u.role] ?? u.role,
    },
    {
      key: 'status',
      header: t('users.columns.status'),
      mobile: 'badge',
      cell: (u) => <StatusBadgeCell status={u.status} kind="user" />,
      exportValue: (u) => USER_STATUS_LABELS[u.status],
    },
    {
      key: 'security',
      header: t('users.columns.security'),
      cell: (u) =>
        u.email_verified || u.mfa_enabled || u.is_guest ? (
          <span className="flex flex-wrap gap-1">
            {u.email_verified && <UiBadge tone="success">{t('users.badges.verified')}</UiBadge>}
            {u.mfa_enabled && <UiBadge tone="info">{t('users.badges.mfa')}</UiBadge>}
            {u.is_guest && <UiBadge tone="neutral">{t('users.badges.guest')}</UiBadge>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (u) => [u.email_verified && 'verified', u.mfa_enabled && 'mfa', u.is_guest && 'guest'].filter(Boolean).join(' '),
    },
    {
      key: 'country',
      header: t('users.columns.country'),
      cell: (u) => (u.country_code ? <span title={u.country_code}>{countryName(u.country_code)}</span> : <span className="text-muted">—</span>),
      exportValue: (u) => u.country_code ?? '',
    },
    {
      key: 'last_login_at',
      header: t('users.columns.lastLogin'),
      sortable: true,
      sortDescFirst: true,
      cell: (u) =>
        u.last_login_at ? (
          <DateCell value={u.last_login_at} display="relative" className="text-muted" />
        ) : (
          <span className="text-muted">{t('users.never')}</span>
        ),
      exportValue: (u) => u.last_login_at ?? '',
    },
    {
      key: 'created_at',
      header: t('users.columns.joined'),
      sortable: true,
      sortDescFirst: true,
      cell: (u) => <DateCell value={u.created_at} display="date" />,
      exportValue: (u) => u.created_at,
    },
  ];
}

export default function UsersPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('users.title'));
  const columns = useMemo(() => userColumns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: AdminUserListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...opsKeys.users, 'list', listParams],
    queryFn: () => adminApi.listUsers(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...opsKeys.users, 'role-counts', apiFilters],
    queryFn: () => adminApi.userRoleCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const facets = useAdminFacets();

  const roleOptions: FilterOption<UserRole>[] = USER_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r], count: counts.data?.counts[r] }));
  const quickItems: QuickFilterItem<UserRole>[] = [
    { value: '', label: t('users.filters.all'), count: counts.data?.total },
    ...QUICK_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r], count: counts.data?.counts[r] })),
  ];
  const quickValue = filters.role.length === 0 ? '' : filters.role.length === 1 ? filters.role[0]! : null;

  return (
    <div>
      <PageHeader title={t('users.title')} description={t('users.description')} />
      <DataTable
        id="admin.users"
        caption={t('users.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(u) => setSelectedId(u.id)}
        rowLabel={(u) => t('users.openRow', { name: u.full_name || u.email || t('users.userFallback') })}
        emptyTitle={t('users.empty')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('users.filters.role')} items={quickItems} value={quickValue} onChange={(r) => setFilter('role', r ? [r] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('users.filters.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="users"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => adminApi.listUsers({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
            more={
              <SelectFilter
                label={t('users.filters.security')}
                icon={<ShieldCheck className="size-3.5 opacity-70" aria-hidden />}
                value={filters.security}
                onChange={(v) => setFilter('security', v)}
                options={SECURITY.map((s) => ({ value: s, label: t(SECURITY_LABEL_KEYS[s]) }))}
              />
            }
          >
            <MultiSelectFilter label={t('users.filters.role')} value={filters.role} onChange={(v) => setFilter('role', v)} options={roleOptions} />
            <MultiSelectFilter
              label={t('users.filters.status')}
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={USER_STATUSES.map((s) => ({ value: s, label: USER_STATUS_LABELS[s], tone: statusTone(s, 'user') }))}
            />
            <MultiSelectFilter
              label={t('users.filters.country')}
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.country}
              onChange={(v) => setFilter('country', v)}
              options={(facets.data?.user_countries ?? []).map((c) => ({ value: c, label: countryName(c), description: c }))}
              loading={facets.isLoading}
              searchable
            />
            <DateRangeFilter
              label={t('users.filters.joined')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
            />
          </FilterBar>
        }
      />
      <UserDrawer userId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

type PendingAction = { kind: 'status'; status: UserStatus } | { kind: 'role'; role: UserRole };

function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const detail = useQuery({
    queryKey: [...opsKeys.users, 'detail', userId],
    queryFn: () => adminApi.getUser(userId!),
    enabled: !!userId,
  });
  const [role, setRole] = useState<UserRole | ''>('');
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    setRole(detail.data?.role ?? '');
  }, [detail.data?.role]);

  const update = useOpsMutation({
    mutationFn: (body: { status?: UserStatus; role?: UserRole }) => adminApi.updateUser(userId!, body),
    success: () => t('users.toast.updated'),
    invalidate: [opsKeys.users, opsKeys.dashboard, opsKeys.staff],
    onSuccess: () => setPending(null),
  });

  const u = detail.data;
  const isSelf = !!u && perms.user?.id === u.id;
  const canEdit = perms.manageUsers && !isSelf && !(u?.role === 'super_admin' && !perms.isSuperAdmin);

  return (
    <Drawer
      open={!!userId}
      onClose={onClose}
      width="xl"
      title={u?.full_name || u?.email || t('users.drawer.titleFallback')}
      subtitle={u?.email ?? undefined}
    >
      {detail.isLoading ? (
        <LoadingState />
      ) : detail.error || !u ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <div className="space-y-4">
          <DrawerSummary
            avatar={<Avatar name={u.full_name || u.email || '?'} src={u.avatar_url ?? undefined} size="lg" />}
            badges={
              <>
                <UiBadge tone="accent">{USER_ROLE_LABELS[u.role]}</UiBadge>
                <StatusBadgeCell status={u.status} kind="user" />
                {u.is_guest && <UiBadge tone="neutral">{t('users.badges.guest')}</UiBadge>}
                {u.mfa_enabled && <UiBadge tone="info">{t('users.security.mfa')}</UiBadge>}
                {u.email_verified ? (
                  <UiBadge tone="success">{t('users.security.verified')}</UiBadge>
                ) : (
                  <UiBadge tone="warning">{t('users.security.unverified')}</UiBadge>
                )}
              </>
            }
            meta={
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>{t('users.drawer.joinedOn', { date: formatDateTime(u.created_at, 'd MMM yyyy') })}</span>
                <span>{t('users.drawer.lastLoginOn', { date: formatDateTime(u.last_login_at, undefined, t('users.drawer.neverLower')) })}</span>
              </span>
            }
            actions={
              canEdit &&
              (u.status === 'suspended' ? (
                <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => setPending({ kind: 'status', status: 'active' })}>
                  {t('users.actions.activate')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Ban className="size-4" />}
                  onClick={() => setPending({ kind: 'status', status: 'suspended' })}
                  disabled={u.status === 'deleted'}
                >
                  {t('users.actions.suspend')}
                </Button>
              ))
            }
          />

          {u.locked_until && new Date(u.locked_until) > new Date() && (
            <Banner
              tone="warning"
              icon={<ShieldCheck className="size-4" aria-hidden />}
              title={t('users.drawer.lockedUntilTitle', { date: formatDateTime(u.locked_until) })}
            >
              {t('users.drawer.failedAttempts', { count: u.failed_login_count ?? 0 })}
            </Banner>
          )}

          <Panel title={t('users.drawer.profile')}>
            <FieldGrid
              items={[
                {
                  label: t('users.drawer.email'),
                  value: u.email ? (
                    <a href={`mailto:${u.email}`} className="text-primary-ink hover:underline">
                      {u.email}
                    </a>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: t('users.drawer.phone'),
                  value: u.phone ? (
                    <a href={`tel:${u.phone}`} className="text-primary-ink hover:underline">
                      {u.phone}
                    </a>
                  ) : (
                    '—'
                  ),
                },
                { label: t('users.drawer.country'), value: u.country_code ? `${countryName(u.country_code)} (${u.country_code})` : '—' },
                { label: t('users.drawer.language'), value: u.preferred_language },
                { label: t('users.drawer.agentId'), value: u.agent_id ? <span className="font-mono text-xs">{u.agent_id}</span> : '—' },
                {
                  label: t('users.drawer.patientProfile'),
                  value: u.patient_profile_id ? <span className="font-mono text-xs">{u.patient_profile_id}</span> : '—',
                },
              ]}
            />
          </Panel>

          <Panel title={t('users.drawer.security')}>
            <FieldGrid
              columns={3}
              items={[
                { label: t('users.drawer.lastLogin'), value: formatDateTime(u.last_login_at, undefined, t('users.never')) },
                { label: t('users.drawer.failedLogins'), value: String(u.failed_login_count ?? 0) },
                { label: t('users.drawer.lockedUntil'), value: formatDateTime(u.locked_until, undefined, '—') },
              ]}
            />
          </Panel>

          {u.hospitals && u.hospitals.length > 0 && (
            <Panel title={t('users.drawer.hospitalMemberships')} bodyClassName="p-0">
              <ul className="divide-y divide-border">
                {u.hospitals.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="truncate font-medium">{h.name}</span>
                    <UiBadge tone="neutral">{h.member_role}</UiBadge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <UserCog className="size-4" aria-hidden /> {t('users.drawer.role')}
              </span>
            }
          >
            {!perms.manageUsers ? (
              <p className="text-sm text-muted">{t('users.drawer.onlyAdmins')}</p>
            ) : isSelf ? (
              <p className="text-sm text-muted">{t('users.drawer.cannotChangeSelf')}</p>
            ) : !canEdit ? (
              <p className="text-sm text-muted">{t('users.drawer.onlySuperAdmin')}</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t('users.drawer.role')} className="min-w-[12rem] flex-1">
                  {(id) => (
                    <Select
                      id={id}
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      options={assignableRoles(perms.role).map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
                    />
                  )}
                </Field>
                <Button
                  variant="outline"
                  icon={<ShieldCheck className="size-4" />}
                  disabled={!role || role === u.role}
                  onClick={() => role && setPending({ kind: 'role', role })}
                >
                  {t('users.actions.changeRole')}
                </Button>
              </div>
            )}
          </Panel>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        loading={update.isPending}
        tone={pending?.kind === 'status' && pending.status === 'suspended' ? 'danger' : 'primary'}
        title={
          pending?.kind === 'role'
            ? t('users.confirm.changeRoleTitle')
            : pending?.status === 'suspended'
              ? t('users.confirm.suspendTitle')
              : t('users.confirm.activateTitle')
        }
        confirmLabel={
          pending?.kind === 'role'
            ? t('users.actions.changeRole')
            : pending?.status === 'suspended'
              ? t('users.actions.suspend')
              : t('users.actions.activate')
        }
        message={
          pending?.kind === 'role' ? (
            <Trans
              t={t}
              i18nKey="users.confirm.changeRoleMessage"
              values={{ name: u?.full_name ?? '', role: USER_ROLE_LABELS[pending.role], previous: u ? USER_ROLE_LABELS[u.role] : '—' }}
              components={{ 0: <strong />, 1: <strong /> }}
            />
          ) : pending?.status === 'suspended' ? (
            <Trans t={t} i18nKey="users.confirm.suspendMessage" values={{ name: u?.full_name ?? '' }} components={{ 0: <strong /> }} />
          ) : (
            <Trans t={t} i18nKey="users.confirm.activateMessage" values={{ name: u?.full_name ?? '' }} components={{ 0: <strong /> }} />
          )
        }
        onConfirm={() => {
          if (!pending) return;
          update.mutate(pending.kind === 'role' ? { role: pending.role } : { status: pending.status });
        }}
      />
    </Drawer>
  );
}
