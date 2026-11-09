import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, UserPlus } from 'lucide-react';
import {
  adminApi,
  fieldErrors,
  STAFF_ROLES,
  USER_ROLE_LABELS,
  type StaffMemberOut,
  type StaffRole,
  type UserRole,
} from '@hig/shared/api';
import { filterParam, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  Badge,
  Button as UiButton,
  DataTable,
  ExportButton,
  FilterBar,
  PageHeader,
  PersonCell,
  QuickFilters,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { Button, Field, Input, Modal, Select } from '../ui';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'At least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Must contain a letter and a digit.';
  return null;
}

const ROLE_TONE: Record<StaffRole, 'accent' | 'success' | 'info' | 'warning'> = {
  super_admin: 'warning',
  admin: 'accent',
  finance: 'success',
  support: 'info',
};

const FILTERS = { q: filterParam.text(), role: filterParam.oneOf(STAFF_ROLES) };

const COLUMNS: DataTableColumn<StaffMemberOut>[] = [
  {
    key: 'full_name',
    header: 'Name',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-72',
    cell: (s) => <PersonCell name={s.full_name} secondary={s.email ?? undefined} />,
    exportValue: (s) => s.full_name,
  },
  {
    key: 'email',
    header: 'Email',
    sortable: true,
    defaultHidden: true,
    cell: (s) => s.email ?? <span className="text-muted">—</span>,
    exportValue: (s) => s.email ?? '',
  },
  {
    key: 'role',
    header: 'Role',
    sortable: true,
    mobile: 'badge',
    sortValue: (s) => USER_ROLE_LABELS[s.role],
    cell: (s) => <Badge tone={ROLE_TONE[s.role as StaffRole] ?? 'neutral'}>{USER_ROLE_LABELS[s.role] ?? s.role}</Badge>,
    exportValue: (s) => USER_ROLE_LABELS[s.role] ?? s.role,
  },
  {
    key: 'phone',
    header: 'Phone',
    cell: (s) =>
      s.phone ? (
        <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary-ink hover:underline">
          <Phone className="size-3.5" aria-hidden /> {s.phone}
        </a>
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (s) => s.phone ?? '',
  },
];

export default function StaffPage() {
  useDocumentTitle('Staff');
  const perms = useOpsPermissions();
  const table = useTableState({ filters: FILTERS, defaultSort: 'full_name', defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: [...opsKeys.staff, 'all'], queryFn: () => adminApi.listStaff() });

  const searched = useMemo(() => (list.data ?? []).filter(matchesSearch(filters.q, (s) => [s.full_name, s.email, s.phone])), [list.data, filters.q]);
  const rows = useMemo(() => (filters.role ? searched.filter((s) => s.role === filters.role) : searched), [searched, filters.role]);
  const quickItems: QuickFilterItem<StaffRole>[] = [
    { value: '', label: 'All staff', count: list.data ? searched.length : undefined },
    ...STAFF_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r], count: list.data ? searched.filter((s) => s.role === r).length : undefined })),
  ];

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Operations, finance and support users who work in this console."
        actions={
          perms.manageUsers && (
            <UiButton leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              New staff user
            </UiButton>
          )
        }
      />
      <DataTable
        id="admin.staff"
        caption="Staff"
        table={table}
        columns={COLUMNS}
        rows={list.data ? rows : undefined}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No staff users yet"
        emptyAction={
          perms.manageUsers ? (
            <UiButton size="sm" leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              New staff user
            </UiButton>
          ) : undefined
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Staff role" items={quickItems} value={filters.role} onChange={(r) => setFilter('role', r)} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name, email or phone…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="staff" columns={COLUMNS} rows={rows} />}
          />
        }
      />
      <CreateStaffModal open={creating} onClose={() => setCreating(false)} actorIsSuperAdmin={perms.isSuperAdmin} />
    </div>
  );
}

function CreateStaffModal({
  open,
  onClose,
  actorIsSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  actorIsSuperAdmin: boolean;
}) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'support' as UserRole, password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useOpsMutation({
    mutationFn: () => adminApi.createStaff({ ...form, email: form.email.trim(), full_name: form.full_name.trim() }),
    success: (u) => `Staff user ${u.full_name} created`,
    invalidate: [opsKeys.staff, opsKeys.users, opsKeys.dashboard],
    onSuccess: () => {
      setForm({ full_name: '', email: '', role: 'support', password: '' });
      onClose();
    },
  });

  const roles = STAFF_ROLES.filter((r) => r !== 'super_admin' || actorIsSuperAdmin);
  const serverErrors = fieldErrors(create.error);
  const err = (k: string) => errors[k] ?? serverErrors[k] ?? null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.full_name.trim().length < 2) next.full_name = 'Enter the full name.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email.';
    const pw = validatePassword(form.password);
    if (pw) next.password = pw;
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New staff user"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-staff-form" loading={create.isPending}>
            Create user
          </Button>
        </>
      }
    >
      <form id="create-staff-form" onSubmit={submit} className="grid gap-3" noValidate>
        <Field label="Full name" required error={err('full_name')}>
          {(id) => (
            <Input
              id={id}
              value={form.full_name}
              maxLength={200}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              invalid={!!err('full_name')}
            />
          )}
        </Field>
        <Field label="Email" required error={err('email')}>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="off"
              value={form.email}
              maxLength={254}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              invalid={!!err('email')}
            />
          )}
        </Field>
        <Field label="Role" required>
          {(id) => (
            <Select
              id={id}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              options={roles.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
            />
          )}
        </Field>
        <Field
          label="Temporary password"
          required
          error={err('password')}
          hint="At least 10 characters with a letter and a digit. Share it securely; the user should change it after signing in."
        >
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={form.password}
              maxLength={128}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              invalid={!!err('password')}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
