// Shared helpers for the phase-1 screen tests: the real repositories talk to a [RoutedAdapter] HTTP fake,
// so the JSON contracts of the new endpoints are exercised too.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/network/realtime_service.dart';

import '../agent_portal/portal_test_helpers.dart';
import '../onboarding/fl_harness.dart';

export '../agent_portal/portal_test_helpers.dart' show RoutedAdapter, SeenRequest, bodyOf, page;
export '../onboarding/fl_harness.dart' show guestUser, patientUser, routeLabel, quietPhase1Overrides, FakeAuthController;

/// An [ApiClient] answering from [adapter].
ApiClient fakeApi(RoutedAdapter adapter) =>
    ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://phase1.test/api/v1', httpClientAdapter: adapter);

/// The API error envelope.
(int, Map<String, Object?>) apiError(int status, String code, {String message = 'error', Object? details}) => (
  status,
  {
    'error': {'code': code, 'message': message, 'details': ?details},
  },
);

/// Pumps [screen] at [path] (fl harness) with the HTTP fake [adapter].
Future<GoRouter> pumpWithApi(
  WidgetTester tester, {
  required String path,
  required Widget Function(GoRouterState state) screen,
  required RoutedAdapter adapter,
  AuthState? auth,
  String? initialLocation,
  Locale locale = const Locale('en'),
  Size logicalSize = const Size(520, 1000),
  List<Override> overrides = const [],
  Map<String, Object> prefs = const {},
}) => pumpScreen(
  tester,
  path: path,
  screen: screen,
  auth: auth ?? AuthState.fromUser(patientUser),
  initialLocation: initialLocation,
  locale: locale,
  logicalSize: logicalSize,
  prefs: prefs,
  overrides: [
    apiClientProvider.overrideWithValue(fakeApi(adapter)),
    realtimeEventsProvider.overrideWith((ref) => const Stream<RealtimeEvent>.empty()),
    ...overrides,
  ],
);

/// A `HospitalCard` JSON.
Map<String, Object?> hospitalJson(
  String id,
  String name, {
  String? admission,
  String? consultation,
  List<Map<String, Object?>> verified = const [],
}) => {
  'id': id,
  'slug': id,
  'name': name,
  'city': 'Chennai',
  'accreditations': ['jci', 'nabh'],
  'accreditations_verified': verified,
  'next_available_admission': ?admission,
  'next_available_consultation': ?consultation,
  'currency': 'INR',
};
