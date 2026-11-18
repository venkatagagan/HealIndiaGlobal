import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/features/agent_portal/agent_routes.dart';
import 'package:heal_india_global/features/referrals/screens/referral_screen.dart';
import 'package:heal_india_global/features/referrals/widgets/credit_pay_card.dart';

import '../agent_portal/agent_shell_test.dart' show patientJson;
import '../agent_portal/portal_test_helpers.dart';
import 'referral_crm_models_test.dart' show leadJson;

const patientUser = User(id: 'u-pat', role: UserRole.patient, status: UserStatus.active, fullName: 'Pat Lee');

Map<String, Object?> overviewJson() => {
  'enabled': true,
  'code': 'R7KQ2MZP4X',
  'share_url': 'https://site.test/?ref=R7KQ2MZP4X',
  'patient_web_url': 'https://app.test/register?ref=R7KQ2MZP4X',
  'app_url': 'healindia://register?ref=R7KQ2MZP4X',
  'rewards': {
    'referrer': {'amount_minor': 5000, 'currency': 'USD'},
    'referee': {'amount_minor': 2500, 'currency': 'USD'},
    'max_rewards_per_year': 10,
    'credit_validity_days': 365,
  },
  'credit': {
    'base_amount_minor': 415000,
    'base_currency': 'INR',
    'amount_minor': 5000,
    'currency': 'USD',
    'expiring_soon_minor': 0,
    'next_expiry_at': null,
  },
  'counts': {'pending': 1, 'rewarded': 1},
  'referrals': [
    {'id': 'r-1', 'friend_name': 'Jane D.', 'status': 'rewarded', 'created_at': '2026-10-01T00:00:00Z'},
    {'id': 'r-2', 'friend_name': 'Ali K.', 'status': 'pending', 'created_at': '2026-10-02T00:00:00Z'},
  ],
};

Map<String, Object?> pipelineJson() => {
  'total': 3,
  'open': 3,
  'stages': [
    for (final s in ['new', 'contacted', 'qualified', 'screening', 'quote_requested', 'won', 'lost'])
      {'status': s, 'count': s == 'contacted' ? 2 : (s == 'new' ? 1 : 0)},
  ],
  'sources': <Object?>[],
  'won': 0,
  'lost': 0,
  'conversion_rate': null,
  'follow_ups_due_today': 4,
  'follow_ups_overdue': 1,
  'new_this_month': 3,
};

void main() {
  testWidgets('Refer a friend shows the code, credit and friends and sends the install id', (tester) async {
    final api = RoutedAdapter({
      'GET /patient/referral': (_) => overviewJson(),
      'GET /patient/credits': (_) => {
        'balance': overviewJson()['credit'],
        'credits': <Object?>[],
        'movements': [
          {
            'id': 'm-1',
            'credit_id': 'c-1',
            'kind': 'grant',
            'amount_minor': 415000,
            'display_amount_minor': 5000,
            'display_currency': 'USD',
            'created_at': '2026-11-01T00:00:00Z',
          },
        ],
      },
    });
    await pumpPortal(
      tester,
      routes: [GoRoute(path: '/referrals', builder: (_, _) => const ReferralScreen())],
      initialLocation: '/referrals',
      user: patientUser,
      adapter: api,
    );

    expect(find.text('Refer a friend'), findsOneWidget);
    expect(find.text('R7KQ2MZP4X'), findsOneWidget);
    expect(find.textContaining('Your friend gets \$25'), findsOneWidget);
    expect(find.byKey(const ValueKey('referral-credit-amount')), findsOneWidget);
    expect(find.text('Jane D.'), findsOneWidget);
    expect(find.text('Signed up'), findsWidgets);
    expect(api.last('GET', '/patient/referral')!.headers['X-Device-Id'], isNotEmpty);

    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.tap(find.byKey(const ValueKey('referral-copy-code')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(copied, 'R7KQ2MZP4X');
    expect(find.text('Code copied'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Credit added'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Credit added'), findsOneWidget);
  });

  testWidgets('"Use my credit" applies the credit and reports the result', (tester) async {
    final api = RoutedAdapter({
      'GET /patient/credits/preview': (_) => {
        'booking_id': 'b-1',
        'purpose': 'booking_deposit',
        'currency': 'USD',
        'due_minor': 5000,
        'available_minor': 8000,
        'available_base_minor': 664000,
        'base_currency': 'INR',
        'apply_minor': 5000,
        'remaining_due_minor': 0,
        'applicable': true,
        'reason': null,
      },
      'POST /patient/credits/apply': (_) => {
        'order_id': 'o-1',
        'order_number': 'HIG-O-1',
        'payment_id': 'pay-1',
        'applied_minor': 5000,
        'currency': 'USD',
        'applied_base_minor': 415000,
        'remaining_due_minor': 0,
        'credit': {'amount_minor': 3000, 'currency': 'USD'},
      },
    });
    CreditApplyResult? applied;
    await pumpPortal(
      tester,
      routes: [
        GoRoute(
          path: '/pay',
          builder: (_, _) => Scaffold(
            body: CreditPayCard(
              bookingId: 'b-1',
              purpose: PaymentPurpose.bookingDeposit,
              onApplied: (r) async => applied = r,
            ),
          ),
        ),
      ],
      initialLocation: '/pay',
      user: patientUser,
      adapter: api,
    );

    // The card renders nothing while the preview loads, so let the request complete.
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    await tester.pumpAndSettle();
    expect(api.last('GET', '/patient/credits/preview')!.query, {'booking_id': 'b-1', 'purpose': 'booking_deposit'});
    expect(find.text('Your credit covers the full amount due now.'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('credit-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('credit-apply-confirm')));
    await tester.pumpAndSettle();

    expect(bodyOf(api.last('POST', '/patient/credits/apply')), {'booking_id': 'b-1', 'purpose': 'booking_deposit'});
    expect(applied?.isPaidInFull, isTrue);
  });

  testWidgets('agents never see the credit card', (tester) async {
    final api = RoutedAdapter({});
    await pumpPortal(
      tester,
      routes: [
        GoRoute(
          path: '/pay',
          builder: (_, _) => Scaffold(
            body: CreditPayCard(bookingId: 'b-1', purpose: PaymentPurpose.bookingFull, onApplied: (_) async {}),
          ),
        ),
      ],
      initialLocation: '/pay',
      user: agentUser,
      adapter: api,
    );
    expect(find.byKey(const ValueKey('credit-pay-card')), findsNothing);
    expect(api.requests, isEmpty);
  });

  testWidgets('Leads: due-today filter, pipeline badge, status change to lost with a reason', (tester) async {
    final api = RoutedAdapter({
      'GET /agent-portal/leads': (_) => page([leadJson()]),
      'GET /agent-portal/leads/pipeline': (_) => pipelineJson(),
      'GET /agent-portal/leads/l-1': (_) => {...leadJson(), 'activities': <Object?>[]},
      'PATCH /agent-portal/leads/l-1': (r) => {
        ...leadJson(status: 'lost'),
        'lost_reason': bodyOf(r)['lost_reason'],
        'activities': <Object?>[],
      },
    });
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.leadsFor(followUp: 'due'),
      user: agentUser,
      adapter: api,
    );

    expect(api.last('GET', '/agent-portal/leads')!.query['follow_up'], 'due');
    expect(find.text('4 follow-ups due today'), findsOneWidget);
    expect(find.text('Due today (4)'), findsOneWidget);
    expect(find.text('Grace Adaeze Okoro'), findsOneWidget);

    await tester.tap(find.text('Grace Adaeze Okoro'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('lead-change-status')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('lead-status-lost')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('lead-status-save')));
    await tester.pumpAndSettle();
    expect(find.text('Enter the reason the lead was lost.'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('lead-lost-reason')), 'Chose another country');
    await tester.tap(find.byKey(const ValueKey('lead-status-save')));
    await tester.pumpAndSettle();

    expect(bodyOf(api.last('PATCH', '/agent-portal/leads/l-1')), {
      'status': 'lost',
      'lost_reason': 'Chose another country',
    });
  });

  testWidgets('Convert to patient reuses the patient form prefilled from the lead, with consent', (tester) async {
    final api = RoutedAdapter({
      'GET /agent-portal/leads/l-1': (_) => {...leadJson(), 'activities': <Object?>[]},
      'POST /agent-portal/leads/l-1/convert': (_) => (
        201,
        {
          'lead': {...leadJson(status: 'won'), 'converted_patient_id': 'p-new', 'activities': <Object?>[]},
          'patient': {...patientJson(id: 'p-new'), 'full_name': 'Grace Adaeze Okoro'},
        },
      ),
      'GET /agent-portal/patients/p-new': (_) => {...patientJson(id: 'p-new'), 'full_name': 'Grace Adaeze Okoro'},
    });
    await pumpPortal(
      tester,
      routes: agentPortalRoutes(),
      initialLocation: AgentRoutes.convertLead('l-1'),
      user: agentUser,
      adapter: api,
    );

    expect(find.text('Grace Adaeze'), findsOneWidget); // first name
    expect(find.text('Okoro'), findsOneWidget); // last name
    final form = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.byKey(const ValueKey('consent-attest')), 200, scrollable: form);
    await tester.tap(find.byKey(const ValueKey('consent-attest')));
    await tester.scrollUntilVisible(find.byKey(const ValueKey('patient-save')), 200, scrollable: form);
    await tester.tap(find.byKey(const ValueKey('patient-save')));
    await tester.pumpAndSettle();

    expect(bodyOf(api.last('POST', '/agent-portal/leads/l-1/convert')), {
      'first_name': 'Grace Adaeze',
      'last_name': 'Okoro',
      'nationality': 'NG',
      'email': 'grace@example.com',
      'phone': '+2348000000',
      'consent_attested': true,
      'consent_kinds': ['terms', 'privacy', 'share_with_hospitals'],
      'consent_method': 'in_person',
    });
  });
}
