import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../config/env.dart';
import '../network/api_exception.dart';

/// Obtains a Google ID token for `POST /auth/google` (google_sign_in 7.x).
///
/// Configure with `--dart-define=GOOGLE_SERVER_CLIENT_ID=<web client id>` (Android requires it to
/// mint an ID token for the backend) and `GOOGLE_CLIENT_ID` on iOS. On web, `authenticate()` is not
/// supported by the plugin ([supportsAuthenticate] is false): render the plugin's web button instead
/// or hide the Google option.
class GoogleSignInService {
  Future<void>? _init;

  bool get isConfigured => Env.googleSignInConfigured;

  Future<void> _ensureInitialized() => _init ??= GoogleSignIn.instance.initialize(
    clientId: Env.googleClientId.isEmpty ? null : Env.googleClientId,
    serverClientId: Env.googleServerClientId.isEmpty || kIsWeb ? null : Env.googleServerClientId,
  );

  /// Whether an interactive `authenticate()` flow is available on this platform.
  Future<bool> supportsAuthenticate() async {
    if (!isConfigured) return false;
    try {
      await _ensureInitialized();
      return GoogleSignIn.instance.supportsAuthenticate();
    } catch (_) {
      return false;
    }
  }

  /// Runs the Google sign-in flow and returns the ID token, or null if the user cancelled.
  Future<String?> signInForIdToken() async {
    if (!isConfigured) {
      throw const ApiException(
        statusCode: 0,
        code: 'google_not_configured',
        message: 'Google sign-in is not available in this build.',
      );
    }
    await _ensureInitialized();
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const ApiException(statusCode: 0, code: 'google_failed', message: 'Google did not return a token.');
      }
      return idToken;
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      throw ApiException(statusCode: 0, code: 'google_failed', message: e.description ?? 'Google sign-in failed.');
    }
  }

  Future<void> signOut() async {
    if (_init == null) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Best effort.
    }
  }
}

final googleSignInServiceProvider = Provider<GoogleSignInService>((ref) => GoogleSignInService());
