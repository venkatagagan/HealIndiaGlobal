import '../../l10n/l10n.dart';
import 'json.dart';

/// `DataRightsRequestKind` of `POST /privacy/requests` (DPDP Act / GDPR rights and grievances).
enum DataRightsRequestKind {
  access('access'),
  correction('correction'),
  erasure('erasure'),
  nomination('nomination'),
  withdrawConsent('withdraw_consent'),
  complaint('complaint'),
  other('other');

  const DataRightsRequestKind(this.json);

  final String json;

  static DataRightsRequestKind fromJson(Object? raw) =>
      values.firstWhere((v) => v.json == raw, orElse: () => DataRightsRequestKind.other);

  String labelIn(AppLocalizations l) => switch (this) {
    access => l.privacyRequestKindAccess,
    correction => l.privacyRequestKindCorrection,
    erasure => l.privacyRequestKindErasure,
    nomination => l.privacyRequestKindNomination,
    withdrawConsent => l.privacyRequestKindWithdrawConsent,
    complaint => l.privacyRequestKindComplaint,
    other => l.privacyRequestKindOther,
  };
}

/// `DataRightsRequestStatus`.
enum DataRightsRequestStatus {
  received('received'),
  inProgress('in_progress'),
  awaitingRequester('awaiting_requester'),
  completed('completed'),
  rejected('rejected');

  const DataRightsRequestStatus(this.json);

  final String json;

  static DataRightsRequestStatus fromJson(Object? raw) =>
      values.firstWhere((v) => v.json == raw, orElse: () => DataRightsRequestStatus.received);

  bool get isClosed => this == completed || this == rejected;

  String labelIn(AppLocalizations l) => switch (this) {
    received => l.privacyRequestStatusReceived,
    inProgress => l.privacyRequestStatusInProgress,
    awaitingRequester => l.privacyRequestStatusAwaitingRequester,
    completed => l.privacyRequestStatusCompleted,
    rejected => l.privacyRequestStatusRejected,
  };
}

/// `DataRightsRequestOut`.
class DataRightsRequest {
  const DataRightsRequest({
    required this.id,
    required this.reference,
    required this.kind,
    required this.status,
    required this.details,
    this.onBehalfOf,
    this.resolution,
    this.dueAt,
    this.overdue = false,
    this.closedAt,
    this.createdAt,
  });

  factory DataRightsRequest.fromJson(JsonMap j) => DataRightsRequest(
    id: jStr(j, 'id'),
    reference: jStr(j, 'reference'),
    kind: DataRightsRequestKind.fromJson(j['kind']),
    status: DataRightsRequestStatus.fromJson(j['status']),
    details: jStr(j, 'details'),
    onBehalfOf: jStrOrNull(j, 'on_behalf_of'),
    resolution: jStrOrNull(j, 'resolution'),
    dueAt: jDate(j, 'due_at'),
    overdue: jBool(j, 'overdue'),
    closedAt: jDate(j, 'closed_at'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String reference;
  final DataRightsRequestKind kind;
  final DataRightsRequestStatus status;
  final String details;
  final String? onBehalfOf;
  final String? resolution;
  final DateTime? dueAt;
  final bool overdue;
  final DateTime? closedAt;
  final DateTime? createdAt;
}

/// `NomineeOut` (DPDP s.14).
class Nominee {
  const Nominee({required this.fullName, required this.relationship, this.email, this.phone});

  factory Nominee.fromJson(JsonMap j) => Nominee(
    fullName: jStr(j, 'full_name'),
    relationship: jStr(j, 'relationship'),
    email: jStrOrNull(j, 'email'),
    phone: jStrOrNull(j, 'phone'),
  );

  final String fullName;
  final String relationship;
  final String? email;
  final String? phone;

  Map<String, dynamic> toJson() => compactJson({
    'full_name': fullName,
    'relationship': relationship,
    'email': email,
    'phone': phone,
  }, dropEmptyStrings: true);
}

/// `ContactPerson` of `GET /site-config/privacy-contact`.
class PrivacyContactPerson {
  const PrivacyContactPerson({this.name, this.email, this.phone});

  factory PrivacyContactPerson.fromJson(JsonMap j) =>
      PrivacyContactPerson(name: jStrOrNull(j, 'name'), email: jStrOrNull(j, 'email'), phone: jStrOrNull(j, 'phone'));

  final String? name;
  final String? email;
  final String? phone;

  bool get isEmpty => (name ?? '').isEmpty && (email ?? '').isEmpty && (phone ?? '').isEmpty;
}

/// `PrivacyContactOut`: Grievance Officer and DPO (DPDP s.8(10), GDPR Art. 13).
class PrivacyContact {
  const PrivacyContact({
    required this.grievanceOfficer,
    required this.dataProtectionOfficer,
    this.postalAddress,
    this.responseDays = 30,
    this.dataProtectionBoardUrl = 'https://www.dpb.gov.in',
  });

  factory PrivacyContact.fromJson(JsonMap j) => PrivacyContact(
    grievanceOfficer: PrivacyContactPerson.fromJson(jMap(j, 'grievance_officer')),
    dataProtectionOfficer: PrivacyContactPerson.fromJson(jMap(j, 'data_protection_officer')),
    postalAddress: jStrOrNull(j, 'postal_address'),
    responseDays: jInt(j, 'response_days', 30),
    dataProtectionBoardUrl: jStr(j, 'data_protection_board_url', 'https://www.dpb.gov.in'),
  );

  final PrivacyContactPerson grievanceOfficer;
  final PrivacyContactPerson dataProtectionOfficer;
  final String? postalAddress;
  final int responseDays;
  final String dataProtectionBoardUrl;
}
