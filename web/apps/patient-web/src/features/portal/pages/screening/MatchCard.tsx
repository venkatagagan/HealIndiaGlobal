import { BadgeCheck, Bookmark, BookmarkCheck, CirclePlus, CircleCheck, MapPin } from 'lucide-react';
import type { MatchOut } from '@hig/shared/api';
import { Accreditations, Avatar, Money, Rating } from '../../components/common';
import { paths } from '../../lib/paths';
import { cn, formatMoneyRange } from '../../lib/shared';
import { Badge, Button, ButtonLink, Card } from '../../ui/primitives';

export function MatchCard({
  match,
  selected,
  canSelect,
  onToggleSelect,
  onRequestQuote,
  showActions,
  saved,
  onToggleSave,
}: {
  match: MatchOut;
  selected: boolean;
  canSelect: boolean;
  onToggleSelect: () => void;
  onRequestQuote: () => void;
  showActions: boolean;
  saved: boolean;
  onToggleSave?: () => void;
}) {
  const doctor = match.doctor;
  const score = Math.round(Number(match.match_score));
  const title = doctor?.full_name ?? match.hospital.name;
  return (
    <Card className={cn('flex flex-col overflow-hidden transition', selected && 'ring-2 ring-violet-500')}>
      <div className="flex gap-4 p-5">
        <Avatar name={title} src={doctor?.photo_url ?? match.hospital.logo_url} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">{title}</h3>
              {doctor ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {doctor.specialty.name}
                  {doctor.experience_years ? ` · ${doctor.experience_years} years of experience` : ''}
                </p>
              ) : null}
            </div>
            <Badge tone={score >= 80 ? 'green' : score >= 60 ? 'blue' : 'neutral'} className="text-sm">
              {score}% match
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            {match.hospital.name}, {match.hospital.city}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Accreditations values={match.hospital.accreditations} />
            {doctor?.qualifications.slice(0, 3).map((q) => (
              <Badge key={q}>{q}</Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
        <Rating value={doctor?.rating_avg ?? match.hospital.rating_avg} count={doctor?.rating_count ?? match.hospital.rating_count} />
        {doctor?.success_rate_pct != null ? (
          <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300">
            <BadgeCheck className="h-4 w-4" aria-hidden /> {Number(doctor.success_rate_pct).toFixed(0)}% success
          </span>
        ) : null}
        {match.procedure ? <span className="text-slate-500">{match.procedure.name}</span> : null}
      </div>

      {match.reasons.length ? (
        <div className="flex flex-wrap gap-1.5 px-5 pb-3">
          {match.reasons.map((r) => (
            <Badge key={r} tone="green">
              {r}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <p className="text-xs text-slate-500">Estimated total cost</p>
          <p className="text-2xl font-bold text-red-500">
            {match.estimated_cost_minor != null ? <Money minor={match.estimated_cost_minor} currency={match.currency} trim /> : 'On request'}
          </p>
          {match.savings ? (
            <p className="text-xs font-medium text-green-600 dark:text-green-400">
              Save {match.savings.pct_min}-{match.savings.pct_max}% vs{' '}
              {formatMoneyRange(match.savings.home_min_minor, match.savings.home_max_minor, match.savings.home_currency)} at home
            </p>
          ) : null}
          {match.package ? <p className="text-xs text-slate-500">Package: {match.package.name}</p> : null}
        </div>
        {showActions ? (
          <div className="flex flex-wrap gap-2">
            {onToggleSave && doctor ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSave}
                aria-label={saved ? 'Remove doctor from saved' : 'Save doctor'}
                icon={saved ? <BookmarkCheck className="h-4 w-4 text-green-600" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
              />
            ) : null}
            <Button
              variant={selected ? 'accent' : 'secondary'}
              size="sm"
              onClick={onToggleSelect}
              disabled={!selected && !canSelect}
              aria-pressed={selected}
              icon={selected ? <CircleCheck className="h-4 w-4" aria-hidden /> : <CirclePlus className="h-4 w-4" aria-hidden />}
            >
              Compare
            </Button>
            {doctor ? (
              <ButtonLink to={paths.doctor(doctor.id)} variant="outline" size="sm" target="_blank" rel="noopener">
                View details
              </ButtonLink>
            ) : (
              <ButtonLink to={paths.hospital(match.hospital.slug)} variant="outline" size="sm" target="_blank" rel="noopener">
                View hospital
              </ButtonLink>
            )}
            <Button size="sm" variant="danger" onClick={onRequestQuote}>
              Request quote
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
