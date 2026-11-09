import 'dart:typed_data';

import 'package:dio/dio.dart' show ProgressCallback;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// Documents (PLAN §8.3). Server allows pdf/jpg/png/webp/heic/dcm up to `MAX_UPLOAD_MB`.
class DocumentRepository {
  DocumentRepository(this._api);

  final ApiClient _api;

  /// Max upload size enforced client-side before sending (server is authoritative).
  static const int maxUploadBytes = 20 * 1024 * 1024;

  static const List<String> allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'dcm'];

  /// `POST /documents` (multipart `file`, `kind`, `case_id?`, `patient_id?`, `hospital_id?`).
  ///
  /// Pass [bytes] (web / `FilePicker(withData: true)`) or [filePath] (Android / iOS).
  Future<AppDocument> upload({
    required String fileName,
    required DocumentKind kind,
    Uint8List? bytes,
    String? filePath,
    String? caseId,
    String? patientId,
    String? hospitalId,
    ProgressCallback? onProgress,
  }) async {
    final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : '';
    if (!allowedExtensions.contains(ext)) {
      throw ApiException(
        statusCode: 0,
        code: 'validation_error',
        message: L10n.current.coreUploadUnsupportedType,
      );
    }
    if (bytes != null && bytes.length > maxUploadBytes) {
      throw ApiException(statusCode: 0, code: 'validation_error', message: L10n.current.coreUploadTooLarge);
    }
    final data = await _api.upload(
      '/documents',
      fileName: fileName,
      bytes: bytes,
      filePath: filePath,
      contentType: contentTypeFor(ext),
      fields: {'kind': kind.json, 'case_id': caseId, 'patient_id': patientId, 'hospital_id': hospitalId},
      onSendProgress: onProgress,
    );
    return AppDocument.fromJson(asJsonMap(data));
  }

  /// `GET /documents?case_id=&kind=&patient_id=`
  Future<List<AppDocument>> list({String? caseId, DocumentKind? kind, String? patientId}) async => parseList(
    await _api.get('/documents', query: {'case_id': caseId, 'kind': kind?.json, 'patient_id': patientId}),
    AppDocument.fromJson,
  );

  /// `GET /documents/{id}`
  Future<AppDocument> get(String id) async => AppDocument.fromJson(asJsonMap(await _api.get('/documents/$id')));

  /// `GET /documents/{id}/download` (authorized stream).
  Future<Uint8List> download(String id, {ProgressCallback? onProgress}) =>
      _api.getBytes('/documents/$id/download', onReceiveProgress: onProgress);

  /// `DELETE /documents/{id}` (owner only).
  Future<void> delete(String id) => _api.delete('/documents/$id');

  static String? contentTypeFor(String ext) => switch (ext) {
    'pdf' => 'application/pdf',
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'heic' => 'image/heic',
    'dcm' => 'application/dicom',
    _ => null,
  };
}

final documentRepositoryProvider = Provider<DocumentRepository>(
  (ref) => DocumentRepository(ref.watch(apiClientProvider)),
);

/// Filter for [documentsProvider].
typedef DocumentQuery = ({String? caseId, DocumentKind? kind});

/// `ref.watch(documentsProvider((caseId: id, kind: null)))`
final documentsProvider = FutureProvider.autoDispose.family<List<AppDocument>, DocumentQuery>(
  (ref, q) => ref.watch(documentRepositoryProvider).list(caseId: q.caseId, kind: q.kind),
);
