import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Pill toggle chip (duration Days/Weeks/Months/Years, language chips, symptom chips).
class ChipToggle extends StatelessWidget {
  const ChipToggle({
    super.key,
    required this.label,
    required this.selected,
    required this.onChanged,
    this.leading,
    this.onDeleted,
    this.selectedColor = AppColors.primary,
  });

  final String label;
  final bool selected;

  /// Null makes the chip read-only.
  final ValueChanged<bool>? onChanged;

  /// Optional leading widget (e.g. a flag emoji `Text('🇮🇳')` or an icon).
  final Widget? leading;

  /// Shows an `x` (removable symptom chips).
  final VoidCallback? onDeleted;
  final Color selectedColor;

  @override
  Widget build(BuildContext context) {
    final fg = selected
        ? (selectedColor == AppColors.primary ? const Color(0xFF052E16) : Colors.white)
        : context.colors.onSurface;
    return Semantics(
      selected: selected,
      button: onChanged != null,
      child: Material(
        color: selected ? selectedColor : context.palette.surfaceAlt,
        shape: StadiumBorder(side: BorderSide(color: selected ? selectedColor : context.palette.border)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onChanged == null ? null : () => onChanged!(!selected),
          child: Padding(
            padding: EdgeInsetsDirectional.fromSTEB(14, 8, onDeleted != null ? 6 : 14, 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 6)],
                Text(
                  label,
                  style: context.text.labelMedium?.copyWith(color: fg, fontWeight: FontWeight.w700),
                ),
                if (onDeleted != null) ...[
                  const SizedBox(width: 4),
                  InkResponse(
                    onTap: onDeleted,
                    radius: 14,
                    child: Icon(Icons.close_rounded, size: 16, color: fg.withValues(alpha: 0.8)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A wrap of single- or multi-select [ChipToggle]s.
class ChipToggleGroup<T> extends StatelessWidget {
  const ChipToggleGroup({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
    required this.labelOf,
    this.multiSelect = false,
    this.leadingOf,
  });

  final List<T> options;
  final Set<T> selected;
  final ValueChanged<Set<T>> onChanged;
  final String Function(T) labelOf;
  final Widget? Function(T)? leadingOf;
  final bool multiSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          ChipToggle(
            label: labelOf(o),
            leading: leadingOf?.call(o),
            selected: selected.contains(o),
            onChanged: (on) {
              if (multiSelect) {
                final next = {...selected};
                on ? next.add(o) : next.remove(o);
                onChanged(next);
              } else {
                onChanged({o});
              }
            },
          ),
      ],
    );
  }
}
