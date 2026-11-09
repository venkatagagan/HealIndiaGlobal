import { useState } from 'react';
import { CheckCircle2, Clock, FileSearch, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import type { DocumentOut, Uuid } from '../api/types';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { Modal } from '../ui/overlay';
import { docaiApi } from './api';
import { DocumentAnalysisCard } from './DocumentAnalysisCard';
import { DocumentAnalysisReview } from './DocumentAnalysisReview';
import { DocumentCapture, type DocumentCaptureProps } from './DocumentCapture';
import { isAnalysisPending, useAnalysisForDocument, useDocumentAnalyses } from './hooks';
import { useDocaiText } from './i18n';
import { Pill } from './parts';
import type { AnalysisAudience, DocumentAnalysisOut } from './types';

export interface ReportAiPanelProps extends Omit<DocumentCaptureProps, 'onAnalysisCreated'> {
  audience?: AnalysisAudience;
  /** list existing analyses of this patient / case below the capture (default true) */
  showExisting?: boolean;
  /** which existing analyses to list: `pending` = still processing or waiting for review (default), `all` = also confirmed */
  existing?: 'pending' | 'all';
  onAnalysisCreated?: (analysis: DocumentAnalysisOut) => void;
  onConfirmed?: (analysis: DocumentAnalysisOut) => void;
}

/**
 * Capture + review in one block: upload/photograph a report, then review -> edit -> confirm every AI reading of the
 * patient (or case). Drop-in for patient documents, screening step 3, case detail and the agent's patient documents.
 */
export function ReportAiPanel({
  audience = 'patient',
  showExisting = true,
  existing: existingMode = 'pending',
  onAnalysisCreated,
  onConfirmed,
  className,
  ...captureProps
}: ReportAiPanelProps) {
  const { t } = useDocaiText();
  const [created, setCreated] = useState<Uuid[]>([]);
  const list = useDocumentAnalyses(
    { patient_id: captureProps.patientId, case_id: captureProps.caseId, page_size: 50 },
    { enabled: showExisting },
  );
  const existing = (list.data?.items ?? []).filter(
    (a) =>
      a.review_status !== 'rejected' &&
      (existingMode === 'all' || isAnalysisPending(a.status) || (a.status === 'completed' && a.review_status !== 'confirmed')),
  );
  const ids = Array.from(new Set([...created, ...existing.map((a) => a.id)]));

  return (
    <div className={cn('space-y-4', className)}>
      <DocumentCapture
        {...captureProps}
        onAnalysisCreated={(analysis) => {
          setCreated((prev) => [analysis.id, ...prev.filter((id) => id !== analysis.id)]);
          onAnalysisCreated?.(analysis);
        }}
      />
      {ids.length > 0 && (
        <div className="space-y-3">
          {ids.map((id) => (
            <DocumentAnalysisReview key={id} analysisId={id} audience={audience} onConfirmed={onConfirmed} />
          ))}
        </div>
      )}
      {showExisting && existingMode === 'all' && list.isSuccess && ids.length === 0 && (
        <p className="text-sm text-muted">{t('noAnalyses')}</p>
      )}
    </div>
  );
}

export interface ConfirmedAnalysesListProps {
  patientId?: Uuid;
  caseId?: Uuid;
  audience?: AnalysisAudience;
  /** shown when there is no confirmed analysis (default: hidden) */
  emptyText?: string;
  className?: string;
}

/** Read-only list of CONFIRMED analyses (hospital case detail, agent/admin views). Unconfirmed drafts are never shown. */
export function ConfirmedAnalysesList({ patientId, caseId, audience = 'clinical', emptyText, className }: ConfirmedAnalysesListProps) {
  const list = useDocumentAnalyses({ patient_id: patientId, case_id: caseId, page_size: 50 });
  const confirmed = (list.data?.items ?? []).filter((a) => a.review_status === 'confirmed' && a.confirmed_data);
  if (list.isLoading) return <div className={cn('h-16 animate-pulse rounded-xl bg-surface-2', className)} />;
  if (list.isError) return null; // endpoint unavailable / not permitted: hide quietly
  if (!confirmed.length) return emptyText ? <p className={cn('text-sm text-muted', className)}>{emptyText}</p> : null;
  return (
    <div className={cn('space-y-3', className)}>
      {confirmed.map((a) => (
        <DocumentAnalysisCard key={a.id} analysis={a} audience={audience} />
      ))}
    </div>
  );
}

export interface DocumentAiStatusProps {
  document: Pick<DocumentOut, 'id' | 'file_name' | 'case_id'>;
  audience?: AnalysisAudience;
  /** allow starting a new AI reading of this single document (default true) */
  allowAnalyze?: boolean;
}

/**
 * Compact per-document control for document lists: shows the AI reading status of a document and opens the review
 * (or the confirmed card) in a dialog; offers "Read with AI" (with consent) when the document has no reading yet.
 */
export function DocumentAiStatus({ document, audience = 'patient', allowAnalyze = true }: DocumentAiStatusProps) {
  const { t } = useDocaiText();
  const qc = useQueryClient();
  const query = useAnalysisForDocument(document.id);
  const [open, setOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const analysis = query.data;

  async function start() {
    setStarting(true);
    try {
      await docaiApi.create({ document_ids: [document.id], case_id: document.case_id ?? undefined, consent_ai: true });
      await qc.invalidateQueries({ queryKey: ['docai'] });
      setConsentOpen(false);
      setOpen(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }

  if (query.isLoading) return null;
  if (!analysis || analysis.review_status === 'rejected') {
    if (!allowAnalyze || query.isError) return null;
    return (
      <>
        <Button variant="ghost" size="xs" leftIcon={<Sparkles className="size-3.5" aria-hidden />} onClick={() => setConsentOpen(true)}>
          {t('readWithAiShort')}
        </Button>
        <Modal
          open={consentOpen}
          onClose={() => setConsentOpen(false)}
          title={t('readWithAi')}
          description={document.file_name}
          footer={
            <>
              <Button variant="outline" onClick={() => setConsentOpen(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={() => void start()} loading={starting} disabled={!consent}>
                {t('readWithAi')}
              </Button>
            </>
          }
        >
          <label className="flex items-start gap-3 text-sm text-fg">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
            <span>{t('consentAi')}</span>
          </label>
        </Modal>
      </>
    );
  }

  const pending = isAnalysisPending(analysis.status);
  const label = pending
    ? t('processingTitle')
    : analysis.review_status === 'confirmed'
      ? t('confirmed')
      : analysis.status === 'completed'
        ? t('pendingReview')
        : analysis.status === 'failed'
          ? t('failedTitle')
          : t('unsupportedTitle');
  const tone = analysis.review_status === 'confirmed'
    ? 'bg-success-soft text-success-ink'
    : analysis.status === 'completed'
      ? 'bg-warning-soft text-warning-ink'
      : pending
        ? 'bg-info-soft text-info-ink'
        : 'bg-neutral-soft text-neutral-ink';
  const Icon = analysis.review_status === 'confirmed' ? CheckCircle2 : pending ? Clock : FileSearch;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={t('analysisFor')}
      >
        <Pill className={tone}>
          <Icon className="size-3.5" aria-hidden />
          <span className="max-w-[12rem] truncate">{label}</span>
        </Pill>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('analysisFor')} description={document.file_name} size="lg">
        <DocumentAnalysisReview analysisId={analysis.id} audience={audience} className="border-0 p-0 shadow-none sm:p-0" />
      </Modal>
    </>
  );
}
