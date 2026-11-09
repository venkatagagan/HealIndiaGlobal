import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { AlertOctagon, Award, Bot, ClipboardList, Info, MapPin, Siren, Sparkles, Star } from 'lucide-react';
import { errorMessage, LIKELIHOOD_LABELS, type MatchOut, type Urgency } from '@hig/shared/api';
import { useMatches, useSavedItems, useScreening, useToggleSaved } from '../../api/queries';
import { CostComparisonPanel } from '../../components/CostComparisonPanel';
import { BackLink, StatusBadge } from '../../components/common';
import { HelplineList } from '../../components/SupportDialogs';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { filterParam, parseSort, toMinor, useDocumentTitle, useTableState } from '../../lib/shared';
import { AmountRangeFilter, FilterBar, MultiSelectFilter, ReportButton, SelectFilter, ToggleFilter } from '@hig/shared/ui';
import { ListEmpty, ListSurface, SortMenu, countBy } from '../../components/listing';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonList,
} from '../../ui/primitives';
import { MatchCard } from './MatchCard';
import { RequestQuoteDialog } from './RequestQuoteDialog';

const MAX_COMPARE = 3;

const MATCH_FILTERS = {
  city: filterParam.list(),
  specialty: filterParam.list(),
  accreditation: filterParam.list(),
  language: filterParam.list(),
  rating: filterParam.oneOf(['4.5', '4', '3.5'] as const),
  price_min: filterParam.number(),
  price_max: filterParam.number(),
  budget: filterParam.boolean(),
};
const MATCH_SORTS = [
  { value: '-match', label: 'Best match' },
  { value: 'cost', label: 'Lowest cost' },
  { value: '-rating', label: 'Highest rated' },
  { value: '-success', label: 'Success rate' },
] as const;
type MatchSort = (typeof MATCH_SORTS)[number]['value'];
const RATING_OPTIONS = [
  { value: '4.5' as const, label: '4.5 and above' },
  { value: '4' as const, label: '4.0 and above' },
  { value: '3.5' as const, label: '3.5 and above' },
];
const ratingOf = (m: MatchOut) => Number(m.doctor?.rating_avg ?? m.hospital.rating_avg ?? 0);
const languagesOf = (m: MatchOut) => (m.doctor?.languages.length ? m.doctor.languages : m.hospital.languages);

const URGENCY_COPY: Record<Urgency, { tone: 'green' | 'blue' | 'amber' | 'red'; title: string; body: string }> = {
  routine: {
    tone: 'green',
    title: 'Routine - plan at your convenience',
    body: 'Your answers do not suggest an urgent problem. You can plan treatment in your preferred travel window.',
  },
  soon: {
    tone: 'blue',
    title: 'Recommended soon',
    body: 'We suggest arranging a consultation within the next few weeks.',
  },
  urgent: {
    tone: 'amber',
    title: 'Urgent - please see a doctor soon',
    body: 'Some answers need prompt medical attention. Please see a doctor locally in the next few days, even while you plan treatment in India.',
  },
  emergency: {
    tone: 'red',
    title: 'Emergency — seek local care now',
    body: 'Your answers include warning signs that need immediate medical attention.',
  },
};

export function ResultsPage() {
  const { id = '' } = useParams();
  useDocumentTitle('Your top matches');
  const navigate = useNavigate();
  const me = useMe();
  const screening = useScreening(id);
  const completed = screening.data?.status === 'completed';
  const matches = useMatches(id, completed);
  const saved = useSavedItems();
  const toggleSaved = useToggleSaved();

  const table = useTableState({ filters: MATCH_FILTERS, defaultSort: '-match', paginate: false });
  const { filters, setFilter, setFilters } = table;
  const sort = (MATCH_SORTS.find((o) => o.value === table.sortParam)?.value ?? '-match') as MatchSort;
  const [selected, setSelected] = useState<string[]>([]);
  const [quoteFor, setQuoteFor] = useState<MatchOut | null>(null);
  const [procedure, setProcedure] = useState<string | null>(null);

  const s = screening.data;
  const ai = s?.ai_result ?? null;
  const urgency: Urgency | null = s?.urgency ?? ai?.urgency ?? null;
  const emergency = urgency === 'emergency';
  const budgetMax = s?.preferences.budget_max_minor ?? null;
  const budgetCurrency = s?.preferences.budget_currency ?? null;

  const all = useMemo(() => matches.data ?? [], [matches.data]);
  const facets = useMemo(() => {
    const opts = (values: (string | null | undefined)[]) => {
      const counts = countBy(values.filter((v): v is string => !!v), (v) => v);
      return Object.keys(counts)
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v, count: counts[v] }));
    };
    const currencies = countBy(all.filter((m) => m.estimated_cost_minor != null), (m) => m.currency);
    return {
      cities: opts(all.map((m) => m.hospital.city)),
      specialties: opts(all.map((m) => m.doctor?.specialty.name)),
      accreditations: opts(all.flatMap((m) => m.hospital.accreditations.map((a) => a.toUpperCase()))),
      languages: opts(all.flatMap((m) => languagesOf(m))),
      currency: Object.entries(currencies).sort((a, b) => b[1] - a[1])[0]?.[0] ?? budgetCurrency ?? 'USD',
    };
  }, [all, budgetCurrency]);

  const visible = useMemo(() => {
    const minRating = filters.rating ? Number(filters.rating) : null;
    const minPrice = filters.price_min !== undefined ? toMinor(filters.price_min, facets.currency) : null;
    const maxPrice = filters.price_max !== undefined ? toMinor(filters.price_max, facets.currency) : null;
    const list = all
      .filter((m) => !filters.city.length || filters.city.includes(m.hospital.city))
      .filter((m) => !filters.specialty.length || (!!m.doctor && filters.specialty.includes(m.doctor.specialty.name)))
      .filter((m) => !filters.accreditation.length || m.hospital.accreditations.some((a) => filters.accreditation.includes(a.toUpperCase())))
      .filter((m) => !filters.language.length || languagesOf(m).some((l) => filters.language.includes(l)))
      .filter((m) => minRating === null || ratingOf(m) >= minRating)
      .filter((m) => {
        if (minPrice === null && maxPrice === null) return true;
        if (m.estimated_cost_minor == null || m.currency !== facets.currency) return false;
        return (minPrice === null || m.estimated_cost_minor >= minPrice) && (maxPrice === null || m.estimated_cost_minor <= maxPrice);
      })
      .filter(
        (m) =>
          !filters.budget ||
          budgetMax == null ||
          (m.estimated_cost_minor != null && (m.currency !== budgetCurrency || m.estimated_cost_minor <= budgetMax)),
      );
    const num = (v: number | null | undefined, fallback: number) => (v == null ? fallback : Number(v));
    list.sort((a, b) => {
      switch (sort) {
        case 'cost':
          return num(a.estimated_cost_minor, Number.MAX_SAFE_INTEGER) - num(b.estimated_cost_minor, Number.MAX_SAFE_INTEGER);
        case '-rating':
          return ratingOf(b) - ratingOf(a);
        case '-success':
          return num(b.doctor?.success_rate_pct, 0) - num(a.doctor?.success_rate_pct, 0);
        default:
          return num(b.match_score, 0) - num(a.match_score, 0) || a.rank - b.rank;
      }
    });
    return list;
  }, [all, filters, facets.currency, budgetMax, budgetCurrency, sort]);

  const procedures = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of ai?.recommended_procedures ?? []) out.set(p.slug, p.name);
    for (const m of matches.data ?? []) if (m.procedure) out.set(m.procedure.slug, m.procedure.name);
    return [...out].map(([slug, name]) => ({ slug, name }));
  }, [ai, matches.data]);
  const activeProcedure = procedure ?? procedures[0]?.slug ?? null;

  if (screening.isError) return <ErrorState error={screening.error} onRetry={() => void screening.refetch()} />;
  if (s && s.status === 'draft') return <Navigate to={paths.screeningStep(id, 1)} replace />;
  if (s && s.status !== 'completed') return <Navigate to={paths.screeningProcessing(id)} replace />;
  if (!s) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <SkeletonList rows={3} />
      </div>
    );
  }

  const savedDoctorIds = new Set((saved.data ?? []).filter((x) => x.entity_type === 'doctor').map((x) => x.entity_id));

  function toggleSelect(matchId: string) {
    setSelected((prev) =>
      prev.includes(matchId) ? prev.filter((x) => x !== matchId) : prev.length >= MAX_COMPARE ? prev : [...prev, matchId],
    );
  }

  return (
    <div className="pb-24">
      <PageHeader
        back={<BackLink to={paths.dashboard}>Dashboard</BackLink>}
        title="Your top matches"
        description={`Based on your ${s.specialty?.name ?? 'screening'} answers.`}
        actions={
          <ButtonLink to={paths.newScreening(s.specialty?.slug)} variant="outline">
            New screening
          </ButtonLink>
        }
      />

      {urgency ? (
        emergency ? (
          <div role="alert" className="mb-6 rounded-2xl border-2 border-danger bg-danger-soft p-5">
            <div className="flex items-start gap-3">
              <Siren className="h-8 w-8 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-danger-ink">Emergency — seek local care now</h2>
                <p className="mt-1 text-sm text-danger-ink">
                  Your answers include warning signs that need immediate medical attention. Please do not wait to travel -
                  call your local emergency number or go to the nearest emergency department now.
                </p>
                {s.red_flags.length ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-danger-ink">
                    {s.red_flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4 rounded-xl bg-surface p-3">
                  <HelplineList />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Alert
            tone={URGENCY_COPY[urgency].tone}
            title={URGENCY_COPY[urgency].title}
            icon={urgency === 'urgent' ? <AlertOctagon className="h-5 w-5" aria-hidden /> : <Info className="h-5 w-5" aria-hidden />}
            className="mb-6"
          >
            {URGENCY_COPY[urgency].body}
          </Alert>
        )
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" aria-hidden /> Screening summary
              </span>
            }
            action={
              <Badge tone={ai?.engine === 'claude' ? 'violet' : 'neutral'}>
                <Bot className="h-3.5 w-3.5" aria-hidden /> {ai?.engine === 'claude' ? 'AI assisted' : 'Rule-based'}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            {ai ? (
              <>
                <p className="leading-relaxed text-fg/80">{ai.summary}</p>
                {ai.possible_conditions.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">Possible conditions to discuss with a doctor</h3>
                    <ul className="mt-2 space-y-2">
                      {ai.possible_conditions.map((c) => (
                        <li key={c.name} className="rounded-xl bg-surface-2 p-3 text-sm">
                          <span className="font-medium">{c.name}</span>{' '}
                          <Badge tone={c.likelihood === 'high' ? 'amber' : c.likelihood === 'medium' ? 'blue' : 'neutral'}>
                            {LIKELIHOOD_LABELS[c.likelihood]} likelihood
                          </Badge>
                          {c.notes ? <p className="mt-1 text-muted">{c.notes}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {ai.suggested_specialties.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">Suggested specialties</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ai.suggested_specialties.map((sp) => (
                        <Badge key={sp.slug} tone="violet" className="text-sm">
                          {sp.name} · {Math.round(sp.confidence * 100)}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {ai.recommended_procedures.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">Procedures that may be considered</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {ai.recommended_procedures.map((p) => (
                        <li key={p.slug}>
                          <span className="font-medium">{p.name}</span>
                          {p.rationale ? <span className="text-muted"> - {p.rationale}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
                  {ai.disclaimer ||
                    'This is not a medical diagnosis. It is a triage summary to help you find the right specialists. A qualified doctor will review your case.'}
                </p>
                <div className="flex justify-end">
                  <ReportButton targetType="screening_result" targetId={s.id} label="Report this result" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">No summary is available for this screening.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-success-ink" aria-hidden /> Prepare for your consultation
              </span>
            }
          />
          <CardBody className="space-y-4 text-sm">
            {urgency ? (
              <p>
                Urgency: <StatusBadge status={urgency} />
              </p>
            ) : null}
            {ai?.recommended_tests.length ? (
              <div>
                <p className="font-semibold">Recommended tests</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {ai.recommended_tests.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai?.questions_for_doctor.length ? (
              <div>
                <p className="font-semibold">Questions for your doctor</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {ai.questions_for_doctor.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai?.travel_advice ? (
              <div>
                <p className="font-semibold">Travel advice</p>
                <p className="mt-1 text-muted">{ai.travel_advice}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">{emergency ? 'Specialists for later reference' : 'Matched doctors & hospitals'}</h2>
          <p className="text-sm text-muted">
            {emergency
              ? 'Once you have been seen locally and are stable, you can come back to request quotes.'
              : 'Narrow the list with the filters, select up to 3 to compare side by side, or request a quote directly.'}
          </p>
        </div>

        <ListSurface
          toolbar={
            <FilterBar
              onReset={table.resetFilters}
              resultCount={matches.data ? visible.length : undefined}
              resultLabel={(n) => `${n} of ${all.length} ${all.length === 1 ? 'match' : 'matches'}`}
              actions={<SortMenu value={sort} options={MATCH_SORTS} onChange={(v) => table.setSort(parseSort(v))} />}
              more={
                <>
                  <MultiSelectFilter label="Specialty" value={filters.specialty} onChange={(v) => setFilter('specialty', v)} options={facets.specialties} />
                  <MultiSelectFilter label="Language" value={filters.language} onChange={(v) => setFilter('language', v)} options={facets.languages} />
                  {budgetMax != null ? (
                    <ToggleFilter label="Within my budget" pressed={!!filters.budget} onChange={(on) => setFilter('budget', on || undefined)} />
                  ) : null}
                </>
              }
            >
              <MultiSelectFilter
                label="City"
                icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
                value={filters.city}
                onChange={(v) => setFilter('city', v)}
                options={facets.cities}
              />
              <MultiSelectFilter
                label="Accreditation"
                icon={<Award className="size-3.5 opacity-70" aria-hidden />}
                value={filters.accreditation}
                onChange={(v) => setFilter('accreditation', v)}
                options={facets.accreditations}
              />
              <AmountRangeFilter
                label="Price"
                currency={facets.currency}
                value={{ min: filters.price_min, max: filters.price_max }}
                onChange={({ min, max }) => setFilters({ price_min: min, price_max: max })}
              />
              <SelectFilter
                label="Rating"
                icon={<Star className="size-3.5 opacity-70" aria-hidden />}
                value={filters.rating}
                onChange={(v) => setFilter('rating', v)}
                options={RATING_OPTIONS}
              />
            </FilterBar>
          }
        >
          {matches.isPending ? (
            <SkeletonList rows={3} className="p-4" />
          ) : matches.isError ? (
            <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
          ) : visible.length === 0 ? (
            all.length ? (
              <ListEmpty filtered onReset={table.resetFilters} title="No matches with these filters" />
            ) : (
              <EmptyState
                title="No matches found yet"
                description="We could not find a suitable specialist automatically. Our coordinators can help - send us a message."
                action={<ButtonLink to={paths.messages}>Message a coordinator</ButtonLink>}
              />
            )
          ) : (
            <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-2">
              {visible.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  selected={selected.includes(m.id)}
                  canSelect={selected.length < MAX_COMPARE}
                  onToggleSelect={() => toggleSelect(m.id)}
                  onRequestQuote={() => setQuoteFor(m)}
                  showActions={!emergency}
                  saved={!!m.doctor && savedDoctorIds.has(m.doctor.id)}
                  onToggleSave={
                    m.doctor && !me.data?.is_guest
                      ? () =>
                          toggleSaved.mutate(
                            { item: { entity_type: 'doctor', entity_id: m.doctor!.id }, saved: savedDoctorIds.has(m.doctor!.id) },
                            { onError: (err) => toast.error(errorMessage(err)) },
                          )
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </ListSurface>
      </section>

      {!emergency ? (
        <section className="mt-8">
          <CostComparisonPanel
            procedures={procedures}
            procedure={activeProcedure}
            onProcedure={setProcedure}
            country={s.home_country ?? me.data?.country_code ?? null}
            currency={s.preferences.budget_currency ?? 'USD'}
          />
        </section>
      ) : null}

      {!emergency && (matches.data?.length ?? 0) > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-20 px-4 lg:bottom-4 lg:left-64">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">
              {selected.length}/{MAX_COMPARE} selected for comparison
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={selected.length < 2}
              onClick={() => navigate(paths.screeningCompare(id, selected))}
            >
              Compare
            </Button>
          </div>
        </div>
      ) : null}

      <RequestQuoteDialog match={quoteFor} screening={s} onClose={() => setQuoteFor(null)} />
    </div>
  );
}
