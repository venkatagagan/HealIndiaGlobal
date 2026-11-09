import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import 'body_map_data.dart';

/// Body areas of a screening. [json] values are the ONE body-area vocabulary shared by the backend,
/// the catalog symptom library, the web apps and the design assets (PLAN / INTEGRATION_BACKLOG #37):
/// `head, neck, chest, abdomen, pelvis, back, left_arm, right_arm, left_leg, right_leg, skin, general`.
///
/// Every region except [skin] and [general] is a tappable path of the design body map
/// (`assets/body_map/body-{front,back}.svg`); those two are offered as chips below the map.
enum BodyRegion {
  head('head'),
  neck('neck'),
  chest('chest'),
  abdomen('abdomen'),
  pelvis('pelvis'),
  back('back'),
  leftArm('left_arm'),
  rightArm('right_arm'),
  leftLeg('left_leg'),
  rightLeg('right_leg'),
  skin('skin'),
  general('general');

  const BodyRegion(this.json);

  final String json;

  /// Display name in the app language ([L10n.current]); prefer [labelIn] with `context.l10n`.
  String get label => labelIn(L10n.current);

  /// Display name in the language of [l].
  String labelIn(AppLocalizations l) => switch (this) {
    head => l.bodyMapHead,
    neck => l.bodyMapNeck,
    chest => l.bodyMapChest,
    abdomen => l.bodyMapAbdomen,
    pelvis => l.bodyMapPelvis,
    back => l.bodyMapRegionBack,
    leftArm => l.bodyMapLeftArm,
    rightArm => l.bodyMapRightArm,
    leftLeg => l.bodyMapLeftLeg,
    rightLeg => l.bodyMapRightLeg,
    skin => l.bodyMapSkin,
    general => l.bodyMapGeneral,
  };

  /// Regions that are not drawn on the silhouette.
  static const offMap = [BodyRegion.skin, BodyRegion.general];

  static BodyRegion? fromJson(String raw) {
    for (final r in values) {
      if (r.json == raw) return r;
    }
    return null;
  }

  /// Label for any area value (unknown values are humanized), in the language of [l]
  /// (default: [L10n.current]).
  static String labelOf(String raw, [AppLocalizations? l]) {
    final r = fromJson(raw);
    if (r != null) return r.labelIn(l ?? L10n.current);
    final s = raw.replaceAll('_', ' ');
    return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
  }
}

/// Which side of the body is shown.
enum BodyView { front, back }

/// Silhouette geometry: the design SVG paths (`viewBox 0 0 200 480`, see [kBodyFrontRegions]).
///
/// Sides are anatomical: in the FRONT view the patient's left arm is on the viewer's right; in the
/// BACK view it is on the viewer's left.
abstract final class BodyMapGeometry {
  static const Size designSize = Size(kBodyMapWidth, kBodyMapHeight);

  static final Map<BodyView, Map<BodyRegion, (Path, Offset)>> _cache = {
    for (final view in BodyView.values)
      view: {
        for (final shape in view == BodyView.front ? kBodyFrontRegions : kBodyBackRegions)
          BodyRegion.fromJson(shape.id)!: (parseSvgPath(shape.d), Offset(shape.ax, shape.ay)),
      },
  };

  static final Path outline = parseSvgPath(kBodyOutlinePath);

  /// Regions of [view] in SVG document order (also the hit-test order).
  static List<BodyRegion> regionsFor(BodyView view) => _cache[view]!.keys.toList(growable: false);

  /// Path of [region] in design space (empty when the region is not drawn in [view]).
  static Path pathFor(BodyRegion region, BodyView view) => _cache[view]![region]?.$1 ?? Path();

  /// A point inside [region] (design space) used for labels, semantics and tests.
  static Offset anchor(BodyRegion region, BodyView view) => _cache[view]![region]?.$2 ?? Offset.zero;

  /// Scale + offset that fit the design space centered into [size].
  static (double scale, Offset offset) fit(Size size) {
    final scale = (size.width / designSize.width) < (size.height / designSize.height)
        ? size.width / designSize.width
        : size.height / designSize.height;
    final dx = (size.width - designSize.width * scale) / 2;
    final dy = (size.height - designSize.height * scale) / 2;
    return (scale, Offset(dx, dy));
  }

  /// Local widget position of [region]'s anchor in a map of [size].
  static Offset localAnchor(BodyRegion region, BodyView view, Size size) {
    final (scale, offset) = fit(size);
    return offset + anchor(region, view) * scale;
  }

  /// Region under [local] (widget coordinates) or null.
  static BodyRegion? hitTest(Offset local, BodyView view, Size size) {
    final (scale, offset) = fit(size);
    final p = (local - offset) / scale;
    for (final e in _cache[view]!.entries) {
      if (e.value.$1.contains(p)) return e.key;
    }
    return null;
  }
}

/// Parses the SVG path subset used by the design assets (absolute `M`, `L`, `C`, `Q`, `Z`).
Path parseSvgPath(String d) {
  final tokens = RegExp(r'[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?').allMatches(d).map((m) => m.group(0)!).toList();
  final path = Path();
  var i = 0;
  double n() => double.parse(tokens[i++]);
  String cmd = 'M';
  while (i < tokens.length) {
    final t = tokens[i];
    if (RegExp(r'^[MLCQZ]$').hasMatch(t)) {
      cmd = t;
      i++;
      if (cmd == 'Z') {
        path.close();
        continue;
      }
    }
    switch (cmd) {
      case 'M':
        path.moveTo(n(), n());
        cmd = 'L'; // implicit lineto after the first pair
      case 'L':
        path.lineTo(n(), n());
      case 'C':
        path.cubicTo(n(), n(), n(), n(), n(), n());
      case 'Q':
        path.quadraticBezierTo(n(), n(), n(), n());
      default:
        i++;
    }
  }
  return path;
}

/// Interactive human silhouette (front / back) with tappable, highlighted regions.
///
/// [selected] and [onChanged] use `body_areas` wire values (`head`, `left_arm`, ...).
class BodyMap extends StatefulWidget {
  const BodyMap({
    super.key,
    required this.selected,
    required this.onChanged,
    this.initialView = BodyView.front,
    this.highlightColor = AppColors.danger,
    this.height = 340,
  });

  /// Key of the painted canvas (for tests: tap at [BodyMapGeometry.localAnchor]).
  static const canvasKey = ValueKey('body-map-canvas');

  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;
  final BodyView initialView;
  final Color highlightColor;
  final double height;

  @override
  State<BodyMap> createState() => _BodyMapState();
}

class _BodyMapState extends State<BodyMap> {
  late BodyView _view = widget.initialView;

  void _toggle(BodyRegion region) {
    final next = {...widget.selected};
    if (!next.remove(region.json)) next.add(region.json);
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _ViewToggle(view: _view, onChanged: (v) => setState(() => _view = v)),
        const SizedBox(height: 12),
        Container(
          height: widget.height,
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            gradient: RadialGradient(
              center: const Alignment(0, -0.2),
              radius: 0.9,
              colors: context.isDark
                  ? const [Color(0xFF2A2420), Color(0xFF12100E)]
                  : const [Color(0xFFF1F5F9), Color(0xFFE2E8F0)],
            ),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final size = Size(constraints.maxWidth, constraints.maxHeight);
              return GestureDetector(
                key: BodyMap.canvasKey,
                behavior: HitTestBehavior.opaque,
                onTapUp: (d) {
                  final r = BodyMapGeometry.hitTest(d.localPosition, _view, size);
                  if (r != null) _toggle(r);
                },
                child: CustomPaint(
                  size: size,
                  painter: BodyMapPainter(
                    view: _view,
                    selected: widget.selected,
                    highlight: widget.highlightColor,
                    isDark: context.isDark,
                    textDirection: Directionality.of(context),
                    l10n: context.l10n,
                    onRegionTap: _toggle,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final r in BodyRegion.offMap)
              ChipToggle(
                key: ValueKey('body-area-${r.json}'),
                label: r.labelIn(context.l10n),
                leading: Icon(
                  r == BodyRegion.skin ? Icons.back_hand_outlined : Icons.accessibility_new_rounded,
                  size: 16,
                ),
                selected: widget.selected.contains(r.json),
                selectedColor: widget.highlightColor,
                onChanged: (_) => _toggle(r),
              ),
          ],
        ),
      ],
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle({required this.view, required this.onChanged});

  final BodyView view;
  final ValueChanged<BodyView> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget seg(BodyView v, String label) {
      final on = v == view;
      return Expanded(
        child: Semantics(
          button: true,
          selected: on,
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            onTap: () => onChanged(v),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: on ? context.colors.surface : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
              child: Text(
                label,
                style: context.text.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: on ? context.colors.onSurface : context.palette.textSecondary,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: 220,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: context.palette.surfaceAlt, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        children: [
          seg(BodyView.front, context.l10n.bodyMapViewFront),
          seg(BodyView.back, context.l10n.bodyMapViewBack),
        ],
      ),
    );
  }
}

/// Paints the silhouette and exposes each region to accessibility services as a toggle button.
class BodyMapPainter extends CustomPainter {
  BodyMapPainter({
    required this.view,
    required this.selected,
    required this.highlight,
    required this.isDark,
    this.textDirection = TextDirection.ltr,
    this.l10n,
    this.onRegionTap,
  });

  final BodyView view;
  final Set<String> selected;
  final Color highlight;
  final bool isDark;
  final TextDirection textDirection;

  /// Strings for the region semantics labels (default: [L10n.current]).
  final AppLocalizations? l10n;
  final ValueChanged<BodyRegion>? onRegionTap;

  @override
  void paint(Canvas canvas, Size size) {
    final (scale, offset) = BodyMapGeometry.fit(size);
    canvas
      ..save()
      ..translate(offset.dx, offset.dy)
      ..scale(scale);

    // floor shadow
    canvas.drawOval(
      Rect.fromCenter(center: const Offset(100, 476), width: 110, height: 10),
      Paint()
        ..color = Colors.black.withValues(alpha: isDark ? 0.5 : 0.15)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );

    final baseTop = isDark ? const Color(0xFFB4654A) : const Color(0xFFD9A48C);
    final baseBottom = isDark ? const Color(0xFF6E2E22) : const Color(0xFFB9765E);
    final outline = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = (isDark ? Colors.black : const Color(0xFF7C4A3A)).withValues(alpha: 0.55);

    // soft halo around the whole silhouette (design `outline` path)
    canvas.drawPath(
      BodyMapGeometry.outline,
      Paint()
        ..color = (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );

    // Reverse document order so the head / torso sit on top of limbs.
    for (final region in BodyMapGeometry.regionsFor(view).reversed) {
      final path = BodyMapGeometry.pathFor(region, view);
      final bounds = path.getBounds();
      final isOn = selected.contains(region.json);
      final fill = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft, // lighting of the drawing, not text direction
          end: Alignment.bottomRight,
          colors: isOn ? [highlight, Color.lerp(highlight, Colors.black, 0.35)!] : [baseTop, baseBottom],
        ).createShader(bounds);
      if (isOn) {
        canvas.drawPath(
          path,
          Paint()
            ..color = highlight.withValues(alpha: 0.55)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
        );
      }
      canvas
        ..drawPath(path, fill)
        ..drawPath(
          path,
          isOn
              ? (Paint()
                  ..style = PaintingStyle.stroke
                  ..strokeWidth = 1.6
                  ..color = Colors.white.withValues(alpha: 0.9))
              : outline,
        );
    }
    _drawDetails(canvas);
    canvas.restore();
  }

  /// Subtle anatomical lines (pectorals, abdominals / spine, shoulder blades).
  void _drawDetails(Canvas canvas) {
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = Colors.black.withValues(alpha: 0.28);
    if (view == BodyView.front) {
      canvas
        ..drawLine(const Offset(100, 100), const Offset(100, 228), p)
        ..drawArc(const Rect.fromLTWH(66, 110, 34, 40), 0.2, 2.6, false, p)
        ..drawArc(const Rect.fromLTWH(100, 110, 34, 40), 0.35, 2.6, false, p);
      for (final y in [194.0, 208.0, 222.0]) {
        canvas.drawLine(Offset(86, y), Offset(114, y), p);
      }
    } else {
      canvas
        ..drawLine(const Offset(100, 92), const Offset(100, 226), p)
        ..drawOval(const Rect.fromLTWH(70, 108, 24, 34), p)
        ..drawOval(const Rect.fromLTWH(106, 108, 24, 34), p);
    }
  }

  @override
  SemanticsBuilderCallback get semanticsBuilder => (size) {
    final (scale, offset) = BodyMapGeometry.fit(size);
    final l = l10n ?? L10n.current;
    return [
      for (final region in BodyMapGeometry.regionsFor(view))
        CustomPainterSemantics(
          rect: _scaleRect(BodyMapGeometry.pathFor(region, view).getBounds(), scale, offset),
          properties: SemanticsProperties(
            label: region.labelIn(l),
            textDirection: textDirection,
            button: true,
            selected: selected.contains(region.json),
            onTap: onRegionTap == null ? null : () => onRegionTap!(region),
          ),
        ),
    ];
  };

  static Rect _scaleRect(Rect r, double scale, Offset offset) => Rect.fromLTRB(
    r.left * scale + offset.dx,
    r.top * scale + offset.dy,
    r.right * scale + offset.dx,
    r.bottom * scale + offset.dy,
  );

  @override
  bool shouldRepaint(BodyMapPainter oldDelegate) =>
      oldDelegate.view != view ||
      oldDelegate.selected != selected ||
      oldDelegate.highlight != highlight ||
      oldDelegate.isDark != isDark;

  @override
  bool shouldRebuildSemantics(BodyMapPainter oldDelegate) =>
      oldDelegate.view != view || oldDelegate.selected != selected || oldDelegate.l10n != l10n;
}
