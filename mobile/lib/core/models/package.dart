import 'enums.dart';
import 'json.dart';
import 'refs.dart';

/// `includes{}` of a treatment package.
class PackageIncludes {
  const PackageIncludes({
    this.accommodationNights = 0,
    this.airportPickup = false,
    this.translator = false,
    this.meals = false,
    this.localTransport = false,
    this.followupTeleconsults = 0,
  });

  factory PackageIncludes.fromJson(JsonMap j) => PackageIncludes(
    accommodationNights: jInt(j, 'accommodation_nights'),
    airportPickup: jBool(j, 'airport_pickup'),
    translator: jBool(j, 'translator'),
    meals: jBool(j, 'meals'),
    localTransport: jBool(j, 'local_transport'),
    followupTeleconsults: jInt(j, 'followup_teleconsults'),
  );

  final int accommodationNights;
  final bool airportPickup;
  final bool translator;
  final bool meals;
  final bool localTransport;
  final int followupTeleconsults;

  /// Human readable bullet list.
  List<String> get bullets => [
    if (accommodationNights > 0) '$accommodationNights nights accommodation',
    if (airportPickup) 'Airport pickup',
    if (translator) 'Translator',
    if (meals) 'Meals',
    if (localTransport) 'Local transport',
    if (followupTeleconsults > 0) '$followupTeleconsults follow-up teleconsults',
  ];

  Map<String, dynamic> toJson() => {
    'accommodation_nights': accommodationNights,
    'airport_pickup': airportPickup,
    'translator': translator,
    'meals': meals,
    'local_transport': localTransport,
    'followup_teleconsults': followupTeleconsults,
  };
}

/// `PackageOut` (PLAN §8.4).
class TreatmentPackage {
  const TreatmentPackage({
    required this.id,
    required this.name,
    required this.tier,
    required this.priceMinor,
    required this.currency,
    this.originalPriceMinor,
    this.description,
    this.includes = const PackageIncludes(),
  });

  factory TreatmentPackage.fromJson(JsonMap j) => TreatmentPackage(
    id: jStr(j, 'id'),
    name: jStr(j, 'name'),
    tier: PackageTier.fromJson(j['tier']),
    priceMinor: jInt(j, 'price_minor'),
    originalPriceMinor: jIntOrNull(j, 'original_price_minor'),
    currency: jStr(j, 'currency', 'INR'),
    description: jStrOrNull(j, 'description'),
    includes: PackageIncludes.fromJson(jMap(j, 'includes')),
  );

  final String id;
  final String name;
  final PackageTier tier;
  final int priceMinor;
  final int? originalPriceMinor;
  final String currency;
  final String? description;
  final PackageIncludes includes;

  /// Discount versus [originalPriceMinor] ("Save $500"), or 0.
  int get savingsMinor {
    final o = originalPriceMinor;
    return o != null && o > priceMinor ? o - priceMinor : 0;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'tier': tier.json,
    'price_minor': priceMinor,
    'original_price_minor': originalPriceMinor,
    'currency': currency,
    'description': description,
    'includes': includes.toJson(),
  };
}

/// `HospitalProcedureOut` (PLAN §8.4).
class HospitalProcedure {
  const HospitalProcedure({
    required this.id,
    required this.hospitalId,
    required this.procedure,
    required this.priceMinMinor,
    required this.priceMaxMinor,
    required this.currency,
    this.hospitalStayDays,
    this.successRatePct,
    this.inclusions = const [],
    this.exclusions = const [],
    this.packages = const [],
  });

  factory HospitalProcedure.fromJson(JsonMap j) => HospitalProcedure(
    id: jStr(j, 'id'),
    hospitalId: jStr(j, 'hospital_id'),
    procedure: EntityRef.fromJson(jMap(j, 'procedure')),
    priceMinMinor: jInt(j, 'price_min_minor'),
    priceMaxMinor: jInt(j, 'price_max_minor'),
    currency: jStr(j, 'currency', 'INR'),
    hospitalStayDays: jIntOrNull(j, 'hospital_stay_days'),
    successRatePct: jDoubleOrNull(j, 'success_rate_pct'),
    inclusions: jStrList(j, 'inclusions'),
    exclusions: jStrList(j, 'exclusions'),
    packages: jList(j, 'packages', TreatmentPackage.fromJson),
  );

  final String id;
  final String hospitalId;
  final EntityRef procedure;
  final int priceMinMinor;
  final int priceMaxMinor;
  final String currency;
  final int? hospitalStayDays;
  final double? successRatePct;
  final List<String> inclusions;
  final List<String> exclusions;
  final List<TreatmentPackage> packages;

  Map<String, dynamic> toJson() => {
    'id': id,
    'hospital_id': hospitalId,
    'procedure': procedure.toJson(),
    'price_min_minor': priceMinMinor,
    'price_max_minor': priceMaxMinor,
    'currency': currency,
    'hospital_stay_days': hospitalStayDays,
    'success_rate_pct': successRatePct,
    'inclusions': inclusions,
    'exclusions': exclusions,
    'packages': packages.map((p) => p.toJson()).toList(),
  };
}
