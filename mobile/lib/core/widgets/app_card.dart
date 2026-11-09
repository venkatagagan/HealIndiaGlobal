import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Rounded surface card used across the app. Optionally tappable and/or highlighted with an
/// accent border (selected package / payment method / "Treatment in India").
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.margin = EdgeInsets.zero,
    this.color,
    this.borderColor,
    this.selected = false,
    this.selectedColor = AppColors.primary,
    this.radius = AppRadius.lg,
    this.gradient,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final Color? color;
  final Color? borderColor;

  /// Draws a 2px [selectedColor] border.
  final bool selected;
  final Color selectedColor;
  final double radius;
  final Gradient? gradient;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(radius);
    final border = selected
        ? Border.all(color: selectedColor, width: 2)
        : (borderColor != null
              ? Border.all(color: borderColor!)
              : (context.isDark ? null : Border.all(color: context.palette.border)));
    return Padding(
      padding: margin,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            color: gradient == null ? (color ?? context.colors.surfaceContainer) : null,
            gradient: gradient,
            borderRadius: br,
            border: border,
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: br,
            child: Padding(padding: padding, child: child),
          ),
        ),
      ),
    );
  }
}
