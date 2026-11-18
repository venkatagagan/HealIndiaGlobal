import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, Share2, XCircle } from 'lucide-react';
import { DOCUMENT_KIND_LABELS, documentsApi, errorMessage, type DocumentOut } from '@hig/shared/api';
import { Button, DataTable, DateCell, StatusBadgeCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
// local ConfirmDialog: the shared one has no built-in "reason" note field
import { Badge, ConfirmDialog } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatBytes } from '../../lib/format';

/**
 * Case documents shared with the hospital: authorized download + verify / reject (POST /documents/{id}/verify).
 * Reports the patient shared from their records when asking for a quote (`case_documents`, phase 1) belong to
 * the patient or to another case, so they are flagged "Shared report".
 */
export function CaseDocuments({ documents, caseId }: { documents: DocumentOut[]; caseId: string }) {
  const { t } = useAppTranslation();
  const isShared = (d: DocumentOut) => d.case_id !== caseId;
  const sharedCount = documents.filter(isShared).length;
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<DocumentOut | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: ({ doc, status, note }: { doc: DocumentOut; status: 'verified' | 'rejected'; note?: string }) =>
      documentsApi.verify(doc.id, { status, ...(note ? { note } : {}) }),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'verified' ? t('cases.documents.verified') : t('cases.documents.rejected'));
      setRejecting(null);
      void queryClient.invalidateQueries({ queryKey: ['cases', 'detail', caseId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const download = async (doc: DocumentOut) => {
    setDownloading(doc.id);
    try {
      await documentsApi.downloadAndSave(doc);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(null);
    }
  };

  const columns: DataTableColumn<DocumentOut>[] = [
    {
      key: 'file',
      header: t('cases.documents.document'),
      sortable: true,
      mobile: 'primary',
      className: 'max-w-72',
      sortValue: (d) => d.file_name.toLowerCase(),
      cell: (d) => (
        <span className="flex min-w-0 items-center gap-3">
          <FileText className="size-5 shrink-0 text-muted" aria-hidden />
          <TextCell
            primary={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.file_name}</span>
                {isShared(d) && (
                  <Badge tone="violet" className="gap-1">
                    <Share2 className="size-3" aria-hidden /> {t('cases.documents.sharedBadge')}
                  </Badge>
                )}
              </span>
            }
            secondary={`${formatBytes(d.size_bytes)}${d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}`}
          />
        </span>
      ),
    },
    {
      key: 'kind',
      header: t('common.type'),
      sortable: true,
      sortValue: (d) => DOCUMENT_KIND_LABELS[d.kind] ?? d.kind,
      cell: (d) => DOCUMENT_KIND_LABELS[d.kind] ?? d.kind,
    },
    {
      key: 'status',
      header: t('common.status'),
      sortable: true,
      mobile: 'badge',
      cell: (d) => <StatusBadgeCell status={d.status} kind="document" />,
    },
    {
      key: 'uploaded',
      header: t('cases.documents.uploaded'),
      sortable: true,
      sortDescFirst: true,
      sortValue: (d) => d.created_at,
      cell: (d) => <DateCell value={d.created_at} display="date" className="text-muted" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      title: t('common.actions'),
      align: 'end',
      cell: (doc) => (
        <span className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('cases.documents.downloadAria', { name: doc.file_name })}
            loading={downloading === doc.id}
            onClick={() => void download(doc)}
          >
            {downloading !== doc.id && <Download className="size-4" aria-hidden />}
          </Button>
          {doc.status !== 'verified' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('cases.documents.verifyAria', { name: doc.file_name })}
              title={t('cases.documents.markVerified')}
              disabled={verify.isPending}
              onClick={() => verify.mutate({ doc, status: 'verified' })}
            >
              <CheckCircle2 className="size-4 text-success-ink" aria-hidden />
            </Button>
          )}
          {doc.status !== 'rejected' && (
            <Button variant="ghost" size="icon-sm" aria-label={t('cases.documents.rejectAria', { name: doc.file_name })} title={t('cases.documents.reject')} disabled={verify.isPending} onClick={() => setRejecting(doc)}>
              <XCircle className="size-4 text-danger-ink" aria-hidden />
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        header={
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-fg">{t('cases.documents.title')}</h2>
            <p className="text-sm text-muted">{t('cases.documents.description')}</p>
            {sharedCount > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-accent-ink">
                <Share2 className="size-4" aria-hidden /> {t('cases.documents.sharedSummary', { count: sharedCount })}
              </p>
            )}
          </div>
        }
        caption={t('cases.documents.title')}
        columns={columns}
        rows={documents}
        defaultSort={{ key: 'uploaded', direction: 'desc' }}
        responsive="cards"
        emptyIcon={<FileText className="size-6" aria-hidden />}
        emptyTitle={t('cases.documents.emptyTitle')}
        emptyDescription={t('cases.documents.emptyDescription')}
      />
      <ConfirmDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        onConfirm={(note) => rejecting && verify.mutate({ doc: rejecting, status: 'rejected', note })}
        loading={verify.isPending}
        tone="danger"
        title={t('cases.documents.rejectDialog.title')}
        description={t('cases.documents.rejectDialog.description')}
        noteLabel={t('cases.documents.rejectDialog.reason')}
        noteRequired
        notePlaceholder={t('cases.documents.rejectDialog.placeholder')}
        confirmLabel={t('cases.documents.rejectDialog.confirm')}
      />
    </>
  );
}
