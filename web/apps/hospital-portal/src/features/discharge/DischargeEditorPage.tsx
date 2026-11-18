/**
 * Discharge summary editor (hospital).
 *   /discharge-summaries/new?case=<id>&booking=<id>   start from GET /discharge-summaries/prefill (nothing saved yet)
 *   /discharge-summaries/:summaryId                    a draft (edit, save, preview PDF, finalize, discard) or a
 *                                                      final version (read-only, downloads, "Edit -> new version")
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Download, Eye, FileCode2, Lock, Pencil, Save, Trash2 } from 'lucide-react';
import {
  dischargeApi,
  dischargeMissingFields,
  errorMessage,
  existingDraftId,
  isApiError,
  saveBlob,
  type DischargeAttachment,
  type DischargePrefillOut,
  type DischargeSummaryOut,
} from '@hig/shared/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  LinkButton,
  Modal,
  PageHeader,
  PageLoader,
} from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { formatDate, formatDateTime } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  DischargeForm,
  formFromPrefill,
  formFromSummary,
  toPayload,
  validateForm,
  type DischargeFormState,
  type FormErrors,
} from './DischargeForm';
import { dischargePaths, dsk, useDischargeList, useDischargePrefill, useDischargeSummary } from './queries';

const KNOWN_MISSING = ['diagnosis', 'discharge_date', 'doctor_name', 'follow_up_instructions'];

function BackToCase({ caseId }: { caseId: string }) {
  const { t } = useAppTranslation();
  return (
    <Link to={`/cases/${encodeURIComponent(caseId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden /> {t('discharge.editor.backToCase')}
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------------------
// New (from prefill)
// ---------------------------------------------------------------------------------------------------------
export function DischargeNewPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('discharge.editor.titleNew'));
  const [params] = useSearchParams();
  const caseId = params.get('case') ?? undefined;
  const bookingId = params.get('booking');
  const existing = useDischargeList(caseId ? { case_id: caseId } : undefined, !!caseId);
  const prefill = useDischargePrefill(caseId, bookingId);

  if (!caseId) return <Navigate to={dischargePaths.list} replace />;
  if (existing.isPending || prefill.isPending) return <PageLoader />;
  const draft = existing.data?.find((s) => s.status === 'draft');
  if (draft) return <Navigate to={dischargePaths.one(draft.id)} replace />;
  if (prefill.isError) {
    return (
      <Card>
        <ErrorState error={prefill.error} onRetry={() => void prefill.refetch()} />
      </Card>
    );
  }
  const finalLatest = existing.data?.find((s) => s.status === 'final' && s.is_latest) ?? null;
  return (
    <NewEditor
      caseId={caseId}
      bookingId={bookingId}
      prefill={prefill.data}
      finalId={finalLatest?.id ?? null}
      onConflict={() => void existing.refetch()}
    />
  );
}

function NewEditor({
  caseId,
  bookingId,
  prefill,
  finalId,
  onConflict,
}: {
  caseId: string;
  bookingId: string | null;
  prefill: DischargePrefillOut;
  /** the case already has a final summary: edits go through "new version" there */
  finalId: string | null;
  onConflict: () => void;
}) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DischargeFormState>(() => formFromPrefill(prefill));
  const [errors, setErrors] = useState<FormErrors>({});

  const create = useMutation({
    mutationFn: (f: DischargeFormState) => dischargeApi.create({ case_id: caseId, booking_id: bookingId || null, ...toPayload(f) }),
    onSuccess: (out) => {
      toast.success(t('discharge.editor.created'));
      queryClient.setQueryData(dsk.detail(out.id), out);
      void queryClient.invalidateQueries({ queryKey: dsk.all });
      navigate(dischargePaths.one(out.id), { replace: true });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'discharge_draft_exists') {
        const id = existingDraftId(error.details);
        toast.info(t('discharge.editor.draftExists'));
        if (id) navigate(dischargePaths.one(id), { replace: true });
      } else if (isApiError(error) && error.code === 'discharge_summary_exists') {
        toast.error(t('discharge.editor.summaryExists'));
        onConflict();
      } else toast.error(errorMessage(error));
    },
  });

  const save = () => {
    const errs = validateForm(form, t);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(t('discharge.editor.errors.fixFields'));
      return;
    }
    create.mutate(form);
  };

  return (
    <>
      <PageHeader
        back={<BackToCase caseId={caseId} />}
        title={t('discharge.editor.titleNew')}
        description={t('discharge.editor.prefillNote')}
        actions={
          <Button icon={<Save className="h-4 w-4" aria-hidden />} loading={create.isPending} disabled={!!finalId} onClick={save}>
            {t('discharge.editor.saveDraft')}
          </Button>
        }
      />
      {finalId ? (
        <div className="mb-6">
          <Alert
            tone="amber"
            title={t('discharge.editor.summaryExists')}
            actions={
              <LinkButton to={dischargePaths.one(finalId)} size="sm" variant="outline">
                {t('discharge.editor.openFinal')}
              </LinkButton>
            }
          />
        </div>
      ) : null}
      <DischargeForm value={form} onChange={setForm} errors={errors} missing={[]} documents={prefill.available_documents} readOnly={!!finalId} />
      {!finalId ? (
        <div className="mt-6 flex justify-end">
          <Button icon={<Save className="h-4 w-4" aria-hidden />} loading={create.isPending} onClick={save}>
            {t('discharge.editor.saveDraft')}
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Existing draft / final
// ---------------------------------------------------------------------------------------------------------
export function DischargeEditorPage() {
  const { t } = useAppTranslation();
  const { summaryId = '' } = useParams();
  const summary = useDischargeSummary(summaryId);
  useDocumentTitle(summary.data?.case_number ? t('discharge.editor.documentTitle', { case: summary.data.case_number }) : t('discharge.title'));

  if (summary.isPending) return <PageLoader />;
  if (summary.isError) {
    return (
      <Card>
        <ErrorState
          title={isApiError(summary.error) && summary.error.isNotFound ? t('discharge.editor.notFound') : undefined}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      </Card>
    );
  }
  // remount the editor when another summary / status is shown (finalize, new version)
  return <Editor key={`${summary.data.id}:${summary.data.status}`} summary={summary.data} />;
}

function Editor({ summary }: { summary: DischargeSummaryOut }) {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDraft = summary.status === 'draft';
  const prefill = useDischargePrefill(isDraft ? summary.case_id : undefined, summary.booking_id);
  const siblings = useDischargeList({ case_id: summary.case_id }, !summary.is_latest);
  const latest = siblings.data?.find((s) => s.is_latest && s.id !== summary.id);
  const [baseline, setBaseline] = useState<DischargeFormState>(() => formFromSummary(summary));
  const [form, setForm] = useState<DischargeFormState>(baseline);
  const [errors, setErrors] = useState<FormErrors>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'finalize' | 'discard' | 'newVersion' | 'preview' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = JSON.stringify(toPayload(form)) !== JSON.stringify(toPayload(baseline));

  const documents: DischargeAttachment[] = useMemo(() => {
    const out = [...(prefill.data?.available_documents ?? [])];
    for (const a of summary.attachments) if (!out.some((d) => d.id === a.id)) out.push(a);
    return out;
  }, [prefill.data, summary.attachments]);

  const refresh = (out?: DischargeSummaryOut) => {
    if (out) queryClient.setQueryData(dsk.detail(out.id), out);
    void queryClient.invalidateQueries({ queryKey: dsk.all });
    void queryClient.invalidateQueries({ queryKey: qk.case(summary.case_id) });
  };

  /** client checks + PATCH when there are changes; resolves false when the form has errors */
  async function persist(): Promise<boolean> {
    const errs = validateForm(form, t);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(t('discharge.editor.errors.fixFields'));
      return false;
    }
    if (!dirty) return true;
    const out = await dischargeApi.update(summary.id, toPayload(form));
    const saved = formFromSummary(out);
    setBaseline(saved);
    setForm(saved);
    refresh(out);
    return true;
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      if (isApiError(error) && error.code === 'discharge_incomplete') {
        setDialog(null);
        setMissing(dischargeMissingFields(error.details));
        toast.error(t('discharge.editor.incompleteTitle'));
      } else if (isApiError(error) && error.code === 'discharge_summary_final') {
        toast.error(t('discharge.editor.alreadyFinal'));
        refresh();
      } else toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run('save', async () => {
      if (await persist()) toast.success(t('discharge.editor.saved'));
    });

  const finalize = () =>
    run('finalize', async () => {
      if (!(await persist())) {
        setDialog(null);
        return;
      }
      const out = await dischargeApi.finalize(summary.id);
      setDialog(null);
      setMissing([]);
      toast.success(t('discharge.editor.finalized'));
      refresh(out);
    });

  const discard = () =>
    run('discard', async () => {
      await dischargeApi.discard(summary.id);
      setDialog(null);
      toast.success(t('discharge.editor.discarded'));
      void queryClient.invalidateQueries({ queryKey: dsk.all });
      navigate(`/cases/${encodeURIComponent(summary.case_id)}`, { replace: true });
    });

  const newVersion = () =>
    run('newVersion', async () => {
      try {
        const out = await dischargeApi.newVersion(summary.id);
        setDialog(null);
        toast.success(t('discharge.editor.newVersionCreated'));
        refresh(out);
        navigate(dischargePaths.one(out.id));
      } catch (error) {
        const id = isApiError(error) && error.code === 'discharge_draft_exists' ? existingDraftId(error.details) : null;
        if (!id) throw error;
        setDialog(null);
        toast.info(t('discharge.editor.draftExists'));
        navigate(dischargePaths.one(id));
      }
    });

  const preview = () =>
    run('preview', async () => {
      if (await persist()) setDialog('preview');
    });

  const missingLabel = (key: string) => (KNOWN_MISSING.includes(key) ? t(`discharge.editor.missing.${key}`) : key);

  return (
    <>
      <PageHeader
        back={<BackToCase caseId={summary.case_id} />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {isDraft ? t('discharge.editor.titleDraft') : t('discharge.editor.titleFinal')}
            <Badge tone={isDraft ? 'amber' : 'green'}>{t(`discharge.status.${summary.status}`)}</Badge>
            <Badge tone="neutral">{t('discharge.versionLabel', { version: summary.version })}</Badge>
          </span>
        }
        description={t('discharge.editor.subtitle', { patient: summary.patient_name ?? '—', case: summary.case_number ?? '—' })}
        actions={
          <>
            <Button
              variant="outline"
              icon={isDraft ? <Eye className="h-4 w-4" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              loading={busy === 'preview' || busy === 'pdf'}
              onClick={() =>
                isDraft ? preview() : void run('pdf', () => dischargeApi.downloadPdf(summary.id, summary.version))
              }
            >
              {isDraft ? t('discharge.editor.previewPdf') : t('discharge.editor.downloadPdf')}
            </Button>
            <Button
              variant="outline"
              icon={<FileCode2 className="h-4 w-4" aria-hidden />}
              loading={busy === 'fhir'}
              onClick={() => void run('fhir', () => dischargeApi.downloadFhir(summary.id, summary.version))}
            >
              {t('discharge.editor.downloadFhir')}
            </Button>
            {isDraft ? (
              <>
                <Button variant="outline" icon={<Save className="h-4 w-4" aria-hidden />} loading={busy === 'save'} onClick={save}>
                  {t('discharge.editor.saveDraft')}
                </Button>
                <Button icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} onClick={() => setDialog('finalize')}>
                  {t('discharge.editor.finalize')}
                </Button>
              </>
            ) : summary.is_latest ? (
              <Button icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setDialog('newVersion')}>
                {t('discharge.editor.newVersion')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {!isDraft ? (
          <Alert tone="green" icon={<Lock className="h-4 w-4" aria-hidden />} title={t('discharge.editor.locked')}>
            {summary.finalized_at ? t('discharge.editor.finalizedOn', { date: formatDateTime(summary.finalized_at) }) : null}
          </Alert>
        ) : dirty ? (
          <Alert tone="blue" title={t('discharge.editor.unsaved')} />
        ) : null}
        {!summary.is_latest ? (
          <Alert
            tone="amber"
            title={t('discharge.editor.supersededTitle')}
            actions={
              latest ? (
                <LinkButton to={dischargePaths.one(latest.id)} size="sm" variant="outline">
                  {t('discharge.editor.openLatest')}
                </LinkButton>
              ) : undefined
            }
          >
            {summary.superseded_at ? t('discharge.editor.supersededOn', { date: formatDate(summary.superseded_at) }) : null}
          </Alert>
        ) : null}
        {missing.length > 0 && isDraft ? (
          <Alert tone="red" title={t('discharge.editor.incompleteTitle')}>
            <ul className="list-disc ps-5">
              {missing.map((m) => (
                <li key={m}>{missingLabel(m)}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </div>

      <DischargeForm value={form} onChange={setForm} errors={errors} missing={missing} documents={documents} readOnly={!isDraft} />

      {isDraft ? (
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" className="text-danger-ink" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setDialog('discard')}>
            {t('discharge.editor.discard')}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<Save className="h-4 w-4" aria-hidden />} loading={busy === 'save'} onClick={save}>
              {t('discharge.editor.saveDraft')}
            </Button>
            <Button icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} onClick={() => setDialog('finalize')}>
              {t('discharge.editor.finalize')}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === 'finalize'}
        onClose={() => setDialog(null)}
        onConfirm={finalize}
        loading={busy === 'finalize'}
        title={t('discharge.editor.finalizeTitle')}
        description={t('discharge.editor.finalizeBody')}
        confirmLabel={t('discharge.editor.finalizeConfirm')}
      />
      <ConfirmDialog
        open={dialog === 'discard'}
        onClose={() => setDialog(null)}
        onConfirm={discard}
        loading={busy === 'discard'}
        tone="danger"
        title={t('discharge.editor.discardTitle')}
        description={t('discharge.editor.discardBody')}
        confirmLabel={t('discharge.editor.discard')}
      />
      <ConfirmDialog
        open={dialog === 'newVersion'}
        onClose={() => setDialog(null)}
        onConfirm={newVersion}
        loading={busy === 'newVersion'}
        title={t('discharge.editor.newVersionTitle')}
        description={t('discharge.editor.newVersionBody')}
        confirmLabel={t('discharge.editor.newVersionConfirm')}
      />
      {dialog === 'preview' && <PdfPreviewModal summary={summary} onClose={() => setDialog(null)} />}
    </>
  );
}

/** Inline PDF preview (authorized blob download -> object URL). */
function PdfPreviewModal({ summary, onClose }: { summary: DischargeSummaryOut; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [state, setState] = useState<{ url: string; blob: Blob; name: string } | { error: unknown } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    dischargeApi
      .pdf(summary.id)
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.blob);
        setState({ url, blob: res.blob, name: res.filename ?? `discharge-summary-v${summary.version}.pdf` });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ error });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [summary.id, summary.version, summary.updated_at]);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('discharge.editor.previewTitle')}
      description={t('discharge.editor.previewDescription')}
      footer={
        <>
          {state && 'url' in state && (
            <Button variant="outline" icon={<Download className="size-4" aria-hidden />} onClick={() => saveBlob(state.blob, state.name)}>
              {t('discharge.editor.downloadPdf')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      {state === null ? (
        <p className="py-10 text-center text-sm text-muted">{t('discharge.editor.loadingPreview')}</p>
      ) : 'error' in state ? (
        <Alert tone="red" title={t('discharge.editor.previewError')}>
          {errorMessage(state.error)}
        </Alert>
      ) : (
        <iframe title={t('discharge.editor.previewTitle')} src={state.url} className="h-[70vh] w-full rounded-lg border border-border bg-white" />
      )}
    </Modal>
  );
}
