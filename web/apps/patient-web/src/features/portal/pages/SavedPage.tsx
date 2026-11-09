import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Award, Bookmark, MapPin, Stethoscope, Trash2 } from 'lucide-react';
import { errorMessage, type SavedEntityType, type SavedItemOut } from '@hig/shared/api';
import { filterParam, formatDate, matchesSearch, parseSort, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { FilterBar, MultiSelectFilter } from '@hig/shared/ui';
import { useSavedItems, useToggleSaved } from '../api/queries';
import { Accreditations, Avatar, MoneyRange, Rating } from '../components/common';
import { ListEmpty, ListSurface, SortMenu, TableTabs, countBy } from '../components/listing';
import { paths } from '../lib/paths';
import { Button, ButtonLink, ErrorState, PageHeader, SkeletonList } from '../ui/primitives';

const TYPES = ['hospital', 'doctor', 'procedure'] as const satisfies readonly SavedEntityType[];
const TYPE_LABELS: Record<SavedEntityType, string> = { hospital: 'Hospitals', doctor: 'Doctors', procedure: 'Procedures' };

const FILTERS = {
  q: filterParam.text(),
  type: filterParam.oneOf(TYPES),
  city: filterParam.list(),
  specialty: filterParam.list(),
  accreditation: filterParam.list(),
};
const SORTS = [
  { value: '-created_at', label: 'Recently saved' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-rating', label: 'Highest rated' },
] as const;
type SortValue = (typeof SORTS)[number]['value'];

interface View {
  item: SavedItemOut;
  title: string;
  subtitle: string | null;
  href: string | null;
  image: string | null;
  city: string | null;
  specialties: string[];
  accreditations: string[];
  rating: number | null;
  extra: ReactNode;
}

function viewOf(item: SavedItemOut): View {
  const base = { item, image: null, city: null, specialties: [], accreditations: [], rating: null, extra: null, href: null, subtitle: null };
  if (item.entity_type === 'doctor' && item.doctor) {
    const d = item.doctor;
    return {
      ...base,
      title: d.full_name,
      subtitle: `${d.specialty.name}${d.experience_years ? ` · ${d.experience_years} years` : ''}`,
      href: paths.doctor(d.id),
      image: d.photo_url,
      city: d.hospital.city ?? null,
      specialties: [d.specialty.name],
      rating: d.rating_avg != null ? Number(d.rating_avg) : null,
      extra: <Rating value={d.rating_avg} count={d.rating_count} />,
    };
  }
  if (item.entity_type === 'hospital' && item.hospital) {
    const h = item.hospital;
    return {
      ...base,
      title: h.name,
      subtitle: h.specialties.slice(0, 3).join(' · ') || null,
      href: paths.hospital(h.slug),
      image: h.logo_url,
      city: h.city,
      specialties: h.specialties,
      accreditations: h.accreditations,
      rating: h.rating_avg != null ? Number(h.rating_avg) : null,
      extra: (
        <span className="flex flex-wrap items-center gap-2">
          <Accreditations values={h.accreditations} />
          <Rating value={h.rating_avg} count={h.rating_count} />
        </span>
      ),
    };
  }
  if (item.entity_type === 'procedure' && item.procedure) {
    const p = item.procedure;
    return {
      ...base,
      title: p.name,
      subtitle: p.specialty.name,
      href: `/procedures/${p.slug}`,
      specialties: [p.specialty.name],
      extra:
        p.india_price_min_minor != null ? (
          <span className="text-sm text-muted">
            From <MoneyRange min={p.india_price_min_minor} max={p.india_price_max_minor} currency={p.currency} className="font-semibold text-fg" /> in
            India
          </span>
        ) : null,
    };
  }
  return { ...base, title: 'Saved item' };
}

const options = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

function SavedCard({ view, onRemove, removing }: { view: View; onRemove: () => void; removing: boolean }) {
  const { item } = view;
  const doctor = item.entity_type === 'doctor' ? item.doctor : null;
  return (
    <li className="group relative flex gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-card">
      <Avatar name={view.title} src={view.image} size={56} />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{TYPE_LABELS[item.entity_type].slice(0, -1)}</span>
        {view.href ? (
          <Link to={view.href} className="block truncate font-semibold text-fg after:absolute after:inset-0 hover:underline">
            {view.title}
          </Link>
        ) : (
          <p className="truncate font-semibold">{view.title}</p>
        )}
        {view.subtitle ? <p className="truncate text-sm text-muted">{view.subtitle}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {view.city || doctor ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {doctor ? `${doctor.hospital.name}, ${doctor.hospital.city}` : view.city}
            </span>
          ) : null}
          <span>Saved {formatDate(item.created_at)}</span>
        </p>
        {view.extra ? <div className="mt-2">{view.extra}</div> : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        loading={removing}
        onClick={onRemove}
        className="relative z-10 self-start"
        aria-label={`Remove ${view.title} from saved`}
        icon={<Trash2 className="h-4 w-4 text-danger" aria-hidden />}
      />
    </li>
  );
}

export function SavedPage() {
  useDocumentTitle('Saved');
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', paginate: false });
  const { filters, setFilter } = table;
  const saved = useSavedItems();
  const toggle = useToggleSaved();
  const [removing, setRemoving] = useState<string | null>(null);

  const views = useMemo(() => (saved.data ?? []).map(viewOf), [saved.data]);
  const base = useMemo(
    () =>
      views
        .filter(matchesSearch(filters.q, (v: View) => [v.title, v.subtitle, v.city, ...v.specialties]))
        .filter((v) => !filters.city.length || (!!v.city && filters.city.includes(v.city)))
        .filter((v) => !filters.specialty.length || v.specialties.some((s) => filters.specialty.includes(s)))
        .filter((v) => !filters.accreditation.length || v.accreditations.some((a) => filters.accreditation.includes(a))),
    [views, filters.q, filters.city, filters.specialty, filters.accreditation],
  );
  const sortValue = (SORTS.find((s) => s.value === table.sortParam)?.value ?? '-created_at') as SortValue;
  const rows = useMemo(() => {
    const list = filters.type ? base.filter((v) => v.item.entity_type === filters.type) : [...base];
    if (sortValue === 'name') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortValue === '-rating') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else list.sort((a, b) => b.item.created_at.localeCompare(a.item.created_at));
    return list;
  }, [base, filters.type, sortValue]);
  const counts = useMemo(() => countBy(base, (v) => v.item.entity_type), [base]);

  const remove = (item: SavedItemOut) => {
    setRemoving(item.id);
    toggle.mutate(
      { item: { entity_type: item.entity_type, entity_id: item.entity_id }, saved: true },
      {
        onSuccess: () => toast.success('Removed from saved'),
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setRemoving(null),
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Saved"
        description="Hospitals, doctors and procedures you bookmarked to compare later."
        actions={
          <ButtonLink to={paths.newScreening()} variant="outline">
            Find more specialists
          </ButtonLink>
        }
      />
      <ListSurface
        header={
          <TableTabs
            label="Saved type"
            items={[{ value: '', label: 'All', count: base.length }, ...TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t], count: counts[t] ?? 0 }))]}
            value={filters.type}
            onChange={(t) => setFilter('type', t)}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name, city or specialty…' }}
            onReset={table.resetFilters}
            actions={<SortMenu value={sortValue} options={SORTS} onChange={(v) => table.setSort(parseSort(v))} />}
          >
            <MultiSelectFilter
              label="City"
              icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
              value={filters.city}
              onChange={(v) => setFilter('city', v)}
              options={options(views.map((v) => v.city))}
            />
            <MultiSelectFilter
              label="Specialty"
              icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
              value={filters.specialty}
              onChange={(v) => setFilter('specialty', v)}
              options={options(views.flatMap((v) => v.specialties))}
            />
            <MultiSelectFilter
              label="Accreditation"
              icon={<Award className="size-3.5 opacity-70" aria-hidden />}
              value={filters.accreditation}
              onChange={(v) => setFilter('accreditation', v)}
              options={options(views.flatMap((v) => v.accreditations))}
            />
          </FilterBar>
        }
        footer={saved.data && rows.length ? `${rows.length} of ${views.length} saved` : undefined}
      >
        {saved.isPending ? (
          <SkeletonList rows={3} className="p-4" />
        ) : saved.isError ? (
          <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
        ) : rows.length === 0 ? (
          <ListEmpty
            filtered={table.isFiltered}
            onReset={table.resetFilters}
            icon={<Bookmark className="size-8" aria-hidden />}
            title="Nothing saved yet"
            description="Tap the bookmark on a doctor in your matches, or browse hospitals to save them for later."
            action={
              <ButtonLink to="/hospitals" variant="outline">
                Browse hospitals
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-3 p-3 sm:p-4 md:grid-cols-2" aria-label="Saved items">
            {rows.map((v) => (
              <SavedCard key={v.item.id} view={v} removing={removing === v.item.id} onRemove={() => remove(v.item)} />
            ))}
          </ul>
        )}
      </ListSurface>
    </div>
  );
}
