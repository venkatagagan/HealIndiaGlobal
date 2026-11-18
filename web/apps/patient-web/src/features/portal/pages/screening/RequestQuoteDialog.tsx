import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { authApi, errorMessage, isApiError, type MatchOut, type ScreeningOut } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useCreateCase } from '../../api/queries';
import { GuestAccountRequired, isGuestUpgradeError, useGuestGate } from '../../components/CareGates';
import { paths } from '../../lib/paths';
import { Alert, Button, Checkbox, Field, Modal, Textarea } from '../../ui/primitives';

export const SHARE_CONSENT_VERSION = '2026-10';

// Validation messages are catalog keys (namespace `patient`), translated when shown.
const schema = z.object({
  patient_notes: z.string().max(4000, 'screening.requestQuote.errors.noteTooLong'),
  consent_share: z.boolean().refine((v) => v, 'screening.requestQuote.errors.consentRequired'),
});
type Values = z.infer<typeof schema>;

export function RequestQuoteDialog({
  match,
  screening,
  onClose,
}: {
  match: MatchOut | null;
  screening: ScreeningOut;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const createCase = useCreateCase();
  const gate = useGuestGate();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { patient_notes: '', consent_share: false },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!match || gate.isGuest) return;
    try {
      await authApi.giveConsent({ kind: 'share_with_hospitals', version: SHARE_CONSENT_VERSION, granted: true });
      const specialtyId = match.doctor?.specialty.id ?? screening.specialty?.id;
      const created = await createCase.mutateAsync({
        hospital_id: match.hospital.id,
        ...(match.doctor ? { doctor_id: match.doctor.id } : {}),
        ...(match.procedure ? { procedure_id: match.procedure.id } : {}),
        ...(specialtyId ? { specialty_id: specialtyId } : {}),
        screening_id: screening.id,
        ...(values.patient_notes.trim() ? { patient_notes: values.patient_notes.trim() } : {}),
      });
      toast.success(t('screening.requestQuote.success', { hospital: match.hospital.name, caseNumber: created.case_number }));
      form.reset();
      onClose();
      navigate(paths.case(created.id));
    } catch (err) {
      if (isGuestUpgradeError(err) || (isApiError(err) && err.status === 403)) {
        toast.error(t('screening.requestQuote.guestError'));
        gate.handleError(err);
      } else {
        toast.error(errorMessage(err, t('screening.requestQuote.sendFailed')));
      }
    }
  });

  return (
    <Modal
      open={!!match}
      onClose={onClose}
      title={t('screening.requestQuote.title')}
      description={
        match
          ? `${match.doctor ? `${match.doctor.full_name} · ` : ''}${match.hospital.name}, ${match.hospital.city}`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('screening.requestQuote.cancel')}
          </Button>
          <Button type="submit" form="request-quote-form" loading={isSubmitting} disabled={gate.isGuest}>
            {t('screening.requestQuote.send')}
          </Button>
        </>
      }
    >
      {gate.isGuest ? <GuestAccountRequired action={t('screening.requestQuote.guestAction')} /> : null}
      {gate.dialog}
      <form id="request-quote-form" onSubmit={onSubmit} className={gate.isGuest ? 'hidden' : 'space-y-4'} noValidate>
        <Alert tone="blue">{t('screening.requestQuote.info')}</Alert>
        <Field
          label={t('screening.requestQuote.messageLabel')}
          htmlFor="rq-notes"
          error={errors.patient_notes?.message ? t(errors.patient_notes.message) : undefined}
          hint={t('screening.requestQuote.messageHint')}
        >
          <Textarea id="rq-notes" rows={4} maxLength={4000} {...form.register('patient_notes')} />
        </Field>
        <div>
          <Checkbox
            label={t('screening.requestQuote.consentLabel')}
            description={t('screening.requestQuote.consentHint')}
            {...form.register('consent_share')}
          />
          {errors.consent_share?.message ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {t(errors.consent_share.message)}
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
