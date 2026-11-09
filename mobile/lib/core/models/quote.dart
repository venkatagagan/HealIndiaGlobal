import 'enums.dart';
import 'json.dart';

/// `line_items[]` entry of a quote.
class QuoteLineItem {
  const QuoteLineItem({required this.category, required this.description, required this.amountMinor});

  factory QuoteLineItem.fromJson(JsonMap j) => QuoteLineItem(
    category: QuoteLineCategory.fromJson(j['category']),
    description: jStr(j, 'description'),
    amountMinor: jInt(j, 'amount_minor'),
  );

  final QuoteLineCategory category;
  final String description;
  final int amountMinor;

  Map<String, dynamic> toJson() => {'category': category.json, 'description': description, 'amount_minor': amountMinor};
}

/// `QuoteOut` (PLAN §8.7).
class Quote {
  const Quote({
    required this.id,
    required this.caseId,
    required this.status,
    required this.totalMinor,
    required this.currency,
    this.treatmentPlan,
    this.lineItems = const [],
    this.estimatedStayDays,
    this.validUntil,
    this.preparedByName,
    this.createdAt,
    this.acceptedAt,
  });

  factory Quote.fromJson(JsonMap j) => Quote(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    status: QuoteStatus.fromJson(j['status']),
    treatmentPlan: jStrOrNull(j, 'treatment_plan'),
    lineItems: jList(j, 'line_items', QuoteLineItem.fromJson),
    totalMinor: jInt(j, 'total_minor'),
    currency: jStr(j, 'currency', 'INR'),
    estimatedStayDays: jIntOrNull(j, 'estimated_stay_days'),
    validUntil: jDay(j, 'valid_until'),
    preparedByName: jStrOrNull(j, 'prepared_by_name'),
    createdAt: jDate(j, 'created_at'),
    acceptedAt: jDate(j, 'accepted_at'),
  );

  final String id;
  final String caseId;
  final QuoteStatus status;
  final String? treatmentPlan;
  final List<QuoteLineItem> lineItems;
  final int totalMinor;
  final String currency;
  final int? estimatedStayDays;
  final DateTime? validUntil;
  final String? preparedByName;
  final DateTime? createdAt;
  final DateTime? acceptedAt;

  /// A sent quote that has not expired can be accepted / rejected by the patient.
  bool get isActionable {
    if (status != QuoteStatus.sent) return false;
    final v = validUntil;
    if (v == null) return true;
    final today = DateTime.now();
    return !v.isBefore(DateTime(today.year, today.month, today.day));
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'status': status.json,
    'treatment_plan': treatmentPlan,
    'line_items': lineItems.map((l) => l.toJson()).toList(),
    'total_minor': totalMinor,
    'currency': currency,
    'estimated_stay_days': estimatedStayDays,
    'valid_until': validUntil == null ? null : toApiDate(validUntil!),
    'prepared_by_name': preparedByName,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'accepted_at': acceptedAt?.toUtc().toIso8601String(),
  };
}
