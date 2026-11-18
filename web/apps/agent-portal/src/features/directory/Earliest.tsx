/** Earliest free consultation / admission dates (`next_available_*`, IST calendar dates) as small chips. */
import { BedDouble, CalendarCheck2 } from 'lucide-react';
import type { IsoDate } from '@hig/shared/api';
import { cn, formatDate, isoDateFromToday, toDate } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';

export function useEarliestLabel() {
  const { t } = useAppTranslation();
  return (date: IsoDate) => {
    const day = date.slice(0, 10);
    if (day <= isoDateFromToday(0)) return t('earliest.today');
    if (day === isoDateFromToday(1)) return t('earliest.tomorrow');
    return formatDate(toDate(`${day}T12:00:00`), 'EEE d MMM');
  };
}

export function EarliestChips({
  consultation,
  admission,
  className,
  showEmpty = false,
}: {
  consultation?: IsoDate | null;
  admission?: IsoDate | null;
  className?: string;
  /** show "No free dates published" when neither date is known */
  showEmpty?: boolean;
}) {
  const { t } = useAppTranslation();
  const label = useEarliestLabel();
  if (!consultation && !admission) {
    return showEmpty ? <p className={cn('text-xs text-muted', className)}>{t('earliest.none')}</p> : null;
  }
  return (
    <div className={cn('flex flex-wrap gap-1.5 text-xs', className)}>
      {consultation ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary-ink">
          <CalendarCheck2 className="h-3 w-3" aria-hidden />
          {t('earliest.consultation', { date: label(consultation) })}
        </span>
      ) : null}
      {admission ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-ink">
          <BedDouble className="h-3 w-3" aria-hidden />
          {t('earliest.admission', { date: label(admission) })}
        </span>
      ) : null}
    </div>
  );
}
