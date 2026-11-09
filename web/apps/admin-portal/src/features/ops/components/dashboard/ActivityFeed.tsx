import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BadgeCheck,
  Banknote,
  CalendarCheck,
  FilePlus2,
  FileText,
  Hospital,
  Plane,
  RefreshCw,
  Send,
  ThumbsUp,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { adminApi, CASE_STATUS_LABELS, USER_ROLE_LABELS, type AuditLogOut, type CaseStatus } from '@hig/shared/api';
import { Skeleton } from '@hig/shared/ui';
import { cn, formatDateTime, formatRelative } from '../../lib/format';
import { opsKeys } from '../../lib/mutations';
import { opsPaths } from '../../lib/paths';
import { inrCompact } from '../../lib/inr';

/** Audit actions that are noise on a work dashboard (sign-ins, consents, token refreshes). */
const HIDDEN = /^(auth\.|consent\.|agent\.patient_consent)/;

interface Described {
  icon: LucideIcon;
  tone: string;
  text: string;
  to?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function describe(l: AuditLogOut): Described {
  const after = l.after ?? {};
  const caseTo = l.entity_type === 'case' && l.entity_id ? opsPaths.case(l.entity_id) : undefined;
  const status = str(after.status) as CaseStatus | undefined;
  switch (l.action) {
    case 'case.create':
      return { icon: FilePlus2, tone: 'info', text: `opened case ${str(after.case_number) ?? ''}`.trim(), to: caseTo };
    case 'case.status_change':
      return {
        icon: RefreshCw,
        tone: 'accent',
        text: `moved a case to ${status ? (CASE_STATUS_LABELS[status] ?? status) : 'a new status'}`,
        to: caseTo,
      };
    case 'case.assign_coordinator':
      return { icon: UserCog, tone: 'neutral', text: 'assigned a coordinator to a case', to: caseTo };
    case 'quote.send':
      return {
        icon: Send,
        tone: 'info',
        text: `sent a quote${typeof after.total_minor === 'number' ? ` of ${inrCompact(after.total_minor)}` : ''}`,
        to: str(after.case_id) ? opsPaths.case(str(after.case_id)!) : undefined,
      };
    case 'quote.accept':
      return { icon: ThumbsUp, tone: 'success', text: 'accepted a quote' };
    case 'booking.confirm':
      return { icon: CalendarCheck, tone: 'success', text: 'confirmed a booking' };
    case 'booking.admit':
      return { icon: Hospital, tone: 'accent', text: 'admitted a patient' };
    case 'booking.complete':
      return { icon: BadgeCheck, tone: 'success', text: 'completed a treatment' };
    case 'payment.captured':
      return {
        icon: Banknote,
        tone: 'success',
        text: `captured a payment${typeof after.base_amount_minor === 'number' ? ` of ${inrCompact(after.base_amount_minor)}` : ''}`,
      };
    case 'hospital.approve':
    case 'agent.approve':
      return {
        icon: BadgeCheck,
        tone: 'success',
        text: `approved ${l.action.startsWith('hospital') ? 'a hospital' : 'an agent'}`,
        to: l.action.startsWith('hospital') && l.entity_id ? opsPaths.hospital(l.entity_id) : undefined,
      };
    case 'document.upload':
      return { icon: FileText, tone: 'neutral', text: 'uploaded a document' };
    default: {
      if (/^(travel_booking|visa|accommodation_booking)\./.test(l.action)) {
        return { icon: Plane, tone: 'info', text: `${l.action.split('.')[1]?.replace(/_/g, ' ') ?? 'updated'} ${l.entity_type.replace(/_/g, ' ')}` };
      }
      const [entity = l.entity_type, verb = 'update'] = l.action.split('.');
      const words = verb.split('_');
      const last = words.pop() ?? 'update';
      const object = words.length ? words.join(' ') : `${/^[aeiou]/.test(entity) ? 'an' : 'a'} ${entity.replace(/_/g, ' ')}`;
      return {
        icon: Activity,
        tone: 'neutral',
        text: `${PAST[last] ?? last} ${object}`,
        to: l.entity_type === 'hospital' && l.entity_id ? opsPaths.hospital(l.entity_id) : caseTo,
      };
    }
  }
}

const PAST: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  request: 'requested',
  submit: 'submitted',
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  upload: 'uploaded',
  verify: 'verified',
  cancel: 'cancelled',
  record: 'recorded',
  send: 'sent',
};

const TONE: Record<string, string> = {
  info: 'bg-info-soft text-info-ink',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success-ink',
  neutral: 'bg-neutral-soft text-neutral-ink',
};

export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const q = useQuery({
    queryKey: [...opsKeys.audit, 'dashboard-feed'],
    queryFn: () => adminApi.auditLogs({ page_size: 60 }),
    refetchInterval: 60_000,
  });
  if (q.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }
  if (q.isError) return <p className="py-4 text-sm text-danger-ink">Could not load recent activity.</p>;
  const rows = (q.data?.items ?? []).filter((l) => !HIDDEN.test(l.action)).slice(0, limit);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">No activity yet.</p>;
  return (
    <ol className="space-y-1">
      {rows.map((l) => {
        const d = describe(l);
        const Icon = d.icon;
        const who = l.actor_name ?? (l.actor_user_id ? 'A user' : 'System');
        const role = l.actor_role ? USER_ROLE_LABELS[l.actor_role] : null;
        const body = (
          <>
            <span className={cn('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full', TONE[d.tone])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">
                <span className="font-medium">{who}</span> {d.text}
              </span>
              <span className="block truncate text-xs text-muted">
                {role ? `${role} · ` : ''}
                <time dateTime={l.created_at} title={formatDateTime(l.created_at)}>
                  {formatRelative(l.created_at)}
                </time>
              </span>
            </span>
          </>
        );
        return (
          <li key={l.id}>
            {d.to ? (
              <Link
                to={d.to}
                className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              <div className="-mx-2 flex items-start gap-3 px-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
