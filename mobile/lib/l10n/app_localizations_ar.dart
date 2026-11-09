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

  @override
  String get enumUserRolePatient => 'مريض';

  @override
  String get enumUserRoleAgent => 'وكيل';

  @override
  String get enumUserRoleHospital => 'مستشفى';

  @override
  String get enumUserRoleAdmin => 'مسؤول';

  @override
  String get enumUserRoleFinance => 'المالية';

  @override
  String get enumUserRoleSupport => 'الدعم';

  @override
  String get enumUserRoleSuperAdmin => 'مسؤول أعلى';

  @override
  String get enumUserStatusActive => 'نشط';

  @override
  String get enumUserStatusPendingVerification => 'بانتظار التحقق';

  @override
  String get enumUserStatusSuspended => 'موقوف';

  @override
  String get enumUserStatusDeleted => 'محذوف';

  @override
  String get enumGenderMale => 'ذكر';

  @override
  String get enumGenderFemale => 'أنثى';

  @override
  String get enumGenderOther => 'أخرى';

  @override
  String get enumGenderUndisclosed => 'غير محدد';

  @override
  String get enumDoctorGenderPrefMale => 'ذكر';

  @override
  String get enumDoctorGenderPrefFemale => 'أنثى';

  @override
  String get enumDoctorGenderPrefNoPreference => 'لا تفضيل';

  @override
  String get enumKycStatusNotSubmitted => 'لم يُرسل';

  @override
  String get enumKycStatusPending => 'قيد الانتظار';

  @override
  String get enumKycStatusApproved => 'موافق عليه';

  @override
  String get enumKycStatusRejected => 'مرفوض';

  @override
  String get enumHospitalStatusDraft => 'مسودة';

  @override
  String get enumHospitalStatusPendingReview => 'بانتظار المراجعة';

  @override
  String get enumHospitalStatusActive => 'نشط';

  @override
  String get enumHospitalStatusSuspended => 'موقوف';

  @override
  String get enumHospitalStatusRejected => 'مرفوض';

  @override
  String get enumAgentStatusPending => 'قيد الانتظار';

  @override
  String get enumAgentStatusActive => 'نشط';

  @override
  String get enumAgentStatusSuspended => 'موقوف';

  @override
  String get enumAgentStatusRejected => 'مرفوض';

  @override
  String get enumHospitalMemberRoleOwner => 'المالك';

  @override
  String get enumHospitalMemberRoleAdmin => 'مسؤول';

  @override
  String get enumHospitalMemberRoleCoordinator => 'منسق';

  @override
  String get enumHospitalMemberRoleFinance => 'المالية';

  @override
  String get enumHospitalMemberRoleDoctor => 'طبيب';

  @override
  String get enumPackageTierMedicalOnly => 'علاج طبي فقط';

  @override
  String get enumPackageTierMedicalStay => 'علاج طبي + إقامة';

  @override
  String get enumPackageTierAllInclusive => 'شامل كليًا';

  @override
  String get enumScreeningStatusDraft => 'مسودة';

  @override
  String get enumScreeningStatusProcessing => 'قيد المعالجة';

  @override
  String get enumScreeningStatusCompleted => 'مكتمل';

  @override
  String get enumScreeningStatusFailed => 'فشل';

  @override
  String get enumUrgencyRoutine => 'روتيني';

  @override
  String get enumUrgencySoon => 'قريبًا';

  @override
  String get enumUrgencyUrgent => 'عاجل';

  @override
  String get enumUrgencyEmergency => 'طارئ';

  @override
  String get enumDurationUnitDays => 'أيام';

  @override
  String get enumDurationUnitWeeks => 'أسابيع';

  @override
  String get enumDurationUnitMonths => 'أشهر';

  @override
  String get enumDurationUnitYears => 'سنوات';

  @override
  String get enumSeverityLevelNone => 'لا يوجد';

  @override
  String get enumSeverityLevelMild => 'خفيف';

  @override
  String get enumSeverityLevelModerate => 'متوسط';

  @override
  String get enumSeverityLevelSevere => 'شديد';

  @override
  String get enumSymptomAnswerYes => 'نعم';

  @override
  String get enumSymptomAnswerMaybe => 'ربما';

  @override
  String get enumSymptomAnswerNo => 'لا';

  @override
  String get enumCaseStatusEnquiry => 'استفسار';

  @override
  String get enumCaseStatusQuoted => 'تم تقديم عرض سعر';

  @override
  String get enumCaseStatusAccepted => 'مقبول';

  @override
  String get enumCaseStatusBooked => 'محجوز';

  @override
  String get enumCaseStatusInTreatment => 'قيد العلاج';

  @override
  String get enumCaseStatusCompleted => 'مكتمل';

  @override
  String get enumCaseStatusCancelled => 'ملغى';

  @override
  String get enumCaseStatusDeclined => 'مرفوض';

  @override
  String get enumQuoteStatusDraft => 'مسودة';

  @override
  String get enumQuoteStatusSent => 'مُرسل';

  @override
  String get enumQuoteStatusAccepted => 'مقبول';

  @override
  String get enumQuoteStatusRejected => 'مرفوض';

  @override
  String get enumQuoteStatusExpired => 'منتهي الصلاحية';

  @override
  String get enumQuoteStatusWithdrawn => 'مسحوب';

  @override
  String get enumQuoteLineCategorySurgery => 'الجراحة';

  @override
  String get enumQuoteLineCategoryHospitalStay => 'الإقامة في المستشفى';

  @override
  String get enumQuoteLineCategoryMedications => 'الأدوية';

  @override
  String get enumQuoteLineCategoryTestsScans => 'الفحوصات والأشعة';

  @override
  String get enumQuoteLineCategoryDoctorFees => 'أتعاب الطبيب';

  @override
  String get enumQuoteLineCategoryImplants => 'الغرسات';

  @override
  String get enumQuoteLineCategoryOther => 'أخرى';

  @override
  String get enumBookingStatusPendingPayment => 'بانتظار الدفع';

  @override
  String get enumBookingStatusConfirmed => 'مؤكد';

  @override
  String get enumBookingStatusAdmitted => 'تم الإدخال';

  @override
  String get enumBookingStatusCompleted => 'مكتمل';

  @override
  String get enumBookingStatusCancelled => 'ملغى';

  @override
  String get enumPaymentOptionFull => 'الدفع كاملًا';

  @override
  String get enumPaymentOptionDeposit => 'عربون';

  @override
  String get enumPaymentOptionInstallments => 'خطة الدفع بالتقسيط';

  @override
  String get enumConsultationStatusRequested => 'مطلوب';

  @override
  String get enumConsultationStatusScheduled => 'مجدول';

  @override
  String get enumConsultationStatusCompleted => 'مكتمل';

  @override
  String get enumConsultationStatusCancelled => 'ملغى';

  @override
  String get enumChecklistStatusPending => 'قيد الانتظار';

  @override
  String get enumChecklistStatusInProgress => 'قيد التنفيذ';

  @override
  String get enumChecklistStatusDone => 'تم';

  @override
  String get enumItineraryKindAppointment => 'موعد';

  @override
  String get enumItineraryKindAdmission => 'الدخول إلى المستشفى';

  @override
  String get enumItineraryKindSurgery => 'الجراحة';

  @override
  String get enumItineraryKindPickup => 'الاستقبال';

  @override
  String get enumItineraryKindCheckin => 'تسجيل الوصول';

  @override
  String get enumItineraryKindCheckout => 'تسجيل المغادرة';

  @override
  String get enumItineraryKindFollowup => 'متابعة';

  @override
  String get enumItineraryKindSightseeing => 'جولة سياحية';

  @override
  String get enumItineraryKindOther => 'أخرى';

  @override
  String get enumVisaStatusNotStarted => 'لم يبدأ';

  @override
  String get enumVisaStatusDocumentsPending => 'المستندات قيد الانتظار';

  @override
  String get enumVisaStatusInvitationIssued => 'صدرت رسالة الدعوة';

  @override
  String get enumVisaStatusApplied => 'تم التقديم';

  @override
  String get enumVisaStatusApproved => 'موافق عليه';

  @override
  String get enumVisaStatusRejected => 'مرفوض';

  @override
  String get enumTravelKindFlight => 'رحلة جوية';

  @override
  String get enumTravelKindAirportPickup => 'الاستقبال من المطار';

  @override
  String get enumTravelKindAirportDrop => 'التوصيل إلى المطار';

  @override
  String get enumTravelKindLocalTransport => 'النقل المحلي';

  @override
  String get enumServiceBookingStatusRequested => 'مطلوب';

  @override
  String get enumServiceBookingStatusQuoted => 'تم تقديم عرض سعر';

  @override
  String get enumServiceBookingStatusConfirmed => 'مؤكد';

  @override
  String get enumServiceBookingStatusCompleted => 'مكتمل';

  @override
  String get enumServiceBookingStatusCancelled => 'ملغى';

  @override
  String get enumAccommodationTypeHotel => 'فندق';

  @override
  String get enumAccommodationTypeGuestHouse => 'دار ضيافة';

  @override
  String get enumAccommodationTypeServiceApartment => 'شقة فندقية';

  @override
  String get enumAccommodationTypeHospitalGuestRoom => 'غرفة ضيوف في المستشفى';

  @override
  String get enumServiceKindTranslator => 'مترجم';

  @override
  String get enumServiceKindLocalGuide => 'مرشد محلي';

  @override
  String get enumServiceKindTransport => 'النقل';

  @override
  String get enumServiceKindTravelAgent => 'وكيل سفر';

  @override
  String get enumServiceKindInsurance => 'التأمين';

  @override
  String get enumDocumentKindPassport => 'جواز السفر';

  @override
  String get enumDocumentKindVisa => 'التأشيرة';

  @override
  String get enumDocumentKindMedicalReport => 'تقرير طبي';

  @override
  String get enumDocumentKindPrescription => 'وصفة طبية';

  @override
  String get enumDocumentKindLabResult => 'نتيجة مختبر';

  @override
  String get enumDocumentKindImaging => 'التصوير الطبي';

  @override
  String get enumDocumentKindInvitationLetter => 'رسالة دعوة';

  @override
  String get enumDocumentKindInvoice => 'فاتورة';

  @override
  String get enumDocumentKindReceipt => 'إيصال';

  @override
  String get enumDocumentKindKycRegistration => 'شهادة التسجيل (KYC)';

  @override
  String get enumDocumentKindKycAccreditation => 'شهادة الاعتماد (KYC)';

  @override
  String get enumDocumentKindKycPan => 'بطاقة PAN';

  @override
  String get enumDocumentKindKycGst => 'شهادة GST';

  @override
  String get enumDocumentKindKycIdProof => 'إثبات الهوية';

  @override
  String get enumDocumentKindBankProof => 'إثبات الحساب البنكي';

  @override
  String get enumDocumentKindPaymentProof => 'إثبات الدفع';

  @override
  String get enumDocumentKindOther => 'أخرى';

  @override
  String get enumDocumentStatusUploaded => 'تم الرفع';

  @override
  String get enumDocumentStatusVerified => 'موثّق';

  @override
  String get enumDocumentStatusRejected => 'مرفوض';

  @override
  String get enumConsentKindTerms => 'الشروط';

  @override
  String get enumConsentKindPrivacy => 'الخصوصية';

  @override
  String get enumConsentKindAiProcessing => 'المعالجة بالذكاء الاصطناعي';

  @override
  String get enumConsentKindShareWithHospitals => 'المشاركة مع المستشفيات';

  @override
  String get enumConsentKindMarketing => 'التسويق';

  @override
  String get enumPaymentGatewayRazorpay => 'بطاقة ائتمان/خصم';

  @override
  String get enumPaymentGatewayStripe => 'بطاقة (Stripe)';

  @override
  String get enumPaymentGatewayBankTransfer => 'تحويل بنكي';

  @override
  String get enumPaymentGatewayMock => 'دفعة تجريبية';

  @override
  String get enumPaymentPurposeConsultationFee => 'رسوم الاستشارة';

  @override
  String get enumPaymentPurposeBookingDeposit => 'عربون الحجز';

  @override
  String get enumPaymentPurposeBookingBalance => 'المبلغ المتبقي للحجز';

  @override
  String get enumPaymentPurposeBookingFull => 'الدفع الكامل للحجز';

  @override
  String get enumPaymentPurposeInstallment => 'قسط';

  @override
  String get enumPaymentPurposeService => 'خدمة';

  @override
  String get enumOrderStatusCreated => 'تم الإنشاء';

  @override
  String get enumOrderStatusPending => 'قيد الانتظار';

  @override
  String get enumOrderStatusPaid => 'مدفوع';

  @override
  String get enumOrderStatusPartiallyRefunded => 'مسترد جزئيًا';

  @override
  String get enumOrderStatusRefunded => 'مسترد';

  @override
  String get enumOrderStatusFailed => 'فشل';

  @override
  String get enumOrderStatusExpired => 'منتهي الصلاحية';

  @override
  String get enumOrderStatusCancelled => 'ملغى';

  @override
  String get enumPaymentStatusCreated => 'تم الإنشاء';

  @override
  String get enumPaymentStatusAuthorized => 'مُصرّح به';

  @override
  String get enumPaymentStatusCaptured => 'تم التحصيل';

  @override
  String get enumPaymentStatusFailed => 'فشل';

  @override
  String get enumPaymentStatusRefunded => 'مسترد';

  @override
  String get enumPaymentStatusPartiallyRefunded => 'مسترد جزئيًا';

  @override
  String get enumRefundStatusRequested => 'مطلوب';

  @override
  String get enumRefundStatusApproved => 'موافق عليه';

  @override
  String get enumRefundStatusProcessing => 'قيد المعالجة';

  @override
  String get enumRefundStatusProcessed => 'تمت المعالجة';

  @override
  String get enumRefundStatusFailed => 'فشل';

  @override
  String get enumRefundStatusRejected => 'مرفوض';

  @override
  String get enumInstallmentStatusDue => 'مستحق';

  @override
  String get enumInstallmentStatusPaid => 'مدفوع';

  @override
  String get enumInstallmentStatusOverdue => 'متأخر';

  @override
  String get enumInstallmentStatusCancelled => 'ملغى';

  @override
  String get enumInvoiceKindPatientReceipt => 'إيصال المريض';

  @override
  String get enumInvoiceKindCommissionInvoice => 'فاتورة العمولة';

  @override
  String get enumInvoiceKindAgentStatement => 'كشف حساب الوكيل';

  @override
  String get enumPayeeTypeHospital => 'مستشفى';

  @override
  String get enumPayeeTypeAgent => 'وكيل';

  @override
  String get enumPayeeTypeVendor => 'مورّد';

  @override
  String get enumItineraryItemStatusScheduled => 'مجدول';

  @override
  String get enumItineraryItemStatusDone => 'تم';

  @override
  String get enumItineraryItemStatusCancelled => 'ملغى';

  @override
  String get enumVisaTypeEMedical => 'تأشيرة طبية إلكترونية';

  @override
  String get enumVisaTypeEMedicalAttendant => 'تأشيرة مرافق طبي إلكترونية';

  @override
  String get enumSosStatusOpen => 'مفتوح';

  @override
  String get enumSosStatusAcknowledged => 'تم الاستلام';

  @override
  String get enumSosStatusResolved => 'تم الحل';

  @override
  String get enumConversationKindCaseThread => 'حالة';

  @override
  String get enumConversationKindSupport => 'الدعم';

  @override
  String get enumConversationKindDirect => 'مباشر';

  @override
  String get enumSavedEntityTypeHospital => 'مستشفى';

  @override
  String get enumSavedEntityTypeDoctor => 'طبيب';

  @override
  String get enumSavedEntityTypeProcedure => 'إجراء طبي';

  @override
  String get enumConsultationModeVideo => 'فيديو';

  @override
  String get enumConsultationModePhone => 'هاتف';

  @override
  String get enumSlotKindConsultation => 'استشارة';

  @override
  String get enumSlotKindAdmission => 'الدخول إلى المستشفى';

  @override
  String get enumTriageEngineClaude => 'الذكاء الاصطناعي (Claude)';

  @override
  String get enumTriageEngineRules => 'محرك القواعد';

  @override
  String get enumLikelihoodLow => 'منخفض';

  @override
  String get enumLikelihoodMedium => 'متوسط';

  @override
  String get enumLikelihoodHigh => 'مرتفع';

  @override
  String get enumDevicePlatformAndroid => 'Android';

  @override
  String get enumDevicePlatformIos => 'iOS';

  @override
  String get enumDevicePlatformWeb => 'الويب';

  @override
  String get enumPreviousTreatmentMedication => 'الأدوية';

  @override
  String get enumPreviousTreatmentPhysicalTherapy => 'العلاج الطبيعي';

  @override
  String get enumPreviousTreatmentSurgery => 'الجراحة';

  @override
  String get enumPreviousTreatmentOther => 'أخرى';

  @override
  String get enumChecklistKeyTreatmentBooked => 'تم حجز العلاج';

  @override
  String get enumChecklistKeyVisaApproved => 'تمت الموافقة على التأشيرة';

  @override
  String get enumChecklistKeyFlightBooked => 'حجز الطيران';

  @override
  String get enumChecklistKeyTravelInsurance => 'تأمين السفر';

  @override
  String get enumChecklistKeyAirportPickup => 'الاستقبال من المطار';

  @override
  String get enumChecklistKeyDocumentsUploaded => 'تم رفع المستندات';

  @override
  String get enumChecklistKeyAccommodationBooked => 'تم حجز الإقامة';

  @override
  String get enumAnalysisStatusQueued => 'في قائمة الانتظار';

  @override
  String get enumAnalysisStatusProcessing => 'قيد المعالجة';

  @override
  String get enumAnalysisStatusCompleted => 'مكتمل';

  @override
  String get enumAnalysisStatusFailed => 'فشل';

  @override
  String get enumAnalysisStatusUnsupported => 'غير مدعوم';

  @override
  String get enumAnalysisReviewStatusPendingReview => 'بانتظار المراجعة';

  @override
  String get enumAnalysisReviewStatusConfirmed => 'مؤكد';

  @override
  String get enumAnalysisReviewStatusRejected => 'مرفوض';

  @override
  String get enumReportDocTypeLabReport => 'تقرير مختبر';

  @override
  String get enumReportDocTypeImagingReport => 'تقرير تصوير طبي';

  @override
  String get enumReportDocTypeDischargeSummary => 'ملخص الخروج من المستشفى';

  @override
  String get enumReportDocTypePrescription => 'وصفة طبية';

  @override
  String get enumReportDocTypeConsultationNote => 'ملاحظات الاستشارة';

  @override
  String get enumReportDocTypePathologyReport => 'تقرير علم الأمراض';

  @override
  String get enumReportDocTypeInsuranceDocument => 'مستند تأمين';

  @override
  String get enumReportDocTypeOther => 'أخرى';

  @override
  String get enumFindingSignificanceNormal => 'طبيعي';

  @override
  String get enumFindingSignificanceAttention => 'يحتاج انتباهًا';

  @override
  String get enumFindingSignificanceUrgent => 'عاجل';

  @override
  String get enumLabFlagLow => 'منخفض';

  @override
  String get enumLabFlagHigh => 'مرتفع';

  @override
  String get enumLabFlagNormal => 'طبيعي';

  @override
  String get enumLabFlagCritical => 'حرج';

  @override
  String get enumLabFlagUnknown => 'غير معروف';

  @override
  String get enumVoiceStatusQueued => 'في قائمة الانتظار';

  @override
  String get enumVoiceStatusProcessing => 'قيد المعالجة';

  @override
  String get enumVoiceStatusCompleted => 'مكتمل';

  @override
  String get enumVoiceStatusFailed => 'فشل';

  @override
  String get enumVoiceReviewStatusPendingReview => 'بانتظار المراجعة';

  @override
  String get enumVoiceReviewStatusConfirmed => 'مؤكد';

  @override
  String get enumVoiceReviewStatusDiscarded => 'تم التجاهل';

  @override
  String get coreInvalidCredentials => 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';

  @override
  String get coreGoogleSignInUnavailable => 'تسجيل الدخول عبر Google غير متاح في هذا الإصدار.';

  @override
  String get coreGoogleNoToken => 'لم تُرجع Google رمز الدخول.';

  @override
  String get coreGoogleSignInFailed => 'تعذّر تسجيل الدخول عبر Google.';

  @override
  String get coreAppleNoToken => 'لم تُرجع Apple رمز الدخول.';

  @override
  String coreAppleSignInFailed(String error) {
    return 'تعذّر تسجيل الدخول عبر Apple ($error).';
  }

  @override
  String get coreNoFileSelected => 'لم يتم اختيار أي ملف.';

  @override
  String get coreUploadUnsupportedType => 'نوع الملف غير مدعوم. استخدم PDF أو JPG أو PNG أو WEBP أو HEIC أو DICOM.';

  @override
  String get coreUploadTooLarge => 'الملف كبير جدًا (الحد الأقصى 20 ميغابايت).';

  @override
  String get coreScreeningAnalysisSlow => 'يستغرق التحليل وقتًا أطول من المتوقع. سنُعلمك عندما يصبح جاهزًا.';

  @override
  String get coreBiometricPay => 'ادفع';

  @override
  String get coreBiometricPayFaceId => 'ادفع باستخدام Face ID';

  @override
  String get coreBiometricPayFingerprint => 'ادفع باستخدام البصمة';

  @override
  String get coreBiometricConfirmReason => 'أكّد عملية الدفع';

  @override
  String get coreLocationServiceOff => 'خدمة الموقع مُطفأة في هاتفك.';

  @override
  String get coreLocationDenied => 'لم يتم منح إذن الوصول إلى الموقع.';

  @override
  String get coreLocationBlocked => 'الوصول إلى الموقع محظور لهذا التطبيق في إعدادات هاتفك.';

  @override
  String get coreLocationUnavailable => 'لم يتمكن هاتفك من تحديد موقعك في الوقت المناسب.';

  @override
  String corePackageNightsAccommodation(int nights) {
    String _temp0 = intl.Intl.pluralLogic(
      nights,
      locale: localeName,
      other: 'إقامة $nights ليلة',
      many: 'إقامة $nights ليلة',
      few: 'إقامة $nights ليالٍ',
      two: 'إقامة ليلتين',
      one: 'إقامة ليلة واحدة',
      zero: 'إقامة $nights ليلة',
    );
    return '$_temp0';
  }

  @override
  String get corePackageAirportPickup => 'الاستقبال من المطار';

  @override
  String get corePackageTranslator => 'مترجم';

  @override
  String get corePackageMeals => 'الوجبات';

  @override
  String get corePackageLocalTransport => 'المواصلات المحلية';

  @override
  String corePackageFollowupTeleconsults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count استشارة متابعة عن بُعد',
      many: '$count استشارة متابعة عن بُعد',
      few: '$count استشارات متابعة عن بُعد',
      two: 'استشارتا متابعة عن بُعد',
      one: 'استشارة متابعة واحدة عن بُعد',
      zero: '$count استشارة متابعة عن بُعد',
    );
    return '$_temp0';
  }

  @override
  String coreSavePercent(int pct) {
    return 'وفّر $pct%';
  }

  @override
  String coreSavePercentRange(int min, int max) {
    return 'وفّر $min-$max%';
  }

  @override
  String get coreUserGuest => 'ضيف';

  @override
  String get coreUserPatient => 'مريض';

  @override
  String coreMatchScore(int score) {
    return 'تطابق $score%';
  }

  @override
  String get coreErrorOffline => 'أنت غير متصل بالإنترنت';

  @override
  String get coreAvatarLabel => 'الصورة الرمزية';

  @override
  String coreRatingCaption(String rating) {
    return '($rating/5)';
  }

  @override
  String coreRatingCaptionReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '($rating/5 من $count تقييم)',
      many: '($rating/5 من $count تقييمًا)',
      few: '($rating/5 من $count تقييمات)',
      two: '($rating/5 من تقييمين)',
      one: '($rating/5 من تقييم واحد)',
      zero: '($rating/5 من $count تقييم)',
    );
    return '$_temp0';
  }

  @override
  String coreRatingSemantics(String rating) {
    return 'التقييم $rating من 5';
  }

  @override
  String coreRatingSemanticsReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'التقييم $rating من 5 من $count تقييم',
      many: 'التقييم $rating من 5 من $count تقييمًا',
      few: 'التقييم $rating من 5 من $count تقييمات',
      two: 'التقييم $rating من 5 من تقييمين',
      one: 'التقييم $rating من 5 من تقييم واحد',
      zero: 'التقييم $rating من 5 من $count تقييم',
    );
    return '$_temp0';
  }

  @override
  String coreStepProgress(int step, int total) {
    return 'الخطوة $step من $total';
  }

  @override
  String coreStepProgressWithSuffix(int step, int total, String suffix) {
    return 'الخطوة $step من $total · $suffix';
  }

  @override
  String get navHome => 'الرئيسية';

  @override
  String get navSearch => 'بحث';

  @override
  String get navTrips => 'الرحلات';

  @override
  String get navMessages => 'الرسائل';

  @override
  String get navProfile => 'ملفي';

  @override
  String get routerNotFoundTitle => 'الصفحة غير موجودة';

  @override
  String routerNotFoundMessage(String location) {
    return 'لم نتمكن من العثور على \"$location\".';
  }

  @override
  String get routerGoHome => 'العودة إلى الرئيسية';

  @override
  String get homeTitle => 'ما الذي يأتي بك إلى الهند؟';

  @override
  String get homeSubtitle => 'اختر احتياجك الطبي';

  @override
  String get homeSearchHint => 'ابحث عن حالة مرضية';

  @override
  String get homeSearchButton => 'بحث';

  @override
  String get homeAllSpecialties => 'جميع التخصصات';

  @override
  String get homeNoSpecialtiesTitle => 'لا توجد تخصصات بعد';

  @override
  String get homeNoSpecialtiesMessage => 'ابحث عن المستشفيات والأطباء بدلًا من ذلك.';

  @override
  String get homeMoreTile => 'المزيد';

  @override
  String get homeMoreTileSubtitle => 'تخصصات أخرى';

  @override
  String get homeTripEyebrow => 'رحلتك القادمة';

  @override
  String get homeTripFallbackTitle => 'العلاج في الهند';

  @override
  String get homeTripDateTbc => 'سيتم تأكيد التاريخ';

  @override
  String get homeTripToday => 'اليوم';

  @override
  String get homeTripTomorrow => 'غدًا';

  @override
  String get homeTripInProgress => 'جارٍ الآن';

  @override
  String homeTripInDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'خلال $days يوم',
      many: 'خلال $days يومًا',
      few: 'خلال $days أيام',
      two: 'خلال يومين',
      one: 'خلال يوم واحد',
      zero: 'خلال $days يوم',
    );
    return '$_temp0';
  }

  @override
  String homeTripAdmission(String date) {
    return 'الدخول إلى المستشفى $date';
  }

  @override
  String get homeScreeningEyebrow => 'الفحص الأولي بالذكاء الاصطناعي';

  @override
  String get homeMatchesReadyTitle => 'نتائج المطابقة جاهزة';

  @override
  String get homeMatchesReadySubtitle => 'اطّلع على المستشفيات والأطباء المناسبين لك';

  @override
  String homeMatchesReadySubtitleSpecialty(String specialty) {
    return '$specialty · اطّلع على الأطباء المناسبين لك';
  }

  @override
  String get homeScreeningProcessingTitle => 'نبحث عن أنسب الخيارات لك';

  @override
  String get homeScreeningProcessingSubtitle => 'نحلّل إجاباتك';

  @override
  String get homeScreeningContinueTitle => 'تابِع الفحص الأولي';

  @override
  String get homeScreeningContinueSubtitle => 'تابِع من حيث توقفت';

  @override
  String homeScreeningContinueSubtitleSpecialty(String specialty) {
    return '$specialty · تابِع من حيث توقفت';
  }

  @override
  String get onboardingWelcomeChip => 'مرحبًا';

  @override
  String get onboardingImpactStat => '500,000+';

  @override
  String get onboardingImpactStatCaption => 'مريض تلقّوا العلاج';

  @override
  String get onboardingImpactStatFootnote => 'في مستشفياتنا الشريكة';

  @override
  String get onboardingImpactHeadline => 'رعاية صحية عالمية المستوى بتكلفة أقل بنسبة 70%';

  @override
  String get onboardingBadgeJciDescription => 'مستشفيات شريكة معتمدة من Joint Commission International';

  @override
  String get onboardingBadgeNabhDescription => 'مستشفيات شريكة معتمدة من NABH';

  @override
  String get onboardingBadgeWhoDescription => 'رعاية تتّبع إرشادات منظمة الصحة العالمية لسلامة المرضى';

  @override
  String get onboardingAccreditationsCaption => 'اعتمادات تحملها مستشفياتنا الشريكة';

  @override
  String get onboardingNextPage => 'الصفحة التالية';

  @override
  String get onboardingTrustTitle => 'رعاية يمكنك الوثوق بها';

  @override
  String get onboardingTrustDoctorsTitle => 'أطباء يتحدثون الإنجليزية';

  @override
  String get onboardingTrustDoctorsSubtitle => 'تواصل بسهولة.';

  @override
  String get onboardingTrustWaitTitle => 'بدون وقت انتظار';

  @override
  String get onboardingTrustWaitSubtitle => 'احصل على رعاية طبية فورية.';

  @override
  String get onboardingTrustCertifiedTitle => 'معتمد من Joint Commission';

  @override
  String get onboardingTrustCertifiedSubtitle => 'منشآت شريكة معتمدة دوليًا.';

  @override
  String get onboardingTestimonialQuote => '«وفّرت 45,000 دولار على جراحة القلب، مع رعاية أفضل مما في بلدي.»';

  @override
  String get onboardingTestimonialAuthor => 'مريض من الولايات المتحدة';

  @override
  String get onboardingTestimonialDisclaimer => 'مثال توضيحي';

  @override
  String get onboardingStepShareTitle => 'شارك حالتك';

  @override
  String get onboardingStepShareSubtitle => 'قدّم معلوماتك الطبية بأمان.';

  @override
  String get onboardingStepMatchTitle => 'احصل على أنسب الخيارات';

  @override
  String get onboardingStepMatchSubtitle => 'يجد الذكاء الاصطناعي لدينا أفضل المستشفيات لك.';

  @override
  String get onboardingStepCompareTitle => 'قارن التكاليف';

  @override
  String get onboardingStepCompareSubtitle => 'أسعار شفافة لتتخذ قرارات مدروسة.';

  @override
  String get onboardingStepBookTitle => 'احجز العلاج';

  @override
  String get onboardingStepBookSubtitle => 'حدّد موعدك بلا عناء.';

  @override
  String get onboardingSecurityBadge => 'مشفّر وآمن';

  @override
  String get onboardingSecurityFooter => 'بياناتك الطبية مشفّرة ولا تُشارَك إلا مع المستشفيات التي تختارها';

  @override
  String get onboardingGetStarted => 'ابدأ الآن';

  @override
  String get onboardingExploreAsGuest => 'تصفّح كضيف';

  @override
  String onboardingPageDots(int page, int count) {
    return 'الصفحة $page من $count';
  }

  @override
  String get messagesTitle => 'الرسائل';

  @override
  String get messagesContactSupport => 'تواصل مع الدعم';

  @override
  String get messagesEmptyTitle => 'لا توجد محادثات بعد';

  @override
  String get messagesEmptyMessage =>
      'عندما تطلب عرض سعر، تُفتح هنا محادثة مع المستشفى ومنسّقك. ويمكنك أيضًا التواصل مع فريق الدعم في أي وقت.';

  @override
  String get messagesNoMessagesYet => 'لا توجد رسائل بعد';

  @override
  String get messagesAttachment => 'مرفق';

  @override
  String messagesPreviewMine(String message) {
    return 'أنت: $message';
  }

  @override
  String messagesPreviewSender(String sender, String message) {
    return '$sender: $message';
  }

  @override
  String get notificationsTitle => 'الإشعارات';

  @override
  String get notificationsMarkAllRead => 'تعليم الكل كمقروء';

  @override
  String get notificationsEmptyTitle => 'لا جديد لديك';

  @override
  String get notificationsEmptyMessage => 'ستظهر هنا عروض الأسعار وتحديثات الحجز والتذكيرات والرسائل.';

  @override
  String notificationsBellUnread(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'الإشعارات، $count غير مقروء',
      many: 'الإشعارات، $count غير مقروء',
      few: 'الإشعارات، $count غير مقروءة',
      two: 'الإشعارات، اثنان غير مقروءين',
      one: 'الإشعارات، واحد غير مقروء',
      zero: 'الإشعارات، $count غير مقروء',
    );
    return '$_temp0';
  }

  @override
  String get supportLocationMarked => 'تم تحديد الموقع. لن تتم مشاركته إلا إذا أرسلت نداء SOS.';

  @override
  String get supportRealtimeNotifications => 'إشعارات فورية';

  @override
  String get supportNotificationsEmpty => 'تظهر هنا تذكيرات المواعيد والتحديثات فور حدوثها.';

  @override
  String get supportCallHelpline => 'اتصل بخط المساعدة 24/7';

  @override
  String get supportGetTranslator => 'اطلب مترجمًا';

  @override
  String get supportLocalGuide => 'مرشد محلي';

  @override
  String get supportBookFirst => 'احجز علاجك أولًا، أو اسأل فريق الدعم في الرسائل.';

  @override
  String get supportTranslatorRequested => 'تم طلب مترجم. سيؤكّد منسّقك ذلك قريبًا.';

  @override
  String get supportGuideRequested => 'تم طلب مرشد محلي. سيؤكّد منسّقك ذلك قريبًا.';

  @override
  String get supportScheduleTitle => 'جدولك';

  @override
  String get supportScheduleEmpty => 'سيضيف المستشفى مواعيدك هنا.';

  @override
  String supportScheduleWhen(String weekday, String time) {
    return '$weekday، $time';
  }

  @override
  String get supportTodaysSchedule => 'جدول اليوم';

  @override
  String get supportNextOnSchedule => 'التالي في جدولك';

  @override
  String get supportNothingToday => 'لا شيء مُجدول اليوم';

  @override
  String get cultureTipsTitle => 'نصائح ثقافية';

  @override
  String get cultureTipsEmpty => 'ستظهر النصائح هنا قريبًا.';

  @override
  String get sosButtonSemantics => 'تنبيه طوارئ SOS';

  @override
  String get sosConfirmTitle => 'هل تريد إرسال تنبيه طوارئ؟';

  @override
  String get sosConfirmBody => 'سيتم تنبيه منسّقك وفريق الدعم لدينا المتاح على مدار الساعة فورًا.';

  @override
  String get sosMessageLabel => 'ماذا يحدث؟ (اختياري)';

  @override
  String get sosShareLocationTitle => 'مشاركة موقعي الحالي مع فريق الدعم';

  @override
  String get sosShareLocationMarkedHint =>
      'يُستخدم لهذا التنبيه فقط. إذا لم يتمكن هاتفك من تحديد موقعك، تتم مشاركة المكان الذي حدّدته على الخريطة بدلًا من ذلك.';

  @override
  String get sosShareLocationHint => 'يُستخدم لهذا التنبيه فقط، لنتمكن من الوصول إليك بشكل أسرع. قد يطلب هاتفك الإذن.';

  @override
  String get sosSendButton => 'إرسال SOS';

  @override
  String get sosGettingLocation => 'جارٍ تحديد موقعك…';

  @override
  String get sosSendingAlert => 'جارٍ إرسال التنبيه…';

  @override
  String get sosLocationShared => 'تمت مشاركة موقعك الحالي مع الفريق.';

  @override
  String sosLocationFallbackMarked(String reason) {
    return '$reason تمت مشاركة المكان الذي حدّدته على الخريطة بدلًا من ذلك.';
  }

  @override
  String sosLocationFallbackNone(String reason) {
    return '$reason أخبر الفريق بمكانك عندما يتصلون بك.';
  }

  @override
  String get sosResultSentTitle => 'المساعدة في الطريق إليك';

  @override
  String get sosResultSentBody => 'تم تنبيه منسّقك وفريق الدعم لدينا المتاح على مدار الساعة، وسيتصلون بك قريبًا.';

  @override
  String get sosResultDangerNote => 'إذا كانت حياتك في خطر، فاتصل بخدمات الطوارئ الآن.';

  @override
  String get sosResultFailedTitle => 'تعذّر إرسال التنبيه';

  @override
  String get sosResultFailedBody => 'يُرجى الاتصال هاتفيًا لطلب المساعدة مباشرةً.';

  @override
  String get sosCallHelpline => 'اتصل بخط المساعدة';

  @override
  String sosCallNumber(String number) {
    return 'اتصل بـ $number';
  }

  @override
  String get mapLongPressHint => 'اضغط مطولًا على الخريطة لتحديد مكانك.';

  @override
  String get mapAttribution => 'المساهمون في OpenStreetMap';

  @override
  String get mapZoomIn => 'تكبير';

  @override
  String get mapZoomOut => 'تصغير';

  @override
  String get mapShowMyPlaces => 'عرض أماكني';

  @override
  String get screeningAppBarTitle => 'التقييم بالذكاء الاصطناعي';

  @override
  String get screeningStartErrorTitle => 'تعذّر بدء تقييمك';

  @override
  String get screeningStartPreparing => 'جارٍ تجهيز الاستبيان...';

  @override
  String get screeningStartHeading => 'ما الذي يأتي بك إلى الهند؟';

  @override
  String get screeningStartSubtitle => 'اختر مجال الرعاية. أربع خطوات قصيرة تساعدنا على مطابقتك مع الأطباء المناسبين.';

  @override
  String get screeningStartNotSure => 'لست متأكدًا؟';

  @override
  String get screeningStartNotSureBody => 'صف أعراضك وسنقترح عليك تخصصًا.';

  @override
  String get screeningResumeTitle => 'تابع تقييمك';

  @override
  String get screeningResumeGeneral => 'عام';

  @override
  String get screeningLoadingAnswers => 'جارٍ تحميل إجاباتك...';

  @override
  String get screeningAlreadySubmittedAppBar => 'التقييم';

  @override
  String get screeningResultsReadyTitle => 'نتائجك جاهزة';

  @override
  String get screeningAlreadySubmittedTitle => 'تم إرسال هذا التقييم بالفعل';

  @override
  String get screeningResultsReadyMessage => 'لم يعد بالإمكان تغيير الإجابات. ابدأ تقييمًا جديدًا للإجابة مرة أخرى.';

  @override
  String get screeningAnalysingMessage => 'نحن نحلّل إجاباتك.';

  @override
  String get screeningViewMatches => 'عرض نتائج المطابقة';

  @override
  String get screeningSeeProgress => 'عرض التقدم';

  @override
  String get screeningStartNewButton => 'ابدأ تقييمًا جديدًا';

  @override
  String get screeningProcessingStepAnalyzing => 'تحليل حالتك';

  @override
  String get screeningProcessingStepMatching => 'المطابقة مع الأخصائيين';

  @override
  String get screeningProcessingStepSavings => 'حساب التوفير';

  @override
  String screeningChecklistRowSemantics(String label, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'done': 'تم', 'active': 'قيد التنفيذ', 'other': 'قيد الانتظار'});
    return '$label، $_temp0';
  }

  @override
  String get screeningProcessingHelpTitle => 'ما الذي يحدث؟';

  @override
  String get screeningProcessingHelpBody =>
      'نراجع إجاباتك (بالذكاء الاصطناعي إذا وافقت)، ونقترح التخصص المناسب، ونطابقك مع مستشفيات وأطباء معتمدين في الهند حسب الخبرة واللغة والميزانية والتوفر. يستغرق ذلك عادةً أقل من دقيقة. هذا ليس تشخيصًا.';

  @override
  String get screeningProcessingReady => 'نتائج المطابقة جاهزة!';

  @override
  String get screeningProcessingFinding => 'جارٍ البحث عن الأنسب لك...';

  @override
  String get screeningProcessingTip =>
      'نصيحة: يمكنك مقارنة ما يصل إلى 3 نتائج جنبًا إلى جنب والاطلاع على تفاصيل التكلفة الكاملة.';

  @override
  String get screeningProcessingFailedTitle => 'تعذّر علينا إكمال التحليل';

  @override
  String get screeningProcessingFailedMessage => 'حدث خطأ أثناء تحليل إجاباتك.';

  @override
  String get screeningProcessingTimeoutTitle => 'يستغرق هذا وقتًا أطول من المعتاد';

  @override
  String get screeningProcessingTimeoutMessage =>
      'سنُعلمك فور جاهزية نتائج المطابقة. يمكنك مواصلة الانتظار أو العودة لاحقًا.';

  @override
  String get screeningProcessingKeepWaiting => 'مواصلة الانتظار';

  @override
  String get screeningGoHome => 'الذهاب إلى الرئيسية';

  @override
  String get screeningNotSubmittedTitle => 'لم يتم إرسال هذا التقييم';

  @override
  String get screeningNotSubmittedMessage => 'أكمل الاستبيان للحصول على نتائج المطابقة.';

  @override
  String get screeningContinueQuestionnaire => 'متابعة الاستبيان';

  @override
  String get screeningProcessingLostTitle => 'فقدنا تتبّع تقييمك';

  @override
  String get screeningPrevious => 'السابق';

  @override
  String get screeningHelpTooltip => 'مساعدة';

  @override
  String get screeningHelpDialogTitle => 'كيف يعمل هذا';

  @override
  String get screeningHelpGotIt => 'فهمت';

  @override
  String get screeningSaveExit => 'حفظ وخروج';

  @override
  String get screeningProgressSaved => 'تم حفظ تقدمك. يمكنك المتابعة في أي وقت من الصفحة الرئيسية.';

  @override
  String get screeningValidateBodyArea => 'انقر على الجسم لاختيار منطقة واحدة على الأقل.';

  @override
  String get screeningValidateSymptoms => 'أجب بـ\"نعم\" أو \"ربما\" عن عَرَض واحد على الأقل، أو أضف عَرَضًا من عندك.';

  @override
  String get screeningValidateDuration => 'أخبرنا منذ متى تعاني من هذه الحالة.';

  @override
  String get screeningValidateBudget => 'يجب ألا يتجاوز الحد الأدنى للميزانية الحد الأقصى.';

  @override
  String get screeningValidateTravelWindow => 'يجب أن تنتهي فترة السفر بعد بدايتها.';

  @override
  String get screeningStep1Title => 'أين تشعر بالمشكلة؟';

  @override
  String get screeningStep1Subtitle => 'انقر على الجسم لاختيار المنطقة.';

  @override
  String screeningStep1SubtitleWithSpecialty(String specialty) {
    return 'انقر على الجسم لاختيار المنطقة · $specialty';
  }

  @override
  String get screeningNoAreaSelected => 'لم يتم اختيار أي منطقة بعد';

  @override
  String get screeningStep2Title => 'ما الأعراض التي تعاني منها؟';

  @override
  String get screeningStep2Help =>
      'اسحب البطاقة إلى اليسار (أو انقر على علامة الصح) إذا كان لديك العَرَض، وإلى اليمين (أو X) إذا لم يكن لديك، وإلى الأعلى (أو -) إذا لم تكن متأكدًا. أضف أدناه أي شيء لم نسأل عنه.';

  @override
  String get screeningSymptomsLoading => 'جارٍ تحميل الاقتراحات...';

  @override
  String get screeningSymptomsUnavailable => 'الاقتراحات غير متاحة. أضف أعراضك أدناه.';

  @override
  String get screeningYourSymptoms => 'أعراضك';

  @override
  String get screeningYourSymptomsEmpty => 'تظهر هنا الأعراض التي تجيب عنها بـ\"نعم\" أو \"ربما\".';

  @override
  String screeningSymptomMaybeChip(String name) {
    return '$name (ربما)';
  }

  @override
  String get screeningAddAnotherSymptom => 'أضف عَرَضًا آخر';

  @override
  String screeningSymptomTooLong(int max) {
    return 'اجعل وصف العَرَض أقل من $max حرفًا.';
  }

  @override
  String screeningSymptomLimit(int max) {
    return 'يمكنك إضافة ما يصل إلى $max عَرَضًا.';
  }

  @override
  String get screeningStep3Title => 'منذ متى تعاني من هذه الحالة؟';

  @override
  String get screeningDecrease => 'إنقاص';

  @override
  String get screeningIncrease => 'زيادة';

  @override
  String get screeningSeverity => 'الشدة';

  @override
  String get screeningDailyImpact => 'التأثير اليومي';

  @override
  String get screeningImpactWork => 'العمل';

  @override
  String get screeningImpactSleep => 'النوم';

  @override
  String get screeningImpactMobility => 'الحركة';

  @override
  String get screeningImpactWorkQuestion => 'إلى أي مدى يؤثر على عملك؟';

  @override
  String get screeningImpactSleepQuestion => 'إلى أي مدى يؤثر على نومك؟';

  @override
  String get screeningImpactMobilityQuestion => 'إلى أي مدى يؤثر على قدرتك على الحركة؟';

  @override
  String screeningSeverityPillSemantics(String dimension, String level) {
    return '$dimension $level';
  }

  @override
  String get screeningPreviousTreatments => 'العلاجات السابقة';

  @override
  String get screeningPreviousReports => 'التقارير السابقة';

  @override
  String get screeningOptionalParen => '(اختياري)';

  @override
  String get screeningScanUpload => 'امسح التقارير الطبية ضوئيًا أو حمّلها';

  @override
  String get screeningScanUploadHint =>
      'صوّر الصفحات الورقية أو اختر ملف PDF · يقرأه الذكاء الاصطناعي لدينا وتؤكد أنت التفاصيل';

  @override
  String get screeningAttachWithoutAi => 'إرفاق ملف دون ذكاء اصطناعي (مثل DICOM)';

  @override
  String get screeningNotesLabel => 'هل هناك شيء آخر يجب أن نعرفه؟ (اختياري)';

  @override
  String screeningRemoveReportTooltip(String name) {
    return 'إزالة $name';
  }

  @override
  String screeningAttachLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'يمكنك إرفاق ما يصل إلى $count تقرير.',
      many: 'يمكنك إرفاق ما يصل إلى $count تقريرًا.',
      few: 'يمكنك إرفاق ما يصل إلى $count تقارير.',
      two: 'يمكنك إرفاق تقريرين كحد أقصى.',
      one: 'يمكنك إرفاق تقرير واحد كحد أقصى.',
      zero: 'لا يمكنك إرفاق أي تقرير.',
    );
    return '$_temp0';
  }

  @override
  String screeningAttachPagesLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'يمكن إرفاق $count صفحة تقارير فقط بالتقييم.',
      many: 'يمكن إرفاق $count صفحة تقارير فقط بالتقييم.',
      few: 'يمكن إرفاق $count صفحات تقارير فقط بالتقييم.',
      two: 'يمكن إرفاق صفحتي تقرير فقط بالتقييم.',
      one: 'يمكن إرفاق صفحة تقرير واحدة فقط بالتقييم.',
      zero: 'لا يمكن إرفاق أي صفحة تقرير بالتقييم.',
    );
    return '$_temp0';
  }

  @override
  String get screeningReportDefaultLabel => 'تقرير طبي';

  @override
  String screeningReportNumbered(int index) {
    return 'تقرير طبي $index';
  }

  @override
  String screeningReportPage(String label, int page) {
    return '$label ص.$page';
  }

  @override
  String get screeningReportAiConfirmed => 'تم تأكيد قراءة الذكاء الاصطناعي';

  @override
  String get screeningReportAiToReview => 'قراءة الذكاء الاصطناعي بانتظار المراجعة';

  @override
  String get screeningStep4Title => 'خصّص نتائج المطابقة';

  @override
  String get screeningFindDoctors => 'ابحث عن أطبائي';

  @override
  String get screeningSkipDefaults => 'تخطٍّ واستخدام الافتراضي';

  @override
  String get screeningLangHindi => 'الهندية';

  @override
  String get screeningLangEnglish => 'الإنجليزية';

  @override
  String get screeningLangArabic => 'العربية';

  @override
  String get screeningLangSpanish => 'الإسبانية';

  @override
  String get screeningLangFrench => 'الفرنسية';

  @override
  String get screeningLangRussian => 'الروسية';

  @override
  String get screeningPrefDoctorGender => 'جنس الطبيب';

  @override
  String get screeningPrefBudgetRange => 'نطاق الميزانية';

  @override
  String get screeningPrefYourBudget => 'ميزانيتك';

  @override
  String get screeningPrefAnyBudget => 'أي ميزانية';

  @override
  String get screeningPrefClearBudget => 'مسح الميزانية';

  @override
  String get screeningPrefTravelWindow => 'فترة السفر';

  @override
  String screeningPrefTravelFrom(String date) {
    return 'من $date - اختر تاريخ الانتهاء';
  }

  @override
  String screeningPrefTravelRange(String start, String end) {
    return '$start - $end';
  }

  @override
  String get screeningPrefUseAi => 'استخدام توصيات الذكاء الاصطناعي';

  @override
  String get screeningPrefUseAiOn => 'يتطلب موافقتك قبل التحليل';

  @override
  String get screeningPrefUseAiOff => 'مطابقة قياسية قائمة على القواعد';

  @override
  String get consentAiTitle => 'استخدام توصيات الذكاء الاصطناعي؟';

  @override
  String get consentAiPointData =>
      'تُرسَل إجاباتك (وأي تقارير أرفقتها) إلى خدمة الذكاء الاصطناعي لدينا لاقتراح التخصصات والإجراءات المناسبة والأسئلة التي يمكنك طرحها على طبيبك.';

  @override
  String get consentAiPointNotDiagnosis => 'هذا ليس تشخيصًا. يراجع طبيب مؤهل في المستشفى حالتك قبل أي علاج.';

  @override
  String get consentAiPointPrivacy =>
      'تُستخدم بياناتك لهذا التقييم فقط ولا تُباع أبدًا. يمكنك سحب موافقتك من ملفك الشخصي.';

  @override
  String get consentAiPointAlternative =>
      'لا تفضّل ذلك؟ سنطابقك باستخدام نظامنا القياسي القائم على القواعد بدلًا من ذلك.';

  @override
  String get consentAiAgree => 'أوافق، استخدم الذكاء الاصطناعي';

  @override
  String get consentAiDecline => 'استخدام المطابقة القياسية';

  @override
  String get bodyMapHead => 'الرأس';

  @override
  String get bodyMapNeck => 'الرقبة';

  @override
  String get bodyMapChest => 'الصدر';

  @override
  String get bodyMapAbdomen => 'البطن';

  @override
  String get bodyMapPelvis => 'الحوض';

  @override
  String get bodyMapRegionBack => 'الظهر';

  @override
  String get bodyMapLeftArm => 'الذراع اليسرى';

  @override
  String get bodyMapRightArm => 'الذراع اليمنى';

  @override
  String get bodyMapLeftLeg => 'الساق اليسرى';

  @override
  String get bodyMapRightLeg => 'الساق اليمنى';

  @override
  String get bodyMapSkin => 'الجلد';

  @override
  String get bodyMapGeneral => 'الجسم كله / عام';

  @override
  String get bodyMapViewFront => 'الأمام';

  @override
  String get bodyMapViewBack => 'الخلف';

  @override
  String get painIntensityTitle => 'شدة الألم';

  @override
  String get painNone => 'لا ألم';

  @override
  String get painMild => 'خفيف';

  @override
  String get painModerate => 'متوسط';

  @override
  String get painSevere => 'شديد';

  @override
  String get painWorst => 'أسوأ ألم ممكن';

  @override
  String painValueLabel(int value, String label) {
    return '$value/10 · $label';
  }

  @override
  String painSemantics(int value, String label) {
    return 'الألم $value من 10، $label';
  }

  @override
  String get emergencyTitle => 'حالة طارئة — اطلب الرعاية الطبية المحلية الآن';

  @override
  String get emergencyBody =>
      'قد تشير بعض إجاباتك إلى حالة طبية طارئة. من فضلك لا تنتظر حتى تسافر. توجّه فورًا إلى أقرب قسم طوارئ أو اتصل برقم الطوارئ المحلي.';

  @override
  String get emergencyWarningSigns => 'علامات تحذيرية لاحظناها';

  @override
  String get emergencyNotDiagnosis => 'هذا التقييم ليس تشخيصًا.';

  @override
  String emergencyCallButton(String number) {
    return 'اتصل بخدمات الطوارئ ($number)';
  }

  @override
  String emergencyDialNow(String number) {
    return 'اتصل بالرقم $number من هاتفك الآن.';
  }

  @override
  String get emergencyAckViewResults => 'أفهم ذلك - اعرض نتائجي على أي حال';

  @override
  String get emergencyAckContinueRisk => 'أفهم المخاطر - متابعة';

  @override
  String get symptomDeckAllAnswered => 'تمت الإجابة عن كل الاقتراحات. أضف أي شيء آخر أدناه.';

  @override
  String symptomCardSemantics(String name) {
    return '$name. هل لديك هذا العَرَض؟ اسحب لليسار للإجابة بنعم، ولليمين للإجابة بلا، وللأعلى للإجابة بربما.';
  }

  @override
  String get symptomSwipeOrTap => 'اسحب أو انقر للإجابة';

  @override
  String symptomAnswerSemantics(String answer) {
    return 'الإجابة: $answer';
  }

  @override
  String symptomAnswerTooltip(String answer, String name) {
    return '$answer: $name';
  }

  @override
  String get symptomAddTooltip => 'إضافة العَرَض';

  @override
  String symptomRemoveTooltip(String name) {
    return 'إزالة $name';
  }

  @override
  String get intakeAppliedBodyAreas => 'مناطق الجسم';

  @override
  String get intakeAppliedPainIntensity => 'شدة الألم';

  @override
  String get intakeAppliedSymptoms => 'الأعراض';

  @override
  String get intakeAppliedDuration => 'المدة';

  @override
  String get intakeAppliedDailyImpact => 'التأثير اليومي';

  @override
  String get intakeAppliedPreviousTreatments => 'العلاجات السابقة';

  @override
  String get intakeAppliedNotes => 'الملاحظات';

  @override
  String get intakeListSeparator => '، ';

  @override
  String intakeVoiceAddedOnly(String fields) {
    return 'تمت إضافة: $fields.';
  }

  @override
  String intakeVoiceUpdatedOnly(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'تم تحديث $count إجابة.',
      many: 'تم تحديث $count إجابة.',
      few: 'تم تحديث $count إجابات.',
      two: 'تم تحديث إجابتين.',
      one: 'تم تحديث إجابة واحدة.',
      zero: 'لم يتم تحديث أي إجابة.',
    );
    return '$_temp0';
  }

  @override
  String intakeVoiceAddedAndUpdated(String fields, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'تمت إضافة: $fields؛ وتم تحديث $count إجابة.',
      many: 'تمت إضافة: $fields؛ وتم تحديث $count إجابة.',
      few: 'تمت إضافة: $fields؛ وتم تحديث $count إجابات.',
      two: 'تمت إضافة: $fields؛ وتم تحديث إجابتين.',
      one: 'تمت إضافة: $fields؛ وتم تحديث إجابة واحدة.',
      zero: 'تمت إضافة: $fields؛ ولم يتم تحديث أي إجابة.',
    );
    return '$_temp0';
  }

  @override
  String get intakeVoiceAlreadyMatch => 'إجاباتك مطابقة بالفعل لما قلته.';

  @override
  String get intakeConflictPainIntensity => 'شدة الألم';

  @override
  String get intakeConflictHowLong => 'منذ متى';

  @override
  String intakeConflictDailyImpact(String dimension) {
    return 'التأثير اليومي: $dimension';
  }

  @override
  String intakeDurationValue(int value, String unit) {
    return '$value $unit';
  }

  @override
  String get intakeConflictTitle => 'بعض الإجابات مختلفة';

  @override
  String get intakeConflictHint => 'حدّد الإجابات التي تريد استبدالها بما قلته. الإجابات غير المحددة تبقى كما هي.';

  @override
  String intakeConflictCompare(String current, String suggested) {
    return 'إجابتك: $current\nمن صوتك: $suggested';
  }

  @override
  String get intakeMedicalArea => 'المجال الطبي';

  @override
  String get intakeSpecialtyOptional => 'التخصص (اختياري)';

  @override
  String get intakeNotSure => 'لست متأكدًا';

  @override
  String get intakeWhereProblem => 'أين المشكلة؟';

  @override
  String get intakeAddPain => 'إضافة شدة الألم';

  @override
  String get intakeSymptoms => 'الأعراض';

  @override
  String get intakeAddSymptomHint => 'أضف عَرَضًا';

  @override
  String get intakeHowLong => 'منذ متى تعاني منه؟';

  @override
  String get intakeDailyImpact => 'التأثير اليومي';

  @override
  String get intakePreviousTreatments => 'العلاجات السابقة';

  @override
  String get intakeNotesLabel => 'ملاحظات';

  @override
  String get intakeNotesHint => 'أي شيء آخر يجب أن يعرفه الطبيب';

  @override
  String get voiceIntakeTitle => 'صِفها بصوتك';

  @override
  String get voiceReviewTitle => 'راجع إجاباتك';

  @override
  String get voiceIntro => 'أخبرنا بكلماتك أين تشعر بالألم، ومنذ متى، ومدى شدته، وما الذي جربته بالفعل.';

  @override
  String get voiceMicOff =>
      'الوصول إلى الميكروفون متوقف. اسمح به لتطبيق Heal India Global من إعدادات هاتفك، أو اكتب بدلًا من ذلك.';

  @override
  String get voiceStartFailed => 'تعذّر بدء التسجيل. حاول مرة أخرى أو اكتب بدلًا من ذلك.';

  @override
  String get voiceNothingRecorded => 'لم يتم تسجيل أي شيء. حاول مرة أخرى.';

  @override
  String get voiceConsentRequired => 'يُرجى الموافقة على معالجة تسجيلك أولًا.';

  @override
  String get voiceNotUnderstood => 'لم نتمكن من فهم التسجيل. حاول مرة أخرى في مكان أهدأ، أو اكتب بدلًا من ذلك.';

  @override
  String get voiceExtractTooShort => 'يُرجى وصف مشكلتك ببضع كلمات.';

  @override
  String get voiceEmergencyAck => 'أفهم ذلك - متابعة مراجعة إجاباتي';

  @override
  String get voiceStopRecording => 'إيقاف التسجيل';

  @override
  String get voiceRecordAgain => 'سجّل مرة أخرى';

  @override
  String get voiceStartRecording => 'بدء التسجيل';

  @override
  String voiceRecordedStatus(String duration) {
    return 'تم تسجيل $duration · انقر للتسجيل مرة أخرى';
  }

  @override
  String get voiceTapToStart => 'انقر لبدء التحدث';

  @override
  String get voiceInputLevel => 'مستوى الصوت';

  @override
  String get voiceConsentText =>
      'أوافق على تفريغ تسجيلي نصيًا على خوادم Heal India Global الخاصة، وعلى أن يحوّله الذكاء الاصطناعي إلى إجابات لتقييمي. يُحذف التسجيل الصوتي بعد التفريغ النصي. سأراجع كل شيء قبل استخدامه.';

  @override
  String get voiceUseRecording => 'استخدم هذا التسجيل';

  @override
  String get voiceTypeInstead => 'اكتب بدلًا من ذلك';

  @override
  String get voiceTypedHint => 'صف مشكلتك بكلماتك…';

  @override
  String get voiceFillAnswers => 'املأ إجاباتي';

  @override
  String get voiceSpeakInstead => 'تحدّث بدلًا من ذلك';

  @override
  String get voiceUploading => 'جارٍ رفع تسجيلك…';

  @override
  String get voiceReading => 'جارٍ قراءة وصفك…';

  @override
  String get voiceListening => 'جارٍ الاستماع إلى تسجيلك…';

  @override
  String get voiceCheckEveryAnswer => 'ستراجع كل إجابة قبل استخدامها.';

  @override
  String get voiceEmergencyBanner => 'قد يحتاج بعض ما وصفته إلى رعاية عاجلة. يُرجى طلب رعاية الطوارئ المحلية الآن.';

  @override
  String get voiceGuidance => 'الإرشادات';

  @override
  String get voiceReviewIntro => 'يُرجى مراجعة ما فهمناه. غيّر أي شيء غير صحيح، ثم انقر على تأكيد.';

  @override
  String get voiceYourDescription => 'وصفك';

  @override
  String get voiceWhatYouSaid => 'ما قلته';

  @override
  String get voiceAiDisclaimer => 'اقتراحات من إنشاء الذكاء الاصطناعي — ليست تشخيصًا.';

  @override
  String get voiceDiscard => 'حذف';

  @override
  String get searchHint => 'ابحث عن مستشفيات أو أطباء أو علاجات';

  @override
  String get searchClearTooltip => 'مسح البحث';

  @override
  String get searchFiltersTooltip => 'عوامل التصفية';

  @override
  String get searchTabHospitals => 'المستشفيات';

  @override
  String get searchTabDoctors => 'الأطباء';

  @override
  String get searchTabProcedures => 'الإجراءات';

  @override
  String get searchEmptyTryDifferent => 'جرّب بحثًا مختلفًا أو امسح عوامل التصفية.';

  @override
  String get searchEmptyCheckBack => 'عُد قريبًا - نضيف شركاء جددًا باستمرار.';

  @override
  String get searchClearFilters => 'مسح عوامل التصفية';

  @override
  String get searchNoHospitalsFound => 'لم يتم العثور على مستشفيات';

  @override
  String get searchNoDoctorsFound => 'لم يتم العثور على أطباء';

  @override
  String get searchNoProceduresFound => 'لم يتم العثور على إجراءات';

  @override
  String searchGenderDoctorsChip(String gender, String label) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'female': 'طبيبات',
      'male': 'أطباء رجال',
      'other': 'أطباء ($label)',
    });
    return '$_temp0';
  }

  @override
  String searchResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count نتيجة',
      many: '$count نتيجة',
      few: '$count نتائج',
      two: 'نتيجتان',
      one: 'نتيجة واحدة',
      zero: 'لا توجد نتائج',
    );
    return '$_temp0';
  }

  @override
  String get filtersTitle => 'عوامل التصفية';

  @override
  String get filtersSpecialtyLabel => 'التخصص';

  @override
  String get filtersAnySpecialty => 'أي تخصص';

  @override
  String get filtersCityLabel => 'المدينة';

  @override
  String get filtersCityHint => 'مثال: نيودلهي، تشيناي';

  @override
  String get filtersAccreditationLabel => 'الاعتماد (المستشفيات)';

  @override
  String get filtersLanguageLabel => 'اللغة المحكية';

  @override
  String get filtersDoctorGenderLabel => 'جنس الطبيب';

  @override
  String get filtersSortLabel => 'ترتيب المستشفيات حسب';

  @override
  String get filtersShowResults => 'عرض النتائج';

  @override
  String get filtersSortTopRated => 'الأعلى تقييمًا';

  @override
  String get filtersSortLowestPrice => 'الأقل سعرًا';

  @override
  String get filtersSortName => 'الاسم (أ-ي)';

  @override
  String get filtersLanguageEnglish => 'الإنجليزية';

  @override
  String get filtersLanguageHindi => 'الهندية';

  @override
  String get filtersLanguageArabic => 'العربية';

  @override
  String get filtersLanguageFrench => 'الفرنسية';

  @override
  String get filtersLanguageRussian => 'الروسية';

  @override
  String get filtersLanguageBengali => 'البنغالية';

  @override
  String get filtersLanguageSwahili => 'السواحيلية';

  @override
  String get filtersLanguageSpanish => 'الإسبانية';

  @override
  String catalogApproxPriceTooltip(String amount) {
    return 'تقدير محسوب من $amount بسعر صرف اليوم';
  }

  @override
  String get catalogInternationalDesk => 'مكتب دولي';

  @override
  String get catalogInternationalPatientDesk => 'مكتب المرضى الدوليين';

  @override
  String get catalogPriceFromPrefix => 'ابتداءً من ';

  @override
  String catalogSuccessBadge(int pct) {
    return 'نجاح $pct%';
  }

  @override
  String get catalogVideoConsult => 'استشارة بالفيديو';

  @override
  String catalogDaysInHospital(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم في المستشفى',
      many: '$count يومًا في المستشفى',
      few: '$count أيام في المستشفى',
      two: 'يومان في المستشفى',
      one: 'يوم واحد في المستشفى',
      zero: '$count يوم في المستشفى',
    );
    return '$_temp0';
  }

  @override
  String catalogPercent(int value) {
    return '$value%';
  }

  @override
  String get catalogAboutSection => 'نبذة';

  @override
  String get catalogLanguagesSpoken => 'اللغات المحكية';

  @override
  String get catalogTreatmentsPrices => 'العلاجات والأسعار';

  @override
  String get catalogShowLess => 'عرض أقل';

  @override
  String get catalogReadMore => 'اقرأ المزيد';

  @override
  String catalogCouldNotOpen(String target) {
    return 'تعذّر فتح $target';
  }

  @override
  String get catalogGetMatched => 'احصل على ترشيحات';

  @override
  String get hospitalDetailNotFound => 'المستشفى غير موجود';

  @override
  String get hospitalDetailEstablished => 'سنة التأسيس';

  @override
  String get hospitalDetailBeds => 'الأسرّة';

  @override
  String hospitalDetailDistanceKm(String distance) {
    return '$distance كم';
  }

  @override
  String get hospitalDetailFromAirport => 'من المطار';

  @override
  String get hospitalDetailTreatmentsFrom => 'العلاجات ابتداءً من ';

  @override
  String get hospitalDetailSpecialties => 'التخصصات';

  @override
  String get hospitalDetailPricesIndicative => 'الأسعار تقديرية. يصلك عرض السعر النهائي من المستشفى بعد مراجعة حالتك.';

  @override
  String get hospitalDetailDoctors => 'الأطباء';

  @override
  String get hospitalDetailPatientReviews => 'تقييمات المرضى';

  @override
  String get hospitalDetailContact => 'التواصل';

  @override
  String get hospitalDetailContactViaCoordinator =>
      'تواصل مع المستشفى عبر منسّقك في Heal India Global بعد طلب عرض سعر.';

  @override
  String get doctorDetailTitle => 'ملف الطبيب';

  @override
  String doctorDetailExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سنة',
      many: '$count سنة',
      few: '$count سنوات',
      two: 'سنتان',
      one: 'سنة واحدة',
      zero: '$count سنة',
    );
    return '$_temp0';
  }

  @override
  String get doctorDetailExperience => 'الخبرة';

  @override
  String get doctorDetailSuccessRate => 'نسبة النجاح';

  @override
  String doctorDetailReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count تقييم',
      many: '$count تقييمًا',
      few: '$count تقييمات',
      two: 'تقييمان',
      one: 'تقييم واحد',
      zero: 'لا توجد تقييمات',
    );
    return '$_temp0';
  }

  @override
  String get doctorDetailVideoConsultAvailable => 'الاستشارة بالفيديو متاحة';

  @override
  String get doctorDetailConsultationFee => 'رسوم الاستشارة';

  @override
  String get doctorDetailQualifications => 'المؤهلات';

  @override
  String get doctorDetailExpertise => 'مجالات الخبرة';

  @override
  String get availabilitySection => 'المواعيد المتاحة';

  @override
  String get availabilityNext30Days => 'المواعيد المتاحة (الأيام الثلاثون القادمة)';

  @override
  String get availabilityNoSlots => 'لم تُنشر مواعيد متاحة بعد - اطلب عرض سعر وسيقترح المستشفى مواعيد.';

  @override
  String availabilityNextAvailable(String date) {
    return 'أقرب موعد متاح: $date';
  }

  @override
  String availabilityDayAvailable(String day) {
    return '$day: متاح';
  }

  @override
  String availabilityDayUnavailable(String day) {
    return '$day: غير متاح';
  }

  @override
  String procedureDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم',
      many: '$count يومًا',
      few: '$count أيام',
      two: 'يومان',
      one: 'يوم واحد',
      zero: '$count يوم',
    );
    return '$_temp0';
  }

  @override
  String get procedureInHospital => 'في المستشفى';

  @override
  String get procedureRecovery => 'التعافي';

  @override
  String get procedureTotalStayInIndia => 'إجمالي الإقامة في الهند';

  @override
  String procedureTypicalCostIn(String country) {
    return 'التكلفة المعتادة في $country';
  }

  @override
  String procedureWaitTime(String time) {
    return 'مدة الانتظار: $time';
  }

  @override
  String get procedureCompareCosts => 'قارن التكاليف';

  @override
  String get quoteRequestButton => 'اطلب عرض سعر';

  @override
  String get quoteRequestedSnack => 'تم طلب عرض السعر. يرد المستشفى عادةً خلال 48 ساعة.';

  @override
  String get quoteSheetTitle => 'طلب عرض سعر';

  @override
  String get quoteTreatmentLabel => 'العلاج (اختياري)';

  @override
  String get quoteTreatmentNotSure => 'لست متأكدًا بعد';

  @override
  String get quoteNotesLabel => 'أخبر المستشفى عن حالتك';

  @override
  String get quoteNotesHint => 'التشخيص، العلاج الحالي، مواعيد السفر المفضلة...';

  @override
  String quoteConsent(String hospital) {
    return 'أوافق على مشاركة ملفي الشخصي وملاحظاتي الطبية ومستنداتي مع $hospital ليتمكنوا من إعداد عرض سعر.';
  }

  @override
  String get quoteSendRequest => 'إرسال الطلب';

  @override
  String get savedRemovedSnack => 'تمت الإزالة من المحفوظات';

  @override
  String get savedAddedSnack => 'تم الحفظ في قائمتك';

  @override
  String get savedGuestPrompt => 'أنشئ حسابًا مجانيًا لحفظ المستشفيات والأطباء.';

  @override
  String get savedSignUpAction => 'إنشاء حساب';

  @override
  String get savedRemoveTooltip => 'إزالة من المحفوظات';

  @override
  String get matchSortBestMatch => 'الأنسب';

  @override
  String get matchSortLowestCost => 'الأقل تكلفة';

  @override
  String get matchSortHighestRating => 'الأعلى تقييمًا';

  @override
  String get matchSortMostExperience => 'الأكثر خبرة';

  @override
  String get matchSortBy => 'ترتيب حسب';

  @override
  String get matchFilterTitle => 'تصفية';

  @override
  String get matchFilterJciOnly => 'المستشفيات المعتمدة من JCI فقط';

  @override
  String get matchFilterVideoConsult => 'يقدّم استشارة بالفيديو';

  @override
  String get matchFilterSpeaks => 'يتحدث';

  @override
  String get matchCardEstimatedTotalCost => 'التكلفة الإجمالية التقديرية';

  @override
  String matchCardSaveVsHome(int min, int max) {
    return 'وفّر $min-$max% مقارنة ببلدك';
  }

  @override
  String get matchCardAdded => 'تمت الإضافة';

  @override
  String get matchCardCompare => 'مقارنة';

  @override
  String get matchCardViewDetails => 'عرض التفاصيل';

  @override
  String get matchDetailWhyThisMatch => 'لماذا هذا الترشيح';

  @override
  String get matchDetailEstimatedCost => 'التكلفة التقديرية';

  @override
  String matchDetailInCountry(String country) {
    return 'في $country: ';
  }

  @override
  String matchDetailSavePct(int min, int max) {
    return 'وفّر $min-$max%';
  }

  @override
  String get matchDetailFinalPriceNote => 'يأتي السعر النهائي من عرض سعر المستشفى بعد مراجعة حالتك.';

  @override
  String get matchDetailSeeFullComparison => 'عرض مقارنة التكاليف كاملة';

  @override
  String get matchDetailSuggestedPackage => 'الباقة المقترحة';

  @override
  String get matchDetailCompareCosts => 'قارن التكاليف';

  @override
  String get matchDetailProceduresPackages => 'الإجراءات والباقات';

  @override
  String get compareTitleShort => 'مقارنة';

  @override
  String get compareTitle => 'مقارنة الترشيحات';

  @override
  String get compareNothingTitle => 'لا يوجد ما تتم مقارنته';

  @override
  String get compareNothingMessage => 'اختر ترشيحين أو ثلاثة من نتائجك لمقارنتها جنبًا إلى جنب.';

  @override
  String get compareStartScreening => 'ابدأ الفحص الأولي';

  @override
  String get compareNoLongerAvailable => 'هذه الترشيحات لم تعد متاحة';

  @override
  String get compareBackToMatches => 'العودة إلى الترشيحات';

  @override
  String get compareRowMatch => 'التطابق';

  @override
  String compareExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سنة',
      many: '$count سنة',
      few: '$count سنوات',
      two: 'سنتان',
      one: 'سنة واحدة',
      zero: '$count سنة',
    );
    return '$_temp0';
  }

  @override
  String get compareRowRating => 'التقييم';

  @override
  String get compareRowHospital => 'المستشفى';

  @override
  String get compareRowAccreditation => 'الاعتماد';

  @override
  String get compareRowLanguages => 'اللغات';

  @override
  String get compareRowEstCost => 'التكلفة التقديرية';

  @override
  String get compareLowest => 'الأقل';

  @override
  String get compareRowSavings => 'التوفير';

  @override
  String comparePercentRange(int min, int max) {
    return '$min-$max%';
  }

  @override
  String get compareRowPackage => 'الباقة';

  @override
  String get compareRowWhy => 'السبب';

  @override
  String get compareBook => 'احجز';

  @override
  String get compareDetails => 'التفاصيل';

  @override
  String consultationRequestSentSnack(String caseNumber, String hospital) {
    return 'تم إرسال الطلب $caseNumber إلى $hospital.';
  }

  @override
  String get consultationConsentRequired => 'يُرجى الموافقة على مشاركة معلوماتك مع المستشفى.';

  @override
  String get consultationGuestUpgrade =>
      'أنشئ حسابًا مجانيًا لإرسال الطلبات إلى المستشفيات. ستبقى إجاباتك في الفحص الأولي محفوظة.';

  @override
  String get consultationBookTitle => 'حجز استشارة';

  @override
  String get consultationMessageLabel => 'رسالة إلى المستشفى (اختياري)';

  @override
  String get consultationMessageHint => 'المواعيد المفضلة، الأسئلة، المرافقون المسافرون معك...';

  @override
  String consultationConsent(String hospital) {
    return 'أوافق على مشاركة إجاباتي في الفحص الأولي وتقاريري ومعلوماتي الطبية مع $hospital ليتمكنوا من مراجعة حالتي وإعداد عرض سعر.';
  }

  @override
  String get consultationCreateAccount => 'إنشاء حساب مجاني';

  @override
  String get consultationPayAfterAccept => 'يرد المستشفى بعرض سعر مخصص لك. لا تدفع إلا بعد قبوله.';

  @override
  String get costTitle => 'مقارنة العلاج';

  @override
  String get costFindHospitals => 'ابحث عن مستشفيات';

  @override
  String get costChangeCountryTooltip => 'تغيير بلد الإقامة';

  @override
  String costCompareWith(String country) {
    return 'قارن مع $country';
  }

  @override
  String costTreatmentIn(String country) {
    return 'العلاج في $country';
  }

  @override
  String get costTreatmentInIndia => 'العلاج في الهند';

  @override
  String get costRowCost => 'التكلفة';

  @override
  String get costRowWaitTime => 'مدة الانتظار';

  @override
  String get costVaries => 'تختلف';

  @override
  String get costRowInsurance => 'التغطية التأمينية';

  @override
  String get costVariesByPlan => 'تختلف حسب الخطة';

  @override
  String get costIndiaDefaultWait => 'أسبوع إلى أسبوعين';

  @override
  String costSavingsValue(String amount, int min, int max) {
    return '$amount ($min-$max%)';
  }

  @override
  String get costItemizedTitle => 'تفاصيل التكلفة';

  @override
  String get costDisclaimer =>
      'تقديرات للمقارنة فقط. يأتي سعرك النهائي من عرض السعر المخصص من المستشفى. أرقام بلدك هي نطاقات منشورة معتادة وتختلف حسب مقدّم الخدمة والتأمين.';

  @override
  String get costBreakdownInQuote => 'يتضمن عرض سعر المستشفى تفصيلًا كاملًا للتكاليف.';

  @override
  String costTypicalIn(String country) {
    return 'المعتاد في $country';
  }

  @override
  String get costChooseTreatment => 'اختر علاجًا';

  @override
  String get costChooseTreatmentSubtitle => 'قارن تكلفته في بلدك وفي الهند.';

  @override
  String get costSearchTreatments => 'ابحث عن علاجات';

  @override
  String get costNoTreatmentsFound => 'لم يتم العثور على علاجات';

  @override
  String get costCategorySurgery => 'الجراحة';

  @override
  String get costCategoryHospital => 'المستشفى';

  @override
  String get costCategoryMedications => 'الأدوية';

  @override
  String get costCategoryTestsScans => 'الفحوصات والأشعة';

  @override
  String get costCategoryDoctorFees => 'أتعاب الأطباء';

  @override
  String get costCategoryImplants => 'الغرسات';

  @override
  String get costCategoryOther => 'أخرى';

  @override
  String get costCategorySurgeryHint => 'أتعاب الجرّاح والتخدير، وغرفة العمليات والمستلزمات.';

  @override
  String get costCategoryHospitalHint => 'الغرفة والرعاية التمريضية والوجبات، والعناية المركزة عند الحاجة.';

  @override
  String get costCategoryMedicationsHint => 'الأدوية أثناء إقامتك وعند الخروج.';

  @override
  String get costCategoryTestsScansHint => 'فحوصات ما قبل العملية والتصوير والتحاليل المخبرية.';

  @override
  String get costCategoryDoctorFeesHint => 'الاستشارات وزيارات المتابعة.';

  @override
  String get costCategoryImplantsHint => 'الغرسات أو الدعامات أو الأطراف الاصطناعية عند الحاجة.';

  @override
  String get costCategoryOtherHint => 'رسوم أخرى مشمولة في التقدير.';

  @override
  String get costCountryUs => 'الولايات المتحدة';

  @override
  String get costCountryGb => 'المملكة المتحدة';

  @override
  String get costCountryCa => 'كندا';

  @override
  String get costCountryAu => 'أستراليا';

  @override
  String get costCountryNz => 'نيوزيلندا';

  @override
  String get costCountryAe => 'الإمارات';

  @override
  String get costCountrySa => 'السعودية';

  @override
  String get costCountryOm => 'عُمان';

  @override
  String get costCountryQa => 'قطر';

  @override
  String get costCountryKw => 'الكويت';

  @override
  String get costCountryBh => 'البحرين';

  @override
  String get costCountryIq => 'العراق';

  @override
  String get costCountryNg => 'نيجيريا';

  @override
  String get costCountryKe => 'كينيا';

  @override
  String get costCountryTz => 'تنزانيا';

  @override
  String get costCountryEt => 'إثيوبيا';

  @override
  String get costCountryBd => 'بنغلاديش';

  @override
  String get costCountryNp => 'نيبال';

  @override
  String get costCountryLk => 'سريلانكا';

  @override
  String get costCountryAf => 'أفغانستان';

  @override
  String get costCountryUz => 'أوزبكستان';

  @override
  String get costCountryDe => 'ألمانيا';

  @override
  String get costCountryFr => 'فرنسا';

  @override
  String get costCountryEs => 'إسبانيا';

  @override
  String get costCountryIt => 'إيطاليا';

  @override
  String get costCountryRu => 'روسيا';

  @override
  String get costCountryIn => 'الهند';

  @override
  String get costCountryYours => 'بلدك';

  @override
  String get paymentDueDeposit => 'الدفعة المقدّمة المستحقة الآن';

  @override
  String get paymentDueBalance => 'المبلغ المتبقي المستحق الآن';

  @override
  String get paymentDueNow => 'المستحق الآن';

  @override
  String get paymentDueInstallment => 'القسط المستحق الآن';

  @override
  String paymentDueInstallmentSeq(int seq) {
    return 'القسط $seq مستحق الآن';
  }

  @override
  String bookingStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم',
      many: '$count يومًا',
      few: '$count أيام',
      two: 'يومان',
      one: 'يوم واحد',
      zero: '$count يوم',
    );
    return '$_temp0';
  }

  @override
  String bookingStayDaysRange(int min, int max) {
    return '$min-$max أيام';
  }

  @override
  String get paymentTitle => 'الدفع';

  @override
  String get paymentSecureTitle => 'دفع آمن';

  @override
  String get paymentSecureBody => 'دفع مشفّر عبر شريكنا في الدفع. بيانات بطاقتك لا تصل أبدًا إلى خوادمنا.';

  @override
  String get paymentMethodSection => 'طريقة الدفع';

  @override
  String get paymentMethodCard => 'بطاقة ائتمان/خصم';

  @override
  String get paymentMethodCardAppOnly => 'متاح في تطبيق Android وiOS';

  @override
  String get bankTransferTitle => 'تحويل بنكي';

  @override
  String get bankSwiftDetails => 'بيانات SWIFT';

  @override
  String get paymentTestTitle => 'دفع تجريبي';

  @override
  String get paymentTestSubtitle => 'بوابة تطوير - لا تُحوَّل أموال حقيقية';

  @override
  String get paymentPlansTitle => 'خطط الدفع';

  @override
  String paymentPlansOnBooking(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count قسط شهري لهذا الحجز',
      many: '$count قسطًا شهريًا لهذا الحجز',
      few: '$count أقساط شهرية لهذا الحجز',
      two: 'قسطان شهريان لهذا الحجز',
      one: 'قسط شهري واحد لهذا الحجز',
      zero: '$count أقساط شهرية لهذا الحجز',
    );
    return '$_temp0';
  }

  @override
  String get paymentPlansChosenWhenBooking => '3 أو 6 أو 12 شهرًا - تُختار عند الحجز';

  @override
  String get paymentInsurance => 'التأمين';

  @override
  String get bookingInsuranceClaim => 'أريد المطالبة بالتأمين';

  @override
  String get paymentInsuranceRequestedHelp =>
      'تم طلب المطالبة. حمّل وثيقة التأمين ونماذج المطالبة ليتمكن فريقنا من المساعدة.';

  @override
  String get paymentInsuranceChosenWhenBooking => 'يُحدَّد عند الحجز. اسأل منسّقك إذا أردت إضافة مطالبة.';

  @override
  String get paymentUploadInsuranceDocs => 'تحميل مستندات التأمين';

  @override
  String get paymentPriceSummary => 'ملخص السعر';

  @override
  String paymentChargedInCurrency(String currency) {
    return 'سيتم الخصم بعملة $currency بسعر الصرف المثبّت عند إنشاء الطلب.';
  }

  @override
  String paymentPlansCurrentOption(String option) {
    return 'يستخدم هذا الحجز خيار «$option». تُختار الخطط الشهرية لمدة 3 أو 6 أو 12 شهرًا عند الحجز. للتغيير، اسأل منسّقك قبل دفعتك الأولى.';
  }

  @override
  String get paymentScheduleBeingPrepared => 'يجري إعداد جدول أقساطك.';

  @override
  String get paymentDueDatePending => 'تاريخ الاستحقاق قيد التحديد';

  @override
  String paymentDueOn(String date) {
    return 'مستحق في $date';
  }

  @override
  String get paymentCardAppOnlySnack => 'الدفع بالبطاقة متاح في تطبيق Android وiOS. استخدم التحويل البنكي هنا.';

  @override
  String paymentConfirmReason(String amount) {
    return 'تأكيد دفع $amount';
  }

  @override
  String get paymentNotConfirmed => 'لم يتم تأكيد الدفع.';

  @override
  String get paymentMethodNotAvailable => 'طريقة الدفع هذه غير متاحة في التطبيق.';

  @override
  String get paymentCardCheckoutFailed => 'تعذّر بدء الدفع بالبطاقة. يُرجى المحاولة مرة أخرى.';

  @override
  String paymentWalletPending(String wallet) {
    return 'أكمل الدفع في $wallet. سنؤكد حجزك فور استلام المبلغ.';
  }

  @override
  String get paymentTestDialogBody => 'محاكاة نتيجة بوابة الدفع لهذا الطلب التجريبي.';

  @override
  String get paymentSimulateFailure => 'محاكاة الفشل';

  @override
  String get paymentSimulateSuccess => 'محاكاة النجاح';

  @override
  String get paymentGetBankDetails => 'عرض بيانات التحويل البنكي';

  @override
  String get paymentPayButton => 'ادفع';

  @override
  String get bookingTreatmentFallback => 'العلاج';

  @override
  String bookingAdmissionDate(String date) {
    return 'الدخول: $date';
  }

  @override
  String get paymentSubtotal => 'المجموع الفرعي';

  @override
  String get paymentDiscount => 'الخصم';

  @override
  String get paymentServiceFee => 'رسوم الخدمة';

  @override
  String get paymentTaxes => 'الضرائب';

  @override
  String get paymentTotal => 'الإجمالي';

  @override
  String get paymentPaidSoFar => 'المدفوع حتى الآن';

  @override
  String get paymentBalance => 'المتبقي';

  @override
  String paymentInstallmentDueOn(int seq, String date) {
    return 'القسط $seq مستحق في $date';
  }

  @override
  String get paymentBookingCancelledTitle => 'تم إلغاء هذا الحجز';

  @override
  String get paymentNothingDueTitle => 'لا يوجد مبلغ مستحق الآن';

  @override
  String get paymentRefundOriginalMethod => 'تُعاد المبالغ المستردة، إن وُجدت، إلى وسيلة الدفع الأصلية.';

  @override
  String paymentNothingDueBody(String number) {
    return 'لا توجد دفعة مستحقة على الحجز $number. سنُعلمك عند استحقاق الدفعة التالية.';
  }

  @override
  String get paymentGoToTrip => 'الانتقال إلى رحلتي';

  @override
  String get paymentResultSuccessTitle => 'تم الدفع بنجاح';

  @override
  String get paymentResultPendingTitle => 'تم إرسال الدفعة';

  @override
  String get paymentResultFailureTitle => 'فشل الدفع';

  @override
  String paymentResultSuccessBody(String number) {
    return 'تم تحديث حجزك $number. لقد أبلغنا منسّقك.';
  }

  @override
  String get paymentResultPendingBody => 'سنؤكد حجزك فور التحقق من الدفعة. سيصلك إشعار.';

  @override
  String get paymentResultFailureBody => 'لم يُخصم أي مبلغ. يُرجى المحاولة مرة أخرى أو اختيار طريقة أخرى.';

  @override
  String get paymentResultAmount => 'المبلغ';

  @override
  String get paymentResultOrder => 'الطلب';

  @override
  String get bookingLabel => 'الحجز';

  @override
  String get paymentResultPaidOn => 'تاريخ الدفع';

  @override
  String get paymentResultStatus => 'الحالة';

  @override
  String get paymentDownloadReceipt => 'تنزيل الإيصال';

  @override
  String get paymentGetHelp => 'الحصول على مساعدة';

  @override
  String get caseViewCase => 'عرض الحالة';

  @override
  String get paymentReceiptPreparing => 'يجري إعداد إيصالك. سيظهر في المستندات قريبًا.';

  @override
  String get paymentReceiptSaved => 'تم حفظ الإيصال';

  @override
  String get bankTransferUnavailableTitle => 'التحويل البنكي غير متاح';

  @override
  String get bankTransferUnavailableBody => 'يُرجى اختيار طريقة دفع أخرى.';

  @override
  String get bankTransferAmount => 'المبلغ المطلوب تحويله';

  @override
  String bankTransferOrder(String number) {
    return 'الطلب $number';
  }

  @override
  String get bankBeneficiary => 'المستفيد';

  @override
  String get bankName => 'البنك';

  @override
  String get bankAccountNumber => 'رقم الحساب';

  @override
  String get bankPaymentReference => 'مرجع الدفع';

  @override
  String get bankTransferInstructions =>
      'اذكر مرجع الدفع كما هو تمامًا لنتمكن من مطابقة تحويلك. تستغرق التحويلات الدولية عادةً من 1 إلى 3 أيام عمل؛ ويُؤكَّد حجزك بعد أن يتحقق فريقنا المالي من وصول المبلغ.';

  @override
  String get bankProofSection => 'إثبات التحويل';

  @override
  String get bankProofReplace => 'استبدال';

  @override
  String get bankProofUpload => 'تحميل إيصال التحويل';

  @override
  String get bankReferenceLabel => 'مرجع المعاملة البنكية (UTR / MT103)';

  @override
  String get bankReferenceRequired => 'أدخل المرجع الذي حصلت عليه من بنكك';

  @override
  String get bankSubmitProof => 'إرسال الإثبات';

  @override
  String get bankUploadLater => 'سأحمّل الإثبات لاحقًا';

  @override
  String get bankProofReceived =>
      'شكرًا! استلمنا بيانات تحويلك. يُؤكَّد حجزك عند وصول المبلغ (عادةً خلال 1-3 أيام عمل).';

  @override
  String bankCopyTooltip(String label) {
    return 'نسخ $label';
  }

  @override
  String bankCopied(String label) {
    return 'تم نسخ $label';
  }

  @override
  String get paymentResponseIncomplete => 'استجابة الدفع غير مكتملة. يُرجى التواصل مع الدعم.';

  @override
  String get paymentCancelled => 'تم إلغاء الدفع.';

  @override
  String get paymentNotCompleted => 'تعذّر إتمام الدفع.';

  @override
  String get paymentWalletFallback => 'المحفظة';

  @override
  String get paymentCardsUnavailableOnDevice => 'الدفع بالبطاقة غير متاح على هذا الجهاز.';

  @override
  String get bookSelectDatesTitle => 'اختيار التواريخ';

  @override
  String bookCaseClosedTitle(String status) {
    return 'هذه الحالة: $status';
  }

  @override
  String get bookCaseClosedBody => 'افتح استفسارًا جديدًا لحجز العلاج.';

  @override
  String get bookProceedToPayment => 'المتابعة إلى الدفع';

  @override
  String get bookTreatmentDurationLabel => 'مدة العلاج: ';

  @override
  String get bookDurationConfirmedByHospital => 'يؤكدها المستشفى';

  @override
  String bookDurationRequired(String duration) {
    return 'مطلوب $duration';
  }

  @override
  String bookAdmissionOn(String date) {
    return 'الدخول في $date';
  }

  @override
  String get bookSelectPackage => 'اختيار الباقة';

  @override
  String get bookAcceptedQuote => 'عرض سعر المستشفى المقبول';

  @override
  String bookingStayDaysLabel(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'إقامة $days يوم',
      many: 'إقامة $days يومًا',
      few: 'إقامة $days أيام',
      two: 'إقامة يومين',
      one: 'إقامة يوم واحد',
      zero: 'إقامة $days يوم',
    );
    return '$_temp0';
  }

  @override
  String bookingValidUntil(String date) {
    return 'صالح حتى $date';
  }

  @override
  String bookItemizedCharges(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count بند مفصّل',
      many: '$count بندًا مفصّلًا',
      few: '$count بنود مفصّلة',
      two: 'بندان مفصّلان',
      one: 'بند واحد مفصّل',
      zero: '$count بند مفصّل',
    );
    return '$_temp0';
  }

  @override
  String get bookNoPackages => 'لم ينشر هذا المستشفى باقات لهذا العلاج بعد. اطلب عرض سعر مخصصًا من صفحة حالتك.';

  @override
  String get bookPaymentOptionSection => 'خيار الدفع';

  @override
  String get bookInsuranceHelp => 'سيساعدك فريقنا في أوراق المطالبة.';

  @override
  String get bookLegendAvailable => 'متاح';

  @override
  String get bookLegendSelected => 'محدد';

  @override
  String get bookLegendUnavailable => 'غير متاح';

  @override
  String get bookLegendPast => 'منقضٍ';

  @override
  String get bookPackageMedicalOnly => 'باقة العلاج الأساسية';

  @override
  String get bookPackageMedicalStay => 'العلاج + الإقامة';

  @override
  String get bookPackageAllInclusive => 'العلاج والإقامة والتنقلات والمترجم';

  @override
  String bookInstallmentPerMonth(String amount) {
    return '≈ $amount / شهريًا قبل الرسوم';
  }

  @override
  String get bookingPayInFull => 'الدفع بالكامل';

  @override
  String get bookPayInFullSubtitle => 'دفعة واحدة للعلاج كاملًا';

  @override
  String get bookPayDeposit => 'ادفع دفعة مقدّمة الآن';

  @override
  String get bookPayDepositSubtitle => 'احجز موعدك؛ ويُستحق المبلغ المتبقي قبل الدخول';

  @override
  String get bookMonthlyInstallments => 'أقساط شهرية';

  @override
  String get bookInstallmentChoices => '3 أو 6 أو 12 شهرًا';

  @override
  String bookMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count شهر',
      many: '$count شهرًا',
      few: '$count أشهر',
      two: 'شهران',
      one: 'شهر واحد',
      zero: '$count شهر',
    );
    return '$_temp0';
  }

  @override
  String get bookSavePrefix => 'وفّر ';

  @override
  String get bookExistingBookingBody =>
      'يوجد حجز لهذه الحالة بالفعل. تابِع به، أو ألغِه من صفحة الحالة لاختيار تواريخ جديدة.';

  @override
  String get bookContinueToPayment => 'متابعة الدفع';

  @override
  String get bookCalendarPreviousMonth => 'الشهر السابق';

  @override
  String get bookCalendarNextMonth => 'الشهر التالي';

  @override
  String bookCalendarDaySemantics(String date, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'selected': 'محدد', 'available': 'متاح', 'other': 'غير متاح'});
    return '$date، $_temp0';
  }

  @override
  String get bookDoctorHideDetails => 'إخفاء تفاصيل الطبيب';

  @override
  String get bookDoctorShowDetails => 'عرض تفاصيل الطبيب';

  @override
  String bookDoctorExperience(int years) {
    String _temp0 = intl.Intl.pluralLogic(
      years,
      locale: localeName,
      other: '$years سنة من الخبرة',
      many: '$years سنة من الخبرة',
      few: '$years سنوات من الخبرة',
      two: 'سنتان من الخبرة',
      one: 'سنة واحدة من الخبرة',
      zero: '$years سنة من الخبرة',
    );
    return '$_temp0';
  }

  @override
  String bookDoctorSpeaks(String languages) {
    return 'يتحدث: $languages';
  }

  @override
  String get bookProfessionCardiologist => 'أخصائي أمراض القلب';

  @override
  String get bookProfessionOrthopedicSurgeon => 'جرّاح عظام';

  @override
  String get bookProfessionOncologist => 'أخصائي أورام';

  @override
  String get bookProfessionNeurologist => 'أخصائي أعصاب';

  @override
  String get bookProfessionDentist => 'طبيب أسنان';

  @override
  String get bookProfessionUrologist => 'أخصائي مسالك بولية';

  @override
  String get bookProfessionNephrologist => 'أخصائي كلى';

  @override
  String get bookProfessionGastroenterologist => 'أخصائي جهاز هضمي';

  @override
  String get bookProfessionOphthalmologist => 'طبيب عيون';

  @override
  String get bookProfessionDermatologist => 'طبيب جلدية';

  @override
  String get casesTitle => 'حالاتي';

  @override
  String get caseFilterAll => 'الكل';

  @override
  String get casesEmptyTitle => 'لا توجد حالات بعد';

  @override
  String casesEmptyFilteredTitle(String status) {
    return 'لا توجد حالات بحالة «$status»';
  }

  @override
  String get casesEmptyBody => 'اطلب عرض سعر من مستشفى مطابق لبدء حالة.';

  @override
  String get caseFindMyTreatment => 'ابحث عن علاجي';

  @override
  String casesShowingCount(int shown, int total) {
    return 'عرض $shown من $total. استخدم عوامل التصفية لتضييق القائمة.';
  }

  @override
  String get caseTitleFallback => 'الحالة';

  @override
  String get caseMessageTooltip => 'مراسلة بشأن هذه الحالة';

  @override
  String get caseQuotesSection => 'عروض الأسعار';

  @override
  String get caseQuotePending => 'يراجع المستشفى حالتك. سيصلك إشعار عند وصول عرض السعر المفصّل (عادةً خلال 48 ساعة).';

  @override
  String get caseNoQuotes => 'لا توجد عروض أسعار لهذه الحالة.';

  @override
  String get caseBookPackageInstead => 'احجز باقة بسعر ثابت بدلًا من ذلك';

  @override
  String get caseMedicalSummary => 'الملخص الطبي';

  @override
  String get caseYourNotes => 'ملاحظاتك';

  @override
  String get documentsTitle => 'المستندات';

  @override
  String get caseDocumentsManage => 'إدارة';

  @override
  String get caseDocumentsEmpty => 'حمّل التقارير والصور الطبية وجواز سفرك ليتمكن المستشفى من الاستعداد.';

  @override
  String get caseStatusTimeline => 'سجل الحالة';

  @override
  String get caseMessageCareTeam => 'مراسلة فريق الرعاية';

  @override
  String get caseCancelThisCase => 'إلغاء هذه الحالة';

  @override
  String caseCoordinator(String name) {
    return 'المنسّق: $name';
  }

  @override
  String caseAgent(String name) {
    return 'الوكيل: $name';
  }

  @override
  String caseOpenedOn(String date) {
    return 'فُتحت في $date';
  }

  @override
  String get caseBookingPackage => 'الباقة';

  @override
  String get caseBookingAdmission => 'الدخول';

  @override
  String get caseBookingDuration => 'المدة';

  @override
  String caseDurationDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days يوم',
      many: '$days يومًا',
      few: '$days أيام',
      two: 'يومان',
      one: 'يوم واحد',
      zero: '$days يوم',
    );
    return '$_temp0';
  }

  @override
  String get caseBookingPaymentPlan => 'خطة الدفع';

  @override
  String get caseBookingPaid => 'المدفوع';

  @override
  String get caseClaimRequested => 'تم طلب المطالبة';

  @override
  String get casePayToConfirm => 'ادفع للتأكيد';

  @override
  String get casePayBalance => 'دفع المبلغ المتبقي';

  @override
  String get travelVisaAndTravel => 'التأشيرة والسفر';

  @override
  String get caseCancelBooking => 'إلغاء الحجز';

  @override
  String get caseDepositPlusBalance => 'دفعة مقدّمة + المتبقي';

  @override
  String caseMonthlyInstallments(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months قسط شهري',
      many: '$months قسطًا شهريًا',
      few: '$months أقساط شهرية',
      two: 'قسطان شهريان',
      one: 'قسط شهري واحد',
      zero: '$months أقساط شهرية',
    );
    return '$_temp0';
  }

  @override
  String get caseMonthlyInstallmentsNoCount => 'أقساط شهرية';

  @override
  String get caseAcceptQuoteTitle => 'هل تقبل عرض السعر هذا؟';

  @override
  String get caseAcceptQuoteBody => 'سيحجز المستشفى خطة علاجك. بعد ذلك تختار تاريخ دخولك وتدفع الدفعة المقدّمة.';

  @override
  String get caseNotYet => 'ليس الآن';

  @override
  String get caseAccept => 'قبول';

  @override
  String get caseQuoteAccepted => 'تم قبول عرض السعر';

  @override
  String get caseDeclineQuoteTitle => 'هل ترفض عرض السعر هذا؟';

  @override
  String get caseDecline => 'رفض';

  @override
  String get caseCancelBookingTitle => 'هل تريد إلغاء الحجز؟';

  @override
  String get caseReason => 'السبب';

  @override
  String get caseCancelBookingPolicy =>
      'تخضع المبالغ المستردة لسياسة الإلغاء: كلما ألغيت مبكرًا قبل الدخول، زاد المبلغ المسترد.';

  @override
  String get caseBookingCancelled => 'تم إلغاء الحجز. يُعاد أي مبلغ مسترد إلى وسيلة الدفع الأصلية.';

  @override
  String get caseCancelCaseTitle => 'هل تريد إلغاء هذه الحالة؟';

  @override
  String get caseCancelCase => 'إلغاء الحالة';

  @override
  String get caseNextPaymentNeeded => 'يلزم الدفع لتأكيد حجزك';

  @override
  String get caseNextBalanceDue => 'المبلغ المتبقي مستحق قبل الدخول';

  @override
  String get caseNextWaitingForQuote => 'بانتظار عرض سعر المستشفى';

  @override
  String get caseNextReviewQuote => 'راجع عرض السعر';

  @override
  String get caseNextChooseDate => 'اختر تاريخ دخولك';

  @override
  String get caseHospitalQuote => 'عرض سعر المستشفى';

  @override
  String caseQuoteBy(String name) {
    return 'بواسطة $name';
  }

  @override
  String caseQuoteTotalStay(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'الإجمالي · إقامة $days يوم',
      many: 'الإجمالي · إقامة $days يومًا',
      few: 'الإجمالي · إقامة $days أيام',
      two: 'الإجمالي · إقامة يومين',
      one: 'الإجمالي · إقامة يوم واحد',
      zero: 'الإجمالي · إقامة $days يوم',
    );
    return '$_temp0';
  }

  @override
  String get caseAcceptQuote => 'قبول عرض السعر';

  @override
  String get caseChooseAdmissionDate => 'اختيار تاريخ الدخول';

  @override
  String get caseReasonOptional => 'السبب (اختياري)';

  @override
  String refundTierLessThanDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'أقل من $days يوم قبل الدخول',
      many: 'أقل من $days يومًا قبل الدخول',
      few: 'أقل من $days أيام قبل الدخول',
      two: 'أقل من يومين قبل الدخول',
      one: 'أقل من يوم واحد قبل الدخول',
      zero: 'أقل من $days يوم قبل الدخول',
    );
    return '$_temp0';
  }

  @override
  String refundTierDaysOrMore(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'قبل الدخول بـ $days يوم أو أكثر',
      many: 'قبل الدخول بـ $days يومًا أو أكثر',
      few: 'قبل الدخول بـ $days أيام أو أكثر',
      two: 'قبل الدخول بيومين أو أكثر',
      one: 'قبل الدخول بيوم واحد أو أكثر',
      zero: 'قبل الدخول بـ $days يوم أو أكثر',
    );
    return '$_temp0';
  }

  @override
  String get refundNone => 'لا استرداد';

  @override
  String refundPercent(int pct) {
    return 'استرداد $pct%';
  }

  @override
  String refundTierLine(String when, String refund) {
    return '$when: $refund';
  }

  @override
  String get refundPolicyTitle => 'الإلغاء والاسترداد';

  @override
  String get refundPolicyGeneral =>
      'تُطبَّق سياسة الإلغاء السارية عند تأكيد حجزك: كلما ألغيت مبكرًا قبل الدخول، زاد المبلغ المسترد.';

  @override
  String get refundPolicyLocked =>
      'هذه الشروط ثابتة لهذا الحجز. إذا ألغى المستشفى أو Heal India Global، تحصل على استرداد كامل.';

  @override
  String documentsUploading(String name) {
    return 'جارٍ تحميل $name';
  }

  @override
  String get documentsEmptyTitle => 'لا توجد مستندات بعد';

  @override
  String get documentsEmptyBody =>
      'حمّل جواز سفرك وتقاريرك الطبية والصور الطبية والوصفات. PDF أو JPG أو PNG أو WEBP أو HEIC أو DICOM بحجم يصل إلى 20 ميغابايت.';

  @override
  String get documentsUploadADocument => 'تحميل مستند';

  @override
  String get documentsSharedNote => 'تتم مشاركتها فقط مع فريق رعايتك والمستشفى المعني بحالتك.';

  @override
  String documentsUploaded(String name) {
    return 'تم تحميل $name';
  }

  @override
  String get documentsDeleteTitle => 'هل تريد حذف المستند؟';

  @override
  String documentsDeleteBody(String name) {
    return 'ستتم إزالة $name لديك ولدى فريق رعايتك.';
  }

  @override
  String get documentsKeep => 'إبقاء';

  @override
  String get documentsActionsTooltip => 'إجراءات المستند';

  @override
  String get documentsFileTooLarge => 'الملف كبير جدًا (الحد الأقصى 20 ميغابايت).';

  @override
  String documentsSaved(String name) {
    return 'تم حفظ $name';
  }

  @override
  String get documentsPreviewUnavailable => 'لا يمكن معاينة صيغة الصورة هذه. استخدم التنزيل بدلًا من ذلك.';

  @override
  String get documentsWhatAreYouUploading => 'ما الذي تريد تحميله؟';

  @override
  String get preArrivalTitle => 'دليل ما قبل الوصول';

  @override
  String get preArrivalVisaTitle => 'التأشيرة والمستندات';

  @override
  String get preArrivalVisaPassport => 'جواز سفر صالح لمدة 6 أشهر على الأقل، وفيه صفحتان فارغتان.';

  @override
  String get preArrivalVisaEMedical =>
      'تأشيرة e-Medical الهندية (وتأشيرة e-Medical Attendant للمرافقين) - نرسل لك خطاب دعوة المستشفى.';

  @override
  String get preArrivalVisaCopies => 'نسخ مطبوعة من تأشيرتك وخطاب الدعوة وتأكيد الحجز والتقارير الطبية.';

  @override
  String get preArrivalMedicalTitle => 'السجلات الطبية';

  @override
  String get preArrivalMedicalReports =>
      'الصور الطبية الحديثة ونتائج التحاليل والوصفات - حمّلها في المستندات ليتمكن طبيبك من مراجعتها.';

  @override
  String get preArrivalMedicalMedicines => 'قائمة بالأدوية الحالية مع جرعاتها؛ واصطحب كمية تكفي الرحلة كلها.';

  @override
  String get preArrivalMedicalAllergies => 'الحساسية والعمليات الجراحية السابقة مكتوبة باللغة الإنجليزية.';

  @override
  String get preArrivalPackTitle => 'ماذا تحزم';

  @override
  String get preArrivalPackClothing => 'ملابس فضفاضة ومريحة لما بعد العلاج.';

  @override
  String get preArrivalPackAdapter => 'محوّل كهرباء عالمي (تستخدم الهند مقابس من النوع C وD وM، بجهد 230 فولت).';

  @override
  String get preArrivalPackJacket => 'سترة خفيفة - المستشفيات والرحلات الجوية مكيّفة.';

  @override
  String get preArrivalMoneyTitle => 'المال';

  @override
  String get preArrivalMoneyCards =>
      'تُقبل البطاقات في المستشفيات والفنادق؛ احتفظ ببعض الروبيات لسيارات الأجرة والمتاجر الصغيرة.';

  @override
  String get preArrivalMoneyTellBank => 'أبلغ بنكك بأنك مسافر إلى الهند حتى لا تُحظر بطاقاتك.';

  @override
  String get preArrivalMoneyReceipts => 'احتفظ بإيصالات الدفع في التطبيق ضمن المستندات.';

  @override
  String get preArrivalArrivalTitle => 'يوم الوصول';

  @override
  String get preArrivalArrivalFlight => 'شارك تفاصيل رحلتك لنرتّب الاستقبال من المطار.';

  @override
  String get preArrivalArrivalDriver => 'ينتظرك السائق في صالة الوصول حاملًا لافتة Heal India Global.';

  @override
  String get preArrivalArrivalHelpline => 'احفظ رقم خط المساعدة المتاح على مدار الساعة قبل السفر.';

  @override
  String get preArrivalCulturalTips => 'نصائح ثقافية';

  @override
  String get preArrivalTipsSoon => 'ستظهر النصائح هنا قريبًا.';

  @override
  String get preArrivalDisclaimer => 'معلومات سفر عامة فقط - اتبع دائمًا تعليمات طبيبك.';

  @override
  String journeyCallFromPhone(String number) {
    return 'اتصل بالرقم $number من هاتفك.';
  }

  @override
  String journeyWhatsAppFromPhone(String number) {
    return 'راسل $number عبر WhatsApp من هاتفك.';
  }

  @override
  String get journeyCoordinatorChatSubject => 'منسّق رعايتي';

  @override
  String get emergencyContactsTitle => 'جهات اتصال الطوارئ';

  @override
  String get emergencyContactsIntro => 'في حالة الطوارئ الطبية في الهند، اتصل أولًا برقم الطوارئ المحلي.';

  @override
  String get emergencyContactsServicesIndia => 'خدمات الطوارئ (الهند)';

  @override
  String get emergencyContactsHelpline => 'خط مساعدة Heal India Global على مدار الساعة';

  @override
  String get emergencyContactsWhatsApp => 'الدعم عبر WhatsApp';

  @override
  String emergencyContactsCoordinator(String name) {
    return 'المنسّق - $name';
  }

  @override
  String get emergencyContactsMine => 'جهة اتصالي للطوارئ';

  @override
  String get travelRequestSent => 'تم إرسال الطلب. سيتواصل معك مكتب السفر لدينا.';

  @override
  String get visaSectionTitle => 'التأشيرة الطبية';

  @override
  String get visaEmptyText =>
      'يحتاج معظم المرضى الدوليين إلى تأشيرة e-Medical الهندية. نوفّر خطاب دعوة المستشفى ونساعدك في التقديم.';

  @override
  String get visaRequestAssistance => 'طلب المساعدة في التأشيرة';

  @override
  String get flightSectionTitle => 'الرحلات الجوية والتنقل من المطار وإليه';

  @override
  String get flightNoRequests => 'لا توجد طلبات رحلات أو تنقلات بعد.';

  @override
  String get flightRequestChip => 'طلب رحلة جوية';

  @override
  String get travelAirportPickup => 'الاستقبال من المطار';

  @override
  String get travelAirportDrop => 'التوصيل إلى المطار';

  @override
  String get stayAccommodation => 'الإقامة';

  @override
  String get stayEmptyText => 'فنادق ودور ضيافة وشقق فندقية قريبة من مستشفاك.';

  @override
  String get stayRequestAccommodation => 'طلب إقامة';

  @override
  String get stayRequestAnother => 'طلب إقامة أخرى';

  @override
  String get travelLocalServices => 'الخدمات المحلية';

  @override
  String get travelTranslator => 'مترجم';

  @override
  String get travelLocalGuide => 'مرشد محلي';

  @override
  String get travelTransport => 'النقل';

  @override
  String get visaHintNotStarted => 'استلمنا طلبك وسنرسل لك قائمة بالمستندات المطلوبة.';

  @override
  String get visaHintDocumentsPending => 'حمّل جواز سفرك وتقاريرك الطبية في المستندات.';

  @override
  String get visaHintInvitationIssued => 'خطاب الدعوة جاهز. قدّم طلبك عبر indianvisaonline.gov.in.';

  @override
  String get visaHintApplied => 'تم تقديم الطلب. يستغرق القرار عادةً من 3 إلى 5 أيام عمل.';

  @override
  String get visaHintApproved => 'تمت الموافقة على التأشيرة. احمل نسخة مطبوعة عند السفر.';

  @override
  String get visaHintRejected => 'لم تتم الموافقة على الطلب. سيتواصل معك منسّقك.';

  @override
  String visaApplicationRef(String ref) {
    return 'مرجع الطلب: $ref';
  }

  @override
  String get visaInvitationLetter => 'خطاب الدعوة';

  @override
  String get travelRouteArrow => ' ← ';

  @override
  String flightPnr(String pnr) {
    return 'PNR $pnr';
  }

  @override
  String stayGuestCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ضيف',
      many: '$count ضيفًا',
      few: '$count ضيوف',
      two: 'ضيفان',
      one: 'ضيف واحد',
      zero: '$count ضيف',
    );
    return '$_temp0';
  }

  @override
  String stayConfirmationCode(String code) {
    return 'رقم التأكيد $code';
  }

  @override
  String get checklistTitle => 'قائمة مهامك';

  @override
  String get tripsTodaySchedule => 'جدول اليوم';

  @override
  String get tripsQuickActions => 'إجراءات سريعة';

  @override
  String get tripsUploadDocuments => 'تحميل المستندات';

  @override
  String get tripsChatWithCoordinator => 'محادثة\nالمنسّق';

  @override
  String get tripsEmergencyContacts => 'جهات اتصال\nالطوارئ';

  @override
  String get journeySectionTitle => 'رحلتك';

  @override
  String get tripsTravelSubtitle => 'التأشيرة، الرحلات، الاستقبال من المطار، الإقامة، المترجم';

  @override
  String get tripsSupportTitle => 'الدعم داخل الهند';

  @override
  String get tripsSupportSubtitle => 'الخريطة، الجدول، خط المساعدة، المترجم، SOS';

  @override
  String get tripsMyCases => 'حالاتي';

  @override
  String tripsActiveCases(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count حالة نشطة',
      many: '$count حالة نشطة',
      few: '$count حالات نشطة',
      two: 'حالتان نشطتان',
      one: 'حالة نشطة واحدة',
      zero: 'لا توجد حالات نشطة',
    );
    return '$_temp0';
  }

  @override
  String tripsYourCoordinator(String name) {
    return 'منسّقك: $name';
  }

  @override
  String get tripsMessageAnyTime => 'راسله في أي وقت';

  @override
  String tripsCountdownUnit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'يوم',
      many: 'يومًا',
      few: 'أيام',
      two: 'يومان',
      one: 'يوم',
      zero: 'يوم',
    );
    return '$_temp0';
  }

  @override
  String get tripsCountdownToday => 'اليوم';

  @override
  String get tripsCountdownDone => 'اكتمل';

  @override
  String get tripsCountdownNow => 'الآن';

  @override
  String get tripsTreatmentInProgress => 'العلاج جارٍ';

  @override
  String get tripsUntilTreatment => 'حتى موعد العلاج';

  @override
  String tripsDaysUntilTreatment(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم حتى العلاج',
      many: '$count يومًا حتى العلاج',
      few: '$count أيام حتى العلاج',
      two: 'يومان حتى العلاج',
      one: 'يوم واحد حتى العلاج',
      zero: '$count يوم حتى العلاج',
    );
    return '$_temp0';
  }

  @override
  String get tripsPaymentNeeded => 'يلزم الدفع للتأكيد';

  @override
  String get tripsBalanceDue => 'المبلغ المتبقي المستحق';

  @override
  String get tripsPayNow => 'ادفع الآن';

  @override
  String get tripsNoTripTitle => 'لا يوجد علاج قادم بعد';

  @override
  String get tripsNoTripBody => 'اعثر على المستشفى المناسب عبر فحص مجاني بالذكاء الاصطناعي، أو تابع حالة بدأتها.';

  @override
  String get travelSelect => 'اختر';

  @override
  String get visaAssistanceTitle => 'المساعدة في التأشيرة';

  @override
  String get visaAssistanceSubtitle => 'نُعدّ خطاب دعوة المستشفى ونرشدك خلال طلب تأشيرة e-Medical الهندية.';

  @override
  String get visaForPatient => 'المريض';

  @override
  String get visaForAttendant => 'المرافق';

  @override
  String get visaNotesLabel => 'ملاحظات (الجنسية، تواريخ السفر، المرافقون)';

  @override
  String get travelAirport => 'المطار';

  @override
  String travelCityAirport(String city) {
    return 'مطار $city';
  }

  @override
  String get travelHospitalOrHotel => 'المستشفى / الفندق';

  @override
  String get flightRequestTitle => 'طلب رحلة جوية';

  @override
  String get flightRequestSubtitle => 'يرسل لك مكتب السفر خيارات الأسعار؛ ولا يُخصم أي مبلغ حتى تؤكد.';

  @override
  String get flightPreferredDeparture => 'موعد المغادرة المفضّل';

  @override
  String get travelPickupSubtitle => 'يستقبلك سائق في صالة الوصول ويوصلك إلى المستشفى أو الفندق.';

  @override
  String get travelArrivalDateTime => 'تاريخ ووقت الوصول';

  @override
  String get travelDropSubtitle => 'نوصلك إلى المطار لرحلة العودة.';

  @override
  String get travelPickupTime => 'موعد الاصطحاب';

  @override
  String get travelLocalTransport => 'النقل المحلي';

  @override
  String get travelLocalTransportSubtitle => 'سيارة مع سائق للمواعيد داخل المدينة.';

  @override
  String get travelStart => 'البداية';

  @override
  String get travelSendRequest => 'إرسال الطلب';

  @override
  String get flightFromCityOrAirport => 'من (مدينة أو مطار)';

  @override
  String get travelFrom => 'من';

  @override
  String get travelTo => 'إلى';

  @override
  String get flightNumberOptional => 'رقم الرحلة (اختياري)';

  @override
  String get travelPassengers => 'الركاب';

  @override
  String get travelFewerPassengers => 'تقليل الركاب';

  @override
  String get travelMorePassengers => 'زيادة الركاب';

  @override
  String get travelNotesLabel => 'ملاحظات (كرسي متحرك، أمتعة، تفضيلات)';

  @override
  String get staySheetSubtitle => 'أماكن إقامة قريبة من مستشفاك. يؤكد فريقنا التوفر والسعر قبل الحجز.';

  @override
  String get stayNoPartners => 'لا توجد أماكن إقامة شريكة مدرجة لهذا المستشفى بعد. اسأل منسّقك في الرسائل.';

  @override
  String stayDistanceKm(String km) {
    return '$km كم';
  }

  @override
  String stayPerNight(String amount) {
    return '$amount/الليلة';
  }

  @override
  String get stayCheckInOut => 'تسجيل الوصول - المغادرة';

  @override
  String get stayGuests => 'الضيوف';

  @override
  String get stayFewerGuests => 'تقليل الضيوف';

  @override
  String get stayMoreGuests => 'زيادة الضيوف';

  @override
  String get stayNotesLabel => 'ملاحظات (نوع الغرفة، سهولة الوصول، النظام الغذائي)';

  @override
  String get travelTranslatorTitle => 'احصل على مترجم';

  @override
  String get travelTranslatorSubtitle => 'مترجم طبي للاستشارات وفترات الإقامة في المستشفى.';

  @override
  String get travelTranslatorNotes => 'اللغة المطلوبة (مثل العربية، الفرنسية)';

  @override
  String get travelGuideTitle => 'احجز مرشدًا محليًا';

  @override
  String get travelGuideSubtitle => 'مرشد موثوق لقضاء الحاجات والتسوق وزيارة المعالم خلال فترة التعافي.';

  @override
  String get travelGuideNotes => 'بماذا تحتاج المساعدة؟';

  @override
  String travelServiceRequestTitle(String service) {
    return 'طلب $service';
  }

  @override
  String get travelServiceSubtitle => 'يؤكد فريقنا التفاصيل والسعر معك.';

  @override
  String get travelNotes => 'ملاحظات';

  @override
  String get travelWhenNeeded => 'متى تحتاج إليها؟';

  @override
  String get travelPreferredProvider => 'مقدّم الخدمة المفضّل (اختياري)';

  @override
  String get travelAnyAvailable => 'أي متاح';

  @override
  String get profileMyJourney => 'رحلتي';

  @override
  String get profileMyCasesQuotes => 'حالاتي وعروض الأسعار';

  @override
  String get profileDocuments => 'المستندات';

  @override
  String get profileDocumentsSubtitle => 'جواز السفر، التقارير الطبية، التأشيرات، الفواتير';

  @override
  String get companionsTitle => 'المرافقون في السفر';

  @override
  String get companionsSubtitleDefault => 'الأشخاص المسافرون معك';

  @override
  String get companionsSubtitleEmpty => 'أضف الأشخاص المسافرين معك';

  @override
  String get savedTitle => 'المحفوظات';

  @override
  String get profileSavedSubtitle => 'المستشفيات والأطباء والعلاجات';

  @override
  String get profileAbout => 'حول التطبيق';

  @override
  String get profileTermsOfService => 'شروط الخدمة';

  @override
  String get profilePrivacyPolicy => 'سياسة الخصوصية';

  @override
  String get deleteAccountDoneSnack => 'تم حذف حسابك.';

  @override
  String get profileGuest => 'ضيف';

  @override
  String get profilePatientBadge => 'مريض';

  @override
  String get profileEmailVerified => 'تم التحقق من البريد';

  @override
  String get editProfileTitle => 'تعديل الملف الشخصي';

  @override
  String get profileGuestUpgradeTitle => 'أنشئ حسابك المجاني';

  @override
  String get profileGuestUpgradeBody =>
      'احتفظ بتقييماتك الصحية ونتائج المطابقة، واطلب عروض الأسعار، واحجز العلاج، وارفع المستندات، وتحدّث مع منسّقك.';

  @override
  String get profileCreateAccount => 'إنشاء حساب';

  @override
  String get authLogIn => 'تسجيل الدخول';

  @override
  String get profilePersonalInfo => 'المعلومات الشخصية';

  @override
  String profilePassportExpires(String date) {
    return 'تنتهي صلاحيته في $date';
  }

  @override
  String get profileDateOfBirth => 'تاريخ الميلاد';

  @override
  String get profileGender => 'الجنس';

  @override
  String get profileNationality => 'الجنسية';

  @override
  String get profilePhone => 'الهاتف';

  @override
  String get profilePassport => 'جواز السفر';

  @override
  String get profilePassportValidityWarning =>
      'يجب أن يكون جواز سفرك صالحًا لمدة 6 أشهر على الأقل للتقدّم بطلب تأشيرة e-Medical.';

  @override
  String get profileEmergencyContact => 'جهة الاتصال في حالات الطوارئ';

  @override
  String get profileBloodGroup => 'فصيلة الدم';

  @override
  String get profileNotSet => 'غير محدد';

  @override
  String get profileNotAdded => 'غير مضاف';

  @override
  String profileClearField(String label) {
    return 'مسح $label';
  }

  @override
  String get profileRelationship => 'صلة القرابة';

  @override
  String get profileNewPassportNumber => 'رقم جواز السفر الجديد';

  @override
  String get settingsPreferences => 'التفضيلات';

  @override
  String get settingsCurrency => 'العملة';

  @override
  String settingsCurrencySubtitle(String currency) {
    return 'تُعرض الأسعار كتقديرات بعملة $currency';
  }

  @override
  String get settingsPreferredCurrency => 'العملة المفضلة';

  @override
  String get settingsAppearance => 'المظهر';

  @override
  String get settingsThemeDark => 'داكن';

  @override
  String get settingsThemeLight => 'فاتح';

  @override
  String get settingsThemeSystem => 'مطابقة الجهاز';

  @override
  String get settingsSecurity => 'الأمان';

  @override
  String get accountVerifyEmail => 'تحقّق من بريدك الإلكتروني';

  @override
  String accountVerifyEmailSubtitle(String email) {
    return 'ابحث عن رابط التحقق في $email';
  }

  @override
  String get accountVerificationSent => 'تم إرسال رسالة التحقق';

  @override
  String get accountResend => 'إعادة الإرسال';

  @override
  String get accountYourData => 'بياناتك';

  @override
  String get accountYourDataSubtitle => 'البيانات الطبية مشفّرة ولا تُشارك إلا مع المستشفيات التي تختارها.';

  @override
  String get accountExitGuestTitle => 'الخروج من وضع الضيف؟';

  @override
  String get accountLogOutTitle => 'تسجيل الخروج؟';

  @override
  String get accountExitGuestBody => 'ستفقد تقييماتك الصحية كضيف ما لم تنشئ حسابًا أولًا.';

  @override
  String get accountLogOutBody => 'يمكنك تسجيل الدخول مجددًا في أي وقت باستخدام بريدك الإلكتروني وكلمة المرور.';

  @override
  String get accountExit => 'خروج';

  @override
  String get accountExitGuestMode => 'الخروج من وضع الضيف';

  @override
  String get companionsRemoveTitle => 'إزالة المرافق؟';

  @override
  String companionsRemoveBody(String name) {
    return 'ستتم إزالة $name من قائمة مرافقيك في السفر.';
  }

  @override
  String get companionsRemovedSnack => 'تمت إزالة المرافق';

  @override
  String companionsAddedSnack(String name) {
    return 'تمت إضافة $name';
  }

  @override
  String get companionAdd => 'إضافة مرافق';

  @override
  String get companionsEmptyTitle => 'لا يوجد مرافقون بعد';

  @override
  String get companionsEmptyMessage =>
      'أضف فرد العائلة أو الصديق المسافر معك حتى نتمكن من ترتيب تأشيرة المرافق الخاصة به.';

  @override
  String companionsBorn(String date) {
    return 'تاريخ الميلاد $date';
  }

  @override
  String companionsPassportLast4(String last4) {
    return 'جواز السفر •••• $last4';
  }

  @override
  String companionsEditTooltip(String name) {
    return 'تعديل $name';
  }

  @override
  String companionsRemoveTooltip(String name) {
    return 'إزالة $name';
  }

  @override
  String get companionEditTitle => 'تعديل المرافق';

  @override
  String get companionFormIntro => 'يسافر المرافقون معك بصفتهم مرافقين طبيين ويحتاجون إلى تأشيرة خاصة بهم.';

  @override
  String get companionFullNameRequired => 'أدخل الاسم الكامل';

  @override
  String get companionFullNameLabel => 'الاسم الكامل (كما في جواز السفر)';

  @override
  String get companionRelationshipRequired => 'اختر صلة القرابة';

  @override
  String get companionRelationshipSpouse => 'الزوج/الزوجة';

  @override
  String get companionRelationshipParent => 'أحد الوالدين';

  @override
  String get companionRelationshipChild => 'الابن/الابنة';

  @override
  String get companionRelationshipSibling => 'الأخ/الأخت';

  @override
  String get companionRelationshipRelative => 'قريب';

  @override
  String get companionRelationshipFriend => 'صديق';

  @override
  String get companionRelationshipCaregiver => 'مقدّم رعاية';

  @override
  String get companionPassportInvalid => 'أدخل رقم جواز سفر صالحًا';

  @override
  String get companionPassportOptional => 'رقم جواز السفر (اختياري)';

  @override
  String get companionPassportStoredEncrypted => 'يُخزَّن مشفّرًا';

  @override
  String companionPassportCurrent(String last4) {
    return 'الحالي: •••• $last4 - اتركه فارغًا للإبقاء عليه';
  }

  @override
  String get companionSave => 'حفظ المرافق';

  @override
  String get editProfileEcNameRequired => 'أضف الاسم أو امسح بيانات جهة الاتصال في حالات الطوارئ';

  @override
  String get editProfileEcRelationshipRequired => 'أضف صلة القرابة أو امسح بيانات جهة الاتصال في حالات الطوارئ';

  @override
  String get editProfileEcPhoneRequired => 'أضف رقم الهاتف أو امسح بيانات جهة الاتصال في حالات الطوارئ';

  @override
  String get editProfileFixFields => 'يُرجى تصحيح الحقول المميّزة.';

  @override
  String get editProfileSaved => 'تم حفظ الملف الشخصي';

  @override
  String get editProfilePersonalDetails => 'البيانات الشخصية';

  @override
  String get editProfileFirstName => 'الاسم الأول';

  @override
  String get editProfileLastName => 'اسم العائلة';

  @override
  String get editProfileCountryOfResidence => 'بلد الإقامة';

  @override
  String get editProfilePassportSubtitle => 'مطلوب لخطاب الدعوة الخاص بتأشيرتك الطبية';

  @override
  String get editProfilePassportInvalid => 'استخدم من 5 إلى 20 حرفًا أو رقمًا';

  @override
  String get editProfilePassportNumber => 'رقم جواز السفر';

  @override
  String get editProfilePassportHelperNew => 'يُخزَّن مشفّرًا. لا تُعرض إلا آخر 4 أرقام.';

  @override
  String editProfilePassportOnFile(String masked) {
    return 'المحفوظ: $masked. اتركه فارغًا للإبقاء عليه.';
  }

  @override
  String get editProfilePassportExpiry => 'تاريخ انتهاء جواز السفر';

  @override
  String get editProfileName => 'الاسم';

  @override
  String get editProfileMedicalInfo => 'المعلومات الطبية';

  @override
  String get editProfileMedicalInfoSubtitle => 'لا تُشارك إلا مع المستشفيات التي تطلب منها عروض أسعار';

  @override
  String get editProfileAllergies => 'الحساسية';

  @override
  String get editProfileMedicalHistory => 'التاريخ الطبي';

  @override
  String get editProfileInsurance => 'التأمين';

  @override
  String get editProfileInsuranceProvider => 'شركة التأمين';

  @override
  String get editProfilePolicyNumber => 'رقم الوثيقة';

  @override
  String get editProfileNewPolicyNumber => 'رقم الوثيقة الجديد';

  @override
  String editProfilePolicyOnFile(String last4) {
    return 'المحفوظ: •••• $last4. اتركه فارغًا للإبقاء عليه.';
  }

  @override
  String get editProfileSaveChanges => 'حفظ التغييرات';

  @override
  String get savedEmptyTitle => 'لا توجد عناصر محفوظة بعد';

  @override
  String get savedEmptyMessage => 'اضغط على علامة الحفظ في أي مستشفى أو طبيب أو علاج للاحتفاظ به هنا.';

  @override
  String get savedExploreHospitals => 'استكشف المستشفيات';

  @override
  String savedFilterAll(int count) {
    return 'الكل ($count)';
  }

  @override
  String savedFilterType(String type, int count) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'مستشفيات ($count)',
      'doctor': 'أطباء ($count)',
      'procedure': 'إجراءات ($count)',
      'other': 'أخرى ($count)',
    });
    return '$_temp0';
  }

  @override
  String get savedEmptyCategory => 'لا توجد عناصر محفوظة في هذه الفئة';

  @override
  String savedNoLongerAvailable(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'هذا المستشفى لم يعد متاحًا',
      'doctor': 'هذا الطبيب لم يعد متاحًا',
      'procedure': 'هذا الإجراء لم يعد متاحًا',
      'other': 'هذا العنصر لم يعد متاحًا',
    });
    return '$_temp0';
  }

  @override
  String get passwordChangeTitle => 'تغيير كلمة المرور';

  @override
  String get passwordUpdatedSnack => 'تم تحديث كلمة المرور. تم تسجيل الخروج من الأجهزة الأخرى.';

  @override
  String get passwordCurrent => 'كلمة المرور الحالية';

  @override
  String get passwordCurrentHelper => 'اتركه فارغًا إذا سجّلت عبر Google ولم تعيّن كلمة مرور قط';

  @override
  String get passwordNew => 'كلمة المرور الجديدة';

  @override
  String get passwordMustDiffer => 'اختر كلمة مرور مختلفة عن الحالية';

  @override
  String passwordPolicyHelper(int min) {
    return '$min أحرف على الأقل، تتضمن حرفًا ورقمًا';
  }

  @override
  String get passwordConfirmNew => 'تأكيد كلمة المرور الجديدة';

  @override
  String get passwordMismatch => 'كلمتا المرور غير متطابقتين';

  @override
  String get passwordUpdateButton => 'تحديث كلمة المرور';

  @override
  String get deleteAccountGuestBody => 'يؤدي هذا إلى حذف حساب الضيف وتقييماتك الصحية والعناصر المحفوظة نهائيًا.';

  @override
  String get deleteAccountBody =>
      'يؤدي هذا إلى حذف حسابك وملفك الشخصي ومرافقيك والعناصر المحفوظة والمستندات المرفوعة نهائيًا، وتسجيل خروجك من جميع الأجهزة. لا يمكن التراجع عن ذلك.';

  @override
  String get deleteAccountRetention =>
      'السجلات التي يُلزمنا القانون بالاحتفاظ بها (الفواتير والمدفوعات والمبالغ المستردة وسجلات العلاج في المستشفى) تُحفظ طوال مدة الاحتفاظ القانونية مع تقييد الوصول إليها، ثم تُمحى. قد يلزم تسوية الحجوزات المفتوحة أو المدفوعات المعلّقة أو إلغاؤها أولًا.';

  @override
  String get deleteAccountPasswordLabel => 'كلمة المرور';

  @override
  String get deleteAccountPasswordHelper => 'اتركه فارغًا إذا سجّلت الدخول عبر Google أو Apple ولم تعيّن كلمة مرور قط';

  @override
  String get deleteAccountOtpLabel => 'رمز المصادقة';

  @override
  String get deleteAccountOtpHelper => 'الرمز المكوّن من 6 أرقام من تطبيق المصادقة';

  @override
  String get deleteAccountReasonLabel => 'لماذا تغادر؟ (اختياري)';

  @override
  String deleteAccountConfirmLabel(String word) {
    return 'اكتب $word للتأكيد';
  }

  @override
  String get deleteAccountSubmit => 'حذف حسابي نهائيًا';

  @override
  String get deleteAccountBlockerActiveCases => 'حالات قيد المعالجة';

  @override
  String get deleteAccountBlockerActiveBookings => 'حجوزات قادمة أو نشطة';

  @override
  String get deleteAccountBlockerPendingPayments => 'مدفوعات قيد المعالجة';

  @override
  String get deleteAccountBlockerHospitalsOwned => 'مستشفيات مدرجة تملكها';

  @override
  String get deleteAccountBlockersTitle => 'يجب إغلاق ما يلي أولًا';

  @override
  String get deleteAccountRequestSent =>
      'تم إرسال طلب الحذف. سيُغلق فريق الدعم حسابك بعد تسوية هذه الأمور ويؤكد ذلك عبر البريد الإلكتروني.';

  @override
  String get deleteAccountRequestButton => 'طلب الحذف';

  @override
  String get forgotPasswordInvalidCode => 'رمز إعادة التعيين هذا غير صالح أو منتهي الصلاحية. اطلب رمزًا جديدًا.';

  @override
  String get forgotPasswordSetNewTitle => 'تعيين كلمة مرور جديدة';

  @override
  String get forgotPasswordTitle => 'إعادة تعيين كلمة المرور';

  @override
  String get forgotPasswordIntro => 'أدخل البريد الإلكتروني الذي سجّلت به وسنرسل إليك رابطًا لإعادة تعيين كلمة المرور.';

  @override
  String get forgotPasswordEmailLabel => 'البريد الإلكتروني';

  @override
  String get forgotPasswordSendLink => 'إرسال رابط إعادة التعيين';

  @override
  String get forgotPasswordHaveCode => 'لديّ رمز إعادة تعيين بالفعل';

  @override
  String get forgotPasswordCheckInbox => 'تحقّق من بريدك الوارد';

  @override
  String forgotPasswordSentBody(String email) {
    return 'إذا كان هناك حساب مرتبط بـ $email، فقد أرسلنا رابط إعادة تعيين كلمة المرور. قد يستغرق وصوله بضع دقائق - تحقّق من مجلد الرسائل غير المرغوب فيها أيضًا.';
  }

  @override
  String get forgotPasswordEnterCode => 'أدخل رمز إعادة التعيين';

  @override
  String get forgotPasswordBackToLogin => 'العودة إلى تسجيل الدخول';

  @override
  String get forgotPasswordResetIntro =>
      'الصق رمز إعادة التعيين من الرسالة التي أرسلناها إليك، ثم اختر كلمة مرور جديدة.';

  @override
  String get forgotPasswordPasteFullCode => 'الصق رمز إعادة التعيين كاملًا';

  @override
  String get forgotPasswordCodeLabel => 'رمز إعادة التعيين';

  @override
  String get forgotPasswordRequestNewLink => 'طلب رابط جديد';

  @override
  String get forgotPasswordUpdatedTitle => 'تم تحديث كلمة المرور';

  @override
  String get forgotPasswordUpdatedBody => 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.';

  @override
  String get validationEnterEmail => 'أدخل بريدك الإلكتروني';

  @override
  String get validationInvalidEmail => 'أدخل عنوان بريد إلكتروني صالحًا';

  @override
  String get validationEnterPassword => 'أدخل كلمة المرور';

  @override
  String get validationChoosePassword => 'اختر كلمة مرور';

  @override
  String validationPasswordTooShort(int min) {
    return 'استخدم $min أحرف على الأقل';
  }

  @override
  String validationPasswordTooLong(int max) {
    return 'استخدم $max حرفًا كحد أقصى';
  }

  @override
  String get validationPasswordLetterDigit => 'أدرج حرفًا واحدًا ورقمًا واحدًا على الأقل';

  @override
  String get validationEnterFullName => 'أدخل اسمك الكامل';

  @override
  String get validationNameTooLong => 'الاسم طويل جدًا';

  @override
  String get validationInvalidPhone => 'أدخل رقم هاتف صالحًا';

  @override
  String get validationEnterOtp => 'أدخل الرمز المكوّن من 6 أرقام';

  @override
  String get countryAF => 'أفغانستان';

  @override
  String get countryDZ => 'الجزائر';

  @override
  String get countryAO => 'أنغولا';

  @override
  String get countryAR => 'الأرجنتين';

  @override
  String get countryAM => 'أرمينيا';

  @override
  String get countryAU => 'أستراليا';

  @override
  String get countryAT => 'النمسا';

  @override
  String get countryAZ => 'أذربيجان';

  @override
  String get countryBH => 'البحرين';

  @override
  String get countryBD => 'بنغلاديش';

  @override
  String get countryBY => 'بيلاروس';

  @override
  String get countryBE => 'بلجيكا';

  @override
  String get countryBT => 'بوتان';

  @override
  String get countryBW => 'بوتسوانا';

  @override
  String get countryBR => 'البرازيل';

  @override
  String get countryBN => 'بروناي';

  @override
  String get countryBG => 'بلغاريا';

  @override
  String get countryBI => 'بوروندي';

  @override
  String get countryKH => 'كمبوديا';

  @override
  String get countryCM => 'الكاميرون';

  @override
  String get countryCA => 'كندا';

  @override
  String get countryTD => 'تشاد';

  @override
  String get countryCL => 'تشيلي';

  @override
  String get countryCN => 'الصين';

  @override
  String get countryCO => 'كولومبيا';

  @override
  String get countryCD => 'الكونغو الديمقراطية';

  @override
  String get countryCI => 'كوت ديفوار';

  @override
  String get countryHR => 'كرواتيا';

  @override
  String get countryCY => 'قبرص';

  @override
  String get countryCZ => 'التشيك';

  @override
  String get countryDK => 'الدنمارك';

  @override
  String get countryDJ => 'جيبوتي';

  @override
  String get countryEG => 'مصر';

  @override
  String get countryER => 'إريتريا';

  @override
  String get countryEE => 'إستونيا';

  @override
  String get countryET => 'إثيوبيا';

  @override
  String get countryFJ => 'فيجي';

  @override
  String get countryFI => 'فنلندا';

  @override
  String get countryFR => 'فرنسا';

  @override
  String get countryGA => 'الغابون';

  @override
  String get countryGM => 'غامبيا';

  @override
  String get countryGE => 'جورجيا';

  @override
  String get countryDE => 'ألمانيا';

  @override
  String get countryGH => 'غانا';

  @override
  String get countryGR => 'اليونان';

  @override
  String get countryGN => 'غينيا';

  @override
  String get countryGY => 'غيانا';

  @override
  String get countryHK => 'هونغ كونغ';

  @override
  String get countryHU => 'المجر';

  @override
  String get countryIS => 'آيسلندا';

  @override
  String get countryIN => 'الهند';

  @override
  String get countryID => 'إندونيسيا';

  @override
  String get countryIR => 'إيران';

  @override
  String get countryIQ => 'العراق';

  @override
  String get countryIE => 'أيرلندا';

  @override
  String get countryIL => 'إسرائيل';

  @override
  String get countryIT => 'إيطاليا';

  @override
  String get countryJM => 'جامايكا';

  @override
  String get countryJP => 'اليابان';

  @override
  String get countryJO => 'الأردن';

  @override
  String get countryKZ => 'كازاخستان';

  @override
  String get countryKE => 'كينيا';

  @override
  String get countryKW => 'الكويت';

  @override
  String get countryKG => 'قيرغيزستان';

  @override
  String get countryLA => 'لاوس';

  @override
  String get countryLV => 'لاتفيا';

  @override
  String get countryLB => 'لبنان';

  @override
  String get countryLS => 'ليسوتو';

  @override
  String get countryLR => 'ليبيريا';

  @override
  String get countryLY => 'ليبيا';

  @override
  String get countryLT => 'ليتوانيا';

  @override
  String get countryLU => 'لوكسمبورغ';

  @override
  String get countryMG => 'مدغشقر';

  @override
  String get countryMW => 'ملاوي';

  @override
  String get countryMY => 'ماليزيا';

  @override
  String get countryMV => 'جزر المالديف';

  @override
  String get countryML => 'مالي';

  @override
  String get countryMT => 'مالطا';

  @override
  String get countryMR => 'موريتانيا';

  @override
  String get countryMU => 'موريشيوس';

  @override
  String get countryMX => 'المكسيك';

  @override
  String get countryMD => 'مولدوفا';

  @override
  String get countryMN => 'منغوليا';

  @override
  String get countryMA => 'المغرب';

  @override
  String get countryMZ => 'موزمبيق';

  @override
  String get countryMM => 'ميانمار';

  @override
  String get countryNA => 'ناميبيا';

  @override
  String get countryNP => 'نيبال';

  @override
  String get countryNL => 'هولندا';

  @override
  String get countryNZ => 'نيوزيلندا';

  @override
  String get countryNE => 'النيجر';

  @override
  String get countryNG => 'نيجيريا';

  @override
  String get countryNO => 'النرويج';

  @override
  String get countryOM => 'عُمان';

  @override
  String get countryPK => 'باكستان';

  @override
  String get countryPS => 'فلسطين';

  @override
  String get countryPA => 'بنما';

  @override
  String get countryPG => 'بابوا غينيا الجديدة';

  @override
  String get countryPE => 'بيرو';

  @override
  String get countryPH => 'الفلبين';

  @override
  String get countryPL => 'بولندا';

  @override
  String get countryPT => 'البرتغال';

  @override
  String get countryQA => 'قطر';

  @override
  String get countryRO => 'رومانيا';

  @override
  String get countryRU => 'روسيا';

  @override
  String get countryRW => 'رواندا';

  @override
  String get countrySA => 'المملكة العربية السعودية';

  @override
  String get countrySN => 'السنغال';

  @override
  String get countryRS => 'صربيا';

  @override
  String get countrySC => 'سيشل';

  @override
  String get countrySL => 'سيراليون';

  @override
  String get countrySG => 'سنغافورة';

  @override
  String get countrySK => 'سلوفاكيا';

  @override
  String get countrySI => 'سلوفينيا';

  @override
  String get countrySO => 'الصومال';

  @override
  String get countryZA => 'جنوب أفريقيا';

  @override
  String get countryKR => 'كوريا الجنوبية';

  @override
  String get countrySS => 'جنوب السودان';

  @override
  String get countryES => 'إسبانيا';

  @override
  String get countryLK => 'سريلانكا';

  @override
  String get countrySD => 'السودان';

  @override
  String get countrySR => 'سورينام';

  @override
  String get countrySE => 'السويد';

  @override
  String get countryCH => 'سويسرا';

  @override
  String get countrySY => 'سوريا';

  @override
  String get countryTW => 'تايوان';

  @override
  String get countryTJ => 'طاجيكستان';

  @override
  String get countryTZ => 'تنزانيا';

  @override
  String get countryTH => 'تايلاند';

  @override
  String get countryTG => 'توغو';

  @override
  String get countryTT => 'ترينيداد وتوباغو';

  @override
  String get countryTN => 'تونس';

  @override
  String get countryTR => 'تركيا';

  @override
  String get countryTM => 'تركمانستان';

  @override
  String get countryUG => 'أوغندا';

  @override
  String get countryUA => 'أوكرانيا';

  @override
  String get countryAE => 'الإمارات العربية المتحدة';

  @override
  String get countryGB => 'المملكة المتحدة';

  @override
  String get countryUS => 'الولايات المتحدة';

  @override
  String get countryUY => 'الأوروغواي';

  @override
  String get countryUZ => 'أوزبكستان';

  @override
  String get countryVE => 'فنزويلا';

  @override
  String get countryVN => 'فيتنام';

  @override
  String get countryYE => 'اليمن';

  @override
  String get countryZM => 'زامبيا';

  @override
  String get countryZW => 'زيمبابوي';

  @override
  String get agentTabDashboard => 'لوحة التحكم';

  @override
  String get agentTabPatients => 'المرضى';

  @override
  String get agentTabCases => 'الحالات';

  @override
  String get agentTabBookings => 'الحجوزات';

  @override
  String get agentTabEarnings => 'الأرباح';

  @override
  String get portalNoActivityYet => 'لا يوجد نشاط بعد';

  @override
  String get portalPatientLabel => 'المريض';

  @override
  String get portalHospitalLabel => 'المستشفى';

  @override
  String get portalDoctorLabel => 'الطبيب';

  @override
  String get portalBookingLabel => 'الحجز';

  @override
  String portalCaseOpened(String when) {
    return 'فُتحت $when';
  }

  @override
  String get portalTotal => 'الإجمالي';

  @override
  String portalQuoteStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'إقامة $count يوم',
      many: 'إقامة $count يومًا',
      few: 'إقامة $count أيام',
      two: 'إقامة يومين',
      one: 'إقامة يوم واحد',
      zero: 'إقامة $count يوم',
    );
    return '$_temp0';
  }

  @override
  String portalQuoteValidUntil(String date) {
    return 'صالح حتى $date';
  }

  @override
  String portalQuotePreparedBy(String name) {
    return 'بواسطة $name';
  }

  @override
  String get portalFilterAll => 'الكل';

  @override
  String get portalAccountDeleted => 'تم حذف حسابك.';

  @override
  String get payeeStatusPending => 'قيد الانتظار';

  @override
  String get payeeStatusEligible => 'مستحق';

  @override
  String get payeeStatusOnHold => 'معلّق';

  @override
  String get payeeStatusBatched => 'ضمن دفعة';

  @override
  String get payeeStatusPaid => 'مدفوع';

  @override
  String get payeeStatusReversed => 'تم عكسه';

  @override
  String get payeeStatusQueued => 'في قائمة الانتظار';

  @override
  String get payeeStatusProcessing => 'قيد المعالجة';

  @override
  String get payeeStatusProcessed => 'تمت المعالجة';

  @override
  String get payeeStatusFailed => 'فشل';

  @override
  String get payeeStatusNeedsReconciliation => 'يحتاج إلى مطابقة';

  @override
  String get payeeSettlementsTab => 'التسويات';

  @override
  String get payeePayoutsTab => 'المدفوعات';

  @override
  String get payeeStatementTab => 'كشف الحساب';

  @override
  String get payeeItemsEmpty => 'لا يوجد شيء هنا بعد';

  @override
  String get payeePayoutsEmpty => 'لا توجد مدفوعات بعد';

  @override
  String payeePayoutUtr(String utr) {
    return 'UTR $utr';
  }

  @override
  String get payeeMethodManualBankTransfer => 'تحويل بنكي يدوي';

  @override
  String get payeeStatementTwelveMonths => '12 شهرًا';

  @override
  String payeeStatementDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم',
      many: '$count يومًا',
      few: '$count أيام',
      two: 'يومان',
      one: 'يوم واحد',
      zero: '$count يوم',
    );
    return '$_temp0';
  }

  @override
  String get payeeStatementPeriod => 'الفترة';

  @override
  String payeeStatementPeriodRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get payeeOpeningBalance => 'الرصيد الافتتاحي';

  @override
  String get payeeEarned => 'المكتسب';

  @override
  String get payeePaidOut => 'المدفوع';

  @override
  String get payeeClosingBalance => 'الرصيد الختامي';

  @override
  String get payeeStatementEmpty => 'لا توجد معاملات في هذه الفترة';

  @override
  String payeeStatementBalance(String amount) {
    return 'الرصيد $amount';
  }

  @override
  String get payeePaidToDate => 'المدفوع حتى الآن';

  @override
  String payeeOutstanding(String amount) {
    return 'مستحق غير مدفوع $amount';
  }

  @override
  String payeeNextPayout(String date) {
    return 'الدفعة التالية $date';
  }

  @override
  String get payeeKpiPending => 'قيد الانتظار';

  @override
  String get payeeKpiEligible => 'مستحق للدفع';

  @override
  String get payeeKpiOnHold => 'معلّق';

  @override
  String get payeeKpiBatched => 'ضمن دفعة مدفوعات';

  @override
  String payeeItemGrossFee(String gross, String fee) {
    return 'الإجمالي $gross · الرسوم $fee';
  }

  @override
  String payeeItemGst(String amount) {
    return 'GST $amount';
  }

  @override
  String payeeItemTds(String amount) {
    return 'TDS $amount';
  }

  @override
  String payeeItemOnHoldReason(String reason) {
    return 'معلّق: $reason';
  }

  @override
  String payeeItemEligibleOn(String date) {
    return 'مستحق في $date';
  }

  @override
  String get commissionTitle => 'العمولات';

  @override
  String commissionRateBadge(String rate) {
    return 'نسبة $rate';
  }

  @override
  String get commissionKpiPending => 'عمولة قيد الانتظار';

  @override
  String get commissionKpiPaid => 'العمولة المدفوعة';

  @override
  String get commissionByMonth => 'العمولة حسب الشهر';

  @override
  String get kycBannerNotSubmitted =>
      'أرسل مستندات التحقق من الهوية (KYC) عبر بوابة الوكلاء على الويب لتبدأ في كسب العمولات.';

  @override
  String get kycBannerPending => 'مستندات KYC الخاصة بك قيد المراجعة. يمكنك إضافة مرضى في هذه الأثناء.';

  @override
  String get kycBannerRejected => 'تم رفض KYC';

  @override
  String kycBannerRejectedWithReason(String reason) {
    return 'تم رفض KYC: $reason';
  }

  @override
  String agentAccountStatusBanner(String status) {
    return 'حالة حساب وكالتك: $status.';
  }

  @override
  String get agentDashboardTitle => 'لوحة تحكم الوكيل';

  @override
  String agentDashboardGreeting(String name) {
    return 'مرحبًا، $name';
  }

  @override
  String get agentKpiPatients => 'المرضى';

  @override
  String get agentKpiActiveCases => 'الحالات النشطة';

  @override
  String get agentKpiConfirmedBookings => 'الحجوزات المؤكدة';

  @override
  String get agentKpiConversion => 'معدل التحويل';

  @override
  String get agentQuickActions => 'إجراءات سريعة';

  @override
  String get agentAddPatient => 'إضافة مريض';

  @override
  String get agentRunScreening => 'إجراء فحص أولي';

  @override
  String get agentCasesByMonth => 'الحالات حسب الشهر';

  @override
  String get agentRecentCases => 'أحدث الحالات';

  @override
  String get agentAllCases => 'كل الحالات';

  @override
  String get agentDashboardNoCases => 'لا توجد حالات بعد';

  @override
  String get agentDashboardNoCasesHint => 'أضف مريضًا، وأجرِ فحصًا أوليًا، واطلب عروض أسعار من المستشفيات.';

  @override
  String agentReferralCode(String code) {
    return 'رمز الوكيل الخاص بك $code';
  }

  @override
  String get agentCopyReferralLink => 'نسخ رابط الإحالة';

  @override
  String get agentReferralLinkCopied => 'تم نسخ رابط الإحالة';

  @override
  String get agentPatientsTitle => 'مرضاي';

  @override
  String get agentPatientsSearchHint => 'ابحث عن المرضى';

  @override
  String get agentPatientsEmpty => 'لا يوجد مرضى بعد';

  @override
  String agentPatientsNoMatch(String query) {
    return 'لا يوجد مرضى يطابقون \"$query\"';
  }

  @override
  String get agentPatientsEmptyHint => 'أضف مريضًا لإجراء فحص أولي وطلب عروض أسعار من المستشفيات له.';

  @override
  String agentPatientAgeYears(int age) {
    String _temp0 = intl.Intl.pluralLogic(
      age,
      locale: localeName,
      other: '$age سنة',
      many: '$age سنة',
      few: '$age سنوات',
      two: 'سنتان',
      one: 'سنة واحدة',
      zero: '$age سنة',
    );
    return '$_temp0';
  }

  @override
  String agentPatientCasesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count حالة',
      many: '$count حالة',
      few: '$count حالات',
      two: 'حالتان',
      one: 'حالة واحدة',
      zero: 'لا حالات',
    );
    return '$_temp0';
  }

  @override
  String agentPatientScreeningsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count فحص',
      many: '$count فحصًا',
      few: '$count فحوصات',
      two: 'فحصان',
      one: 'فحص واحد',
      zero: 'لا فحوصات',
    );
    return '$_temp0';
  }

  @override
  String get agentPatientManaged => 'مُدار';

  @override
  String get agentPatientUpdated => 'تم تحديث بيانات المريض';

  @override
  String get agentPatientAdded => 'تمت إضافة المريض';

  @override
  String get agentFormRequired => 'مطلوب';

  @override
  String get agentEditPatient => 'تعديل بيانات المريض';

  @override
  String get agentPatientFirstName => 'الاسم الأول';

  @override
  String get agentPatientLastName => 'اسم العائلة';

  @override
  String get agentPatientNationalityLabel => 'الجنسية (رمز ISO، مثل NG أو AE أو US)';

  @override
  String get agentPatientNationalityInvalid => 'أدخل رمز دولة من حرفين';

  @override
  String get agentPatientEmailOptional => 'البريد الإلكتروني (اختياري)';

  @override
  String get agentPatientEmailHelper => 'سيتلقى المريض دعوة لتفعيل حسابه.';

  @override
  String get agentPatientEmailInvalid => 'بريد إلكتروني غير صالح';

  @override
  String get agentPatientPhoneOptional => 'الهاتف (اختياري)';

  @override
  String get agentPatientDobOptional => 'تاريخ الميلاد (اختياري)';

  @override
  String get agentPatientMedicalHistoryOptional => 'التاريخ الطبي (اختياري)';

  @override
  String get agentPatientTravelMedicalSection => 'تفاصيل السفر والتفاصيل الطبية';

  @override
  String get agentPatientPassportNumber => 'رقم جواز السفر';

  @override
  String get agentPatientPassportKeepHelper => 'اتركه فارغًا للإبقاء على جواز السفر المحفوظ.';

  @override
  String get agentPatientPassportExpiry => 'تاريخ انتهاء جواز السفر';

  @override
  String agentPatientPassportExpires(String date) {
    return 'ينتهي جواز السفر في $date';
  }

  @override
  String get agentPatientBloodGroup => 'فصيلة الدم';

  @override
  String get agentPatientAllergies => 'الحساسية';

  @override
  String get agentSaveChanges => 'حفظ التغييرات';

  @override
  String get agentRequestQuote => 'طلب عرض سعر';

  @override
  String get agentPatientAccountActivated => 'تم تفعيل الحساب';

  @override
  String get agentPatientInvitePending => 'تديره أنت · الدعوة معلّقة';

  @override
  String get agentPatientNationality => 'الجنسية';

  @override
  String get agentPatientDob => 'تاريخ الميلاد';

  @override
  String agentPatientDobWithAge(String date, int age) {
    return '$date (العمر $age)';
  }

  @override
  String get agentPatientGender => 'الجنس';

  @override
  String get agentPatientEmail => 'البريد الإلكتروني';

  @override
  String get agentPatientPhone => 'الهاتف';

  @override
  String get agentPatientPassport => 'جواز السفر';

  @override
  String agentPatientPassportExpShort(String date) {
    return 'ينتهي $date';
  }

  @override
  String get agentPatientMedicalHistory => 'التاريخ الطبي';

  @override
  String get agentScreeningsSection => 'الفحوصات الأولية';

  @override
  String get agentScreeningsEmpty =>
      'لا توجد فحوصات أولية بعد — أجرِ فحصًا للحصول على مستشفيات وأطباء مقترحين بالذكاء الاصطناعي.';

  @override
  String get agentGeneralScreening => 'فحص أولي عام';

  @override
  String get agentCasesTitle => 'الحالات وعروض الأسعار';

  @override
  String get agentCompareQuotes => 'مقارنة عروض الأسعار';

  @override
  String get agentPatientCasesEmpty => 'لا توجد استفسارات للمستشفيات بعد.';

  @override
  String agentDocumentUploaded(String fileName) {
    return 'تم رفع $fileName';
  }

  @override
  String get agentDocumentsSection => 'المستندات';

  @override
  String get agentDocumentUploading => 'جارٍ الرفع…';

  @override
  String get agentDocumentsEmpty =>
      'ارفع التقارير والصور الطبية وجواز السفر لتتمكن المستشفيات من تقديم عروض أسعار دقيقة.';

  @override
  String get agentCasesEmpty => 'لا توجد حالات';

  @override
  String get agentCasesEmptyHint => 'افتح ملف مريض واطلب عرض سعر من مستشفى.';

  @override
  String get agentAcceptQuoteTitle => 'هل تقبل عرض السعر هذا؟';

  @override
  String agentAcceptQuoteMessage(String hospital, String total) {
    return '$hospital · $total. تبقى عروض الأسعار المفتوحة الأخرى متاحة حتى يتم الحجز.';
  }

  @override
  String get agentQuoteAccept => 'قبول';

  @override
  String get agentQuoteAccepted => 'تم قبول عرض السعر';

  @override
  String get agentRejectQuoteTitle => 'رفض عرض السعر';

  @override
  String get agentReasonOptional => 'السبب (اختياري)';

  @override
  String get agentQuoteReject => 'رفض';

  @override
  String get agentQuoteRejected => 'تم رفض عرض السعر';

  @override
  String get agentCancelCaseTitle => 'هل تريد إلغاء هذه الحالة؟';

  @override
  String get agentCancelCaseMessage => 'سيتم إشعار المستشفى.';

  @override
  String get agentCancelCase => 'إلغاء الحالة';

  @override
  String get agentCaseCancelled => 'تم إلغاء الحالة';

  @override
  String get agentCaseFallbackTitle => 'الحالة';

  @override
  String get agentCaseCoordinator => 'المنسق';

  @override
  String get agentCaseOpenedLabel => 'تاريخ الفتح';

  @override
  String get agentCaseNotes => 'ملاحظات';

  @override
  String get agentBookTreatment => 'حجز العلاج';

  @override
  String agentCaseBookingSummary(String date, String balance) {
    return 'الدخول $date · الرصيد المتبقي $balance';
  }

  @override
  String get agentQuotesSection => 'عروض الأسعار';

  @override
  String get agentCompareHospitals => 'مقارنة المستشفيات';

  @override
  String agentQuotesWaiting(String hospital) {
    return 'في انتظار أن يرسل $hospital عرض سعر مفصّلًا.';
  }

  @override
  String agentQuoteDated(String date) {
    return 'عرض سعر · $date';
  }

  @override
  String get agentTimelineSection => 'السجل الزمني';

  @override
  String get agentCompareEmpty => 'لا توجد عروض أسعار للمقارنة بعد';

  @override
  String get agentCompareEmptyHint => 'اطلب عروض أسعار من عدة مستشفيات؛ ستظهر هنا فور رد المستشفيات.';

  @override
  String get agentRequestAQuote => 'طلب عرض سعر';

  @override
  String agentCompareBestPrice(String price, String hospital) {
    return 'أفضل سعر: $price في $hospital.';
  }

  @override
  String agentCompareBestPriceSaves(String price, String hospital, String savings) {
    return 'أفضل سعر: $price في $hospital — توفير $savings مقارنة بأعلى عرض.';
  }

  @override
  String get agentCompareMixedCurrencies => 'عروض الأسعار بعملات مختلفة؛ قارن الإجماليات بحذر.';

  @override
  String get agentCompareRequestAnother => 'طلب عرض من مستشفى آخر';

  @override
  String get agentCompareStay => 'الإقامة';

  @override
  String get agentCompareValidUntil => 'صالح حتى';

  @override
  String agentCompareAcceptTitle(String hospital) {
    return 'هل تقبل عرض $hospital؟';
  }

  @override
  String agentCompareAcceptMessage(String total) {
    return 'الإجمالي $total';
  }

  @override
  String get agentCompareBest => 'الأفضل';

  @override
  String agentCompareStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم',
      many: '$count يومًا',
      few: '$count أيام',
      two: 'يومان',
      one: 'يوم واحد',
      zero: '$count يوم',
    );
    return '$_temp0';
  }

  @override
  String agentQuoteRequestedFrom(String hospital) {
    return 'تم طلب عرض سعر من $hospital';
  }

  @override
  String get agentSearchHospitalsHint => 'ابحث عن المستشفيات';

  @override
  String get agentNoHospitalsFound => 'لم يتم العثور على مستشفيات';

  @override
  String get agentNotesForHospitalOptional => 'ملاحظات للمستشفى (اختياري)';

  @override
  String get agentSelectHospital => 'اختر مستشفى';

  @override
  String agentRequestQuoteFrom(String hospital) {
    return 'طلب عرض سعر من $hospital';
  }

  @override
  String get agentBookingsTitle => 'الحجوزات والمدفوعات';

  @override
  String get agentBookingsEmpty => 'لا توجد حجوزات';

  @override
  String get agentBookingsEmptyHint => 'اقبل عرض سعر من مستشفى، ثم احجز العلاج لمريضك.';

  @override
  String agentBookingAdmissionShort(String date) {
    return 'الدخول $date';
  }

  @override
  String agentBookingDueShort(String amount) {
    return 'مستحق $amount';
  }

  @override
  String get agentBookingPaidInFull => 'مدفوع بالكامل';

  @override
  String get agentTestPaymentCompleted => 'اكتملت الدفعة التجريبية';

  @override
  String agentBankBeneficiary(String name) {
    return 'المستفيد: $name';
  }

  @override
  String agentBankName(String bank) {
    return 'البنك: $bank';
  }

  @override
  String agentBankAccount(String account) {
    return 'رقم الحساب: $account';
  }

  @override
  String agentBankReference(String reference) {
    return 'المرجع: $reference';
  }

  @override
  String agentBankAmount(String amount) {
    return 'المبلغ: $amount';
  }

  @override
  String get agentBankTransferDetailsTitle => 'تفاصيل التحويل البنكي';

  @override
  String get agentCopyAndClose => 'نسخ وإغلاق';

  @override
  String agentCancelBookingTitle(String bookingNumber) {
    return 'هل تريد إلغاء الحجز $bookingNumber؟';
  }

  @override
  String get agentReason => 'السبب';

  @override
  String get agentCancelBooking => 'إلغاء الحجز';

  @override
  String get agentBookingCancelledRefund => 'تم إلغاء الحجز؛ يخضع الاسترداد لسياسة المستشفى';

  @override
  String get agentBookingTreatment => 'العلاج';

  @override
  String get agentBookingAdmission => 'الدخول';

  @override
  String get agentBookingDischarge => 'الخروج';

  @override
  String get agentBookingPaymentPlan => 'خطة الدفع';

  @override
  String agentBookingMonthlyInstallments(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count قسط شهري',
      many: '$count قسطًا شهريًا',
      few: '$count أقساط شهرية',
      two: 'قسطان شهريان',
      one: 'قسط شهري واحد',
      zero: '$count قسط شهري',
    );
    return '$_temp0';
  }

  @override
  String get agentPriceSummary => 'ملخص السعر';

  @override
  String get agentPriceDiscount => 'الخصم';

  @override
  String get agentPriceServiceFee => 'رسوم الخدمة';

  @override
  String get agentPriceTax => 'الضريبة';

  @override
  String get agentPriceDeposit => 'العربون';

  @override
  String get agentPricePaid => 'المدفوع';

  @override
  String get agentPriceRefunded => 'المُسترد';

  @override
  String get agentPriceBalanceDue => 'الرصيد المستحق';

  @override
  String get agentCollectPayment => 'تحصيل الدفعة';

  @override
  String get agentPaymentsSection => 'المدفوعات';

  @override
  String get agentPaymentsEmpty => 'لا توجد مدفوعات بعد.';

  @override
  String get agentOpenCase => 'فتح الحالة';

  @override
  String get agentInstallmentsSection => 'الأقساط';

  @override
  String agentInstallmentDue(String date) {
    return 'مستحق في $date';
  }

  @override
  String get agentInstallmentCollect => 'تحصيل';

  @override
  String get agentCollectPaymentHint => 'يحسب الخادم المبلغ؛ ويمكن للمريض أيضًا الدفع من تطبيقه الخاص.';

  @override
  String get agentCollectBankTransferOption => 'تحويل بنكي (SWIFT / NEFT)';

  @override
  String agentCollectContinueAmount(String amount) {
    return 'متابعة · ~$amount';
  }

  @override
  String get agentAdmissionDate => 'تاريخ الدخول';

  @override
  String get agentChooseDate => 'اختر تاريخًا';

  @override
  String get agentPaymentSection => 'الدفع';

  @override
  String get agentPaymentOptionDeposit => 'عربون';

  @override
  String get agentPaymentOptionFull => 'كامل';

  @override
  String get agentPaymentOptionPlan => 'أقساط';

  @override
  String agentInstallmentMonthsChip(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count شهر',
      many: '$count شهرًا',
      few: '$count أشهر',
      two: 'شهران',
      one: 'شهر واحد',
      zero: '$count شهر',
    );
    return '$_temp0';
  }

  @override
  String get agentInsuranceClaim => 'يرغب المريض في المطالبة بالتأمين';

  @override
  String get agentCreateBooking => 'إنشاء الحجز';

  @override
  String get hpTabDashboard => 'لوحة المعلومات';

  @override
  String get hpTabEnquiries => 'الاستفسارات';

  @override
  String get hpTabPatients => 'المرضى';

  @override
  String get hpTabSettlements => 'التسويات';

  @override
  String get hpTabMore => 'المزيد';

  @override
  String get hpSettlementsTitle => 'التسويات والمدفوعات';

  @override
  String get hpDashboardTitle => 'لوحة معلومات المستشفى';

  @override
  String get hpNoHospitalTitle => 'لا يوجد مستشفى مرتبط';

  @override
  String get hpNoHospitalMessage => 'اطلب من مسؤول المستشفى دعوتك كعضو.';

  @override
  String get hpListingDraft => 'قائمتك مسودة. أكمل الملف الشخصي على بوابة المستشفى على الويب وأرسله للمراجعة.';

  @override
  String get hpListingPendingReview => 'قائمتك قيد المراجعة. سيراها المرضى بعد الموافقة عليها.';

  @override
  String hpListingOtherStatus(String status) {
    return 'حالة قائمتك: $status. تواصل مع دعم Heal India Global.';
  }

  @override
  String get hpKpiOpenEnquiries => 'استفسارات مفتوحة';

  @override
  String get hpKpiQuotesAwaiting => 'عروض أسعار بانتظار المريض';

  @override
  String get hpKpiUpcomingAdmissions => 'حالات دخول قادمة';

  @override
  String get hpKpiInTreatment => 'قيد العلاج';

  @override
  String get hpRevenueThisMonth => 'إيرادات هذا الشهر';

  @override
  String get hpRevenueByMonth => 'الإيرادات حسب الشهر';

  @override
  String get hpBookingsByMonth => 'الحجوزات حسب الشهر';

  @override
  String get hpRecentCases => 'أحدث الحالات';

  @override
  String get hpNoEnquiriesYet => 'لا توجد استفسارات بعد';

  @override
  String get hpEnquiriesFilterNew => 'جديدة';

  @override
  String get hpNoNewEnquiries => 'لا توجد استفسارات جديدة';

  @override
  String get hpNoCases => 'لا توجد حالات';

  @override
  String get hpEnquiriesEmptyMessage => 'يرسل المرضى والوكلاء الاستفسارات من نتائج المطابقة.';

  @override
  String hpDeclineTitle(String caseNumber) {
    return 'رفض $caseNumber؟';
  }

  @override
  String get hpDeclineReasonLabel => 'السبب الذي سيُبلَّغ به المريض';

  @override
  String get hpDeclineButton => 'رفض';

  @override
  String get hpEnquiryDeclined => 'تم رفض الاستفسار';

  @override
  String get hpCaseFallbackTitle => 'الحالة';

  @override
  String get hpPrepareQuote => 'إعداد عرض سعر';

  @override
  String get hpSendRevisedQuote => 'إرسال عرض سعر معدّل';

  @override
  String get hpPatientFallback => 'المريض';

  @override
  String hpYearsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count سنة',
      many: '$count سنة',
      few: '$count سنوات',
      two: 'سنتان',
      one: 'سنة واحدة',
      zero: '$count سنة',
    );
    return '$_temp0';
  }

  @override
  String get hpInfoTreatment => 'العلاج';

  @override
  String get hpInfoDoctor => 'الطبيب';

  @override
  String get hpInfoViaAgent => 'عن طريق وكيل';

  @override
  String get hpInfoCoordinator => 'المنسّق';

  @override
  String get hpInfoReceived => 'تاريخ الاستلام';

  @override
  String hpCaseBookingLine(String bookingNumber, String date) {
    return 'الحجز $bookingNumber · الدخول $date';
  }

  @override
  String get hpPatientNotes => 'ملاحظات المريض';

  @override
  String get hpScreening => 'الفحص الأولي';

  @override
  String get hpInfoSpecialty => 'التخصص';

  @override
  String get hpInfoBodyAreas => 'مناطق الجسم';

  @override
  String get hpInfoPain => 'الألم';

  @override
  String get hpInfoSymptoms => 'الأعراض';

  @override
  String get hpInfoDuration => 'المدة';

  @override
  String get hpInfoUrgency => 'درجة الاستعجال';

  @override
  String get hpMedicalDocuments => 'المستندات الطبية';

  @override
  String get hpQuotesSection => 'عروض الأسعار';

  @override
  String get hpNoQuoteYet => 'لم يُرسَل أي عرض سعر بعد.';

  @override
  String hpQuoteSentOn(String date) {
    return 'أُرسل في $date';
  }

  @override
  String get hpQuoteProblemPlan => 'صِف خطة العلاج';

  @override
  String get hpQuoteProblemNoLines => 'أضف بندًا واحدًا على الأقل';

  @override
  String get hpQuoteProblemIncompleteLine => 'يجب أن يتضمن كل بند وصفًا ومبلغًا';

  @override
  String get hpQuoteProblemTooManyLines => '50 بندًا كحد أقصى';

  @override
  String get hpSendQuoteConfirmTitle => 'إرسال عرض السعر؟';

  @override
  String hpSendQuoteConfirmMessage(String total) {
    return 'الإجمالي $total — سيتم إخطار المريض فورًا.';
  }

  @override
  String get hpQuoteSent => 'تم إرسال عرض السعر';

  @override
  String hpQuoteBuilderTitle(String caseNumber) {
    return 'عرض سعر · $caseNumber';
  }

  @override
  String get hpTreatmentPlanLabel => 'خطة العلاج';

  @override
  String get hpCurrencyLabel => 'العملة';

  @override
  String get hpStayDaysLabel => 'مدة الإقامة (أيام)';

  @override
  String hpValidUntil(String date) {
    return 'صالح حتى $date';
  }

  @override
  String get hpLineItems => 'البنود';

  @override
  String get hpAddLineItem => 'إضافة بند';

  @override
  String get hpTotal => 'الإجمالي';

  @override
  String get hpSendQuote => 'إرسال عرض السعر';

  @override
  String get hpCategoryLabel => 'الفئة';

  @override
  String get hpDescriptionLabel => 'الوصف';

  @override
  String hpAmountLabel(String currency) {
    return 'المبلغ ($currency)';
  }

  @override
  String get hpAdmissionsTitle => 'حالات الدخول';

  @override
  String get hpAdmissionsUpcoming => 'القادمة';

  @override
  String get hpAdmissionsDischarged => 'خرجوا من المستشفى';

  @override
  String get hpAdmissionsAwaitingPayment => 'بانتظار الدفع';

  @override
  String get hpAdmissionsCancelled => 'ملغاة';

  @override
  String get hpAdmissionsEmptyUpcoming => 'لا يوجد مرضى قادمون';

  @override
  String get hpAdmissionsEmptyInTreatment => 'لا يوجد مرضى قيد العلاج';

  @override
  String get hpAdmissionsEmptyDischarged => 'لا يوجد مرضى خرجوا من المستشفى';

  @override
  String get hpAdmissionsEmptyAwaitingPayment => 'لا يوجد مرضى بانتظار الدفع';

  @override
  String get hpAdmissionsEmptyCancelled => 'لا يوجد مرضى ملغاة حجوزاتهم';

  @override
  String hpTileDischarged(String date) {
    return 'خرج في $date';
  }

  @override
  String hpTileAdmitted(String date) {
    return 'دخل في $date';
  }

  @override
  String hpTileAdmission(String date) {
    return 'الدخول $date';
  }

  @override
  String hpTileInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'بعد $count يوم',
      many: 'بعد $count يومًا',
      few: 'بعد $count أيام',
      two: 'بعد يومين',
      one: 'بعد يوم واحد',
      zero: 'بعد $count يوم',
    );
    return '$_temp0';
  }

  @override
  String get hpAdmitPatientTitle => 'إدخال المريض؟';

  @override
  String hpAdmitNamedTitle(String name) {
    return 'إدخال $name؟';
  }

  @override
  String get hpNoteOptional => 'ملاحظة (اختياري)';

  @override
  String get hpAdmitButton => 'إدخال';

  @override
  String get hpPatientAdmitted => 'تم إدخال المريض';

  @override
  String get hpDischargeDate => 'تاريخ الخروج';

  @override
  String get hpDischargeNoteTitle => 'ملاحظة ملخص الخروج';

  @override
  String get hpDischargeButton => 'إخراج';

  @override
  String get hpPatientDischarged => 'تم إخراج المريض';

  @override
  String get hpAddedToItinerary => 'تمت الإضافة إلى خط السير';

  @override
  String get hpBookingFallbackTitle => 'الحجز';

  @override
  String get hpItinerary => 'خط السير';

  @override
  String get hpInfoAdmission => 'الدخول';

  @override
  String get hpInfoAdmitted => 'تم الدخول';

  @override
  String get hpInfoDischarge => 'الخروج';

  @override
  String get hpInfoLengthOfStay => 'مدة الإقامة';

  @override
  String hpDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count يوم',
      many: '$count يومًا',
      few: '$count أيام',
      two: 'يومان',
      one: 'يوم واحد',
      zero: '$count يوم',
    );
    return '$_temp0';
  }

  @override
  String get hpInfoPaid => 'المدفوع';

  @override
  String get hpAdmitPatientButton => 'إدخال المريض';

  @override
  String get hpDischargePatientButton => 'إخراج المريض';

  @override
  String get hpAwaitingDeposit => 'بانتظار دفعة المريض المقدّمة. يُتاح الدخول بعد تأكيد الحجز.';

  @override
  String get hpOpenCase => 'فتح الحالة';

  @override
  String get hpNoItineraryYet => 'لا يوجد خط سير بعد — أضف المواعيد وموعد الجراحة والاستقبال والمتابعات.';

  @override
  String get hpItineraryMarkedDone => 'تم وضع علامة منجز';

  @override
  String get hpItineraryCancelled => 'تم الإلغاء';

  @override
  String get hpItineraryRemoved => 'تمت الإزالة';

  @override
  String get hpItineraryMarkDone => 'وضع علامة منجز';

  @override
  String get hpAddToItinerary => 'إضافة إلى خط السير';

  @override
  String get hpItineraryTypeLabel => 'النوع';

  @override
  String get hpItineraryTitleLabel => 'العنوان (مثل: استشارة ما قبل الجراحة)';

  @override
  String get hpItineraryDateTime => 'التاريخ والوقت';

  @override
  String get hpItineraryLocationLabel => 'المكان';

  @override
  String get hpItineraryInstructionsLabel => 'تعليمات للمريض (اختياري)';

  @override
  String get hpItineraries => 'خطوط السير';

  @override
  String get hpNobodyAdmitted => 'لا يوجد أحد في المستشفى حاليًا.';

  @override
  String get hpUpcomingArrivals => 'الوصول القادم';

  @override
  String get hpNoConfirmedBookings => 'لا توجد حجوزات مؤكدة.';

  @override
  String get hpMoreItinerariesSubtitle => 'المواعيد، مواعيد الجراحة، الاستقبال';

  @override
  String get hpVisaLettersTitle => 'خطابات الدعوة للتأشيرة';

  @override
  String get hpMoreVisasSubtitle => 'طلبات التأشيرة الطبية من المرضى';

  @override
  String get hpDoctorsTitle => 'الأطباء';

  @override
  String get hpMoreDoctorsSubtitle => 'أخصائيوك وملفاتهم الشخصية';

  @override
  String get hpMorePriceListSubtitle => 'الإجراءات ونطاقات الأسعار والباقات';

  @override
  String get hpActingFor => 'العمل لصالح';

  @override
  String get hpWebPortalNote => 'تعديل الملف الشخصي والأعضاء والتوفر والأسعار متاح على بوابة المستشفى على الويب.';

  @override
  String get hpNoVisaRequests => 'لا توجد طلبات تأشيرة';

  @override
  String get hpInvitationLetterNeeded => 'مطلوب خطاب دعوة';

  @override
  String get hpVisaRequestFallback => 'طلب تأشيرة';

  @override
  String get hpNoInvitationLetterYet => 'لا يوجد خطاب دعوة بعد';

  @override
  String get hpInvitationLetterUploaded => 'خطاب الدعوة: تم الرفع';

  @override
  String hpInvitationLetterNamed(String fileName) {
    return 'خطاب الدعوة: $fileName';
  }

  @override
  String get hpReplace => 'استبدال';

  @override
  String get hpStatusLabel => 'الحالة';

  @override
  String get hpEvisaReferenceLabel => 'رقم مرجع طلب التأشيرة الإلكترونية';

  @override
  String get hpNotesLabel => 'ملاحظات';

  @override
  String get hpNoDoctorsListed => 'لا يوجد أطباء مدرجون';

  @override
  String get hpTeleconsultBadge => 'استشارة عن بُعد';

  @override
  String hpConsultationFee(String fee) {
    return 'الرسوم $fee';
  }

  @override
  String get priceListTitle => 'قائمة الأسعار';

  @override
  String get priceListEmpty => 'لم يتم تسعير أي إجراء بعد';

  @override
  String priceListStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'إقامة $count يوم',
      many: 'إقامة $count يومًا',
      few: 'إقامة $count أيام',
      two: 'إقامة يومين',
      one: 'إقامة يوم واحد',
      zero: 'إقامة $count يوم',
    );
    return '$_temp0';
  }

  @override
  String priceListSuccessRate(String rate) {
    return 'نسبة النجاح $rate%';
  }

  @override
  String get reportAnalysisTitle => 'تقريرك';

  @override
  String get reportConfirmedSnack => 'تم تأكيد التقرير.';

  @override
  String reportMaxPages(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'يمكن أن يحتوي التقرير على $max صفحة كحد أقصى.',
      many: 'يمكن أن يحتوي التقرير على $max صفحة كحد أقصى.',
      few: 'يمكن أن يحتوي التقرير على $max صفحات كحد أقصى.',
      two: 'يمكن أن يحتوي التقرير على صفحتين كحد أقصى.',
      one: 'يمكن أن يحتوي التقرير على صفحة واحدة كحد أقصى.',
      zero: 'يمكن أن يحتوي التقرير على $max صفحة كحد أقصى.',
    );
    return '$_temp0';
  }

  @override
  String reportFileTooLarge(String fileName) {
    return '$fileName كبير جدًا (الحد الأقصى 20 ميغابايت).';
  }

  @override
  String get reportPermissionNeeded => 'يُرجى السماح بالوصول إلى الكاميرا / الصور من إعدادات هاتفك لإضافة الصفحات.';

  @override
  String reportUploadingPage(int current, int total) {
    return 'جارٍ رفع الصفحة $current من $total…';
  }

  @override
  String get reportSendingToAi => 'جارٍ الإرسال إلى الذكاء الاصطناعي…';

  @override
  String get reportReviewTitle => 'راجِع تقريرك';

  @override
  String get reportCaptureTitle => 'إضافة تقرير طبي';

  @override
  String get reportCaptureIntro => 'التقط صورة لكل صفحة من التقرير الورقي، أو اختر صورًا، أو ارفع ملف PDF.';

  @override
  String get reportTakePhoto => 'التقاط صورة';

  @override
  String get reportChooseFromGallery => 'اختيار من المعرض';

  @override
  String get reportUploadPdf => 'رفع PDF';

  @override
  String reportPagesCount(int count, int max) {
    return 'الصفحات ($count/$max)';
  }

  @override
  String get reportNoPagesTip => 'لا توجد صفحات بعد. نصيحة: ضع الصفحة بشكل مستوٍ في إضاءة جيدة واجعلها تملأ الإطار.';

  @override
  String get reportKindQuestion => 'ما نوع هذا المستند؟';

  @override
  String get reportReadWithAi => 'اقرأ تقريري بالذكاء الاصطناعي';

  @override
  String get reportAiConsentText =>
      'يقرأ مساعدنا الذكي الصفحات ويعرض نتائج فحوصاتك وتشخيصاتك وأدويتك. تراجع كل شيء وتصحّحه قبل استخدامه، ولا تتم مشاركته إلا مع المستشفيات التي تختارها. يمكنك إيقاف هذا الخيار ورفع التقرير فقط.';

  @override
  String get reportUploadButton => 'رفع التقرير';

  @override
  String reportPageNumber(int number) {
    return 'الصفحة $number';
  }

  @override
  String reportRemovePage(int number) {
    return 'إزالة الصفحة $number';
  }

  @override
  String get reportDragToReorder => 'اسحب لإعادة الترتيب';

  @override
  String get reportAiEntryTooltip => 'قراءة التقارير بالذكاء الاصطناعي';

  @override
  String get reportSheetTitle => 'تقاريرك كما قرأها الذكاء الاصطناعي';

  @override
  String get reportSheetIntro => 'صوّر تقريرًا ورقيًا أو اختر ملف PDF. تراجع كل شيء وتؤكّده قبل استخدامه.';

  @override
  String get reportScanButton => 'مسح تقرير';

  @override
  String get reportNoReadings => 'لا توجد قراءات بالذكاء الاصطناعي بعد.';

  @override
  String get reportMedicalReportFallback => 'تقرير طبي';

  @override
  String get reportImportant => 'مهم';

  @override
  String get reportCriticalValues => 'قيم حرجة';

  @override
  String get reportSummary => 'الملخص';

  @override
  String get reportKeyFindings => 'النتائج الرئيسية';

  @override
  String get reportLabValues => 'قيم التحاليل';

  @override
  String get reportMedications => 'الأدوية';

  @override
  String get reportDiagnosesMentioned => 'التشخيصات المذكورة';

  @override
  String get reportProceduresMentioned => 'الإجراءات المذكورة';

  @override
  String get reportRecommendations => 'التوصيات';

  @override
  String get reportAiDisclaimer => 'تم إنشاؤه بالذكاء الاصطناعي — تأكّد دائمًا مع طبيبك.';

  @override
  String get reportStatusConfirmed => 'مؤكَّد';

  @override
  String get reportStatusDiscarded => 'مُهمَل';

  @override
  String get reportStatusReading => 'جارٍ القراءة…';

  @override
  String get reportStatusNotRead => 'لم تتم القراءة';

  @override
  String get reportStatusNeedsReview => 'بحاجة إلى مراجعة';

  @override
  String get reportLabTest => 'الفحص';

  @override
  String get reportLabResult => 'النتيجة';

  @override
  String get reportLabRange => 'المعدل';

  @override
  String get reportEdited => 'معدَّل';

  @override
  String get reportDateLabel => 'تاريخ التقرير';

  @override
  String get reportCriticalValuesInReport => 'قيم حرجة في هذا التقرير';

  @override
  String get reportAboutSection => 'حول هذا التقرير';

  @override
  String get reportDocTypeLabel => 'نوع المستند';

  @override
  String get reportClearDate => 'مسح التاريخ';

  @override
  String get reportDateNotStated => 'غير مذكور';

  @override
  String get reportFacilityLabel => 'المستشفى / المختبر';

  @override
  String get reportSummaryHint => 'ما يقوله التقرير بكلمات بسيطة';

  @override
  String get findingAdd => 'إضافة نتيجة';

  @override
  String findingRemove(int number) {
    return 'إزالة النتيجة $number';
  }

  @override
  String get findingLabel => 'النتيجة';

  @override
  String get labAddValue => 'إضافة قيمة';

  @override
  String labRemoveValue(int number) {
    return 'إزالة قيمة التحليل $number';
  }

  @override
  String get labValueLabel => 'القيمة';

  @override
  String get labUnitLabel => 'الوحدة';

  @override
  String get labReferenceRangeLabel => 'المعدل المرجعي';

  @override
  String get reportAddMedication => 'إضافة دواء';

  @override
  String reportRemoveMedication(int number) {
    return 'إزالة الدواء $number';
  }

  @override
  String get reportMedicineLabel => 'الدواء';

  @override
  String get reportDoseLabel => 'الجرعة';

  @override
  String get reportFrequencyLabel => 'عدد المرات';

  @override
  String get reportAddDiagnosis => 'إضافة تشخيص';

  @override
  String get reportAddProcedure => 'إضافة إجراء';

  @override
  String get reportAddRecommendation => 'إضافة توصية';

  @override
  String get reportNone => 'لا يوجد';
}
