import { useEffect, useState } from 'react';
import { AlarmClock, Clock } from 'lucide-react';
import { Badge } from '../../components/ui';
import { formatDateTime } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';

/** Re-renders every `intervalMs` (for countdowns). */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Countdown to the hospital's quote deadline (`quote_due_at`, QUOTE_SLA_HOURS after the enquiry): "Quote due in
 * 1 d 4 h" or "Quote overdue". Renders nothing once the hospital has quoted (no deadline).
 */
export function QuoteDeadline({
  dueAt,
  overdue,
  className,
}: {
  dueAt: string | null | undefined;
  overdue?: boolean;
  className?: string;
}) {
  const { t } = useAppTranslation();
  const now = useNow();
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return null;
  const title = t('quoteDeadline.dueAt', { date: formatDateTime(dueAt) });
  const left = due - now;
  if (overdue || left <= 0) {
    return (
      <Badge tone="danger" className={className}>
        <span title={title} className="inline-flex items-center gap-1">
          <AlarmClock className="h-3 w-3" aria-hidden /> {t('quoteDeadline.overdue')}
        </span>
      </Badge>
    );
  }
  const minutes = Math.max(1, Math.floor(left / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const text =
    days > 0
      ? t('quoteDeadline.leftDays', { days, hours })
      : hours > 0
        ? t('quoteDeadline.leftHours', { hours, minutes: mins })
        : t('quoteDeadline.leftMinutes', { minutes: mins });
  return (
    <Badge tone={minutes <= 12 * 60 ? 'warning' : 'info'} className={className}>
      <span title={title} className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" aria-hidden /> {text}
      </span>
    </Badge>
  );
}
