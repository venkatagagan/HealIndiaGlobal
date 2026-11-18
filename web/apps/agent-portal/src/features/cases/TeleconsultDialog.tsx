/**
 * Book a pre-travel video consultation for a managed patient: patient, preferred consultation date (doctor's free
 * consultation slots) and India time, question, reports, consent. Reuses the patient's open case at the doctor's
 * hospital or opens one, then `POST /consultations` (kind standard, mode video).
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FileText, Video } from 'lucide-react';
import {
  DOCUMENT_KIND_LABELS,
  catalogApi,
  documentsApi,
  errorMessage,
  isApiError,
  requestVideoConsultation,
  type AgentPatientOut,
  type AvailabilityDay,
  type DisplayMoney,
} from '@hig/shared/api';
import { Button, Checkbox, FormField, Modal, Select, Textarea } from '../../components/ui';
import { approxText } from '../../lib/displayCurrency';
import { qk } from '../../lib/queries';
import { formatDate, formatMoney, formatTime, isoDateFromToday } from '../../lib/shared';
import { patientName } from '../../lib/format';
import { PatientPicker } from '../patients/PatientPicker';
import { useAppTranslation } from '../../i18n';

export interface TeleconsultDoctor {
  id: string;
  full_name: string;
  hospital: { id: string; name: string };
  specialty: { id: string };
  consultation_fee_minor: number | null;
  currency: string;
  display_consultation_fee?: DisplayMoney | null;
}

const IST_TIMES = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const MEDICAL_KINDS = new Set(['medical_report', 'prescription', 'lab_result', 'imaging', 'other']);
const MAX_SHARED_DOCUMENTS = 20;

export function TeleconsultDialog({
  open,
  onClose,
  doctor,
  patient,
}: {
  open: boolean;
  onClose: () => void;
  doctor: TeleconsultDoctor;
  patient?: AgentPatientOut | null;
}) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ids = { date: useId(), time: useId(), question: useId() };
  const [picked, setPicked] = useState<AgentPatientOut | null>(patient ?? null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState(IST_TIMES[1] as string);
  const [question, setQuestion] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setConsent(false);
      setDocumentIds([]);
    }
  }, [open]);

  const patientId = patient?.id ?? picked?.id;
  const from = isoDateFromToday(1);
  const to = isoDateFromToday(60);
  const slots = useQuery({
    queryKey: ['availability', 'doctor', doctor.id, from, to],
    queryFn: () => catalogApi.doctorAvailability(doctor.id, { from, to }),
    enabled: open,
  });
  const days = useMemo(
    () => (slots.data ?? []).filter((a: AvailabilityDay) => a.slot_kind === 'consultation' && a.available > 0),
    [slots.data],
  );
  const documents = useQuery({
    queryKey: qk.documents({ patient_id: patientId }),
    queryFn: () => documentsApi.list({ patient_id: patientId }),
    enabled: open && Boolean(patientId),
  });
  const medical = (documents.data ?? []).filter((d) => MEDICAL_KINDS.has(d.kind));
  const preferredAt = date ? `${date}T${time}:00+05:30` : null;
  const fee = doctor.consultation_fee_minor ?? 0;
  const approx = approxText(doctor.display_consultation_fee, doctor.currency);

  const send = async () => {
    if (!patientId) return;
    setSending(true);
    try {
      const created = await requestVideoConsultation({
        hospitalId: doctor.hospital.id,
        doctorId: doctor.id,
        specialtyId: doctor.specialty.id,
        patientId,
        preferredAt,
        question,
        documentIds,
      });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success(t('teleconsult.requested'));
      onClose();
      navigate(`/cases/${created.case_id}`);
    } catch (error) {
      const code = isApiError(error) ? error.code : '';
      toast.error(
        code === 'consultation_exists'
          ? t('teleconsult.errors.exists')
          : code === 'teleconsult_unavailable'
            ? t('teleconsult.errors.unavailable')
            : code === 'invalid_state'
              ? t('teleconsult.errors.caseClosed')
              : errorMessage(error, t('teleconsult.errors.failed')),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('teleconsult.title')}
      description={t('teleconsult.description', { doctor: doctor.full_name, hospital: doctor.hospital.name })}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {t('teleconsult.cancel')}
          </Button>
          <Button
            onClick={() => void send()}
            loading={sending}
            disabled={!patientId || !consent}
            icon={<Video className="h-4 w-4" aria-hidden />}
          >
            {t('teleconsult.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {patient ? (
          <p className="text-sm">{t('teleconsult.patientLine', { name: patientName(patient) })}</p>
        ) : (
          <PatientPicker value={picked} onChange={setPicked} />
        )}
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          {fee > 0
            ? t('teleconsult.fee', { fee: formatMoney(fee, doctor.currency) + (approx ? ` (${approx})` : '') })
            : t('teleconsult.free')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('teleconsult.date')} htmlFor={ids.date} hint={days.length ? t('teleconsult.dateHint') : t('teleconsult.noSlots')}>
            <Select id={ids.date} value={date} onChange={(e) => setDate(e.target.value)} disabled={slots.isPending}>
              <option value="">{t('teleconsult.noPreference')}</option>
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {formatDate(d.date, 'EEE d MMM yyyy')} · {t('teleconsult.slotsLeft', { count: d.available })}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label={t('teleconsult.time')}
            htmlFor={ids.time}
            hint={preferredAt ? t('teleconsult.localTime', { time: formatTime(preferredAt) }) : t('teleconsult.confirmNote')}
          >
            <Select id={ids.time} value={time} onChange={(e) => setTime(e.target.value)} disabled={!date}>
              {IST_TIMES.map((v) => (
                <option key={v} value={v}>
                  {t('teleconsult.istTime', { time: v })}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label={t('teleconsult.question')} htmlFor={ids.question} hint={t('teleconsult.questionHint')}>
          <Textarea id={ids.question} rows={4} maxLength={4000} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </FormField>
        {patientId && medical.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t('teleconsult.reports')}</legend>
            <p className="mb-2 text-xs text-muted">{t('teleconsult.reportsHint')}</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {medical.map((doc) => {
                const checked = documentIds.includes(doc.id);
                return (
                  <li key={doc.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border accent-[var(--color-primary)]"
                        checked={checked}
                        disabled={!checked && documentIds.length >= MAX_SHARED_DOCUMENTS}
                        onChange={(e) =>
                          setDocumentIds((cur) => (e.target.checked ? [...cur, doc.id] : cur.filter((x) => x !== doc.id)))
                        }
                      />
                      <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{doc.file_name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {DOCUMENT_KIND_LABELS[doc.kind] ?? doc.kind} · {formatDate(doc.created_at)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
        <Checkbox
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          label={t('teleconsult.consent')}
          description={t('teleconsult.consentHint', { hospital: doctor.hospital.name })}
        />
        {fee > 0 && <p className="text-xs text-muted">{t('teleconsult.payNote')}</p>}
      </div>
    </Modal>
  );
}
