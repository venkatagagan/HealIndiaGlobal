import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Synchronous [SharedPreferences] instance. Overridden in `main.dart` (and in tests) with the
/// instance obtained from `SharedPreferences.getInstance()` before `runApp`.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider must be overridden in main()'),
);

/// Preference keys used across the app.
abstract final class PrefKeys {
  static const onboardingSeen = 'hig.onboarding_seen';
  static const themeMode = 'hig.theme_mode';
  static const preferredCurrency = 'hig.preferred_currency';
  static const lastScreeningId = 'hig.last_screening_id';
}

/// Whether the first-launch onboarding carousel has been completed.
///
/// `ref.read(onboardingSeenProvider.notifier).complete()` after "Get Started" / "Explore as Guest".
final onboardingSeenProvider = NotifierProvider<OnboardingSeenController, bool>(OnboardingSeenController.new);

class OnboardingSeenController extends Notifier<bool> {
  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(PrefKeys.onboardingSeen) ?? false;

  Future<void> complete() async {
    await ref.read(sharedPreferencesProvider).setBool(PrefKeys.onboardingSeen, true);
    state = true;
  }

  Future<void> reset() async {
    await ref.read(sharedPreferencesProvider).remove(PrefKeys.onboardingSeen);
    state = false;
  }
}

/// App theme mode (dark is the default, matching the designs).
final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final raw = ref.watch(sharedPreferencesProvider).getString(PrefKeys.themeMode);
    return ThemeMode.values.firstWhere((m) => m.name == raw, orElse: () => ThemeMode.dark);
  }

  Future<void> set(ThemeMode mode) async {
    await ref.read(sharedPreferencesProvider).setString(PrefKeys.themeMode, mode.name);
    state = mode;
  }
}

/// Patient's display currency (ISO-4217). Defaults to USD; profile `preferred_currency` should be
/// written here after login.
final preferredCurrencyProvider = NotifierProvider<PreferredCurrencyController, String>(
  PreferredCurrencyController.new,
);

class PreferredCurrencyController extends Notifier<String> {
  @override
  String build() => ref.watch(sharedPreferencesProvider).getString(PrefKeys.preferredCurrency) ?? 'USD';

  Future<void> set(String currency) async {
    final ccy = currency.toUpperCase();
    await ref.read(sharedPreferencesProvider).setString(PrefKeys.preferredCurrency, ccy);
    state = ccy;
  }
}
