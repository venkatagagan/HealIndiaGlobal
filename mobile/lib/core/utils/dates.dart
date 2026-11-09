import 'package:intl/intl.dart';

/// Date helpers. The API emits ISO-8601 UTC timestamps and `YYYY-MM-DD` dates (PLAN §3); models
/// convert timestamps to local time when parsing.
abstract final class Dates {
  static final DateFormat _day = DateFormat('d MMM yyyy');
  static final DateFormat _dayShort = DateFormat('d MMM');
  static final DateFormat _monthYear = DateFormat('MMMM yyyy');
  static final DateFormat _time = DateFormat('h:mm a');
  static final DateFormat _dayTime = DateFormat('d MMM yyyy, h:mm a');
  static final DateFormat _weekday = DateFormat('EEE, d MMM');

  /// `12 Oct 2026`
  static String day(DateTime? d) => d == null ? '' : _day.format(d);

  /// `12 Oct`
  static String dayShort(DateTime? d) => d == null ? '' : _dayShort.format(d);

  /// `October 2026`
  static String monthYear(DateTime? d) => d == null ? '' : _monthYear.format(d);

  /// `10:00 AM`
  static String time(DateTime? d) => d == null ? '' : _time.format(d);

  /// `10:00 AM - 11:00 AM`
  static String timeRange(DateTime? start, DateTime? end) {
    if (start == null) return '';
    if (end == null) return time(start);
    return '${time(start)} - ${time(end)}';
  }

  /// `12 Oct 2026, 10:00 AM`
  static String dayTime(DateTime? d) => d == null ? '' : _dayTime.format(d);

  /// `Mon, 12 Oct`
  static String weekday(DateTime? d) => d == null ? '' : _weekday.format(d);

  /// `YYYY-MM-DD` (API date format).
  static String api(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  /// Strips the time component.
  static DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static bool isSameDay(DateTime? a, DateTime? b) =>
      a != null && b != null && a.year == b.year && a.month == b.month && a.day == b.day;

  /// Whole calendar days from today until [d] (negative when in the past).
  static int daysUntil(DateTime d, {DateTime? now}) => dateOnly(d).difference(dateOnly(now ?? DateTime.now())).inDays;

  /// Age in whole years at [now].
  static int age(DateTime dob, {DateTime? now}) {
    final n = now ?? DateTime.now();
    var years = n.year - dob.year;
    if (n.month < dob.month || (n.month == dob.month && n.day < dob.day)) years--;
    return years;
  }

  /// `just now`, `5 min ago`, `3 h ago`, `Yesterday`, `2 days ago`, then `12 Oct`.
  static String relative(DateTime? d, {DateTime? now}) {
    if (d == null) return '';
    final n = now ?? DateTime.now();
    final diff = n.difference(d);
    if (diff.isNegative) return dayTime(d);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24 && isSameDay(d, n)) return '${diff.inHours} h ago';
    if (isSameDay(d, n.subtract(const Duration(days: 1)))) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays} days ago';
    return d.year == n.year ? dayShort(d) : day(d);
  }

  /// Chat-list style timestamp: time today, weekday this week, else date.
  static String chatStamp(DateTime? d, {DateTime? now}) {
    if (d == null) return '';
    final n = now ?? DateTime.now();
    if (isSameDay(d, n)) return time(d);
    if (n.difference(d).inDays < 7) return DateFormat('EEE').format(d);
    return dayShort(d);
  }
}
