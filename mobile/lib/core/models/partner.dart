import 'json.dart';

/// Kind of a partner listed in the catalog: an insurance product or a pay-later (financing) partner.
enum PartnerKind {
  insurance('insurance'),
  payLater('pay_later');

  const PartnerKind(this.json);

  final String json;

  static PartnerKind fromJson(Object? v) => v == 'pay_later' ? PartnerKind.payLater : PartnerKind.insurance;
}

/// Status of a quote request / eligibility check (`PartnerLeadStatus`).
enum PartnerLeadStatus {
  newRequest('new'),
  inProgress('in_progress'),
  sharedWithPartner('shared_with_partner'),
  closed('closed'),
  cancelled('cancelled');

  const PartnerLeadStatus(this.json);

  final String json;

  static PartnerLeadStatus fromJson(Object? v) =>
      PartnerLeadStatus.values.where((s) => s.json == v).firstOrNull ?? PartnerLeadStatus.newRequest;

  /// The patient may still withdraw the request (and the consent to share contact details).
  bool get isOpen => this != PartnerLeadStatus.closed && this != PartnerLeadStatus.cancelled;
}

/// How the partner should contact the patient.
enum PreferredContact {
  email('email'),
  phone('phone'),
  whatsapp('whatsapp');

  const PreferredContact(this.json);

  final String json;
}

/// `OfferingOut`: an insurance product (`GET /insurance/products`) or a pay-later partner
/// (`GET /financing/partners`). Listed for information only; the partner sets cover, price and terms.
class PartnerOffering {
  const PartnerOffering({
    required this.id,
    required this.kind,
    required this.providerName,
    required this.productName,
    this.category,
    this.summary = '',
    this.countries = const [],
    this.priceMinMinor,
    this.priceMaxMinor,
    this.currency,
    this.priceNote,
    this.websiteUrl,
    this.contactEmail,
    this.contactPhone,
    this.sort = 0,
  });

  factory PartnerOffering.fromJson(JsonMap j) => PartnerOffering(
    id: jStr(j, 'id'),
    kind: PartnerKind.fromJson(j['kind']),
    providerName: jStr(j, 'provider_name'),
    productName: jStr(j, 'product_name'),
    category: jStrOrNull(j, 'category'),
    summary: jStr(j, 'summary'),
    countries: jStrList(j, 'countries').map((c) => c.toUpperCase()).toList(growable: false),
    priceMinMinor: jIntOrNull(j, 'price_min_minor'),
    priceMaxMinor: jIntOrNull(j, 'price_max_minor'),
    currency: jStrOrNull(j, 'currency')?.toUpperCase(),
    priceNote: jStrOrNull(j, 'price_note'),
    websiteUrl: jStrOrNull(j, 'website_url'),
    contactEmail: jStrOrNull(j, 'contact_email'),
    contactPhone: jStrOrNull(j, 'contact_phone'),
    sort: jInt(j, 'sort'),
  );

  final String id;
  final PartnerKind kind;
  final String providerName;
  final String productName;

  /// Insurance: `medical_travel | complication | health | other`; free text for pay-later partners.
  final String? category;
  final String summary;

  /// ISO-2 codes of the countries the partner serves; empty = every country.
  final List<String> countries;
  final int? priceMinMinor;
  final int? priceMaxMinor;
  final String? currency;
  final String? priceNote;
  final String? websiteUrl;
  final String? contactEmail;
  final String? contactPhone;
  final int sort;

  bool get hasPrice => currency != null && (priceMinMinor != null || priceMaxMinor != null);

  /// Whether the partner serves [country] (unknown country = assume yes; the server checks again).
  bool servesCountry(String? country) =>
      countries.isEmpty || country == null || countries.contains(country.toUpperCase());
}

/// `LeadOut`: the patient's own insurance quote request or pay-later eligibility check.
class PartnerLead {
  const PartnerLead({
    required this.id,
    required this.kind,
    required this.providerName,
    required this.productName,
    required this.status,
    this.offeringId,
    this.caseId,
    this.bookingId,
    this.partnerWebsiteUrl,
    this.createdAt,
    this.updatedAt,
  });

  factory PartnerLead.fromJson(JsonMap j) => PartnerLead(
    id: jStr(j, 'id'),
    kind: PartnerKind.fromJson(j['kind']),
    offeringId: jStrOrNull(j, 'offering_id'),
    providerName: jStr(j, 'provider_name'),
    productName: jStr(j, 'product_name'),
    caseId: jStrOrNull(j, 'case_id'),
    bookingId: jStrOrNull(j, 'booking_id'),
    status: PartnerLeadStatus.fromJson(j['status']),
    partnerWebsiteUrl: jStrOrNull(j, 'partner_website_url'),
    createdAt: jDate(j, 'created_at'),
    updatedAt: jDate(j, 'updated_at'),
  );

  final String id;
  final PartnerKind kind;
  final String? offeringId;
  final String providerName;
  final String productName;
  final String? caseId;
  final String? bookingId;
  final PartnerLeadStatus status;

  /// Hand-off: the partner's own page, where it quotes / decides eligibility.
  final String? partnerWebsiteUrl;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

/// `LeadCreate` body for `POST /insurance/requests` (product) and `POST /financing/eligibility-checks`
/// (partner). [consentShareContact] must be true: it records the consent to pass the contact details to
/// that partner.
class PartnerLeadRequest {
  const PartnerLeadRequest({
    required this.offeringId,
    required this.contactName,
    required this.consentShareContact,
    this.caseId,
    this.bookingId,
    this.contactEmail,
    this.contactPhone,
    this.preferredContact,
    this.country,
    this.message,
  });

  /// Version of the consent text shown next to the checkbox.
  static const consentVersion = '2026-11-18';

  final String offeringId;
  final String? caseId;
  final String? bookingId;
  final String contactName;
  final String? contactEmail;
  final String? contactPhone;
  final PreferredContact? preferredContact;
  final String? country;
  final String? message;
  final bool consentShareContact;

  JsonMap toJson(PartnerKind kind) => compactJson({
    kind == PartnerKind.insurance ? 'product_id' : 'partner_id': offeringId,
    'case_id': caseId,
    'booking_id': bookingId,
    'contact_name': contactName.trim(),
    'contact_email': contactEmail?.trim(),
    'contact_phone': contactPhone?.trim(),
    'preferred_contact': preferredContact?.json,
    'country': country?.toUpperCase(),
    'message': message?.trim(),
    'consent_share_contact': consentShareContact,
    'consent_version': consentVersion,
  }, dropEmptyStrings: true);
}

/// One row of an instalment schedule.
class InstallmentRow {
  const InstallmentRow({required this.seq, required this.dueDate, required this.amountMinor});

  factory InstallmentRow.fromJson(JsonMap j) =>
      InstallmentRow(seq: jInt(j, 'seq'), dueDate: jDay(j, 'due_date'), amountMinor: jInt(j, 'amount_minor'));

  final int seq;
  final DateTime? dueDate;
  final int amountMinor;
}

/// `GET /financing/installment-plan` (CG-18): a platform instalment plan is an interest-free
/// pre-payment plan; the last instalment is due before the admission date. Longer terms only through a
/// pay-later partner, outside the platform.
class InstallmentPlan {
  const InstallmentPlan({
    required this.admissionDate,
    required this.maxMonths,
    this.today,
    this.lastDueBy,
    this.allowedMonths = const [],
    this.months,
    this.valid,
    this.schedule = const [],
    this.interestFree = true,
    this.partnerFinancingAvailable = false,
  });

  factory InstallmentPlan.fromJson(JsonMap j) {
    final allowed = j['allowed_months'] is List
        ? (j['allowed_months'] as List).map((v) => v is num ? v.toInt() : int.tryParse('$v')).whereType<int>().toList()
        : <int>[];
    allowed.sort();
    return InstallmentPlan(
      admissionDate: jDay(j, 'admission_date'),
      today: jDay(j, 'today'),
      lastDueBy: jDay(j, 'last_due_by'),
      maxMonths: jInt(j, 'max_months'),
      allowedMonths: List.unmodifiable(allowed),
      months: jIntOrNull(j, 'months'),
      valid: jBoolOrNull(j, 'valid'),
      schedule: jList(j, 'schedule', InstallmentRow.fromJson)..sort((a, b) => a.seq.compareTo(b.seq)),
      interestFree: jBool(j, 'interest_free', true),
      partnerFinancingAvailable: jBool(j, 'partner_financing_available'),
    );
  }

  final DateTime? admissionDate;
  final DateTime? today;

  /// The latest allowed due date (the day before admission).
  final DateTime? lastDueBy;

  /// 0 = no instalments possible for this admission date (pay the deposit or in full).
  final int maxMonths;
  final List<int> allowedMonths;
  final int? months;
  final bool? valid;
  final List<InstallmentRow> schedule;
  final bool interestFree;

  /// An active pay-later partner exists (for the patient's country when given).
  final bool partnerFinancingAvailable;

  bool get installmentsAvailable => maxMonths > 0 && allowedMonths.isNotEmpty;

  /// The allowed month count closest to [wanted] without going over it (else the smallest allowed).
  int? closestAllowed(int wanted) {
    if (allowedMonths.isEmpty) return null;
    if (allowedMonths.contains(wanted)) return wanted;
    final below = allowedMonths.where((m) => m <= wanted);
    return below.isEmpty ? allowedMonths.first : below.last;
  }
}
