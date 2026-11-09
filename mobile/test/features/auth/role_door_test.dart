// One public door for patients, agents and hospital users (PLAN §3.1): role tabs on register,
// role-based landing after sign-in, staff refused with the generic error, role-confined routing.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/auth_repository.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/router/app_router.dart';
import 'package:heal_india_global/features/auth/return_path.dart';
import 'package:heal_india_global/features/auth/screens/login_screen.dart';
import 'package:heal_india_global/features/auth/screens/register_screen.dart';

import '../onboarding/fl_harness.dart';

const agentUser = User(id: 'a1', role: UserRole.agent, status: UserStatus.active, fullName: 'Ravi Agent');
const hospitalUser = User(id: 'h1', role: UserRole.hospital, status: UserStatus.active, fullName: 'Hosp Admin');
const staffUser = User(id: 's1', role: UserRole.finance, status: UserStatus.active, fullName: 'Fin Staff');

/// Repository whose login returns a fixed user without HTTP.
class _FixedLoginRepository extends AuthRepository {
  _FixedLoginRepository(this.user, TokenStorage tokens)
    : super(ApiClient(tokens: tokens, baseUrl: 'http://test.invalid/api/v1'), tokens);

  final User user;
  int cleared = 0;

  @override
  Future<AuthSession> login({required String email, required String password, String? otpCode}) async =>
      AuthSession(accessToken: 'at', refreshToken: 'rt', user: user);

  @override
  Future<void> clearLocalSession() async => cleared++;
}

String? redirect(AuthState auth, String location) =>
    computeRedirect(auth: auth, onboardingSeen: true, uri: Uri.parse(location));

void main() {
  group('role routing', () {
    test('each role lands in and is confined to its own shell', () {
      final a = AuthState.fromUser(agentUser);
      final h = AuthState.fromUser(hospitalUser);
      final p = AuthState.fromUser(patientUser);

      expect(redirect(a, Routes.splash), Routes.agentHome);
      expect(redirect(a, Routes.login), Routes.agentHome);
      expect(redirect(a, '/auth/login?from=%2Fagent%2Fcases'), '/agent/cases');
      expect(redirect(a, '/auth/login?from=%2Ftrips'), Routes.agentHome);
      expect(redirect(a, Routes.agentHome), isNull);
      expect(redirect(a, Routes.hospital('apollo')), isNull, reason: 'agents may open catalog detail pages');
      expect(redirect(a, Routes.home), Routes.agentHome);
      expect(redirect(a, Routes.hospitalHome), Routes.agentHome);

      expect(redirect(h, Routes.splash), Routes.hospitalHome);
      expect(redirect(h, Routes.hospitalHome), isNull);
      expect(redirect(h, '/hospital/quotes/q1'), isNull);
      expect(redirect(h, Routes.trips), Routes.hospitalHome);
      expect(redirect(h, Routes.hospital('apollo')), Routes.hospitalHome);

      expect(redirect(p, Routes.agentHome), Routes.home);
      expect(redirect(p, '/hospital/x'), Routes.home);
      expect(redirect(p, Routes.hospital('apollo')), isNull, reason: '/hospitals/:id is not the hospital shell');

      final g = AuthState.fromUser(guestUser);
      expect(redirect(g, Routes.agentHome), startsWith('/auth/register'));
    });

    test('a staff session is treated as signed out', () {
      final s = AuthState.fromUser(staffUser);
      expect(redirect(s, Routes.home), '/auth?from=%2Fhome');
      expect(redirect(s, Routes.login), isNull);
    });

    test('returnPathFor honours `from` only inside the role area', () {
      expect(returnPathFor(UserRole.patient, '/hospitals/h1'), '/hospitals/h1');
      expect(returnPathFor(UserRole.patient, '/agent'), '/home');
      expect(returnPathFor(UserRole.agent, '/home'), '/agent');
      expect(returnPathFor(UserRole.agent, '/agent/patients'), '/agent/patients');
      expect(returnPathFor(UserRole.hospital, null), '/hospital');
      expect(returnPathFor(UserRole.hospital, '/hospitals/h1'), '/hospital');
      expect(Routes.homeFor(UserRole.support), Routes.auth);
    });
  });

  test('staff accounts are refused on mobile with the generic invalid-credentials error', () async {
    final tokens = InMemoryTokenStorage();
    final repo = _FixedLoginRepository(staffUser, tokens);
    final container = ProviderContainer(
      overrides: [tokenStorageProvider.overrideWithValue(tokens), authRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(container.dispose);

    expect((await container.read(authControllerProvider.future)).status, AuthStatus.unauthenticated);
    await expectLater(
      container.read(authControllerProvider.notifier).login(email: 'fin@example.com', password: 'x'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Invalid email or password.')),
    );
    expect(repo.cleared, 1);
    expect(container.read(authStateProvider).hasSession, isFalse);
  });

  testWidgets('register as an agent requires the agency name and lands in the agent shell', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated());
    await pumpScreen(tester, path: '/auth/register', screen: (_) => const RegisterScreen(), authController: auth);

    expect(find.byKey(const Key('register-role-tabs')), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Facilitator referral code (optional)'), findsOneWidget);
    await tester.tap(find.text('Agent'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('register-agency')), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Facilitator referral code (optional)'), findsNothing);

    await tester.enterText(find.widgetWithText(TextFormField, 'Your full name'), 'Ravi Kumar');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'ravi@agency.example');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.ensureVisible(find.byType(Checkbox));
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Create account'));
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pump();
    expect(find.text('Enter your agency name'), findsOneWidget);
    expect(auth.calls, isEmpty);

    await tester.enterText(find.byKey(const Key('register-agency')), 'Lagos Care Travel');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Create account'));
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(auth.calls, ['register']);
    expect(auth.lastArgs['role'], 'agent');
    expect(auth.lastArgs['agency_name'], 'Lagos Care Travel');
    expect(auth.lastArgs['referral_code'], isNull);
    expect(find.text(routeLabel('/agent')), findsOneWidget);
  });

  testWidgets('register as a hospital user sends hospital name and city', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated());
    await pumpScreen(
      tester,
      path: '/auth/register',
      screen: (_) => const RegisterScreen(initialRole: UserRole.hospital),
      authController: auth,
    );

    await tester.enterText(find.widgetWithText(TextFormField, 'Your full name'), 'Dr Mehta');
    await tester.enterText(find.byKey(const Key('register-hospital')), 'Sunrise Heart Institute');
    await tester.enterText(find.widgetWithText(TextFormField, 'City (optional)'), 'Pune');
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'ops@sunrise.example');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.ensureVisible(find.byType(Checkbox));
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Create account'));
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(auth.lastArgs['role'], 'hospital');
    expect(auth.lastArgs['hospital_name'], 'Sunrise Heart Institute');
    expect(auth.lastArgs['city'], 'Pune');
    expect(find.text(routeLabel('/hospital')), findsOneWidget);
  });

  testWidgets('guest upgrade shows no role tabs', (tester) async {
    await pumpScreen(
      tester,
      path: '/auth/register',
      screen: (_) => const RegisterScreen(),
      auth: AuthState.fromUser(guestUser),
    );
    expect(find.byKey(const Key('register-role-tabs')), findsNothing);
  });

  testWidgets('an agent logging in lands in the agent shell, ignoring a patient `from`', (tester) async {
    final auth = FakeAuthController(const AuthState.unauthenticated())..loginUser = agentUser;
    await pumpScreen(
      tester,
      path: '/auth/login',
      screen: (s) => LoginScreen(from: s.uri.queryParameters['from']),
      initialLocation: '/auth/login?from=/trips',
      authController: auth,
    );
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'ravi@agency.example');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'healindia2026');
    await tester.tap(find.widgetWithText(FilledButton, 'Log in'));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/agent')), findsOneWidget);
  });
}
