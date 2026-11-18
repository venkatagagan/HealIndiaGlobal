import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// Aftercare after discharge: follow-up video calls and recovery check-ins.
class AftercareRepository {
  AftercareRepository(this._api);

  final ApiClient _api;

  /// `GET /me/aftercare` (patients: their own; agents: their patients').
  Future<Aftercare> mine() async => Aftercare.fromJson(asJsonMap(await _api.get('/me/aftercare')));

  /// `GET /aftercare/checkins?case_id=` (patient side, the case's hospital team and staff).
  Future<List<AftercareCheckin>> checkins(String caseId) async =>
      parseList(await _api.get('/aftercare/checkins', query: {'case_id': caseId}), AftercareCheckin.fromJson);

  /// `POST /aftercare/checkins/{id}` — answer once; red flags alert the hospital and coordinator.
  Future<AftercareCheckin> submit(String checkinId, CheckinAnswers answers) async =>
      AftercareCheckin.fromJson(asJsonMap(await _api.post('/aftercare/checkins/$checkinId', data: answers.toJson())));
}

final aftercareRepositoryProvider = Provider<AftercareRepository>(
  (ref) => AftercareRepository(ref.watch(apiClientProvider)),
);

final aftercareProvider = FutureProvider.autoDispose<Aftercare>((ref) => ref.watch(aftercareRepositoryProvider).mine());

final caseCheckinsProvider = FutureProvider.autoDispose.family<List<AftercareCheckin>, String>(
  (ref, caseId) => ref.watch(aftercareRepositoryProvider).checkins(caseId),
);
