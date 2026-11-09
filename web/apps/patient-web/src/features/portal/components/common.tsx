import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, FileUp, Star } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage, humanize, type DocumentKind, type DocumentOut, type Uuid } from '@hig/shared/api';
import { useUploadDocument } from '../api/queries';
import { cn, formatMoney, formatMoneyRange } from '../lib/shared';
import { Badge, Button, type Tone } from '../ui/primitives';

const STATUS_TONES: Record<string, Tone> = {
  // cases
  enquiry: 'blue',
  quoted: 'violet',
  accepted: 'green',
  booked: 'green',
  in_treatment: 'amber',
  declined: 'red',
  // bookings
  pending_payment: 'amber',
  confirmed: 'green',
  admitted: 'blue',
  completed: 'green',
  cancelled: 'neutral',
  // quotes
  draft: 'neutral',
  sent: 'violet',
  rejected: 'red',
  expired: 'neutral',
  withdrawn: 'neutral',
  // orders / payments
  created: 'amber',
  pending: 'amber',
  paid: 'green',
  failed: 'red',
  refunded: 'blue',
  partially_refunded: 'blue',
  captured: 'green',
  // services
  requested: 'amber',
  // visa
  not_started: 'neutral',
  documents_pending: 'amber',
  invitation_issued: 'violet',
  applied: 'blue',
  approved: 'green',
  // installments
  due: 'amber',
  overdue: 'red',
  // documents
  uploaded: 'neutral',
  verified: 'green',
  // screening
  processing: 'violet',
  // checklist / itinerary
  in_progress: 'amber',
  done: 'green',
  scheduled: 'blue',
  // urgency
  routine: 'green',
  soon: 'blue',
  urgent: 'amber',
  emergency: 'red',
};

const STATUS_LABEL_OVERRIDES: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  enquiry: 'Enquiry sent',
  in_treatment: 'In treatment',
};

export function statusTone(status: string | null | undefined): Tone {
  return (status && STATUS_TONES[status]) || 'neutral';
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  return (
    <Badge tone={statusTone(status)} className={className}>
      {STATUS_LABEL_OVERRIDES[status] ?? humanize(status)}
    </Badge>
  );
}

export function Money({
  minor,
  currency,
  className,
  trim,
}: {
  minor: number | null | undefined;
  currency: string | null | undefined;
  className?: string;
  trim?: boolean;
}) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(minor, currency, undefined, { trimZeros: trim })}</span>;
}

export function MoneyRange({
  min,
  max,
  currency,
  className,
}: {
  min: number | null | undefined;
  max: number | null | undefined;
  currency: string | null | undefined;
  className?: string;
}) {
  return <span className={cn('tabular-nums', className)}>{formatMoneyRange(min, max, currency)}</span>;
}

export function Rating({ value, count }: { value: number | null | undefined; count?: number }) {
  if (value === null || value === undefined) return <span className="text-sm text-muted">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-fg">
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-semibold">{Number(value).toFixed(1)}</span>
      {count !== undefined ? <span className="text-muted">({count} reviews)</span> : null}
    </span>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const initials = name
    .replace(/^(dr\.?\s+)/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.max(11, size / 2.8) }}
    >
      {initials || '?'}
    </span>
  );
}

export const ACCEPTED_UPLOAD_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.dcm,application/pdf,image/*,application/dicom';
/** client-side guard only; the API enforces MAX_UPLOAD_MB and magic bytes */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Button that opens a file picker and uploads via POST /documents. */
export function UploadButton({
  kind,
  caseId,
  onUploaded,
  label = 'Upload',
  variant = 'outline',
  size = 'md',
  multiple = false,
}: {
  kind: DocumentKind;
  caseId?: Uuid;
  onUploaded?: (doc: DocumentOut) => void;
  label?: string;
  variant?: 'outline' | 'primary' | 'secondary';
  size?: 'sm' | 'md';
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument();
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`${file.name} is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`);
          continue;
        }
        try {
          const doc = await upload.mutateAsync({ file, kind, case_id: caseId });
          toast.success(`${file.name} uploaded`);
          onUploaded?.(doc);
        } catch (err) {
          toast.error(`${file.name}: ${errorMessage(err)}`);
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_UPLOAD_TYPES}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        variant={variant}
        size={size}
        loading={busy}
        icon={<FileUp className="h-4 w-4" aria-hidden />}
        onClick={() => inputRef.current?.click()}
        aria-label={label ? undefined : 'Attach a file'}
      >
        {label}
      </Button>
    </>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Accreditation chips (JCI/NABH/...) */
export function Accreditations({ values }: { values: string[] }) {
  if (!values.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {values.map((a) => (
        <Badge key={a} tone="blue" className="uppercase">
          {a}
        </Badge>
      ))}
    </span>
  );
}
