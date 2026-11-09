import 'package:flutter/material.dart';

import '../models/enums.dart';
import '../theme/app_theme.dart';

/// Small tinted pill for statuses / tags ("98% Success", "Confirmed", "JCI").
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, this.color, this.icon, this.dense = false});

  /// Badge for any API enum (color derived from its wire value).
  factory StatusBadge.forEnum(JsonEnum value, {Key? key, bool dense = false}) =>
      StatusBadge(key: key, label: value.label, color: AppColors.statusColor(value.json), dense: dense);

  final String label;
  final Color? color;
  final IconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.info;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 6 : 10, vertical: dense ? 2 : 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: c.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: dense ? 12 : 14, color: c), const SizedBox(width: 4)],
          Text(
            label,
            style: (dense ? context.text.labelSmall : context.text.labelMedium)?.copyWith(
              color: c,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
