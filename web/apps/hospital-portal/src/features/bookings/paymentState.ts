import type { BookingOut } from '@hig/shared/api';
import { i18n } from '@hig/shared/lib';

/** Human payment status for a booking, derived from paid / deposit / total. `tone` maps to StatusBadge colors. */
export function paymentState(b: BookingOut): { label: string; tone: string } {
  const net = b.amount_paid_minor - b.amount_refunded_minor;
  if (b.amount_refunded_minor > 0 && net <= 0) return { label: i18n.t('hospital:bookings.payment.refunded'), tone: 'reversed' };
  if (net >= b.total_minor && b.total_minor > 0) return { label: i18n.t('hospital:bookings.payment.paidInFull'), tone: 'paid' };
  if (net >= b.deposit_minor && net > 0) return { label: i18n.t('hospital:bookings.payment.depositPaid'), tone: 'eligible' };
  if (net > 0) return { label: i18n.t('hospital:bookings.payment.partiallyPaid'), tone: 'pending' };
  return { label: i18n.t('hospital:bookings.payment.awaitingPayment'), tone: 'pending_payment' };
}
