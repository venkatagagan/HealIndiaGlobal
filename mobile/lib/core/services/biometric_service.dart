import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

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

  /// Label for the pay button ("Pay with Face ID" / "Pay with fingerprint" / "Pay").
  Future<String> payLabel() async {
    if (!await isAvailable()) return 'Pay';
    try {
      final types = await _auth.getAvailableBiometrics();
      if (types.contains(BiometricType.face)) return 'Pay with Face ID';
      if (types.contains(BiometricType.fingerprint) || types.contains(BiometricType.strong)) {
        return 'Pay with fingerprint';
      }
    } on PlatformException {
      // ignore
    }
    return 'Pay';
  }

  /// Prompts for biometrics (or device PIN). Returns false only when the user cancels / fails.
  Future<bool> confirm({String reason = 'Confirm your payment'}) async {
    if (!await isAvailable()) return true;
    try {
      return await _auth.authenticate(localizedReason: reason, sensitiveTransaction: true);
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
