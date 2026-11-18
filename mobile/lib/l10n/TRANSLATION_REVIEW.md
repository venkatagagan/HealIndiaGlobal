# Translations that need a native medical / legal reviewer

All `ar`, `fr`, `bn` and `ru` strings were machine-assisted translations written for plain, careful wording.
Before a language is switched on for patients, a native speaker with medical or legal background should
review the keys below in `app_<locale>.arb` (or correct them live through the admin translation overrides,
which win over the shipped text without an app release).

`*` stands for every key with that prefix / pattern (for example `deleteAccountBlocker*`).

## Emergency and SOS (patient safety — highest priority)

| Keys | Why |
|---|---|
| `sosConfirmTitle`, `sosConfirmBody`, `sosCallNumber` | What the SOS button does; must not promise more than it does |
| `sosResultSentTitle`, `sosResultSentBody`, `sosResultDangerNote` | "Help is on the way" must not imply an ambulance is coming |
| `sosResultFailedTitle`, `sosResultFailedBody` | Failure instructions (call local emergency number) |
| `sosShareLocation*`, `sosLocation*`, `supportLocationMarked`, `coreLocation*` | Location sharing consent and privacy promise |
| `emergencyTitle`, `emergencyBody`, `emergencyWarningSigns`, `emergencyCallButton`, `emergencyDialNow` | Red-flag symptom guidance from screening |
| `emergencyAckViewResults`, `emergencyAckContinueRisk`, `emergencyNotDiagnosis` | Acknowledging an emergency risk |
| `voiceEmergencyBanner`, `voiceEmergencyAck` | Emergency warning during voice intake |
| `emergencyContactsIntro` | "Call the local emergency number first" |

## AI disclaimers and AI consent

| Keys | Why |
|---|---|
| `consentAiTitle`, `consentAiPointData`, `consentAiPointPrivacy`, `consentAiPointNotDiagnosis`, `consentAiAgree`, `consentAiDecline` | Consent to AI processing of health data |
| `screeningProcessingHelpBody`, `coreScreeningAnalysisSlow`, `homeScreeningEyebrow`, `onboardingStepMatchSubtitle` | AI screening / matching wording |
| `voiceConsentText`, `voiceConsentRequired`, `voiceAiDisclaimer` | Voice recording consent and "not a diagnosis" |
| `reportAiDisclaimer`, `reportAiConsentText`, `reportReadWithAi`, `reportSheetIntro` | AI reading of medical reports |
| `reportImportant`, `reportCriticalValues`, `reportCriticalValuesInReport`, `reportDiagnosesMentioned` | Must read as "found in the report", never as an app diagnosis |
| `reportKeyFindings`, `findingLabel`, `labReferenceRangeLabel`, `reportLabRange` | Clinical terminology |
| `agentScreeningsEmpty` | AI-matching claim |

## Clinical wording

| Keys | Why |
|---|---|
| `painNone`, `painMild`, `painModerate`, `painSevere`, `painWorst`, `screeningSeverity`, `screeningValidateSymptoms` | Pain / severity scale |
| `enumSeverityLevel*`, `enumUrgency*`, `enumLikelihood*`, `enumLabFlag*`, `enumFindingSignificance*`, `enumReportDocType*` | Clinical status labels |
| `costCategory*Hint` | Descriptions of medical cost items |
| `bookProfession*` | Medical specialist titles |
| `preArrivalDisclaimer`, `preArrivalMedicalMedicines`, `preArrivalMedicalAllergies` | Medicines / allergies advice before travel |
| `agentPatientMedicalHistory`, `agentPatientMedicalHistoryOptional` | Medical history (ru "Анамнез") |

## Privacy, consent to share, account deletion

| Keys | Why |
|---|---|
| `quoteConsent`, `consultationConsent`, `consultationConsentRequired` | Consent to share data with hospitals |
| `consultationGuestUpgrade`, `accountExitGuestBody` | Data retention / data loss statements |
| `deleteAccountBody`, `deleteAccountGuestBody`, `deleteAccountRetention`, `deleteAccountRequestSent`, `deleteAccountPasswordHelper`, `deleteAccountBlocker*` | Permanent deletion and legal data retention |
| `accountYourDataSubtitle`, `editProfileMedicalInfoSubtitle` | Encryption / sharing promises about medical data |
| `editProfilePassportHelperNew`, `companionPassportStoredEncrypted` | Passport stored encrypted |
| `onboardingSecurityFooter`, `onboardingSecurityBadge`, `onboardingStepShareSubtitle` | Data-protection claims |
| `coreInvalidCredentials` | Must stay generic (must not reveal whether an account exists) |
| `enumConsentKind*` | Consent type names |

## Payments, refunds, prices and commissions

| Keys | Why |
|---|---|
| `paymentSecureBody`, `paymentChargedInCurrency`, `paymentPlansOnBooking`, `paymentPlansCurrentOption`, `paymentDue*`, `bookInstallmentPerMonth`, `bookPayDepositSubtitle`, `bookingValidUntil`, `caseNextBalanceDue` | Amounts, deposits, instalments, quote validity |
| `paymentResultPendingBody`, `paymentResultFailureBody`, `bankTransferInstructions`, `bankProofReceived` | Payment outcome ("no money was taken") and bank transfer |
| `paymentRefundOriginalMethod`, `caseCancelBookingPolicy`, `caseBookingCancelled`, `refundPolicyGeneral`, `refundPolicyLocked`, `refundTierLessThanDays`, `refundTierDaysOrMore`, `refundNone`, `refundPercent`, `agentBookingCancelledRefund` | Refund and cancellation terms |
| `caseAcceptQuoteBody`, `agentAcceptQuoteMessage`, `hpSendQuoteConfirmMessage`, `flightRequestSubtitle`, `staySheetSubtitle`, `travelServiceSubtitle` | Commitments made when accepting / requesting |
| `consultationPayAfterAccept`, `quoteRequestedSnack` | Payment timing and reply-time promises |
| `hospitalDetailPricesIndicative`, `matchDetailFinalPriceNote`, `costDisclaimer`, `catalogApproxPriceTooltip`, `settingsCurrencySubtitle` | Price estimate disclaimers |
| `bookingInsuranceClaim`, `paymentInsuranceRequestedHelp`, `agentInsuranceClaim` | Insurance claims |
| `coreBiometricConfirmReason`, `coreBiometricPay*` | Payment confirmation |
| `agentCollectPaymentHint`, `agentCollectContinueAmount`, `agentBankBeneficiary`, `agentBankReference`, `agentPriceDeposit`, `agentPaymentOptionDeposit` | Agent-collected payments, bank fields |
| `payeeItemGst`, `payeeItemTds`, `payeeItemGrossFee`, `payeeStatusReversed`, `payeeStatusNeedsReconciliation`, `payeeOutstanding`, `payeeKpiEligible`, `payeeStatusEligible` | Indian tax and settlement terms |
| `commissionKpiPending`, `commissionKpiPaid`, `commissionRateBadge` | Commission terms |
| `hpAwaitingDeposit`, `hpInfoPaid`, `enumPaymentPurpose*`, `enumOrderStatus*`, `enumRefundStatus*`, `enumInstallmentStatus*` | Payment statuses |

## Visa, identity and legal documents

| Keys | Why |
|---|---|
| `profilePassportValidityWarning`, `companionsEmptyMessage`, `companionFormIntro` | e-Medical / attendant visa rules |
| `hpEvisaReferenceLabel`, `hpInvitationLetter*`, `enumVisaType*`, `enumVisaStatus*` | Visa documents |
| `kycBannerNotSubmitted`, `kycBannerPending`, `kycBannerRejected`, `kycBannerRejectedWithReason` | Identity verification (KYC) |
| `hpDeclineReasonLabel` | Text shown to the patient |

## Marketing and accreditation claims (honesty, PLAN §9)

| Keys | Why |
|---|---|
| `onboardingImpactHeadline`, `onboardingImpactStat*`, `onboardingTrustWaitTitle`, `onboardingTrustCertified*`, `onboardingBadge*Description`, `onboardingAccreditationsCaption` | Savings and accreditation claims |
| `onboardingTestimonialQuote`, `onboardingTestimonialDisclaimer` | Example testimonial must stay marked as an illustration |

## Phase 1: cost, aftercare, guardian consent, guest call, visa guide (added 2026-11)

| Keys | Why |
|---|---|
| `aftercareUrgentTitle`, `aftercareUrgentBody`, `aftercareUrgentSos`, `aftercareEmergencyNote`, `guestNotEmergency` | Red-flag check-in answers and emergency advice; must not imply an ambulance is coming (highest priority) |
| `aftercareFlag*`, `aftercareQFever`, `aftercareQBreathless`, `aftercareQWound`, `aftercareQWoundHint`, `aftercareQMeds`, `aftercareMeds*`, `aftercarePainValue`, `aftercareCheckinIntro`, `aftercareHospitalCheckinsHint` | Recovery check-in questions (clinical wording) |
| `guardianTitle`, `guardianIntro`, `guardianDeclaration`, `guardianDeclarationRequired`, `guardianRelationship*`, `guardianVerify*`, `guardianAfterSubmit`, `guardianConsentRequiredMessage`, `guardianStatus*`, `authAgeMinor` | Consent of a parent / legal guardian for a minor (legal declaration) |
| `costHomeSave`, `costHomeOftenUnavailable`, `costHomeWaitAtHome`, `costSourceIntro`, `costSourceDisclaimer`, `costSourceConfidence`, `costConfidence*`, `priceApproxSemantics`, `priceOriginalAmount`, `quoteGroupCurrencyNote` | Price and saving claims (legal display rule: estimates, never a quote) |
| `trustRegistrationVerified*`, `trustAccreditation*`, `reviewVerifiedPatient*` | Verification claims about doctors, hospitals and reviewers |
| `reviewFormModerationNote`, `myReviewsHidden*`, `reportSheetIntro*`, `privacyAccess*`, `privacyRole*`, `privacyAction*`, `privacyRecord*`, `pushPromptBody` | Privacy promises and moderation |
| `guestFreeIntro`, `guestAlreadyUsed`, `guestAiLimitReached`, `aiSummaryDisclaimer`, `reportViewDiscardBody`, `reportViewCheckIntro`, `matchesListEmergency` | "Not a diagnosis", AI and free-call limits |
| `visaGuideRoute*`, `visaGuideProcessing`, `visaGuideAttendants`, `visaGuideDefaultNote`, `visaGuideDisclaimer`, `invite*` | e-Visa / embassy visa rules and the hospital invitation letter |
| `quickQuoteSlaNote`, `quoteOverduePatient`, `quickQuoteConsentMany` | Reply-time promise (48 h) and consent to share reports with several hospitals |

Notes: plural forms were written for every category (ar zero/one/two/few/many/other where natural, ru one/few/many/other);
`privacyAccessLine` assembles who / role / action / record and reads mechanically in fr and ru — a full-sentence rewrite
per action may read better.

## Data rights, sharing consents and moderation (added 2026-11-18)

| Keys | Why |
|---|---|
| `privacyRequestFormIntro`, `privacyRequestKind*`, `privacyRequestStatus*`, `privacyRequestDueBy`, `privacyRequestSent`, `privacyRequestNoAnswerYet` | DPDP / GDPR data-rights requests and grievances (legal names of the rights, reply deadline) |
| `privacyNomineeIntro`, `privacyNomineeRemoveConfirm` | Nomination under DPDP Act s.14 (legal wording) |
| `privacyShareHospitals*`, `privacyShareAgent*` | Granting / withdrawing consent to share health records with hospitals and agents; consequences of withdrawal |
| `privacyContactTitle`, `privacyContactGrievance`, `privacyContactDpo`, `privacyContactResponse`, `privacyContactBoard` | Grievance Officer, Data Protection Officer, statutory reply time, escalation to the Data Protection Board of India |
| `reportSheetIntroReview` | Moderation promise (reporter not disclosed) |
| `orgSuspendedBodyAgent`, `orgSuspendedBodyHospital` | Account suspension notice to partners |
| `consultBookIntro`, `consultFeePayNote`, `consultPayFailed`, `consultPayPending`, `consultCancelConfirmBody` | Video consultation fee: when it is paid, "no money was taken", what happens to a paid fee on cancellation |
| `consultReminderScheduled`, `consultReminderPending`, `consultJoinHint`, `consultTimesLocal` | Appointment reminders and time-zone wording for a medical call |
## Insurance, pay-later partners and instalments (CG-18, added 2026-11-18)

Legal review of the English text is still pending; the translations follow it word for word.

| Keys | Why |
|---|---|
| `insuranceDisclaimer`, `insuranceBookCardBody` | We do not sell insurance and are not an insurance intermediary; the insurer sets cover, price and terms (shown on every insurance surface) |
| `financingDisclaimer`, `financingPartnerDecides`, `financingFormIntro` | We do not lend money or make credit decisions; the partner decides on its own terms (shown on every pay-later surface) |
| `insuranceConsentText`, `insuranceConsentRequired`, `insuranceFormIntro`, `insuranceWithdrawBody`, `insuranceMessageHint` | Consent to share contact details with a named partner, "no medical information is shared", withdrawing that consent |
| `financingInstallmentsSubtitle`, `financingInstallmentsUnavailable`, `financingInterestFreeNote`, `financingScheduleEstimate`, `financingInstallmentsPastTreatment`, `financingEmptyBody` | Interest-free pre-payment plan paid off before admission (Google Play financial features declaration) |
| `insurancePriceIndicative`, `insurancePriceOnRequest`, `insuranceCategory*`, `insuranceErrorCountryNotEligible` | Indicative partner prices (not a quote) and insurance product names |

## Politically sensitive names

`countryTW`, `countryPS`, `countryIL`, `countryHK`, `countryCD` — check the naming conventions expected in each market.

## Language-specific notes from the translators

- **ar**: swiping right-to-left in the symptom deck means "yes" (the deck is mirrored); `screeningStep2Help` and
  `symptomCardSemantics` say so. Plural `zero` forms say "no results / no reviews" where English shows "0 …".
- **fr / ru / bn**: country names are inserted after a colon or in parentheses (e.g. "Лечение: {country}") to avoid
  wrong grammatical case; a native reviewer may prefer full sentences.
- **ru**: `paymentWalletFallback` ("кошельке") only fits the sentence "Завершите оплату в {wallet}".
- Keys that insert a lower-cased status label into a sentence (`hpListingOtherStatus` and some `{status}` /
  `{service}` keys in booking and trips) read mechanically; consider rephrasing.

## WhatsApp updates and discharge summaries (added 2026-11)

| Keys | Why |
|---|---|
| `dischargeRedFlagsTitle`, `dischargeRedFlagsEmergency`, `dischargeHpRedFlagsLabel`, `dischargeHpRedFlagsHint` | Warning signs after discharge and emergency advice; must say "get medical help straight away" and must not imply an ambulance is coming (highest priority) |
| `dischargeSectionDiagnosis`, `dischargeSectionHospitalCourse`, `dischargeSectionFollowUp`, `dischargeSectionAllergies`, `dischargeSectionInvestigations`, `dischargeSectionProcedure`, `dischargeProcedure*`, `dischargeAdmissionDate`, `dischargeDischargeDate`, `dischargeDoctor*`, `dischargeHpDiagnosisCode`, `dischargeHpDoctorRegistration`, `dischargeTitle`, `dischargeListTitle` | Clinical document terminology (ru "Выписной эпикриз", fr "Compte rendu de sortie", ICD-10 = МКБ-10 / CIM-10) |
| `dischargeSectionMedications`, `dischargeNoMedications`, `dischargeMedicationDuration`, `dischargeMedicationOngoing`, `dischargeHpMed*`, `dischargeReminderUntil`, `dischargeReminders*` | Medicines, dose, frequency, route and duration; reminders must defer to the doctor's instructions |
| `dischargeShareConsent`, `dischargeShareConsentRequired`, `dischargeShareIntro`, `dischargeShareDocumentsHint`, `dischargeShareLinkOnce`, `dischargeShareRevokeBody` | Consent to share medical records with a doctor without an account; access recording and link expiry (legal) |
| `dischargeConfidential`, `dischargeFhirHint` | Confidentiality of medical information; HL7 FHIR export |
| `dischargeHpFinalizeBody`, `dischargeHpNewVersionBody`, `dischargeHpLockedNote`, `dischargeHpDiscardBody` | Finalized summaries are locked; edits create a new version |
| `whatsappPrivacyNote`, `whatsappStopNote`, `whatsappIntro`, `whatsappTurnOffConfirmBody` | Promise that WhatsApp never carries medical details; opt-out by replying STOP (the keyword stays in Latin capitals in every language) |
| `whatsappErrorInvalidCode`, `dischargeShareViews`, `dischargeShareDays` | Plural forms (ar `=2`/`few`, ru `one`/`few`/`many`) |
## Referral programme and agent CRM (mobile, added 2026-11)

| Keys | Why |
|---|---|
| `referralPayConfirmTitle`, `referralPayConfirmBody`, `referralPayConfirmButton`, `referralPayUseCreditTitle`, `referralPayUseCreditBody`, `referralPayApplyButton`, `referralPayApplied`, `referralPayCoversAll`, `referralPayRemaining` | Spending referral credit on a booking payment; the refund promise ("credit is returned to you") must stay exact |
| `referralPayCreditChanged`, `referralPayInProgress`, `referralPayNotApplicable`, `referralPayNotForInstallments`, `referralPayAmountTooSmall` | Why credit cannot be applied (money) |
| `referralHeroBoth`, `referralHeroReferrerOnly`, `referralHeroRefereeOnly`, `referralStep3`, `referralTermsValidity`, `referralTermsMaxPerYear`, `referralTermsNoCash` | Reward promises and programme terms (when the reward is earned, validity, yearly cap, no cash value) |
| `referralCreditTitle`, `referralCreditBase`, `referralCreditExpiringSoon`, `referralCreditExpires`, `referralCreditUseHint`, `referralCreditKind*`, `referralMovement*`, `referralStatus*`, `referralFriendReward` | Credit balance, expiry and ledger wording |
| `referralShareMessage`, `referralShareSubject` | Text the patient sends to friends in their name |
| `referralCodeFieldLabel`, `referralCodeFieldHelper`, `referralCodeInvalid` | Sign-up referral code |
| `enumPaymentGatewayPlatformCredit`, `enumPaymentMethod*` | Payment method names (enum keys follow the `enum<Type><Value>` convention) |
| `crmConsentAttest`, `crmConsentAttestHint`, `crmConsentShare`, `crmConsentMethod*`, `crmConsentRequired`, `crmConvertIntro` | Agent's legal attestation that the patient consented (terms, privacy, sharing records with hospitals) |
| `crmFormInterestHelper` | Tells agents not to store medical history in the CRM (data minimisation) |
| `crmErrorEmailTaken`, `crmErrorAgentNotActive`, `crmErrorLeadConverted` | Account / approval errors |

Notes: `crmPipelineOpen`, `crmFollowUpsDueToday`, `crmFollowUpsOverdue`, `referralTermsValidity` and `referralTermsMaxPerYear`
use ICU plurals (ar `=1/=2/few/other`, ru `one/few/many/other`). "Lead" is rendered as ar "عميل محتمل", fr "prospect",
bn "লিড", ru "лид"; a native reviewer may prefer another sales term. `crmTimelineStatusChange` uses an arrow in fr / ru
and words in ar / bn.
