import '../../l10n/l10n.dart';
import 'enums.dart';
import 'json.dart';

/// Hospital membership of a hospital user (`UserOut.hospitals[]`).
class UserHospital {
  const UserHospital({required this.id, required this.name, required this.slug, required this.memberRole});

  factory UserHospital.fromJson(JsonMap j) => UserHospital(
    id: jStr(j, 'id'),
    name: jStr(j, 'name'),
    slug: jStr(j, 'slug'),
    memberRole: HospitalMemberRole.fromJson(j['member_role']),
  );

  final String id;
  final String name;
  final String slug;
  final HospitalMemberRole memberRole;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'slug': slug, 'member_role': memberRole.json};
}

/// `UserOut` (PLAN §8.1).
class User {
  const User({
    required this.id,
    required this.role,
    required this.status,
    this.email,
    this.fullName = '',
    this.phone,
    this.countryCode,
    this.preferredLanguage = 'en',
    this.avatarUrl,
    this.isGuest = false,
    this.emailVerified = false,
    this.mfaEnabled = false,
    this.createdAt,
    this.patientProfileId,
    this.agentId,
    this.hospitals = const [],
  });

  factory User.fromJson(JsonMap j) => User(
    id: jStr(j, 'id'),
    email: jStrOrNull(j, 'email'),
    fullName: jStr(j, 'full_name'),
    role: UserRole.fromJson(j['role']),
    status: UserStatus.fromJson(j['status']),
    phone: jStrOrNull(j, 'phone'),
    countryCode: jStrOrNull(j, 'country_code'),
    preferredLanguage: jStr(j, 'preferred_language', 'en'),
    avatarUrl: jStrOrNull(j, 'avatar_url'),
    isGuest: jBool(j, 'is_guest'),
    emailVerified: jBool(j, 'email_verified'),
    mfaEnabled: jBool(j, 'mfa_enabled'),
    createdAt: jDate(j, 'created_at'),
    patientProfileId: jStrOrNull(j, 'patient_profile_id'),
    agentId: jStrOrNull(j, 'agent_id'),
    hospitals: jList(j, 'hospitals', UserHospital.fromJson),
  );

  final String id;
  final String? email;
  final String fullName;
  final UserRole role;
  final UserStatus status;
  final String? phone;
  final String? countryCode;
  final String preferredLanguage;
  final String? avatarUrl;
  final bool isGuest;
  final bool emailVerified;
  final bool mfaEnabled;
  final DateTime? createdAt;
  final String? patientProfileId;
  final String? agentId;
  final List<UserHospital> hospitals;

  bool get isPatient => role == UserRole.patient;

  /// Name to greet the user with (falls back to "Guest" / email local part).
  String get displayName {
    if (fullName.trim().isNotEmpty) return fullName.trim();
    if (isGuest) return L10n.current.coreUserGuest;
    final e = email;
    return e == null ? L10n.current.coreUserPatient : e.split('@').first;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'full_name': fullName,
    'role': role.json,
    'status': status.json,
    'phone': phone,
    'country_code': countryCode,
    'preferred_language': preferredLanguage,
    'avatar_url': avatarUrl,
    'is_guest': isGuest,
    'email_verified': emailVerified,
    'mfa_enabled': mfaEnabled,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'patient_profile_id': patientProfileId,
    'agent_id': agentId,
    'hospitals': hospitals.map((h) => h.toJson()).toList(),
  };
}

/// `TokenOut` (PLAN §8.1). Mobile clients (`X-Client-Type: mobile`) receive `refresh_token` in the body.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.user,
    this.tokenType = 'bearer',
    this.expiresIn = 0,
    this.refreshToken,
  });

  factory AuthSession.fromJson(JsonMap j) => AuthSession(
    accessToken: jStr(j, 'access_token'),
    tokenType: jStr(j, 'token_type', 'bearer'),
    expiresIn: jInt(j, 'expires_in'),
    refreshToken: jStrOrNull(j, 'refresh_token'),
    user: User.fromJson(jMap(j, 'user')),
  );

  final String accessToken;
  final String tokenType;

  /// Access token lifetime in seconds.
  final int expiresIn;
  final String? refreshToken;
  final User user;

  Map<String, dynamic> toJson() => {
    'access_token': accessToken,
    'token_type': tokenType,
    'expires_in': expiresIn,
    'refresh_token': refreshToken,
    'user': user.toJson(),
  };
}

/// Consent record (`POST/GET /auth/consents`).
class Consent {
  const Consent({required this.kind, required this.version, required this.granted, this.createdAt});

  factory Consent.fromJson(JsonMap j) => Consent(
    kind: ConsentKind.fromJson(j['kind']),
    version: jStr(j, 'version'),
    granted: jBool(j, 'granted'),
    createdAt: jDate(j, 'created_at'),
  );

  final ConsentKind kind;
  final String version;
  final bool granted;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {'kind': kind.json, 'version': version, 'granted': granted};
}
