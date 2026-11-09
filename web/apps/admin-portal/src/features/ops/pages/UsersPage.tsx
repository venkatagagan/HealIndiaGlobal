import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, Globe2, ShieldCheck, UserCog } from 'lucide-react';
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
const SECURITY_LABELS: Record<SecurityFilter, string> = {
  verified: 'Email verified',
  unverified: 'Email not verified',
  mfa: 'MFA on',
  no_mfa: 'MFA off',
  guest: 'Guest accounts',
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

const COLUMNS: DataTableColumn<AdminUserOut>[] = [
  {
    key: 'full_name',
    header: 'User',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-72',
    cell: (u) => <PersonCell name={u.full_name || u.email || 'Unnamed user'} src={u.avatar_url} secondary={u.email ?? (u.is_guest ? 'Guest account' : u.phone ?? undefined)} />,
    exportValue: (u) => u.full_name,
  },
  {
    key: 'email',
    header: 'Email',
    sortable: true,
    defaultHidden: true,
    cell: (u) => u.email ?? <span className="text-muted">—</span>,
    exportValue: (u) => u.email ?? '',
  },
  {
    key: 'role',
    header: 'Role',
    mobile: 'secondary',
    cell: (u) => <UiBadge tone="accent">{USER_ROLE_LABELS[u.role] ?? u.role}</UiBadge>,
    mobileCell: (u) => USER_ROLE_LABELS[u.role] ?? u.role,
    exportValue: (u) => USER_ROLE_LABELS[u.role] ?? u.role,
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'badge',
    cell: (u) => <StatusBadgeCell status={u.status} kind="user" />,
    exportValue: (u) => USER_STATUS_LABELS[u.status],
  },
  {
    key: 'security',
    header: 'Security',
    cell: (u) =>
      u.email_verified || u.mfa_enabled || u.is_guest ? (
        <span className="flex flex-wrap gap-1">
          {u.email_verified && <UiBadge tone="success">Verified</UiBadge>}
          {u.mfa_enabled && <UiBadge tone="info">MFA</UiBadge>}
          {u.is_guest && <UiBadge tone="neutral">Guest</UiBadge>}
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (u) => [u.email_verified && 'verified', u.mfa_enabled && 'mfa', u.is_guest && 'guest'].filter(Boolean).join(' '),
  },
  {
    key: 'country',
    header: 'Country',
    cell: (u) => (u.country_code ? <span title={u.country_code}>{countryName(u.country_code)}</span> : <span className="text-muted">—</span>),
    exportValue: (u) => u.country_code ?? '',
  },
  {
    key: 'last_login_at',
    header: 'Last login',
    sortable: true,
    sortDescFirst: true,
    cell: (u) => (u.last_login_at ? <DateCell value={u.last_login_at} display="relative" className="text-muted" /> : <span className="text-muted">Never</span>),
    exportValue: (u) => u.last_login_at ?? '',
  },
  {
    key: 'created_at',
    header: 'Joined',
    sortable: true,
    sortDescFirst: true,
    cell: (u) => <DateCell value={u.created_at} display="date" />,
    exportValue: (u) => u.created_at,
  },
];

export default function UsersPage() {
  useDocumentTitle('Users');
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
    { value: '', label: 'All', count: counts.data?.total },
    ...QUICK_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r], count: counts.data?.counts[r] })),
  ];
  const quickValue = filters.role.length === 0 ? '' : filters.role.length === 1 ? filters.role[0]! : null;

  return (
    <div>
      <PageHeader title="Users" description="Every account on the platform — patients, agents, hospital teams and staff." />
      <DataTable
        id="admin.users"
        caption="Users"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(u) => setSelectedId(u.id)}
        rowLabel={(u) => `Open ${u.full_name || u.email || 'user'}`}
        emptyTitle="No users yet"
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Role" items={quickItems} value={quickValue} onChange={(r) => setFilter('role', r ? [r] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name, email or phone…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="users"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => adminApi.listUsers({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
            more={
              <SelectFilter
                label="Security"
                icon={<ShieldCheck className="size-3.5 opacity-70" aria-hidden />}
                value={filters.security}
                onChange={(v) => setFilter('security', v)}
                options={SECURITY.map((s) => ({ value: s, label: SECURITY_LABELS[s] }))}
              />
            }
          >
            <MultiSelectFilter label="Role" value={filters.role} onChange={(v) => setFilter('role', v)} options={roleOptions} />
            <MultiSelectFilter
              label="Status"
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={USER_STATUSES.map((s) => ({ value: s, label: USER_STATUS_LABELS[s], tone: statusTone(s, 'user') }))}
            />
            <MultiSelectFilter
              label="Country"
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.country}
              onChange={(v) => setFilter('country', v)}
              options={(facets.data?.user_countries ?? []).map((c) => ({ value: c, label: countryName(c), description: c }))}
              loading={facets.isLoading}
              searchable
            />
            <DateRangeFilter label="Joined" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <UserDrawer userId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

type PendingAction = { kind: 'status'; status: UserStatus } | { kind: 'role'; role: UserRole };

function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
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
    success: 'User updated',
    invalidate: [opsKeys.users, opsKeys.dashboard, opsKeys.staff],
    onSuccess: () => setPending(null),
  });

  const u = detail.data;
  const isSelf = !!u && perms.user?.id === u.id;
  const canEdit = perms.manageUsers && !isSelf && !(u?.role === 'super_admin' && !perms.isSuperAdmin);

  return (
    <Drawer open={!!userId} onClose={onClose} width="xl" title={u?.full_name || u?.email || 'User'} subtitle={u?.email ?? undefined}>
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
                {u.is_guest && <UiBadge tone="neutral">Guest</UiBadge>}
                {u.mfa_enabled && <UiBadge tone="info">MFA on</UiBadge>}
                {u.email_verified ? <UiBadge tone="success">Email verified</UiBadge> : <UiBadge tone="warning">Email not verified</UiBadge>}
              </>
            }
            meta={
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>Joined {formatDateTime(u.created_at, 'd MMM yyyy')}</span>
                <span>Last login {formatDateTime(u.last_login_at, undefined, 'never')}</span>
              </span>
            }
            actions={
              canEdit &&
              (u.status === 'suspended' ? (
                <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => setPending({ kind: 'status', status: 'active' })}>
                  Activate
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Ban className="size-4" />}
                  onClick={() => setPending({ kind: 'status', status: 'suspended' })}
                  disabled={u.status === 'deleted'}
                >
                  Suspend
                </Button>
              ))
            }
          />

          {u.locked_until && new Date(u.locked_until) > new Date() && (
            <Banner tone="warning" icon={<ShieldCheck className="size-4" aria-hidden />} title={`Locked until ${formatDateTime(u.locked_until)}`}>
              {u.failed_login_count ?? 0} failed sign-in attempts.
            </Banner>
          )}

          <Panel title="Profile">
            <FieldGrid
              items={[
                { label: 'Email', value: u.email ? <a href={`mailto:${u.email}`} className="text-primary-ink hover:underline">{u.email}</a> : '—' },
                { label: 'Phone', value: u.phone ? <a href={`tel:${u.phone}`} className="text-primary-ink hover:underline">{u.phone}</a> : '—' },
                { label: 'Country', value: u.country_code ? `${countryName(u.country_code)} (${u.country_code})` : '—' },
                { label: 'Language', value: u.preferred_language },
                { label: 'Agent id', value: u.agent_id ? <span className="font-mono text-xs">{u.agent_id}</span> : '—' },
                { label: 'Patient profile', value: u.patient_profile_id ? <span className="font-mono text-xs">{u.patient_profile_id}</span> : '—' },
              ]}
            />
          </Panel>

          <Panel title="Security">
            <FieldGrid
              columns={3}
              items={[
                { label: 'Last login', value: formatDateTime(u.last_login_at, undefined, 'Never') },
                { label: 'Failed logins', value: String(u.failed_login_count ?? 0) },
                { label: 'Locked until', value: formatDateTime(u.locked_until, undefined, '—') },
              ]}
            />
          </Panel>

          {u.hospitals && u.hospitals.length > 0 && (
            <Panel title="Hospital memberships" bodyClassName="p-0">
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

          <Panel title={<span className="inline-flex items-center gap-2"><UserCog className="size-4" aria-hidden /> Role</span>}>
            {!perms.manageUsers ? (
              <p className="text-sm text-muted">Only operations admins can change users.</p>
            ) : isSelf ? (
              <p className="text-sm text-muted">You cannot change your own account here.</p>
            ) : !canEdit ? (
              <p className="text-sm text-muted">Only a super admin can change another super admin.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Role" className="min-w-[12rem] flex-1">
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
                  Change role
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
          pending?.kind === 'role' ? 'Change role?' : pending?.status === 'suspended' ? 'Suspend user?' : 'Activate user?'
        }
        confirmLabel={pending?.kind === 'role' ? 'Change role' : pending?.status === 'suspended' ? 'Suspend' : 'Activate'}
        message={
          pending?.kind === 'role' ? (
            <>
              <strong>{u?.full_name}</strong> will become <strong>{USER_ROLE_LABELS[pending.role]}</strong>
              {' '}(was {u ? USER_ROLE_LABELS[u.role] : '—'}). Their permissions change immediately and the change is
              recorded in the audit log.
            </>
          ) : pending?.status === 'suspended' ? (
            <>
              <strong>{u?.full_name}</strong> will be signed out and unable to log in until reactivated.
            </>
          ) : (
            <>
              <strong>{u?.full_name}</strong> will be able to sign in again.
            </>
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
