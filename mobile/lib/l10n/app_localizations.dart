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

  /// Label of the UserRole value `patient` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Patient'**
  String get enumUserRolePatient;

  /// Label of the UserRole value `agent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Agent'**
  String get enumUserRoleAgent;

  /// Label of the UserRole value `hospital` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Hospital'**
  String get enumUserRoleHospital;

  /// Label of the UserRole value `admin` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get enumUserRoleAdmin;

  /// Label of the UserRole value `finance` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Finance'**
  String get enumUserRoleFinance;

  /// Label of the UserRole value `support` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Support'**
  String get enumUserRoleSupport;

  /// Label of the UserRole value `superAdmin` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Super admin'**
  String get enumUserRoleSuperAdmin;

  /// Label of the UserStatus value `active` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get enumUserStatusActive;

  /// Label of the UserStatus value `pendingVerification` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending verification'**
  String get enumUserStatusPendingVerification;

  /// Label of the UserStatus value `suspended` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Suspended'**
  String get enumUserStatusSuspended;

  /// Label of the UserStatus value `deleted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Deleted'**
  String get enumUserStatusDeleted;

  /// Label of the Gender value `male` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get enumGenderMale;

  /// Label of the Gender value `female` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get enumGenderFemale;

  /// Label of the Gender value `other` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get enumGenderOther;

  /// Label of the Gender value `undisclosed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Undisclosed'**
  String get enumGenderUndisclosed;

  /// Label of the DoctorGenderPref value `male` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get enumDoctorGenderPrefMale;

  /// Label of the DoctorGenderPref value `female` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get enumDoctorGenderPrefFemale;

  /// Label of the DoctorGenderPref value `noPreference` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'No Preference'**
  String get enumDoctorGenderPrefNoPreference;

  /// Label of the KycStatus value `notSubmitted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Not submitted'**
  String get enumKycStatusNotSubmitted;

  /// Label of the KycStatus value `pending` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get enumKycStatusPending;

  /// Label of the KycStatus value `approved` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get enumKycStatusApproved;

  /// Label of the KycStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumKycStatusRejected;

  /// Label of the HospitalStatus value `draft` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get enumHospitalStatusDraft;

  /// Label of the HospitalStatus value `pendingReview` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending review'**
  String get enumHospitalStatusPendingReview;

  /// Label of the HospitalStatus value `active` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get enumHospitalStatusActive;

  /// Label of the HospitalStatus value `suspended` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Suspended'**
  String get enumHospitalStatusSuspended;

  /// Label of the HospitalStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumHospitalStatusRejected;

  /// Label of the AgentStatus value `pending` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get enumAgentStatusPending;

  /// Label of the AgentStatus value `active` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get enumAgentStatusActive;

  /// Label of the AgentStatus value `suspended` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Suspended'**
  String get enumAgentStatusSuspended;

  /// Label of the AgentStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumAgentStatusRejected;

  /// Label of the HospitalMemberRole value `owner` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Owner'**
  String get enumHospitalMemberRoleOwner;

  /// Label of the HospitalMemberRole value `admin` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get enumHospitalMemberRoleAdmin;

  /// Label of the HospitalMemberRole value `coordinator` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Coordinator'**
  String get enumHospitalMemberRoleCoordinator;

  /// Label of the HospitalMemberRole value `finance` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Finance'**
  String get enumHospitalMemberRoleFinance;

  /// Label of the HospitalMemberRole value `doctor` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Doctor'**
  String get enumHospitalMemberRoleDoctor;

  /// Label of the PackageTier value `medicalOnly` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Medical Only'**
  String get enumPackageTierMedicalOnly;

  /// Label of the PackageTier value `medicalStay` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Medical + Stay'**
  String get enumPackageTierMedicalStay;

  /// Label of the PackageTier value `allInclusive` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'All-inclusive'**
  String get enumPackageTierAllInclusive;

  /// Label of the ScreeningStatus value `draft` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get enumScreeningStatusDraft;

  /// Label of the ScreeningStatus value `processing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get enumScreeningStatusProcessing;

  /// Label of the ScreeningStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumScreeningStatusCompleted;

  /// Label of the ScreeningStatus value `failed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get enumScreeningStatusFailed;

  /// Label of the Urgency value `routine` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Routine'**
  String get enumUrgencyRoutine;

  /// Label of the Urgency value `soon` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Soon'**
  String get enumUrgencySoon;

  /// Label of the Urgency value `urgent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Urgent'**
  String get enumUrgencyUrgent;

  /// Label of the Urgency value `emergency` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Emergency'**
  String get enumUrgencyEmergency;

  /// Label of the DurationUnit value `days` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Days'**
  String get enumDurationUnitDays;

  /// Label of the DurationUnit value `weeks` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Weeks'**
  String get enumDurationUnitWeeks;

  /// Label of the DurationUnit value `months` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Months'**
  String get enumDurationUnitMonths;

  /// Label of the DurationUnit value `years` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Years'**
  String get enumDurationUnitYears;

  /// Label of the SeverityLevel value `none` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get enumSeverityLevelNone;

  /// Label of the SeverityLevel value `mild` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Mild'**
  String get enumSeverityLevelMild;

  /// Label of the SeverityLevel value `moderate` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Moderate'**
  String get enumSeverityLevelModerate;

  /// Label of the SeverityLevel value `severe` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Severe'**
  String get enumSeverityLevelSevere;

  /// Label of the SymptomAnswer value `yes` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get enumSymptomAnswerYes;

  /// Label of the SymptomAnswer value `maybe` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Maybe'**
  String get enumSymptomAnswerMaybe;

  /// Label of the SymptomAnswer value `no` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get enumSymptomAnswerNo;

  /// Label of the CaseStatus value `enquiry` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Enquiry'**
  String get enumCaseStatusEnquiry;

  /// Label of the CaseStatus value `quoted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Quoted'**
  String get enumCaseStatusQuoted;

  /// Label of the CaseStatus value `accepted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get enumCaseStatusAccepted;

  /// Label of the CaseStatus value `booked` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Booked'**
  String get enumCaseStatusBooked;

  /// Label of the CaseStatus value `inTreatment` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'In treatment'**
  String get enumCaseStatusInTreatment;

  /// Label of the CaseStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumCaseStatusCompleted;

  /// Label of the CaseStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumCaseStatusCancelled;

  /// Label of the CaseStatus value `declined` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Declined'**
  String get enumCaseStatusDeclined;

  /// Label of the QuoteStatus value `draft` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get enumQuoteStatusDraft;

  /// Label of the QuoteStatus value `sent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Sent'**
  String get enumQuoteStatusSent;

  /// Label of the QuoteStatus value `accepted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get enumQuoteStatusAccepted;

  /// Label of the QuoteStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumQuoteStatusRejected;

  /// Label of the QuoteStatus value `expired` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get enumQuoteStatusExpired;

  /// Label of the QuoteStatus value `withdrawn` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get enumQuoteStatusWithdrawn;

  /// Label of the QuoteLineCategory value `surgery` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Surgery'**
  String get enumQuoteLineCategorySurgery;

  /// Label of the QuoteLineCategory value `hospitalStay` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Hospital Stay'**
  String get enumQuoteLineCategoryHospitalStay;

  /// Label of the QuoteLineCategory value `medications` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Medications'**
  String get enumQuoteLineCategoryMedications;

  /// Label of the QuoteLineCategory value `testsScans` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Tests & Scans'**
  String get enumQuoteLineCategoryTestsScans;

  /// Label of the QuoteLineCategory value `doctorFees` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Doctor Fees'**
  String get enumQuoteLineCategoryDoctorFees;

  /// Label of the QuoteLineCategory value `implants` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Implants'**
  String get enumQuoteLineCategoryImplants;

  /// Label of the QuoteLineCategory value `other` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get enumQuoteLineCategoryOther;

  /// Label of the BookingStatus value `pendingPayment` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending payment'**
  String get enumBookingStatusPendingPayment;

  /// Label of the BookingStatus value `confirmed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get enumBookingStatusConfirmed;

  /// Label of the BookingStatus value `admitted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Admitted'**
  String get enumBookingStatusAdmitted;

  /// Label of the BookingStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumBookingStatusCompleted;

  /// Label of the BookingStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumBookingStatusCancelled;

  /// Label of the PaymentOption value `full` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pay in full'**
  String get enumPaymentOptionFull;

  /// Label of the PaymentOption value `deposit` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Deposit'**
  String get enumPaymentOptionDeposit;

  /// Label of the PaymentOption value `installments` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Payment plan'**
  String get enumPaymentOptionInstallments;

  /// Label of the ConsultationStatus value `requested` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get enumConsultationStatusRequested;

  /// Label of the ConsultationStatus value `scheduled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Scheduled'**
  String get enumConsultationStatusScheduled;

  /// Label of the ConsultationStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumConsultationStatusCompleted;

  /// Label of the ConsultationStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumConsultationStatusCancelled;

  /// Label of the ChecklistStatus value `pending` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get enumChecklistStatusPending;

  /// Label of the ChecklistStatus value `inProgress` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get enumChecklistStatusInProgress;

  /// Label of the ChecklistStatus value `done` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get enumChecklistStatusDone;

  /// Label of the ItineraryKind value `appointment` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Appointment'**
  String get enumItineraryKindAppointment;

  /// Label of the ItineraryKind value `admission` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Admission'**
  String get enumItineraryKindAdmission;

  /// Label of the ItineraryKind value `surgery` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Surgery'**
  String get enumItineraryKindSurgery;

  /// Label of the ItineraryKind value `pickup` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pickup'**
  String get enumItineraryKindPickup;

  /// Label of the ItineraryKind value `checkin` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Check-in'**
  String get enumItineraryKindCheckin;

  /// Label of the ItineraryKind value `checkout` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Check-out'**
  String get enumItineraryKindCheckout;

  /// Label of the ItineraryKind value `followup` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Follow-up'**
  String get enumItineraryKindFollowup;

  /// Label of the ItineraryKind value `sightseeing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Sightseeing'**
  String get enumItineraryKindSightseeing;

  /// Label of the ItineraryKind value `other` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get enumItineraryKindOther;

  /// Label of the VisaStatus value `notStarted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Not started'**
  String get enumVisaStatusNotStarted;

  /// Label of the VisaStatus value `documentsPending` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Documents pending'**
  String get enumVisaStatusDocumentsPending;

  /// Label of the VisaStatus value `invitationIssued` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Invitation issued'**
  String get enumVisaStatusInvitationIssued;

  /// Label of the VisaStatus value `applied` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Applied'**
  String get enumVisaStatusApplied;

  /// Label of the VisaStatus value `approved` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get enumVisaStatusApproved;

  /// Label of the VisaStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumVisaStatusRejected;

  /// Label of the TravelKind value `flight` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Flight'**
  String get enumTravelKindFlight;

  /// Label of the TravelKind value `airportPickup` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Airport pickup'**
  String get enumTravelKindAirportPickup;

  /// Label of the TravelKind value `airportDrop` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Airport drop'**
  String get enumTravelKindAirportDrop;

  /// Label of the TravelKind value `localTransport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Local transport'**
  String get enumTravelKindLocalTransport;

  /// Label of the ServiceBookingStatus value `requested` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get enumServiceBookingStatusRequested;

  /// Label of the ServiceBookingStatus value `quoted` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Quoted'**
  String get enumServiceBookingStatusQuoted;

  /// Label of the ServiceBookingStatus value `confirmed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get enumServiceBookingStatusConfirmed;

  /// Label of the ServiceBookingStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumServiceBookingStatusCompleted;

  /// Label of the ServiceBookingStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumServiceBookingStatusCancelled;

  /// Label of the AccommodationType value `hotel` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Hotel'**
  String get enumAccommodationTypeHotel;

  /// Label of the AccommodationType value `guestHouse` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Guest house'**
  String get enumAccommodationTypeGuestHouse;

  /// Label of the AccommodationType value `serviceApartment` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Service apartment'**
  String get enumAccommodationTypeServiceApartment;

  /// Label of the AccommodationType value `hospitalGuestRoom` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Hospital guest room'**
  String get enumAccommodationTypeHospitalGuestRoom;

  /// Label of the ServiceKind value `translator` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Translator'**
  String get enumServiceKindTranslator;

  /// Label of the ServiceKind value `localGuide` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Local guide'**
  String get enumServiceKindLocalGuide;

  /// Label of the ServiceKind value `transport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Transport'**
  String get enumServiceKindTransport;

  /// Label of the ServiceKind value `travelAgent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Travel agent'**
  String get enumServiceKindTravelAgent;

  /// Label of the ServiceKind value `insurance` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get enumServiceKindInsurance;

  /// Label of the DocumentKind value `passport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Passport'**
  String get enumDocumentKindPassport;

  /// Label of the DocumentKind value `visa` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Visa'**
  String get enumDocumentKindVisa;

  /// Label of the DocumentKind value `medicalReport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Medical report'**
  String get enumDocumentKindMedicalReport;

  /// Label of the DocumentKind value `prescription` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Prescription'**
  String get enumDocumentKindPrescription;

  /// Label of the DocumentKind value `labResult` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Lab result'**
  String get enumDocumentKindLabResult;

  /// Label of the DocumentKind value `imaging` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Imaging'**
  String get enumDocumentKindImaging;

  /// Label of the DocumentKind value `invitationLetter` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Invitation letter'**
  String get enumDocumentKindInvitationLetter;

  /// Label of the DocumentKind value `invoice` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Invoice'**
  String get enumDocumentKindInvoice;

  /// Label of the DocumentKind value `receipt` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Receipt'**
  String get enumDocumentKindReceipt;

  /// Label of the DocumentKind value `kycRegistration` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Kyc registration'**
  String get enumDocumentKindKycRegistration;

  /// Label of the DocumentKind value `kycAccreditation` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Kyc accreditation'**
  String get enumDocumentKindKycAccreditation;

  /// Label of the DocumentKind value `kycPan` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'PAN card'**
  String get enumDocumentKindKycPan;

  /// Label of the DocumentKind value `kycGst` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'GST certificate'**
  String get enumDocumentKindKycGst;

  /// Label of the DocumentKind value `kycIdProof` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'ID proof'**
  String get enumDocumentKindKycIdProof;

  /// Label of the DocumentKind value `bankProof` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Bank proof'**
  String get enumDocumentKindBankProof;

  /// Label of the DocumentKind value `paymentProof` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Payment proof'**
  String get enumDocumentKindPaymentProof;

  /// Label of the DocumentKind value `other` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get enumDocumentKindOther;

  /// Label of the DocumentStatus value `uploaded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Uploaded'**
  String get enumDocumentStatusUploaded;

  /// Label of the DocumentStatus value `verified` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get enumDocumentStatusVerified;

  /// Label of the DocumentStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumDocumentStatusRejected;

  /// Label of the ConsentKind value `terms` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Terms'**
  String get enumConsentKindTerms;

  /// Label of the ConsentKind value `privacy` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get enumConsentKindPrivacy;

  /// Label of the ConsentKind value `aiProcessing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Ai processing'**
  String get enumConsentKindAiProcessing;

  /// Label of the ConsentKind value `shareWithHospitals` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Share with hospitals'**
  String get enumConsentKindShareWithHospitals;

  /// Label of the ConsentKind value `marketing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Marketing'**
  String get enumConsentKindMarketing;

  /// Label of the ConsentKind value `share_with_agent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Share with agent'**
  String get enumConsentKindShareWithAgent;

  /// Label of the ConsentKind value `guardian_consent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Guardian consent'**
  String get enumConsentKindGuardianConsent;

  /// Label of the PaymentGateway value `razorpay` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Credit/Debit Card'**
  String get enumPaymentGatewayRazorpay;

  /// Label of the PaymentGateway value `stripe` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Card (Stripe)'**
  String get enumPaymentGatewayStripe;

  /// Label of the PaymentGateway value `bankTransfer` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Bank Transfer'**
  String get enumPaymentGatewayBankTransfer;

  /// Label of the PaymentGateway value `mock` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Test payment'**
  String get enumPaymentGatewayMock;

  /// Label of the PaymentPurpose value `consultationFee` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Consultation fee'**
  String get enumPaymentPurposeConsultationFee;

  /// Label of the PaymentPurpose value `bookingDeposit` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Booking deposit'**
  String get enumPaymentPurposeBookingDeposit;

  /// Label of the PaymentPurpose value `bookingBalance` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Booking balance'**
  String get enumPaymentPurposeBookingBalance;

  /// Label of the PaymentPurpose value `bookingFull` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Booking full'**
  String get enumPaymentPurposeBookingFull;

  /// Label of the PaymentPurpose value `installment` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Installment'**
  String get enumPaymentPurposeInstallment;

  /// Label of the PaymentPurpose value `service` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Service'**
  String get enumPaymentPurposeService;

  /// Label of the OrderStatus value `created` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Created'**
  String get enumOrderStatusCreated;

  /// Label of the OrderStatus value `pending` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get enumOrderStatusPending;

  /// Label of the OrderStatus value `paid` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get enumOrderStatusPaid;

  /// Label of the OrderStatus value `partiallyRefunded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Partially refunded'**
  String get enumOrderStatusPartiallyRefunded;

  /// Label of the OrderStatus value `refunded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Refunded'**
  String get enumOrderStatusRefunded;

  /// Label of the OrderStatus value `failed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get enumOrderStatusFailed;

  /// Label of the OrderStatus value `expired` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get enumOrderStatusExpired;

  /// Label of the OrderStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumOrderStatusCancelled;

  /// Label of the PaymentStatus value `created` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Created'**
  String get enumPaymentStatusCreated;

  /// Label of the PaymentStatus value `authorized` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Authorized'**
  String get enumPaymentStatusAuthorized;

  /// Label of the PaymentStatus value `captured` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Captured'**
  String get enumPaymentStatusCaptured;

  /// Label of the PaymentStatus value `failed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get enumPaymentStatusFailed;

  /// Label of the PaymentStatus value `refunded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Refunded'**
  String get enumPaymentStatusRefunded;

  /// Label of the PaymentStatus value `partiallyRefunded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Partially refunded'**
  String get enumPaymentStatusPartiallyRefunded;

  /// Label of the RefundStatus value `requested` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get enumRefundStatusRequested;

  /// Label of the RefundStatus value `approved` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get enumRefundStatusApproved;

  /// Label of the RefundStatus value `processing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get enumRefundStatusProcessing;

  /// Label of the RefundStatus value `processed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Processed'**
  String get enumRefundStatusProcessed;

  /// Label of the RefundStatus value `failed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get enumRefundStatusFailed;

  /// Label of the RefundStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumRefundStatusRejected;

  /// Label of the InstallmentStatus value `due` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get enumInstallmentStatusDue;

  /// Label of the InstallmentStatus value `paid` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get enumInstallmentStatusPaid;

  /// Label of the InstallmentStatus value `overdue` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get enumInstallmentStatusOverdue;

  /// Label of the InstallmentStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumInstallmentStatusCancelled;

  /// Label of the InvoiceKind value `patientReceipt` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Patient receipt'**
  String get enumInvoiceKindPatientReceipt;

  /// Label of the InvoiceKind value `commissionInvoice` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Commission invoice'**
  String get enumInvoiceKindCommissionInvoice;

  /// Label of the InvoiceKind value `agentStatement` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Agent statement'**
  String get enumInvoiceKindAgentStatement;

  /// Label of the PayeeType value `hospital` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Hospital'**
  String get enumPayeeTypeHospital;

  /// Label of the PayeeType value `agent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Agent'**
  String get enumPayeeTypeAgent;

  /// Label of the PayeeType value `vendor` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Vendor'**
  String get enumPayeeTypeVendor;

  /// Label of the ItineraryItemStatus value `scheduled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Scheduled'**
  String get enumItineraryItemStatusScheduled;

  /// Label of the ItineraryItemStatus value `done` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get enumItineraryItemStatusDone;

  /// Label of the ItineraryItemStatus value `cancelled` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get enumItineraryItemStatusCancelled;

  /// Label of the VisaType value `eMedical` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'e-Medical Visa'**
  String get enumVisaTypeEMedical;

  /// Label of the VisaType value `eMedicalAttendant` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'e-Medical Attendant Visa'**
  String get enumVisaTypeEMedicalAttendant;

  /// Label of the SosStatus value `open` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get enumSosStatusOpen;

  /// Label of the SosStatus value `acknowledged` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Acknowledged'**
  String get enumSosStatusAcknowledged;

  /// Label of the SosStatus value `resolved` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get enumSosStatusResolved;

  /// Label of the ConversationKind value `caseThread` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Case'**
  String get enumConversationKindCaseThread;

  /// Label of the ConversationKind value `support` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Support'**
  String get enumConversationKindSupport;

  /// Label of the ConversationKind value `direct` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Direct'**
  String get enumConversationKindDirect;

  /// Label of the SavedEntityType value `hospital` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Hospital'**
  String get enumSavedEntityTypeHospital;

  /// Label of the SavedEntityType value `doctor` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Doctor'**
  String get enumSavedEntityTypeDoctor;

  /// Label of the SavedEntityType value `procedure` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Procedure'**
  String get enumSavedEntityTypeProcedure;

  /// Label of the ConsultationMode value `video` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get enumConsultationModeVideo;

  /// Label of the ConsultationMode value `phone` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get enumConsultationModePhone;

  /// Label of the SlotKind value `consultation` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Consultation'**
  String get enumSlotKindConsultation;

  /// Label of the SlotKind value `admission` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Admission'**
  String get enumSlotKindAdmission;

  /// Label of the TriageEngine value `claude` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'AI (Claude)'**
  String get enumTriageEngineClaude;

  /// Label of the TriageEngine value `rules` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rules engine'**
  String get enumTriageEngineRules;

  /// Label of the Likelihood value `low` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get enumLikelihoodLow;

  /// Label of the Likelihood value `medium` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get enumLikelihoodMedium;

  /// Label of the Likelihood value `high` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get enumLikelihoodHigh;

  /// Label of the DevicePlatform value `android` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Android'**
  String get enumDevicePlatformAndroid;

  /// Label of the DevicePlatform value `ios` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Ios'**
  String get enumDevicePlatformIos;

  /// Label of the DevicePlatform value `web` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Web'**
  String get enumDevicePlatformWeb;

  /// Label of the PreviousTreatment value `medication` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Medication'**
  String get enumPreviousTreatmentMedication;

  /// Label of the PreviousTreatment value `physicalTherapy` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Physical therapy'**
  String get enumPreviousTreatmentPhysicalTherapy;

  /// Label of the PreviousTreatment value `surgery` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Surgery'**
  String get enumPreviousTreatmentSurgery;

  /// Label of the PreviousTreatment value `other` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get enumPreviousTreatmentOther;

  /// Label of the ChecklistKey value `treatmentBooked` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Treatment booked'**
  String get enumChecklistKeyTreatmentBooked;

  /// Label of the ChecklistKey value `visaApproved` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Visa approved'**
  String get enumChecklistKeyVisaApproved;

  /// Label of the ChecklistKey value `flightBooked` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Flight Booking'**
  String get enumChecklistKeyFlightBooked;

  /// Label of the ChecklistKey value `travelInsurance` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Travel insurance'**
  String get enumChecklistKeyTravelInsurance;

  /// Label of the ChecklistKey value `airportPickup` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Airport pickup'**
  String get enumChecklistKeyAirportPickup;

  /// Label of the ChecklistKey value `documentsUploaded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Documents uploaded'**
  String get enumChecklistKeyDocumentsUploaded;

  /// Label of the ChecklistKey value `accommodationBooked` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Accommodation booked'**
  String get enumChecklistKeyAccommodationBooked;

  /// Label of the AnalysisStatus value `queued` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Queued'**
  String get enumAnalysisStatusQueued;

  /// Label of the AnalysisStatus value `processing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get enumAnalysisStatusProcessing;

  /// Label of the AnalysisStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumAnalysisStatusCompleted;

  /// Label of the AnalysisStatus value `failed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get enumAnalysisStatusFailed;

  /// Label of the AnalysisStatus value `unsupported` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Unsupported'**
  String get enumAnalysisStatusUnsupported;

  /// Label of the AnalysisReviewStatus value `pendingReview` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending review'**
  String get enumAnalysisReviewStatusPendingReview;

  /// Label of the AnalysisReviewStatus value `confirmed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get enumAnalysisReviewStatusConfirmed;

  /// Label of the AnalysisReviewStatus value `rejected` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get enumAnalysisReviewStatusRejected;

  /// Label of the ReportDocType value `labReport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Lab report'**
  String get enumReportDocTypeLabReport;

  /// Label of the ReportDocType value `imagingReport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Imaging report'**
  String get enumReportDocTypeImagingReport;

  /// Label of the ReportDocType value `dischargeSummary` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Discharge summary'**
  String get enumReportDocTypeDischargeSummary;

  /// Label of the ReportDocType value `prescription` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Prescription'**
  String get enumReportDocTypePrescription;

  /// Label of the ReportDocType value `consultationNote` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Consultation note'**
  String get enumReportDocTypeConsultationNote;

  /// Label of the ReportDocType value `pathologyReport` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pathology report'**
  String get enumReportDocTypePathologyReport;

  /// Label of the ReportDocType value `insuranceDocument` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Insurance document'**
  String get enumReportDocTypeInsuranceDocument;

  /// Label of the ReportDocType value `other` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get enumReportDocTypeOther;

  /// Label of the FindingSignificance value `normal` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get enumFindingSignificanceNormal;

  /// Label of the FindingSignificance value `attention` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Attention'**
  String get enumFindingSignificanceAttention;

  /// Label of the FindingSignificance value `urgent` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Urgent'**
  String get enumFindingSignificanceUrgent;

  /// Label of the LabFlag value `low` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get enumLabFlagLow;

  /// Label of the LabFlag value `high` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get enumLabFlagHigh;

  /// Label of the LabFlag value `normal` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get enumLabFlagNormal;

  /// Label of the LabFlag value `critical` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get enumLabFlagCritical;

  /// Label of the LabFlag value `unknown` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get enumLabFlagUnknown;

  /// Label of the VoiceStatus value `queued` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Queued'**
  String get enumVoiceStatusQueued;

  /// Label of the VoiceStatus value `processing` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get enumVoiceStatusProcessing;

  /// Label of the VoiceStatus value `completed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get enumVoiceStatusCompleted;

  /// Label of the VoiceStatus value `failed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get enumVoiceStatusFailed;

  /// Label of the VoiceReviewStatus value `pendingReview` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Pending review'**
  String get enumVoiceReviewStatusPendingReview;

  /// Label of the VoiceReviewStatus value `confirmed` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get enumVoiceReviewStatusConfirmed;

  /// Label of the VoiceReviewStatus value `discarded` (status / option shown in lists and badges).
  ///
  /// In en, this message translates to:
  /// **'Discarded'**
  String get enumVoiceReviewStatusDiscarded;

  /// Sign-in error (no account enumeration).
  ///
  /// In en, this message translates to:
  /// **'Invalid email or password.'**
  String get coreInvalidCredentials;

  /// Error when Google sign-in is not configured in the app build.
  ///
  /// In en, this message translates to:
  /// **'Google sign-in is not available in this build.'**
  String get coreGoogleSignInUnavailable;

  /// Error: Google sign-in returned no ID token.
  ///
  /// In en, this message translates to:
  /// **'Google did not return a token.'**
  String get coreGoogleNoToken;

  /// Generic Google sign-in error.
  ///
  /// In en, this message translates to:
  /// **'Google sign-in failed.'**
  String get coreGoogleSignInFailed;

  /// Error: Sign in with Apple returned no identity token.
  ///
  /// In en, this message translates to:
  /// **'Apple did not return a token.'**
  String get coreAppleNoToken;

  /// Sign in with Apple error; {error} is the technical reason.
  ///
  /// In en, this message translates to:
  /// **'Sign in with Apple failed ({error}).'**
  String coreAppleSignInFailed(String error);

  /// Upload error: no file was picked.
  ///
  /// In en, this message translates to:
  /// **'No file selected.'**
  String get coreNoFileSelected;

  /// Document upload error. Keep the file format names as they are.
  ///
  /// In en, this message translates to:
  /// **'Unsupported file type. Use PDF, JPG, PNG, WEBP, HEIC or DICOM.'**
  String get coreUploadUnsupportedType;

  /// Document upload error: file over the size limit.
  ///
  /// In en, this message translates to:
  /// **'File is too large (max 20 MB).'**
  String get coreUploadTooLarge;

  /// Shown when the AI screening analysis times out on the device.
  ///
  /// In en, this message translates to:
  /// **'Analysis is taking longer than expected. We will notify you when it is ready.'**
  String get coreScreeningAnalysisSlow;

  /// Pay button label (no biometrics available).
  ///
  /// In en, this message translates to:
  /// **'Pay'**
  String get coreBiometricPay;

  /// Pay button label when Face ID is available. Keep "Face ID".
  ///
  /// In en, this message translates to:
  /// **'Pay with Face ID'**
  String get coreBiometricPayFaceId;

  /// Pay button label when fingerprint unlock is available.
  ///
  /// In en, this message translates to:
  /// **'Pay with fingerprint'**
  String get coreBiometricPayFingerprint;

  /// System biometric prompt reason before paying.
  ///
  /// In en, this message translates to:
  /// **'Confirm your payment'**
  String get coreBiometricConfirmReason;

  /// SOS: phone location service is off.
  ///
  /// In en, this message translates to:
  /// **'Location is switched off on your phone.'**
  String get coreLocationServiceOff;

  /// SOS: the patient did not grant location permission.
  ///
  /// In en, this message translates to:
  /// **'Location permission was not given.'**
  String get coreLocationDenied;

  /// SOS: location permission permanently denied.
  ///
  /// In en, this message translates to:
  /// **'Location is blocked for this app in your phone settings.'**
  String get coreLocationBlocked;

  /// SOS: no GPS fix within the time limit.
  ///
  /// In en, this message translates to:
  /// **'Your phone could not find your location in time.'**
  String get coreLocationUnavailable;

  /// Package inclusion bullet: number of hotel nights included.
  ///
  /// In en, this message translates to:
  /// **'{nights, plural, other{{nights} nights accommodation}}'**
  String corePackageNightsAccommodation(int nights);

  /// Package inclusion bullet.
  ///
  /// In en, this message translates to:
  /// **'Airport pickup'**
  String get corePackageAirportPickup;

  /// Package inclusion bullet: an interpreter is included.
  ///
  /// In en, this message translates to:
  /// **'Translator'**
  String get corePackageTranslator;

  /// Package inclusion bullet.
  ///
  /// In en, this message translates to:
  /// **'Meals'**
  String get corePackageMeals;

  /// Package inclusion bullet.
  ///
  /// In en, this message translates to:
  /// **'Local transport'**
  String get corePackageLocalTransport;

  /// Package inclusion bullet: number of follow-up video consultations.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} follow-up teleconsults}}'**
  String corePackageFollowupTeleconsults(int count);

  /// Savings vs. home-country cost on a specialty tile, single value.
  ///
  /// In en, this message translates to:
  /// **'Save {pct}%'**
  String coreSavePercent(int pct);

  /// Savings range vs. home-country cost on a specialty tile.
  ///
  /// In en, this message translates to:
  /// **'Save {min}-{max}%'**
  String coreSavePercentRange(int min, int max);

  /// Display name of a guest (not signed up) user.
  ///
  /// In en, this message translates to:
  /// **'Guest'**
  String get coreUserGuest;

  /// Fallback display name of a patient without a name or email.
  ///
  /// In en, this message translates to:
  /// **'Patient'**
  String get coreUserPatient;

  /// Badge: how well a hospital/doctor matches the patient.
  ///
  /// In en, this message translates to:
  /// **'{score}% Match'**
  String coreMatchScore(int score);

  /// Error view heading when there is no internet connection.
  ///
  /// In en, this message translates to:
  /// **'You are offline'**
  String get coreErrorOffline;

  /// Screen-reader label of a profile picture without a name.
  ///
  /// In en, this message translates to:
  /// **'Avatar'**
  String get coreAvatarLabel;

  /// Rating caption next to stars, e.g. (4.5/5).
  ///
  /// In en, this message translates to:
  /// **'({rating}/5)'**
  String coreRatingCaption(String rating);

  /// Rating caption with the number of reviews.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{({rating}/5 from {count} reviews)}}'**
  String coreRatingCaptionReviews(int count, String rating);

  /// Screen-reader label of a star rating.
  ///
  /// In en, this message translates to:
  /// **'Rated {rating} out of 5'**
  String coreRatingSemantics(String rating);

  /// Screen-reader label of a star rating with the number of reviews.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{Rated {rating} out of 5 from {count} reviews}}'**
  String coreRatingSemanticsReviews(int count, String rating);

  /// Progress label of a multi-step form.
  ///
  /// In en, this message translates to:
  /// **'Step {step} of {total}'**
  String coreStepProgress(int step, int total);

  /// Progress label with an extra note, e.g. "Step 4 of 4 · Optional".
  ///
  /// In en, this message translates to:
  /// **'Step {step} of {total} · {suffix}'**
  String coreStepProgressWithSuffix(int step, int total, String suffix);

  /// Bottom navigation tab. Keep short.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// Bottom navigation tab. Keep short.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get navSearch;

  /// Bottom navigation tab: the patient's treatment trips. Keep short.
  ///
  /// In en, this message translates to:
  /// **'Trips'**
  String get navTrips;

  /// Bottom navigation tab. Keep short.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get navMessages;

  /// Bottom navigation tab. Keep short.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// Unknown screen / link title.
  ///
  /// In en, this message translates to:
  /// **'Page not found'**
  String get routerNotFoundTitle;

  /// Unknown screen message; {location} is the link path.
  ///
  /// In en, this message translates to:
  /// **'We could not find \"{location}\".'**
  String routerNotFoundMessage(String location);

  /// Button: go to the home screen.
  ///
  /// In en, this message translates to:
  /// **'Go home'**
  String get routerGoHome;

  /// Home screen heading.
  ///
  /// In en, this message translates to:
  /// **'What brings you to India?'**
  String get homeTitle;

  /// Home screen subheading above the specialty grid.
  ///
  /// In en, this message translates to:
  /// **'Select your medical need'**
  String get homeSubtitle;

  /// Home search field hint.
  ///
  /// In en, this message translates to:
  /// **'Search for a condition'**
  String get homeSearchHint;

  /// Home: search button / tooltip.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get homeSearchButton;

  /// Title of the sheet listing every specialty.
  ///
  /// In en, this message translates to:
  /// **'All specialties'**
  String get homeAllSpecialties;

  /// Home empty state title.
  ///
  /// In en, this message translates to:
  /// **'No specialties yet'**
  String get homeNoSpecialtiesTitle;

  /// Home empty state message.
  ///
  /// In en, this message translates to:
  /// **'Search hospitals and doctors instead.'**
  String get homeNoSpecialtiesMessage;

  /// Specialty grid tile that opens the full list. Keep short.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get homeMoreTile;

  /// Subtitle of the "More" specialty tile.
  ///
  /// In en, this message translates to:
  /// **'Other Specialties'**
  String get homeMoreTileSubtitle;

  /// Small label on the upcoming-trip banner.
  ///
  /// In en, this message translates to:
  /// **'Your upcoming trip'**
  String get homeTripEyebrow;

  /// Upcoming-trip banner title when no procedure/hospital is known.
  ///
  /// In en, this message translates to:
  /// **'Treatment in India'**
  String get homeTripFallbackTitle;

  /// Upcoming-trip banner: admission date not set yet.
  ///
  /// In en, this message translates to:
  /// **'Date to be confirmed'**
  String get homeTripDateTbc;

  /// Upcoming-trip banner: admission is today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get homeTripToday;

  /// Upcoming-trip banner: admission is tomorrow.
  ///
  /// In en, this message translates to:
  /// **'Tomorrow'**
  String get homeTripTomorrow;

  /// Upcoming-trip banner: the treatment trip has started.
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get homeTripInProgress;

  /// Upcoming-trip banner: days until admission (2 or more).
  ///
  /// In en, this message translates to:
  /// **'{days, plural, other{In {days} days}}'**
  String homeTripInDays(int days);

  /// Upcoming-trip banner: hospital admission date (already formatted).
  ///
  /// In en, this message translates to:
  /// **'Admission {date}'**
  String homeTripAdmission(String date);

  /// Small label on the screening banner (AI-assisted questionnaire).
  ///
  /// In en, this message translates to:
  /// **'AI screening'**
  String get homeScreeningEyebrow;

  /// Screening banner: hospital/doctor matches are ready.
  ///
  /// In en, this message translates to:
  /// **'Your matches are ready'**
  String get homeMatchesReadyTitle;

  /// Screening banner subtitle (no specialty known).
  ///
  /// In en, this message translates to:
  /// **'See hospitals and doctors matched to you'**
  String get homeMatchesReadySubtitle;

  /// Screening banner subtitle with the specialty name.
  ///
  /// In en, this message translates to:
  /// **'{specialty} · see your matched doctors'**
  String homeMatchesReadySubtitleSpecialty(String specialty);

  /// Screening banner: analysis running.
  ///
  /// In en, this message translates to:
  /// **'Finding your best matches'**
  String get homeScreeningProcessingTitle;

  /// Screening banner subtitle: analysis running.
  ///
  /// In en, this message translates to:
  /// **'We are analysing your answers'**
  String get homeScreeningProcessingSubtitle;

  /// Screening banner: resume a draft questionnaire.
  ///
  /// In en, this message translates to:
  /// **'Continue your screening'**
  String get homeScreeningContinueTitle;

  /// Screening banner subtitle: resume a draft.
  ///
  /// In en, this message translates to:
  /// **'Pick up where you left off'**
  String get homeScreeningContinueSubtitle;

  /// Screening banner subtitle with the specialty name.
  ///
  /// In en, this message translates to:
  /// **'{specialty} · pick up where you left off'**
  String homeScreeningContinueSubtitleSpecialty(String specialty);

  /// Small chip on the first onboarding page.
  ///
  /// In en, this message translates to:
  /// **'Welcome'**
  String get onboardingWelcomeChip;

  /// Onboarding headline statistic (number of patients). Format the number for your language.
  ///
  /// In en, this message translates to:
  /// **'500,000+'**
  String get onboardingImpactStat;

  /// Caption under the statistic.
  ///
  /// In en, this message translates to:
  /// **'Patients Treated'**
  String get onboardingImpactStatCaption;

  /// Qualifier under the statistic caption.
  ///
  /// In en, this message translates to:
  /// **'across our partner hospitals'**
  String get onboardingImpactStatFootnote;

  /// Main onboarding promise (marketing claim).
  ///
  /// In en, this message translates to:
  /// **'World-Class Healthcare at 70% Less Cost'**
  String get onboardingImpactHeadline;

  /// Screen-reader text of the JCI chip. Keep "Joint Commission International".
  ///
  /// In en, this message translates to:
  /// **'Joint Commission International accredited partner hospitals'**
  String get onboardingBadgeJciDescription;

  /// Screen-reader text of the NABH chip. Keep "NABH".
  ///
  /// In en, this message translates to:
  /// **'NABH accredited partner hospitals'**
  String get onboardingBadgeNabhDescription;

  /// Screen-reader text of the WHO chip.
  ///
  /// In en, this message translates to:
  /// **'Care that follows WHO patient-safety guidelines'**
  String get onboardingBadgeWhoDescription;

  /// Caption under the accreditation chips.
  ///
  /// In en, this message translates to:
  /// **'Accreditations held by our partner hospitals'**
  String get onboardingAccreditationsCaption;

  /// Screen-reader label of the onboarding next arrow.
  ///
  /// In en, this message translates to:
  /// **'Next page'**
  String get onboardingNextPage;

  /// Onboarding page 2 title.
  ///
  /// In en, this message translates to:
  /// **'Care you can trust'**
  String get onboardingTrustTitle;

  /// Onboarding trust point title.
  ///
  /// In en, this message translates to:
  /// **'English-Speaking Doctors'**
  String get onboardingTrustDoctorsTitle;

  /// Onboarding trust point subtitle.
  ///
  /// In en, this message translates to:
  /// **'Communicate with ease.'**
  String get onboardingTrustDoctorsSubtitle;

  /// Onboarding trust point title (marketing claim).
  ///
  /// In en, this message translates to:
  /// **'Zero Wait Time'**
  String get onboardingTrustWaitTitle;

  /// Onboarding trust point subtitle.
  ///
  /// In en, this message translates to:
  /// **'Get prompt medical attention.'**
  String get onboardingTrustWaitSubtitle;

  /// Onboarding trust point title. Keep "Joint Commission".
  ///
  /// In en, this message translates to:
  /// **'Joint Commission Certified'**
  String get onboardingTrustCertifiedTitle;

  /// Onboarding trust point subtitle.
  ///
  /// In en, this message translates to:
  /// **'Internationally accredited partner facilities.'**
  String get onboardingTrustCertifiedSubtitle;

  /// Illustrative patient testimonial (quoted). Keep the amount in US dollars.
  ///
  /// In en, this message translates to:
  /// **'\"Saved \$45,000 on my cardiac surgery with better care than home.\"'**
  String get onboardingTestimonialQuote;

  /// Author line of the testimonial.
  ///
  /// In en, this message translates to:
  /// **'Patient from the USA'**
  String get onboardingTestimonialAuthor;

  /// Badge: the testimonial is an example, not a verified review.
  ///
  /// In en, this message translates to:
  /// **'Illustrative example'**
  String get onboardingTestimonialDisclaimer;

  /// Onboarding process step 1 title.
  ///
  /// In en, this message translates to:
  /// **'Share Condition'**
  String get onboardingStepShareTitle;

  /// Onboarding process step 1 subtitle.
  ///
  /// In en, this message translates to:
  /// **'Securely provide your medical information.'**
  String get onboardingStepShareSubtitle;

  /// Onboarding process step 2 title.
  ///
  /// In en, this message translates to:
  /// **'Get Matched'**
  String get onboardingStepMatchTitle;

  /// Onboarding process step 2 subtitle.
  ///
  /// In en, this message translates to:
  /// **'Our AI finds the best hospitals for you.'**
  String get onboardingStepMatchSubtitle;

  /// Onboarding process step 3 title.
  ///
  /// In en, this message translates to:
  /// **'Compare Costs'**
  String get onboardingStepCompareTitle;

  /// Onboarding process step 3 subtitle.
  ///
  /// In en, this message translates to:
  /// **'Transparent pricing to make informed decisions.'**
  String get onboardingStepCompareSubtitle;

  /// Onboarding process step 4 title.
  ///
  /// In en, this message translates to:
  /// **'Book Treatment'**
  String get onboardingStepBookTitle;

  /// Onboarding process step 4 subtitle.
  ///
  /// In en, this message translates to:
  /// **'Schedule your appointment hassle-free.'**
  String get onboardingStepBookSubtitle;

  /// Security badge on the last onboarding page.
  ///
  /// In en, this message translates to:
  /// **'Encrypted & Secure'**
  String get onboardingSecurityBadge;

  /// Privacy promise on the last onboarding page.
  ///
  /// In en, this message translates to:
  /// **'Your medical data is encrypted and shared only with hospitals you choose'**
  String get onboardingSecurityFooter;

  /// Onboarding button: go to sign up / sign in.
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get onboardingGetStarted;

  /// Onboarding button: browse without an account.
  ///
  /// In en, this message translates to:
  /// **'Explore as Guest'**
  String get onboardingExploreAsGuest;

  /// Screen-reader label of the onboarding page indicator.
  ///
  /// In en, this message translates to:
  /// **'Page {page} of {count}'**
  String onboardingPageDots(int page, int count);

  /// Messages screen title.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get messagesTitle;

  /// Button: start a chat with the support team.
  ///
  /// In en, this message translates to:
  /// **'Contact support'**
  String get messagesContactSupport;

  /// Messages empty state title.
  ///
  /// In en, this message translates to:
  /// **'No conversations yet'**
  String get messagesEmptyTitle;

  /// Messages empty state explanation.
  ///
  /// In en, this message translates to:
  /// **'When you request a quote, a chat with the hospital and your coordinator opens here. You can also contact our support team any time.'**
  String get messagesEmptyMessage;

  /// Conversation preview when it has no messages.
  ///
  /// In en, this message translates to:
  /// **'No messages yet'**
  String get messagesNoMessagesYet;

  /// Conversation preview when the last message is only a file.
  ///
  /// In en, this message translates to:
  /// **'Attachment'**
  String get messagesAttachment;

  /// Conversation preview of a message the user sent.
  ///
  /// In en, this message translates to:
  /// **'You: {message}'**
  String messagesPreviewMine(String message);

  /// Conversation preview in a group chat: sender first name and message.
  ///
  /// In en, this message translates to:
  /// **'{sender}: {message}'**
  String messagesPreviewSender(String sender, String message);

  /// Notifications screen title and bell tooltip.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// App bar button: mark every notification as read. Keep short.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get notificationsMarkAllRead;

  /// Notifications empty state title.
  ///
  /// In en, this message translates to:
  /// **'You are all caught up'**
  String get notificationsEmptyTitle;

  /// Notifications empty state message.
  ///
  /// In en, this message translates to:
  /// **'Quotes, booking updates, reminders and messages will show up here.'**
  String get notificationsEmptyMessage;

  /// Bell tooltip with the unread count (1 or more).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{Notifications, {count} unread}}'**
  String notificationsBellUnread(int count);

  /// Snack after long-pressing the support map.
  ///
  /// In en, this message translates to:
  /// **'Location marked. It is shared only if you send an SOS.'**
  String get supportLocationMarked;

  /// Support screen section title.
  ///
  /// In en, this message translates to:
  /// **'Real-time Notifications'**
  String get supportRealtimeNotifications;

  /// Support screen: no notifications yet.
  ///
  /// In en, this message translates to:
  /// **'Appointment reminders and updates appear here as they happen.'**
  String get supportNotificationsEmpty;

  /// Floating button: call the 24/7 support phone line.
  ///
  /// In en, this message translates to:
  /// **'Call 24/7 Helpline'**
  String get supportCallHelpline;

  /// Floating button: request an interpreter.
  ///
  /// In en, this message translates to:
  /// **'Get Translator'**
  String get supportGetTranslator;

  /// Floating button: request a local guide.
  ///
  /// In en, this message translates to:
  /// **'Local Guide'**
  String get supportLocalGuide;

  /// Snack: services need a booked treatment.
  ///
  /// In en, this message translates to:
  /// **'Book your treatment first, or ask our support team in Messages.'**
  String get supportBookFirst;

  /// Snack after requesting an interpreter.
  ///
  /// In en, this message translates to:
  /// **'Translator requested. Your coordinator will confirm shortly.'**
  String get supportTranslatorRequested;

  /// Snack after requesting a local guide.
  ///
  /// In en, this message translates to:
  /// **'Local guide requested. Your coordinator will confirm shortly.'**
  String get supportGuideRequested;

  /// Title of the itinerary sheet.
  ///
  /// In en, this message translates to:
  /// **'Your schedule'**
  String get supportScheduleTitle;

  /// Itinerary sheet empty state.
  ///
  /// In en, this message translates to:
  /// **'Your hospital will add appointments here.'**
  String get supportScheduleEmpty;

  /// Itinerary item time: weekday and time range (both already formatted).
  ///
  /// In en, this message translates to:
  /// **'{weekday}, {time}'**
  String supportScheduleWhen(String weekday, String time);

  /// Schedule card label: today.
  ///
  /// In en, this message translates to:
  /// **'Today\'s Schedule'**
  String get supportTodaysSchedule;

  /// Schedule card label: next item on a later day.
  ///
  /// In en, this message translates to:
  /// **'Next on your schedule'**
  String get supportNextOnSchedule;

  /// Schedule card when there is nothing today.
  ///
  /// In en, this message translates to:
  /// **'Nothing scheduled today'**
  String get supportNothingToday;

  /// Support screen section: tips about Indian culture.
  ///
  /// In en, this message translates to:
  /// **'Cultural Tips'**
  String get cultureTipsTitle;

  /// Cultural tips empty state.
  ///
  /// In en, this message translates to:
  /// **'Tips will appear here soon.'**
  String get cultureTipsEmpty;

  /// Screen-reader label of the red SOS button. Keep "SOS".
  ///
  /// In en, this message translates to:
  /// **'SOS emergency alert'**
  String get sosButtonSemantics;

  /// SOS confirmation dialog title.
  ///
  /// In en, this message translates to:
  /// **'Send an emergency alert?'**
  String get sosConfirmTitle;

  /// SOS confirmation dialog text.
  ///
  /// In en, this message translates to:
  /// **'Your coordinator and our 24/7 support team are alerted immediately.'**
  String get sosConfirmBody;

  /// SOS dialog: optional free-text field label.
  ///
  /// In en, this message translates to:
  /// **'What is happening? (optional)'**
  String get sosMessageLabel;

  /// SOS dialog checkbox.
  ///
  /// In en, this message translates to:
  /// **'Share my current location with the support team'**
  String get sosShareLocationTitle;

  /// SOS dialog: how the location is used (a place was marked on the map).
  ///
  /// In en, this message translates to:
  /// **'Used only for this alert. If your phone cannot find you, the place you marked on the map is shared instead.'**
  String get sosShareLocationMarkedHint;

  /// SOS dialog: how the location is used (no place marked).
  ///
  /// In en, this message translates to:
  /// **'Used only for this alert, so we can find you faster. Your phone may ask for permission.'**
  String get sosShareLocationHint;

  /// SOS dialog confirm button. Keep "SOS".
  ///
  /// In en, this message translates to:
  /// **'Send SOS'**
  String get sosSendButton;

  /// SOS progress: reading GPS.
  ///
  /// In en, this message translates to:
  /// **'Getting your location…'**
  String get sosGettingLocation;

  /// SOS progress: sending the alert.
  ///
  /// In en, this message translates to:
  /// **'Sending your alert…'**
  String get sosSendingAlert;

  /// SOS result: GPS location was sent.
  ///
  /// In en, this message translates to:
  /// **'Your current location was shared with the team.'**
  String get sosLocationShared;

  /// SOS result: GPS failed ({reason} is the failure sentence) and the marked map place was sent.
  ///
  /// In en, this message translates to:
  /// **'{reason} The place you marked on the map was shared instead.'**
  String sosLocationFallbackMarked(String reason);

  /// SOS result: GPS failed ({reason} is the failure sentence) and no location was sent.
  ///
  /// In en, this message translates to:
  /// **'{reason} Tell the team where you are when they call.'**
  String sosLocationFallbackNone(String reason);

  /// SOS result title: alert sent to the coordinator and support team.
  ///
  /// In en, this message translates to:
  /// **'Help is on the way'**
  String get sosResultSentTitle;

  /// SOS result text: alert sent.
  ///
  /// In en, this message translates to:
  /// **'Your coordinator and our 24/7 support team have been alerted and will call you shortly.'**
  String get sosResultSentBody;

  /// SOS result: advice to call local emergency services.
  ///
  /// In en, this message translates to:
  /// **'If your life is in danger, call emergency services now.'**
  String get sosResultDangerNote;

  /// SOS result title: sending failed.
  ///
  /// In en, this message translates to:
  /// **'Alert could not be sent'**
  String get sosResultFailedTitle;

  /// SOS result text: sending failed, call by phone.
  ///
  /// In en, this message translates to:
  /// **'Please call for help directly.'**
  String get sosResultFailedBody;

  /// SOS result button: call the 24/7 helpline.
  ///
  /// In en, this message translates to:
  /// **'Call helpline'**
  String get sosCallHelpline;

  /// SOS result button: call the local emergency number, e.g. "Call 112".
  ///
  /// In en, this message translates to:
  /// **'Call {number}'**
  String sosCallNumber(String number);

  /// Support map hint snack.
  ///
  /// In en, this message translates to:
  /// **'Long-press the map to mark where you are.'**
  String get mapLongPressHint;

  /// Map data credit. Keep "OpenStreetMap".
  ///
  /// In en, this message translates to:
  /// **'OpenStreetMap contributors'**
  String get mapAttribution;

  /// Map button tooltip.
  ///
  /// In en, this message translates to:
  /// **'Zoom in'**
  String get mapZoomIn;

  /// Map button tooltip.
  ///
  /// In en, this message translates to:
  /// **'Zoom out'**
  String get mapZoomOut;

  /// Map button tooltip: fit hospital, stay and my location.
  ///
  /// In en, this message translates to:
  /// **'Show my places'**
  String get mapShowMyPlaces;

  /// App bar title of the screening start screen.
  ///
  /// In en, this message translates to:
  /// **'AI Screening'**
  String get screeningAppBarTitle;

  /// Error title when a new screening cannot be created.
  ///
  /// In en, this message translates to:
  /// **'Could not start your screening'**
  String get screeningStartErrorTitle;

  /// Loading message while a new screening is created.
  ///
  /// In en, this message translates to:
  /// **'Preparing your questionnaire...'**
  String get screeningStartPreparing;

  /// Heading of the specialty picker that starts a screening.
  ///
  /// In en, this message translates to:
  /// **'What brings you to India?'**
  String get screeningStartHeading;

  /// Subtitle of the specialty picker.
  ///
  /// In en, this message translates to:
  /// **'Pick the area of care. Four short steps help us match you with the right doctors.'**
  String get screeningStartSubtitle;

  /// Card title: patient does not know which specialty to pick.
  ///
  /// In en, this message translates to:
  /// **'Not sure?'**
  String get screeningStartNotSure;

  /// Card text under 'Not sure?'.
  ///
  /// In en, this message translates to:
  /// **'Describe your symptoms and we will suggest a specialty.'**
  String get screeningStartNotSureBody;

  /// Card to resume the last unfinished screening.
  ///
  /// In en, this message translates to:
  /// **'Continue your screening'**
  String get screeningResumeTitle;

  /// Shown instead of a specialty name when the screening has none.
  ///
  /// In en, this message translates to:
  /// **'General'**
  String get screeningResumeGeneral;

  /// Loading message of a questionnaire step.
  ///
  /// In en, this message translates to:
  /// **'Loading your answers...'**
  String get screeningLoadingAnswers;

  /// App bar title when the screening can no longer be edited.
  ///
  /// In en, this message translates to:
  /// **'Screening'**
  String get screeningAlreadySubmittedAppBar;

  /// Title: the screening is completed.
  ///
  /// In en, this message translates to:
  /// **'Your results are ready'**
  String get screeningResultsReadyTitle;

  /// Title: the screening is being processed.
  ///
  /// In en, this message translates to:
  /// **'This screening was already submitted'**
  String get screeningAlreadySubmittedTitle;

  /// Message: completed screenings cannot be edited.
  ///
  /// In en, this message translates to:
  /// **'Answers can no longer be changed. Start a new screening to answer again.'**
  String get screeningResultsReadyMessage;

  /// Message: the screening is being processed.
  ///
  /// In en, this message translates to:
  /// **'We are analysing your answers.'**
  String get screeningAnalysingMessage;

  /// Button: open the matched hospitals / doctors.
  ///
  /// In en, this message translates to:
  /// **'View my matches'**
  String get screeningViewMatches;

  /// Button: open the processing screen.
  ///
  /// In en, this message translates to:
  /// **'See progress'**
  String get screeningSeeProgress;

  /// Button: start a new screening questionnaire.
  ///
  /// In en, this message translates to:
  /// **'Start a new screening'**
  String get screeningStartNewButton;

  /// Processing checklist step 1.
  ///
  /// In en, this message translates to:
  /// **'Analyzing your condition'**
  String get screeningProcessingStepAnalyzing;

  /// Processing checklist step 2.
  ///
  /// In en, this message translates to:
  /// **'Matching with specialists'**
  String get screeningProcessingStepMatching;

  /// Processing checklist step 3.
  ///
  /// In en, this message translates to:
  /// **'Calculating savings'**
  String get screeningProcessingStepSavings;

  /// Screen-reader label of a processing checklist row: step name and its state.
  ///
  /// In en, this message translates to:
  /// **'{label}, {state, select, done{done} active{in progress} other{pending}}'**
  String screeningChecklistRowSemantics(String label, String state);

  /// Tooltip and dialog title explaining the processing screen.
  ///
  /// In en, this message translates to:
  /// **'What is happening?'**
  String get screeningProcessingHelpTitle;

  /// Help dialog on the processing screen. AI / not-a-diagnosis disclaimer: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'We review your answers (with AI if you agreed), suggest the right specialty and match you with accredited Indian hospitals and doctors by expertise, language, budget and availability. This usually takes under a minute. It is not a diagnosis.'**
  String get screeningProcessingHelpBody;

  /// Processing headline when matching is done.
  ///
  /// In en, this message translates to:
  /// **'Your matches are ready!'**
  String get screeningProcessingReady;

  /// Processing headline while matching runs.
  ///
  /// In en, this message translates to:
  /// **'Finding Your Perfect Match...'**
  String get screeningProcessingFinding;

  /// Tip under the processing checklist.
  ///
  /// In en, this message translates to:
  /// **'Tip: you can compare up to 3 matches side by side and see the full cost breakdown.'**
  String get screeningProcessingTip;

  /// Title: AI / matching failed.
  ///
  /// In en, this message translates to:
  /// **'We could not complete the analysis'**
  String get screeningProcessingFailedTitle;

  /// Fallback message when the analysis failed.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong while analysing your answers.'**
  String get screeningProcessingFailedMessage;

  /// Title: processing timed out.
  ///
  /// In en, this message translates to:
  /// **'This is taking longer than usual'**
  String get screeningProcessingTimeoutTitle;

  /// Message: processing timed out.
  ///
  /// In en, this message translates to:
  /// **'We will notify you as soon as your matches are ready. You can keep waiting or come back later.'**
  String get screeningProcessingTimeoutMessage;

  /// Button: keep polling for results.
  ///
  /// In en, this message translates to:
  /// **'Keep waiting'**
  String get screeningProcessingKeepWaiting;

  /// Button: go to the home screen.
  ///
  /// In en, this message translates to:
  /// **'Go to Home'**
  String get screeningGoHome;

  /// Title: the screening is still a draft.
  ///
  /// In en, this message translates to:
  /// **'This screening has not been submitted'**
  String get screeningNotSubmittedTitle;

  /// Message: the screening is still a draft.
  ///
  /// In en, this message translates to:
  /// **'Finish the questionnaire to get your matches.'**
  String get screeningNotSubmittedMessage;

  /// Button: back to the last questionnaire step.
  ///
  /// In en, this message translates to:
  /// **'Continue questionnaire'**
  String get screeningContinueQuestionnaire;

  /// Title: the processing status could not be loaded.
  ///
  /// In en, this message translates to:
  /// **'We lost track of your screening'**
  String get screeningProcessingLostTitle;

  /// Button: previous questionnaire step.
  ///
  /// In en, this message translates to:
  /// **'Previous'**
  String get screeningPrevious;

  /// Tooltip of the (?) help button.
  ///
  /// In en, this message translates to:
  /// **'Help'**
  String get screeningHelpTooltip;

  /// Title of a questionnaire step's help dialog.
  ///
  /// In en, this message translates to:
  /// **'How this works'**
  String get screeningHelpDialogTitle;

  /// Button closing a help dialog.
  ///
  /// In en, this message translates to:
  /// **'Got it'**
  String get screeningHelpGotIt;

  /// Header button: save answers and leave the questionnaire.
  ///
  /// In en, this message translates to:
  /// **'Save & Exit'**
  String get screeningSaveExit;

  /// Snack bar after 'Save & Exit'.
  ///
  /// In en, this message translates to:
  /// **'Progress saved. Continue any time from Home.'**
  String get screeningProgressSaved;

  /// Validation: step 1 needs a body area.
  ///
  /// In en, this message translates to:
  /// **'Tap the body to select at least one area.'**
  String get screeningValidateBodyArea;

  /// Validation: step 2 needs a positive symptom.
  ///
  /// In en, this message translates to:
  /// **'Answer \"yes\" or \"maybe\" to at least one symptom, or add your own.'**
  String get screeningValidateSymptoms;

  /// Validation: step 3 needs a duration.
  ///
  /// In en, this message translates to:
  /// **'Tell us how long you have had this condition.'**
  String get screeningValidateDuration;

  /// Validation: budget range.
  ///
  /// In en, this message translates to:
  /// **'The minimum budget must not exceed the maximum.'**
  String get screeningValidateBudget;

  /// Validation: travel dates.
  ///
  /// In en, this message translates to:
  /// **'The travel window must end after it starts.'**
  String get screeningValidateTravelWindow;

  /// Title of questionnaire step 1 (body map).
  ///
  /// In en, this message translates to:
  /// **'Where are you experiencing issues?'**
  String get screeningStep1Title;

  /// Subtitle of step 1.
  ///
  /// In en, this message translates to:
  /// **'Tap on the body to select the area.'**
  String get screeningStep1Subtitle;

  /// Subtitle of step 1 with the chosen specialty name.
  ///
  /// In en, this message translates to:
  /// **'Tap on the body to select the area · {specialty}'**
  String screeningStep1SubtitleWithSpecialty(String specialty);

  /// Placeholder under the body map.
  ///
  /// In en, this message translates to:
  /// **'No area selected yet'**
  String get screeningNoAreaSelected;

  /// Title of questionnaire step 2 (symptoms).
  ///
  /// In en, this message translates to:
  /// **'Which symptoms are you experiencing?'**
  String get screeningStep2Title;

  /// Help text of step 2. In right-to-left languages the swipe directions are mirrored: swipe LEFT for yes, RIGHT for no.
  ///
  /// In en, this message translates to:
  /// **'Swipe a card right (or tap the check) if you have the symptom, left (or X) if you do not, and up (or -) if you are not sure. Add anything we did not ask about below.'**
  String get screeningStep2Help;

  /// Loading message of the symptom cards.
  ///
  /// In en, this message translates to:
  /// **'Loading suggestions...'**
  String get screeningSymptomsLoading;

  /// Symptom suggestions failed to load.
  ///
  /// In en, this message translates to:
  /// **'Suggestions are unavailable. Add your symptoms below.'**
  String get screeningSymptomsUnavailable;

  /// Section title: symptoms answered yes / maybe.
  ///
  /// In en, this message translates to:
  /// **'Your Symptoms'**
  String get screeningYourSymptoms;

  /// Empty state of 'Your Symptoms'.
  ///
  /// In en, this message translates to:
  /// **'Symptoms you answer \"yes\" or \"maybe\" to appear here.'**
  String get screeningYourSymptomsEmpty;

  /// Chip of a symptom answered 'maybe'.
  ///
  /// In en, this message translates to:
  /// **'{name} (maybe)'**
  String screeningSymptomMaybeChip(String name);

  /// Hint of the free-text symptom field.
  ///
  /// In en, this message translates to:
  /// **'Add another symptom'**
  String get screeningAddAnotherSymptom;

  /// Validation of a custom symptom's length.
  ///
  /// In en, this message translates to:
  /// **'Keep the symptom under {max} characters.'**
  String screeningSymptomTooLong(int max);

  /// Validation: too many symptoms.
  ///
  /// In en, this message translates to:
  /// **'You can add up to {max} symptoms.'**
  String screeningSymptomLimit(int max);

  /// Title of questionnaire step 3 (timeline).
  ///
  /// In en, this message translates to:
  /// **'How long have you had this condition?'**
  String get screeningStep3Title;

  /// Tooltip: decrease the duration value.
  ///
  /// In en, this message translates to:
  /// **'Decrease'**
  String get screeningDecrease;

  /// Tooltip: increase the duration value.
  ///
  /// In en, this message translates to:
  /// **'Increase'**
  String get screeningIncrease;

  /// Section title in step 3.
  ///
  /// In en, this message translates to:
  /// **'Severity'**
  String get screeningSeverity;

  /// Subtitle: how the condition affects daily life.
  ///
  /// In en, this message translates to:
  /// **'Daily Impact'**
  String get screeningDailyImpact;

  /// Daily-impact dimension: work.
  ///
  /// In en, this message translates to:
  /// **'Work'**
  String get screeningImpactWork;

  /// Daily-impact dimension: sleep.
  ///
  /// In en, this message translates to:
  /// **'Sleep'**
  String get screeningImpactSleep;

  /// Daily-impact dimension: mobility.
  ///
  /// In en, this message translates to:
  /// **'Mobility'**
  String get screeningImpactMobility;

  /// Question under 'Work'.
  ///
  /// In en, this message translates to:
  /// **'How much does it affect your work?'**
  String get screeningImpactWorkQuestion;

  /// Question under 'Sleep'.
  ///
  /// In en, this message translates to:
  /// **'How much does it affect your sleep?'**
  String get screeningImpactSleepQuestion;

  /// Question under 'Mobility'.
  ///
  /// In en, this message translates to:
  /// **'How much does it affect mobility?'**
  String get screeningImpactMobilityQuestion;

  /// Screen-reader label of a severity button, e.g. 'Work Mild'.
  ///
  /// In en, this message translates to:
  /// **'{dimension} {level}'**
  String screeningSeverityPillSemantics(String dimension, String level);

  /// Section title in step 3.
  ///
  /// In en, this message translates to:
  /// **'Previous Treatments'**
  String get screeningPreviousTreatments;

  /// Section title in step 3 (followed by '(Optional)').
  ///
  /// In en, this message translates to:
  /// **'Previous Reports'**
  String get screeningPreviousReports;

  /// Marker after a section title.
  ///
  /// In en, this message translates to:
  /// **'(Optional)'**
  String get screeningOptionalParen;

  /// Upload box title.
  ///
  /// In en, this message translates to:
  /// **'Scan or upload medical reports'**
  String get screeningScanUpload;

  /// Upload box hint.
  ///
  /// In en, this message translates to:
  /// **'Photograph paper pages or pick a PDF · our AI reads it and you confirm the details'**
  String get screeningScanUploadHint;

  /// Button: plain file upload without AI reading.
  ///
  /// In en, this message translates to:
  /// **'Attach a file without AI (e.g. DICOM)'**
  String get screeningAttachWithoutAi;

  /// Label of the free-text notes field.
  ///
  /// In en, this message translates to:
  /// **'Anything else we should know? (optional)'**
  String get screeningNotesLabel;

  /// Tooltip: remove an attached report.
  ///
  /// In en, this message translates to:
  /// **'Remove {name}'**
  String screeningRemoveReportTooltip(String name);

  /// Snack bar: report attachment limit reached.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{You can attach up to {count} report.} other{You can attach up to {count} reports.}}'**
  String screeningAttachLimit(int count);

  /// Snack bar: some scanned pages were not attached.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{Only {count} report page can be attached to a screening.} other{Only {count} report pages can be attached to a screening.}}'**
  String screeningAttachPagesLimit(int count);

  /// Default name of an attached report.
  ///
  /// In en, this message translates to:
  /// **'Medical report'**
  String get screeningReportDefaultLabel;

  /// Name of the n-th attached report when the file name is unknown.
  ///
  /// In en, this message translates to:
  /// **'Medical report {index}'**
  String screeningReportNumbered(int index);

  /// Name of one page of a scanned report ('p.' = page).
  ///
  /// In en, this message translates to:
  /// **'{label} p.{page}'**
  String screeningReportPage(String label, int page);

  /// Report status: the patient confirmed what the AI read.
  ///
  /// In en, this message translates to:
  /// **'AI reading confirmed'**
  String get screeningReportAiConfirmed;

  /// Report status: what the AI read still needs review.
  ///
  /// In en, this message translates to:
  /// **'AI reading to review'**
  String get screeningReportAiToReview;

  /// Title of questionnaire step 4 (preferences).
  ///
  /// In en, this message translates to:
  /// **'Personalize Your Matches'**
  String get screeningStep4Title;

  /// Button: submit the questionnaire.
  ///
  /// In en, this message translates to:
  /// **'Find My Doctors'**
  String get screeningFindDoctors;

  /// Button: submit without preferences.
  ///
  /// In en, this message translates to:
  /// **'Skip & Use Defaults'**
  String get screeningSkipDefaults;

  /// Doctor language option.
  ///
  /// In en, this message translates to:
  /// **'Hindi'**
  String get screeningLangHindi;

  /// Doctor language option.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get screeningLangEnglish;

  /// Doctor language option.
  ///
  /// In en, this message translates to:
  /// **'Arabic'**
  String get screeningLangArabic;

  /// Doctor language option.
  ///
  /// In en, this message translates to:
  /// **'Spanish'**
  String get screeningLangSpanish;

  /// Doctor language option.
  ///
  /// In en, this message translates to:
  /// **'French'**
  String get screeningLangFrench;

  /// Doctor language option.
  ///
  /// In en, this message translates to:
  /// **'Russian'**
  String get screeningLangRussian;

  /// Preference section title.
  ///
  /// In en, this message translates to:
  /// **'Doctor Gender'**
  String get screeningPrefDoctorGender;

  /// Preference section title.
  ///
  /// In en, this message translates to:
  /// **'Budget Range'**
  String get screeningPrefBudgetRange;

  /// Label between the budget slider ends.
  ///
  /// In en, this message translates to:
  /// **'Your budget'**
  String get screeningPrefYourBudget;

  /// Label when no budget is set.
  ///
  /// In en, this message translates to:
  /// **'Any budget'**
  String get screeningPrefAnyBudget;

  /// Button: remove the budget.
  ///
  /// In en, this message translates to:
  /// **'Clear budget'**
  String get screeningPrefClearBudget;

  /// Preference section title (travel dates).
  ///
  /// In en, this message translates to:
  /// **'Travel Window'**
  String get screeningPrefTravelWindow;

  /// Travel window with only a start date.
  ///
  /// In en, this message translates to:
  /// **'From {date} - pick an end date'**
  String screeningPrefTravelFrom(String date);

  /// Selected travel window (dates).
  ///
  /// In en, this message translates to:
  /// **'{start} - {end}'**
  String screeningPrefTravelRange(String start, String end);

  /// Switch title: use AI matching.
  ///
  /// In en, this message translates to:
  /// **'Use AI Recommendations'**
  String get screeningPrefUseAi;

  /// Switch subtitle when AI is on.
  ///
  /// In en, this message translates to:
  /// **'Requires your consent before analysis'**
  String get screeningPrefUseAiOn;

  /// Switch subtitle when AI is off.
  ///
  /// In en, this message translates to:
  /// **'Standard rules-based matching'**
  String get screeningPrefUseAiOff;

  /// AI consent sheet title. Consent wording: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'Use AI recommendations?'**
  String get consentAiTitle;

  /// AI consent: what data is sent and why. Legal wording: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'Your answers (and any reports you attached) are sent to our AI service to suggest relevant specialties, procedures and questions for your doctor.'**
  String get consentAiPointData;

  /// AI consent: not-a-diagnosis disclaimer. Medical / legal wording: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'This is not a diagnosis. A qualified doctor at the hospital reviews your case before any treatment.'**
  String get consentAiPointNotDiagnosis;

  /// AI consent: data use and withdrawal. Legal wording: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'Your data is used only for this screening and is never sold. You can withdraw consent in your profile.'**
  String get consentAiPointPrivacy;

  /// AI consent: the non-AI alternative.
  ///
  /// In en, this message translates to:
  /// **'Prefer not to? We will match you with our standard rules-based engine instead.'**
  String get consentAiPointAlternative;

  /// AI consent: agree button.
  ///
  /// In en, this message translates to:
  /// **'I agree, use AI'**
  String get consentAiAgree;

  /// AI consent: decline button (non-AI matching).
  ///
  /// In en, this message translates to:
  /// **'Use standard matching'**
  String get consentAiDecline;

  /// Body area.
  ///
  /// In en, this message translates to:
  /// **'Head'**
  String get bodyMapHead;

  /// Body area.
  ///
  /// In en, this message translates to:
  /// **'Neck'**
  String get bodyMapNeck;

  /// Body area.
  ///
  /// In en, this message translates to:
  /// **'Chest'**
  String get bodyMapChest;

  /// Body area.
  ///
  /// In en, this message translates to:
  /// **'Abdomen'**
  String get bodyMapAbdomen;

  /// Body area.
  ///
  /// In en, this message translates to:
  /// **'Pelvis'**
  String get bodyMapPelvis;

  /// Body area: the back of the torso (not the 'go back' action).
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get bodyMapRegionBack;

  /// Body area (the patient's own left side).
  ///
  /// In en, this message translates to:
  /// **'Left arm'**
  String get bodyMapLeftArm;

  /// Body area (the patient's own right side).
  ///
  /// In en, this message translates to:
  /// **'Right arm'**
  String get bodyMapRightArm;

  /// Body area (the patient's own left side).
  ///
  /// In en, this message translates to:
  /// **'Left leg'**
  String get bodyMapLeftLeg;

  /// Body area (the patient's own right side).
  ///
  /// In en, this message translates to:
  /// **'Right leg'**
  String get bodyMapRightLeg;

  /// Body area.
  ///
  /// In en, this message translates to:
  /// **'Skin'**
  String get bodyMapSkin;

  /// Body area: the whole body or a general problem.
  ///
  /// In en, this message translates to:
  /// **'Whole body / general'**
  String get bodyMapGeneral;

  /// Body map toggle: front view.
  ///
  /// In en, this message translates to:
  /// **'Front'**
  String get bodyMapViewFront;

  /// Body map toggle: rear view.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get bodyMapViewBack;

  /// Title of the 0-10 pain slider.
  ///
  /// In en, this message translates to:
  /// **'Pain Intensity'**
  String get painIntensityTitle;

  /// Pain level 0.
  ///
  /// In en, this message translates to:
  /// **'No pain'**
  String get painNone;

  /// Pain level 1-3.
  ///
  /// In en, this message translates to:
  /// **'Mild'**
  String get painMild;

  /// Pain level 4-6.
  ///
  /// In en, this message translates to:
  /// **'Moderate'**
  String get painModerate;

  /// Pain level 7-8.
  ///
  /// In en, this message translates to:
  /// **'Severe'**
  String get painSevere;

  /// Pain level 9-10.
  ///
  /// In en, this message translates to:
  /// **'Worst possible'**
  String get painWorst;

  /// Pain value with its word, e.g. '5/10 · Moderate'.
  ///
  /// In en, this message translates to:
  /// **'{value}/10 · {label}'**
  String painValueLabel(int value, String label);

  /// Screen-reader value of the pain slider.
  ///
  /// In en, this message translates to:
  /// **'Pain {value} out of 10, {label}'**
  String painSemantics(int value, String label);

  /// Emergency guidance headline. Safety-critical: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'Emergency — seek local care now'**
  String get emergencyTitle;

  /// Emergency guidance text. Safety-critical: translate faithfully ('do not wait to travel' = do not wait for the trip to India to get care).
  ///
  /// In en, this message translates to:
  /// **'Some of your answers may indicate a medical emergency. Please do not wait to travel. Go to the nearest emergency department or call your local emergency number immediately.'**
  String get emergencyBody;

  /// Title of the red-flag list.
  ///
  /// In en, this message translates to:
  /// **'Warning signs we noticed'**
  String get emergencyWarningSigns;

  /// Disclaimer on the emergency screen. Translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'This screening is not a diagnosis.'**
  String get emergencyNotDiagnosis;

  /// Button calling the local emergency number.
  ///
  /// In en, this message translates to:
  /// **'Call emergency services ({number})'**
  String emergencyCallButton(String number);

  /// Snack bar when the phone dialer cannot be opened.
  ///
  /// In en, this message translates to:
  /// **'Dial {number} from your phone now.'**
  String emergencyDialNow(String number);

  /// Acknowledge the emergency guidance and see the results.
  ///
  /// In en, this message translates to:
  /// **'I understand - view my results anyway'**
  String get emergencyAckViewResults;

  /// Acknowledge the emergency guidance before booking.
  ///
  /// In en, this message translates to:
  /// **'I understand the risk - continue'**
  String get emergencyAckContinueRisk;

  /// Empty swipe deck.
  ///
  /// In en, this message translates to:
  /// **'All suggestions answered. Add anything else below.'**
  String get symptomDeckAllAnswered;

  /// Screen-reader label of a symptom card. In right-to-left languages the directions are mirrored (left = yes, right = no).
  ///
  /// In en, this message translates to:
  /// **'{name}. Do you have this symptom? Swipe right for yes, left for no, up for maybe.'**
  String symptomCardSemantics(String name);

  /// Hint on a symptom card.
  ///
  /// In en, this message translates to:
  /// **'Swipe or tap to answer'**
  String get symptomSwipeOrTap;

  /// Screen-reader label of an answer button, e.g. 'Answer Yes'.
  ///
  /// In en, this message translates to:
  /// **'Answer {answer}'**
  String symptomAnswerSemantics(String answer);

  /// Tooltip of an answer button for a symptom, e.g. 'No: Chest pain'.
  ///
  /// In en, this message translates to:
  /// **'{answer}: {name}'**
  String symptomAnswerTooltip(String answer, String name);

  /// Tooltip: add the typed symptom.
  ///
  /// In en, this message translates to:
  /// **'Add symptom'**
  String get symptomAddTooltip;

  /// Tooltip: remove a symptom.
  ///
  /// In en, this message translates to:
  /// **'Remove {name}'**
  String symptomRemoveTooltip(String name);

  /// Lower-case field name inside 'Added ...' after a voice intake.
  ///
  /// In en, this message translates to:
  /// **'body areas'**
  String get intakeAppliedBodyAreas;

  /// Lower-case field name inside 'Added ...'.
  ///
  /// In en, this message translates to:
  /// **'pain intensity'**
  String get intakeAppliedPainIntensity;

  /// Lower-case field name inside 'Added ...'.
  ///
  /// In en, this message translates to:
  /// **'symptoms'**
  String get intakeAppliedSymptoms;

  /// Lower-case field name inside 'Added ...'.
  ///
  /// In en, this message translates to:
  /// **'duration'**
  String get intakeAppliedDuration;

  /// Lower-case field name inside 'Added ...'.
  ///
  /// In en, this message translates to:
  /// **'daily impact'**
  String get intakeAppliedDailyImpact;

  /// Lower-case field name inside 'Added ...'.
  ///
  /// In en, this message translates to:
  /// **'previous treatments'**
  String get intakeAppliedPreviousTreatments;

  /// Lower-case field name inside 'Added ...'.
  ///
  /// In en, this message translates to:
  /// **'notes'**
  String get intakeAppliedNotes;

  /// Separator between list items (e.g. field names). Keep the trailing space if your language uses one.
  ///
  /// In en, this message translates to:
  /// **', '**
  String get intakeListSeparator;

  /// Snack bar after a voice intake: fields that were filled.
  ///
  /// In en, this message translates to:
  /// **'Added {fields}.'**
  String intakeVoiceAddedOnly(String fields);

  /// Snack bar after a voice intake: answers replaced.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{updated {count} answer.} other{updated {count} answers.}}'**
  String intakeVoiceUpdatedOnly(int count);

  /// Snack bar after a voice intake: fields filled and answers replaced.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{Added {fields}; updated {count} answer.} other{Added {fields}; updated {count} answers.}}'**
  String intakeVoiceAddedAndUpdated(String fields, int count);

  /// Snack bar: voice intake changed nothing.
  ///
  /// In en, this message translates to:
  /// **'Your answers already match what you said.'**
  String get intakeVoiceAlreadyMatch;

  /// Conflict label: pain intensity differs.
  ///
  /// In en, this message translates to:
  /// **'Pain intensity'**
  String get intakeConflictPainIntensity;

  /// Conflict label: duration differs.
  ///
  /// In en, this message translates to:
  /// **'How long'**
  String get intakeConflictHowLong;

  /// Conflict label for a daily-impact dimension.
  ///
  /// In en, this message translates to:
  /// **'Daily impact: {dimension}'**
  String intakeConflictDailyImpact(String dimension);

  /// Duration with its unit, e.g. '3 weeks'.
  ///
  /// In en, this message translates to:
  /// **'{value} {unit}'**
  String intakeDurationValue(int value, String unit);

  /// Title of the voice-intake conflict sheet.
  ///
  /// In en, this message translates to:
  /// **'Some answers differ'**
  String get intakeConflictTitle;

  /// Hint of the conflict sheet.
  ///
  /// In en, this message translates to:
  /// **'Tick the answers you want to replace with what you said. Unticked answers stay as they are.'**
  String get intakeConflictHint;

  /// Two lines: the current answer and the voice answer.
  ///
  /// In en, this message translates to:
  /// **'Yours: {current}\nFrom your voice: {suggested}'**
  String intakeConflictCompare(String current, String suggested);

  /// Review form section title.
  ///
  /// In en, this message translates to:
  /// **'Medical area'**
  String get intakeMedicalArea;

  /// Specialty dropdown label.
  ///
  /// In en, this message translates to:
  /// **'Specialty (optional)'**
  String get intakeSpecialtyOptional;

  /// Specialty dropdown option: no specialty.
  ///
  /// In en, this message translates to:
  /// **'Not sure'**
  String get intakeNotSure;

  /// Review form section title (body areas).
  ///
  /// In en, this message translates to:
  /// **'Where is the problem?'**
  String get intakeWhereProblem;

  /// Button: add a pain value.
  ///
  /// In en, this message translates to:
  /// **'Add pain intensity'**
  String get intakeAddPain;

  /// Review form section title.
  ///
  /// In en, this message translates to:
  /// **'Symptoms'**
  String get intakeSymptoms;

  /// Hint of the new-symptom field.
  ///
  /// In en, this message translates to:
  /// **'Add a symptom'**
  String get intakeAddSymptomHint;

  /// Review form section title (duration).
  ///
  /// In en, this message translates to:
  /// **'How long have you had it?'**
  String get intakeHowLong;

  /// Review form section title.
  ///
  /// In en, this message translates to:
  /// **'Daily impact'**
  String get intakeDailyImpact;

  /// Review form section title.
  ///
  /// In en, this message translates to:
  /// **'Previous treatments'**
  String get intakePreviousTreatments;

  /// Section title / conflict label: free-text notes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get intakeNotesLabel;

  /// Hint of the notes field.
  ///
  /// In en, this message translates to:
  /// **'Anything else the doctor should know'**
  String get intakeNotesHint;

  /// Voice intake button and screen title.
  ///
  /// In en, this message translates to:
  /// **'Describe it by voice'**
  String get voiceIntakeTitle;

  /// Voice intake screen title in the review phase.
  ///
  /// In en, this message translates to:
  /// **'Check your answers'**
  String get voiceReviewTitle;

  /// Instructions above the record button.
  ///
  /// In en, this message translates to:
  /// **'Tell us in your own words where it hurts, since when, how bad it is and what you have already tried.'**
  String get voiceIntro;

  /// Microphone permission denied.
  ///
  /// In en, this message translates to:
  /// **'Microphone access is off. Allow it for Heal India Global in your phone settings, or type instead.'**
  String get voiceMicOff;

  /// Recorder failed to start.
  ///
  /// In en, this message translates to:
  /// **'Could not start recording. Please try again or type instead.'**
  String get voiceStartFailed;

  /// Empty recording.
  ///
  /// In en, this message translates to:
  /// **'Nothing was recorded. Please try again.'**
  String get voiceNothingRecorded;

  /// Upload attempted without consent.
  ///
  /// In en, this message translates to:
  /// **'Please agree to the processing of your recording first.'**
  String get voiceConsentRequired;

  /// Transcription failed.
  ///
  /// In en, this message translates to:
  /// **'We could not understand the recording. Try again in a quieter place, or type instead.'**
  String get voiceNotUnderstood;

  /// Typed description too short.
  ///
  /// In en, this message translates to:
  /// **'Please describe your problem in a few words.'**
  String get voiceExtractTooShort;

  /// Acknowledge the emergency guidance during voice intake.
  ///
  /// In en, this message translates to:
  /// **'I understand - continue reviewing my answers'**
  String get voiceEmergencyAck;

  /// Screen-reader label of the record button.
  ///
  /// In en, this message translates to:
  /// **'Stop recording'**
  String get voiceStopRecording;

  /// Screen-reader label of the record button.
  ///
  /// In en, this message translates to:
  /// **'Record again'**
  String get voiceRecordAgain;

  /// Screen-reader label of the record button.
  ///
  /// In en, this message translates to:
  /// **'Start recording'**
  String get voiceStartRecording;

  /// Status after recording; duration like '0:42'.
  ///
  /// In en, this message translates to:
  /// **'Recorded {duration} · tap to record again'**
  String voiceRecordedStatus(String duration);

  /// Status before recording.
  ///
  /// In en, this message translates to:
  /// **'Tap to start speaking'**
  String get voiceTapToStart;

  /// Screen-reader label of the microphone level bar.
  ///
  /// In en, this message translates to:
  /// **'Input level'**
  String get voiceInputLevel;

  /// Consent checkbox for voice processing. Legal / privacy wording: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'I agree that my recording is transcribed on Heal India Global\'s own servers and that AI turns it into answers for my screening. The audio is deleted after transcription. I will check everything before it is used.'**
  String get voiceConsentText;

  /// Button: upload the recording.
  ///
  /// In en, this message translates to:
  /// **'Use this recording'**
  String get voiceUseRecording;

  /// Button: switch to typing.
  ///
  /// In en, this message translates to:
  /// **'Type instead'**
  String get voiceTypeInstead;

  /// Hint of the typed description field.
  ///
  /// In en, this message translates to:
  /// **'Describe your problem in your own words…'**
  String get voiceTypedHint;

  /// Button: extract answers from the typed text.
  ///
  /// In en, this message translates to:
  /// **'Fill my answers'**
  String get voiceFillAnswers;

  /// Button: switch back to recording.
  ///
  /// In en, this message translates to:
  /// **'Speak instead'**
  String get voiceSpeakInstead;

  /// Progress: uploading audio.
  ///
  /// In en, this message translates to:
  /// **'Uploading your recording…'**
  String get voiceUploading;

  /// Progress: extracting answers from text.
  ///
  /// In en, this message translates to:
  /// **'Reading your description…'**
  String get voiceReading;

  /// Progress: transcribing audio.
  ///
  /// In en, this message translates to:
  /// **'Listening to your recording…'**
  String get voiceListening;

  /// Reassurance under the progress indicator.
  ///
  /// In en, this message translates to:
  /// **'You will check every answer before it is used.'**
  String get voiceCheckEveryAnswer;

  /// Emergency banner in the review. Safety-critical: translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'Some of what you described may need urgent care. Please seek local emergency care now.'**
  String get voiceEmergencyBanner;

  /// Button: open the emergency guidance.
  ///
  /// In en, this message translates to:
  /// **'Guidance'**
  String get voiceGuidance;

  /// Review intro; 'Confirm' is the label of the confirm button (commonConfirm).
  ///
  /// In en, this message translates to:
  /// **'Please check what we understood. Change anything that is wrong, then tap Confirm.'**
  String get voiceReviewIntro;

  /// Label of the typed description in the review.
  ///
  /// In en, this message translates to:
  /// **'Your description'**
  String get voiceYourDescription;

  /// Label of the transcript in the review.
  ///
  /// In en, this message translates to:
  /// **'What you said'**
  String get voiceWhatYouSaid;

  /// AI disclaimer under the review form. Translate faithfully.
  ///
  /// In en, this message translates to:
  /// **'AI-generated suggestions — not a diagnosis.'**
  String get voiceAiDisclaimer;

  /// Button: discard the transcription.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get voiceDiscard;

  /// Search screen: placeholder of the search field.
  ///
  /// In en, this message translates to:
  /// **'Search hospitals, doctors, treatments'**
  String get searchHint;

  /// Search screen: tooltip of the button that clears the search text.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get searchClearTooltip;

  /// Search screen: tooltip of the button that opens the filters sheet.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get searchFiltersTooltip;

  /// Search screen: tab listing hospitals.
  ///
  /// In en, this message translates to:
  /// **'Hospitals'**
  String get searchTabHospitals;

  /// Search screen: tab listing doctors.
  ///
  /// In en, this message translates to:
  /// **'Doctors'**
  String get searchTabDoctors;

  /// Search screen: tab listing medical procedures / treatments.
  ///
  /// In en, this message translates to:
  /// **'Procedures'**
  String get searchTabProcedures;

  /// Search screen: empty-results message when a query or filters are active.
  ///
  /// In en, this message translates to:
  /// **'Try a different search or clear your filters.'**
  String get searchEmptyTryDifferent;

  /// Search screen: empty-results message when nothing is listed yet (partners = partner hospitals).
  ///
  /// In en, this message translates to:
  /// **'Check back soon - new partners are added regularly.'**
  String get searchEmptyCheckBack;

  /// Search screen: button that removes all active filters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get searchClearFilters;

  /// Search screen: empty state title on the Hospitals tab.
  ///
  /// In en, this message translates to:
  /// **'No hospitals found'**
  String get searchNoHospitalsFound;

  /// Search screen: empty state title on the Doctors tab.
  ///
  /// In en, this message translates to:
  /// **'No doctors found'**
  String get searchNoDoctorsFound;

  /// Search screen: empty state title on the Procedures tab.
  ///
  /// In en, this message translates to:
  /// **'No procedures found'**
  String get searchNoProceduresFound;

  /// Search screen: removable chip for the active doctor-gender filter. gender is the API value; label is the already translated gender name (used for other values).
  ///
  /// In en, this message translates to:
  /// **'{gender, select, female{Female doctors} male{Male doctors} other{{label} doctors}}'**
  String searchGenderDoctorsChip(String gender, String label);

  /// Search lists: total number of results shown at the end of the list.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} result} other{{count} results}}'**
  String searchResultCount(int count);

  /// Search filters sheet: title.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get filtersTitle;

  /// Medical specialty: filter field label and comparison-table row label.
  ///
  /// In en, this message translates to:
  /// **'Specialty'**
  String get filtersSpecialtyLabel;

  /// Search filters sheet: dropdown option meaning no specialty filter.
  ///
  /// In en, this message translates to:
  /// **'Any specialty'**
  String get filtersAnySpecialty;

  /// City filter label (search filters and match filters).
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get filtersCityLabel;

  /// Search filters sheet: example cities in the city field. City names may be transliterated.
  ///
  /// In en, this message translates to:
  /// **'e.g. New Delhi, Chennai'**
  String get filtersCityHint;

  /// Search filters sheet: heading of the hospital accreditation chips (JCI, NABH...).
  ///
  /// In en, this message translates to:
  /// **'Accreditation (hospitals)'**
  String get filtersAccreditationLabel;

  /// Search filters sheet: heading of the language chips (language the doctor / hospital staff speak).
  ///
  /// In en, this message translates to:
  /// **'Language spoken'**
  String get filtersLanguageLabel;

  /// Search filters sheet: heading of the doctor gender chips.
  ///
  /// In en, this message translates to:
  /// **'Doctor gender'**
  String get filtersDoctorGenderLabel;

  /// Search filters sheet: heading of the hospital sort options.
  ///
  /// In en, this message translates to:
  /// **'Sort hospitals by'**
  String get filtersSortLabel;

  /// Search filters sheet: button that applies the filters.
  ///
  /// In en, this message translates to:
  /// **'Show results'**
  String get filtersShowResults;

  /// Hospital sort option: highest rating first.
  ///
  /// In en, this message translates to:
  /// **'Top rated'**
  String get filtersSortTopRated;

  /// Hospital sort option: cheapest first.
  ///
  /// In en, this message translates to:
  /// **'Lowest price'**
  String get filtersSortLowestPrice;

  /// Hospital sort option: alphabetical by name.
  ///
  /// In en, this message translates to:
  /// **'Name (A-Z)'**
  String get filtersSortName;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get filtersLanguageEnglish;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'Hindi'**
  String get filtersLanguageHindi;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'Arabic'**
  String get filtersLanguageArabic;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'French'**
  String get filtersLanguageFrench;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'Russian'**
  String get filtersLanguageRussian;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'Bengali'**
  String get filtersLanguageBengali;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'Swahili'**
  String get filtersLanguageSwahili;

  /// Language name (filter chip).
  ///
  /// In en, this message translates to:
  /// **'Spanish'**
  String get filtersLanguageSpanish;

  /// Tooltip on a price converted to the user's currency: the original price and that the exchange rate is today's.
  ///
  /// In en, this message translates to:
  /// **'Estimated from {amount} at today\'s rate'**
  String catalogApproxPriceTooltip(String amount);

  /// Short badge on a hospital card: the hospital has a desk for international patients.
  ///
  /// In en, this message translates to:
  /// **'International desk'**
  String get catalogInternationalDesk;

  /// Badge on hospital detail: the hospital has a desk for international patients.
  ///
  /// In en, this message translates to:
  /// **'International patient desk'**
  String get catalogInternationalPatientDesk;

  /// Prefix before a starting price on a hospital card ('From ≈ $5,000'). Keep the trailing space.
  ///
  /// In en, this message translates to:
  /// **'From '**
  String get catalogPriceFromPrefix;

  /// Badge with a doctor's / treatment's success rate.
  ///
  /// In en, this message translates to:
  /// **'{pct}% Success'**
  String catalogSuccessBadge(int pct);

  /// Badge / table row: the doctor offers video consultations.
  ///
  /// In en, this message translates to:
  /// **'Video consult'**
  String get catalogVideoConsult;

  /// Length of the hospital stay for a treatment.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} days in hospital}}'**
  String catalogDaysInHospital(int count);

  /// A percentage value (success rate).
  ///
  /// In en, this message translates to:
  /// **'{value}%'**
  String catalogPercent(int value);

  /// Section heading on hospital / doctor detail: description or biography.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get catalogAboutSection;

  /// Section heading: languages the doctor / hospital staff speak.
  ///
  /// In en, this message translates to:
  /// **'Languages spoken'**
  String get catalogLanguagesSpoken;

  /// Section heading on hospital / doctor detail: treatments with price ranges.
  ///
  /// In en, this message translates to:
  /// **'Treatments & prices'**
  String get catalogTreatmentsPrices;

  /// Button that collapses a long text.
  ///
  /// In en, this message translates to:
  /// **'Show less'**
  String get catalogShowLess;

  /// Button that expands a long text.
  ///
  /// In en, this message translates to:
  /// **'Read more'**
  String get catalogReadMore;

  /// Snack bar when a phone number, email, website or map link could not be opened.
  ///
  /// In en, this message translates to:
  /// **'Could not open {target}'**
  String catalogCouldNotOpen(String target);

  /// Button: start the symptom screening that matches the patient with suitable doctors and hospitals.
  ///
  /// In en, this message translates to:
  /// **'Get matched'**
  String get catalogGetMatched;

  /// Hospital detail: error title when the hospital does not exist.
  ///
  /// In en, this message translates to:
  /// **'Hospital not found'**
  String get hospitalDetailNotFound;

  /// Hospital detail stat label under the founding year (e.g. 1996).
  ///
  /// In en, this message translates to:
  /// **'Established'**
  String get hospitalDetailEstablished;

  /// Hospital detail stat label under the number of beds.
  ///
  /// In en, this message translates to:
  /// **'Beds'**
  String get hospitalDetailBeds;

  /// Distance in kilometres.
  ///
  /// In en, this message translates to:
  /// **'{distance} km'**
  String hospitalDetailDistanceKm(String distance);

  /// Hospital detail stat label under the distance from the airport.
  ///
  /// In en, this message translates to:
  /// **'From airport'**
  String get hospitalDetailFromAirport;

  /// Hospital detail: text shown right before the lowest treatment price. Keep the trailing space.
  ///
  /// In en, this message translates to:
  /// **'Treatments from '**
  String get hospitalDetailTreatmentsFrom;

  /// Hospital detail: section heading listing medical specialties.
  ///
  /// In en, this message translates to:
  /// **'Specialties'**
  String get hospitalDetailSpecialties;

  /// Hospital detail: disclaimer under the treatment prices.
  ///
  /// In en, this message translates to:
  /// **'Prices are indicative. Your final quote comes from the hospital after reviewing your case.'**
  String get hospitalDetailPricesIndicative;

  /// Hospital detail: section heading listing the hospital's doctors.
  ///
  /// In en, this message translates to:
  /// **'Doctors'**
  String get hospitalDetailDoctors;

  /// Hospital detail: section heading of patient reviews.
  ///
  /// In en, this message translates to:
  /// **'Patient reviews'**
  String get hospitalDetailPatientReviews;

  /// Hospital detail: section heading with address, phone, email, website.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get hospitalDetailContact;

  /// Hospital detail: shown when the hospital has no public contact details. Keep the brand name in Latin script.
  ///
  /// In en, this message translates to:
  /// **'Contact the hospital through your Heal India Global coordinator after requesting a quote.'**
  String get hospitalDetailContactViaCoordinator;

  /// Doctor detail screen title.
  ///
  /// In en, this message translates to:
  /// **'Doctor profile'**
  String get doctorDetailTitle;

  /// Doctor detail stat: years of experience (short form).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} yrs}}'**
  String doctorDetailExperienceYears(int count);

  /// Label: a doctor's professional experience (stat label and comparison row).
  ///
  /// In en, this message translates to:
  /// **'Experience'**
  String get doctorDetailExperience;

  /// Label: a doctor's treatment success rate (stat label and comparison row).
  ///
  /// In en, this message translates to:
  /// **'Success rate'**
  String get doctorDetailSuccessRate;

  /// Doctor detail stat label under the average rating: number of reviews.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} reviews}}'**
  String doctorDetailReviewCount(int count);

  /// Doctor detail: the doctor offers video consultations (next to the fee).
  ///
  /// In en, this message translates to:
  /// **'Video consultation available'**
  String get doctorDetailVideoConsultAvailable;

  /// Doctor detail: label next to the consultation price.
  ///
  /// In en, this message translates to:
  /// **'Consultation fee'**
  String get doctorDetailConsultationFee;

  /// Doctor detail: section heading with degrees (MBBS, MD...).
  ///
  /// In en, this message translates to:
  /// **'Qualifications'**
  String get doctorDetailQualifications;

  /// Doctor detail: section heading with sub-specialties.
  ///
  /// In en, this message translates to:
  /// **'Areas of expertise'**
  String get doctorDetailExpertise;

  /// Detail screens: section heading for open appointment dates.
  ///
  /// In en, this message translates to:
  /// **'Availability'**
  String get availabilitySection;

  /// Availability card title: open dates over the next 30 days.
  ///
  /// In en, this message translates to:
  /// **'Availability (next 30 days)'**
  String get availabilityNext30Days;

  /// Availability card: no open appointment slots are published.
  ///
  /// In en, this message translates to:
  /// **'No open slots published yet - request a quote and the hospital will propose dates.'**
  String get availabilityNoSlots;

  /// First date with open appointment slots.
  ///
  /// In en, this message translates to:
  /// **'Next available: {date}'**
  String availabilityNextAvailable(String date);

  /// Screen-reader label of a day in the availability strip that has open slots.
  ///
  /// In en, this message translates to:
  /// **'{day}: available'**
  String availabilityDayAvailable(String day);

  /// Screen-reader label of a day in the availability strip with no open slots.
  ///
  /// In en, this message translates to:
  /// **'{day}: unavailable'**
  String availabilityDayUnavailable(String day);

  /// Procedure sheet stat value: a number of days.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} days}}'**
  String procedureDays(int count);

  /// Procedure sheet stat label: days spent in hospital.
  ///
  /// In en, this message translates to:
  /// **'In hospital'**
  String get procedureInHospital;

  /// Procedure sheet stat label: recovery days.
  ///
  /// In en, this message translates to:
  /// **'Recovery'**
  String get procedureRecovery;

  /// Procedure sheet stat label: total days the patient stays in India.
  ///
  /// In en, this message translates to:
  /// **'Total stay in India'**
  String get procedureTotalStayInIndia;

  /// Procedure sheet: label of the typical price of the treatment in the patient's home country.
  ///
  /// In en, this message translates to:
  /// **'Typical cost in {country}'**
  String procedureTypicalCostIn(String country);

  /// Procedure sheet: typical waiting time for the treatment in the home country (text from the server).
  ///
  /// In en, this message translates to:
  /// **'Wait time: {time}'**
  String procedureWaitTime(String time);

  /// Procedure sheet: button that opens the cost comparison (home country vs India).
  ///
  /// In en, this message translates to:
  /// **'Compare costs'**
  String get procedureCompareCosts;

  /// Button on hospital / doctor detail: ask the hospital for a price quote.
  ///
  /// In en, this message translates to:
  /// **'Request quote'**
  String get quoteRequestButton;

  /// Snack bar after a quote request was sent.
  ///
  /// In en, this message translates to:
  /// **'Quote requested. The hospital usually replies within 48 hours.'**
  String get quoteRequestedSnack;

  /// Request-quote sheet title.
  ///
  /// In en, this message translates to:
  /// **'Request a quote'**
  String get quoteSheetTitle;

  /// Request-quote sheet: optional treatment dropdown label.
  ///
  /// In en, this message translates to:
  /// **'Treatment (optional)'**
  String get quoteTreatmentLabel;

  /// Request-quote sheet: dropdown option when the patient does not know the treatment yet.
  ///
  /// In en, this message translates to:
  /// **'Not sure yet'**
  String get quoteTreatmentNotSure;

  /// Request-quote sheet: label of the free-text field about the patient's medical condition.
  ///
  /// In en, this message translates to:
  /// **'Tell the hospital about your condition'**
  String get quoteNotesLabel;

  /// Request-quote sheet: hint of the medical notes field.
  ///
  /// In en, this message translates to:
  /// **'Diagnosis, current treatment, preferred travel dates...'**
  String get quoteNotesHint;

  /// Request-quote sheet: consent checkbox to share personal and medical data with this hospital. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'I agree to share my profile, medical notes and documents with {hospital} so they can prepare a quote.'**
  String quoteConsent(String hospital);

  /// Button that sends a quote / consultation request to the hospital.
  ///
  /// In en, this message translates to:
  /// **'Send request'**
  String get quoteSendRequest;

  /// Snack bar after removing a hospital / doctor / procedure from the saved list.
  ///
  /// In en, this message translates to:
  /// **'Removed from saved'**
  String get savedRemovedSnack;

  /// Snack bar after saving (bookmarking) an item.
  ///
  /// In en, this message translates to:
  /// **'Saved to your list'**
  String get savedAddedSnack;

  /// Snack bar for guests who tap the bookmark button.
  ///
  /// In en, this message translates to:
  /// **'Create a free account to save hospitals and doctors.'**
  String get savedGuestPrompt;

  /// Snack bar action that opens registration.
  ///
  /// In en, this message translates to:
  /// **'Sign up'**
  String get savedSignUpAction;

  /// Tooltip of the bookmark button when the item is saved.
  ///
  /// In en, this message translates to:
  /// **'Remove from saved'**
  String get savedRemoveTooltip;

  /// Matches sort option: highest match score first.
  ///
  /// In en, this message translates to:
  /// **'Best match'**
  String get matchSortBestMatch;

  /// Matches sort option: cheapest first.
  ///
  /// In en, this message translates to:
  /// **'Lowest cost'**
  String get matchSortLowestCost;

  /// Matches sort option: best rated first.
  ///
  /// In en, this message translates to:
  /// **'Highest rating'**
  String get matchSortHighestRating;

  /// Matches sort option: most experienced doctor first.
  ///
  /// In en, this message translates to:
  /// **'Most experience'**
  String get matchSortMostExperience;

  /// Matches sort/filter sheet: heading of the sort options.
  ///
  /// In en, this message translates to:
  /// **'Sort by'**
  String get matchSortBy;

  /// Matches sort/filter sheet: heading of the filter options.
  ///
  /// In en, this message translates to:
  /// **'Filter'**
  String get matchFilterTitle;

  /// Matches filter switch: only hospitals with JCI accreditation (keep JCI).
  ///
  /// In en, this message translates to:
  /// **'JCI accredited hospitals only'**
  String get matchFilterJciOnly;

  /// Matches filter switch: only doctors offering video consultations.
  ///
  /// In en, this message translates to:
  /// **'Offers video consultation'**
  String get matchFilterVideoConsult;

  /// Matches filter: heading of the language chips (the doctor / hospital speaks).
  ///
  /// In en, this message translates to:
  /// **'Speaks'**
  String get matchFilterSpeaks;

  /// Match card: label above the estimated total treatment cost.
  ///
  /// In en, this message translates to:
  /// **'Estimated Total Cost'**
  String get matchCardEstimatedTotalCost;

  /// Match card: savings range compared with the price in the patient's home country.
  ///
  /// In en, this message translates to:
  /// **'Save {min}-{max}% vs home'**
  String matchCardSaveVsHome(int min, int max);

  /// Match card button state: the match is selected for comparison.
  ///
  /// In en, this message translates to:
  /// **'Added'**
  String get matchCardAdded;

  /// Match card button: add the match to the comparison.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get matchCardCompare;

  /// Match card button: open the match detail.
  ///
  /// In en, this message translates to:
  /// **'View Details'**
  String get matchCardViewDetails;

  /// Match detail: section heading with the reasons the doctor/hospital was matched.
  ///
  /// In en, this message translates to:
  /// **'Why this match'**
  String get matchDetailWhyThisMatch;

  /// Match detail: section heading of the estimated cost.
  ///
  /// In en, this message translates to:
  /// **'Estimated cost'**
  String get matchDetailEstimatedCost;

  /// Match detail: label before the price range in the patient's home country. Keep the trailing space.
  ///
  /// In en, this message translates to:
  /// **'In {country}: '**
  String matchDetailInCountry(String country);

  /// Match detail: savings range in percent.
  ///
  /// In en, this message translates to:
  /// **'Save {min}-{max}%'**
  String matchDetailSavePct(int min, int max);

  /// Match detail: disclaimer under the estimated cost.
  ///
  /// In en, this message translates to:
  /// **'Final price comes from the hospital quote after they review your case.'**
  String get matchDetailFinalPriceNote;

  /// Match detail: link to the cost comparison screen.
  ///
  /// In en, this message translates to:
  /// **'See full cost comparison'**
  String get matchDetailSeeFullComparison;

  /// Match detail: section heading of the recommended treatment package.
  ///
  /// In en, this message translates to:
  /// **'Suggested package'**
  String get matchDetailSuggestedPackage;

  /// Match detail bottom button: open the cost comparison.
  ///
  /// In en, this message translates to:
  /// **'Compare Costs'**
  String get matchDetailCompareCosts;

  /// Match detail: section heading of the doctor's procedures and packages.
  ///
  /// In en, this message translates to:
  /// **'Procedures & packages'**
  String get matchDetailProceduresPackages;

  /// Compare screen title when nothing is selected.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get compareTitleShort;

  /// Compare screen title (side-by-side comparison of matched doctors/hospitals).
  ///
  /// In en, this message translates to:
  /// **'Compare Matches'**
  String get compareTitle;

  /// Compare screen empty state title.
  ///
  /// In en, this message translates to:
  /// **'Nothing to compare'**
  String get compareNothingTitle;

  /// Compare screen empty state message.
  ///
  /// In en, this message translates to:
  /// **'Select 2 or 3 matches from your results to compare them side by side.'**
  String get compareNothingMessage;

  /// Compare screen empty state button: start a new symptom screening (questionnaire).
  ///
  /// In en, this message translates to:
  /// **'Start a screening'**
  String get compareStartScreening;

  /// Compare screen: the selected matches no longer exist.
  ///
  /// In en, this message translates to:
  /// **'These matches are no longer available'**
  String get compareNoLongerAvailable;

  /// Compare screen button: go back to the matches list.
  ///
  /// In en, this message translates to:
  /// **'Back to matches'**
  String get compareBackToMatches;

  /// Comparison table row label: match score.
  ///
  /// In en, this message translates to:
  /// **'Match'**
  String get compareRowMatch;

  /// Comparison table: years of experience.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} years}}'**
  String compareExperienceYears(int count);

  /// Comparison table row label: rating.
  ///
  /// In en, this message translates to:
  /// **'Rating'**
  String get compareRowRating;

  /// Comparison table row label / match detail section heading: the hospital.
  ///
  /// In en, this message translates to:
  /// **'Hospital'**
  String get compareRowHospital;

  /// Comparison table row label: hospital accreditations.
  ///
  /// In en, this message translates to:
  /// **'Accreditation'**
  String get compareRowAccreditation;

  /// Comparison table row label: languages spoken.
  ///
  /// In en, this message translates to:
  /// **'Languages'**
  String get compareRowLanguages;

  /// Comparison table row label: estimated cost (short).
  ///
  /// In en, this message translates to:
  /// **'Est. cost'**
  String get compareRowEstCost;

  /// Comparison table: marks the lowest estimated cost.
  ///
  /// In en, this message translates to:
  /// **'Lowest'**
  String get compareLowest;

  /// Label: savings compared with the home country (comparison row, cost comparison card).
  ///
  /// In en, this message translates to:
  /// **'Savings'**
  String get compareRowSavings;

  /// A percentage range.
  ///
  /// In en, this message translates to:
  /// **'{min}-{max}%'**
  String comparePercentRange(int min, int max);

  /// Comparison table row label: treatment package.
  ///
  /// In en, this message translates to:
  /// **'Package'**
  String get compareRowPackage;

  /// Comparison table row label: reasons for the match.
  ///
  /// In en, this message translates to:
  /// **'Why'**
  String get compareRowWhy;

  /// Comparison table button: book a consultation with this match.
  ///
  /// In en, this message translates to:
  /// **'Book'**
  String get compareBook;

  /// Comparison table button: open the match detail.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get compareDetails;

  /// Snack bar after a consultation request (case) was created.
  ///
  /// In en, this message translates to:
  /// **'Request {caseNumber} sent to {hospital}.'**
  String consultationRequestSentSnack(String caseNumber, String hospital);

  /// Consultation sheet: error when the consent checkbox is not ticked.
  ///
  /// In en, this message translates to:
  /// **'Please agree to share your information with the hospital.'**
  String get consultationConsentRequired;

  /// Consultation sheet: guests must register before sending a request; their screening answers are not lost.
  ///
  /// In en, this message translates to:
  /// **'Create a free account to send requests to hospitals. Your screening answers are kept.'**
  String get consultationGuestUpgrade;

  /// Consultation sheet title and button that books a consultation with the hospital.
  ///
  /// In en, this message translates to:
  /// **'Book Consultation'**
  String get consultationBookTitle;

  /// Consultation sheet: optional message field label.
  ///
  /// In en, this message translates to:
  /// **'Message to the hospital (optional)'**
  String get consultationMessageLabel;

  /// Consultation sheet: hint of the message field.
  ///
  /// In en, this message translates to:
  /// **'Preferred dates, questions, companions travelling with you...'**
  String get consultationMessageHint;

  /// Consultation sheet: consent checkbox to share medical data with this hospital. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'I agree to share my screening answers, reports and medical information with {hospital} so they can review my case and prepare a quote.'**
  String consultationConsent(String hospital);

  /// Consultation sheet button for guests: open registration.
  ///
  /// In en, this message translates to:
  /// **'Create free account'**
  String get consultationCreateAccount;

  /// Consultation sheet footer: payment happens only after accepting the hospital's quote.
  ///
  /// In en, this message translates to:
  /// **'The hospital replies with a personalised quote. You only pay after you accept it.'**
  String get consultationPayAfterAccept;

  /// Cost comparison screen title (treatment cost at home vs in India).
  ///
  /// In en, this message translates to:
  /// **'Treatment Comparison'**
  String get costTitle;

  /// Cost comparison bottom button: search hospitals for this treatment.
  ///
  /// In en, this message translates to:
  /// **'Find Hospitals'**
  String get costFindHospitals;

  /// Cost comparison: tooltip of the country picker.
  ///
  /// In en, this message translates to:
  /// **'Change home country'**
  String get costChangeCountryTooltip;

  /// Cost comparison: country picker label (home country compared with India).
  ///
  /// In en, this message translates to:
  /// **'Compare with {country}'**
  String costCompareWith(String country);

  /// Cost comparison card title for the home country.
  ///
  /// In en, this message translates to:
  /// **'Treatment in {country}'**
  String costTreatmentIn(String country);

  /// Card / label: the treatment price in India.
  ///
  /// In en, this message translates to:
  /// **'Treatment in India'**
  String get costTreatmentInIndia;

  /// Cost comparison card row label: price range.
  ///
  /// In en, this message translates to:
  /// **'Cost'**
  String get costRowCost;

  /// Cost comparison card row label: waiting time for the treatment.
  ///
  /// In en, this message translates to:
  /// **'Wait Time'**
  String get costRowWaitTime;

  /// Cost comparison: value when the waiting time is unknown / varies.
  ///
  /// In en, this message translates to:
  /// **'Varies'**
  String get costVaries;

  /// Cost comparison card row label: insurance coverage at home.
  ///
  /// In en, this message translates to:
  /// **'Insurance Coverage'**
  String get costRowInsurance;

  /// Cost comparison: insurance coverage depends on the insurance plan.
  ///
  /// In en, this message translates to:
  /// **'Varies by plan'**
  String get costVariesByPlan;

  /// Cost comparison: default waiting time in India.
  ///
  /// In en, this message translates to:
  /// **'1-2 weeks'**
  String get costIndiaDefaultWait;

  /// Cost comparison: savings amount range followed by the savings percentage range.
  ///
  /// In en, this message translates to:
  /// **'{amount} ({min}-{max}%)'**
  String costSavingsValue(String amount, int min, int max);

  /// Cost comparison: heading of the per-category cost list.
  ///
  /// In en, this message translates to:
  /// **'Itemized Cost Breakdown'**
  String get costItemizedTitle;

  /// Cost comparison: disclaimer at the bottom.
  ///
  /// In en, this message translates to:
  /// **'Estimates for comparison only. Your final price comes from the hospital\'s personalised quote. Home-country figures are typical published ranges and vary by provider and insurance.'**
  String get costDisclaimer;

  /// Cost comparison: shown when no itemized breakdown is available.
  ///
  /// In en, this message translates to:
  /// **'A detailed breakdown is included in the hospital quote.'**
  String get costBreakdownInQuote;

  /// Cost comparison item: typical cost of this item in the home country.
  ///
  /// In en, this message translates to:
  /// **'Typical in {country}'**
  String costTypicalIn(String country);

  /// Cost comparison treatment picker: title.
  ///
  /// In en, this message translates to:
  /// **'Choose a treatment'**
  String get costChooseTreatment;

  /// Cost comparison treatment picker: subtitle.
  ///
  /// In en, this message translates to:
  /// **'Compare what it costs at home and in India.'**
  String get costChooseTreatmentSubtitle;

  /// Cost comparison treatment picker: search field hint.
  ///
  /// In en, this message translates to:
  /// **'Search treatments'**
  String get costSearchTreatments;

  /// Cost comparison treatment picker: no results.
  ///
  /// In en, this message translates to:
  /// **'No treatments found'**
  String get costNoTreatmentsFound;

  /// Cost category: surgery.
  ///
  /// In en, this message translates to:
  /// **'Surgery'**
  String get costCategorySurgery;

  /// Cost category: hospital stay.
  ///
  /// In en, this message translates to:
  /// **'Hospital'**
  String get costCategoryHospital;

  /// Cost category: medicines.
  ///
  /// In en, this message translates to:
  /// **'Medications'**
  String get costCategoryMedications;

  /// Cost category: medical tests and imaging scans.
  ///
  /// In en, this message translates to:
  /// **'Tests & Scans'**
  String get costCategoryTestsScans;

  /// Cost category: doctors' fees.
  ///
  /// In en, this message translates to:
  /// **'Doctor Fees'**
  String get costCategoryDoctorFees;

  /// Cost category: medical implants.
  ///
  /// In en, this message translates to:
  /// **'Implants'**
  String get costCategoryImplants;

  /// Cost category: other charges.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get costCategoryOther;

  /// What the surgery cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Surgeon and anaesthesia fees, operating theatre and consumables.'**
  String get costCategorySurgeryHint;

  /// What the hospital-stay cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Room, nursing care, meals and ICU if required.'**
  String get costCategoryHospitalHint;

  /// What the medications cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Medicines during your stay and on discharge.'**
  String get costCategoryMedicationsHint;

  /// What the tests & scans cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Pre-operative tests, imaging and lab work.'**
  String get costCategoryTestsScansHint;

  /// What the doctor-fees cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Consultations and follow-up visits.'**
  String get costCategoryDoctorFeesHint;

  /// What the implants cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Implants, stents or prosthetics where needed.'**
  String get costCategoryImplantsHint;

  /// What the other cost category covers.
  ///
  /// In en, this message translates to:
  /// **'Other charges included in the estimate.'**
  String get costCategoryOtherHint;

  /// Country name (short form), used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'USA'**
  String get costCountryUs;

  /// Country name (short form), used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'UK'**
  String get costCountryGb;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Canada'**
  String get costCountryCa;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Australia'**
  String get costCountryAu;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'New Zealand'**
  String get costCountryNz;

  /// Country name (short form: United Arab Emirates), used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'UAE'**
  String get costCountryAe;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Saudi Arabia'**
  String get costCountrySa;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Oman'**
  String get costCountryOm;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Qatar'**
  String get costCountryQa;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Kuwait'**
  String get costCountryKw;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Bahrain'**
  String get costCountryBh;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Iraq'**
  String get costCountryIq;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Nigeria'**
  String get costCountryNg;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Kenya'**
  String get costCountryKe;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Tanzania'**
  String get costCountryTz;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Ethiopia'**
  String get costCountryEt;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Bangladesh'**
  String get costCountryBd;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Nepal'**
  String get costCountryNp;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Sri Lanka'**
  String get costCountryLk;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Afghanistan'**
  String get costCountryAf;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Uzbekistan'**
  String get costCountryUz;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Germany'**
  String get costCountryDe;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'France'**
  String get costCountryFr;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Spain'**
  String get costCountryEs;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Italy'**
  String get costCountryIt;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'Russia'**
  String get costCountryRu;

  /// Country name, used in cost comparisons.
  ///
  /// In en, this message translates to:
  /// **'India'**
  String get costCountryIn;

  /// Placeholder country name when the home country is unknown (inserted into 'Treatment in {country}' etc.; lower case).
  ///
  /// In en, this message translates to:
  /// **'your country'**
  String get costCountryYours;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Price summary: label of the deposit amount to pay now.
  ///
  /// In en, this message translates to:
  /// **'Deposit due now'**
  String get paymentDueDeposit;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Price summary: label of the remaining balance to pay now.
  ///
  /// In en, this message translates to:
  /// **'Balance due now'**
  String get paymentDueBalance;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Price summary: label of the amount to pay now.
  ///
  /// In en, this message translates to:
  /// **'Due now'**
  String get paymentDueNow;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Price summary: an installment amount to pay now.
  ///
  /// In en, this message translates to:
  /// **'Installment due now'**
  String get paymentDueInstallment;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Price summary: installment number {seq} to pay now.
  ///
  /// In en, this message translates to:
  /// **'Installment {seq} due now'**
  String paymentDueInstallmentSeq(int seq);

  /// Length of a hospital stay in days (e.g. "5 days").
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} day} other{{count} days}}'**
  String bookingStayDays(int count);

  /// Range of a hospital stay in days (e.g. "5-7 days").
  ///
  /// In en, this message translates to:
  /// **'{min}-{max} days'**
  String bookingStayDaysRange(int min, int max);

  /// App bar title of the payment screens.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get paymentTitle;

  /// Payment screen: heading of the security banner.
  ///
  /// In en, this message translates to:
  /// **'Secure Payment'**
  String get paymentSecureTitle;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment screen: security banner text.
  ///
  /// In en, this message translates to:
  /// **'Encrypted checkout by our payment partner. Card details never reach our servers.'**
  String get paymentSecureBody;

  /// Payment screen: section title above the payment methods.
  ///
  /// In en, this message translates to:
  /// **'Payment Method'**
  String get paymentMethodSection;

  /// Payment method option: pay by card.
  ///
  /// In en, this message translates to:
  /// **'Credit/Debit Card'**
  String get paymentMethodCard;

  /// Card option subtitle on the web: card payments only work in the mobile apps. Keep Android / iOS in Latin script.
  ///
  /// In en, this message translates to:
  /// **'Available in the Android and iOS app'**
  String get paymentMethodCardAppOnly;

  /// Payment method option and screen title: international bank transfer.
  ///
  /// In en, this message translates to:
  /// **'Bank Transfer'**
  String get bankTransferTitle;

  /// Bank transfer: section with the SWIFT bank details. Keep "SWIFT".
  ///
  /// In en, this message translates to:
  /// **'SWIFT Details'**
  String get bankSwiftDetails;

  /// Developer-only payment method (test gateway) and its dialog title.
  ///
  /// In en, this message translates to:
  /// **'Test payment'**
  String get paymentTestTitle;

  /// Developer-only test payment method subtitle.
  ///
  /// In en, this message translates to:
  /// **'Development gateway - no real money moves'**
  String get paymentTestSubtitle;

  /// Payment screen: monthly payment plans option and sheet title.
  ///
  /// In en, this message translates to:
  /// **'Payment Plans'**
  String get paymentPlansTitle;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment plans option subtitle: number of monthly installments of this booking (3, 6 or 12).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} monthly installments on this booking}}'**
  String paymentPlansOnBooking(int count);

  /// Payment plans option subtitle when the booking has no installments.
  ///
  /// In en, this message translates to:
  /// **'3, 6, 12 months - chosen when booking'**
  String get paymentPlansChosenWhenBooking;

  /// Section title / row label: health insurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get paymentInsurance;

  /// Checkbox: the patient wants help claiming health insurance.
  ///
  /// In en, this message translates to:
  /// **'I want to claim insurance'**
  String get bookingInsuranceClaim;

  /// Payment screen: insurance claim was requested when booking.
  ///
  /// In en, this message translates to:
  /// **'Claim requested. Upload your policy and claim forms so our team can help.'**
  String get paymentInsuranceRequestedHelp;

  /// Payment screen: no insurance claim was requested when booking.
  ///
  /// In en, this message translates to:
  /// **'Chosen when booking. Ask your coordinator if you want to add a claim.'**
  String get paymentInsuranceChosenWhenBooking;

  /// Button: upload insurance policy / claim documents.
  ///
  /// In en, this message translates to:
  /// **'Upload insurance documents'**
  String get paymentUploadInsuranceDocs;

  /// Payment screen: section title of the price breakdown.
  ///
  /// In en, this message translates to:
  /// **'Price Summary'**
  String get paymentPriceSummary;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment screen: currency conversion notice. {currency} is an ISO code like USD (do not translate).
  ///
  /// In en, this message translates to:
  /// **'You will be charged in {currency} at the exchange rate locked when the order is created.'**
  String paymentChargedInCurrency(String currency);

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment plans sheet: {option} is the payment option name (e.g. "Pay in full").
  ///
  /// In en, this message translates to:
  /// **'This booking uses \"{option}\". Monthly plans over 3, 6 or 12 months are chosen when you book. To switch, ask your coordinator before your first payment.'**
  String paymentPlansCurrentOption(String option);

  /// Payment plans sheet: no schedule yet.
  ///
  /// In en, this message translates to:
  /// **'Your installment schedule is being prepared.'**
  String get paymentScheduleBeingPrepared;

  /// Installment row: the due date is not set yet.
  ///
  /// In en, this message translates to:
  /// **'Due date pending'**
  String get paymentDueDatePending;

  /// Installment row: due date. {date} is a formatted date.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String paymentDueOn(String date);

  /// Snack bar on the web when card payment is chosen.
  ///
  /// In en, this message translates to:
  /// **'Card payments are available in the Android and iOS app. Use bank transfer here.'**
  String get paymentCardAppOnlySnack;

  /// Biometric prompt reason before paying. {amount} is a formatted amount with currency (e.g. "$1,200").
  ///
  /// In en, this message translates to:
  /// **'Confirm payment of {amount}'**
  String paymentConfirmReason(String amount);

  /// Snack bar: biometric confirmation was cancelled.
  ///
  /// In en, this message translates to:
  /// **'Payment not confirmed.'**
  String get paymentNotConfirmed;

  /// Snack bar: unsupported gateway.
  ///
  /// In en, this message translates to:
  /// **'This payment method is not available in the app.'**
  String get paymentMethodNotAvailable;

  /// Error: card checkout did not open.
  ///
  /// In en, this message translates to:
  /// **'Card checkout could not be started. Please try again.'**
  String get paymentCardCheckoutFailed;

  /// Payment pending in an external wallet app. {wallet} is the wallet name (e.g. Paytm).
  ///
  /// In en, this message translates to:
  /// **'Complete the payment in {wallet}. We will confirm your booking once it is received.'**
  String paymentWalletPending(String wallet);

  /// Developer-only test payment dialog.
  ///
  /// In en, this message translates to:
  /// **'Simulate the gateway result for this development order.'**
  String get paymentTestDialogBody;

  /// Developer-only test payment button.
  ///
  /// In en, this message translates to:
  /// **'Simulate failure'**
  String get paymentSimulateFailure;

  /// Developer-only test payment button.
  ///
  /// In en, this message translates to:
  /// **'Simulate success'**
  String get paymentSimulateSuccess;

  /// Pay button when bank transfer is selected.
  ///
  /// In en, this message translates to:
  /// **'Get bank transfer details'**
  String get paymentGetBankDetails;

  /// Pay button (no biometrics available).
  ///
  /// In en, this message translates to:
  /// **'Pay'**
  String get paymentPayButton;

  /// Fallback name when a booking has no package / procedure / specialty name.
  ///
  /// In en, this message translates to:
  /// **'Treatment'**
  String get bookingTreatmentFallback;

  /// Hospital admission date line. {date} is a formatted date.
  ///
  /// In en, this message translates to:
  /// **'Admission {date}'**
  String bookingAdmissionDate(String date);

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get paymentSubtotal;

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Discount'**
  String get paymentDiscount;

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Service fee'**
  String get paymentServiceFee;

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Taxes'**
  String get paymentTaxes;

  /// Price summary / booking / quote row: total amount.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get paymentTotal;

  /// Price summary row: amount already paid.
  ///
  /// In en, this message translates to:
  /// **'Paid so far'**
  String get paymentPaidSoFar;

  /// Price summary / booking row: remaining amount to pay.
  ///
  /// In en, this message translates to:
  /// **'Balance'**
  String get paymentBalance;

  /// Price summary: installment number and due date.
  ///
  /// In en, this message translates to:
  /// **'Installment {seq} due {date}'**
  String paymentInstallmentDueOn(int seq, String date);

  /// Payment screen empty state: cancelled booking.
  ///
  /// In en, this message translates to:
  /// **'This booking was cancelled'**
  String get paymentBookingCancelledTitle;

  /// Payment screen empty state: nothing due.
  ///
  /// In en, this message translates to:
  /// **'Nothing to pay right now'**
  String get paymentNothingDueTitle;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment screen: refunds of a cancelled booking.
  ///
  /// In en, this message translates to:
  /// **'Refunds, if any, are returned to the original payment method.'**
  String get paymentRefundOriginalMethod;

  /// Payment screen: nothing due. {number} is a booking number like HIG-B-2026-000001.
  ///
  /// In en, this message translates to:
  /// **'Booking {number} has no payment due. We will notify you when the next one is due.'**
  String paymentNothingDueBody(String number);

  /// Button: open the Trips tab.
  ///
  /// In en, this message translates to:
  /// **'Go to my trip'**
  String get paymentGoToTrip;

  /// Payment result title.
  ///
  /// In en, this message translates to:
  /// **'Payment successful'**
  String get paymentResultSuccessTitle;

  /// Payment result title: awaiting verification.
  ///
  /// In en, this message translates to:
  /// **'Payment submitted'**
  String get paymentResultPendingTitle;

  /// Payment result title.
  ///
  /// In en, this message translates to:
  /// **'Payment failed'**
  String get paymentResultFailureTitle;

  /// Payment result: success. {number} is the booking number.
  ///
  /// In en, this message translates to:
  /// **'Your booking {number} is updated. We have notified your coordinator.'**
  String paymentResultSuccessBody(String number);

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment result: pending verification.
  ///
  /// In en, this message translates to:
  /// **'We will confirm your booking as soon as the payment is verified. You will get a notification.'**
  String get paymentResultPendingBody;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Payment result: failure.
  ///
  /// In en, this message translates to:
  /// **'No money was taken. Please try again or choose another method.'**
  String get paymentResultFailureBody;

  /// Payment result row label.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get paymentResultAmount;

  /// Payment result row label: payment order number.
  ///
  /// In en, this message translates to:
  /// **'Order'**
  String get paymentResultOrder;

  /// Row label / section title: the treatment booking.
  ///
  /// In en, this message translates to:
  /// **'Booking'**
  String get bookingLabel;

  /// Payment result row label: payment date.
  ///
  /// In en, this message translates to:
  /// **'Paid on'**
  String get paymentResultPaidOn;

  /// Payment result row label.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get paymentResultStatus;

  /// Button: download the payment receipt PDF.
  ///
  /// In en, this message translates to:
  /// **'Download receipt'**
  String get paymentDownloadReceipt;

  /// Button after a failed payment: open messages.
  ///
  /// In en, this message translates to:
  /// **'Get help'**
  String get paymentGetHelp;

  /// Button: open the medical case page.
  ///
  /// In en, this message translates to:
  /// **'View case'**
  String get caseViewCase;

  /// Snack bar: receipt not generated yet.
  ///
  /// In en, this message translates to:
  /// **'Your receipt is being prepared. It will appear under Documents shortly.'**
  String get paymentReceiptPreparing;

  /// Snack bar: receipt downloaded.
  ///
  /// In en, this message translates to:
  /// **'Receipt saved'**
  String get paymentReceiptSaved;

  /// Bank transfer screen empty state.
  ///
  /// In en, this message translates to:
  /// **'Bank transfer is not available'**
  String get bankTransferUnavailableTitle;

  /// Bank transfer screen empty state.
  ///
  /// In en, this message translates to:
  /// **'Please choose another payment method.'**
  String get bankTransferUnavailableBody;

  /// Bank transfer: label above the amount.
  ///
  /// In en, this message translates to:
  /// **'Amount to transfer'**
  String get bankTransferAmount;

  /// Bank transfer: payment order number.
  ///
  /// In en, this message translates to:
  /// **'Order {number}'**
  String bankTransferOrder(String number);

  /// Bank detail label: account holder receiving the transfer.
  ///
  /// In en, this message translates to:
  /// **'Beneficiary'**
  String get bankBeneficiary;

  /// Bank detail label: bank name.
  ///
  /// In en, this message translates to:
  /// **'Bank'**
  String get bankName;

  /// Bank detail label.
  ///
  /// In en, this message translates to:
  /// **'Account number'**
  String get bankAccountNumber;

  /// Bank detail label: reference the patient must quote on the transfer.
  ///
  /// In en, this message translates to:
  /// **'Payment reference'**
  String get bankPaymentReference;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Bank transfer instructions.
  ///
  /// In en, this message translates to:
  /// **'Quote the payment reference exactly so we can match your transfer. International transfers usually take 1-3 business days; your booking is confirmed once our finance team verifies the funds.'**
  String get bankTransferInstructions;

  /// Bank transfer: section to upload the transfer receipt.
  ///
  /// In en, this message translates to:
  /// **'Proof of transfer'**
  String get bankProofSection;

  /// Button: replace the uploaded proof file.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get bankProofReplace;

  /// Button: upload the bank transfer receipt.
  ///
  /// In en, this message translates to:
  /// **'Upload transfer receipt'**
  String get bankProofUpload;

  /// Text field label. Keep UTR / MT103 (bank reference formats) as is.
  ///
  /// In en, this message translates to:
  /// **'Bank transaction reference (UTR / MT103)'**
  String get bankReferenceLabel;

  /// Validation error: reference missing / too short.
  ///
  /// In en, this message translates to:
  /// **'Enter the reference from your bank'**
  String get bankReferenceRequired;

  /// Button: send the transfer proof.
  ///
  /// In en, this message translates to:
  /// **'Submit proof'**
  String get bankSubmitProof;

  /// Button: leave without uploading the proof.
  ///
  /// In en, this message translates to:
  /// **'I\'ll upload the proof later'**
  String get bankUploadLater;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Message after the transfer proof was submitted.
  ///
  /// In en, this message translates to:
  /// **'Thanks! We received your transfer details. Your booking is confirmed once the funds arrive (usually 1-3 business days).'**
  String get bankProofReceived;

  /// Tooltip of the copy button next to a bank detail. {label} is e.g. "Account number".
  ///
  /// In en, this message translates to:
  /// **'Copy {label}'**
  String bankCopyTooltip(String label);

  /// Snack bar after copying a bank detail. {label} is e.g. "Account number".
  ///
  /// In en, this message translates to:
  /// **'{label} copied'**
  String bankCopied(String label);

  /// Card payment error.
  ///
  /// In en, this message translates to:
  /// **'The payment response was incomplete. Please contact support.'**
  String get paymentResponseIncomplete;

  /// Snack bar: the user closed the card checkout.
  ///
  /// In en, this message translates to:
  /// **'Payment cancelled.'**
  String get paymentCancelled;

  /// Card payment error (generic).
  ///
  /// In en, this message translates to:
  /// **'The payment could not be completed.'**
  String get paymentNotCompleted;

  /// Generic wallet name used inside "Complete the payment in {wallet}." when the wallet app is unknown.
  ///
  /// In en, this message translates to:
  /// **'wallet'**
  String get paymentWalletFallback;

  /// Card payment error.
  ///
  /// In en, this message translates to:
  /// **'Card payments are not available on this device.'**
  String get paymentCardsUnavailableOnDevice;

  /// Booking screen title: choose the admission date.
  ///
  /// In en, this message translates to:
  /// **'Select Dates'**
  String get bookSelectDatesTitle;

  /// Booking screen: case can no longer be booked. {status} is the lower-case case status (e.g. "cancelled").
  ///
  /// In en, this message translates to:
  /// **'This case is {status}'**
  String bookCaseClosedTitle(String status);

  /// Booking screen: closed case hint.
  ///
  /// In en, this message translates to:
  /// **'Open a new enquiry to book treatment.'**
  String get bookCaseClosedBody;

  /// Booking screen main button.
  ///
  /// In en, this message translates to:
  /// **'Proceed to Payment'**
  String get bookProceedToPayment;

  /// Label before the duration (keep the trailing space).
  ///
  /// In en, this message translates to:
  /// **'Treatment duration: '**
  String get bookTreatmentDurationLabel;

  /// Treatment duration value when unknown.
  ///
  /// In en, this message translates to:
  /// **'confirmed by the hospital'**
  String get bookDurationConfirmedByHospital;

  /// Treatment duration value. {duration} is e.g. "5-7 days".
  ///
  /// In en, this message translates to:
  /// **'{duration} required'**
  String bookDurationRequired(String duration);

  /// Selected admission date. {date} is weekday, date and year.
  ///
  /// In en, this message translates to:
  /// **'Admission on {date}'**
  String bookAdmissionOn(String date);

  /// Booking screen section title.
  ///
  /// In en, this message translates to:
  /// **'Select Package'**
  String get bookSelectPackage;

  /// Option card: book with the accepted hospital quote.
  ///
  /// In en, this message translates to:
  /// **'Accepted hospital quote'**
  String get bookAcceptedQuote;

  /// Length of stay of a quote (e.g. "7 days stay").
  ///
  /// In en, this message translates to:
  /// **'{days, plural, other{{days} days stay}}'**
  String bookingStayDaysLabel(int days);

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Quote validity date (lower case, shown after other facts).
  ///
  /// In en, this message translates to:
  /// **'valid until {date}'**
  String bookingValidUntil(String date);

  /// Number of line items in a quote.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} itemized charges}}'**
  String bookItemizedCharges(int count);

  /// Booking screen: no packages available.
  ///
  /// In en, this message translates to:
  /// **'This hospital has not published packages for this treatment yet. Ask for a personalised quote from your case page.'**
  String get bookNoPackages;

  /// Booking screen section title.
  ///
  /// In en, this message translates to:
  /// **'Payment Option'**
  String get bookPaymentOptionSection;

  /// Insurance checkbox subtitle.
  ///
  /// In en, this message translates to:
  /// **'Our team will help you with the claim paperwork.'**
  String get bookInsuranceHelp;

  /// Calendar legend: day can be booked.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get bookLegendAvailable;

  /// Calendar legend: chosen day.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get bookLegendSelected;

  /// Calendar legend: day is full.
  ///
  /// In en, this message translates to:
  /// **'Unavailable'**
  String get bookLegendUnavailable;

  /// Calendar legend: day is in the past.
  ///
  /// In en, this message translates to:
  /// **'Past'**
  String get bookLegendPast;

  /// Package tier description.
  ///
  /// In en, this message translates to:
  /// **'Core treatment package'**
  String get bookPackageMedicalOnly;

  /// Package tier description.
  ///
  /// In en, this message translates to:
  /// **'Treatment + accommodation'**
  String get bookPackageMedicalStay;

  /// Package tier description.
  ///
  /// In en, this message translates to:
  /// **'Treatment, stay, transfers & translator'**
  String get bookPackageAllInclusive;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Approximate monthly installment. {amount} is a formatted amount with currency.
  ///
  /// In en, this message translates to:
  /// **'≈ {amount} / month before fees'**
  String bookInstallmentPerMonth(String amount);

  /// Payment option: one payment for everything.
  ///
  /// In en, this message translates to:
  /// **'Pay in full'**
  String get bookingPayInFull;

  /// Payment option subtitle.
  ///
  /// In en, this message translates to:
  /// **'One payment for the whole treatment'**
  String get bookPayInFullSubtitle;

  /// Payment option: pay a deposit first.
  ///
  /// In en, this message translates to:
  /// **'Pay a deposit now'**
  String get bookPayDeposit;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Deposit option subtitle.
  ///
  /// In en, this message translates to:
  /// **'Secure your date; the balance is due before admission'**
  String get bookPayDepositSubtitle;

  /// Payment option: monthly installments.
  ///
  /// In en, this message translates to:
  /// **'Monthly installments'**
  String get bookMonthlyInstallments;

  /// Installment option subtitle.
  ///
  /// In en, this message translates to:
  /// **'3, 6 or 12 months'**
  String get bookInstallmentChoices;

  /// Chip: number of months of the installment plan (3, 6 or 12).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} months}}'**
  String bookMonths(int count);

  /// Prefix before a savings amount on a package ("Save $500"); keep the trailing space.
  ///
  /// In en, this message translates to:
  /// **'Save '**
  String get bookSavePrefix;

  /// Booking screen: the case already has an active booking.
  ///
  /// In en, this message translates to:
  /// **'This case already has a booking. Continue with it, or cancel it from the case page to choose new dates.'**
  String get bookExistingBookingBody;

  /// Button: pay an existing booking.
  ///
  /// In en, this message translates to:
  /// **'Continue to payment'**
  String get bookContinueToPayment;

  /// Calendar tooltip.
  ///
  /// In en, this message translates to:
  /// **'Previous month'**
  String get bookCalendarPreviousMonth;

  /// Calendar tooltip.
  ///
  /// In en, this message translates to:
  /// **'Next month'**
  String get bookCalendarNextMonth;

  /// Screen-reader label of a calendar day. {date} is a formatted date; {state} is selected / available / unavailable.
  ///
  /// In en, this message translates to:
  /// **'{date}, {state, select, selected{selected} available{available} other{unavailable}}'**
  String bookCalendarDaySemantics(String date, String state);

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Hide doctor details'**
  String get bookDoctorHideDetails;

  /// Tooltip.
  ///
  /// In en, this message translates to:
  /// **'Show doctor details'**
  String get bookDoctorShowDetails;

  /// Doctor's years of experience.
  ///
  /// In en, this message translates to:
  /// **'{years, plural, other{{years} years of experience}}'**
  String bookDoctorExperience(int years);

  /// Doctor's languages, comma-separated.
  ///
  /// In en, this message translates to:
  /// **'Speaks {languages}'**
  String bookDoctorSpeaks(String languages);

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Cardiologist'**
  String get bookProfessionCardiologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Orthopedic Surgeon'**
  String get bookProfessionOrthopedicSurgeon;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Oncologist'**
  String get bookProfessionOncologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Neurologist'**
  String get bookProfessionNeurologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Dentist'**
  String get bookProfessionDentist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Urologist'**
  String get bookProfessionUrologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Nephrologist'**
  String get bookProfessionNephrologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Gastroenterologist'**
  String get bookProfessionGastroenterologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Ophthalmologist'**
  String get bookProfessionOphthalmologist;

  /// Doctor card heading: profession derived from the specialty.
  ///
  /// In en, this message translates to:
  /// **'Dermatologist'**
  String get bookProfessionDermatologist;

  /// Title of the patient's list of medical cases; also a button.
  ///
  /// In en, this message translates to:
  /// **'My cases'**
  String get casesTitle;

  /// Filter chip: show everything.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get caseFilterAll;

  /// Cases list empty state.
  ///
  /// In en, this message translates to:
  /// **'No cases yet'**
  String get casesEmptyTitle;

  /// Cases list empty state with a filter. {status} is the lower-case status.
  ///
  /// In en, this message translates to:
  /// **'No {status} cases'**
  String casesEmptyFilteredTitle(String status);

  /// Cases list empty state.
  ///
  /// In en, this message translates to:
  /// **'Request a quote from a matched hospital to start a case.'**
  String get casesEmptyBody;

  /// Button: start the treatment screening.
  ///
  /// In en, this message translates to:
  /// **'Find my treatment'**
  String get caseFindMyTreatment;

  /// Cases list footer.
  ///
  /// In en, this message translates to:
  /// **'Showing {shown} of {total}. Use the filters to narrow the list.'**
  String casesShowingCount(int shown, int total);

  /// Case detail app bar title while loading.
  ///
  /// In en, this message translates to:
  /// **'Case'**
  String get caseTitleFallback;

  /// Tooltip of the chat button.
  ///
  /// In en, this message translates to:
  /// **'Message about this case'**
  String get caseMessageTooltip;

  /// Case detail section title: hospital price quotes.
  ///
  /// In en, this message translates to:
  /// **'Quotes'**
  String get caseQuotesSection;

  /// Case detail: waiting for the quote.
  ///
  /// In en, this message translates to:
  /// **'The hospital is reviewing your case. You will be notified when the itemized quote arrives (usually within 48 hours).'**
  String get caseQuotePending;

  /// Case detail: no quotes.
  ///
  /// In en, this message translates to:
  /// **'No quotes on this case.'**
  String get caseNoQuotes;

  /// Case detail button.
  ///
  /// In en, this message translates to:
  /// **'Book a fixed-price package instead'**
  String get caseBookPackageInstead;

  /// Case detail section title.
  ///
  /// In en, this message translates to:
  /// **'Medical summary'**
  String get caseMedicalSummary;

  /// Case detail section title.
  ///
  /// In en, this message translates to:
  /// **'Your notes'**
  String get caseYourNotes;

  /// Documents screen title / section title.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get documentsTitle;

  /// Section action: open the documents screen.
  ///
  /// In en, this message translates to:
  /// **'Manage'**
  String get caseDocumentsManage;

  /// Case detail: no documents.
  ///
  /// In en, this message translates to:
  /// **'Upload reports, scans and your passport so the hospital can prepare.'**
  String get caseDocumentsEmpty;

  /// Case detail section title.
  ///
  /// In en, this message translates to:
  /// **'Status timeline'**
  String get caseStatusTimeline;

  /// Case detail button.
  ///
  /// In en, this message translates to:
  /// **'Message the care team'**
  String get caseMessageCareTeam;

  /// Case detail button.
  ///
  /// In en, this message translates to:
  /// **'Cancel this case'**
  String get caseCancelThisCase;

  /// Case header line: care coordinator name.
  ///
  /// In en, this message translates to:
  /// **'Coordinator: {name}'**
  String caseCoordinator(String name);

  /// Case header line: referring agency name.
  ///
  /// In en, this message translates to:
  /// **'Agent: {name}'**
  String caseAgent(String name);

  /// Case header line: creation date.
  ///
  /// In en, this message translates to:
  /// **'Opened {date}'**
  String caseOpenedOn(String date);

  /// Booking card row label.
  ///
  /// In en, this message translates to:
  /// **'Package'**
  String get caseBookingPackage;

  /// Booking card row label: admission date.
  ///
  /// In en, this message translates to:
  /// **'Admission'**
  String get caseBookingAdmission;

  /// Booking card row label.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get caseBookingDuration;

  /// Booking card: duration in days.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, other{{days} days}}'**
  String caseDurationDays(int days);

  /// Booking card row label.
  ///
  /// In en, this message translates to:
  /// **'Payment plan'**
  String get caseBookingPaymentPlan;

  /// Booking card row label: amount paid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get caseBookingPaid;

  /// Booking card: insurance claim requested.
  ///
  /// In en, this message translates to:
  /// **'Claim requested'**
  String get caseClaimRequested;

  /// Button: pay to confirm a pending booking.
  ///
  /// In en, this message translates to:
  /// **'Pay to confirm'**
  String get casePayToConfirm;

  /// Button: pay the remaining balance.
  ///
  /// In en, this message translates to:
  /// **'Pay balance'**
  String get casePayBalance;

  /// Title / button: visa and travel arrangements.
  ///
  /// In en, this message translates to:
  /// **'Visa & Travel'**
  String get travelVisaAndTravel;

  /// Button: cancel the treatment booking.
  ///
  /// In en, this message translates to:
  /// **'Cancel booking'**
  String get caseCancelBooking;

  /// Payment plan label.
  ///
  /// In en, this message translates to:
  /// **'Deposit + balance'**
  String get caseDepositPlusBalance;

  /// Payment plan label.
  ///
  /// In en, this message translates to:
  /// **'{months, plural, other{{months} monthly installments}}'**
  String caseMonthlyInstallments(int months);

  /// Payment plan label when the number of months is unknown.
  ///
  /// In en, this message translates to:
  /// **'monthly installments'**
  String get caseMonthlyInstallmentsNoCount;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Accept this quote?'**
  String get caseAcceptQuoteTitle;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Accept quote dialog body.
  ///
  /// In en, this message translates to:
  /// **'The hospital will reserve your treatment plan. Next you choose your admission date and pay the deposit.'**
  String get caseAcceptQuoteBody;

  /// Dialog button: do not accept now.
  ///
  /// In en, this message translates to:
  /// **'Not yet'**
  String get caseNotYet;

  /// Dialog button: accept the quote.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get caseAccept;

  /// Snack bar.
  ///
  /// In en, this message translates to:
  /// **'Quote accepted'**
  String get caseQuoteAccepted;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Decline this quote?'**
  String get caseDeclineQuoteTitle;

  /// Button: decline a quote.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get caseDecline;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Cancel booking?'**
  String get caseCancelBookingTitle;

  /// Text field label: reason for cancelling (required).
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get caseReason;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Cancel booking dialog.
  ///
  /// In en, this message translates to:
  /// **'Refunds follow the cancellation policy: the earlier you cancel before admission, the more is refunded.'**
  String get caseCancelBookingPolicy;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Snack bar after cancelling a booking.
  ///
  /// In en, this message translates to:
  /// **'Booking cancelled. Any refund is returned to your original payment method.'**
  String get caseBookingCancelled;

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Cancel this case?'**
  String get caseCancelCaseTitle;

  /// Dialog button.
  ///
  /// In en, this message translates to:
  /// **'Cancel case'**
  String get caseCancelCase;

  /// Case next-step hint.
  ///
  /// In en, this message translates to:
  /// **'Payment needed to confirm your booking'**
  String get caseNextPaymentNeeded;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Case next-step hint.
  ///
  /// In en, this message translates to:
  /// **'Balance due before admission'**
  String get caseNextBalanceDue;

  /// Case next-step hint.
  ///
  /// In en, this message translates to:
  /// **'Waiting for the hospital quote'**
  String get caseNextWaitingForQuote;

  /// Case next-step hint.
  ///
  /// In en, this message translates to:
  /// **'Review your quote'**
  String get caseNextReviewQuote;

  /// Case next-step hint.
  ///
  /// In en, this message translates to:
  /// **'Choose your admission date'**
  String get caseNextChooseDate;

  /// Quote card title.
  ///
  /// In en, this message translates to:
  /// **'Hospital quote'**
  String get caseHospitalQuote;

  /// Quote card: who prepared the quote.
  ///
  /// In en, this message translates to:
  /// **'By {name}'**
  String caseQuoteBy(String name);

  /// Quote card total row with stay length.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, other{Total · {days} days stay}}'**
  String caseQuoteTotalStay(int days);

  /// Quote card button.
  ///
  /// In en, this message translates to:
  /// **'Accept quote'**
  String get caseAcceptQuote;

  /// Quote card button.
  ///
  /// In en, this message translates to:
  /// **'Choose admission date'**
  String get caseChooseAdmissionDate;

  /// Text field label in the reason dialog.
  ///
  /// In en, this message translates to:
  /// **'Reason (optional)'**
  String get caseReasonOptional;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Refund policy tier: cancelling less than N days before admission.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, other{Less than {days} days before admission}}'**
  String refundTierLessThanDays(int days);

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Refund policy tier: cancelling N or more days before admission.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, other{{days}+ days before admission}}'**
  String refundTierDaysOrMore(int days);

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Refund policy tier result (lower case).
  ///
  /// In en, this message translates to:
  /// **'no refund'**
  String get refundNone;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Refund policy tier result: percentage refunded (lower case).
  ///
  /// In en, this message translates to:
  /// **'{pct}% refund'**
  String refundPercent(int pct);

  /// Refund policy tier line: condition and result.
  ///
  /// In en, this message translates to:
  /// **'{when}: {refund}'**
  String refundTierLine(String when, String refund);

  /// Refund policy card title.
  ///
  /// In en, this message translates to:
  /// **'Cancellation & refunds'**
  String get refundPolicyTitle;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Refund policy card when no tiers are locked in yet.
  ///
  /// In en, this message translates to:
  /// **'The cancellation policy in force when your booking is confirmed applies: the earlier you cancel before admission, the more is refunded.'**
  String get refundPolicyGeneral;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Refund policy card under the locked tiers. Keep "Heal India Global" in Latin script.
  ///
  /// In en, this message translates to:
  /// **'Locked in for this booking. If the hospital or Heal India Global cancels, you get a full refund.'**
  String get refundPolicyLocked;

  /// Progress line while a file uploads. {name} is the file name.
  ///
  /// In en, this message translates to:
  /// **'Uploading {name}'**
  String documentsUploading(String name);

  /// Documents empty state.
  ///
  /// In en, this message translates to:
  /// **'No documents yet'**
  String get documentsEmptyTitle;

  /// Documents empty state. Keep the file formats as is.
  ///
  /// In en, this message translates to:
  /// **'Upload your passport, medical reports, scans and prescriptions. PDF, JPG, PNG, WEBP, HEIC or DICOM up to 20 MB.'**
  String get documentsEmptyBody;

  /// Documents empty state button.
  ///
  /// In en, this message translates to:
  /// **'Upload a document'**
  String get documentsUploadADocument;

  /// Documents privacy note.
  ///
  /// In en, this message translates to:
  /// **'Shared only with your care team and the hospital on your case.'**
  String get documentsSharedNote;

  /// Snack bar after an upload. {name} is the file name.
  ///
  /// In en, this message translates to:
  /// **'{name} uploaded'**
  String documentsUploaded(String name);

  /// Dialog title.
  ///
  /// In en, this message translates to:
  /// **'Delete document?'**
  String get documentsDeleteTitle;

  /// Delete dialog body. {name} is the file name.
  ///
  /// In en, this message translates to:
  /// **'{name} will be removed for you and your care team.'**
  String documentsDeleteBody(String name);

  /// Dialog button: do not delete.
  ///
  /// In en, this message translates to:
  /// **'Keep'**
  String get documentsKeep;

  /// Tooltip of the document menu.
  ///
  /// In en, this message translates to:
  /// **'Document actions'**
  String get documentsActionsTooltip;

  /// Upload error.
  ///
  /// In en, this message translates to:
  /// **'File is too large (max 20 MB).'**
  String get documentsFileTooLarge;

  /// Snack bar after saving a file. {name} is the file name.
  ///
  /// In en, this message translates to:
  /// **'Saved {name}'**
  String documentsSaved(String name);

  /// Image preview error.
  ///
  /// In en, this message translates to:
  /// **'This image format cannot be previewed. Use Download instead.'**
  String get documentsPreviewUnavailable;

  /// Sheet title: choose the document type.
  ///
  /// In en, this message translates to:
  /// **'What are you uploading?'**
  String get documentsWhatAreYouUploading;

  /// Guide screen title / quick action.
  ///
  /// In en, this message translates to:
  /// **'Pre-arrival Guide'**
  String get preArrivalTitle;

  /// Guide section title.
  ///
  /// In en, this message translates to:
  /// **'Visa & documents'**
  String get preArrivalVisaTitle;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Passport valid for at least 6 months, with two blank pages.'**
  String get preArrivalVisaPassport;

  /// Guide checklist item. Keep the visa type names "e-Medical" / "e-Medical Attendant" in Latin script.
  ///
  /// In en, this message translates to:
  /// **'Indian e-Medical visa (and e-Medical Attendant visa for companions) - we send the hospital invitation letter.'**
  String get preArrivalVisaEMedical;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Printed copies of your visa, invitation letter, booking confirmation and medical reports.'**
  String get preArrivalVisaCopies;

  /// Guide section title.
  ///
  /// In en, this message translates to:
  /// **'Medical records'**
  String get preArrivalMedicalTitle;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Recent scans, lab results and prescriptions - upload them in Documents so your doctor can review them.'**
  String get preArrivalMedicalReports;

  /// Guide checklist item (medical advice: keep the meaning exact).
  ///
  /// In en, this message translates to:
  /// **'A list of current medicines with doses; bring enough for the whole trip.'**
  String get preArrivalMedicalMedicines;

  /// Guide checklist item. Keep "in English": Indian hospitals need the information in English.
  ///
  /// In en, this message translates to:
  /// **'Allergies and previous surgeries written down in English.'**
  String get preArrivalMedicalAllergies;

  /// Guide section title.
  ///
  /// In en, this message translates to:
  /// **'What to pack'**
  String get preArrivalPackTitle;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Loose, comfortable clothing for after treatment.'**
  String get preArrivalPackClothing;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Universal power adapter (India uses type C, D and M plugs, 230 V).'**
  String get preArrivalPackAdapter;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'A light jacket - hospitals and flights are air-conditioned.'**
  String get preArrivalPackJacket;

  /// Guide section title.
  ///
  /// In en, this message translates to:
  /// **'Money'**
  String get preArrivalMoneyTitle;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Cards are accepted at hospitals and hotels; keep some rupees for taxis and small shops.'**
  String get preArrivalMoneyCards;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Tell your bank you are travelling to India so cards are not blocked.'**
  String get preArrivalMoneyTellBank;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Keep your payment receipts in the app under Documents.'**
  String get preArrivalMoneyReceipts;

  /// Guide section title.
  ///
  /// In en, this message translates to:
  /// **'Arrival day'**
  String get preArrivalArrivalTitle;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Share your flight details so we can arrange the airport pickup.'**
  String get preArrivalArrivalFlight;

  /// Guide checklist item. Keep "Heal India Global" in Latin script.
  ///
  /// In en, this message translates to:
  /// **'Your driver waits at arrivals with a Heal India Global sign.'**
  String get preArrivalArrivalDriver;

  /// Guide checklist item.
  ///
  /// In en, this message translates to:
  /// **'Save the 24/7 helpline number before you fly.'**
  String get preArrivalArrivalHelpline;

  /// Guide section title.
  ///
  /// In en, this message translates to:
  /// **'Cultural tips'**
  String get preArrivalCulturalTips;

  /// Guide: no cultural tips yet.
  ///
  /// In en, this message translates to:
  /// **'Tips will appear here soon.'**
  String get preArrivalTipsSoon;

  /// Medical disclaimer at the end of the guide: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'General travel information only - always follow your doctor\'s instructions.'**
  String get preArrivalDisclaimer;

  /// Snack bar when the device cannot place calls.
  ///
  /// In en, this message translates to:
  /// **'Call {number} from your phone.'**
  String journeyCallFromPhone(String number);

  /// Snack bar when WhatsApp cannot be opened. Keep "WhatsApp".
  ///
  /// In en, this message translates to:
  /// **'WhatsApp {number} from your phone.'**
  String journeyWhatsAppFromPhone(String number);

  /// Subject of a new chat with the care coordinator.
  ///
  /// In en, this message translates to:
  /// **'My care coordinator'**
  String get journeyCoordinatorChatSubject;

  /// Emergency contacts sheet title.
  ///
  /// In en, this message translates to:
  /// **'Emergency Contacts'**
  String get emergencyContactsTitle;

  /// Emergency guidance: keep the meaning exact (call local emergency services first).
  ///
  /// In en, this message translates to:
  /// **'In a medical emergency in India call the local emergency number first.'**
  String get emergencyContactsIntro;

  /// Contact row: national emergency number.
  ///
  /// In en, this message translates to:
  /// **'Emergency services (India)'**
  String get emergencyContactsServicesIndia;

  /// Contact row. Keep "Heal India Global" in Latin script.
  ///
  /// In en, this message translates to:
  /// **'Heal India Global 24/7 helpline'**
  String get emergencyContactsHelpline;

  /// Contact row. Keep "WhatsApp".
  ///
  /// In en, this message translates to:
  /// **'WhatsApp support'**
  String get emergencyContactsWhatsApp;

  /// Contact row: the care coordinator.
  ///
  /// In en, this message translates to:
  /// **'Coordinator - {name}'**
  String emergencyContactsCoordinator(String name);

  /// Contact row: the patient's own emergency contact (when unnamed).
  ///
  /// In en, this message translates to:
  /// **'My emergency contact'**
  String get emergencyContactsMine;

  /// Snack bar after a travel request.
  ///
  /// In en, this message translates to:
  /// **'Request sent. Our travel desk will get back to you.'**
  String get travelRequestSent;

  /// Travel screen section title.
  ///
  /// In en, this message translates to:
  /// **'Medical visa'**
  String get visaSectionTitle;

  /// Travel screen: no visa request yet. Keep "e-Medical".
  ///
  /// In en, this message translates to:
  /// **'Most international patients need an Indian e-Medical visa. We provide the hospital invitation letter and help you apply.'**
  String get visaEmptyText;

  /// Button: ask for visa help.
  ///
  /// In en, this message translates to:
  /// **'Request visa assistance'**
  String get visaRequestAssistance;

  /// Travel screen section title.
  ///
  /// In en, this message translates to:
  /// **'Flights & airport transfers'**
  String get flightSectionTitle;

  /// Travel screen: empty flights list.
  ///
  /// In en, this message translates to:
  /// **'No flight or transfer requests yet.'**
  String get flightNoRequests;

  /// Chip: request a flight.
  ///
  /// In en, this message translates to:
  /// **'Request flight'**
  String get flightRequestChip;

  /// Chip / sheet title: pickup at the airport on arrival.
  ///
  /// In en, this message translates to:
  /// **'Airport pickup'**
  String get travelAirportPickup;

  /// Chip / sheet title: drive to the airport for departure.
  ///
  /// In en, this message translates to:
  /// **'Airport drop'**
  String get travelAirportDrop;

  /// Travel screen section title / fallback stay name.
  ///
  /// In en, this message translates to:
  /// **'Accommodation'**
  String get stayAccommodation;

  /// Travel screen: no stays yet.
  ///
  /// In en, this message translates to:
  /// **'Hotels, guest houses and service apartments close to your hospital.'**
  String get stayEmptyText;

  /// Button / sheet title.
  ///
  /// In en, this message translates to:
  /// **'Request accommodation'**
  String get stayRequestAccommodation;

  /// Button.
  ///
  /// In en, this message translates to:
  /// **'Request another stay'**
  String get stayRequestAnother;

  /// Travel screen section title.
  ///
  /// In en, this message translates to:
  /// **'Local services'**
  String get travelLocalServices;

  /// Chip: request a translator.
  ///
  /// In en, this message translates to:
  /// **'Translator'**
  String get travelTranslator;

  /// Chip: request a local guide.
  ///
  /// In en, this message translates to:
  /// **'Local guide'**
  String get travelLocalGuide;

  /// Chip: request local transport.
  ///
  /// In en, this message translates to:
  /// **'Transport'**
  String get travelTransport;

  /// Visa status hint.
  ///
  /// In en, this message translates to:
  /// **'We have your request and will list the documents you need.'**
  String get visaHintNotStarted;

  /// Visa status hint.
  ///
  /// In en, this message translates to:
  /// **'Upload your passport and medical reports in Documents.'**
  String get visaHintDocumentsPending;

  /// Visa status hint. Keep the website address.
  ///
  /// In en, this message translates to:
  /// **'Your invitation letter is ready. Apply at indianvisaonline.gov.in.'**
  String get visaHintInvitationIssued;

  /// Visa status hint.
  ///
  /// In en, this message translates to:
  /// **'Application submitted. Decisions usually take 3-5 working days.'**
  String get visaHintApplied;

  /// Visa status hint.
  ///
  /// In en, this message translates to:
  /// **'Visa approved. Carry a printed copy when you travel.'**
  String get visaHintApproved;

  /// Visa status hint.
  ///
  /// In en, this message translates to:
  /// **'The application was not approved. Your coordinator will contact you.'**
  String get visaHintRejected;

  /// Visa card: application reference number.
  ///
  /// In en, this message translates to:
  /// **'Application ref: {ref}'**
  String visaApplicationRef(String ref);

  /// Button: open the hospital invitation letter.
  ///
  /// In en, this message translates to:
  /// **'Invitation letter'**
  String get visaInvitationLetter;

  /// Separator between origin and destination ("Delhi → Mumbai"). Mirror the arrow for right-to-left languages.
  ///
  /// In en, this message translates to:
  /// **' → '**
  String get travelRouteArrow;

  /// Flight booking reference (airline PNR code). Usually keep "PNR".
  ///
  /// In en, this message translates to:
  /// **'PNR {pnr}'**
  String flightPnr(String pnr);

  /// Number of guests of a stay.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} guest} other{{count} guests}}'**
  String stayGuestCount(int count);

  /// Short label: hotel confirmation code.
  ///
  /// In en, this message translates to:
  /// **'Conf. {code}'**
  String stayConfirmationCode(String code);

  /// Trips dashboard section title.
  ///
  /// In en, this message translates to:
  /// **'Your Checklist'**
  String get checklistTitle;

  /// Trips dashboard section title.
  ///
  /// In en, this message translates to:
  /// **'Today\'s Schedule'**
  String get tripsTodaySchedule;

  /// Trips dashboard section title.
  ///
  /// In en, this message translates to:
  /// **'Quick Actions'**
  String get tripsQuickActions;

  /// Quick action tile (short).
  ///
  /// In en, this message translates to:
  /// **'Upload Documents'**
  String get tripsUploadDocuments;

  /// Quick action tile on two lines (keep the line break).
  ///
  /// In en, this message translates to:
  /// **'Chat with\nCoordinator'**
  String get tripsChatWithCoordinator;

  /// Quick action tile on two lines (keep the line break).
  ///
  /// In en, this message translates to:
  /// **'Emergency\nContacts'**
  String get tripsEmergencyContacts;

  /// Trips dashboard section title.
  ///
  /// In en, this message translates to:
  /// **'Your Journey'**
  String get journeySectionTitle;

  /// Link card subtitle.
  ///
  /// In en, this message translates to:
  /// **'Visa, flights, airport pickup, stay, translator'**
  String get tripsTravelSubtitle;

  /// Link card title: support while in India.
  ///
  /// In en, this message translates to:
  /// **'In-Country Support'**
  String get tripsSupportTitle;

  /// Link card subtitle. Keep "SOS".
  ///
  /// In en, this message translates to:
  /// **'Map, schedule, helpline, translator, SOS'**
  String get tripsSupportSubtitle;

  /// Link card title.
  ///
  /// In en, this message translates to:
  /// **'My Cases'**
  String get tripsMyCases;

  /// Link card subtitle: open cases.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} active case} other{{count} active cases}}'**
  String tripsActiveCases(int count);

  /// Link card title.
  ///
  /// In en, this message translates to:
  /// **'Your coordinator: {name}'**
  String tripsYourCoordinator(String name);

  /// Link card subtitle.
  ///
  /// In en, this message translates to:
  /// **'Message them any time'**
  String get tripsMessageAnyTime;

  /// Unit next to the big countdown number (number shown separately).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{day} other{days}}'**
  String tripsCountdownUnit(int count);

  /// Countdown: treatment starts today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get tripsCountdownToday;

  /// Countdown: treatment completed.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get tripsCountdownDone;

  /// Countdown: treatment under way.
  ///
  /// In en, this message translates to:
  /// **'Now'**
  String get tripsCountdownNow;

  /// Countdown heading during treatment.
  ///
  /// In en, this message translates to:
  /// **'Treatment in progress'**
  String get tripsTreatmentInProgress;

  /// Countdown heading above the number of days.
  ///
  /// In en, this message translates to:
  /// **'Until Treatment'**
  String get tripsUntilTreatment;

  /// Screen-reader label of the countdown.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} days until treatment}}'**
  String tripsDaysUntilTreatment(int count);

  /// Balance card label for a pending booking.
  ///
  /// In en, this message translates to:
  /// **'Payment needed to confirm'**
  String get tripsPaymentNeeded;

  /// Balance card label.
  ///
  /// In en, this message translates to:
  /// **'Balance due'**
  String get tripsBalanceDue;

  /// Balance card button (short).
  ///
  /// In en, this message translates to:
  /// **'Pay now'**
  String get tripsPayNow;

  /// Trips dashboard empty state.
  ///
  /// In en, this message translates to:
  /// **'No upcoming treatment yet'**
  String get tripsNoTripTitle;

  /// Trips dashboard empty state. "AI" = artificial intelligence.
  ///
  /// In en, this message translates to:
  /// **'Find the right hospital with a free AI screening, or continue a case you started.'**
  String get tripsNoTripBody;

  /// Placeholder of an empty date / time picker field.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get travelSelect;

  /// Visa request sheet title.
  ///
  /// In en, this message translates to:
  /// **'Visa assistance'**
  String get visaAssistanceTitle;

  /// Visa request sheet subtitle. Keep "e-Medical".
  ///
  /// In en, this message translates to:
  /// **'We prepare the hospital invitation letter and guide you through the Indian e-Medical visa application.'**
  String get visaAssistanceSubtitle;

  /// Segment: visa for the patient.
  ///
  /// In en, this message translates to:
  /// **'Patient'**
  String get visaForPatient;

  /// Segment: visa for a companion / attendant.
  ///
  /// In en, this message translates to:
  /// **'Attendant'**
  String get visaForAttendant;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'Notes (nationality, travel dates, companions)'**
  String get visaNotesLabel;

  /// Prefilled pickup / drop location when the city is unknown.
  ///
  /// In en, this message translates to:
  /// **'Airport'**
  String get travelAirport;

  /// Prefilled pickup / drop location. {city} is a city name.
  ///
  /// In en, this message translates to:
  /// **'{city} airport'**
  String travelCityAirport(String city);

  /// Prefilled pickup / drop location.
  ///
  /// In en, this message translates to:
  /// **'Hospital / hotel'**
  String get travelHospitalOrHotel;

  /// Flight request sheet title.
  ///
  /// In en, this message translates to:
  /// **'Request a flight'**
  String get flightRequestTitle;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Flight request sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'Our travel desk sends you fare options; nothing is charged until you confirm.'**
  String get flightRequestSubtitle;

  /// Date field label.
  ///
  /// In en, this message translates to:
  /// **'Preferred departure'**
  String get flightPreferredDeparture;

  /// Sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'A driver meets you at arrivals and takes you to your hospital or hotel.'**
  String get travelPickupSubtitle;

  /// Date-time field label.
  ///
  /// In en, this message translates to:
  /// **'Arrival date & time'**
  String get travelArrivalDateTime;

  /// Sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'We take you to the airport for your flight home.'**
  String get travelDropSubtitle;

  /// Date-time field label.
  ///
  /// In en, this message translates to:
  /// **'Pickup time'**
  String get travelPickupTime;

  /// Sheet title.
  ///
  /// In en, this message translates to:
  /// **'Local transport'**
  String get travelLocalTransport;

  /// Sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'Car with driver for appointments in the city.'**
  String get travelLocalTransportSubtitle;

  /// Date-time field label: start time.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get travelStart;

  /// Sheet submit button.
  ///
  /// In en, this message translates to:
  /// **'Send request'**
  String get travelSendRequest;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'From (city or airport)'**
  String get flightFromCityOrAirport;

  /// Text field label: origin.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get travelFrom;

  /// Text field label: destination.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get travelTo;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'Flight number (optional)'**
  String get flightNumberOptional;

  /// Counter label.
  ///
  /// In en, this message translates to:
  /// **'Passengers'**
  String get travelPassengers;

  /// Tooltip of the minus button.
  ///
  /// In en, this message translates to:
  /// **'Fewer passengers'**
  String get travelFewerPassengers;

  /// Tooltip of the plus button.
  ///
  /// In en, this message translates to:
  /// **'More passengers'**
  String get travelMorePassengers;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'Notes (wheelchair, luggage, preferences)'**
  String get travelNotesLabel;

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Accommodation sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'Stays near your hospital. Our team confirms availability and price before booking.'**
  String get staySheetSubtitle;

  /// Accommodation sheet: no partner stays.
  ///
  /// In en, this message translates to:
  /// **'No partner stays are listed for this hospital yet. Ask your coordinator in Messages.'**
  String get stayNoPartners;

  /// Distance from the hospital. {km} is a formatted number like "1.5".
  ///
  /// In en, this message translates to:
  /// **'{km} km'**
  String stayDistanceKm(String km);

  /// Nightly rate. {amount} is a formatted amount with currency.
  ///
  /// In en, this message translates to:
  /// **'{amount}/night'**
  String stayPerNight(String amount);

  /// Date range field label.
  ///
  /// In en, this message translates to:
  /// **'Check-in - check-out'**
  String get stayCheckInOut;

  /// Counter label.
  ///
  /// In en, this message translates to:
  /// **'Guests'**
  String get stayGuests;

  /// Tooltip of the minus button.
  ///
  /// In en, this message translates to:
  /// **'Fewer guests'**
  String get stayFewerGuests;

  /// Tooltip of the plus button.
  ///
  /// In en, this message translates to:
  /// **'More guests'**
  String get stayMoreGuests;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'Notes (room type, accessibility, diet)'**
  String get stayNotesLabel;

  /// Sheet title.
  ///
  /// In en, this message translates to:
  /// **'Get a translator'**
  String get travelTranslatorTitle;

  /// Sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'A medical interpreter for consultations and hospital stays.'**
  String get travelTranslatorSubtitle;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'Language needed (e.g. Arabic, French)'**
  String get travelTranslatorNotes;

  /// Sheet title.
  ///
  /// In en, this message translates to:
  /// **'Book a local guide'**
  String get travelGuideTitle;

  /// Sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'A trusted guide for errands, shopping and sightseeing during recovery.'**
  String get travelGuideSubtitle;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'What would you like help with?'**
  String get travelGuideNotes;

  /// Sheet title. {service} is the lower-case service name (e.g. "transport").
  ///
  /// In en, this message translates to:
  /// **'Request {service}'**
  String travelServiceRequestTitle(String service);

  /// Payment/refund wording: translate faithfully, do not add or drop conditions. Sheet subtitle.
  ///
  /// In en, this message translates to:
  /// **'Our team confirms details and price with you.'**
  String get travelServiceSubtitle;

  /// Text field label.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get travelNotes;

  /// Date-time field label.
  ///
  /// In en, this message translates to:
  /// **'When do you need it?'**
  String get travelWhenNeeded;

  /// Label above provider chips.
  ///
  /// In en, this message translates to:
  /// **'Preferred provider (optional)'**
  String get travelPreferredProvider;

  /// Chip: no provider preference.
  ///
  /// In en, this message translates to:
  /// **'Any available'**
  String get travelAnyAvailable;

  /// Profile: settings group heading for the patient's cases, documents, companions, saved items.
  ///
  /// In en, this message translates to:
  /// **'My journey'**
  String get profileMyJourney;

  /// Profile row: opens the list of the patient's treatment cases and hospital quotes.
  ///
  /// In en, this message translates to:
  /// **'My cases & quotes'**
  String get profileMyCasesQuotes;

  /// Profile row: opens the patient's documents.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get profileDocuments;

  /// Profile row subtitle: kinds of documents stored.
  ///
  /// In en, this message translates to:
  /// **'Passport, medical reports, visas, invoices'**
  String get profileDocumentsSubtitle;

  /// Profile row and screen title: people travelling with the patient (medical attendants).
  ///
  /// In en, this message translates to:
  /// **'Travel companions'**
  String get companionsTitle;

  /// Profile row subtitle while the companions list is loading.
  ///
  /// In en, this message translates to:
  /// **'People travelling with you'**
  String get companionsSubtitleDefault;

  /// Profile row subtitle when no companion was added.
  ///
  /// In en, this message translates to:
  /// **'Add the people travelling with you'**
  String get companionsSubtitleEmpty;

  /// Profile row and screen title: bookmarked hospitals, doctors and treatments.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get savedTitle;

  /// Profile row subtitle for saved items.
  ///
  /// In en, this message translates to:
  /// **'Hospitals, doctors and treatments'**
  String get profileSavedSubtitle;

  /// Profile: settings group heading for legal links.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get profileAbout;

  /// Profile row: opens the terms of service web page.
  ///
  /// In en, this message translates to:
  /// **'Terms of service'**
  String get profileTermsOfService;

  /// Profile row: opens the privacy policy web page.
  ///
  /// In en, this message translates to:
  /// **'Privacy policy'**
  String get profilePrivacyPolicy;

  /// Snack bar after the account was deleted.
  ///
  /// In en, this message translates to:
  /// **'Your account has been deleted.'**
  String get deleteAccountDoneSnack;

  /// Profile header: name and badge of a user browsing without an account.
  ///
  /// In en, this message translates to:
  /// **'Guest'**
  String get profileGuest;

  /// Profile header badge: the account is a patient account.
  ///
  /// In en, this message translates to:
  /// **'Patient'**
  String get profilePatientBadge;

  /// Profile header badge: the email address is confirmed.
  ///
  /// In en, this message translates to:
  /// **'Email verified'**
  String get profileEmailVerified;

  /// Edit profile screen title and the profile header's edit button tooltip.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get editProfileTitle;

  /// Guest upgrade card heading on the profile tab.
  ///
  /// In en, this message translates to:
  /// **'Create your free account'**
  String get profileGuestUpgradeTitle;

  /// Guest upgrade card text: benefits of creating an account. 'Screenings' are the patient's health questionnaires; 'matches' are recommended hospitals.
  ///
  /// In en, this message translates to:
  /// **'Keep your screenings and matches, request quotes, book treatment, upload documents and chat with your coordinator.'**
  String get profileGuestUpgradeBody;

  /// Button on the guest upgrade card: opens registration.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get profileCreateAccount;

  /// Button: opens / goes to the login screen.
  ///
  /// In en, this message translates to:
  /// **'Log in'**
  String get authLogIn;

  /// Profile card heading for the patient's personal details.
  ///
  /// In en, this message translates to:
  /// **'Personal information'**
  String get profilePersonalInfo;

  /// Suffix after the masked passport number, e.g. '•••• 4321 · expires 31 Jan 2031'.
  ///
  /// In en, this message translates to:
  /// **'expires {date}'**
  String profilePassportExpires(String date);

  /// Field label: date of birth.
  ///
  /// In en, this message translates to:
  /// **'Date of birth'**
  String get profileDateOfBirth;

  /// Field label: gender.
  ///
  /// In en, this message translates to:
  /// **'Gender'**
  String get profileGender;

  /// Field label: nationality (country).
  ///
  /// In en, this message translates to:
  /// **'Nationality'**
  String get profileNationality;

  /// Field label: phone number.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get profilePhone;

  /// Field label / section heading: passport.
  ///
  /// In en, this message translates to:
  /// **'Passport'**
  String get profilePassport;

  /// Warning when the passport expires within 6 months. 'e-Medical' is the name of the Indian visa category; keep it.
  ///
  /// In en, this message translates to:
  /// **'Your passport must be valid for at least 6 months to apply for an e-Medical visa.'**
  String get profilePassportValidityWarning;

  /// Field label / section heading: person to contact in an emergency.
  ///
  /// In en, this message translates to:
  /// **'Emergency contact'**
  String get profileEmergencyContact;

  /// Field label: blood group (A+, O-, ...).
  ///
  /// In en, this message translates to:
  /// **'Blood group'**
  String get profileBloodGroup;

  /// Dropdown option: no value chosen.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get profileNotSet;

  /// Profile info row value when the field is empty.
  ///
  /// In en, this message translates to:
  /// **'Not added'**
  String get profileNotAdded;

  /// Tooltip of the clear button of a date field, e.g. 'Clear Date of birth'.
  ///
  /// In en, this message translates to:
  /// **'Clear {label}'**
  String profileClearField(String label);

  /// Field label: how the person is related to the patient (spouse, friend...).
  ///
  /// In en, this message translates to:
  /// **'Relationship'**
  String get profileRelationship;

  /// Field label when a passport number is already on file.
  ///
  /// In en, this message translates to:
  /// **'New passport number'**
  String get profileNewPassportNumber;

  /// Settings group / section heading: currency, language, appearance.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get settingsPreferences;

  /// Settings row: display currency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get settingsCurrency;

  /// Settings row subtitle; currency is an ISO code like USD.
  ///
  /// In en, this message translates to:
  /// **'Prices are shown as estimates in {currency}'**
  String settingsCurrencySubtitle(String currency);

  /// Picker title / field label: the currency prices are shown in.
  ///
  /// In en, this message translates to:
  /// **'Preferred currency'**
  String get settingsPreferredCurrency;

  /// Settings row and picker title: dark / light theme.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsAppearance;

  /// Appearance option: dark theme.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeDark;

  /// Appearance option: light theme.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeLight;

  /// Appearance option: follow the device's theme.
  ///
  /// In en, this message translates to:
  /// **'Match device'**
  String get settingsThemeSystem;

  /// Settings group heading: password, email verification, data.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get settingsSecurity;

  /// Settings row: the email address is not confirmed yet.
  ///
  /// In en, this message translates to:
  /// **'Verify your email'**
  String get accountVerifyEmail;

  /// Settings row subtitle with the user's email address.
  ///
  /// In en, this message translates to:
  /// **'Check {email} for the verification link'**
  String accountVerifyEmailSubtitle(String email);

  /// Snack bar after resending the verification email.
  ///
  /// In en, this message translates to:
  /// **'Verification email sent'**
  String get accountVerificationSent;

  /// Button: send the verification email again.
  ///
  /// In en, this message translates to:
  /// **'Resend'**
  String get accountResend;

  /// Settings row title about data protection.
  ///
  /// In en, this message translates to:
  /// **'Your data'**
  String get accountYourData;

  /// Privacy statement in settings. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'Medical data is encrypted and shared only with hospitals you choose.'**
  String get accountYourDataSubtitle;

  /// Confirmation dialog title before leaving guest mode.
  ///
  /// In en, this message translates to:
  /// **'Exit guest mode?'**
  String get accountExitGuestTitle;

  /// Confirmation dialog title before logging out.
  ///
  /// In en, this message translates to:
  /// **'Log out?'**
  String get accountLogOutTitle;

  /// Dialog text: leaving guest mode deletes the guest's health questionnaires.
  ///
  /// In en, this message translates to:
  /// **'Your guest screenings will be lost unless you create an account first.'**
  String get accountExitGuestBody;

  /// Dialog text before logging out.
  ///
  /// In en, this message translates to:
  /// **'You can log back in any time with your email and password.'**
  String get accountLogOutBody;

  /// Dialog button: confirm leaving guest mode.
  ///
  /// In en, this message translates to:
  /// **'Exit'**
  String get accountExit;

  /// Button at the bottom of the profile for guests.
  ///
  /// In en, this message translates to:
  /// **'Exit guest mode'**
  String get accountExitGuestMode;

  /// Confirmation dialog title before deleting a travel companion.
  ///
  /// In en, this message translates to:
  /// **'Remove companion?'**
  String get companionsRemoveTitle;

  /// Confirmation dialog text; name is the companion's name.
  ///
  /// In en, this message translates to:
  /// **'{name} will be removed from your travel companions.'**
  String companionsRemoveBody(String name);

  /// Snack bar after deleting a companion.
  ///
  /// In en, this message translates to:
  /// **'Companion removed'**
  String get companionsRemovedSnack;

  /// Snack bar after adding a companion.
  ///
  /// In en, this message translates to:
  /// **'{name} added'**
  String companionsAddedSnack(String name);

  /// Button and form title: add a travel companion.
  ///
  /// In en, this message translates to:
  /// **'Add companion'**
  String get companionAdd;

  /// Empty state title on the companions screen.
  ///
  /// In en, this message translates to:
  /// **'No companions yet'**
  String get companionsEmptyTitle;

  /// Empty state text. 'Attendant visa' is the Indian visa for a patient's companion.
  ///
  /// In en, this message translates to:
  /// **'Add the family member or friend travelling with you so we can arrange their attendant visa.'**
  String get companionsEmptyMessage;

  /// Companion card detail: date of birth.
  ///
  /// In en, this message translates to:
  /// **'Born {date}'**
  String companionsBorn(String date);

  /// Companion card detail: masked passport number (last 4 characters).
  ///
  /// In en, this message translates to:
  /// **'Passport •••• {last4}'**
  String companionsPassportLast4(String last4);

  /// Tooltip of the edit button on a companion card.
  ///
  /// In en, this message translates to:
  /// **'Edit {name}'**
  String companionsEditTooltip(String name);

  /// Tooltip of the delete button on a companion card.
  ///
  /// In en, this message translates to:
  /// **'Remove {name}'**
  String companionsRemoveTooltip(String name);

  /// Form title: edit a travel companion.
  ///
  /// In en, this message translates to:
  /// **'Edit companion'**
  String get companionEditTitle;

  /// Companion form intro text.
  ///
  /// In en, this message translates to:
  /// **'Companions travel with you as medical attendants and need their own visa.'**
  String get companionFormIntro;

  /// Validation error: companion name is empty.
  ///
  /// In en, this message translates to:
  /// **'Enter the full name'**
  String get companionFullNameRequired;

  /// Field label: companion's full name.
  ///
  /// In en, this message translates to:
  /// **'Full name (as on passport)'**
  String get companionFullNameLabel;

  /// Validation error: no relationship chosen.
  ///
  /// In en, this message translates to:
  /// **'Choose the relationship'**
  String get companionRelationshipRequired;

  /// Relationship option.
  ///
  /// In en, this message translates to:
  /// **'Spouse'**
  String get companionRelationshipSpouse;

  /// Relationship option.
  ///
  /// In en, this message translates to:
  /// **'Parent'**
  String get companionRelationshipParent;

  /// Relationship option (son or daughter).
  ///
  /// In en, this message translates to:
  /// **'Child'**
  String get companionRelationshipChild;

  /// Relationship option (brother or sister).
  ///
  /// In en, this message translates to:
  /// **'Sibling'**
  String get companionRelationshipSibling;

  /// Relationship option (other family member).
  ///
  /// In en, this message translates to:
  /// **'Relative'**
  String get companionRelationshipRelative;

  /// Relationship option.
  ///
  /// In en, this message translates to:
  /// **'Friend'**
  String get companionRelationshipFriend;

  /// Relationship option (person who looks after the patient).
  ///
  /// In en, this message translates to:
  /// **'Caregiver'**
  String get companionRelationshipCaregiver;

  /// Validation error: passport number format.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid passport number'**
  String get companionPassportInvalid;

  /// Field label: companion's passport number.
  ///
  /// In en, this message translates to:
  /// **'Passport number (optional)'**
  String get companionPassportOptional;

  /// Helper under the passport field.
  ///
  /// In en, this message translates to:
  /// **'Stored encrypted'**
  String get companionPassportStoredEncrypted;

  /// Helper when a passport is on file.
  ///
  /// In en, this message translates to:
  /// **'Current: •••• {last4} - leave blank to keep'**
  String companionPassportCurrent(String last4);

  /// Button: save the companion form.
  ///
  /// In en, this message translates to:
  /// **'Save companion'**
  String get companionSave;

  /// Validation error: emergency contact is partly filled.
  ///
  /// In en, this message translates to:
  /// **'Add the name or clear the emergency contact'**
  String get editProfileEcNameRequired;

  /// Validation error: emergency contact is partly filled.
  ///
  /// In en, this message translates to:
  /// **'Add the relationship or clear the emergency contact'**
  String get editProfileEcRelationshipRequired;

  /// Validation error: emergency contact is partly filled.
  ///
  /// In en, this message translates to:
  /// **'Add the phone or clear the emergency contact'**
  String get editProfileEcPhoneRequired;

  /// Snack bar when the form has validation errors.
  ///
  /// In en, this message translates to:
  /// **'Please fix the highlighted fields.'**
  String get editProfileFixFields;

  /// Snack bar after saving the profile.
  ///
  /// In en, this message translates to:
  /// **'Profile saved'**
  String get editProfileSaved;

  /// Edit profile section heading.
  ///
  /// In en, this message translates to:
  /// **'Personal details'**
  String get editProfilePersonalDetails;

  /// Field label: given name.
  ///
  /// In en, this message translates to:
  /// **'First name'**
  String get editProfileFirstName;

  /// Field label: family name.
  ///
  /// In en, this message translates to:
  /// **'Last name'**
  String get editProfileLastName;

  /// Field label: country where the patient lives.
  ///
  /// In en, this message translates to:
  /// **'Country of residence'**
  String get editProfileCountryOfResidence;

  /// Passport section subtitle.
  ///
  /// In en, this message translates to:
  /// **'Needed for your medical visa invitation letter'**
  String get editProfilePassportSubtitle;

  /// Validation error: passport number format.
  ///
  /// In en, this message translates to:
  /// **'Use 5-20 letters or digits'**
  String get editProfilePassportInvalid;

  /// Field label: passport number.
  ///
  /// In en, this message translates to:
  /// **'Passport number'**
  String get editProfilePassportNumber;

  /// Helper under the passport field (privacy statement).
  ///
  /// In en, this message translates to:
  /// **'Stored encrypted. Only the last 4 digits are ever shown.'**
  String get editProfilePassportHelperNew;

  /// Helper when a passport is on file; masked is like '•••• 4321'.
  ///
  /// In en, this message translates to:
  /// **'On file: {masked}. Leave blank to keep it.'**
  String editProfilePassportOnFile(String masked);

  /// Field label: passport expiry date.
  ///
  /// In en, this message translates to:
  /// **'Passport expiry'**
  String get editProfilePassportExpiry;

  /// Field label: emergency contact's name.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get editProfileName;

  /// Edit profile section heading.
  ///
  /// In en, this message translates to:
  /// **'Medical information'**
  String get editProfileMedicalInfo;

  /// Medical section subtitle (privacy statement).
  ///
  /// In en, this message translates to:
  /// **'Shared only with hospitals you request quotes from'**
  String get editProfileMedicalInfoSubtitle;

  /// Field label: allergies.
  ///
  /// In en, this message translates to:
  /// **'Allergies'**
  String get editProfileAllergies;

  /// Field label: past illnesses and treatments.
  ///
  /// In en, this message translates to:
  /// **'Medical history'**
  String get editProfileMedicalHistory;

  /// Edit profile section heading: health insurance.
  ///
  /// In en, this message translates to:
  /// **'Insurance'**
  String get editProfileInsurance;

  /// Field label: insurance company.
  ///
  /// In en, this message translates to:
  /// **'Insurance provider'**
  String get editProfileInsuranceProvider;

  /// Field label: insurance policy number.
  ///
  /// In en, this message translates to:
  /// **'Policy number'**
  String get editProfilePolicyNumber;

  /// Field label when a policy number is on file.
  ///
  /// In en, this message translates to:
  /// **'New policy number'**
  String get editProfileNewPolicyNumber;

  /// Helper when a policy number is on file.
  ///
  /// In en, this message translates to:
  /// **'On file: •••• {last4}. Leave blank to keep it.'**
  String editProfilePolicyOnFile(String last4);

  /// Button: save the profile form.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get editProfileSaveChanges;

  /// Empty state title on the saved screen.
  ///
  /// In en, this message translates to:
  /// **'Nothing saved yet'**
  String get savedEmptyTitle;

  /// Empty state text on the saved screen.
  ///
  /// In en, this message translates to:
  /// **'Tap the bookmark on any hospital, doctor or treatment to keep it here.'**
  String get savedEmptyMessage;

  /// Empty state button: opens hospital search.
  ///
  /// In en, this message translates to:
  /// **'Explore hospitals'**
  String get savedExploreHospitals;

  /// Filter chip: all saved items, with the number of items.
  ///
  /// In en, this message translates to:
  /// **'All ({count})'**
  String savedFilterAll(int count);

  /// Filter chip per saved item type, with the number of items of that type.
  ///
  /// In en, this message translates to:
  /// **'{type, select, hospital{Hospitals ({count})} doctor{Doctors ({count})} procedure{Procedures ({count})} other{Other ({count})}}'**
  String savedFilterType(String type, int count);

  /// Empty state when a filter has no items.
  ///
  /// In en, this message translates to:
  /// **'Nothing saved in this category'**
  String get savedEmptyCategory;

  /// Saved item whose hospital / doctor / procedure was removed from the catalog.
  ///
  /// In en, this message translates to:
  /// **'{type, select, hospital{This hospital is no longer available} doctor{This doctor is no longer available} procedure{This procedure is no longer available} other{This item is no longer available}}'**
  String savedNoLongerAvailable(String type);

  /// Settings row and sheet title: change the account password.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get passwordChangeTitle;

  /// Snack bar after changing the password.
  ///
  /// In en, this message translates to:
  /// **'Password updated. Other devices have been signed out.'**
  String get passwordUpdatedSnack;

  /// Field label: the existing password.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get passwordCurrent;

  /// Helper under the current password field.
  ///
  /// In en, this message translates to:
  /// **'Leave blank if you signed up with Google and never set one'**
  String get passwordCurrentHelper;

  /// Field label: the new password.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get passwordNew;

  /// Validation error: new password equals the current one.
  ///
  /// In en, this message translates to:
  /// **'Choose a password different from the current one'**
  String get passwordMustDiffer;

  /// Helper under a new password field; min is 10.
  ///
  /// In en, this message translates to:
  /// **'At least {min} characters with a letter and a number'**
  String passwordPolicyHelper(int min);

  /// Field label: repeat the new password.
  ///
  /// In en, this message translates to:
  /// **'Confirm new password'**
  String get passwordConfirmNew;

  /// Validation error: confirmation differs.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get passwordMismatch;

  /// Button: save the new password.
  ///
  /// In en, this message translates to:
  /// **'Update password'**
  String get passwordUpdateButton;

  /// Account deletion sheet text for guests. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'This permanently deletes your guest account, screenings and saved items.'**
  String get deleteAccountGuestBody;

  /// Account deletion sheet text. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'This permanently deletes your account, profile, companions, saved items and uploaded documents, and signs you out on every device. It cannot be undone.'**
  String get deleteAccountBody;

  /// Account deletion sheet: data retention notice. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'Records we must keep by law (invoices, payments, refunds and hospital treatment records) are retained for the legal retention period with access restricted, then erased. Open bookings or pending payments may need to be settled or cancelled first.'**
  String get deleteAccountRetention;

  /// Field label: the account password, to confirm deletion.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get deleteAccountPasswordLabel;

  /// Helper under the password field.
  ///
  /// In en, this message translates to:
  /// **'Leave blank if you signed in with Google or Apple and never set one'**
  String get deleteAccountPasswordHelper;

  /// Field label: two-factor authentication code.
  ///
  /// In en, this message translates to:
  /// **'Authenticator code'**
  String get deleteAccountOtpLabel;

  /// Helper under the authenticator code field.
  ///
  /// In en, this message translates to:
  /// **'The 6-digit code from your authenticator app'**
  String get deleteAccountOtpHelper;

  /// Field label: optional reason for deleting the account.
  ///
  /// In en, this message translates to:
  /// **'Why are you leaving? (optional)'**
  String get deleteAccountReasonLabel;

  /// Field label; word is the fixed Latin word DELETE that the user must type exactly. Do not translate the placeholder.
  ///
  /// In en, this message translates to:
  /// **'Type {word} to confirm'**
  String deleteAccountConfirmLabel(String word);

  /// Destructive button: delete the account.
  ///
  /// In en, this message translates to:
  /// **'Delete my account permanently'**
  String get deleteAccountSubmit;

  /// Reason the account cannot be deleted yet: open treatment cases.
  ///
  /// In en, this message translates to:
  /// **'Cases in progress'**
  String get deleteAccountBlockerActiveCases;

  /// Reason the account cannot be deleted yet.
  ///
  /// In en, this message translates to:
  /// **'Upcoming or active bookings'**
  String get deleteAccountBlockerActiveBookings;

  /// Reason the account cannot be deleted yet.
  ///
  /// In en, this message translates to:
  /// **'Payments in progress'**
  String get deleteAccountBlockerPendingPayments;

  /// Reason the account cannot be deleted yet (hospital accounts).
  ///
  /// In en, this message translates to:
  /// **'Listed hospitals you own'**
  String get deleteAccountBlockerHospitalsOwned;

  /// Heading of the list of items blocking account deletion.
  ///
  /// In en, this message translates to:
  /// **'These need to be closed first'**
  String get deleteAccountBlockersTitle;

  /// Confirmation after asking support to delete the account. Legal wording: keep the meaning exact.
  ///
  /// In en, this message translates to:
  /// **'Deletion request sent. Our support team will close your account once these are settled and confirm by e-mail.'**
  String get deleteAccountRequestSent;

  /// Button: ask support to delete the account.
  ///
  /// In en, this message translates to:
  /// **'Request deletion'**
  String get deleteAccountRequestButton;

  /// Error: password reset code rejected.
  ///
  /// In en, this message translates to:
  /// **'This reset code is invalid or has expired. Request a new one.'**
  String get forgotPasswordInvalidCode;

  /// Forgot password screen title in the reset step.
  ///
  /// In en, this message translates to:
  /// **'Set a new password'**
  String get forgotPasswordSetNewTitle;

  /// Forgot password screen title.
  ///
  /// In en, this message translates to:
  /// **'Reset password'**
  String get forgotPasswordTitle;

  /// Forgot password intro.
  ///
  /// In en, this message translates to:
  /// **'Enter the email you registered with and we\'ll send you a link to reset your password.'**
  String get forgotPasswordIntro;

  /// Field label: email address.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get forgotPasswordEmailLabel;

  /// Button: request the password reset email.
  ///
  /// In en, this message translates to:
  /// **'Send reset link'**
  String get forgotPasswordSendLink;

  /// Link button: skip to entering the reset code.
  ///
  /// In en, this message translates to:
  /// **'I already have a reset code'**
  String get forgotPasswordHaveCode;

  /// Heading after the reset email was requested.
  ///
  /// In en, this message translates to:
  /// **'Check your inbox'**
  String get forgotPasswordCheckInbox;

  /// Text after the reset email was requested.
  ///
  /// In en, this message translates to:
  /// **'If an account exists for {email}, we have sent a password reset link. It may take a few minutes to arrive - check your spam folder too.'**
  String forgotPasswordSentBody(String email);

  /// Button: go to the reset code step.
  ///
  /// In en, this message translates to:
  /// **'Enter reset code'**
  String get forgotPasswordEnterCode;

  /// Link button: return to the login screen.
  ///
  /// In en, this message translates to:
  /// **'Back to log in'**
  String get forgotPasswordBackToLogin;

  /// Reset step intro.
  ///
  /// In en, this message translates to:
  /// **'Paste the reset code from the email we sent you, then choose a new password.'**
  String get forgotPasswordResetIntro;

  /// Validation error: reset code too short.
  ///
  /// In en, this message translates to:
  /// **'Paste the full reset code'**
  String get forgotPasswordPasteFullCode;

  /// Field label: password reset code.
  ///
  /// In en, this message translates to:
  /// **'Reset code'**
  String get forgotPasswordCodeLabel;

  /// Link button: back to requesting a reset email.
  ///
  /// In en, this message translates to:
  /// **'Request a new link'**
  String get forgotPasswordRequestNewLink;

  /// Heading after the password was reset.
  ///
  /// In en, this message translates to:
  /// **'Password updated'**
  String get forgotPasswordUpdatedTitle;

  /// Text after the password was reset.
  ///
  /// In en, this message translates to:
  /// **'You can now log in with your new password.'**
  String get forgotPasswordUpdatedBody;

  /// Validation error: email empty.
  ///
  /// In en, this message translates to:
  /// **'Enter your email'**
  String get validationEnterEmail;

  /// Validation error: email format.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address'**
  String get validationInvalidEmail;

  /// Validation error: password empty on login.
  ///
  /// In en, this message translates to:
  /// **'Enter your password'**
  String get validationEnterPassword;

  /// Validation error: new password empty.
  ///
  /// In en, this message translates to:
  /// **'Choose a password'**
  String get validationChoosePassword;

  /// Validation error: password too short; min is 10.
  ///
  /// In en, this message translates to:
  /// **'Use at least {min} characters'**
  String validationPasswordTooShort(int min);

  /// Validation error: password too long; max is 128.
  ///
  /// In en, this message translates to:
  /// **'Use at most {max} characters'**
  String validationPasswordTooLong(int max);

  /// Validation error: password needs a letter and a digit.
  ///
  /// In en, this message translates to:
  /// **'Include at least one letter and one number'**
  String get validationPasswordLetterDigit;

  /// Validation error: name empty.
  ///
  /// In en, this message translates to:
  /// **'Enter your full name'**
  String get validationEnterFullName;

  /// Validation error: name over 200 characters.
  ///
  /// In en, this message translates to:
  /// **'Name is too long'**
  String get validationNameTooLong;

  /// Validation error: phone format.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid phone number'**
  String get validationInvalidPhone;

  /// Validation error: one-time code format.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get validationEnterOtp;

  /// Country name (ISO code AF) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Afghanistan'**
  String get countryAF;

  /// Country name (ISO code DZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Algeria'**
  String get countryDZ;

  /// Country name (ISO code AO) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Angola'**
  String get countryAO;

  /// Country name (ISO code AR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Argentina'**
  String get countryAR;

  /// Country name (ISO code AM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Armenia'**
  String get countryAM;

  /// Country name (ISO code AU) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Australia'**
  String get countryAU;

  /// Country name (ISO code AT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Austria'**
  String get countryAT;

  /// Country name (ISO code AZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Azerbaijan'**
  String get countryAZ;

  /// Country name (ISO code BH) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Bahrain'**
  String get countryBH;

  /// Country name (ISO code BD) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Bangladesh'**
  String get countryBD;

  /// Country name (ISO code BY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Belarus'**
  String get countryBY;

  /// Country name (ISO code BE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Belgium'**
  String get countryBE;

  /// Country name (ISO code BT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Bhutan'**
  String get countryBT;

  /// Country name (ISO code BW) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Botswana'**
  String get countryBW;

  /// Country name (ISO code BR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Brazil'**
  String get countryBR;

  /// Country name (ISO code BN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Brunei'**
  String get countryBN;

  /// Country name (ISO code BG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Bulgaria'**
  String get countryBG;

  /// Country name (ISO code BI) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Burundi'**
  String get countryBI;

  /// Country name (ISO code KH) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Cambodia'**
  String get countryKH;

  /// Country name (ISO code CM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Cameroon'**
  String get countryCM;

  /// Country name (ISO code CA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Canada'**
  String get countryCA;

  /// Country name (ISO code TD) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Chad'**
  String get countryTD;

  /// Country name (ISO code CL) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Chile'**
  String get countryCL;

  /// Country name (ISO code CN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'China'**
  String get countryCN;

  /// Country name (ISO code CO) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Colombia'**
  String get countryCO;

  /// Country name (ISO code CD) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Congo (DRC)'**
  String get countryCD;

  /// Country name (ISO code CI) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Cote d\'Ivoire'**
  String get countryCI;

  /// Country name (ISO code HR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Croatia'**
  String get countryHR;

  /// Country name (ISO code CY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Cyprus'**
  String get countryCY;

  /// Country name (ISO code CZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Czechia'**
  String get countryCZ;

  /// Country name (ISO code DK) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Denmark'**
  String get countryDK;

  /// Country name (ISO code DJ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Djibouti'**
  String get countryDJ;

  /// Country name (ISO code EG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Egypt'**
  String get countryEG;

  /// Country name (ISO code ER) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Eritrea'**
  String get countryER;

  /// Country name (ISO code EE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Estonia'**
  String get countryEE;

  /// Country name (ISO code ET) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Ethiopia'**
  String get countryET;

  /// Country name (ISO code FJ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Fiji'**
  String get countryFJ;

  /// Country name (ISO code FI) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Finland'**
  String get countryFI;

  /// Country name (ISO code FR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'France'**
  String get countryFR;

  /// Country name (ISO code GA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Gabon'**
  String get countryGA;

  /// Country name (ISO code GM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Gambia'**
  String get countryGM;

  /// Country name (ISO code GE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Georgia'**
  String get countryGE;

  /// Country name (ISO code DE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Germany'**
  String get countryDE;

  /// Country name (ISO code GH) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Ghana'**
  String get countryGH;

  /// Country name (ISO code GR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Greece'**
  String get countryGR;

  /// Country name (ISO code GN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Guinea'**
  String get countryGN;

  /// Country name (ISO code GY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Guyana'**
  String get countryGY;

  /// Country name (ISO code HK) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Hong Kong'**
  String get countryHK;

  /// Country name (ISO code HU) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Hungary'**
  String get countryHU;

  /// Country name (ISO code IS) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Iceland'**
  String get countryIS;

  /// Country name (ISO code IN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'India'**
  String get countryIN;

  /// Country name (ISO code ID) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Indonesia'**
  String get countryID;

  /// Country name (ISO code IR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Iran'**
  String get countryIR;

  /// Country name (ISO code IQ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Iraq'**
  String get countryIQ;

  /// Country name (ISO code IE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Ireland'**
  String get countryIE;

  /// Country name (ISO code IL) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Israel'**
  String get countryIL;

  /// Country name (ISO code IT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Italy'**
  String get countryIT;

  /// Country name (ISO code JM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Jamaica'**
  String get countryJM;

  /// Country name (ISO code JP) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Japan'**
  String get countryJP;

  /// Country name (ISO code JO) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Jordan'**
  String get countryJO;

  /// Country name (ISO code KZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Kazakhstan'**
  String get countryKZ;

  /// Country name (ISO code KE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Kenya'**
  String get countryKE;

  /// Country name (ISO code KW) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Kuwait'**
  String get countryKW;

  /// Country name (ISO code KG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Kyrgyzstan'**
  String get countryKG;

  /// Country name (ISO code LA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Laos'**
  String get countryLA;

  /// Country name (ISO code LV) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Latvia'**
  String get countryLV;

  /// Country name (ISO code LB) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Lebanon'**
  String get countryLB;

  /// Country name (ISO code LS) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Lesotho'**
  String get countryLS;

  /// Country name (ISO code LR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Liberia'**
  String get countryLR;

  /// Country name (ISO code LY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Libya'**
  String get countryLY;

  /// Country name (ISO code LT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Lithuania'**
  String get countryLT;

  /// Country name (ISO code LU) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Luxembourg'**
  String get countryLU;

  /// Country name (ISO code MG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Madagascar'**
  String get countryMG;

  /// Country name (ISO code MW) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Malawi'**
  String get countryMW;

  /// Country name (ISO code MY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Malaysia'**
  String get countryMY;

  /// Country name (ISO code MV) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Maldives'**
  String get countryMV;

  /// Country name (ISO code ML) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Mali'**
  String get countryML;

  /// Country name (ISO code MT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Malta'**
  String get countryMT;

  /// Country name (ISO code MR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Mauritania'**
  String get countryMR;

  /// Country name (ISO code MU) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Mauritius'**
  String get countryMU;

  /// Country name (ISO code MX) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Mexico'**
  String get countryMX;

  /// Country name (ISO code MD) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Moldova'**
  String get countryMD;

  /// Country name (ISO code MN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Mongolia'**
  String get countryMN;

  /// Country name (ISO code MA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Morocco'**
  String get countryMA;

  /// Country name (ISO code MZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Mozambique'**
  String get countryMZ;

  /// Country name (ISO code MM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Myanmar'**
  String get countryMM;

  /// Country name (ISO code NA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Namibia'**
  String get countryNA;

  /// Country name (ISO code NP) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Nepal'**
  String get countryNP;

  /// Country name (ISO code NL) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Netherlands'**
  String get countryNL;

  /// Country name (ISO code NZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'New Zealand'**
  String get countryNZ;

  /// Country name (ISO code NE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Niger'**
  String get countryNE;

  /// Country name (ISO code NG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Nigeria'**
  String get countryNG;

  /// Country name (ISO code NO) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Norway'**
  String get countryNO;

  /// Country name (ISO code OM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Oman'**
  String get countryOM;

  /// Country name (ISO code PK) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Pakistan'**
  String get countryPK;

  /// Country name (ISO code PS) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Palestine'**
  String get countryPS;

  /// Country name (ISO code PA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Panama'**
  String get countryPA;

  /// Country name (ISO code PG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Papua New Guinea'**
  String get countryPG;

  /// Country name (ISO code PE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Peru'**
  String get countryPE;

  /// Country name (ISO code PH) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Philippines'**
  String get countryPH;

  /// Country name (ISO code PL) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Poland'**
  String get countryPL;

  /// Country name (ISO code PT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Portugal'**
  String get countryPT;

  /// Country name (ISO code QA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Qatar'**
  String get countryQA;

  /// Country name (ISO code RO) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Romania'**
  String get countryRO;

  /// Country name (ISO code RU) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Russia'**
  String get countryRU;

  /// Country name (ISO code RW) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Rwanda'**
  String get countryRW;

  /// Country name (ISO code SA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Saudi Arabia'**
  String get countrySA;

  /// Country name (ISO code SN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Senegal'**
  String get countrySN;

  /// Country name (ISO code RS) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Serbia'**
  String get countryRS;

  /// Country name (ISO code SC) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Seychelles'**
  String get countrySC;

  /// Country name (ISO code SL) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Sierra Leone'**
  String get countrySL;

  /// Country name (ISO code SG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Singapore'**
  String get countrySG;

  /// Country name (ISO code SK) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Slovakia'**
  String get countrySK;

  /// Country name (ISO code SI) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Slovenia'**
  String get countrySI;

  /// Country name (ISO code SO) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Somalia'**
  String get countrySO;

  /// Country name (ISO code ZA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'South Africa'**
  String get countryZA;

  /// Country name (ISO code KR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'South Korea'**
  String get countryKR;

  /// Country name (ISO code SS) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'South Sudan'**
  String get countrySS;

  /// Country name (ISO code ES) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Spain'**
  String get countryES;

  /// Country name (ISO code LK) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Sri Lanka'**
  String get countryLK;

  /// Country name (ISO code SD) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Sudan'**
  String get countrySD;

  /// Country name (ISO code SR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Suriname'**
  String get countrySR;

  /// Country name (ISO code SE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Sweden'**
  String get countrySE;

  /// Country name (ISO code CH) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Switzerland'**
  String get countryCH;

  /// Country name (ISO code SY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Syria'**
  String get countrySY;

  /// Country name (ISO code TW) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Taiwan'**
  String get countryTW;

  /// Country name (ISO code TJ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Tajikistan'**
  String get countryTJ;

  /// Country name (ISO code TZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Tanzania'**
  String get countryTZ;

  /// Country name (ISO code TH) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Thailand'**
  String get countryTH;

  /// Country name (ISO code TG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Togo'**
  String get countryTG;

  /// Country name (ISO code TT) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Trinidad and Tobago'**
  String get countryTT;

  /// Country name (ISO code TN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Tunisia'**
  String get countryTN;

  /// Country name (ISO code TR) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Turkey'**
  String get countryTR;

  /// Country name (ISO code TM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Turkmenistan'**
  String get countryTM;

  /// Country name (ISO code UG) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Uganda'**
  String get countryUG;

  /// Country name (ISO code UA) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Ukraine'**
  String get countryUA;

  /// Country name (ISO code AE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'United Arab Emirates'**
  String get countryAE;

  /// Country name (ISO code GB) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'United Kingdom'**
  String get countryGB;

  /// Country name (ISO code US) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'United States'**
  String get countryUS;

  /// Country name (ISO code UY) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Uruguay'**
  String get countryUY;

  /// Country name (ISO code UZ) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Uzbekistan'**
  String get countryUZ;

  /// Country name (ISO code VE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Venezuela'**
  String get countryVE;

  /// Country name (ISO code VN) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Vietnam'**
  String get countryVN;

  /// Country name (ISO code YE) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Yemen'**
  String get countryYE;

  /// Country name (ISO code ZM) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Zambia'**
  String get countryZM;

  /// Country name (ISO code ZW) in nationality / residence pickers.
  ///
  /// In en, this message translates to:
  /// **'Zimbabwe'**
  String get countryZW;

  /// Agent shell bottom-nav tab: dashboard.
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get agentTabDashboard;

  /// Agent shell bottom-nav tab: the agent's patients.
  ///
  /// In en, this message translates to:
  /// **'Patients'**
  String get agentTabPatients;

  /// Agent shell bottom-nav tab: medical cases (hospital enquiries).
  ///
  /// In en, this message translates to:
  /// **'Cases'**
  String get agentTabCases;

  /// Agent shell bottom-nav tab: treatment bookings.
  ///
  /// In en, this message translates to:
  /// **'Bookings'**
  String get agentTabBookings;

  /// Agent shell bottom-nav tab: commissions and payouts.
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get agentTabEarnings;

  /// Partner portal monthly chart: shown when there is no data.
  ///
  /// In en, this message translates to:
  /// **'No activity yet'**
  String get portalNoActivityYet;

  /// Partner portal: label of the patient row / fallback name when a patient has no name.
  ///
  /// In en, this message translates to:
  /// **'Patient'**
  String get portalPatientLabel;

  /// Partner portal detail row label: hospital name and city.
  ///
  /// In en, this message translates to:
  /// **'Hospital'**
  String get portalHospitalLabel;

  /// Partner portal detail row label: treating doctor.
  ///
  /// In en, this message translates to:
  /// **'Doctor'**
  String get portalDoctorLabel;

  /// Partner portal: booking section title / fallback title when the booking number is unknown.
  ///
  /// In en, this message translates to:
  /// **'Booking'**
  String get portalBookingLabel;

  /// Case row: when the case was opened; {when} is a relative time like '2 days ago'.
  ///
  /// In en, this message translates to:
  /// **'Opened {when}'**
  String portalCaseOpened(String when);

  /// Quote / price summary: total amount label.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get portalTotal;

  /// Quote breakdown footer: estimated hospital stay in days.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} day stay} other{{count} day stay}}'**
  String portalQuoteStayDays(int count);

  /// Quote breakdown footer: quote validity date (lower case, joined with ' · ').
  ///
  /// In en, this message translates to:
  /// **'valid until {date}'**
  String portalQuoteValidUntil(String date);

  /// Quote breakdown footer: hospital staff member who prepared the quote.
  ///
  /// In en, this message translates to:
  /// **'by {name}'**
  String portalQuotePreparedBy(String name);

  /// Status filter chip: show every status.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get portalFilterAll;

  /// Snack bar after a partner (agent / hospital) deleted their account.
  ///
  /// In en, this message translates to:
  /// **'Your account has been deleted.'**
  String get portalAccountDeleted;

  /// Settlement item status: earned, not yet eligible for payout.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get payeeStatusPending;

  /// Settlement item status: eligible for the next payout.
  ///
  /// In en, this message translates to:
  /// **'Eligible'**
  String get payeeStatusEligible;

  /// Settlement item status: payout held (e.g. dispute).
  ///
  /// In en, this message translates to:
  /// **'On hold'**
  String get payeeStatusOnHold;

  /// Settlement item status: included in a payout batch.
  ///
  /// In en, this message translates to:
  /// **'Batched'**
  String get payeeStatusBatched;

  /// Settlement item status: paid out.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get payeeStatusPaid;

  /// Settlement / payout status: reversed (money taken back, e.g. after a refund).
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get payeeStatusReversed;

  /// Payout status: waiting to be sent.
  ///
  /// In en, this message translates to:
  /// **'Queued'**
  String get payeeStatusQueued;

  /// Payout status: being sent by the bank / provider.
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get payeeStatusProcessing;

  /// Payout status: sent successfully.
  ///
  /// In en, this message translates to:
  /// **'Processed'**
  String get payeeStatusProcessed;

  /// Payout status: the transfer failed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get payeeStatusFailed;

  /// Payout status: outcome unknown, finance team is checking it.
  ///
  /// In en, this message translates to:
  /// **'Needs reconciliation'**
  String get payeeStatusNeedsReconciliation;

  /// Finance view segment: settlement items (default label; hospitals).
  ///
  /// In en, this message translates to:
  /// **'Settlements'**
  String get payeeSettlementsTab;

  /// Finance view segment: money transfers to the payee.
  ///
  /// In en, this message translates to:
  /// **'Payouts'**
  String get payeePayoutsTab;

  /// Finance view segment: account statement.
  ///
  /// In en, this message translates to:
  /// **'Statement'**
  String get payeeStatementTab;

  /// Finance view: no settlement items / commissions for the filter.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get payeeItemsEmpty;

  /// Finance view: no payouts yet.
  ///
  /// In en, this message translates to:
  /// **'No payouts yet'**
  String get payeePayoutsEmpty;

  /// Payout row: bank Unique Transaction Reference number (keep 'UTR').
  ///
  /// In en, this message translates to:
  /// **'UTR {utr}'**
  String payeePayoutUtr(String utr);

  /// Payout method: bank transfer made manually by the finance team.
  ///
  /// In en, this message translates to:
  /// **'Manual bank transfer'**
  String get payeeMethodManualBankTransfer;

  /// Statement period chip: last 12 months.
  ///
  /// In en, this message translates to:
  /// **'12 months'**
  String get payeeStatementTwelveMonths;

  /// Statement period chip: last N days (30 or 90).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} day} other{{count} days}}'**
  String payeeStatementDays(int count);

  /// Statement row label: date range.
  ///
  /// In en, this message translates to:
  /// **'Period'**
  String get payeeStatementPeriod;

  /// Statement period value: start and end dates.
  ///
  /// In en, this message translates to:
  /// **'{from} – {to}'**
  String payeeStatementPeriodRange(String from, String to);

  /// Statement row label: balance at the start of the period.
  ///
  /// In en, this message translates to:
  /// **'Opening balance'**
  String get payeeOpeningBalance;

  /// Statement row label: total earned in the period.
  ///
  /// In en, this message translates to:
  /// **'Earned'**
  String get payeeEarned;

  /// Statement row label: total paid out in the period.
  ///
  /// In en, this message translates to:
  /// **'Paid out'**
  String get payeePaidOut;

  /// Statement row label: balance at the end of the period.
  ///
  /// In en, this message translates to:
  /// **'Closing balance'**
  String get payeeClosingBalance;

  /// Statement: empty state.
  ///
  /// In en, this message translates to:
  /// **'No transactions in this period'**
  String get payeeStatementEmpty;

  /// Statement row: running balance after the transaction (short).
  ///
  /// In en, this message translates to:
  /// **'Bal {amount}'**
  String payeeStatementBalance(String amount);

  /// Finance summary card: total paid out so far.
  ///
  /// In en, this message translates to:
  /// **'Paid to date'**
  String get payeePaidToDate;

  /// Finance summary card: earned but not yet paid out.
  ///
  /// In en, this message translates to:
  /// **'Outstanding {amount}'**
  String payeeOutstanding(String amount);

  /// Finance summary card: date of the next payout (lower case, after ' · ').
  ///
  /// In en, this message translates to:
  /// **'next payout {date}'**
  String payeeNextPayout(String date);

  /// Finance KPI tile: amount pending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get payeeKpiPending;

  /// Finance KPI tile: amount eligible for the next payout.
  ///
  /// In en, this message translates to:
  /// **'Eligible for payout'**
  String get payeeKpiEligible;

  /// Finance KPI tile: amount on hold.
  ///
  /// In en, this message translates to:
  /// **'On hold'**
  String get payeeKpiOnHold;

  /// Finance KPI tile: amount already in a payout batch.
  ///
  /// In en, this message translates to:
  /// **'In payout batch'**
  String get payeeKpiBatched;

  /// Settlement item: gross amount and platform fee deducted.
  ///
  /// In en, this message translates to:
  /// **'Gross {gross} · fee {fee}'**
  String payeeItemGrossFee(String gross, String fee);

  /// Settlement item: Indian Goods and Services Tax amount (keep 'GST').
  ///
  /// In en, this message translates to:
  /// **'GST {amount}'**
  String payeeItemGst(String amount);

  /// Settlement item: Indian Tax Deducted at Source amount (keep 'TDS').
  ///
  /// In en, this message translates to:
  /// **'TDS {amount}'**
  String payeeItemTds(String amount);

  /// Settlement item: why the payout is held; {reason} comes from finance staff.
  ///
  /// In en, this message translates to:
  /// **'On hold: {reason}'**
  String payeeItemOnHoldReason(String reason);

  /// Settlement item: date from which it can be paid out.
  ///
  /// In en, this message translates to:
  /// **'Eligible {date}'**
  String payeeItemEligibleOn(String date);

  /// Agent earnings screen title and items segment.
  ///
  /// In en, this message translates to:
  /// **'Commissions'**
  String get commissionTitle;

  /// Agent referral card badge: the agent's commission rate.
  ///
  /// In en, this message translates to:
  /// **'{rate} rate'**
  String commissionRateBadge(String rate);

  /// Agent dashboard KPI: commission earned, not yet paid.
  ///
  /// In en, this message translates to:
  /// **'Commission pending'**
  String get commissionKpiPending;

  /// Agent dashboard KPI: commission paid out.
  ///
  /// In en, this message translates to:
  /// **'Commission paid'**
  String get commissionKpiPaid;

  /// Agent dashboard chart title.
  ///
  /// In en, this message translates to:
  /// **'Commission by month'**
  String get commissionByMonth;

  /// Agent dashboard banner: KYC (identity verification) not submitted.
  ///
  /// In en, this message translates to:
  /// **'Submit your KYC documents on the agent web portal to start earning commissions.'**
  String get kycBannerNotSubmitted;

  /// Agent dashboard banner: KYC under review.
  ///
  /// In en, this message translates to:
  /// **'Your KYC is under review. You can add patients meanwhile.'**
  String get kycBannerPending;

  /// Agent dashboard banner: KYC rejected, no reason given.
  ///
  /// In en, this message translates to:
  /// **'KYC rejected'**
  String get kycBannerRejected;

  /// Agent dashboard banner: KYC rejected with the reviewer's reason.
  ///
  /// In en, this message translates to:
  /// **'KYC rejected: {reason}'**
  String kycBannerRejectedWithReason(String reason);

  /// Agent dashboard banner: account status (lower-case status label, e.g. 'suspended').
  ///
  /// In en, this message translates to:
  /// **'Your agency account is {status}.'**
  String agentAccountStatusBanner(String status);

  /// Agent dashboard title when the agent's name is unknown.
  ///
  /// In en, this message translates to:
  /// **'Agent dashboard'**
  String get agentDashboardTitle;

  /// Agent dashboard title greeting with the agent's first name.
  ///
  /// In en, this message translates to:
  /// **'Hi, {name}'**
  String agentDashboardGreeting(String name);

  /// Agent dashboard KPI: number of patients.
  ///
  /// In en, this message translates to:
  /// **'Patients'**
  String get agentKpiPatients;

  /// Agent dashboard KPI: open cases.
  ///
  /// In en, this message translates to:
  /// **'Active cases'**
  String get agentKpiActiveCases;

  /// Agent dashboard KPI: confirmed bookings.
  ///
  /// In en, this message translates to:
  /// **'Confirmed bookings'**
  String get agentKpiConfirmedBookings;

  /// Agent dashboard KPI: share of cases that became bookings.
  ///
  /// In en, this message translates to:
  /// **'Conversion'**
  String get agentKpiConversion;

  /// Agent dashboard section title.
  ///
  /// In en, this message translates to:
  /// **'Quick actions'**
  String get agentQuickActions;

  /// Button / screen title: add a patient managed by the agent.
  ///
  /// In en, this message translates to:
  /// **'Add patient'**
  String get agentAddPatient;

  /// Button: run a symptom screening for a patient.
  ///
  /// In en, this message translates to:
  /// **'Run screening'**
  String get agentRunScreening;

  /// Agent dashboard chart title.
  ///
  /// In en, this message translates to:
  /// **'Cases by month'**
  String get agentCasesByMonth;

  /// Agent dashboard section title.
  ///
  /// In en, this message translates to:
  /// **'Recent cases'**
  String get agentRecentCases;

  /// Agent dashboard: link to the cases tab.
  ///
  /// In en, this message translates to:
  /// **'All cases'**
  String get agentAllCases;

  /// Agent dashboard: empty recent cases.
  ///
  /// In en, this message translates to:
  /// **'No cases yet'**
  String get agentDashboardNoCases;

  /// Agent dashboard: empty recent cases hint.
  ///
  /// In en, this message translates to:
  /// **'Add a patient, run a screening and request quotes from hospitals.'**
  String get agentDashboardNoCasesHint;

  /// Agent earnings referral card title.
  ///
  /// In en, this message translates to:
  /// **'Your agent code {code}'**
  String agentReferralCode(String code);

  /// Agent earnings: copy the referral URL.
  ///
  /// In en, this message translates to:
  /// **'Copy referral link'**
  String get agentCopyReferralLink;

  /// Snack bar after copying the referral link.
  ///
  /// In en, this message translates to:
  /// **'Referral link copied'**
  String get agentReferralLinkCopied;

  /// Agent patients list title.
  ///
  /// In en, this message translates to:
  /// **'My patients'**
  String get agentPatientsTitle;

  /// Agent patients list search hint.
  ///
  /// In en, this message translates to:
  /// **'Search patients'**
  String get agentPatientsSearchHint;

  /// Agent patients list: empty state.
  ///
  /// In en, this message translates to:
  /// **'No patients yet'**
  String get agentPatientsEmpty;

  /// Agent patients list: no search results.
  ///
  /// In en, this message translates to:
  /// **'No patients match \"{query}\"'**
  String agentPatientsNoMatch(String query);

  /// Agent patients list: empty state hint.
  ///
  /// In en, this message translates to:
  /// **'Add a patient to run a screening and request hospital quotes for them.'**
  String get agentPatientsEmptyHint;

  /// Patient row: age in years (short).
  ///
  /// In en, this message translates to:
  /// **'{age, plural, other{{age} yrs}}'**
  String agentPatientAgeYears(int age);

  /// Patient row: number of cases.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} case} other{{count} cases}}'**
  String agentPatientCasesCount(int count);

  /// Patient row: number of symptom screenings.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} screening} other{{count} screenings}}'**
  String agentPatientScreeningsCount(int count);

  /// Patient row badge: patient account managed by the agent (not activated).
  ///
  /// In en, this message translates to:
  /// **'Managed'**
  String get agentPatientManaged;

  /// Snack bar after editing a patient.
  ///
  /// In en, this message translates to:
  /// **'Patient updated'**
  String get agentPatientUpdated;

  /// Snack bar after adding a patient.
  ///
  /// In en, this message translates to:
  /// **'Patient added'**
  String get agentPatientAdded;

  /// Form validation: field is required.
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get agentFormRequired;

  /// Patient form title (edit mode).
  ///
  /// In en, this message translates to:
  /// **'Edit patient'**
  String get agentEditPatient;

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'First name'**
  String get agentPatientFirstName;

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'Last name'**
  String get agentPatientLastName;

  /// Patient form field: 2-letter ISO country code (keep the codes).
  ///
  /// In en, this message translates to:
  /// **'Nationality (ISO code, e.g. NG, AE, US)'**
  String get agentPatientNationalityLabel;

  /// Patient form validation: nationality code.
  ///
  /// In en, this message translates to:
  /// **'Enter a 2-letter country code'**
  String get agentPatientNationalityInvalid;

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'E-mail (optional)'**
  String get agentPatientEmailOptional;

  /// Patient form: helper under the e-mail field.
  ///
  /// In en, this message translates to:
  /// **'The patient receives an invitation to activate their account.'**
  String get agentPatientEmailHelper;

  /// Patient form validation: e-mail format.
  ///
  /// In en, this message translates to:
  /// **'Invalid e-mail'**
  String get agentPatientEmailInvalid;

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'Phone (optional)'**
  String get agentPatientPhoneOptional;

  /// Patient form: date-of-birth picker placeholder.
  ///
  /// In en, this message translates to:
  /// **'Date of birth (optional)'**
  String get agentPatientDobOptional;

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'Medical history (optional)'**
  String get agentPatientMedicalHistoryOptional;

  /// Patient form section title (edit mode).
  ///
  /// In en, this message translates to:
  /// **'Travel & medical details'**
  String get agentPatientTravelMedicalSection;

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'Passport number'**
  String get agentPatientPassportNumber;

  /// Patient form: helper under the passport number.
  ///
  /// In en, this message translates to:
  /// **'Leave empty to keep the stored passport.'**
  String get agentPatientPassportKeepHelper;

  /// Patient form: passport expiry picker placeholder.
  ///
  /// In en, this message translates to:
  /// **'Passport expiry'**
  String get agentPatientPassportExpiry;

  /// Patient form: chosen passport expiry date.
  ///
  /// In en, this message translates to:
  /// **'Passport expires {date}'**
  String agentPatientPassportExpires(String date);

  /// Patient form field.
  ///
  /// In en, this message translates to:
  /// **'Blood group'**
  String get agentPatientBloodGroup;

  /// Patient form field / detail row.
  ///
  /// In en, this message translates to:
  /// **'Allergies'**
  String get agentPatientAllergies;

  /// Patient form submit button (edit mode).
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get agentSaveChanges;

  /// Patient detail button: request a hospital quote.
  ///
  /// In en, this message translates to:
  /// **'Request quote'**
  String get agentRequestQuote;

  /// Patient detail: the patient activated their own account.
  ///
  /// In en, this message translates to:
  /// **'Account activated'**
  String get agentPatientAccountActivated;

  /// Patient detail: account managed by the agent; invitation not accepted yet.
  ///
  /// In en, this message translates to:
  /// **'Managed by you · invite pending'**
  String get agentPatientInvitePending;

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'Nationality'**
  String get agentPatientNationality;

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'Date of birth'**
  String get agentPatientDob;

  /// Patient detail: birth date with age in years.
  ///
  /// In en, this message translates to:
  /// **'{date} ({age} yrs)'**
  String agentPatientDobWithAge(String date, int age);

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'Gender'**
  String get agentPatientGender;

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'E-mail'**
  String get agentPatientEmail;

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get agentPatientPhone;

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'Passport'**
  String get agentPatientPassport;

  /// Patient detail passport row: expiry date (short, lower case).
  ///
  /// In en, this message translates to:
  /// **'exp {date}'**
  String agentPatientPassportExpShort(String date);

  /// Patient detail row label.
  ///
  /// In en, this message translates to:
  /// **'Medical history'**
  String get agentPatientMedicalHistory;

  /// Patient detail section: symptom screenings.
  ///
  /// In en, this message translates to:
  /// **'Screenings'**
  String get agentScreeningsSection;

  /// Patient detail: no screenings yet (AI suggests hospitals and doctors).
  ///
  /// In en, this message translates to:
  /// **'No screenings yet — run one to get AI-matched hospitals and doctors.'**
  String get agentScreeningsEmpty;

  /// Screening row title when no specialty is set.
  ///
  /// In en, this message translates to:
  /// **'General screening'**
  String get agentGeneralScreening;

  /// Agent cases list title / patient detail section.
  ///
  /// In en, this message translates to:
  /// **'Cases & quotes'**
  String get agentCasesTitle;

  /// Quote comparison screen title / link.
  ///
  /// In en, this message translates to:
  /// **'Compare quotes'**
  String get agentCompareQuotes;

  /// Patient detail: no cases yet.
  ///
  /// In en, this message translates to:
  /// **'No hospital enquiries yet.'**
  String get agentPatientCasesEmpty;

  /// Snack bar after uploading a patient document.
  ///
  /// In en, this message translates to:
  /// **'Uploaded {fileName}'**
  String agentDocumentUploaded(String fileName);

  /// Section title: patient / case documents.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get agentDocumentsSection;

  /// Documents section action while an upload runs.
  ///
  /// In en, this message translates to:
  /// **'Uploading…'**
  String get agentDocumentUploading;

  /// Patient detail: no documents yet.
  ///
  /// In en, this message translates to:
  /// **'Upload reports, scans and the passport so hospitals can quote accurately.'**
  String get agentDocumentsEmpty;

  /// Agent cases list: empty state.
  ///
  /// In en, this message translates to:
  /// **'No cases'**
  String get agentCasesEmpty;

  /// Agent cases list: empty state hint.
  ///
  /// In en, this message translates to:
  /// **'Open a patient and request a quote from a hospital.'**
  String get agentCasesEmptyHint;

  /// Confirm dialog title: accept a hospital quote.
  ///
  /// In en, this message translates to:
  /// **'Accept this quote?'**
  String get agentAcceptQuoteTitle;

  /// Confirm dialog: accepting a quote; other quotes stay open until a booking is made.
  ///
  /// In en, this message translates to:
  /// **'{hospital} · {total}. Other open quotes stay available until booked.'**
  String agentAcceptQuoteMessage(String hospital, String total);

  /// Button: accept a hospital quote.
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get agentQuoteAccept;

  /// Snack bar after accepting a quote.
  ///
  /// In en, this message translates to:
  /// **'Quote accepted'**
  String get agentQuoteAccepted;

  /// Dialog title: reject a hospital quote.
  ///
  /// In en, this message translates to:
  /// **'Reject quote'**
  String get agentRejectQuoteTitle;

  /// Dialog field: optional reason.
  ///
  /// In en, this message translates to:
  /// **'Reason (optional)'**
  String get agentReasonOptional;

  /// Button: reject a hospital quote.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get agentQuoteReject;

  /// Snack bar after rejecting a quote.
  ///
  /// In en, this message translates to:
  /// **'Quote rejected'**
  String get agentQuoteRejected;

  /// Confirm dialog title: cancel a case.
  ///
  /// In en, this message translates to:
  /// **'Cancel this case?'**
  String get agentCancelCaseTitle;

  /// Confirm dialog message: cancel a case.
  ///
  /// In en, this message translates to:
  /// **'The hospital will be notified.'**
  String get agentCancelCaseMessage;

  /// Button / tooltip: cancel a case.
  ///
  /// In en, this message translates to:
  /// **'Cancel case'**
  String get agentCancelCase;

  /// Snack bar after cancelling a case.
  ///
  /// In en, this message translates to:
  /// **'Case cancelled'**
  String get agentCaseCancelled;

  /// Case detail title while the case number is loading.
  ///
  /// In en, this message translates to:
  /// **'Case'**
  String get agentCaseFallbackTitle;

  /// Case detail row label: care coordinator.
  ///
  /// In en, this message translates to:
  /// **'Coordinator'**
  String get agentCaseCoordinator;

  /// Case detail row label: date the case was opened.
  ///
  /// In en, this message translates to:
  /// **'Opened'**
  String get agentCaseOpenedLabel;

  /// Case detail row label: patient notes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get agentCaseNotes;

  /// Button / screen title: book the treatment of an accepted quote.
  ///
  /// In en, this message translates to:
  /// **'Book treatment'**
  String get agentBookTreatment;

  /// Case detail booking card: admission date and balance due.
  ///
  /// In en, this message translates to:
  /// **'Admission {date} · balance {balance}'**
  String agentCaseBookingSummary(String date, String balance);

  /// Case detail section: hospital quotes.
  ///
  /// In en, this message translates to:
  /// **'Quotes'**
  String get agentQuotesSection;

  /// Case detail: link to the quote comparison.
  ///
  /// In en, this message translates to:
  /// **'Compare hospitals'**
  String get agentCompareHospitals;

  /// Case detail: no quote yet.
  ///
  /// In en, this message translates to:
  /// **'Waiting for {hospital} to send an itemised quote.'**
  String agentQuotesWaiting(String hospital);

  /// Case detail quote card header with the quote date.
  ///
  /// In en, this message translates to:
  /// **'Quote · {date}'**
  String agentQuoteDated(String date);

  /// Case detail section: status history.
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get agentTimelineSection;

  /// Quote comparison: empty state.
  ///
  /// In en, this message translates to:
  /// **'No quotes to compare yet'**
  String get agentCompareEmpty;

  /// Quote comparison: empty state hint.
  ///
  /// In en, this message translates to:
  /// **'Request quotes from several hospitals; they appear here as soon as hospitals reply.'**
  String get agentCompareEmptyHint;

  /// Screen title / button: request a quote from a hospital.
  ///
  /// In en, this message translates to:
  /// **'Request a quote'**
  String get agentRequestAQuote;

  /// Quote comparison banner: cheapest quote (only one quote).
  ///
  /// In en, this message translates to:
  /// **'Best price: {price} at {hospital}.'**
  String agentCompareBestPrice(String price, String hospital);

  /// Quote comparison banner: cheapest quote and saving versus the most expensive one.
  ///
  /// In en, this message translates to:
  /// **'Best price: {price} at {hospital} — saves {savings} vs the highest quote.'**
  String agentCompareBestPriceSaves(String price, String hospital, String savings);

  /// Quote comparison warning.
  ///
  /// In en, this message translates to:
  /// **'Quotes are in different currencies; compare totals with care.'**
  String get agentCompareMixedCurrencies;

  /// Quote comparison button: ask one more hospital for a quote.
  ///
  /// In en, this message translates to:
  /// **'Request another hospital'**
  String get agentCompareRequestAnother;

  /// Quote comparison row label: estimated hospital stay.
  ///
  /// In en, this message translates to:
  /// **'Stay'**
  String get agentCompareStay;

  /// Quote comparison row label: quote validity.
  ///
  /// In en, this message translates to:
  /// **'Valid until'**
  String get agentCompareValidUntil;

  /// Confirm dialog title: accept this hospital's quote.
  ///
  /// In en, this message translates to:
  /// **'Accept {hospital}?'**
  String agentCompareAcceptTitle(String hospital);

  /// Confirm dialog message: quote total.
  ///
  /// In en, this message translates to:
  /// **'Total {total}'**
  String agentCompareAcceptMessage(String total);

  /// Quote comparison badge on the cheapest quote.
  ///
  /// In en, this message translates to:
  /// **'Best'**
  String get agentCompareBest;

  /// Quote comparison cell: estimated stay in days.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} day} other{{count} days}}'**
  String agentCompareStayDays(int count);

  /// Snack bar after requesting a quote.
  ///
  /// In en, this message translates to:
  /// **'Quote requested from {hospital}'**
  String agentQuoteRequestedFrom(String hospital);

  /// Request quote: hospital search hint.
  ///
  /// In en, this message translates to:
  /// **'Search hospitals'**
  String get agentSearchHospitalsHint;

  /// Request quote: no search results.
  ///
  /// In en, this message translates to:
  /// **'No hospitals found'**
  String get agentNoHospitalsFound;

  /// Request quote: notes field.
  ///
  /// In en, this message translates to:
  /// **'Notes for the hospital (optional)'**
  String get agentNotesForHospitalOptional;

  /// Request quote button before a hospital is chosen.
  ///
  /// In en, this message translates to:
  /// **'Select a hospital'**
  String get agentSelectHospital;

  /// Request quote button with the chosen hospital.
  ///
  /// In en, this message translates to:
  /// **'Request quote from {hospital}'**
  String agentRequestQuoteFrom(String hospital);

  /// Agent bookings list title.
  ///
  /// In en, this message translates to:
  /// **'Bookings & payments'**
  String get agentBookingsTitle;

  /// Agent bookings list: empty state.
  ///
  /// In en, this message translates to:
  /// **'No bookings'**
  String get agentBookingsEmpty;

  /// Agent bookings list: empty state hint.
  ///
  /// In en, this message translates to:
  /// **'Accept a hospital quote, then book the treatment for your patient.'**
  String get agentBookingsEmptyHint;

  /// Booking row: admission date (lower case, after ' · ').
  ///
  /// In en, this message translates to:
  /// **'admission {date}'**
  String agentBookingAdmissionShort(String date);

  /// Booking row: balance still to pay (lower case).
  ///
  /// In en, this message translates to:
  /// **'due {amount}'**
  String agentBookingDueShort(String amount);

  /// Booking row: nothing left to pay (lower case).
  ///
  /// In en, this message translates to:
  /// **'paid in full'**
  String get agentBookingPaidInFull;

  /// Snack bar after a test (development) payment.
  ///
  /// In en, this message translates to:
  /// **'Test payment completed'**
  String get agentTestPaymentCompleted;

  /// Bank transfer details line: account holder.
  ///
  /// In en, this message translates to:
  /// **'Beneficiary: {name}'**
  String agentBankBeneficiary(String name);

  /// Bank transfer details line: bank name.
  ///
  /// In en, this message translates to:
  /// **'Bank: {bank}'**
  String agentBankName(String bank);

  /// Bank transfer details line: account number.
  ///
  /// In en, this message translates to:
  /// **'Account: {account}'**
  String agentBankAccount(String account);

  /// Bank transfer details line: payment reference to quote on the transfer.
  ///
  /// In en, this message translates to:
  /// **'Reference: {reference}'**
  String agentBankReference(String reference);

  /// Bank transfer details line: amount to transfer.
  ///
  /// In en, this message translates to:
  /// **'Amount: {amount}'**
  String agentBankAmount(String amount);

  /// Dialog title: bank details for a transfer.
  ///
  /// In en, this message translates to:
  /// **'Bank transfer details'**
  String get agentBankTransferDetailsTitle;

  /// Bank details dialog button.
  ///
  /// In en, this message translates to:
  /// **'Copy & close'**
  String get agentCopyAndClose;

  /// Dialog title: cancel a booking.
  ///
  /// In en, this message translates to:
  /// **'Cancel booking {bookingNumber}?'**
  String agentCancelBookingTitle(String bookingNumber);

  /// Dialog field: required reason.
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get agentReason;

  /// Button: cancel a booking.
  ///
  /// In en, this message translates to:
  /// **'Cancel booking'**
  String get agentCancelBooking;

  /// Snack bar after cancelling a booking; refund depends on the hospital's cancellation policy.
  ///
  /// In en, this message translates to:
  /// **'Booking cancelled; refund follows the hospital policy'**
  String get agentBookingCancelledRefund;

  /// Booking detail row label: procedure / package; price summary: treatment subtotal.
  ///
  /// In en, this message translates to:
  /// **'Treatment'**
  String get agentBookingTreatment;

  /// Booking detail row label: admission date.
  ///
  /// In en, this message translates to:
  /// **'Admission'**
  String get agentBookingAdmission;

  /// Booking detail row label: discharge date.
  ///
  /// In en, this message translates to:
  /// **'Discharge'**
  String get agentBookingDischarge;

  /// Booking detail row label.
  ///
  /// In en, this message translates to:
  /// **'Payment plan'**
  String get agentBookingPaymentPlan;

  /// Booking detail: payment plan with N monthly installments.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} monthly installment} other{{count} monthly installments}}'**
  String agentBookingMonthlyInstallments(int count);

  /// Booking detail section title.
  ///
  /// In en, this message translates to:
  /// **'Price summary'**
  String get agentPriceSummary;

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Discount'**
  String get agentPriceDiscount;

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Service fee'**
  String get agentPriceServiceFee;

  /// Price summary row.
  ///
  /// In en, this message translates to:
  /// **'Tax'**
  String get agentPriceTax;

  /// Price summary row: deposit amount.
  ///
  /// In en, this message translates to:
  /// **'Deposit'**
  String get agentPriceDeposit;

  /// Price summary row: amount paid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get agentPricePaid;

  /// Price summary row: amount refunded.
  ///
  /// In en, this message translates to:
  /// **'Refunded'**
  String get agentPriceRefunded;

  /// Price summary row: amount still to pay.
  ///
  /// In en, this message translates to:
  /// **'Balance due'**
  String get agentPriceBalanceDue;

  /// Button / sheet title: agent collects a payment for the booking.
  ///
  /// In en, this message translates to:
  /// **'Collect payment'**
  String get agentCollectPayment;

  /// Booking detail section: payment orders.
  ///
  /// In en, this message translates to:
  /// **'Payments'**
  String get agentPaymentsSection;

  /// Booking detail: no payments.
  ///
  /// In en, this message translates to:
  /// **'No payments yet.'**
  String get agentPaymentsEmpty;

  /// Booking detail button: open the related case.
  ///
  /// In en, this message translates to:
  /// **'Open case'**
  String get agentOpenCase;

  /// Booking detail section: installment schedule.
  ///
  /// In en, this message translates to:
  /// **'Installments'**
  String get agentInstallmentsSection;

  /// Installment row: due date.
  ///
  /// In en, this message translates to:
  /// **'Due {date}'**
  String agentInstallmentDue(String date);

  /// Installment row button: collect this installment.
  ///
  /// In en, this message translates to:
  /// **'Collect'**
  String get agentInstallmentCollect;

  /// Collect payment sheet hint.
  ///
  /// In en, this message translates to:
  /// **'The amount is computed by the server; the patient can also pay in their own app.'**
  String get agentCollectPaymentHint;

  /// Collect payment sheet: bank transfer option (keep SWIFT / NEFT).
  ///
  /// In en, this message translates to:
  /// **'Bank transfer (SWIFT / NEFT)'**
  String get agentCollectBankTransferOption;

  /// Collect payment sheet button with the approximate amount.
  ///
  /// In en, this message translates to:
  /// **'Continue · ~{amount}'**
  String agentCollectContinueAmount(String amount);

  /// Create booking section title.
  ///
  /// In en, this message translates to:
  /// **'Admission date'**
  String get agentAdmissionDate;

  /// Create booking: date picker placeholder.
  ///
  /// In en, this message translates to:
  /// **'Choose a date'**
  String get agentChooseDate;

  /// Create booking section title.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get agentPaymentSection;

  /// Create booking payment option: pay a deposit first.
  ///
  /// In en, this message translates to:
  /// **'Deposit'**
  String get agentPaymentOptionDeposit;

  /// Create booking payment option: pay in full.
  ///
  /// In en, this message translates to:
  /// **'Full'**
  String get agentPaymentOptionFull;

  /// Create booking payment option: monthly installment plan.
  ///
  /// In en, this message translates to:
  /// **'Plan'**
  String get agentPaymentOptionPlan;

  /// Create booking: installment plan length chip (3, 6 or 12).
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} month} other{{count} months}}'**
  String agentInstallmentMonthsChip(int count);

  /// Create booking checkbox.
  ///
  /// In en, this message translates to:
  /// **'Patient wants to claim insurance'**
  String get agentInsuranceClaim;

  /// Create booking submit button.
  ///
  /// In en, this message translates to:
  /// **'Create booking'**
  String get agentCreateBooking;

  /// Hospital portal bottom tab: dashboard.
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get hpTabDashboard;

  /// Hospital portal bottom tab and screen title: patient enquiries (cases) sent to the hospital.
  ///
  /// In en, this message translates to:
  /// **'Enquiries'**
  String get hpTabEnquiries;

  /// Hospital portal bottom tab: admitted / upcoming patients.
  ///
  /// In en, this message translates to:
  /// **'Patients'**
  String get hpTabPatients;

  /// Hospital portal bottom tab: money settlements / payouts to the hospital.
  ///
  /// In en, this message translates to:
  /// **'Settlements'**
  String get hpTabSettlements;

  /// Hospital portal bottom tab and screen title: more options.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get hpTabMore;

  /// Title of the hospital settlements screen (payments owed and paid to the hospital).
  ///
  /// In en, this message translates to:
  /// **'Settlements & payouts'**
  String get hpSettlementsTitle;

  /// App bar title of the hospital dashboard when no hospital name is known.
  ///
  /// In en, this message translates to:
  /// **'Hospital dashboard'**
  String get hpDashboardTitle;

  /// Empty state title: the user account is not linked to any hospital.
  ///
  /// In en, this message translates to:
  /// **'No hospital linked'**
  String get hpNoHospitalTitle;

  /// Empty state message when the user is not linked to a hospital.
  ///
  /// In en, this message translates to:
  /// **'Ask your hospital administrator to invite you as a member.'**
  String get hpNoHospitalMessage;

  /// Dashboard banner: the hospital listing is still a draft.
  ///
  /// In en, this message translates to:
  /// **'Your listing is a draft. Complete the profile on the hospital web portal and submit it for review.'**
  String get hpListingDraft;

  /// Dashboard banner: the hospital listing is waiting for approval.
  ///
  /// In en, this message translates to:
  /// **'Your listing is under review. Patients will see it once approved.'**
  String get hpListingPendingReview;

  /// Dashboard banner for other listing states (e.g. rejected, suspended). {status} is the lower-cased translated status label.
  ///
  /// In en, this message translates to:
  /// **'Your listing is {status}. Contact Heal India Global support.'**
  String hpListingOtherStatus(String status);

  /// Dashboard KPI tile: number of open patient enquiries.
  ///
  /// In en, this message translates to:
  /// **'Open enquiries'**
  String get hpKpiOpenEnquiries;

  /// Dashboard KPI tile: quotes sent and waiting for the patient to answer.
  ///
  /// In en, this message translates to:
  /// **'Quotes awaiting patient'**
  String get hpKpiQuotesAwaiting;

  /// Dashboard KPI tile: patients due to be admitted.
  ///
  /// In en, this message translates to:
  /// **'Upcoming admissions'**
  String get hpKpiUpcomingAdmissions;

  /// Dashboard KPI tile, admissions filter chip and section title: patients currently admitted and in treatment.
  ///
  /// In en, this message translates to:
  /// **'In treatment'**
  String get hpKpiInTreatment;

  /// Dashboard card label: revenue of the current month.
  ///
  /// In en, this message translates to:
  /// **'Revenue this month'**
  String get hpRevenueThisMonth;

  /// Dashboard chart title.
  ///
  /// In en, this message translates to:
  /// **'Revenue by month'**
  String get hpRevenueByMonth;

  /// Dashboard chart title.
  ///
  /// In en, this message translates to:
  /// **'Bookings by month'**
  String get hpBookingsByMonth;

  /// Dashboard section title: latest patient cases.
  ///
  /// In en, this message translates to:
  /// **'Recent cases'**
  String get hpRecentCases;

  /// Dashboard empty state: no patient enquiries received.
  ///
  /// In en, this message translates to:
  /// **'No enquiries yet'**
  String get hpNoEnquiriesYet;

  /// Enquiries filter chip for new (not yet answered) enquiries.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get hpEnquiriesFilterNew;

  /// Enquiries empty state when the "New" filter is selected.
  ///
  /// In en, this message translates to:
  /// **'No new enquiries'**
  String get hpNoNewEnquiries;

  /// Enquiries empty state for other status filters.
  ///
  /// In en, this message translates to:
  /// **'No cases'**
  String get hpNoCases;

  /// Enquiries empty state explanation.
  ///
  /// In en, this message translates to:
  /// **'Patients and agents send enquiries from the matching results.'**
  String get hpEnquiriesEmptyMessage;

  /// Dialog title: decline a patient enquiry. {caseNumber} is the case reference.
  ///
  /// In en, this message translates to:
  /// **'Decline {caseNumber}?'**
  String hpDeclineTitle(String caseNumber);

  /// Text field label in the decline dialog; the reason is shown to the patient.
  ///
  /// In en, this message translates to:
  /// **'Reason shared with the patient'**
  String get hpDeclineReasonLabel;

  /// Button: decline the enquiry.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get hpDeclineButton;

  /// Snack bar after declining an enquiry.
  ///
  /// In en, this message translates to:
  /// **'Enquiry declined'**
  String get hpEnquiryDeclined;

  /// Case detail app bar title while the case number is loading.
  ///
  /// In en, this message translates to:
  /// **'Case'**
  String get hpCaseFallbackTitle;

  /// Button: open the quote builder for a case.
  ///
  /// In en, this message translates to:
  /// **'Prepare quote'**
  String get hpPrepareQuote;

  /// Button: send a new version of the quote.
  ///
  /// In en, this message translates to:
  /// **'Send revised quote'**
  String get hpSendRevisedQuote;

  /// Shown instead of the patient name when it is unknown.
  ///
  /// In en, this message translates to:
  /// **'Patient'**
  String get hpPatientFallback;

  /// Short age / years of experience, e.g. "42 yrs".
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} yrs}}'**
  String hpYearsShort(int count);

  /// Info row label: requested treatment / procedure.
  ///
  /// In en, this message translates to:
  /// **'Treatment'**
  String get hpInfoTreatment;

  /// Info row label: doctor.
  ///
  /// In en, this message translates to:
  /// **'Doctor'**
  String get hpInfoDoctor;

  /// Info row label: the agency that referred the patient.
  ///
  /// In en, this message translates to:
  /// **'Via agent'**
  String get hpInfoViaAgent;

  /// Info row label: the patient coordinator.
  ///
  /// In en, this message translates to:
  /// **'Coordinator'**
  String get hpInfoCoordinator;

  /// Info row label: date the enquiry was received.
  ///
  /// In en, this message translates to:
  /// **'Received'**
  String get hpInfoReceived;

  /// Case detail card linking to the booking. {date} is a formatted date.
  ///
  /// In en, this message translates to:
  /// **'Booking {bookingNumber} · admission {date}'**
  String hpCaseBookingLine(String bookingNumber, String date);

  /// Section title: notes written by the patient.
  ///
  /// In en, this message translates to:
  /// **'Patient notes'**
  String get hpPatientNotes;

  /// Section title: the patient’s symptom screening answers.
  ///
  /// In en, this message translates to:
  /// **'Screening'**
  String get hpScreening;

  /// Info row label: medical specialty.
  ///
  /// In en, this message translates to:
  /// **'Specialty'**
  String get hpInfoSpecialty;

  /// Info row label: affected body areas.
  ///
  /// In en, this message translates to:
  /// **'Body areas'**
  String get hpInfoBodyAreas;

  /// Info row label: pain intensity out of 10.
  ///
  /// In en, this message translates to:
  /// **'Pain'**
  String get hpInfoPain;

  /// Info row label: reported symptoms.
  ///
  /// In en, this message translates to:
  /// **'Symptoms'**
  String get hpInfoSymptoms;

  /// Info row label: how long the symptoms have lasted.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get hpInfoDuration;

  /// Info row label: urgency level.
  ///
  /// In en, this message translates to:
  /// **'Urgency'**
  String get hpInfoUrgency;

  /// Section title: documents uploaded by the patient.
  ///
  /// In en, this message translates to:
  /// **'Medical documents'**
  String get hpMedicalDocuments;

  /// Section title: price quotes sent for this case.
  ///
  /// In en, this message translates to:
  /// **'Quotes'**
  String get hpQuotesSection;

  /// Shown when no quote has been sent for the case.
  ///
  /// In en, this message translates to:
  /// **'No quote sent yet.'**
  String get hpNoQuoteYet;

  /// Quote card header: date the quote was sent.
  ///
  /// In en, this message translates to:
  /// **'Sent {date}'**
  String hpQuoteSentOn(String date);

  /// Quote validation: the treatment plan is empty.
  ///
  /// In en, this message translates to:
  /// **'Describe the treatment plan'**
  String get hpQuoteProblemPlan;

  /// Quote validation: no line items.
  ///
  /// In en, this message translates to:
  /// **'Add at least one line item'**
  String get hpQuoteProblemNoLines;

  /// Quote validation: a line item is incomplete.
  ///
  /// In en, this message translates to:
  /// **'Every line item needs a description and an amount'**
  String get hpQuoteProblemIncompleteLine;

  /// Quote validation: too many line items.
  ///
  /// In en, this message translates to:
  /// **'At most 50 line items'**
  String get hpQuoteProblemTooManyLines;

  /// Confirmation dialog title before sending a quote to the patient.
  ///
  /// In en, this message translates to:
  /// **'Send quote?'**
  String get hpSendQuoteConfirmTitle;

  /// Confirmation dialog message. {total} is a formatted amount.
  ///
  /// In en, this message translates to:
  /// **'Total {total} — the patient is notified immediately.'**
  String hpSendQuoteConfirmMessage(String total);

  /// Snack bar after sending a quote.
  ///
  /// In en, this message translates to:
  /// **'Quote sent'**
  String get hpQuoteSent;

  /// Quote builder app bar title.
  ///
  /// In en, this message translates to:
  /// **'Quote · {caseNumber}'**
  String hpQuoteBuilderTitle(String caseNumber);

  /// Quote builder field label.
  ///
  /// In en, this message translates to:
  /// **'Treatment plan'**
  String get hpTreatmentPlanLabel;

  /// Quote builder field label.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get hpCurrencyLabel;

  /// Quote builder field label: estimated hospital stay in days.
  ///
  /// In en, this message translates to:
  /// **'Stay (days)'**
  String get hpStayDaysLabel;

  /// Quote builder: expiry date of the quote.
  ///
  /// In en, this message translates to:
  /// **'Valid until {date}'**
  String hpValidUntil(String date);

  /// Quote builder section title.
  ///
  /// In en, this message translates to:
  /// **'Line items'**
  String get hpLineItems;

  /// Quote builder button.
  ///
  /// In en, this message translates to:
  /// **'Add line item'**
  String get hpAddLineItem;

  /// Total amount label.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get hpTotal;

  /// Quote builder primary button.
  ///
  /// In en, this message translates to:
  /// **'Send quote'**
  String get hpSendQuote;

  /// Quote line field label.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get hpCategoryLabel;

  /// Quote line field label.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get hpDescriptionLabel;

  /// Quote line amount field label. {currency} is a currency code like INR.
  ///
  /// In en, this message translates to:
  /// **'Amount ({currency})'**
  String hpAmountLabel(String currency);

  /// Patients tab screen title.
  ///
  /// In en, this message translates to:
  /// **'Admissions'**
  String get hpAdmissionsTitle;

  /// Admissions filter chip: confirmed, not yet admitted.
  ///
  /// In en, this message translates to:
  /// **'Upcoming'**
  String get hpAdmissionsUpcoming;

  /// Admissions filter chip.
  ///
  /// In en, this message translates to:
  /// **'Discharged'**
  String get hpAdmissionsDischarged;

  /// Admissions filter chip.
  ///
  /// In en, this message translates to:
  /// **'Awaiting payment'**
  String get hpAdmissionsAwaitingPayment;

  /// Admissions filter chip.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get hpAdmissionsCancelled;

  /// Admissions empty state.
  ///
  /// In en, this message translates to:
  /// **'No upcoming patients'**
  String get hpAdmissionsEmptyUpcoming;

  /// Admissions empty state (kept close to the English wording).
  ///
  /// In en, this message translates to:
  /// **'No in treatment patients'**
  String get hpAdmissionsEmptyInTreatment;

  /// Admissions empty state.
  ///
  /// In en, this message translates to:
  /// **'No discharged patients'**
  String get hpAdmissionsEmptyDischarged;

  /// Admissions empty state.
  ///
  /// In en, this message translates to:
  /// **'No awaiting payment patients'**
  String get hpAdmissionsEmptyAwaitingPayment;

  /// Admissions empty state.
  ///
  /// In en, this message translates to:
  /// **'No cancelled patients'**
  String get hpAdmissionsEmptyCancelled;

  /// Admission card line: discharge date.
  ///
  /// In en, this message translates to:
  /// **'Discharged {date}'**
  String hpTileDischarged(String date);

  /// Admission card line: admission date of an admitted patient.
  ///
  /// In en, this message translates to:
  /// **'Admitted {date}'**
  String hpTileAdmitted(String date);

  /// Admission card line: planned admission date.
  ///
  /// In en, this message translates to:
  /// **'Admission {date}'**
  String hpTileAdmission(String date);

  /// Admission card suffix: days until admission.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{in {count} day} other{in {count} days}}'**
  String hpTileInDays(int count);

  /// Admit dialog title when the patient name is unknown.
  ///
  /// In en, this message translates to:
  /// **'Admit patient?'**
  String get hpAdmitPatientTitle;

  /// Admit dialog title.
  ///
  /// In en, this message translates to:
  /// **'Admit {name}?'**
  String hpAdmitNamedTitle(String name);

  /// Text field label in admit / discharge dialogs.
  ///
  /// In en, this message translates to:
  /// **'Note (optional)'**
  String get hpNoteOptional;

  /// Admit dialog confirm button.
  ///
  /// In en, this message translates to:
  /// **'Admit'**
  String get hpAdmitButton;

  /// Snack bar after admitting a patient.
  ///
  /// In en, this message translates to:
  /// **'Patient admitted'**
  String get hpPatientAdmitted;

  /// Date picker title for the discharge date.
  ///
  /// In en, this message translates to:
  /// **'Discharge date'**
  String get hpDischargeDate;

  /// Dialog title: note added when discharging a patient.
  ///
  /// In en, this message translates to:
  /// **'Discharge summary note'**
  String get hpDischargeNoteTitle;

  /// Discharge dialog confirm button.
  ///
  /// In en, this message translates to:
  /// **'Discharge'**
  String get hpDischargeButton;

  /// Snack bar after discharging a patient.
  ///
  /// In en, this message translates to:
  /// **'Patient discharged'**
  String get hpPatientDischarged;

  /// Snack bar after adding an itinerary item.
  ///
  /// In en, this message translates to:
  /// **'Added to itinerary'**
  String get hpAddedToItinerary;

  /// Booking detail app bar title while loading.
  ///
  /// In en, this message translates to:
  /// **'Booking'**
  String get hpBookingFallbackTitle;

  /// Button and section title: the patient’s itinerary (appointments, surgery, pickups).
  ///
  /// In en, this message translates to:
  /// **'Itinerary'**
  String get hpItinerary;

  /// Info row label: planned admission date.
  ///
  /// In en, this message translates to:
  /// **'Admission'**
  String get hpInfoAdmission;

  /// Info row label: actual admission time.
  ///
  /// In en, this message translates to:
  /// **'Admitted'**
  String get hpInfoAdmitted;

  /// Info row label: discharge date.
  ///
  /// In en, this message translates to:
  /// **'Discharge'**
  String get hpInfoDischarge;

  /// Info row label: number of days in hospital.
  ///
  /// In en, this message translates to:
  /// **'Length of stay'**
  String get hpInfoLengthOfStay;

  /// Number of days, e.g. length of stay.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} days}}'**
  String hpDays(int count);

  /// Info row label: amount paid so far.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get hpInfoPaid;

  /// Primary button on a confirmed booking.
  ///
  /// In en, this message translates to:
  /// **'Admit patient'**
  String get hpAdmitPatientButton;

  /// Primary button on an admitted booking.
  ///
  /// In en, this message translates to:
  /// **'Discharge patient'**
  String get hpDischargePatientButton;

  /// Shown on a booking that waits for the patient’s deposit payment.
  ///
  /// In en, this message translates to:
  /// **'Awaiting the patient deposit. Admission opens once the booking is confirmed.'**
  String get hpAwaitingDeposit;

  /// Button: open the medical case of the booking.
  ///
  /// In en, this message translates to:
  /// **'Open case'**
  String get hpOpenCase;

  /// Itinerary empty state on the booking detail.
  ///
  /// In en, this message translates to:
  /// **'No itinerary yet — add appointments, the surgery slot, pickup and follow-ups.'**
  String get hpNoItineraryYet;

  /// Snack bar after marking an itinerary item done.
  ///
  /// In en, this message translates to:
  /// **'Marked done'**
  String get hpItineraryMarkedDone;

  /// Snack bar after cancelling an itinerary item.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get hpItineraryCancelled;

  /// Snack bar after deleting an itinerary item.
  ///
  /// In en, this message translates to:
  /// **'Removed'**
  String get hpItineraryRemoved;

  /// Itinerary item menu action.
  ///
  /// In en, this message translates to:
  /// **'Mark done'**
  String get hpItineraryMarkDone;

  /// Bottom sheet title: add an itinerary item.
  ///
  /// In en, this message translates to:
  /// **'Add to itinerary'**
  String get hpAddToItinerary;

  /// Itinerary form field label: kind of item.
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get hpItineraryTypeLabel;

  /// Itinerary form field label.
  ///
  /// In en, this message translates to:
  /// **'Title (e.g. Pre-op consultation)'**
  String get hpItineraryTitleLabel;

  /// Itinerary form: pick date and time.
  ///
  /// In en, this message translates to:
  /// **'Date & time'**
  String get hpItineraryDateTime;

  /// Itinerary form field label.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get hpItineraryLocationLabel;

  /// Itinerary form field label.
  ///
  /// In en, this message translates to:
  /// **'Instructions for the patient (optional)'**
  String get hpItineraryInstructionsLabel;

  /// Screen title and More-menu entry: patients’ itineraries.
  ///
  /// In en, this message translates to:
  /// **'Itineraries'**
  String get hpItineraries;

  /// Itineraries screen: no admitted patients.
  ///
  /// In en, this message translates to:
  /// **'Nobody admitted right now.'**
  String get hpNobodyAdmitted;

  /// Itineraries screen section title.
  ///
  /// In en, this message translates to:
  /// **'Upcoming arrivals'**
  String get hpUpcomingArrivals;

  /// Itineraries screen: no confirmed bookings.
  ///
  /// In en, this message translates to:
  /// **'No confirmed bookings.'**
  String get hpNoConfirmedBookings;

  /// More menu: subtitle of the Itineraries entry.
  ///
  /// In en, this message translates to:
  /// **'Appointments, surgery slots, pickups'**
  String get hpMoreItinerariesSubtitle;

  /// More menu entry and screen title: medical visa invitation letters.
  ///
  /// In en, this message translates to:
  /// **'Visa invitation letters'**
  String get hpVisaLettersTitle;

  /// More menu: subtitle of the visa entry.
  ///
  /// In en, this message translates to:
  /// **'Medical visa requests from patients'**
  String get hpMoreVisasSubtitle;

  /// More menu entry and screen title.
  ///
  /// In en, this message translates to:
  /// **'Doctors'**
  String get hpDoctorsTitle;

  /// More menu: subtitle of the Doctors entry.
  ///
  /// In en, this message translates to:
  /// **'Your specialists and their profiles'**
  String get hpMoreDoctorsSubtitle;

  /// More menu: subtitle of the Price list entry.
  ///
  /// In en, this message translates to:
  /// **'Procedures, price ranges and packages'**
  String get hpMorePriceListSubtitle;

  /// Section title: choose which hospital the user is working for.
  ///
  /// In en, this message translates to:
  /// **'Acting for'**
  String get hpActingFor;

  /// Note on the More screen.
  ///
  /// In en, this message translates to:
  /// **'Profile, members, availability and price edits are available on the hospital web portal.'**
  String get hpWebPortalNote;

  /// Visa screen empty state.
  ///
  /// In en, this message translates to:
  /// **'No visa requests'**
  String get hpNoVisaRequests;

  /// Visa request card: the hospital must upload an invitation letter.
  ///
  /// In en, this message translates to:
  /// **'Invitation letter needed'**
  String get hpInvitationLetterNeeded;

  /// Visa sheet title when the patient name is unknown.
  ///
  /// In en, this message translates to:
  /// **'Visa request'**
  String get hpVisaRequestFallback;

  /// Visa sheet: no letter uploaded.
  ///
  /// In en, this message translates to:
  /// **'No invitation letter yet'**
  String get hpNoInvitationLetterYet;

  /// Visa sheet: a letter is uploaded (file name unknown).
  ///
  /// In en, this message translates to:
  /// **'Invitation letter: uploaded'**
  String get hpInvitationLetterUploaded;

  /// Visa sheet: the uploaded letter file name.
  ///
  /// In en, this message translates to:
  /// **'Invitation letter: {fileName}'**
  String hpInvitationLetterNamed(String fileName);

  /// Button: replace the uploaded file.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get hpReplace;

  /// Visa sheet field label.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get hpStatusLabel;

  /// Visa sheet field label: reference number of the Indian e-Visa application.
  ///
  /// In en, this message translates to:
  /// **'e-Visa application reference'**
  String get hpEvisaReferenceLabel;

  /// Field label.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get hpNotesLabel;

  /// Doctors screen empty state.
  ///
  /// In en, this message translates to:
  /// **'No doctors listed'**
  String get hpNoDoctorsListed;

  /// Badge: the doctor offers video consultations.
  ///
  /// In en, this message translates to:
  /// **'Tele-consult'**
  String get hpTeleconsultBadge;

  /// Badge: doctor consultation fee. {fee} is a formatted amount.
  ///
  /// In en, this message translates to:
  /// **'Fee {fee}'**
  String hpConsultationFee(String fee);

  /// More menu entry and screen title: the hospital’s procedure prices.
  ///
  /// In en, this message translates to:
  /// **'Price list'**
  String get priceListTitle;

  /// Price list empty state.
  ///
  /// In en, this message translates to:
  /// **'No procedures priced yet'**
  String get priceListEmpty;

  /// Price list: typical hospital stay, e.g. "5 day stay".
  ///
  /// In en, this message translates to:
  /// **'{count, plural, other{{count} day stay}}'**
  String priceListStayDays(int count);

  /// Price list: success rate of the procedure. {rate} is a whole number.
  ///
  /// In en, this message translates to:
  /// **'{rate}% success'**
  String priceListSuccessRate(String rate);

  /// App bar title of the AI report analysis screen.
  ///
  /// In en, this message translates to:
  /// **'Your report'**
  String get reportAnalysisTitle;

  /// Snack bar after the patient confirmed the reviewed report.
  ///
  /// In en, this message translates to:
  /// **'Report confirmed.'**
  String get reportConfirmedSnack;

  /// Snack bar: page limit of one report reached.
  ///
  /// In en, this message translates to:
  /// **'{max, plural, other{A report can have up to {max} pages.}}'**
  String reportMaxPages(int max);

  /// Snack bar: a picked file exceeds the upload limit.
  ///
  /// In en, this message translates to:
  /// **'{fileName} is too large (max 20 MB).'**
  String reportFileTooLarge(String fileName);

  /// Error when camera or photo permission is denied.
  ///
  /// In en, this message translates to:
  /// **'Please allow camera / photo access in your phone settings to add pages.'**
  String get reportPermissionNeeded;

  /// Progress text while uploading report pages.
  ///
  /// In en, this message translates to:
  /// **'Uploading page {current} of {total}…'**
  String reportUploadingPage(int current, int total);

  /// Progress text: the uploaded report is being sent for AI reading.
  ///
  /// In en, this message translates to:
  /// **'Sending to AI…'**
  String get reportSendingToAi;

  /// App bar title while the patient reviews the AI reading.
  ///
  /// In en, this message translates to:
  /// **'Review your report'**
  String get reportReviewTitle;

  /// App bar title of the report capture screen.
  ///
  /// In en, this message translates to:
  /// **'Add a medical report'**
  String get reportCaptureTitle;

  /// Intro text of the report capture screen.
  ///
  /// In en, this message translates to:
  /// **'Take a photo of each page of a paper report, choose photos, or upload a PDF.'**
  String get reportCaptureIntro;

  /// Capture source button (short).
  ///
  /// In en, this message translates to:
  /// **'Take photo'**
  String get reportTakePhoto;

  /// Capture source button (short).
  ///
  /// In en, this message translates to:
  /// **'Choose from gallery'**
  String get reportChooseFromGallery;

  /// Capture source button (short).
  ///
  /// In en, this message translates to:
  /// **'Upload PDF'**
  String get reportUploadPdf;

  /// Heading with the number of added pages and the maximum.
  ///
  /// In en, this message translates to:
  /// **'Pages ({count}/{max})'**
  String reportPagesCount(int count, int max);

  /// Empty state with a photo tip.
  ///
  /// In en, this message translates to:
  /// **'No pages yet. Tip: lay the page flat in good light and fill the frame.'**
  String get reportNoPagesTip;

  /// Heading above the document kind chips.
  ///
  /// In en, this message translates to:
  /// **'What kind of document is it?'**
  String get reportKindQuestion;

  /// Consent switch title and submit button: let the AI read the report.
  ///
  /// In en, this message translates to:
  /// **'Read my report with AI'**
  String get reportReadWithAi;

  /// AI processing consent explanation under the "Read my report with AI" switch. Sensitive: privacy / AI consent wording.
  ///
  /// In en, this message translates to:
  /// **'Our AI assistant reads the pages and lists your test results, diagnoses and medicines. You check and correct everything before it is used, and it is only shared with hospitals you choose. You can switch this off and simply upload the report.'**
  String get reportAiConsentText;

  /// Submit button when AI reading is switched off.
  ///
  /// In en, this message translates to:
  /// **'Upload report'**
  String get reportUploadButton;

  /// Page tile title.
  ///
  /// In en, this message translates to:
  /// **'Page {number}'**
  String reportPageNumber(int number);

  /// Tooltip of the remove-page button.
  ///
  /// In en, this message translates to:
  /// **'Remove page {number}'**
  String reportRemovePage(int number);

  /// Tooltip of the drag handle.
  ///
  /// In en, this message translates to:
  /// **'Drag to reorder'**
  String get reportDragToReorder;

  /// Tooltip of the app bar button opening AI report reading.
  ///
  /// In en, this message translates to:
  /// **'Read reports with AI'**
  String get reportAiEntryTooltip;

  /// Bottom sheet title listing AI report readings.
  ///
  /// In en, this message translates to:
  /// **'Your reports, read by AI'**
  String get reportSheetTitle;

  /// Bottom sheet intro text.
  ///
  /// In en, this message translates to:
  /// **'Photograph a paper report or pick a PDF. You check and confirm everything before it is used.'**
  String get reportSheetIntro;

  /// Button: start capturing a report.
  ///
  /// In en, this message translates to:
  /// **'Scan a report'**
  String get reportScanButton;

  /// Empty state: no AI report readings.
  ///
  /// In en, this message translates to:
  /// **'No AI readings yet.'**
  String get reportNoReadings;

  /// Report card title when the document type is unknown.
  ///
  /// In en, this message translates to:
  /// **'Medical report'**
  String get reportMedicalReportFallback;

  /// Title of the red-flag banner on a report card (warning signs found in the report).
  ///
  /// In en, this message translates to:
  /// **'Important'**
  String get reportImportant;

  /// Title of the banner listing lab values flagged critical.
  ///
  /// In en, this message translates to:
  /// **'Critical values'**
  String get reportCriticalValues;

  /// Section title: plain-language summary of the report.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get reportSummary;

  /// Section title: main findings in the report.
  ///
  /// In en, this message translates to:
  /// **'Key findings'**
  String get reportKeyFindings;

  /// Section title: laboratory test values.
  ///
  /// In en, this message translates to:
  /// **'Lab values'**
  String get reportLabValues;

  /// Section title: medicines mentioned in the report.
  ///
  /// In en, this message translates to:
  /// **'Medications'**
  String get reportMedications;

  /// Section title: diagnoses written in the report (not a diagnosis by the app).
  ///
  /// In en, this message translates to:
  /// **'Diagnoses mentioned'**
  String get reportDiagnosesMentioned;

  /// Section title: procedures written in the report.
  ///
  /// In en, this message translates to:
  /// **'Procedures mentioned'**
  String get reportProceduresMentioned;

  /// Section title: recommendations written in the report.
  ///
  /// In en, this message translates to:
  /// **'Recommendations'**
  String get reportRecommendations;

  /// AI disclaimer shown under every AI report reading. Sensitive: must keep the meaning that this is machine output to be checked with a doctor.
  ///
  /// In en, this message translates to:
  /// **'AI-generated — always confirm with your doctor.'**
  String get reportAiDisclaimer;

  /// Report status badge: the patient confirmed the reading.
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get reportStatusConfirmed;

  /// Report status badge: the patient discarded the AI reading.
  ///
  /// In en, this message translates to:
  /// **'Discarded'**
  String get reportStatusDiscarded;

  /// Report status badge: the AI is reading the report.
  ///
  /// In en, this message translates to:
  /// **'Reading…'**
  String get reportStatusReading;

  /// Report status badge: the AI could not read the report.
  ///
  /// In en, this message translates to:
  /// **'Not read'**
  String get reportStatusNotRead;

  /// Report status badge: the AI reading waits for the patient to check it.
  ///
  /// In en, this message translates to:
  /// **'Needs review'**
  String get reportStatusNeedsReview;

  /// Lab table column header and field label: name of the lab test.
  ///
  /// In en, this message translates to:
  /// **'Test'**
  String get reportLabTest;

  /// Lab table column header: test result.
  ///
  /// In en, this message translates to:
  /// **'Result'**
  String get reportLabResult;

  /// Lab table column header: reference range.
  ///
  /// In en, this message translates to:
  /// **'Range'**
  String get reportLabRange;

  /// Marker shown where the patient changed the AI output.
  ///
  /// In en, this message translates to:
  /// **'Edited'**
  String get reportEdited;

  /// Field label and date picker title: date of the report.
  ///
  /// In en, this message translates to:
  /// **'Report date'**
  String get reportDateLabel;

  /// Banner title in the review form listing critical lab values.
  ///
  /// In en, this message translates to:
  /// **'Critical values in this report'**
  String get reportCriticalValuesInReport;

  /// Review form section title: document type, date and facility.
  ///
  /// In en, this message translates to:
  /// **'About this report'**
  String get reportAboutSection;

  /// Review form field label.
  ///
  /// In en, this message translates to:
  /// **'Document type'**
  String get reportDocTypeLabel;

  /// Tooltip: clear the report date.
  ///
  /// In en, this message translates to:
  /// **'Clear date'**
  String get reportClearDate;

  /// Shown when the report date is unknown.
  ///
  /// In en, this message translates to:
  /// **'Not stated'**
  String get reportDateNotStated;

  /// Review form field label: where the report was issued.
  ///
  /// In en, this message translates to:
  /// **'Hospital / laboratory'**
  String get reportFacilityLabel;

  /// Hint of the summary field.
  ///
  /// In en, this message translates to:
  /// **'What the report says, in plain words'**
  String get reportSummaryHint;

  /// Review form button: add a key finding.
  ///
  /// In en, this message translates to:
  /// **'Add finding'**
  String get findingAdd;

  /// Tooltip: remove a key finding.
  ///
  /// In en, this message translates to:
  /// **'Remove finding {number}'**
  String findingRemove(int number);

  /// Review form field label: one key finding.
  ///
  /// In en, this message translates to:
  /// **'Finding'**
  String get findingLabel;

  /// Review form button: add a lab value.
  ///
  /// In en, this message translates to:
  /// **'Add value'**
  String get labAddValue;

  /// Tooltip: remove a lab value row.
  ///
  /// In en, this message translates to:
  /// **'Remove lab value {number}'**
  String labRemoveValue(int number);

  /// Review form field label: lab result value.
  ///
  /// In en, this message translates to:
  /// **'Value'**
  String get labValueLabel;

  /// Review form field label: unit of the lab value.
  ///
  /// In en, this message translates to:
  /// **'Unit'**
  String get labUnitLabel;

  /// Review form field label: normal range of the lab value.
  ///
  /// In en, this message translates to:
  /// **'Reference range'**
  String get labReferenceRangeLabel;

  /// Review form button.
  ///
  /// In en, this message translates to:
  /// **'Add medication'**
  String get reportAddMedication;

  /// Tooltip: remove a medication row.
  ///
  /// In en, this message translates to:
  /// **'Remove medication {number}'**
  String reportRemoveMedication(int number);

  /// Review form field label: medicine name.
  ///
  /// In en, this message translates to:
  /// **'Medicine'**
  String get reportMedicineLabel;

  /// Review form field label: medicine dose.
  ///
  /// In en, this message translates to:
  /// **'Dose'**
  String get reportDoseLabel;

  /// Review form field label: how often the medicine is taken.
  ///
  /// In en, this message translates to:
  /// **'How often'**
  String get reportFrequencyLabel;

  /// Review form button.
  ///
  /// In en, this message translates to:
  /// **'Add diagnosis'**
  String get reportAddDiagnosis;

  /// Review form button.
  ///
  /// In en, this message translates to:
  /// **'Add procedure'**
  String get reportAddProcedure;

  /// Review form button.
  ///
  /// In en, this message translates to:
  /// **'Add recommendation'**
  String get reportAddRecommendation;

  /// Shown under an empty list section of the review form.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get reportNone;
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
