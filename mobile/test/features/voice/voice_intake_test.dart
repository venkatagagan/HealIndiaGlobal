import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart' show ProgressCallback;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/voice/data/voice_recorder.dart';
import 'package:heal_india_global/features/voice/data/voice_repository.dart';
import 'package:heal_india_global/features/voice/models/voice_models.dart';
import 'package:heal_india_global/features/voice/screens/voice_intake_screen.dart';

import '../screening/screening_fakes.dart' show dummyApiClient;

const _suggestion = IntakeSuggestion(
  transcriptEn: 'My chest hurts for two weeks',
  bodyAreas: ['chest'],
  painIntensity: 6,
  symptoms: [SymptomResponse(name: 'Chest pain', answer: SymptomAnswer.yes)],
  durationValue: 2,
  durationUnit: DurationUnit.weeks,
);

class FakeRecorder implements VoiceRecorder {
  FakeRecorder({this.allowed = true});

  final bool allowed;
  bool started = false;
  final _levels = StreamController<double>.broadcast();

  @override
  Future<bool> hasPermission() async => allowed;

  @override
  Future<void> start() async => started = true;

  @override
  Future<VoiceClip?> stop() async => VoiceClip(
    fileName: 'voice.m4a',
    contentType: 'audio/mp4',
    bytes: Uint8List(8),
    duration: const Duration(seconds: 5),
  );

  @override
  Future<void> cancel() async {}

  @override
  Stream<double> levels() => _levels.stream;

  @override
  Future<void> dispose() => _levels.close();
}

class FakeVoiceRepo extends VoiceRepository {
  FakeVoiceRepo() : super(dummyApiClient());

  bool uploaded = false;
  IntakeSuggestion? confirmedIntake;
  String? confirmedTranscript;
  String? extractedText;
  int gets = 0;

  @override
  Future<VoiceTranscription> upload({
    required String fileName,
    required String contentType,
    Uint8List? bytes,
    String? filePath,
    String? screeningId,
    String? caseId,
    String? patientId,
    bool consentAi = true,
    ProgressCallback? onProgress,
  }) async {
    uploaded = true;
    return const VoiceTranscription(id: 't1', status: VoiceStatus.queued);
  }

  @override
  Future<VoiceTranscription> get(String id) async {
    gets++;
    return const VoiceTranscription(
      id: 't1',
      status: VoiceStatus.completed,
      transcript: 'My chest hurts for two weeks',
      transcriptEn: 'My chest hurts for two weeks',
      intakeSuggestion: _suggestion,
    );
  }

  @override
  Future<VoiceConfirmResult> confirm(String id, {String? transcript, required IntakeSuggestion intake}) async {
    confirmedIntake = intake;
    confirmedTranscript = transcript;
    return const VoiceConfirmResult(appliedFields: ['body_areas']);
  }

  @override
  Future<IntakeSuggestion> intakeExtract(String text, {String? screeningId}) async {
    extractedText = text;
    return _suggestion;
  }
}

Future<Future<VoiceIntakeResult?> Function()> _pumpScreen(
  WidgetTester tester, {
  required FakeVoiceRepo repo,
  required FakeRecorder recorder,
}) async {
  VoiceIntakeResult? result;
  var done = false;
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        voiceRepositoryProvider.overrideWithValue(repo),
        voiceRecorderProvider.overrideWithValue(() => recorder),
        specialtiesProvider.overrideWith((ref) async => const <Specialty>[]),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                result = await Navigator.of(context).push(
                  MaterialPageRoute<VoiceIntakeResult>(
                    builder: (_) =>
                        const VoiceIntakeScreen(screeningId: 's1', pollInterval: Duration(milliseconds: 10)),
                  ),
                );
                done = true;
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  return () async => done ? result : null;
}

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  test('IntakeSuggestion parses and serializes snake_case', () {
    final s = IntakeSuggestion.fromJson({
      'body_areas': ['chest'],
      'pain_intensity': 14,
      'symptoms': [
        {'name': 'Cough', 'answer': 'maybe'},
      ],
      'duration_unit': 'days',
      'severity': {'work': 'severe'},
      'red_flags': ['chest pain at rest'],
      'urgency_hint': 'emergency',
    });
    expect(s.painIntensity, 10);
    expect(s.symptoms.single.answer, SymptomAnswer.maybe);
    expect(s.severity?.work, SeverityLevel.severe);
    expect(s.isEmergency, isTrue);
    expect(s.toJson()['duration_unit'], 'days');
  });

  testWidgets(
    'record → consent → upload → review → edit an answer → confirm',
    timeout: const Timeout(Duration(seconds: 60)),
    (tester) async {
      final repo = FakeVoiceRepo();
      final recorder = FakeRecorder();
      final result = await _pumpScreen(tester, repo: repo, recorder: recorder);
      await tester.pump();
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('voice-mic')));
      await tester.pump();
      expect(recorder.started, isTrue);
      expect(find.textContaining('/ 3:00'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('voice-mic')));
      await tester.pumpAndSettle();

      // consent is mandatory
      await tester.scrollUntilVisible(find.text('Use this recording'), 200);
      await tester.tap(find.text('Use this recording'));
      await tester.pump();
      expect(find.textContaining('Please agree'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('voice-consent')));
      await tester.pump();
      await tester.tap(find.text('Use this recording'));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      await tester.pumpAndSettle();

      expect(repo.uploaded, isTrue);
      expect(find.text('Check your answers'), findsOneWidget);
      expect(find.text('My chest hurts for two weeks'), findsOneWidget); // editable transcript

      // edit: Chest pain -> "No"
      await tester.ensureVisible(find.byTooltip('No: Chest pain'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('No: Chest pain'));
      await tester.pump();

      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(repo.confirmedIntake?.symptoms.single.answer, SymptomAnswer.no);
      expect(repo.confirmedIntake?.bodyAreas, ['chest']);
      expect(repo.confirmedTranscript, 'My chest hurts for two weeks');
      final r = await result();
      expect(r?.intake.symptoms.single.answer, SymptomAnswer.no);
      expect(r?.transcriptionId, 't1');
    },
  );

  testWidgets(
    'microphone denied shows guidance; "Type instead" uses intake-extract',
    timeout: const Timeout(Duration(seconds: 60)),
    (tester) async {
      final repo = FakeVoiceRepo();
      final result = await _pumpScreen(tester, repo: repo, recorder: FakeRecorder(allowed: false));
      await tester.pump();
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('voice-mic')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Microphone access is off'), findsOneWidget);

      await tester.tap(find.text('Type instead'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('voice-typed')), 'Chest pain for two weeks');
      await tester.tap(find.text('Fill my answers'));
      await tester.pumpAndSettle();
      expect(repo.extractedText, 'Chest pain for two weeks');

      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(repo.confirmedIntake, isNull, reason: 'intake-extract results are applied by the screening PATCH');
      expect((await result())?.intake.bodyAreas, ['chest']);
    },
  );
}
