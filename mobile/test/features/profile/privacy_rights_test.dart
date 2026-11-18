// Privacy parity: data-rights requests, nominee, sharing switches and the Grievance Officer / DPO card.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/features/profile/widgets/privacy_group.dart';

import '../agent_portal/portal_test_helpers.dart';
import '../onboarding/fl_harness.dart';

Map<String, Object?> _request({String id = 'r1', String status = 'received', String? resolution}) => {
  'id': id,
  'reference': 'DRR-2026-0001',
  'kind': 'correction',
  'status': status,
  'channel': 'app',
  'details': 'My date of birth is wrong in my profile',
  'on_behalf_of': null,
  'resolution': resolution,
  'due_at': '2026-12-18T00:00:00Z',
  'overdue': false,
  'acknowledged_at': null,
  'closed_at': null,
  'created_at': '2026-11-18T10:00:00Z',
  'updated_at': '2026-11-18T10:00:00Z',
};

RoutedAdapter _backend({List<Map<String, Object?>> consents = const [], Map<String, Object?>? nominee}) =>
    RoutedAdapter({
      'GET /privacy/requests': (_) => [_request()],
      'GET /privacy/requests/r1': (_) => _request(status: 'completed', resolution: 'Corrected on 20 Nov.'),
      'POST /privacy/requests': (r) => (201, {..._request(id: 'r2'), 'kind': bodyOf(r)['kind']}),
      'GET /privacy/nominee': (_) => nominee,
      'PUT /privacy/nominee': (r) => {
        ...bodyOf(r),
        'created_at': '2026-11-18T10:00:00Z',
        'updated_at': '2026-11-18T10:00:00Z',
      },
      'DELETE /privacy/nominee': (_) => (204, null),
      'GET /auth/consents': (_) => consents,
      'POST /auth/consents': (r) => (201, {...bodyOf(r), 'id': 'c9', 'created_at': '2026-11-18T11:00:00Z'}),
      'GET /site-config/privacy-contact': (_) => {
        'grievance_officer': {'name': 'Meera Iyer', 'email': 'grievance@example.org', 'phone': '+91 44 1234 5678'},
        'data_protection_officer': {'name': null, 'email': null, 'phone': null},
        'postal_address': '12 Anna Salai, Chennai 600002',
        'response_days': 30,
        'request_kinds': ['access'],
        'data_protection_board_url': 'https://www.dpb.gov.in',
      },
    });

Future<RoutedAdapter> _pumpGroup(WidgetTester tester, RoutedAdapter adapter, {bool full = true}) async {
  final api = ApiClient(
    tokens: InMemoryTokenStorage(),
    baseUrl: 'http://privacy.test/api/v1',
    httpClientAdapter: adapter,
  );
  await pumpScreen(
    tester,
    path: '/profile',
    screen: (_) => Scaffold(
      body: ListView(children: [PrivacyGroup(showAccessLog: full)]),
    ),
    auth: AuthState.fromUser(patientUser),
    overrides: [apiClientProvider.overrideWithValue(api), ...quietPhase1Overrides()],
  );
  await tester.pumpAndSettle();
  return adapter;
}

void main() {
  test('consents keep their scope; only account-wide rows drive the sharing switches', () {
    final scoped = Consent.fromJson({
      'kind': 'share_with_hospitals',
      'version': '1.0',
      'granted': false,
      'hospital_id': 'h1',
      'created_at': '2026-11-01T00:00:00Z',
    });
    expect(scoped.hospitalId, 'h1');
    expect(scoped.isAccountWide, isFalse);
    expect(Consent.fromJson({'kind': 'share_with_agent', 'granted': true}).isAccountWide, isTrue);
  });

  testWidgets('data-rights requests: list, detail with our answer, and a new request', (tester) async {
    final adapter = await _pumpGroup(tester, _backend());
    await tester.scrollUntilVisible(find.byKey(const Key('profile-privacy-requests')), 200);
    await tester.tap(find.byKey(const Key('profile-privacy-requests')));
    await tester.pumpAndSettle();
    expect(find.text('Correct my data'), findsOneWidget);
    expect(find.text('DRR-2026-0001'), findsOneWidget);
    expect(find.text('Received'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('privacy-request-r1')));
    await tester.pumpAndSettle();
    expect(find.text('Corrected on 20 Nov.'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('privacy-request-new')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('privacy-request-details')), 'short');
    await tester.tap(find.byKey(const ValueKey('privacy-request-submit')));
    await tester.pumpAndSettle();
    expect(find.text('Please write at least 10 characters.'), findsOneWidget);
    expect(adapter.last('POST', '/privacy/requests'), isNull);

    await tester.tap(find.byKey(const ValueKey('privacy-request-kind')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete my data').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('privacy-request-details')), 'Please delete my old screening.');
    await tester.tap(find.byKey(const ValueKey('privacy-request-submit')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/privacy/requests')), {
      'kind': 'erasure',
      'details': 'Please delete my old screening.',
      'channel': 'app',
    });
    expect(find.textContaining('Request DRR-2026-0001 sent'), findsOneWidget);
  });

  testWidgets('nominee: needs an email or phone, saves and removes', (tester) async {
    final adapter = await _pumpGroup(
      tester,
      _backend(
        nominee: {
          'full_name': 'Omar Yusuf',
          'relationship': 'Son',
          'email': null,
          'phone': '+234 801 000 0000',
          'created_at': '2026-11-01T10:00:00Z',
          'updated_at': '2026-11-01T10:00:00Z',
        },
      ),
    );
    expect(find.text('Omar Yusuf (Son)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('profile-nominee')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const ValueKey('nominee-phone')), '');
    await tester.tap(find.byKey(const ValueKey('nominee-save')));
    await tester.pumpAndSettle();
    expect(find.text('Give an email address or a phone number.'), findsNWidgets(2));

    await tester.enterText(find.byKey(const ValueKey('nominee-email')), 'omar@example.org');
    await tester.tap(find.byKey(const ValueKey('nominee-save')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('PUT', '/privacy/nominee')), {
      'full_name': 'Omar Yusuf',
      'relationship': 'Son',
      'email': 'omar@example.org',
    });
    expect(find.text('Nominee saved'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const ValueKey('nominee-remove')));
    await tester.tap(find.byKey(const ValueKey('nominee-remove')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nominee-remove-confirm')));
    await tester.pumpAndSettle();
    expect(adapter.last('DELETE', '/privacy/nominee'), isNotNull);
  });

  testWidgets('sharing switches: withdraw hospital sharing after confirming, grant agent sharing', (tester) async {
    final adapter = await _pumpGroup(
      tester,
      _backend(
        consents: [
          {
            'id': 'c1',
            'kind': 'share_with_agent',
            'version': '1.0',
            'granted': false,
            'case_id': null,
            'hospital_id': null,
            'created_at': '2026-11-01T00:00:00Z',
          },
        ],
      ),
    );
    await tester.scrollUntilVisible(find.byKey(const Key('privacy-switch-agent')), 200);
    expect(tester.widget<Switch>(find.byKey(const Key('privacy-switch-hospitals'))).value, isTrue);
    expect(tester.widget<Switch>(find.byKey(const Key('privacy-switch-agent'))).value, isFalse);

    await tester.tap(find.byKey(const Key('privacy-switch-hospitals')));
    await tester.pumpAndSettle();
    expect(find.text('Stop sharing with hospitals?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('privacy-share-withdraw-confirm')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/auth/consents')), {
      'kind': 'share_with_hospitals',
      'version': '1.0',
      'granted': false,
    });

    await tester.tap(find.byKey(const Key('privacy-switch-agent')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/auth/consents')), {
      'kind': 'share_with_agent',
      'version': '1.0',
      'granted': true,
    });
  });

  testWidgets('Grievance Officer / DPO card is shown to guests too', (tester) async {
    await _pumpGroup(tester, _backend(), full: false);
    expect(find.byKey(const Key('profile-privacy-requests')), findsNothing);
    await tester.tap(find.byKey(const Key('profile-privacy-contact')));
    await tester.pumpAndSettle();
    expect(find.text('Meera Iyer'), findsOneWidget);
    expect(find.text('grievance@example.org'), findsOneWidget);
    expect(find.text('Contact details not published yet'), findsOneWidget);
    expect(find.text('We answer data-rights requests and grievances within 30 days.'), findsOneWidget);
  });
}
