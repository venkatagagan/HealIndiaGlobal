import 'json.dart';

/// One document / step of a visa checklist.
class VisaChecklistItem {
  const VisaChecklistItem({
    required this.itemKey,
    required this.title,
    this.id,
    this.description,
    this.required = true,
    this.sortOrder = 0,
  });

  factory VisaChecklistItem.fromJson(JsonMap j) => VisaChecklistItem(
    id: jStrOrNull(j, 'id'),
    itemKey: jStr(j, 'item_key'),
    title: jStr(j, 'title'),
    description: jStrOrNull(j, 'description'),
    required: jBool(j, 'required', true),
    sortOrder: jInt(j, 'sort_order'),
  );

  final String? id;
  final String itemKey;
  final String title;
  final String? description;
  final bool required;
  final int sortOrder;
}

/// `GET /travel/visa-guide?nationality=XX`: how a national gets a visa for treatment in India.
class VisaGuide {
  const VisaGuide({
    required this.nationality,
    required this.visaRoute,
    required this.visaType,
    this.countryName,
    this.attendantVisaType,
    this.maxAttendants = 2,
    this.typicalProcessingDays,
    this.notes,
    this.officialUrl,
    this.checklist = const [],
    this.isDefault = false,
    this.updatedAt,
  });

  factory VisaGuide.fromJson(JsonMap j) => VisaGuide(
    nationality: jStr(j, 'nationality'),
    countryName: jStrOrNull(j, 'country_name'),
    visaRoute: jStr(j, 'visa_route', 'regular_visa'),
    visaType: jStr(j, 'visa_type', 'medical'),
    attendantVisaType: jStrOrNull(j, 'attendant_visa_type'),
    maxAttendants: jInt(j, 'max_attendants', 2),
    typicalProcessingDays: jIntOrNull(j, 'typical_processing_days'),
    notes: jStrOrNull(j, 'notes'),
    officialUrl: jStrOrNull(j, 'official_url'),
    checklist: jList(j, 'checklist', VisaChecklistItem.fromJson)..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)),
    isDefault: jBool(j, 'is_default'),
    updatedAt: jDate(j, 'updated_at'),
  );

  final String nationality;
  final String? countryName;

  /// `e_visa | regular_visa | not_required`
  final String visaRoute;

  /// `e_medical | medical | not_required`
  final String visaType;
  final String? attendantVisaType;
  final int maxAttendants;
  final int? typicalProcessingDays;
  final String? notes;
  final String? officialUrl;
  final List<VisaChecklistItem> checklist;

  /// No rule for this nationality: the regular-visa fallback is shown.
  final bool isDefault;
  final DateTime? updatedAt;
}

/// Result of generating / approving a hospital invitation letter.
class InvitationLetterResult {
  const InvitationLetterResult({
    required this.visaRequestId,
    required this.visaStatus,
    this.draftDocumentId,
    this.documentId,
    this.generatedAt,
    this.approvedAt,
    this.missing = const [],
  });

  factory InvitationLetterResult.fromJson(JsonMap j) => InvitationLetterResult(
    visaRequestId: jStr(j, 'visa_request_id'),
    visaStatus: jStr(j, 'visa_status'),
    draftDocumentId: jStrOrNull(j, 'draft_document_id'),
    documentId: jStrOrNull(j, 'document_id'),
    generatedAt: jDate(j, 'generated_at'),
    approvedAt: jDate(j, 'approved_at'),
    missing: jStrList(j, 'missing'),
  );

  final String visaRequestId;
  final String visaStatus;

  /// Draft awaiting approval (download via the documents API).
  final String? draftDocumentId;

  /// The approved letter attached to the visa request.
  final String? documentId;
  final DateTime? generatedAt;
  final DateTime? approvedAt;

  /// Details the letter could not fill in (e.g. `passport_number`).
  final List<String> missing;
}

/// Optional fields of `POST .../invitation-letter/generate`.
class InvitationLetterDraft {
  const InvitationLetterDraft({
    this.estimatedArrivalDate,
    this.estimatedDurationDays,
    this.attendants = const [],
    this.contactName,
    this.contactPhone,
    this.contactEmail,
    this.notes,
  });

  final DateTime? estimatedArrivalDate;
  final int? estimatedDurationDays;

  /// `(fullName, relationship, passportNumber)`
  final List<({String fullName, String? relationship, String? passportNumber})> attendants;
  final String? contactName;
  final String? contactPhone;
  final String? contactEmail;
  final String? notes;

  Map<String, dynamic> toJson() => compactJson({
    'estimated_arrival_date': estimatedArrivalDate == null ? null : toApiDate(estimatedArrivalDate!),
    'estimated_duration_days': estimatedDurationDays,
    'attendants': attendants.isEmpty
        ? null
        : [
            for (final a in attendants)
              compactJson({
                'full_name': a.fullName,
                'relationship': a.relationship,
                'passport_number': a.passportNumber,
              }, dropEmptyStrings: true),
          ],
    'contact_name': contactName,
    'contact_phone': contactPhone,
    'contact_email': contactEmail,
    'notes': notes,
  }, dropEmptyStrings: true);
}
