/// Client-side form validation mirroring the API rules (PLAN §9: password ≥ 10 chars with a letter
/// and a digit). The server stays authoritative; these give instant feedback.
abstract final class AuthValidators {
  static final _email = RegExp(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$",
  );
  static final _letter = RegExp('[A-Za-z]');
  static final _digit = RegExp('[0-9]');

  static const passwordMinLength = 10;
  static const passwordMaxLength = 128;

  static String? email(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return 'Enter your email';
    if (s.length > 254 || !_email.hasMatch(s)) return 'Enter a valid email address';
    return null;
  }

  /// Only presence is checked on login (old accounts may predate the policy).
  static String? loginPassword(String? v) => (v ?? '').isEmpty ? 'Enter your password' : null;

  /// New-password policy.
  static String? newPassword(String? v) {
    final s = v ?? '';
    if (s.isEmpty) return 'Choose a password';
    if (s.length < passwordMinLength) return 'Use at least $passwordMinLength characters';
    if (s.length > passwordMaxLength) return 'Use at most $passwordMaxLength characters';
    if (!_letter.hasMatch(s) || !_digit.hasMatch(s)) return 'Include at least one letter and one number';
    return null;
  }

  static String? fullName(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return 'Enter your full name';
    if (s.length > 200) return 'Name is too long';
    return null;
  }

  /// Optional phone: digits, spaces, dashes, parentheses and a leading +.
  static String? optionalPhone(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null;
    if (!RegExp(r'^\+?[0-9 ()-]{6,24}$').hasMatch(s)) return 'Enter a valid phone number';
    return null;
  }

  static String? otp(String? v) {
    final s = (v ?? '').trim();
    if (!RegExp(r'^[0-9]{6,10}$').hasMatch(s)) return 'Enter the 6-digit code';
    return null;
  }
}
