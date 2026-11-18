import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/features/insurance/screens/insurance_screen.dart';
import 'package:heal_india_global/features/insurance/widgets/partner_widgets.dart';
import 'package:heal_india_global/l10n/l10n.dart';

import '../phase1/phase1_helpers.dart';

Map<String, Object?> _product({String id = 'o1', List<String> countries = const ['NG', 'GH']}) => {
  'id': id,
  'kind': 'insurance',
  'provider_name': 'SafeTravel',
  'product_name': 'Medical Trip Cover',
  'category': 'medical_travel',
  'summary': 'Cover for treatment complications abroad.',
  'countries': countries,
  'price_min_minor': 4000,
  'price_max_minor': 12000,
  'currency': 'USD',
  'price_note': 'per trip, set by the insurer',
  'website_url': 'https://safetravel.example',
  'contact_email': null,
  'contact_phone': null,
  'is_active': true,
  'sort': 0,
  'created_at': '2026-11-18T10:00:00Z',
  'updated_at': '2026-11-18T10:00:00Z',
};

Map<String, Object?> _lead(String id, String kind, String status, {String? url}) => {
  'id': id,
  'kind': kind,
  'offering_id': 'o1',
  'provider_name': kind == 'insurance' ? 'SafeTravel' : 'EasyPay',
  'product_name': kind == 'insurance' ? 'Medical Trip Cover' : 'Treatment loan',
  'case_id': null,
  'booking_id': null,
  'status': status,
  'partner_website_url': url,
  'created_at': '2026-11-18T10:00:00Z',
  'updated_at': '2026-11-18T10:00:00Z',
};

void main() {
  tearDown(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  Future<List<Uri>> pump(
    WidgetTester tester,
    RoutedAdapter adapter, {
    String location = '/insurance',
    AuthState? auth,
    Locale locale = const Locale('en'),
  }) async {
    final opened = <Uri>[];
    await pumpWithApi(
      tester,
      path: '/insurance',
      initialLocation: location,
      screen: (s) => InsuranceScreen(
        initialTab: InsuranceTab.fromQuery(s.uri.queryParameters['tab']),
        caseId: s.uri.queryParameters['case'],
        bookingId: s.uri.queryParameters['booking'],
      ),
      adapter: adapter,
      auth: auth,
      locale: locale,
      logicalSize: const Size(420, 1400),
      overrides: [
        partnerLinkLauncherProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
      ],
    );
    await tester.pumpAndSettle();
    return opened;
  }

  testWidgets('insurance products for the home country, disclaimer, quote request with consent and hand-off', (
    tester,
  ) async {
    final adapter = RoutedAdapter({
      'GET /insurance/products': (_) => [_product()],
      'GET /insurance/requests': (_) => <Object?>[],
      'GET /financing/eligibility-checks': (_) => <Object?>[],
      'POST /insurance/requests': (_) =>
          (201, _lead('l1', 'insurance', 'new', url: 'https://safetravel.example/quote?ref=l1')),
    });
    final opened = await pump(tester, adapter, location: '/insurance?case=c1');

    expect(adapter.last('GET', '/insurance/products')!.query['country'], 'NG');
    expect(find.textContaining('Heal India Global does not sell insurance'), findsOneWidget);
    expect(find.text('Options for Nigeria'), findsOneWidget);
    expect(find.text('Medical Trip Cover'), findsOneWidget);
    expect(find.text('Medical travel insurance'), findsOneWidget);
    expect(find.text(r'Indicative price: $40 - $120'), findsOneWidget);
    expect(find.text('per trip, set by the insurer'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('offering-website-o1')));
    await tester.pumpAndSettle();
    expect(opened.single.toString(), 'https://safetravel.example');

    await tester.tap(find.byKey(const ValueKey('offering-request-o1')));
    await tester.pumpAndSettle();
    expect(find.text('Request a quote from the insurer'), findsWidgets);
    // Prefilled from the account.
    expect(find.text('Amina Yusuf'), findsOneWidget);
    expect(find.text('amina@example.com'), findsOneWidget);
    expect(find.text('Do not include medical details.'), findsOneWidget);
    expect(find.text('This request is linked to your treatment case.'), findsOneWidget);

    // Consent is required: nothing is sent without it.
    await tester.ensureVisible(find.byKey(const ValueKey('lead-send')));
    await tester.tap(find.byKey(const ValueKey('lead-send')));
    await tester.pumpAndSettle();
    expect(find.text('Tick the box to agree before you send the request.'), findsOneWidget);
    expect(adapter.last('POST', '/insurance/requests'), isNull);

    expect(find.textContaining('may share my name and contact details with SafeTravel'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('lead-preferred-whatsapp')));
    await tester.tap(find.byKey(const ValueKey('lead-preferred-whatsapp')));
    await tester.ensureVisible(find.byKey(const ValueKey('lead-consent')));
    await tester.tap(find.byKey(const ValueKey('lead-consent')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('lead-send')));
    await tester.tap(find.byKey(const ValueKey('lead-send')));
    await tester.pumpAndSettle();

    final body = bodyOf(adapter.last('POST', '/insurance/requests'));
    expect(body['product_id'], 'o1');
    expect(body['case_id'], 'c1');
    expect(body['contact_name'], 'Amina Yusuf');
    expect(body['contact_email'], 'amina@example.com');
    expect(body['preferred_contact'], 'whatsapp');
    expect(body['country'], 'NG');
    expect(body['consent_share_contact'], true);
    expect(body['consent_version'], '2026-11-18');
    expect(body.containsKey('partner_id'), isFalse);

    expect(find.text('Request sent'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('lead-continue')));
    await tester.pumpAndSettle();
    expect(opened.last.toString(), 'https://safetravel.example/quote?ref=l1');
  });

  testWidgets('API error codes get our own wording (duplicate request)', (tester) async {
    final adapter = RoutedAdapter({
      'GET /insurance/products': (_) => [_product()],
      'POST /insurance/requests': (_) => apiError(409, 'duplicate_request', message: 'raw'),
    });
    await pump(tester, adapter);
    await tester.tap(find.byKey(const ValueKey('offering-request-o1')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('lead-consent')));
    await tester.tap(find.byKey(const ValueKey('lead-consent')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('lead-send')));
    await tester.tap(find.byKey(const ValueKey('lead-send')));
    await tester.pumpAndSettle();
    expect(find.text('You already have an open request with this partner.'), findsOneWidget);
    expect(find.text('raw'), findsNothing);
  });

  testWidgets('a guest needs a name and an email or phone; pay-later uses partner_id', (tester) async {
    final adapter = RoutedAdapter({
      'GET /financing/partners': (_) => [
        {
          ..._product(id: 'p1', countries: const []),
          'kind': 'pay_later',
          'provider_name': 'EasyPay',
          'product_name': 'Treatment loan',
          'category': null,
          'price_min_minor': null,
          'price_max_minor': null,
          'currency': null,
        },
      ],
      'POST /financing/eligibility-checks': (_) => (201, _lead('l2', 'pay_later', 'new')),
    });
    await pump(tester, adapter, location: '/insurance?tab=pay_later', auth: AuthState.fromUser(guestUser));

    expect(adapter.last('GET', '/financing/partners')!.query.containsKey('country'), isFalse);
    expect(find.textContaining('does not lend money or make credit decisions'), findsOneWidget);
    expect(find.textContaining('Heal India Global makes no credit decision'), findsOneWidget);
    expect(find.text('Available in every country'), findsOneWidget);
    expect(find.text('Price on request from the partner'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('offering-request-p1')));
    await tester.pumpAndSettle();
    expect(find.text('Check your eligibility'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('lead-consent')));
    await tester.tap(find.byKey(const ValueKey('lead-consent')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('lead-send')));
    await tester.tap(find.byKey(const ValueKey('lead-send')));
    await tester.pumpAndSettle();
    expect(find.text('Enter your name.'), findsOneWidget);
    expect(find.text('Give an email address or a phone number.'), findsWidgets);
    expect(adapter.last('POST', '/financing/eligibility-checks'), isNull);

    await tester.enterText(find.byKey(const ValueKey('lead-name')), 'Kwame Mensah');
    await tester.enterText(find.byKey(const ValueKey('lead-phone')), '+233 20 123 4567');
    await tester.ensureVisible(find.byKey(const ValueKey('lead-send')));
    await tester.tap(find.byKey(const ValueKey('lead-send')));
    await tester.pumpAndSettle();
    final body = bodyOf(adapter.last('POST', '/financing/eligibility-checks'));
    expect(body['partner_id'], 'p1');
    expect(body['contact_name'], 'Kwame Mensah');
    expect(body['contact_phone'], '+233 20 123 4567');
    expect(body.containsKey('contact_email'), isFalse);
    expect(find.text('Request sent'), findsOneWidget);
  });

  testWidgets('empty lists show an empty state', (tester) async {
    final adapter = RoutedAdapter({'GET /insurance/products': (_) => <Object?>[]});
    await pump(tester, adapter);
    expect(find.text('No insurance options yet'), findsOneWidget);
    // The disclaimer stays visible.
    expect(find.byKey(const ValueKey('disclaimer-insurance')), findsOneWidget);
  });

  testWidgets('my requests: both kinds, status chips, hand-off and withdraw', (tester) async {
    final adapter = RoutedAdapter({
      'GET /insurance/requests': (_) => [_lead('l1', 'insurance', 'in_progress')],
      'GET /financing/eligibility-checks': (_) => [
        _lead('l2', 'pay_later', 'shared_with_partner', url: 'https://easypay.example/apply'),
        {..._lead('l3', 'pay_later', 'cancelled'), 'created_at': '2026-11-01T10:00:00Z'},
      ],
      'POST /insurance/requests/l1/cancel': (_) => _lead('l1', 'insurance', 'cancelled'),
    });
    final opened = await pump(tester, adapter, location: '/insurance?tab=requests');

    expect(find.text('Insurance quote'), findsOneWidget);
    expect(find.text('Pay-later eligibility'), findsNWidgets(2));
    expect(find.text('In progress'), findsOneWidget);
    expect(find.text('Passed to partner'), findsOneWidget);
    expect(find.text('Withdrawn'), findsOneWidget);
    expect(
      find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Status: In progress'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('lead-withdraw-l3')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('lead-continue-l2')));
    await tester.pumpAndSettle();
    expect(opened.single.toString(), 'https://easypay.example/apply');

    await tester.tap(find.byKey(const ValueKey('lead-withdraw-l1')));
    await tester.pumpAndSettle();
    expect(find.textContaining('This also withdraws your consent'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('lead-withdraw-confirm')));
    await tester.pumpAndSettle();
    expect(adapter.last('POST', '/insurance/requests/l1/cancel'), isNotNull);
    expect(find.text('Request withdrawn.'), findsOneWidget);
  });

  testWidgets('no requests: empty state', (tester) async {
    final adapter = RoutedAdapter({
      'GET /insurance/requests': (_) => <Object?>[],
      'GET /financing/eligibility-checks': (_) => <Object?>[],
    });
    await pump(tester, adapter, location: '/insurance?tab=requests');
    expect(find.text('No requests yet'), findsOneWidget);
  });

  testWidgets('renders right-to-left in Arabic', (tester) async {
    final adapter = RoutedAdapter({
      'GET /insurance/products': (_) => [_product()],
    });
    await pump(tester, adapter, locale: const Locale('ar'));
    final context = tester.element(find.byType(InsuranceScreen));
    expect(Directionality.of(context), TextDirection.rtl);
    expect(find.text(lookupAppLocalizations(const Locale('ar')).insuranceDisclaimer), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
