import 'case.dart';
import 'enums.dart';
import 'json.dart';
import 'quote.dart';
import 'refs.dart';

/// One hospital's enquiry inside a multi-hospital quote request.
class QuoteGroupCase {
  const QuoteGroupCase({
    required this.caseId,
    required this.caseNumber,
    required this.status,
    required this.hospital,
    this.doctor,
    this.quoteDueAt,
    this.quoteOverdue = false,
    this.hoursLeft,
    this.quote,
    this.totalInCurrencyMinor,
  });

  factory QuoteGroupCase.fromJson(JsonMap j) => QuoteGroupCase(
    caseId: jStr(j, 'case_id'),
    caseNumber: jStr(j, 'case_number'),
    status: CaseStatus.fromJson(j['status']),
    hospital: HospitalRef.fromJson(jMap(j, 'hospital')),
    doctor: jObj(j, 'doctor', DoctorRef.fromJson),
    quoteDueAt: jDate(j, 'quote_due_at'),
    quoteOverdue: jBool(j, 'quote_overdue'),
    hoursLeft: jDoubleOrNull(j, 'hours_left'),
    quote: jObj(j, 'quote', Quote.fromJson),
    totalInCurrencyMinor: jIntOrNull(j, 'total_in_currency_minor'),
  );

  final String caseId;
  final String caseNumber;
  final CaseStatus status;
  final HospitalRef hospital;
  final DoctorRef? doctor;
  final DateTime? quoteDueAt;
  final bool quoteOverdue;
  final double? hoursLeft;

  /// Latest quote (null while the hospital has not answered).
  final Quote? quote;

  /// [Quote.totalMinor] converted to the group's currency.
  final int? totalInCurrencyMinor;
}

/// `POST /cases/quote-request` / `GET /cases/quote-groups/{id}`: hospitals' quotes side by side.
class QuoteGroup {
  const QuoteGroup({
    required this.id,
    required this.currency,
    this.patient,
    this.procedure,
    this.specialty,
    this.createdAt,
    this.cases = const [],
    this.cheapestCaseId,
  });

  factory QuoteGroup.fromJson(JsonMap j) => QuoteGroup(
    id: jStr(j, 'quote_group_id'),
    currency: jStr(j, 'currency', 'INR'),
    patient: jObj(j, 'patient', CasePatient.fromJson),
    procedure: jObj(j, 'procedure', EntityRef.fromJson),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    createdAt: jDate(j, 'created_at'),
    cases: jList(j, 'cases', QuoteGroupCase.fromJson),
    cheapestCaseId: jStrOrNull(j, 'cheapest_case_id'),
  );

  final String id;

  /// Currency of [QuoteGroupCase.totalInCurrencyMinor] (the patient's preferred currency).
  final String currency;
  final CasePatient? patient;
  final EntityRef? procedure;
  final EntityRef? specialty;
  final DateTime? createdAt;
  final List<QuoteGroupCase> cases;
  final String? cheapestCaseId;

  String get title => procedure?.name ?? specialty?.name ?? '';

  /// Latest promised quote time across the hospitals still to answer.
  DateTime? get dueBy {
    DateTime? latest;
    for (final c in cases) {
      final d = c.quoteDueAt;
      if (c.quote == null && d != null && (latest == null || d.isAfter(latest))) latest = d;
    }
    return latest;
  }

  int get answered => cases.where((c) => c.quote != null).length;
}
