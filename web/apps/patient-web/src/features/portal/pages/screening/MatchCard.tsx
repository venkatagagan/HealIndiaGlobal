import { BadgeCheck, Bookmark, BookmarkCheck, CirclePlus, CircleCheck, MapPin } from 'lucide-react';
import type { MatchOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { Link } from 'react-router';
import { Accreditations, Avatar, Money, Rating } from '../../components/common';
import { EarliestChips } from '../../components/phase1';
import { paths } from '../../lib/paths';
import { cn, formatNumber } from '../../lib/shared';
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
  const { t } = useAppTranslation();
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
                  {doctor.experience_years
                    ? ` · ${t('screening.match.experience', { count: doctor.experience_years, years: formatNumber(doctor.experience_years) })}`
                    : ''}
                </p>
              ) : null}
            </div>
            <Badge tone={score >= 80 ? 'green' : score >= 60 ? 'blue' : 'neutral'} className="text-sm">
              {t('screening.match.score', { score: formatNumber(score) })}
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <Link to={paths.hospital(match.hospital.slug)} className="hover:underline">
              {match.hospital.name}
            </Link>
            , {match.hospital.city}
          </p>
          <EarliestChips
            className="mt-2"
            consultation={match.next_available_consultation ?? doctor?.next_available_consultation}
            admission={match.next_available_admission ?? match.hospital.next_available_admission}
          />
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
            <BadgeCheck className="h-4 w-4" aria-hidden />{' '}
            {t('screening.match.success', { pct: formatNumber(Number(doctor.success_rate_pct), { maximumFractionDigits: 0 }) })}
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
          <p className="text-xs text-slate-500">{t('screening.match.estimatedTotal')}</p>
          <p className="text-2xl font-bold text-red-500">
            {match.estimated_cost_minor != null ? (
              <Money minor={match.estimated_cost_minor} currency={match.currency} trim />
            ) : (
              t('screening.match.onRequest')
            )}
          </p>
          {/* No saving claim here: match savings carry no benchmark confidence (legal display rule) - the
              procedure page shows the checked home-vs-India comparison. */}
          {match.procedure ? (
            <Link to={paths.procedure(match.procedure.slug)} className="text-xs font-medium text-primary-ink hover:underline">
              {t('screening.match.compareHome')}
            </Link>
          ) : null}
          {match.package ? <p className="text-xs text-slate-500">{t('screening.match.package', { name: match.package.name })}</p> : null}
        </div>
        {showActions ? (
          <div className="flex flex-wrap gap-2">
            {onToggleSave && doctor ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSave}
                aria-label={saved ? t('screening.match.unsaveDoctor') : t('screening.match.saveDoctor')}
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
              {t('screening.match.compare')}
            </Button>
            {doctor ? (
              <ButtonLink to={paths.doctor(doctor.id)} variant="outline" size="sm">
                {t('screening.match.viewDetails')}
              </ButtonLink>
            ) : (
              <ButtonLink to={paths.hospital(match.hospital.slug)} variant="outline" size="sm">
                {t('screening.match.viewHospital')}
              </ButtonLink>
            )}
            <Button size="sm" variant="danger" onClick={onRequestQuote}>
              {t('screening.match.requestQuote')}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
