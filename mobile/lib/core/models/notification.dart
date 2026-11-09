import 'json.dart';

/// `NotificationOut` (PLAN §8.9). Named `AppNotification` to avoid clashing with Flutter's
/// `Notification` class.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    this.body,
    this.data = const {},
    this.readAt,
    this.createdAt,
  });

  factory AppNotification.fromJson(JsonMap j) => AppNotification(
    id: jStr(j, 'id'),
    kind: jStr(j, 'kind'),
    title: jStr(j, 'title'),
    body: jStrOrNull(j, 'body'),
    data: jMap(j, 'data'),
    readAt: jDate(j, 'read_at'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;

  /// Event-style kind, e.g. `booking.confirmed`, `message.created`, `screening.completed`.
  final String kind;
  final String title;
  final String? body;

  /// Free-form payload (`case_id`, `booking_id`, `conversation_id`, `screening_id`...).
  final JsonMap data;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isRead => readAt != null;

  AppNotification markRead() => AppNotification(
    id: id,
    kind: kind,
    title: title,
    body: body,
    data: data,
    readAt: readAt ?? DateTime.now(),
    createdAt: createdAt,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind,
    'title': title,
    'body': body,
    'data': data,
    'read_at': readAt?.toUtc().toIso8601String(),
    'created_at': createdAt?.toUtc().toIso8601String(),
  };
}
