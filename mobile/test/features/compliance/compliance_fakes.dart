// Shared fakes for the store-compliance tests (push, reports, 18+ attestation).
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/network/api_client.dart';

/// Records every request and answers with `handler` (status, json body); 204 by default.
class RecordingAdapter implements HttpClientAdapter {
  RecordingAdapter([(int, Object?) Function(RequestOptions o)? handler]) : handler = handler ?? ((_) => (204, null));

  final (int, Object?) Function(RequestOptions o) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final (status, body) = handler(options);
    return ResponseBody.fromString(
      body == null ? '' : jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// An [ApiClient] with a stored session talking to [adapter].
Future<ApiClient> fakeApi(RecordingAdapter adapter, {TokenStorage? tokens}) async {
  final t = tokens ?? InMemoryTokenStorage();
  await t.saveSession(accessToken: 'A1', refreshToken: 'R1');
  return ApiClient(tokens: t, baseUrl: 'http://test/api/v1', httpClientAdapter: adapter);
}

Map<String, Object?> tokenOut({String role = 'patient'}) => {
  'access_token': 'A2',
  'token_type': 'bearer',
  'expires_in': 900,
  'refresh_token': 'R2',
  'user': {'id': 'u1', 'role': role, 'status': 'active', 'full_name': 'Jane', 'is_guest': false},
};
