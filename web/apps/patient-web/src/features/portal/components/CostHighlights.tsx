/**
 * Dashboard "Your country vs India" (GET /cost-comparison/highlights), mirroring the mobile home block.
 *
 * Legal display rule: a price comparison / saving is shown only when the home benchmark's confidence is medium
 * or high AND India is cheaper at both ends of the range ({@link canShowSaving}); otherwise the card leads with
 * the wait time at home and the earliest date in India and makes no saving claim.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarCheck2, ExternalLink, Globe2, Hourglass, Info } from 'lucide-react';
import type { CostHighlights as CostHighlightsData } from '@hig/shared/api';
import { Popover, usePopover } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { useCostHighlights } from '../api/phase1';
import { countryName, countryOptions } from '../lib/countries';
import { paths } from '../lib/paths';
import { cn, formatMoneyRange, formatNumber } from '../lib/shared';
import { useHomeCountryPref, useViewerCurrency } from '../lib/viewer';
import { Badge, Button, Card, CardBody, CardHeader, ErrorState, Select, Skeleton } from '../ui/primitives';
import { useEarliestLabel } from './phase1';

type Item = CostHighlightsData['items'][number];
type Home = Item['home'];

const COLLAPSED = 3;

/** Saving / price comparison only with a medium/high confidence benchmark and India cheaper at both ends. */
export function canShowSaving(item: Pick<Item, 'home' | 'india' | 'savings'>): boolean {
  const c = item.home.confidence;
  if (c !== 'high' && c !== 'medium') return false;
  return (
    item.savings.pct_min > 0 &&
    item.india.min_minor < item.home.min_minor &&
    item.india.max_minor < item.home.max_minor
  );
}

function pctText(item: Item): string {
  const { pct_min, pct_max } = item.savings;
  return pct_min === pct_max ? `${formatNumber(pct_max)}%` : `${formatNumber(pct_min)}–${formatNumber(pct_max)}%`;
}

function sourceShort(home: Home): string {
  let base = (home.source ?? '').trim();
  if (!base && home.source_url) {
    try {
      base = new URL(home.source_url).host;
    } catch {
      base = '';
    }
  }
  return home.price_year ? `${base} ${home.price_year}`.trim() : base;
}

function hasSource(home: Home): boolean {
  return !!(home.source?.trim() || home.source_url?.trim());
}

function SourcePopover({ home, country }: { home: Home; country: string }) {
  const { t } = useAppTranslation();
  const pop = usePopover();
  const url = (() => {
    try {
      const u = new URL(home.source_url ?? '');
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
    } catch {
      return null;
    }
  })();
  const confidence = home.confidence ? t(`costHome.confidence.${home.confidence}`, { defaultValue: home.confidence }) : null;
  const short = sourceShort(home);
  return (
    <>
      <button
        type="button"
        {...pop.triggerProps}
        className="relative z-10 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <Info className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{short ? t('costHome.estimateSource', { source: short }) : t('costHome.estimate')}</span>
      </button>
      <Popover {...pop.popoverProps} label={t('costHome.source.title')} className="w-80 max-w-[calc(100vw-2rem)] p-4">
        <p className="text-sm font-semibold text-fg">{t('costHome.source.title')}</p>
        <p className="mt-1 text-sm text-muted">{t('costHome.source.intro', { country })}</p>
        <dl className="mt-3 space-y-2 text-sm">
          {home.source ? (
            <div>
              <dt className="text-xs text-muted">{t('costHome.source.label')}</dt>
              <dd className="text-fg">{home.source}</dd>
            </div>
          ) : null}
          {home.price_year ? (
            <div>
              <dt className="text-xs text-muted">{t('costHome.source.year')}</dt>
              <dd className="text-fg">{home.price_year}</dd>
            </div>
          ) : null}
          {confidence ? (
            <div>
              <dt className="text-xs text-muted">{t('costHome.source.confidence')}</dt>
              <dd className="text-fg">{confidence}</dd>
            </div>
          ) : null}
          {home.wait_source ? (
            <div>
              <dt className="text-xs text-muted">{t('costHome.source.wait')}</dt>
              <dd className="text-fg">{home.wait_source}</dd>
            </div>
          ) : null}
        </dl>
        {!hasSource(home) ? <p className="mt-2 text-xs text-muted">{t('costHome.source.none')}</p> : null}
        <p className="mt-3 text-xs text-muted">{t('costHome.source.disclaimer')}</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t('costHome.source.open')}
          </a>
        ) : null}
      </Popover>
    </>
  );
}

function HighlightCard({ item, country }: { item: Item; country: string }) {
  const { t } = useAppTranslation();
  const earliest = useEarliestLabel();
  const showSaving = canShowSaving(item);
  const homeWait = (item.home.wait_time_text ?? '').trim();
  const indiaWhen = item.india.earliest_admission_date
    ? t('costHome.indiaEarliest', { date: earliest(item.india.earliest_admission_date) })
    : item.india.wait_time_text
      ? t('costHome.indiaWait', { wait: item.india.wait_time_text })
      : null;

  return (
    <li className="relative flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised focus-within:ring-2 focus-within:ring-ring">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-fg">
            <Link
              to={paths.procedure(item.procedure.slug)}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {item.procedure.name}
            </Link>
          </h3>
          <p className="text-xs text-muted">{item.specialty.name}</p>
        </div>
        {showSaving ? (
          <Badge tone="green" className="shrink-0 text-sm font-semibold">
            {t('costHome.save', { pct: pctText(item) })}
          </Badge>
        ) : null}
      </div>

      {showSaving ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{t('costHome.inCountry', { country })}</p>
            <p className="truncate text-base font-bold text-muted tabular-nums">
              {formatMoneyRange(item.home.min_minor, item.home.max_minor, item.home.currency)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted">{t('costHome.inIndia')}</p>
            <p className="truncate text-base font-bold text-primary-ink tabular-nums">
              {formatMoneyRange(item.india.min_minor, item.india.max_minor, item.india.currency)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-fg">
          {homeWait ? t('costHome.waitAtHome', { wait: homeWait }) : t('costHome.oftenUnavailable')}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {showSaving && homeWait ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Hourglass className="size-3.5" aria-hidden />
            {t('costHome.waitAtHome', { wait: homeWait })}
          </span>
        ) : null}
        {indiaWhen ? (
          <span className="inline-flex items-center gap-1 font-medium text-success-ink">
            <CalendarCheck2 className="size-3.5" aria-hidden />
            {indiaWhen}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="min-w-0">
          <SourcePopover home={item.home} country={country} />
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-ink" aria-hidden>
          {t('costHome.seeHospitals')}
          <ArrowRight className="size-4 rtl:-scale-x-100" />
        </span>
      </div>
    </li>
  );
}

export function CostHighlightsBlock({ className }: { className?: string }) {
  const { t } = useAppTranslation();
  const [country, setCountry] = useHomeCountryPref();
  const currency = useViewerCurrency();
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const query = useCostHighlights({ country: country ?? undefined, currency, limit: 9 });
  const data = query.data;
  const shown = data?.country_used ?? country ?? 'US';
  const shownName = countryName(shown);
  const items = data ? (expanded ? data.items : data.items.slice(0, COLLAPSED)) : [];

  return (
    <Card className={className}>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Globe2 className="size-5 text-primary-ink" aria-hidden />
            {t('costHome.title')}
          </span>
        }
        description={
          data ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn(data.is_fallback && 'font-medium text-warning-ink')}>
                {data.is_fallback ? t('costHome.fallback', { country: shownName }) : t('costHome.pricesFor', { country: shownName })}
              </span>
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                aria-expanded={picking}
                className="font-semibold text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {t('costHome.change')}
              </button>
            </span>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {picking ? (
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-3">
            <label className="min-w-0 flex-1 space-y-1 text-sm">
              <span className="block font-medium text-fg">{t('costHome.pickerTitle')}</span>
              <Select
                value={country ?? ''}
                onChange={(e) => {
                  setCountry(e.target.value || null);
                  setPicking(false);
                }}
              >
                <option value="">{t('costHome.detect')}</option>
                {countryOptions()
                  .filter((o) => o.value !== 'IN')
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </Select>
            </label>
            <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
              {t('costHome.close')}
            </Button>
          </div>
        ) : null}

        {query.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : query.isError ? (
          <ErrorState title={t('costHome.unavailable')} error={query.error} onRetry={() => void query.refetch()} />
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted">{t('costHome.empty')}</p>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <HighlightCard key={item.procedure.id} item={item} country={shownName} />
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">{t('costHome.disclaimer')}</p>
              {data.items.length > COLLAPSED ? (
                <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                  {expanded ? t('costHome.showLess') : t('costHome.showMore', { count: data.items.length - COLLAPSED })}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
