import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/screening/providers/screening_draft.dart';
import 'package:heal_india_global/features/screening/screens/screening_step_screen.dart';
import 'package:heal_india_global/features/screening/widgets/body_map.dart';

import 'screening_fakes.dart';

List<RouteBase> _stepRoutes() => [
  GoRoute(
    path: '/screening/:id/step/:step',
    builder: (_, s) =>
        ScreeningStepScreen(screeningId: s.pathParameters['id']!, step: int.parse(s.pathParameters['step']!)),
  ),
  GoRoute(path: '/screening/:id/processing', builder: (_, s) => StubPage('PROCESSING ${s.pathParameters['id']}')),
];

Future<void> _settle(WidgetTester tester) async {
  await tester.pumpAndSettle(const Duration(milliseconds: 50), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
}

/// Lets a queued snackbar replace the current one.
Future<void> _pumpSnack(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 600));
}

Future<void> _clearSnacks(WidgetTester tester) async {
  ScaffoldMessenger.of(tester.element(find.byType(Scaffold).last)).clearSnackBars();
  await _settle(tester);
}

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  group('ScreeningDraft', () {
    test('validation per step', () {
      final d = ScreeningDraft.fromScreening(draftScreening());
      expect(d.validate(1), isNotNull);
      expect(d.copyWith(bodyAreas: {'chest'}).validate(1), isNull);
      expect(d.validate(2), isNotNull);
      expect(d.answer('Fatigue', SymptomAnswer.no).validate(2), isNotNull);
      expect(d.answer('Fatigue', SymptomAnswer.maybe).validate(2), isNull);
      expect(d.validate(3), isNotNull);
      expect(d.copyWith(durationValue: 2).validate(3), isNull);
      expect(d.validate(4), isNull);
      final badWindow = d.copyWith(
        preferences: ScreeningPreferences(travelWindowStart: DateTime(2026, 12, 10), travelWindowEnd: DateTime(2026, 12, 1)),
      );
      expect(badWindow.validate(4), isNotNull);
    });

    test('answers replace earlier answers for the same symptom', () {
      final d = ScreeningDraft.fromScreening(
        draftScreening(),
      ).answer('Chest pain', SymptomAnswer.no).answer('chest pain', SymptomAnswer.yes);
      expect(d.symptoms, hasLength(1));
      expect(d.positiveSymptoms.single.answer, SymptomAnswer.yes);
      expect(d.removeSymptom('CHEST PAIN').symptoms, isEmpty);
    });

    test('patchFor sends only the fields of each step', () {
      final d = ScreeningDraft.fromScreening(draftScreening()).copyWith(
        bodyAreas: {'chest'},
        painIntensity: 7,
        durationValue: 3,
        durationUnit: DurationUnit.months,
        previousTreatments: {'medication'},
        reports: const [ScreeningReport(id: 'doc1', name: 'ecg.pdf')],
      );
      expect(d.patchFor(1).toJson(), {
        'body_areas': ['chest'],
        'pain_intensity': 7,
      });
      final p3 = d.patchFor(3).toJson();
      expect(p3['duration_value'], 3);
      expect(p3['duration_unit'], 'months');
      expect(p3['previous_treatments'], ['medication']);
      expect(p3['report_document_ids'], ['doc1']);
      expect(p3.containsKey('body_areas'), isFalse);
      expect(d.patchFor(4).toJson().keys, ['preferences']);
    });
  });

  testWidgets('steps 1-4 validate, PATCH each step and submit with AI consent', (tester) async {
    final repo = FakeScreeningRepository();
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _stepRoutes(), initialLocation: '/screening/s1/step/1');
    await _settle(tester);

    // ---- step 1
    expect(find.text('Where are you experiencing issues?'), findsOneWidget);
    expect(find.text('Step 1 of 4'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await tester.pump();
    expect(find.text('Tap the body to select at least one area.'), findsOneWidget);
    expect(repo.patches, isEmpty);

    final canvas = find.byKey(BodyMap.canvasKey);
    await tester.ensureVisible(canvas);
    await tester.pumpAndSettle();
    await tester.tapAt(
      tester.getTopLeft(canvas) + BodyMapGeometry.localAnchor(BodyRegion.chest, BodyView.front, tester.getSize(canvas)),
    );
    await tester.pump();
    expect(find.text('Chest'), findsOneWidget); // selected chip
    await tester.tap(find.text('Next'));
    await _settle(tester);
    expect(repo.patches.last, {
      'body_areas': ['chest'],
      'pain_intensity': 5,
    });

    // ---- step 2
    expect(find.text('Which symptoms are you experiencing?'), findsOneWidget);
    expect(find.text('Chest pain'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await _pumpSnack(tester);
    expect(find.textContaining('at least one symptom'), findsOneWidget);

    await tester.tap(find.byTooltip('Yes'));
    await _settle(tester);
    expect(find.byKey(const ValueKey('my-symptom-Chest pain')), findsOneWidget);
    expect(find.text('Shortness of breath'), findsOneWidget); // next card

    await _clearSnacks(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Add another symptom'), 'Palpitations');
    await tester.tap(find.byTooltip('Add symptom'));
    await tester.pump();
    expect(find.byKey(const ValueKey('my-symptom-Palpitations')), findsOneWidget);

    await tester.tap(find.text('Next'));
    await _settle(tester);
    final symptoms = repo.patches.last['symptoms'] as List<dynamic>;
    expect(symptoms, [
      {'name': 'Chest pain', 'answer': 'yes'},
      {'name': 'Palpitations', 'answer': 'yes'},
    ]);

    // ---- step 3
    expect(find.text('How long have you had this condition?'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await _pumpSnack(tester);
    expect(find.text('Tell us how long you have had this condition.'), findsOneWidget);
    await _clearSnacks(tester);
    await tester.tap(find.text('Months'));
    await tester.enterText(find.byKey(const ValueKey('duration-value')), '3');
    await tester.tap(find.text('Mild').first);
    await tester.pump();
    await tester.scrollUntilVisible(
      find.text('Medication'),
      200,
      scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first,
    );
    await tester.tap(find.text('Medication'));
    await tester.pump();
    await tester.tap(find.text('Next'));
    await _settle(tester);
    final p3 = repo.patches.last;
    expect(p3['duration_value'], 3);
    expect(p3['duration_unit'], 'months');
    expect(p3['severity'], {'work': 'mild'});
    expect(p3['previous_treatments'], ['medication']);

    // ---- step 4
    expect(find.text('Personalize Your Matches'), findsOneWidget);
    expect(find.text('Step 4 of 4 · Optional'), findsOneWidget);
    await tester.tap(find.text('Arabic'));
    await tester.tap(find.text('Female'));
    await tester.pump();
    await tester.tap(find.text('Find My Doctors'));
    await _settle(tester);
    expect(find.text('Use AI recommendations?'), findsOneWidget);
    await tester.tap(find.text('I agree, use AI'));
    await _settle(tester);

    final prefs = repo.patches.last['preferences'] as Map<String, dynamic>;
    expect(prefs['languages'], ['Arabic']);
    expect(prefs['doctor_gender'], 'female');
    expect(prefs['use_ai'], true);
    expect(repo.submits, [true]);
    expect(find.text('PROCESSING s1'), findsOneWidget);
  });

  testWidgets('declining AI consent submits with the rules engine', (tester) async {
    final repo = FakeScreeningRepository();
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _stepRoutes(), initialLocation: '/screening/s1/step/4');
    await _settle(tester);

    await tester.tap(find.text('Skip & Use Defaults'));
    await _settle(tester);
    await tester.tap(find.text('Use standard matching'));
    await _settle(tester);

    final prefs = repo.patches.last['preferences'] as Map<String, dynamic>;
    expect(prefs['use_ai'], false);
    expect(prefs['doctor_gender'], 'no_preference');
    expect(repo.submits, [false]);
    expect(find.text('PROCESSING s1'), findsOneWidget);
  });

  testWidgets('Save & Exit patches the current answers and goes home', (tester) async {
    final repo = FakeScreeningRepository();
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _stepRoutes(), initialLocation: '/screening/s1/step/1');
    await _settle(tester);

    await tester.tap(find.text('Save & Exit'));
    await _settle(tester);
    expect(repo.patches, hasLength(1));
    expect(find.text('HOME'), findsOneWidget);
  });

  testWidgets('a submitted screening cannot be edited', (tester) async {
    final repo = FakeScreeningRepository(
      initial: const Screening(id: 's1', status: ScreeningStatus.completed, specialty: cardiology),
    );
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _stepRoutes(), initialLocation: '/screening/s1/step/2');
    await _settle(tester);
    expect(find.text('Your results are ready'), findsOneWidget);
    expect(find.text('View my matches'), findsOneWidget);
  });

  testWidgets('symptom suggestions are loaded per body area for the specialty', (tester) async {
    final catalog = FakeCatalogRepository();
    final repo = FakeScreeningRepository(
      initial: const Screening(
        id: 's1',
        status: ScreeningStatus.draft,
        specialty: cardiology,
        bodyAreas: ['chest', 'general'],
      ),
    );
    final overrides = await featureOverrides(screenings: repo, catalog: catalog);
    await pumpRouterApp(tester, overrides: overrides, routes: _stepRoutes(), initialLocation: '/screening/s1/step/2');
    await _settle(tester);
    expect(catalog.calls, containsAll([(specialty: 'cardiology', bodyArea: 'chest'), (specialty: 'cardiology', bodyArea: 'general')]));
    expect(find.text('Chest pain'), findsOneWidget);
  });
}
