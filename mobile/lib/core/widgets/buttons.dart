import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Accent of a [PrimaryButton]: green (default), violet (booking / payment flow) or red
/// (questionnaire step 1, match "View Details", SOS).
enum ButtonTone { green, violet, red }

/// Full-width pill CTA with loading state.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.tone = ButtonTone.green,
    this.expand = true,
  });

  final String label;

  /// Null disables the button.
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final ButtonTone tone;
  final bool expand;

  (Color, Color) get _colors => switch (tone) {
    // Text-bearing fills must pass WCAG AA (BACKLOG #33): dark text on green, white on the strong red.
    ButtonTone.green => (AppColors.primary, AppColors.onPrimary),
    ButtonTone.violet => (AppColors.violet, Colors.white),
    ButtonTone.red => (AppColors.dangerStrong, Colors.white),
  };

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _colors;
    final child = loading
        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );
    final button = FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        disabledBackgroundColor: loading ? bg.withValues(alpha: 0.7) : null,
        disabledForegroundColor: loading ? fg : null,
        minimumSize: Size(expand ? double.infinity : 0, 52),
        padding: const EdgeInsets.symmetric(horizontal: 24),
      ),
      child: child,
    );
    return Semantics(button: true, enabled: onPressed != null && !loading, child: button);
  }
}

/// Outlined / tonal secondary action ("Previous", "Explore as Guest", "Compare").
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.expand = true,
    this.filled = false,
    this.borderColor,
    this.foregroundColor,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final bool expand;

  /// Tonal (filled with surfaceAlt) instead of outlined.
  final bool filled;
  final Color? borderColor;
  final Color? foregroundColor;

  @override
  Widget build(BuildContext context) {
    final fg = foregroundColor ?? context.colors.onSurface;
    final child = loading
        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );
    return OutlinedButton(
      onPressed: loading ? null : onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: fg,
        backgroundColor: filled ? context.palette.surfaceAlt : null,
        side: BorderSide(color: borderColor ?? (filled ? Colors.transparent : context.palette.border), width: 1.2),
        minimumSize: Size(expand ? double.infinity : 0, 52),
        padding: const EdgeInsets.symmetric(horizontal: 20),
      ),
      child: child,
    );
  }
}
