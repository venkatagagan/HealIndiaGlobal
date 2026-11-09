import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_preferences.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// The guest journey before registering: verify an email / phone and book the one free 15-minute
/// video call with a medical coordinator.
class GuestRepository {
  GuestRepository(this._api, {required this.deviceId});

  final ApiClient _api;

  /// Random id persisted on the device (`X-Device-Id`: one free call per device).
  final String deviceId;

  /// `POST /guest/verify/start {channel, contact}` — sends a 6-digit code (valid 10 minutes).
  Future<GuestVerification> startVerification({required String channel, required String contact}) async =>
      GuestVerification.fromJson(
        asJsonMap(await _api.post('/guest/verify/start', data: {'channel': channel, 'contact': contact.trim()})),
      );

  /// `POST /guest/verify/confirm {verification_id, code}`
  Future<GuestVerification> confirmVerification({required String verificationId, required String code}) async =>
      GuestVerification.fromJson(
        asJsonMap(
          await _api.post('/guest/verify/confirm', data: {'verification_id': verificationId, 'code': code.trim()}),
        ),
      );

  /// `POST /guest/consultation` with `X-Device-Id`.
  Future<IntroConsultation> requestConsultation({
    required String verificationId,
    required String fullName,
    DateTime? preferredFrom,
    DateTime? preferredTo,
    String? timezone,
    String? question,
    String? screeningId,
    List<String> documentIds = const [],
  }) async => IntroConsultation.fromJson(
    asJsonMap(
      await _api.post(
        '/guest/consultation',
        headers: {'X-Device-Id': deviceId},
        data: compactJson({
          'verification_id': verificationId,
          'full_name': fullName.trim(),
          'preferred_from': preferredFrom?.toUtc().toIso8601String(),
          'preferred_to': preferredTo?.toUtc().toIso8601String(),
          'timezone': timezone,
          'question': question,
          'screening_id': screeningId,
          'document_ids': documentIds,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `GET /guest/consultation` (404 `not_found` when none was requested).
  Future<IntroConsultation> myConsultation() async =>
      IntroConsultation.fromJson(asJsonMap(await _api.get('/guest/consultation')));
}

/// Persistent random device id for `X-Device-Id`.
final deviceIdProvider = Provider<String>((ref) {
  const key = 'hig.device_id';
  final prefs = ref.watch(sharedPreferencesProvider);
  final existing = prefs.getString(key);
  if (existing != null && existing.isNotEmpty) return existing;
  final r = Random.secure();
  final id = List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  prefs.setString(key, id);
  return id;
});

final guestRepositoryProvider = Provider<GuestRepository>(
  (ref) => GuestRepository(ref.watch(apiClientProvider), deviceId: ref.watch(deviceIdProvider)),
);

/// The caller's free intro call (null when none was requested yet).
final introConsultationProvider = FutureProvider.autoDispose<IntroConsultation?>((ref) async {
  try {
    return await ref.watch(guestRepositoryProvider).myConsultation();
  } on ApiException catch (e) {
    if (e.isNotFound) return null;
    rethrow;
  }
});
