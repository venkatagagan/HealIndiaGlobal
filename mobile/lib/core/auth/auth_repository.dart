import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/enums.dart';
import '../models/json.dart';
import '../models/user.dart';
import '../network/api_client.dart';
import 'token_storage.dart';

/// `/auth/*` endpoints (PLAN §8.1). Every method returning [AuthSession] persists the tokens.
class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStorage _tokens;

  /// `POST /auth/register` for the public-door roles patient / agent / hospital (PLAN §3.1, §8.1).
  /// Agents need [agencyName]; hospital users need [hospitalName] (+ optional [city]). Returns 201 `TokenOut`.
  Future<AuthSession> register({
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
    bool acceptTerms = true,
  }) async {
    final data = await _api.post(
      '/auth/register',
      data: compactJson({
        'email': email.trim(),
        'password': password,
        'full_name': fullName.trim(),
        'role': role.json,
        'phone': phone,
        'country_code': countryCode,
        'referral_code': role == UserRole.patient ? referralCode : null,
        'agency_name': role == UserRole.agent ? agencyName?.trim() : null,
        'hospital_name': role == UserRole.hospital ? hospitalName?.trim() : null,
        'city': role == UserRole.hospital ? city?.trim() : null,
        'accept_terms': acceptTerms,
      }, dropEmptyStrings: true),
      extra: ApiClient.noAuth,
    );
    return _persist(data);
  }

  /// `POST /auth/login`. Throws [ApiException] with `isMfaRequired` when a TOTP code is needed.
  Future<AuthSession> login({required String email, required String password, String? otpCode}) async {
    final data = await _api.post(
      '/auth/login',
      data: compactJson({'email': email.trim(), 'password': password, 'otp_code': otpCode}, dropEmptyStrings: true),
      extra: ApiClient.noAuth,
    );
    return _persist(data);
  }

  /// `POST /auth/google` with a Google ID token (see `GoogleSignInService`).
  Future<AuthSession> google({required String idToken}) async {
    final data = await _api.post(
      '/auth/google',
      data: {'id_token': idToken, 'role': UserRole.patient.json},
      extra: ApiClient.noAuth,
    );
    return _persist(data);
  }

  /// `POST /auth/apple` with a Sign in with Apple identity token (iOS/macOS; App Store guideline 4.8).
  /// [fullName] is only delivered by Apple on the very first authorization, so it is forwarded then.
  Future<AuthSession> apple({
    required String identityToken,
    required String nonce,
    String? authorizationCode,
    String? fullName,
  }) async {
    final data = await _api.post(
      '/auth/apple',
      data: compactJson({
        'identity_token': identityToken,
        'nonce': nonce,
        'authorization_code': authorizationCode,
        'full_name': fullName,
        'role': UserRole.patient.json,
      }, dropEmptyStrings: true),
      extra: ApiClient.noAuth,
    );
    return _persist(data);
  }

  /// `DELETE /auth/me` — in-app account deletion (Apple 5.1.1(v) / Google Play account deletion).
  /// The server anonymises the account and revokes every session; records that must be retained by
  /// law (invoices, payments, medical records) are kept under the retention policy. Clears local tokens.
  ///
  /// [otpCode] is the authenticator code, required when the account has MFA enabled. A 409
  /// `account_deletion_blocked` carries the blockers (`{"active_bookings": 1, ...}`) in `details`.
  Future<void> deleteAccount({String? password, String? reason, String? otpCode}) async {
    await _api.delete(
      '/auth/me',
      data: compactJson({'password': password, 'otp_code': otpCode, 'reason': reason}, dropEmptyStrings: true),
    );
    await _tokens.clear();
  }

  /// `POST /auth/me/deletion-request` — asks support to close an account that cannot be deleted
  /// in-app yet (open bookings / payments). The session stays valid.
  Future<void> requestAccountDeletion({String? reason}) async {
    await _api.post('/auth/me/deletion-request', data: compactJson({'reason': reason}, dropEmptyStrings: true));
  }

  /// Clears local tokens without calling the server (used when a session must not be kept).
  Future<void> clearLocalSession() => _tokens.clear();

  /// `POST /auth/guest` -> patient with `is_guest=true` (browse + screening).
  Future<AuthSession> guest() async {
    final data = await _api.post('/auth/guest', data: const <String, dynamic>{}, extra: ApiClient.noAuth);
    return _persist(data);
  }

  /// `POST /auth/guest/upgrade` — converts the current guest into a full account (keeps screenings).
  Future<AuthSession> upgradeGuest({required String email, required String password, required String fullName}) async {
    final data = await _api.post(
      '/auth/guest/upgrade',
      data: {'email': email.trim(), 'password': password, 'full_name': fullName.trim()},
    );
    return _persist(data);
  }

  /// `POST /auth/refresh` (rotation). Returns the stored session after refresh, or null if expired.
  Future<User?> refresh() async {
    final token = await _api.refreshAccessToken();
    if (token == null) return null;
    return _tokens.cachedUser;
  }

  /// `POST /auth/logout`, then clears local tokens even if the call fails.
  Future<void> logout() async {
    try {
      await _tokens.load();
      if (_tokens.hasSession) {
        await _api.post('/auth/logout', data: compactJson({'refresh_token': _tokens.refreshToken}));
      }
    } on ApiException {
      // Already invalid / offline: local sign-out is what matters.
    } finally {
      await _tokens.clear();
    }
  }

  /// `GET /auth/me`.
  Future<User> me() async {
    final data = await _api.get('/auth/me');
    final user = User.fromJson(asJsonMap(data));
    await _tokens.saveUser(user);
    return user;
  }

  /// `PATCH /auth/me`.
  Future<User> updateMe({
    String? fullName,
    String? phone,
    String? countryCode,
    String? preferredLanguage,
    String? avatarUrl,
  }) async {
    final data = await _api.patch(
      '/auth/me',
      data: compactJson({
        'full_name': fullName,
        'phone': phone,
        'country_code': countryCode,
        'preferred_language': preferredLanguage,
        'avatar_url': avatarUrl,
      }),
    );
    final user = User.fromJson(asJsonMap(data));
    await _tokens.saveUser(user);
    return user;
  }

  /// `POST /auth/change-password`.
  Future<void> changePassword({required String currentPassword, required String newPassword}) =>
      _api.post('/auth/change-password', data: {'current_password': currentPassword, 'new_password': newPassword});

  /// `POST /auth/forgot-password` (always 202).
  Future<void> forgotPassword(String email) =>
      _api.post('/auth/forgot-password', data: {'email': email.trim()}, extra: ApiClient.noAuth);

  /// `POST /auth/reset-password`.
  Future<void> resetPassword({required String token, required String newPassword}) =>
      _api.post('/auth/reset-password', data: {'token': token, 'new_password': newPassword}, extra: ApiClient.noAuth);

  /// `POST /auth/verify-email`.
  Future<void> verifyEmail(String token) =>
      _api.post('/auth/verify-email', data: {'token': token}, extra: ApiClient.noAuth);

  /// `POST /auth/resend-verification`.
  Future<void> resendVerification() => _api.post('/auth/resend-verification');

  /// `POST /auth/devices` — register an FCM / APNs push token.
  Future<void> registerDevice({required DevicePlatform platform, required String token}) =>
      _api.post('/auth/devices', data: {'platform': platform.json, 'token': token});

  /// `GET /auth/consents`.
  Future<List<Consent>> consents() async => parseList(await _api.get('/auth/consents'), Consent.fromJson);

  /// `POST /auth/consents` (terms, privacy, ai_processing, share_with_hospitals, marketing).
  Future<void> recordConsent({required ConsentKind kind, required bool granted, String version = '1.0'}) =>
      _api.post('/auth/consents', data: {'kind': kind.json, 'version': version, 'granted': granted});

  Future<AuthSession> _persist(Object? data) async {
    final session = AuthSession.fromJson(asJsonMap(data));
    await _tokens.saveSession(accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user);
    return session;
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider)),
);
