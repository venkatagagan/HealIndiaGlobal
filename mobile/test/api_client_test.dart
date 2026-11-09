import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/token_storage.dart';
import 'package:heal_india_global/core/network/api_client.dart';

/// Scripted HTTP adapter: `handler` returns (status, json body) per request.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);

  final (int, Object?) Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    await Future<void>.delayed(const Duration(milliseconds: 5));
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

Map<String, Object?> tokenOut(String access, String refresh) => {
  'access_token': access,
  'token_type': 'bearer',
  'expires_in': 900,
  'refresh_token': refresh,
  'user': {'id': 'u1', 'role': 'patient', 'status': 'active', 'full_name': 'Jane', 'is_guest': false},
};

void main() {
  test('sends X-Client-Type and bearer token', () async {
    final tokens = InMemoryTokenStorage();
    await tokens.saveSession(accessToken: 'A1', refreshToken: 'R1');
    final adapter = FakeAdapter((o) => (200, {'ok': true}));
    final api = ApiClient(tokens: tokens, baseUrl: 'http://test/api/v1', httpClientAdapter: adapter);

    final res = await api.get('/auth/me');

    expect(res, {'ok': true});
    expect(adapter.requests.single.headers['X-Client-Type'], 'mobile');
    expect(adapter.requests.single.headers['Authorization'], 'Bearer A1');
    expect(adapter.requests.single.uri.toString(), 'http://test/api/v1/auth/me');
  });

  test('concurrent 401s trigger a single refresh and replay with the new token', () async {
    final tokens = InMemoryTokenStorage();
    await tokens.saveSession(accessToken: 'OLD', refreshToken: 'R1');
    var refreshCalls = 0;
    final adapter = FakeAdapter((o) {
      if (o.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        expect(o.data, {'refresh_token': 'R1'});
        return (200, tokenOut('NEW', 'R2'));
      }
      final auth = o.headers['Authorization'];
      if (auth == 'Bearer NEW') return (200, {'path': o.path});
      return (
        401,
        {
          'error': {'code': 'unauthorized', 'message': 'Token expired', 'details': null, 'request_id': 'x'},
        },
      );
    });
    final api = ApiClient(tokens: tokens, baseUrl: 'http://test/api/v1', httpClientAdapter: adapter);
    final refreshed = <String>[];
    api.sessionRefreshed.listen((s) => refreshed.add(s.accessToken));

    final results = await Future.wait([api.get('/cases'), api.get('/bookings'), api.get('/patient/dashboard')]);

    expect(refreshCalls, 1);
    expect(results.map((r) => (r as Map)['path']), ['/cases', '/bookings', '/patient/dashboard']);
    expect(tokens.accessToken, 'NEW');
    expect(tokens.refreshToken, 'R2');
    expect(refreshed, ['NEW']);
  });

  test('rejected refresh clears the session and emits sessionExpired', () async {
    final tokens = InMemoryTokenStorage();
    await tokens.saveSession(accessToken: 'OLD', refreshToken: 'BAD');
    final adapter = FakeAdapter((o) {
      if (o.path.endsWith('/auth/refresh')) {
        return (
          401,
          {
            'error': {'code': 'unauthorized', 'message': 'Refresh token reused'},
          },
        );
      }
      return (
        401,
        {
          'error': {'code': 'unauthorized', 'message': 'Token expired'},
        },
      );
    });
    final api = ApiClient(tokens: tokens, baseUrl: 'http://test/api/v1', httpClientAdapter: adapter);
    var expired = 0;
    api.sessionExpired.listen((_) => expired++);

    await expectLater(
      api.get('/cases'),
      throwsA(
        isA<ApiException>().having((e) => e.statusCode, 'status', 401).having((e) => e.isUnauthorized, 'unauth', true),
      ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(tokens.hasSession, isFalse);
    expect(expired, 1);
  });

  test('maps the error envelope to ApiException with field errors', () async {
    final tokens = InMemoryTokenStorage();
    final adapter = FakeAdapter(
      (o) => (
        422,
        {
          'error': {
            'code': 'validation_error',
            'message': 'Invalid input',
            'details': [
              {
                'loc': ['body', 'email'],
                'msg': 'value is not a valid email address',
              },
            ],
            'request_id': 'req-1',
          },
        },
      ),
    );
    final api = ApiClient(tokens: tokens, baseUrl: 'http://test/api/v1', httpClientAdapter: adapter);

    try {
      await api.post('/auth/register', data: {'email': 'x'}, extra: ApiClient.noAuth);
      fail('expected ApiException');
    } on ApiException catch (e) {
      expect(e.statusCode, 422);
      expect(e.code, 'validation_error');
      expect(e.isValidation, isTrue);
      expect(e.requestId, 'req-1');
      expect(e.fieldErrors, {'email': 'value is not a valid email address'});
      expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    }
  });

  test('401 on a noAuth request (bad credentials / mfa_required) is not refreshed', () async {
    final tokens = InMemoryTokenStorage();
    await tokens.saveSession(accessToken: 'A', refreshToken: 'R');
    final adapter = FakeAdapter(
      (o) => (
        401,
        {
          'error': {'code': 'mfa_required', 'message': 'Enter your authenticator code'},
        },
      ),
    );
    final api = ApiClient(tokens: tokens, baseUrl: 'http://test/api/v1', httpClientAdapter: adapter);

    await expectLater(
      api.post('/auth/login', data: {'email': 'a@b.c', 'password': 'x'}, extra: ApiClient.noAuth),
      throwsA(isA<ApiException>().having((e) => e.isMfaRequired, 'mfa', true)),
    );
    expect(adapter.requests, hasLength(1));
    expect(tokens.refreshToken, 'R');
  });
}
