import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/messaging_repository.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/core/router/routes.dart';
import 'package:heal_india_global/core/theme/app_text_styles.dart';
import 'package:heal_india_global/features/trips/screens/trips_screen.dart';

import 'journey_test_helpers.dart';

PatientDashboard _dashboard({bool withBooking = true}) => PatientDashboard.fromJson({
  'next_booking': withBooking
      ? {
          'id': 'b1',
          'booking_number': 'HIG-B-2026-000001',
          'case_id': 'c1',
          'status': 'confirmed',
          'hospital': {'id': 'h1', 'name': 'Apollo Hospitals', 'city': 'New Delhi'},
          'payment_option': 'deposit',
          'currency': 'USD',
          'total_minor': 400000,
          'deposit_minor': 80000,
          'amount_paid_minor': 80000,
          'amount_refunded_minor': 0,
          'admission_date': '2099-11-10',
        }
      : null,
  'days_until_treatment': withBooking ? 23 : null,
  'checklist': [
    {'id': 'k3', 'key': 'visa_approved', 'label': 'Visa Approved', 'status': 'pending', 'sort_order': 3},
    {'id': 'k1', 'key': 'treatment_booked', 'label': 'Treatment Booked', 'status': 'done', 'sort_order': 1},
    {'id': 'k2', 'key': 'flight_booked', 'label': 'Flight Booking', 'status': 'in_progress', 'sort_order': 2},
  ],
  'today_schedule': [],
  'active_cases': 1,
  'unread_notifications': 2,
  'coordinator': {'id': 'u9', 'full_name': 'Priya', 'phone': '+91 90000 00000'},
  'recent_screenings': [],
});

Future<void> _pump(WidgetTester tester, PatientDashboard dashboard) async {
  AppTextStyles.useGoogleFonts = false;
  // Wide viewport: the square test-font glyphs would wrap the BrandHeader tagline (fixed 48 px) on a phone width.
  tester.view.devicePixelRatio = 2.5;
  tester.view.physicalSize = const Size(640, 1600) * 2.5;
  addTearDown(tester.view.reset);
  final overrides = [
    ...await journeyBaseOverrides(),
    patientDashboardProvider.overrideWith((ref) async => dashboard),
    unreadNotificationsCountProvider.overrideWith((ref) async => 2),
    fxRatesProvider.overrideWith((ref) async => const {'USD': 83.0}),
  ];
  final routes = <RouteBase>[
    GoRoute(path: Routes.trips, builder: (_, _) => const TripsScreen()),
    stubRoute('/documents', 'documents'),
    stubRoute('/cases', 'cases'),
    stubRoute('/cases/:id', 'case', param: 'id'),
    stubRoute('/support', 'support'),
    stubRoute('/notifications', 'notifications'),
    stubRoute('/pay/:id', 'pay', param: 'id'),
    stubRoute('/home', 'home'),
    stubRoute('/screening/new', 'screening'),
  ];
  await tester.pumpWidget(journeyApp(overrides: overrides, routes: routes, initialLocation: Routes.trips));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('pre-arrival dashboard: countdown, ordered checklist, balance and quick actions', (tester) async {
    await _pump(tester, _dashboard());

    expect(find.text('Until Treatment'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const ValueKey('countdown-days'))).data, '23');

    // Checklist is ordered by sort_order with done / active / pending states.
    final labels = ['Treatment Booked', 'Flight Booking', 'Visa Approved'];
    final ys = [for (final l in labels) tester.getTopLeft(find.text(l)).dy];
    expect(ys, orderedEquals([...ys]..sort()));
    expect(find.bySemanticsLabel(RegExp('Treatment Booked, Done', caseSensitive: false)), findsOneWidget);

    // Deposit paid, balance outstanding -> "Pay now".
    expect(find.text('Pay now'), findsOneWidget);

    for (final key in ['qa-documents', 'qa-chat', 'qa-emergency', 'qa-guide']) {
      expect(find.byKey(ValueKey(key)), findsOneWidget);
    }

    await tester.tap(find.byKey(const ValueKey('qa-documents')));
    await tester.pumpAndSettle();
    expect(find.text('documents'), findsOneWidget);
  });

  testWidgets('treatment-booked checklist item opens the case; emergency contacts sheet', (tester) async {
    await _pump(tester, _dashboard());

    await tester.tap(find.byKey(const ValueKey('qa-emergency')));
    await tester.pumpAndSettle();
    expect(find.text('Emergency Contacts'), findsOneWidget);
    expect(find.textContaining('Priya'), findsWidgets);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Treatment Booked'));
    await tester.pumpAndSettle();
    expect(find.text('case c1'), findsOneWidget);
  });

  testWidgets('without a booking the dashboard invites the patient to start', (tester) async {
    await _pump(tester, _dashboard(withBooking: false));
    expect(find.text('No upcoming treatment yet'), findsOneWidget);
    expect(find.byKey(const ValueKey('countdown-days')), findsNothing);
  });
}
