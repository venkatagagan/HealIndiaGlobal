import 'package:flutter/foundation.dart';

/// Compile-time configuration, supplied with `--dart-define`:
///
/// ```
/// flutter run --dart-define=API_BASE_URL=https://api.healindiaglobal.com/api/v1
/// ```
///
/// | define                     | default                                                   |
/// |----------------------------|-----------------------------------------------------------|
/// | `API_BASE_URL`             | Android emulator `http://10.0.2.2:8000/api/v1`, web served |
/// |                            | from a non-localhost origin `<origin>/api/v1`, otherwise   |
/// |                            | `http://127.0.0.1:8000/api/v1`                             |
/// | `WS_URL`                   | derived from API_BASE_URL (`http`->`ws`, + `/ws`)         |
/// | `APP_ENV`                  | `development` (`production` hides mock payments etc.)     |
/// | `GOOGLE_SERVER_CLIENT_ID`  | empty (Google sign-in hidden when empty on Android)       |
/// | `GOOGLE_CLIENT_ID`         | empty (iOS / web OAuth client id)                         |
/// | `RAZORPAY_ENABLED`         | `true` (Android / iOS only; mock gateway elsewhere)       |
abstract final class Env {
  static const String _apiBaseUrlDefine = String.fromEnvironment('API_BASE_URL');
  static const String _wsUrlDefine = String.fromEnvironment('WS_URL');

  /// `development` | `staging` | `production`.
  static const String appEnv = String.fromEnvironment('APP_ENV', defaultValue: 'development');

  /// Web/server OAuth client id used by google_sign_in to mint an ID token the backend verifies.
  static const String googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  /// Platform OAuth client id (iOS / web).
  static const String googleClientId = String.fromEnvironment('GOOGLE_CLIENT_ID');

  static const bool _razorpayEnabledDefine = bool.fromEnvironment('RAZORPAY_ENABLED', defaultValue: true);

  static bool get isProduction => appEnv == 'production';

  /// True when Google sign-in is configured for this build.
  static bool get googleSignInConfigured => googleServerClientId.isNotEmpty || googleClientId.isNotEmpty;

  /// Razorpay native checkout is only available on Android and iOS.
  static bool get razorpaySupported =>
      _razorpayEnabledDefine &&
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  /// Base URL of the REST API including the `/api/v1` prefix, without a trailing slash.
  static String get apiBaseUrl {
    if (_apiBaseUrlDefine.isNotEmpty) return _stripTrailingSlash(_apiBaseUrlDefine);
    if (kIsWeb) {
      final base = Uri.base;
      final isLocal = base.host == 'localhost' || base.host == '127.0.0.1' || base.host.isEmpty;
      if (!isLocal && (base.scheme == 'http' || base.scheme == 'https')) {
        return '${base.origin}/api/v1';
      }
      return 'http://127.0.0.1:8000/api/v1';
    }
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:8000/api/v1';
    }
    return 'http://127.0.0.1:8000/api/v1';
  }

  /// WebSocket endpoint (`.../api/v1/ws`). Connect with `?token=<access_token>`.
  static String get wsUrl {
    if (_wsUrlDefine.isNotEmpty) return _stripTrailingSlash(_wsUrlDefine);
    return deriveWsUrl(apiBaseUrl);
  }

  /// Converts an http(s) API base URL into the ws(s) realtime URL.
  static String deriveWsUrl(String apiBase) {
    final uri = Uri.parse(_stripTrailingSlash(apiBase));
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    return uri.replace(scheme: scheme, path: '${uri.path}/ws').toString();
  }

  static String _stripTrailingSlash(String s) => s.endsWith('/') ? s.substring(0, s.length - 1) : s;
}
