import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';
import 'hospital_shell.dart';
import 'screens/hospital_bookings_screens.dart';
import 'screens/hospital_cases_screens.dart';
import 'screens/hospital_discharge_screens.dart';
import 'screens/hospital_more_screens.dart';

/// Locations inside the hospital shell. Everything stays under `/hospital` — the role redirect sends
/// hospital users anywhere else back to `/hospital` (PLAN §3.1).
abstract final class HospitalRoutes {
  static const home = Routes.hospitalHome;

  /// Tab indexes of [HospitalShell].
  static const tabDashboard = 0;
  static const tabEnquiries = 1;
  static const tabPatients = 2;
  static const tabSettlements = 3;
  static const tabMore = 4;

  /// `/hospital?tab=<index>`
  static String tab(int index) => '$home?tab=$index';

  static String caseDetail(String id) => '$home/cases/$id';
  static String quoteBuilder(String caseId) => '${caseDetail(caseId)}/quote';
  static String booking(String id) => '$home/bookings/$id';
  static const itineraries = '$home/itineraries';
  static const visas = '$home/visas';
  static const doctors = '$home/doctors';
  static const priceList = '$home/price-list';

  /// `/hospital/discharge-summaries?case=&booking=` — all summaries, or one case's with "Start".
  static String dischargeSummaries({String? caseId, String? bookingId}) {
    final q = {'case': ?caseId, 'booking': ?bookingId};
    return Uri(path: '$home/discharge-summaries', queryParameters: q.isEmpty ? null : q).toString();
  }

  /// `/hospital/discharge-summaries/:id` — draft editor or final (read-only) view.
  static String dischargeSummary(String id) => '$home/discharge-summaries/$id';
}

/// Route tree of the hospital shell, mounted by `core/router/app_router.dart` under [Routes.hospitalHome].
List<RouteBase> hospitalPortalRoutes() => [
  GoRoute(
    path: Routes.hospitalHome,
    name: RouteNames.hospitalHome,
    builder: (_, s) => HospitalShell(initialTab: int.tryParse(s.uri.queryParameters['tab'] ?? '') ?? 0),
    routes: [
      GoRoute(
        path: 'cases/:id',
        builder: (_, s) => HospitalCaseDetailScreen(caseId: s.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'quote',
            builder: (_, s) => QuoteBuilderScreen(caseId: s.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: 'bookings/:id',
        builder: (_, s) => HospitalBookingDetailScreen(bookingId: s.pathParameters['id']!),
      ),
      GoRoute(path: 'itineraries', builder: (_, _) => const ItinerariesScreen()),
      GoRoute(path: 'visas', builder: (_, _) => const VisaRequestsScreen()),
      GoRoute(path: 'doctors', builder: (_, _) => const HospitalDoctorsScreen()),
      GoRoute(path: 'price-list', builder: (_, _) => const PriceListScreen()),
      GoRoute(
        path: 'discharge-summaries',
        builder: (_, s) => HospitalDischargeListScreen(
          caseId: s.uri.queryParameters['case'],
          bookingId: s.uri.queryParameters['booking'],
        ),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, s) => HospitalDischargeEditorScreen(summaryId: s.pathParameters['id']!),
          ),
        ],
      ),
    ],
  ),
];
