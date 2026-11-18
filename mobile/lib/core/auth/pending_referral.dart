import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_preferences.dart';
import '../models/referral.dart';

/// App deep link scheme of the referral invite (`healindia://register?ref=CODE`, see AndroidManifest.xml
/// and ios/Runner/Info.plist).
const kReferralLinkScheme = 'healindia';

/// The referral code carried by an invite link, or null when [uri] is not one.
///
/// Accepted forms (only the `ref` query parameter is read):
/// * `healindia://register?ref=CODE` (go_router keeps scheme and host);
/// * `/register?ref=CODE` and `/?ref=CODE` (some platforms hand over only path + query).
String? referralCodeFromLink(Uri uri) {
  final ref = uri.queryParameters['ref'];
  if (ref == null) return null;
  if (uri.hasScheme) {
    if (uri.scheme != kReferralLinkScheme || uri.host != 'register') return null;
  } else {
    final path = uri.path;
    if (path != '/register' && path != '/' && path.isNotEmpty) return null;
  }
  return normalizeReferralCode(ref);
}

/// Referral code received through an invite link, kept until the sign-up form uses it (it survives the
/// onboarding carousel and app restarts).
final pendingReferralCodeProvider = NotifierProvider<PendingReferralCodeController, String?>(
  PendingReferralCodeController.new,
);

class PendingReferralCodeController extends Notifier<String?> {
  static const _key = 'hig.pending_referral_code';

  @override
  String? build() => ref.watch(sharedPreferencesProvider).getString(_key);

  void set(String code) {
    if (state == code) return;
    state = code;
    ref.read(sharedPreferencesProvider).setString(_key, code);
  }

  void clear() {
    if (state == null) return;
    state = null;
    ref.read(sharedPreferencesProvider).remove(_key);
  }
}
