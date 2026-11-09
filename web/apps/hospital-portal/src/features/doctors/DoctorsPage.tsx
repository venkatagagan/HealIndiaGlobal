import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, CalendarDays, Languages, Pencil, Plus, Stethoscope, Trash2, Video } from 'lucide-react';
import { errorMessage, hospitalPortalApi, type DoctorAdminOut } from '@hig/shared/api';
import { filterParam, matchesSearch, useTableState } from '@hig/shared/lib';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ExportButton,
  FilterBar,
  LinkButton,
  MoneyCell,
  PageHeader,
  PersonCell,
  QuickFilters,
  SelectFilter,
  TextCell,
  ToggleFilter,
  type DataTableColumn,
  type FilterOption,
} from '@hig/shared/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { Stars } from '../../components/ui';
import { qk, useHospitalDoctors } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { DoctorFormModal } from './DoctorFormModal';

const REGISTRATION = ['verified', 'pending', 'missing'] as const;
type Registration = (typeof REGISTRATION)[number];
const REGISTRATION_LABELS: Record<Registration, string> = {
  verified: 'Verified',
  pending: 'Awaiting verification',
  missing: 'Missing',
};
const ACTIVE = ['active', 'inactive'] as const;

const FILTERS = {
  q: filterParam.text(),
  active: filterParam.oneOf(ACTIVE),
  specialty: filterParam.text(),
  registration: filterParam.oneOf(REGISTRATION),
  language: filterParam.text(),
  tele: filterParam.boolean(),
};

function registrationOf(d: DoctorAdminOut): Registration {
  if (!d.registration_number) return 'missing';
  return d.registration_verified ? 'verified' : 'pending';
}

function RegistrationCell({ d }: { d: DoctorAdminOut }) {
  const reg = registrationOf(d);
  if (reg === 'missing') return <Badge tone="warning">Missing</Badge>;
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-mono text-xs text-fg">{d.registration_number}</span>
        {reg === 'verified' ? (
          <BadgeCheck className="size-4 shrink-0 text-success-ink" aria-label="Verified" />
        ) : (
          <Badge tone="neutral" size="sm">
            Awaiting
          </Badge>
        )}
      </span>
      <span className="block truncate text-xs text-muted">{d.registration_council_name ?? d.registration_council}</span>
    </span>
  );
}

export function DoctorsPage() {
  useDocumentTitle('Doctors');
  const navigate = useNavigate();
  const { canManage } = useHospital();
  const queryClient = useQueryClient();
  const doctors = useHospitalDoctors();
  const [editing, setEditing] = useState<DoctorAdminOut | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DoctorAdminOut | null>(null);
  const table = useTableState({ filters: FILTERS, defaultSort: 'name', defaultPageSize: 25 });
  const { filters, setFilter } = table;

  const remove = useMutation({
    mutationFn: (d: DoctorAdminOut) => hospitalPortalApi.deleteDoctor(d.id),
    onSuccess: () => {
      toast.success('Doctor removed');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: qk.doctors });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const all = useMemo(() => doctors.data ?? [], [doctors.data]);
  // everything except the active tab -> tab counts
  const base = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (d) => [d.full_name, d.specialty.name, d.registration_number, ...d.qualifications]))
        .filter((d) => !filters.specialty || d.specialty.id === filters.specialty)
        .filter((d) => !filters.registration || registrationOf(d) === filters.registration)
        .filter((d) => !filters.language || d.languages.includes(filters.language))
        .filter((d) => !filters.tele || d.teleconsult_available),
    [all, filters.q, filters.specialty, filters.registration, filters.language, filters.tele],
  );
  const rows = base.filter((d) => !filters.active || (filters.active === 'active') === d.is_active);

  const specialtyOptions: FilterOption[] = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const d of all) map.set(d.specialty.id, { label: d.specialty.name, count: (map.get(d.specialty.id)?.count ?? 0) + 1 });
    return [...map].map(([value, o]) => ({ value, label: o.label, count: o.count })).sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);
  const languageOptions: FilterOption[] = useMemo(
    () => [...new Set(all.flatMap((d) => d.languages))].sort().map((l) => ({ value: l, label: l })),
    [all],
  );

  const columns = useMemo<DataTableColumn<DoctorAdminOut>[]>(
    () => [
      {
        key: 'name',
        header: 'Doctor',
        sortable: true,
        sticky: true,
        mobile: 'primary',
        className: 'max-w-64',
        sortValue: (d) => d.full_name,
        cell: (d) => (
          <PersonCell
            name={d.full_name}
            src={d.photo_url}
            secondary={[d.specialty.name, d.qualifications.join(', ')].filter(Boolean).join(' · ')}
          />
        ),
        exportValue: (d) => d.full_name,
      },
      {
        key: 'specialty',
        header: 'Specialty',
        sortable: true,
        defaultHidden: true,
        sortValue: (d) => d.specialty.name,
        cell: (d) => d.specialty.name,
        exportValue: (d) => d.specialty.name,
      },
      {
        key: 'experience',
        header: 'Experience',
        sortable: true,
        sortDescFirst: true,
        align: 'end',
        sortValue: (d) => d.experience_years ?? -1,
        cell: (d) => (d.experience_years != null ? <span className="tabular-nums">{d.experience_years} yrs</span> : <span className="text-muted">—</span>),
        exportValue: (d) => d.experience_years ?? '',
      },
      {
        key: 'registration',
        header: 'Registration',
        className: 'max-w-52',
        sortable: true,
        sortValue: (d) => REGISTRATION.indexOf(registrationOf(d)),
        cell: (d) => <RegistrationCell d={d} />,
        mobileCell: (d) => (registrationOf(d) === 'verified' ? 'Registration verified' : REGISTRATION_LABELS[registrationOf(d)]),
        exportValue: (d) => [d.registration_number, d.registration_council_name ?? d.registration_council, REGISTRATION_LABELS[registrationOf(d)]].filter(Boolean).join(' · '),
      },
      {
        key: 'languages',
        header: 'Languages',
        defaultHidden: true,
        className: 'max-w-44',
        cell: (d) => <TextCell primary={d.languages.join(', ') || '—'} />,
        exportValue: (d) => d.languages.join(', '),
      },
      {
        key: 'rating',
        header: 'Rating',
        sortable: true,
        sortDescFirst: true,
        sortValue: (d) => d.rating_avg ?? 0,
        cell: (d) =>
          d.rating_count ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Stars value={d.rating_avg} />
              <span className="text-xs text-muted tabular-nums">({d.rating_count})</span>
            </span>
          ) : (
            <span className="text-xs text-muted">No reviews</span>
          ),
        exportValue: (d) => d.rating_avg ?? '',
      },
      {
        key: 'fee',
        header: 'Consultation',
        align: 'end',
        sortable: true,
        sortValue: (d) => d.consultation_fee_minor ?? -1,
        cell: (d) => (
          <MoneyCell
            minor={d.consultation_fee_minor}
            currency={d.currency}
            secondary={
              d.teleconsult_available ? (
                <span className="inline-flex items-center gap-1">
                  <Video className="size-3.5" aria-hidden /> Teleconsult
                </span>
              ) : undefined
            }
          />
        ),
        exportValue: (d) => (d.consultation_fee_minor != null ? d.consultation_fee_minor / 100 : ''),
      },
      {
        key: 'status',
        header: 'Status',
        mobile: 'badge',
        sortable: true,
        sortValue: (d) => (d.is_active ? 0 : 1),
        cell: (d) => (
          <Badge tone={d.is_active ? 'success' : 'neutral'} dot>
            {d.is_active ? 'Active' : 'Inactive'}
          </Badge>
        ),
        exportValue: (d) => (d.is_active ? 'Active' : 'Inactive'),
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        title: 'Actions',
        hideable: false,
        exportable: false,
        align: 'end',
        mobile: 'meta',
        cell: (d) => (
          <span className="flex justify-end gap-1">
            <LinkButton to={`/doctors/${d.id}/availability`} variant="ghost" size="sm" leftIcon={<CalendarDays className="size-4" aria-hidden />}>
              <span className="hidden xl:inline">Availability</span>
              <span className="sr-only xl:hidden">Availability for {d.full_name}</span>
            </LinkButton>
            {canManage && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${d.full_name}`} onClick={() => setEditing(d)}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${d.full_name}`} onClick={() => setDeleting(d)}>
                  <Trash2 className="size-4 text-danger-ink" aria-hidden />
                </Button>
              </>
            )}
          </span>
        ),
      },
    ],
    [canManage],
  );

  const activeCount = base.filter((d) => d.is_active).length;
  const addButton = canManage ? (
    <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
      Add doctor
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title="Doctors" description="Specialists shown to international patients and used for AI matching." actions={addButton} />
      <DataTable
        id="hospital.doctors"
        caption="Doctors"
        table={table}
        columns={columns}
        rows={doctors.data ? rows : undefined}
        loading={doctors.isPending}
        error={doctors.error}
        onRetry={() => void doctors.refetch()}
        onRowClick={(d) => (canManage ? setEditing(d) : navigate(`/doctors/${d.id}/availability`))}
        rowLabel={(d) => (canManage ? `Edit ${d.full_name}` : `Availability for ${d.full_name}`)}
        emptyIcon={<Stethoscope className="size-6" aria-hidden />}
        emptyTitle="No doctors yet"
        emptyDescription="Add your specialists so patients can be matched to them."
        emptyAction={addButton}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Doctor status"
              items={[
                { value: '', label: 'All', count: base.length },
                { value: 'active', label: 'Active', count: activeCount, tone: 'success' },
                { value: 'inactive', label: 'Inactive', count: base.length - activeCount },
              ]}
              value={filters.active}
              onChange={(v) => setFilter('active', v)}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name, specialty or registration…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="doctors" columns={columns} rows={rows} />}
            more={
              <SelectFilter
                label="Language"
                icon={<Languages className="size-3.5 opacity-70" aria-hidden />}
                value={filters.language}
                onChange={(v) => setFilter('language', v)}
                options={languageOptions}
                searchable
              />
            }
          >
            <SelectFilter label="Specialty" value={filters.specialty} onChange={(v) => setFilter('specialty', v)} options={specialtyOptions} loading={doctors.isPending} />
            <SelectFilter
              label="Registration"
              value={filters.registration}
              onChange={(v) => setFilter('registration', v)}
              options={REGISTRATION.map((r) => ({
                value: r,
                label: REGISTRATION_LABELS[r],
                tone: r === 'verified' ? 'success' : r === 'missing' ? 'warning' : 'neutral',
                count: all.filter((d) => registrationOf(d) === r).length,
              }))}
            />
            <ToggleFilter
              label="Teleconsult"
              icon={<Video className="size-3.5 opacity-70" aria-hidden />}
              pressed={filters.tele === true}
              onChange={(on) => setFilter('tele', on || undefined)}
            />
          </FilterBar>
        }
      />
      {editing && <DoctorFormModal doctor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        keepOpenOnConfirm
        loading={remove.isPending}
        tone="danger"
        title="Remove doctor?"
        description={
          deleting
            ? `${deleting.full_name} will no longer be shown to patients. Existing cases and bookings are not affected. Consider marking the doctor inactive instead.`
            : undefined
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
