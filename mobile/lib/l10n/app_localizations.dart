import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_bn.dart';
import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_ru.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ar'),
    Locale('bn'),
    Locale('fr'),
    Locale('ru'),
  ];

  /// Brand name. Keep in Latin script in every language.
  ///
  /// In en, this message translates to:
  /// **'Heal India Global'**
  String get appName;

  /// Brand tagline shown under the app name.
  ///
  /// In en, this message translates to:
  /// **'Your Gateway to Indian Medical Excellence'**
  String get appTagline;

  /// Generic button: dismiss a dialog or sheet without changes.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// Generic button: acknowledge a message.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get commonOk;

  /// Generic button: save changes.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// Generic button: retry a failed action.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// Generic button: try a failed action again.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get commonTryAgain;

  /// Generic button / tooltip: close a sheet, dialog or screen.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// Generic button: go to the next step.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get commonContinue;

  /// Generic button / tooltip: go back.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// Generic button: next step.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get commonNext;

  /// Generic button: finish.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get commonDone;

  /// Generic button: edit an item.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get commonEdit;

  /// Generic button: delete an item.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// Generic button: remove an item from a list.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get commonRemove;

  /// Generic button: submit a form.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get commonSubmit;

  /// Generic button: confirm an action.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get commonConfirm;

  /// Generic answer: yes.
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get commonYes;

  /// Generic answer: no.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get commonNo;

  /// Link to the full list of a section.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get commonSeeAll;

  /// Generic button: apply filters or settings.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get commonApply;

  /// Generic button: reset filters or a form.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get commonReset;

  /// Generic button: clear a field or selection.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get commonClear;

  /// Generic button: skip a step.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get commonSkip;

  /// Generic button: send a message or request.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get commonSend;

  /// Generic button: open a file or item.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get commonOpen;

  /// Generic button: download a file.
  ///
  /// In en, this message translates to:
  /// **'Download'**
  String get commonDownload;

  /// Generic button: upload a file.
  ///
  /// In en, this message translates to:
  /// **'Upload'**
  String get commonUpload;

  /// Generic button: add an item.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get commonAdd;

  /// Marks a form field as optional.
  ///
  /// In en, this message translates to:
  /// **'Optional'**
  String get commonOptional;

  /// Shown while content is loading.
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get commonLoading;

  /// Generic error title.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get commonSomethingWentWrong;

  /// Shown instead of a screen section that failed to render (release builds).
  ///
  /// In en, this message translates to:
  /// **'Something went wrong displaying this section.'**
  String get commonErrorDisplayingSection;

  /// Menu item / button: sign out of the app.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get commonLogOut;

  /// Menu item: permanently delete the user's account.
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get commonDeleteAccount;

  /// Tooltip of the account menu button.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get commonAccount;

  /// Separator between short facts on one line (e.g. 'Delhi · 4.8 ★'). Usually keep as is.
  ///
  /// In en, this message translates to:
  /// **' · '**
  String get commonListSeparator;

  /// Settings row title for the app language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageSettingTitle;

  /// Title of the bottom sheet that lists the languages the user can choose.
  ///
  /// In en, this message translates to:
  /// **'App language'**
  String get languagePickerTitle;

  /// Explanation under the language picker title.
  ///
  /// In en, this message translates to:
  /// **'The app, AI summaries and voice intake use this language. Coordinators and hospitals will contact you in it when they can.'**
  String get languagePickerHint;

  /// Snack bar after the user picks a language.
  ///
  /// In en, this message translates to:
  /// **'Language changed to {language}.'**
  String languageChanged(String language);

  /// Snack bar when the language change could not be saved to the user's online profile.
  ///
  /// In en, this message translates to:
  /// **'Language changed on this device. We could not save it to your profile; we will try again later.'**
  String get languageProfileSyncFailed;

  /// Tooltip / accessibility label of the language button on the welcome screen.
  ///
  /// In en, this message translates to:
  /// **'Change language'**
  String get languageButtonTooltip;

  /// Relative time: less than a minute ago (lower case, shown next to messages and notifications).
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get datesJustNow;

  /// Relative time in minutes (abbreviated).
  ///
  /// In en, this message translates to:
  /// **'{minutes} min ago'**
  String datesMinutesAgo(int minutes);

  /// Relative time in hours (abbreviated).
  ///
  /// In en, this message translates to:
  /// **'{hours} h ago'**
  String datesHoursAgo(int hours);

  /// Relative day: yesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get datesYesterday;

  /// Relative time in days (2 to 6).
  ///
  /// In en, this message translates to:
  /// **'{days, plural, one{{days} day ago} other{{days} days ago}}'**
  String datesDaysAgo(int days);
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['ar', 'bn', 'en', 'fr', 'ru'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'bn':
      return AppLocalizationsBn();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
    case 'ru':
      return AppLocalizationsRu();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
