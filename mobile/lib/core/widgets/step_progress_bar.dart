import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/app_theme.dart';

/// "Step 2 of 4" label + rounded progress bar (questionnaire header).
class StepProgressBar extends StatelessWidget {
  const StepProgressBar({
    super.key,
    required this.step,
    required this.total,
    this.color = AppColors.primary,
    this.suffix,
    this.showLabel = true,
  });

  /// 1-based current step.
  final int step;
  final int total;

  /// Bar color (red on step 1 in the design, green afterwards).
  final Color color;

  /// Extra label text, e.g. "Optional" -> "Step 4 of 4 · Optional".
  final String? suffix;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    final value = total <= 0 ? 0.0 : (step / total).clamp(0.0, 1.0);
    final extra = suffix;
    final label = extra == null
        ? context.l10n.coreStepProgress(step, total)
        : context.l10n.coreStepProgressWithSuffix(step, total, extra);
    return Semantics(
      label: label,
      value: '${(value * 100).round()}%',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showLabel) ...[
            Text(label, style: context.text.labelMedium?.copyWith(color: context.colors.onSurface)),
            const SizedBox(height: 8),
          ],
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: value),
              duration: const Duration(milliseconds: 350),
              curve: Curves.easeOutCubic,
              builder: (context, v, _) => LinearProgressIndicator(
                value: v,
                minHeight: 6,
                color: color,
                backgroundColor: context.palette.surfaceAlt,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
