import { useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, UserPlus, Users } from 'lucide-react';
import {
  HOSPITAL_MEMBER_ROLES,
  HOSPITAL_MEMBER_ROLE_LABELS,
  errorMessage,
  hospitalPortalApi,
  type HospitalMemberOut,
  type HospitalMemberRole,
} from '@hig/shared/api';
import { filterParam, matchesSearch, useTableState } from '@hig/shared/lib';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DateCell,
  ExportButton,
  FilterBar,
  FormField,
  Input,
  Modal,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  Select,
  type DataTableColumn,
} from '@hig/shared/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useHospital } from '../../auth/HospitalProvider';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useAppTranslation } from '../../i18n';

type TFn = ReturnType<typeof useAppTranslation>['t'];

function roleHint(t: TFn, role: HospitalMemberRole): string {
  return t(`team.roleHints.${role}`);
}

function roleOptions() {
  return HOSPITAL_MEMBER_ROLES.map((r) => ({ value: r, label: HOSPITAL_MEMBER_ROLE_LABELS[r] }));
}

function makeInviteSchema(t: TFn) {
  return z.object({
    full_name: z.string().trim().min(2, t('team.invite.errors.name')).max(120),
    email: z.email({ message: t('team.invite.errors.email') }),
    member_role: z.enum(HOSPITAL_MEMBER_ROLES),
  });
}
type InviteValues = z.infer<ReturnType<typeof makeInviteSchema>>;

function InviteModal({ onClose }: { onClose: () => void }) {
  const { t } = useAppTranslation();
  const ids = useId();
  const inviteSchema = useMemo(() => makeInviteSchema(t), [t]);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { full_name: '', email: '', member_role: 'coordinator' },
  });
  const role = useWatch({ control, name: 'member_role' });
  const invite = useMutation({
    mutationFn: (v: InviteValues) => hospitalPortalApi.inviteMember(v),
    onSuccess: (m) => {
      toast.success(t('team.invite.sent', { recipient: m.email ?? m.full_name }));
      void queryClient.invalidateQueries({ queryKey: qk.members });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('team.invite.title')}
      description={t('team.invite.description')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={invite.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={invite.isPending}>
            {t('team.invite.send')}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="space-y-4" onSubmit={handleSubmit((v) => invite.mutate(v))}>
        <FormField label={t('team.invite.fullName')} htmlFor={`${ids}-name`} required error={errors.full_name?.message}>
          <Input id={`${ids}-name`} autoComplete="off" {...register('full_name')} aria-invalid={!!errors.full_name} />
        </FormField>
        <FormField label={t('team.invite.email')} htmlFor={`${ids}-email`} required error={errors.email?.message}>
          <Input id={`${ids}-email`} type="email" autoComplete="off" {...register('email')} aria-invalid={!!errors.email} />
        </FormField>
        <FormField label={t('team.invite.role')} htmlFor={`${ids}-role`} required hint={roleHint(t, role)}>
          <Select id={`${ids}-role`} options={roleOptions()} {...register('member_role')} />
        </FormField>
      </form>
    </Modal>
  );
}


type MemberStatus = 'active' | 'invited' | 'suspended';
const MEMBER_STATUSES: MemberStatus[] = ['active', 'invited', 'suspended'];
const memberStatusLabel = (t: TFn, s: MemberStatus): string => t(`team.memberStatus.${s}`);
const memberStatus = (m: HospitalMemberOut): MemberStatus =>
  m.status === 'pending_verification' ? 'invited' : m.status === 'suspended' ? 'suspended' : 'active';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.oneOf(MEMBER_STATUSES),
  role: filterParam.list(HOSPITAL_MEMBER_ROLES),
};

export function TeamPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('team.title'));
  const { user } = useAuth();
  const { canManage, memberRole } = useHospital();
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: qk.members, queryFn: hospitalPortalApi.listMembers });
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<HospitalMemberOut | null>(null);
  const table = useTableState({ filters: FILTERS, defaultSort: 'member', defaultPageSize: 25 });
  const { filters, setFilter } = table;

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: HospitalMemberRole }) => hospitalPortalApi.updateMember(id, { member_role: role }),
    onSuccess: () => {
      toast.success(t('team.roleUpdated'));
      void queryClient.invalidateQueries({ queryKey: qk.members });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (m: HospitalMemberOut) => hospitalPortalApi.removeMember(m.id),
    onSuccess: () => {
      toast.success(t('team.memberRemoved'));
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: qk.members });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const all = useMemo(() => members.data ?? [], [members.data]);
  const owners = all.filter((m) => m.member_role === 'owner').length;
  // only owners may grant or change the owner role
  const options = roleOptions().map((o) => ({ ...o, disabled: o.value === 'owner' && memberRole !== 'owner' }));
  const base = all
    .filter(matchesSearch(filters.q, (m) => [m.full_name, m.email]))
    .filter((m) => !filters.role.length || filters.role.includes(m.member_role));
  const rows = base.filter((m) => !filters.status || memberStatus(m) === filters.status);

  const locked = (m: HospitalMemberOut) =>
    !canManage || m.user_id === user?.id || (m.member_role === 'owner' && owners <= 1) || (m.member_role === 'owner' && memberRole !== 'owner');

  const columns: DataTableColumn<HospitalMemberOut>[] = [
    {
      key: 'member',
      header: t('team.columns.member'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-72',
      sortValue: (m) => m.full_name,
      cell: (m) => <PersonCell name={m.full_name} secondary={[m.user_id === user?.id ? t('team.you') : null, m.email].filter(Boolean).join(' · ') || undefined} />,
      exportValue: (m) => m.full_name,
    },
    {
      key: 'email',
      header: t('team.columns.email'),
      defaultHidden: true,
      cell: (m) => m.email ?? '—',
      exportValue: (m) => m.email ?? '',
    },
    {
      key: 'role',
      header: t('team.columns.role'),
      sortable: true,
      mobile: 'badge',
      sortValue: (m) => HOSPITAL_MEMBER_ROLES.indexOf(m.member_role),
      cell: (m) =>
        locked(m) ? (
          <Badge tone={m.member_role === 'owner' ? 'accent' : 'neutral'}>{HOSPITAL_MEMBER_ROLE_LABELS[m.member_role]}</Badge>
        ) : (
          <Select
            aria-label={t('team.roleFor', { name: m.full_name })}
            className="h-8 w-40 text-xs"
            value={m.member_role}
            options={options}
            disabled={updateRole.isPending}
            onChange={(e) => updateRole.mutate({ id: m.id, role: e.target.value as HospitalMemberRole })}
          />
        ),
      mobileCell: (m) => <Badge tone={m.member_role === 'owner' ? 'accent' : 'neutral'}>{HOSPITAL_MEMBER_ROLE_LABELS[m.member_role]}</Badge>,
      exportValue: (m) => HOSPITAL_MEMBER_ROLE_LABELS[m.member_role],
    },
    {
      key: 'status',
      header: t('common.status'),
      sortable: true,
      sortValue: (m) => MEMBER_STATUSES.indexOf(memberStatus(m)),
      cell: (m) => {
        const s = memberStatus(m);
        return (
          <Badge tone={s === 'active' ? 'success' : s === 'invited' ? 'warning' : 'danger'} dot>
            {memberStatusLabel(t, s)}
          </Badge>
        );
      },
      exportValue: (m) => memberStatusLabel(t, memberStatus(m)),
    },
    {
      key: 'added',
      header: t('team.columns.added'),
      sortable: true,
      sortDescFirst: true,
      sortValue: (m) => m.created_at,
      cell: (m) => <DateCell value={m.created_at} display="date" className="text-muted" />,
      exportValue: (m) => m.created_at,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      title: t('common.actions'),
      hideable: false,
      exportable: false,
      align: 'end',
      cell: (m) =>
        locked(m) ? null : (
          <Button variant="ghost" size="icon-sm" aria-label={t('team.removeName', { name: m.full_name })} onClick={() => setRemoving(m)}>
            <Trash2 className="size-4 text-danger-ink" aria-hidden />
          </Button>
        ),
    },
  ];

  const countBy = (s: MemberStatus) => base.filter((m) => memberStatus(m) === s).length;
  const inviteButton = canManage ? (
    <Button leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setInviting(true)}>
      {t('team.inviteMember')}
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title={t('team.title')} description={t('team.description')} actions={inviteButton} />
      <DataTable
        id="hospital.team"
        caption={t('team.caption')}
        table={table}
        columns={columns}
        rows={members.data ? rows : undefined}
        loading={members.isPending}
        error={members.error}
        onRetry={() => void members.refetch()}
        emptyIcon={<Users className="size-6" aria-hidden />}
        emptyTitle={t('team.emptyTitle')}
        emptyAction={inviteButton}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('team.statusFilter')}
              items={[
                { value: '', label: t('common.all'), count: base.length },
                ...MEMBER_STATUSES.map((s) => ({ value: s, label: memberStatusLabel(t, s), count: countBy(s) })),
              ]}
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('team.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="team" columns={columns} rows={rows} />}
          >
            <MultiSelectFilter
              label={t('team.columns.role')}
              value={filters.role}
              onChange={(v) => setFilter('role', v)}
              options={HOSPITAL_MEMBER_ROLES.map((r) => ({
                value: r,
                label: HOSPITAL_MEMBER_ROLE_LABELS[r],
                description: roleHint(t, r),
                count: all.filter((m) => m.member_role === r).length,
              }))}
            />
          </FilterBar>
        }
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {HOSPITAL_MEMBER_ROLES.map((r) => (
          <div key={r} className="rounded-lg border border-border bg-surface p-3 text-xs">
            <p className="font-semibold text-fg">{HOSPITAL_MEMBER_ROLE_LABELS[r]}</p>
            <p className="mt-0.5 text-muted">{roleHint(t, r)}</p>
          </div>
        ))}
      </div>
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
        keepOpenOnConfirm
        loading={remove.isPending}
        tone="danger"
        title={t('team.removeTitle')}
        description={removing ? t('team.removeDescription', { name: removing.full_name }) : undefined}
        confirmLabel={t('common.remove')}
      />
    </div>
  );
}
