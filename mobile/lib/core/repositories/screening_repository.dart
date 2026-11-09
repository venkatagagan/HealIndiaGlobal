import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// `/screenings` endpoints (PLAN §8.6, flow in §7).
///
/// Flow: [create] (draft) -> [update] per step -> [submit] (processing) -> [watch] / poll [get]
/// until `completed|failed` -> [matches].
class ScreeningRepository {
  ScreeningRepository(this._api);

  final ApiClient _api;

  /// `POST /screenings {specialty_slug?}` -> draft.
  Future<Screening> create({String? specialtySlug}) async => Screening.fromJson(
    asJsonMap(await _api.post('/screenings', data: compactJson({'specialty_slug': specialtySlug}))),
  );

  /// `PATCH /screenings/{id}` (only while `draft`).
  Future<Screening> update(String id, ScreeningPatch patch) async =>
      Screening.fromJson(asJsonMap(await _api.patch('/screenings/$id', data: patch.toJson())));

  /// `POST /screenings/{id}/submit {consent_ai}` -> `processing`.
  Future<Screening> submit(String id, {required bool consentAi}) async =>
      Screening.fromJson(asJsonMap(await _api.post('/screenings/$id/submit', data: {'consent_ai': consentAi})));

  /// `GET /screenings/{id}`
  Future<Screening> get(String id) async => Screening.fromJson(asJsonMap(await _api.get('/screenings/$id')));

  /// `GET /screenings` (mine).
  Future<List<Screening>> list() async => parseList(await _api.get('/screenings'), Screening.fromJson);

  /// `GET /screenings/{id}/matches`
  Future<List<ScreeningMatch>> matches(String id) async =>
      parseList(await _api.get('/screenings/$id/matches'), ScreeningMatch.fromJson);

  /// `POST /screenings/{id}/rerun`
  Future<Screening> rerun(String id) async => Screening.fromJson(asJsonMap(await _api.post('/screenings/$id/rerun')));

  /// Polls `GET /screenings/{id}` every [interval] until it is `completed` or `failed` (or
  /// [timeout] elapses, which emits an [ApiException] with code `timeout`). Emits every snapshot.
  Stream<Screening> watch(
    String id, {
    Duration interval = const Duration(seconds: 2),
    Duration timeout = const Duration(minutes: 3),
  }) async* {
    final deadline = DateTime.now().add(timeout);
    var failures = 0;
    while (true) {
      try {
        final s = await get(id);
        failures = 0;
        yield s;
        if (s.isCompleted || s.isFailed || s.isDraft) return;
      } on ApiException catch (e) {
        if (!e.isRetryable || ++failures >= 5) rethrow;
      }
      if (DateTime.now().isAfter(deadline)) {
        throw ApiException(
          statusCode: 0,
          code: 'timeout',
          message: L10n.current.coreScreeningAnalysisSlow,
        );
      }
      await Future<void>.delayed(interval);
    }
  }
}

final screeningRepositoryProvider = Provider<ScreeningRepository>(
  (ref) => ScreeningRepository(ref.watch(apiClientProvider)),
);

final screeningProvider = FutureProvider.autoDispose.family<Screening, String>(
  (ref, id) => ref.watch(screeningRepositoryProvider).get(id),
);

final screeningMatchesProvider = FutureProvider.autoDispose.family<List<ScreeningMatch>, String>(
  (ref, id) => ref.watch(screeningRepositoryProvider).matches(id),
);

final myScreeningsProvider = FutureProvider.autoDispose<List<Screening>>(
  (ref) => ref.watch(screeningRepositoryProvider).list(),
);
