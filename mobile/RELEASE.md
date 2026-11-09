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

## Known open items in the app

- No push notifications yet (users see updates inside the app).
- Location permission is declared (SOS / support map) but GPS is not read yet; the patient marks the location on
  the map by hand. Store forms must match whichever is shipped.
- Agents can pay by bank transfer only; hospital profile and price editing is web-only.

## Help

Requirements and checks: `mobile/README.md`. Build problems: send the full output of the failing command with
`--verbose` and `flutter doctor -v`.
