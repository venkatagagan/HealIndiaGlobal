import 'enums.dart';
import 'json.dart';

/// `ItineraryItemOut` (PLAN §4.7 / §8.7).
class ItineraryItem {
  const ItineraryItem({
    required this.id,
    required this.kind,
    required this.title,
    this.caseId,
    this.description,
    this.startsAt,
    this.endsAt,
    this.location,
    this.lat,
    this.lng,
    this.status = ItineraryItemStatus.scheduled,
  });

  factory ItineraryItem.fromJson(JsonMap j) => ItineraryItem(
    id: jStr(j, 'id'),
    caseId: jStrOrNull(j, 'case_id'),
    kind: ItineraryKind.fromJson(j['kind']),
    title: jStr(j, 'title'),
    description: jStrOrNull(j, 'description'),
    startsAt: jDate(j, 'starts_at'),
    endsAt: jDate(j, 'ends_at'),
    location: jStrOrNull(j, 'location'),
    lat: jDoubleOrNull(j, 'lat'),
    lng: jDoubleOrNull(j, 'lng'),
    status: ItineraryItemStatus.fromJson(j['status']),
  );

  final String id;
  final String? caseId;
  final ItineraryKind kind;
  final String title;
  final String? description;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final String? location;
  final double? lat;
  final double? lng;
  final ItineraryItemStatus status;

  bool get hasCoordinates => lat != null && lng != null;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'kind': kind.json,
    'title': title,
    'description': description,
    'starts_at': startsAt?.toUtc().toIso8601String(),
    'ends_at': endsAt?.toUtc().toIso8601String(),
    'location': location,
    'lat': lat,
    'lng': lng,
    'status': status.json,
  };
}
