import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import 'agent_shell.dart';
import 'screens/agent_bookings_screens.dart';
import 'screens/agent_cases_screens.dart';
import 'screens/agent_patients_screens.dart';
import 'screens/agent_screening_screens.dart';

/// Locations inside the agent shell. Everything stays under `/agent` — the role redirect sends
/// agents anywhere else back to `/agent` (PLAN §3.1).
abstract final class AgentRoutes {
  static const home = Routes.agentHome;

  /// Tab indexes of [AgentShell].
  static const tabDashboard = 0;
  static const tabPatients = 1;
  static const tabCases = 2;
  static const tabBookings = 3;
  static const tabEarnings = 4;

  /// `/agent?tab=<index>`
  static String tab(int index) => '$home?tab=$index';

  static const newPatient = '$home/patients/new';
  static String patient(String id) => '$home/patients/$id';
  static String editPatient(String id) => '${patient(id)}/edit';

  /// Run a screening on behalf of the patient.
  static String newScreening(String patientId) => '${patient(patientId)}/screening';

  /// Quote comparison across hospitals for one patient.
  static String compare(String patientId) => '${patient(patientId)}/compare';

  /// Request a quote from a hospital for the patient (optionally linked to a screening).
  static String requestQuote(String patientId, {String? screeningId}) => screeningId == null
      ? '${patient(patientId)}/request-quote'
      : '${patient(patientId)}/request-quote?screening=$screeningId';

  static String screening(String id) => '$home/screenings/$id';
  static String caseDetail(String id) => '$home/cases/$id';
  static String book(String caseId, {required String quoteId}) => '${caseDetail(caseId)}/book?quote=$quoteId';
  static String booking(String id) => '$home/bookings/$id';
}

/// Route tree of the agent shell, mounted by `core/router/app_router.dart` under [Routes.agentHome].
List<RouteBase> agentPortalRoutes() => [
  GoRoute(
    path: Routes.agentHome,
    name: RouteNames.agentHome,
    builder: (_, s) => AgentShell(initialTab: int.tryParse(s.uri.queryParameters['tab'] ?? '') ?? 0),
    routes: [
      GoRoute(path: 'patients/new', builder: (_, _) => const AgentPatientFormScreen()),
      GoRoute(
        path: 'patients/:id',
        builder: (_, s) => AgentPatientDetailScreen(patientId: s.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'edit',
            builder: (_, s) => AgentPatientFormScreen(patientId: s.pathParameters['id']),
          ),
          GoRoute(
            path: 'screening',
            builder: (_, s) => AgentScreeningFormScreen(patientId: s.pathParameters['id']!),
          ),
          GoRoute(
            path: 'compare',
            builder: (_, s) => QuoteComparisonScreen(patientId: s.pathParameters['id']!),
          ),
          GoRoute(
            path: 'request-quote',
            builder: (_, s) =>
                RequestQuoteScreen(patientId: s.pathParameters['id']!, screeningId: s.uri.queryParameters['screening']),
          ),
        ],
      ),
      GoRoute(
        path: 'screenings/:id',
        builder: (_, s) => AgentScreeningResultScreen(screeningId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: 'cases/:id',
        builder: (_, s) => AgentCaseDetailScreen(caseId: s.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'book',
            builder: (_, s) =>
                AgentCreateBookingScreen(caseId: s.pathParameters['id']!, quoteId: s.uri.queryParameters['quote']),
          ),
        ],
      ),
      GoRoute(
        path: 'bookings/:id',
        builder: (_, s) => AgentBookingDetailScreen(bookingId: s.pathParameters['id']!),
      ),
    ],
  ),
];
