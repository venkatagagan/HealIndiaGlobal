# Apple App Store — listing, privacy answers and review risks (one app: patients, agents, hospital users)

> Owner: product-docs · App: the Flutter app in `mobile/` (bundle ID `com.healindiaglobal.app`).
> App Review Guidelines and Apple's privacy and age-rating pages were checked on **2026-10-21** (§13). Quotes below
> are from that day. Re-check before every submission.
> **Revised 2026-10-21 (evening):** the app now serves patients, agents (facilitators) and hospital users through one
> login with role-based sections; staff use the web-only door. §0, §0.1, §3, §4, §6–§11 updated accordingly.
> Related: [GOOGLE_PLAY.md](GOOGLE_PLAY.md) · build actions [COMPLIANCE_GAPS.md](COMPLIANCE_GAPS.md) (`CG-xx`) ·
> [Terms](../legal/TERMS_OF_SERVICE.md) · [SECURITY.md](../SECURITY.md) · [DEPLOYMENT.md §13](../DEPLOYMENT.md).

URLs assume the production domain `healindiaglobal.com` (PLAN §3.1 example). If it changes, replace and re-count §3.

## 0. Submission blockers

| CG | Blocker | Guideline |
|---|---|---|
| CG-02 | The app shows "Continue with Apple" next to Google, but the backend has **no `POST /auth/apple`** and the Runner target has no Sign in with Apple entitlement, so the button fails in review | 4.8 Login Services · 2.1 |
| CG-01 | Deletion exists for patients and guests (`DELETE /auth/me`, Profile sheet) but **not in the agent or hospital sections**, the sheet has no authenticator-code field for MFA users, and "blocked" ends in an error banner instead of a request path | 5.1.1(v) |
| CG-32 | Three role sections behind one login: the reviewer needs a working account for **each** role, and staff must stay out of the app | 2.1 App Completeness |
| CG-33 | Microphone (voice intake) and camera (report photos) now ship; the privacy label, purpose strings and AI disclosure must cover audio, transcripts and reports sent to Anthropic | 5.1.1(ii), 5.1.2(i) |
| CG-04 | No explicit, named consent before data goes to a third-party AI (Anthropic) | 5.1.2(i) |
| CG-03 / CG-05 | Unsubstantiated statistics, savings, accreditation, WHO and HIPAA claims; no "check with a doctor" reminders | 1.4.1, 2.3, 5.1.1(i) |
| CG-07 | Must be submitted by the legal entity (Organisation account) | 5.1.1(ix) |
| CG-08 | Privacy policy link in App Store Connect and inside the app | 5.1.1(i) |
| CG-09 | Privacy manifest / required-reason APIs | Upload validation (ITMS-91053) |
| CG-06 / CG-11 | Demo account; Google Sign-In unconfigured on iOS (placeholder `REVERSED_CLIENT_ID`, no `GIDClientID`); Flutter default icon | 2.1 App Completeness |
| CG-23 | Built with Xcode 26 / iOS 26 SDK (required for uploads since 2026-04-28) | Upload requirement |

## 0.1 Who the app is for (PLAN §3.1)

One binary, one login screen, three role sections. The role on the account decides the section after sign-in
(`Routes.homeFor`, guarded in `mobile/lib/core/router/app_router.dart`):

| Role | How they get an account in the app | Section (bottom tabs) |
|---|---|---|
| Patient | Register (Patient tab), Continue with Google / Apple, or Browse as Guest; or invited by their agent | Home · Search · Trips · Messages · Profile — screening (typed or voice), document photos, matches, cost comparison, booking, payment, trip and in-country support |
| Agent (facilitator) | Register (Agent tab, agency name); usable once staff approve the agency | Dashboard · Patients · Cases · Bookings · Earnings — patients they represent, screenings on their behalf, quote comparison, bookings and payments on behalf, commissions |
| Hospital user | Register (Hospital tab, hospital name and city) or a member invite; the hospital goes live after staff approval | Dashboard · Enquiries · Patients · Settlements · More — itemised quotes, admissions and discharges, itineraries, visa letters, doctors, price list, settlements (read-only) |
| Staff (admin, finance, support) | **Not in the app.** Staff sign in only at the web staff door; mobile clients get the generic 401 there (`staff_door_guard`) | — |

What this means for the store:
- **Listing.** Patients remain the primary audience (category, keywords, screenshots 1–7). Partner sections are
  described in one short block and shown in two or three screenshots, so a reviewer is not surprised by them.
- **Review access.** Apple needs a working login for every gated feature (2.1), so we give three review accounts
  (§9). Partner onboarding (KYC, payout account, hospital profile wizard) happens on the web portals.
- **Never name the staff door in the listing, the review notes or screenshots.** Its path is unlisted on purpose
  (`noindex`, not in the sitemap). Say only "operations staff use a separate internal web console".
- **Privacy answers cover all three roles** (§6). Agents enter other people's health and passport data, and hospital
  users write quotes and clinical notes, so this data is collected through the app too.
- **Deletion** must be reachable from every section, not only the patient Profile tab (CG-01).

---

## 1. App identity and developer account

| Field | Value / decision |
|---|---|
| Apple Developer Program | **Organisation** (D-U-N-S), enrolled by the operating company. 5.1.1(ix): healthcare apps "should be submitted by a legal entity that provides the services, and not by an individual developer" (CG-07) |
| Seller name | The legal entity named in Terms §1 |
| Bundle ID · SKU | `com.healindiaglobal.app` (permanent once used; CG-11) · `HIG-PATIENT-IOS` |
| Primary language | English (U.S.). **English only** (product decision): optionally add an English (U.K.) localisation with the same copy; no other localisations, keywords or screenshots in other languages |
| Price · in-app purchases | Free · none (real-world services, §10.2) |
| Availability | Target source markets. **Exclude China mainland** unless an ICP filing number is obtained. Exclude sanctioned regions |
| Devices | Today iPhone **and iPad** (`TARGETED_DEVICE_FAMILY = "1,2"`) with iPhone landscape enabled. Decide: QA iPad and landscape and supply iPad screenshots, or ship iPhone-only and portrait-only in v1 (CG-22) |
| EU Digital Services Act | Declare **trader**; address, phone and email will show on EU storefronts |
| Export compliance | Only OS-provided encryption (HTTPS/TLS, Keychain), which is exempt. Add `ITSAppUsesNonExemptEncryption = false` to `Info.plist` (CG-23) |
| Content rights | "Contains third-party content": yes. Hospital listings and photos are licensed through hospital agreements; map tiles carry OSM attribution (CG-29) |

## 2. Category

**Primary: Medical. Secondary: Travel.**

| Option | Assessment |
|---|---|
| **Medical** (primary) | Matches the core job: finding, comparing and booking treatment, and coordinating care with health data. Apple's extra rules (1.4.1 scrutiny, 5.1.1(ix) legal entity, 5.1.3 health data) apply because of **functionality** whatever the category, so another category avoids nothing and would look like mis-categorisation (2.3) |
| Health & Fitness | Wellness and fitness positioning; weaker intent match; makes the AI screening look like wellness advice rather than care navigation |
| **Travel** (secondary) | The visa, flights, stays and in-country support half of the app. Gives travel discovery without misrepresenting the core |

Implications of Medical: expect closer review of medical claims and AI output (CG-03, CG-05, CG-13). Reviewers may
ask for documentation that the company provides the service (keep the company registration and a hospital
agreement ready). If the AI feature ever gets regulatory clearance, 1.4.1 asks for a link to it.

## 3. Listing copy (en-US)

Counts are Unicode characters, measured with a script on 2026-10-21.

| Field | Limit | Text | Count |
|---|---|---|---|
| App name | 30 | `Heal India Global` | 17 |
| Subtitle | 30 | `Medical treatment & travel` (recommended: adds new indexed words) · alt. `Treatment & travel in India` | 26 · 27 |
| Promotional text (editable without review) | 170 | `Describe your condition, compare matched hospitals and estimated costs, then book treatment and plan your visa, travel and stay in India, all in one app.` | 153 |
| Keywords | 100 | **K1** `tourism,hospital,surgery,abroad,doctor,cost,visa,cardiac,orthopedic,knee,dental,cosmetic,oncology` | 97 |
| Keywords (alt.) | 100 | **K2** `tourism,hospital,surgery,abroad,doctor,cost,visa,cardiac,heart,knee,hip,dental,cosmetic,cancer,spine` | 100 |
| Support URL | — | `https://healindiaglobal.com/support` | |
| Marketing URL | — | `https://healindiaglobal.com` | |
| Privacy Policy URL | — | `https://healindiaglobal.com/privacy` (CG-08) | |
| User Privacy Choices URL (optional) | — | `https://healindiaglobal.com/account/data` | |
| Copyright | — | `© 2026 <legal entity name>` | |

**Keyword rules (2.3.7):**
- Don't repeat words already in the name ("heal", "india", "global") or subtitle ("medical", "treatment",
  "travel"); Apple indexes those already.
- No spaces after commas.
- No hospital or competitor brands, no prices, no claims.
- K1 follows the launch specialties (Cardiology, Orthopedics, Cosmetic, Dental, Oncology). Rotate after the first
  month of search data.
- Keep keywords patient-focused. Partners arrive through sales and the website's "For agents" / "For hospitals"
  pages, not App Store search, so words like "facilitator" or "agent" would waste the 100 characters. If partner
  search demand shows up, swap `oncology` for `facilitator` (K1 stays ≤ 100).
- Subtitle and promotional text stay patient-only; the partner sections are described in the description (§3.1).

### 3.1 Description (≤ 4000) — 3,683/4,000

```text
Heal India Global helps international patients find, compare and book medical treatment in India, and organises the trip around it. Medical travel facilitators and partner hospitals use the same app to work on those cases with them.

FOR PATIENTS
1. Describe your condition: a short guided questionnaire covering where it hurts, your symptoms, how long you have had them and how they affect work, sleep and mobility. Type your answers or describe them by voice (in English) and check the text before it is used, then add photos or PDFs of medical reports.
2. Get matched: see hospitals and specialists ranked against your needs (specialty, procedures offered, accreditation, languages spoken, doctor gender preference, budget and travel dates), with the reasons for each match.
3. Compare costs: see indicative price ranges in your currency next to typical costs in your home country, itemised for surgery, hospital stay, medicines and tests.
4. Request a quote and book: the hospital reviews your case and sends an itemised quote. Accept it, choose your dates and package, then pay a deposit, the full amount or with a payment plan.

PLAN YOUR TRIP AND GET SUPPORT IN INDIA
• Pre-arrival checklist: treatment, visa, flights, travel insurance, airport pickup and accommodation
• Help with India's e-Medical visa, including the hospital's invitation letter
• Chat with your care coordinator and the hospital team
• Today's schedule, a map of your hospital and stay, a one-tap helpline and an SOS button that alerts our support team

FOR FACILITATORS AND HOSPITAL TEAMS
Approved partners sign in with their own account and see a separate section:
• Facilitators: manage the patients you represent, run screenings with them, compare hospital quotes, book and pay on their behalf, and track commissions
• Partner hospitals: answer enquiries with itemised quotes, manage admissions and discharges, share itineraries and visa letters, and view settlements
Partner accounts are verified by our team before they go live.

PAY SECURELY
• Pay by card through Razorpay's secure checkout, or by international bank transfer (SWIFT)
• Confirm payments with Face ID or Touch ID
• Card details go directly to the payment provider and are never stored by us

PRIVACY
• Your medical information is shared only with the hospitals you ask for a quote, your care coordinator and, if you work with one, your facilitator
• AI features are optional. If you turn them on, your answers, the text of a voice description or the reports you choose are sent to our AI provider, Anthropic (Claude), to suggest specialties or summarise a report. Your name and contact details are not sent with them, although a report you choose may show them
• Voice recordings are transcribed on our own servers and deleted after transcription; you check the text before it is used
• No ads and no tracking
• Delete your account in the app from your profile or account menu

IMPORTANT
• Screening results, including AI suggestions, are not a diagnosis. Heal India Global does not diagnose or treat any condition. Always check with a qualified doctor before making medical decisions.
• Not an emergency service. In an emergency, call your local emergency number and do not travel for treatment.
• Heal India Global is a facilitator. Treatment is provided by independent hospitals and doctors, who are responsible for your clinical care. Prices are estimates until the hospital confirms them after examining you.
• Not affiliated with the Government of India or its "Heal in India" initiative.
• For adults aged 18 and over.

Support: support@healindiaglobal.com
Terms: healindiaglobal.com/terms
Privacy: healindiaglobal.com/privacy
```

This copy only holds if:
- the AI paragraph matches the shipped consent flow (CG-04);
- Face ID / Touch ID confirmation and a passcode fallback exist (CG-17);
- the deletion path exists in every section, patient, agent and hospital (CG-01);
- the voice line stays true: `VOICE_RETAIN_AUDIO=false` in production and `STT_PROVIDER=local_whisper` (audio never
  leaves our servers). If a cloud speech engine is ever switched on, rewrite the line and the privacy label (CG-33);
- the AI line covers all three AI uses (screening, voice-text extraction, "Read my report with AI") and the consent
  sheet says the same (CG-04, CG-33);
- partner accounts really are approved by staff before they can work (`agent.approved`, `hospital.approved`);
- "No ads and no tracking" stays true: no ad SDKs and no data linking with third parties for advertising, hence no
  ATT prompt (§6).

The partner block names no commission rates, earnings figures or hospital volumes; keep it that way (2.3: metadata
must be accurate, and income promises invite scrutiny).

Leave out "24/7", statistics, savings percentages, testimonials and accreditation claims (CG-03). Once Sign in with
Apple works end to end, a line like "Sign in with Apple, Google or email, or browse as a guest" can be added
(≈ 75 chars, still under 4,000).

## 4. Sign-in options and Guideline 4.8

**What the guideline says today** (checked 2026-10-21):

> Apps that use a third-party or social login service (such as Facebook Login, Google Sign-In, Log in with X, Sign
> In with LinkedIn, Login with Amazon, or WeChat Login) to set up or authenticate the user's primary account with
> the app must also offer as an equivalent option another login service with the following features: the login
> service limits data collection to the user's name and email address; the login service allows users to keep their
> email address private as part of setting up their account; and the login service does not collect interactions
> with your app for advertising purposes without consent.

The exceptions are: the app uses only the company's own account system; it is an alternative marketplace; it is an
education or enterprise app using existing org accounts; it uses a government or industry citizen-ID system; or it
is a client for a specific third-party service.

**State of the build (2026-10-21):**
- The app shows **Continue with Google** and, on iOS/macOS, **Continue with Apple** on the Registration decision
  screen (`auth_screen.dart`) and on the login screen (`login_screen.dart`), with the note "Google and Apple
  sign-in are for patients." (`apple_sign_in_service.dart`, `sign_in_with_apple: ^8.2.0`, nonce sent).
- The app calls **`POST /auth/apple`**, which **does not exist in the backend** yet (`backend/app/modules/auth`).
  There is also no `apple_sub` column, no Apple token revocation and no `Runner.entitlements` file. Until these
  land the Apple button fails, which is a 2.1 rejection on its own (CG-02).
- Agents and hospital users register with email and password only (Agent / Hospital tabs). The login screen is
  shared by all roles, so a partner who taps Google or Apple must get a clear outcome (see below).

**How it applies to us:**
1. The iOS app offers **Continue with Google** to create the patient's primary account (`google_sign_in`,
   `POST /auth/google`), so 4.8 applies. It applies to the app as a whole, not per role: the agent and hospital
   sections don't need their own social login, but wherever Google is offered, Apple must be offered with equal
   prominence and equal behaviour.
2. **Equal behaviour across roles.** If an agent or hospital user whose email matches signs in with Google, the
   backend must treat Apple the same way: both log in to the existing partner account, or both refuse with the same
   message ("Partner accounts sign in with email and password"). Pick one rule in be-auth and apply it to both
   endpoints. Social login must never create an agent or hospital account, and never reach a staff account (public
   door rule, PLAN §3.1).
3. Our **email + password** sign-up does not count as the "equivalent option". It is our own account system, not a
   login service that lets the user keep their email address private.
4. **Guest mode** doesn't change anything; it isn't a login service.
5. **Sign in with Apple** meets all three features (name and email only; Hide My Email relay; no ad tracking). It is
   the practical answer. In theory another service with those features would qualify, but none is mainstream for
   our users.
6. The "own account system only" exception applies only if Google sign-in is removed **on iOS**. That is the
   fallback, option B in CG-02.
7. Google Play has no equivalent rule. Android keeps Google sign-in, with no Apple button needed.

**Implementation requirements** (full specification in CG-02):
- Apple's standard button, **at least as prominent** as the Google button, on the Registration decision screen
  (`/auth`), not hidden behind "more options".
- Don't ask again for the name or email that Sign in with Apple returned. Prefill the profile and accept the
  `privaterelay.appleid.com` address. Reviewers often reject apps that make SIWA users re-enter these.
- Register the outbound email domain with Apple's Private Email Relay, or verification and receipt emails to relay
  addresses will bounce.
- Store the Apple refresh token (encrypted) and revoke it through Apple's REST API when the account is deleted
  (`DELETE /auth/me` must call it). Use Apple's server-to-server notifications for consent revocation and account
  deletion.
- Public-door rules (PLAN §3.1): creates patient accounts only; same partner-account rule as Google (point 2).
- The same button and the same rule on the login screen and the Registration decision screen. Hide both social
  buttons while a guest is upgrading on the Agent or Hospital tab (the form is patient-only then anyway).
- Test on a real device in the review build: new Apple ID, Hide My Email, second sign-in (no name returned), and
  deletion followed by a fresh sign-up with the same Apple ID.

**Uncertainty:**
- Apple has rewritten 4.8 before: Sign in with Apple was mandated in 2019, and the "equivalent privacy-focused
  service" wording arrived in January 2024. The text above is current as of 2026-10-21, so re-read it at submission.
- Prominence of the button is enforced through Apple's Human Interface Guidelines as much as the guideline text.
  Equal size and position is the safe choice.
- Account linking is a product decision we still owe. A user who signs in with Apple using Hide My Email, then with
  Google using their real address, gets two accounts. Decide the linking or merge rule (merge through support in
  v1).

## 5. Age rating (2025 questionnaire)

Apple's tiers are now 4+, 9+, 13+, 16+ and 18+. Per Apple's age-rating definitions, "Medical or Treatment
Information" sets **13+ when Infrequent and 16+ when Frequent**, and "Health or Wellness Topics" is 9+. Messaging,
user-generated content, advertising, parental controls and age assurance are capabilities rated 4+. Unrestricted web
access is 16+.

| Item | Answer | Reason |
|---|---|---|
| Medical or Treatment Information | **Frequent** | Procedures, treatment plans and costs are the core of the app |
| Health or Wellness Topics | Yes | |
| Messaging and Chat | Yes | Case chat with hospital staff, coordinators and the patient's agent |
| User-Generated Content | Yes | Messages and documents shared with the care team; reviews later |
| Advertising | No | |
| Unrestricted Web Access | **No** | External links open in Safari; no in-app browser. Keep it that way, or the rating jumps to 16+ on this item alone |
| Parental Controls / Age Assurance | No | Adults only, by Terms |
| Social media | No | |
| Contests, gambling, simulated gambling, loot boxes | None | |
| Violence, guns, horror or fear, profanity, mature or suggestive themes, sexual content or nudity | None | Use the stylised body map (`design/body-map/`) |
| Alcohol, tobacco or drug use or references | None | Medicines appear only as medical information, covered above |
| Made for Kids | No | |

**Expected calculated rating: 16+.** The Terms (§4.1) require users to be 18+. **Recommendation:** set **18+**
manually, which Apple allows when the app's own policy needs a higher age, so the store matches the Terms and the
payment contract. Pair it with an adult attestation at sign-up (CG-24). Keeping 16+ is defensible but leaves a
mismatch to explain.

## 6. App Privacy ("nutrition label")

Apple's definitions:
- "Collect" means sending data off the device where we or our partners can access it longer than needed to service
  the request in real time.
- Third-party partners' code (the Razorpay, Google Sign-In and Sign in with Apple SDKs) counts as ours.
- The label is per app, not per role. Answer for the union of what patients, agents and hospital users can send
  through the app. Data an agent types about a patient is the patient's data collected by us, so it falls under the
  same categories.
- "If your app uses a payment service, the payment information is entered outside your app, and you as the
  developer never have access to the payment information, it is not collected and does not need to be disclosed."

**Data Used to Track You: none.** No ad or attribution SDKs and no IDFA, so no App Tracking Transparency prompt.
Adding any such SDK changes this answer.

**Data Linked to You:**

| Apple category · type | Purposes | What it is (PLAN) |
|---|---|---|
| Contact Info · Name | App Functionality; Developer's Advertising or Marketing* | `users.full_name`, profile names; patient names entered by agents; agency and hospital names at partner sign-up |
| Contact Info · Email Address | App Functionality; Developer's Advertising or Marketing* | Login, transactional email |
| Contact Info · Phone Number | App Functionality | Phone and emergency-contact phone |
| Contact Info · Physical Address | App Functionality | `patient_profiles.address` |
| Contact Info · Other User Contact Info | App Functionality | WhatsApp number |
| Health & Fitness · Health | App Functionality | Screening answers (typed or from a voice transcript), notes, medical history, allergies, blood group, reports and their confirmed AI extraction (`document_analyses`), AI result, case and treatment details, quotes and admission/discharge notes written by hospital users |
| Sensitive Info | App Functionality | Conservative: free-text history and uploaded reports can reveal pregnancy, disability or genetic information, which are in Apple's Sensitive Info list |
| Financial Info · Other Financial Info | App Functionality | Bank-transfer reference and proof, insurance provider and policy number |
| Financial Info · Payment Info | **Not collected** | Card and UPI details are entered in Razorpay's checkout and never reach us (Apple's payment-service note). Re-check if any payment field is ever rendered by our own UI |
| Location · Precise Location | App Functionality | SOS coordinates (one reading per SOS alert) |
| Location · Coarse Location | App Functionality | SOS coordinates when the user grants approximate location |
| User Content · Emails or Text Messages | App Functionality | In-app chat messages |
| User Content · Photos or Videos | App Functionality | Report photos taken with the camera or picked from the library (`image_picker`, up to 10 pages), passport and visa scans, profile photo. Metadata including GPS is stripped server-side before AI processing (PLAN §7.1) |
| User Content · Audio Data | App Functionality | Voice descriptions of symptoms, in English, recorded in the app (`record`, AAC/m4a, ≤ 3 min) and uploaded for transcription on our own servers. The audio file is deleted after transcription (`VOICE_RETAIN_AUDIO=false`), but it is stored until the job runs, so it is not "real-time only" and must be declared. The transcript is Health data |
| User Content · Customer Support | App Functionality | Support conversations, SOS messages |
| User Content · Other User Content | App Functionality | Uploaded PDF and DICOM documents, case notes, hospital quotes and itineraries, visa invitation letters, reviews (later) |
| Identifiers · User ID | App Functionality | Account id; Google and Apple account ids |
| Identifiers · Device ID | App Functionality | Push token, once push ships (CG-15) |
| Purchases · Purchase History | App Functionality | Bookings, orders, instalments, receipts |
| Usage Data · Other Usage Data | App Functionality | Security audit records of account actions (`audit_logs`) |
| Other Data · Other Data Types | App Functionality | Passport number and expiry, date of birth, gender, nationality (also when an agent enters them for a patient), companions' details, language and currency preferences; hospital city at partner sign-up |

\* Only if opt-in marketing email (`ConsentKind.marketing`) is used. 5.1.3(i) forbids using health data for
marketing in any case.

**Not collected (v1):**
- Contacts, Browsing History, Fitness, Gameplay, Advertising Data. (**Audio is now collected**, see above.)
- Partner bank and KYC details: entered on the web portals only, not in the app. If payout-account or KYC forms are
  ever added to the app, add Financial Info · Other Financial Info (bank account) and Other Data (KYC documents).
- Search History: stays true only while queries are not persisted (CG-31).
- Product Interaction: no analytics SDK.
- Crash or Performance Data: no crash SDK in the app.
- Environment Scanning, Hands, Head.

**Data Not Linked to You:** none in v1. If a crash SDK is added with user ids stripped, crash and performance data
would go here.

**Keep the label, the privacy manifest and the policy in sync.** `ios/Runner/PrivacyInfo.xcprivacy` must exist
(CG-09):
- `NSPrivacyTracking = false`;
- `NSPrivacyCollectedDataTypes` mirroring this table, using keys such as `NSPrivacyCollectedDataTypeHealth`,
  `…SensitiveInfo`, `…EmailsOrTextMessages`, `…PhotosorVideos`, `…AudioData`, `…OtherUserContent`, `…UserID`,
  `…PurchaseHistory`,
  `…OtherDataTypes`, each with `…PurposeAppFunctionality`, `Linked = true` and `Tracking = false`;
- required-reason APIs as flagged by Xcode's privacy report.

Third-party SDK manifest status (pub cache, 2026-10-21):
- **Present:** `local_auth_darwin`, `google_sign_in_ios`, `url_launcher_ios`, `flutter_secure_storage_darwin`,
  `shared_preferences_foundation`, `image_picker_ios 0.8.13+10`, `record_ios 2.1.1`.
- **Absent:** `file_picker 13.1.0`, `razorpay_flutter 1.4.7` and `sign_in_with_apple 8.2.0`. Check the native
  Razorpay pod and declare any flagged APIs in the app's own manifest.

## 7. Permissions: purpose strings and entitlements

5.1.1(ii): "Ensure your purpose strings clearly and completely describe your use of the data." 5.1.1(iii) prefers
out-of-process pickers. 5.1.1(iv): offer alternatives when people decline. 5.1.2(i): the app may not require system
features such as location or push in order to work.

Prompts are the same for every role: an agent or hospital user sees the camera or microphone prompt only when they
use those features (an agent adding a patient's report or recording a patient's description). Every prompt is
just-in-time, never at launch.

| `Info.plist` key | Current value | Assessment | Recommended value |
|---|---|---|---|
| `NSFaceIDUsageDescription` | "Heal India Global uses Face ID to confirm payments and protect your medical information." | **Inaccurate**: no app-lock that protects medical information exists in PLAN | "Confirm it's you with Face ID before a payment starts. Face ID data never leaves your device." Keep the passcode fallback (CG-17) |
| `NSPhotoLibraryUsageDescription` | "Choose photos of medical reports, prescriptions or your passport to upload securely." | OK. The out-of-process picker needs no permission, so this rarely shows; keep it in case a plugin touches the Photos APIs | Unchanged |
| `NSCameraUsageDescription` | "Take photos of medical reports, prescriptions or your passport to upload securely." | **Now used**: `image_picker` `ImageSource.camera` in `features/documents_ai` (screening step 3, Trips › Documents; also when an agent adds a patient's report). Accurate, but should mention the optional AI reading | "Take photos of medical reports, prescriptions or your passport to add them to your case. If you choose, our AI provider reads a report to summarise it for you and your doctor." |
| `NSLocationWhenInUseUsageDescription` | "When you send an SOS, we share your location with our support team so they can reach you, and show it on the support map. It is never used in the background." | **Used since 2026-11-09** (CG-10 done): `geolocator` takes one reading when an SOS is sent with "Share my current location" ticked; never at launch, never in the background. SOS works without it (typed message field, map mark) | Done |
| `NSMicrophoneUsageDescription` | "Record a spoken description of your symptoms so we can fill in your screening answers. You review everything before it is used." | **Now used** by voice intake (`record`, screening steps 1–2, and the agent's screening form). Accurate and specific; request only when the user taps "Describe it by voice". Typing must remain a full alternative (5.1.1(iv)) | "Record a spoken description of your symptoms in English so we can fill in your screening answers. You review everything before it is used." When tele-consults ship (ROADMAP R1), extend: "…and to talk to your doctor during a video consultation." |
| `NSSpeechRecognitionUsageDescription` | — | **Not needed** today: speech-to-text runs on our servers (Whisper). Add it only if on-device recognition via `SFSpeechRecognizer` is adopted (the API allows it through `POST /voice/intake-extract`) | "Turn your spoken description into text on this device." |
| Not needed | — | No `NSLocationAlways…`, `NSUserTrackingUsageDescription`, `NSContactsUsageDescription`, background modes (recording stops when the app leaves the foreground; no `audio` background mode) | — |

**Entitlements and capabilities:**
- Sign in with Apple (`com.apple.developer.applesignin`), CG-02. **Missing today**: there is no
  `ios/Runner/Runner.entitlements`; add the capability in Xcode and enable it on the App ID.
- Push Notifications (`aps-environment`) when push ships, CG-15.
- Optional Associated Domains `applinks:healindiaglobal.com`, so verify-email, password-reset and deletion-confirm
  links open the app.

Fix `LSApplicationQueriesSchemes` and the Google URL scheme placeholder as part of CG-11.

## 8. Screenshots and app preview

**Specs** (confirm in App Store Connect at upload):

| Asset | Spec |
|---|---|
| iPhone 6.9-inch screenshots | Required: 1320×2868 or 1290×2796 portrait (the 6.5-inch 1242×2688 / 1284×2778 set is also accepted). Up to 10 per localisation |
| iPad 13-inch screenshots | 2064×2752 or 2048×2732, **only if iPad stays supported** (CG-22) |
| App previews | Optional, up to 3, 15–30 s |

**2.3.3:** "Screenshots should show the app in use, and not merely the title art, login page, or splash screen."
That rules out onboarding and registration as primary screenshots.

Screenshots 1–8 share captures with Google Play where the screen is the same (see
[GOOGLE_PLAY.md §4](GOOGLE_PLAY.md#4-graphics-and-screenshot-plan) for the edits per screen), using iPhone captures.
The order puts patients first: the first three screenshots show in search results and must sell the patient journey.
Partner sections come last, one screenshot each, so the listing matches what a reviewer finds after login (2.3.1).

| # | Screen (design file › panel) | Route | Caption | Edits before capture |
|---|---|---|---|---|
| 1 | Service Category Selection (0 › 5) | `/home` | Explore treatments by specialty | No savings chips; nav as built |
| 2 | Questionnaire step 1, body map, with the "Describe it by voice" button (1 › 1) | `/screening/:id/step/1` | Tell us where it hurts | Stylised body map |
| 3 | Your Top Matches (2 › 2) | `/screening/:id/matches` | See matched specialists and why | Sample names; no "98% Success"; "Not a diagnosis" |
| 4 | Treatment Comparison (2 › 3) | `/cost-comparison` | Compare estimated costs | "Estimated"; footnote |
| 5 | Treatment Selection (3 › 1) | `/book/:caseId` | Choose your dates and package | Sample data; no "Save $500" unless real |
| 6 | Pre-Arrival Dashboard (4 › 1) | `/trips` | Track visa, flights and pickup | — |
| 7 | In-Country Support (4 › 2) | `/support` | Support on the ground in India | OSM attribution; no "24/7" unless staffed |
| 8 | Voice intake review: English transcript and the editable answers (no design; capture from build) | voice sheet on `/screening/:id/step/1` | Describe it by voice, then check | Fictional English transcript (e.g. knee pain for six months); "Confirm" visible; no red-flag case |
| 9 | Agent: case detail with quote comparison (no design; capture from build) | `/agent/cases/:id` | For facilitators: manage patient cases | Seeded fictional patient and two sample hospitals; no commission amounts on screen |
| 10 | Hospital: itemised quote builder (no design; capture from build) | `/hospital/cases/:id/quote` | For hospitals: send itemised quotes | Sample hospital; line items with plausible INR amounts; no real doctor names |

Dropped from the earlier patient-only plan: Preferences step 4 and the Payment screen (still blocked on CG-17).
Never capture the onboarding claims (CG-03), the login screen (2.3.3) or anything that shows the staff console.

**Capturing partner screens.** The design images cover only the original patient screens, so screenshots 8–10 come from a
release build against a seeded **non-production** database (`python -m scripts.seed`, fictional `.example` data).
Crop or blur anything that shows a demo e-mail address. Re-capture whenever the partner shells change.

**App preview (optional, ~25 s):** Home → body map → voice description → matches → cost comparison → Trips →
Support. Patient journey only. Record it on device from the release build with no claims. Captions match the
screenshots.

The content rules from Google Play §4 apply to every asset. Fictional sample data only, and no real hospital brands,
accreditation logos or the WHO emblem (CG-19).

## 9. App Review information

### 9.1 Review accounts (one per role)

Apple 2.1 asks for an active demo account for every feature behind a login. Our app has three role sections, so the
reviewer needs three accounts. App Store Connect has one username/password field: put the **patient** account there
and the other two in the Notes. **Contact:** a release manager reachable by phone and email throughout the review.

| Role | Username (proposed) | Lands on | Fixture data the reviewer should find |
|---|---|---|---|
| Patient | `review.patient@healindiaglobal.com` | Home | Completed rules-engine screening; a case in `quoted` with a quote to accept (Cases); a second case with a **confirmed** booking so Trips and Support show data; a coordinator conversation; checklist and itinerary |
| Agent | `review.agent@healindiaglobal.com` | Agent › Dashboard | Approved agency "Review Facilitator (test)"; two fictional managed patients; one case with two quotes to compare; one booking; pending commission items |
| Hospital user | `review.hospital@healindiaglobal.com` | Hospital › Dashboard | Coordinator (not owner) of "Review Test Hospital"; an open enquiry to quote; an upcoming admission; a settlement item |

Rules for these accounts:
- **Dedicated production accounts with unique strong passwords**, generated per submission, kept in the password
  manager and rotated after each review. They sign in against the production API, because the reviewed build is the
  release build.
- **MFA off** on all three (a reviewer can't use our TOTP), email verified, Terms/Privacy/AI consents recorded so no
  blocking dialogs appear.
- **Isolated.** "Review Test Hospital" and the review agency are hidden from the public catalog and search, excluded
  from admin and finance reports, and never settled or paid out (a review-fixture flag; CG-06). The review booking
  is created by the fixture with no payment rows, so the ledger is untouched.
- **Rebuilt nightly** by the fixture, so a reviewer who accepts a quote, cancels or deletes an account doesn't break
  the next review.
- The hospital account is a **coordinator**, not the owner, so its own deletion is not blocked by
  `listed_hospitals_owned`.

**Do not use the seeded demo accounts or their password.** `backend/scripts/seed.py` gives every demo account the
same password, `HealIndia@2026`. It is **demo-only**:
- it is published in the repository, the seed script's console output and these docs, so anyone could use it;
- the seed refuses to run with `ENV=production`, so those accounts don't (and must never) exist in production;
- their `@healindia.example` addresses can't receive mail, so verification, password-reset and deletion e-mails fail.

Use it only on local and staging databases (QA, screenshots 8–10). For store review, create the dedicated review
accounts above with the review-fixture command (CG-06), which reads the passwords from secrets, never from code.

**How to create or refresh them (built 2026-11-09).** From `backend/`, against the production database:

```
REVIEW_PATIENT_PASSWORD=… REVIEW_AGENT_PASSWORD=… REVIEW_HOSPITAL_PASSWORD=… python -m scripts.seed_review_accounts
```

- The three passwords come from the secrets manager as environment variables. The script refuses to run without
  them, checks them against the password policy and never prints them. `REVIEW_PATIENT_EMAIL`,
  `REVIEW_AGENT_EMAIL` and `REVIEW_HOSPITAL_EMAIL` override the default addresses.
- It is idempotent: re-running resets the passwords (do this after every review), switches MFA off and unlocks the
  accounts, and keeps the demo data. Schedule it nightly if you want the "rebuilt nightly" rule above.
- What it creates today: the three accounts (email verified, Terms/Privacy/18+ consents, plus AI consent for the
  patient); "Heal India Global App Review Hospital" in status `draft`, which every public catalog and search query
  leaves out, with the hospital account as its **coordinator**; an approved review agency with two fictional managed
  patients and a quoted case; for the patient a completed rules-engine screening, a `quoted` case with a quote to
  accept and a second case with a `confirmed` booking (no payment rows). Not yet seeded: a second quote to compare,
  pending commission items and a settlement item (those need ledger postings, so they stay out of production).
- **Where the credentials go:** App Store Connect › App Review Information › Sign-In Information (patient account)
  and the Notes (agent and hospital accounts); Play Console › App content › App access (one instruction set per role,
  see [GOOGLE_PLAY.md §5](GOOGLE_PLAY.md#5-app-content-declarations-policy--app-content)). The passwords themselves
  live only in the password manager and those two consoles, never in this repository.

### 9.2 Notes for the reviewer (template; fill in the angle brackets)

```text
Heal India Global is a medical-travel facilitation app operated by <legal entity>. Patients describe their condition,
are matched with partner hospitals in India, receive itemised quotes, book treatment and arrange visa, travel and
stay. Treatment is provided by independent hospitals. Approved medical-travel facilitators (agents) and partner
hospital staff use the same app: after sign-in, each account sees only the section for its role.

REVIEW ACCOUNTS (one per role; all use the same login screen):
- Patient: review.patient@healindiaglobal.com / <password 1> (also in the Sign-In fields). Contains a completed
  screening, a case with a quote you can accept (Cases), and a confirmed booking so Trips and Support show data.
  You can also tap "Browse as Guest" on the first screen.
- Agent (facilitator): review.agent@healindiaglobal.com / <password 2>. Patients, cases with quotes to compare,
  bookings and commissions.
- Hospital: review.hospital@healindiaglobal.com / <password 3>. Enquiries (send an itemised quote), admissions and
  discharges, settlements.
Partner sign-up is available in the app (Register > Agent or Hospital), but new partner accounts can only work after
our team verifies them, so please use the accounts above. Partner onboarding documents (company registration, bank
details) are collected on our website, not in the app. Operations staff use a separate internal web console; there
is no staff sign-in in this app.
The accounts are reset every night. You may change or delete them.

SIGN-IN (4.8): Sign in with Apple is offered next to Google sign-in, for patients. Partner accounts use e-mail and
password.

PAYMENTS (3.1.3(e), 3.1.3(d)): payments are for medical treatment, accommodation and transport delivered in India
(physical services consumed outside the app) and for one-to-one doctor consultations. They are processed by Razorpay
(cards) or international bank transfer. The app sells no digital content or features. A live payment is not needed
for review; the demo booking is already confirmed. Agents may pay on behalf of their patients; hospitals only view
settlements.

AI (5.1.2(i), 1.4.1): AI features are optional and off by default: screening suggestions, turning a spoken or typed
description into questionnaire answers, and reading a photographed report. Before any data is sent, the app shows a
disclosure naming our AI provider (Anthropic, Claude) and what is sent, and asks for explicit permission. Voice
recordings are transcribed on our own servers and deleted after transcription. Every AI output is shown as an
editable draft that the user must confirm. Results are labelled "not a diagnosis" and advise consulting a doctor;
emergency symptoms trigger advice to seek local emergency care instead of travelling.

ACCOUNT DELETION (5.1.1(v)): Patients: Profile > Delete account. Agents and hospital users: account menu (top
right) > Delete account. Healthcare is a regulated field: while a treatment booking or payment is in progress the
app explains why deletion can't finish yet and lets the user send a deletion request, which our team completes
within 30 days. Records we must keep by law (e.g. tax invoices) are listed on that screen. The patient review
account has a confirmed booking, so to see the immediate deletion path please create a new account (or use Browse
as Guest) and delete that.

PERMISSIONS: Camera and microphone are requested only when the user taps "Take photo" or "Describe it by voice";
typing and file upload always work instead. Location is requested only when the user sends an SOS with "Share my current
location" ticked (SOS works without it). Face ID is an on-device confirmation before a payment starts; the device passcode
is the fallback. Notifications are optional.

Contact during review: <name>, <phone>, <email>.
```

Fill-in rules: no staff-console URL or path, no seeded demo password, no real patient data. If a role section is not
ready for this submission, hide it behind a server flag rather than shipping it broken, and remove its lines from the
notes. The notes describe the deletion and AI flows as they must work at submission (CG-01, CG-04, CG-33); check each
sentence against the build.

Optional attachment: a 60–90 s screen recording of the AI consent sheet, the voice review-and-confirm step, the
emergency interstitial and the account-deletion flow (patient and one partner role). These are what reviewers of
medical apps probe.

## 10. Review-guideline risk register (Apple)

### 10.1 Risks

| # | Risk | Guideline | Likelihood without fix | Mitigation |
|---|---|---|---|---|
| 1 | Google sign-in without a qualifying alternative | 4.8 | **Certain rejection** | CG-02 (Sign in with Apple, or hide Google on iOS) |
| 2 | No in-app deletion, including guests and reviews | 5.1.1(v) | **Certain** | CG-01 |
| 3 | Data sent to third-party AI without named, explicit permission | 5.1.2(i) (third-party AI wording) | High | CG-04 |
| 4 | Unverifiable accuracy or outcome claims ("98% success", "78% find…", savings, "Zero Wait Time"); no "check with a doctor" | 1.4.1, 2.3 | High | CG-03, CG-05 |
| 5 | AI output that looks diagnostic (possible conditions with likelihood) | 1.4.1 (greater scrutiny for diagnosis) | Medium–High | CG-13 |
| 6 | False privacy statements in the app ("HIPAA Compliant", "never stored") | 5.1.1(i), 2.3 | High | CG-03 |
| 7 | Individual developer account for a healthcare service | 5.1.1(ix) | Certain if individual | CG-07 |
| 8 | Broken or placeholder features in review: Google button fails on iOS, Flutter icon, empty demo data | 2.1 | High | CG-06, CG-11 |
| 9 | Push with sensitive content, or marketing push without opt-in | 4.5.4 | Medium when push ships | CG-15 |
| 10 | Chat and reviews without report or block or contact details | 1.2 | Medium | CG-16 |
| 11 | Health data in iCloud backups; health data used for marketing | 5.1.3(i)–(ii) | Medium | CG-21; privacy-policy statement |
| 12 | Inaccurate purpose strings (Face ID "protects medical information"); location declared but unused | 5.1.1(ii) | Medium | §7, CG-10 |
| 13 | iPad or landscape layout broken in review | 2.1 / 4 | Medium (iPad enabled today) | CG-22 |
| 14 | Third-party trademarks (hospital brands, JCI/NABH logos, WHO emblem) | 5.2 Intellectual Property | Medium | CG-19 |
| 15 | Implied government affiliation | 2.3 / 5.2 | Low–Medium | CG-20 |
| 16 | Missing privacy manifest or required-reason APIs; old SDK | Upload validation | Upload blocked | CG-09, CG-23 |
| 17 | Payment-method confusion ("Pay with Face ID" reads like Apple Pay; "with Affirm" not integrated) | 2.3 / 2.1 | Medium | CG-17 |
| 18 | Apple button calls a backend endpoint that doesn't exist (`POST /auth/apple`) | 2.1, 4.8 | **Certain** | CG-02 |
| 19 | Reviewer can't reach the agent or hospital section (no account, unapproved partner, MFA prompt, empty data) | 2.1 | High | CG-06, CG-32: three review accounts (§9.1) |
| 20 | Deletion missing in the agent and hospital sections, or "blocked" with no way forward | 5.1.1(v) | **Certain** for partner roles | CG-01 |
| 21 | Audio, transcripts or report images sent to a third-party AI without the disclosure naming it, or the label missing Audio Data | 5.1.2(i), 5.1.1(ii), App Privacy accuracy | High | CG-04, CG-33 |
| 22 | Agents enter other people's health and passport data without the patient's consent on record | 5.1.1(i)–(ii), 5.1.2 | Medium | CG-14 |
| 23 | Reviewer sees business features unrelated to the listing and flags a mismatch, or reads the partner sections as an "enterprise" app that should use Apple Business Manager | 2.3.1, 3.2 | Low–Medium | Partner block in the description, screenshots 9–10, the role explanation in §9.2. Public sign-up is open to any agency or hospital, so Custom App distribution is not required |
| 24 | Staff console exposed through the app or the review notes | — (security, PLAN §3.1) | Low | Staff door stays web-only and unnamed (§0.1) |

### 10.2 Payments for real-world services

- **3.1.3(e):** "If your app enables people to purchase physical goods or services that will be consumed outside of
  the app, you **must** use purchase methods other than in-app purchase." Treatment, stays, transfers, translators
  and guides qualify, so Razorpay and bank transfer are required, and IAP must not be used.
- **3.1.3(d):** real-time person-to-person services between two individuals, explicitly including "medical
  consultations", **may** use non-IAP methods, so `consultation_fee` is fine. Note that "one-to-few and one-to-many
  real-time services must use in-app purchase". Keep tele-consults 1:1. Whether an interpreter joining makes a call
  "one-to-few" is untested; the interpreter is support, not a second provider, so price the consult per doctor.
- **Anything digital needs IAP:** a paid AI report, a subscription for priority matching, or paid downloadable
  guides would all be digital content (3.1.1).

## 11. Pre-submission checklist

**Account and build**
- [ ] Organisation account; agreements, tax and banking done; trader status declared (CG-07).
- [ ] Built with Xcode 26 / iOS 26 SDK on macOS CI; `ITSAppUsesNonExemptEncryption = false`; privacy manifest and
      report clean (CG-09, CG-23).
- [ ] Capabilities: Sign in with Apple entitlement and App ID capability, and `POST /auth/apple` live in production
      (CG-02); Push if shipped; Google `GIDClientID` and URL scheme real (CG-11); brand icons (CG-11).
- [ ] Device scope decided (iPhone-only or iPad QA'd) (CG-22).

**Listing and privacy**
- [ ] Metadata §3 entered; screenshots §8; category Medical / Travel.
- [ ] Age rating §5 (18+ decision recorded).
- [ ] App Privacy §6 matches the build; privacy policy and choices URLs live (CG-08).

**Review**
- [ ] Three review accounts (patient, agent, hospital) created by the review fixture in production, MFA off, data
      present, passwords rotated; the shared demo password `HealIndia@2026` appears nowhere in App Store Connect
      (CG-06, CG-32).
- [ ] Review notes §9.2 filled in and checked sentence by sentence against the build; no staff-console path.
- [ ] Delete account tested from all three sections, including the "blocked" path and an Apple-ID account (CG-01).
- [ ] Camera, microphone and AI consent flows tested by each role that can reach them (CG-33).
- [ ] P0 gaps closed: CG-01 to CG-05, CG-10, CG-32 and CG-33.
- [ ] TestFlight external beta with real devices (iPhone SE size to Pro Max; iPad if supported) before submission.

## 12. Open questions and uncertainty

1. **4.8 future edits** and how strictly button prominence is enforced (§4).
2. **3.1.3(d) "one-to-few"** when an interpreter joins a paid consultation (§10.2).
3. **Rating:** whether Apple's calculation lands on 16+ exactly as expected (§5). The definitions page lists
   frequent medical information under 16+.
4. **Privacy-label edge cases:** Sensitive Info and Other Usage Data are declared conservatively. Removing them
   needs a deliberate decision with legal.
5. **China mainland:** ICP filing. Excluded unless the business decides otherwise.
6. **Domain, support email and legal entity name:** confirm, then re-count §3.
7. **One app or two?** Serving partners in the patient app is allowed and keeps one codebase, but partner features
   raise review surface (more accounts, more data types on the label). If review friction grows, a separate partner
   app (or hiding partner sign-up behind an invite) is the fallback. Decide after the first review cycle.
8. **Partner social login rule** (§4 point 2): log in to the existing partner account or refuse. Either is fine for
   4.8 as long as Google and Apple behave the same.

## 13. Sources

Checked 2026-10-21:

| Topic | Source |
|---|---|
| App Review Guidelines (1.2, 1.4.1, 2.1, 2.3.3, 2.3.7, 3.1.3(d)/(e), 4.5.4, 4.8, 5.1.1, 5.1.2, 5.1.3) | <https://developer.apple.com/app-store/review/guidelines/> |
| Offering account deletion in your app | <https://developer.apple.com/support/offering-account-deletion-in-your-app/> |
| App privacy details | <https://developer.apple.com/app-store/app-privacy-details/> |
| Age ratings values and definitions | <https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/> |
| Upcoming requirements (Xcode 26 / iOS 26 SDK from 2026-04-28) | <https://developer.apple.com/news/upcoming-requirements/> |
