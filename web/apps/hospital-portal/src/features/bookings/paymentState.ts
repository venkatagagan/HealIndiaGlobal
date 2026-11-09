import type { BookingOut } from '@hig/shared/api';

/** Human payment status for a booking, derived from paid / deposit / total. `tone` maps to StatusBadge colors. */
export function paymentState(b: BookingOut): { label: string; tone: string } {
  const net = b.amount_paid_minor - b.amount_refunded_minor;
  if (b.amount_refunded_minor > 0 && net <= 0) return { label: 'Refunded', tone: 'reversed' };
  if (net >= b.total_minor && b.total_minor > 0) return { label: 'Paid in full', tone: 'paid' };
  if (net >= b.deposit_minor && net > 0) return { label: 'Deposit paid', tone: 'eligible' };
  if (net > 0) return { label: 'Partially paid', tone: 'pending' };
  return { label: 'Awaiting payment', tone: 'pending_payment' };
}
