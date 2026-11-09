import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowDownUp, BadgeCheck, Building2, Globe2, MapPin, Star } from 'lucide-react';
import { FilterBar, SelectFilter } from '@hig/shared/ui';
import { HOSPITAL_SORTS, catalogApi, type HospitalCard, type HospitalSort } from '@hig/shared/api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui';
import { optionsFromRows, useHospitalOptions } from '../../lib/lookups';
import { LANGUAGE_OPTIONS } from '../../lib/constants';
import { qk, useSpecialties } from '../../lib/queries';
import { filterParam, formatMoney, useDocumentTitle, useTableState } from '../../lib/shared';

const ACCREDITATIONS = [
  { value: 'jci', label: 'JCI' },
  { value: 'nabh', label: 'NABH' },
  { value: 'nabl', label: 'NABL' },
  { value: 'iso', label: 'ISO' },
];
const SORT_LABELS: Record<HospitalSort, string> = {
  rating: 'Top rated',
  price: 'Lowest price',
  name: 'Name (A–Z)',
  soonest: 'Soonest appointment',
};
const FILTERS = {
  q: filterParam.text(),
  city: filterParam.text(),
  specialty: filterParam.text(),
  accreditation: filterParam.text(),
  language: filterParam.text(),
  order: filterParam.oneOf(HOSPITAL_SORTS),
};

export function HospitalsPage() {
  useDocumentTitle('Hospitals');
  const table = useTableState({ filters: FILTERS, defaultPageSize: 12 });
  const { filters, setFilter, page } = table;
  const specialties = useSpecialties();
  const hospitals = useHospitalOptions();
  const cityOptions = optionsFromRows(hospitals.data ?? [], (h) => (h.description ? { value: h.description, label: h.description } : null));

  const query = useQuery({
    queryKey: qk.hospitals({ ...filters, page }),
    queryFn: () =>
      catalogApi.listHospitals({
        q: filters.q.trim() || undefined,
        city: filters.city || undefined,
        specialty: filters.specialty || undefined,
        accreditation: filters.accreditation || undefined,
        language: filters.language || undefined,
        sort: filters.order || 'rating',
        page,
        page_size: 12,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Hospitals" description="Verified partner hospitals across India. Open a hospital to send an enquiry for one of your patients." />
      <Card className="mb-6">
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Hospital name…', label: 'Search hospitals' }}
          onReset={table.resetFilters}
          resultCount={query.data?.total}
          resultLabel={(n) => `${n} hospital${n === 1 ? '' : 's'}`}
          actions={
            <SelectFilter
              label="Sort"
              icon={<ArrowDownUp className="size-3.5 opacity-70" aria-hidden />}
              value={filters.order}
              onChange={(v) => setFilter('order', v)}
              options={HOSPITAL_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
              align="end"
            />
          }
          more={
            <SelectFilter
              label="Language"
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.language}
              onChange={(v) => setFilter('language', v)}
              options={LANGUAGE_OPTIONS.map((l) => ({ value: l, label: l }))}
              searchable
            />
          }
        >
          <SelectFilter
            label="Specialty"
            value={filters.specialty}
            onChange={(v) => setFilter('specialty', v)}
            options={(specialties.data ?? []).map((sp) => ({ value: sp.slug, label: sp.name }))}
            loading={specialties.isLoading}
            searchable
          />
          <SelectFilter
            label="City"
            icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
            value={filters.city}
            onChange={(v) => setFilter('city', v)}
            options={cityOptions}
            loading={hospitals.isLoading}
            searchable
          />
          <SelectFilter
            label="Accreditation"
            icon={<BadgeCheck className="size-3.5 opacity-70" aria-hidden />}
            value={filters.accreditation}
            onChange={(v) => setFilter('accreditation', v)}
            options={ACCREDITATIONS}
          />
        </FilterBar>
      </Card>

      {query.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : query.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="h-6 w-6" />} title="No hospitals match these filters"
            description="Try removing a filter."
            action={table.isFiltered ? <Button variant="outline" onClick={table.resetFilters}>Reset filters</Button> : undefined} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((h) => (
              <HospitalCardView key={h.id} hospital={h} />
            ))}
          </div>
          <Card className="mt-6">
            <Pagination page={query.data.page} pages={query.data.pages} total={query.data.total} onChange={table.setPage} />
          </Card>
        </>
      )}
    </div>
  );
}

export function HospitalCardView({ hospital: h }: { hospital: HospitalCard }) {
  return (
    <Link to={`/hospitals/${h.slug}`} className="group block rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="relative h-32 overflow-hidden rounded-t-xl bg-surface-2">
        {h.cover_image_url ? (
          <img src={h.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="hero-gradient h-full w-full opacity-80" />
        )}
        {h.logo_url && <img src={h.logo_url} alt="" className="absolute bottom-2 left-3 h-10 w-10 rounded-lg bg-white object-contain p-1" loading="lazy" />}
      </div>
      <div className="space-y-2 p-4">
        <p className="font-semibold group-hover:underline">{h.name}</p>
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {h.city}
          {h.state ? `, ${h.state}` : ''}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {h.accreditations.map((a) => (
            <Badge key={a} tone="info">
              <BadgeCheck className="h-3 w-3" aria-hidden /> {a.toUpperCase()}
            </Badge>
          ))}
          {h.rating_avg != null && (
            <Badge>
              <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden /> {Number(h.rating_avg).toFixed(1)} ({h.rating_count})
            </Badge>
          )}
          {h.international_desk && (
            <Badge tone="accent">
              <Globe2 className="h-3 w-3" aria-hidden /> International desk
            </Badge>
          )}
        </div>
        {h.specialties.length > 0 && <p className="line-clamp-1 text-xs text-muted">{h.specialties.join(' · ')}</p>}
        {h.starting_price_minor != null && (
          <p className="text-sm">
            From <span className="font-semibold">{formatMoney(h.starting_price_minor, h.currency, undefined, { trimZeros: true })}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
