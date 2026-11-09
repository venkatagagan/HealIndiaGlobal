import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

/// Radio-style selectable card ("Medical Only $2,500 Save $500", "Credit/Debit Card").
/// Selected cards get a violet border and a filled radio indicator.
class OptionRadioCard extends StatelessWidget {
  const OptionRadioCard({
    super.key,
    required this.title,
    required this.selected,
    required this.onTap,
    this.subtitle,
    this.trailing,
    this.leading,
    this.footer,
    this.enabled = true,
    this.showRadio = true,
  });

  final String title;
  final String? subtitle;
  final bool selected;
  final VoidCallback? onTap;

  /// Shown before the radio (e.g. price column).
  final Widget? trailing;
  final Widget? leading;

  /// Extra content under the title row (expanded details of the selected option).
  final Widget? footer;
  final bool enabled;

  /// False renders a chevron instead of a radio (informational options).
  final bool showRadio;

  @override
  Widget build(BuildContext context) {
    final muted = !enabled;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: showRadio,
      button: true,
      enabled: enabled,
      child: AppCard(
        selected: selected,
        selectedColor: AppColors.violet,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        onTap: enabled ? onTap : null,
        child: Opacity(
          opacity: muted ? 0.55 : 1,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (leading != null) ...[leading!, const SizedBox(width: 12)],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle!,
                            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (trailing != null) ...[const SizedBox(width: 8), trailing!],
                  const SizedBox(width: 12),
                  if (showRadio)
                    _Radio(selected: selected)
                  else
                    Icon(Icons.chevron_right_rounded, color: context.palette.textSecondary),
                ],
              ),
              if (footer != null) ...[const SizedBox(height: 12), footer!],
            ],
          ),
        ),
      ),
    );
  }
}

class _Radio extends StatelessWidget {
  const _Radio({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final color = selected ? Colors.white : context.palette.textSecondary;
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2),
      ),
      alignment: Alignment.center,
      child: selected
          ? Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            )
          : null,
    );
  }
}
