import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Building2, CheckCircle2, FileText, XCircle } from 'lucide-react';
import {
  DOCUMENT_KIND_LABELS,
  casesApi,
  documentsApi,
  errorMessage,
  type AgentPatientOut,
  type CaseCreateIn,
  type CaseOut,
} from '@hig/shared/api';
import { Button, Checkbox, FormField, Modal, Textarea } from '../../components/ui';
import { phase1Api } from '../../lib/phase1Api';
import { qk } from '../../lib/queries';
import { formatDate } from '../../lib/shared';
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

/** Reports a hospital may receive with one enquiry (QuoteRequestCreate.document_ids). */
const MAX_SHARED_DOCUMENTS = 20;

/**
 * Same treatment, no specific doctor, and something to quote for: the enquiry goes out as one multi-hospital
 * quote request (`POST /cases/quote-request`, all or nothing) and opens the side-by-side quote page.
 */
function asQuoteRequest(targets: EnquiryTarget[], screeningId?: string | null): boolean {
  const first = targets[0];
  if (!first || targets.some((target) => target.doctor_id)) return false;
  const same = targets.every(
    (target) =>
      (target.procedure_id ?? null) === (first.procedure_id ?? null) && (target.specialty_id ?? null) === (first.specialty_id ?? null),
  );
  return same && Boolean(first.procedure_id || first.specialty_id || screeningId);
}

/**
 * Sends the same enquiry to up to three hospitals for one patient: one grouped quote request when possible
 * (see `asQuoteRequest`), otherwise one case per hospital. When `patient` is not given, a patient picker is shown.
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
  const [documentIds, setDocumentIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setResults(null);
      setConsent(false);
      setDocumentIds([]);
    }
  }, [open]);

  const fixedPatientId = patientId ?? patient?.id;
  const effectivePatientId = fixedPatientId ?? picked?.id;
  const label = patientLabel ?? (patient ? patientName(patient) : picked ? patientName(picked) : null);
  const list = targets.slice(0, MAX_ENQUIRY_HOSPITALS);
  const grouped = asQuoteRequest(list, screeningId);
  const documents = useQuery({
    queryKey: qk.documents({ patient_id: effectivePatientId }),
    queryFn: () => documentsApi.list({ patient_id: effectivePatientId }),
    enabled: open && Boolean(effectivePatientId),
  });
  const toggleDocument = (id: string, on: boolean) =>
    setDocumentIds((ids) => (on ? (ids.length >= MAX_SHARED_DOCUMENTS ? ids : [...ids, id]) : ids.filter((x) => x !== id)));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-patients'] });
  };

  const sendGrouped = async (patientId: string) => {
    const first = list[0];
    setSending(true);
    try {
      const group = await phase1Api.quoteRequest({
        hospital_ids: list.map((target) => target.hospital_id),
        patient_id: patientId,
        ...(first?.procedure_id ? { procedure_id: first.procedure_id } : {}),
        ...(first?.specialty_id ? { specialty_id: first.specialty_id } : {}),
        ...(screeningId ? { screening_id: screeningId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(documentIds.length ? { document_ids: documentIds } : {}),
        consent_share: consent,
      });
      invalidate();
      toast.success(group.cases.length === 1 ? t('enquiryDialog.sentOne') : t('enquiryDialog.sentMany', { count: group.cases.length }));
      onClose();
      navigate(`/cases/quote-groups/${group.quote_group_id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (!effectivePatientId) return;
    if (grouped) {
      await sendGrouped(effectivePatientId);
      return;
    }
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
          // CaseCreate.document_ids: reports shared with this hospital
          ...(documentIds.length ? { document_ids: documentIds } : {}),
          consent_share: consent,
        } as CaseCreateIn);
        out.push({ target, created });
      } catch (error) {
        out.push({ target, error: errorMessage(error) });
      }
    }
    setSending(false);
    setResults(out);
    invalidate();
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
          {effectivePatientId && (documents.data?.length ?? 0) > 0 && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">{t('enquiryDialog.shareReports')}</legend>
              <p className="mb-2 text-xs text-muted">{t('enquiryDialog.shareReportsHint', { max: MAX_SHARED_DOCUMENTS })}</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {(documents.data ?? []).map((doc) => {
                  const checked = documentIds.includes(doc.id);
                  return (
                    <li key={doc.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-border accent-[var(--color-primary)]"
                          checked={checked}
                          disabled={!checked && documentIds.length >= MAX_SHARED_DOCUMENTS}
                          onChange={(e) => toggleDocument(doc.id, e.target.checked)}
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
          {grouped && <p className="text-xs text-muted">{t('enquiryDialog.groupedHint')}</p>}
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
