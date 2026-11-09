/// Tolerant JSON readers shared by every model.
///
/// The API emits snake_case keys (PLAN §3). Numbers backed by PostgreSQL NUMERIC (ratings, match
/// scores, FX rates, distances) may arrive as JSON strings (Pydantic `Decimal`), so numeric readers
/// accept both. Missing / null values fall back to sensible defaults instead of throwing, which keeps
/// the app working while backend modules evolve.
library;

typedef JsonMap = Map<String, dynamic>;

JsonMap asJsonMap(Object? v) {
  if (v is Map<String, dynamic>) return v;
  if (v is Map) return v.map((k, value) => MapEntry(k.toString(), value));
  return <String, dynamic>{};
}

JsonMap? asJsonMapOrNull(Object? v) => v is Map ? asJsonMap(v) : null;

String jStr(JsonMap j, String key, [String fallback = '']) {
  final v = j[key];
  if (v == null) return fallback;
  return v is String ? v : v.toString();
}

String? jStrOrNull(JsonMap j, String key) {
  final v = j[key];
  if (v == null) return null;
  return v is String ? v : v.toString();
}

int? _toInt(Object? v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.round();
  return null;
}

double? _toDouble(Object? v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

int jInt(JsonMap j, String key, [int fallback = 0]) => _toInt(j[key]) ?? fallback;

int? jIntOrNull(JsonMap j, String key) => _toInt(j[key]);

double jDouble(JsonMap j, String key, [double fallback = 0]) => _toDouble(j[key]) ?? fallback;

double? jDoubleOrNull(JsonMap j, String key) => _toDouble(j[key]);

bool jBool(JsonMap j, String key, [bool fallback = false]) {
  final v = j[key];
  if (v is bool) return v;
  if (v is num) return v != 0;
  if (v is String) return v == 'true' || v == '1';
  return fallback;
}

bool? jBoolOrNull(JsonMap j, String key) => j[key] == null ? null : jBool(j, key);

/// Parses an ISO-8601 timestamp (returned in local time) or a `YYYY-MM-DD` date.
DateTime? jDate(JsonMap j, String key) {
  final v = j[key];
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v)?.toLocal();
  return null;
}

/// Parses a `YYYY-MM-DD` calendar date as a local date without time-zone shifting.
DateTime? jDay(JsonMap j, String key) {
  final v = j[key];
  if (v is! String || v.length < 10) return null;
  final d = DateTime.tryParse(v.substring(0, 10));
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

List<String> jStrList(JsonMap j, String key) {
  final v = j[key];
  if (v is List) return v.where((e) => e != null).map((e) => e.toString()).toList(growable: false);
  return const <String>[];
}

List<T> jList<T>(JsonMap j, String key, T Function(JsonMap) fromJson) => parseList(j[key], fromJson);

T? jObj<T>(JsonMap j, String key, T Function(JsonMap) fromJson) {
  final v = j[key];
  return v is Map ? fromJson(asJsonMap(v)) : null;
}

JsonMap jMap(JsonMap j, String key) => asJsonMap(j[key]);

/// Accepts a JSON list or a paginated envelope (`{"items": [...]}`) and maps every element.
List<T> parseList<T>(Object? data, T Function(JsonMap) fromJson) {
  final list = data is List ? data : (data is Map ? data['items'] : null);
  if (list is! List) return <T>[];
  return list.whereType<Map<dynamic, dynamic>>().map((e) => fromJson(asJsonMap(e))).toList(growable: false);
}

/// Formats a date as `YYYY-MM-DD` (API date format).
String toApiDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Removes null values (and optionally empty strings) from a request body / query map.
JsonMap compactJson(Map<String, Object?> m, {bool dropEmptyStrings = false}) {
  final out = <String, dynamic>{};
  m.forEach((k, v) {
    if (v == null) return;
    if (dropEmptyStrings && v is String && v.isEmpty) return;
    out[k] = v;
  });
  return out;
}
