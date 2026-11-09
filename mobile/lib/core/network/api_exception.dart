import 'package:dio/dio.dart';

/// Normalized API error, built from the PLAN §3 error envelope:
/// `{"error": {"code": "not_found", "message": "Case not found", "details": null, "request_id": "..."}}`.
///
/// Transport failures use [statusCode] `0` and codes `network_error`, `timeout` or `cancelled`.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details,
    this.requestId,
  });

  /// Converts any error thrown by the networking stack into an [ApiException].
  factory ApiException.from(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) return ApiException.fromDio(error);
    return ApiException(statusCode: 0, code: 'unknown_error', message: _friendly(error.toString()));
  }

  factory ApiException.fromDio(DioException e) {
    final inner = e.error;
    if (inner is ApiException) return inner;
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiException(
          statusCode: 0,
          code: 'timeout',
          message: 'The server took too long to respond. Please try again.',
        );
      case DioExceptionType.cancel:
        return const ApiException(statusCode: 0, code: 'cancelled', message: 'Request cancelled.');
      case DioExceptionType.connectionError:
        return const ApiException(
          statusCode: 0,
          code: 'network_error',
          message: 'No connection. Check your internet and try again.',
        );
      case DioExceptionType.badCertificate:
        return const ApiException(statusCode: 0, code: 'network_error', message: 'Secure connection failed.');
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        final res = e.response;
        if (res == null) {
          return const ApiException(
            statusCode: 0,
            code: 'network_error',
            message: 'No connection. Check your internet and try again.',
          );
        }
        return ApiException.fromResponse(res.statusCode ?? 0, res.data);
    }
  }

  /// Parses the error envelope of a non-2xx response.
  factory ApiException.fromResponse(int statusCode, Object? data) {
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      return ApiException(
        statusCode: statusCode,
        code: (err['code'] ?? _codeForStatus(statusCode)).toString(),
        message: (err['message'] ?? _messageForStatus(statusCode)).toString(),
        details: err['details'],
        requestId: err['request_id']?.toString(),
      );
    }
    // FastAPI default `{"detail": ...}` fallback (e.g. routing errors before our handlers).
    if (data is Map && data['detail'] != null) {
      final detail = data['detail'];
      return ApiException(
        statusCode: statusCode,
        code: _codeForStatus(statusCode),
        message: detail is String ? detail : _messageForStatus(statusCode),
        details: detail is String ? null : detail,
      );
    }
    return ApiException(
      statusCode: statusCode,
      code: _codeForStatus(statusCode),
      message: _messageForStatus(statusCode),
    );
  }

  final int statusCode;

  /// `validation_error | bad_request | unauthorized | forbidden | not_found | conflict |
  /// rate_limited | payment_error | internal_error | mfa_required | network_error | timeout | ...`
  final String code;
  final String message;
  final Object? details;
  final String? requestId;

  bool get isNetwork => statusCode == 0 && (code == 'network_error' || code == 'timeout');
  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isConflict => statusCode == 409;
  bool get isValidation => statusCode == 422 || code == 'validation_error';
  bool get isRateLimited => statusCode == 429;
  bool get isPaymentError => statusCode == 402;
  bool get isServerError => statusCode >= 500;
  bool get isMfaRequired => code == 'mfa_required';

  /// Google / Apple sign-in would create a new account and the API needs the 18+ answer (CG-24).
  bool get isAgeAttestationRequired => code == 'age_attestation_required';

  /// Only adults may hold this account type (agent / hospital answered "under 18").
  bool get isAdultRequired => code == 'adult_required';

  /// Whether retrying the same request may succeed.
  bool get isRetryable => isNetwork || isServerError || isRateLimited;

  /// Field -> message map from validation `details`. Supports Pydantic style
  /// `[{"loc": ["body", "email"], "msg": "..."}]` and `{"field": "message"}` maps.
  Map<String, String> get fieldErrors {
    final d = details;
    final out = <String, String>{};
    if (d is List) {
      for (final item in d) {
        if (item is Map) {
          final loc = item['loc'];
          final field = loc is List && loc.isNotEmpty ? loc.last.toString() : (item['field']?.toString() ?? '');
          final msg = (item['msg'] ?? item['message'] ?? '').toString();
          if (field.isNotEmpty && msg.isNotEmpty) out.putIfAbsent(field, () => msg);
        }
      }
    } else if (d is Map) {
      d.forEach((k, v) {
        if (v is String) out[k.toString()] = v;
        if (v is List && v.isNotEmpty) out[k.toString()] = v.first.toString();
      });
    }
    return out;
  }

  static String _codeForStatus(int s) => switch (s) {
    400 => 'bad_request',
    401 => 'unauthorized',
    402 => 'payment_error',
    403 => 'forbidden',
    404 => 'not_found',
    409 => 'conflict',
    422 => 'validation_error',
    429 => 'rate_limited',
    >= 500 => 'internal_error',
    _ => 'http_$s',
  };

  static String _messageForStatus(int s) => switch (s) {
    400 => 'The request could not be processed.',
    401 => 'Please sign in to continue.',
    402 => 'The payment could not be completed.',
    403 => 'You do not have access to this.',
    404 => 'Not found.',
    409 => 'This was changed by someone else. Please refresh.',
    422 => 'Please check the highlighted fields.',
    429 => 'Too many attempts. Please wait a moment and try again.',
    >= 500 => 'Something went wrong on our side. Please try again.',
    _ => 'Unexpected error ($s).',
  };

  static String _friendly(String raw) => raw.startsWith('Exception: ') ? raw.substring(11) : raw;

  @override
  String toString() => message;
}

/// User-facing message for any error (ApiException, DioException or other).
String errorMessage(Object? error) {
  if (error == null) return 'Something went wrong.';
  return ApiException.from(error).message;
}
