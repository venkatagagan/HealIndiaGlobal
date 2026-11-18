import type { PatientProfileOut } from '@hig/shared/api';
import { formatNumber, i18n } from '@hig/shared/lib';

export function patientName(p: Pick<PatientProfileOut, 'first_name' | 'last_name'> & { full_name?: string | null }): string {
  const joined = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return p.full_name?.trim() || joined || i18n.t('agent:common.unnamedPatient');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, { maximumFractionDigits: 0 })} KB`;
  return `${formatNumber(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

/** "AGT7K2QX" style values and file names are shown as-is; snake_case labels are humanized elsewhere */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
