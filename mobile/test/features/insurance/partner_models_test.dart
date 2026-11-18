import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/network/api_exception.dart';
import 'package:heal_india_global/l10n/l10n.dart';

void main() {
  setUp(() => L10n.setCurrent(OverridableLocalizations(lookupAppLocalizations(const Locale('en')))));

  test('OfferingOut parses (countries upper-cased, price range, kind)', () {
    final o = PartnerOffering.fromJson({
      'id': 'o1',
      'kind': 'insurance',
      'provider_name': 'SafeTravel',
      'product_name': 'Medical Trip Cover',
      'category': 'medical_travel',
      'summary': 'Covers complications abroad.',
      'countries': ['ng', 'GH'],
      'price_min_minor': 4000,
      'price_max_minor': 12000,
      'currency': 'usd',
      'price_note': 'per trip',
      'website_url': 'https://safetravel.example',
      'contact_email': null,
      'contact_phone': null,
      'is_active': true,
      'sort': 2,
      'created_at': '2026-11-18T10:00:00Z',
      'updated_at': '2026-11-18T10:00:00Z',
    });
    expect(o.kind, PartnerKind.insurance);
    expect(o.countries, ['NG', 'GH']);
    expect(o.currency, 'USD');
    expect(o.hasPrice, isTrue);
    expect(o.servesCountry('ng'), isTrue);
    expect(o.servesCountry('US'), isFalse);
    expect(o.servesCountry(null), isTrue);

    final p = PartnerOffering.fromJson({
      'id': 'p1',
      'kind': 'pay_later',
      'provider_name': 'EasyPay',
      'product_name': 'Loan',
    });
    expect(p.kind, PartnerKind.payLater);
    expect(p.countries, isEmpty);
    expect(p.servesCountry('US'), isTrue);
    expect(p.hasPrice, isFalse);
  });

  test('LeadOut parses status and hand-off link; open statuses can be withdrawn', () {
    final l = PartnerLead.fromJson({
      'id': 'l1',
      'kind': 'pay_later',
      'offering_id': 'p1',
      'provider_name': 'EasyPay',
      'product_name': 'Loan',
      'case_id': 'c1',
      'booking_id': null,
      'status': 'shared_with_partner',
      'partner_website_url': 'https://easypay.example/apply',
      'created_at': '2026-11-18T10:00:00Z',
      'updated_at': '2026-11-18T11:00:00Z',
    });
    expect(l.kind, PartnerKind.payLater);
    expect(l.status, PartnerLeadStatus.sharedWithPartner);
    expect(l.status.isOpen, isTrue);
    expect(l.partnerWebsiteUrl, 'https://easypay.example/apply');
    expect(PartnerLeadStatus.fromJson('cancelled').isOpen, isFalse);
    expect(PartnerLeadStatus.fromJson('closed').isOpen, isFalse);
    expect(PartnerLeadStatus.fromJson('new'), PartnerLeadStatus.newRequest);
  });

  test('LeadCreate uses product_id or partner_id and drops empty fields', () {
    const r = PartnerLeadRequest(
      offeringId: 'o1',
      contactName: ' Amina ',
      contactEmail: 'amina@example.com',
      contactPhone: '',
      preferredContact: PreferredContact.whatsapp,
      country: 'ng',
      message: '',
      consentShareContact: true,
      caseId: 'c1',
    );
    expect(r.toJson(PartnerKind.insurance), {
      'product_id': 'o1',
      'case_id': 'c1',
      'contact_name': 'Amina',
      'contact_email': 'amina@example.com',
      'preferred_contact': 'whatsapp',
      'country': 'NG',
      'consent_share_contact': true,
      'consent_version': '2026-11-18',
    });
    final pay = r.toJson(PartnerKind.payLater);
    expect(pay['partner_id'], 'o1');
    expect(pay.containsKey('product_id'), isFalse);
  });

  test('InstallmentPlanOut parses; closestAllowed never exceeds the wanted months', () {
    final plan = InstallmentPlan.fromJson({
      'admission_date': '2027-03-01',
      'today': '2026-11-18',
      'last_due_by': '2027-02-28',
      'max_months': 3,
      'allowed_months': [3, 1, 2],
      'months': 3,
      'valid': true,
      'schedule': [
        {'seq': 2, 'due_date': '2026-12-18', 'amount_minor': 1000},
        {'seq': 1, 'due_date': '2026-11-18', 'amount_minor': 1000},
        {'seq': 3, 'due_date': '2027-01-18', 'amount_minor': 1000},
      ],
      'interest_free': true,
      'partner_financing_available': true,
    });
    expect(plan.admissionDate, DateTime(2027, 3, 1));
    expect(plan.lastDueBy, DateTime(2027, 2, 28));
    expect(plan.allowedMonths, [1, 2, 3]);
    expect(plan.schedule.map((r) => r.seq), [1, 2, 3]);
    expect(plan.schedule.first.dueDate, DateTime(2026, 11, 18));
    expect(plan.installmentsAvailable, isTrue);
    expect(plan.partnerFinancingAvailable, isTrue);
    expect(plan.closestAllowed(6), 3);
    expect(plan.closestAllowed(2), 2);
    expect(plan.closestAllowed(0), 1);

    final none = InstallmentPlan.fromJson({'admission_date': '2026-11-25', 'max_months': 0, 'allowed_months': []});
    expect(none.installmentsAvailable, isFalse);
    expect(none.closestAllowed(6), isNull);
    expect(none.partnerFinancingAvailable, isFalse);
  });

  test('installments_past_treatment gets our own translated message', () {
    final e = ApiException.fromResponse(400, {
      'error': {
        'code': 'installments_past_treatment',
        'message': 'server text',
        'details': {'max_months': 2, 'last_due_by': '2027-01-01'},
      },
    });
    expect(e.isInstallmentsPastTreatment, isTrue);
    expect(e.message, startsWith('Instalments must be paid in full before your admission date'));
  });
}
