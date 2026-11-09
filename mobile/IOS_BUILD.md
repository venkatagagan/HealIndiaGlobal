# Building the iOS app on a Mac

The app is one Flutter code base for Android and iOS. Android builds on Windows; iOS needs a Mac with Xcode.
This page is for whoever runs the iOS build from the `mobile` folder.

## 1. What the Mac needs

| Tool | Version | Check |
|---|---|---|
| macOS + Xcode | Xcode 26 or newer (App Store uploads need the iOS 26 SDK) | `xcodebuild -version` |
| Flutter | **3.44.0 stable** (the same version the app is built and tested with) | `flutter --version` |
| CocoaPods | 1.16 or newer (Razorpay is still a CocoaPods plugin) | `pod --version` |
| An iPhone simulator, or an iPhone with Developer Mode on | iOS 14 or newer | Xcode › Settings › Platforms |

Install Flutter 3.44.0 from https://docs.flutter.dev/install/archive, then run `flutter doctor` until the
Xcode and CocoaPods lines are green.

## 2. First build (simulator, no Apple account needed)

```bash
cd mobile
flutter clean
flutter pub get
open -a Simulator
flutter run -d iPhone --dart-define=APPLE_SIGN_IN_ENABLED=false \
  --dart-define=API_BASE_URL=http://<api-host>:8000/api/v1
```

- `APPLE_SIGN_IN_ENABLED=false` hides "Continue with Apple". Leave it off until step 4 is done; without the
  capability the button shows but fails.
- `API_BASE_URL` must point at a running API. The default (`http://127.0.0.1:8000/api/v1`) only works when
  the API runs on the same Mac. If it runs on another computer, use an address the Mac can reach.
- Google sign-in stays hidden until `GOOGLE_CLIENT_ID` is passed (step 4). Email log-in and guest mode work
  without it.

Demo accounts (development database only, never production): `patient.us@healindia.example`,
`agent.lagos@healindia.example`, `owner.coromandel-chennai@healindia.example`; password `HealIndia@2026`.

## 3. Run on a real iPhone

1. `open ios/Runner.xcworkspace` (the **workspace**, not the `.xcodeproj`).
2. Runner target › Signing & Capabilities › Team: choose the Apple Developer team.
3. The bundle identifier is `com.healindiaglobal.app` (same as the Android app). It must match the App Store
   Connect record; register it under Certificates, Identifiers & Profiles › Identifiers.
4. Connect the iPhone, then `flutter run -d <device-id> --release` with the same `--dart-define` values.

## 4. Before an App Store build

| Item | Where |
|---|---|
| Sign in with Apple capability | Xcode › Signing & Capabilities › + Sign in with Apple; then build without `APPLE_SIGN_IN_ENABLED=false` |
| Google sign-in on iOS | Create an iOS OAuth client; pass `--dart-define=GOOGLE_CLIENT_ID=…`; put the reversed client id in `ios/Runner/Info.plist` › `CFBundleURLSchemes` (replace the placeholder) |
| Production API | `--dart-define=API_BASE_URL=https://<api-domain>/api/v1 --dart-define=APP_ENV=production` |
| Store checklist | `docs/store/APP_STORE.md` and `docs/store/COMPLIANCE_GAPS.md` |

Release build and upload:

```bash
flutter build ipa --release \
  --dart-define=APP_ENV=production \
  --dart-define=API_BASE_URL=https://<api-domain>/api/v1 \
  --dart-define=GOOGLE_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com
# then upload build/ios/ipa/*.ipa with Xcode Organizer or the Transporter app
```

## 5. If the build fails

| Message | Fix |
|---|---|
| `requires a higher minimum iOS deployment version` | The app targets iOS 14 (`ios/Podfile` and the Xcode project). Run `cd ios && pod install --repo-update`, then build again. |
| `CocoaPods not installed` / `pod: command not found` | `brew install cocoapods` (or `sudo gem install cocoapods`). |
| `Generated.xcconfig must exist` | Run `flutter pub get` in `mobile` first. |
| Signing errors | Pick a Team in Xcode (step 3). A free Apple ID can run on your own iPhone for 7 days. |
| Anything else | Send the full output of `flutter build ios --verbose` and `flutter doctor -v`. |
