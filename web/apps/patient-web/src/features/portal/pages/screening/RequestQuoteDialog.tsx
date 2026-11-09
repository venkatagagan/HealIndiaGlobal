import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { authApi, errorMessage, isApiError, type MatchOut, type ScreeningOut } from '@hig/shared/api';
import { useCreateCase } from '../../api/queries';
import { GuestAccountRequired, isGuestUpgradeError, useGuestGate } from '../../components/CareGates';
import { paths } from '../../lib/paths';
import { Alert, Button, Checkbox, Field, Modal, Textarea } from '../../ui/primitives';

export const SHARE_CONSENT_VERSION = '2026-10';

const schema = z.object({
  patient_notes: z.string().max(4000, 'Please keep your note under 4000 characters'),
  consent_share: z.boolean().refine((v) => v, 'You need to agree before we can send your case to the hospital'),
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
      toast.success(`Quote requested from ${match.hospital.name}. Case ${created.case_number} created.`);
      form.reset();
      onClose();
      navigate(paths.case(created.id));
    } catch (err) {
      if (isGuestUpgradeError(err) || (isApiError(err) && err.status === 403)) {
        toast.error('Please create a full account before requesting quotes.');
        gate.handleError(err);
      } else {
        toast.error(errorMessage(err, 'Your request could not be sent.'));
      }
    }
  });

  return (
    <Modal
      open={!!match}
      onClose={onClose}
      title="Request a quote"
      description={
        match
          ? `${match.doctor ? `${match.doctor.full_name} · ` : ''}${match.hospital.name}, ${match.hospital.city}`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="request-quote-form" loading={isSubmitting} disabled={gate.isGuest}>
            Send request
          </Button>
        </>
      }
    >
      {gate.isGuest ? <GuestAccountRequired action="request a quote" /> : null}
      {gate.dialog}
      <form id="request-quote-form" onSubmit={onSubmit} className={gate.isGuest ? 'hidden' : 'space-y-4'} noValidate>
        <Alert tone="blue">
          The hospital reviews your screening and sends an itemized quote, usually within 48 hours. Requesting a quote is
          free and does not commit you to anything.
        </Alert>
        <Field
          label="Message for the hospital (optional)"
          htmlFor="rq-notes"
          error={errors.patient_notes?.message}
          hint="Preferred dates, questions, or anything the doctor should know."
        >
          <Textarea id="rq-notes" rows={4} maxLength={4000} {...form.register('patient_notes')} />
        </Field>
        <div>
          <Checkbox
            label="I agree to share my screening answers, AI summary and attached reports with this hospital"
            description="Required so the hospital's doctors can assess your case. You can request quotes from several hospitals."
            {...form.register('consent_share')}
          />
          {errors.consent_share ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {errors.consent_share.message}
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
