import '../models/enums.dart';
import '../network/api_exception.dart';

/// Which door a role uses (PLAN §3.1). The mobile app is the PUBLIC door only: patients, agents and
/// hospital users. Staff roles (admin, finance, support, super_admin) sign in exclusively on the web
/// staff door (`/gahi`) and are never let into the app.
extension UserRoleDoor on UserRole {
  bool get isStaff =>
      this == UserRole.admin || this == UserRole.finance || this == UserRole.support || this == UserRole.superAdmin;

  /// Roles allowed to sign in / register in the mobile app.
  bool get isPublicDoor => !isStaff;
}

/// Roles offered by the register screen's role tabs (Patient / Agent / Hospital).
const registrableRoles = [UserRole.patient, UserRole.agent, UserRole.hospital];

/// The generic public-door error (no account enumeration): shown when a staff account tries to
/// sign in on mobile, mirroring the backend's 401 "Invalid email or password".
const invalidCredentialsError = ApiException(
  statusCode: 401,
  code: 'invalid_credentials',
  message: 'Invalid email or password.',
);
