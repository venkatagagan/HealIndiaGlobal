import '../../l10n/l10n.dart';

/// Client-side form validation mirroring the API rules (PLAN §9: password ≥ 10 chars with a letter
/// and a digit). The server stays authoritative; these give instant feedback.
///
/// Messages follow the app language through [L10n.current], so the validators keep their
/// `String? Function(String?)` shape (used as `validator:` tear-offs).
abstract final class AuthValidators {
  static final _email = RegExp(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$",
  );
  static final _letter = RegExp('[A-Za-z]');
  static final _digit = RegExp('[0-9]');

  static const passwordMinLength = 10;
  static const passwordMaxLength = 128;

  static AppLocalizations get _l => L10n.current;

  static String? email(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return _l.validationEnterEmail;
    if (s.length > 254 || !_email.hasMatch(s)) return _l.validationInvalidEmail;
    return null;
  }

  /// Only presence is checked on login (old accounts may predate the policy).
  static String? loginPassword(String? v) => (v ?? '').isEmpty ? _l.validationEnterPassword : null;

  /// New-password policy.
  static String? newPassword(String? v) {
    final s = v ?? '';
    if (s.isEmpty) return _l.validationChoosePassword;
    if (s.length < passwordMinLength) return _l.validationPasswordTooShort(passwordMinLength);
    if (s.length > passwordMaxLength) return _l.validationPasswordTooLong(passwordMaxLength);
    if (!_letter.hasMatch(s) || !_digit.hasMatch(s)) return _l.validationPasswordLetterDigit;
    return null;
  }

  static String? fullName(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return _l.validationEnterFullName;
    if (s.length > 200) return _l.validationNameTooLong;
    return null;
  }

  /// Optional phone: digits, spaces, dashes, parentheses and a leading +.
  static String? optionalPhone(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null;
    if (!RegExp(r'^\+?[0-9 ()-]{6,24}$').hasMatch(s)) return _l.validationInvalidPhone;
    return null;
  }

  static String? otp(String? v) {
    final s = (v ?? '').trim();
    if (!RegExp(r'^[0-9]{6,10}$').hasMatch(s)) return _l.validationEnterOtp;
    return null;
  }
}
