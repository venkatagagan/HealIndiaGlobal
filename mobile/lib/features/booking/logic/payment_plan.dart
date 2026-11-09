import '../../../core/models/models.dart';
import '../../../l10n/l10n.dart';

/// What the patient owes right now on a booking, and which [PaymentPurpose] the order must use.
///
/// Amounts are in the booking / installment pricing currency (usually INR). The server derives the
/// real charge (and converts it to the patient's currency); this is only for display and for choosing
/// the purpose sent to `POST /payments/orders`.
class PaymentDue {
  const PaymentDue({required this.purpose, required this.amountMinor, required this.currency, this.installment});

  final PaymentPurpose purpose;
  final int amountMinor;
  final String currency;

  /// Set when [purpose] is [PaymentPurpose.installment].
  final Installment? installment;

  /// "Deposit due now" / "Installment 2 due now" ... in the language of [l10n].
  String label(AppLocalizations l10n) => switch (purpose) {
    PaymentPurpose.bookingDeposit => l10n.paymentDueDeposit,
    PaymentPurpose.bookingBalance => l10n.paymentDueBalance,
    PaymentPurpose.bookingFull => l10n.paymentDueNow,
    PaymentPurpose.installment =>
      installment == null ? l10n.paymentDueInstallment : l10n.paymentDueInstallmentSeq(installment!.seq),
    PaymentPurpose.consultationFee || PaymentPurpose.service => l10n.paymentDueNow,
  };
}

/// Next payable installment (lowest `seq` that is due / overdue), if any.
Installment? nextPayableInstallment(List<Installment> installments) {
  final payable = installments.where((i) => i.isPayable).toList()..sort((a, b) => a.seq.compareTo(b.seq));
  return payable.isEmpty ? null : payable.first;
}

/// Computes the amount due now for [booking]. Returns null when nothing is payable (fully paid,
/// cancelled, or an unknown / already-paid [installmentId]).
PaymentDue? computePaymentDue(Booking booking, {List<Installment> installments = const [], String? installmentId}) {
  if (booking.status == BookingStatus.cancelled) return null;
  final remaining = booking.balanceDueMinor;
  if (remaining <= 0) return null;
  final ccy = booking.currency;

  if (installmentId != null) {
    final match = installments.where((i) => i.id == installmentId);
    if (match.isEmpty || !match.first.isPayable) return null;
    final inst = match.first;
    return PaymentDue(
      purpose: PaymentPurpose.installment,
      amountMinor: inst.amountMinor,
      currency: inst.currency,
      installment: inst,
    );
  }

  final paid = booking.amountPaidMinor - booking.amountRefundedMinor;
  final depositOutstanding = booking.depositMinor - paid;

  switch (booking.paymentOption) {
    case PaymentOption.installments:
      final next = nextPayableInstallment(installments);
      if (next != null) {
        return PaymentDue(
          purpose: PaymentPurpose.installment,
          amountMinor: next.amountMinor,
          currency: next.currency,
          installment: next,
        );
      }
      if (depositOutstanding > 0) {
        return PaymentDue(
          purpose: PaymentPurpose.bookingDeposit,
          amountMinor: depositOutstanding < remaining ? depositOutstanding : remaining,
          currency: ccy,
        );
      }
      return PaymentDue(purpose: PaymentPurpose.bookingBalance, amountMinor: remaining, currency: ccy);
    case PaymentOption.deposit:
      if (depositOutstanding > 0) {
        return PaymentDue(
          purpose: PaymentPurpose.bookingDeposit,
          amountMinor: depositOutstanding < remaining ? depositOutstanding : remaining,
          currency: ccy,
        );
      }
      return PaymentDue(purpose: PaymentPurpose.bookingBalance, amountMinor: remaining, currency: ccy);
    case PaymentOption.full:
      return PaymentDue(
        purpose: paid <= 0 ? PaymentPurpose.bookingFull : PaymentPurpose.bookingBalance,
        amountMinor: remaining,
        currency: ccy,
      );
  }
}

/// "5-7 days" / "5 days" / null from a min and max stay ([l10n] defaults to the current app language).
String? formatStayRange(int? minDays, int? maxDays, [AppLocalizations? l10n]) {
  final l = l10n ?? L10n.current;
  final lo = minDays ?? maxDays;
  final hi = maxDays ?? minDays;
  if (lo == null || hi == null || lo <= 0) return null;
  if (hi <= lo) return l.bookingStayDays(lo);
  return l.bookingStayDaysRange(lo, hi);
}
