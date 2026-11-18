import 'booking.dart';
import 'json.dart';
import 'refs.dart';

/// A treated case with aftercare (`/me/aftercare.cases[]`).
class AftercareCase {
  const AftercareCase({
    required this.caseId,
    required this.caseNumber,
    required this.hospital,
    this.doctor,
    this.dischargedOn,
    this.aftercareUntil,
  });

  factory AftercareCase.fromJson(JsonMap j) => AftercareCase(
    caseId: jStr(j, 'case_id'),
    caseNumber: jStr(j, 'case_number'),
    hospital: HospitalRef.fromJson(jMap(j, 'hospital')),
    doctor: jObj(j, 'doctor', DoctorRef.fromJson),
    dischargedOn: jDay(j, 'discharged_on'),
    aftercareUntil: jDay(j, 'aftercare_until'),
  );

  final String caseId;
  final String caseNumber;
  final HospitalRef hospital;
  final DoctorRef? doctor;
  final DateTime? dischargedOn;

  /// Last day a follow-up video consultation can be requested.
  final DateTime? aftercareUntil;

  bool get canRequestFollowup {
    final until = aftercareUntil;
    if (until == null) return true;
    final now = DateTime.now();
    return !until.isBefore(DateTime(now.year, now.month, now.day));
  }
}

/// A recovery check-in (`CheckinOut`).
class AftercareCheckin {
  const AftercareCheckin({
    required this.id,
    required this.caseId,
    required this.day,
    this.caseNumber,
    this.dueAt,
    this.isDue = false,
    this.submittedAt,
    this.answers = const {},
    this.freeText,
    this.redFlags = const [],
  });

  factory AftercareCheckin.fromJson(JsonMap j) => AftercareCheckin(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    caseNumber: jStrOrNull(j, 'case_number'),
    day: jInt(j, 'day'),
    dueAt: jDate(j, 'due_at'),
    isDue: jBool(j, 'is_due'),
    submittedAt: jDate(j, 'submitted_at'),
    answers: jMap(j, 'answers'),
    freeText: jStrOrNull(j, 'free_text'),
    redFlags: jStrList(j, 'red_flags'),
  );

  final String id;
  final String caseId;
  final String? caseNumber;

  /// Day after discharge (1, 3, 7, 14, 30).
  final int day;
  final DateTime? dueAt;
  final bool isDue;
  final DateTime? submittedAt;
  final JsonMap answers;
  final String? freeText;

  /// `fever | breathlessness | severe_pain | wound_concerns`
  final List<String> redFlags;

  bool get submitted => submittedAt != null;
  bool get hasRedFlags => redFlags.isNotEmpty;
  int? get pain => jIntOrNull(answers, 'pain');
}

/// Answers of `POST /aftercare/checkins/{id}`.
class CheckinAnswers {
  const CheckinAnswers({
    required this.pain,
    required this.fever,
    required this.woundConcerns,
    required this.breathlessness,
    required this.medicationAdherence,
    this.freeText,
  });

  final int pain;
  final bool fever;
  final bool woundConcerns;
  final bool breathlessness;

  /// `all | some | none`
  final String medicationAdherence;
  final String? freeText;

  Map<String, dynamic> toJson() => compactJson({
    'pain': pain,
    'fever': fever,
    'wound_concerns': woundConcerns,
    'breathlessness': breathlessness,
    'medication_adherence': medicationAdherence,
    'free_text': freeText,
  }, dropEmptyStrings: true);
}

/// `GET /me/aftercare`.
class Aftercare {
  const Aftercare({
    this.cases = const [],
    this.followups = const [],
    this.checkinsDue = const [],
    this.upcomingCheckins = const [],
  });

  factory Aftercare.fromJson(JsonMap j) => Aftercare(
    cases: jList(j, 'cases', AftercareCase.fromJson),
    followups: jList(j, 'followups', Consultation.fromJson),
    checkinsDue: jList(j, 'checkins_due', AftercareCheckin.fromJson),
    upcomingCheckins: jList(j, 'upcoming_checkins', AftercareCheckin.fromJson),
  );

  final List<AftercareCase> cases;

  /// Open follow-up consultations (requested or scheduled), soonest first.
  final List<Consultation> followups;
  final List<AftercareCheckin> checkinsDue;
  final List<AftercareCheckin> upcomingCheckins;

  bool get isEmpty => cases.isEmpty && followups.isEmpty && checkinsDue.isEmpty && upcomingCheckins.isEmpty;
}
