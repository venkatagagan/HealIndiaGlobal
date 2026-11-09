import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import {
  DOCUMENT_KIND_LABELS,
  documentsApi,
  errorMessage,
  type DocumentKind,
  type DocumentOut,
  type DocumentUploadIn,
} from '@hig/shared/api';
import { DocumentAiStatus, REPORT_DOCUMENT_KINDS } from '@hig/shared/docai';
import { Button, ConfirmDialog, EmptyState, FormField, Select, StatusBadge } from '../../components/ui';
import { UPLOAD_ACCEPT } from '../../lib/constants';
import { formatBytes } from '../../lib/format';
import { formatDate } from '../../lib/shared';

const MAX_UPLOAD_MB = 20;

export function DocumentList({
  documents,
  emptyText = 'No documents uploaded yet.',
  canDelete,
  aiStatus = false,
}: {
  documents: DocumentOut[];
  emptyText?: string;
  /** show the AI report reading status / "Read with AI" for medical report kinds (PLAN 7.1) */
  aiStatus?: boolean;
  /** return true for documents the current user may delete (their own uploads) */
  canDelete?: (doc: DocumentOut) => boolean;
}) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<DocumentOut | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (doc: DocumentOut) => documentsApi.delete(doc.id),
    onSuccess: () => {
      toast.success('Document deleted');
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      setPendingDelete(null);
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

  if (documents.length === 0) return <EmptyState icon={<FileText className="h-6 w-6" />} title={emptyText} className="py-8" />;

  return (
    <>
      <ul className="divide-y divide-border">
        {documents.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.file_name}</p>
              <p className="text-xs text-muted">
                {DOCUMENT_KIND_LABELS[doc.kind] ?? doc.kind} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
              </p>
            </div>
            {aiStatus && (REPORT_DOCUMENT_KINDS as readonly string[]).includes(doc.kind) ? (
              <DocumentAiStatus document={doc} audience="clinical" />
            ) : null}
            <StatusBadge kind="document" status={doc.status} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Download ${doc.file_name}`}
              loading={downloading === doc.id}
              onClick={() => void download(doc)}
              icon={downloading === doc.id ? undefined : <Download className="h-4 w-4" aria-hidden />}
            />
            {canDelete?.(doc) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${doc.file_name}`}
                onClick={() => setPendingDelete(doc)}
                icon={<Trash2 className="h-4 w-4 text-danger" aria-hidden />}
              />
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
        title={`Delete ${pendingDelete?.file_name ?? 'document'}?`}
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
      />
    </>
  );
}

/** Kind selector + file picker that uploads immediately. */
export function DocumentUploader({
  kinds,
  target,
  onUploaded,
  label = 'Upload document',
  compact = false,
}: {
  kinds: readonly DocumentKind[];
  target: Omit<DocumentUploadIn, 'file' | 'kind' | 'file_name'>;
  onUploaded?: (doc: DocumentOut) => void;
  label?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const kindId = useId();
  const [kind, setKind] = useState<DocumentKind>(kinds[0] ?? 'other');

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload({ ...target, kind, file }),
    onSuccess: (doc) => {
      toast.success(`${doc.file_name} uploaded`);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (target.case_id) void queryClient.invalidateQueries({ queryKey: ['cases', target.case_id] });
      onUploaded?.(doc);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`Files must be ${MAX_UPLOAD_MB} MB or smaller.`);
      return;
    }
    upload.mutate(file);
  };

  return (
    <div className={compact ? 'flex flex-wrap items-end gap-2' : 'flex flex-wrap items-end gap-3'}>
      {kinds.length > 1 && (
        <FormField label="Document type" htmlFor={kindId} className="min-w-48 flex-1">
          <Select id={kindId} value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_LABELS[k] ?? k}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Button
        variant="outline"
        icon={<Upload className="h-4 w-4" aria-hidden />}
        loading={upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      {!compact && <p className="w-full text-xs text-muted">PDF, JPG, PNG, WEBP, HEIC or DICOM · up to {MAX_UPLOAD_MB} MB</p>}
    </div>
  );
}
