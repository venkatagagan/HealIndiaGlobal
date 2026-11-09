import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Globe2, Star, Stethoscope, Video } from 'lucide-react';
import { FilterBar, SelectFilter } from '@hig/shared/ui';
import { GENDER_LABELS, catalogApi, type DoctorCard, type Gender } from '@hig/shared/api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui';
import { LANGUAGE_OPTIONS } from '../../lib/constants';
import { qk, useSpecialties } from '../../lib/queries';
import { filterParam, useDocumentTitle, useTableState } from '../../lib/shared';

const FILTERS = {
  q: filterParam.text(),
  specialty: filterParam.text(),
  language: filterParam.text(),
  gender: filterParam.oneOf(['female', 'male'] as const),
};

export function DoctorsPage() {
  useDocumentTitle('Doctors');
  const table = useTableState({ filters: FILTERS, defaultPageSize: 12 });
  const { filters, setFilter, page } = table;
  const specialties = useSpecialties();

  const query = useQuery({
    queryKey: qk.doctors({ ...filters, page }),
    queryFn: () =>
      catalogApi.listDoctors({
        q: filters.q.trim() || undefined,
        specialty: filters.specialty || undefined,
        language: filters.language || undefined,
        gender: (filters.gender || undefined) as Gender | undefined,
        page,
        page_size: 12,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Doctors" description="Specialists at our partner hospitals." />
      <Card className="mb-6">
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Doctor name…', label: 'Search doctors' }}
          onReset={table.resetFilters}
          resultCount={query.data?.total}
          resultLabel={(n) => `${n} doctor${n === 1 ? '' : 's'}`}
        >
          <SelectFilter
            label="Specialty"
            icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
            value={filters.specialty}
            onChange={(v) => setFilter('specialty', v)}
            options={(specialties.data ?? []).map((sp) => ({ value: sp.slug, label: sp.name }))}
            loading={specialties.isLoading}
            searchable
          />
          <SelectFilter
            label="Language"
            icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
            value={filters.language}
            onChange={(v) => setFilter('language', v)}
            options={LANGUAGE_OPTIONS.map((l) => ({ value: l, label: l }))}
            searchable
          />
          <SelectFilter
            label="Gender"
            value={filters.gender}
            onChange={(v) => setFilter('gender', v)}
            options={[
              { value: 'female', label: GENDER_LABELS.female },
              { value: 'male', label: GENDER_LABELS.male },
            ]}
          />
        </FilterBar>
      </Card>
      {query.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : query.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Stethoscope className="h-6 w-6" />} title="No doctors match these filters"
            action={table.isFiltered ? <Button variant="outline" onClick={table.resetFilters}>Reset filters</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((d) => (
              <DoctorCardView key={d.id} doctor={d} />
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

export function DoctorCardView({ doctor: d }: { doctor: DoctorCard }) {
  return (
    <Link to={`/doctors/${d.id}`} className="group block rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex gap-3">
        {d.photo_url ? (
          <img src={d.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
            <Stethoscope className="h-6 w-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold group-hover:underline">{d.full_name}</p>
          <p className="text-sm text-muted">
            {d.specialty.name}
            {d.experience_years ? ` · ${d.experience_years} yrs` : ''}
          </p>
          <p className="truncate text-sm text-muted">
            {d.hospital.name}, {d.hospital.city}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {d.success_rate_pct != null && <Badge tone="success">{Number(d.success_rate_pct).toFixed(0)}% success</Badge>}
        {d.rating_avg != null && (
          <Badge>
            <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden /> {Number(d.rating_avg).toFixed(1)} ({d.rating_count})
          </Badge>
        )}
        {d.teleconsult_available && (
          <Badge tone="accent">
            <Video className="h-3 w-3" aria-hidden /> Teleconsult
          </Badge>
        )}
        {d.qualifications.slice(0, 3).map((q) => (
          <Badge key={q}>{q}</Badge>
        ))}
      </div>
      {d.languages.length > 0 && <p className="mt-2 text-xs text-muted">Speaks {d.languages.join(', ')}</p>}
    </Link>
  );
}
