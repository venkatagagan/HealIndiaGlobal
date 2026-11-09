import 'enums.dart';
import 'json.dart';
import 'refs.dart';

/// `symptoms[]` entry: `{name, answer: yes|maybe|no}`.
class SymptomResponse {
  const SymptomResponse({required this.name, required this.answer});

  factory SymptomResponse.fromJson(JsonMap j) =>
      SymptomResponse(name: jStr(j, 'name'), answer: SymptomAnswer.fromJson(j['answer']));

  final String name;
  final SymptomAnswer answer;

  Map<String, dynamic> toJson() => {'name': name, 'answer': answer.json};
}

/// `severity{work, sleep, mobility}` with `SeverityLevel` values.
class ScreeningSeverity {
  const ScreeningSeverity({this.work, this.sleep, this.mobility});

  factory ScreeningSeverity.fromJson(JsonMap j) => ScreeningSeverity(
    work: SeverityLevel.fromJsonOrNull(j['work']),
    sleep: SeverityLevel.fromJsonOrNull(j['sleep']),
    mobility: SeverityLevel.fromJsonOrNull(j['mobility']),
  );

  final SeverityLevel? work;
  final SeverityLevel? sleep;
  final SeverityLevel? mobility;

  ScreeningSeverity copyWith({SeverityLevel? work, SeverityLevel? sleep, SeverityLevel? mobility}) =>
      ScreeningSeverity(work: work ?? this.work, sleep: sleep ?? this.sleep, mobility: mobility ?? this.mobility);

  Map<String, dynamic> toJson() => compactJson({'work': work?.json, 'sleep': sleep?.json, 'mobility': mobility?.json});
}

/// `preferences{}` of a screening (step 4).
class ScreeningPreferences {
  const ScreeningPreferences({
    this.languages = const [],
    this.doctorGender = DoctorGenderPref.noPreference,
    this.budgetMinMinor,
    this.budgetMaxMinor,
    this.budgetCurrency,
    this.travelWindowStart,
    this.travelWindowEnd,
    this.useAi = true,
  });

  factory ScreeningPreferences.fromJson(JsonMap j) => ScreeningPreferences(
    languages: jStrList(j, 'languages'),
    doctorGender: DoctorGenderPref.fromJson(j['doctor_gender']),
    budgetMinMinor: jIntOrNull(j, 'budget_min_minor'),
    budgetMaxMinor: jIntOrNull(j, 'budget_max_minor'),
    budgetCurrency: jStrOrNull(j, 'budget_currency'),
    travelWindowStart: jDay(j, 'travel_window_start'),
    travelWindowEnd: jDay(j, 'travel_window_end'),
    useAi: jBool(j, 'use_ai', true),
  );

  final List<String> languages;
  final DoctorGenderPref doctorGender;
  final int? budgetMinMinor;
  final int? budgetMaxMinor;
  final String? budgetCurrency;
  final DateTime? travelWindowStart;
  final DateTime? travelWindowEnd;
  final bool useAi;

  ScreeningPreferences copyWith({
    List<String>? languages,
    DoctorGenderPref? doctorGender,
    int? budgetMinMinor,
    int? budgetMaxMinor,
    String? budgetCurrency,
    DateTime? travelWindowStart,
    DateTime? travelWindowEnd,
    bool? useAi,
  }) => ScreeningPreferences(
    languages: languages ?? this.languages,
    doctorGender: doctorGender ?? this.doctorGender,
    budgetMinMinor: budgetMinMinor ?? this.budgetMinMinor,
    budgetMaxMinor: budgetMaxMinor ?? this.budgetMaxMinor,
    budgetCurrency: budgetCurrency ?? this.budgetCurrency,
    travelWindowStart: travelWindowStart ?? this.travelWindowStart,
    travelWindowEnd: travelWindowEnd ?? this.travelWindowEnd,
    useAi: useAi ?? this.useAi,
  );

  Map<String, dynamic> toJson() => compactJson({
    'languages': languages,
    'doctor_gender': doctorGender.json,
    'budget_min_minor': budgetMinMinor,
    'budget_max_minor': budgetMaxMinor,
    'budget_currency': budgetCurrency,
    'travel_window_start': travelWindowStart == null ? null : toApiDate(travelWindowStart!),
    'travel_window_end': travelWindowEnd == null ? null : toApiDate(travelWindowEnd!),
    'use_ai': useAi,
  });
}

/// `{slug, name, confidence(0-1), rationale}`.
class SuggestedSpecialty {
  const SuggestedSpecialty({required this.slug, required this.name, this.confidence = 0, this.rationale});

  factory SuggestedSpecialty.fromJson(JsonMap j) => SuggestedSpecialty(
    slug: jStr(j, 'slug'),
    name: jStr(j, 'name'),
    confidence: jDouble(j, 'confidence'),
    rationale: jStrOrNull(j, 'rationale'),
  );

  final String slug;
  final String name;
  final double confidence;
  final String? rationale;

  Map<String, dynamic> toJson() => {'slug': slug, 'name': name, 'confidence': confidence, 'rationale': rationale};
}

/// `{name, likelihood: low|medium|high, notes}`.
class PossibleCondition {
  const PossibleCondition({required this.name, this.likelihood = Likelihood.medium, this.notes});

  factory PossibleCondition.fromJson(JsonMap j) => PossibleCondition(
    name: jStr(j, 'name'),
    likelihood: Likelihood.fromJson(j['likelihood']),
    notes: jStrOrNull(j, 'notes'),
  );

  final String name;
  final Likelihood likelihood;
  final String? notes;

  Map<String, dynamic> toJson() => {'name': name, 'likelihood': likelihood.json, 'notes': notes};
}

/// `{slug, name, rationale}`.
class RecommendedProcedure {
  const RecommendedProcedure({required this.slug, required this.name, this.rationale});

  factory RecommendedProcedure.fromJson(JsonMap j) =>
      RecommendedProcedure(slug: jStr(j, 'slug'), name: jStr(j, 'name'), rationale: jStrOrNull(j, 'rationale'));

  final String slug;
  final String name;
  final String? rationale;

  Map<String, dynamic> toJson() => {'slug': slug, 'name': name, 'rationale': rationale};
}

/// `TriageResult` (PLAN §7) — AI or rules engine output. Not a diagnosis.
class TriageResult {
  const TriageResult({
    required this.summary,
    required this.urgency,
    this.suggestedSpecialties = const [],
    this.possibleConditions = const [],
    this.recommendedProcedures = const [],
    this.redFlags = const [],
    this.recommendedTests = const [],
    this.questionsForDoctor = const [],
    this.travelAdvice,
    this.disclaimer,
    this.engine = TriageEngine.rules,
  });

  factory TriageResult.fromJson(JsonMap j) => TriageResult(
    summary: jStr(j, 'summary'),
    suggestedSpecialties: jList(j, 'suggested_specialties', SuggestedSpecialty.fromJson),
    possibleConditions: jList(j, 'possible_conditions', PossibleCondition.fromJson),
    recommendedProcedures: jList(j, 'recommended_procedures', RecommendedProcedure.fromJson),
    urgency: Urgency.fromJson(j['urgency']),
    redFlags: jStrList(j, 'red_flags'),
    recommendedTests: jStrList(j, 'recommended_tests'),
    questionsForDoctor: jStrList(j, 'questions_for_doctor'),
    travelAdvice: jStrOrNull(j, 'travel_advice'),
    disclaimer: jStrOrNull(j, 'disclaimer'),
    engine: TriageEngine.fromJson(j['engine']),
  );

  final String summary;
  final List<SuggestedSpecialty> suggestedSpecialties;
  final List<PossibleCondition> possibleConditions;
  final List<RecommendedProcedure> recommendedProcedures;
  final Urgency urgency;
  final List<String> redFlags;
  final List<String> recommendedTests;
  final List<String> questionsForDoctor;
  final String? travelAdvice;
  final String? disclaimer;
  final TriageEngine engine;

  bool get isEmergency => urgency == Urgency.emergency;

  Map<String, dynamic> toJson() => {
    'summary': summary,
    'suggested_specialties': suggestedSpecialties.map((e) => e.toJson()).toList(),
    'possible_conditions': possibleConditions.map((e) => e.toJson()).toList(),
    'recommended_procedures': recommendedProcedures.map((e) => e.toJson()).toList(),
    'urgency': urgency.json,
    'red_flags': redFlags,
    'recommended_tests': recommendedTests,
    'questions_for_doctor': questionsForDoctor,
    'travel_advice': travelAdvice,
    'disclaimer': disclaimer,
    'engine': engine.json,
  };
}

/// `ScreeningOut` (PLAN §8.6).
class Screening {
  const Screening({
    required this.id,
    required this.status,
    this.patientId,
    this.specialty,
    this.bodyAreas = const [],
    this.painIntensity,
    this.symptoms = const [],
    this.durationValue,
    this.durationUnit,
    this.severity = const ScreeningSeverity(),
    this.previousTreatments = const [],
    this.notes,
    this.preferences = const ScreeningPreferences(),
    this.reportDocumentIds = const [],
    this.consentAi = false,
    this.homeCountry,
    this.aiResult,
    this.urgency,
    this.redFlags = const [],
    this.error,
    this.createdAt,
    this.submittedAt,
    this.completedAt,
  });

  factory Screening.fromJson(JsonMap j) => Screening(
    id: jStr(j, 'id'),
    status: ScreeningStatus.fromJson(j['status']),
    patientId: jStrOrNull(j, 'patient_id'),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    bodyAreas: jStrList(j, 'body_areas'),
    painIntensity: jIntOrNull(j, 'pain_intensity'),
    symptoms: jList(j, 'symptoms', SymptomResponse.fromJson),
    durationValue: jIntOrNull(j, 'duration_value'),
    durationUnit: DurationUnit.fromJsonOrNull(j['duration_unit']),
    severity: ScreeningSeverity.fromJson(jMap(j, 'severity')),
    previousTreatments: jStrList(j, 'previous_treatments'),
    notes: jStrOrNull(j, 'notes'),
    preferences: ScreeningPreferences.fromJson(jMap(j, 'preferences')),
    reportDocumentIds: jStrList(j, 'report_document_ids'),
    consentAi: jBool(j, 'consent_ai'),
    homeCountry: jStrOrNull(j, 'home_country'),
    aiResult: jObj(j, 'ai_result', TriageResult.fromJson),
    urgency: Urgency.fromJsonOrNull(j['urgency']),
    redFlags: jStrList(j, 'red_flags'),
    error: jStrOrNull(j, 'error'),
    createdAt: jDate(j, 'created_at'),
    submittedAt: jDate(j, 'submitted_at'),
    completedAt: jDate(j, 'completed_at'),
  );

  final String id;
  final ScreeningStatus status;
  final String? patientId;
  final EntityRef? specialty;
  final List<String> bodyAreas;

  /// 0-10
  final int? painIntensity;
  final List<SymptomResponse> symptoms;
  final int? durationValue;
  final DurationUnit? durationUnit;
  final ScreeningSeverity severity;

  /// `medication|physical_therapy|surgery|other` (see [PreviousTreatment]).
  final List<String> previousTreatments;
  final String? notes;
  final ScreeningPreferences preferences;
  final List<String> reportDocumentIds;
  final bool consentAi;
  final String? homeCountry;
  final TriageResult? aiResult;
  final Urgency? urgency;
  final List<String> redFlags;
  final String? error;
  final DateTime? createdAt;
  final DateTime? submittedAt;
  final DateTime? completedAt;

  bool get isDraft => status == ScreeningStatus.draft;
  bool get isProcessing => status == ScreeningStatus.processing;
  bool get isCompleted => status == ScreeningStatus.completed;
  bool get isFailed => status == ScreeningStatus.failed;

  Map<String, dynamic> toJson() => {
    'id': id,
    'status': status.json,
    'patient_id': patientId,
    'specialty': specialty?.toJson(),
    'body_areas': bodyAreas,
    'pain_intensity': painIntensity,
    'symptoms': symptoms.map((s) => s.toJson()).toList(),
    'duration_value': durationValue,
    'duration_unit': durationUnit?.json,
    'severity': severity.toJson(),
    'previous_treatments': previousTreatments,
    'notes': notes,
    'preferences': preferences.toJson(),
    'report_document_ids': reportDocumentIds,
    'consent_ai': consentAi,
    'home_country': homeCountry,
    'ai_result': aiResult?.toJson(),
    'urgency': urgency?.json,
    'red_flags': redFlags,
    'error': error,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'submitted_at': submittedAt?.toUtc().toIso8601String(),
    'completed_at': completedAt?.toUtc().toIso8601String(),
  };
}

/// Body of `PATCH /screenings/{id}` — any subset of answer fields; null fields are omitted.
class ScreeningPatch {
  const ScreeningPatch({
    this.bodyAreas,
    this.painIntensity,
    this.symptoms,
    this.durationValue,
    this.durationUnit,
    this.severity,
    this.previousTreatments,
    this.notes,
    this.preferences,
    this.reportDocumentIds,
    this.homeCountry,
    this.specialtySlug,
  });

  final List<String>? bodyAreas;
  final int? painIntensity;
  final List<SymptomResponse>? symptoms;
  final int? durationValue;
  final DurationUnit? durationUnit;
  final ScreeningSeverity? severity;
  final List<String>? previousTreatments;
  final String? notes;
  final ScreeningPreferences? preferences;
  final List<String>? reportDocumentIds;
  final String? homeCountry;
  final String? specialtySlug;

  Map<String, dynamic> toJson() => compactJson({
    'body_areas': bodyAreas,
    'pain_intensity': painIntensity,
    'symptoms': symptoms?.map((s) => s.toJson()).toList(),
    'duration_value': durationValue,
    'duration_unit': durationUnit?.json,
    'severity': severity?.toJson(),
    'previous_treatments': previousTreatments,
    'notes': notes,
    'preferences': preferences?.toJson(),
    'report_document_ids': reportDocumentIds,
    'home_country': homeCountry,
    'specialty_slug': specialtySlug,
  });
}

/// `ScreeningLite` as embedded in the patient dashboard (`recent_screenings[]`).
class ScreeningSummary {
  const ScreeningSummary({required this.id, required this.status, this.specialty, this.urgency, this.createdAt});

  factory ScreeningSummary.fromJson(JsonMap j) => ScreeningSummary(
    id: jStr(j, 'id'),
    status: ScreeningStatus.fromJson(j['status']),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    urgency: Urgency.fromJsonOrNull(j['urgency']),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final ScreeningStatus status;
  final EntityRef? specialty;
  final Urgency? urgency;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'status': status.json,
    'specialty': specialty?.toJson(),
    'urgency': urgency?.json,
    'created_at': createdAt?.toUtc().toIso8601String(),
  };
}
