import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// `/patient/*` endpoints (PLAN §8.2).
class PatientRepository {
  PatientRepository(this._api);

  final ApiClient _api;

  /// `GET /patient/profile`
  Future<PatientProfile> profile() async => PatientProfile.fromJson(asJsonMap(await _api.get('/patient/profile')));

  /// `PUT /patient/profile`
  Future<PatientProfile> updateProfile(PatientProfileUpdate update) async =>
      PatientProfile.fromJson(asJsonMap(await _api.put('/patient/profile', data: update.toJson())));

  /// `GET /patient/companions`
  Future<List<PatientCompanion>> companions() async =>
      parseList(await _api.get('/patient/companions'), PatientCompanion.fromJson);

  /// `POST /patient/companions`
  Future<PatientCompanion> addCompanion(CompanionInput input) async =>
      PatientCompanion.fromJson(asJsonMap(await _api.post('/patient/companions', data: input.toJson())));

  /// `PATCH /patient/companions/{id}`
  Future<PatientCompanion> updateCompanion(String id, CompanionInput input) async =>
      PatientCompanion.fromJson(asJsonMap(await _api.patch('/patient/companions/$id', data: input.toJson())));

  /// `DELETE /patient/companions/{id}`
  Future<void> deleteCompanion(String id) => _api.delete('/patient/companions/$id');

  /// `GET /patient/dashboard`
  Future<PatientDashboard> dashboard() async =>
      PatientDashboard.fromJson(asJsonMap(await _api.get('/patient/dashboard')));

  /// `GET /patient/saved`
  Future<List<SavedItem>> saved({SavedEntityType? entityType}) async =>
      parseList(await _api.get('/patient/saved', query: {'entity_type': entityType?.json}), SavedItem.fromJson);

  /// `POST /patient/saved {entity_type, entity_id}`
  Future<void> save(SavedEntityType entityType, String entityId) =>
      _api.post('/patient/saved', data: {'entity_type': entityType.json, 'entity_id': entityId});

  /// `DELETE /patient/saved {entity_type, entity_id}` (sent as body and query for compatibility).
  Future<void> unsave(SavedEntityType entityType, String entityId) {
    final payload = {'entity_type': entityType.json, 'entity_id': entityId};
    return _api.delete('/patient/saved', data: payload, query: payload);
  }
}

final patientRepositoryProvider = Provider<PatientRepository>((ref) => PatientRepository(ref.watch(apiClientProvider)));

/// Patient profile of the signed-in user (requires a session).
final patientProfileProvider = FutureProvider.autoDispose<PatientProfile>((ref) {
  ref.watch(currentUserProvider.select((u) => u?.id));
  return ref.watch(patientRepositoryProvider).profile();
});

/// Pre-arrival dashboard (Trips tab).
final patientDashboardProvider = FutureProvider.autoDispose<PatientDashboard>((ref) {
  ref.watch(currentUserProvider.select((u) => u?.id));
  return ref.watch(patientRepositoryProvider).dashboard();
});

final companionsProvider = FutureProvider.autoDispose<List<PatientCompanion>>(
  (ref) => ref.watch(patientRepositoryProvider).companions(),
);

/// Saved hospitals / doctors / procedures.
final savedItemsProvider = FutureProvider.autoDispose<List<SavedItem>>((ref) {
  ref.watch(currentUserProvider.select((u) => u?.id));
  return ref.watch(patientRepositoryProvider).saved();
});
