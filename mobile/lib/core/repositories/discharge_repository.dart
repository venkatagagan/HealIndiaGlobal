import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// Discharge summaries (`/discharge-summaries`): the hospital writes and finalizes them; the patient
/// reads, downloads (PDF, HL7 FHIR R4), shares them with a home doctor and switches medication reminders.
class DischargeRepository {
  DischargeRepository(this._api);

  final ApiClient _api;

  static const _base = '/discharge-summaries';

  /// `GET /discharge-summaries?case_id=&booking_id=&status=` — patients and agents get final versions,
  /// hospitals also drafts.
  Future<List<DischargeSummaryListItem>> list({String? caseId, String? bookingId, DischargeStatus? status}) async =>
      parseList(
        await _api.get(_base, query: {'case_id': caseId, 'booking_id': bookingId, 'status': status?.json}),
        DischargeSummaryListItem.fromJson,
      );

  /// `GET /discharge-summaries/{id}`
  Future<DischargeSummary> get(String id) async => DischargeSummary.fromJson(asJsonMap(await _api.get('$_base/$id')));

  /// `GET /discharge-summaries/prefill?case_id=&booking_id=` (hospital).
  Future<DischargePrefill> prefill({required String caseId, String? bookingId}) async => DischargePrefill.fromJson(
    asJsonMap(await _api.get('$_base/prefill', query: {'case_id': caseId, 'booking_id': bookingId})),
  );

  /// `POST /discharge-summaries` — a new draft (409 `discharge_draft_exists` / `discharge_summary_exists`).
  Future<DischargeSummary> create(Map<String, dynamic> body) async =>
      DischargeSummary.fromJson(asJsonMap(await _api.post(_base, data: body)));

  /// `PATCH /discharge-summaries/{id}` (drafts only).
  Future<DischargeSummary> update(String id, DischargeDraft draft) async =>
      DischargeSummary.fromJson(asJsonMap(await _api.patch('$_base/$id', data: draft.toJson())));

  /// `DELETE /discharge-summaries/{id}` — discard a draft.
  Future<void> discard(String id) => _api.delete('$_base/$id');

  /// `POST /discharge-summaries/{id}/finalize` (400 `discharge_incomplete`, details = missing fields).
  Future<DischargeSummary> finalize(String id) async =>
      DischargeSummary.fromJson(asJsonMap(await _api.post('$_base/$id/finalize')));

  /// `POST /discharge-summaries/{id}/new-version` — a final summary stays locked; edits go to a new draft.
  Future<DischargeSummary> newVersion(String id) async =>
      DischargeSummary.fromJson(asJsonMap(await _api.post('$_base/$id/new-version')));

  /// `GET /discharge-summaries/{id}/pdf` (authorized download).
  Future<Uint8List> pdf(String id) => _api.getBytes('$_base/$id/pdf');

  /// `GET /discharge-summaries/{id}/fhir` — HL7 FHIR R4 document Bundle (JSON).
  Future<Uint8List> fhir(String id) => _api.getBytes('$_base/$id/fhir');

  /// `GET /discharge-summaries/{id}/shares` (patient).
  Future<List<DischargeShare>> shares(String id) async =>
      parseList(await _api.get('$_base/$id/shares'), DischargeShare.fromJson);

  /// `POST /discharge-summaries/{id}/shares` — emails the doctor a time-limited link; the URL is returned once.
  Future<DischargeShare> share(String id, DischargeShareRequest request) async =>
      DischargeShare.fromJson(asJsonMap(await _api.post('$_base/$id/shares', data: request.toJson())));

  /// `DELETE /discharge-summaries/{id}/shares/{share_id}`
  Future<DischargeShare> revokeShare(String id, String shareId) async =>
      DischargeShare.fromJson(asJsonMap(await _api.delete('$_base/$id/shares/$shareId')));

  /// `GET /discharge-summaries/{id}/medication-reminders` (patient).
  Future<List<MedicationReminder>> reminders(String id) async =>
      parseList(await _api.get('$_base/$id/medication-reminders'), MedicationReminder.fromJson);

  /// `PUT /discharge-summaries/{id}/medication-reminders {enabled, remind_hour, timezone}`. The server sends
  /// one push / in-app notification a day at that local hour while each medicine is due.
  Future<List<MedicationReminder>> setReminders(
    String id, {
    required bool enabled,
    required int remindHour,
    String? timezone,
  }) async => parseList(
    await _api.put(
      '$_base/$id/medication-reminders',
      data: {
        'enabled': enabled,
        'remind_hour': remindHour,
        'timezone': timezone ?? utcOffsetString(DateTime.now().timeZoneOffset),
      },
    ),
    MedicationReminder.fromJson,
  );
}

final dischargeRepositoryProvider = Provider<DischargeRepository>(
  (ref) => DischargeRepository(ref.watch(apiClientProvider)),
);

/// Filter of [dischargeSummariesProvider].
typedef DischargeQuery = ({String? caseId, String? bookingId});

final dischargeSummariesProvider = FutureProvider.autoDispose.family<List<DischargeSummaryListItem>, DischargeQuery>(
  (ref, q) => ref.watch(dischargeRepositoryProvider).list(caseId: q.caseId, bookingId: q.bookingId),
);

final dischargeSummaryProvider = FutureProvider.autoDispose.family<DischargeSummary, String>(
  (ref, id) => ref.watch(dischargeRepositoryProvider).get(id),
);

final dischargeSharesProvider = FutureProvider.autoDispose.family<List<DischargeShare>, String>(
  (ref, id) => ref.watch(dischargeRepositoryProvider).shares(id),
);

final medicationRemindersProvider = FutureProvider.autoDispose.family<List<MedicationReminder>, String>(
  (ref, id) => ref.watch(dischargeRepositoryProvider).reminders(id),
);

/// `GET /discharge-summaries/prefill` for a case (hospital editor: values and the documents to attach).
final dischargePrefillProvider = FutureProvider.autoDispose.family<DischargePrefill, DischargeQuery>(
  (ref, q) => ref.watch(dischargeRepositoryProvider).prefill(caseId: q.caseId ?? '', bookingId: q.bookingId),
);
