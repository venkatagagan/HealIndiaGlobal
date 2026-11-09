import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/agent_portal/agent_routes.dart';
import '../../features/auth/screens/auth_screen.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/register_screen.dart';
import '../../features/booking/screens/book_screen.dart';
import '../../features/booking/screens/payment_screen.dart';
import '../../features/documents_ai/screens/report_analysis_screen.dart';
import '../../features/documents_ai/screens/report_capture_screen.dart';
import '../../features/home/screens/home_screen.dart';
import '../../features/hospital_portal/hospital_routes.dart';
import '../../features/matches/screens/compare_screen.dart';
import '../../features/matches/screens/cost_comparison_screen.dart';
import '../../features/matches/screens/matches_screen.dart';
import '../../features/messages/screens/chat_screen.dart';
import '../../features/messages/screens/messages_screen.dart';
import '../../features/messages/screens/notifications_screen.dart';
import '../../features/onboarding/screens/onboarding_screen.dart';
import '../../features/profile/screens/companions_screen.dart';
import '../../features/profile/screens/edit_profile_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/profile/screens/saved_screen.dart';
import '../../features/screening/screens/screening_processing_screen.dart';
import '../../features/screening/screens/screening_start_screen.dart';
import '../../features/screening/screens/screening_step_screen.dart';
import '../../features/search/screens/doctor_detail_screen.dart';
import '../../features/search/screens/hospital_detail_screen.dart';
import '../../features/search/screens/search_screen.dart';
import '../../features/support/screens/support_screen.dart';
import '../../features/trips/screens/case_detail_screen.dart';
import '../../features/trips/screens/cases_screen.dart';
import '../../features/trips/screens/documents_screen.dart';
import '../../features/trips/screens/trips_screen.dart';
import '../../features/voice/screens/voice_intake_screen.dart';
import '../auth/auth_controller.dart';
import '../auth/roles.dart';
import '../config/app_preferences.dart';
import '../models/enums.dart';
import '../repositories/messaging_repository.dart';
import '../widgets/bottom_nav_shell.dart';
import 'routes.dart';
import 'system_screens.dart';

export 'routes.dart';

/// Root navigator (full-screen routes are pushed here, above the bottom bar).
final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Badge counts for the bottom bar, by tab index (3 = Messages). Override in tests.
final navBadgesProvider = Provider<Map<int, int>>((ref) {
  final unread = ref.watch(unreadNotificationsCountProvider).value ?? 0;
  return {3: unread};
});

/// The app router. Redirect rules:
/// * auth state unknown -> `/splash` (until the stored session is validated);
/// * no session: first launch -> `/onboarding`; anything except onboarding/auth -> `/auth?from=`;
/// * guest: browse + screening only ([isGuestAllowedLocation]); others -> `/auth/register?from=`;
/// * full account on onboarding/auth/splash -> `from` (if safe for its role) or the role home;
/// * roles are confined to their own shell (PLAN §3.1): patient -> everything except `/agent/**` and
///   `/hospital/**`; agent -> `/agent/**` (+ catalog detail pages); hospital -> `/hospital/**`;
///   staff roles never get a mobile session (treated as signed out).
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  final router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: Routes.splash,
    debugLogDiagnostics: kDebugMode,
    refreshListenable: refresh,
    redirect: (context, state) => computeRedirect(
      auth: ref.read(authStateProvider),
      onboardingSeen: ref.read(onboardingSeenProvider),
      uri: state.uri,
    ),
    errorBuilder: (context, state) => NotFoundScreen(location: state.uri.path),
    routes: buildAppRoutes(),
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

/// Route tree (exposed for tests).
List<RouteBase> buildAppRoutes() => [
  GoRoute(path: Routes.splash, name: RouteNames.splash, builder: (_, _) => const SplashScreen()),
  GoRoute(path: Routes.onboarding, name: RouteNames.onboarding, builder: (_, _) => const OnboardingScreen()),
  GoRoute(
    path: Routes.auth,
    name: RouteNames.auth,
    builder: (_, s) => AuthScreen(from: s.uri.queryParameters['from']),
    routes: [
      GoRoute(
        path: 'login',
        name: RouteNames.login,
        builder: (_, s) => LoginScreen(from: s.uri.queryParameters['from']),
      ),
      GoRoute(
        path: 'register',
        name: RouteNames.register,
        builder: (_, s) => RegisterScreen(
          from: s.uri.queryParameters['from'],
          initialRole: UserRole.fromJsonOrNull(s.uri.queryParameters['role']),
        ),
      ),
      GoRoute(path: 'forgot', name: RouteNames.forgotPassword, builder: (_, _) => const ForgotPasswordScreen()),
    ],
  ),

  // ------------------------------------------------- role shells (PLAN §3.1)
  ...agentPortalRoutes(),
  ...hospitalPortalRoutes(),

  // ------------------------------------------------------------ tab shell
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => _NavShell(shell: shell),
    branches: [
      StatefulShellBranch(
        routes: [GoRoute(path: Routes.home, name: RouteNames.home, builder: (_, _) => const HomeScreen())],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: Routes.search,
            name: RouteNames.search,
            builder: (_, s) =>
                SearchScreen(initialQuery: s.uri.queryParameters['q'], specialty: s.uri.queryParameters['specialty']),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [GoRoute(path: Routes.trips, name: RouteNames.trips, builder: (_, _) => const TripsScreen())],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: Routes.messages,
            name: RouteNames.messages,
            builder: (_, _) => const MessagesScreen(),
            routes: [
              GoRoute(
                path: ':id',
                name: RouteNames.chat,
                parentNavigatorKey: rootNavigatorKey,
                builder: (_, s) => ChatScreen(conversationId: s.pathParameters['id']!),
              ),
            ],
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: Routes.profile,
            name: RouteNames.profile,
            builder: (_, _) => const ProfileScreen(),
            routes: [
              GoRoute(
                path: 'edit',
                name: RouteNames.profileEdit,
                parentNavigatorKey: rootNavigatorKey,
                builder: (_, _) => const EditProfileScreen(),
              ),
              GoRoute(
                path: 'companions',
                name: RouteNames.companions,
                parentNavigatorKey: rootNavigatorKey,
                builder: (_, _) => const CompanionsScreen(),
              ),
              GoRoute(
                path: 'saved',
                name: RouteNames.saved,
                parentNavigatorKey: rootNavigatorKey,
                builder: (_, _) => const SavedScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  ),

  // ------------------------------------------------------- full-screen
  GoRoute(
    path: '/hospitals/:id',
    name: RouteNames.hospital,
    builder: (_, s) => HospitalDetailScreen(hospitalId: s.pathParameters['id']!),
  ),
  GoRoute(
    path: '/doctors/:id',
    name: RouteNames.doctor,
    builder: (_, s) => DoctorDetailScreen(doctorId: s.pathParameters['id']!),
  ),
  GoRoute(
    path: Routes.screeningNew,
    name: RouteNames.screeningNew,
    builder: (_, s) => ScreeningStartScreen(specialtySlug: s.uri.queryParameters['specialty']),
  ),
  GoRoute(
    path: '/screening/:id/step/:step',
    name: RouteNames.screeningStep,
    redirect: (_, s) {
      final step = int.tryParse(s.pathParameters['step'] ?? '');
      if (step == null || step < 1 || step > 4) return Routes.screeningStep(s.pathParameters['id']!, 1);
      return null;
    },
    builder: (_, s) =>
        ScreeningStepScreen(screeningId: s.pathParameters['id']!, step: int.parse(s.pathParameters['step']!)),
  ),
  GoRoute(
    path: '/screening/:id/processing',
    name: RouteNames.screeningProcessing,
    builder: (_, s) => ScreeningProcessingScreen(screeningId: s.pathParameters['id']!),
  ),
  GoRoute(
    path: '/screening/:id/matches',
    name: RouteNames.matches,
    builder: (_, s) => MatchesScreen(screeningId: s.pathParameters['id']!),
  ),
  GoRoute(
    path: Routes.compare,
    name: RouteNames.compare,
    builder: (_, s) => CompareScreen(
      screeningId: s.uri.queryParameters['screening'],
      matchIds: (s.uri.queryParameters['matches'] ?? '').split(',').where((e) => e.isNotEmpty).toList(),
    ),
  ),
  GoRoute(
    path: Routes.costComparison,
    name: RouteNames.costComparison,
    builder: (_, s) => CostComparisonScreen(
      procedureSlug: s.uri.queryParameters['procedure'],
      country: s.uri.queryParameters['country'],
      currency: s.uri.queryParameters['currency'],
      screeningId: s.uri.queryParameters['screening'],
      matchId: s.uri.queryParameters['match'],
    ),
  ),
  GoRoute(
    path: '/book/:caseId',
    name: RouteNames.book,
    builder: (_, s) => BookScreen(
      caseId: s.pathParameters['caseId']!,
      quoteId: s.uri.queryParameters['quote'],
      packageId: s.uri.queryParameters['package'],
    ),
  ),
  GoRoute(
    path: '/pay/:bookingId',
    name: RouteNames.pay,
    builder: (_, s) =>
        PaymentScreen(bookingId: s.pathParameters['bookingId']!, installmentId: s.uri.queryParameters['installment']),
  ),
  GoRoute(path: Routes.support, name: RouteNames.support, builder: (_, _) => const SupportScreen()),
  GoRoute(path: Routes.notifications, name: RouteNames.notifications, builder: (_, _) => const NotificationsScreen()),
  GoRoute(
    path: Routes.cases,
    name: RouteNames.cases,
    builder: (_, _) => const CasesScreen(),
    routes: [
      GoRoute(
        path: ':id',
        name: RouteNames.caseDetail,
        builder: (_, s) => CaseDetailScreen(caseId: s.pathParameters['id']!),
      ),
    ],
  ),
  GoRoute(
    path: Routes.documents,
    name: RouteNames.documents,
    builder: (_, s) => DocumentsScreen(
      caseId: s.uri.queryParameters['case'],
      kind: DocumentKind.fromJsonOrNull(s.uri.queryParameters['kind']),
    ),
  ),
  // documents_ai + voice (PLAN §7.1 / §7.2)
  GoRoute(
    path: Routes.reportCapture,
    name: RouteNames.reportCapture,
    builder: (_, s) => ReportCaptureScreen(
      caseId: s.uri.queryParameters['caseId'],
      screeningId: s.uri.queryParameters['screeningId'],
      kind: DocumentKind.fromJsonOrNull(s.uri.queryParameters['kind']),
    ),
  ),
  GoRoute(
    path: '/reports/analysis/:id',
    name: RouteNames.reportAnalysis,
    builder: (_, s) => ReportAnalysisScreen(analysisId: s.pathParameters['id']!),
  ),
  GoRoute(
    path: Routes.voiceIntake,
    name: RouteNames.voiceIntake,
    builder: (_, s) => VoiceIntakeScreen(screeningId: s.uri.queryParameters['screeningId']),
  ),
];

/// Locations a guest (`is_guest=true`) may open: browse + screening (+ auth for upgrading).
bool isGuestAllowedLocation(String path) {
  if (path == Routes.profile) return true;
  const prefixes = [
    Routes.home,
    Routes.search,
    '/hospitals/',
    '/doctors/',
    '/screening/',
    Routes.compare,
    Routes.costComparison,
    Routes.auth,
    // screening helpers: report capture (screening step 3) and voice intake (steps 1-2)
    Routes.reportCapture,
    Routes.voiceIntake,
  ];
  return prefixes.any((p) => path == p || path.startsWith(p.endsWith('/') ? p : '$p/'));
}

/// Locations a signed-in (non-guest) user of [role] may open.
bool isRoleAllowedLocation(UserRole role, String path) {
  final inAgent = Routes.isWithin(path, Routes.agentHome);
  final inHospital = Routes.isWithin(path, Routes.hospitalHome);
  return switch (role) {
    UserRole.patient => !inAgent && !inHospital,
    // Agents may also open the shared catalog detail pages while comparing options for a patient.
    UserRole.agent => inAgent || path.startsWith('/hospitals/') || path.startsWith('/doctors/'),
    UserRole.hospital => inHospital,
    _ => false,
  };
}

bool _isAuthFlow(String path) => path == Routes.auth || path.startsWith('${Routes.auth}/');

/// Accepts only in-app absolute paths for `?from=` (prevents open redirects).
String? safeFromParam(String? from) {
  if (from == null || from.isEmpty) return null;
  if (!from.startsWith('/') || from.startsWith('//') || from.contains('://')) return null;
  final path = Uri.tryParse(from)?.path ?? '';
  if (path == Routes.splash || path == Routes.onboarding || _isAuthFlow(path)) return null;
  return from;
}

/// Pure redirect logic (unit-testable).
String? computeRedirect({required AuthState auth, required bool onboardingSeen, required Uri uri}) {
  final path = uri.path;
  final here = uri.toString();
  final from = safeFromParam(uri.queryParameters['from']);

  if (!auth.isKnown) {
    if (path == Routes.splash) return null;
    return Uri(path: Routes.splash, queryParameters: {'from': here}).toString();
  }

  final role = auth.user?.role;
  if (!auth.hasSession || (role != null && role.isStaff)) {
    if (path == Routes.splash) {
      if (!onboardingSeen) return Routes.onboarding;
      return from == null ? Routes.auth : Uri(path: Routes.auth, queryParameters: {'from': from}).toString();
    }
    if (path == Routes.onboarding || _isAuthFlow(path)) return null;
    if (!onboardingSeen) return Routes.onboarding;
    return Uri(path: Routes.auth, queryParameters: {'from': here}).toString();
  }

  if (auth.isGuest) {
    if (path == Routes.splash || path == Routes.onboarding) {
      return from != null && isGuestAllowedLocation(Uri.parse(from).path) ? from : Routes.home;
    }
    if (isGuestAllowedLocation(path)) return null;
    return Routes.registerFrom(here);
  }

  // Full account: patient, agent or hospital user.
  final userRole = role ?? UserRole.patient;
  final home = Routes.homeFor(userRole);
  if (path == Routes.splash || path == Routes.onboarding || _isAuthFlow(path)) {
    return from != null && isRoleAllowedLocation(userRole, Uri.parse(from).path) ? from : home;
  }
  if (!isRoleAllowedLocation(userRole, path)) return home;
  return null;
}

class _NavShell extends ConsumerWidget {
  const _NavShell({required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return BottomNavShell(navigationShell: shell, badges: ref.watch(navBadgesProvider));
  }
}

/// Notifies go_router when auth status / user or the onboarding flag changes.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen<(AuthStatus, String?)>(
      authStateProvider.select((s) => (s.status, s.user?.id)),
      (_, _) => notifyListeners(),
    );
    ref.listen<bool>(onboardingSeenProvider, (_, _) => notifyListeners());
  }
}
