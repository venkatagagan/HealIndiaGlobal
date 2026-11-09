import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

/// "Your Top Matches" card: photo + hospital image, match % pill, success badge, specialty and
/// experience, hospital, qualification chips, rating, estimated total cost (red) and
/// Compare (+) / View Details actions.
class MatchCard extends StatelessWidget {
  const MatchCard({
    super.key,
    required this.match,
    required this.selected,
    required this.onCompare,
    required this.onDetails,
    this.compareEnabled = true,
  });

  final ScreeningMatch match;

  /// Selected for comparison.
  final bool selected;
  final VoidCallback onCompare;
  final VoidCallback onDetails;

  /// False when 3 are already selected (and this one is not).
  final bool compareEnabled;

  @override
  Widget build(BuildContext context) {
    final m = match;
    final doctor = m.doctor;
    final hospital = m.hospital;
    final title = doctor?.fullName ?? hospital.name;
    final subtitle = doctor != null ? doctor.subtitle : hospital.specialties.take(3).join(' · ');
    final place = [hospital.name, if (hospital.city != null) hospital.city].join(', ');
    final chips = doctor != null && doctor.qualifications.isNotEmpty
        ? doctor.qualifications
        : hospital.accreditations.map((a) => a.toUpperCase()).toList();
    final rating = doctor?.ratingAvg ?? hospital.ratingAvg;
    final ratingCount = doctor != null ? doctor.ratingCount : hospital.ratingCount;
    final success = doctor?.successRatePct;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: context.colors.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: selected ? AppColors.danger : Colors.transparent, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 150,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _Photo(url: doctor?.photoUrl ?? hospital.logoUrl, name: title),
                    ),
                    Expanded(child: _Cover(url: hospital.coverImageUrl)),
                  ],
                ),
                Positioned(
                  top: 10,
                  right: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDCFCE7),
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      border: Border.all(color: AppColors.primary),
                    ),
                    child: Text(
                      m.matchLabel,
                      style: context.text.labelSmall?.copyWith(
                        color: AppColors.primaryDark,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    ),
                    if (success != null)
                      StatusBadge(
                        label: '${success.round()}% Success',
                        color: const Color(0xFF60A5FA),
                        icon: Icons.verified_outlined,
                        dense: true,
                      ),
                  ],
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(subtitle, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
                ],
                const SizedBox(height: 2),
                Text(place, style: context.text.bodyMedium),
                if (chips.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(spacing: 6, runSpacing: 6, children: [for (final c in chips.take(4)) _Tag(c)]),
                ],
                if (rating != null) ...[
                  const SizedBox(height: 10),
                  RatingStars(rating: rating, count: ratingCount, size: 15),
                ],
                const Divider(height: 24),
                Text(
                  'Estimated Total Cost',
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
                MoneyText(
                  m.estimatedCostMinor,
                  m.currency,
                  style: context.text.headlineSmall?.copyWith(color: AppColors.danger, fontWeight: FontWeight.w900),
                ),
                if (m.savings != null)
                  Text(
                    'Save ${m.savings!.pctMin}-${m.savings!.pctMax}% vs home',
                    style: context.text.labelSmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        selected: selected,
                        child: SecondaryButton(
                          label: selected ? 'Added' : 'Compare',
                          icon: selected ? Icons.check_circle_rounded : Icons.add_circle_outline_rounded,
                          filled: true,
                          onPressed: compareEnabled || selected ? onCompare : null,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: PrimaryButton(label: 'View Details', tone: ButtonTone.red, onPressed: onDetails),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: context.palette.surfaceAlt,
      borderRadius: BorderRadius.circular(4),
      border: Border.all(color: context.palette.border),
    ),
    child: Text(text, style: context.text.labelSmall?.copyWith(fontWeight: FontWeight.w700)),
  );
}

class _Photo extends StatelessWidget {
  const _Photo({required this.url, required this.name});

  final String? url;
  final String name;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      color: const Color(0xFF3FA7A3),
      alignment: Alignment.center,
      child: Text(
        initialsOf(name),
        style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, color: Colors.white),
      ),
    );
    if (url == null || url!.isEmpty) return Semantics(image: true, label: name, child: fallback);
    return Semantics(
      image: true,
      label: name,
      child: CachedNetworkImage(
        imageUrl: url!,
        fit: BoxFit.cover,
        placeholder: (_, _) => fallback,
        errorWidget: (_, _, _) => fallback,
      ),
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      color: const Color(0xFFF1F5F9),
      alignment: Alignment.center,
      child: const Icon(Icons.image_outlined, color: Color(0xFF94A3B8), size: 32),
    );
    if (url == null || url!.isEmpty) return ExcludeSemantics(child: placeholder);
    return CachedNetworkImage(
      imageUrl: url!,
      fit: BoxFit.cover,
      placeholder: (_, _) => placeholder,
      errorWidget: (_, _, _) => placeholder,
    );
  }
}
