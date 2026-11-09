import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_preferences.dart';
import '../models/user.dart';

/// Persists the session (access token, refresh token, cached user) between launches.
///
/// Values are cached in memory after the first [load] so the auth interceptor can read the access
/// token synchronously via [accessToken].
abstract class TokenStorage {
  String? _access;
  String? _refresh;
  User? _user;
  bool _loaded = false;

  static const _kAccess = 'hig.access_token';
  static const _kRefresh = 'hig.refresh_token';
  static const _kUser = 'hig.user';

  String? get accessToken => _access;
  String? get refreshToken => _refresh;

  /// Last known user (used to start offline / before `/auth/me` returns).
  User? get cachedUser => _user;
  bool get hasSession => (_access ?? '').isNotEmpty || (_refresh ?? '').isNotEmpty;

  @protected
  Future<String?> readValue(String key);
  @protected
  Future<void> writeValue(String key, String? value);

  /// Loads persisted values into memory (idempotent).
  Future<void> load() async {
    if (_loaded) return;
    try {
      _access = await readValue(_kAccess);
      _refresh = await readValue(_kRefresh);
      final rawUser = await readValue(_kUser);
      if (rawUser != null && rawUser.isNotEmpty) {
        final decoded = jsonDecode(rawUser);
        if (decoded is Map<String, dynamic>) _user = User.fromJson(decoded);
      }
    } catch (e) {
      // Corrupt / inaccessible storage (e.g. keystore reset after reinstall): start signed out.
      debugPrint('TokenStorage.load failed: $e');
      _access = null;
      _refresh = null;
      _user = null;
    }
    _loaded = true;
  }

  /// Saves tokens from a `TokenOut`. A null [refreshToken] keeps the existing one.
  Future<void> saveSession({required String accessToken, String? refreshToken, User? user}) async {
    _access = accessToken;
    if (refreshToken != null) _refresh = refreshToken;
    if (user != null) _user = user;
    _loaded = true;
    await writeValue(_kAccess, accessToken);
    if (refreshToken != null) await writeValue(_kRefresh, refreshToken);
    if (user != null) await writeValue(_kUser, jsonEncode(user.toJson()));
  }

  Future<void> saveUser(User user) async {
    _user = user;
    await writeValue(_kUser, jsonEncode(user.toJson()));
  }

  Future<void> clear() async {
    _access = null;
    _refresh = null;
    _user = null;
    _loaded = true;
    await writeValue(_kAccess, null);
    await writeValue(_kRefresh, null);
    await writeValue(_kUser, null);
  }
}

/// Keychain / Keystore backed storage (Android, iOS).
class SecureTokenStorage extends TokenStorage {
  SecureTokenStorage([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readValue(String key) => _storage.read(key: key);

  @override
  Future<void> writeValue(String key, String? value) =>
      value == null ? _storage.delete(key: key) : _storage.write(key: key, value: value);
}

/// shared_preferences backed storage (web fallback; localStorage).
class PrefsTokenStorage extends TokenStorage {
  PrefsTokenStorage(this._prefs);

  final SharedPreferences _prefs;

  @override
  Future<String?> readValue(String key) async => _prefs.getString(key);

  @override
  Future<void> writeValue(String key, String? value) async {
    if (value == null) {
      await _prefs.remove(key);
    } else {
      await _prefs.setString(key, value);
    }
  }
}

/// Volatile storage for tests.
class InMemoryTokenStorage extends TokenStorage {
  InMemoryTokenStorage([Map<String, String>? initial]) : _values = {...?initial};

  final Map<String, String> _values;

  @override
  Future<String?> readValue(String key) async => _values[key];

  @override
  Future<void> writeValue(String key, String? value) async {
    if (value == null) {
      _values.remove(key);
    } else {
      _values[key] = value;
    }
  }
}

/// Platform-appropriate [TokenStorage]. Override with [InMemoryTokenStorage] in tests.
final tokenStorageProvider = Provider<TokenStorage>((ref) {
  if (kIsWeb) return PrefsTokenStorage(ref.watch(sharedPreferencesProvider));
  return SecureTokenStorage();
});
