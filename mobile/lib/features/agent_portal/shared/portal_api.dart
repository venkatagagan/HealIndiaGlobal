/// Request helpers shared by the two partner shells (agent + hospital, PLAN §3.1).
///
/// [ApiClient.get] cannot send custom headers, but hospital members that belong to several hospitals
/// select one with `X-Hospital-Id` (PLAN §8.5). [portalSend] goes through the same [ApiClient.dio]
/// (auth interceptor + single-flight refresh) and maps failures to [ApiException] like the client.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';

/// Sends [method] [path] with optional [headers]; returns the decoded body (null for empty bodies).
Future<dynamic> portalSend(
  ApiClient api,
  String method,
  String path, {
  Object? data,
  Map<String, Object?>? query,
  Map<String, String> headers = const {},
}) async {
  try {
    final res = await api.dio.request<dynamic>(
      path,
      data: data ?? (method == 'GET' || method == 'DELETE' ? null : const <String, dynamic>{}),
      queryParameters: query == null ? null : _cleanQuery(query),
      options: Options(method: method, headers: headers.isEmpty ? null : headers),
    );
    final body = res.data;
    if (body is String && body.isEmpty) return null;
    return body;
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  }
}

Map<String, dynamic> _cleanQuery(Map<String, Object?> q) {
  final out = <String, dynamic>{};
  q.forEach((k, v) {
    if (v == null) return;
    if (v is String && v.isEmpty) return;
    out[k] = v is DateTime ? toApiDate(v) : v;
  });
  return out;
}

/// Hospital explicitly chosen by a hospital member (null = the API default, their first hospital).
class SelectedHospitalController extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String? hospitalId) => state = hospitalId;
}

final selectedHospitalIdProvider = NotifierProvider<SelectedHospitalController, String?>(
  SelectedHospitalController.new,
);

/// The hospital the hospital shell is acting for: the selected one, else the user's first hospital.
final activeHospitalProvider = Provider<UserHospital?>((ref) {
  final hospitals = ref.watch(currentUserProvider)?.hospitals ?? const <UserHospital>[];
  if (hospitals.isEmpty) return null;
  final selected = ref.watch(selectedHospitalIdProvider);
  return hospitals.firstWhere((h) => h.id == selected, orElse: () => hospitals.first);
});

/// Extra headers for partner-portal requests (`X-Hospital-Id` for hospital members).
final portalHeadersProvider = Provider<Map<String, String>>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user?.role != UserRole.hospital) return const {};
  final hospital = ref.watch(activeHospitalProvider);
  return hospital == null ? const {} : {'X-Hospital-Id': hospital.id};
});
