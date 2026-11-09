import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../l10n/l10n.dart';

/// Month grid used on "Select Dates": available days are green circles, unavailable days grey,
/// the selected day violet (design "Treatment Selection").
class AvailabilityCalendar extends StatelessWidget {
  const AvailabilityCalendar({
    super.key,
    required this.month,
    required this.isAvailable,
    required this.onSelect,
    required this.onMonthChanged,
    this.selected,
    this.firstMonth,
    this.lastMonth,
    this.loading = false,
  });

  /// Any day in the month shown.
  final DateTime month;
  final DateTime? selected;
  final bool Function(DateTime day) isAvailable;
  final ValueChanged<DateTime> onSelect;
  final ValueChanged<DateTime> onMonthChanged;
  final DateTime? firstMonth;
  final DateTime? lastMonth;

  /// Shows a thin progress bar while the month's availability loads.
  final bool loading;

  bool _canGo(int delta) {
    final target = DateTime(month.year, month.month + delta);
    if (delta < 0 && firstMonth != null) return !target.isBefore(DateTime(firstMonth!.year, firstMonth!.month));
    if (delta > 0 && lastMonth != null) return !target.isAfter(DateTime(lastMonth!.year, lastMonth!.month));
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final leading = first.weekday % 7; // Sunday-first grid
    final cells = leading + daysInMonth;
    final rows = (cells / 7).ceil();
    // Sunday-first narrow weekday names in the app language ("S M T W T F S" in English).
    final weekdays = MaterialLocalizations.of(context).narrowWeekdays;

    Widget arrow(int delta) {
      final enabled = _canGo(delta);
      return Material(
        color: context.colors.surfaceContainerHighest.withValues(alpha: 0.9),
        shape: const CircleBorder(),
        child: IconButton(
          key: ValueKey(delta < 0 ? 'calendar-prev' : 'calendar-next'),
          tooltip: delta < 0 ? context.l10n.bookCalendarPreviousMonth : context.l10n.bookCalendarNextMonth,
          visualDensity: VisualDensity.compact,
          iconSize: 20,
          onPressed: enabled ? () => onMonthChanged(DateTime(month.year, month.month + delta)) : null,
          icon: Icon(delta < 0 ? Icons.chevron_left_rounded : Icons.chevron_right_rounded),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          Dates.monthYear(first),
          textAlign: TextAlign.center,
          style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (final w in weekdays)
              Expanded(
                child: Text(
                  w,
                  textAlign: TextAlign.center,
                  style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(height: 3, child: loading ? const LinearProgressIndicator(minHeight: 3) : null),
        const SizedBox(height: 4),
        Stack(
          alignment: Alignment.center,
          children: [
            Column(
              children: [
                for (var r = 0; r < rows; r++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        for (var c = 0; c < 7; c++)
                          Expanded(child: _cell(context, r * 7 + c - leading + 1, daysInMonth)),
                      ],
                    ),
                  ),
              ],
            ),
            Align(alignment: AlignmentDirectional.centerStart, child: arrow(-1)),
            Align(alignment: AlignmentDirectional.centerEnd, child: arrow(1)),
          ],
        ),
      ],
    );
  }

  Widget _cell(BuildContext context, int day, int daysInMonth) {
    if (day < 1 || day > daysInMonth) return const SizedBox(height: 40);
    final date = DateTime(month.year, month.month, day);
    final available = isAvailable(date);
    final isSelected = Dates.isSameDay(date, selected);
    final Color bg;
    final Color fg;
    if (isSelected) {
      bg = AppColors.violet;
      fg = Colors.white;
    } else if (available) {
      bg = AppColors.primary.withValues(alpha: context.isDark ? 0.16 : 0.14);
      fg = context.isDark ? AppColors.primary : AppColors.primaryDark;
    } else {
      bg = context.palette.surfaceAlt;
      fg = context.palette.textMuted;
    }
    final label = context.l10n.bookCalendarDaySemantics(
      Dates.day(date),
      isSelected ? 'selected' : (available ? 'available' : 'unavailable'),
    );
    return Center(
      child: Semantics(
        button: available,
        selected: isSelected,
        label: label,
        excludeSemantics: true,
        child: InkResponse(
          key: ValueKey('day-${Dates.api(date)}'),
          onTap: available ? () => onSelect(date) : null,
          radius: 24,
          child: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
            child: Text(
              '$day',
              style: context.text.labelLarge?.copyWith(
                color: fg,
                fontWeight: isSelected || available ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
