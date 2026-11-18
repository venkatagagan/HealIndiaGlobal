import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { AlertOctagon, Award, Bot, ClipboardList, Info, MapPin, Siren, Sparkles, Star } from 'lucide-react';
import { errorMessage, LIKELIHOOD_LABELS, type MatchOut, type Urgency } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useMatches, useSavedItems, useScreening, useToggleSaved } from '../../api/queries';
import { FreeCallBanner } from '../../components/Prompts';
import { CostComparisonPanel } from '../../components/CostComparisonPanel';
import { BackLink, StatusBadge } from '../../components/common';
import { HelplineList } from '../../components/SupportDialogs';
import { paths } from '../../lib/paths';
import { useMe } from '../../lib/session';
import { filterParam, formatNumber, parseSort, toMinor, useDocumentTitle, useTableState } from '../../lib/shared';
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
const MATCH_SORTS = ['-match', 'cost', '-rating', '-success'] as const;
type MatchSort = (typeof MATCH_SORTS)[number];
const SORT_KEYS: Record<MatchSort, string> = { '-match': 'bestMatch', cost: 'lowestCost', '-rating': 'highestRated', '-success': 'successRate' };
const RATING_VALUES = ['4.5', '4', '3.5'] as const;
const ratingOf = (m: MatchOut) => Number(m.doctor?.rating_avg ?? m.hospital.rating_avg ?? 0);
const languagesOf = (m: MatchOut) => (m.doctor?.languages.length ? m.doctor.languages : m.hospital.languages);

/** Tone per urgency; the copy is `screening.results.urgency.<level>.title|body`. */
const URGENCY_TONE: Record<Urgency, 'green' | 'blue' | 'amber' | 'red'> = {
  routine: 'green',
  soon: 'blue',
  urgent: 'amber',
  emergency: 'red',
};

export function ResultsPage() {
  const { t } = useAppTranslation();
  const { id = '' } = useParams();
  useDocumentTitle(t('screening.results.title'));
  const sortOptions = useMemo(() => MATCH_SORTS.map((value) => ({ value, label: t(`screening.results.sort.${SORT_KEYS[value]}`) })), [t]);
  const ratingOptions = useMemo(
    () =>
      RATING_VALUES.map((value) => ({
        value,
        label: t('screening.results.ratingAtLeast', { rating: formatNumber(Number(value), { minimumFractionDigits: 1 }) }),
      })),
    [t],
  );
  const navigate = useNavigate();
  const me = useMe();
  const screening = useScreening(id);
  const completed = screening.data?.status === 'completed';
  const matches = useMatches(id, completed);
  const saved = useSavedItems();
  const toggleSaved = useToggleSaved();

  const table = useTableState({ filters: MATCH_FILTERS, defaultSort: '-match', paginate: false });
  const { filters, setFilter, setFilters } = table;
  const sort = (MATCH_SORTS.find((o) => o === table.sortParam) ?? '-match') as MatchSort;
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
        back={<BackLink to={paths.dashboard}>{t('shell.nav.dashboard')}</BackLink>}
        title={t('screening.results.title')}
        description={
          s.specialty?.name ? t('screening.results.basedOn', { specialty: s.specialty.name }) : t('screening.results.basedOnGeneral')
        }
        actions={
          <ButtonLink to={paths.newScreening(s.specialty?.slug)} variant="outline">
            {t('screening.results.newScreening')}
          </ButtonLink>
        }
      />

      {!emergency ? <FreeCallBanner className="mb-6" screeningId={s.id} /> : null}

      {urgency ? (
        emergency ? (
          <div role="alert" className="mb-6 rounded-2xl border-2 border-danger bg-danger-soft p-5">
            <div className="flex items-start gap-3">
              <Siren className="h-8 w-8 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-danger-ink">{t('screening.results.urgency.emergency.title')}</h2>
                <p className="mt-1 text-sm text-danger-ink">{t('screening.results.emergencyBody')}</p>
                {s.red_flags.length ? (
                  <ul className="mt-2 list-disc ps-5 text-sm text-danger-ink">
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
            tone={URGENCY_TONE[urgency]}
            title={t(`screening.results.urgency.${urgency}.title`)}
            icon={urgency === 'urgent' ? <AlertOctagon className="h-5 w-5" aria-hidden /> : <Info className="h-5 w-5" aria-hidden />}
            className="mb-6"
          >
            {t(`screening.results.urgency.${urgency}.body`)}
          </Alert>
        )
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" aria-hidden /> {t('screening.results.summary')}
              </span>
            }
            action={
              <Badge tone={ai?.engine === 'claude' ? 'violet' : 'neutral'}>
                <Bot className="h-3.5 w-3.5" aria-hidden /> {ai?.engine === 'claude' ? t('screening.results.aiAssisted') : t('screening.results.ruleBased')}
              </Badge>
            }
          />
          <CardBody className="space-y-5">
            {ai ? (
              <>
                <p className="leading-relaxed text-fg/80">{ai.summary}</p>
                {ai.possible_conditions.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">{t('screening.results.possibleConditions')}</h3>
                    <ul className="mt-2 space-y-2">
                      {ai.possible_conditions.map((c) => (
                        <li key={c.name} className="rounded-xl bg-surface-2 p-3 text-sm">
                          <span className="font-medium">{c.name}</span>{' '}
                          <Badge tone={c.likelihood === 'high' ? 'amber' : c.likelihood === 'medium' ? 'blue' : 'neutral'}>
                            {t('screening.results.likelihood', { level: LIKELIHOOD_LABELS[c.likelihood] })}
                          </Badge>
                          {c.notes ? <p className="mt-1 text-muted">{c.notes}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {ai.suggested_specialties.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">{t('screening.results.suggestedSpecialties')}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ai.suggested_specialties.map((sp) => (
                        <Badge key={sp.slug} tone="violet" className="text-sm">
                          {sp.name} · {formatNumber(sp.confidence, { style: 'percent', maximumFractionDigits: 0 })}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {ai.recommended_procedures.length ? (
                  <div>
                    <h3 className="text-sm font-semibold">{t('screening.results.procedures')}</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {ai.recommended_procedures.map((p) => (
                        <li key={p.slug}>
                          <Link to={paths.procedure(p.slug)} className="font-medium text-primary-ink hover:underline">
                            {p.name}
                          </Link>
                          {p.rationale ? <span className="text-muted"> - {p.rationale}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
                  {ai.disclaimer || t('screening.results.disclaimer')}
                </p>
                <div className="flex justify-end">
                  <ReportButton targetType="screening_result" targetId={s.id} label={t('screening.results.report')} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">{t('screening.results.noSummary')}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-success-ink" aria-hidden /> {t('screening.results.prepare')}
              </span>
            }
          />
          <CardBody className="space-y-4 text-sm">
            {urgency ? (
              <p>
                {t('screening.results.urgencyLabel')} <StatusBadge status={urgency} />
              </p>
            ) : null}
            {ai?.recommended_tests.length ? (
              <div>
                <p className="font-semibold">{t('screening.results.tests')}</p>
                <ul className="mt-1 list-disc ps-5 text-muted">
                  {ai.recommended_tests.map((test) => (
                    <li key={test}>{test}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai?.questions_for_doctor.length ? (
              <div>
                <p className="font-semibold">{t('screening.results.questions')}</p>
                <ul className="mt-1 list-disc ps-5 text-muted">
                  {ai.questions_for_doctor.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai?.travel_advice ? (
              <div>
                <p className="font-semibold">{t('screening.results.travelAdvice')}</p>
                <p className="mt-1 text-muted">{ai.travel_advice}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">{emergency ? t('screening.results.laterReference') : t('screening.results.matched')}</h2>
          <p className="text-sm text-muted">
            {emergency ? t('screening.results.laterReferenceHint') : t('screening.results.matchedHint', { max: MAX_COMPARE })}
          </p>
        </div>

        <ListSurface
          toolbar={
            <FilterBar
              onReset={table.resetFilters}
              resultCount={matches.data ? visible.length : undefined}
              resultLabel={(n) => t('screening.results.resultCount', { count: all.length, shown: formatNumber(n), total: formatNumber(all.length) })}
              actions={<SortMenu value={sort} options={sortOptions} onChange={(v) => table.setSort(parseSort(v))} />}
              more={
                <>
                  <MultiSelectFilter label={t('screening.results.filters.specialty')} value={filters.specialty} onChange={(v) => setFilter('specialty', v)} options={facets.specialties} />
                  <MultiSelectFilter label={t('screening.results.filters.language')} value={filters.language} onChange={(v) => setFilter('language', v)} options={facets.languages} />
                  {budgetMax != null ? (
                    <ToggleFilter label={t('screening.results.filters.budget')} pressed={!!filters.budget} onChange={(on) => setFilter('budget', on || undefined)} />
                  ) : null}
                </>
              }
            >
              <MultiSelectFilter
                label={t('screening.results.filters.city')}
                icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
                value={filters.city}
                onChange={(v) => setFilter('city', v)}
                options={facets.cities}
              />
              <MultiSelectFilter
                label={t('screening.results.filters.accreditation')}
                icon={<Award className="size-3.5 opacity-70" aria-hidden />}
                value={filters.accreditation}
                onChange={(v) => setFilter('accreditation', v)}
                options={facets.accreditations}
              />
              <AmountRangeFilter
                label={t('screening.results.filters.price')}
                currency={facets.currency}
                value={{ min: filters.price_min, max: filters.price_max }}
                onChange={({ min, max }) => setFilters({ price_min: min, price_max: max })}
              />
              <SelectFilter
                label={t('screening.results.filters.rating')}
                icon={<Star className="size-3.5 opacity-70" aria-hidden />}
                value={filters.rating}
                onChange={(v) => setFilter('rating', v)}
                options={ratingOptions}
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
              <ListEmpty filtered onReset={table.resetFilters} title={t('screening.results.noFiltered')} />
            ) : (
              <EmptyState
                title={t('screening.results.noMatchesTitle')}
                description={t('screening.results.noMatchesText')}
                action={<ButtonLink to={paths.messages}>{t('screening.results.messageCoordinator')}</ButtonLink>}
              />
            )
          ) : (
            <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-2">
              {visible.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  screeningId={id}
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
        <div className="fixed inset-x-0 bottom-16 z-20 px-4 lg:bottom-4 lg:start-64">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">
              {t('screening.results.selectedForCompare', { count: selected.length, n: formatNumber(selected.length), max: formatNumber(MAX_COMPARE) })}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selected.length < 1}
                onClick={() =>
                  navigate(
                    paths.quickQuote({
                      hospitals: [...new Set(all.filter((m) => selected.includes(m.id)).map((m) => m.hospital.id))],
                      procedure: activeProcedure ?? undefined,
                      screening: id,
                    }),
                  )
                }
              >
                {t('screening.results.requestQuotes')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={selected.length < 2}
                onClick={() => navigate(paths.screeningCompare(id, selected))}
              >
                {t('screening.results.compare')}
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      <RequestQuoteDialog match={quoteFor} screening={s} onClose={() => setQuoteFor(null)} />
    </div>
  );
}
