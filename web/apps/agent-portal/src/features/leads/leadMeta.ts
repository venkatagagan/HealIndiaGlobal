import type { QueryClient } from '@tanstack/react-query';
import type { LeadOut, LeadSource, LeadStatus } from '@hig/shared/api';
import type { BadgeTone } from '../../components/ui';

/** react-query keys of the CRM */
export const leadKeys = {
  all: ['crm-leads'] as const,
  list: (params: object) => ['crm-leads', 'list', params] as const,
  column: (status: LeadStatus, params: object) => ['crm-leads', 'column', status, params] as const,
  pipeline: (params: object) => ['crm-leads', 'pipeline', params] as const,
  lead: (id: string) => ['crm-leads', 'lead', id] as const,
};

export function invalidateLeads(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: leadKeys.all });
}

export const LEAD_STATUS_TONES: Record<LeadStatus, BadgeTone> = {
  new: 'info',
  contacted: 'accent',
  qualified: 'accent',
  screening: 'warning',
  quote_requested: 'warning',
  won: 'success',
  lost: 'neutral',
};

/** top border colour of a board column */
export const LEAD_STATUS_BAR: Record<LeadStatus, string> = {
  new: 'border-t-sky-500',
  contacted: 'border-t-violet-500',
  qualified: 'border-t-fuchsia-500',
  screening: 'border-t-amber-500',
  quote_requested: 'border-t-orange-500',
  won: 'border-t-emerald-500',
  lost: 'border-t-slate-400',
};

export const LEAD_SOURCE_TONES: Record<LeadSource, BadgeTone> = {
  walk_in: 'neutral',
  whatsapp: 'success',
  facebook: 'info',
  referral: 'accent',
  event: 'warning',
  other: 'neutral',
};

/** follow-up is before today (local time) */
export function isOverdue(lead: Pick<LeadOut, 'next_follow_up_at' | 'status'>): boolean {
  if (!lead.next_follow_up_at || lead.status === 'won' || lead.status === 'lost') return false;
  const due = new Date(lead.next_follow_up_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

/** ISO timestamp -> value of an <input type="datetime-local"> (local time) */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO timestamp (null when empty/invalid) */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Jane Mary Doe" -> { first: "Jane Mary", last: "Doe" } (a single word is both the first and last name) */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: parts[0]! };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! };
}
