import '../../core/models/enums.dart';
import '../../core/router/routes.dart';

/// Where to go after a successful sign-in: the `?from=` path when it is a safe in-app location,
/// otherwise `/home`.
///
/// Mirrors `safeFromParam` in `core/router/app_router.dart` (kept local so auth screens do not
/// import the router, which itself imports every screen). Only absolute in-app paths are accepted
/// (no scheme, no `//host`), and auth/onboarding/splash paths are ignored to avoid loops.
String returnPathOrHome(String? from) => safeReturnPath(from) ?? Routes.home;

/// Role-aware landing after sign-in / registration (PLAN §3.1): `from` only when it lies inside the
/// role's own area, otherwise the role home (patient `/home`, agent `/agent`, hospital `/hospital`).
/// The router applies the same rule, so this only avoids a visible bounce.
String returnPathFor(UserRole role, String? from) {
  final safe = safeReturnPath(from);
  final home = Routes.homeFor(role);
  if (safe == null) return home;
  final path = Uri.parse(safe).path;
  final inAgent = Routes.isWithin(path, Routes.agentHome);
  final inHospital = Routes.isWithin(path, Routes.hospitalHome);
  final allowed = switch (role) {
    UserRole.patient => !inAgent && !inHospital,
    UserRole.agent => inAgent,
    UserRole.hospital => inHospital,
    _ => false,
  };
  return allowed ? safe : home;
}

String? safeReturnPath(String? from) {
  if (from == null || from.isEmpty) return null;
  if (!from.startsWith('/') || from.startsWith('//') || from.contains('://') || from.contains(r'\')) return null;
  final path = Uri.tryParse(from)?.path;
  if (path == null) return null;
  if (path == Routes.splash || path == Routes.onboarding || path == Routes.auth || path.startsWith('${Routes.auth}/')) {
    return null;
  }
  return from;
}
