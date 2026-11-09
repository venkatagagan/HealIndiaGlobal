import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Camera, FileText, ImageIcon, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { errorMessage } from '../api/client';
import type { DocumentOut, Uuid } from '../api/types';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { docaiApi } from './api';
import { useDocaiText } from './i18n';
import {
  DOCAI_ACCEPT,
  DOCAI_MAX_PAGES,
  DOCAI_MAX_UPLOAD_MB,
  downscaleImage,
  formatBytes,
  isAcceptedReportFile,
  isDicom,
  isHeic,
  isPdf,
} from './image';
import { REPORT_DOCUMENT_KINDS, type DocumentAnalysisOut, type ReportDocumentKind } from './types';
import { useQueryClient } from '@tanstack/react-query';

export interface DocumentCaptureProps {
  /** required when an agent/staff member uploads for a patient */
  patientId?: Uuid;
  caseId?: Uuid;
  defaultKind?: ReportDocumentKind;
  maxPages?: number;
  maxUploadMb?: number;
  /** show "Upload without AI" (default true) */
  allowUploadOnly?: boolean;
  /** called after the pages are uploaded (with or without AI) */
  onUploaded?: (documents: DocumentOut[]) => void;
  /** called after POST /documents/analyses succeeded (status `queued`) */
  onAnalysisCreated?: (analysis: DocumentAnalysisOut, documents: DocumentOut[]) => void;
  className?: string;
}

interface Page {
  key: string;
  file: File;
  previewUrl: string | null;
}

type Phase = { kind: 'idle' } | { kind: 'preparing' } | { kind: 'uploading'; n: number; total: number } | { kind: 'starting' };

let pageSeq = 0;

export function DocumentCapture({
  patientId,
  caseId,
  defaultKind = 'medical_report',
  maxPages = DOCAI_MAX_PAGES,
  maxUploadMb = DOCAI_MAX_UPLOAD_MB,
  allowUploadOnly = true,
  onUploaded,
  onAnalysisCreated,
  className,
}: DocumentCaptureProps) {
  const { t } = useDocaiText();
  const qc = useQueryClient();
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [kind, setKind] = useState<ReportDocumentKind>(defaultKind);
  const [consent, setConsent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [errors, setErrors] = useState<string[]>([]);
  const busy = phase.kind !== 'idle';

  // revoke previews on unmount
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  });
  useEffect(
    () => () => {
      for (const p of pagesRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  async function addFiles(list: FileList | File[] | null) {
    if (!list || busy) return;
    const files = Array.from(list);
    if (!files.length) return;
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      if (isDicom(file)) problems.push(t('dicomHint'));
      else if (!isAcceptedReportFile(file)) problems.push(t('badType', { name: file.name }));
      else accepted.push(file);
    }
    const room = maxPages - pages.length;
    if (accepted.length > room) problems.push(t('tooManyPages', { max: maxPages }));
    const toAdd = accepted.slice(0, Math.max(0, room));
    setPhase({ kind: 'preparing' });
    const prepared: Page[] = [];
    for (const original of toAdd) {
      const file = await downscaleImage(original);
      if (file.size > maxUploadMb * 1024 * 1024) {
        problems.push(t('tooLarge', { name: original.name, max: maxUploadMb }));
        continue;
      }
      const previewUrl = !isPdf(file) && !isHeic(file) ? URL.createObjectURL(file) : null;
      prepared.push({ key: `p${++pageSeq}`, file, previewUrl });
    }
    setPhase({ kind: 'idle' });
    setErrors(Array.from(new Set(problems)));
    if (prepared.length) setPages((prev) => [...prev, ...prepared]);
  }

  function move(index: number, delta: -1 | 1) {
    setPages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const a = next[index];
      const b = next[target];
      if (!a || !b) return prev;
      next[index] = b;
      next[target] = a;
      return next;
    });
  }

  function remove(index: number) {
    setPages((prev) => {
      const page = prev[index];
      if (page?.previewUrl) URL.revokeObjectURL(page.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function reset() {
    for (const p of pages) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    setPages([]);
    setConsent(false);
    setErrors([]);
  }

  async function uploadAll(): Promise<DocumentOut[]> {
    const docs: DocumentOut[] = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue;
      setPhase({ kind: 'uploading', n: i + 1, total: pages.length });
      docs.push(
        await docaiApi.uploadDocument({
          file: page.file,
          file_name: page.file.name,
          kind,
          case_id: caseId,
          patient_id: patientId,
        }),
      );
    }
    void qc.invalidateQueries({ queryKey: ['documents'] });
    return docs;
  }

  async function submit(withAi: boolean) {
    if (!pages.length) {
      setErrors([t('noPages')]);
      return;
    }
    if (withAi && !consent) {
      setErrors([t('needConsent')]);
      return;
    }
    setErrors([]);
    let docs: DocumentOut[] = [];
    try {
      docs = await uploadAll();
      onUploaded?.(docs);
      if (withAi) {
        setPhase({ kind: 'starting' });
        const analysis = await docaiApi.create({
          document_ids: docs.map((d) => d.id),
          case_id: caseId,
          consent_ai: true,
        });
        void qc.invalidateQueries({ queryKey: ['docai'] });
        onAnalysisCreated?.(analysis, docs);
      }
      reset();
    } catch (error) {
      setErrors([errorMessage(error)]);
      // pages already uploaded stay uploaded; drop them from the queue so they are not sent twice
      if (docs.length) reset();
    } finally {
      setPhase({ kind: 'idle' });
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void addFiles(event.dataTransfer.files);
  }

  const progressPct = phase.kind === 'uploading' ? Math.round(((phase.n - 1) / phase.total) * 100) : phase.kind === 'starting' ? 100 : 0;
  const hasPdf = pages.some((p) => isPdf(p.file));

  return (
    <section className={cn('space-y-4', className)} aria-labelledby={`${uid}-title`}>
      <div>
        <h3 id={`${uid}-title`} className="text-base font-semibold text-fg">
          {t('captureTitle')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('captureHint')}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-5 text-center transition-colors',
          dragOver ? 'border-primary bg-primary-soft/50' : 'border-border bg-surface-2/40',
        )}
      >
        <Upload className="mx-auto size-8 text-muted" aria-hidden />
        <p className="mt-2 text-sm text-fg">
          <span className="hidden sm:inline">
            {t('dropHere')} {t('or')}
          </span>
        </p>
        <div className="mt-3 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            leftIcon={<FileText className="size-4" aria-hidden />}
            onClick={() => fileInput.current?.click()}
            disabled={busy || pages.length >= maxPages}
          >
            {t('chooseFiles')}
          </Button>
          <Button
            variant="outline"
            leftIcon={pages.length ? <Plus className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            onClick={() => cameraInput.current?.click()}
            disabled={busy || pages.length >= maxPages}
          >
            {pages.length ? t('addPage') : t('takePhoto')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">{t('accepted', { max: maxUploadMb, pages: maxPages })}</p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={DOCAI_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          <ul className="space-y-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {pages.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-fg" aria-live="polite">
            {t('pagesSelected', { n: pages.length })}
          </p>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pages.map((page, index) => (
              <li key={page.key} className="overflow-hidden rounded-lg border border-border bg-surface">
                <div className="relative flex aspect-[3/4] items-center justify-center bg-surface-2">
                  {page.previewUrl ? (
                    <img src={page.previewUrl} alt={t('pageN', { n: index + 1 })} className="size-full object-cover" />
                  ) : isPdf(page.file) ? (
                    <FileText className="size-10 text-muted" aria-hidden />
                  ) : (
                    <ImageIcon className="size-10 text-muted" aria-hidden />
                  )}
                  <span className="absolute start-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                    {t('pageN', { n: index + 1 })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="truncate text-xs text-muted" title={page.file.name}>
                    {formatBytes(page.file.size)}
                  </span>
                  <div className="flex shrink-0 items-center">
                    <IconButton label={t('moveUp')} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp className="size-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={t('moveDown')}
                      disabled={busy || index === pages.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </IconButton>
                    <IconButton label={t('removePage')} disabled={busy} onClick={() => remove(index)} danger>
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {hasPdf && pages.length > 1 && <p className="text-xs text-muted">{t('multiPdfHint')}</p>}
        </div>
      )}

      {pages.length > 0 && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-fg">{t('kindLabel')}</span>
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => setKind(e.target.value as ReportDocumentKind)}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
            >
              {REPORT_DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-3 text-sm text-fg">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span>{t('consentAi')}</span>
          </label>

          {busy && (
            <div className="space-y-1" aria-live="polite">
              <p className="text-sm text-muted">
                {phase.kind === 'preparing'
                  ? t('preparing')
                  : phase.kind === 'uploading'
                    ? t('uploadingN', { n: phase.n, total: phase.total })
                    : t('starting')}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(5, progressPct)}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" leftIcon={<X className="size-4" aria-hidden />} onClick={reset} disabled={busy}>
              {t('cancel')}
            </Button>
            {allowUploadOnly && (
              <Button variant="outline" onClick={() => void submit(false)} disabled={busy}>
                {t('uploadOnly')}
              </Button>
            )}
            <Button
              leftIcon={<Sparkles className="size-4" aria-hidden />}
              onClick={() => void submit(true)}
              loading={phase.kind === 'uploading' || phase.kind === 'starting'}
              disabled={busy || !consent}
            >
              {t('readWithAi')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
        danger && 'hover:text-danger-ink',
      )}
    >
      {children}
    </button>
  );
}
