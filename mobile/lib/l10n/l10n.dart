import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart';

import '../core/models/enums.dart';
import 'app_localizations.dart';
import 'app_localizations_overridable.dart';
import 'enum_types.dart';

export 'app_localizations.dart';
export 'app_localizations_overridable.dart' show OverridableLocalizations;

/// `context.l10n.homeTitle` — the app's strings in the current language, with admin overrides.
extension L10nContext on BuildContext {
  /// Falls back to [L10n.current] when no [AppLocalizations] is in scope (bare test harnesses).
  AppLocalizations get l10n => Localizations.of<AppLocalizations>(this, AppLocalizations) ?? L10n.current;
}

/// Admin-edited strings for one locale (`GET /i18n/overrides`), cached on disk by the locale controller.
@immutable
class L10nOverrides {
  const L10nOverrides({required this.locale, this.version = '', this.strings = const {}});

  static const empty = L10nOverrides(locale: '');

  /// Language code these strings belong to (`ar`).
  final String locale;

  /// Server version / etag of the set; a new version reloads the app's strings.
  final String version;

  /// ARB key -> text.
  final Map<String, String> strings;

  factory L10nOverrides.fromJson(Map<String, dynamic> j) {
    final raw = j['strings'];
    return L10nOverrides(
      locale: '${j['locale'] ?? ''}',
      version: '${j['version'] ?? ''}',
      strings: raw is Map
          ? {
              for (final e in raw.entries)
                if (e.value is String) '${e.key}': e.value as String,
            }
          : const {},
    );
  }

  Map<String, dynamic> toJson() => {'locale': locale, 'version': version, 'strings': strings};

  @override
  bool operator ==(Object other) =>
      other is L10nOverrides &&
      other.locale == locale &&
      other.version == version &&
      mapEquals(other.strings, strings);

  @override
  int get hashCode => Object.hash(locale, version, strings.length);
}

/// App-wide localization helpers.
abstract final class L10n {
  /// Languages the app ships translations for (`en` first: the default and fallback).
  static const List<Locale> supportedLocales = AppLocalizations.supportedLocales;

  /// Language codes with right-to-left scripts.
  static const Set<String> rtlLanguages = {'ar', 'fa', 'he', 'ur'};

  static OverridableLocalizations _current = OverridableLocalizations(lookupAppLocalizations(const Locale('en')));

  /// Strings of the language the app currently shows. Use [L10nContext.l10n] in widgets; this is for code
  /// without a [BuildContext] (enum labels, date helpers, validators).
  static OverridableLocalizations get current => _current;

  static bool isSupported(String languageCode) => supportedLocales.any((l) => l.languageCode == languageCode);

  /// Makes [l10n] the current strings and points intl (dates, numbers) at its locale.
  static void setCurrent(OverridableLocalizations l10n) {
    _current = l10n;
    Intl.defaultLocale = l10n.localeName;
    enumLabelResolver = _enumLabel;
  }

  /// Delegates for `MaterialApp.localizationsDelegates`.
  static List<LocalizationsDelegate<Object>> delegates([L10nOverrides overrides = L10nOverrides.empty]) => [
    AppLocalizationsDelegate(overrides),
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ];

  /// Localized label of an enum value: ARB key `enum<Type><Value>`, e.g. `enumBookingStatusPendingPayment`.
  static String? _enumLabel(JsonEnum value) {
    final type = enumTypeNames[value.runtimeType];
    if (type == null) return null;
    final name = value.name;
    return _current.byKey('enum$type${name[0].toUpperCase()}${name.substring(1)}');
  }

  /// Enum types with localized labels (see enum_types.dart).
  static Map<Type, String> get enumTypeNames => kLocalizedEnumTypes;
}

/// Loads [OverridableLocalizations] for the active locale with the admin [overrides] that match it.
class AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const AppLocalizationsDelegate([this.overrides = L10nOverrides.empty]);

  final L10nOverrides overrides;

  @override
  bool isSupported(Locale locale) => L10n.isSupported(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) {
    final strings = overrides.locale == locale.languageCode ? overrides.strings : const <String, String>{};
    final l10n = OverridableLocalizations(lookupAppLocalizations(locale), strings);
    L10n.setCurrent(l10n);
    return SynchronousFuture<AppLocalizations>(l10n);
  }

  @override
  bool shouldReload(AppLocalizationsDelegate old) => old.overrides != overrides;
}
