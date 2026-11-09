import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Animated "neural brain" backdrop for the AI processing screen: two hemispheres drawn with
/// glowing folds and pulses travelling along them. [t] is a 0..1 looping animation value.
class BrainBackdropPainter extends CustomPainter {
  BrainBackdropPainter({required this.t, this.color = const Color(0xFF8B5CF6)});

  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final center = Offset(w / 2, h * 0.42);
    final r = math.min(w, h) * 0.46;

    // soft glow
    canvas.drawCircle(
      center,
      r * (1.05 + 0.05 * math.sin(t * 2 * math.pi)),
      Paint()
        ..shader = RadialGradient(
          colors: [color.withValues(alpha: 0.28), color.withValues(alpha: 0)],
        ).createShader(Rect.fromCircle(center: center, radius: r * 1.2)),
    );

    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withValues(alpha: 0.16);

    final folds = <Path>[];
    for (final side in const [-1.0, 1.0]) {
      final lobe = Rect.fromCenter(center: center.translate(side * r * 0.48, 0), width: r * 0.98, height: r * 1.5);
      canvas.drawOval(lobe, line..color = Colors.white.withValues(alpha: 0.2));
      // gyri: wavy horizontal folds inside each hemisphere
      for (var i = 1; i <= 6; i++) {
        final y = lobe.top + lobe.height * i / 7;
        final half = lobe.width / 2 * math.sqrt(1 - math.pow((y - lobe.center.dy) / (lobe.height / 2), 2));
        final path = Path()..moveTo(lobe.center.dx - half * 0.9, y);
        const waves = 4;
        for (var k = 0; k < waves; k++) {
          final x0 = lobe.center.dx - half * 0.9 + (half * 1.8) * k / waves;
          final x1 = lobe.center.dx - half * 0.9 + (half * 1.8) * (k + 1) / waves;
          path.quadraticBezierTo((x0 + x1) / 2, y + ((k.isEven ? 1 : -1) * r * 0.06), x1, y);
        }
        folds.add(path);
        canvas.drawPath(path, line..color = Colors.white.withValues(alpha: 0.12));
      }
    }
    // central fissure
    canvas.drawLine(
      center.translate(0, -r * 0.72),
      center.translate(0, r * 0.72),
      line..color = Colors.white.withValues(alpha: 0.25),
    );

    // pulses travelling along folds
    final dot = Paint()..color = const Color(0xFFC4B5FD);
    for (var i = 0; i < folds.length; i++) {
      for (final metric in folds[i].computeMetrics()) {
        final phase = (t + i * 0.137) % 1.0;
        final pos = metric.getTangentForOffset(metric.length * phase)?.position;
        if (pos == null) continue;
        canvas
          ..drawCircle(pos, 5, Paint()..color = const Color(0xFF8B5CF6).withValues(alpha: 0.35))
          ..drawCircle(pos, 2.2, dot);
      }
    }
  }

  @override
  bool shouldRepaint(BrainBackdropPainter oldDelegate) => oldDelegate.t != t || oldDelegate.color != color;
}
