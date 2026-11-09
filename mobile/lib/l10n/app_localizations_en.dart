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

  @override
  String get enumUserRolePatient => 'Patient';

  @override
  String get enumUserRoleAgent => 'Agent';

  @override
  String get enumUserRoleHospital => 'Hospital';

  @override
  String get enumUserRoleAdmin => 'Admin';

  @override
  String get enumUserRoleFinance => 'Finance';

  @override
  String get enumUserRoleSupport => 'Support';

  @override
  String get enumUserRoleSuperAdmin => 'Super admin';

  @override
  String get enumUserStatusActive => 'Active';

  @override
  String get enumUserStatusPendingVerification => 'Pending verification';

  @override
  String get enumUserStatusSuspended => 'Suspended';

  @override
  String get enumUserStatusDeleted => 'Deleted';

  @override
  String get enumGenderMale => 'Male';

  @override
  String get enumGenderFemale => 'Female';

  @override
  String get enumGenderOther => 'Other';

  @override
  String get enumGenderUndisclosed => 'Undisclosed';

  @override
  String get enumDoctorGenderPrefMale => 'Male';

  @override
  String get enumDoctorGenderPrefFemale => 'Female';

  @override
  String get enumDoctorGenderPrefNoPreference => 'No Preference';

  @override
  String get enumKycStatusNotSubmitted => 'Not submitted';

  @override
  String get enumKycStatusPending => 'Pending';

  @override
  String get enumKycStatusApproved => 'Approved';

  @override
  String get enumKycStatusRejected => 'Rejected';

  @override
  String get enumHospitalStatusDraft => 'Draft';

  @override
  String get enumHospitalStatusPendingReview => 'Pending review';

  @override
  String get enumHospitalStatusActive => 'Active';

  @override
  String get enumHospitalStatusSuspended => 'Suspended';

  @override
  String get enumHospitalStatusRejected => 'Rejected';

  @override
  String get enumAgentStatusPending => 'Pending';

  @override
  String get enumAgentStatusActive => 'Active';

  @override
  String get enumAgentStatusSuspended => 'Suspended';

  @override
  String get enumAgentStatusRejected => 'Rejected';

  @override
  String get enumHospitalMemberRoleOwner => 'Owner';

  @override
  String get enumHospitalMemberRoleAdmin => 'Admin';

  @override
  String get enumHospitalMemberRoleCoordinator => 'Coordinator';

  @override
  String get enumHospitalMemberRoleFinance => 'Finance';

  @override
  String get enumHospitalMemberRoleDoctor => 'Doctor';

  @override
  String get enumPackageTierMedicalOnly => 'Medical Only';

  @override
  String get enumPackageTierMedicalStay => 'Medical + Stay';

  @override
  String get enumPackageTierAllInclusive => 'All-inclusive';

  @override
  String get enumScreeningStatusDraft => 'Draft';

  @override
  String get enumScreeningStatusProcessing => 'Processing';

  @override
  String get enumScreeningStatusCompleted => 'Completed';

  @override
  String get enumScreeningStatusFailed => 'Failed';

  @override
  String get enumUrgencyRoutine => 'Routine';

  @override
  String get enumUrgencySoon => 'Soon';

  @override
  String get enumUrgencyUrgent => 'Urgent';

  @override
  String get enumUrgencyEmergency => 'Emergency';

  @override
  String get enumDurationUnitDays => 'Days';

  @override
  String get enumDurationUnitWeeks => 'Weeks';

  @override
  String get enumDurationUnitMonths => 'Months';

  @override
  String get enumDurationUnitYears => 'Years';

  @override
  String get enumSeverityLevelNone => 'None';

  @override
  String get enumSeverityLevelMild => 'Mild';

  @override
  String get enumSeverityLevelModerate => 'Moderate';

  @override
  String get enumSeverityLevelSevere => 'Severe';

  @override
  String get enumSymptomAnswerYes => 'Yes';

  @override
  String get enumSymptomAnswerMaybe => 'Maybe';

  @override
  String get enumSymptomAnswerNo => 'No';

  @override
  String get enumCaseStatusEnquiry => 'Enquiry';

  @override
  String get enumCaseStatusQuoted => 'Quoted';

  @override
  String get enumCaseStatusAccepted => 'Accepted';

  @override
  String get enumCaseStatusBooked => 'Booked';

  @override
  String get enumCaseStatusInTreatment => 'In treatment';

  @override
  String get enumCaseStatusCompleted => 'Completed';

  @override
  String get enumCaseStatusCancelled => 'Cancelled';

  @override
  String get enumCaseStatusDeclined => 'Declined';

  @override
  String get enumQuoteStatusDraft => 'Draft';

  @override
  String get enumQuoteStatusSent => 'Sent';

  @override
  String get enumQuoteStatusAccepted => 'Accepted';

  @override
  String get enumQuoteStatusRejected => 'Rejected';

  @override
  String get enumQuoteStatusExpired => 'Expired';

  @override
  String get enumQuoteStatusWithdrawn => 'Withdrawn';

  @override
  String get enumQuoteLineCategorySurgery => 'Surgery';

  @override
  String get enumQuoteLineCategoryHospitalStay => 'Hospital Stay';

  @override
  String get enumQuoteLineCategoryMedications => 'Medications';

  @override
  String get enumQuoteLineCategoryTestsScans => 'Tests & Scans';

  @override
  String get enumQuoteLineCategoryDoctorFees => 'Doctor Fees';

  @override
  String get enumQuoteLineCategoryImplants => 'Implants';

  @override
  String get enumQuoteLineCategoryOther => 'Other';

  @override
  String get enumBookingStatusPendingPayment => 'Pending payment';

  @override
  String get enumBookingStatusConfirmed => 'Confirmed';

  @override
  String get enumBookingStatusAdmitted => 'Admitted';

  @override
  String get enumBookingStatusCompleted => 'Completed';

  @override
  String get enumBookingStatusCancelled => 'Cancelled';

  @override
  String get enumPaymentOptionFull => 'Pay in full';

  @override
  String get enumPaymentOptionDeposit => 'Deposit';

  @override
  String get enumPaymentOptionInstallments => 'Payment plan';

  @override
  String get enumConsultationStatusRequested => 'Requested';

  @override
  String get enumConsultationStatusScheduled => 'Scheduled';

  @override
  String get enumConsultationStatusCompleted => 'Completed';

  @override
  String get enumConsultationStatusCancelled => 'Cancelled';

  @override
  String get enumChecklistStatusPending => 'Pending';

  @override
  String get enumChecklistStatusInProgress => 'In progress';

  @override
  String get enumChecklistStatusDone => 'Done';

  @override
  String get enumItineraryKindAppointment => 'Appointment';

  @override
  String get enumItineraryKindAdmission => 'Admission';

  @override
  String get enumItineraryKindSurgery => 'Surgery';

  @override
  String get enumItineraryKindPickup => 'Pickup';

  @override
  String get enumItineraryKindCheckin => 'Check-in';

  @override
  String get enumItineraryKindCheckout => 'Check-out';

  @override
  String get enumItineraryKindFollowup => 'Follow-up';

  @override
  String get enumItineraryKindSightseeing => 'Sightseeing';

  @override
  String get enumItineraryKindOther => 'Other';

  @override
  String get enumVisaStatusNotStarted => 'Not started';

  @override
  String get enumVisaStatusDocumentsPending => 'Documents pending';

  @override
  String get enumVisaStatusInvitationIssued => 'Invitation issued';

  @override
  String get enumVisaStatusApplied => 'Applied';

  @override
  String get enumVisaStatusApproved => 'Approved';

  @override
  String get enumVisaStatusRejected => 'Rejected';

  @override
  String get enumTravelKindFlight => 'Flight';

  @override
  String get enumTravelKindAirportPickup => 'Airport pickup';

  @override
  String get enumTravelKindAirportDrop => 'Airport drop';

  @override
  String get enumTravelKindLocalTransport => 'Local transport';

  @override
  String get enumServiceBookingStatusRequested => 'Requested';

  @override
  String get enumServiceBookingStatusQuoted => 'Quoted';

  @override
  String get enumServiceBookingStatusConfirmed => 'Confirmed';

  @override
  String get enumServiceBookingStatusCompleted => 'Completed';

  @override
  String get enumServiceBookingStatusCancelled => 'Cancelled';

  @override
  String get enumAccommodationTypeHotel => 'Hotel';

  @override
  String get enumAccommodationTypeGuestHouse => 'Guest house';

  @override
  String get enumAccommodationTypeServiceApartment => 'Service apartment';

  @override
  String get enumAccommodationTypeHospitalGuestRoom => 'Hospital guest room';

  @override
  String get enumServiceKindTranslator => 'Translator';

  @override
  String get enumServiceKindLocalGuide => 'Local guide';

  @override
  String get enumServiceKindTransport => 'Transport';

  @override
  String get enumServiceKindTravelAgent => 'Travel agent';

  @override
  String get enumServiceKindInsurance => 'Insurance';

  @override
  String get enumDocumentKindPassport => 'Passport';

  @override
  String get enumDocumentKindVisa => 'Visa';

  @override
  String get enumDocumentKindMedicalReport => 'Medical report';

  @override
  String get enumDocumentKindPrescription => 'Prescription';

  @override
  String get enumDocumentKindLabResult => 'Lab result';

  @override
  String get enumDocumentKindImaging => 'Imaging';

  @override
  String get enumDocumentKindInvitationLetter => 'Invitation letter';

  @override
  String get enumDocumentKindInvoice => 'Invoice';

  @override
  String get enumDocumentKindReceipt => 'Receipt';

  @override
  String get enumDocumentKindKycRegistration => 'Kyc registration';

  @override
  String get enumDocumentKindKycAccreditation => 'Kyc accreditation';

  @override
  String get enumDocumentKindKycPan => 'PAN card';

  @override
  String get enumDocumentKindKycGst => 'GST certificate';

  @override
  String get enumDocumentKindKycIdProof => 'ID proof';

  @override
  String get enumDocumentKindBankProof => 'Bank proof';

  @override
  String get enumDocumentKindPaymentProof => 'Payment proof';

  @override
  String get enumDocumentKindOther => 'Other';

  @override
  String get enumDocumentStatusUploaded => 'Uploaded';

  @override
  String get enumDocumentStatusVerified => 'Verified';

  @override
  String get enumDocumentStatusRejected => 'Rejected';

  @override
  String get enumConsentKindTerms => 'Terms';

  @override
  String get enumConsentKindPrivacy => 'Privacy';

  @override
  String get enumConsentKindAiProcessing => 'Ai processing';

  @override
  String get enumConsentKindShareWithHospitals => 'Share with hospitals';

  @override
  String get enumConsentKindMarketing => 'Marketing';

  @override
  String get enumConsentKindShareWithAgent => 'Share with agent';

  @override
  String get enumConsentKindGuardianConsent => 'Guardian consent';

  @override
  String get enumPaymentGatewayRazorpay => 'Credit/Debit Card';

  @override
  String get enumPaymentGatewayStripe => 'Card (Stripe)';

  @override
  String get enumPaymentGatewayBankTransfer => 'Bank Transfer';

  @override
  String get enumPaymentGatewayMock => 'Test payment';

  @override
  String get enumPaymentPurposeConsultationFee => 'Consultation fee';

  @override
  String get enumPaymentPurposeBookingDeposit => 'Booking deposit';

  @override
  String get enumPaymentPurposeBookingBalance => 'Booking balance';

  @override
  String get enumPaymentPurposeBookingFull => 'Booking full';

  @override
  String get enumPaymentPurposeInstallment => 'Installment';

  @override
  String get enumPaymentPurposeService => 'Service';

  @override
  String get enumOrderStatusCreated => 'Created';

  @override
  String get enumOrderStatusPending => 'Pending';

  @override
  String get enumOrderStatusPaid => 'Paid';

  @override
  String get enumOrderStatusPartiallyRefunded => 'Partially refunded';

  @override
  String get enumOrderStatusRefunded => 'Refunded';

  @override
  String get enumOrderStatusFailed => 'Failed';

  @override
  String get enumOrderStatusExpired => 'Expired';

  @override
  String get enumOrderStatusCancelled => 'Cancelled';

  @override
  String get enumPaymentStatusCreated => 'Created';

  @override
  String get enumPaymentStatusAuthorized => 'Authorized';

  @override
  String get enumPaymentStatusCaptured => 'Captured';

  @override
  String get enumPaymentStatusFailed => 'Failed';

  @override
  String get enumPaymentStatusRefunded => 'Refunded';

  @override
  String get enumPaymentStatusPartiallyRefunded => 'Partially refunded';

  @override
  String get enumRefundStatusRequested => 'Requested';

  @override
  String get enumRefundStatusApproved => 'Approved';

  @override
  String get enumRefundStatusProcessing => 'Processing';

  @override
  String get enumRefundStatusProcessed => 'Processed';

  @override
  String get enumRefundStatusFailed => 'Failed';

  @override
  String get enumRefundStatusRejected => 'Rejected';

  @override
  String get enumInstallmentStatusDue => 'Due';

  @override
  String get enumInstallmentStatusPaid => 'Paid';

  @override
  String get enumInstallmentStatusOverdue => 'Overdue';

  @override
  String get enumInstallmentStatusCancelled => 'Cancelled';

  @override
  String get enumInvoiceKindPatientReceipt => 'Patient receipt';

  @override
  String get enumInvoiceKindCommissionInvoice => 'Commission invoice';

  @override
  String get enumInvoiceKindAgentStatement => 'Agent statement';

  @override
  String get enumPayeeTypeHospital => 'Hospital';

  @override
  String get enumPayeeTypeAgent => 'Agent';

  @override
  String get enumPayeeTypeVendor => 'Vendor';

  @override
  String get enumItineraryItemStatusScheduled => 'Scheduled';

  @override
  String get enumItineraryItemStatusDone => 'Done';

  @override
  String get enumItineraryItemStatusCancelled => 'Cancelled';

  @override
  String get enumVisaTypeEMedical => 'e-Medical Visa';

  @override
  String get enumVisaTypeEMedicalAttendant => 'e-Medical Attendant Visa';

  @override
  String get enumSosStatusOpen => 'Open';

  @override
  String get enumSosStatusAcknowledged => 'Acknowledged';

  @override
  String get enumSosStatusResolved => 'Resolved';

  @override
  String get enumConversationKindCaseThread => 'Case';

  @override
  String get enumConversationKindSupport => 'Support';

  @override
  String get enumConversationKindDirect => 'Direct';

  @override
  String get enumSavedEntityTypeHospital => 'Hospital';

  @override
  String get enumSavedEntityTypeDoctor => 'Doctor';

  @override
  String get enumSavedEntityTypeProcedure => 'Procedure';

  @override
  String get enumConsultationModeVideo => 'Video';

  @override
  String get enumConsultationModePhone => 'Phone';

  @override
  String get enumSlotKindConsultation => 'Consultation';

  @override
  String get enumSlotKindAdmission => 'Admission';

  @override
  String get enumTriageEngineClaude => 'AI (Claude)';

  @override
  String get enumTriageEngineRules => 'Rules engine';

  @override
  String get enumLikelihoodLow => 'Low';

  @override
  String get enumLikelihoodMedium => 'Medium';

  @override
  String get enumLikelihoodHigh => 'High';

  @override
  String get enumDevicePlatformAndroid => 'Android';

  @override
  String get enumDevicePlatformIos => 'Ios';

  @override
  String get enumDevicePlatformWeb => 'Web';

  @override
  String get enumPreviousTreatmentMedication => 'Medication';

  @override
  String get enumPreviousTreatmentPhysicalTherapy => 'Physical therapy';

  @override
  String get enumPreviousTreatmentSurgery => 'Surgery';

  @override
  String get enumPreviousTreatmentOther => 'Other';

  @override
  String get enumChecklistKeyTreatmentBooked => 'Treatment booked';

  @override
  String get enumChecklistKeyVisaApproved => 'Visa approved';

  @override
  String get enumChecklistKeyFlightBooked => 'Flight Booking';

  @override
  String get enumChecklistKeyTravelInsurance => 'Travel insurance';

  @override
  String get enumChecklistKeyAirportPickup => 'Airport pickup';

  @override
  String get enumChecklistKeyDocumentsUploaded => 'Documents uploaded';

  @override
  String get enumChecklistKeyAccommodationBooked => 'Accommodation booked';

  @override
  String get enumAnalysisStatusQueued => 'Queued';

  @override
  String get enumAnalysisStatusProcessing => 'Processing';

  @override
  String get enumAnalysisStatusCompleted => 'Completed';

  @override
  String get enumAnalysisStatusFailed => 'Failed';

  @override
  String get enumAnalysisStatusUnsupported => 'Unsupported';

  @override
  String get enumAnalysisReviewStatusPendingReview => 'Pending review';

  @override
  String get enumAnalysisReviewStatusConfirmed => 'Confirmed';

  @override
  String get enumAnalysisReviewStatusRejected => 'Rejected';

  @override
  String get enumReportDocTypeLabReport => 'Lab report';

  @override
  String get enumReportDocTypeImagingReport => 'Imaging report';

  @override
  String get enumReportDocTypeDischargeSummary => 'Discharge summary';

  @override
  String get enumReportDocTypePrescription => 'Prescription';

  @override
  String get enumReportDocTypeConsultationNote => 'Consultation note';

  @override
  String get enumReportDocTypePathologyReport => 'Pathology report';

  @override
  String get enumReportDocTypeInsuranceDocument => 'Insurance document';

  @override
  String get enumReportDocTypeOther => 'Other';

  @override
  String get enumFindingSignificanceNormal => 'Normal';

  @override
  String get enumFindingSignificanceAttention => 'Attention';

  @override
  String get enumFindingSignificanceUrgent => 'Urgent';

  @override
  String get enumLabFlagLow => 'Low';

  @override
  String get enumLabFlagHigh => 'High';

  @override
  String get enumLabFlagNormal => 'Normal';

  @override
  String get enumLabFlagCritical => 'Critical';

  @override
  String get enumLabFlagUnknown => 'Unknown';

  @override
  String get enumVoiceStatusQueued => 'Queued';

  @override
  String get enumVoiceStatusProcessing => 'Processing';

  @override
  String get enumVoiceStatusCompleted => 'Completed';

  @override
  String get enumVoiceStatusFailed => 'Failed';

  @override
  String get enumVoiceReviewStatusPendingReview => 'Pending review';

  @override
  String get enumVoiceReviewStatusConfirmed => 'Confirmed';

  @override
  String get enumVoiceReviewStatusDiscarded => 'Discarded';

  @override
  String get coreInvalidCredentials => 'Invalid email or password.';

  @override
  String get coreGoogleSignInUnavailable => 'Google sign-in is not available in this build.';

  @override
  String get coreGoogleNoToken => 'Google did not return a token.';

  @override
  String get coreGoogleSignInFailed => 'Google sign-in failed.';

  @override
  String get coreAppleNoToken => 'Apple did not return a token.';

  @override
  String coreAppleSignInFailed(String error) {
    return 'Sign in with Apple failed ($error).';
  }

  @override
  String get coreNoFileSelected => 'No file selected.';

  @override
  String get coreUploadUnsupportedType => 'Unsupported file type. Use PDF, JPG, PNG, WEBP, HEIC or DICOM.';

  @override
  String get coreUploadTooLarge => 'File is too large (max 20 MB).';

  @override
  String get coreScreeningAnalysisSlow =>
      'Analysis is taking longer than expected. We will notify you when it is ready.';

  @override
  String get coreBiometricPay => 'Pay';

  @override
  String get coreBiometricPayFaceId => 'Pay with Face ID';

  @override
  String get coreBiometricPayFingerprint => 'Pay with fingerprint';

  @override
  String get coreBiometricConfirmReason => 'Confirm your payment';

  @override
  String get coreLocationServiceOff => 'Location is switched off on your phone.';

  @override
  String get coreLocationDenied => 'Location permission was not given.';

  @override
  String get coreLocationBlocked => 'Location is blocked for this app in your phone settings.';

  @override
  String get coreLocationUnavailable => 'Your phone could not find your location in time.';

  @override
  String corePackageNightsAccommodation(int nights) {
    String _temp0 = intl.Intl.pluralLogic(nights, locale: localeName, other: '$nights nights accommodation');
    return '$_temp0';
  }

  @override
  String get corePackageAirportPickup => 'Airport pickup';

  @override
  String get corePackageTranslator => 'Translator';

  @override
  String get corePackageMeals => 'Meals';

  @override
  String get corePackageLocalTransport => 'Local transport';

  @override
  String corePackageFollowupTeleconsults(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count follow-up teleconsults');
    return '$_temp0';
  }

  @override
  String coreSavePercent(int pct) {
    return 'Save $pct%';
  }

  @override
  String coreSavePercentRange(int min, int max) {
    return 'Save $min-$max%';
  }

  @override
  String get coreUserGuest => 'Guest';

  @override
  String get coreUserPatient => 'Patient';

  @override
  String coreMatchScore(int score) {
    return '$score% Match';
  }

  @override
  String get coreErrorOffline => 'You are offline';

  @override
  String get coreAvatarLabel => 'Avatar';

  @override
  String coreRatingCaption(String rating) {
    return '($rating/5)';
  }

  @override
  String coreRatingCaptionReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '($rating/5 from $count reviews)');
    return '$_temp0';
  }

  @override
  String coreRatingSemantics(String rating) {
    return 'Rated $rating out of 5';
  }

  @override
  String coreRatingSemanticsReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Rated $rating out of 5 from $count reviews',
    );
    return '$_temp0';
  }

  @override
  String coreStepProgress(int step, int total) {
    return 'Step $step of $total';
  }

  @override
  String coreStepProgressWithSuffix(int step, int total, String suffix) {
    return 'Step $step of $total · $suffix';
  }

  @override
  String get navHome => 'Home';

  @override
  String get navSearch => 'Search';

  @override
  String get navTrips => 'Trips';

  @override
  String get navMessages => 'Messages';

  @override
  String get navProfile => 'Profile';

  @override
  String get routerNotFoundTitle => 'Page not found';

  @override
  String routerNotFoundMessage(String location) {
    return 'We could not find \"$location\".';
  }

  @override
  String get routerGoHome => 'Go home';

  @override
  String get homeTitle => 'What brings you to India?';

  @override
  String get homeSubtitle => 'Select your medical need';

  @override
  String get homeSearchHint => 'Search for a condition';

  @override
  String get homeSearchButton => 'Search';

  @override
  String get homeAllSpecialties => 'All specialties';

  @override
  String get homeNoSpecialtiesTitle => 'No specialties yet';

  @override
  String get homeNoSpecialtiesMessage => 'Search hospitals and doctors instead.';

  @override
  String get homeMoreTile => 'More';

  @override
  String get homeMoreTileSubtitle => 'Other Specialties';

  @override
  String get homeTripEyebrow => 'Your upcoming trip';

  @override
  String get homeTripFallbackTitle => 'Treatment in India';

  @override
  String get homeTripDateTbc => 'Date to be confirmed';

  @override
  String get homeTripToday => 'Today';

  @override
  String get homeTripTomorrow => 'Tomorrow';

  @override
  String get homeTripInProgress => 'In progress';

  @override
  String homeTripInDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: 'In $days days');
    return '$_temp0';
  }

  @override
  String homeTripAdmission(String date) {
    return 'Admission $date';
  }

  @override
  String get homeScreeningEyebrow => 'AI screening';

  @override
  String get homeMatchesReadyTitle => 'Your matches are ready';

  @override
  String get homeMatchesReadySubtitle => 'See hospitals and doctors matched to you';

  @override
  String homeMatchesReadySubtitleSpecialty(String specialty) {
    return '$specialty · see your matched doctors';
  }

  @override
  String get homeScreeningProcessingTitle => 'Finding your best matches';

  @override
  String get homeScreeningProcessingSubtitle => 'We are analysing your answers';

  @override
  String get homeScreeningContinueTitle => 'Continue your screening';

  @override
  String get homeScreeningContinueSubtitle => 'Pick up where you left off';

  @override
  String homeScreeningContinueSubtitleSpecialty(String specialty) {
    return '$specialty · pick up where you left off';
  }

  @override
  String get onboardingWelcomeChip => 'Welcome';

  @override
  String get onboardingImpactStat => '500,000+';

  @override
  String get onboardingImpactStatCaption => 'Patients Treated';

  @override
  String get onboardingImpactStatFootnote => 'across our partner hospitals';

  @override
  String get onboardingImpactHeadline => 'World-Class Healthcare at 70% Less Cost';

  @override
  String get onboardingBadgeJciDescription => 'Joint Commission International accredited partner hospitals';

  @override
  String get onboardingBadgeNabhDescription => 'NABH accredited partner hospitals';

  @override
  String get onboardingBadgeWhoDescription => 'Care that follows WHO patient-safety guidelines';

  @override
  String get onboardingAccreditationsCaption => 'Accreditations held by our partner hospitals';

  @override
  String get onboardingNextPage => 'Next page';

  @override
  String get onboardingTrustTitle => 'Care you can trust';

  @override
  String get onboardingTrustDoctorsTitle => 'English-Speaking Doctors';

  @override
  String get onboardingTrustDoctorsSubtitle => 'Communicate with ease.';

  @override
  String get onboardingTrustWaitTitle => 'Zero Wait Time';

  @override
  String get onboardingTrustWaitSubtitle => 'Get prompt medical attention.';

  @override
  String get onboardingTrustCertifiedTitle => 'Joint Commission Certified';

  @override
  String get onboardingTrustCertifiedSubtitle => 'Internationally accredited partner facilities.';

  @override
  String get onboardingTestimonialQuote => '\"Saved \$45,000 on my cardiac surgery with better care than home.\"';

  @override
  String get onboardingTestimonialAuthor => 'Patient from the USA';

  @override
  String get onboardingTestimonialDisclaimer => 'Illustrative example';

  @override
  String get onboardingStepShareTitle => 'Share Condition';

  @override
  String get onboardingStepShareSubtitle => 'Securely provide your medical information.';

  @override
  String get onboardingStepMatchTitle => 'Get Matched';

  @override
  String get onboardingStepMatchSubtitle => 'Our AI finds the best hospitals for you.';

  @override
  String get onboardingStepCompareTitle => 'Compare Costs';

  @override
  String get onboardingStepCompareSubtitle => 'Transparent pricing to make informed decisions.';

  @override
  String get onboardingStepBookTitle => 'Book Treatment';

  @override
  String get onboardingStepBookSubtitle => 'Schedule your appointment hassle-free.';

  @override
  String get onboardingSecurityBadge => 'Encrypted & Secure';

  @override
  String get onboardingSecurityFooter => 'Your medical data is encrypted and shared only with hospitals you choose';

  @override
  String get onboardingGetStarted => 'Get Started';

  @override
  String get onboardingExploreAsGuest => 'Explore as Guest';

  @override
  String onboardingPageDots(int page, int count) {
    return 'Page $page of $count';
  }

  @override
  String get messagesTitle => 'Messages';

  @override
  String get messagesContactSupport => 'Contact support';

  @override
  String get messagesEmptyTitle => 'No conversations yet';

  @override
  String get messagesEmptyMessage =>
      'When you request a quote, a chat with the hospital and your coordinator opens here. You can also contact our support team any time.';

  @override
  String get messagesNoMessagesYet => 'No messages yet';

  @override
  String get messagesAttachment => 'Attachment';

  @override
  String messagesPreviewMine(String message) {
    return 'You: $message';
  }

  @override
  String messagesPreviewSender(String sender, String message) {
    return '$sender: $message';
  }

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsMarkAllRead => 'Mark all read';

  @override
  String get notificationsEmptyTitle => 'You are all caught up';

  @override
  String get notificationsEmptyMessage => 'Quotes, booking updates, reminders and messages will show up here.';

  @override
  String notificationsBellUnread(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Notifications, $count unread');
    return '$_temp0';
  }

  @override
  String get supportLocationMarked => 'Location marked. It is shared only if you send an SOS.';

  @override
  String get supportRealtimeNotifications => 'Real-time Notifications';

  @override
  String get supportNotificationsEmpty => 'Appointment reminders and updates appear here as they happen.';

  @override
  String get supportCallHelpline => 'Call 24/7 Helpline';

  @override
  String get supportGetTranslator => 'Get Translator';

  @override
  String get supportLocalGuide => 'Local Guide';

  @override
  String get supportBookFirst => 'Book your treatment first, or ask our support team in Messages.';

  @override
  String get supportTranslatorRequested => 'Translator requested. Your coordinator will confirm shortly.';

  @override
  String get supportGuideRequested => 'Local guide requested. Your coordinator will confirm shortly.';

  @override
  String get supportScheduleTitle => 'Your schedule';

  @override
  String get supportScheduleEmpty => 'Your hospital will add appointments here.';

  @override
  String supportScheduleWhen(String weekday, String time) {
    return '$weekday, $time';
  }

  @override
  String get supportTodaysSchedule => 'Today\'s Schedule';

  @override
  String get supportNextOnSchedule => 'Next on your schedule';

  @override
  String get supportNothingToday => 'Nothing scheduled today';

  @override
  String get cultureTipsTitle => 'Cultural Tips';

  @override
  String get cultureTipsEmpty => 'Tips will appear here soon.';

  @override
  String get sosButtonSemantics => 'SOS emergency alert';

  @override
  String get sosConfirmTitle => 'Send an emergency alert?';

  @override
  String get sosConfirmBody => 'Your coordinator and our 24/7 support team are alerted immediately.';

  @override
  String get sosMessageLabel => 'What is happening? (optional)';

  @override
  String get sosShareLocationTitle => 'Share my current location with the support team';

  @override
  String get sosShareLocationMarkedHint =>
      'Used only for this alert. If your phone cannot find you, the place you marked on the map is shared instead.';

  @override
  String get sosShareLocationHint =>
      'Used only for this alert, so we can find you faster. Your phone may ask for permission.';

  @override
  String get sosSendButton => 'Send SOS';

  @override
  String get sosGettingLocation => 'Getting your location…';

  @override
  String get sosSendingAlert => 'Sending your alert…';

  @override
  String get sosLocationShared => 'Your current location was shared with the team.';

  @override
  String sosLocationFallbackMarked(String reason) {
    return '$reason The place you marked on the map was shared instead.';
  }

  @override
  String sosLocationFallbackNone(String reason) {
    return '$reason Tell the team where you are when they call.';
  }

  @override
  String get sosResultSentTitle => 'Help is on the way';

  @override
  String get sosResultSentBody =>
      'Your coordinator and our 24/7 support team have been alerted and will call you shortly.';

  @override
  String get sosResultDangerNote => 'If your life is in danger, call emergency services now.';

  @override
  String get sosResultFailedTitle => 'Alert could not be sent';

  @override
  String get sosResultFailedBody => 'Please call for help directly.';

  @override
  String get sosCallHelpline => 'Call helpline';

  @override
  String sosCallNumber(String number) {
    return 'Call $number';
  }

  @override
  String get mapLongPressHint => 'Long-press the map to mark where you are.';

  @override
  String get mapAttribution => 'OpenStreetMap contributors';

  @override
  String get mapZoomIn => 'Zoom in';

  @override
  String get mapZoomOut => 'Zoom out';

  @override
  String get mapShowMyPlaces => 'Show my places';

  @override
  String get screeningAppBarTitle => 'AI Screening';

  @override
  String get screeningStartErrorTitle => 'Could not start your screening';

  @override
  String get screeningStartPreparing => 'Preparing your questionnaire...';

  @override
  String get screeningStartHeading => 'What brings you to India?';

  @override
  String get screeningStartSubtitle =>
      'Pick the area of care. Four short steps help us match you with the right doctors.';

  @override
  String get screeningStartNotSure => 'Not sure?';

  @override
  String get screeningStartNotSureBody => 'Describe your symptoms and we will suggest a specialty.';

  @override
  String get screeningResumeTitle => 'Continue your screening';

  @override
  String get screeningResumeGeneral => 'General';

  @override
  String get screeningLoadingAnswers => 'Loading your answers...';

  @override
  String get screeningAlreadySubmittedAppBar => 'Screening';

  @override
  String get screeningResultsReadyTitle => 'Your results are ready';

  @override
  String get screeningAlreadySubmittedTitle => 'This screening was already submitted';

  @override
  String get screeningResultsReadyMessage => 'Answers can no longer be changed. Start a new screening to answer again.';

  @override
  String get screeningAnalysingMessage => 'We are analysing your answers.';

  @override
  String get screeningViewMatches => 'View my matches';

  @override
  String get screeningSeeProgress => 'See progress';

  @override
  String get screeningStartNewButton => 'Start a new screening';

  @override
  String get screeningProcessingStepAnalyzing => 'Analyzing your condition';

  @override
  String get screeningProcessingStepMatching => 'Matching with specialists';

  @override
  String get screeningProcessingStepSavings => 'Calculating savings';

  @override
  String screeningChecklistRowSemantics(String label, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'done': 'done', 'active': 'in progress', 'other': 'pending'});
    return '$label, $_temp0';
  }

  @override
  String get screeningProcessingHelpTitle => 'What is happening?';

  @override
  String get screeningProcessingHelpBody =>
      'We review your answers (with AI if you agreed), suggest the right specialty and match you with accredited Indian hospitals and doctors by expertise, language, budget and availability. This usually takes under a minute. It is not a diagnosis.';

  @override
  String get screeningProcessingReady => 'Your matches are ready!';

  @override
  String get screeningProcessingFinding => 'Finding Your Perfect Match...';

  @override
  String get screeningProcessingTip =>
      'Tip: you can compare up to 3 matches side by side and see the full cost breakdown.';

  @override
  String get screeningProcessingFailedTitle => 'We could not complete the analysis';

  @override
  String get screeningProcessingFailedMessage => 'Something went wrong while analysing your answers.';

  @override
  String get screeningProcessingTimeoutTitle => 'This is taking longer than usual';

  @override
  String get screeningProcessingTimeoutMessage =>
      'We will notify you as soon as your matches are ready. You can keep waiting or come back later.';

  @override
  String get screeningProcessingKeepWaiting => 'Keep waiting';

  @override
  String get screeningGoHome => 'Go to Home';

  @override
  String get screeningNotSubmittedTitle => 'This screening has not been submitted';

  @override
  String get screeningNotSubmittedMessage => 'Finish the questionnaire to get your matches.';

  @override
  String get screeningContinueQuestionnaire => 'Continue questionnaire';

  @override
  String get screeningProcessingLostTitle => 'We lost track of your screening';

  @override
  String get screeningPrevious => 'Previous';

  @override
  String get screeningHelpTooltip => 'Help';

  @override
  String get screeningHelpDialogTitle => 'How this works';

  @override
  String get screeningHelpGotIt => 'Got it';

  @override
  String get screeningSaveExit => 'Save & Exit';

  @override
  String get screeningProgressSaved => 'Progress saved. Continue any time from Home.';

  @override
  String get screeningValidateBodyArea => 'Tap the body to select at least one area.';

  @override
  String get screeningValidateSymptoms => 'Answer \"yes\" or \"maybe\" to at least one symptom, or add your own.';

  @override
  String get screeningValidateDuration => 'Tell us how long you have had this condition.';

  @override
  String get screeningValidateBudget => 'The minimum budget must not exceed the maximum.';

  @override
  String get screeningValidateTravelWindow => 'The travel window must end after it starts.';

  @override
  String get screeningStep1Title => 'Where are you experiencing issues?';

  @override
  String get screeningStep1Subtitle => 'Tap on the body to select the area.';

  @override
  String screeningStep1SubtitleWithSpecialty(String specialty) {
    return 'Tap on the body to select the area · $specialty';
  }

  @override
  String get screeningNoAreaSelected => 'No area selected yet';

  @override
  String get screeningStep2Title => 'Which symptoms are you experiencing?';

  @override
  String get screeningStep2Help =>
      'Swipe a card right (or tap the check) if you have the symptom, left (or X) if you do not, and up (or -) if you are not sure. Add anything we did not ask about below.';

  @override
  String get screeningSymptomsLoading => 'Loading suggestions...';

  @override
  String get screeningSymptomsUnavailable => 'Suggestions are unavailable. Add your symptoms below.';

  @override
  String get screeningYourSymptoms => 'Your Symptoms';

  @override
  String get screeningYourSymptomsEmpty => 'Symptoms you answer \"yes\" or \"maybe\" to appear here.';

  @override
  String screeningSymptomMaybeChip(String name) {
    return '$name (maybe)';
  }

  @override
  String get screeningAddAnotherSymptom => 'Add another symptom';

  @override
  String screeningSymptomTooLong(int max) {
    return 'Keep the symptom under $max characters.';
  }

  @override
  String screeningSymptomLimit(int max) {
    return 'You can add up to $max symptoms.';
  }

  @override
  String get screeningStep3Title => 'How long have you had this condition?';

  @override
  String get screeningDecrease => 'Decrease';

  @override
  String get screeningIncrease => 'Increase';

  @override
  String get screeningSeverity => 'Severity';

  @override
  String get screeningDailyImpact => 'Daily Impact';

  @override
  String get screeningImpactWork => 'Work';

  @override
  String get screeningImpactSleep => 'Sleep';

  @override
  String get screeningImpactMobility => 'Mobility';

  @override
  String get screeningImpactWorkQuestion => 'How much does it affect your work?';

  @override
  String get screeningImpactSleepQuestion => 'How much does it affect your sleep?';

  @override
  String get screeningImpactMobilityQuestion => 'How much does it affect mobility?';

  @override
  String screeningSeverityPillSemantics(String dimension, String level) {
    return '$dimension $level';
  }

  @override
  String get screeningPreviousTreatments => 'Previous Treatments';

  @override
  String get screeningPreviousReports => 'Previous Reports';

  @override
  String get screeningOptionalParen => '(Optional)';

  @override
  String get screeningScanUpload => 'Scan or upload medical reports';

  @override
  String get screeningScanUploadHint =>
      'Photograph paper pages or pick a PDF · our AI reads it and you confirm the details';

  @override
  String get screeningAttachWithoutAi => 'Attach a file without AI (e.g. DICOM)';

  @override
  String get screeningNotesLabel => 'Anything else we should know? (optional)';

  @override
  String screeningRemoveReportTooltip(String name) {
    return 'Remove $name';
  }

  @override
  String screeningAttachLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'You can attach up to $count reports.',
      one: 'You can attach up to $count report.',
    );
    return '$_temp0';
  }

  @override
  String screeningAttachPagesLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Only $count report pages can be attached to a screening.',
      one: 'Only $count report page can be attached to a screening.',
    );
    return '$_temp0';
  }

  @override
  String get screeningReportDefaultLabel => 'Medical report';

  @override
  String screeningReportNumbered(int index) {
    return 'Medical report $index';
  }

  @override
  String screeningReportPage(String label, int page) {
    return '$label p.$page';
  }

  @override
  String get screeningReportAiConfirmed => 'AI reading confirmed';

  @override
  String get screeningReportAiToReview => 'AI reading to review';

  @override
  String get screeningStep4Title => 'Personalize Your Matches';

  @override
  String get screeningFindDoctors => 'Find My Doctors';

  @override
  String get screeningSkipDefaults => 'Skip & Use Defaults';

  @override
  String get screeningLangHindi => 'Hindi';

  @override
  String get screeningLangEnglish => 'English';

  @override
  String get screeningLangArabic => 'Arabic';

  @override
  String get screeningLangSpanish => 'Spanish';

  @override
  String get screeningLangFrench => 'French';

  @override
  String get screeningLangRussian => 'Russian';

  @override
  String get screeningPrefDoctorGender => 'Doctor Gender';

  @override
  String get screeningPrefBudgetRange => 'Budget Range';

  @override
  String get screeningPrefYourBudget => 'Your budget';

  @override
  String get screeningPrefAnyBudget => 'Any budget';

  @override
  String get screeningPrefClearBudget => 'Clear budget';

  @override
  String get screeningPrefTravelWindow => 'Travel Window';

  @override
  String screeningPrefTravelFrom(String date) {
    return 'From $date - pick an end date';
  }

  @override
  String screeningPrefTravelRange(String start, String end) {
    return '$start - $end';
  }

  @override
  String get screeningPrefUseAi => 'Use AI Recommendations';

  @override
  String get screeningPrefUseAiOn => 'Requires your consent before analysis';

  @override
  String get screeningPrefUseAiOff => 'Standard rules-based matching';

  @override
  String get consentAiTitle => 'Use AI recommendations?';

  @override
  String get consentAiPointData =>
      'Your answers (and any reports you attached) are sent to our AI service to suggest relevant specialties, procedures and questions for your doctor.';

  @override
  String get consentAiPointNotDiagnosis =>
      'This is not a diagnosis. A qualified doctor at the hospital reviews your case before any treatment.';

  @override
  String get consentAiPointPrivacy =>
      'Your data is used only for this screening and is never sold. You can withdraw consent in your profile.';

  @override
  String get consentAiPointAlternative =>
      'Prefer not to? We will match you with our standard rules-based engine instead.';

  @override
  String get consentAiAgree => 'I agree, use AI';

  @override
  String get consentAiDecline => 'Use standard matching';

  @override
  String get bodyMapHead => 'Head';

  @override
  String get bodyMapNeck => 'Neck';

  @override
  String get bodyMapChest => 'Chest';

  @override
  String get bodyMapAbdomen => 'Abdomen';

  @override
  String get bodyMapPelvis => 'Pelvis';

  @override
  String get bodyMapRegionBack => 'Back';

  @override
  String get bodyMapLeftArm => 'Left arm';

  @override
  String get bodyMapRightArm => 'Right arm';

  @override
  String get bodyMapLeftLeg => 'Left leg';

  @override
  String get bodyMapRightLeg => 'Right leg';

  @override
  String get bodyMapSkin => 'Skin';

  @override
  String get bodyMapGeneral => 'Whole body / general';

  @override
  String get bodyMapViewFront => 'Front';

  @override
  String get bodyMapViewBack => 'Back';

  @override
  String get painIntensityTitle => 'Pain Intensity';

  @override
  String get painNone => 'No pain';

  @override
  String get painMild => 'Mild';

  @override
  String get painModerate => 'Moderate';

  @override
  String get painSevere => 'Severe';

  @override
  String get painWorst => 'Worst possible';

  @override
  String painValueLabel(int value, String label) {
    return '$value/10 · $label';
  }

  @override
  String painSemantics(int value, String label) {
    return 'Pain $value out of 10, $label';
  }

  @override
  String get emergencyTitle => 'Emergency — seek local care now';

  @override
  String get emergencyBody =>
      'Some of your answers may indicate a medical emergency. Please do not wait to travel. Go to the nearest emergency department or call your local emergency number immediately.';

  @override
  String get emergencyWarningSigns => 'Warning signs we noticed';

  @override
  String get emergencyNotDiagnosis => 'This screening is not a diagnosis.';

  @override
  String emergencyCallButton(String number) {
    return 'Call emergency services ($number)';
  }

  @override
  String emergencyDialNow(String number) {
    return 'Dial $number from your phone now.';
  }

  @override
  String get emergencyAckViewResults => 'I understand - view my results anyway';

  @override
  String get emergencyAckContinueRisk => 'I understand the risk - continue';

  @override
  String get symptomDeckAllAnswered => 'All suggestions answered. Add anything else below.';

  @override
  String symptomCardSemantics(String name) {
    return '$name. Do you have this symptom? Swipe right for yes, left for no, up for maybe.';
  }

  @override
  String get symptomSwipeOrTap => 'Swipe or tap to answer';

  @override
  String symptomAnswerSemantics(String answer) {
    return 'Answer $answer';
  }

  @override
  String symptomAnswerTooltip(String answer, String name) {
    return '$answer: $name';
  }

  @override
  String get symptomAddTooltip => 'Add symptom';

  @override
  String symptomRemoveTooltip(String name) {
    return 'Remove $name';
  }

  @override
  String get intakeAppliedBodyAreas => 'body areas';

  @override
  String get intakeAppliedPainIntensity => 'pain intensity';

  @override
  String get intakeAppliedSymptoms => 'symptoms';

  @override
  String get intakeAppliedDuration => 'duration';

  @override
  String get intakeAppliedDailyImpact => 'daily impact';

  @override
  String get intakeAppliedPreviousTreatments => 'previous treatments';

  @override
  String get intakeAppliedNotes => 'notes';

  @override
  String get intakeListSeparator => ', ';

  @override
  String intakeVoiceAddedOnly(String fields) {
    return 'Added $fields.';
  }

  @override
  String intakeVoiceUpdatedOnly(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'updated $count answers.',
      one: 'updated $count answer.',
    );
    return '$_temp0';
  }

  @override
  String intakeVoiceAddedAndUpdated(String fields, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Added $fields; updated $count answers.',
      one: 'Added $fields; updated $count answer.',
    );
    return '$_temp0';
  }

  @override
  String get intakeVoiceAlreadyMatch => 'Your answers already match what you said.';

  @override
  String get intakeConflictPainIntensity => 'Pain intensity';

  @override
  String get intakeConflictHowLong => 'How long';

  @override
  String intakeConflictDailyImpact(String dimension) {
    return 'Daily impact: $dimension';
  }

  @override
  String intakeDurationValue(int value, String unit) {
    return '$value $unit';
  }

  @override
  String get intakeConflictTitle => 'Some answers differ';

  @override
  String get intakeConflictHint =>
      'Tick the answers you want to replace with what you said. Unticked answers stay as they are.';

  @override
  String intakeConflictCompare(String current, String suggested) {
    return 'Yours: $current\nFrom your voice: $suggested';
  }

  @override
  String get intakeMedicalArea => 'Medical area';

  @override
  String get intakeSpecialtyOptional => 'Specialty (optional)';

  @override
  String get intakeNotSure => 'Not sure';

  @override
  String get intakeWhereProblem => 'Where is the problem?';

  @override
  String get intakeAddPain => 'Add pain intensity';

  @override
  String get intakeSymptoms => 'Symptoms';

  @override
  String get intakeAddSymptomHint => 'Add a symptom';

  @override
  String get intakeHowLong => 'How long have you had it?';

  @override
  String get intakeDailyImpact => 'Daily impact';

  @override
  String get intakePreviousTreatments => 'Previous treatments';

  @override
  String get intakeNotesLabel => 'Notes';

  @override
  String get intakeNotesHint => 'Anything else the doctor should know';

  @override
  String get voiceIntakeTitle => 'Describe it by voice';

  @override
  String get voiceReviewTitle => 'Check your answers';

  @override
  String get voiceIntro =>
      'Tell us in your own words where it hurts, since when, how bad it is and what you have already tried.';

  @override
  String get voiceMicOff =>
      'Microphone access is off. Allow it for Heal India Global in your phone settings, or type instead.';

  @override
  String get voiceStartFailed => 'Could not start recording. Please try again or type instead.';

  @override
  String get voiceNothingRecorded => 'Nothing was recorded. Please try again.';

  @override
  String get voiceConsentRequired => 'Please agree to the processing of your recording first.';

  @override
  String get voiceNotUnderstood =>
      'We could not understand the recording. Try again in a quieter place, or type instead.';

  @override
  String get voiceExtractTooShort => 'Please describe your problem in a few words.';

  @override
  String get voiceEmergencyAck => 'I understand - continue reviewing my answers';

  @override
  String get voiceStopRecording => 'Stop recording';

  @override
  String get voiceRecordAgain => 'Record again';

  @override
  String get voiceStartRecording => 'Start recording';

  @override
  String voiceRecordedStatus(String duration) {
    return 'Recorded $duration · tap to record again';
  }

  @override
  String get voiceTapToStart => 'Tap to start speaking';

  @override
  String get voiceInputLevel => 'Input level';

  @override
  String get voiceConsentText =>
      'I agree that my recording is transcribed on Heal India Global\'s own servers and that AI turns it into answers for my screening. The audio is deleted after transcription. I will check everything before it is used.';

  @override
  String get voiceUseRecording => 'Use this recording';

  @override
  String get voiceTypeInstead => 'Type instead';

  @override
  String get voiceTypedHint => 'Describe your problem in your own words…';

  @override
  String get voiceFillAnswers => 'Fill my answers';

  @override
  String get voiceSpeakInstead => 'Speak instead';

  @override
  String get voiceUploading => 'Uploading your recording…';

  @override
  String get voiceReading => 'Reading your description…';

  @override
  String get voiceListening => 'Listening to your recording…';

  @override
  String get voiceCheckEveryAnswer => 'You will check every answer before it is used.';

  @override
  String get voiceEmergencyBanner =>
      'Some of what you described may need urgent care. Please seek local emergency care now.';

  @override
  String get voiceGuidance => 'Guidance';

  @override
  String get voiceReviewIntro => 'Please check what we understood. Change anything that is wrong, then tap Confirm.';

  @override
  String get voiceYourDescription => 'Your description';

  @override
  String get voiceWhatYouSaid => 'What you said';

  @override
  String get voiceAiDisclaimer => 'AI-generated suggestions — not a diagnosis.';

  @override
  String get voiceDiscard => 'Discard';

  @override
  String get searchHint => 'Search hospitals, doctors, treatments';

  @override
  String get searchClearTooltip => 'Clear search';

  @override
  String get searchFiltersTooltip => 'Filters';

  @override
  String get searchTabHospitals => 'Hospitals';

  @override
  String get searchTabDoctors => 'Doctors';

  @override
  String get searchTabProcedures => 'Procedures';

  @override
  String get searchEmptyTryDifferent => 'Try a different search or clear your filters.';

  @override
  String get searchEmptyCheckBack => 'Check back soon - new partners are added regularly.';

  @override
  String get searchClearFilters => 'Clear filters';

  @override
  String get searchNoHospitalsFound => 'No hospitals found';

  @override
  String get searchNoDoctorsFound => 'No doctors found';

  @override
  String get searchNoProceduresFound => 'No procedures found';

  @override
  String searchGenderDoctorsChip(String gender, String label) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'female': 'Female doctors',
      'male': 'Male doctors',
      'other': '$label doctors',
    });
    return '$_temp0';
  }

  @override
  String searchResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count results', one: '$count result');
    return '$_temp0';
  }

  @override
  String get filtersTitle => 'Filters';

  @override
  String get filtersSpecialtyLabel => 'Specialty';

  @override
  String get filtersAnySpecialty => 'Any specialty';

  @override
  String get filtersCityLabel => 'City';

  @override
  String get filtersCityHint => 'e.g. New Delhi, Chennai';

  @override
  String get filtersAccreditationLabel => 'Accreditation (hospitals)';

  @override
  String get filtersLanguageLabel => 'Language spoken';

  @override
  String get filtersDoctorGenderLabel => 'Doctor gender';

  @override
  String get filtersSortLabel => 'Sort hospitals by';

  @override
  String get filtersShowResults => 'Show results';

  @override
  String get filtersSortTopRated => 'Top rated';

  @override
  String get filtersSortLowestPrice => 'Lowest price';

  @override
  String get filtersSortName => 'Name (A-Z)';

  @override
  String get filtersLanguageEnglish => 'English';

  @override
  String get filtersLanguageHindi => 'Hindi';

  @override
  String get filtersLanguageArabic => 'Arabic';

  @override
  String get filtersLanguageFrench => 'French';

  @override
  String get filtersLanguageRussian => 'Russian';

  @override
  String get filtersLanguageBengali => 'Bengali';

  @override
  String get filtersLanguageSwahili => 'Swahili';

  @override
  String get filtersLanguageSpanish => 'Spanish';

  @override
  String catalogApproxPriceTooltip(String amount) {
    return 'Estimated from $amount at today\'s rate';
  }

  @override
  String get catalogInternationalDesk => 'International desk';

  @override
  String get catalogInternationalPatientDesk => 'International patient desk';

  @override
  String get catalogPriceFromPrefix => 'From ';

  @override
  String catalogSuccessBadge(int pct) {
    return '$pct% Success';
  }

  @override
  String get catalogVideoConsult => 'Video consult';

  @override
  String catalogDaysInHospital(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days in hospital');
    return '$_temp0';
  }

  @override
  String catalogPercent(int value) {
    return '$value%';
  }

  @override
  String get catalogAboutSection => 'About';

  @override
  String get catalogLanguagesSpoken => 'Languages spoken';

  @override
  String get catalogTreatmentsPrices => 'Treatments & prices';

  @override
  String get catalogShowLess => 'Show less';

  @override
  String get catalogReadMore => 'Read more';

  @override
  String catalogCouldNotOpen(String target) {
    return 'Could not open $target';
  }

  @override
  String get catalogGetMatched => 'Get matched';

  @override
  String get hospitalDetailNotFound => 'Hospital not found';

  @override
  String get hospitalDetailEstablished => 'Established';

  @override
  String get hospitalDetailBeds => 'Beds';

  @override
  String hospitalDetailDistanceKm(String distance) {
    return '$distance km';
  }

  @override
  String get hospitalDetailFromAirport => 'From airport';

  @override
  String get hospitalDetailTreatmentsFrom => 'Treatments from ';

  @override
  String get hospitalDetailSpecialties => 'Specialties';

  @override
  String get hospitalDetailPricesIndicative =>
      'Prices are indicative. Your final quote comes from the hospital after reviewing your case.';

  @override
  String get hospitalDetailDoctors => 'Doctors';

  @override
  String get hospitalDetailPatientReviews => 'Patient reviews';

  @override
  String get hospitalDetailContact => 'Contact';

  @override
  String get hospitalDetailContactViaCoordinator =>
      'Contact the hospital through your Heal India Global coordinator after requesting a quote.';

  @override
  String get doctorDetailTitle => 'Doctor profile';

  @override
  String doctorDetailExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count yrs');
    return '$_temp0';
  }

  @override
  String get doctorDetailExperience => 'Experience';

  @override
  String get doctorDetailSuccessRate => 'Success rate';

  @override
  String doctorDetailReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count reviews');
    return '$_temp0';
  }

  @override
  String get doctorDetailVideoConsultAvailable => 'Video consultation available';

  @override
  String get doctorDetailConsultationFee => 'Consultation fee';

  @override
  String get doctorDetailQualifications => 'Qualifications';

  @override
  String get doctorDetailExpertise => 'Areas of expertise';

  @override
  String get availabilitySection => 'Availability';

  @override
  String get availabilityNext30Days => 'Availability (next 30 days)';

  @override
  String get availabilityNoSlots =>
      'No open slots published yet - request a quote and the hospital will propose dates.';

  @override
  String availabilityNextAvailable(String date) {
    return 'Next available: $date';
  }

  @override
  String availabilityDayAvailable(String day) {
    return '$day: available';
  }

  @override
  String availabilityDayUnavailable(String day) {
    return '$day: unavailable';
  }

  @override
  String procedureDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days');
    return '$_temp0';
  }

  @override
  String get procedureInHospital => 'In hospital';

  @override
  String get procedureRecovery => 'Recovery';

  @override
  String get procedureTotalStayInIndia => 'Total stay in India';

  @override
  String procedureTypicalCostIn(String country) {
    return 'Typical cost in $country';
  }

  @override
  String procedureWaitTime(String time) {
    return 'Wait time: $time';
  }

  @override
  String get procedureCompareCosts => 'Compare costs';

  @override
  String get quoteRequestButton => 'Request quote';

  @override
  String get quoteRequestedSnack => 'Quote requested. The hospital usually replies within 48 hours.';

  @override
  String get quoteSheetTitle => 'Request a quote';

  @override
  String get quoteTreatmentLabel => 'Treatment (optional)';

  @override
  String get quoteTreatmentNotSure => 'Not sure yet';

  @override
  String get quoteNotesLabel => 'Tell the hospital about your condition';

  @override
  String get quoteNotesHint => 'Diagnosis, current treatment, preferred travel dates...';

  @override
  String quoteConsent(String hospital) {
    return 'I agree to share my profile, medical notes and documents with $hospital so they can prepare a quote.';
  }

  @override
  String get quoteSendRequest => 'Send request';

  @override
  String get savedRemovedSnack => 'Removed from saved';

  @override
  String get savedAddedSnack => 'Saved to your list';

  @override
  String get savedGuestPrompt => 'Create a free account to save hospitals and doctors.';

  @override
  String get savedSignUpAction => 'Sign up';

  @override
  String get savedRemoveTooltip => 'Remove from saved';

  @override
  String get matchSortBestMatch => 'Best match';

  @override
  String get matchSortLowestCost => 'Lowest cost';

  @override
  String get matchSortHighestRating => 'Highest rating';

  @override
  String get matchSortMostExperience => 'Most experience';

  @override
  String get matchSortBy => 'Sort by';

  @override
  String get matchFilterTitle => 'Filter';

  @override
  String get matchFilterJciOnly => 'JCI accredited hospitals only';

  @override
  String get matchFilterVideoConsult => 'Offers video consultation';

  @override
  String get matchFilterSpeaks => 'Speaks';

  @override
  String get matchCardEstimatedTotalCost => 'Estimated Total Cost';

  @override
  String matchCardSaveVsHome(int min, int max) {
    return 'Save $min-$max% vs home';
  }

  @override
  String get matchCardAdded => 'Added';

  @override
  String get matchCardCompare => 'Compare';

  @override
  String get matchCardViewDetails => 'View Details';

  @override
  String get matchDetailWhyThisMatch => 'Why this match';

  @override
  String get matchDetailEstimatedCost => 'Estimated cost';

  @override
  String matchDetailInCountry(String country) {
    return 'In $country: ';
  }

  @override
  String matchDetailSavePct(int min, int max) {
    return 'Save $min-$max%';
  }

  @override
  String get matchDetailFinalPriceNote => 'Final price comes from the hospital quote after they review your case.';

  @override
  String get matchDetailSeeFullComparison => 'See full cost comparison';

  @override
  String get matchDetailSuggestedPackage => 'Suggested package';

  @override
  String get matchDetailCompareCosts => 'Compare Costs';

  @override
  String get matchDetailProceduresPackages => 'Procedures & packages';

  @override
  String get compareTitleShort => 'Compare';

  @override
  String get compareTitle => 'Compare Matches';

  @override
  String get compareNothingTitle => 'Nothing to compare';

  @override
  String get compareNothingMessage => 'Select 2 or 3 matches from your results to compare them side by side.';

  @override
  String get compareStartScreening => 'Start a screening';

  @override
  String get compareNoLongerAvailable => 'These matches are no longer available';

  @override
  String get compareBackToMatches => 'Back to matches';

  @override
  String get compareRowMatch => 'Match';

  @override
  String compareExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count years');
    return '$_temp0';
  }

  @override
  String get compareRowRating => 'Rating';

  @override
  String get compareRowHospital => 'Hospital';

  @override
  String get compareRowAccreditation => 'Accreditation';

  @override
  String get compareRowLanguages => 'Languages';

  @override
  String get compareRowEstCost => 'Est. cost';

  @override
  String get compareLowest => 'Lowest';

  @override
  String get compareRowSavings => 'Savings';

  @override
  String comparePercentRange(int min, int max) {
    return '$min-$max%';
  }

  @override
  String get compareRowPackage => 'Package';

  @override
  String get compareRowWhy => 'Why';

  @override
  String get compareBook => 'Book';

  @override
  String get compareDetails => 'Details';

  @override
  String consultationRequestSentSnack(String caseNumber, String hospital) {
    return 'Request $caseNumber sent to $hospital.';
  }

  @override
  String get consultationConsentRequired => 'Please agree to share your information with the hospital.';

  @override
  String get consultationGuestUpgrade =>
      'Create a free account to send requests to hospitals. Your screening answers are kept.';

  @override
  String get consultationBookTitle => 'Book Consultation';

  @override
  String get consultationMessageLabel => 'Message to the hospital (optional)';

  @override
  String get consultationMessageHint => 'Preferred dates, questions, companions travelling with you...';

  @override
  String consultationConsent(String hospital) {
    return 'I agree to share my screening answers, reports and medical information with $hospital so they can review my case and prepare a quote.';
  }

  @override
  String get consultationCreateAccount => 'Create free account';

  @override
  String get consultationPayAfterAccept =>
      'The hospital replies with a personalised quote. You only pay after you accept it.';

  @override
  String get costTitle => 'Treatment Comparison';

  @override
  String get costFindHospitals => 'Find Hospitals';

  @override
  String get costChangeCountryTooltip => 'Change home country';

  @override
  String costCompareWith(String country) {
    return 'Compare with $country';
  }

  @override
  String costTreatmentIn(String country) {
    return 'Treatment in $country';
  }

  @override
  String get costTreatmentInIndia => 'Treatment in India';

  @override
  String get costRowCost => 'Cost';

  @override
  String get costRowWaitTime => 'Wait Time';

  @override
  String get costVaries => 'Varies';

  @override
  String get costRowInsurance => 'Insurance Coverage';

  @override
  String get costVariesByPlan => 'Varies by plan';

  @override
  String get costIndiaDefaultWait => '1-2 weeks';

  @override
  String costSavingsValue(String amount, int min, int max) {
    return '$amount ($min-$max%)';
  }

  @override
  String get costItemizedTitle => 'Itemized Cost Breakdown';

  @override
  String get costDisclaimer =>
      'Estimates for comparison only. Your final price comes from the hospital\'s personalised quote. Home-country figures are typical published ranges and vary by provider and insurance.';

  @override
  String get costBreakdownInQuote => 'A detailed breakdown is included in the hospital quote.';

  @override
  String costTypicalIn(String country) {
    return 'Typical in $country';
  }

  @override
  String get costChooseTreatment => 'Choose a treatment';

  @override
  String get costChooseTreatmentSubtitle => 'Compare what it costs at home and in India.';

  @override
  String get costSearchTreatments => 'Search treatments';

  @override
  String get costNoTreatmentsFound => 'No treatments found';

  @override
  String get costCategorySurgery => 'Surgery';

  @override
  String get costCategoryHospital => 'Hospital';

  @override
  String get costCategoryMedications => 'Medications';

  @override
  String get costCategoryTestsScans => 'Tests & Scans';

  @override
  String get costCategoryDoctorFees => 'Doctor Fees';

  @override
  String get costCategoryImplants => 'Implants';

  @override
  String get costCategoryOther => 'Other';

  @override
  String get costCategorySurgeryHint => 'Surgeon and anaesthesia fees, operating theatre and consumables.';

  @override
  String get costCategoryHospitalHint => 'Room, nursing care, meals and ICU if required.';

  @override
  String get costCategoryMedicationsHint => 'Medicines during your stay and on discharge.';

  @override
  String get costCategoryTestsScansHint => 'Pre-operative tests, imaging and lab work.';

  @override
  String get costCategoryDoctorFeesHint => 'Consultations and follow-up visits.';

  @override
  String get costCategoryImplantsHint => 'Implants, stents or prosthetics where needed.';

  @override
  String get costCategoryOtherHint => 'Other charges included in the estimate.';

  @override
  String get costCountryUs => 'USA';

  @override
  String get costCountryGb => 'UK';

  @override
  String get costCountryCa => 'Canada';

  @override
  String get costCountryAu => 'Australia';

  @override
  String get costCountryNz => 'New Zealand';

  @override
  String get costCountryAe => 'UAE';

  @override
  String get costCountrySa => 'Saudi Arabia';

  @override
  String get costCountryOm => 'Oman';

  @override
  String get costCountryQa => 'Qatar';

  @override
  String get costCountryKw => 'Kuwait';

  @override
  String get costCountryBh => 'Bahrain';

  @override
  String get costCountryIq => 'Iraq';

  @override
  String get costCountryNg => 'Nigeria';

  @override
  String get costCountryKe => 'Kenya';

  @override
  String get costCountryTz => 'Tanzania';

  @override
  String get costCountryEt => 'Ethiopia';

  @override
  String get costCountryBd => 'Bangladesh';

  @override
  String get costCountryNp => 'Nepal';

  @override
  String get costCountryLk => 'Sri Lanka';

  @override
  String get costCountryAf => 'Afghanistan';

  @override
  String get costCountryUz => 'Uzbekistan';

  @override
  String get costCountryDe => 'Germany';

  @override
  String get costCountryFr => 'France';

  @override
  String get costCountryEs => 'Spain';

  @override
  String get costCountryIt => 'Italy';

  @override
  String get costCountryRu => 'Russia';

  @override
  String get costCountryIn => 'India';

  @override
  String get costCountryYours => 'your country';

  @override
  String get paymentDueDeposit => 'Deposit due now';

  @override
  String get paymentDueBalance => 'Balance due now';

  @override
  String get paymentDueNow => 'Due now';

  @override
  String get paymentDueInstallment => 'Installment due now';

  @override
  String paymentDueInstallmentSeq(int seq) {
    return 'Installment $seq due now';
  }

  @override
  String bookingStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days', one: '$count day');
    return '$_temp0';
  }

  @override
  String bookingStayDaysRange(int min, int max) {
    return '$min-$max days';
  }

  @override
  String get paymentTitle => 'Payment';

  @override
  String get paymentSecureTitle => 'Secure Payment';

  @override
  String get paymentSecureBody => 'Encrypted checkout by our payment partner. Card details never reach our servers.';

  @override
  String get paymentMethodSection => 'Payment Method';

  @override
  String get paymentMethodCard => 'Credit/Debit Card';

  @override
  String get paymentMethodCardAppOnly => 'Available in the Android and iOS app';

  @override
  String get bankTransferTitle => 'Bank Transfer';

  @override
  String get bankSwiftDetails => 'SWIFT Details';

  @override
  String get paymentTestTitle => 'Test payment';

  @override
  String get paymentTestSubtitle => 'Development gateway - no real money moves';

  @override
  String get paymentPlansTitle => 'Payment Plans';

  @override
  String paymentPlansOnBooking(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count monthly installments on this booking',
    );
    return '$_temp0';
  }

  @override
  String get paymentPlansChosenWhenBooking => '3, 6, 12 months - chosen when booking';

  @override
  String get paymentInsurance => 'Insurance';

  @override
  String get bookingInsuranceClaim => 'I want to claim insurance';

  @override
  String get paymentInsuranceRequestedHelp =>
      'Claim requested. Upload your policy and claim forms so our team can help.';

  @override
  String get paymentInsuranceChosenWhenBooking =>
      'Chosen when booking. Ask your coordinator if you want to add a claim.';

  @override
  String get paymentUploadInsuranceDocs => 'Upload insurance documents';

  @override
  String get paymentPriceSummary => 'Price Summary';

  @override
  String paymentChargedInCurrency(String currency) {
    return 'You will be charged in $currency at the exchange rate locked when the order is created.';
  }

  @override
  String paymentPlansCurrentOption(String option) {
    return 'This booking uses \"$option\". Monthly plans over 3, 6 or 12 months are chosen when you book. To switch, ask your coordinator before your first payment.';
  }

  @override
  String get paymentScheduleBeingPrepared => 'Your installment schedule is being prepared.';

  @override
  String get paymentDueDatePending => 'Due date pending';

  @override
  String paymentDueOn(String date) {
    return 'Due $date';
  }

  @override
  String get paymentCardAppOnlySnack =>
      'Card payments are available in the Android and iOS app. Use bank transfer here.';

  @override
  String paymentConfirmReason(String amount) {
    return 'Confirm payment of $amount';
  }

  @override
  String get paymentNotConfirmed => 'Payment not confirmed.';

  @override
  String get paymentMethodNotAvailable => 'This payment method is not available in the app.';

  @override
  String get paymentCardCheckoutFailed => 'Card checkout could not be started. Please try again.';

  @override
  String paymentWalletPending(String wallet) {
    return 'Complete the payment in $wallet. We will confirm your booking once it is received.';
  }

  @override
  String get paymentTestDialogBody => 'Simulate the gateway result for this development order.';

  @override
  String get paymentSimulateFailure => 'Simulate failure';

  @override
  String get paymentSimulateSuccess => 'Simulate success';

  @override
  String get paymentGetBankDetails => 'Get bank transfer details';

  @override
  String get paymentPayButton => 'Pay';

  @override
  String get bookingTreatmentFallback => 'Treatment';

  @override
  String bookingAdmissionDate(String date) {
    return 'Admission $date';
  }

  @override
  String get paymentSubtotal => 'Subtotal';

  @override
  String get paymentDiscount => 'Discount';

  @override
  String get paymentServiceFee => 'Service fee';

  @override
  String get paymentTaxes => 'Taxes';

  @override
  String get paymentTotal => 'Total';

  @override
  String get paymentPaidSoFar => 'Paid so far';

  @override
  String get paymentBalance => 'Balance';

  @override
  String paymentInstallmentDueOn(int seq, String date) {
    return 'Installment $seq due $date';
  }

  @override
  String get paymentBookingCancelledTitle => 'This booking was cancelled';

  @override
  String get paymentNothingDueTitle => 'Nothing to pay right now';

  @override
  String get paymentRefundOriginalMethod => 'Refunds, if any, are returned to the original payment method.';

  @override
  String paymentNothingDueBody(String number) {
    return 'Booking $number has no payment due. We will notify you when the next one is due.';
  }

  @override
  String get paymentGoToTrip => 'Go to my trip';

  @override
  String get paymentResultSuccessTitle => 'Payment successful';

  @override
  String get paymentResultPendingTitle => 'Payment submitted';

  @override
  String get paymentResultFailureTitle => 'Payment failed';

  @override
  String paymentResultSuccessBody(String number) {
    return 'Your booking $number is updated. We have notified your coordinator.';
  }

  @override
  String get paymentResultPendingBody =>
      'We will confirm your booking as soon as the payment is verified. You will get a notification.';

  @override
  String get paymentResultFailureBody => 'No money was taken. Please try again or choose another method.';

  @override
  String get paymentResultAmount => 'Amount';

  @override
  String get paymentResultOrder => 'Order';

  @override
  String get bookingLabel => 'Booking';

  @override
  String get paymentResultPaidOn => 'Paid on';

  @override
  String get paymentResultStatus => 'Status';

  @override
  String get paymentDownloadReceipt => 'Download receipt';

  @override
  String get paymentGetHelp => 'Get help';

  @override
  String get caseViewCase => 'View case';

  @override
  String get paymentReceiptPreparing => 'Your receipt is being prepared. It will appear under Documents shortly.';

  @override
  String get paymentReceiptSaved => 'Receipt saved';

  @override
  String get bankTransferUnavailableTitle => 'Bank transfer is not available';

  @override
  String get bankTransferUnavailableBody => 'Please choose another payment method.';

  @override
  String get bankTransferAmount => 'Amount to transfer';

  @override
  String bankTransferOrder(String number) {
    return 'Order $number';
  }

  @override
  String get bankBeneficiary => 'Beneficiary';

  @override
  String get bankName => 'Bank';

  @override
  String get bankAccountNumber => 'Account number';

  @override
  String get bankPaymentReference => 'Payment reference';

  @override
  String get bankTransferInstructions =>
      'Quote the payment reference exactly so we can match your transfer. International transfers usually take 1-3 business days; your booking is confirmed once our finance team verifies the funds.';

  @override
  String get bankProofSection => 'Proof of transfer';

  @override
  String get bankProofReplace => 'Replace';

  @override
  String get bankProofUpload => 'Upload transfer receipt';

  @override
  String get bankReferenceLabel => 'Bank transaction reference (UTR / MT103)';

  @override
  String get bankReferenceRequired => 'Enter the reference from your bank';

  @override
  String get bankSubmitProof => 'Submit proof';

  @override
  String get bankUploadLater => 'I\'ll upload the proof later';

  @override
  String get bankProofReceived =>
      'Thanks! We received your transfer details. Your booking is confirmed once the funds arrive (usually 1-3 business days).';

  @override
  String bankCopyTooltip(String label) {
    return 'Copy $label';
  }

  @override
  String bankCopied(String label) {
    return '$label copied';
  }

  @override
  String get paymentResponseIncomplete => 'The payment response was incomplete. Please contact support.';

  @override
  String get paymentCancelled => 'Payment cancelled.';

  @override
  String get paymentNotCompleted => 'The payment could not be completed.';

  @override
  String get paymentWalletFallback => 'wallet';

  @override
  String get paymentCardsUnavailableOnDevice => 'Card payments are not available on this device.';

  @override
  String get bookSelectDatesTitle => 'Select Dates';

  @override
  String bookCaseClosedTitle(String status) {
    return 'This case is $status';
  }

  @override
  String get bookCaseClosedBody => 'Open a new enquiry to book treatment.';

  @override
  String get bookProceedToPayment => 'Proceed to Payment';

  @override
  String get bookTreatmentDurationLabel => 'Treatment duration: ';

  @override
  String get bookDurationConfirmedByHospital => 'confirmed by the hospital';

  @override
  String bookDurationRequired(String duration) {
    return '$duration required';
  }

  @override
  String bookAdmissionOn(String date) {
    return 'Admission on $date';
  }

  @override
  String get bookSelectPackage => 'Select Package';

  @override
  String get bookAcceptedQuote => 'Accepted hospital quote';

  @override
  String bookingStayDaysLabel(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days days stay');
    return '$_temp0';
  }

  @override
  String bookingValidUntil(String date) {
    return 'valid until $date';
  }

  @override
  String bookItemizedCharges(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count itemized charges');
    return '$_temp0';
  }

  @override
  String get bookNoPackages =>
      'This hospital has not published packages for this treatment yet. Ask for a personalised quote from your case page.';

  @override
  String get bookPaymentOptionSection => 'Payment Option';

  @override
  String get bookInsuranceHelp => 'Our team will help you with the claim paperwork.';

  @override
  String get bookLegendAvailable => 'Available';

  @override
  String get bookLegendSelected => 'Selected';

  @override
  String get bookLegendUnavailable => 'Unavailable';

  @override
  String get bookLegendPast => 'Past';

  @override
  String get bookPackageMedicalOnly => 'Core treatment package';

  @override
  String get bookPackageMedicalStay => 'Treatment + accommodation';

  @override
  String get bookPackageAllInclusive => 'Treatment, stay, transfers & translator';

  @override
  String bookInstallmentPerMonth(String amount) {
    return '≈ $amount / month before fees';
  }

  @override
  String get bookingPayInFull => 'Pay in full';

  @override
  String get bookPayInFullSubtitle => 'One payment for the whole treatment';

  @override
  String get bookPayDeposit => 'Pay a deposit now';

  @override
  String get bookPayDepositSubtitle => 'Secure your date; the balance is due before admission';

  @override
  String get bookMonthlyInstallments => 'Monthly installments';

  @override
  String get bookInstallmentChoices => '3, 6 or 12 months';

  @override
  String bookMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count months');
    return '$_temp0';
  }

  @override
  String get bookSavePrefix => 'Save ';

  @override
  String get bookExistingBookingBody =>
      'This case already has a booking. Continue with it, or cancel it from the case page to choose new dates.';

  @override
  String get bookContinueToPayment => 'Continue to payment';

  @override
  String get bookCalendarPreviousMonth => 'Previous month';

  @override
  String get bookCalendarNextMonth => 'Next month';

  @override
  String bookCalendarDaySemantics(String date, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {
      'selected': 'selected',
      'available': 'available',
      'other': 'unavailable',
    });
    return '$date, $_temp0';
  }

  @override
  String get bookDoctorHideDetails => 'Hide doctor details';

  @override
  String get bookDoctorShowDetails => 'Show doctor details';

  @override
  String bookDoctorExperience(int years) {
    String _temp0 = intl.Intl.pluralLogic(years, locale: localeName, other: '$years years of experience');
    return '$_temp0';
  }

  @override
  String bookDoctorSpeaks(String languages) {
    return 'Speaks $languages';
  }

  @override
  String get bookProfessionCardiologist => 'Cardiologist';

  @override
  String get bookProfessionOrthopedicSurgeon => 'Orthopedic Surgeon';

  @override
  String get bookProfessionOncologist => 'Oncologist';

  @override
  String get bookProfessionNeurologist => 'Neurologist';

  @override
  String get bookProfessionDentist => 'Dentist';

  @override
  String get bookProfessionUrologist => 'Urologist';

  @override
  String get bookProfessionNephrologist => 'Nephrologist';

  @override
  String get bookProfessionGastroenterologist => 'Gastroenterologist';

  @override
  String get bookProfessionOphthalmologist => 'Ophthalmologist';

  @override
  String get bookProfessionDermatologist => 'Dermatologist';

  @override
  String get casesTitle => 'My cases';

  @override
  String get caseFilterAll => 'All';

  @override
  String get casesEmptyTitle => 'No cases yet';

  @override
  String casesEmptyFilteredTitle(String status) {
    return 'No $status cases';
  }

  @override
  String get casesEmptyBody => 'Request a quote from a matched hospital to start a case.';

  @override
  String get caseFindMyTreatment => 'Find my treatment';

  @override
  String casesShowingCount(int shown, int total) {
    return 'Showing $shown of $total. Use the filters to narrow the list.';
  }

  @override
  String get caseTitleFallback => 'Case';

  @override
  String get caseMessageTooltip => 'Message about this case';

  @override
  String get caseQuotesSection => 'Quotes';

  @override
  String get caseQuotePending =>
      'The hospital is reviewing your case. You will be notified when the itemized quote arrives (usually within 48 hours).';

  @override
  String get caseNoQuotes => 'No quotes on this case.';

  @override
  String get caseBookPackageInstead => 'Book a fixed-price package instead';

  @override
  String get caseMedicalSummary => 'Medical summary';

  @override
  String get caseYourNotes => 'Your notes';

  @override
  String get documentsTitle => 'Documents';

  @override
  String get caseDocumentsManage => 'Manage';

  @override
  String get caseDocumentsEmpty => 'Upload reports, scans and your passport so the hospital can prepare.';

  @override
  String get caseStatusTimeline => 'Status timeline';

  @override
  String get caseMessageCareTeam => 'Message the care team';

  @override
  String get caseCancelThisCase => 'Cancel this case';

  @override
  String caseCoordinator(String name) {
    return 'Coordinator: $name';
  }

  @override
  String caseAgent(String name) {
    return 'Agent: $name';
  }

  @override
  String caseOpenedOn(String date) {
    return 'Opened $date';
  }

  @override
  String get caseBookingPackage => 'Package';

  @override
  String get caseBookingAdmission => 'Admission';

  @override
  String get caseBookingDuration => 'Duration';

  @override
  String caseDurationDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days days');
    return '$_temp0';
  }

  @override
  String get caseBookingPaymentPlan => 'Payment plan';

  @override
  String get caseBookingPaid => 'Paid';

  @override
  String get caseClaimRequested => 'Claim requested';

  @override
  String get casePayToConfirm => 'Pay to confirm';

  @override
  String get casePayBalance => 'Pay balance';

  @override
  String get travelVisaAndTravel => 'Visa & Travel';

  @override
  String get caseCancelBooking => 'Cancel booking';

  @override
  String get caseDepositPlusBalance => 'Deposit + balance';

  @override
  String caseMonthlyInstallments(int months) {
    String _temp0 = intl.Intl.pluralLogic(months, locale: localeName, other: '$months monthly installments');
    return '$_temp0';
  }

  @override
  String get caseMonthlyInstallmentsNoCount => 'monthly installments';

  @override
  String get caseAcceptQuoteTitle => 'Accept this quote?';

  @override
  String get caseAcceptQuoteBody =>
      'The hospital will reserve your treatment plan. Next you choose your admission date and pay the deposit.';

  @override
  String get caseNotYet => 'Not yet';

  @override
  String get caseAccept => 'Accept';

  @override
  String get caseQuoteAccepted => 'Quote accepted';

  @override
  String get caseDeclineQuoteTitle => 'Decline this quote?';

  @override
  String get caseDecline => 'Decline';

  @override
  String get caseCancelBookingTitle => 'Cancel booking?';

  @override
  String get caseReason => 'Reason';

  @override
  String get caseCancelBookingPolicy =>
      'Refunds follow the cancellation policy: the earlier you cancel before admission, the more is refunded.';

  @override
  String get caseBookingCancelled => 'Booking cancelled. Any refund is returned to your original payment method.';

  @override
  String get caseCancelCaseTitle => 'Cancel this case?';

  @override
  String get caseCancelCase => 'Cancel case';

  @override
  String get caseNextPaymentNeeded => 'Payment needed to confirm your booking';

  @override
  String get caseNextBalanceDue => 'Balance due before admission';

  @override
  String get caseNextWaitingForQuote => 'Waiting for the hospital quote';

  @override
  String get caseNextReviewQuote => 'Review your quote';

  @override
  String get caseNextChooseDate => 'Choose your admission date';

  @override
  String get caseHospitalQuote => 'Hospital quote';

  @override
  String caseQuoteBy(String name) {
    return 'By $name';
  }

  @override
  String caseQuoteTotalStay(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: 'Total · $days days stay');
    return '$_temp0';
  }

  @override
  String get caseAcceptQuote => 'Accept quote';

  @override
  String get caseChooseAdmissionDate => 'Choose admission date';

  @override
  String get caseReasonOptional => 'Reason (optional)';

  @override
  String refundTierLessThanDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: 'Less than $days days before admission');
    return '$_temp0';
  }

  @override
  String refundTierDaysOrMore(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days+ days before admission');
    return '$_temp0';
  }

  @override
  String get refundNone => 'no refund';

  @override
  String refundPercent(int pct) {
    return '$pct% refund';
  }

  @override
  String refundTierLine(String when, String refund) {
    return '$when: $refund';
  }

  @override
  String get refundPolicyTitle => 'Cancellation & refunds';

  @override
  String get refundPolicyGeneral =>
      'The cancellation policy in force when your booking is confirmed applies: the earlier you cancel before admission, the more is refunded.';

  @override
  String get refundPolicyLocked =>
      'Locked in for this booking. If the hospital or Heal India Global cancels, you get a full refund.';

  @override
  String documentsUploading(String name) {
    return 'Uploading $name';
  }

  @override
  String get documentsEmptyTitle => 'No documents yet';

  @override
  String get documentsEmptyBody =>
      'Upload your passport, medical reports, scans and prescriptions. PDF, JPG, PNG, WEBP, HEIC or DICOM up to 20 MB.';

  @override
  String get documentsUploadADocument => 'Upload a document';

  @override
  String get documentsSharedNote => 'Shared only with your care team and the hospital on your case.';

  @override
  String documentsUploaded(String name) {
    return '$name uploaded';
  }

  @override
  String get documentsDeleteTitle => 'Delete document?';

  @override
  String documentsDeleteBody(String name) {
    return '$name will be removed for you and your care team.';
  }

  @override
  String get documentsKeep => 'Keep';

  @override
  String get documentsActionsTooltip => 'Document actions';

  @override
  String get documentsFileTooLarge => 'File is too large (max 20 MB).';

  @override
  String documentsSaved(String name) {
    return 'Saved $name';
  }

  @override
  String get documentsPreviewUnavailable => 'This image format cannot be previewed. Use Download instead.';

  @override
  String get documentsWhatAreYouUploading => 'What are you uploading?';

  @override
  String get preArrivalTitle => 'Pre-arrival Guide';

  @override
  String get preArrivalVisaTitle => 'Visa & documents';

  @override
  String get preArrivalVisaPassport => 'Passport valid for at least 6 months, with two blank pages.';

  @override
  String get preArrivalVisaEMedical =>
      'Indian e-Medical visa (and e-Medical Attendant visa for companions) - we send the hospital invitation letter.';

  @override
  String get preArrivalVisaCopies =>
      'Printed copies of your visa, invitation letter, booking confirmation and medical reports.';

  @override
  String get preArrivalMedicalTitle => 'Medical records';

  @override
  String get preArrivalMedicalReports =>
      'Recent scans, lab results and prescriptions - upload them in Documents so your doctor can review them.';

  @override
  String get preArrivalMedicalMedicines => 'A list of current medicines with doses; bring enough for the whole trip.';

  @override
  String get preArrivalMedicalAllergies => 'Allergies and previous surgeries written down in English.';

  @override
  String get preArrivalPackTitle => 'What to pack';

  @override
  String get preArrivalPackClothing => 'Loose, comfortable clothing for after treatment.';

  @override
  String get preArrivalPackAdapter => 'Universal power adapter (India uses type C, D and M plugs, 230 V).';

  @override
  String get preArrivalPackJacket => 'A light jacket - hospitals and flights are air-conditioned.';

  @override
  String get preArrivalMoneyTitle => 'Money';

  @override
  String get preArrivalMoneyCards =>
      'Cards are accepted at hospitals and hotels; keep some rupees for taxis and small shops.';

  @override
  String get preArrivalMoneyTellBank => 'Tell your bank you are travelling to India so cards are not blocked.';

  @override
  String get preArrivalMoneyReceipts => 'Keep your payment receipts in the app under Documents.';

  @override
  String get preArrivalArrivalTitle => 'Arrival day';

  @override
  String get preArrivalArrivalFlight => 'Share your flight details so we can arrange the airport pickup.';

  @override
  String get preArrivalArrivalDriver => 'Your driver waits at arrivals with a Heal India Global sign.';

  @override
  String get preArrivalArrivalHelpline => 'Save the 24/7 helpline number before you fly.';

  @override
  String get preArrivalCulturalTips => 'Cultural tips';

  @override
  String get preArrivalTipsSoon => 'Tips will appear here soon.';

  @override
  String get preArrivalDisclaimer => 'General travel information only - always follow your doctor\'s instructions.';

  @override
  String journeyCallFromPhone(String number) {
    return 'Call $number from your phone.';
  }

  @override
  String journeyWhatsAppFromPhone(String number) {
    return 'WhatsApp $number from your phone.';
  }

  @override
  String get journeyCoordinatorChatSubject => 'My care coordinator';

  @override
  String get emergencyContactsTitle => 'Emergency Contacts';

  @override
  String get emergencyContactsIntro => 'In a medical emergency in India call the local emergency number first.';

  @override
  String get emergencyContactsServicesIndia => 'Emergency services (India)';

  @override
  String get emergencyContactsHelpline => 'Heal India Global 24/7 helpline';

  @override
  String get emergencyContactsWhatsApp => 'WhatsApp support';

  @override
  String emergencyContactsCoordinator(String name) {
    return 'Coordinator - $name';
  }

  @override
  String get emergencyContactsMine => 'My emergency contact';

  @override
  String get travelRequestSent => 'Request sent. Our travel desk will get back to you.';

  @override
  String get visaSectionTitle => 'Medical visa';

  @override
  String get visaEmptyText =>
      'Most international patients need an Indian e-Medical visa. We provide the hospital invitation letter and help you apply.';

  @override
  String get visaRequestAssistance => 'Request visa assistance';

  @override
  String get flightSectionTitle => 'Flights & airport transfers';

  @override
  String get flightNoRequests => 'No flight or transfer requests yet.';

  @override
  String get flightRequestChip => 'Request flight';

  @override
  String get travelAirportPickup => 'Airport pickup';

  @override
  String get travelAirportDrop => 'Airport drop';

  @override
  String get stayAccommodation => 'Accommodation';

  @override
  String get stayEmptyText => 'Hotels, guest houses and service apartments close to your hospital.';

  @override
  String get stayRequestAccommodation => 'Request accommodation';

  @override
  String get stayRequestAnother => 'Request another stay';

  @override
  String get travelLocalServices => 'Local services';

  @override
  String get travelTranslator => 'Translator';

  @override
  String get travelLocalGuide => 'Local guide';

  @override
  String get travelTransport => 'Transport';

  @override
  String get visaHintNotStarted => 'We have your request and will list the documents you need.';

  @override
  String get visaHintDocumentsPending => 'Upload your passport and medical reports in Documents.';

  @override
  String get visaHintInvitationIssued => 'Your invitation letter is ready. Apply at indianvisaonline.gov.in.';

  @override
  String get visaHintApplied => 'Application submitted. Decisions usually take 3-5 working days.';

  @override
  String get visaHintApproved => 'Visa approved. Carry a printed copy when you travel.';

  @override
  String get visaHintRejected => 'The application was not approved. Your coordinator will contact you.';

  @override
  String visaApplicationRef(String ref) {
    return 'Application ref: $ref';
  }

  @override
  String get visaInvitationLetter => 'Invitation letter';

  @override
  String get travelRouteArrow => ' → ';

  @override
  String flightPnr(String pnr) {
    return 'PNR $pnr';
  }

  @override
  String stayGuestCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count guests', one: '$count guest');
    return '$_temp0';
  }

  @override
  String stayConfirmationCode(String code) {
    return 'Conf. $code';
  }

  @override
  String get checklistTitle => 'Your Checklist';

  @override
  String get tripsTodaySchedule => 'Today\'s Schedule';

  @override
  String get tripsQuickActions => 'Quick Actions';

  @override
  String get tripsUploadDocuments => 'Upload Documents';

  @override
  String get tripsChatWithCoordinator => 'Chat with\nCoordinator';

  @override
  String get tripsEmergencyContacts => 'Emergency\nContacts';

  @override
  String get journeySectionTitle => 'Your Journey';

  @override
  String get tripsTravelSubtitle => 'Visa, flights, airport pickup, stay, translator';

  @override
  String get tripsSupportTitle => 'In-Country Support';

  @override
  String get tripsSupportSubtitle => 'Map, schedule, helpline, translator, SOS';

  @override
  String get tripsMyCases => 'My Cases';

  @override
  String tripsActiveCases(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count active cases',
      one: '$count active case',
    );
    return '$_temp0';
  }

  @override
  String tripsYourCoordinator(String name) {
    return 'Your coordinator: $name';
  }

  @override
  String get tripsMessageAnyTime => 'Message them any time';

  @override
  String tripsCountdownUnit(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'days', one: 'day');
    return '$_temp0';
  }

  @override
  String get tripsCountdownToday => 'Today';

  @override
  String get tripsCountdownDone => 'Done';

  @override
  String get tripsCountdownNow => 'Now';

  @override
  String get tripsTreatmentInProgress => 'Treatment in progress';

  @override
  String get tripsUntilTreatment => 'Until Treatment';

  @override
  String tripsDaysUntilTreatment(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days until treatment');
    return '$_temp0';
  }

  @override
  String get tripsPaymentNeeded => 'Payment needed to confirm';

  @override
  String get tripsBalanceDue => 'Balance due';

  @override
  String get tripsPayNow => 'Pay now';

  @override
  String get tripsNoTripTitle => 'No upcoming treatment yet';

  @override
  String get tripsNoTripBody => 'Find the right hospital with a free AI screening, or continue a case you started.';

  @override
  String get travelSelect => 'Select';

  @override
  String get visaAssistanceTitle => 'Visa assistance';

  @override
  String get visaAssistanceSubtitle =>
      'We prepare the hospital invitation letter and guide you through the Indian e-Medical visa application.';

  @override
  String get visaForPatient => 'Patient';

  @override
  String get visaForAttendant => 'Attendant';

  @override
  String get visaNotesLabel => 'Notes (nationality, travel dates, companions)';

  @override
  String get travelAirport => 'Airport';

  @override
  String travelCityAirport(String city) {
    return '$city airport';
  }

  @override
  String get travelHospitalOrHotel => 'Hospital / hotel';

  @override
  String get flightRequestTitle => 'Request a flight';

  @override
  String get flightRequestSubtitle => 'Our travel desk sends you fare options; nothing is charged until you confirm.';

  @override
  String get flightPreferredDeparture => 'Preferred departure';

  @override
  String get travelPickupSubtitle => 'A driver meets you at arrivals and takes you to your hospital or hotel.';

  @override
  String get travelArrivalDateTime => 'Arrival date & time';

  @override
  String get travelDropSubtitle => 'We take you to the airport for your flight home.';

  @override
  String get travelPickupTime => 'Pickup time';

  @override
  String get travelLocalTransport => 'Local transport';

  @override
  String get travelLocalTransportSubtitle => 'Car with driver for appointments in the city.';

  @override
  String get travelStart => 'Start';

  @override
  String get travelSendRequest => 'Send request';

  @override
  String get flightFromCityOrAirport => 'From (city or airport)';

  @override
  String get travelFrom => 'From';

  @override
  String get travelTo => 'To';

  @override
  String get flightNumberOptional => 'Flight number (optional)';

  @override
  String get travelPassengers => 'Passengers';

  @override
  String get travelFewerPassengers => 'Fewer passengers';

  @override
  String get travelMorePassengers => 'More passengers';

  @override
  String get travelNotesLabel => 'Notes (wheelchair, luggage, preferences)';

  @override
  String get staySheetSubtitle => 'Stays near your hospital. Our team confirms availability and price before booking.';

  @override
  String get stayNoPartners => 'No partner stays are listed for this hospital yet. Ask your coordinator in Messages.';

  @override
  String stayDistanceKm(String km) {
    return '$km km';
  }

  @override
  String stayPerNight(String amount) {
    return '$amount/night';
  }

  @override
  String get stayCheckInOut => 'Check-in - check-out';

  @override
  String get stayGuests => 'Guests';

  @override
  String get stayFewerGuests => 'Fewer guests';

  @override
  String get stayMoreGuests => 'More guests';

  @override
  String get stayNotesLabel => 'Notes (room type, accessibility, diet)';

  @override
  String get travelTranslatorTitle => 'Get a translator';

  @override
  String get travelTranslatorSubtitle => 'A medical interpreter for consultations and hospital stays.';

  @override
  String get travelTranslatorNotes => 'Language needed (e.g. Arabic, French)';

  @override
  String get travelGuideTitle => 'Book a local guide';

  @override
  String get travelGuideSubtitle => 'A trusted guide for errands, shopping and sightseeing during recovery.';

  @override
  String get travelGuideNotes => 'What would you like help with?';

  @override
  String travelServiceRequestTitle(String service) {
    return 'Request $service';
  }

  @override
  String get travelServiceSubtitle => 'Our team confirms details and price with you.';

  @override
  String get travelNotes => 'Notes';

  @override
  String get travelWhenNeeded => 'When do you need it?';

  @override
  String get travelPreferredProvider => 'Preferred provider (optional)';

  @override
  String get travelAnyAvailable => 'Any available';

  @override
  String get profileMyJourney => 'My journey';

  @override
  String get profileMyCasesQuotes => 'My cases & quotes';

  @override
  String get profileDocuments => 'Documents';

  @override
  String get profileDocumentsSubtitle => 'Passport, medical reports, visas, invoices';

  @override
  String get companionsTitle => 'Travel companions';

  @override
  String get companionsSubtitleDefault => 'People travelling with you';

  @override
  String get companionsSubtitleEmpty => 'Add the people travelling with you';

  @override
  String get savedTitle => 'Saved';

  @override
  String get profileSavedSubtitle => 'Hospitals, doctors and treatments';

  @override
  String get profileAbout => 'About';

  @override
  String get profileTermsOfService => 'Terms of service';

  @override
  String get profilePrivacyPolicy => 'Privacy policy';

  @override
  String get deleteAccountDoneSnack => 'Your account has been deleted.';

  @override
  String get profileGuest => 'Guest';

  @override
  String get profilePatientBadge => 'Patient';

  @override
  String get profileEmailVerified => 'Email verified';

  @override
  String get editProfileTitle => 'Edit profile';

  @override
  String get profileGuestUpgradeTitle => 'Create your free account';

  @override
  String get profileGuestUpgradeBody =>
      'Keep your screenings and matches, request quotes, book treatment, upload documents and chat with your coordinator.';

  @override
  String get profileCreateAccount => 'Create account';

  @override
  String get authLogIn => 'Log in';

  @override
  String get profilePersonalInfo => 'Personal information';

  @override
  String profilePassportExpires(String date) {
    return 'expires $date';
  }

  @override
  String get profileDateOfBirth => 'Date of birth';

  @override
  String get profileGender => 'Gender';

  @override
  String get profileNationality => 'Nationality';

  @override
  String get profilePhone => 'Phone';

  @override
  String get profilePassport => 'Passport';

  @override
  String get profilePassportValidityWarning =>
      'Your passport must be valid for at least 6 months to apply for an e-Medical visa.';

  @override
  String get profileEmergencyContact => 'Emergency contact';

  @override
  String get profileBloodGroup => 'Blood group';

  @override
  String get profileNotSet => 'Not set';

  @override
  String get profileNotAdded => 'Not added';

  @override
  String profileClearField(String label) {
    return 'Clear $label';
  }

  @override
  String get profileRelationship => 'Relationship';

  @override
  String get profileNewPassportNumber => 'New passport number';

  @override
  String get settingsPreferences => 'Preferences';

  @override
  String get settingsCurrency => 'Currency';

  @override
  String settingsCurrencySubtitle(String currency) {
    return 'Prices are shown as estimates in $currency';
  }

  @override
  String get settingsPreferredCurrency => 'Preferred currency';

  @override
  String get settingsAppearance => 'Appearance';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeSystem => 'Match device';

  @override
  String get settingsSecurity => 'Security';

  @override
  String get accountVerifyEmail => 'Verify your email';

  @override
  String accountVerifyEmailSubtitle(String email) {
    return 'Check $email for the verification link';
  }

  @override
  String get accountVerificationSent => 'Verification email sent';

  @override
  String get accountResend => 'Resend';

  @override
  String get accountYourData => 'Your data';

  @override
  String get accountYourDataSubtitle => 'Medical data is encrypted and shared only with hospitals you choose.';

  @override
  String get accountExitGuestTitle => 'Exit guest mode?';

  @override
  String get accountLogOutTitle => 'Log out?';

  @override
  String get accountExitGuestBody => 'Your guest screenings will be lost unless you create an account first.';

  @override
  String get accountLogOutBody => 'You can log back in any time with your email and password.';

  @override
  String get accountExit => 'Exit';

  @override
  String get accountExitGuestMode => 'Exit guest mode';

  @override
  String get companionsRemoveTitle => 'Remove companion?';

  @override
  String companionsRemoveBody(String name) {
    return '$name will be removed from your travel companions.';
  }

  @override
  String get companionsRemovedSnack => 'Companion removed';

  @override
  String companionsAddedSnack(String name) {
    return '$name added';
  }

  @override
  String get companionAdd => 'Add companion';

  @override
  String get companionsEmptyTitle => 'No companions yet';

  @override
  String get companionsEmptyMessage =>
      'Add the family member or friend travelling with you so we can arrange their attendant visa.';

  @override
  String companionsBorn(String date) {
    return 'Born $date';
  }

  @override
  String companionsPassportLast4(String last4) {
    return 'Passport •••• $last4';
  }

  @override
  String companionsEditTooltip(String name) {
    return 'Edit $name';
  }

  @override
  String companionsRemoveTooltip(String name) {
    return 'Remove $name';
  }

  @override
  String get companionEditTitle => 'Edit companion';

  @override
  String get companionFormIntro => 'Companions travel with you as medical attendants and need their own visa.';

  @override
  String get companionFullNameRequired => 'Enter the full name';

  @override
  String get companionFullNameLabel => 'Full name (as on passport)';

  @override
  String get companionRelationshipRequired => 'Choose the relationship';

  @override
  String get companionRelationshipSpouse => 'Spouse';

  @override
  String get companionRelationshipParent => 'Parent';

  @override
  String get companionRelationshipChild => 'Child';

  @override
  String get companionRelationshipSibling => 'Sibling';

  @override
  String get companionRelationshipRelative => 'Relative';

  @override
  String get companionRelationshipFriend => 'Friend';

  @override
  String get companionRelationshipCaregiver => 'Caregiver';

  @override
  String get companionPassportInvalid => 'Enter a valid passport number';

  @override
  String get companionPassportOptional => 'Passport number (optional)';

  @override
  String get companionPassportStoredEncrypted => 'Stored encrypted';

  @override
  String companionPassportCurrent(String last4) {
    return 'Current: •••• $last4 - leave blank to keep';
  }

  @override
  String get companionSave => 'Save companion';

  @override
  String get editProfileEcNameRequired => 'Add the name or clear the emergency contact';

  @override
  String get editProfileEcRelationshipRequired => 'Add the relationship or clear the emergency contact';

  @override
  String get editProfileEcPhoneRequired => 'Add the phone or clear the emergency contact';

  @override
  String get editProfileFixFields => 'Please fix the highlighted fields.';

  @override
  String get editProfileSaved => 'Profile saved';

  @override
  String get editProfilePersonalDetails => 'Personal details';

  @override
  String get editProfileFirstName => 'First name';

  @override
  String get editProfileLastName => 'Last name';

  @override
  String get editProfileCountryOfResidence => 'Country of residence';

  @override
  String get editProfilePassportSubtitle => 'Needed for your medical visa invitation letter';

  @override
  String get editProfilePassportInvalid => 'Use 5-20 letters or digits';

  @override
  String get editProfilePassportNumber => 'Passport number';

  @override
  String get editProfilePassportHelperNew => 'Stored encrypted. Only the last 4 digits are ever shown.';

  @override
  String editProfilePassportOnFile(String masked) {
    return 'On file: $masked. Leave blank to keep it.';
  }

  @override
  String get editProfilePassportExpiry => 'Passport expiry';

  @override
  String get editProfileName => 'Name';

  @override
  String get editProfileMedicalInfo => 'Medical information';

  @override
  String get editProfileMedicalInfoSubtitle => 'Shared only with hospitals you request quotes from';

  @override
  String get editProfileAllergies => 'Allergies';

  @override
  String get editProfileMedicalHistory => 'Medical history';

  @override
  String get editProfileInsurance => 'Insurance';

  @override
  String get editProfileInsuranceProvider => 'Insurance provider';

  @override
  String get editProfilePolicyNumber => 'Policy number';

  @override
  String get editProfileNewPolicyNumber => 'New policy number';

  @override
  String editProfilePolicyOnFile(String last4) {
    return 'On file: •••• $last4. Leave blank to keep it.';
  }

  @override
  String get editProfileSaveChanges => 'Save changes';

  @override
  String get savedEmptyTitle => 'Nothing saved yet';

  @override
  String get savedEmptyMessage => 'Tap the bookmark on any hospital, doctor or treatment to keep it here.';

  @override
  String get savedExploreHospitals => 'Explore hospitals';

  @override
  String savedFilterAll(int count) {
    return 'All ($count)';
  }

  @override
  String savedFilterType(String type, int count) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'Hospitals ($count)',
      'doctor': 'Doctors ($count)',
      'procedure': 'Procedures ($count)',
      'other': 'Other ($count)',
    });
    return '$_temp0';
  }

  @override
  String get savedEmptyCategory => 'Nothing saved in this category';

  @override
  String savedNoLongerAvailable(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'This hospital is no longer available',
      'doctor': 'This doctor is no longer available',
      'procedure': 'This procedure is no longer available',
      'other': 'This item is no longer available',
    });
    return '$_temp0';
  }

  @override
  String get passwordChangeTitle => 'Change password';

  @override
  String get passwordUpdatedSnack => 'Password updated. Other devices have been signed out.';

  @override
  String get passwordCurrent => 'Current password';

  @override
  String get passwordCurrentHelper => 'Leave blank if you signed up with Google and never set one';

  @override
  String get passwordNew => 'New password';

  @override
  String get passwordMustDiffer => 'Choose a password different from the current one';

  @override
  String passwordPolicyHelper(int min) {
    return 'At least $min characters with a letter and a number';
  }

  @override
  String get passwordConfirmNew => 'Confirm new password';

  @override
  String get passwordMismatch => 'Passwords do not match';

  @override
  String get passwordUpdateButton => 'Update password';

  @override
  String get deleteAccountGuestBody => 'This permanently deletes your guest account, screenings and saved items.';

  @override
  String get deleteAccountBody =>
      'This permanently deletes your account, profile, companions, saved items and uploaded documents, and signs you out on every device. It cannot be undone.';

  @override
  String get deleteAccountRetention =>
      'Records we must keep by law (invoices, payments, refunds and hospital treatment records) are retained for the legal retention period with access restricted, then erased. Open bookings or pending payments may need to be settled or cancelled first.';

  @override
  String get deleteAccountPasswordLabel => 'Password';

  @override
  String get deleteAccountPasswordHelper => 'Leave blank if you signed in with Google or Apple and never set one';

  @override
  String get deleteAccountOtpLabel => 'Authenticator code';

  @override
  String get deleteAccountOtpHelper => 'The 6-digit code from your authenticator app';

  @override
  String get deleteAccountReasonLabel => 'Why are you leaving? (optional)';

  @override
  String deleteAccountConfirmLabel(String word) {
    return 'Type $word to confirm';
  }

  @override
  String get deleteAccountSubmit => 'Delete my account permanently';

  @override
  String get deleteAccountBlockerActiveCases => 'Cases in progress';

  @override
  String get deleteAccountBlockerActiveBookings => 'Upcoming or active bookings';

  @override
  String get deleteAccountBlockerPendingPayments => 'Payments in progress';

  @override
  String get deleteAccountBlockerHospitalsOwned => 'Listed hospitals you own';

  @override
  String get deleteAccountBlockersTitle => 'These need to be closed first';

  @override
  String get deleteAccountRequestSent =>
      'Deletion request sent. Our support team will close your account once these are settled and confirm by e-mail.';

  @override
  String get deleteAccountRequestButton => 'Request deletion';

  @override
  String get forgotPasswordInvalidCode => 'This reset code is invalid or has expired. Request a new one.';

  @override
  String get forgotPasswordSetNewTitle => 'Set a new password';

  @override
  String get forgotPasswordTitle => 'Reset password';

  @override
  String get forgotPasswordIntro =>
      'Enter the email you registered with and we\'ll send you a link to reset your password.';

  @override
  String get forgotPasswordEmailLabel => 'Email';

  @override
  String get forgotPasswordSendLink => 'Send reset link';

  @override
  String get forgotPasswordHaveCode => 'I already have a reset code';

  @override
  String get forgotPasswordCheckInbox => 'Check your inbox';

  @override
  String forgotPasswordSentBody(String email) {
    return 'If an account exists for $email, we have sent a password reset link. It may take a few minutes to arrive - check your spam folder too.';
  }

  @override
  String get forgotPasswordEnterCode => 'Enter reset code';

  @override
  String get forgotPasswordBackToLogin => 'Back to log in';

  @override
  String get forgotPasswordResetIntro => 'Paste the reset code from the email we sent you, then choose a new password.';

  @override
  String get forgotPasswordPasteFullCode => 'Paste the full reset code';

  @override
  String get forgotPasswordCodeLabel => 'Reset code';

  @override
  String get forgotPasswordRequestNewLink => 'Request a new link';

  @override
  String get forgotPasswordUpdatedTitle => 'Password updated';

  @override
  String get forgotPasswordUpdatedBody => 'You can now log in with your new password.';

  @override
  String get validationEnterEmail => 'Enter your email';

  @override
  String get validationInvalidEmail => 'Enter a valid email address';

  @override
  String get validationEnterPassword => 'Enter your password';

  @override
  String get validationChoosePassword => 'Choose a password';

  @override
  String validationPasswordTooShort(int min) {
    return 'Use at least $min characters';
  }

  @override
  String validationPasswordTooLong(int max) {
    return 'Use at most $max characters';
  }

  @override
  String get validationPasswordLetterDigit => 'Include at least one letter and one number';

  @override
  String get validationEnterFullName => 'Enter your full name';

  @override
  String get validationNameTooLong => 'Name is too long';

  @override
  String get validationInvalidPhone => 'Enter a valid phone number';

  @override
  String get validationEnterOtp => 'Enter the 6-digit code';

  @override
  String get countryAF => 'Afghanistan';

  @override
  String get countryDZ => 'Algeria';

  @override
  String get countryAO => 'Angola';

  @override
  String get countryAR => 'Argentina';

  @override
  String get countryAM => 'Armenia';

  @override
  String get countryAU => 'Australia';

  @override
  String get countryAT => 'Austria';

  @override
  String get countryAZ => 'Azerbaijan';

  @override
  String get countryBH => 'Bahrain';

  @override
  String get countryBD => 'Bangladesh';

  @override
  String get countryBY => 'Belarus';

  @override
  String get countryBE => 'Belgium';

  @override
  String get countryBT => 'Bhutan';

  @override
  String get countryBW => 'Botswana';

  @override
  String get countryBR => 'Brazil';

  @override
  String get countryBN => 'Brunei';

  @override
  String get countryBG => 'Bulgaria';

  @override
  String get countryBI => 'Burundi';

  @override
  String get countryKH => 'Cambodia';

  @override
  String get countryCM => 'Cameroon';

  @override
  String get countryCA => 'Canada';

  @override
  String get countryTD => 'Chad';

  @override
  String get countryCL => 'Chile';

  @override
  String get countryCN => 'China';

  @override
  String get countryCO => 'Colombia';

  @override
  String get countryCD => 'Congo (DRC)';

  @override
  String get countryCI => 'Cote d\'Ivoire';

  @override
  String get countryHR => 'Croatia';

  @override
  String get countryCY => 'Cyprus';

  @override
  String get countryCZ => 'Czechia';

  @override
  String get countryDK => 'Denmark';

  @override
  String get countryDJ => 'Djibouti';

  @override
  String get countryEG => 'Egypt';

  @override
  String get countryER => 'Eritrea';

  @override
  String get countryEE => 'Estonia';

  @override
  String get countryET => 'Ethiopia';

  @override
  String get countryFJ => 'Fiji';

  @override
  String get countryFI => 'Finland';

  @override
  String get countryFR => 'France';

  @override
  String get countryGA => 'Gabon';

  @override
  String get countryGM => 'Gambia';

  @override
  String get countryGE => 'Georgia';

  @override
  String get countryDE => 'Germany';

  @override
  String get countryGH => 'Ghana';

  @override
  String get countryGR => 'Greece';

  @override
  String get countryGN => 'Guinea';

  @override
  String get countryGY => 'Guyana';

  @override
  String get countryHK => 'Hong Kong';

  @override
  String get countryHU => 'Hungary';

  @override
  String get countryIS => 'Iceland';

  @override
  String get countryIN => 'India';

  @override
  String get countryID => 'Indonesia';

  @override
  String get countryIR => 'Iran';

  @override
  String get countryIQ => 'Iraq';

  @override
  String get countryIE => 'Ireland';

  @override
  String get countryIL => 'Israel';

  @override
  String get countryIT => 'Italy';

  @override
  String get countryJM => 'Jamaica';

  @override
  String get countryJP => 'Japan';

  @override
  String get countryJO => 'Jordan';

  @override
  String get countryKZ => 'Kazakhstan';

  @override
  String get countryKE => 'Kenya';

  @override
  String get countryKW => 'Kuwait';

  @override
  String get countryKG => 'Kyrgyzstan';

  @override
  String get countryLA => 'Laos';

  @override
  String get countryLV => 'Latvia';

  @override
  String get countryLB => 'Lebanon';

  @override
  String get countryLS => 'Lesotho';

  @override
  String get countryLR => 'Liberia';

  @override
  String get countryLY => 'Libya';

  @override
  String get countryLT => 'Lithuania';

  @override
  String get countryLU => 'Luxembourg';

  @override
  String get countryMG => 'Madagascar';

  @override
  String get countryMW => 'Malawi';

  @override
  String get countryMY => 'Malaysia';

  @override
  String get countryMV => 'Maldives';

  @override
  String get countryML => 'Mali';

  @override
  String get countryMT => 'Malta';

  @override
  String get countryMR => 'Mauritania';

  @override
  String get countryMU => 'Mauritius';

  @override
  String get countryMX => 'Mexico';

  @override
  String get countryMD => 'Moldova';

  @override
  String get countryMN => 'Mongolia';

  @override
  String get countryMA => 'Morocco';

  @override
  String get countryMZ => 'Mozambique';

  @override
  String get countryMM => 'Myanmar';

  @override
  String get countryNA => 'Namibia';

  @override
  String get countryNP => 'Nepal';

  @override
  String get countryNL => 'Netherlands';

  @override
  String get countryNZ => 'New Zealand';

  @override
  String get countryNE => 'Niger';

  @override
  String get countryNG => 'Nigeria';

  @override
  String get countryNO => 'Norway';

  @override
  String get countryOM => 'Oman';

  @override
  String get countryPK => 'Pakistan';

  @override
  String get countryPS => 'Palestine';

  @override
  String get countryPA => 'Panama';

  @override
  String get countryPG => 'Papua New Guinea';

  @override
  String get countryPE => 'Peru';

  @override
  String get countryPH => 'Philippines';

  @override
  String get countryPL => 'Poland';

  @override
  String get countryPT => 'Portugal';

  @override
  String get countryQA => 'Qatar';

  @override
  String get countryRO => 'Romania';

  @override
  String get countryRU => 'Russia';

  @override
  String get countryRW => 'Rwanda';

  @override
  String get countrySA => 'Saudi Arabia';

  @override
  String get countrySN => 'Senegal';

  @override
  String get countryRS => 'Serbia';

  @override
  String get countrySC => 'Seychelles';

  @override
  String get countrySL => 'Sierra Leone';

  @override
  String get countrySG => 'Singapore';

  @override
  String get countrySK => 'Slovakia';

  @override
  String get countrySI => 'Slovenia';

  @override
  String get countrySO => 'Somalia';

  @override
  String get countryZA => 'South Africa';

  @override
  String get countryKR => 'South Korea';

  @override
  String get countrySS => 'South Sudan';

  @override
  String get countryES => 'Spain';

  @override
  String get countryLK => 'Sri Lanka';

  @override
  String get countrySD => 'Sudan';

  @override
  String get countrySR => 'Suriname';

  @override
  String get countrySE => 'Sweden';

  @override
  String get countryCH => 'Switzerland';

  @override
  String get countrySY => 'Syria';

  @override
  String get countryTW => 'Taiwan';

  @override
  String get countryTJ => 'Tajikistan';

  @override
  String get countryTZ => 'Tanzania';

  @override
  String get countryTH => 'Thailand';

  @override
  String get countryTG => 'Togo';

  @override
  String get countryTT => 'Trinidad and Tobago';

  @override
  String get countryTN => 'Tunisia';

  @override
  String get countryTR => 'Turkey';

  @override
  String get countryTM => 'Turkmenistan';

  @override
  String get countryUG => 'Uganda';

  @override
  String get countryUA => 'Ukraine';

  @override
  String get countryAE => 'United Arab Emirates';

  @override
  String get countryGB => 'United Kingdom';

  @override
  String get countryUS => 'United States';

  @override
  String get countryUY => 'Uruguay';

  @override
  String get countryUZ => 'Uzbekistan';

  @override
  String get countryVE => 'Venezuela';

  @override
  String get countryVN => 'Vietnam';

  @override
  String get countryYE => 'Yemen';

  @override
  String get countryZM => 'Zambia';

  @override
  String get countryZW => 'Zimbabwe';

  @override
  String get agentTabDashboard => 'Dashboard';

  @override
  String get agentTabPatients => 'Patients';

  @override
  String get agentTabCases => 'Cases';

  @override
  String get agentTabBookings => 'Bookings';

  @override
  String get agentTabEarnings => 'Earnings';

  @override
  String get portalNoActivityYet => 'No activity yet';

  @override
  String get portalPatientLabel => 'Patient';

  @override
  String get portalHospitalLabel => 'Hospital';

  @override
  String get portalDoctorLabel => 'Doctor';

  @override
  String get portalBookingLabel => 'Booking';

  @override
  String portalCaseOpened(String when) {
    return 'Opened $when';
  }

  @override
  String get portalTotal => 'Total';

  @override
  String portalQuoteStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count day stay', one: '$count day stay');
    return '$_temp0';
  }

  @override
  String portalQuoteValidUntil(String date) {
    return 'valid until $date';
  }

  @override
  String portalQuotePreparedBy(String name) {
    return 'by $name';
  }

  @override
  String get portalFilterAll => 'All';

  @override
  String get portalAccountDeleted => 'Your account has been deleted.';

  @override
  String get payeeStatusPending => 'Pending';

  @override
  String get payeeStatusEligible => 'Eligible';

  @override
  String get payeeStatusOnHold => 'On hold';

  @override
  String get payeeStatusBatched => 'Batched';

  @override
  String get payeeStatusPaid => 'Paid';

  @override
  String get payeeStatusReversed => 'Reversed';

  @override
  String get payeeStatusQueued => 'Queued';

  @override
  String get payeeStatusProcessing => 'Processing';

  @override
  String get payeeStatusProcessed => 'Processed';

  @override
  String get payeeStatusFailed => 'Failed';

  @override
  String get payeeStatusNeedsReconciliation => 'Needs reconciliation';

  @override
  String get payeeSettlementsTab => 'Settlements';

  @override
  String get payeePayoutsTab => 'Payouts';

  @override
  String get payeeStatementTab => 'Statement';

  @override
  String get payeeItemsEmpty => 'Nothing here yet';

  @override
  String get payeePayoutsEmpty => 'No payouts yet';

  @override
  String payeePayoutUtr(String utr) {
    return 'UTR $utr';
  }

  @override
  String get payeeMethodManualBankTransfer => 'Manual bank transfer';

  @override
  String get payeeStatementTwelveMonths => '12 months';

  @override
  String payeeStatementDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days', one: '$count day');
    return '$_temp0';
  }

  @override
  String get payeeStatementPeriod => 'Period';

  @override
  String payeeStatementPeriodRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get payeeOpeningBalance => 'Opening balance';

  @override
  String get payeeEarned => 'Earned';

  @override
  String get payeePaidOut => 'Paid out';

  @override
  String get payeeClosingBalance => 'Closing balance';

  @override
  String get payeeStatementEmpty => 'No transactions in this period';

  @override
  String payeeStatementBalance(String amount) {
    return 'Bal $amount';
  }

  @override
  String get payeePaidToDate => 'Paid to date';

  @override
  String payeeOutstanding(String amount) {
    return 'Outstanding $amount';
  }

  @override
  String payeeNextPayout(String date) {
    return 'next payout $date';
  }

  @override
  String get payeeKpiPending => 'Pending';

  @override
  String get payeeKpiEligible => 'Eligible for payout';

  @override
  String get payeeKpiOnHold => 'On hold';

  @override
  String get payeeKpiBatched => 'In payout batch';

  @override
  String payeeItemGrossFee(String gross, String fee) {
    return 'Gross $gross · fee $fee';
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
    return 'On hold: $reason';
  }

  @override
  String payeeItemEligibleOn(String date) {
    return 'Eligible $date';
  }

  @override
  String get commissionTitle => 'Commissions';

  @override
  String commissionRateBadge(String rate) {
    return '$rate rate';
  }

  @override
  String get commissionKpiPending => 'Commission pending';

  @override
  String get commissionKpiPaid => 'Commission paid';

  @override
  String get commissionByMonth => 'Commission by month';

  @override
  String get kycBannerNotSubmitted => 'Submit your KYC documents on the agent web portal to start earning commissions.';

  @override
  String get kycBannerPending => 'Your KYC is under review. You can add patients meanwhile.';

  @override
  String get kycBannerRejected => 'KYC rejected';

  @override
  String kycBannerRejectedWithReason(String reason) {
    return 'KYC rejected: $reason';
  }

  @override
  String agentAccountStatusBanner(String status) {
    return 'Your agency account is $status.';
  }

  @override
  String get agentDashboardTitle => 'Agent dashboard';

  @override
  String agentDashboardGreeting(String name) {
    return 'Hi, $name';
  }

  @override
  String get agentKpiPatients => 'Patients';

  @override
  String get agentKpiActiveCases => 'Active cases';

  @override
  String get agentKpiConfirmedBookings => 'Confirmed bookings';

  @override
  String get agentKpiConversion => 'Conversion';

  @override
  String get agentQuickActions => 'Quick actions';

  @override
  String get agentAddPatient => 'Add patient';

  @override
  String get agentRunScreening => 'Run screening';

  @override
  String get agentCasesByMonth => 'Cases by month';

  @override
  String get agentRecentCases => 'Recent cases';

  @override
  String get agentAllCases => 'All cases';

  @override
  String get agentDashboardNoCases => 'No cases yet';

  @override
  String get agentDashboardNoCasesHint => 'Add a patient, run a screening and request quotes from hospitals.';

  @override
  String agentReferralCode(String code) {
    return 'Your agent code $code';
  }

  @override
  String get agentCopyReferralLink => 'Copy referral link';

  @override
  String get agentReferralLinkCopied => 'Referral link copied';

  @override
  String get agentPatientsTitle => 'My patients';

  @override
  String get agentPatientsSearchHint => 'Search patients';

  @override
  String get agentPatientsEmpty => 'No patients yet';

  @override
  String agentPatientsNoMatch(String query) {
    return 'No patients match \"$query\"';
  }

  @override
  String get agentPatientsEmptyHint => 'Add a patient to run a screening and request hospital quotes for them.';

  @override
  String agentPatientAgeYears(int age) {
    String _temp0 = intl.Intl.pluralLogic(age, locale: localeName, other: '$age yrs');
    return '$_temp0';
  }

  @override
  String agentPatientCasesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count cases', one: '$count case');
    return '$_temp0';
  }

  @override
  String agentPatientScreeningsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count screenings',
      one: '$count screening',
    );
    return '$_temp0';
  }

  @override
  String get agentPatientManaged => 'Managed';

  @override
  String get agentPatientUpdated => 'Patient updated';

  @override
  String get agentPatientAdded => 'Patient added';

  @override
  String get agentFormRequired => 'Required';

  @override
  String get agentEditPatient => 'Edit patient';

  @override
  String get agentPatientFirstName => 'First name';

  @override
  String get agentPatientLastName => 'Last name';

  @override
  String get agentPatientNationalityLabel => 'Nationality (ISO code, e.g. NG, AE, US)';

  @override
  String get agentPatientNationalityInvalid => 'Enter a 2-letter country code';

  @override
  String get agentPatientEmailOptional => 'E-mail (optional)';

  @override
  String get agentPatientEmailHelper => 'The patient receives an invitation to activate their account.';

  @override
  String get agentPatientEmailInvalid => 'Invalid e-mail';

  @override
  String get agentPatientPhoneOptional => 'Phone (optional)';

  @override
  String get agentPatientDobOptional => 'Date of birth (optional)';

  @override
  String get agentPatientMedicalHistoryOptional => 'Medical history (optional)';

  @override
  String get agentPatientTravelMedicalSection => 'Travel & medical details';

  @override
  String get agentPatientPassportNumber => 'Passport number';

  @override
  String get agentPatientPassportKeepHelper => 'Leave empty to keep the stored passport.';

  @override
  String get agentPatientPassportExpiry => 'Passport expiry';

  @override
  String agentPatientPassportExpires(String date) {
    return 'Passport expires $date';
  }

  @override
  String get agentPatientBloodGroup => 'Blood group';

  @override
  String get agentPatientAllergies => 'Allergies';

  @override
  String get agentSaveChanges => 'Save changes';

  @override
  String get agentRequestQuote => 'Request quote';

  @override
  String get agentPatientAccountActivated => 'Account activated';

  @override
  String get agentPatientInvitePending => 'Managed by you · invite pending';

  @override
  String get agentPatientNationality => 'Nationality';

  @override
  String get agentPatientDob => 'Date of birth';

  @override
  String agentPatientDobWithAge(String date, int age) {
    return '$date ($age yrs)';
  }

  @override
  String get agentPatientGender => 'Gender';

  @override
  String get agentPatientEmail => 'E-mail';

  @override
  String get agentPatientPhone => 'Phone';

  @override
  String get agentPatientPassport => 'Passport';

  @override
  String agentPatientPassportExpShort(String date) {
    return 'exp $date';
  }

  @override
  String get agentPatientMedicalHistory => 'Medical history';

  @override
  String get agentScreeningsSection => 'Screenings';

  @override
  String get agentScreeningsEmpty => 'No screenings yet — run one to get AI-matched hospitals and doctors.';

  @override
  String get agentGeneralScreening => 'General screening';

  @override
  String get agentCasesTitle => 'Cases & quotes';

  @override
  String get agentCompareQuotes => 'Compare quotes';

  @override
  String get agentPatientCasesEmpty => 'No hospital enquiries yet.';

  @override
  String agentDocumentUploaded(String fileName) {
    return 'Uploaded $fileName';
  }

  @override
  String get agentDocumentsSection => 'Documents';

  @override
  String get agentDocumentUploading => 'Uploading…';

  @override
  String get agentDocumentsEmpty => 'Upload reports, scans and the passport so hospitals can quote accurately.';

  @override
  String get agentCasesEmpty => 'No cases';

  @override
  String get agentCasesEmptyHint => 'Open a patient and request a quote from a hospital.';

  @override
  String get agentAcceptQuoteTitle => 'Accept this quote?';

  @override
  String agentAcceptQuoteMessage(String hospital, String total) {
    return '$hospital · $total. Other open quotes stay available until booked.';
  }

  @override
  String get agentQuoteAccept => 'Accept';

  @override
  String get agentQuoteAccepted => 'Quote accepted';

  @override
  String get agentRejectQuoteTitle => 'Reject quote';

  @override
  String get agentReasonOptional => 'Reason (optional)';

  @override
  String get agentQuoteReject => 'Reject';

  @override
  String get agentQuoteRejected => 'Quote rejected';

  @override
  String get agentCancelCaseTitle => 'Cancel this case?';

  @override
  String get agentCancelCaseMessage => 'The hospital will be notified.';

  @override
  String get agentCancelCase => 'Cancel case';

  @override
  String get agentCaseCancelled => 'Case cancelled';

  @override
  String get agentCaseFallbackTitle => 'Case';

  @override
  String get agentCaseCoordinator => 'Coordinator';

  @override
  String get agentCaseOpenedLabel => 'Opened';

  @override
  String get agentCaseNotes => 'Notes';

  @override
  String get agentBookTreatment => 'Book treatment';

  @override
  String agentCaseBookingSummary(String date, String balance) {
    return 'Admission $date · balance $balance';
  }

  @override
  String get agentQuotesSection => 'Quotes';

  @override
  String get agentCompareHospitals => 'Compare hospitals';

  @override
  String agentQuotesWaiting(String hospital) {
    return 'Waiting for $hospital to send an itemised quote.';
  }

  @override
  String agentQuoteDated(String date) {
    return 'Quote · $date';
  }

  @override
  String get agentTimelineSection => 'Timeline';

  @override
  String get agentCompareEmpty => 'No quotes to compare yet';

  @override
  String get agentCompareEmptyHint =>
      'Request quotes from several hospitals; they appear here as soon as hospitals reply.';

  @override
  String get agentRequestAQuote => 'Request a quote';

  @override
  String agentCompareBestPrice(String price, String hospital) {
    return 'Best price: $price at $hospital.';
  }

  @override
  String agentCompareBestPriceSaves(String price, String hospital, String savings) {
    return 'Best price: $price at $hospital — saves $savings vs the highest quote.';
  }

  @override
  String get agentCompareMixedCurrencies => 'Quotes are in different currencies; compare totals with care.';

  @override
  String get agentCompareRequestAnother => 'Request another hospital';

  @override
  String get agentCompareStay => 'Stay';

  @override
  String get agentCompareValidUntil => 'Valid until';

  @override
  String agentCompareAcceptTitle(String hospital) {
    return 'Accept $hospital?';
  }

  @override
  String agentCompareAcceptMessage(String total) {
    return 'Total $total';
  }

  @override
  String get agentCompareBest => 'Best';

  @override
  String agentCompareStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days', one: '$count day');
    return '$_temp0';
  }

  @override
  String agentQuoteRequestedFrom(String hospital) {
    return 'Quote requested from $hospital';
  }

  @override
  String get agentSearchHospitalsHint => 'Search hospitals';

  @override
  String get agentNoHospitalsFound => 'No hospitals found';

  @override
  String get agentNotesForHospitalOptional => 'Notes for the hospital (optional)';

  @override
  String get agentSelectHospital => 'Select a hospital';

  @override
  String agentRequestQuoteFrom(String hospital) {
    return 'Request quote from $hospital';
  }

  @override
  String get agentBookingsTitle => 'Bookings & payments';

  @override
  String get agentBookingsEmpty => 'No bookings';

  @override
  String get agentBookingsEmptyHint => 'Accept a hospital quote, then book the treatment for your patient.';

  @override
  String agentBookingAdmissionShort(String date) {
    return 'admission $date';
  }

  @override
  String agentBookingDueShort(String amount) {
    return 'due $amount';
  }

  @override
  String get agentBookingPaidInFull => 'paid in full';

  @override
  String get agentTestPaymentCompleted => 'Test payment completed';

  @override
  String agentBankBeneficiary(String name) {
    return 'Beneficiary: $name';
  }

  @override
  String agentBankName(String bank) {
    return 'Bank: $bank';
  }

  @override
  String agentBankAccount(String account) {
    return 'Account: $account';
  }

  @override
  String agentBankReference(String reference) {
    return 'Reference: $reference';
  }

  @override
  String agentBankAmount(String amount) {
    return 'Amount: $amount';
  }

  @override
  String get agentBankTransferDetailsTitle => 'Bank transfer details';

  @override
  String get agentCopyAndClose => 'Copy & close';

  @override
  String agentCancelBookingTitle(String bookingNumber) {
    return 'Cancel booking $bookingNumber?';
  }

  @override
  String get agentReason => 'Reason';

  @override
  String get agentCancelBooking => 'Cancel booking';

  @override
  String get agentBookingCancelledRefund => 'Booking cancelled; refund follows the hospital policy';

  @override
  String get agentBookingTreatment => 'Treatment';

  @override
  String get agentBookingAdmission => 'Admission';

  @override
  String get agentBookingDischarge => 'Discharge';

  @override
  String get agentBookingPaymentPlan => 'Payment plan';

  @override
  String agentBookingMonthlyInstallments(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count monthly installments',
      one: '$count monthly installment',
    );
    return '$_temp0';
  }

  @override
  String get agentPriceSummary => 'Price summary';

  @override
  String get agentPriceDiscount => 'Discount';

  @override
  String get agentPriceServiceFee => 'Service fee';

  @override
  String get agentPriceTax => 'Tax';

  @override
  String get agentPriceDeposit => 'Deposit';

  @override
  String get agentPricePaid => 'Paid';

  @override
  String get agentPriceRefunded => 'Refunded';

  @override
  String get agentPriceBalanceDue => 'Balance due';

  @override
  String get agentCollectPayment => 'Collect payment';

  @override
  String get agentPaymentsSection => 'Payments';

  @override
  String get agentPaymentsEmpty => 'No payments yet.';

  @override
  String get agentOpenCase => 'Open case';

  @override
  String get agentInstallmentsSection => 'Installments';

  @override
  String agentInstallmentDue(String date) {
    return 'Due $date';
  }

  @override
  String get agentInstallmentCollect => 'Collect';

  @override
  String get agentCollectPaymentHint =>
      'The amount is computed by the server; the patient can also pay in their own app.';

  @override
  String get agentCollectBankTransferOption => 'Bank transfer (SWIFT / NEFT)';

  @override
  String agentCollectContinueAmount(String amount) {
    return 'Continue · ~$amount';
  }

  @override
  String get agentAdmissionDate => 'Admission date';

  @override
  String get agentChooseDate => 'Choose a date';

  @override
  String get agentPaymentSection => 'Payment';

  @override
  String get agentPaymentOptionDeposit => 'Deposit';

  @override
  String get agentPaymentOptionFull => 'Full';

  @override
  String get agentPaymentOptionPlan => 'Plan';

  @override
  String agentInstallmentMonthsChip(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count months', one: '$count month');
    return '$_temp0';
  }

  @override
  String get agentInsuranceClaim => 'Patient wants to claim insurance';

  @override
  String get agentCreateBooking => 'Create booking';

  @override
  String get hpTabDashboard => 'Dashboard';

  @override
  String get hpTabEnquiries => 'Enquiries';

  @override
  String get hpTabPatients => 'Patients';

  @override
  String get hpTabSettlements => 'Settlements';

  @override
  String get hpTabMore => 'More';

  @override
  String get hpSettlementsTitle => 'Settlements & payouts';

  @override
  String get hpDashboardTitle => 'Hospital dashboard';

  @override
  String get hpNoHospitalTitle => 'No hospital linked';

  @override
  String get hpNoHospitalMessage => 'Ask your hospital administrator to invite you as a member.';

  @override
  String get hpListingDraft =>
      'Your listing is a draft. Complete the profile on the hospital web portal and submit it for review.';

  @override
  String get hpListingPendingReview => 'Your listing is under review. Patients will see it once approved.';

  @override
  String hpListingOtherStatus(String status) {
    return 'Your listing is $status. Contact Heal India Global support.';
  }

  @override
  String get hpKpiOpenEnquiries => 'Open enquiries';

  @override
  String get hpKpiQuotesAwaiting => 'Quotes awaiting patient';

  @override
  String get hpKpiUpcomingAdmissions => 'Upcoming admissions';

  @override
  String get hpKpiInTreatment => 'In treatment';

  @override
  String get hpRevenueThisMonth => 'Revenue this month';

  @override
  String get hpRevenueByMonth => 'Revenue by month';

  @override
  String get hpBookingsByMonth => 'Bookings by month';

  @override
  String get hpRecentCases => 'Recent cases';

  @override
  String get hpNoEnquiriesYet => 'No enquiries yet';

  @override
  String get hpEnquiriesFilterNew => 'New';

  @override
  String get hpNoNewEnquiries => 'No new enquiries';

  @override
  String get hpNoCases => 'No cases';

  @override
  String get hpEnquiriesEmptyMessage => 'Patients and agents send enquiries from the matching results.';

  @override
  String hpDeclineTitle(String caseNumber) {
    return 'Decline $caseNumber?';
  }

  @override
  String get hpDeclineReasonLabel => 'Reason shared with the patient';

  @override
  String get hpDeclineButton => 'Decline';

  @override
  String get hpEnquiryDeclined => 'Enquiry declined';

  @override
  String get hpCaseFallbackTitle => 'Case';

  @override
  String get hpPrepareQuote => 'Prepare quote';

  @override
  String get hpSendRevisedQuote => 'Send revised quote';

  @override
  String get hpPatientFallback => 'Patient';

  @override
  String hpYearsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count yrs');
    return '$_temp0';
  }

  @override
  String get hpInfoTreatment => 'Treatment';

  @override
  String get hpInfoDoctor => 'Doctor';

  @override
  String get hpInfoViaAgent => 'Via agent';

  @override
  String get hpInfoCoordinator => 'Coordinator';

  @override
  String get hpInfoReceived => 'Received';

  @override
  String hpCaseBookingLine(String bookingNumber, String date) {
    return 'Booking $bookingNumber · admission $date';
  }

  @override
  String get hpPatientNotes => 'Patient notes';

  @override
  String get hpScreening => 'Screening';

  @override
  String get hpInfoSpecialty => 'Specialty';

  @override
  String get hpInfoBodyAreas => 'Body areas';

  @override
  String get hpInfoPain => 'Pain';

  @override
  String get hpInfoSymptoms => 'Symptoms';

  @override
  String get hpInfoDuration => 'Duration';

  @override
  String get hpInfoUrgency => 'Urgency';

  @override
  String get hpMedicalDocuments => 'Medical documents';

  @override
  String get hpQuotesSection => 'Quotes';

  @override
  String get hpNoQuoteYet => 'No quote sent yet.';

  @override
  String hpQuoteSentOn(String date) {
    return 'Sent $date';
  }

  @override
  String get hpQuoteProblemPlan => 'Describe the treatment plan';

  @override
  String get hpQuoteProblemNoLines => 'Add at least one line item';

  @override
  String get hpQuoteProblemIncompleteLine => 'Every line item needs a description and an amount';

  @override
  String get hpQuoteProblemTooManyLines => 'At most 50 line items';

  @override
  String get hpSendQuoteConfirmTitle => 'Send quote?';

  @override
  String hpSendQuoteConfirmMessage(String total) {
    return 'Total $total — the patient is notified immediately.';
  }

  @override
  String get hpQuoteSent => 'Quote sent';

  @override
  String hpQuoteBuilderTitle(String caseNumber) {
    return 'Quote · $caseNumber';
  }

  @override
  String get hpTreatmentPlanLabel => 'Treatment plan';

  @override
  String get hpCurrencyLabel => 'Currency';

  @override
  String get hpStayDaysLabel => 'Stay (days)';

  @override
  String hpValidUntil(String date) {
    return 'Valid until $date';
  }

  @override
  String get hpLineItems => 'Line items';

  @override
  String get hpAddLineItem => 'Add line item';

  @override
  String get hpTotal => 'Total';

  @override
  String get hpSendQuote => 'Send quote';

  @override
  String get hpCategoryLabel => 'Category';

  @override
  String get hpDescriptionLabel => 'Description';

  @override
  String hpAmountLabel(String currency) {
    return 'Amount ($currency)';
  }

  @override
  String get hpAdmissionsTitle => 'Admissions';

  @override
  String get hpAdmissionsUpcoming => 'Upcoming';

  @override
  String get hpAdmissionsDischarged => 'Discharged';

  @override
  String get hpAdmissionsAwaitingPayment => 'Awaiting payment';

  @override
  String get hpAdmissionsCancelled => 'Cancelled';

  @override
  String get hpAdmissionsEmptyUpcoming => 'No upcoming patients';

  @override
  String get hpAdmissionsEmptyInTreatment => 'No in treatment patients';

  @override
  String get hpAdmissionsEmptyDischarged => 'No discharged patients';

  @override
  String get hpAdmissionsEmptyAwaitingPayment => 'No awaiting payment patients';

  @override
  String get hpAdmissionsEmptyCancelled => 'No cancelled patients';

  @override
  String hpTileDischarged(String date) {
    return 'Discharged $date';
  }

  @override
  String hpTileAdmitted(String date) {
    return 'Admitted $date';
  }

  @override
  String hpTileAdmission(String date) {
    return 'Admission $date';
  }

  @override
  String hpTileInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'in $count days', one: 'in $count day');
    return '$_temp0';
  }

  @override
  String get hpAdmitPatientTitle => 'Admit patient?';

  @override
  String hpAdmitNamedTitle(String name) {
    return 'Admit $name?';
  }

  @override
  String get hpNoteOptional => 'Note (optional)';

  @override
  String get hpAdmitButton => 'Admit';

  @override
  String get hpPatientAdmitted => 'Patient admitted';

  @override
  String get hpDischargeDate => 'Discharge date';

  @override
  String get hpDischargeNoteTitle => 'Discharge summary note';

  @override
  String get hpDischargeButton => 'Discharge';

  @override
  String get hpPatientDischarged => 'Patient discharged';

  @override
  String get hpAddedToItinerary => 'Added to itinerary';

  @override
  String get hpBookingFallbackTitle => 'Booking';

  @override
  String get hpItinerary => 'Itinerary';

  @override
  String get hpInfoAdmission => 'Admission';

  @override
  String get hpInfoAdmitted => 'Admitted';

  @override
  String get hpInfoDischarge => 'Discharge';

  @override
  String get hpInfoLengthOfStay => 'Length of stay';

  @override
  String hpDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count days');
    return '$_temp0';
  }

  @override
  String get hpInfoPaid => 'Paid';

  @override
  String get hpAdmitPatientButton => 'Admit patient';

  @override
  String get hpDischargePatientButton => 'Discharge patient';

  @override
  String get hpAwaitingDeposit => 'Awaiting the patient deposit. Admission opens once the booking is confirmed.';

  @override
  String get hpOpenCase => 'Open case';

  @override
  String get hpNoItineraryYet => 'No itinerary yet — add appointments, the surgery slot, pickup and follow-ups.';

  @override
  String get hpItineraryMarkedDone => 'Marked done';

  @override
  String get hpItineraryCancelled => 'Cancelled';

  @override
  String get hpItineraryRemoved => 'Removed';

  @override
  String get hpItineraryMarkDone => 'Mark done';

  @override
  String get hpAddToItinerary => 'Add to itinerary';

  @override
  String get hpItineraryTypeLabel => 'Type';

  @override
  String get hpItineraryTitleLabel => 'Title (e.g. Pre-op consultation)';

  @override
  String get hpItineraryDateTime => 'Date & time';

  @override
  String get hpItineraryLocationLabel => 'Location';

  @override
  String get hpItineraryInstructionsLabel => 'Instructions for the patient (optional)';

  @override
  String get hpItineraries => 'Itineraries';

  @override
  String get hpNobodyAdmitted => 'Nobody admitted right now.';

  @override
  String get hpUpcomingArrivals => 'Upcoming arrivals';

  @override
  String get hpNoConfirmedBookings => 'No confirmed bookings.';

  @override
  String get hpMoreItinerariesSubtitle => 'Appointments, surgery slots, pickups';

  @override
  String get hpVisaLettersTitle => 'Visa invitation letters';

  @override
  String get hpMoreVisasSubtitle => 'Medical visa requests from patients';

  @override
  String get hpDoctorsTitle => 'Doctors';

  @override
  String get hpMoreDoctorsSubtitle => 'Your specialists and their profiles';

  @override
  String get hpMorePriceListSubtitle => 'Procedures, price ranges and packages';

  @override
  String get hpActingFor => 'Acting for';

  @override
  String get hpWebPortalNote =>
      'Profile, members, availability and price edits are available on the hospital web portal.';

  @override
  String get hpNoVisaRequests => 'No visa requests';

  @override
  String get hpInvitationLetterNeeded => 'Invitation letter needed';

  @override
  String get hpVisaRequestFallback => 'Visa request';

  @override
  String get hpNoInvitationLetterYet => 'No invitation letter yet';

  @override
  String get hpInvitationLetterUploaded => 'Invitation letter: uploaded';

  @override
  String hpInvitationLetterNamed(String fileName) {
    return 'Invitation letter: $fileName';
  }

  @override
  String get hpReplace => 'Replace';

  @override
  String get hpStatusLabel => 'Status';

  @override
  String get hpEvisaReferenceLabel => 'e-Visa application reference';

  @override
  String get hpNotesLabel => 'Notes';

  @override
  String get hpNoDoctorsListed => 'No doctors listed';

  @override
  String get hpTeleconsultBadge => 'Tele-consult';

  @override
  String hpConsultationFee(String fee) {
    return 'Fee $fee';
  }

  @override
  String get priceListTitle => 'Price list';

  @override
  String get priceListEmpty => 'No procedures priced yet';

  @override
  String priceListStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count day stay');
    return '$_temp0';
  }

  @override
  String priceListSuccessRate(String rate) {
    return '$rate% success';
  }

  @override
  String get reportAnalysisTitle => 'Your report';

  @override
  String get reportConfirmedSnack => 'Report confirmed.';

  @override
  String reportMaxPages(int max) {
    String _temp0 = intl.Intl.pluralLogic(max, locale: localeName, other: 'A report can have up to $max pages.');
    return '$_temp0';
  }

  @override
  String reportFileTooLarge(String fileName) {
    return '$fileName is too large (max 20 MB).';
  }

  @override
  String get reportPermissionNeeded => 'Please allow camera / photo access in your phone settings to add pages.';

  @override
  String reportUploadingPage(int current, int total) {
    return 'Uploading page $current of $total…';
  }

  @override
  String get reportSendingToAi => 'Sending to AI…';

  @override
  String get reportReviewTitle => 'Review your report';

  @override
  String get reportCaptureTitle => 'Add a medical report';

  @override
  String get reportCaptureIntro => 'Take a photo of each page of a paper report, choose photos, or upload a PDF.';

  @override
  String get reportTakePhoto => 'Take photo';

  @override
  String get reportChooseFromGallery => 'Choose from gallery';

  @override
  String get reportUploadPdf => 'Upload PDF';

  @override
  String reportPagesCount(int count, int max) {
    return 'Pages ($count/$max)';
  }

  @override
  String get reportNoPagesTip => 'No pages yet. Tip: lay the page flat in good light and fill the frame.';

  @override
  String get reportKindQuestion => 'What kind of document is it?';

  @override
  String get reportReadWithAi => 'Read my report with AI';

  @override
  String get reportAiConsentText =>
      'Our AI assistant reads the pages and lists your test results, diagnoses and medicines. You check and correct everything before it is used, and it is only shared with hospitals you choose. You can switch this off and simply upload the report.';

  @override
  String get reportUploadButton => 'Upload report';

  @override
  String reportPageNumber(int number) {
    return 'Page $number';
  }

  @override
  String reportRemovePage(int number) {
    return 'Remove page $number';
  }

  @override
  String get reportDragToReorder => 'Drag to reorder';

  @override
  String get reportAiEntryTooltip => 'Read reports with AI';

  @override
  String get reportSheetTitle => 'Your reports, read by AI';

  @override
  String get reportSheetIntro =>
      'Photograph a paper report or pick a PDF. You check and confirm everything before it is used.';

  @override
  String get reportScanButton => 'Scan a report';

  @override
  String get reportNoReadings => 'No AI readings yet.';

  @override
  String get reportMedicalReportFallback => 'Medical report';

  @override
  String get reportImportant => 'Important';

  @override
  String get reportCriticalValues => 'Critical values';

  @override
  String get reportSummary => 'Summary';

  @override
  String get reportKeyFindings => 'Key findings';

  @override
  String get reportLabValues => 'Lab values';

  @override
  String get reportMedications => 'Medications';

  @override
  String get reportDiagnosesMentioned => 'Diagnoses mentioned';

  @override
  String get reportProceduresMentioned => 'Procedures mentioned';

  @override
  String get reportRecommendations => 'Recommendations';

  @override
  String get reportAiDisclaimer => 'AI-generated — always confirm with your doctor.';

  @override
  String get reportStatusConfirmed => 'Confirmed';

  @override
  String get reportStatusDiscarded => 'Discarded';

  @override
  String get reportStatusReading => 'Reading…';

  @override
  String get reportStatusNotRead => 'Not read';

  @override
  String get reportStatusNeedsReview => 'Needs review';

  @override
  String get reportLabTest => 'Test';

  @override
  String get reportLabResult => 'Result';

  @override
  String get reportLabRange => 'Range';

  @override
  String get reportEdited => 'Edited';

  @override
  String get reportDateLabel => 'Report date';

  @override
  String get reportCriticalValuesInReport => 'Critical values in this report';

  @override
  String get reportAboutSection => 'About this report';

  @override
  String get reportDocTypeLabel => 'Document type';

  @override
  String get reportClearDate => 'Clear date';

  @override
  String get reportDateNotStated => 'Not stated';

  @override
  String get reportFacilityLabel => 'Hospital / laboratory';

  @override
  String get reportSummaryHint => 'What the report says, in plain words';

  @override
  String get findingAdd => 'Add finding';

  @override
  String findingRemove(int number) {
    return 'Remove finding $number';
  }

  @override
  String get findingLabel => 'Finding';

  @override
  String get labAddValue => 'Add value';

  @override
  String labRemoveValue(int number) {
    return 'Remove lab value $number';
  }

  @override
  String get labValueLabel => 'Value';

  @override
  String get labUnitLabel => 'Unit';

  @override
  String get labReferenceRangeLabel => 'Reference range';

  @override
  String get reportAddMedication => 'Add medication';

  @override
  String reportRemoveMedication(int number) {
    return 'Remove medication $number';
  }

  @override
  String get reportMedicineLabel => 'Medicine';

  @override
  String get reportDoseLabel => 'Dose';

  @override
  String get reportFrequencyLabel => 'How often';

  @override
  String get reportAddDiagnosis => 'Add diagnosis';

  @override
  String get reportAddProcedure => 'Add procedure';

  @override
  String get reportAddRecommendation => 'Add recommendation';

  @override
  String get reportNone => 'None';
}
