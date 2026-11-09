/**
 * Document rows for the patient (Documents page + case detail): file, type, case, uploaded, verification,
 * AI reading status (medical reports only) and download / delete actions.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Download, FileImage, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DOCUMENT_KIND_LABELS, documentsApi, errorMessage, type DocumentKind, type DocumentOut, type Uuid } from '@hig/shared/api';
import {
  DocumentAiStatus,
  REPORT_DOCUMENT_KINDS,
  useDocumentAnalyses,
  type DocumentAnalysisOut,
} from '@hig/shared/docai';
import { Button, DateCell, type DataTableColumn } from '@hig/shared/ui';
import { useDeleteDocument } from '../api/queries';
import { paths } from '../lib/paths';
import { ConfirmDialog } from '../ui/primitives';
import { formatBytes } from './common';
import { PatientStatus, patientStatusLabel } from './listing';

export const NON_DELETABLE_KINDS = new Set<DocumentKind>(['invoice', 'receipt', 'invitation_letter']);
export const canDeleteDocument = (d: DocumentOut) => !NON_DELETABLE_KINDS.has(d.kind) && d.status !== 'verified';

const REPORT_KINDS: readonly string[] = REPORT_DOCUMENT_KINDS;
export const isReportKind = (kind: string) => REPORT_KINDS.includes(kind);

/** AI reading state used for filtering (the cell itself renders the live shared control). */
export const AI_READING = ['not_read', 'reading', 'review', 'confirmed', 'failed'] as const;
export type AiReading = (typeof AI_READING)[number];
export const AI_READING_LABELS: Record<AiReading, string> = {
  not_read: 'Not read yet',
  reading: 'Reading…',
  review: 'Ready for your check',
  confirmed: 'Confirmed',
  failed: 'Could not read',
};
export const AI_READING_TONES = { not_read: 'neutral', reading: 'info', review: 'warning', confirmed: 'success', failed: 'danger' } as const;

function readingOf(a: DocumentAnalysisOut | undefined): AiReading {
  if (!a || a.review_status === 'rejected') return 'not_read';
  if (a.status === 'queued' || a.status === 'processing') return 'reading';
  if (a.status === 'failed' || a.status === 'unsupported') return 'failed';
  return a.review_status === 'confirmed' ? 'confirmed' : 'review';
}

/** documentId -> AI reading state (latest analysis that includes the document). Non-report kinds are absent. */
export function useAiReadings(documents: readonly DocumentOut[] | undefined): Map<Uuid, AiReading> {
  const analyses = useDocumentAnalyses({ page: 1, page_size: 100 }, { enabled: !!documents?.some((d) => isReportKind(d.kind)) });
  return useMemo(() => {
    const latest = new Map<Uuid, DocumentAnalysisOut>();
    for (const a of [...(analyses.data?.items ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
      for (const id of a.document_ids) latest.set(id, a);
    }
    const out = new Map<Uuid, AiReading>();
    for (const d of documents ?? []) if (isReportKind(d.kind)) out.set(d.id, readingOf(latest.get(d.id)));
    return out;
  }, [analyses.data, documents]);
}

export const documentTypeLabel = (kind: string) => DOCUMENT_KIND_LABELS[kind as DocumentKind] ?? kind;

function FileCell({ doc }: { doc: DocumentOut }) {
  const Icon = doc.content_type.startsWith('image/') ? FileImage : FileText;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink" aria-hidden>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg" title={doc.file_name}>
          {doc.file_name}
        </span>
        <span className="block truncate text-xs text-muted">
          {formatBytes(doc.size_bytes)}
          {doc.uploaded_by_name ? ` · by ${doc.uploaded_by_name}` : ''}
        </span>
      </span>
    </span>
  );
}

/** Download + delete buttons and the delete confirmation (one dialog for the whole table). */
export function useDocumentActions() {
  const remove = useDeleteDocument();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DocumentOut | null>(null);

  async function download(doc: DocumentOut) {
    setDownloading(doc.id);
    try {
      await documentsApi.downloadAndSave(doc);
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed.'));
    } finally {
      setDownloading(null);
    }
  }

  const renderActions = (doc: DocumentOut) => (
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        loading={downloading === doc.id}
        onClick={() => void download(doc)}
        aria-label={`Download ${doc.file_name}`}
        title="Download"
      >
        <Download className="size-4" aria-hidden />
      </Button>
      {canDeleteDocument(doc) ? (
        <Button variant="ghost" size="icon-sm" onClick={() => setConfirm(doc)} aria-label={`Delete ${doc.file_name}`} title="Delete">
          <Trash2 className="size-4 text-danger" aria-hidden />
        </Button>
      ) : null}
    </span>
  );

  const dialog = (
    <ConfirmDialog
      open={!!confirm}
      onClose={() => setConfirm(null)}
      title="Delete document?"
      confirmLabel="Delete"
      tone="danger"
      loading={remove.isPending}
      onConfirm={() => {
        if (!confirm) return;
        remove.mutate(confirm.id, {
          onSuccess: () => {
            toast.success('Document deleted');
            setConfirm(null);
          },
          onError: (err) => toast.error(errorMessage(err)),
        });
      }}
    >
      {confirm ? `"${confirm.file_name}" will be removed. Hospitals linked to your cases will no longer see it.` : null}
    </ConfirmDialog>
  );

  return { renderActions, dialog };
}

export function documentColumns({
  renderActions,
  readings,
  caseNumbers,
}: {
  renderActions: (doc: DocumentOut) => ReactNode;
  readings: Map<Uuid, AiReading>;
  /** case id -> case number; omit to hide the Case column (case detail) */
  caseNumbers?: Map<Uuid, string>;
}): DataTableColumn<DocumentOut>[] {
  const cols: DataTableColumn<DocumentOut>[] = [
    {
      key: 'file_name',
      header: 'File',
      sticky: true,
      sortable: true,
      mobile: 'primary',
      className: 'max-w-72',
      cell: (d) => <FileCell doc={d} />,
      mobileCell: (d) => <span className="block truncate font-semibold">{d.file_name}</span>,
      exportValue: (d) => d.file_name,
    },
    {
      key: 'kind',
      header: 'Type',
      sortable: true,
      sortValue: (d) => documentTypeLabel(d.kind),
      cell: (d) => <span className="whitespace-nowrap">{documentTypeLabel(d.kind)}</span>,
      exportValue: (d) => documentTypeLabel(d.kind),
    },
  ];
  if (caseNumbers) {
    cols.push({
      key: 'case',
      header: 'Case',
      sortable: true,
      sortValue: (d) => (d.case_id ? (caseNumbers.get(d.case_id) ?? '') : ''),
      cell: (d) =>
        d.case_id ? (
          <Link to={paths.case(d.case_id)} className="font-mono text-xs font-medium text-primary-ink hover:underline">
            {caseNumbers.get(d.case_id) ?? 'View case'}
          </Link>
        ) : (
          <span className="text-xs text-muted">Personal file</span>
        ),
      exportValue: (d) => (d.case_id ? (caseNumbers.get(d.case_id) ?? d.case_id) : ''),
    });
  }
  cols.push(
    {
      key: 'created_at',
      header: 'Uploaded',
      sortable: true,
      sortDescFirst: true,
      cell: (d) => <DateCell value={d.created_at} display="date" />,
      exportValue: (d) => d.created_at,
    },
    {
      key: 'status',
      header: 'Checked by team',
      sortable: true,
      mobile: 'badge',
      cell: (d) => <PatientStatus status={d.status} kind="document" />,
      exportValue: (d) => patientStatusLabel(d.status, 'document') ?? d.status,
    },
    {
      key: 'ai',
      header: 'AI reading',
      sortable: true,
      sortValue: (d) => {
        const r = readings.get(d.id);
        return r ? AI_READING.indexOf(r) : null;
      },
      cell: (d) =>
        isReportKind(d.kind) ? <DocumentAiStatus document={d} audience="patient" /> : <span className="text-xs text-muted">Not needed</span>,
      exportValue: (d) => {
        const r = readings.get(d.id);
        return r ? AI_READING_LABELS[r] : '';
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      align: 'end',
      hideable: false,
      exportable: false,
      mobile: 'meta',
      cell: renderActions,
    },
  );
  return cols;
}
