import 'json.dart';

/// Opt-in state of WhatsApp updates (`WhatsAppStatusOut.status`).
enum WhatsAppOptInStatus {
  none('none'),
  pending('pending'),
  active('active'),
  optedOut('opted_out');

  const WhatsAppOptInStatus(this.json);

  final String json;

  static WhatsAppOptInStatus fromJson(Object? v) =>
      values.firstWhere((s) => s.json == v?.toString(), orElse: () => WhatsAppOptInStatus.none);
}

/// `GET /me/whatsapp` (and the answer of verify / confirm / opt-out).
class WhatsAppStatus {
  const WhatsAppStatus({
    required this.available,
    required this.status,
    this.phoneMasked,
    this.verifiedAt,
    this.optedInAt,
    this.optedOutAt,
    this.codeExpiresAt,
  });

  factory WhatsAppStatus.fromJson(JsonMap j) => WhatsAppStatus(
    available: jBool(j, 'available'),
    status: WhatsAppOptInStatus.fromJson(j['status']),
    phoneMasked: jStrOrNull(j, 'phone_masked'),
    verifiedAt: jDate(j, 'verified_at'),
    optedInAt: jDate(j, 'opted_in_at'),
    optedOutAt: jDate(j, 'opted_out_at'),
    codeExpiresAt: jDate(j, 'code_expires_at'),
  );

  /// WhatsApp is configured on this server. When false the opt-in is shown but disabled.
  final bool available;
  final WhatsAppOptInStatus status;

  /// `+234*****567`
  final String? phoneMasked;
  final DateTime? verifiedAt;
  final DateTime? optedInAt;
  final DateTime? optedOutAt;

  /// When the 6-digit code of a pending verification expires.
  final DateTime? codeExpiresAt;

  bool get isActive => status == WhatsAppOptInStatus.active;
  bool get isPending => status == WhatsAppOptInStatus.pending;
}

/// Loose E.164 check before sending: `+`, a country code and 8-15 digits (spaces, dashes and brackets
/// allowed). The server normalizes and validates the number.
bool isPlausibleE164(String raw) {
  final s = raw.trim();
  if (!s.startsWith('+')) return false;
  if (!RegExp(r'^\+[0-9 ()\-.]+$').hasMatch(s)) return false;
  final digits = s.replaceAll(RegExp(r'[^0-9]'), '');
  return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0');
}

/// A WhatsApp verification code: exactly six digits.
bool isWhatsAppCode(String raw) => RegExp(r'^\d{6}$').hasMatch(raw.trim());
