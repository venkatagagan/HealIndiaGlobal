import 'json.dart';
import 'refs.dart';

/// Home-country cost benchmark of a procedure (`ProcedureOut.benchmarks[]`).
class CostBenchmark {
  const CostBenchmark({
    required this.countryCode,
    required this.currency,
    required this.costMinMinor,
    required this.costMaxMinor,
    this.waitTimeText,
  });

  factory CostBenchmark.fromJson(JsonMap j) => CostBenchmark(
    countryCode: jStr(j, 'country_code'),
    currency: jStr(j, 'currency', 'USD'),
    costMinMinor: jInt(j, 'cost_min_minor'),
    costMaxMinor: jInt(j, 'cost_max_minor'),
    waitTimeText: jStrOrNull(j, 'wait_time_text'),
  );

  final String countryCode;
  final String currency;
  final int costMinMinor;
  final int costMaxMinor;
  final String? waitTimeText;

  Map<String, dynamic> toJson() => {
    'country_code': countryCode,
    'currency': currency,
    'cost_min_minor': costMinMinor,
    'cost_max_minor': costMaxMinor,
    'wait_time_text': waitTimeText,
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
class CostSide {
  const CostSide({
    required this.minMinor,
    required this.maxMinor,
    required this.currency,
    this.countryCode,
    this.waitTimeText,
  });

  factory CostSide.fromJson(JsonMap j) => CostSide(
    countryCode: jStrOrNull(j, 'country_code'),
    minMinor: jInt(j, 'min_minor'),
    maxMinor: jInt(j, 'max_minor'),
    currency: jStr(j, 'currency', 'USD'),
    waitTimeText: jStrOrNull(j, 'wait_time_text'),
  );

  final String? countryCode;
  final int minMinor;
  final int maxMinor;
  final String currency;
  final String? waitTimeText;

  Map<String, dynamic> toJson() => compactJson({
    'country_code': countryCode,
    'min_minor': minMinor,
    'max_minor': maxMinor,
    'currency': currency,
    'wait_time_text': waitTimeText,
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

/// `GET /cost-comparison?procedure=&country=&currency=` (PLAN §8.4).
class CostComparison {
  const CostComparison({
    required this.procedure,
    required this.home,
    required this.india,
    required this.savings,
    this.itemized = const [],
  });

  factory CostComparison.fromJson(JsonMap j) => CostComparison(
    procedure: EntityRef.fromJson(jMap(j, 'procedure')),
    home: CostSide.fromJson(jMap(j, 'home')),
    india: CostSide.fromJson(jMap(j, 'india')),
    savings: CostSavings.fromJson(jMap(j, 'savings')),
    itemized: jList(j, 'itemized', CostItem.fromJson),
  );

  final EntityRef procedure;
  final CostSide home;
  final CostSide india;
  final CostSavings savings;
  final List<CostItem> itemized;

  Map<String, dynamic> toJson() => {
    'procedure': procedure.toJson(),
    'home': home.toJson(),
    'india': india.toJson(),
    'savings': savings.toJson(),
    'itemized': itemized.map((i) => i.toJson()).toList(),
  };
}
