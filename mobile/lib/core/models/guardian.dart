import 'json.dart';

/// A guardian consent record for a patient under 18 (`GuardianConsentOut`).
class GuardianConsent {
  const GuardianConsent({
    required this.id,
    required this.guardianName,
    required this.relationship,
    this.guardianEmail,
    this.guardianPhone,
    this.verificationMethod,
    this.verifiedAt,
    this.revokedAt,
    this.createdAt,
  });

  factory GuardianConsent.fromJson(JsonMap j) => GuardianConsent(
    id: jStr(j, 'id'),
    guardianName: jStr(j, 'guardian_name'),
    relationship: jStr(j, 'relationship', 'parent'),
    guardianEmail: jStrOrNull(j, 'guardian_email'),
    guardianPhone: jStrOrNull(j, 'guardian_phone'),
    verificationMethod: jStrOrNull(j, 'verification_method'),
    verifiedAt: jDate(j, 'verified_at'),
    revokedAt: jDate(j, 'revoked_at'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String guardianName;

  /// `parent | lawful_guardian`
  final String relationship;
  final String? guardianEmail;
  final String? guardianPhone;
  final String? verificationMethod;
  final DateTime? verifiedAt;
  final DateTime? revokedAt;
  final DateTime? createdAt;
}

/// `GET /privacy/guardian-consent`.
class GuardianStatus {
  const GuardianStatus({
    this.isMinor = false,
    this.dateOfBirthKnown = false,
    this.satisfied = true,
    this.consent,
    this.pending,
  });

  factory GuardianStatus.fromJson(JsonMap j) => GuardianStatus(
    isMinor: jBool(j, 'is_minor'),
    dateOfBirthKnown: jBool(j, 'date_of_birth_known'),
    satisfied: jBool(j, 'satisfied', true),
    consent: jObj(j, 'consent', GuardianConsent.fromJson),
    pending: jObj(j, 'pending', GuardianConsent.fromJson),
  );

  final bool isMinor;
  final bool dateOfBirthKnown;

  /// A verified guardian consent is in place (or none is needed).
  final bool satisfied;
  final GuardianConsent? consent;

  /// Submitted and waiting for staff verification.
  final GuardianConsent? pending;

  /// Whether the profile should show the guardian consent row at all.
  bool get relevant => isMinor || consent != null || pending != null;
}

/// Body of `POST /privacy/guardian-consent`.
class GuardianConsentRequest {
  const GuardianConsentRequest({
    required this.guardianName,
    required this.relationship,
    required this.guardianDateOfBirth,
    required this.verificationMethod,
    this.guardianEmail,
    this.guardianPhone,
    this.patientId,
  });

  final String guardianName;

  /// `parent | lawful_guardian`
  final String relationship;
  final DateTime guardianDateOfBirth;

  /// `id_document | digilocker | in_person | video_call`
  final String verificationMethod;
  final String? guardianEmail;
  final String? guardianPhone;
  final String? patientId;

  Map<String, dynamic> toJson() => compactJson({
    'patient_id': patientId,
    'guardian_name': guardianName,
    'relationship': relationship,
    'guardian_email': guardianEmail,
    'guardian_phone': guardianPhone,
    'guardian_date_of_birth': toApiDate(guardianDateOfBirth),
    'verification_method': verificationMethod,
    'declaration': true,
  }, dropEmptyStrings: true);
}
