import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/screening/widgets/body_map.dart';
import 'package:heal_india_global/features/screening/widgets/body_map_data.dart';

class _Host extends StatefulWidget {
  const _Host({required this.log});

  final List<Set<String>> log;

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  Set<String> _selected = {};

  @override
  Widget build(BuildContext context) => BodyMap(
    selected: _selected,
    onChanged: (s) {
      widget.log.add(s);
      setState(() => _selected = s);
    },
  );
}

Future<void> _tapRegion(WidgetTester tester, BodyRegion region, BodyView view) async {
  final canvas = find.byKey(BodyMap.canvasKey);
  final size = tester.getSize(canvas);
  await tester.tapAt(tester.getTopLeft(canvas) + BodyMapGeometry.localAnchor(region, view, size));
  await tester.pump();
}

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  group('BodyMapGeometry', () {
    test('every region anchor hits its own region in both views', () {
      const size = Size(320, 340);
      for (final view in BodyView.values) {
        for (final region in BodyMapGeometry.regionsFor(view)) {
          final hit = BodyMapGeometry.hitTest(BodyMapGeometry.localAnchor(region, view, size), view, size);
          expect(hit, region, reason: '$region in $view');
        }
      }
    });

    test('front view mirrors left/right, back view does not', () {
      const size = Size(200, 440);
      final frontLeft = BodyMapGeometry.localAnchor(BodyRegion.leftArm, BodyView.front, size);
      final backLeft = BodyMapGeometry.localAnchor(BodyRegion.leftArm, BodyView.back, size);
      expect(frontLeft.dx, greaterThan(100));
      expect(backLeft.dx, lessThan(100));
    });

    test('back view exposes "back" instead of chest/abdomen', () {
      expect(BodyMapGeometry.regionsFor(BodyView.back), contains(BodyRegion.back));
      expect(BodyMapGeometry.regionsFor(BodyView.back), isNot(contains(BodyRegion.chest)));
      expect(BodyMapGeometry.regionsFor(BodyView.front), isNot(contains(BodyRegion.back)));
    });

    test('tapping outside the silhouette selects nothing', () {
      expect(BodyMapGeometry.hitTest(const Offset(2, 2), BodyView.front, const Size(200, 440)), isNull);
    });

    test('region ids and paths match the design asset (assets/body_map/body-regions.json)', () {
      final json = jsonDecode(File('assets/body_map/body-regions.json').readAsStringSync()) as Map<String, dynamic>;
      for (final (key, shapes) in [('front', kBodyFrontRegions), ('back', kBodyBackRegions)]) {
        final design = [for (final r in json[key] as List<dynamic>) r as Map<String, dynamic>];
        expect([for (final s in shapes) s.id], [for (final r in design) r['id']]);
        expect([for (final s in shapes) s.d], [for (final r in design) r['d']]);
      }
      expect(kBodyOutlinePath, json['outline']);
    });

    test('vocabulary is the PLAN / catalog body-area list', () {
      expect(BodyRegion.values.map((r) => r.json), [
        'head', 'neck', 'chest', 'abdomen', 'pelvis', 'back', //
        'left_arm', 'right_arm', 'left_leg', 'right_leg', 'skin', 'general',
      ]);
    });

    test('wire values and labels', () {
      expect(BodyRegion.leftArm.json, 'left_arm');
      expect(BodyRegion.labelOf('right_leg'), 'Right leg');
      expect(BodyRegion.labelOf('skin'), 'Skin');
    });
  });

  testWidgets('tapping regions toggles selection and the back view selects "back"', (tester) async {
    final log = <Set<String>>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(body: SingleChildScrollView(child: _Host(log: log))),
      ),
    );

    await _tapRegion(tester, BodyRegion.chest, BodyView.front);
    expect(log.last, {'chest'});

    await _tapRegion(tester, BodyRegion.leftLeg, BodyView.front);
    expect(log.last, {'chest', 'left_leg'});

    // tap again -> deselect
    await _tapRegion(tester, BodyRegion.chest, BodyView.front);
    expect(log.last, {'left_leg'});

    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    await _tapRegion(tester, BodyRegion.back, BodyView.back);
    expect(log.last, {'left_leg', 'back'});

    await tester.tap(find.byKey(const ValueKey('body-area-skin')));
    await tester.pump();
    expect(log.last, {'left_leg', 'back', 'skin'});
  });

  testWidgets('regions are exposed to accessibility services', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: const Scaffold(body: SingleChildScrollView(child: _Host(log: []))),
      ),
    );
    await tester.pump();
    expect(find.semantics.byLabel('Chest'), findsOne);
    expect(find.semantics.byLabel('Left arm'), findsOne);
    handle.dispose();
  });
}
