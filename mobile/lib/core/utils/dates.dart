import 'package:intl/intl.dart';

import '../../l10n/l10n.dart';

/// Date helpers. The API emits ISO-8601 UTC timestamps and `YYYY-MM-DD` dates (PLAN §3); models
/// convert timestamps to local time when parsing.
///
/// Formats follow the app language (`Intl.defaultLocale`, set when the language changes): month and day
/// names are translated and the time uses the locale's clock (`10:00 AM` in English, `10:00` in French).
abstract final class Dates {
  static final Map<String, DateFormat> _cache = {};

  static DateFormat _fmt(String key, DateFormat Function() create) =>
      _cache.putIfAbsent('${Intl.getCurrentLocale()}|$key', create);

  static DateFormat get _day => _fmt('day', () => DateFormat('d MMM yyyy'));
  static DateFormat get _dayShort => _fmt('dayShort', () => DateFormat('d MMM'));
  static DateFormat get _monthYear => _fmt('monthYear', () => DateFormat('MMMM yyyy'));
  static DateFormat get _time => _fmt('time', DateFormat.jm);
  static DateFormat get _weekday => _fmt('weekday', () => DateFormat('EEE, d MMM'));

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
  static String dayTime(DateTime? d) => d == null ? '' : '${_day.format(d)}, ${_time.format(d)}';

  /// `Mon, 12 Oct`
  static String weekday(DateTime? d) => d == null ? '' : _weekday.format(d);

  /// `YYYY-MM-DD` (API date format).
  static String api(DateTime d) => DateFormat('yyyy-MM-dd', 'en_US').format(d);

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
    final l10n = L10n.current;
    if (diff.inSeconds < 60) return l10n.datesJustNow;
    if (diff.inMinutes < 60) return l10n.datesMinutesAgo(diff.inMinutes);
    if (diff.inHours < 24 && isSameDay(d, n)) return l10n.datesHoursAgo(diff.inHours);
    if (isSameDay(d, n.subtract(const Duration(days: 1)))) return l10n.datesYesterday;
    if (diff.inDays < 7) return l10n.datesDaysAgo(diff.inDays);
    return d.year == n.year ? dayShort(d) : day(d);
  }

  /// Chat-list style timestamp: time today, weekday this week, else date.
  static String chatStamp(DateTime? d, {DateTime? now}) {
    if (d == null) return '';
    final n = now ?? DateTime.now();
    if (isSameDay(d, n)) return time(d);
    if (n.difference(d).inDays < 7) return _fmt('weekdayShort', () => DateFormat('EEE')).format(d);
    return dayShort(d);
  }
}
