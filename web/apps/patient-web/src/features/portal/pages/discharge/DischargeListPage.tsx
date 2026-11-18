/** Discharge summaries (GET /discharge-summaries): the final summaries the patient's hospitals have issued. */
import { useMemo } from 'react';
import { FileHeart } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { DischargeSummaryListItem } from '@hig/shared/api';
import { DataTable, DateCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../../i18n';
import { useDischargeSummaries } from '../../api/discharge';
import { paths } from '../../lib/paths';
import { useDocumentTitle } from '../../lib/shared';
import { Alert, Badge, PageHeader } from '../../ui/primitives';

const columns = (t: TFunction): DataTableColumn<DischargeSummaryListItem>[] => [
  {
    key: 'hospital',
    header: t('discharge.list.columns.hospital'),
    mobile: 'primary',
    cell: (s) => <TextCell primary={s.hospital_name ?? '—'} secondary={<span dir="ltr">{s.case_number ?? ''}</span>} />,
  },
  {
    key: 'discharge_date',
    header: t('discharge.list.columns.dischargeDate'),
    mobile: 'secondary',
    cell: (s) => <DateCell value={s.discharge_date} display="date" />,
  },
  {
    key: 'version',
    header: t('discharge.list.columns.version'),
    mobile: 'badge',
    cell: (s) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-sm">{t('discharge.versionLabel', { version: s.version })}</span>
        {s.is_latest ? <Badge tone="green">{t('discharge.latest')}</Badge> : <Badge>{t('discharge.superseded')}</Badge>}
      </span>
    ),
  },
  {
    key: 'finalized_at',
    header: t('discharge.list.columns.finalized'),
    align: 'end',
    mobile: 'meta',
    cell: (s) => <DateCell value={s.finalized_at} display="date" className="text-muted" />,
  },
];

export function DischargeListPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('discharge.title'));
  const list = useDischargeSummaries();
  const cols = useMemo(() => columns(t), [t]);
  const rows = useMemo(
    () => (list.data ?? []).filter((s) => s.status === 'final').sort((a, b) => (b.finalized_at ?? b.updated_at).localeCompare(a.finalized_at ?? a.updated_at)),
    [list.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('discharge.title')} description={t('discharge.description')} />
      <Alert tone="amber">{t('discharge.emergencyNote')}</Alert>
      <DataTable
        id="patient.discharge"
        caption={t('discharge.title')}
        columns={cols}
        rows={rows}
        rowKey={(s) => s.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(s) => paths.dischargeSummary(s.id)}
        rowLabel={(s) => t('discharge.list.openRow', { case: s.case_number ?? '', version: s.version })}
        showViewOptions={false}
        emptyIcon={<FileHeart className="size-8" aria-hidden />}
        emptyTitle={t('discharge.list.emptyTitle')}
        emptyDescription={t('discharge.list.emptyDescription')}
      />
    </div>
  );
}
