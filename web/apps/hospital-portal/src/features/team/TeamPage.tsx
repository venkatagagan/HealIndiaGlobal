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


const ROLE_HINTS: Record<HospitalMemberRole, string> = {
  owner: 'Full access including team and payouts',
  admin: 'Manage profile, pricing, doctors and team',
  coordinator: 'Handle enquiries, quotes, bookings and messages',
  finance: 'Settlements, payouts and statements',
  doctor: 'View cases and patient documents',
};

const roleOptions = HOSPITAL_MEMBER_ROLES.map((r) => ({ value: r, label: HOSPITAL_MEMBER_ROLE_LABELS[r] }));

const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter their name').max(120),
  email: z.email({ message: 'Enter a valid email' }),
  member_role: z.enum(HOSPITAL_MEMBER_ROLES),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteModal({ onClose }: { onClose: () => void }) {
  const ids = useId();
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
      toast.success(`Invitation sent to ${m.email ?? m.full_name}`);
      void queryClient.invalidateQueries({ queryKey: qk.members });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Invite team member"
      description="They receive an email to set their password and join this hospital."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${ids}-form`} loading={invite.isPending}>
            Send invite
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} noValidate className="space-y-4" onSubmit={handleSubmit((v) => invite.mutate(v))}>
        <FormField label="Full name" htmlFor={`${ids}-name`} required error={errors.full_name?.message}>
          <Input id={`${ids}-name`} autoComplete="off" {...register('full_name')} aria-invalid={!!errors.full_name} />
        </FormField>
        <FormField label="Email" htmlFor={`${ids}-email`} required error={errors.email?.message}>
          <Input id={`${ids}-email`} type="email" autoComplete="off" {...register('email')} aria-invalid={!!errors.email} />
        </FormField>
        <FormField label="Role" htmlFor={`${ids}-role`} required hint={ROLE_HINTS[role]}>
          <Select id={`${ids}-role`} options={roleOptions} {...register('member_role')} />
        </FormField>
      </form>
    </Modal>
  );
}


type MemberStatus = 'active' | 'invited' | 'suspended';
const MEMBER_STATUSES: MemberStatus[] = ['active', 'invited', 'suspended'];
const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = { active: 'Active', invited: 'Invited', suspended: 'Suspended' };
const memberStatus = (m: HospitalMemberOut): MemberStatus =>
  m.status === 'pending_verification' ? 'invited' : m.status === 'suspended' ? 'suspended' : 'active';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.oneOf(MEMBER_STATUSES),
  role: filterParam.list(HOSPITAL_MEMBER_ROLES),
};

export function TeamPage() {
  useDocumentTitle('Team');
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
      toast.success('Role updated');
      void queryClient.invalidateQueries({ queryKey: qk.members });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (m: HospitalMemberOut) => hospitalPortalApi.removeMember(m.id),
    onSuccess: () => {
      toast.success('Member removed');
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: qk.members });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const all = useMemo(() => members.data ?? [], [members.data]);
  const owners = all.filter((m) => m.member_role === 'owner').length;
  // only owners may grant or change the owner role
  const options = roleOptions.map((o) => ({ ...o, disabled: o.value === 'owner' && memberRole !== 'owner' }));
  const base = all
    .filter(matchesSearch(filters.q, (m) => [m.full_name, m.email]))
    .filter((m) => !filters.role.length || filters.role.includes(m.member_role));
  const rows = base.filter((m) => !filters.status || memberStatus(m) === filters.status);

  const locked = (m: HospitalMemberOut) =>
    !canManage || m.user_id === user?.id || (m.member_role === 'owner' && owners <= 1) || (m.member_role === 'owner' && memberRole !== 'owner');

  const columns: DataTableColumn<HospitalMemberOut>[] = [
    {
      key: 'member',
      header: 'Member',
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-72',
      sortValue: (m) => m.full_name,
      cell: (m) => <PersonCell name={m.full_name} secondary={[m.user_id === user?.id ? 'You' : null, m.email].filter(Boolean).join(' · ') || undefined} />,
      exportValue: (m) => m.full_name,
    },
    {
      key: 'email',
      header: 'Email',
      defaultHidden: true,
      cell: (m) => m.email ?? '—',
      exportValue: (m) => m.email ?? '',
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      mobile: 'badge',
      sortValue: (m) => HOSPITAL_MEMBER_ROLES.indexOf(m.member_role),
      cell: (m) =>
        locked(m) ? (
          <Badge tone={m.member_role === 'owner' ? 'accent' : 'neutral'}>{HOSPITAL_MEMBER_ROLE_LABELS[m.member_role]}</Badge>
        ) : (
          <Select
            aria-label={`Role for ${m.full_name}`}
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
      header: 'Status',
      sortable: true,
      sortValue: (m) => MEMBER_STATUSES.indexOf(memberStatus(m)),
      cell: (m) => {
        const s = memberStatus(m);
        return (
          <Badge tone={s === 'active' ? 'success' : s === 'invited' ? 'warning' : 'danger'} dot>
            {MEMBER_STATUS_LABELS[s]}
          </Badge>
        );
      },
      exportValue: (m) => MEMBER_STATUS_LABELS[memberStatus(m)],
    },
    {
      key: 'added',
      header: 'Added',
      sortable: true,
      sortDescFirst: true,
      sortValue: (m) => m.created_at,
      cell: (m) => <DateCell value={m.created_at} display="date" className="text-muted" />,
      exportValue: (m) => m.created_at,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      hideable: false,
      exportable: false,
      align: 'end',
      cell: (m) =>
        locked(m) ? null : (
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.full_name}`} onClick={() => setRemoving(m)}>
            <Trash2 className="size-4 text-danger-ink" aria-hidden />
          </Button>
        ),
    },
  ];

  const countBy = (s: MemberStatus) => base.filter((m) => memberStatus(m) === s).length;
  const inviteButton = canManage ? (
    <Button leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setInviting(true)}>
      Invite member
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title="Team" description="People from your hospital who can access this portal, and what each role may do." actions={inviteButton} />
      <DataTable
        id="hospital.team"
        caption="Team members"
        table={table}
        columns={columns}
        rows={members.data ? rows : undefined}
        loading={members.isPending}
        error={members.error}
        onRetry={() => void members.refetch()}
        emptyIcon={<Users className="size-6" aria-hidden />}
        emptyTitle="No team members"
        emptyAction={inviteButton}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Member status"
              items={[{ value: '', label: 'All', count: base.length }, ...MEMBER_STATUSES.map((s) => ({ value: s, label: MEMBER_STATUS_LABELS[s], count: countBy(s) }))]}
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name or email…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="team" columns={columns} rows={rows} />}
          >
            <MultiSelectFilter
              label="Role"
              value={filters.role}
              onChange={(v) => setFilter('role', v)}
              options={HOSPITAL_MEMBER_ROLES.map((r) => ({
                value: r,
                label: HOSPITAL_MEMBER_ROLE_LABELS[r],
                description: ROLE_HINTS[r],
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
            <p className="mt-0.5 text-muted">{ROLE_HINTS[r]}</p>
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
        title="Remove team member?"
        description={removing ? `${removing.full_name} will immediately lose access to this hospital's portal.` : undefined}
        confirmLabel="Remove"
      />
    </div>
  );
}
