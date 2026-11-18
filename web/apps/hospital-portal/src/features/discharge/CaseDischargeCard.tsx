/** Case page card: the case's discharge summaries (versions) and "Write discharge summary" / "Continue draft". */
import { FileHeart, FilePlus2, Pencil } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, LinkButton, Skeleton } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDate } from '../../lib/format';
import { dischargePaths, useDischargeList } from './queries';

export function CaseDischargeCard({ caseId, bookingId, canStart }: { caseId: string; bookingId?: string | null; canStart: boolean }) {
  const { t } = useAppTranslation();
  const list = useDischargeList({ case_id: caseId });
  const rows = [...(list.data ?? [])].sort((a, b) => b.version - a.version);
  const draft = rows.find((s) => s.status === 'draft');
  const hasFinal = rows.some((s) => s.status === 'final');

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FileHeart className="h-4 w-4 text-primary-ink" aria-hidden />
            {t('discharge.caseCard.title')}
          </span>
        }
        description={t('discharge.caseCard.description')}
      />
      <CardBody className="space-y-3">
        {list.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{t('discharge.caseCard.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-fg">{t('discharge.versionLabel', { version: s.version })}</span>
                  <Badge tone={s.status === 'draft' ? 'amber' : 'green'}>{t(`discharge.status.${s.status}`)}</Badge>
                  {!s.is_latest && <Badge>{t('discharge.superseded')}</Badge>}
                </span>
                <LinkButton to={dischargePaths.one(s.id)} size="sm" variant="ghost">
                  {t('discharge.caseCard.open')}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
        {rows[0]?.discharge_date ? (
          <p className="text-xs text-muted">{t('discharge.caseCard.dischargedOn', { date: formatDate(rows[0].discharge_date) })}</p>
        ) : null}
        {draft ? (
          <LinkButton to={dischargePaths.one(draft.id)} className="w-full" icon={<Pencil className="h-4 w-4" aria-hidden />}>
            {t('discharge.caseCard.continueDraft')}
          </LinkButton>
        ) : !hasFinal && canStart && !list.isPending ? (
          <LinkButton to={dischargePaths.start(caseId, bookingId)} className="w-full" icon={<FilePlus2 className="h-4 w-4" aria-hidden />}>
            {t('discharge.caseCard.start')}
          </LinkButton>
        ) : null}
      </CardBody>
    </Card>
  );
}
