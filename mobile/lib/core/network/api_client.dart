import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/token_storage.dart';
import '../config/env.dart';
import '../models/json.dart';
import '../models/user.dart';
import 'api_exception.dart';

export 'api_exception.dart';

/// HTTP client for `/api/v1` (PLAN §8).
///
/// * Sends `X-Client-Type: mobile` so the API returns `refresh_token` in auth responses.
/// * Adds `Authorization: Bearer <access>` unless the request opts out with [ApiClient.noAuth].
/// * On a 401 it performs a **single-flight** `POST /auth/refresh` with the stored refresh token
///   (concurrent 401s share one refresh) and replays the request once.
/// * Every failure is thrown as an [ApiException] (PLAN §3 error envelope).
/// * Emits [sessionExpired] when the refresh token is rejected (the auth controller signs out) and
///   [sessionRefreshed] after a successful rotation.
class ApiClient {
  ApiClient({required this._tokens, String? baseUrl, HttpClientAdapter? httpClientAdapter})
    : dio = Dio(_baseOptions(baseUrl ?? Env.apiBaseUrl)),
      _refreshDio = Dio(_baseOptions(baseUrl ?? Env.apiBaseUrl)) {
    if (httpClientAdapter != null) {
      dio.httpClientAdapter = httpClientAdapter;
      _refreshDio.httpClientAdapter = httpClientAdapter;
    }
    dio.interceptors.add(_AuthInterceptor(this));
  }

  /// Pass as `options:` extra to skip the bearer header and 401-refresh handling (login, register...).
  static const Map<String, Object?> noAuth = {_kSkipAuth: true};

  static const _kSkipAuth = 'hig.skip_auth';
  static const _kRetried = 'hig.retried';

  static BaseOptions _baseOptions(String baseUrl) => BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
    sendTimeout: const Duration(seconds: 30),
    responseType: ResponseType.json,
    headers: const {'X-Client-Type': 'mobile', 'Accept': 'application/json'},
  );

  final TokenStorage _tokens;

  /// Underlying Dio instance (exposed for advanced use such as cancel tokens / progress).
  final Dio dio;
  final Dio _refreshDio;

  final StreamController<void> _expiredCtrl = StreamController<void>.broadcast();
  final StreamController<AuthSession> _refreshedCtrl = StreamController<AuthSession>.broadcast();
  Future<String?>? _refreshing;

  /// Fires when the session can no longer be refreshed (tokens already cleared).
  Stream<void> get sessionExpired => _expiredCtrl.stream;

  /// Fires after every successful token rotation with the new `TokenOut`.
  Stream<AuthSession> get sessionRefreshed => _refreshedCtrl.stream;

  TokenStorage get tokens => _tokens;

  String get baseUrl => dio.options.baseUrl;

  // ---------------------------------------------------------------- requests

  Future<dynamic> get(
    String path, {
    Map<String, Object?>? query,
    Map<String, Object?>? extra,
    CancelToken? cancelToken,
  }) => _send(
    () => dio.get<dynamic>(
      path,
      queryParameters: _query(query),
      options: Options(extra: extra),
      cancelToken: cancelToken,
    ),
  );

  Future<dynamic> post(
    String path, {
    Object? data,
    Map<String, Object?>? query,
    Map<String, String>? headers,
    Map<String, Object?>? extra,
    CancelToken? cancelToken,
  }) => _send(
    () => dio.post<dynamic>(
      path,
      data: data ?? const <String, dynamic>{},
      queryParameters: _query(query),
      options: Options(headers: headers, extra: extra),
      cancelToken: cancelToken,
    ),
  );

  Future<dynamic> put(String path, {Object? data, Map<String, Object?>? query, Map<String, Object?>? extra}) => _send(
    () => dio.put<dynamic>(
      path,
      data: data,
      queryParameters: _query(query),
      options: Options(extra: extra),
    ),
  );

  Future<dynamic> patch(String path, {Object? data, Map<String, Object?>? query, Map<String, Object?>? extra}) => _send(
    () => dio.patch<dynamic>(
      path,
      data: data,
      queryParameters: _query(query),
      options: Options(extra: extra),
    ),
  );

  Future<dynamic> delete(String path, {Object? data, Map<String, Object?>? query, Map<String, Object?>? extra}) =>
      _send(
        () => dio.delete<dynamic>(
          path,
          data: data,
          queryParameters: _query(query),
          options: Options(extra: extra),
        ),
      );

  /// Multipart upload. Provide [bytes] (web, or files picked `withData`) or [filePath] (mobile).
  Future<dynamic> upload(
    String path, {
    required String fileName,
    Uint8List? bytes,
    String? filePath,
    String fileField = 'file',
    String? contentType,
    Map<String, Object?> fields = const {},
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
  }) async {
    if (bytes == null && filePath == null) {
      throw const ApiException(statusCode: 0, code: 'bad_request', message: 'No file selected.');
    }
    final mediaType = contentType == null ? null : DioMediaType.parse(contentType);
    final MultipartFile file = bytes != null
        ? MultipartFile.fromBytes(bytes, filename: fileName, contentType: mediaType)
        : await MultipartFile.fromFile(filePath!, filename: fileName, contentType: mediaType);
    final form = FormData.fromMap({
      for (final e in fields.entries)
        if (e.value != null) e.key: e.value.toString(),
      fileField: file,
    });
    return _send(
      () => dio.post<dynamic>(
        path,
        data: form,
        options: Options(sendTimeout: const Duration(minutes: 3), receiveTimeout: const Duration(minutes: 2)),
        onSendProgress: onSendProgress,
        cancelToken: cancelToken,
      ),
    );
  }

  /// Authorized binary download (documents, invoice PDFs).
  Future<Uint8List> getBytes(String path, {Map<String, Object?>? query, ProgressCallback? onReceiveProgress}) async {
    try {
      final res = await dio.get<List<int>>(
        path,
        queryParameters: _query(query),
        options: Options(responseType: ResponseType.bytes, receiveTimeout: const Duration(minutes: 2)),
        onReceiveProgress: onReceiveProgress,
      );
      final data = res.data;
      if (data == null) return Uint8List(0);
      return data is Uint8List ? data : Uint8List.fromList(data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  // ---------------------------------------------------------------- session

  /// Exchanges the stored refresh token for a new token pair. Concurrent callers share one request.
  /// Returns the new access token, or null when there is no valid session (session cleared).
  Future<String?> refreshAccessToken() {
    return _refreshing ??= _performRefresh().whenComplete(() => _refreshing = null);
  }

  Future<String?> _performRefresh() async {
    await _tokens.load();
    final refresh = _tokens.refreshToken;
    if (refresh == null || refresh.isEmpty) {
      await _expire();
      return null;
    }
    try {
      final res = await _refreshDio.post<dynamic>(
        '/auth/refresh',
        data: {'refresh_token': refresh},
        options: Options(headers: const {'X-Requested-With': 'XMLHttpRequest'}),
      );
      final session = AuthSession.fromJson(asJsonMap(res.data));
      if (session.accessToken.isEmpty) {
        await _expire();
        return null;
      }
      await _tokens.saveSession(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: session.user.id.isEmpty ? null : session.user,
      );
      _refreshedCtrl.add(session);
      return session.accessToken;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status != null && status >= 400 && status < 500 && status != 429) {
        await _expire();
        return null;
      }
      throw ApiException.fromDio(e);
    }
  }

  Future<void> _expire() async {
    final hadSession = _tokens.hasSession;
    await _tokens.clear();
    if (hadSession) _expiredCtrl.add(null);
  }

  void close() {
    dio.close(force: true);
    _refreshDio.close(force: true);
    unawaited(_expiredCtrl.close());
    unawaited(_refreshedCtrl.close());
  }

  // ---------------------------------------------------------------- helpers

  static Map<String, dynamic>? _query(Map<String, Object?>? q) {
    if (q == null) return null;
    final out = <String, dynamic>{};
    q.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.isEmpty) return;
      if (v is DateTime) {
        out[k] = toApiDate(v);
      } else if (v is Iterable) {
        final list = v.map((e) => e.toString()).toList();
        if (list.isNotEmpty) out[k] = list;
      } else {
        out[k] = v.toString();
      }
    });
    return out;
  }

  static Future<dynamic> _send(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      final data = res.data;
      if (data is String && data.isEmpty) return null;
      return data;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._client);

  final ApiClient _client;

  bool _skips(RequestOptions o) => o.extra[ApiClient._kSkipAuth] == true;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (!_skips(options)) {
      await _client._tokens.load();
      final token = _client._tokens.accessToken;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final opts = err.requestOptions;
    if (err.response?.statusCode != 401 || _skips(opts) || opts.extra[ApiClient._kRetried] == true) {
      handler.next(err);
      return;
    }
    try {
      final sent = opts.headers['Authorization'];
      final current = _client._tokens.accessToken;
      // Another request already rotated the token while this one was in flight: just replay.
      final String? token = (current != null && current.isNotEmpty && sent != 'Bearer $current')
          ? current
          : await _client.refreshAccessToken();
      if (token == null) {
        handler.next(err);
        return;
      }
      opts.headers['Authorization'] = 'Bearer $token';
      opts.extra[ApiClient._kRetried] = true;
      final data = opts.data;
      if (data is FormData) opts.data = data.clone();
      final response = await _client.dio.fetch<dynamic>(opts);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    } catch (_) {
      handler.next(err);
    }
  }
}

/// The app-wide [ApiClient].
final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(tokens: ref.watch(tokenStorageProvider));
  ref.onDispose(client.close);
  return client;
});
