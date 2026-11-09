import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/auth/auth_controller.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/repositories/catalog_repository.dart';
import 'package:heal_india_global/core/repositories/patient_repository.dart';
import 'package:heal_india_global/features/home/screens/home_screen.dart';
import 'package:heal_india_global/features/home/widgets/specialty_tile.dart';

import '../onboarding/fl_harness.dart';

const _specialties = [
  Specialty(id: '1', slug: 'cardiology', name: 'Cardiology', description: 'Heart Procedures', icon: 'heart', savingsMinPct: 60, savingsMaxPct: 80),
  Specialty(id: '2', slug: 'orthopedics', name: 'Orthopedics', description: 'Joint Replacement', icon: 'bone', savingsMinPct: 50, savingsMaxPct: 70),
  Specialty(id: '3', slug: 'cosmetic', name: 'Cosmetic', description: 'Cosmetic Surgery', icon: 'sparkles', savingsMinPct: 40, savingsMaxPct: 60),
  Specialty(id: '4', slug: 'dental', name: 'Dental', description: 'Dental Care', icon: 'tooth', savingsMinPct: 30, savingsMaxPct: 50),
  Specialty(id: '5', slug: 'oncology', name: 'Oncology', description: 'Cancer Treatment', icon: 'ribbon', savingsMinPct: 20, savingsMaxPct: 40),
  Specialty(id: '6', slug: 'neurology', name: 'Neurology', description: 'Brain and spine', icon: 'brain', savingsMinPct: 15, savingsMaxPct: 30),
  Specialty(id: '7', slug: 'ophthalmology', name: 'Ophthalmology', description: 'Eye care', icon: 'eye', savingsMinPct: 10, savingsMaxPct: 25),
];

void main() {
  testWidgets('shows 5 specialties + More with combined savings; tapping starts a screening', (tester) async {
    await pumpScreen(
      tester,
      path: '/home',
      screen: (_) => const HomeScreen(),
      auth: AuthState.fromUser(guestUser),
      overrides: [
        specialtiesProvider.overrideWith((ref) async => _specialties),
        patientDashboardProvider.overrideWith((ref) async => const PatientDashboard()),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('What brings you to India?'), findsOneWidget);
    expect(find.text('Search for a condition'), findsOneWidget);
    expect(find.text('Cardiology'), findsOneWidget);
    expect(find.text('Save 60-80%'), findsOneWidget);
    expect(find.text('Oncology'), findsOneWidget);
    expect(find.text('Neurology'), findsNothing); // behind "More"
    expect(find.text('More'), findsOneWidget);
    expect(find.text('Save 10-30%'), findsOneWidget); // neurology + ophthalmology

    await tester.tap(find.text('Orthopedics'));
    await tester.pumpAndSettle();
    expect(find.text(routeLabel('/screening/new?specialty=orthopedics')), findsOneWidget);
  });

  testWidgets('More opens all specialties', (tester) async {
    await pumpScreen(
      tester,
      path: '/home',
      screen: (_) => const HomeScreen(),
      auth: AuthState.fromUser(guestUser),
      overrides: [
        specialtiesProvider.overrideWith((ref) async => _specialties),
        patientDashboardProvider.overrideWith((ref) async => const PatientDashboard()),
      ],
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('All specialties'), findsOneWidget);
    expect(find.text('Ophthalmology'), findsOneWidget);
  });

  testWidgets('signed-in patient sees the upcoming trip banner', (tester) async {
    final booking = Booking.fromJson({
      'id': 'b1',
      'booking_number': 'HIG-B-2026-000001',
      'case_id': 'c1',
      'status': 'confirmed',
      'hospital': {'id': 'h1', 'name': 'Apollo Hospitals', 'city': 'Chennai'},
      'procedure': {'id': 'p1', 'name': 'Knee Replacement'},
      'payment_option': 'deposit',
      'currency': 'INR',
      'admission_date': '2026-11-12',
    });
    await pumpScreen(
      tester,
      path: '/home',
      screen: (_) => const HomeScreen(),
      auth: AuthState.fromUser(patientUser),
      overrides: [
        specialtiesProvider.overrideWith((ref) async => _specialties.take(3).toList()),
        patientDashboardProvider.overrideWith(
          (ref) async => PatientDashboard(nextBooking: booking, daysUntilTreatment: 23),
        ),
        patientProfileProvider.overrideWith((ref) async => const PatientProfile(id: 'pp1', preferredCurrency: 'EUR')),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Your upcoming trip'), findsOneWidget);
    expect(find.text('Knee Replacement · Apollo Hospitals'), findsOneWidget);
    expect(find.textContaining('In 23 days'), findsOneWidget);
    expect(find.text('More'), findsNothing); // only 3 specialties
  });

  test('combined savings label', () {
    expect(combinedSavingsLabel(_specialties.skip(5)), 'Save 10-30%');
    expect(combinedSavingsLabel(const []), isNull);
  });
}
