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

  @override
  String get enumUserRolePatient => 'রোগী';

  @override
  String get enumUserRoleAgent => 'এজেন্ট';

  @override
  String get enumUserRoleHospital => 'হাসপাতাল';

  @override
  String get enumUserRoleAdmin => 'অ্যাডমিন';

  @override
  String get enumUserRoleFinance => 'অর্থ বিভাগ';

  @override
  String get enumUserRoleSupport => 'সহায়তা';

  @override
  String get enumUserRoleSuperAdmin => 'সুপার অ্যাডমিন';

  @override
  String get enumUserStatusActive => 'সক্রিয়';

  @override
  String get enumUserStatusPendingVerification => 'যাচাইয়ের অপেক্ষায়';

  @override
  String get enumUserStatusSuspended => 'স্থগিত';

  @override
  String get enumUserStatusDeleted => 'মুছে ফেলা হয়েছে';

  @override
  String get enumGenderMale => 'পুরুষ';

  @override
  String get enumGenderFemale => 'মহিলা';

  @override
  String get enumGenderOther => 'অন্যান্য';

  @override
  String get enumGenderUndisclosed => 'উল্লেখ করা হয়নি';

  @override
  String get enumDoctorGenderPrefMale => 'পুরুষ';

  @override
  String get enumDoctorGenderPrefFemale => 'মহিলা';

  @override
  String get enumDoctorGenderPrefNoPreference => 'কোনো পছন্দ নেই';

  @override
  String get enumKycStatusNotSubmitted => 'জমা দেওয়া হয়নি';

  @override
  String get enumKycStatusPending => 'অপেক্ষমাণ';

  @override
  String get enumKycStatusApproved => 'অনুমোদিত';

  @override
  String get enumKycStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumHospitalStatusDraft => 'খসড়া';

  @override
  String get enumHospitalStatusPendingReview => 'পর্যালোচনার অপেক্ষায়';

  @override
  String get enumHospitalStatusActive => 'সক্রিয়';

  @override
  String get enumHospitalStatusSuspended => 'স্থগিত';

  @override
  String get enumHospitalStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumAgentStatusPending => 'অপেক্ষমাণ';

  @override
  String get enumAgentStatusActive => 'সক্রিয়';

  @override
  String get enumAgentStatusSuspended => 'স্থগিত';

  @override
  String get enumAgentStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumHospitalMemberRoleOwner => 'মালিক';

  @override
  String get enumHospitalMemberRoleAdmin => 'অ্যাডমিন';

  @override
  String get enumHospitalMemberRoleCoordinator => 'সমন্বয়কারী';

  @override
  String get enumHospitalMemberRoleFinance => 'অর্থ বিভাগ';

  @override
  String get enumHospitalMemberRoleDoctor => 'ডাক্তার';

  @override
  String get enumPackageTierMedicalOnly => 'শুধু চিকিৎসা';

  @override
  String get enumPackageTierMedicalStay => 'চিকিৎসা + থাকা';

  @override
  String get enumPackageTierAllInclusive => 'সব কিছু সহ';

  @override
  String get enumScreeningStatusDraft => 'খসড়া';

  @override
  String get enumScreeningStatusProcessing => 'প্রক্রিয়াধীন';

  @override
  String get enumScreeningStatusCompleted => 'সম্পন্ন';

  @override
  String get enumScreeningStatusFailed => 'ব্যর্থ';

  @override
  String get enumUrgencyRoutine => 'সাধারণ';

  @override
  String get enumUrgencySoon => 'শিগগির';

  @override
  String get enumUrgencyUrgent => 'জরুরি';

  @override
  String get enumUrgencyEmergency => 'জরুরি অবস্থা';

  @override
  String get enumDurationUnitDays => 'দিন';

  @override
  String get enumDurationUnitWeeks => 'সপ্তাহ';

  @override
  String get enumDurationUnitMonths => 'মাস';

  @override
  String get enumDurationUnitYears => 'বছর';

  @override
  String get enumSeverityLevelNone => 'নেই';

  @override
  String get enumSeverityLevelMild => 'হালকা';

  @override
  String get enumSeverityLevelModerate => 'মাঝারি';

  @override
  String get enumSeverityLevelSevere => 'তীব্র';

  @override
  String get enumSymptomAnswerYes => 'হ্যাঁ';

  @override
  String get enumSymptomAnswerMaybe => 'হয়তো';

  @override
  String get enumSymptomAnswerNo => 'না';

  @override
  String get enumCaseStatusEnquiry => 'অনুসন্ধান';

  @override
  String get enumCaseStatusQuoted => 'মূল্য প্রস্তাব দেওয়া হয়েছে';

  @override
  String get enumCaseStatusAccepted => 'গৃহীত';

  @override
  String get enumCaseStatusBooked => 'বুক করা হয়েছে';

  @override
  String get enumCaseStatusInTreatment => 'চিকিৎসাধীন';

  @override
  String get enumCaseStatusCompleted => 'সম্পন্ন';

  @override
  String get enumCaseStatusCancelled => 'বাতিল';

  @override
  String get enumCaseStatusDeclined => 'প্রত্যাখ্যাত';

  @override
  String get enumQuoteStatusDraft => 'খসড়া';

  @override
  String get enumQuoteStatusSent => 'পাঠানো হয়েছে';

  @override
  String get enumQuoteStatusAccepted => 'গৃহীত';

  @override
  String get enumQuoteStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumQuoteStatusExpired => 'মেয়াদোত্তীর্ণ';

  @override
  String get enumQuoteStatusWithdrawn => 'প্রত্যাহার করা হয়েছে';

  @override
  String get enumQuoteLineCategorySurgery => 'অস্ত্রোপচার';

  @override
  String get enumQuoteLineCategoryHospitalStay => 'হাসপাতালে থাকা';

  @override
  String get enumQuoteLineCategoryMedications => 'ওষুধ';

  @override
  String get enumQuoteLineCategoryTestsScans => 'পরীক্ষা ও স্ক্যান';

  @override
  String get enumQuoteLineCategoryDoctorFees => 'ডাক্তারের ফি';

  @override
  String get enumQuoteLineCategoryImplants => 'ইমপ্লান্ট';

  @override
  String get enumQuoteLineCategoryOther => 'অন্যান্য';

  @override
  String get enumBookingStatusPendingPayment => 'পেমেন্টের অপেক্ষায়';

  @override
  String get enumBookingStatusConfirmed => 'নিশ্চিত';

  @override
  String get enumBookingStatusAdmitted => 'ভর্তি হয়েছেন';

  @override
  String get enumBookingStatusCompleted => 'সম্পন্ন';

  @override
  String get enumBookingStatusCancelled => 'বাতিল';

  @override
  String get enumPaymentOptionFull => 'সম্পূর্ণ পরিশোধ';

  @override
  String get enumPaymentOptionDeposit => 'জমা (অগ্রিম)';

  @override
  String get enumPaymentOptionInstallments => 'কিস্তিতে পরিশোধ';

  @override
  String get enumConsultationStatusRequested => 'অনুরোধ করা হয়েছে';

  @override
  String get enumConsultationStatusScheduled => 'নির্ধারিত';

  @override
  String get enumConsultationStatusCompleted => 'সম্পন্ন';

  @override
  String get enumConsultationStatusCancelled => 'বাতিল';

  @override
  String get enumChecklistStatusPending => 'অপেক্ষমাণ';

  @override
  String get enumChecklistStatusInProgress => 'চলছে';

  @override
  String get enumChecklistStatusDone => 'সম্পন্ন';

  @override
  String get enumItineraryKindAppointment => 'অ্যাপয়েন্টমেন্ট';

  @override
  String get enumItineraryKindAdmission => 'ভর্তি';

  @override
  String get enumItineraryKindSurgery => 'অস্ত্রোপচার';

  @override
  String get enumItineraryKindPickup => 'পিকআপ';

  @override
  String get enumItineraryKindCheckin => 'চেক-ইন';

  @override
  String get enumItineraryKindCheckout => 'চেক-আউট';

  @override
  String get enumItineraryKindFollowup => 'ফলো-আপ';

  @override
  String get enumItineraryKindSightseeing => 'ভ্রমণ';

  @override
  String get enumItineraryKindOther => 'অন্যান্য';

  @override
  String get enumVisaStatusNotStarted => 'শুরু হয়নি';

  @override
  String get enumVisaStatusDocumentsPending => 'নথি বাকি';

  @override
  String get enumVisaStatusInvitationIssued => 'আমন্ত্রণপত্র দেওয়া হয়েছে';

  @override
  String get enumVisaStatusApplied => 'আবেদন করা হয়েছে';

  @override
  String get enumVisaStatusApproved => 'অনুমোদিত';

  @override
  String get enumVisaStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumTravelKindFlight => 'ফ্লাইট';

  @override
  String get enumTravelKindAirportPickup => 'বিমানবন্দর থেকে পিকআপ';

  @override
  String get enumTravelKindAirportDrop => 'বিমানবন্দরে পৌঁছে দেওয়া';

  @override
  String get enumTravelKindLocalTransport => 'স্থানীয় যাতায়াত';

  @override
  String get enumServiceBookingStatusRequested => 'অনুরোধ করা হয়েছে';

  @override
  String get enumServiceBookingStatusQuoted => 'মূল্য প্রস্তাব দেওয়া হয়েছে';

  @override
  String get enumServiceBookingStatusConfirmed => 'নিশ্চিত';

  @override
  String get enumServiceBookingStatusCompleted => 'সম্পন্ন';

  @override
  String get enumServiceBookingStatusCancelled => 'বাতিল';

  @override
  String get enumAccommodationTypeHotel => 'হোটেল';

  @override
  String get enumAccommodationTypeGuestHouse => 'গেস্ট হাউস';

  @override
  String get enumAccommodationTypeServiceApartment => 'সার্ভিস অ্যাপার্টমেন্ট';

  @override
  String get enumAccommodationTypeHospitalGuestRoom => 'হাসপাতালের অতিথি কক্ষ';

  @override
  String get enumServiceKindTranslator => 'অনুবাদক';

  @override
  String get enumServiceKindLocalGuide => 'স্থানীয় গাইড';

  @override
  String get enumServiceKindTransport => 'যাতায়াত';

  @override
  String get enumServiceKindTravelAgent => 'ট্রাভেল এজেন্ট';

  @override
  String get enumServiceKindInsurance => 'বিমা';

  @override
  String get enumDocumentKindPassport => 'পাসপোর্ট';

  @override
  String get enumDocumentKindVisa => 'ভিসা';

  @override
  String get enumDocumentKindMedicalReport => 'মেডিকেল রিপোর্ট';

  @override
  String get enumDocumentKindPrescription => 'প্রেসক্রিপশন';

  @override
  String get enumDocumentKindLabResult => 'ল্যাব রিপোর্ট';

  @override
  String get enumDocumentKindImaging => 'ইমেজিং';

  @override
  String get enumDocumentKindInvitationLetter => 'আমন্ত্রণপত্র';

  @override
  String get enumDocumentKindInvoice => 'চালান';

  @override
  String get enumDocumentKindReceipt => 'রসিদ';

  @override
  String get enumDocumentKindKycRegistration => 'নিবন্ধন (KYC)';

  @override
  String get enumDocumentKindKycAccreditation => 'স্বীকৃতি (KYC)';

  @override
  String get enumDocumentKindKycPan => 'প্যান কার্ড';

  @override
  String get enumDocumentKindKycGst => 'জিএসটি সার্টিফিকেট';

  @override
  String get enumDocumentKindKycIdProof => 'পরিচয়পত্র';

  @override
  String get enumDocumentKindBankProof => 'ব্যাংক প্রমাণপত্র';

  @override
  String get enumDocumentKindPaymentProof => 'পেমেন্টের প্রমাণ';

  @override
  String get enumDocumentKindOther => 'অন্যান্য';

  @override
  String get enumDocumentStatusUploaded => 'আপলোড হয়েছে';

  @override
  String get enumDocumentStatusVerified => 'যাচাই করা হয়েছে';

  @override
  String get enumDocumentStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumConsentKindTerms => 'শর্তাবলি';

  @override
  String get enumConsentKindPrivacy => 'গোপনীয়তা';

  @override
  String get enumConsentKindAiProcessing => 'এআই দিয়ে প্রক্রিয়াকরণ';

  @override
  String get enumConsentKindShareWithHospitals => 'হাসপাতালের সঙ্গে শেয়ার';

  @override
  String get enumConsentKindMarketing => 'বিপণন';

  @override
  String get enumPaymentGatewayRazorpay => 'ক্রেডিট/ডেবিট কার্ড';

  @override
  String get enumPaymentGatewayStripe => 'কার্ড (Stripe)';

  @override
  String get enumPaymentGatewayBankTransfer => 'ব্যাংক ট্রান্সফার';

  @override
  String get enumPaymentGatewayMock => 'পরীক্ষামূলক পেমেন্ট';

  @override
  String get enumPaymentPurposeConsultationFee => 'পরামর্শ ফি';

  @override
  String get enumPaymentPurposeBookingDeposit => 'বুকিংয়ের অগ্রিম';

  @override
  String get enumPaymentPurposeBookingBalance => 'বুকিংয়ের বাকি অর্থ';

  @override
  String get enumPaymentPurposeBookingFull => 'বুকিংয়ের পূর্ণ অর্থ';

  @override
  String get enumPaymentPurposeInstallment => 'কিস্তি';

  @override
  String get enumPaymentPurposeService => 'পরিষেবা';

  @override
  String get enumOrderStatusCreated => 'তৈরি হয়েছে';

  @override
  String get enumOrderStatusPending => 'অপেক্ষমাণ';

  @override
  String get enumOrderStatusPaid => 'পরিশোধিত';

  @override
  String get enumOrderStatusPartiallyRefunded => 'আংশিক ফেরত';

  @override
  String get enumOrderStatusRefunded => 'ফেরত দেওয়া হয়েছে';

  @override
  String get enumOrderStatusFailed => 'ব্যর্থ';

  @override
  String get enumOrderStatusExpired => 'মেয়াদোত্তীর্ণ';

  @override
  String get enumOrderStatusCancelled => 'বাতিল';

  @override
  String get enumPaymentStatusCreated => 'তৈরি হয়েছে';

  @override
  String get enumPaymentStatusAuthorized => 'অনুমোদিত';

  @override
  String get enumPaymentStatusCaptured => 'সংগৃহীত';

  @override
  String get enumPaymentStatusFailed => 'ব্যর্থ';

  @override
  String get enumPaymentStatusRefunded => 'ফেরত দেওয়া হয়েছে';

  @override
  String get enumPaymentStatusPartiallyRefunded => 'আংশিক ফেরত';

  @override
  String get enumRefundStatusRequested => 'অনুরোধ করা হয়েছে';

  @override
  String get enumRefundStatusApproved => 'অনুমোদিত';

  @override
  String get enumRefundStatusProcessing => 'প্রক্রিয়াধীন';

  @override
  String get enumRefundStatusProcessed => 'প্রক্রিয়া সম্পন্ন';

  @override
  String get enumRefundStatusFailed => 'ব্যর্থ';

  @override
  String get enumRefundStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumInstallmentStatusDue => 'বকেয়া';

  @override
  String get enumInstallmentStatusPaid => 'পরিশোধিত';

  @override
  String get enumInstallmentStatusOverdue => 'মেয়াদ পেরিয়েছে';

  @override
  String get enumInstallmentStatusCancelled => 'বাতিল';

  @override
  String get enumInvoiceKindPatientReceipt => 'রোগীর রসিদ';

  @override
  String get enumInvoiceKindCommissionInvoice => 'কমিশনের চালান';

  @override
  String get enumInvoiceKindAgentStatement => 'এজেন্টের বিবরণী';

  @override
  String get enumPayeeTypeHospital => 'হাসপাতাল';

  @override
  String get enumPayeeTypeAgent => 'এজেন্ট';

  @override
  String get enumPayeeTypeVendor => 'বিক্রেতা';

  @override
  String get enumItineraryItemStatusScheduled => 'নির্ধারিত';

  @override
  String get enumItineraryItemStatusDone => 'সম্পন্ন';

  @override
  String get enumItineraryItemStatusCancelled => 'বাতিল';

  @override
  String get enumVisaTypeEMedical => 'ই-মেডিকেল ভিসা';

  @override
  String get enumVisaTypeEMedicalAttendant => 'ই-মেডিকেল অ্যাটেনডেন্ট ভিসা';

  @override
  String get enumSosStatusOpen => 'খোলা';

  @override
  String get enumSosStatusAcknowledged => 'গৃহীত';

  @override
  String get enumSosStatusResolved => 'সমাধান হয়েছে';

  @override
  String get enumConversationKindCaseThread => 'কেস';

  @override
  String get enumConversationKindSupport => 'সহায়তা';

  @override
  String get enumConversationKindDirect => 'সরাসরি';

  @override
  String get enumSavedEntityTypeHospital => 'হাসপাতাল';

  @override
  String get enumSavedEntityTypeDoctor => 'ডাক্তার';

  @override
  String get enumSavedEntityTypeProcedure => 'চিকিৎসা পদ্ধতি';

  @override
  String get enumConsultationModeVideo => 'ভিডিও';

  @override
  String get enumConsultationModePhone => 'ফোন';

  @override
  String get enumSlotKindConsultation => 'পরামর্শ';

  @override
  String get enumSlotKindAdmission => 'ভর্তি';

  @override
  String get enumTriageEngineClaude => 'এআই (Claude)';

  @override
  String get enumTriageEngineRules => 'নিয়মভিত্তিক ইঞ্জিন';

  @override
  String get enumLikelihoodLow => 'কম';

  @override
  String get enumLikelihoodMedium => 'মাঝারি';

  @override
  String get enumLikelihoodHigh => 'বেশি';

  @override
  String get enumDevicePlatformAndroid => 'Android';

  @override
  String get enumDevicePlatformIos => 'iOS';

  @override
  String get enumDevicePlatformWeb => 'ওয়েব';

  @override
  String get enumPreviousTreatmentMedication => 'ওষুধ';

  @override
  String get enumPreviousTreatmentPhysicalTherapy => 'ফিজিওথেরাপি';

  @override
  String get enumPreviousTreatmentSurgery => 'অস্ত্রোপচার';

  @override
  String get enumPreviousTreatmentOther => 'অন্যান্য';

  @override
  String get enumChecklistKeyTreatmentBooked => 'চিকিৎসা বুক হয়েছে';

  @override
  String get enumChecklistKeyVisaApproved => 'ভিসা অনুমোদিত';

  @override
  String get enumChecklistKeyFlightBooked => 'ফ্লাইট বুকিং';

  @override
  String get enumChecklistKeyTravelInsurance => 'ভ্রমণ বিমা';

  @override
  String get enumChecklistKeyAirportPickup => 'বিমানবন্দর থেকে পিকআপ';

  @override
  String get enumChecklistKeyDocumentsUploaded => 'নথি আপলোড হয়েছে';

  @override
  String get enumChecklistKeyAccommodationBooked => 'থাকার ব্যবস্থা বুক হয়েছে';

  @override
  String get enumAnalysisStatusQueued => 'সারিতে আছে';

  @override
  String get enumAnalysisStatusProcessing => 'প্রক্রিয়াধীন';

  @override
  String get enumAnalysisStatusCompleted => 'সম্পন্ন';

  @override
  String get enumAnalysisStatusFailed => 'ব্যর্থ';

  @override
  String get enumAnalysisStatusUnsupported => 'সমর্থিত নয়';

  @override
  String get enumAnalysisReviewStatusPendingReview => 'পর্যালোচনার অপেক্ষায়';

  @override
  String get enumAnalysisReviewStatusConfirmed => 'নিশ্চিত';

  @override
  String get enumAnalysisReviewStatusRejected => 'প্রত্যাখ্যাত';

  @override
  String get enumReportDocTypeLabReport => 'ল্যাব রিপোর্ট';

  @override
  String get enumReportDocTypeImagingReport => 'ইমেজিং রিপোর্ট';

  @override
  String get enumReportDocTypeDischargeSummary => 'ডিসচার্জ সারাংশ';

  @override
  String get enumReportDocTypePrescription => 'প্রেসক্রিপশন';

  @override
  String get enumReportDocTypeConsultationNote => 'পরামর্শের নোট';

  @override
  String get enumReportDocTypePathologyReport => 'প্যাথলজি রিপোর্ট';

  @override
  String get enumReportDocTypeInsuranceDocument => 'বিমার নথি';

  @override
  String get enumReportDocTypeOther => 'অন্যান্য';

  @override
  String get enumFindingSignificanceNormal => 'স্বাভাবিক';

  @override
  String get enumFindingSignificanceAttention => 'মনোযোগ প্রয়োজন';

  @override
  String get enumFindingSignificanceUrgent => 'জরুরি';

  @override
  String get enumLabFlagLow => 'কম';

  @override
  String get enumLabFlagHigh => 'বেশি';

  @override
  String get enumLabFlagNormal => 'স্বাভাবিক';

  @override
  String get enumLabFlagCritical => 'সংকটজনক';

  @override
  String get enumLabFlagUnknown => 'অজানা';

  @override
  String get enumVoiceStatusQueued => 'সারিতে আছে';

  @override
  String get enumVoiceStatusProcessing => 'প্রক্রিয়াধীন';

  @override
  String get enumVoiceStatusCompleted => 'সম্পন্ন';

  @override
  String get enumVoiceStatusFailed => 'ব্যর্থ';

  @override
  String get enumVoiceReviewStatusPendingReview => 'পর্যালোচনার অপেক্ষায়';

  @override
  String get enumVoiceReviewStatusConfirmed => 'নিশ্চিত';

  @override
  String get enumVoiceReviewStatusDiscarded => 'বাতিল করা হয়েছে';

  @override
  String get coreInvalidCredentials => 'ইমেল বা পাসওয়ার্ড সঠিক নয়।';

  @override
  String get coreGoogleSignInUnavailable => 'এই সংস্করণে Google দিয়ে সাইন-ইন উপলব্ধ নয়।';

  @override
  String get coreGoogleNoToken => 'Google কোনো টোকেন ফেরত দেয়নি।';

  @override
  String get coreGoogleSignInFailed => 'Google দিয়ে সাইন-ইন ব্যর্থ হয়েছে।';

  @override
  String get coreAppleNoToken => 'Apple কোনো টোকেন ফেরত দেয়নি।';

  @override
  String coreAppleSignInFailed(String error) {
    return 'Apple দিয়ে সাইন-ইন ব্যর্থ হয়েছে ($error)।';
  }

  @override
  String get coreNoFileSelected => 'কোনো ফাইল নির্বাচন করা হয়নি।';

  @override
  String get coreUploadUnsupportedType => 'এই ধরনের ফাইল সমর্থিত নয়। PDF, JPG, PNG, WEBP, HEIC বা DICOM ব্যবহার করুন।';

  @override
  String get coreUploadTooLarge => 'ফাইলটি অনেক বড় (সর্বোচ্চ 20 MB)।';

  @override
  String get coreScreeningAnalysisSlow => 'বিশ্লেষণে প্রত্যাশার চেয়ে বেশি সময় লাগছে। প্রস্তুত হলে আমরা আপনাকে জানাব।';

  @override
  String get coreBiometricPay => 'পেমেন্ট করুন';

  @override
  String get coreBiometricPayFaceId => 'Face ID দিয়ে পেমেন্ট করুন';

  @override
  String get coreBiometricPayFingerprint => 'আঙুলের ছাপ দিয়ে পেমেন্ট করুন';

  @override
  String get coreBiometricConfirmReason => 'আপনার পেমেন্ট নিশ্চিত করুন';

  @override
  String get coreLocationServiceOff => 'আপনার ফোনে লোকেশন বন্ধ আছে।';

  @override
  String get coreLocationDenied => 'লোকেশনের অনুমতি দেওয়া হয়নি।';

  @override
  String get coreLocationBlocked => 'আপনার ফোনের সেটিংসে এই অ্যাপের জন্য লোকেশন বন্ধ করা আছে।';

  @override
  String get coreLocationUnavailable => 'আপনার ফোন সময়মতো আপনার অবস্থান খুঁজে পায়নি।';

  @override
  String corePackageNightsAccommodation(int nights) {
    String _temp0 = intl.Intl.pluralLogic(
      nights,
      locale: localeName,
      other: '$nights রাতের থাকার ব্যবস্থা',
      one: '$nights রাতের থাকার ব্যবস্থা',
    );
    return '$_temp0';
  }

  @override
  String get corePackageAirportPickup => 'বিমানবন্দর থেকে পিকআপ';

  @override
  String get corePackageTranslator => 'অনুবাদক';

  @override
  String get corePackageMeals => 'খাবার';

  @override
  String get corePackageLocalTransport => 'স্থানীয় যাতায়াত';

  @override
  String corePackageFollowupTeleconsults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countটি ফলো-আপ টেলিকনসাল্টেশন',
      one: '$countটি ফলো-আপ টেলিকনসাল্টেশন',
    );
    return '$_temp0';
  }

  @override
  String coreSavePercent(int pct) {
    return '$pct% সাশ্রয় করুন';
  }

  @override
  String coreSavePercentRange(int min, int max) {
    return '$min-$max% সাশ্রয় করুন';
  }

  @override
  String get coreUserGuest => 'অতিথি';

  @override
  String get coreUserPatient => 'রোগী';

  @override
  String coreMatchScore(int score) {
    return '$score% মিল';
  }

  @override
  String get coreErrorOffline => 'আপনি অফলাইনে আছেন';

  @override
  String get coreAvatarLabel => 'অবতার';

  @override
  String coreRatingCaption(String rating) {
    return '($rating/5)';
  }

  @override
  String coreRatingCaptionReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '($countটি রিভিউ থেকে $rating/5)',
      one: '($countটি রিভিউ থেকে $rating/5)',
    );
    return '$_temp0';
  }

  @override
  String coreRatingSemantics(String rating) {
    return 'রেটিং 5-এর মধ্যে $rating';
  }

  @override
  String coreRatingSemanticsReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countটি রিভিউ থেকে রেটিং 5-এর মধ্যে $rating',
      one: '$countটি রিভিউ থেকে রেটিং 5-এর মধ্যে $rating',
    );
    return '$_temp0';
  }

  @override
  String coreStepProgress(int step, int total) {
    return 'ধাপ $step/$total';
  }

  @override
  String coreStepProgressWithSuffix(int step, int total, String suffix) {
    return 'ধাপ $step/$total · $suffix';
  }

  @override
  String get navHome => 'হোম';

  @override
  String get navSearch => 'খুঁজুন';

  @override
  String get navTrips => 'ভ্রমণ';

  @override
  String get navMessages => 'বার্তা';

  @override
  String get navProfile => 'প্রোফাইল';

  @override
  String get routerNotFoundTitle => 'পৃষ্ঠাটি পাওয়া যায়নি';

  @override
  String routerNotFoundMessage(String location) {
    return 'আমরা \"$location\" খুঁজে পাইনি।';
  }

  @override
  String get routerGoHome => 'হোমে যান';

  @override
  String get homeTitle => 'কী কারণে আপনি ভারতে আসছেন?';

  @override
  String get homeSubtitle => 'আপনার চিকিৎসার প্রয়োজন বেছে নিন';

  @override
  String get homeSearchHint => 'কোনো রোগ বা অবস্থা খুঁজুন';

  @override
  String get homeSearchButton => 'খুঁজুন';

  @override
  String get homeAllSpecialties => 'সব বিশেষত্ব';

  @override
  String get homeNoSpecialtiesTitle => 'এখনও কোনো বিশেষত্ব নেই';

  @override
  String get homeNoSpecialtiesMessage => 'এর বদলে হাসপাতাল ও ডাক্তার খুঁজুন।';

  @override
  String get homeMoreTile => 'আরও';

  @override
  String get homeMoreTileSubtitle => 'অন্যান্য বিশেষত্ব';

  @override
  String get homeTripEyebrow => 'আপনার আসন্ন ভ্রমণ';

  @override
  String get homeTripFallbackTitle => 'ভারতে চিকিৎসা';

  @override
  String get homeTripDateTbc => 'তারিখ নিশ্চিত হবে';

  @override
  String get homeTripToday => 'আজ';

  @override
  String get homeTripTomorrow => 'আগামীকাল';

  @override
  String get homeTripInProgress => 'চলছে';

  @override
  String homeTripInDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days দিন পরে', one: '$days দিন পরে');
    return '$_temp0';
  }

  @override
  String homeTripAdmission(String date) {
    return 'ভর্তি $date';
  }

  @override
  String get homeScreeningEyebrow => 'AI স্ক্রিনিং';

  @override
  String get homeMatchesReadyTitle => 'আপনার মিলগুলো প্রস্তুত';

  @override
  String get homeMatchesReadySubtitle => 'আপনার জন্য মিলে যাওয়া হাসপাতাল ও ডাক্তার দেখুন';

  @override
  String homeMatchesReadySubtitleSpecialty(String specialty) {
    return '$specialty · আপনার সাথে মেলা ডাক্তারদের দেখুন';
  }

  @override
  String get homeScreeningProcessingTitle => 'আপনার জন্য সেরা মিল খোঁজা হচ্ছে';

  @override
  String get homeScreeningProcessingSubtitle => 'আমরা আপনার উত্তরগুলো বিশ্লেষণ করছি';

  @override
  String get homeScreeningContinueTitle => 'আপনার স্ক্রিনিং চালিয়ে যান';

  @override
  String get homeScreeningContinueSubtitle => 'যেখানে থেমেছিলেন সেখান থেকে শুরু করুন';

  @override
  String homeScreeningContinueSubtitleSpecialty(String specialty) {
    return '$specialty · যেখানে থেমেছিলেন সেখান থেকে শুরু করুন';
  }

  @override
  String get onboardingWelcomeChip => 'স্বাগতম';

  @override
  String get onboardingImpactStat => '5 লাখ+';

  @override
  String get onboardingImpactStatCaption => 'রোগীর চিকিৎসা হয়েছে';

  @override
  String get onboardingImpactStatFootnote => 'আমাদের অংশীদার হাসপাতালগুলোতে';

  @override
  String get onboardingImpactHeadline => '70% কম খরচে বিশ্বমানের স্বাস্থ্যসেবা';

  @override
  String get onboardingBadgeJciDescription => 'Joint Commission International স্বীকৃত অংশীদার হাসপাতাল';

  @override
  String get onboardingBadgeNabhDescription => 'NABH স্বীকৃত অংশীদার হাসপাতাল';

  @override
  String get onboardingBadgeWhoDescription => 'WHO-র রোগী-নিরাপত্তা নির্দেশিকা মেনে চলা চিকিৎসা';

  @override
  String get onboardingAccreditationsCaption => 'আমাদের অংশীদার হাসপাতালগুলোর স্বীকৃতি';

  @override
  String get onboardingNextPage => 'পরের পৃষ্ঠা';

  @override
  String get onboardingTrustTitle => 'যে চিকিৎসায় ভরসা রাখা যায়';

  @override
  String get onboardingTrustDoctorsTitle => 'ইংরেজিভাষী ডাক্তার';

  @override
  String get onboardingTrustDoctorsSubtitle => 'সহজে কথা বলুন।';

  @override
  String get onboardingTrustWaitTitle => 'অপেক্ষার সময় নেই';

  @override
  String get onboardingTrustWaitSubtitle => 'দ্রুত চিকিৎসা পান।';

  @override
  String get onboardingTrustCertifiedTitle => 'Joint Commission সার্টিফায়েড';

  @override
  String get onboardingTrustCertifiedSubtitle => 'আন্তর্জাতিকভাবে স্বীকৃত অংশীদার প্রতিষ্ঠান।';

  @override
  String get onboardingTestimonialQuote =>
      '\"হার্ট সার্জারিতে \$45,000 সাশ্রয় করেছি, দেশের চেয়েও ভালো চিকিৎসা পেয়েছি।\"';

  @override
  String get onboardingTestimonialAuthor => 'যুক্তরাষ্ট্রের একজন রোগী';

  @override
  String get onboardingTestimonialDisclaimer => 'দৃষ্টান্তমূলক উদাহরণ';

  @override
  String get onboardingStepShareTitle => 'আপনার অবস্থা জানান';

  @override
  String get onboardingStepShareSubtitle => 'নিরাপদে আপনার চিকিৎসা-সংক্রান্ত তথ্য দিন।';

  @override
  String get onboardingStepMatchTitle => 'মিল খুঁজে নিন';

  @override
  String get onboardingStepMatchSubtitle => 'আমাদের AI আপনার জন্য সেরা হাসপাতাল খুঁজে দেয়।';

  @override
  String get onboardingStepCompareTitle => 'খরচ তুলনা করুন';

  @override
  String get onboardingStepCompareSubtitle => 'স্বচ্ছ মূল্য, যাতে জেনে-বুঝে সিদ্ধান্ত নিতে পারেন।';

  @override
  String get onboardingStepBookTitle => 'চিকিৎসা বুক করুন';

  @override
  String get onboardingStepBookSubtitle => 'ঝামেলা ছাড়াই অ্যাপয়েন্টমেন্ট ঠিক করুন।';

  @override
  String get onboardingSecurityBadge => 'এনক্রিপ্টেড ও নিরাপদ';

  @override
  String get onboardingSecurityFooter =>
      'আপনার চিকিৎসা-তথ্য এনক্রিপ্ট করা থাকে এবং শুধু আপনার বেছে নেওয়া হাসপাতালগুলোর সাথেই শেয়ার করা হয়';

  @override
  String get onboardingGetStarted => 'শুরু করুন';

  @override
  String get onboardingExploreAsGuest => 'অতিথি হিসেবে দেখুন';

  @override
  String onboardingPageDots(int page, int count) {
    return 'পৃষ্ঠা $page/$count';
  }

  @override
  String get messagesTitle => 'বার্তা';

  @override
  String get messagesContactSupport => 'সাপোর্টে যোগাযোগ করুন';

  @override
  String get messagesEmptyTitle => 'এখনও কোনো কথোপকথন নেই';

  @override
  String get messagesEmptyMessage =>
      'আপনি কোটেশন চাইলে হাসপাতাল ও আপনার কোঅর্ডিনেটরের সাথে একটি চ্যাট এখানে খুলবে। যেকোনো সময় আমাদের সাপোর্ট টিমের সাথেও যোগাযোগ করতে পারেন।';

  @override
  String get messagesNoMessagesYet => 'এখনও কোনো বার্তা নেই';

  @override
  String get messagesAttachment => 'সংযুক্তি';

  @override
  String messagesPreviewMine(String message) {
    return 'আপনি: $message';
  }

  @override
  String messagesPreviewSender(String sender, String message) {
    return '$sender: $message';
  }

  @override
  String get notificationsTitle => 'নোটিফিকেশন';

  @override
  String get notificationsMarkAllRead => 'সব পঠিত করুন';

  @override
  String get notificationsEmptyTitle => 'সব দেখা হয়ে গেছে';

  @override
  String get notificationsEmptyMessage => 'কোটেশন, বুকিংয়ের আপডেট, রিমাইন্ডার ও বার্তা এখানে দেখা যাবে।';

  @override
  String notificationsBellUnread(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'নোটিফিকেশন, $countটি পড়া হয়নি',
      one: 'নোটিফিকেশন, $countটি পড়া হয়নি',
    );
    return '$_temp0';
  }

  @override
  String get supportLocationMarked => 'অবস্থান চিহ্নিত হয়েছে। আপনি SOS পাঠালে তবেই এটি শেয়ার করা হবে।';

  @override
  String get supportRealtimeNotifications => 'রিয়েল-টাইম নোটিফিকেশন';

  @override
  String get supportNotificationsEmpty => 'অ্যাপয়েন্টমেন্টের রিমাইন্ডার ও আপডেট ঘটার সাথে সাথে এখানে দেখা যাবে।';

  @override
  String get supportCallHelpline => '24/7 হেল্পলাইনে কল করুন';

  @override
  String get supportGetTranslator => 'অনুবাদক নিন';

  @override
  String get supportLocalGuide => 'স্থানীয় গাইড';

  @override
  String get supportBookFirst => 'আগে আপনার চিকিৎসা বুক করুন, অথবা বার্তা অংশে আমাদের সাপোর্ট টিমকে জিজ্ঞাসা করুন।';

  @override
  String get supportTranslatorRequested => 'অনুবাদকের অনুরোধ করা হয়েছে। আপনার কোঅর্ডিনেটর শিগগিরই নিশ্চিত করবেন।';

  @override
  String get supportGuideRequested => 'স্থানীয় গাইডের অনুরোধ করা হয়েছে। আপনার কোঅর্ডিনেটর শিগগিরই নিশ্চিত করবেন।';

  @override
  String get supportScheduleTitle => 'আপনার সময়সূচি';

  @override
  String get supportScheduleEmpty => 'আপনার হাসপাতাল এখানে অ্যাপয়েন্টমেন্ট যোগ করবে।';

  @override
  String supportScheduleWhen(String weekday, String time) {
    return '$weekday, $time';
  }

  @override
  String get supportTodaysSchedule => 'আজকের সময়সূচি';

  @override
  String get supportNextOnSchedule => 'আপনার সময়সূচিতে পরবর্তী';

  @override
  String get supportNothingToday => 'আজ কিছু নির্ধারিত নেই';

  @override
  String get cultureTipsTitle => 'সাংস্কৃতিক পরামর্শ';

  @override
  String get cultureTipsEmpty => 'শিগগিরই এখানে পরামর্শ দেখা যাবে।';

  @override
  String get sosButtonSemantics => 'SOS জরুরি সতর্কবার্তা';

  @override
  String get sosConfirmTitle => 'জরুরি সতর্কবার্তা পাঠাবেন?';

  @override
  String get sosConfirmBody => 'আপনার কোঅর্ডিনেটর ও আমাদের 24/7 সাপোর্ট টিমকে সঙ্গে সঙ্গে জানানো হবে।';

  @override
  String get sosMessageLabel => 'কী হচ্ছে? (ঐচ্ছিক)';

  @override
  String get sosShareLocationTitle => 'আমার বর্তমান অবস্থান সাপোর্ট টিমের সাথে শেয়ার করুন';

  @override
  String get sosShareLocationMarkedHint =>
      'শুধু এই সতর্কবার্তার জন্য ব্যবহার করা হবে। আপনার ফোন আপনাকে খুঁজে না পেলে, এর বদলে মানচিত্রে আপনার চিহ্নিত স্থানটি শেয়ার করা হবে।';

  @override
  String get sosShareLocationHint =>
      'শুধু এই সতর্কবার্তার জন্য ব্যবহার করা হবে, যাতে আমরা আপনাকে দ্রুত খুঁজে পাই। আপনার ফোন অনুমতি চাইতে পারে।';

  @override
  String get sosSendButton => 'SOS পাঠান';

  @override
  String get sosGettingLocation => 'আপনার অবস্থান খোঁজা হচ্ছে…';

  @override
  String get sosSendingAlert => 'আপনার সতর্কবার্তা পাঠানো হচ্ছে…';

  @override
  String get sosLocationShared => 'আপনার বর্তমান অবস্থান টিমের সাথে শেয়ার করা হয়েছে।';

  @override
  String sosLocationFallbackMarked(String reason) {
    return '$reason এর বদলে মানচিত্রে আপনার চিহ্নিত স্থানটি শেয়ার করা হয়েছে।';
  }

  @override
  String sosLocationFallbackNone(String reason) {
    return '$reason টিম কল করলে আপনি কোথায় আছেন তা জানান।';
  }

  @override
  String get sosResultSentTitle => 'সাহায্য আসছে';

  @override
  String get sosResultSentBody =>
      'আপনার কোঅর্ডিনেটর ও আমাদের 24/7 সাপোর্ট টিমকে জানানো হয়েছে, তাঁরা শিগগিরই আপনাকে কল করবেন।';

  @override
  String get sosResultDangerNote => 'আপনার জীবন ঝুঁকিতে থাকলে এখনই জরুরি পরিষেবায় কল করুন।';

  @override
  String get sosResultFailedTitle => 'সতর্কবার্তা পাঠানো যায়নি';

  @override
  String get sosResultFailedBody => 'অনুগ্রহ করে সরাসরি ফোন করে সাহায্য চান।';

  @override
  String get sosCallHelpline => 'হেল্পলাইনে কল করুন';

  @override
  String sosCallNumber(String number) {
    return '$number-এ কল করুন';
  }

  @override
  String get mapLongPressHint => 'আপনি কোথায় আছেন তা চিহ্নিত করতে মানচিত্রে চেপে ধরে রাখুন।';

  @override
  String get mapAttribution => 'OpenStreetMap অবদানকারীরা';

  @override
  String get mapZoomIn => 'জুম ইন';

  @override
  String get mapZoomOut => 'জুম আউট';

  @override
  String get mapShowMyPlaces => 'আমার স্থানগুলো দেখান';

  @override
  String get screeningAppBarTitle => 'এআই স্ক্রিনিং';

  @override
  String get screeningStartErrorTitle => 'আপনার স্ক্রিনিং শুরু করা যায়নি';

  @override
  String get screeningStartPreparing => 'আপনার প্রশ্নাবলি প্রস্তুত করা হচ্ছে...';

  @override
  String get screeningStartHeading => 'কী কারণে আপনি ভারতে আসছেন?';

  @override
  String get screeningStartSubtitle =>
      'চিকিৎসার ক্ষেত্রটি বেছে নিন। চারটি ছোট ধাপ আমাদের আপনাকে সঠিক ডাক্তারের সঙ্গে মেলাতে সাহায্য করে।';

  @override
  String get screeningStartNotSure => 'নিশ্চিত নন?';

  @override
  String get screeningStartNotSureBody => 'আপনার উপসর্গ বর্ণনা করুন, আমরা একটি বিশেষত্ব প্রস্তাব করব।';

  @override
  String get screeningResumeTitle => 'আপনার স্ক্রিনিং চালিয়ে যান';

  @override
  String get screeningResumeGeneral => 'সাধারণ';

  @override
  String get screeningLoadingAnswers => 'আপনার উত্তর লোড হচ্ছে...';

  @override
  String get screeningAlreadySubmittedAppBar => 'স্ক্রিনিং';

  @override
  String get screeningResultsReadyTitle => 'আপনার ফলাফল প্রস্তুত';

  @override
  String get screeningAlreadySubmittedTitle => 'এই স্ক্রিনিং ইতিমধ্যে জমা দেওয়া হয়েছে';

  @override
  String get screeningResultsReadyMessage =>
      'উত্তরগুলো আর পরিবর্তন করা যাবে না। আবার উত্তর দিতে নতুন স্ক্রিনিং শুরু করুন।';

  @override
  String get screeningAnalysingMessage => 'আমরা আপনার উত্তর বিশ্লেষণ করছি।';

  @override
  String get screeningViewMatches => 'আমার মিলগুলো দেখুন';

  @override
  String get screeningSeeProgress => 'অগ্রগতি দেখুন';

  @override
  String get screeningStartNewButton => 'নতুন স্ক্রিনিং শুরু করুন';

  @override
  String get screeningProcessingStepAnalyzing => 'আপনার অবস্থা বিশ্লেষণ করা হচ্ছে';

  @override
  String get screeningProcessingStepMatching => 'বিশেষজ্ঞদের সঙ্গে মেলানো হচ্ছে';

  @override
  String get screeningProcessingStepSavings => 'সাশ্রয় হিসাব করা হচ্ছে';

  @override
  String screeningChecklistRowSemantics(String label, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'done': 'সম্পন্ন', 'active': 'চলছে', 'other': 'অপেক্ষমাণ'});
    return '$label, $_temp0';
  }

  @override
  String get screeningProcessingHelpTitle => 'কী হচ্ছে?';

  @override
  String get screeningProcessingHelpBody =>
      'আমরা আপনার উত্তরগুলো পর্যালোচনা করি (আপনি সম্মতি দিলে এআই দিয়ে), সঠিক বিশেষত্ব প্রস্তাব করি এবং দক্ষতা, ভাষা, বাজেট ও প্রাপ্যতা অনুযায়ী ভারতের স্বীকৃত হাসপাতাল ও ডাক্তারদের সঙ্গে আপনাকে মিলিয়ে দিই। এতে সাধারণত এক মিনিটের কম সময় লাগে। এটি কোনো রোগনির্ণয় নয়।';

  @override
  String get screeningProcessingReady => 'আপনার মিল পাওয়া ফলাফল প্রস্তুত!';

  @override
  String get screeningProcessingFinding => 'আপনার জন্য সেরা মিল খোঁজা হচ্ছে...';

  @override
  String get screeningProcessingTip =>
      'টিপ: আপনি পাশাপাশি সর্বোচ্চ ৩টি মিল তুলনা করতে এবং খরচের পূর্ণ বিবরণ দেখতে পারেন।';

  @override
  String get screeningProcessingFailedTitle => 'আমরা বিশ্লেষণ সম্পূর্ণ করতে পারিনি';

  @override
  String get screeningProcessingFailedMessage => 'আপনার উত্তর বিশ্লেষণের সময় একটি সমস্যা হয়েছে।';

  @override
  String get screeningProcessingTimeoutTitle => 'এতে স্বাভাবিকের চেয়ে বেশি সময় লাগছে';

  @override
  String get screeningProcessingTimeoutMessage =>
      'আপনার মিল প্রস্তুত হলেই আমরা আপনাকে জানাব। আপনি অপেক্ষা করতে পারেন অথবা পরে ফিরে আসতে পারেন।';

  @override
  String get screeningProcessingKeepWaiting => 'অপেক্ষা করুন';

  @override
  String get screeningGoHome => 'হোমে যান';

  @override
  String get screeningNotSubmittedTitle => 'এই স্ক্রিনিং জমা দেওয়া হয়নি';

  @override
  String get screeningNotSubmittedMessage => 'আপনার মিল পেতে প্রশ্নাবলি শেষ করুন।';

  @override
  String get screeningContinueQuestionnaire => 'প্রশ্নাবলি চালিয়ে যান';

  @override
  String get screeningProcessingLostTitle => 'আপনার স্ক্রিনিংয়ের অবস্থা আমরা খুঁজে পাচ্ছি না';

  @override
  String get screeningPrevious => 'আগের';

  @override
  String get screeningHelpTooltip => 'সাহায্য';

  @override
  String get screeningHelpDialogTitle => 'এটি কীভাবে কাজ করে';

  @override
  String get screeningHelpGotIt => 'বুঝেছি';

  @override
  String get screeningSaveExit => 'সংরক্ষণ ও প্রস্থান';

  @override
  String get screeningProgressSaved => 'অগ্রগতি সংরক্ষিত হয়েছে। হোম থেকে যেকোনো সময় চালিয়ে যান।';

  @override
  String get screeningValidateBodyArea => 'অন্তত একটি অংশ বেছে নিতে শরীরের ছবিতে ট্যাপ করুন।';

  @override
  String get screeningValidateSymptoms =>
      'অন্তত একটি উপসর্গে \"হ্যাঁ\" বা \"হয়তো\" উত্তর দিন, অথবা নিজের উপসর্গ যোগ করুন।';

  @override
  String get screeningValidateDuration => 'এই সমস্যাটি কতদিন ধরে আছে তা আমাদের জানান।';

  @override
  String get screeningValidateBudget => 'সর্বনিম্ন বাজেট সর্বোচ্চ বাজেটের বেশি হতে পারবে না।';

  @override
  String get screeningValidateTravelWindow => 'ভ্রমণের সময়সীমা শুরু হওয়ার পরে শেষ হতে হবে।';

  @override
  String get screeningStep1Title => 'আপনার কোথায় সমস্যা হচ্ছে?';

  @override
  String get screeningStep1Subtitle => 'অংশটি বেছে নিতে শরীরের ছবিতে ট্যাপ করুন।';

  @override
  String screeningStep1SubtitleWithSpecialty(String specialty) {
    return 'অংশটি বেছে নিতে শরীরের ছবিতে ট্যাপ করুন · $specialty';
  }

  @override
  String get screeningNoAreaSelected => 'এখনও কোনো অংশ বেছে নেওয়া হয়নি';

  @override
  String get screeningStep2Title => 'আপনার কী কী উপসর্গ আছে?';

  @override
  String get screeningStep2Help =>
      'উপসর্গটি থাকলে কার্ডটি ডানে সোয়াইপ করুন (বা টিক চিহ্নে ট্যাপ করুন), না থাকলে বাঁয়ে (বা X), আর নিশ্চিত না হলে উপরে (বা -)। আমরা যা জিজ্ঞেস করিনি তা নিচে যোগ করুন।';

  @override
  String get screeningSymptomsLoading => 'পরামর্শ লোড হচ্ছে...';

  @override
  String get screeningSymptomsUnavailable => 'পরামর্শ পাওয়া যাচ্ছে না। নিচে আপনার উপসর্গ যোগ করুন।';

  @override
  String get screeningYourSymptoms => 'আপনার উপসর্গ';

  @override
  String get screeningYourSymptomsEmpty => 'যেসব উপসর্গে আপনি \"হ্যাঁ\" বা \"হয়তো\" বলবেন সেগুলো এখানে দেখাবে।';

  @override
  String screeningSymptomMaybeChip(String name) {
    return '$name (হয়তো)';
  }

  @override
  String get screeningAddAnotherSymptom => 'আরেকটি উপসর্গ যোগ করুন';

  @override
  String screeningSymptomTooLong(int max) {
    return 'উপসর্গটি $max অক্ষরের মধ্যে রাখুন।';
  }

  @override
  String screeningSymptomLimit(int max) {
    return 'আপনি সর্বোচ্চ $maxটি উপসর্গ যোগ করতে পারেন।';
  }

  @override
  String get screeningStep3Title => 'এই সমস্যাটি কতদিন ধরে আছে?';

  @override
  String get screeningDecrease => 'কমান';

  @override
  String get screeningIncrease => 'বাড়ান';

  @override
  String get screeningSeverity => 'তীব্রতা';

  @override
  String get screeningDailyImpact => 'দৈনন্দিন প্রভাব';

  @override
  String get screeningImpactWork => 'কাজ';

  @override
  String get screeningImpactSleep => 'ঘুম';

  @override
  String get screeningImpactMobility => 'চলাফেরা';

  @override
  String get screeningImpactWorkQuestion => 'এটি আপনার কাজে কতটা প্রভাব ফেলে?';

  @override
  String get screeningImpactSleepQuestion => 'এটি আপনার ঘুমে কতটা প্রভাব ফেলে?';

  @override
  String get screeningImpactMobilityQuestion => 'এটি চলাফেরায় কতটা প্রভাব ফেলে?';

  @override
  String screeningSeverityPillSemantics(String dimension, String level) {
    return '$dimension $level';
  }

  @override
  String get screeningPreviousTreatments => 'আগের চিকিৎসা';

  @override
  String get screeningPreviousReports => 'আগের রিপোর্ট';

  @override
  String get screeningOptionalParen => '(ঐচ্ছিক)';

  @override
  String get screeningScanUpload => 'মেডিকেল রিপোর্ট স্ক্যান বা আপলোড করুন';

  @override
  String get screeningScanUploadHint =>
      'কাগজের পৃষ্ঠার ছবি তুলুন বা একটি PDF বেছে নিন · আমাদের এআই সেটি পড়ে এবং আপনি বিবরণ নিশ্চিত করেন';

  @override
  String get screeningAttachWithoutAi => 'এআই ছাড়া ফাইল সংযুক্ত করুন (যেমন DICOM)';

  @override
  String get screeningNotesLabel => 'আর কিছু কি আমাদের জানা দরকার? (ঐচ্ছিক)';

  @override
  String screeningRemoveReportTooltip(String name) {
    return '$name সরান';
  }

  @override
  String screeningAttachLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'আপনি সর্বোচ্চ $countটি রিপোর্ট সংযুক্ত করতে পারেন।',
      one: 'আপনি সর্বোচ্চ $countটি রিপোর্ট সংযুক্ত করতে পারেন।',
    );
    return '$_temp0';
  }

  @override
  String screeningAttachPagesLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'একটি স্ক্রিনিংয়ে শুধু $countটি রিপোর্ট পৃষ্ঠা সংযুক্ত করা যায়।',
      one: 'একটি স্ক্রিনিংয়ে শুধু $countটি রিপোর্ট পৃষ্ঠা সংযুক্ত করা যায়।',
    );
    return '$_temp0';
  }

  @override
  String get screeningReportDefaultLabel => 'মেডিকেল রিপোর্ট';

  @override
  String screeningReportNumbered(int index) {
    return 'মেডিকেল রিপোর্ট $index';
  }

  @override
  String screeningReportPage(String label, int page) {
    return '$label পৃ.$page';
  }

  @override
  String get screeningReportAiConfirmed => 'এআই-এর পাঠ নিশ্চিত';

  @override
  String get screeningReportAiToReview => 'এআই-এর পাঠ পর্যালোচনা বাকি';

  @override
  String get screeningStep4Title => 'আপনার মিল ব্যক্তিগতকরণ করুন';

  @override
  String get screeningFindDoctors => 'আমার ডাক্তার খুঁজুন';

  @override
  String get screeningSkipDefaults => 'বাদ দিন ও ডিফল্ট ব্যবহার করুন';

  @override
  String get screeningLangHindi => 'হিন্দি';

  @override
  String get screeningLangEnglish => 'ইংরেজি';

  @override
  String get screeningLangArabic => 'আরবি';

  @override
  String get screeningLangSpanish => 'স্প্যানিশ';

  @override
  String get screeningLangFrench => 'ফরাসি';

  @override
  String get screeningLangRussian => 'রুশ';

  @override
  String get screeningPrefDoctorGender => 'ডাক্তারের লিঙ্গ';

  @override
  String get screeningPrefBudgetRange => 'বাজেটের সীমা';

  @override
  String get screeningPrefYourBudget => 'আপনার বাজেট';

  @override
  String get screeningPrefAnyBudget => 'যেকোনো বাজেট';

  @override
  String get screeningPrefClearBudget => 'বাজেট মুছুন';

  @override
  String get screeningPrefTravelWindow => 'ভ্রমণের সময়সীমা';

  @override
  String screeningPrefTravelFrom(String date) {
    return '$date থেকে - শেষের তারিখ বেছে নিন';
  }

  @override
  String screeningPrefTravelRange(String start, String end) {
    return '$start - $end';
  }

  @override
  String get screeningPrefUseAi => 'এআই সুপারিশ ব্যবহার করুন';

  @override
  String get screeningPrefUseAiOn => 'বিশ্লেষণের আগে আপনার সম্মতি প্রয়োজন';

  @override
  String get screeningPrefUseAiOff => 'নিয়মভিত্তিক সাধারণ মিলকরণ';

  @override
  String get consentAiTitle => 'এআই সুপারিশ ব্যবহার করবেন?';

  @override
  String get consentAiPointData =>
      'আপনার উত্তর (এবং আপনার সংযুক্ত যেকোনো রিপোর্ট) আমাদের এআই পরিষেবায় পাঠানো হয়, যাতে প্রাসঙ্গিক বিশেষত্ব, চিকিৎসা-পদ্ধতি এবং আপনার ডাক্তারের জন্য প্রশ্ন প্রস্তাব করা যায়।';

  @override
  String get consentAiPointNotDiagnosis =>
      'এটি কোনো রোগনির্ণয় নয়। যেকোনো চিকিৎসার আগে হাসপাতালের একজন যোগ্য ডাক্তার আপনার কেস পর্যালোচনা করেন।';

  @override
  String get consentAiPointPrivacy =>
      'আপনার তথ্য শুধু এই স্ক্রিনিংয়ের জন্য ব্যবহার করা হয় এবং কখনো বিক্রি করা হয় না। আপনি আপনার প্রোফাইল থেকে সম্মতি প্রত্যাহার করতে পারেন।';

  @override
  String get consentAiPointAlternative => 'চান না? তাহলে আমরা আমাদের নিয়মভিত্তিক সাধারণ পদ্ধতিতে আপনাকে মিলিয়ে দেব।';

  @override
  String get consentAiAgree => 'আমি সম্মত, এআই ব্যবহার করুন';

  @override
  String get consentAiDecline => 'সাধারণ মিলকরণ ব্যবহার করুন';

  @override
  String get bodyMapHead => 'মাথা';

  @override
  String get bodyMapNeck => 'ঘাড়';

  @override
  String get bodyMapChest => 'বুক';

  @override
  String get bodyMapAbdomen => 'পেট';

  @override
  String get bodyMapPelvis => 'শ্রোণি';

  @override
  String get bodyMapRegionBack => 'পিঠ';

  @override
  String get bodyMapLeftArm => 'বাম হাত';

  @override
  String get bodyMapRightArm => 'ডান হাত';

  @override
  String get bodyMapLeftLeg => 'বাম পা';

  @override
  String get bodyMapRightLeg => 'ডান পা';

  @override
  String get bodyMapSkin => 'ত্বক';

  @override
  String get bodyMapGeneral => 'সারা শরীর / সাধারণ';

  @override
  String get bodyMapViewFront => 'সামনে';

  @override
  String get bodyMapViewBack => 'পেছনে';

  @override
  String get painIntensityTitle => 'ব্যথার তীব্রতা';

  @override
  String get painNone => 'কোনো ব্যথা নেই';

  @override
  String get painMild => 'হালকা';

  @override
  String get painModerate => 'মাঝারি';

  @override
  String get painSevere => 'তীব্র';

  @override
  String get painWorst => 'সবচেয়ে তীব্র';

  @override
  String painValueLabel(int value, String label) {
    return '$value/10 · $label';
  }

  @override
  String painSemantics(int value, String label) {
    return 'ব্যথা ১০-এর মধ্যে $value, $label';
  }

  @override
  String get emergencyTitle => 'জরুরি অবস্থা — এখনই স্থানীয় চিকিৎসা নিন';

  @override
  String get emergencyBody =>
      'আপনার কিছু উত্তর চিকিৎসাগত জরুরি অবস্থার ইঙ্গিত দিতে পারে। ভ্রমণের অপেক্ষায় থাকবেন না। অবিলম্বে নিকটতম জরুরি বিভাগে যান অথবা আপনার স্থানীয় জরুরি নম্বরে ফোন করুন।';

  @override
  String get emergencyWarningSigns => 'আমরা যে সতর্কতামূলক লক্ষণগুলো লক্ষ করেছি';

  @override
  String get emergencyNotDiagnosis => 'এই স্ক্রিনিং কোনো রোগনির্ণয় নয়।';

  @override
  String emergencyCallButton(String number) {
    return 'জরুরি পরিষেবায় ফোন করুন ($number)';
  }

  @override
  String emergencyDialNow(String number) {
    return 'এখনই আপনার ফোন থেকে $number নম্বরে ফোন করুন।';
  }

  @override
  String get emergencyAckViewResults => 'আমি বুঝেছি - তবুও আমার ফলাফল দেখুন';

  @override
  String get emergencyAckContinueRisk => 'আমি ঝুঁকি বুঝতে পারছি - চালিয়ে যান';

  @override
  String get symptomDeckAllAnswered => 'সব পরামর্শের উত্তর দেওয়া হয়েছে। অন্য কিছু থাকলে নিচে যোগ করুন।';

  @override
  String symptomCardSemantics(String name) {
    return '$name. আপনার কি এই উপসর্গ আছে? হ্যাঁ হলে ডানে, না হলে বাঁয়ে, হয়তো হলে উপরে সোয়াইপ করুন।';
  }

  @override
  String get symptomSwipeOrTap => 'উত্তর দিতে সোয়াইপ বা ট্যাপ করুন';

  @override
  String symptomAnswerSemantics(String answer) {
    return 'উত্তর: $answer';
  }

  @override
  String symptomAnswerTooltip(String answer, String name) {
    return '$answer: $name';
  }

  @override
  String get symptomAddTooltip => 'উপসর্গ যোগ করুন';

  @override
  String symptomRemoveTooltip(String name) {
    return '$name সরান';
  }

  @override
  String get intakeAppliedBodyAreas => 'শরীরের অংশ';

  @override
  String get intakeAppliedPainIntensity => 'ব্যথার তীব্রতা';

  @override
  String get intakeAppliedSymptoms => 'উপসর্গ';

  @override
  String get intakeAppliedDuration => 'সময়কাল';

  @override
  String get intakeAppliedDailyImpact => 'দৈনন্দিন প্রভাব';

  @override
  String get intakeAppliedPreviousTreatments => 'আগের চিকিৎসা';

  @override
  String get intakeAppliedNotes => 'নোট';

  @override
  String get intakeListSeparator => ', ';

  @override
  String intakeVoiceAddedOnly(String fields) {
    return 'যোগ করা হয়েছে: $fields।';
  }

  @override
  String intakeVoiceUpdatedOnly(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countটি উত্তর হালনাগাদ করা হয়েছে।',
      one: '$countটি উত্তর হালনাগাদ করা হয়েছে।',
    );
    return '$_temp0';
  }

  @override
  String intakeVoiceAddedAndUpdated(String fields, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'যোগ করা হয়েছে: $fields; $countটি উত্তর হালনাগাদ করা হয়েছে।',
      one: 'যোগ করা হয়েছে: $fields; $countটি উত্তর হালনাগাদ করা হয়েছে।',
    );
    return '$_temp0';
  }

  @override
  String get intakeVoiceAlreadyMatch => 'আপনার উত্তর ইতিমধ্যে আপনার বলা কথার সঙ্গে মিলে যায়।';

  @override
  String get intakeConflictPainIntensity => 'ব্যথার তীব্রতা';

  @override
  String get intakeConflictHowLong => 'কতদিন ধরে';

  @override
  String intakeConflictDailyImpact(String dimension) {
    return 'দৈনন্দিন প্রভাব: $dimension';
  }

  @override
  String intakeDurationValue(int value, String unit) {
    return '$value $unit';
  }

  @override
  String get intakeConflictTitle => 'কিছু উত্তর আলাদা';

  @override
  String get intakeConflictHint =>
      'যেসব উত্তর আপনার বলা কথা দিয়ে বদলাতে চান সেগুলোতে টিক দিন। টিক না দেওয়া উত্তর যেমন আছে তেমনই থাকবে।';

  @override
  String intakeConflictCompare(String current, String suggested) {
    return 'আপনার: $current\nআপনার কণ্ঠ থেকে: $suggested';
  }

  @override
  String get intakeMedicalArea => 'চিকিৎসার ক্ষেত্র';

  @override
  String get intakeSpecialtyOptional => 'বিশেষত্ব (ঐচ্ছিক)';

  @override
  String get intakeNotSure => 'নিশ্চিত নই';

  @override
  String get intakeWhereProblem => 'সমস্যাটি কোথায়?';

  @override
  String get intakeAddPain => 'ব্যথার তীব্রতা যোগ করুন';

  @override
  String get intakeSymptoms => 'উপসর্গ';

  @override
  String get intakeAddSymptomHint => 'একটি উপসর্গ যোগ করুন';

  @override
  String get intakeHowLong => 'এটি কতদিন ধরে আছে?';

  @override
  String get intakeDailyImpact => 'দৈনন্দিন প্রভাব';

  @override
  String get intakePreviousTreatments => 'আগের চিকিৎসা';

  @override
  String get intakeNotesLabel => 'নোট';

  @override
  String get intakeNotesHint => 'ডাক্তারের আর কিছু জানা দরকার কি';

  @override
  String get voiceIntakeTitle => 'কণ্ঠে বর্ণনা করুন';

  @override
  String get voiceReviewTitle => 'আপনার উত্তর যাচাই করুন';

  @override
  String get voiceIntro =>
      'নিজের ভাষায় বলুন কোথায় ব্যথা, কবে থেকে, কতটা তীব্র এবং আপনি ইতিমধ্যে কী কী চেষ্টা করেছেন।';

  @override
  String get voiceMicOff =>
      'মাইক্রোফোন অ্যাক্সেস বন্ধ আছে। আপনার ফোনের সেটিংসে Heal India Global-এর জন্য এটি চালু করুন, অথবা লিখে জানান।';

  @override
  String get voiceStartFailed => 'রেকর্ডিং শুরু করা যায়নি। আবার চেষ্টা করুন অথবা লিখে জানান।';

  @override
  String get voiceNothingRecorded => 'কিছুই রেকর্ড হয়নি। আবার চেষ্টা করুন।';

  @override
  String get voiceConsentRequired => 'অনুগ্রহ করে আগে আপনার রেকর্ডিং প্রক্রিয়াকরণে সম্মতি দিন।';

  @override
  String get voiceNotUnderstood =>
      'আমরা রেকর্ডিংটি বুঝতে পারিনি। আরও শান্ত জায়গায় আবার চেষ্টা করুন, অথবা লিখে জানান।';

  @override
  String get voiceExtractTooShort => 'অনুগ্রহ করে কয়েকটি শব্দে আপনার সমস্যা বর্ণনা করুন।';

  @override
  String get voiceEmergencyAck => 'আমি বুঝেছি - আমার উত্তর পর্যালোচনা চালিয়ে যান';

  @override
  String get voiceStopRecording => 'রেকর্ডিং থামান';

  @override
  String get voiceRecordAgain => 'আবার রেকর্ড করুন';

  @override
  String get voiceStartRecording => 'রেকর্ডিং শুরু করুন';

  @override
  String voiceRecordedStatus(String duration) {
    return '$duration রেকর্ড হয়েছে · আবার রেকর্ড করতে ট্যাপ করুন';
  }

  @override
  String get voiceTapToStart => 'কথা বলা শুরু করতে ট্যাপ করুন';

  @override
  String get voiceInputLevel => 'ইনপুট লেভেল';

  @override
  String get voiceConsentText =>
      'আমি সম্মত যে আমার রেকর্ডিং Heal India Global-এর নিজস্ব সার্ভারে লিখিত রূপে রূপান্তর করা হবে এবং এআই সেটিকে আমার স্ক্রিনিংয়ের উত্তরে পরিণত করবে। লিখিত রূপান্তরের পর অডিও মুছে ফেলা হয়। ব্যবহারের আগে আমি সবকিছু যাচাই করব।';

  @override
  String get voiceUseRecording => 'এই রেকর্ডিং ব্যবহার করুন';

  @override
  String get voiceTypeInstead => 'বরং লিখে জানান';

  @override
  String get voiceTypedHint => 'নিজের ভাষায় আপনার সমস্যা বর্ণনা করুন…';

  @override
  String get voiceFillAnswers => 'আমার উত্তর পূরণ করুন';

  @override
  String get voiceSpeakInstead => 'বরং কথা বলুন';

  @override
  String get voiceUploading => 'আপনার রেকর্ডিং আপলোড হচ্ছে…';

  @override
  String get voiceReading => 'আপনার বর্ণনা পড়া হচ্ছে…';

  @override
  String get voiceListening => 'আপনার রেকর্ডিং শোনা হচ্ছে…';

  @override
  String get voiceCheckEveryAnswer => 'ব্যবহারের আগে আপনি প্রতিটি উত্তর যাচাই করবেন।';

  @override
  String get voiceEmergencyBanner =>
      'আপনার বর্ণনার কিছু অংশে জরুরি চিকিৎসার প্রয়োজন হতে পারে। অনুগ্রহ করে এখনই স্থানীয় জরুরি চিকিৎসা নিন।';

  @override
  String get voiceGuidance => 'নির্দেশনা';

  @override
  String get voiceReviewIntro =>
      'আমরা যা বুঝেছি তা যাচাই করুন। ভুল কিছু থাকলে বদলে দিন, তারপর নিশ্চিত করুন-এ ট্যাপ করুন।';

  @override
  String get voiceYourDescription => 'আপনার বর্ণনা';

  @override
  String get voiceWhatYouSaid => 'আপনি যা বলেছেন';

  @override
  String get voiceAiDisclaimer => 'এআই-তৈরি পরামর্শ — রোগনির্ণয় নয়।';

  @override
  String get voiceDiscard => 'বাতিল করুন';

  @override
  String get searchHint => 'হাসপাতাল, ডাক্তার, চিকিৎসা খুঁজুন';

  @override
  String get searchClearTooltip => 'অনুসন্ধান মুছুন';

  @override
  String get searchFiltersTooltip => 'ফিল্টার';

  @override
  String get searchTabHospitals => 'হাসপাতাল';

  @override
  String get searchTabDoctors => 'ডাক্তার';

  @override
  String get searchTabProcedures => 'চিকিৎসা পদ্ধতি';

  @override
  String get searchEmptyTryDifferent => 'অন্যভাবে খুঁজুন বা ফিল্টার মুছে দিন।';

  @override
  String get searchEmptyCheckBack => 'শীঘ্রই আবার দেখুন - নিয়মিত নতুন পার্টনার যোগ হচ্ছে।';

  @override
  String get searchClearFilters => 'ফিল্টার মুছুন';

  @override
  String get searchNoHospitalsFound => 'কোনো হাসপাতাল পাওয়া যায়নি';

  @override
  String get searchNoDoctorsFound => 'কোনো ডাক্তার পাওয়া যায়নি';

  @override
  String get searchNoProceduresFound => 'কোনো চিকিৎসা পদ্ধতি পাওয়া যায়নি';

  @override
  String searchGenderDoctorsChip(String gender, String label) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'female': 'মহিলা ডাক্তার',
      'male': 'পুরুষ ডাক্তার',
      'other': '$label ডাক্তার',
    });
    return '$_temp0';
  }

  @override
  String searchResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countটি ফলাফল', one: '$countটি ফলাফল');
    return '$_temp0';
  }

  @override
  String get filtersTitle => 'ফিল্টার';

  @override
  String get filtersSpecialtyLabel => 'বিশেষত্ব';

  @override
  String get filtersAnySpecialty => 'যেকোনো বিশেষত্ব';

  @override
  String get filtersCityLabel => 'শহর';

  @override
  String get filtersCityHint => 'যেমন নয়াদিল্লি, চেন্নাই';

  @override
  String get filtersAccreditationLabel => 'স্বীকৃতি (হাসপাতাল)';

  @override
  String get filtersLanguageLabel => 'কথ্য ভাষা';

  @override
  String get filtersDoctorGenderLabel => 'ডাক্তারের লিঙ্গ';

  @override
  String get filtersSortLabel => 'হাসপাতাল সাজানোর ক্রম';

  @override
  String get filtersShowResults => 'ফলাফল দেখুন';

  @override
  String get filtersSortTopRated => 'সর্বোচ্চ রেটিং';

  @override
  String get filtersSortLowestPrice => 'সর্বনিম্ন মূল্য';

  @override
  String get filtersSortName => 'নাম (A-Z)';

  @override
  String get filtersLanguageEnglish => 'ইংরেজি';

  @override
  String get filtersLanguageHindi => 'হিন্দি';

  @override
  String get filtersLanguageArabic => 'আরবি';

  @override
  String get filtersLanguageFrench => 'ফরাসি';

  @override
  String get filtersLanguageRussian => 'রুশ';

  @override
  String get filtersLanguageBengali => 'বাংলা';

  @override
  String get filtersLanguageSwahili => 'সোয়াহিলি';

  @override
  String get filtersLanguageSpanish => 'স্প্যানিশ';

  @override
  String catalogApproxPriceTooltip(String amount) {
    return 'আজকের বিনিময় হারে $amount থেকে আনুমানিক হিসাব';
  }

  @override
  String get catalogInternationalDesk => 'আন্তর্জাতিক ডেস্ক';

  @override
  String get catalogInternationalPatientDesk => 'আন্তর্জাতিক রোগী ডেস্ক';

  @override
  String get catalogPriceFromPrefix => 'সর্বনিম্ন ';

  @override
  String catalogSuccessBadge(int pct) {
    return '$pct% সাফল্য';
  }

  @override
  String get catalogVideoConsult => 'ভিডিও পরামর্শ';

  @override
  String catalogDaysInHospital(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count দিন হাসপাতালে',
      one: '$count দিন হাসপাতালে',
    );
    return '$_temp0';
  }

  @override
  String catalogPercent(int value) {
    return '$value%';
  }

  @override
  String get catalogAboutSection => 'পরিচিতি';

  @override
  String get catalogLanguagesSpoken => 'কথ্য ভাষা';

  @override
  String get catalogTreatmentsPrices => 'চিকিৎসা ও মূল্য';

  @override
  String get catalogShowLess => 'কম দেখুন';

  @override
  String get catalogReadMore => 'আরও পড়ুন';

  @override
  String catalogCouldNotOpen(String target) {
    return '$target খোলা যায়নি';
  }

  @override
  String get catalogGetMatched => 'উপযুক্ত ডাক্তার খুঁজুন';

  @override
  String get hospitalDetailNotFound => 'হাসপাতাল পাওয়া যায়নি';

  @override
  String get hospitalDetailEstablished => 'প্রতিষ্ঠাকাল';

  @override
  String get hospitalDetailBeds => 'শয্যা';

  @override
  String hospitalDetailDistanceKm(String distance) {
    return '$distance কিমি';
  }

  @override
  String get hospitalDetailFromAirport => 'বিমানবন্দর থেকে';

  @override
  String get hospitalDetailTreatmentsFrom => 'চিকিৎসার সর্বনিম্ন মূল্য: ';

  @override
  String get hospitalDetailSpecialties => 'বিশেষত্বসমূহ';

  @override
  String get hospitalDetailPricesIndicative =>
      'মূল্যগুলো আনুমানিক। আপনার কেস পর্যালোচনার পর হাসপাতাল চূড়ান্ত কোটেশন দেবে।';

  @override
  String get hospitalDetailDoctors => 'ডাক্তার';

  @override
  String get hospitalDetailPatientReviews => 'রোগীদের রিভিউ';

  @override
  String get hospitalDetailContact => 'যোগাযোগ';

  @override
  String get hospitalDetailContactViaCoordinator =>
      'কোটেশন চাওয়ার পর আপনার Heal India Global সমন্বয়কারীর মাধ্যমে হাসপাতালের সাথে যোগাযোগ করুন।';

  @override
  String get doctorDetailTitle => 'ডাক্তারের প্রোফাইল';

  @override
  String doctorDetailExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count বছর', one: '$count বছর');
    return '$_temp0';
  }

  @override
  String get doctorDetailExperience => 'অভিজ্ঞতা';

  @override
  String get doctorDetailSuccessRate => 'সাফল্যের হার';

  @override
  String doctorDetailReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countটি রিভিউ', one: '$countটি রিভিউ');
    return '$_temp0';
  }

  @override
  String get doctorDetailVideoConsultAvailable => 'ভিডিও পরামর্শ পাওয়া যায়';

  @override
  String get doctorDetailConsultationFee => 'পরামর্শ ফি';

  @override
  String get doctorDetailQualifications => 'যোগ্যতা';

  @override
  String get doctorDetailExpertise => 'দক্ষতার ক্ষেত্র';

  @override
  String get availabilitySection => 'খালি সময়';

  @override
  String get availabilityNext30Days => 'খালি সময় (পরবর্তী 30 দিন)';

  @override
  String get availabilityNoSlots => 'এখনও কোনো খালি সময় প্রকাশিত হয়নি - কোটেশন চান, হাসপাতাল তারিখ প্রস্তাব করবে।';

  @override
  String availabilityNextAvailable(String date) {
    return 'পরবর্তী খালি সময়: $date';
  }

  @override
  String availabilityDayAvailable(String day) {
    return '$day: খালি আছে';
  }

  @override
  String availabilityDayUnavailable(String day) {
    return '$day: খালি নেই';
  }

  @override
  String procedureDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন', one: '$count দিন');
    return '$_temp0';
  }

  @override
  String get procedureInHospital => 'হাসপাতালে';

  @override
  String get procedureRecovery => 'সেরে ওঠা';

  @override
  String get procedureTotalStayInIndia => 'ভারতে মোট অবস্থান';

  @override
  String procedureTypicalCostIn(String country) {
    return 'সাধারণ খরচ ($country)';
  }

  @override
  String procedureWaitTime(String time) {
    return 'অপেক্ষার সময়: $time';
  }

  @override
  String get procedureCompareCosts => 'খরচ তুলনা করুন';

  @override
  String get quoteRequestButton => 'কোটেশন চান';

  @override
  String get quoteRequestedSnack => 'কোটেশনের অনুরোধ পাঠানো হয়েছে। হাসপাতাল সাধারণত 48 ঘণ্টার মধ্যে উত্তর দেয়।';

  @override
  String get quoteSheetTitle => 'কোটেশনের অনুরোধ';

  @override
  String get quoteTreatmentLabel => 'চিকিৎসা (ঐচ্ছিক)';

  @override
  String get quoteTreatmentNotSure => 'এখনও নিশ্চিত নই';

  @override
  String get quoteNotesLabel => 'আপনার অবস্থা সম্পর্কে হাসপাতালকে জানান';

  @override
  String get quoteNotesHint => 'রোগনির্ণয়, বর্তমান চিকিৎসা, পছন্দের ভ্রমণের তারিখ...';

  @override
  String quoteConsent(String hospital) {
    return 'কোটেশন তৈরির জন্য আমি আমার প্রোফাইল, চিকিৎসা-সংক্রান্ত নোট ও নথি $hospital-এর সাথে শেয়ার করতে সম্মত।';
  }

  @override
  String get quoteSendRequest => 'অনুরোধ পাঠান';

  @override
  String get savedRemovedSnack => 'সংরক্ষিত তালিকা থেকে সরানো হয়েছে';

  @override
  String get savedAddedSnack => 'আপনার তালিকায় সংরক্ষিত হয়েছে';

  @override
  String get savedGuestPrompt => 'হাসপাতাল ও ডাক্তার সংরক্ষণ করতে একটি বিনামূল্যের অ্যাকাউন্ট খুলুন।';

  @override
  String get savedSignUpAction => 'সাইন আপ';

  @override
  String get savedRemoveTooltip => 'সংরক্ষিত তালিকা থেকে সরান';

  @override
  String get matchSortBestMatch => 'সেরা মিল';

  @override
  String get matchSortLowestCost => 'সর্বনিম্ন খরচ';

  @override
  String get matchSortHighestRating => 'সর্বোচ্চ রেটিং';

  @override
  String get matchSortMostExperience => 'সর্বাধিক অভিজ্ঞতা';

  @override
  String get matchSortBy => 'সাজানোর ক্রম';

  @override
  String get matchFilterTitle => 'ফিল্টার';

  @override
  String get matchFilterJciOnly => 'শুধু JCI স্বীকৃত হাসপাতাল';

  @override
  String get matchFilterVideoConsult => 'ভিডিও পরামর্শ দেন';

  @override
  String get matchFilterSpeaks => 'যে ভাষায় কথা বলেন';

  @override
  String get matchCardEstimatedTotalCost => 'আনুমানিক মোট খরচ';

  @override
  String matchCardSaveVsHome(int min, int max) {
    return 'নিজের দেশের তুলনায় $min-$max% সাশ্রয়';
  }

  @override
  String get matchCardAdded => 'যোগ হয়েছে';

  @override
  String get matchCardCompare => 'তুলনা';

  @override
  String get matchCardViewDetails => 'বিস্তারিত দেখুন';

  @override
  String get matchDetailWhyThisMatch => 'কেন এই মিল';

  @override
  String get matchDetailEstimatedCost => 'আনুমানিক খরচ';

  @override
  String matchDetailInCountry(String country) {
    return '$country: ';
  }

  @override
  String matchDetailSavePct(int min, int max) {
    return '$min-$max% সাশ্রয়';
  }

  @override
  String get matchDetailFinalPriceNote => 'আপনার কেস পর্যালোচনার পর হাসপাতালের কোটেশনে চূড়ান্ত মূল্য জানানো হবে।';

  @override
  String get matchDetailSeeFullComparison => 'পূর্ণ খরচের তুলনা দেখুন';

  @override
  String get matchDetailSuggestedPackage => 'প্রস্তাবিত প্যাকেজ';

  @override
  String get matchDetailCompareCosts => 'খরচ তুলনা করুন';

  @override
  String get matchDetailProceduresPackages => 'চিকিৎসা পদ্ধতি ও প্যাকেজ';

  @override
  String get compareTitleShort => 'তুলনা';

  @override
  String get compareTitle => 'মিলগুলোর তুলনা';

  @override
  String get compareNothingTitle => 'তুলনা করার কিছু নেই';

  @override
  String get compareNothingMessage => 'পাশাপাশি তুলনা করতে আপনার ফলাফল থেকে 2 বা 3টি মিল বেছে নিন।';

  @override
  String get compareStartScreening => 'স্ক্রিনিং শুরু করুন';

  @override
  String get compareNoLongerAvailable => 'এই মিলগুলো আর পাওয়া যাচ্ছে না';

  @override
  String get compareBackToMatches => 'মিলগুলোতে ফিরে যান';

  @override
  String get compareRowMatch => 'মিল';

  @override
  String compareExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count বছর', one: '$count বছর');
    return '$_temp0';
  }

  @override
  String get compareRowRating => 'রেটিং';

  @override
  String get compareRowHospital => 'হাসপাতাল';

  @override
  String get compareRowAccreditation => 'স্বীকৃতি';

  @override
  String get compareRowLanguages => 'ভাষা';

  @override
  String get compareRowEstCost => 'আনুমানিক খরচ';

  @override
  String get compareLowest => 'সর্বনিম্ন';

  @override
  String get compareRowSavings => 'সাশ্রয়';

  @override
  String comparePercentRange(int min, int max) {
    return '$min-$max%';
  }

  @override
  String get compareRowPackage => 'প্যাকেজ';

  @override
  String get compareRowWhy => 'কেন';

  @override
  String get compareBook => 'বুক করুন';

  @override
  String get compareDetails => 'বিস্তারিত';

  @override
  String consultationRequestSentSnack(String caseNumber, String hospital) {
    return 'অনুরোধ $caseNumber $hospital-এ পাঠানো হয়েছে।';
  }

  @override
  String get consultationConsentRequired => 'অনুগ্রহ করে হাসপাতালের সাথে আপনার তথ্য শেয়ার করতে সম্মতি দিন।';

  @override
  String get consultationGuestUpgrade =>
      'হাসপাতালে অনুরোধ পাঠাতে একটি বিনামূল্যের অ্যাকাউন্ট খুলুন। আপনার স্ক্রিনিংয়ের উত্তরগুলো সংরক্ষিত থাকবে।';

  @override
  String get consultationBookTitle => 'পরামর্শ বুক করুন';

  @override
  String get consultationMessageLabel => 'হাসপাতালের জন্য বার্তা (ঐচ্ছিক)';

  @override
  String get consultationMessageHint => 'পছন্দের তারিখ, প্রশ্ন, আপনার সাথে ভ্রমণকারী সঙ্গী...';

  @override
  String consultationConsent(String hospital) {
    return 'আমার কেস পর্যালোচনা ও কোটেশন তৈরির জন্য আমি আমার স্ক্রিনিংয়ের উত্তর, রিপোর্ট ও চিকিৎসা-সংক্রান্ত তথ্য $hospital-এর সাথে শেয়ার করতে সম্মত।';
  }

  @override
  String get consultationCreateAccount => 'বিনামূল্যে অ্যাকাউন্ট খুলুন';

  @override
  String get consultationPayAfterAccept =>
      'হাসপাতাল আপনার জন্য একটি ব্যক্তিগত কোটেশন পাঠাবে। আপনি তা গ্রহণ করার পরই কেবল অর্থ প্রদান করবেন।';

  @override
  String get costTitle => 'চিকিৎসার তুলনা';

  @override
  String get costFindHospitals => 'হাসপাতাল খুঁজুন';

  @override
  String get costChangeCountryTooltip => 'নিজের দেশ পরিবর্তন করুন';

  @override
  String costCompareWith(String country) {
    return 'তুলনা: $country';
  }

  @override
  String costTreatmentIn(String country) {
    return 'চিকিৎসা ($country)';
  }

  @override
  String get costTreatmentInIndia => 'ভারতে চিকিৎসা';

  @override
  String get costRowCost => 'খরচ';

  @override
  String get costRowWaitTime => 'অপেক্ষার সময়';

  @override
  String get costVaries => 'ভিন্ন হয়';

  @override
  String get costRowInsurance => 'বিমা কভারেজ';

  @override
  String get costVariesByPlan => 'প্ল্যান অনুযায়ী ভিন্ন';

  @override
  String get costIndiaDefaultWait => '1-2 সপ্তাহ';

  @override
  String costSavingsValue(String amount, int min, int max) {
    return '$amount ($min-$max%)';
  }

  @override
  String get costItemizedTitle => 'খরচের বিস্তারিত হিসাব';

  @override
  String get costDisclaimer =>
      'শুধুমাত্র তুলনার জন্য আনুমানিক হিসাব। আপনার চূড়ান্ত মূল্য হাসপাতালের ব্যক্তিগত কোটেশনে জানানো হবে। নিজের দেশের অঙ্কগুলো সাধারণ প্রকাশিত সীমা, যা প্রদানকারী ও বিমা অনুযায়ী ভিন্ন হয়।';

  @override
  String get costBreakdownInQuote => 'হাসপাতালের কোটেশনে বিস্তারিত হিসাব দেওয়া থাকবে।';

  @override
  String costTypicalIn(String country) {
    return 'সাধারণত ($country)';
  }

  @override
  String get costChooseTreatment => 'একটি চিকিৎসা বেছে নিন';

  @override
  String get costChooseTreatmentSubtitle => 'নিজের দেশে ও ভারতে এর খরচ তুলনা করুন।';

  @override
  String get costSearchTreatments => 'চিকিৎসা খুঁজুন';

  @override
  String get costNoTreatmentsFound => 'কোনো চিকিৎসা পাওয়া যায়নি';

  @override
  String get costCategorySurgery => 'অস্ত্রোপচার';

  @override
  String get costCategoryHospital => 'হাসপাতাল';

  @override
  String get costCategoryMedications => 'ওষুধ';

  @override
  String get costCategoryTestsScans => 'পরীক্ষা ও স্ক্যান';

  @override
  String get costCategoryDoctorFees => 'ডাক্তারের ফি';

  @override
  String get costCategoryImplants => 'ইমপ্লান্ট';

  @override
  String get costCategoryOther => 'অন্যান্য';

  @override
  String get costCategorySurgeryHint => 'সার্জন ও অ্যানেস্থেসিয়ার ফি, অপারেশন থিয়েটার ও আনুষঙ্গিক সামগ্রী।';

  @override
  String get costCategoryHospitalHint => 'কক্ষ, নার্সিং সেবা, খাবার এবং প্রয়োজনে আইসিইউ।';

  @override
  String get costCategoryMedicationsHint => 'হাসপাতালে থাকাকালীন ও ছুটির সময়ের ওষুধ।';

  @override
  String get costCategoryTestsScansHint => 'অপারেশনের আগের পরীক্ষা, ইমেজিং ও ল্যাব পরীক্ষা।';

  @override
  String get costCategoryDoctorFeesHint => 'পরামর্শ ও ফলো-আপ ভিজিট।';

  @override
  String get costCategoryImplantsHint => 'প্রয়োজনে ইমপ্লান্ট, স্টেন্ট বা কৃত্রিম অঙ্গ।';

  @override
  String get costCategoryOtherHint => 'আনুমানিক হিসাবে অন্তর্ভুক্ত অন্যান্য খরচ।';

  @override
  String get costCountryUs => 'যুক্তরাষ্ট্র';

  @override
  String get costCountryGb => 'যুক্তরাজ্য';

  @override
  String get costCountryCa => 'কানাডা';

  @override
  String get costCountryAu => 'অস্ট্রেলিয়া';

  @override
  String get costCountryNz => 'নিউজিল্যান্ড';

  @override
  String get costCountryAe => 'সংযুক্ত আরব আমিরাত';

  @override
  String get costCountrySa => 'সৌদি আরব';

  @override
  String get costCountryOm => 'ওমান';

  @override
  String get costCountryQa => 'কাতার';

  @override
  String get costCountryKw => 'কুয়েত';

  @override
  String get costCountryBh => 'বাহরাইন';

  @override
  String get costCountryIq => 'ইরাক';

  @override
  String get costCountryNg => 'নাইজেরিয়া';

  @override
  String get costCountryKe => 'কেনিয়া';

  @override
  String get costCountryTz => 'তানজানিয়া';

  @override
  String get costCountryEt => 'ইথিওপিয়া';

  @override
  String get costCountryBd => 'বাংলাদেশ';

  @override
  String get costCountryNp => 'নেপাল';

  @override
  String get costCountryLk => 'শ্রীলঙ্কা';

  @override
  String get costCountryAf => 'আফগানিস্তান';

  @override
  String get costCountryUz => 'উজবেকিস্তান';

  @override
  String get costCountryDe => 'জার্মানি';

  @override
  String get costCountryFr => 'ফ্রান্স';

  @override
  String get costCountryEs => 'স্পেন';

  @override
  String get costCountryIt => 'ইতালি';

  @override
  String get costCountryRu => 'রাশিয়া';

  @override
  String get costCountryIn => 'ভারত';

  @override
  String get costCountryYours => 'আপনার দেশ';

  @override
  String get paymentDueDeposit => 'এখন প্রদেয় অগ্রিম';

  @override
  String get paymentDueBalance => 'এখন প্রদেয় বাকি অর্থ';

  @override
  String get paymentDueNow => 'এখন প্রদেয়';

  @override
  String get paymentDueInstallment => 'এখন প্রদেয় কিস্তি';

  @override
  String paymentDueInstallmentSeq(int seq) {
    return 'কিস্তি $seq এখন প্রদেয়';
  }

  @override
  String bookingStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন', one: '$count দিন');
    return '$_temp0';
  }

  @override
  String bookingStayDaysRange(int min, int max) {
    return '$min-$max দিন';
  }

  @override
  String get paymentTitle => 'পেমেন্ট';

  @override
  String get paymentSecureTitle => 'নিরাপদ পেমেন্ট';

  @override
  String get paymentSecureBody =>
      'আমাদের পেমেন্ট পার্টনারের মাধ্যমে এনক্রিপ্টেড চেকআউট। কার্ডের তথ্য কখনও আমাদের সার্ভারে পৌঁছায় না।';

  @override
  String get paymentMethodSection => 'পেমেন্ট পদ্ধতি';

  @override
  String get paymentMethodCard => 'ক্রেডিট/ডেবিট কার্ড';

  @override
  String get paymentMethodCardAppOnly => 'Android ও iOS অ্যাপে উপলব্ধ';

  @override
  String get bankTransferTitle => 'ব্যাংক ট্রান্সফার';

  @override
  String get bankSwiftDetails => 'SWIFT বিবরণ';

  @override
  String get paymentTestTitle => 'পরীক্ষামূলক পেমেন্ট';

  @override
  String get paymentTestSubtitle => 'ডেভেলপমেন্ট গেটওয়ে - কোনো আসল টাকা লেনদেন হয় না';

  @override
  String get paymentPlansTitle => 'পেমেন্ট প্ল্যান';

  @override
  String paymentPlansOnBooking(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'এই বুকিংয়ে $countটি মাসিক কিস্তি',
      one: 'এই বুকিংয়ে $countটি মাসিক কিস্তি',
    );
    return '$_temp0';
  }

  @override
  String get paymentPlansChosenWhenBooking => '3, 6 বা 12 মাস - বুকিংয়ের সময় বেছে নেওয়া হয়';

  @override
  String get paymentInsurance => 'বিমা';

  @override
  String get bookingInsuranceClaim => 'আমি বিমা দাবি করতে চাই';

  @override
  String get paymentInsuranceRequestedHelp =>
      'দাবির অনুরোধ করা হয়েছে। আপনার পলিসি ও দাবির ফর্ম আপলোড করুন, যাতে আমাদের টিম সাহায্য করতে পারে।';

  @override
  String get paymentInsuranceChosenWhenBooking =>
      'বুকিংয়ের সময় বেছে নেওয়া হয়। দাবি যোগ করতে চাইলে আপনার সমন্বয়কারীকে জিজ্ঞাসা করুন।';

  @override
  String get paymentUploadInsuranceDocs => 'বিমার নথি আপলোড করুন';

  @override
  String get paymentPriceSummary => 'মূল্যের সারাংশ';

  @override
  String paymentChargedInCurrency(String currency) {
    return 'অর্ডার তৈরির সময় নির্ধারিত বিনিময় হারে আপনার কাছ থেকে $currency-এ চার্জ নেওয়া হবে।';
  }

  @override
  String paymentPlansCurrentOption(String option) {
    return 'এই বুকিংয়ে \"$option\" ব্যবহার করা হচ্ছে। 3, 6 বা 12 মাসের মাসিক প্ল্যান বুকিংয়ের সময় বেছে নেওয়া হয়। পরিবর্তন করতে, প্রথম পেমেন্টের আগে আপনার সমন্বয়কারীকে জিজ্ঞাসা করুন।';
  }

  @override
  String get paymentScheduleBeingPrepared => 'আপনার কিস্তির সময়সূচি তৈরি হচ্ছে।';

  @override
  String get paymentDueDatePending => 'নির্ধারিত তারিখ এখনও ঠিক হয়নি';

  @override
  String paymentDueOn(String date) {
    return 'প্রদানের তারিখ $date';
  }

  @override
  String get paymentCardAppOnlySnack =>
      'কার্ডে পেমেন্ট Android ও iOS অ্যাপে উপলব্ধ। এখানে ব্যাংক ট্রান্সফার ব্যবহার করুন।';

  @override
  String paymentConfirmReason(String amount) {
    return '$amount পেমেন্ট নিশ্চিত করুন';
  }

  @override
  String get paymentNotConfirmed => 'পেমেন্ট নিশ্চিত হয়নি।';

  @override
  String get paymentMethodNotAvailable => 'এই পেমেন্ট পদ্ধতি অ্যাপে উপলব্ধ নয়।';

  @override
  String get paymentCardCheckoutFailed => 'কার্ড চেকআউট শুরু করা যায়নি। আবার চেষ্টা করুন।';

  @override
  String paymentWalletPending(String wallet) {
    return '$wallet-এ পেমেন্ট সম্পূর্ণ করুন। পেমেন্ট পাওয়ার পর আমরা আপনার বুকিং নিশ্চিত করব।';
  }

  @override
  String get paymentTestDialogBody => 'এই ডেভেলপমেন্ট অর্ডারের জন্য গেটওয়ের ফলাফল সিমুলেট করুন।';

  @override
  String get paymentSimulateFailure => 'ব্যর্থতা সিমুলেট করুন';

  @override
  String get paymentSimulateSuccess => 'সফলতা সিমুলেট করুন';

  @override
  String get paymentGetBankDetails => 'ব্যাংক ট্রান্সফারের বিবরণ নিন';

  @override
  String get paymentPayButton => 'পেমেন্ট করুন';

  @override
  String get bookingTreatmentFallback => 'চিকিৎসা';

  @override
  String bookingAdmissionDate(String date) {
    return 'ভর্তি $date';
  }

  @override
  String get paymentSubtotal => 'উপমোট';

  @override
  String get paymentDiscount => 'ছাড়';

  @override
  String get paymentServiceFee => 'সার্ভিস ফি';

  @override
  String get paymentTaxes => 'কর';

  @override
  String get paymentTotal => 'মোট';

  @override
  String get paymentPaidSoFar => 'এ পর্যন্ত পরিশোধিত';

  @override
  String get paymentBalance => 'বাকি';

  @override
  String paymentInstallmentDueOn(int seq, String date) {
    return 'কিস্তি $seq প্রদেয় $date';
  }

  @override
  String get paymentBookingCancelledTitle => 'এই বুকিং বাতিল করা হয়েছে';

  @override
  String get paymentNothingDueTitle => 'এখন কিছু পরিশোধ করার নেই';

  @override
  String get paymentRefundOriginalMethod => 'কোনো ফেরত থাকলে তা মূল পেমেন্ট পদ্ধতিতে ফেরত দেওয়া হয়।';

  @override
  String paymentNothingDueBody(String number) {
    return 'বুকিং $number-এ কোনো পেমেন্ট বাকি নেই। পরের পেমেন্টের সময় হলে আমরা আপনাকে জানাব।';
  }

  @override
  String get paymentGoToTrip => 'আমার ট্রিপে যান';

  @override
  String get paymentResultSuccessTitle => 'পেমেন্ট সফল হয়েছে';

  @override
  String get paymentResultPendingTitle => 'পেমেন্ট জমা দেওয়া হয়েছে';

  @override
  String get paymentResultFailureTitle => 'পেমেন্ট ব্যর্থ হয়েছে';

  @override
  String paymentResultSuccessBody(String number) {
    return 'আপনার বুকিং $number আপডেট হয়েছে। আমরা আপনার সমন্বয়কারীকে জানিয়েছি।';
  }

  @override
  String get paymentResultPendingBody => 'পেমেন্ট যাচাই হলেই আমরা আপনার বুকিং নিশ্চিত করব। আপনি একটি নোটিফিকেশন পাবেন।';

  @override
  String get paymentResultFailureBody => 'কোনো টাকা কাটা হয়নি। আবার চেষ্টা করুন বা অন্য পদ্ধতি বেছে নিন।';

  @override
  String get paymentResultAmount => 'পরিমাণ';

  @override
  String get paymentResultOrder => 'অর্ডার';

  @override
  String get bookingLabel => 'বুকিং';

  @override
  String get paymentResultPaidOn => 'পরিশোধের তারিখ';

  @override
  String get paymentResultStatus => 'স্ট্যাটাস';

  @override
  String get paymentDownloadReceipt => 'রসিদ ডাউনলোড করুন';

  @override
  String get paymentGetHelp => 'সাহায্য নিন';

  @override
  String get caseViewCase => 'কেস দেখুন';

  @override
  String get paymentReceiptPreparing => 'আপনার রসিদ তৈরি হচ্ছে। শীঘ্রই এটি ডকুমেন্টসে দেখা যাবে।';

  @override
  String get paymentReceiptSaved => 'রসিদ সংরক্ষিত হয়েছে';

  @override
  String get bankTransferUnavailableTitle => 'ব্যাংক ট্রান্সফার উপলব্ধ নয়';

  @override
  String get bankTransferUnavailableBody => 'অনুগ্রহ করে অন্য পেমেন্ট পদ্ধতি বেছে নিন।';

  @override
  String get bankTransferAmount => 'ট্রান্সফারের পরিমাণ';

  @override
  String bankTransferOrder(String number) {
    return 'অর্ডার $number';
  }

  @override
  String get bankBeneficiary => 'সুবিধাভোগী';

  @override
  String get bankName => 'ব্যাংক';

  @override
  String get bankAccountNumber => 'অ্যাকাউন্ট নম্বর';

  @override
  String get bankPaymentReference => 'পেমেন্ট রেফারেন্স';

  @override
  String get bankTransferInstructions =>
      'পেমেন্ট রেফারেন্সটি হুবহু উল্লেখ করুন, যাতে আমরা আপনার ট্রান্সফার মেলাতে পারি। আন্তর্জাতিক ট্রান্সফারে সাধারণত 1-3 কার্যদিবস লাগে; আমাদের ফাইন্যান্স টিম অর্থ যাচাই করলে আপনার বুকিং নিশ্চিত হবে।';

  @override
  String get bankProofSection => 'ট্রান্সফারের প্রমাণ';

  @override
  String get bankProofReplace => 'বদলান';

  @override
  String get bankProofUpload => 'ট্রান্সফারের রসিদ আপলোড করুন';

  @override
  String get bankReferenceLabel => 'ব্যাংক লেনদেনের রেফারেন্স (UTR / MT103)';

  @override
  String get bankReferenceRequired => 'আপনার ব্যাংক থেকে পাওয়া রেফারেন্সটি লিখুন';

  @override
  String get bankSubmitProof => 'প্রমাণ জমা দিন';

  @override
  String get bankUploadLater => 'আমি পরে প্রমাণ আপলোড করব';

  @override
  String get bankProofReceived =>
      'ধন্যবাদ! আমরা আপনার ট্রান্সফারের বিবরণ পেয়েছি। অর্থ পৌঁছালে আপনার বুকিং নিশ্চিত হবে (সাধারণত 1-3 কার্যদিবস)।';

  @override
  String bankCopyTooltip(String label) {
    return '$label কপি করুন';
  }

  @override
  String bankCopied(String label) {
    return '$label কপি হয়েছে';
  }

  @override
  String get paymentResponseIncomplete => 'পেমেন্টের উত্তর অসম্পূর্ণ ছিল। অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।';

  @override
  String get paymentCancelled => 'পেমেন্ট বাতিল করা হয়েছে।';

  @override
  String get paymentNotCompleted => 'পেমেন্ট সম্পন্ন করা যায়নি।';

  @override
  String get paymentWalletFallback => 'ওয়ালেট';

  @override
  String get paymentCardsUnavailableOnDevice => 'এই ডিভাইসে কার্ডে পেমেন্ট উপলব্ধ নয়।';

  @override
  String get bookSelectDatesTitle => 'তারিখ বেছে নিন';

  @override
  String bookCaseClosedTitle(String status) {
    return 'এই কেসটি $status';
  }

  @override
  String get bookCaseClosedBody => 'চিকিৎসা বুক করতে একটি নতুন অনুসন্ধান শুরু করুন।';

  @override
  String get bookProceedToPayment => 'পেমেন্টে এগিয়ে যান';

  @override
  String get bookTreatmentDurationLabel => 'চিকিৎসার সময়কাল: ';

  @override
  String get bookDurationConfirmedByHospital => 'হাসপাতাল নিশ্চিত করবে';

  @override
  String bookDurationRequired(String duration) {
    return '$duration প্রয়োজন';
  }

  @override
  String bookAdmissionOn(String date) {
    return 'ভর্তি $date';
  }

  @override
  String get bookSelectPackage => 'প্যাকেজ বেছে নিন';

  @override
  String get bookAcceptedQuote => 'গৃহীত হাসপাতালের কোটেশন';

  @override
  String bookingStayDaysLabel(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days দিনের থাকা', one: '$days দিনের থাকা');
    return '$_temp0';
  }

  @override
  String bookingValidUntil(String date) {
    return '$date পর্যন্ত বৈধ';
  }

  @override
  String bookItemizedCharges(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countটি বিস্তারিত খরচ',
      one: '$countটি বিস্তারিত খরচ',
    );
    return '$_temp0';
  }

  @override
  String get bookNoPackages =>
      'এই হাসপাতাল এখনও এই চিকিৎসার জন্য কোনো প্যাকেজ প্রকাশ করেনি। আপনার কেস পেজ থেকে ব্যক্তিগত কোটেশন চেয়ে নিন।';

  @override
  String get bookPaymentOptionSection => 'পেমেন্টের বিকল্প';

  @override
  String get bookInsuranceHelp => 'দাবির কাগজপত্রে আমাদের টিম আপনাকে সাহায্য করবে।';

  @override
  String get bookLegendAvailable => 'উপলব্ধ';

  @override
  String get bookLegendSelected => 'নির্বাচিত';

  @override
  String get bookLegendUnavailable => 'অনুপলব্ধ';

  @override
  String get bookLegendPast => 'অতীত';

  @override
  String get bookPackageMedicalOnly => 'মূল চিকিৎসা প্যাকেজ';

  @override
  String get bookPackageMedicalStay => 'চিকিৎসা + থাকার ব্যবস্থা';

  @override
  String get bookPackageAllInclusive => 'চিকিৎসা, থাকা, যাতায়াত ও অনুবাদক';

  @override
  String bookInstallmentPerMonth(String amount) {
    return '≈ $amount / মাস (ফি ছাড়া)';
  }

  @override
  String get bookingPayInFull => 'সম্পূর্ণ পরিশোধ';

  @override
  String get bookPayInFullSubtitle => 'পুরো চিকিৎসার জন্য একবারে পেমেন্ট';

  @override
  String get bookPayDeposit => 'এখন অগ্রিম দিন';

  @override
  String get bookPayDepositSubtitle => 'আপনার তারিখ নিশ্চিত করুন; বাকি অর্থ ভর্তির আগে পরিশোধ করতে হবে';

  @override
  String get bookMonthlyInstallments => 'মাসিক কিস্তি';

  @override
  String get bookInstallmentChoices => '3, 6 বা 12 মাস';

  @override
  String bookMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count মাস', one: '$count মাস');
    return '$_temp0';
  }

  @override
  String get bookSavePrefix => 'সাশ্রয় ';

  @override
  String get bookExistingBookingBody =>
      'এই কেসে ইতিমধ্যে একটি বুকিং আছে। সেটি নিয়ে এগিয়ে যান, অথবা নতুন তারিখ বেছে নিতে কেস পেজ থেকে সেটি বাতিল করুন।';

  @override
  String get bookContinueToPayment => 'পেমেন্টে চালিয়ে যান';

  @override
  String get bookCalendarPreviousMonth => 'আগের মাস';

  @override
  String get bookCalendarNextMonth => 'পরের মাস';

  @override
  String bookCalendarDaySemantics(String date, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'selected': 'নির্বাচিত', 'available': 'উপলব্ধ', 'other': 'অনুপলব্ধ'});
    return '$date, $_temp0';
  }

  @override
  String get bookDoctorHideDetails => 'ডাক্তারের বিবরণ লুকান';

  @override
  String get bookDoctorShowDetails => 'ডাক্তারের বিবরণ দেখুন';

  @override
  String bookDoctorExperience(int years) {
    String _temp0 = intl.Intl.pluralLogic(
      years,
      locale: localeName,
      other: '$years বছরের অভিজ্ঞতা',
      one: '$years বছরের অভিজ্ঞতা',
    );
    return '$_temp0';
  }

  @override
  String bookDoctorSpeaks(String languages) {
    return 'ভাষা: $languages';
  }

  @override
  String get bookProfessionCardiologist => 'হৃদরোগ বিশেষজ্ঞ';

  @override
  String get bookProfessionOrthopedicSurgeon => 'অর্থোপেডিক সার্জন';

  @override
  String get bookProfessionOncologist => 'ক্যান্সার বিশেষজ্ঞ';

  @override
  String get bookProfessionNeurologist => 'স্নায়ুরোগ বিশেষজ্ঞ';

  @override
  String get bookProfessionDentist => 'দন্ত চিকিৎসক';

  @override
  String get bookProfessionUrologist => 'ইউরোলজিস্ট';

  @override
  String get bookProfessionNephrologist => 'কিডনি বিশেষজ্ঞ';

  @override
  String get bookProfessionGastroenterologist => 'গ্যাস্ট্রোএন্টারোলজিস্ট';

  @override
  String get bookProfessionOphthalmologist => 'চক্ষু বিশেষজ্ঞ';

  @override
  String get bookProfessionDermatologist => 'চর্মরোগ বিশেষজ্ঞ';

  @override
  String get casesTitle => 'আমার কেসসমূহ';

  @override
  String get caseFilterAll => 'সব';

  @override
  String get casesEmptyTitle => 'এখনও কোনো কেস নেই';

  @override
  String casesEmptyFilteredTitle(String status) {
    return 'কোনো \"$status\" কেস নেই';
  }

  @override
  String get casesEmptyBody => 'কেস শুরু করতে মিলে যাওয়া কোনো হাসপাতাল থেকে কোটেশন চান।';

  @override
  String get caseFindMyTreatment => 'আমার চিকিৎসা খুঁজুন';

  @override
  String casesShowingCount(int shown, int total) {
    return '$totalটির মধ্যে $shownটি দেখানো হচ্ছে। তালিকা ছোট করতে ফিল্টার ব্যবহার করুন।';
  }

  @override
  String get caseTitleFallback => 'কেস';

  @override
  String get caseMessageTooltip => 'এই কেস সম্পর্কে বার্তা পাঠান';

  @override
  String get caseQuotesSection => 'কোটেশন';

  @override
  String get caseQuotePending =>
      'হাসপাতাল আপনার কেস পর্যালোচনা করছে। বিস্তারিত কোটেশন এলে আপনাকে জানানো হবে (সাধারণত 48 ঘণ্টার মধ্যে)।';

  @override
  String get caseNoQuotes => 'এই কেসে কোনো কোটেশন নেই।';

  @override
  String get caseBookPackageInstead => 'এর বদলে নির্দিষ্ট মূল্যের প্যাকেজ বুক করুন';

  @override
  String get caseMedicalSummary => 'চিকিৎসা সারাংশ';

  @override
  String get caseYourNotes => 'আপনার নোট';

  @override
  String get documentsTitle => 'ডকুমেন্টস';

  @override
  String get caseDocumentsManage => 'পরিচালনা';

  @override
  String get caseDocumentsEmpty => 'রিপোর্ট, স্ক্যান ও আপনার পাসপোর্ট আপলোড করুন, যাতে হাসপাতাল প্রস্তুতি নিতে পারে।';

  @override
  String get caseStatusTimeline => 'স্ট্যাটাসের সময়রেখা';

  @override
  String get caseMessageCareTeam => 'কেয়ার টিমকে বার্তা পাঠান';

  @override
  String get caseCancelThisCase => 'এই কেস বাতিল করুন';

  @override
  String caseCoordinator(String name) {
    return 'সমন্বয়কারী: $name';
  }

  @override
  String caseAgent(String name) {
    return 'এজেন্ট: $name';
  }

  @override
  String caseOpenedOn(String date) {
    return 'খোলা হয়েছে $date';
  }

  @override
  String get caseBookingPackage => 'প্যাকেজ';

  @override
  String get caseBookingAdmission => 'ভর্তি';

  @override
  String get caseBookingDuration => 'সময়কাল';

  @override
  String caseDurationDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days দিন', one: '$days দিন');
    return '$_temp0';
  }

  @override
  String get caseBookingPaymentPlan => 'পেমেন্ট প্ল্যান';

  @override
  String get caseBookingPaid => 'পরিশোধিত';

  @override
  String get caseClaimRequested => 'দাবির অনুরোধ করা হয়েছে';

  @override
  String get casePayToConfirm => 'নিশ্চিত করতে পেমেন্ট করুন';

  @override
  String get casePayBalance => 'বাকি পরিশোধ করুন';

  @override
  String get travelVisaAndTravel => 'ভিসা ও ভ্রমণ';

  @override
  String get caseCancelBooking => 'বুকিং বাতিল করুন';

  @override
  String get caseDepositPlusBalance => 'অগ্রিম + বাকি';

  @override
  String caseMonthlyInstallments(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$monthsটি মাসিক কিস্তি',
      one: '$monthsটি মাসিক কিস্তি',
    );
    return '$_temp0';
  }

  @override
  String get caseMonthlyInstallmentsNoCount => 'মাসিক কিস্তি';

  @override
  String get caseAcceptQuoteTitle => 'এই কোটেশন গ্রহণ করবেন?';

  @override
  String get caseAcceptQuoteBody =>
      'হাসপাতাল আপনার চিকিৎসা পরিকল্পনা সংরক্ষণ করবে। এরপর আপনি ভর্তির তারিখ বেছে নিয়ে অগ্রিম জমা দেবেন।';

  @override
  String get caseNotYet => 'এখন নয়';

  @override
  String get caseAccept => 'গ্রহণ করুন';

  @override
  String get caseQuoteAccepted => 'কোটেশন গৃহীত হয়েছে';

  @override
  String get caseDeclineQuoteTitle => 'এই কোটেশন প্রত্যাখ্যান করবেন?';

  @override
  String get caseDecline => 'প্রত্যাখ্যান';

  @override
  String get caseCancelBookingTitle => 'বুকিং বাতিল করবেন?';

  @override
  String get caseReason => 'কারণ';

  @override
  String get caseCancelBookingPolicy =>
      'ফেরত বাতিলকরণ নীতি অনুযায়ী হয়: ভর্তির যত আগে বাতিল করবেন, তত বেশি ফেরত পাবেন।';

  @override
  String get caseBookingCancelled => 'বুকিং বাতিল হয়েছে। যেকোনো ফেরত আপনার মূল পেমেন্ট পদ্ধতিতে ফেরত দেওয়া হবে।';

  @override
  String get caseCancelCaseTitle => 'এই কেস বাতিল করবেন?';

  @override
  String get caseCancelCase => 'কেস বাতিল করুন';

  @override
  String get caseNextPaymentNeeded => 'আপনার বুকিং নিশ্চিত করতে পেমেন্ট প্রয়োজন';

  @override
  String get caseNextBalanceDue => 'ভর্তির আগে বাকি অর্থ পরিশোধ করতে হবে';

  @override
  String get caseNextWaitingForQuote => 'হাসপাতালের কোটেশনের অপেক্ষায়';

  @override
  String get caseNextReviewQuote => 'আপনার কোটেশন দেখুন';

  @override
  String get caseNextChooseDate => 'আপনার ভর্তির তারিখ বেছে নিন';

  @override
  String get caseHospitalQuote => 'হাসপাতালের কোটেশন';

  @override
  String caseQuoteBy(String name) {
    return '$name প্রস্তুত করেছেন';
  }

  @override
  String caseQuoteTotalStay(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'মোট · $days দিনের থাকা',
      one: 'মোট · $days দিনের থাকা',
    );
    return '$_temp0';
  }

  @override
  String get caseAcceptQuote => 'কোটেশন গ্রহণ করুন';

  @override
  String get caseChooseAdmissionDate => 'ভর্তির তারিখ বেছে নিন';

  @override
  String get caseReasonOptional => 'কারণ (ঐচ্ছিক)';

  @override
  String refundTierLessThanDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'ভর্তির $days দিনের কম আগে',
      one: 'ভর্তির $days দিনের কম আগে',
    );
    return '$_temp0';
  }

  @override
  String refundTierDaysOrMore(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'ভর্তির $days+ দিন আগে',
      one: 'ভর্তির $days+ দিন আগে',
    );
    return '$_temp0';
  }

  @override
  String get refundNone => 'কোনো ফেরত নেই';

  @override
  String refundPercent(int pct) {
    return '$pct% ফেরত';
  }

  @override
  String refundTierLine(String when, String refund) {
    return '$when: $refund';
  }

  @override
  String get refundPolicyTitle => 'বাতিলকরণ ও ফেরত';

  @override
  String get refundPolicyGeneral =>
      'আপনার বুকিং নিশ্চিত হওয়ার সময় যে বাতিলকরণ নীতি কার্যকর থাকবে সেটিই প্রযোজ্য: ভর্তির যত আগে বাতিল করবেন, তত বেশি ফেরত পাবেন।';

  @override
  String get refundPolicyLocked =>
      'এই বুকিংয়ের জন্য এই শর্তগুলি নির্দিষ্ট। হাসপাতাল বা Heal India Global বাতিল করলে আপনি সম্পূর্ণ অর্থ ফেরত পাবেন।';

  @override
  String documentsUploading(String name) {
    return '$name আপলোড হচ্ছে';
  }

  @override
  String get documentsEmptyTitle => 'এখনও কোনো ডকুমেন্ট নেই';

  @override
  String get documentsEmptyBody =>
      'আপনার পাসপোর্ট, মেডিকেল রিপোর্ট, স্ক্যান ও প্রেসক্রিপশন আপলোড করুন। PDF, JPG, PNG, WEBP, HEIC বা DICOM, সর্বোচ্চ 20 MB।';

  @override
  String get documentsUploadADocument => 'একটি ডকুমেন্ট আপলোড করুন';

  @override
  String get documentsSharedNote => 'শুধু আপনার কেয়ার টিম ও আপনার কেসের হাসপাতালের সাথে শেয়ার করা হয়।';

  @override
  String documentsUploaded(String name) {
    return '$name আপলোড হয়েছে';
  }

  @override
  String get documentsDeleteTitle => 'ডকুমেন্ট মুছবেন?';

  @override
  String documentsDeleteBody(String name) {
    return '$name আপনার এবং আপনার কেয়ার টিমের জন্য সরিয়ে ফেলা হবে।';
  }

  @override
  String get documentsKeep => 'রেখে দিন';

  @override
  String get documentsActionsTooltip => 'ডকুমেন্টের অ্যাকশন';

  @override
  String get documentsFileTooLarge => 'ফাইলটি অনেক বড় (সর্বোচ্চ 20 MB)।';

  @override
  String documentsSaved(String name) {
    return '$name সংরক্ষিত হয়েছে';
  }

  @override
  String get documentsPreviewUnavailable => 'এই ছবির ফরম্যাট প্রিভিউ করা যায় না। এর বদলে ডাউনলোড ব্যবহার করুন।';

  @override
  String get documentsWhatAreYouUploading => 'আপনি কী আপলোড করছেন?';

  @override
  String get preArrivalTitle => 'আগমনের আগের গাইড';

  @override
  String get preArrivalVisaTitle => 'ভিসা ও নথিপত্র';

  @override
  String get preArrivalVisaPassport => 'কমপক্ষে 6 মাস মেয়াদি পাসপোর্ট, দুটি ফাঁকা পাতাসহ।';

  @override
  String get preArrivalVisaEMedical =>
      'ভারতীয় e-Medical ভিসা (এবং সঙ্গীদের জন্য e-Medical Attendant ভিসা) - আমরা হাসপাতালের আমন্ত্রণপত্র পাঠাই।';

  @override
  String get preArrivalVisaCopies => 'আপনার ভিসা, আমন্ত্রণপত্র, বুকিং নিশ্চিতকরণ ও মেডিকেল রিপোর্টের প্রিন্ট করা কপি।';

  @override
  String get preArrivalMedicalTitle => 'মেডিকেল রেকর্ড';

  @override
  String get preArrivalMedicalReports =>
      'সাম্প্রতিক স্ক্যান, ল্যাব রিপোর্ট ও প্রেসক্রিপশন - ডকুমেন্টসে আপলোড করুন, যাতে আপনার ডাক্তার সেগুলো দেখতে পারেন।';

  @override
  String get preArrivalMedicalMedicines => 'বর্তমান ওষুধের তালিকা ও ডোজ; পুরো সফরের জন্য যথেষ্ট ওষুধ সঙ্গে আনুন।';

  @override
  String get preArrivalMedicalAllergies => 'অ্যালার্জি ও আগের অস্ত্রোপচারের তথ্য ইংরেজিতে লিখে আনুন।';

  @override
  String get preArrivalPackTitle => 'কী সঙ্গে নেবেন';

  @override
  String get preArrivalPackClothing => 'চিকিৎসার পরের জন্য ঢিলেঢালা, আরামদায়ক পোশাক।';

  @override
  String get preArrivalPackAdapter => 'ইউনিভার্সাল পাওয়ার অ্যাডাপ্টার (ভারতে C, D ও M টাইপ প্লাগ, 230 V ব্যবহৃত হয়)।';

  @override
  String get preArrivalPackJacket => 'একটি হালকা জ্যাকেট - হাসপাতাল ও ফ্লাইটে এয়ার কন্ডিশনার থাকে।';

  @override
  String get preArrivalMoneyTitle => 'টাকা-পয়সা';

  @override
  String get preArrivalMoneyCards =>
      'হাসপাতাল ও হোটেলে কার্ড গ্রহণ করা হয়; ট্যাক্সি ও ছোট দোকানের জন্য কিছু রুপি সঙ্গে রাখুন।';

  @override
  String get preArrivalMoneyTellBank => 'আপনি ভারতে যাচ্ছেন তা আপনার ব্যাংককে জানান, যাতে কার্ড ব্লক না হয়।';

  @override
  String get preArrivalMoneyReceipts => 'আপনার পেমেন্টের রসিদ অ্যাপের ডকুমেন্টস অংশে রাখুন।';

  @override
  String get preArrivalArrivalTitle => 'আগমনের দিন';

  @override
  String get preArrivalArrivalFlight => 'আপনার ফ্লাইটের বিবরণ জানান, যাতে আমরা এয়ারপোর্ট পিকআপের ব্যবস্থা করতে পারি।';

  @override
  String get preArrivalArrivalDriver => 'আপনার ড্রাইভার Heal India Global লেখা সাইন নিয়ে অ্যারাইভালে অপেক্ষা করবেন।';

  @override
  String get preArrivalArrivalHelpline => 'ফ্লাইটের আগে 24/7 হেল্পলাইন নম্বরটি সেভ করে রাখুন।';

  @override
  String get preArrivalCulturalTips => 'সাংস্কৃতিক পরামর্শ';

  @override
  String get preArrivalTipsSoon => 'শীঘ্রই এখানে পরামর্শ দেখা যাবে।';

  @override
  String get preArrivalDisclaimer => 'শুধুমাত্র সাধারণ ভ্রমণ তথ্য - সবসময় আপনার ডাক্তারের নির্দেশনা মেনে চলুন।';

  @override
  String journeyCallFromPhone(String number) {
    return 'আপনার ফোন থেকে $number নম্বরে কল করুন।';
  }

  @override
  String journeyWhatsAppFromPhone(String number) {
    return 'আপনার ফোন থেকে WhatsApp-এ $number নম্বরে যোগাযোগ করুন।';
  }

  @override
  String get journeyCoordinatorChatSubject => 'আমার কেয়ার কোঅর্ডিনেটর';

  @override
  String get emergencyContactsTitle => 'জরুরি যোগাযোগ';

  @override
  String get emergencyContactsIntro => 'ভারতে চিকিৎসাজনিত জরুরি অবস্থায় প্রথমে স্থানীয় জরুরি নম্বরে কল করুন।';

  @override
  String get emergencyContactsServicesIndia => 'জরুরি পরিষেবা (ভারত)';

  @override
  String get emergencyContactsHelpline => 'Heal India Global 24/7 হেল্পলাইন';

  @override
  String get emergencyContactsWhatsApp => 'WhatsApp সাপোর্ট';

  @override
  String emergencyContactsCoordinator(String name) {
    return 'সমন্বয়কারী - $name';
  }

  @override
  String get emergencyContactsMine => 'আমার জরুরি যোগাযোগ';

  @override
  String get travelRequestSent => 'অনুরোধ পাঠানো হয়েছে। আমাদের ট্রাভেল ডেস্ক আপনার সাথে যোগাযোগ করবে।';

  @override
  String get visaSectionTitle => 'মেডিকেল ভিসা';

  @override
  String get visaEmptyText =>
      'বেশিরভাগ আন্তর্জাতিক রোগীর ভারতীয় e-Medical ভিসা প্রয়োজন হয়। আমরা হাসপাতালের আমন্ত্রণপত্র দিই এবং আবেদনে সাহায্য করি।';

  @override
  String get visaRequestAssistance => 'ভিসা সহায়তার অনুরোধ করুন';

  @override
  String get flightSectionTitle => 'ফ্লাইট ও এয়ারপোর্ট ট্রান্সফার';

  @override
  String get flightNoRequests => 'এখনও কোনো ফ্লাইট বা ট্রান্সফারের অনুরোধ নেই।';

  @override
  String get flightRequestChip => 'ফ্লাইটের অনুরোধ';

  @override
  String get travelAirportPickup => 'এয়ারপোর্ট পিকআপ';

  @override
  String get travelAirportDrop => 'এয়ারপোর্ট ড্রপ';

  @override
  String get stayAccommodation => 'থাকার ব্যবস্থা';

  @override
  String get stayEmptyText => 'আপনার হাসপাতালের কাছে হোটেল, গেস্ট হাউস ও সার্ভিস অ্যাপার্টমেন্ট।';

  @override
  String get stayRequestAccommodation => 'থাকার ব্যবস্থার অনুরোধ';

  @override
  String get stayRequestAnother => 'আরেকটি থাকার অনুরোধ';

  @override
  String get travelLocalServices => 'স্থানীয় পরিষেবা';

  @override
  String get travelTranslator => 'অনুবাদক';

  @override
  String get travelLocalGuide => 'স্থানীয় গাইড';

  @override
  String get travelTransport => 'যাতায়াত';

  @override
  String get visaHintNotStarted => 'আমরা আপনার অনুরোধ পেয়েছি এবং প্রয়োজনীয় নথির তালিকা জানাব।';

  @override
  String get visaHintDocumentsPending => 'ডকুমেন্টসে আপনার পাসপোর্ট ও মেডিকেল রিপোর্ট আপলোড করুন।';

  @override
  String get visaHintInvitationIssued => 'আপনার আমন্ত্রণপত্র প্রস্তুত। indianvisaonline.gov.in-এ আবেদন করুন।';

  @override
  String get visaHintApplied => 'আবেদন জমা হয়েছে। সিদ্ধান্তে সাধারণত 3-5 কার্যদিবস লাগে।';

  @override
  String get visaHintApproved => 'ভিসা অনুমোদিত হয়েছে। ভ্রমণের সময় একটি প্রিন্ট কপি সঙ্গে রাখুন।';

  @override
  String get visaHintRejected => 'আবেদনটি অনুমোদিত হয়নি। আপনার সমন্বয়কারী আপনার সাথে যোগাযোগ করবেন।';

  @override
  String visaApplicationRef(String ref) {
    return 'আবেদনের রেফারেন্স: $ref';
  }

  @override
  String get visaInvitationLetter => 'আমন্ত্রণপত্র';

  @override
  String get travelRouteArrow => ' → ';

  @override
  String flightPnr(String pnr) {
    return 'PNR $pnr';
  }

  @override
  String stayGuestCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count জন অতিথি', one: '$count জন অতিথি');
    return '$_temp0';
  }

  @override
  String stayConfirmationCode(String code) {
    return 'নিশ্চিতকরণ $code';
  }

  @override
  String get checklistTitle => 'আপনার চেকলিস্ট';

  @override
  String get tripsTodaySchedule => 'আজকের সময়সূচি';

  @override
  String get tripsQuickActions => 'দ্রুত অ্যাকশন';

  @override
  String get tripsUploadDocuments => 'ডকুমেন্ট আপলোড';

  @override
  String get tripsChatWithCoordinator => 'সমন্বয়কারীর\nসাথে চ্যাট';

  @override
  String get tripsEmergencyContacts => 'জরুরি\nযোগাযোগ';

  @override
  String get journeySectionTitle => 'আপনার যাত্রা';

  @override
  String get tripsTravelSubtitle => 'ভিসা, ফ্লাইট, এয়ারপোর্ট পিকআপ, থাকা, অনুবাদক';

  @override
  String get tripsSupportTitle => 'দেশের ভেতরে সহায়তা';

  @override
  String get tripsSupportSubtitle => 'ম্যাপ, সময়সূচি, হেল্পলাইন, অনুবাদক, SOS';

  @override
  String get tripsMyCases => 'আমার কেসসমূহ';

  @override
  String tripsActiveCases(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countটি সক্রিয় কেস',
      one: '$countটি সক্রিয় কেস',
    );
    return '$_temp0';
  }

  @override
  String tripsYourCoordinator(String name) {
    return 'আপনার সমন্বয়কারী: $name';
  }

  @override
  String get tripsMessageAnyTime => 'যেকোনো সময় বার্তা পাঠান';

  @override
  String tripsCountdownUnit(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'দিন', one: 'দিন');
    return '$_temp0';
  }

  @override
  String get tripsCountdownToday => 'আজ';

  @override
  String get tripsCountdownDone => 'সম্পন্ন';

  @override
  String get tripsCountdownNow => 'এখন';

  @override
  String get tripsTreatmentInProgress => 'চিকিৎসা চলছে';

  @override
  String get tripsUntilTreatment => 'চিকিৎসা শুরু হতে বাকি';

  @override
  String tripsDaysUntilTreatment(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'চিকিৎসা শুরু হতে $count দিন বাকি',
      one: 'চিকিৎসা শুরু হতে $count দিন বাকি',
    );
    return '$_temp0';
  }

  @override
  String get tripsPaymentNeeded => 'নিশ্চিত করতে পেমেন্ট প্রয়োজন';

  @override
  String get tripsBalanceDue => 'বাকি অর্থ';

  @override
  String get tripsPayNow => 'এখনই পেমেন্ট করুন';

  @override
  String get tripsNoTripTitle => 'এখনও কোনো আসন্ন চিকিৎসা নেই';

  @override
  String get tripsNoTripBody =>
      'বিনামূল্যে AI স্ক্রিনিংয়ের মাধ্যমে সঠিক হাসপাতাল খুঁজুন, অথবা শুরু করা কোনো কেস চালিয়ে যান।';

  @override
  String get travelSelect => 'বেছে নিন';

  @override
  String get visaAssistanceTitle => 'ভিসা সহায়তা';

  @override
  String get visaAssistanceSubtitle =>
      'আমরা হাসপাতালের আমন্ত্রণপত্র তৈরি করি এবং ভারতীয় e-Medical ভিসার আবেদনে আপনাকে গাইড করি।';

  @override
  String get visaForPatient => 'রোগী';

  @override
  String get visaForAttendant => 'সঙ্গী';

  @override
  String get visaNotesLabel => 'নোট (জাতীয়তা, ভ্রমণের তারিখ, সঙ্গী)';

  @override
  String get travelAirport => 'এয়ারপোর্ট';

  @override
  String travelCityAirport(String city) {
    return '$city এয়ারপোর্ট';
  }

  @override
  String get travelHospitalOrHotel => 'হাসপাতাল / হোটেল';

  @override
  String get flightRequestTitle => 'ফ্লাইটের অনুরোধ করুন';

  @override
  String get flightRequestSubtitle =>
      'আমাদের ট্রাভেল ডেস্ক আপনাকে ভাড়ার বিকল্প পাঠাবে; আপনি নিশ্চিত না করা পর্যন্ত কোনো চার্জ নেওয়া হবে না।';

  @override
  String get flightPreferredDeparture => 'পছন্দের প্রস্থানের তারিখ';

  @override
  String get travelPickupSubtitle =>
      'একজন ড্রাইভার অ্যারাইভালে আপনার সাথে দেখা করে আপনাকে হাসপাতাল বা হোটেলে নিয়ে যাবেন।';

  @override
  String get travelArrivalDateTime => 'আগমনের তারিখ ও সময়';

  @override
  String get travelDropSubtitle => 'আমরা আপনাকে বাড়ি ফেরার ফ্লাইটের জন্য এয়ারপোর্টে পৌঁছে দেব।';

  @override
  String get travelPickupTime => 'পিকআপের সময়';

  @override
  String get travelLocalTransport => 'স্থানীয় যাতায়াত';

  @override
  String get travelLocalTransportSubtitle => 'শহরের অ্যাপয়েন্টমেন্টের জন্য ড্রাইভারসহ গাড়ি।';

  @override
  String get travelStart => 'শুরু';

  @override
  String get travelSendRequest => 'অনুরোধ পাঠান';

  @override
  String get flightFromCityOrAirport => 'কোথা থেকে (শহর বা এয়ারপোর্ট)';

  @override
  String get travelFrom => 'কোথা থেকে';

  @override
  String get travelTo => 'কোথায়';

  @override
  String get flightNumberOptional => 'ফ্লাইট নম্বর (ঐচ্ছিক)';

  @override
  String get travelPassengers => 'যাত্রী';

  @override
  String get travelFewerPassengers => 'যাত্রী কমান';

  @override
  String get travelMorePassengers => 'যাত্রী বাড়ান';

  @override
  String get travelNotesLabel => 'নোট (হুইলচেয়ার, লাগেজ, পছন্দ)';

  @override
  String get staySheetSubtitle =>
      'আপনার হাসপাতালের কাছে থাকার জায়গা। বুকিংয়ের আগে আমাদের টিম প্রাপ্যতা ও মূল্য নিশ্চিত করবে।';

  @override
  String get stayNoPartners =>
      'এই হাসপাতালের জন্য এখনও কোনো পার্টনার থাকার জায়গা তালিকাভুক্ত নেই। মেসেজে আপনার সমন্বয়কারীকে জিজ্ঞাসা করুন।';

  @override
  String stayDistanceKm(String km) {
    return '$km কিমি';
  }

  @override
  String stayPerNight(String amount) {
    return '$amount/রাত';
  }

  @override
  String get stayCheckInOut => 'চেক-ইন - চেক-আউট';

  @override
  String get stayGuests => 'অতিথি';

  @override
  String get stayFewerGuests => 'অতিথি কমান';

  @override
  String get stayMoreGuests => 'অতিথি বাড়ান';

  @override
  String get stayNotesLabel => 'নোট (রুমের ধরন, প্রবেশযোগ্যতা, খাদ্যাভ্যাস)';

  @override
  String get travelTranslatorTitle => 'একজন অনুবাদক নিন';

  @override
  String get travelTranslatorSubtitle => 'পরামর্শ ও হাসপাতালে থাকার সময়ের জন্য একজন মেডিকেল দোভাষী।';

  @override
  String get travelTranslatorNotes => 'প্রয়োজনীয় ভাষা (যেমন আরবি, ফরাসি)';

  @override
  String get travelGuideTitle => 'স্থানীয় গাইড বুক করুন';

  @override
  String get travelGuideSubtitle =>
      'সুস্থ হওয়ার সময় কাজকর্ম, কেনাকাটা ও দর্শনীয় স্থান ঘোরার জন্য একজন বিশ্বস্ত গাইড।';

  @override
  String get travelGuideNotes => 'আপনি কী বিষয়ে সাহায্য চান?';

  @override
  String travelServiceRequestTitle(String service) {
    return '$service-এর অনুরোধ';
  }

  @override
  String get travelServiceSubtitle => 'আমাদের টিম আপনার সাথে বিস্তারিত ও মূল্য নিশ্চিত করবে।';

  @override
  String get travelNotes => 'নোট';

  @override
  String get travelWhenNeeded => 'কখন প্রয়োজন?';

  @override
  String get travelPreferredProvider => 'পছন্দের প্রদানকারী (ঐচ্ছিক)';

  @override
  String get travelAnyAvailable => 'যেকোনো উপলব্ধ';

  @override
  String get profileMyJourney => 'আমার যাত্রা';

  @override
  String get profileMyCasesQuotes => 'আমার কেস ও কোটেশন';

  @override
  String get profileDocuments => 'নথিপত্র';

  @override
  String get profileDocumentsSubtitle => 'পাসপোর্ট, মেডিকেল রিপোর্ট, ভিসা, ইনভয়েস';

  @override
  String get companionsTitle => 'ভ্রমণসঙ্গী';

  @override
  String get companionsSubtitleDefault => 'যাঁরা আপনার সঙ্গে ভ্রমণ করছেন';

  @override
  String get companionsSubtitleEmpty => 'আপনার সঙ্গে ভ্রমণকারীদের যোগ করুন';

  @override
  String get savedTitle => 'সংরক্ষিত';

  @override
  String get profileSavedSubtitle => 'হাসপাতাল, ডাক্তার ও চিকিৎসা';

  @override
  String get profileAbout => 'সম্পর্কে';

  @override
  String get profileTermsOfService => 'পরিষেবার শর্তাবলি';

  @override
  String get profilePrivacyPolicy => 'গোপনীয়তা নীতি';

  @override
  String get deleteAccountDoneSnack => 'আপনার অ্যাকাউন্ট মুছে ফেলা হয়েছে।';

  @override
  String get profileGuest => 'অতিথি';

  @override
  String get profilePatientBadge => 'রোগী';

  @override
  String get profileEmailVerified => 'ইমেল যাচাই করা হয়েছে';

  @override
  String get editProfileTitle => 'প্রোফাইল সম্পাদনা';

  @override
  String get profileGuestUpgradeTitle => 'আপনার বিনামূল্যের অ্যাকাউন্ট তৈরি করুন';

  @override
  String get profileGuestUpgradeBody =>
      'আপনার স্ক্রিনিং ও ম্যাচ সংরক্ষণ করুন, কোটেশন চান, চিকিৎসা বুক করুন, নথি আপলোড করুন এবং আপনার সমন্বয়কারীর সঙ্গে চ্যাট করুন।';

  @override
  String get profileCreateAccount => 'অ্যাকাউন্ট তৈরি করুন';

  @override
  String get authLogIn => 'লগ ইন';

  @override
  String get profilePersonalInfo => 'ব্যক্তিগত তথ্য';

  @override
  String profilePassportExpires(String date) {
    return 'মেয়াদ শেষ $date';
  }

  @override
  String get profileDateOfBirth => 'জন্মতারিখ';

  @override
  String get profileGender => 'লিঙ্গ';

  @override
  String get profileNationality => 'জাতীয়তা';

  @override
  String get profilePhone => 'ফোন';

  @override
  String get profilePassport => 'পাসপোর্ট';

  @override
  String get profilePassportValidityWarning =>
      'ই-মেডিকেল (e-Medical) ভিসার জন্য আবেদন করতে আপনার পাসপোর্টের মেয়াদ কমপক্ষে ৬ মাস থাকতে হবে।';

  @override
  String get profileEmergencyContact => 'জরুরি যোগাযোগ';

  @override
  String get profileBloodGroup => 'রক্তের গ্রুপ';

  @override
  String get profileNotSet => 'নির্ধারিত নয়';

  @override
  String get profileNotAdded => 'যোগ করা হয়নি';

  @override
  String profileClearField(String label) {
    return '$label মুছুন';
  }

  @override
  String get profileRelationship => 'সম্পর্ক';

  @override
  String get profileNewPassportNumber => 'নতুন পাসপোর্ট নম্বর';

  @override
  String get settingsPreferences => 'পছন্দসমূহ';

  @override
  String get settingsCurrency => 'মুদ্রা';

  @override
  String settingsCurrencySubtitle(String currency) {
    return 'মূল্য আনুমানিক হিসেবে $currency-এ দেখানো হয়';
  }

  @override
  String get settingsPreferredCurrency => 'পছন্দের মুদ্রা';

  @override
  String get settingsAppearance => 'থিম';

  @override
  String get settingsThemeDark => 'ডার্ক';

  @override
  String get settingsThemeLight => 'লাইট';

  @override
  String get settingsThemeSystem => 'ডিভাইসের মতো';

  @override
  String get settingsSecurity => 'নিরাপত্তা';

  @override
  String get accountVerifyEmail => 'আপনার ইমেল যাচাই করুন';

  @override
  String accountVerifyEmailSubtitle(String email) {
    return 'যাচাইকরণ লিংকের জন্য $email দেখুন';
  }

  @override
  String get accountVerificationSent => 'যাচাইকরণ ইমেল পাঠানো হয়েছে';

  @override
  String get accountResend => 'আবার পাঠান';

  @override
  String get accountYourData => 'আপনার তথ্য';

  @override
  String get accountYourDataSubtitle =>
      'চিকিৎসা-সংক্রান্ত তথ্য এনক্রিপ্ট করা থাকে এবং শুধু আপনার বেছে নেওয়া হাসপাতালের সঙ্গে শেয়ার করা হয়।';

  @override
  String get accountExitGuestTitle => 'অতিথি মোড থেকে বের হবেন?';

  @override
  String get accountLogOutTitle => 'লগ আউট করবেন?';

  @override
  String get accountExitGuestBody => 'প্রথমে অ্যাকাউন্ট তৈরি না করলে অতিথি হিসেবে করা আপনার স্ক্রিনিং হারিয়ে যাবে।';

  @override
  String get accountLogOutBody => 'আপনার ইমেল ও পাসওয়ার্ড দিয়ে যেকোনো সময় আবার লগ ইন করতে পারবেন।';

  @override
  String get accountExit => 'বের হন';

  @override
  String get accountExitGuestMode => 'অতিথি মোড থেকে বের হন';

  @override
  String get companionsRemoveTitle => 'সঙ্গীকে সরাবেন?';

  @override
  String companionsRemoveBody(String name) {
    return '$name-কে আপনার ভ্রমণসঙ্গীদের তালিকা থেকে সরানো হবে।';
  }

  @override
  String get companionsRemovedSnack => 'সঙ্গীকে সরানো হয়েছে';

  @override
  String companionsAddedSnack(String name) {
    return '$name যোগ করা হয়েছে';
  }

  @override
  String get companionAdd => 'সঙ্গী যোগ করুন';

  @override
  String get companionsEmptyTitle => 'এখনও কোনো সঙ্গী নেই';

  @override
  String get companionsEmptyMessage =>
      'আপনার সঙ্গে ভ্রমণকারী পরিবারের সদস্য বা বন্ধুকে যোগ করুন, যাতে আমরা তাঁর অ্যাটেনডেন্ট ভিসার ব্যবস্থা করতে পারি।';

  @override
  String companionsBorn(String date) {
    return 'জন্ম $date';
  }

  @override
  String companionsPassportLast4(String last4) {
    return 'পাসপোর্ট •••• $last4';
  }

  @override
  String companionsEditTooltip(String name) {
    return '$name সম্পাদনা করুন';
  }

  @override
  String companionsRemoveTooltip(String name) {
    return '$name-কে সরান';
  }

  @override
  String get companionEditTitle => 'সঙ্গীর তথ্য সম্পাদনা';

  @override
  String get companionFormIntro =>
      'সঙ্গীরা মেডিকেল অ্যাটেনডেন্ট হিসেবে আপনার সঙ্গে ভ্রমণ করেন এবং তাঁদের নিজস্ব ভিসা লাগে।';

  @override
  String get companionFullNameRequired => 'পুরো নাম লিখুন';

  @override
  String get companionFullNameLabel => 'পুরো নাম (পাসপোর্ট অনুযায়ী)';

  @override
  String get companionRelationshipRequired => 'সম্পর্ক বেছে নিন';

  @override
  String get companionRelationshipSpouse => 'স্বামী/স্ত্রী';

  @override
  String get companionRelationshipParent => 'মা/বাবা';

  @override
  String get companionRelationshipChild => 'সন্তান';

  @override
  String get companionRelationshipSibling => 'ভাই/বোন';

  @override
  String get companionRelationshipRelative => 'আত্মীয়';

  @override
  String get companionRelationshipFriend => 'বন্ধু';

  @override
  String get companionRelationshipCaregiver => 'পরিচর্যাকারী';

  @override
  String get companionPassportInvalid => 'সঠিক পাসপোর্ট নম্বর লিখুন';

  @override
  String get companionPassportOptional => 'পাসপোর্ট নম্বর (ঐচ্ছিক)';

  @override
  String get companionPassportStoredEncrypted => 'এনক্রিপ্ট করে সংরক্ষিত';

  @override
  String companionPassportCurrent(String last4) {
    return 'বর্তমান: •••• $last4 - রাখতে চাইলে ফাঁকা রাখুন';
  }

  @override
  String get companionSave => 'সঙ্গী সংরক্ষণ করুন';

  @override
  String get editProfileEcNameRequired => 'নাম যোগ করুন অথবা জরুরি যোগাযোগ মুছে দিন';

  @override
  String get editProfileEcRelationshipRequired => 'সম্পর্ক যোগ করুন অথবা জরুরি যোগাযোগ মুছে দিন';

  @override
  String get editProfileEcPhoneRequired => 'ফোন নম্বর যোগ করুন অথবা জরুরি যোগাযোগ মুছে দিন';

  @override
  String get editProfileFixFields => 'চিহ্নিত ঘরগুলো ঠিক করুন।';

  @override
  String get editProfileSaved => 'প্রোফাইল সংরক্ষিত হয়েছে';

  @override
  String get editProfilePersonalDetails => 'ব্যক্তিগত বিবরণ';

  @override
  String get editProfileFirstName => 'নামের প্রথম অংশ';

  @override
  String get editProfileLastName => 'পদবি';

  @override
  String get editProfileCountryOfResidence => 'বসবাসের দেশ';

  @override
  String get editProfilePassportSubtitle => 'আপনার মেডিকেল ভিসার আমন্ত্রণপত্রের জন্য প্রয়োজন';

  @override
  String get editProfilePassportInvalid => '৫-২০টি বর্ণ বা সংখ্যা ব্যবহার করুন';

  @override
  String get editProfilePassportNumber => 'পাসপোর্ট নম্বর';

  @override
  String get editProfilePassportHelperNew => 'এনক্রিপ্ট করে সংরক্ষিত। শুধু শেষ ৪টি সংখ্যা দেখানো হয়।';

  @override
  String editProfilePassportOnFile(String masked) {
    return 'সংরক্ষিত: $masked। রাখতে চাইলে ফাঁকা রাখুন।';
  }

  @override
  String get editProfilePassportExpiry => 'পাসপোর্টের মেয়াদ শেষের তারিখ';

  @override
  String get editProfileName => 'নাম';

  @override
  String get editProfileMedicalInfo => 'চিকিৎসা-সংক্রান্ত তথ্য';

  @override
  String get editProfileMedicalInfoSubtitle => 'শুধু যে হাসপাতালগুলোর কাছে আপনি কোটেশন চান তাদের সঙ্গে শেয়ার করা হয়';

  @override
  String get editProfileAllergies => 'অ্যালার্জি';

  @override
  String get editProfileMedicalHistory => 'চিকিৎসার ইতিহাস';

  @override
  String get editProfileInsurance => 'বিমা';

  @override
  String get editProfileInsuranceProvider => 'বিমা প্রদানকারী';

  @override
  String get editProfilePolicyNumber => 'পলিসি নম্বর';

  @override
  String get editProfileNewPolicyNumber => 'নতুন পলিসি নম্বর';

  @override
  String editProfilePolicyOnFile(String last4) {
    return 'সংরক্ষিত: •••• $last4। রাখতে চাইলে ফাঁকা রাখুন।';
  }

  @override
  String get editProfileSaveChanges => 'পরিবর্তন সংরক্ষণ করুন';

  @override
  String get savedEmptyTitle => 'এখনও কিছু সংরক্ষণ করা হয়নি';

  @override
  String get savedEmptyMessage => 'কোনো হাসপাতাল, ডাক্তার বা চিকিৎসার বুকমার্কে ট্যাপ করুন, সেটি এখানে থাকবে।';

  @override
  String get savedExploreHospitals => 'হাসপাতাল দেখুন';

  @override
  String savedFilterAll(int count) {
    return 'সব ($count)';
  }

  @override
  String savedFilterType(String type, int count) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'হাসপাতাল ($count)',
      'doctor': 'ডাক্তার ($count)',
      'procedure': 'চিকিৎসা পদ্ধতি ($count)',
      'other': 'অন্যান্য ($count)',
    });
    return '$_temp0';
  }

  @override
  String get savedEmptyCategory => 'এই বিভাগে কিছু সংরক্ষণ করা হয়নি';

  @override
  String savedNoLongerAvailable(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'এই হাসপাতালটি আর উপলব্ধ নেই',
      'doctor': 'এই ডাক্তার আর উপলব্ধ নেই',
      'procedure': 'এই চিকিৎসা পদ্ধতিটি আর উপলব্ধ নেই',
      'other': 'এটি আর উপলব্ধ নেই',
    });
    return '$_temp0';
  }

  @override
  String get passwordChangeTitle => 'পাসওয়ার্ড পরিবর্তন করুন';

  @override
  String get passwordUpdatedSnack => 'পাসওয়ার্ড আপডেট হয়েছে। অন্যান্য ডিভাইস থেকে সাইন আউট করা হয়েছে।';

  @override
  String get passwordCurrent => 'বর্তমান পাসওয়ার্ড';

  @override
  String get passwordCurrentHelper => 'Google দিয়ে সাইন আপ করে থাকলে এবং কখনও পাসওয়ার্ড সেট না করলে ফাঁকা রাখুন';

  @override
  String get passwordNew => 'নতুন পাসওয়ার্ড';

  @override
  String get passwordMustDiffer => 'বর্তমান পাসওয়ার্ড থেকে ভিন্ন একটি পাসওয়ার্ড বেছে নিন';

  @override
  String passwordPolicyHelper(int min) {
    return 'কমপক্ষে $minটি অক্ষর, যার মধ্যে একটি বর্ণ ও একটি সংখ্যা';
  }

  @override
  String get passwordConfirmNew => 'নতুন পাসওয়ার্ড নিশ্চিত করুন';

  @override
  String get passwordMismatch => 'পাসওয়ার্ড মিলছে না';

  @override
  String get passwordUpdateButton => 'পাসওয়ার্ড আপডেট করুন';

  @override
  String get deleteAccountGuestBody => 'এতে আপনার অতিথি অ্যাকাউন্ট, স্ক্রিনিং ও সংরক্ষিত আইটেম স্থায়ীভাবে মুছে যাবে।';

  @override
  String get deleteAccountBody =>
      'এতে আপনার অ্যাকাউন্ট, প্রোফাইল, সঙ্গী, সংরক্ষিত আইটেম ও আপলোড করা নথি স্থায়ীভাবে মুছে যাবে এবং সব ডিভাইস থেকে আপনাকে সাইন আউট করা হবে। এটি আর ফেরানো যাবে না।';

  @override
  String get deleteAccountRetention =>
      'আইন অনুযায়ী যে রেকর্ড আমাদের রাখতে হয় (ইনভয়েস, পেমেন্ট, রিফান্ড ও হাসপাতালের চিকিৎসার রেকর্ড) সেগুলো আইনি সংরক্ষণকাল পর্যন্ত সীমিত অ্যাক্সেসে রাখা হয়, তারপর মুছে ফেলা হয়। চালু বুকিং বা অপেক্ষমাণ পেমেন্ট আগে নিষ্পত্তি বা বাতিল করতে হতে পারে।';

  @override
  String get deleteAccountPasswordLabel => 'পাসওয়ার্ড';

  @override
  String get deleteAccountPasswordHelper =>
      'Google বা Apple দিয়ে সাইন ইন করে থাকলে এবং কখনও পাসওয়ার্ড সেট না করলে ফাঁকা রাখুন';

  @override
  String get deleteAccountOtpLabel => 'অথেন্টিকেটর কোড';

  @override
  String get deleteAccountOtpHelper => 'আপনার অথেন্টিকেটর অ্যাপের ৬ সংখ্যার কোড';

  @override
  String get deleteAccountReasonLabel => 'কেন চলে যাচ্ছেন? (ঐচ্ছিক)';

  @override
  String deleteAccountConfirmLabel(String word) {
    return 'নিশ্চিত করতে $word লিখুন';
  }

  @override
  String get deleteAccountSubmit => 'আমার অ্যাকাউন্ট স্থায়ীভাবে মুছুন';

  @override
  String get deleteAccountBlockerActiveCases => 'চলমান কেস';

  @override
  String get deleteAccountBlockerActiveBookings => 'আসন্ন বা চলমান বুকিং';

  @override
  String get deleteAccountBlockerPendingPayments => 'চলমান পেমেন্ট';

  @override
  String get deleteAccountBlockerHospitalsOwned => 'আপনার মালিকানাধীন তালিকাভুক্ত হাসপাতাল';

  @override
  String get deleteAccountBlockersTitle => 'এগুলো আগে বন্ধ করতে হবে';

  @override
  String get deleteAccountRequestSent =>
      'মুছে ফেলার অনুরোধ পাঠানো হয়েছে। এগুলো নিষ্পত্তি হলে আমাদের সাপোর্ট টিম আপনার অ্যাকাউন্ট বন্ধ করবে এবং ইমেলে নিশ্চিত করবে।';

  @override
  String get deleteAccountRequestButton => 'মুছে ফেলার অনুরোধ করুন';

  @override
  String get forgotPasswordInvalidCode => 'এই রিসেট কোডটি সঠিক নয় বা এর মেয়াদ শেষ হয়ে গেছে। নতুন একটি চান।';

  @override
  String get forgotPasswordSetNewTitle => 'নতুন পাসওয়ার্ড সেট করুন';

  @override
  String get forgotPasswordTitle => 'পাসওয়ার্ড রিসেট করুন';

  @override
  String get forgotPasswordIntro =>
      'যে ইমেল দিয়ে নিবন্ধন করেছেন সেটি লিখুন, আমরা পাসওয়ার্ড রিসেট করার একটি লিংক পাঠাব।';

  @override
  String get forgotPasswordEmailLabel => 'ইমেল';

  @override
  String get forgotPasswordSendLink => 'রিসেট লিংক পাঠান';

  @override
  String get forgotPasswordHaveCode => 'আমার কাছে ইতিমধ্যে রিসেট কোড আছে';

  @override
  String get forgotPasswordCheckInbox => 'আপনার ইনবক্স দেখুন';

  @override
  String forgotPasswordSentBody(String email) {
    return '$email-এর জন্য কোনো অ্যাকাউন্ট থাকলে আমরা পাসওয়ার্ড রিসেট লিংক পাঠিয়েছি। পৌঁছাতে কয়েক মিনিট লাগতে পারে - স্প্যাম ফোল্ডারও দেখুন।';
  }

  @override
  String get forgotPasswordEnterCode => 'রিসেট কোড লিখুন';

  @override
  String get forgotPasswordBackToLogin => 'লগ ইনে ফিরে যান';

  @override
  String get forgotPasswordResetIntro =>
      'আমাদের পাঠানো ইমেল থেকে রিসেট কোড পেস্ট করুন, তারপর নতুন পাসওয়ার্ড বেছে নিন।';

  @override
  String get forgotPasswordPasteFullCode => 'পুরো রিসেট কোড পেস্ট করুন';

  @override
  String get forgotPasswordCodeLabel => 'রিসেট কোড';

  @override
  String get forgotPasswordRequestNewLink => 'নতুন লিংক চান';

  @override
  String get forgotPasswordUpdatedTitle => 'পাসওয়ার্ড আপডেট হয়েছে';

  @override
  String get forgotPasswordUpdatedBody => 'এখন নতুন পাসওয়ার্ড দিয়ে লগ ইন করতে পারবেন।';

  @override
  String get validationEnterEmail => 'আপনার ইমেল লিখুন';

  @override
  String get validationInvalidEmail => 'সঠিক ইমেল ঠিকানা লিখুন';

  @override
  String get validationEnterPassword => 'আপনার পাসওয়ার্ড লিখুন';

  @override
  String get validationChoosePassword => 'একটি পাসওয়ার্ড বেছে নিন';

  @override
  String validationPasswordTooShort(int min) {
    return 'কমপক্ষে $minটি অক্ষর ব্যবহার করুন';
  }

  @override
  String validationPasswordTooLong(int max) {
    return 'সর্বোচ্চ $maxটি অক্ষর ব্যবহার করুন';
  }

  @override
  String get validationPasswordLetterDigit => 'অন্তত একটি বর্ণ ও একটি সংখ্যা রাখুন';

  @override
  String get validationEnterFullName => 'আপনার পুরো নাম লিখুন';

  @override
  String get validationNameTooLong => 'নামটি অনেক বড়';

  @override
  String get validationInvalidPhone => 'সঠিক ফোন নম্বর লিখুন';

  @override
  String get validationEnterOtp => '৬ সংখ্যার কোড লিখুন';

  @override
  String get countryAF => 'আফগানিস্তান';

  @override
  String get countryDZ => 'আলজেরিয়া';

  @override
  String get countryAO => 'অ্যাঙ্গোলা';

  @override
  String get countryAR => 'আর্জেন্টিনা';

  @override
  String get countryAM => 'আর্মেনিয়া';

  @override
  String get countryAU => 'অস্ট্রেলিয়া';

  @override
  String get countryAT => 'অস্ট্রিয়া';

  @override
  String get countryAZ => 'আজারবাইজান';

  @override
  String get countryBH => 'বাহরাইন';

  @override
  String get countryBD => 'বাংলাদেশ';

  @override
  String get countryBY => 'বেলারুশ';

  @override
  String get countryBE => 'বেলজিয়াম';

  @override
  String get countryBT => 'ভুটান';

  @override
  String get countryBW => 'বতসোয়ানা';

  @override
  String get countryBR => 'ব্রাজিল';

  @override
  String get countryBN => 'ব্রুনাই';

  @override
  String get countryBG => 'বুলগেরিয়া';

  @override
  String get countryBI => 'বুরুন্ডি';

  @override
  String get countryKH => 'কম্বোডিয়া';

  @override
  String get countryCM => 'ক্যামেরুন';

  @override
  String get countryCA => 'কানাডা';

  @override
  String get countryTD => 'চাদ';

  @override
  String get countryCL => 'চিলি';

  @override
  String get countryCN => 'চীন';

  @override
  String get countryCO => 'কলম্বিয়া';

  @override
  String get countryCD => 'কঙ্গো (ডিআরসি)';

  @override
  String get countryCI => 'কোত দিভোয়ার';

  @override
  String get countryHR => 'ক্রোয়েশিয়া';

  @override
  String get countryCY => 'সাইপ্রাস';

  @override
  String get countryCZ => 'চেকিয়া';

  @override
  String get countryDK => 'ডেনমার্ক';

  @override
  String get countryDJ => 'জিবুতি';

  @override
  String get countryEG => 'মিশর';

  @override
  String get countryER => 'ইরিত্রিয়া';

  @override
  String get countryEE => 'এস্তোনিয়া';

  @override
  String get countryET => 'ইথিওপিয়া';

  @override
  String get countryFJ => 'ফিজি';

  @override
  String get countryFI => 'ফিনল্যান্ড';

  @override
  String get countryFR => 'ফ্রান্স';

  @override
  String get countryGA => 'গ্যাবন';

  @override
  String get countryGM => 'গাম্বিয়া';

  @override
  String get countryGE => 'জর্জিয়া';

  @override
  String get countryDE => 'জার্মানি';

  @override
  String get countryGH => 'ঘানা';

  @override
  String get countryGR => 'গ্রিস';

  @override
  String get countryGN => 'গিনি';

  @override
  String get countryGY => 'গায়ানা';

  @override
  String get countryHK => 'হংকং';

  @override
  String get countryHU => 'হাঙ্গেরি';

  @override
  String get countryIS => 'আইসল্যান্ড';

  @override
  String get countryIN => 'ভারত';

  @override
  String get countryID => 'ইন্দোনেশিয়া';

  @override
  String get countryIR => 'ইরান';

  @override
  String get countryIQ => 'ইরাক';

  @override
  String get countryIE => 'আয়ারল্যান্ড';

  @override
  String get countryIL => 'ইসরায়েল';

  @override
  String get countryIT => 'ইতালি';

  @override
  String get countryJM => 'জ্যামাইকা';

  @override
  String get countryJP => 'জাপান';

  @override
  String get countryJO => 'জর্ডান';

  @override
  String get countryKZ => 'কাজাখস্তান';

  @override
  String get countryKE => 'কেনিয়া';

  @override
  String get countryKW => 'কুয়েত';

  @override
  String get countryKG => 'কিরগিজস্তান';

  @override
  String get countryLA => 'লাওস';

  @override
  String get countryLV => 'লাটভিয়া';

  @override
  String get countryLB => 'লেবানন';

  @override
  String get countryLS => 'লেসোথো';

  @override
  String get countryLR => 'লাইবেরিয়া';

  @override
  String get countryLY => 'লিবিয়া';

  @override
  String get countryLT => 'লিথুয়ানিয়া';

  @override
  String get countryLU => 'লুক্সেমবার্গ';

  @override
  String get countryMG => 'মাদাগাস্কার';

  @override
  String get countryMW => 'মালাউই';

  @override
  String get countryMY => 'মালয়েশিয়া';

  @override
  String get countryMV => 'মালদ্বীপ';

  @override
  String get countryML => 'মালি';

  @override
  String get countryMT => 'মাল্টা';

  @override
  String get countryMR => 'মৌরিতানিয়া';

  @override
  String get countryMU => 'মরিশাস';

  @override
  String get countryMX => 'মেক্সিকো';

  @override
  String get countryMD => 'মলদোভা';

  @override
  String get countryMN => 'মঙ্গোলিয়া';

  @override
  String get countryMA => 'মরক্কো';

  @override
  String get countryMZ => 'মোজাম্বিক';

  @override
  String get countryMM => 'মিয়ানমার';

  @override
  String get countryNA => 'নামিবিয়া';

  @override
  String get countryNP => 'নেপাল';

  @override
  String get countryNL => 'নেদারল্যান্ডস';

  @override
  String get countryNZ => 'নিউজিল্যান্ড';

  @override
  String get countryNE => 'নাইজার';

  @override
  String get countryNG => 'নাইজেরিয়া';

  @override
  String get countryNO => 'নরওয়ে';

  @override
  String get countryOM => 'ওমান';

  @override
  String get countryPK => 'পাকিস্তান';

  @override
  String get countryPS => 'ফিলিস্তিন';

  @override
  String get countryPA => 'পানামা';

  @override
  String get countryPG => 'পাপুয়া নিউ গিনি';

  @override
  String get countryPE => 'পেরু';

  @override
  String get countryPH => 'ফিলিপাইন';

  @override
  String get countryPL => 'পোল্যান্ড';

  @override
  String get countryPT => 'পর্তুগাল';

  @override
  String get countryQA => 'কাতার';

  @override
  String get countryRO => 'রোমানিয়া';

  @override
  String get countryRU => 'রাশিয়া';

  @override
  String get countryRW => 'রুয়ান্ডা';

  @override
  String get countrySA => 'সৌদি আরব';

  @override
  String get countrySN => 'সেনেগাল';

  @override
  String get countryRS => 'সার্বিয়া';

  @override
  String get countrySC => 'সেশেলস';

  @override
  String get countrySL => 'সিয়েরা লিওন';

  @override
  String get countrySG => 'সিঙ্গাপুর';

  @override
  String get countrySK => 'স্লোভাকিয়া';

  @override
  String get countrySI => 'স্লোভেনিয়া';

  @override
  String get countrySO => 'সোমালিয়া';

  @override
  String get countryZA => 'দক্ষিণ আফ্রিকা';

  @override
  String get countryKR => 'দক্ষিণ কোরিয়া';

  @override
  String get countrySS => 'দক্ষিণ সুদান';

  @override
  String get countryES => 'স্পেন';

  @override
  String get countryLK => 'শ্রীলঙ্কা';

  @override
  String get countrySD => 'সুদান';

  @override
  String get countrySR => 'সুরিনাম';

  @override
  String get countrySE => 'সুইডেন';

  @override
  String get countryCH => 'সুইজারল্যান্ড';

  @override
  String get countrySY => 'সিরিয়া';

  @override
  String get countryTW => 'তাইওয়ান';

  @override
  String get countryTJ => 'তাজিকিস্তান';

  @override
  String get countryTZ => 'তানজানিয়া';

  @override
  String get countryTH => 'থাইল্যান্ড';

  @override
  String get countryTG => 'টোগো';

  @override
  String get countryTT => 'ত্রিনিদাদ ও টোবাগো';

  @override
  String get countryTN => 'তিউনিসিয়া';

  @override
  String get countryTR => 'তুরস্ক';

  @override
  String get countryTM => 'তুর্কমেনিস্তান';

  @override
  String get countryUG => 'উগান্ডা';

  @override
  String get countryUA => 'ইউক্রেন';

  @override
  String get countryAE => 'সংযুক্ত আরব আমিরাত';

  @override
  String get countryGB => 'যুক্তরাজ্য';

  @override
  String get countryUS => 'মার্কিন যুক্তরাষ্ট্র';

  @override
  String get countryUY => 'উরুগুয়ে';

  @override
  String get countryUZ => 'উজবেকিস্তান';

  @override
  String get countryVE => 'ভেনেজুয়েলা';

  @override
  String get countryVN => 'ভিয়েতনাম';

  @override
  String get countryYE => 'ইয়েমেন';

  @override
  String get countryZM => 'জাম্বিয়া';

  @override
  String get countryZW => 'জিম্বাবুয়ে';

  @override
  String get agentTabDashboard => 'ড্যাশবোর্ড';

  @override
  String get agentTabPatients => 'রোগী';

  @override
  String get agentTabCases => 'কেস';

  @override
  String get agentTabBookings => 'বুকিং';

  @override
  String get agentTabEarnings => 'আয়';

  @override
  String get portalNoActivityYet => 'এখনও কোনো কার্যকলাপ নেই';

  @override
  String get portalPatientLabel => 'রোগী';

  @override
  String get portalHospitalLabel => 'হাসপাতাল';

  @override
  String get portalDoctorLabel => 'ডাক্তার';

  @override
  String get portalBookingLabel => 'বুকিং';

  @override
  String portalCaseOpened(String when) {
    return 'খোলা হয়েছে $when';
  }

  @override
  String get portalTotal => 'মোট';

  @override
  String portalQuoteStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিনের অবস্থান');
    return '$_temp0';
  }

  @override
  String portalQuoteValidUntil(String date) {
    return '$date পর্যন্ত বৈধ';
  }

  @override
  String portalQuotePreparedBy(String name) {
    return 'প্রস্তুতকারী: $name';
  }

  @override
  String get portalFilterAll => 'সব';

  @override
  String get portalAccountDeleted => 'আপনার অ্যাকাউন্ট মুছে ফেলা হয়েছে।';

  @override
  String get payeeStatusPending => 'অপেক্ষমাণ';

  @override
  String get payeeStatusEligible => 'পরিশোধযোগ্য';

  @override
  String get payeeStatusOnHold => 'স্থগিত';

  @override
  String get payeeStatusBatched => 'ব্যাচভুক্ত';

  @override
  String get payeeStatusPaid => 'পরিশোধিত';

  @override
  String get payeeStatusReversed => 'বাতিল (ফেরত)';

  @override
  String get payeeStatusQueued => 'সারিতে';

  @override
  String get payeeStatusProcessing => 'প্রক্রিয়াধীন';

  @override
  String get payeeStatusProcessed => 'প্রক্রিয়া সম্পন্ন';

  @override
  String get payeeStatusFailed => 'ব্যর্থ';

  @override
  String get payeeStatusNeedsReconciliation => 'মিলিয়ে দেখা প্রয়োজন';

  @override
  String get payeeSettlementsTab => 'সেটেলমেন্ট';

  @override
  String get payeePayoutsTab => 'পেআউট';

  @override
  String get payeeStatementTab => 'স্টেটমেন্ট';

  @override
  String get payeeItemsEmpty => 'এখানে এখনও কিছু নেই';

  @override
  String get payeePayoutsEmpty => 'এখনও কোনো পেআউট নেই';

  @override
  String payeePayoutUtr(String utr) {
    return 'UTR $utr';
  }

  @override
  String get payeeMethodManualBankTransfer => 'ম্যানুয়াল ব্যাংক ট্রান্সফার';

  @override
  String get payeeStatementTwelveMonths => '12 মাস';

  @override
  String payeeStatementDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন');
    return '$_temp0';
  }

  @override
  String get payeeStatementPeriod => 'সময়কাল';

  @override
  String payeeStatementPeriodRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get payeeOpeningBalance => 'প্রারম্ভিক ব্যালেন্স';

  @override
  String get payeeEarned => 'আয়';

  @override
  String get payeePaidOut => 'পরিশোধিত';

  @override
  String get payeeClosingBalance => 'সমাপনী ব্যালেন্স';

  @override
  String get payeeStatementEmpty => 'এই সময়কালে কোনো লেনদেন নেই';

  @override
  String payeeStatementBalance(String amount) {
    return 'ব্যালেন্স $amount';
  }

  @override
  String get payeePaidToDate => 'এ পর্যন্ত পরিশোধিত';

  @override
  String payeeOutstanding(String amount) {
    return 'বকেয়া $amount';
  }

  @override
  String payeeNextPayout(String date) {
    return 'পরবর্তী পেআউট $date';
  }

  @override
  String get payeeKpiPending => 'অপেক্ষমাণ';

  @override
  String get payeeKpiEligible => 'পেআউটের যোগ্য';

  @override
  String get payeeKpiOnHold => 'স্থগিত';

  @override
  String get payeeKpiBatched => 'পেআউট ব্যাচে';

  @override
  String payeeItemGrossFee(String gross, String fee) {
    return 'মোট $gross · ফি $fee';
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
    return 'স্থগিত: $reason';
  }

  @override
  String payeeItemEligibleOn(String date) {
    return '$date থেকে যোগ্য';
  }

  @override
  String get commissionTitle => 'কমিশন';

  @override
  String commissionRateBadge(String rate) {
    return '$rate হার';
  }

  @override
  String get commissionKpiPending => 'অপেক্ষমাণ কমিশন';

  @override
  String get commissionKpiPaid => 'পরিশোধিত কমিশন';

  @override
  String get commissionByMonth => 'মাসভিত্তিক কমিশন';

  @override
  String get kycBannerNotSubmitted => 'কমিশন আয় শুরু করতে এজেন্ট ওয়েব পোর্টালে আপনার KYC নথি জমা দিন।';

  @override
  String get kycBannerPending => 'আপনার KYC পর্যালোচনাধীন। এর মধ্যে আপনি রোগী যোগ করতে পারেন।';

  @override
  String get kycBannerRejected => 'KYC প্রত্যাখ্যাত';

  @override
  String kycBannerRejectedWithReason(String reason) {
    return 'KYC প্রত্যাখ্যাত: $reason';
  }

  @override
  String agentAccountStatusBanner(String status) {
    return 'আপনার এজেন্সি অ্যাকাউন্টের অবস্থা: $status।';
  }

  @override
  String get agentDashboardTitle => 'এজেন্ট ড্যাশবোর্ড';

  @override
  String agentDashboardGreeting(String name) {
    return 'হ্যালো, $name';
  }

  @override
  String get agentKpiPatients => 'রোগী';

  @override
  String get agentKpiActiveCases => 'সক্রিয় কেস';

  @override
  String get agentKpiConfirmedBookings => 'নিশ্চিত বুকিং';

  @override
  String get agentKpiConversion => 'রূপান্তর হার';

  @override
  String get agentQuickActions => 'দ্রুত কাজ';

  @override
  String get agentAddPatient => 'রোগী যোগ করুন';

  @override
  String get agentRunScreening => 'স্ক্রিনিং করুন';

  @override
  String get agentCasesByMonth => 'মাসভিত্তিক কেস';

  @override
  String get agentRecentCases => 'সাম্প্রতিক কেস';

  @override
  String get agentAllCases => 'সব কেস';

  @override
  String get agentDashboardNoCases => 'এখনও কোনো কেস নেই';

  @override
  String get agentDashboardNoCasesHint => 'একজন রোগী যোগ করুন, স্ক্রিনিং করুন এবং হাসপাতাল থেকে কোটেশন চান।';

  @override
  String agentReferralCode(String code) {
    return 'আপনার এজেন্ট কোড $code';
  }

  @override
  String get agentCopyReferralLink => 'রেফারেল লিংক কপি করুন';

  @override
  String get agentReferralLinkCopied => 'রেফারেল লিংক কপি হয়েছে';

  @override
  String get agentPatientsTitle => 'আমার রোগীরা';

  @override
  String get agentPatientsSearchHint => 'রোগী খুঁজুন';

  @override
  String get agentPatientsEmpty => 'এখনও কোনো রোগী নেই';

  @override
  String agentPatientsNoMatch(String query) {
    return '\"$query\"-এর সাথে মেলে এমন কোনো রোগী নেই';
  }

  @override
  String get agentPatientsEmptyHint => 'স্ক্রিনিং করতে এবং হাসপাতালের কোটেশন চাইতে একজন রোগী যোগ করুন।';

  @override
  String agentPatientAgeYears(int age) {
    String _temp0 = intl.Intl.pluralLogic(age, locale: localeName, other: '$age বছর');
    return '$_temp0';
  }

  @override
  String agentPatientCasesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countটি কেস');
    return '$_temp0';
  }

  @override
  String agentPatientScreeningsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countটি স্ক্রিনিং');
    return '$_temp0';
  }

  @override
  String get agentPatientManaged => 'পরিচালিত';

  @override
  String get agentPatientUpdated => 'রোগীর তথ্য হালনাগাদ হয়েছে';

  @override
  String get agentPatientAdded => 'রোগী যোগ করা হয়েছে';

  @override
  String get agentFormRequired => 'আবশ্যক';

  @override
  String get agentEditPatient => 'রোগীর তথ্য সম্পাদনা';

  @override
  String get agentPatientFirstName => 'নামের প্রথম অংশ';

  @override
  String get agentPatientLastName => 'নামের শেষ অংশ';

  @override
  String get agentPatientNationalityLabel => 'জাতীয়তা (ISO কোড, যেমন NG, AE, US)';

  @override
  String get agentPatientNationalityInvalid => '2 অক্ষরের দেশের কোড লিখুন';

  @override
  String get agentPatientEmailOptional => 'ই-মেইল (ঐচ্ছিক)';

  @override
  String get agentPatientEmailHelper => 'রোগী তার অ্যাকাউন্ট সক্রিয় করার জন্য একটি আমন্ত্রণ পাবেন।';

  @override
  String get agentPatientEmailInvalid => 'অবৈধ ই-মেইল';

  @override
  String get agentPatientPhoneOptional => 'ফোন (ঐচ্ছিক)';

  @override
  String get agentPatientDobOptional => 'জন্ম তারিখ (ঐচ্ছিক)';

  @override
  String get agentPatientMedicalHistoryOptional => 'চিকিৎসার ইতিহাস (ঐচ্ছিক)';

  @override
  String get agentPatientTravelMedicalSection => 'ভ্রমণ ও চিকিৎসা সংক্রান্ত তথ্য';

  @override
  String get agentPatientPassportNumber => 'পাসপোর্ট নম্বর';

  @override
  String get agentPatientPassportKeepHelper => 'সংরক্ষিত পাসপোর্ট রাখতে খালি রাখুন।';

  @override
  String get agentPatientPassportExpiry => 'পাসপোর্টের মেয়াদ শেষের তারিখ';

  @override
  String agentPatientPassportExpires(String date) {
    return 'পাসপোর্টের মেয়াদ শেষ $date';
  }

  @override
  String get agentPatientBloodGroup => 'রক্তের গ্রুপ';

  @override
  String get agentPatientAllergies => 'অ্যালার্জি';

  @override
  String get agentSaveChanges => 'পরিবর্তন সংরক্ষণ করুন';

  @override
  String get agentRequestQuote => 'কোটেশন চান';

  @override
  String get agentPatientAccountActivated => 'অ্যাকাউন্ট সক্রিয়';

  @override
  String get agentPatientInvitePending => 'আপনার পরিচালনায় · আমন্ত্রণ অপেক্ষমাণ';

  @override
  String get agentPatientNationality => 'জাতীয়তা';

  @override
  String get agentPatientDob => 'জন্ম তারিখ';

  @override
  String agentPatientDobWithAge(String date, int age) {
    return '$date ($age বছর)';
  }

  @override
  String get agentPatientGender => 'লিঙ্গ';

  @override
  String get agentPatientEmail => 'ই-মেইল';

  @override
  String get agentPatientPhone => 'ফোন';

  @override
  String get agentPatientPassport => 'পাসপোর্ট';

  @override
  String agentPatientPassportExpShort(String date) {
    return 'মেয়াদ $date';
  }

  @override
  String get agentPatientMedicalHistory => 'চিকিৎসার ইতিহাস';

  @override
  String get agentScreeningsSection => 'স্ক্রিনিং';

  @override
  String get agentScreeningsEmpty =>
      'এখনও কোনো স্ক্রিনিং নেই — AI-এর মাধ্যমে মিলিয়ে দেওয়া হাসপাতাল ও ডাক্তার পেতে একটি স্ক্রিনিং করুন।';

  @override
  String get agentGeneralScreening => 'সাধারণ স্ক্রিনিং';

  @override
  String get agentCasesTitle => 'কেস ও কোটেশন';

  @override
  String get agentCompareQuotes => 'কোটেশন তুলনা করুন';

  @override
  String get agentPatientCasesEmpty => 'এখনও কোনো হাসপাতাল অনুসন্ধান নেই।';

  @override
  String agentDocumentUploaded(String fileName) {
    return '$fileName আপলোড হয়েছে';
  }

  @override
  String get agentDocumentsSection => 'নথিপত্র';

  @override
  String get agentDocumentUploading => 'আপলোড হচ্ছে…';

  @override
  String get agentDocumentsEmpty =>
      'হাসপাতাল যাতে সঠিক কোটেশন দিতে পারে, সেজন্য রিপোর্ট, স্ক্যান ও পাসপোর্ট আপলোড করুন।';

  @override
  String get agentCasesEmpty => 'কোনো কেস নেই';

  @override
  String get agentCasesEmptyHint => 'একজন রোগী খুলে কোনো হাসপাতাল থেকে কোটেশন চান।';

  @override
  String get agentAcceptQuoteTitle => 'এই কোটেশন গ্রহণ করবেন?';

  @override
  String agentAcceptQuoteMessage(String hospital, String total) {
    return '$hospital · $total। বুকিং না হওয়া পর্যন্ত অন্যান্য খোলা কোটেশন উপলব্ধ থাকবে।';
  }

  @override
  String get agentQuoteAccept => 'গ্রহণ করুন';

  @override
  String get agentQuoteAccepted => 'কোটেশন গৃহীত হয়েছে';

  @override
  String get agentRejectQuoteTitle => 'কোটেশন প্রত্যাখ্যান';

  @override
  String get agentReasonOptional => 'কারণ (ঐচ্ছিক)';

  @override
  String get agentQuoteReject => 'প্রত্যাখ্যান করুন';

  @override
  String get agentQuoteRejected => 'কোটেশন প্রত্যাখ্যাত হয়েছে';

  @override
  String get agentCancelCaseTitle => 'এই কেস বাতিল করবেন?';

  @override
  String get agentCancelCaseMessage => 'হাসপাতালকে জানানো হবে।';

  @override
  String get agentCancelCase => 'কেস বাতিল করুন';

  @override
  String get agentCaseCancelled => 'কেস বাতিল হয়েছে';

  @override
  String get agentCaseFallbackTitle => 'কেস';

  @override
  String get agentCaseCoordinator => 'সমন্বয়কারী';

  @override
  String get agentCaseOpenedLabel => 'খোলার তারিখ';

  @override
  String get agentCaseNotes => 'নোট';

  @override
  String get agentBookTreatment => 'চিকিৎসা বুক করুন';

  @override
  String agentCaseBookingSummary(String date, String balance) {
    return 'ভর্তি $date · বাকি $balance';
  }

  @override
  String get agentQuotesSection => 'কোটেশন';

  @override
  String get agentCompareHospitals => 'হাসপাতাল তুলনা করুন';

  @override
  String agentQuotesWaiting(String hospital) {
    return '$hospital থেকে বিস্তারিত কোটেশনের অপেক্ষায়।';
  }

  @override
  String agentQuoteDated(String date) {
    return 'কোটেশন · $date';
  }

  @override
  String get agentTimelineSection => 'সময়রেখা';

  @override
  String get agentCompareEmpty => 'তুলনা করার মতো কোনো কোটেশন এখনও নেই';

  @override
  String get agentCompareEmptyHint => 'কয়েকটি হাসপাতাল থেকে কোটেশন চান; হাসপাতাল উত্তর দিলেই সেগুলো এখানে দেখা যাবে।';

  @override
  String get agentRequestAQuote => 'কোটেশন চান';

  @override
  String agentCompareBestPrice(String price, String hospital) {
    return 'সেরা দাম: $hospital-এ $price।';
  }

  @override
  String agentCompareBestPriceSaves(String price, String hospital, String savings) {
    return 'সেরা দাম: $hospital-এ $price — সর্বোচ্চ কোটেশনের তুলনায় $savings সাশ্রয়।';
  }

  @override
  String get agentCompareMixedCurrencies => 'কোটেশনগুলো ভিন্ন মুদ্রায়; মোট পরিমাণ সাবধানে তুলনা করুন।';

  @override
  String get agentCompareRequestAnother => 'আরেকটি হাসপাতালে অনুরোধ করুন';

  @override
  String get agentCompareStay => 'অবস্থান';

  @override
  String get agentCompareValidUntil => 'বৈধতার শেষ তারিখ';

  @override
  String agentCompareAcceptTitle(String hospital) {
    return '$hospital গ্রহণ করবেন?';
  }

  @override
  String agentCompareAcceptMessage(String total) {
    return 'মোট $total';
  }

  @override
  String get agentCompareBest => 'সেরা';

  @override
  String agentCompareStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন');
    return '$_temp0';
  }

  @override
  String agentQuoteRequestedFrom(String hospital) {
    return '$hospital থেকে কোটেশন চাওয়া হয়েছে';
  }

  @override
  String get agentSearchHospitalsHint => 'হাসপাতাল খুঁজুন';

  @override
  String get agentNoHospitalsFound => 'কোনো হাসপাতাল পাওয়া যায়নি';

  @override
  String get agentNotesForHospitalOptional => 'হাসপাতালের জন্য নোট (ঐচ্ছিক)';

  @override
  String get agentSelectHospital => 'একটি হাসপাতাল নির্বাচন করুন';

  @override
  String agentRequestQuoteFrom(String hospital) {
    return '$hospital থেকে কোটেশন চান';
  }

  @override
  String get agentBookingsTitle => 'বুকিং ও পেমেন্ট';

  @override
  String get agentBookingsEmpty => 'কোনো বুকিং নেই';

  @override
  String get agentBookingsEmptyHint => 'একটি হাসপাতালের কোটেশন গ্রহণ করুন, তারপর আপনার রোগীর জন্য চিকিৎসা বুক করুন।';

  @override
  String agentBookingAdmissionShort(String date) {
    return 'ভর্তি $date';
  }

  @override
  String agentBookingDueShort(String amount) {
    return 'বাকি $amount';
  }

  @override
  String get agentBookingPaidInFull => 'সম্পূর্ণ পরিশোধিত';

  @override
  String get agentTestPaymentCompleted => 'পরীক্ষামূলক পেমেন্ট সম্পন্ন';

  @override
  String agentBankBeneficiary(String name) {
    return 'সুবিধাভোগী: $name';
  }

  @override
  String agentBankName(String bank) {
    return 'ব্যাংক: $bank';
  }

  @override
  String agentBankAccount(String account) {
    return 'অ্যাকাউন্ট: $account';
  }

  @override
  String agentBankReference(String reference) {
    return 'রেফারেন্স: $reference';
  }

  @override
  String agentBankAmount(String amount) {
    return 'পরিমাণ: $amount';
  }

  @override
  String get agentBankTransferDetailsTitle => 'ব্যাংক ট্রান্সফারের বিবরণ';

  @override
  String get agentCopyAndClose => 'কপি করে বন্ধ করুন';

  @override
  String agentCancelBookingTitle(String bookingNumber) {
    return 'বুকিং $bookingNumber বাতিল করবেন?';
  }

  @override
  String get agentReason => 'কারণ';

  @override
  String get agentCancelBooking => 'বুকিং বাতিল করুন';

  @override
  String get agentBookingCancelledRefund => 'বুকিং বাতিল হয়েছে; ফেরত হাসপাতালের নীতি অনুযায়ী হবে';

  @override
  String get agentBookingTreatment => 'চিকিৎসা';

  @override
  String get agentBookingAdmission => 'ভর্তি';

  @override
  String get agentBookingDischarge => 'ছাড়পত্র';

  @override
  String get agentBookingPaymentPlan => 'পেমেন্ট পরিকল্পনা';

  @override
  String agentBookingMonthlyInstallments(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countটি মাসিক কিস্তি');
    return '$_temp0';
  }

  @override
  String get agentPriceSummary => 'মূল্যের সারসংক্ষেপ';

  @override
  String get agentPriceDiscount => 'ছাড়';

  @override
  String get agentPriceServiceFee => 'সার্ভিস ফি';

  @override
  String get agentPriceTax => 'কর';

  @override
  String get agentPriceDeposit => 'অগ্রিম';

  @override
  String get agentPricePaid => 'পরিশোধিত';

  @override
  String get agentPriceRefunded => 'ফেরত দেওয়া হয়েছে';

  @override
  String get agentPriceBalanceDue => 'বকেয়া';

  @override
  String get agentCollectPayment => 'পেমেন্ট সংগ্রহ করুন';

  @override
  String get agentPaymentsSection => 'পেমেন্ট';

  @override
  String get agentPaymentsEmpty => 'এখনও কোনো পেমেন্ট নেই।';

  @override
  String get agentOpenCase => 'কেস খুলুন';

  @override
  String get agentInstallmentsSection => 'কিস্তি';

  @override
  String agentInstallmentDue(String date) {
    return 'পরিশোধের তারিখ $date';
  }

  @override
  String get agentInstallmentCollect => 'সংগ্রহ করুন';

  @override
  String get agentCollectPaymentHint => 'পরিমাণটি সার্ভার হিসাব করে; রোগী নিজের অ্যাপ থেকেও পেমেন্ট করতে পারেন।';

  @override
  String get agentCollectBankTransferOption => 'ব্যাংক ট্রান্সফার (SWIFT / NEFT)';

  @override
  String agentCollectContinueAmount(String amount) {
    return 'চালিয়ে যান · ~$amount';
  }

  @override
  String get agentAdmissionDate => 'ভর্তির তারিখ';

  @override
  String get agentChooseDate => 'একটি তারিখ বেছে নিন';

  @override
  String get agentPaymentSection => 'পেমেন্ট';

  @override
  String get agentPaymentOptionDeposit => 'অগ্রিম';

  @override
  String get agentPaymentOptionFull => 'সম্পূর্ণ';

  @override
  String get agentPaymentOptionPlan => 'কিস্তি';

  @override
  String agentInstallmentMonthsChip(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count মাস');
    return '$_temp0';
  }

  @override
  String get agentInsuranceClaim => 'রোগী বিমা দাবি করতে চান';

  @override
  String get agentCreateBooking => 'বুকিং তৈরি করুন';

  @override
  String get hpTabDashboard => 'ড্যাশবোর্ড';

  @override
  String get hpTabEnquiries => 'অনুসন্ধান';

  @override
  String get hpTabPatients => 'রোগী';

  @override
  String get hpTabSettlements => 'নিষ্পত্তি';

  @override
  String get hpTabMore => 'আরও';

  @override
  String get hpSettlementsTitle => 'নিষ্পত্তি ও পেআউট';

  @override
  String get hpDashboardTitle => 'হাসপাতালের ড্যাশবোর্ড';

  @override
  String get hpNoHospitalTitle => 'কোনো হাসপাতাল যুক্ত নেই';

  @override
  String get hpNoHospitalMessage => 'আপনার হাসপাতালের প্রশাসককে আপনাকে সদস্য হিসেবে আমন্ত্রণ জানাতে বলুন।';

  @override
  String get hpListingDraft =>
      'আপনার তালিকাটি খসড়া অবস্থায় আছে। হাসপাতালের ওয়েব পোর্টালে প্রোফাইল সম্পূর্ণ করে পর্যালোচনার জন্য জমা দিন।';

  @override
  String get hpListingPendingReview => 'আপনার তালিকাটি পর্যালোচনাধীন। অনুমোদনের পর রোগীরা এটি দেখতে পাবেন।';

  @override
  String hpListingOtherStatus(String status) {
    return 'আপনার তালিকার অবস্থা: $status। Heal India Global সহায়তায় যোগাযোগ করুন।';
  }

  @override
  String get hpKpiOpenEnquiries => 'চলমান অনুসন্ধান';

  @override
  String get hpKpiQuotesAwaiting => 'রোগীর অপেক্ষায় থাকা কোটেশন';

  @override
  String get hpKpiUpcomingAdmissions => 'আসন্ন ভর্তি';

  @override
  String get hpKpiInTreatment => 'চিকিৎসাধীন';

  @override
  String get hpRevenueThisMonth => 'এই মাসের আয়';

  @override
  String get hpRevenueByMonth => 'মাসভিত্তিক আয়';

  @override
  String get hpBookingsByMonth => 'মাসভিত্তিক বুকিং';

  @override
  String get hpRecentCases => 'সাম্প্রতিক কেস';

  @override
  String get hpNoEnquiriesYet => 'এখনও কোনো অনুসন্ধান নেই';

  @override
  String get hpEnquiriesFilterNew => 'নতুন';

  @override
  String get hpNoNewEnquiries => 'কোনো নতুন অনুসন্ধান নেই';

  @override
  String get hpNoCases => 'কোনো কেস নেই';

  @override
  String get hpEnquiriesEmptyMessage => 'রোগী ও এজেন্টরা মিলে যাওয়া ফলাফল থেকে অনুসন্ধান পাঠান।';

  @override
  String hpDeclineTitle(String caseNumber) {
    return '$caseNumber প্রত্যাখ্যান করবেন?';
  }

  @override
  String get hpDeclineReasonLabel => 'রোগীকে জানানো কারণ';

  @override
  String get hpDeclineButton => 'প্রত্যাখ্যান';

  @override
  String get hpEnquiryDeclined => 'অনুসন্ধান প্রত্যাখ্যাত হয়েছে';

  @override
  String get hpCaseFallbackTitle => 'কেস';

  @override
  String get hpPrepareQuote => 'কোটেশন তৈরি করুন';

  @override
  String get hpSendRevisedQuote => 'সংশোধিত কোটেশন পাঠান';

  @override
  String get hpPatientFallback => 'রোগী';

  @override
  String hpYearsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count বছর', one: '$count বছর');
    return '$_temp0';
  }

  @override
  String get hpInfoTreatment => 'চিকিৎসা';

  @override
  String get hpInfoDoctor => 'ডাক্তার';

  @override
  String get hpInfoViaAgent => 'এজেন্টের মাধ্যমে';

  @override
  String get hpInfoCoordinator => 'সমন্বয়কারী';

  @override
  String get hpInfoReceived => 'প্রাপ্তির তারিখ';

  @override
  String hpCaseBookingLine(String bookingNumber, String date) {
    return 'বুকিং $bookingNumber · ভর্তি $date';
  }

  @override
  String get hpPatientNotes => 'রোগীর নোট';

  @override
  String get hpScreening => 'প্রাথমিক মূল্যায়ন';

  @override
  String get hpInfoSpecialty => 'বিশেষত্ব';

  @override
  String get hpInfoBodyAreas => 'শরীরের অংশ';

  @override
  String get hpInfoPain => 'ব্যথা';

  @override
  String get hpInfoSymptoms => 'উপসর্গ';

  @override
  String get hpInfoDuration => 'সময়কাল';

  @override
  String get hpInfoUrgency => 'জরুরিতা';

  @override
  String get hpMedicalDocuments => 'চিকিৎসা নথি';

  @override
  String get hpQuotesSection => 'কোটেশন';

  @override
  String get hpNoQuoteYet => 'এখনও কোনো কোটেশন পাঠানো হয়নি।';

  @override
  String hpQuoteSentOn(String date) {
    return '$date তারিখে পাঠানো';
  }

  @override
  String get hpQuoteProblemPlan => 'চিকিৎসা পরিকল্পনা বর্ণনা করুন';

  @override
  String get hpQuoteProblemNoLines => 'অন্তত একটি আইটেম যোগ করুন';

  @override
  String get hpQuoteProblemIncompleteLine => 'প্রতিটি আইটেমে বিবরণ ও পরিমাণ থাকতে হবে';

  @override
  String get hpQuoteProblemTooManyLines => 'সর্বোচ্চ ৫০টি আইটেম';

  @override
  String get hpSendQuoteConfirmTitle => 'কোটেশন পাঠাবেন?';

  @override
  String hpSendQuoteConfirmMessage(String total) {
    return 'মোট $total — রোগীকে সঙ্গে সঙ্গে জানানো হবে।';
  }

  @override
  String get hpQuoteSent => 'কোটেশন পাঠানো হয়েছে';

  @override
  String hpQuoteBuilderTitle(String caseNumber) {
    return 'কোটেশন · $caseNumber';
  }

  @override
  String get hpTreatmentPlanLabel => 'চিকিৎসা পরিকল্পনা';

  @override
  String get hpCurrencyLabel => 'মুদ্রা';

  @override
  String get hpStayDaysLabel => 'থাকা (দিন)';

  @override
  String hpValidUntil(String date) {
    return '$date পর্যন্ত বৈধ';
  }

  @override
  String get hpLineItems => 'আইটেমসমূহ';

  @override
  String get hpAddLineItem => 'আইটেম যোগ করুন';

  @override
  String get hpTotal => 'মোট';

  @override
  String get hpSendQuote => 'কোটেশন পাঠান';

  @override
  String get hpCategoryLabel => 'বিভাগ';

  @override
  String get hpDescriptionLabel => 'বিবরণ';

  @override
  String hpAmountLabel(String currency) {
    return 'পরিমাণ ($currency)';
  }

  @override
  String get hpAdmissionsTitle => 'ভর্তি';

  @override
  String get hpAdmissionsUpcoming => 'আসন্ন';

  @override
  String get hpAdmissionsDischarged => 'ছাড়া পেয়েছেন';

  @override
  String get hpAdmissionsAwaitingPayment => 'পেমেন্টের অপেক্ষায়';

  @override
  String get hpAdmissionsCancelled => 'বাতিল';

  @override
  String get hpAdmissionsEmptyUpcoming => 'কোনো আসন্ন রোগী নেই';

  @override
  String get hpAdmissionsEmptyInTreatment => 'কোনো চিকিৎসাধীন রোগী নেই';

  @override
  String get hpAdmissionsEmptyDischarged => 'ছাড়া পাওয়া কোনো রোগী নেই';

  @override
  String get hpAdmissionsEmptyAwaitingPayment => 'পেমেন্টের অপেক্ষায় কোনো রোগী নেই';

  @override
  String get hpAdmissionsEmptyCancelled => 'কোনো বাতিল রোগী নেই';

  @override
  String hpTileDischarged(String date) {
    return '$date তারিখে ছাড়া পেয়েছেন';
  }

  @override
  String hpTileAdmitted(String date) {
    return '$date তারিখে ভর্তি';
  }

  @override
  String hpTileAdmission(String date) {
    return 'ভর্তি $date';
  }

  @override
  String hpTileInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন পরে', one: '$count দিন পরে');
    return '$_temp0';
  }

  @override
  String get hpAdmitPatientTitle => 'রোগীকে ভর্তি করবেন?';

  @override
  String hpAdmitNamedTitle(String name) {
    return '$name-কে ভর্তি করবেন?';
  }

  @override
  String get hpNoteOptional => 'নোট (ঐচ্ছিক)';

  @override
  String get hpAdmitButton => 'ভর্তি করুন';

  @override
  String get hpPatientAdmitted => 'রোগী ভর্তি হয়েছেন';

  @override
  String get hpDischargeDate => 'ছাড়ার তারিখ';

  @override
  String get hpDischargeNoteTitle => 'ছাড়পত্রের সারসংক্ষেপ নোট';

  @override
  String get hpDischargeButton => 'ছাড়ুন';

  @override
  String get hpPatientDischarged => 'রোগীকে ছাড়া হয়েছে';

  @override
  String get hpAddedToItinerary => 'যাত্রাসূচিতে যোগ হয়েছে';

  @override
  String get hpBookingFallbackTitle => 'বুকিং';

  @override
  String get hpItinerary => 'যাত্রাসূচি';

  @override
  String get hpInfoAdmission => 'ভর্তি';

  @override
  String get hpInfoAdmitted => 'ভর্তি হয়েছেন';

  @override
  String get hpInfoDischarge => 'ছাড়া';

  @override
  String get hpInfoLengthOfStay => 'থাকার মেয়াদ';

  @override
  String hpDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন', one: '$count দিন');
    return '$_temp0';
  }

  @override
  String get hpInfoPaid => 'পরিশোধিত';

  @override
  String get hpAdmitPatientButton => 'রোগী ভর্তি করুন';

  @override
  String get hpDischargePatientButton => 'রোগীকে ছাড়ুন';

  @override
  String get hpAwaitingDeposit => 'রোগীর অগ্রিম জমার অপেক্ষায়। বুকিং নিশ্চিত হলে ভর্তি করা যাবে।';

  @override
  String get hpOpenCase => 'কেস খুলুন';

  @override
  String get hpNoItineraryYet =>
      'এখনও কোনো যাত্রাসূচি নেই — অ্যাপয়েন্টমেন্ট, অস্ত্রোপচারের সময়, পিকআপ ও ফলো-আপ যোগ করুন।';

  @override
  String get hpItineraryMarkedDone => 'সম্পন্ন হিসেবে চিহ্নিত';

  @override
  String get hpItineraryCancelled => 'বাতিল হয়েছে';

  @override
  String get hpItineraryRemoved => 'সরানো হয়েছে';

  @override
  String get hpItineraryMarkDone => 'সম্পন্ন চিহ্নিত করুন';

  @override
  String get hpAddToItinerary => 'যাত্রাসূচিতে যোগ করুন';

  @override
  String get hpItineraryTypeLabel => 'ধরন';

  @override
  String get hpItineraryTitleLabel => 'শিরোনাম (যেমন: অস্ত্রোপচারের আগের পরামর্শ)';

  @override
  String get hpItineraryDateTime => 'তারিখ ও সময়';

  @override
  String get hpItineraryLocationLabel => 'স্থান';

  @override
  String get hpItineraryInstructionsLabel => 'রোগীর জন্য নির্দেশনা (ঐচ্ছিক)';

  @override
  String get hpItineraries => 'যাত্রাসূচি';

  @override
  String get hpNobodyAdmitted => 'এই মুহূর্তে কেউ ভর্তি নেই।';

  @override
  String get hpUpcomingArrivals => 'আসন্ন আগমন';

  @override
  String get hpNoConfirmedBookings => 'কোনো নিশ্চিত বুকিং নেই।';

  @override
  String get hpMoreItinerariesSubtitle => 'অ্যাপয়েন্টমেন্ট, অস্ত্রোপচারের সময়, পিকআপ';

  @override
  String get hpVisaLettersTitle => 'ভিসার আমন্ত্রণপত্র';

  @override
  String get hpMoreVisasSubtitle => 'রোগীদের মেডিকেল ভিসার অনুরোধ';

  @override
  String get hpDoctorsTitle => 'ডাক্তার';

  @override
  String get hpMoreDoctorsSubtitle => 'আপনার বিশেষজ্ঞ ও তাঁদের প্রোফাইল';

  @override
  String get hpMorePriceListSubtitle => 'প্রক্রিয়া, মূল্যসীমা ও প্যাকেজ';

  @override
  String get hpActingFor => 'যার পক্ষে কাজ করছেন';

  @override
  String get hpWebPortalNote => 'প্রোফাইল, সদস্য, প্রাপ্যতা ও মূল্য সম্পাদনা হাসপাতালের ওয়েব পোর্টালে করা যায়।';

  @override
  String get hpNoVisaRequests => 'কোনো ভিসার অনুরোধ নেই';

  @override
  String get hpInvitationLetterNeeded => 'আমন্ত্রণপত্র প্রয়োজন';

  @override
  String get hpVisaRequestFallback => 'ভিসার অনুরোধ';

  @override
  String get hpNoInvitationLetterYet => 'এখনও কোনো আমন্ত্রণপত্র নেই';

  @override
  String get hpInvitationLetterUploaded => 'আমন্ত্রণপত্র: আপলোড হয়েছে';

  @override
  String hpInvitationLetterNamed(String fileName) {
    return 'আমন্ত্রণপত্র: $fileName';
  }

  @override
  String get hpReplace => 'বদলান';

  @override
  String get hpStatusLabel => 'অবস্থা';

  @override
  String get hpEvisaReferenceLabel => 'ই-ভিসা আবেদনের রেফারেন্স';

  @override
  String get hpNotesLabel => 'নোট';

  @override
  String get hpNoDoctorsListed => 'কোনো ডাক্তার তালিকাভুক্ত নেই';

  @override
  String get hpTeleconsultBadge => 'টেলি-পরামর্শ';

  @override
  String hpConsultationFee(String fee) {
    return 'ফি $fee';
  }

  @override
  String get priceListTitle => 'মূল্য তালিকা';

  @override
  String get priceListEmpty => 'এখনও কোনো প্রক্রিয়ার মূল্য দেওয়া হয়নি';

  @override
  String priceListStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count দিন থাকা', one: '$count দিন থাকা');
    return '$_temp0';
  }

  @override
  String priceListSuccessRate(String rate) {
    return '$rate% সাফল্য';
  }

  @override
  String get reportAnalysisTitle => 'আপনার রিপোর্ট';

  @override
  String get reportConfirmedSnack => 'রিপোর্ট নিশ্চিত করা হয়েছে।';

  @override
  String reportMaxPages(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'একটি রিপোর্টে সর্বোচ্চ $maxটি পৃষ্ঠা থাকতে পারে।',
      one: 'একটি রিপোর্টে সর্বোচ্চ $maxটি পৃষ্ঠা থাকতে পারে।',
    );
    return '$_temp0';
  }

  @override
  String reportFileTooLarge(String fileName) {
    return '$fileName খুব বড় (সর্বোচ্চ ২০ MB)।';
  }

  @override
  String get reportPermissionNeeded => 'পৃষ্ঠা যোগ করতে আপনার ফোনের সেটিংসে ক্যামেরা / ছবিতে অ্যাক্সেসের অনুমতি দিন।';

  @override
  String reportUploadingPage(int current, int total) {
    return '$totalটির মধ্যে $current নম্বর পৃষ্ঠা আপলোড হচ্ছে…';
  }

  @override
  String get reportSendingToAi => 'এআই-তে পাঠানো হচ্ছে…';

  @override
  String get reportReviewTitle => 'আপনার রিপোর্ট যাচাই করুন';

  @override
  String get reportCaptureTitle => 'চিকিৎসা রিপোর্ট যোগ করুন';

  @override
  String get reportCaptureIntro =>
      'কাগজের রিপোর্টের প্রতিটি পৃষ্ঠার ছবি তুলুন, ছবি বেছে নিন, অথবা একটি PDF আপলোড করুন।';

  @override
  String get reportTakePhoto => 'ছবি তুলুন';

  @override
  String get reportChooseFromGallery => 'গ্যালারি থেকে বাছুন';

  @override
  String get reportUploadPdf => 'PDF আপলোড';

  @override
  String reportPagesCount(int count, int max) {
    return 'পৃষ্ঠা ($count/$max)';
  }

  @override
  String get reportNoPagesTip =>
      'এখনও কোনো পৃষ্ঠা নেই। পরামর্শ: ভালো আলোতে পৃষ্ঠাটি সমানভাবে রাখুন এবং পুরো ফ্রেম জুড়ে তুলুন।';

  @override
  String get reportKindQuestion => 'এটি কোন ধরনের নথি?';

  @override
  String get reportReadWithAi => 'এআই দিয়ে আমার রিপোর্ট পড়ুন';

  @override
  String get reportAiConsentText =>
      'আমাদের এআই সহকারী পৃষ্ঠাগুলি পড়ে আপনার পরীক্ষার ফলাফল, রোগনির্ণয় ও ওষুধের তালিকা তৈরি করে। ব্যবহারের আগে আপনি সবকিছু যাচাই ও সংশোধন করেন, এবং এটি শুধু আপনার বেছে নেওয়া হাসপাতালগুলির সাথে শেয়ার করা হয়। আপনি এটি বন্ধ করে শুধু রিপোর্টটি আপলোড করতে পারেন।';

  @override
  String get reportUploadButton => 'রিপোর্ট আপলোড করুন';

  @override
  String reportPageNumber(int number) {
    return 'পৃষ্ঠা $number';
  }

  @override
  String reportRemovePage(int number) {
    return 'পৃষ্ঠা $number সরান';
  }

  @override
  String get reportDragToReorder => 'ক্রম বদলাতে টেনে আনুন';

  @override
  String get reportAiEntryTooltip => 'এআই দিয়ে রিপোর্ট পড়ুন';

  @override
  String get reportSheetTitle => 'এআই-এর পড়া আপনার রিপোর্ট';

  @override
  String get reportSheetIntro =>
      'কাগজের রিপোর্টের ছবি তুলুন বা একটি PDF বেছে নিন। ব্যবহারের আগে আপনি সবকিছু যাচাই ও নিশ্চিত করেন।';

  @override
  String get reportScanButton => 'রিপোর্ট স্ক্যান করুন';

  @override
  String get reportNoReadings => 'এখনও কোনো এআই রিডিং নেই।';

  @override
  String get reportMedicalReportFallback => 'চিকিৎসা রিপোর্ট';

  @override
  String get reportImportant => 'গুরুত্বপূর্ণ';

  @override
  String get reportCriticalValues => 'সংকটজনক মান';

  @override
  String get reportSummary => 'সারসংক্ষেপ';

  @override
  String get reportKeyFindings => 'মূল ফলাফল';

  @override
  String get reportLabValues => 'ল্যাবের মান';

  @override
  String get reportMedications => 'ওষুধ';

  @override
  String get reportDiagnosesMentioned => 'উল্লিখিত রোগনির্ণয়';

  @override
  String get reportProceduresMentioned => 'উল্লিখিত প্রক্রিয়া';

  @override
  String get reportRecommendations => 'সুপারিশ';

  @override
  String get reportAiDisclaimer => 'এআই দ্বারা তৈরি — সবসময় আপনার ডাক্তারের সাথে নিশ্চিত করুন।';

  @override
  String get reportStatusConfirmed => 'নিশ্চিত';

  @override
  String get reportStatusDiscarded => 'বাতিল';

  @override
  String get reportStatusReading => 'পড়া হচ্ছে…';

  @override
  String get reportStatusNotRead => 'পড়া যায়নি';

  @override
  String get reportStatusNeedsReview => 'যাচাই প্রয়োজন';

  @override
  String get reportLabTest => 'পরীক্ষা';

  @override
  String get reportLabResult => 'ফলাফল';

  @override
  String get reportLabRange => 'সীমা';

  @override
  String get reportEdited => 'সম্পাদিত';

  @override
  String get reportDateLabel => 'রিপোর্টের তারিখ';

  @override
  String get reportCriticalValuesInReport => 'এই রিপোর্টে সংকটজনক মান';

  @override
  String get reportAboutSection => 'এই রিপোর্ট সম্পর্কে';

  @override
  String get reportDocTypeLabel => 'নথির ধরন';

  @override
  String get reportClearDate => 'তারিখ মুছুন';

  @override
  String get reportDateNotStated => 'উল্লেখ নেই';

  @override
  String get reportFacilityLabel => 'হাসপাতাল / ল্যাবরেটরি';

  @override
  String get reportSummaryHint => 'রিপোর্টে যা বলা আছে, সহজ ভাষায়';

  @override
  String get findingAdd => 'ফলাফল যোগ করুন';

  @override
  String findingRemove(int number) {
    return 'ফলাফল $number সরান';
  }

  @override
  String get findingLabel => 'ফলাফল';

  @override
  String get labAddValue => 'মান যোগ করুন';

  @override
  String labRemoveValue(int number) {
    return 'ল্যাবের মান $number সরান';
  }

  @override
  String get labValueLabel => 'মান';

  @override
  String get labUnitLabel => 'একক';

  @override
  String get labReferenceRangeLabel => 'রেফারেন্স সীমা';

  @override
  String get reportAddMedication => 'ওষুধ যোগ করুন';

  @override
  String reportRemoveMedication(int number) {
    return 'ওষুধ $number সরান';
  }

  @override
  String get reportMedicineLabel => 'ওষুধ';

  @override
  String get reportDoseLabel => 'মাত্রা';

  @override
  String get reportFrequencyLabel => 'কতবার';

  @override
  String get reportAddDiagnosis => 'রোগনির্ণয় যোগ করুন';

  @override
  String get reportAddProcedure => 'প্রক্রিয়া যোগ করুন';

  @override
  String get reportAddRecommendation => 'সুপারিশ যোগ করুন';

  @override
  String get reportNone => 'কিছু নেই';
}
