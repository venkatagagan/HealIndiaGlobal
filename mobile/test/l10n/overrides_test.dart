import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/enums.dart';
import 'package:heal_india_global/l10n/icu_format.dart';
import 'package:heal_india_global/l10n/l10n.dart';

OverridableLocalizations _l10n(String locale, [Map<String, String> overrides = const {}]) =>
    OverridableLocalizations(lookupAppLocalizations(Locale(locale)), overrides);

void main() {
  tearDown(() => L10n.setCurrent(_l10n('en')));

  group('formatIcu', () {
    test('arguments, plurals (exact, CLDR category, #) and selects', () {
      expect(formatIcu('Hi {name}!', {'name': 'Asha'}, 'en'), 'Hi Asha!');
      const plural = '{n, plural, =0{none} one{# item} other{{n} items}}';
      expect(formatIcu(plural, {'n': 0}, 'en'), 'none');
      expect(formatIcu(plural, {'n': 1}, 'en'), '1 item');
      expect(formatIcu(plural, {'n': 7}, 'en'), '7 items');
      const ru = '{n, plural, one{{n} день} few{{n} дня} many{{n} дней} other{{n} дня}}';
      expect(formatIcu(ru, {'n': 21}, 'ru'), '21 день');
      expect(formatIcu(ru, {'n': 3}, 'ru'), '3 дня');
      expect(formatIcu(ru, {'n': 11}, 'ru'), '11 дней');
      expect(formatIcu('{k, select, doctor{Dr} other{-}}', {'k': 'doctor'}, 'en'), 'Dr');
      expect(formatIcu('{k, select, doctor{Dr} other{-}}', {'k': 'x'}, 'en'), '-');
    });

    test('malformed text or unknown arguments return null', () {
      expect(formatIcu('Hi {name', {'name': 'A'}, 'en'), isNull);
      expect(formatIcu('Hi {who}', {'name': 'A'}, 'en'), isNull);
      expect(formatIcu('{n, plural, one{x}}', {'n': 1}, 'en'), isNull);
      expect(icuArgumentNames('{a} and {b, plural, other{{c}}}'), {'a', 'b', 'c'});
    });
  });

  group('OverridableLocalizations', () {
    test('without overrides it returns the shipped strings', () {
      expect(_l10n('en').commonCancel, 'Cancel');
      expect(_l10n('fr').commonCancel, 'Annuler');
      expect(_l10n('ar').languageChanged('Français'), contains('Français'));
    });

    test('an override wins, placeholders and plurals still render', () {
      final l = _l10n('fr', {
        'commonCancel': 'Fermer sans enregistrer',
        'languageChanged': 'Nouvelle langue : {language}',
        'datesDaysAgo': '{days, plural, one{hier ({days})} other{{days} j}}',
      });
      expect(l.commonCancel, 'Fermer sans enregistrer');
      expect(l.languageChanged('العربية'), 'Nouvelle langue : العربية');
      expect(l.datesDaysAgo(1), 'hier (1)');
      expect(l.datesDaysAgo(4), '4 j');
      expect(l.commonSave, 'Enregistrer'); // not overridden
    });

    test('a broken or empty override falls back to the shipped value', () {
      final l = _l10n('en', {'languageChanged': 'Now {lang', 'commonSave': ''});
      expect(l.languageChanged('Русский'), 'Language changed to Русский.');
      expect(l.commonSave, 'Save');
    });

    test('byKey and enum labels follow the current language and overrides', () {
      expect(BookingStatus.pendingPayment.label, isNotEmpty);
      L10n.setCurrent(_l10n('fr', {'enumBookingStatusConfirmed': 'Réservation confirmée'}));
      expect(BookingStatus.pendingPayment.label, 'En attente de paiement');
      expect(BookingStatus.confirmed.label, 'Réservation confirmée');
      expect(BookingStatus.confirmed.englishLabel, 'Confirmed');
      expect(L10n.current.byKey('nope'), isNull);
    });
  });

  test('delegate applies only the overrides of the loaded locale and reloads on a new version', () async {
    const ar = L10nOverrides(locale: 'ar', version: 'v1', strings: {'commonCancel': 'رجوع'});
    final loadedAr = await const AppLocalizationsDelegate(ar).load(const Locale('ar'));
    expect(loadedAr.commonCancel, 'رجوع');
    final loadedFr = await const AppLocalizationsDelegate(ar).load(const Locale('fr'));
    expect(loadedFr.commonCancel, 'Annuler');
    const v2 = L10nOverrides(locale: 'ar', version: 'v2', strings: {'commonCancel': 'إلغاء الأمر'});
    expect(const AppLocalizationsDelegate(v2).shouldReload(const AppLocalizationsDelegate(ar)), isTrue);
    expect(const AppLocalizationsDelegate(ar).shouldReload(const AppLocalizationsDelegate(ar)), isFalse);
    expect(L10n.current.localeName, 'fr');
  });
}
