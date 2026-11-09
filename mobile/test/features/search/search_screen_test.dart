import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/features/search/screens/doctor_detail_screen.dart';
import 'package:heal_india_global/features/search/screens/hospital_detail_screen.dart';
import 'package:heal_india_global/features/search/screens/search_screen.dart';

import '../onboarding/fl_harness.dart';

HospitalCard _hospital(String id, String name, {List<String> acc = const ['jci']}) => HospitalCard.fromJson({
  'id': id,
  'slug': id,
  'name': name,
  'city': 'New Delhi',
  'state': 'Delhi',
  'accreditations': acc,
  'rating_avg': 4.6,
  'rating_count': 120,
  'international_desk': true,
  'starting_price_minor': 41500000, // INR 4,15,000
  'currency': 'INR',
});

final _doctor = DoctorCard.fromJson({
  'id': 'd1',
  'slug': 'dr-arjun-sharma',
  'full_name': 'Dr. Arjun Sharma',
  'specialty': {'id': 's1', 'slug': 'cardiology', 'name': 'Cardiologist'},
  'experience_years': 15,
  'languages': ['English', 'Hindi'],
  'success_rate_pct': 98,
  'rating_avg': 4.8,
  'rating_count': 230,
  'hospital': {'id': 'h1', 'slug': 'h1', 'name': 'Apollo Hospitals', 'city': 'New Delhi', 'accreditations': ['jci']},
});

void main() {
  testWidgets('lists hospitals, converts prices, filters by query and switches tabs', (tester) async {
    final repo = FakeCatalogRepository(
      hospitalItems: [_hospital('h1', 'Apollo Hospitals'), _hospital('h2', 'Fortis Memorial', acc: ['nabh'])],
      doctorItems: [_doctor],
      procedureItems: [
        Procedure.fromJson({
          'id': 'p1',
          'slug': 'knee-replacement',
          'name': 'Knee Replacement',
          'specialty': {'id': 's2', 'slug': 'orthopedics', 'name': 'Orthopedics'},
          'hospital_stay_days': 5,
          'india_price_min_minor': 50000000,
          'india_price_max_minor': 70000000,
          'currency': 'INR',
          'benchmarks': [],
        }),
      ],
    );
    await pumpScreen(
      tester,
      path: '/search',
      screen: (s) => SearchScreen(initialQuery: s.uri.queryParameters['q']),
      auth: AuthState.fromUser(guestUser),
      overrides: [
        catalogRepositoryProvider.overrideWithValue(repo),
        specialtiesProvider.overrideWith((ref) async => const []),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Apollo Hospitals'), findsOneWidget);
    expect(find.text('Fortis Memorial'), findsOneWidget);
    expect(find.text('JCI'), findsOneWidget);
    // INR 415,000 at 83 INR/USD ≈ $5,000 in the guest's default currency.
    expect(find.text(r'From ≈ $5,000'), findsNWidgets(2));

    await tester.enterText(find.byType(TextField), 'fortis');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();
    expect(find.text('Apollo Hospitals'), findsNothing);
    expect(find.text('Fortis Memorial'), findsOneWidget);
    expect(repo.hospitalQueries.last['q'], 'fortis');

    await tester.tap(find.text('Doctors'));
    await tester.pumpAndSettle();
    expect(find.text('Dr. Arjun Sharma'), findsOneWidget);
    expect(find.text('98% Success'), findsOneWidget);

    await tester.tap(find.text('Procedures'));
    await tester.pumpAndSettle();
    expect(find.text('Knee Replacement'), findsOneWidget);
  });

  testWidgets('saving as a guest invites the user to create an account', (tester) async {
    final repo = FakeCatalogRepository(hospitalItems: [_hospital('h1', 'Apollo Hospitals')]);
    await pumpScreen(
      tester,
      path: '/search',
      screen: (_) => const SearchScreen(),
      auth: AuthState.fromUser(guestUser),
      overrides: [
        catalogRepositoryProvider.overrideWithValue(repo),
        specialtiesProvider.overrideWith((ref) async => const []),
      ],
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Save'));
    await tester.pump();
    expect(find.text('Create a free account to save hospitals and doctors.'), findsOneWidget);
  });

  testWidgets('doctor detail shows profile, saved state and actions', (tester) async {
    final detail = DoctorDetail.fromJson({
      ..._doctor.toJson(),
      'bio': 'Interventional cardiologist with 4,000+ procedures.',
      'qualifications': ['MBBS', 'MD', 'DM Cardiology'],
      'next_available_date': '2026-11-02',
      'procedures': [],
    });
    await pumpScreen(
      tester,
      path: '/doctors/:id',
      initialLocation: '/doctors/d1',
      screen: (s) => DoctorDetailScreen(doctorId: s.pathParameters['id']!),
      auth: AuthState.fromUser(patientUser),
      overrides: [
        catalogRepositoryProvider.overrideWithValue(FakeCatalogRepository()),
        doctorDetailProvider.overrideWith((ref, id) async => detail),
        savedItemsProvider.overrideWith(
          (ref) async => [const SavedItem(entityType: SavedEntityType.doctor, entityId: 'd1')],
        ),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Dr. Arjun Sharma'), findsOneWidget);
    expect(find.text('DM Cardiology'), findsOneWidget);
    expect(find.byTooltip('Remove from saved'), findsOneWidget);
    expect(find.text('Get matched'), findsOneWidget);
    expect(find.text('Request quote'), findsOneWidget);

    await tester.tap(find.text('Get matched'));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/screening/new?specialty=cardiology')), findsOneWidget);
  });

  testWidgets('request quote as a guest goes to registration', (tester) async {
    final detail = DoctorDetail.fromJson({..._doctor.toJson(), 'procedures': []});
    await pumpScreen(
      tester,
      path: '/doctors/:id',
      initialLocation: '/doctors/d1',
      screen: (s) => DoctorDetailScreen(doctorId: s.pathParameters['id']!),
      auth: AuthState.fromUser(guestUser),
      overrides: [
        catalogRepositoryProvider.overrideWithValue(FakeCatalogRepository()),
        doctorDetailProvider.overrideWith((ref, id) async => detail),
      ],
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Request quote'));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/auth/register?from=%2Fdoctors%2Fd1')), findsOneWidget);
  });

  testWidgets('hospital detail renders overview, treatments with packages, doctors and contact', (tester) async {
    final detail = HospitalDetail.fromJson({
      ..._hospital('h1', 'Apollo Hospitals').toJson(),
      'description': 'A 710-bed JCI accredited quaternary care hospital.',
      'established_year': 1996,
      'bed_count': 710,
      'airport_distance_km': 14.5,
      'languages': ['English', 'Arabic'],
      'specialties': ['Cardiology', 'Orthopedics'],
      'phone': '+91 11 7179 1090',
      'address': 'Sarita Vihar, Delhi Mathura Road',
      'doctors': [_doctor.toJson()],
      'procedures': [
        {
          'id': 'hp1',
          'hospital_id': 'h1',
          'procedure': {'id': 'p1', 'slug': 'cabg', 'name': 'Coronary Bypass (CABG)'},
          'price_min_minor': 41500000,
          'price_max_minor': 58100000,
          'currency': 'INR',
          'hospital_stay_days': 7,
          'success_rate_pct': 98.5,
          'inclusions': ['Surgeon fees', 'ICU stay'],
          'exclusions': [],
          'packages': [
            {
              'id': 'pk1',
              'name': 'Cardiac care',
              'tier': 'all_inclusive',
              'price_minor': 66400000,
              'currency': 'INR',
              'includes': {'accommodation_nights': 10, 'airport_pickup': true},
            },
          ],
        },
      ],
      'reviews': [
        {'id': 'r1', 'rating': 5, 'title': 'Excellent care', 'body': 'Smooth from visa to discharge.'},
      ],
    });
    await pumpScreen(
      tester,
      path: '/hospitals/:id',
      initialLocation: '/hospitals/h1',
      screen: (s) => HospitalDetailScreen(hospitalId: s.pathParameters['id']!),
      auth: AuthState.fromUser(patientUser),
      overrides: [
        catalogRepositoryProvider.overrideWithValue(FakeCatalogRepository()),
        hospitalDetailProvider.overrideWith((ref, id) async => detail),
        savedItemsProvider.overrideWith((ref) async => const []),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Apollo Hospitals'), findsWidgets);
    expect(find.text('1996'), findsOneWidget);
    expect(find.text('15 km'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Coronary Bypass (CABG)'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('99% Success'), findsOneWidget);
    expect(find.textContaining('All-inclusive · Cardiac care'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Excellent care'), 300, scrollable: find.byType(Scrollable).first);
    await tester.scrollUntilVisible(find.text('Sarita Vihar, Delhi Mathura Road'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Request quote'), findsOneWidget);
  });
}
