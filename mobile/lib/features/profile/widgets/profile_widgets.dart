import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';

/// Group of settings rows inside a card.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
          child: Semantics(
            header: true,
            child: Text(
              title.toUpperCase(),
              style: context.text.labelSmall?.copyWith(letterSpacing: 1.1, color: context.palette.textMuted),
            ),
          ),
        ),
        Material(
          color: context.colors.surfaceContainer,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) Divider(height: 1, indent: 56, color: context.palette.border),
                children[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// A navigation / action row with a tinted leading icon.
class SettingsTile extends StatelessWidget {
  const SettingsTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.color,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? color;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final c = destructive ? AppColors.danger : (color ?? AppColors.primary);
    return ListTile(
      onTap: onTap,
      shape: const RoundedRectangleBorder(),
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: c, size: 20),
      ),
      title: Text(title, style: context.text.titleSmall?.copyWith(color: destructive ? AppColors.danger : null)),
      subtitle: subtitle == null
          ? null
          : Text(subtitle!, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodySmall),
      trailing: trailing ?? (onTap == null ? null : const Icon(Icons.chevron_right_rounded)),
    );
  }
}

/// Label/value row for the personal-info card.
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.label, required this.value, this.icon});

  final String label;
  final String? value;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final v = (value ?? '').trim();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[Icon(icon, size: 18, color: context.palette.textSecondary), const SizedBox(width: 10)],
          SizedBox(width: 128, child: Text(label, style: context.text.bodySmall)),
          Expanded(
            child: Text(
              v.isEmpty ? 'Not added' : v,
              style: context.text.bodyMedium?.copyWith(
                color: v.isEmpty ? context.palette.textMuted : null,
                fontWeight: v.isEmpty ? null : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Read-only form field that opens a date picker.
class DateField extends StatelessWidget {
  const DateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.firstDate,
    required this.lastDate,
    this.icon = Icons.event_outlined,
    this.errorText,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final DateTime firstDate;
  final DateTime lastDate;
  final IconData icon;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: AppRadius.input,
      onTap: () async {
        final initial = value ?? (lastDate.isBefore(DateTime.now()) ? lastDate : DateTime.now());
        final picked = await showDatePicker(
          context: context,
          initialDate: initial.isBefore(firstDate) ? firstDate : (initial.isAfter(lastDate) ? lastDate : initial),
          firstDate: firstDate,
          lastDate: lastDate,
          initialEntryMode: DatePickerEntryMode.calendarOnly,
        );
        if (picked != null) onChanged(picked);
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon),
          errorText: errorText,
          suffixIcon: value == null
              ? const Icon(Icons.arrow_drop_down_rounded)
              : IconButton(
                  tooltip: 'Clear $label',
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => onChanged(null),
                ),
        ),
        isEmpty: value == null,
        child: Text(value == null ? '' : Dates.day(value), style: context.text.bodyLarge),
      ),
    );
  }
}

/// Simple single-choice bottom sheet; returns the chosen value or null.
Future<T?> showChoiceSheet<T>(
  BuildContext context, {
  required String title,
  required List<T> options,
  required String Function(T) labelOf,
  T? selected,
  Widget? Function(T)? leadingOf,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: options.length > 8 ? 0.7 : 0.45,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(title, style: context.text.titleLarge),
            ),
          ),
          Expanded(
            child: ListView.builder(
              controller: controller,
              itemCount: options.length,
              itemBuilder: (context, i) {
                final o = options[i];
                final isSelected = o == selected;
                return ListTile(
                  leading: leadingOf?.call(o),
                  title: Text(labelOf(o)),
                  selected: isSelected,
                  trailing: isSelected ? const Icon(Icons.check_rounded, color: AppColors.primary) : null,
                  onTap: () => Navigator.of(context).pop(o),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}
