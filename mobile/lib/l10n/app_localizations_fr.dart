// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'Heal India Global';

  @override
  String get appTagline => 'Votre porte d\'accès à l\'excellence médicale indienne';

  @override
  String get commonCancel => 'Annuler';

  @override
  String get commonOk => 'OK';

  @override
  String get commonSave => 'Enregistrer';

  @override
  String get commonRetry => 'Réessayer';

  @override
  String get commonTryAgain => 'Réessayer';

  @override
  String get commonClose => 'Fermer';

  @override
  String get commonContinue => 'Continuer';

  @override
  String get commonBack => 'Retour';

  @override
  String get commonNext => 'Suivant';

  @override
  String get commonDone => 'Terminé';

  @override
  String get commonEdit => 'Modifier';

  @override
  String get commonDelete => 'Supprimer';

  @override
  String get commonRemove => 'Retirer';

  @override
  String get commonSubmit => 'Envoyer';

  @override
  String get commonConfirm => 'Confirmer';

  @override
  String get commonYes => 'Oui';

  @override
  String get commonNo => 'Non';

  @override
  String get commonSeeAll => 'Tout voir';

  @override
  String get commonApply => 'Appliquer';

  @override
  String get commonReset => 'Réinitialiser';

  @override
  String get commonClear => 'Effacer';

  @override
  String get commonSkip => 'Passer';

  @override
  String get commonSend => 'Envoyer';

  @override
  String get commonOpen => 'Ouvrir';

  @override
  String get commonDownload => 'Télécharger';

  @override
  String get commonUpload => 'Importer';

  @override
  String get commonAdd => 'Ajouter';

  @override
  String get commonOptional => 'Facultatif';

  @override
  String get commonLoading => 'Chargement…';

  @override
  String get commonSomethingWentWrong => 'Une erreur s\'est produite';

  @override
  String get commonErrorDisplayingSection => 'Une erreur s\'est produite lors de l\'affichage de cette section.';

  @override
  String get commonLogOut => 'Se déconnecter';

  @override
  String get commonDeleteAccount => 'Supprimer le compte';

  @override
  String get commonAccount => 'Compte';

  @override
  String get commonListSeparator => ' · ';

  @override
  String get languageSettingTitle => 'Langue';

  @override
  String get languagePickerTitle => 'Langue de l\'application';

  @override
  String get languagePickerHint =>
      'L\'application, les résumés IA et la saisie vocale utilisent cette langue. Les coordinateurs et les hôpitaux vous contacteront dans cette langue lorsque c\'est possible.';

  @override
  String languageChanged(String language) {
    return 'Langue changée : $language.';
  }

  @override
  String get languageProfileSyncFailed =>
      'Langue changée sur cet appareil. Nous n\'avons pas pu l\'enregistrer dans votre profil ; nous réessaierons plus tard.';

  @override
  String get languageButtonTooltip => 'Changer de langue';

  @override
  String get datesJustNow => 'à l\'instant';

  @override
  String datesMinutesAgo(int minutes) {
    return 'il y a $minutes min';
  }

  @override
  String datesHoursAgo(int hours) {
    return 'il y a $hours h';
  }

  @override
  String get datesYesterday => 'Hier';

  @override
  String datesDaysAgo(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'il y a $days jours',
      one: 'il y a $days jour',
    );
    return '$_temp0';
  }

  @override
  String get enumUserRolePatient => 'Patient';

  @override
  String get enumUserRoleAgent => 'Agent';

  @override
  String get enumUserRoleHospital => 'Hôpital';

  @override
  String get enumUserRoleAdmin => 'Administrateur';

  @override
  String get enumUserRoleFinance => 'Finance';

  @override
  String get enumUserRoleSupport => 'Assistance';

  @override
  String get enumUserRoleSuperAdmin => 'Super administrateur';

  @override
  String get enumUserStatusActive => 'Actif';

  @override
  String get enumUserStatusPendingVerification => 'En attente de vérification';

  @override
  String get enumUserStatusSuspended => 'Suspendu';

  @override
  String get enumUserStatusDeleted => 'Supprimé';

  @override
  String get enumGenderMale => 'Homme';

  @override
  String get enumGenderFemale => 'Femme';

  @override
  String get enumGenderOther => 'Autre';

  @override
  String get enumGenderUndisclosed => 'Non précisé';

  @override
  String get enumDoctorGenderPrefMale => 'Homme';

  @override
  String get enumDoctorGenderPrefFemale => 'Femme';

  @override
  String get enumDoctorGenderPrefNoPreference => 'Pas de préférence';

  @override
  String get enumKycStatusNotSubmitted => 'Non soumis';

  @override
  String get enumKycStatusPending => 'En attente';

  @override
  String get enumKycStatusApproved => 'Approuvé';

  @override
  String get enumKycStatusRejected => 'Refusé';

  @override
  String get enumHospitalStatusDraft => 'Brouillon';

  @override
  String get enumHospitalStatusPendingReview => 'En attente de vérification';

  @override
  String get enumHospitalStatusActive => 'Actif';

  @override
  String get enumHospitalStatusSuspended => 'Suspendu';

  @override
  String get enumHospitalStatusRejected => 'Refusé';

  @override
  String get enumAgentStatusPending => 'En attente';

  @override
  String get enumAgentStatusActive => 'Actif';

  @override
  String get enumAgentStatusSuspended => 'Suspendu';

  @override
  String get enumAgentStatusRejected => 'Refusé';

  @override
  String get enumHospitalMemberRoleOwner => 'Propriétaire';

  @override
  String get enumHospitalMemberRoleAdmin => 'Administrateur';

  @override
  String get enumHospitalMemberRoleCoordinator => 'Coordinateur';

  @override
  String get enumHospitalMemberRoleFinance => 'Finance';

  @override
  String get enumHospitalMemberRoleDoctor => 'Médecin';

  @override
  String get enumPackageTierMedicalOnly => 'Soins uniquement';

  @override
  String get enumPackageTierMedicalStay => 'Soins + hébergement';

  @override
  String get enumPackageTierAllInclusive => 'Tout compris';

  @override
  String get enumScreeningStatusDraft => 'Brouillon';

  @override
  String get enumScreeningStatusProcessing => 'En cours de traitement';

  @override
  String get enumScreeningStatusCompleted => 'Terminé';

  @override
  String get enumScreeningStatusFailed => 'Échec';

  @override
  String get enumUrgencyRoutine => 'Courant';

  @override
  String get enumUrgencySoon => 'Bientôt';

  @override
  String get enumUrgencyUrgent => 'Urgent';

  @override
  String get enumUrgencyEmergency => 'Urgence vitale';

  @override
  String get enumDurationUnitDays => 'Jours';

  @override
  String get enumDurationUnitWeeks => 'Semaines';

  @override
  String get enumDurationUnitMonths => 'Mois';

  @override
  String get enumDurationUnitYears => 'Années';

  @override
  String get enumSeverityLevelNone => 'Aucune';

  @override
  String get enumSeverityLevelMild => 'Léger';

  @override
  String get enumSeverityLevelModerate => 'Modéré';

  @override
  String get enumSeverityLevelSevere => 'Sévère';

  @override
  String get enumSymptomAnswerYes => 'Oui';

  @override
  String get enumSymptomAnswerMaybe => 'Peut-être';

  @override
  String get enumSymptomAnswerNo => 'Non';

  @override
  String get enumCaseStatusEnquiry => 'Demande';

  @override
  String get enumCaseStatusQuoted => 'Devis envoyé';

  @override
  String get enumCaseStatusAccepted => 'Accepté';

  @override
  String get enumCaseStatusBooked => 'Réservé';

  @override
  String get enumCaseStatusInTreatment => 'En traitement';

  @override
  String get enumCaseStatusCompleted => 'Terminé';

  @override
  String get enumCaseStatusCancelled => 'Annulé';

  @override
  String get enumCaseStatusDeclined => 'Décliné';

  @override
  String get enumQuoteStatusDraft => 'Brouillon';

  @override
  String get enumQuoteStatusSent => 'Envoyé';

  @override
  String get enumQuoteStatusAccepted => 'Accepté';

  @override
  String get enumQuoteStatusRejected => 'Refusé';

  @override
  String get enumQuoteStatusExpired => 'Expiré';

  @override
  String get enumQuoteStatusWithdrawn => 'Retiré';

  @override
  String get enumQuoteLineCategorySurgery => 'Chirurgie';

  @override
  String get enumQuoteLineCategoryHospitalStay => 'Séjour à l\'hôpital';

  @override
  String get enumQuoteLineCategoryMedications => 'Médicaments';

  @override
  String get enumQuoteLineCategoryTestsScans => 'Examens et imagerie';

  @override
  String get enumQuoteLineCategoryDoctorFees => 'Honoraires médicaux';

  @override
  String get enumQuoteLineCategoryImplants => 'Implants';

  @override
  String get enumQuoteLineCategoryOther => 'Autre';

  @override
  String get enumBookingStatusPendingPayment => 'En attente de paiement';

  @override
  String get enumBookingStatusConfirmed => 'Confirmé';

  @override
  String get enumBookingStatusAdmitted => 'Admis';

  @override
  String get enumBookingStatusCompleted => 'Terminé';

  @override
  String get enumBookingStatusCancelled => 'Annulé';

  @override
  String get enumPaymentOptionFull => 'Paiement intégral';

  @override
  String get enumPaymentOptionDeposit => 'Acompte';

  @override
  String get enumPaymentOptionInstallments => 'Paiement échelonné';

  @override
  String get enumConsultationStatusRequested => 'Demandé';

  @override
  String get enumConsultationStatusScheduled => 'Planifié';

  @override
  String get enumConsultationStatusCompleted => 'Terminé';

  @override
  String get enumConsultationStatusCancelled => 'Annulé';

  @override
  String get enumChecklistStatusPending => 'En attente';

  @override
  String get enumChecklistStatusInProgress => 'En cours';

  @override
  String get enumChecklistStatusDone => 'Terminé';

  @override
  String get enumItineraryKindAppointment => 'Rendez-vous';

  @override
  String get enumItineraryKindAdmission => 'Admission';

  @override
  String get enumItineraryKindSurgery => 'Chirurgie';

  @override
  String get enumItineraryKindPickup => 'Prise en charge';

  @override
  String get enumItineraryKindCheckin => 'Arrivée';

  @override
  String get enumItineraryKindCheckout => 'Départ';

  @override
  String get enumItineraryKindFollowup => 'Suivi';

  @override
  String get enumItineraryKindSightseeing => 'Visite touristique';

  @override
  String get enumItineraryKindOther => 'Autre';

  @override
  String get enumVisaStatusNotStarted => 'Pas commencé';

  @override
  String get enumVisaStatusDocumentsPending => 'Documents en attente';

  @override
  String get enumVisaStatusInvitationIssued => 'Lettre d\'invitation émise';

  @override
  String get enumVisaStatusApplied => 'Demande déposée';

  @override
  String get enumVisaStatusApproved => 'Approuvé';

  @override
  String get enumVisaStatusRejected => 'Refusé';

  @override
  String get enumTravelKindFlight => 'Vol';

  @override
  String get enumTravelKindAirportPickup => 'Accueil à l\'aéroport';

  @override
  String get enumTravelKindAirportDrop => 'Transfert vers l\'aéroport';

  @override
  String get enumTravelKindLocalTransport => 'Transport local';

  @override
  String get enumServiceBookingStatusRequested => 'Demandé';

  @override
  String get enumServiceBookingStatusQuoted => 'Devis envoyé';

  @override
  String get enumServiceBookingStatusConfirmed => 'Confirmé';

  @override
  String get enumServiceBookingStatusCompleted => 'Terminé';

  @override
  String get enumServiceBookingStatusCancelled => 'Annulé';

  @override
  String get enumAccommodationTypeHotel => 'Hôtel';

  @override
  String get enumAccommodationTypeGuestHouse => 'Maison d\'hôtes';

  @override
  String get enumAccommodationTypeServiceApartment => 'Appartement avec services';

  @override
  String get enumAccommodationTypeHospitalGuestRoom => 'Chambre d\'hôtes de l\'hôpital';

  @override
  String get enumServiceKindTranslator => 'Interprète';

  @override
  String get enumServiceKindLocalGuide => 'Guide local';

  @override
  String get enumServiceKindTransport => 'Transport';

  @override
  String get enumServiceKindTravelAgent => 'Agent de voyage';

  @override
  String get enumServiceKindInsurance => 'Assurance';

  @override
  String get enumDocumentKindPassport => 'Passeport';

  @override
  String get enumDocumentKindVisa => 'Visa';

  @override
  String get enumDocumentKindMedicalReport => 'Rapport médical';

  @override
  String get enumDocumentKindPrescription => 'Ordonnance';

  @override
  String get enumDocumentKindLabResult => 'Résultat d\'analyse';

  @override
  String get enumDocumentKindImaging => 'Imagerie';

  @override
  String get enumDocumentKindInvitationLetter => 'Lettre d\'invitation';

  @override
  String get enumDocumentKindInvoice => 'Facture';

  @override
  String get enumDocumentKindReceipt => 'Reçu';

  @override
  String get enumDocumentKindKycRegistration => 'Enregistrement (KYC)';

  @override
  String get enumDocumentKindKycAccreditation => 'Accréditation (KYC)';

  @override
  String get enumDocumentKindKycPan => 'Carte PAN';

  @override
  String get enumDocumentKindKycGst => 'Certificat GST';

  @override
  String get enumDocumentKindKycIdProof => 'Pièce d\'identité';

  @override
  String get enumDocumentKindBankProof => 'Justificatif bancaire';

  @override
  String get enumDocumentKindPaymentProof => 'Preuve de paiement';

  @override
  String get enumDocumentKindOther => 'Autre';

  @override
  String get enumDocumentStatusUploaded => 'Importé';

  @override
  String get enumDocumentStatusVerified => 'Vérifié';

  @override
  String get enumDocumentStatusRejected => 'Refusé';

  @override
  String get enumConsentKindTerms => 'Conditions';

  @override
  String get enumConsentKindPrivacy => 'Confidentialité';

  @override
  String get enumConsentKindAiProcessing => 'Traitement par l\'IA';

  @override
  String get enumConsentKindShareWithHospitals => 'Partage avec les hôpitaux';

  @override
  String get enumConsentKindMarketing => 'Marketing';

  @override
  String get enumPaymentGatewayRazorpay => 'Carte de crédit/débit';

  @override
  String get enumPaymentGatewayStripe => 'Carte (Stripe)';

  @override
  String get enumPaymentGatewayBankTransfer => 'Virement bancaire';

  @override
  String get enumPaymentGatewayMock => 'Paiement de test';

  @override
  String get enumPaymentPurposeConsultationFee => 'Frais de consultation';

  @override
  String get enumPaymentPurposeBookingDeposit => 'Acompte de réservation';

  @override
  String get enumPaymentPurposeBookingBalance => 'Solde de la réservation';

  @override
  String get enumPaymentPurposeBookingFull => 'Réservation (paiement intégral)';

  @override
  String get enumPaymentPurposeInstallment => 'Échéance';

  @override
  String get enumPaymentPurposeService => 'Service';

  @override
  String get enumOrderStatusCreated => 'Créé';

  @override
  String get enumOrderStatusPending => 'En attente';

  @override
  String get enumOrderStatusPaid => 'Payé';

  @override
  String get enumOrderStatusPartiallyRefunded => 'Partiellement remboursé';

  @override
  String get enumOrderStatusRefunded => 'Remboursé';

  @override
  String get enumOrderStatusFailed => 'Échec';

  @override
  String get enumOrderStatusExpired => 'Expiré';

  @override
  String get enumOrderStatusCancelled => 'Annulé';

  @override
  String get enumPaymentStatusCreated => 'Créé';

  @override
  String get enumPaymentStatusAuthorized => 'Autorisé';

  @override
  String get enumPaymentStatusCaptured => 'Encaissé';

  @override
  String get enumPaymentStatusFailed => 'Échec';

  @override
  String get enumPaymentStatusRefunded => 'Remboursé';

  @override
  String get enumPaymentStatusPartiallyRefunded => 'Partiellement remboursé';

  @override
  String get enumRefundStatusRequested => 'Demandé';

  @override
  String get enumRefundStatusApproved => 'Approuvé';

  @override
  String get enumRefundStatusProcessing => 'En cours de traitement';

  @override
  String get enumRefundStatusProcessed => 'Traité';

  @override
  String get enumRefundStatusFailed => 'Échec';

  @override
  String get enumRefundStatusRejected => 'Refusé';

  @override
  String get enumInstallmentStatusDue => 'À payer';

  @override
  String get enumInstallmentStatusPaid => 'Payé';

  @override
  String get enumInstallmentStatusOverdue => 'En retard';

  @override
  String get enumInstallmentStatusCancelled => 'Annulé';

  @override
  String get enumInvoiceKindPatientReceipt => 'Reçu du patient';

  @override
  String get enumInvoiceKindCommissionInvoice => 'Facture de commission';

  @override
  String get enumInvoiceKindAgentStatement => 'Relevé de l\'agent';

  @override
  String get enumPayeeTypeHospital => 'Hôpital';

  @override
  String get enumPayeeTypeAgent => 'Agent';

  @override
  String get enumPayeeTypeVendor => 'Prestataire';

  @override
  String get enumItineraryItemStatusScheduled => 'Planifié';

  @override
  String get enumItineraryItemStatusDone => 'Terminé';

  @override
  String get enumItineraryItemStatusCancelled => 'Annulé';

  @override
  String get enumVisaTypeEMedical => 'e-Visa médical';

  @override
  String get enumVisaTypeEMedicalAttendant => 'e-Visa d\'accompagnant médical';

  @override
  String get enumSosStatusOpen => 'Ouvert';

  @override
  String get enumSosStatusAcknowledged => 'Pris en compte';

  @override
  String get enumSosStatusResolved => 'Résolu';

  @override
  String get enumConversationKindCaseThread => 'Dossier';

  @override
  String get enumConversationKindSupport => 'Assistance';

  @override
  String get enumConversationKindDirect => 'Direct';

  @override
  String get enumSavedEntityTypeHospital => 'Hôpital';

  @override
  String get enumSavedEntityTypeDoctor => 'Médecin';

  @override
  String get enumSavedEntityTypeProcedure => 'Intervention';

  @override
  String get enumConsultationModeVideo => 'Vidéo';

  @override
  String get enumConsultationModePhone => 'Téléphone';

  @override
  String get enumSlotKindConsultation => 'Consultation';

  @override
  String get enumSlotKindAdmission => 'Admission';

  @override
  String get enumTriageEngineClaude => 'IA (Claude)';

  @override
  String get enumTriageEngineRules => 'Moteur de règles';

  @override
  String get enumLikelihoodLow => 'Faible';

  @override
  String get enumLikelihoodMedium => 'Moyen';

  @override
  String get enumLikelihoodHigh => 'Élevé';

  @override
  String get enumDevicePlatformAndroid => 'Android';

  @override
  String get enumDevicePlatformIos => 'iOS';

  @override
  String get enumDevicePlatformWeb => 'Web';

  @override
  String get enumPreviousTreatmentMedication => 'Médicaments';

  @override
  String get enumPreviousTreatmentPhysicalTherapy => 'Kinésithérapie';

  @override
  String get enumPreviousTreatmentSurgery => 'Chirurgie';

  @override
  String get enumPreviousTreatmentOther => 'Autre';

  @override
  String get enumChecklistKeyTreatmentBooked => 'Traitement réservé';

  @override
  String get enumChecklistKeyVisaApproved => 'Visa approuvé';

  @override
  String get enumChecklistKeyFlightBooked => 'Réservation du vol';

  @override
  String get enumChecklistKeyTravelInsurance => 'Assurance voyage';

  @override
  String get enumChecklistKeyAirportPickup => 'Accueil à l\'aéroport';

  @override
  String get enumChecklistKeyDocumentsUploaded => 'Documents importés';

  @override
  String get enumChecklistKeyAccommodationBooked => 'Hébergement réservé';

  @override
  String get enumAnalysisStatusQueued => 'En file d\'attente';

  @override
  String get enumAnalysisStatusProcessing => 'En cours de traitement';

  @override
  String get enumAnalysisStatusCompleted => 'Terminé';

  @override
  String get enumAnalysisStatusFailed => 'Échec';

  @override
  String get enumAnalysisStatusUnsupported => 'Non pris en charge';

  @override
  String get enumAnalysisReviewStatusPendingReview => 'En attente de vérification';

  @override
  String get enumAnalysisReviewStatusConfirmed => 'Confirmé';

  @override
  String get enumAnalysisReviewStatusRejected => 'Refusé';

  @override
  String get enumReportDocTypeLabReport => 'Compte rendu d\'analyses';

  @override
  String get enumReportDocTypeImagingReport => 'Compte rendu d\'imagerie';

  @override
  String get enumReportDocTypeDischargeSummary => 'Compte rendu de sortie';

  @override
  String get enumReportDocTypePrescription => 'Ordonnance';

  @override
  String get enumReportDocTypeConsultationNote => 'Compte rendu de consultation';

  @override
  String get enumReportDocTypePathologyReport => 'Compte rendu d\'anatomopathologie';

  @override
  String get enumReportDocTypeInsuranceDocument => 'Document d\'assurance';

  @override
  String get enumReportDocTypeOther => 'Autre';

  @override
  String get enumFindingSignificanceNormal => 'Normal';

  @override
  String get enumFindingSignificanceAttention => 'À surveiller';

  @override
  String get enumFindingSignificanceUrgent => 'Urgent';

  @override
  String get enumLabFlagLow => 'Faible';

  @override
  String get enumLabFlagHigh => 'Élevé';

  @override
  String get enumLabFlagNormal => 'Normal';

  @override
  String get enumLabFlagCritical => 'Critique';

  @override
  String get enumLabFlagUnknown => 'Inconnu';

  @override
  String get enumVoiceStatusQueued => 'En file d\'attente';

  @override
  String get enumVoiceStatusProcessing => 'En cours de traitement';

  @override
  String get enumVoiceStatusCompleted => 'Terminé';

  @override
  String get enumVoiceStatusFailed => 'Échec';

  @override
  String get enumVoiceReviewStatusPendingReview => 'En attente de vérification';

  @override
  String get enumVoiceReviewStatusConfirmed => 'Confirmé';

  @override
  String get enumVoiceReviewStatusDiscarded => 'Abandonné';

  @override
  String get coreInvalidCredentials => 'Adresse e-mail ou mot de passe incorrect.';

  @override
  String get coreGoogleSignInUnavailable => 'La connexion avec Google n\'est pas disponible dans cette version.';

  @override
  String get coreGoogleNoToken => 'Google n\'a pas renvoyé de jeton.';

  @override
  String get coreGoogleSignInFailed => 'La connexion avec Google a échoué.';

  @override
  String get coreAppleNoToken => 'Apple n\'a pas renvoyé de jeton.';

  @override
  String coreAppleSignInFailed(String error) {
    return 'La connexion avec Apple a échoué ($error).';
  }

  @override
  String get coreNoFileSelected => 'Aucun fichier sélectionné.';

  @override
  String get coreUploadUnsupportedType =>
      'Type de fichier non pris en charge. Utilisez PDF, JPG, PNG, WEBP, HEIC ou DICOM.';

  @override
  String get coreUploadTooLarge => 'Le fichier est trop volumineux (20 Mo maximum).';

  @override
  String get coreScreeningAnalysisSlow =>
      'L\'analyse prend plus de temps que prévu. Nous vous préviendrons dès qu\'elle sera prête.';

  @override
  String get coreBiometricPay => 'Payer';

  @override
  String get coreBiometricPayFaceId => 'Payer avec Face ID';

  @override
  String get coreBiometricPayFingerprint => 'Payer avec l\'empreinte digitale';

  @override
  String get coreBiometricConfirmReason => 'Confirmez votre paiement';

  @override
  String get coreLocationServiceOff => 'La localisation est désactivée sur votre téléphone.';

  @override
  String get coreLocationDenied => 'L\'autorisation d\'accès à la localisation n\'a pas été accordée.';

  @override
  String get coreLocationBlocked =>
      'La localisation est bloquée pour cette application dans les réglages de votre téléphone.';

  @override
  String get coreLocationUnavailable => 'Votre téléphone n\'a pas pu trouver votre position à temps.';

  @override
  String corePackageNightsAccommodation(int nights) {
    String _temp0 = intl.Intl.pluralLogic(
      nights,
      locale: localeName,
      other: '$nights nuits d\'hébergement',
      one: '$nights nuit d\'hébergement',
    );
    return '$_temp0';
  }

  @override
  String get corePackageAirportPickup => 'Accueil à l\'aéroport';

  @override
  String get corePackageTranslator => 'Interprète';

  @override
  String get corePackageMeals => 'Repas';

  @override
  String get corePackageLocalTransport => 'Transport local';

  @override
  String corePackageFollowupTeleconsults(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count téléconsultations de suivi',
      one: '$count téléconsultation de suivi',
    );
    return '$_temp0';
  }

  @override
  String coreSavePercent(int pct) {
    return 'Économisez $pct %';
  }

  @override
  String coreSavePercentRange(int min, int max) {
    return 'Économisez $min-$max %';
  }

  @override
  String get coreUserGuest => 'Invité';

  @override
  String get coreUserPatient => 'Patient';

  @override
  String coreMatchScore(int score) {
    return 'Correspondance $score %';
  }

  @override
  String get coreErrorOffline => 'Vous êtes hors ligne';

  @override
  String get coreAvatarLabel => 'Avatar';

  @override
  String coreRatingCaption(String rating) {
    return '($rating/5)';
  }

  @override
  String coreRatingCaptionReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '($rating/5 sur $count avis)',
      one: '($rating/5 sur $count avis)',
    );
    return '$_temp0';
  }

  @override
  String coreRatingSemantics(String rating) {
    return 'Note : $rating sur 5';
  }

  @override
  String coreRatingSemanticsReviews(int count, String rating) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Note : $rating sur 5, $count avis',
      one: 'Note : $rating sur 5, $count avis',
    );
    return '$_temp0';
  }

  @override
  String coreStepProgress(int step, int total) {
    return 'Étape $step sur $total';
  }

  @override
  String coreStepProgressWithSuffix(int step, int total, String suffix) {
    return 'Étape $step sur $total · $suffix';
  }

  @override
  String get navHome => 'Accueil';

  @override
  String get navSearch => 'Recherche';

  @override
  String get navTrips => 'Voyages';

  @override
  String get navMessages => 'Messages';

  @override
  String get navProfile => 'Profil';

  @override
  String get routerNotFoundTitle => 'Page introuvable';

  @override
  String routerNotFoundMessage(String location) {
    return 'Nous n\'avons pas trouvé « $location ».';
  }

  @override
  String get routerGoHome => 'Retour à l\'accueil';

  @override
  String get homeTitle => 'Qu\'est-ce qui vous amène en Inde ?';

  @override
  String get homeSubtitle => 'Sélectionnez votre besoin médical';

  @override
  String get homeSearchHint => 'Rechercher une pathologie';

  @override
  String get homeSearchButton => 'Rechercher';

  @override
  String get homeAllSpecialties => 'Toutes les spécialités';

  @override
  String get homeNoSpecialtiesTitle => 'Aucune spécialité pour l\'instant';

  @override
  String get homeNoSpecialtiesMessage => 'Recherchez plutôt des hôpitaux et des médecins.';

  @override
  String get homeMoreTile => 'Plus';

  @override
  String get homeMoreTileSubtitle => 'Autres spécialités';

  @override
  String get homeTripEyebrow => 'Votre prochain voyage';

  @override
  String get homeTripFallbackTitle => 'Traitement en Inde';

  @override
  String get homeTripDateTbc => 'Date à confirmer';

  @override
  String get homeTripToday => 'Aujourd\'hui';

  @override
  String get homeTripTomorrow => 'Demain';

  @override
  String get homeTripInProgress => 'En cours';

  @override
  String homeTripInDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: 'Dans $days jours', one: 'Dans $days jour');
    return '$_temp0';
  }

  @override
  String homeTripAdmission(String date) {
    return 'Admission le $date';
  }

  @override
  String get homeScreeningEyebrow => 'Pré-évaluation par IA';

  @override
  String get homeMatchesReadyTitle => 'Vos correspondances sont prêtes';

  @override
  String get homeMatchesReadySubtitle => 'Découvrez les hôpitaux et médecins qui vous correspondent';

  @override
  String homeMatchesReadySubtitleSpecialty(String specialty) {
    return '$specialty · voir vos médecins correspondants';
  }

  @override
  String get homeScreeningProcessingTitle => 'Recherche de vos meilleures correspondances';

  @override
  String get homeScreeningProcessingSubtitle => 'Nous analysons vos réponses';

  @override
  String get homeScreeningContinueTitle => 'Poursuivez votre pré-évaluation';

  @override
  String get homeScreeningContinueSubtitle => 'Reprenez là où vous vous étiez arrêté';

  @override
  String homeScreeningContinueSubtitleSpecialty(String specialty) {
    return '$specialty · reprenez là où vous vous étiez arrêté';
  }

  @override
  String get onboardingWelcomeChip => 'Bienvenue';

  @override
  String get onboardingImpactStat => '500 000+';

  @override
  String get onboardingImpactStatCaption => 'Patients soignés';

  @override
  String get onboardingImpactStatFootnote => 'dans nos hôpitaux partenaires';

  @override
  String get onboardingImpactHeadline => 'Des soins de classe mondiale pour 70 % moins cher';

  @override
  String get onboardingBadgeJciDescription => 'Hôpitaux partenaires accrédités par la Joint Commission International';

  @override
  String get onboardingBadgeNabhDescription => 'Hôpitaux partenaires accrédités NABH';

  @override
  String get onboardingBadgeWhoDescription =>
      'Des soins conformes aux recommandations de l\'OMS sur la sécurité des patients';

  @override
  String get onboardingAccreditationsCaption => 'Accréditations détenues par nos hôpitaux partenaires';

  @override
  String get onboardingNextPage => 'Page suivante';

  @override
  String get onboardingTrustTitle => 'Des soins de confiance';

  @override
  String get onboardingTrustDoctorsTitle => 'Médecins anglophones';

  @override
  String get onboardingTrustDoctorsSubtitle => 'Communiquez facilement.';

  @override
  String get onboardingTrustWaitTitle => 'Aucune attente';

  @override
  String get onboardingTrustWaitSubtitle => 'Recevez des soins médicaux rapidement.';

  @override
  String get onboardingTrustCertifiedTitle => 'Certifié Joint Commission';

  @override
  String get onboardingTrustCertifiedSubtitle => 'Établissements partenaires accrédités à l\'international.';

  @override
  String get onboardingTestimonialQuote =>
      '« J\'ai économisé 45 000 \$ sur ma chirurgie cardiaque, avec de meilleurs soins que chez moi. »';

  @override
  String get onboardingTestimonialAuthor => 'Patient venu des États-Unis';

  @override
  String get onboardingTestimonialDisclaimer => 'Exemple illustratif';

  @override
  String get onboardingStepShareTitle => 'Décrivez votre état';

  @override
  String get onboardingStepShareSubtitle => 'Transmettez vos informations médicales en toute sécurité.';

  @override
  String get onboardingStepMatchTitle => 'Trouvez vos correspondances';

  @override
  String get onboardingStepMatchSubtitle => 'Notre IA trouve les meilleurs hôpitaux pour vous.';

  @override
  String get onboardingStepCompareTitle => 'Comparez les coûts';

  @override
  String get onboardingStepCompareSubtitle => 'Des prix transparents pour décider en connaissance de cause.';

  @override
  String get onboardingStepBookTitle => 'Réservez votre traitement';

  @override
  String get onboardingStepBookSubtitle => 'Planifiez votre rendez-vous sans tracas.';

  @override
  String get onboardingSecurityBadge => 'Chiffré et sécurisé';

  @override
  String get onboardingSecurityFooter =>
      'Vos données médicales sont chiffrées et partagées uniquement avec les hôpitaux que vous choisissez';

  @override
  String get onboardingGetStarted => 'Commencer';

  @override
  String get onboardingExploreAsGuest => 'Explorer en invité';

  @override
  String onboardingPageDots(int page, int count) {
    return 'Page $page sur $count';
  }

  @override
  String get messagesTitle => 'Messages';

  @override
  String get messagesContactSupport => 'Contacter l\'assistance';

  @override
  String get messagesEmptyTitle => 'Aucune conversation pour l\'instant';

  @override
  String get messagesEmptyMessage =>
      'Lorsque vous demandez un devis, une discussion avec l\'hôpital et votre coordinateur s\'ouvre ici. Vous pouvez aussi contacter notre équipe d\'assistance à tout moment.';

  @override
  String get messagesNoMessagesYet => 'Aucun message pour l\'instant';

  @override
  String get messagesAttachment => 'Pièce jointe';

  @override
  String messagesPreviewMine(String message) {
    return 'Vous : $message';
  }

  @override
  String messagesPreviewSender(String sender, String message) {
    return '$sender : $message';
  }

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsMarkAllRead => 'Tout marquer lu';

  @override
  String get notificationsEmptyTitle => 'Vous êtes à jour';

  @override
  String get notificationsEmptyMessage =>
      'Les devis, mises à jour de réservation, rappels et messages s\'afficheront ici.';

  @override
  String notificationsBellUnread(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Notifications, $count non lues',
      one: 'Notifications, $count non lue',
    );
    return '$_temp0';
  }

  @override
  String get supportLocationMarked => 'Position marquée. Elle n\'est partagée que si vous envoyez un SOS.';

  @override
  String get supportRealtimeNotifications => 'Notifications en temps réel';

  @override
  String get supportNotificationsEmpty =>
      'Les rappels de rendez-vous et les mises à jour s\'affichent ici en temps réel.';

  @override
  String get supportCallHelpline => 'Appeler l\'assistance 24h/24';

  @override
  String get supportGetTranslator => 'Demander un interprète';

  @override
  String get supportLocalGuide => 'Guide local';

  @override
  String get supportBookFirst =>
      'Réservez d\'abord votre traitement, ou demandez à notre équipe d\'assistance dans Messages.';

  @override
  String get supportTranslatorRequested => 'Interprète demandé. Votre coordinateur vous le confirmera sous peu.';

  @override
  String get supportGuideRequested => 'Guide local demandé. Votre coordinateur vous le confirmera sous peu.';

  @override
  String get supportScheduleTitle => 'Votre programme';

  @override
  String get supportScheduleEmpty => 'Votre hôpital ajoutera vos rendez-vous ici.';

  @override
  String supportScheduleWhen(String weekday, String time) {
    return '$weekday, $time';
  }

  @override
  String get supportTodaysSchedule => 'Programme du jour';

  @override
  String get supportNextOnSchedule => 'Prochain rendez-vous';

  @override
  String get supportNothingToday => 'Rien de prévu aujourd\'hui';

  @override
  String get cultureTipsTitle => 'Conseils culturels';

  @override
  String get cultureTipsEmpty => 'Des conseils apparaîtront bientôt ici.';

  @override
  String get sosButtonSemantics => 'Alerte d\'urgence SOS';

  @override
  String get sosConfirmTitle => 'Envoyer une alerte d\'urgence ?';

  @override
  String get sosConfirmBody =>
      'Votre coordinateur et notre équipe d\'assistance disponible 24h/24 et 7j/7 sont alertés immédiatement.';

  @override
  String get sosMessageLabel => 'Que se passe-t-il ? (facultatif)';

  @override
  String get sosShareLocationTitle => 'Partager ma position actuelle avec l\'équipe d\'assistance';

  @override
  String get sosShareLocationMarkedHint =>
      'Utilisée uniquement pour cette alerte. Si votre téléphone ne parvient pas à vous localiser, le lieu que vous avez marqué sur la carte est partagé à la place.';

  @override
  String get sosShareLocationHint =>
      'Utilisée uniquement pour cette alerte, afin de vous trouver plus vite. Votre téléphone peut vous demander l\'autorisation.';

  @override
  String get sosSendButton => 'Envoyer le SOS';

  @override
  String get sosGettingLocation => 'Localisation en cours…';

  @override
  String get sosSendingAlert => 'Envoi de votre alerte…';

  @override
  String get sosLocationShared => 'Votre position actuelle a été partagée avec l\'équipe.';

  @override
  String sosLocationFallbackMarked(String reason) {
    return '$reason Le lieu que vous avez marqué sur la carte a été partagé à la place.';
  }

  @override
  String sosLocationFallbackNone(String reason) {
    return '$reason Indiquez à l\'équipe où vous êtes lorsqu\'elle vous appellera.';
  }

  @override
  String get sosResultSentTitle => 'L\'aide est en route';

  @override
  String get sosResultSentBody =>
      'Votre coordinateur et notre équipe d\'assistance disponible 24h/24 et 7j/7 ont été alertés et vont vous appeler sous peu.';

  @override
  String get sosResultDangerNote => 'Si votre vie est en danger, appelez les services d\'urgence maintenant.';

  @override
  String get sosResultFailedTitle => 'L\'alerte n\'a pas pu être envoyée';

  @override
  String get sosResultFailedBody => 'Veuillez appeler directement pour obtenir de l\'aide.';

  @override
  String get sosCallHelpline => 'Appeler l\'assistance';

  @override
  String sosCallNumber(String number) {
    return 'Appeler le $number';
  }

  @override
  String get mapLongPressHint => 'Appuyez longuement sur la carte pour indiquer où vous êtes.';

  @override
  String get mapAttribution => 'Contributeurs OpenStreetMap';

  @override
  String get mapZoomIn => 'Zoom avant';

  @override
  String get mapZoomOut => 'Zoom arrière';

  @override
  String get mapShowMyPlaces => 'Afficher mes lieux';

  @override
  String get screeningAppBarTitle => 'Évaluation par IA';

  @override
  String get screeningStartErrorTitle => 'Impossible de démarrer votre évaluation';

  @override
  String get screeningStartPreparing => 'Préparation de votre questionnaire...';

  @override
  String get screeningStartHeading => 'Qu\'est-ce qui vous amène en Inde ?';

  @override
  String get screeningStartSubtitle =>
      'Choisissez le domaine de soins. Quatre courtes étapes nous aident à vous orienter vers les bons médecins.';

  @override
  String get screeningStartNotSure => 'Vous hésitez ?';

  @override
  String get screeningStartNotSureBody => 'Décrivez vos symptômes et nous vous suggérerons une spécialité.';

  @override
  String get screeningResumeTitle => 'Reprendre votre évaluation';

  @override
  String get screeningResumeGeneral => 'Général';

  @override
  String get screeningLoadingAnswers => 'Chargement de vos réponses...';

  @override
  String get screeningAlreadySubmittedAppBar => 'Évaluation';

  @override
  String get screeningResultsReadyTitle => 'Vos résultats sont prêts';

  @override
  String get screeningAlreadySubmittedTitle => 'Cette évaluation a déjà été envoyée';

  @override
  String get screeningResultsReadyMessage =>
      'Les réponses ne peuvent plus être modifiées. Commencez une nouvelle évaluation pour répondre à nouveau.';

  @override
  String get screeningAnalysingMessage => 'Nous analysons vos réponses.';

  @override
  String get screeningViewMatches => 'Voir mes correspondances';

  @override
  String get screeningSeeProgress => 'Voir l\'avancement';

  @override
  String get screeningStartNewButton => 'Commencer une nouvelle évaluation';

  @override
  String get screeningProcessingStepAnalyzing => 'Analyse de votre état';

  @override
  String get screeningProcessingStepMatching => 'Recherche de spécialistes adaptés';

  @override
  String get screeningProcessingStepSavings => 'Calcul des économies';

  @override
  String screeningChecklistRowSemantics(String label, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'done': 'terminé', 'active': 'en cours', 'other': 'en attente'});
    return '$label, $_temp0';
  }

  @override
  String get screeningProcessingHelpTitle => 'Que se passe-t-il ?';

  @override
  String get screeningProcessingHelpBody =>
      'Nous examinons vos réponses (avec l\'IA si vous l\'avez accepté), suggérons la spécialité adaptée et vous mettons en relation avec des hôpitaux et médecins indiens accrédités selon l\'expertise, la langue, le budget et la disponibilité. Cela prend généralement moins d\'une minute. Ce n\'est pas un diagnostic.';

  @override
  String get screeningProcessingReady => 'Vos correspondances sont prêtes !';

  @override
  String get screeningProcessingFinding => 'Recherche de la meilleure correspondance...';

  @override
  String get screeningProcessingTip =>
      'Astuce : vous pouvez comparer jusqu\'à 3 correspondances côte à côte et voir le détail complet des coûts.';

  @override
  String get screeningProcessingFailedTitle => 'Nous n\'avons pas pu terminer l\'analyse';

  @override
  String get screeningProcessingFailedMessage => 'Une erreur s\'est produite lors de l\'analyse de vos réponses.';

  @override
  String get screeningProcessingTimeoutTitle => 'Cela prend plus de temps que d\'habitude';

  @override
  String get screeningProcessingTimeoutMessage =>
      'Nous vous préviendrons dès que vos correspondances seront prêtes. Vous pouvez continuer à attendre ou revenir plus tard.';

  @override
  String get screeningProcessingKeepWaiting => 'Continuer d\'attendre';

  @override
  String get screeningGoHome => 'Aller à l\'accueil';

  @override
  String get screeningNotSubmittedTitle => 'Cette évaluation n\'a pas été envoyée';

  @override
  String get screeningNotSubmittedMessage => 'Terminez le questionnaire pour obtenir vos correspondances.';

  @override
  String get screeningContinueQuestionnaire => 'Reprendre le questionnaire';

  @override
  String get screeningProcessingLostTitle => 'Nous avons perdu la trace de votre évaluation';

  @override
  String get screeningPrevious => 'Précédent';

  @override
  String get screeningHelpTooltip => 'Aide';

  @override
  String get screeningHelpDialogTitle => 'Comment ça marche';

  @override
  String get screeningHelpGotIt => 'J\'ai compris';

  @override
  String get screeningSaveExit => 'Enregistrer et quitter';

  @override
  String get screeningProgressSaved => 'Progression enregistrée. Reprenez à tout moment depuis l\'accueil.';

  @override
  String get screeningValidateBodyArea => 'Touchez le corps pour sélectionner au moins une zone.';

  @override
  String get screeningValidateSymptoms =>
      'Répondez « oui » ou « peut-être » à au moins un symptôme, ou ajoutez le vôtre.';

  @override
  String get screeningValidateDuration => 'Indiquez-nous depuis combien de temps vous avez ce problème.';

  @override
  String get screeningValidateBudget => 'Le budget minimum ne doit pas dépasser le maximum.';

  @override
  String get screeningValidateTravelWindow => 'La période de voyage doit se terminer après son début.';

  @override
  String get screeningStep1Title => 'Où ressentez-vous des troubles ?';

  @override
  String get screeningStep1Subtitle => 'Touchez le corps pour sélectionner la zone.';

  @override
  String screeningStep1SubtitleWithSpecialty(String specialty) {
    return 'Touchez le corps pour sélectionner la zone · $specialty';
  }

  @override
  String get screeningNoAreaSelected => 'Aucune zone sélectionnée';

  @override
  String get screeningStep2Title => 'Quels symptômes ressentez-vous ?';

  @override
  String get screeningStep2Help =>
      'Faites glisser une carte vers la droite (ou touchez la coche) si vous avez le symptôme, vers la gauche (ou X) si vous ne l\'avez pas, et vers le haut (ou -) si vous n\'êtes pas sûr. Ajoutez ci-dessous tout ce que nous n\'avons pas demandé.';

  @override
  String get screeningSymptomsLoading => 'Chargement des suggestions...';

  @override
  String get screeningSymptomsUnavailable =>
      'Les suggestions ne sont pas disponibles. Ajoutez vos symptômes ci-dessous.';

  @override
  String get screeningYourSymptoms => 'Vos symptômes';

  @override
  String get screeningYourSymptomsEmpty =>
      'Les symptômes auxquels vous répondez « oui » ou « peut-être » apparaissent ici.';

  @override
  String screeningSymptomMaybeChip(String name) {
    return '$name (peut-être)';
  }

  @override
  String get screeningAddAnotherSymptom => 'Ajouter un autre symptôme';

  @override
  String screeningSymptomTooLong(int max) {
    return 'Le symptôme doit faire moins de $max caractères.';
  }

  @override
  String screeningSymptomLimit(int max) {
    return 'Vous pouvez ajouter jusqu\'à $max symptômes.';
  }

  @override
  String get screeningStep3Title => 'Depuis combien de temps avez-vous ce problème ?';

  @override
  String get screeningDecrease => 'Diminuer';

  @override
  String get screeningIncrease => 'Augmenter';

  @override
  String get screeningSeverity => 'Gravité';

  @override
  String get screeningDailyImpact => 'Impact au quotidien';

  @override
  String get screeningImpactWork => 'Travail';

  @override
  String get screeningImpactSleep => 'Sommeil';

  @override
  String get screeningImpactMobility => 'Mobilité';

  @override
  String get screeningImpactWorkQuestion => 'Dans quelle mesure cela affecte-t-il votre travail ?';

  @override
  String get screeningImpactSleepQuestion => 'Dans quelle mesure cela affecte-t-il votre sommeil ?';

  @override
  String get screeningImpactMobilityQuestion => 'Dans quelle mesure cela affecte-t-il votre mobilité ?';

  @override
  String screeningSeverityPillSemantics(String dimension, String level) {
    return '$dimension $level';
  }

  @override
  String get screeningPreviousTreatments => 'Traitements antérieurs';

  @override
  String get screeningPreviousReports => 'Rapports antérieurs';

  @override
  String get screeningOptionalParen => '(facultatif)';

  @override
  String get screeningScanUpload => 'Numériser ou importer des rapports médicaux';

  @override
  String get screeningScanUploadHint =>
      'Photographiez les pages papier ou choisissez un PDF · notre IA le lit et vous confirmez les détails';

  @override
  String get screeningAttachWithoutAi => 'Joindre un fichier sans IA (ex. DICOM)';

  @override
  String get screeningNotesLabel => 'Autre chose à nous signaler ? (facultatif)';

  @override
  String screeningRemoveReportTooltip(String name) {
    return 'Retirer $name';
  }

  @override
  String screeningAttachLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Vous pouvez joindre jusqu\'à $count rapports.',
      one: 'Vous pouvez joindre jusqu\'à $count rapport.',
    );
    return '$_temp0';
  }

  @override
  String screeningAttachPagesLimit(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Seules $count pages de rapport peuvent être jointes à une évaluation.',
      one: 'Seule $count page de rapport peut être jointe à une évaluation.',
    );
    return '$_temp0';
  }

  @override
  String get screeningReportDefaultLabel => 'Rapport médical';

  @override
  String screeningReportNumbered(int index) {
    return 'Rapport médical $index';
  }

  @override
  String screeningReportPage(String label, int page) {
    return '$label p.$page';
  }

  @override
  String get screeningReportAiConfirmed => 'Lecture IA confirmée';

  @override
  String get screeningReportAiToReview => 'Lecture IA à vérifier';

  @override
  String get screeningStep4Title => 'Personnalisez vos correspondances';

  @override
  String get screeningFindDoctors => 'Trouver mes médecins';

  @override
  String get screeningSkipDefaults => 'Passer et utiliser les valeurs par défaut';

  @override
  String get screeningLangHindi => 'Hindi';

  @override
  String get screeningLangEnglish => 'Anglais';

  @override
  String get screeningLangArabic => 'Arabe';

  @override
  String get screeningLangSpanish => 'Espagnol';

  @override
  String get screeningLangFrench => 'Français';

  @override
  String get screeningLangRussian => 'Russe';

  @override
  String get screeningPrefDoctorGender => 'Sexe du médecin';

  @override
  String get screeningPrefBudgetRange => 'Fourchette de budget';

  @override
  String get screeningPrefYourBudget => 'Votre budget';

  @override
  String get screeningPrefAnyBudget => 'Tout budget';

  @override
  String get screeningPrefClearBudget => 'Effacer le budget';

  @override
  String get screeningPrefTravelWindow => 'Période de voyage';

  @override
  String screeningPrefTravelFrom(String date) {
    return 'À partir du $date - choisissez une date de fin';
  }

  @override
  String screeningPrefTravelRange(String start, String end) {
    return '$start - $end';
  }

  @override
  String get screeningPrefUseAi => 'Utiliser les recommandations de l\'IA';

  @override
  String get screeningPrefUseAiOn => 'Nécessite votre consentement avant l\'analyse';

  @override
  String get screeningPrefUseAiOff => 'Sélection standard fondée sur des règles';

  @override
  String get consentAiTitle => 'Utiliser les recommandations de l\'IA ?';

  @override
  String get consentAiPointData =>
      'Vos réponses (et les rapports que vous avez joints) sont envoyées à notre service d\'IA pour suggérer des spécialités, des interventions et des questions pertinentes pour votre médecin.';

  @override
  String get consentAiPointNotDiagnosis =>
      'Ceci n\'est pas un diagnostic. Un médecin qualifié de l\'hôpital examine votre dossier avant tout traitement.';

  @override
  String get consentAiPointPrivacy =>
      'Vos données sont utilisées uniquement pour cette évaluation et ne sont jamais vendues. Vous pouvez retirer votre consentement dans votre profil.';

  @override
  String get consentAiPointAlternative =>
      'Vous préférez ne pas l\'utiliser ? Nous vous orienterons alors avec notre moteur standard fondé sur des règles.';

  @override
  String get consentAiAgree => 'J\'accepte, utiliser l\'IA';

  @override
  String get consentAiDecline => 'Utiliser la sélection standard';

  @override
  String get bodyMapHead => 'Tête';

  @override
  String get bodyMapNeck => 'Cou';

  @override
  String get bodyMapChest => 'Poitrine';

  @override
  String get bodyMapAbdomen => 'Abdomen';

  @override
  String get bodyMapPelvis => 'Bassin';

  @override
  String get bodyMapRegionBack => 'Dos';

  @override
  String get bodyMapLeftArm => 'Bras gauche';

  @override
  String get bodyMapRightArm => 'Bras droit';

  @override
  String get bodyMapLeftLeg => 'Jambe gauche';

  @override
  String get bodyMapRightLeg => 'Jambe droite';

  @override
  String get bodyMapSkin => 'Peau';

  @override
  String get bodyMapGeneral => 'Tout le corps / général';

  @override
  String get bodyMapViewFront => 'Face';

  @override
  String get bodyMapViewBack => 'Dos';

  @override
  String get painIntensityTitle => 'Intensité de la douleur';

  @override
  String get painNone => 'Aucune douleur';

  @override
  String get painMild => 'Légère';

  @override
  String get painModerate => 'Modérée';

  @override
  String get painSevere => 'Forte';

  @override
  String get painWorst => 'Pire douleur possible';

  @override
  String painValueLabel(int value, String label) {
    return '$value/10 · $label';
  }

  @override
  String painSemantics(int value, String label) {
    return 'Douleur $value sur 10, $label';
  }

  @override
  String get emergencyTitle => 'Urgence — faites-vous soigner sur place dès maintenant';

  @override
  String get emergencyBody =>
      'Certaines de vos réponses peuvent indiquer une urgence médicale. N\'attendez pas votre voyage. Rendez-vous immédiatement au service d\'urgences le plus proche ou appelez le numéro d\'urgence local.';

  @override
  String get emergencyWarningSigns => 'Signes d\'alerte relevés';

  @override
  String get emergencyNotDiagnosis => 'Cette évaluation n\'est pas un diagnostic.';

  @override
  String emergencyCallButton(String number) {
    return 'Appeler les secours ($number)';
  }

  @override
  String emergencyDialNow(String number) {
    return 'Composez maintenant le $number depuis votre téléphone.';
  }

  @override
  String get emergencyAckViewResults => 'Je comprends - voir mes résultats quand même';

  @override
  String get emergencyAckContinueRisk => 'Je comprends le risque - continuer';

  @override
  String get symptomDeckAllAnswered => 'Toutes les suggestions ont une réponse. Ajoutez autre chose ci-dessous.';

  @override
  String symptomCardSemantics(String name) {
    return '$name. Avez-vous ce symptôme ? Glissez vers la droite pour oui, vers la gauche pour non, vers le haut pour peut-être.';
  }

  @override
  String get symptomSwipeOrTap => 'Glissez ou touchez pour répondre';

  @override
  String symptomAnswerSemantics(String answer) {
    return 'Répondre $answer';
  }

  @override
  String symptomAnswerTooltip(String answer, String name) {
    return '$answer : $name';
  }

  @override
  String get symptomAddTooltip => 'Ajouter le symptôme';

  @override
  String symptomRemoveTooltip(String name) {
    return 'Retirer $name';
  }

  @override
  String get intakeAppliedBodyAreas => 'zones du corps';

  @override
  String get intakeAppliedPainIntensity => 'intensité de la douleur';

  @override
  String get intakeAppliedSymptoms => 'symptômes';

  @override
  String get intakeAppliedDuration => 'durée';

  @override
  String get intakeAppliedDailyImpact => 'impact au quotidien';

  @override
  String get intakeAppliedPreviousTreatments => 'traitements antérieurs';

  @override
  String get intakeAppliedNotes => 'notes';

  @override
  String get intakeListSeparator => ', ';

  @override
  String intakeVoiceAddedOnly(String fields) {
    return 'Ajouté : $fields.';
  }

  @override
  String intakeVoiceUpdatedOnly(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count réponses mises à jour.',
      one: '$count réponse mise à jour.',
    );
    return '$_temp0';
  }

  @override
  String intakeVoiceAddedAndUpdated(String fields, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Ajouté : $fields ; $count réponses mises à jour.',
      one: 'Ajouté : $fields ; $count réponse mise à jour.',
    );
    return '$_temp0';
  }

  @override
  String get intakeVoiceAlreadyMatch => 'Vos réponses correspondent déjà à ce que vous avez dit.';

  @override
  String get intakeConflictPainIntensity => 'Intensité de la douleur';

  @override
  String get intakeConflictHowLong => 'Depuis combien de temps';

  @override
  String intakeConflictDailyImpact(String dimension) {
    return 'Impact au quotidien : $dimension';
  }

  @override
  String intakeDurationValue(int value, String unit) {
    return '$value $unit';
  }

  @override
  String get intakeConflictTitle => 'Certaines réponses diffèrent';

  @override
  String get intakeConflictHint =>
      'Cochez les réponses à remplacer par ce que vous avez dit. Les réponses non cochées restent inchangées.';

  @override
  String intakeConflictCompare(String current, String suggested) {
    return 'Votre réponse : $current\nD\'après votre voix : $suggested';
  }

  @override
  String get intakeMedicalArea => 'Domaine médical';

  @override
  String get intakeSpecialtyOptional => 'Spécialité (facultatif)';

  @override
  String get intakeNotSure => 'Je ne sais pas';

  @override
  String get intakeWhereProblem => 'Où se situe le problème ?';

  @override
  String get intakeAddPain => 'Ajouter l\'intensité de la douleur';

  @override
  String get intakeSymptoms => 'Symptômes';

  @override
  String get intakeAddSymptomHint => 'Ajouter un symptôme';

  @override
  String get intakeHowLong => 'Depuis combien de temps ?';

  @override
  String get intakeDailyImpact => 'Impact au quotidien';

  @override
  String get intakePreviousTreatments => 'Traitements antérieurs';

  @override
  String get intakeNotesLabel => 'Notes';

  @override
  String get intakeNotesHint => 'Autre chose que le médecin devrait savoir';

  @override
  String get voiceIntakeTitle => 'Décrivez-le à voix haute';

  @override
  String get voiceReviewTitle => 'Vérifiez vos réponses';

  @override
  String get voiceIntro =>
      'Dites-nous avec vos mots où vous avez mal, depuis quand, à quel point et ce que vous avez déjà essayé.';

  @override
  String get voiceMicOff =>
      'L\'accès au micro est désactivé. Autorisez-le pour Heal India Global dans les réglages de votre téléphone, ou saisissez votre texte.';

  @override
  String get voiceStartFailed => 'Impossible de démarrer l\'enregistrement. Réessayez ou saisissez votre texte.';

  @override
  String get voiceNothingRecorded => 'Rien n\'a été enregistré. Veuillez réessayer.';

  @override
  String get voiceConsentRequired => 'Veuillez d\'abord accepter le traitement de votre enregistrement.';

  @override
  String get voiceNotUnderstood =>
      'Nous n\'avons pas pu comprendre l\'enregistrement. Réessayez dans un endroit plus calme, ou saisissez votre texte.';

  @override
  String get voiceExtractTooShort => 'Veuillez décrire votre problème en quelques mots.';

  @override
  String get voiceEmergencyAck => 'Je comprends - continuer à vérifier mes réponses';

  @override
  String get voiceStopRecording => 'Arrêter l\'enregistrement';

  @override
  String get voiceRecordAgain => 'Enregistrer à nouveau';

  @override
  String get voiceStartRecording => 'Commencer l\'enregistrement';

  @override
  String voiceRecordedStatus(String duration) {
    return 'Enregistré $duration · touchez pour recommencer';
  }

  @override
  String get voiceTapToStart => 'Touchez pour commencer à parler';

  @override
  String get voiceInputLevel => 'Niveau d\'entrée';

  @override
  String get voiceConsentText =>
      'J\'accepte que mon enregistrement soit transcrit sur les propres serveurs de Heal India Global et que l\'IA le transforme en réponses pour mon évaluation. L\'audio est supprimé après la transcription. Je vérifierai tout avant son utilisation.';

  @override
  String get voiceUseRecording => 'Utiliser cet enregistrement';

  @override
  String get voiceTypeInstead => 'Saisir plutôt';

  @override
  String get voiceTypedHint => 'Décrivez votre problème avec vos mots…';

  @override
  String get voiceFillAnswers => 'Remplir mes réponses';

  @override
  String get voiceSpeakInstead => 'Parler plutôt';

  @override
  String get voiceUploading => 'Envoi de votre enregistrement…';

  @override
  String get voiceReading => 'Lecture de votre description…';

  @override
  String get voiceListening => 'Écoute de votre enregistrement…';

  @override
  String get voiceCheckEveryAnswer => 'Vous vérifierez chaque réponse avant son utilisation.';

  @override
  String get voiceEmergencyBanner =>
      'Certains éléments que vous avez décrits peuvent nécessiter des soins urgents. Veuillez consulter dès maintenant un service d\'urgences local.';

  @override
  String get voiceGuidance => 'Conseils';

  @override
  String get voiceReviewIntro =>
      'Vérifiez ce que nous avons compris. Corrigez ce qui est inexact, puis touchez Confirmer.';

  @override
  String get voiceYourDescription => 'Votre description';

  @override
  String get voiceWhatYouSaid => 'Ce que vous avez dit';

  @override
  String get voiceAiDisclaimer => 'Suggestions générées par l\'IA — pas un diagnostic.';

  @override
  String get voiceDiscard => 'Abandonner';

  @override
  String get searchHint => 'Rechercher hôpitaux, médecins, traitements';

  @override
  String get searchClearTooltip => 'Effacer la recherche';

  @override
  String get searchFiltersTooltip => 'Filtres';

  @override
  String get searchTabHospitals => 'Hôpitaux';

  @override
  String get searchTabDoctors => 'Médecins';

  @override
  String get searchTabProcedures => 'Interventions';

  @override
  String get searchEmptyTryDifferent => 'Essayez une autre recherche ou effacez vos filtres.';

  @override
  String get searchEmptyCheckBack => 'Revenez bientôt : de nouveaux partenaires sont ajoutés régulièrement.';

  @override
  String get searchClearFilters => 'Effacer les filtres';

  @override
  String get searchNoHospitalsFound => 'Aucun hôpital trouvé';

  @override
  String get searchNoDoctorsFound => 'Aucun médecin trouvé';

  @override
  String get searchNoProceduresFound => 'Aucune intervention trouvée';

  @override
  String searchGenderDoctorsChip(String gender, String label) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'female': 'Médecins femmes',
      'male': 'Médecins hommes',
      'other': 'Médecins ($label)',
    });
    return '$_temp0';
  }

  @override
  String searchResultCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count résultats', one: '$count résultat');
    return '$_temp0';
  }

  @override
  String get filtersTitle => 'Filtres';

  @override
  String get filtersSpecialtyLabel => 'Spécialité';

  @override
  String get filtersAnySpecialty => 'Toutes spécialités';

  @override
  String get filtersCityLabel => 'Ville';

  @override
  String get filtersCityHint => 'ex. New Delhi, Chennai';

  @override
  String get filtersAccreditationLabel => 'Accréditation (hôpitaux)';

  @override
  String get filtersLanguageLabel => 'Langue parlée';

  @override
  String get filtersDoctorGenderLabel => 'Sexe du médecin';

  @override
  String get filtersSortLabel => 'Trier les hôpitaux par';

  @override
  String get filtersShowResults => 'Afficher les résultats';

  @override
  String get filtersSortTopRated => 'Mieux notés';

  @override
  String get filtersSortLowestPrice => 'Prix le plus bas';

  @override
  String get filtersSortName => 'Nom (A-Z)';

  @override
  String get filtersLanguageEnglish => 'Anglais';

  @override
  String get filtersLanguageHindi => 'Hindi';

  @override
  String get filtersLanguageArabic => 'Arabe';

  @override
  String get filtersLanguageFrench => 'Français';

  @override
  String get filtersLanguageRussian => 'Russe';

  @override
  String get filtersLanguageBengali => 'Bengali';

  @override
  String get filtersLanguageSwahili => 'Swahili';

  @override
  String get filtersLanguageSpanish => 'Espagnol';

  @override
  String catalogApproxPriceTooltip(String amount) {
    return 'Estimation à partir de $amount au taux du jour';
  }

  @override
  String get catalogInternationalDesk => 'Accueil international';

  @override
  String get catalogInternationalPatientDesk => 'Service patients internationaux';

  @override
  String get catalogPriceFromPrefix => 'À partir de ';

  @override
  String catalogSuccessBadge(int pct) {
    return '$pct % de réussite';
  }

  @override
  String get catalogVideoConsult => 'Consultation vidéo';

  @override
  String catalogDaysInHospital(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count jours à l\'hôpital',
      one: '$count jour à l\'hôpital',
    );
    return '$_temp0';
  }

  @override
  String catalogPercent(int value) {
    return '$value %';
  }

  @override
  String get catalogAboutSection => 'À propos';

  @override
  String get catalogLanguagesSpoken => 'Langues parlées';

  @override
  String get catalogTreatmentsPrices => 'Traitements et prix';

  @override
  String get catalogShowLess => 'Afficher moins';

  @override
  String get catalogReadMore => 'Lire la suite';

  @override
  String catalogCouldNotOpen(String target) {
    return 'Impossible d\'ouvrir $target';
  }

  @override
  String get catalogGetMatched => 'Être orienté';

  @override
  String get hospitalDetailNotFound => 'Hôpital introuvable';

  @override
  String get hospitalDetailEstablished => 'Fondé en';

  @override
  String get hospitalDetailBeds => 'Lits';

  @override
  String hospitalDetailDistanceKm(String distance) {
    return '$distance km';
  }

  @override
  String get hospitalDetailFromAirport => 'De l\'aéroport';

  @override
  String get hospitalDetailTreatmentsFrom => 'Traitements à partir de ';

  @override
  String get hospitalDetailSpecialties => 'Spécialités';

  @override
  String get hospitalDetailPricesIndicative =>
      'Les prix sont indicatifs. Votre devis final est établi par l\'hôpital après l\'examen de votre dossier.';

  @override
  String get hospitalDetailDoctors => 'Médecins';

  @override
  String get hospitalDetailPatientReviews => 'Avis des patients';

  @override
  String get hospitalDetailContact => 'Contact';

  @override
  String get hospitalDetailContactViaCoordinator =>
      'Contactez l\'hôpital par l\'intermédiaire de votre coordinateur Heal India Global après avoir demandé un devis.';

  @override
  String get doctorDetailTitle => 'Profil du médecin';

  @override
  String doctorDetailExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ans', one: '$count an');
    return '$_temp0';
  }

  @override
  String get doctorDetailExperience => 'Expérience';

  @override
  String get doctorDetailSuccessRate => 'Taux de réussite';

  @override
  String doctorDetailReviewCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count avis', one: '$count avis');
    return '$_temp0';
  }

  @override
  String get doctorDetailVideoConsultAvailable => 'Consultation vidéo disponible';

  @override
  String get doctorDetailConsultationFee => 'Tarif de consultation';

  @override
  String get doctorDetailQualifications => 'Diplômes';

  @override
  String get doctorDetailExpertise => 'Domaines d\'expertise';

  @override
  String get availabilitySection => 'Disponibilités';

  @override
  String get availabilityNext30Days => 'Disponibilités (30 prochains jours)';

  @override
  String get availabilityNoSlots =>
      'Aucun créneau publié pour l\'instant : demandez un devis et l\'hôpital vous proposera des dates.';

  @override
  String availabilityNextAvailable(String date) {
    return 'Prochaine disponibilité : $date';
  }

  @override
  String availabilityDayAvailable(String day) {
    return '$day : disponible';
  }

  @override
  String availabilityDayUnavailable(String day) {
    return '$day : indisponible';
  }

  @override
  String procedureDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count jours', one: '$count jour');
    return '$_temp0';
  }

  @override
  String get procedureInHospital => 'À l\'hôpital';

  @override
  String get procedureRecovery => 'Convalescence';

  @override
  String get procedureTotalStayInIndia => 'Séjour total en Inde';

  @override
  String procedureTypicalCostIn(String country) {
    return 'Coût habituel ($country)';
  }

  @override
  String procedureWaitTime(String time) {
    return 'Délai d\'attente : $time';
  }

  @override
  String get procedureCompareCosts => 'Comparer les coûts';

  @override
  String get quoteRequestButton => 'Demander un devis';

  @override
  String get quoteRequestedSnack => 'Devis demandé. L\'hôpital répond généralement sous 48 heures.';

  @override
  String get quoteSheetTitle => 'Demander un devis';

  @override
  String get quoteTreatmentLabel => 'Traitement (facultatif)';

  @override
  String get quoteTreatmentNotSure => 'Je ne sais pas encore';

  @override
  String get quoteNotesLabel => 'Décrivez votre état de santé à l\'hôpital';

  @override
  String get quoteNotesHint => 'Diagnostic, traitement actuel, dates de voyage souhaitées...';

  @override
  String quoteConsent(String hospital) {
    return 'J\'accepte de partager mon profil, mes notes médicales et mes documents avec $hospital afin qu\'il puisse préparer un devis.';
  }

  @override
  String get quoteSendRequest => 'Envoyer la demande';

  @override
  String get savedRemovedSnack => 'Retiré des favoris';

  @override
  String get savedAddedSnack => 'Ajouté à votre liste';

  @override
  String get savedGuestPrompt => 'Créez un compte gratuit pour enregistrer des hôpitaux et des médecins.';

  @override
  String get savedSignUpAction => 'S\'inscrire';

  @override
  String get savedRemoveTooltip => 'Retirer des favoris';

  @override
  String get matchSortBestMatch => 'Meilleure correspondance';

  @override
  String get matchSortLowestCost => 'Coût le plus bas';

  @override
  String get matchSortHighestRating => 'Meilleure note';

  @override
  String get matchSortMostExperience => 'Plus d\'expérience';

  @override
  String get matchSortBy => 'Trier par';

  @override
  String get matchFilterTitle => 'Filtrer';

  @override
  String get matchFilterJciOnly => 'Hôpitaux accrédités JCI uniquement';

  @override
  String get matchFilterVideoConsult => 'Propose la consultation vidéo';

  @override
  String get matchFilterSpeaks => 'Parle';

  @override
  String get matchCardEstimatedTotalCost => 'Coût total estimé';

  @override
  String matchCardSaveVsHome(int min, int max) {
    return 'Économisez $min-$max % par rapport à chez vous';
  }

  @override
  String get matchCardAdded => 'Ajouté';

  @override
  String get matchCardCompare => 'Comparer';

  @override
  String get matchCardViewDetails => 'Voir les détails';

  @override
  String get matchDetailWhyThisMatch => 'Pourquoi cette correspondance';

  @override
  String get matchDetailEstimatedCost => 'Coût estimé';

  @override
  String matchDetailInCountry(String country) {
    return '$country : ';
  }

  @override
  String matchDetailSavePct(int min, int max) {
    return 'Économisez $min-$max %';
  }

  @override
  String get matchDetailFinalPriceNote =>
      'Le prix final figure dans le devis de l\'hôpital, établi après l\'examen de votre dossier.';

  @override
  String get matchDetailSeeFullComparison => 'Voir la comparaison complète des coûts';

  @override
  String get matchDetailSuggestedPackage => 'Forfait suggéré';

  @override
  String get matchDetailCompareCosts => 'Comparer les coûts';

  @override
  String get matchDetailProceduresPackages => 'Interventions et forfaits';

  @override
  String get compareTitleShort => 'Comparer';

  @override
  String get compareTitle => 'Comparer les correspondances';

  @override
  String get compareNothingTitle => 'Rien à comparer';

  @override
  String get compareNothingMessage =>
      'Sélectionnez 2 ou 3 correspondances dans vos résultats pour les comparer côte à côte.';

  @override
  String get compareStartScreening => 'Commencer une évaluation';

  @override
  String get compareNoLongerAvailable => 'Ces correspondances ne sont plus disponibles';

  @override
  String get compareBackToMatches => 'Retour aux correspondances';

  @override
  String get compareRowMatch => 'Correspondance';

  @override
  String compareExperienceYears(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ans', one: '$count an');
    return '$_temp0';
  }

  @override
  String get compareRowRating => 'Note';

  @override
  String get compareRowHospital => 'Hôpital';

  @override
  String get compareRowAccreditation => 'Accréditation';

  @override
  String get compareRowLanguages => 'Langues';

  @override
  String get compareRowEstCost => 'Coût estimé';

  @override
  String get compareLowest => 'Le plus bas';

  @override
  String get compareRowSavings => 'Économies';

  @override
  String comparePercentRange(int min, int max) {
    return '$min-$max %';
  }

  @override
  String get compareRowPackage => 'Forfait';

  @override
  String get compareRowWhy => 'Pourquoi';

  @override
  String get compareBook => 'Réserver';

  @override
  String get compareDetails => 'Détails';

  @override
  String consultationRequestSentSnack(String caseNumber, String hospital) {
    return 'Demande $caseNumber envoyée à $hospital.';
  }

  @override
  String get consultationConsentRequired => 'Veuillez accepter de partager vos informations avec l\'hôpital.';

  @override
  String get consultationGuestUpgrade =>
      'Créez un compte gratuit pour envoyer des demandes aux hôpitaux. Vos réponses à l\'évaluation sont conservées.';

  @override
  String get consultationBookTitle => 'Réserver une consultation';

  @override
  String get consultationMessageLabel => 'Message à l\'hôpital (facultatif)';

  @override
  String get consultationMessageHint => 'Dates souhaitées, questions, accompagnants qui voyagent avec vous...';

  @override
  String consultationConsent(String hospital) {
    return 'J\'accepte de partager mes réponses à l\'évaluation, mes comptes rendus et mes informations médicales avec $hospital afin qu\'il puisse examiner mon dossier et préparer un devis.';
  }

  @override
  String get consultationCreateAccount => 'Créer un compte gratuit';

  @override
  String get consultationPayAfterAccept =>
      'L\'hôpital répond avec un devis personnalisé. Vous ne payez qu\'après l\'avoir accepté.';

  @override
  String get costTitle => 'Comparaison des traitements';

  @override
  String get costFindHospitals => 'Trouver des hôpitaux';

  @override
  String get costChangeCountryTooltip => 'Changer de pays de résidence';

  @override
  String costCompareWith(String country) {
    return 'Comparer avec : $country';
  }

  @override
  String costTreatmentIn(String country) {
    return 'Traitement : $country';
  }

  @override
  String get costTreatmentInIndia => 'Traitement en Inde';

  @override
  String get costRowCost => 'Coût';

  @override
  String get costRowWaitTime => 'Délai d\'attente';

  @override
  String get costVaries => 'Variable';

  @override
  String get costRowInsurance => 'Couverture d\'assurance';

  @override
  String get costVariesByPlan => 'Selon le contrat';

  @override
  String get costIndiaDefaultWait => '1 à 2 semaines';

  @override
  String costSavingsValue(String amount, int min, int max) {
    return '$amount ($min-$max %)';
  }

  @override
  String get costItemizedTitle => 'Détail des coûts';

  @override
  String get costDisclaimer =>
      'Estimations fournies à titre de comparaison uniquement. Votre prix final figure dans le devis personnalisé de l\'hôpital. Les montants indiqués pour votre pays sont des fourchettes publiées habituelles et varient selon le prestataire et l\'assurance.';

  @override
  String get costBreakdownInQuote => 'Le devis de l\'hôpital comprend le détail des coûts.';

  @override
  String costTypicalIn(String country) {
    return 'Habituel ($country)';
  }

  @override
  String get costChooseTreatment => 'Choisissez un traitement';

  @override
  String get costChooseTreatmentSubtitle => 'Comparez son coût dans votre pays et en Inde.';

  @override
  String get costSearchTreatments => 'Rechercher des traitements';

  @override
  String get costNoTreatmentsFound => 'Aucun traitement trouvé';

  @override
  String get costCategorySurgery => 'Chirurgie';

  @override
  String get costCategoryHospital => 'Hôpital';

  @override
  String get costCategoryMedications => 'Médicaments';

  @override
  String get costCategoryTestsScans => 'Analyses et imagerie';

  @override
  String get costCategoryDoctorFees => 'Honoraires médicaux';

  @override
  String get costCategoryImplants => 'Implants';

  @override
  String get costCategoryOther => 'Autres';

  @override
  String get costCategorySurgeryHint =>
      'Honoraires du chirurgien et de l\'anesthésie, bloc opératoire et consommables.';

  @override
  String get costCategoryHospitalHint => 'Chambre, soins infirmiers, repas et soins intensifs si nécessaire.';

  @override
  String get costCategoryMedicationsHint => 'Médicaments pendant votre séjour et à la sortie.';

  @override
  String get costCategoryTestsScansHint => 'Examens préopératoires, imagerie et analyses de laboratoire.';

  @override
  String get costCategoryDoctorFeesHint => 'Consultations et visites de suivi.';

  @override
  String get costCategoryImplantsHint => 'Implants, stents ou prothèses si nécessaire.';

  @override
  String get costCategoryOtherHint => 'Autres frais inclus dans l\'estimation.';

  @override
  String get costCountryUs => 'États-Unis';

  @override
  String get costCountryGb => 'Royaume-Uni';

  @override
  String get costCountryCa => 'Canada';

  @override
  String get costCountryAu => 'Australie';

  @override
  String get costCountryNz => 'Nouvelle-Zélande';

  @override
  String get costCountryAe => 'Émirats arabes unis';

  @override
  String get costCountrySa => 'Arabie saoudite';

  @override
  String get costCountryOm => 'Oman';

  @override
  String get costCountryQa => 'Qatar';

  @override
  String get costCountryKw => 'Koweït';

  @override
  String get costCountryBh => 'Bahreïn';

  @override
  String get costCountryIq => 'Irak';

  @override
  String get costCountryNg => 'Nigeria';

  @override
  String get costCountryKe => 'Kenya';

  @override
  String get costCountryTz => 'Tanzanie';

  @override
  String get costCountryEt => 'Éthiopie';

  @override
  String get costCountryBd => 'Bangladesh';

  @override
  String get costCountryNp => 'Népal';

  @override
  String get costCountryLk => 'Sri Lanka';

  @override
  String get costCountryAf => 'Afghanistan';

  @override
  String get costCountryUz => 'Ouzbékistan';

  @override
  String get costCountryDe => 'Allemagne';

  @override
  String get costCountryFr => 'France';

  @override
  String get costCountryEs => 'Espagne';

  @override
  String get costCountryIt => 'Italie';

  @override
  String get costCountryRu => 'Russie';

  @override
  String get costCountryIn => 'Inde';

  @override
  String get costCountryYours => 'votre pays';

  @override
  String get paymentDueDeposit => 'Acompte à régler maintenant';

  @override
  String get paymentDueBalance => 'Solde à régler maintenant';

  @override
  String get paymentDueNow => 'À régler maintenant';

  @override
  String get paymentDueInstallment => 'Échéance à régler maintenant';

  @override
  String paymentDueInstallmentSeq(int seq) {
    return 'Échéance $seq à régler maintenant';
  }

  @override
  String bookingStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count jours', one: '$count jour');
    return '$_temp0';
  }

  @override
  String bookingStayDaysRange(int min, int max) {
    return '$min-$max jours';
  }

  @override
  String get paymentTitle => 'Paiement';

  @override
  String get paymentSecureTitle => 'Paiement sécurisé';

  @override
  String get paymentSecureBody =>
      'Paiement chiffré par notre partenaire de paiement. Les données de votre carte n\'atteignent jamais nos serveurs.';

  @override
  String get paymentMethodSection => 'Mode de paiement';

  @override
  String get paymentMethodCard => 'Carte de crédit/débit';

  @override
  String get paymentMethodCardAppOnly => 'Disponible dans l\'application Android et iOS';

  @override
  String get bankTransferTitle => 'Virement bancaire';

  @override
  String get bankSwiftDetails => 'Coordonnées SWIFT';

  @override
  String get paymentTestTitle => 'Paiement de test';

  @override
  String get paymentTestSubtitle => 'Passerelle de développement - aucun argent réel n\'est débité';

  @override
  String get paymentPlansTitle => 'Plans de paiement';

  @override
  String paymentPlansOnBooking(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count mensualités pour cette réservation',
      one: '$count mensualité pour cette réservation',
    );
    return '$_temp0';
  }

  @override
  String get paymentPlansChosenWhenBooking => '3, 6 ou 12 mois - choisi lors de la réservation';

  @override
  String get paymentInsurance => 'Assurance';

  @override
  String get bookingInsuranceClaim => 'Je veux faire jouer mon assurance';

  @override
  String get paymentInsuranceRequestedHelp =>
      'Demande enregistrée. Téléversez votre police et vos formulaires de demande pour que notre équipe puisse vous aider.';

  @override
  String get paymentInsuranceChosenWhenBooking =>
      'Choisi lors de la réservation. Demandez à votre coordinateur si vous souhaitez ajouter une demande.';

  @override
  String get paymentUploadInsuranceDocs => 'Téléverser les documents d\'assurance';

  @override
  String get paymentPriceSummary => 'Récapitulatif du prix';

  @override
  String paymentChargedInCurrency(String currency) {
    return 'Vous serez débité en $currency au taux de change fixé lors de la création de la commande.';
  }

  @override
  String paymentPlansCurrentOption(String option) {
    return 'Cette réservation utilise « $option ». Les plans mensuels sur 3, 6 ou 12 mois se choisissent lors de la réservation. Pour changer, contactez votre coordinateur avant votre premier paiement.';
  }

  @override
  String get paymentScheduleBeingPrepared => 'Votre échéancier est en cours de préparation.';

  @override
  String get paymentDueDatePending => 'Date d\'échéance à venir';

  @override
  String paymentDueOn(String date) {
    return 'Échéance le $date';
  }

  @override
  String get paymentCardAppOnlySnack =>
      'Le paiement par carte est disponible dans l\'application Android et iOS. Utilisez ici le virement bancaire.';

  @override
  String paymentConfirmReason(String amount) {
    return 'Confirmer le paiement de $amount';
  }

  @override
  String get paymentNotConfirmed => 'Paiement non confirmé.';

  @override
  String get paymentMethodNotAvailable => 'Ce mode de paiement n\'est pas disponible dans l\'application.';

  @override
  String get paymentCardCheckoutFailed => 'Impossible de lancer le paiement par carte. Veuillez réessayer.';

  @override
  String paymentWalletPending(String wallet) {
    return 'Finalisez le paiement dans $wallet. Nous confirmerons votre réservation dès sa réception.';
  }

  @override
  String get paymentTestDialogBody => 'Simuler le résultat de la passerelle pour cette commande de test.';

  @override
  String get paymentSimulateFailure => 'Simuler un échec';

  @override
  String get paymentSimulateSuccess => 'Simuler un succès';

  @override
  String get paymentGetBankDetails => 'Obtenir les coordonnées bancaires';

  @override
  String get paymentPayButton => 'Payer';

  @override
  String get bookingTreatmentFallback => 'Traitement';

  @override
  String bookingAdmissionDate(String date) {
    return 'Admission le $date';
  }

  @override
  String get paymentSubtotal => 'Sous-total';

  @override
  String get paymentDiscount => 'Remise';

  @override
  String get paymentServiceFee => 'Frais de service';

  @override
  String get paymentTaxes => 'Taxes';

  @override
  String get paymentTotal => 'Total';

  @override
  String get paymentPaidSoFar => 'Déjà payé';

  @override
  String get paymentBalance => 'Solde';

  @override
  String paymentInstallmentDueOn(int seq, String date) {
    return 'Échéance $seq le $date';
  }

  @override
  String get paymentBookingCancelledTitle => 'Cette réservation a été annulée';

  @override
  String get paymentNothingDueTitle => 'Rien à payer pour le moment';

  @override
  String get paymentRefundOriginalMethod =>
      'Les remboursements éventuels sont versés sur le moyen de paiement d\'origine.';

  @override
  String paymentNothingDueBody(String number) {
    return 'Aucun paiement n\'est dû pour la réservation $number. Nous vous préviendrons à la prochaine échéance.';
  }

  @override
  String get paymentGoToTrip => 'Voir mon voyage';

  @override
  String get paymentResultSuccessTitle => 'Paiement réussi';

  @override
  String get paymentResultPendingTitle => 'Paiement envoyé';

  @override
  String get paymentResultFailureTitle => 'Échec du paiement';

  @override
  String paymentResultSuccessBody(String number) {
    return 'Votre réservation $number est à jour. Nous avons prévenu votre coordinateur.';
  }

  @override
  String get paymentResultPendingBody =>
      'Nous confirmerons votre réservation dès que le paiement sera vérifié. Vous recevrez une notification.';

  @override
  String get paymentResultFailureBody =>
      'Aucun montant n\'a été débité. Veuillez réessayer ou choisir un autre mode de paiement.';

  @override
  String get paymentResultAmount => 'Montant';

  @override
  String get paymentResultOrder => 'Commande';

  @override
  String get bookingLabel => 'Réservation';

  @override
  String get paymentResultPaidOn => 'Payé le';

  @override
  String get paymentResultStatus => 'Statut';

  @override
  String get paymentDownloadReceipt => 'Télécharger le reçu';

  @override
  String get paymentGetHelp => 'Obtenir de l\'aide';

  @override
  String get caseViewCase => 'Voir le dossier';

  @override
  String get paymentReceiptPreparing => 'Votre reçu est en cours de préparation. Il apparaîtra bientôt dans Documents.';

  @override
  String get paymentReceiptSaved => 'Reçu enregistré';

  @override
  String get bankTransferUnavailableTitle => 'Le virement bancaire n\'est pas disponible';

  @override
  String get bankTransferUnavailableBody => 'Veuillez choisir un autre mode de paiement.';

  @override
  String get bankTransferAmount => 'Montant à virer';

  @override
  String bankTransferOrder(String number) {
    return 'Commande $number';
  }

  @override
  String get bankBeneficiary => 'Bénéficiaire';

  @override
  String get bankName => 'Banque';

  @override
  String get bankAccountNumber => 'Numéro de compte';

  @override
  String get bankPaymentReference => 'Référence de paiement';

  @override
  String get bankTransferInstructions =>
      'Indiquez exactement la référence de paiement pour que nous puissions identifier votre virement. Les virements internationaux prennent généralement 1 à 3 jours ouvrés ; votre réservation est confirmée dès que notre service financier a vérifié la réception des fonds.';

  @override
  String get bankProofSection => 'Justificatif de virement';

  @override
  String get bankProofReplace => 'Remplacer';

  @override
  String get bankProofUpload => 'Téléverser le reçu de virement';

  @override
  String get bankReferenceLabel => 'Référence de la transaction bancaire (UTR / MT103)';

  @override
  String get bankReferenceRequired => 'Saisissez la référence fournie par votre banque';

  @override
  String get bankSubmitProof => 'Envoyer le justificatif';

  @override
  String get bankUploadLater => 'J\'enverrai le justificatif plus tard';

  @override
  String get bankProofReceived =>
      'Merci ! Nous avons bien reçu les détails de votre virement. Votre réservation sera confirmée à réception des fonds (généralement sous 1 à 3 jours ouvrés).';

  @override
  String bankCopyTooltip(String label) {
    return 'Copier $label';
  }

  @override
  String bankCopied(String label) {
    return 'Copié : $label';
  }

  @override
  String get paymentResponseIncomplete => 'La réponse du paiement est incomplète. Veuillez contacter l\'assistance.';

  @override
  String get paymentCancelled => 'Paiement annulé.';

  @override
  String get paymentNotCompleted => 'Le paiement n\'a pas pu aboutir.';

  @override
  String get paymentWalletFallback => 'le portefeuille';

  @override
  String get paymentCardsUnavailableOnDevice => 'Le paiement par carte n\'est pas disponible sur cet appareil.';

  @override
  String get bookSelectDatesTitle => 'Choisir les dates';

  @override
  String bookCaseClosedTitle(String status) {
    return 'Ce dossier est : $status';
  }

  @override
  String get bookCaseClosedBody => 'Ouvrez une nouvelle demande pour réserver un traitement.';

  @override
  String get bookProceedToPayment => 'Passer au paiement';

  @override
  String get bookTreatmentDurationLabel => 'Durée du traitement : ';

  @override
  String get bookDurationConfirmedByHospital => 'confirmée par l\'hôpital';

  @override
  String bookDurationRequired(String duration) {
    return '$duration nécessaires';
  }

  @override
  String bookAdmissionOn(String date) {
    return 'Admission le $date';
  }

  @override
  String get bookSelectPackage => 'Choisir une formule';

  @override
  String get bookAcceptedQuote => 'Devis de l\'hôpital accepté';

  @override
  String bookingStayDaysLabel(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'séjour de $days jours',
      one: 'séjour de $days jour',
    );
    return '$_temp0';
  }

  @override
  String bookingValidUntil(String date) {
    return 'valable jusqu\'au $date';
  }

  @override
  String bookItemizedCharges(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count postes détaillés',
      one: '$count poste détaillé',
    );
    return '$_temp0';
  }

  @override
  String get bookNoPackages =>
      'Cet hôpital n\'a pas encore publié de formules pour ce traitement. Demandez un devis personnalisé depuis la page de votre dossier.';

  @override
  String get bookPaymentOptionSection => 'Option de paiement';

  @override
  String get bookInsuranceHelp => 'Notre équipe vous aidera pour les démarches de remboursement.';

  @override
  String get bookLegendAvailable => 'Disponible';

  @override
  String get bookLegendSelected => 'Sélectionné';

  @override
  String get bookLegendUnavailable => 'Indisponible';

  @override
  String get bookLegendPast => 'Passé';

  @override
  String get bookPackageMedicalOnly => 'Formule de traitement de base';

  @override
  String get bookPackageMedicalStay => 'Traitement + hébergement';

  @override
  String get bookPackageAllInclusive => 'Traitement, séjour, transferts et interprète';

  @override
  String bookInstallmentPerMonth(String amount) {
    return '≈ $amount / mois hors frais';
  }

  @override
  String get bookingPayInFull => 'Payer en totalité';

  @override
  String get bookPayInFullSubtitle => 'Un seul paiement pour tout le traitement';

  @override
  String get bookPayDeposit => 'Verser un acompte maintenant';

  @override
  String get bookPayDepositSubtitle => 'Réservez votre date ; le solde est dû avant l\'admission';

  @override
  String get bookMonthlyInstallments => 'Mensualités';

  @override
  String get bookInstallmentChoices => '3, 6 ou 12 mois';

  @override
  String bookMonths(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count mois', one: '$count mois');
    return '$_temp0';
  }

  @override
  String get bookSavePrefix => 'Économisez ';

  @override
  String get bookExistingBookingBody =>
      'Ce dossier a déjà une réservation. Poursuivez-la, ou annulez-la depuis la page du dossier pour choisir de nouvelles dates.';

  @override
  String get bookContinueToPayment => 'Continuer vers le paiement';

  @override
  String get bookCalendarPreviousMonth => 'Mois précédent';

  @override
  String get bookCalendarNextMonth => 'Mois suivant';

  @override
  String bookCalendarDaySemantics(String date, String state) {
    String _temp0 = intl.Intl.selectLogic(state, {
      'selected': 'sélectionné',
      'available': 'disponible',
      'other': 'indisponible',
    });
    return '$date, $_temp0';
  }

  @override
  String get bookDoctorHideDetails => 'Masquer les détails du médecin';

  @override
  String get bookDoctorShowDetails => 'Afficher les détails du médecin';

  @override
  String bookDoctorExperience(int years) {
    String _temp0 = intl.Intl.pluralLogic(
      years,
      locale: localeName,
      other: '$years ans d\'expérience',
      one: '$years an d\'expérience',
    );
    return '$_temp0';
  }

  @override
  String bookDoctorSpeaks(String languages) {
    return 'Langues : $languages';
  }

  @override
  String get bookProfessionCardiologist => 'Cardiologue';

  @override
  String get bookProfessionOrthopedicSurgeon => 'Chirurgien orthopédiste';

  @override
  String get bookProfessionOncologist => 'Oncologue';

  @override
  String get bookProfessionNeurologist => 'Neurologue';

  @override
  String get bookProfessionDentist => 'Dentiste';

  @override
  String get bookProfessionUrologist => 'Urologue';

  @override
  String get bookProfessionNephrologist => 'Néphrologue';

  @override
  String get bookProfessionGastroenterologist => 'Gastro-entérologue';

  @override
  String get bookProfessionOphthalmologist => 'Ophtalmologue';

  @override
  String get bookProfessionDermatologist => 'Dermatologue';

  @override
  String get casesTitle => 'Mes dossiers';

  @override
  String get caseFilterAll => 'Tous';

  @override
  String get casesEmptyTitle => 'Aucun dossier pour l\'instant';

  @override
  String casesEmptyFilteredTitle(String status) {
    return 'Aucun dossier « $status »';
  }

  @override
  String get casesEmptyBody => 'Demandez un devis à un hôpital correspondant pour ouvrir un dossier.';

  @override
  String get caseFindMyTreatment => 'Trouver mon traitement';

  @override
  String casesShowingCount(int shown, int total) {
    return '$shown sur $total affichés. Utilisez les filtres pour affiner la liste.';
  }

  @override
  String get caseTitleFallback => 'Dossier';

  @override
  String get caseMessageTooltip => 'Envoyer un message sur ce dossier';

  @override
  String get caseQuotesSection => 'Devis';

  @override
  String get caseQuotePending =>
      'L\'hôpital examine votre dossier. Vous serez prévenu à l\'arrivée du devis détaillé (généralement sous 48 heures).';

  @override
  String get caseNoQuotes => 'Aucun devis pour ce dossier.';

  @override
  String get caseBookPackageInstead => 'Réserver plutôt une formule à prix fixe';

  @override
  String get caseMedicalSummary => 'Résumé médical';

  @override
  String get caseYourNotes => 'Vos notes';

  @override
  String get documentsTitle => 'Documents';

  @override
  String get caseDocumentsManage => 'Gérer';

  @override
  String get caseDocumentsEmpty =>
      'Téléversez vos comptes rendus, examens d\'imagerie et votre passeport pour que l\'hôpital puisse se préparer.';

  @override
  String get caseStatusTimeline => 'Historique du statut';

  @override
  String get caseMessageCareTeam => 'Écrire à l\'équipe de soins';

  @override
  String get caseCancelThisCase => 'Annuler ce dossier';

  @override
  String caseCoordinator(String name) {
    return 'Coordinateur : $name';
  }

  @override
  String caseAgent(String name) {
    return 'Agent : $name';
  }

  @override
  String caseOpenedOn(String date) {
    return 'Ouvert le $date';
  }

  @override
  String get caseBookingPackage => 'Formule';

  @override
  String get caseBookingAdmission => 'Admission';

  @override
  String get caseBookingDuration => 'Durée';

  @override
  String caseDurationDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days jours', one: '$days jour');
    return '$_temp0';
  }

  @override
  String get caseBookingPaymentPlan => 'Plan de paiement';

  @override
  String get caseBookingPaid => 'Payé';

  @override
  String get caseClaimRequested => 'Demande effectuée';

  @override
  String get casePayToConfirm => 'Payer pour confirmer';

  @override
  String get casePayBalance => 'Payer le solde';

  @override
  String get travelVisaAndTravel => 'Visa et voyage';

  @override
  String get caseCancelBooking => 'Annuler la réservation';

  @override
  String get caseDepositPlusBalance => 'Acompte + solde';

  @override
  String caseMonthlyInstallments(int months) {
    String _temp0 = intl.Intl.pluralLogic(
      months,
      locale: localeName,
      other: '$months mensualités',
      one: '$months mensualité',
    );
    return '$_temp0';
  }

  @override
  String get caseMonthlyInstallmentsNoCount => 'mensualités';

  @override
  String get caseAcceptQuoteTitle => 'Accepter ce devis ?';

  @override
  String get caseAcceptQuoteBody =>
      'L\'hôpital réservera votre plan de traitement. Vous choisirez ensuite votre date d\'admission et réglerez l\'acompte.';

  @override
  String get caseNotYet => 'Pas encore';

  @override
  String get caseAccept => 'Accepter';

  @override
  String get caseQuoteAccepted => 'Devis accepté';

  @override
  String get caseDeclineQuoteTitle => 'Refuser ce devis ?';

  @override
  String get caseDecline => 'Refuser';

  @override
  String get caseCancelBookingTitle => 'Annuler la réservation ?';

  @override
  String get caseReason => 'Motif';

  @override
  String get caseCancelBookingPolicy =>
      'Les remboursements suivent la politique d\'annulation : plus vous annulez tôt avant l\'admission, plus le remboursement est élevé.';

  @override
  String get caseBookingCancelled =>
      'Réservation annulée. Tout remboursement est versé sur votre moyen de paiement d\'origine.';

  @override
  String get caseCancelCaseTitle => 'Annuler ce dossier ?';

  @override
  String get caseCancelCase => 'Annuler le dossier';

  @override
  String get caseNextPaymentNeeded => 'Paiement requis pour confirmer votre réservation';

  @override
  String get caseNextBalanceDue => 'Solde à régler avant l\'admission';

  @override
  String get caseNextWaitingForQuote => 'En attente du devis de l\'hôpital';

  @override
  String get caseNextReviewQuote => 'Consultez votre devis';

  @override
  String get caseNextChooseDate => 'Choisissez votre date d\'admission';

  @override
  String get caseHospitalQuote => 'Devis de l\'hôpital';

  @override
  String caseQuoteBy(String name) {
    return 'Par $name';
  }

  @override
  String caseQuoteTotalStay(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Total · séjour de $days jours',
      one: 'Total · séjour de $days jour',
    );
    return '$_temp0';
  }

  @override
  String get caseAcceptQuote => 'Accepter le devis';

  @override
  String get caseChooseAdmissionDate => 'Choisir la date d\'admission';

  @override
  String get caseReasonOptional => 'Motif (facultatif)';

  @override
  String refundTierLessThanDays(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'Moins de $days jours avant l\'admission',
      one: 'Moins de $days jour avant l\'admission',
    );
    return '$_temp0';
  }

  @override
  String refundTierDaysOrMore(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days jours ou plus avant l\'admission',
      one: '$days jour ou plus avant l\'admission',
    );
    return '$_temp0';
  }

  @override
  String get refundNone => 'aucun remboursement';

  @override
  String refundPercent(int pct) {
    return 'remboursement de $pct %';
  }

  @override
  String refundTierLine(String when, String refund) {
    return '$when : $refund';
  }

  @override
  String get refundPolicyTitle => 'Annulation et remboursements';

  @override
  String get refundPolicyGeneral =>
      'La politique d\'annulation en vigueur au moment de la confirmation de votre réservation s\'applique : plus vous annulez tôt avant l\'admission, plus le remboursement est élevé.';

  @override
  String get refundPolicyLocked =>
      'Conditions figées pour cette réservation. Si l’hôpital ou Heal India Global annule, vous êtes intégralement remboursé.';

  @override
  String documentsUploading(String name) {
    return 'Téléversement de $name';
  }

  @override
  String get documentsEmptyTitle => 'Aucun document pour l\'instant';

  @override
  String get documentsEmptyBody =>
      'Téléversez votre passeport, vos comptes rendus médicaux, examens d\'imagerie et ordonnances. PDF, JPG, PNG, WEBP, HEIC ou DICOM jusqu\'à 20 Mo.';

  @override
  String get documentsUploadADocument => 'Téléverser un document';

  @override
  String get documentsSharedNote => 'Partagés uniquement avec votre équipe de soins et l\'hôpital de votre dossier.';

  @override
  String documentsUploaded(String name) {
    return 'Fichier téléversé : $name';
  }

  @override
  String get documentsDeleteTitle => 'Supprimer le document ?';

  @override
  String documentsDeleteBody(String name) {
    return '$name sera supprimé pour vous et votre équipe de soins.';
  }

  @override
  String get documentsKeep => 'Conserver';

  @override
  String get documentsActionsTooltip => 'Actions sur le document';

  @override
  String get documentsFileTooLarge => 'Le fichier est trop volumineux (20 Mo maximum).';

  @override
  String documentsSaved(String name) {
    return 'Enregistré : $name';
  }

  @override
  String get documentsPreviewUnavailable =>
      'Ce format d’image ne peut pas être prévisualisé. Utilisez plutôt Télécharger.';

  @override
  String get documentsWhatAreYouUploading => 'Que téléversez-vous ?';

  @override
  String get preArrivalTitle => 'Guide avant l\'arrivée';

  @override
  String get preArrivalVisaTitle => 'Visa et documents';

  @override
  String get preArrivalVisaPassport => 'Passeport valide au moins 6 mois, avec deux pages vierges.';

  @override
  String get preArrivalVisaEMedical =>
      'Visa indien e-Medical (et visa e-Medical Attendant pour les accompagnants) - nous vous envoyons la lettre d\'invitation de l\'hôpital.';

  @override
  String get preArrivalVisaCopies =>
      'Copies imprimées de votre visa, de la lettre d\'invitation, de la confirmation de réservation et des comptes rendus médicaux.';

  @override
  String get preArrivalMedicalTitle => 'Dossier médical';

  @override
  String get preArrivalMedicalReports =>
      'Examens d\'imagerie récents, résultats d\'analyses et ordonnances - téléversez-les dans Documents pour que votre médecin puisse les consulter.';

  @override
  String get preArrivalMedicalMedicines =>
      'La liste de vos médicaments actuels avec leurs doses ; emportez-en assez pour tout le séjour.';

  @override
  String get preArrivalMedicalAllergies => 'Vos allergies et opérations antérieures, notées en anglais.';

  @override
  String get preArrivalPackTitle => 'Quoi emporter';

  @override
  String get preArrivalPackClothing => 'Des vêtements amples et confortables pour après le traitement.';

  @override
  String get preArrivalPackAdapter =>
      'Adaptateur de prise universel (l\'Inde utilise des prises de type C, D et M, 230 V).';

  @override
  String get preArrivalPackJacket => 'Une veste légère - les hôpitaux et les avions sont climatisés.';

  @override
  String get preArrivalMoneyTitle => 'Argent';

  @override
  String get preArrivalMoneyCards =>
      'Les cartes sont acceptées dans les hôpitaux et les hôtels ; gardez quelques roupies pour les taxis et les petits commerces.';

  @override
  String get preArrivalMoneyTellBank =>
      'Prévenez votre banque de votre voyage en Inde pour éviter le blocage de vos cartes.';

  @override
  String get preArrivalMoneyReceipts => 'Conservez vos reçus de paiement dans l\'application, rubrique Documents.';

  @override
  String get preArrivalArrivalTitle => 'Jour d\'arrivée';

  @override
  String get preArrivalArrivalFlight =>
      'Communiquez les détails de votre vol pour que nous organisions l\'accueil à l\'aéroport.';

  @override
  String get preArrivalArrivalDriver => 'Votre chauffeur vous attend aux arrivées avec une pancarte Heal India Global.';

  @override
  String get preArrivalArrivalHelpline => 'Enregistrez le numéro d\'assistance 24h/24 et 7j/7 avant votre départ.';

  @override
  String get preArrivalCulturalTips => 'Conseils culturels';

  @override
  String get preArrivalTipsSoon => 'Les conseils apparaîtront bientôt ici.';

  @override
  String get preArrivalDisclaimer =>
      'Informations de voyage générales uniquement - suivez toujours les instructions de votre médecin.';

  @override
  String journeyCallFromPhone(String number) {
    return 'Appelez le $number depuis votre téléphone.';
  }

  @override
  String journeyWhatsAppFromPhone(String number) {
    return 'Contactez le $number sur WhatsApp depuis votre téléphone.';
  }

  @override
  String get journeyCoordinatorChatSubject => 'Mon coordinateur de soins';

  @override
  String get emergencyContactsTitle => 'Contacts d\'urgence';

  @override
  String get emergencyContactsIntro =>
      'En cas d\'urgence médicale en Inde, appelez d\'abord le numéro d\'urgence local.';

  @override
  String get emergencyContactsServicesIndia => 'Services d\'urgence (Inde)';

  @override
  String get emergencyContactsHelpline => 'Assistance Heal India Global 24h/24 et 7j/7';

  @override
  String get emergencyContactsWhatsApp => 'Assistance WhatsApp';

  @override
  String emergencyContactsCoordinator(String name) {
    return 'Coordinateur - $name';
  }

  @override
  String get emergencyContactsMine => 'Mon contact d\'urgence';

  @override
  String get travelRequestSent => 'Demande envoyée. Notre service voyages vous recontactera.';

  @override
  String get visaSectionTitle => 'Visa médical';

  @override
  String get visaEmptyText =>
      'La plupart des patients internationaux ont besoin d\'un visa indien e-Medical. Nous fournissons la lettre d\'invitation de l\'hôpital et vous aidons à faire la demande.';

  @override
  String get visaRequestAssistance => 'Demander une aide pour le visa';

  @override
  String get flightSectionTitle => 'Vols et transferts aéroport';

  @override
  String get flightNoRequests => 'Aucune demande de vol ou de transfert pour l\'instant.';

  @override
  String get flightRequestChip => 'Demander un vol';

  @override
  String get travelAirportPickup => 'Accueil à l\'aéroport';

  @override
  String get travelAirportDrop => 'Dépose à l\'aéroport';

  @override
  String get stayAccommodation => 'Hébergement';

  @override
  String get stayEmptyText => 'Hôtels, maisons d’hôtes et appartements avec services près de votre hôpital.';

  @override
  String get stayRequestAccommodation => 'Demander un hébergement';

  @override
  String get stayRequestAnother => 'Demander un autre séjour';

  @override
  String get travelLocalServices => 'Services locaux';

  @override
  String get travelTranslator => 'Interprète';

  @override
  String get travelLocalGuide => 'Guide local';

  @override
  String get travelTransport => 'Transport';

  @override
  String get visaHintNotStarted => 'Nous avons bien reçu votre demande et allons lister les documents nécessaires.';

  @override
  String get visaHintDocumentsPending => 'Téléversez votre passeport et vos comptes rendus médicaux dans Documents.';

  @override
  String get visaHintInvitationIssued =>
      'Votre lettre d\'invitation est prête. Faites votre demande sur indianvisaonline.gov.in.';

  @override
  String get visaHintApplied => 'Demande déposée. La décision prend généralement 3 à 5 jours ouvrés.';

  @override
  String get visaHintApproved => 'Visa accordé. Emportez une copie imprimée pour le voyage.';

  @override
  String get visaHintRejected => 'La demande n\'a pas été acceptée. Votre coordinateur va vous contacter.';

  @override
  String visaApplicationRef(String ref) {
    return 'Réf. de la demande : $ref';
  }

  @override
  String get visaInvitationLetter => 'Lettre d\'invitation';

  @override
  String get travelRouteArrow => ' → ';

  @override
  String flightPnr(String pnr) {
    return 'PNR $pnr';
  }

  @override
  String stayGuestCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count personnes', one: '$count personne');
    return '$_temp0';
  }

  @override
  String stayConfirmationCode(String code) {
    return 'Conf. $code';
  }

  @override
  String get checklistTitle => 'Votre liste de contrôle';

  @override
  String get tripsTodaySchedule => 'Programme du jour';

  @override
  String get tripsQuickActions => 'Actions rapides';

  @override
  String get tripsUploadDocuments => 'Téléverser des documents';

  @override
  String get tripsChatWithCoordinator => 'Écrire au\ncoordinateur';

  @override
  String get tripsEmergencyContacts => 'Contacts\nd\'urgence';

  @override
  String get journeySectionTitle => 'Votre parcours';

  @override
  String get tripsTravelSubtitle => 'Visa, vols, accueil aéroport, séjour, interprète';

  @override
  String get tripsSupportTitle => 'Assistance sur place';

  @override
  String get tripsSupportSubtitle => 'Carte, programme, assistance, interprète, SOS';

  @override
  String get tripsMyCases => 'Mes dossiers';

  @override
  String tripsActiveCases(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count dossiers actifs',
      one: '$count dossier actif',
    );
    return '$_temp0';
  }

  @override
  String tripsYourCoordinator(String name) {
    return 'Votre coordinateur : $name';
  }

  @override
  String get tripsMessageAnyTime => 'Écrivez-lui à tout moment';

  @override
  String tripsCountdownUnit(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'jours', one: 'jour');
    return '$_temp0';
  }

  @override
  String get tripsCountdownToday => 'Aujourd\'hui';

  @override
  String get tripsCountdownDone => 'Terminé';

  @override
  String get tripsCountdownNow => 'Maintenant';

  @override
  String get tripsTreatmentInProgress => 'Traitement en cours';

  @override
  String get tripsUntilTreatment => 'Avant le traitement';

  @override
  String tripsDaysUntilTreatment(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count jours avant le traitement',
      one: '$count jour avant le traitement',
    );
    return '$_temp0';
  }

  @override
  String get tripsPaymentNeeded => 'Paiement requis pour confirmer';

  @override
  String get tripsBalanceDue => 'Solde dû';

  @override
  String get tripsPayNow => 'Payer';

  @override
  String get tripsNoTripTitle => 'Aucun traitement à venir pour l\'instant';

  @override
  String get tripsNoTripBody =>
      'Trouvez l\'hôpital adapté grâce à une évaluation gratuite par IA, ou poursuivez un dossier déjà commencé.';

  @override
  String get travelSelect => 'Choisir';

  @override
  String get visaAssistanceTitle => 'Aide pour le visa';

  @override
  String get visaAssistanceSubtitle =>
      'Nous préparons la lettre d\'invitation de l\'hôpital et vous guidons dans la demande de visa indien e-Medical.';

  @override
  String get visaForPatient => 'Patient';

  @override
  String get visaForAttendant => 'Accompagnant';

  @override
  String get visaNotesLabel => 'Remarques (nationalité, dates de voyage, accompagnants)';

  @override
  String get travelAirport => 'Aéroport';

  @override
  String travelCityAirport(String city) {
    return 'Aéroport de $city';
  }

  @override
  String get travelHospitalOrHotel => 'Hôpital / hôtel';

  @override
  String get flightRequestTitle => 'Demander un vol';

  @override
  String get flightRequestSubtitle =>
      'Notre service voyages vous envoie des options tarifaires ; rien n’est facturé avant votre confirmation.';

  @override
  String get flightPreferredDeparture => 'Départ souhaité';

  @override
  String get travelPickupSubtitle =>
      'Un chauffeur vous accueille aux arrivées et vous conduit à votre hôpital ou hôtel.';

  @override
  String get travelArrivalDateTime => 'Date et heure d\'arrivée';

  @override
  String get travelDropSubtitle => 'Nous vous conduisons à l\'aéroport pour votre vol retour.';

  @override
  String get travelPickupTime => 'Heure de prise en charge';

  @override
  String get travelLocalTransport => 'Transport local';

  @override
  String get travelLocalTransportSubtitle => 'Voiture avec chauffeur pour vos rendez-vous en ville.';

  @override
  String get travelStart => 'Début';

  @override
  String get travelSendRequest => 'Envoyer la demande';

  @override
  String get flightFromCityOrAirport => 'Départ (ville ou aéroport)';

  @override
  String get travelFrom => 'Départ';

  @override
  String get travelTo => 'Arrivée';

  @override
  String get flightNumberOptional => 'Numéro de vol (facultatif)';

  @override
  String get travelPassengers => 'Passagers';

  @override
  String get travelFewerPassengers => 'Moins de passagers';

  @override
  String get travelMorePassengers => 'Plus de passagers';

  @override
  String get travelNotesLabel => 'Remarques (fauteuil roulant, bagages, préférences)';

  @override
  String get staySheetSubtitle =>
      'Hébergements près de votre hôpital. Notre équipe confirme la disponibilité et le prix avant la réservation.';

  @override
  String get stayNoPartners =>
      'Aucun hébergement partenaire n\'est encore référencé pour cet hôpital. Demandez à votre coordinateur dans Messages.';

  @override
  String stayDistanceKm(String km) {
    return '$km km';
  }

  @override
  String stayPerNight(String amount) {
    return '$amount/nuit';
  }

  @override
  String get stayCheckInOut => 'Arrivée - départ';

  @override
  String get stayGuests => 'Personnes';

  @override
  String get stayFewerGuests => 'Moins de personnes';

  @override
  String get stayMoreGuests => 'Plus de personnes';

  @override
  String get stayNotesLabel => 'Remarques (type de chambre, accessibilité, régime alimentaire)';

  @override
  String get travelTranslatorTitle => 'Obtenir un interprète';

  @override
  String get travelTranslatorSubtitle => 'Un interprète médical pour les consultations et les séjours à l\'hôpital.';

  @override
  String get travelTranslatorNotes => 'Langue souhaitée (par ex. arabe, français)';

  @override
  String get travelGuideTitle => 'Réserver un guide local';

  @override
  String get travelGuideSubtitle =>
      'Un guide de confiance pour vos courses, achats et visites pendant votre convalescence.';

  @override
  String get travelGuideNotes => 'Pour quoi souhaitez-vous de l’aide ?';

  @override
  String travelServiceRequestTitle(String service) {
    return 'Demander : $service';
  }

  @override
  String get travelServiceSubtitle => 'Notre équipe confirme avec vous les détails et le prix.';

  @override
  String get travelNotes => 'Remarques';

  @override
  String get travelWhenNeeded => 'Quand en avez-vous besoin ?';

  @override
  String get travelPreferredProvider => 'Prestataire préféré (facultatif)';

  @override
  String get travelAnyAvailable => 'N\'importe lequel';

  @override
  String get profileMyJourney => 'Mon parcours';

  @override
  String get profileMyCasesQuotes => 'Mes dossiers et devis';

  @override
  String get profileDocuments => 'Documents';

  @override
  String get profileDocumentsSubtitle => 'Passeport, rapports médicaux, visas, factures';

  @override
  String get companionsTitle => 'Accompagnants';

  @override
  String get companionsSubtitleDefault => 'Les personnes qui voyagent avec vous';

  @override
  String get companionsSubtitleEmpty => 'Ajoutez les personnes qui voyagent avec vous';

  @override
  String get savedTitle => 'Enregistrés';

  @override
  String get profileSavedSubtitle => 'Hôpitaux, médecins et traitements';

  @override
  String get profileAbout => 'À propos';

  @override
  String get profileTermsOfService => 'Conditions d’utilisation';

  @override
  String get profilePrivacyPolicy => 'Politique de confidentialité';

  @override
  String get deleteAccountDoneSnack => 'Votre compte a été supprimé.';

  @override
  String get profileGuest => 'Invité';

  @override
  String get profilePatientBadge => 'Patient';

  @override
  String get profileEmailVerified => 'E-mail vérifié';

  @override
  String get editProfileTitle => 'Modifier le profil';

  @override
  String get profileGuestUpgradeTitle => 'Créez votre compte gratuit';

  @override
  String get profileGuestUpgradeBody =>
      'Conservez vos questionnaires de santé et vos correspondances, demandez des devis, réservez un traitement, téléversez des documents et échangez avec votre coordinateur.';

  @override
  String get profileCreateAccount => 'Créer un compte';

  @override
  String get authLogIn => 'Se connecter';

  @override
  String get profilePersonalInfo => 'Informations personnelles';

  @override
  String profilePassportExpires(String date) {
    return 'expire le $date';
  }

  @override
  String get profileDateOfBirth => 'Date de naissance';

  @override
  String get profileGender => 'Sexe';

  @override
  String get profileNationality => 'Nationalité';

  @override
  String get profilePhone => 'Téléphone';

  @override
  String get profilePassport => 'Passeport';

  @override
  String get profilePassportValidityWarning =>
      'Votre passeport doit être valide au moins 6 mois pour demander un visa e-Medical.';

  @override
  String get profileEmergencyContact => 'Contact d’urgence';

  @override
  String get profileBloodGroup => 'Groupe sanguin';

  @override
  String get profileNotSet => 'Non renseigné';

  @override
  String get profileNotAdded => 'Non renseigné';

  @override
  String profileClearField(String label) {
    return 'Effacer : $label';
  }

  @override
  String get profileRelationship => 'Lien';

  @override
  String get profileNewPassportNumber => 'Nouveau numéro de passeport';

  @override
  String get settingsPreferences => 'Préférences';

  @override
  String get settingsCurrency => 'Devise';

  @override
  String settingsCurrencySubtitle(String currency) {
    return 'Les prix sont affichés à titre indicatif en $currency';
  }

  @override
  String get settingsPreferredCurrency => 'Devise préférée';

  @override
  String get settingsAppearance => 'Apparence';

  @override
  String get settingsThemeDark => 'Sombre';

  @override
  String get settingsThemeLight => 'Clair';

  @override
  String get settingsThemeSystem => 'Comme l’appareil';

  @override
  String get settingsSecurity => 'Sécurité';

  @override
  String get accountVerifyEmail => 'Vérifiez votre e-mail';

  @override
  String accountVerifyEmailSubtitle(String email) {
    return 'Consultez $email pour trouver le lien de vérification';
  }

  @override
  String get accountVerificationSent => 'E-mail de vérification envoyé';

  @override
  String get accountResend => 'Renvoyer';

  @override
  String get accountYourData => 'Vos données';

  @override
  String get accountYourDataSubtitle =>
      'Les données médicales sont chiffrées et partagées uniquement avec les hôpitaux que vous choisissez.';

  @override
  String get accountExitGuestTitle => 'Quitter le mode invité ?';

  @override
  String get accountLogOutTitle => 'Se déconnecter ?';

  @override
  String get accountExitGuestBody =>
      'Vos questionnaires de santé en mode invité seront perdus si vous ne créez pas de compte avant.';

  @override
  String get accountLogOutBody => 'Vous pouvez vous reconnecter à tout moment avec votre e-mail et votre mot de passe.';

  @override
  String get accountExit => 'Quitter';

  @override
  String get accountExitGuestMode => 'Quitter le mode invité';

  @override
  String get companionsRemoveTitle => 'Retirer l’accompagnant ?';

  @override
  String companionsRemoveBody(String name) {
    return '$name sera retiré(e) de vos accompagnants.';
  }

  @override
  String get companionsRemovedSnack => 'Accompagnant retiré';

  @override
  String companionsAddedSnack(String name) {
    return '$name ajouté(e)';
  }

  @override
  String get companionAdd => 'Ajouter un accompagnant';

  @override
  String get companionsEmptyTitle => 'Aucun accompagnant pour l’instant';

  @override
  String get companionsEmptyMessage =>
      'Ajoutez le membre de votre famille ou l’ami qui voyage avec vous afin que nous puissions organiser son visa d’accompagnant.';

  @override
  String companionsBorn(String date) {
    return 'Né(e) le $date';
  }

  @override
  String companionsPassportLast4(String last4) {
    return 'Passeport •••• $last4';
  }

  @override
  String companionsEditTooltip(String name) {
    return 'Modifier $name';
  }

  @override
  String companionsRemoveTooltip(String name) {
    return 'Retirer $name';
  }

  @override
  String get companionEditTitle => 'Modifier l’accompagnant';

  @override
  String get companionFormIntro =>
      'Les accompagnants voyagent avec vous en tant qu’accompagnants médicaux et ont besoin de leur propre visa.';

  @override
  String get companionFullNameRequired => 'Saisissez le nom complet';

  @override
  String get companionFullNameLabel => 'Nom complet (comme sur le passeport)';

  @override
  String get companionRelationshipRequired => 'Choisissez le lien';

  @override
  String get companionRelationshipSpouse => 'Conjoint(e)';

  @override
  String get companionRelationshipParent => 'Parent';

  @override
  String get companionRelationshipChild => 'Enfant';

  @override
  String get companionRelationshipSibling => 'Frère/sœur';

  @override
  String get companionRelationshipRelative => 'Membre de la famille';

  @override
  String get companionRelationshipFriend => 'Ami(e)';

  @override
  String get companionRelationshipCaregiver => 'Aidant(e)';

  @override
  String get companionPassportInvalid => 'Saisissez un numéro de passeport valide';

  @override
  String get companionPassportOptional => 'Numéro de passeport (facultatif)';

  @override
  String get companionPassportStoredEncrypted => 'Stocké de façon chiffrée';

  @override
  String companionPassportCurrent(String last4) {
    return 'Actuel : •••• $last4 - laissez vide pour le conserver';
  }

  @override
  String get companionSave => 'Enregistrer l’accompagnant';

  @override
  String get editProfileEcNameRequired => 'Ajoutez le nom ou effacez le contact d’urgence';

  @override
  String get editProfileEcRelationshipRequired => 'Ajoutez le lien ou effacez le contact d’urgence';

  @override
  String get editProfileEcPhoneRequired => 'Ajoutez le téléphone ou effacez le contact d’urgence';

  @override
  String get editProfileFixFields => 'Veuillez corriger les champs signalés.';

  @override
  String get editProfileSaved => 'Profil enregistré';

  @override
  String get editProfilePersonalDetails => 'Données personnelles';

  @override
  String get editProfileFirstName => 'Prénom';

  @override
  String get editProfileLastName => 'Nom';

  @override
  String get editProfileCountryOfResidence => 'Pays de résidence';

  @override
  String get editProfilePassportSubtitle => 'Nécessaire pour la lettre d’invitation de votre visa médical';

  @override
  String get editProfilePassportInvalid => 'Utilisez 5 à 20 lettres ou chiffres';

  @override
  String get editProfilePassportNumber => 'Numéro de passeport';

  @override
  String get editProfilePassportHelperNew => 'Stocké de façon chiffrée. Seuls les 4 derniers chiffres sont affichés.';

  @override
  String editProfilePassportOnFile(String masked) {
    return 'Enregistré : $masked. Laissez vide pour le conserver.';
  }

  @override
  String get editProfilePassportExpiry => 'Expiration du passeport';

  @override
  String get editProfileName => 'Nom';

  @override
  String get editProfileMedicalInfo => 'Informations médicales';

  @override
  String get editProfileMedicalInfoSubtitle => 'Partagées uniquement avec les hôpitaux auxquels vous demandez un devis';

  @override
  String get editProfileAllergies => 'Allergies';

  @override
  String get editProfileMedicalHistory => 'Antécédents médicaux';

  @override
  String get editProfileInsurance => 'Assurance';

  @override
  String get editProfileInsuranceProvider => 'Assureur';

  @override
  String get editProfilePolicyNumber => 'Numéro de police';

  @override
  String get editProfileNewPolicyNumber => 'Nouveau numéro de police';

  @override
  String editProfilePolicyOnFile(String last4) {
    return 'Enregistré : •••• $last4. Laissez vide pour le conserver.';
  }

  @override
  String get editProfileSaveChanges => 'Enregistrer les modifications';

  @override
  String get savedEmptyTitle => 'Rien d’enregistré pour l’instant';

  @override
  String get savedEmptyMessage =>
      'Touchez le signet d’un hôpital, d’un médecin ou d’un traitement pour le retrouver ici.';

  @override
  String get savedExploreHospitals => 'Découvrir les hôpitaux';

  @override
  String savedFilterAll(int count) {
    return 'Tout ($count)';
  }

  @override
  String savedFilterType(String type, int count) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'Hôpitaux ($count)',
      'doctor': 'Médecins ($count)',
      'procedure': 'Interventions ($count)',
      'other': 'Autres ($count)',
    });
    return '$_temp0';
  }

  @override
  String get savedEmptyCategory => 'Rien d’enregistré dans cette catégorie';

  @override
  String savedNoLongerAvailable(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'hospital': 'Cet hôpital n’est plus disponible',
      'doctor': 'Ce médecin n’est plus disponible',
      'procedure': 'Cette intervention n’est plus disponible',
      'other': 'Cet élément n’est plus disponible',
    });
    return '$_temp0';
  }

  @override
  String get passwordChangeTitle => 'Changer le mot de passe';

  @override
  String get passwordUpdatedSnack => 'Mot de passe mis à jour. Vos autres appareils ont été déconnectés.';

  @override
  String get passwordCurrent => 'Mot de passe actuel';

  @override
  String get passwordCurrentHelper => 'Laissez vide si vous vous êtes inscrit(e) avec Google sans jamais en définir un';

  @override
  String get passwordNew => 'Nouveau mot de passe';

  @override
  String get passwordMustDiffer => 'Choisissez un mot de passe différent de l’actuel';

  @override
  String passwordPolicyHelper(int min) {
    return 'Au moins $min caractères, dont une lettre et un chiffre';
  }

  @override
  String get passwordConfirmNew => 'Confirmez le nouveau mot de passe';

  @override
  String get passwordMismatch => 'Les mots de passe ne correspondent pas';

  @override
  String get passwordUpdateButton => 'Mettre à jour le mot de passe';

  @override
  String get deleteAccountGuestBody =>
      'Cette action supprime définitivement votre compte invité, vos questionnaires de santé et vos éléments enregistrés.';

  @override
  String get deleteAccountBody =>
      'Cette action supprime définitivement votre compte, votre profil, vos accompagnants, vos éléments enregistrés et vos documents téléversés, et vous déconnecte de tous vos appareils. Elle est irréversible.';

  @override
  String get deleteAccountRetention =>
      'Les documents que la loi nous oblige à conserver (factures, paiements, remboursements et dossiers de soins hospitaliers) sont conservés pendant la durée légale de conservation avec un accès restreint, puis effacés. Il peut être nécessaire de régler ou d’annuler d’abord les réservations en cours ou les paiements en attente.';

  @override
  String get deleteAccountPasswordLabel => 'Mot de passe';

  @override
  String get deleteAccountPasswordHelper =>
      'Laissez vide si vous vous connectez avec Google ou Apple sans jamais avoir défini de mot de passe';

  @override
  String get deleteAccountOtpLabel => 'Code d’authentification';

  @override
  String get deleteAccountOtpHelper => 'Le code à 6 chiffres de votre application d’authentification';

  @override
  String get deleteAccountReasonLabel => 'Pourquoi partez-vous ? (facultatif)';

  @override
  String deleteAccountConfirmLabel(String word) {
    return 'Saisissez $word pour confirmer';
  }

  @override
  String get deleteAccountSubmit => 'Supprimer définitivement mon compte';

  @override
  String get deleteAccountBlockerActiveCases => 'Dossiers en cours';

  @override
  String get deleteAccountBlockerActiveBookings => 'Réservations à venir ou en cours';

  @override
  String get deleteAccountBlockerPendingPayments => 'Paiements en cours';

  @override
  String get deleteAccountBlockerHospitalsOwned => 'Hôpitaux référencés dont vous êtes propriétaire';

  @override
  String get deleteAccountBlockersTitle => 'Ces éléments doivent d’abord être clôturés';

  @override
  String get deleteAccountRequestSent =>
      'Demande de suppression envoyée. Notre équipe d’assistance fermera votre compte une fois ces éléments réglés et vous le confirmera par e-mail.';

  @override
  String get deleteAccountRequestButton => 'Demander la suppression';

  @override
  String get forgotPasswordInvalidCode =>
      'Ce code de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.';

  @override
  String get forgotPasswordSetNewTitle => 'Définir un nouveau mot de passe';

  @override
  String get forgotPasswordTitle => 'Réinitialiser le mot de passe';

  @override
  String get forgotPasswordIntro =>
      'Saisissez l’e-mail utilisé lors de votre inscription et nous vous enverrons un lien pour réinitialiser votre mot de passe.';

  @override
  String get forgotPasswordEmailLabel => 'E-mail';

  @override
  String get forgotPasswordSendLink => 'Envoyer le lien';

  @override
  String get forgotPasswordHaveCode => 'J’ai déjà un code de réinitialisation';

  @override
  String get forgotPasswordCheckInbox => 'Consultez votre boîte de réception';

  @override
  String forgotPasswordSentBody(String email) {
    return 'Si un compte existe pour $email, nous avons envoyé un lien de réinitialisation. Il peut mettre quelques minutes à arriver - vérifiez aussi vos courriers indésirables.';
  }

  @override
  String get forgotPasswordEnterCode => 'Saisir le code';

  @override
  String get forgotPasswordBackToLogin => 'Retour à la connexion';

  @override
  String get forgotPasswordResetIntro =>
      'Collez le code de réinitialisation reçu par e-mail, puis choisissez un nouveau mot de passe.';

  @override
  String get forgotPasswordPasteFullCode => 'Collez le code complet';

  @override
  String get forgotPasswordCodeLabel => 'Code de réinitialisation';

  @override
  String get forgotPasswordRequestNewLink => 'Demander un nouveau lien';

  @override
  String get forgotPasswordUpdatedTitle => 'Mot de passe mis à jour';

  @override
  String get forgotPasswordUpdatedBody => 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.';

  @override
  String get validationEnterEmail => 'Saisissez votre e-mail';

  @override
  String get validationInvalidEmail => 'Saisissez une adresse e-mail valide';

  @override
  String get validationEnterPassword => 'Saisissez votre mot de passe';

  @override
  String get validationChoosePassword => 'Choisissez un mot de passe';

  @override
  String validationPasswordTooShort(int min) {
    return 'Utilisez au moins $min caractères';
  }

  @override
  String validationPasswordTooLong(int max) {
    return 'Utilisez au plus $max caractères';
  }

  @override
  String get validationPasswordLetterDigit => 'Incluez au moins une lettre et un chiffre';

  @override
  String get validationEnterFullName => 'Saisissez votre nom complet';

  @override
  String get validationNameTooLong => 'Le nom est trop long';

  @override
  String get validationInvalidPhone => 'Saisissez un numéro de téléphone valide';

  @override
  String get validationEnterOtp => 'Saisissez le code à 6 chiffres';

  @override
  String get countryAF => 'Afghanistan';

  @override
  String get countryDZ => 'Algérie';

  @override
  String get countryAO => 'Angola';

  @override
  String get countryAR => 'Argentine';

  @override
  String get countryAM => 'Arménie';

  @override
  String get countryAU => 'Australie';

  @override
  String get countryAT => 'Autriche';

  @override
  String get countryAZ => 'Azerbaïdjan';

  @override
  String get countryBH => 'Bahreïn';

  @override
  String get countryBD => 'Bangladesh';

  @override
  String get countryBY => 'Biélorussie';

  @override
  String get countryBE => 'Belgique';

  @override
  String get countryBT => 'Bhoutan';

  @override
  String get countryBW => 'Botswana';

  @override
  String get countryBR => 'Brésil';

  @override
  String get countryBN => 'Brunei';

  @override
  String get countryBG => 'Bulgarie';

  @override
  String get countryBI => 'Burundi';

  @override
  String get countryKH => 'Cambodge';

  @override
  String get countryCM => 'Cameroun';

  @override
  String get countryCA => 'Canada';

  @override
  String get countryTD => 'Tchad';

  @override
  String get countryCL => 'Chili';

  @override
  String get countryCN => 'Chine';

  @override
  String get countryCO => 'Colombie';

  @override
  String get countryCD => 'Congo (RDC)';

  @override
  String get countryCI => 'Côte d’Ivoire';

  @override
  String get countryHR => 'Croatie';

  @override
  String get countryCY => 'Chypre';

  @override
  String get countryCZ => 'Tchéquie';

  @override
  String get countryDK => 'Danemark';

  @override
  String get countryDJ => 'Djibouti';

  @override
  String get countryEG => 'Égypte';

  @override
  String get countryER => 'Érythrée';

  @override
  String get countryEE => 'Estonie';

  @override
  String get countryET => 'Éthiopie';

  @override
  String get countryFJ => 'Fidji';

  @override
  String get countryFI => 'Finlande';

  @override
  String get countryFR => 'France';

  @override
  String get countryGA => 'Gabon';

  @override
  String get countryGM => 'Gambie';

  @override
  String get countryGE => 'Géorgie';

  @override
  String get countryDE => 'Allemagne';

  @override
  String get countryGH => 'Ghana';

  @override
  String get countryGR => 'Grèce';

  @override
  String get countryGN => 'Guinée';

  @override
  String get countryGY => 'Guyana';

  @override
  String get countryHK => 'Hong Kong';

  @override
  String get countryHU => 'Hongrie';

  @override
  String get countryIS => 'Islande';

  @override
  String get countryIN => 'Inde';

  @override
  String get countryID => 'Indonésie';

  @override
  String get countryIR => 'Iran';

  @override
  String get countryIQ => 'Irak';

  @override
  String get countryIE => 'Irlande';

  @override
  String get countryIL => 'Israël';

  @override
  String get countryIT => 'Italie';

  @override
  String get countryJM => 'Jamaïque';

  @override
  String get countryJP => 'Japon';

  @override
  String get countryJO => 'Jordanie';

  @override
  String get countryKZ => 'Kazakhstan';

  @override
  String get countryKE => 'Kenya';

  @override
  String get countryKW => 'Koweït';

  @override
  String get countryKG => 'Kirghizistan';

  @override
  String get countryLA => 'Laos';

  @override
  String get countryLV => 'Lettonie';

  @override
  String get countryLB => 'Liban';

  @override
  String get countryLS => 'Lesotho';

  @override
  String get countryLR => 'Liberia';

  @override
  String get countryLY => 'Libye';

  @override
  String get countryLT => 'Lituanie';

  @override
  String get countryLU => 'Luxembourg';

  @override
  String get countryMG => 'Madagascar';

  @override
  String get countryMW => 'Malawi';

  @override
  String get countryMY => 'Malaisie';

  @override
  String get countryMV => 'Maldives';

  @override
  String get countryML => 'Mali';

  @override
  String get countryMT => 'Malte';

  @override
  String get countryMR => 'Mauritanie';

  @override
  String get countryMU => 'Maurice';

  @override
  String get countryMX => 'Mexique';

  @override
  String get countryMD => 'Moldavie';

  @override
  String get countryMN => 'Mongolie';

  @override
  String get countryMA => 'Maroc';

  @override
  String get countryMZ => 'Mozambique';

  @override
  String get countryMM => 'Myanmar';

  @override
  String get countryNA => 'Namibie';

  @override
  String get countryNP => 'Népal';

  @override
  String get countryNL => 'Pays-Bas';

  @override
  String get countryNZ => 'Nouvelle-Zélande';

  @override
  String get countryNE => 'Niger';

  @override
  String get countryNG => 'Nigeria';

  @override
  String get countryNO => 'Norvège';

  @override
  String get countryOM => 'Oman';

  @override
  String get countryPK => 'Pakistan';

  @override
  String get countryPS => 'Palestine';

  @override
  String get countryPA => 'Panama';

  @override
  String get countryPG => 'Papouasie-Nouvelle-Guinée';

  @override
  String get countryPE => 'Pérou';

  @override
  String get countryPH => 'Philippines';

  @override
  String get countryPL => 'Pologne';

  @override
  String get countryPT => 'Portugal';

  @override
  String get countryQA => 'Qatar';

  @override
  String get countryRO => 'Roumanie';

  @override
  String get countryRU => 'Russie';

  @override
  String get countryRW => 'Rwanda';

  @override
  String get countrySA => 'Arabie saoudite';

  @override
  String get countrySN => 'Sénégal';

  @override
  String get countryRS => 'Serbie';

  @override
  String get countrySC => 'Seychelles';

  @override
  String get countrySL => 'Sierra Leone';

  @override
  String get countrySG => 'Singapour';

  @override
  String get countrySK => 'Slovaquie';

  @override
  String get countrySI => 'Slovénie';

  @override
  String get countrySO => 'Somalie';

  @override
  String get countryZA => 'Afrique du Sud';

  @override
  String get countryKR => 'Corée du Sud';

  @override
  String get countrySS => 'Soudan du Sud';

  @override
  String get countryES => 'Espagne';

  @override
  String get countryLK => 'Sri Lanka';

  @override
  String get countrySD => 'Soudan';

  @override
  String get countrySR => 'Suriname';

  @override
  String get countrySE => 'Suède';

  @override
  String get countryCH => 'Suisse';

  @override
  String get countrySY => 'Syrie';

  @override
  String get countryTW => 'Taïwan';

  @override
  String get countryTJ => 'Tadjikistan';

  @override
  String get countryTZ => 'Tanzanie';

  @override
  String get countryTH => 'Thaïlande';

  @override
  String get countryTG => 'Togo';

  @override
  String get countryTT => 'Trinité-et-Tobago';

  @override
  String get countryTN => 'Tunisie';

  @override
  String get countryTR => 'Turquie';

  @override
  String get countryTM => 'Turkménistan';

  @override
  String get countryUG => 'Ouganda';

  @override
  String get countryUA => 'Ukraine';

  @override
  String get countryAE => 'Émirats arabes unis';

  @override
  String get countryGB => 'Royaume-Uni';

  @override
  String get countryUS => 'États-Unis';

  @override
  String get countryUY => 'Uruguay';

  @override
  String get countryUZ => 'Ouzbékistan';

  @override
  String get countryVE => 'Venezuela';

  @override
  String get countryVN => 'Viêt Nam';

  @override
  String get countryYE => 'Yémen';

  @override
  String get countryZM => 'Zambie';

  @override
  String get countryZW => 'Zimbabwe';

  @override
  String get agentTabDashboard => 'Tableau de bord';

  @override
  String get agentTabPatients => 'Patients';

  @override
  String get agentTabCases => 'Dossiers';

  @override
  String get agentTabBookings => 'Réservations';

  @override
  String get agentTabEarnings => 'Revenus';

  @override
  String get portalNoActivityYet => 'Aucune activité pour l\'instant';

  @override
  String get portalPatientLabel => 'Patient';

  @override
  String get portalHospitalLabel => 'Hôpital';

  @override
  String get portalDoctorLabel => 'Médecin';

  @override
  String get portalBookingLabel => 'Réservation';

  @override
  String portalCaseOpened(String when) {
    return 'Ouvert $when';
  }

  @override
  String get portalTotal => 'Total';

  @override
  String portalQuoteStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'séjour de $count jours',
      one: 'séjour de $count jour',
    );
    return '$_temp0';
  }

  @override
  String portalQuoteValidUntil(String date) {
    return 'valable jusqu\'au $date';
  }

  @override
  String portalQuotePreparedBy(String name) {
    return 'par $name';
  }

  @override
  String get portalFilterAll => 'Tous';

  @override
  String get portalAccountDeleted => 'Votre compte a été supprimé.';

  @override
  String get payeeStatusPending => 'En attente';

  @override
  String get payeeStatusEligible => 'Éligible';

  @override
  String get payeeStatusOnHold => 'En suspens';

  @override
  String get payeeStatusBatched => 'Dans un lot';

  @override
  String get payeeStatusPaid => 'Payé';

  @override
  String get payeeStatusReversed => 'Contrepassé';

  @override
  String get payeeStatusQueued => 'En file d\'attente';

  @override
  String get payeeStatusProcessing => 'En cours de traitement';

  @override
  String get payeeStatusProcessed => 'Traité';

  @override
  String get payeeStatusFailed => 'Échoué';

  @override
  String get payeeStatusNeedsReconciliation => 'À rapprocher';

  @override
  String get payeeSettlementsTab => 'Règlements';

  @override
  String get payeePayoutsTab => 'Versements';

  @override
  String get payeeStatementTab => 'Relevé';

  @override
  String get payeeItemsEmpty => 'Rien pour l\'instant';

  @override
  String get payeePayoutsEmpty => 'Aucun versement pour l\'instant';

  @override
  String payeePayoutUtr(String utr) {
    return 'UTR $utr';
  }

  @override
  String get payeeMethodManualBankTransfer => 'Virement bancaire manuel';

  @override
  String get payeeStatementTwelveMonths => '12 mois';

  @override
  String payeeStatementDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count jours', one: '$count jour');
    return '$_temp0';
  }

  @override
  String get payeeStatementPeriod => 'Période';

  @override
  String payeeStatementPeriodRange(String from, String to) {
    return '$from – $to';
  }

  @override
  String get payeeOpeningBalance => 'Solde d\'ouverture';

  @override
  String get payeeEarned => 'Gagné';

  @override
  String get payeePaidOut => 'Versé';

  @override
  String get payeeClosingBalance => 'Solde de clôture';

  @override
  String get payeeStatementEmpty => 'Aucune transaction sur cette période';

  @override
  String payeeStatementBalance(String amount) {
    return 'Solde $amount';
  }

  @override
  String get payeePaidToDate => 'Payé à ce jour';

  @override
  String payeeOutstanding(String amount) {
    return 'À verser $amount';
  }

  @override
  String payeeNextPayout(String date) {
    return 'prochain versement le $date';
  }

  @override
  String get payeeKpiPending => 'En attente';

  @override
  String get payeeKpiEligible => 'Éligible au versement';

  @override
  String get payeeKpiOnHold => 'En suspens';

  @override
  String get payeeKpiBatched => 'Dans un lot de versement';

  @override
  String payeeItemGrossFee(String gross, String fee) {
    return 'Brut $gross · frais $fee';
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
    return 'En suspens : $reason';
  }

  @override
  String payeeItemEligibleOn(String date) {
    return 'Éligible le $date';
  }

  @override
  String get commissionTitle => 'Commissions';

  @override
  String commissionRateBadge(String rate) {
    return 'taux $rate';
  }

  @override
  String get commissionKpiPending => 'Commission en attente';

  @override
  String get commissionKpiPaid => 'Commission versée';

  @override
  String get commissionByMonth => 'Commission par mois';

  @override
  String get kycBannerNotSubmitted =>
      'Soumettez vos documents KYC sur le portail web des agents pour commencer à percevoir des commissions.';

  @override
  String get kycBannerPending =>
      'Votre KYC est en cours de vérification. Vous pouvez ajouter des patients en attendant.';

  @override
  String get kycBannerRejected => 'KYC refusé';

  @override
  String kycBannerRejectedWithReason(String reason) {
    return 'KYC refusé : $reason';
  }

  @override
  String agentAccountStatusBanner(String status) {
    return 'Statut de votre compte d\'agence : $status.';
  }

  @override
  String get agentDashboardTitle => 'Tableau de bord agent';

  @override
  String agentDashboardGreeting(String name) {
    return 'Bonjour, $name';
  }

  @override
  String get agentKpiPatients => 'Patients';

  @override
  String get agentKpiActiveCases => 'Dossiers actifs';

  @override
  String get agentKpiConfirmedBookings => 'Réservations confirmées';

  @override
  String get agentKpiConversion => 'Conversion';

  @override
  String get agentQuickActions => 'Actions rapides';

  @override
  String get agentAddPatient => 'Ajouter un patient';

  @override
  String get agentRunScreening => 'Lancer une évaluation';

  @override
  String get agentCasesByMonth => 'Dossiers par mois';

  @override
  String get agentRecentCases => 'Dossiers récents';

  @override
  String get agentAllCases => 'Tous les dossiers';

  @override
  String get agentDashboardNoCases => 'Aucun dossier pour l\'instant';

  @override
  String get agentDashboardNoCasesHint =>
      'Ajoutez un patient, lancez une évaluation et demandez des devis aux hôpitaux.';

  @override
  String agentReferralCode(String code) {
    return 'Votre code agent $code';
  }

  @override
  String get agentCopyReferralLink => 'Copier le lien de parrainage';

  @override
  String get agentReferralLinkCopied => 'Lien de parrainage copié';

  @override
  String get agentPatientsTitle => 'Mes patients';

  @override
  String get agentPatientsSearchHint => 'Rechercher des patients';

  @override
  String get agentPatientsEmpty => 'Aucun patient pour l\'instant';

  @override
  String agentPatientsNoMatch(String query) {
    return 'Aucun patient ne correspond à « $query »';
  }

  @override
  String get agentPatientsEmptyHint =>
      'Ajoutez un patient pour lancer une évaluation et demander des devis hospitaliers pour lui.';

  @override
  String agentPatientAgeYears(int age) {
    String _temp0 = intl.Intl.pluralLogic(age, locale: localeName, other: '$age ans', one: '$age an');
    return '$_temp0';
  }

  @override
  String agentPatientCasesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count dossiers', one: '$count dossier');
    return '$_temp0';
  }

  @override
  String agentPatientScreeningsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count évaluations',
      one: '$count évaluation',
    );
    return '$_temp0';
  }

  @override
  String get agentPatientManaged => 'Géré';

  @override
  String get agentPatientUpdated => 'Patient mis à jour';

  @override
  String get agentPatientAdded => 'Patient ajouté';

  @override
  String get agentFormRequired => 'Obligatoire';

  @override
  String get agentEditPatient => 'Modifier le patient';

  @override
  String get agentPatientFirstName => 'Prénom';

  @override
  String get agentPatientLastName => 'Nom';

  @override
  String get agentPatientNationalityLabel => 'Nationalité (code ISO, ex. NG, AE, US)';

  @override
  String get agentPatientNationalityInvalid => 'Saisissez un code pays à 2 lettres';

  @override
  String get agentPatientEmailOptional => 'E-mail (facultatif)';

  @override
  String get agentPatientEmailHelper => 'Le patient reçoit une invitation à activer son compte.';

  @override
  String get agentPatientEmailInvalid => 'E-mail invalide';

  @override
  String get agentPatientPhoneOptional => 'Téléphone (facultatif)';

  @override
  String get agentPatientDobOptional => 'Date de naissance (facultatif)';

  @override
  String get agentPatientMedicalHistoryOptional => 'Antécédents médicaux (facultatif)';

  @override
  String get agentPatientTravelMedicalSection => 'Voyage et informations médicales';

  @override
  String get agentPatientPassportNumber => 'Numéro de passeport';

  @override
  String get agentPatientPassportKeepHelper => 'Laissez vide pour conserver le passeport enregistré.';

  @override
  String get agentPatientPassportExpiry => 'Expiration du passeport';

  @override
  String agentPatientPassportExpires(String date) {
    return 'Le passeport expire le $date';
  }

  @override
  String get agentPatientBloodGroup => 'Groupe sanguin';

  @override
  String get agentPatientAllergies => 'Allergies';

  @override
  String get agentSaveChanges => 'Enregistrer les modifications';

  @override
  String get agentRequestQuote => 'Demander un devis';

  @override
  String get agentPatientAccountActivated => 'Compte activé';

  @override
  String get agentPatientInvitePending => 'Géré par vous · invitation en attente';

  @override
  String get agentPatientNationality => 'Nationalité';

  @override
  String get agentPatientDob => 'Date de naissance';

  @override
  String agentPatientDobWithAge(String date, int age) {
    return '$date ($age ans)';
  }

  @override
  String get agentPatientGender => 'Sexe';

  @override
  String get agentPatientEmail => 'E-mail';

  @override
  String get agentPatientPhone => 'Téléphone';

  @override
  String get agentPatientPassport => 'Passeport';

  @override
  String agentPatientPassportExpShort(String date) {
    return 'exp. $date';
  }

  @override
  String get agentPatientMedicalHistory => 'Antécédents médicaux';

  @override
  String get agentScreeningsSection => 'Évaluations';

  @override
  String get agentScreeningsEmpty =>
      'Aucune évaluation pour l\'instant — lancez-en une pour obtenir des hôpitaux et des médecins proposés par l\'IA.';

  @override
  String get agentGeneralScreening => 'Évaluation générale';

  @override
  String get agentCasesTitle => 'Dossiers et devis';

  @override
  String get agentCompareQuotes => 'Comparer les devis';

  @override
  String get agentPatientCasesEmpty => 'Aucune demande auprès d\'un hôpital pour l\'instant.';

  @override
  String agentDocumentUploaded(String fileName) {
    return '$fileName importé';
  }

  @override
  String get agentDocumentsSection => 'Documents';

  @override
  String get agentDocumentUploading => 'Importation…';

  @override
  String get agentDocumentsEmpty =>
      'Importez les comptes rendus, les examens d\'imagerie et le passeport pour que les hôpitaux puissent établir un devis précis.';

  @override
  String get agentCasesEmpty => 'Aucun dossier';

  @override
  String get agentCasesEmptyHint => 'Ouvrez la fiche d\'un patient et demandez un devis à un hôpital.';

  @override
  String get agentAcceptQuoteTitle => 'Accepter ce devis ?';

  @override
  String agentAcceptQuoteMessage(String hospital, String total) {
    return '$hospital · $total. Les autres devis ouverts restent disponibles jusqu\'à la réservation.';
  }

  @override
  String get agentQuoteAccept => 'Accepter';

  @override
  String get agentQuoteAccepted => 'Devis accepté';

  @override
  String get agentRejectQuoteTitle => 'Refuser le devis';

  @override
  String get agentReasonOptional => 'Motif (facultatif)';

  @override
  String get agentQuoteReject => 'Refuser';

  @override
  String get agentQuoteRejected => 'Devis refusé';

  @override
  String get agentCancelCaseTitle => 'Annuler ce dossier ?';

  @override
  String get agentCancelCaseMessage => 'L\'hôpital sera informé.';

  @override
  String get agentCancelCase => 'Annuler le dossier';

  @override
  String get agentCaseCancelled => 'Dossier annulé';

  @override
  String get agentCaseFallbackTitle => 'Dossier';

  @override
  String get agentCaseCoordinator => 'Coordinateur';

  @override
  String get agentCaseOpenedLabel => 'Ouvert le';

  @override
  String get agentCaseNotes => 'Notes';

  @override
  String get agentBookTreatment => 'Réserver le traitement';

  @override
  String agentCaseBookingSummary(String date, String balance) {
    return 'Admission le $date · solde $balance';
  }

  @override
  String get agentQuotesSection => 'Devis';

  @override
  String get agentCompareHospitals => 'Comparer les hôpitaux';

  @override
  String agentQuotesWaiting(String hospital) {
    return 'En attente du devis détaillé de $hospital.';
  }

  @override
  String agentQuoteDated(String date) {
    return 'Devis · $date';
  }

  @override
  String get agentTimelineSection => 'Historique';

  @override
  String get agentCompareEmpty => 'Aucun devis à comparer pour l\'instant';

  @override
  String get agentCompareEmptyHint =>
      'Demandez des devis à plusieurs hôpitaux ; ils apparaissent ici dès que les hôpitaux répondent.';

  @override
  String get agentRequestAQuote => 'Demander un devis';

  @override
  String agentCompareBestPrice(String price, String hospital) {
    return 'Meilleur prix : $price chez $hospital.';
  }

  @override
  String agentCompareBestPriceSaves(String price, String hospital, String savings) {
    return 'Meilleur prix : $price chez $hospital — $savings d\'économie par rapport au devis le plus élevé.';
  }

  @override
  String get agentCompareMixedCurrencies =>
      'Les devis sont dans des devises différentes ; comparez les totaux avec prudence.';

  @override
  String get agentCompareRequestAnother => 'Solliciter un autre hôpital';

  @override
  String get agentCompareStay => 'Séjour';

  @override
  String get agentCompareValidUntil => 'Valable jusqu\'au';

  @override
  String agentCompareAcceptTitle(String hospital) {
    return 'Accepter $hospital ?';
  }

  @override
  String agentCompareAcceptMessage(String total) {
    return 'Total $total';
  }

  @override
  String get agentCompareBest => 'Meilleur';

  @override
  String agentCompareStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count jours', one: '$count jour');
    return '$_temp0';
  }

  @override
  String agentQuoteRequestedFrom(String hospital) {
    return 'Devis demandé à $hospital';
  }

  @override
  String get agentSearchHospitalsHint => 'Rechercher des hôpitaux';

  @override
  String get agentNoHospitalsFound => 'Aucun hôpital trouvé';

  @override
  String get agentNotesForHospitalOptional => 'Remarques pour l\'hôpital (facultatif)';

  @override
  String get agentSelectHospital => 'Sélectionnez un hôpital';

  @override
  String agentRequestQuoteFrom(String hospital) {
    return 'Demander un devis à $hospital';
  }

  @override
  String get agentBookingsTitle => 'Réservations et paiements';

  @override
  String get agentBookingsEmpty => 'Aucune réservation';

  @override
  String get agentBookingsEmptyHint =>
      'Acceptez le devis d\'un hôpital, puis réservez le traitement pour votre patient.';

  @override
  String agentBookingAdmissionShort(String date) {
    return 'admission le $date';
  }

  @override
  String agentBookingDueShort(String amount) {
    return 'reste dû $amount';
  }

  @override
  String get agentBookingPaidInFull => 'payé intégralement';

  @override
  String get agentTestPaymentCompleted => 'Paiement test effectué';

  @override
  String agentBankBeneficiary(String name) {
    return 'Bénéficiaire : $name';
  }

  @override
  String agentBankName(String bank) {
    return 'Banque : $bank';
  }

  @override
  String agentBankAccount(String account) {
    return 'Compte : $account';
  }

  @override
  String agentBankReference(String reference) {
    return 'Référence : $reference';
  }

  @override
  String agentBankAmount(String amount) {
    return 'Montant : $amount';
  }

  @override
  String get agentBankTransferDetailsTitle => 'Coordonnées du virement';

  @override
  String get agentCopyAndClose => 'Copier et fermer';

  @override
  String agentCancelBookingTitle(String bookingNumber) {
    return 'Annuler la réservation $bookingNumber ?';
  }

  @override
  String get agentReason => 'Motif';

  @override
  String get agentCancelBooking => 'Annuler la réservation';

  @override
  String get agentBookingCancelledRefund => 'Réservation annulée ; le remboursement suit la politique de l\'hôpital';

  @override
  String get agentBookingTreatment => 'Traitement';

  @override
  String get agentBookingAdmission => 'Admission';

  @override
  String get agentBookingDischarge => 'Sortie';

  @override
  String get agentBookingPaymentPlan => 'Plan de paiement';

  @override
  String agentBookingMonthlyInstallments(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count mensualités',
      one: '$count mensualité',
    );
    return '$_temp0';
  }

  @override
  String get agentPriceSummary => 'Récapitulatif du prix';

  @override
  String get agentPriceDiscount => 'Remise';

  @override
  String get agentPriceServiceFee => 'Frais de service';

  @override
  String get agentPriceTax => 'Taxes';

  @override
  String get agentPriceDeposit => 'Acompte';

  @override
  String get agentPricePaid => 'Payé';

  @override
  String get agentPriceRefunded => 'Remboursé';

  @override
  String get agentPriceBalanceDue => 'Solde dû';

  @override
  String get agentCollectPayment => 'Encaisser un paiement';

  @override
  String get agentPaymentsSection => 'Paiements';

  @override
  String get agentPaymentsEmpty => 'Aucun paiement pour l\'instant.';

  @override
  String get agentOpenCase => 'Ouvrir le dossier';

  @override
  String get agentInstallmentsSection => 'Échéances';

  @override
  String agentInstallmentDue(String date) {
    return 'Échéance le $date';
  }

  @override
  String get agentInstallmentCollect => 'Encaisser';

  @override
  String get agentCollectPaymentHint =>
      'Le montant est calculé par le serveur ; le patient peut aussi payer dans sa propre application.';

  @override
  String get agentCollectBankTransferOption => 'Virement bancaire (SWIFT / NEFT)';

  @override
  String agentCollectContinueAmount(String amount) {
    return 'Continuer · ~$amount';
  }

  @override
  String get agentAdmissionDate => 'Date d\'admission';

  @override
  String get agentChooseDate => 'Choisissez une date';

  @override
  String get agentPaymentSection => 'Paiement';

  @override
  String get agentPaymentOptionDeposit => 'Acompte';

  @override
  String get agentPaymentOptionFull => 'Total';

  @override
  String get agentPaymentOptionPlan => 'Échéancier';

  @override
  String agentInstallmentMonthsChip(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count mois', one: '$count mois');
    return '$_temp0';
  }

  @override
  String get agentInsuranceClaim => 'Le patient souhaite faire une demande de prise en charge par son assurance';

  @override
  String get agentCreateBooking => 'Créer la réservation';

  @override
  String get hpTabDashboard => 'Tableau de bord';

  @override
  String get hpTabEnquiries => 'Demandes';

  @override
  String get hpTabPatients => 'Patients';

  @override
  String get hpTabSettlements => 'Règlements';

  @override
  String get hpTabMore => 'Plus';

  @override
  String get hpSettlementsTitle => 'Règlements et versements';

  @override
  String get hpDashboardTitle => 'Tableau de bord de l’hôpital';

  @override
  String get hpNoHospitalTitle => 'Aucun hôpital associé';

  @override
  String get hpNoHospitalMessage => 'Demandez à l’administrateur de votre hôpital de vous inviter comme membre.';

  @override
  String get hpListingDraft =>
      'Votre fiche est un brouillon. Complétez le profil sur le portail web de l’hôpital et soumettez-le pour examen.';

  @override
  String get hpListingPendingReview => 'Votre fiche est en cours d’examen. Les patients la verront une fois approuvée.';

  @override
  String hpListingOtherStatus(String status) {
    return 'Statut de votre fiche : $status. Contactez le support Heal India Global.';
  }

  @override
  String get hpKpiOpenEnquiries => 'Demandes ouvertes';

  @override
  String get hpKpiQuotesAwaiting => 'Devis en attente du patient';

  @override
  String get hpKpiUpcomingAdmissions => 'Admissions à venir';

  @override
  String get hpKpiInTreatment => 'En traitement';

  @override
  String get hpRevenueThisMonth => 'Revenus ce mois-ci';

  @override
  String get hpRevenueByMonth => 'Revenus par mois';

  @override
  String get hpBookingsByMonth => 'Réservations par mois';

  @override
  String get hpRecentCases => 'Dossiers récents';

  @override
  String get hpNoEnquiriesYet => 'Aucune demande pour l’instant';

  @override
  String get hpEnquiriesFilterNew => 'Nouvelles';

  @override
  String get hpNoNewEnquiries => 'Aucune nouvelle demande';

  @override
  String get hpNoCases => 'Aucun dossier';

  @override
  String get hpEnquiriesEmptyMessage =>
      'Les patients et les agents envoient des demandes depuis les résultats de recherche.';

  @override
  String hpDeclineTitle(String caseNumber) {
    return 'Refuser $caseNumber ?';
  }

  @override
  String get hpDeclineReasonLabel => 'Motif communiqué au patient';

  @override
  String get hpDeclineButton => 'Refuser';

  @override
  String get hpEnquiryDeclined => 'Demande refusée';

  @override
  String get hpCaseFallbackTitle => 'Dossier';

  @override
  String get hpPrepareQuote => 'Préparer un devis';

  @override
  String get hpSendRevisedQuote => 'Envoyer un devis révisé';

  @override
  String get hpPatientFallback => 'Patient';

  @override
  String hpYearsShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ans',
      many: '$count ans',
      one: '$count an',
    );
    return '$_temp0';
  }

  @override
  String get hpInfoTreatment => 'Traitement';

  @override
  String get hpInfoDoctor => 'Médecin';

  @override
  String get hpInfoViaAgent => 'Via l’agent';

  @override
  String get hpInfoCoordinator => 'Coordinateur';

  @override
  String get hpInfoReceived => 'Reçue le';

  @override
  String hpCaseBookingLine(String bookingNumber, String date) {
    return 'Réservation $bookingNumber · admission le $date';
  }

  @override
  String get hpPatientNotes => 'Notes du patient';

  @override
  String get hpScreening => 'Pré-évaluation';

  @override
  String get hpInfoSpecialty => 'Spécialité';

  @override
  String get hpInfoBodyAreas => 'Zones du corps';

  @override
  String get hpInfoPain => 'Douleur';

  @override
  String get hpInfoSymptoms => 'Symptômes';

  @override
  String get hpInfoDuration => 'Durée';

  @override
  String get hpInfoUrgency => 'Urgence';

  @override
  String get hpMedicalDocuments => 'Documents médicaux';

  @override
  String get hpQuotesSection => 'Devis';

  @override
  String get hpNoQuoteYet => 'Aucun devis envoyé pour l’instant.';

  @override
  String hpQuoteSentOn(String date) {
    return 'Envoyé le $date';
  }

  @override
  String get hpQuoteProblemPlan => 'Décrivez le plan de traitement';

  @override
  String get hpQuoteProblemNoLines => 'Ajoutez au moins une ligne';

  @override
  String get hpQuoteProblemIncompleteLine => 'Chaque ligne doit avoir une description et un montant';

  @override
  String get hpQuoteProblemTooManyLines => '50 lignes au maximum';

  @override
  String get hpSendQuoteConfirmTitle => 'Envoyer le devis ?';

  @override
  String hpSendQuoteConfirmMessage(String total) {
    return 'Total $total — le patient est prévenu immédiatement.';
  }

  @override
  String get hpQuoteSent => 'Devis envoyé';

  @override
  String hpQuoteBuilderTitle(String caseNumber) {
    return 'Devis · $caseNumber';
  }

  @override
  String get hpTreatmentPlanLabel => 'Plan de traitement';

  @override
  String get hpCurrencyLabel => 'Devise';

  @override
  String get hpStayDaysLabel => 'Séjour (jours)';

  @override
  String hpValidUntil(String date) {
    return 'Valable jusqu’au $date';
  }

  @override
  String get hpLineItems => 'Lignes du devis';

  @override
  String get hpAddLineItem => 'Ajouter une ligne';

  @override
  String get hpTotal => 'Total';

  @override
  String get hpSendQuote => 'Envoyer le devis';

  @override
  String get hpCategoryLabel => 'Catégorie';

  @override
  String get hpDescriptionLabel => 'Description';

  @override
  String hpAmountLabel(String currency) {
    return 'Montant ($currency)';
  }

  @override
  String get hpAdmissionsTitle => 'Admissions';

  @override
  String get hpAdmissionsUpcoming => 'À venir';

  @override
  String get hpAdmissionsDischarged => 'Sortis';

  @override
  String get hpAdmissionsAwaitingPayment => 'En attente de paiement';

  @override
  String get hpAdmissionsCancelled => 'Annulées';

  @override
  String get hpAdmissionsEmptyUpcoming => 'Aucun patient à venir';

  @override
  String get hpAdmissionsEmptyInTreatment => 'Aucun patient en traitement';

  @override
  String get hpAdmissionsEmptyDischarged => 'Aucun patient sorti';

  @override
  String get hpAdmissionsEmptyAwaitingPayment => 'Aucun patient en attente de paiement';

  @override
  String get hpAdmissionsEmptyCancelled => 'Aucun patient annulé';

  @override
  String hpTileDischarged(String date) {
    return 'Sorti le $date';
  }

  @override
  String hpTileAdmitted(String date) {
    return 'Admis le $date';
  }

  @override
  String hpTileAdmission(String date) {
    return 'Admission le $date';
  }

  @override
  String hpTileInDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'dans $count jours',
      many: 'dans $count jours',
      one: 'dans $count jour',
    );
    return '$_temp0';
  }

  @override
  String get hpAdmitPatientTitle => 'Admettre le patient ?';

  @override
  String hpAdmitNamedTitle(String name) {
    return 'Admettre $name ?';
  }

  @override
  String get hpNoteOptional => 'Note (facultatif)';

  @override
  String get hpAdmitButton => 'Admettre';

  @override
  String get hpPatientAdmitted => 'Patient admis';

  @override
  String get hpDischargeDate => 'Date de sortie';

  @override
  String get hpDischargeNoteTitle => 'Note de synthèse de sortie';

  @override
  String get hpDischargeButton => 'Faire sortir';

  @override
  String get hpPatientDischarged => 'Patient sorti';

  @override
  String get hpAddedToItinerary => 'Ajouté à l’itinéraire';

  @override
  String get hpBookingFallbackTitle => 'Réservation';

  @override
  String get hpItinerary => 'Itinéraire';

  @override
  String get hpInfoAdmission => 'Admission';

  @override
  String get hpInfoAdmitted => 'Admis le';

  @override
  String get hpInfoDischarge => 'Sortie';

  @override
  String get hpInfoLengthOfStay => 'Durée du séjour';

  @override
  String hpDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count jours',
      many: '$count jours',
      one: '$count jour',
    );
    return '$_temp0';
  }

  @override
  String get hpInfoPaid => 'Payé';

  @override
  String get hpAdmitPatientButton => 'Admettre le patient';

  @override
  String get hpDischargePatientButton => 'Faire sortir le patient';

  @override
  String get hpAwaitingDeposit =>
      'En attente de l’acompte du patient. L’admission sera possible une fois la réservation confirmée.';

  @override
  String get hpOpenCase => 'Ouvrir le dossier';

  @override
  String get hpNoItineraryYet =>
      'Pas encore d’itinéraire — ajoutez les rendez-vous, le créneau opératoire, la prise en charge et les suivis.';

  @override
  String get hpItineraryMarkedDone => 'Marqué comme fait';

  @override
  String get hpItineraryCancelled => 'Annulé';

  @override
  String get hpItineraryRemoved => 'Supprimé';

  @override
  String get hpItineraryMarkDone => 'Marquer comme fait';

  @override
  String get hpAddToItinerary => 'Ajouter à l’itinéraire';

  @override
  String get hpItineraryTypeLabel => 'Type';

  @override
  String get hpItineraryTitleLabel => 'Titre (ex. consultation préopératoire)';

  @override
  String get hpItineraryDateTime => 'Date et heure';

  @override
  String get hpItineraryLocationLabel => 'Lieu';

  @override
  String get hpItineraryInstructionsLabel => 'Instructions pour le patient (facultatif)';

  @override
  String get hpItineraries => 'Itinéraires';

  @override
  String get hpNobodyAdmitted => 'Aucun patient admis pour le moment.';

  @override
  String get hpUpcomingArrivals => 'Arrivées à venir';

  @override
  String get hpNoConfirmedBookings => 'Aucune réservation confirmée.';

  @override
  String get hpMoreItinerariesSubtitle => 'Rendez-vous, créneaux opératoires, prises en charge';

  @override
  String get hpVisaLettersTitle => 'Lettres d’invitation pour visa';

  @override
  String get hpMoreVisasSubtitle => 'Demandes de visa médical des patients';

  @override
  String get hpDoctorsTitle => 'Médecins';

  @override
  String get hpMoreDoctorsSubtitle => 'Vos spécialistes et leurs profils';

  @override
  String get hpMorePriceListSubtitle => 'Actes, fourchettes de prix et forfaits';

  @override
  String get hpActingFor => 'Agir pour';

  @override
  String get hpWebPortalNote =>
      'Les modifications du profil, des membres, des disponibilités et des prix se font sur le portail web de l’hôpital.';

  @override
  String get hpNoVisaRequests => 'Aucune demande de visa';

  @override
  String get hpInvitationLetterNeeded => 'Lettre d’invitation requise';

  @override
  String get hpVisaRequestFallback => 'Demande de visa';

  @override
  String get hpNoInvitationLetterYet => 'Pas encore de lettre d’invitation';

  @override
  String get hpInvitationLetterUploaded => 'Lettre d’invitation : téléversée';

  @override
  String hpInvitationLetterNamed(String fileName) {
    return 'Lettre d’invitation : $fileName';
  }

  @override
  String get hpReplace => 'Remplacer';

  @override
  String get hpStatusLabel => 'Statut';

  @override
  String get hpEvisaReferenceLabel => 'Référence de la demande d’e-Visa';

  @override
  String get hpNotesLabel => 'Notes';

  @override
  String get hpNoDoctorsListed => 'Aucun médecin répertorié';

  @override
  String get hpTeleconsultBadge => 'Téléconsultation';

  @override
  String hpConsultationFee(String fee) {
    return 'Tarif $fee';
  }

  @override
  String get priceListTitle => 'Liste de prix';

  @override
  String get priceListEmpty => 'Aucun acte tarifé pour l’instant';

  @override
  String priceListStayDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'séjour de $count jours',
      many: 'séjour de $count jours',
      one: 'séjour de $count jour',
    );
    return '$_temp0';
  }

  @override
  String priceListSuccessRate(String rate) {
    return '$rate % de réussite';
  }

  @override
  String get reportAnalysisTitle => 'Votre rapport';

  @override
  String get reportConfirmedSnack => 'Rapport confirmé.';

  @override
  String reportMaxPages(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Un rapport peut comporter jusqu’à $max pages.',
      many: 'Un rapport peut comporter jusqu’à $max pages.',
      one: 'Un rapport peut comporter jusqu’à $max page.',
    );
    return '$_temp0';
  }

  @override
  String reportFileTooLarge(String fileName) {
    return '$fileName est trop volumineux (20 Mo max.).';
  }

  @override
  String get reportPermissionNeeded =>
      'Autorisez l’accès à l’appareil photo / aux photos dans les réglages de votre téléphone pour ajouter des pages.';

  @override
  String reportUploadingPage(int current, int total) {
    return 'Envoi de la page $current sur $total…';
  }

  @override
  String get reportSendingToAi => 'Envoi à l’IA…';

  @override
  String get reportReviewTitle => 'Vérifiez votre rapport';

  @override
  String get reportCaptureTitle => 'Ajouter un rapport médical';

  @override
  String get reportCaptureIntro =>
      'Photographiez chaque page d’un rapport papier, choisissez des photos ou téléversez un PDF.';

  @override
  String get reportTakePhoto => 'Prendre une photo';

  @override
  String get reportChooseFromGallery => 'Choisir dans la galerie';

  @override
  String get reportUploadPdf => 'Téléverser un PDF';

  @override
  String reportPagesCount(int count, int max) {
    return 'Pages ($count/$max)';
  }

  @override
  String get reportNoPagesTip =>
      'Aucune page pour l’instant. Conseil : posez la page à plat, sous une bonne lumière, et remplissez le cadre.';

  @override
  String get reportKindQuestion => 'De quel type de document s’agit-il ?';

  @override
  String get reportReadWithAi => 'Lire mon rapport avec l’IA';

  @override
  String get reportAiConsentText =>
      'Notre assistant IA lit les pages et liste vos résultats d’analyses, vos diagnostics et vos médicaments. Vous vérifiez et corrigez tout avant toute utilisation, et ces informations ne sont partagées qu’avec les hôpitaux que vous choisissez. Vous pouvez désactiver cette option et simplement téléverser le rapport.';

  @override
  String get reportUploadButton => 'Téléverser le rapport';

  @override
  String reportPageNumber(int number) {
    return 'Page $number';
  }

  @override
  String reportRemovePage(int number) {
    return 'Retirer la page $number';
  }

  @override
  String get reportDragToReorder => 'Faites glisser pour réorganiser';

  @override
  String get reportAiEntryTooltip => 'Lire des rapports avec l’IA';

  @override
  String get reportSheetTitle => 'Vos rapports lus par l’IA';

  @override
  String get reportSheetIntro =>
      'Photographiez un rapport papier ou choisissez un PDF. Vous vérifiez et confirmez tout avant toute utilisation.';

  @override
  String get reportScanButton => 'Scanner un rapport';

  @override
  String get reportNoReadings => 'Aucune lecture par l’IA pour l’instant.';

  @override
  String get reportMedicalReportFallback => 'Rapport médical';

  @override
  String get reportImportant => 'Important';

  @override
  String get reportCriticalValues => 'Valeurs critiques';

  @override
  String get reportSummary => 'Résumé';

  @override
  String get reportKeyFindings => 'Points clés';

  @override
  String get reportLabValues => 'Résultats d’analyses';

  @override
  String get reportMedications => 'Médicaments';

  @override
  String get reportDiagnosesMentioned => 'Diagnostics mentionnés';

  @override
  String get reportProceduresMentioned => 'Actes mentionnés';

  @override
  String get reportRecommendations => 'Recommandations';

  @override
  String get reportAiDisclaimer => 'Généré par IA — vérifiez toujours auprès de votre médecin.';

  @override
  String get reportStatusConfirmed => 'Confirmé';

  @override
  String get reportStatusDiscarded => 'Écarté';

  @override
  String get reportStatusReading => 'Lecture…';

  @override
  String get reportStatusNotRead => 'Non lu';

  @override
  String get reportStatusNeedsReview => 'À vérifier';

  @override
  String get reportLabTest => 'Analyse';

  @override
  String get reportLabResult => 'Résultat';

  @override
  String get reportLabRange => 'Norme';

  @override
  String get reportEdited => 'Modifié';

  @override
  String get reportDateLabel => 'Date du rapport';

  @override
  String get reportCriticalValuesInReport => 'Valeurs critiques dans ce rapport';

  @override
  String get reportAboutSection => 'À propos de ce rapport';

  @override
  String get reportDocTypeLabel => 'Type de document';

  @override
  String get reportClearDate => 'Effacer la date';

  @override
  String get reportDateNotStated => 'Non indiquée';

  @override
  String get reportFacilityLabel => 'Hôpital / laboratoire';

  @override
  String get reportSummaryHint => 'Ce que dit le rapport, en termes simples';

  @override
  String get findingAdd => 'Ajouter un point';

  @override
  String findingRemove(int number) {
    return 'Retirer le point $number';
  }

  @override
  String get findingLabel => 'Point clé';

  @override
  String get labAddValue => 'Ajouter une valeur';

  @override
  String labRemoveValue(int number) {
    return 'Retirer la valeur d’analyse $number';
  }

  @override
  String get labValueLabel => 'Valeur';

  @override
  String get labUnitLabel => 'Unité';

  @override
  String get labReferenceRangeLabel => 'Valeurs de référence';

  @override
  String get reportAddMedication => 'Ajouter un médicament';

  @override
  String reportRemoveMedication(int number) {
    return 'Retirer le médicament $number';
  }

  @override
  String get reportMedicineLabel => 'Médicament';

  @override
  String get reportDoseLabel => 'Dose';

  @override
  String get reportFrequencyLabel => 'Fréquence';

  @override
  String get reportAddDiagnosis => 'Ajouter un diagnostic';

  @override
  String get reportAddProcedure => 'Ajouter un acte';

  @override
  String get reportAddRecommendation => 'Ajouter une recommandation';

  @override
  String get reportNone => 'Aucun';
}
