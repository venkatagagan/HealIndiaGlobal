/** Video consultations of one case (`GET /consultations?case_id=`): status, time, Join link. */
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Video } from 'lucide-react';
import { consultationsApi } from '@hig/shared/api';
import { Card, CardHeader, Money, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';

export function CaseConsultations({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  const query = useQuery({
    queryKey: ['consultations', 'case', caseId],
    queryFn: () => consultationsApi.list({ case_id: caseId, page_size: 20 }),
  });
  const items = query.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('teleconsult.caseTitle')} />
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <Video className="h-4 w-4 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.doctor?.full_name ?? '—'}
                {c.kind === 'followup' ? ` · ${t('teleconsult.followup')}` : ''}
              </p>
              <p className="text-xs text-muted">
                {c.scheduled_at
                  ? formatDateTime(c.scheduled_at)
                  : c.due_at
                    ? t('teleconsult.preferredAt', { time: formatDateTime(c.due_at) })
                    : t('teleconsult.awaitingTime')}
                {c.fee_minor > 0 ? (
                  <>
                    {' · '}
                    <Money minor={c.fee_minor} currency={c.currency} />
                  </>
                ) : null}
              </p>
            </div>
            <StatusBadge kind="consultation" status={c.status} />
            {c.status === 'scheduled' && c.meeting_url ? (
              <a
                href={c.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline"
              >
                {t('teleconsult.join')}
                <ExternalLink className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
