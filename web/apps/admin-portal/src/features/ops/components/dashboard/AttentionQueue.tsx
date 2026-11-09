import type { ComponentType } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileClock,
  Hourglass,
  Landmark,
  LifeBuoy,
  ReceiptText,
  RotateCcw,
  Scale,
  Siren,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type { DashboardOverview, UserRole } from '@hig/shared/api';
import { Skeleton } from '@hig/shared/ui';
import { cn } from '../../lib/format';
import { opsPaths } from '../../lib/paths';
import { financePath } from '../../../finance/paths';
import type { FinanceReviewCounts } from '../../../finance/api/queries';
import { ageText, hoursSince } from './widgets';

type Tone = 'danger' | 'warning' | 'info' | 'accent';
type Audience = 'ops' | 'partners' | 'finance';

export interface AttentionDef {
  key: string;
  label: string;
  description: string;
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  to: string;
  audience: Audience;
  /** hours after which the oldest item counts as late (age chip turns red) */
  lateAfterHours?: number;
}

const OPEN_CASE_STATUSES = 'enquiry,quoted,accepted';

/** Date (YYYY-MM-DD, local) `hours` ago - used to pre-filter "created before" on the cases list. */
function dateHoursAgo(hours: number): string {
  const d = new Date(Date.now() - hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function opsAttentionDefs(slaHours: number): AttentionDef[] {
  return [
    {
      key: 'emergency_cases',
      label: 'Emergency screenings',
      description: 'Open cases the AI screening flagged as a possible emergency',
      tone: 'danger',
      icon: Siren,
      to: `${opsPaths.cases}?urgency=emergency&status=${OPEN_CASE_STATUSES}&sort=created_at`,
      audience: 'ops',
      lateAfterHours: 1,
    },
    {
      key: 'open_sos',
      label: 'Open SOS alerts',
      description: 'Patients in India asking for urgent help',
      tone: 'danger',
      icon: LifeBuoy,
      to: `${opsPaths.travel}?tab=sos&status=open`,
      audience: 'ops',
      lateAfterHours: 0.25,
    },
    {
      key: 'quotes_overdue',
      label: 'Quotes past SLA',
      description: `Enquiries waiting more than ${slaHours} h for the hospital's quote`,
      tone: 'warning',
      icon: FileClock,
      to: `${opsPaths.cases}?status=enquiry&date_field=created&to=${dateHoursAgo(slaHours)}&sort=created_at`,
      audience: 'ops',
      lateAfterHours: slaHours * 2,
    },
    {
      key: 'unassigned_enquiries',
      label: 'Unassigned enquiries',
      description: 'New enquiries without a coordinator',
      tone: 'warning',
      icon: UserPlus,
      to: `${opsPaths.cases}?status=enquiry&coordinator=unassigned&sort=created_at`,
      audience: 'ops',
      lateAfterHours: 24,
    },
    {
      key: 'quotes_awaiting_patient',
      label: 'Awaiting patient decision',
      description: 'Quotes sent that the patient has not accepted yet',
      tone: 'info',
      icon: Hourglass,
      to: `${opsPaths.cases}?status=quoted&sort=updated_at`,
      audience: 'ops',
      lateAfterHours: 24 * 7,
    },
    {
      key: 'hospitals_pending',
      label: 'Hospitals to review',
      description: 'Hospital profiles submitted for approval',
      tone: 'accent',
      icon: Building2,
      to: `${opsPaths.hospitals}?status=pending_review`,
      audience: 'partners',
      lateAfterHours: 72,
    },
    {
      key: 'agents_pending',
      label: 'Agents to approve',
      description: 'Agent sign-ups waiting for approval',
      tone: 'accent',
      icon: BadgeCheck,
      to: `${opsPaths.agents}?status=pending`,
      audience: 'partners',
      lateAfterHours: 72,
    },
    {
      key: 'agent_kyc_pending',
      label: 'Agent KYC to verify',
      description: 'Agents whose KYC documents await verification',
      tone: 'accent',
      icon: ClipboardCheck,
      to: `${opsPaths.agents}?kyc_status=pending`,
      audience: 'partners',
      lateAfterHours: 72,
    },
    {
      key: 'payout_accounts_unverified',
      label: 'Payout accounts to verify',
      description: 'Bank accounts that need a second finance user to verify',
      tone: 'warning',
      icon: Landmark,
      to: `${financePath('payout-accounts')}?verified=false`,
      audience: 'finance',
      lateAfterHours: 72,
    },
  ];
}

/** Finance maker-checker queues (counts from useFinanceReviewCounts; no age available). */
export const FINANCE_ATTENTION: (Omit<AttentionDef, 'key'> & { key: keyof FinanceReviewCounts })[] = [
  { key: 'markPaidApprovals', label: 'Bank transfers to approve', description: 'Mark-paid requests awaiting a second finance user', tone: 'warning', icon: ReceiptText, to: `${financePath('reconciliation')}?status=approval`, audience: 'finance' },
  { key: 'refunds', label: 'Refunds to approve', description: 'Refund requests awaiting approval', tone: 'warning', icon: RotateCcw, to: `${financePath('refunds')}?status=requested`, audience: 'finance' },
  { key: 'batches', label: 'Settlement batches to approve', description: 'Batches awaiting a second approver', tone: 'warning', icon: Wallet, to: `${financePath('settlements/batches')}?status=pending_approval`, audience: 'finance' },
  { key: 'payoutConfirmations', label: 'Payouts to confirm', description: 'Payouts with a UTR awaiting a second finance user', tone: 'warning', icon: CheckCircle2, to: `${financePath('settlements/payouts')}?queue=confirm`, audience: 'finance' },
  { key: 'payoutReversals', label: 'Payout failures to approve', description: 'Failure / reversal requests awaiting a second approver', tone: 'warning', icon: RotateCcw, to: `${financePath('settlements/payouts')}?queue=reversal`, audience: 'finance' },
  { key: 'payoutReconciliations', label: 'Payouts to reconcile', description: 'Gateway outcome unknown - check the bank statement', tone: 'danger', icon: Scale, to: `${financePath('settlements/payouts')}?queue=reconcile`, audience: 'finance' },
  { key: 'amountReviews', label: 'Amount differences', description: 'Orders paid with a different amount than requested', tone: 'warning', icon: Scale, to: `${financePath('orders')}?review=amount`, audience: 'finance' },
  { key: 'adjustments', label: 'Ledger adjustments', description: 'Manual adjustments awaiting approval', tone: 'warning', icon: ClipboardCheck, to: `${financePath('ledger/adjustments')}?status=pending_approval`, audience: 'finance' },
];

/** Which queues each role works on (super_admin sees everything). */
export function audiencesFor(role: UserRole | null | undefined): Audience[] {
  switch (role) {
    case 'support':
      return ['ops'];
    case 'admin':
      return ['ops', 'partners'];
    case 'finance':
      return ['finance'];
    case 'super_admin':
      return ['ops', 'partners', 'finance'];
    default:
      return ['ops'];
  }
}

const TONE: Record<Tone, { tile: string; ring: string }> = {
  danger: { tile: 'bg-danger-soft text-danger-ink', ring: 'border-danger/40 bg-danger-soft/40 dark:bg-danger-soft/10' },
  warning: { tile: 'bg-warning-soft text-warning-ink', ring: '' },
  info: { tile: 'bg-info-soft text-info-ink', ring: '' },
  accent: { tile: 'bg-accent-soft text-accent-ink', ring: '' },
};

interface QueueItem {
  def: Omit<AttentionDef, 'key'> & { key: string };
  count: number | null;
  oldestAt: string | null;
}

function QueueCard({ item }: { item: QueueItem }) {
  const { def, count, oldestAt } = item;
  const Icon = def.icon;
  const age = ageText(oldestAt);
  const late = def.lateAfterHours !== undefined && hoursSince(oldestAt) > def.lateAfterHours;
  const urgent = def.tone === 'danger';
  return (
    <Link
      to={def.to}
      aria-label={`${def.label}: ${count ?? 0}${age ? `, oldest waiting ${age}` : ''}`}
      className={cn(
        'group flex min-w-0 flex-col rounded-xl border border-border bg-surface p-3 shadow-card transition-colors sm:p-4',
        'hover:border-border-strong hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        urgent && TONE.danger.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('inline-flex size-9 items-center justify-center rounded-lg', TONE[def.tone].tile)}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none text-fg sm:text-3xl">{count ?? '—'}</p>
      <p className="mt-2 text-sm font-medium text-fg">{def.label}</p>
      <p className="mt-0.5 line-clamp-2 hidden text-xs text-muted sm:block">{def.description}</p>
      {age && (
        <div className="mt-auto pt-3">
        <p
          className={cn(
            'inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
            late ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-muted',
          )}
        >
          <Clock className="size-3" aria-hidden />
          <span className="hidden sm:inline">Oldest waiting</span>
          <span className="sm:hidden">Oldest</span> {age}
        </p>
        </div>
      )}
    </Link>
  );
}

export function AttentionQueue({
  overview,
  loading,
  role,
  finance,
}: {
  overview: DashboardOverview | undefined;
  loading: boolean;
  role: UserRole | null | undefined;
  finance: FinanceReviewCounts | undefined;
}) {
  const audiences = audiencesFor(role);
  const byKey = new Map((overview?.attention ?? []).map((a) => [a.key, a]));
  const items: QueueItem[] = [
    ...opsAttentionDefs(overview?.quote_sla_hours ?? 48)
      .filter((d) => audiences.includes(d.audience))
      .map((def) => ({ def, count: byKey.get(def.key)?.count ?? (overview ? 0 : null), oldestAt: byKey.get(def.key)?.oldest_at ?? null })),
    ...(audiences.includes('finance')
      ? FINANCE_ATTENTION.map((def) => ({ def, count: finance ? finance[def.key] : null, oldestAt: null }))
      : []),
  ];

  if (loading && !overview) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  const active = items.filter((i) => (i.count ?? 0) > 0);
  const clear = items.filter((i) => i.count === 0);

  return (
    <div>
      {active.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {active.map((item) => (
            <QueueCard key={item.def.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-4 shadow-card">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-success-soft text-success-ink">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">You are all caught up</p>
            <p className="text-xs text-muted">Nothing in your queues needs action right now.</p>
          </div>
        </div>
      )}
      {clear.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 inline-flex items-center gap-1 font-medium text-muted">
            <CheckCircle2 className="size-3.5 text-success-ink" aria-hidden />
            All clear:
          </span>
          {clear.map((i) => (
            <Link
              key={i.def.key}
              to={i.def.to}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-muted hover:border-border-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {i.def.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
