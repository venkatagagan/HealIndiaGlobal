import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, FileSignature, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { api, documentsApi, errorMessage, humanize, saveBlob, type VisaRequestOut, type VisaStatus } from '@hig/shared/api';
import { Alert, Button, FormField, Input, Modal, Select, Textarea } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDateTime } from '../../lib/format';
import { qk, useHospitalDoctors } from '../../lib/queries';

/** Phase-1 fields of a visa request (the shared VisaRequestOut predates them). */
export type VisaRequestWithLetter = VisaRequestOut & {
  invitation_letter_draft_document_id?: string | null;
  invitation_letter_generated_at?: string | null;
  invitation_letter_approved_at?: string | null;
};

interface AttendantIn {
  full_name: string;
  relationship?: string | null;
  passport_number?: string | null;
}

/** POST /hospital-portal/visa-requests/{id}/invitation-letter/generate (all optional; defaults from the case). */
interface InvitationLetterGenerateIn {
  estimated_arrival_date?: string;
  estimated_duration_days?: number;
  treating_doctor_id?: string;
  attendants?: AttendantIn[];
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  notes?: string;
}

/** Response of generate / approve. `missing`: details the letter could not fill in. */
interface InvitationLetterOut {
  visa_request_id: string;
  visa_status: VisaStatus;
  draft_document_id: string | null;
  document_id: string | null;
  generated_at: string | null;
  approved_at: string | null;
  missing: string[];
}

const letterPath = (visaId: string, action: 'generate' | 'approve') =>
  `/hospital-portal/visa-requests/${encodeURIComponent(visaId)}/invitation-letter/${action}`;

const KNOWN_MISSING = ['passport_number', 'nationality', 'estimated_arrival_date', 'treating_doctor'] as const;

/** Draft / approve the hospital's visa invitation letter generated from the case (PDF on the letterhead). */
export function InvitationLetterSection({ request, caseId }: { request: VisaRequestWithLetter; caseId: string }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const draftId = request.invitation_letter_draft_document_id ?? null;
  const approved = !!request.invitation_letter_approved_at && request.invitation_letter_document_id != null;
  const draftPending = !!draftId && !approved;
  const closed = ['approved', 'rejected', 'applied'].includes(request.status);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.visa(caseId) });

  const generate = useMutation({
    mutationFn: (body: InvitationLetterGenerateIn) => api.post<InvitationLetterOut>(letterPath(request.id, 'generate'), body),
    onSuccess: (out) => {
      setMissing(out.missing);
      setFormOpen(false);
      toast.success(t('bookings.letter.generated'));
      invalidate();
      setPreviewOpen(true);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const approve = useMutation({
    mutationFn: () => api.post<InvitationLetterOut>(letterPath(request.id, 'approve'), {}),
    onSuccess: () => {
      setMissing(null);
      setPreviewOpen(false);
      toast.success(t('bookings.letter.approved'));
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const missingLabel = (key: string) =>
    (KNOWN_MISSING as readonly string[]).includes(key) ? t(`bookings.letter.missing.${key}`) : humanize(key);

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <FileSignature className="size-4 text-accent-ink" aria-hidden /> {t('bookings.letter.title')}
          </p>
          <p className="text-xs text-muted">
            {approved
              ? t('bookings.letter.approvedOn', { date: formatDateTime(request.invitation_letter_approved_at) })
              : draftPending
                ? t('bookings.letter.draftOn', { date: formatDateTime(request.invitation_letter_generated_at) })
                : t('bookings.letter.hint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draftPending && (
            <>
              <Button variant="outline" size="sm" icon={<Eye className="size-4" aria-hidden />} onClick={() => setPreviewOpen(true)}>
                {t('bookings.letter.preview')}
              </Button>
              <Button size="sm" icon={<Send className="size-4" aria-hidden />} loading={approve.isPending} onClick={() => approve.mutate()}>
                {t('bookings.letter.approveSend')}
              </Button>
            </>
          )}
          {!closed && (
            <Button
              variant={draftPending || approved ? 'ghost' : 'primary'}
              size="sm"
              icon={draftId ? <RefreshCw className="size-4" aria-hidden /> : <FileSignature className="size-4" aria-hidden />}
              onClick={() => setFormOpen(true)}
            >
              {draftId ? t('bookings.letter.regenerate') : t('bookings.letter.generate')}
            </Button>
          )}
        </div>
      </div>

      {missing && missing.length > 0 && draftPending && (
        <Alert tone="amber" title={t('bookings.letter.missingTitle')}>
          <ul className="list-disc ps-5">
            {missing.map((m) => (
              <li key={m}>{missingLabel(m)}</li>
            ))}
          </ul>
          <p className="mt-1">{t('bookings.letter.missingHint')}</p>
        </Alert>
      )}

      {formOpen && (
        <GenerateLetterModal
          loading={generate.isPending}
          onClose={() => setFormOpen(false)}
          onSubmit={(body) => generate.mutate(body)}
        />
      )}
      {previewOpen && draftId && (
        <LetterPreviewModal
          documentId={draftId}
          canApprove={draftPending}
          approving={approve.isPending}
          onApprove={() => approve.mutate()}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function GenerateLetterModal({
  loading,
  onClose,
  onSubmit,
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (body: InvitationLetterGenerateIn) => void;
}) {
  const { t } = useAppTranslation();
  const ids = useId();
  const doctors = useHospitalDoctors();
  const [arrival, setArrival] = useState('');
  const [duration, setDuration] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [useAttendants, setUseAttendants] = useState(false);
  const [attendants, setAttendants] = useState<AttendantIn[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const days = duration.trim() ? Number(duration) : undefined;
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setError(t('bookings.letter.form.durationError'));
      return;
    }
    if (useAttendants && attendants.some((a) => !a.full_name.trim())) {
      setError(t('bookings.letter.form.attendantNameError'));
      return;
    }
    setError(null);
    const clean = (v: string) => v.trim() || undefined;
    onSubmit({
      estimated_arrival_date: arrival || undefined,
      estimated_duration_days: days,
      treating_doctor_id: doctorId || undefined,
      // omitted = use the patient's companions on file; an empty list = no attendants on the letter
      attendants: useAttendants
        ? attendants.map((a) => ({
            full_name: a.full_name.trim(),
            relationship: a.relationship?.trim() || null,
            passport_number: a.passport_number?.trim() || null,
          }))
        : undefined,
      contact_name: clean(contactName),
      contact_phone: clean(contactPhone),
      contact_email: clean(contactEmail),
      notes: clean(notes),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('bookings.letter.form.title')}
      description={t('bookings.letter.form.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={loading} icon={<FileSignature className="size-4" aria-hidden />} onClick={submit}>
            {t('bookings.letter.form.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('bookings.letter.form.arrival')} htmlFor={`${ids}-arrival`} hint={t('bookings.letter.form.fromBooking')}>
            <Input id={`${ids}-arrival`} type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </FormField>
          <FormField label={t('bookings.letter.form.duration')} htmlFor={`${ids}-duration`} hint={t('bookings.letter.form.fromBooking')}>
            <Input
              id={`${ids}-duration`}
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/[^\d]/g, ''))}
            />
          </FormField>
          <FormField label={t('bookings.letter.form.doctor')} htmlFor={`${ids}-doctor`} hint={t('bookings.letter.form.doctorHint')} className="sm:col-span-2">
            <Select
              id={`${ids}-doctor`}
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              placeholder={t('bookings.letter.form.doctorDefault')}
              options={(doctors.data ?? []).map((d) => ({ value: d.id, label: d.full_name }))}
            />
          </FormField>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-fg">{t('bookings.letter.form.attendants')}</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-border-strong"
              checked={useAttendants}
              onChange={(e) => {
                setUseAttendants(e.target.checked);
                if (e.target.checked && attendants.length === 0) setAttendants([{ full_name: '' }]);
              }}
            />
            <span>
              {t('bookings.letter.form.attendantsOverride')}
              <span className="block text-xs text-muted">{t('bookings.letter.form.attendantsHint')}</span>
            </span>
          </label>
          {useAttendants && (
            <div className="space-y-2">
              {attendants.map((a, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[2fr_1fr_1.5fr_auto] sm:items-end">
                  <FormField label={t('bookings.letter.form.attendantName')} htmlFor={`${ids}-att-${i}-name`} required>
                    <Input
                      id={`${ids}-att-${i}-name`}
                      value={a.full_name}
                      maxLength={200}
                      onChange={(e) => setAttendants((list) => list.map((x, j) => (j === i ? { ...x, full_name: e.target.value } : x)))}
                    />
                  </FormField>
                  <FormField label={t('bookings.letter.form.relationship')} htmlFor={`${ids}-att-${i}-rel`}>
                    <Input
                      id={`${ids}-att-${i}-rel`}
                      value={a.relationship ?? ''}
                      maxLength={60}
                      onChange={(e) => setAttendants((list) => list.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))}
                    />
                  </FormField>
                  <FormField label={t('bookings.letter.form.passport')} htmlFor={`${ids}-att-${i}-pp`}>
                    <Input
                      id={`${ids}-att-${i}-pp`}
                      value={a.passport_number ?? ''}
                      maxLength={30}
                      dir="ltr"
                      autoComplete="off"
                      onChange={(e) => setAttendants((list) => list.map((x, j) => (j === i ? { ...x, passport_number: e.target.value } : x)))}
                    />
                  </FormField>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('bookings.letter.form.removeAttendant', { number: i + 1 })}
                    onClick={() => setAttendants((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
              {attendants.length < 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => setAttendants((list) => [...list, { full_name: '' }])}
                >
                  {t('bookings.letter.form.addAttendant')}
                </Button>
              )}
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('bookings.letter.form.contactName')} htmlFor={`${ids}-cname`}>
            <Input id={`${ids}-cname`} value={contactName} maxLength={200} onChange={(e) => setContactName(e.target.value)} />
          </FormField>
          <FormField label={t('bookings.letter.form.contactPhone')} htmlFor={`${ids}-cphone`}>
            <Input id={`${ids}-cphone`} type="tel" dir="ltr" value={contactPhone} maxLength={40} onChange={(e) => setContactPhone(e.target.value)} />
          </FormField>
          <FormField label={t('bookings.letter.form.contactEmail')} htmlFor={`${ids}-cemail`}>
            <Input id={`${ids}-cemail`} type="email" dir="ltr" value={contactEmail} maxLength={255} onChange={(e) => setContactEmail(e.target.value)} />
          </FormField>
        </div>
        <p className="-mt-2 text-xs text-muted">{t('bookings.letter.form.contactHint')}</p>
        <FormField label={t('bookings.letter.form.notes')} htmlFor={`${ids}-notes`} hint={t('bookings.letter.form.notesHint')}>
          <Textarea id={`${ids}-notes`} rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Inline PDF preview of the draft (authorized blob download -> object URL). */
function LetterPreviewModal({
  documentId,
  canApprove,
  approving,
  onApprove,
  onClose,
}: {
  documentId: string;
  canApprove: boolean;
  approving: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const [state, setState] = useState<{ url: string; blob: Blob; name: string } | { error: unknown } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    documentsApi
      .download(documentId)
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.blob);
        setState({ url, blob: res.blob, name: res.filename ?? 'invitation-letter-draft.pdf' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ error });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('bookings.letter.previewTitle')}
      description={canApprove ? t('bookings.letter.previewDescription') : undefined}
      footer={
        <>
          {state && 'url' in state && (
            <Button variant="outline" icon={<Download className="size-4" aria-hidden />} onClick={() => saveBlob(state.blob, state.name)}>
              {t('bookings.letter.download')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canApprove && (
            <Button icon={<Send className="size-4" aria-hidden />} loading={approving} onClick={onApprove}>
              {t('bookings.letter.approveSend')}
            </Button>
          )}
        </>
      }
    >
      {state === null ? (
        <p className="py-10 text-center text-sm text-muted">{t('bookings.letter.loadingPreview')}</p>
      ) : 'error' in state ? (
        <Alert tone="red" title={t('bookings.letter.previewError')}>
          {errorMessage(state.error)}
        </Alert>
      ) : (
        <iframe title={t('bookings.letter.previewTitle')} src={state.url} className="h-[70vh] w-full rounded-lg border border-border bg-white" />
      )}
    </Modal>
  );
}
