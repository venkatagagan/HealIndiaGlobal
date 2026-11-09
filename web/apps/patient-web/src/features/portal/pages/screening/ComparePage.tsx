import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { BadgeCheck, Check, Minus, Trophy } from 'lucide-react';
import { PACKAGE_TIER_LABELS, type MatchOut } from '@hig/shared/api';
import { Switch } from '@hig/shared/ui';
import { useMatches, useScreening } from '../../api/queries';
import { Accreditations, Avatar, BackLink, Money, Rating } from '../../components/common';
import { paths } from '../../lib/paths';
import { cn, formatMoney, formatMoneyRange, useDocumentTitle } from '../../lib/shared';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SkeletonList } from '../../ui/primitives';
import { RequestQuoteDialog } from './RequestQuoteDialog';

type Best = 'min' | 'max';
interface Row {
  label: string;
  hint?: string;
  render: (m: MatchOut) => ReactNode;
  /** comparable value: highlights the best column and powers "only show differences" */
  value?: (m: MatchOut) => number | string | boolean | null | undefined;
  best?: Best;
}
interface Group {
  title: string;
  rows: Row[];
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));
const yesNo = (v: boolean | number | null | undefined, unit?: string) =>
  v === null || v === undefined || v === false || v === 0 ? (
    <span className="inline-flex items-center gap-1 text-muted">
      <Minus className="size-4" aria-hidden /> Not included
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-success-ink">
      <Check className="size-4" aria-hidden /> {typeof v === 'number' && unit ? `${v} ${unit}` : 'Included'}
    </span>
  );
const dash = <span className="text-muted">—</span>;

/** Mid-point estimate of what the patient saves vs the home-country price. */
function savingMinor(m: MatchOut): number | null {
  if (!m.savings || m.estimated_cost_minor == null || m.savings.home_currency !== m.currency) return null;
  const home = (m.savings.home_min_minor + m.savings.home_max_minor) / 2;
  return Math.max(0, Math.round(home - m.estimated_cost_minor));
}

const GROUPS: Group[] = [
  {
    title: 'Cost',
    rows: [
      {
        label: 'Estimated total',
        hint: 'Treatment package; final price comes with the hospital quote',
        value: (m) => num(m.estimated_cost_minor),
        best: 'min',
        render: (m) =>
          m.estimated_cost_minor != null ? (
            <span className="text-lg font-bold tabular-nums">
              <Money minor={m.estimated_cost_minor} currency={m.currency} trim />
            </span>
          ) : (
            <span className="text-muted">On request</span>
          ),
      },
      {
        label: 'Same treatment at home',
        value: (m) => (m.savings ? (m.savings.home_min_minor + m.savings.home_max_minor) / 2 : null),
        render: (m) =>
          m.savings ? (
            <span className="tabular-nums">
              {formatMoneyRange(m.savings.home_min_minor, m.savings.home_max_minor, m.savings.home_currency)}
              <span className="block text-xs text-muted">in {m.savings.home_country}</span>
            </span>
          ) : (
            dash
          ),
      },
      {
        label: 'You save',
        value: (m) => savingMinor(m) ?? (m.savings ? m.savings.pct_max : null),
        best: 'max',
        render: (m) => {
          const saved = savingMinor(m);
          return m.savings ? (
            <span className="font-semibold text-success-ink">
              {m.savings.pct_min}–{m.savings.pct_max}%
              {saved ? <span className="block text-xs font-normal text-muted">about {formatMoney(saved, m.currency, undefined, { trimZeros: true })}</span> : null}
            </span>
          ) : (
            dash
          );
        },
      },
      {
        label: 'Package',
        value: (m) => m.package?.name ?? null,
        render: (m) =>
          m.package ? (
            <span>
              {m.package.name}
              {(PACKAGE_TIER_LABELS[m.package.tier] ?? m.package.tier).toLowerCase() !== m.package.name.toLowerCase() ? (
                <span className="block text-xs text-muted">{PACKAGE_TIER_LABELS[m.package.tier] ?? m.package.tier}</span>
              ) : null}
            </span>
          ) : (
            dash
          ),
      },
      { label: 'Hotel nights', value: (m) => m.package?.includes.accommodation_nights ?? 0, best: 'max', render: (m) => yesNo(m.package?.includes.accommodation_nights, 'nights') },
      { label: 'Airport pickup', value: (m) => !!m.package?.includes.airport_pickup, render: (m) => yesNo(m.package?.includes.airport_pickup) },
      { label: 'Translator', value: (m) => !!m.package?.includes.translator, render: (m) => yesNo(m.package?.includes.translator) },
      { label: 'Meals', value: (m) => !!m.package?.includes.meals, render: (m) => yesNo(m.package?.includes.meals) },
      { label: 'Local transport', value: (m) => !!m.package?.includes.local_transport, render: (m) => yesNo(m.package?.includes.local_transport) },
      {
        label: 'Follow-up video calls',
        value: (m) => m.package?.includes.followup_teleconsults ?? 0,
        best: 'max',
        render: (m) => yesNo(m.package?.includes.followup_teleconsults, 'calls'),
      },
    ],
  },
  {
    title: 'Doctor',
    rows: [
      { label: 'Specialty', value: (m) => m.doctor?.specialty.name ?? null, render: (m) => m.doctor?.specialty.name ?? dash },
      {
        label: 'Experience',
        value: (m) => num(m.doctor?.experience_years),
        best: 'max',
        render: (m) => (m.doctor?.experience_years ? `${m.doctor.experience_years} years` : dash),
      },
      {
        label: 'Success rate',
        value: (m) => num(m.doctor?.success_rate_pct),
        best: 'max',
        render: (m) => (m.doctor?.success_rate_pct != null ? `${Number(m.doctor.success_rate_pct).toFixed(0)}%` : dash),
      },
      {
        label: 'Patient rating',
        value: (m) => num(m.doctor?.rating_avg ?? m.hospital.rating_avg),
        best: 'max',
        render: (m) => <Rating value={m.doctor?.rating_avg ?? m.hospital.rating_avg} count={m.doctor?.rating_count ?? m.hospital.rating_count} />,
      },
      {
        label: 'Languages',
        value: (m) => (m.doctor?.languages.length ? m.doctor.languages : m.hospital.languages).join(', '),
        render: (m) => (m.doctor?.languages.length ? m.doctor.languages : m.hospital.languages).join(', ') || dash,
      },
      {
        label: 'Video consultation',
        value: (m) => !!m.doctor?.teleconsult_available,
        render: (m) => (m.doctor ? yesNo(m.doctor.teleconsult_available) : dash),
      },
      {
        label: 'Consultation fee',
        value: (m) => num(m.doctor?.consultation_fee_minor),
        best: 'min',
        render: (m) => (m.doctor?.consultation_fee_minor != null ? <Money minor={m.doctor.consultation_fee_minor} currency={m.doctor.currency} trim /> : dash),
      },
    ],
  },
  {
    title: 'Hospital',
    rows: [
      {
        label: 'Hospital',
        value: (m) => m.hospital.name,
        render: (m) => (
          <span>
            <span className="font-medium">{m.hospital.name}</span>
            <span className="block text-xs text-muted">
              {m.hospital.city}
              {m.hospital.state ? `, ${m.hospital.state}` : ''}
            </span>
          </span>
        ),
      },
      {
        label: 'Accreditation',
        value: (m) => m.hospital.accreditations.join(','),
        render: (m) => (m.hospital.accreditations.length ? <Accreditations values={m.hospital.accreditations} /> : dash),
      },
      { label: 'International patient desk', value: (m) => m.hospital.international_desk, render: (m) => yesNo(m.hospital.international_desk) },
    ],
  },
];

/** Index of the best column for a row (only when the values differ). */
function bestIndex(row: Row, matches: MatchOut[]): number[] {
  if (!row.best || !row.value) return [];
  const values = matches.map((m) => row.value!(m));
  const nums = values.map((v) => (typeof v === 'number' ? v : null));
  const present = nums.filter((v): v is number => v !== null);
  if (present.length < 2 || new Set(present).size < 2) return [];
  const target = row.best === 'min' ? Math.min(...present) : Math.max(...present);
  return nums.flatMap((v, i) => (v === target ? [i] : []));
}

function differs(row: Row, matches: MatchOut[]): boolean {
  if (!row.value) return true;
  return new Set(matches.map((m) => JSON.stringify(row.value!(m) ?? null))).size > 1;
}

export function ComparePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  useDocumentTitle('Compare matches');
  const ids = useMemo(() => (params.get('m') ?? '').split(',').filter(Boolean).slice(0, 3), [params]);
  const screening = useScreening(id);
  const matches = useMatches(id, screening.data?.status === 'completed');
  const [quoteFor, setQuoteFor] = useState<MatchOut | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);

  if (screening.data && screening.data.status !== 'completed') return <Navigate to={paths.screeningProcessing(id)} replace />;
  if (screening.isError || matches.isError) {
    return <ErrorState error={screening.error ?? matches.error} onRetry={() => void matches.refetch()} />;
  }
  if (!screening.data || matches.isPending) return <SkeletonList rows={4} />;

  const chosen = ids.map((mid) => matches.data?.find((m) => m.id === mid)).filter((m): m is MatchOut => !!m);
  const emergency = (screening.data.urgency ?? screening.data.ai_result?.urgency) === 'emergency';

  const priced = chosen.filter((m) => m.estimated_cost_minor != null);
  const sameCurrency = priced.length > 1 && new Set(priced.map((m) => m.currency)).size === 1;
  const cheapest = sameCurrency ? priced.reduce((a, b) => (b.estimated_cost_minor! < a.estimated_cost_minor! ? b : a)) : null;
  const priciest = sameCurrency ? priced.reduce((a, b) => (b.estimated_cost_minor! > a.estimated_cost_minor! ? b : a)) : null;
  const spread = cheapest && priciest ? priciest.estimated_cost_minor! - cheapest.estimated_cost_minor! : 0;
  const topScore = Math.max(...chosen.map((m) => Number(m.match_score)));
  const nameOf = (m: MatchOut) => m.doctor?.full_name ?? m.hospital.name;

  const groups = GROUPS.map((g) => ({ ...g, rows: onlyDiff ? g.rows.filter((r) => differs(r, chosen)) : g.rows })).filter((g) => g.rows.length);
  const colWidth = chosen.length === 3 ? 'w-[26%]' : 'w-[38%]';

  return (
    <div>
      <PageHeader
        back={<BackLink to={paths.screeningResults(id)}>Back to matches</BackLink>}
        title="Compare your matches"
        description="Side by side: price, what is included, the doctor and the hospital. The best value in each row is highlighted."
      />
      {chosen.length < 2 ? (
        <EmptyState
          title="Select at least two matches to compare"
          action={
            <Button variant="outline" onClick={() => history.back()}>
              Go back
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {cheapest && spread > 0 ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-sm text-success-ink">
                <Trophy className="size-4" aria-hidden />
                <span>
                  <strong>{nameOf(cheapest)}</strong> is the lowest estimate - {formatMoney(spread, cheapest.currency, undefined, { trimZeros: true })} less
                  than the highest.
                </span>
              </p>
            ) : (
              <span />
            )}
            <Switch checked={onlyDiff} onChange={setOnlyDiff} label="Only show differences" />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className={cn('w-full table-fixed border-collapse text-sm', chosen.length === 3 ? 'min-w-[640px]' : 'min-w-[460px]')}>
                <caption className="sr-only">Comparison of selected matches</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="sticky start-0 z-10 w-28 bg-surface p-3 text-start align-bottom sm:w-52 sm:p-4">
                      <span className="text-xs font-semibold tracking-wide text-muted uppercase">{chosen.length} options</span>
                    </th>
                    {chosen.map((m) => {
                      const isCheapest = cheapest?.id === m.id && spread > 0;
                      return (
                        <th key={m.id} scope="col" className={cn(colWidth, 'p-4 text-start align-top font-normal', isCheapest && 'bg-success-soft/40')}>
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {isCheapest ? (
                                <Badge tone="green">
                                  <Trophy className="h-3 w-3" aria-hidden /> Lowest price
                                </Badge>
                              ) : null}
                              {Number(m.match_score) === topScore ? (
                                <Badge tone="violet">
                                  <BadgeCheck className="h-3 w-3" aria-hidden /> Best match
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                              <Avatar name={nameOf(m)} src={m.doctor?.photo_url ?? m.hospital.logo_url} size={44} />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-fg">{nameOf(m)}</p>
                                <p className="truncate text-xs text-muted">{m.doctor ? m.hospital.name : m.hospital.city}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(Number(m.match_score))}%` }} />
                              </span>
                              <span className="font-semibold text-fg tabular-nums">{Math.round(Number(m.match_score))}% match</span>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.title}>
                      <tr className="border-b border-border bg-surface-2/60">
                        <th scope="colgroup" colSpan={chosen.length + 1} className="px-4 py-2 text-start text-xs font-semibold tracking-wide text-muted uppercase">
                          {g.title}
                        </th>
                      </tr>
                      {g.rows.map((row) => {
                        const best = bestIndex(row, chosen);
                        return (
                          <tr key={row.label} className="border-b border-border last:border-0">
                            <th scope="row" className="sticky start-0 z-10 bg-surface px-3 py-3 text-start align-top font-medium text-fg sm:px-4">
                              {row.label}
                              {row.hint ? <span className="mt-0.5 hidden text-xs font-normal text-muted sm:block">{row.hint}</span> : null}
                            </th>
                            {chosen.map((m, i) => (
                              <td
                                key={m.id}
                                className={cn(
                                  'px-4 py-3 align-top',
                                  cheapest?.id === m.id && spread > 0 && 'bg-success-soft/25',
                                  best.includes(i) && 'font-semibold',
                                )}
                              >
                                <span className="inline-flex flex-wrap items-center gap-1.5">
                                  {row.render(m)}
                                  {best.includes(i) ? (
                                    <span className="rounded-full bg-success-soft px-1.5 text-[11px] leading-5 font-semibold text-success-ink">Best</span>
                                  ) : null}
                                </span>
                                {row.label === 'Estimated total' && cheapest && cheapest.id !== m.id && m.estimated_cost_minor != null && m.currency === cheapest.currency ? (
                                  <span className="block text-xs font-normal text-muted">
                                    +{formatMoney(m.estimated_cost_minor - cheapest.estimated_cost_minor!, m.currency, undefined, { trimZeros: true })} vs lowest
                                  </span>
                                ) : null}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                  {!onlyDiff ? (
                    <>
                      <tr className="border-b border-border bg-surface-2/60">
                        <th scope="colgroup" colSpan={chosen.length + 1} className="px-4 py-2 text-start text-xs font-semibold tracking-wide text-muted uppercase">
                          Why it matches you
                        </th>
                      </tr>
                      <tr className="border-b border-border">
                        <th scope="row" className="sticky start-0 z-10 bg-surface px-4 py-3 text-start align-top font-medium">
                          Reasons
                        </th>
                        {chosen.map((m) => (
                          <td key={m.id} className="px-4 py-3 align-top">
                            <ul className="space-y-1">
                              {m.reasons.map((r) => (
                                <li key={r} className="flex gap-1.5 text-sm">
                                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </td>
                        ))}
                      </tr>
                    </>
                  ) : null}
                </tbody>
                {!emergency ? (
                  <tfoot>
                    <tr className="bg-surface-2/40">
                      <td className="sticky start-0 z-10 bg-surface px-4 py-4 text-xs text-muted">Free, no obligation</td>
                      {chosen.map((m) => (
                        <td key={m.id} className="px-4 py-4">
                          <Button variant="danger" size="sm" onClick={() => setQuoteFor(m)} className="w-full sm:w-auto">
                            Request quote
                          </Button>
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </>
      )}
      <RequestQuoteDialog match={quoteFor} screening={screening.data} onClose={() => setQuoteFor(null)} />
    </div>
  );
}
