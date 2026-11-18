import { ChevronDown } from 'lucide-react';
import { humanize, QUOTE_LINE_CATEGORY_LABELS, type QuoteLineCategory } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { useCostComparison } from '../api/queries';
import { countryName } from '../lib/countries';
import { formatMoneyRange, formatNumber } from '../lib/shared';
import { Card, CardBody, CardHeader, ErrorState, Select, Skeleton } from '../ui/primitives';
import { Money } from './common';

export function CostComparisonPanel({
  procedures,
  procedure,
  onProcedure,
  country,
  currency,
}: {
  procedures: { slug: string; name: string }[];
  procedure: string | null;
  onProcedure: (slug: string) => void;
  country: string | null;
  currency: string;
}) {
  const { t } = useAppTranslation();
  const query = useCostComparison(procedure && country ? { procedure, country, currency } : null);

  return (
    <Card>
      <CardHeader
        title={t('costComparison.title')}
        description={country ? t('costComparison.description', { country: countryName(country), currency }) : t('costComparison.setCountry')}
        action={
          procedures.length > 1 ? (
            <Select
              aria-label={t('costComparison.procedure')}
              value={procedure ?? ''}
              onChange={(e) => onProcedure(e.target.value)}
              className="h-9 w-auto max-w-[16rem]"
            >
              {procedures.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />
      <CardBody>
        {!procedure ? (
          <p className="text-sm text-muted">{t('costComparison.noProcedure')}</p>
        ) : !country ? (
          <p className="text-sm text-muted">{t('costComparison.noCountry')}</p>
        ) : query.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : query.isError ? (
          <ErrorState title={t('costComparison.unavailable')} error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-4">
            <p className="font-medium">{query.data.procedure.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-4">
                <p className="font-semibold">{t('costComparison.treatmentIn', { country: countryName(query.data.home.country_code) })}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{t('costComparison.cost')}</dt>
                    <dd className="font-semibold">
                      {formatMoneyRange(query.data.home.min_minor, query.data.home.max_minor, query.data.home.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('costComparison.waitTime')}</dt>
                    <dd className="font-semibold">{query.data.home.wait_time_text ?? t('costComparison.varies')}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl border-2 border-primary p-4">
                <p className="font-semibold">{t('costComparison.treatmentInIndia')}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{t('costComparison.cost')}</dt>
                    <dd className="font-semibold">
                      {formatMoneyRange(query.data.india.min_minor, query.data.india.max_minor, query.data.india.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('costComparison.waitTime')}</dt>
                    <dd className="font-semibold">{query.data.india.wait_time_text}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('costComparison.savings')}</dt>
                    <dd className="font-semibold text-primary-ink">
                      {t('costComparison.savingsValue', {
                        range: formatMoneyRange(query.data.savings.min_minor, query.data.savings.max_minor, query.data.savings.currency),
                        min: formatNumber(query.data.savings.pct_min),
                        max: formatNumber(query.data.savings.pct_max),
                      })}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            {query.data.itemized.length ? (
              <details className="group rounded-2xl border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium">
                  {t('costComparison.itemized')}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {query.data.itemized.map((item) => (
                    <li key={item.category} className="flex justify-between px-4 py-2.5 text-sm">
                      <span>
                        {QUOTE_LINE_CATEGORY_LABELS[item.category as QuoteLineCategory] ?? humanize(item.category)}
                      </span>
                      <Money minor={item.amount_minor} currency={item.currency} trim />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="text-xs text-muted">{t('costComparison.disclaimer')}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
