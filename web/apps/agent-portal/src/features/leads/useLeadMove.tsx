import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { crmApi, errorMessage, isApiError, type LeadOut, type LeadStatus } from '@hig/shared/api';
import { ConfirmDialog } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { invalidateLeads } from './leadMeta';

/**
 * Moving a lead to another stage (board drag-and-drop, the "Move to" menu, the detail page):
 * "lost" asks for a reason, "won" only happens through "Convert to patient" (opens the lead's convert form).
 */
export function useLeadMove(): { move: (lead: LeadOut, to: LeadStatus) => void; pending: boolean; dialog: ReactNode } {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [losing, setLosing] = useState<LeadOut | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: Exclude<LeadStatus, 'won'>; reason?: string }) =>
      crmApi.update(id, status === 'lost' ? { status, lost_reason: reason ?? '' } : { status }),
    onSuccess: (lead) => {
      invalidateLeads(qc);
      toast.success(t('crm.move.moved', { name: lead.full_name, status: t(`crm.status.${lead.status}`) }));
      setLosing(null);
    },
    onError: (error) => {
      const code = isApiError(error) ? error.code : null;
      if (code === 'lead_converted') toast.error(t('crm.move.converted'));
      else if (code === 'lost_reason_required') toast.error(t('crm.move.reasonRequired'));
      else if (code === 'lead_convert_required') toast.error(t('crm.move.convertRequired'));
      else toast.error(errorMessage(error, t('crm.move.failed')));
      invalidateLeads(qc);
    },
  });

  function move(lead: LeadOut, to: LeadStatus) {
    if (to === lead.status) return;
    if (lead.converted_patient_id || lead.status === 'won') {
      toast.error(t('crm.move.converted'));
      return;
    }
    if (to === 'won') {
      toast.info(t('crm.move.convertRequired'));
      navigate(`/leads/${lead.id}?convert=1`);
      return;
    }
    if (to === 'lost') {
      setLosing(lead);
      return;
    }
    mutation.mutate({ id: lead.id, status: to });
  }

  const dialog = (
    <ConfirmDialog
      open={losing !== null}
      onClose={() => setLosing(null)}
      onConfirm={(reason) => losing && mutation.mutate({ id: losing.id, status: 'lost', reason: reason.trim() })}
      title={t('crm.move.lostTitle')}
      description={losing ? t('crm.move.lostDescription', { name: losing.full_name }) : undefined}
      confirmLabel={t('crm.move.lostConfirm')}
      tone="danger"
      loading={mutation.isPending}
      reason={{ label: t('crm.move.lostReason'), required: true, placeholder: t('crm.move.lostPlaceholder') }}
    />
  );

  return { move, pending: mutation.isPending, dialog };
}
