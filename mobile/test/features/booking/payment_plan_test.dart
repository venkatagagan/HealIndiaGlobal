import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/features/booking/logic/admission_availability.dart';
import 'package:heal_india_global/features/booking/logic/payment_plan.dart';
import 'package:heal_india_global/l10n/l10n.dart';

Booking _booking({
  PaymentOption option = PaymentOption.full,
  int total = 100000,
  int deposit = 20000,
  int paid = 0,
  BookingStatus status = BookingStatus.pendingPayment,
}) => Booking.fromJson({
  'id': 'b1',
  'booking_number': 'HIG-B-2026-000001',
  'case_id': 'c1',
  'status': status.json,
  'hospital': {'id': 'h1', 'name': 'Apollo'},
  'payment_option': option.json,
  'currency': 'INR',
  'subtotal_minor': total,
  'total_minor': total,
  'deposit_minor': deposit,
  'amount_paid_minor': paid,
  'balance_due_minor': total - paid,
});

Installment _inst(String id, int seq, InstallmentStatus status, {int amount = 25000}) => Installment.fromJson({
  'id': id,
  'booking_id': 'b1',
  'seq': seq,
  'amount_minor': amount,
  'currency': 'INR',
  'status': status.json,
  'due_date': '2026-11-0$seq',
});

void main() {
  group('computePaymentDue', () {
    test('full payment before anything is paid', () {
      final due = computePaymentDue(_booking())!;
      expect(due.purpose, PaymentPurpose.bookingFull);
      expect(due.amountMinor, 100000);
      expect(due.currency, 'INR');
    });

    test('full payment with a partial payment becomes a balance', () {
      final due = computePaymentDue(_booking(paid: 30000))!;
      expect(due.purpose, PaymentPurpose.bookingBalance);
      expect(due.amountMinor, 70000);
    });

    test('deposit option: deposit first, then balance', () {
      final first = computePaymentDue(_booking(option: PaymentOption.deposit))!;
      expect(first.purpose, PaymentPurpose.bookingDeposit);
      expect(first.amountMinor, 20000);

      final partial = computePaymentDue(_booking(option: PaymentOption.deposit, paid: 5000))!;
      expect(partial.purpose, PaymentPurpose.bookingDeposit);
      expect(partial.amountMinor, 15000);

      final after = computePaymentDue(
        _booking(option: PaymentOption.deposit, paid: 20000, status: BookingStatus.confirmed),
      )!;
      expect(after.purpose, PaymentPurpose.bookingBalance);
      expect(after.amountMinor, 80000);
    });

    test('installments: next payable installment by seq', () {
      final due = computePaymentDue(
        _booking(option: PaymentOption.installments, paid: 25000),
        installments: [
          _inst('i3', 3, InstallmentStatus.due),
          _inst('i1', 1, InstallmentStatus.paid),
          _inst('i2', 2, InstallmentStatus.overdue),
        ],
      )!;
      expect(due.purpose, PaymentPurpose.installment);
      expect(due.installment!.id, 'i2');
      expect(due.amountMinor, 25000);
      expect(due.label(L10n.current), 'Installment 2 due now');
    });

    test('installments without a schedule fall back to the deposit', () {
      final due = computePaymentDue(_booking(option: PaymentOption.installments))!;
      expect(due.purpose, PaymentPurpose.bookingDeposit);
      expect(due.amountMinor, 20000);
    });

    test('explicit installment id must be payable', () {
      final installments = [_inst('i1', 1, InstallmentStatus.paid), _inst('i2', 2, InstallmentStatus.due)];
      final b = _booking(option: PaymentOption.installments, paid: 25000);
      expect(computePaymentDue(b, installments: installments, installmentId: 'i1'), isNull);
      expect(computePaymentDue(b, installments: installments, installmentId: 'nope'), isNull);
      expect(computePaymentDue(b, installments: installments, installmentId: 'i2')!.installment!.seq, 2);
    });

    test('nothing due when fully paid or cancelled', () {
      expect(computePaymentDue(_booking(paid: 100000, status: BookingStatus.confirmed)), isNull);
      expect(computePaymentDue(_booking(status: BookingStatus.cancelled)), isNull);
    });
  });

  group('formatStayRange', () {
    test('formats ranges and single values', () {
      expect(formatStayRange(5, 7), '5-7 days');
      expect(formatStayRange(5, 5), '5 days');
      expect(formatStayRange(1, null), '1 day');
      expect(formatStayRange(null, 10), '10 days');
      expect(formatStayRange(null, null), isNull);
      expect(formatStayRange(0, null), isNull);
    });
  });

  group('AdmissionAvailability', () {
    final now = DateTime(2026, 10, 21, 15);
    AvailabilitySlot slot(String date, String kind, int capacity, int booked) =>
        AvailabilitySlot.fromJson({'date': date, 'slot_kind': kind, 'capacity': capacity, 'booked': booked});

    test('restricted to admission slots with free capacity, strictly after today', () {
      final a = AdmissionAvailability.fromSlots([
        slot('2026-10-21', 'admission', 2, 0),
        slot('2026-10-22', 'admission', 2, 2),
        slot('2026-10-23', 'admission', 2, 1),
        slot('2026-10-24', 'consultation', 5, 0),
      ]);
      expect(a.restricted, isTrue);
      expect(a.isAvailable(DateTime(2026, 10, 21), now: now), isFalse, reason: 'today is never bookable');
      expect(a.isAvailable(DateTime(2026, 10, 22), now: now), isFalse, reason: 'fully booked');
      expect(a.isAvailable(DateTime(2026, 10, 23), now: now), isTrue);
      expect(a.isAvailable(DateTime(2026, 10, 24), now: now), isFalse, reason: 'consultation only');
      expect(a.freeOn(DateTime(2026, 10, 23)), 1);
      expect(a.firstAvailableIn(DateTime(2026, 10), now: now), DateTime(2026, 10, 23));
    });

    test('unrestricted when the hospital publishes no admission slots', () {
      final a = AdmissionAvailability.fromSlots([slot('2026-10-24', 'consultation', 5, 0)]);
      expect(a.restricted, isFalse);
      expect(a.isAvailable(DateTime(2026, 10, 22), now: now), isTrue);
      expect(a.isAvailable(DateTime(2026, 10, 20), now: now), isFalse);
      expect(a.freeOn(DateTime(2026, 10, 22)), isNull);
    });
  });
}
