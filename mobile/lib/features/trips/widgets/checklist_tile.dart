import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';

/// Pre-arrival checklist row: done (filled violet check), active (violet ring with dot, bold) or
/// pending (grey ring, muted label) — as on the Pre-Arrival Dashboard design.
class ChecklistTile extends StatelessWidget {
  const ChecklistTile({super.key, required this.item, this.onTap});

  final ChecklistItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final status = item.status;
    final Widget indicator = switch (status) {
      ChecklistStatus.done => Container(
        width: 20,
        height: 20,
        decoration: const BoxDecoration(color: AppColors.violet, shape: BoxShape.circle),
        child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
      ),
      ChecklistStatus.inProgress => Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.violet, width: 2),
        ),
        alignment: Alignment.center,
        child: Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(color: AppColors.violet, shape: BoxShape.circle),
        ),
      ),
      ChecklistStatus.pending => Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: context.palette.textMuted, width: 1.5),
        ),
      ),
    };
    final style = switch (status) {
      ChecklistStatus.done => context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
      ChecklistStatus.inProgress => context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
      ChecklistStatus.pending => context.text.bodyLarge?.copyWith(color: context.palette.textSecondary),
    };
    return Semantics(
      label: '${item.label}, ${status.label}',
      button: onTap != null,
      excludeSemantics: true,
      child: InkWell(
        key: ValueKey('checklist-${item.key}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
          child: Row(
            children: [
              indicator,
              const SizedBox(width: 14),
              Expanded(child: Text(item.label, style: style)),
              if (onTap != null && status != ChecklistStatus.done)
                Icon(Icons.chevron_right_rounded, size: 20, color: context.palette.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
