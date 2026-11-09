import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/trips/widgets/case_widgets.dart';

Booking _booking(List<Object?>? policy) => Booking.fromJson({
  'id': 'b1',
  'booking_number': 'HIG-B-1',
  'case_id': 'c1',
  'status': 'confirmed',
  'hospital': {'id': 'h1', 'name': 'Apollo'},
  'payment_option': 'full',
  'currency': 'USD',
  'refund_policy': policy,
});

Future<void> _pump(WidgetTester tester, Booking b) async {
  AppTextStyles.useGoogleFonts = false;
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(body: RefundPolicyCard(booking: b)),
    ),
  );
}

void main() {
  test('refund_policy parses and sorts tiers (highest days_before first)', () {
    final b = _booking([
      {'days_before': 0, 'refund_pct': 0},
      {'days_before': 30, 'refund_pct': 100},
      {'days_before': 7, 'refund_pct': 50},
    ]);
    expect([for (final t in b.refundPolicy) t.daysBefore], [30, 7, 0]);
    expect(Booking.fromJson(b.toJson()).refundPolicy.length, 3);
    expect(_booking(null).refundPolicy, isEmpty);
  });

  testWidgets('the booking shows its snapshotted refund tiers', (tester) async {
    await _pump(
      tester,
      _booking([
        {'days_before': 30, 'refund_pct': 100},
        {'days_before': 7, 'refund_pct': 50},
        {'days_before': 0, 'refund_pct': 0},
      ]),
    );
    expect(find.text('• 30+ days before admission: 100% refund'), findsOneWidget);
    expect(find.text('• 7+ days before admission: 50% refund'), findsOneWidget);
    expect(find.text('• Less than 7 days before admission: no refund'), findsOneWidget);
    expect(find.textContaining('Locked in for this booking'), findsOneWidget);
  });

  testWidgets('without a snapshot the general policy note is shown', (tester) async {
    await _pump(tester, _booking(null));
    expect(find.textContaining('in force when your booking is confirmed'), findsOneWidget);
  });
}
