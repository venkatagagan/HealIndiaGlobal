// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Bengali Bangla (`bn`).
class AppLocalizationsBn extends AppLocalizations {
  AppLocalizationsBn([String locale = 'bn']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'ভারতের উৎকৃষ্ট চিকিৎসার পথে আপনার প্রবেশদ্বার';

  @override
  String get commonCancel => 'বাতিল';

  @override
  String get commonOk => 'ঠিক আছে';

  @override
  String get commonSave => 'সংরক্ষণ করুন';

  @override
  String get commonRetry => 'আবার চেষ্টা করুন';

  @override
  String get commonTryAgain => 'আবার চেষ্টা করুন';

  @override
  String get commonClose => 'বন্ধ করুন';

  @override
  String get commonContinue => 'চালিয়ে যান';

  @override
  String get commonBack => 'পিছনে';

  @override
  String get commonNext => 'পরবর্তী';

  @override
  String get commonDone => 'সম্পন্ন';

  @override
  String get commonEdit => 'সম্পাদনা';

  @override
  String get commonDelete => 'মুছে ফেলুন';

  @override
  String get commonRemove => 'সরান';

  @override
  String get commonSubmit => 'জমা দিন';

  @override
  String get commonConfirm => 'নিশ্চিত করুন';

  @override
  String get commonYes => 'হ্যাঁ';

  @override
  String get commonNo => 'না';

  @override
  String get commonSeeAll => 'সব দেখুন';

  @override
  String get commonApply => 'প্রয়োগ করুন';

  @override
  String get commonReset => 'রিসেট';

  @override
  String get commonClear => 'মুছুন';

  @override
  String get commonSkip => 'এড়িয়ে যান';

  @override
  String get commonSend => 'পাঠান';

  @override
  String get commonOpen => 'খুলুন';

  @override
  String get commonDownload => 'ডাউনলোড';

  @override
  String get commonUpload => 'আপলোড';

  @override
  String get commonAdd => 'যোগ করুন';

  @override
  String get commonOptional => 'ঐচ্ছিক';

  @override
  String get commonLoading => 'লোড হচ্ছে…';

  @override
  String get commonSomethingWentWrong => 'কিছু একটা ভুল হয়েছে';

  @override
  String get commonErrorDisplayingSection => 'এই অংশটি দেখাতে সমস্যা হয়েছে।';

  @override
  String get commonLogOut => 'লগ আউট';

  @override
  String get commonDeleteAccount => 'অ্যাকাউন্ট মুছুন';

  @override
  String get commonAccount => 'অ্যাকাউন্ট';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'ভাষা';

  @override
  String get languagePickerTitle => 'অ্যাপের ভাষা';

  @override
  String get languagePickerHint =>
      'অ্যাপ, এআই সারাংশ এবং ভয়েস ইনটেক এই ভাষা ব্যবহার করে। সম্ভব হলে সমন্বয়কারী ও হাসপাতাল আপনার সঙ্গে এই ভাষায় যোগাযোগ করবে।';

  @override
  String languageChanged(String language) {
    return 'ভাষা পরিবর্তন করে $language করা হয়েছে।';
  }

  @override
  String get languageProfileSyncFailed =>
      'এই ডিভাইসে ভাষা পরিবর্তন হয়েছে। আপনার প্রোফাইলে এটি সংরক্ষণ করা যায়নি; আমরা পরে আবার চেষ্টা করব।';

  @override
  String get languageButtonTooltip => 'ভাষা পরিবর্তন করুন';

  @override
  String get datesJustNow => 'এইমাত্র';

  @override
  String datesMinutesAgo(int minutes) {
    return '$minutes মিনিট আগে';
  }

  @override
  String datesHoursAgo(int hours) {
    return '$hours ঘণ্টা আগে';
  }

  @override
  String get datesYesterday => 'গতকাল';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days দিন আগে');
    return '$_temp0';
  }
}
