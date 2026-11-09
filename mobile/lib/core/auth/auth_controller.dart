import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/enums.dart';
import '../models/user.dart';
import '../network/api_client.dart';
import 'apple_sign_in_service.dart';
import 'auth_repository.dart';
import 'google_sign_in_service.dart';
import 'roles.dart';
import 'token_storage.dart';

/// `unknown` while the stored session is being validated at startup.
enum AuthStatus { unknown, guest, authenticated, unauthenticated }

/// Current session as seen by the UI and router.
class AuthState {
  const AuthState._(this.status, this.user);

  const AuthState.unknown() : this._(AuthStatus.unknown, null);
  const AuthState.unauthenticated() : this._(AuthStatus.unauthenticated, null);

  factory AuthState.fromUser(User user) =>
      AuthState._(user.isGuest ? AuthStatus.guest : AuthStatus.authenticated, user);

  final AuthStatus status;
  final User? user;

  bool get isKnown => status != AuthStatus.unknown;
  bool get isGuest => status == AuthStatus.guest;

  /// Signed in with a full (non-guest) account.
  bool get isAuthenticated => status == AuthStatus.authenticated;

  /// Guest or full account — has tokens and can call authenticated endpoints.
  bool get hasSession => status == AuthStatus.guest || status == AuthStatus.authenticated;

  @override
  String toString() => 'AuthState($status, ${user?.id})';
}

/// Session controller. Read with `ref.watch(authControllerProvider)` (`AsyncValue<AuthState>`) or the
/// convenience [authStateProvider].
///
/// Action methods (`login`, `register`, ...) update the state on success and **rethrow**
/// [ApiException] on failure without changing the state, so forms can show the error inline.
final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);

/// Synchronous view of the auth state (`AuthStatus.unknown` while loading).
final authStateProvider = Provider<AuthState>(
  (ref) => ref.watch(authControllerProvider).value ?? const AuthState.unknown(),
);

/// The signed-in user (guest or full) or null.
final currentUserProvider = Provider<User?>((ref) => ref.watch(authStateProvider).user);

class AuthController extends AsyncNotifier<AuthState> {
  AuthRepository get _repo => ref.read(authRepositoryProvider);

  @override
  Future<AuthState> build() async {
    final api = ref.watch(apiClientProvider);
    final tokens = ref.watch(tokenStorageProvider);

    final expiredSub = api.sessionExpired.listen((_) {
      if (ref.mounted) state = const AsyncData(AuthState.unauthenticated());
    });
    final refreshedSub = api.sessionRefreshed.listen((session) {
      if (ref.mounted && session.user.id.isNotEmpty) state = AsyncData(AuthState.fromUser(session.user));
    });
    ref.onDispose(() {
      unawaited(expiredSub.cancel());
      unawaited(refreshedSub.cancel());
    });

    await tokens.load();
    if (!tokens.hasSession) return const AuthState.unauthenticated();
    try {
      final user = await _repo.me();
      if (user.role.isStaff) {
        // Staff accounts use the web staff door only (PLAN §3.1).
        await tokens.clear();
        return const AuthState.unauthenticated();
      }
      return AuthState.fromUser(user);
    } on ApiException catch (e) {
      if (e.isUnauthorized || e.isForbidden) {
        await tokens.clear();
        return const AuthState.unauthenticated();
      }
      // Offline / server error: continue with the cached user so the app stays usable.
      final cached = tokens.cachedUser;
      if (cached != null && !cached.role.isStaff) return AuthState.fromUser(cached);
      return const AuthState.unauthenticated();
    }
  }

  Future<User> login({required String email, required String password, String? otpCode}) =>
      _apply(_repo.login(email: email, password: password, otpCode: otpCode));

  Future<User> register({
    required String email,
    required String password,
    required String fullName,
    UserRole role = UserRole.patient,
    String? phone,
    String? countryCode,
    String? referralCode,
    String? agencyName,
    String? hospitalName,
    String? city,
  }) => _apply(
    _repo.register(
      email: email,
      password: password,
      fullName: fullName,
      role: role,
      phone: phone,
      countryCode: countryCode,
      referralCode: referralCode,
      agencyName: agencyName,
      hospitalName: hospitalName,
      city: city,
    ),
  );

  /// Google flow end-to-end. Returns null when the user cancelled the Google dialog.
  Future<User?> signInWithGoogle() async {
    final idToken = await ref.read(googleSignInServiceProvider).signInForIdToken();
    if (idToken == null) return null;
    return _apply(_repo.google(idToken: idToken));
  }

  /// Signs in with a Google ID token obtained elsewhere (e.g. the web button).
  Future<User> signInWithGoogleIdToken(String idToken) => _apply(_repo.google(idToken: idToken));

  /// Sign in with Apple end-to-end (iOS/macOS). Returns null when the user cancelled.
  Future<User?> signInWithApple() async {
    final credential = await ref.read(appleSignInServiceProvider).signIn();
    if (credential == null) return null;
    return _apply(
      _repo.apple(
        identityToken: credential.identityToken,
        nonce: credential.nonce,
        authorizationCode: credential.authorizationCode,
        fullName: credential.fullName,
      ),
    );
  }

  /// "Browse as Guest" / "Explore as Guest".
  Future<User> continueAsGuest() => _apply(_repo.guest());

  /// Converts the current guest session into a full account.
  Future<User> upgradeGuest({required String email, required String password, required String fullName}) =>
      _apply(_repo.upgradeGuest(email: email, password: password, fullName: fullName));

  /// Re-fetches `/auth/me` (e.g. after editing the profile).
  Future<void> refreshUser() async {
    final user = await _repo.me();
    state = AsyncData(AuthState.fromUser(user));
  }

  /// Replaces the user after a `PATCH /auth/me` done elsewhere.
  void setUser(User user) => state = AsyncData(AuthState.fromUser(user));

  Future<void> logout() async {
    await _repo.logout();
    await ref.read(googleSignInServiceProvider).signOut();
    state = const AsyncData(AuthState.unauthenticated());
  }

  /// Permanently deletes the signed-in account (`DELETE /auth/me`) and signs out locally.
  /// Rethrows [ApiException] (e.g. wrong password) without changing the state.
  Future<void> deleteAccount({String? password, String? reason, String? otpCode}) async {
    await _repo.deleteAccount(password: password, reason: reason, otpCode: otpCode);
    await ref.read(googleSignInServiceProvider).signOut();
    state = const AsyncData(AuthState.unauthenticated());
  }

  /// Asks support to close the account when in-app deletion is blocked (`POST /auth/me/deletion-request`).
  Future<void> requestAccountDeletion({String? reason}) => _repo.requestAccountDeletion(reason: reason);

  Future<User> _apply(Future<AuthSession> call) async {
    final session = await call;
    if (session.user.role.isStaff) {
      // The backend already refuses staff at the public door; never keep such a session on mobile.
      await _repo.clearLocalSession();
      throw invalidCredentialsError;
    }
    state = AsyncData(AuthState.fromUser(session.user));
    return session.user;
  }
}
