import 'dart:typed_data';

import 'package:dio/dio.dart' show ProgressCallback;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/json.dart';
import '../../../core/network/api_client.dart';
import '../models/voice_models.dart';

/// Voice intake endpoints (PLAN §7.2, backend module `voice`). English only: no `language` field is sent.
class VoiceRepository {
  VoiceRepository(this._api);

  final ApiClient _api;

  /// Server limits: ≤ 10 MB and ≤ `VOICE_MAX_SECONDS` (180 s).
  static const int maxBytes = 10 * 1024 * 1024;
  static const Duration maxDuration = Duration(minutes: 3);

  /// `POST /voice/transcriptions` (multipart `audio`) → 202 `queued`.
  Future<VoiceTranscription> upload({
    required String fileName,
    required String contentType,
    Uint8List? bytes,
    String? filePath,
    String? screeningId,
    String? caseId,

    /// agents/staff recording on behalf of a patient
    String? patientId,
    bool consentAi = true,
    ProgressCallback? onProgress,
  }) async => VoiceTranscription.fromJson(
    asJsonMap(
      await _api.upload(
        '/voice/transcriptions',
        fileName: fileName,
        bytes: bytes,
        filePath: filePath,
        fileField: 'audio',
        contentType: contentType,
        fields: {'screening_id': screeningId, 'case_id': caseId, 'patient_id': patientId, 'consent_ai': consentAi},
        onSendProgress: onProgress,
      ),
    ),
  );

  /// `GET /voice/transcriptions/{id}`
  Future<VoiceTranscription> get(String id) async =>
      VoiceTranscription.fromJson(asJsonMap(await _api.get('/voice/transcriptions/$id')));

  /// `POST /voice/transcriptions/{id}/confirm` `{transcript?, intake}` — stores the confirmed version
  /// and (for a draft screening) fills empty fields; returns applied fields and conflicts.
  Future<VoiceConfirmResult> confirm(String id, {String? transcript, required IntakeSuggestion intake}) async =>
      VoiceConfirmResult.fromJson(
        asJsonMap(
          await _api.post(
            '/voice/transcriptions/$id/confirm',
            data: {'transcript': ?transcript, 'intake': intake.toJson()},
          ),
        ),
      );

  /// `POST /voice/transcriptions/{id}/discard`
  Future<void> discard(String id) async {
    await _api.post('/voice/transcriptions/$id/discard');
  }

  /// `POST /voice/intake-extract` `{text, screening_id?}` → `IntakeSuggestion` (read-only).
  Future<IntakeSuggestion> intakeExtract(String text, {String? screeningId}) async => IntakeSuggestion.fromJson(
    asJsonMap(await _api.post('/voice/intake-extract', data: compactJson({'text': text, 'screening_id': screeningId}))),
  );
}

final voiceRepositoryProvider = Provider<VoiceRepository>((ref) => VoiceRepository(ref.watch(apiClientProvider)));
