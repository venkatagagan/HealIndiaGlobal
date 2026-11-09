import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/network/api_exception.dart';
import 'package:heal_india_global/features/auth/return_path.dart';
import 'package:heal_india_global/features/auth/screens/auth_screen.dart';
import 'package:heal_india_global/features/auth/screens/login_screen.dart';
import 'package:heal_india_global/features/auth/screens/register_screen.dart';
import 'package:heal_india_global/features/auth/validators.dart';

import '../onboarding/fl_harness.dart';

void main() {
  group('validators', () {
    test('password policy: 10+ chars with a letter and a digit', () {
      expect(AuthValidators.newPassword('short1'), isNotNull);
      expect(AuthValidators.newPassword('onlyletterslong'), isNotNull);
      expect(AuthValidators.newPassword('1234567890'), isNotNull);
      expect(AuthValidators.newPassword('healindia2026'), isNull);
    });

    test('email', () {
      expect(AuthValidators.email(''), isNotNull);
      expect(AuthValidators.email('not-an-email'), isNotNull);
      expect(AuthValidators.email(' patient@example.co.uk '), isNull);
    });

    test('return path only accepts safe in-app locations', () {
      expect(returnPathOrHome(null), '/home');
      expect(returnPathOrHome('/hospitals/apollo?tab=1'), '/hospitals/apollo?tab=1');
      expect(returnPathOrHome('https://evil.example'), '/home');
      expect(returnPathOrHome('//evil.example/x'), '/home');
      expect(returnPathOrHome('/auth/login'), '/home');
      expect(returnPathOrHome('/onboarding'), '/home');
    });
  });

  testWidgets('registration decision hides Google when not configured and browses as guest', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated());
    await pumpScreen(tester, path: '/auth', screen: (_) => const AuthScreen(), authController: auth);
    await tester.pumpAndSettle();

    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Sign up with Email'), findsOneWidget);
    expect(find.text('Browse as Guest'), findsOneWidget);

    await tester.tap(find.text('Browse as Guest'));
    await tester.pumpAndSettle();
    expect(auth.calls, ['guest']);
    expect(find.text(routeLabel('/home')), findsOneWidget);
  });

  testWidgets('register validates locally, requires terms, then creates the account', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated());
    await pumpScreen(
      tester,
      path: '/auth/register',
      screen: (s) => RegisterScreen(from: s.uri.queryParameters['from']),
      initialLocation: '/auth/register?from=/hospitals/h1',
      authController: auth,
    );

    await tester.enterText(find.widgetWithText(TextFormField, 'Full name (as on passport)'), 'Amina Yusuf');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'amina@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'weak');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Create account'));
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pump();
    expect(find.text('Use at least 10 characters'), findsOneWidget);
    expect(find.text('Please accept the Terms and Privacy Policy'), findsOneWidget);
    expect(auth.calls, isEmpty);

    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.ensureVisible(find.byType(Checkbox));
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(auth.calls, ['register']);
    expect(auth.lastArgs['email'], 'amina@example.com');
    expect(find.text(routeLabel('/hospitals/h1')), findsOneWidget);
  });

  testWidgets('a guest registering upgrades the guest account', (tester) async {
    final auth = FakeAuthController(AuthState.fromUser(guestUser));
    await pumpScreen(tester, path: '/auth/register', screen: (_) => const RegisterScreen(), authController: auth);

    expect(find.text('Create account'), findsOneWidget);
    expect(find.textContaining('Everything you did as a guest is kept'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextFormField, 'Full name (as on passport)'), 'Guest Person');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'guest@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.ensureVisible(find.byType(Checkbox));
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.tap(find.text('Create account & keep my progress'));
    await tester.pumpAndSettle();

    expect(auth.calls, ['upgrade']);
    expect(find.text(routeLabel('/home')), findsOneWidget);
  });

  testWidgets('login asks for the TOTP code when the API requires MFA', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated())
      ..failWith = const ApiException(statusCode: 401, code: 'mfa_required', message: 'MFA code required');
    await pumpScreen(tester, path: '/auth/login', screen: (_) => const LoginScreen(), authController: auth);

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'amina@example.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.tap(find.widgetWithText(FilledButton, 'Log in'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextFormField, 'Authentication code'), findsOneWidget);
    auth.failWith = null;
    await tester.enterText(find.widgetWithText(TextFormField, 'Authentication code'), '123456');
    await tester.tap(find.text('Verify & log in'));
    await tester.pumpAndSettle();

    expect(auth.calls, ['login', 'login']);
    expect(auth.lastArgs['otp'], '123456');
    expect(find.text(routeLabel('/home')), findsOneWidget);
  });
}
