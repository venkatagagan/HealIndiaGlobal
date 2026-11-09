import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// Cases, quotes and consultations (PLAN §8.7).
class CaseRepository {
  CaseRepository(this._api);

  final ApiClient _api;

  /// `POST /cases` — request a quote from a hospital (status `enquiry`).
  Future<MedicalCase> create({
    required String hospitalId,
    String? doctorId,
    String? procedureId,
    String? specialtyId,
    String? screeningId,
    String? patientNotes,
  }) async => MedicalCase.fromJson(
    asJsonMap(
      await _api.post(
        '/cases',
        data: compactJson({
          'hospital_id': hospitalId,
          'doctor_id': doctorId,
          'procedure_id': procedureId,
          'specialty_id': specialtyId,
          'screening_id': screeningId,
          'patient_notes': patientNotes,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `GET /cases?status=&q=&page=`
  Future<Paged<MedicalCase>> list({CaseStatus? status, String? q, int page = 1, int pageSize = 20}) async =>
      Paged.fromJson(
        await _api.get('/cases', query: {'status': status?.json, 'q': q, 'page': page, 'page_size': pageSize}),
        MedicalCase.fromJson,
      );

  /// `GET /cases/{id}`
  Future<MedicalCaseDetail> get(String id) async => MedicalCaseDetail.fromJson(asJsonMap(await _api.get('/cases/$id')));

  /// `POST /cases/{id}/status {to_status, note?}` (patients may cancel pre-treatment cases).
  Future<void> changeStatus(String id, CaseStatus toStatus, {String? note}) =>
      _api.post('/cases/$id/status', data: compactJson({'to_status': toStatus.json, 'note': note}));

  /// Convenience for `changeStatus(id, CaseStatus.cancelled)`.
  Future<void> cancel(String id, {String? note}) => changeStatus(id, CaseStatus.cancelled, note: note);

  /// `POST /cases/{id}/quotes/{quote_id}/accept` (case -> `accepted`).
  Future<void> acceptQuote(String caseId, String quoteId) => _api.post('/cases/$caseId/quotes/$quoteId/accept');

  /// `POST /cases/{id}/quotes/{quote_id}/reject`
  Future<void> rejectQuote(String caseId, String quoteId, {String? reason}) =>
      _api.post('/cases/$caseId/quotes/$quoteId/reject', data: compactJson({'reason': reason}));

  /// `POST /consultations` — tele-consult request.
  Future<Consultation> requestConsultation({
    required String caseId,
    String? doctorId,
    ConsultationMode mode = ConsultationMode.video,
    DateTime? preferredAt,
    String? notes,
  }) async => Consultation.fromJson(
    asJsonMap(
      await _api.post(
        '/consultations',
        data: compactJson({
          'case_id': caseId,
          'doctor_id': doctorId,
          'mode': mode.json,
          'preferred_at': preferredAt?.toUtc().toIso8601String(),
          'notes': notes,
        }),
      ),
    ),
  );

  /// `GET /consultations`
  Future<List<Consultation>> consultations({String? caseId}) async =>
      parseList(await _api.get('/consultations', query: {'case_id': caseId}), Consultation.fromJson);
}

final caseRepositoryProvider = Provider<CaseRepository>((ref) => CaseRepository(ref.watch(apiClientProvider)));

/// First page of my cases (optionally filtered by status).
final casesProvider = FutureProvider.autoDispose.family<Paged<MedicalCase>, CaseStatus?>(
  (ref, status) => ref.watch(caseRepositoryProvider).list(status: status),
);

final caseDetailProvider = FutureProvider.autoDispose.family<MedicalCaseDetail, String>(
  (ref, id) => ref.watch(caseRepositoryProvider).get(id),
);
