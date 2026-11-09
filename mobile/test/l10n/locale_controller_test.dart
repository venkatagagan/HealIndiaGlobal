import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/i18n/locale_controller.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api_client_test.dart' show FakeAdapter;
import '../features/onboarding/fl_harness.dart' show FakeAuthController;

String _languages(Set<String> enabled) => jsonEncode([
  for (final l in AppLanguage.shippedLanguages) {...l.toJson(), 'enabled': enabled.contains(l.code)},
]);

Future<(ProviderContainer, FakeAdapter)> _container({
  Map<String, Object> prefs = const {},
  List<Locale> device = const [Locale('en', 'US')],
  (int, Object?) Function(RequestOptions o)? api,
}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final adapter = FakeAdapter(api ?? (o) => (503, {'error': 'down'}));
  final c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sharedPreferencesProvider.overrideWithValue(sp),
      deviceLocalesProvider.overrideWithValue(device),
      authControllerProvider.overrideWith(() => FakeAuthController(const AuthState.unauthenticated())),
      apiClientProvider.overrideWithValue(
        ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://test/api/v1', httpClientAdapter: adapter),
      ),
    ],
  );
  addTearDown(c.dispose);
  return (c, adapter);
}

void main() {
  group('LocaleController.resolve', () {
    const enabled = {'en', 'ar', 'fr'};
    test('saved choice wins when enabled', () {
      expect(LocaleController.resolve(choice: 'fr', enabled: enabled, deviceLocales: const [Locale('ar')]), 'fr');
    });
    test('device language when no choice (first supported + enabled one)', () {
      expect(
        LocaleController.resolve(enabled: enabled, deviceLocales: const [Locale('de'), Locale('ar', 'EG')]),
        'ar',
      );
    });
    test('a choice or device language that is disabled or not shipped falls through to English', () {
      expect(LocaleController.resolve(choice: 'ru', enabled: enabled, deviceLocales: const [Locale('bn')]), 'en');
      expect(LocaleController.resolve(choice: 'hi', enabled: {'hi'}, deviceLocales: const []), 'en');
      expect(LocaleController.resolve(enabled: const {}, deviceLocales: const [Locale('fr')]), 'en');
    });
    test('English is always allowed', () {
      expect(LocaleController.resolve(choice: 'en', enabled: const {}, deviceLocales: const [Locale('fr')]), 'en');
    });
  });

  group('LocaleController', () {
    test('first launch without cache: English only, even on an Arabic device', () async {
      final (c, _) = await _container(device: const [Locale('ar')]);
      final s = c.read(localeControllerProvider);
      expect(s.locale, const Locale('en'));
      expect(s.enabledLanguages.map((l) => l.code), ['en']);
      expect(ApiClient.languageCode, 'en');
    });

    test('cached enabled languages + device language', () async {
      final (c, _) = await _container(
        prefs: {LocaleController.prefLanguages: _languages({'en', 'ar'})},
        device: const [Locale('ar', 'SA')],
      );
      final s = c.read(localeControllerProvider);
      expect(s.locale, const Locale('ar'));
      expect(s.isRtl, isTrue);
      expect(ApiClient.languageCode, 'ar');
    });

    test('API failure keeps English only; refresh enables languages and loads overrides', () async {
      final (failing, _) = await _container(device: const [Locale('ru')]);
      await failing.read(localeControllerProvider.notifier).refreshRemote();
      expect(failing.read(localeControllerProvider).locale, const Locale('en'));

      final (c, adapter) = await _container(
        device: const [Locale('ru')],
        api: (o) => switch (o.path) {
          '/i18n/languages' => (200, jsonDecode(_languages({'en', 'ru'}))),
          '/i18n/overrides' => (
            200,
            {
              'locale': o.queryParameters['locale'],
              'version': 'v7',
              'strings': {'commonCancel': 'Нет, спасибо'},
            },
          ),
          _ => (404, null),
        },
      );
      await c.read(localeControllerProvider.notifier).refreshRemote();
      final s = c.read(localeControllerProvider);
      expect(s.locale, const Locale('ru'));
      expect(s.overrides.version, 'v7');
      expect(s.overrides.strings['commonCancel'], 'Нет, спасибо');
      final overridesCall = adapter.requests.lastWhere((r) => r.path == '/i18n/overrides');
      expect(overridesCall.queryParameters, {'locale': 'ru', 'app': 'mobile'});
      expect(overridesCall.headers['Accept-Language'], isNotNull);

      final prefs = c.read(sharedPreferencesProvider);
      expect(prefs.getString(LocaleController.prefLanguages), isNotNull);
      expect(prefs.getString('${LocaleController.prefOverridesPrefix}ru'), contains('v7'));
    });

    test('setLanguage saves the choice; a language switched off later falls back', () async {
      final (c, _) = await _container(prefs: {LocaleController.prefLanguages: _languages({'en', 'fr'})});
      expect(await c.read(localeControllerProvider.notifier).setLanguage('fr'), isTrue);
      expect(c.read(localeControllerProvider).locale, const Locale('fr'));
      expect(c.read(sharedPreferencesProvider).getString(LocaleController.prefChoice), 'fr');

      final (later, _) = await _container(
        prefs: {LocaleController.prefChoice: 'fr', LocaleController.prefLanguages: _languages({'en'})},
      );
      expect(later.read(localeControllerProvider).locale, const Locale('en'));
    });
  });
}
