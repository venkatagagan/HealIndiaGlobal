import '../../../core/models/models.dart';

/// Max matches selectable for side-by-side comparison.
const int kMaxCompare = 3;

/// Sort orders of the matches list.
enum MatchSort {
  bestMatch('Best match'),
  lowestCost('Lowest cost'),
  highestRating('Highest rating'),
  mostExperience('Most experience');

  const MatchSort(this.label);

  final String label;
}

/// Client-side filters of the matches list.
class MatchFilters {
  const MatchFilters({
    this.jciOnly = false,
    this.teleconsultOnly = false,
    this.languages = const <String>{},
    this.cities = const <String>{},
  });

  final bool jciOnly;
  final bool teleconsultOnly;

  /// Lowercase language names; a match passes when its doctor or hospital speaks any of them.
  final Set<String> languages;
  final Set<String> cities;

  bool get isEmpty => !jciOnly && !teleconsultOnly && languages.isEmpty && cities.isEmpty;

  int get count => (jciOnly ? 1 : 0) + (teleconsultOnly ? 1 : 0) + languages.length + cities.length;

  MatchFilters copyWith({bool? jciOnly, bool? teleconsultOnly, Set<String>? languages, Set<String>? cities}) =>
      MatchFilters(
        jciOnly: jciOnly ?? this.jciOnly,
        teleconsultOnly: teleconsultOnly ?? this.teleconsultOnly,
        languages: languages ?? this.languages,
        cities: cities ?? this.cities,
      );

  bool accepts(ScreeningMatch m) {
    if (jciOnly && !m.hospital.isJci) return false;
    if (teleconsultOnly && !(m.doctor?.teleconsultAvailable ?? false)) return false;
    if (languages.isNotEmpty) {
      final spoken = {...?m.doctor?.languages, ...m.hospital.languages}.map((l) => l.toLowerCase()).toSet();
      if (!languages.any(spoken.contains)) return false;
    }
    if (cities.isNotEmpty && !cities.contains((m.hospital.city ?? '').toLowerCase())) return false;
    return true;
  }
}

/// Filters then sorts [matches] (stable; ties fall back to rank).
List<ScreeningMatch> applyMatchView(List<ScreeningMatch> matches, MatchSort sort, MatchFilters filters) {
  final out = matches.where(filters.accepts).toList();
  int byRank(ScreeningMatch a, ScreeningMatch b) => a.rank.compareTo(b.rank);
  double rating(ScreeningMatch m) => m.doctor?.ratingAvg ?? m.hospital.ratingAvg ?? 0;
  out.sort(
    (a, b) => switch (sort) {
      MatchSort.bestMatch =>
        b.matchScore.compareTo(a.matchScore) != 0 ? b.matchScore.compareTo(a.matchScore) : byRank(a, b),
      MatchSort.lowestCost =>
        a.estimatedCostMinor.compareTo(b.estimatedCostMinor) != 0
            ? a.estimatedCostMinor.compareTo(b.estimatedCostMinor)
            : byRank(a, b),
      MatchSort.highestRating => rating(b).compareTo(rating(a)) != 0 ? rating(b).compareTo(rating(a)) : byRank(a, b),
      MatchSort.mostExperience =>
        (b.doctor?.experienceYears ?? 0).compareTo(a.doctor?.experienceYears ?? 0) != 0
            ? (b.doctor?.experienceYears ?? 0).compareTo(a.doctor?.experienceYears ?? 0)
            : byRank(a, b),
    },
  );
  return out;
}

/// Display name of an ISO-3166 alpha-2 code ("US" -> "USA").
String countryName(String? code) {
  final c = (code ?? '').toUpperCase();
  return const {
        'US': 'USA',
        'GB': 'UK',
        'CA': 'Canada',
        'AU': 'Australia',
        'NZ': 'New Zealand',
        'AE': 'UAE',
        'SA': 'Saudi Arabia',
        'OM': 'Oman',
        'QA': 'Qatar',
        'KW': 'Kuwait',
        'BH': 'Bahrain',
        'IQ': 'Iraq',
        'NG': 'Nigeria',
        'KE': 'Kenya',
        'TZ': 'Tanzania',
        'ET': 'Ethiopia',
        'BD': 'Bangladesh',
        'NP': 'Nepal',
        'LK': 'Sri Lanka',
        'AF': 'Afghanistan',
        'UZ': 'Uzbekistan',
        'DE': 'Germany',
        'FR': 'France',
        'ES': 'Spain',
        'IT': 'Italy',
        'RU': 'Russia',
        'IN': 'India',
      }[c] ??
      (c.isEmpty ? 'your country' : c);
}

/// Human label of a `QuoteLineCategory` / itemized cost category.
String costCategoryLabel(String category) => switch (category) {
  'surgery' => 'Surgery',
  'hospital_stay' || 'hospital' => 'Hospital',
  'medications' => 'Medications',
  'tests_scans' => 'Tests & Scans',
  'doctor_fees' => 'Doctor Fees',
  'implants' => 'Implants',
  _ => 'Other',
};

/// Short description of what a cost category typically covers.
String costCategoryHint(String category) => switch (category) {
  'surgery' => 'Surgeon and anaesthesia fees, operating theatre and consumables.',
  'hospital_stay' || 'hospital' => 'Room, nursing care, meals and ICU if required.',
  'medications' => 'Medicines during your stay and on discharge.',
  'tests_scans' => 'Pre-operative tests, imaging and lab work.',
  'doctor_fees' => 'Consultations and follow-up visits.',
  'implants' => 'Implants, stents or prosthetics where needed.',
  _ => 'Other charges included in the estimate.',
};
