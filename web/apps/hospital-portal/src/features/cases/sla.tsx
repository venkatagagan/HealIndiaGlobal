import { AlarmClock, Clock } from 'lucide-react';
import type { CaseOut } from '@hig/shared/api';
import { Alert, Badge } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDateTime } from '../../lib/format';

/**
 * Quote SLA fields of GET /cases and GET /cases/{id} (phase 1). `quote_due_at` = case created + QUOTE_SLA_HOURS;
 * `hours_left` is null once a quote was sent or the case moved on; `quote_overdue` while no quote was sent in time.
 */
export interface QuoteSla {
  quote_due_at?: string | null;
  first_quote_at?: string | null;
  quote_overdue?: boolean;
  hours_left?: number | null;
  quote_group_id?: string | null;
}

export type SlaCase = CaseOut & QuoteSla;

export const sla = (c: CaseOut): QuoteSla => c as SlaCase;

type TFn = ReturnType<typeof useAppTranslation>['t'];

/** Plain-text value of the respond-by state (CSV export). */
export function respondByText(c: CaseOut, t: TFn): string {
  const s = sla(c);
  if (!s.quote_due_at) return '';
  if (s.quote_overdue) return `${t('cases.respondBy.overdue')} (${s.quote_due_at})`;
  if (s.hours_left == null) return '';
  return s.quote_due_at;
}

/** "Respond by" cell: overdue badge, hours left (amber within 12 h) or nothing once a quote was sent. */
export function RespondBy({ value, compact = false }: { value: CaseOut; compact?: boolean }) {
  const { t } = useAppTranslation();
  const s = sla(value);
  if (!s.quote_due_at || (!s.quote_overdue && s.hours_left == null)) return <span className="text-muted">—</span>;
  const due = formatDateTime(s.quote_due_at);
  if (s.quote_overdue) {
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge tone="red" className="gap-1">
          <AlarmClock className="size-3.5" aria-hidden /> {t('cases.respondBy.overdue')}
        </Badge>
        {!compact && <span className="text-xs text-muted">{t('cases.respondBy.wasDue', { date: due })}</span>}
      </span>
    );
  }
  const hours = Math.max(0, s.hours_left ?? 0);
  const label = hours < 1 ? t('cases.respondBy.underAnHour') : t('cases.respondBy.hoursLeft', { count: Math.ceil(hours) });
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={hours <= 12 ? 'amber' : 'blue'} className="gap-1">
        <Clock className="size-3.5" aria-hidden /> {label}
      </Badge>
      {!compact && <span className="text-xs text-muted">{due}</span>}
    </span>
  );
}

/** Case detail banner: when the promised quote is due (or overdue), and whether other hospitals were asked too. */
export function QuoteSlaAlert({ value }: { value: CaseOut }) {
  const { t } = useAppTranslation();
  const s = sla(value);
  const waiting = value.status === 'enquiry' && !!s.quote_due_at && (!!s.quote_overdue || s.hours_left != null);
  const grouped = !!s.quote_group_id && value.status === 'enquiry';
  if (!waiting && !grouped) return null;
  const due = s.quote_due_at ? formatDateTime(s.quote_due_at) : '';
  const hours = Math.max(0, s.hours_left ?? 0);
  return (
    <div className="mb-6 space-y-3">
      {waiting &&
        (s.quote_overdue ? (
          <Alert tone="red" icon={<AlarmClock className="size-5" aria-hidden />} title={t('cases.respondBy.alertOverdueTitle')}>
            {t('cases.respondBy.alertOverdueBody', { date: due })}
          </Alert>
        ) : (
          <Alert tone={hours <= 12 ? 'amber' : 'blue'} icon={<Clock className="size-5" aria-hidden />} title={t('cases.respondBy.alertDueTitle', { date: due })}>
            {hours < 1 ? t('cases.respondBy.underAnHour') : t('cases.respondBy.hoursLeft', { count: Math.ceil(hours) })}
          </Alert>
        ))}
      {grouped && (
        <Alert tone="violet" title={t('cases.respondBy.groupTitle')}>
          {t('cases.respondBy.groupBody')}
        </Alert>
      )}
    </div>
  );
}
