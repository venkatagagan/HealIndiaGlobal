import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BedDouble, Check, ClipboardList, Package, Pencil, Plus, Trash2, TrendingUp, X } from 'lucide-react';
import {
  PACKAGE_TIER_LABELS,
  errorMessage,
  hospitalPortalApi,
  type HospitalProcedureOut,
  type PackageOut,
} from '@hig/shared/api';
import { filterParam, matchesSearch, useTableState } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  ExportButton,
  FilterBar,
  PageHeader,
  QuickFilters,
  SelectFilter,
  TextCell,
  type DataTableColumn,
  type FilterOption,
} from '@hig/shared/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { formatMoney, formatMoneyRange, fromMinor, toMinor } from '../../lib/format';
import { qk, useHospitalDoctors } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { OfferingFormModal } from './OfferingFormModal';
import { PackageFormModal } from './PackageFormModal';

function includesSummary(pkg: PackageOut): string[] {
  const inc = pkg.includes ?? {};
  const out: string[] = [];
  if (inc.accommodation_nights) out.push(`${inc.accommodation_nights} nights stay`);
  if (inc.airport_pickup) out.push('Airport pickup');
  if (inc.translator) out.push('Translator');
  if (inc.meals) out.push('Meals');
  if (inc.local_transport) out.push('Local transport');
  if (inc.followup_teleconsults) out.push(`${inc.followup_teleconsults} follow-up calls`);
  return out;
}

type Pending =
  | { kind: 'offering'; offering: HospitalProcedureOut }
  | { kind: 'package'; offering: HospitalProcedureOut; pkg: PackageOut };

const isActive = (o: HospitalProcedureOut) => o.is_active !== false;
const cheapest = (o: HospitalProcedureOut) =>
  o.packages.filter((p) => p.is_active !== false).reduce<PackageOut | null>((min, p) => (!min || p.price_minor < min.price_minor ? p : min), null);

const PACKAGE_STATES = ['with', 'without'] as const;
const FILTERS = {
  q: filterParam.text(),
  active: filterParam.oneOf(['active', 'inactive'] as const),
  doctor: filterParam.text(),
  packages: filterParam.oneOf(PACKAGE_STATES),
  min_price: filterParam.number(),
  max_price: filterParam.number(),
};
const CURRENCY = 'INR';

// ---------------------------------------------------------------------------------------------------------
// Drawer body: everything about one procedure, with its packages
// ---------------------------------------------------------------------------------------------------------
function OfferingDetails({
  offering,
  leads,
  canManage,
  onEditPackage,
  onDeletePackage,
}: {
  offering: HospitalProcedureOut;
  leads: string[];
  canManage: boolean;
  onEditPackage: (pkg: PackageOut | null) => void;
  onDeletePackage: (pkg: PackageOut) => void;
}) {
  const packages = [...offering.packages].sort((a, b) => a.price_minor - b.price_minor);
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="col-span-2 rounded-lg border border-border p-3">
          <dt className="text-xs text-muted">Indicative price</dt>
          <dd className="text-lg font-semibold text-fg">{formatMoneyRange(offering.price_min_minor, offering.price_max_minor, offering.currency)}</dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <BedDouble className="size-3.5" aria-hidden /> Hospital stay
          </dt>
          <dd className="font-medium text-fg">{offering.hospital_stay_days != null ? `${offering.hospital_stay_days} days` : '—'}</dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <TrendingUp className="size-3.5" aria-hidden /> Success rate
          </dt>
          <dd className="font-medium text-fg">{offering.success_rate_pct != null ? `${offering.success_rate_pct}%` : '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted">Lead doctors</dt>
          <dd className="text-fg">{leads.length ? leads.join(', ') : 'Not assigned'}</dd>
        </div>
      </dl>

      {(offering.inclusions.length > 0 || offering.exclusions.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Included</h3>
            <ul className="space-y-1 text-sm">
              {offering.inclusions.map((i) => (
                <li key={i} className="flex gap-2 text-fg">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />
                  {i}
                </li>
              ))}
              {offering.inclusions.length === 0 && <li className="text-muted">—</li>}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Not included</h3>
            <ul className="space-y-1 text-sm">
              {offering.exclusions.map((i) => (
                <li key={i} className="flex gap-2 text-muted">
                  <X className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden />
                  {i}
                </li>
              ))}
              {offering.exclusions.length === 0 && <li className="text-muted">—</li>}
            </ul>
          </div>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Package className="size-4 text-accent-ink" aria-hidden /> Packages
          </h3>
          {canManage && (
            <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => onEditPackage(null)}>
              Add package
            </Button>
          )}
        </div>
        {packages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
            No packages yet. Packages (Medical only / Medical + stay / All-inclusive) let patients book directly.
          </p>
        ) : (
          <div className="grid gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={pkg.tier === 'all_inclusive' ? 'accent' : pkg.tier === 'medical_stay' ? 'info' : 'neutral'}>
                        {PACKAGE_TIER_LABELS[pkg.tier] ?? pkg.tier}
                      </Badge>
                      {pkg.is_active === false && <Badge>Inactive</Badge>}
                    </div>
                    <p className="mt-2 font-semibold text-fg">{pkg.name}</p>
                  </div>
                  <p className="text-end">
                    <span className="block text-lg font-bold text-fg tabular-nums">{formatMoney(pkg.price_minor, pkg.currency, { trimZeros: true })}</span>
                    {pkg.original_price_minor != null && (
                      <span className="text-sm text-muted line-through">{formatMoney(pkg.original_price_minor, pkg.currency, { trimZeros: true })}</span>
                    )}
                  </p>
                </div>
                {pkg.description && <p className="mt-1 text-xs text-muted">{pkg.description}</p>}
                {includesSummary(pkg).length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-fg">
                    {includesSummary(pkg).map((i) => (
                      <li key={i} className="flex gap-1.5">
                        <Check className="size-3.5 shrink-0 text-success-ink" aria-hidden />
                        {i}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <div className="mt-3 flex gap-1">
                    <Button size="xs" variant="ghost" leftIcon={<Pencil className="size-3.5" aria-hidden />} onClick={() => onEditPackage(pkg)}>
                      Edit
                    </Button>
                    <Button size="xs" variant="ghost" leftIcon={<Trash2 className="size-3.5 text-danger-ink" aria-hidden />} onClick={() => onDeletePackage(pkg)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Page: price list
// ---------------------------------------------------------------------------------------------------------
export function ProceduresPage() {
  useDocumentTitle('Procedures & pricing');
  const { canManage } = useHospital();
  const queryClient = useQueryClient();
  const offerings = useQuery({ queryKey: qk.offerings, queryFn: hospitalPortalApi.listProcedures });
  const doctors = useHospitalDoctors();
  const doctorNames = useMemo(() => new Map((doctors.data ?? []).map((d) => [d.id, d.full_name])), [doctors.data]);
  const [editing, setEditing] = useState<HospitalProcedureOut | 'new' | null>(null);
  const [editingPackage, setEditingPackage] = useState<{ offering: HospitalProcedureOut; pkg: PackageOut | null } | null>(null);
  const [deleting, setDeleting] = useState<Pending | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const table = useTableState({ filters: FILTERS, defaultSort: 'procedure', defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;

  const remove = useMutation({
    mutationFn: (p: Pending) =>
      p.kind === 'offering' ? hospitalPortalApi.deleteProcedure(p.offering.id) : hospitalPortalApi.deletePackage(p.offering.id, p.pkg.id),
    onSuccess: (_, p) => {
      toast.success(p.kind === 'offering' ? 'Procedure removed' : 'Package deleted');
      setDeleting(null);
      if (p.kind === 'offering') setOpenId(null);
      void queryClient.invalidateQueries({ queryKey: qk.offerings });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const all = useMemo(() => offerings.data ?? [], [offerings.data]);
  const leadsOf = (o: HospitalProcedureOut) => (o.doctor_ids ?? []).map((id) => doctorNames.get(id)).filter((n): n is string => Boolean(n));
  const minPrice = filters.min_price !== undefined ? toMinor(filters.min_price, CURRENCY) : null;
  const maxPrice = filters.max_price !== undefined ? toMinor(filters.max_price, CURRENCY) : null;
  const base = all
    .filter(matchesSearch(filters.q, (o) => [o.procedure.name, ...o.packages.map((p) => p.name)]))
    .filter((o) => !filters.doctor || (o.doctor_ids ?? []).includes(filters.doctor))
    .filter((o) => !filters.packages || (filters.packages === 'with') === o.packages.length > 0)
    // price range overlaps the requested range
    .filter((o) => minPrice == null || o.price_max_minor >= minPrice)
    .filter((o) => maxPrice == null || o.price_min_minor <= maxPrice);
  const rows = base.filter((o) => !filters.active || (filters.active === 'active') === isActive(o));
  const activeCount = base.filter(isActive).length;
  const open = all.find((o) => o.id === openId) ?? null;

  const columns: DataTableColumn<HospitalProcedureOut>[] = [
    {
      key: 'procedure',
      header: 'Procedure',
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-72',
      sortValue: (o) => o.procedure.name,
      cell: (o) => <TextCell primary={<span className="font-medium">{o.procedure.name}</span>} secondary={leadsOf(o).length ? `Lead: ${leadsOf(o).join(', ')}` : 'No lead doctor'} />,
      exportValue: (o) => o.procedure.name,
    },
    {
      key: 'price',
      header: 'Price range',
      align: 'end',
      sortable: true,
      sortValue: (o) => o.price_min_minor,
      cell: (o) => <span className="font-medium whitespace-nowrap tabular-nums">{formatMoneyRange(o.price_min_minor, o.price_max_minor, o.currency)}</span>,
      exportValue: (o) => `${o.currency} ${fromMinor(o.price_min_minor, o.currency)} - ${fromMinor(o.price_max_minor, o.currency)}`,
    },
    {
      key: 'packages',
      header: 'Packages',
      sortable: true,
      sortValue: (o) => o.packages.length,
      cell: (o) => {
        const from = cheapest(o);
        return o.packages.length ? (
          <TextCell
            primary={`${o.packages.length} package${o.packages.length === 1 ? '' : 's'}`}
            secondary={from ? `from ${formatMoney(from.price_minor, from.currency, { trimZeros: true })}` : 'none active'}
          />
        ) : (
          <Badge tone="warning">No packages</Badge>
        );
      },
      exportValue: (o) => o.packages.map((p) => `${p.name} (${p.currency} ${fromMinor(p.price_minor, p.currency)})`).join('; '),
    },
    {
      key: 'stay',
      header: 'Stay',
      align: 'end',
      sortable: true,
      sortValue: (o) => o.hospital_stay_days ?? -1,
      cell: (o) => (o.hospital_stay_days != null ? <span className="tabular-nums">{o.hospital_stay_days} days</span> : <span className="text-muted">—</span>),
      exportValue: (o) => o.hospital_stay_days ?? '',
    },
    {
      key: 'success',
      header: 'Success rate',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (o) => o.success_rate_pct ?? -1,
      cell: (o) => (o.success_rate_pct != null ? <span className="tabular-nums">{o.success_rate_pct}%</span> : <span className="text-muted">—</span>),
      exportValue: (o) => o.success_rate_pct ?? '',
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (o) => (
        <Badge tone={isActive(o) ? 'success' : 'neutral'} dot>
          {isActive(o) ? 'Listed' : 'Inactive'}
        </Badge>
      ),
      exportValue: (o) => (isActive(o) ? 'Listed' : 'Inactive'),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            title: 'Actions',
            hideable: false,
            exportable: false,
            align: 'end' as const,
            cell: (o: HospitalProcedureOut) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${o.procedure.name}`} onClick={() => setEditing(o)}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${o.procedure.name}`} onClick={() => setDeleting({ kind: 'offering', offering: o })}>
                  <Trash2 className="size-4 text-danger-ink" aria-hidden />
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  const doctorOptions: FilterOption[] = (doctors.data ?? []).map((d) => ({ value: d.id, label: d.full_name, description: d.specialty.name }));
  const addButton = canManage ? (
    <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
      Add procedure
    </Button>
  ) : undefined;

  return (
    <div>
      <PageHeader title="Procedures & pricing" description="Your price list: procedures you offer, indicative price ranges and bookable packages." actions={addButton} />
      <DataTable
        id="hospital.procedures"
        caption="Procedures and pricing"
        table={table}
        columns={columns}
        rows={offerings.data ? rows : undefined}
        loading={offerings.isPending}
        error={offerings.error}
        onRetry={() => void offerings.refetch()}
        onRowClick={(o) => setOpenId(o.id)}
        rowLabel={(o) => `Open ${o.procedure.name}`}
        emptyIcon={<ClipboardList className="size-6" aria-hidden />}
        emptyTitle="No procedures yet"
        emptyDescription="Add the procedures you offer with price ranges so patients can compare and request quotes."
        emptyAction={addButton}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Listing status"
              items={[
                { value: '', label: 'All', count: base.length },
                { value: 'active', label: 'Listed', count: activeCount, tone: 'success' },
                { value: 'inactive', label: 'Inactive', count: base.length - activeCount },
              ]}
              value={filters.active}
              onChange={(v) => setFilter('active', v)}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Procedure or package…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="price-list" columns={columns} rows={rows} />}
          >
            <SelectFilter label="Lead doctor" value={filters.doctor} onChange={(v) => setFilter('doctor', v)} options={doctorOptions} loading={doctors.isPending} searchable />
            <SelectFilter
              label="Packages"
              value={filters.packages}
              onChange={(v) => setFilter('packages', v)}
              options={[
                { value: 'with', label: 'With packages', count: all.filter((o) => o.packages.length > 0).length },
                { value: 'without', label: 'Without packages', count: all.filter((o) => o.packages.length === 0).length, tone: 'warning' },
              ]}
            />
            <AmountRangeFilter
              label="Price"
              currency={CURRENCY}
              value={{ min: filters.min_price, max: filters.max_price }}
              onChange={({ min, max }) => setFilters({ min_price: min, max_price: max })}
            />
          </FilterBar>
        }
      />

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        size="lg"
        title={open?.procedure.name}
        description={open ? (isActive(open) ? 'Listed for patients' : 'Inactive - hidden from patients') : undefined}
        footer={
          open && canManage ? (
            <div className="flex w-full justify-between gap-2">
              <Button variant="ghost" leftIcon={<Trash2 className="size-4 text-danger-ink" aria-hidden />} onClick={() => setDeleting({ kind: 'offering', offering: open })}>
                Remove
              </Button>
              <Button variant="outline" leftIcon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(open)}>
                Edit procedure
              </Button>
            </div>
          ) : undefined
        }
      >
        {open && (
          <OfferingDetails
            offering={open}
            leads={leadsOf(open)}
            canManage={canManage}
            onEditPackage={(pkg) => setEditingPackage({ offering: open, pkg })}
            onDeletePackage={(pkg) => setDeleting({ kind: 'package', offering: open, pkg })}
          />
        )}
      </Drawer>

      {editing && (
        <OfferingFormModal offering={editing === 'new' ? null : editing} existingProcedureIds={all.map((o) => o.procedure.id)} onClose={() => setEditing(null)} />
      )}
      {editingPackage && <PackageFormModal offering={editingPackage.offering} pkg={editingPackage.pkg} onClose={() => setEditingPackage(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        keepOpenOnConfirm
        loading={remove.isPending}
        tone="danger"
        title={deleting?.kind === 'package' ? 'Delete package?' : 'Remove procedure?'}
        description={
          deleting?.kind === 'package'
            ? `"${deleting.pkg.name}" will no longer be bookable. Existing bookings keep their price.`
            : deleting
              ? `${deleting.offering.procedure.name} and its packages will be removed from your public listing.`
              : undefined
        }
        confirmLabel={deleting?.kind === 'package' ? 'Delete package' : 'Remove procedure'}
      />
    </div>
  );
}
