// CG-16: users can report chat messages and AI results (`POST /reports`).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/repositories/messaging_repository.dart';
import 'package:heal_india_global/core/repositories/report_repository.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/core/widgets/report_sheet.dart';
import 'package:heal_india_global/features/messages/screens/chat_screen.dart';

import '../trips/journey_test_helpers.dart';
import 'compliance_fakes.dart';

class _FakeMessaging extends MessagingRepository {
  _FakeMessaging(this.items) : super(ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://test.invalid/api/v1'));

  final List<ChatMessage> items;

  @override
  Future<List<Conversation>> conversations() async => const [];

  @override
  Future<List<ChatMessage>> messages(String conversationId, {String? before, int limit = 50}) async => items;

  @override
  Future<void> markConversationRead(String conversationId) async {}
}

ChatMessage _msg(String id, String senderId, String body, {bool hidden = false}) => ChatMessage.fromJson({
  'id': id,
  'conversation_id': 'cv1',
  'sender': {'id': senderId, 'full_name': senderId == testPatient.id ? 'Amina Yusuf' : 'Care Team', 'role': 'support'},
  'body': body,
  'created_at': '2026-11-09T10:00:00Z',
  'hidden': hidden,
});

void main() {
  test('report repository posts target, reason and a trimmed note', () async {
    final adapter = RecordingAdapter((_) => (201, {'id': 'r1', 'status': 'open'}));
    final repo = ReportRepository(await fakeApi(adapter));

    await repo.report(
      type: ReportTargetType.screeningResult,
      targetId: 's1',
      reason: ReportReason.inaccurate,
      note: '  wrong specialty  ',
    );
    await repo.report(type: ReportTargetType.message, targetId: 'm1', reason: ReportReason.spam, note: '   ');

    expect(adapter.requests.map((r) => '${r.method} ${r.path}'), ['POST /reports', 'POST /reports']);
    expect(adapter.requests[0].data, {
      'target_type': 'screening_result',
      'target_id': 's1',
      'reason': 'inaccurate',
      'note': 'wrong specialty',
    });
    expect(adapter.requests[1].data, {'target_type': 'message', 'target_id': 'm1', 'reason': 'spam'});
  });

  test('MessageOut parsing tolerates a missing or odd `hidden` field', () {
    expect(_msg('m1', 'x', 'hi', hidden: true).hidden, isTrue);
    expect(ChatMessage.fromJson({'id': 'm2', 'body': 'hi'}).hidden, isFalse);
    expect(ChatMessage.fromJson({'id': 'm3', 'hidden': 'yes'}).hidden, isFalse);
  });

  testWidgets('report sheet needs a reason, posts the report and thanks the user', (tester) async {
    AppTextStyles.useGoogleFonts = false;
    final adapter = RecordingAdapter((_) => (201, {'id': 'r1', 'status': 'open'}));
    final api = await fakeApi(adapter);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [reportRepositoryProvider.overrideWithValue(ReportRepository(api))],
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showReportSheet(context, type: ReportTargetType.documentAnalysis, targetId: 'da1'),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Report this result'), findsOneWidget);
    // AI results offer Inaccurate / Inappropriate / Other only.
    expect(find.text('Inaccurate'), findsOneWidget);
    expect(find.text('Spam'), findsNothing);
    final send = find.byKey(const Key('report-send'));
    expect(
      tester.widget<FilledButton>(find.descendant(of: send, matching: find.byType(FilledButton))).onPressed,
      isNull,
    );

    await tester.tap(find.byKey(const Key('report-reason-inaccurate')));
    await tester.enterText(find.byKey(const Key('report-note')), 'The values are from another report');
    await tester.pump();
    await tester.tap(send);
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pumpAndSettle();

    expect(adapter.requests.single.data, {
      'target_type': 'document_analysis',
      'target_id': 'da1',
      'reason': 'inaccurate',
      'note': 'The values are from another report',
    });
    expect(find.text('Report this result'), findsNothing);
    expect(find.text(kReportThanks), findsOneWidget);
  });

  testWidgets('long-press offers Report on other people\'s messages only; hidden own messages are labelled', (
    tester,
  ) async {
    AppTextStyles.useGoogleFonts = false;
    final adapter = RecordingAdapter((_) => (201, {'id': 'r1', 'status': 'open'}));
    final api = await fakeApi(adapter);
    final overrides = await journeyBaseOverrides();
    await tester.pumpWidget(
      journeyApp(
        overrides: [
          ...overrides,
          messagingRepositoryProvider.overrideWithValue(
            _FakeMessaging([
              _msg('m-other', 'u-support', 'Please send your passport'),
              _msg('m-mine', testPatient.id, 'Here it is', hidden: true),
            ]),
          ),
          reportRepositoryProvider.overrideWithValue(ReportRepository(api)),
        ],
        routes: [
          GoRoute(
            path: '/messages/:id',
            builder: (_, s) => ChatScreen(conversationId: s.pathParameters['id']!),
          ),
        ],
        initialLocation: '/messages/cv1',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hidden by moderators'), findsOneWidget);
    expect(find.byKey(const ValueKey('message-m-mine')), findsNothing, reason: 'own messages cannot be reported');

    await tester.longPress(find.text('Please send your passport'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('message-action-report')));
    await tester.pumpAndSettle();
    expect(find.text('Report this message'), findsOneWidget);
    expect(find.text('Abusive or harassing'), findsOneWidget);

    await tester.tap(find.byKey(const Key('report-reason-abusive')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('report-send')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pumpAndSettle();

    expect(adapter.requests.single.data, {'target_type': 'message', 'target_id': 'm-other', 'reason': 'abusive'});
    expect(find.text(kReportThanks), findsOneWidget);
  });
}
