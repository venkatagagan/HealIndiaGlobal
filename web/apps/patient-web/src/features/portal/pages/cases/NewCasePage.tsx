import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authApi, catalogApi, errorMessage, isApiError } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { qk, useCreateCase, useHospital, useScreenings } from '../../api/queries';
import { GuestAccountRequired, isGuestUpgradeError, useGuestGate } from '../../components/CareGates';
import { Accreditations, Avatar, BackLink, Rating } from '../../components/common';
import { paths } from '../../lib/paths';
import { formatDate, useDocumentTitle } from '../../lib/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../ui/primitives';
import { SHARE_CONSENT_VERSION } from '../screening/RequestQuoteDialog';

type TFn = ReturnType<typeof useAppTranslation>['t'];

function buildSchema(t: TFn) {
  return z.object({
    screening_id: z.string(),
    patient_notes: z.string().max(4000),
    consent_share: z.boolean().refine((v) => v, t('cases.new.consentRequired')),
  });
}
type Values = z.infer<ReturnType<typeof buildSchema>>;

/** /app/cases/new?doctor=&hospital=&procedure= - direct quote request from the public doctor/hospital pages. */
export function NewCasePage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('cases.new.title'));
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const doctorId = params.get('doctor') ?? undefined;
  const hospitalParam = params.get('hospital') ?? undefined;
  const procedureId = params.get('procedure') ?? undefined;

  const doctor = useQuery({
    queryKey: qk.doctor(doctorId ?? ''),
    queryFn: () => catalogApi.getDoctor(doctorId as string),
    enabled: !!doctorId,
  });
  const hospitalKey = hospitalParam ?? doctor.data?.hospital.id;
  const hospital = useHospital(hospitalKey);
  const screenings = useScreenings({ status: 'completed', page_size: 20 });
  const create = useCreateCase();
  const gate = useGuestGate();
  const schema = useMemo(() => buildSchema(t), [t]);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { screening_id: '', patient_notes: '', consent_share: false },
  });
  const { errors, isSubmitting } = form.formState;

  if (!doctorId && !hospitalParam) {
    return (
      <EmptyState
        title={t('cases.new.chooseFirstTitle')}
        description={t('cases.new.chooseFirstDescription')}
        action={<ButtonLink to={paths.newScreening()}>{t('cases.new.startScreening')}</ButtonLink>}
      />
    );
  }
  if (doctor.isError) return <ErrorState error={doctor.error} onRetry={() => void doctor.refetch()} />;
  if (hospital.isError) return <ErrorState error={hospital.error} onRetry={() => void hospital.refetch()} />;
  if ((doctorId && doctor.isPending) || hospital.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const h = hospital.data;
  const d = doctor.data ?? null;
  const procedure = procedureId
    ? (h.procedures.find((p) => p.procedure.id === procedureId)?.procedure ??
      d?.procedures.find((p) => p.procedure.id === procedureId)?.procedure ??
      null)
    : null;

  const onSubmit = form.handleSubmit(async (v) => {
    if (gate.requireAccount()) return;
    try {
      await authApi.giveConsent({ kind: 'share_with_hospitals', version: SHARE_CONSENT_VERSION, granted: true });
      const created = await create.mutateAsync({
        hospital_id: h.id,
        ...(d ? { doctor_id: d.id, specialty_id: d.specialty.id } : {}),
        ...(procedure ? { procedure_id: procedure.id } : {}),
        ...(v.screening_id ? { screening_id: v.screening_id } : {}),
        ...(v.patient_notes.trim() ? { patient_notes: v.patient_notes.trim() } : {}),
      });
      toast.success(t('cases.new.requested', { number: created.case_number }));
      navigate(paths.case(created.id), { replace: true });
    } catch (err) {
      if (isGuestUpgradeError(err)) gate.handleError(err);
      else if (isApiError(err) && err.status === 403) toast.error(t('cases.new.fullAccountRequired'));
      else toast.error(errorMessage(err, t('cases.new.sendFailed')));
    }
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={<BackLink to={paths.cases}>{t('cases.list.title')}</BackLink>} title={t('cases.new.title')} />
      <Card className="mb-6 flex items-center gap-4 p-5">
        <Avatar name={d?.full_name ?? h.name} src={d?.photo_url ?? h.logo_url} size={56} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{d?.full_name ?? h.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {d ? `${d.specialty.name} · ` : ''}
            {h.name}, {h.city}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Accreditations values={h.accreditations} />
            <Rating value={d?.rating_avg ?? h.rating_avg} count={d?.rating_count ?? h.rating_count} />
          </div>
          {procedure ? <p className="mt-1 text-sm font-medium">{procedure.name}</p> : null}
        </div>
      </Card>
      <Card>
        <CardBody>
          {gate.isGuest ? <GuestAccountRequired action={t('cases.new.guestAction')} /> : null}
          {gate.dialog}
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <Alert tone="blue">{t('cases.new.intro')}</Alert>
            <Field label={t('cases.new.screeningLabel')} htmlFor="nc-screening" hint={t('cases.new.screeningHint')}>
              <Select id="nc-screening" {...form.register('screening_id')} disabled={screenings.isPending}>
                <option value="">{t('cases.new.noScreening')}</option>
                {(screenings.data?.items ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.specialty?.name ?? t('cases.new.generalScreening')} · {formatDate(s.completed_at ?? s.created_at)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t('cases.new.notesLabel')}
              htmlFor="nc-notes"
              error={errors.patient_notes?.message}
              hint={t('cases.new.notesHint')}
            >
              <Textarea id="nc-notes" rows={5} maxLength={4000} {...form.register('patient_notes')} />
            </Field>
            <div>
              <Checkbox
                label={t('cases.new.consentLabel')}
                description={t('cases.new.consentDescription')}
                {...form.register('consent_share')}
              />
              {errors.consent_share ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {errors.consent_share.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <ButtonLink to={paths.newScreening(d?.specialty.slug)} variant="outline">
                {t('cases.new.screeningFirst')}
              </ButtonLink>
              <Button type="submit" loading={isSubmitting}>
                {t('cases.new.send')}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
