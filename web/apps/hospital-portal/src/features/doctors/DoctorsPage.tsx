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
import { useAppTranslation } from '../../i18n';
import { DoctorFormModal } from './DoctorFormModal';

type TFn = ReturnType<typeof useAppTranslation>['t'];

const REGISTRATION = ['verified', 'pending', 'missing'] as const;
type Registration = (typeof REGISTRATION)[number];
function registrationLabel(t: TFn, r: Registration): string {
  return t(`doctors.registration.${r}`);
}
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
  const { t } = useAppTranslation();
  const reg = registrationOf(d);
  if (reg === 'missing') return <Badge tone="warning">{t('doctors.registration.missing')}</Badge>;
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-mono text-xs text-fg">{d.registration_number}</span>
        {reg === 'verified' ? (
          <BadgeCheck className="size-4 shrink-0 text-success-ink" aria-label={t('doctors.registration.verified')} />
        ) : (
          <Badge tone="neutral" size="sm">
            {t('doctors.registration.awaiting')}
          </Badge>
        )}
      </span>
      <span className="block truncate text-xs text-muted">{d.registration_council_name ?? d.registration_council}</span>
    </span>
  );
}

export function DoctorsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('doctors.list.title'));
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
      toast.success(t('doctors.list.removed'));
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
        header: t('common.doctor'),
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
        header: t('common.specialty'),
        sortable: true,
        defaultHidden: true,
        sortValue: (d) => d.specialty.name,
        cell: (d) => d.specialty.name,
        exportValue: (d) => d.specialty.name,
      },
      {
        key: 'experience',
        header: t('doctors.list.experience'),
        sortable: true,
        sortDescFirst: true,
        align: 'end',
        sortValue: (d) => d.experience_years ?? -1,
        cell: (d) =>
          d.experience_years != null ? (
            <span className="tabular-nums">{t('doctors.list.years', { count: d.experience_years })}</span>
          ) : (
            <span className="text-muted">—</span>
          ),
        exportValue: (d) => d.experience_years ?? '',
      },
      {
        key: 'registration',
        header: t('doctors.list.registration'),
        className: 'max-w-52',
        sortable: true,
        sortValue: (d) => REGISTRATION.indexOf(registrationOf(d)),
        cell: (d) => <RegistrationCell d={d} />,
        mobileCell: (d) =>
          registrationOf(d) === 'verified'
            ? t('doctors.list.registrationVerified')
            : registrationLabel(t, registrationOf(d)),
        exportValue: (d) =>
          [d.registration_number, d.registration_council_name ?? d.registration_council, registrationLabel(t, registrationOf(d))]
            .filter(Boolean)
            .join(' · '),
      },
      {
        key: 'languages',
        header: t('doctors.list.languages'),
        defaultHidden: true,
        className: 'max-w-44',
        cell: (d) => <TextCell primary={d.languages.join(', ') || '—'} />,
        exportValue: (d) => d.languages.join(', '),
      },
      {
        key: 'rating',
        header: t('doctors.list.rating'),
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
            <span className="text-xs text-muted">{t('doctors.list.noReviews')}</span>
          ),
        exportValue: (d) => d.rating_avg ?? '',
      },
      {
        key: 'fee',
        header: t('doctors.list.consultation'),
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
                  <Video className="size-3.5" aria-hidden /> {t('doctors.list.teleconsult')}
                </span>
              ) : undefined
            }
          />
        ),
        exportValue: (d) => (d.consultation_fee_minor != null ? d.consultation_fee_minor / 100 : ''),
      },
      {
        key: 'status',
        header: t('common.status'),
        mobile: 'badge',
        sortable: true,
        sortValue: (d) => (d.is_active ? 0 : 1),
        cell: (d) => (
          <Badge tone={d.is_active ? 'success' : 'neutral'} dot>
            {d.is_active ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
        exportValue: (d) => (d.is_active ? t('common.active') : t('common.inactive')),
      },
      {
        key: 'actions',
        header: <span className="sr-only">{t('common.actions')}</span>,
        title: t('common.actions'),
        hideable: false,
        exportable: false,
        align: 'end',
        mobile: 'meta',
        cell: (d) => (
          <span className="flex justify-end gap-1">
            <LinkButton to={`/doctors/${d.id}/availability`} variant="ghost" size="sm" leftIcon={<CalendarDays className="size-4" aria-hidden />}>
              <span className="hidden xl:inline">{t('doctors.list.availability')}</span>
              <span className="sr-only xl:hidden">{t('doctors.list.availabilityFor', { name: d.full_name })}</span>
            </LinkButton>
            {canManage && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label={t('doctors.list.editName', { name: d.full_name })} onClick={() => setEditing(d)}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t('doctors.list.removeName', { name: d.full_name })} onClick={() => setDeleting(d)}>
                  <Trash2 className="size-4 text-danger-ink" aria-hidden />
                </Button>
              </>
            )}
          </span>
        ),
      },
    ],
    [canManage, t],
  );

  const activeCount = base.filter((d) => d.is_active).length;
  const addButton = canManage ? (
    <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
      {t('doctors.form.addTitle')}
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title={t('doctors.list.title')} description={t('doctors.list.description')} actions={addButton} />
      <DataTable
        id="hospital.doctors"
        caption={t('doctors.list.title')}
        table={table}
        columns={columns}
        rows={doctors.data ? rows : undefined}
        loading={doctors.isPending}
        error={doctors.error}
        onRetry={() => void doctors.refetch()}
        onRowClick={(d) => (canManage ? setEditing(d) : navigate(`/doctors/${d.id}/availability`))}
        rowLabel={(d) =>
          canManage ? t('doctors.list.editName', { name: d.full_name }) : t('doctors.list.availabilityFor', { name: d.full_name })
        }
        emptyIcon={<Stethoscope className="size-6" aria-hidden />}
        emptyTitle={t('doctors.list.emptyTitle')}
        emptyDescription={t('doctors.list.emptyDescription')}
        emptyAction={addButton}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('doctors.list.statusFilter')}
              items={[
                { value: '', label: t('common.all'), count: base.length },
                { value: 'active', label: t('common.active'), count: activeCount, tone: 'success' },
                { value: 'inactive', label: t('common.inactive'), count: base.length - activeCount },
              ]}
              value={filters.active}
              onChange={(v) => setFilter('active', v)}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('doctors.list.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="doctors" columns={columns} rows={rows} />}
            more={
              <SelectFilter
                label={t('doctors.list.language')}
                icon={<Languages className="size-3.5 opacity-70" aria-hidden />}
                value={filters.language}
                onChange={(v) => setFilter('language', v)}
                options={languageOptions}
                searchable
              />
            }
          >
            <SelectFilter
              label={t('common.specialty')}
              value={filters.specialty}
              onChange={(v) => setFilter('specialty', v)}
              options={specialtyOptions}
              loading={doctors.isPending}
            />
            <SelectFilter
              label={t('doctors.list.registration')}
              value={filters.registration}
              onChange={(v) => setFilter('registration', v)}
              options={REGISTRATION.map((r) => ({
                value: r,
                label: registrationLabel(t, r),
                tone: r === 'verified' ? 'success' : r === 'missing' ? 'warning' : 'neutral',
                count: all.filter((d) => registrationOf(d) === r).length,
              }))}
            />
            <ToggleFilter
              label={t('doctors.list.teleconsult')}
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
        title={t('doctors.list.removeTitle')}
        description={deleting ? t('doctors.list.removeDescription', { name: deleting.full_name }) : undefined}
        confirmLabel={t('common.remove')}
      />
    </div>
  );
}
