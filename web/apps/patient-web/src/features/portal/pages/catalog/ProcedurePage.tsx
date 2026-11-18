/**
 * Procedure page: India price range, home vs India (display rule), hospitals ordered by earliest admission
 * (GET /procedures/{slug}/earliest) and "Request quotes" for up to 3 of them.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BedDouble, CalendarClock, CheckSquare, HeartPulse, MapPin, Square } from 'lucide-react';
import { useAppTranslation } from '../../../../i18n';
import { useProcedure, useProcedureCost, useProcedureEarliest } from '../../api/phase1';
import { canShowSaving } from '../../components/CostHighlights';
import { Avatar, BackLink, Rating } from '../../components/common';
import { ApproxRange, EarliestChips, useEarliestLabel, VerifiedAccreditations } from '../../components/phase1';
import { countryName } from '../../lib/countries';
import { paths } from '../../lib/paths';
import { cn, formatMoneyRange, formatNumber, useDocumentTitle } from '../../lib/shared';
import { useHomeCountryPref, useViewerCurrency } from '../../lib/viewer';
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValue,
  PageHeader,
  Skeleton,
  SkeletonList,
} from '../../ui/primitives';

export const MAX_QUOTE_HOSPITALS = 3;

function HomeVsIndia({ slug }: { slug: string }) {
  const { t } = useAppTranslation();
  const [country] = useHomeCountryPref();
  const currency = useViewerCurrency();
  const earliest = useEarliestLabel();
  const cost = useProcedureCost(slug, country, currency);
  if (cost.isPending) return <Skeleton className="h-32 rounded-2xl" />;
  if (cost.isError || !cost.data) return null;
  const c = cost.data;
  const name = countryName(c.country_used ?? c.home.country_code);
  const showSaving = canShowSaving(c);
  const homeWait = (c.home.wait_time_text ?? '').trim();
  return (
    <Card>
      <CardHeader
        title={t('procedure.homeVsIndia')}
        description={c.is_fallback ? t('costHome.fallback', { country: name }) : t('costHome.pricesFor', { country: name })}
      />
      <CardBody className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold">{t('costHome.inCountry', { country: name })}</p>
          {showSaving ? (
            <p className="mt-2 text-lg font-bold text-muted tabular-nums">
              {formatMoneyRange(c.home.min_minor, c.home.max_minor, c.home.currency)}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted">
            {homeWait ? t('costHome.waitAtHome', { wait: homeWait }) : t('costHome.oftenUnavailable')}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-primary p-4">
          <p className="text-sm font-semibold">{t('costHome.inIndia')}</p>
          {showSaving ? (
            <p className="mt-2 text-lg font-bold text-primary-ink tabular-nums">
              {formatMoneyRange(c.india.min_minor, c.india.max_minor, c.india.currency)}
            </p>
          ) : null}
          <p className="mt-1 text-sm font-medium text-success-ink">
            {c.india.earliest_admission_date
              ? t('costHome.indiaEarliest', { date: earliest(c.india.earliest_admission_date) })
              : t('costHome.indiaWait', { wait: c.india.wait_time_text })}
          </p>
          {showSaving ? (
            <p className="mt-2 text-sm font-semibold text-success-ink">
              {t('costHome.save', {
                pct:
                  c.savings.pct_min === c.savings.pct_max
                    ? `${formatNumber(c.savings.pct_max)}%`
                    : `${formatNumber(c.savings.pct_min)}–${formatNumber(c.savings.pct_max)}%`,
              })}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted sm:col-span-2">{t('costHome.source.disclaimer')}</p>
      </CardBody>
    </Card>
  );
}

export function ProcedurePage() {
  const { slug = '' } = useParams();
  const { t } = useAppTranslation();
  const currency = useViewerCurrency();
  const procedure = useProcedure(slug, currency);
  const earliest = useProcedureEarliest(slug, currency);
  const [selected, setSelected] = useState<string[]>([]);
  useDocumentTitle(procedure.data?.name ?? t('procedure.title'));

  if (procedure.isError) return <ErrorState error={procedure.error} onRetry={() => void procedure.refetch()} />;
  const p = procedure.data;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_QUOTE_HOSPITALS ? prev : [...prev, id],
    );

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        back={<BackLink to={paths.dashboard}>{t('procedure.back')}</BackLink>}
        title={p ? p.name : <Skeleton className="h-8 w-64" />}
        description={p?.specialty.name}
        actions={
          <ButtonLink to={paths.browse({ tab: 'hospitals', procedure: slug })} variant="outline">
            {t('procedure.browseHospitals')}
          </ButtonLink>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t('procedure.priceInIndia')} />
          <CardBody className="space-y-4">
            {p ? (
              <>
                <p className="text-2xl font-bold text-fg">
                  {p.india_price_min_minor != null || p.india_price_max_minor != null ? (
                    <ApproxRange
                      min={p.india_price_min_minor}
                      max={p.india_price_max_minor}
                      currency={p.currency}
                      displayMin={p.display_india_price_min}
                      displayMax={p.display_india_price_max}
                    />
                  ) : (
                    t('procedure.priceOnRequest')
                  )}
                </p>
                <dl className="grid grid-cols-2 gap-3">
                  {p.hospital_stay_days != null ? (
                    <KeyValue label={t('procedure.hospitalStay')}>
                      <span className="inline-flex items-center gap-1">
                        <BedDouble className="size-4 text-muted" aria-hidden />
                        {t('procedure.days', { count: p.hospital_stay_days, days: formatNumber(p.hospital_stay_days) })}
                      </span>
                    </KeyValue>
                  ) : null}
                  {p.total_stay_days != null ? (
                    <KeyValue label={t('procedure.totalStay')}>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-4 text-muted" aria-hidden />
                        {t('procedure.days', { count: p.total_stay_days, days: formatNumber(p.total_stay_days) })}
                      </span>
                    </KeyValue>
                  ) : null}
                </dl>
                {p.description ? <p className="text-sm text-muted">{p.description}</p> : null}
                <p className="text-xs text-muted">{t('procedure.priceNote')}</p>
              </>
            ) : (
              <Skeleton className="h-24" />
            )}
          </CardBody>
        </Card>
        <div className="lg:col-span-2">
          <HomeVsIndia slug={slug} />
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-fg">{t('procedure.earliestTitle')}</h2>
          <p className="text-sm text-muted">{t('procedure.earliestIntro', { max: MAX_QUOTE_HOSPITALS })}</p>
        </div>
        {earliest.isPending ? (
          <SkeletonList rows={3} />
        ) : earliest.isError ? (
          <ErrorState error={earliest.error} onRetry={() => void earliest.refetch()} />
        ) : earliest.data.items.length === 0 ? (
          <EmptyState
            icon={<HeartPulse className="size-6" aria-hidden />}
            title={t('procedure.emptyTitle')}
            description={t('procedure.emptyMessage')}
            action={<ButtonLink to={paths.messages}>{t('procedure.askCoordinator')}</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {earliest.data.items.map((row) => {
              const h = row.hospital;
              const isSelected = selected.includes(h.id);
              const disabled = !isSelected && selected.length >= MAX_QUOTE_HOSPITALS;
              return (
                <li key={row.hospital_procedure_id}>
                  <Card className={cn('flex h-full flex-col p-4 transition', isSelected && 'ring-2 ring-primary')}>
                    <div className="flex gap-3">
                      <Avatar name={h.name} src={h.logo_url} size={48} />
                      <div className="min-w-0 flex-1">
                        <Link to={paths.hospital(h.slug)} className="font-semibold text-fg hover:underline">
                          {h.name}
                        </Link>
                        <p className="flex items-center gap-1 text-sm text-muted">
                          <MapPin className="size-3.5" aria-hidden />
                          {[h.city, h.state].filter(Boolean).join(', ')}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <VerifiedAccreditations items={h.accreditations_verified} />
                          <Rating value={h.rating_avg} count={h.rating_count} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted">{t('procedure.hospitalPrice')}</p>
                        <p className="font-bold text-fg">
                          {row.price_min_minor != null || row.price_max_minor != null ? (
                            <ApproxRange
                              min={row.price_min_minor}
                              max={row.price_max_minor}
                              currency={row.currency}
                              displayMin={row.display_price_min}
                              displayMax={row.display_price_max}
                            />
                          ) : (
                            t('procedure.priceOnRequest')
                          )}
                        </p>
                      </div>
                      {row.next_available_admission || row.next_available_consultation ? (
                        <EarliestChips consultation={row.next_available_consultation} admission={row.next_available_admission} />
                      ) : (
                        <span className="text-xs text-muted">{t('procedure.datesOnRequest')}</span>
                      )}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => toggle(h.id)}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50',
                          isSelected ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border-strong text-fg hover:bg-surface-2',
                        )}
                      >
                        {isSelected ? <CheckSquare className="size-4" aria-hidden /> : <Square className="size-4" aria-hidden />}
                        {t('procedure.addToQuote')}
                      </button>
                      <ButtonLink to={paths.quickQuote({ hospitals: [h.id], procedure: slug })} size="sm" variant="outline">
                        {t('procedure.requestQuote')}
                      </ButtonLink>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        {selected.length >= MAX_QUOTE_HOSPITALS ? <Alert tone="blue">{t('quickQuote.maxHospitals', { max: MAX_QUOTE_HOSPITALS })}</Alert> : null}
      </section>

      {selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-20 px-4 lg:bottom-4 lg:start-64">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-sm font-medium">
              {t('procedure.selected', { count: selected.length, max: MAX_QUOTE_HOSPITALS })}
            </span>
            <ButtonLink to={paths.quickQuote({ hospitals: selected, procedure: slug })} size="sm">
              {t('quickQuote.requestFrom', { count: selected.length })}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
