# Translation review

Machine-assisted translations that a fluent, preferably medically literate, reviewer should check before a
language is switched on in production. Admins can fix any string without a deploy: Admin portal ->
Translations (overrides win over the shipped text; app `server` covers everything below).

## Server (emails, notifications, API errors)

Source: `backend/app/i18n/en.json` (159 keys). Translations: `ar.json`, `fr.json`, `bn.json`, `ru.json`
(same keys and `{placeholders}`; enforced by `tests/modules/test_i18n.py`). "Heal India Global" and SOS / KYC /
UTR / AI / 24/7 are kept as-is.

What the keys cover:

- `email.*` - verify email, password reset, password changed, invitations, hospital member added, shared
  layout (greeting, footer, button fallback). Emails go out in the recipient's `preferred_language` when that
  language is enabled, otherwise English. Arabic emails render with `<html lang="ar" dir="rtl">`.
- `notifications.*` - every in-app notification (and its email) sent by `messaging/handlers.py`.
- `errors.<code>` - translated `message` for common API errors when the request language is not English;
  `code` never changes and the English text stays available as `message_en`.
- `common.*` - fragments joined into notification bodies ("Reason: ...", "Note: ...").

Review priorities:

1. `notifications.screening.emergency_title` / `emergency_body` (must be unambiguous: contact local emergency
   services / nearest hospital now).
2. Money, refund and payout texts (`payment_*`, `refund_processed.*`, `payout_*`, `booking_cancelled.refund`).
3. `errors.*` (short, neutral).

### Arabic (ar)

- Register: polite plural (أنتم / ـكم) throughout, which is formal and avoids choosing a gender.
- `email.common.greeting`: "مرحبًا {name}،" - neutral; عزيزي/عزيزتي avoided because they need a gender.
- `email.invite.body*`, `email.hospital_member_added.body`, `case_created.body`, `quote_sent.body`,
  `quote_accepted.body`, `sos_created.body`: rephrased ("تلقّيتم دعوة من {inviter}", "من قِبل {x}") so the verb does
  not have to agree with the gender of the inserted name.
- `hospital_approved.title`: "أصبحت صفحة {hospital} متاحة الآن" ("the {hospital} page is now available").
- `sos_updated.acknowledged_body_named`: "قيد المتابعة لدى {name}" avoids a gendered verb.
- `verify.expiry` / `invite.expiry` / `reset.expiry`: singular noun after the number ("{hours} ساعة") - correct
  for 24 / 72 / 60, not strictly for 3-10.
- Screening is "تقييم أولي" (preliminary assessment) rather than "فحص" (suggests a physical exam).
- `booking_completed.hospital_body`: "hold period" -> "فترة الانتظار المحددة".
- `user_registered.body_patient`: "بالذكاء الاصطناعي (AI)".

### French (fr)

- `common.the_patient` = "le patient"; sentences built to avoid "de le patient" ("pour {patient}",
  "envoyée par {patient}").
- `quote_sent.title`, `message_created.title`: "envoyé par {x}" instead of "de {x}" (elision before vowels).
- `user_registered.body_patient`: "par intelligence artificielle (AI)" - French normally writes "IA"; decide.
- `hospital_member_added.body`: inclusive "ajouté(e)"; invite heading rephrased ("Vous avez une invitation").
- `quote_sent.valid_until`: "Date limite de validité : {date}" (works with ISO dates).
- Vocabulary: screening = "pré-évaluation", case = "dossier", quote = "devis", payout = "versement",
  hold period = "période de retenue" (finance to confirm).
- Typography: normal space before ":" and "?" (a non-breaking space would be stricter); "24/7" kept.

### Bengali (bn)

- `email.common.greeting`: "প্রিয় {name}," (religion-neutral); `greeting_anonymous`: "প্রিয় ব্যবহারকারী,".
- Case endings are hyphenated onto placeholders ("{hospital}-এ", "{patient}-এর"); with the fallback words this
  gives e.g. "হাসপাতাল-এ" - readable, not the usual spelling.
- Loanwords kept: কোটেশন (quote), পেআউট (payout), বুকিং, কেস, স্ক্রিনিং, সাপোর্ট টিম, হোল্ড পিরিয়ড.
- `refund_processed.timing` uses Bengali digits (৫–১০); inserted values (amounts, dates) stay in Western digits.
- Honorific verb for a person inviting ("জানিয়েছেন"); `invite.subject_agent` uses "জানিয়েছে" (an organisation).

### Russian (ru)

- Capitalised "Вы/Ваш" (formal letter style); many modern UIs use lowercase "вы" - decide.
- `common.the_hospital` = "клиника"; the emergency text says "ближайшую больницу" (natural in an emergency).
- Name placeholders always in the nominative via "Label: {x}" forms ("Клиника: {hospital}", "Пациент: {patient}",
  "Сигнал SOS: {patient}", "Новое сообщение: {sender}").
- `hospital_member_added.body`: "Пригласил(а): {inviter}"; invitations use present tense "приглашает" to avoid
  the gendered past tense.
- Expiry texts use "{hours} ч." / "{minutes} мин." to avoid number agreement.
- Quote = "предложение" / "расчёт стоимости лечения", case = "обращение", hold period = "период удержания".
- `user_registered.body_patient`: "AI-скрининг" - Russian normally says "ИИ"; decide.

### Not translated on the server (by design)

- Free text written by people (messages, rejection reasons, notes) and data values (names, amounts, dates)
  are inserted unchanged.
- Voice/document-AI user messages stored on records (e.g. "No speech was recognised ...") and other
  `AppError` messages without an `errors.<code>` key stay English (the client can translate by `code`).
- Notification handlers added after this change in `messaging/handlers.py` still pass English `title`/`body`
  strings until they are converted to `title_key`/`body_key`.

## Web portals and website

All keys below exist in `ar`, `fr`, `bn` and `ru`. Review them in the admin portal (Translations, filter by
app) or in the catalog files. Priority order: emergency, AI disclaimers / consent, payment and refunds,
privacy and account deletion, everything medical.

### Shared web UI (`web/packages/shared/src/locales/<lng>/`; app = the portal that shows it)

- Emergency / care gates: `common:careGates.emergency.*`, `common:careGates.upgrade.body`.
- AI and consent: `docai:consentAi`, `docai:disclaimer`, `docai:reviewHint`, `docai:criticalTitle`,
  `docai:criticalHint`, `docai:emergencyHint`, `docai:redFlagsTitle`, `docai:sig_*`, `docai:flag_critical`,
  `docai:confidence`, `voice:consentVoice`, `voice:consentText`, `voice:disclaimer`, `voice:emergencyTitle`,
  `voice:emergencyBody`, `voice:urgentHint`, `voice:reviewHint`, `voice:micHint`.
- Account deletion / privacy: `common:deleteAccount.*` (especially `keptDefault`, `whatKept`, `requestHint`).
- Enum labels: `common:enums.consentKind.*`, `common:enums.paymentGateway.*`, `common:enums.paymentOption.*`,
  `common:enums.urgency.*` (bn renders `emergency` as "অতি জরুরি"), finance states without a standard term
  (`ledgerTxnType.cancellation_retention`, `jobStatus.dead`, `reversed`, `needs_reconciliation`).
- Translator flags: "Do not wait to travel" is free in ru/bn; ru `docai:disclaimer` strength; ar
  `doctorGenderPref` reads "male/female doctor"; bn `register.errors.countryInvalid` uses BD as the example.

### Patient web (`patient:`)

- Emergency: `support.sos.*`, `support.helplines.*`, `support.emergencyDialog.*`, `dashboard.quick.emergency*`,
  `profile.emergency.*`, `trip.hub.callHelpline`, `trip.hub.helpTitle`, `screening.wizard.disclaimer`.
- AI: `screening.preferences.useAi*`, `screening.preferences.aiInfo*`, `screening.preferences.aiConsent`,
  `screening.wizard.errors.aiConsent`, `screening.wizard.voicePrompt`, `documents.ai.*`, `documents.aiReading.*`,
  `profile.consents.copy.ai_processing`.
- Consent / privacy: `profile.consents.*`, `profile.medical.policy*`, `profile.passport.description`,
  `profile.companions.storedEncrypted`, `documents.description`, `documents.table.deleteBody`, `cases.new.consent*`,
  `screening.requestQuote.consent*`, `screening.requestQuote.info`, `careGates.guest.description`.
- Payment / refund / insurance: `pay.*`, `bookings.refund.*`, `bookings.cancel.*`, `bookings.detail.refundedSoFar`,
  `bookings.detail.paymentNeededText`, `bookings.detail.insuranceClaim`, `book.options.*`, `book.taxesNote`,
  `book.insurance*`, `cases.detail.accept*`, `cases.detail.paymentOption.*`, `costComparison.*`, `razorpay.*`.
- Medical wording: `screening.symptoms.*`, `screening.bodyMap.*`, `screening.pain.*`, `screening.duration.*`,
  `profile.medical.*`, `support.guide.health.*`, success/savings claims (`screening.match.*`,
  `screening.compare.rows.successRate`, `screening.new.savePct`).
- Visa: `trip.request.visa.*`, `trip.hub.visaIntro`, `trip.hub.invitationLetter`.
- Arabic `_one`/`_two` plural forms keep a numeric `{{count}}`; a native reviewer may prefer the singular/dual
  wording without the number.

#### Patient web phase-1 screens (added 2026-11)

Most of these reuse the reviewed mobile ARB wording (`mobile/lib/l10n/TRANSLATION_REVIEW.md`); the keys below
are new or rephrased for the web and should be checked first.

- Emergency / red flags: `aftercare.emergencyNote`, `aftercare.urgentTitle`, `aftercare.urgentBody`,
  `aftercare.flags.*`, `aftercare.q*` (check-in questions, pain scale `aftercare.painNone` / `painWorst`),
  `freeCall.notEmergency`, `quoteGroup.emergencyFirst`.
- Price / saving claims (legal display rule - must never promise a price): `costHome.*` (especially `save`,
  `disclaimer`, `source.*`, `oftenUnavailable`), `procedure.priceNote`, `procedure.homeVsIndia`,
  `money.approx*`, `hospital.treatmentsHint`, `hospital.selfDeclared`, `quoteGroup.currencyNote`,
  `quoteGroup.youPay`, `screening.match.compareHome`.
- Consent / privacy: `quickQuote.consentOne`, `quickQuote.consentMany`, `quickQuote.theHospital` (inserted into
  `consentOne` when the name is not loaded - ru/bn rephrased so the case ending fits), `guardian.*` (the
  `guardian.declaration` is a legal statement), `reviews.form.moderationNote`, `visaGuide.ticksLocal`.
- AI quota: `guestAi.*`; trust: `trust.registrationVerified`, `reviews.verified*`, `doctor.registrationHint`.
- Visa: `visaGuide.route.*`, `visaGuide.type.*`, `visaGuide.defaultNote`, `visaGuide.disclaimer`,
  `visaGuide.attendants_*` (Arabic dual / Russian few-many forms).
- Free call verification: `freeCall.codeInvalidLeft_*`, `freeCall.smsUnavailable`, `freeCall.alreadyUsed`.

### Agent portal (`agent:`)

- Consent / privacy: `consent.*`, `patientForm.consent*`, `enquiryDialog.consent*`, `screeningForm.consent*`,
  `screeningForm.useAiHint`, `patientDetail.documents.aiIntro`.
- Medical / AI / emergency: `screeningResult.*` (emergency, disclaimer, conditions, red flags),
  `screeningForm.*` (pain, severity areas, AI reading), `quotes.gate.emergency`, `patientForm.medicalHistory*`,
  `patientForm.allergies*`.
- Payment / commission / KYC: `bookCase.*`, `payBooking.*`, `razorpay.*`, `caseDetail.cancelBookingDescription`,
  `commissions.*` ("reversed" = clawed back), `payoutAccount.*`, `referral.howBody`, `layout.kyc.*`,
  `profile.kyc.*`.

### Hospital portal (`hospital:`)

- Screening / AI: `cases.screening.*`, `cases.detail.readings.*`, `cases.detail.patient.medicalSummary`.
- Patient-facing messages: `cases.detail.declineDialog.*`, `cases.documents.rejectDialog.*`.
- Quotes / pricing: `cases.quoteForm.*` (theatre and nursing terms), `cases.detail.quote.*`, `procedures.*`
  (success rate, indicative prices, inclusions).
- Admission / discharge / refunds: `bookings.detail.*`, `bookings.payment.*`, `bookings.visa.*`.
- Payouts / tax / banking: `finance.*` (GST, TDS 194-O, clawback, UTR, IFSC/SWIFT errors).
- Doctors / registration: `doctors.form.*`, `doctors.registration.*`; `availability.kindShort.*` one-letter codes.
- Onboarding KYC / legal: `onboarding.*`, `team.roleHints.*`.

### Admin portal (`admin:`, `finance:`)

- `admin:caseDetail.emergency.*`, `admin:caseDetail.screening.*`, `admin:caseDetail.payment.*`,
  `admin:travel.sos.*`, `admin:travel.visa.*`, `admin:bookings.drawer.*`, `admin:hospitalDetail.*Dialog.*`,
  `admin:settings.items.*`, `admin:settings.refundPolicy.*`, `admin:websiteSettings.footer.*`,
  `admin:websiteSettings.marketing.*`, `admin:websiteSettings.contact.emergency*`, `admin:websiteSettings.analytics.*`.
- Finance (staff-only, accounting vocabulary): `finance:reviews.*` (mark paid, partial acceptance / return,
  refund thresholds, payout failure), `finance:refunds.*`, `finance:refundDialog.*`, `finance:settlementUi.*`,
  `finance:batchDetail.*`, `finance:overview.flow.*`, `finance:adjustments.kinds.*.help`. French uses
  "contre-passation" for a bank-returned payout and "restitution" for a full return; the Russian payout-failure
  wording is the least certain.

### Website (`app = website`, dotted dictionary keys)

- Medical / AI disclaimers: `footer.disclaimer`, `footer.disclaimerShort`, `footer.accreditationNote`,
  `home.*` trust and savings notes, `procedure.priceNote`, `procedure.disclaimer`, `procedure.successRate*`,
  `procedure.faq.*`, `doctors.successRate*`, `about.{not,ai,privacy,hospitals}`, `review.*`,
  `destinations.verifyNote`, `guides.visaVerify`.
- Emergency: `contact.helplineEmergency`, `contact.callNumber`, `contact.medicalWarning`.
- Privacy / consent / legal: `consent.*`, `footer.cookies`, `footer.trustPrivacy`, `contact.privacyNote`,
  `auth.acceptTerms`, `auth.secureNote`, `legal.*`, `accountDeletion.*` (menu labels in `steps.1-2` must match the
  portal and app).
- Payment / refund: `legal.placeholders.refunds.*`, `home.trust.priceBody`, `home.savingsNote`,
  `forHospitals.*.termsNote`, `forAgents.*.termsNote`.
- Long-form guides, cost guides, patient stories and procedure x city pages stay English (see website/README.md).

## Phase-1 staff and partner screens (added 2026-11)

Machine-assisted like the rest; same review rules. Arabic uses all six plural forms, Russian one/few/many/other.

### Server notifications (`backend/app/i18n/<lng>.json`, now 327 keys; 168 new)

- Emergency / medical (highest priority): `notifications.screening_emergency_staff.*`,
  `notifications.aftercare_red_flag.*` (title is "URGENT: recovery warning signs"; `flags.*` are joined with
  `common.list_separator`), `notifications.consultation_*`, `notifications.consultation_reminder.*`.
- Money: `notifications.installment_due.*`, `notifications.installment_overdue.*`,
  `notifications.settlement_batch_pending.*`, `notifications.fx_rate_change.*`,
  `notifications.bank_details_change_requested.*`, `notifications.bank_details_changed.*`,
  `notifications.quote_rejected.*`, `notifications.quote_expired.*`, `notifications.quote_reminder_due.*`,
  `notifications.quote_overdue.*`, `common.payee.*`.
- Privacy / legal: `notifications.privacy_request_received.*` (incl. `kinds.*`), `notifications.privacy_request_updated.*`,
  `notifications.privacy_request_due.*`, `notifications.guardian_consent_pending.*`, `notifications.breach_recorded.*`,
  `notifications.inactivity_notice.*`, `notifications.deletion_requested.*`, `notifications.break_glass.*`,
  `notifications.agent_consent.*`, `notifications.moderation_warning.*`, `notifications.review_moderated.hidden_body`.
- Visa: `notifications.visa_invitation_issued.*`, `notifications.travel_status.*` (`items.*` + `statuses.*` are
  combined into one sentence - check word order and agreement in every language).

### Admin portal (`admin:`)

- Security / money (dual control): `security.*` - especially `security.fx.pendingBody`, `security.fx.dualControlNote`,
  `security.setting.checkBody`, `security.setting.rejectDescription`, `security.profile.body`,
  `security.profile.approveMessage`; benchmark sources `catalog.fields.{sourceUrl,priceYear,confidence,waitSource}*`,
  `catalog.confidence.*`.
- Trust: `accreditations.*` (`description`, `verifyHint`, `cannotVerifyExpired`, `form.reverifyNote`, `expiry.*`),
  `reviews.*` (`description`, `hideDescription`, `unverifiedBody`, `verifiedPatient`).
- Visa: `visaRules.*` (`routes.*`: "e-Medical visa", "Regular medical visa", "No visa needed"; `rulesDescription`,
  `defaults.message`, `fields.notesHint`).
- Free intro calls: `intro.*` (`form.notesHint` "Do not paste medical reports here", `confirm.cancelMessage`).
- Privacy (extracted, English unchanged): `privacy.*` - `privacy.guardian.description` (under-18 rule),
  `privacy.form.notesHint`, `privacy.kinds.*` (DPDP/GDPR request types; "Nomination" is the DPDP right to name
  someone - fr "Désignation d'un mandataire", ar "تعيين من ينوب عني", ru "Назначение доверенного лица").
- Moderation (extracted): `moderation.suspendMessage`, `moderation.noAuthor`, `moderation.actions.*`.
- Reviewer notes: ar uses الموافقة for approve on the finance/profile screens (the older agent/dashboard pages use
  اعتماد); ar sentences with `{{days}}` use يومًا (right for 11-99, not 3-10); ru writes "дн." inside sentences where
  `{{days}}` is not a plural key; fr `security.fx.pendingBadge` keeps "₹{{rate}}" (the rest of fr puts ₹ after the number).

### Hospital portal (`hospital:`)

- Medical: `aftercare.flags.*`, `aftercare.adherence.*`, `aftercare.checkins.*` (main: `aftercare.checkins.description`
  "Red flags are shown first: contact the patient quickly"), `aftercare.consultations.*`, `aftercare.schedule.*`.
- Visa / legal: `bookings.letter.*` (`previewDescription`, `form.*Hint`, `missing.*`, `missingTitle`, `missingHint`).
- Trust: `accreditations.*` (`howBody`, `status.*`, `form.reverifyBody`, `expiringBody`), `reviews.verifiedPatient*`,
  `onboarding.pending.*`, `cases.documents.shared*`.
- Quote SLA: `cases.respondBy.*`. Fixed: `procedures.includes.nightsStay_one` ("{{count}} night stay").

### Agent portal (`agent:`)

- Medical / emergency: `aftercare.dueHint`, `aftercare.redFlags.*`, `aftercare.form.*` (pain scale, wound, breathing,
  adherence) and `aftercare.form.redFlagWarning` ("call local emergency services now") - highest priority.
- Privacy: `enquiryDialog.shareReports`, `enquiryDialog.shareReportsHint`.
- Money: `displayCurrency.hint`, `displayCurrency.approxTitle` (approximate amounts; payments use the original
  currency), `quoteGroup.total`.
