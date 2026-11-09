import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_exception.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/features/profile/screens/profile_screen.dart';

import '../onboarding/fl_harness.dart';

Future<FakeAuthController> _open(WidgetTester tester, {User user = patientUser}) async {
  final auth = FakeAuthController(AuthState.fromUser(user));
  await pumpScreen(
    tester,
    path: '/profile',
    screen: (_) => const ProfileScreen(),
    authController: auth,
    logicalSize: const Size(520, 1400),
    overrides: [
      patientProfileProvider.overrideWith((ref) async => throw StateError('offline')),
      companionsProvider.overrideWith((ref) async => const []),
    ],
  );
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.byKey(const Key('profile-delete-account')));
  await tester.tap(find.byKey(const Key('profile-delete-account')));
  await tester.pumpAndSettle();
  return auth;
}

void main() {
  testWidgets('account deletion requires typing DELETE, sends password + reason, then signs out', (tester) async {
    final auth = await _open(tester);

    expect(find.text('Delete account'), findsWidgets);
    expect(find.textContaining('retained for the legal retention period'), findsOneWidget);
    final submit = find.widgetWithText(FilledButton, 'Delete my account permanently');
    expect(tester.widget<FilledButton>(submit).onPressed, isNull);

    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.enterText(find.widgetWithText(TextField, 'Why are you leaving? (optional)'), 'Treated already');
    await tester.enterText(find.byKey(const Key('delete-account-confirm')), 'delete');
    await tester.pump();
    expect(tester.widget<FilledButton>(submit).onPressed, isNotNull);

    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(auth.calls, ['delete']);
    expect(auth.lastArgs, {'password': 'healindia2026', 'reason': 'Treated already'});
    expect(find.text(routeLabel('/auth')), findsOneWidget);
  });

  testWidgets('a wrong password keeps the sheet open with the server error', (tester) async {
    final auth = await _open(tester);
    auth.failWith = const ApiException(statusCode: 403, code: 'invalid_password', message: 'Password is incorrect.');

    await tester.enterText(find.byKey(const Key('delete-account-confirm')), 'DELETE');
    await tester.pump();
    final submit = find.widgetWithText(FilledButton, 'Delete my account permanently');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(find.text('Password is incorrect.'), findsOneWidget);
    expect(find.text(routeLabel('/auth')), findsNothing);
  });

  testWidgets('MFA accounts must enter the authenticator code, sent as otp_code', (tester) async {
    const mfaPatient = User(
      id: 'p1',
      role: UserRole.patient,
      status: UserStatus.active,
      fullName: 'Amina Yusuf',
      mfaEnabled: true,
    );
    final auth = await _open(tester, user: mfaPatient);
    expect(find.byKey(const Key('delete-account-otp')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('delete-account-otp')), '654321');
    await tester.enterText(find.byKey(const Key('delete-account-confirm')), 'DELETE');
    await tester.pump();
    final submit = find.widgetWithText(FilledButton, 'Delete my account permanently');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(auth.lastArgs['otp_code'], '654321');
  });

  testWidgets('a 409 with blockers lists them and offers "Request deletion"', (tester) async {
    final auth = await _open(tester);
    auth.failWith = const ApiException(
      statusCode: 409,
      code: 'account_deletion_blocked',
      message: 'Your account has bookings in progress.',
      details: {'active_bookings': 1, 'active_cases': 0},
    );
    expect(find.byKey(const Key('delete-account-otp')), findsNothing);

    await tester.enterText(find.byKey(const Key('delete-account-confirm')), 'DELETE');
    await tester.pump();
    final submit = find.widgetWithText(FilledButton, 'Delete my account permanently');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(find.text('Upcoming or active bookings'), findsOneWidget);
    expect(find.text('Cases in progress'), findsNothing); // zero counts are hidden
    await tester.ensureVisible(find.byKey(const Key('delete-account-request')));
    await tester.tap(find.byKey(const Key('delete-account-request')));
    await tester.pumpAndSettle();
    expect(auth.calls, ['delete', 'deletion-request']);
    expect(find.byKey(const Key('delete-account-request-sent')), findsOneWidget);
    expect(find.text(routeLabel('/auth')), findsNothing);
  });
}
