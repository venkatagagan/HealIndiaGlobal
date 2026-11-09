import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Brand constants.
abstract final class Brand {
  static const name = 'Heal India Global';
  static const tagline = 'Your Gateway to Indian Medical Excellence';
}

/// Small brand mark: the lotus-plus logo (`design/logo`) in a rounded square.
/// Without [color] the full-colour gradient mark is shown; with [color] the mono mark is tinted
/// (e.g. white on the hero gradient).
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = 40, this.color, this.background});

  final double size;
  final Color? color;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background ?? AppColors.primarySoft,
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      alignment: Alignment.center,
      child: color == null
          ? BrandSvg(BrandAssets.logoMark, width: size * 0.72, height: size * 0.72)
          : BrandSvg(BrandAssets.logoMarkMono, width: size * 0.72, height: size * 0.72, color: color),
    );
  }
}

/// "Heal India Global" + tagline header used at the top of most screens.
///
/// * [centered] (default) — centered title like the onboarding/trips screens.
/// * `centered: false` — left-aligned with the logo (questionnaire header).
/// * [leading] / [trailing] — optional back button / actions (e.g. notifications bell, "Save & Exit").
/// * [onDark] — forces white text (use on gradients / images).
class BrandHeader extends StatelessWidget {
  const BrandHeader({
    super.key,
    this.centered = true,
    this.showTagline = true,
    this.showLogo = false,
    this.leading,
    this.trailing,
    this.onDark = false,
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 8),
  });

  final bool centered;
  final bool showTagline;
  final bool showLogo;
  final Widget? leading;
  final Widget? trailing;
  final bool onDark;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final titleColor = onDark ? Colors.white : context.colors.onSurface;
    final taglineColor = onDark ? Colors.white70 : context.palette.textSecondary;
    final texts = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: centered ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      children: [
        Text(
          Brand.name,
          style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: titleColor),
          textAlign: centered ? TextAlign.center : TextAlign.start,
        ),
        if (showTagline)
          Text(
            Brand.tagline,
            style: context.text.labelSmall?.copyWith(color: taglineColor),
            textAlign: centered ? TextAlign.center : TextAlign.start,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );
    final title = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: centered ? MainAxisAlignment.center : MainAxisAlignment.start,
      children: [
        if (showLogo) ...[const BrandLogo(size: 32), const SizedBox(width: 10)],
        Flexible(child: texts),
      ],
    );
    return Semantics(
      header: true,
      label: '${Brand.name}. ${Brand.tagline}',
      excludeSemantics: true,
      child: Padding(
        padding: padding,
        child: SizedBox(
          height: showTagline ? 48 : 32,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Align(alignment: centered ? Alignment.center : Alignment.centerLeft, child: _inset(title)),
              if (leading != null) Align(alignment: Alignment.centerLeft, child: leading),
              if (trailing != null) Align(alignment: Alignment.centerRight, child: trailing),
            ],
          ),
        ),
      ),
    );
  }

  Widget _inset(Widget child) {
    if (!centered && leading != null) return Padding(padding: const EdgeInsets.only(left: 44), child: child);
    if (centered && (leading != null || trailing != null)) {
      return Padding(padding: const EdgeInsets.symmetric(horizontal: 48), child: child);
    }
    return child;
  }
}
