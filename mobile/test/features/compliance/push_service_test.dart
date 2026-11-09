// CG-15: push notifications are off unless built with PUSH_ENABLED=true; the token is removed on the
// server before sign-out; the pre-prompt is just-in-time and throttled; taps open the right screen.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/auth_repository.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/config/env.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/services/push_service.dart';
import 'package:heal_india_global/features/messages/logic/push_coordinator.dart';
import 'package:heal_india_global/features/messages/logic/notification_routes.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'compliance_fakes.dart';

/// Push service that records calls (stands in for Firebase).
class _RecordingPush implements PushService {
  _RecordingPush(this.log);

  final List<String> log;
  PushPermission status = PushPermission.notDetermined;

  @override
  bool get isSupported => true;

  @override
  Future<PushPermission> permission() async {
    log.add('permission');
    return status;
  }

  @override
  Future<void> onSignedIn() async => log.add('signed-in');

  @override
  Future<bool> requestPermission() async {
    log.add('request');
    return true;
  }

  @override
  Future<void> onSignedOut({bool unregisterOnServer = true}) async => log.add('push-out:$unregisterOnServer');

  @override
  set onOpen(PushOpenHandler? handler) {}
}

class _LoggingRepository extends AuthRepository {
  _LoggingRepository(this.log, TokenStorage tokens)
    : super(ApiClient(tokens: tokens, baseUrl: 'http://test.invalid/api/v1'), tokens);

  final List<String> log;

  @override
  Future<AuthSession> login({required String email, required String password, String? otpCode}) async =>
      const AuthSession(
        accessToken: 'at',
        refreshToken: 'rt',
        user: User(id: 'u1', role: UserRole.patient, status: UserStatus.active),
      );

  @override
  Future<AuthSession> guest() async => const AuthSession(
    accessToken: 'at',
    refreshToken: 'rt',
    user: User(id: 'g1', role: UserRole.patient, status: UserStatus.active, isGuest: true),
  );

  @override
  Future<void> logout() async => log.add('server-logout');

  @override
  Future<void> deleteAccount({String? password, String? reason, String? otpCode}) async => log.add('delete');
}

void main() {
  test('push is off by default: the provider hands out the no-op service', () {
    expect(Env.pushEnabled, isFalse);
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final push = container.read(pushServiceProvider);
    expect(push, isA<NoopPushService>());
    expect(push.isSupported, isFalse);

    expect(createPushService(enabled: false, auth: () => throw StateError('not used')), isA<NoopPushService>());
  });

  test('no-op service never prompts and does nothing', () async {
    const push = NoopPushService();
    expect(await push.permission(), PushPermission.unsupported);
    expect(await push.requestPermission(), isFalse);
    await push.onSignedIn();
    await push.onSignedOut();
  });

  test('device token endpoints', () async {
    final adapter = RecordingAdapter();
    final tokens = InMemoryTokenStorage();
    final repo = AuthRepository(await fakeApi(adapter, tokens: tokens), tokens);

    await repo.registerPushDevice(platform: DevicePlatform.android, token: 'fcm-token-1', appVersion: '1.0.0');
    await repo.registerPushDevice(platform: DevicePlatform.ios, token: 'fcm-token-2');
    await repo.unregisterPushDevice('fcm token/3');

    expect(adapter.requests[0].method, 'POST');
    expect(adapter.requests[0].path, '/notifications/devices');
    expect(adapter.requests[0].data, {'platform': 'android', 'token': 'fcm-token-1', 'app_version': '1.0.0'});
    expect(adapter.requests[1].data, {'platform': 'ios', 'token': 'fcm-token-2'});
    expect(adapter.requests[2].method, 'DELETE');
    expect(adapter.requests[2].uri.toString(), 'http://test/api/v1/notifications/devices?token=fcm+token%2F3');
  });

  test('logout removes the push token before the session is cleared; account deletion only locally', () async {
    final log = <String>[];
    final tokens = InMemoryTokenStorage();
    final container = ProviderContainer(
      overrides: [
        tokenStorageProvider.overrideWithValue(tokens),
        authRepositoryProvider.overrideWithValue(_LoggingRepository(log, tokens)),
        pushServiceProvider.overrideWithValue(_RecordingPush(log)),
      ],
    );
    addTearDown(container.dispose);
    await container.read(authControllerProvider.future);
    final auth = container.read(authControllerProvider.notifier);

    await auth.login(email: 'a@example.com', password: 'x');
    await auth.logout();
    expect(log, ['push-out:true', 'server-logout']);

    log.clear();
    await auth.login(email: 'a@example.com', password: 'x');
    await auth.deleteAccount(password: 'x');
    expect(log, ['delete', 'push-out:false']);
  });

  group('coordinator', () {
    Future<(ProviderContainer, List<String>)> setUpCoordinator({String? declinedAt}) async {
      SharedPreferences.setMockInitialValues({PrefKeys.pushPromptDeclinedAt: ?declinedAt});
      final prefs = await SharedPreferences.getInstance();
      final log = <String>[];
      final tokens = InMemoryTokenStorage();
      final push = _RecordingPush(log);
      final coordinator = Provider<PushCoordinator>(
        (ref) => PushCoordinator(ref, push, promptDelay: Duration.zero)..start(),
      );
      final container = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          tokenStorageProvider.overrideWithValue(tokens),
          authRepositoryProvider.overrideWithValue(_LoggingRepository(log, tokens)),
          pushServiceProvider.overrideWithValue(push),
        ],
      );
      addTearDown(container.dispose);
      container.listen(coordinator, (_, _) {}); // watched, like the app root does
      await container.read(authControllerProvider.future);
      await Future<void>.delayed(Duration.zero);
      return (container, log);
    }

    test('guests are never registered or asked; a full sign-in registers and checks the permission', () async {
      final (container, log) = await setUpCoordinator();
      final auth = container.read(authControllerProvider.notifier);

      await auth.continueAsGuest();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(log, isEmpty);

      await auth.login(email: 'a@example.com', password: 'x');
      await Future<void>.delayed(const Duration(milliseconds: 10));
      // No navigator in this test, so the dialog itself is not shown; the permission was checked.
      expect(log, ['signed-in', 'permission']);
    });

    test('"Not now" within 30 days: registered, but no pre-prompt', () async {
      final yesterday = DateTime.now().toUtc().subtract(const Duration(days: 1)).toIso8601String();
      final (container, log) = await setUpCoordinator(declinedAt: yesterday);
      await container.read(authControllerProvider.notifier).login(email: 'a@example.com', password: 'x');
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(log, ['signed-in']);
    });
  });

  test('pre-prompt throttle: once per 30 days after "Not now"', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final now = DateTime.utc(2026, 11, 9);
    expect(pushPromptAllowed(prefs, now: now), isTrue);
    await rememberPushPromptDeclined(prefs, now: now);
    expect(pushPromptAllowed(prefs, now: now.add(const Duration(days: 29))), isFalse);
    expect(pushPromptAllowed(prefs, now: now.add(const Duration(days: 30))), isTrue);
  });

  testWidgets('pre-prompt explains push in plain words; only "Turn on" continues', (tester) async {
    bool? answer;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) =>
              TextButton(onPressed: () async => answer = await showPushPrePrompt(context), child: const Text('open')),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(
      find.text('Get updates about your case, messages and payments. We never put health details in notifications.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();
    expect(answer, isFalse);

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn on'));
    await tester.pumpAndSettle();
    expect(answer, isTrue);
  });

  test('notification taps open the matching screen for the role, else the notifications list', () {
    expect(pushLinkRoute('/cases/c1', UserRole.patient), '/cases/c1');
    expect(pushLinkRoute('/messages/cv1', UserRole.patient), '/messages/cv1');
    expect(pushLinkRoute('/screening/s1/matches', UserRole.patient), '/screening/s1/matches');
    expect(pushLinkRoute('/pay/b1', UserRole.patient), '/pay/b1');
    expect(pushLinkRoute('/bookings/b1', UserRole.patient), '/trips');
    expect(pushLinkRoute('/finance', UserRole.patient), '/notifications');
    expect(pushLinkRoute(null, UserRole.patient), '/notifications');
    expect(pushLinkRoute('/cases/c1', UserRole.agent), '/agent/cases/c1');
    expect(pushLinkRoute('/messages/cv1', UserRole.agent), '/agent');
    expect(pushLinkRoute('/bookings/b1', UserRole.hospital), '/hospital/bookings/b1');
    expect(pushLinkRoute('/onboarding', UserRole.hospital), '/hospital');
  });
}
