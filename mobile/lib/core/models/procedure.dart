import 'hospital.dart';
import 'json.dart';
import 'money.dart';
import 'refs.dart';

/// Home-country cost benchmark of a procedure (`ProcedureOut.benchmarks[]`).
class CostBenchmark {
  const CostBenchmark({
    required this.countryCode,
    required this.currency,
    required this.costMinMinor,
    required this.costMaxMinor,
    this.waitTimeText,
    this.source,
    this.sourceUrl,
    this.priceYear,
    this.confidence,
  });

  factory CostBenchmark.fromJson(JsonMap j) => CostBenchmark(
    countryCode: jStr(j, 'country_code'),
    currency: jStr(j, 'currency', 'USD'),
    costMinMinor: jInt(j, 'cost_min_minor'),
    costMaxMinor: jInt(j, 'cost_max_minor'),
    waitTimeText: jStrOrNull(j, 'wait_time_text'),
    source: jStrOrNull(j, 'source'),
    sourceUrl: jStrOrNull(j, 'source_url'),
    priceYear: jIntOrNull(j, 'price_year'),
    confidence: jStrOrNull(j, 'confidence'),
  );

  final String countryCode;
  final String currency;
  final int costMinMinor;
  final int costMaxMinor;
  final String? waitTimeText;
  final String? source;
  final String? sourceUrl;
  final int? priceYear;

  /// `high | medium | low`
  final String? confidence;

  Map<String, dynamic> toJson() => {
    'country_code': countryCode,
    'currency': currency,
    'cost_min_minor': costMinMinor,
    'cost_max_minor': costMaxMinor,
    'wait_time_text': waitTimeText,
    'source': source,
    'source_url': sourceUrl,
    'price_year': priceYear,
    'confidence': confidence,
  };
}

/// `ProcedureOut` (PLAN §8.4). List endpoints may omit detail-only fields (they default to empty).
class Procedure {
  const Procedure({
    required this.id,
    required this.slug,
    required this.name,
    this.description,
    this.specialty,
    this.hospitalStayDays,
    this.recoveryDays,
    this.totalStayDays,
    this.indiaPriceMinMinor,
    this.indiaPriceMaxMinor,
    this.currency = 'INR',
    this.benchmarks = const [],
    this.displayIndiaPriceMin,
    this.displayIndiaPriceMax,
  });

  factory Procedure.fromJson(JsonMap j) => Procedure(
    id: jStr(j, 'id'),
    slug: jStr(j, 'slug'),
    name: jStr(j, 'name'),
    description: jStrOrNull(j, 'description'),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    hospitalStayDays: jIntOrNull(j, 'hospital_stay_days'),
    recoveryDays: jIntOrNull(j, 'recovery_days'),
    totalStayDays: jIntOrNull(j, 'total_stay_days'),
    indiaPriceMinMinor: jIntOrNull(j, 'india_price_min_minor'),
    indiaPriceMaxMinor: jIntOrNull(j, 'india_price_max_minor'),
    currency: jStr(j, 'currency', 'INR'),
    benchmarks: jList(j, 'benchmarks', CostBenchmark.fromJson),
    displayIndiaPriceMin: DisplayMoney.read(j, 'display_india_price_min'),
    displayIndiaPriceMax: DisplayMoney.read(j, 'display_india_price_max'),
  );

  final String id;
  final String slug;
  final String name;
  final String? description;
  final EntityRef? specialty;
  final int? hospitalStayDays;
  final int? recoveryDays;
  final int? totalStayDays;
  final int? indiaPriceMinMinor;
  final int? indiaPriceMaxMinor;
  final String currency;
  final List<CostBenchmark> benchmarks;

  /// India price range in the viewer's currency (approximate).
  final DisplayMoney? displayIndiaPriceMin;
  final DisplayMoney? displayIndiaPriceMax;

  CostBenchmark? benchmarkFor(String countryCode) {
    for (final b in benchmarks) {
      if (b.countryCode.toUpperCase() == countryCode.toUpperCase()) return b;
    }
    return null;
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'description': description,
    'specialty': specialty?.toJson(),
    'hospital_stay_days': hospitalStayDays,
    'recovery_days': recoveryDays,
    'total_stay_days': totalStayDays,
    'india_price_min_minor': indiaPriceMinMinor,
    'india_price_max_minor': indiaPriceMaxMinor,
    'currency': currency,
    'benchmarks': benchmarks.map((b) => b.toJson()).toList(),
  };
}

/// One side of the cost comparison (`home` / `india`).
///
/// `home` carries the benchmark's provenance ([source], [sourceUrl], [priceYear], [confidence]);
/// `india` carries [earliestAdmissionDate].
class CostSide {
  const CostSide({
    required this.minMinor,
    required this.maxMinor,
    required this.currency,
    this.countryCode,
    this.waitTimeText,
    this.originalCurrency,
    this.source,
    this.sourceUrl,
    this.priceYear,
    this.confidence,
    this.waitSource,
    this.earliestAdmissionDate,
  });

  factory CostSide.fromJson(JsonMap j) => CostSide(
    countryCode: jStrOrNull(j, 'country_code'),
    minMinor: jInt(j, 'min_minor'),
    maxMinor: jInt(j, 'max_minor'),
    currency: jStr(j, 'currency', 'USD'),
    waitTimeText: jStrOrNull(j, 'wait_time_text'),
    originalCurrency: jStrOrNull(j, 'original_currency'),
    source: jStrOrNull(j, 'source'),
    sourceUrl: jStrOrNull(j, 'source_url'),
    priceYear: jIntOrNull(j, 'price_year'),
    confidence: jStrOrNull(j, 'confidence')?.toLowerCase(),
    waitSource: jStrOrNull(j, 'wait_source'),
    earliestAdmissionDate: jDay(j, 'earliest_admission_date'),
  );

  final String? countryCode;
  final int minMinor;
  final int maxMinor;
  final String currency;
  final String? waitTimeText;
  final String? originalCurrency;
  final String? source;
  final String? sourceUrl;
  final int? priceYear;

  /// `high | medium | low` (null when unknown).
  final String? confidence;
  final String? waitSource;
  final DateTime? earliestAdmissionDate;

  bool get hasSource => (source ?? '').isNotEmpty || (sourceUrl ?? '').isNotEmpty;

  Map<String, dynamic> toJson() => compactJson({
    'country_code': countryCode,
    'min_minor': minMinor,
    'max_minor': maxMinor,
    'currency': currency,
    'wait_time_text': waitTimeText,
    'original_currency': originalCurrency,
    'source': source,
    'source_url': sourceUrl,
    'price_year': priceYear,
    'confidence': confidence,
    'wait_source': waitSource,
    'earliest_admission_date': earliestAdmissionDate == null ? null : toApiDate(earliestAdmissionDate!),
  });
}

/// `savings` of the cost comparison.
class CostSavings {
  const CostSavings({
    required this.minMinor,
    required this.maxMinor,
    required this.currency,
    required this.pctMin,
    required this.pctMax,
  });

  factory CostSavings.fromJson(JsonMap j) => CostSavings(
    minMinor: jInt(j, 'min_minor'),
    maxMinor: jInt(j, 'max_minor'),
    currency: jStr(j, 'currency', 'USD'),
    pctMin: jInt(j, 'pct_min'),
    pctMax: jInt(j, 'pct_max'),
  );

  final int minMinor;
  final int maxMinor;
  final String currency;
  final int pctMin;
  final int pctMax;

  Map<String, dynamic> toJson() => {
    'min_minor': minMinor,
    'max_minor': maxMinor,
    'currency': currency,
    'pct_min': pctMin,
    'pct_max': pctMax,
  };
}

/// Whether a price comparison may be shown (legal display rule): only when the home benchmark's
/// confidence is medium or high AND India is cheaper at both ends of the range. Otherwise screens lead
/// with wait times / earliest dates and make no saving claim.
bool canShowSaving(CostSide home, CostSide india, CostSavings savings) {
  final c = home.confidence;
  if (c != 'high' && c != 'medium') return false;
  return savings.pctMin > 0 && india.minMinor < home.minMinor && india.maxMinor < home.maxMinor;
}

/// Itemized India cost line (`itemized[]`), category is a `QuoteLineCategory` value.
class CostItem {
  const CostItem({required this.category, required this.amountMinor, required this.currency});

  factory CostItem.fromJson(JsonMap j) => CostItem(
    category: jStr(j, 'category'),
    amountMinor: jInt(j, 'amount_minor'),
    currency: jStr(j, 'currency', 'USD'),
  );

  final String category;
  final int amountMinor;
  final String currency;

  Map<String, dynamic> toJson() => {'category': category, 'amount_minor': amountMinor, 'currency': currency};
}

/// How the home country was chosen (`requested_country`, `country_used`, `is_fallback`, `country_source`).
class HomeCountryInfo {
  const HomeCountryInfo({
    required this.countryUsed,
    this.requestedCountry,
    this.isFallback = false,
    this.countrySource = 'default',
  });

  factory HomeCountryInfo.fromJson(JsonMap j) => HomeCountryInfo(
    requestedCountry: jStrOrNull(j, 'requested_country'),
    countryUsed: jStr(j, 'country_used', 'US'),
    isFallback: jBool(j, 'is_fallback'),
    countrySource: jStr(j, 'country_source', 'default'),
  );

  final String? requestedCountry;

  /// Benchmark country actually shown (differs from [requestedCountry] when [isFallback]).
  final String countryUsed;
  final bool isFallback;

  /// `query | profile | account | header | accept_language | default`
  final String countrySource;
}

/// `GET /cost-comparison?procedure=&country=&currency=` (PLAN §8.4).
class CostComparison {
  const CostComparison({
    required this.procedure,
    required this.home,
    required this.india,
    required this.savings,
    this.itemized = const [],
    this.country,
  });

  factory CostComparison.fromJson(JsonMap j) => CostComparison(
    procedure: EntityRef.fromJson(jMap(j, 'procedure')),
    home: CostSide.fromJson(jMap(j, 'home')),
    india: CostSide.fromJson(jMap(j, 'india')),
    savings: CostSavings.fromJson(jMap(j, 'savings')),
    itemized: jList(j, 'itemized', CostItem.fromJson),
    country: j.containsKey('country_used') ? HomeCountryInfo.fromJson(j) : null,
  );

  final EntityRef procedure;
  final CostSide home;
  final CostSide india;
  final CostSavings savings;
  final List<CostItem> itemized;
  final HomeCountryInfo? country;

  bool get showSaving => canShowSaving(home, india, savings);

  Map<String, dynamic> toJson() => {
    'procedure': procedure.toJson(),
    'home': home.toJson(),
    'india': india.toJson(),
    'savings': savings.toJson(),
    'itemized': itemized.map((i) => i.toJson()).toList(),
  };
}

/// One card of `GET /cost-comparison/highlights`.
class CostHighlightItem {
  const CostHighlightItem({
    required this.procedure,
    required this.home,
    required this.india,
    required this.savings,
    this.specialty,
  });

  factory CostHighlightItem.fromJson(JsonMap j) => CostHighlightItem(
    procedure: EntityRef.fromJson(jMap(j, 'procedure')),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    home: CostSide.fromJson(jMap(j, 'home')),
    india: CostSide.fromJson(jMap(j, 'india')),
    savings: CostSavings.fromJson(jMap(j, 'savings')),
  );

  final EntityRef procedure;
  final EntityRef? specialty;
  final CostSide home;
  final CostSide india;
  final CostSavings savings;

  bool get showSaving => canShowSaving(home, india, savings);
}

/// `GET /cost-comparison/highlights?country=&currency=&limit=` (home screen "Your country vs India").
class CostHighlights {
  const CostHighlights({required this.country, required this.currency, this.items = const []});

  factory CostHighlights.fromJson(JsonMap j) => CostHighlights(
    country: HomeCountryInfo.fromJson(j),
    currency: jStr(j, 'currency', 'USD'),
    items: jList(j, 'items', CostHighlightItem.fromJson),
  );

  final HomeCountryInfo country;
  final String currency;
  final List<CostHighlightItem> items;
}

/// A hospital offering a procedure, with its earliest free dates (`GET /procedures/{slug}/earliest`).
class ProcedureEarliestItem {
  const ProcedureEarliestItem({
    required this.hospital,
    required this.hospitalProcedureId,
    required this.currency,
    this.priceMinMinor,
    this.priceMaxMinor,
    this.displayPriceMin,
    this.displayPriceMax,
    this.leadDoctorIds = const [],
    this.nextAvailableAdmission,
    this.nextAvailableConsultation,
  });

  factory ProcedureEarliestItem.fromJson(JsonMap j) => ProcedureEarliestItem(
    hospital: HospitalCard.fromJson(jMap(j, 'hospital')),
    hospitalProcedureId: jStr(j, 'hospital_procedure_id'),
    priceMinMinor: jIntOrNull(j, 'price_min_minor'),
    priceMaxMinor: jIntOrNull(j, 'price_max_minor'),
    currency: jStr(j, 'currency', 'INR'),
    displayPriceMin: DisplayMoney.read(j, 'display_price_min'),
    displayPriceMax: DisplayMoney.read(j, 'display_price_max'),
    leadDoctorIds: jStrList(j, 'lead_doctor_ids'),
    nextAvailableAdmission: jDay(j, 'next_available_admission'),
    nextAvailableConsultation: jDay(j, 'next_available_consultation'),
  );

  final HospitalCard hospital;
  final String hospitalProcedureId;
  final int? priceMinMinor;
  final int? priceMaxMinor;
  final String currency;
  final DisplayMoney? displayPriceMin;
  final DisplayMoney? displayPriceMax;
  final List<String> leadDoctorIds;
  final DateTime? nextAvailableAdmission;
  final DateTime? nextAvailableConsultation;
}

/// `GET /procedures/{slug}/earliest`: hospitals ordered by the earliest free admission day (then price).
class ProcedureEarliest {
  const ProcedureEarliest({required this.procedure, this.items = const []});

  factory ProcedureEarliest.fromJson(JsonMap j) => ProcedureEarliest(
    procedure: EntityRef.fromJson(jMap(j, 'procedure')),
    items: jList(j, 'items', ProcedureEarliestItem.fromJson),
  );

  final EntityRef procedure;
  final List<ProcedureEarliestItem> items;
}
