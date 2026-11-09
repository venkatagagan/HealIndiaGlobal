import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';
import '../../../core/repositories/document_repository.dart';
import 'agent_models.dart';

/// Agent-portal endpoints (PLAN §8.10) plus the agent-specific variants of cases / screenings
/// (`patient_id` on behalf of a managed patient, PLAN §8.6-8.7).
///
/// Bookings, quotes, payments and documents reuse the core repositories (same endpoints, scoped
/// server-side to the agent's patients).
class AgentPortalRepository {
  AgentPortalRepository(this._api);

  final ApiClient _api;

  /// `GET /agent-portal/profile`
  Future<AgentProfile> profile() async => AgentProfile.fromJson(asJsonMap(await _api.get('/agent-portal/profile')));

  /// `GET /agent-portal/dashboard`
  Future<AgentDashboard> dashboard() async =>
      AgentDashboard.fromJson(asJsonMap(await _api.get('/agent-portal/dashboard')));

  /// `GET /agent-portal/referral`
  Future<AgentReferral> referral() async => AgentReferral.fromJson(asJsonMap(await _api.get('/agent-portal/referral')));

  /// `GET /agent-portal/patients?q=&page=`
  Future<Paged<AgentPatient>> patients({String? q, int page = 1, int pageSize = 50}) async => Paged.fromJson(
    await _api.get('/agent-portal/patients', query: {'q': q, 'page': page, 'page_size': pageSize}),
    AgentPatient.fromJson,
  );

  /// `GET /agent-portal/patients/{id}`
  Future<AgentPatient> patient(String id) async =>
      AgentPatient.fromJson(asJsonMap(await _api.get('/agent-portal/patients/$id')));

  /// `POST /agent-portal/patients` — creates the patient account (invite e-mailed when an e-mail is given).
  Future<AgentPatient> createPatient(AgentPatientInput input) async =>
      AgentPatient.fromJson(asJsonMap(await _api.post('/agent-portal/patients', data: input.toCreateJson())));

  /// `PATCH /agent-portal/patients/{id}`
  Future<AgentPatient> updatePatient(String id, AgentPatientInput input) async =>
      AgentPatient.fromJson(asJsonMap(await _api.patch('/agent-portal/patients/$id', data: input.toUpdateJson())));

  /// `GET /cases?patient_id=&status=&q=` (scoped to the agent's patients).
  Future<Paged<MedicalCase>> cases({String? patientId, CaseStatus? status, String? q, int pageSize = 50}) async =>
      Paged.fromJson(
        await _api.get(
          '/cases',
          query: {'patient_id': patientId, 'status': status?.json, 'q': q, 'page': 1, 'page_size': pageSize},
        ),
        MedicalCase.fromJson,
      );

  /// `POST /cases {patient_id, hospital_id, ...}` — request a quote on behalf of a patient.
  Future<MedicalCase> createCase({
    required String patientId,
    required String hospitalId,
    String? doctorId,
    String? procedureId,
    String? specialtyId,
    String? screeningId,
    String? notes,
  }) async => MedicalCase.fromJson(
    asJsonMap(
      await _api.post(
        '/cases',
        data: compactJson({
          'patient_id': patientId,
          'hospital_id': hospitalId,
          'doctor_id': doctorId,
          'procedure_id': procedureId,
          'specialty_id': specialtyId,
          'screening_id': screeningId,
          'patient_notes': notes,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `GET /screenings?patient_id=`
  Future<List<Screening>> screenings(String patientId) async =>
      parseList(await _api.get('/screenings', query: {'patient_id': patientId, 'page_size': 50}), Screening.fromJson);

  /// `POST /screenings {patient_id, specialty_slug?}` -> draft screening owned by the patient.
  Future<Screening> createScreening({required String patientId, String? specialtySlug}) async => Screening.fromJson(
    asJsonMap(
      await _api.post('/screenings', data: compactJson({'patient_id': patientId, 'specialty_slug': specialtySlug})),
    ),
  );
}

final agentRepositoryProvider = Provider<AgentPortalRepository>(
  (ref) => AgentPortalRepository(ref.watch(apiClientProvider)),
);

final agentDashboardProvider = FutureProvider.autoDispose<AgentDashboard>(
  (ref) => ref.watch(agentRepositoryProvider).dashboard(),
);

final agentProfileProvider = FutureProvider.autoDispose<AgentProfile>(
  (ref) => ref.watch(agentRepositoryProvider).profile(),
);

final agentReferralProvider = FutureProvider.autoDispose<AgentReferral>(
  (ref) => ref.watch(agentRepositoryProvider).referral(),
);

/// Patients matching a search query ('' = all).
final agentPatientsProvider = FutureProvider.autoDispose.family<Paged<AgentPatient>, String>(
  (ref, q) => ref.watch(agentRepositoryProvider).patients(q: q.isEmpty ? null : q),
);

final agentPatientProvider = FutureProvider.autoDispose.family<AgentPatient, String>(
  (ref, id) => ref.watch(agentRepositoryProvider).patient(id),
);

/// Cases of one patient (for quote comparison and the patient page).
final patientCasesProvider = FutureProvider.autoDispose.family<List<MedicalCase>, String>(
  (ref, patientId) async => (await ref.watch(agentRepositoryProvider).cases(patientId: patientId)).items,
);

/// All cases of the agent, optionally filtered by status.
final agentCasesProvider = FutureProvider.autoDispose.family<Paged<MedicalCase>, CaseStatus?>(
  (ref, status) => ref.watch(agentRepositoryProvider).cases(status: status),
);

final patientScreeningsProvider = FutureProvider.autoDispose.family<List<Screening>, String>(
  (ref, patientId) => ref.watch(agentRepositoryProvider).screenings(patientId),
);

final patientDocumentsProvider = FutureProvider.autoDispose.family<List<AppDocument>, String>(
  (ref, patientId) => ref.watch(documentRepositoryProvider).list(patientId: patientId),
);
