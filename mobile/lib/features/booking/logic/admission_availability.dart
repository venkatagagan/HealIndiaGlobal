import '../../../core/models/models.dart';
import '../../../core/utils/dates.dart';

/// Which admission dates can be booked, derived from `GET /hospitals/{id}/availability`.
///
/// Mirrors the server rule used by `POST /bookings`: when the hospital publishes `admission` slots,
/// only days with free admission capacity can be booked; when it publishes none, admissions are
/// unrestricted. Admission must always be strictly after today.
class AdmissionAvailability {
  AdmissionAvailability._(this._admissionFree, this.restricted);

  factory AdmissionAvailability.fromSlots(List<AvailabilitySlot> slots) {
    final admission = slots.where((s) => s.slotKind == 'admission').toList();
    final free = <DateTime, int>{};
    for (final s in admission) {
      final d = Dates.dateOnly(s.date);
      free[d] = (free[d] ?? 0) + (s.available < 0 ? 0 : s.available);
    }
    return AdmissionAvailability._(free, admission.isNotEmpty);
  }

  /// No data (e.g. while loading): every future day is selectable.
  factory AdmissionAvailability.unrestricted() => AdmissionAvailability._(const {}, false);

  final Map<DateTime, int> _admissionFree;

  /// True when the hospital limits admissions to published slots.
  final bool restricted;

  /// Free admission capacity on [day] (null when not restricted).
  int? freeOn(DateTime day) => restricted ? (_admissionFree[Dates.dateOnly(day)] ?? 0) : null;

  bool isAvailable(DateTime day, {DateTime? now}) {
    final d = Dates.dateOnly(day);
    final today = Dates.dateOnly(now ?? DateTime.now());
    if (!d.isAfter(today)) return false;
    if (!restricted) return true;
    return (_admissionFree[d] ?? 0) > 0;
  }

  /// First bookable day in [month] (or null).
  DateTime? firstAvailableIn(DateTime month, {DateTime? now}) {
    final last = DateTime(month.year, month.month + 1, 0).day;
    for (var day = 1; day <= last; day++) {
      final d = DateTime(month.year, month.month, day);
      if (isAvailable(d, now: now)) return d;
    }
    return null;
  }
}
