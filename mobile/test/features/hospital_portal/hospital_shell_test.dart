import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_text_styles.dart';
import 'package:heal_india_global/features/hospital_portal/data/hospital_models.dart';
import 'package:heal_india_global/features/hospital_portal/hospital_routes.dart';
import 'package:heal_india_global/features/hospital_portal/hospital_shell.dart';

import '../agent_portal/portal_test_helpers.dart';

RoutedAdapter hospitalBackend() => RoutedAdapter({
  'GET /hospital-portal/dashboard': (_) => {
    'enquiries_open': 11,
    'quotes_pending': 4,
    'bookings_upcoming': 3,
    'patients_in_treatment': 2,
    'revenue_month_minor': 1250000000,
    'currency': 'INR',
    'monthly': [
      {'month': '2026-09', 'bookings': 5, 'revenue_minor': 900000000},
      {'month': '2026-10', 'bookings': 7, 'revenue_minor': 1250000000},
    ],
    'recent_cases': [caseJson(status: 'enquiry')],
  },
  'GET /hospital-portal/profile': (_) => {'id': 'h-1', 'name': 'Apollo Chennai', 'status': 'active'},
  'GET /cases': (_) => page([caseJson(status: 'enquiry')]),
  'GET /cases/c-1': (_) => caseDetailJson(status: 'enquiry', quotes: []),
  'POST /cases/c-1/quotes': (_) => quoteJson(),
  'GET /hospital-portal/procedures': (_) => [
    {
      'id': 'hp-1',
      'hospital_id': 'h-1',
      'procedure': {'id': 'pr-1', 'slug': 'knee-replacement', 'name': 'Knee replacement'},
      'price_min_minor': 400000000,
      'price_max_minor': 500000000,
      'currency': 'INR',
      'hospital_stay_days': 5,
      'packages': <Object?>[],
    },
  ],
  'GET /hospital-portal/doctors': (_) => <Object?>[],
  'GET /bookings': (_) => page([bookingJson()]),
  'GET /bookings/b-1': (_) => bookingJson(),
  'GET /bookings/b-1/itinerary': (_) => [
    {
      'id': 'it-1',
      'case_id': 'c-1',
      'kind': 'surgery',
      'title': 'Knee surgery',
      'starts_at': '2099-11-21T03:30:00Z',
      'location': 'OT 3',
      'status': 'scheduled',
    },
  ],
  'POST /bookings/b-1/admit': (_) => bookingJson(status: 'admitted'),
  'GET /travel/visa-requests': (_) => page([
    {
      'id': 'v-1',
      'case_id': 'c-1',
      'case_number': 'HIG-C-2026-000123',
      'patient': {'id': 'p-1', 'full_name': 'Amina Yusuf'},
      'visa_type': 'e_medical',
      'status': 'documents_pending',
      'created_at': '2026-10-03T09:00:00Z',
      'updated_at': '2026-10-03T09:00:00Z',
    },
  ]),
  'GET /finance/summary': (_) => payeeSummaryJson(),
  'GET /finance/settlements/items': (_) => page([settlementItemJson(status: 'pending')]),
  'GET /finance/settlements/payouts': (_) => page([]),
  'DELETE /auth/me': (_) => null,
});

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  testWidgets('HospitalShell shows KPIs, sends X-Hospital-Id and reaches every tab', (tester) async {
    final api = hospitalBackend();
    await pumpPortal(
      tester,
      routes: hospitalPortalRoutes(),
      initialLocation: HospitalRoutes.home,
      user: hospitalUser,
      adapter: api,
    );

    expect(find.byType(HospitalShell), findsOneWidget);
    expect(find.text('Apollo Chennai'), findsWidgets);
    expect(find.text('11'), findsOneWidget); // open enquiries
    expect(api.last('GET', '/hospital-portal/dashboard')!.headers['X-Hospital-Id'], 'h-1');

    await tester.tap(find.text('Enquiries').last);
    await tester.pumpAndSettle();
    expect(api.last('GET', '/cases')!.query, containsPair('status', 'enquiry'));
    expect(api.last('GET', '/cases')!.query, containsPair('hospital_id', 'h-1'));
    expect(find.text('Amina Yusuf'), findsOneWidget);

    await tester.tap(find.text('Patients').last);
    await tester.pumpAndSettle();
    expect(api.last('GET', '/bookings')!.query, containsPair('status', 'confirmed'));
    expect(find.text('Amina Yusuf'), findsOneWidget);

    await tester.tap(find.text('Settlements').last);
    await tester.pumpAndSettle();
    expect(find.text('Settlements & payouts'), findsOneWidget);
    expect(api.last('GET', '/finance/settlements/items'), isNotNull);
    expect(find.text('HIG-B-2026-000001'), findsOneWidget);

    await tester.tap(find.text('More').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('hospital-more-visas')));
    await tester.pumpAndSettle();
    expect(find.text('Visa invitation letters'), findsOneWidget);
    expect(find.text('Invitation letter needed'), findsOneWidget);
  });

  testWidgets('hospital users with MFA delete their account with an authenticator code', (tester) async {
    final api = hospitalBackend();
    const mfaUser = User(
      id: 'u-hosp',
      role: UserRole.hospital,
      status: UserStatus.active,
      fullName: 'Priya Raman',
      mfaEnabled: true,
      hospitals: [
        UserHospital(id: 'h-1', name: 'Apollo Chennai', slug: 'apollo', memberRole: HospitalMemberRole.owner),
      ],
    );
    await pumpPortal(
      tester,
      routes: [
        ...hospitalPortalRoutes(),
        GoRoute(
          path: '/auth',
          builder: (_, _) => const Scaffold(body: Text('public door')),
        ),
      ],
      initialLocation: HospitalRoutes.tab(HospitalRoutes.tabMore),
      user: mfaUser,
      adapter: api,
    );

    await tester.ensureVisible(find.byKey(const ValueKey('hospital-delete-account')));
    await tester.tap(find.byKey(const ValueKey('hospital-delete-account')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('delete-account-otp')), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'secret-pass');
    await tester.enterText(find.byKey(const Key('delete-account-otp')), '123456');
    await tester.enterText(find.byKey(const Key('delete-account-confirm')), 'DELETE');
    await tester.pump();
    final submit = find.text('Delete my account permanently');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(bodyOf(api.last('DELETE', '/auth/me')), {'password': 'secret-pass', 'otp_code': '123456'});
    expect(find.text('Delete my account permanently'), findsNothing); // sheet closed after deletion
  });

  testWidgets('switching hospital changes the X-Hospital-Id header', (tester) async {
    final api = hospitalBackend();
    await pumpPortal(
      tester,
      routes: hospitalPortalRoutes(),
      initialLocation: HospitalRoutes.tab(HospitalRoutes.tabMore),
      user: hospitalUser,
      adapter: api,
    );
    await tester.tap(find.text('Apollo Delhi'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dashboard').last);
    await tester.pumpAndSettle();
    expect(api.last('GET', '/hospital-portal/dashboard')!.headers['X-Hospital-Id'], 'h-2');
  });

  testWidgets('quote builder prefills from the price list and sends an itemised quote', (tester) async {
    final api = hospitalBackend();
    await pumpPortal(
      tester,
      routes: hospitalPortalRoutes(),
      initialLocation: HospitalRoutes.caseDetail('c-1'),
      user: hospitalUser,
      adapter: api,
    );

    expect(find.text('Right knee, severe pain'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('hospital-prepare-quote')));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, '4000000'), findsOneWidget); // ₹40 lakh from the price list
    await tester.enterText(find.byKey(const ValueKey('quote-line-desc-1')), 'Private room, 5 nights');
    await tester.enterText(find.byKey(const ValueKey('quote-line-amount-1')), '50000');
    await tester.pumpAndSettle();
    expect(find.text('₹4,050,000'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const ValueKey('quote-send')));
    await tester.tap(find.byKey(const ValueKey('quote-send')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Send')));
    await tester.pumpAndSettle();

    final body = bodyOf(api.last('POST', '/cases/c-1/quotes'));
    expect(body['currency'], 'INR');
    expect(body['estimated_stay_days'], 5);
    expect(body['line_items'], [
      {'category': 'surgery', 'description': 'Knee replacement', 'amount_minor': 400000000},
      {'category': 'hospital_stay', 'description': 'Private room, 5 nights', 'amount_minor': 5000000},
    ]);
    expect((body['treatment_plan'] as String).startsWith('Knee replacement'), isTrue);
    expect(find.byKey(const ValueKey('quote-send')), findsNothing); // popped back to the case
  });

  testWidgets('admitting a confirmed booking calls the admit endpoint and shows the itinerary', (tester) async {
    final api = hospitalBackend();
    await pumpPortal(
      tester,
      routes: hospitalPortalRoutes(),
      initialLocation: HospitalRoutes.booking('b-1'),
      user: hospitalUser,
      adapter: api,
    );

    expect(find.text('Knee surgery'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('hospital-admit')));
    await tester.pumpAndSettle();
    await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'Bed 12');
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Admit')));
    await tester.pumpAndSettle();
    expect(bodyOf(api.last('POST', '/bookings/b-1/admit')), {'note': 'Bed 12'});
  });

  group('QuoteDraft', () {
    QuoteDraft draft({String plan = 'Plan', List<QuoteLineDraft>? lines}) => QuoteDraft(
      treatmentPlan: plan,
      lines: lines ?? [QuoteLineDraft(description: 'Surgery', amountMinor: 100000)],
      currency: 'INR',
      validUntil: DateTime(2026, 12, 31),
      estimatedStayDays: 4,
    );

    test('totals line items and serialises the API body', () {
      final d = draft(
        lines: [
          QuoteLineDraft(description: 'Surgery', amountMinor: 100000),
          QuoteLineDraft(category: QuoteLineCategory.medications, description: ' Meds ', amountMinor: 2500),
        ],
      );
      expect(d.totalMinor, 102500);
      expect(d.problem, isNull);
      expect(d.toJson(), {
        'treatment_plan': 'Plan',
        'line_items': [
          {'category': 'surgery', 'description': 'Surgery', 'amount_minor': 100000},
          {'category': 'medications', 'description': 'Meds', 'amount_minor': 2500},
        ],
        'currency': 'INR',
        'estimated_stay_days': 4,
        'valid_until': '2026-12-31',
      });
    });

    test('validates plan and line items', () {
      expect(draft(plan: ' ').problem, isNotNull);
      expect(draft(lines: []).problem, isNotNull);
      expect(draft(lines: [QuoteLineDraft(description: '', amountMinor: 5)]).problem, isNotNull);
    });
  });

  test('HospitalVisaRequest flags requests that still need an invitation letter', () {
    final v = HospitalVisaRequest.fromJson({
      'id': 'v',
      'case_id': 'c',
      'visa_type': 'e_medical',
      'status': 'not_started',
      'patient': {'full_name': 'A B'},
    });
    expect(v.patientName, 'A B');
    expect(v.needsInvitation, isTrue);
  });
}
