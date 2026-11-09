// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'Ваш путь к лучшей медицине Индии';

  @override
  String get commonCancel => 'Отмена';

  @override
  String get commonOk => 'ОК';

  @override
  String get commonSave => 'Сохранить';

  @override
  String get commonRetry => 'Повторить';

  @override
  String get commonTryAgain => 'Попробовать снова';

  @override
  String get commonClose => 'Закрыть';

  @override
  String get commonContinue => 'Продолжить';

  @override
  String get commonBack => 'Назад';

  @override
  String get commonNext => 'Далее';

  @override
  String get commonDone => 'Готово';

  @override
  String get commonEdit => 'Изменить';

  @override
  String get commonDelete => 'Удалить';

  @override
  String get commonRemove => 'Убрать';

  @override
  String get commonSubmit => 'Отправить';

  @override
  String get commonConfirm => 'Подтвердить';

  @override
  String get commonYes => 'Да';

  @override
  String get commonNo => 'Нет';

  @override
  String get commonSeeAll => 'Показать все';

  @override
  String get commonApply => 'Применить';

  @override
  String get commonReset => 'Сбросить';

  @override
  String get commonClear => 'Очистить';

  @override
  String get commonSkip => 'Пропустить';

  @override
  String get commonSend => 'Отправить';

  @override
  String get commonOpen => 'Открыть';

  @override
  String get commonDownload => 'Скачать';

  @override
  String get commonUpload => 'Загрузить';

  @override
  String get commonAdd => 'Добавить';

  @override
  String get commonOptional => 'Необязательно';

  @override
  String get commonLoading => 'Загрузка…';

  @override
  String get commonSomethingWentWrong => 'Что-то пошло не так';

  @override
  String get commonErrorDisplayingSection => 'Не удалось показать этот раздел.';

  @override
  String get commonLogOut => 'Выйти';

  @override
  String get commonDeleteAccount => 'Удалить аккаунт';

  @override
  String get commonAccount => 'Аккаунт';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'Язык';

  @override
  String get languagePickerTitle => 'Язык приложения';

  @override
  String get languagePickerHint =>
      'Приложение, сводки ИИ и голосовой ввод используют этот язык. Координаторы и больницы будут связываться с вами на нём, когда это возможно.';

  @override
  String languageChanged(String language) {
    return 'Язык изменён: $language.';
  }

  @override
  String get languageProfileSyncFailed =>
      'Язык изменён на этом устройстве. Не удалось сохранить его в профиле; мы попробуем позже.';

  @override
  String get languageButtonTooltip => 'Сменить язык';

  @override
  String get datesJustNow => 'только что';

  @override
  String datesMinutesAgo(int minutes) {
    return '$minutes мин назад';
  }

  @override
  String datesHoursAgo(int hours) {
    return '$hours ч назад';
  }

  @override
  String get datesYesterday => 'Вчера';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days дня назад',
      many: '$days дней назад',
      few: '$days дня назад',
      one: '$days день назад',
    );
    return '$_temp0';
  }
}
