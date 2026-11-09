import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/features/profile/screens/profile_screen.dart';
import 'package:heal_india_global/features/profile/screens/saved_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../onboarding/fl_harness.dart';

final _profile = PatientProfile.fromJson({
  'id': 'pp1',
  'first_name': 'Amina',
  'last_name': 'Yusuf',
  'date_of_birth': '1980-04-12',
  'gender': 'female',
  'nationality': 'NG',
  'phone': '+234 803 000 0000',
  'passport_last4': '4321',
  'passport_expiry': '2031-01-31',
  'emergency_contact': {'name': 'Musa Yusuf', 'relationship': 'Brother', 'phone': '+234 803 111 1111'},
  'blood_group': 'O+',
  'preferred_currency': 'EUR',
});

void main() {
  testWidgets('guest sees the upgrade card and preferences, no personal data', (tester) async {
    await pumpScreen(
      tester,
      path: '/profile',
      screen: (_) => const ProfileScreen(),
      auth: AuthState.fromUser(guestUser),
    );
    await tester.pumpAndSettle();

    expect(find.text('Guest'), findsWidgets);
    expect(find.text('Create your free account'), findsOneWidget);
    expect(find.text('Personal information'), findsNothing);
    expect(find.text('Currency'), findsOneWidget);
    expect(find.text('Exit guest mode'), findsOneWidget);

    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/auth/register?from=%2Fprofile')), findsOneWidget);
  });

  testWidgets('patient sees masked passport, syncs currency and can log out', (tester) async {
    final auth = FakeAuthController(AuthState.fromUser(patientUser));
    await pumpScreen(
      tester,
      path: '/profile',
      screen: (_) => const ProfileScreen(),
      authController: auth,
      overrides: [
        patientProfileProvider.overrideWith((ref) async => _profile),
        companionsProvider.overrideWith(
          (ref) async => [const PatientCompanion(id: 'c1', fullName: 'Musa Yusuf', relationship: 'Brother')],
        ),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Amina Yusuf'), findsOneWidget);
    expect(find.text('Personal information'), findsOneWidget);
    expect(find.textContaining('•••• 4321'), findsOneWidget);
    expect(find.text('Musa Yusuf'), findsOneWidget); // companions subtitle
    await tester.scrollUntilVisible(find.text('Change password'), 300);
    expect(find.text('Change password'), findsOneWidget);
    // Server-side preferred currency replaces the default USD.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(PrefKeys.preferredCurrency), 'EUR');

    await tester.scrollUntilVisible(find.text('Log out'), 300);
    await tester.tap(find.text('Log out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Log out'));
    await tester.pumpAndSettle();
    expect(auth.calls, ['logout']);
    expect(find.text(routeLabel('/auth')), findsOneWidget);
  });

  testWidgets('saved list renders embedded cards and filters by type', (tester) async {
    final items = [
      SavedItem.fromJson({
        'id': 's1',
        'entity_type': 'hospital',
        'entity_id': 'h1',
        'hospital': {
          'id': 'h1',
          'slug': 'apollo',
          'name': 'Apollo Hospitals',
          'accreditations': ['jci'],
        },
      }),
      SavedItem.fromJson({
        'id': 's2',
        'entity_type': 'doctor',
        'entity_id': 'd1',
        'doctor': {
          'id': 'd1',
          'slug': 'dr-a',
          'full_name': 'Dr. Arjun Sharma',
          'specialty': {'id': 's', 'slug': 'cardiology', 'name': 'Cardiologist'},
          'hospital': {'id': 'h1', 'name': 'Apollo Hospitals'},
        },
      }),
    ];
    await pumpScreen(
      tester,
      path: '/profile/saved',
      screen: (_) => const SavedScreen(),
      auth: AuthState.fromUser(patientUser),
      overrides: [savedItemsProvider.overrideWith((ref) async => items)],
    );
    await tester.pumpAndSettle();

    expect(find.text('All (2)'), findsOneWidget);
    expect(find.text('Dr. Arjun Sharma'), findsOneWidget);
    expect(find.byTooltip('Remove from saved'), findsNWidgets(2));

    await tester.tap(find.text('Doctors (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Dr. Arjun Sharma'), findsOneWidget);
    expect(find.byType(ListView), findsWidgets);
    expect(find.text('Apollo Hospitals'), findsOneWidget); // the doctor's hospital line only
  });
}
