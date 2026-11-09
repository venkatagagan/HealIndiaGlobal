import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/core/theme/app_theme.dart';
import 'package:heal_india_global/features/matches/providers/match_view.dart';
import 'package:heal_india_global/features/matches/screens/compare_screen.dart';
import 'package:heal_india_global/features/matches/screens/matches_screen.dart';

import '../screening/screening_fakes.dart';

ScreeningMatch _match(
  String id, {
  required int rank,
  required double score,
  required int cost,
  required String doctor,
  double rating = 4.5,
  int experience = 10,
  List<String> accreditations = const ['nabh'],
  List<String> languages = const ['English'],
}) => ScreeningMatch(
  id: id,
  rank: rank,
  matchScore: score,
  reasons: const ['Speaks English'],
  estimatedCostMinor: cost,
  currency: 'USD',
  procedure: const EntityRef(id: 'p1', slug: 'cabg', name: 'Coronary Bypass'),
  hospital: HospitalCard(
    id: 'h-$id',
    slug: 'hospital-$id',
    name: 'Hospital $id',
    city: 'New Delhi',
    accreditations: accreditations,
  ),
  doctor: DoctorCard(
    id: 'd-$id',
    slug: 'doctor-$id',
    fullName: doctor,
    hospital: HospitalRef(id: 'h-$id', name: 'Hospital $id'),
    specialty: cardiology,
    qualifications: const ['MBBS', 'MD'],
    experienceYears: experience,
    successRatePct: 98,
    ratingAvg: rating,
    ratingCount: 230,
    languages: languages,
  ),
  savings: const MatchSavings(
    homeCountry: 'US',
    homeMinMinor: 1500000,
    homeMaxMinor: 3000000,
    homeCurrency: 'USD',
    pctMin: 50,
    pctMax: 70,
  ),
);

final _matches = [
  _match('a', rank: 1, score: 95, cost: 1250000, doctor: 'Dr. Arjun Sharma', accreditations: ['jci', 'nabh']),
  _match('b', rank: 2, score: 90, cost: 900000, doctor: 'Dr. Meera Iyer', rating: 4.9, languages: ['Arabic']),
  _match('c', rank: 3, score: 82, cost: 1100000, doctor: 'Dr. Ravi Kumar', experience: 25),
];

const _completed = Screening(
  id: 's1',
  status: ScreeningStatus.completed,
  specialty: cardiology,
  homeCountry: 'US',
  urgency: Urgency.soon,
  aiResult: TriageResult(
    summary: 'Your symptoms suggest a cardiology review.',
    urgency: Urgency.soon,
    engine: TriageEngine.claude,
  ),
);

List<RouteBase> _routes() => [
  GoRoute(path: '/screening/:id/matches', builder: (_, s) => MatchesScreen(screeningId: s.pathParameters['id']!)),
  GoRoute(
    path: '/compare',
    builder: (_, s) => CompareScreen(
      screeningId: s.uri.queryParameters['screening'],
      matchIds: (s.uri.queryParameters['matches'] ?? '').split(',').where((e) => e.isNotEmpty).toList(),
    ),
  ),
];

void main() {
  setUpAll(() => AppTextStyles.useGoogleFonts = false);

  group('applyMatchView', () {
    test('sorts by score, cost, rating and experience', () {
      List<String> ids(MatchSort s) => applyMatchView(_matches, s, const MatchFilters()).map((m) => m.id).toList();
      expect(ids(MatchSort.bestMatch), ['a', 'b', 'c']);
      expect(ids(MatchSort.lowestCost), ['b', 'c', 'a']);
      expect(ids(MatchSort.highestRating), ['b', 'a', 'c']);
      expect(ids(MatchSort.mostExperience), ['c', 'a', 'b']);
    });

    test('filters by accreditation and language', () {
      expect(applyMatchView(_matches, MatchSort.bestMatch, const MatchFilters(jciOnly: true)).single.id, 'a');
      expect(
        applyMatchView(_matches, MatchSort.bestMatch, const MatchFilters(languages: {'arabic'})).single.id,
        'b',
      );
      expect(const MatchFilters(jciOnly: true, languages: {'x'}).count, 2);
    });

    test('labels', () {
      expect(countryName('us'), 'USA');
      expect(costCategoryLabel('tests_scans'), 'Tests & Scans');
      expect(costCategoryLabel('hospital_stay'), 'Hospital');
    });
  });

  testWidgets('renders AI summary and match cards; compare bar tracks up to 3 selections', (tester) async {
    final repo = FakeScreeningRepository(initial: _completed, matchList: _matches);
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _routes(), initialLocation: '/screening/s1/matches');
    await tester.pumpAndSettle();

    expect(find.text('Your Top Matches'), findsOneWidget);
    expect(find.text('Your symptoms suggest a cardiology review.'), findsOneWidget);
    expect(find.text('See a doctor soon'), findsOneWidget);
    expect(find.text('Dr. Arjun Sharma'), findsOneWidget);
    expect(find.text('95% Match'), findsOneWidget);
    expect(find.text('98% Success'), findsWidgets);
    expect(find.text(r'$12,500'), findsOneWidget);
    expect(find.text('0/3 Selected for Comparison'), findsOneWidget);

    Future<void> tapCompare(String id) async {
      final button = find.descendant(of: find.byKey(ValueKey('match-$id')), matching: find.text('Compare'));
      await tester.scrollUntilVisible(button, 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pump();
    }

    await tapCompare('a');
    expect(find.text('1/3 Selected for Comparison'), findsOneWidget);
    expect(find.text('Added'), findsOneWidget);

    await tapCompare('b');
    expect(find.text('2/3 Selected for Comparison'), findsOneWidget);

    // Compare button in the bottom bar opens the side-by-side screen.
    await tester.tap(find.widgetWithText(FilledButton, 'Compare'));
    await tester.pumpAndSettle();
    expect(find.text('Compare Matches'), findsOneWidget);
    expect(find.text('Dr. Arjun Sharma'), findsOneWidget);
    expect(find.text('Dr. Meera Iyer'), findsOneWidget);
    expect(find.text('Lowest'), findsOneWidget);
  });

  testWidgets('empty results offer to run matching again', (tester) async {
    final repo = FakeScreeningRepository(initial: _completed);
    final overrides = await featureOverrides(screenings: repo);
    await pumpRouterApp(tester, overrides: overrides, routes: _routes(), initialLocation: '/screening/s1/matches');
    await tester.pumpAndSettle();
    expect(find.text('No matches yet'), findsOneWidget);
    expect(find.text('Run matching again'), findsOneWidget);
  });
}
