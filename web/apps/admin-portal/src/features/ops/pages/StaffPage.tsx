import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, UserPlus } from 'lucide-react';
import type { TFunction } from 'i18next';
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
import { useAppTranslation } from '../../../i18n';
import { Button, Field, Input, Modal, Select } from '../ui';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pw: string, t: TFunction): string | null {
  if (pw.length < 10) return t('staff.validation.passwordLength');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return t('staff.validation.passwordMix');
  return null;
}

const ROLE_TONE: Record<StaffRole, 'accent' | 'success' | 'info' | 'warning'> = {
  super_admin: 'warning',
  admin: 'accent',
  finance: 'success',
  support: 'info',
};

const FILTERS = { q: filterParam.text(), role: filterParam.oneOf(STAFF_ROLES) };

function staffColumns(t: TFunction): DataTableColumn<StaffMemberOut>[] {
  return [
    {
      key: 'full_name',
      header: t('staff.columns.name'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-72',
      cell: (s) => <PersonCell name={s.full_name} secondary={s.email ?? undefined} />,
      exportValue: (s) => s.full_name,
    },
    {
      key: 'email',
      header: t('staff.columns.email'),
      sortable: true,
      defaultHidden: true,
      cell: (s) => s.email ?? <span className="text-muted">—</span>,
      exportValue: (s) => s.email ?? '',
    },
    {
      key: 'role',
      header: t('staff.columns.role'),
      sortable: true,
      mobile: 'badge',
      sortValue: (s) => USER_ROLE_LABELS[s.role],
      cell: (s) => <Badge tone={ROLE_TONE[s.role as StaffRole] ?? 'neutral'}>{USER_ROLE_LABELS[s.role] ?? s.role}</Badge>,
      exportValue: (s) => USER_ROLE_LABELS[s.role] ?? s.role,
    },
    {
      key: 'phone',
      header: t('staff.columns.phone'),
      cell: (s) =>
        s.phone ? (
          <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary-ink hover:underline">
            <Phone className="size-3.5" aria-hidden /> <span dir="ltr">{s.phone}</span>
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (s) => s.phone ?? '',
    },
  ];
}

export default function StaffPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('staff.title'));
  const columns = useMemo(() => staffColumns(t), [t]);
  const perms = useOpsPermissions();
  const table = useTableState({ filters: FILTERS, defaultSort: 'full_name', defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: [...opsKeys.staff, 'all'], queryFn: () => adminApi.listStaff() });

  const searched = useMemo(() => (list.data ?? []).filter(matchesSearch(filters.q, (s) => [s.full_name, s.email, s.phone])), [list.data, filters.q]);
  const rows = useMemo(() => (filters.role ? searched.filter((s) => s.role === filters.role) : searched), [searched, filters.role]);
  const quickItems: QuickFilterItem<StaffRole>[] = [
    { value: '', label: t('staff.filters.allStaff'), count: list.data ? searched.length : undefined },
    ...STAFF_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r], count: list.data ? searched.filter((s) => s.role === r).length : undefined })),
  ];

  return (
    <div>
      <PageHeader
        title={t('staff.title')}
        description={t('staff.description')}
        actions={
          perms.manageUsers && (
            <UiButton leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('staff.newStaffUser')}
            </UiButton>
          )
        }
      />
      <DataTable
        id="admin.staff"
        caption={t('staff.title')}
        table={table}
        columns={columns}
        rows={list.data ? rows : undefined}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle={t('staff.empty')}
        emptyAction={
          perms.manageUsers ? (
            <UiButton size="sm" leftIcon={<UserPlus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('staff.newStaffUser')}
            </UiButton>
          ) : undefined
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('staff.filters.role')} items={quickItems} value={filters.role} onChange={(r) => setFilter('role', r)} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('staff.filters.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="staff" columns={columns} rows={rows} />}
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
  const { t } = useAppTranslation();
  const [form, setForm] = useState({ full_name: '', email: '', role: 'support' as UserRole, password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useOpsMutation({
    mutationFn: () => adminApi.createStaff({ ...form, email: form.email.trim(), full_name: form.full_name.trim() }),
    success: (u) => t('staff.toast.created', { name: u.full_name }),
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
    if (form.full_name.trim().length < 2) next.full_name = t('staff.validation.fullName');
    if (!EMAIL_RE.test(form.email.trim())) next.email = t('staff.validation.email');
    const pw = validatePassword(form.password, t);
    if (pw) next.password = pw;
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('staff.newStaffUser')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('staff.form.cancel')}
          </Button>
          <Button type="submit" form="create-staff-form" loading={create.isPending}>
            {t('staff.form.create')}
          </Button>
        </>
      }
    >
      <form id="create-staff-form" onSubmit={submit} className="grid gap-3" noValidate>
        <Field label={t('staff.form.fullName')} required error={err('full_name')}>
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
        <Field label={t('staff.form.email')} required error={err('email')}>
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
        <Field label={t('staff.form.role')} required>
          {(id) => (
            <Select
              id={id}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              options={roles.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] }))}
            />
          )}
        </Field>
        <Field label={t('staff.form.password')} required error={err('password')} hint={t('staff.form.passwordHint')}>
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
