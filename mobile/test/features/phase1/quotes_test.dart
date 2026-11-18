import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/utils/money.dart';
import 'package:heal_india_global/core/widgets/widgets.dart';
import 'package:heal_india_global/features/agent_portal/shared/portal_widgets.dart';
import 'package:heal_india_global/features/quotes/screens/quick_quote_screen.dart';
import 'package:heal_india_global/features/quotes/screens/quote_group_screen.dart';
import 'package:heal_india_global/features/search/screens/procedure_earliest_screen.dart';
import 'package:heal_india_global/features/trips/widgets/case_widgets.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import 'phase1_helpers.dart';

final _earliest = {
  'procedure': {'id': 'p1', 'slug': 'knee-replacement', 'name': 'Knee replacement'},
  'items': [
    {
      'hospital': hospitalJson(
        'h1',
        'Apollo Chennai',
        admission: '2027-01-10',
        verified: [
          {'body': 'jci', 'valid_until': '2027-12-31'},
        ],
      ),
      'hospital_procedure_id': 'hp1',
      'price_min_minor': 30000000,
      'price_max_minor': 40000000,
      'currency': 'INR',
      'display_price_min': {'amount_minor': 360000, 'currency': 'USD', 'fx_rate': '0.012', 'approximate': true},
      'display_price_max': {'amount_minor': 480000, 'currency': 'USD', 'fx_rate': '0.012', 'approximate': true},
      'next_available_admission': '2027-01-10',
    },
    {
      'hospital': hospitalJson('h2', 'Fortis Delhi', admission: '2027-01-15'),
      'hospital_procedure_id': 'hp2',
      'currency': 'INR',
      'next_available_admission': '2027-01-15',
    },
  ],
};

Map<String, Object?> _groupCase(String id, String hospital, {Map<String, Object?>? quote, int? total, bool overdue = false}) => {
  'case_id': id,
  'case_number': 'HIG-C-$id',
  'status': quote == null ? 'enquiry' : 'quoted',
  'hospital': {'id': 'h-$id', 'slug': 'h-$id', 'name': hospital, 'city': 'Chennai'},
  'quote_due_at': '2030-01-01T10:00:00Z',
  'quote_overdue': overdue,
  'quote': quote,
  'total_in_currency_minor': total,
};

Map<String, Object?> _quote(String id, String caseId, int total) => {
  'id': id,
  'case_id': caseId,
  'status': 'sent',
  'line_items': [
    {'category': 'surgery', 'description': 'Surgery', 'amount_minor': total},
  ],
  'total_minor': total,
  'currency': 'INR',
  'estimated_stay_days': 7,
  'valid_until': '2030-12-31',
  'created_at': '2026-11-10T10:00:00Z',
};

final _group = {
  'quote_group_id': 'g1',
  'patient': {'id': 'pt1', 'full_name': 'Amina Yusuf'},
  'procedure': {'id': 'p1', 'slug': 'knee-replacement', 'name': 'Knee replacement'},
  'currency': 'USD',
  'created_at': '2026-11-10T09:00:00Z',
  'cheapest_case_id': 'c2',
  'cases': [
    _groupCase('c1', 'Apollo Chennai', quote: _quote('q1', 'c1', 40000000), total: 480000),
    _groupCase('c2', 'Fortis Delhi', quote: _quote('q2', 'c2', 30000000), total: 360000),
    _groupCase('c3', 'Manipal Bengaluru', overdue: true),
  ],
};

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  testWidgets('earliest list: earliest hospital preselected, pick up to 3, request quotes', (tester) async {
    final adapter = RoutedAdapter({'GET /procedures/knee-replacement/earliest': (_) => _earliest});
    await pumpWithApi(
      tester,
      path: '/procedures/:slug/earliest',
      initialLocation: '/procedures/knee-replacement/earliest',
      screen: (s) => ProcedureEarliestScreen(slug: s.pathParameters['slug']!),
      adapter: adapter,
    );
    await tester.pumpAndSettle();

    expect(find.text('Knee replacement'), findsOneWidget);
    expect(find.text('Earliest admission: 10 Jan'), findsWidgets);
    expect(find.text('≈ \$3,600 - \$4,800'), findsOneWidget); // server display amounts
    expect(find.text('${formatMoneyRange(30000000, 40000000, 'INR')} at the hospital'), findsOneWidget);
    expect(find.text('Request a quote'), findsOneWidget); // first hospital preselected

    await tester.tap(find.byType(Checkbox).last);
    await tester.pump();
    expect(find.text('Request quotes from 2 hospitals'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('earliest-request-quotes')));
    await tester.pumpAndSettle();
    final route = tester.widget<Text>(find.textContaining('route:/quote/new')).data!;
    final uri = Uri.parse(route.substring('route:'.length));
    expect(uri.queryParameters, {'hospitals': 'h1,h2', 'procedure': 'knee-replacement'});
  });

  testWidgets('quick quote sends one request to every hospital with the chosen reports', (tester) async {
    final adapter = RoutedAdapter({
      'GET /hospitals/h1': (_) => {...hospitalJson('h1', 'Apollo Chennai'), 'procedures': []},
      'GET /hospitals/h2': (_) => {...hospitalJson('h2', 'Fortis Delhi'), 'procedures': []},
      'GET /procedures/knee-replacement': (_) => {
        'id': 'p1',
        'slug': 'knee-replacement',
        'name': 'Knee replacement',
        'specialty': {'id': 's1', 'slug': 'orthopedics', 'name': 'Orthopedics'},
      },
      'GET /documents': (_) => [
        {'id': 'd1', 'kind': 'medical_report', 'file_name': 'xray.pdf', 'status': 'uploaded'},
      ],
      'POST /auth/consents': (_) => {'ok': true},
      'POST /cases/quote-request': (_) => (201, _group),
    });
    await pumpWithApi(
      tester,
      path: '/quote/new',
      initialLocation: '/quote/new?hospitals=h1,h2&procedure=knee-replacement',
      screen: (s) => const QuickQuoteScreen(hospitalIds: ['h1', 'h2'], procedureSlug: 'knee-replacement'),
      adapter: adapter,
      logicalSize: const Size(420, 1300),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hospitals (2 of 3)'), findsOneWidget);
    expect(find.text('Apollo Chennai'), findsOneWidget);
    expect(find.text('Fortis Delhi'), findsOneWidget);
    final send = find.byKey(const ValueKey('quick-quote-submit'));
    expect(tester.widget<PrimaryButton>(send).onPressed, isNull, reason: 'consent first');

    await tester.tap(find.byKey(const ValueKey('quick-quote-doc-d1')));
    await tester.enterText(find.byType(TextField).first, 'Right knee pain for 2 years');
    await tester.tap(find.byKey(const ValueKey('quick-quote-consent')));
    await tester.pump();
    expect(find.text('Send to 2 hospitals'), findsOneWidget);
    await tester.tap(send);
    await tester.pumpAndSettle();

    final body = bodyOf(adapter.last('POST', '/cases/quote-request'));
    expect(body['hospital_ids'], ['h1', 'h2']);
    expect(body['procedure_id'], 'p1');
    expect(body['document_ids'], ['d1']);
    expect(body['consent_share'], isTrue);
    expect(body['notes'], 'Right knee pain for 2 years');
    expect(find.text(routeLabel('/quotes/g1')), findsOneWidget);
  });

  testWidgets('quote comparison: cheapest highlighted, overdue hospital, accept opens booking', (tester) async {
    final adapter = RoutedAdapter({
      'GET /cases/quote-groups/g1': (_) => _group,
      'POST /cases/c2/quotes/q2/accept': (_) => {'ok': true},
    });
    await pumpWithApi(
      tester,
      path: '/quotes/:id',
      initialLocation: '/quotes/g1',
      screen: (s) => QuoteGroupScreen(groupId: s.pathParameters['id']!),
      adapter: adapter,
      logicalSize: const Size(420, 1300),
    );
    await tester.pumpAndSettle();

    expect(find.text('2 of 3 hospitals have replied'), findsOneWidget);
    expect(find.byKey(const ValueKey('quote-cheapest')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('quote-column-c2')), matching: find.text('Lowest price')), findsOneWidget);
    expect(find.text('≈ \$3,600'), findsOneWidget);
    expect(find.text('${formatMoney(30000000, 'INR')} at the hospital'), findsOneWidget);
    expect(find.textContaining("Overdue — we're chasing the hospital"), findsWidgets);

    await tester.tap(find.byKey(const ValueKey('quote-accept-c2')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.byType(FilledButton)));
    await tester.pumpAndSettle();
    expect(adapter.last('POST', '/cases/c2/quotes/q2/accept'), isNotNull);
    expect(find.text(routeLabel('/book/c2?quote=q2')), findsOneWidget);
  });

  testWidgets('case card shows the live countdown; hospital tile says respond by / overdue', (tester) async {
    final due = DateTime.now().add(const Duration(hours: 5, minutes: 3));
    final waiting = MedicalCase.fromJson({
      'id': 'c1',
      'case_number': 'HIG-C-1',
      'status': 'enquiry',
      'hospital': {'id': 'h1', 'name': 'Apollo Chennai'},
      'quote_due_at': due.toUtc().toIso8601String(),
      'hours_left': 5.05,
    });
    final late = MedicalCase.fromJson({
      'id': 'c2',
      'case_number': 'HIG-C-2',
      'status': 'enquiry',
      'hospital': {'id': 'h1', 'name': 'Apollo Chennai'},
      'quote_due_at': '2026-01-01T10:00:00Z',
      'quote_overdue': true,
    });
    await pumpWithApi(
      tester,
      path: '/x',
      adapter: RoutedAdapter({}),
      screen: (_) => Scaffold(
        body: ListView(
          children: [
            CaseCard(medicalCase: waiting),
            CaseTile(medicalCase: late, showHospital: false, forHospital: true),
            CaseTile(medicalCase: waiting, showHospital: false, forHospital: true),
          ],
        ),
      ),
    );
    await tester.pump();
    expect(find.textContaining('Quote due by'), findsOneWidget);
    expect(find.textContaining(RegExp(r'0[45]:\d\d:\d\d left')), findsWidgets);
    expect(find.textContaining('Overdue'), findsOneWidget);
    expect(find.textContaining('Respond by'), findsOneWidget);
  });

  testWidgets('countdown ticks every second and turns overdue', (tester) async {
    var now = DateTime(2026, 11, 18, 10, 0, 0);
    await pumpWithApi(
      tester,
      path: '/x',
      adapter: RoutedAdapter({}),
      screen: (_) => Scaffold(
        body: QuoteCountdown(dueAt: DateTime(2026, 11, 19, 10, 0, 2), now: () => now),
      ),
    );
    expect(find.text('1 day 00:00:02 left'), findsOneWidget);
    now = now.add(const Duration(days: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('00:00:02 left'), findsOneWidget);
    now = now.add(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text("Overdue — we're chasing the hospital"), findsOneWidget);
  });
}
