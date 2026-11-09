import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';

/// Horizontal carousel of cultural tips (image + title); tap for the full tip.
class CulturalTipsCarousel extends StatelessWidget {
  const CulturalTipsCarousel({super.key, required this.tips});

  final List<CulturalTip> tips;

  static const _fallbackIcons = [
    Icons.temple_hindu_rounded,
    Icons.restaurant_rounded,
    Icons.handshake_rounded,
    Icons.checkroom_rounded,
    Icons.currency_rupee_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 168,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: tips.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final t = tips[i];
          final fallback = Container(
            color: specialtyTint(i),
            alignment: Alignment.center,
            child: Icon(_fallbackIcons[i % _fallbackIcons.length], size: 40, color: Colors.white70),
          );
          return SizedBox(
            width: 150,
            child: InkWell(
              borderRadius: BorderRadius.circular(AppRadius.md),
              onTap: () => _show(context, t),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    child: SizedBox(
                      width: 150,
                      height: 120,
                      child: t.imageUrl == null || t.imageUrl!.isEmpty
                          ? fallback
                          : CachedNetworkImage(
                              imageUrl: t.imageUrl!,
                              fit: BoxFit.cover,
                              placeholder: (_, _) => fallback,
                              errorWidget: (_, _, _) => fallback,
                            ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    t.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  static Color specialtyTint(int i) {
    const colors = [Color(0xFF7C3AED), Color(0xFF2563EB), Color(0xFF0891B2), Color(0xFF16A34A), Color(0xFFDB2777)];
    return colors[i % colors.length].withValues(alpha: 0.7);
  }

  void _show(BuildContext context, CulturalTip t) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (t.category != null)
                Text(
                  t.category!.toUpperCase(),
                  style: ctx.text.labelSmall?.copyWith(color: AppColors.violet, letterSpacing: 1.2),
                ),
              Text(t.title, style: ctx.text.titleLarge),
              const SizedBox(height: 10),
              Flexible(child: SingleChildScrollView(child: Text(t.body, style: ctx.text.bodyLarge))),
            ],
          ),
        ),
      ),
    );
  }
}
