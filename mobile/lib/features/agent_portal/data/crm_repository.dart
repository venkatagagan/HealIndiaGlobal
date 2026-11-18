import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';
import 'agent_models.dart';
import 'crm_models.dart';

/// Agent CRM: leads, pipeline, activity timeline and conversion (`/agent-portal/leads*`).
class CrmRepository {
  CrmRepository(this._api);

  final ApiClient _api;

  /// `GET /agent-portal/leads?status=&source=&follow_up=&q=&sort=&page=`
  Future<Paged<Lead>> leads(LeadFilters filters, {int page = 1, int pageSize = 50}) async => Paged.fromJson(
    await _api.get(
      '/agent-portal/leads',
      query: {
        ...filters.toQuery(),
        'sort': filters.followUp == null ? '-updated_at' : 'next_follow_up_at',
        'page': page,
        'page_size': pageSize,
      },
    ),
    Lead.fromJson,
  );

  /// `GET /agent-portal/leads/pipeline` (same filters; status ignored).
  Future<LeadPipeline> pipeline([LeadFilters filters = const LeadFilters()]) async => LeadPipeline.fromJson(
    asJsonMap(await _api.get('/agent-portal/leads/pipeline', query: filters.toQuery(withStatus: false))),
  );

  /// `GET /agent-portal/leads/{id}` (with the activity timeline).
  Future<Lead> lead(String id) async => Lead.fromJson(asJsonMap(await _api.get('/agent-portal/leads/$id')));

  /// `POST /agent-portal/leads` -> 201 lead detail.
  Future<Lead> create(LeadInput input) async =>
      Lead.fromJson(asJsonMap(await _api.post('/agent-portal/leads', data: input.toCreateJson())));

  /// `PATCH /agent-portal/leads/{id}` with only the fields to change ("lost" needs [lostReason]).
  Future<Lead> update(String id, Map<String, Object?> fields) async =>
      Lead.fromJson(asJsonMap(await _api.patch('/agent-portal/leads/$id', data: fields)));

  /// Moves the lead to [status]; "lost" needs [lostReason]. "won" is refused (convert instead).
  Future<Lead> changeStatus(String id, LeadStatus status, {String? lostReason}) =>
      update(id, {'status': status.json, if (status == LeadStatus.lost) 'lost_reason': lostReason?.trim()});

  /// Sets (or clears with null) the next follow-up.
  Future<Lead> scheduleFollowUp(String id, DateTime? at) =>
      update(id, {'next_follow_up_at': at?.toUtc().toIso8601String()});

  /// `DELETE /agent-portal/leads/{id}`
  Future<void> delete(String id) async => _api.delete('/agent-portal/leads/$id');

  /// `POST /agent-portal/leads/{id}/activities {kind, body?, next_follow_up_at?}` -> lead detail.
  Future<Lead> logActivity(String id, {required LeadActivityKind kind, String? body, DateTime? nextFollowUpAt}) async =>
      Lead.fromJson(
        asJsonMap(
          await _api.post(
            '/agent-portal/leads/$id/activities',
            data: compactJson({
              'kind': kind.json,
              'body': body?.trim(),
              'next_follow_up_at': nextFollowUpAt?.toUtc().toIso8601String(),
            }, dropEmptyStrings: true),
          ),
        ),
      );

  /// `POST /agent-portal/leads/{id}/convert` (body of `POST /agent-portal/patients` incl. the consent
  /// attestation) -> the created managed patient.
  Future<AgentPatient> convert(String id, AgentPatientInput input, AgentConsentAttestation consent) async {
    final data = asJsonMap(
      await _api.post('/agent-portal/leads/$id/convert', data: {...input.toCreateJson(), ...consent.toJson()}),
    );
    return AgentPatient.fromJson(jMap(data, 'patient'));
  }
}

final crmRepositoryProvider = Provider<CrmRepository>((ref) => CrmRepository(ref.watch(apiClientProvider)));

/// Leads matching [LeadFilters].
final leadsProvider = FutureProvider.autoDispose.family<Paged<Lead>, LeadFilters>(
  (ref, filters) => ref.watch(crmRepositoryProvider).leads(filters),
);

/// Pipeline summary of all leads (follow-up badge on the dashboard and lead list).
final leadPipelineProvider = FutureProvider.autoDispose<LeadPipeline>(
  (ref) => ref.watch(crmRepositoryProvider).pipeline(),
);

final leadProvider = FutureProvider.autoDispose.family<Lead, String>(
  (ref, id) => ref.watch(crmRepositoryProvider).lead(id),
);
