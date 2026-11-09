import { useId, useState, type ReactNode } from 'react';
import { Flag } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { errorMessage, isApiError } from '../api/client';
import { reportsApi } from '../api/endpoints/reports';
import type { ReportReason, ReportTargetType, Uuid } from '../api/types';
import { cn } from '../lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { toast } from './feedback';
import { FormField, Textarea } from './form';
import { Modal } from './overlay';

/** CG-16 copy shown after a report was accepted. */
export const REPORT_SENT_MESSAGE = 'Thanks. Our team will review this report.';

const NOTE_MAX = 1000;

const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  abusive: 'Abusive or harassing',
  inappropriate: 'Inappropriate',
  inaccurate: 'Inaccurate or misleading',
  privacy: 'Privacy concern',
  other: 'Other',
};

/** Reasons offered per target: people's messages vs. AI results (where "inaccurate" is the common case). */
export function reportReasonsFor(targetType: ReportTargetType): ReportReason[] {
  if (targetType === 'screening_result' || targetType === 'document_analysis') {
    return ['inaccurate', 'inappropriate', 'privacy', 'other'];
  }
  return ['spam', 'abusive', 'inappropriate', 'privacy', 'other'];
}

export function reportReasonLabel(reason: string): string {
  return REASON_LABELS[reason as ReportReason] ?? reason;
}

const TITLES: Record<ReportTargetType, string> = {
  message: 'Report this message',
  screening_result: 'Report this result',
  document_analysis: 'Report this result',
  review: 'Report this review',
};

export interface ReportContentDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: Uuid;
  /** override the dialog title */
  title?: ReactNode;
  /** called after the report was accepted (the dialog closes and a toast is shown) */
  onReported?: () => void;
}

/**
 * Small dialog for POST /reports: pick a reason, add an optional note. Shows the "Thanks. Our team will review
 * this report." toast on success. Use `<ReportButton>` for the common "button + dialog" case.
 */
export function ReportContentDialog({ open, onClose, targetType, targetId, title, onReported }: ReportContentDialogProps) {
  const id = useId();
  const formId = `${id}-report-form`;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const report = useMutation({ mutationFn: reportsApi.createReport });

  const close = () => {
    if (report.isPending) return;
    setReason(null);
    setNote('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!reason) {
      setError('Choose a reason.');
      return;
    }
    setError(null);
    try {
      const trimmed = note.trim();
      await report.mutateAsync({
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(trimmed ? { note: trimmed.slice(0, NOTE_MAX) } : {}),
      });
      toast.success(REPORT_SENT_MESSAGE);
      onReported?.();
      setReason(null);
      setNote('');
      onClose();
    } catch (err) {
      if (isApiError(err) && err.status === 429) setError('You have sent a lot of reports. Please try again later.');
      else if (isApiError(err) && err.status === 404) setError('This item is no longer available.');
      else setError(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={title ?? TITLES[targetType]}
      description="Tell us what is wrong. Your report is private and goes to our team."
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={report.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={report.isPending}>
            Send report
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">Reason</legend>
          {reportReasonsFor(targetType).map((value) => {
            const optionId = `${id}-reason-${value}`;
            return (
              <div key={value} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  id={optionId}
                  name={`${id}-reason`}
                  value={value}
                  checked={reason === value}
                  onChange={() => {
                    setReason(value);
                    setError(null);
                  }}
                  className="size-4 shrink-0 cursor-pointer border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label htmlFor={optionId} className="cursor-pointer text-sm text-fg">
                  {REASON_LABELS[value]}
                </label>
              </div>
            );
          })}
        </fieldset>
        <FormField label="Note" optional hint={`Up to ${NOTE_MAX} characters.`}>
          <Textarea
            name="note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger-ink">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export interface ReportButtonProps extends Omit<ReportContentDialogProps, 'open' | 'onClose'> {
  /** button text (default "Report") */
  label?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** accessible name when the visible label is short (e.g. "Report message from Dr Rao") */
  'aria-label'?: string;
}

/** "Report" button that opens `<ReportContentDialog>`. */
export function ReportButton({
  label = 'Report',
  variant = 'ghost',
  size = 'xs',
  className,
  'aria-label': ariaLabel,
  ...dialog
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        className={cn('text-muted', className)}
        icon={<Flag className="size-3.5" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ReportContentDialog {...dialog} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
