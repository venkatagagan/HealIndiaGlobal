import '../../../core/models/models.dart';

/// `voice_transcriptions.status` (PLAN §7.2).
enum VoiceStatus with JsonEnum {
  queued('queued'),
  processing('processing'),
  completed('completed'),
  failed('failed');

  const VoiceStatus(this.json);

  @override
  final String json;

  bool get isPending => this == queued || this == processing;

  static VoiceStatus fromJson(Object? raw) => enumFromJson(values, raw, VoiceStatus.queued);
}

/// `voice_transcriptions.review_status`.
enum VoiceReviewStatus with JsonEnum {
  pendingReview('pending_review'),
  confirmed('confirmed'),
  discarded('discarded');

  const VoiceReviewStatus(this.json);

  @override
  final String json;

  static VoiceReviewStatus fromJson(Object? raw) => enumFromJson(values, raw, VoiceReviewStatus.pendingReview);
}

/// `IntakeSuggestion` — structured answers extracted from speech or free text (PLAN §7.2).
/// It is only a suggestion: the patient reviews and edits it before it is applied.
class IntakeSuggestion {
  const IntakeSuggestion({
    this.transcriptEn = '',
    this.languageDetected,
    this.specialtySlug,
    this.bodyAreas = const [],
    this.painIntensity,
    this.symptoms = const [],
    this.durationValue,
    this.durationUnit,
    this.severity,
    this.previousTreatments = const [],
    this.notes = '',
    this.redFlags = const [],
    this.urgencyHint = Urgency.routine,
  });

  factory IntakeSuggestion.fromJson(JsonMap j) => IntakeSuggestion(
    transcriptEn: jStr(j, 'transcript_en'),
    languageDetected: jStrOrNull(j, 'language_detected'),
    specialtySlug: jStrOrNull(j, 'specialty_slug'),
    bodyAreas: jStrList(j, 'body_areas'),
    painIntensity: jIntOrNull(j, 'pain_intensity')?.clamp(0, 10),
    symptoms: jList(j, 'symptoms', SymptomResponse.fromJson),
    durationValue: jIntOrNull(j, 'duration_value'),
    durationUnit: DurationUnit.fromJsonOrNull(j['duration_unit']),
    severity: jObj(j, 'severity', ScreeningSeverity.fromJson),
    previousTreatments: jStrList(j, 'previous_treatments'),
    notes: jStr(j, 'notes'),
    redFlags: jStrList(j, 'red_flags'),
    urgencyHint: Urgency.fromJsonOrNull(j['urgency_hint']) ?? Urgency.routine,
  );

  final String transcriptEn;
  final String? languageDetected;
  final String? specialtySlug;
  final List<String> bodyAreas;
  final int? painIntensity;
  final List<SymptomResponse> symptoms;
  final int? durationValue;
  final DurationUnit? durationUnit;
  final ScreeningSeverity? severity;
  final List<String> previousTreatments;
  final String notes;
  final List<String> redFlags;
  final Urgency urgencyHint;

  bool get isEmergency => urgencyHint == Urgency.emergency || redFlags.isNotEmpty;

  IntakeSuggestion copyWith({
    String? specialtySlug,
    bool clearSpecialty = false,
    List<String>? bodyAreas,
    int? painIntensity,
    bool clearPain = false,
    List<SymptomResponse>? symptoms,
    int? durationValue,
    bool clearDuration = false,
    DurationUnit? durationUnit,
    ScreeningSeverity? severity,
    List<String>? previousTreatments,
    String? notes,
  }) => IntakeSuggestion(
    transcriptEn: transcriptEn,
    languageDetected: languageDetected,
    specialtySlug: clearSpecialty ? null : (specialtySlug ?? this.specialtySlug),
    bodyAreas: bodyAreas ?? this.bodyAreas,
    painIntensity: clearPain ? null : (painIntensity ?? this.painIntensity),
    symptoms: symptoms ?? this.symptoms,
    durationValue: clearDuration ? null : (durationValue ?? this.durationValue),
    durationUnit: durationUnit ?? this.durationUnit,
    severity: severity ?? this.severity,
    previousTreatments: previousTreatments ?? this.previousTreatments,
    notes: notes ?? this.notes,
    redFlags: redFlags,
    urgencyHint: urgencyHint,
  );

  Map<String, dynamic> toJson() => {
    'transcript_en': transcriptEn,
    'language_detected': languageDetected,
    'specialty_slug': specialtySlug,
    'body_areas': bodyAreas,
    'pain_intensity': painIntensity,
    'symptoms': [for (final s in symptoms) s.toJson()],
    'duration_value': durationValue,
    'duration_unit': durationUnit?.json,
    'severity': severity?.toJson(),
    'previous_treatments': previousTreatments,
    'notes': notes,
    'red_flags': redFlags,
    'urgency_hint': urgencyHint.json,
  };
}

/// `VoiceTranscriptionOut`.
class VoiceTranscription {
  const VoiceTranscription({
    required this.id,
    required this.status,
    this.reviewStatus = VoiceReviewStatus.pendingReview,
    this.screeningId,
    this.durationSeconds,
    this.languageHint,
    this.languageDetected,
    this.transcript = '',
    this.transcriptEn = '',
    this.intakeSuggestion,
    this.confirmedIntake,
    this.error,
  });

  factory VoiceTranscription.fromJson(JsonMap j) => VoiceTranscription(
    id: jStr(j, 'id'),
    status: VoiceStatus.fromJson(j['status']),
    reviewStatus: VoiceReviewStatus.fromJson(j['review_status']),
    screeningId: jStrOrNull(j, 'screening_id'),
    durationSeconds: jDoubleOrNull(j, 'duration_seconds'),
    languageHint: jStrOrNull(j, 'language_hint'),
    languageDetected: jStrOrNull(j, 'language_detected'),
    transcript: jStr(j, 'transcript'),
    transcriptEn: jStr(j, 'transcript_en'),
    intakeSuggestion: jObj(j, 'intake_suggestion', IntakeSuggestion.fromJson),
    confirmedIntake: jObj(j, 'confirmed_intake', IntakeSuggestion.fromJson),
    error: jStrOrNull(j, 'error'),
  );

  final String id;
  final VoiceStatus status;
  final VoiceReviewStatus reviewStatus;
  final String? screeningId;
  final double? durationSeconds;
  final String? languageHint;
  final String? languageDetected;
  final String transcript;
  final String transcriptEn;
  final IntakeSuggestion? intakeSuggestion;
  final IntakeSuggestion? confirmedIntake;
  final String? error;
}

/// A field the server did not overwrite because the screening already had an answer.
class IntakeConflict {
  const IntakeConflict({required this.field, this.current, this.suggested});

  factory IntakeConflict.fromJson(JsonMap j) =>
      IntakeConflict(field: jStr(j, 'field'), current: j['current'], suggested: j['suggested']);

  final String field;
  final Object? current;
  final Object? suggested;
}

/// Response of `POST /voice/transcriptions/{id}/confirm` (backend `ConfirmOut`:
/// `{transcription, applied_fields, conflicts, screening_note}`). Field names are screening answer keys plus
/// `duration` (`{value, unit}`) and `severity.work|sleep|mobility`.
class VoiceConfirmResult {
  const VoiceConfirmResult({
    this.transcription,
    this.appliedFields = const [],
    this.conflicts = const [],
    this.screeningNote,
  });

  factory VoiceConfirmResult.fromJson(JsonMap j) => VoiceConfirmResult(
    transcription: jObj(j, 'transcription', VoiceTranscription.fromJson),
    appliedFields: jStrList(j, 'applied_fields'),
    conflicts: jList(j, 'conflicts', IntakeConflict.fromJson),
    screeningNote: jStrOrNull(j, 'screening_note'),
  );

  final VoiceTranscription? transcription;
  final List<String> appliedFields;
  final List<IntakeConflict> conflicts;

  /// Why nothing was applied to a screening (none linked / no longer a draft), else null.
  final String? screeningNote;
}

/// What the voice screen returns to the screening (`context.push<VoiceIntakeResult>`).
class VoiceIntakeResult {
  const VoiceIntakeResult({required this.intake, this.transcriptionId, this.serverConflicts = const []});

  /// The patient-confirmed answers.
  final IntakeSuggestion intake;
  final String? transcriptionId;
  final List<IntakeConflict> serverConflicts;
}
