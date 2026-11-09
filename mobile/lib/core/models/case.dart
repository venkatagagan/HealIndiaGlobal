import 'booking.dart';
import 'document.dart';
import 'enums.dart';
import 'json.dart';
import 'quote.dart';
import 'refs.dart';
import 'screening.dart';

/// `patient{id, full_name, nationality, gender, age}` of a case.
class CasePatient {
  const CasePatient({required this.id, required this.fullName, this.nationality, this.gender, this.age});

  factory CasePatient.fromJson(JsonMap j) => CasePatient(
    id: jStr(j, 'id'),
    fullName: jStr(j, 'full_name'),
    nationality: jStrOrNull(j, 'nationality'),
    gender: Gender.fromJsonOrNull(j['gender']),
    age: jIntOrNull(j, 'age'),
  );

  final String id;
  final String fullName;
  final String? nationality;
  final Gender? gender;
  final int? age;

  Map<String, dynamic> toJson() => {
    'id': id,
    'full_name': fullName,
    'nationality': nationality,
    'gender': gender?.json,
    'age': age,
  };
}

/// `agent{id, agency_name}` of a case.
class CaseAgent {
  const CaseAgent({required this.id, required this.agencyName});

  factory CaseAgent.fromJson(JsonMap j) => CaseAgent(id: jStr(j, 'id'), agencyName: jStr(j, 'agency_name'));

  final String id;
  final String agencyName;

  Map<String, dynamic> toJson() => {'id': id, 'agency_name': agencyName};
}

/// `CaseOut` (PLAN §8.7). Named `MedicalCase` because `case` is a Dart keyword.
class MedicalCase {
  const MedicalCase({
    required this.id,
    required this.caseNumber,
    required this.status,
    required this.hospital,
    this.patient,
    this.agent,
    this.doctor,
    this.procedure,
    this.specialty,
    this.screeningId,
    this.coordinator,
    this.patientNotes,
    this.latestQuote,
    this.booking,
    this.createdAt,
    this.updatedAt,
  });

  factory MedicalCase.fromJson(JsonMap j) => MedicalCase(
    id: jStr(j, 'id'),
    caseNumber: jStr(j, 'case_number'),
    status: CaseStatus.fromJson(j['status']),
    patient: jObj(j, 'patient', CasePatient.fromJson),
    agent: jObj(j, 'agent', CaseAgent.fromJson),
    hospital: HospitalRef.fromJson(jMap(j, 'hospital')),
    doctor: jObj(j, 'doctor', DoctorRef.fromJson),
    procedure: jObj(j, 'procedure', EntityRef.fromJson),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    screeningId: jStrOrNull(j, 'screening_id'),
    coordinator: jObj(j, 'coordinator', PersonRef.fromJson),
    patientNotes: jStrOrNull(j, 'patient_notes'),
    latestQuote: jObj(j, 'latest_quote', Quote.fromJson),
    booking: jObj(j, 'booking', Booking.fromJson),
    createdAt: jDate(j, 'created_at'),
    updatedAt: jDate(j, 'updated_at'),
  );

  final String id;
  final String caseNumber;
  final CaseStatus status;
  final CasePatient? patient;
  final CaseAgent? agent;
  final HospitalRef hospital;
  final DoctorRef? doctor;
  final EntityRef? procedure;
  final EntityRef? specialty;
  final String? screeningId;
  final PersonRef? coordinator;
  final String? patientNotes;
  final Quote? latestQuote;
  final Booking? booking;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Short title: procedure, specialty or hospital name.
  String get title => procedure?.name ?? specialty?.name ?? hospital.name;

  bool get isOpen => status != CaseStatus.completed && status != CaseStatus.cancelled && status != CaseStatus.declined;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_number': caseNumber,
    'status': status.json,
    'patient': patient?.toJson(),
    'agent': agent?.toJson(),
    'hospital': hospital.toJson(),
    'doctor': doctor?.toJson(),
    'procedure': procedure?.toJson(),
    'specialty': specialty?.toJson(),
    'screening_id': screeningId,
    'coordinator': coordinator?.toJson(),
    'patient_notes': patientNotes,
    'latest_quote': latestQuote?.toJson(),
    'booking': booking?.toJson(),
    'created_at': createdAt?.toUtc().toIso8601String(),
    'updated_at': updatedAt?.toUtc().toIso8601String(),
  };
}

/// `timeline[]` entry of a case.
class CaseTimelineEntry {
  const CaseTimelineEntry({required this.toStatus, this.fromStatus, this.note, this.changedByName, this.createdAt});

  factory CaseTimelineEntry.fromJson(JsonMap j) => CaseTimelineEntry(
    fromStatus: CaseStatus.fromJsonOrNull(j['from_status']),
    toStatus: CaseStatus.fromJson(j['to_status']),
    note: jStrOrNull(j, 'note'),
    changedByName: jStrOrNull(j, 'changed_by_name'),
    createdAt: jDate(j, 'created_at'),
  );

  final CaseStatus? fromStatus;
  final CaseStatus toStatus;
  final String? note;
  final String? changedByName;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'from_status': fromStatus?.json,
    'to_status': toStatus.json,
    'note': note,
    'changed_by_name': changedByName,
    'created_at': createdAt?.toUtc().toIso8601String(),
  };
}

/// `CaseDetail = CaseOut + {medical_summary, quotes, timeline, screening, documents}`.
class MedicalCaseDetail extends MedicalCase {
  const MedicalCaseDetail({
    required super.id,
    required super.caseNumber,
    required super.status,
    required super.hospital,
    super.patient,
    super.agent,
    super.doctor,
    super.procedure,
    super.specialty,
    super.screeningId,
    super.coordinator,
    super.patientNotes,
    super.latestQuote,
    super.booking,
    super.createdAt,
    super.updatedAt,
    this.medicalSummary,
    this.quotes = const [],
    this.timeline = const [],
    this.screening,
    this.documents = const [],
  });

  factory MedicalCaseDetail.fromJson(JsonMap j) {
    final c = MedicalCase.fromJson(j);
    return MedicalCaseDetail(
      id: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      hospital: c.hospital,
      patient: c.patient,
      agent: c.agent,
      doctor: c.doctor,
      procedure: c.procedure,
      specialty: c.specialty,
      screeningId: c.screeningId,
      coordinator: c.coordinator,
      patientNotes: c.patientNotes,
      latestQuote: c.latestQuote,
      booking: c.booking,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      medicalSummary: jStrOrNull(j, 'medical_summary'),
      quotes: jList(j, 'quotes', Quote.fromJson),
      timeline: jList(j, 'timeline', CaseTimelineEntry.fromJson),
      screening: jObj(j, 'screening', Screening.fromJson),
      documents: jList(j, 'documents', AppDocument.fromJson),
    );
  }

  final String? medicalSummary;
  final List<Quote> quotes;
  final List<CaseTimelineEntry> timeline;
  final Screening? screening;
  final List<AppDocument> documents;

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'medical_summary': medicalSummary,
    'quotes': quotes.map((q) => q.toJson()).toList(),
    'timeline': timeline.map((t) => t.toJson()).toList(),
    'screening': screening?.toJson(),
    'documents': documents.map((d) => d.toJson()).toList(),
  };
}
