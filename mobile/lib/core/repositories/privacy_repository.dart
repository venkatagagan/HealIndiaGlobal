import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/json.dart';
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

  /// "Dr Rao (Hospital) downloaded a document"
  String get summary {
    final who = (viewerName ?? '').isNotEmpty ? viewerName! : _roleLabel;
    return '$who ($_roleLabel) $_verb $_what';
  }

  String get _roleLabel => switch (viewerRole) {
    'hospital' => 'Hospital',
    'agent' => 'Your agent',
    'support' => 'Care coordinator',
    'finance' => 'Finance team',
    'admin' || 'super_admin' => 'Heal India Global staff',
    _ => 'Someone',
  };

  String get _verb => switch (action) {
    'phi.download' => 'downloaded',
    'phi.list' => 'saw in a list',
    'phi.break_glass' => 'opened in an emergency',
    _ => 'viewed',
  };

  String get _what => switch (resourceType) {
    'document' => 'a document',
    'screening' => 'a screening',
    'document_analysis' => 'an AI report reading',
    'voice_transcription' => 'a voice transcript',
    'patient_profile' => 'your medical history',
    _ => 'a record',
  };
}

/// Privacy and data rights (DPDP Act / GDPR): data export and the access log.
class PrivacyRepository {
  PrivacyRepository(this._api);

  final ApiClient _api;

  /// `GET /auth/me/export?format=zip` - a ZIP with data.json and the user's files.
  Future<Uint8List> exportMyData() => _api.getBytes('/auth/me/export', query: {'format': 'zip'});

  /// `GET /privacy/access-log` - who viewed or downloaded the patient's health records.
  Future<List<AccessLogEntry>> accessLog() async =>
      parseList(await _api.get('/privacy/access-log'), AccessLogEntry.fromJson);
}

final privacyRepositoryProvider = Provider<PrivacyRepository>((ref) => PrivacyRepository(ref.watch(apiClientProvider)));

final accessLogProvider = FutureProvider.autoDispose<List<AccessLogEntry>>(
  (ref) => ref.watch(privacyRepositoryProvider).accessLog(),
);
