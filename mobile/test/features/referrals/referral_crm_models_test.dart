import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/pending_referral.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/router/routes.dart';
import 'package:heal_india_global/features/agent_portal/agent_routes.dart';
import 'package:heal_india_global/features/agent_portal/data/crm_models.dart';
import 'package:heal_india_global/features/messages/logic/notification_routes.dart';

Map<String, Object?> leadJson({String id = 'l-1', String status = 'contacted', bool due = true}) => {
  'id': id,
  'full_name': 'Grace Adaeze Okoro',
  'country': 'NG',
  'email': 'grace@example.com',
  'phone': '+2348000000',
  'whatsapp': null,
  'preferred_language': 'en',
  'source': 'whatsapp',
  'source_detail': 'Lagos group',
  'interested_specialty_id': null,
  'interested_procedure_id': null,
  'interest': 'Knee replacement',
  'budget_minor': 800000,
  'budget_currency': 'USD',
  'status': status,
  'status_changed_at': '2026-11-10T09:00:00Z',
  'lost_reason': null,
  'next_follow_up_at': '2026-11-18T09:00:00Z',
  'follow_up_due': due,
  'last_activity_at': '2026-11-10T09:00:00Z',
  'owner_user_id': 'u-agent',
  'owner_name': 'Sam Okafor',
  'tags': ['vip'],
  'converted_patient_id': null,
  'converted_at': null,
  'created_at': '2026-11-01T09:00:00Z',
  'updated_at': '2026-11-10T09:00:00Z',
};

void main() {
  group('referral models', () {
    test('ReferralOverview parses code, rewards, credit and friends', () {
      final o = ReferralOverview.fromJson({
        'enabled': true,
        'code': 'R7KQ2MZP4X',
        'share_url': 'https://site.test/?ref=R7KQ2MZP4X',
        'patient_web_url': 'https://app.test/register?ref=R7KQ2MZP4X',
        'app_url': 'healindia://register?ref=R7KQ2MZP4X',
        'rewards': {
          'referrer': {'amount_minor': 5000, 'currency': 'USD'},
          'referee': null,
          'max_rewards_per_year': 10,
          'credit_validity_days': 365,
        },
        'credit': {
          'base_amount_minor': 415000,
          'base_currency': 'INR',
          'amount_minor': 5000,
          'currency': 'USD',
          'expiring_soon_minor': 2500,
          'next_expiry_at': '2026-12-01T00:00:00Z',
        },
        'counts': {'pending': 1, 'qualified': 0, 'rewarded': 1, 'void': 0},
        'referrals': [
          {
            'id': 'r-1',
            'friend_name': 'Jane D.',
            'status': 'rewarded',
            'created_at': '2026-10-01T00:00:00Z',
            'rewarded_at': '2026-11-01T00:00:00Z',
            'reward': {'amount_minor': 5000, 'currency': 'USD'},
          },
          {'id': 'r-2', 'friend_name': 'Ali K.', 'status': 'void', 'created_at': '2026-10-02T00:00:00Z'},
        ],
      });
      expect(o.enabled, isTrue);
      expect(o.code, 'R7KQ2MZP4X');
      expect(o.rewards.referrer?.amountMinor, 5000);
      expect(o.rewards.referee, isNull);
      expect(o.credit.amountMinor, 5000);
      expect(o.credit.baseAmountMinor, 415000);
      expect(o.credit.expiringSoonMinor, 2500);
      expect(o.credit.nextExpiryAt, isNotNull);
      expect(o.count(ReferralStatus.rewarded), 1);
      expect(o.referrals.map((r) => r.status), [ReferralStatus.rewarded, ReferralStatus.voided]);
      expect(o.referrals.first.reward?.currency, 'USD');
    });

    test('credits, preview and apply result', () {
      final c = CreditsOverview.fromJson({
        'balance': {'amount_minor': 5000, 'currency': 'USD', 'base_amount_minor': 415000, 'base_currency': 'INR'},
        'credits': [
          {
            'id': 'c-1',
            'kind': 'referee_reward',
            'status': 'active',
            'amount_minor': 207500,
            'remaining_minor': 207500,
            'currency': 'INR',
            'display_remaining_minor': 2500,
            'display_currency': 'USD',
            'expires_at': '2027-11-01T00:00:00Z',
          },
        ],
        'movements': [
          {
            'id': 'm-1',
            'credit_id': 'c-1',
            'kind': 'redeem',
            'amount_minor': -1000,
            'display_amount_minor': -12,
            'display_currency': 'USD',
          },
        ],
      });
      expect(c.credits.single.kind, CreditKind.refereeReward);
      expect(c.credits.single.displayRemainingMinor, 2500);
      expect(c.movements.single.kind, CreditMovementKind.redeem);
      expect(c.movements.single.isIncoming, isFalse);

      final p = CreditPreview.fromJson({
        'booking_id': 'b-1',
        'purpose': 'booking_deposit',
        'currency': 'USD',
        'due_minor': 100000,
        'available_minor': 5000,
        'available_base_minor': 415000,
        'base_currency': 'INR',
        'apply_minor': 5000,
        'remaining_due_minor': 95000,
        'applicable': true,
        'reason': null,
      });
      expect(p.purpose, PaymentPurpose.bookingDeposit);
      expect(p.applicable, isTrue);
      expect(p.coversAll, isFalse);
      expect(
        CreditPreview.fromJson({'applicable': false, 'reason': 'installments'}).reason,
        CreditUnavailableReason.installments,
      );

      final a = CreditApplyResult.fromJson({
        'order_id': 'o-1',
        'order_number': 'HIG-O-1',
        'payment_id': 'p-1',
        'applied_minor': 5000,
        'currency': 'USD',
        'applied_base_minor': 415000,
        'remaining_due_minor': 0,
        'credit': {'amount_minor': 0, 'currency': 'USD'},
      });
      expect(a.isPaidInFull, isTrue);
      expect(a.balance.amountMinor, 0);
    });

    test('platform_credit gateway and payment method', () {
      expect(PaymentGateway.fromJson('platform_credit'), PaymentGateway.platformCredit);
      expect(PaymentGateway.platformCredit.englishLabel, 'Referral credit');
      expect(PaymentMethod.fromJsonOrNull('platform_credit'), PaymentMethod.platformCredit);
      expect(PaymentMethod.platformCredit.englishLabel, 'Referral credit');
    });

    test('invite deep links yield a normalized code; other links are ignored', () {
      expect(referralCodeFromLink(Uri.parse('healindia://register?ref=r7kq2mzp4x')), 'R7KQ2MZP4X');
      expect(referralCodeFromLink(Uri.parse('/?ref=AGT12345')), 'AGT12345');
      expect(referralCodeFromLink(Uri.parse('/register?ref=R7K-Q2M')), 'R7KQ2M');
      expect(referralCodeFromLink(Uri.parse('healindia://register')), isNull);
      expect(referralCodeFromLink(Uri.parse('/home?ref=R7KQ2MZP4X')), isNull);
      expect(referralCodeFromLink(Uri.parse('healindia://pay?ref=R7KQ2MZP4X')), isNull);
      expect(normalizeReferralCode('<script>'), 'SCRIPT');
      expect(normalizeReferralCode('ab'), isNull);
      expect(normalizeReferralCode('A' * 30)!.length, 16);
      expect(Routes.registerWithReferral('R7KQ2MZP4X'), '/auth/register?ref=R7KQ2MZP4X');
    });
  });

  group('crm models', () {
    test('Lead parses with timeline; name split for the patient form', () {
      final l = Lead.fromJson({
        ...leadJson(),
        'activities': [
          {
            'id': 'a-1',
            'kind': 'status_change',
            'from_status': 'new',
            'to_status': 'contacted',
            'actor_name': 'Sam',
            'occurred_at': '2026-11-10T09:00:00Z',
            'created_at': '2026-11-10T09:00:00Z',
          },
        ],
      });
      expect(l.status, LeadStatus.contacted);
      expect(l.source, LeadSource.whatsapp);
      expect(l.followUpDue, isTrue);
      expect(l.tags, ['vip']);
      expect(l.isConverted, isFalse);
      expect(l.splitName, ('Grace Adaeze', 'Okoro'));
      expect(l.activities.single.fromStatus, LeadStatus.newLead);
      expect(l.activities.single.toStatus, LeadStatus.contacted);
      expect(LeadStatus.fromJson('new'), LeadStatus.newLead);
      expect(LeadStatus.won.isOpen, isFalse);
    });

    test('pipeline, filters and inputs', () {
      final p = LeadPipeline.fromJson({
        'total': 9,
        'open': 6,
        'stages': [
          {'status': 'new', 'count': 3},
          {'status': 'lost', 'count': 1},
        ],
        'sources': [
          {'source': 'walk_in', 'total': 4, 'won': 1, 'lost': 1, 'conversion_rate': 0.5},
        ],
        'won': 2,
        'lost': 1,
        'conversion_rate': 0.6667,
        'follow_ups_due_today': 4,
        'follow_ups_overdue': 1,
        'new_this_month': 5,
      });
      expect(p.countOf(LeadStatus.newLead), 3);
      expect(p.countOf(LeadStatus.won), 0);
      expect(p.followUpsDueToday, 4);
      expect(p.sources.single.conversionRate, 0.5);

      const f = LeadFilters(status: LeadStatus.qualified, followUp: LeadFollowUpFilter.due, q: 'grace');
      expect(f.toQuery(), {'status': 'qualified', 'source': null, 'follow_up': 'due', 'q': 'grace'});
      expect(f.toQuery(withStatus: false).containsKey('status'), isFalse);
      expect(f.copyWith(status: () => null).status, isNull);

      final body = const LeadInput(
        fullName: ' Grace ',
        country: 'ng',
        phone: '',
        source: LeadSource.event,
        budgetMinor: 500000,
        budgetCurrency: 'usd',
      ).toCreateJson();
      expect(body, {
        'full_name': 'Grace',
        'country': 'NG',
        'source': 'event',
        'budget_minor': 500000,
        'budget_currency': 'USD',
      });

      expect(const AgentConsentAttestation(shareWithHospitals: false, method: AgentConsentMethod.phone).toJson(), {
        'consent_attested': true,
        'consent_kinds': ['terms', 'privacy'],
        'consent_method': 'phone',
      });
    });

    test('lead and referral notification links open the right screens', () {
      expect(pushLinkRoute('/leads?follow_up=due', UserRole.agent), AgentRoutes.leadsFor(followUp: 'due'));
      expect(pushLinkRoute('/leads/l-9', UserRole.agent), AgentRoutes.lead('l-9'));
      expect(pushLinkRoute('/referrals', UserRole.patient), Routes.referrals);
      expect(
        notificationTarget(
          const AppNotification(id: 'n', kind: 'crm.follow_up_due', title: 't', data: {'link': '/leads/l-2'}),
        ),
        '/agent/leads/l-2',
      );
      expect(
        notificationTarget(const AppNotification(id: 'n', kind: 'referral.rewarded', title: 't')),
        Routes.referrals,
      );
    });
  });
}
