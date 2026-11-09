import '../../../core/models/models.dart';

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

  String get label => switch (purpose) {
    PaymentPurpose.bookingDeposit => 'Deposit due now',
    PaymentPurpose.bookingBalance => 'Balance due now',
    PaymentPurpose.bookingFull => 'Due now',
    PaymentPurpose.installment =>
      installment == null ? 'Installment due now' : 'Installment ${installment!.seq} due now',
    PaymentPurpose.consultationFee || PaymentPurpose.service => 'Due now',
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

/// "5-7 days" / "5 days" / null from a min and max stay.
String? formatStayRange(int? minDays, int? maxDays) {
  final lo = minDays ?? maxDays;
  final hi = maxDays ?? minDays;
  if (lo == null || hi == null || lo <= 0) return null;
  if (hi <= lo) return '$lo ${lo == 1 ? 'day' : 'days'}';
  return '$lo-$hi days';
}
