import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../l10n/l10n.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_repository.dart';
import '../config/app_preferences.dart';
import '../network/api_client.dart';

/// A language the backend knows (`GET /i18n/languages`). Admins switch languages on and off.
@immutable
class AppLanguage {
  const AppLanguage({
    required this.code,
    required this.name,
    required this.nativeName,
    this.rtl = false,
    this.enabled = false,
  });

  factory AppLanguage.fromJson(Map<String, dynamic> j) {
    final code = '${j['code'] ?? ''}'.toLowerCase();
    final shipped = AppLanguage.shipped(code);
    return AppLanguage(
      code: code,
      name: _str(j['name']) ?? shipped?.name ?? code,
      nativeName: _str(j['native_name']) ?? shipped?.nativeName ?? code,
      rtl: j['rtl'] is bool ? j['rtl'] as bool : L10n.rtlLanguages.contains(code),
      enabled: j['enabled'] == true,
    );
  }

  /// ISO 639-1 code (`ar`).
  final String code;

  /// English name (`Arabic`).
  final String name;

  /// Name in the language itself (`العربية`).
  final String nativeName;

  final bool rtl;
  final bool enabled;

  Map<String, dynamic> toJson() => {
    'code': code,
    'name': name,
    'native_name': nativeName,
    'rtl': rtl,
    'enabled': enabled,
  };

  /// Languages the app ships translations for. Only English is on until the API says otherwise.
  static const List<AppLanguage> shippedLanguages = [
    AppLanguage(code: 'en', name: 'English', nativeName: 'English', enabled: true),
    AppLanguage(code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true),
    AppLanguage(code: 'fr', name: 'French', nativeName: 'Français'),
    AppLanguage(code: 'bn', name: 'Bengali', nativeName: 'বাংলা'),
    AppLanguage(code: 'ru', name: 'Russian', nativeName: 'Русский'),
  ];

  static AppLanguage? shipped(String code) {
    for (final l in shippedLanguages) {
      if (l.code == code) return l;
    }
    return null;
  }

  static String? _str(Object? v) => v is String && v.trim().isNotEmpty ? v : null;

  @override
  bool operator ==(Object other) =>
      other is AppLanguage &&
      other.code == code &&
      other.name == name &&
      other.nativeName == nativeName &&
      other.rtl == rtl &&
      other.enabled == enabled;

  @override
  int get hashCode => Object.hash(code, name, nativeName, rtl, enabled);
}

/// The app language plus what the pickers need.
@immutable
class LocaleState {
  const LocaleState({
    required this.locale,
    required this.languages,
    this.choice,
    this.overrides = L10nOverrides.empty,
  });

  /// The language the app shows.
  final Locale locale;

  /// Shipped languages with the server's enabled flags / names.
  final List<AppLanguage> languages;

  /// The language the user picked (null: follow the device).
  final String? choice;

  /// Admin-edited strings for [locale].
  final L10nOverrides overrides;

  /// Languages a user may pick: shipped and switched on by an admin (English always).
  List<AppLanguage> get enabledLanguages => [
    for (final l in languages)
      if (l.enabled || l.code == LocaleController.fallbackCode) l,
  ];

  AppLanguage get current =>
      languages.firstWhere((l) => l.code == locale.languageCode, orElse: () => AppLanguage.shippedLanguages.first);

  bool get isRtl => L10n.rtlLanguages.contains(locale.languageCode);

  LocaleState copyWith({Locale? locale, List<AppLanguage>? languages, String? choice, L10nOverrides? overrides}) =>
      LocaleState(
        locale: locale ?? this.locale,
        languages: languages ?? this.languages,
        choice: choice ?? this.choice,
        overrides: overrides ?? this.overrides,
      );
}

/// Device languages in preference order (overridable in tests).
final deviceLocalesProvider = Provider<List<Locale>>((ref) => PlatformDispatcher.instance.locales);

/// The app language: saved user choice -> device language if enabled -> English.
///
/// * Enabled languages come from `GET /i18n/languages` (cached; English only when the call fails and
///   nothing is cached). A language an admin switched off falls back to the next rule.
/// * Admin overrides for the current language come from `GET /i18n/overrides` (cached on disk, refreshed
///   by [refreshRemote] at app start and after every language change).
/// * The pick is saved on the device and, when signed in, to the profile (`preferred_language`).
final localeControllerProvider = NotifierProvider<LocaleController, LocaleState>(LocaleController.new);

class LocaleController extends Notifier<LocaleState> {
  static const fallbackCode = 'en';
  static const prefChoice = 'hig.locale';
  static const prefLanguages = 'hig.i18n.languages';
  static const prefOverridesPrefix = 'hig.i18n.overrides.';

  SharedPreferences get _prefs => ref.read(sharedPreferencesProvider);

  @override
  LocaleState build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final languages = _cachedLanguages(prefs) ?? AppLanguage.shippedLanguages;
    final choice = prefs.getString(prefChoice);
    final code = resolve(
      choice: choice,
      enabled: _enabledCodes(languages),
      deviceLocales: ref.watch(deviceLocalesProvider),
    );
    ApiClient.languageCode = code;
    ref.listen<AuthState>(authStateProvider, _onAuthChanged);
    return LocaleState(
      locale: Locale(code),
      languages: languages,
      choice: choice,
      overrides: _cachedOverrides(prefs, code),
    );
  }

  /// Pure resolution rule (unit-tested): saved [choice] -> first device language -> English, each only when
  /// shipped and in [enabled].
  static String resolve({String? choice, required Set<String> enabled, required List<Locale> deviceLocales}) {
    bool ok(String? c) => c != null && L10n.isSupported(c) && (c == fallbackCode || enabled.contains(c));
    if (ok(choice)) return choice!;
    for (final d in deviceLocales) {
      final c = d.languageCode.toLowerCase();
      if (ok(c)) return c;
    }
    return fallbackCode;
  }

  /// The user picked [code]: apply it, save it, fetch its overrides and save it to the profile.
  ///
  /// Returns false when the profile could not be updated (the device keeps the choice).
  Future<bool> setLanguage(String code, {bool syncProfile = true}) async {
    await _prefs.setString(prefChoice, code);
    _apply(choice: code);
    unawaited(refreshOverrides());
    if (!syncProfile) return true;
    return _syncProfile(code);
  }

  /// Fetches enabled languages and the current language's overrides. Never throws: on failure the cache
  /// (or English only) stays in place. Called once at app start.
  Future<void> refreshRemote() async {
    await refreshLanguages();
    await refreshOverrides();
  }

  Future<void> refreshLanguages() async {
    try {
      final data = await ref.read(apiClientProvider).get('/i18n/languages', extra: ApiClient.noAuth);
      final list = _parseLanguages(data);
      if (list == null) return;
      await _prefs.setString(prefLanguages, jsonEncode([for (final l in list) l.toJson()]));
      if (!ref.mounted) return;
      _apply(languages: list);
    } on Object catch (e) {
      debugPrint('i18n: languages not refreshed ($e)');
    }
  }

  Future<void> refreshOverrides() async {
    final code = state.locale.languageCode;
    try {
      final data = await ref
          .read(apiClientProvider)
          .get('/i18n/overrides', query: {'locale': code, 'app': 'mobile'}, extra: ApiClient.noAuth);
      if (data is! Map) return;
      final fetched = L10nOverrides.fromJson(Map<String, dynamic>.from(data));
      final overrides = L10nOverrides(locale: code, version: fetched.version, strings: fetched.strings);
      await _prefs.setString('$prefOverridesPrefix$code', jsonEncode(overrides.toJson()));
      if (!ref.mounted || state.locale.languageCode != code) return;
      state = state.copyWith(overrides: overrides);
    } on Object catch (e) {
      debugPrint('i18n: overrides for $code not refreshed ($e)');
    }
  }

  void _apply({String? choice, List<AppLanguage>? languages}) {
    final langs = languages ?? state.languages;
    final pick = choice ?? state.choice;
    final code = resolve(choice: pick, enabled: _enabledCodes(langs), deviceLocales: ref.read(deviceLocalesProvider));
    final changed = code != state.locale.languageCode;
    ApiClient.languageCode = code;
    state = LocaleState(
      locale: changed ? Locale(code) : state.locale,
      languages: langs,
      choice: pick,
      overrides: changed ? _cachedOverrides(_prefs, code) : state.overrides,
    );
    if (changed && languages != null) unawaited(refreshOverrides());
  }

  Future<bool> _syncProfile(String code) async {
    if (!ref.read(authStateProvider).isAuthenticated) return true;
    try {
      final user = await ref.read(authRepositoryProvider).updateMe(preferredLanguage: code);
      if (ref.mounted) ref.read(authControllerProvider.notifier).setUser(user);
      return true;
    } on Object catch (e) {
      debugPrint('i18n: preferred_language not saved ($e)');
      return false;
    }
  }

  /// On sign-in: push a language picked as a guest to the profile, or adopt the profile's language
  /// (set on the web, another device) when nothing was picked on this device.
  void _onAuthChanged(AuthState? previous, AuthState next) {
    final user = next.user;
    if (!next.isAuthenticated || user == null) return;
    if (previous?.isAuthenticated == true && previous?.user?.id == user.id) return;
    final choice = state.choice;
    final server = user.preferredLanguage.toLowerCase();
    if (choice != null) {
      if (server != choice) unawaited(_syncProfile(choice));
    } else if (server != fallbackCode && _enabledCodes(state.languages).contains(server) && L10n.isSupported(server)) {
      unawaited(setLanguage(server, syncProfile: false));
    }
  }

  static Set<String> _enabledCodes(List<AppLanguage> languages) => {
    for (final l in languages)
      if (l.enabled) l.code,
  };

  /// Server list -> shipped languages only, in shipped order, with the server's flags and names.
  static List<AppLanguage>? _parseLanguages(Object? data) {
    final raw = data is Map ? (data['items'] ?? data['languages']) : data;
    if (raw is! List) return null;
    final byCode = <String, AppLanguage>{};
    for (final e in raw) {
      if (e is! Map) continue;
      final l = AppLanguage.fromJson(Map<String, dynamic>.from(e));
      byCode[l.code] = l;
    }
    return [
      for (final s in AppLanguage.shippedLanguages)
        if (byCode[s.code] case final l?)
          AppLanguage(code: s.code, name: l.name, nativeName: l.nativeName, rtl: s.rtl, enabled: l.enabled || s.code == fallbackCode)
        else
          AppLanguage(code: s.code, name: s.name, nativeName: s.nativeName, rtl: s.rtl, enabled: s.code == fallbackCode),
    ];
  }

  static List<AppLanguage>? _cachedLanguages(SharedPreferences prefs) {
    final raw = prefs.getString(prefLanguages);
    if (raw == null) return null;
    try {
      return _parseLanguages(jsonDecode(raw));
    } on Object {
      return null;
    }
  }

  static L10nOverrides _cachedOverrides(SharedPreferences prefs, String code) {
    final raw = prefs.getString('$prefOverridesPrefix$code');
    if (raw == null) return L10nOverrides(locale: code);
    try {
      final o = L10nOverrides.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
      return L10nOverrides(locale: code, version: o.version, strings: o.strings);
    } on Object {
      return L10nOverrides(locale: code);
    }
  }
}
