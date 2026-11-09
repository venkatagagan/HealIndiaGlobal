/** URL base of the finance console inside the admin portal. */
export const FINANCE_BASE = '/finance';

/** financePath('orders') -> "/finance/orders"; financePath() -> "/finance" */
export function financePath(sub = ''): string {
  const clean = sub.replace(/^\/+/, '');
  return clean ? `${FINANCE_BASE}/${clean}` : FINANCE_BASE;
}
