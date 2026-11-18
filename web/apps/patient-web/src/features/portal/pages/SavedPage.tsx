import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Award, Bookmark, MapPin, Stethoscope, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import { errorMessage, type SavedEntityType, type SavedItemOut } from '@hig/shared/api';
import { filterParam, formatDate, formatNumber, matchesSearch, parseSort, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { FilterBar, MultiSelectFilter } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { useSavedItems, useToggleSaved } from '../api/queries';
import { Accreditations, Avatar, MoneyRange, Rating } from '../components/common';
import { ListEmpty, ListSurface, SortMenu, TableTabs, countBy } from '../components/listing';
import { paths } from '../lib/paths';
import { Button, ButtonLink, ErrorState, PageHeader, SkeletonList } from '../ui/primitives';

const TYPES = ['hospital', 'doctor', 'procedure'] as const satisfies readonly SavedEntityType[];
// labels: `saved.types.<type>` (plural, tabs) and `saved.typeSingular.<type>` (card eyebrow)

const FILTERS = {
  q: filterParam.text(),
  type: filterParam.oneOf(TYPES),
  city: filterParam.list(),
  specialty: filterParam.list(),
  accreditation: filterParam.list(),
};
const SORTS = [
  { value: '-created_at', label: 'recent' },
  { value: 'name', label: 'name' },
  { value: '-rating', label: 'rating' },
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

function viewOf(item: SavedItemOut, t: TFunction): View {
  const base = { item, image: null, city: null, specialties: [], accreditations: [], rating: null, extra: null, href: null, subtitle: null };
  if (item.entity_type === 'doctor' && item.doctor) {
    const d = item.doctor;
    return {
      ...base,
      title: d.full_name,
      subtitle: `${d.specialty.name}${d.experience_years ? ` · ${t('saved.years', { count: d.experience_years })}` : ''}`,
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
            <Trans
              t={t}
              i18nKey="saved.fromInIndia"
              components={{
                0: <MoneyRange min={p.india_price_min_minor} max={p.india_price_max_minor} currency={p.currency} className="font-semibold text-fg" />,
              }}
            />
          </span>
        ) : null,
    };
  }
  return { ...base, title: t('saved.item') };
}

const options = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

function SavedCard({ view, onRemove, removing }: { view: View; onRemove: () => void; removing: boolean }) {
  const { t } = useAppTranslation();
  const { item } = view;
  const doctor = item.entity_type === 'doctor' ? item.doctor : null;
  return (
    <li className="group relative flex gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:shadow-card">
      <Avatar name={view.title} src={view.image} size={56} />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t(`saved.typeSingular.${item.entity_type}`)}</span>
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
          <span>{t('saved.savedOn', { date: formatDate(item.created_at) })}</span>
        </p>
        {view.extra ? <div className="mt-2">{view.extra}</div> : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        loading={removing}
        onClick={onRemove}
        className="relative z-10 self-start"
        aria-label={t('saved.remove', { name: view.title })}
        icon={<Trash2 className="h-4 w-4 text-danger" aria-hidden />}
      />
    </li>
  );
}

export function SavedPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('saved.title'));
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', paginate: false });
  const { filters, setFilter } = table;
  const saved = useSavedItems();
  const toggle = useToggleSaved();
  const [removing, setRemoving] = useState<string | null>(null);
  const sortOptions = useMemo(() => SORTS.map((s) => ({ value: s.value, label: t(`saved.sort.${s.label}`) })), [t]);

  const views = useMemo(() => (saved.data ?? []).map((item) => viewOf(item, t)), [saved.data, t]);
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
        onSuccess: () => toast.success(t('saved.removed')),
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: () => setRemoving(null),
      },
    );
  };

  return (
    <div>
      <PageHeader
        title={t('saved.title')}
        description={t('saved.description')}
        actions={
          <ButtonLink to={paths.newScreening()} variant="outline">
            {t('saved.findMore')}
          </ButtonLink>
        }
      />
      <ListSurface
        header={
          <TableTabs
            label={t('saved.tabsLabel')}
            items={[
              { value: '', label: t('saved.all'), count: base.length },
              ...TYPES.map((type) => ({ value: type, label: t(`saved.types.${type}`), count: counts[type] ?? 0 })),
            ]}
            value={filters.type}
            onChange={(type) => setFilter('type', type)}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('saved.filters.search') }}
            onReset={table.resetFilters}
            actions={<SortMenu value={sortValue} options={sortOptions} onChange={(v) => table.setSort(parseSort(v))} />}
          >
            <MultiSelectFilter
              label={t('saved.filters.city')}
              icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
              value={filters.city}
              onChange={(v) => setFilter('city', v)}
              options={options(views.map((v) => v.city))}
            />
            <MultiSelectFilter
              label={t('saved.filters.specialty')}
              icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
              value={filters.specialty}
              onChange={(v) => setFilter('specialty', v)}
              options={options(views.flatMap((v) => v.specialties))}
            />
            <MultiSelectFilter
              label={t('saved.filters.accreditation')}
              icon={<Award className="size-3.5 opacity-70" aria-hidden />}
              value={filters.accreditation}
              onChange={(v) => setFilter('accreditation', v)}
              options={options(views.flatMap((v) => v.accreditations))}
            />
          </FilterBar>
        }
        footer={
          saved.data && rows.length ? t('saved.footer', { shown: formatNumber(rows.length), total: formatNumber(views.length) }) : undefined
        }
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
            title={t('saved.empty.title')}
            description={t('saved.empty.description')}
            action={
              <ButtonLink to="/hospitals" variant="outline">
                {t('saved.empty.browse')}
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-3 p-3 sm:p-4 md:grid-cols-2" aria-label={t('saved.listLabel')}>
            {rows.map((v) => (
              <SavedCard key={v.item.id} view={v} removing={removing === v.item.id} onRemove={() => remove(v.item)} />
            ))}
          </ul>
        )}
      </ListSurface>
    </div>
  );
}
