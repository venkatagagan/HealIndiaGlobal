import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { cn } from '../lib/shared';

/**
 * Month calendar where only `available` dates (YYYY-MM-DD) can be picked. Keyboard: Tab to a day, Enter to pick.
 */
export function AvailabilityCalendar({
  month,
  onMonth,
  available,
  value,
  onChange,
  minMonth,
  maxMonth,
  loading,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  available: Map<string, number>;
  value: string | null;
  onChange: (date: string) => void;
  minMonth: Date;
  maxMonth: Date;
  loading?: boolean;
}) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month],
  );
  const canPrev = startOfMonth(month) > startOfMonth(minMonth);
  const canNext = startOfMonth(month) < startOfMonth(maxMonth);

  return (
    <div className={cn('rounded-2xl bg-slate-900 p-4 text-white', loading && 'opacity-60')} aria-busy={loading}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonth(addMonths(month, -1))}
          disabled={!canPrev}
          className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="font-semibold" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </p>
        <button
          type="button"
          onClick={() => onMonth(addMonths(month, 1))}
          disabled={!canNext}
          className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-slate-400" aria-hidden>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5" role="grid" aria-label="Admission dates">
        {days.map((day) => {
          const iso = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, month);
          const free = available.get(iso) ?? 0;
          const selectable = inMonth && free > 0;
          const selected = value === iso;
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              disabled={!selectable}
              aria-selected={selected}
              aria-label={`${format(day, 'EEEE d MMMM')}${selectable ? `, ${free} slot${free === 1 ? '' : 's'} available` : ', not available'}`}
              onClick={() => onChange(iso)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-full text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                !inMonth && 'invisible',
                selected
                  ? 'bg-violet-600 font-bold text-white'
                  : selectable
                    ? 'bg-green-900/60 font-medium text-green-300 hover:bg-green-700'
                    : 'bg-slate-800/60 text-slate-600',
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-green-900/60 ring-1 ring-green-400" aria-hidden /> Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-violet-600" aria-hidden /> Selected
        </span>
      </div>
    </div>
  );
}
