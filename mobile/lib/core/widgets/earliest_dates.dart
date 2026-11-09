import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/app_theme.dart';
import '../utils/dates.dart';
import 'status_badge.dart';

/// "Earliest consult: 12 Nov" / "Earliest admission: 14 Nov" chips from `next_available_*`.
/// Renders nothing when neither date is known.
class EarliestDates extends StatelessWidget {
  const EarliestDates({super.key, this.consultation, this.admission, this.dense = true, this.showConsultation = true});

  final DateTime? consultation;
  final DateTime? admission;
  final bool dense;

  /// Hide the consultation chip (e.g. lists ordered by admission date).
  final bool showConsultation;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = showConsultation ? consultation : null;
    final a = admission;
    if (c == null && a == null) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        if (c != null)
          StatusBadge(
            key: const ValueKey('earliest-consultation'),
            label: l10n.earliestConsultation(_day(l10n, c)),
            color: AppColors.cyan,
            icon: Icons.videocam_outlined,
            dense: dense,
          ),
        if (a != null)
          StatusBadge(
            key: const ValueKey('earliest-admission'),
            label: l10n.earliestAdmission(_day(l10n, a)),
            color: AppColors.primary,
            icon: Icons.event_available_rounded,
            dense: dense,
          ),
      ],
    );
  }

  static String _day(AppLocalizations l10n, DateTime d) {
    final days = Dates.daysUntil(d);
    if (days <= 0) return l10n.earliestToday;
    if (days == 1) return l10n.earliestTomorrow;
    return Dates.dayShort(d);
  }

  /// "Today" / "Tomorrow" / "12 Nov" for an earliest date.
  static String label(AppLocalizations l10n, DateTime d) => _day(l10n, d);
}
