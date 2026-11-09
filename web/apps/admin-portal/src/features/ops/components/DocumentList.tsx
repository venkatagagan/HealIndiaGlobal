import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { CheckCircle2, Download, Eye, FileText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  documentsApi,
  errorMessage,
  type DocumentOut,
} from '@hig/shared/api';
import { Button, EmptyState, ErrorState, LoadingState, Modal, ReasonDialog, StatusBadge } from '../ui';
import { formatBytes, formatDateTime } from '../lib/format';
import { useOpsMutation } from '../lib/mutations';

const PREVIEWABLE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i;

/**
 * Documents with authorized preview (blob URL, never a public link), download and optional
 * verify / reject (staff may verify KYC and case documents).
 */
export function DocumentList({
  documents,
  canVerify,
  invalidate = [],
  emptyText = 'No documents uploaded.',
}: {
  documents: readonly DocumentOut[];
  canVerify: boolean;
  invalidate?: readonly QueryKey[];
  emptyText?: string;
}) {
  const [preview, setPreview] = useState<DocumentOut | null>(null);
  const [rejecting, setRejecting] = useState<DocumentOut | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const verify = useOpsMutation({
    mutationFn: (v: { id: string; status: 'verified' | 'rejected'; note?: string }) =>
      documentsApi.verify(v.id, { status: v.status, note: v.note }),
    success: (d) => `Document marked ${d.status}`,
    invalidate,
    onSuccess: () => setRejecting(null),
  });

  const download = async (doc: DocumentOut) => {
    setDownloading(doc.id);
    try {
      await documentsApi.downloadAndSave(doc);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(null);
    }
  };

  if (documents.length === 0) return <EmptyState title={emptyText} icon={<FileText className="size-6" />} />;

  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {documents.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <FileText className="size-5 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.file_name}</p>
              <p className="text-xs text-slate-500">
                {DOCUMENT_KIND_LABELS[doc.kind] ?? doc.kind} · {formatBytes(doc.size_bytes)} · {formatDateTime(doc.created_at)}
                {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
              </p>
            </div>
            <StatusBadge status={doc.status} label={DOCUMENT_STATUS_LABELS[doc.status]} />
            <div className="flex gap-1">
              {PREVIEWABLE.test(doc.content_type) && (
                <Button variant="ghost" size="sm" icon={<Eye className="size-3.5" />} onClick={() => setPreview(doc)}>
                  View
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={<Download className="size-3.5" />}
                loading={downloading === doc.id}
                onClick={() => void download(doc)}
              >
                Download
              </Button>
              {canVerify && doc.status !== 'verified' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-700 dark:text-green-400"
                  icon={<CheckCircle2 className="size-3.5" />}
                  disabled={verify.isPending}
                  onClick={() => verify.mutate({ id: doc.id, status: 'verified' })}
                >
                  Verify
                </Button>
              )}
              {canVerify && doc.status !== 'rejected' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 dark:text-red-400"
                  icon={<XCircle className="size-3.5" />}
                  onClick={() => setRejecting(doc)}
                >
                  Reject
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
      <ReasonDialog
        open={!!rejecting}
        title="Reject document"
        description={rejecting?.file_name}
        label="Note for the uploader"
        confirmLabel="Reject"
        loading={verify.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(note) => rejecting && verify.mutate({ id: rejecting.id, status: 'rejected', note })}
      />
    </>
  );
}

function DocumentPreview({ doc, onClose }: { doc: DocumentOut | null; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['documents', 'blob', doc?.id],
    queryFn: () => documentsApi.download(doc!.id),
    enabled: !!doc,
    staleTime: 60_000,
    gcTime: 60_000,
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(q.data.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [q.data]);

  useEffect(() => {
    // drop cached blobs of closed previews (they may be large)
    if (!doc) qc.removeQueries({ queryKey: ['documents', 'blob'] });
  }, [doc, qc]);

  const isPdf = (q.data?.contentType ?? doc?.content_type ?? '').includes('pdf');
  return (
    <Modal open={!!doc} onClose={onClose} title={doc?.file_name ?? 'Document'} size="xl">
      {q.isLoading ? (
        <LoadingState label="Loading document…" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : url ? (
        isPdf ? (
          <iframe title={doc?.file_name ?? 'Document'} src={url} className="h-[70vh] w-full rounded-lg border-0 bg-white" />
        ) : (
          <img src={url} alt={doc?.file_name ?? 'Document'} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
        )
      ) : null}
    </Modal>
  );
}
