// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'Your Gateway to Indian Medical Excellence';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonOk => 'OK';

  @override
  String get commonSave => 'Save';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonTryAgain => 'Try again';

  @override
  String get commonClose => 'Close';

  @override
  String get commonContinue => 'Continue';

  @override
  String get commonBack => 'Back';

  @override
  String get commonNext => 'Next';

  @override
  String get commonDone => 'Done';

  @override
  String get commonEdit => 'Edit';

  @override
  String get commonDelete => 'Delete';

  @override
  String get commonRemove => 'Remove';

  @override
  String get commonSubmit => 'Submit';

  @override
  String get commonConfirm => 'Confirm';

  @override
  String get commonYes => 'Yes';

  @override
  String get commonNo => 'No';

  @override
  String get commonSeeAll => 'See all';

  @override
  String get commonApply => 'Apply';

  @override
  String get commonReset => 'Reset';

  @override
  String get commonClear => 'Clear';

  @override
  String get commonSkip => 'Skip';

  @override
  String get commonSend => 'Send';

  @override
  String get commonOpen => 'Open';

  @override
  String get commonDownload => 'Download';

  @override
  String get commonUpload => 'Upload';

  @override
  String get commonAdd => 'Add';

  @override
  String get commonOptional => 'Optional';

  @override
  String get commonLoading => 'Loading…';

  @override
  String get commonSomethingWentWrong => 'Something went wrong';

  @override
  String get commonErrorDisplayingSection => 'Something went wrong displaying this section.';

  @override
  String get commonLogOut => 'Log out';

  @override
  String get commonDeleteAccount => 'Delete account';

  @override
  String get commonAccount => 'Account';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'Language';

  @override
  String get languagePickerTitle => 'App language';

  @override
  String get languagePickerHint =>
      'The app, AI summaries and voice intake use this language. Coordinators and hospitals will contact you in it when they can.';

  @override
  String languageChanged(String language) {
    return 'Language changed to $language.';
  }

  @override
  String get languageProfileSyncFailed =>
      'Language changed on this device. We could not save it to your profile; we will try again later.';

  @override
  String get languageButtonTooltip => 'Change language';

  @override
  String get datesJustNow => 'just now';

  @override
  String datesMinutesAgo(int minutes) {
    return '$minutes min ago';
  }

  @override
  String datesHoursAgo(int hours) {
    return '$hours h ago';
  }

  @override
  String get datesYesterday => 'Yesterday';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days days ago', one: '$days day ago');
    return '$_temp0';
  }
}
