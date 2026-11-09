import { useId, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { Spinner } from './Spinner';

/** Types accepted by POST /documents (PLAN 8.3): pdf, jpg, png, webp, heic, dcm. */
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.dcm,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/dicom';
export const DEFAULT_MAX_UPLOAD_MB = 10;

export interface FileRejection {
  file: File;
  reason: 'too_large' | 'bad_type' | 'too_many';
  message: string;
}

export interface FileUploadProps {
  /** called with the accepted files (after type / size validation) */
  onFiles: (files: File[]) => void;
  onReject?: (rejections: FileRejection[]) => void;
  /** input accept list (default: the document types the API accepts) */
  accept?: string;
  multiple?: boolean;
  /** per-file limit in MB (default 10) */
  maxSizeMb?: number;
  /** max number of files per selection (multiple only) */
  maxFiles?: number;
  disabled?: boolean;
  /** shows a spinner and blocks new selections */
  uploading?: boolean;
  /** currently selected / uploaded files to list under the drop zone */
  files?: readonly (File | { name: string; size?: number })[];
  onRemove?: (index: number) => void;
  /** accessible label of the drop zone button */
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  name?: string;
  className?: string;
  /** smaller single-line variant */
  compact?: boolean;
}

function matchesAccept(file: File, accept: string): boolean {
  const rules = accept
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Drag-and-drop / click-to-browse file picker with client-side type and size checks. */
export function FileUpload({
  onFiles,
  onReject,
  accept = UPLOAD_ACCEPT,
  multiple = false,
  maxSizeMb = DEFAULT_MAX_UPLOAD_MB,
  maxFiles,
  disabled = false,
  uploading = false,
  files,
  onRemove,
  label,
  hint,
  error,
  id,
  name,
  className,
  compact = false,
}: FileUploadProps) {
  const { t } = useCommonTranslation();
  const generated = useId();
  const inputId = id ?? `upload-${generated}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  const blocked = disabled || uploading;

  const handle = (list: FileList | null) => {
    if (!list || blocked) return;
    const picked = Array.from(list);
    const accepted: File[] = [];
    const rejected: FileRejection[] = [];
    const limit = multiple ? (maxFiles ?? Infinity) : 1;
    picked.forEach((file, index) => {
      if (index >= limit) {
        rejected.push({ file, reason: 'too_many', message: t('upload.tooMany', { max: limit }) });
      } else if (!matchesAccept(file, accept)) {
        rejected.push({ file, reason: 'bad_type', message: t('upload.badType', { name: file.name }) });
      } else if (file.size > maxSizeMb * 1024 * 1024) {
        rejected.push({ file, reason: 'too_large', message: t('upload.tooLarge', { name: file.name, size: maxSizeMb }) });
      } else {
        accepted.push(file);
      }
    });
    setRejections(rejected);
    if (rejected.length) onReject?.(rejected);
    if (accepted.length) onFiles(accepted);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onZoneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (blocked || (event.target as HTMLElement).closest('label, input, button')) return;
    inputRef.current?.click();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handle(event.dataTransfer.files);
  };

  const describedBy = `${inputId}-hint`;
  const shownError = error ?? (rejections.length ? rejections.map((r) => r.message).join(' · ') : null);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={onZoneClick}
        className={cn(
          'relative flex cursor-pointer rounded-xl border-2 border-dashed text-center transition-colors',
          'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-bg',
          compact ? 'items-center gap-3 px-4 py-3 text-start' : 'flex-col items-center justify-center gap-2 px-6 py-8',
          dragging ? 'border-primary bg-primary-soft/50' : 'border-border bg-surface hover:border-border-strong',
          shownError && 'border-danger',
          blocked && 'opacity-60',
        )}
      >
        <div className={cn('flex items-center justify-center rounded-full bg-surface-2 text-muted', compact ? 'size-9' : 'size-12')}>
          {uploading ? <Spinner size="md" /> : <UploadCloud className={compact ? 'size-5' : 'size-6'} aria-hidden />}
        </div>
        <div className="min-w-0 text-sm">
          {label && <p className="font-medium text-fg">{label}</p>}
          <p className="text-muted">
            {uploading ? (
              t('upload.uploading')
            ) : (
              <>
                {t('upload.drop')}{' '}
                <label
                  htmlFor={inputId}
                  className="cursor-pointer font-semibold text-primary-ink underline-offset-4 hover:underline focus-within:underline"
                >
                  {t('upload.browse')}
                </label>
              </>
            )}
          </p>
          <p id={describedBy} className="mt-0.5 text-xs text-muted">
            {hint ?? t('upload.hint', { size: maxSizeMb })}
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={blocked}
          aria-describedby={describedBy}
          aria-invalid={shownError ? true : undefined}
          onChange={(event) => handle(event.target.files)}
          className="sr-only"
        />
      </div>
      {shownError && (
        <p role="alert" className="text-xs font-medium text-danger-ink">
          {shownError}
        </p>
      )}
      {files && files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
              {file.size !== undefined && <span className="shrink-0 text-xs text-muted tabular-nums">{formatFileSize(file.size)}</span>}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={uploading}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  aria-label={t('upload.remove', { name: file.name })}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
