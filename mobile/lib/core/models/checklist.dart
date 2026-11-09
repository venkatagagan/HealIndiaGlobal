import 'enums.dart';
import 'json.dart';

/// `ChecklistItemOut` (pre-arrival checklist, PLAN §4.7 / §8.7).
class ChecklistItem {
  const ChecklistItem({
    required this.id,
    required this.key,
    required this.label,
    required this.status,
    this.doneAt,
    this.sortOrder = 0,
    this.caseId,
  });

  factory ChecklistItem.fromJson(JsonMap j) => ChecklistItem(
    id: jStr(j, 'id'),
    caseId: jStrOrNull(j, 'case_id'),
    key: jStr(j, 'key'),
    label: jStr(j, 'label'),
    status: ChecklistStatus.fromJson(j['status']),
    doneAt: jDate(j, 'done_at'),
    sortOrder: jInt(j, 'sort_order'),
  );

  final String id;
  final String? caseId;

  /// See [ChecklistKey] for known values.
  final String key;
  final String label;
  final ChecklistStatus status;
  final DateTime? doneAt;
  final int sortOrder;

  ChecklistKey? get knownKey => ChecklistKey.fromJsonOrNull(key);
  bool get isDone => status == ChecklistStatus.done;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'key': key,
    'label': label,
    'status': status.json,
    'done_at': doneAt?.toUtc().toIso8601String(),
    'sort_order': sortOrder,
  };
}
