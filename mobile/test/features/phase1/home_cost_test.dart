import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/guest_repository.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/core/repositories/privacy_repository.dart';
import 'package:heal_india_global/core/repositories/trust_repository.dart';
import 'package:heal_india_global/features/home/screens/home_screen.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import '../onboarding/fl_harness.dart';

const _specialties = [
  Specialty(id: '1', slug: 'cardiology', name: 'Cardiology', description: 'Heart', icon: 'heart'),
];

Map<String, Object?> _side(int min, int max, String ccy, {String? confidence, String? wait, String? earliest}) => {
  'country_code': 'GB',
  'min_minor': min,
  'max_minor': max,
  'currency': ccy,
  'wait_time_text': ?wait,
  'confidence': ?confidence,
  'source': confidence == null ? null : 'NHS tariff',
  'source_url': confidence == null ? null : 'https://www.england.nhs.uk/tariff',
  'price_year': confidence == null ? null : 2025,
  'earliest_admission_date': ?earliest,
};

CostHighlights _highlights({bool fallback = false}) => CostHighlights.fromJson({
  'requested_country': fallback ? 'ZZ' : 'GB',
  'country_used': fallback ? 'US' : 'GB',
  'is_fallback': fallback,
  'country_source': 'profile',
  'currency': 'GBP',
  'items': [
    {
      // reliable estimate, India cheaper -> price comparison with saving
      'procedure': {'id': 'p1', 'slug': 'knee-replacement', 'name': 'Knee replacement'},
      'specialty': {'id': 's1', 'slug': 'orthopedics', 'name': 'Orthopedics'},
      'home': _side(1500000, 2000000, 'GBP', confidence: 'medium', wait: '18 weeks'),
      'india': {..._side(450000, 600000, 'GBP'), 'earliest_admission_date': '2027-01-10', 'wait_time_text': '1 week'},
      'savings': {'min_minor': 1050000, 'max_minor': 1400000, 'currency': 'GBP', 'pct_min': 70, 'pct_max': 70},
    },
    {
      // low confidence -> no saving claim, lead with time
      'procedure': {'id': 'p2', 'slug': 'cabg', 'name': 'Heart bypass'},
      'specialty': {'id': 's2', 'slug': 'cardiology', 'name': 'Cardiology'},
      'home': _side(1000000, 3000000, 'GBP', confidence: 'low'),
      'india': {..._side(500000, 700000, 'GBP'), 'earliest_admission_date': '2027-01-12'},
      'savings': {'min_minor': 500000, 'max_minor': 2300000, 'currency': 'GBP', 'pct_min': 50, 'pct_max': 77},
    },
  ],
});

Future<FakeCatalogRepository> _pump(
  WidgetTester tester, {
  CostHighlights? highlights,
  Locale locale = const Locale('en'),
  bool guest = false,
}) async {
  final repo = FakeCatalogRepository(specialtyItems: _specialties)..highlights = highlights ?? _highlights();
  await pumpScreen(
    tester,
    path: '/home',
    screen: (_) => const HomeScreen(),
    auth: AuthState.fromUser(guest ? guestUser : patientUser),
    locale: locale,
    logicalSize: const Size(400, 1400),
    overrides: [
      catalogRepositoryProvider.overrideWithValue(repo),
      specialtiesProvider.overrideWith((ref) async => _specialties),
      patientDashboardProvider.overrideWith((ref) async => const PatientDashboard()),
      patientProfileProvider.overrideWith((ref) async => const PatientProfile(id: 'pp1', preferredCurrency: 'GBP')),
      guardianStatusProvider.overrideWith((ref) async => const GuardianStatus()),
      eligibleReviewsProvider.overrideWith((ref) async => const <ReviewableBooking>[]),
      introConsultationProvider.overrideWith((ref) async => null),
    ],
  );
  await tester.pumpAndSettle();
  return repo;
}

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  testWidgets('shows home vs India with the saving only when the estimate is reliable', (tester) async {
    await _pump(tester);

    expect(find.text('Your country vs India'), findsOneWidget);
    expect(find.text('Prices for United Kingdom'), findsOneWidget);

    // Knee: medium confidence and cheaper -> both ranges and "Save 70%".
    final knee = find.byKey(const ValueKey('cost-card-p1'));
    expect(find.descendant(of: knee, matching: find.text('Save 70%')), findsOneWidget);
    expect(find.descendant(of: knee, matching: find.text('In India')), findsOneWidget);
    expect(find.descendant(of: knee, matching: find.text('Wait at home: 18 weeks')), findsOneWidget);
    expect(find.descendant(of: knee, matching: find.text('India: earliest admission 10 Jan')), findsOneWidget);
    expect(find.descendant(of: knee, matching: find.text('Estimate · NHS tariff 2025')), findsOneWidget);

    // Bypass: low confidence -> no saving, no prices; leads with time to treatment.
    final bypass = find.byKey(const ValueKey('cost-card-p2'));
    expect(find.descendant(of: bypass, matching: find.textContaining('Save')), findsNothing);
    expect(find.descendant(of: bypass, matching: find.text('In India')), findsNothing);
    expect(
      find.descendant(of: bypass, matching: find.text('Often a long wait or not available locally')),
      findsOneWidget,
    );
  });

  testWidgets('source link explains the estimate', (tester) async {
    await _pump(tester);
    await tester.tap(find.descendant(of: find.byKey(const ValueKey('cost-card-p1')), matching: find.byKey(const ValueKey('cost-source'))));
    await tester.pumpAndSettle();
    expect(find.text('About this estimate'), findsOneWidget);
    expect(find.text('NHS tariff'), findsOneWidget);
    expect(find.text('2025'), findsOneWidget);
    expect(find.text('Medium'), findsOneWidget);
    expect(find.text('Open source'), findsOneWidget);
  });

  testWidgets('a card opens the hospitals with the earliest dates', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Knee replacement'));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/procedures/knee-replacement/earliest')), findsOneWidget);
  });

  testWidgets('fallback country says so, and picking a country reloads the prices', (tester) async {
    final repo = await _pump(tester, highlights: _highlights(fallback: true));
    expect(find.text('Showing United States prices — choose your country'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('cost-change-country')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Nigeria');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ListTile, 'Nigeria'));
    await tester.pumpAndSettle();
    expect(repo.highlightCountries.last, 'NG');
  });

  testWidgets('guests see the free consultation banner', (tester) async {
    await _pump(tester, guest: true);
    expect(find.byKey(const ValueKey('banner-free-consultation')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('banner-free-consultation')));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/free-consultation')), findsOneWidget);
  });

  testWidgets('cost block renders right-to-left in Arabic without overflow', (tester) async {
    await _pump(tester, locale: const Locale('ar'));
    final context = tester.element(find.byType(HomeScreen));
    expect(Directionality.of(context), TextDirection.rtl);
    final l = lookupAppLocalizations(const Locale('ar'));
    expect(find.text(l.costHomeTitle), findsOneWidget);
    expect(find.byKey(const ValueKey('cost-card-p1')), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'layout overflow or build error in Arabic');
  });
}
