import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import type { Uuid } from '../api/types';
import { docaiApi, docaiKeys } from './api';
import type {
  DocumentAnalysisConfirmIn,
  DocumentAnalysisListParams,
  DocumentAnalysisOut,
  DocumentAnalysisPatchIn,
  DocumentAnalysisStatus,
} from './types';

export const DOCAI_POLL_MS = 2500;

export function isAnalysisPending(status: DocumentAnalysisStatus | null | undefined): boolean {
  return status === 'queued' || status === 'processing';
}

/** One analysis; polls every 2.5 s while it is queued/processing. */
export function useDocumentAnalysis(id: Uuid | null | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: docaiKeys.detail(id ?? ''),
    queryFn: () => docaiApi.get(id as Uuid),
    enabled: !!id && (options.enabled ?? true),
    refetchInterval: (query) => (isAnalysisPending(query.state.data?.status) ? DOCAI_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
}

/** Paged list (patient / case / status filters); polls while any item is pending. */
export function useDocumentAnalyses(params?: DocumentAnalysisListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: docaiKeys.list(params),
    queryFn: () => docaiApi.list(params),
    enabled: options.enabled ?? true,
    refetchInterval: (query) =>
      query.state.data?.items.some((a) => isAnalysisPending(a.status)) ? DOCAI_POLL_MS : false,
  });
}

/** Latest analysis that contains this document page, or `null` when there is none (404). */
export function useAnalysisForDocument(documentId: Uuid | null | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: docaiKeys.forDocument(documentId ?? ''),
    queryFn: async (): Promise<DocumentAnalysisOut | null> => {
      try {
        return await docaiApi.forDocument(documentId as Uuid);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!documentId && (options.enabled ?? true),
    retry: false,
    refetchInterval: (query) => (isAnalysisPending(query.state.data?.status) ? DOCAI_POLL_MS : false),
  });
}

function useStore() {
  const qc = useQueryClient();
  return (analysis: DocumentAnalysisOut) => {
    qc.setQueryData(docaiKeys.detail(analysis.id), analysis);
    void qc.invalidateQueries({ queryKey: ['docai', 'list'] });
    void qc.invalidateQueries({ queryKey: ['docai', 'document'] });
  };
}

export function useRetryAnalysis() {
  const store = useStore();
  return useMutation({ mutationFn: (id: Uuid) => docaiApi.retry(id), onSuccess: store });
}

export function useUpdateAnalysis() {
  const store = useStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: Uuid; data: DocumentAnalysisPatchIn }) => docaiApi.update(id, data),
    onSuccess: store,
  });
}

export function useConfirmAnalysis() {
  const store = useStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: Uuid; data: DocumentAnalysisConfirmIn }) => docaiApi.confirm(id, data),
    onSuccess: store,
  });
}

export function useRejectAnalysis() {
  const store = useStore();
  return useMutation({ mutationFn: (id: Uuid) => docaiApi.reject(id), onSuccess: store });
}
