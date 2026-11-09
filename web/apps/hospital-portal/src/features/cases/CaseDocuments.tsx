import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, XCircle } from 'lucide-react';
import { DOCUMENT_KIND_LABELS, documentsApi, errorMessage, type DocumentOut } from '@hig/shared/api';
import { Button, DataTable, DateCell, StatusBadgeCell, TextCell, type DataTableColumn } from '@hig/shared/ui';
// local ConfirmDialog: the shared one has no built-in "reason" note field
import { ConfirmDialog } from '../../components/ui';
import { formatBytes } from '../../lib/format';

/** Case documents shared with the hospital: authorized download + verify / reject (POST /documents/{id}/verify). */
export function CaseDocuments({ documents, caseId }: { documents: DocumentOut[]; caseId: string }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<DocumentOut | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: ({ doc, status, note }: { doc: DocumentOut; status: 'verified' | 'rejected'; note?: string }) =>
      documentsApi.verify(doc.id, { status, ...(note ? { note } : {}) }),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'verified' ? 'Document verified' : 'Document rejected');
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
      header: 'Document',
      sortable: true,
      mobile: 'primary',
      className: 'max-w-72',
      sortValue: (d) => d.file_name.toLowerCase(),
      cell: (d) => (
        <span className="flex min-w-0 items-center gap-3">
          <FileText className="size-5 shrink-0 text-muted" aria-hidden />
          <TextCell primary={<span className="font-medium">{d.file_name}</span>} secondary={`${formatBytes(d.size_bytes)}${d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}`} />
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      sortable: true,
      sortValue: (d) => DOCUMENT_KIND_LABELS[d.kind] ?? d.kind,
      cell: (d) => DOCUMENT_KIND_LABELS[d.kind] ?? d.kind,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'badge',
      cell: (d) => <StatusBadgeCell status={d.status} kind="document" />,
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      sortable: true,
      sortDescFirst: true,
      sortValue: (d) => d.created_at,
      cell: (d) => <DateCell value={d.created_at} display="date" className="text-muted" />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      align: 'end',
      cell: (doc) => (
        <span className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${doc.file_name}`}
            loading={downloading === doc.id}
            onClick={() => void download(doc)}
          >
            {downloading !== doc.id && <Download className="size-4" aria-hidden />}
          </Button>
          {doc.status !== 'verified' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Verify ${doc.file_name}`}
              title="Mark verified"
              disabled={verify.isPending}
              onClick={() => verify.mutate({ doc, status: 'verified' })}
            >
              <CheckCircle2 className="size-4 text-success-ink" aria-hidden />
            </Button>
          )}
          {doc.status !== 'rejected' && (
            <Button variant="ghost" size="icon-sm" aria-label={`Reject ${doc.file_name}`} title="Reject" disabled={verify.isPending} onClick={() => setRejecting(doc)}>
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
            <h2 className="text-base font-semibold text-fg">Medical documents</h2>
            <p className="text-sm text-muted">Reports, imaging and travel documents shared for this case.</p>
          </div>
        }
        caption="Medical documents"
        columns={columns}
        rows={documents}
        defaultSort={{ key: 'uploaded', direction: 'desc' }}
        responsive="cards"
        emptyIcon={<FileText className="size-6" aria-hidden />}
        emptyTitle="No documents yet"
        emptyDescription="Ask the patient to upload reports via the conversation."
      />
      <ConfirmDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        onConfirm={(note) => rejecting && verify.mutate({ doc: rejecting, status: 'rejected', note })}
        loading={verify.isPending}
        tone="danger"
        title="Reject document?"
        description="The patient will be asked to upload a clearer or correct document."
        noteLabel="Reason"
        noteRequired
        notePlaceholder="e.g. MRI report is incomplete - please upload all pages"
        confirmLabel="Reject document"
      />
    </>
  );
}
