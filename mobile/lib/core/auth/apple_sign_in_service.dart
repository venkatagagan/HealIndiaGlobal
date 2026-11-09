import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../network/api_exception.dart';

/// Result of a successful Apple authorization, forwarded to `POST /auth/apple`.
class AppleCredential {
  const AppleCredential({
    required this.identityToken,
    required this.authorizationCode,
    required this.nonce,
    this.fullName,
  });

  /// Apple identity token (JWT, `aud` = the app's bundle id); the backend verifies it against Apple's JWKS.
  final String identityToken;
  final String authorizationCode;

  /// Raw nonce sent to Apple; the backend checks it equals the token's `nonce` claim (replay protection).
  final String nonce;

  /// Only present on the user's first authorization for this app.
  final String? fullName;
}

/// Sign in with Apple (App Store Review Guideline 4.8: required on iOS because Google sign-in is
/// offered there). Shown on iOS / macOS only.
///
/// Configuration (see mobile/README.md "Sign in with Apple"):
/// * Xcode: Runner target -> Signing & Capabilities -> + "Sign in with Apple"
///   (adds `com.apple.developer.applesignin` to `ios/Runner/Runner.entitlements`).
/// * Apple Developer: enable "Sign in with Apple" on the App ID.
/// * Backend: `APPLE_CLIENT_IDS=<bundle id>` for `POST /auth/apple` token verification.
/// * Build flag: `--dart-define=APPLE_SIGN_IN_ENABLED=false` hides the button (default: enabled).
class AppleSignInService {
  static const bool _enabledDefine = bool.fromEnvironment('APPLE_SIGN_IN_ENABLED', defaultValue: true);

  /// Platforms with a native Apple ID sheet.
  bool get isSupportedPlatform =>
      _enabledDefine &&
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS);

  Future<bool> isAvailable() async {
    if (!isSupportedPlatform) return false;
    try {
      return await SignInWithApple.isAvailable();
    } catch (_) {
      return false;
    }
  }

  /// Runs the Apple ID sheet. Returns null when the user cancelled.
  Future<AppleCredential?> signIn() async {
    final nonce = _randomNonce();
    try {
      final c = await SignInWithApple.getAppleIDCredential(
        scopes: const [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        nonce: nonce,
      );
      final token = c.identityToken;
      if (token == null || token.isEmpty) {
        throw const ApiException(statusCode: 0, code: 'apple_failed', message: 'Apple did not return a token.');
      }
      final name = [c.givenName, c.familyName].whereType<String>().where((s) => s.trim().isNotEmpty).join(' ');
      return AppleCredential(
        identityToken: token,
        authorizationCode: c.authorizationCode,
        nonce: nonce,
        fullName: name.isEmpty ? null : name,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return null;
      throw ApiException(statusCode: 0, code: 'apple_failed', message: e.message);
    } on SignInWithAppleException catch (e) {
      throw ApiException(statusCode: 0, code: 'apple_failed', message: 'Sign in with Apple failed ($e).');
    }
  }

  static String _randomNonce([int length = 32]) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final rnd = Random.secure();
    return List.generate(length, (_) => chars[rnd.nextInt(chars.length)]).join();
  }
}

final appleSignInServiceProvider = Provider<AppleSignInService>((ref) => AppleSignInService());

/// Whether to show "Continue with Apple" (iOS/macOS with the capability available).
final appleSignInAvailableProvider = FutureProvider<bool>((ref) => ref.watch(appleSignInServiceProvider).isAvailable());
