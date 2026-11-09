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
