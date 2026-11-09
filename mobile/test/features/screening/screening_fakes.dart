import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/network/realtime_service.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/core/repositories/screening_repository.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// An [ApiClient] that is never used for real requests (fakes override every call).
ApiClient dummyApiClient() => ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://127.0.0.1:9/api/v1');

const cardiology = EntityRef(id: 'sp-cardio', slug: 'cardiology', name: 'Cardiology');

Screening draftScreening({String id = 's1'}) =>
    Screening(id: id, status: ScreeningStatus.draft, specialty: cardiology, homeCountry: 'US');

/// In-memory screening repository recording PATCH / submit calls.
class FakeScreeningRepository extends ScreeningRepository {
  FakeScreeningRepository({
    Screening? initial,
    this.watchSnapshots = const [],
    this.matchList = const [],
  }) : current = initial ?? draftScreening(),
       super(dummyApiClient());

  Screening current;
  final List<Screening> watchSnapshots;
  final List<ScreeningMatch> matchList;
  final List<Map<String, dynamic>> patches = [];
  final List<bool> submits = [];
  int reruns = 0;

  @override
  Future<Screening> create({String? specialtySlug}) async => current;

  @override
  Future<Screening> get(String id) async => current;

  @override
  Future<Screening> update(String id, ScreeningPatch patch) async {
    patches.add(patch.toJson());
    return current;
  }

  @override
  Future<Screening> submit(String id, {required bool consentAi}) async {
    submits.add(consentAi);
    return current;
  }

  @override
  Future<List<ScreeningMatch>> matches(String id) async => matchList;

  @override
  Future<Screening> rerun(String id) async {
    reruns++;
    return current;
  }

  @override
  Stream<Screening> watch(
    String id, {
    Duration interval = const Duration(seconds: 2),
    Duration timeout = const Duration(minutes: 3),
  }) => Stream.fromIterable(watchSnapshots);
}

/// Catalog repository serving a fixed symptom library.
class FakeCatalogRepository extends CatalogRepository {
  FakeCatalogRepository() : super(dummyApiClient());

  static const library = [
    SymptomInfo(name: 'Chest pain', specialtySlugs: ['cardiology'], bodyAreas: ['chest']),
    SymptomInfo(name: 'Shortness of breath', specialtySlugs: ['cardiology'], bodyAreas: ['chest']),
    SymptomInfo(name: 'Fatigue', specialtySlugs: ['cardiology'], bodyAreas: ['general']),
  ];

  final List<({String? specialty, String? bodyArea})> calls = [];

  @override
  Future<List<SymptomInfo>> symptoms({String? specialty, String? bodyArea}) async {
    calls.add((specialty: specialty, bodyArea: bodyArea));
    return library
        .where((s) => specialty == null || s.specialtySlugs.contains(specialty))
        .where((s) => bodyArea == null || s.bodyAreas.contains(bodyArea))
        .toList();
  }
}

/// Common provider overrides for feature widget tests.
Future<List<Override>> featureOverrides({
  required FakeScreeningRepository screenings,
  FakeCatalogRepository? catalog,
}) async {
  SharedPreferences.setMockInitialValues({});
  final sp = await SharedPreferences.getInstance();
  return [
    sharedPreferencesProvider.overrideWithValue(sp),
    tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
    screeningRepositoryProvider.overrideWithValue(screenings),
    catalogRepositoryProvider.overrideWithValue(catalog ?? FakeCatalogRepository()),
    patientProfileProvider.overrideWith((ref) => Completer<PatientProfile>().future),
    fxRatesProvider.overrideWith((ref) async => const <String, double>{}),
    realtimeEventsProvider.overrideWith((ref) => const Stream<RealtimeEvent>.empty()),
  ];
}

/// Placeholder page for routes outside the feature under test.
class StubPage extends StatelessWidget {
  const StubPage(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(label)));
}

/// Pumps [routes] (plus `/home` and catch-all stubs) under a dark-theme router app.
Future<GoRouter> pumpRouterApp(
  WidgetTester tester, {
  required List<Override> overrides,
  required List<RouteBase> routes,
  required String initialLocation,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      ...routes,
      GoRoute(path: '/home', builder: (_, _) => const StubPage('HOME')),
    ],
    errorBuilder: (_, s) => StubPage('STUB ${s.uri}'),
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(theme: AppTheme.dark(), routerConfig: router),
    ),
  );
  return router;
}
