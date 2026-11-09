import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Grid tile on "What brings you to India?": accent start border, colored icon, name, short
/// subtitle and the "Save X-Y%" line (design: Service Category Selection).
class SpecialtyTile extends StatelessWidget {
  const SpecialtyTile({
    super.key,
    required this.title,
    required this.icon,
    required this.accent,
    required this.onTap,
    this.subtitle,
    this.savingsLabel,
    this.iconAsset,
  });

  factory SpecialtyTile.specialty(Specialty s, {Key? key, required Color accent, required VoidCallback onTap}) =>
      SpecialtyTile(
        key: key,
        title: s.name,
        subtitle: shortDescription(s.description),
        icon: specialtyIcon(s.icon ?? s.slug),
        iconAsset: BrandAssets.specialtyIcon(s.slug),
        accent: accent,
        savingsLabel: s.savingsLabel,
        onTap: onTap,
      );

  final String title;
  final String? subtitle;
  final IconData icon;

  /// Brand line icon (`assets/specialties/<slug>.svg`); falls back to [icon] when null.
  final String? iconAsset;
  final Color accent;
  final String? savingsLabel;
  final VoidCallback onTap;

  /// First clause of a description, for the one-line subtitle.
  static String? shortDescription(String? description) {
    final d = description?.trim();
    if (d == null || d.isEmpty) return null;
    final cut = d.indexOf(RegExp(r'[.;,\n]'));
    return cut > 0 ? d.substring(0, cut) : d;
  }

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(AppRadius.md);
    return Semantics(
      button: true,
      label: [title, subtitle, savingsLabel].whereType<String>().join(', '),
      excludeSemantics: true,
      child: Material(
        color: context.colors.surfaceContainer,
        borderRadius: br,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              border: BorderDirectional(start: BorderSide(color: accent, width: 3)),
            ),
            padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 10, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (iconAsset != null)
                  BrandSvg(iconAsset!, width: 28, height: 28, color: accent)
                else
                  Icon(icon, color: accent, size: 26),
                const Spacer(),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                  ),
                if (savingsLabel != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    savingsLabel!,
                    style: context.text.labelMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w800),
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

/// "Save 10-30%" for a set of specialties (min of minimums .. max of maximums), or null.
/// [l10n] defaults to the app's current language.
String? combinedSavingsLabel(Iterable<Specialty> specialties, {AppLocalizations? l10n}) {
  int? lo;
  int? hi;
  for (final s in specialties) {
    final a = s.savingsMinPct ?? s.savingsMaxPct;
    final b = s.savingsMaxPct ?? s.savingsMinPct;
    if (a != null) lo = lo == null || a < lo ? a : lo;
    if (b != null) hi = hi == null || b > hi ? b : hi;
  }
  if (lo == null || hi == null) return null;
  final l = l10n ?? L10n.current;
  return lo == hi ? l.coreSavePercent(lo) : l.coreSavePercentRange(lo, hi);
}
