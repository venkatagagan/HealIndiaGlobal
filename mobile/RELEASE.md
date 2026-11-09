# Store release guide (apps team)

One Flutter code base builds both apps. App ID on both stores: **`com.healindiaglobal.app`**.
Version: `version:` in `pubspec.yaml` (`1.0.0+1` = version name 1.0.0, build 1). Raise the build number
(after the `+`) for every upload.

- Android: this page.
- iOS: [IOS_BUILD.md](IOS_BUILD.md) (needs a Mac).
- Store listing, privacy forms and review notes: `docs/store/GOOGLE_PLAY.md`, `docs/store/APP_STORE.md`, and the
  open items in `docs/store/COMPLIANCE_GAPS.md`.

## Before the first store upload

These come from the project owner. Do not upload a production build without them:

| Needed | Why | Passed as |
|---|---|---|
| Production API address (HTTPS) | Without it the app talks to `localhost` and nothing works | `--dart-define=API_BASE_URL=https://<api-domain>/api/v1` |
| Production mode | Hides the test payment option | `--dart-define=APP_ENV=production` |
| Google sign-in client IDs (Android: web/server client; iOS: iOS client) | Google button stays hidden without them | `GOOGLE_SERVER_CLIENT_ID`, `GOOGLE_CLIENT_ID` |
| Sign in with Apple capability on the App ID | Apple button fails without it | Xcode capability (IOS_BUILD.md step 4) |
| Firebase project (only when push notifications ship) | Push stays off without it; the app works fully without push | `--dart-define=PUSH_ENABLED=true` + config files (see "Push notifications (Firebase)") |

Internal test builds (Play internal testing, TestFlight) can go out earlier, pointing `API_BASE_URL` at any
reachable test server.

## Android release (Google Play)

### 1. Upload key (once)

Create it once and keep it and its passwords safe (company password manager). Losing it means asking Google to
reset the upload key.

```bash
keytool -genkeypair -v -keystore upload-keystore.jks -storetype JKS -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
```

Put the file in `mobile/android/app/upload-keystore.jks` and create `mobile/android/key.properties`:

```properties
storePassword=<store password>
keyPassword=<key password>
keyAlias=upload
storeFile=app/upload-keystore.jks
```

Both files are git-ignored (`*.jks`, `key.properties`): **never commit them.** `storeFile` is relative to
`mobile/android/`. Without `key.properties` the release build is signed with the debug key, which Play rejects.

In Play Console use **Play App Signing** (default for new apps): Google holds the app signing key, you upload
with the upload key.

### 2. Checks and build

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter build appbundle --release \
  --dart-define=APP_ENV=production \
  --dart-define=API_BASE_URL=https://<api-domain>/api/v1 \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Output: `build/app/outputs/bundle/release/app-release.aab`. Upload it to Play Console › Testing › Internal
testing first, then promote.

Check the signature before uploading (should show your upload certificate, not `CN=Android Debug`):

```bash
keytool -printcert -jarfile build/app/outputs/bundle/release/app-release.aab
```

### 3. Google sign-in on Android

In Google Cloud Console, create an **Android** OAuth client for package `com.healindiaglobal.app` with the
SHA-1 of the **app signing key** (Play Console › App integrity) and of the upload key. The app itself uses the
**web** client ID (`GOOGLE_SERVER_CLIENT_ID`); the backend must accept it (`GOOGLE_CLIENT_IDS`).

## Push notifications (Firebase)

Push is **off by default**. Builds without `--dart-define=PUSH_ENABLED=true` never call Firebase, never ask for
the notification permission, and need no Firebase files. Everything a notification says also appears in the
in-app notifications list, so the app works fully with push off or denied.

How the app behaves with push on:

- The permission is asked just in time: shortly after a user signs in (never at app launch, never for guests)
  the app explains "Get updates about your case, messages and payments. We never put health details in
  notifications." with **Not now** / **Turn on**. Only **Turn on** shows the system dialog. **Not now** is
  remembered and the question comes back at most once every 30 days.
- The device token is registered with `POST /notifications/devices` after sign-in and on token refresh, and
  removed with `DELETE /notifications/devices?token=` on log-out (before the session ends).
- Notification texts are generic ("You have a new message"); tapping one opens the case / chat / payment it is
  about, otherwise the notifications list.

Setup (once per environment):

1. **Firebase project.** In the [Firebase console](https://console.firebase.google.com) create a project (one
   for production, optionally one for testing).
2. **Android app.** Project settings > Add app > Android, package name `com.healindiaglobal.app`. Download
   `google-services.json` and put it in `mobile/android/app/google-services.json`. The Google Services Gradle
   plugin is applied automatically when that file exists.
3. **iOS app.** Add app > iOS, bundle ID `com.healindiaglobal.app`. Download `GoogleService-Info.plist` and put
   it in `mobile/ios/Runner/GoogleService-Info.plist`. The APNs key and the Xcode capabilities are in
   [IOS_BUILD.md](IOS_BUILD.md) "Push notifications (Firebase)".
4. Both files are **git-ignored**: keep them in the company password manager / CI secrets, never commit them.
   Instead of the files you can pass the values (copied from the same files) as dart-defines:
   `FIREBASE_API_KEY`, `FIREBASE_APP_ID` (the Android or the iOS app ID, per build), `FIREBASE_MESSAGING_SENDER_ID`,
   `FIREBASE_PROJECT_ID` and, for iOS, `FIREBASE_IOS_BUNDLE_ID=com.healindiaglobal.app`.
5. **Build with push on:**

   ```bash
   flutter build appbundle --release \
     --dart-define=APP_ENV=production \
     --dart-define=API_BASE_URL=https://<api-domain>/api/v1 \
     --dart-define=GOOGLE_SERVER_CLIENT_ID=<web-client-id>.apps.googleusercontent.com \
     --dart-define=PUSH_ENABLED=true \
     --dart-define=APP_VERSION=1.0.0
   ```

   `APP_VERSION` is optional; it is sent with the device token to help support.
6. **Backend** (server team): set `FCM_PROJECT_ID=<firebase project id>` and either
   `FCM_SERVICE_ACCOUNT_FILE=<path to the service account JSON>` or `FCM_SERVICE_ACCOUNT_JSON=<the JSON>`.
   Create the service account in Google Cloud Console (same project) with the role **Firebase Cloud Messaging
   API Admin**, and make sure the "Firebase Cloud Messaging API (V1)" is enabled. Never commit the key.
7. **Store forms, once a push-enabled build ships:** Google Play Data safety: add **Device or other IDs**
   (collected, not shared, used for app functionality: delivering notifications). App Store App Privacy: add
   **Device ID** (app functionality, linked to the user, not used for tracking). Push payloads are generic and
   contain no health data, so nothing else changes in the forms.

Check on a real phone: sign in, tap **Turn on**, send yourself a chat message from the web portal with the app
in the background, tap the notification (it should open the chat), then log out (no more notifications).

## Known open items in the app

- Push notifications are built in but stay off until the Firebase setup above is done (users see updates inside
  the app meanwhile). Android shows the default notification icon; a monochrome notification icon
  (`@drawable/ic_stat_notification` + the `com.google.firebase.messaging.default_notification_icon` meta-data)
  is still to do.
- Location is read once, only when a patient sends an SOS with "Share my current location" ticked; never in the
  background. Store privacy forms: location collected, optional, for app functionality (`docs/store`).
- Agents can pay by bank transfer only; hospital profile and price editing is web-only.

## Help

Requirements and checks: `mobile/README.md`. Build problems: send the full output of the failing command with
`--verbose` and `flutter doctor -v`.
