// Hospital slot maintenance: doctor and hospital-level availability (GET/PUT /hospital-portal/.../availability).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/core/utils/dates.dart';
import 'package:heal_india_global/features/hospital_portal/hospital_routes.dart';
import 'package:heal_india_global/features/hospital_portal/screens/hospital_availability_screen.dart';

import '../agent_portal/portal_test_helpers.dart';

void main() {
  setUp(() => AppTextStyles.useGoogleFonts = false);

  final now = DateTime.now();
  final month = DateTime(now.year, now.month + 1);
  final day10 = DateTime(month.year, month.month, 10);
  final key10 = '${Dates.api(day10)}|consultation';

  testWidgets('doctor availability: shows booked, blocks capacity below booked, saves edits and quick fill', (
    tester,
  ) async {
    final adapter = RoutedAdapter({
      'GET /hospital-portal/doctors/d-1/availability': (_) => [
        {'date': Dates.api(day10), 'slot_kind': 'consultation', 'capacity': 5, 'booked': 2, 'available': 3},
      ],
      'PUT /hospital-portal/doctors/d-1/availability': (r) => <Object?>[],
    });
    await pumpPortal(
      tester,
      routes: [
        GoRoute(
          path: '/hospital',
          builder: (_, _) => HospitalAvailabilityScreen(doctorId: 'd-1', doctorName: 'Dr. Rao', initialMonth: month),
        ),
      ],
      initialLocation: '/hospital',
      user: hospitalUser,
      adapter: adapter,
    );

    expect(find.text('Availability: Dr. Rao'), findsOneWidget);
    final field = find.byKey(ValueKey('cap-$key10'));
    await tester.ensureVisible(field);
    expect(tester.widget<TextField>(field).controller!.text, '5');
    expect(find.text('2 booked'), findsOneWidget);

    await tester.enterText(field, '1');
    await tester.pump();
    expect(find.text('At least 2'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('availability-save')));
    await tester.pumpAndSettle();
    expect(find.text('Fix the highlighted days before saving.'), findsOneWidget);
    expect(adapter.last('PUT', '/hospital-portal/doctors/d-1/availability'), isNull);

    await tester.enterText(field, '6');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('availability-save')));
    await tester.pumpAndSettle();
    final put = adapter.last('PUT', '/hospital-portal/doctors/d-1/availability');
    expect(put!.body, [
      {'date': Dates.api(day10), 'slot_kind': 'consultation', 'capacity': 6},
    ]);
    expect(find.text('Availability saved'), findsOneWidget);

    // Quick fill: weekdays only by default.
    ScaffoldMessenger.of(tester.element(find.byKey(const ValueKey('availability-save')))).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('bulk-apply')),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('bulk-apply')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('availability-save')));
    await tester.pumpAndSettle();
    final filled = (adapter.last('PUT', '/hospital-portal/doctors/d-1/availability')!.body! as List).cast<Map<String, dynamic>>();
    final last = DateTime(month.year, month.month + 1, 0).day;
    final weekdays = [
      for (var d = 1; d <= last; d++) DateTime(month.year, month.month, d),
    ].where((d) => d.weekday != DateTime.saturday && d.weekday != DateTime.sunday).length;
    // Day 10's consultation capacity was 5 on the (fake) server, so it is re-sent as 8 too.
    expect(filled.where((s) => s['slot_kind'] == 'admission').length, weekdays);
    expect(filled.where((s) => s['slot_kind'] == 'consultation').length, weekdays);
    expect(filled.every((s) => DateTime.parse(s['date'] as String).weekday <= DateTime.friday), isTrue);
  });

  testWidgets('hospital-level availability opens from More and loads /hospital-portal/availability', (tester) async {
    final adapter = RoutedAdapter({
      'GET /hospital-portal/availability': (_) => <Object?>[],
      'GET /hospital-portal/doctors': (_) => [
        {
          'id': 'd-1',
          'full_name': 'Dr. Rao',
          'slug': 'dr-rao',
          'hospital': {'id': 'h-1', 'name': 'Apollo Chennai'},
        },
      ],
    });
    await pumpPortal(
      tester,
      routes: hospitalPortalRoutes(),
      initialLocation: HospitalRoutes.availability,
      user: hospitalUser,
      adapter: adapter,
    );
    expect(find.text('Hospital availability'), findsOneWidget);
    expect(adapter.last('GET', '/hospital-portal/availability'), isNotNull);

    final router = GoRouter.of(tester.element(find.text('Hospital availability')));
    router.go(HospitalRoutes.doctors);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('doctor-availability-d-1')));
    await tester.pumpAndSettle();
    expect(find.text('Availability: Dr. Rao'), findsOneWidget);
  });
}
