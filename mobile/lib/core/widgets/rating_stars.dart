import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Read-only star rating with optional "(4.8/5 from 230 reviews)" caption.
/// Pass [onChanged] to make it an input (whole stars).
class RatingStars extends StatelessWidget {
  const RatingStars({
    super.key,
    required this.rating,
    this.count,
    this.size = 16,
    this.showValue = true,
    this.onChanged,
  });

  /// 0-5 (fractions render half stars).
  final double rating;
  final int? count;
  final double size;
  final bool showValue;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    final r = rating.clamp(0.0, 5.0);
    final stars = <Widget>[
      for (var i = 1; i <= 5; i++)
        GestureDetector(
          onTap: onChanged == null ? null : () => onChanged!(i),
          child: Icon(
            r >= i ? Icons.star_rounded : (r >= i - 0.5 ? Icons.star_half_rounded : Icons.star_outline_rounded),
            size: size,
            color: AppColors.star,
          ),
        ),
    ];
    final caption = count == null ? '(${r.toStringAsFixed(1)}/5)' : '(${r.toStringAsFixed(1)}/5 from $count reviews)';
    return Semantics(
      label: 'Rated ${r.toStringAsFixed(1)} out of 5${count == null ? '' : ' from $count reviews'}',
      excludeSemantics: onChanged == null,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ...stars,
          if (showValue) ...[
            const SizedBox(width: 6),
            Flexible(
              child: Text(caption, style: context.text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ],
        ],
      ),
    );
  }
}
