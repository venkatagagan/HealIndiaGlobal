/**
 * /app/consultations/book?doctor=&hospital=&screening= - book a pre-travel video consultation: doctor (only
 * doctors offering tele-consultations), preferred slot from the doctor's consultation availability, question and
 * reports, consent to share with the hospital, then pay the fee (if any) on the next page.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { Video } from 'lucide-react';
import { errorMessage, isApiError, isFxRateUnavailable, type DoctorDetail, type Uuid } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useBookConsultation, useDoctorSlots } from '../../api/consultations';
import { useDoctorDetail, useDoctorList } from '../../api/phase1';
import { useDocuments, useScreenings } from '../../api/queries';
import { AvailabilityCalendar } from '../../components/AvailabilityCalendar';
import { GuestAccountRequired, isGuestUpgradeError, useGuestGate } from '../../components/CareGates';
import { Avatar, BackLink, Rating, UploadButton } from '../../components/common';
import { ApproxMoney, RegistrationVerified } from '../../components/phase1';
import { paths } from '../../lib/paths';
import { formatDate, formatTime, useDocumentTitle } from '../../lib/shared';
import { useViewerCurrency } from '../../lib/viewer';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../ui/primitives';

type TFn = ReturnType<typeof useAppTranslation>['t'];

/** Preferred call times offered, in India time (the hospital confirms the exact time). */
const IST_TIMES = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const MEDICAL_KINDS = new Set(['medical_report', 'prescription', 'lab_result', 'imaging', 'other']);
const MAX_QUESTION = 4000;

/** Translated message for the consultation/case request errors. */
export function consultationErrorMessage(t: TFn, err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case 'consultation_exists':
        return t('consult.errors.exists');
      case 'teleconsult_unavailable':
        return t('consult.errors.teleconsultUnavailable');
      case 'doctor_required':
      case 'invalid_doctor':
        return t('consult.errors.invalidDoctor');
      case 'invalid_state':
        return t('consult.errors.caseClosed');
      default:
        break;
    }
    if (err.status === 403) return t('cases.new.fullAccountRequired');
  }
  if (isFxRateUnavailable(err)) return t('pay.errors.fxUnavailable');
  return errorMessage(err, t('consult.errors.failed'));
}

export function BookConsultationPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('consult.book.title'));
  const [params] = useSearchParams();
  const doctorParam = params.get('doctor') ?? undefined;
  const hospitalParam = params.get('hospital') ?? undefined;
  const screeningParam = params.get('screening') ?? '';
  const [chosenDoctor, setChosenDoctor] = useState<Uuid | undefined>(doctorParam);
  const currency = useViewerCurrency();
  const doctor = useDoctorDetail(chosenDoctor, currency);
  const doctors = useDoctorList({ hospital_id: hospitalParam, page_size: 50 }, !!hospitalParam && !doctorParam);
  const teleDoctors = (doctors.data?.items ?? []).filter((d) => d.teleconsult_available);

  if (!doctorParam && !hospitalParam) {
    return (
      <EmptyState
        title={t('consult.book.chooseDoctorTitle')}
        description={t('consult.book.chooseDoctorText')}
        action={<ButtonLink to={paths.browse({ tab: 'doctors' })}>{t('consult.book.browseDoctors')}</ButtonLink>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={<BackLink to={paths.consultations}>{t('consult.list.title')}</BackLink>}
        title={t('consult.book.title')}
        description={t('consult.book.description')}
      />
      {!doctorParam ? (
        <Card className="mb-6">
          <CardHeader title={t('consult.book.doctorStep')} />
          <CardBody>
            {doctors.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : doctors.isError ? (
              <ErrorState error={doctors.error} onRetry={() => void doctors.refetch()} />
            ) : teleDoctors.length === 0 ? (
              <p className="text-sm text-muted">{t('consult.book.noTeleDoctors')}</p>
            ) : (
              <Field label={t('consult.book.doctorLabel')} htmlFor="bc-doctor">
                <Select id="bc-doctor" value={chosenDoctor ?? ''} onChange={(e) => setChosenDoctor(e.target.value || undefined)}>
                  <option value="">{t('consult.book.doctorPlaceholder')}</option>
                  {teleDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} · {d.specialty.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </CardBody>
        </Card>
      ) : null}
      {chosenDoctor ? (
        doctor.isError ? (
          <ErrorState error={doctor.error} onRetry={() => void doctor.refetch()} />
        ) : doctor.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <BookForm key={doctor.data.id} doctor={doctor.data} screeningId={screeningParam} />
        )
      ) : null}
    </div>
  );
}

function BookForm({ doctor, screeningId: initialScreening }: { doctor: DoctorDetail; screeningId: string }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const gate = useGuestGate();
  const book = useBookConsultation();
  const screenings = useScreenings({ status: 'completed', page_size: 20 });
  const documents = useDocuments();
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const range = { from: format(startOfMonth(month), 'yyyy-MM-dd'), to: format(endOfMonth(month), 'yyyy-MM-dd') };
  const slots = useDoctorSlots(doctor.id, range);
  const available = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of slots.data ?? []) {
      if (d.slot_kind === 'consultation' && d.available > 0 && d.date >= format(today, 'yyyy-MM-dd')) map.set(d.date, d.available);
    }
    return map;
  }, [slots.data, today]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState(IST_TIMES[1] as string);
  const [screeningId, setScreeningId] = useState(initialScreening);
  const [question, setQuestion] = useState('');
  const [docIds, setDocIds] = useState<Uuid[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);

  const preferredAt = date ? `${date}T${time}:00+05:30` : null;
  const medicalDocs = (documents.data ?? []).filter((d) => MEDICAL_KINDS.has(d.kind));
  const fee = doctor.consultation_fee_minor ?? 0;

  if (!doctor.teleconsult_available) {
    return (
      <Alert tone="amber">
        {t('consult.errors.teleconsultUnavailable')}{' '}
        <ButtonLink to={paths.quickQuote({ hospitals: [doctor.hospital.id] })} variant="outline" size="sm">
          {t('doctor.requestQuote')}
        </ButtonLink>
      </Alert>
    );
  }

  async function submit() {
    if (gate.requireAccount()) return;
    if (!consent) {
      setConsentError(true);
      return;
    }
    try {
      const created = await book.mutateAsync({
        hospitalId: doctor.hospital.id,
        doctorId: doctor.id,
        specialtyId: doctor.specialty.id,
        ...(screeningId ? { screeningId } : {}),
        preferredAt,
        question: question.slice(0, MAX_QUESTION),
        documentIds: docIds,
      });
      toast.success(t('consult.book.requested'));
      navigate(created.fee_minor > 0 ? paths.payConsultation(created.id) : paths.consultation(created.id), { replace: true });
    } catch (err) {
      if (isGuestUpgradeError(err)) gate.handleError(err);
      else toast.error(consultationErrorMessage(t, err));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={doctor.full_name} src={doctor.photo_url} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{doctor.full_name}</p>
          <p className="text-sm text-muted">
            {doctor.specialty.name} · {doctor.hospital.name}, {doctor.hospital.city}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {doctor.registration_verified ? <RegistrationVerified /> : null}
            <Rating value={doctor.rating_avg} count={doctor.rating_count} />
            <span className="inline-flex items-center gap-1 text-sm text-primary-ink">
              <Video className="size-4" aria-hidden /> {t('doctor.teleconsult')}
            </span>
          </div>
        </div>
        <div className="text-start sm:text-end">
          <p className="text-xs text-muted">{t('doctor.fee')}</p>
          <p className="text-lg font-semibold">
            {fee > 0 ? (
              <ApproxMoney minor={fee} currency={doctor.currency} display={doctor.display_consultation_fee} className="sm:items-end" />
            ) : (
              t('consult.fee.free')
            )}
          </p>
        </div>
      </Card>

      {gate.isGuest ? <GuestAccountRequired action={t('consult.book.guestAction')} /> : null}
      {gate.dialog}

      <Card>
        <CardHeader title={t('consult.book.slotStep')} description={t('consult.book.slotHint')} />
        <CardBody className="grid gap-6 md:grid-cols-2">
          <AvailabilityCalendar
            month={month}
            onMonth={setMonth}
            available={available}
            value={date}
            onChange={setDate}
            minMonth={startOfMonth(today)}
            maxMonth={addMonths(today, 3)}
            loading={slots.isFetching}
            label={t('consult.book.calendarLabel')}
          />
          <div className="space-y-4">
            {slots.isError ? <ErrorState error={slots.error} onRetry={() => void slots.refetch()} /> : null}
            {!slots.isPending && available.size === 0 ? <Alert tone="blue">{t('consult.book.noSlots')}</Alert> : null}
            <Field label={t('consult.book.dateLabel')}>
              <p className="text-sm font-medium">{date ? formatDate(`${date}T12:00:00`, 'EEEE d MMMM yyyy') : t('consult.book.noDate')}</p>
            </Field>
            <Field label={t('consult.book.timeLabel')} htmlFor="bc-time" hint={preferredAt ? t('consult.book.localTime', { time: formatTime(preferredAt) }) : t('consult.book.timeHint')}>
              <Select id="bc-time" value={time} onChange={(e) => setTime(e.target.value)}>
                {IST_TIMES.map((v) => (
                  <option key={v} value={v}>
                    {t('consult.book.istTime', { time: v })}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-muted">{t('consult.book.confirmNote')}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('consult.book.questionStep')} />
        <CardBody className="space-y-5">
          <Field label={t('consult.book.questionLabel')} htmlFor="bc-question" hint={t('consult.book.questionHint')}>
            <Textarea id="bc-question" rows={5} maxLength={MAX_QUESTION} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </Field>
          <Field label={t('cases.new.screeningLabel')} htmlFor="bc-screening" hint={t('cases.new.screeningHint')}>
            <Select id="bc-screening" value={screeningId} onChange={(e) => setScreeningId(e.target.value)} disabled={screenings.isPending}>
              <option value="">{t('cases.new.noScreening')}</option>
              {(screenings.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.specialty?.name ?? t('cases.new.generalScreening')} · {formatDate(s.completed_at ?? s.created_at)}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('consult.book.reportsLabel')}</legend>
            <p className="text-xs text-muted">{t('consult.book.reportsHint')}</p>
            {medicalDocs.length === 0 ? <p className="text-sm text-muted">{t('consult.book.noReports')}</p> : null}
            {medicalDocs.map((d) => (
              <Checkbox
                key={d.id}
                label={d.file_name}
                description={formatDate(d.created_at)}
                checked={docIds.includes(d.id)}
                disabled={!docIds.includes(d.id) && docIds.length >= 20}
                onChange={(e) => setDocIds((cur) => (e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id)))}
              />
            ))}
            <UploadButton
              kind="medical_report"
              size="sm"
              label={t('consult.book.uploadReport')}
              onUploaded={(doc) => setDocIds((cur) => (cur.length < 20 ? [...cur, doc.id] : cur))}
            />
          </fieldset>
          <div>
            <Checkbox
              label={t('consult.book.consentLabel')}
              description={t('consult.book.consentText', { hospital: doctor.hospital.name })}
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setConsentError(false);
              }}
            />
            {consentError ? (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {t('cases.new.consentRequired')}
              </p>
            ) : null}
          </div>
          {fee > 0 ? <Alert tone="blue">{t('consult.book.payNext')}</Alert> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <ButtonLink to={paths.quickQuote({ hospitals: [doctor.hospital.id] })} variant="outline">
              {t('doctor.requestQuote')}
            </ButtonLink>
            <Button onClick={() => void submit()} loading={book.isPending} disabled={!date} icon={<Video className="size-4" aria-hidden />}>
              {fee > 0 ? t('consult.book.submitPaid') : t('consult.book.submit')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
