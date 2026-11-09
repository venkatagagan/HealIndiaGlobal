import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_text_styles.dart';
import 'package:heal_india_global/features/agent_portal/agent_routes.dart';
import 'package:heal_india_global/features/agent_portal/agent_shell.dart';
import 'package:heal_india_global/features/agent_portal/data/agent_models.dart';
import 'package:heal_india_global/features/agent_portal/screens/agent_cases_screens.dart';

import 'portal_test_helpers.dart';

Map<String, Object?> patientJson({String id = 'p-1'}) => {
  'id': id,
  'user_id': 'u-$id',
  'first_name': 'Amina',
  'last_name': 'Yusuf',
  'full_name': 'Amina Yusuf',
  'email': 'amina@example.com',
  'date_of_birth': '1972-03-14',
  'gender': 'female',
  'nationality': 'NG',
  'preferred_currency': 'USD',
  'is_managed': true,
  'account_activated': false,
  'cases_count': 2,
  'screenings_count': 1,
  'created_at': '2026-09-01T09:00:00Z',
  'updated_at': '2026-09-01T09:00:00Z',
};

RoutedAdapter agentBackend() {
  final second = caseJson(
    id: 'c-2',
    hospitalId: 'h-9',
    hospitalName: 'Fortis Delhi',
    latestQuote: quoteJson(id: 'q-2', caseId: 'c-2', total: 390000000),
  );
  final first = caseJson(latestQuote: quoteJson());
  return RoutedAdapter({
    'GET /agent-portal/dashboard': (_) => {
      'patients_total': 12,
      'active_cases': 5,
      'bookings_confirmed': 3,
      'commission_pending_minor': 2500000,
      'commission_paid_minor': 9000000,
      'currency': 'INR',
      'conversion_rate': 0.25,
      'monthly': [
        {'month': '2026-09', 'cases': 4, 'bookings': 1, 'commission_minor': 1500000},
        {'month': '2026-10', 'cases': 6, 'bookings': 2, 'commission_minor': 2500000},
      ],
      'recent_cases': [first],
    },
    'GET /agent-portal/profile': (_) => {
      'id': 'ag-1',
      'agency_name': 'Lagos Health Travel',
      'agent_code': 'AG-7K2Q',
      'status': 'pending',
      'kyc_status': 'pending',
      'tier': 'standard',
    },
    'GET /agent-portal/referral': (_) => {'agent_code': 'AG-7K2Q', 'referral_url': 'https://hig.test/r/AG-7K2Q'},
    'GET /agent-portal/patients': (_) => page([patientJson()]),
    'POST /agent-portal/patients': (r) => {...patientJson(id: 'p-new'), 'full_name': 'John Doe'},
    'GET /agent-portal/patients/p-1': (_) => patientJson(),
    'GET /agent-portal/patients/p-new': (_) => {...patientJson(id: 'p-new'), 'full_name': 'John Doe'},
    'GET /cases': (_) => page([first, second]),
    'GET /cases/c-1': (_) => caseDetailJson(),
    'POST /cases/c-1/quotes/q-1/accept': (_) => quoteJson(status: 'accepted'),
    'GET /screenings': (_) => page([
      {'id': 's-1', 'status': 'completed', 'patient_id': 'p-1', 'created_at': '2026-09-02T09:00:00Z'},
    ]),
    'GET /documents': (_) => <Object?>[],
    'GET /specialties': (_) => [
      {'id': 'sp-1', 'slug': 'orthopedics', 'name': 'Orthopedics'},
    ],
    'GET /content/symptoms': (_) => [
      {
        'name': 'Knee pain',
        'specialty_slugs': ['orthopedics'],
        'body_areas': ['knee'],
      },
    ],
    'POST /screenings': (_) => {'id': 's-new', 'status': 'draft', 'patient_id': 'p-1'},
    'PATCH /screenings/s-new': (_) => {'id': 's-new', 'status': 'draft', 'patient_id': 'p-1'},
    'POST /screenings/s-new/submit': (_) => {'id': 's-new', 'status': 'processing', 'patient_id': 'p-1'},
    'GET /screenings/s-new': (_) => {
      'id': 's-new',
      'status': 'completed',
      'patient_id': 'p-1',
      'specialty': {'id': 'sp-1', 'slug': 'orthopedics', 'name': 'Orthopedics'},
      'urgency': 'routine',
      'red_flags': <Object?>[],
      'ai_result': {
        'summary': 'Likely knee osteoarthritis',
        'suggested_specialties': <Object?>[],
        'urgency': 'routine',
        'red_flags': <Object?>[],
      },
    },
    'GET /screenings/s-new/matches': (_) => [
      {
        'id': 'm-1',
        'rank': 1,
        'match_score': 92,
        'reasons': <Object?>[],
        'hospital': {'id': 'h-1', 'slug': 'apollo', 'name': 'Apollo Chennai', 'city': 'Chennai'},
        'procedure': {'id': 'pr-1', 'slug': 'knee-replacement', 'name': 'Knee replacement'},
        'estimated_cost_minor': 450000000,
        'currency': 'INR',
      },
    ],
    'POST /cases': (_) => caseJson(id: 'c-9', status: 'enquiry'),
    'GET /bookings': (_) => page([bookingJson()]),
    'GET /finance/summary': (_) => payeeSummaryJson(),
    'GET /agent-portal/commissions': (_) => page([settlementItemJson()]),
    'GET /finance/settlements/payouts': (_) => page([]),
    'DELETE /auth/me': (_) => (
      409,
      {
        'error': {
          'code': 'account_deletion_blocked',
          'message': 'Your account has treatment, bookings or payments in progress.',
          'details': {'active_cases': 2, 'pending_payments': 1},
        },
      },
    ),
    'POST /auth/me/deletion-request': (_) => {'status': 'requested'},
  });
}

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  testWidgets('AgentShell shows the dashboard KPIs and switches tabs', (tester) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.home,
      user: agentUser,
      adapter: api,
    );

    expect(find.byType(AgentShell), findsOneWidget);
    expect(find.text('Hi, Sam'), findsOneWidget);
    expect(find.text('12'), findsOneWidget); // patients
    expect(find.text('25%'), findsOneWidget); // conversion
    expect(find.textContaining('KYC is under review'), findsOneWidget);
    expect(find.text('Amina Yusuf'), findsWidgets); // recent case

    await tester.tap(find.text('Patients').last);
    await tester.pumpAndSettle();
    expect(find.text('My patients'), findsOneWidget);
    expect(find.textContaining('2 cases'), findsOneWidget);

    await tester.tap(find.text('Bookings').last);
    await tester.pumpAndSettle();
    expect(find.text('HIG-B-2026-000001'), findsOneWidget);

    await tester.tap(find.text('Earnings').last);
    await tester.pumpAndSettle();
    expect(find.text('Your agent code AG-7K2Q'), findsOneWidget);
    expect(api.last('GET', '/agent-portal/commissions'), isNotNull, reason: 'agents read their commissions');
    expect(find.text('HIG-B-2026-000001'), findsOneWidget);
  });

  testWidgets('agents can delete their account from the account menu; blockers offer a deletion request', (
    tester,
  ) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.home,
      user: agentUser,
      adapter: api,
    );

    await tester.tap(find.byKey(const ValueKey('portal-account-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('portal-delete-account')));
    await tester.pumpAndSettle();
    expect(find.text('Delete my account permanently'), findsOneWidget);
    expect(find.byKey(const Key('delete-account-otp')), findsNothing); // no MFA on this account

    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'secret-pass');
    await tester.enterText(find.byKey(const Key('delete-account-confirm')), 'DELETE');
    await tester.pump();
    final submit = find.text('Delete my account permanently');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(bodyOf(api.last('DELETE', '/auth/me')), {'password': 'secret-pass'});
    expect(find.byKey(const Key('delete-account-blockers')), findsOneWidget);
    expect(find.text('Cases in progress'), findsOneWidget);
    expect(find.text('Payments in progress'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('delete-account-request')));
    await tester.tap(find.byKey(const Key('delete-account-request')));
    await tester.pumpAndSettle();
    expect(api.last('POST', '/auth/me/deletion-request'), isNotNull);
    expect(find.byKey(const Key('delete-account-request-sent')), findsOneWidget);
  });

  testWidgets('patient detail opens from the list and offers screening on behalf', (tester) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.tab(1),
      user: agentUser,
      adapter: api,
    );

    await tester.tap(find.text('Amina Yusuf'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('agent-run-screening')), findsOneWidget);
    expect(find.text('Compare quotes'), findsOneWidget);
    expect(api.last('GET', '/cases')!.query['patient_id'], 'p-1');
    expect(api.last('GET', '/screenings')!.query['patient_id'], 'p-1');
  });

  testWidgets('agent runs a screening on behalf of a patient and requests quotes from matches', (tester) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.newScreening('p-1'),
      user: agentUser,
      adapter: api,
    );

    await tester.tap(find.text('Orthopedics'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Knee pain'));
    await tester.tap(find.text('Knee pain'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('agent-screening-submit')));
    await tester.tap(find.byKey(const ValueKey('agent-screening-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('I agree, use AI'));
    await tester.pumpAndSettle();

    expect(bodyOf(api.last('POST', '/screenings')), {'patient_id': 'p-1', 'specialty_slug': 'orthopedics'});
    final patch = bodyOf(api.last('PATCH', '/screenings/s-new'));
    expect(patch['symptoms'], [
      {'name': 'Knee pain', 'answer': 'yes'},
    ]);
    expect(patch['home_country'], 'NG');
    expect(bodyOf(api.last('POST', '/screenings/s-new/submit')), {'consent_ai': true});

    expect(find.text('Likely knee osteoarthritis'), findsOneWidget);
    await tester.tap(find.text('Apollo Chennai'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('agent-request-quotes')));
    await tester.pumpAndSettle();
    expect(bodyOf(api.last('POST', '/cases')), {
      'patient_id': 'p-1',
      'hospital_id': 'h-1',
      'procedure_id': 'pr-1',
      'specialty_id': 'sp-1',
      'screening_id': 's-new',
    });
    expect(find.text('Requested'), findsOneWidget);
  });

  testWidgets('adding a patient posts the create body and opens the new patient', (tester) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.newPatient,
      user: agentUser,
      adapter: api,
    );

    await tester.enterText(find.byKey(const ValueKey('patient-first-name')), 'John');
    await tester.enterText(find.byKey(const ValueKey('patient-last-name')), 'Doe');
    await tester.enterText(find.byKey(const ValueKey('patient-nationality')), 'ke');
    await tester.tap(find.byKey(const ValueKey('patient-save')));
    await tester.pumpAndSettle();

    final body = bodyOf(api.last('POST', '/agent-portal/patients'));
    expect(body, {'first_name': 'John', 'last_name': 'Doe', 'nationality': 'KE'});
    expect(find.text('John Doe'), findsWidgets);
  });

  testWidgets('accepting a quote on the case detail calls the accept endpoint', (tester) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.caseDetail('c-1'),
      user: agentUser,
      adapter: api,
    );

    expect(find.textContaining('TKR surgery', findRichText: true), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('accept-quote-q-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Accept')));
    await tester.pumpAndSettle();
    expect(api.last('POST', '/cases/c-1/quotes/q-1/accept'), isNotNull);
  });

  testWidgets('quote comparison lists hospitals cheapest first', (tester) async {
    final api = agentBackend();
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.compare('p-1'),
      user: agentUser,
      adapter: api,
    );
    expect(find.textContaining('Best price'), findsOneWidget);
    expect(find.textContaining('Fortis Delhi'), findsWidgets);
    final fortis = tester.getTopLeft(find.text('Fortis Delhi').last);
    final apollo = tester.getTopLeft(find.text('Apollo Chennai').last);
    expect(fortis.dx, lessThan(apollo.dx));
  });

  group('QuoteComparison', () {
    MedicalCase c(String id, int total, {String ccy = 'INR', String status = 'quoted'}) => MedicalCase.fromJson(
      caseJson(
        id: id,
        status: status,
        latestQuote: quoteJson(id: 'q-$id', caseId: id, total: total, currency: ccy),
      ),
    );

    test('sorts by total, finds the cheapest and the spread, skips cancelled and unquoted cases', () {
      final cmp = QuoteComparison.fromCases([
        c('a', 500000),
        c('b', 300000),
        c('x', 100000, status: 'cancelled'),
        MedicalCase.fromJson(caseJson(id: 'n')),
      ]);
      expect(cmp.columns.map((e) => e.medicalCase.id), ['b', 'a']);
      expect(cmp.cheapest!.medicalCase.id, 'b');
      expect(cmp.spreadMinor, 200000);
      expect(cmp.categories, [QuoteLineCategory.surgery, QuoteLineCategory.hospitalStay]);
    });

    test('does not compare totals across currencies', () {
      final cmp = QuoteComparison.fromCases([c('a', 500000), c('b', 3000, ccy: 'USD')]);
      expect(cmp.sameCurrency, isFalse);
      expect(cmp.cheapest, isNull);
      expect(cmp.spreadMinor, 0);
    });
  });

  test('AgentPatientInput only sends API-allowed keys', () {
    final input = AgentPatientInput(
      firstName: ' Amina ',
      lastName: 'Yusuf',
      nationality: 'ng',
      email: '',
      dateOfBirth: DateTime(1972, 3, 14),
      gender: Gender.female,
      passportNumber: 'a1 234 567',
    );
    expect(input.toCreateJson(), {
      'first_name': 'Amina',
      'last_name': 'Yusuf',
      'nationality': 'NG',
      'date_of_birth': '1972-03-14',
      'gender': 'female',
    });
    expect(input.toUpdateJson()['passport_number'], 'A1234567');
  });

  test('AgentDashboard parses KPIs and conversion label', () {
    final d = AgentDashboard.fromJson({'currency': 'INR', 'conversion_rate': 0.125, 'patients_total': 3});
    expect(d.patientsTotal, 3);
    expect(d.conversionLabel, '12.5%');
  });
}
