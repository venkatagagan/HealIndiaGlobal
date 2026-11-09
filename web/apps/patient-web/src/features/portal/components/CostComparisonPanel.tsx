import { ChevronDown } from 'lucide-react';
import { humanize, QUOTE_LINE_CATEGORY_LABELS, type QuoteLineCategory } from '@hig/shared/api';
import { useCostComparison } from '../api/queries';
import { countryName } from '../lib/countries';
import { formatMoneyRange } from '../lib/shared';
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
  const query = useCostComparison(procedure && country ? { procedure, country, currency } : null);

  return (
    <Card>
      <CardHeader
        title="Treatment cost comparison"
        description={country ? `${countryName(country)} vs India, in ${currency}` : 'Set your home country to compare costs'}
        action={
          procedures.length > 1 ? (
            <Select
              aria-label="Procedure"
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
          <p className="text-sm text-muted">No procedure was suggested yet, so a comparison is not available.</p>
        ) : !country ? (
          <p className="text-sm text-muted">
            Add your country of residence in your profile to see how much you could save.
          </p>
        ) : query.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : query.isError ? (
          <ErrorState title="Comparison unavailable" error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-4">
            <p className="font-medium">{query.data.procedure.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-4">
                <p className="font-semibold">Treatment in {countryName(query.data.home.country_code)}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Cost</dt>
                    <dd className="font-semibold">
                      {formatMoneyRange(query.data.home.min_minor, query.data.home.max_minor, query.data.home.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Wait time</dt>
                    <dd className="font-semibold">{query.data.home.wait_time_text ?? 'Varies'}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl border-2 border-primary p-4">
                <p className="font-semibold">Treatment in India</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Cost</dt>
                    <dd className="font-semibold">
                      {formatMoneyRange(query.data.india.min_minor, query.data.india.max_minor, query.data.india.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Wait time</dt>
                    <dd className="font-semibold">{query.data.india.wait_time_text}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Savings</dt>
                    <dd className="font-semibold text-primary-ink">
                      {formatMoneyRange(query.data.savings.min_minor, query.data.savings.max_minor, query.data.savings.currency)} (
                      {query.data.savings.pct_min}-{query.data.savings.pct_max}%)
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            {query.data.itemized.length ? (
              <details className="group rounded-2xl border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium">
                  Itemized cost breakdown (India)
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
            <p className="text-xs text-muted">
              Indicative ranges based on published benchmarks; your final price comes from the hospital's quote.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
