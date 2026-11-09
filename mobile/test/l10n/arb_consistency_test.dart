import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/l10n/app_localizations_overridable.dart';
import 'package:heal_india_global/l10n/enum_types.dart';
import 'package:heal_india_global/l10n/icu_format.dart';

Map<String, dynamic> _arb(String locale) =>
    jsonDecode(File('lib/l10n/app_$locale.arb').readAsStringSync()) as Map<String, dynamic>;

Set<String> _keys(Map<String, dynamic> arb) => arb.keys.where((k) => !k.startsWith('@')).toSet();

void main() {
  const translations = ['ar', 'fr', 'bn', 'ru'];
  final en = _arb('en');
  final enKeys = _keys(en);

  test('app_en.arb is the template: every key documented, placeholders declared with a type', () {
    expect(enKeys, isNotEmpty);
    for (final key in enKeys) {
      final meta = en['@$key'];
      expect(meta, isA<Map<String, dynamic>>(), reason: '@$key metadata missing');
      expect((meta as Map)['description'], isA<String>(), reason: '@$key has no description');
      final declared = ((meta['placeholders'] as Map?) ?? const {}).keys.toSet();
      final used = icuArgumentNames(en[key] as String);
      expect(used, isNotNull, reason: 'en.$key is not valid ICU');
      expect(used, declared, reason: 'en.$key placeholders vs @$key');
      for (final p in ((meta['placeholders'] as Map?) ?? const {}).values) {
        expect((p as Map)['type'], isNotNull, reason: '@$key placeholder without type');
      }
    }
  });

  for (final locale in translations) {
    test('app_$locale.arb has exactly the keys of app_en.arb with the same placeholders', () {
      final arb = _arb(locale);
      expect(arb['@@locale'], locale);
      final keys = _keys(arb)..remove('@@locale');
      expect(enKeys.difference(keys), isEmpty, reason: 'missing in $locale');
      expect(keys.difference(enKeys), isEmpty, reason: 'not in en: $locale');
      for (final key in enKeys) {
        final text = arb[key] as String;
        expect(text.trim(), isNotEmpty, reason: '$locale.$key is empty');
        expect(
          icuArgumentNames(text),
          icuArgumentNames(en[key] as String),
          reason: '$locale.$key placeholders differ from en',
        );
      }
    });
  }

  test('the override wrapper is generated from the current ARB keys', () {
    expect(kL10nKeys.toSet(), enKeys, reason: 'run: flutter gen-l10n && dart run tool/gen_l10n_overrides.dart');
  });

  test('every localized enum value has an ARB key', () {
    for (final values in kLocalizedEnumValues) {
      for (final v in values) {
        final type = kLocalizedEnumTypes[v.runtimeType];
        final key = 'enum$type${v.name[0].toUpperCase()}${v.name.substring(1)}';
        expect(enKeys, contains(key));
        expect(en[key], v.englishLabel, reason: '$key should match englishLabel');
      }
    }
  });
}
