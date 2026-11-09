import 'dart:typed_data';

import 'package:dio/dio.dart' show ProgressCallback;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/document_repository.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/documents_ai/data/document_analysis_repository.dart';
import 'package:heal_india_global/features/documents_ai/data/report_page_source.dart';
import 'package:heal_india_global/features/documents_ai/models/document_analysis.dart';
import 'package:heal_india_global/features/documents_ai/screens/report_capture_screen.dart';
import 'package:heal_india_global/features/documents_ai/widgets/report_analysis_card.dart';
import 'package:heal_india_global/features/documents_ai/widgets/report_analysis_view.dart';

import '../screening/screening_fakes.dart' show dummyApiClient;

const _draft = ReportData(
  docType: ReportDocType.labReport,
  facilityName: 'City Lab',
  summaryPatient: 'Your blood sugar is high.',
  keyFindings: [KeyFinding(finding: 'High fasting glucose', significance: FindingSignificance.attention)],
  labValues: [
    LabValue(test: 'Glucose', value: '180', unit: 'mg/dL', referenceRange: '70-100', flag: LabFlag.high),
    LabValue(test: 'Potassium', value: '6.9', unit: 'mmol/L', flag: LabFlag.critical),
  ],
);

DocumentAnalysis _analysis({
  AnalysisStatus status = AnalysisStatus.completed,
  AnalysisReviewStatus review = AnalysisReviewStatus.pendingReview,
  ReportData data = _draft,
  ReportData? confirmed,
}) => DocumentAnalysis(
  id: 'an1',
  status: status,
  reviewStatus: review,
  documentIds: const ['d1', 'd2'],
  data: data,
  aiOutput: _draft,
  confirmedData: confirmed,
);

class FakeAnalysisRepo extends DocumentAnalysisRepository {
  FakeAnalysisRepo(this.snapshots) : super(dummyApiClient());

  /// Successive `get` results (the last one repeats).
  final List<DocumentAnalysis> snapshots;
  int gets = 0;
  ReportData? confirmed;
  bool rejected = false;
  List<String>? createdWith;

  @override
  Future<DocumentAnalysis> get(String id) async => snapshots[(gets++).clamp(0, snapshots.length - 1)];

  @override
  Future<DocumentAnalysis> create({
    required List<String> documentIds,
    String? caseId,
    String? patientId,
    bool consentAi = true,
  }) async {
    createdWith = documentIds;
    return snapshots.first;
  }

  @override
  Future<DocumentAnalysis> confirm(String id, ReportData data) async {
    confirmed = data;
    return _analysis(review: AnalysisReviewStatus.confirmed, data: data, confirmed: data);
  }

  @override
  Future<DocumentAnalysis> reject(String id) async {
    rejected = true;
    return _analysis(review: AnalysisReviewStatus.rejected);
  }
}

class FakeDocumentRepo extends DocumentRepository {
  FakeDocumentRepo() : super(dummyApiClient());

  final List<String> uploaded = [];

  @override
  Future<AppDocument> upload({
    required String fileName,
    required DocumentKind kind,
    Uint8List? bytes,
    String? filePath,
    String? caseId,
    String? patientId,
    String? hospitalId,
    ProgressCallback? onProgress,
  }) async {
    uploaded.add(fileName);
    return AppDocument.fromJson({
      'id': 'doc-${uploaded.length}',
      'kind': kind.json,
      'file_name': fileName,
      'status': 'uploaded',
    });
  }
}

class FakePageSource implements ReportPageSource {
  @override
  Future<ReportPage?> takePhoto() async => ReportPage(name: 'camera.jpg', bytes: Uint8List(4));

  @override
  Future<List<ReportPage>> pickPhotos({int? limit}) async => [
    ReportPage(name: 'p1.jpg', bytes: Uint8List(4)),
    ReportPage(name: 'p2.jpg', bytes: Uint8List(4)),
  ];

  @override
  Future<ReportPage?> pickPdf() async => ReportPage(name: 'report.pdf', bytes: Uint8List(4));
}

Future<void> _pump(WidgetTester tester, Widget child, List<dynamic> overrides) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [...overrides.cast()],
      child: MaterialApp(theme: AppTheme.dark(), home: child),
    ),
  );
}

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  group('models', () {
    test('parse snake_case JSON and report patient edits', () {
      final a = DocumentAnalysis.fromJson({
        'id': 'x',
        'status': 'completed',
        'review_status': 'confirmed',
        'doc_type': 'lab_report',
        'lab_values': [
          {'test': 'Hb', 'value': 9.1, 'unit': 'g/dL', 'reference_range': '12-16', 'flag': 'low'},
        ],
        'ai_output': {'doc_type': 'lab_report', 'summary_patient': 'AI text', 'lab_values': []},
        'confirmed_data': {'doc_type': 'lab_report', 'summary_patient': 'My text', 'lab_values': []},
        'quality': {'legible': false, 'issues': ['blurry'], 'pages_analyzed': 2},
      });
      expect(a.isConfirmed, isTrue);
      expect(a.data.labValues.single.value, '9.1');
      expect(a.data.labValues.single.flag, LabFlag.low);
      expect(a.effective.summaryPatient, 'My text');
      expect(a.editedKeys, {'summary_patient'});
      expect(a.quality.issues, ['blurry']);
    });

    test('cleaned() drops blank rows', () {
      const d = ReportData(keyFindings: [KeyFinding(finding: '  ')], diagnoses: ['', ' Diabetes ']);
      final c = d.cleaned();
      expect(c.keyFindings, isEmpty);
      expect(c.diagnoses, ['Diabetes']);
      expect(c.toJson()['diagnoses_mentioned'], ['Diabetes']);
    });
  });

  testWidgets('review form: edit a finding, remove a lab row, confirm sends the edited data', (tester) async {
    final repo = FakeAnalysisRepo([_analysis()]);
    DocumentAnalysis? finished;
    await _pump(
      tester,
      Scaffold(body: ReportAnalysisView(analysisId: 'an1', onFinished: (a) => finished = a)),
      [documentAnalysisRepositoryProvider.overrideWithValue(repo)],
    );
    await tester.pumpAndSettle();

    expect(find.text('Critical values in this report'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('finding-0')), 'Fasting glucose 180');
    await tester.ensureVisible(find.byTooltip('Remove lab value 2'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Remove lab value 2'));
    await tester.pump();
    expect(find.text('Critical values in this report'), findsNothing);
    expect(find.text('Edited'), findsWidgets);

    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();

    expect(repo.confirmed, isNotNull);
    expect(repo.confirmed!.keyFindings.single.finding, 'Fasting glucose 180');
    expect(repo.confirmed!.labValues.map((v) => v.test), ['Glucose']);
    expect(repo.confirmed!.facilityName, 'City Lab');
    expect(finished?.isConfirmed, isTrue);
    expect(find.text('Confirmed'), findsOneWidget);
    expect(find.byType(ReportAnalysisCard), findsOneWidget);
  });

  testWidgets('polls while the AI is reading, then shows the review form', (tester) async {
    final repo = FakeAnalysisRepo([
      _analysis(status: AnalysisStatus.queued),
      _analysis(status: AnalysisStatus.processing),
      _analysis(),
    ]);
    await _pump(
      tester,
      const Scaffold(body: ReportAnalysisView(analysisId: 'an1', pollInterval: Duration(milliseconds: 10))),
      [documentAnalysisRepositoryProvider.overrideWithValue(repo)],
    );
    await tester.pump();
    expect(find.text('Reading your report…'), findsOneWidget);
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    await tester.pump();
    expect(find.text('Confirm'), findsOneWidget);
    expect(repo.gets, greaterThanOrEqualTo(3));
  });

  testWidgets('capture: gallery pages are uploaded in order, analysed and confirmed', (tester) async {
    final analyses = FakeAnalysisRepo([_analysis()]);
    final docs = FakeDocumentRepo();
    ReportCaptureResult? result;
    await _pump(
      tester,
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async {
                result = await Navigator.of(
                  context,
                ).push(MaterialPageRoute<ReportCaptureResult>(builder: (_) => const ReportCaptureScreen()));
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
      [
        documentAnalysisRepositoryProvider.overrideWithValue(analyses),
        documentRepositoryProvider.overrideWithValue(docs),
        reportPageSourceProvider.overrideWithValue(FakePageSource()),
      ],
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Choose from gallery'));
    await tester.pumpAndSettle();
    expect(find.text('Pages (2/10)'), findsOneWidget);
    await tester.tap(find.text('Upload PDF'));
    await tester.pumpAndSettle();
    expect(find.text('Pages (3/10)'), findsOneWidget);
    await tester.tap(find.byTooltip('Remove page 3'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Read my report with AI').last);
    await tester.pumpAndSettle();
    expect(docs.uploaded, ['p1.jpg', 'p2.jpg']);
    expect(analyses.createdWith, ['doc-1', 'doc-2']);
    expect(find.text('Review your report'), findsOneWidget);

    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(result, isNotNull);
    expect(result!.confirmed, isTrue);
    expect(result!.documents.map((d) => d.id), ['doc-1', 'doc-2']);
  });
}
