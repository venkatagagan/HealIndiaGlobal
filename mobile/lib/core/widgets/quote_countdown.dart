import 'dart:async';

import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/app_theme.dart';
import '../utils/dates.dart';

/// Live countdown to a hospital's promised quote time (`quote_due_at`), or the overdue notice.
///
/// * patient wording (default): "Quote due by 12 Nov, 10:30 · 1 day 04:12:09 left" / "Overdue — we're
///   chasing the hospital";
/// * [forHospital]: "Respond by 12 Nov, 10:30 · ..." / "Overdue".
class QuoteCountdown extends StatefulWidget {
  const QuoteCountdown({
    super.key,
    required this.dueAt,
    this.overdue = false,
    this.forHospital = false,
    this.dense = false,
    this.now,
  });

  final DateTime dueAt;

  /// Server flag; the widget also turns overdue once the time passes.
  final bool overdue;
  final bool forHospital;
  final bool dense;

  /// Clock for tests.
  final DateTime Function()? now;

  /// `1 day 04:12:09 left` / `03:05:00 left` for [left] (non-negative).
  static String formatLeft(AppLocalizations l10n, Duration left) {
    final d = left.inDays;
    final h = left.inHours.remainder(24).toString().padLeft(2, '0');
    final m = left.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = left.inSeconds.remainder(60).toString().padLeft(2, '0');
    return l10n.quoteTimeLeft(d, '$h:$m:$s');
  }

  @override
  State<QuoteCountdown> createState() => _QuoteCountdownState();
}

class _QuoteCountdownState extends State<QuoteCountdown> {
  Timer? _timer;

  DateTime get _now => widget.now?.call() ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final left = widget.dueAt.difference(_now);
    final overdue = widget.overdue || left.isNegative;
    if (overdue) _timer?.cancel();
    final color = overdue ? AppColors.danger : AppColors.warning;
    final due = Dates.dayTime(widget.dueAt.toLocal());
    final title = widget.forHospital ? l10n.quoteRespondBy(due) : l10n.quoteDueBy(due);
    final status = overdue
        ? (widget.forHospital ? l10n.quoteOverdueHospital : l10n.quoteOverduePatient)
        : QuoteCountdown.formatLeft(l10n, left);
    final textStyle = (widget.dense ? context.text.labelSmall : context.text.labelMedium)?.copyWith(
      color: color,
      fontWeight: FontWeight.w700,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Semantics(
      liveRegion: false,
      label: '$title. $status',
      excludeSemantics: true,
      child: Container(
        padding: EdgeInsetsDirectional.symmetric(horizontal: widget.dense ? 8 : 12, vertical: widget.dense ? 4 : 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(overdue ? Icons.report_gmailerrorred_rounded : Icons.timer_outlined, size: 16, color: color),
            const SizedBox(width: 6),
            Flexible(
              child: widget.dense
                  ? Text(overdue ? status : '$title · $status', style: textStyle, maxLines: 2)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title, style: context.text.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
                        Text(status, style: textStyle),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
