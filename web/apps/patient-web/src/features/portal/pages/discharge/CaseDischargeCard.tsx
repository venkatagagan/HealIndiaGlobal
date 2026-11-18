/** Case page card: the latest final discharge summary of the case (nothing is shown until one exists). */
import { FileHeart } from 'lucide-react';
import type { Uuid } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useDischargeSummaries } from '../../api/discharge';
import { paths } from '../../lib/paths';
import { formatDate } from '../../lib/shared';
import { ButtonLink, Card, CardBody, CardHeader } from '../../ui/primitives';

export function CaseDischargeCard({ caseId }: { caseId: Uuid }) {
  const { t } = useAppTranslation();
  const list = useDischargeSummaries({ case_id: caseId });
  const latest = (list.data ?? []).find((s) => s.status === 'final' && s.is_latest);
  if (!latest) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FileHeart className="size-5 text-primary-ink" aria-hidden />
            {t('discharge.caseCard.title')}
          </span>
        }
        description={t('discharge.caseCard.description')}
      />
      <CardBody className="space-y-3">
        <p className="text-sm text-muted">
          {latest.discharge_date
            ? t('discharge.caseCard.dischargedOn', { date: formatDate(latest.discharge_date) })
            : t('discharge.versionLabel', { version: latest.version })}
        </p>
        <ButtonLink to={paths.dischargeSummary(latest.id)} variant="outline" size="sm" className="w-full">
          {t('discharge.caseCard.open')}
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
