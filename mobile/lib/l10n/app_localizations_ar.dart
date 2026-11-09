// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'بوابتك إلى التميّز الطبي في الهند';

  @override
  String get commonCancel => 'إلغاء';

  @override
  String get commonOk => 'حسنًا';

  @override
  String get commonSave => 'حفظ';

  @override
  String get commonRetry => 'إعادة المحاولة';

  @override
  String get commonTryAgain => 'حاول مرة أخرى';

  @override
  String get commonClose => 'إغلاق';

  @override
  String get commonContinue => 'متابعة';

  @override
  String get commonBack => 'رجوع';

  @override
  String get commonNext => 'التالي';

  @override
  String get commonDone => 'تم';

  @override
  String get commonEdit => 'تعديل';

  @override
  String get commonDelete => 'حذف';

  @override
  String get commonRemove => 'إزالة';

  @override
  String get commonSubmit => 'إرسال';

  @override
  String get commonConfirm => 'تأكيد';

  @override
  String get commonYes => 'نعم';

  @override
  String get commonNo => 'لا';

  @override
  String get commonSeeAll => 'عرض الكل';

  @override
  String get commonApply => 'تطبيق';

  @override
  String get commonReset => 'إعادة ضبط';

  @override
  String get commonClear => 'مسح';

  @override
  String get commonSkip => 'تخطٍّ';

  @override
  String get commonSend => 'إرسال';

  @override
  String get commonOpen => 'فتح';

  @override
  String get commonDownload => 'تنزيل';

  @override
  String get commonUpload => 'رفع';

  @override
  String get commonAdd => 'إضافة';

  @override
  String get commonOptional => 'اختياري';

  @override
  String get commonLoading => 'جارٍ التحميل…';

  @override
  String get commonSomethingWentWrong => 'حدث خطأ ما';

  @override
  String get commonErrorDisplayingSection => 'حدث خطأ أثناء عرض هذا القسم.';

  @override
  String get commonLogOut => 'تسجيل الخروج';

  @override
  String get commonDeleteAccount => 'حذف الحساب';

  @override
  String get commonAccount => 'الحساب';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'اللغة';

  @override
  String get languagePickerTitle => 'لغة التطبيق';

  @override
  String get languagePickerHint =>
      'يستخدم التطبيق وملخصات الذكاء الاصطناعي والإدخال الصوتي هذه اللغة. وسيتواصل معك المنسقون والمستشفيات بها متى أمكن.';

  @override
  String languageChanged(String language) {
    return 'تم تغيير اللغة إلى $language.';
  }

  @override
  String get languageProfileSyncFailed =>
      'تم تغيير اللغة على هذا الجهاز. لم نتمكن من حفظها في ملفك الشخصي، وسنحاول مرة أخرى لاحقًا.';

  @override
  String get languageButtonTooltip => 'تغيير اللغة';

  @override
  String get datesJustNow => 'الآن';

  @override
  String datesMinutesAgo(int minutes) {
    return 'قبل $minutes د';
  }

  @override
  String datesHoursAgo(int hours) {
    return 'قبل $hours س';
  }

  @override
  String get datesYesterday => 'أمس';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'قبل $days يوم',
      many: 'قبل $days يومًا',
      few: 'قبل $days أيام',
      two: 'قبل يومين',
      one: 'قبل يوم واحد',
      zero: 'قبل $days يوم',
    );
    return '$_temp0';
  }
}
