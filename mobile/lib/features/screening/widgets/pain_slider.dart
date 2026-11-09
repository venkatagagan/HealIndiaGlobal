import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/l10n.dart';

/// Emoji for a 0-10 pain value.
String painEmoji(int value) => switch (value) {
  <= 0 => '😌',
  <= 2 => '🙂',
  <= 4 => '😐',
  <= 6 => '😕',
  <= 8 => '😣',
  _ => '😫',
};

/// Word for a 0-10 pain value, in the language of [l] (default: [L10n.current]).
String painLabel(int value, [AppLocalizations? l]) {
  final s = l ?? L10n.current;
  return switch (value) {
    <= 0 => s.painNone,
    <= 3 => s.painMild,
    <= 6 => s.painModerate,
    <= 8 => s.painSevere,
    _ => s.painWorst,
  };
}

/// Color for a 0-10 pain value (green -> amber -> red).
Color painColor(int value) {
  final t = (value / 10).clamp(0.0, 1.0);
  return t < 0.5
      ? Color.lerp(AppColors.primary, AppColors.warning, t * 2)!
      : Color.lerp(AppColors.warning, AppColors.danger, (t - 0.5) * 2)!;
}

/// "Pain Intensity" slider (0-10) whose thumb is an emoji face, with low / mid / high markers.
class PainSlider extends StatelessWidget {
  const PainSlider({super.key, required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final color = painColor(value);
    final l10n = context.l10n;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(l10n.painIntensityTitle, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 2),
        Text(
          l10n.painValueLabel(value, painLabel(value, l10n)),
          style: context.text.labelMedium?.copyWith(color: color, fontWeight: FontWeight.w700),
        ),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 6,
            activeTrackColor: color,
            inactiveTrackColor: context.palette.surfaceAlt,
            thumbShape: _EmojiThumb(painEmoji(value)),
            overlayColor: color.withValues(alpha: 0.15),
            showValueIndicator: ShowValueIndicator.never,
            tickMarkShape: SliderTickMarkShape.noTickMark,
          ),
          child: Slider(
            value: value.toDouble(),
            max: 10,
            divisions: 10,
            label: '$value',
            semanticFormatterCallback: (v) => l10n.painSemantics(v.round(), painLabel(v.round(), l10n)),
            onChanged: (v) => onChanged(v.round()),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: ExcludeSemantics(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final v in const [0, 5, 10])
                  InkResponse(
                    onTap: () => onChanged(v),
                    radius: 20,
                    child: Text(painEmoji(v), style: const TextStyle(fontSize: 16)),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EmojiThumb extends SliderComponentShape {
  const _EmojiThumb(this.emoji);

  final String emoji;

  static const double _size = 30;

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) => const Size(_size, _size);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    required bool isDiscrete,
    required TextPainter labelPainter,
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required TextDirection textDirection,
    required double value,
    required double textScaleFactor,
    required Size sizeWithOverflow,
  }) {
    final canvas = context.canvas;
    final scale = 1 + 0.15 * activationAnimation.value;
    canvas.drawCircle(center, _size / 2 * scale, Paint()..color = const Color(0xFFFACC15));
    final tp = TextPainter(
      text: TextSpan(
        text: emoji,
        style: TextStyle(fontSize: 22 * scale),
      ),
      textDirection: textDirection,
    )..layout();
    tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2));
    tp.dispose();
  }
}
