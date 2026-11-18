import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, Target } from 'lucide-react';
import { crmApi } from '@hig/shared/api';
import { StatCard } from '../../components/ui';
import { formatNumber, formatPercent } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';
import { leadKeys } from './leadMeta';

/** Dashboard tiles: follow-ups due today (-> /leads?follow_up=due) and the lead conversion rate. */
export function LeadTiles() {
  const { t } = useAppTranslation();
  const pipeline = useQuery({ queryKey: leadKeys.pipeline({}), queryFn: () => crmApi.pipeline() });
  const p = pipeline.data;
  if (pipeline.isError) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
      <Link to="/leads?follow_up=due" className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
        <StatCard
          label={t('crm.dashboard.dueToday')}
          value={p ? formatNumber(p.follow_ups_due_today) : '…'}
          hint={p && p.follow_ups_overdue > 0 ? t('crm.summary.overdue', { count: p.follow_ups_overdue }) : t('crm.dashboard.dueHint')}
          icon={<AlarmClock className="h-4 w-4" />}
          tone="warning"
        />
      </Link>
      <Link to="/leads" className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
        <StatCard
          label={t('crm.dashboard.conversion')}
          value={p ? (p.conversion_rate === null ? '—' : formatPercent(p.conversion_rate)) : '…'}
          hint={p ? t('crm.dashboard.conversionHint', { open: formatNumber(p.open), won: formatNumber(p.won), lost: formatNumber(p.lost) }) : undefined}
          icon={<Target className="h-4 w-4" />}
          tone="accent"
        />
      </Link>
    </div>
  );
}
