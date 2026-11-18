// Pre-travel video tele-consultation: booking, payment of the fee, list and detail (join / cancel).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/config/app_preferences.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_client.dart';
import 'package:heal_india_global/core/router/routes.dart';
import 'package:heal_india_global/core/services/biometric_service.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/core/utils/dates.dart';
import 'package:heal_india_global/features/consultations/data/consultation_providers.dart';
import 'package:heal_india_global/features/consultations/screens/consultation_book_screen.dart';
import 'package:heal_india_global/features/consultations/screens/consultations_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../agent_portal/portal_test_helpers.dart';

class _Bio extends BiometricService {
  @override
  Future<bool> confirm({String? reason}) async => true;
}

const _patient = User(id: 'u-p', role: UserRole.patient, status: UserStatus.active, fullName: 'Amina Yusuf');

Map<String, Object?> _doctor(String id, {required bool tele, int fee = 150000}) => {
  'id': id,
  'slug': id,
  'full_name': id == 'd-1' ? 'Dr. Meena Rao' : 'Dr. Arjun Das',
  'teleconsult_available': tele,
  'consultation_fee_minor': fee,
  'currency': 'INR',
  'hospital': {'id': 'h-1', 'slug': 'apollo', 'name': 'Apollo Chennai'},
};

Map<String, Object?> _consultation({
  String id = 'k1',
  String status = 'requested',
  String? scheduledAt,
  String? meetingUrl,
  int fee = 150000,
}) => {
  'id': id,
  'case_id': 'c-9',
  'case_number': 'HIG-C-2026-000009',
  'doctor': {'id': 'd-1', 'full_name': 'Dr. Meena Rao'},
  'hospital': {'id': 'h-1', 'name': 'Apollo Chennai'},
  'scheduled_at': scheduledAt,
  'duration_min': 30,
  'mode': 'video',
  'meeting_url': meetingUrl,
  'status': status,
  'kind': 'standard',
  'due_at': '2099-01-15T04:30:00Z',
  'fee_minor': fee,
  'currency': 'INR',
  'notes': 'Preferred time: 2099-01-15T04:30:00+00:00\nKnee pain for a year',
  'created_at': '2026-11-18T10:00:00Z',
  'updated_at': '2026-11-18T10:00:00Z',
};

Map<String, Object?> _order(String status) => {
  'id': 'o-1',
  'order_number': 'HIG-O-1',
  'purpose': 'consultation_fee',
  'status': status,
  'gateway': 'mock',
  'amount_minor': 150000,
  'currency': 'INR',
  'base_amount_minor': 150000,
  'base_currency': 'INR',
  'fx_rate': '1',
  'booking_id': null,
  'installment_id': null,
  'consultation_id': 'k1',
  'created_at': '2026-11-18T10:00:00Z',
};

Future<void> _pump(
  WidgetTester tester, {
  required RoutedAdapter adapter,
  required String initialLocation,
  List<Override> overrides = const [],
}) async {
  AppTextStyles.useGoogleFonts = false;
  tester.view
    ..physicalSize = const Size(1200, 2800)
    ..devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final api = ApiClient(tokens: InMemoryTokenStorage(), baseUrl: 'http://c.test/api/v1', httpClientAdapter: adapter);
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final router = GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        path: '/consultations',
        builder: (_, _) => const ConsultationsScreen(),
        routes: [
          GoRoute(
            path: 'book',
            builder: (_, s) => ConsultationBookScreen(
              hospitalId: s.uri.queryParameters['hospital']!,
              doctorId: s.uri.queryParameters['doctor'],
            ),
          ),
          GoRoute(
            path: ':id',
            builder: (_, s) => ConsultationDetailScreen(
              consultationId: s.pathParameters['id']!,
              openPayment: s.uri.queryParameters['pay'] == '1',
            ),
          ),
        ],
      ),
      GoRoute(path: '/:a', builder: (_, s) => Text('route:${s.uri}')),
      GoRoute(path: '/:a/:b', builder: (_, s) => Text('route:${s.uri}')),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
        apiClientProvider.overrideWithValue(api),
        authControllerProvider.overrideWith(() => PortalFakeAuth(_patient)),
        biometricServiceProvider.overrideWithValue(_Bio()),
        ...overrides,
      ],
      child: MaterialApp.router(theme: AppTheme.dark(), routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tapVisible(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(f, 300, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  test('slot times are IST hours sent as UTC', () {
    expect(consultationSlotUtc(DateTime(2099, 1, 15), 10), DateTime.utc(2099, 1, 15, 4, 30));
    expect(Routes.consultationBook(hospitalId: 'h-1', doctorId: 'd-1'), '/consultations/book?hospital=h-1&doctor=d-1');
    expect(Routes.consultationDetail('k1', pay: true), '/consultations/k1?pay=1');
  });

  testWidgets('book: tele-consult doctors only, slot, consent, new case, consultation, then pay the fee', (
    tester,
  ) async {
    var paid = false;
    final adapter = RoutedAdapter({
      'GET /doctors': (_) => page([_doctor('d-1', tele: true), _doctor('d-2', tele: false)]),
      'GET /hospitals/h-1': (_) => {'id': 'h-1', 'slug': 'apollo', 'name': 'Apollo Chennai'},
      'GET /doctors/d-1/availability': (_) => <Object?>[],
      'GET /cases': (_) => page([]),
      'GET /documents': (_) => <Object?>[],
      'POST /auth/consents': (_) => (201, {'id': 'cn', 'kind': 'share_with_hospitals', 'granted': true}),
      'POST /cases': (_) => (201, caseJson(id: 'c-9', status: 'enquiry')),
      'POST /consultations': (_) => (201, _consultation()),
      'GET /consultations/k1': (_) => _consultation(),
      'GET /payments/orders': (_) => page(paid ? [_order('paid')] : []),
      'POST /payments/orders': (_) => (201, {'order': _order('created'), 'gateway': 'mock'}),
      'POST /payments/mock/o-1/complete': (_) {
        paid = true;
        return _order('paid');
      },
    });
    await _pump(
      tester,
      adapter: adapter,
      initialLocation: Routes.consultationBook(hospitalId: 'h-1', doctorId: 'd-1'),
    );

    expect(find.text('Book a video consultation'), findsOneWidget);
    expect(find.byKey(const ValueKey('consult-doctor-d-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('consult-doctor-d-2')), findsNothing, reason: 'no tele-consultations');

    // Submitting without a slot explains what is missing.
    await _tapVisible(tester, find.byKey(const ValueKey('consult-submit')));
    expect(find.text('Choose a day and a time.'), findsOneWidget);

    // Next month, the 15th, 10:00 IST.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('calendar-next')),
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('calendar-next')));
    await tester.pumpAndSettle();
    final now = DateTime.now();
    final day = DateTime(now.year, now.month + 1, 15);
    await tester.tap(find.byKey(ValueKey('day-${Dates.api(day)}')));
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.byKey(const ValueKey('consult-time-10')));
    await tester.enterText(find.byKey(const ValueKey('consult-notes')), 'Knee pain for a year');
    await _tapVisible(tester, find.byKey(const ValueKey('consult-submit')));
    expect(find.text('Please agree to share your information with the hospital.'), findsOneWidget);

    await _tapVisible(tester, find.byKey(const ValueKey('consult-consent')));
    await _tapVisible(tester, find.byKey(const ValueKey('consult-submit')));

    final created = bodyOf(adapter.last('POST', '/cases'));
    expect(created['hospital_id'], 'h-1');
    expect(created['doctor_id'], 'd-1');
    expect(created['consent_share'], isTrue);
    expect(bodyOf(adapter.last('POST', '/consultations')), {
      'case_id': 'c-9',
      'kind': 'standard',
      'doctor_id': 'd-1',
      'mode': 'video',
      'preferred_at': consultationSlotUtc(day, 10).toIso8601String(),
      'notes': 'Knee pain for a year',
    });

    // The detail page opens with the payment sheet (fee due).
    expect(find.text('Pay consultation fee'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('consult-method-mock')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('consult-pay-confirm')));
    // The pay button spins while the test-gateway dialog is open, so pump instead of settling.
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    await tester.tap(find.byKey(const ValueKey('consult-mock-success')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('POST', '/payments/orders')), {
      'consultation_id': 'k1',
      'purpose': 'consultation_fee',
      'gateway': 'mock',
      'currency': 'USD',
    });
    expect(find.text('Payment received. Thank you.'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
    expect(find.textContaining('remind you 24 hours and 1 hour'), findsOneWidget);
  });

  testWidgets('book: an open case at the hospital is reused and API errors are translated', (tester) async {
    final adapter = RoutedAdapter({
      'GET /doctors': (_) => page([_doctor('d-1', tele: true)]),
      'GET /hospitals/h-1': (_) => {'id': 'h-1', 'slug': 'apollo', 'name': 'Apollo Chennai'},
      'GET /doctors/d-1/availability': (_) => <Object?>[],
      'GET /cases': (_) => page([caseJson(id: 'c-open', status: 'quoted')]),
      'POST /auth/consents': (_) => (201, {'id': 'cn', 'kind': 'share_with_hospitals', 'granted': true}),
      'POST /consultations': (_) => (
        409,
        {
          'error': {'code': 'consultation_exists', 'message': 'A consultation with this doctor is already open'},
        },
      ),
    });
    await _pump(
      tester,
      adapter: adapter,
      initialLocation: Routes.consultationBook(hospitalId: 'h-1'),
    );
    expect(find.textContaining('are added to your case'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('calendar-next')));
    await tester.pumpAndSettle();
    final now = DateTime.now();
    await tester.tap(find.byKey(ValueKey('day-${Dates.api(DateTime(now.year, now.month + 1, 10))}')));
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.byKey(const ValueKey('consult-time-15')));
    await _tapVisible(tester, find.byKey(const ValueKey('consult-consent')));
    await _tapVisible(tester, find.byKey(const ValueKey('consult-submit')));

    expect(adapter.last('POST', '/cases'), isNull, reason: 'the open case is reused');
    expect(bodyOf(adapter.last('POST', '/consultations'))['case_id'], 'c-open');
    expect(
      find.text('You already have an open consultation with this doctor. You can find it under My consultations.'),
      findsOneWidget,
    );
  });

  testWidgets('detail: scheduled call can be joined and cancelled; list shows it', (tester) async {
    final opened = <Uri>[];
    var status = 'scheduled';
    final adapter = RoutedAdapter({
      'GET /consultations': (_) => page([
        _consultation(status: status, scheduledAt: '2099-01-15T04:30:00Z', meetingUrl: 'https://meet.jit.si/hig-k1'),
      ]),
      'GET /consultations/k1': (_) =>
          _consultation(status: status, scheduledAt: '2099-01-15T04:30:00Z', meetingUrl: 'https://meet.jit.si/hig-k1'),
      'GET /payments/orders': (_) => page([_order('paid')]),
      'PATCH /consultations/k1': (r) {
        status = 'cancelled';
        return _consultation(status: status);
      },
    });
    await _pump(
      tester,
      adapter: adapter,
      initialLocation: Routes.consultations,
      overrides: [
        meetingLauncherProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
      ],
    );
    expect(find.text('Video consultation with Dr. Meena Rao'), findsOneWidget);
    expect(find.text('Scheduled'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('consultation-k1')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Scheduled for'), findsOneWidget);
    expect(find.text('We will remind you 24 hours and 1 hour before the call.'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('consult-join')));
    await tester.pumpAndSettle();
    expect(opened.single.toString(), 'https://meet.jit.si/hig-k1');

    await _tapVisible(tester, find.byKey(const ValueKey('consult-cancel')));
    await tester.tap(find.byKey(const ValueKey('consult-cancel-confirm')));
    await tester.pumpAndSettle();
    expect(bodyOf(adapter.last('PATCH', '/consultations/k1')), {'status': 'cancelled'});
    expect(find.text('Consultation cancelled'), findsOneWidget);
    expect(find.byKey(const ValueKey('consult-join')), findsNothing);
  });

  testWidgets('list: empty state offers to find a doctor', (tester) async {
    await _pump(
      tester,
      adapter: RoutedAdapter({'GET /consultations': (_) => page([])}),
      initialLocation: Routes.consultations,
    );
    expect(find.text('No consultations yet'), findsOneWidget);
    expect(find.text('Find a doctor'), findsOneWidget);
  });
}
