import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../models/refs.dart';
import '../theme/app_theme.dart';

/// Circular (or rounded-square) avatar with network image + initials fallback.
class Avatar extends StatelessWidget {
  const Avatar({super.key, this.imageUrl, this.name = '', this.size = 44, this.square = false, this.backgroundColor});

  final String? imageUrl;

  /// Used for initials and semantics.
  final String name;
  final double size;

  /// Rounded square (doctor photos on match cards) instead of a circle.
  final bool square;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final radius = square ? BorderRadius.circular(size * 0.2) : BorderRadius.circular(size / 2);
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      color: backgroundColor ?? AppColors.violetSoft,
      child: Text(
        initialsOf(name),
        style: TextStyle(
          fontSize: size * 0.36,
          fontWeight: FontWeight.w700,
          color: context.isDark ? const Color(0xFFC4B5FD) : AppColors.violet,
        ),
      ),
    );
    final url = imageUrl;
    return Semantics(
      image: true,
      label: name.isEmpty ? context.l10n.coreAvatarLabel : name,
      child: ClipRRect(
        borderRadius: radius,
        child: SizedBox(
          width: size,
          height: size,
          child: url == null || url.isEmpty
              ? fallback
              : CachedNetworkImage(
                  imageUrl: url,
                  width: size,
                  height: size,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => fallback,
                  errorWidget: (_, _, _) => fallback,
                ),
        ),
      ),
    );
  }
}
