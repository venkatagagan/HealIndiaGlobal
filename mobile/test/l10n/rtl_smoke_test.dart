import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/i18n/locale_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/features/home/screens/home_screen.dart';
import 'package:heal_india_global/features/onboarding/screens/onboarding_screen.dart';
import 'package:heal_india_global/features/profile/screens/profile_screen.dart';
import 'package:heal_india_global/features/search/screens/search_screen.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import '../features/onboarding/fl_harness.dart';

const _specialties = [
  Specialty(id: '1', slug: 'cardiology', name: 'Cardiology', description: 'Heart', icon: 'heart', savingsMinPct: 60, savingsMaxPct: 80),
  Specialty(id: '2', slug: 'orthopedics', name: 'Orthopedics', description: 'Joints', icon: 'bone', savingsMinPct: 50, savingsMaxPct: 70),
  Specialty(id: '3', slug: 'dental', name: 'Dental', description: 'Teeth', icon: 'tooth', savingsMinPct: 30, savingsMaxPct: 50),
];

Future<void> _pumpHome(WidgetTester tester, Locale locale, {Size size = const Size(400, 860)}) async {
  await pumpScreen(
    tester,
    path: '/home',
    screen: (_) => const HomeScreen(),
    auth: AuthState.fromUser(patientUser),
    locale: locale,
    logicalSize: size,
    overrides: [
      specialtiesProvider.overrideWith((ref) async => _specialties),
      patientDashboardProvider.overrideWith((ref) async => const PatientDashboard()),
    ],
  );
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  testWidgets('home renders right-to-left in Arabic without overflow', (tester) async {
    await _pumpHome(tester, const Locale('ar'));

    final context = tester.element(find.byType(HomeScreen));
    expect(Directionality.of(context), TextDirection.rtl);
    expect(context.l10n.localeName, 'ar');
    expect(find.text(lookupAppLocalizations(const Locale('ar')).homeTitle), findsOneWidget);
    expect(find.text('What brings you to India?'), findsNothing);
    expect(tester.takeException(), isNull, reason: 'layout overflow or build error in Arabic');
  });

  for (final code in ['fr', 'bn', 'ru']) {
    testWidgets('home renders in $code without overflow', (tester) async {
      await _pumpHome(tester, Locale(code));
      final context = tester.element(find.byType(HomeScreen));
      expect(Directionality.of(context), TextDirection.ltr);
      expect(find.text(lookupAppLocalizations(Locale(code)).homeTitle), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('profile renders right-to-left in Arabic without overflow', (tester) async {
    await pumpScreen(
      tester,
      path: '/profile',
      screen: (_) => const ProfileScreen(),
      auth: AuthState.fromUser(patientUser),
      locale: const Locale('ar'),
      // The language controller agrees with the Arabic UI: Arabic enabled and picked.
      prefs: {
        LocaleController.prefChoice: 'ar',
        LocaleController.prefLanguages: jsonEncode([
          for (final l in AppLanguage.shippedLanguages) {...l.toJson(), 'enabled': true},
        ]),
      },
      logicalSize: const Size(400, 860),
      overrides: [
        patientProfileProvider.overrideWith(
          (ref) async => PatientProfile.fromJson({
            'id': 'pp1',
            'first_name': 'Amina',
            'last_name': 'Yusuf',
            'nationality': 'NG',
            'passport_last4': '4321',
            'passport_expiry': '2031-01-31',
          }),
        ),
        companionsProvider.overrideWith((ref) async => const <PatientCompanion>[]),
      ],
    );
    await tester.pumpAndSettle();
    final ar = lookupAppLocalizations(const Locale('ar'));
    expect(Directionality.of(tester.element(find.byType(ProfileScreen))), TextDirection.rtl);
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.text(ar.languageSettingTitle), 300);
    expect(find.text('العربية'), findsOneWidget); // current language in the settings row
    await tester.scrollUntilVisible(find.text(ar.commonLogOut), 300);
    expect(tester.takeException(), isNull);
  });

  testWidgets('search renders right-to-left in Arabic without overflow', (tester) async {
    await pumpScreen(
      tester,
      path: '/search',
      screen: (_) => const SearchScreen(),
      auth: AuthState.fromUser(guestUser),
      locale: const Locale('ar'),
      logicalSize: const Size(400, 860),
      overrides: [
        catalogRepositoryProvider.overrideWithValue(FakeCatalogRepository()),
        specialtiesProvider.overrideWith((ref) async => _specialties),
      ],
    );
    await tester.pumpAndSettle();
    expect(Directionality.of(tester.element(find.byType(SearchScreen))), TextDirection.rtl);
    expect(tester.takeException(), isNull);
  });

  testWidgets('onboarding pages render right-to-left in Arabic without overflow', (tester) async {
    await pumpScreen(
      tester,
      path: '/onboarding',
      screen: (_) => const OnboardingScreen(),
      locale: const Locale('ar'),
      logicalSize: const Size(400, 860),
    );
    await tester.pumpAndSettle();
    final ar = lookupAppLocalizations(const Locale('ar'));
    expect(Directionality.of(tester.element(find.byType(OnboardingScreen))), TextDirection.rtl);
    expect(find.text(ar.commonSkip), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byIcon(Icons.arrow_forward_rounded));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text(ar.commonNext));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
