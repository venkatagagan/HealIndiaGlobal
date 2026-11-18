import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/repositories/booking_repository.dart';
import 'package:heal_india_global/core/repositories/case_repository.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/partner_repository.dart';
import 'package:heal_india_global/core/theme/app_text_styles.dart';
import 'package:heal_india_global/core/utils/dates.dart';
import 'package:heal_india_global/features/booking/logic/admission_availability.dart';
import 'package:heal_india_global/features/booking/providers/booking_providers.dart';
import 'package:heal_india_global/features/booking/screens/book_screen.dart';

import '../trips/journey_test_helpers.dart';

/// Records `POST /bookings` instead of calling the API.
class _FakeBookingRepository extends BookingRepository {
  _FakeBookingRepository() : super(ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://test.invalid/api/v1'));

  Map<String, Object?>? created;

  /// Thrown by [create] instead of creating the booking.
  Object? failWith;

  @override
  Future<Booking> create({
    required String caseId,
    required DateTime admissionDate,
    required PaymentOption paymentOption,
    String? quoteId,
    String? packageId,
    int? installmentMonths,
    bool insuranceClaimRequested = false,
  }) async {
    final f = failWith;
    if (f != null) throw f;
    created = {
      'case_id': caseId,
      'admission_date': Dates.api(admissionDate),
      'payment_option': paymentOption.json,
      'quote_id': quoteId,
      'package_id': packageId,
      'installment_months': installmentMonths,
      'insurance': insuranceClaimRequested,
    };
    return Booking.fromJson({
      'id': 'b1',
      'booking_number': 'HIG-B-2026-000001',
      'case_id': caseId,
      'status': 'pending_payment',
      'hospital': {'id': 'h1', 'name': 'Apollo Hospitals', 'city': 'New Delhi'},
      'payment_option': paymentOption.json,
      'currency': 'USD',
      'total_minor': 400000,
      'amount_paid_minor': 0,
      'amount_refunded_minor': 0,
    });
  }
}

final _case = MedicalCaseDetail.fromJson({
  'id': 'c1',
  'case_number': 'HIG-C-2026-000123',
  'status': 'quoted',
  'patient': {'id': 'p1', 'full_name': 'Amina Yusuf'},
  'hospital': {'id': 'h1', 'slug': 'apollo-delhi', 'name': 'Apollo Hospitals', 'city': 'New Delhi'},
  'doctor': {'id': 'd1', 'full_name': 'Dr. Arjun Sharma', 'specialty_name': 'Cardiologist'},
  'procedure': {'id': 'p1', 'slug': 'cabg', 'name': 'CABG'},
  'booking': null,
  'quotes': [],
  'timeline': [],
  'documents': [],
});

final _hospital = HospitalDetail.fromJson({
  'id': 'h1',
  'slug': 'apollo-delhi',
  'name': 'Apollo Hospitals',
  'city': 'New Delhi',
  'doctors': [],
  'procedures': [
    {
      'id': 'hp1',
      'hospital_id': 'h1',
      'procedure': {'id': 'p1', 'slug': 'cabg', 'name': 'CABG'},
      'hospital_stay_days': 7,
      'packages': [
        {
          'id': 'pk-stay',
          'name': 'Medical + Stay',
          'tier': 'medical_stay',
          'price_minor': 400000,
          'original_price_minor': 450000,
          'currency': 'USD',
          'includes': {'accommodation_nights': 10},
        },
        {
          'id': 'pk-med',
          'name': 'Medical Only',
          'tier': 'medical_only',
          'price_minor': 300000,
          'currency': 'USD',
          'includes': {},
        },
      ],
    },
  ],
  'reviews': [],
});

/// `InstallmentPlanOut` for [q]: [allowed] month counts, a schedule for the requested months.
InstallmentPlan _plan(InstallmentPlanQuery q, {required List<int> allowed, bool partners = false}) {
  final admission = DateTime.parse(q.admissionDate);
  final months = q.months;
  final ok = months != null && allowed.contains(months);
  return InstallmentPlan.fromJson({
    'admission_date': q.admissionDate,
    'today': Dates.api(DateTime.now()),
    'last_due_by': Dates.api(admission.subtract(const Duration(days: 1))),
    'max_months': allowed.isEmpty ? 0 : allowed.last,
    'allowed_months': allowed,
    'months': months,
    'valid': ok,
    'schedule': ok
        ? [
            for (var i = 1; i <= months; i++)
              {
                'seq': i,
                'due_date': Dates.api(admission.subtract(Duration(days: (months - i) * 30 + 1))),
                'amount_minor': 10000,
              },
          ]
        : [],
    'interest_free': true,
    'partner_financing_available': partners,
  });
}

/// Pumps the booking screen with one free admission day (the last day of the visible month) and picks it.
Future<_FakeBookingRepository> _pumpAndPickDate(
  WidgetTester tester, {
  required InstallmentPlan Function(InstallmentPlanQuery q) plan,
}) async {
  tester.view.devicePixelRatio = 2.5;
  tester.view.physicalSize = const Size(480, 1600) * 2.5;
  addTearDown(tester.view.reset);
  final today = Dates.dateOnly(DateTime.now());
  final month = DateTime(today.add(const Duration(days: 1)).year, today.add(const Duration(days: 1)).month);
  final freeDay = DateTime(month.year, month.month + 1, 0);
  final availability = AdmissionAvailability.fromSlots([
    AvailabilitySlot.fromJson({'date': Dates.api(freeDay), 'slot_kind': 'admission', 'capacity': 2, 'booked': 0}),
  ]);
  final bookings = _FakeBookingRepository();
  final overrides = [
    ...await journeyBaseOverrides(),
    caseDetailProvider.overrideWith((ref, id) async => _case),
    hospitalDetailProvider.overrideWith((ref, id) async => _hospital),
    procedureDetailProvider.overrideWith((ref, slug) => Future<Procedure>.error(StateError('offline'))),
    admissionAvailabilityProvider.overrideWith((ref, q) async => availability),
    fxRatesProvider.overrideWith((ref) async => const {'USD': 83.0}),
    bookingRepositoryProvider.overrideWithValue(bookings),
    installmentPlanProvider.overrideWith((ref, q) async => plan(q)),
  ];
  final routes = <RouteBase>[
    GoRoute(
      path: '/book/:caseId',
      builder: (_, s) => BookScreen(caseId: s.pathParameters['caseId']!),
    ),
    stubRoute('/pay/:bookingId', 'pay', param: 'bookingId'),
    GoRoute(
      path: '/insurance',
      builder: (_, s) => Scaffold(body: Text('insurance ${s.uri.query}')),
    ),
  ];
  await tester.pumpWidget(journeyApp(overrides: overrides, routes: routes, initialLocation: '/book/c1'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(ValueKey('day-${Dates.api(freeDay)}')));
  await tester.pumpAndSettle();
  return bookings;
}

void main() {
  setUp(() => AppTextStyles.useGoogleFonts = false);

  testWidgets('select an available date and a package, choose installments, then create the booking', (tester) async {
    tester.view.devicePixelRatio = 2.5;
    tester.view.physicalSize = const Size(480, 1400) * 2.5;
    addTearDown(tester.view.reset);

    final today = Dates.dateOnly(DateTime.now());
    final month = DateTime(today.add(const Duration(days: 1)).year, today.add(const Duration(days: 1)).month);
    // Only one admission day is free: the last day of the visible month (always after today).
    final freeDay = DateTime(month.year, month.month + 1, 0);
    final busyDay = freeDay.subtract(const Duration(days: 1));
    final availability = AdmissionAvailability.fromSlots([
      AvailabilitySlot.fromJson({'date': Dates.api(freeDay), 'slot_kind': 'admission', 'capacity': 2, 'booked': 0}),
      AvailabilitySlot.fromJson({'date': Dates.api(busyDay), 'slot_kind': 'admission', 'capacity': 1, 'booked': 1}),
    ]);
    final bookings = _FakeBookingRepository();

    final overrides = [
      ...await journeyBaseOverrides(),
      caseDetailProvider.overrideWith((ref, id) async => _case),
      hospitalDetailProvider.overrideWith((ref, id) async => _hospital),
      procedureDetailProvider.overrideWith((ref, slug) => Future<Procedure>.error(StateError('offline'))),
      admissionAvailabilityProvider.overrideWith((ref, q) async => availability),
      fxRatesProvider.overrideWith((ref) async => const {'USD': 83.0}),
      bookingRepositoryProvider.overrideWithValue(bookings),
      installmentPlanProvider.overrideWith((ref, q) async => _plan(q, allowed: const [3, 6, 12])),
    ];
    final routes = <RouteBase>[
      GoRoute(
        path: '/book/:caseId',
        builder: (_, s) => BookScreen(caseId: s.pathParameters['caseId']!),
      ),
      stubRoute('/pay/:bookingId', 'pay', param: 'bookingId'),
    ];
    await tester.pumpWidget(journeyApp(overrides: overrides, routes: routes, initialLocation: '/book/c1'));
    await tester.pumpAndSettle();

    expect(find.text('Select Dates'), findsOneWidget);
    expect(find.text('Dr. Arjun Sharma'), findsWidgets);
    // Packages are sorted by tier; the first one is preselected.
    expect(find.byKey(const ValueKey('package-pk-med')), findsOneWidget);
    expect(find.byKey(const ValueKey('package-pk-stay')), findsOneWidget);

    // Nothing can be submitted before a date is picked; a fully booked day is not selectable.
    final proceed = find.byKey(const ValueKey('proceed-to-payment'));
    expect(
      tester.widget<FilledButton>(find.descendant(of: proceed, matching: find.byType(FilledButton))).onPressed,
      isNull,
    );
    await tester.tap(find.byKey(ValueKey('day-${Dates.api(busyDay)}')));
    await tester.pump();
    expect(find.textContaining('Admission on'), findsNothing);

    await tester.tap(find.byKey(ValueKey('day-${Dates.api(freeDay)}')));
    await tester.pump();
    expect(find.textContaining('Admission on'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const ValueKey('package-pk-stay')));
    await tester.tap(find.byKey(const ValueKey('package-pk-stay')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('option-installments')));
    await tester.tap(find.byKey(const ValueKey('option-installments')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('months-12')));
    await tester.tap(find.byKey(const ValueKey('months-12')));
    await tester.pumpAndSettle();
    // CG-18: interest-free, paid before admission; the schedule comes from the server.
    expect(find.textContaining('Interest-free. The last instalment is due before your admission on'), findsOneWidget);
    expect(find.byKey(const ValueKey('installment-row-12')), findsOneWidget);
    expect(find.byKey(const ValueKey('months-1')), findsNothing);

    await tester.tap(proceed);
    await tester.pumpAndSettle();

    expect(bookings.created, {
      'case_id': 'c1',
      'admission_date': Dates.api(freeDay),
      'payment_option': 'installments',
      'quote_id': null,
      'package_id': 'pk-stay',
      'installment_months': 12,
      'insurance': false,
    });
    expect(find.text('pay b1'), findsOneWidget);
  });

  testWidgets('instalments are disabled when the admission date is too close (max_months 0)', (tester) async {
    final bookings = await _pumpAndPickDate(tester, plan: (q) => _plan(q, allowed: const [], partners: true));

    await tester.ensureVisible(find.byKey(const ValueKey('option-installments')));
    expect(find.textContaining('Instalments are not possible for this admission date'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('option-installments')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('months-3')), findsNothing);

    // A pay-later partner exists: link to the partners (outside the platform).
    await tester.ensureVisible(find.byKey(const ValueKey('see-pay-later-partners')));
    expect(find.text('Need longer to pay? See pay-later partners'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('proceed-to-payment')));
    await tester.pumpAndSettle();
    expect(bookings.created!['payment_option'], 'full');
    expect(bookings.created!['installment_months'], isNull);
  });

  testWidgets('months are limited to allowed_months; the partners link and insurance card navigate', (tester) async {
    await _pumpAndPickDate(tester, plan: (q) => _plan(q, allowed: const [1, 2], partners: true));

    await tester.ensureVisible(find.byKey(const ValueKey('option-installments')));
    await tester.tap(find.byKey(const ValueKey('option-installments')));
    await tester.pumpAndSettle();
    // The default 6 months is not allowed: the longest allowed plan is chosen.
    expect(find.byKey(const ValueKey('months-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('months-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('months-6')), findsNothing);
    expect(find.byKey(const ValueKey('installment-row-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('installment-row-3')), findsNothing);

    // Insurance options card (short disclaimer) under the payment options.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('open-insurance-options')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.textContaining('We do not sell insurance'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('open-insurance-options')));
    await tester.pumpAndSettle();
    expect(find.text('insurance case=c1'), findsOneWidget);
    GoRouter.of(tester.element(find.text('insurance case=c1'))).pop();
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const ValueKey('see-pay-later-partners')));
    await tester.tap(find.byKey(const ValueKey('see-pay-later-partners')));
    await tester.pumpAndSettle();
    expect(find.text('insurance tab=pay_later&case=c1'), findsOneWidget);
  });

  testWidgets('installments_past_treatment from the API is translated and falls back to max_months', (tester) async {
    final bookings = await _pumpAndPickDate(tester, plan: (q) => _plan(q, allowed: const [3, 6]));
    await tester.ensureVisible(find.byKey(const ValueKey('option-installments')));
    await tester.tap(find.byKey(const ValueKey('option-installments')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('months-6')));
    await tester.tap(find.byKey(const ValueKey('months-6')));
    await tester.pumpAndSettle();

    bookings.failWith = ApiException.fromResponse(400, {
      'error': {
        'code': 'installments_past_treatment',
        'message': 'raw server text',
        'details': {'max_months': 3, 'last_due_by': '2027-01-01'},
      },
    });
    await tester.tap(find.byKey(const ValueKey('proceed-to-payment')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Instalments must be paid in full before your admission date'), findsOneWidget);
    expect(find.text('raw server text'), findsNothing);

    bookings.failWith = null;
    await tester.tap(find.byKey(const ValueKey('proceed-to-payment')));
    await tester.pumpAndSettle();
    expect(bookings.created!['installment_months'], 3);
  });
}
