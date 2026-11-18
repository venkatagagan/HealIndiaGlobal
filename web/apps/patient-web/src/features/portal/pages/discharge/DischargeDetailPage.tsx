/**
 * One discharge summary (GET /discharge-summaries/{id}): every section, PDF and FHIR downloads, "Share with my
 * doctor", the share links and medication reminders. Older versions show a link to the latest one.
 */
import { useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { Download, FileCode2, FileHeart, Send } from 'lucide-react';
import { dischargeApi, documentsApi, errorMessage, isApiError, type DischargeAttachment } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useDischargeSummaries, useDischargeSummary } from '../../api/discharge';
import { BackLink } from '../../components/common';
import { paths } from '../../lib/paths';
import { useDocumentTitle } from '../../lib/shared';
import { Alert, Badge, Button, ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton } from '../../ui/primitives';
import { DischargeSummaryView } from './DischargeSummaryView';
import { MedicationRemindersCard, ShareDialog, ShareLinksCard } from './DischargeSharing';

export function DischargeDetailPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('discharge.detail.documentTitle'));
  const { id } = useParams();
  const summary = useDischargeSummary(id);
  const data = summary.data;
  const siblings = useDischargeSummaries(data ? { case_id: data.case_id } : undefined, !!data && !data.is_latest);
  const latest = siblings.data?.find((s) => s.is_latest && s.status === 'final' && s.id !== data?.id);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const back = <BackLink to={paths.dischargeSummaries}>{t('discharge.detail.back')}</BackLink>;

  if (summary.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title={t('discharge.detail.title')} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (summary.isError || !data) {
    const notFound = isApiError(summary.error) && (summary.error.isNotFound || summary.error.isForbidden);
    return (
      <div className="space-y-6">
        <PageHeader back={back} title={t('discharge.detail.title')} />
        {notFound ? (
          <EmptyState icon={<FileHeart className="size-8" aria-hidden />} title={t('discharge.detail.notFound')} />
        ) : (
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        )}
      </div>
    );
  }

  const canShare = data.status === 'final' && data.is_latest;
  const downloadAttachment = (doc: DischargeAttachment) => void run(doc.id, () => documentsApi.downloadAndSave(doc));

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t('discharge.detail.title')}
            {data.status === 'draft' ? <Badge tone="amber">{t('discharge.status.draft')}</Badge> : null}
            {data.is_latest ? null : <Badge>{t('discharge.superseded')}</Badge>}
          </span>
        }
        description={t('discharge.detail.subtitle', { hospital: data.hospital_name ?? '—', case: data.case_number ?? '—' })}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Download className="size-4" aria-hidden />}
              loading={busy === 'pdf'}
              onClick={() => void run('pdf', () => dischargeApi.downloadPdf(data.id, data.version))}
            >
              {t('discharge.detail.downloadPdf')}
            </Button>
            <Button
              variant="outline"
              icon={<FileCode2 className="size-4" aria-hidden />}
              loading={busy === 'fhir'}
              title={t('discharge.detail.fhirHint')}
              onClick={() => void run('fhir', () => dischargeApi.downloadFhir(data.id, data.version))}
            >
              {t('discharge.detail.downloadFhir')}
            </Button>
            {canShare ? (
              <Button icon={<Send className="size-4" aria-hidden />} onClick={() => setShareOpen(true)}>
                {t('discharge.detail.share')}
              </Button>
            ) : null}
          </>
        }
      />

      {!data.is_latest ? (
        <Alert tone="amber" title={t('discharge.detail.supersededTitle')}>
          <p>{t('discharge.detail.supersededBody')}</p>
          {latest ? (
            <ButtonLink to={paths.dischargeSummary(latest.id)} variant="outline" size="sm" className="mt-2">
              {t('discharge.detail.openLatest')}
            </ButtonLink>
          ) : null}
        </Alert>
      ) : null}

      <p className="text-xs text-muted">{t('discharge.detail.fhirHint')}</p>

      <DischargeSummaryView summary={data} onDownloadAttachment={downloadAttachment} busyAttachmentId={busy} />

      {data.status === 'final' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ShareLinksCard summary={data} canShare={canShare} onShare={() => setShareOpen(true)} />
          <MedicationRemindersCard summary={data} />
        </div>
      ) : null}

      <p className="text-xs text-muted">{t('discharge.detail.disclaimer')}</p>

      <ShareDialog summary={data} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
