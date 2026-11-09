import '../../../core/models/models.dart';
import '../../../l10n/l10n.dart';

/// `monthly[]` point of `GET /hospital-portal/dashboard`.
class HospitalMonthPoint {
  const HospitalMonthPoint({required this.month, this.bookings = 0, this.revenueMinor = 0});

  factory HospitalMonthPoint.fromJson(JsonMap j) => HospitalMonthPoint(
    month: jStr(j, 'month'),
    bookings: jInt(j, 'bookings'),
    revenueMinor: jInt(j, 'revenue_minor'),
  );

  final String month;
  final int bookings;
  final int revenueMinor;
}

/// `GET /hospital-portal/dashboard` (PLAN §8.5).
class HospitalDashboard {
  const HospitalDashboard({
    required this.currency,
    this.enquiriesOpen = 0,
    this.quotesPending = 0,
    this.bookingsUpcoming = 0,
    this.patientsInTreatment = 0,
    this.revenueMonthMinor = 0,
    this.monthly = const [],
    this.recentCases = const [],
  });

  factory HospitalDashboard.fromJson(JsonMap j) => HospitalDashboard(
    currency: jStr(j, 'currency', 'INR'),
    enquiriesOpen: jInt(j, 'enquiries_open'),
    quotesPending: jInt(j, 'quotes_pending'),
    bookingsUpcoming: jInt(j, 'bookings_upcoming'),
    patientsInTreatment: jInt(j, 'patients_in_treatment'),
    revenueMonthMinor: jInt(j, 'revenue_month_minor'),
    monthly: jList(j, 'monthly', HospitalMonthPoint.fromJson),
    recentCases: jList(j, 'recent_cases', MedicalCase.fromJson),
  );

  final String currency;
  final int enquiriesOpen;
  final int quotesPending;
  final int bookingsUpcoming;
  final int patientsInTreatment;
  final int revenueMonthMinor;
  final List<HospitalMonthPoint> monthly;
  final List<MedicalCase> recentCases;
}

/// Listing status of the hospital (`GET /hospital-portal/profile`, subset).
class HospitalListing {
  const HospitalListing({required this.id, required this.name, required this.status, this.city});

  factory HospitalListing.fromJson(JsonMap j) => HospitalListing(
    id: jStr(j, 'id'),
    name: jStr(j, 'name'),
    status: HospitalStatus.fromJson(j['status']),
    city: jStrOrNull(j, 'city'),
  );

  final String id;
  final String name;
  final HospitalStatus status;
  final String? city;
}

/// `VisaRequestOut` as seen by the hospital (with case number and patient).
class HospitalVisaRequest {
  const HospitalVisaRequest({
    required this.id,
    required this.caseId,
    required this.visaType,
    required this.status,
    this.caseNumber,
    this.patientName,
    this.invitationLetterDocumentId,
    this.applicationReference,
    this.notes,
    this.createdAt,
  });

  factory HospitalVisaRequest.fromJson(JsonMap j) => HospitalVisaRequest(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    visaType: VisaType.fromJson(j['visa_type']),
    status: VisaStatus.fromJson(j['status']),
    caseNumber: jStrOrNull(j, 'case_number'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    invitationLetterDocumentId: jStrOrNull(j, 'invitation_letter_document_id'),
    applicationReference: jStrOrNull(j, 'application_reference'),
    notes: jStrOrNull(j, 'notes'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String caseId;
  final VisaType visaType;
  final VisaStatus status;
  final String? caseNumber;
  final String? patientName;
  final String? invitationLetterDocumentId;
  final String? applicationReference;
  final String? notes;
  final DateTime? createdAt;

  bool get needsInvitation =>
      invitationLetterDocumentId == null && (status == VisaStatus.notStarted || status == VisaStatus.documentsPending);
}

/// Editable line of the quote builder.
class QuoteLineDraft {
  QuoteLineDraft({this.category = QuoteLineCategory.surgery, this.description = '', this.amountMinor = 0});

  QuoteLineCategory category;
  String description;
  int amountMinor;

  bool get isValid => description.trim().isNotEmpty && amountMinor >= 0;

  JsonMap toJson() => {'category': category.json, 'description': description.trim(), 'amount_minor': amountMinor};
}

/// Body of `POST /cases/{id}/quotes` (PLAN §8.7).
class QuoteDraft {
  QuoteDraft({
    required this.treatmentPlan,
    required this.lines,
    required this.currency,
    required this.validUntil,
    this.estimatedStayDays,
  });

  final String treatmentPlan;
  final List<QuoteLineDraft> lines;
  final String currency;
  final DateTime validUntil;
  final int? estimatedStayDays;

  int get totalMinor => lines.fold(0, (sum, l) => sum + l.amountMinor);

  /// Validation message in the current language, or null when the quote can be sent.
  String? get problem => problemIn(L10n.current);

  /// Validation message in [l], or null when the quote can be sent.
  String? problemIn(AppLocalizations l) {
    if (treatmentPlan.trim().isEmpty) return l.hpQuoteProblemPlan;
    if (lines.isEmpty) return l.hpQuoteProblemNoLines;
    if (lines.any((x) => !x.isValid)) return l.hpQuoteProblemIncompleteLine;
    if (lines.length > 50) return l.hpQuoteProblemTooManyLines;
    return null;
  }

  JsonMap toJson() => compactJson({
    'treatment_plan': treatmentPlan.trim(),
    'line_items': [for (final l in lines) l.toJson()],
    'currency': currency,
    'estimated_stay_days': estimatedStayDays,
    'valid_until': toApiDate(validUntil),
  });
}

/// Body of `POST /bookings/{id}/itinerary`.
class ItineraryDraft {
  const ItineraryDraft({required this.kind, required this.title, this.startsAt, this.location, this.description});

  final ItineraryKind kind;
  final String title;
  final DateTime? startsAt;
  final String? location;
  final String? description;

  JsonMap toJson() => compactJson({
    'kind': kind.json,
    'title': title.trim(),
    'starts_at': startsAt?.toUtc().toIso8601String(),
    'location': location?.trim(),
    'description': description?.trim(),
  }, dropEmptyStrings: true);
}
