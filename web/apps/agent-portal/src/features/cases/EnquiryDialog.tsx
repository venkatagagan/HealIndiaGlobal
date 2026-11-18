import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Building2, CheckCircle2, XCircle } from 'lucide-react';
import { casesApi, errorMessage, type AgentPatientOut, type CaseOut } from '@hig/shared/api';
import { Button, Checkbox, FormField, Modal, Textarea } from '../../components/ui';
import { MAX_ENQUIRY_HOSPITALS } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { PatientPicker } from '../patients/PatientPicker';
import { Trans } from 'react-i18next';
import { useAppTranslation } from '../../i18n';

export interface EnquiryTarget {
  hospital_id: string;
  hospital_name: string;
  doctor_id?: string | null;
  doctor_name?: string | null;
  procedure_id?: string | null;
  procedure_name?: string | null;
  specialty_id?: string | null;
}

interface Result {
  target: EnquiryTarget;
  created?: CaseOut;
  error?: string;
}

/**
 * Sends the same enquiry to up to three hospitals (one case per hospital) for one patient.
 * When `patient` is not given, a patient picker is shown.
 */
export function EnquiryDialog({
  open,
  onClose,
  targets,
  patient,
  patientId,
  patientLabel,
  screeningId,
}: {
  open: boolean;
  onClose: () => void;
  targets: EnquiryTarget[];
  patient?: AgentPatientOut | null;
  patientId?: string;
  patientLabel?: string;
  screeningId?: string | null;
}) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notesId = useId();
  const [picked, setPicked] = useState<AgentPatientOut | null>(patient ?? null);
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    if (open) {
      setResults(null);
      setConsent(false);
    }
  }, [open]);

  const fixedPatientId = patientId ?? patient?.id;
  const effectivePatientId = fixedPatientId ?? picked?.id;
  const label = patientLabel ?? (patient ? patientName(patient) : picked ? patientName(picked) : null);
  const list = targets.slice(0, MAX_ENQUIRY_HOSPITALS);

  const send = async () => {
    if (!effectivePatientId) return;
    setSending(true);
    const out: Result[] = [];
    for (const target of list) {
      try {
        const created = await casesApi.create({
          hospital_id: target.hospital_id,
          patient_id: effectivePatientId,
          ...(target.doctor_id ? { doctor_id: target.doctor_id } : {}),
          ...(target.procedure_id ? { procedure_id: target.procedure_id } : {}),
          ...(target.specialty_id ? { specialty_id: target.specialty_id } : {}),
          ...(screeningId ? { screening_id: screeningId } : {}),
          ...(notes.trim() ? { patient_notes: notes.trim() } : {}),
          consent_share: consent,
        });
        out.push({ target, created });
      } catch (error) {
        out.push({ target, error: errorMessage(error) });
      }
    }
    setSending(false);
    setResults(out);
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-patients'] });
    const ok = out.filter((r) => r.created).length;
    if (ok === out.length) toast.success(ok === 1 ? t('enquiryDialog.sentOne') : t('enquiryDialog.sentMany', { count: ok }));
    else if (ok > 0) toast.warning(t('enquiryDialog.sentPartial', { ok, total: out.length }));
    else toast.error(t('enquiryDialog.sendFailed'));
  };

  const succeeded = results?.filter((r) => r.created) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={results ? t('enquiryDialog.resultsTitle') : list.length > 1 ? t('enquiryDialog.sendToMany', { count: list.length }) : t('enquiryDialog.send')}
      description={
        results
          ? t('enquiryDialog.resultsDescription')
          : t('enquiryDialog.sendDescription')
      }
      footer={
        results ? (
          <>
            {succeeded.length >= 2 && (
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  navigate(`/cases/compare?ids=${succeeded.map((r) => r.created?.id).join(',')}`);
                }}
              >
                {t('enquiryDialog.compareQuotes')}
              </Button>
            )}
            {succeeded.length === 1 && succeeded[0]?.created && (
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  navigate(`/cases/${succeeded[0]?.created?.id}`);
                }}
              >
                {t('enquiryDialog.openCase')}
              </Button>
            )}
            <Button
              onClick={() => {
                onClose();
                navigate(effectivePatientId ? `/cases?patient=${effectivePatientId}` : '/cases');
              }}
            >
              {t('enquiryDialog.viewCases')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={sending}>
              {t('enquiryDialog.cancel')}
            </Button>
            <Button onClick={() => void send()} loading={sending} disabled={!effectivePatientId || !consent || list.length === 0}>
              {t('enquiryDialog.send')}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.target.hospital_id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              {r.created ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 text-danger" aria-hidden />
              )}
              <div className="text-sm">
                <p className="font-medium">{r.target.hospital_name}</p>
                <p className="text-muted">{r.created ? t('enquiryDialog.caseCreated', { number: r.created.case_number }) : r.error}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-5">
          {fixedPatientId ? (
            label && (
              <p className="text-sm">
                <Trans t={t} i18nKey="enquiryDialog.patientLine" values={{ name: label }} components={{ 0: <strong /> }} />
              </p>
            )
          ) : (
            <PatientPicker value={picked} onChange={setPicked} />
          )}
          <div>
            <p className="mb-2 text-sm font-medium">{t('enquiryDialog.hospitals', { count: list.length, max: MAX_ENQUIRY_HOSPITALS })}</p>
            <ul className="space-y-2">
              {list.map((target) => (
                <li key={target.hospital_id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{target.hospital_name}</span>
                    {(target.doctor_name || target.procedure_name) && (
                      <span className="block text-xs text-muted">{[target.doctor_name, target.procedure_name].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {targets.length > MAX_ENQUIRY_HOSPITALS && (
              <p className="mt-2 text-xs text-warning">{t('enquiryDialog.onlyFirst', { max: MAX_ENQUIRY_HOSPITALS })}</p>
            )}
          </div>
          <FormField label={t('enquiryDialog.message')} htmlFor={notesId} hint={t('enquiryDialog.messageHint')}>
            <Textarea id={notesId} rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <Checkbox
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            label={t('enquiryDialog.consent')}
            description={t('enquiryDialog.consentHint')}
          />
        </div>
      )}
    </Modal>
  );
}
