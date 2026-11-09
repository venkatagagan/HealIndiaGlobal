import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/matches/widgets/consultation_request.dart';
import 'package:heal_india_global/features/screening/providers/emergency_ack.dart';
import 'package:heal_india_global/features/screening/providers/intake_merge.dart';
import 'package:heal_india_global/features/screening/providers/screening_draft.dart';
import 'package:heal_india_global/features/voice/models/voice_models.dart';

import 'screening_fakes.dart';

class _FakeCaseEmergencyApi extends CaseEmergencyApi {
  _FakeCaseEmergencyApi() : super(dummyApiClient());

  final List<String> acked = [];

  @override
  Future<void> acknowledge(String caseId) async => acked.add(caseId);
}

ScreeningMatch _match() => ScreeningMatch.fromJson({
  'id': 'm1',
  'hospital': {'id': 'h1', 'name': 'Apollo', 'slug': 'apollo'},
});

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  group('mergeIntake', () {
    test('fills empty fields, extends lists and reports conflicts', () {
      final draft = ScreeningDraft.fromScreening(draftScreening()).copyWith(
        bodyAreas: {'chest'},
        symptoms: const [SymptomResponse(name: 'Cough', answer: SymptomAnswer.yes)],
        severity: const ScreeningSeverity(work: SeverityLevel.mild),
        notes: 'Started after a flu',
      );
      const s = IntakeSuggestion(
        bodyAreas: ['chest', 'back', 'eyes'],
        painIntensity: 7,
        symptoms: [
          SymptomResponse(name: 'cough', answer: SymptomAnswer.no),
          SymptomResponse(name: 'Fever', answer: SymptomAnswer.yes),
        ],
        durationValue: 3,
        durationUnit: DurationUnit.weeks,
        severity: ScreeningSeverity(work: SeverityLevel.severe, sleep: SeverityLevel.moderate),
        previousTreatments: ['medication'],
        notes: 'Worse at night',
      );
      final m = mergeIntake(draft, s);
      expect(m.draft.bodyAreas, {'chest', 'back'}, reason: 'unknown ids (eyes) are ignored');
      expect(m.draft.painIntensity, 7);
      expect(m.draft.symptoms.map((x) => x.name), ['Cough', 'Fever']);
      expect(m.draft.durationValue, 3);
      expect(m.draft.severity.work, SeverityLevel.mild, reason: 'never silently overwritten');
      expect(m.draft.severity.sleep, SeverityLevel.moderate);
      expect(m.draft.previousTreatments, {'medication'});
      expect(m.draft.notes, 'Started after a flu');
      expect(m.conflicts.map((c) => c.label), ['Cough', 'Daily impact: Work', 'Notes']);

      final resolved = m.conflicts.first.apply(m.draft);
      expect(resolved.symptoms.firstWhere((x) => x.name == 'Cough').answer, SymptomAnswer.no);
    });
  });

  group('emergency gating (#13)', () {
    Future<(FakeScreeningRepository, _FakeCaseEmergencyApi)> pump(WidgetTester tester) async {
      final screenings = FakeScreeningRepository(
        initial: const Screening(
          id: 's1',
          status: ScreeningStatus.completed,
          urgency: Urgency.emergency,
          redFlags: ['Chest pain at rest'],
        ),
      );
      final api = _FakeCaseEmergencyApi();
      await pumpRouterApp(
        tester,
        overrides: [
          ...await featureOverrides(screenings: screenings),
          caseEmergencyApiProvider.overrideWithValue(api),
        ],
        initialLocation: '/m',
        routes: [
          GoRoute(
            path: '/m',
            builder: (context, _) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => requestConsultation(context, match: _match(), screeningId: 's1'),
                  child: const Text('book'),
                ),
              ),
            ),
          ),
        ],
      );
      return (screenings, api);
    }

    testWidgets('booking is blocked until the guidance is acknowledged', (tester) async {
      await pump(tester);
      await tester.tap(find.text('book'));
      await tester.pumpAndSettle();
      expect(find.text('Emergency — seek local care now'), findsOneWidget);

      // closing without acknowledging blocks the booking flow
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.text('Send request'), findsNothing);

      await tester.tap(find.text('book'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I understand the risk - continue'));
      await tester.pumpAndSettle();
      expect(find.text('Send request'), findsOneWidget);
    });

    testWidgets('a remembered acknowledgement skips the guidance', (tester) async {
      await pump(tester);
      final container = ProviderScope.containerOf(tester.element(find.text('book')));
      await container.read(emergencyAckProvider.notifier).acknowledge('s1');
      await tester.tap(find.text('book'));
      await tester.pumpAndSettle();
      expect(find.text('Emergency — seek local care now'), findsNothing);
      expect(find.text('Send request'), findsOneWidget);
    });
  });
}
