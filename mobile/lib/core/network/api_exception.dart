import 'package:dio/dio.dart';

import '../../l10n/l10n.dart';

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
        return ApiException(statusCode: 0, code: 'timeout', message: L10n.current.apiErrorTimeout);
      case DioExceptionType.cancel:
        return ApiException(statusCode: 0, code: 'cancelled', message: L10n.current.apiErrorCancelled);
      case DioExceptionType.connectionError:
        return ApiException(statusCode: 0, code: 'network_error', message: L10n.current.apiErrorNoConnection);
      case DioExceptionType.badCertificate:
        return ApiException(statusCode: 0, code: 'network_error', message: L10n.current.apiErrorSecureConnection);
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        final res = e.response;
        if (res == null) {
          return ApiException(statusCode: 0, code: 'network_error', message: L10n.current.apiErrorNoConnection);
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

  /// Fallback text for a status without a server message, in the app's current language.
  static String _messageForStatus(int s) {
    final l = L10n.current;
    return switch (s) {
      400 => l.apiErrorBadRequest,
      401 => l.apiErrorSignIn,
      402 => l.apiErrorPayment,
      403 => l.apiErrorForbidden,
      404 => l.apiErrorNotFound,
      409 => l.apiErrorConflict,
      422 => l.apiErrorValidation,
      429 => l.apiErrorRateLimited,
      >= 500 => l.apiErrorServer,
      _ => l.apiErrorUnexpected(s),
    };
  }

  static String _friendly(String raw) => raw.startsWith('Exception: ') ? raw.substring(11) : raw;

  @override
  String toString() => message;
}

/// User-facing message for any error (ApiException, DioException or other).
String errorMessage(Object? error) {
  if (error == null) return L10n.current.apiErrorGeneric;
  return ApiException.from(error).message;
}
