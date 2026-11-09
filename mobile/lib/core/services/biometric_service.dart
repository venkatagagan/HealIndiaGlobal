import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../../l10n/l10n.dart';

/// Biometric confirmation before paying ("Pay with Face ID"), PLAN §11.
///
/// Falls back gracefully: when biometrics / device credentials are unavailable (web, emulator
/// without enrolment) [confirm] returns `true` so the user is never blocked from paying; the
/// server still authorizes every payment.
class BiometricService {
  BiometricService([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// Whether the device can authenticate with biometrics or a device credential.
  Future<bool> isAvailable() async {
    if (kIsWeb) return false;
    try {
      return await _auth.isDeviceSupported();
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// Which biometric the pay button offers (drives its label and icon).
  Future<PayBiometric> payBiometric() async {
    if (!await isAvailable()) return PayBiometric.none;
    try {
      final types = await _auth.getAvailableBiometrics();
      if (types.contains(BiometricType.face)) return PayBiometric.face;
      if (types.contains(BiometricType.fingerprint) || types.contains(BiometricType.strong)) {
        return PayBiometric.fingerprint;
      }
    } on PlatformException {
      // ignore
    }
    return PayBiometric.none;
  }

  /// Label for the pay button ("Pay with Face ID" / "Pay with fingerprint" / "Pay") in the app language.
  Future<String> payLabel() async => (await payBiometric()).label(L10n.current);

  /// Prompts for biometrics (or device PIN). Returns false only when the user cancels / fails.
  /// [reason] defaults to "Confirm your payment" in the app language.
  Future<bool> confirm({String? reason}) async {
    if (!await isAvailable()) return true;
    try {
      return await _auth.authenticate(
        localizedReason: reason ?? L10n.current.coreBiometricConfirmReason,
        sensitiveTransaction: true,
      );
    } on LocalAuthException catch (e) {
      // Not enrolled / unavailable: do not block the payment.
      return switch (e.code) {
        LocalAuthExceptionCode.noBiometricHardware ||
        LocalAuthExceptionCode.noBiometricsEnrolled ||
        LocalAuthExceptionCode.noCredentialsSet ||
        LocalAuthExceptionCode.biometricHardwareTemporarilyUnavailable => true,
        _ => false,
      };
    } on PlatformException {
      return true;
    } on MissingPluginException {
      return true;
    }
  }
}

final biometricServiceProvider = Provider<BiometricService>((ref) => BiometricService());

/// Biometric offered on the pay button.
enum PayBiometric {
  none,
  face,
  fingerprint;

  String label(AppLocalizations l10n) => switch (this) {
    PayBiometric.face => l10n.coreBiometricPayFaceId,
    PayBiometric.fingerprint => l10n.coreBiometricPayFingerprint,
    PayBiometric.none => l10n.coreBiometricPay,
  };
}
