import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/screening/screens/screening_processing_screen.dart';
import 'package:heal_india_global/features/screening/widgets/emergency_guidance.dart';

import 'screening_fakes.dart';

List<RouteBase> _routes() => [
  GoRoute(
    path: '/screening/:id/processing',
    builder: (_, s) => ScreeningProcessingScreen(screeningId: s.pathParameters['id']!),
  ),
  GoRoute(path: '/screening/:id/matches', builder: (_, s) => StubPage('MATCHES ${s.pathParameters['id']}')),
];

const _processing = Screening(id: 's1', status: ScreeningStatus.processing, specialty: cardiology);

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  test('emergency numbers by country', () {
    expect(emergencyNumberFor('US'), '911');
    expect(emergencyNumberFor('gb'), '999');
    expect(emergencyNumberFor('NG'), '112');
    expect(emergencyNumberFor(null), '112');
  });

  testWidgets('shows the animated checklist and opens matches when completed', (tester) async {
    final repo = FakeScreeningRepository(
      watchSnapshots: [
        _processing,
        const Screening(id: 's1', status: ScreeningStatus.completed, urgency: Urgency.routine),
      ],
    );
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _routes(), initialLocation: '/screening/s1/processing');
    await tester.pump();

    expect(find.text('Analyzing your condition'), findsOneWidget);
    expect(find.text('Matching with specialists'), findsOneWidget);
    expect(find.text('Calculating savings'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Your matches are ready!'), findsOneWidget);

    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('MATCHES s1'), findsOneWidget);
  });

  testWidgets('emergency urgency shows full-screen local emergency guidance', (tester) async {
    final repo = FakeScreeningRepository(
      watchSnapshots: [
        const Screening(
          id: 's1',
          status: ScreeningStatus.completed,
          urgency: Urgency.emergency,
          homeCountry: 'US',
          redFlags: ['Chest pain at rest'],
        ),
      ],
    );
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _routes(), initialLocation: '/screening/s1/processing');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Emergency — seek local care now'), findsOneWidget);
    expect(find.text('Chest pain at rest'), findsOneWidget);
    expect(find.text('Call emergency services (911)'), findsOneWidget);

    await tester.tap(find.text('I understand - view my results anyway'));
    await tester.pumpAndSettle();
    expect(find.text('MATCHES s1'), findsOneWidget);
  });

  testWidgets('a failed analysis offers a retry that reruns the screening', (tester) async {
    final repo = FakeScreeningRepository(
      watchSnapshots: [const Screening(id: 's1', status: ScreeningStatus.failed, error: 'AI unavailable')],
    );
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _routes(), initialLocation: '/screening/s1/processing');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('We could not complete the analysis'), findsOneWidget);
    expect(find.text('AI unavailable'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await tester.pump();
    expect(repo.reruns, 1);
    // Leave the screen so its timers and animation are disposed.
    GoRouter.of(tester.element(find.byType(ScreeningProcessingScreen))).go('/screening/s1/matches');
    await tester.pumpAndSettle();
  });
}
