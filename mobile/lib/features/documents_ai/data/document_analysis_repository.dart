import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/json.dart';
import '../../../core/network/api_client.dart';
import '../models/document_analysis.dart';

/// Document intelligence endpoints (PLAN §7.1, backend module `docai`).
///
/// Pages are uploaded first with the core `DocumentRepository.upload` (`POST /documents`).
class DocumentAnalysisRepository {
  DocumentAnalysisRepository(this._api);

  final ApiClient _api;

  /// Max pages of ONE report (`DOCAI_MAX_PAGES`).
  static const int maxPages = 10;

  /// `POST /documents/analyses` → 202 `queued`. Records the `ai_processing` consent server-side.
  Future<DocumentAnalysis> create({
    required List<String> documentIds,
    String? caseId,
    String? patientId,
    bool consentAi = true,
  }) async => DocumentAnalysis.fromJson(
    asJsonMap(
      await _api.post(
        '/documents/analyses',
        data: compactJson({
          'document_ids': documentIds,
          'case_id': caseId,
          'patient_id': patientId,
          'consent_ai': consentAi,
        }),
      ),
    ),
  );

  /// `GET /documents/analyses?patient_id=&case_id=&status=&review_status=` (paginated envelope).
  Future<List<DocumentAnalysis>> list({
    String? patientId,
    String? caseId,
    AnalysisStatus? status,
    AnalysisReviewStatus? reviewStatus,
  }) async => parseList(
    await _api.get(
      '/documents/analyses',
      query: {'patient_id': patientId, 'case_id': caseId, 'status': status?.json, 'review_status': reviewStatus?.json},
    ),
    DocumentAnalysis.fromJson,
  );

  /// `GET /documents/analyses/{id}`
  Future<DocumentAnalysis> get(String id) async =>
      DocumentAnalysis.fromJson(asJsonMap(await _api.get('/documents/analyses/$id')));

  /// `GET /documents/{documentId}/analysis` — latest analysis containing that page.
  Future<DocumentAnalysis> forDocument(String documentId) async =>
      DocumentAnalysis.fromJson(asJsonMap(await _api.get('/documents/$documentId/analysis')));

  /// `POST /documents/analyses/{id}/retry`
  Future<DocumentAnalysis> retry(String id) async =>
      DocumentAnalysis.fromJson(asJsonMap(await _api.post('/documents/analyses/$id/retry')));

  /// `PATCH /documents/analyses/{id}` — save draft edits (only while `pending_review`).
  Future<DocumentAnalysis> update(String id, ReportData data) async =>
      DocumentAnalysis.fromJson(asJsonMap(await _api.patch('/documents/analyses/$id', data: data.toJson())));

  /// `POST /documents/analyses/{id}/confirm` — body = the final, patient-edited data.
  Future<DocumentAnalysis> confirm(String id, ReportData data) async =>
      DocumentAnalysis.fromJson(asJsonMap(await _api.post('/documents/analyses/$id/confirm', data: data.toJson())));

  /// `POST /documents/analyses/{id}/reject` — discard the AI reading.
  Future<DocumentAnalysis> reject(String id) async =>
      DocumentAnalysis.fromJson(asJsonMap(await _api.post('/documents/analyses/$id/reject')));
}

final documentAnalysisRepositoryProvider = Provider<DocumentAnalysisRepository>(
  (ref) => DocumentAnalysisRepository(ref.watch(apiClientProvider)),
);

/// Analyses of a case (or all of the patient's when `caseId` is null).
final documentAnalysesProvider = FutureProvider.autoDispose.family<List<DocumentAnalysis>, String?>(
  (ref, caseId) => ref.watch(documentAnalysisRepositoryProvider).list(caseId: caseId),
);
