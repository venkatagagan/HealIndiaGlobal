import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/features/aftercare/screens/aftercare_screen.dart';
import 'package:heal_india_global/features/aftercare/screens/checkin_form_screen.dart';
import 'package:heal_india_global/features/hospital_portal/widgets/checkins_section.dart';
import 'package:heal_india_global/features/messages/logic/notification_routes.dart';
import 'package:heal_india_global/features/reviews/screens/my_reviews_screen.dart';
import 'package:heal_india_global/features/reviews/screens/review_form_screen.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import 'phase1_helpers.dart';

final _eligible = [
  {
    'booking_id': 'b1',
    'booking_number': 'HIG-B-1',
    'hospital': {'id': 'h1', 'slug': 'apollo', 'name': 'Apollo Chennai'},
    'doctor': {'id': 'd1', 'name': 'Dr. Rao'},
    'procedure': {'id': 'p1', 'slug': 'knee', 'name': 'Knee replacement'},
  },
];

Map<String, Object?> _review(String id, String status, {bool editable = false, String? reason}) => {
  'id': id,
  'rating': 4,
  'title': 'Great team',
  'body': 'Kind nurses.',
  'created_at': '2026-11-01T10:00:00Z',
  'hospital_id': 'h1',
  'hospital_name': 'Apollo Chennai',
  'status': status,
  'verified_patient': true,
  'treatment_name': 'Knee replacement',
  'editable': editable,
  'moderation_reason': ?reason,
};

Map<String, Object?> _checkin(String id, int day, {bool due = true, List<String> flags = const [], String? submitted}) => {
  'id': id,
  'case_id': 'c1',
  'case_number': 'HIG-C-1',
  'day': day,
  'due_at': '2026-11-10T04:30:00Z',
  'is_due': due,
  'submitted_at': ?submitted,
  'answers': submitted == null ? <String, Object?>{} : {'pain': 9, 'medication_adherence': 'some'},
  'red_flags': flags,
};

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  testWidgets('rate your hospital: stars, text, doctor; sends POST /reviews', (tester) async {
    final adapter = RoutedAdapter({
      'GET /me/reviews/eligible': (_) => _eligible,
      'POST /reviews': (_) => (201, _review('r1', 'pending', editable: true)),
    });
    await pumpWithApi(
      tester,
      path: '/reviews/write',
      initialLocation: '/reviews/write?booking=b1',
      screen: (s) => ReviewFormScreen(bookingId: s.uri.queryParameters['booking']),
      adapter: adapter,
    );
    await tester.pumpAndSettle();
    expect(find.text('Apollo Chennai'), findsOneWidget);
    expect(find.text('This review is also about Dr. Rao'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('review-submit')));
    await tester.pumpAndSettle();
    expect(find.text('Choose 1 to 5 stars.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('review-star-5')));
    await tester.enterText(find.byKey(const ValueKey('review-title')), 'Excellent');
    await tester.enterText(find.byKey(const ValueKey('review-body')), 'Smooth from visa to discharge.');
    await tester.tap(find.byKey(const ValueKey('review-submit')));
    await tester.pumpAndSettle();
    final body = bodyOf(adapter.last('POST', '/reviews'));
    expect(body, {
      'hospital_id': 'h1',
      'booking_id': 'b1',
      'doctor_id': 'd1',
      'rating': 5,
      'title': 'Excellent',
      'body': 'Smooth from visa to discharge.',
    });
  });

  testWidgets('my reviews: status, hidden reason, edit / delete only while pending', (tester) async {
    final adapter = RoutedAdapter({
      'GET /me/reviews/eligible': (_) => const [],
      'GET /me/reviews': (_) => [
        _review('r1', 'pending', editable: true),
        _review('r2', 'published'),
        _review('r3', 'hidden', reason: 'Contains a phone number'),
      ],
      'DELETE /me/reviews/r1': (_) => (204, null),
    });
    await pumpWithApi(tester, path: '/reviews', screen: (_) => const MyReviewsScreen(), adapter: adapter, logicalSize: const Size(420, 1600));
    await tester.pumpAndSettle();
    expect(find.text('Waiting for check'), findsOneWidget);
    expect(find.text('Published'), findsOneWidget);
    expect(find.text('Not published'), findsOneWidget);
    expect(find.text('Reason: Contains a phone number'), findsOneWidget);
    expect(find.text('Verified patient · Knee replacement'), findsNWidgets(3));
    expect(find.byKey(const ValueKey('review-edit-r1')), findsOneWidget);
    expect(find.byKey(const ValueKey('review-edit-r2')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('review-delete-r1')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(adapter.last('DELETE', '/me/reviews/r1'), isNotNull);
  });

  test('booking.completed opens the review form', () {
    final n = AppNotification.fromJson({
      'id': 'n1',
      'kind': 'booking.completed',
      'title': 'Treatment completed',
      'data': {'booking_id': 'b1', 'case_id': 'c1', 'link': '/bookings/b1'},
    });
    expect(notificationTarget(n), '/reviews/write?booking=b1');
    expect(pushLinkRoute('/bookings/b1', UserRole.patient, kind: 'booking.completed'), '/reviews/write?booking=b1');
    expect(pushLinkRoute('/bookings/b1', UserRole.patient), '/trips');
  });

  testWidgets('aftercare: join a follow-up call, request another, answer a due check-in', (tester) async {
    final opened = <Uri>[];
    final adapter = RoutedAdapter({
      'GET /me/aftercare': (_) => {
        'cases': [
          {
            'case_id': 'c1',
            'case_number': 'HIG-C-1',
            'hospital': {'id': 'h1', 'slug': 'apollo', 'name': 'Apollo Chennai'},
            'doctor': {'id': 'd1', 'full_name': 'Dr. Rao'},
            'discharged_on': '2026-11-01',
            'aftercare_until': '2030-11-01',
          },
        ],
        'followups': [
          {
            'id': 'f1',
            'case_id': 'c1',
            'kind': 'followup',
            'followup_day': 7,
            'scheduled_at': '2026-11-20T05:30:00Z',
            'duration_min': 20,
            'mode': 'video',
            'status': 'scheduled',
            'meeting_url': 'https://meet.jit.si/hig-abc',
            'fee_minor': 0,
            'currency': 'INR',
            'doctor': {'id': 'd1', 'full_name': 'Dr. Rao'},
          },
        ],
        'checkins_due': [_checkin('k1', 7)],
        'upcoming_checkins': [_checkin('k2', 14, due: false)],
      },
      'POST /consultations': (_) => (201, {'id': 'f2', 'case_id': 'c1', 'status': 'requested', 'mode': 'video'}),
    });
    await pumpWithApi(
      tester,
      path: '/aftercare',
      screen: (_) => const AftercareScreen(),
      adapter: adapter,
      logicalSize: const Size(420, 1600),
      overrides: [
        meetingLauncherProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
      ],
    );
    await tester.pumpAndSettle();
    expect(find.text('Day 7 follow-up'), findsOneWidget);
    expect(find.text('Day 7 check-in'), findsOneWidget);
    expect(find.text('Day 14 check-in'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('followup-join-f1')));
    await tester.pump();
    expect(opened.single.toString(), 'https://meet.jit.si/hig-abc');

    await tester.tap(find.byKey(const ValueKey('aftercare-request-c1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('followup-send')));
    await tester.pumpAndSettle();
    final body = bodyOf(adapter.last('POST', '/consultations'));
    expect(body['case_id'], 'c1');
    expect(body['kind'], 'followup');
    expect(body['doctor_id'], 'd1');
  });

  testWidgets('check-in with red flags shows the urgent message and offers SOS', (tester) async {
    var sosCalls = 0;
    final adapter = RoutedAdapter({
      'POST /aftercare/checkins/k1': (_) =>
          _checkin('k1', 7, submitted: '2026-11-18T10:00:00Z', flags: ['fever', 'severe_pain']),
      'GET /me/aftercare': (_) => {'cases': [], 'followups': [], 'checkins_due': [], 'upcoming_checkins': []},
    });
    await pumpWithApi(
      tester,
      path: '/x',
      // The form pops itself when done, so it is pushed above a base page (as from the aftercare screen).
      screen: (_) => Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => CheckinFormScreen(checkin: AftercareCheckin.fromJson(_checkin('k1', 7))),
              ),
            ),
            child: const Text('open'),
          ),
        ),
      ),
      adapter: adapter,
      logicalSize: const Size(420, 1400),
      overrides: [
        aftercareSosProvider.overrideWithValue((context, ref, caseId) async => sosCalls++),
      ],
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('checkin-fever')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('checkin-submit')));
    await tester.pumpAndSettle();

    final body = bodyOf(adapter.last('POST', '/aftercare/checkins/k1'));
    expect(body['fever'], isTrue);
    expect(body['medication_adherence'], 'all');
    expect(find.byKey(const ValueKey('checkin-urgent')), findsOneWidget);
    expect(find.text('• Fever'), findsOneWidget);
    expect(find.text('• Severe pain'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('checkin-sos')));
    await tester.pumpAndSettle();
    expect(sosCalls, 1);
  });

  testWidgets('hospital sees check-ins with red flags first', (tester) async {
    final adapter = RoutedAdapter({
      'GET /aftercare/checkins': (_) => [
        _checkin('k1', 1, submitted: '2026-11-02T10:00:00Z'),
        _checkin('k3', 7, submitted: '2026-11-08T10:00:00Z', flags: ['wound_concerns']),
      ],
    });
    await pumpWithApi(
      tester,
      path: '/x',
      screen: (_) => const Scaffold(body: SingleChildScrollView(child: HospitalCheckinsSection(caseId: 'c1'))),
      adapter: adapter,
    );
    await tester.pumpAndSettle();
    expect(find.text('1 check-in with red flags'), findsOneWidget);
    expect(find.text('Wound problem'), findsOneWidget);
    final first = tester.getTopLeft(find.byKey(const ValueKey('checkin-k3')));
    final second = tester.getTopLeft(find.byKey(const ValueKey('checkin-k1')));
    expect(first.dy, lessThan(second.dy));
  });
}
