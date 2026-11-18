import 'document.dart';
import 'enums.dart';
import 'json.dart';

/// Status of a discharge summary version: `draft` (hospital only) or `final` (locked, shared with the
/// patient). Edits to a final summary create a new draft version.
enum DischargeStatus {
  draft('draft'),
  finalized('final');

  const DischargeStatus(this.json);

  final String json;

  static DischargeStatus fromJson(Object? v) => v?.toString() == 'final' ? finalized : draft;
}

/// A medicine on the discharge summary (`MedicationIn` / `MedicationOut`).
class DischargeMedication {
  const DischargeMedication({
    required this.name,
    this.dose,
    this.frequency,
    this.durationDays,
    this.route,
    this.instructions,
  });

  factory DischargeMedication.fromJson(JsonMap j) => DischargeMedication(
    name: jStr(j, 'name'),
    dose: jStrOrNull(j, 'dose'),
    frequency: jStrOrNull(j, 'frequency'),
    durationDays: jIntOrNull(j, 'duration_days'),
    route: jStrOrNull(j, 'route'),
    instructions: jStrOrNull(j, 'instructions'),
  );

  final String name;
  final String? dose;
  final String? frequency;

  /// Null = ongoing.
  final int? durationDays;

  /// e.g. oral, topical.
  final String? route;
  final String? instructions;

  Map<String, dynamic> toJson() => compactJson({
    'name': name.trim(),
    'dose': dose?.trim(),
    'frequency': frequency?.trim(),
    'duration_days': durationDays,
    'route': route?.trim(),
    'instructions': instructions?.trim(),
  }, dropEmptyStrings: true);
}

/// A document attached to a summary or available to attach (`AttachmentOut`).
class DischargeAttachment {
  const DischargeAttachment({
    required this.id,
    required this.fileName,
    this.contentType = 'application/octet-stream',
    this.sizeBytes = 0,
    this.kind = 'other',
  });

  factory DischargeAttachment.fromJson(JsonMap j) => DischargeAttachment(
    id: jStr(j, 'id'),
    fileName: jStr(j, 'file_name'),
    contentType: jStr(j, 'content_type', 'application/octet-stream'),
    sizeBytes: jInt(j, 'size_bytes'),
    kind: jStr(j, 'kind', 'other'),
  );

  final String id;
  final String fileName;
  final String contentType;
  final int sizeBytes;
  final String kind;

  /// As a document, to reuse the authorized open / download helpers.
  AppDocument toDocument() => AppDocument(
    id: id,
    kind: DocumentKind.fromJson(kind),
    fileName: fileName,
    contentType: contentType,
    sizeBytes: sizeBytes,
    status: DocumentStatus.uploaded,
  );
}

/// `DischargeSummaryOut`.
class DischargeSummary {
  const DischargeSummary({
    required this.id,
    required this.caseId,
    required this.patientId,
    required this.hospitalId,
    required this.version,
    required this.status,
    this.caseNumber,
    this.bookingId,
    this.bookingNumber,
    this.patientName,
    this.hospitalName,
    this.doctorId,
    this.doctorName,
    this.doctorRegistration,
    this.supersedesId,
    this.isLatest = true,
    this.admissionDate,
    this.dischargeDate,
    this.diagnosis,
    this.diagnosisCode,
    this.procedureName,
    this.procedureCode,
    this.procedureDate,
    this.hospitalCourse,
    this.medications = const [],
    this.followUpInstructions,
    this.redFlagSymptoms,
    this.allergies,
    this.investigationsSummary,
    this.attachments = const [],
    this.pdfDocumentId,
    this.finalizedAt,
    this.supersededAt,
    this.createdAt,
    this.updatedAt,
  });

  factory DischargeSummary.fromJson(JsonMap j) => DischargeSummary(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    caseNumber: jStrOrNull(j, 'case_number'),
    bookingId: jStrOrNull(j, 'booking_id'),
    bookingNumber: jStrOrNull(j, 'booking_number'),
    patientId: jStr(j, 'patient_id'),
    patientName: jStrOrNull(j, 'patient_name'),
    hospitalId: jStr(j, 'hospital_id'),
    hospitalName: jStrOrNull(j, 'hospital_name'),
    doctorId: jStrOrNull(j, 'doctor_id'),
    doctorName: jStrOrNull(j, 'doctor_name'),
    doctorRegistration: jStrOrNull(j, 'doctor_registration'),
    version: jInt(j, 'version', 1),
    supersedesId: jStrOrNull(j, 'supersedes_id'),
    status: DischargeStatus.fromJson(j['status']),
    isLatest: jBool(j, 'is_latest', true),
    admissionDate: jDay(j, 'admission_date'),
    dischargeDate: jDay(j, 'discharge_date'),
    diagnosis: jStrOrNull(j, 'diagnosis'),
    diagnosisCode: jStrOrNull(j, 'diagnosis_code'),
    procedureName: jStrOrNull(j, 'procedure_name'),
    procedureCode: jStrOrNull(j, 'procedure_code'),
    procedureDate: jDay(j, 'procedure_date'),
    hospitalCourse: jStrOrNull(j, 'hospital_course'),
    medications: jList(j, 'medications', DischargeMedication.fromJson),
    followUpInstructions: jStrOrNull(j, 'follow_up_instructions'),
    redFlagSymptoms: jStrOrNull(j, 'red_flag_symptoms'),
    allergies: jStrOrNull(j, 'allergies'),
    investigationsSummary: jStrOrNull(j, 'investigations_summary'),
    attachments: jList(j, 'attachments', DischargeAttachment.fromJson),
    pdfDocumentId: jStrOrNull(j, 'pdf_document_id'),
    finalizedAt: jDate(j, 'finalized_at'),
    supersededAt: jDate(j, 'superseded_at'),
    createdAt: jDate(j, 'created_at'),
    updatedAt: jDate(j, 'updated_at'),
  );

  final String id;
  final String caseId;
  final String? caseNumber;
  final String? bookingId;
  final String? bookingNumber;
  final String patientId;
  final String? patientName;
  final String hospitalId;
  final String? hospitalName;
  final String? doctorId;
  final String? doctorName;
  final String? doctorRegistration;
  final int version;
  final String? supersedesId;
  final DischargeStatus status;

  /// False when a newer final version replaced this one.
  final bool isLatest;
  final DateTime? admissionDate;
  final DateTime? dischargeDate;
  final String? diagnosis;
  final String? diagnosisCode;
  final String? procedureName;
  final String? procedureCode;
  final DateTime? procedureDate;
  final String? hospitalCourse;
  final List<DischargeMedication> medications;
  final String? followUpInstructions;
  final String? redFlagSymptoms;
  final String? allergies;
  final String? investigationsSummary;
  final List<DischargeAttachment> attachments;
  final String? pdfDocumentId;
  final DateTime? finalizedAt;
  final DateTime? supersededAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool get isDraft => status == DischargeStatus.draft;
  bool get isFinal => status == DischargeStatus.finalized;

  /// Superseded by a newer version (read-only history).
  bool get isSuperseded => supersededAt != null || !isLatest;
}

/// `DischargeSummaryListItem`.
class DischargeSummaryListItem {
  const DischargeSummaryListItem({
    required this.id,
    required this.caseId,
    required this.version,
    required this.status,
    this.caseNumber,
    this.bookingId,
    this.patientName,
    this.hospitalName,
    this.isLatest = true,
    this.dischargeDate,
    this.pdfDocumentId,
    this.finalizedAt,
    this.updatedAt,
  });

  factory DischargeSummaryListItem.fromJson(JsonMap j) => DischargeSummaryListItem(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    caseNumber: jStrOrNull(j, 'case_number'),
    bookingId: jStrOrNull(j, 'booking_id'),
    patientName: jStrOrNull(j, 'patient_name'),
    hospitalName: jStrOrNull(j, 'hospital_name'),
    version: jInt(j, 'version', 1),
    status: DischargeStatus.fromJson(j['status']),
    isLatest: jBool(j, 'is_latest', true),
    dischargeDate: jDay(j, 'discharge_date'),
    pdfDocumentId: jStrOrNull(j, 'pdf_document_id'),
    finalizedAt: jDate(j, 'finalized_at'),
    updatedAt: jDate(j, 'updated_at'),
  );

  final String id;
  final String caseId;
  final String? caseNumber;
  final String? bookingId;
  final String? patientName;
  final String? hospitalName;
  final int version;
  final DischargeStatus status;
  final bool isLatest;
  final DateTime? dischargeDate;
  final String? pdfDocumentId;
  final DateTime? finalizedAt;
  final DateTime? updatedAt;

  bool get isDraft => status == DischargeStatus.draft;
}

/// `GET /discharge-summaries/prefill` — values to start a draft from (nothing is saved).
class DischargePrefill {
  const DischargePrefill({
    required this.caseId,
    this.bookingId,
    this.doctorId,
    this.doctorName,
    this.doctorRegistration,
    this.admissionDate,
    this.dischargeDate,
    this.procedureName,
    this.procedureDate,
    this.allergies,
    this.diagnosis,
    this.hospitalCourse,
    this.availableDocuments = const [],
  });

  factory DischargePrefill.fromJson(JsonMap j) => DischargePrefill(
    caseId: jStr(j, 'case_id'),
    bookingId: jStrOrNull(j, 'booking_id'),
    doctorId: jStrOrNull(j, 'doctor_id'),
    doctorName: jStrOrNull(j, 'doctor_name'),
    doctorRegistration: jStrOrNull(j, 'doctor_registration'),
    admissionDate: jDay(j, 'admission_date'),
    dischargeDate: jDay(j, 'discharge_date'),
    procedureName: jStrOrNull(j, 'procedure_name'),
    procedureDate: jDay(j, 'procedure_date'),
    allergies: jStrOrNull(j, 'allergies'),
    diagnosis: jStrOrNull(j, 'diagnosis'),
    hospitalCourse: jStrOrNull(j, 'hospital_course'),
    availableDocuments: jList(j, 'available_documents', DischargeAttachment.fromJson),
  );

  final String caseId;
  final String? bookingId;
  final String? doctorId;
  final String? doctorName;
  final String? doctorRegistration;
  final DateTime? admissionDate;
  final DateTime? dischargeDate;
  final String? procedureName;
  final DateTime? procedureDate;
  final String? allergies;
  final String? diagnosis;
  final String? hospitalCourse;

  /// Documents of the case the hospital may attach.
  final List<DischargeAttachment> availableDocuments;

  /// Body of `POST /discharge-summaries` that starts a draft from these values.
  Map<String, dynamic> toCreateJson() => compactJson({
    'case_id': caseId,
    'booking_id': bookingId,
    'doctor_id': doctorId,
    'doctor_name': doctorName,
    'doctor_registration': doctorRegistration,
    'admission_date': admissionDate == null ? null : toApiDate(admissionDate!),
    'discharge_date': dischargeDate == null ? null : toApiDate(dischargeDate!),
    'procedure_name': procedureName,
    'procedure_date': procedureDate == null ? null : toApiDate(procedureDate!),
    'allergies': allergies,
    'diagnosis': diagnosis,
    'hospital_course': hospitalCourse,
  }, dropEmptyStrings: true);
}

/// Editable fields of a draft (`PATCH /discharge-summaries/{id}`). Every field is sent so cleared
/// values are cleared on the server (empty text = null).
class DischargeDraft {
  const DischargeDraft({
    this.doctorId,
    this.doctorName,
    this.doctorRegistration,
    this.admissionDate,
    this.dischargeDate,
    this.diagnosis,
    this.diagnosisCode,
    this.procedureName,
    this.procedureCode,
    this.procedureDate,
    this.hospitalCourse,
    this.medications = const [],
    this.followUpInstructions,
    this.redFlagSymptoms,
    this.allergies,
    this.investigationsSummary,
    this.attachmentDocumentIds = const [],
    this.registrationFromDoctor = false,
  });

  final String? doctorId;
  final String? doctorName;
  final String? doctorRegistration;
  final DateTime? admissionDate;
  final DateTime? dischargeDate;
  final String? diagnosis;
  final String? diagnosisCode;
  final String? procedureName;
  final String? procedureCode;
  final DateTime? procedureDate;
  final String? hospitalCourse;
  final List<DischargeMedication> medications;
  final String? followUpInstructions;
  final String? redFlagSymptoms;
  final String? allergies;
  final String? investigationsSummary;
  final List<String> attachmentDocumentIds;

  /// The doctor was just picked from the hospital's list: an empty registration is left out so the server
  /// fills it from the doctor's profile.
  final bool registrationFromDoctor;

  static String? _text(String? v) {
    final t = v?.trim();
    return t == null || t.isEmpty ? null : t;
  }

  static String? _day(DateTime? d) => d == null ? null : toApiDate(d);

  Map<String, dynamic> toJson() => {
    'doctor_id': doctorId,
    'doctor_name': _text(doctorName),
    if (!registrationFromDoctor || _text(doctorRegistration) != null) 'doctor_registration': _text(doctorRegistration),
    'admission_date': _day(admissionDate),
    'discharge_date': _day(dischargeDate),
    'diagnosis': _text(diagnosis),
    'diagnosis_code': _text(diagnosisCode),
    'procedure_name': _text(procedureName),
    'procedure_code': _text(procedureCode),
    'procedure_date': _day(procedureDate),
    'hospital_course': _text(hospitalCourse),
    'medications': [for (final m in medications) m.toJson()],
    'follow_up_instructions': _text(followUpInstructions),
    'red_flag_symptoms': _text(redFlagSymptoms),
    'allergies': _text(allergies),
    'investigations_summary': _text(investigationsSummary),
    'attachment_document_ids': attachmentDocumentIds,
  };
}

/// A home-doctor share link (`ShareOut`; [url] only right after creating it).
class DischargeShare {
  const DischargeShare({
    required this.id,
    required this.dischargeSummaryId,
    required this.doctorEmailMasked,
    required this.language,
    this.doctorName,
    this.documentIds = const [],
    this.expiresAt,
    this.revokedAt,
    this.viewCount = 0,
    this.lastViewedAt,
    this.createdAt,
    this.active = false,
    this.url,
  });

  factory DischargeShare.fromJson(JsonMap j) => DischargeShare(
    id: jStr(j, 'id'),
    dischargeSummaryId: jStr(j, 'discharge_summary_id'),
    doctorEmailMasked: jStr(j, 'doctor_email_masked'),
    doctorName: jStrOrNull(j, 'doctor_name'),
    documentIds: jStrList(j, 'document_ids'),
    language: jStr(j, 'language', 'en'),
    expiresAt: jDate(j, 'expires_at'),
    revokedAt: jDate(j, 'revoked_at'),
    viewCount: jInt(j, 'view_count'),
    lastViewedAt: jDate(j, 'last_viewed_at'),
    createdAt: jDate(j, 'created_at'),
    active: jBool(j, 'active'),
    url: jStrOrNull(j, 'url'),
  );

  final String id;
  final String dischargeSummaryId;
  final String doctorEmailMasked;
  final String? doctorName;
  final List<String> documentIds;
  final String language;
  final DateTime? expiresAt;
  final DateTime? revokedAt;
  final int viewCount;
  final DateTime? lastViewedAt;
  final DateTime? createdAt;
  final bool active;

  /// The link itself, returned once by `POST .../shares` (only a hash is stored).
  final String? url;

  bool get isRevoked => revokedAt != null;
}

/// Body of `POST /discharge-summaries/{id}/shares`.
class DischargeShareRequest {
  const DischargeShareRequest({
    required this.doctorEmail,
    required this.consent,
    this.doctorName,
    this.documentIds = const [],
    this.expiresInDays = 14,
    this.language,
  });

  final String doctorEmail;
  final String? doctorName;
  final List<String> documentIds;
  final int expiresInDays;
  final String? language;
  final bool consent;

  Map<String, dynamic> toJson() => compactJson({
    'doctor_email': doctorEmail.trim(),
    'doctor_name': doctorName?.trim(),
    'document_ids': documentIds,
    'expires_in_days': expiresInDays,
    'language': language,
    'consent': consent,
  }, dropEmptyStrings: true);
}

/// One medicine's daily reminder (`MedicationReminderOut`).
class MedicationReminder {
  const MedicationReminder({
    required this.id,
    required this.dischargeSummaryId,
    required this.name,
    this.dose,
    this.frequency,
    this.startOn,
    this.endOn,
    this.enabled = false,
    this.remindHour = 9,
    this.timezone = 'UTC',
    this.lastSentOn,
  });

  factory MedicationReminder.fromJson(JsonMap j) => MedicationReminder(
    id: jStr(j, 'id'),
    dischargeSummaryId: jStr(j, 'discharge_summary_id'),
    name: jStr(j, 'name'),
    dose: jStrOrNull(j, 'dose'),
    frequency: jStrOrNull(j, 'frequency'),
    startOn: jDay(j, 'start_on'),
    endOn: jDay(j, 'end_on'),
    enabled: jBool(j, 'enabled'),
    remindHour: jInt(j, 'remind_hour', 9),
    timezone: jStr(j, 'timezone', 'UTC'),
    lastSentOn: jDay(j, 'last_sent_on'),
  );

  final String id;
  final String dischargeSummaryId;
  final String name;
  final String? dose;
  final String? frequency;
  final DateTime? startOn;

  /// Null = ongoing.
  final DateTime? endOn;
  final bool enabled;

  /// Local hour (0-23) of the daily reminder.
  final int remindHour;
  final String timezone;
  final DateTime? lastSentOn;
}

/// The device's UTC offset as the API expects it (`+05:30`, `-03:00`), or `UTC` when it is zero.
String utcOffsetString(Duration offset) {
  if (offset == Duration.zero) return 'UTC';
  final sign = offset.isNegative ? '-' : '+';
  final minutes = offset.inMinutes.abs();
  final h = (minutes ~/ 60).toString().padLeft(2, '0');
  final m = (minutes % 60).toString().padLeft(2, '0');
  return '$sign$h:$m';
}
