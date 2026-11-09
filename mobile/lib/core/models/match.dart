import 'doctor.dart';
import 'hospital.dart';
import 'json.dart';
import 'package.dart';
import 'refs.dart';

/// `savings` of a match: home-country cost vs India.
class MatchSavings {
  const MatchSavings({
    required this.homeCountry,
    required this.homeMinMinor,
    required this.homeMaxMinor,
    required this.homeCurrency,
    required this.pctMin,
    required this.pctMax,
  });

  factory MatchSavings.fromJson(JsonMap j) => MatchSavings(
    homeCountry: jStr(j, 'home_country'),
    homeMinMinor: jInt(j, 'home_min_minor'),
    homeMaxMinor: jInt(j, 'home_max_minor'),
    homeCurrency: jStr(j, 'home_currency', 'USD'),
    pctMin: jInt(j, 'pct_min'),
    pctMax: jInt(j, 'pct_max'),
  );

  final String homeCountry;
  final int homeMinMinor;
  final int homeMaxMinor;
  final String homeCurrency;
  final int pctMin;
  final int pctMax;

  Map<String, dynamic> toJson() => {
    'home_country': homeCountry,
    'home_min_minor': homeMinMinor,
    'home_max_minor': homeMaxMinor,
    'home_currency': homeCurrency,
    'pct_min': pctMin,
    'pct_max': pctMax,
  };
}

/// `MatchOut` (PLAN §8.6).
class ScreeningMatch {
  const ScreeningMatch({
    required this.id,
    required this.rank,
    required this.matchScore,
    required this.hospital,
    required this.estimatedCostMinor,
    required this.currency,
    this.reasons = const [],
    this.doctor,
    this.procedure,
    this.package,
    this.savings,
  });

  factory ScreeningMatch.fromJson(JsonMap j) => ScreeningMatch(
    id: jStr(j, 'id'),
    rank: jInt(j, 'rank'),
    matchScore: jDouble(j, 'match_score'),
    reasons: jStrList(j, 'reasons'),
    doctor: jObj(j, 'doctor', DoctorCard.fromJson),
    hospital: HospitalCard.fromJson(jMap(j, 'hospital')),
    procedure: jObj(j, 'procedure', EntityRef.fromJson),
    package: jObj(j, 'package', TreatmentPackage.fromJson),
    estimatedCostMinor: jInt(j, 'estimated_cost_minor'),
    currency: jStr(j, 'currency', 'USD'),
    savings: jObj(j, 'savings', MatchSavings.fromJson),
  );

  final String id;
  final int rank;

  /// 0-100
  final double matchScore;
  final List<String> reasons;
  final DoctorCard? doctor;
  final HospitalCard hospital;
  final EntityRef? procedure;
  final TreatmentPackage? package;
  final int estimatedCostMinor;
  final String currency;
  final MatchSavings? savings;

  /// `95% Match`
  String get matchLabel => '${matchScore.round()}% Match';

  Map<String, dynamic> toJson() => {
    'id': id,
    'rank': rank,
    'match_score': matchScore,
    'reasons': reasons,
    'doctor': doctor?.toJson(),
    'hospital': hospital.toJson(),
    'procedure': procedure?.toJson(),
    'package': package?.toJson(),
    'estimated_cost_minor': estimatedCostMinor,
    'currency': currency,
    'savings': savings?.toJson(),
  };
}
