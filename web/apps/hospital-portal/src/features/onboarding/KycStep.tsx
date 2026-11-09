import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, Trash2 } from 'lucide-react';
import {
  DOCUMENT_KIND_LABELS,
  documentsApi,
  errorMessage,
  type DocumentKind,
  type DocumentOut,
  type HospitalProfileOut,
} from '@hig/shared/api';
import { Button, ConfirmDialog, ErrorState, FileButton, Skeleton, StatusBadge } from '../../components/ui';
import { formatBytes, formatDate } from '../../lib/format';
import { qk } from '../../lib/queries';

export const REQUIRED_KYC_KINDS: { kind: DocumentKind; label: string; hint: string }[] = [
  { kind: 'kyc_registration', label: 'Hospital registration certificate', hint: 'Clinical establishment / state registration' },
  { kind: 'kyc_accreditation', label: 'Accreditation certificates', hint: 'JCI / NABH / NABL / ISO - one file per certificate' },
  { kind: 'kyc_pan', label: 'PAN card', hint: 'PAN of the legal entity' },
  { kind: 'kyc_gst', label: 'GST registration certificate', hint: 'GSTIN certificate (REG-06)' },
];

export function useKycDocuments(hospitalId: string) {
  return useQuery({
    queryKey: qk.kycDocs(hospitalId),
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const docs = await documentsApi.list({ hospital_id: hospitalId });
      return docs.filter((d) => d.kind.startsWith('kyc_') || d.kind === 'bank_proof');
    },
  });
}

/** Step 4 - KYC uploads (multipart POST /documents with hospital_id). */
export function KycStep({ profile, onContinue }: { profile: HospitalProfileOut; onContinue?: () => void }) {
  const queryClient = useQueryClient();
  const docs = useKycDocuments(profile.id);
  const [uploadingKind, setUploadingKind] = useState<DocumentKind | null>(null);
  const [toDelete, setToDelete] = useState<DocumentOut | null>(null);

  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: DocumentKind; file: File }) =>
      documentsApi.upload({ file, kind, hospital_id: profile.id }),
    onMutate: ({ kind }) => setUploadingKind(kind),
    onSettled: () => setUploadingKind(null),
    onSuccess: (doc) => {
      toast.success(`${doc.file_name} uploaded`);
      void queryClient.invalidateQueries({ queryKey: qk.kycDocs(profile.id) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (doc: DocumentOut) => documentsApi.delete(doc.id),
    onSuccess: () => {
      toast.success('Document removed');
      setToDelete(null);
      void queryClient.invalidateQueries({ queryKey: qk.kycDocs(profile.id) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const download = async (doc: DocumentOut) => {
    try {
      await documentsApi.downloadAndSave(doc);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (docs.isPending) return <Skeleton className="h-64 w-full" />;
  if (docs.isError) return <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />;

  const byKind = (kind: DocumentKind) => docs.data.filter((d) => d.kind === kind);
  const complete = REQUIRED_KYC_KINDS.every((r) => byKind(r.kind).some((d) => d.status !== 'rejected'));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        PDF, JPG, PNG or WebP up to 20 MB. Documents are stored privately and reviewed only by the Heal India Global
        verification team.
      </p>
      <ul className="space-y-3">
        {REQUIRED_KYC_KINDS.map((req) => {
          const files = byKind(req.kind);
          const ok = files.some((d) => d.status !== 'rejected');
          return (
            <li key={req.kind} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className={ok ? 'mt-0.5 h-5 w-5 text-brand-500' : 'mt-0.5 h-5 w-5 text-slate-300 dark:text-slate-600'}
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{req.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{req.hint}</p>
                  </div>
                </div>
                <FileButton
                  loading={uploadingKind === req.kind}
                  disabled={uploadingKind !== null && uploadingKind !== req.kind}
                  onFile={(file) => upload.mutate({ kind: req.kind, file })}
                  onInvalid={(m) => toast.error(m)}
                >
                  {files.length ? 'Upload another' : 'Upload'}
                </FileButton>
              </div>
              {files.length > 0 && (
                <ul className="mt-3 divide-y divide-slate-100 rounded-lg bg-slate-50 dark:divide-slate-800 dark:bg-raised-dark/50">
                  {files.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{doc.file_name}</span>
                      <span className="text-xs text-slate-500">
                        {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                      </span>
                      <StatusBadge status={doc.status} />
                      <Button variant="ghost" size="icon" aria-label={`Download ${doc.file_name}`} onClick={() => void download(doc)}>
                        <Download className="h-4 w-4" aria-hidden />
                      </Button>
                      {doc.status !== 'verified' && (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${doc.file_name}`} onClick={() => setToDelete(doc)}>
                          <Trash2 className="h-4 w-4 text-danger-500" aria-hidden />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {onContinue && (
        <div className="flex items-center justify-end gap-3">
          {!complete && <span className="text-sm text-amber-600 dark:text-amber-400">All four documents are required to submit.</span>}
          <Button onClick={onContinue}>Continue</Button>
        </div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        loading={remove.isPending}
        tone="danger"
        title="Remove document?"
        description={toDelete ? `${toDelete.file_name} (${DOCUMENT_KIND_LABELS[toDelete.kind]}) will be deleted.` : undefined}
        confirmLabel="Remove"
      />
    </div>
  );
}
