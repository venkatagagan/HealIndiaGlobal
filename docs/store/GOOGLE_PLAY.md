# Google Play — listing, declarations and policy risks (one app: patients, agents, hospital users)

> Owner: product-docs · App: the Flutter app in `mobile/` (`applicationId com.healindiaglobal.app`).
> Policy texts were checked on **2026-10-21** against Google's public help pages (§12). Play policies change often:
> re-check §5, §6 and §9 before every submission.
> Related: [APP_STORE.md](APP_STORE.md) · build actions [COMPLIANCE_GAPS.md](COMPLIANCE_GAPS.md) (`CG-xx`) ·
> [Terms](../legal/TERMS_OF_SERVICE.md) · data protection [DEPLOYMENT.md §13](../DEPLOYMENT.md) ·
> [SECURITY.md](../SECURITY.md) · journeys [USER_JOURNEYS.md](../product/USER_JOURNEYS.md).

**Revised 2026-10-21 (evening).** The mobile app now serves **patients, agents (facilitators) and hospital users
through one login**, with a role-based section for each (PLAN §3.1; roles and tabs in
[APP_STORE.md §0.1](APP_STORE.md#01-who-the-app-is-for-plan-31)). Staff (admin, finance, support) never sign in on
mobile: their door is web-only and must not be named in the listing or the App access notes. The Data safety form is
per app, so it covers what all three roles send through it. The product is **English only**: the listing is English
(en-US, optionally en-GB with the same copy) and no other store localisations are planned. Voice intake is English
only too: it transcribes spoken English, with no translation.

URLs assume the production domain `healindiaglobal.com` from the PLAN §3.1 example. If the domain differs, replace it
and re-count the copy in §3.

## 0. Submission blockers

Don't submit to any track that reviewers see until these P0 items are closed (details in COMPLIANCE_GAPS.md):

| CG | Blocker | Play policy hit |
|---|---|---|
| CG-01 | Deletion exists for patients (`DELETE /auth/me`, Profile) but **not in the agent or hospital sections**; no public web deletion page for any role yet | User Data policy: account deletion; Data safety form needs the URL |
| CG-32 | Reviewer needs a working account for each role section; staff stay out of the app | App access declaration |
| CG-33 | `RECORD_AUDIO` (voice intake) and camera capture now ship; Data safety must declare voice recordings and photos, and the AI disclosure must cover them | User Data (prominent disclosure); Data safety accuracy; Permissions |
| CG-03 | Unsubstantiated claims in onboarding ("500,000+", "70% Less Cost", WHO badge, "Zero Wait Time", "Joint Commission Certified") and designs ("HIPAA Compliant", "never stored") | Deceptive behaviour · Health misinformation · Metadata |
| CG-04 / CG-05 | AI disclosure + medical disclaimers in app and listing | User Data (prominent disclosure) · Health Content and Services |
| CG-06 | Reviewer credentials and seeded data | App access declaration |
| CG-07 | Organisation developer account (D-U-N-S), EU trader status | Developer account requirements for health apps |
| CG-08 | Public privacy policy URL + in-app link | User Data policy |
| CG-10 | Location permissions declared but unused | Permissions policy; Data safety accuracy |
| CG-11 | Flutter default launcher icon, debug release signing, final `applicationId` | Metadata/IP; upload |
| CG-12 | Data safety must include what the Razorpay SDK collects | Data safety accuracy |

---

## 1. App identity and developer account

| Field | Value / decision |
|---|---|
| Developer account type | **Organisation** (D-U-N-S number). Google lists health apps such as Medical apps among those needing an organisation account (CG-07) |
| Developer name | The operating company's legal or trading name: the same entity as the Terms §1, invoices and privacy policy |
| Contact details | Email `support@healindiaglobal.com` *(confirm)* · website `https://healindiaglobal.com` · phone optional · physical address (shown for organisations and EU traders) |
| EU Digital Services Act | Declare **trader** |
| Package name | `com.healindiaglobal.app` (current `applicationId`). **Permanent after first upload** (CG-11) |
| App / game · Free / paid | App · Free |
| Contains ads | **No** |
| In-app products | None. Play Billing is not used (physical services, §9.2) |
| Default listing language | English (United States), en-US. **English only**: optionally add English (United Kingdom), en-GB, with the same copy in British spelling. No other translations of the listing |
| Countries | Target source markets first. Exclude sanctioned jurisdictions and anywhere card acceptance (Razorpay international) or the legal review fails |

## 2. Category and tags

**Recommendation: Medical.** Treat "travel" as a secondary intent served by description keywords and tags.

| | **Medical** (recommended) | Health & Fitness | Travel & Local |
|---|---|---|---|
| Matches what the app does | Yes: finding, comparing and booking medical treatment; health data is core | Weak: Play positions it for fitness, nutrition and wellness | Partial: only the logistics half |
| Health apps declaration | Required either way (every app files it); answer "Medical › Healthcare Services and Management" | Same | Same |
| Health Content and Services policy | Applies (it follows functionality, not category) | Applies | Applies |
| Organisation account | Required for health apps | Same | Same, given the health features |
| Data safety optics | Health info is expected in a medical app | Fine | Health info in a travel app looks odd and erodes trust |
| Audience intent | Patients looking for hospitals and doctors (high intent) | Fitness browsers (low intent) | Travellers (medium) |
| Mis-categorisation risk | Low | Medium (Metadata policy expects an accurate category) | Medium |

Policy implications of **Medical**:
1. A stricter reading of health claims (CG-03).
2. The description must carry the "not a medical device" disclaimer (§3.3).
3. The Health apps declaration answer must be consistent (§5).
4. An organisation account (CG-07).

None of these is avoided by choosing another category, because they follow functionality.

**Tags:** pick up to 5 from Play Console's list, closest to medical, healthcare, hospitals or doctors, appointments
and travel planning. Tag names vary, so choose in the Console.

## 3. Store listing copy (en-US)

Counts are Unicode characters, newlines included, measured with a script on 2026-10-21.

### 3.1 App name (≤ 30)

| Option | Text | Chars |
|---|---|---|
| **A (recommended)** | `Heal India Global` | 17/30 |
| B (only if a listing experiment justifies it) | `Heal India Global: Med Travel` | 29/30 |

Never put "best", "#1", "top", "free", prices, percentages or emoji in the title.

### 3.2 Short description (≤ 80)

| Option | Text | Chars |
|---|---|---|
| **S1 (recommended)** | `Find hospitals in India, compare treatment costs and plan your medical trip.` | 76/80 |
| S2 | `Compare hospitals and treatment costs in India, then book and plan your trip.` | 77/80 |
| S3 | `Get matched with hospitals in India, compare costs, book and plan your trip.` | 76/80 |
| S4 (if partners become a growth channel) | `Medical travel in India for patients, facilitators and partner hospitals.` | 73/80 |

S1 stays recommended: patients are the audience that searches the store. Partners are mentioned in the full
description.

### 3.3 Full description (≤ 4000) — 3,900/4,000

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
• Confirm payments with your fingerprint, face or screen lock
• Amounts shown in your currency, with itemised receipts in the app
• Card details go directly to the payment provider and are never stored by us

PRIVACY
• Your medical information is shared only with the hospitals you ask for a quote, your care coordinator and, if you work with one, your facilitator
• AI features are optional. If you turn them on, your answers, the text of a voice description or the reports you choose are sent to our AI provider, Anthropic (Claude), to suggest specialties or summarise a report. Your name and contact details are not sent with them, although a report you choose may show them
• Voice recordings are transcribed on our own servers and deleted after transcription; you check the text before it is used
• No ads and no tracking
• Delete your account in the app from your profile or account menu, or at healindiaglobal.com/account/delete

IMPORTANT
• Heal India Global is not a medical device and does not diagnose, treat, cure or prevent any medical condition. Screening results, including AI suggestions, are not a diagnosis. Always consult a qualified healthcare professional for medical advice, diagnosis or treatment.
• This app is not an emergency service. If you have emergency symptoms, call your local emergency number and do not travel for treatment.
• Heal India Global is a facilitator. Treatment is provided by independent hospitals and doctors, who are responsible for your clinical care. Prices are estimates until the hospital confirms them after examining you.
• Heal India Global is a private company and is not affiliated with the Government of India or its "Heal in India" initiative.
• For adults aged 18 and over.

Questions? Contact support@healindiaglobal.com
```

How the copy maps to policy and to PLAN:
- **Required health disclaimer.** Health Content and Services wants "not a medical device and does not diagnose,
  treat, cure, or prevent any medical condition" plus a reminder to consult a professional. Both are in IMPORTANT.
- **No testimonials, statistics or savings promises.** The Metadata policy bans unattributed testimonials, and
  CG-03 lists the unverifiable claims. Costs are described as "estimated" or "indicative", matching
  `/cost-comparison` (PLAN §8.4) and quotes being estimates (Terms §7).
- **Every feature claim maps to PLAN:**

  | Claim | PLAN source |
  |---|---|
  | Match reasons | `MatchOut.reasons[]` |
  | Currency | `preferred_currency` + FX snapshot |
  | Instalments | `PaymentOption.installments` |
  | Checklist keys | §4.7 |
  | Visa invitation letter | `visa_requests.invitation_letter_document_id` |
  | Helplines | `/content/helplines` |
  | SOS | `POST /travel/sos` |
  | Receipts | `/payments/invoices/{id}/pdf` |
  | Card data never stored | §9.6 |
  | Passport encrypted and masked | §4.2, §8.2 |
  | AI without identifiers | DEPLOYMENT §13 |

- **Partner block ("FOR FACILITATORS AND HOSPITAL TEAMS").** Each claim maps to the mobile shells: agent tabs
  Dashboard · Patients · Cases · Bookings · Earnings; hospital tabs Dashboard · Enquiries · Patients · Settlements ·
  More. "Verified before they go live" = `agent.approved` / `hospital.approved`. No commission rates or income
  figures.
- **Voice line.** Holds only while `STT_PROVIDER=local_whisper` and `VOICE_RETAIN_AUDIO=false` in production
  (PLAN §7.2). The app and voice intake are English only: the user speaks English, checks the transcript and the
  extracted answers, then confirms. Never promise other spoken languages or translation.
- **AI line** covers screening, voice-text extraction and "Read my report with AI" (PLAN §7, §7.1, §7.2). A report
  the user chooses can show their name, so the copy doesn't claim reports are anonymous.
- **"24/7" is deliberately left out** until the helpline is actually staffed round the clock (CG-03).
- **The deletion path and URL** must exist before release (CG-01). **The AI paragraph** must match the shipped
  consent flow (CG-04).
- **The payment-plan wording** assumes v1 instalments finish before admission (CG-18). Don't mention Affirm or any
  BNPL brand.

### 3.4 Search terms (Play has no keyword field)

Use these naturally in the description; repetition and keyword stuffing break the Metadata policy:
- medical treatment in India, hospitals in India, medical travel / medical tourism India;
- surgery abroad, treatment cost comparison;
- procedure terms tied to live specialties: heart surgery / cardiac, knee and hip replacement, dental treatment,
  cosmetic surgery, cancer treatment;
- e-Medical visa, second opinion (only once tele-consults are live, ROADMAP R1).

Never use hospital brand names ("Apollo", "Fortis", "Medanta" and so on) or competitor app names.

### 3.5 Release notes v1.0.0 (≤ 500)

`First release: describe your condition by text or voice, get matched with hospitals in India, compare estimated
costs, request quotes, book and pay securely, and plan your visa, travel and stay. Approved facilitators and partner
hospitals can manage their cases, quotes, bookings and earnings in the same app.` (309/500)

## 4. Graphics and screenshot plan

**Asset specs** (Play Console; re-confirm at upload):

| Asset | Spec |
|---|---|
| App icon | 512×512 PNG, 32-bit with alpha, ≤ 1 MB. Generated from `design/icons/app-icon.svg`, **not** the Flutter default (CG-11) |
| Feature graphic | 1024×500 JPEG or 24-bit PNG (no alpha). Concept: hero gradient `#7B2FF7 → #2563EB → #06B6D4`, logo `design/logo/logo-horizontal-on-dark.svg`, tagline "Your Gateway to Indian Medical Excellence". No prices, percentages, statistics, accreditation logos or "download now" |
| Phone screenshots | 2–8; JPEG or 24-bit PNG; 9:16; each side 320–3840 px and the long side ≤ 2× the short. Use 1080×1920 or larger; ≥ 4 at ≥ 1080 px keeps the listing eligible for promotional placements |
| Tablet screenshots | Only after tablet layouts pass QA (CG-22) |

**The 8 phone screenshots** (dark theme, as designed; English UI only). The design files are the five `WhatsApp Image
2026-10-07 at 7.39.24 PM*.jpeg` in the repo root: `(0)` is the file without a suffix, `(1)`–`(4)` the variants. Play
allows at most 8 phone screenshots, so the plan is six patient screens, then one agent and one hospital screen. The
first screenshots are the ones most users see, so they stay patient-only.

| # | Screen (design file › panel) | Route | Caption (≤ 40) | Edits before capture |
|---|---|---|---|---|
| 1 | Service Category Selection (0 › 5) | `/home` | Explore treatments by specialty | Remove the "Save xx–yy%" chips or replace them with specialty sub-labels (CG-03). Bottom nav must match the build: Home · Search · Trips · Messages · Profile (the design shows "Saved") |
| 2 | Intelligent Questionnaire step 1, body map (1 › 1), with the "Describe it by voice" button | `/screening/:id/step/1` | Tell us where it hurts | Use the stylised body map from `design/body-map/`, not a photoreal anatomy render (content rating, §7) |
| 3 | Your Top Matches (2 › 2) | `/screening/:id/matches` | See matched specialists and why | Sample data only: "Dr. A. Sharma (sample)", "Sample Hospital, New Delhi" (CG-19). Remove "98% Success" (CG-03). Keep the "95% match" score and reasons. Show "Not a diagnosis" (CG-05) |
| 4 | Treatment Comparison (2 › 3) | `/cost-comparison` | Compare estimated costs | Ranges labelled "estimated"; footnote "Indicative ranges; final price in the hospital's quote" |
| 5 | Pre-Arrival Dashboard (4 › 1) | `/trips` | Track visa, flights and pickup | Neutral countdown (e.g. 23 days); checklist mix of done and pending |
| 6 | In-Country Support (4 › 2) | `/support` | Support on the ground in India | "© OpenStreetMap contributors" visible (CG-29); "Call helpline" (no "24/7" unless staffed); sample appointment |
| 7 | Agent: case detail with quote comparison (no design; capture from build) | `/agent/cases/:id` | For facilitators: manage patient cases | Seeded fictional patient and two sample hospitals; no commission amounts |
| 8 | Hospital: itemised quote builder (no design; capture from build) | `/hospital/cases/:id/quote` | For hospitals: send itemised quotes | Sample hospital; plausible INR line items; no real doctor names |

Screenshots 7 and 8 come from a release build against a seeded **non-production** database (`python -m
scripts.seed`, fictional `.example` data); crop or blur demo e-mail addresses. The renumbered rows 3 and 4 are the
earlier rows 4 and 5 with the same edits.

Not used, and why:
- **Onboarding and Registration screens.** They carry the claims in CG-03, and a login screen is weak as a
  screenshot.
- **Questionnaire steps 2–4, Treatment Selection and the voice review sheet.** Lower value than the partner screens
  within the 8-screenshot limit (Apple, which allows 10, keeps Treatment Selection and the voice review).
- **Anything from the staff console.** It is web-only and unlisted.
- **AI processing animation.** Its "78%" statistic.
- **Payment screen.** It shows "with Affirm" and "Pay with Face ID" (CG-17), and payment screens invite scrutiny.

**Rules for every screenshot and the feature graphic:**
- Real app UI from a release build, with fictional sample data. No real patient, doctor or hospital data unless
  written permission is on file.
- No pricing promotions, rankings, awards, "best" or "#1".
- Prices always labelled as estimates.
- Captions are factual, not promotional.

## 5. App content declarations (Policy › App content)

| Declaration | Answer | Notes |
|---|---|---|
| Privacy policy | `https://healindiaglobal.com/privacy` | Public HTML, active, not geofenced, not a PDF. Also linked in-app (CG-08) |
| App access | "All or some functionality is restricted" + **three instruction sets**, one per role (Play Console allows several) | Same dedicated production review accounts as Apple ([APP_STORE.md §9.1](APP_STORE.md#91-review-accounts-one-per-role)): `review.patient@…` ("Cases shows a quote to accept; Trips shows a confirmed booking"), `review.agent@…` ("Patients, Cases with quotes to compare, Earnings"), `review.hospital@…` ("Enquiries: send an itemised quote; Patients: admit/discharge; Settlements"). Unique strong passwords, MFA off, rebuilt nightly. Create or refresh them with `python -m scripts.seed_review_accounts` (passwords from the `REVIEW_PATIENT_PASSWORD`, `REVIEW_AGENT_PASSWORD`, `REVIEW_HOSPITAL_PASSWORD` environment variables, set from the password manager; see APP_STORE.md §9.1). Enter the e-mail and password of each account only here in Play Console › App content › App access, never in the repository. Add: "Payment is not needed for review. Staff do not use this app." **Never** enter the seeded demo password `HealIndia@2026` or `@healindia.example` accounts: that password is public in the repo and those accounts exist only in dev/staging (CG-06, CG-32) |
| Ads | **No** | |
| Content rating | IARC questionnaire, §7 | |
| Target audience and content | **18 and over** only; the app does not appeal to children | Avoids the Families policy |
| News app | No | |
| COVID-19 contact tracing / status | No | |
| Data safety | §6 | Includes the account deletion URL |
| Government app | **No** | Also states non-affiliation (CG-20) |
| Financial features | **"My app doesn't provide financial features"**, valid only if v1 instalments finish before admission with no interest or fees (CG-18) | Otherwise declare the closest credit or BNPL feature and meet the Financial Services policy |
| Health apps | **Medical › Healthcare Services and Management** (booking, coordination, care-team messaging). Optional: **Medical Reference and Education** (procedure explainers, cost guides) | Do **not** tick "Medical Device Apps" (CG-13). Don't tick "Clinical Decision Support": the AI suggests a specialty for navigation, labelled not a diagnosis. Revisit if counsel classifies it differently |
| Advertising ID | **No**, the app doesn't use it | Check the merged manifest has no `com.google.android.gms.permission.AD_ID`; remove it with `tools:node="remove"` if an SDK adds one |
| Photo and video permissions | Not applicable | No `READ_MEDIA_*` / `READ_EXTERNAL_STORAGE`. Documents come through the system picker (`file_picker` 13.1.0 declares no permissions) and report photos through `image_picker_android` 0.8.13+25, which uses the system photo picker and the camera intent and declares no permissions (both verified in the pub cache). Re-check the merged manifest at release |
| Background location, foreground service, full-screen intent, exact alarms, accessibility, VPN, Health Connect | Not used | |

## 6. Data safety form

### 6.1 Overview answers

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | **Yes** |
| Is all user data collected by the app encrypted in transit? | **Yes**: HTTPS/WSS only; release manifest has `usesCleartextTraffic="false"`; the production `API_BASE_URL` must be `https://` |
| Account creation methods | **Username and password** (email + password, all three roles; partners via the Agent / Hospital register tabs or a hospital member invite) · **OAuth** (Google sign-in, patients only) · **Other** (automatically created guest accounts). Sign in with Apple is iOS-only and not offered in the Android build. Labels may differ slightly in the Console |
| Account deletion URL | `https://healindiaglobal.com/account/delete` (CG-01). **Does not exist yet** (the website has no such page). It must work for patients, agents and hospital users, name the app and developer exactly as on Play, and explain the in-app path for each role |
| Can users request deletion of some data without deleting the account? | **Yes** once CG-01 step 5 ships (`https://healindiaglobal.com/account/data`): delete documents, screenings and saved items; withdraw consents. Until then **No** |
| Independent security review (MASA) | No (optional; consider after launch) |

### 6.2 Data types

Rules applied:
- Google counts SDK collection as ours.
- Service providers acting for us (cloud host, Razorpay, Anthropic, email and push providers) are **not**
  "sharing".
- Transfers to hospitals, the patient's agent and travel vendors are declared **shared**. Staff-initiated vendor
  bookings and agent visibility for referred patients don't clearly fit the "user-initiated action" exemption
  (§6.3).
- "Optional" means the user can use the app (guest browsing) without providing the data.
- The form is per app. Data that agents enter about patients, and that hospital users write (quotes, admission and
  discharge notes), is collected through the app and is declared under the same types.

| Category · type | Collected | Shared | Req./Opt. | Purposes | What it is (PLAN) |
|---|---|---|---|---|---|
| Location · Approximate | Yes¹ | No | Optional | App functionality | SOS coordinates when only approximate access is granted (`sos_alerts`) |
| Location · Precise | Yes¹ | No | Optional | App functionality | SOS coordinates (`sos_alerts.lat/lng`) |
| Personal info · Name | Yes | **Yes** | Required | App functionality, Account management, Advertising or marketing², Fraud prevention/security/compliance | `users.full_name`, profile names; patient names entered by agents; agency and hospital names at partner sign-up; hospitals and agents see patient names |
| Personal info · Email address | Yes | **Yes** | Required | App functionality, Account management, Developer communications, Advertising or marketing², Fraud prevention/security/compliance | Login and notices; the patient's agent sees it |
| Personal info · User IDs | Yes | No | Required | App functionality, Account management, Fraud prevention/security/compliance | Account id, Google account id (`google_sub`) |
| Personal info · Address | Yes | **Yes** | Optional | App functionality | `patient_profiles.address` (invitation letter, stays) |
| Personal info · Phone number | Yes | **Yes** | Optional | App functionality, Account management | Phone, WhatsApp, emergency contact; pickup and service vendors |
| Personal info · Race and ethnicity / Political or religious beliefs / Sexual orientation | No | — | — | — | Not asked (nationality and gender are "Other info") |
| Personal info · Other info | Yes | **Yes** | Optional | App functionality, Fraud prevention/security/compliance | DOB, gender, nationality, residence, **passport number and expiry** (also when an agent enters them for a patient), language and currency preference, emergency contact and companions' details (§4.2); hospital city at partner sign-up |
| Financial · User payment info | Yes³ | No | Optional | App functionality, Fraud prevention/security/compliance | Card, UPI or bank details entered in **Razorpay's** checkout SDK; they go to Razorpay and never reach our servers (PLAN §9.6) |
| Financial · Purchase history | Yes | **Yes** | Optional | App functionality, Account management, Fraud prevention/security/compliance | Bookings, orders, instalments, receipts; hospital and agent see booking and payment status |
| Financial · Credit score | No | — | — | — | |
| Financial · Other financial info | Yes | **Yes** | Optional | App functionality, Fraud prevention/security/compliance | Bank-transfer reference and proof, insurance provider and policy number, insurance-claim request (hospital) |
| Health and fitness · Health info | Yes | **Yes** | Optional | App functionality | Screening answers (typed or from a voice transcript), notes, medical history, allergies, blood group, reports and their confirmed AI extraction, AI result, case and treatment details, quotes and admission/discharge notes; shared with hospitals asked for a quote and the patient's agent |
| Health and fitness · Fitness info | No | — | — | — | |
| Messages · Emails / SMS or MMS | No | — | — | — | We send emails; we don't read users' email or SMS |
| Messages · Other in-app messages | Yes | No⁴ | Optional | App functionality | Case and support chat (`messages`) |
| Photos and videos · Photos | Yes | **Yes** | Optional | App functionality | Report photos taken with the camera or picked from the gallery (`image_picker`, up to 10 pages), passport or visa scans, profile photo. EXIF/GPS stripped server-side before AI processing |
| Photos and videos · Videos | No | — | — | — | Upload allow-list has no video (§8.3) |
| Audio · Voice or sound recordings | **Yes** | No | Optional | App functionality | Spoken description of symptoms (English, ≤ 3 min, `record`), uploaded and transcribed on our own servers (local Whisper; Anthropic receives only the transcript text). The file is deleted after transcription (`VOICE_RETAIN_AUDIO=false`). Not "processed ephemerally": it is stored until the transcription job runs. The transcript is Health info |
| Audio · Music files / Other audio files | No | — | — | — | |
| Files and docs | Yes | **Yes** | Optional | App functionality | PDFs, DICOM, payment proofs (`documents`) |
| Calendar / Contacts | No | — | — | — | Travel window is typed; emergency contact typed, not read from the address book |
| App activity · App interactions | Yes | No | Required | Fraud prevention/security/compliance | Security audit records of account actions (`audit_logs`); no analytics SDK |
| App activity · In-app search history | No⁵ | — | — | — | |
| App activity · Installed apps | No⁶ | — | — | — | |
| App activity · Other user-generated content | Yes | **Yes** | Optional | App functionality | Case notes (`patient_notes`); reviews when launched |
| App activity · Other actions | Yes | No | Optional | App functionality, Fraud prevention/security/compliance | Saved hospitals and doctors, consent choices |
| Web browsing | No | — | — | — | |
| App info and performance · Crash logs / Diagnostics / Other | No⁷ | — | — | — | No crash or performance SDK in the app |
| Device or other IDs | Yes | No | Required | App functionality, Fraud prevention/security/compliance | IP address and user agent kept with sessions, consents and audit; push token once push ships (CG-15); Razorpay SDK device signals (CG-12) |

Footnotes:
1. SOS location ships (CG-10a, done 2026-11-09): answer **Yes**, optional, app functionality.
2. Only if opt-in marketing emails are sent (`ConsentKind.marketing`). Never use health data for marketing.
3. Collected by the Razorpay SDK inside the app. Confirm against Razorpay's SDK disclosure (CG-12).
4. Messages go to participants the user writes to, which is user-initiated. They are still named in the privacy
   policy.
5. Stays "No" only while search queries are not persisted or logged (CG-31).
6. Confirm Razorpay doesn't upload the list of installed UPI apps (CG-12). If it does: Yes, App functionality, not
   shared.
7. Update if Sentry or Crashlytics is added to the app (DEPLOYMENT §9 uses Sentry server-side only).

Nothing is "processed ephemerally": all collected items are stored. Location used only to draw the map on the
device is never sent, so it is not "collected".

### 6.3 Why some data is marked "shared"

Google's exemptions cover service providers, legal requests, user-initiated transfers the user expects, and fully
anonymised data. Sending a case to the hospital the patient picks on "Request quote" is user-initiated. These flows
are not:
- referred patients become visible to their agent automatically (PLAN §9.1; CG-14);
- coordinators book hotels, pickups and translators for the patient (travel desk, staff-initiated);
- agents create cases for patients (PLAN §8.7).

Over-declaring "shared" is allowed; under-declaring is a policy violation. Revisit once CG-14 makes every transfer
user-initiated and consented.

### 6.4 Keep the form true

Change the form **before** shipping any of these (release checklist gate, CG-12):
- push (Device or other IDs);
- a crash or analytics SDK (App info and performance, App interactions → Analytics);
- video tele-consults (Videos, and Audio for the call, probably "processed ephemerally" if not recorded);
- keeping voice recordings (`VOICE_RETAIN_AUDIO=true`) or a cloud speech-to-text engine (Audio becomes shared with
  a service provider; update the privacy policy);
- payout-account or KYC forms in the app's partner sections (Financial info › Other; Files and docs);
- WhatsApp notifications (Phone number → Developer communications);
- passport scanning on the device (no change if images never leave the device);
- new BNPL partners (Financial info);
- review posting (Other user-generated content).

## 7. Content rating (IARC questionnaire)

| Topic | Answer | Notes |
|---|---|---|
| Category | The non-game, non-social category (typically "Utility, Productivity, Communication, or Other") | Labels have changed over time. Avoid "Social networking": messaging is limited to the care team |
| Violence · Fear/horror | No | Medical content is informational; no surgical imagery |
| Sexuality / nudity | No | Use the stylised body map (`design/body-map/`), not a photoreal nude render |
| Language / crude humour | No | Free-text chat is covered by "users interact" |
| Controlled substances | No | Medicines appear only in a medical context; no depiction or promotion of drug, alcohol or tobacco use |
| Gambling / simulated gambling | No | |
| Users can interact or communicate | **Yes** | Chat and file sharing with hospital staff, coordinators and the patient's agent |
| Shares the user's location with other users | **No** | SOS location goes to our support staff, not other users |
| Shares personal information with third parties (if asked) | **Yes** | Hospitals the patient chooses; facilitator |
| Digital purchases | **No** | Purchases are real-world services |
| Unrestricted internet access | **No** | Links open in the system browser; no in-app web browser |

**Expected result:** an all-ages rating (IARC 3+, PEGI 3, ESRB Everyone, USK 0) with interactive elements "Users
Interact" and "Shares Info". Regional authorities may differ, so treat this as an expectation, not a guarantee. The
18+ restriction comes from the target-audience setting (§5) and the Terms, not the content rating.

## 8. Permissions and rationales (Android)

| Permission | Level | Why | When requested | Status |
|---|---|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | normal | API, WebSocket, connectivity checks | Install-time | Declared |
| `USE_BIOMETRIC` | normal (no dialog) | `local_auth` BiometricPrompt to confirm a payment. Biometric data stays on the device; the app only gets success or failure | Install-time | Declared; `MainActivity` is a `FlutterFragmentActivity` |
| `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` | dangerous | SOS coordinates (one reading per alert, then shown on the support map) | Just-in-time when an SOS is sent with "Share my current location" ticked; never at launch; **foreground only** | Declared and used (`geolocator`, CG-10 done 2026-11-09) |
| Photos, files, documents | — (none) | Upload reports, prescriptions, passport | — | Use the system picker or Storage Access Framework (`file_picker`). Don't add `READ_MEDIA_*` / `READ_EXTERNAL_STORAGE`; the Photo and Video Permissions policy limits broad access to apps that need it as core functionality |
| `RECORD_AUDIO` | dangerous | Voice intake: record a spoken (English) description of symptoms on screening steps 1–2, for patients and for agents filling a patient's screening | Just-in-time when the user taps "Describe it by voice", after the pre-prompt below; never at launch | **Declared** (app manifest and `record_android`). Typing must remain a full alternative. No foreground service: recording stops when the app leaves the foreground |
| `CAMERA` | — (not declared) | Photographing reports (`features/documents_ai`) | — | **Not needed and must stay undeclared**: `image_picker` uses the system camera intent, which needs no permission as long as the app doesn't declare `CAMERA`. Declaring it would force a runtime grant even for the intent |
| `POST_NOTIFICATIONS` (Android 13+) | dangerous | Quote, booking, reminder and chat notifications | After the first quote request, with a pre-prompt (CG-15) | Not yet (no push) |
| `READ_BASIC_PHONE_STATE`, `NFC` | normal | Merged from the Razorpay SDK (`core 1.0.18`, `standard-core 1.7.17`) | — | Keep only if Razorpay needs them; reflect in Data safety (CG-12) |
| Must **not** be added | — | — | — | `ACCESS_BACKGROUND_LOCATION`, `CALL_PHONE` (helplines use the `tel:` dial intent, already in `<queries>`), `READ_CONTACTS`, SMS or call-log, `QUERY_ALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, `AD_ID`, `CAMERA`, `READ_MEDIA_*`, `FOREGROUND_SERVICE_MICROPHONE` |

**Pre-permission copy** (shown before the system dialog; "Not now" always available):
- **Location (SOS).** Built into the SOS confirmation: a ticked box "Share my current location with the support
  team. Used only for this alert, so we can find you faster. Your phone may ask for permission." Unticking it is
  "not now"; the SOS is sent either way. The location is read once, never in the background.
- **Biometric prompt.** No permission dialog on Android. BiometricPrompt reads: title "Confirm payment", subtitle
  "USD 1,666.67 · HIG-P-2026-000123", description "Use your fingerprint or face, or your screen lock." Allowed
  authenticators: strong biometrics or device credential.
- **Notifications.** "Get notified when your quote is ready and before appointments. We never put medical details
  in notifications."
- **Microphone (voice intake).** "Describe your symptoms by voice? We record up to 3 minutes of English, turn it
  into text on our own servers and delete the recording. You check the text and answers before anything is used.
  You can always type instead." Buttons: **Continue** / **Type instead**. Same text for an agent recording on a
  patient's behalf, with "the patient's symptoms".
- **Camera.** No permission dialog (system camera intent). The capture sheet says "Take a clear photo of each page.
  Only your care team can see it. AI reading is optional and asked separately."
- **Documents.** No permission; the picker sheet says "Upload PDF, JPG, PNG, HEIC or DICOM files (up to N MB). Only
  your care team can see them."

## 9. Policy risk register (Google Play)

### 9.1 Risks

| # | Risk | Policy | Exposure | Mitigation |
|---|---|---|---|---|
| 1 | False or unverifiable claims (statistics, savings, "Zero Wait Time", blanket accreditation, WHO, HIPAA, "never stored", success rates, testimonials) | Deceptive behaviour; Metadata; Health misinformation | **High**: in shipped code (`onboarding_content.dart`) and designs | CG-03 replacement copy; sourced-claims register |
| 2 | Missing "not a medical device" disclaimer or consult reminder | Health Content and Services | Medium | §3.3 copy; in-app labels (CG-05) |
| 3 | AI triage read as diagnosis, or as an unregistered medical device (EU) | Health Content and Services (Medical Device label, EU MDR disclosures) | Medium–High | CG-13: hide possible conditions; "not a diagnosis"; regulatory opinion before EU/UK marketing |
| 4 | No account deletion | User Data policy | **Certain rejection** | CG-01 |
| 5 | Data safety form inaccurate (SDK collection, location, push) | User Data policy (Data safety) | High | §6 answers + CG-12 gate |
| 6 | Sensitive data without prominent disclosure (AI processing, hospital sharing) | User Data policy | Medium | CG-04 disclosure; `share_with_hospitals` consent before `POST /cases` (PLAN §9.9) |
| 7 | Unused location permission | Permissions policy | Medium | CG-10 |
| 8 | Paid tele-consult fees outside Play Billing | Payments policy (silent on consultations) | Low–Medium | CG-27: confirm before enabling; §9.2 |
| 9 | Instalment plans seen as credit or BNPL | Financial features declaration / Financial Services | Medium | CG-18: pre-paid plans; never show "Affirm" |
| 10 | Implied government affiliation ("Heal India" vs "Heal in India") | Impersonation | Low–Medium | Disclaimer (in §3.3); CG-20 |
| 11 | Third-party trademarks (hospital brands, accreditation logos) in assets | Intellectual property; Impersonation | Medium | CG-19 sample data |
| 12 | UGC without reporting (chat; reviews later) | User Generated Content | Low now, rising with reviews | CG-16 |
| 13 | AI output without a report control | AI-Generated Content (scope: chatbots and image/voice generators; probably not ours) | Low | CG-16 "Report this result" anyway |
| 14 | Health data used for marketing | User Data (and Apple 5.1.3) | Low | Privacy policy statement; marketing only with opt-in, never targeted on health data |
| 15 | Target API, 16 KB pages, large-screen behaviour | Target API requirement | Medium (upload blocked) | CG-22 |
| 16 | Default Flutter icon (Google trademark) and debug signing | Metadata/IP; upload | **Certain** | CG-11 |
| 17 | Reviewer can't reach gated features, including the agent and hospital sections | App access | High | CG-06 fixture + three role instructions (CG-32) |
| 18 | No deletion in the agent and hospital sections; no public deletion page | User Data policy (account deletion) | **Certain** for partner roles | CG-01 |
| 19 | Voice recordings, transcripts or report images sent to AI without prominent disclosure, or missing from Data safety | User Data (prominent disclosure); Data safety | High | CG-04, CG-33 |
| 20 | `RECORD_AUDIO` requested without clear in-context use | Permissions policy | Low–Medium | Just-in-time request with pre-prompt; typing alternative (§8) |
| 21 | Agents enter third parties' health and passport data without patient consent on record | User Data (sensitive data) | Medium | CG-14 |

### 9.2 Payments for real-world services

- **What patients pay for.** Treatment, hospital stay, accommodation, transfers, translators and guides, all
  delivered in India. Google's Payments policy says Play's billing system **must not** be used "for the purchase of
  physical services". Razorpay checkout (cards, plus UPI and netbanking for Indian accounts) and SWIFT bank transfer
  are therefore correct, and required. Google Pay may also be offered for physical goods and services.
- **Consultation fees** (`PaymentPurpose.consultation_fee`). The policy does not mention consultations or telehealth
  (checked 2026-10-21). We treat a doctor's 1:1 consultation as a real-world professional service, which is common
  practice among telehealth apps. This is an interpretation, not a stated exemption, so confirm with Play policy
  support before charging tele-consult fees in the Android app (CG-27).
- **Never sell digital goods without Play Billing.** That includes a paid "premium AI report", a priority-matching
  subscription or paid guides. Alternative-billing and external-offer programmes cover digital goods only and don't
  apply to us.

## 10. Pre-launch checklist (Play Console)

**Account and listing**
- [ ] Organisation account verified (D-U-N-S); trader status declared; contact details final.
- [ ] Listing: name A, short S1, full description §3.3 (re-count if the domain changes), release notes.
- [ ] Graphics: icon, feature graphic, 8 screenshots per §4 rules.
- [ ] Category Medical; tags.

**Declarations and data safety**
- [ ] Privacy policy live (CG-08) and linked in the app.
- [ ] App content: all §5 declarations, including Health apps, Financial features and Advertising ID.
- [ ] Data safety §6 entered; deletion URLs live; matches the merged manifest and SDKs (CG-12).
- [ ] App access: three role instructions; dedicated review accounts work against production, MFA off, fixture
      reset; seeded demo password and `.example` accounts not used (CG-06, CG-32).
- [ ] Delete account works in all three sections and on the public page (CG-01).

**Build**
- [ ] AAB signed with the upload key; Play App Signing on (CG-11).
- [ ] Target API ≥ 36; 16 KB check passed (CG-22).
- [ ] P0 gaps closed: CG-01, CG-03, CG-04, CG-05, CG-10, CG-32, CG-33.

**Rollout**
- [ ] Internal → closed testing → production. Staged rollout 10% → 50% → 100% with crash and ANR monitoring in
      Android vitals.

## 11. Open questions and uncertainty

1. **Organisation account wording.** Google's pages say health apps "must" (2024 announcement) or "should" (current
   help) use organisation accounts. We assume must.
2. **Consultation fees.** Not addressed by the Payments policy (§9.2).
3. **Health apps declaration categories.** Whether reviewers expect "Clinical Decision Support" for patient-facing
   triage. We chose not to tick it and to keep the AI positioned as navigation (CG-13).
4. **Razorpay SDK data collection.** Get Razorpay's statement for the exact SDK version (CG-12).
5. **IARC outcomes.** Can vary by region; treat §7 as expected, not guaranteed.
6. **Domain, support email and legal entity name.** Confirm, then re-count §3.3.
7. **Partner sections and target audience.** The 18+ audience and Medical category still fit, since partners are
   adults and the core use is healthcare. Keep the patient journey primary in the listing.

## 12. Sources

Checked 2026-10-21:

| Topic | Source |
|---|---|
| Account deletion requirements | <https://support.google.com/googleplay/android-developer/answer/13327111> |
| Data safety form | <https://support.google.com/googleplay/android-developer/answer/10787469> |
| Health apps declaration | <https://support.google.com/googleplay/android-developer/answer/14738291> |
| Health Content and Services | <https://support.google.com/googleplay/android-developer/answer/16679511> |
| Payments policy | <https://support.google.com/googleplay/android-developer/answer/9858738> |
| AI-Generated Content | <https://support.google.com/googleplay/android-developer/answer/13985936> · <https://support.google.com/googleplay/android-developer/answer/14094294> |
| Photo and Video Permissions | <https://support.google.com/googleplay/android-developer/answer/14115180> |
| Financial features declaration | <https://support.google.com/googleplay/android-developer/answer/13849271> |
| Developer account types (organisation for health apps) | <https://support.google.com/googleplay/android-developer/answer/13634885> |
| Target API level (API 36 from 2026-08-31) | <https://developer.android.com/google/play/requirements/target-sdk> |
| "Heal in India" government initiative (news coverage) | <https://www.deccanherald.com/amp/story/india/heal-in-india-govt-plans-facilities-at-10-airports-for-ease-of-overseas-patients-1133994.html> |
