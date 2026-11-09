import '../../../core/models/models.dart';
import '../../../l10n/l10n.dart';

/// Max matches selectable for side-by-side comparison.
const int kMaxCompare = 3;

/// Sort orders of the matches list (client-side only; [name] is the stable identifier).
enum MatchSort {
  bestMatch,
  lowestCost,
  highestRating,
  mostExperience;

  /// Label in the app's language.
  String localizedLabel(AppLocalizations l) => switch (this) {
    MatchSort.bestMatch => l.matchSortBestMatch,
    MatchSort.lowestCost => l.matchSortLowestCost,
    MatchSort.highestRating => l.matchSortHighestRating,
    MatchSort.mostExperience => l.matchSortMostExperience,
  };

  /// Label in the app's current language (code without a BuildContext).
  String get label => localizedLabel(L10n.current);
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

/// Display name of an ISO-3166 alpha-2 code ("US" -> "USA") in the app's language ([l10n] defaults to
/// [L10n.current]). Unknown codes are shown as-is.
String countryName(String? code, [AppLocalizations? l10n]) {
  final l = l10n ?? L10n.current;
  final c = (code ?? '').toUpperCase();
  return switch (c) {
    'US' => l.costCountryUs,
    'GB' => l.costCountryGb,
    'CA' => l.costCountryCa,
    'AU' => l.costCountryAu,
    'NZ' => l.costCountryNz,
    'AE' => l.costCountryAe,
    'SA' => l.costCountrySa,
    'OM' => l.costCountryOm,
    'QA' => l.costCountryQa,
    'KW' => l.costCountryKw,
    'BH' => l.costCountryBh,
    'IQ' => l.costCountryIq,
    'NG' => l.costCountryNg,
    'KE' => l.costCountryKe,
    'TZ' => l.costCountryTz,
    'ET' => l.costCountryEt,
    'BD' => l.costCountryBd,
    'NP' => l.costCountryNp,
    'LK' => l.costCountryLk,
    'AF' => l.costCountryAf,
    'UZ' => l.costCountryUz,
    'DE' => l.costCountryDe,
    'FR' => l.costCountryFr,
    'ES' => l.costCountryEs,
    'IT' => l.costCountryIt,
    'RU' => l.costCountryRu,
    'IN' => l.costCountryIn,
    '' => l.costCountryYours,
    _ => c,
  };
}

/// Human label of a `QuoteLineCategory` / itemized cost category ([l10n] defaults to [L10n.current]).
String costCategoryLabel(String category, [AppLocalizations? l10n]) {
  final l = l10n ?? L10n.current;
  return switch (category) {
    'surgery' => l.costCategorySurgery,
    'hospital_stay' || 'hospital' => l.costCategoryHospital,
    'medications' => l.costCategoryMedications,
    'tests_scans' => l.costCategoryTestsScans,
    'doctor_fees' => l.costCategoryDoctorFees,
    'implants' => l.costCategoryImplants,
    _ => l.costCategoryOther,
  };
}

/// Short description of what a cost category typically covers ([l10n] defaults to [L10n.current]).
String costCategoryHint(String category, [AppLocalizations? l10n]) {
  final l = l10n ?? L10n.current;
  return switch (category) {
    'surgery' => l.costCategorySurgeryHint,
    'hospital_stay' || 'hospital' => l.costCategoryHospitalHint,
    'medications' => l.costCategoryMedicationsHint,
    'tests_scans' => l.costCategoryTestsScansHint,
    'doctor_fees' => l.costCategoryDoctorFeesHint,
    'implants' => l.costCategoryImplantsHint,
    _ => l.costCategoryOtherHint,
  };
}
