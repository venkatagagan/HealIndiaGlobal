# Heal India Global — patient app (Flutter)

Patient app for the Heal India Global medical-travel platform: onboarding → AI symptom screening →
matched hospitals/doctors → quotes → booking → payment → visa/travel/stay → in-country support.
Binding contract: [`docs/PLAN.md`](../docs/PLAN.md) (§5 enums, §8 API shapes, §11 mobile).

Stack: Flutter 3.44 / Dart 3.12, Material 3, Riverpod 3 (no codegen), go_router, dio,
flutter_secure_storage, shared_preferences, google_sign_in 7, local_auth 3, url_launcher,
flutter_map + latlong2, table_calendar, file_picker, intl, cached_network_image,
web_socket_channel, razorpay_flutter (Android/iOS only), google_fonts (Inter).

## Run

Flutter is at `D:\dev\flutter\bin` (on PATH). Start the API first (`cd backend && .venv/Scripts/python -m
uvicorn app.main:app --reload --port 8000`).

```bash
cd mobile
flutter pub get                       # foundation only; feature agents never add packages
flutter run -d chrome                 # web  -> http://127.0.0.1:8000/api/v1
flutter run -d emulator-5554          # Android emulator -> http://10.0.2.2:8000/api/v1
flutter run --dart-define=API_BASE_URL=https://api.healindiaglobal.com/api/v1 \
            --dart-define=APP_ENV=production \
            --dart-define=GOOGLE_SERVER_CLIENT_ID=<web-oauth-client-id>.apps.googleusercontent.com
```

| `--dart-define`           | Default                                                                  |
|---------------------------|--------------------------------------------------------------------------|
| `API_BASE_URL`            | Android `http://10.0.2.2:8000/api/v1`; web on a real host `<origin>/api/v1`; else `http://127.0.0.1:8000/api/v1` |
| `WS_URL`                  | derived: `ws(s)://…/api/v1/ws`                                           |
| `APP_ENV`                 | `development` (`production` hides the mock gateway)                      |
| `GOOGLE_SERVER_CLIENT_ID` | empty → Google button hidden on Android                                  |
| `GOOGLE_CLIENT_ID`        | empty (iOS / web client id; iOS also needs the reversed id URL scheme in `ios/Runner/Info.plist`) |
| `RAZORPAY_ENABLED`        | `true` (only used on Android/iOS)                                        |
| `APPLE_SIGN_IN_ENABLED`   | `true` (button shown on iOS/macOS only, when the capability is available) |

Checks (PLAN §0):

```bash
flutter analyze                       # whole app;  flutter analyze lib/features/<x>  for one feature
flutter test                          # models, api client (refresh), router redirects, widget smoke
flutter build web --release           # compile check
dart format lib test                  # page width 120 (analysis_options.yaml)
```

Android: debug builds allow cleartext HTTP (`src/debug/AndroidManifest.xml`) for the local API;
release is HTTPS-only. `minSdk` 24, `MainActivity` is a `FlutterFragmentActivity` (local_auth).
iOS: minimum iOS 14 (`file_picker` requires it; set in `ios/Podfile` and the Xcode project). Face ID / photos /
camera / microphone / location usage strings are in `Info.plist`. Building on a Mac: [IOS_BUILD.md](IOS_BUILD.md).

### Sign in with Apple (iOS, App Store guideline 4.8; BACKLOG #16)

Google sign-in is offered on iOS, so "Continue with Apple" is shown there too (`core/auth/apple_sign_in_service.dart`,
package `sign_in_with_apple`). Before an App Store build:
1. Apple Developer → Identifiers → the app's App ID → enable **Sign in with Apple**.
2. Xcode → Runner target → Signing & Capabilities → **+ Sign in with Apple** (creates
   `ios/Runner/Runner.entitlements` with `com.apple.developer.applesignin = [Default]` and sets
   `CODE_SIGN_ENTITLEMENTS`; not committed yet because it needs the team's signing setup).
3. Backend: `POST /auth/apple {identity_token, nonce, authorization_code?, full_name?, role: "patient"}` →
   `TokenOut`; verify the token with Apple's JWKS (`iss=https://appleid.apple.com`, `aud` = bundle id,
   `nonce` claim == request `nonce`), link by `sub`/email. **Not implemented in the backend yet.**
4. Without the capability `SignInWithApple.isAvailable()` is false and the button stays hidden.

### Account deletion (BACKLOG #15)

Profile → "Delete account" → sheet (password for password accounts, optional reason, type `DELETE`) →
`DELETE /auth/me {password?, reason?}` → local sign-out → `/auth`. Backend endpoint + retention rules
(invoices/payments/medical records kept for the legal period) are owned by be-auth.

### Brand assets (BACKLOG #36)

`assets/brand/` (logos, from `design/logo`), `assets/illustrations/`, `assets/specialties/` (SVG via
`flutter_svg`; paths in `core/theme/brand_assets.dart`, widget `BrandSvg`). Launcher icons: PNG sources in
`assets/launcher/` (not bundled), config `flutter_launcher_icons.yaml`, regenerate with
`dart run flutter_launcher_icons`. Web icons (`web/favicon.svg|png`, `web/icons/Icon-*.png`) are exported
from `design/` with `design/tools/export_png.py`.

## Architecture

```
lib/
  main.dart                 prefs + ProviderScope(retry policy) + error handlers
  app.dart                  HealIndiaApp: MaterialApp.router, themes, localization, realtime keep-alive
  core/                     shared — READ-ONLY for feature agents (request changes via cross_module_requests)
    config/env.dart          Env.apiBaseUrl / Env.wsUrl / flags
    config/app_preferences.dart  sharedPreferencesProvider, onboardingSeenProvider, themeModeProvider,
                             preferredCurrencyProvider, PrefKeys
    network/api_client.dart  ApiClient (dio): X-Client-Type: mobile, bearer, single-flight refresh, ApiException
    network/api_exception.dart  ApiException{statusCode, code, message, details, requestId}, errorMessage()
    network/realtime_service.dart  RealtimeService (WS /ws?token=, backoff), realtimeEventsProvider
    auth/                    token_storage, auth_repository, auth_controller (AuthState), google_sign_in_service
    router/                  routes.dart (Routes/RouteNames), app_router.dart (routerProvider, guards, shell)
    theme/                   AppColors, AppPalette (ThemeExtension), AppTheme.dark/light, AppTextStyles,
                             AppSpacing, AppRadius, context.colors/text/palette
    models/                  plain Dart models (fromJson/toJson, snake_case), enums.dart (§5), money, Paged
    repositories/            one repository per API domain + FutureProviders
    services/biometric_service.dart  confirm-before-pay
    utils/                   money.dart (exponents, formatMoney), dates.dart (Dates.*)
    widgets/                 shared widget catalog (barrel: widgets.dart)
  features/<feature>/screens/<name>_screen.dart   (+ widgets/, providers/ per feature)
```

### Feature ownership (phase 2)

| Agent         | Folders under `lib/features/`                 | Screens (placeholders to replace)                                    |
|---------------|-----------------------------------------------|----------------------------------------------------------------------|
| fl-onboarding | onboarding, auth, home, search, profile        | OnboardingScreen, AuthScreen, LoginScreen, RegisterScreen, ForgotPasswordScreen, HomeScreen, SearchScreen, HospitalDetailScreen, DoctorDetailScreen, ProfileScreen, EditProfileScreen, CompanionsScreen, SavedScreen |
| fl-screening  | screening, matches                             | ScreeningStartScreen, ScreeningStepScreen, ScreeningProcessingScreen, MatchesScreen, CompareScreen, CostComparisonScreen |
| fl-journey    | booking, trips, support, messages              | BookScreen, PaymentScreen, TripsScreen, CasesScreen + CaseDetailScreen + DocumentsScreen (in `trips/`), SupportScreen, MessagesScreen, ChatScreen, NotificationsScreen (in `messages/`) |

Keep each screen's class name and constructor (the router builds them). Add sub-screens that are not
in the route table with `Navigator.of(context).push(MaterialPageRoute(...))` inside your feature, or
bottom sheets / dialogs.

## Routes (`core/router/routes.dart`)

| Path | Screen | Args |
|---|---|---|
| `/splash` | SplashScreen (core) | `?from=` |
| `/onboarding` | OnboardingScreen | — |
| `/auth` · `/auth/login` · `/auth/register` · `/auth/forgot` | Auth/Login/Register/ForgotPassword | `?from=` (return path); register `?role=patient\|agent\|hospital` |
| `/agent/**` | Agent shell (`features/agent_portal`, `agentPortalRoutes()`) | agents only |
| `/hospital/**` | Hospital-user shell (`features/hospital_portal`, `hospitalPortalRoutes()`) | hospital users only |
| `/home` (tab 0) | HomeScreen | — |
| `/search` (tab 1) | SearchScreen | `?q=&specialty=` |
| `/hospitals/:id` · `/doctors/:id` | HospitalDetailScreen · DoctorDetailScreen | slug or id |
| `/trips` (tab 2) | TripsScreen | — |
| `/messages` (tab 3) · `/messages/:id` | MessagesScreen · ChatScreen (full screen) | conversation id |
| `/profile` (tab 4) · `/profile/edit` · `/profile/companions` · `/profile/saved` | Profile, EditProfile, Companions, Saved | — |
| `/screening/new` | ScreeningStartScreen | `?specialty=<slug>` |
| `/screening/:id/step/:step` | ScreeningStepScreen | step 1..4 (others redirect to 1) |
| `/screening/:id/processing` · `/screening/:id/matches` | Processing · Matches | screening id |
| `/compare` | CompareScreen | `?screening=&matches=a,b,c` |
| `/cost-comparison` | CostComparisonScreen | `?procedure=&country=&currency=&screening=&match=` |
| `/book/:caseId` | BookScreen | `?quote=&package=` |
| `/pay/:bookingId` | PaymentScreen | `?installment=` |
| `/support` · `/notifications` · `/cases` · `/cases/:id` · `/documents` | Support, Notifications, Cases, CaseDetail, Documents | `/documents?case=&kind=` |

Use the builders: `context.push(Routes.hospital(id))`, `context.go(Routes.screeningStep(id, 2))`,
`context.push(Routes.book(caseId, quoteId: q.id))`, `context.go(Routes.matches(id))`. Pass ids in the
path and filters in the query; do not use `extra`.

Redirect rules (`computeRedirect`, unit-tested): unknown auth → `/splash`; no session → `/onboarding`
on first launch, otherwise `/auth?from=`; **guest** (`is_guest`) may open home, search, hospital/doctor
details, screening, matches, compare, cost comparison, `/profile` and auth pages — anything else goes to
`/auth/register?from=` (register screen should call `upgradeGuest`); full accounts on auth pages go
to `from` (only when inside their role's area) or their role home (`Routes.homeFor`: patient `/home`,
agent `/agent`, hospital `/hospital`). Roles are confined to their shell (`isRoleAllowedLocation`;
agents may also open `/hospitals/:id` and `/doctors/:id`). Staff roles never get a mobile session:
`AuthController` drops it and throws the generic "Invalid email or password." (PLAN §3.1). Onboarding must call `ref.read(onboardingSeenProvider.notifier).complete()`.

## Providers & repositories

Auth: `authControllerProvider` (AsyncNotifier → `AuthState{status: unknown|guest|authenticated|unauthenticated, user}`),
`authStateProvider` (sync), `currentUserProvider`. Actions: `login`, `register` (role patient/agent/hospital), `signInWithGoogle`,
`signInWithGoogleIdToken`, `signInWithApple`, `continueAsGuest`, `upgradeGuest`, `refreshUser`, `setUser`,
`logout`, `deleteAccount` —
they rethrow `ApiException` (state unchanged) so forms show errors inline (`e.fieldErrors`,
`e.isMfaRequired`).

| Repository (provider) | Methods | Data providers |
|---|---|---|
| `authRepositoryProvider` | register, login, google, guest, upgradeGuest, refresh, logout, me, updateMe, changePassword, forgotPassword, resetPassword, verifyEmail, resendVerification, registerDevice, consents, recordConsent | — |
| `patientRepositoryProvider` | profile, updateProfile(PatientProfileUpdate), companions, addCompanion, updateCompanion, deleteCompanion, dashboard, saved, save, unsave | `patientProfileProvider`, `patientDashboardProvider`, `companionsProvider`, `savedItemsProvider` |
| `catalogRepositoryProvider` | specialties, specialty, procedures, procedure, hospitals (Paged), hospital, doctors (Paged), doctor, doctorAvailability, hospitalAvailability, costComparison, search, culturalTips, helplines, fxRates, symptoms, accommodations, serviceProviders | `specialtiesProvider`, `hospitalDetailProvider(id)`, `doctorDetailProvider(id)`, `procedureDetailProvider(slug)`, `searchResultsProvider(q)`, `costComparisonProvider((procedure:, country:, currency:))`, `culturalTipsProvider`, `helplinesProvider`, `fxRatesProvider` |
| `screeningRepositoryProvider` | create, update(id, ScreeningPatch), submit(id, consentAi:), get, list, matches, rerun, watch(id) (polling stream) | `screeningProvider(id)`, `screeningMatchesProvider(id)`, `myScreeningsProvider` |
| `caseRepositoryProvider` | create, list (Paged), get (detail), changeStatus, cancel, acceptQuote, rejectQuote, requestConsultation, consultations | `casesProvider(status?)`, `caseDetailProvider(id)` |
| `bookingRepositoryProvider` | create, list, get, cancel, checklist, updateChecklistItem, itinerary | `bookingsProvider(status?)`, `bookingProvider(id)`, `checklistProvider(bookingId)`, `itineraryProvider(bookingId)` |
| `paymentRepositoryProvider` | createOrder (Idempotency-Key) → Checkout, orders, order, verifyRazorpay, submitBankTransferProof, completeMock, installments, invoices, invoice, invoicePdf, `newIdempotencyKey()` | `paymentOrderProvider(id)`, `bookingPaymentOrdersProvider(bookingId)`, `installmentsProvider(bookingId)`, `invoicesProvider` |
| `travelRepositoryProvider` | visaRequests, createVisaRequest, travelBookings, createTravelBooking, updateTravelBooking, accommodationBookings, createAccommodationBooking, updateAccommodationBooking, serviceBookings, createServiceBooking, updateServiceBooking, sos | `visaRequestsProvider(caseId?)`, `travelBookingsProvider(caseId?)`, `accommodationBookingsProvider(caseId?)`, `serviceBookingsProvider(caseId?)` |
| `documentRepositoryProvider` | upload(fileName, kind, bytes or filePath, caseId?, …, onProgress), list, get, download, delete | `documentsProvider((caseId:, kind:))` |
| `messagingRepositoryProvider` | conversations, createConversation, messages, sendMessage, markConversationRead, notifications, unreadNotificationCount, markNotificationRead, markAllNotificationsRead | `conversationsProvider`, `conversationMessagesProvider(id)`, `notificationsProvider`, `unreadNotificationsCountProvider` |

Realtime: `realtimeServiceProvider` (auto-connects while a session exists), `realtimeEventsProvider`
(`RealtimeEvent{type, data}`; types in `RealtimeEvents`). Example:
`ref.listen(realtimeEventsProvider, (_, next) { final e = next.value; if (e?.type == RealtimeEvents.messageCreated) ... })`.
Other services: `biometricServiceProvider` (`confirm()`, `payLabel()`), `googleSignInServiceProvider`.

After mutations, `ref.invalidate(<dataProvider>)` to refresh lists/details.

## Models (`core/models/models.dart`)

User, AuthSession, Consent · Specialty, Procedure, CostBenchmark, CostComparison(CostSide, CostSavings, CostItem) ·
HospitalCard, HospitalDetail, Review, AvailabilitySlot · DoctorCard, DoctorDetail · TreatmentPackage,
PackageIncludes, HospitalProcedure · Screening, ScreeningPatch, ScreeningSummary, SymptomResponse,
ScreeningSeverity, ScreeningPreferences, TriageResult · ScreeningMatch, MatchSavings · MedicalCase,
MedicalCaseDetail, CasePatient, CaseTimelineEntry · Quote, QuoteLineItem · Booking, Consultation ·
ChecklistItem · ItineraryItem · PaymentOrder, Checkout, RazorpayCheckout, StripeCheckout,
BankTransferDetails, Installment, Invoice · VisaRequest, TravelBooking, AccommodationBooking,
ServiceBooking, SosAlert · AppDocument · Conversation, ChatMessage · AppNotification · PatientProfile,
PatientProfileUpdate, PatientCompanion, CompanionInput, PatientDashboard, SavedItem · SearchResults,
CulturalTip, Helplines, FxRate, SymptomInfo, AccommodationProvider, LocalServiceProvider · refs
(EntityRef, HospitalRef, DoctorRef, PersonRef) · Paged<T> · Money.

Enums mirror PLAN §5 exactly (`BookingStatus.pendingPayment.json == 'pending_payment'`, `.label` for UI,
`X.fromJson(raw)` / `X.fromJsonOrNull(raw)`). `ConversationKind.caseThread` is the wire value `case`.
Money is always integer minor units: `formatMoney(minor, ccy)`, `MoneyText(minor, ccy)`, `Money`.

## Widgets (`core/widgets/widgets.dart`)

BrandHeader (+ Brand, BrandLogo), PrimaryButton (`tone: green|violet|red`, `loading`), SecondaryButton,
AppCard (`selected`, `onTap`, `gradient`), ChipToggle / ChipToggleGroup, StepProgressBar, MoneyText,
RatingStars, Avatar, EmptyView, ErrorView, LoadingView, AsyncValueView, showErrorSnack/showInfoSnack,
SectionTitle, StatusBadge (`StatusBadge.forEnum`), BottomNavShell (+ kNavTabs), specialtyIcon(),
specialtyAccent().

## Theme tokens (`core/theme/app_theme.dart`)

`AppColors.primary #22C55E`, `primaryDark #16A34A`, `violet #7C3AED`, `danger #EF4444`, `warning #F59E0B`,
`info #2563EB`, `cyan #06B6D4`, dark surfaces `darkBackground #0B0F14`, `darkSurface #161B22`,
`darkSurfaceAlt #1F2630`, `heroGradient` (#7B2FF7→#2563EB→#06B6D4), `processingGradient`,
`statusColor(wireValue)`. Contrast-safe (WCAG AA, BACKLOG #33): `onPrimary #052E16` (text on green),
`primaryStrong #15803D` (green text on light), `dangerStrong #B91C1C` (white-on-red fills, red text on light),
`warningStrong #B45309`, `violetLight #A78BFA`; never put white text on `primary` or `danger`. `context.colors` (ColorScheme), `context.text` (TextTheme, Inter),
`context.palette` (surfaceAlt, border, textSecondary, textMuted, success, warning, danger, accent).
Spacing `AppSpacing.{xs..xxl, page}`, radii `AppRadius.{sm, md, lg, xl, pill, card, button, input}`.
Dark is the default theme (`themeModeProvider`).

## Conventions

* snake_case JSON exactly as PLAN §8; never camelCase on the wire. Dates `YYYY-MM-DD` via `toApiDate`.
* Never compute money with doubles; display only via `formatMoney` / `MoneyText`.
* Every async screen has loading / empty / error states (`AsyncValueView`, `EmptyView`, `ErrorView`).
* Accessibility: semantic labels on icon-only buttons, ≥ 48 px tap targets, text scale capped at 1.3.
* Tests: override `sharedPreferencesProvider`, `tokenStorageProvider` (InMemoryTokenStorage),
  `authControllerProvider` (fake notifier) and `navBadgesProvider`; set `AppTextStyles.useGoogleFonts = false`.
  See `test/app_widget_test.dart`.
* Razorpay: use `razorpay_flutter` only when `Env.razorpaySupported`; otherwise offer bank transfer /
  `mock` (non-production) — see `Checkout.mockCompleteUrl` and `PaymentRepository.completeMock`.
