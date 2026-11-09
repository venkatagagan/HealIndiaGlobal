import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import 'save_button.dart';

/// Price in the patient's preferred currency (display-only FX estimate, prefixed with "≈"), falling
/// back to the original currency when no rate is known.
class ApproxPrice extends ConsumerWidget {
  const ApproxPrice(this.minor, this.currency, {super.key, this.maxMinor, this.style, this.prefix = ''});

  final int minor;
  final int? maxMinor;
  final String currency;
  final TextStyle? style;
  final String prefix;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferred = ref.watch(preferredCurrencyProvider);
    final fx = ref.watch(fxRatesProvider).value;
    final from = currency.toUpperCase();
    final canConvert =
        preferred != from &&
        fx != null &&
        (from == 'INR' || fx.containsKey(from)) &&
        (preferred == 'INR' || fx.containsKey(preferred));
    if (!canConvert) {
      return MoneyText(minor, from, maxMinor: maxMinor, style: style, prefix: prefix);
    }
    final lo = convertMinor(minor, from, preferred, fx);
    final hi = maxMinor == null ? null : convertMinor(maxMinor!, from, preferred, fx);
    return Tooltip(
      message: context.l10n.catalogApproxPriceTooltip(formatMoney(minor, from)),
      child: MoneyText(lo, preferred, maxMinor: hi, style: style, prefix: '$prefix≈ '),
    );
  }
}

/// JCI / NABH / NABL / ISO pills.
class AccreditationBadges extends StatelessWidget {
  const AccreditationBadges(this.accreditations, {super.key, this.dense = true});

  final List<String> accreditations;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    if (accreditations.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        for (final a in accreditations)
          StatusBadge(
            label: a.toUpperCase(),
            color: a.toLowerCase() == 'jci' ? AppColors.primary : AppColors.info,
            icon: Icons.verified_outlined,
            dense: dense,
          ),
      ],
    );
  }
}

/// Hospital cover (network image) or a gradient placeholder with the hospital icon.
class HospitalImage extends StatelessWidget {
  const HospitalImage({super.key, this.url, this.size = 64, this.radius = AppRadius.md});

  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(gradient: AppColors.heroGradient),
      child: Icon(Icons.local_hospital_rounded, color: Colors.white, size: size * 0.45),
    );
    final u = url;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: u == null || u.isEmpty
          ? placeholder
          : CachedNetworkImage(
              imageUrl: u,
              width: size,
              height: size,
              fit: BoxFit.cover,
              placeholder: (_, _) => placeholder,
              errorWidget: (_, _, _) => placeholder,
            ),
    );
  }
}

/// Hospital result row (search list, saved list).
class HospitalListTile extends StatelessWidget {
  const HospitalListTile({super.key, required this.hospital, required this.onTap, this.showSave = true});

  final HospitalCard hospital;
  final VoidCallback onTap;
  final bool showSave;

  @override
  Widget build(BuildContext context) {
    final h = hospital;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 4, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          HospitalImage(url: h.logoUrl ?? h.coverImageUrl),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(h.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                if (h.location.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(
                      children: [
                        Icon(Icons.place_outlined, size: 14, color: context.palette.textSecondary),
                        const SizedBox(width: 2),
                        Expanded(
                          child: Text(
                            h.location,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.bodySmall,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (h.ratingAvg != null) ...[
                  const SizedBox(height: 4),
                  RatingStars(rating: h.ratingAvg!, count: h.ratingCount, size: 14),
                ],
                if (h.accreditations.isNotEmpty || h.internationalDesk) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      AccreditationBadges(h.accreditations),
                      if (h.internationalDesk)
                        StatusBadge(
                          label: context.l10n.catalogInternationalDesk,
                          color: AppColors.violet,
                          icon: Icons.public_rounded,
                          dense: true,
                        ),
                    ],
                  ),
                ],
                if (h.startingPriceMinor != null) ...[
                  const SizedBox(height: 6),
                  ApproxPrice(
                    h.startingPriceMinor!,
                    h.currency,
                    prefix: context.l10n.catalogPriceFromPrefix,
                    style: context.text.labelLarge?.copyWith(color: AppColors.primary),
                  ),
                ],
              ],
            ),
          ),
          if (showSave) SaveButton(entityType: SavedEntityType.hospital, entityId: h.id),
        ],
      ),
    );
  }
}

/// Doctor result row.
class DoctorListTile extends StatelessWidget {
  const DoctorListTile({super.key, required this.doctor, required this.onTap, this.showSave = true});

  final DoctorCard doctor;
  final VoidCallback onTap;
  final bool showSave;

  @override
  Widget build(BuildContext context) {
    final d = doctor;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 4, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Avatar(imageUrl: d.photoUrl, name: d.fullName, size: 60, square: true),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d.fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                if (d.subtitle.isNotEmpty)
                  Text(d.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodySmall),
                Text(
                  [d.hospital.name, d.hospital.city].whereType<String>().join(', '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
                ),
                if (d.ratingAvg != null) ...[
                  const SizedBox(height: 4),
                  RatingStars(rating: d.ratingAvg!, count: d.ratingCount, size: 14),
                ],
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (d.successRatePct != null)
                      StatusBadge(
                        label: context.l10n.catalogSuccessBadge(d.successRatePct!.round()),
                        color: AppColors.primary,
                        dense: true,
                      ),
                    if (d.teleconsultAvailable)
                      StatusBadge(
                        label: context.l10n.catalogVideoConsult,
                        color: AppColors.info,
                        icon: Icons.videocam_outlined,
                        dense: true,
                      ),
                    for (final l in d.languages.take(3))
                      StatusBadge(label: l, color: context.palette.textSecondary, dense: true),
                  ],
                ),
              ],
            ),
          ),
          if (showSave) SaveButton(entityType: SavedEntityType.doctor, entityId: d.id),
        ],
      ),
    );
  }
}

/// Procedure result row.
class ProcedureListTile extends StatelessWidget {
  const ProcedureListTile({super.key, required this.procedure, required this.onTap, this.showSave = true});

  final Procedure procedure;
  final VoidCallback onTap;
  final bool showSave;

  @override
  Widget build(BuildContext context) {
    final p = procedure;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 4, 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(AppRadius.md)),
            child: Icon(specialtyIcon(p.specialty?.slug), color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleSmall),
                Text(
                  [
                    p.specialty?.name,
                    if (p.hospitalStayDays != null) context.l10n.catalogDaysInHospital(p.hospitalStayDays!),
                  ].whereType<String>().join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall,
                ),
                if (p.indiaPriceMinMinor != null) ...[
                  const SizedBox(height: 4),
                  ApproxPrice(
                    p.indiaPriceMinMinor!,
                    p.currency,
                    maxMinor: p.indiaPriceMaxMinor,
                    style: context.text.labelLarge?.copyWith(color: AppColors.primary),
                  ),
                ],
              ],
            ),
          ),
          if (showSave) SaveButton(entityType: SavedEntityType.procedure, entityId: p.id),
        ],
      ),
    );
  }
}

/// Labelled stat used on detail screens ("Est. 1996", "710 beds").
class InfoStat extends StatelessWidget {
  const InfoStat({super.key, required this.icon, required this.value, required this.label});

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, size: 20, color: AppColors.primary),
          const SizedBox(height: 4),
          Text(value, style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
          Text(label, style: context.text.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
