/**
 * `@hig/shared/docai` - document intelligence (PLAN 7.1): capture reports (files / camera photos), AI reading,
 * mandatory review -> edit -> confirm, and read-only confirmed views. See ./README.md for mounting instructions.
 */
export * from './types';
export { docaiApi, docaiKeys } from './api';
export {
  DOCAI_POLL_MS,
  isAnalysisPending,
  useAnalysisForDocument,
  useConfirmAnalysis,
  useDocumentAnalyses,
  useDocumentAnalysis,
  useRejectAnalysis,
  useRetryAnalysis,
  useUpdateAnalysis,
} from './hooks';
export {
  DOCAI_ACCEPT,
  DOCAI_JPEG_QUALITY,
  DOCAI_MAX_LONG_EDGE,
  DOCAI_MAX_PAGES,
  DOCAI_MAX_UPLOAD_MB,
  downscaleImage,
} from './image';
export { cleanEditable, draftFromAnalysis, editMarkers, hasCriticalValues, normalizeEditable, type EditMarkers } from './model';
export { useDocaiText, createTextHook, type DocaiTextKey } from './i18n';
export { DocumentCapture, type DocumentCaptureProps } from './DocumentCapture';
export { DocumentAnalysisReview, type DocumentAnalysisReviewProps } from './DocumentAnalysisReview';
export { DocumentAnalysisCard, type DocumentAnalysisCardProps } from './DocumentAnalysisCard';
export {
  ConfirmedAnalysesList,
  DocumentAiStatus,
  ReportAiPanel,
  type ConfirmedAnalysesListProps,
  type DocumentAiStatusProps,
  type ReportAiPanelProps,
} from './ReportAiPanel';
