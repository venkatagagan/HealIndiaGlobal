/**
 * React Query hooks for discharge summaries (view, share with the home doctor, medication reminders) and the
 * WhatsApp updates opt-in.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dischargeApi,
  whatsappApi,
  type DischargeShareIn,
  type DischargeSummaryListParams,
  type MedicationRemindersIn,
  type Uuid,
  type WhatsAppStatusOut,
} from '@hig/shared/api';

export const dk = {
  list: (params?: DischargeSummaryListParams) => ['discharge-summaries', 'list', params ?? {}] as const,
  detail: (id: Uuid) => ['discharge-summaries', 'detail', id] as const,
  shares: (id: Uuid) => ['discharge-summaries', 'shares', id] as const,
  reminders: (id: Uuid) => ['discharge-summaries', 'reminders', id] as const,
  whatsapp: ['whatsapp', 'me'] as const,
};

// ---------------------------------------------------------------------------------------------------------
// Discharge summaries
// ---------------------------------------------------------------------------------------------------------
export function useDischargeSummaries(params?: DischargeSummaryListParams, enabled = true) {
  return useQuery({ queryKey: dk.list(params), queryFn: () => dischargeApi.list(params), enabled });
}

export function useDischargeSummary(id: Uuid | undefined) {
  return useQuery({ queryKey: dk.detail(id ?? ''), queryFn: () => dischargeApi.get(id as Uuid), enabled: !!id });
}

export function useDischargeShares(id: Uuid | undefined, enabled = true) {
  return useQuery({ queryKey: dk.shares(id ?? ''), queryFn: () => dischargeApi.shares(id as Uuid), enabled: !!id && enabled });
}

export function useCreateDischargeShare(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DischargeShareIn) => dischargeApi.createShare(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.shares(id) }),
  });
}

export function useRevokeDischargeShare(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: Uuid) => dischargeApi.revokeShare(id, shareId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: dk.shares(id) }),
  });
}

export function useMedicationReminders(id: Uuid | undefined, enabled = true) {
  return useQuery({ queryKey: dk.reminders(id ?? ''), queryFn: () => dischargeApi.reminders(id as Uuid), enabled: !!id && enabled });
}

export function useSetMedicationReminders(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MedicationRemindersIn) => dischargeApi.setReminders(id, body),
    onSuccess: (rows) => qc.setQueryData(dk.reminders(id), rows),
  });
}

// ---------------------------------------------------------------------------------------------------------
// WhatsApp updates
// ---------------------------------------------------------------------------------------------------------
export function useWhatsAppStatus(enabled = true) {
  return useQuery({ queryKey: dk.whatsapp, queryFn: whatsappApi.status, enabled });
}

function useWhatsAppMutation<T>(fn: (vars: T) => Promise<WhatsAppStatusOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (status) => qc.setQueryData(dk.whatsapp, status),
  });
}

export const useWhatsAppVerify = () => useWhatsAppMutation((phone: string) => whatsappApi.verify(phone));
export const useWhatsAppConfirm = () => useWhatsAppMutation((code: string) => whatsappApi.confirm(code));
export const useWhatsAppOptOut = () => useWhatsAppMutation<void>(() => whatsappApi.optOut());
