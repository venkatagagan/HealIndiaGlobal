import '../../../core/models/enums.dart';
import '../../../core/models/json.dart';

/// `document_analyses.status` (PLAN §7.1).
enum AnalysisStatus with JsonEnum {
  queued('queued'),
  processing('processing'),
  completed('completed'),
  failed('failed'),
  unsupported('unsupported');

  const AnalysisStatus(this.json);

  @override
  final String json;

  bool get isPending => this == queued || this == processing;

  static AnalysisStatus fromJson(Object? raw) => enumFromJson(values, raw, AnalysisStatus.queued);
}

/// `document_analyses.review_status`: the AI output is a draft until the patient confirms it.
enum AnalysisReviewStatus with JsonEnum {
  pendingReview('pending_review'),
  confirmed('confirmed'),
  rejected('rejected');

  const AnalysisReviewStatus(this.json);

  @override
  final String json;

  static AnalysisReviewStatus fromJson(Object? raw) => enumFromJson(values, raw, AnalysisReviewStatus.pendingReview);
}

/// `document_analyses.doc_type`.
enum ReportDocType with JsonEnum {
  labReport('lab_report', 'Lab report'),
  imagingReport('imaging_report', 'Imaging report'),
  dischargeSummary('discharge_summary', 'Discharge summary'),
  prescription('prescription', 'Prescription'),
  consultationNote('consultation_note', 'Consultation note'),
  pathologyReport('pathology_report', 'Pathology report'),
  insuranceDocument('insurance_document', 'Insurance document'),
  other('other', 'Other');

  const ReportDocType(this.json, this.label);

  @override
  final String json;

  @override
  final String label;

  static ReportDocType? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `key_findings[].significance`.
enum FindingSignificance with JsonEnum {
  normal('normal'),
  attention('attention'),
  urgent('urgent');

  const FindingSignificance(this.json);

  @override
  final String json;

  static FindingSignificance fromJson(Object? raw) => enumFromJson(values, raw, FindingSignificance.attention);
}

/// `lab_values[].flag`.
enum LabFlag with JsonEnum {
  low('low'),
  high('high'),
  normal('normal'),
  critical('critical'),
  unknown('unknown');

  const LabFlag(this.json);

  @override
  final String json;

  static LabFlag fromJson(Object? raw) => enumFromJson(values, raw, LabFlag.unknown);
}

class KeyFinding {
  const KeyFinding({required this.finding, this.significance = FindingSignificance.attention});

  factory KeyFinding.fromJson(JsonMap j) =>
      KeyFinding(finding: jStr(j, 'finding'), significance: FindingSignificance.fromJson(j['significance']));

  final String finding;
  final FindingSignificance significance;

  KeyFinding copyWith({String? finding, FindingSignificance? significance}) =>
      KeyFinding(finding: finding ?? this.finding, significance: significance ?? this.significance);

  Map<String, dynamic> toJson() => {'finding': finding, 'significance': significance.json};

  @override
  bool operator ==(Object other) =>
      other is KeyFinding && other.finding == finding && other.significance == significance;

  @override
  int get hashCode => Object.hash(finding, significance);
}

class LabValue {
  const LabValue({
    required this.test,
    this.value = '',
    this.unit = '',
    this.referenceRange = '',
    this.flag = LabFlag.unknown,
  });

  factory LabValue.fromJson(JsonMap j) => LabValue(
    test: jStr(j, 'test'),
    value: j['value'] == null ? '' : '${j['value']}',
    unit: jStr(j, 'unit'),
    referenceRange: jStr(j, 'reference_range'),
    flag: LabFlag.fromJson(j['flag']),
  );

  final String test;
  final String value;
  final String unit;
  final String referenceRange;
  final LabFlag flag;

  LabValue copyWith({String? test, String? value, String? unit, String? referenceRange, LabFlag? flag}) => LabValue(
    test: test ?? this.test,
    value: value ?? this.value,
    unit: unit ?? this.unit,
    referenceRange: referenceRange ?? this.referenceRange,
    flag: flag ?? this.flag,
  );

  Map<String, dynamic> toJson() => {
    'test': test,
    'value': value,
    'unit': unit,
    'reference_range': referenceRange,
    'flag': flag.json,
  };

  @override
  bool operator ==(Object other) =>
      other is LabValue &&
      other.test == test &&
      other.value == value &&
      other.unit == unit &&
      other.referenceRange == referenceRange &&
      other.flag == flag;

  @override
  int get hashCode => Object.hash(test, value, unit, referenceRange, flag);
}

class ReportMedication {
  const ReportMedication({required this.name, this.dose = '', this.frequency = ''});

  factory ReportMedication.fromJson(JsonMap j) =>
      ReportMedication(name: jStr(j, 'name'), dose: jStr(j, 'dose'), frequency: jStr(j, 'frequency'));

  final String name;
  final String dose;
  final String frequency;

  ReportMedication copyWith({String? name, String? dose, String? frequency}) =>
      ReportMedication(name: name ?? this.name, dose: dose ?? this.dose, frequency: frequency ?? this.frequency);

  Map<String, dynamic> toJson() => {'name': name, 'dose': dose, 'frequency': frequency};

  @override
  bool operator ==(Object other) =>
      other is ReportMedication && other.name == name && other.dose == dose && other.frequency == frequency;

  @override
  int get hashCode => Object.hash(name, dose, frequency);
}

/// `quality{legible, issues[], pages_analyzed}`.
class AnalysisQuality {
  const AnalysisQuality({this.legible = true, this.issues = const [], this.pagesAnalyzed});

  factory AnalysisQuality.fromJson(JsonMap j) => AnalysisQuality(
    legible: jBool(j, 'legible', true),
    issues: jStrList(j, 'issues'),
    pagesAnalyzed: jIntOrNull(j, 'pages_analyzed'),
  );

  final bool legible;
  final List<String> issues;
  final int? pagesAnalyzed;
}

/// The patient-editable part of an analysis (the `confirmed_data` / PATCH / confirm body).
class ReportData {
  const ReportData({
    this.docType,
    this.reportDate,
    this.facilityName = '',
    this.summaryPatient = '',
    this.keyFindings = const [],
    this.labValues = const [],
    this.diagnoses = const [],
    this.medications = const [],
    this.procedures = const [],
    this.recommendations = const [],
  });

  factory ReportData.fromJson(JsonMap j) => ReportData(
    docType: ReportDocType.fromJsonOrNull(j['doc_type']),
    reportDate: jDay(j, 'report_date'),
    facilityName: jStr(j, 'facility_name'),
    summaryPatient: jStr(j, 'summary_patient'),
    keyFindings: jList(j, 'key_findings', KeyFinding.fromJson),
    labValues: jList(j, 'lab_values', LabValue.fromJson),
    diagnoses: jStrList(j, 'diagnoses_mentioned'),
    medications: jList(j, 'medications', ReportMedication.fromJson),
    procedures: jStrList(j, 'procedures_mentioned'),
    recommendations: jStrList(j, 'recommendations'),
  );

  final ReportDocType? docType;
  final DateTime? reportDate;
  final String facilityName;
  final String summaryPatient;
  final List<KeyFinding> keyFindings;
  final List<LabValue> labValues;
  final List<String> diagnoses;
  final List<ReportMedication> medications;
  final List<String> procedures;
  final List<String> recommendations;

  ReportData copyWith({
    ReportDocType? docType,
    DateTime? reportDate,
    bool clearReportDate = false,
    String? facilityName,
    String? summaryPatient,
    List<KeyFinding>? keyFindings,
    List<LabValue>? labValues,
    List<String>? diagnoses,
    List<ReportMedication>? medications,
    List<String>? procedures,
    List<String>? recommendations,
  }) => ReportData(
    docType: docType ?? this.docType,
    reportDate: clearReportDate ? null : (reportDate ?? this.reportDate),
    facilityName: facilityName ?? this.facilityName,
    summaryPatient: summaryPatient ?? this.summaryPatient,
    keyFindings: keyFindings ?? this.keyFindings,
    labValues: labValues ?? this.labValues,
    diagnoses: diagnoses ?? this.diagnoses,
    medications: medications ?? this.medications,
    procedures: procedures ?? this.procedures,
    recommendations: recommendations ?? this.recommendations,
  );

  /// Drops empty rows / blank strings (what is sent on save / confirm).
  ReportData cleaned() {
    List<String> strs(List<String> l) => [
      for (final s in l)
        if (s.trim().isNotEmpty) s.trim(),
    ];
    return ReportData(
      docType: docType,
      reportDate: reportDate,
      facilityName: facilityName.trim(),
      summaryPatient: summaryPatient.trim(),
      keyFindings: [
        for (final f in keyFindings)
          if (f.finding.trim().isNotEmpty) f.copyWith(finding: f.finding.trim()),
      ],
      labValues: [
        for (final v in labValues)
          if (v.test.trim().isNotEmpty)
            v.copyWith(
              test: v.test.trim(),
              value: v.value.trim(),
              unit: v.unit.trim(),
              referenceRange: v.referenceRange.trim(),
            ),
      ],
      diagnoses: strs(diagnoses),
      medications: [
        for (final m in medications)
          if (m.name.trim().isNotEmpty)
            m.copyWith(name: m.name.trim(), dose: m.dose.trim(), frequency: m.frequency.trim()),
      ],
      procedures: strs(procedures),
      recommendations: strs(recommendations),
    );
  }

  Map<String, dynamic> toJson() => {
    'doc_type': docType?.json,
    'report_date': reportDate == null ? null : toApiDate(reportDate!),
    'facility_name': facilityName.isEmpty ? null : facilityName,
    'summary_patient': summaryPatient,
    'key_findings': [for (final f in keyFindings) f.toJson()],
    'lab_values': [for (final v in labValues) v.toJson()],
    'diagnoses_mentioned': diagnoses,
    'medications': [for (final m in medications) m.toJson()],
    'procedures_mentioned': procedures,
    'recommendations': recommendations,
  };

  /// Field names (wire keys) whose value differs from [other] — used for "edited" markers.
  Set<String> diffKeys(ReportData other) {
    final a = toJson();
    final b = other.toJson();
    return {
      for (final k in a.keys)
        if ('${a[k]}' != '${b[k]}') k,
    };
  }
}

/// `DocumentAnalysisOut` (PLAN §7.1).
class DocumentAnalysis {
  const DocumentAnalysis({
    required this.id,
    required this.status,
    this.documentIds = const [],
    this.primaryDocumentId,
    this.patientId,
    this.caseId,
    this.reviewStatus = AnalysisReviewStatus.pendingReview,
    this.data = const ReportData(),
    this.aiOutput,
    this.confirmedData,
    this.language,
    this.summaryClinical = '',
    this.redFlags = const [],
    this.quality = const AnalysisQuality(),
    this.suggestedSpecialties = const [],
    this.confidence,
    this.error,
    this.completedAt,
    this.confirmedAt,
    this.createdAt,
    this.serverEditedFields = const [],
    this.audience,
  });

  factory DocumentAnalysis.fromJson(JsonMap j) {
    final ai = asJsonMapOrNull(j['ai_output']);
    final confirmed = asJsonMapOrNull(j['confirmed_data']);
    return DocumentAnalysis(
      id: jStr(j, 'id'),
      status: AnalysisStatus.fromJson(j['status']),
      documentIds: jStrList(j, 'document_ids'),
      primaryDocumentId: jStrOrNull(j, 'primary_document_id'),
      patientId: jStrOrNull(j, 'patient_id'),
      caseId: jStrOrNull(j, 'case_id'),
      reviewStatus: AnalysisReviewStatus.fromJson(j['review_status']),
      data: ReportData.fromJson(j),
      aiOutput: ai == null ? null : ReportData.fromJson(ai),
      confirmedData: confirmed == null ? null : ReportData.fromJson(confirmed),
      language: jStrOrNull(j, 'language'),
      summaryClinical: jStr(j, 'summary_clinical'),
      redFlags: jStrList(j, 'red_flags'),
      quality: jObj(j, 'quality', AnalysisQuality.fromJson) ?? const AnalysisQuality(),
      suggestedSpecialties: jStrList(j, 'suggested_specialties'),
      confidence: jDoubleOrNull(j, 'confidence'),
      error: jStrOrNull(j, 'error'),
      completedAt: jDate(j, 'completed_at'),
      confirmedAt: jDate(j, 'confirmed_at'),
      createdAt: jDate(j, 'created_at'),
      serverEditedFields: jStrList(j, 'edited_fields'),
      audience: jStrOrNull(j, 'audience'),
    );
  }

  final String id;
  final AnalysisStatus status;
  final List<String> documentIds;
  final String? primaryDocumentId;
  final String? patientId;
  final String? caseId;
  final AnalysisReviewStatus reviewStatus;

  /// Current draft (top-level fields of the analysis; PATCHed edits are reflected here).
  final ReportData data;

  /// Immutable copy of what the AI returned.
  final ReportData? aiOutput;

  /// Patient-confirmed version (only this is used downstream).
  final ReportData? confirmedData;
  final String? language;
  final String summaryClinical;
  final List<String> redFlags;
  final AnalysisQuality quality;
  final List<String> suggestedSpecialties;
  final double? confidence;
  final String? error;
  final DateTime? completedAt;
  final DateTime? confirmedAt;
  final DateTime? createdAt;

  /// `edited_fields`: editable fields whose confirmed (or current) value differs from the AI output (server-computed;
  /// the only marker source for `clinical` viewers, who never receive `ai_output`).
  final List<String> serverEditedFields;

  /// `owner` (patient/agent/staff view incl. `ai_output`) or `clinical` (hospital view, confirmed data only).
  final String? audience;

  bool get isConfirmed => reviewStatus == AnalysisReviewStatus.confirmed;
  bool get isRejected => reviewStatus == AnalysisReviewStatus.rejected;

  /// What to display: the confirmed version when there is one, else the draft.
  ReportData get effective => confirmedData ?? data;

  /// Wire keys the patient changed compared with the AI output.
  Set<String> get editedKeys {
    final ai = aiOutput;
    return {...serverEditedFields, if (ai != null) ...effective.diffKeys(ai)};
  }

  bool get hasCriticalLab => effective.labValues.any((v) => v.flag == LabFlag.critical);
}
