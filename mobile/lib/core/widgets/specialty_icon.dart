import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Maps a specialty `icon` name (lucide / material, from the API) or slug to a Material icon.
IconData specialtyIcon(String? iconOrSlug) {
  final k = (iconOrSlug ?? '').toLowerCase().replaceAll('_', '-');
  if (k.contains('heart') || k.contains('cardio')) return Icons.favorite_border_rounded;
  if (k.contains('bone') || k.contains('ortho') || k.contains('joint')) return Icons.accessibility_new_rounded;
  if (k.contains('tooth') || k.contains('dental')) return Icons.mood_rounded;
  if (k.contains('ribbon') || k.contains('onco') || k.contains('cancer')) return Icons.volunteer_activism_outlined;
  if (k.contains('sparkle') || k.contains('cosmetic') || k.contains('smile')) return Icons.face_retouching_natural;
  if (k.contains('brain') || k.contains('neuro')) return Icons.psychology_outlined;
  if (k.contains('eye') || k.contains('ophthal')) return Icons.visibility_outlined;
  if (k.contains('baby') || k.contains('ivf') || k.contains('fertil')) return Icons.child_friendly_outlined;
  if (k.contains('kidney') || k.contains('nephro') || k.contains('uro')) return Icons.water_drop_outlined;
  if (k.contains('liver') || k.contains('gastro') || k.contains('stomach')) return Icons.restaurant_outlined;
  if (k.contains('lung') || k.contains('pulmo') || k.contains('wind')) return Icons.air_rounded;
  if (k.contains('scale') || k.contains('bariatric') || k.contains('weight')) return Icons.monitor_weight_outlined;
  if (k.contains('transplant')) return Icons.sync_alt_rounded;
  if (k.contains('ear') || k.contains('ent')) return Icons.hearing_rounded;
  if (k.contains('spine')) return Icons.straighten_rounded;
  if (k.contains('more') || k.contains('plus')) return Icons.add_circle_outline_rounded;
  return Icons.local_hospital_outlined;
}

/// Accent color cycle for the specialty grid (red, blue, pink, white, violet, grey as in design).
Color specialtyAccent(int index) => const [
  AppColors.danger,
  AppColors.info,
  Color(0xFFEC4899),
  Color(0xFFE2E8F0),
  AppColors.violet,
  Color(0xFF94A3B8),
][index % 6];
