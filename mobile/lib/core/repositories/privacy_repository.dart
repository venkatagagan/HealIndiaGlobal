import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// One read of the patient's health records by someone else (`GET /privacy/access-log`).
class AccessLogEntry {
  const AccessLogEntry({
    required this.at,
    required this.action,
    this.resourceType,
    this.viewerRole,
    this.viewerName,
    this.reason,
  });

  factory AccessLogEntry.fromJson(JsonMap j) => AccessLogEntry(
    at: jDate(j, 'at'),
    action: jStr(j, 'action'),
    resourceType: jStrOrNull(j, 'resource_type'),
    viewerRole: jStrOrNull(j, 'viewer_role'),
    viewerName: jStrOrNull(j, 'viewer_name'),
    reason: jStrOrNull(j, 'reason'),
  );

  final DateTime? at;
  final String action;
  final String? resourceType;
  final String? viewerRole;
  final String? viewerName;
  final String? reason;

  /// "Dr Rao (Hospital) downloaded a document", in the app's language.
  String get summary => summaryIn(L10n.current);

  String summaryIn(AppLocalizations l) {
    final role = _roleLabel(l);
    final who = (viewerName ?? '').isNotEmpty ? viewerName! : role;
    return l.privacyAccessLine(who, role, _verb(l), _what(l));
  }

  String _roleLabel(AppLocalizations l) => switch (viewerRole) {
    'hospital' => l.privacyRoleHospital,
    'agent' => l.privacyRoleAgent,
    'support' => l.privacyRoleSupport,
    'finance' => l.privacyRoleFinance,
    'admin' || 'super_admin' => l.privacyRoleStaff,
    _ => l.privacyRoleSomeone,
  };

  String _verb(AppLocalizations l) => switch (action) {
    'phi.download' => l.privacyActionDownloaded,
    'phi.list' => l.privacyActionListed,
    'phi.break_glass' => l.privacyActionEmergency,
    _ => l.privacyActionViewed,
  };

  String _what(AppLocalizations l) => switch (resourceType) {
    'document' => l.privacyRecordDocument,
    'screening' => l.privacyRecordScreening,
    'document_analysis' => l.privacyRecordReportReading,
    'voice_transcription' => l.privacyRecordVoice,
    'patient_profile' => l.privacyRecordHistory,
    _ => l.privacyRecordOther,
  };
}

/// Privacy and data rights (DPDP Act / GDPR): data export, the access log and guardian consent.
class PrivacyRepository {
  PrivacyRepository(this._api);

  final ApiClient _api;

  /// `GET /auth/me/export?format=zip` - a ZIP with data.json and the user's files.
  Future<Uint8List> exportMyData() => _api.getBytes('/auth/me/export', query: {'format': 'zip'});

  /// `GET /privacy/access-log` - who viewed or downloaded the patient's health records.
  Future<List<AccessLogEntry>> accessLog() async =>
      parseList(await _api.get('/privacy/access-log'), AccessLogEntry.fromJson);

  /// `GET /privacy/guardian-consent` - whether the patient is under 18 and a verified consent is in place.
  Future<GuardianStatus> guardianStatus({String? patientId}) async =>
      GuardianStatus.fromJson(asJsonMap(await _api.get('/privacy/guardian-consent', query: {'patient_id': patientId})));

  /// `POST /privacy/guardian-consent` - recorded as pending until staff verify the guardian.
  Future<GuardianConsent> recordGuardianConsent(GuardianConsentRequest request) async =>
      GuardianConsent.fromJson(asJsonMap(await _api.post('/privacy/guardian-consent', data: request.toJson())));
}

final privacyRepositoryProvider = Provider<PrivacyRepository>((ref) => PrivacyRepository(ref.watch(apiClientProvider)));

final accessLogProvider = FutureProvider.autoDispose<List<AccessLogEntry>>(
  (ref) => ref.watch(privacyRepositoryProvider).accessLog(),
);

/// Guardian consent status of the signed-in patient (not relevant for guests / other roles).
final guardianStatusProvider = FutureProvider.autoDispose<GuardianStatus>((ref) async {
  final auth = ref.watch(authStateProvider);
  if (!auth.isAuthenticated || auth.user?.role != UserRole.patient) return const GuardianStatus();
  return ref.watch(privacyRepositoryProvider).guardianStatus();
});
