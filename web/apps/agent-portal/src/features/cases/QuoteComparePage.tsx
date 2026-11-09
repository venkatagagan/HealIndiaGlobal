import { useState, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Award, BedDouble, Check, TrendingDown, X } from 'lucide-react';
import {
  QUOTE_LINE_CATEGORIES,
  QUOTE_LINE_CATEGORY_LABELS,
  casesApi,
  type CaseDetail,
  type QuoteOut,
} from '@hig/shared/api';
import { StatusBadge } from '@hig/shared/ui';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, LoadingBlock, Money, PageHeader } from '../../components/ui';
import { MAX_COMPARE } from '../../lib/constants';
import { qk } from '../../lib/queries';
import { cn, daysUntil, formatDate, useDocumentTitle } from '../../lib/shared';
import { AcceptQuoteDialog, RejectQuoteDialog, isQuoteActionable } from './quotes';

function currentQuote(c: CaseDetail): QuoteOut | null {
  if (c.latest_quote) return c.latest_quote;
  return [...c.quotes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/** index set of the minimum values (ties all win); empty when < 2 values or all equal */
function lowestIndexes(values: (number | null)[]): Set<number> {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return new Set();
  const min = Math.min(...present);
  if (present.every((v) => v === min)) return new Set();
  return new Set(values.flatMap((v, i) => (v === min ? [i] : [])));
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function QuoteComparePage() {
  useDocumentTitle('Compare quotes');
  const [params] = useSearchParams();
  const patientId = params.get('patient');
  const explicitIds = (params.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);
  const [differencesOnly, setDifferencesOnly] = useState(false);

  const byPatient = useQuery({
    queryKey: qk.cases({ patient_id: patientId, page_size: 50 }),
    queryFn: () => casesApi.list({ patient_id: patientId ?? undefined, page_size: 50 }),
    enabled: Boolean(patientId) && explicitIds.length === 0,
  });
  const ids =
    explicitIds.length > 0
      ? explicitIds
      : (byPatient.data?.items ?? [])
          .filter((c) => c.latest_quote && !['cancelled', 'declined'].includes(c.status))
          .slice(0, MAX_COMPARE)
          .map((c) => c.id);

  const details = useQueries({
    queries: ids.map((id) => ({ queryKey: qk.case(id), queryFn: () => casesApi.get(id) })),
  });

  const [accepting, setAccepting] = useState<{ c: CaseDetail; q: QuoteOut } | null>(null);
  const [rejecting, setRejecting] = useState<{ c: CaseDetail; q: QuoteOut } | null>(null);

  const back = (
    <Link to={patientId ? `/patients/${patientId}?tab=cases` : '/cases'} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back
    </Link>
  );

  if (patientId && explicitIds.length === 0 && byPatient.isPending) return <LoadingBlock />;
  if (ids.length === 0) {
    return (
      <div>
        <PageHeader back={back} title="Compare quotes" />
        <Card>
          <EmptyState
            title="Nothing to compare yet"
            description="Select two or three cases with quotes from the Cases page, or wait until hospitals reply to your enquiry."
            action={<ButtonLink to="/cases">Go to cases</ButtonLink>}
          />
        </Card>
      </div>
    );
  }
  if (details.some((d) => d.isPending)) return <LoadingBlock label="Loading quotes…" />;
  const failed = details.find((d) => d.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => details.forEach((d) => void d.refetch())} />;

  const cases = details.map((d) => d.data).filter((c): c is CaseDetail => Boolean(c));
  const quotes = cases.map(currentQuote);
  const currencies = new Set(quotes.filter(Boolean).map((q) => q?.currency));
  const comparable = currencies.size === 1;
  const currency = quotes.find(Boolean)?.currency ?? 'INR';
  const totals = quotes.map((q) => q?.total_minor ?? null);
  const validTotals = totals.filter((t): t is number => t !== null);
  const lowestTotal = comparable && validTotals.length > 1 ? Math.min(...validTotals) : null;
  const highestTotal = comparable && validTotals.length > 1 ? Math.max(...validTotals) : null;
  const bestIndex = lowestTotal !== null ? totals.indexOf(lowestTotal) : -1;
  const best = bestIndex >= 0 ? cases[bestIndex] : null;
  const totalWinners = comparable ? lowestIndexes(totals) : new Set<number>();

  const usedCategories = QUOTE_LINE_CATEGORIES.filter((cat) => quotes.some((q) => q?.line_items.some((li) => li.category === cat)));
  const sumFor = (q: QuoteOut | null, cat: string): number | null => {
    if (!q) return null;
    const items = q.line_items.filter((li) => li.category === cat);
    return items.length ? items.reduce((acc, li) => acc + li.amount_minor, 0) : null;
  };
  const categoryRows = usedCategories
    .map((cat) => ({ cat, values: quotes.map((q) => sumFor(q, cat)) }))
    .filter((r) => !differencesOnly || new Set(r.values.map(String)).size > 1);

  const patientNames = [...new Set(cases.map((c) => c.patient.full_name))];
  const colCount = cases.length + 1;

  const labelCell = (label: ReactNode, sub?: ReactNode) => (
    <th scope="row" className="sticky left-0 z-10 border-r border-border bg-surface py-3 pr-4 pl-5 text-left align-top">
      <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
      {sub && <span className="mt-0.5 block text-xs font-normal text-muted">{sub}</span>}
    </th>
  );
  const row = (label: ReactNode, render: (c: CaseDetail, q: QuoteOut | null, i: number) => ReactNode, opts: { sub?: ReactNode; emphasis?: boolean } = {}) => (
    <tr className={cn(opts.emphasis && 'bg-surface-2/60')}>
      {labelCell(label, opts.sub)}
      {cases.map((c, i) => (
        <td key={c.id} className="px-4 py-3 align-top">
          {render(c, quotes[i] ?? null, i)}
        </td>
      ))}
    </tr>
  );
  const section = (title: string) => (
    <tr className="bg-surface-2">
      <th colSpan={colCount} scope="colgroup" className="py-2 pl-5 text-left text-[11px] font-bold tracking-wider text-muted uppercase">
        {title}
      </th>
    </tr>
  );
  const amountCell = (value: number | null, q: QuoteOut | null, winner: boolean, min: number | null, detail?: ReactNode) => {
    if (!q) return <span className="text-muted">—</span>;
    if (value === null) return <span className="text-xs text-muted italic">Not itemised</span>;
    const diff = comparable && min !== null ? value - min : 0;
    return (
      <div className={cn('-mx-2 rounded-lg px-2 py-1', winner && 'bg-success-soft ring-1 ring-success/30')}>
        <div className="flex items-center justify-between gap-2">
          <Money minor={value} currency={q.currency} className={cn('font-medium tabular-nums', winner && 'text-success-ink')} />
          {winner ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-success-ink">
              <TrendingDown className="h-3 w-3" aria-hidden /> Lowest
            </span>
          ) : diff > 0 ? (
            <span className="text-[11px] text-muted tabular-nums">
              +<Money minor={diff} currency={q.currency} />
            </span>
          ) : null}
        </div>
        {detail}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        back={back}
        title="Compare quotes"
        description={`${patientNames.join(', ')} · ${cases.length} hospital${cases.length === 1 ? '' : 's'} side by side`}
        actions={
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={differencesOnly} onChange={(e) => setDifferencesOnly(e.target.checked)} />
            Show differences only
          </label>
        }
      />

      {!comparable && currencies.size > 1 && (
        <p className="mb-4 rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning-ink">
          These quotes use different currencies, so the lowest prices are not highlighted.
        </p>
      )}

      {best && lowestTotal !== null && highestTotal !== null && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-success/30 bg-success-soft p-4 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-success-ink uppercase">
              <Award className="h-4 w-4" aria-hidden /> Best value
            </p>
            <p className="mt-1 text-lg font-semibold text-fg">
              {best.hospital.name} <span className="font-normal text-muted">· {best.hospital.city}</span>
            </p>
            <p className="mt-0.5 text-sm text-fg">
              <Money minor={lowestTotal} currency={currency} className="font-semibold" />
              {highestTotal > lowestTotal && (
                <>
                  {' '}— saves <Money minor={highestTotal - lowestTotal} currency={currency} className="font-semibold text-success-ink" /> (
                  {pct(highestTotal - lowestTotal, highestTotal)}%) compared with the highest quote
                </>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Price range</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              <Money minor={lowestTotal} currency={currency} /> – <Money minor={highestTotal} currency={currency} />
            </p>
            <p className="mt-0.5 text-sm text-muted">
              Average <Money minor={Math.round(validTotals.reduce((a, b) => a + b, 0) / validTotals.length)} currency={currency} />
            </p>
          </div>
        </div>
      )}

      <Card className="max-h-[calc(100vh-10rem)] overflow-auto p-0">
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm [&>tbody>tr:not(:last-child)>*]:border-b [&>tbody>tr>*]:border-border"
          style={{ minWidth: `${11 + cases.length * 15}rem` }}
        >
          <caption className="sr-only">Quote comparison</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-30 w-44 border-r border-b border-border bg-surface py-4 pr-4 pl-5 text-left align-bottom">
                <span className="text-xs font-semibold text-muted uppercase">Hospital</span>
              </th>
              {cases.map((c, i) => {
                const q = quotes[i] ?? null;
                const winner = totalWinners.has(i);
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className={cn(
                      'sticky top-0 z-20 border-b border-border bg-surface px-4 py-4 text-left align-top font-normal',
                      winner && 'shadow-[inset_0_3px_0_var(--color-success)]',
                    )}
                  >
                    <Link to={`/cases/${c.id}`} className="block text-base leading-tight font-semibold text-fg hover:underline">
                      {c.hospital.name}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted">
                      {c.hospital.city} · <span className="font-mono">{c.case_number}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      {q ? (
                        <Money minor={q.total_minor} currency={q.currency} className={cn('text-lg font-bold tabular-nums', winner && 'text-success-ink')} />
                      ) : (
                        <span className="text-sm text-muted">Awaiting quote</span>
                      )}
                      {winner && (
                        <Badge tone="success">
                          <Award className="h-3 w-3" aria-hidden /> Lowest total
                        </Badge>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {section('Overview')}
            {row('Case status', (c) => <StatusBadge kind="case" status={c.status} />)}
            {row('Quote', (_c, q) => (q ? <StatusBadge kind="quote" status={q.status} /> : <span className="text-muted">Awaiting quote</span>))}
            {row('Doctor', (c) => c.doctor?.full_name ?? <span className="text-muted">—</span>)}
            {row('Procedure', (c) => c.procedure?.name ?? c.specialty?.name ?? <span className="text-muted">—</span>)}
            {!differencesOnly &&
              row('Treatment plan', (_c, q) =>
                q?.treatment_plan ? <p className="line-clamp-6 whitespace-pre-line text-muted">{q.treatment_plan}</p> : <span className="text-muted">—</span>,
              )}

            {section('Cost breakdown')}
            {categoryRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-5 py-3 text-sm text-muted">
                  {differencesOnly ? 'Every itemised category costs the same.' : 'No itemised costs yet.'}
                </td>
              </tr>
            )}
            {categoryRows.map(({ cat, values }) => {
              const winners = comparable ? lowestIndexes(values) : new Set<number>();
              const present = values.filter((v): v is number => v !== null);
              const min = present.length ? Math.min(...present) : null;
              return (
                <tr key={cat}>
                  {labelCell(QUOTE_LINE_CATEGORY_LABELS[cat] ?? cat)}
                  {cases.map((c, i) => {
                    const q = quotes[i] ?? null;
                    const notes = q?.line_items.filter((li) => li.category === cat && li.description).map((li) => li.description) ?? [];
                    return (
                      <td key={c.id} className="px-4 py-2.5 align-top">
                        {amountCell(
                          values[i] ?? null,
                          q,
                          winners.has(i),
                          min,
                          notes.length ? <span className="mt-0.5 block text-xs text-muted">{notes.join(' · ')}</span> : undefined,
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {row(
              'Total',
              (_c, q, i) =>
                q ? (
                  <div className={cn('-mx-2 rounded-lg px-2 py-1', totalWinners.has(i) && 'bg-success-soft ring-1 ring-success/30')}>
                    <Money minor={q.total_minor} currency={q.currency} className={cn('text-lg font-bold tabular-nums', totalWinners.has(i) && 'text-success-ink')} />
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                ),
              { emphasis: true },
            )}
            {lowestTotal !== null &&
              highestTotal !== null &&
              row(
                'Savings',
                (_c, q) => {
                  if (!q) return <span className="text-muted">—</span>;
                  if (q.total_minor === lowestTotal) {
                    return highestTotal > lowestTotal ? (
                      <span className="text-sm font-medium text-success-ink">
                        Saves <Money minor={highestTotal - lowestTotal} currency={q.currency} /> ({pct(highestTotal - lowestTotal, highestTotal)}%) vs highest
                      </span>
                    ) : (
                      <span className="text-sm text-muted">Same as the others</span>
                    );
                  }
                  const extra = q.total_minor - lowestTotal;
                  return (
                    <span className="text-sm text-muted">
                      <Money minor={extra} currency={q.currency} className="font-medium text-fg" /> more (+{pct(extra, lowestTotal)}%) than the lowest
                    </span>
                  );
                },
                { sub: 'vs the other quotes' },
              )}

            {section('Stay & validity')}
            {row('Hospital stay', (_c, q) =>
              q?.estimated_stay_days ? (
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble className="h-4 w-4 text-muted" aria-hidden /> {q.estimated_stay_days} days
                  {q.total_minor && q.estimated_stay_days ? (
                    <span className="text-xs text-muted">
                      · <Money minor={Math.round(q.total_minor / q.estimated_stay_days)} currency={q.currency} />/day
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted">—</span>
              ),
            )}
            {row('Valid until', (_c, q) => {
              if (!q?.valid_until) return <span className="text-muted">—</span>;
              const left = daysUntil(q.valid_until);
              return (
                <span className={cn(left !== null && left < 0 ? 'text-danger' : left !== null && left <= 3 ? 'text-warning-ink' : undefined)}>
                  {formatDate(q.valid_until)}
                  {left !== null && <span className="ml-1 text-xs text-muted">{left < 0 ? '(expired)' : `(${left} day${left === 1 ? '' : 's'} left)`}</span>}
                </span>
              );
            })}

            {section('Decision')}
            {row('', (c, q) =>
              q && isQuoteActionable(c.status, q) ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={<Check className="h-4 w-4" aria-hidden />} onClick={() => setAccepting({ c, q })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" icon={<X className="h-4 w-4" aria-hidden />} onClick={() => setRejecting({ c, q })}>
                    Decline
                  </Button>
                </div>
              ) : c.status === 'accepted' && !c.booking ? (
                <ButtonLink size="sm" to={`/cases/${c.id}/book`}>
                  Book treatment
                </ButtonLink>
              ) : (
                <ButtonLink size="sm" variant="ghost" to={`/cases/${c.id}`}>
                  Open case
                </ButtonLink>
              ),
            )}
          </tbody>
        </table>
      </Card>

      {accepting && (
        <AcceptQuoteDialog open onClose={() => setAccepting(null)} caseItem={accepting.c} quote={accepting.q} siblings={cases} />
      )}
      <RejectQuoteDialog open={rejecting !== null} onClose={() => setRejecting(null)} caseId={rejecting?.c.id ?? ''} quote={rejecting?.q ?? null} />
    </div>
  );
}
