import { humanize } from '@hig/shared/api';

export { formatDateTime, formatMoneyRange } from '../../lib/format';

/** ["left_knee", "lower_back"] -> "Left knee, Lower back" */
export function humanList(values: readonly string[] | null | undefined): string {
  if (!values || values.length === 0) return '—';
  return values.map((v) => humanize(v)).join(', ');
}
