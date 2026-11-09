import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_repository.dart';
import '../config/env.dart';
import '../models/enums.dart';

/// OS notification permission as seen by the app.
enum PushPermission {
  /// Push is off in this build (or Firebase could not start).
  unsupported,

  /// Never asked (iOS), or not granted yet but the OS may still show its dialog (Android 13+).
  notDetermined,
  granted,

  /// The user said no in the OS dialog / settings; the OS will not ask again.
  denied,
}

/// Opens the in-app screen for a tapped notification (`data` of the FCM message).
typedef PushOpenHandler = void Function(Map<String, dynamic> data);

/// Push notifications (CG-15). Payloads are generic ("You have a new message"); the server never puts
/// health details in a notification. Everything also arrives in the in-app notifications list, so the
/// app works fully with push denied or off.
///
/// * [onSignedIn] after every sign-in (and on app start with a stored session): registers the device
///   token when permission is already granted. It never shows the OS dialog itself.
/// * [requestPermission] after the in-app pre-prompt ("Turn on"): shows the OS dialog and registers the
///   token when granted.
/// * [onSignedOut] before the session tokens are cleared: `DELETE /notifications/devices?token=` and
///   deletes the local FCM token.
abstract class PushService {
  /// False for [NoopPushService]: no prompts, no Firebase calls.
  bool get isSupported;

  Future<PushPermission> permission();

  Future<void> onSignedIn();

  /// Shows the OS permission dialog; returns true when notifications are allowed (and registered).
  Future<bool> requestPermission();

  /// [unregisterOnServer] false when the server session is already gone (account deleted).
  Future<void> onSignedOut({bool unregisterOnServer = true});

  /// Where notification taps are delivered (set once by the app).
  set onOpen(PushOpenHandler? handler);
}

/// Push off: does nothing. Used whenever `PUSH_ENABLED` is false and in tests.
class NoopPushService implements PushService {
  const NoopPushService();

  @override
  bool get isSupported => false;

  @override
  Future<PushPermission> permission() async => PushPermission.unsupported;

  @override
  Future<void> onSignedIn() async {}

  @override
  Future<bool> requestPermission() async => false;

  @override
  Future<void> onSignedOut({bool unregisterOnServer = true}) async {}

  @override
  set onOpen(PushOpenHandler? handler) {}
}

/// Firebase Cloud Messaging implementation. Every Firebase failure is logged and turns push off for the
/// session; it never crashes the app or blocks sign-in / sign-out.
class FirebasePushService implements PushService {
  FirebasePushService(this._auth);

  final AuthRepository _auth;

  Future<bool>? _ready;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _openedSub;
  PushOpenHandler? _onOpen;
  String? _token;
  bool _signedIn = false;
  bool _initialMessageChecked = false;

  @override
  bool get isSupported => true;

  @override
  set onOpen(PushOpenHandler? handler) => _onOpen = handler;

  static DevicePlatform? get _platform {
    if (kIsWeb) return null; // Web push is not part of the app build.
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => DevicePlatform.android,
      TargetPlatform.iOS => DevicePlatform.ios,
      _ => null,
    };
  }

  Future<bool> _init() => _ready ??= _initFirebase();

  static Future<bool> _initFirebase() async {
    if (_platform == null) return false;
    try {
      if (Firebase.apps.isEmpty) {
        if (Env.firebaseOptionsDefined) {
          await Firebase.initializeApp(
            options: FirebaseOptions(
              apiKey: Env.firebaseApiKey,
              appId: Env.firebaseAppId,
              messagingSenderId: Env.firebaseMessagingSenderId,
              projectId: Env.firebaseProjectId,
              iosBundleId: Env.firebaseIosBundleId.isEmpty ? null : Env.firebaseIosBundleId,
            ),
          );
        } else {
          // Reads android/app/google-services.json or ios/Runner/GoogleService-Info.plist.
          await Firebase.initializeApp();
        }
      }
      return true;
    } catch (e) {
      debugPrint('Push notifications are off: Firebase did not start ($e)');
      return false;
    }
  }

  FirebaseMessaging get _fm => FirebaseMessaging.instance;

  @override
  Future<PushPermission> permission() async {
    if (!await _init()) return PushPermission.unsupported;
    try {
      final settings = await _fm.getNotificationSettings();
      return switch (settings.authorizationStatus) {
        AuthorizationStatus.authorized || AuthorizationStatus.provisional => PushPermission.granted,
        AuthorizationStatus.notDetermined => PushPermission.notDetermined,
        // Android reports "denied" both before and after the Android 13+ dialog; the OS decides
        // whether it can still ask, so treat it as "may ask" there.
        AuthorizationStatus.denied =>
          defaultTargetPlatform == TargetPlatform.android ? PushPermission.notDetermined : PushPermission.denied,
        AuthorizationStatus.deniedPermanently => PushPermission.denied,
      };
    } catch (e) {
      debugPrint('Push: could not read notification permission ($e)');
      return PushPermission.unsupported;
    }
  }

  @override
  Future<void> onSignedIn() async {
    _signedIn = true;
    if (!await _init()) return;
    _listenForTaps();
    if (await permission() == PushPermission.granted) await _register();
  }

  @override
  Future<bool> requestPermission() async {
    if (!await _init()) return false;
    try {
      final settings = await _fm.requestPermission();
      final ok =
          settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (ok && _signedIn) await _register();
      return ok;
    } catch (e) {
      debugPrint('Push: permission request failed ($e)');
      return false;
    }
  }

  @override
  Future<void> onSignedOut({bool unregisterOnServer = true}) async {
    _signedIn = false;
    final ready = _ready == null ? false : await _ready!;
    if (!ready) return;
    await _refreshSub?.cancel();
    _refreshSub = null;
    await _openedSub?.cancel();
    _openedSub = null;
    final token = _token;
    _token = null;
    if (token != null && unregisterOnServer) {
      try {
        await _auth.unregisterPushDevice(token);
      } catch (e) {
        debugPrint('Push: could not unregister the device token ($e)');
      }
    }
    try {
      // ignore: deprecated_member_use
      await _fm.deleteToken();
      await _fm.setAutoInitEnabled(false);
    } catch (e) {
      debugPrint('Push: could not delete the local token ($e)');
    }
  }

  Future<void> _register() async {
    final platform = _platform;
    if (platform == null) return;
    try {
      await _fm.setAutoInitEnabled(true);
      if (platform == DevicePlatform.ios && !await _waitForApnsToken()) {
        debugPrint('Push: no APNs token yet (Push Notifications capability / APNs key missing?)');
        return;
      }
      // The backend sends with FCM HTTP v1 `message.token`, so register the classic registration token
      // (not the Firebase Installation ID from the newer register()/onRegistered API).
      // ignore: deprecated_member_use
      final token = await _fm.getToken();
      if (token != null && token.isNotEmpty) await _send(platform, token);
      // ignore: deprecated_member_use
      _refreshSub ??= _fm.onTokenRefresh.listen((t) {
        if (_signedIn) unawaited(_send(platform, t));
      });
    } catch (e) {
      debugPrint('Push: could not register this device ($e)');
    }
  }

  Future<bool> _waitForApnsToken() async {
    for (var i = 0; i < 5; i++) {
      if (await _fm.getAPNSToken() != null) return true;
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    return false;
  }

  Future<void> _send(DevicePlatform platform, String token) async {
    try {
      await _auth.registerPushDevice(
        platform: platform,
        token: token,
        appVersion: Env.appVersion.isEmpty ? null : Env.appVersion,
      );
      _token = token;
    } catch (e) {
      debugPrint('Push: token registration failed ($e)');
    }
  }

  void _listenForTaps() {
    _openedSub ??= FirebaseMessaging.onMessageOpenedApp.listen((m) => _onOpen?.call(m.data));
    if (_initialMessageChecked) return;
    _initialMessageChecked = true;
    unawaited(
      _fm.getInitialMessage().then((m) {
        if (m != null) _onOpen?.call(m.data);
      }, onError: (Object e) => debugPrint('Push: could not read the launch notification ($e)')),
    );
  }
}

/// Picks the implementation: Firebase only when the build has `--dart-define=PUSH_ENABLED=true`.
PushService createPushService({required bool enabled, required AuthRepository Function() auth}) =>
    enabled ? FirebasePushService(auth()) : const NoopPushService();

final pushServiceProvider = Provider<PushService>(
  (ref) => createPushService(enabled: Env.pushEnabled, auth: () => ref.watch(authRepositoryProvider)),
);
